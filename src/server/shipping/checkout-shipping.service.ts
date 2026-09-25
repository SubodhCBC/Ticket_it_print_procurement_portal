import { Prisma } from '@prisma/client'
import { openCart, type FullCart } from '../cart/cart.service'
import { getConfig } from '../config'
import type { AuthenticatedActor } from '../context/request-context'
import { prisma, withTenantScope } from '../db/client'
import { fromJsonOr, toJson } from '../db/json-column'
import { BusinessRuleError, NotFoundError } from '../utils/errors'
import { carrierFor } from './carrier'
import type {
  AddressSuggestion,
  CollectionPoint,
  RateOption,
  StructuredAddress,
  ValidatedAddress,
} from './carrier.types'
import { toAppError } from './nzpost/nzpost.errors'
import { isShippingEnabled } from './nzpost/nzpost.settings'
import { estimateParcel, toMoney, type ParcelEstimate } from './shipping-rules'
import {
  toDeliveryChoiceView,
  type CartShippingView,
  type ShippingOptionsView,
} from './shipping.types'
import type {
  AddressSearchQueryDto,
  CollectionPointsQueryDto,
  SelectCollectionPointDto,
  SelectDeliveryAddressDto,
  SelectShippingServiceDto,
} from './shipping.validation'

/**
 * The buyer's side of NZ Post: address, rates, collection point (SOW INT-02,
 * INT-03, INT-07).
 *
 * ---------------------------------------------------------------------------
 * Never a reason checkout fails
 * ---------------------------------------------------------------------------
 * Every call here can be skipped. A basket with no NZ Post selection places an
 * order exactly as it did before this integration; staff enter the address on
 * the label form instead. If NZ Post is slow or down, rates fall back to the
 * configured flat rate (SOW §7.2) and then to "no quote" — the buyer is told,
 * and carries on.
 *
 * ---------------------------------------------------------------------------
 * Nothing from the client is trusted as a fact about an address or a price
 * ---------------------------------------------------------------------------
 * The client sends identifiers: an NZ Post address id, a service code, a
 * collection point id. The address details, the price and the point's address
 * are all fetched again from the carrier here, so none of them can be edited on
 * the way back.
 *
 * The basket is resolved the same way the cart service resolves it — from the
 * caller and the branch — so one colleague cannot reach another's selection.
 */

// --- Address ------------------------------------------------------------------

export async function searchAddresses(
  query: AddressSearchQueryDto
): Promise<readonly AddressSuggestion[]> {
  try {
    return await carrierFor('address').searchAddresses(query.q, query.count)
  } catch (error) {
    throw toAppError(error, 'address search')
  }
}

export async function getAddressDetails(
  addressId: string
): Promise<ValidatedAddress> {
  try {
    return await carrierFor('address').getAddress(addressId)
  } catch (error) {
    throw toAppError(error, 'address')
  }
}

export async function getCartShipping(
  actor: AuthenticatedActor,
  siteId?: string
): Promise<CartShippingView> {
  const cart = await openCart(actor, siteId)
  return viewFor(actor, cart)
}

/**
 * Validates an address through ParcelAddress and makes it this basket's
 * delivery address for NZ Post.
 *
 * Choosing an address clears the service, the quote and any collection point:
 * each of those was priced or chosen for the previous address, and a quote kept
 * across an address change is a number for somewhere else.
 */
export async function selectDeliveryAddress(
  actor: AuthenticatedActor,
  dto: SelectDeliveryAddressDto,
  siteId?: string
): Promise<CartShippingView> {
  const cart = await openCart(actor, siteId)
  const address = await getAddressDetails(dto.addressId)

  // The saved ship-to has been validated, so there is exactly one place this
  // basket goes. A different NZ Post address would put one place on the order
  // and another on the label.
  const shipTo = cart.shippingAddress
  if (shipTo?.dpid && address.dpid && shipTo.dpid !== address.dpid) {
    throw new BusinessRuleError(
      'That is not the delivery address chosen for this order. Choose that address, or change the delivery address first.',
      {
        details: {
          shippingAddressId: shipTo.id,
          shipToDpid: shipTo.dpid,
          chosenDpid: address.dpid,
        },
      }
    )
  }

  return applyValidatedDeliveryAddress(actor, cart, address)
}

/**
 * Keeps the basket's NZ Post choice in step with its saved ship-to, after the
 * ship-to changed (SOW F-16).
 *
 * A validated ship-to becomes the NZ Post choice, so the DPID and rural flag the
 * label uses are the address's own and nobody searches for it a second time. An
 * unvalidated one clears any previous choice, which described the address before
 * — the buyer can still pick one from the type-ahead. When NZ Post cannot be
 * reached the choice is cleared rather than failing the change: shipping is never
 * a reason checkout stops.
 */
