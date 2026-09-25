/**
 * Generates `src/server/openapi/route-manifest.generated.ts` — the list of every
 * operation the API serves, which `/api/docs` turns into an OpenAPI document.
 *
 *   node scripts/generate-openapi-manifest.mjs            # rewrite the manifest
 *   node scripts/generate-openapi-manifest.mjs --check    # exit 1 when it is stale
 *
 * Run it after adding, removing or changing a route.
 *
 * ---------------------------------------------------------------------------
 * Why a generated file rather than annotations
 * ---------------------------------------------------------------------------
 * The NestJS API this was ported from got its Swagger document for free from
 * controller decorators. A Next route file has nowhere to put that metadata — it
 * may only export the HTTP methods and a handful of segment options, and the
 * build rejects anything else — so the metadata is read out of the route files
 * instead, and written somewhere the server can import it at runtime (the source
 * tree does not exist inside a built image).
 *
 * The manifest imports the zod schemas themselves rather than copying them, so a
 * change to a schema reaches the documentation without regenerating. Only the
 * shape of the route table — which files, methods, schemas and permissions — is
 * captured here.
 *
 * ---------------------------------------------------------------------------
 * What it reads
 * ---------------------------------------------------------------------------
 * Deliberately narrow, because it is pattern matching and not a TypeScript
 * parser. Every route in this codebase follows one shape, and anything that
 * departs from it fails the run with a message rather than being skipped:
 *
 *   export const POST = route({ permissions: [Permission.X] }, async (...) => {
 *     const body = await parseJsonBody(request, SomeImportedSchema)
 *     const query = parseQuery(request, OtherImportedSchema)
 *     return ok(view, { status: 201, requestId })
 *   })
 *
 * An upload says so by calling `parseMultipartBody` instead of `parseJsonBody`:
 * its schema describes the text parts, and the operation is recorded as
 * consuming `multipart/form-data` so the document shows a file picker.
 *
 * plus the JSDoc above each export for the summary and description,
 * `searchParams.get('x')` for query keys read outside a schema, `noContent()` for
 * 204, and `new Response(...)` for file downloads.
 *
 * Response bodies are not captured: they are shaped by TypeScript view types,
 * which leave nothing behind at runtime to describe.
 */
import { readdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const SRC = path.join(ROOT, 'src')
const APP = path.join(SRC, 'app')
const OUTPUT = path.join(
  SRC,
  'server',
  'openapi',
  'route-manifest.generated.ts'
)

const SCAN_DIRS = [path.join(APP, 'api'), path.join(APP, 'health')]
/** The documentation routes themselves; describing them in the document is noise. */
const SKIP_DIRS = new Set([path.join(APP, 'api', 'docs')])

const METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE']
const WRAPPERS = { route: 'bearer', publicRoute: 'public' }

const check = process.argv.includes('--check')

// --- Run --------------------------------------------------------------------

const files = (await Promise.all(SCAN_DIRS.map(findRouteFiles))).flat().sort()

const operations = []
const problems = []
for (const file of files) {
  try {
    operations.push(...parseRouteFile(file, await readFile(file, 'utf8')))
  } catch (error) {
    problems.push(`${toPosix(path.relative(ROOT, file))}: ${error.message}`)
  }
}

if (problems.length > 0) {
  console.error(
    'Cannot generate the OpenAPI manifest:\n' +
      problems.map((problem) => `  - ${problem}`).join('\n')
  )
  process.exit(1)
}

operations.sort(
  (a, b) =>
    a.path.localeCompare(b.path) ||
    METHODS.indexOf(a.method.toUpperCase()) -
      METHODS.indexOf(b.method.toUpperCase())
)

const generated = await format(render(operations))
const existing = await readFile(OUTPUT, 'utf8').catch(() => '')
const upToDate = normaliseEol(existing) === normaliseEol(generated)
const outputName = toPosix(path.relative(ROOT, OUTPUT))

if (check) {
  if (upToDate) {
    console.log(
      `OpenAPI manifest is up to date (${operations.length} operations).`
    )
    process.exit(0)
  }
  console.error(
    `${outputName} is stale — a route was added, removed or changed since it ` +
      'was generated.\nRun: node scripts/generate-openapi-manifest.mjs'
  )
  process.exit(1)
}

if (upToDate) {
  console.log(
    `${outputName} unchanged (${operations.length} operations from ${files.length} route files).`
  )
} else {
  await writeFile(OUTPUT, generated)
  console.log(
    `Wrote ${outputName}: ${operations.length} operations from ${files.length} route files.`
  )
}

// --- Discovery --------------------------------------------------------------

async function findRouteFiles(dir) {
  if (SKIP_DIRS.has(dir)) return []

  let entries
  try {
    entries = await readdir(dir, { withFileTypes: true })
  } catch {
    return []
  }

  const found = []
  for (const entry of entries) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) found.push(...(await findRouteFiles(full)))
    else if (entry.name === 'route.ts') found.push(full)
  }
  return found
}

