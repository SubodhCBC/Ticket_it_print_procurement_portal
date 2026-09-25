'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/hooks/useAuth'
import { ROLE_DETAILS } from '../types/auth'
import LoginPage from './login/page'

export default function RootHomePage() {
  const router = useRouter()
  const { role, isAuthenticated, status } = useAuth()

  // `status` rather than `isLoading`: the stored session has to be restored
  // and revalidated before "not signed in" means anything.
  const isResolving = status !== 'ready'

  useEffect(() => {
    if (!isResolving && isAuthenticated && role && ROLE_DETAILS[role]) {
      router.replace(ROLE_DETAILS[role].defaultRedirect)
    }
  }, [isAuthenticated, role, isResolving, router])

  if (isResolving) {
    return (
      <div
        style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: '#edf3f8',
          color: '#6E6781',
          fontWeight: 600,
        }}
      >
        Initializing Print Procurement Portal...
      </div>
    )
  }

  if (isAuthenticated && role && ROLE_DETAILS[role]) {
    return (
      <div
        style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: '#edf3f8',
          color: '#6E6781',
          fontWeight: 600,
        }}
      >
        Entering {ROLE_DETAILS[role].title} Portal...
      </div>
    )
  }

  return <LoginPage />
}
