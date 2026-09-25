import { z } from 'zod'

/**
 * Server-side configuration, read from the environment.
 *
 * Two deliberate differences from the NestJS service this was ported from:
 *
 *  1. Validation is **lazy**. The API validated everything at boot and refused
 *     to start on a bad value, which is right for a long-running process. Next
 *     imports every route module during `next build`, so validating at module
 *     scope would make a production build require a live `.env` — and fail on
 *     CI, where there is none. `getConfig()` is called inside handlers instead,
 *     so a misconfiguration surfaces on the first request rather than at build.
 *  2. Only the identity and database groups are **required**. The rest carry
 *     defaults so that a developer who only wants to run login does not have to
 *     invent an S3 endpoint first; each optional integration reports its own
 *     missing variable when it is actually used.
 *
 * The variable names are unchanged from the API, so an existing `.env` works
 * as-is.
 */

const bool = (fallback: boolean) =>
  z
    .enum(['true', 'false', '1', '0'])
    .optional()
    .transform((value) =>
      value === undefined ? fallback : value === 'true' || value === '1'
    )

const int = (fallback: number) =>
  z.coerce.number().int().optional().default(fallback)

const csv = z
  .string()
  .optional()
  .transform((value) =>
    (value ?? '')
      .split(',')
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0)
  )

const durationPattern = /^\d+(ms|s|m|h|d)$/

/**
 * An optional free-text value where an empty assignment means "not set".
 *
 * `.env.example` lists every NZ Post variable with an empty value so an operator
 * can see what exists, and `NZPOST_SITE_CODE=` must read as absent rather than
 * as a site code that is the empty string.
 */
const text = z
  .string()
  .optional()
  .transform((value) => {
    const trimmed = value?.trim()
    return trimmed ? trimmed : undefined
  })

/** A base path that falls back to `fallback` when unset or assigned empty. */
const pathOr = (fallback: string) =>
  text.transform((value) => value ?? fallback)

/** `LxWxH` in centimetres, e.g. `30x20x10`. */
const parcelCm = z
  .string()
  .regex(/^\d+(\.\d+)?x\d+(\.\d+)?x\d+(\.\d+)?$/, 'Expected LxWxH in cm')
  .default('30x20x10')
  .transform((value) => {
    const [length, width, height] = value.split('x').map(Number)
    return { length: length ?? 30, width: width ?? 20, height: height ?? 10 }
  })

