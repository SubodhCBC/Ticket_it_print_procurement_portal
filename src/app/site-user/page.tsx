// src/app/site-user/page.tsx
'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function SiteUserRedirectPage() {
  const router = useRouter()

  useEffect(() => {
    router.replace('/shop/catalogue')
  }, [router])

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '60vh',
      }}
    >
      <div
        style={{
          width: '32px',
          height: '32px',
          borderRadius: '50%',
          border: '3px solid #fbcfe8',
          borderTopColor: '#f73582',
          animation: 'spin 1s linear infinite',
        }}
      />
    </div>
  )
}
