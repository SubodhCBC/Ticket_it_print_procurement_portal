/**
 * Query keys, in one place.
 *
 * Deduplication is by key, so two screens asking the same question have to
 * spell it the same way — which they will not do reliably if each writes its
 * own array inline. This is also what a mutation invalidates against.
 */
export const queryKeys = {
  orders: (params?: unknown) => ['orders', params ?? {}] as const,
  order: (id: string) => ['orders', 'detail', id] as const,
  pendingApprovals: (accountId?: string) =>
    ['orders', 'awaiting-approval', accountId ?? ''] as const,
  fulfilmentQueue: () => ['orders', 'fulfilment'] as const,

  /** NZ Post labels for one order. Under `shipping` so a label change clears every view of it. */
  orderShipments: (orderId: string) =>
    ['shipping', 'order', orderId, 'shipments'] as const,
  orderTracking: (orderId: string) =>
    ['shipping', 'order', orderId, 'tracking'] as const,
  shipmentQueue: (params?: unknown) =>
    ['shipping', 'queue', params ?? {}] as const,
  pickups: (page: number) => ['shipping', 'pickups', page] as const,
  shippingStatus: () => ['shipping', 'status'] as const,

  products: (params?: unknown) => ['products', params ?? {}] as const,
  product: (id: string) => ['products', 'detail', id] as const,
  categories: () => ['products', 'categories'] as const,

  rateCards: (params?: unknown) => ['rate-cards', params ?? {}] as const,
  rateCard: (id: string) => ['rate-cards', 'detail', id] as const,

  /** One row per account; the settings screen is the only reader. */
  settings: () => ['settings'] as const,

  accounts: (params?: unknown) => ['accounts', params ?? {}] as const,
  sites: (params?: unknown) => ['sites', params ?? {}] as const,
  users: (params?: unknown) => ['users', params ?? {}] as const,

  dashboardKpis: () => ['reports', 'dashboard'] as const,
  hoDashboardKpis: (accountId: string) =>
    ['reports', 'ho-dashboard', accountId] as const,
  monthlyBilling: (period: string) =>
    ['reports', 'monthly-billing', period] as const,
  hoMonthlyBilling: (accountId: string, period: string) =>
    ['reports', 'ho-monthly-billing', accountId, period] as const,

  approvalActivity: (params?: unknown) =>
    ['reports', 'approval-activity', params ?? {}] as const,
  accessReview: (params?: unknown) =>
    ['reports', 'access-review', params ?? {}] as const,
  orderAgeing: (params?: unknown) =>
    ['reports', 'order-ageing', params ?? {}] as const,
  reportData: (report: string, params?: unknown) =>
    ['reports', 'data', report, params ?? {}] as const,

  auditLogs: (params?: unknown) => ['audit-logs', params ?? {}] as const,
  templates: (params?: unknown) => ['templates', params ?? {}] as const,
  template: (id: string) => ['templates', 'detail', id] as const,
  templateVersions: (id: string) => ['templates', 'versions', id] as const,
  /** The published snapshot a buyer personalises — not the working copy. */
  customisableTemplate: (id: string) => ['templates', 'customise', id] as const,
} as const
