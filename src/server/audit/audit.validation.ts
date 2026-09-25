import { z } from 'zod'

const ENTITY_TYPES = [
  'ACCOUNT',
  'SITE',
  'USER',
  'INVITATION',
  'PERMISSION',
  'PRODUCT',
  'RATE_CARD',
  'ORDER',
  'TEMPLATE',
  'INTEGRATION',
  'SYSTEM',
] as const

/**
 * Filters for the audit explorer.
 *
 * Offset-paginated rather than cursor-paginated: the admin table shows a total
 * and lets the operator jump to a page, neither of which a cursor can express.
 * See `utils/pagination.ts` for when each shape applies.
 */
export const ListAuditLogQuerySchema = z
  .object({
    accountId: z.string().trim().max(64).optional(),
    actorId: z.string().trim().max(64).optional(),
    entityType: z.enum(ENTITY_TYPES).optional(),
    entityId: z.string().trim().max(128).optional(),
    action: z.string().trim().max(64).optional(),
    /** ISO 8601, inclusive on both ends. */
    from: z.coerce.date().optional(),
    to: z.coerce.date().optional(),
    /** Matches actor name, actor email, entity name or entity id. */
    search: z.string().trim().max(120).optional(),
    /**
     * Entries whose recorded change includes this field (§12: "searchable").
     *
     * A bare identifier and nothing else. The filter is a LIKE on SQL Server,
     * where `_`, `%` and `[` are wildcards, and a field name never needs one.
     */
    field: z
      .string()
      .trim()
      .regex(
        /^[A-Za-z][A-Za-z0-9]{0,63}$/,
        'field must be a field name, such as basePrice'
      )
      .optional(),
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(25),
  })
  .refine((value) => !value.from || !value.to || value.from <= value.to, {
    message: 'from must not be after to',
    path: ['from'],
  })

export type ListAuditLogQueryDto = z.infer<typeof ListAuditLogQuerySchema>