export async function syncDeliveryChoiceToShipTo(
  actor: AuthenticatedActor,
  cart: FullCart
): Promise<void> {
  await withTenantScope(actor.accountId, (tx) =>
    tx.cartShippingSelection.deleteMany({ where: { cartId: cart.id } })
  )

  const addressId = cart.shippingAddress?.nzPostAddressId
  if (!addressId) return

  try {
    await applyValidatedDeliveryAddress(
      actor,
      cart,
      await getAddressDetails(addressId)
    )
  } catch (error) {
    console.warn(
      `Delivery choice not refreshed for cart ${cart.id}: ` +
        (error instanceof Error ? error.message : String(error))
    )
  }
}

/**
 * Makes an address NZ Post has already validated this basket's delivery address
 * for NZ Post — the DPID, the rural flag and the structured address a label is
 * sent with.
 *
 * Split out of `selectDeliveryAddress` for the one-off address a buyer types
 * (SOW F-18): that route fetches the NZ Post record once to build the address
 * row, and records the same record here, so the order's snapshot and the label
 * describe the same place without asking NZ Post twice.
 */
export async function applyValidatedDeliveryAddress(
  actor: AuthenticatedActor,
  cart: FullCart,
  address: ValidatedAddress
): Promise<CartShippingView> {
  const structured: StructuredAddress = {
    streetNumber: address.streetNumber,
    street: address.street,
    suburb: address.suburb,
    city: address.city,
    postcode: address.postcode,
    countryCode: 'NZ',
  }

  const values = {
    deliveryKind: 'ADDRESS',
    nzPostAddressId: address.addressId,
    dpid: address.dpid,
    isRural: address.isRural,
    fullAddress: address.fullAddress.slice(0, 500),
    deliveryAddress: toJson(structured),
    ...CLEARED_COLLECTION,
    ...CLEARED_QUOTE,
  }

  await withTenantScope(actor.accountId, (tx) =>
    tx.cartShippingSelection.upsert({
      where: { cartId: cart.id },
      create: { cartId: cart.id, accountId: actor.accountId, ...values },
      update: values,
    })
  )

  return viewFor(actor, cart)
}

/** Forgets the basket's NZ Post choice entirely. */
export async function clearCartShipping(
  actor: AuthenticatedActor,
  siteId?: string
): Promise<CartShippingView> {
  const cart = await openCart(actor, siteId)
  await withTenantScope(actor.accountId, (tx) =>
    tx.cartShippingSelection.deleteMany({ where: { cartId: cart.id } })
  )
  return viewFor(actor, cart)
}

// --- Rates --------------------------------------------------------------------

export async function listShippingOptions(
  actor: AuthenticatedActor,
  siteId?: string
): Promise<ShippingOptionsView> {
  const cart = await openCart(actor, siteId)
  const selection = await requireSelection(actor, cart)
  return quoteFor(cart, selection.nzPostAddressId)
}

/**
 * Records the chosen service and its price, looked up again rather than taken
 * from the client.
 *
 * A record, not a charge (decision D4): it reaches `order_shipping` at
 * placement and goes no further — not the order total, not the branch budget,
 * not the invoice.
 */
export async function selectShippingService(
  actor: AuthenticatedActor,
  dto: SelectShippingServiceDto,
  siteId?: string
): Promise<CartShippingView> {
  const cart = await openCart(actor, siteId)
  const selection = await requireSelection(actor, cart)
  const quote = await quoteFor(cart, selection.nzPostAddressId)

  const option = quote.options.find(
    (candidate) => candidate.serviceCode === dto.serviceCode
  )
  if (!option) {
    throw new BusinessRuleError(
      quote.options.length === 0
        ? 'No delivery options are available for this address right now.'
        : 'That delivery option is not available for this address.',
      {
        details: {
          serviceCode: dto.serviceCode,
          available: quote.options.map((candidate) => candidate.serviceCode),
          source: quote.source,
        },
      }
    )
  }

  await withTenantScope(actor.accountId, (tx) =>
    tx.cartShippingSelection.update({
      where: { cartId: cart.id },
      data: {
        serviceCode: option.serviceCode,
        serviceDescription: option.description.slice(0, 255),
        quoteSource: quote.source === 'FLAT_RATE' ? 'FLAT_RATE' : 'NZPOST',
        quotedPriceExclGst: option.totalExclGst,
        quotedPriceInclGst: option.totalInclGst,
        quotedAt: new Date(),
        parcelEstimate: toJson(quote.parcelEstimate),
      },
    })
  )

  return viewFor(actor, cart)
}

