import axios, {
  AxiosError,
  AxiosHeaders,
  type AxiosResponse,
  type InternalAxiosRequestConfig,
} from 'axios'
import { CONFIG } from '@/config'
import type { LoginResponse } from '@/types/auth'
import { StorageUtil } from '@/utils'

declare module 'axios' {
  /**
   * Opts one request out of the 401 refresh-and-retry below. Set on
   * /auth/refresh and /auth/logout, where a retry would either recurse or
   * replay a token that has already been revoked.
   */
  export interface AxiosRequestConfig {
    skipAuthRefresh?: boolean
  }
}

/** The envelope every failing route returns — see AllExceptionsFilter. */
export interface ApiErrorEnvelope {
  error: {
    code: string
    message: string
    details?: Record<string, unknown>
  }
  meta: {
    requestId: string
    timestamp: string
    path: string
  }
}

/**
 * An API failure, already unwrapped.
 *
 * Screens catch this rather than an AxiosError so they never have to know how
 * the transport nests its payload, and so the request id — which support asks
 * for — survives to whatever renders the message.
 */
export class ApiError extends Error {
  readonly status: number
  readonly code: string
  readonly details?: Record<string, unknown>
  readonly requestId?: string

  constructor(init: {
    status: number
    code: string
    message: string
    details?: Record<string, unknown>
    requestId?: string
  }) {
    super(init.message)
    this.name = 'ApiError'
    this.status = init.status
    this.code = init.code
    this.details = init.details
    this.requestId = init.requestId
  }
}

export function toApiError(error: unknown): ApiError {
  if (error instanceof ApiError) return error

  if (axios.isAxiosError(error)) {
    const envelope = error.response?.data as ApiErrorEnvelope | undefined

    if (envelope?.error) {
      return new ApiError({
        status: error.response?.status ?? 0,
        code: envelope.error.code,
        message: envelope.error.message,
        details: envelope.error.details,
        requestId: envelope.meta?.requestId,
      })
    }

    // No envelope means the request never reached the API: the dev server is
    // down, the origin is not in CORS_ORIGINS, or the browser is offline.
    // Saying so beats surfacing axios's "Network Error".
    if (!error.response) {
      // A request that ran out of time has no response either, but it did
      // reach something. The message stays as it was for every caller; the
      // detail lets one that knows better — a long upload — say so instead.
      const timedOut =
        error.code === 'ECONNABORTED' ||
        error.code === 'ETIMEDOUT' ||
        /timeout/i.test(error.message || '')
      return new ApiError({
        status: 0,
        code: 'NETWORK_ERROR',
        message:
          'Could not reach the API. Check that the backend is running and that this origin ' +
          'is listed in its CORS_ORIGINS.',
        ...(timedOut ? { details: { timedOut: true } } : {}),
      })
    }

    return new ApiError({
      status: error.response.status,
      code: 'UNEXPECTED_ERROR',
      message: error.message,
    })
  }

  return new ApiError({
    status: 0,
    code: 'UNEXPECTED_ERROR',
    message: error instanceof Error ? error.message : 'Unexpected error',
  })
}

export const apiClient = axios.create({
  baseURL: CONFIG.API_BASE_URL,
  timeout: CONFIG.TIMEOUT,
  // Declared per method rather than globally: announcing a JSON body on a GET
  // or a bodyless DELETE is a claim the request does not honour, and strict
  // servers reject it.
  headers: {
    post: { 'Content-Type': 'application/json' },
    put: { 'Content-Type': 'application/json' },
    patch: { 'Content-Type': 'application/json' },
  },
})

/** Carries the one-shot marker that stops a retry from retrying itself. */
interface RetryableRequest extends InternalAxiosRequestConfig {
  _retried?: boolean
}

apiClient.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const token = StorageUtil.getToken()
  if (token) {
    const headers = AxiosHeaders.from(config.headers)
    headers.set('Authorization', `Bearer ${token}`)
    config.headers = headers
  }
  return config
})

/**
 * Called when the refresh token is gone or rejected. Registered by the auth
 * layer rather than imported, because this module must not depend on the store
 * — the store's slices depend on it.
 */
let onSessionExpired: (() => void) | null = null

export function setSessionExpiredHandler(handler: (() => void) | null): void {
  onSessionExpired = handler
}

/**
 * In-flight refresh, shared by every request that 401s while it runs.
 *
 * Without this, a screen firing five parallel requests on mount would rotate
 * the refresh token five times; rotation invalidates the previous token, so
 * four of them would fail and log the user out during a perfectly normal page
 * load.
 */
let refreshInFlight: Promise<string> | null = null

/**
 * The shared refresh, cleared the moment it settles rather than after the
 * retry that consumed it — a caller arriving between those two points would
 * otherwise start a second rotation and invalidate the first.
 */
function getFreshAccessToken(): Promise<string> {
  if (!refreshInFlight) {
    refreshInFlight = refreshAccessToken().finally(() => {
      refreshInFlight = null
    })
  }
  return refreshInFlight
}

async function refreshAccessToken(): Promise<string> {
  const refreshToken = StorageUtil.getRefreshToken()
  if (!refreshToken)
    throw new ApiError({
      status: 401,
      code: 'NO_SESSION',
      message: 'No session',
    })

  // A bare axios call, not apiClient: the request interceptor would attach the
  // expired access token, and a failure here must not recurse into this
  // interceptor.
  const response = await axios.post(
    `${CONFIG.API_BASE_URL}/auth/refresh`,
    { refreshToken },
    { headers: { 'Content-Type': 'application/json' }, timeout: CONFIG.TIMEOUT }
  )

  const data = response.data as LoginResponse

  StorageUtil.setSession({
    accessToken: data.accessToken,
    refreshToken: data.refreshToken,
    user: data.user,
  })

  return data.accessToken
}

apiClient.interceptors.response.use(
  // Routes return their payload directly; callers want that, not the envelope.
  (response: AxiosResponse) => response.data,

  async (error: AxiosError) => {
    const request = error.config as RetryableRequest | undefined

    const canRetry =
      error.response?.status === 401 &&
      request !== undefined &&
      !request._retried &&
      !request.skipAuthRefresh &&
      StorageUtil.getRefreshToken() !== null

    if (!canRetry) return Promise.reject(toApiError(error))

    try {
      const accessToken = await getFreshAccessToken()

      request._retried = true
      const headers = AxiosHeaders.from(request.headers)
      headers.set('Authorization', `Bearer ${accessToken}`)
      request.headers = headers

      return await apiClient.request(request)
    } catch {
      StorageUtil.clearSession()
      onSessionExpired?.()
      return Promise.reject(toApiError(error))
    }
  }
)

export default apiClient