// --- Parsing ----------------------------------------------------------------

function parseRouteFile(file, source) {
  const segments = path.relative(APP, path.dirname(file)).split(path.sep)
  const apiPath = '/' + segments.map(toPathSegment).join('/')
  const imports = parseImports(source, path.dirname(file))

  const plainFunction = source.match(
    /export\s+(?:async\s+)?function\s+(GET|POST|PUT|PATCH|DELETE)\b/
  )
  if (plainFunction) {
    throw new Error(
      `${plainFunction[1]} is a plain function. Wrap it in route() or ` +
        'publicRoute() — it needs a request context anyway — and it will be documented.'
    )
  }

  const exports = [
    ...source.matchAll(
      /export\s+const\s+(GET|POST|PUT|PATCH|DELETE)\s*=\s*(\w+)/g
    ),
  ]
  if (exports.length === 0) {
    throw new Error('no GET, POST, PUT, PATCH or DELETE export was found')
  }

  // Helpers declared above the first handler — `requestedAccount(request)` and
  // the like — are shared by every handler in the file.
  const prelude = stripComments(source.slice(0, exports[0].index))
  const sharedQueryKeys = searchParamKeys(prelude)

  return exports.map((match, i) => {
    const [, method, wrapper] = match
    const auth = WRAPPERS[wrapper]
    if (!auth) {
      throw new Error(
        `${method} is built with ${wrapper}(), which this generator does not ` +
          'recognise. Teach WRAPPERS about it.'
      )
    }

    const end = i + 1 < exports.length ? exports[i + 1].index : source.length
    const segment = stripComments(source.slice(match.index, end))
    const doc = parseDoc(precedingDoc(source, match.index))
    const options = auth === 'bearer' ? routeOptions(segment, method) : ''
    const multipart = schemaReferences(segment, 'parseMultipartBody', imports)

    return {
      method: method.toLowerCase(),
      path: apiPath,
      tag: tagFor(segments),
      auth,
      summary: doc.summary,
      description: doc.description,
      errors: doc.errors ?? [],
      conditionalPermissions: doc.conditionalPermissions ?? [],
      permissions: namespaceMembers(options, 'Permission'),
      roles: namespaceMembers(options, 'Role'),
      body: [
        ...schemaReferences(segment, 'parseJsonBody', imports),
        ...multipart,
      ],
      ...(multipart.length > 0 ? { consumes: 'multipart/form-data' } : {}),
      query: schemaReferences(segment, 'parseQuery', imports),
      extraQuery: [
        ...new Set([...searchParamKeys(segment), ...sharedQueryKeys]),
      ].sort(),
      ...responseShape(segment, apiPath),
      rateLimited: /\benforceRateLimit\(/.test(segment),
      source: toPosix(path.relative(ROOT, file)),
    }
  })
}

/** `[userId]` -> `{userId}`; catch-alls collapse to a single parameter too. */
function toPathSegment(segment) {
  const dynamic = segment.match(/^\[{1,2}(?:\.\.\.)?(\w+)\]{1,2}$/)
  return dynamic ? `{${dynamic[1]}}` : segment
}

/** `api/v1/users/...` -> `users`; `health/live` -> `health`. */
function tagFor(segments) {
  if (segments[0] === 'api') {
    return (segments[1] === 'v1' ? segments[2] : segments[1]) ?? 'api'
  }
  return segments[0] ?? 'default'
}

/**
 * Local name -> where it came from, for every named import.
 *
 * Relative specifiers are rewritten onto the `@/` alias, because the manifest
 * lives in a different directory from the route that imported them.
 */
function parseImports(source, fromDir) {
  const map = new Map()

  for (const match of source.matchAll(
    /import\s+(?:type\s+)?\{([^}]*)\}\s*from\s*['"]([^'"]+)['"]/g
  )) {
    const specifier = toAliasSpecifier(match[2], fromDir)
    for (const part of match[1].split(',')) {
      const cleaned = part.replace(/^\s*type\s+/, '').trim()
      if (!cleaned) continue
      const [exported, local] = cleaned.split(/\s+as\s+/)
      map.set((local ?? exported).trim(), {
        specifier,
        exported: exported.trim(),
      })
    }
  }

  return map
}

