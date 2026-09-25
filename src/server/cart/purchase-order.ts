/**
 * The purchase-order rule, and whether a given reference satisfies it.
 *
 * Pure and free of Prisma: SOW QA-01 names "PO format validator" as a unit-test
 * target, and BE-06 re-checks the same rule when a cart becomes an order —
 * because the rule can change between the two, and an order that reaches
 * production without a valid PO is one finance cannot pay against.
 */
import {
  examplePoReference,
  matchPoFormat,
  parsePoFormat,
} from '@/lib/po-format'

/** Where a purchase-order rule can come from. */
export interface PurchaseOrderPolicySource {
  /** The branch's own rule. Null fields mean "not set here". */
  readonly site: {
    readonly poRequired: boolean
    readonly poPrefix: string | null
    readonly poFormat?: string | null
  } | null
  /** The account-wide default. */
  readonly account: {
    readonly requirePoNumber: boolean
    readonly poPrefix: string | null
    readonly poFormat?: string | null
  }
  /**
   * The buyer's own prefix, from `User.poPrefix`. Some customers allocate PO
   * ranges per buyer, and that is narrower than the branch's.
   */
  readonly userPoPrefix?: string | null
}

export interface PurchaseOrderPolicy {
  readonly required: boolean
  readonly prefix: string | null
  /** Which level decided it, so the UI can say why. */
  readonly requiredBy: 'SITE' | 'ACCOUNT' | 'NONE'
  readonly prefixFrom: 'USER' | 'SITE' | 'ACCOUNT' | 'NONE'
  /** The format in force (SOW F-14), e.g. `PO-####-YY`, or null for none. */
  readonly format: string | null
  readonly formatFrom: 'SITE' | 'ACCOUNT' | 'NONE'
  /** A reference that fits, e.g. `PO-1234-26`. Null when there is no format. */
  readonly formatExample: string | null
}

export type PurchaseOrderProblem =
  | 'PO_REQUIRED'
  | 'PO_PREFIX_MISMATCH'
  | 'PO_TOO_SHORT'
  | 'PO_INVALID_CHARACTERS'
  | 'PO_FORMAT_MISMATCH'

export interface PurchaseOrderCheck {
  readonly policy: PurchaseOrderPolicy
  readonly provided: string | null
  readonly valid: boolean
  readonly problem: PurchaseOrderProblem | null
  readonly message: string | null
}

/**
 * A PO reference is quoted on an invoice and keyed into the customer's own
 * finance system, so it is deliberately narrow: letters, digits, dash, slash
 * and underscore. Spaces are excluded because a trailing one is invisible and
 * turns "PO-1234" and "PO-1234 " into two references that will not reconcile.
 */
const PO_PATTERN = /^[A-Za-z0-9][A-Za-z0-9/_-]*$/

/** Short enough to be a typo rather than a reference. */
const MIN_PO_LENGTH = 3

/**
 * Resolves the rule in force.
 *
 * **The site wins over the account, and requirement only ever tightens.** A
 * branch may demand a PO where the account does not; it may not waive one the
 * account requires. The account-level setting is a floor the customer's finance
 * team set centrally, and letting a branch switch it off would make the control
 * meaningless — which is not what "a site may override both" in the schema means
 * and is worth being explicit about here.
 *
 * The prefix narrows the other way: the most specific one wins, because it is
 * the most specific allocation. A buyer with `ACM-JD` sits inside the branch's
 * `ACM`, and checking the buyer's is the stricter test.
 *
 * The format is the branch's when it has one, otherwise the account's. There is
 * no per-buyer format: buyers get PO *ranges*, which is what a prefix already
 * expresses. `now` decides which years `YY` accepts and what the example shows.
 */
export function resolvePurchaseOrderPolicy(
  source: PurchaseOrderPolicySource,
  now: Date = new Date()
): PurchaseOrderPolicy {
  const siteRequires = source.site?.poRequired ?? false
  const accountRequires = source.account.requirePoNumber

  const prefix =
    trimmed(source.userPoPrefix) ??
    trimmed(source.site?.poPrefix) ??
    trimmed(source.account.poPrefix)

  const siteFormat = trimmed(source.site?.poFormat)
  const format = siteFormat ?? trimmed(source.account.poFormat)

  return {
    format,
    formatFrom: siteFormat ? 'SITE' : format ? 'ACCOUNT' : 'NONE',
    formatExample: format ? examplePoReference(format, now) : null,
    required: siteRequires || accountRequires,
    prefix,
    requiredBy: siteRequires ? 'SITE' : accountRequires ? 'ACCOUNT' : 'NONE',
    prefixFrom: trimmed(source.userPoPrefix)
      ? 'USER'
      : trimmed(source.site?.poPrefix)
        ? 'SITE'
        : trimmed(source.account.poPrefix)
          ? 'ACCOUNT'
          : 'NONE',
  }
}

