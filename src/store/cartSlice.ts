import {
  createAsyncThunk,
  createSlice,
  type PayloadAction,
} from '@reduxjs/toolkit'
import { toApiError } from '@/services'
import * as cartApi from '@/services/data-source/api/api-cart.adapter'
import type {
  ApiApprovalPreview,
  ApiBillTo,
  ApiCart,
  ApiCartIssue,
  ApiCartLine,
  ApiCartValidation,
  ApiCustomDeliveryAddress,
  ApiOneOffDeliveryAddressInput,
  ApiShippingMethod,
  ApiShippingOption,
  ApiValidatedLine,
} from '@/services/data-source/api/cart.types'
import { readCheckoutDraft } from './checkoutDraft'
import type {
  Address,
  CorporatePaymentMethod,
  OrderableProduct,
  Product,
} from '@/types'

/**
 * The basket, held by the server.
 *
 * This slice used to *be* the cart: lines, quantities and prices all lived in
 * browser memory, so a basket vanished on refresh and a line's price was
 * whatever the client had computed. Now it is a cache of `/cart` — every
 * mutation is a request, and the response replaces the state wholesale, because
 * the server is the only thing that knows the rate card, the stock and the
 * branch's budget.
 *
 * Prices are not on the cart. They come from `POST /cart/validate`, which is
 * also what reports the MOQ adjustments, budget position and purchase-order
 * check. See `cart.types.ts` for why a bare read carries none.
 */

export interface CartItem {
  /** The cart line's id — what the API addresses. Not the product id. */
  id: string
  productId: string
  product: Pick<
    Product,
    'id' | 'sku' | 'name' | 'uom' | 'moq' | 'orderMultiple'
  > & {
    packSize: string
    thumbnailUrl: string
    leadTimeDays: number | null
  }
  qty: number
  /** What will actually be ordered once the MOQ and multiple are applied. */
  orderableQty: number
  quantityAdjusted: boolean
  /** Null until the basket has been validated, or when the line cannot be priced. */
  unitPrice: number | null
  lineTotal: number | null
  catalogUnitPrice: number | null
  rateCardName: string | null
  issues: ApiCartIssue[]
  warnings: ApiCartIssue[]
  /**
   * The artwork this line was personalised from, when it was one.
   *
   * Carried into the store so the basket can link back to the customiser —
   * `?line=<id>` — and so a line whose template has been withdrawn can say so
   * before checkout refuses it.
   */
  template: ApiCartLine['template']
  customisation: unknown
  /** The chosen configuration's id, sent back when the buyer changes stock. */
  variantId: string | null
  /** The chosen configuration — `{"Finish": "Gloss Laminate"}` — or null. */
  options: Record<string, string> | null
  /** The buyer's note for this line only, carried to the order line. */
  notes: string | null
}

/** The stepper's fields, mirrored from the cart the server holds. */
export interface CheckoutState {
  poReference: string
  campaignCode?: string
  /** The buyer's own free-text name for the order. */
  customerReference?: string
  projectCode?: string
  notes?: string
  requestedDeliveryDate?: string
  shippingAddressId?: string
  /**
   * The bill-to the delivery step showed, pinned so placement bills exactly
   * that address even if a default changes before the order is placed.
   */
  billingAddressId?: string
  paymentMethod?: CorporatePaymentMethod
  /** How the parcel travels. Saved to the cart; priced by the server. */
  shippingMethod?: ApiShippingMethod
  termsAcceptedAt?: string
  /**
   * Not on the cart — carried to the order at placement, and kept across a
   * reload by `checkoutDraft.ts`.
   */
  deliveryContactName: string
  deliveryContactPhone: string
  deliveryContactEmail?: string
  /**
   * For whoever delivers — sent as `deliveryNotes` on `POST /orders`, printed
   * on the courier label and shown on every order screen. Up to 500 characters.
   */
  deliveryInstructions: string
  /**
   * Retained so existing screens compile. A one-off address is no longer held
   * here: it is saved to the basket through `saveOneOffDeliveryAddress` and
   * read back as `customDeliveryAddress.current`.
   */
  useSavedAddress: boolean
  customShipToAddress?: Address
}

export interface CartBudget {
  cap: number | null
  spent: number
  remaining: number | null
  projected: number
  wouldExceed: boolean
  overage: number
  utilisationPercent: number | null
}

export interface CartPurchaseOrder {
  required: boolean
  prefix: string | null
  /** The shape the reference must have, e.g. `PO-####-YY`. */
  format: string | null
  /** A reference in that shape, for the placeholder. */
  formatExample: string | null
  provided: string | null
  valid: boolean
  message: string | null
}

