import { z } from 'zod'

import { DamFileRefSchema } from '../dam/dam.validation'

/**
 * The customer-facing stock code, and the key the bulk importer upserts on.
 * Upper-cased so a re-import cannot create a case-only duplicate.
 */
export const Sku = z
  .string()
  .trim()
  .min(2, 'SKU is required')
  .max(64)
  .regex(
    /^[A-Za-z0-9][A-Za-z0-9._/-]*$/,
    'Use letters, digits, dot, dash, slash or underscore'
  )
  .transform((value) => value.toUpperCase())

/**
 * Money as a string — the same rule as everywhere else in this codebase. These
 * are NUMERIC(12,2) columns, and a JSON number would be rounded by the client's
 * parser before it ever reached us.
 */
const Money = z
  .string()
  .trim()
  .regex(/^\d{1,10}(\.\d{1,2})?$/, 'Expected an amount such as "12.50"')

/** Millimetres, to two decimals — bleed is routinely 1.5mm or 3mm. */
const Millimetres = z
  .string()
  .trim()
  .regex(
    /^\d{1,3}(\.\d{1,2})?$/,
    'Expected a measurement in millimetres, such as "3" or "1.50"'
  )

const UOM = z.enum(['EACH', 'PACK', 'BOX', 'ROLL', 'SET', 'SQUARE_METRE'])

/** How GST applies (SOW F-06). Named for what finance calls them. */
export const TaxTreatment = z.enum(['STANDARD', 'ZERO_RATED', 'EXEMPT'])

/** Shared between create and update; every field is optional in the latter. */
const productFields = {
  name: z.string().trim().min(1, 'Product name is required').max(200),
  description: z.string().trim().max(4000).nullish(),
  categoryId: z.string().trim().min(1, 'A category is required').max(64),
  basePrice: Money,
  moq: z.coerce.number().int().min(1).max(1_000_000).default(1),
  orderMultiple: z.coerce.number().int().min(1).max(1_000_000).default(1),
  packSize: z.coerce.number().int().min(1).max(1_000_000).default(1),
  uom: UOM.default('EACH'),
  taxTreatment: TaxTreatment.default('STANDARD'),
  widthMm: z.coerce.number().int().min(1).max(100_000).nullish(),
  heightMm: z.coerce.number().int().min(1).max(100_000).nullish(),
  depthMm: z.coerce.number().int().min(1).max(100_000).nullish(),
  weightGrams: z.coerce.number().int().min(0).max(10_000_000).nullish(),
  bleedMm: Millimetres.nullish(),
  safeMarginMm: Millimetres.nullish(),
  trackInventory: z.boolean().default(true),
  lowStockThreshold: z.coerce.number().int().min(0).max(1_000_000).default(0),
  /**
   * How many to buy when stock reaches the threshold. Advisory — it rides along
   * on the low-stock alert so whoever reorders does not have to look it up.
   */
  reorderQuantity: z.coerce.number().int().min(1).max(1_000_000).nullish(),
  leadTimeDays: z.coerce.number().int().min(0).max(365).nullish(),
  tags: z.array(z.string().trim().min(1).max(48)).max(30).default([]),
}

/**
 * A product is always created as DRAFT — status is not settable here.
 *
 * Publishing is a separate, audited transition (`POST /:id/status`), because it
 * is the moment a product becomes orderable and that deserves its own entry in
 * the trail rather than being inferred from a field on a create call.
 *
 * `stockOnHand` is likewise absent: stock moves through the adjustment endpoint
 * so that every change has a reason and an audit entry. Setting an opening
 * balance is `POST /:id/stock` with `reason: "Opening balance"`.
 */
export const CreateProductSchema = z.object({
  sku: Sku,
  ...productFields,
})

export type CreateProductDto = z.infer<typeof CreateProductSchema>

export const UpdateProductSchema = z
  .object({
    name: productFields.name.optional(),
    description: productFields.description,
    categoryId: productFields.categoryId.optional(),
    basePrice: Money.optional(),
    moq: z.coerce.number().int().min(1).max(1_000_000).optional(),
    orderMultiple: z.coerce.number().int().min(1).max(1_000_000).optional(),
    packSize: z.coerce.number().int().min(1).max(1_000_000).optional(),
    uom: UOM.optional(),
    taxTreatment: TaxTreatment.optional(),
    widthMm: productFields.widthMm,
    heightMm: productFields.heightMm,
    depthMm: productFields.depthMm,
    weightGrams: productFields.weightGrams,
    bleedMm: productFields.bleedMm,
    safeMarginMm: productFields.safeMarginMm,
    trackInventory: z.boolean().optional(),
    lowStockThreshold: z.coerce.number().int().min(0).max(1_000_000).optional(),
    reorderQuantity: z.coerce.number().int().min(1).max(1_000_000).nullish(),
    leadTimeDays: productFields.leadTimeDays,
    tags: z.array(z.string().trim().min(1).max(48)).max(30).optional(),
  })
  .refine(
    (value) => Object.keys(value).length > 0,
    'Provide at least one field to update'
  )

