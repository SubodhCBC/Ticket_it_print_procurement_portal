'use client'

import { useCallback, useEffect } from 'react'
import { useAppDispatch, useAppSelector } from '@/store/hooks'
import {
  addCartLine,
  cartCheckedOut,
  checkoutValidated,
  clearCart as clearCartThunk,
  clearCartError,
  loadCart,
  normaliseCart,
  removeCartLine,
  saveCheckoutDetails,
  saveOneOffDeliveryAddress,
  setIsCartDrawerOpen,
  setLocalCheckoutFields,
  resumeShopping,
  updateCartLine,
  validateProductQty,
  type CheckoutState,
} from '@/store/cartSlice'
import { clearCheckoutDraft, writeCheckoutDraft } from '@/store/checkoutDraft'
import { useAuth } from '@/hooks/useAuth'
import type {
  ApiCartValidation,
  ApiOneOffDeliveryAddressInput,
} from '@/services/data-source/api/cart.types'
import type { EffectiveProduct, Product } from '@/types'

/**
 * The basket.
 *
 * Every mutation is a request to `/cart` and the response replaces the state,
 * so what a screen renders is what the server holds. The result objects keep
 * the `{ success, error }` shape the screens already branch on, with the
 * server's message rather than a locally invented one.
 *
 * `addItem` still takes a product and a quantity rather than a line id, because
 * that is what a product tile has. Prices passed by callers are ignored: what a
 * line costs is decided by the rate card, not by the page that added it.
 */
