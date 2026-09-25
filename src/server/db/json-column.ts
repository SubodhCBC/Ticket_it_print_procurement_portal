/**
 * Reading and writing the JSON-bearing columns.
 *
 * ---------------------------------------------------------------------------
 * Why these exist
 * ---------------------------------------------------------------------------
 * Prisma's SQL Server connector has no `Json` scalar, so every column that held
 * JSON under PostgreSQL is now `NVARCHAR(MAX)` and the generated client types it
 * as `string`. The database still understands the contents — an `ISJSON` check
 * constraint guards every one of them, and `JSON_VALUE` / `OPENJSON` read them
 * in the raw queries — but the round trip through the client is now explicit.
 *
 * Doing it here rather than at each call site means one decision about what a
 * missing or malformed value means, instead of thirty.
 *
 * ---------------------------------------------------------------------------
 * Malformed JSON is not silently swallowed
 * ---------------------------------------------------------------------------
 * `fromJson` throws. A column that fails to parse is a write that got past the
 * check constraint or a manual UPDATE that should not have happened, and
 * returning a fallback would turn a corrupted order snapshot into an order that
 * merely looks empty. The one place a fallback is right is a genuinely optional
 * column, which is what `fromJsonOr` is for.
 */

/** Serialises for storage. */
export function toJson(value: unknown): string {
  return JSON.stringify(value)
}

/**
 * Serialises an optional value, mapping `null` and `undefined` onto a real SQL
 * NULL rather than onto the four-character string `"null"` — which is valid
 * JSON, passes ISJSON, and would read back as a value that is present.
 */
export function toJsonOrNull(value: unknown): string | null {
  return value === null || value === undefined ? null : JSON.stringify(value)
}

/** Parses a column that the schema says is always present. */
export function fromJson<T>(raw: string, column = 'a JSON column'): T {
  try {
    return JSON.parse(raw) as T
  } catch (error) {
    throw new Error(
      `${column} does not contain valid JSON. The ISJSON check constraint should ` +
        'have made this impossible, so the row was probably written outside the application.',
      { cause: error }
    )
  }
}

/** Parses a nullable column, using the fallback when it is NULL. */
export function fromJsonOr<T>(raw: string | null | undefined, fallback: T): T {
  if (raw === null || raw === undefined) return fallback
  return fromJson<T>(raw)
}

/**
 * A list of short strings — product tags, option values.
 *
 * Stored as a JSON array in a single column rather than in a join table. The
 * trade is deliberate: a join table would index cleanly, but these are read as
 * a whole list every single time and never on their own, so the join would buy
 * an index nothing asks for at the cost of a second table on every read and
 * write. `tagFilter` below is the one query that pays for it.
 */
export function toStringList(values: readonly string[]): string {
  return JSON.stringify(values)
}

export function fromStringList(raw: string | null | undefined): string[] {
  const parsed = fromJsonOr<unknown>(raw, [])
  return Array.isArray(parsed)
    ? parsed.filter((v): v is string => typeof v === 'string')
    : []
}

/**
 * Matches one tag inside a JSON array column.
 *
 * `"promo"` with the quotes, so `promo` cannot match `promotional` — every
 * element is a quoted JSON string, and the quotes are what make the comparison
 * exact rather than a substring one.
 *
 * A scan, not an index seek. PostgreSQL answered `tags @> ARRAY[...]` from a GIN
 * index; nothing here can. Tag filtering is an admin-side refinement over an
 * already-narrowed catalogue rather than the primary search, so the scan is
 * affordable — see the measurements next to the search clause in
 * products.service.ts for what one costs. If it ever becomes the hot path, the
 * answer is a `product_tags` join table, not a cleverer string match.
 */
export function tagFilter(tag: string): { contains: string } {
  return { contains: JSON.stringify(tag) }
}

/**
 * Serialises with object keys sorted, so two equal objects produce one string.
 *
 * Needed wherever a JSON column is compared for *equality* rather than merely
 * stored. PostgreSQL held these as `jsonb`, which compares by value: the
 * duplicate-variant check asked `attributes = {...}` and `{"size":"A4","colour":"red"}`
 * matched `{"colour":"red","size":"A4"}` because key order is not part of a
 * jsonb value. NVARCHAR compares by bytes, so without canonicalising, the same
 * variant submitted with its keys in a different order would slip past the
 * check and create a duplicate the product page cannot disambiguate.
 *
 * One level of sorting is enough here: these objects are flat maps of option
 * name to chosen value. A nested structure would need this to recurse, and if
 * one ever appears the comparison should move to OPENJSON instead.
 */
export function toCanonicalJson(value: Record<string, unknown>): string {
  const sorted: Record<string, unknown> = {}
  for (const key of Object.keys(value).sort()) sorted[key] = value[key]
  return JSON.stringify(sorted)
}
