import { z } from 'zod'
import { SHIPPING_METHOD_CODES } from './shipping-methods'

import {
  MAX_ORDER_ARTWORK_LENGTH,
  MAX_ORDER_PREVIEW_LENGTH,
  ORDER_ARTWORK_KEY,
  ORDER_BACK_NAME_KEY,
  ORDER_PREVIEW_KEY,
} from '../templates/template-status'

/**
 * Personalisation captured by the template customiser: artwork field values,
 * finish choices, an uploaded asset key.
 *
 * Deliberately opaque — a record of JSON values rather than a modelled shape.
 * The template builder decides what a field is, and pinning the schema here
 * would mean a backend release every time a designer adds a text box. BE-06
 * snapshots it onto the order line and INT-01 sends it to production; neither
 * interprets it either.
 *
 * Bounded, though: a cart line is not a file store.
 */
const MAX_FIELD_LENGTH = 4000

const Customisation = z
  .record(
    z.string().max(120),
    // The upper bound here is the artwork's, because one entry is the artwork.
    // Field values are held to `MAX_FIELD_LENGTH` below, per key, so the looser
    // type never becomes a looser rule for the wording a buyer types.
    z.union([
      z.string().max(MAX_ORDER_ARTWORK_LENGTH),
      z.number(),
      z.boolean(),
      z.null(),
    ])
  )
  .refine(
    (value) => Object.keys(value).length <= 100,
    'At most 100 customisation fields'
  )
  /*
   * One entry is not a field value: the buyer's own artwork.
   *
   * The customiser is a design studio now, so a buyer can move and restyle a
   * design as well as fill it in, and what they end up with belongs to this
   * order rather than to the operator's template. It travels as a serialised
   * design document under a reserved key — tens of thousands of characters of
   * coordinates and styling, where a field value is a line of text.
   *
   * Kilobytes is a design; megabytes is an embedded photograph, which belongs
   * in object storage and is refused.
   */
  .superRefine((value, ctx) => {
    for (const [key, entry] of Object.entries(value)) {
      const isArtwork = key === ORDER_ARTWORK_KEY
      // The two other reserved entries have caps of their own: a thumbnail is
      // bigger than a line of wording, and a back's name is smaller.
      const limit = isArtwork
        ? MAX_ORDER_ARTWORK_LENGTH
        : key === ORDER_PREVIEW_KEY
          ? MAX_ORDER_PREVIEW_LENGTH
          : key === ORDER_BACK_NAME_KEY
            ? 120
            : MAX_FIELD_LENGTH
      if (typeof entry === 'string' && entry.length > limit) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [key],
          message: isArtwork
            ? 'This design is too large to save with the order. ' +
              'Large images belong in the media library rather than inside the artwork.'
            : key === ORDER_PREVIEW_KEY
              ? 'The design preview is too large. Export a smaller thumbnail.'
              : `Must be ${limit} characters or fewer.`,
        })
      }
      if (isArtwork && typeof entry !== 'string' && entry !== null) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [key],
          message: 'Artwork must be a serialised design document.',
        })
      }
    }
  })

/**
 * The artwork a personalised line was made from.
 *
 * Both fields or neither, matching the database's own check. A template id with
 * no version is a line whose artwork cannot be pinned down — the template is a
 * moving draft — and a version with no template is a reference with no subject.
 *
 * The version comes from `POST /templates/:id/customise`, which is what the
 * customiser calls before adding to the basket. Sending one the buyer chose
 * themselves is refused: the service checks it against the template's currently
 * published version.
 */
const templateSelection = {
  templateId: z.string().trim().min(1).max(64).nullish(),
  templateVersionId: z.string().trim().min(1).max(64).nullish(),
}

/** Both set, or both absent. Checked here so a bad request never reaches SQL. */
const bothOrNeither = (body: {
  templateId?: string | null
  templateVersionId?: string | null
}): boolean => (body.templateId == null) === (body.templateVersionId == null)

const PAIRING_MESSAGE =
  'Send templateId and templateVersionId together, or neither. A template id without a ' +
  'version does not say which artwork the buyer saw.'

const Quantity = z.coerce
  .number()
  .int()
  .min(1, 'Quantity must be at least 1')
  .max(10_000_000)

export const AddCartLineSchema = z
  .object({
    productId: z.string().trim().min(1, 'A product is required').max(64),
    /** Required when the product has options; the service checks that. */
    variantId: z.string().trim().max(64).nullish(),
    /**
     * As the buyer typed it. Rounding to the MOQ and order multiple is reported
     * at validation, not applied here — see the note in the migration.
     */
    quantity: Quantity,
    ...templateSelection,
    customisation: Customisation.nullish(),
    notes: z.string().trim().max(1000).nullish(),
  })
  .refine(bothOrNeither, {
    message: PAIRING_MESSAGE,
    path: ['templateVersionId'],
  })

export type AddCartLineDto = z.infer<typeof AddCartLineSchema>

