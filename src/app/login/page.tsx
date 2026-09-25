'use client'

import React, { useEffect, useState, Suspense } from 'react'
import { useIsClient } from '@/hooks/useIsClient'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Lock,
  Eye,
  EyeOff,
  ShieldCheck,
  AlertCircle,
  User as UserIcon,
} from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { ROLE_DETAILS, toUserRole } from '../../types/auth'
import { PortalLogo } from '../../components/ui/PortalLogo'
import { TextField } from '../../components/ui/FormField'

/**
 * The single sign-in surface.
 *
 * There is no portal picker any more: the portal a user lands in is decided by
 * the role the API returns, not by a card they click. Choosing it in the UI
 * was only ever meaningful while the roles were demo fixtures — with real
 * credentials, a site user selecting "Admin" would either be lied to or
 * bounced straight back out by the guard.
 *
 * The field is a username, not an email. `Users.Email` is not unique in the
 * legacy Ticket-IT database (159 groups of users share one), so the API
 * authenticates on `Users.Login`.
 */
function LoginForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const redirectUrl = searchParams.get('redirect')

  const { login, logout, isAuthenticated, user, status } = useAuth()

  const [loginId, setLoginId] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  /** Per-field, under the field. The banner is for what the server says. */
  const [fieldErrors, setFieldErrors] = useState<{
    login: string | null
    password: string | null
  }>({ login: null, password: null })

  /**
   * The server has no session to read, so it always renders the signed-out
   * form. Anything below that depends on the restored session has to wait for
   * the first client render to match that HTML, or React reports a hydration
   * mismatch — restoring from storage needs no round trip, so the session is
   * routinely back before this boundary hydrates.
   */
  const isMounted = useIsClient()

  // Someone who is already signed in has no business on this screen — send
  // them wherever they were headed, or to their own portal.
  useEffect(() => {
    if (status !== 'ready' || !isAuthenticated || !user) return
    router.replace(
      redirectUrl || ROLE_DETAILS[toUserRole(user.role)].defaultRedirect
    )
  }, [status, isAuthenticated, user, redirectUrl, router])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    const trimmed = loginId.trim()
    // Both fields are checked in one pass, so someone with an empty form is
    // told about both at once rather than discovering them one refusal at a
    // time, which is what the browser's own validation did.
    const nextErrors = {
      login: trimmed ? null : 'Enter your username.',
      password: password ? null : 'Enter your password.',
    }
    setFieldErrors(nextErrors)
    if (nextErrors.login || nextErrors.password) {
      setErrorMessage(null)
      return
    }

    setIsSubmitting(true)
    setErrorMessage(null)

    const result = await login({ login: trimmed, password })

    if (!result.success) {
      setErrorMessage(result.error)
      setIsSubmitting(false)
      return
    }

    const destination =
      redirectUrl || ROLE_DETAILS[toUserRole(result.user.role)].defaultRedirect
    router.replace(destination)
  }

  const accent = '#f73582'

  return (
    <div
      style={{
        minHeight: '100vh',
        width: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '40px 16px',
        backgroundColor: '#FCF7FA',
        fontFamily:
          '"Acumin Pro", "Acumin", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      }}
    >
      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2 }}
        style={{
          width: '100%',
          maxWidth: '400px',
          background: '#FFFFFF',
          borderRadius: '14px',
          boxShadow:
            '0 1px 2px rgba(43, 37, 62, 0.04), 0 6px 16px rgba(43, 37, 62, 0.05)',
          border: '1px solid #F0E6EC',
          padding: '32px 28px',
          position: 'relative',
        }}
      >
        <div style={{ marginBottom: '24px' }}>
          <PortalLogo size="sm" showTagline={true} />
        </div>

        <div style={{ marginBottom: '20px' }}>
          <h1
            style={{
              fontSize: '1.25rem',
              fontWeight: 700,
              color: '#2B253E',
              letterSpacing: '-0.01em',
              margin: 0,
              lineHeight: 1.2,
            }}
          >
            Sign In
          </h1>
          <p
            style={{
              fontSize: '0.8rem',
              color: '#6E6781',
              lineHeight: 1.5,
              margin: '4px 0 0',
            }}
          >
            Use your Ticket-IT username and password. Your portal is chosen for
            you from the role on your account.
          </p>
        </div>

        <form
          onSubmit={handleSubmit}
          // The form validates itself, field by field. Without this the browser
          // gets there first with its own bubble and stops at one field.
          noValidate
          style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}
        >
          <TextField
            id="login"
            name="login"
            label="Username"
            type="text"
            autoComplete="username"
            autoFocus
            value={loginId}
            onChange={(e) => {
              setLoginId(e.target.value)
              if (fieldErrors.login) {
                setFieldErrors({ ...fieldErrors, login: null })
              }
            }}
            error={fieldErrors.login}
            hint="Not your email address — email is not unique across Ticket-IT accounts."
            leftIcon={<UserIcon size={16} />}
          />

          <TextField
            id="password"
            name="password"
            label="Password"
            type={showPassword ? 'text' : 'password'}
            autoComplete="current-password"
            value={password}
            onChange={(e) => {
              setPassword(e.target.value)
              if (fieldErrors.password) {
                setFieldErrors({ ...fieldErrors, password: null })
              }
            }}
            error={fieldErrors.password}
            labelAside={
              <Link
                href="/password/forgot"
                style={{
                  fontSize: '0.74rem',
                  fontWeight: 600,
                  color: accent,
                  textDecoration: 'none',
                }}
              >
                Forgot password?
              </Link>
            }
            rightSlot={
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                style={{
                  color: '#A39BB3',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  padding: '4px',
                  display: 'flex',
                  alignItems: 'center',
                }}
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            }
          />

          <AnimatePresence>
            {errorMessage && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.18 }}
                role="alert"
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '8px',
                  padding: '10px 12px',
                  borderRadius: '10px',
                  background: '#FEF2F2',
                  color: '#DC2626',
                  fontSize: '0.8rem',
                  fontWeight: 500,
                }}
              >
                <AlertCircle
                  size={16}
                  style={{ flexShrink: 0, marginTop: '1px' }}
                />
                <span>{errorMessage}</span>
              </motion.div>
            )}
          </AnimatePresence>

          <motion.button
            type="submit"
            disabled={isSubmitting}
            style={{
              width: '100%',
              padding: '8px 14px',
              borderRadius: '10px',
              background: accent,
              color: '#FFFFFF',
              fontSize: '0.82rem',
              fontWeight: 600,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              cursor: isSubmitting ? 'not-allowed' : 'pointer',
              opacity: isSubmitting ? 0.5 : 1,
              border: 'none',
              transition: 'opacity 0.15s ease',
              marginTop: '4px',
            }}
          >
            {isSubmitting ? (
              <>
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{
                    repeat: Infinity,
                    duration: 0.8,
                    ease: 'linear',
                  }}
                  style={{
                    width: '14px',
                    height: '14px',
                    borderRadius: '50%',
                    border: '2px solid rgba(255,255,255,0.4)',
                    borderTopColor: '#ffffff',
                  }}
                />
                <span>Signing in...</span>
              </>
            ) : (
              <>
                <Lock size={14} />
                <span>Sign In</span>
              </>
            )}
          </motion.button>
        </form>

        {/* An expired session leaves the stored copy behind; this clears it. */}
        {isMounted && isAuthenticated && (
          <button
            type="button"
            onClick={() => void logout()}
            style={{
              marginTop: '16px',
              background: 'none',
              border: 'none',
              color: '#6E6781',
              fontSize: '0.8rem',
              fontWeight: 600,
              textDecoration: 'underline',
              cursor: 'pointer',
              padding: 0,
            }}
          >
            Sign out of the current session
          </button>
        )}

        <div
          style={{
            marginTop: '24px',
            paddingTop: '16px',
            borderTop: '1px solid #F5EEF2',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '12px',
          }}
        >
          <div style={{ fontSize: '0.74rem', color: '#A39BB3' }}>
            © 2026 Print Procurement Portal. All rights reserved.
          </div>

          {/* A line of meta beside the copyright rather than a green pill: as a
              pill it was the most colourful thing on a screen whose job is two
              fields and a button. */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              color: '#A39BB3',
              fontSize: '0.74rem',
              fontWeight: 500,
            }}
          >
            <ShieldCheck size={14} color="#A39BB3" />
            <span>SOC 2 Type II Certified</span>
          </div>
        </div>
      </motion.div>
    </div>
  )
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div
          style={{
            minHeight: '100vh',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: '#FCF7FA',
            color: '#A39BB3',
            fontSize: '0.84rem',
            fontWeight: 500,
          }}
        >
          Loading Print Procurement Portal...
        </div>
      }
    >
      <LoginForm />
    </Suspense>
  )
}
