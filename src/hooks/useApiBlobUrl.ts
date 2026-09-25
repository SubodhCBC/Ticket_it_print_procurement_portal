// src/hooks/useApiBlobUrl.ts
'use client'

import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { fetchApiBlob } from '@/services/data-source/api/api-files.adapter'

/**
 * An object URL for a file only a signed-in caller may read, ready for an
 * `<img>` or an `<iframe>`.
 *
 * The bytes are cached by path, like any other query, so twenty cards asking
 * for the same preview make one request. The object URL is made per component
 * and revoked when the path changes or the component goes, so none leak.
 */
export function useApiBlobUrl(
  path: string | null | undefined,
  options?: { enabled?: boolean; fetcher?: () => Promise<Blob> }
) {
  const enabled = Boolean(path) && (options?.enabled ?? true)
  const query = useQuery({
    queryKey: ['api-file', path],
    queryFn: () => (options?.fetcher ? options.fetcher() : fetchApiBlob(path!)),
    enabled,
    staleTime: 5 * 60_000,
    retry: false,
  })

  const blob = query.data
  const [made, setMade] = useState<{ blob: Blob; url: string } | null>(null)
  useEffect(() => {
    if (!blob) return
    const objectUrl = URL.createObjectURL(blob)
    let live = true
    // Published after the effect rather than inside it; and a remount (strict
    // mode) makes its own URL instead of reusing one the unmount revoked.
    queueMicrotask(() => {
      if (live) setMade({ blob, url: objectUrl })
    })
    return () => {
      live = false
      URL.revokeObjectURL(objectUrl)
    }
  }, [blob])
  const url = blob && made?.blob === blob ? made.url : null

  return {
    url,
    isLoading: enabled && query.isPending,
    error: query.error,
    refetch: query.refetch,
  }
}
