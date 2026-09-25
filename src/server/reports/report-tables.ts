import type {
  AccessReviewRow,
  AgeingOrderRow,
  ApprovalDecisionRow,
  ApproverSummaryRow,
  OrderHistoryLineRow,
} from './governance-reports.service'
import type { ReportTable } from './report-table'
import type {
  DimensionRow,
  InventoryReport,
  SpendBucket,
  StatusRow,
  TopProductRow,
  TurnoverRow,
} from './reports.service'

/**
 * The columns of every tabular report (SOW §15: "CSV and XLSX for every tabular
 * report").
 *
 * One definition per report, read by both its `.csv` and its `.xlsx` route, over
 * the same rows its JSON route returns — so the three cannot disagree. Headers
 * are what a reader sees, not field names; the two CSVs that existed before this
 * file keep their headers exactly, because a spreadsheet somewhere may already
 * look them up by name.
 *
 * `verify-report-exports.mjs` checks that every table here has both routes.
 */

// --- Spend ------------------------------------------------------------------

export const SPEND_BY_SITE: ReportTable<DimensionRow> = {
  name: 'spend-by-branch',
  title: 'Spend by branch',
  columns: [
    {
      header: 'Branch code',
      kind: 'text',
      value: (row) => row.sublabel,
      width: 14,
    },
    { header: 'Branch', kind: 'text', value: (row) => row.label, width: 32 },
    { header: 'Orders', kind: 'integer', value: (row) => row.orders },
    { header: 'Spend', kind: 'money', value: (row) => row.spend },
    { header: 'Share %', kind: 'percent', value: (row) => row.sharePercent },
  ],
}

export const SPEND_BY_CATEGORY: ReportTable<DimensionRow> = {
  name: 'spend-by-category',
  title: 'Spend by category',
  columns: [
    { header: 'Category', kind: 'text', value: (row) => row.label, width: 32 },
    { header: 'Orders', kind: 'integer', value: (row) => row.orders },
    { header: 'Spend', kind: 'money', value: (row) => row.spend },
    { header: 'Share %', kind: 'percent', value: (row) => row.sharePercent },
  ],
}

export const SPEND_BY_ACCOUNT: ReportTable<DimensionRow> = {
  name: 'spend-by-account',
  title: 'Spend by account',
  columns: [
    {
      header: 'Account code',
      kind: 'text',
      value: (row) => row.sublabel,
      width: 16,
    },
    { header: 'Account', kind: 'text', value: (row) => row.label, width: 32 },
    { header: 'Orders', kind: 'integer', value: (row) => row.orders },
    { header: 'Spend', kind: 'money', value: (row) => row.spend },
    { header: 'Share %', kind: 'percent', value: (row) => row.sharePercent },
  ],
}

export const SPEND_BY_REGION: ReportTable<DimensionRow> = {
  name: 'spend-by-region',
  title: 'Spend by region',
  columns: [
    { header: 'Region', kind: 'text', value: (row) => row.label, width: 28 },
    { header: 'Orders', kind: 'integer', value: (row) => row.orders },
    { header: 'Spend', kind: 'money', value: (row) => row.spend },
    { header: 'Share %', kind: 'percent', value: (row) => row.sharePercent },
  ],
}

export const SPEND_OVER_TIME: ReportTable<SpendBucket> = {
  name: 'spend-over-time',
  title: 'Spend over time',
  columns: [
    { header: 'Period', kind: 'text', value: (row) => row.bucket, width: 14 },
    { header: 'Orders', kind: 'integer', value: (row) => row.orders },
    { header: 'Spend', kind: 'money', value: (row) => row.spend },
  ],
}

// --- Orders -----------------------------------------------------------------

export const ORDERS_BY_STATUS: ReportTable<StatusRow> = {
  name: 'orders-by-status',
  title: 'Orders by status',
  columns: [
    { header: 'Status', kind: 'text', value: (row) => row.status, width: 20 },
    { header: 'Orders', kind: 'integer', value: (row) => row.orders },
    { header: 'Value', kind: 'money', value: (row) => row.value },
    { header: 'Share %', kind: 'percent', value: (row) => row.sharePercent },
  ],
}

export const ORDER_VELOCITY: ReportTable<SpendBucket> = {
  name: 'order-velocity',
  title: 'Order velocity',
  columns: [
    { header: 'Period', kind: 'text', value: (row) => row.bucket, width: 14 },
    { header: 'Orders', kind: 'integer', value: (row) => row.orders },
    { header: 'Spend', kind: 'money', value: (row) => row.spend },
  ],
}

export const TOP_PRODUCTS: ReportTable<TopProductRow> = {
  name: 'top-products',
  title: 'Top ordered SKUs',
  columns: [
    { header: 'SKU', kind: 'text', value: (row) => row.sku, width: 22 },
    { header: 'Product', kind: 'text', value: (row) => row.name, width: 36 },
    { header: 'Category', kind: 'text', value: (row) => row.categoryName },
    { header: 'Quantity', kind: 'integer', value: (row) => row.quantity },
    { header: 'Orders', kind: 'integer', value: (row) => row.orders },
    { header: 'Spend', kind: 'money', value: (row) => row.spend },
  ],
}

