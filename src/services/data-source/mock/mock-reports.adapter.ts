// src/lib/data-source/mock/mock-reports.adapter.ts
import initialOrders from './fixtures/orders.json'
import initialSites from './fixtures/sites.json'
import initialAccounts from './fixtures/accounts.json'
import type {
  MonthlyBillingReport,
  DashboardKPIs,
  HODashboardKPIs,
  HOMonthlyBillingReport,
  HOBillingLineItem,
  HOSpendBysite,
  Order,
  OrderStatus,
  Site,
  Account,
} from '@/types'
import { simulateLatency } from './utils'

// ─── Site bill-to address lookup (for HO billing reconciliation) ─────────────
const SITE_BILL_TO: Record<string, string> = {
  'site-101': '550 Lexington Avenue, 14th Floor, New York, NY 10022, USA',
  'site-102': '550 Lexington Avenue, 14th Floor, New York, NY 10022, USA',
  'site-106': '550 Lexington Avenue, 14th Floor, New York, NY 10022, USA',
  'site-103': '111 W Jackson Blvd, Suite 800, Chicago, IL 60604, USA',
  'site-104': '111 W Jackson Blvd, Suite 800, Chicago, IL 60604, USA',
  'site-105': '650 Mission Street, Floor 20, San Francisco, CA 94105, USA',
}

const SITE_SHIP_TO: Record<string, string> = {
  'site-101':
    '550 Lexington Ave, Ground Floor Dispensary Receiving, New York, NY 10022',
  'site-102':
    '300 Cadman Plaza West, Building C Loading Dock, Brooklyn, NY 11201',
  'site-106': '90-21 Queens Blvd, Medical Suite 4F, Elmhurst, NY 11373',
  'site-103': '920 W Randolph St, Suite 100, Chicago, IL 60607',
  'site-104': '420 8th Avenue, Dispensing Suite 2B, New York, NY 10001',
  'site-105':
    '1800 Owens Street, Mission Bay Cleanroom Dock, San Francisco, CA 94158',
}

function formatAddress(addr: any): string {
  if (!addr) return ''
  return [
    addr.street,
    addr.suite,
    addr.city,
    addr.state,
    addr.postalCode,
    addr.country,
  ]
    .filter(Boolean)
    .join(', ')
}