interface CartState {
  cartId: string | null
  siteId: string | null
  siteName: string | null
  siteCode: string | null
  items: CartItem[]
  isCartDrawerOpen: boolean
  checkoutState: CheckoutState
  /** Priced by the server. Zero until the basket has been validated. */
  subtotal: number
  catalogSubtotal: number
  saving: number
  /** The chosen delivery and what it adds; null until the buyer picks one. */
  shipping: ApiShippingOption | null
  /** Every delivery the buyer can choose, with its price. */
  shippingOptions: ApiShippingOption[]
  /** Subtotal plus shipping: what the order will cost. */
  total: number
  totalCount: number
  budget: CartBudget | null
  /** The buyer's own monthly limit; null when they have none. */
  userBudget: CartBudget | null
  purchaseOrder: CartPurchaseOrder | null
  /** Who the order will be billed to, as the server resolved it. */
  billTo: ApiBillTo | null
  /** Whether a one-off delivery address may be typed, and the one on the basket. */
  customDeliveryAddress: ApiCustomDeliveryAddress
  /**
   * Whether placing the basket now would need approval, and from whom. Null
   * until the basket has been validated. A preview — placement decides again.
   */
  approval: ApiApprovalPreview | null
  /** The account refuses an order placed without delivery instructions. */
  deliveryNotesRequired: boolean
  /** Blocking problems and acceptable adjustments, basket-wide. */
  issues: ApiCartIssue[]
  warnings: ApiCartIssue[]
  isValid: boolean
  status: 'idle' | 'loading' | 'ready'
  isMutating: boolean
  error: string | null
  /**
   * True from the moment an order is placed until the next basket is loaded.
   *
   * An emptied basket and a basket emptied *by checkout* look identical, and
   * the checkout layout redirects out of the stepper on the first. Without this
   * it fires between placing the order and reaching the confirmation page.
   */
  justCheckedOut: boolean
}

const emptyCheckout: CheckoutState = {
  poReference: '',
  deliveryContactName: '',
  deliveryContactPhone: '',
  deliveryInstructions: '',
  useSavedAddress: true,
}

const initialState: CartState = {
  cartId: null,
  siteId: null,
  siteName: null,
  siteCode: null,
  items: [],
  isCartDrawerOpen: false,
  checkoutState: emptyCheckout,
  subtotal: 0,
  catalogSubtotal: 0,
  saving: 0,
  shipping: null,
  shippingOptions: [],
  total: 0,
  totalCount: 0,
  budget: null,
  purchaseOrder: null,
  userBudget: null,
  billTo: null,
  customDeliveryAddress: { allowed: false, current: null },
  approval: null,
  deliveryNotesRequired: false,
  issues: [],
  warnings: [],
  isValid: false,
  status: 'idle',
  isMutating: false,
  error: null,
  justCheckedOut: false,
}

// --- Thunks -------------------------------------------------------------------

const rejectMessage = (error: unknown) => toApiError(error).message

/**
 * Loads the basket and prices it in one go.
 *
 * `validate` returns the cart alongside the pricing, so one call answers both
 * questions; fetching `/cart` first would only produce a flash of unpriced
 * lines.
 */
export const loadCart = createAsyncThunk<
  ApiCartValidation,
  void,
  { rejectValue: string }
>('cart/load', async (_, { dispatch, rejectWithValue }) => {
  try {
    const validation = await cartApi.validate()
    // The contact and instructions typed before a reload. Restored before the
    // basket is applied, which keeps the fields the server does not hold.
    const draft = readCheckoutDraft(validation.cart.id)
    if (draft) dispatch(setLocalCheckoutFields(draft))
    return validation
  } catch (error) {
    return rejectWithValue(rejectMessage(error))
  }
})

/** Re-prices after a mutation. Split out so the reducers stay uniform. */
async function mutateThenValidate(
  mutation: Promise<ApiCart>
): Promise<ApiCartValidation> {
  await mutation
  return cartApi.validate()
}

export const addCartLine = createAsyncThunk<
  ApiCartValidation,
  {
    productId: string
    quantity: number
    variantId?: string | null
    /**
     * The artwork the buyer personalised, and the version they saw. Both or
     * neither — the API refuses one without the other, because a template id
     * alone does not say which artwork the values belong to.
     */
    templateId?: string | null
    templateVersionId?: string | null
    customisation?: Record<string, unknown> | null
  },
  { rejectValue: string }
