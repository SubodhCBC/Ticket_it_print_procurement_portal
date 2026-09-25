'use client'

import React, { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import {
  LogOut,
  ChevronDown,
  Building2,
  Store,
  Shield,
  KeyRound,
} from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { ROLE_DETAILS } from '../../types/auth'
import { Button } from '../ui/Button'

import { PortalLogo } from '../ui/PortalLogo'

export const Navbar: React.FC = () => {
  const pathname = usePathname()
  const router = useRouter()
  const { user, role, isAuthenticated, logout } = useAuth()
  const [isScrolled, setIsScrolled] = useState(false)
  const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 15)
    }
    window.addEventListener('scroll', handleScroll)
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  // Close profile dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setIsProfileMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const navLinks = [
    {
      label: 'Site Ordering Hub',
      href: '/shop/catalogue',
      icon: Store,
      role: 'site_user',
    },
    {
      label: 'Head Office Billing',
      href: '/head-office',
      icon: Building2,
      role: 'head_office',
    },
    { label: 'Admin DAM HQ', href: '/admin', icon: Shield, role: 'admin' },
  ]

  const currentRoleMeta = role ? ROLE_DETAILS[role] : null

  return (
    <header
      style={{
        position: 'sticky',
        top: 0,
        zIndex: 900,
        height: 'var(--navbar-height)',
        background: isScrolled
          ? 'rgba(231, 234, 239, 0.94)'
          : 'rgba(231, 234, 239, 0.82)',
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
        borderBottom: isScrolled
          ? '1px solid rgba(43, 37, 62, 0.12)'
          : '1px solid rgba(255, 255, 255, 0.5)',
        boxShadow: isScrolled ? '0 4px 20px rgba(43, 37, 62, 0.06)' : 'none',
        transition: 'all var(--transition-normal)',
        display: 'flex',
        alignItems: 'center',
      }}
    >
      <div
        className="container"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        {/* Brand Logo */}
        <Link
          href={
            role && ROLE_DETAILS[role]
              ? ROLE_DETAILS[role].defaultRedirect
              : '/login'
          }
          style={{
            display: 'flex',
            alignItems: 'center',
            textDecoration: 'none',
          }}
        >
          <PortalLogo size="sm" showTagline={true} />
        </Link>

        {/* Desktop Nav Links */}
        <nav
          style={{
            display: 'none',
            alignItems: 'center',
            gap: '1.75rem',
          }}
          className="desktop-nav-links"
        >
          {navLinks.map((link) => {
            const isActive = pathname.startsWith(link.href)
            const Icon = link.icon
            return (
              <Link
                key={link.label}
                href={link.href}
                style={{
                  fontSize: 'var(--font-size-sm)',
                  fontWeight: 700,
                  color: isActive
                    ? 'var(--color-primary)'
                    : 'var(--color-text-main)',
                  position: 'relative',
                  padding: '0.35rem 0',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.4rem',
                }}
              >
                <Icon
                  size={16}
                  color={
                    isActive ? 'var(--color-primary)' : 'var(--color-text-sub)'
                  }
                />
                <span>{link.label}</span>
                {isActive && (
                  <motion.div
                    layoutId="activeNav"
                    style={{
                      position: 'absolute',
                      bottom: -4,
                      left: 0,
                      right: 0,
                      height: '2.5px',
                      borderRadius: '2px',
                      background: 'var(--color-primary)',
                    }}
                  />
                )}
              </Link>
            )
          })}
        </nav>

        {/* Action Controls & Auth State */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
          {isAuthenticated && user ? (
            <div style={{ position: 'relative' }} ref={menuRef}>
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => setIsProfileMenuOpen(!isProfileMenuOpen)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.65rem',
                  padding: '0.4rem 0.85rem 0.4rem 0.45rem',
                  borderRadius: 'var(--radius-full)',
                  background: '#ffffff',
                  border: '1.5px solid var(--color-border)',
                  boxShadow: 'var(--shadow-sm)',
                  cursor: 'pointer',
                }}
              >
                {/* User Avatar */}
                <div
                  style={{
                    width: '32px',
                    height: '32px',
                    borderRadius: '50%',
                    overflow: 'hidden',
                    background: currentRoleMeta?.themeColor || '#10b981',
                    color: '#ffffff',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontWeight: 800,
                    fontSize: '0.8rem',
                  }}
                >
                  {user.name.charAt(0)}
                </div>

                {/* Role Pill */}
                <div
                  style={{ textAlign: 'left', display: 'none' }}
                  className="user-profile-label"
                >
                  <div
                    style={{
                      fontWeight: 800,
                      fontSize: '0.8rem',
                      color: 'var(--color-secondary)',
                      lineHeight: 1.1,
                    }}
                  >
                    {user.name}
                  </div>
                  <div
                    style={{
                      fontSize: '0.65rem',
                      color: currentRoleMeta?.themeColor,
                      fontWeight: 700,
                    }}
                  >
                    {currentRoleMeta?.title}
                  </div>
                </div>

                <ChevronDown size={14} color="var(--color-text-muted)" />
              </motion.button>

              {/* Profile Dropdown Menu */}
              <AnimatePresence>
                {isProfileMenuOpen && (
                  <motion.div
                    initial={{ opacity: 0, y: 10, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 10, scale: 0.95 }}
                    transition={{ duration: 0.15 }}
                    style={{
                      position: 'absolute',
                      right: 0,
                      top: 'calc(100% + 8px)',
                      width: '290px',
                      background: '#ffffff',
                      borderRadius: 'var(--radius-lg)',
                      boxShadow: '0 16px 36px rgba(43, 37, 62, 0.18)',
                      border: '1px solid var(--color-border)',
                      padding: '1rem',
                      zIndex: 1000,
                    }}
                  >
                    {/* User Card Header */}
                    <div
                      style={{
                        borderBottom: '1px solid var(--color-border)',
                        paddingBottom: '0.75rem',
                        marginBottom: '0.75rem',
                      }}
                    >
                      <div
                        style={{
                          fontWeight: 800,
                          fontSize: 'var(--font-size-sm)',
                          color: 'var(--color-secondary)',
                        }}
                      >
                        {user.name}
                      </div>
                      <div
                        style={{
                          fontSize: '0.72rem',
                          color: 'var(--color-text-muted)',
                        }}
                      >
                        {user.email}
                      </div>
                      <div
                        style={{
                          display: 'inline-block',
                          marginTop: '0.4rem',
                          padding: '2px 8px',
                          borderRadius: '4px',
                          background: `${currentRoleMeta?.themeColor}15`,
                          color: currentRoleMeta?.themeColor,
                          fontSize: '0.68rem',
                          fontWeight: 800,
                        }}
                      >
                        {currentRoleMeta?.badgeText} • {user.organization}
                      </div>
                    </div>

                    {/* Direct Portal Links */}
                    <div
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '0.35rem',
                        marginBottom: '0.75rem',
                      }}
                    >
                      <Link
                        href="/shop/catalogue"
                        onClick={() => setIsProfileMenuOpen(false)}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.5rem',
                          padding: '0.5rem 0.6rem',
                          borderRadius: '6px',
                          fontSize: 'var(--font-size-xs)',
                          fontWeight: 700,
                          color: 'var(--color-secondary)',
                          background:
                            role === 'site_user'
                              ? 'rgba(88, 185, 125, 0.12)'
                              : 'transparent',
                        }}
                      >
                        <Store size={15} color="#58b97d" />
                        <span>Site User Ordering Hub</span>
                      </Link>

                      <Link
                        href="/head-office"
                        onClick={() => setIsProfileMenuOpen(false)}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.5rem',
                          padding: '0.5rem 0.6rem',
                          borderRadius: '6px',
                          fontSize: 'var(--font-size-xs)',
                          fontWeight: 700,
                          color: 'var(--color-secondary)',
                          background:
                            role === 'head_office'
                              ? 'rgba(124, 92, 219, 0.12)'
                              : 'transparent',
                        }}
                      >
                        <Building2 size={15} color="#7c5cdb" />
                        <span>Head Office Billing Portal</span>
                      </Link>

                      <Link
                        href="/admin"
                        onClick={() => setIsProfileMenuOpen(false)}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.5rem',
                          padding: '0.5rem 0.6rem',
                          borderRadius: '6px',
                          fontSize: 'var(--font-size-xs)',
                          fontWeight: 700,
                          color: 'var(--color-secondary)',
                          background:
                            role === 'admin'
                              ? 'rgba(247, 53, 130, 0.12)'
                              : 'transparent',
                        }}
                      >
                        <Shield size={15} color="#f73582" />
                        <span>Portal Admin DAM HQ</span>
                      </Link>
                    </div>

                    {/* Footer Actions */}
                    <div
                      style={{
                        borderTop: '1px solid var(--color-border)',
                        paddingTop: '0.75rem',
                        display: 'flex',
                        justifyContent: 'flex-end',
                        alignItems: 'center',
                      }}
                    >
                      {/* "Switch Portal" used to sit here, linking to /login
                          without signing out — which left the session intact and
                          the user staring at a sign-in form they did not need.
                          Signing out is the only way across, so that is the only
                          thing offered. */}
                      <button
                        onClick={() => {
                          logout()
                          setIsProfileMenuOpen(false)
                          router.push('/login')
                        }}
                        style={{
                          fontSize: '0.75rem',
                          color: 'var(--color-primary)',
                          fontWeight: 700,
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.25rem',
                          background: 'none',
                          border: 'none',
                          cursor: 'pointer',
                        }}
                      >
                        <LogOut size={13} />
                        <span>Sign Out</span>
                      </button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          ) : (
            <Link href="/login">
              <Button
                variant="primary"
                size="sm"
                leftIcon={<KeyRound size={14} />}
              >
                Portal Login
              </Button>
            </Link>
          )}
        </div>
      </div>

      <style jsx>{`
        @media (min-width: 768px) {
          .desktop-nav-links {
            display: flex !important;
          }
          .user-profile-label {
            display: block !important;
          }
        }
      `}</style>
    </header>
  )
}
