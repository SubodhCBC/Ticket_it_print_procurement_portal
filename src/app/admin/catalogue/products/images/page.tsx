// src/app/admin/catalogue/products/images/page.tsx
'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, Images, Upload } from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'
import { AdminHeader } from '@/components/admin/AdminHeader'
import {
  ActionButton,
  AdminCard,
  AdminTable,
  Notice,
  ReadOnlyNotice,
  SectionHeading,
  StateBlock,
  Td,
  TextInput,
  Th,
} from '@/components/admin/ProductAdminUi'
import { errorMessage, formatBytes } from '@/components/admin/ProductAdminUtils'
import { useAuth } from '@/hooks/useAuth'
import { useDamAccess } from '@/hooks/useDam'
import {
  DAM_IMAGE_ACCEPT,
  DAM_SESSION_REQUIRED_CODE,
  DAM_UPLOAD_MAX_FILE_BYTES,
} from '@/services/dam.service'
import {
  matchCatalogImageFilenames,
  uploadCatalogProductAsset,
} from '@/services/products.service'
import type {
  AssetUploadStage,
  ImageFilenameMatch,
} from '@/types/catalog-admin'

/** More than this in one go is a job to split into folders. */
const MAX_FILES = 500

type UploadState =
  | { kind: 'idle' }
  | { kind: 'queued' }
  | { kind: 'working'; stage: AssetUploadStage }
  | { kind: 'done' }
  | { kind: 'failed'; error: string }

interface Row {
  key: string
  file: File
  /** Why the file cannot be uploaded whatever it matches, if anything. */
  problem: string | null
  match: ImageFilenameMatch | null
  matching: boolean
  /** The SKU typed for a file whose name did not say, or said wrongly. */
  skuOverride: string
  include: boolean
  upload: UploadState
}

const fileKey = (file: File) => `${file.name}|${file.size}|${file.lastModified}`

function fileProblem(file: File): string | null {
  if (!file.type.startsWith('image/')) {
    return `Not an image (${file.type || 'unknown type'}).`
  }
  if (file.size < 1) return 'The file is empty.'
  if (file.size > DAM_UPLOAD_MAX_FILE_BYTES) {
    return `Larger than ${Math.round(DAM_UPLOAD_MAX_FILE_BYTES / 1_048_576)}MB.`
  }
  if (file.name.length > 200) return 'Name longer than 200 characters.'
  return null
}

const byName = new Intl.Collator(undefined, { numeric: true })

const STAGE_LABELS: Record<AssetUploadStage, string> = {
  'uploading-library': 'Uploading…',
  attaching: 'Attaching…',
}

/**
 * Many product images at once, each matched to its product by the SKU in the
 * file name — `BC-001.jpg`, `BC-001_2.jpg`, `BC-001-back.png`.
 *
 * Matching is the server's (`POST /catalog/products/image-matches`), so the
 * rule is the same one the API documents. Each file is then uploaded exactly as
 * the product page uploads one: into the image library, then attached. One at a
 * time, because the library is a remote service on the user's own session and a
 * burst of parallel uploads is how that session gets refused.
 */
