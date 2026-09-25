'use client'

import React from 'react'
import { useAppDispatch } from '@/store/hooks'
import { bootstrapSession, sessionExpired } from '@/store/authSlice'
import { setSessionExpiredHandler } from '@/services'

/**
 * Restores the session once, at the top of the tree.
 *
 * Also connects the API client's session-expiry callback to the store, so a
 * refresh token the server rejects mid-session clears the UI instead of
 * leaving a signed-in shell around requests that all 401. The client cannot
 * import the store itself — the store's slices import the client.
 */
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const dispatch = useAppDispatch()

  React.useEffect(() => {
    setSessionExpiredHandler(() => {
      dispatch(sessionExpired())
    })
    void dispatch(bootstrapSession())

    return () => setSessionExpiredHandler(null)
  }, [dispatch])

  return <>{children}</>
}
