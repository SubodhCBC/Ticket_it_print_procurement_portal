'use client'

import React, { useState } from 'react'
import { AlertCircle } from 'lucide-react'

/**
 * One text field, with its label, its hint and its own error.
 *
 * Why this exists: the forms in this portal were leaving validation to the
 * browser's `required` attribute, which answers with a grey bubble reading
 * "Please fill out this field" anchored to whatever the browser feels like,
 * in the browser's language, styled nothing like the portal, and gone the
 * moment the user types. It also stops at the first offending field, so a form
 * with three empty boxes is discovered one refusal at a time.
 *
 * Here the field owns its error: the box turns red, the message sits under it
 * naming the field and what to do, and it clears as soon as the value changes.
 * `aria-invalid` and `aria-describedby` carry the same thing to a screen
 * reader. Forms using this should set `noValidate` so the browser stays out of
 * it.
 */

export const FIELD_RED = '#DC2626'
const BORDER = '#F0E6EC'
const BRAND = '#F73582'

export interface TextFieldProps extends Omit<
  React.InputHTMLAttributes<HTMLInputElement>,
  'id'
> {
  /** Required: `aria-describedby` and the label's `htmlFor` are built from it. */
  id: string
  label: string
  /** The message under the field. Present means the field reads as wrong. */
  error?: string | null
  /** Quiet guidance under the field, shown only while there is no error. */
  hint?: React.ReactNode
  /** Shown as a red dot after the label. Does not add the HTML attribute. */
  isRequired?: boolean
  leftIcon?: React.ReactNode
  /** A button — reveal a password, clear the box — pinned to the right. */
  rightSlot?: React.ReactNode
  /** Sits on the label row, to the right: "Forgot password?", a counter. */
  labelAside?: React.ReactNode
  containerStyle?: React.CSSProperties
}

export function TextField({
  id,
  label,
  error,
  hint,
  isRequired,
  leftIcon,
  rightSlot,
  labelAside,
  containerStyle,
  style,
  onFocus,
  onBlur,
  ...input
}: TextFieldProps) {
  const [focused, setFocused] = useState(false)
  const describedBy = error ? `${id}-error` : hint ? `${id}-hint` : undefined

  return (
    <div style={{ ...containerStyle }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'baseline',
          justifyContent: 'space-between',
          gap: '10px',
          marginBottom: '6px',
        }}
      >
        <label htmlFor={id} style={labelStyle}>
          {label}
          {isRequired && (
            <span aria-hidden="true" style={{ color: FIELD_RED }}>
              {' '}
              *
            </span>
          )}
        </label>
        {labelAside}
      </div>

      <div style={{ position: 'relative', display: 'flex' }}>
        {leftIcon && (
          <span
            aria-hidden="true"
            style={{
              position: 'absolute',
              left: '12px',
              top: '50%',
              transform: 'translateY(-50%)',
              display: 'flex',
              color: error ? FIELD_RED : '#A39BB3',
              pointerEvents: 'none',
            }}
          >
            {leftIcon}
          </span>
        )}
        <input
          id={id}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          onFocus={(e) => {
            setFocused(true)
            onFocus?.(e)
          }}
          onBlur={(e) => {
            setFocused(false)
            onBlur?.(e)
          }}
          style={{
            width: '100%',
            padding: `8px ${rightSlot ? '40px' : '12px'} 8px ${leftIcon ? '36px' : '12px'}`,
            borderRadius: '10px',
            border: `1px solid ${error ? FIELD_RED : focused ? BRAND : BORDER}`,
            background: error ? '#FEF5F6' : '#FFFFFF',
            color: '#2B253E',
            fontSize: '0.84rem',
            outline: 'none',
            boxShadow: focused
              ? `0 0 0 3px ${error ? 'rgba(220, 38, 38, 0.14)' : 'rgba(247, 53, 130, 0.14)'}`
              : 'none',
            transition: 'border-color 120ms ease, box-shadow 120ms ease',
            ...style,
          }}
          {...input}
        />
        {rightSlot && (
          <span
            style={{
              position: 'absolute',
              right: '10px',
              top: '50%',
              transform: 'translateY(-50%)',
              display: 'flex',
            }}
          >
            {rightSlot}
          </span>
        )}
      </div>

      {error ? (
        <FieldError id={`${id}-error`}>{error}</FieldError>
      ) : hint ? (
        <span id={`${id}-hint`} style={hintStyle}>
          {hint}
        </span>
      ) : null}
    </div>
  )
}

/** The message under a field that is wrong. Also usable on selects and groups. */
export function FieldError({
  id,
  children,
}: {
  id?: string
  children: React.ReactNode
}) {
  return (
    <span
      id={id}
      role="alert"
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: '5px',
        marginTop: '6px',
        fontSize: '0.75rem',
        fontWeight: 500,
        color: FIELD_RED,
        lineHeight: 1.4,
      }}
    >
      <AlertCircle size={13} style={{ flexShrink: 0, marginTop: '1px' }} />
      <span>{children}</span>
    </span>
  )
}

/**
 * The border and ring for a control this component does not render — a select,
 * a textarea, a date box — so it can look wrong the same way.
 */
export function fieldOutline(hasError: boolean): React.CSSProperties {
  return {
    border: `1px solid ${hasError ? FIELD_RED : BORDER}`,
    background: hasError ? '#FEF5F6' : '#FFFFFF',
  }
}

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: '0.78rem',
  fontWeight: 600,
  color: '#5C566E',
}

const hintStyle: React.CSSProperties = {
  display: 'block',
  marginTop: '6px',
  fontSize: '0.72rem',
  color: '#A39BB3',
  lineHeight: 1.4,
}