export default function BulkProductImagesPage() {
  const { hasPermission, status } = useAuth()
  const canManage = hasPermission('CATALOG_MANAGE')
  const queryClient = useQueryClient()
  // Every image goes through the image library first. Said up front: without a
  // Ticket-IT session or DAM_UPLOAD the first upload fails, after the matching.
  const library = useDamAccess()
  const libraryBlocked = !library.isLoading && !library.canUpload
  const fileRef = useRef<HTMLInputElement>(null)

  const [rows, setRows] = useState<Row[]>([])
  const [pickError, setPickError] = useState<string | null>(null)
  const [runError, setRunError] = useState<string | null>(null)
  const [running, setRunning] = useState(false)
  const [dragOver, setDragOver] = useState(false)

  const patchRow = (key: string, patch: Partial<Row>) =>
    setRows((current) =>
      current.map((row) => (row.key === key ? { ...row, ...patch } : row))
    )

  // Leaving mid-run abandons the rest silently, so say so first.
  useEffect(() => {
    if (!running) return
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault()
    }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [running])

  const addFiles = async (list: FileList | File[] | null | undefined) => {
    setPickError(null)
    if (!list || list.length === 0) return

    const existing = new Set(rows.map((row) => row.key))
    const fresh = Array.from(list).filter(
      (file) => !existing.has(fileKey(file))
    )
    if (rows.length + fresh.length > MAX_FILES) {
      setPickError(
        `Upload at most ${MAX_FILES} images at a time. Split the folder and do the rest afterwards.`
      )
      return
    }
    if (fresh.length === 0) return

    const added: Row[] = fresh.map((file) => {
      const problem = fileProblem(file)
      return {
        key: fileKey(file),
        file,
        problem,
        match: null,
        matching: problem === null,
        skuOverride: '',
        include: false,
        upload: { kind: 'idle' },
      }
    })
    setRows((current) =>
      [...current, ...added].sort((a, b) =>
        byName.compare(a.file.name, b.file.name)
      )
    )

    const toMatch = added.filter((row) => row.problem === null)
    if (toMatch.length === 0) return

    try {
      const matches = await matchCatalogImageFilenames(
        toMatch.map((row) => ({ filename: row.file.name }))
      )
      const byKey = new Map(toMatch.map((row, i) => [row.key, matches[i]]))
      setRows((current) =>
        current.map((row) => {
          const match = byKey.get(row.key)
          if (!match) return row
          return {
            ...row,
            match,
            matching: false,
            include: match.product !== null,
          }
        })
      )
    } catch (err) {
      const keys = new Set(toMatch.map((row) => row.key))
      setRows((current) =>
        current.map((row) =>
          keys.has(row.key) ? { ...row, matching: false } : row
        )
      )
      setPickError(
        errorMessage(err, 'The files could not be matched to products.')
      )
    }
  }

  const rematch = async (row: Row) => {
    const sku = row.skuOverride.trim()
    patchRow(row.key, { matching: true })
    try {
      const [match] = await matchCatalogImageFilenames([
        { filename: row.file.name, ...(sku ? { sku } : {}) },
      ])
      patchRow(row.key, {
        match,
        matching: false,
        include: match.product !== null,
        upload: { kind: 'idle' },
      })
    } catch (err) {
      patchRow(row.key, { matching: false })
      setPickError(errorMessage(err, 'That file could not be matched.'))
    }
  }

  /**
   * Where each included file goes among its product's images: after what the
   * product already had, in file-name order. Worked out over every included row,
   * not just the ones still to send, so a retry lands where it would have.
   */
  const sortOrders = useMemo(() => {
    const perProduct = new Map<string, Row[]>()
    for (const row of rows) {
      if (!row.include || !row.match?.product) continue
      const list = perProduct.get(row.match.product.id) ?? []
      list.push(row)
      perProduct.set(row.match.product.id, list)
    }
    const orders = new Map<string, number>()
    for (const list of perProduct.values()) {
      list.forEach((row, index) => {
        orders.set(
          row.key,
          Math.min(999, row.match!.product!.nextImageSortOrder + index)
        )
      })
    }
    return orders
  }, [rows])

  const ready = rows.filter(
    (row) =>
      row.include &&
      row.problem === null &&
      row.match?.product &&
      row.upload.kind !== 'done'
  )
  const counts = {
    total: rows.length,
    matched: rows.filter((row) => row.match?.product).length,
    unmatched: rows.filter(
      (row) =>
        row.problem === null && !row.matching && row.match && !row.match.product
    ).length,
    invalid: rows.filter((row) => row.problem !== null).length,
    done: rows.filter((row) => row.upload.kind === 'done').length,
    failed: rows.filter((row) => row.upload.kind === 'failed').length,
  }

  const uploadAll = async () => {
    setRunError(null)
    const queue = ready
    if (queue.length === 0) return

    setRunning(true)
    setRows((current) =>
      current.map((row) =>
        queue.some((q) => q.key === row.key)
          ? { ...row, upload: { kind: 'queued' } }
          : row
      )
    )

    let stopped = false
    for (const row of queue) {
      if (stopped) {
        patchRow(row.key, { upload: { kind: 'idle' } })
        continue
      }
      const product = row.match!.product!
      try {
        await uploadCatalogProductAsset(
          product.id,
          {
            file: row.file,
            kind: 'IMAGE',
            sortOrder: sortOrders.get(row.key) ?? product.nextImageSortOrder,
            // Something for a screen reader beats nothing; the product page can
            // refine it per image.
            altText: product.name.slice(0, 300),
          },
          (stage) => patchRow(row.key, { upload: { kind: 'working', stage } })
        )
        patchRow(row.key, { upload: { kind: 'done' } })
      } catch (err) {
        const message = errorMessage(err, 'The image could not be uploaded.')
        patchRow(row.key, { upload: { kind: 'failed', error: message } })
        // A lost library session fails every file after it the same way, so
        // stop rather than print the same error a hundred times.
        if ((err as { code?: string })?.code === DAM_SESSION_REQUIRED_CODE) {
          setRunError(`${message} The remaining images were not sent.`)
          stopped = true
        }
      }
    }

    setRunning(false)
    void queryClient.invalidateQueries({ queryKey: ['products'] })
  }

  const clearFinished = () =>
    setRows((current) => current.filter((row) => row.upload.kind !== 'done'))

  const header = (
    <AdminHeader
      title="Bulk Image Upload"
      subtitle="Upload many product images at once; each is matched to its product by the SKU in its file name"
      actionButton={
        <Link
          href="/admin/catalogue/products"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            padding: '8px 14px',
            borderRadius: '10px',
            backgroundColor: '#FFFFFF',
            border: '1px solid #F0E6EC',
            color: '#2B253E',
            fontSize: '0.82rem',
            fontWeight: 600,
            textDecoration: 'none',
          }}
        >
          <ArrowLeft size={16} />
          <span>Back to products</span>
        </Link>
      }
    />
  )

  if (!canManage) {
    return (
      <>
        {header}
        <main style={{ padding: '24px' }}>
          <AdminCard>
            {status === 'ready' ? (
              <ReadOnlyNotice>
                Uploading product images needs the Catalog Manage permission.
              </ReadOnlyNotice>
            ) : (
              <StateBlock title="Checking your permissions…" />
            )}
          </AdminCard>
        </main>
      </>
    )
  }

  return (
    <>
      {header}
      <main
        style={{
          padding: '24px',
          display: 'flex',
          flexDirection: 'column',
          gap: '20px',
        }}
      >
        <AdminCard>
          <SectionHeading
            title="1. Choose images"
            description={
              <>
                Name each file after its product&apos;s SKU. Extra shots of the
                same product can carry a suffix: <code>BC-001.jpg</code>,{' '}
                <code>BC-001_2.jpg</code>, <code>BC-001-back.png</code>. Images
                are added after the product&apos;s existing ones; nothing is
                replaced. Up to {MAX_FILES} files,{' '}
                {Math.round(DAM_UPLOAD_MAX_FILE_BYTES / 1_048_576)}MB each.
              </>
            }
          />

          <input
            ref={fileRef}
            type="file"
            multiple
            accept={DAM_IMAGE_ACCEPT}
            style={{ display: 'none' }}
            onChange={(e) => {
              void addFiles(e.target.files)
              e.target.value = ''
            }}
          />
          <div
            onDragOver={(e) => {
              e.preventDefault()
              if (!running) setDragOver(true)
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault()
              setDragOver(false)
              if (!running) void addFiles(e.dataTransfer.files)
            }}
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '10px',
              padding: '28px 16px',
              borderRadius: '12px',
              border: `2px dashed ${dragOver ? '#F73582' : '#F0E6EC'}`,
              backgroundColor: dragOver ? '#FFF0F6' : '#FCF7FA',
              textAlign: 'center',
            }}
          >
            <Images size={28} color="#6E6781" />
            <div style={{ fontSize: '0.84rem', color: '#2B253E' }}>
              Drop image files here, or
            </div>
            <ActionButton
              variant="primary"
              icon={<Upload size={15} />}
              disabled={running}
              onClick={() => fileRef.current?.click()}
            >
              Choose images
            </ActionButton>
          </div>

          {libraryBlocked && (
            <div style={{ marginTop: '12px' }}>
              <Notice tone="warning">
                Images cannot be uploaded right now:{' '}
                {library.reason ??
                  'the image library is not connected for your account.'}{' '}
                Files can still be matched to products.
              </Notice>
            </div>
          )}

          {pickError && (
            <div style={{ marginTop: '12px' }}>
              <Notice tone="error">{pickError}</Notice>
            </div>
          )}
        </AdminCard>

        {rows.length > 0 && (
          <AdminCard>
            <SectionHeading
              title="2. Check the matches and upload"
              description={`${counts.total} file(s): ${counts.matched} matched, ${counts.unmatched} not matched, ${counts.invalid} cannot be uploaded. ${counts.done} uploaded${counts.failed ? `, ${counts.failed} failed` : ''}. Type a SKU for any file that did not match.`}
              action={
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  {counts.done > 0 && !running && (
                    <ActionButton onClick={clearFinished}>
                      Clear uploaded
                    </ActionButton>
                  )}
                  {!running && (
                    <ActionButton variant="ghost" onClick={() => setRows([])}>
                      Clear all
                    </ActionButton>
                  )}
                  <ActionButton
                    variant="primary"
                    icon={<Upload size={15} />}
                    pending={running}
                    pendingLabel="Uploading…"
                    disabled={ready.length === 0 || libraryBlocked}
                    onClick={() => void uploadAll()}
                  >
                    {counts.failed > 0 ? 'Upload / retry' : 'Upload'}{' '}
                    {ready.length} image{ready.length === 1 ? '' : 's'}
                  </ActionButton>
                </div>
              }
            />

            {runError && (
              <div style={{ marginBottom: '12px' }}>
                <Notice tone="error">{runError}</Notice>
              </div>
            )}

            <AdminTable
              head={
                <>
                  <Th first>Upload</Th>
                  <Th>File</Th>
                  <Th>Product</Th>
                  <Th>SKU</Th>
                  <Th>Status</Th>
                </>
              }
            >
              {rows.map((row) => (
                <tr key={row.key} style={{ borderTop: '1px solid #F0E6EC' }}>
                  <Td first>
                    <input
                      type="checkbox"
                      aria-label={`Upload ${row.file.name}`}
                      checked={row.include}
                      disabled={
                        running ||
                        row.problem !== null ||
                        !row.match?.product ||
                        row.upload.kind === 'done'
                      }
                      onChange={(e) =>
                        patchRow(row.key, { include: e.target.checked })
                      }
                    />
                  </Td>
                  <Td>
                    <div style={{ fontWeight: 600, overflowWrap: 'anywhere' }}>
                      {row.file.name}
                    </div>
                    <div style={{ fontSize: '0.74rem', color: '#6E6781' }}>
                      {formatBytes(row.file.size)}
                    </div>
                  </Td>
                  <Td>
                    <MatchCell row={row} />
                  </Td>
                  <Td>
                    {row.problem === null && row.upload.kind !== 'done' && (
                      <form
                        onSubmit={(e) => {
                          e.preventDefault()
                          void rematch(row)
                        }}
                        style={{ display: 'flex', gap: '6px' }}
                      >
                        <TextInput
                          aria-label={`SKU for ${row.file.name}`}
                          placeholder={row.match?.product?.sku ?? 'Type a SKU'}
                          value={row.skuOverride}
                          disabled={running || row.matching}
                          onChange={(e) =>
                            patchRow(row.key, { skuOverride: e.target.value })
                          }
                          style={{ width: '140px' }}
                        />
                        <ActionButton
                          type="submit"
                          size="sm"
                          disabled={running || row.matching}
                        >
                          Match
                        </ActionButton>
                      </form>
                    )}
                  </Td>
                  <Td>
                    <UploadCell row={row} sortOrder={sortOrders.get(row.key)} />
                  </Td>
                </tr>
              ))}
            </AdminTable>
          </AdminCard>
        )}
      </main>
    </>
  )
}

