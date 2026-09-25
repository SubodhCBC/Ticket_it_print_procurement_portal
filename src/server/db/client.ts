import { PrismaClient, type Prisma } from '@prisma/client'
import { getConfig } from '../config'
import { getCurrentAccountId } from '../context/request-context'

/**
 * Builds the connection string with pool and timeout settings applied.
 * Prisma reads all of these from the URL, so this is the only place that
 * decides how the process talks to SQL Server.
 *
 * Assembled by string rather than through `new URL()`. A SQL Server connection
 * string is semicolon-delimited key/value pairs after the host, not a URL with
 * a query string — `new URL()` throws `ERR_INVALID_URL` on one outright, so the
 * PostgreSQL version of this function would have failed before the first query.
 * `buildLegacyDatabaseUrl` has always done it this way for the same reason.
 *
 * Parameters already present in the configured string win: an operator who pins
 * `connectionLimit` in the secret manager means it.
 */
function buildDatabaseUrl(override?: string): string {
  const config = getConfig()
  const base = (override ?? config.database.url).replace(/;+$/, '')

  const existing = new Set(
    base
      .split(';')
      .slice(1) // the first segment is `sqlserver://host:port`
      .map((pair) => pair.split('=')[0]?.trim().toLowerCase())
      .filter((key): key is string => Boolean(key))
  )

  const defaults: Array<[string, string]> = [
    ['connectionLimit', String(config.database.poolSize)],
    ['poolTimeout', '10'],
    // SQL Server has no per-statement timeout in the connection string; the
    // socket timeout is what stops a runaway query holding an HTTP request
    // open. Seconds here, milliseconds in the config, hence the division.
    [
      'socketTimeout',
      String(Math.ceil(config.database.statementTimeoutMs / 1000)),
    ],
  ]

  const additions = defaults
    .filter(([key]) => !existing.has(key.toLowerCase()))
    .map(([key, value]) => `${key}=${value}`)

  return additions.length > 0 ? `${base};${additions.join(';')}` : base
}

function buildPrismaClientOptions(): Prisma.PrismaClientOptions {
  const config = getConfig()
  const log: Prisma.LogLevel[] = config.database.logQueries
    ? ['query', 'warn', 'error']
    : ['warn', 'error']

  return { datasources: { db: { url: buildDatabaseUrl() } }, log }
}

/**
 * One PrismaClient for the whole process, cached on `globalThis`.
 *
 * Next's dev server re-evaluates route modules on every edit. A module-scoped
 * `new PrismaClient()` would therefore open a fresh connection pool on each
 * hot reload and exhaust SQL Server's connection limit within a few minutes of
 * editing. Stashing it on the global object is the sanctioned way out: the
 * global survives the module reload, so the pool is created once.
 *
 * The NestJS service this replaces connected eagerly at boot so a bad
 * DATABASE_URL failed the deploy rather than the first request. There is no
 * equivalent hook here — the client connects lazily on first query, and a bad
 * URL surfaces as a 503 from the first request that touches the database.
 */
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient }

function createClient(): PrismaClient {
  return new PrismaClient(buildPrismaClientOptions())
}

/** The real client, made on first use and then kept. */
function client(): PrismaClient {
  if (!globalForPrisma.prisma) globalForPrisma.prisma = createClient()
  return globalForPrisma.prisma
}

/**
 * Deliberately a proxy rather than `new PrismaClient()` at module scope.
 *
 * `next build` imports every route module to collect its configuration, which
 * reaches this file, which would construct the client — and constructing it
 * reads DATABASE_URL. So the build demanded production database credentials
 * before it would produce a single page, and failed without them.
 *
 * That is the wrong shape. A build is a pure function of the source; needing a
 * live connection string to produce static output means the credentials have to
 * exist wherever the image is built, which is one more place for them to leak
 * and one more reason a CI runner cannot build without access to production.
 *
 * The proxy defers construction to the first property access, which is the
 * first actual query. `getConfig()` was already lazy for the same reason; this
 * is the last module that was undoing it.
 */
export const prisma: PrismaClient = new Proxy({} as PrismaClient, {
  get(_target, property, receiver) {
    return Reflect.get(client(), property, receiver) as unknown
  },
  // Prisma's own code reaches for these, and a proxy that only forwards `get`
  // reports the object as empty.
  has: (_target, property) => property in client(),
  ownKeys: () => Reflect.ownKeys(client()),
  getOwnPropertyDescriptor: (_target, property) =>
    Reflect.getOwnPropertyDescriptor(client(), property),
})

/** Cheap liveness probe used by the health route. */
export async function pingDatabase(): Promise<void> {
  await prisma.$queryRaw`SELECT 1`
}

// --- Row-Level Security tenant scoping --------------------------------------

/**
 * The SESSION_CONTEXT key every Row-Level Security predicate reads.
 * See prisma/migrations/20260907140000_row_level_security.
 */
export const TENANT_SESSION_VAR = 'app.current_account_id'

/**
 * The transaction the tenant was set in. The predicates honour the tenant only
 * inside that transaction — see migration 20260911100000 and the note in
 * `withTenantScope`.
 */
export const TENANT_TRANSACTION_VAR = 'app.current_tx'

/**
 * Applied to every tenant scope unless the caller says otherwise.
 *
 * Prisma's own default is five seconds, and order placement — a sequence
 * allocation, the lines, a stock reservation, approval routing, the timeline and
 * the basket, one round trip each — was measured at 5.2 seconds on a cold dev
 * server. A scope that times out is rolled back, so the cost of a longer ceiling
 * is only how long a genuinely stuck transaction holds its locks.
 */
