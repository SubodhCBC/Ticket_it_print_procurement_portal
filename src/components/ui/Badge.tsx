import React from 'react'

export type BadgeVariant =
  'primary' | 'secondary' | 'green' | 'anime-blush' | 'outline' | 'glass'

interface BadgeProps {
  children: React.ReactNode
  variant?: BadgeVariant
  size?: 'sm' | 'md'
  icon?: React.ReactNode
  className?: string
  style?: React.CSSProperties
}

export const Badge: React.FC<BadgeProps> = ({
  children,
  variant = 'primary',
  size = 'md',
  icon,
  className = '',
  style = {},
}) => {
  const getVariantStyles = (): React.CSSProperties => {
    switch (variant) {
      case 'primary':
        return {
          background: 'var(--color-primary-light)',
          color: 'var(--color-primary)',
          border: '1px solid rgba(247, 53, 130, 0.25)',
        }
      case 'secondary':
        return {
          background: 'var(--color-secondary-light)',
          color: 'var(--color-secondary)',
          border: '1px solid rgba(43, 37, 62, 0.2)',
        }
      case 'green':
        return {
          background: 'var(--color-green-light)',
          color: 'var(--color-green)',
          border: '1px solid rgba(88, 185, 125, 0.3)',
        }
      case 'anime-blush':
        return {
          background: 'var(--color-anime-blush-light)',
          color: '#d64d55',
          border: '1px solid rgba(255, 123, 131, 0.35)',
        }
      case 'glass':
        return {
          background: 'rgba(255, 255, 255, 0.75)',
          backdropFilter: 'blur(8px)',
          color: 'var(--color-secondary)',
          border: '1px solid rgba(255, 255, 255, 0.9)',
          boxShadow: '0 2px 8px rgba(0, 0, 0, 0.05)',
        }
      case 'outline':
        return {
          background: 'transparent',
          color: 'var(--color-text-sub)',
          border: '1px solid var(--color-border)',
        }
    }
  }

  const isSmall = size === 'sm'

  return (
    <span
      className={className}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '0.35rem',
        padding: isSmall ? '0.2rem 0.55rem' : '0.3rem 0.8rem',
        fontSize: isSmall ? '0.7rem' : 'var(--font-size-xs)',
        fontWeight: 700,
        letterSpacing: '0.02em',
        borderRadius: 'var(--radius-full)',
        whiteSpace: 'nowrap',
        ...getVariantStyles(),
        ...style,
      }}
    >
      {icon}
      <span>{children}</span>
    </span>
  )
}
