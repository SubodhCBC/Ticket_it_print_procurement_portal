'use client'

import { useEffect } from 'react'
import { usePathname } from 'next/navigation'
import { documentTitleFor } from '@/lib/page-title'

/**
 * Keeps the browser tab named after the screen being looked at.
 *
 * Mounted once, in the root layout: it renders nothing and re-titles on every
 * navigation. See `src/lib/page-title.ts` for where the words come from.
 */
export function DocumentTitle() {
  const pathname = usePathname()

  useEffect(() => {
    document.title = documentTitleFor(pathname)
  }, [pathname])

  return null
}