/**
 * Checks a reference against the rule.
 *
 * The prefix is enforced **whenever one is configured and a reference was
 * given**, not only when a PO is required. A customer who supplies a PO
 * voluntarily still needs it to reconcile against their own ledger, and
 * accepting a malformed one because it was optional defeats the point of
 * having a prefix at all.
 *
 * The comparison is case-insensitive, but the reference is stored as typed:
 * finance systems are inconsistent about case and rejecting "acm-1234" against
 * a prefix of "ACM" would be a rule about shift keys rather than about
 * purchase orders.
 */
export function checkPurchaseOrder(
  provided: string | null | undefined,
  policy: PurchaseOrderPolicy,
  now: Date = new Date()
): PurchaseOrderCheck {
  const value = trimmed(provided)

  if (value === null) {
    return policy.required
      ? {
          policy,
          provided: null,
          valid: false,
          problem: 'PO_REQUIRED',
          message: requiredMessage(policy),
        }
      : { policy, provided: null, valid: true, problem: null, message: null }
  }

  if (value.length < MIN_PO_LENGTH) {
    return {
      policy,
      provided: value,
      valid: false,
      problem: 'PO_TOO_SHORT',
      message: `A purchase order reference must be at least ${MIN_PO_LENGTH} characters.`,
    }
  }

  if (!PO_PATTERN.test(value)) {
    return {
      policy,
      provided: value,
      valid: false,
      problem: 'PO_INVALID_CHARACTERS',
      message:
        'A purchase order reference may contain letters, digits, dash, slash and underscore only.',
    }
  }

  if (
    policy.prefix &&
    !value.toUpperCase().startsWith(policy.prefix.toUpperCase())
  ) {
    return {
      policy,
      provided: value,
      valid: false,
      problem: 'PO_PREFIX_MISMATCH',
      message: `This purchase order reference must start with "${policy.prefix}".`,
    }
  }

  // After the prefix, so a reference that is wrong in both ways is told about
  // the simpler mistake first. Enforced whenever a reference is given, for the
  // same reason the prefix is: a voluntary PO still has to reconcile.
  if (policy.format) {
    const mismatch = matchPoFormat(value, policy.format, now)
    if (mismatch) {
      return {
        policy,
        provided: value,
        valid: false,
        problem: 'PO_FORMAT_MISMATCH',
        message: formatMessage(mismatch, policy),
      }
    }
  }

  return { policy, provided: value, valid: true, problem: null, message: null }
}

function requiredMessage(policy: PurchaseOrderPolicy): string {
  if (policy.format && policy.formatExample) {
    return (
      `A purchase order reference is required, in the format "${policy.format}" ` +
      `(for example "${policy.formatExample}").`
    )
  }
  return policy.prefix
    ? `A purchase order reference is required, and must start with "${policy.prefix}".`
    : 'A purchase order reference is required.'
}

/**
 * What to tell the buyer, always with an example: "must match PO-####-YY" is
 * notation, "for example PO-1234-26" is something they can copy the shape of.
 */
function formatMessage(
  mismatch: 'LENGTH' | 'CHARACTER' | 'YEAR',
  policy: PurchaseOrderPolicy
): string {
  const format = policy.format!
  const example = policy.formatExample ?? format
  const parsed = parsePoFormat(format)
  const length = parsed.ok ? parsed.length : format.length

  switch (mismatch) {
    case 'LENGTH':
      return (
        `This purchase order reference must be ${length} characters in the format ` +
        `"${format}" (for example "${example}").`
      )
    case 'YEAR':
      return (
        `The year in this purchase order reference must be last year, this year or ` +
        `next year (for example "${example}").`
      )
    case 'CHARACTER':
      return (
        `This purchase order reference does not match the format "${format}" ` +
        `(for example "${example}").`
      )
  }
}

function trimmed(value: string | null | undefined): string | null {
  if (value == null) return null
  const result = value.trim()
  return result.length > 0 ? result : null
}
