import { Readable } from 'node:stream'
import {
  CopyObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
  type PutObjectCommandInput,
} from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { getConfig } from '../config'
import { DependencyUnavailableError, NotFoundError } from '../utils/errors'

/**
 * Logical groupings inside the bucket.
 *
 * One bucket with key prefixes rather than a bucket per concern: lifecycle
 * rules, replication and access policies are configured once, and a new kind of
 * artefact does not need a Terraform change before anyone can store one.
 *
 * Every key produced by this module starts with one of these, so an object's
 * purpose is readable from its key alone in a console or an access log.
 */
export const StoragePrefix = {
  /** Customer-supplied artwork and uploaded product imagery. */
  ARTWORK: 'artwork',
  /** Print-ready PDFs produced by the render queue. */
  RENDER: 'render',
  /** Generated invoices. */
  INVOICE: 'invoice',
  /** CSV/XLSX report exports, expected to be lifecycle-expired. */
  EXPORT: 'export',
  /** Documents proxied from, or staged for, the DAM. */
  DOCUMENT: 'document',
  /** NZ Post shipping labels, as NZ Post returned them. */
  SHIPPING_LABEL: 'shipping-label',
} as const

export type StoragePrefix = (typeof StoragePrefix)[keyof typeof StoragePrefix]

export interface PutObjectOptions {
  readonly contentType?: string
  /** Filename the browser should use when the object is downloaded. */
  readonly downloadFilename?: string
  /** Small, non-sensitive key/value pairs stored alongside the object. */
  readonly metadata?: Record<string, string>
  /** `private` unless a value is given. Only set `public-read` deliberately. */
  readonly acl?: PutObjectCommandInput['ACL']
}

export interface StoredObject {
  readonly key: string
  readonly size: number
  readonly contentType?: string
}

/**
 * Object storage. S3 in every environment — MinIO locally, the real thing in
 * staging and production, which is why `forcePathStyle` is configurable.
 *
 * Objects are private by default and reached through short-lived presigned
 * URLs. The alternative — streaming every artwork download through this
 * process — would put a print-resolution PDF through the Node event loop for no
 * gain, and the alternative to *that*, a public bucket, would make every
 * customer's artwork readable by anyone who could guess a key.
 */

/**
 * The storage settings, having checked they are actually present.
 *
 * They are optional in `config.ts` so a developer running only the login flow
 * does not have to invent an S3 endpoint first. Reaching storage without them
 * is an operator error, and it names the missing variables rather than failing
 * later inside the SDK with a credentials error that says nothing useful.
 */
function requireStorageConfig() {
  const { storage } = getConfig()

  const missing = (
    [
      ['S3_ENDPOINT', storage.endpoint],
      ['S3_BUCKET', storage.bucket],
      ['S3_ACCESS_KEY_ID', storage.accessKeyId],
      ['S3_SECRET_ACCESS_KEY', storage.secretAccessKey],
    ] as const
  )
    .filter(([, value]) => !value)
    .map(([name]) => name)

  if (missing.length > 0) {
    throw new DependencyUnavailableError('Object storage', {
      details: { missingConfiguration: missing },
    })
  }

  return storage as typeof storage & {
    endpoint: string
    bucket: string
    accessKeyId: string
    secretAccessKey: string
  }
}

/**
 * Built on first use and cached on `globalThis`, for the two reasons everything
 * else in `db/` is: a storage outage must not delay startup, and Next's dev
 * server re-evaluates modules on every edit, which would otherwise leak a
 * client and its socket pool per reload.
 */
const globalForS3 = globalThis as unknown as { s3?: S3Client }

function getClient(): S3Client {
  if (globalForS3.s3) return globalForS3.s3

  const storage = requireStorageConfig()

  globalForS3.s3 = new S3Client({
    endpoint: storage.endpoint,
    region: storage.region,
    // MinIO serves buckets as a path segment; AWS serves them as a subdomain.
    forcePathStyle: storage.forcePathStyle,
    credentials: {
      accessKeyId: storage.accessKeyId,
      secretAccessKey: storage.secretAccessKey,
    },
  })

  return globalForS3.s3
}

function bucket(): string {
  return requireStorageConfig().bucket
}

/**
 * Builds a tenant-scoped object key.
 *
 * The account id is the first path segment after the prefix, so a bucket policy
 * or a lifecycle rule can be written per tenant, and so a listing scoped to one
 * customer is a prefix query rather than a filter. `name` is sanitised because
 * it frequently originates in a user-supplied filename.
 */
