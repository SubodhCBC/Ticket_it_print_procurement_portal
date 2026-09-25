import type { OrderStatus } from '@/types'

/**
 * The approvals payloads exactly as the API returns them.
 *
 * Mirrors `ApprovalRequestView`, `ApprovalStepView` and `ApprovalRuleView` in
 * `src/server/approvals/approval.types.ts`, and the request bodies in
 * `approval.validation.ts`. Money stays a string, as it does on the wire: the
 * columns are NUMERIC and a JSON number would round them.
 */

export type ApprovalPortalRole = 'ADMIN' | 'HEAD_OFFICE' | 'SITE_USER'

export type ApprovalRequestStatus =
  'PENDING' | 'APPROVED' | 'REJECTED' | 'CHANGES_REQUESTED' | 'CANCELLED'

/** SKIPPED: a tier above a refusal, which will never open. */
export type ApprovalStepStatus =
  'PENDING' | 'APPROVED' | 'REJECTED' | 'CHANGES_REQUESTED' | 'SKIPPED'

export type ApprovalDecision = 'APPROVED' | 'REJECTED' | 'CHANGES_REQUESTED'

export interface ApprovalStepView {
  readonly id: string
  readonly tier: number
  readonly ruleId: string | null
  readonly approverRole: ApprovalPortalRole | null
  readonly approverUserId: string | null
  readonly status: ApprovalStepStatus
  readonly decidedById: string | null
  readonly decidedByName: string | null
  readonly decidedAt: string | null
  readonly comment: string | null
  /** True when this step is open for a decision now. */
  readonly isOpen: boolean
}

/**
 * Where a line's picture comes from. Only BUYER_PREVIEW is the artwork as it was
 * ordered; TEMPLATE is the design before personalisation and PRODUCT the blank
 * stock, so a screen says which rather than presenting either as a proof.
 */
export type LineImageSource = 'BUYER_PREVIEW' | 'TEMPLATE' | 'PRODUCT' | 'NONE'

export interface LineImage {
  readonly source: LineImageSource
  /** API path of the buyer's preview; needs the caller's token to fetch. */
  readonly previewPath: string | null
  /** A short-lived link to the template thumbnail or product photograph. */
  readonly imageUrl: string | null
}

export interface ApprovalLineView {
  readonly id: string
  readonly sku: string
  readonly name: string
  readonly variantSku: string | null
  readonly templateId: string | null
  readonly templateName: string | null
  readonly quantity: number
  readonly uom: string
  readonly unitPrice: string
  readonly lineTotal: string
  readonly notes: string | null
  readonly image: LineImage
}

export interface ApprovalRequestView {
  readonly id: string
  readonly orderId: string
  readonly orderNumber: string
  readonly orderStatus: OrderStatus
  readonly orderTotal: string
  readonly poNumber: string | null
  readonly requestedById: string
  readonly requestedByName: string
  readonly siteId: string
  readonly siteCode: string
  readonly siteName: string
  readonly status: ApprovalRequestStatus
  readonly currentTier: number
  /** The total when this round was raised — a resubmitted order can differ. */
  readonly totalAtRequest: string
  /** What is being approved, line by line. Absent from an API build before line images. */
  readonly lines?: readonly ApprovalLineView[]
  readonly steps: readonly ApprovalStepView[]
  readonly createdAt: string
  readonly completedAt: string | null
}

export interface ApprovalRuleView {
  readonly id: string
  readonly name: string
  readonly description: string | null
  readonly active: boolean
  readonly tier: number
  readonly minTotal: string | null
  readonly categoryId: string | null
  readonly categoryName: string | null
  readonly requesterRole: ApprovalPortalRole | null
  readonly siteId: string | null
  readonly approverRole: ApprovalPortalRole | null
  readonly approverUserId: string | null
  /** True when the rule states no conditions and therefore catches everything. */
  readonly matchesEverything: boolean
  readonly createdAt: string
  readonly updatedAt: string
}

/** `GET /approvals` query. `accountId` is honoured for administrators only. */
export interface ListApprovalsParams {
  status?: ApprovalRequestStatus
  accountId?: string
  /** Only what this actor can decide right now. */
  mine?: boolean
  page?: number
  /** At most 100. */
  pageSize?: number
}

/** `POST /approvals/steps/:stepId`. A comment is required unless APPROVED. */
export interface DecideApprovalInput {
  decision: ApprovalDecision
  comment?: string
}

/** The editable fields of a rule. Exactly one of the two approvers is set. */
export interface ApprovalRuleFields {
  name: string
  description: string | null
  active: boolean
  /** An amount such as "1000.00"; the rule matches totals at or above it. */
  minTotal: string | null
  categoryId: string | null
  requesterRole: ApprovalPortalRole | null
  siteId: string | null
  /** 1–20, walked lowest first. */
  tier: number
  approverRole: ApprovalPortalRole | null
  approverUserId: string | null
}

/** `POST /approvals/rules`. `accountId` is honoured for administrators only. */
export interface CreateApprovalRuleInput extends ApprovalRuleFields {
  accountId?: string
}

/** `PATCH /approvals/rules/:ruleId`. */
export type UpdateApprovalRuleInput = Partial<ApprovalRuleFields>