export type UpdateProductDto = z.infer<typeof UpdateProductSchema>

/**
 * A status transition. `supersededById` is required when moving to SUPERSEDED
 * and refused otherwise — a successor on any other transition is a mistake, and
 * accepting it silently would leave a stale pointer on a live product.
 */
export const ChangeProductStatusSchema = z
  .object({
    status: z.enum(['ACTIVE', 'UNAVAILABLE', 'SUPERSEDED']),
    supersededById: z.string().trim().max(64).optional(),
    reason: z.string().trim().max(500).optional(),
  })
  .refine(
    (value) =>
      value.status !== 'SUPERSEDED' || value.supersededById !== undefined,
    {
      message: 'A replacement product is required when superseding',
      path: ['supersededById'],
    }
  )
  .refine(
    (value) =>
      value.status === 'SUPERSEDED' || value.supersededById === undefined,
    {
      message: 'A replacement product only applies when superseding',
      path: ['supersededById'],
    }
  )

export type ChangeProductStatusDto = z.infer<typeof ChangeProductStatusSchema>

export const ListProductsQuerySchema = z.object({
  categoryId: z.string().trim().max(64).optional(),
  status: z.enum(['DRAFT', 'ACTIVE', 'UNAVAILABLE', 'SUPERSEDED']).optional(),
  /** Substring match on name or SKU, served by the trigram indexes. */
  search: z.string().trim().max(120).optional(),
  /** Every listed tag must be present. */
  tags: z
    .union([z.string(), z.array(z.string())])
    .transform((value) => (Array.isArray(value) ? value : value.split(',')))
    .pipe(z.array(z.string().trim().min(1).max(48)).max(10))
    .optional(),
  /** Only items at or below their low-stock threshold. Drives the warehouse view. */
  lowStockOnly: z
    .union([z.boolean(), z.string()])
    .transform((value) =>
      typeof value === 'boolean' ? value : value === 'true'
    )
    .optional(),
  /**
   * Presign one thumbnail per row.
   *
   * Off by default, because the reason list responses carry no asset links is
   * that most callers — the pricing quote, the importer, a stock report — never
   * open an image, and signing every asset of every row is work for nobody. A
   * catalogue grid does need them, so it asks: one signature per product at
   * most, bounded by `pageSize`.
   */
  withThumbnails: z
    .union([z.boolean(), z.string()])
    .transform((value) =>
      typeof value === 'boolean' ? value : value === 'true'
    )
    .default(false),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
})

export type ListProductsQueryDto = z.infer<typeof ListProductsQuerySchema>

/**
 * The filters a catalogue export accepts (SOW M-13).
 *
 * The list query's filters, minus paging: an export is the whole result, and a
 * page number on a file download is a way to hand somebody a quarter of their
 * catalogue without saying so. The row cap in `product-csv.ts` is what keeps the
 * download bounded instead.
 */
export const ExportProductsQuerySchema = ListProductsQuerySchema.pick({
  categoryId: true,
  status: true,
  search: true,
})

export type ExportProductsQueryDto = z.infer<typeof ExportProductsQuerySchema>

// --- Options, variants and tiers ---------------------------------------------

/**
 * The whole option set is replaced in one call rather than patched one option
 * at a time.
 *
 * Options and variants have to agree — a variant's `attributes` keys are option
 * names and its values are option values — and a per-option PATCH makes that
 * consistency a sequence of calls the client can abandon halfway through. One
 * call, one transaction, one validation pass.
 */
export const SetProductOptionsSchema = z.object({
  options: z
    .array(
      z.object({
        name: z.string().trim().min(1).max(60),
        values: z
          .array(z.string().trim().min(1).max(120))
          .min(1, 'An option needs at least one value')
          .max(50),
        /**
         * What each value adds to the price of one pack, keyed by value. A
         * value left out adds nothing. Keys must be values of this option —
         * the service refuses a price for a value the option does not offer.
         */
        valuePrices: z
          .record(
            z.string().trim().min(1).max(120),
            z.coerce.number().min(0).max(100_000)
          )
          .default({}),
        sortOrder: z.coerce.number().int().min(0).max(999).default(0),
      })
    )
    .max(
      8,
      'A product with more than eight option axes is a catalogue problem, not a data one'
    ),
})

