import { z } from 'zod'

/**
 * A stable key used in bulk imports and URLs.
 *
 * Upper-cased on write, like every other code in the system, so a re-import
 * cannot create "posters" alongside "POSTERS" — the unique index is on the
 * stored value and would happily allow both.
 */
const CategoryCode = z
  .string()
  .trim()
  .min(2, 'Category code is required')
  .max(48)
  .regex(
    /^[A-Za-z0-9][A-Za-z0-9_-]*$/,
    'Use letters, digits, dash or underscore'
  )
  .transform((value) => value.toUpperCase())

export const CreateCategorySchema = z.object({
  code: CategoryCode,
  name: z.string().trim().min(1, 'Category name is required').max(120),
  description: z.string().trim().max(1000).optional(),
  sortOrder: z.coerce.number().int().min(0).max(9999).default(0),
})

export type CreateCategoryDto = z.infer<typeof CreateCategorySchema>

/**
 * `code` is absent, deliberately — the same reasoning that keeps `accountCode`
 * and a site's `code` out of their update schemas. It appears in import files
 * and saved URLs that already exist.
 */
export const UpdateCategorySchema = z
  .object({
    name: z.string().trim().min(1).max(120).optional(),
    description: z.string().trim().max(1000).nullish(),
    sortOrder: z.coerce.number().int().min(0).max(9999).optional(),
    status: z.enum(['ACTIVE', 'INACTIVE']).optional(),
  })
  .refine(
    (value) => Object.keys(value).length > 0,
    'Provide at least one field to update'
  )

export type UpdateCategoryDto = z.infer<typeof UpdateCategorySchema>

/**
 * Who may see a category (SOW AD-5).
 *
 * `accountIds` replaces the whole allow-list and is ignored for ALL_ACCOUNTS —
 * the saved rows stay, so the restriction can be reinstated. A RESTRICTED
 * category needs at least one account, or its products would be hidden from
 * every customer while still looking live to the administrator who set it.
 */
export const SetCategoryVisibilitySchema = z
  .object({
    visibility: z.enum(['ALL_ACCOUNTS', 'RESTRICTED']),
    accountIds: z.array(z.string().trim().max(64)).max(500).default([]),
  })
  .refine(
    (value) => value.visibility !== 'RESTRICTED' || value.accountIds.length > 0,
    {
      message:
        'A restricted category needs at least one account, or nobody can order from it',
      path: ['accountIds'],
    }
  )

export type SetCategoryVisibilityDto = z.infer<
  typeof SetCategoryVisibilitySchema
>

export const ListCategoriesQuerySchema = z.object({
  status: z.enum(['ACTIVE', 'INACTIVE']).optional(),
  /** Administrators only; ignored for anyone else. */
  visibility: z.enum(['ALL_ACCOUNTS', 'RESTRICTED']).optional(),
  /**
   * Catalogue navigation asks for the whole list at once — there are eight
   * categories, not eight thousand — so this endpoint is unpaginated and simply
   * caps what it will return.
   */
  includeEmpty: z
    .union([z.boolean(), z.string()])
    .transform((value) =>
      typeof value === 'boolean' ? value : value === 'true'
    )
    .default(true),
})

export type ListCategoriesQueryDto = z.infer<typeof ListCategoriesQuerySchema>
