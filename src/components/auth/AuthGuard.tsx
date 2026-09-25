'use client'

import React from 'react'
import Link from 'next/link'
import { useRouter, usePathname } from 'next/navigation'
import { motion } from 'framer-motion'
import { ShieldAlert, ArrowRight, ArrowLeft, LogOut } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { ROLE_DETAILS, type Permission, type UserRole } from '@/types/auth'
import { Container } from '../layout/Container'
import { Button } from '../ui/Button'

import { useIsClient } from '@/hooks/useIsClient'

interface AuthGuardProps {
  children: React.ReactNode
  allowedRoles?: UserRole[]
  requiredPermission?: Permission
  fallback?: React.ReactNode
}

/**
 * Route protection driven by the real session.
 *
 * Two rules, kept apart deliberately:
 *   - not signed in          -> redirect to /login, carrying the path back
 *   - signed in, wrong role  -> an explanatory screen, not a redirect
 *
 * The second is not a redirect because bouncing a user straight to their own
 * portal makes a mistyped link look like a broken one; they are told what
 * happened and offered the portal they do have.
 *
 * Client-side only, and honest about that: it hides screens, it does not
 * protect data. Every API route re-checks the bearer token and the caller's
 * permissions server-side.
 */
export const AuthGuard: React.FC<AuthGuardProps> = ({
  children,
  allowedRoles,
  requiredPermission,
  fallback,
}) => {
  const { user, role, isAuthenticated, status, logout } = useAuth()
  const router = useRouter()
  const pathname = usePathname()

  /**
   * The server renders this with no session, because there is none to read
   * there. Branching on the restored session before the first client render
   * has matched that HTML is a hydration mismatch — and the session can be
   * back by then, since restoring it from storage takes no round trip. So the
   * guard shows the same "resolving" tree the server did until it is mounted.
   */
  const isMounted = useIsClient()

  // Nothing is known until the stored session has been restored and checked.
  const isResolving = !isMounted || status !== 'ready'

  React.useEffect(() => {
    if (isResolving || isAuthenticated) return
    router.replace(`/login?redirect=${encodeURIComponent(pathname ?? '/')}`)
  }, [isResolving, isAuthenticated, pathname, router])

  if (isResolving || !isAuthenticated || !user) {
    if (!isResolving && fallback) return <>{fallback}</>

    return (
      <div
        style={{
          minHeight: '60vh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '1rem',
        }}
      >
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ repeat: Infinity, duration: 1, ease: 'linear' }}
          style={{
            width: '44px',
            height: '44px',
            borderRadius: '50%',
            border: '3px solid rgba(247, 53, 130, 0.2)',
            borderTopColor: 'var(--color-primary)',
          }}
        />
        <p
          style={{
            fontSize: 'var(--font-size-sm)',
            color: 'var(--color-text-sub)',
            fontWeight: 600,
          }}
        >
          {isResolving
            ? 'Verifying your session...'
            : 'Redirecting to sign in...'}
        </p>
      </div>
    )
  }

  const hasRoleAccess =
    !allowedRoles ||
    allowedRoles.length === 0 ||
    (role !== null && allowedRoles.includes(role))
  const hasPermAccess =
    !requiredPermission || user.permissions.includes(requiredPermission)

  if (!hasRoleAccess || !hasPermAccess) {
    if (fallback) return <>{fallback}</>

    const currentRoleDetails = role ? ROLE_DETAILS[role] : null

    return (
      <Container style={{ padding: '3.5rem 1.5rem', maxWidth: '600px' }}>
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2 }}
          style={{
            background: '#FFFFFF',
            borderRadius: '14px',
            boxShadow:
              '0 1px 2px rgba(43, 37, 62, 0.04), 0 6px 16px rgba(43, 37, 62, 0.05)',
            padding: '1.75rem',
            border: '1px solid #F0E6EC',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: '0.75rem',
              marginBottom: '1rem',
            }}
          >
            <ShieldAlert
              size={20}
              color="#F73582"
              style={{ flexShrink: 0, marginTop: '2px' }}
            />
            <div>
              <h2
                style={{
                  fontSize: '1.1rem',
                  fontWeight: 700,
                  color: '#2B253E',
                  margin: 0,
                }}
              >
                Elevated Privileges Required
              </h2>
              <div
                style={{
                  fontSize: '0.76rem',
                  fontWeight: 500,
                  color: '#A39BB3',
                  marginTop: '2px',
                }}
              >
                Access guard · role boundary protected
              </div>
            </div>
          </div>

          <p
            style={{
              color: '#6E6781',
              fontSize: '0.88rem',
              lineHeight: 1.6,
              marginBottom: '1.25rem',
            }}
          >
            You are signed in as{' '}
            <strong style={{ color: 'var(--color-secondary)' }}>
              {user.name}
            </strong>{' '}
            ({currentRoleDetails?.title ?? user.role}) at {user.accountName}.
            That role does not have clearance for this area.
          </p>

          <div
            style={{
              background: '#FCF7FA',
              borderRadius: '10px',
              padding: '0.9rem 1rem',
              marginBottom: '1.25rem',
              display: 'flex',
              flexDirection: 'column',
              gap: '0.65rem',
              border: '1px solid #F5EEF2',
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: '0.75rem',
              }}
            >
              <span
                style={{
                  fontSize: '0.76rem',
                  color: '#A39BB3',
                  fontWeight: 500,
                }}
              >
                Your role
              </span>
              <span
                style={{
                  background: '#FFFFFF',
                  padding: '2px 8px',
                  borderRadius: '9999px',
                  fontSize: '0.74rem',
                  fontWeight: 600,
                  color: '#2B253E',
                  border: '1px solid #F0E6EC',
                }}
              >
                {currentRoleDetails?.title ?? user.role}
              </span>
            </div>

            {allowedRoles && allowedRoles.length > 0 && (
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  gap: '0.75rem',
                }}
              >
                <span
                  style={{
                    fontSize: '0.76rem',
                    color: '#A39BB3',
                    fontWeight: 500,
                  }}
                >
                  Permitted roles
                </span>
                <div
                  style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}
                >
                  {allowedRoles.map((r) => (
                    <span
                      key={r}
                      style={{
                        background: '#F5EEF2',
                        color: '#5C566E',
                        padding: '2px 8px',
                        borderRadius: '9999px',
                        fontSize: '0.74rem',
                        fontWeight: 600,
                      }}
                    >
                      {ROLE_DETAILS[r].title}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {requiredPermission && (
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  borderTop: '1px solid rgba(43,37,62,0.08)',
                  paddingTop: '0.5rem',
                }}
              >
                <span
                  style={{
                    fontSize: '0.76rem',
                    color: '#A39BB3',
                    fontWeight: 500,
                  }}
                >
                  Required permission
                </span>
                <code
                  style={{
                    background: '#F5EEF2',
                    padding: '0.15rem 0.45rem',
                    borderRadius: '4px',
                    fontSize: '0.74rem',
                    fontWeight: 600,
                    color: '#2B253E',
                  }}
                >
                  {requiredPermission}
                </code>
              </div>
            )}
          </div>

          <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
            <Button
              variant="outline"
              size="md"
              style={{ flex: 1 }}
              onClick={() => router.back()}
              leftIcon={<ArrowLeft size={16} />}
            >
              Go Back
            </Button>
            <Link
              href={currentRoleDetails?.defaultRedirect ?? '/login'}
              style={{ flex: 1 }}
            >
              <Button
                variant="secondary"
                size="md"
                fullWidth
                rightIcon={<ArrowRight size={16} />}
              >
                Go to My Portal
              </Button>
            </Link>
            <Button
              variant="outline"
              size="md"
              style={{ flex: 1 }}
              onClick={() => void logout()}
              leftIcon={<LogOut size={16} />}
            >
              Sign Out
            </Button>
          </div>
        </motion.div>
      </Container>
    )
  }

  return <>{children}</>
}
