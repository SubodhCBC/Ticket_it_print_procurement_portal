import { getConfig } from '../config'
import { ErrorCode } from '../utils/errors'
import type { ManifestOperation } from './manifest.types'
import { ROUTE_MANIFEST } from './route-manifest.generated'
import {
  acceptsUndefined,
  objectShape,
  toJsonSchema,
  type JsonSchema,
} from './zod-to-json-schema'

/**
 * The OpenAPI 3.1 document behind `/api/docs`.
 *
 * Assembled from the generated route manifest on first request and then kept:
 * the manifest and the schemas it imports are fixed for the life of the process,
 * so there is nothing to rebuild per request.
 *
 * What it can describe and what it cannot is decided by where the information
 * lives. Request bodies and query strings are zod schemas, which exist at
 * runtime and are converted in full. Permissions are read from each route's
 * `route()` options. Response bodies are TypeScript view types, erased by the
 * compiler, so the document states each success status and every error the
 * route can produce, but not the success payload's fields.
 */

type OpenApiDocument = Record<string, unknown>

const SECURITY_SCHEME = 'bearerAuth'

let cached: OpenApiDocument | undefined

export function buildOpenApiDocument(): OpenApiDocument {
  cached ??= assemble(ROUTE_MANIFEST)
  return cached
}

function assemble(manifest: readonly ManifestOperation[]): OpenApiDocument {
  const { app, auth } = getConfig()

  const paths: Record<string, Record<string, unknown>> = {}
  for (const operation of manifest) {
    ;(paths[operation.path] ??= {})[operation.method] = toOperation(operation)
  }

  return {
    openapi: '3.1.0',
    info: {
      title: 'Print Procurement Portal API',
      // The commit, when the deploy stamped one. Locally GIT_SHA is unset and
      // reads "unknown", which says nothing worth printing.
      version:
        app.release === 'unknown'
          ? `v${app.apiVersion}`
          : `v${app.apiVersion} (${app.release})`,
      description: introduction(auth.accessTtl),
    },
    // No `servers`: every path is already absolute, and leaving the list out
    // makes Swagger UI send requests to whichever host served the page — the
    // right answer locally, on staging and behind any proxy alike.
    tags: [...new Set(manifest.map((operation) => operation.tag))]
      .sort()
      .map((name) => ({ name })),
    security: [{ [SECURITY_SCHEME]: [] }],
    paths,
    components: components(),
  }
}

function introduction(accessTtl: string): string {
  return [
    'Generated from the route handlers under `src/app/api`. After adding or ' +
      'changing a route, run `node scripts/generate-openapi-manifest.mjs`.',
    '**Signing in.** Run `POST /api/v1/auth/login` with *Try it out*. The ' +
      '`accessToken` it returns is applied to every other request on this page ' +
      'automatically. To use a token from somewhere else, paste it into ' +
      `**Authorize**. Access tokens last ${accessTtl}; ` +
      '`POST /api/v1/auth/refresh` exchanges the refresh token for a new pair.',
    '**Errors** share one envelope. `error.code` is stable and safe to branch ' +
      'on, `error.message` is safe to show a user, and `meta.requestId` matches ' +
      'the `X-Request-Id` header and the server logs.',
    '**Response bodies are not described.** Requests are generated from the zod ' +
      'schemas that validate them. Responses are shaped by TypeScript types, ' +
      'which leave nothing at runtime to read — try the call to see one.',
  ].join('\n\n')
}

// --- Operations -------------------------------------------------------------

function toOperation(operation: ManifestOperation): Record<string, unknown> {
  const parameters = [
    ...pathParameters(operation.path),
    ...queryParameters(operation),
  ]

  return {
    tags: [operation.tag],
    operationId: operationId(operation),
    ...(operation.summary ? { summary: operation.summary } : {}),
    description: describe(operation),
    ...(parameters.length > 0 ? { parameters } : {}),
    ...(operation.body.length > 0
      ? { requestBody: requestBody(operation) }
      : {}),
    responses: responses(operation),
    // Public routes opt out of the document-wide bearer requirement.
    ...(operation.auth === 'public' ? { security: [] } : {}),
    ...(operation.permissions.length > 0
      ? { 'x-permissions': operation.permissions }
      : {}),
    ...(operation.conditionalPermissions?.length
      ? { 'x-conditional-permissions': operation.conditionalPermissions }
      : {}),
  }
}

