// src/services/data-source/index.ts
import * as apiAccounts from './api/api-accounts.adapter'
import * as apiApprovals from './api/api-approvals.adapter'
import * as apiPricing from './api/api-pricing.adapter'
import * as apiAudit from './api/api-audit.adapter'
import * as apiDam from './api/api-dam.adapter'
import * as apiOrders from './api/api-orders.adapter'
import * as apiProducts from './api/api-products.adapter'
import * as apiReports from './api/api-reports.adapter'
import * as apiTemplates from './api/api-templates.adapter'

/**
 * Where each domain's data comes from.
 *
 * Modules move from the mock adapters to the API one at a time, and this is the
 * seam they move at: the adapters share a signature, so a screen never learns
 * which side it is talking to. `isMock` reports whether anything is still on a
 * fixture, which is what the "Mock Service Layer" badge in the admin sidebar
 * shows.
 *
 * Every domain is now served by the API. `REMAINING_MOCK_DOMAINS` is kept
 * rather than deleted: it is the list the sidebar's badge reads, and an empty
 * one is the honest way to say "nothing is a fixture any more" — a badge that
 * disappeared because its source was removed would look the same as a badge
 * that was never wired up.
 *
 * The cart has no entry here: it is not a fixture-shaped domain, so it goes
 * through the store (`store/cartSlice.ts`) straight to `/cart`.
 */
const REMAINING_MOCK_DOMAINS = [] as const

export function getDataSource() {
  return {
    products: apiProducts,
    templates: apiTemplates,
    accounts: apiAccounts,
    orders: apiOrders,
    approvals: apiApprovals,
    pricing: apiPricing,
    reports: apiReports,
    audit: apiAudit,
    dam: apiDam,
    isMock: (REMAINING_MOCK_DOMAINS as readonly string[]).length > 0,
    mockDomains: REMAINING_MOCK_DOMAINS,
  }
}
