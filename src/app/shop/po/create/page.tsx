// src/app/shop/po/create/page.tsx
'use client'

import { SkeletonDetail } from '@/components/ui/Skeleton'
import React, {
  useState,
  useEffect,
  useMemo,
  useRef,
  useSyncExternalStore,
} from 'react'
import Link from 'next/link'
import {
  Truck,
  DollarSign,
  ShieldCheck,
  ArrowLeft,
  Plus,
  Minus,
  Lock,
} from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/hooks/useAuth'
import { useAppDispatch } from '@/store/hooks'
import {
  addCartLine,
  saveCheckoutDetails,
  updateCartLine,
} from '@/store/cartSlice'
import { useCart } from '@/hooks/useCart'
import {
  describePlacementFailure,
  placeReviewedOrder,
} from '@/services/checkout.service'
import { validate } from '@/services/data-source/api/api-cart.adapter'
import type {
  ApiCartValidation,
  ApiShippingMethod,
} from '@/services/data-source/api/cart.types'
import {
  formatMoney,
  shippingOptionName,
} from '@/components/shop/cart/line-format'
import { calculateItemPrice } from '@/services/pricing.service'
import { getSiteAddresses } from '@/services/accounts.service'
import { withoutOrderArtwork } from '@/lib/design/order-artwork'
import {
  TextField,
  FieldError,
  fieldOutline,
  FIELD_RED,
} from '@/components/ui/FormField'

const PO_CUSTOMISATION_KEY = 'TICKETIT_CURRENT_PO_CUSTOMIZATION'

/** sessionStorage raises no event for this tab's own writes; nothing to subscribe to. */
const noSubscription = () => () => {}

const readStoredCustomisation = () =>
  sessionStorage.getItem(PO_CUSTOMISATION_KEY)

/**
 * What this page knows about the design it is ordering.
 *
 * 'pending' means sessionStorage has not been read yet (server, hydration);
 * 'missing' that the page was opened without a design; 'unreadable' that the
 * handover is there but not a customisation.
 */
type CustomisationState = 'pending' | 'ready' | 'missing' | 'unreadable'

/**
 * The customisation handed over from the template customiser.
 *
 * There is no sample to fall back on any more. Opened directly, this page used
 * to fill itself with an invented company — a pharmacy that does not exist,
 * its tagline, its website, a 1-800 number, ten units at $65 each — and render
 * every one of those as though it were the buyer's own order, priced and ready
 * to submit. Anyone being shown the portal was looking at fabricated content
 * presented as real. Without a design there is nothing to order, and the page
 * now says so and points at the gallery instead.
 */
function parseStoredCustomisation(stored: string | null | undefined): {
  poData: any
  state: CustomisationState
} {
  if (stored === undefined) return { poData: null, state: 'pending' }
  if (stored === null) return { poData: null, state: 'missing' }
  try {
    const parsed = JSON.parse(stored)
    if (!parsed || typeof parsed !== 'object') {
      return { poData: null, state: 'unreadable' }
    }
    return { poData: parsed, state: 'ready' }
  } catch (e) {
    console.error('Error parsing stored PO customization', e)
    return { poData: null, state: 'unreadable' }
  }
}

/** One message per field, shown under that field. */
type FormErrors = {
  /** Not a field: the design itself cannot be ordered. Shown above submit. */
  design?: string
  poReference?: string
  recipientName?: string
  recipientPhone?: string
  requestedDate?: string
  address?: string
  shippingMethod?: string
  deliveryNotes?: string
  terms?: string
}

/**
 * How a discount is described once it comes from the server.
 *
 * The five hard-coded "tiers" that used to live here were invented by this
 * page: a 25% super-saver band that no rate card had agreed to. What a customer
 * pays is the pricing engine's answer — contract fixed price, contract tier,
 * item discount, card default, catalogue ladder, first match wins — and a
 * second ladder in the browser was a second, wrong answer to the same question.
 *
 * The label is now derived from the discount the server returned rather than
 * chosen from a list, so it can never describe a band that does not exist.
 */
function describeDiscount(discountPct: number, rateCardName?: string): string {
  if (discountPct <= 0) return 'Standard rate'
  return rateCardName
    ? `${discountPct.toFixed(1)}% · ${rateCardName}`
    : `${discountPct.toFixed(1)}% volume rate`
}

/** `POST /orders` accepts up to this many characters of `deliveryNotes`. */
const DELIVERY_NOTES_MAX = 500

/** `PATCH /cart` accepts up to this many characters of `poNumber`. */
const PO_REFERENCE_MAX = 64

/**
 * The line this page put in the basket: its product and design version, most
 * recently added. Found in the server's answer rather than guessed, because
 * the basket can already hold the same product from elsewhere.
 */
function lineAddedFor(
  validation: ApiCartValidation,
  productId: string,
  templateVersionId: string | null
): string | null {
  const candidates = validation.cart.lines
    .filter(
      (line) =>
        line.productId === productId &&
        (line.template?.versionId ?? null) === templateVersionId
    )
    .sort((a, b) => b.addedAt.localeCompare(a.addedAt))
  return candidates[0]?.id ?? null
}

/** An address that is a problem. */
const ADDRESS_PROBLEM: React.CSSProperties = {
  color: '#DC2626',
  marginTop: '4px',
  fontWeight: 500,
}

/**
 * The card, title and field styles this form repeats, defined once. Written
 * out inline at every use, the copies had already drifted — the fields into two
 * border widths, one card into a pink border and shadow of its own.
 */
const CARD: React.CSSProperties = {
  backgroundColor: '#FFFFFF',
  borderRadius: '14px',
  boxShadow:
    '0 1px 2px rgba(43, 37, 62, 0.04), 0 6px 16px rgba(43, 37, 62, 0.05)',
  border: '1px solid #F0E6EC',
  padding: '20px',
}

const CARD_TITLE: React.CSSProperties = {
  fontSize: '0.95rem',
  fontWeight: 700,
  color: '#2B253E',
  letterSpacing: '-0.01em',
  margin: 0,
}

/** The caption over a read-only fact: dimensions, stock, finishing, rate. */
const SPEC_LABEL: React.CSSProperties = {
  fontSize: '0.76rem',
  fontWeight: 500,
  color: '#A39BB3',
  display: 'block',
  marginBottom: '4px',
}

const FIELD_LABEL: React.CSSProperties = {
  fontSize: '0.78rem',
  fontWeight: 600,
  color: '#5C566E',
}

const FIELD_INPUT: React.CSSProperties = {
  width: '100%',
  padding: '8px 12px',
  borderRadius: '10px',
  border: '1px solid #F0E6EC',
  backgroundColor: '#FFFFFF',
  color: '#2B253E',
  fontSize: '0.84rem',
  marginTop: '6px',
}