const envSchema = z.object({
  APP_NAME: z.string().min(1).default('ticketit-portal'),
  APP_ENV: z
    .enum(['development', 'staging', 'production', 'test'])
    .default('development'),
  API_PREFIX: z.string().default('api'),
  API_VERSION: z.string().default('1'),
  GIT_SHA: z.string().default('unknown'),
  PORTAL_BASE_URL: z.string().url().default('http://localhost:3000'),

  // --- required -------------------------------------------------------------
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  JWT_ACCESS_SECRET: z
    .string()
    .min(32, 'JWT_ACCESS_SECRET must be at least 32 characters'),
  JWT_REFRESH_SECRET: z
    .string()
    .min(32, 'JWT_REFRESH_SECRET must be at least 32 characters'),

  DATABASE_POOL_SIZE: int(10),
  DATABASE_STATEMENT_TIMEOUT_MS: int(15000),
  DATABASE_LOG_QUERIES: bool(false),

  /**
   * The Ticket-IT API — origin only, no trailing path. Every user who exists
   * upstream is authenticated against it; see auth.service.ts.
   */
  TICKETIT_API_BASE_URL: z.string().url().optional(),
  TICKETIT_API_TIMEOUT_MS: int(15000),
  TICKETIT_AUTH_ENABLED: bool(true),

  /**
   * The document library — Ticket-IT's ImageManagement API, called with the
   * signed-in user's own Ticket-IT token. It has no endpoint or credentials of
   * its own, so this is only the switch. See dam.service.ts.
   */
  DAM_ENABLED: bool(false),

  /**
   * Which multipart field `ImageManagement/UploadImage` reads the files from.
   *
   * Its OpenAPI document declares both `imageFile` and `imageFiles`, gives
   * neither as required, and types no response, so there is no way to tell from
   * the outside which one the controller binds. Sending both risks storing every
   * file twice; sending the wrong one is a 200 that uploads nothing. So it is a
   * setting: if uploads report success and the folder stays empty, flip this.
   */
  DAM_UPLOAD_FILE_FIELD: z
    .enum(['imageFiles', 'imageFile'])
    .default('imageFiles'),

  /**
   * How long to give one upload, in milliseconds.
   *
   * Separate from TICKETIT_API_TIMEOUT_MS, which is sized for small JSON calls:
   * 60MB over a slow link takes far longer than 15 seconds and must not be cut
   * off halfway.
   */
  DAM_UPLOAD_TIMEOUT_MS: int(120000),

  /**
   * The biggest single file the library will take, and the biggest the portal
   * will copy back out, in megabytes.
   *
   * A memory setting, not a policy: both paths buffer the whole file in this
   * process, so the ceiling is what the container can survive with several
   * uploads in flight. 100MB covers a packaged InDesign job; a deployment with
   * a small memory limit should lower it, and one that regularly moves
   * print-resolution PDFs can raise it after watching the pod.
   */
  DAM_UPLOAD_MAX_FILE_MB: int(100),
  DAM_COPY_MAX_MB: int(100),

  /**
   * The portal's own Ticket-IT login, for template and product artwork.
   *
   * Those files are the operator's rather than any tenant's, and an admin who
   * signed in as a portal-native user has no Ticket-IT token of their own. Every
   * /api/v1/dam route still runs on the caller's own token — see
   * `dam/dam-service-account.ts` for the boundary. Without these, attaching an
   * asset from the library answers 503.
   */
  DAM_SERVICE_LOGIN: text,
  DAM_SERVICE_PASSWORD: text,

  /**
   * NZ Post shipping (SOW §7). See `shipping/nzpost/` and `.env.example`.
   *
   * `mock` answers every call from an in-process fake and makes a PDF marked
   * as not a real label, so the whole flow can be exercised without touching
   * the client's NZ Post account. `live` calls NZ Post. Unset, it is `mock`
   * everywhere except production, where it is `disabled`: a production portal
   * printing fake labels is worse than one that says shipping is off.
   */
  NZPOST_MODE: z.enum(['disabled', 'mock', 'live']).optional(),
  NZPOST_CLIENT_ID: text,
  NZPOST_CLIENT_SECRET: text,
  NZPOST_OAUTH_URL: z
    .string()
    .url()
    .default('https://oauth.nzpost.co.nz/as/token.oauth2'),
  /**
   * Origin of the NZ Post instance the credentials were issued for. No default,
   * so live mode cannot reach production by accident. NZ Post documents two:
   * `https://api.uat.nzpost.co.nz` for integration testing and
   * `https://api.nzpost.co.nz`, available only after their go-live checklist.
   */
  NZPOST_API_BASE_URL: text.refine(
    (value) => value === undefined || URL.canParse(value),
    'Expected an origin such as https://api.uat.nzpost.co.nz'
  ),
  // Base paths. Empty means the default, which is NZ Post's documented path —
  // an empty assignment must not become "/".
  NZPOST_PARCELADDRESS_PATH: pathOr('/parceladdress/2.0'),
  NZPOST_SHIPPINGOPTIONS_PATH: pathOr('/shippingoptions/2.0'),
  NZPOST_PARCELLABEL_PATH: pathOr('/parcellabel/v3'),
  NZPOST_COLLECTIONADDRESS_PATH: pathOr('/collectionaddress/v1'),
  NZPOST_PARCELPICKUP_PATH: pathOr('/parcelpickup/v3'),
  NZPOST_PARCELTRACK_PATH: pathOr('/parceltrack/3.0'),
  NZPOST_TIMEOUT_MS: int(15000),
  NZPOST_ACCOUNT_NUMBER: text,
  NZPOST_SITE_CODE: text,
  NZPOST_USER_NAME: text,
  // Ship-from (decision D3: one warehouse, configured here).
  NZPOST_SENDER_NAME: text,
  NZPOST_SENDER_COMPANY: text,
  NZPOST_SENDER_PHONE: text,
  NZPOST_SENDER_EMAIL: text,
  NZPOST_PICKUP_BUILDING: text,
  NZPOST_PICKUP_UNIT_TYPE: text,
  NZPOST_PICKUP_UNIT_VALUE: text,
  NZPOST_PICKUP_FLOOR: text,
  NZPOST_PICKUP_STREET_NUMBER: text,
  NZPOST_PICKUP_STREET: text,
  NZPOST_PICKUP_SUBURB: text,
  NZPOST_PICKUP_CITY: text,
  NZPOST_PICKUP_POSTCODE: text,
  NZPOST_PICKUP_INSTRUCTIONS: text,
  NZPOST_DEFAULT_SERVICE_CODE: text,
  NZPOST_DEFAULT_PARCEL_CM: parcelCm,
  /** Shown at checkout when live rates cannot be had (SOW §7.2). Incl. GST. */
  NZPOST_FALLBACK_RATE_INCL_GST: z
    .string()
    .optional()
    .transform((value) => (value?.trim() ? value.trim() : undefined))
    .refine(
      (value) => value === undefined || /^\d+(\.\d{1,2})?$/.test(value),
      'Expected an amount such as 12.50'
    ),
  NZPOST_FALLBACK_SERVICE_CODE: z.string().default('CPOLP'),
  NZPOST_FALLBACK_SERVICE_NAME: z
    .string()
    .default('Standard courier (flat rate)'),
  NZPOST_TRACKING_POLL_MINUTES: int(180),
  NZPOST_UNSCANNED_LABEL_DAYS: int(7),

  /**
   * How long a delivery address typed at checkout (SOW F-18) is kept once nothing
   * uses it — no basket and no order — before the daily maintenance job removes
   * it. Long enough for a buyer who switched back to a saved address to change
   * their mind; see `maintenance/one-off-addresses.ts`.
   */
  ONE_OFF_ADDRESS_RETENTION_DAYS: int(30),

  JWT_ACCESS_TTL: z.string().regex(durationPattern).default('15m'),
  JWT_REFRESH_TTL: z.string().regex(durationPattern).default('30d'),
  PASSWORD_HASH_MEMORY_COST: int(19456),
  PASSWORD_HASH_TIME_COST: int(2),
  INVITATION_TTL_HOURS: int(72),
  PASSWORD_RESET_TTL_MINUTES: int(60),

  REDIS_URL: z.string().optional(),
  REDIS_KEY_PREFIX: z.string().default('ticketit:'),
  CACHE_TTL_SECONDS: int(300),

  /**
   * Namespaces every BullMQ key, so several environments can share one Redis
   * without draining each other's queues. Separate from REDIS_KEY_PREFIX: the
   * cache and the queues are namespaced independently because a cache prefix is
   * safe to change at any time and a queue prefix is not — changing it strands
   * whatever is still on the old one.
   */
  QUEUE_PREFIX: z.string().default('ticketit'),

  /**
   * Worker concurrency, per queue. Read here rather than fixed in code because
   * the worker is a separate process whose sizing depends on the box it runs
   * on. The defaults are the ones the NestJS processors used.
   *
   * Imports are serial on purpose: an import is a long run of writes keyed on
   * SKU, and two runs of the same file in parallel would have the second report
   * as skipped what the first had just created — which reads as data loss to
   * whoever uploaded it.
   *
   * Renders stay low because image decoding is memory-hungry, and a high
   * setting is how a worker gets itself killed by the OOM reaper.
   */
  WORKER_EMAIL_CONCURRENCY: int(5),
  WORKER_IMPORT_CONCURRENCY: int(1),
  WORKER_RENDER_CONCURRENCY: int(2),
  /**
   * Label, tracking and reconciliation jobs. Low: every one of them is a call to
   * NZ Post, and the Testing SLA tier is 100 requests a second across the whole
   * application, token requests included.
   */
  WORKER_SHIPPING_CONCURRENCY: int(2),

  S3_ENDPOINT: z.string().optional(),
  S3_REGION: z.string().default('us-east-1'),
  S3_BUCKET: z.string().optional(),
  S3_ACCESS_KEY_ID: z.string().optional(),
  S3_SECRET_ACCESS_KEY: z.string().optional(),
  S3_FORCE_PATH_STYLE: bool(true),
  S3_PUBLIC_BASE_URL: z.string().optional(),
  S3_PRESIGN_EXPIRY_SECONDS: int(900),

  MAIL_TRANSPORT: z.enum(['smtp', 'console']).default('console'),
  SMTP_HOST: z.string().default('localhost'),
  SMTP_PORT: int(1025),
  SMTP_USER: z.string().optional(),
  SMTP_PASSWORD: z.string().optional(),
  SMTP_SECURE: bool(false),
  MAIL_FROM_ADDRESS: z.string().default('no-reply@ticketit.local'),
  MAIL_FROM_NAME: z.string().default('Print Procurement Portal'),

  CORS_ORIGINS: csv,
  TRUST_PROXY: bool(false),
  RATE_LIMIT_TTL_SECONDS: int(60),
  RATE_LIMIT_MAX: int(120),
  RATE_LIMIT_AUTH_MAX: int(10),

  LOG_LEVEL: z
    .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace'])
    .default('info'),

  /** Swagger UI and the OpenAPI document at /api/docs. Always off in production. */
  SWAGGER_ENABLED: bool(true),
})

