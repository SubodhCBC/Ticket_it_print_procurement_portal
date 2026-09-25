'use client'

import { useCallback, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { useAppDispatch, useAppSelector } from '@/store/hooks'
import {
  bootstrapSession,
  clearAuthError,
  login as loginThunk,
  logout as logoutThunk,
  sessionRestored,
} from '@/store/authSlice'
import type { LoginCredentials } from '@/services'
import {
  PORTALS_FOR_ROLE,
  ROLE_DETAILS,
  toSessionUser,
  type LoginResponse,
  type Permission,
  type User,
  type UserRole,
} from '@/types/auth'
import { StorageUtil } from '@/utils'

export const useAuth = () => {
  const dispatch = useAppDispatch()
  const router = useRouter()
  const { user, role, isAuthenticated, isLoading, status, error } =
    useAppSelector((state) => state.auth)

  /**
   * Resolves rather than throws on a bad credential: the sign-in form renders
   * the message inline, and a rejected promise there would only be caught to
   * be turned back into this shape.
   */
  const login = useCallback(
    async (credentials: LoginCredentials) => {
      const result = await dispatch(loginThunk(credentials))

      if (loginThunk.fulfilled.match(result)) {
        return { success: true as const, user: result.payload }
      }
      return {
        success: false as const,
        error: result.payload ?? 'Sign-in failed. Please try again.',
      }
    },
    [dispatch]
  )

  const logout = useCallback(async () => {
    await dispatch(logoutThunk())
    router.replace('/login')
  }, [dispatch, router])

  const bootstrap = useCallback(() => {
    void dispatch(bootstrapSession())
  }, [dispatch])

  /**
   * Signs the user in from a session the caller already holds.
   *
   * `/invitations/accept` answers with the same payload as `/auth/login`, so
   * the invitee is already authenticated by the time the response lands —
   * there is nothing left to authenticate and no credentials to replay.
   *
   * It stores the session and reuses `sessionRestored`, the action
   * `bootstrapSession` uses for exactly this ("here is a session, adopt it"),
   * rather than adding a second sign-in path beside the login thunk.
   * `bootstrap()` cannot do the job here: the thunk's `condition` runs it only
   * while `status` is `idle`, and `AuthProvider` has already spent that at the
   * top of the tree, so a second dispatch is skipped outright.
   */
  const adoptSession = useCallback(
    (session: LoginResponse): User => {
      StorageUtil.setSession({
        accessToken: session.accessToken,
        refreshToken: session.refreshToken,
        user: session.user,
      })
      const sessionUser = toSessionUser(session.user)
      dispatch(sessionRestored(sessionUser))
      return sessionUser
    },
    [dispatch]
  )

  const hasPermission = useCallback(
    (permission: Permission): boolean =>
      user?.permissions.includes(permission) ?? false,
    [user]
  )

  const canAccessRole = useCallback(
    (allowedRoles: UserRole[]): boolean =>
      role ? allowedRoles.includes(role) : false,
    [role]
  )

  /** The portals this user may open — see PORTALS_FOR_ROLE. */
  const accessiblePortals = useMemo(
    () => (role ? PORTALS_FOR_ROLE[role] : []),
    [role]
  )

  /** Where a user belongs when they land on `/` or finish signing in. */
  const homeRoute = role ? ROLE_DETAILS[role].defaultRedirect : '/login'

  return {
    user,
    role,
    isAuthenticated,
    isLoading,
    /** 'ready' once the stored session has been restored and revalidated. */
    status,
    error,
    login,
    logout,
    bootstrap,
    adoptSession,
    clearError: useCallback(() => dispatch(clearAuthError()), [dispatch]),
    hasPermission,
    canAccessRole,
    accessiblePortals,
    homeRoute,
  }
}
