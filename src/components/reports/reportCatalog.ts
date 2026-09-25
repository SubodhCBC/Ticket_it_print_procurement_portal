// src/components/reports/reportCatalog.ts

import type { ReportFileKey } from '@/services/data-source/api/governance.types'
import type { Permission } from '@/types/auth'

/**
 * The tabular reports shown on the analytics screens (SOW §15).
 *
 * Each entry mirrors its table in `src/server/reports/report-tables.ts` — same
 * headers, same kinds, same row source — because that one definition is what
 * the report's CSV and XLSX are built from, and the acceptance criterion is
 * that the files "contain the same figures as the on-screen view". Keep the two
 * in step: a column added there is a column added here.
 */

export type ColumnKind =
  | 'text'
  | 'integer'
  | 'money'
  | 'percent'
  | 'decimal'
  | 'date'
  | 'datetime'
  | 'status'

type Row = Record<string, unknown>

export interface ReportColumnDef {
  readonly header: string
  readonly kind: ColumnKind
  readonly key: string
}

export interface ReportSummaryTile {
  readonly label: string
  readonly value: (data: Row) => string | number
}

export interface ReportFilters {
  /** From / To. */
  readonly range?: boolean
  /** Day / week / month buckets. */
  readonly granularity?: boolean
  /** Spend or quantity, and how many (top products). */
  readonly topProducts?: boolean
  /** How many rows (inventory). */
  readonly limit?: boolean
  /** Order status (history). */
  readonly orderStatus?: boolean
}

export interface ReportDef {
  readonly key: ReportFileKey
  readonly title: string
  readonly description: string
  readonly group: 'Spend' | 'Orders' | 'Products' | 'Inventory'
  /** What the JSON and file routes require. */
  readonly permission: Permission
  /**
   * Whether the report is about one account (and so takes \`accountId\`), or spans
   * the platform — spend by account and the two inventory reports.
   */
  readonly accountScoped: boolean
  readonly filters: ReportFilters
  /** The rows in the JSON response. */
  readonly rows: (data: unknown) => Row[]
  readonly columns: readonly ReportColumnDef[]
  /** Headline figures the API itself returns alongside the rows. */
  readonly summary?: readonly ReportSummaryTile[]
  /** Paged on screen; the file still carries every row in the window. */
  readonly paged?: boolean
}

const asArray = (data: unknown): Row[] =>
  Array.isArray(data) ? (data as Row[]) : []
const field =
  (name: string) =>
  (data: unknown): Row[] => {
    const value = (data as Row | null)?.[name]
    return Array.isArray(value) ? (value as Row[]) : []
  }

const DIMENSION_TAIL: readonly ReportColumnDef[] = [
  { header: 'Orders', kind: 'integer', key: 'orders' },
  { header: 'Spend', kind: 'money', key: 'spend' },
  { header: 'Share %', kind: 'percent', key: 'sharePercent' },
]

