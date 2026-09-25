'use client'

import React, { Suspense, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { CheckCircle2, KeyRound } from 'lucide-react'
import { AuthService, toApiError } from '@/services'
import {
  AuthAlert,
  AuthFooterLink,
  AuthSubmitButton,
  AuthSuspenseFallback,
  PasswordField,
  PublicAuthShell,
} from '@/components/auth/PublicAuthShell'
import {
  PASSWORD_HINT,
  PASSWORD_MIN_LENGTH,
  authBodyTextStyle,
  authStackStyle,
} from '@/components/auth/publicAuthShell.styles'

/** How long the confirmation sits before it takes the user to sign in. */
const REDIRECT_DELAY_MS = 5000

/**
 * Where a password-reset email lands.
 *
 * `mail.renderer.ts` sends `${base}/password/reset?token=…`. Unlike accepting
 * an invitation, this does *not* end in a session: the endpoint revokes every
 * refresh token, because a password is usually reset precisely when the old one
 * may be in someone else's hands. So the screen says so plainly and sends the
 * user to sign in rather than pretending they are still logged in somewhere.
 */
function ResetPasswordForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const token = searchParams.get('token')

  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isDone, setIsDone] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  // A courtesy, not the only way out: the link below works immediately, and
  // the timer is cleared if the user takes it first.
  useEffect(() => {
    if (!isDone) return
    const timer = setTimeout(() => router.replace('/login'), REDIRECT_DELAY_MS)
    return () => clearTimeout(timer)
  }, [isDone, router])

  if (!token) {
    return (
      <PublicAuthShell title="This reset link is incomplete">
        <div style={authStackStyle}>
          <p style={authBodyTextStyle}>
            The link is missing its reset token, so we cannot tell which account
            it belongs to. Some email clients shorten long links — copying the
            whole address from the email and pasting it into the address bar
            usually fixes it.
          </p>
          <p style={authBodyTextStyle}>
            Reset links also expire, so if this one has been sitting in your
            inbox for a while, ask for a fresh one.
          </p>
          <AuthFooterLink href="/password/forgot">
            Request a new reset link
          </AuthFooterLink>
          <AuthFooterLink href="/login">Back to sign in</AuthFooterLink>
        </div>
      </PublicAuthShell>
    )
  }

  if (isDone) {
    return (
      <PublicAuthShell title="Password updated">
        <div style={authStackStyle}>
          <div
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: '10px',
              padding: '12px',
              borderRadius: '10px',
              background: '#F0FDF4',
              border: '1px solid #DCFCE7',
            }}
          >
            <CheckCircle2
              size={16}
              color="#16A34A"
              style={{ flexShrink: 0, marginTop: '2px' }}
            />
            <p style={authBodyTextStyle}>
              Your new password is set. Every device has been signed out, so
              sign in again with the new password.
            </p>
          </div>

          <p style={authBodyTextStyle}>
            Taking you to the sign-in page in a few seconds.
          </p>

          <AuthFooterLink href="/login">Go to sign in</AuthFooterLink>
        </div>
      </PublicAuthShell>
    )
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    // Caught here rather than at the endpoint, which is rate-limited: a typo in
    // the confirm box should not cost the user one of their few attempts.
    if (password.length < PASSWORD_MIN_LENGTH) {
      setErrorMessage('Your password must be at least 12 characters.')
      return
    }
    if (password !== confirmPassword) {
      setErrorMessage('The two passwords do not match.')
      return
    }

    setIsSubmitting(true)
    setErrorMessage(null)

    try {
      await AuthService.resetPassword({ token, password })
      setIsDone(true)
    } catch (error) {
      setErrorMessage(toApiError(error).message)
      setIsSubmitting(false)
    }
  }

  return (
    <PublicAuthShell
      title="Set a new password"
      description="Choose a new password for your Print Procurement Portal account."
    >
      <form onSubmit={handleSubmit} style={authStackStyle}>
        <PasswordField
          id="password"
          label="New password"
          value={password}
          onChange={setPassword}
          placeholder="At least 12 characters"
          hint={PASSWORD_HINT}
          autoFocus
        />

        <PasswordField
          id="confirmPassword"
          label="Confirm new password"
          value={confirmPassword}
          onChange={setConfirmPassword}
          placeholder="Repeat your password"
        />

        <AuthAlert message={errorMessage} />

        <AuthSubmitButton
          isPending={isSubmitting}
          label="Set new password"
          pendingLabel="Setting your password..."
          icon={<KeyRound size={14} />}
        />
      </form>

      <div style={{ marginTop: '16px' }}>
        <AuthFooterLink href="/password/forgot">
          Need a new reset link?
        </AuthFooterLink>
      </div>
    </PublicAuthShell>
  )
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<AuthSuspenseFallback />}>
      <ResetPasswordForm />
    </Suspense>
  )
}
