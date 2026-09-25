import { z } from 'zod'
import { ALL_PERMISSIONS } from '@/server/auth/permissions'
import {
  PAGINATION_DEFAULT_LIMIT,
  PAGINATION_MAX_LIMIT,
} from '@/server/utils/pagination'

export const ListUsersQuerySchema = z.object({
  accountId: z.string().trim().max(64).optional(),
  siteId: z.string().trim().max(64).optional(),
  role: z.enum(['ADMIN', 'HEAD_OFFICE', 'SITE_USER']).optional(),
  status: z.enum(['ACTIVE', 'PENDING', 'DISABLED']).optional(),
  userType: z.enum(['EXISTING', 'NEW', 'EXTERNAL']).optional(),
  /** Case-insensitive match against login, email, first or last name. */
  search: z.string().trim().max(120).optional(),
  cursor: z.string().trim().max(64).optional(),
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(PAGINATION_MAX_LIMIT)
    .default(PAGINATION_DEFAULT_LIMIT),
})

export type ListUsersQueryDto = z.infer<typeof ListUsersQuerySchema>

/** Money as every other write takes it: a string, up to two decimals. */
const Money = z
  .string()
  .trim()
  .regex(/^\d{1,10}(\.\d{1,2})?$/, 'Expected an amount such as "1500.00"')

/**
 * What an administrator may change about a user.
 *
 * Not here: email, login, first and last name for a Ticket-IT user. Those are
 * replicated from the API on every sign-in, so editing them would produce a
 * change that reverts the next time the user logs in — worse than refusing,
 * because the administrator believes it worked.
 */
export const UpdateUserSchema = z
  .object({
    role: z.enum(['ADMIN', 'HEAD_OFFICE', 'SITE_USER']).optional(),
    status: z.enum(['ACTIVE', 'DISABLED']).optional(),
    /** Null detaches the user from their branch (account-wide head office). */
    siteId: z.string().trim().max(64).nullish(),
    /** Extra branches a HEAD_OFFICE user oversees. Replaces the whole set. */
    additionalSiteIds: z.array(z.string().trim().max(64)).max(200).optional(),
    /**
     * This user's own spend ceiling per billing period, checked at checkout
     * alongside the branch's (AD-4). Null removes it; "0.00" is a real cap —
     * the user may not order at all — exactly as on a site.
     */
    monthlyBudgetCap: Money.nullable().optional(),
    /**
     * The PO prefix this buyer's references must start with, narrower than the
     * branch's (AD-8). Blank or null removes it.
     */
    poPrefix: z
      .string()
      .trim()
      .max(32)
      .nullish()
      .transform((value) => (value === '' ? null : value)),
  })
  .refine(
    (value) => Object.keys(value).length > 0,
    'Provide at least one field to update'
  )

export type UpdateUserDto = z.infer<typeof UpdateUserSchema>

/**
 * A per-user departure from the role baseline.
 *
 * `permission` is checked against the code catalog rather than accepted as free
 * text: a typo would otherwise be stored happily and then never match anything,
 * which looks exactly like a permission that does not work.
 */
export const GrantPermissionSchema = z.object({
  permission: z.enum(ALL_PERMISSIONS as unknown as [string, ...string[]]),
  effect: z.enum(['ALLOW', 'DENY']).default('ALLOW'),
  /** Narrows the grant to one object — a document id, a site id. */
  resourceId: z.string().trim().max(128).nullish(),
  reason: z.string().trim().max(500).optional(),
  /** ISO 8601. Omit for a permanent grant. */
  expiresAt: z.coerce.date().optional(),
})

export type GrantPermissionDto = z.infer<typeof GrantPermissionSchema>

export const RevokePermissionSchema = z.object({
  permission: z.enum(ALL_PERMISSIONS as unknown as [string, ...string[]]),
  resourceId: z.string().trim().max(128).nullish(),
})

export type RevokePermissionDto = z.infer<typeof RevokePermissionSchema>
