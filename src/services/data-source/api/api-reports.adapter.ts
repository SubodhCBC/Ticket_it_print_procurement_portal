import { apiClient } from '@/services/api.service'
import type {
  DashboardKPIs,
  HOBillingLineItem,
  HODashboardKPIs,
  HOMonthlyBillingReport,
  HOSpendBysite,
  MonthlyBillingReport,
  MonthlyBillingSiteSummary,
  OrderStatus,
} from '@/types'
import type { ApiOffsetPage } from './catalog.types'
import type {
  AccessReviewParams,
  ApiAccessReviewReport,
  ApiApprovalActivityReport,
  ApiOrderAgeingReport,
  ApprovalActivityParams,
  OrderAgeingParams,
  ReportFileFormat,
  ReportFileKey,
} from './governance.types'
import type { ApiOrder } from './order.types'
import type {
  ApiDashboardReport,
  ApiDimensionRow,
  ApiInvoice,
  ApiInvoiceLine,
  ApiInventoryQuery,
  ApiInventoryReport,
  ApiInventoryTurnoverQuery,
  ApiInventoryTurnoverRow,
  ApiPeriodSummary,
  ApiReportExportFormat,
  ApiReportExportName,
  ApiReportRangeQuery,
  ApiSpendOverTime,
  ApiSpendSummary,
  ApiStatusRow,
  ApiTopProduct,
  ApiTopProductsQuery,
  ApiVelocityReport,
} from './report.types'

/**
 * Reporting and consolidated billing, served by `/reports/*` and `/billing/*`.
 *
 * Same function signatures as the mock adapter it replaces. Most of the shapes
 * the UI asks for are composites the API serves piece by piece, and this is
 * where they are assembled — in parallel, so one screen costs one round of
 * requests rather than one per figure.
 *
 * The dashboards are the exception: `/reports/dashboard` returns the whole
 * bundle. Composing it here cost five requests, and — the part that actually
 * mattered — five independently defaulted date ranges, so a page loading across
 * midnight could draw cards that disagreed with the chart beside them.
 *
 * Every figure is the server's. Nothing here re-derives a total from a page of
 * rows: a client-side sum only ever adds up the page it happened to load, which
 * is how a dashboard quietly under-reports a busy month.
 */

const REPORTS = '/reports'
const BILLING = '/billing'

