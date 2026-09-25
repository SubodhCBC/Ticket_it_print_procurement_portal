// src/services/checkout.service.ts
import { toApiError } from '@/services/api.service'
import { placeOrder } from '@/services/orders.service'
import type { PlaceOrderInput } from '@/services/data-source/api/api-orders.adapter'
import type { ApiCartIssue } from '@/services/data-source/api/cart.types'
import type { Order } from '@/types'

/**
 * Placing an order from a screen: the one call, and what each way it can fail
 * means for the buyer.
 *
 * Shared by the checkout review step and the quick purchase-order page, which
 * used to handle failures separately and had drifted — one read every 5xx as
 * "we cannot tell whether it was placed", which stopped being true once
 * `POST /orders` accepted the basket id.
 */

/** The server's `Retry-After` for an aborted transaction. */
const RETRY_AFTER_MS = 1_000

/**
 * `POST /orders`, retried once when the server says the attempt was rolled back.
 *
 * `TRANSACTION_ABORTED` is the database running out of time or losing a
 * deadlock: nothing was saved, and the server marks it retryable. One quiet
 * retry turns most of those into a placed order instead of an error the buyer
 * has to act on. Only that code is retried — any other failure could follow a
 * commit, and is left to `describePlacementFailure`.
 */
export async function placeReviewedOrder(
  input: PlaceOrderInput
): Promise<Order> {
  try {
    return await placeOrder(input)
  } catch (error) {
    if (!isRolledBack(error)) throw error
    await new Promise((resolve) => setTimeout(resolve, RETRY_AFTER_MS))
    return placeOrder(input)
  }
}

export type PlacementFailure =
  /** The basket or the order details are refused; `issues` says what to fix. */
  | { kind: 'not-ready'; message: string; issues: ApiCartIssue[] }
  /** The open basket is no longer the one reviewed. Nothing was placed. */
  | { kind: 'basket-changed'; message: string }
  /** Rolled back twice. Nothing was saved; trying again is safe. */
  | { kind: 'busy'; message: string }
  /**
   * No answer, or a server fault. The order may have been written. Trying again
   * with the same basket id is still safe — it returns that order if so.
   */
  | { kind: 'unconfirmed'; message: string }
  | { kind: 'session-expired'; message: string }
  /** Anything else the server refused: a permission, a malformed field. */
  | { kind: 'refused'; message: string }

/** Names the fields `POST /orders` validates, for a 400's message. */
const FIELD_LABELS: Record<string, string> = {
  recipientName: 'Contact name',
  recipientPhone: 'Contact phone',
  recipientEmail: 'Contact email',
  deliveryNotes: 'Delivery instructions',
  projectCode: 'Project code',
  cartId: 'Basket',
  siteId: 'Branch',
}

export function describePlacementFailure(error: unknown): PlacementFailure {
  const apiError = toApiError(error)
  const { status, details } = apiError

  if (status === 401) {
    return {
      kind: 'session-expired',
      message:
        'Your session has expired. Sign in again to place this order — your basket is saved.',
    }
  }

  if (status === 409) {
    return {
      kind: 'basket-changed',
      message:
        'Your basket changed after you reviewed it, so nothing was placed. Check the updated basket, then submit again.',
    }
  }

  if (status === 422) {
    const issues = cartIssuesOf(details)
    return {
      kind: 'not-ready',
      message:
        issues.length > 0
          ? 'This order is not ready yet — see the items listed above.'
          : apiError.message,
      issues,
    }
  }

  if (status === 400) {
    const fields = fieldIssuesOf(details)
    return {
      kind: 'refused',
      message:
        fields.length > 0
          ? `Check these details: ${fields.join('; ')}.`
          : apiError.message,
    }
  }

  if (isRolledBack(apiError)) {
    return {
      kind: 'busy',
      message:
        'The server was too busy to place the order, and nothing was saved. Please try again in a moment.',
    }
  }

  if (status === 0 || status >= 500) {
    return {
      kind: 'unconfirmed',
      message:
        'We could not confirm whether your order was placed. Trying again is safe: if it went through, you will be taken to it rather than charged twice.',
    }
  }

  return { kind: 'refused', message: apiError.message }
}

function isRolledBack(error: unknown): boolean {
  const apiError = toApiError(error)
  return (
    apiError.status === 503 &&
    (apiError.code === 'TRANSACTION_ABORTED' ||
      apiError.details?.retryable === true)
  )
}

/** A 422's basket issues: `{ code, message, lineId }`, as validation reports them. */
function cartIssuesOf(
  details: Record<string, unknown> | undefined
): ApiCartIssue[] {
  const issues = details?.issues
  if (!Array.isArray(issues)) return []
  return issues.filter(
    (issue): issue is ApiCartIssue =>
      typeof issue === 'object' &&
      issue !== null &&
      typeof (issue as ApiCartIssue).code === 'string' &&
      typeof (issue as ApiCartIssue).message === 'string'
  )
}

/** A 400's field issues, `{ path, message }`, as "Contact email: Invalid email". */
function fieldIssuesOf(details: Record<string, unknown> | undefined): string[] {
  const issues = details?.issues
  if (!Array.isArray(issues)) return []
  return issues
    .filter(
      (issue): issue is { path: string; message: string } =>
        typeof issue === 'object' &&
        issue !== null &&
        typeof (issue as { message?: unknown }).message === 'string'
    )
    .map((issue) => {
      const label = FIELD_LABELS[issue.path] ?? issue.path
      return label ? `${label}: ${issue.message}` : issue.message
    })
}
