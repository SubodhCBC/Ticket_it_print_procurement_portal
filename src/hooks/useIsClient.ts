'use client'

import { useSyncExternalStore } from 'react'

const subscribe = () => () => {}

/**
 * False while rendering on the server and during hydration, true afterwards.
 *
 * For a tree that must match the server's HTML on its first client render —
 * anything that depends on a session restored from storage — and only then
 * branch on browser-only state. `useSyncExternalStore` gives the server
 * snapshot during hydration and the client one after, which is exactly that,
 * without the extra render a `useEffect(() => setMounted(true))` costs.
 */
export function useIsClient(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => true,
    () => false
  )
}
