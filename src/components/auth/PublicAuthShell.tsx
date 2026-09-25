'use client'

import React from 'react'
import Link from 'next/link'
import { motion, AnimatePresence } from 'framer-motion'
import { AlertCircle, Eye, EyeOff, ShieldCheck } from 'lucide-react'
import { PortalLogo } from '../ui/PortalLogo'
import { TextField } from '../ui/FormField'
import {
  AUTH_ACCENT,
  FONT_STACK,
  authLinkStyle,
  authBodyTextStyle,
} from './publicAuthShell.styles'

/**
 * The card the signed-out screens share.
 *
 * `/login`, `/invitations/accept`, `/password/forgot` and `/password/reset` sit
 * outside every portal layout — a user arriving from an email has no session
 * and no shell around them — so each one has to draw its own page. They drew
 * the same page, and four inlined copies of one card is how three of them end
 * up looking subtly unlike the fourth after the next visual change.
 *
 * Inline styles, matching the sign-in screen rather than introducing a second
 * styling convention on the way past.
 */

interface PublicAuthShellProps {
  /** The `<h1>`. One per page — these screens are a single task each. */
  title: string
  /** The line under it. Omitted when the body says it better. */
  description?: React.ReactNode
  children: React.ReactNode
}

export function PublicAuthShell({
  title,
  description,
  children,
}: PublicAuthShellProps) {
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
        fontFamily: FONT_STACK,
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
            {title}
          </h1>
          {description && (
            <p style={{ ...authBodyTextStyle, margin: '4px 0 0' }}>
              {description}
            </p>
          )}
        </div>

        {children}

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

/**
 * The banner above the submit button, for what the *server* said: a wrong or
 * expired token, a rate limit, a network failure. Anything a field can be
 * blamed for belongs under that field instead — see `PasswordField`'s `error`
 * — so that the user's eye lands on the box they have to fix.
 *
 * `role="alert"` so a screen reader hears a rejected submit — nothing else on
 * the page moves focus to announce it.
 */
export function AuthAlert({ message }: { message: string | null }) {
  return (
    <AnimatePresence>
      {message && (
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
          <AlertCircle size={16} style={{ flexShrink: 0, marginTop: '1px' }} />
          <span>{message}</span>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

interface AuthSubmitButtonProps {
  /** Disables the button and swaps in the spinner. */
  isPending: boolean
  label: string
  pendingLabel: string
  icon: React.ReactNode
}

export function AuthSubmitButton({
  isPending,
  label,
  pendingLabel,
  icon,
}: AuthSubmitButtonProps) {
  return (
    <motion.button
      type="submit"
      disabled={isPending}
      style={{
        width: '100%',
        padding: '8px 14px',
        borderRadius: '10px',
        background: AUTH_ACCENT,
        color: '#FFFFFF',
        fontSize: '0.82rem',
        fontWeight: 600,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '8px',
        cursor: isPending ? 'not-allowed' : 'pointer',
        opacity: isPending ? 0.5 : 1,
        border: 'none',
        transition: 'opacity 0.15s ease',
        marginTop: '4px',
      }}
    >
      {isPending ? (
        <>
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ repeat: Infinity, duration: 0.8, ease: 'linear' }}
            style={{
              width: '14px',
              height: '14px',
              borderRadius: '50%',
              border: '2px solid rgba(255,255,255,0.4)',
              borderTopColor: '#ffffff',
            }}
          />
          <span>{pendingLabel}</span>
        </>
      ) : (
        <>
          {icon}
          <span>{label}</span>
        </>
      )}
    </motion.button>
  )
}

interface PasswordFieldProps {
  id: string
  label: string
  value: string
  onChange: (value: string) => void
  /**
   * The message under the field, and the red border that goes with it. Set on
   * a rejected submit, cleared by the caller as soon as the value changes.
   */
  error?: string | null
  /** The rule, said quietly before submit. Replaced by `error` after one. */
  hint?: React.ReactNode
  autoFocus?: boolean
}

/**
 * A password input with its own show/hide toggle.
 *
 * Built on `TextField`, so a wrong password box looks and reads exactly like a
 * wrong box anywhere else in the portal: red border, the message underneath,
 * `aria-invalid` and `aria-describedby` carrying the same to a screen reader.
 *
 * No `required` and no `minLength` — those hand the field back to the browser,
 * which answers with a grey "Please fill out this field" bubble, stops at the
 * first offending box and says nothing about the 12-character rule until after
 * it has already refused the submit. The forms here set `noValidate` and check
 * every field themselves, in one pass.
 *
 * No placeholder either: the label already says which box this is, and the
 * rule lives in `hint`.
 *
 * `autoComplete="new-password"` on both the new and the confirm field: these
 * screens only ever set a password, never verify an existing one, and the
 * wrong hint here makes a password manager offer the credential being replaced.
 */
export function PasswordField({
  id,
  label,
  value,
  onChange,
  error,
  hint,
  autoFocus,
}: PasswordFieldProps) {
  const [isVisible, setIsVisible] = React.useState(false)

  return (
    <TextField
      id={id}
      name={id}
      label={label}
      type={isVisible ? 'text' : 'password'}
      autoComplete="new-password"
      autoFocus={autoFocus}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      maxLength={256}
      error={error}
      hint={hint}
      // An input is a flex item here; without this its intrinsic width wins
      // over `width: 100%` and the card scrolls sideways on a 400px screen.
      style={{ boxSizing: 'border-box' }}
      rightSlot={
        <button
          type="button"
          onClick={() => setIsVisible(!isVisible)}
          aria-label={isVisible ? `Hide ${label}` : `Show ${label}`}
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
          {isVisible ? <EyeOff size={16} /> : <Eye size={16} />}
        </button>
      }
    />
  )
}

/** The link back to the sign-in screen every one of these pages carries. */
export function AuthFooterLink({
  href,
  children,
}: {
  href: string
  children: React.ReactNode
}) {
  return (
    <Link href={href} style={authLinkStyle}>
      {children}
    </Link>
  )
}

/** What a `<Suspense>` boundary shows while `useSearchParams` resolves. */
export function AuthSuspenseFallback() {
  return (
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
        fontFamily: FONT_STACK,
      }}
    >
      Loading Print Procurement Portal...
    </div>
  )
}
