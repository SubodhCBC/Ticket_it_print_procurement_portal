'use client'

import React, { useId } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X } from 'lucide-react'
import { useDialogBehaviour } from './useDialogBehaviour'

interface DrawerProps {
  isOpen: boolean
  onClose: () => void
  title?: React.ReactNode
  children: React.ReactNode
  footer?: React.ReactNode
  width?: string
}

export const Drawer: React.FC<DrawerProps> = ({
  isOpen,
  onClose,
  title,
  children,
  footer,
  width = '440px',
}) => {
  const titleId = useId()
  // Escape, focus in and out, and the page behind held still — see the hook.
  const closeRef = useDialogBehaviour<HTMLButtonElement>(isOpen, onClose)

  return (
    <AnimatePresence>
      {isOpen && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 1100,
            display: 'flex',
            justifyContent: 'flex-end',
          }}
        >
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
            onClick={onClose}
            style={{
              position: 'absolute',
              inset: 0,
              background: 'rgba(43, 37, 62, 0.55)',
              backdropFilter: 'blur(6px)',
              WebkitBackdropFilter: 'blur(6px)',
            }}
          />

          {/* Slide-over Drawer */}
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-labelledby={title ? titleId : undefined}
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 28, stiffness: 300 }}
            // .drawer-panel (globals.css) resolves the width: `width` on a
            // tablet and up, never wider than the viewport, and edge to edge on
            // a phone — where a 440px panel beside a sliver of backdrop was
            // both cramped and easy to dismiss by accident.
            className="drawer-panel"
            style={
              {
                position: 'relative',
                zIndex: 1101,
                '--drawer-w': width,
                height: '100%',
                background: 'var(--color-surface)',
                boxShadow: '-8px 0 35px rgba(43, 37, 62, 0.2)',
                display: 'flex',
                flexDirection: 'column',
                borderLeft: '1px solid var(--color-border)',
              } as React.CSSProperties
            }
          >
            {/* Header */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '12px',
                paddingBlock: '1rem',
                borderBottom: '1px solid var(--color-border)',
                background: 'rgba(231, 234, 239, 0.5)',
                flexShrink: 0,
              }}
              className="page-pad"
            >
              <div
                id={titleId}
                style={{
                  fontWeight: 700,
                  fontSize: 'var(--font-size-lg)',
                  color: 'var(--color-secondary)',
                  minWidth: 0,
                  overflowWrap: 'anywhere',
                }}
              >
                {title}
              </div>
              <button
                ref={closeRef}
                type="button"
                onClick={onClose}
                aria-label="Close"
                className="touch-target"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: '34px',
                  height: '34px',
                  flexShrink: 0,
                  borderRadius: 'var(--radius-full)',
                  background: 'rgba(43, 37, 62, 0.08)',
                  color: 'var(--color-secondary)',
                  cursor: 'pointer',
                }}
              >
                <X size={18} />
              </button>
            </div>

            {/* Scrollable Body */}
            <div
              className="page-pad"
              style={{
                flex: 1,
                minHeight: 0,
                overflowY: 'auto',
                paddingBlock: '1.5rem',
                display: 'flex',
                flexDirection: 'column',
                gap: '1rem',
              }}
            >
              {children}
            </div>

            {/* Footer */}
            {footer && (
              <div
                className="page-pad"
                style={{
                  paddingBlock: '1rem',
                  flexShrink: 0,
                  borderTop: '1px solid var(--color-border)',
                  background: 'rgba(255, 255, 255, 0.95)',
                  boxShadow: '0 -4px 16px rgba(43, 37, 62, 0.04)',
                }}
              >
                {footer}
              </div>
            )}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  )
}