>('cart/addLine', async (input, { rejectWithValue }) => {
  try {
    return await mutateThenValidate(cartApi.addLine(input))
  } catch (error) {
    return rejectWithValue(rejectMessage(error))
  }
})

export const updateCartLine = createAsyncThunk<
  ApiCartValidation,
  {
    lineId: string
    /** Legacy shorthand: a quantity change on its own. */
    quantity?: number
    /**
     * Anything else the line carries. Used when a buyer re-opens a
     * personalisation and saves it again — the template and version travel with
     * the values, because the server re-checks them together.
     */
    input?: Parameters<typeof cartApi.updateLine>[1]
  },
  { rejectValue: string }
>(
  'cart/updateLine',
  async ({ lineId, quantity, input }, { rejectWithValue }) => {
    try {
      return await mutateThenValidate(
        cartApi.updateLine(lineId, {
          ...(quantity !== undefined ? { quantity } : {}),
          ...(input ?? {}),
        })
      )
    } catch (error) {
      return rejectWithValue(rejectMessage(error))
    }
  }
)

export const removeCartLine = createAsyncThunk<
  ApiCartValidation,
  string,
  { rejectValue: string }
>('cart/removeLine', async (lineId, { rejectWithValue }) => {
  try {
    return await mutateThenValidate(cartApi.removeLine(lineId))
  } catch (error) {
    return rejectWithValue(rejectMessage(error))
  }
})

export const clearCart = createAsyncThunk<
  ApiCartValidation,
  void,
  { rejectValue: string }
>('cart/clear', async (_, { rejectWithValue }) => {
  try {
    return await mutateThenValidate(cartApi.clearCart())
  } catch (error) {
    return rejectWithValue(rejectMessage(error))
  }
})

/** Accepts the MOQ adjustments the validation reported. */
export const normaliseCart = createAsyncThunk<
  ApiCartValidation,
  void,
  { rejectValue: string }
>('cart/normalise', async (_, { rejectWithValue }) => {
  try {
    return await mutateThenValidate(cartApi.normalise())
  } catch (error) {
    return rejectWithValue(rejectMessage(error))
  }
})

/**
 * Saves a step of the checkout stepper.
 *
 * Only the fields the cart actually holds are sent. The delivery contact and
 * instructions are not among them — the API carries those on the order, so they
 * stay in this slice until placement.
 */
export const saveCheckoutDetails = createAsyncThunk<
  ApiCartValidation,
  Partial<CheckoutState>,
  { rejectValue: string }
>('cart/saveDetails', async (partial, { rejectWithValue }) => {
  const body: Parameters<typeof cartApi.setCheckoutDetails>[0] = {}

  if (partial.poReference !== undefined)
    body.poNumber = partial.poReference || null
  if (partial.campaignCode !== undefined)
    body.campaignCode = partial.campaignCode || null
  if (partial.customerReference !== undefined)
    body.customerReference = partial.customerReference || null
  if (partial.notes !== undefined) body.notes = partial.notes || null
  if (partial.requestedDeliveryDate !== undefined) {
    body.requestedDeliveryDate = partial.requestedDeliveryDate || null
  }
  if (partial.billingAddressId !== undefined)
    body.billingAddressId = partial.billingAddressId || null
  if (partial.shippingAddressId !== undefined) {
    body.shippingAddressId = partial.shippingAddressId || null
  }
  if (partial.paymentMethod !== undefined) {
    body.paymentMethod = cartApi.toApiPaymentMethod(partial.paymentMethod)
  }
  if (partial.shippingMethod !== undefined) {
    body.shippingMethod = partial.shippingMethod || null
  }
  // The instant is stamped server-side; the client only says yes or no. An
  // empty string is the buyer un-ticking the box.
  if (partial.termsAcceptedAt !== undefined)
    body.acceptTerms = partial.termsAcceptedAt !== ''

  try {
    if (Object.keys(body).length === 0) return await cartApi.validate()
    return await mutateThenValidate(cartApi.setCheckoutDetails(body))
  } catch (error) {
    return rejectWithValue(rejectMessage(error))
  }
})

/** Ships the basket to an address typed at checkout, then re-validates. */
export const saveOneOffDeliveryAddress = createAsyncThunk<
  ApiCartValidation,
  ApiOneOffDeliveryAddressInput,
  { rejectValue: string }
