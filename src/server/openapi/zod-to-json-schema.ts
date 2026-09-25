import type { ZodTypeAny } from 'zod'

/**
 * Zod (v3) schema -> JSON Schema, for the OpenAPI document.
 *
 * ---------------------------------------------------------------------------
 * Why this is written here rather than installed
 * ---------------------------------------------------------------------------
 * `zod-to-json-schema` and `@asteasolutions/zod-to-openapi` both do this. Neither
 * is a dependency of the project, and the schemas here use a small, fixed set of
 * constructs — objects, strings, enums, booleans, arrays, coerced numbers and
 * dates, with optional/nullish/default and refine/transform around them — so a
 * converter for exactly that set is a page of code and no new package.
 * Anything it does not recognise degrades to `{}` ("any value"), which is
 * incomplete documentation rather than wrong documentation.
 *
 * ---------------------------------------------------------------------------
 * It describes the input side
 * ---------------------------------------------------------------------------
 * A request schema's job is to accept what the client sends, so that is what the
 * document must show. A `.transform()` is documented as the value before it
 * runs, a pipeline as its first stage, a `z.coerce.number()` in a query string
 * as a number, and a field with a `.default()` as optional.
 *
 * ---------------------------------------------------------------------------
 * It reads `_def.typeName`, not `instanceof`
 * ---------------------------------------------------------------------------
 * A class check fails whenever two copies of zod end up in one bundle — the ESM
 * and CommonJS builds, say — and then every schema would silently document as
 * `{}`. The type name is a plain string and survives that.
 */

export type JsonSchema = { [keyword: string]: unknown }

/** Deep enough for any real request; shallow enough to stop a `z.lazy` cycle. */
const MAX_DEPTH = 32

interface Def {
  readonly typeName?: string
  readonly description?: string
  readonly [field: string]: unknown
}

interface Check {
  readonly kind: string
  readonly value?: unknown
  readonly inclusive?: boolean
  readonly regex?: RegExp
  readonly version?: string
}

interface LengthLimit {
  readonly value: number
}

function defOf(schema: ZodTypeAny): Def {
  return schema._def as Def
}

export function toJsonSchema(schema: ZodTypeAny): JsonSchema {
  return convert(schema, 0)
}

function convert(schema: ZodTypeAny, depth: number): JsonSchema {
  if (depth > MAX_DEPTH) return {}

  const def = defOf(schema)
  const converted = convertDef(def, depth + 1)

  // `.describe()` on the outermost wrapper wins over one further in.
  return def.description
    ? { ...converted, description: def.description }
    : converted
}

function convertDef(def: Def, depth: number): JsonSchema {
  const child = (field: string) => convert(def[field] as ZodTypeAny, depth)

  switch (def.typeName) {
    case 'ZodString':
      return stringSchema(def)
    case 'ZodNumber':
      return numberSchema(def)
    case 'ZodBigInt':
      return { type: 'integer', format: 'int64' }
    case 'ZodBoolean':
      return { type: 'boolean' }
    case 'ZodDate':
      return { type: 'string', format: 'date-time' }
    case 'ZodNull':
      return { type: 'null' }
    case 'ZodAny':
    case 'ZodUnknown':
      return {}
    case 'ZodUndefined':
    case 'ZodVoid':
    case 'ZodNever':
      return { not: {} }
    case 'ZodLiteral':
      return literalSchema(def.value)
    case 'ZodEnum':
      return { type: 'string', enum: [...(def.values as readonly string[])] }
    case 'ZodNativeEnum':
      return nativeEnumSchema(def.values as Record<string, string | number>)
    case 'ZodArray':
      return arraySchema(def, depth)
    case 'ZodSet':
      return { type: 'array', uniqueItems: true, items: child('valueType') }
    case 'ZodTuple':
      return tupleSchema(def, depth)
    case 'ZodObject':
      return objectSchema(def, depth)
    case 'ZodRecord':
    case 'ZodMap':
      return { type: 'object', additionalProperties: child('valueType') }
    case 'ZodUnion':
      return {
        anyOf: (def.options as readonly ZodTypeAny[]).map((option) =>
          convert(option, depth)
        ),
      }
    case 'ZodDiscriminatedUnion':
      return {
        oneOf: (def.options as readonly ZodTypeAny[]).map((option) =>
          convert(option, depth)
        ),
      }
    case 'ZodIntersection':
      return { allOf: [child('left'), child('right')] }
    case 'ZodOptional':
    case 'ZodCatch':
    case 'ZodReadonly':
      return child('innerType')
    case 'ZodNullable':
      return withNull(child('innerType'))
    case 'ZodDefault':
      return withDefault(child('innerType'), def.defaultValue)
    case 'ZodEffects':
      return child('schema')
    case 'ZodPipeline':
      return child('in')
    case 'ZodBranded':
    case 'ZodPromise':
      return child('type')
    case 'ZodLazy':
      return convert((def.getter as () => ZodTypeAny)(), depth)
    default:
      return {}
  }
}

