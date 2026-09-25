// src/components/dam/DamImagePicker.tsx
'use client'

import { useEffect, useRef } from 'react'
import { Modal } from '@/components/ui/Modal'
import { DamLibrary } from './DamLibrary'

/**
 * Chooses a picture from the image library, for the design tools.
 *
 * The props below are the contract the design tools are written against; the
 * browsing itself is `DamLibrary` in select mode, the same one the library
 * pages use.
 */

export interface DamPickedImage {
  url: string
  name: string
  folderPath: string | null
  thumbnailUrl: string | null
  contentType: string | null
}

export interface DamImagePickerProps {
  isOpen: boolean
  onClose: () => void
  /** Called with the chosen picture; the picker closes itself afterwards. */
  onPick: (image: DamPickedImage) => void
  /** Dialog heading. Defaults to "Image library". */
  title?: string
  /** Offer the upload control when the user may upload. Default true. */
  allowUpload?: boolean
  /** Folder to open at. Defaults to the root. */
  initialFolderPath?: string | null
}

export function DamImagePicker({
  isOpen,
  onClose,
  onPick,
  title = 'Image library',
  allowUpload = true,
  initialFolderPath = null,
}: DamImagePickerProps) {
  // Held in a ref so the Escape listener is bound once per opening, not on
  // every render of a parent that passes a fresh arrow function.
  const closeRef = useRef(onClose)
  useEffect(() => {
    closeRef.current = onClose
  }, [onClose])

  useEffect(() => {
    if (!isOpen) return
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape' && !event.defaultPrevented) {
        closeRef.current()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [isOpen])

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title} maxWidth="1080px">
      {/* Mounted only while open (Modal renders nothing when closed), so every
          opening starts at `initialFolderPath` with no stale search. */}
      <DamLibrary
        mode="select"
        allowUpload={allowUpload}
        initialFolderPath={initialFolderPath}
        onPick={(image) => {
          onPick(image)
          onClose()
        }}
      />
    </Modal>
  )
}