function getMonthKey(isoDate: string): string {
  const d = new Date(isoDate)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function getMonthLabel(isoDate: string): string {
  const d = new Date(isoDate)
  return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
}

function periodToMonthKey(period: string): string {
  // Accept "august-2026", "August 2026", "2026-08"
  const lower = period.toLowerCase().replace(/\s+/g, '-')
  const months: Record<string, string> = {
    january: '01',
    february: '02',
    march: '03',
    april: '04',
    may: '05',
    june: '06',
    july: '07',
    august: '08',
    september: '09',
    october: '10',
    november: '11',
    december: '12',
  }
  // Try "month-year" format
  const parts = lower.split('-')
  if (parts.length === 2 && months[parts[0]]) {
    return `${parts[1]}-${months[parts[0]]}`
  }
  // Already "2026-08"
  if (/^\d{4}-\d{2}$/.test(period)) return period
  return '2026-08' // fallback
}

// ─── Admin Dashboard KPIs (unchanged) ────────────────────────────────────────
export async function getMonthlyBillingReport(
  period = 'August 2026'
): Promise<MonthlyBillingReport> {
  await simulateLatency()

  const siteBreakdowns = [
    {
      siteId: 'site-101',
      siteCode: 'APX-MID-101',
      siteName: 'Apex Midtown Central Pharmacy',
      accountName: 'Apex Healthcare Group',
      ordersCount: 42,
      purchaseOrdersCount: 38,
      totalSpend: 9450.0,
      topCategory: 'Specialized Packaging',
      status: 'SETTLED' as const,
    },
    {
      siteId: 'site-102',
      siteCode: 'APX-BK-102',
      siteName: 'Apex Brooklyn Hub & Infusion',
      accountName: 'Apex Healthcare Group',
      ordersCount: 28,
      purchaseOrdersCount: 28,
      totalSpend: 6800.0,
      topCategory: 'Point of Sale',
      status: 'SETTLED' as const,
    },
    {
      siteId: 'site-105',
      siteCode: 'BCN-SF-105',
      siteName: 'Beacon Bay Area Biologics Center',
      accountName: 'Beacon Clinic & Biologics',
      ordersCount: 22,
      purchaseOrdersCount: 21,
      totalSpend: 8200.0,
      topCategory: 'Regulatory Documents',
      status: 'PENDING' as const,
    },
    {
      siteId: 'site-103',
      siteCode: 'MET-CHI-103',
      siteName: 'Metro Chicago West Loop Dispensary',
      accountName: 'Metro Dispensaries Network',
      ordersCount: 35,
      purchaseOrdersCount: 32,
      totalSpend: 7250.0,
      topCategory: 'Merchandise & Uniforms',
      status: 'SETTLED' as const,
    },
    {
      siteId: 'site-104',
      siteCode: 'PHARM-NYC-104',
      siteName: 'Downtown Dispensing Hub #104',
      accountName: 'Metro Dispensaries Network',
      ordersCount: 19,
      purchaseOrdersCount: 19,
      totalSpend: 5150.0,
      topCategory: 'Specialized Packaging',
      status: 'SETTLED' as const,
    },
  ]

  const totalSpend = siteBreakdowns.reduce((acc, s) => acc + s.totalSpend, 0)
  const totalOrders = siteBreakdowns.reduce((acc, s) => acc + s.ordersCount, 0)

  return {
    period,
    invoiceNumber: 'INV-RH-2026-08',
    invoiceDate: '2026-08-01',
    dueDate: '2026-08-31',
    totalSpend,
    totalOrders,
    activeSitesCount: siteBreakdowns.length,
    siteBreakdowns,
    categoryBreakdown: [
      { category: 'Specialized Packaging', spend: 14600.0, percentage: 39.6 },
      { category: 'Regulatory Documents', spend: 8200.0, percentage: 22.3 },
      { category: 'Point of Sale', spend: 6800.0, percentage: 18.5 },
      { category: 'Merchandise & Uniforms', spend: 7250.0, percentage: 19.6 },
    ],
  }
}

/** The statuses a fixture order is finished in. Mirrors the API lifecycle. */
const TERMINAL_MOCK_STATUSES: OrderStatus[] = [
  'DELIVERED',
  'REJECTED',
  'CANCELLED',
  'DRAFT',
]

export async function getDashboardKPIs(): Promise<DashboardKPIs> {
  await simulateLatency()

  const orders = initialOrders as Order[]
  const sites = initialSites as Site[]
  const accounts = initialAccounts as Account[]

  const statusMap: Record<OrderStatus, { count: number; value: number }> = {
    DRAFT: { count: 0, value: 0 },
    PENDING_APPROVAL: { count: 0, value: 0 },
    CHANGES_REQUESTED: { count: 0, value: 0 },
    APPROVED: { count: 0, value: 0 },
    PAID: { count: 0, value: 0 },
    ORDER_PLACED: { count: 0, value: 0 },
    IN_PRODUCTION: { count: 0, value: 0 },
    RECEIVED: { count: 0, value: 0 },
    PROCESSING: { count: 0, value: 0 },
    DISPATCHED: { count: 0, value: 0 },
    DELIVERED: { count: 0, value: 0 },
    REJECTED: { count: 0, value: 0 },
    CANCELLED: { count: 0, value: 0 },
  }

  orders.forEach((o) => {
    if (statusMap[o.status]) {
      statusMap[o.status].count += 1
      statusMap[o.status].value += o.totalAmount
    }
  })

  return {
    totalRevenueMonth: 36850.0,
    revenueDeltaPct: 14.8,
    activeOrdersCount: orders.filter(
      (o) => o.status === 'RECEIVED' || o.status === 'PROCESSING'
    ).length,
    ordersDeltaPct: 8.2,
    pendingFulfilmentCount: orders.filter((o) => o.status === 'PROCESSING')
      .length,
    // The live queue the API bundle carries. Counted off the fixtures rather
    // than typed in, so this adapter keeps saying something consistent with the
    // orders it is holding.
    openOrdersCount: orders.filter(
      (o) => !TERMINAL_MOCK_STATUSES.includes(o.status)
    ).length,
    awaitingApprovalCount: orders.filter((o) => o.status === 'PENDING_APPROVAL')
      .length,
    inFulfilmentCount: orders.filter((o) =>
      ['APPROVED', 'PROCESSING', 'DISPATCHED'].includes(o.status)
    ).length,
    inTransitCount: orders.filter((o) => o.status === 'DISPATCHED').length,
    ordersPerDay: Math.round((orders.length / 30) * 10) / 10,
    activeSitesCount: sites.length,
    activeAccountsCount: accounts.filter((a) => a.status === 'ACTIVE').length,
    recentOrders: orders.slice(0, 5),
    statusDistribution: (Object.keys(statusMap) as OrderStatus[]).map((st) => ({
      status: st,
      count: statusMap[st].count,
      value: statusMap[st].value,
    })),
    revenueTrend: [
      { month: 'Mar 26', spend: 28400, orders: 112 },
      { month: 'Apr 26', spend: 31200, orders: 124 },
      { month: 'May 26', spend: 29800, orders: 118 },
      { month: 'Jun 26', spend: 33500, orders: 135 },
      { month: 'Jul 26', spend: 35100, orders: 140 },
      { month: 'Aug 26', spend: 36850, orders: 146 },
    ],
  }
}

// ─── Head Office Dashboard KPIs ──────────────────────────────────────────────
export async function getHODashboardKPIs(
  accountId: string
): Promise<HODashboardKPIs> {
  await simulateLatency()

  const allOrders = initialOrders as Order[]
  const allSites = initialSites as Site[]
  const accounts = initialAccounts as Account[]

  // Enforce accountId scoping at data layer
  const orders = allOrders.filter((o) => o.accountId === accountId)
  const sites = allSites.filter((s) => s.accountId === accountId)
  const account = accounts.find((a) => a.id === accountId)

  const thisMonthKey = '2026-08'
  const lastMonthKey = '2026-07'

  const thisMonthOrders = orders.filter(
    (o) => getMonthKey(o.createdAt) === thisMonthKey
  )
  const lastMonthOrders = orders.filter(
    (o) => getMonthKey(o.createdAt) === lastMonthKey
  )

  const totalSpendThisMonth = thisMonthOrders.reduce(
    (s, o) => s + o.totalAmount,
    0
  )
  const totalSpendLastMonth = lastMonthOrders.reduce(
    (s, o) => s + o.totalAmount,
    0
  )
  const spendDeltaPct =
    totalSpendLastMonth > 0
      ? ((totalSpendThisMonth - totalSpendLastMonth) / totalSpendLastMonth) *
        100
      : 0

  // Spend by site (this month)
  const siteSpendMap: Record<
    string,
    { siteName: string; siteCode: string; spend: number; orders: number }
  > = {}
  thisMonthOrders.forEach((o) => {
    if (!siteSpendMap[o.siteId]) {
      siteSpendMap[o.siteId] = {
        siteName: o.siteName,
        siteCode: o.siteCode,
        spend: 0,
        orders: 0,
      }
    }
    siteSpendMap[o.siteId].spend += o.totalAmount
    siteSpendMap[o.siteId].orders += 1
  })

  const spendBySite: HOSpendBysite[] = Object.entries(siteSpendMap)
    .map(([siteId, v]) => ({
      siteId,
      siteCode: v.siteCode,
      siteName: v.siteName,
      ordersCount: v.orders,
      totalSpend: v.spend,
      percentageOfTotal:
        totalSpendThisMonth > 0 ? (v.spend / totalSpendThisMonth) * 100 : 0,
    }))
    .sort((a, b) => b.totalSpend - a.totalSpend)

  const topSite = spendBySite[0] ?? { siteName: '—', siteCode: '—', spend: 0 }

  // 6-month trend
  const trendMonths = [
    { key: '2026-03', label: 'Mar 26' },
    { key: '2026-04', label: 'Apr 26' },
    { key: '2026-05', label: 'May 26' },
    { key: '2026-06', label: 'Jun 26' },
    { key: '2026-07', label: 'Jul 26' },
    { key: '2026-08', label: 'Aug 26' },
  ]

  const spendTrend = trendMonths.map(({ key, label }) => {
    const monthOrders = orders.filter((o) => getMonthKey(o.createdAt) === key)
    return {
      month: label,
      spend: monthOrders.reduce((s, o) => s + o.totalAmount, 0),
      orders: monthOrders.length,
    }
  })

  const recentOrders = [...orders]
    .sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    )
    .slice(0, 5)

  return {
    accountId,
    accountName: account?.name ?? 'Unknown Account',
    totalSpendThisMonth,
    totalSpendLastMonth,
    spendDeltaPct: Math.round(spendDeltaPct * 10) / 10,
    orderCountThisMonth: thisMonthOrders.length,
    orderCountLastMonth: lastMonthOrders.length,
    ordersDeltaPct:
      lastMonthOrders.length > 0
        ? Math.round(
            ((thisMonthOrders.length - lastMonthOrders.length) /
              lastMonthOrders.length) *
              1000
          ) / 10
        : 0,
    activeSitesCount: sites.length,
    topSite: {
      siteName: topSite.siteName,
      siteCode: topSite.siteCode,
      spend: topSite.totalSpend,
    },
    recentOrders,
    spendBySite,
    spendTrend,
  }
}