export type SetProductOptionsDto = z.infer<typeof SetProductOptionsSchema>

export const CreateVariantSchema = z.object({
  sku: Sku,
  /** Option name to chosen value. Validated against the product's options. */
  attributes: z.record(
    z.string().trim().min(1).max(60),
    z.string().trim().min(1).max(120)
  ),
  priceOverride: Money.nullish(),
  sortOrder: z.coerce.number().int().min(0).max(9999).default(0),
})

export type CreateVariantDto = z.infer<typeof CreateVariantSchema>

export const UpdateVariantSchema = z
  .object({
    priceOverride: Money.nullish(),
    status: z.enum(['ACTIVE', 'INACTIVE']).optional(),
    sortOrder: z.coerce.number().int().min(0).max(9999).optional(),
  })
  .refine(
    (value) => Object.keys(value).length > 0,
    'Provide at least one field to update'
  )

export type UpdateVariantDto = z.infer<typeof UpdateVariantSchema>

/** The ladder is replaced wholesale, for the reason given on the option set. */
export const SetVolumeTiersSchema = z.object({
  tiers: z
    .array(
      z.object({
        minQuantity: z.coerce
          .number()
          .int()
          .min(2, 'A tier starting at 1 is just the base price'),
        discountPercent: z.coerce.number().min(0.01).max(100),
      })
    )
    .max(20),
})

export type SetVolumeTiersDto = z.infer<typeof SetVolumeTiersSchema>

// --- Visibility, stock and assets --------------------------------------------

export const SetVisibilitySchema = z
  .object({
    visibility: z.enum(['ALL_ACCOUNTS', 'RESTRICTED']),
    /** Ignored unless RESTRICTED; replaces the whole allow-list. */
    accountIds: z.array(z.string().trim().max(64)).max(500).default([]),
  })
  .refine(
    (value) => value.visibility !== 'RESTRICTED' || value.accountIds.length > 0,
    {
      message:
        'A restricted product needs at least one account, or nobody can order it',
      path: ['accountIds'],
    }
  )

export type SetVisibilityDto = z.infer<typeof SetVisibilitySchema>

/**
 * A signed stock movement, never an absolute figure.
 *
 * Two people counting the same shelf and both submitting "42" is a lost
 * adjustment; both submitting "+3" is not. A recount is expressed as the delta
 * needed to reach the counted figure, and `reason` is mandatory so the audit
 * entry says why.
 */
export const AdjustStockSchema = z.object({
  delta: z.coerce
    .number()
    .int()
    .refine(
      (value) => value !== 0,
      'A stock adjustment of zero changes nothing'
    ),
  reason: z.string().trim().min(1, 'A reason is required').max(200),
  /** Adjusts a variant's stock instead of the product's. */
  variantId: z.string().trim().max(64).optional(),
})

export type AdjustStockDto = z.infer<typeof AdjustStockSchema>

/**
 * Attaches a file from the document library to a product.
 *
 * The library is where artwork lives now, so an asset names a file in it rather
 * than an object the caller uploaded to storage itself. Upload to
 * `POST /api/v1/dam/files` first, then attach what came back.
 *
 * `filename`, `contentType` and `sizeBytes` are deliberately absent: the portal
 * copies the file and reads all three off it, instead of taking the caller's
 * word for them as the presign flow this replaces had to.
 */
export const AttachAssetSchema = DamFileRefSchema.extend({
  kind: z.enum(['IMAGE', 'ARTWORK', 'SPEC_SHEET']).default('IMAGE'),
  altText: z.string().trim().max(300).nullish(),
  sortOrder: z.coerce.number().int().min(0).max(999).default(0),
})

export type AttachAssetDto = z.infer<typeof AttachAssetSchema>

/**
 * Image file names to resolve to products before a bulk image upload.
 *
 * Names only — the files themselves go to the image library and are attached
 * one at a time through `POST /products/:productId/assets`, exactly as a
 * single upload is. `sku` is the administrator's correction for a file whose
 * name does not say which product it is for; when present it is matched as-is
 * and the file name is ignored.
 */
