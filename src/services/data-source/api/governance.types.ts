// src/services/data-source/api/governance.types.ts

/**
 * The governance reports and one-click re-order, as the API serves them.
 *
 * Mirrors `src/server/reports/governance-reports.service.ts` and
 * `src/server/orders/reorder.service.ts`. Dates arrive as ISO strings; money as
 * strings, like every other money value from this API.
 */

// --- Approval activity (§15) ------------------------------------------------

export type ApiApprovalOutcome = 'APPROVED' | 'REJECTED' | 'CHANGES_REQUESTED'

/** How the order came to need a decision: an approval rule, or the account threshold. */
export type ApiApprovalRoute = 'RULE' | 'THRESHOLD'

export interface ApiApprovalDecision {
  decidedAt: string
  orderId: string
  orderNumber: string
  siteCode: string
  siteName: string
  orderTotal: string
  submittedAt: string
  /** Submission to decision, one decimal place: the approval cycle time. */
  hoursToDecision: number
  route: ApiApprovalRoute
  /** The rule tier decided; null for a threshold hold. */
  tier: number | null
  approverId: string | null
  approverName: string
  approverRole: string | null
  outcome: ApiApprovalOutcome
  comment: string | null
}

export interface ApiApproverSummary {
  approverId: string | null
  approverName: string
  decisions: number
  approved: number
  rejected: number
  changesRequested: number
  averageHoursToDecision: number
  medianHoursToDecision: number
}

export interface ApiApprovalActivityReport {
  from: string
  to: string
  totals: Omit<ApiApproverSummary, 'approverId' | 'approverName'>
  byApprover: ApiApproverSummary[]
  /** Newest first. */
  decisions: ApiApprovalDecision[]
}

export interface ApprovalActivityParams {
  accountId?: string
  siteId?: string
  approverId?: string
  outcome?: ApiApprovalOutcome
  /** ISO 8601. */
  from?: string
  /** ISO 8601, exclusive. */
  to?: string
}

// --- User access review (§12, §15) --------------------------------------------

export interface ApiAccessReviewUser {
  userId: string
  login: string
  name: string
  email: string
  role: string
  userType: string
  status: string
  primarySite: string | null
  /** Branch codes beyond the primary, comma separated. */
  additionalSites: string
  /** Per-user overrides of the role, e.g. `ALLOW REPORT_VIEW`. */
  permissionOverrides: string
  lastLoginAt: string | null
  /** Whole days since the last sign-in; null for someone who never has. */
  daysSinceLastLogin: number | null
  activatedAt: string | null
  createdAt: string
  deactivatedAt: string | null
}

export interface ApiAccessReviewReport {
  accountId: string
  asOf: string
  users: ApiAccessReviewUser[]
}

export interface AccessReviewParams {
  accountId?: string
  includeInactive?: boolean
}

// --- Order ageing (§15) -----------------------------------------------------------

export type ApiOpenOrderStatus =
  | 'PENDING_APPROVAL'
  | 'CHANGES_REQUESTED'
  | 'APPROVED'
  | 'PROCESSING'
  | 'DISPATCHED'

export interface ApiAgeingOrder {
  orderId: string
  orderNumber: string
  status: ApiOpenOrderStatus
  siteCode: string
  siteName: string
  placedByName: string
  poNumber: string | null
  total: string
  placedAt: string
  inStatusSince: string
  daysOpen: number
  daysInStatus: number
  /** One of the report's `bands` labels, e.g. "8–14 days". */
  band: string
}

export interface ApiAgeingStatus {
  status: ApiOpenOrderStatus
  orders: number
  value: string
  oldestDaysInStatus: number
  /** Orders per band, keyed by band label. */
  bands: Record<string, number>
}

export interface ApiOrderAgeingReport {
  asOf: string
  /** Band labels, youngest first. */
  bands: string[]
  byStatus: ApiAgeingStatus[]
  /** Longest in their status first. */
  orders: ApiAgeingOrder[]
}

export interface OrderAgeingParams {
  accountId?: string
  siteId?: string
  status?: ApiOpenOrderStatus
}

// --- Report files ----------------------------------------------------------------

export type ReportFileFormat = 'csv' | 'xlsx'

/**
 * Every tabular report with a file form (SOW §15: CSV and XLSX on every tabular
 * report). The value is the path under `/reports`; the file is that path with
 * `.csv` or `.xlsx` appended, and takes the same query as the JSON route.
 */
export type ReportFileKey =
  | 'approvals/activity'
  | 'approvals/activity-by-approver'
  | 'users/access-review'
  | 'orders/ageing'
  | 'orders/by-status'
  | 'orders/history'
  | 'orders/velocity'
  | 'products/top'
  | 'spend/by-account'
  | 'spend/by-category'
  | 'spend/by-region'
  | 'spend/by-site'
  | 'spend/over-time'
  | 'inventory'
  | 'inventory/turnover'

// --- One-click re-order (M-08) --------------------------------------------------------

export type ApiReorderReasonCode =
  | 'PRODUCT_WITHDRAWN'
  | 'PRODUCT_REPLACED'
  | 'DESIGN_WITHDRAWN'
  | 'DESIGN_REQUIRED'
  | 'REFUSED'

export interface ApiReorderLine {
  orderLineId: string
  sku: string
  name: string
  quantity: number
  outcome: 'ADDED' | 'UNAVAILABLE'
  reasonCode: ApiReorderReasonCode | null
  reason: string | null
  replacedBy: { productId: string; sku: string; name: string } | null
}