// ─── Head Office Monthly Billing Report ──────────────────────────────────────
export async function getHOMonthlyBillingReport(
  accountId: string,
  period: string
): Promise<HOMonthlyBillingReport> {
  await simulateLatency(400) // slightly longer for "report generation" feel

  const allOrders = initialOrders as Order[]
  const allSites = initialSites as Site[]
  const accounts = initialAccounts as Account[]

  const account = accounts.find((a) => a.id === accountId)
  const monthKey = periodToMonthKey(period)

  // Enforce accountId + period scoping at data layer
  const orders = allOrders.filter(
    (o) => o.accountId === accountId && getMonthKey(o.createdAt) === monthKey
  )
  const sites = allSites.filter((s) => s.accountId === accountId)

  // Build reconciliation line items
  const lineItems: HOBillingLineItem[] = []
  orders.forEach((order) => {
    const site = sites.find((s) => s.id === order.siteId)
    order.lineItems.forEach((li) => {
      lineItems.push({
        orderNumber: order.orderNumber,
        orderDate: order.createdAt,
        accountName: order.accountName,
        accountId: order.accountId,
        siteName: order.siteName,
        siteId: order.siteId,
        siteCode: order.siteCode,
        orderedByUser: order.userName,
        orderedByEmail: order.userEmail,
        poReference: order.poReference ?? '',
        productName: li.productName,
        sku: li.sku,
        packSize: li.packSize ?? '',
        uom: li.uom ?? '',
        qty: li.qty,
        unitPrice: li.unitPrice,
        lineValue: li.lineTotal,
        taxTreatment: 'Zero-rated (Healthcare Exempt)',
        orderTotal: order.totalAmount,
        shipToAddress:
          SITE_SHIP_TO[order.siteId] ??
          (site ? formatAddress(site.shipToAddress) : ''),
        deliveryContact: order.userName,
        deliveryInstructions: order.deliveryNotes ?? '',
        billToAddress:
          SITE_BILL_TO[order.siteId] ??
          (site ? formatAddress(site.billToAddress) : ''),
        billToEntity: order.accountName,
        status: order.status,
        notes: order.carrier
          ? `${order.carrier} — ${order.trackingNumber ?? ''}`
          : '',
      })
    })
  })

  // Site breakdowns
  const siteSpendMap: Record<
    string,
    { siteName: string; siteCode: string; spend: number; orders: number }
  > = {}
  orders.forEach((o) => {
    if (!siteSpendMap[o.siteId]) {
      siteSpendMap[o.siteId] = {
        siteName: o.siteName,
        siteCode: o.siteCode,
        spend: 0,
        orders: 0,
      }
    }
    siteSpendMap[o.siteId].spend += o.totalAmount
    siteSpendMap[o.siteId].orders += 1
  })

  const totalSpend = orders.reduce((s, o) => s + o.totalAmount, 0)

  const siteBreakdowns: HOSpendBysite[] = Object.entries(siteSpendMap)
    .map(([siteId, v]) => ({
      siteId,
      siteCode: v.siteCode,
      siteName: v.siteName,
      ordersCount: v.orders,
      totalSpend: v.spend,
      percentageOfTotal: totalSpend > 0 ? (v.spend / totalSpend) * 100 : 0,
    }))
    .sort((a, b) => b.totalSpend - a.totalSpend)

  // Category breakdown (based on SKU prefix)
  const categoryMap: Record<string, number> = {}
  lineItems.forEach((li) => {
    let cat = 'Other'
    if (li.sku.startsWith('PKG')) cat = 'Specialized Packaging'
    else if (li.sku.startsWith('POS')) cat = 'Point of Sale'
    else if (li.sku.startsWith('LBL')) cat = 'Labels & Regulatory'
    else if (li.sku.startsWith('MERCH')) cat = 'Merchandise & Uniforms'
    else if (li.sku.startsWith('DOC')) cat = 'Documents & Registers'
    categoryMap[cat] = (categoryMap[cat] ?? 0) + li.lineValue
  })
  const categoryBreakdown = Object.entries(categoryMap)
    .map(([category, spend]) => ({
      category,
      spend,
      percentage:
        totalSpend > 0 ? Math.round((spend / totalSpend) * 1000) / 10 : 0,
    }))
    .sort((a, b) => b.spend - a.spend)

  const periodLabel =
    orders.length > 0 ? getMonthLabel(orders[0].createdAt) : period

  return {
    accountId,
    accountName: account?.name ?? 'Unknown Account',
    period: monthKey,
    periodLabel,
    generatedAt: new Date().toISOString(),
    invoiceRef: `INV-${accountId.toUpperCase()}-${monthKey.replace('-', '')}`,
    totalSpend,
    totalOrders: orders.length,
    totalLineItems: lineItems.length,
    activeSitesCount: Object.keys(siteSpendMap).length,
    siteBreakdowns,
    lineItems,
    categoryBreakdown,
  }
}