// --- Collection points ----------------------------------------------------------

export async function listCollectionPoints(
  actor: AuthenticatedActor,
  query: CollectionPointsQueryDto
): Promise<readonly CollectionPoint[]> {
  const cart = await openCart(actor, query.siteId)
  const selection = await requireSelection(actor, cart)
  return collectionPointsNear(selection.nzPostAddressId, query.count)
}

/**
 * Chooses a collection point near the validated address, or goes back to
 * delivery to the address with `null`.
 *
 * The point is looked up again by id among the ones NZ Post offers for this
 * address, so a client cannot send a point of its own invention. Changing it
 * clears the quote, for the same reason an address change does.
 */
export async function selectCollectionPoint(
  actor: AuthenticatedActor,
  dto: SelectCollectionPointDto,
  siteId?: string
): Promise<CartShippingView> {
  const cart = await openCart(actor, siteId)
  const selection = await requireSelection(actor, cart)

  if (dto.collectionPointId === null) {
    await withTenantScope(actor.accountId, (tx) =>
      tx.cartShippingSelection.update({
        where: { cartId: cart.id },
        data: {
          deliveryKind: 'ADDRESS',
          ...CLEARED_COLLECTION,
          ...CLEARED_QUOTE,
        },
      })
    )
    return viewFor(actor, cart)
  }

  const points = await collectionPointsNear(selection.nzPostAddressId, 20)
  const point = points.find(
    (candidate) => candidate.id === dto.collectionPointId
  )
  if (!point) throw new NotFoundError('Collection point')

  await withTenantScope(actor.accountId, (tx) =>
    tx.cartShippingSelection.update({
      where: { cartId: cart.id },
      data: {
        deliveryKind: 'COLLECTION',
        collectionPointId: point.id,
        collectionPoint: toJson(point),
        ...CLEARED_QUOTE,
      },
    })
  )
  return viewFor(actor, cart)
}

// --- Internals ----------------------------------------------------------------

const CLEARED_QUOTE = {
  serviceCode: null,
  serviceDescription: null,
  quoteSource: null,
  quotedPriceExclGst: null,
  quotedPriceInclGst: null,
  quotedAt: null,
  parcelEstimate: null,
} satisfies Prisma.CartShippingSelectionUpdateInput

const CLEARED_COLLECTION = {
  collectionPointId: null,
  collectionPoint: null,
} satisfies Prisma.CartShippingSelectionUpdateInput

async function requireSelection(
  actor: AuthenticatedActor,
  cart: FullCart
): Promise<{ nzPostAddressId: string }> {
  const selection = await withTenantScope(actor.accountId, (tx) =>
    tx.cartShippingSelection.findUnique({ where: { cartId: cart.id } })
  )
  if (!selection?.nzPostAddressId) {
    throw new BusinessRuleError(
      'Choose the delivery address from the NZ Post suggestions first.'
    )
  }
  return { nzPostAddressId: selection.nzPostAddressId }
}

async function collectionPointsNear(
  addressId: string,
  count: number
): Promise<readonly CollectionPoint[]> {
  try {
    return await carrierFor('collection').collectionPoints(addressId, count)
  } catch (error) {
    throw toAppError(error, 'collection points')
  }
}

/**
 * Live rates, or the flat rate, or nothing — in that order, and never an error.
 *
 * Anything that stops a live quote falls through: NZ Post down, the API not yet
 * approved for this application, the pickup reference not configured. The
 * reason is logged for an operator and summarised for the buyer.
 */