export function buildKey(
  prefix: StoragePrefix,
  accountId: string,
  name: string
): string {
  const safeName = name
    .replace(/[^A-Za-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 180)

  if (safeName.length === 0) {
    throw new Error(
      'Refusing to build an object key from a name with no usable characters'
    )
  }
  return `${prefix}/${accountId}/${safeName}`
}

export async function put(
  key: string,
  body: Buffer | Readable | string,
  options: PutObjectOptions = {}
): Promise<StoredObject> {
  try {
    await getClient().send(
      new PutObjectCommand({
        Bucket: bucket(),
        Key: key,
        Body: body,
        ...(options.contentType ? { ContentType: options.contentType } : {}),
        ...(options.downloadFilename
          ? { ContentDisposition: contentDisposition(options.downloadFilename) }
          : {}),
        ...(options.metadata ? { Metadata: options.metadata } : {}),
        ...(options.acl ? { ACL: options.acl } : {}),
      })
    )
  } catch (error) {
    if (error instanceof DependencyUnavailableError) throw error
    throw new DependencyUnavailableError('Object storage', { cause: error })
  }

  const size = Buffer.isBuffer(body) ? body.byteLength : 0

  return {
    key,
    size,
    ...(options.contentType ? { contentType: options.contentType } : {}),
  }
}

/**
 * A time-limited URL the client fetches directly.
 *
 * The expiry is deliberately short (S3_PRESIGN_EXPIRY_SECONDS, 15 minutes by
 * default): a presigned URL is a bearer credential, and one pasted into a chat
 * or an email should stop working before it is forwarded onwards.
 */
export async function presignDownload(
  key: string,
  downloadFilename?: string
): Promise<string> {
  try {
    return await getSignedUrl(
      getClient(),
      new GetObjectCommand({
        Bucket: bucket(),
        Key: key,
        ...(downloadFilename
          ? { ResponseContentDisposition: contentDisposition(downloadFilename) }
          : {}),
      }),
      { expiresIn: getConfig().storage.presignExpirySeconds }
    )
  } catch (error) {
    if (error instanceof DependencyUnavailableError) throw error
    throw new DependencyUnavailableError('Object storage', { cause: error })
  }
}

/*
 * There is deliberately no `presignUpload`.
 *
 * Nothing uploads into this bucket from a browser any more. Catalogue and
 * template artwork comes from the document library and is copied in by
 * `dam.service.readOperatorDamFile`, which means the key is always built here
 * from the product or template it belongs to. A presigned PUT is a bearer
 * credential for a write, and reintroducing one would hand back the ability to
 * choose where an upload lands.
 *
 * Objects this process writes go through `put()`; shipping labels are the other
 * caller.
 */

/** Streams an object back. Prefer presignDownload() for anything large. */
export async function getStream(key: string): Promise<Readable> {
  try {
    const result = await getClient().send(
      new GetObjectCommand({ Bucket: bucket(), Key: key })
    )

    if (!(result.Body instanceof Readable)) {
      throw new Error(`Object ${key} did not come back as a readable stream`)
    }
    return result.Body
  } catch (error) {
    if (error instanceof DependencyUnavailableError) throw error
    if (isNotFound(error)) throw new NotFoundError('Object')
    throw new DependencyUnavailableError('Object storage', { cause: error })
  }
}

export async function exists(key: string): Promise<boolean> {
  try {
    await getClient().send(
      new HeadObjectCommand({ Bucket: bucket(), Key: key })
    )
    return true
  } catch (error) {
    if (error instanceof DependencyUnavailableError) throw error
    if (isNotFound(error)) return false
    throw new DependencyUnavailableError('Object storage', { cause: error })
  }
}

/**
 * Server-side copy of one object to another key.
 *
 * The bytes never enter this process: S3 copies within the bucket itself, so
 * duplicating a 40 MB artwork costs one request rather than a download and an
 * upload through the Node event loop.
 *
 * Used where a copied record must own its files rather than share them —
 * duplicating a template, for instance, where a shared thumbnail would mean
 * deleting either copy broke the other's tile.
 */
export async function copy(
  sourceKey: string,
  destinationKey: string
): Promise<void> {
  try {
    await getClient().send(
      new CopyObjectCommand({
        Bucket: bucket(),
        // Bucket-qualified and URI-encoded: a key containing a space or a
        // percent sign is copied from the wrong place otherwise, and S3
        // reports that as a missing key rather than as a bad request.
        CopySource: encodeURI(`${bucket()}/${sourceKey}`),
        Key: destinationKey,
      })
    )
  } catch (error) {
    if (error instanceof DependencyUnavailableError) throw error
    if (isNotFound(error)) throw new NotFoundError('Object')
    throw new DependencyUnavailableError('Object storage', { cause: error })
  }
}

/** Idempotent: deleting an object that is not there is not an error. */
export async function remove(key: string): Promise<void> {
  try {
    await getClient().send(
      new DeleteObjectCommand({ Bucket: bucket(), Key: key })
    )
  } catch (error) {
    if (error instanceof DependencyUnavailableError) throw error
    if (isNotFound(error)) return
    throw new DependencyUnavailableError('Object storage', { cause: error })
  }
}

/**
 * RFC 6266 disposition header.
 *
 * Both forms are emitted: the quoted ASCII fallback for old clients, and the
 * percent-encoded `filename*` that carries the real name. Without the fallback
 * a filename containing a comma or a quote truncates the header.
 */
function contentDisposition(filename: string): string {
  const ascii = filename.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_')
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename)}`
}

/** S3 signals a missing key by name or by a bare 404, depending on the call. */
function isNotFound(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false
  const candidate = error as {
    name?: string
    $metadata?: { httpStatusCode?: number }
  }
  return (
    candidate.name === 'NoSuchKey' ||
    candidate.name === 'NotFound' ||
    candidate.$metadata?.httpStatusCode === 404
  )
}