export type RawEnv = z.infer<typeof envSchema>

export interface AppConfig {
  readonly app: {
    readonly name: string
    readonly env: RawEnv['APP_ENV']
    readonly isProduction: boolean
    readonly isDevelopment: boolean
    readonly globalPrefix: string
    readonly apiVersion: string
    readonly release: string
    /** Public address of the portal; the base of every emailed link. */
    readonly portalBaseUrl: string
  }
  readonly database: {
    readonly url: string
    readonly poolSize: number
    readonly statementTimeoutMs: number
    readonly logQueries: boolean
  }
  /**
   * The upstream Ticket-IT API. It owns the credentials and the profiles of
   * every user the portal did not invite itself.
   */
  readonly ticketItApi: {
    readonly baseUrl?: string
    readonly timeoutMs: number
    /**
     * When false, only portal-native users can sign in. Exists so a deployment
     * with no reachable Ticket-IT — a test environment, a local checkout — fails
     * fast and legibly instead of timing out on every login attempt.
     */
    readonly authEnabled: boolean
  }
  /** The document library, reached through Ticket-IT's ImageManagement API. */
  readonly dam: {
    /**
     * Whether the library routes answer at all. They also need a Ticket-IT base
     * URL and Redis, which hold the user's token; dam.service.ts checks both.
     */
    readonly enabled: boolean
    readonly upload: {
      /** The multipart field name `UploadImage` binds the files from. */
      readonly fileField: 'imageFiles' | 'imageFile'
      readonly timeoutMs: number
      /** Per-file ceiling for an upload into the library. */
      readonly maxFileMb: number
    }
    /** Per-file ceiling for a copy out of the library into object storage. */
    readonly copyMaxMb: number
    /** The portal's own library login, for operator-owned artwork only. */
    readonly serviceAccount: {
      readonly login?: string
      readonly password?: string
    }
  }
  /** NZ Post shipping. `shipping/nzpost/nzpost.settings.ts` reads this. */
  readonly nzPost: {
    readonly mode: 'disabled' | 'mock' | 'live'
    readonly clientId?: string
    readonly clientSecret?: string
    readonly oauthUrl: string
    readonly apiBaseUrl?: string
    readonly paths: {
      readonly parcelAddress: string
      readonly shippingOptions: string
      readonly parcelLabel: string
      readonly collectionAddress: string
      readonly parcelPickup: string
      readonly parcelTrack: string
    }
    readonly timeoutMs: number
    readonly accountNumber?: string
    readonly siteCode?: string
    readonly userName?: string
    readonly sender: {
      readonly name?: string
      readonly company?: string
      readonly phone?: string
      readonly email?: string
    }
    readonly pickupAddress: {
      readonly buildingName?: string
      readonly unitType?: string
      readonly unitValue?: string
      readonly floor?: string
      readonly streetNumber?: string
      readonly street?: string
      readonly suburb?: string
      readonly city?: string
      readonly postcode?: string
      readonly instructions?: string
    }
    readonly defaultServiceCode?: string
    readonly defaultParcelCm: {
      readonly length: number
      readonly width: number
      readonly height: number
    }
    readonly fallbackRate: {
      /** Incl. GST. Undefined means there is no fallback to offer. */
      readonly priceInclGst?: string
      readonly serviceCode: string
      readonly serviceName: string
    }
    readonly trackingPollMinutes: number
    readonly unscannedLabelDays: number
  }
  readonly redis: {
    readonly url?: string
    readonly keyPrefix: string
    readonly queuePrefix: string
  }
  readonly worker: {
    readonly emailConcurrency: number
    readonly importConcurrency: number
    readonly renderConcurrency: number
    readonly shippingConcurrency: number
  }
  readonly cache: { readonly ttlSeconds: number }
  readonly maintenance: {
    /** Days an unused one-off delivery address is kept. At least one. */
    readonly oneOffAddressRetentionDays: number
  }
  readonly storage: {
    readonly endpoint?: string
    readonly region: string
    readonly bucket?: string
    readonly accessKeyId?: string
    readonly secretAccessKey?: string
    readonly forcePathStyle: boolean
    readonly publicBaseUrl?: string
    readonly presignExpirySeconds: number
  }
  readonly auth: {
    readonly accessSecret: string
    readonly accessTtl: string
    readonly refreshSecret: string
    readonly refreshTtl: string
    readonly passwordHash: {
      readonly memoryCost: number
      readonly timeCost: number
    }
    readonly invitationTtlHours: number
    readonly passwordResetTtlMinutes: number
  }
  readonly security: {
    readonly corsOrigins: readonly string[]
    readonly trustProxy: boolean
    readonly rateLimit: {
      readonly ttlSeconds: number
      readonly max: number
      readonly authMax: number
    }
  }
  readonly mail: {
    readonly transport: RawEnv['MAIL_TRANSPORT']
    readonly host: string
    readonly port: number
    readonly user?: string
    readonly password?: string
    readonly secure: boolean
    readonly fromAddress: string
    readonly fromName: string
  }
  readonly observability: { readonly logLevel: RawEnv['LOG_LEVEL'] }
  readonly docs: {
    /**
     * Whether /api/docs serves anything. Forced off in production whatever
     * SWAGGER_ENABLED says: the document lists every route and the permission
     * it takes, which is a map worth not publishing.
     */
    readonly enabled: boolean
  }
}