function MatchCell({ row }: { row: Row }) {
  if (row.problem) {
    return <span style={{ color: '#B91C1C' }}>{row.problem}</span>
  }
  if (row.matching) return <span style={{ color: '#6E6781' }}>Matching…</span>
  const product = row.match?.product
  if (!product) {
    return <span style={{ color: '#B45309' }}>No product with this SKU</span>
  }
  return (
    <div>
      <Link
        href={`/admin/catalogue/products/${product.id}`}
        style={{ fontWeight: 600, color: '#2B253E' }}
      >
        {product.sku}
      </Link>{' '}
      <span style={{ color: '#6E6781' }}>— {product.name}</span>
      <div style={{ fontSize: '0.74rem', color: '#6E6781' }}>
        {product.imageCount} existing image
        {product.imageCount === 1 ? '' : 's'}
        {product.status !== 'ACTIVE'
          ? ` · ${product.status.toLowerCase()}`
          : ''}
      </div>
      {row.match?.matchedOn === 'SUFFIX' && (
        <div style={{ fontSize: '0.74rem', color: '#B45309' }}>
          Matched after ignoring “{row.match.ignoredSuffix}” — check it is the
          right product.
        </div>
      )}
    </div>
  )
}

function UploadCell({ row, sortOrder }: { row: Row; sortOrder?: number }) {
  switch (row.upload.kind) {
    case 'queued':
      return <span style={{ color: '#6E6781' }}>Waiting…</span>
    case 'working':
      return (
        <span style={{ color: '#6E6781' }}>
          {STAGE_LABELS[row.upload.stage]}
        </span>
      )
    case 'done':
      return <span style={{ color: '#047857', fontWeight: 600 }}>Uploaded</span>
    case 'failed':
      return (
        <span style={{ color: '#B91C1C', overflowWrap: 'anywhere' }}>
          {row.upload.error}
        </span>
      )
    default:
      return row.include && sortOrder !== undefined ? (
        <span style={{ color: '#6E6781' }}>Ready · position {sortOrder}</span>
      ) : (
        <span style={{ color: '#6E6781' }}>—</span>
      )
  }
}
