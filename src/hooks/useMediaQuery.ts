// src/hooks/useMediaQuery.ts
'use client'

import { useCallback, useSyncExternalStore } from 'react'

/**
 * Whether a CSS media query matches, kept in step as the window changes.
 *
 * For layouts written in inline styles, which cannot hold a media query of
 * their own. False on the server and on the first client render, so the wide
 * layout is what is hydrated.
 */
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const media = window.matchMedia(query)
      media.addEventListener('change', onChange)
      return () => media.removeEventListener('change', onChange)
    },
    [query]
  )
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(query).matches,
    () => false
  )
}
