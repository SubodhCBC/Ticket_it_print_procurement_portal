import type { ApiUser } from '@/types/auth'

/**
 * Where the session lives between page loads.
 *
 * localStorage rather than a cookie because the API is a separate origin and
 * authenticates with a bearer header, so a cookie would never be sent. The
 * trade-off is XSS exposure; it is bounded by the 15-minute access token, and
 * the refresh token is revocable server-side via /auth/logout.
 *
 * Every accessor is guarded twice: `window` for server rendering, and
 * try/catch for browsers where storage is blocked (private mode, embedded
 * webviews) — a throw here would take down the whole app shell.
 */
const ACCESS_TOKEN_KEY = 'ticketit.accessToken'
const REFRESH_TOKEN_KEY = 'ticketit.refreshToken'
const USER_KEY = 'ticketit.user'

function read(key: string): string | null {
  if (typeof window === 'undefined') return null
  try {
    return window.localStorage.getItem(key)
  } catch {
    return null
  }
}

function write(key: string, value: string): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(key, value)
  } catch {
    // Storage unavailable: the session simply does not survive a reload.
  }
}

function remove(key: string): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.removeItem(key)
  } catch {
    // Nothing to do — see write().
  }
}

export interface StoredSession {
  accessToken: string
  refreshToken: string
  user: ApiUser
}

export const StorageUtil = {
  getToken: (): string | null => read(ACCESS_TOKEN_KEY),
  setToken: (token: string): void => write(ACCESS_TOKEN_KEY, token),
  removeToken: (): void => remove(ACCESS_TOKEN_KEY),

  getRefreshToken: (): string | null => read(REFRESH_TOKEN_KEY),
  setRefreshToken: (token: string): void => write(REFRESH_TOKEN_KEY, token),

  getUser: (): ApiUser | null => {
    const raw = read(USER_KEY)
    if (!raw) return null
    try {
      return JSON.parse(raw) as ApiUser
    } catch {
      // A payload written by an older build. Treat it as no session rather
      // than letting a parse error escape into the render.
      remove(USER_KEY)
      return null
    }
  },
  setUser: (user: ApiUser): void => write(USER_KEY, JSON.stringify(user)),

  /** The whole session, or null when any part of it is missing. */
  getSession: (): StoredSession | null => {
    const accessToken = read(ACCESS_TOKEN_KEY)
    const refreshToken = read(REFRESH_TOKEN_KEY)
    const raw = read(USER_KEY)
    if (!accessToken || !refreshToken || !raw) return null

    try {
      return { accessToken, refreshToken, user: JSON.parse(raw) as ApiUser }
    } catch {
      return null
    }
  },

  setSession: (session: StoredSession): void => {
    write(ACCESS_TOKEN_KEY, session.accessToken)
    write(REFRESH_TOKEN_KEY, session.refreshToken)
    write(USER_KEY, JSON.stringify(session.user))
  },

  clearSession: (): void => {
    remove(ACCESS_TOKEN_KEY)
    remove(REFRESH_TOKEN_KEY)
    remove(USER_KEY)
  },
}
