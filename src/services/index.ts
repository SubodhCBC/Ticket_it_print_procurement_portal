// Client-side API layer
export { default as apiClient } from './api.service'
export {
  apiClient as api,
  ApiError,
  setSessionExpiredHandler,
  toApiError,
} from './api.service'
export type { ApiErrorEnvelope } from './api.service'
export * from './auth.service'

// Domain services (currently using mock data-source)
export * from './accounts.service'
export * from './orders.service'
export * from './products.service'
export * from './pricing.service'
export * from './templates.service'
export * from './reports.service'
export * from './auditLog.service'