export const REPORT_CATALOG: readonly ReportDef[] = [
  // --- Spend -------------------------------------------------------------------
  {
    key: 'spend/by-site',
    title: 'Spend by branch',
    description:
      'Spend per branch, biggest first, with each share of the window.',
    group: 'Spend',
    permission: 'REPORT_VIEW',
    accountScoped: true,
    filters: { range: true },
    rows: asArray,
    columns: [
      { header: 'Branch code', kind: 'text', key: 'sublabel' },
      { header: 'Branch', kind: 'text', key: 'label' },
      ...DIMENSION_TAIL,
    ],
  },
  {
    key: 'spend/by-category',
    title: 'Spend by category',
    description:
      'Spend per product category, biggest first, with each share of the window.',
    group: 'Spend',
    permission: 'REPORT_VIEW',
    accountScoped: true,
    filters: { range: true },
    rows: asArray,
    columns: [
      { header: 'Category', kind: 'text', key: 'label' },
      ...DIMENSION_TAIL,
    ],
  },
  {
    key: 'spend/by-region',
    title: 'Spend by region',
    description:
      'Spend by delivery region, from each order’s frozen delivery address. Orders with no region are grouped, so the total reconciles.',
    group: 'Spend',
    permission: 'REPORT_VIEW',
    accountScoped: true,
    filters: { range: true },
    rows: asArray,
    columns: [
      { header: 'Region', kind: 'text', key: 'label' },
      ...DIMENSION_TAIL,
    ],
  },
  {
    key: 'spend/over-time',
    title: 'Spend over time',
    description:
      'Orders and spend per period. Quiet periods show as zero rather than being skipped.',
    group: 'Spend',
    permission: 'REPORT_VIEW',
    accountScoped: true,
    filters: { range: true, granularity: true },
    rows: field('buckets'),
    columns: [
      { header: 'Period', kind: 'text', key: 'bucket' },
      { header: 'Orders', kind: 'integer', key: 'orders' },
      { header: 'Spend', kind: 'money', key: 'spend' },
    ],
  },
  {
    key: 'spend/by-account',
    title: 'Spend by account',
    description:
      'Spend per customer account across the platform. Administrators only.',
    group: 'Spend',
    permission: 'ACCOUNT_MANAGE',
    accountScoped: false,
    filters: { range: true },
    rows: asArray,
    columns: [
      { header: 'Account code', kind: 'text', key: 'sublabel' },
      { header: 'Account', kind: 'text', key: 'label' },
      ...DIMENSION_TAIL,
    ],
  },

  // --- Orders ---------------------------------------------------------------------
  {
    key: 'orders/by-status',
    title: 'Orders by status',
    description:
      'Where work sits, rejected and cancelled included. Shares are of the order count, not the money.',
    group: 'Orders',
    permission: 'REPORT_VIEW',
    accountScoped: true,
    filters: { range: true },
    rows: asArray,
    columns: [
      { header: 'Status', kind: 'status', key: 'status' },
      { header: 'Orders', kind: 'integer', key: 'orders' },
      { header: 'Value', kind: 'money', key: 'value' },
      { header: 'Share %', kind: 'percent', key: 'sharePercent' },
    ],
  },
  {
    key: 'orders/velocity',
    title: 'Order velocity',
    description:
      'How fast orders are arriving, per period, against the window before.',
    group: 'Orders',
    permission: 'REPORT_VIEW',
    accountScoped: true,
    filters: { range: true, granularity: true },
    rows: field('buckets'),
    summary: [
      { label: 'Orders', value: (d) => Number(d.orders ?? 0) },
      {
        label: 'Orders per day',
        value: (d) => Number(d.ordersPerDay ?? 0).toFixed(1),
      },
      {
        label: 'Busiest period',
        value: (d) =>
          d.busiestBucket
            ? `${d.busiestBucket} (${d.busiestBucketOrders})`
            : '—',
      },
      {
        label: 'Change vs previous window',
        value: (d) =>
          d.velocityGrowthPercent === null ||
          d.velocityGrowthPercent === undefined
            ? '—'
            : `${Number(d.velocityGrowthPercent) > 0 ? '+' : ''}${Number(d.velocityGrowthPercent).toFixed(1)}%`,
      },
    ],
    columns: [
      { header: 'Period', kind: 'text', key: 'bucket' },
      { header: 'Orders', kind: 'integer', key: 'orders' },
      { header: 'Spend', kind: 'money', key: 'spend' },
    ],
  },
  {
    key: 'orders/history',
    title: 'Order history',
    description:
      'Who ordered what, for which branch, when, how many and for how much — one row per order line, at the price it was placed at.',
    group: 'Orders',
    permission: 'REPORT_VIEW',
    accountScoped: true,
    filters: { range: true, orderStatus: true },
    rows: field('items'),
    paged: true,
    summary: [{ label: 'Order lines', value: (d) => Number(d.total ?? 0) }],
    columns: [
      { header: 'Order', kind: 'text', key: 'orderNumber' },
      { header: 'Placed', kind: 'datetime', key: 'placedAt' },
      { header: 'Status', kind: 'status', key: 'status' },
      { header: 'Branch code', kind: 'text', key: 'siteCode' },
      { header: 'Branch', kind: 'text', key: 'siteName' },
      { header: 'Placed by', kind: 'text', key: 'placedByName' },
      { header: 'Placed by email', kind: 'text', key: 'placedByEmail' },
      { header: 'Purchase order', kind: 'text', key: 'poNumber' },
      { header: 'Customer reference', kind: 'text', key: 'customerReference' },
      { header: 'Campaign', kind: 'text', key: 'campaignCode' },
      { header: 'Project', kind: 'text', key: 'projectCode' },
      { header: 'SKU', kind: 'text', key: 'sku' },
      { header: 'Option SKU', kind: 'text', key: 'variantSku' },
      { header: 'Product', kind: 'text', key: 'productName' },
      { header: 'Quantity', kind: 'integer', key: 'quantity' },
      { header: 'Unit price', kind: 'money', key: 'unitPrice' },
      { header: 'Line total', kind: 'money', key: 'lineTotal' },
      { header: 'Order total', kind: 'money', key: 'orderTotal' },
    ],
  },

  // --- Products ---------------------------------------------------------------------
  {
    key: 'products/top',
    title: 'Top ordered SKUs',
    description: 'The SKUs accounting for the most spend, or the most units.',
    group: 'Products',
    permission: 'REPORT_VIEW',
    accountScoped: true,
    filters: { range: true, topProducts: true },
    rows: asArray,
    columns: [
      { header: 'SKU', kind: 'text', key: 'sku' },
      { header: 'Product', kind: 'text', key: 'name' },
      { header: 'Category', kind: 'text', key: 'categoryName' },
      { header: 'Quantity', kind: 'integer', key: 'quantity' },
      { header: 'Orders', kind: 'integer', key: 'orders' },
      { header: 'Spend', kind: 'money', key: 'spend' },
    ],
  },

  // --- Inventory ----------------------------------------------------------------------
  {
    key: 'inventory',
    title: 'Inventory',
    description:
      'What is low, what is out, and what to reorder, across the global catalogue. Healthy lines are trimmed.',
    group: 'Inventory',
    permission: 'INVENTORY_MANAGE',
    accountScoped: false,
    filters: { limit: true },
    rows: field('items'),
    summary: [
      {
        label: 'Tracked products',
        value: (d) => Number(d.trackedProducts ?? 0),
      },
      { label: 'Low stock', value: (d) => Number(d.lowStock ?? 0) },
      { label: 'Out of stock', value: (d) => Number(d.outOfStock ?? 0) },
      { label: 'Units on hand', value: (d) => Number(d.totalUnitsOnHand ?? 0) },
      {
        label: 'Units reserved',
        value: (d) => Number(d.totalUnitsReserved ?? 0),
      },
    ],
    columns: [
      { header: 'SKU', kind: 'text', key: 'sku' },
      { header: 'Product', kind: 'text', key: 'name' },
      { header: 'Status', kind: 'status', key: 'status' },
      { header: 'On hand', kind: 'integer', key: 'stockOnHand' },
      { header: 'Reserved', kind: 'integer', key: 'stockReserved' },
      { header: 'Available', kind: 'integer', key: 'available' },
      {
        header: 'Low-stock threshold',
        kind: 'integer',
        key: 'lowStockThreshold',
      },
      { header: 'Reorder quantity', kind: 'integer', key: 'reorderQuantity' },
    ],
  },
  {
    key: 'inventory/turnover',
    title: 'Inventory turnover',
    description:
      'Units shipped in the window against what is on the shelf now, and how long the shelf lasts at that rate.',
    group: 'Inventory',
    permission: 'INVENTORY_MANAGE',
    accountScoped: false,
    filters: { range: true, limit: true },
    rows: asArray,
    columns: [
      { header: 'SKU', kind: 'text', key: 'sku' },
      { header: 'Product', kind: 'text', key: 'name' },
      { header: 'Units shipped', kind: 'integer', key: 'unitsShipped' },
      { header: 'On hand', kind: 'integer', key: 'stockOnHand' },
      { header: 'Turnover ratio', kind: 'decimal', key: 'turnoverRatio' },
      { header: 'Days of cover', kind: 'decimal', key: 'daysOfCover' },
    ],
  },
]
