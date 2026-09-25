'use client'

import React, { useState } from 'react'

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string
  error?: string
  leftIcon?: React.ReactNode
  rightIcon?: React.ReactNode
  containerStyle?: React.CSSProperties
}

export const Input: React.FC<InputProps> = ({
  label,
  error,
  leftIcon,
  rightIcon,
  className = '',
  style = {},
  containerStyle = {},
  onFocus,
  onBlur,
  ...props
}) => {
  const [isFocused, setIsFocused] = useState(false)

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '0.35rem',
        width: '100%',
        ...containerStyle,
      }}
    >
      {label && (
        <label
          style={{
            fontSize: 'var(--font-size-xs)',
            fontWeight: 700,
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
            color: 'var(--color-text-sub)',
          }}
        >
          {label}
        </label>
      )}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.6rem',
          background: 'rgba(255, 255, 255, 0.85)',
          backdropFilter: 'blur(10px)',
          border: `1.5px solid ${
            error
              ? 'var(--color-primary)'
              : isFocused
                ? 'var(--color-primary)'
                : 'rgba(43, 37, 62, 0.12)'
          }`,
          borderRadius: 'var(--radius-md)',
          padding: '0.6rem 0.9rem',
          boxShadow: isFocused
            ? '0 0 0 3px rgba(247, 53, 130, 0.15)'
            : 'var(--shadow-sm)',
          transition: 'all var(--transition-fast)',
        }}
      >
        {leftIcon && (
          <span style={{ color: 'var(--color-text-muted)', display: 'flex' }}>
            {leftIcon}
          </span>
        )}
        <input
          style={{
            flex: 1,
            border: 'none',
            outline: 'none',
            background: 'transparent',
            color: 'var(--color-text-main)',
            fontSize: 'var(--font-size-sm)',
            width: '100%',
            ...style,
          }}
          onFocus={(e) => {
            setIsFocused(true)
            onFocus?.(e)
          }}
          onBlur={(e) => {
            setIsFocused(false)
            onBlur?.(e)
          }}
          className={className || undefined}
          {...props}
        />
        {rightIcon && (
          <span style={{ color: 'var(--color-text-muted)', display: 'flex' }}>
            {rightIcon}
          </span>
        )}
      </div>
      {error && (
        <span
          style={{
            fontSize: 'var(--font-size-xs)',
            color: 'var(--color-primary)',
            fontWeight: 600,
          }}
        >
          {error}
        </span>
      )}
    </div>
  )
}