export const useCart = () => {
  const dispatch = useAppDispatch()
  const { isAuthenticated, status: authStatus } = useAuth()

  const {
    cartId,
    siteId,
    siteName,
    siteCode,
    items,
    isCartDrawerOpen,
    checkoutState,
    subtotal,
    catalogSubtotal,
    saving,
    shipping,
    shippingOptions,
    total,
    totalCount,
    budget,
    purchaseOrder,
    approval,
    deliveryNotesRequired,
    billTo,
    customDeliveryAddress,
    userBudget,
    issues,
    warnings,
    isValid,
    status,
    isMutating,
    error,
    justCheckedOut,
  } = useAppSelector((state) => state.cart)

  // The cart belongs to the signed-in user, so there is nothing to load until
  // the session is known. Loading once per mount keeps a basket added to in one
  // tab visible after a reload in another.
  useEffect(() => {
    if (authStatus !== 'ready' || !isAuthenticated) return
    if (status !== 'idle') return
    // An order has just been placed and the basket is deliberately empty.
    // Re-fetching here would race the confirmation redirect and send the buyer
    // back to an empty cart having just submitted.
    if (justCheckedOut) return
    void dispatch(loadCart())
  }, [authStatus, isAuthenticated, status, justCheckedOut, dispatch])

  const addItem = useCallback(
    async (
      product: EffectiveProduct | Product,
      qty: number,
      variantId?: string | null
    ) => {
      const local = validateProductQty(product, qty)
      if (local) return { success: false as const, error: local }

      // A configurable product needs one. Caught here so the buyer is told to
      // choose rather than shown the API's refusal.
      if ((product.optionAxes?.length ?? 0) > 0 && !variantId) {
        return {
          success: false as const,
          error: 'Choose an option for this product before adding it.',
        }
      }

      const result = await dispatch(
        addCartLine({
          productId: product.id,
          quantity: qty,
          variantId: variantId ?? null,
        })
      )
      if (addCartLine.fulfilled.match(result)) return { success: true as const }
      return {
        success: false as const,
        error: result.payload ?? 'Could not add that line.',
      }
    },
    [dispatch]
  )

  /** Saves one line's note; null clears it. */
  const updateItemNotes = useCallback(
    async (lineId: string, notes: string | null) => {
      const result = await dispatch(
        updateCartLine({ lineId, input: { notes } })
      )
      if (updateCartLine.fulfilled.match(result))
        return { success: true as const }
      return {
        success: false as const,
        error: result.payload ?? 'Could not save that note.',
      }
    },
    [dispatch]
  )

  /**
   * Addressed by cart line id, not product id: the same SKU can legitimately
   * appear twice when the two runs are personalised differently, and merging
   * them on product id would edit the wrong one.
   */
  const updateItemQty = useCallback(
    async (lineId: string, qty: number) => {
      if (qty <= 0) {
        const removed = await dispatch(removeCartLine(lineId))
        if (removeCartLine.fulfilled.match(removed))
          return { success: true as const }
        return {
          success: false as const,
          error: removed.payload ?? 'Could not remove that line.',
        }
      }

      const result = await dispatch(updateCartLine({ lineId, quantity: qty }))
      if (updateCartLine.fulfilled.match(result))
        return { success: true as const }
      return {
        success: false as const,
        error: result.payload ?? 'Could not update that line.',
      }
    },
    [dispatch]
  )

  const removeItem = useCallback(
    async (lineId: string) => {
      await dispatch(removeCartLine(lineId))
    },
    [dispatch]
  )

  const clearCart = useCallback(async () => {
    await dispatch(clearCartThunk())
  }, [dispatch])

  /** Accepts the MOQ roundings the validation reported. */
  const acceptAdjustments = useCallback(async () => {
    await dispatch(normaliseCart())
  }, [dispatch])

  /**
   * Saves the stepper. Fields the cart holds go to the server; the delivery
   * contact and instructions, which the API carries on the order rather than
   * the basket, stay local until placement — in the store, and in session
   * storage so a reload does not lose them.
   */
  const updateCheckoutState = useCallback(
    async (partial: Partial<CheckoutState>) => {
      dispatch(setLocalCheckoutFields(partial))
      if (cartId) writeCheckoutDraft(cartId, partial)

      const serverFields: (keyof CheckoutState)[] = [
        'poReference',
        'campaignCode',
        'customerReference',
        'notes',
        'requestedDeliveryDate',
        'shippingAddressId',
        'billingAddressId',
        'paymentMethod',
        'shippingMethod',
        'termsAcceptedAt',
      ]

      if (!serverFields.some((field) => field in partial))
        return { success: true as const, validation: null }

      // The server's verdict comes back with the save — the purchase-order
      // check, say — so a step can act on it without waiting for a re-render.
      const result = await dispatch(saveCheckoutDetails(partial))
      if (saveCheckoutDetails.fulfilled.match(result))
        return { success: true as const, validation: result.payload }
      return {
        success: false as const,
        error: result.payload ?? 'Could not save those details.',
      }
    },
    [cartId, dispatch]
  )

  /**
   * Ships to a one-off address typed at checkout. The server decides whether
   * that is allowed; its refusal comes back as the error.
   */
  const setOneOffDeliveryAddress = useCallback(
    async (input: ApiOneOffDeliveryAddressInput) => {
      const result = await dispatch(saveOneOffDeliveryAddress(input))
      if (saveOneOffDeliveryAddress.fulfilled.match(result))
        return { success: true as const }
      return {
        success: false as const,
        error: result.payload ?? 'Could not save that delivery address.',
      }
    },
    [dispatch]
  )

  /**
   * Chooses how the parcel travels.
   *
   * Sent straight to the server, which re-prices the basket, so `shipping` and
   * `total` update from its answer. Nothing is written locally first: a refused
   * choice leaves the previous method showing rather than one the server never
   * accepted.
   */
  const chooseShippingMethod = useCallback(
    async (method: NonNullable<CheckoutState['shippingMethod']>) => {
      const result = await dispatch(
        saveCheckoutDetails({ shippingMethod: method })
      )
      if (saveCheckoutDetails.fulfilled.match(result))
        return { success: true as const }
      return {
        success: false as const,
        error: result.payload ?? 'Could not save that delivery method.',
      }
    },
    [dispatch]
  )

  return {
    cartId,
    siteId,
    siteName,
    siteCode,
    items,
    subtotal,
    catalogSubtotal,
    saving,
    /** The chosen delivery and its price, or null until one is chosen. */
    shipping,
    /** Every delivery method the buyer can choose, with its price. */
    shippingOptions,
    /** Subtotal plus shipping, as the server priced it. */
    total,
    chooseShippingMethod,
    totalCount,
    budget,
    /** The buyer's own monthly limit; null when they have none. */
    userBudget,
    purchaseOrder,
    /** Whether placing the basket now would need approval, and from whom. */
    approval,
    /** `POST /orders` refuses an order without delivery instructions. */
    deliveryNotesRequired,
    /** Who the order will be billed to — the server's answer, not a guess. */
    billTo,
    /** Whether a one-off delivery address may be typed, and the current one. */
    customDeliveryAddress,
    setOneOffDeliveryAddress,
    /** Applies a validation a screen fetched itself; see `checkoutValidated`. */
    applyValidation: useCallback(
      (validation: ApiCartValidation) =>
        dispatch(checkoutValidated(validation)),
      [dispatch]
    ),
    issues,
    warnings,
    isValid,
    /** 'ready' once the basket has been loaded and priced at least once. */
    status,
    isLoading: status !== 'ready',
    /** The basket was emptied by placing an order, not by the buyer. */
    justCheckedOut,
    isMutating,
    error,
    clearError: useCallback(() => dispatch(clearCartError()), [dispatch]),
    isCartDrawerOpen,
    setIsCartDrawerOpen: (open: boolean) => dispatch(setIsCartDrawerOpen(open)),
    addItem,
    updateItemQty,
    updateItemNotes,
    removeItem,
    clearCart,
    acceptAdjustments,
    reload: useCallback(() => {
      dispatch(resumeShopping())
      return dispatch(loadCart())
    }, [dispatch]),
    onCheckedOut: useCallback(() => {
      // The contact and instructions belonged to the basket just placed.
      clearCheckoutDraft()
      return dispatch(cartCheckedOut())
    }, [dispatch]),
    validateQty: validateProductQty,
    checkoutState,
    updateCheckoutState,
  }
}
