// src/app/portal/admin/page.tsx
'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function AdminPortalRedirect() {
  const router = useRouter()

  useEffect(() => {
    router.replace('/admin/dashboard')
  }, [router])

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#FAF6F8',
        color: '#2B253E',
        fontWeight: 700,
        fontSize: '1rem',
      }}
    >
      Opening the admin dashboard...
    </div>
  )
}
