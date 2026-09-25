/**
 * Runtime configuration.
 *
 * The API now lives in this same application, under `src/app/api/v1`, so the
 * default is a same-origin path rather than the standalone NestJS service's
 * `http://localhost:4000/api/v1`. The version segment is kept so every existing
 * call site (`/auth/login`, `/orders`, …) resolves to the same URL it always
 * did — only the origin moved.
 *
 * Set `NEXT_PUBLIC_API_BASE_URL` to an absolute URL to point the client back at
 * a separately deployed API instead; both forms work, because everything that
 * reads this runs in the browser.
 */
const DEFAULT_API_BASE_URL = '/api/v1'

export const CONFIG = {
  API_BASE_URL: process.env.NEXT_PUBLIC_API_BASE_URL || DEFAULT_API_BASE_URL,
  APP_TITLE: process.env.NEXT_PUBLIC_APP_TITLE || 'Print Procurement Portal',
  /**
   * Generous next to the backend's own timeouts: the login route hashes with
   * Argon2, and for a Ticket-IT user it makes two cross-region calls to that
   * API before it can answer — which the previous 10s budget cut off mid-flight.
   */
  TIMEOUT: 30000,
}
