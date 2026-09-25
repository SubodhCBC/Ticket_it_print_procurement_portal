import type { CheckoutState } from './cartSlice'

/**
 * The checkout fields the basket has no column for, kept across a reload.
 *
 * The receiving contact and the delivery instructions travel with
 * `POST /orders`, not `PATCH /cart/checkout-details`, so until placement they
 * exist only in the browser. Held in Redux alone they vanished on a refresh of
 * the review step — and the order was then placed without them, or refused
 * outright when the account requires delivery instructions.
 *
 * Session storage, keyed by the basket's id: a fresh basket after an order is
 * placed must not inherit the last one's contact, and another tab's basket is
 * not this one. Every access is guarded, because storage can be unavailable
 * (private windows, blocked site data) and checkout must still work without it.
 */

const STORAGE_KEY = 'ppp.checkout.draft'

export const DRAFT_FIELDS = [
  'deliveryContactName',
  'deliveryContactPhone',
  'deliveryContactEmail',
  'deliveryInstructions',
  'projectCode',
] as const satisfies readonly (keyof CheckoutState)[]

type DraftField = (typeof DRAFT_FIELDS)[number]
export type CheckoutDraft = Partial<Pick<CheckoutState, DraftField>>

interface StoredDraft {
  cartId: string
  fields: CheckoutDraft
}

function storage(): Storage | null {
  try {
    return typeof window === 'undefined' ? null : window.sessionStorage
  } catch {
    return null
  }
}

/** The draft saved for this basket, or null when there is none. */
export function readCheckoutDraft(cartId: string): CheckoutDraft | null {
  try {
    const raw = storage()?.getItem(STORAGE_KEY)
    if (!raw) return null
    const stored = JSON.parse(raw) as StoredDraft
    return stored?.cartId === cartId ? stored.fields : null
  } catch {
    return null
  }
}

/** Merges the draft fields in `partial` into what is saved for this basket. */
export function writeCheckoutDraft(
  cartId: string,
  partial: Partial<CheckoutState>
): void {
  const changed: CheckoutDraft = {}
  for (const field of DRAFT_FIELDS) {
    if (field in partial) changed[field] = partial[field] ?? ''
  }
  if (Object.keys(changed).length === 0) return

  try {
    const current = readCheckoutDraft(cartId) ?? {}
    const stored: StoredDraft = { cartId, fields: { ...current, ...changed } }
    storage()?.setItem(STORAGE_KEY, JSON.stringify(stored))
  } catch {
    // Storage full or blocked: the fields still live in the store for this page.
  }
}

export function clearCheckoutDraft(): void {
  try {
    storage()?.removeItem(STORAGE_KEY)
  } catch {
    // Nothing to clear.
  }
}