const DEFAULT_SCOPE_OPTIONS = {
  maxWait: 5_000,
  timeout: 15_000,
} as const

/** Public account ids are prefixed, opaque strings — see createId(). */
const ACCOUNT_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/

/**
 * The client handed to an interactive transaction: no nested transactions, no
 * connection management.
 */
export type TransactionClient = Omit<
  PrismaClient,
  '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'
>

/**
 * The four isolation levels.
 *
 * Declared here rather than imported as `Prisma.TransactionIsolationLevel`
 * because that member only exists once `prisma generate` has produced the
 * client. Depending on it makes this file fail to type-check on a fresh clone —
 * and leaves the transaction callback inferred as `any`, which silently
 * disables type checking on every query inside a tenant scope.
 */
export type TransactionIsolationLevel =
  'ReadUncommitted' | 'ReadCommitted' | 'RepeatableRead' | 'Serializable'

export interface TenantScopeOptions {
  /** Milliseconds to wait for a connection from the pool. */
  readonly maxWait?: number
  /** Milliseconds the transaction may stay open before it is rolled back. */
  readonly timeout?: number
  readonly isolationLevel?: TransactionIsolationLevel
}

/**
 * Runs `fn` inside a transaction whose connection has the tenant id set, so
 * RLS policies filter every statement at the database level.
 *
 * The `SET LOCAL` must share a connection with the queries it protects, which
 * Prisma only guarantees inside an interactive transaction — hence the
 * transaction wrapper even for pure reads. This is the second line of defence;
 * the application-level scoping is the first.
 */
export async function withTenantScope<T>(
  accountId: string,
  fn: (tx: TransactionClient) => Promise<T>,
  options?: TenantScopeOptions
): Promise<T> {
  if (!ACCOUNT_ID_PATTERN.test(accountId)) {
    // The variable name is interpolated into set_config; the value is bound as
    // a parameter. Never let an unvalidated id near either.
    throw new Error(
      `Refusing to open a tenant scope for a malformed account id: ${accountId}`
    )
  }

  return prisma.$transaction(
    async (tx: TransactionClient): Promise<T> => {
      // -----------------------------------------------------------------------
      // The tenant is bound to this transaction, not to the connection
      // -----------------------------------------------------------------------
      // SESSION_CONTEXT belongs to the connection and survives commit and
      // rollback. Left set, the next request handed this pooled connection would
      // run its *unscoped* queries — login, provisioning, the cross-tenant
      // account list — filtered to whichever tenant used it last: a silent
      // wrong-answer bug, not a loud one.
      //
      // Clearing it in `finally` is not enough on its own. When a transaction
      // times out, Prisma refuses every further statement on it, the clear
      // included, and the connection goes back to the pool still carrying the
      // tenant. That was observed on 2026-09-11 when order placement exceeded
      // its timeout.
      //
      // So the transaction's own id is stored beside the tenant, and the RLS
      // predicate honours the tenant only while CURRENT_TRANSACTION_ID() still
      // matches. A value left behind by a finished transaction — committed,
      // rolled back or timed out — is inert: the next statement on that
      // connection runs in a different transaction and sees no tenant at all.
      // The clear below stays, as a second defence.
      //
      // One batch, so the two keys cannot be set half. The value is bound, never
      // interpolated; the keys are module constants.
      await tx.$executeRawUnsafe(
        `DECLARE @tx BIGINT = CURRENT_TRANSACTION_ID();
         EXEC sp_set_session_context @key = N'${TENANT_TRANSACTION_VAR}', @value = @tx;
         EXEC sp_set_session_context @key = N'${TENANT_SESSION_VAR}', @value = @P1;`,
        accountId
      )

      try {
        return await fn(tx)
      } finally {
        await clearTenantScope(tx)
      }
    },
    { ...DEFAULT_SCOPE_OPTIONS, ...options }
  )
}

/**
 * Resets the connection's tenant, tolerating a transaction that has already
 * failed.
 *
 * When `fn` threw, the transaction may be doomed and this statement will throw
 * too. That must not replace the original error — the caller needs to know what
 * actually went wrong — so the failure is logged and swallowed. It is no longer
 * a leak when it happens: the value left behind is bound to a transaction that
 * has ended, and the predicates ignore it.
 */
async function clearTenantScope(tx: TransactionClient): Promise<void> {
  try {
    await tx.$executeRawUnsafe(
      `EXEC sp_set_session_context @key = N'${TENANT_SESSION_VAR}', @value = NULL;
       EXEC sp_set_session_context @key = N'${TENANT_TRANSACTION_VAR}', @value = NULL;`
    )
  } catch (error) {
    console.warn(
      'Could not clear the tenant from SESSION_CONTEXT, usually because the ' +
        'transaction had already ended. The value left behind is bound to that ' +
        'transaction and is ignored by the RLS predicates. ' +
        (error instanceof Error ? error.message : String(error))
    )
  }
}

/**
 * Convenience wrapper that reads the tenant from the ambient request context.
 * Throws rather than silently running unscoped — an unscoped query in a
 * tenant-owned code path is a security bug, not a fallback.
 */
export async function withCurrentTenantScope<T>(
  fn: (tx: TransactionClient) => Promise<T>,
  options?: TenantScopeOptions
): Promise<T> {
  const accountId = getCurrentAccountId()
  if (!accountId) {
    throw new Error(
      'withCurrentTenantScope called without an authenticated account in context'
    )
  }
  return withTenantScope(accountId, fn, options)
}
