// src/components/shop/customise/theme.ts
//
// The storefront's "Blush" palette, for the customiser and its review screens.

import type { CSSProperties } from 'react'

export const T = {
  page: '#FAF6F8',
  card: '#FFFFFF',
  border: '#F0E6EC',
  text: '#2B253E',
  secondary: '#6E6781',
  muted: '#A39BB3',
  accent: '#F73582',
  accentSoft: '#FDE8F1',
  stage: '#F3ECF0',
  errorBg: '#FEF2F2',
  errorText: '#DC2626',
  errorBorder: '#FECACA',
} as const

export const shadow =
  '0 1px 2px rgba(43, 37, 62, 0.04), 0 6px 16px rgba(43, 37, 62, 0.05)'

export const cardStyle: CSSProperties = {
  backgroundColor: T.card,
  border: `1px solid ${T.border}`,
  borderRadius: '14px',
  boxShadow: shadow,
}

export function primaryButton(disabled = false): CSSProperties {
  return {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '8px',
    padding: '10px 18px',
    borderRadius: '10px',
    border: 'none',
    backgroundColor: T.accent,
    color: '#FFFFFF',
    fontSize: '0.84rem',
    fontWeight: 600,
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.55 : 1,
    whiteSpace: 'nowrap',
    boxShadow: disabled ? 'none' : '0 4px 12px rgba(247, 53, 130, 0.25)',
  }
}

export function secondaryButton(disabled = false): CSSProperties {
  return {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '6px',
    padding: '9px 16px',
    borderRadius: '10px',
    border: `1px solid ${T.border}`,
    backgroundColor: T.card,
    color: T.text,
    fontSize: '0.84rem',
    fontWeight: 600,
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.55 : 1,
    whiteSpace: 'nowrap',
  }
}

export const errorBox: CSSProperties = {
  padding: '10px 12px',
  borderRadius: '10px',
  backgroundColor: T.errorBg,
  border: `1px solid ${T.errorBorder}`,
  color: T.errorText,
  fontSize: '0.8rem',
  fontWeight: 500,
  lineHeight: 1.45,
}

/** Keyboard focus rings and the spinner, which inline styles cannot express. */
export const OVERLAY_CLASS = 'ppp-customise'
export const overlayCss = `
.${OVERLAY_CLASS} :focus { outline: none; }
.${OVERLAY_CLASS} :focus-visible { outline: 2px solid ${T.accent}; outline-offset: 2px; }
@keyframes ppp-customise-spin { to { transform: rotate(360deg); } }
.${OVERLAY_CLASS}-spin { animation: ppp-customise-spin 0.9s linear infinite; }
`
