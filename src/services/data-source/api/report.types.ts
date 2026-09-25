/**
 * Reporting and billing payloads exactly as the API returns them.
 *
 * Mirrors `modules/reports/reports.service.ts` and
 * `modules/billing/dto/invoice-response.ts`. Money is a string throughout, as
 * everywhere else in this API — these are NUMERIC columns, and a report that
 * rounded its own totals in the client's JSON parser would not reconcile
 * against the invoice drawn from the same rows.
 */

export type ApiGranularity = 'day' | 'week' | 'month'

/** Headline spend for a window, with the trend against the one before it. */
export interface ApiSpendSummary {
  from: string
  to: string
  totalSpend: string
  orderCount: number
  averageOrderValue: string
  siteCount: number
  previous: {
    totalSpend: string
    orderCount: number
  }
  /**
   * Null when the previous window had nothing to compare against — a month
   * following a month of zero has not grown by infinity.
   */
  spendGrowthPercent: number | null
  orderGrowthPercent: number | null
}

export interface ApiSpendBucket {
  /** The bucket's start, ISO. Empty buckets are included. */
  bucket: string
  spend: string
  orders: number
}

export interface ApiSpendOverTime {
  granularity: ApiGranularity
  buckets: ApiSpendBucket[]
}

/** One row of a spend breakdown — per site, per category, per account. */
export interface ApiDimensionRow {
  id: string
  label: string
  sublabel?: string
  spend: string
  orders: number
  sharePercent: number
}

export interface ApiTopProduct {
  productId: string
  sku: string
  name: string
  categoryName: string
  quantity: number
  spend: string
  orders: number
}

/** One status in the windowed pipeline breakdown. */
export interface ApiStatusRow {
  status: string
  orders: number
  value: string
  sharePercent: number
}

/**
 * The live queue, as of now rather than over the reporting window.
 *
 * These are the only figures on a dashboard that ignore the date range, and
 * deliberately so: an order placed six weeks ago and still in production is
 * work somebody is waiting on today. A windowed count would hide exactly the
 * orders that are stuck — the longer one sat, the more certainly it vanished.
 */
export interface ApiDashboardQueue {
  /** Submitted and not yet finished. */
  open: number
  awaitingApproval: number
  /** Approved and not yet delivered — the fulfilment board's working set. */
  inFulfilment: number
  /** Approved or in production: what the warehouse still has to pick. */
  awaitingDispatch: number
  inTransit: number
}

export interface ApiDashboardNetwork {
  activeSites: number
  /**
   * Customer accounts on the platform. Null outside `scope=platform` — how
   * many other customers exist is not a tenant's business, and the API leaves
   * the field present but empty rather than serving two response shapes.
   */
  activeAccounts: number | null
}

export interface ApiDashboardPace {
  ordersPerDay: number
  busiestBucket: string | null
  busiestBucketOrders: number
}

/**
 * `GET /reports/dashboard` — every card and chart on a dashboard, in one call.
 *
 * Replaces the five parallel requests this adapter used to compose. Fewer round
 * trips is the smaller half of it: the range is now resolved once on the
 * server, so the cards can no longer disagree with the chart beside them the
 * way five independently-defaulted windows could across midnight.
 *
 * `scope=platform` spans every customer and is administrator-only; the default
 * `account` scope reports on the caller's own account, or on `accountId` when
 * an administrator supplies one.
 */
export interface ApiDashboardReport {
  scope: 'account' | 'platform'
  /** Null in platform scope, where the figures span every customer. */
  accountId: string | null
  from: string
  to: string
  granularity: ApiGranularity
  spend: ApiSpendSummary
  pace: ApiDashboardPace
  trend: ApiSpendBucket[]
  /** Windowed, and counts every status including rejected and cancelled. */
  byStatus: ApiStatusRow[]
  queue: ApiDashboardQueue
  network: ApiDashboardNetwork
  topSites: ApiDimensionRow[]
}

// --- Billing -------------------------------------------------------------------

export type ApiInvoiceStatus = 'DRAFT' | 'ISSUED' | 'PAID' | 'VOID'

export interface ApiInvoiceLine {
  id: string
  orderId: string
  orderNumber: string
  orderedAt: string
  siteId: string
  siteCode: string
  siteName: string
  costCentre: string | null
  poNumber: string | null
  campaignCode: string | null
  customerReference?: string | null
  itemCount: number
  amount: string
  /** The fields below are absent from an API build before invoice items. */
  tax?: string
  billingAddress?: ApiInvoiceAddress | null
  placedByName?: string | null
  placedByEmail?: string | null
  placedByRole?: string | null
  shippingAddress?: ApiInvoiceAddress | null
  recipientName?: string | null
  deliveryNotes?: string | null
  orderNotes?: string | null
  orderStatus?: string | null
  trackingNumber?: string | null
  /** What was billed on the order, line by line, and its delivery charge. */
  items?: ApiInvoiceItem[]
}

export interface ApiInvoiceAddress {
  label: string | null
  recipientName: string | null
  line1: string
  line2: string | null
  city: string
  region: string | null
  postcode: string
  country: string
  phone: string | null
}

