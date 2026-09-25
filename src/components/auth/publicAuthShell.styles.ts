import type React from 'react'

/**
 * Styles and constants shared by the signed-out screens.
 *
 * Kept apart from `PublicAuthShell.tsx` so that file exports components only,
 * which is what lets Fast Refresh keep a component's state across an edit.
 */

/** Portal brand pink — the only saturated colour on these screens. */
export const AUTH_ACCENT = '#f73582'

export const FONT_STACK =
  '"Acumin Pro", "Acumin", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'

export const authLabelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: '0.78rem',
  fontWeight: 600,
  color: '#5C566E',
  marginBottom: '6px',
}

export const authInputStyle: React.CSSProperties = {
  width: '100%',
  padding: '8px 12px',
  borderRadius: '10px',
  border: '1px solid #F0E6EC',
  background: '#FFFFFF',
  color: '#2B253E',
  fontSize: '0.84rem',
  outline: 'none',
  // Without this an input's intrinsic width wins over `width: 100%` in a flex
  // column and the card scrolls sideways on a 400px screen.
  boxSizing: 'border-box',
}

export const authHintStyle: React.CSSProperties = {
  fontSize: '0.74rem',
  color: '#A39BB3',
  margin: '6px 0 0',
}

export const authBodyTextStyle: React.CSSProperties = {
  fontSize: '0.8rem',
  color: '#6E6781',
  lineHeight: 1.5,
  margin: 0,
}

export const authLinkStyle: React.CSSProperties = {
  color: AUTH_ACCENT,
  fontSize: '0.8rem',
  fontWeight: 600,
  textDecoration: 'none',
}

/** The vertical rhythm every form and message block on these screens uses. */
export const authStackStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '16px',
}

/**
 * The 12-character minimum, worded once.
 *
 * `NewPassword` in the server's validation is length-only — NIST dropped
 * composition rules — so the hint must not invent character classes the API
 * would then happily accept without.
 */
export const PASSWORD_HINT = 'Use at least 12 characters.'
export const PASSWORD_MIN_LENGTH = 12

export interface PasswordErrors {
  password: string | null
  confirmPassword: string | null
}

export const NO_PASSWORD_ERRORS: PasswordErrors = {
  password: null,
  confirmPassword: null,
}

/**
 * Both boxes, checked in one pass.
 *
 * One pass rather than one refusal at a time: someone who left the form empty
 * is told about both boxes at once, which is precisely what the browser's own
 * validation would not do.
 *
 * Lives beside the rule it enforces, and is shared by the two screens that set
 * a password — the reset and the invitation — which had a copy each. Two
 * copies of a rule is two chances to change only one of them.
 */
export function validatePasswords(
  password: string,
  confirmPassword: string,
  /** "Enter a new password." on a reset, "Choose a password." on an invite. */
  emptyPasswordMessage = 'Enter a new password.'
): PasswordErrors {
  const errors: PasswordErrors = { ...NO_PASSWORD_ERRORS }

  if (!password) errors.password = emptyPasswordMessage
  else if (password.length < PASSWORD_MIN_LENGTH)
    errors.password = `Use at least ${PASSWORD_MIN_LENGTH} characters — this one has ${password.length}.`

  if (!confirmPassword)
    errors.confirmPassword = 'Type the new password again to confirm it.'
  else if (password !== confirmPassword)
    errors.confirmPassword = 'Passwords do not match.'

  return errors
}