export default function CreatePurchaseOrderPage() {
  const { user } = useAuth()
  const router = useRouter()
  const dispatch = useAppDispatch()
  /**
   * Only what the server said. Everything this page can check itself is
   * answered under the field it belongs to, where the fix is.
   */
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [isPending, setIsPending] = useState(false)

  /**
   * Every rule this form checks, one message per field.
   *
   * All of them are checked in a single pass on submit, so a form with four
   * things wrong shows four messages at once instead of revealing them one
   * refusal at a time — which is what the old single banner, and the browser's
   * `required` bubble before it, both did.
   */
  const [errors, setErrors] = useState<FormErrors>({})
  const clearError = (key: keyof FormErrors) =>
    setErrors((previous) =>
      previous[key] ? { ...previous, [key]: undefined } : previous
    )

  /**
   * The price the server quoted for this product at this quantity.
   *
   * Null until the first quote lands, which is why the summary reads "—"
   * rather than a number for a moment. Showing an invented price and
   * correcting it afterwards is worse than showing nothing briefly: the buyer
   * remembers the first figure.
   */
  const [quote, setQuote] = useState<{
    unitPrice: number
    discountPct: number
    rateCardName?: string
  } | null>(null)

  /**
   * The branch's real delivery address.
   *
   * This block used to print "450 Lexington Avenue, Suite 100" for every
   * customer in the system. Checkout also needs the address *id*, not a
   * rendering of it — the server records which address on file the order ships
   * to, and no string typed here can stand in for that.
   */
  const [shipTo, setShipTo] = useState<{
    id: string | null
    name: string
    lines: string[]
  } | null>(null)

  /**
   * Why the address needs a state of its own and not just `shipTo === null`.
   *
   * Four things can be true here, and three of them used to look identical: the
   * lookup is in flight, the signed-in account has no branch at all, the lookup
   * failed, or the branch genuinely has no address on file. All but the last
   * left `shipTo` null, so submitting produced "This branch has no delivery
   * address on file. Ask an administrator to add one" — which is a lie to an
   * administrator browsing the shop, who has no branch and whom no
   * administrator can help, and misleading to anyone who simply clicked before
   * the request came back.
   *
   * The shop is open to `site_user` and `admin` (see `src/app/shop/layout.tsx`)
   * and only a site user carries a `siteId`, so the no-branch case is not an
   * edge: it is every admin who opens this page.
   */
  const [addressLoad, setAddressLoad] = useState<
    'loading' | 'unavailable' | 'ready'
  >('loading')

  // Derived rather than stored: whether the account has a branch is already
  // known at render time from `user`, and a second copy in state could only
  // ever disagree with it.
  const addressState: 'loading' | 'no-branch' | 'unavailable' | 'ready' =
    user?.siteId ? addressLoad : 'no-branch'

  /** Accepting the terms of supply is the buyer's act, never a default. */
  const [acceptedTerms, setAcceptedTerms] = useState(false)

  // Read from sessionStorage through useSyncExternalStore: undefined on the
  // server and during hydration (so the first client render matches), the
  // stored string after. Parsed during render rather than copied into state.
  const storedCustomisation = useSyncExternalStore(
    noSubscription,
    readStoredCustomisation,
    () => undefined
  )
  const { poData, state: customisationState } = useMemo(
    () => parseStoredCustomisation(storedCustomisation),
    [storedCustomisation]
  )
  const [quantity, setQuantity] = useState<number>(10)
  // The stored quantity is a starting point, taken once it can be read.
  const [quantitySeeded, setQuantitySeeded] = useState(false)
  if (!quantitySeeded && storedCustomisation !== undefined) {
    setQuantitySeeded(true)
    if (poData?.selectedQuantity > 0) setQuantity(poData.selectedQuantity)
  }
  // No invented defaults. The fixed August date was already in the past, so
  // every submission was refused with DELIVERY_DATE_IN_PAST; the random PO
  // carried a prefix no account had set; the phone and notes were a demo's.
  const [recipientName, setRecipientName] = useState(user?.name || '')
  const [recipientPhone, setRecipientPhone] = useState('')
  const [requestedDate, setRequestedDate] = useState('')
  const [deliveryNotes, setDeliveryNotes] = useState('')
  const [poReference, setPoReference] = useState('')

  /**
   * How the parcel travels.
   *
   * Required by checkout since delivery became a per-order charge, and this
   * page never sent one — so every order placed from it was refused with
   * SHIPPING_METHOD_REQUIRED. The options and their prices are the server's.
   */
  const {
    shippingOptions,
    items: basketItems,
    deliveryNotesRequired,
    // Whether a purchase-order reference is required, and the shape it takes,
    // are the account's rules — not this page's guess.
    purchaseOrder,
    onCheckedOut,
    isLoading: isCartLoading,
  } = useCart()
  const [shippingMethod, setShippingMethod] =
    useState<ApiShippingMethod | null>(null)

  const poRequired = purchaseOrder?.required ?? false
  const poPrefix = purchaseOrder?.prefix ?? null
  /** The account's own example, when the API build supplies one. */
  const poExample = purchaseOrder?.formatExample ?? null

  /**
   * What a submit that did not finish left behind, so pressing again repairs
   * it instead of repeating it.
   *
   * `addedLineId` is the basket line this page already added: a retry updates
   * it rather than adding the design a second time. `pendingCartId` is the
   * basket sent to `POST /orders` when the answer never came back — the order
   * may exist, so the retry asks about that basket before touching the cart.
   * `submitInFlight` stops a double click landing before the button disables.
   */
  const addedLineId = useRef<string | null>(null)
  const pendingCartId = useRef<string | null>(null)
  const submitInFlight = useRef(false)
  /** `addedLineId` for rendering: which basket lines are not this page's. */
  const [ownLineId, setOwnLineId] = useState<string | null>(null)
  const rememberAddedLine = (lineId: string | null) => {
    addedLineId.current = lineId
    setOwnLineId(lineId)
  }

  useEffect(() => {
    const siteId = user?.siteId
    // No branch on this account: nothing to fetch, and `addressState` already
    // reads 'no-branch' without being told.
    if (!siteId) return

    let cancelled = false

    void getSiteAddresses(siteId)
      .then((site) => {
        if (cancelled) return

        // Null is the adapter's "not found, or not yours to read". Distinct
        // from a branch with no address: nothing an administrator adds to the
        // branch would change it.
        if (!site) {
          setAddressLoad('unavailable')
          return
        }

        const address = site.shipToAddress
        setShipTo({
          id: site.shipToAddressId,
          name: site.siteName,
          lines: [
            [address?.street, address?.suite].filter(Boolean).join(', '),
            [address?.city, address?.state, address?.postalCode]
              .filter(Boolean)
              .join(' '),
            address?.country ?? '',
          ].filter((line) => line.trim().length > 0),
        })
        setAddressLoad('ready')
      })
      .catch((error) => {
        // Without this the promise rejected silently and the panel said
        // "Loading branch address…" for as long as the page stayed open.
        if (cancelled) return
        console.error('Could not load the branch delivery address', error)
        setAddressLoad('unavailable')
      })

    return () => {
      cancelled = true
    }
  }, [user?.siteId])

  // The address is not something the buyer can type, so a message about it has
  // to clear itself when the lookup it complained about finishes.
  useEffect(() => {
    if (addressState !== 'ready' || !shipTo?.id) return
    setErrors((previous) =>
      previous.address ? { ...previous, address: undefined } : previous
    )
  }, [addressState, shipTo?.id])

  /**
   * Re-quotes on every quantity change, debounced.
   *
   * Still re-quoted rather than computed once, even though a design's price no
   * longer moves with the quantity: the server is the only thing entitled to
   * say what a line costs, and a page that started doing that arithmetic itself
   * is how it would drift from the invoice. Debounced because the stepper fires
   * on every click.
   *
   * The version is passed so the quote comes back at the design's price. Without
   * it the server has no way to know which design this is and falls back to the
   * product's catalogue price — a number this buyer is never charged.
   */
  useEffect(() => {
    const productId = poData?.productId
    if (!productId) return

    let cancelled = false
    const timer = setTimeout(() => {
      void calculateItemPrice(
        productId,
        0,
        undefined,
        quantity,
        poData?.templateVersionId
      ).then((priced) => {
        if (cancelled) return
        setQuote({
          unitPrice: priced.effectivePrice,
          discountPct: priced.discountPct,
          ...(priced.rateCardName ? { rateCardName: priced.rateCardName } : {}),
        })
      })
    }, 250)

    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [poData?.productId, poData?.templateVersionId, quantity])

  /**
   * The buyer's wording, without the artwork travelling beside it.
   *
   * The personalisation carried to an order now holds the buyer's own design
   * under a reserved key, because they can rework the artwork and not only fill
   * it in. What goes to the server is the whole record; what is *listed* on
   * this page is the wording, which is the part a person can check.
   */
  const personalisedFields = withoutOrderArtwork(
    poData?.customValues as Record<string, string> | undefined
  )

  if (customisationState === 'pending') {
    return (
      <div style={{ maxWidth: '1100px', margin: '0 auto', width: '100%' }}>
        <SkeletonDetail label="Loading the purchase order" />
      </div>
    )
  }

  // A purchase order is raised against a design the buyer has personalised:
  // the artwork proof, the product it prints on and the values on it all come
  // from the customiser. With nothing handed over there is no order to raise,
  // and inventing one to fill the page is how fabricated content ends up in
  // front of a customer.
  if (!poData) {
    return (
      <div style={{ maxWidth: '560px', margin: '0 auto', width: '100%' }}>
        <div style={{ ...CARD, textAlign: 'center', padding: '32px 24px' }}>
          <h1 style={{ ...CARD_TITLE, fontSize: '1.1rem' }}>
            No design to raise a purchase order for
          </h1>
          <p
            style={{
              fontSize: '0.84rem',
              color: '#6E6781',
              lineHeight: 1.6,
              margin: '10px 0 20px',
            }}
          >
            {customisationState === 'unreadable'
              ? 'The design handed over to this page could not be read, so there is nothing to order. Open the design again from the gallery and personalise it — the proof, product and your details come with it.'
              : 'This step reviews and submits a design you have personalised, so it starts in the gallery. Choose a template, personalise it, and you will arrive back here with the proof, the product and your details already filled in.'}
          </p>
          <Link
            href="/shop/templates"
            style={{
              display: 'inline-block',
              padding: '9px 16px',
              borderRadius: '10px',
              backgroundColor: '#F73582',
              color: '#FFFFFF',
              fontSize: '0.82rem',
              fontWeight: 600,
              textDecoration: 'none',
            }}
          >
            Start from a design
          </Link>
        </div>
      </div>
    )
  }

  // Every figure below is the server's. `discountPct` arrives as a percentage
  // (15 for 15%), not a fraction, which is what the API returns.
  const discountPct = (quote?.discountPct ?? 0) / 100
  const discountedUnitPrice = quote?.unitPrice ?? 0
  const unitBasePrice =
    discountPct > 0 && discountPct < 1
      ? Number((discountedUnitPrice / (1 - discountPct)).toFixed(2))
      : discountedUnitPrice
  const currentTier = {
    label: describeDiscount(quote?.discountPct ?? 0, quote?.rateCardName),
    discountPct,
  }
  const totalSaved = Number(
    ((unitBasePrice - discountedUnitPrice) * quantity).toFixed(2)
  )
  const subtotal = Number((quantity * discountedUnitPrice).toFixed(2))
  // Delivery is a per-order charge the server adds to the total, so the figure
  // shown here includes the chosen method's price. It used to say free.
  const chosenShipping =
    shippingOptions.find((option) => option.code === shippingMethod) ?? null
  const deliveryFee = chosenShipping ? Number(chosenShipping.price) : 0
  const totalAmount = subtotal + deliveryFee

  const handleQuantityChange = (newQty: number) => {
    const validQty = Math.max(1, Math.min(5000, newQty))
    setQuantity(validQty)
  }

  /**
   * Places the order, through the basket rather than around it.
   *
   * ---------------------------------------------------------------------------
   * Why it is four calls and not one
   * ---------------------------------------------------------------------------
   * `POST /orders` writes whatever is in the *basket*. This page used to
   * assemble an order in the browser — its own line prices, its own total — and
   * post that; against the real API it would have placed whatever the buyer
   * happened to have in their cart, under this purchase-order reference, at
   * prices this page invented. So the personalised line goes into the basket
   * first, and every number on the confirmation is the server's.
   *
   *   1. `addCartLine`  — with the template *and the version* the buyer saw, so
   *      the order can say which artwork the values belong to. The server
   *      re-checks the values against that version's editable layers.
   *   2. `saveCheckoutDetails` — the PO reference, date and notes this form
   *      collects, which are cart-level fields.
   *   3. `checkoutSession` — refuses with the list of what is missing, and that
   *      list is the useful part.
   *   4. `createOrder` — recipient only; lines, prices, totals, billing period
   *      and the approval decision are all the server's.
   */
  const handleSubmitPO = async (e: React.FormEvent) => {
    e.preventDefault()
    if (submitInFlight.current) return

    // ---------------------------------------------------------------------
    // Every rule, in one pass. Each message names its own field and says what
    // to do about it; the banner below is left for what the server says.
    // ---------------------------------------------------------------------
    const found: FormErrors = {}

    if (!poData?.productId) {
      found.design =
        'This design is not linked to a product, so it cannot be ordered. ' +
        'Ask an administrator to link one.'
    } else if (poData.customValues && !poData.templateVersionId) {
      // Personalised values without the version they were checked against
      // would be an order nobody can print. The customiser supplies both.
      found.design =
        'This customisation is out of date. Reopen the design from the gallery ' +
        'so your details are checked against the current artwork.'
    }

    const reference = poReference.trim()
    if (poRequired && !reference) {
      found.poReference =
        'Enter the purchase-order reference this order is raised against — your account requires one.'
    } else if (reference.length > PO_REFERENCE_MAX) {
      found.poReference = `Keep the reference to ${PO_REFERENCE_MAX} characters.`
    }

    if (!recipientName.trim()) {
      found.recipientName =
        'Enter the name of the person receiving this delivery.'
    }

    // Optional, but a courier contact of three characters helps nobody.
    const digits = recipientPhone.replace(/\D/g, '')
    if (recipientPhone.trim() && digits.length < 6) {
      found.recipientPhone =
        'Enter a phone number the courier can call, or leave it blank.'
    }

    // Compared as UTC calendar days, the way the server compares them.
    if (
      requestedDate &&
      requestedDate < new Date().toISOString().slice(0, 10)
    ) {
      found.requestedDate = 'Choose a delivery date of today or later.'
    }

    // Four different faults, four different remedies. They shared one message
    // until an administrator — who has no branch, and so can never satisfy it —
    // was told to ask an administrator for a delivery address.
    if (addressState === 'no-branch') {
      found.address =
        'Your account is not attached to a branch, so there is no delivery ' +
        'address to ship this order to. Sign in as a branch user to place it.'
    } else if (addressState === 'loading') {
      found.address =
        'Still loading this branch’s delivery address. Try again in a moment.'
    } else if (addressState === 'unavailable') {
      found.address =
        'This branch’s delivery address could not be loaded. Reload the page, ' +
        'and if it keeps happening report it to support.'
    } else if (!shipTo?.id) {
      found.address =
        'This branch has no delivery address on file. Ask an administrator to ' +
        'add one before ordering.'
    }

    if (!shippingMethod) {
      found.shippingMethod = 'Choose how this order should be delivered.'
    }

    const instructions = deliveryNotes.trim()
    if (deliveryNotesRequired && !instructions) {
      found.deliveryNotes =
        'Add instructions for the driver — this account requires them on every order.'
    } else if (instructions.length > DELIVERY_NOTES_MAX) {
      found.deliveryNotes = `Keep the driver instructions to ${DELIVERY_NOTES_MAX} characters.`
    }

    if (!acceptedTerms) {
      found.terms =
        'Accept the terms of supply before submitting this purchase order.'
    }

    setErrors(found)
    if (Object.values(found).some(Boolean)) {
      setSubmitError(null)
      return
    }

    // Narrowing for TypeScript: the checks above already refused both.
    if (!poData?.productId || !shipTo?.id || !shippingMethod) return

    submitInFlight.current = true
    setIsPending(true)
    setSubmitError(null)

    try {
      // A basket sent to `POST /orders` whose answer never came. If it is
      // still the open basket, nothing was placed and the steps below run
      // again with whatever the buyer has changed since. If it is not, it was
      // most likely placed: asking about it returns that order.
      let cartId: string | null = null
      if (pendingCartId.current) {
        const open = await validate()
        if (open.cart.id !== pendingCartId.current)
          cartId = pendingCartId.current
      }

      if (!cartId) {
        // 1. The design, once. A retry after a later step failed updates the
        //    line it already added instead of adding a second copy.
        const templateVersionId = poData.templateVersionId ?? null
        let basket: ApiCartValidation | null = null
        if (addedLineId.current) {
          try {
            basket = await dispatch(
              updateCartLine({ lineId: addedLineId.current, quantity })
            ).unwrap()
          } catch {
            // The line is gone — removed in another tab, say. Add it afresh.
            rememberAddedLine(null)
          }
        }
        if (!basket) {
          basket = await dispatch(
            addCartLine({
              productId: poData.productId,
              quantity,
              ...(poData.templateId && poData.templateVersionId
                ? {
                    templateId: poData.templateId,
                    templateVersionId: poData.templateVersionId,
                    customisation: poData.customValues ?? {},
                  }
                : {}),
            })
          ).unwrap()
          rememberAddedLine(
            lineAddedFor(basket, poData.productId, templateVersionId)
          )
        }

        // 2. The cart-level details this form collects.
        const saved = await dispatch(
          saveCheckoutDetails({
            poReference: reference,
            shippingAddressId: shipTo.id,
            // The portal bills head office monthly — the pill above this form
            // says so ("Head Office Payer · Zero Site Payment"), and there is
            // no other method a site user may choose. It is sent explicitly
            // rather than left to a server default so the recorded terms match
            // what the buyer was shown.
            paymentMethod: 'CORPORATE_INVOICE',
            termsAcceptedAt: new Date().toISOString(),
            shippingMethod,
            requestedDeliveryDate: requestedDate,
          })
        ).unwrap()
        cartId = saved.cart.id
      }

      // 3. The order, by the basket's id — safe to repeat. It re-validates the
      //    basket and refuses with the list of what is missing.
      pendingCartId.current = cartId
      const order = await placeReviewedOrder({
        cartId,
        deliveryNotes: instructions,
        recipientName: recipientName.trim(),
        recipientPhone: recipientPhone.trim(),
      })

      pendingCartId.current = null
      rememberAddedLine(null)
      if (typeof window !== 'undefined') {
        // The basket is closed server-side by the order write. Clearing the
        // handoff too stops a refresh re-adding the same personalised line.
        sessionStorage.removeItem('TICKETIT_CURRENT_PO_CUSTOMIZATION')
      }

      onCheckedOut()
      router.push(`/shop/order-confirmation/${order.id}`)
    } catch (err: unknown) {
      // A thunk's `unwrap()` rejects with its message; the API calls reject
      // with an ApiError.
      if (typeof err === 'string') {
        setSubmitError(err)
        return
      }

      const failure = describePlacementFailure(err)
      // Only an unanswered submit may have placed the order. Every other
      // outcome is definite, and the next press starts from the basket.
      if (failure.kind !== 'unconfirmed') pendingCartId.current = null
      if (failure.kind === 'basket-changed') rememberAddedLine(null)

      // The list of what is missing is what the buyer can act on — "not
      // ready" alone leaves them with nothing to fix.
      setSubmitError(
        failure.kind === 'not-ready' && failure.issues.length > 0
          ? failure.issues.map((issue) => issue.message).join(' ')
          : failure.message
      )
    } finally {
      submitInFlight.current = false
      setIsPending(false)
    }
  }

  /** Lines already in the basket that this purchase order would also place. */
  const otherBasketLines = basketItems.filter((item) => item.id !== ownLineId)

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '20px',
        maxWidth: '1050px',
        margin: '0 auto',
      }}
    >
      <form
        onSubmit={handleSubmitPO}
        // The form answers for itself, field by field. Without this the
        // browser gets there first with its own grey bubble, in its own
        // language, and stops at whichever field it reaches first.
        noValidate
        style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'flex-end',
            justifyContent: 'space-between',
            gap: '12px',
            flexWrap: 'wrap',
          }}
        >
          <div style={{ minWidth: 0 }}>
            <Link
              href={
                poData?.templateId
                  ? `/shop/templates/customize/${poData.templateId}`
                  : '/shop/templates'
              }
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
                fontSize: '0.8rem',
                color: '#6E6781',
                textDecoration: 'none',
                marginBottom: '8px',
                fontWeight: 600,
              }}
            >
              <ArrowLeft size={14} />
              Back to Template Customizer
            </Link>
            <h1
              style={{
                fontSize: '1.25rem',
                fontWeight: 700,
                color: '#2B253E',
                letterSpacing: '-0.01em',
                margin: 0,
              }}
            >
              Step 7 & 8: Review & Submit Purchase Order (PO)
            </h1>
            <p
              style={{
                fontSize: '0.8rem',
                color: '#6E6781',
                margin: '4px 0 0',
              }}
            >
              Verify customized artwork, configure order units with volume
              discount, and confirm branch shipping destination.
            </p>
          </div>

          {/* Zero Payment Pill */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '4px 10px',
              borderRadius: '9999px',
              backgroundColor: '#ECFDF5',
              color: '#3F9C68',
              fontSize: '0.74rem',
              fontWeight: 600,
              whiteSpace: 'nowrap',
            }}
          >
            <ShieldCheck size={14} />
            <span>Head Office Payer • Zero Site Payment</span>
          </div>
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1.2fr 1fr',
            gap: '20px',
          }}
        >
          {/* LEFT: Customized Artwork Preview & Spec Review & Unit Configuration */}
          <div
            style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}
          >
            {/* Artwork Proof Card */}
            <div style={CARD}>
              <h3 style={{ ...CARD_TITLE, marginBottom: '14px' }}>
                Customized Artwork Proof
              </h3>

              {/* The artwork itself, as the studio drew it.

                    This used to be a third hand-rolled rendering of the design
                    in CSS — absolutely positioned divs, one branch per layer
                    type. It could draw text, a logo and a placeholder QR, and
                    nothing else: an image layer had no branch at all, so a
                    photograph came out as the bare div behind it, carrying
                    fabric's default black fill. That is the black rectangle
                    this replaced.

                    Adding the missing branches would have meant teaching this
                    page about images, shapes, masks, gradients, rotation and
                    groups — everything the canvas already knows — and being
                    wrong about them somewhere. The customiser hands over a
                    picture of the real canvas, so this shows that: what is
                    approved here is what was on screen when it was approved. */}
              {poData.thumbnailUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={poData.thumbnailUrl}
                  alt="Proof of the customised artwork"
                  style={{
                    display: 'block',
                    width: '100%',
                    height: 'auto',
                    borderRadius: '10px',
                    border: '1px solid #F0E6EC',
                    backgroundColor:
                      poData.canvasConfig?.backgroundColor || '#ffffff',
                  }}
                />
              ) : (
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    textAlign: 'center',
                    padding: '32px 16px',
                    width: '100%',
                    aspectRatio: poData.aspectRatio
                      ? poData.aspectRatio.replace(':', ' / ')
                      : '4 / 3',
                    borderRadius: '10px',
                    border: '1px dashed #DCD3E0',
                    color: '#A39BB3',
                    fontSize: '0.8rem',
                    fontWeight: 500,
                  }}
                >
                  No proof was captured for this design. Open it in the
                  customiser again before submitting.
                </div>
              )}

              {/* Customized Field Summary List
                    The wording only. A personalisation now carries the buyer's
                    own artwork alongside it, and a design document listed as a
                    "personalised field" would print forty thousand characters
                    of coordinates across this summary. */}
              {personalisedFields &&
                Object.keys(personalisedFields).length > 0 && (
                  <div
                    style={{
                      marginTop: '16px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '8px',
                    }}
                  >
                    <span
                      style={{
                        fontSize: '0.76rem',
                        fontWeight: 500,
                        color: '#A39BB3',
                      }}
                    >
                      Personalized Fields Applied
                    </span>
                    <div
                      style={{
                        display: 'grid',
                        gridTemplateColumns: '1fr 1fr',
                        gap: '8px',
                        fontSize: '0.8rem',
                      }}
                    >
                      {Object.entries(personalisedFields).map(([key, val]) => (
                        <div
                          key={key}
                          style={{
                            backgroundColor: '#FCF7FA',
                            padding: '8px 10px',
                            borderRadius: '10px',
                          }}
                        >
                          <span
                            style={{
                              color: '#A39BB3',
                              fontSize: '0.72rem',
                              display: 'block',
                              textTransform: 'capitalize',
                            }}
                          >
                            {key.replace(/([A-Z])/g, ' $1')}
                          </span>
                          <strong style={{ color: '#2B253E', fontWeight: 600 }}>
                            {String(val)}
                          </strong>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
            </div>

            {/* Product Specifications & Interactive Volume Selector */}
            <div
              style={{
                ...CARD,
                display: 'flex',
                flexDirection: 'column',
                gap: '16px',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  gap: '8px',
                  flexWrap: 'wrap',
                }}
              >
                <h3 style={CARD_TITLE}>
                  Specifications & Volume Configuration
                </h3>
                {discountPct > 0 && (
                  <span
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      padding: '2px 8px',
                      borderRadius: '9999px',
                      backgroundColor: '#ECFDF5',
                      color: '#3F9C68',
                      fontSize: '0.7rem',
                      fontWeight: 600,
                    }}
                  >
                    {(discountPct * 100).toFixed(0)}% Tier Discount Active
                  </span>
                )}
              </div>

              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr',
                  gap: '14px',
                  fontSize: '0.84rem',
                }}
              >
                <div>
                  <label style={SPEC_LABEL}>Print Dimensions</label>
                  <div style={{ fontWeight: 600, color: '#2B253E' }}>
                    {poData.dimensions?.width}&quot; ×{' '}
                    {poData.dimensions?.height}&quot; (
                    {poData.category || 'Collateral'})
                  </div>
                </div>
                {/* Substrate and finishing are the product's, so they are
                      shown only when the design carries them. They used to be
                      two fixed lines — "4mm Fluted Weatherproof Coroplast",
                      "Double-Sided UV + Metal H-Stakes" — printed over every
                      product, business cards included. */}
                {poData.substrate && (
                  <div>
                    <label style={SPEC_LABEL}>Print Substrate / Stock</label>
                    <div style={{ fontWeight: 600, color: '#2B253E' }}>
                      {poData.substrate}
                    </div>
                  </div>
                )}
                {poData.finishing && (
                  <div>
                    <label style={SPEC_LABEL}>Finishing & Mounting</label>
                    <div style={{ fontWeight: 600, color: '#2B253E' }}>
                      {poData.finishing}
                    </div>
                  </div>
                )}
                <div>
                  <label style={SPEC_LABEL}>Effective Unit Rate</label>
                  <div style={{ fontWeight: 700, color: '#2B253E' }}>
                    ${discountedUnitPrice.toFixed(2)} / unit{' '}
                    {discountPct > 0 && (
                      <span
                        style={{
                          fontSize: '0.74rem',
                          color: '#A39BB3',
                          textDecoration: 'line-through',
                          fontWeight: 500,
                        }}
                      >
                        ${unitBasePrice.toFixed(2)}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* INTERACTIVE UNIT SELECTOR SECTION
                    Set off by a rule, not a bordered, filled box of its own —
                    that was a card inside the card. */}
              <div
                style={{
                  paddingTop: '16px',
                  borderTop: '1px solid #F5EEF2',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '12px',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: '12px',
                    flexWrap: 'wrap',
                  }}
                >
                  <div>
                    <label
                      style={{
                        fontSize: '0.84rem',
                        fontWeight: 600,
                        color: '#2B253E',
                        display: 'block',
                      }}
                    >
                      Select Order Units (Quantity)
                    </label>
                    <span style={{ fontSize: '0.76rem', color: '#A39BB3' }}>
                      Choose volume preset or enter custom unit quantity
                    </span>
                  </div>

                  {/* Stepper + Manual Input */}
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                    }}
                  >
                    <button
                      type="button"
                      onClick={() => handleQuantityChange(quantity - 1)}
                      disabled={quantity <= 1}
                      style={{
                        width: '32px',
                        height: '32px',
                        borderRadius: '10px',
                        border: '1px solid #F0E6EC',
                        backgroundColor: '#FFFFFF',
                        color: '#2B253E',
                        opacity: quantity <= 1 ? 0.5 : 1,
                        cursor: quantity <= 1 ? 'not-allowed' : 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                      title="Decrease by 1 unit"
                    >
                      <Minus size={14} />
                    </button>
                    <div style={{ position: 'relative' }}>
                      <input
                        type="number"
                        min={1}
                        max={5000}
                        value={quantity}
                        onChange={(e) => {
                          const val = parseInt(e.target.value, 10)
                          if (!isNaN(val)) handleQuantityChange(val)
                          else if (e.target.value === '') setQuantity(1)
                        }}
                        style={{
                          width: '74px',
                          height: '32px',
                          textAlign: 'center',
                          borderRadius: '10px',
                          border: '1px solid #F0E6EC',
                          backgroundColor: '#FFFFFF',
                          fontSize: '0.84rem',
                          fontWeight: 600,
                          color: '#2B253E',
                          outline: 'none',
                        }}
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => handleQuantityChange(quantity + 1)}
                      style={{
                        width: '32px',
                        height: '32px',
                        borderRadius: '10px',
                        border: '1px solid #F0E6EC',
                        backgroundColor: '#FFFFFF',
                        color: '#2B253E',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                      title="Increase by 1 unit"
                    >
                      <Plus size={14} />
                    </button>
                  </div>
                </div>

                {/* Preset Volume Pills */}
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(5, 1fr)',
                    gap: '8px',
                  }}
                >
                  {/* Quantities only. Each pill used to advertise a
                        discount of its own — 10% at five units, 25% at fifty —
                        bands no rate card had agreed to, next to a price the
                        server had already quoted. */}
                  {[5, 10, 25, 50, 100].map((preset) => {
                    const isSelected = quantity === preset
                    return (
                      <button
                        key={preset}
                        type="button"
                        onClick={() => setQuantity(preset)}
                        style={{
                          padding: '8px 6px',
                          borderRadius: '10px',
                          // The current preset is marked by the accent on
                          // its border and label — one signal, no tint or
                          // glow on top of it.
                          border: isSelected
                            ? '1px solid #F73582'
                            : '1px solid #F0E6EC',
                          backgroundColor: '#FFFFFF',
                          color: isSelected ? '#F73582' : '#2B253E',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          transition: 'border-color 0.15s ease',
                        }}
                      >
                        <span style={{ fontSize: '0.8rem', fontWeight: 600 }}>
                          {preset} Units
                        </span>
                      </button>
                    )
                  })}
                </div>

                {/* Volume Tier Summary / Savings Banner */}
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '8px',
                    flexWrap: 'wrap',
                    padding: '10px 12px',
                    borderRadius: '10px',
                    backgroundColor: '#FCF7FA',
                    fontSize: '0.78rem',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      color: '#6E6781',
                    }}
                  >
                    <DollarSign size={16} color="#A39BB3" />
                    <span>
                      Selected:{' '}
                      <strong style={{ color: '#2B253E', fontWeight: 600 }}>
                        {quantity} Units
                      </strong>{' '}
                      @ ${discountedUnitPrice.toFixed(2)} / unit
                    </span>
                  </div>
                  {totalSaved > 0 ? (
                    <span style={{ color: '#3F9C68', fontWeight: 600 }}>
                      Savings: -${totalSaved.toFixed(2)} ({currentTier.label})
                    </span>
                  ) : (
                    <span style={{ color: '#A39BB3' }}>
                      Your account's rate card sets the price at this quantity.
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* RIGHT: Branch Shipping Details & Pricing Breakdown */}
          <div
            style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}
          >
            {/* Shipping Card */}
            <div style={CARD}>
              <h3
                style={{
                  ...CARD_TITLE,
                  marginBottom: '14px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                }}
              >
                <Truck size={16} color="#A39BB3" />
                Branch Delivery Destination
              </h3>

              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '12px',
                }}
              >
                <TextField
                  id="poReference"
                  label="PO Reference Number"
                  type="text"
                  value={poReference}
                  maxLength={PO_REFERENCE_MAX}
                  isRequired={poRequired}
                  placeholder={poExample || 'PO-1042'}
                  hint={
                    poPrefix
                      ? `Starts with ${poPrefix}. It appears on your monthly statement.`
                      : 'It appears on your monthly consolidated statement.'
                  }
                  error={errors.poReference}
                  onChange={(e) => {
                    setPoReference(e.target.value)
                    clearError('poReference')
                  }}
                  style={{ fontWeight: 600 }}
                />

                <TextField
                  id="recipientName"
                  label="Recipient Full Name"
                  type="text"
                  autoComplete="name"
                  value={recipientName}
                  isRequired
                  placeholder="Jordan Ellis"
                  hint="Who the courier asks for at the branch."
                  error={errors.recipientName}
                  onChange={(e) => {
                    setRecipientName(e.target.value)
                    clearError('recipientName')
                  }}
                />

                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr 1fr',
                    gap: '10px',
                    alignItems: 'start',
                  }}
                >
                  <TextField
                    id="recipientPhone"
                    label="Contact Phone"
                    type="tel"
                    autoComplete="tel"
                    value={recipientPhone}
                    placeholder="021 555 0134"
                    error={errors.recipientPhone}
                    onChange={(e) => {
                      setRecipientPhone(e.target.value)
                      clearError('recipientPhone')
                    }}
                  />
                  <TextField
                    id="requestedDate"
                    label="Requested Delivery Date"
                    type="date"
                    value={requestedDate}
                    min={new Date().toISOString().slice(0, 10)}
                    error={errors.requestedDate}
                    onChange={(e) => {
                      setRequestedDate(e.target.value)
                      clearError('requestedDate')
                    }}
                  />
                </div>

                <div>
                  <label style={FIELD_LABEL}>Delivery Address</label>
                  <div
                    style={{
                      padding: '8px 12px',
                      borderRadius: '10px',
                      fontSize: '0.82rem',
                      color: '#6E6781',
                      lineHeight: 1.5,
                      marginTop: '6px',
                      // Red when the address is the reason a submit was
                      // refused, the tinted panel otherwise.
                      ...(errors.address
                        ? fieldOutline(true)
                        : {
                            border: '1px solid #F0E6EC',
                            background: '#FCF7FA',
                          }),
                    }}
                  >
                    <strong style={{ color: '#2B253E', fontWeight: 600 }}>
                      {shipTo?.name ||
                        user?.siteName ||
                        (addressState === 'no-branch'
                          ? 'No branch on this account'
                          : 'Your branch')}
                    </strong>
                    {shipTo ? (
                      shipTo.lines.map((line) => <div key={line}>{line}</div>)
                    ) : addressState === 'loading' ? (
                      <div style={{ color: '#A39BB3' }}>
                        Loading branch address…
                      </div>
                    ) : null}
                    {/* The standing note. Once a submit has been refused the
                        message under the panel says the same thing with the
                        remedy, so only one of the two is ever on screen. */}
                    {!errors.address && addressState === 'no-branch' && (
                      <div style={ADDRESS_PROBLEM}>
                        This account is not attached to a branch, so there is
                        nowhere to deliver to. Sign in as a branch user to
                        order.
                      </div>
                    )}
                    {!errors.address && addressState === 'unavailable' && (
                      <div style={ADDRESS_PROBLEM}>
                        The branch address could not be loaded. Reload the page
                        to try again.
                      </div>
                    )}
                    {!errors.address &&
                      addressState === 'ready' &&
                      !shipTo?.id && (
                        <div style={ADDRESS_PROBLEM}>
                          No delivery address on file for this branch.
                        </div>
                      )}
                  </div>
                  {errors.address && <FieldError>{errors.address}</FieldError>}
                </div>

                <div>
                  <label style={FIELD_LABEL}>
                    Delivery Method
                    <span aria-hidden="true" style={{ color: FIELD_RED }}>
                      {' '}
                      *
                    </span>
                  </label>
                  <div
                    role="radiogroup"
                    aria-label="Delivery method"
                    aria-invalid={errors.shippingMethod ? true : undefined}
                    aria-describedby={
                      errors.shippingMethod ? 'shippingMethod-error' : undefined
                    }
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '6px',
                      marginTop: '6px',
                      padding: '8px',
                      borderRadius: '10px',
                      ...fieldOutline(Boolean(errors.shippingMethod)),
                    }}
                  >
                    {shippingOptions.length === 0 && (
                      <span style={{ fontSize: '0.78rem', color: '#A39BB3' }}>
                        {isCartLoading
                          ? 'Loading delivery options…'
                          : 'No delivery methods are available right now.'}
                      </span>
                    )}
                    {shippingOptions.map((option) => {
                      const selected = option.code === shippingMethod
                      return (
                        <label
                          key={option.code}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                            padding: '8px 12px',
                            borderRadius: '10px',
                            border: selected
                              ? '1px solid #F73582'
                              : '1px solid #F0E6EC',
                            backgroundColor: selected ? '#FDE8F1' : '#FFFFFF',
                            fontSize: '0.82rem',
                            color: '#2B253E',
                            cursor: 'pointer',
                          }}
                        >
                          <input
                            type="radio"
                            name="poShippingMethod"
                            checked={selected}
                            onChange={() => {
                              setShippingMethod(option.code)
                              clearError('shippingMethod')
                            }}
                            style={{ margin: 0, accentColor: '#F73582' }}
                          />
                          <span style={{ flex: 1 }}>
                            {shippingOptionName(option)}
                          </span>
                          <strong style={{ fontWeight: 600 }}>
                            {formatMoney(Number(option.price))}
                          </strong>
                        </label>
                      )
                    })}
                  </div>
                  {errors.shippingMethod && (
                    <FieldError id="shippingMethod-error">
                      {errors.shippingMethod}
                    </FieldError>
                  )}
                </div>

                <div>
                  <label htmlFor="poDeliveryNotes" style={FIELD_LABEL}>
                    Special Instructions for Driver
                    {deliveryNotesRequired ? (
                      <span style={{ color: FIELD_RED }}> *</span>
                    ) : (
                      <span style={{ color: '#A39BB3', fontWeight: 400 }}>
                        {' '}
                        (Optional)
                      </span>
                    )}
                  </label>
                  {/* Sent as the order's delivery instructions: printed on
                        the courier label and shown on every order screen.

                        No `required` attribute: the browser answers that with
                        a grey bubble of its own and stops the form dead. The
                        rule is checked with the rest, below the field. */}
                  <textarea
                    id="poDeliveryNotes"
                    rows={2}
                    maxLength={DELIVERY_NOTES_MAX}
                    placeholder="Deliver to the rear loading dock and ask for the duty manager."
                    value={deliveryNotes}
                    aria-invalid={errors.deliveryNotes ? true : undefined}
                    aria-describedby={
                      errors.deliveryNotes ? 'poDeliveryNotes-error' : undefined
                    }
                    onChange={(e) => {
                      setDeliveryNotes(e.target.value)
                      clearError('deliveryNotes')
                    }}
                    style={{
                      ...FIELD_INPUT,
                      ...fieldOutline(Boolean(errors.deliveryNotes)),
                    }}
                  />
                  <span
                    style={{
                      display: 'block',
                      textAlign: 'right',
                      fontSize: '0.72rem',
                      color: '#A39BB3',
                    }}
                  >
                    {deliveryNotes.length}/{DELIVERY_NOTES_MAX}
                  </span>
                  {errors.deliveryNotes && (
                    <FieldError id="poDeliveryNotes-error">
                      {errors.deliveryNotes}
                    </FieldError>
                  )}
                </div>
              </div>
            </div>

            {/* Pricing Breakdown & Submission Card
                  The same card as the other three. It used to carry a pink
                  border and a pink shadow to stand out; the total and the one
                  pink button inside it already do that. */}
            <div
              style={{
                ...CARD,
                display: 'flex',
                flexDirection: 'column',
                gap: '14px',
              }}
            >
              <h3 style={CARD_TITLE}>Financial Breakdown</h3>

              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '8px',
                  fontSize: '0.84rem',
                  borderBottom: '1px solid #F5EEF2',
                  paddingBottom: '14px',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    color: '#6E6781',
                  }}
                >
                  <span>Unit Base Price</span>
                  <span>${unitBasePrice.toFixed(2)} / unit</span>
                </div>
                {discountPct > 0 && (
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      color: '#3F9C68',
                      fontWeight: 600,
                    }}
                  >
                    <span>
                      Volume Tier Discount ({(discountPct * 100).toFixed(0)}%)
                    </span>
                    <span>-${totalSaved.toFixed(2)}</span>
                  </div>
                )}
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    color: '#6E6781',
                  }}
                >
                  <span>Effective Unit Price</span>
                  <span style={{ fontWeight: 600, color: '#2B253E' }}>
                    ${discountedUnitPrice.toFixed(2)} / unit
                  </span>
                </div>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    color: '#6E6781',
                  }}
                >
                  <span>Quantity Requested</span>
                  <span style={{ fontWeight: 600, color: '#2B253E' }}>
                    {quantity} Units
                  </span>
                </div>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    color: '#6E6781',
                  }}
                >
                  <span>
                    {chosenShipping
                      ? shippingOptionName(chosenShipping)
                      : 'Shipping'}
                  </span>
                  <span style={{ color: '#2B253E', fontWeight: 600 }}>
                    {chosenShipping
                      ? formatMoney(deliveryFee)
                      : 'Choose a method'}
                  </span>
                </div>
              </div>

              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <span
                  style={{
                    fontSize: '0.95rem',
                    fontWeight: 700,
                    color: '#2B253E',
                  }}
                >
                  Total PO Value
                </span>
                <span
                  style={{
                    fontSize: '1.5rem',
                    fontWeight: 700,
                    color: '#2B253E',
                    letterSpacing: '-0.02em',
                  }}
                >
                  ${totalAmount.toFixed(2)}
                </span>
              </div>

              <div
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '8px',
                  padding: '10px 12px',
                  borderRadius: '10px',
                  backgroundColor: '#FCF7FA',
                  fontSize: '0.76rem',
                  color: '#6E6781',
                  lineHeight: 1.5,
                }}
              >
                <Lock
                  size={14}
                  color="#A39BB3"
                  style={{ flexShrink: 0, marginTop: '2px' }}
                />
                <span>
                  <strong style={{ color: '#5C566E' }}>
                    Approval Workflow:
                  </strong>{' '}
                  An order above your account's approval threshold is routed to
                  your Head Office controller for approval before it goes into
                  production.
                </span>
              </div>

              {/* `POST /orders` places the whole basket, and this page adds
                    its design to whatever is already there. Said before the
                    buyer submits, not discovered on the confirmation. */}
              {!isCartLoading && otherBasketLines.length > 0 && (
                <div
                  style={{
                    padding: '10px 12px',
                    borderRadius: '10px',
                    backgroundColor: '#EFF6FF',
                    border: '1px solid #BFDBFE',
                    fontSize: '0.76rem',
                    color: '#1E40AF',
                    lineHeight: 1.5,
                  }}
                >
                  Your basket already holds{' '}
                  {otherBasketLines.length === 1
                    ? 'another line'
                    : `${otherBasketLines.length} other lines`}
                  . {otherBasketLines.length === 1 ? 'It is' : 'They are'}{' '}
                  placed on this purchase order too.{' '}
                  <Link
                    href="/shop/cart"
                    style={{ color: '#1E40AF', fontWeight: 600 }}
                  >
                    Review the basket
                  </Link>
                </div>
              )}

              {/* Only what the server said, and only after the form itself
                  was satisfied. Everything this page can check for itself is
                  answered under the field it belongs to. */}
              {submitError && (
                <div
                  role="alert"
                  style={{
                    padding: '10px 12px',
                    borderRadius: '10px',
                    backgroundColor: '#FFFBEB',
                    fontSize: '0.78rem',
                    color: '#B45309',
                    lineHeight: 1.5,
                    fontWeight: 500,
                  }}
                >
                  {submitError}
                </div>
              )}

              {/* Accepting the terms is the buyer's act. The API refuses a
                    checkout without it, and defaulting it here would be this
                    page accepting on their behalf. */}
              <label
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '8px',
                  fontSize: '0.78rem',
                  color: '#6E6781',
                  lineHeight: 1.5,
                  cursor: 'pointer',
                }}
              >
                <input
                  type="checkbox"
                  checked={acceptedTerms}
                  aria-invalid={errors.terms ? true : undefined}
                  aria-describedby={errors.terms ? 'terms-error' : undefined}
                  onChange={(e) => {
                    setAcceptedTerms(e.target.checked)
                    clearError('terms')
                  }}
                  style={{
                    marginTop: '2px',
                    cursor: 'pointer',
                    accentColor: errors.terms ? FIELD_RED : '#F73582',
                  }}
                />
                <span>
                  I accept the terms of supply, and confirm this purchase order
                  is authorised for{' '}
                  <strong>
                    {shipTo?.name || user?.siteName || 'this branch'}
                  </strong>
                  .
                </span>
              </label>
              {errors.terms && (
                <FieldError id="terms-error">{errors.terms}</FieldError>
              )}

              {/* Not a field: the design itself cannot be ordered. It sits
                    with the button because that is what it stops. */}
              {errors.design && <FieldError>{errors.design}</FieldError>}

              <button
                type="submit"
                disabled={isPending}
                style={{
                  padding: '8px 14px',
                  borderRadius: '10px',
                  backgroundColor: '#F73582',
                  color: '#FFFFFF',
                  fontSize: '0.82rem',
                  fontWeight: 600,
                  border: 'none',
                  cursor: isPending ? 'not-allowed' : 'pointer',
                  opacity: isPending ? 0.5 : 1,
                  transition: 'opacity 0.15s ease',
                }}
              >
                {isPending
                  ? 'Submitting PO...'
                  : `Submit Purchase Order ($${totalAmount.toFixed(2)})`}
              </button>
            </div>
          </div>
        </div>
      </form>
    </div>
  )
}
