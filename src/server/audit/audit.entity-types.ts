/**
 * What an audit entry is *about*.
 *
 * A hand-written union rather than an import from `@prisma/client`, because
 * Prisma's SQL Server connector does not support enums: the column is a string
 * with a CHECK constraint, and the generated client types it as `string`. This
 * is where the closed set lives on the TypeScript side, and the CHECK
 * constraint in the migration is built from the same list.
 *
 * Deliberately coarse. This answers "which screen would you go looking on",
 * not "which table was touched" — `AuditAction` already carries that precision,
 * and a value per table would give the filter dropdown forty entries nobody
 * wants to read.
 */
export const AuditEntityType = {
  ACCOUNT: 'ACCOUNT',
  SITE: 'SITE',
  USER: 'USER',
  INVITATION: 'INVITATION',
  PERMISSION: 'PERMISSION',
  PRODUCT: 'PRODUCT',
  RATE_CARD: 'RATE_CARD',
  ORDER: 'ORDER',
  TEMPLATE: 'TEMPLATE',
  INTEGRATION: 'INTEGRATION',
  SYSTEM: 'SYSTEM',
} as const

export type AuditEntityType =
  (typeof AuditEntityType)[keyof typeof AuditEntityType]