function describe(operation: ManifestOperation): string {
  const parts: string[] = []
  if (operation.description) parts.push(operation.description)

  if (operation.auth === 'public') {
    parts.push('**Public** — no access token needed.')
  } else if (operation.permissions.length > 0) {
    parts.push(
      `**Requires permission:** ${operation.permissions.map((p) => `\`${p}\``).join(', ')}`
    )
  } else {
    parts.push('**Requires** a signed-in user; no particular permission.')
  }
  if (operation.roles.length > 0) {
    parts.push(
      `**Requires role:** ${operation.roles.map((r) => `\`${r}\``).join(' or ')}`
    )
  }
  if (operation.conditionalPermissions?.length) {
    // Checked inside the service, for some requests only, so they cannot be
    // read from `route()`. Listed so a 403 is not a surprise.
    parts.push(
      '**Also checked, depending on the request:**\n' +
        operation.conditionalPermissions
          .map((entry) => `- \`${entry.permission}\` — ${entry.when}`)
          .join('\n')
    )
  }

  parts.push(`Source: \`${operation.source}\``)
  return parts.join('\n\n')
}

/** `get` + `/api/v1/users/{userId}` -> `getApiV1UsersUserId`. */
function operationId(operation: ManifestOperation): string {
  return (
    operation.method +
    operation.path
      .split(/[^A-Za-z0-9]+/)
      .filter(Boolean)
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join('')
  )
}

function pathParameters(path: string): Record<string, unknown>[] {
  return [...path.matchAll(/\{(\w+)\}/g)].map((match) => ({
    name: match[1],
    in: 'path',
    required: true,
    schema: { type: 'string' },
  }))
}

function queryParameters(
  operation: ManifestOperation
): Record<string, unknown>[] {
  const parameters = new Map<string, Record<string, unknown>>()

  for (const schema of operation.query) {
    const shape = objectShape(schema)
    if (!shape) continue

    for (const [name, field] of Object.entries(shape)) {
      const { description, ...fieldSchema } = toJsonSchema(field)
      parameters.set(name, {
        name,
        in: 'query',
        required: !acceptsUndefined(field),
        schema: fieldSchema,
        ...(typeof description === 'string' ? { description } : {}),
      })
    }
  }

  for (const name of operation.extraQuery) {
    if (parameters.has(name)) continue
    parameters.set(name, {
      name,
      in: 'query',
      required: false,
      schema: { type: 'string' },
      description: 'Read by the handler directly rather than through a schema.',
    })
  }

  return [...parameters.values()]
}

function requestBody(operation: ManifestOperation): Record<string, unknown> {
  const schemas = operation.body.map(toJsonSchema)
  const schema = schemas.length === 1 ? schemas[0] : { anyOf: schemas }

  if (operation.consumes === 'multipart/form-data') return multipartBody(schema)

  return {
    // `parseJsonBody` hands an empty body to the schema as `undefined`, so the
    // body is optional exactly when every schema accepts that.
    required: operation.body.some((schema) => !acceptsUndefined(schema)),
    content: {
      'application/json': {
        schema: schemas.length === 1 ? schemas[0] : { anyOf: schemas },
      },
    },
  }
}

/**
 * An upload: the schema's own properties are the text parts, and the files are
 * added alongside them.
 *
 * `parseMultipartBody` takes the files from every file part whatever it is
 * named, so the document names the property `files` and says as much rather than
 * claiming a field name the handler does not actually require. Always required:
 * a multipart request with no parts at all is never what the caller meant.
 */