export class ConfigValidationError extends Error {
  constructor(public readonly issues: readonly string[]) {
    super(
      [
        'Invalid environment configuration.',
        ...issues.map((issue) => `  - ${issue}`),
        '',
        'Compare your .env against .env.example.',
      ].join('\n')
    )
    this.name = 'ConfigValidationError'
  }
}

function toAppConfig(env: RawEnv): AppConfig {
  return {
    app: {
      name: env.APP_NAME,
      env: env.APP_ENV,
      isProduction: env.APP_ENV === 'production',
      isDevelopment: env.APP_ENV === 'development',
      globalPrefix: env.API_PREFIX,
      apiVersion: env.API_VERSION,
      release: env.GIT_SHA,
      portalBaseUrl: env.PORTAL_BASE_URL.replace(/\/+$/, ''),
    },
    database: {
      url: env.DATABASE_URL,
      poolSize: env.DATABASE_POOL_SIZE,
      statementTimeoutMs: env.DATABASE_STATEMENT_TIMEOUT_MS,
      logQueries: env.DATABASE_LOG_QUERIES,
    },
    ticketItApi: {
      // Trailing slashes are stripped so callers can concatenate a path that
      // starts with one without producing a double slash.
      baseUrl: env.TICKETIT_API_BASE_URL?.replace(/\/+$/, ''),
      timeoutMs: env.TICKETIT_API_TIMEOUT_MS,
      // A base URL is what actually makes the path usable; the flag can only
      // turn it off, never on without one.
      authEnabled:
        env.TICKETIT_AUTH_ENABLED && Boolean(env.TICKETIT_API_BASE_URL),
    },
    dam: {
      enabled: env.DAM_ENABLED,
      upload: {
        fileField: env.DAM_UPLOAD_FILE_FIELD,
        timeoutMs: env.DAM_UPLOAD_TIMEOUT_MS,
        maxFileMb: env.DAM_UPLOAD_MAX_FILE_MB,
      },
      copyMaxMb: env.DAM_COPY_MAX_MB,
      serviceAccount: {
        login: env.DAM_SERVICE_LOGIN,
        password: env.DAM_SERVICE_PASSWORD,
      },
    },
    nzPost: {
      mode:
        env.NZPOST_MODE ?? (env.APP_ENV === 'production' ? 'disabled' : 'mock'),
      clientId: env.NZPOST_CLIENT_ID,
      clientSecret: env.NZPOST_CLIENT_SECRET,
      oauthUrl: env.NZPOST_OAUTH_URL,
      apiBaseUrl: env.NZPOST_API_BASE_URL?.replace(/\/+$/, ''),
      paths: {
        parcelAddress: normalisePath(env.NZPOST_PARCELADDRESS_PATH),
        shippingOptions: normalisePath(env.NZPOST_SHIPPINGOPTIONS_PATH),
        parcelLabel: normalisePath(env.NZPOST_PARCELLABEL_PATH),
        collectionAddress: normalisePath(env.NZPOST_COLLECTIONADDRESS_PATH),
        parcelPickup: normalisePath(env.NZPOST_PARCELPICKUP_PATH),
        parcelTrack: normalisePath(env.NZPOST_PARCELTRACK_PATH),
      },
      timeoutMs: env.NZPOST_TIMEOUT_MS,
      accountNumber: env.NZPOST_ACCOUNT_NUMBER,
      siteCode: env.NZPOST_SITE_CODE,
      userName: env.NZPOST_USER_NAME,
      sender: {
        name: env.NZPOST_SENDER_NAME,
        company: env.NZPOST_SENDER_COMPANY,
        phone: env.NZPOST_SENDER_PHONE,
        email: env.NZPOST_SENDER_EMAIL,
      },
      pickupAddress: {
        buildingName: env.NZPOST_PICKUP_BUILDING,
        unitType: env.NZPOST_PICKUP_UNIT_TYPE,
        unitValue: env.NZPOST_PICKUP_UNIT_VALUE,
        floor: env.NZPOST_PICKUP_FLOOR,
        streetNumber: env.NZPOST_PICKUP_STREET_NUMBER,
        street: env.NZPOST_PICKUP_STREET,
        suburb: env.NZPOST_PICKUP_SUBURB,
        city: env.NZPOST_PICKUP_CITY,
        postcode: env.NZPOST_PICKUP_POSTCODE,
        instructions: env.NZPOST_PICKUP_INSTRUCTIONS,
      },
      defaultServiceCode: env.NZPOST_DEFAULT_SERVICE_CODE,
      defaultParcelCm: env.NZPOST_DEFAULT_PARCEL_CM,
      fallbackRate: {
        priceInclGst: env.NZPOST_FALLBACK_RATE_INCL_GST,
        serviceCode: env.NZPOST_FALLBACK_SERVICE_CODE,
        serviceName: env.NZPOST_FALLBACK_SERVICE_NAME,
      },
      trackingPollMinutes: Math.max(15, env.NZPOST_TRACKING_POLL_MINUTES),
      unscannedLabelDays: Math.max(1, env.NZPOST_UNSCANNED_LABEL_DAYS),
    },
    redis: {
      url: env.REDIS_URL,
      keyPrefix: env.REDIS_KEY_PREFIX,
      queuePrefix: env.QUEUE_PREFIX,
    },
    worker: {
      emailConcurrency: env.WORKER_EMAIL_CONCURRENCY,
      importConcurrency: env.WORKER_IMPORT_CONCURRENCY,
      renderConcurrency: env.WORKER_RENDER_CONCURRENCY,
      shippingConcurrency: env.WORKER_SHIPPING_CONCURRENCY,
    },
    cache: { ttlSeconds: env.CACHE_TTL_SECONDS },
    maintenance: {
      oneOffAddressRetentionDays: Math.max(
        1,
        env.ONE_OFF_ADDRESS_RETENTION_DAYS
      ),
    },
    storage: {
      endpoint: env.S3_ENDPOINT,
      region: env.S3_REGION,
      bucket: env.S3_BUCKET,
      accessKeyId: env.S3_ACCESS_KEY_ID,
      secretAccessKey: env.S3_SECRET_ACCESS_KEY,
      forcePathStyle: env.S3_FORCE_PATH_STYLE,
      publicBaseUrl: env.S3_PUBLIC_BASE_URL,
      presignExpirySeconds: env.S3_PRESIGN_EXPIRY_SECONDS,
    },
    auth: {
      accessSecret: env.JWT_ACCESS_SECRET,
      accessTtl: env.JWT_ACCESS_TTL,
      refreshSecret: env.JWT_REFRESH_SECRET,
      refreshTtl: env.JWT_REFRESH_TTL,
      passwordHash: {
        memoryCost: env.PASSWORD_HASH_MEMORY_COST,
        timeCost: env.PASSWORD_HASH_TIME_COST,
      },
      invitationTtlHours: env.INVITATION_TTL_HOURS,
      passwordResetTtlMinutes: env.PASSWORD_RESET_TTL_MINUTES,
    },
    security: {
      corsOrigins: env.CORS_ORIGINS,
      trustProxy: env.TRUST_PROXY,
      rateLimit: {
        ttlSeconds: env.RATE_LIMIT_TTL_SECONDS,
        max: env.RATE_LIMIT_MAX,
        authMax: env.RATE_LIMIT_AUTH_MAX,
      },
    },
    mail: {
      transport: env.MAIL_TRANSPORT,
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      user: env.SMTP_USER,
      password: env.SMTP_PASSWORD,
      secure: env.SMTP_SECURE,
      fromAddress: env.MAIL_FROM_ADDRESS,
      fromName: env.MAIL_FROM_NAME,
    },
    observability: { logLevel: env.LOG_LEVEL },
    docs: {
      enabled: env.SWAGGER_ENABLED && env.APP_ENV !== 'production',
    },
  }
}

/** `parcellabel/v3/` and `/parcellabel/v3` both become `/parcellabel/v3`. */
function normalisePath(path: string): string {
  const trimmed = path.trim().replace(/\/+$/, '')
  return trimmed.startsWith('/') ? trimmed : `/${trimmed}`
}

/**
 * Parses and validates the environment. Every consumer goes through here, so a
 * misconfigured deploy reports every problem at once instead of a null-pointer
 * three hours later.
 */
export function parseConfig(
  source: NodeJS.ProcessEnv = process.env
): AppConfig {
  const result = envSchema.safeParse(source)

  if (!result.success) {
    throw new ConfigValidationError(
      result.error.issues.map(
        (issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`
      )
    )
  }

  return toAppConfig(result.data)
}

let cached: AppConfig | undefined

/** Cached singleton — the environment cannot change mid-process. */
export function getConfig(): AppConfig {
  if (!cached) cached = parseConfig(process.env)
  return cached
}

/** Test-only escape hatch so a spec can exercise a different environment. */
export function resetConfigCache(): void {
  cached = undefined
}