export interface ApiInvoiceItem {
  id: string
  sequence: number
  /** PRODUCT for an order line; DELIVERY for the order's delivery charge. */
  kind: string
  orderLineId: string | null
  sku: string
  name: string
  variantSku: string | null
  uom: string | null
  packSize: number | null
  quantity: number
  unitPrice: string
  lineValue: string
  /** STANDARD, ZERO_RATED or EXEMPT. */
  taxTreatment: string
  taxAmount: string
  notes: string | null
}

export interface ApiInvoiceSite {
  siteId: string
  siteCode: string
  siteName: string
  orders: number
  amount: string
}

export interface ApiInvoice {
  id: string
  /** Null while it is a draft — a draft holds no number, by design. */
  invoiceNumber: string | null
  accountId: string
  accountCode: string
  accountName: string
  billingPeriod: string
  status: ApiInvoiceStatus
  subtotal: string
  tax: string
  total: string
  orderCount: number
  siteCount: number
  issuedAt: string | null
  dueAt: string | null
  paidAt: string | null
  paymentReference: string | null
  overdue: boolean
  voidReason: string | null
  notes: string | null
  createdAt: string
  updatedAt: string
  /** Absent from an API build before GST. */
  pricesIncludeTax?: boolean
  taxRatePercent?: string | null
  /** Present only on the single-invoice read. */
  lines?: ApiInvoiceLine[]
  sites?: ApiInvoiceSite[]
}

/**
 * The KPI figures above the billing table.
 *
 * `unbilledOrders` is the number worth watching: shipped orders in the period
 * that are on no issued invoice. Without it a month can look fully settled
 * while a dozen orders sit outside every invoice.
 */
export interface ApiPeriodSummary {
  billingPeriod: string
  totalSpend: string
  invoicedTotal: string
  unbilledTotal: string
  sitesBilled: number
  invoicedOrders: number
  unbilledOrders: number
  invoices: {
    draft: number
    issued: number
    paid: number
    void: number
  }
  settled: boolean
}

// --- Analytics reports -----------------------------------------------------------

/**
 * The window and scope every analytics report accepts (`ReportRangeQuerySchema`).
 *
 * `from` is inclusive and `to` exclusive, both ISO. Omitted, the server reports
 * on the last thirty days. `accountId` is honoured for administrators only —
 * everyone else is pinned to their own account whatever they send.
 */
export interface ApiReportRangeQuery {
  from?: string
  to?: string
  siteId?: string
  accountId?: string
  granularity?: ApiGranularity
}

/** `GET /reports/products/top` — ranked by money or by units. */
export interface ApiTopProductsQuery extends ApiReportRangeQuery {
  by?: 'spend' | 'quantity'
  /** 1–100, default 10. */
  limit?: number
}

/** `GET /reports/inventory` and `/reports/inventory/turnover`: 1–500, default 100. */
export interface ApiInventoryQuery {
  limit?: number
}

export type ApiInventoryTurnoverQuery = ApiReportRangeQuery & ApiInventoryQuery

/** `GET /reports/orders/velocity` — how fast orders arrive, not what they are worth. */
export interface ApiVelocityReport {
  from: string
  to: string
  days: number
  orders: number
  /** Orders per day across the window, to one decimal place. */
  ordersPerDay: number
  busiestBucket: string | null
  busiestBucketOrders: number
  granularity: ApiGranularity
  buckets: ApiSpendBucket[]
  /** Against the same-length window before. Null when that one was empty. */
  velocityGrowthPercent: number | null
}

export type ApiInventoryStockStatus = 'OUT_OF_STOCK' | 'LOW' | 'HEALTHY'

export interface ApiInventoryReportItem {
  productId: string
  sku: string
  name: string
  stockOnHand: number
  stockReserved: number
  available: number
  lowStockThreshold: number
  reorderQuantity: number | null
  status: ApiInventoryStockStatus
}

/**
 * `GET /reports/inventory` — the warehouse "needs attention" list. Healthy
 * lines are trimmed server-side; the counts above the list are not.
 */
export interface ApiInventoryReport {
  trackedProducts: number
  lowStock: number
  outOfStock: number
  totalUnitsOnHand: number
  totalUnitsReserved: number
  items: ApiInventoryReportItem[]
}

/** One row of `GET /reports/inventory/turnover`. */
export interface ApiInventoryTurnoverRow {
  productId: string
  sku: string
  name: string
  /** DISPATCHED and DELIVERED orders only. */
  unitsShipped: number
  stockOnHand: number
  /** Units shipped in the window over stock on hand now. Null with no stock. */
  turnoverRatio: number | null
  /** At this rate, how long the shelf lasts. Null when nothing moved. */
  daysOfCover: number | null
}

/** The tabular reports that have `.csv` and `.xlsx` siblings. */
export type ApiReportExportName =
  | 'spend/over-time'
  | 'spend/by-account'
  | 'spend/by-region'
  | 'orders/by-status'
  | 'orders/velocity'
  | 'products/top'
  | 'inventory'
  | 'inventory/turnover'

export type ApiReportExportFormat = 'csv' | 'xlsx'