function multipartBody(schema: unknown): Record<string, unknown> {
  const properties = isRecord(schema) ? schema.properties : undefined
  const fields = isRecord(properties) ? properties : {}

  return {
    required: true,
    content: {
      'multipart/form-data': {
        schema: {
          type: 'object',
          properties: {
            ...fields,
            files: {
              type: 'array',
              items: { type: 'string', format: 'binary' },
              description:
                'The files, as file parts. The part name is not significant — ' +
                'every file part in the request is taken.',
            },
          },
          required: ['files'],
        },
      },
    },
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

const SUCCESS_TEXT: Readonly<Record<number, string>> = {
  200: 'OK',
  201: 'Created',
  202: 'Accepted — the work continues in the background',
  204: 'No content',
}

function responses(operation: ManifestOperation): Record<string, unknown> {
  const out: Record<string, unknown> = {}

  for (const status of operation.successStatuses) {
    out[String(status)] = successResponse(operation, status)
  }

  if (operation.body.length > 0 || operation.query.length > 0) {
    out['400'] = responseRef('ValidationFailed')
  }
  if (operation.auth === 'bearer') {
    out['401'] = responseRef('Unauthenticated')
    out['403'] = responseRef('Forbidden')
  }
  if (/\{\w+\}/.test(operation.path)) out['404'] = responseRef('NotFound')
  if (operation.auth === 'bearer' && operation.method !== 'get') {
    out['422'] = responseRef('BusinessRuleViolation')
    // Any write runs in a transaction that can time out or lose a deadlock.
    out['503'] = responseRef('Unavailable')
  }
  if (operation.rateLimited) out['429'] = responseRef('RateLimited')

  // The errors a handler documents itself replace the generic entry for that
  // status: they say what actually goes wrong on this route.
  const documented = new Map<number, string[]>()
  for (const error of operation.errors ?? []) {
    const lines = documented.get(error.status) ?? []
    lines.push(`\`${error.code}\` — ${error.description}`)
    documented.set(error.status, lines)
  }
  for (const [status, lines] of documented) {
    out[String(status)] = errorResponse(lines.join('\n\n'))
  }

  return Object.fromEntries(
    Object.entries(out).sort(([a], [b]) => Number(a) - Number(b))
  )
}

function errorResponse(description: string): Record<string, unknown> {
  return {
    description,
    content: {
      'application/json': {
        schema: { $ref: '#/components/schemas/ErrorEnvelope' },
      },
    },
  }
}

function successResponse(
  operation: ManifestOperation,
  status: number
): Record<string, unknown> {
  const description = SUCCESS_TEXT[status] ?? 'Success'

  if (status === 204) return { description }

  if (operation.produces) {
    return {
      description: `${description} — a \`${operation.produces}\` file`,
      content: {
        [operation.produces]: { schema: { type: 'string', format: 'binary' } },
      },
    }
  }

  return {
    description,
    content: { 'application/json': { schema: {} } },
  }
}

function responseRef(name: string): Record<string, string> {
  return { $ref: `#/components/responses/${name}` }
}

// --- Shared components ------------------------------------------------------

function components(): Record<string, unknown> {
  const errorEnvelope: JsonSchema = {
    type: 'object',
    required: ['error', 'meta'],
    properties: {
      error: {
        type: 'object',
        required: ['code', 'message'],
        properties: {
          code: { type: 'string', enum: Object.values(ErrorCode) },
          message: { type: 'string' },
          details: { type: 'object', additionalProperties: true },
        },
      },
      meta: {
        type: 'object',
        required: ['requestId', 'timestamp', 'path'],
        properties: {
          requestId: { type: 'string' },
          timestamp: { type: 'string', format: 'date-time' },
          path: { type: 'string' },
        },
      },
    },
  }

  const error = (description: string) => ({
    description,
    content: {
      'application/json': {
        schema: { $ref: '#/components/schemas/ErrorEnvelope' },
      },
    },
  })

  return {
    securitySchemes: {
      [SECURITY_SCHEME]: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description:
          'The `accessToken` from `POST /api/v1/auth/login` or `/auth/refresh`. ' +
          'Paste the token alone, without the word Bearer.',
      },
    },
    schemas: { ErrorEnvelope: errorEnvelope },
    responses: {
      ValidationFailed: error(
        '`VALIDATION_FAILED` — the body or query string failed validation. ' +
          '`error.details.issues` lists each field with its message.'
      ),
      Unauthenticated: error(
        '`UNAUTHENTICATED`, `TOKEN_EXPIRED` or `TOKEN_REVOKED` — no usable access token.'
      ),
      Forbidden: error(
        '`FORBIDDEN` — a required permission is missing ' +
          '(`error.details.missingPermissions`) — or `TENANT_MISMATCH`, when the ' +
          'resource belongs to another account.'
      ),
      NotFound: error(
        '`NOT_FOUND` — nothing with that id is visible to the caller.'
      ),
      BusinessRuleViolation: error(
        '`BUSINESS_RULE_VIOLATION` — well-formed, but refused by a business rule; ' +
          'the message says which.'
      ),
      RateLimited: error(
        '`RATE_LIMITED` — too many attempts from this client. Wait and retry.'
      ),
      Unavailable: error(
        '`TRANSACTION_ABORTED` — the database transaction ran out of time or lost ' +
          'a deadlock and was rolled back. Nothing was saved; `error.details.retryable` ' +
          'is true and a `Retry-After` header is sent, so the same request is safe ' +
          'to repeat. — or `DEPENDENCY_UNAVAILABLE` — a service this route needs ' +
          '(object storage, NZ Post, Redis) is down or not configured.'
      ),
    },
  }
}
