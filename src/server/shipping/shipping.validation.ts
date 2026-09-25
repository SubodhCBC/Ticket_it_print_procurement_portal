import { z } from 'zod'
import { CartQuerySchema } from '../cart/cart.validation'

const booleanQuery = z
  .union([z.boolean(), z.enum(['true', 'false'])])
  .transform((value) => value === true || value === 'true')
  .default(false)

const page = {
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
}

// --- Checkout ---------------------------------------------------------------

/**
 * The address type-ahead.
 *
 * Four characters because ParcelAddress refuses fewer ("Address prefix must be
 * at least 4 characters"). NZ Post's own guidance is to start calling after five
 * typed characters; that is the client's debounce to choose, and this only
 * refuses what NZ Post would refuse anyway.
 */
export const AddressSearchQuerySchema = z.object({
  q: z
    .string()
    .trim()
    .min(4, 'Type at least 4 characters of the address')
    .max(120),
  count: z.coerce.number().int().min(1).max(20).default(8),
})

export type AddressSearchQueryDto = z.infer<typeof AddressSearchQuerySchema>

/** An `addressId` from the type-ahead — never an address the client typed. */
export const SelectDeliveryAddressSchema = z.object({
  addressId: z.string().trim().min(1).max(64),
})

export type SelectDeliveryAddressDto = z.infer<
  typeof SelectDeliveryAddressSchema
>

/**
 * A service code from the options list. The price is looked up again rather
 * than accepted from the client, so a quote cannot be edited on its way back.
 */
export const SelectShippingServiceSchema = z.object({
  serviceCode: z.string().trim().min(1).max(32),
})

export type SelectShippingServiceDto = z.infer<
  typeof SelectShippingServiceSchema
>

export const CollectionPointsQuerySchema = CartQuerySchema.extend({
  count: z.coerce.number().int().min(1).max(20).default(5),
})

export type CollectionPointsQueryDto = z.infer<
  typeof CollectionPointsQuerySchema
>

/** Null goes back to delivery to the address. */
export const SelectCollectionPointSchema = z.object({
  collectionPointId: z.string().trim().min(1).max(64).nullable(),
})

export type SelectCollectionPointDto = z.infer<
  typeof SelectCollectionPointSchema
>

// --- Labels -----------------------------------------------------------------

const optionalText = (max: number) => z.string().trim().max(max).nullish()

/**
 * A delivery address in the parts ParcelLabel wants, for an order whose
 * checkout did not go through the NZ Post type-ahead.
 */
export const StructuredAddressSchema = z.object({
  companyName: optionalText(120),
  buildingName: optionalText(60),
  unitType: optionalText(30),
  unitValue: optionalText(30),
  floor: optionalText(30),
  streetNumber: z.string().trim().min(1, 'Street number is required').max(20),
  street: z.string().trim().min(1, 'Street is required').max(120),
  suburb: z
    .string()
    .trim()
    .max(80)
    .nullish()
    .transform((value) => value ?? null),
  city: z.string().trim().min(1, 'City is required').max(80),
  postcode: z
    .string()
    .trim()
    .regex(/^\d{4}$/, 'A New Zealand postcode is four digits'),
  countryCode: z.literal('NZ').default('NZ'),
})

/**
 * One box, as measured by whoever packed it (decision D2). Centimetres and
 * kilograms because that is what is on the tape measure and the scale.
 */
const ParcelSchema = z.object({
  weightKg: z.coerce
    .number()
    .positive('Weight must be more than zero')
    .max(1000),
  lengthCm: z.coerce.number().positive().max(1000),
  widthCm: z.coerce.number().positive().max(1000),
  heightCm: z.coerce.number().positive().max(1000),
  description: z.string().trim().max(100).nullish(),
})

export const CreateShipmentSchema = z.object({
  parcels: z.array(ParcelSchema).min(1, 'At least one parcel').max(20),
  /** Defaults to the service the buyer chose, then to NZPOST_DEFAULT_SERVICE_CODE. */
  serviceCode: z.string().trim().min(1).max(32).optional(),
  /** Only needed when the order has no NZ Post-validated address. */
  deliveryAddress: StructuredAddressSchema.optional(),
  instructions: z.string().trim().max(500).nullish(),
  /** Send the same key again and the same shipment comes back. */
  idempotencyKey: z.string().trim().min(8).max(128).optional(),
})

export type CreateShipmentDto = z.infer<typeof CreateShipmentSchema>

export const VoidShipmentSchema = z.object({
  reason: z
    .string()
    .trim()
    .min(3, 'Say why the label is being voided')
    .max(500),
})

export type VoidShipmentDto = z.infer<typeof VoidShipmentSchema>

export const ListShipmentsQuerySchema = z.object({
  status: z
    .enum(['PENDING', 'SUBMITTED', 'LABELLED', 'FAILED', 'VOIDED'])
    .optional(),
  /** Labelled, not voided, and not yet on a pickup booking. */
  awaitingPickup: booleanQuery,
  /** Labelled and flagged by the daily check as not scanned in time. */
  flagged: booleanQuery,
  /** Administrators only; everyone else is pinned to their own account. */
  accountId: z.string().trim().max(64).optional(),
  ...page,
})

export type ListShipmentsQueryDto = z.infer<typeof ListShipmentsQuerySchema>

// --- Pickups ----------------------------------------------------------------

export const BookPickupSchema = z
  .object({
    /** When the courier should come. ISO 8601 with an offset. */
    pickupAt: z.coerce.date(),
    /** Defaults to every labelled shipment not yet on a booking. */
    shipmentIds: z
      .array(z.string().trim().min(1).max(64))
      .min(1)
      .max(200)
      .optional(),
    instructions: z.string().trim().max(500).nullish(),
    idempotencyKey: z.string().trim().min(8).max(128).optional(),
  })
  .refine((value) => value.pickupAt.getTime() > Date.now() - 5 * 60_000, {
    message: 'A pickup has to be booked for a time that has not passed',
    path: ['pickupAt'],
  })

export type BookPickupDto = z.infer<typeof BookPickupSchema>

export const ListPickupsQuerySchema = z.object({ ...page })

export type ListPickupsQueryDto = z.infer<typeof ListPickupsQuerySchema>

// --- Integration ------------------------------------------------------------

export const ShippingStatusQuerySchema = z.object({
  /** Also fetch (or reuse) an OAuth token, to prove the credentials work. */
  probe: booleanQuery,
})

export type ShippingStatusQueryDto = z.infer<typeof ShippingStatusQuerySchema>
