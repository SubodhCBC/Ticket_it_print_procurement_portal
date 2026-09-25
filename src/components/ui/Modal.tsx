'use client'

import React, { useId } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X } from 'lucide-react'
import { useDialogBehaviour } from './useDialogBehaviour'

interface ModalProps {
  isOpen: boolean
  onClose: () => void
  title?: string
  children: React.ReactNode
  maxWidth?: string
}

export const Modal: React.FC<ModalProps> = ({
  isOpen,
  onClose,
  title,
  children,
  maxWidth = '580px',
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
            zIndex: 1000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '1rem',
          }}
        >
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
            style={{
              position: 'absolute',
              inset: 0,
              background: 'rgba(43, 37, 62, 0.65)',
              backdropFilter: 'blur(8px)',
              WebkitBackdropFilter: 'blur(8px)',
            }}
          />

          {/* Modal Box */}
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-labelledby={title ? titleId : undefined}
            initial={{ opacity: 0, scale: 0.92, y: 15 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 15 }}
            transition={{ type: 'spring', damping: 25, stiffness: 350 }}
            // .dialog-cap caps the height to the viewport (see globals.css), so
            // the body below scrolls and nothing in a long form is unreachable.
            className="dialog-cap"
            style={{
              position: 'relative',
              zIndex: 1001,
              width: '100%',
              // Never wider than the phone it is opened on: the 16px of
              // padding on the wrapper above stays visible on both sides.
              maxWidth: `min(${maxWidth}, calc(100vw - 32px))`,
              background: 'var(--color-surface)',
              borderRadius: 'var(--radius-xl)',
              boxShadow: 'var(--shadow-lg)',
              overflow: 'hidden',
              display: 'flex',
              flexDirection: 'column',
              border: '1px solid var(--color-border-light)',
            }}
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
                background: 'rgba(231, 234, 239, 0.4)',
                flexShrink: 0,
              }}
              className="page-pad"
            >
              <h3
                id={titleId}
                style={{
                  fontSize: 'var(--font-size-lg)',
                  color: 'var(--color-secondary)',
                  minWidth: 0,
                  overflowWrap: 'anywhere',
                }}
              >
                {title}
              </h3>
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
                  width: '32px',
                  height: '32px',
                  flexShrink: 0,
                  borderRadius: 'var(--radius-full)',
                  background: 'rgba(43, 37, 62, 0.08)',
                  color: 'var(--color-secondary)',
                  transition: 'background var(--transition-fast)',
                }}
              >
                <X size={18} />
              </button>
            </div>

            {/* Content Body */}
            <div
              className="page-pad"
              style={{
                paddingBlock: '1.5rem',
                overflowY: 'auto',
                minHeight: 0,
              }}
            >
              {children}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  )
}