/** `YYYY-MM`, which is the key both orders and invoices are stamped with. */
function toBillingPeriod(period: string): string {
  if (/^\d{4}-(0[1-9]|1[0-2])$/.test(period)) return period

  // The UI has always spoken in "August 2026"; the API speaks in "2026-08".
  const parsed = new Date(`1 ${period}`)
  if (!Number.isNaN(parsed.getTime())) {
    return `${parsed.getUTCFullYear()}-${String(parsed.getUTCMonth() + 1).padStart(2, '0')}`
  }

  const now = new Date()
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`
}

/** "2026-08" back into the label the billing screens print. */
function toPeriodLabel(billingPeriod: string): string {
  const [year, month] = billingPeriod.split('-').map(Number)
  if (!year || !month) return billingPeriod

  return new Date(Date.UTC(year, month - 1, 1)).toLocaleDateString('en-GB', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  })
}

/** The window a `YYYY-MM` period covers, as the report range API wants it. */
function periodRange(billingPeriod: string): { from: string; to: string } {
  const [year, month] = billingPeriod.split('-').map(Number)
  const from = new Date(Date.UTC(year, month - 1, 1))
  // Exclusive, so no order is counted in two months.
  const to = new Date(Date.UTC(year, month, 1))
  return { from: from.toISOString(), to: to.toISOString() }
}

function money(value: string | null | undefined): number {
  return value == null ? 0 : Number(value)
}

/** "1 item", "2 items" — the portal writes counts out, not as "item(s)". */
function plural(count: number, noun: string): string {
  return count === 1 ? noun : `${noun}s`
}

// --- Admin dashboard -----------------------------------------------------------

/**
 * The dashboard bundle, platform-wide where the caller is allowed it.
 *
 * `scope=platform` is what this screen means — its header says "Operational
 * Platform Overview" — and it is administrator-only. It has to be asked for
 * explicitly rather than inferred from the role, because an administrator
 * belongs to an account like anybody else, and the default scope would quietly
 * report that one customer's spend as if it were the estate's.
 *
 * A head-office user who reaches this route falls back to their own account
 * rather than an error page. They simply get no platform account count, which
 * is the same thing that happened when this was five requests and the
 * cross-tenant one was allowed to fail.
 */
async function platformDashboard(): Promise<ApiDashboardReport> {
  const params = { granularity: 'month', topSites: 5 }

  try {
    return (await apiClient.get(`${REPORTS}/dashboard`, {
      params: { ...params, scope: 'platform' },
    })) as ApiDashboardReport
  } catch {
    return (await apiClient.get(`${REPORTS}/dashboard`, {
      params,
    })) as ApiDashboardReport
  }
}

export async function getDashboardKPIs(): Promise<DashboardKPIs> {
  const report = await platformDashboard()

  return {
    totalRevenueMonth: money(report.spend.totalSpend),
    // Null when there is no prior period to compare against — a new account,
    // or the estate's first month. Coercing that to `0` drew a green "+0.0%"
    // that claimed flat growth where the truth is that nothing is known yet,
    // so the null is carried through and the dashboards render it as a dash.
    revenueDeltaPct: report.spend.spendGrowthPercent,
    activeOrdersCount: report.spend.orderCount,
    ordersDeltaPct: report.spend.orderGrowthPercent,
    // Live counts, not windowed. The old figure was "approved *within the last
    // thirty days*", so an order approved forty days ago and still unfulfilled
    // had dropped off the very card meant to surface it — the longer it was
    // stuck, the more certainly it disappeared.
    pendingFulfilmentCount: report.queue.awaitingDispatch,
    openOrdersCount: report.queue.open,
    awaitingApprovalCount: report.queue.awaitingApproval,
    inFulfilmentCount: report.queue.inFulfilment,
    inTransitCount: report.queue.inTransit,
    ordersPerDay: report.pace.ordersPerDay,
    // Branches that exist and are active, not branches that happened to order
    // in the window — which is what the card has always claimed to show.
    activeSitesCount: report.network.activeSites,
    // Null outside platform scope, where the count is deliberately withheld.
    activeAccountsCount: report.network.activeAccounts ?? 0,
    // Empty by design: a list of orders is its own query, asked for by whoever
    // renders it. Both dashboards use `useOrders`, and sharing that key is what
    // lets the two fetches collapse into one.
    recentOrders: [],
    statusDistribution: report.byStatus
      .filter((row) => row.orders > 0)
      .map((row) => ({
        status: row.status as OrderStatus,
        count: row.orders,
        value: money(row.value),
      })),
    revenueTrend: report.trend.map((bucket) => ({
      month: new Date(bucket.bucket).toLocaleDateString('en-GB', {
        month: 'short',
        timeZone: 'UTC',
      }),
      spend: money(bucket.spend),
      orders: bucket.orders,
    })),
  }
}

// --- Admin monthly billing ------------------------------------------------------

/**
 * The invoice for a period, if one exists.
 *
 * A month with no invoice yet is the ordinary case early in the month, not an
 * error — the report still shows what has been spent, with no invoice number
 * against it.
 */
async function invoiceForPeriod(
  billingPeriod: string,
  accountId?: string
): Promise<ApiInvoice | null> {
  try {
    const page: ApiOffsetPage<ApiInvoice> = await apiClient.get(
      `${BILLING}/invoices`,
      {
        params: {
          billingPeriod,
          pageSize: 10,
          ...(accountId ? { accountId } : {}),
        },
      }
    )

    // An issued invoice is the one that was actually billed; a draft is what
    // the next run would produce.
    return (
      page.items.find(
        (invoice) => invoice.status !== 'DRAFT' && invoice.status !== 'VOID'
      ) ??
      page.items[0] ??
      null
    )
  } catch {
    return null
  }
}

function toCategoryBreakdown(rows: ApiDimensionRow[]) {
  return rows.map((row) => ({
    category: row.label,
    spend: money(row.spend),
    percentage: row.sharePercent,
  }))
}

export async function getMonthlyBillingReport(
  period: string
): Promise<MonthlyBillingReport> {
  const billingPeriod = toBillingPeriod(period)
  const range = periodRange(billingPeriod)

  const [summary, bySite, byCategory, invoice] = await Promise.all([
    apiClient.get(
      `${BILLING}/periods/${billingPeriod}`
    ) as Promise<ApiPeriodSummary>,
    apiClient.get(`${REPORTS}/spend/by-site`, { params: range }) as Promise<
      ApiDimensionRow[]
    >,
    apiClient.get(`${REPORTS}/spend/by-category`, { params: range }) as Promise<
      ApiDimensionRow[]
    >,
    invoiceForPeriod(billingPeriod),
  ])

  const topCategory = byCategory[0]?.label ?? '—'

  const siteBreakdowns: MonthlyBillingSiteSummary[] = bySite.map((row) => ({
    siteId: row.id,
    siteCode: row.sublabel ?? row.id,
    siteName: row.label,
    accountName: invoice?.accountName ?? '',
    ordersCount: row.orders,
    // The API counts orders, not distinct purchase orders; every order on this
    // platform carries at most one, so they are the same number.
    purchaseOrdersCount: row.orders,
    totalSpend: money(row.spend),
    topCategory,
    status: invoice?.status === 'PAID' ? 'SETTLED' : 'PENDING',
  }))

  return {
    period: toPeriodLabel(billingPeriod),
    invoiceNumber: invoice?.invoiceNumber ?? 'Not yet issued',
    invoiceDate: invoice?.issuedAt ?? '',
    dueDate: invoice?.dueAt ?? '',
    totalSpend: money(summary.totalSpend),
    totalOrders: summary.invoicedOrders + summary.unbilledOrders,
    activeSitesCount: summary.sitesBilled || bySite.length,
    siteBreakdowns,
    categoryBreakdown: toCategoryBreakdown(byCategory),
  }
}

// --- Head office ----------------------------------------------------------------

export async function getHODashboardKPIs(
  accountId: string
): Promise<HODashboardKPIs> {
  const scope = accountId ? { accountId } : {}

  const [report, account] = await Promise.all([
    // No `scope`: the default is the caller's own account, which is exactly
    // what a head office may see. Twenty branches is the strip's cap — the
    // complete breakdown is its own screen, `/head-office/reports/spend-by-site`.
    apiClient.get(`${REPORTS}/dashboard`, {
      params: { ...scope, granularity: 'month', topSites: 20 },
    }) as Promise<ApiDashboardReport>,
    // Only for the account's name, which the KPI header prints. One row is
    // enough; the order list itself is `useOrders`, as on the admin dashboard.
    (
      apiClient.get('/orders', {
        params: { ...scope, pageSize: 1 },
      }) as Promise<ApiOffsetPage<ApiOrder>>
    ).catch(
      () =>
        ({
          items: [],
          total: 0,
          page: 1,
          pageSize: 1,
          totalPages: 1,
        }) as ApiOffsetPage<ApiOrder>
    ),
  ])

  const spendBySite: HOSpendBysite[] = report.topSites.map((row) => ({
    siteId: row.id,
    siteCode: row.sublabel ?? row.id,
    siteName: row.label,
    ordersCount: row.orders,
    totalSpend: money(row.spend),
    percentageOfTotal: row.sharePercent,
  }))

  const top = spendBySite[0]

  return {
    accountId,
    accountName: account.items[0]?.accountName ?? '',
    totalSpendThisMonth: money(report.spend.totalSpend),
    totalSpendLastMonth: money(report.spend.previous.totalSpend),
    // Null where there is no prior period; see the note on the admin bundle.
    spendDeltaPct: report.spend.spendGrowthPercent,
    orderCountThisMonth: report.spend.orderCount,
    orderCountLastMonth: report.spend.previous.orderCount,
    ordersDeltaPct: report.spend.orderGrowthPercent,
    // The card's subtitle reads "Sites under this account", and now that is
    // what the number is. `spend.siteCount` counts branches that *ordered* in
    // the window, so a branch that opened last week or simply had a quiet
    // month was missing from a figure that never claimed to be about orders.
    activeSitesCount: report.network.activeSites,
    topSite: top
      ? {
          siteName: top.siteName,
          siteCode: top.siteCode,
          spend: top.totalSpend,
        }
      : { siteName: '—', siteCode: '', spend: 0 },
    // See the note on the admin bundle: the list is its own query.
    recentOrders: [],
    spendBySite,
    spendTrend: report.trend.map((bucket) => ({
      month: new Date(bucket.bucket).toLocaleDateString('en-GB', {
        month: 'short',
        timeZone: 'UTC',
      }),
      spend: money(bucket.spend),
      orders: bucket.orders,
    })),
  }
}

/**
 * The transaction-level backing for a month's consolidated bill.
 *
 * The line items come from the *invoice*, not from a scan of orders: an issued
 * invoice is frozen, and re-deriving its lines from live orders is how a
 * statement stops agreeing with the invoice it is supposed to explain. When no
 * invoice exists yet the period's orders stand in, which is what a mid-month
 * preview is.
 */
export async function getHOMonthlyBillingReport(
  accountId: string,
  period: string
): Promise<HOMonthlyBillingReport> {
  const billingPeriod = toBillingPeriod(period)
  const range = periodRange(billingPeriod)
  const scope = accountId ? { accountId } : {}

  const [summary, bySite, byCategory, invoiceSummary] = await Promise.all([
    apiClient.get(`${BILLING}/periods/${billingPeriod}`, {
      params: scope,
    }) as Promise<ApiPeriodSummary>,
    apiClient.get(`${REPORTS}/spend/by-site`, {
      params: { ...scope, ...range },
    }) as Promise<ApiDimensionRow[]>,
    apiClient.get(`${REPORTS}/spend/by-category`, {
      params: { ...scope, ...range },
    }) as Promise<ApiDimensionRow[]>,
    invoiceForPeriod(billingPeriod, accountId),
  ])

  const invoice = invoiceSummary
    ? ((await apiClient.get(
        `${BILLING}/invoices/${invoiceSummary.id}`
      )) as ApiInvoice)
    : null

  const lineItems = invoice?.lines
    ? invoice.lines.flatMap((line) => toBillingLineItems(line, invoice))
    : await ordersAsLineItems(billingPeriod, accountId)

  const siteBreakdowns: HOSpendBysite[] = bySite.map((row) => ({
    siteId: row.id,
    siteCode: row.sublabel ?? row.id,
    siteName: row.label,
    ordersCount: row.orders,
    totalSpend: money(row.spend),
    percentageOfTotal: row.sharePercent,
  }))

  return {
    accountId,
    accountName: invoice?.accountName ?? '',
    period: billingPeriod,
    periodLabel: toPeriodLabel(billingPeriod),
    generatedAt: new Date().toISOString(),
    invoiceRef: invoice?.invoiceNumber ?? 'Not yet issued',
    totalSpend: money(summary.totalSpend),
    totalOrders: summary.invoicedOrders + summary.unbilledOrders,
    totalLineItems: lineItems.length,
    activeSitesCount: summary.sitesBilled || siteBreakdowns.length,
    siteBreakdowns,
    lineItems,
    categoryBreakdown: toCategoryBreakdown(byCategory),
  }
}

/** How GST applied to one billed item, in the words finance uses. */
function taxLabel(
  treatment: string | undefined,
  taxAmount: string | undefined,
  invoice: ApiInvoice
): string {
  if (treatment === 'ZERO_RATED') return 'Zero-rated'
  if (treatment === 'EXEMPT') return 'Exempt'
  if (!invoice.taxRatePercent) return 'No tax applied'
  const rate = `GST ${Number(invoice.taxRatePercent)}%`
  const amount = taxAmount ? ` · $${money(taxAmount).toFixed(2)}` : ''
  return `${rate}${invoice.pricesIncludeTax ? ' incl.' : ''}${amount}`
}

function addressText(address: ApiInvoiceLine['shippingAddress']): string {
  if (!address) return ''
  return [address.line1, address.line2, address.city, address.postcode]
    .filter(Boolean)
    .join(', ')
}

/**
 * The backing file's rows for one invoiced order: one per billed item, with its
 * SKU, pack, quantity, price and GST (SOW §15 B-06, B-07), and the order's own
 * details repeated on each so every row stands alone in a spreadsheet.
 *
 * An invoice generated before items were recorded has none; it keeps its old
 * single row per order, with the per-product columns left blank rather than
 * filled with the order's totals.
 */
function toBillingLineItems(
  line: NonNullable<ApiInvoice['lines']>[number],
  invoice: ApiInvoice
): HOBillingLineItem[] {
  const order = {
    orderNumber: line.orderNumber,
    orderDate: line.orderedAt,
    accountName: invoice.accountName,
    accountId: invoice.accountId,
    siteName: line.siteName,
    siteId: line.siteId,
    siteCode: line.siteCode,
    orderedByUser: line.placedByName ?? '',
    orderedByEmail: line.placedByEmail ?? '',
    poReference: line.poNumber ?? '',
    orderTotal: money(line.amount),
    shipToAddress: addressText(line.shippingAddress),
    deliveryContact: line.recipientName ?? '',
    deliveryInstructions: line.deliveryNotes ?? '',
    billToAddress: addressText(line.billingAddress),
    billToEntity: line.billingAddress?.label ?? invoice.accountName,
    // An order whose status the invoice does not carry is unknown, not
    // delivered — reporting it as delivered claimed a fulfilment that may
    // never have happened. `StatusPill` renders this through its default arm.
    status: (line.orderStatus ?? 'UNKNOWN') as OrderStatus,
  }

  const items = line.items ?? []
  if (items.length === 0) {
    return [
      {
        ...order,
        productName: `${line.itemCount} ${plural(line.itemCount, 'item')}`,
        sku: '',
        packSize: '',
        uom: '',
        qty: line.itemCount,
        // Not a free item: this invoice carries no per-product detail, so
        // there is no unit price to show. `$0.00` read as one.
        unitPrice: null,
        lineValue: money(line.amount),
        taxTreatment: taxLabel(undefined, line.tax, invoice),
        notes: line.orderNotes ?? line.campaignCode ?? '',
      },
    ]
  }

  return items.map((item) => ({
    ...order,
    productName:
      item.kind === 'DELIVERY' ? `Delivery: ${item.name}` : item.name,
    sku: item.variantSku ?? item.sku,
    packSize: item.packSize === null ? '' : String(item.packSize),
    uom: item.uom ?? '',
    qty: item.quantity,
    unitPrice: money(item.unitPrice),
    lineValue: money(item.lineValue),
    taxTreatment: taxLabel(item.taxTreatment, item.taxAmount, invoice),
    notes: [item.notes, line.orderNotes].filter(Boolean).join(' · '),
  }))
}

/**
 * A mid-month preview: the period's orders, before any invoice exists.
 *
 * At the order grain, not the order-*line* grain. Getting the lines would mean
 * a detail request per order — a hundred of them for a busy month, fired at
 * once, which trips the rate limiter before it finishes and hammers the
 * database for a preview nobody has asked to drill into.
 *
 * The per-product columns are left empty rather than filled with the order's
 * own totals, which would read as a single item costing the whole order. Once
 * the period is invoiced the real statement comes from the invoice, which
 * carries its lines in one response.
 */
async function ordersAsLineItems(
  billingPeriod: string,
  accountId?: string
): Promise<HOBillingLineItem[]> {
  try {
    const page: ApiOffsetPage<ApiOrder> = await apiClient.get('/orders', {
      params: {
        billingPeriod,
        pageSize: 100,
        ...(accountId ? { accountId } : {}),
      },
    })

    return page.items.map((order) => ({
      orderNumber: order.orderNumber,
      orderDate: order.createdAt,
      accountName: order.accountName,
      accountId: order.accountId,
      siteName: order.siteName,
      siteId: order.siteId,
      siteCode: order.siteCode,
      orderedByUser: order.placedByName,
      orderedByEmail: order.placedByEmail,
      poReference: order.poNumber ?? '',
      productName: `${order.itemCount} ${plural(order.itemCount, 'item')} across ${order.lineCount} ${plural(order.lineCount, 'line')}`,
      sku: '',
      packSize: '',
      uom: '',
      qty: order.itemCount,
      // The preview is at the order grain, so no per-product price exists yet.
      unitPrice: null,
      lineValue: money(order.total),
      // Not invoiced yet, so no tax has been worked out for it.
      taxTreatment: 'Calculated on invoice',
      orderTotal: money(order.total),
      shipToAddress: [order.shippingAddress?.line1, order.shippingAddress?.city]
        .filter(Boolean)
        .join(', '),
      deliveryContact: order.recipientName ?? '',
      deliveryInstructions: order.deliveryNotes ?? '',
      billToAddress: '',
      billToEntity: order.accountName,
      status: order.status as OrderStatus,
      notes: order.notes ?? '',
    }))
  } catch {
    return []
  }
}

// --- Invoices -------------------------------------------------------------------

export async function listInvoices(params?: {
  billingPeriod?: string
  accountId?: string
  status?: string
  page?: number
  pageSize?: number
}): Promise<ApiOffsetPage<ApiInvoice>> {
  return apiClient.get(`${BILLING}/invoices`, {
    params: {
      page: params?.page ?? 1,
      pageSize: params?.pageSize ?? 25,
      ...(params?.billingPeriod ? { billingPeriod: params.billingPeriod } : {}),
      ...(params?.accountId ? { accountId: params.accountId } : {}),
      ...(params?.status ? { status: params.status } : {}),
    },
  })
}

export async function getInvoice(invoiceId: string): Promise<ApiInvoice> {
  return apiClient.get(`${BILLING}/invoices/${encodeURIComponent(invoiceId)}`)
}

/**
 * Builds or rebuilds the draft for a period.
 *
 * Safe to run repeatedly: it replaces the draft wholesale, so an order
 * cancelled since the last run disappears from it. Orders already frozen onto
 * an issued invoice are never picked up again.
 */
export async function generateInvoice(
  billingPeriod: string,
  accountId?: string
): Promise<ApiInvoice> {
  return apiClient.post(`${BILLING}/invoices/generate`, {
    billingPeriod,
    ...(accountId ? { accountId } : {}),
  })
}

// --- Invoice lifecycle ----------------------------------------------------------

/**
 * Issues the draft: allocates its number and freezes its lines.
 *
 * The moment the customer is committed to a figure, which is why it is a
 * separate transition rather than a flag on the draft. After this nothing
 * changes what was billed — a mistake becomes a credit note.
 *
 * `paymentTermDays` gives the due date, without which the overdue filter means
 * nothing. Thirty, because Net 30 is the default payment method.
 */
export async function issueInvoice(
  invoiceId: string,
  paymentTermDays = 30
): Promise<ApiInvoice> {
  return apiClient.post(
    `${BILLING}/invoices/${encodeURIComponent(invoiceId)}/issue`,
    {
      paymentTermDays,
    }
  )
}

/**
 * Records payment. `paidAt` is when the money arrived, which is rarely when
 * somebody got round to recording it — so it is settable, and defaults to now.
 */
export async function markInvoicePaid(
  invoiceId: string,
  input?: { paymentReference?: string; paidAt?: string }
): Promise<ApiInvoice> {
  return apiClient.post(
    `${BILLING}/invoices/${encodeURIComponent(invoiceId)}/paid`,
    {
      ...(input?.paymentReference
        ? { paymentReference: input.paymentReference }
        : {}),
      ...(input?.paidAt ? { paidAt: input.paidAt } : {}),
    }
  )
}

/**
 * Voids it. The reason is mandatory here and in the database: a void with no
 * explanation is the thing an auditor stops on.
 */
export async function voidInvoice(
  invoiceId: string,
  reason: string
): Promise<ApiInvoice> {
  return apiClient.post(
    `${BILLING}/invoices/${encodeURIComponent(invoiceId)}/void`,
    { reason }
  )
}

// --- Invoice documents ----------------------------------------------------------

export type InvoiceFormat = 'pdf' | 'csv' | 'xlsx'

const CONTENT_TYPE: Record<InvoiceFormat, string> = {
  pdf: 'application/pdf',
  csv: 'text/csv;charset=utf-8',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
}

/**
 * The invoice document, as the server renders it.
 *
 * Not generated in the browser. An invoice PDF assembled from a report is a
 * picture of what the client believed it was billed; the API renders it from
 * the frozen invoice rows, which is what the customer was actually charged. A
 * finance team reconciling the two would otherwise be reconciling a client-side
 * rounding decision.
 *
 * Comes back as a Blob so the bytes survive — the response interceptor's JSON
 * assumptions do not apply to a PDF.
 */
export async function downloadInvoice(
  invoiceId: string,
  format: InvoiceFormat
): Promise<{ blob: Blob; filename: string }> {
  const response = await apiClient.get(
    `${BILLING}/invoices/${encodeURIComponent(invoiceId)}/${format}`,
    { responseType: 'blob' }
  )

  // The interceptor already unwrapped `response.data`, so this *is* the body.
  const blob = response as unknown as Blob

  return {
    blob:
      blob instanceof Blob
        ? blob
        : new Blob([blob], { type: CONTENT_TYPE[format] }),
    filename: `invoice-${invoiceId}.${format}`,
  }
}

/** Hands the browser a file. Same shape as the client-side CSV helper. */
export function saveBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  document.body.removeChild(anchor)
  URL.revokeObjectURL(url)
}

// --- Analytics reports ----------------------------------------------------------

/**
 * Query params for a report, with blank values dropped.
 *
 * An empty `accountId` or `siteId` is not "no filter" to the API — it is a
 * string that fails to match anything — so absent and blank are made the same
 * thing here rather than at every call site.
 */
function reportParams(query?: object): Record<string, string | number> {
  const params: Record<string, string | number> = {}
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value === undefined || value === null) continue
    if (typeof value === 'string' && value.trim() === '') continue
    params[key] = typeof value === 'number' ? value : String(value).trim()
  }
  return params
}

/**
 * Headline spend, orders, average order value and growth against the previous
 * window of the same length. `REPORT_VIEW`.
 */
export async function getSpendSummary(
  query?: ApiReportRangeQuery
): Promise<ApiSpendSummary> {
  return apiClient.get(`${REPORTS}/spend/summary`, {
    params: reportParams(query),
  })
}

/** Spend and orders per bucket, empty buckets included. `REPORT_VIEW`. */
export async function getSpendOverTime(
  query?: ApiReportRangeQuery
): Promise<ApiSpendOverTime> {
  return apiClient.get(`${REPORTS}/spend/over-time`, {
    params: reportParams(query),
  })
}

/**
 * Spend per customer account — cross-tenant, so `ACCOUNT_MANAGE`
 * (administrators only). Only `from` and `to` mean anything here.
 */
export async function getSpendByAccount(
  query?: Pick<ApiReportRangeQuery, 'from' | 'to'>
): Promise<ApiDimensionRow[]> {
  return apiClient.get(`${REPORTS}/spend/by-account`, {
    params: reportParams({ from: query?.from, to: query?.to }),
  })
}

/**
 * Spend by delivery region, from each order's frozen shipping snapshot. Orders
 * with no region are grouped rather than dropped. `REPORT_VIEW`.
 */
export async function getSpendByRegion(
  query?: ApiReportRangeQuery
): Promise<ApiDimensionRow[]> {
  return apiClient.get(`${REPORTS}/spend/by-region`, {
    params: reportParams(query),
  })
}

/** Orders at every status in the window, shares by count. `REPORT_VIEW`. */
export async function getOrdersByStatus(
  query?: ApiReportRangeQuery
): Promise<ApiStatusRow[]> {
  return apiClient.get(`${REPORTS}/orders/by-status`, {
    params: reportParams(query),
  })
}

/** How fast orders arrive, per bucket and per day. `REPORT_VIEW`. */
export async function getOrderVelocity(
  query?: ApiReportRangeQuery
): Promise<ApiVelocityReport> {
  return apiClient.get(`${REPORTS}/orders/velocity`, {
    params: reportParams(query),
  })
}

/** The SKUs with the most spend, or units with `by: 'quantity'`. `REPORT_VIEW`. */
export async function getTopProducts(
  query?: ApiTopProductsQuery
): Promise<ApiTopProduct[]> {
  return apiClient.get(`${REPORTS}/products/top`, {
    params: reportParams(query),
  })
}

/**
 * The warehouse "needs attention" list across the global catalogue.
 * `INVENTORY_MANAGE` (administrators only). Takes no date range.
 */
export async function getInventoryReport(
  query?: ApiInventoryQuery
): Promise<ApiInventoryReport> {
  return apiClient.get(`${REPORTS}/inventory`, {
    params: reportParams({ limit: query?.limit }),
  })
}

/**
 * Units shipped against stock on hand, with days of cover. `INVENTORY_MANAGE`.
 * Honours `from`, `to` and `limit`; account and site scope do not apply.
 */
export async function getInventoryTurnover(
  query?: ApiInventoryTurnoverQuery
): Promise<ApiInventoryTurnoverRow[]> {
  return apiClient.get(`${REPORTS}/inventory/turnover`, {
    params: reportParams({
      from: query?.from,
      to: query?.to,
      limit: query?.limit,
    }),
  })
}

const REPORT_CONTENT_TYPE: Record<ApiReportExportFormat, string> = {
  csv: CONTENT_TYPE.csv,
  xlsx: CONTENT_TYPE.xlsx,
}

/**
 * A tabular report as the server renders it: `GET /reports/<name>.<format>`.
 *
 * The same rows as the JSON route, with the same query, and the same permission.
 * Rendered server-side so the file carries the formula guard, the byte-order
 * mark and (for XLSX) the About sheet naming who pulled it and with what filters.
 *
 * The filename is built here: the response interceptor unwraps the body, so the
 * server's Content-Disposition never reaches this function.
 *
 * A failure comes back as an `ApiError` whose message is generic — the error
 * envelope arrives as a Blob under `responseType: 'blob'` and is not parsed —
 * so the status is what a caller should branch on.
 */
export async function downloadReportExport(
  name: ApiReportExportName,
  format: ApiReportExportFormat,
  query?: ApiReportRangeQuery | ApiTopProductsQuery | ApiInventoryTurnoverQuery
): Promise<{ blob: Blob; filename: string }> {
  const response = await apiClient.get(`${REPORTS}/${name}.${format}`, {
    params: reportParams(query),
    responseType: 'blob',
  })

  const blob = response as unknown as Blob
  const stamp = new Date().toISOString().slice(0, 10)

  return {
    blob:
      blob instanceof Blob
        ? blob
        : new Blob([blob], { type: REPORT_CONTENT_TYPE[format] }),
    filename: `report-${name.replace(/\//g, '-')}-${stamp}.${format}`,
  }
}

export { toBillingPeriod, toPeriodLabel }

// --- Governance reports (SOW §15) -----------------------------------------------

/** Drops empty values, so an unset filter is absent rather than `?siteId=`. */
function reportQuery(
  params: object | undefined
): Record<string, string | number | boolean> {
  const query: Record<string, string | number | boolean> = {}
  for (const [key, value] of Object.entries(params ?? {})) {
    if (value === undefined || value === null || value === '') continue
    query[key] = value as string | number | boolean
  }
  return query
}

/** Every approval decision in a window, by approver and outcome. */
export async function getApprovalActivity(
  params?: ApprovalActivityParams
): Promise<ApiApprovalActivityReport> {
  return apiClient.get(`${REPORTS}/approvals/activity`, {
    params: reportQuery(params),
  })
}

/** Who can sign in to an account, their role, branches and last sign-in. */
export async function getAccessReview(
  params?: AccessReviewParams
): Promise<ApiAccessReviewReport> {
  return apiClient.get(`${REPORTS}/users/access-review`, {
    params: reportQuery({
      accountId: params?.accountId,
      // Sent as text: the API reads the literal "true".
      ...(params?.includeInactive ? { includeInactive: 'true' } : {}),
    }),
  })
}

/** Every open order and how long it has sat in its current status. */
export async function getOrderAgeing(
  params?: OrderAgeingParams
): Promise<ApiOrderAgeingReport> {
  return apiClient.get(`${REPORTS}/orders/ageing`, {
    params: reportQuery(params),
  })
}

const FILE_TYPES: Record<ReportFileFormat | 'pdf', string> = {
  csv: 'text/csv;charset=utf-8',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  pdf: 'application/pdf',
}

function asBlob(body: unknown, format: ReportFileFormat | 'pdf'): Blob {
  // The interceptor unwraps `response.data`, so this is already the body.
  return body instanceof Blob
    ? body
    : new Blob([body as BlobPart], { type: FILE_TYPES[format] })
}

/**
 * A tabular report as CSV or XLSX (SOW §15). The file route is the JSON route
 * with `.csv` or `.xlsx` appended, and takes the same query.
 */
export async function downloadReportFile(
  report: ReportFileKey,
  format: ReportFileFormat,
  params?: object
): Promise<Blob> {
  const body: unknown = await apiClient.get(`${REPORTS}/${report}.${format}`, {
    params: reportQuery(params),
    responseType: 'blob',
  })
  return asBlob(body, format)
}

/**
 * The executive dashboard as a PDF (SOW §15), from the same filters as the
 * dashboard on screen so the file carries the figures the screen shows.
 */
export async function downloadDashboardPdf(params?: {
  scope?: 'account' | 'platform'
  accountId?: string
  granularity?: 'day' | 'week' | 'month'
  topSites?: number
}): Promise<Blob> {
  const body: unknown = await apiClient.get(`${REPORTS}/dashboard/pdf`, {
    params: reportQuery(params),
    responseType: 'blob',
  })
  return asBlob(body, 'pdf')
}

/**
 * Any tabular report's JSON, by its key (SOW §15). The screens that show these
 * read the same route their CSV and XLSX files are built from, with the same
 * query, so the figures on screen and in the file cannot differ.
 */
export async function getReportData(
  report: ReportFileKey,
  params?: object
): Promise<unknown> {
  return apiClient.get(`${REPORTS}/${report}`, {
    params: reportQuery(params),
  })
}