>('cart/saveOneOffDeliveryAddress', async (input, { rejectWithValue }) => {
  try {
    return await mutateThenValidate(cartApi.setOneOffDeliveryAddress(input))
  } catch (error) {
    return rejectWithValue(rejectMessage(error))
  }
})

// --- Mapping ------------------------------------------------------------------

const PLACEHOLDER_IMAGE = '/product-placeholder.svg'

function toItems(cart: ApiCart, priced: ApiValidatedLine[]): CartItem[] {
  const byLine = new Map(priced.map((line) => [line.lineId, line]))

  return cart.lines.map((line) => {
    const quote = byLine.get(line.id)

    return {
      id: line.id,
      productId: line.productId,
      product: {
        id: line.productId,
        sku: line.sku,
        name: line.name,
        uom: line.uom,
        moq: line.moq,
        orderMultiple: line.orderMultiple,
        packSize: String(line.packSize),
        // The cart carries no images. A tile that needs one loads the product.
        thumbnailUrl: PLACEHOLDER_IMAGE,
        leadTimeDays: line.leadTimeDays,
      },
      qty: line.quantity,
      orderableQty: quote?.orderableQuantity ?? line.quantity,
      quantityAdjusted: quote?.quantityAdjusted ?? false,
      unitPrice: quote?.unitPrice != null ? Number(quote.unitPrice) : null,
      lineTotal: quote?.lineTotal != null ? Number(quote.lineTotal) : null,
      catalogUnitPrice:
        quote?.catalogUnitPrice != null ? Number(quote.catalogUnitPrice) : null,
      rateCardName: quote?.rateCardName ?? null,
      issues: quote?.issues ?? [],
      warnings: quote?.warnings ?? [],
      template: line.template,
      customisation: line.customisation,
      variantId: line.variantId,
      options: line.options ?? null,
      notes: line.notes ?? null,
    }
  })
}

function toCartBudget(budget: ApiCartValidation['budget']): CartBudget {
  return {
    cap: budget.cap === null ? null : Number(budget.cap),
    spent: Number(budget.spent),
    remaining: budget.remaining === null ? null : Number(budget.remaining),
    projected: Number(budget.projected),
    wouldExceed: budget.wouldExceed,
    overage: Number(budget.overage),
    utilisationPercent: budget.utilisationPercent,
  }
}

function applyValidation(
  state: CartState,
  validation: ApiCartValidation
): void {
  const { cart } = validation

  state.cartId = cart.id
  state.siteId = cart.site?.id ?? null
  state.siteName = cart.site?.name ?? null
  state.siteCode = cart.site?.code ?? null
  state.items = toItems(cart, validation.lines)
  state.subtotal = Number(validation.subtotal)
  state.catalogSubtotal = Number(validation.catalogSubtotal)
  state.saving = Number(validation.saving)
  state.shipping = validation.shipping ?? null
  state.shippingOptions = validation.shippingOptions ?? []
  // Older responses carry no total; the subtotal is what they cost.
  state.total = Number(validation.total ?? validation.subtotal)
  state.totalCount = cart.itemCount
  state.issues = validation.issues
  state.warnings = validation.warnings
  state.isValid = validation.valid

  state.budget = toCartBudget(validation.budget)
  state.userBudget = validation.userBudget
    ? toCartBudget(validation.userBudget)
    : null

  state.approval = validation.approval ?? null
  state.deliveryNotesRequired = validation.deliveryNotesRequired ?? false
  state.billTo = validation.billTo ?? null
  state.customDeliveryAddress = validation.customDeliveryAddress ?? {
    allowed: false,
    current: null,
  }

  state.purchaseOrder = {
    required: validation.purchaseOrder.required,
    prefix: validation.purchaseOrder.prefix,
    format: validation.purchaseOrder.format ?? null,
    formatExample: validation.purchaseOrder.formatExample ?? null,
    provided: validation.purchaseOrder.provided,
    valid: validation.purchaseOrder.valid,
    message: validation.purchaseOrder.message,
  }

  // The server's copy of the stepper wins; the contact fields it does not hold
  // are left as the buyer typed them.
  state.checkoutState = {
    ...state.checkoutState,
    poReference: cart.poNumber ?? '',
    ...(cart.campaignCode
      ? { campaignCode: cart.campaignCode }
      : { campaignCode: undefined }),
    customerReference: cart.customerReference ?? undefined,
    ...(cart.notes ? { notes: cart.notes } : { notes: undefined }),
    requestedDeliveryDate: cart.requestedDeliveryDate ?? undefined,
    shippingAddressId: cart.shippingAddressId ?? undefined,
    billingAddressId: cart.billingAddressId ?? undefined,
    paymentMethod: cartApi.fromApiPaymentMethod(cart.paymentMethod),
    shippingMethod: cart.shippingMethod ?? undefined,
    termsAcceptedAt: cart.termsAcceptedAt ?? undefined,
  }

  state.status = 'ready'
  state.error = null
}

