import { getConfig } from '../config'
import { prisma } from '../db/client'
import { probeAccessToken } from './nzpost/nzpost.token'
import {
  liveConfigurationGaps,
  SHIPPING_CAPABILITIES,
  shippingMode,
  type ShippingCapability,
  type ShippingMode,
} from './nzpost/nzpost.settings'

/**
 * Integration health for an administrator (SOW §15: NZ Post call success,
 * retries, dead letters, last reconciliation).
 *
 * Variable names appear here and nowhere a buyer can see: INTEGRATION_MANAGE is
 * the permission to "configure outbound integrations and the credentials they
 * authenticate with", and someone holding it needs to know what to set. Secret
 * values never appear, and neither does the token.
 */

/** Carrier call figures over one window, from `integration_calls`. */
export interface IntegrationCallWindow {
  readonly window: '24h' | '7d'
  readonly calls: number
  readonly succeeded: number
  readonly failed: number
  /** Null when there were no calls, rather than a 100% nobody earned. */
  readonly successRatePercent: number | null
  /** Milliseconds, over every call in the window. Null with no calls. */
  readonly latencyMs: {
    readonly average: number
    readonly p50: number
    readonly p95: number
    readonly max: number
  } | null
  /**
   * Retry volume: calls made as a retry of a queued job, plus the retries made
   * inside calls (interactive reads, a refused token).
   */
  readonly retries: number
  /** Calls recorded in mock mode, which are not NZ Post's figures. */
  readonly mockCalls: number
  readonly byOperation: readonly {
    readonly operation: string
    readonly calls: number
    readonly failed: number
    readonly averageMs: number
  }[]
}

export interface ReconciliationRunView {
  readonly kind: string
  readonly outcome: string
  readonly startedAt: string
  readonly finishedAt: string | null
  readonly examined: number | null
  readonly flagged: number | null
  readonly outstanding: number | null
  readonly message: string | null
}

export interface ShippingStatusView {
  readonly mode: ShippingMode
  readonly apiHost: string | null
  readonly credentialsConfigured: boolean
  readonly capabilities: ReadonlyArray<{
    readonly capability: ShippingCapability
    /** Whether a live call could be made with the current configuration. */
    readonly liveReady: boolean
    readonly missing: readonly string[]
  }>
  readonly token:
    | { readonly ok: true; readonly expiresInSeconds: number }
    | { readonly ok: false; readonly error: string }
    | null
  readonly shipments: {
    readonly byStatus: Readonly<Record<string, number>>
    /** FAILED shipments: the portal's dead-letter list, each replayable. */
    readonly failed: number
    readonly awaitingPickup: number
    readonly flaggedUnscanned: number
    readonly lastTrackedAt: string | null
  }
  /** Success rate, latency and retry volume (SOW §15 integration health). */
  readonly calls: readonly IntegrationCallWindow[]
  /** The most recent unscanned-label reconciliation, or null if none has run. */
  readonly lastReconciliation: ReconciliationRunView | null
  readonly settings: {
    readonly trackingPollMinutes: number
    readonly unscannedLabelDays: number
    readonly flatRateConfigured: boolean
    readonly defaultServiceCode: string | null
  }
}

