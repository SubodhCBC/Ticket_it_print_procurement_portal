import { AsyncLocalStorage } from 'node:async_hooks'
import { prisma } from '../db/client'
import { createId } from '../utils/ids'
import type { Carrier } from './carrier.types'
import { NzPostApiError } from './nzpost/nzpost.errors'

/**
 * A record of every carrier call, for integration health (SOW §15: "NZ Post call
 * success rate, latency, retry volume, dead-letter count and last reconciliation
 * result").
 *
 * ---------------------------------------------------------------------------
 * Measured at the carrier, not the socket
 * ---------------------------------------------------------------------------
 * One row per call to a `Carrier` method — "search addresses", "submit label" —
 * timed from the caller's side, so its latency includes the token exchange and
 * the in-call retries a person actually waited through. The HTTP transport adds
 * to `httpRetries` as it retries; the queue worker says which attempt of a job
 * the call belongs to. Mock mode is recorded too, marked MOCK, so a demo shows
 * the dashboard working without its figures ever passing for NZ Post's.
 *
 * ---------------------------------------------------------------------------
 * Never in the way
 * ---------------------------------------------------------------------------
 * The row is written after the call and without being awaited by it. A metrics
 * insert that failed, or was slow, must not fail or slow a checkout — so a lost
 * row is logged and forgotten.
 */

interface CallContext {
  attempt: number
  httpRetries: number
}

const context = new AsyncLocalStorage<CallContext>()

/** Runs `fn` as attempt `attempt` of a queued job. */
export function withJobAttempt<T>(
  attempt: number,
  fn: () => Promise<T>
): Promise<T> {
  return context.run({ attempt, httpRetries: 0 }, fn)
}

/** Called by the HTTP transport each time it sends a request again. */
export function noteHttpRetry(): void {
  const current = context.getStore()
  if (current) current.httpRetries += 1
}

const CARRIER_METHODS = [
  'searchAddresses',
  'getAddress',
  'quoteDomestic',
  'collectionPoints',
  'submitLabel',
  'labelStatus',
  'downloadLabel',
  'bookPickup',
  'track',
] as const satisfies readonly (keyof Carrier)[]

/** The same carrier, with every call timed and recorded. */
export function instrumented(carrier: Carrier): Carrier {
  const wrapped: Record<string, unknown> = { kind: carrier.kind }
  for (const method of CARRIER_METHODS) {
    const original = carrier[method] as (...args: unknown[]) => Promise<unknown>
    wrapped[method] = (...args: unknown[]) =>
      timed(carrier.kind, method, () => original.apply(carrier, args))
  }
  return wrapped as unknown as Carrier
}

async function timed<T>(
  kind: Carrier['kind'],
  operation: string,
  call: () => Promise<T>
): Promise<T> {
  const outer = context.getStore()
  // A fresh counter per call, inheriting the job attempt, so two calls in one
  // job do not share a retry count.
  const own: CallContext = { attempt: outer?.attempt ?? 1, httpRetries: 0 }
  const started = performance.now()

  try {
    const result = await context.run(own, call)
    record(kind, operation, own, started, null)
    return result
  } catch (error) {
    record(kind, operation, own, started, error)
    throw error
  }
}

function record(
  kind: Carrier['kind'],
  operation: string,
  call: CallContext,
  started: number,
  error: unknown
): void {
  const durationMs = Math.max(0, Math.round(performance.now() - started))

  prisma.integrationCall
    .create({
      data: {
        id: createId('igc'),
        provider: 'NZPOST',
        mode: kind === 'mock' ? 'MOCK' : 'LIVE',
        operation,
        outcome: error ? 'FAILED' : 'SUCCEEDED',
        durationMs,
        attempt: call.attempt,
        httpRetries: call.httpRetries,
        errorCode: error ? errorCodeOf(error) : null,
        httpStatus: error instanceof NzPostApiError ? error.status : null,
      },
    })
    .catch((failure: unknown) => {
      console.warn(
        `Integration call not recorded (${operation}): ` +
          (failure instanceof Error ? failure.message : String(failure))
      )
    })
}

/** A short, stable name for what went wrong — never the message, which may carry data. */
function errorCodeOf(error: unknown): string {
  if (error instanceof Error) return error.name.slice(0, 64)
  return 'UnknownError'
}
