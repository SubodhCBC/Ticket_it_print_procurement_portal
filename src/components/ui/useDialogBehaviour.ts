'use client'

import { useEffect, useRef, type RefObject } from 'react'

/**
 * What every dialog in this portal owes the keyboard.
 *
 * Escape closes it, focus moves into it when it opens and returns to whatever
 * opened it when it closes, and the page behind stops scrolling. Written once
 * because the three dialogs here — `Modal`, `Drawer` and the order action
 * dialog — each had their own copy, and a copy is a chance for one of them to
 * quietly lose a behaviour the others keep.
 *
 * Returns the ref to put on the element that should hold focus first, normally
 * the close button.
 */
export function useDialogBehaviour<T extends HTMLElement>(
  isOpen: boolean,
  onClose: () => void
): RefObject<T | null> {
  const initialFocusRef = useRef<T | null>(null)
  /** Where focus was before this opened, so it can be handed back. */
  const openerRef = useRef<Element | null>(null)

  useEffect(() => {
    if (!isOpen) return

    openerRef.current = document.activeElement
    initialFocusRef.current?.focus()

    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        // Stopped here so one Escape closes one dialog: a drawer opened from a
        // modal should not take both with it.
        event.stopPropagation()
        onClose()
      }
    }
    document.addEventListener('keydown', onKeyDown)

    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.body.style.overflow = previousOverflow
      const opener = openerRef.current
      if (opener instanceof HTMLElement) opener.focus()
    }
  }, [isOpen, onClose])

  return initialFocusRef
}