export async function getShippingStatus(
  probe: boolean
): Promise<ShippingStatusView> {
  const nz = getConfig().nzPost

  const now = Date.now()
  const [
    grouped,
    awaitingPickup,
    flaggedUnscanned,
    lastTracked,
    day,
    week,
    lastRun,
  ] = await Promise.all([
    prisma.shipment.groupBy({ by: ['status'], _count: { _all: true } }),
    prisma.shipment.count({
      where: { status: 'LABELLED', voidedAt: null, pickupBookingId: null },
    }),
    prisma.shipment.count({
      where: { status: 'LABELLED', unscannedFlaggedAt: { not: null } },
    }),
    prisma.shipment.aggregate({ _max: { lastTrackedAt: true } }),
    callWindow('24h', new Date(now - 86_400_000)),
    callWindow('7d', new Date(now - 7 * 86_400_000)),
    prisma.reconciliationRun.findFirst({
      where: { kind: 'UNSCANNED_LABELS' },
      orderBy: { startedAt: 'desc' },
    }),
  ])

  const byStatus = Object.fromEntries(
    grouped.map((row) => [row.status, row._count._all])
  )

  return {
    mode: shippingMode(),
    apiHost: nz.apiBaseUrl ? new URL(nz.apiBaseUrl).host : null,
    credentialsConfigured: Boolean(nz.clientId && nz.clientSecret),
    capabilities: SHIPPING_CAPABILITIES.map((capability) => {
      const missing = liveConfigurationGaps(capability)
      return { capability, liveReady: missing.length === 0, missing }
    }),
    token:
      probe && nz.clientId && nz.clientSecret ? await probeAccessToken() : null,
    shipments: {
      byStatus,
      failed: byStatus.FAILED ?? 0,
      awaitingPickup,
      flaggedUnscanned,
      lastTrackedAt: lastTracked._max.lastTrackedAt?.toISOString() ?? null,
    },
    calls: [day, week],
    lastReconciliation: lastRun
      ? {
          kind: lastRun.kind,
          outcome: lastRun.outcome,
          startedAt: lastRun.startedAt.toISOString(),
          finishedAt: lastRun.finishedAt?.toISOString() ?? null,
          examined: lastRun.examined,
          flagged: lastRun.flagged,
          outstanding: lastRun.outstanding,
          message: lastRun.message,
        }
      : null,
    settings: {
      trackingPollMinutes: nz.trackingPollMinutes,
      unscannedLabelDays: nz.unscannedLabelDays,
      flatRateConfigured: nz.fallbackRate.priceInclGst !== undefined,
      defaultServiceCode: nz.defaultServiceCode ?? null,
    },
  }
}

/**
 * One window of carrier call figures.
 *
 * The durations are read and ranked here rather than with PERCENTILE_CONT,
 * which SQL Server only offers as a window function over every row. A week of
 * NZ Post calls for one portal is thousands of integers — cheap to sort, and
 * the answer is exact.
 */
async function callWindow(
  window: IntegrationCallWindow['window'],
  since: Date
): Promise<IntegrationCallWindow> {
  const rows = await prisma.integrationCall.findMany({
    where: { provider: 'NZPOST', occurredAt: { gte: since } },
    select: {
      operation: true,
      outcome: true,
      durationMs: true,
      attempt: true,
      httpRetries: true,
      mode: true,
    },
  })

  const failed = rows.filter((row) => row.outcome === 'FAILED').length
  const durations = rows.map((row) => row.durationMs).sort((a, b) => a - b)
  const at = (fraction: number) =>
    durations[
      Math.min(durations.length - 1, Math.ceil(fraction * durations.length) - 1)
    ]

  const operations = new Map<
    string,
    { calls: number; failed: number; total: number }
  >()
  for (const row of rows) {
    const entry = operations.get(row.operation) ?? {
      calls: 0,
      failed: 0,
      total: 0,
    }
    entry.calls += 1
    entry.total += row.durationMs
    if (row.outcome === 'FAILED') entry.failed += 1
    operations.set(row.operation, entry)
  }

  return {
    window,
    calls: rows.length,
    succeeded: rows.length - failed,
    failed,
    successRatePercent:
      rows.length === 0
        ? null
        : Math.round(((rows.length - failed) / rows.length) * 1000) / 10,
    latencyMs:
      durations.length === 0
        ? null
        : {
            average: Math.round(
              durations.reduce((sum, value) => sum + value, 0) /
                durations.length
            ),
            p50: at(0.5),
            p95: at(0.95),
            max: durations[durations.length - 1],
          },
    retries: rows.reduce(
      (sum, row) => sum + (row.attempt > 1 ? 1 : 0) + row.httpRetries,
      0
    ),
    mockCalls: rows.filter((row) => row.mode === 'MOCK').length,
    byOperation: [...operations.entries()]
      .map(([operation, entry]) => ({
        operation,
        calls: entry.calls,
        failed: entry.failed,
        averageMs: Math.round(entry.total / entry.calls),
      }))
      .sort((a, b) => b.calls - a.calls),
  }
}
