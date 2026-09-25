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

interface PasswordErrors {
  password: string | null
  confirmPassword: string | null
}

const NO_ERRORS: PasswordErrors = { password: null, confirmPassword: null }

/**
 * Both boxes, checked in one pass.
 *
 * One pass rather than one refusal at a time: someone who left the form empty
 * should be told about both boxes at once, which is precisely what the
 * browser's own validation would not do.
 */
function validatePasswords(
  password: string,
  confirmPassword: string
): PasswordErrors {
  const errors: PasswordErrors = { ...NO_ERRORS }

  if (!password) errors.password = 'Enter a new password.'
  else if (password.length < PASSWORD_MIN_LENGTH)
    errors.password = `Use at least ${PASSWORD_MIN_LENGTH} characters — this one has ${password.length}.`

  if (!confirmPassword)
    errors.confirmPassword = 'Type the new password again to confirm it.'
  else if (password !== confirmPassword)
    errors.confirmPassword = 'Passwords do not match.'

  return errors
}

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
  /** The banner: only ever what the server said — an expired token, a 500. */
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  /** Each box's own complaint, under that box. */
  const [fieldErrors, setFieldErrors] = useState<PasswordErrors>(NO_ERRORS)

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
    const found = validatePasswords(password, confirmPassword)
    setFieldErrors(found)
    if (found.password || found.confirmPassword) {
      setErrorMessage(null)
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
      <form
        onSubmit={handleSubmit}
        // Both boxes are checked below, together. Without this the browser
        // refuses the submit first, one box at a time, in its own bubble.
        noValidate
        style={authStackStyle}
      >
        <PasswordField
          id="password"
          label="New password"
          value={password}
          onChange={(value) => {
            setPassword(value)
            // The confirm box's complaint is about this value too, so a change
            // here retires both rather than leaving a stale "do not match".
            if (fieldErrors.password || fieldErrors.confirmPassword)
              setFieldErrors(NO_ERRORS)
          }}
          error={fieldErrors.password}
          hint={PASSWORD_HINT}
          autoFocus
        />

        <PasswordField
          id="confirmPassword"
          label="Confirm new password"
          value={confirmPassword}
          onChange={(value) => {
            setConfirmPassword(value)
            if (fieldErrors.confirmPassword)
              setFieldErrors({ ...fieldErrors, confirmPassword: null })
          }}
          error={fieldErrors.confirmPassword}
          hint="Both boxes must match."
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