export const MatchImageFilenamesSchema = z.object({
  files: z
    .array(
      z.object({
        filename: z.string().trim().min(1).max(255),
        sku: z
          .string()
          .trim()
          .max(64)
          .optional()
          .transform((value) => (value ? value.toUpperCase() : undefined)),
      })
    )
    .min(1, 'Choose at least one image')
    .max(500, 'Match at most 500 files at a time'),
})

export type MatchImageFilenamesDto = z.infer<typeof MatchImageFilenamesSchema>

// --- Bulk import --------------------------------------------------------------

/**
 * One row of a bulk import.
 *
 * Categories are named by `categoryCode` rather than by id, because the file
 * comes from a spreadsheet a merchandiser maintains and no spreadsheet holds
 * our internal ids.
 */
export const ImportRowSchema = z.object({
  sku: Sku,
  name: z.string().trim().min(1).max(200),
  categoryCode: z
    .string()
    .trim()
    .min(1)
    .max(48)
    .transform((value) => value.toUpperCase()),
  description: z.string().trim().max(4000).optional(),
  basePrice: Money,
  moq: z.coerce.number().int().min(1).default(1),
  orderMultiple: z.coerce.number().int().min(1).default(1),
  packSize: z.coerce.number().int().min(1).default(1),
  uom: UOM.default('EACH'),
  /**
   * Optional, and left alone on an update when absent: a file exported before
   * the column existed must not reset every product it touches to STANDARD.
   */
  taxTreatment: z
    .string()
    .trim()
    .transform((value) => value.toUpperCase())
    .pipe(TaxTreatment)
    .optional()
    .or(z.literal('').transform(() => undefined)),
  widthMm: z.coerce.number().int().min(1).optional(),
  heightMm: z.coerce.number().int().min(1).optional(),
  bleedMm: Millimetres.optional(),
  safeMarginMm: Millimetres.optional(),
  lowStockThreshold: z.coerce.number().int().min(0).default(0),
  leadTimeDays: z.coerce.number().int().min(0).max(365).optional(),
  tags: z
    .union([z.string(), z.array(z.string())])
    .transform((value) => (Array.isArray(value) ? value : value.split('|')))
    .pipe(z.array(z.string().trim().min(1).max(48)).max(30))
    .default([]),
})

export type ImportRowDto = z.infer<typeof ImportRowSchema>

/**
 * Rows are validated individually, so one bad row does not reject the file.
 *
 * The whole run happens on the `import` queue and the response is a job to
 * poll, so the cap is about what is reasonable to hold in one job row rather
 * than about what fits inside a request timeout. Ten thousand rows is already a
 * very large catalogue load; beyond it, split the file.
 */
export const ImportProductsSchema = z.object({
  rows: z
    .array(z.unknown())
    .min(1, 'Nothing to import')
    .max(10_000, 'Import at most 10,000 rows at a time; split the file'),
  /**
   * When false, existing SKUs are reported as skipped rather than updated. The
   * safe default for a first run against an unfamiliar file.
   */
  updateExisting: z.boolean().default(false),
  /**
   * Validate and report without writing anything. Runs on the same queue and
   * through the same code as a real import — a preview built on different logic
   * would be worse than no preview.
   */
  dryRun: z.boolean().default(false),
})

export type ImportProductsDto = z.infer<typeof ImportProductsSchema>

export const ListImportJobsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
})

export type ListImportJobsQueryDto = z.infer<typeof ListImportJobsQuerySchema>

/**
 * A physical stocktake (SOW BE-12).
 *
 * Absolute counts, not deltas — the opposite of `AdjustStockSchema`, and
 * deliberately so. An adjustment says "three arrived"; a stocktake says "there
 * are forty on the shelf", and asking an operator holding a count sheet to
 * work out the difference is how a stocktake introduces the error it exists to
 * remove.
 *
 * Synchronous rather than queued, unlike the catalogue import: whoever is
 * standing in the warehouse needs the variance report now, and a stocktake is
 * hundreds of lines rather than thousands.
 */
export const ReconcileStockSchema = z.object({
  counts: z
    .array(
      z.object({
        sku: Sku,
        countedQuantity: z.coerce.number().int().min(0).max(10_000_000),
        note: z.string().trim().max(500).optional(),
      })
    )
    .min(1, 'Nothing to reconcile')
    .max(1_000, 'Reconcile at most 1,000 lines at a time'),
  /** Report the variances without writing them. */
  dryRun: z.boolean().default(false),
  reason: z.string().trim().min(1, 'Say what this stocktake was').max(500),
})

export type ReconcileStockDto = z.infer<typeof ReconcileStockSchema>