export const UpdateCartLineSchema = z
  .object({
    quantity: Quantity.optional(),
    /**
     * A different configuration of the same product — the buyer changing their
     * stock on the final step. The service checks it belongs to the line's
     * product, as it does on add.
     */
    variantId: z.string().trim().min(1).max(64).optional(),
    ...templateSelection,
    customisation: Customisation.nullish(),
    notes: z.string().trim().max(1000).nullish(),
  })
  .refine(
    (value) => Object.keys(value).length > 0,
    'Provide at least one field to update'
  )
  .refine(bothOrNeither, {
    message: PAIRING_MESSAGE,
    path: ['templateVersionId'],
  })

export type UpdateCartLineDto = z.infer<typeof UpdateCartLineSchema>

const PaymentMethod = z.enum(['NET_30_INVOICE', 'P_CARD', 'ACH'])

/**
 * The checkout stepper's fields (FE-04), all optional so each step can save as
 * the buyer moves through it rather than only at the end.
 *
 * `acceptTerms` is a boolean in and a timestamp out: what has to be recorded is
 * *when* the buyer accepted, and asking the client for that instant would let
 * it send any value it liked.
 */
export const SetCheckoutDetailsSchema = z
  .object({
    /** Which branch the order is for. Head-office buyers choose; site users cannot. */
    siteId: z.string().trim().max(64).nullish(),
    poNumber: z.string().trim().max(64).nullish(),
    campaignCode: z.string().trim().max(64).nullish(),
    /**
     * The buyer's own reference (SOW F-14). Free text: no account format rule,
     * never required. Blank is stored as null, so clearing the field on screen
     * clears it rather than saving an empty string the billing file would print.
     */
    customerReference: z
      .string()
      .trim()
      .max(200)
      .transform((value) => value || null)
      .nullish(),
    notes: z.string().trim().max(4000).nullish(),
    requestedDeliveryDate: z.coerce.date().nullish(),
    shippingAddressId: z.string().trim().max(64).nullish(),
    billingAddressId: z.string().trim().max(64).nullish(),
    paymentMethod: PaymentMethod.nullish(),
    /** How the parcel travels. See `SHIPPING_METHODS` for the codes. */
    shippingMethod: z.enum(SHIPPING_METHOD_CODES).nullish(),
    acceptTerms: z.boolean().optional(),
  })
  .refine(
    (value) => Object.keys(value).length > 0,
    'Provide at least one field to set'
  )

export type SetCheckoutDetailsDto = z.infer<typeof SetCheckoutDetailsSchema>

/**
 * A delivery address typed at checkout rather than chosen from the branch's
 * saved ones (SOW F-18).
 *
 * The same fields and limits as a branch address (`AddressInput` in
 * site.validation.ts), less `kind` and `isDefault`: a one-off is always a
 * SHIPPING address and never anyone's default. Blank optional fields are stored
 * as null rather than as empty strings a label would print.
 */
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((value) => value || null)
    .nullish()

export const SetOneOffDeliveryAddressSchema = z
  .object({
    /**
     * An NZ Post ParcelAddress id from `GET /shipping/addresses` (SOW F-16:
     * "validated through NZ Post ParcelAddress with DPID resolution and
     * rural-delivery flagging"). When sent, the street, suburb, city and postcode
     * come from NZ Post rather than from what was typed, and the basket's NZ Post
     * delivery choice is set to the same address. Optional, so a client that
     * sends only typed fields keeps working.
     */
    nzPostAddressId: z.string().trim().min(1).max(64).optional(),
    label: optionalText(120),
    recipientName: optionalText(160),
    line1: z.string().trim().max(200).optional(),
    line2: optionalText(200),
    city: z.string().trim().max(120).optional(),
    region: optionalText(120),
    postcode: z.string().trim().max(24).optional(),
    country: z
      .string()
      .trim()
      .length(2, 'Use the ISO 3166-1 alpha-2 country code')
      .transform((value) => value.toUpperCase())
      .optional(),
    phone: optionalText(40),
  })
  .superRefine((value, ctx) => {
    // With an NZ Post id the address lines are NZ Post's, so none is required.
    if (value.nzPostAddressId) return

    const required: Array<[keyof typeof value, string]> = [
      ['line1', 'Address line 1 is required'],
      ['city', 'City is required'],
      ['postcode', 'Postcode is required'],
      ['country', 'Use the ISO 3166-1 alpha-2 country code'],
    ]
    for (const [field, message] of required) {
      if (!value[field]) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: [field], message })
      }
    }
  })

export type SetOneOffDeliveryAddressDto = z.infer<
  typeof SetOneOffDeliveryAddressSchema
>

export const CartQuerySchema = z.object({
  /**
   * Which branch's basket. Defaults to the caller's own site; a head-office
   * buyer keeps one basket per branch they order for.
   */
  siteId: z.string().trim().max(64).optional(),
})

export type CartQueryDto = z.infer<typeof CartQuerySchema>

export const ValidateCartQuerySchema = CartQuerySchema.extend({
  /**
   * Also check the details the stepper collects — address, payment, terms.
   * Off by default so the cart page does not complain about an address the
   * buyer has not reached the step for yet.
   */
  forCheckout: z
    .union([z.boolean(), z.enum(['true', 'false'])])
    .transform((value) => value === true || value === 'true')
    .default(false),
})

export type ValidateCartQueryDto = z.infer<typeof ValidateCartQuerySchema>
