// src/services/data-source/api/api-files.adapter.ts
import { apiClient } from '@/services/api.service'

/**
 * Files the API serves only to a signed-in caller: a line's artwork preview, a
 * fulfilment docket, an invoice PDF.
 *
 * None of them can be put in an `<img src>` or opened by URL, because the
 * browser would send no bearer token. They are fetched through the API client —
 * which adds it — as bytes, and handed to the page as a Blob.
 */

/**
 * The API reports some paths whole (`/api/v1/orders/…/preview`). The client
 * already prefixes its base URL, so the prefix is taken off rather than doubled.
 */
function relativeToApi(path: string): string {
  return path.replace(/^\/api\/v1(?=\/)/, '')
}

export async function fetchApiBlob(path: string): Promise<Blob> {
  const body: unknown = await apiClient.get(relativeToApi(path), {
    responseType: 'blob',
  })
  // The response interceptor unwraps `response.data`, so this is the body.
  return body instanceof Blob ? body : new Blob([body as BlobPart])
}

/** The order's fulfilment docket, as a PDF. */
export function fetchOrderDocket(orderId: string): Promise<Blob> {
  return fetchApiBlob(`/orders/${encodeURIComponent(orderId)}/docket`)
}

/** The invoice document, as a PDF, for showing in the page. */
export function fetchInvoicePdf(invoiceId: string): Promise<Blob> {
  return fetchApiBlob(`/billing/invoices/${encodeURIComponent(invoiceId)}/pdf`)
}
