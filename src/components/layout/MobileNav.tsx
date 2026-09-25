'use client'

import React from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Store, Building2, Shield, KeyRound } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'

export const MobileNav: React.FC = () => {
  const pathname = usePathname()
  const { isAuthenticated } = useAuth()

  const items = [
    { label: 'Site Hub', href: '/shop/catalogue', icon: Store },
    { label: 'Head Office', href: '/head-office', icon: Building2 },
    { label: 'Admin DAM', href: '/admin', icon: Shield },
    {
      label: isAuthenticated ? 'Switch Role' : 'Login',
      href: '/login',
      icon: KeyRound,
    },
  ]

  return (
    <nav
      style={{
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        zIndex: 890,
        height: 'var(--mobile-nav-height)',
        background: 'rgba(255, 255, 255, 0.95)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        borderTop: '1px solid rgba(43, 37, 62, 0.1)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-around',
        padding: '0 0.5rem',
        boxShadow: '0 -4px 20px rgba(43, 37, 62, 0.08)',
      }}
      className="mobile-nav-bar"
    >
      {items.map((item) => {
        const Icon = item.icon
        const isActive =
          pathname === item.href ||
          (item.href !== '/login' && pathname.startsWith(item.href))
        return (
          <Link
            key={item.label}
            href={item.href}
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '0.2rem',
              color: isActive
                ? 'var(--color-primary)'
                : 'var(--color-text-sub)',
              fontSize: '0.7rem',
              fontWeight: 700,
              padding: '0.4rem 0.6rem',
            }}
          >
            <Icon
              size={19}
              color={
                isActive ? 'var(--color-primary)' : 'var(--color-text-sub)'
              }
            />
            <span>{item.label}</span>
          </Link>
        )
      })}

      <style jsx>{`
        @media (min-width: 769px) {
          .mobile-nav-bar {
            display: none !important;
          }
        }
      `}</style>
    </nav>
  )
}
