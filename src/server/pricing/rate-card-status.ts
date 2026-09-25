/**
 * The life of a negotiated contract.
 *
 * A hand-written union rather than an import from `@prisma/client`: Prisma's
 * SQL Server connector does not support enums, so the column is a string with a
 * CHECK constraint and the generated client types it as `string`. The CHECK
 * constraint in the migration is built from this same list.
 *
 * Only ACTIVE cards price an order. DRAFT is a card still under negotiation —
 * several may exist at once for one customer, which is why the no-overlap rule
 * exempts them. ARCHIVED is history, and history necessarily overlaps itself.
 */
export const RateCardStatus = {
  DRAFT: 'DRAFT',
  ACTIVE: 'ACTIVE',
  ARCHIVED: 'ARCHIVED',
} as const

export type RateCardStatus =
  (typeof RateCardStatus)[keyof typeof RateCardStatus]