function toAliasSpecifier(specifier, fromDir) {
  if (!specifier.startsWith('.')) return specifier
  const absolute = path.resolve(fromDir, specifier)
  const relative = path.relative(SRC, absolute)
  if (relative.startsWith('..')) return specifier
  return '@/' + toPosix(relative).replace(/\.tsx?$/, '')
}

/**
 * The `{ ... }` options passed to `route()`.
 *
 * Refuses options passed by reference: the generator would silently document
 * the route as needing no permission, which is the one mistake documentation
 * about access control must not make.
 */
function routeOptions(segment, method) {
  const call = segment.match(
    /^export\s+const\s+\w+\s*=\s*route\s*(?:<[^>]*>)?\s*\(\s*(\S)/
  )
  if (!call) return ''
  if (call[1] !== '{') {
    throw new Error(
      `${method} passes route() its options by reference. Write them inline ` +
        'so the required permissions can be documented.'
    )
  }

  const inline = segment.match(
    /^export\s+const\s+\w+\s*=\s*route\s*(?:<[^>]*>)?\s*\(\s*\{([^}]*)\}/
  )
  return inline ? inline[1] : ''
}

function namespaceMembers(text, namespace) {
  const pattern = new RegExp(`\\b${namespace}\\.(\\w+)`, 'g')
  return [...new Set([...text.matchAll(pattern)].map((match) => match[1]))]
}

/**
 * The schemas handed to `parseJsonBody` or `parseQuery`.
 *
 * Every call must pass a schema imported by name. A call given anything else —
 * an inline `z.object(...)`, a `.extend()` expression, a locally declared const
 * — fails the run, because the manifest can only import what a module exports.
 */
function schemaReferences(segment, helper, imports) {
  const calls = segment.match(new RegExp(`\\b${helper}\\(`, 'g')) ?? []
  const references = []

  for (const match of segment.matchAll(
    new RegExp(
      `\\b${helper}\\(\\s*\\w+\\s*,\\s*([A-Za-z_$][\\w$]*)\\s*\\)`,
      'g'
    )
  )) {
    const imported = imports.get(match[1])
    if (!imported) {
      throw new Error(
        `${helper}() is given ${match[1]}, which is not imported. Move the ` +
          'schema into a .validation.ts module and import it.'
      )
    }
    references.push(imported)
  }

  if (references.length !== calls.length) {
    throw new Error(
      `${helper}() is called with something other than an imported schema name.`
    )
  }

  const unique = new Map(
    references.map((ref) => [`${ref.specifier}#${ref.exported}`, ref])
  )
  return [...unique.values()]
}

function searchParamKeys(code) {
  return [...code.matchAll(/searchParams\.get\(\s*['"]([^'"]+)['"]\s*\)/g)].map(
    (match) => match[1]
  )
}

function responseShape(segment, apiPath) {
  if (/\bnew\s+(?:Next)?Response\s*\(/.test(segment)) {
    const literal = segment.match(/['"]Content-Type['"]\s*:\s*['"]([^'";]+)/i)
    return {
      successStatuses: [200],
      produces: literal ? literal[1].trim() : inferMediaType(apiPath),
    }
  }

  const statuses = new Set()
  const explicit = [...segment.matchAll(/\bstatus\s*:\s*(\d{3})\b/g)].map(
    (match) => Number(match[1])
  )
  for (const status of explicit) statuses.add(status)

  // An `ok(...)` with no explicit status answers 200.
  const okCalls = (segment.match(/\bok\(/g) ?? []).length
  if (okCalls > explicit.length) statuses.add(200)
  if (/\bnoContent\(/.test(segment)) statuses.add(204)
  if (statuses.size === 0) statuses.add(200)

  return { successStatuses: [...statuses].sort((a, b) => a - b) }
}

function inferMediaType(apiPath) {
  if (/(?:\.|\/)csv$/.test(apiPath)) return 'text/csv'
  if (/(?:\.|\/)pdf$/.test(apiPath)) return 'application/pdf'
  if (/(?:\.|\/)xlsx$/.test(apiPath)) {
    return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  }
  return 'application/octet-stream'
}

// --- JSDoc ------------------------------------------------------------------

function precedingDoc(source, index) {
  const before = source.slice(0, index).trimEnd()
  if (!before.endsWith('*/')) return ''
  const start = before.lastIndexOf('/**')
  return start === -1 ? '' : before.slice(start)
}

/**
 * Summary and description from a handler's JSDoc.
 *
 * The comments here open with the method and path — `POST /api/v1/orders` —
 * which Swagger already shows, so that line is dropped. Text after a dash on it
 * (`DELETE /api/v1/users/:userId — soft, and ends every session.`) becomes the
 * summary; otherwise the first sentence of the body does.
 */
function parseDoc(block) {
  if (!block) return {}

  const raw = block
    .replace(/^\/\*\*/, '')
    .replace(/\*\/$/, '')
    .split('\n')
    .map((line) => line.replace(/^\s*\*?[ \t]?/, '').replace(/\s+$/, ''))

  // Tags for what the route's own signature cannot say: the errors a handler
  // raises beyond the defaults, and permissions checked inside the service
  // rather than by `route()`. One per line, removed from the prose:
  //
  //   @error 409 CONFLICT The basket changed since it was reviewed.
  //   @permission APPROVAL_ACT To approve, reject or send back an order.
  const errors = []
  const conditionalPermissions = []
  const lines = []
  for (const line of raw) {
    const text = line.trim()
    const error = text.match(/^@error\s+(\d{3})\s+([A-Z_]+)\s+(.+)$/)
    if (error) {
      errors.push({
        status: Number(error[1]),
        code: error[2],
        description: error[3],
      })
      continue
    }
    const permission = text.match(/^@permission\s+([A-Z_]+)\s+(.+)$/)
    if (permission) {
      conditionalPermissions.push({
        permission: permission[1],
        when: permission[2],
      })
      continue
    }
    if (/^@(error|permission)\b/.test(text)) {
      throw new Error(
        `malformed doc tag "${text}". Expected "@error <status> <CODE> <text>" ` +
          'or "@permission <PERMISSION> <text>".'
      )
    }
    lines.push(line)
  }

  while (lines.length > 0 && lines[0].trim() === '') lines.shift()
  while (lines.length > 0 && lines.at(-1).trim() === '') lines.pop()
  if (lines.length === 0) return { errors, conditionalPermissions }

  let summary
  const head = lines[0]
    .trim()
    .match(/^(?:GET|POST|PUT|PATCH|DELETE)\s+\/\S*\s*(?:[—–-]+\s*(.+))?$/)
  if (head) {
    lines.shift()
    if (head[1]) summary = capitalise(head[1].trim())
  }

  const paragraphs = []
  let current = []
  for (const line of lines) {
    if (line.trim() === '') {
      if (current.length > 0) paragraphs.push(current)
      current = []
    } else {
      current.push(line)
    }
  }
  if (current.length > 0) paragraphs.push(current)

  const rendered = paragraphs.map((paragraph) =>
    // Lists and indented blocks keep their line breaks; prose is reflowed.
    paragraph.some(
      (line) => /^\s*(?:[-*]|\d+\.)\s/.test(line) || /^\s{2,}\S/.test(line)
    )
      ? paragraph.join('\n')
      : paragraph.map((line) => line.trim()).join(' ')
  )

  if (!summary && rendered.length > 0) summary = firstSentence(rendered[0])

  const description = rendered.join('\n\n')
  return {
    summary,
    description:
      description && description !== summary ? description : undefined,
    errors,
    conditionalPermissions,
  }
}

function firstSentence(text) {
  // Swagger UI prints the summary on the same line as the path, so a long one
  // crowds the whole list. Cut at a word boundary, never through a word.
  // Declared in here, not beside the other constants below the run code: a
  // top-level const is not initialised until its line executes, and the run
  // above calls this long before that.
  const SUMMARY_LIMIT = 100

  const flat = text.replace(/\s+/g, ' ').trim()
  const match = flat.match(/^(.+?[.!?])(?:\s|$)/)
  const sentence = match ? match[1] : flat
  if (sentence.length <= SUMMARY_LIMIT) return sentence

  const cut = sentence.lastIndexOf(' ', SUMMARY_LIMIT - 1)
  const kept = sentence.slice(0, cut > 40 ? cut : SUMMARY_LIMIT - 1)
  return `${kept.replace(/[\s,;:—–-]+$/, '')}…`
}

function capitalise(text) {
  return text.charAt(0).toUpperCase() + text.slice(1)
}

/**
 * Removes comments so a commented-out call is not mistaken for a live one.
 * Leaves `//` alone after a colon or quote, which is where a URL puts it.
 */
function stripComments(code) {
  return code
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:'"`\\])\/\/[^\n]*/g, '$1')
}

// --- Output -----------------------------------------------------------------

function render(operations) {
  const aliases = new Map()
  const aliasFor = (specifier) => {
    if (aliases.has(specifier)) return aliases.get(specifier)
    const base = path.posix
      .basename(specifier)
      .split(/[^A-Za-z0-9]+/)
      .filter(Boolean)
      .map((word, i) => (i === 0 ? word : capitalise(word)))
      .join('')
    let alias = base || 'module'
    for (let n = 2; [...aliases.values()].includes(alias); n += 1) {
      alias = `${base}${n}`
    }
    aliases.set(specifier, alias)
    return alias
  }

  const entries = operations.map((op) => {
    const schemaList = (refs) =>
      `[${refs.map((ref) => `${aliasFor(ref.specifier)}.${ref.exported}`).join(', ')}]`

    const fields = [
      `method: ${JSON.stringify(op.method)}`,
      `path: ${JSON.stringify(op.path)}`,
      `tag: ${JSON.stringify(op.tag)}`,
      op.summary ? `summary: ${JSON.stringify(op.summary)}` : null,
      op.description ? `description: ${JSON.stringify(op.description)}` : null,
      `auth: ${JSON.stringify(op.auth)}`,
      `permissions: [${op.permissions.map((name) => `Permission.${name}`).join(', ')}]`,
      `roles: [${op.roles.map((name) => `Role.${name}`).join(', ')}]`,
      `body: ${schemaList(op.body)}`,
      op.consumes ? `consumes: ${JSON.stringify(op.consumes)}` : null,
      `query: ${schemaList(op.query)}`,
      `extraQuery: ${JSON.stringify(op.extraQuery)}`,
      `successStatuses: ${JSON.stringify(op.successStatuses)}`,
      op.produces ? `produces: ${JSON.stringify(op.produces)}` : null,
      op.errors.length > 0 ? `errors: ${JSON.stringify(op.errors)}` : null,
      op.conditionalPermissions.length > 0
        ? `conditionalPermissions: ${JSON.stringify(op.conditionalPermissions)}`
        : null,
      `rateLimited: ${op.rateLimited}`,
      `source: ${JSON.stringify(op.source)}`,
    ].filter(Boolean)

    return `  {\n    ${fields.join(',\n    ')},\n  }`
  })

  const usesPermission = operations.some((op) => op.permissions.length > 0)
  const usesRole = operations.some((op) => op.roles.length > 0)

  const imports = [
    usesPermission
      ? `import { Permission } from '@/server/auth/permissions'`
      : null,
    usesRole ? `import { Role } from '@/server/context/request-context'` : null,
    ...[...aliases.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([specifier, alias]) => `import * as ${alias} from '${specifier}'`),
    `import type { ManifestOperation } from './manifest.types'`,
  ].filter(Boolean)

  return [
    '/*',
    ' * GENERATED by scripts/generate-openapi-manifest.mjs — do not edit by hand.',
    ' *',
    ' * Regenerate after adding, removing or changing a route:',
    ' *   node scripts/generate-openapi-manifest.mjs',
    ' */',
    ...imports,
    '',
    'export const ROUTE_MANIFEST: readonly ManifestOperation[] = [',
    entries.join(',\n'),
    ']',
    '',
  ].join('\n')
}

async function format(code) {
  try {
    const prettier = await import('prettier')
    const config = (await prettier.resolveConfig(OUTPUT)) ?? {}
    return await prettier.format(code, { ...config, filepath: OUTPUT })
  } catch (error) {
    console.warn(
      `prettier could not format the manifest (${error.message}); writing it unformatted.`
    )
    return code
  }
}

function normaliseEol(text) {
  return text.replace(/\r\n/g, '\n')
}

function toPosix(file) {
  return file.split(path.sep).join('/')
}
