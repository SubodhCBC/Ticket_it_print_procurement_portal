'use client'

import React from 'react'
import { motion, HTMLMotionProps } from 'framer-motion'

interface CardProps extends HTMLMotionProps<'div'> {
  children: React.ReactNode
  variant?: 'glass' | 'solid' | 'flat'
  isHoverable?: boolean
  className?: string
}

export const Card: React.FC<CardProps> = ({
  children,
  variant = 'glass',
  isHoverable = true,
  className = '',
  style = {},
  ...props
}) => {
  const getVariantStyles = (): React.CSSProperties => {
    switch (variant) {
      case 'glass':
        return {
          background: 'var(--color-surface-translucent)',
          backdropFilter: 'blur(16px)',
          WebkitBackdropFilter: 'blur(16px)',
          border: '1px solid var(--color-border-light)',
          boxShadow: 'var(--shadow-md)',
        }
      case 'solid':
        return {
          background: 'var(--color-surface)',
          border: '1px solid var(--color-border)',
          boxShadow: 'var(--shadow-sm)',
        }
      case 'flat':
        return {
          background: 'rgba(255, 255, 255, 0.5)',
          border: '1px solid rgba(43, 37, 62, 0.06)',
        }
    }
  }

  return (
    <motion.div
      whileHover={
        isHoverable
          ? {
              y: -5,
              boxShadow: '0 20px 40px rgba(43, 37, 62, 0.12)',
              borderColor: 'rgba(247, 53, 130, 0.35)',
              transition: { duration: 0.25, ease: 'easeOut' },
            }
          : {}
      }
      style={{
        borderRadius: 'var(--radius-lg)',
        overflow: 'hidden',
        position: 'relative',
        ...getVariantStyles(),
        ...style,
      }}
      className={className}
      {...props}
    >
      {children}
    </motion.div>
  )
}
