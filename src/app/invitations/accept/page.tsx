'use client'

import React, { Suspense, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { UserCheck } from 'lucide-react'
import { AuthService, toApiError } from '@/services'
import { useAuth } from '@/hooks/useAuth'
import { ROLE_DETAILS, toUserRole } from '@/types/auth'
import {
  AuthAlert,
  AuthFooterLink,
  AuthSubmitButton,
  AuthSuspenseFallback,
  PasswordField,
  PublicAuthShell,
} from '@/components/auth/PublicAuthShell'
import {
  NO_PASSWORD_ERRORS,
  PASSWORD_HINT,
  validatePasswords,
  type PasswordErrors,
  authBodyTextStyle,
  authStackStyle,
} from '@/components/auth/publicAuthShell.styles'

/**
 * Where an invitation email lands.
 *
 * `mail.renderer.ts` sends `${base}/invitations/accept?token=…`, so the token
 * is the whole of the invitee's identity here — they have no account to sign in
 * with yet, which is why the endpoint is public.
 *
 * The API answers a full login response, so a successful accept ends with the
 * user signed in and inside their portal. Bouncing them to `/login` to type the
 * password they chose ten seconds earlier would be the obvious implementation
 * and the wrong one.
 *
 * A wrong token, an expired one and an already-used one come back identical by
 * design; the screen therefore shows whatever the server said and does not try
 * to guess which of the three happened.
 */
function AcceptInvitationForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const token = searchParams.get('token')

  const { adoptSession } = useAuth()

  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  /** The banner: only ever what the server said — a dead token, a 500. */
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  /** Each box's own complaint, under that box. */
  const [fieldErrors, setFieldErrors] =
    useState<PasswordErrors>(NO_PASSWORD_ERRORS)

  // A link that arrived without its token cannot be repaired from here, and a
  // form that is certain to fail is worse than saying so.
  if (!token) {
    return (
      <PublicAuthShell title="This invitation link is incomplete">
        <div style={authStackStyle}>
          <p style={authBodyTextStyle}>
            The link is missing its invitation token, so we cannot tell which
            invitation it belongs to. Some email clients shorten long links —
            copying the whole address from the email and pasting it into the
            address bar usually fixes it.
          </p>
          <p style={authBodyTextStyle}>
            If it still does not work, ask whoever invited you to send a new
            invitation.
          </p>
          <AuthFooterLink href="/login">
            Already have an account? Sign in
          </AuthFooterLink>
        </div>
      </PublicAuthShell>
    )
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    // Checked here so a typo costs nothing: the endpoint is rate-limited, and
    // spending one of those attempts to be told the two boxes differ is a poor
    // trade.
    const found = validatePasswords(
      password,
      confirmPassword,
      'Choose a password.'
    )
    setFieldErrors(found)
    if (found.password || found.confirmPassword) {
      setErrorMessage(null)
      return
    }

    setIsSubmitting(true)
    setErrorMessage(null)

    try {
      const session = await AuthService.acceptInvitation({ token, password })
      // Stores the session and signs the user in in the store, so the guard on
      // the destination lets them straight through.
      adoptSession(session)
      router.replace(
        ROLE_DETAILS[toUserRole(session.user.role)].defaultRedirect
      )
    } catch (error) {
      setErrorMessage(toApiError(error).message)
      setIsSubmitting(false)
    }
  }

  return (
    <PublicAuthShell
      title="Accept your invitation"
      description="Choose a password for your Print Procurement Portal account. We'll sign you in as soon as it's set."
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
              setFieldErrors(NO_PASSWORD_ERRORS)
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
          label="Set password and sign in"
          pendingLabel="Setting your password..."
          icon={<UserCheck size={14} />}
        />
      </form>

      <div style={{ marginTop: '16px' }}>
        <AuthFooterLink href="/login">
          Already have an account? Sign in
        </AuthFooterLink>
      </div>
    </PublicAuthShell>
  )
}

export default function AcceptInvitationPage() {
  return (
    <Suspense fallback={<AuthSuspenseFallback />}>
      <AcceptInvitationForm />
    </Suspense>
  )
}
