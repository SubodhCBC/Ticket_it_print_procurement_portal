import { z } from 'zod'
import { PoFormatField } from '../cart/po-format.validation'

/**
 * Every field is optional: the settings screen sends the tab the user saved,
 * not the whole record, and a PATCH that demanded the rest would make two tabs
 * saved in either order overwrite each other.
 */
export const UpdateSettingsSchema = z
  .object({
    // --- Locale -------------------------------------------------------------
    /// ISO 4217, upper-cased. Not an enum: the list of currencies a customer
    /// may invoice in is a business decision, and a rejected code is a worse
    /// failure than an unfamiliar one.
    currency: z
      .string()
      .trim()
      .regex(/^[A-Za-z]{3}$/, 'Currency must be a three-letter ISO 4217 code')
      .transform((v) => v.toUpperCase())
      .optional(),
    /// Validated against the runtime's own zone table rather than a hand-kept
    /// list, which would drift every time a country changed its rules.
    timezone: z
      .string()
      .trim()
      .min(1)
      .refine(isKnownTimeZone, 'Unknown IANA time zone')
      .optional(),

    // --- Ordering -----------------------------------------------------------
    orderNumberPrefix: z.string().trim().max(12).nullable().optional(),
    enforceMoq: z.boolean().optional(),
    allowBackorders: z.boolean().optional(),
    requireDeliveryNotes: z.boolean().optional(),
    /// Buyers may type a one-off delivery address at checkout (SOW F-18, AD-8).
    allowCustomDeliveryAddress: z.boolean().optional(),

    // --- Tax (SOW F-06, A-08) -----------------------------------------------
    /// Whether this account's prices are stated including GST. Applies to
    /// invoices generated from now on; an issued invoice keeps its own.
    pricesIncludeGst: z.boolean().optional(),
    /// A percentage, to two decimals. NZ GST is 15.
    gstRatePercent: z.coerce
      .number()
      .min(0)
      .max(100)
      // Not `multipleOf(0.01)`, which floating point fails for 12.3.
      .refine(
        (value) => Math.abs(value * 100 - Math.round(value * 100)) < 1e-6,
        'The GST rate takes at most two decimal places'
      )
      .optional(),

    // --- Account-level ordering rules, which live on `Account` --------------
    /// Null clears the threshold, meaning nothing needs approval. Zero is a
    /// real setting — everything needs approval — so the two cannot be merged.
    approvalThreshold: z.coerce
      .number()
      .min(0)
      .max(99_999_999)
      .nullable()
      .optional(),
    requirePoNumber: z.boolean().optional(),
    poPrefix: z.string().trim().max(12).nullable().optional(),
    /// The account-wide PO format, e.g. `PO-####-YY`; null or blank clears it.
    poFormat: PoFormatField,
    /// The customer-facing account name, shown as the store name.
    accountName: z.string().trim().min(1).max(200).optional(),

    // --- Notifications ------------------------------------------------------
    sendOrderConfirmations: z.boolean().optional(),
    notificationEmail: z.string().trim().email().nullable().optional(),
    sendLowStockAlerts: z.boolean().optional(),
    lowStockAlertThreshold: z.coerce
      .number()
      .int()
      .min(0)
      .max(1_000_000)
      .optional(),
    sendMonthlyBillingDigest: z.boolean().optional(),

    // --- Session policy -----------------------------------------------------
    /// Five minutes to a day. Shorter than the access token's own 15-minute
    /// life is allowed — the client signing out early is a real choice.
    sessionTimeoutMinutes: z.coerce.number().int().min(5).max(1440).optional(),
    enforceTwoFactor: z.boolean().optional(),
  })
  .strict()

export type UpdateSettingsDto = z.infer<typeof UpdateSettingsSchema>

function isKnownTimeZone(value: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value })
    return true
  } catch {
    return false
  }
}
