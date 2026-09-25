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
 * This is the seam every screen reads its data through, so a screen never
 * learns which side it is talking to. Every domain is served by the API: the
 * fixture adapters this seam used to be able to switch to are gone, along with
 * the order and tracking numbers they invented.
 *
 * `isMock` and `mockDomains` went with them, and so did the sidebar badge that
 * was their only reader — with nothing left to be a fixture, it could only ever
 * report LIVE.
 *
 * The cart has no entry here: it is not a fixture-shaped domain, so it goes
 * through the store (`store/cartSlice.ts`) straight to `/cart`.
 */
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
  }
}
