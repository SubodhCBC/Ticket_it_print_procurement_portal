import type { NextRequest } from 'next/server'
import type { TypeOf, ZodTypeAny } from 'zod'
import { ValidationError } from './errors'

/**
 * Parses and validates a JSON request body.
 *
 * An absent or empty body parses to `undefined` and the schema decides whether
 * that is acceptable, rather than being rejected outright. The API this was
 * ported from needed a custom Fastify content-type parser to get the same
 * behaviour, for the same reason: axios sets `Content-Type: application/json`
 * on a bodyless DELETE, and an empty body is not a malformed one.
 *
 * Broken JSON, on the other hand, is a client error and gets this API's own
 * envelope like every other bad request.
 */
export async function parseJsonBody<S extends ZodTypeAny>(
  request: NextRequest,
  schema: S
): Promise<TypeOf<S>> {
  const raw = await request.text()

  let parsed: unknown
  if (raw.trim() === '') {
    parsed = undefined
  } else {
    try {
      parsed = JSON.parse(raw)
    } catch {
      throw new ValidationError('Request body is not valid JSON')
    }
  }

  // Throws ZodError, which the error middleware renders as VALIDATION_FAILED
  // with the per-field issues the forms display.
  return schema.parse(parsed)
}

/**
 * Parses and validates the query string.
 *
 * Repeated keys collapse to the last value, which is what every filter in this
 * API expects; a schema that genuinely wants a list should read it as a
 * comma-separated string and split it, so the wire format stays predictable.
 */
export function parseQuery<S extends ZodTypeAny>(
  request: NextRequest,
  schema: S
): TypeOf<S> {
  const params = new URL(request.url).searchParams
  return schema.parse(Object.fromEntries(params.entries()))
}

/**
 * A `multipart/form-data` body, split into its text fields and its files.
 *
 * @see parseMultipartBody
 */
export interface MultipartBody<T> {
  readonly fields: T
  /**
   * Every part that arrived as a file, in the order the client sent them,
   * whatever field name each was given.
   */
  readonly files: readonly File[]
}

/**
 * Parses and validates a `multipart/form-data` request body.
 *
 * The text parts go through `schema` exactly as `parseJsonBody` would — so the
 * same validation module describes them, and the same VALIDATION_FAILED envelope
 * comes back — and the file parts are handed over separately, because zod has
 * nothing useful to say about a `File` beyond that it is one.
 *
 * Repeated text keys collapse to the last value, the same as `parseQuery`. File
 * parts do not: a form with three files under one name yields three entries.
 *
 * Next reads the whole body into memory to build the `FormData`, so a route
 * using this must cap how much it will accept — see `assertUploadableFiles` in
 * `dam.validation.ts`. Anything print-resolution should presign instead, the way
 * `catalog` and `templates` assets do.
 */
export async function parseMultipartBody<S extends ZodTypeAny>(
  request: NextRequest,
  schema: S
): Promise<MultipartBody<TypeOf<S>>> {
  const contentType = request.headers.get('content-type') ?? ''
  if (!contentType.toLowerCase().startsWith('multipart/form-data')) {
    throw new ValidationError(
      'Send this as multipart/form-data, with the files as file parts'
    )
  }

  let form: FormData
  try {
    form = await request.formData()
  } catch {
    // A truncated upload or a malformed boundary. The client's problem, not a
    // 500: the same treatment broken JSON gets above.
    throw new ValidationError('Request body is not a valid multipart upload')
  }

  const fields: Record<string, unknown> = {}
  const files: File[] = []
  for (const [key, value] of form.entries()) {
    if (typeof value === 'string') fields[key] = value
    else files.push(value)
  }

  return { fields: schema.parse(fields), files }
}