export const ORDER_AGEING: ReportTable<AgeingOrderRow> = {
  name: 'order-ageing',
  title: 'Order ageing',
  columns: [
    {
      header: 'Order',
      kind: 'text',
      value: (row) => row.orderNumber,
      width: 18,
    },
    { header: 'Status', kind: 'text', value: (row) => row.status, width: 18 },
    {
      header: 'Days in status',
      kind: 'integer',
      value: (row) => row.daysInStatus,
    },
    { header: 'Band', kind: 'text', value: (row) => row.band, width: 12 },
    { header: 'Days open', kind: 'integer', value: (row) => row.daysOpen },
    {
      header: 'In status since',
      kind: 'datetime',
      value: (row) => row.inStatusSince,
    },
    { header: 'Placed', kind: 'datetime', value: (row) => row.placedAt },
    {
      header: 'Branch code',
      kind: 'text',
      value: (row) => row.siteCode,
      width: 14,
    },
    { header: 'Branch', kind: 'text', value: (row) => row.siteName, width: 28 },
    { header: 'Placed by', kind: 'text', value: (row) => row.placedByName },
    {
      header: 'Purchase order',
      kind: 'text',
      value: (row) => row.poNumber,
      width: 20,
    },
    { header: 'Total', kind: 'money', value: (row) => row.total },
  ],
}

export const ORDER_HISTORY: ReportTable<OrderHistoryLineRow> = {
  name: 'order-history',
  title: 'Order history',
  columns: [
    {
      header: 'Order',
      kind: 'text',
      value: (row) => row.orderNumber,
      width: 18,
    },
    { header: 'Placed', kind: 'datetime', value: (row) => row.placedAt },
    { header: 'Status', kind: 'text', value: (row) => row.status, width: 18 },
    {
      header: 'Branch code',
      kind: 'text',
      value: (row) => row.siteCode,
      width: 14,
    },
    { header: 'Branch', kind: 'text', value: (row) => row.siteName, width: 28 },
    { header: 'Placed by', kind: 'text', value: (row) => row.placedByName },
    {
      header: 'Placed by email',
      kind: 'text',
      value: (row) => row.placedByEmail,
      width: 30,
    },
    {
      header: 'Purchase order',
      kind: 'text',
      value: (row) => row.poNumber,
      width: 20,
    },
    {
      header: 'Customer reference',
      kind: 'text',
      value: (row) => row.customerReference,
    },
    {
      header: 'Campaign',
      kind: 'text',
      value: (row) => row.campaignCode,
      width: 16,
    },
    {
      header: 'Project',
      kind: 'text',
      value: (row) => row.projectCode,
      width: 16,
    },
    { header: 'SKU', kind: 'text', value: (row) => row.sku, width: 22 },
    {
      header: 'Option SKU',
      kind: 'text',
      value: (row) => row.variantSku,
      width: 28,
    },
    {
      header: 'Product',
      kind: 'text',
      value: (row) => row.productName,
      width: 36,
    },
    { header: 'Quantity', kind: 'integer', value: (row) => row.quantity },
    { header: 'Unit price', kind: 'money', value: (row) => row.unitPrice },
    { header: 'Line total', kind: 'money', value: (row) => row.lineTotal },
    { header: 'Order total', kind: 'money', value: (row) => row.orderTotal },
  ],
}

// --- Governance ---------------------------------------------------------------

export const APPROVAL_ACTIVITY: ReportTable<ApprovalDecisionRow> = {
  name: 'approval-activity',
  title: 'Approval activity',
  columns: [
    { header: 'Decided', kind: 'datetime', value: (row) => row.decidedAt },
    {
      header: 'Approver',
      kind: 'text',
      value: (row) => row.approverName,
      width: 28,
    },
    {
      header: 'Approver role',
      kind: 'text',
      value: (row) => row.approverRole,
      width: 16,
    },
    { header: 'Outcome', kind: 'text', value: (row) => row.outcome, width: 20 },
    { header: 'Route', kind: 'text', value: (row) => row.route, width: 12 },
    { header: 'Tier', kind: 'integer', value: (row) => row.tier },
    {
      header: 'Order',
      kind: 'text',
      value: (row) => row.orderNumber,
      width: 18,
    },
    {
      header: 'Branch code',
      kind: 'text',
      value: (row) => row.siteCode,
      width: 14,
    },
    { header: 'Branch', kind: 'text', value: (row) => row.siteName, width: 28 },
    { header: 'Order total', kind: 'money', value: (row) => row.orderTotal },
    { header: 'Submitted', kind: 'datetime', value: (row) => row.submittedAt },
    {
      header: 'Hours to decision',
      kind: 'decimal',
      value: (row) => row.hoursToDecision,
    },
    { header: 'Comment', kind: 'text', value: (row) => row.comment, width: 40 },
  ],
}

