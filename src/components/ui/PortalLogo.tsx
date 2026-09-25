'use client'

import React from 'react'

interface PortalLogoProps {
  size?: 'sm' | 'md' | 'lg' | 'xl'
  showTagline?: boolean
  theme?: 'dark' | 'light'
  className?: string
}

export const PortalLogo: React.FC<PortalLogoProps> = ({
  size = 'md',
  showTagline = true,
  theme = 'light',
  className = '',
}) => {
  // Dimensions scaling
  const dimensions = {
    sm: {
      width: 140,
      height: 42,
      fontSizeText: 17,
      fontSizeIT: 15,
      taglineSize: 8,
    },
    md: {
      width: 190,
      height: 56,
      fontSizeText: 22,
      fontSizeIT: 19,
      taglineSize: 9.5,
    },
    lg: {
      width: 240,
      height: 72,
      fontSizeText: 28,
      fontSizeIT: 24,
      taglineSize: 12,
    },
    xl: {
      width: 300,
      height: 90,
      fontSizeText: 36,
      fontSizeIT: 30,
      taglineSize: 14,
    },
  }[size]

  const textColor = theme === 'dark' ? '#FFFFFF' : '#2B253E'
  const taglineColor = theme === 'dark' ? '#A6A0B8' : '#5C566E'
  const bubbleColor = '#F73582' // Portal brand pink

  return (
    <div
      className={`portal-brand-logo ${className}`}
      style={{
        display: 'inline-flex',
        flexDirection: 'column',
        alignItems: 'flex-start',
        userSelect: 'none',
      }}
    >
      {/* Main Logo Row: Print Procurement + [Portal Bubble] */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: size === 'sm' ? '4px' : size === 'lg' ? '8px' : '6px',
        }}
      >
        {/* "Print Procurement" Text */}
        <span
          style={{
            fontFamily:
              '"Acumin Pro", "Acumin", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
            fontSize: `${dimensions.fontSizeText}px`,
            fontWeight: 900,
            color: textColor,
            letterSpacing: '-0.03em',
            lineHeight: 1,
            whiteSpace: 'nowrap',
          }}
        >
          Print Procurement
        </span>

        {/* Hot Pink Speech Bubble with "Portal" */}
        <div
          style={{
            position: 'relative',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: bubbleColor,
            color: '#FFFFFF',
            borderRadius: `${dimensions.fontSizeIT * 0.55}px ${dimensions.fontSizeIT * 0.55}px ${dimensions.fontSizeIT * 0.55}px 4px`,
            padding: `${dimensions.fontSizeIT * 0.15}px ${dimensions.fontSizeIT * 0.32}px`,
            minWidth: `${dimensions.fontSizeIT * 1.25}px`,
            whiteSpace: 'nowrap',
          }}
        >
          <span
            style={{
              fontFamily:
                '"Acumin Pro", "Acumin", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
              fontSize: `${dimensions.fontSizeIT}px`,
              fontWeight: 900,
              color: '#FFFFFF',
              letterSpacing: '-0.01em',
              lineHeight: 1,
              transform: 'translateY(-0.5px)',
            }}
          >
            Portal
          </span>

          {/* Little speech tail at bottom-left */}
          <div
            style={{
              position: 'absolute',
              bottom: '-3px',
              left: '4px',
              width: 0,
              height: 0,
              borderLeft: '4px solid transparent',
              borderRight: '4px solid transparent',
              borderTop: `5px solid ${bubbleColor}`,
              transform: 'rotate(25deg)',
            }}
          />
        </div>
      </div>

      {/* Tagline */}
      {showTagline && (
        <div
          style={{
            fontFamily:
              '"Acumin Pro", "Acumin", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
            fontSize: `${dimensions.taglineSize}px`,
            fontWeight: 700,
            color: taglineColor,
            letterSpacing: '0.04em',
            marginTop: size === 'sm' ? '2px' : '4px',
            paddingLeft: '1px',
          }}
        >
          Order · Approve · Deliver
        </div>
      )}
    </div>
  )
}