async function quoteFor(
  cart: FullCart,
  deliveryAddressId: string
): Promise<ShippingOptionsView> {
  const estimate = await estimateForCart(cart)
  const nz = getConfig().nzPost

  if (isShippingEnabled()) {
    try {
      const options = await carrierFor('rates').quoteDomestic({
        pickup: {
          ...(nz.siteCode ? { siteCode: nz.siteCode } : {}),
          ...(nz.pickupAddress.suburb
            ? { suburb: nz.pickupAddress.suburb }
            : {}),
          ...(nz.pickupAddress.city ? { city: nz.pickupAddress.city } : {}),
          ...(nz.pickupAddress.postcode
            ? { postcode: nz.pickupAddress.postcode }
            : {}),
        },
        deliveryAddressId,
        weightKg: estimate.weightGrams / 1000,
        lengthCm: estimate.lengthCm,
        widthCm: estimate.widthCm,
        heightCm: estimate.heightCm,
      })

      const usable = options.filter((option) => option.serviceCode.length > 0)
      if (usable.length > 0) {
        return {
          source: 'NZPOST',
          options: usable,
          parcelEstimate: estimate,
          message:
            estimate.missingWeightSkus.length > 0
              ? 'Some items have no recorded weight, so this is an estimate. The final weight is measured when the order is packed.'
              : null,
          freightBilled: false,
        }
      }
      console.warn(
        `NZ Post returned no services for address ${deliveryAddressId}; offering the flat rate.`
      )
    } catch (error) {
      const translated = toAppError(error, 'rates')
      console.warn(
        `Live NZ Post rates unavailable for address ${deliveryAddressId}; offering the flat rate. ` +
          (translated instanceof Error
            ? translated.message
            : String(translated))
      )
    }
  }

  const flat = flatRateOption()
  return flat
    ? {
        source: 'FLAT_RATE',
        options: [flat],
        parcelEstimate: estimate,
        message:
          'Live delivery rates are unavailable right now, so a standard flat rate is shown.',
        freightBilled: false,
      }
    : {
        source: 'UNAVAILABLE',
        options: [],
        parcelEstimate: estimate,
        message:
          'Delivery rates are unavailable right now. You can still place the order; delivery is arranged when it is packed.',
        freightBilled: false,
      }
}

function flatRateOption(): RateOption | null {
  const { fallbackRate } = getConfig().nzPost
  const incl = toMoney(fallbackRate.priceInclGst)
  if (incl === null) return null

  // NZ GST is 15%. The flat rate is configured including it because that is the
  // number a person reads off a rate card.
  const excl = toMoney(Number(incl) / 1.15) ?? '0.00'
  return {
    carrier: 'CourierPost',
    serviceCode: fallbackRate.serviceCode,
    description: fallbackRate.serviceName,
    priceExclGst: excl,
    priceInclGst: incl,
    mandatoryAddons: [],
    totalExclGst: excl,
    totalInclGst: incl,
    trackingIncluded: true,
    signatureIncluded: false,
  }
}

/**
 * The basket as one parcel. Weights are read from the products because the
 * basket's product join does not carry them, and products are platform rows
 * outside any tenant scope.
 */
async function estimateForCart(cart: FullCart): Promise<ParcelEstimate> {
  const productIds = [...new Set(cart.lines.map((line) => line.productId))]
  const products = productIds.length
    ? await prisma.product.findMany({
        where: { id: { in: productIds } },
        select: { id: true, sku: true, weightGrams: true },
      })
    : []
  const byId = new Map(products.map((product) => [product.id, product]))

  return estimateParcel(
    cart.lines.map((line) => ({
      sku: byId.get(line.productId)?.sku ?? line.product.sku,
      quantity: line.quantity,
      weightGrams: byId.get(line.productId)?.weightGrams ?? null,
    })),
    getConfig().nzPost.defaultParcelCm
  )
}

async function viewFor(
  actor: AuthenticatedActor,
  cart: FullCart
): Promise<CartShippingView> {
  const selection = await withTenantScope(actor.accountId, (tx) =>
    tx.cartShippingSelection.findUnique({ where: { cartId: cart.id } })
  )

  const chosen = fromJsonOr<StructuredAddress | null>(
    selection?.deliveryAddress,
    null
  )
  const saved = cart.shippingAddress?.postcode?.trim() ?? null
  const savedDpid = cart.shippingAddress?.dpid ?? null

  return {
    cartId: cart.id,
    siteId: cart.siteId,
    selection: selection ? toDeliveryChoiceView(selection) : null,
    // By DPID when both sides have one — an exact answer — and by postcode
    // otherwise, which is the best an unvalidated saved address allows.
    matchesSavedAddress:
      savedDpid && selection?.dpid
        ? savedDpid === selection.dpid
        : chosen && saved
          ? chosen.postcode.trim() === saved
          : null,
  }
}

/**
 * NZ Post's record for every distinct id given, keyed by id — for the routes
 * that save addresses. Fetched before anything is written, so an id NZ Post
 * does not recognise refuses the request instead of leaving half of it saved.
 */
export async function fetchValidatedAddresses(
  addressIds: readonly (string | undefined)[]
): Promise<Map<string, ValidatedAddress>> {
  const ids = [...new Set(addressIds.filter((id): id is string => Boolean(id)))]
  const records = await Promise.all(ids.map((id) => getAddressDetails(id)))
  return new Map(ids.map((id, index) => [id, records[index]]))
}
