import { apiClient } from './api.service'
import { API_ENDPOINTS } from '@/constants'
import type { ApiUser, LoginResponse } from '@/types/auth'

export interface LoginCredentials {
  /**
   * The legacy `Users.Login` value, not the email address. Email is not unique
   * upstream — 159 groups of users share one — so it cannot identify an
   * account, which is why the sign-in form asks for a username.
   */
  login: string
  password: string
}

/** Body of POST /invitations/accept — mirrors `AcceptInvitationSchema`. */
export interface AcceptInvitationPayload {
  /** The `token` query parameter from the invitation email's link. */
  token: string
  /** The password being set for the first time: 12–256 characters. */
  password: string
}

/** Body of POST /password/reset — mirrors `ResetPasswordSchema`. */
export interface ResetPasswordPayload {
  /** The `token` query parameter from the reset email's link. */
  token: string
  /** The replacement password: 12–256 characters. */
  password: string
}

export const AuthService = {
  login: (credentials: LoginCredentials): Promise<LoginResponse> =>
    apiClient.post(API_ENDPOINTS.AUTH.LOGIN, credentials),

  refresh: (refreshToken: string): Promise<LoginResponse> =>
    apiClient.post(
      API_ENDPOINTS.AUTH.REFRESH,
      { refreshToken },
      // The interceptor must not try to refresh a failing refresh.
      { skipAuthRefresh: true }
    ),

  /**
   * Idempotent and public server-side: a client holding an expired access
   * token must still be able to end its session, so a failure here is not
   * worth blocking the local sign-out on.
   */
  logout: (refreshToken: string): Promise<void> =>
    apiClient.post(
      API_ENDPOINTS.AUTH.LOGOUT,
      { refreshToken },
      { skipAuthRefresh: true }
    ),

  me: (): Promise<ApiUser> => apiClient.get(API_ENDPOINTS.AUTH.ME),

  /**
   * Redeems an invitation token and sets the invitee's first password.
   *
   * Answers a full login response, so the caller must store the session — the
   * user is signed in from here, not sent back to the sign-in form to retype
   * the password they just chose.
   *
   * `skipAuthRefresh` because the route is public: a stale access token left in
   * storage must not turn a plain rejection into a refresh-and-sign-out.
   */
  acceptInvitation: (
    payload: AcceptInvitationPayload
  ): Promise<LoginResponse> =>
    apiClient.post(API_ENDPOINTS.AUTH.ACCEPT_INVITATION, payload, {
      skipAuthRefresh: true,
    }),

  /**
   * Asks for a reset link. Always resolves with no content, whether or not the
   * identifier matches an account — the screen must therefore say the same
   * thing either way rather than inferring anything from success.
   */
  requestPasswordReset: (identifier: string): Promise<void> =>
    apiClient.post(
      API_ENDPOINTS.AUTH.FORGOT_PASSWORD,
      { identifier },
      { skipAuthRefresh: true }
    ),

  /**
   * Completes a reset. Every session is revoked server-side, so the user has to
   * sign in again afterwards — there is no session to store here.
   */
  resetPassword: (payload: ResetPasswordPayload): Promise<void> =>
    apiClient.post(API_ENDPOINTS.AUTH.RESET_PASSWORD, payload, {
      skipAuthRefresh: true,
    }),
}