// --- Leaf types -------------------------------------------------------------

const STRING_FORMATS: Readonly<Record<string, string>> = {
  email: 'email',
  url: 'uri',
  uuid: 'uuid',
  datetime: 'date-time',
  date: 'date',
  time: 'time',
  duration: 'duration',
  base64: 'byte',
}

function stringSchema(def: Def): JsonSchema {
  const out: JsonSchema = { type: 'string' }

  for (const check of (def.checks as readonly Check[] | undefined) ?? []) {
    const value = check.value as number
    switch (check.kind) {
      case 'min':
        out.minLength = Math.max(
          (out.minLength as number | undefined) ?? 0,
          value
        )
        break
      case 'max':
        out.maxLength = Math.min(
          (out.maxLength as number | undefined) ?? Number.POSITIVE_INFINITY,
          value
        )
        break
      case 'length':
        out.minLength = value
        out.maxLength = value
        break
      case 'regex':
        // JSON Schema holds one pattern; the first is kept, being the one a
        // schema author reaches for first and usually the only one.
        out.pattern ??= check.regex?.source
        break
      case 'startsWith':
        out.pattern ??= `^${escapeRegExp(String(check.value))}`
        break
      case 'endsWith':
        out.pattern ??= `${escapeRegExp(String(check.value))}$`
        break
      case 'ip':
        out.format = check.version === 'v6' ? 'ipv6' : 'ipv4'
        break
      default: {
        const format = STRING_FORMATS[check.kind]
        if (format) out.format = format
      }
    }
  }

  return out
}

function numberSchema(def: Def): JsonSchema {
  const out: JsonSchema = { type: 'number' }

  for (const check of (def.checks as readonly Check[] | undefined) ?? []) {
    const value = check.value as number
    switch (check.kind) {
      case 'int':
        out.type = 'integer'
        break
      case 'min':
        if (check.inclusive) out.minimum = value
        else out.exclusiveMinimum = value
        break
      case 'max':
        if (check.inclusive) out.maximum = value
        else out.exclusiveMaximum = value
        break
      case 'multipleOf':
        out.multipleOf = value
        break
    }
  }

  return out
}

function literalSchema(value: unknown): JsonSchema {
  if (value === null) return { type: 'null' }
  switch (typeof value) {
    case 'string':
      return { type: 'string', const: value }
    case 'number':
      return { type: 'number', const: value }
    case 'boolean':
      return { type: 'boolean', const: value }
    default:
      return {}
  }
}

/**
 * A TypeScript numeric enum carries a reverse mapping (`{ A: 0, 0: 'A' }`), so
 * the members are the keys whose value is not itself a key of a number.
 */
function nativeEnumSchema(values: Record<string, string | number>): JsonSchema {
  const members = Object.keys(values)
    .filter((key) => typeof values[values[key] as string] !== 'number')
    .map((key) => values[key])

  const types = new Set(members.map((member) => typeof member))
  if (types.size !== 1) return { enum: members }
  return { type: types.has('number') ? 'number' : 'string', enum: members }
}

// --- Containers -------------------------------------------------------------

function arraySchema(def: Def, depth: number): JsonSchema {
  const out: JsonSchema = {
    type: 'array',
    items: convert(def.type as ZodTypeAny, depth),
  }

  const exact = def.exactLength as LengthLimit | null
  const min = def.minLength as LengthLimit | null
  const max = def.maxLength as LengthLimit | null
  if (exact) {
    out.minItems = exact.value
    out.maxItems = exact.value
  }
  if (min) out.minItems = min.value
  if (max) out.maxItems = max.value

  return out
}

function tupleSchema(def: Def, depth: number): JsonSchema {
  const items = (def.items as readonly ZodTypeAny[]).map((item) =>
    convert(item, depth)
  )
  const rest = def.rest as ZodTypeAny | null

  return {
    type: 'array',
    prefixItems: items,
    minItems: items.length,
    ...(rest ? { items: convert(rest, depth) } : { maxItems: items.length }),
  }
}

