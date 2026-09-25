'use client'

import React, { useState } from 'react'
import { MailCheck, Send } from 'lucide-react'
import { AuthService, toApiError } from '@/services'
import {
  AuthAlert,
  AuthFooterLink,
  AuthSubmitButton,
  PublicAuthShell,
} from '@/components/auth/PublicAuthShell'
import {
  authBodyTextStyle,
  authStackStyle,
} from '@/components/auth/publicAuthShell.styles'
import { TextField } from '@/components/ui/FormField'

/**
 * Asks for a password reset link.
 *
 * The endpoint always answers 204, whether or not the identifier matches an
 * account, so that nobody can use this form to test whether a given person has
 * one. The screen has to hold that line: one confirmation, worded so it is true
 * either way, and no hint in the copy about which case happened.
 *
 * The field takes a login *or* an email because `RequestPasswordResetSchema`
 * does — a user who only ever knew their email address should not be stopped
 * here — even though `/auth/login` itself insists on the username.
 */
export default function ForgotPasswordPage() {
  const [identifier, setIdentifier] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isSent, setIsSent] = useState(false)
  /** The banner: only ever what the server said. */
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  /** The field's own complaint, under the field, in red. */
  const [identifierError, setIdentifierError] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    const trimmed = identifier.trim()
    if (!trimmed) {
      // Under the box rather than in the banner: there is one box, and the
      // user's eye should land on it and not on a strip of text above a button.
      setIdentifierError('Enter your username or email address.')
      setErrorMessage(null)
      return
    }
    setIdentifierError(null)

    setIsSubmitting(true)
    setErrorMessage(null)

    try {
      await AuthService.requestPasswordReset(trimmed)
      setIsSent(true)
    } catch (error) {
      // Only a transport or rate-limit failure reaches here — an unknown
      // account is a success as far as this endpoint is concerned.
      setErrorMessage(toApiError(error).message)
    } finally {
      setIsSubmitting(false)
    }
  }

  if (isSent) {
    return (
      <PublicAuthShell title="Check your email">
        <div style={authStackStyle}>
          <div
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: '10px',
              padding: '12px',
              borderRadius: '10px',
              background: '#FCF7FA',
              border: '1px solid #F0E6EC',
            }}
          >
            <MailCheck
              size={16}
              color="#f73582"
              style={{ flexShrink: 0, marginTop: '2px' }}
            />
            <p style={authBodyTextStyle}>
              If that account exists, we&apos;ve sent a reset link to the email
              address on it.
            </p>
          </div>

          <p style={authBodyTextStyle}>
            The link expires — the email says exactly when — so use it soon. If
            nothing arrives in a few minutes, check your spam or junk folder
            before trying again.
          </p>

          <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
            <AuthFooterLink href="/login">Back to sign in</AuthFooterLink>
            <button
              type="button"
              onClick={() => {
                setIsSent(false)
                setErrorMessage(null)
                setIdentifierError(null)
              }}
              style={{
                background: 'none',
                border: 'none',
                padding: 0,
                color: '#6E6781',
                fontSize: '0.8rem',
                fontWeight: 600,
                textDecoration: 'underline',
                cursor: 'pointer',
              }}
            >
              Use a different username
            </button>
          </div>
        </div>
      </PublicAuthShell>
    )
  }

  return (
    <PublicAuthShell
      title="Reset your password"
      description="Tell us who you are and we'll email you a link to set a new password."
    >
      <form
        onSubmit={handleSubmit}
        // The form checks itself; without this the browser gets there first
        // with its own bubble.
        noValidate
        style={authStackStyle}
      >
        {/* `type="text"`, not `type="email"`: an email is only one of the two
            things accepted here, and the email type would have the browser
            reject a perfectly good username. */}
        <TextField
          id="identifier"
          name="identifier"
          label="Username or email address"
          type="text"
          autoComplete="username"
          autoFocus
          value={identifier}
          onChange={(e) => {
            setIdentifier(e.target.value)
            if (identifierError) setIdentifierError(null)
          }}
          error={identifierError}
          hint="Either will do. We never say whether an account was found."
          maxLength={254}
          style={{ boxSizing: 'border-box' }}
        />

        <AuthAlert message={errorMessage} />

        <AuthSubmitButton
          isPending={isSubmitting}
          label="Send reset link"
          pendingLabel="Sending reset link..."
          icon={<Send size={14} />}
        />
      </form>

      <div style={{ marginTop: '16px' }}>
        <AuthFooterLink href="/login">Back to sign in</AuthFooterLink>
      </div>
    </PublicAuthShell>
  )
}
