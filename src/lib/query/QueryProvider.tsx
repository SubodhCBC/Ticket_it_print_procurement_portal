'use client'

import React from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ApiError } from '@/services'

/**
 * The query cache.
 *
 * Every screen used to fetch on mount with a hand-rolled `useState`/`useEffect`
 * pair: no cache, no deduplication, and a fresh request for the same data every
 * time a component rendered. A dashboard cost sixteen requests for seven
 * distinct answers, and navigating away and back paid for all of them again.
 *
 * The defaults below are chosen for this application rather than copied:
 *
 * - **`staleTime: 30s`** — a portal's data is other people's work: an order
 *   somebody else approved should appear soon, not instantly. Thirty seconds
 *   collapses the burst of a page load and a tab switch into one request while
 *   still feeling live. Reports override this upward; the cart overrides it to
 *   zero, because a basket must never be served from a cache.
 * - **`retry` skips 4xx** — a 403 is an answer, not a failure, and retrying it
 *   three times turns one refusal into four. Only network and 5xx are retried.
 * - **`refetchOnWindowFocus: false`** — an operator alt-tabbing between this
 *   and a spreadsheet all day should not fire a request storm on every return.
 *   Screens that need live data ask for it.
 */
function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        gcTime: 5 * 60_000,
        refetchOnWindowFocus: false,
        retry: (failureCount, error) => {
          const status = error instanceof ApiError ? error.status : 0
          // A refusal, a missing row or a bad request will not become true on
          // the second attempt.
          if (status >= 400 && status < 500) return false
          return failureCount < 2
        },
      },
      mutations: {
        retry: false,
      },
    },
  })
}

/**
 * One client per browser session, and a *new* one per server render.
 *
 * A module-level client would be shared between requests on the server, which
 * on a multi-tenant portal means one customer's cache answering another's page.
 */
let browserClient: QueryClient | undefined

function getQueryClient() {
  if (typeof window === 'undefined') return makeQueryClient()
  browserClient ??= makeQueryClient()
  return browserClient
}

export function QueryProvider({ children }: { children: React.ReactNode }) {
  const [client] = React.useState(getQueryClient)
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}