export const APPROVAL_ACTIVITY_BY_APPROVER: ReportTable<ApproverSummaryRow> = {
  name: 'approval-activity-by-approver',
  title: 'Approvals by approver',
  columns: [
    {
      header: 'Approver',
      kind: 'text',
      value: (row) => row.approverName,
      width: 28,
    },
    { header: 'Decisions', kind: 'integer', value: (row) => row.decisions },
    { header: 'Approved', kind: 'integer', value: (row) => row.approved },
    { header: 'Rejected', kind: 'integer', value: (row) => row.rejected },
    {
      header: 'Changes requested',
      kind: 'integer',
      value: (row) => row.changesRequested,
    },
    {
      header: 'Average hours',
      kind: 'decimal',
      value: (row) => row.averageHoursToDecision,
    },
    {
      header: 'Median hours',
      kind: 'decimal',
      value: (row) => row.medianHoursToDecision,
    },
  ],
}

export const ACCESS_REVIEW: ReportTable<AccessReviewRow> = {
  name: 'user-access-review',
  title: 'User access review',
  columns: [
    { header: 'Login', kind: 'text', value: (row) => row.login, width: 22 },
    { header: 'Name', kind: 'text', value: (row) => row.name, width: 26 },
    { header: 'Email', kind: 'text', value: (row) => row.email, width: 32 },
    { header: 'Role', kind: 'text', value: (row) => row.role, width: 14 },
    {
      header: 'User type',
      kind: 'text',
      value: (row) => row.userType,
      width: 12,
    },
    { header: 'Status', kind: 'text', value: (row) => row.status, width: 12 },
    {
      header: 'Primary branch',
      kind: 'text',
      value: (row) => row.primarySite,
      width: 30,
    },
    {
      header: 'Additional branches',
      kind: 'text',
      value: (row) => row.additionalSites,
      width: 26,
    },
    {
      header: 'Permission overrides',
      kind: 'text',
      value: (row) => row.permissionOverrides,
      width: 40,
    },
    { header: 'Last login', kind: 'datetime', value: (row) => row.lastLoginAt },
    {
      header: 'Days since last login',
      kind: 'integer',
      value: (row) => row.daysSinceLastLogin,
    },
    { header: 'Activated', kind: 'datetime', value: (row) => row.activatedAt },
    { header: 'Created', kind: 'datetime', value: (row) => row.createdAt },
    {
      header: 'Deactivated',
      kind: 'datetime',
      value: (row) => row.deactivatedAt,
    },
  ],
}

// --- Inventory ----------------------------------------------------------------

export const INVENTORY: ReportTable<InventoryReport['items'][number]> = {
  name: 'inventory',
  title: 'Inventory',
  columns: [
    { header: 'SKU', kind: 'text', value: (row) => row.sku, width: 22 },
    { header: 'Product', kind: 'text', value: (row) => row.name, width: 36 },
    { header: 'Status', kind: 'text', value: (row) => row.status, width: 14 },
    { header: 'On hand', kind: 'integer', value: (row) => row.stockOnHand },
    { header: 'Reserved', kind: 'integer', value: (row) => row.stockReserved },
    { header: 'Available', kind: 'integer', value: (row) => row.available },
    {
      header: 'Low-stock threshold',
      kind: 'integer',
      value: (row) => row.lowStockThreshold,
    },
    {
      header: 'Reorder quantity',
      kind: 'integer',
      value: (row) => row.reorderQuantity,
    },
  ],
}

export const INVENTORY_TURNOVER: ReportTable<TurnoverRow> = {
  name: 'inventory-turnover',
  title: 'Inventory turnover',
  columns: [
    { header: 'SKU', kind: 'text', value: (row) => row.sku, width: 22 },
    { header: 'Product', kind: 'text', value: (row) => row.name, width: 36 },
    {
      header: 'Units shipped',
      kind: 'integer',
      value: (row) => row.unitsShipped,
    },
    { header: 'On hand', kind: 'integer', value: (row) => row.stockOnHand },
    {
      header: 'Turnover ratio',
      kind: 'decimal',
      value: (row) => row.turnoverRatio,
    },
    {
      header: 'Days of cover',
      kind: 'decimal',
      value: (row) => row.daysOfCover,
    },
  ],
}

/** Every table, for the completeness check. */
export const REPORT_TABLES = [
  SPEND_BY_SITE,
  SPEND_BY_CATEGORY,
  SPEND_BY_ACCOUNT,
  SPEND_BY_REGION,
  SPEND_OVER_TIME,
  ORDERS_BY_STATUS,
  ORDER_VELOCITY,
  TOP_PRODUCTS,
  ORDER_AGEING,
  ORDER_HISTORY,
  APPROVAL_ACTIVITY,
  APPROVAL_ACTIVITY_BY_APPROVER,
  ACCESS_REVIEW,
  INVENTORY,
  INVENTORY_TURNOVER,
] as const
