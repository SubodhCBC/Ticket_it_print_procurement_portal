/**
 * Narrowing the string columns that used to be enums.
 *
 * ---------------------------------------------------------------------------
 * Why a helper instead of a bare `as`
 * ---------------------------------------------------------------------------
 * Prisma's SQL Server connector has no enums, so `role`, `status`, `userType`
 * and the twenty-seven others are `NVARCHAR` columns typed as plain `string` by
 * the generated client. The closed sets still exist — in code as the const
 * unions (`Role`, `OrderStatus`, `ProductStatus`, …) and in the database as
 * CHECK constraints built from the same lists — but the client no longer
 * connects the two.
 *
 * This is the seam where they are reconnected, and it is a cast: nothing is
 * validated at runtime. That is deliberate. The CHECK constraint is what
 * guarantees the value, and re-checking every row on the way out would be
 * paying twice for one guarantee, on every read, for a violation that can only
 * happen if someone has written to the database by hand.
 *
 * What it buys over `as Role` scattered through the services is that every one
 * of these boundaries is greppable. When the constraints and the unions drift —
 * someone adds a status in code and forgets the migration — `asEnum` is the
 * list of places to check.
 */

/** Narrows a CHECK-constrained column to its union type. */
export function asEnum<T extends string>(value: string): T {
  return value as T
}

/** The same, for a nullable column. */
export function asEnumOrNull<T extends string>(value: string | null): T | null {
  return value as T | null
}
