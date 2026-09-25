'use client'

import React from 'react'
import { motion, HTMLMotionProps } from 'framer-motion'

export type ButtonVariant =
  'primary' | 'secondary' | 'green' | 'anime-blush' | 'outline' | 'ghost'
export type ButtonSize = 'sm' | 'md' | 'lg'

interface ButtonProps extends Omit<HTMLMotionProps<'button'>, 'size'> {
  variant?: ButtonVariant
  size?: ButtonSize
  isLoading?: boolean
  leftIcon?: React.ReactNode
  rightIcon?: React.ReactNode
  children: React.ReactNode
  className?: string
  fullWidth?: boolean
}

// Flat on purpose: no coloured shadow and no hover lift. A button that grows
// and glows on hover competes with the content it sits beside.
export const Button: React.FC<ButtonProps> = ({
  variant = 'primary',
  size = 'md',
  isLoading = false,
  leftIcon,
  rightIcon,
  children,
  className = '',
  fullWidth = false,
  disabled,
  ...props
}) => {
  // Styles based on variant
  const getVariantStyles = (): React.CSSProperties => {
    switch (variant) {
      case 'primary':
        return {
          background: 'var(--color-primary)',
          color: '#ffffff',
          border: '1px solid transparent',
        }
      case 'secondary':
        return {
          background: 'var(--color-secondary)',
          color: '#ffffff',
          border: '1px solid transparent',
        }
      case 'green':
        return {
          background: 'var(--color-green)',
          color: '#ffffff',
          border: '1px solid transparent',
        }
      case 'anime-blush':
        return {
          background: 'var(--color-anime-blush)',
          color: '#ffffff',
          border: '1px solid transparent',
        }
      case 'outline':
        return {
          background: '#ffffff',
          color: 'var(--color-secondary)',
          border: '1px solid #F0E6EC',
        }
      case 'ghost':
        return {
          background: 'transparent',
          color: 'var(--color-secondary)',
          border: '1px solid transparent',
        }
    }
  }

  const getSizeStyles = (): React.CSSProperties => {
    switch (size) {
      case 'sm':
        return {
          padding: '0.35rem 0.75rem',
          fontSize: '0.78rem',
          borderRadius: '10px',
        }
      case 'lg':
        return {
          padding: '0.7rem 1.4rem',
          fontSize: '0.95rem',
          borderRadius: '10px',
        }
      case 'md':
      default:
        return {
          padding: '0.5rem 0.9rem',
          fontSize: '0.84rem',
          borderRadius: '10px',
        }
    }
  }

  const baseStyles: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '0.5rem',
    fontWeight: 600,
    cursor: disabled || isLoading ? 'not-allowed' : 'pointer',
    opacity: disabled || isLoading ? 0.5 : 1,
    width: fullWidth ? '100%' : 'auto',
    transition:
      'background var(--transition-fast), color var(--transition-fast), border-color var(--transition-fast)',
    ...getSizeStyles(),
    ...getVariantStyles(),
  }

  return (
    <motion.button
      whileTap={disabled || isLoading ? {} : { scale: 0.98 }}
      style={baseStyles}
      disabled={disabled || isLoading}
      className={className}
      {...props}
    >
      {isLoading ? (
        <span
          style={{
            width: '16px',
            height: '16px',
            border: '2px solid rgba(255,255,255,0.4)',
            borderTopColor: '#ffffff',
            borderRadius: '50%',
            display: 'inline-block',
            animation: 'spin 0.6s linear infinite',
          }}
        />
      ) : (
        leftIcon
      )}
      <span>{children}</span>
      {!isLoading && rightIcon}
    </motion.button>
  )
}
