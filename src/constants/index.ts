export const ROLES = {
  ADMIN: 'admin',
  HEAD_OFFICE: 'head_office',
  SITE_USER: 'site_user',
} as const

export type UserRole = (typeof ROLES)[keyof typeof ROLES]

export const API_ENDPOINTS = {
  AUTH: {
    LOGIN: '/auth/login',
    REFRESH: '/auth/refresh',
    LOGOUT: '/auth/logout',
    ME: '/auth/me',
    /**
     * The three public credential routes. They are not under `/auth` on the
     * server — they belong to the invitation and password-reset features — but
     * they are grouped here because `AuthService` is what calls them and a
     * screen looking for "the sign-in family of endpoints" looks here.
     */
    ACCEPT_INVITATION: '/invitations/accept',
    FORGOT_PASSWORD: '/password/forgot',
    RESET_PASSWORD: '/password/reset',
  },
  ACCOUNTS: {
    BASE: '/accounts',
  },
  ORDERS: {
    BASE: '/orders',
  },
  CATALOGUE: {
    BASE: '/catalogue',
  },
}
