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
  authHintStyle,
  authInputStyle,
  authLabelStyle,
  authStackStyle,
} from '@/components/auth/publicAuthShell.styles'

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
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    const trimmed = identifier.trim()
    if (!trimmed) {
      setErrorMessage('Enter your username or email address.')
      return
    }

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
      <form onSubmit={handleSubmit} style={authStackStyle}>
        <div>
          <label htmlFor="identifier" style={authLabelStyle}>
            Username or email address
          </label>
          <input
            id="identifier"
            name="identifier"
            type="text"
            autoComplete="username"
            autoFocus
            value={identifier}
            onChange={(e) => setIdentifier(e.target.value)}
            placeholder="your.username or you@example.com"
            required
            maxLength={254}
            style={authInputStyle}
          />
          <p style={authHintStyle}>
            Either will do. We never say whether an account was found.
          </p>
        </div>

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
