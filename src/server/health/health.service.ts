import { isCacheConfigured, pingCache } from '../cache/cache.service'
import { getConfig } from '../config'
import { pingDatabase } from '../db/client'
import {
  isTicketItConfigured,
  pingTicketItApi,
} from '../auth/ticketit/ticketit.client'

/**
 * The three probes, kept distinct because orchestrators need different answers:
 *
 *  - /health/live          the process is running. Failing it means "restart me".
 *  - /health/ready         dependencies reachable. Failing it means "stop
 *                          sending traffic" — but do NOT restart, the database
 *                          may just be failing over.
 *  - /health/dependencies  everything, including the ones an outage of which
 *                          degrades rather than stops the service.
 *  - /health               human-readable summary including the deployed revision.
 *
 * Conflating liveness and readiness is how a brief database blip turns into a
 * rolling restart of every replica.
 *
 * The response shape is the one `@nestjs/terminus` produced — `status`, `info`,
 * `error`, `details`, and 503 when anything is down — because the deployment
 * manifests and uptime monitors already parse it.
 */

export type IndicatorState = 'up' | 'down' | 'skipped'

export interface IndicatorResult {
  readonly status: IndicatorState
  readonly latencyMs?: number
  readonly reason?: string
  readonly impact?: string
}

export interface HealthReport {
  readonly status: 'ok' | 'error'
  readonly info: Record<string, IndicatorResult>
  readonly error: Record<string, IndicatorResult>
  readonly details: Record<string, IndicatorResult>
}

/** Wall-clock time for one probe, with the failure captured rather than thrown. */
async function measure(
  probe: () => Promise<void>,
  onDown?: Omit<IndicatorResult, 'status' | 'latencyMs'>
): Promise<IndicatorResult> {
  const startedAt = Date.now()
  try {
    await probe()
    return { status: 'up', latencyMs: Date.now() - startedAt }
  } catch (error) {
    return {
      status: 'down',
      latencyMs: Date.now() - startedAt,
      reason: error instanceof Error ? error.message : 'unknown error',
      ...onDown,
    }
  }
}

/**
 * The cache.
 *
 * Reported as `skipped` rather than `down` when no `REDIS_URL` is set. Running
 * without Redis is a supported configuration here — the read-through cache falls
 * through to the database and the rate limiter is per-instance — so failing
 * readiness over it would keep a working deployment permanently out of the load
 * balancer.
 */
async function checkCache(): Promise<IndicatorResult> {
  if (!isCacheConfigured()) {
    return { status: 'skipped', reason: 'No REDIS_URL configured' }
  }

  return measure(async () => {
    await pingCache()
  })
}

/**
 * The Ticket-IT API.
 *
 * Reported on `/health/dependencies` but deliberately kept out of readiness.
 * The impact is larger than the legacy database's was — Ticket-IT now verifies
 * every credential it owns, so an outage there stops those users signing in
 * rather than only slowing their first login — but it is still the wrong thing
 * to fail readiness on. Sessions already issued keep working, refresh keeps
 * working, portal-native users keep signing in, and pulling every replica out of
 * the load balancer over an outage in a system we do not own would turn a
 * partial degradation into a total one.
 */
async function checkTicketIt(): Promise<IndicatorResult> {
  if (!isTicketItConfigured()) {
    return { status: 'skipped', reason: 'No Ticket-IT API configured' }
  }

  return measure(pingTicketItApi, {
    impact:
      'sign-in for Ticket-IT users; existing sessions and portal-native users are unaffected',
  })
}

function assemble(details: Record<string, IndicatorResult>): HealthReport {
  const info: Record<string, IndicatorResult> = {}
  const error: Record<string, IndicatorResult> = {}

  for (const [key, result] of Object.entries(details)) {
    if (result.status === 'down') error[key] = result
    else info[key] = result
  }

  return {
    status: Object.keys(error).length === 0 ? 'ok' : 'error',
    info,
    error,
    details,
  }
}

/** Liveness: the process answered, which is the whole claim. */
export function liveness(): { status: 'ok'; uptimeSeconds: number } {
  return { status: 'ok', uptimeSeconds: Math.floor(process.uptime()) }
}

/** Readiness: only what the service cannot serve traffic without. */
export async function readiness(): Promise<HealthReport> {
  const [database, cache] = await Promise.all([
    measure(pingDatabase),
    checkCache(),
  ])

  return assemble({ database, redis: cache })
}

/** Everything, including the dependencies whose outage only degrades. */
export async function dependencies(): Promise<HealthReport> {
  const [database, cache, ticketIt] = await Promise.all([
    measure(pingDatabase),
    checkCache(),
    checkTicketIt(),
  ])

  return assemble({ database, redis: cache, 'ticketit-api': ticketIt })
}

/** The human-readable summary, for someone asking "what is deployed here". */
export function summary() {
  const { app } = getConfig()

  return {
    name: app.name,
    environment: app.env,
    release: app.release,
    apiVersion: app.apiVersion,
    uptimeSeconds: Math.floor(process.uptime()),
    timestamp: new Date().toISOString(),
  }
}