// --- Slice --------------------------------------------------------------------

const cartSlice = createSlice({
  name: 'cart',
  initialState,
  reducers: {
    setIsCartDrawerOpen: (state, action: PayloadAction<boolean>) => {
      state.isCartDrawerOpen = action.payload
    },
    /**
     * The contact fields the API keeps on the order rather than the cart. Held
     * locally until placement; everything else goes through the server.
     */
    setLocalCheckoutFields: (
      state,
      action: PayloadAction<Partial<CheckoutState>>
    ) => {
      state.checkoutState = { ...state.checkoutState, ...action.payload }
    },
    clearCartError: (state) => {
      state.error = null
    },
    /**
     * A validation a screen fetched itself — the review step's readiness check
     * and its last look before submitting — applied like any other, so the
     * figures on screen are the ones that check just priced.
     *
     * Ignored when it describes a different basket: the one under review has
     * been placed or replaced, and swapping it in would empty the page (and
     * trip the checkout guard) while the submit that knows why is still
     * running.
     */
    checkoutValidated: (state, action: PayloadAction<ApiCartValidation>) => {
      if (state.cartId !== null && action.payload.cart.id !== state.cartId)
        return
      applyValidation(state, action.payload)
    },
    /** Called after an order is placed: the basket is closed server-side. */
    cartCheckedOut: (state) => {
      Object.assign(state, initialState, {
        isCartDrawerOpen: false,
        justCheckedOut: true,
      })
    },
    /**
     * Ends the just-checked-out window, so the basket loads again.
     *
     * Explicit rather than time-based: the flag exists to stop the checkout
     * guard firing between placing an order and reaching the confirmation
     * page, and a timeout would make that a race with a slower render.
     */
    resumeShopping: (state) => {
      state.justCheckedOut = false
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(loadCart.pending, (state) => {
        if (state.status === 'idle') state.status = 'loading'
      })
      .addCase(loadCart.fulfilled, (state, action) => {
        applyValidation(state, action.payload)
      })
      .addCase(loadCart.rejected, (state, action) => {
        state.status = 'ready'
        state.error = action.payload ?? 'Could not load your basket.'
      })

    for (const thunk of [
      addCartLine,
      updateCartLine,
      removeCartLine,
      clearCart,
      normaliseCart,
      saveCheckoutDetails,
      saveOneOffDeliveryAddress,
    ]) {
      builder
        .addCase(thunk.pending, (state) => {
          state.isMutating = true
          state.error = null
        })
        .addCase(thunk.fulfilled, (state, action) => {
          state.isMutating = false
          state.justCheckedOut = false
          applyValidation(state, action.payload as ApiCartValidation)
        })
        .addCase(thunk.rejected, (state, action) => {
          state.isMutating = false
          state.error =
            (action.payload as string) ?? 'Could not update your basket.'
        })
    }
  },
})

export const {
  setIsCartDrawerOpen,
  setLocalCheckoutFields,
  clearCartError,
  checkoutValidated,
  cartCheckedOut,
  resumeShopping,
} = cartSlice.actions

/**
 * A client-side pre-check, kept so a buyer sees an obviously bad quantity
 * before a round trip. Advisory only: the server re-checks every line, and its
 * answer is the one that decides what gets ordered.
 */
export const validateProductQty = (
  product: OrderableProduct & { status?: Product['status'] },
  qty: number
): string | null => {
  // A cart line has no status of its own — the API reports an unorderable
  // product as a line issue instead, which is more current than anything the
  // client is holding.
  if (product.status && product.status !== 'ACTIVE') {
    return `Product is ${product.status.toLowerCase()} and cannot be ordered.`
  }

  const moq = product.moq || 1
  const multiple = product.orderMultiple || 1

  if (qty < moq)
    return `Minimum order quantity (MOQ) is ${moq} ${product.uom || 'units'}.`

  if (multiple > 1 && (qty - moq) % multiple !== 0) {
    return `Quantity must be in multiples of ${multiple} (e.g. ${moq}, ${moq + multiple}, ${moq + multiple * 2}).`
  }

  return null
}

export default cartSlice.reducer
