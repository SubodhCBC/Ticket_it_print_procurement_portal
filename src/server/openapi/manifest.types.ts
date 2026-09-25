import type { ZodTypeAny } from 'zod'

export type HttpMethod = 'get' | 'post' | 'put' | 'patch' | 'delete'

export interface ManifestError {
  readonly status: number
  /** An `ErrorCode`. */
  readonly code: string
  readonly description: string
}

export interface ManifestConditionalPermission {
  readonly permission: string
  readonly when: string
}

/**
 * One operation, as `scripts/generate-openapi-manifest.mjs` read it out of a
 * route file. The generated manifest is a list of these.
 *
 * Schemas are held as the zod objects themselves, imported from the modules the
 * route imports them from — never copied — so editing a schema changes the
 * document without regenerating anything.
 */
export interface ManifestOperation {
  readonly method: HttpMethod
  /** OpenAPI path template: `/api/v1/users/{userId}`. */
  readonly path: string
  /** The first path segment after the version, which groups the Swagger UI. */
  readonly tag: string
  readonly summary?: string
  /** The handler's JSDoc, minus its method-and-path first line. */
  readonly description?: string
  /** `bearer` for `route()`, `public` for `publicRoute()`. */
  readonly auth: 'bearer' | 'public'
  /** From `route({ permissions: [...] })` — every one of them is required. */
  readonly permissions: readonly string[]
  /** From `route({ roles: [...] })` — any one of them is enough. */
  readonly roles: readonly string[]
  /**
   * Schemas handed to `parseJsonBody`, or to `parseMultipartBody` for an upload.
   * More than one means a branch in the handler.
   */
  readonly body: readonly ZodTypeAny[]
  /**
   * Set when the handler reads a `multipart/form-data` body. The schemas in
   * `body` then describe only the text parts; the files are a separate property
   * the document adds.
   */
  readonly consumes?: 'multipart/form-data'
  /** Schemas handed to `parseQuery`; their properties are merged. */
  readonly query: readonly ZodTypeAny[]
  /** Query keys read with `searchParams.get()`, outside any schema. */
  readonly extraQuery: readonly string[]
  readonly successStatuses: readonly number[]
  /** Set for a file download; absent for a JSON response. */
  readonly produces?: string
  /** From `@error <status> <CODE> <text>` lines in the handler's JSDoc. */
  readonly errors?: readonly ManifestError[]
  /**
   * From `@permission <PERMISSION> <text>` lines: checked inside the service for
   * some requests, on top of what `route()` requires of every request.
   */
  readonly conditionalPermissions?: readonly ManifestConditionalPermission[]
  /** Whether the handler calls `enforceRateLimit`, and so can answer 429. */
  readonly rateLimited: boolean
  /** The route file this was read from, relative to the repository root. */
  readonly source: string
}