function objectSchema(def: Def, depth: number): JsonSchema {
  const shape = (def.shape as () => Record<string, ZodTypeAny>)()
  const properties: Record<string, JsonSchema> = {}
  const required: string[] = []

  for (const [key, value] of Object.entries(shape)) {
    properties[key] = convert(value, depth)
    if (!acceptsUndefined(value)) required.push(key)
  }

  const out: JsonSchema = { type: 'object', properties }
  if (required.length > 0) out.required = required

  // `.catchall()` describes the extra keys; `.strict()` forbids them; the
  // default (strip) and `.passthrough()` both accept them, which is JSON
  // Schema's own default and needs no keyword.
  const catchall = def.catchall as ZodTypeAny | undefined
  if (catchall && defOf(catchall).typeName !== 'ZodNever') {
    out.additionalProperties = convert(catchall, depth)
  } else if (def.unknownKeys === 'strict') {
    out.additionalProperties = false
  }

  return out
}

// --- Modifiers --------------------------------------------------------------

/**
 * OpenAPI 3.1 spells nullable as a type list. Swagger UI renders that far more
 * legibly than an `anyOf` with a null branch, so the list is used wherever the
 * inner schema allows it.
 */
function withNull(schema: JsonSchema): JsonSchema {
  if (Object.keys(schema).length === 0) return schema
  if (typeof schema.type === 'string' && !('const' in schema)) {
    return {
      ...schema,
      type: [schema.type, 'null'],
      ...(Array.isArray(schema.enum) ? { enum: [...schema.enum, null] } : {}),
    }
  }
  return { anyOf: [schema, { type: 'null' }] }
}

function withDefault(schema: JsonSchema, factory: unknown): JsonSchema {
  if (typeof factory !== 'function') return schema
  try {
    const value: unknown = (factory as () => unknown)()
    if (value === undefined) return schema
    const serialised: unknown =
      value instanceof Date
        ? value.toISOString()
        : JSON.parse(JSON.stringify(value))
    return { ...schema, default: serialised }
  } catch {
    // A default that cannot be computed or serialised outside a request is
    // simply left out of the document.
    return schema
  }
}

// --- Structural queries -----------------------------------------------------

/**
 * Whether a field may be left out entirely.
 *
 * Read from the structure rather than by calling `safeParse(undefined)`: a
 * transform or refinement is arbitrary code, and running it on `undefined` to
 * find out can throw straight through `safeParse`.
 */
export function acceptsUndefined(schema: ZodTypeAny, depth = 0): boolean {
  if (depth > MAX_DEPTH) return false

  const def = defOf(schema)
  const next = (inner: unknown) =>
    acceptsUndefined(inner as ZodTypeAny, depth + 1)

  switch (def.typeName) {
    case 'ZodOptional':
    case 'ZodDefault':
    case 'ZodCatch':
    case 'ZodUndefined':
    case 'ZodVoid':
    case 'ZodAny':
    case 'ZodUnknown':
      return true
    case 'ZodNullable':
    case 'ZodReadonly':
      return next(def.innerType)
    case 'ZodBranded':
      return next(def.type)
    case 'ZodEffects':
      return next(def.schema)
    case 'ZodPipeline':
      return next(def.in)
    case 'ZodLazy':
      return next((def.getter as () => ZodTypeAny)())
    case 'ZodUnion':
    case 'ZodDiscriminatedUnion':
      return (def.options as readonly ZodTypeAny[]).some((option) =>
        next(option)
      )
    default:
      return false
  }
}

/**
 * The properties of an object schema, looking through the wrappers a query
 * schema tends to carry. Undefined for anything that is not, at heart, an object.
 */
export function objectShape(
  schema: ZodTypeAny,
  depth = 0
): Record<string, ZodTypeAny> | undefined {
  if (depth > MAX_DEPTH) return undefined

  const def = defOf(schema)
  const next = (inner: unknown) => objectShape(inner as ZodTypeAny, depth + 1)

  switch (def.typeName) {
    case 'ZodObject':
      return (def.shape as () => Record<string, ZodTypeAny>)()
    case 'ZodOptional':
    case 'ZodNullable':
    case 'ZodDefault':
    case 'ZodCatch':
    case 'ZodReadonly':
      return next(def.innerType)
    case 'ZodBranded':
      return next(def.type)
    case 'ZodEffects':
      return next(def.schema)
    case 'ZodPipeline':
      return next(def.in)
    case 'ZodLazy':
      return next((def.getter as () => ZodTypeAny)())
    case 'ZodIntersection': {
      const left = next(def.left)
      const right = next(def.right)
      return left || right ? { ...left, ...right } : undefined
    }
    default:
      return undefined
  }
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
