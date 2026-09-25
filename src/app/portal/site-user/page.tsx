'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function LegacySiteUserPortalRedirect() {
  const router = useRouter()

  useEffect(() => {
    router.replace('/shop/catalogue')
  }, [router])

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
      Redirecting to Site User Portal...
    </div>
  )
}
