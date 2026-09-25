import {
  createAsyncThunk,
  createSlice,
  type PayloadAction,
} from '@reduxjs/toolkit'
import { AuthService, toApiError, type LoginCredentials } from '@/services'
import { toSessionUser, type User, type UserRole } from '@/types/auth'
import { StorageUtil } from '@/utils'

/**
 * `idle` until the session has been restored from storage and revalidated
 * against /auth/me. Guards must wait for `ready`, otherwise a hard refresh
 * bounces an authenticated user to the login screen for the split second
 * before the session comes back.
 */
export type AuthStatus = 'idle' | 'restoring' | 'ready'

interface AuthState {
  user: User | null
  role: UserRole | null
  isAuthenticated: boolean
  isLoading: boolean
  status: AuthStatus
  error: string | null
}

/**
 * Always signed out on the first render.
 *
 * Reading localStorage here instead would produce different markup on the
 * server and in the browser and trip a hydration mismatch; `bootstrapSession`
 * fills the state in immediately afterwards.
 */
const initialState: AuthState = {
  user: null,
  role: null,
  isAuthenticated: false,
  isLoading: false,
  status: 'idle',
  error: null,
}

export const login = createAsyncThunk<
  User,
  LoginCredentials,
  { rejectValue: string }
>('auth/login', async (credentials, { rejectWithValue }) => {
  try {
    const response = await AuthService.login(credentials)
    StorageUtil.setSession({
      accessToken: response.accessToken,
      refreshToken: response.refreshToken,
      user: response.user,
    })
    return toSessionUser(response.user)
  } catch (error) {
    return rejectWithValue(toApiError(error).message)
  }
})

/**
 * Restores the stored session and re-reads the user from the API.
 *
 * The stored copy is shown first so the app renders without a flash, then
 * /auth/me confirms it: a role changed or an account deactivated since the
 * last visit has to take effect on this load, not on the next login.
 */
export const bootstrapSession = createAsyncThunk<
  User | null,
  void,
  { state: { auth: AuthState } }
>(
  'auth/bootstrap',
  async (_, { dispatch }) => {
    const stored = StorageUtil.getSession()
    if (!stored) return null

    dispatch(sessionRestored(toSessionUser(stored.user)))

    try {
      const user = await AuthService.me()
      StorageUtil.setUser(user)
      return toSessionUser(user)
    } catch (error) {
      // 401 means the refresh token is gone too — the interceptor already
      // tried. Anything else (the API being down) leaves the stored session
      // in place rather than signing the user out over a transient failure.
      if (toApiError(error).status === 401) {
        StorageUtil.clearSession()
        return null
      }
      return toSessionUser(stored.user)
    }
  },
  {
    /**
     * One bootstrap per session, however many times it is dispatched.
     *
     * The provider mounts once, but a dispatch that arrives while the first is
     * still in flight would fire a second `/auth/me` — two identical requests
     * racing to answer the same question. Redux Toolkit skips the thunk
     * entirely when this returns false, which is cheaper and clearer than
     * de-duplicating the request underneath.
     */
    condition: (_arg, { getState }) => getState().auth.status === 'idle',
  }
)

export const logout = createAsyncThunk<void>('auth/logout', async () => {
  const refreshToken = StorageUtil.getRefreshToken()
  StorageUtil.clearSession()

  if (!refreshToken) return
  try {
    await AuthService.logout(refreshToken)
  } catch {
    // The local session is already gone; a failed revoke must not strand the
    // user on a screen they can no longer load data for.
  }
})

function signIn(state: AuthState, user: User): void {
  state.user = user
  state.role = user.uiRole
  state.isAuthenticated = true
  state.isLoading = false
  state.error = null
}

function signOut(state: AuthState): void {
  state.user = null
  state.role = null
  state.isAuthenticated = false
  state.isLoading = false
}

const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    /** The optimistic half of bootstrapSession — see the thunk. */
    sessionRestored: (state, action: PayloadAction<User>) => {
      signIn(state, action.payload)
    },
    /** Called by the API client when a refresh token is rejected. */
    sessionExpired: (state) => {
      signOut(state)
      state.status = 'ready'
    },
    clearAuthError: (state) => {
      state.error = null
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(login.pending, (state) => {
        state.isLoading = true
        state.error = null
      })
      .addCase(login.fulfilled, (state, action) => {
        signIn(state, action.payload)
        state.status = 'ready'
      })
      .addCase(login.rejected, (state, action) => {
        signOut(state)
        state.error = action.payload ?? 'Sign-in failed. Please try again.'
      })
      .addCase(bootstrapSession.pending, (state) => {
        state.status = 'restoring'
      })
      .addCase(bootstrapSession.fulfilled, (state, action) => {
        if (action.payload) signIn(state, action.payload)
        else signOut(state)
        state.status = 'ready'
      })
      .addCase(bootstrapSession.rejected, (state) => {
        signOut(state)
        state.status = 'ready'
      })
      .addCase(logout.fulfilled, (state) => {
        signOut(state)
        state.status = 'ready'
      })
  },
})

export const { sessionRestored, sessionExpired, clearAuthError } =
  authSlice.actions

export default authSlice.reducer
