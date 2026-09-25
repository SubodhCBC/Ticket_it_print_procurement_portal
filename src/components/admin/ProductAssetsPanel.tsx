// src/components/admin/ProductAssetsPanel.tsx
'use client'

import { useRef, useState } from 'react'
import { ExternalLink, FileText, Trash2, Upload } from 'lucide-react'
import { useProductAdminMutations } from '@/hooks/useProducts'
import { DAM_ACCEPT, DAM_UPLOAD_MAX_FILE_BYTES } from '@/services/dam.service'
import type {
  AdminProductAsset,
  AdminProductView,
  AssetUploadStage,
  CatalogAssetKind,
} from '@/types/catalog-admin'
import {
  ActionButton,
  AdminCard,
  ConfirmModal,
  Field,
  Notice,
  ReadOnlyNotice,
  SectionHeading,
  SelectInput,
  StateBlock,
  TextInput,
} from './ProductAdminUi'
import { errorMessage, formatBytes } from './ProductAdminUtils'

/**
 * The image library's own per-file ceiling, mirrored from
 * `DAM_UPLOAD_MAX_FILE_BYTES` — every product file goes through the library, so
 * that is the limit that actually applies, not object storage's.
 */
const MAX_BYTES = DAM_UPLOAD_MAX_FILE_BYTES

const KIND_LABELS: Record<CatalogAssetKind, string> = {
  IMAGE: 'Images',
  ARTWORK: 'Artwork',
  SPEC_SHEET: 'Spec sheets',
}

/**
 * What the file picker offers, per kind.
 *
 * Every product file now goes through the image library, so nothing is offered
 * that the library would refuse afterwards. Artwork is the whole of its list
 * (`DAM_ACCEPT`, print formats included); spec sheets are PDFs, because Office
 * documents are not on that list.
 */
const KIND_ACCEPT: Record<CatalogAssetKind, string | undefined> = {
  IMAGE: 'image/*',
  ARTWORK: DAM_ACCEPT,
  SPEC_SHEET: '.pdf,application/pdf',
}

// Two steps, and no "step 1 of 2": the second is quick and the first is the
// only one worth waiting through.
const STAGE_LABELS: Record<AssetUploadStage, string> = {
  'uploading-library': 'Uploading the file to the image library…',
  attaching: 'Attaching it to the product…',
}

/**
 * Images, print artwork and spec sheets.
 *
 * Uploads go browser → image library (see `@/services/asset-storage`), then the
 * file is attached; the server reads it back out of the library and copies it
 * into object storage. Image thumbnails are produced by a background worker, so
 * a new image may show as "thumbnail pending" for a while.
 */
export function ProductAssetsPanel({
  view,
  canManage,
}: {
  view: AdminProductView
  canManage: boolean
}) {
  const { uploadAsset, removeAsset } = useProductAdminMutations(view.id)
  const fileRef = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState<File | null>(null)
  const [kind, setKind] = useState<CatalogAssetKind>('IMAGE')
  const [altText, setAltText] = useState('')
  const [sortOrder, setSortOrder] = useState('0')
  const [stage, setStage] = useState<AssetUploadStage | null>(null)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [uploaded, setUploaded] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<AdminProductAsset | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const uploading = uploadAsset.isPending

  // Derived rather than checked once on selection, so changing the type after
  // choosing a file re-checks it. A PDF attached as IMAGE is stored happily,
  // and then every thumbnail of it is a broken image.
  const fileProblem =
    file && kind === 'IMAGE' && !file.type.startsWith('image/')
      ? `${file.name} is not an image (${file.type || 'unknown file type'}). Choose an image file, or set the type to Artwork or Spec sheet.`
      : null

  const upload = async (e: React.FormEvent) => {
    e.preventDefault()
    setUploadError(null)
    setUploaded(null)

    if (!file) {
      setUploadError('Choose a file to upload.')
      return
    }
    if (fileProblem) return
    if (file.size < 1) {
      setUploadError('That file is empty.')
      return
    }
    if (file.size > MAX_BYTES) {
      setUploadError(
        `Files larger than ${Math.round(MAX_BYTES / 1_048_576)}MB cannot be attached.`
      )
      return
    }
    if (file.name.length > 200) {
      setUploadError('Rename the file to 200 characters or fewer.')
      return
    }
    const order = Number(sortOrder || 0)
    if (!Number.isInteger(order) || order < 0 || order > 999) {
      setUploadError('Sort order must be a whole number from 0 to 999.')
      return
    }

    try {
      await uploadAsset.mutateAsync({
        input: {
          file,
          kind,
          sortOrder: order,
          ...(kind === 'IMAGE' && altText.trim()
            ? { altText: altText.trim() }
            : {}),
        },
        onStage: setStage,
      })
      setUploaded(`${file.name} was attached.`)
      setFile(null)
      setAltText('')
      if (fileRef.current) fileRef.current.value = ''
    } catch (err) {
      setUploadError(errorMessage(err, 'The file could not be uploaded.'))
    } finally {
      setStage(null)
    }
  }

  const confirmDelete = async () => {
    if (!deleting) return
    setDeleteError(null)
    try {
      await removeAsset.mutateAsync(deleting.id)
      setDeleting(null)
    } catch (err) {
      setDeleteError(errorMessage(err, 'The file could not be removed.'))
    }
  }

  const groups = (Object.keys(KIND_LABELS) as CatalogAssetKind[]).map(
    (assetKind) => ({
      kind: assetKind,
      assets: view.assets
        .filter((asset) => asset.kind === assetKind)
        .sort((a, b) => a.sortOrder - b.sortOrder),
    })
  )

  return (
    <AdminCard>
      <SectionHeading
        title="Images & documents"
        description="Product photography, print-ready artwork and specification sheets. Download links are short-lived; reload the page if one has expired."
      />

      {!canManage ? (
        <ReadOnlyNotice>
          Uploading and removing files needs the Catalog Manage permission.
        </ReadOnlyNotice>
      ) : (
        <form
          onSubmit={upload}
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: '12px',
            padding: '14px',
            borderRadius: '10px',
            backgroundColor: '#FCF7FA',
            alignItems: 'end',
          }}
        >
          <Field label="Type">
            <SelectInput
              value={kind}
              disabled={uploading}
              onChange={(e) => setKind(e.target.value as CatalogAssetKind)}
            >
              <option value="IMAGE">Image</option>
              <option value="ARTWORK">Artwork</option>
              <option value="SPEC_SHEET">Spec sheet</option>
            </SelectInput>
          </Field>
          <Field
            label="File *"
            hint={file ? `${formatBytes(file.size)}` : undefined}
          >
            <input
              ref={fileRef}
              type="file"
              accept={KIND_ACCEPT[kind]}
              disabled={uploading}
              onChange={(e) => {
                setFile(e.target.files?.[0] ?? null)
                setUploadError(null)
                setUploaded(null)
              }}
              style={{ fontSize: '0.8rem', color: '#2B253E', width: '100%' }}
            />
          </Field>
          {kind === 'IMAGE' && (
            <Field label="Alt text">
              <TextInput
                maxLength={300}
                value={altText}
                disabled={uploading}
                placeholder="Describe the image"
                onChange={(e) => setAltText(e.target.value)}
              />
            </Field>
          )}
          <Field label="Sort order">
            <TextInput
              type="number"
              min={0}
              max={999}
              step={1}
              value={sortOrder}
              disabled={uploading}
              onChange={(e) => setSortOrder(e.target.value)}
            />
          </Field>
          <div>
            <ActionButton
              type="submit"
              variant="primary"
              icon={<Upload size={15} />}
              pending={uploading}
              pendingLabel="Uploading…"
              disabled={!file || fileProblem !== null}
              style={{ width: '100%' }}
            >
              Upload
            </ActionButton>
          </div>
        </form>
      )}

      {fileProblem && <Notice tone="error">{fileProblem}</Notice>}
      {stage && <Notice tone="info">{STAGE_LABELS[stage]}</Notice>}
      {uploadError && <Notice tone="error">{uploadError}</Notice>}
      {uploaded && <Notice tone="success">{uploaded}</Notice>}

      {view.assets.length === 0 ? (
        <StateBlock
          title="No files yet"
          description="The catalogue shows a placeholder until an image is uploaded."
        />
      ) : (
        groups
          .filter((group) => group.assets.length > 0)
          .map((group) => (
            <div
              key={group.kind}
              style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}
            >
              <div
                style={{
                  fontSize: '0.84rem',
                  fontWeight: 600,
                  color: '#2B253E',
                }}
              >
                {KIND_LABELS[group.kind]} ({group.assets.length})
              </div>
              {group.assets.map((asset) => (
                <AssetRow
                  key={asset.id}
                  asset={asset}
                  canManage={canManage}
                  onDelete={() => {
                    setDeleteError(null)
                    setDeleting(asset)
                  }}
                />
              ))}
            </div>
          ))
      )}

      <ConfirmModal
        isOpen={deleting !== null}
        title="Remove file"
        message={
          <>
            Remove <strong>{deleting?.filename}</strong> from this product? The
            stored file is deleted as well and cannot be recovered.
          </>
        }
        confirmLabel="Remove file"
        pendingLabel="Removing…"
        pending={removeAsset.isPending}
        error={deleteError}
        onConfirm={() => void confirmDelete()}
        onCancel={() => setDeleting(null)}
      />
    </AdminCard>
  )
}

function AssetRow({
  asset,
  canManage,
  onDelete,
}: {
  asset: AdminProductAsset
  canManage: boolean
  onDelete: () => void
}) {
  const preview =
    asset.kind === 'IMAGE'
      ? (asset.thumbnailUrl ?? asset.previewUrl ?? asset.url)
      : undefined

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        padding: '10px 0',
        borderTop: '1px solid #F5EEF2',
        flexWrap: 'wrap',
      }}
    >
      {preview ? (
        <img
          src={preview}
          alt={asset.altText ?? asset.filename}
          style={{
            width: '56px',
            height: '56px',
            objectFit: 'cover',
            borderRadius: '10px',
            border: '1px solid #F0E6EC',
            flexShrink: 0,
          }}
        />
      ) : (
        <div
          style={{
            width: '56px',
            height: '56px',
            borderRadius: '10px',
            border: '1px solid #F0E6EC',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#A39BB3',
            flexShrink: 0,
          }}
        >
          <FileText size={20} />
        </div>
      )}

      <div style={{ flex: '1 1 220px', minWidth: 0 }}>
        <div
          style={{
            fontSize: '0.84rem',
            fontWeight: 600,
            color: '#2B253E',
            overflowWrap: 'anywhere',
          }}
        >
          {asset.filename}
        </div>
        <div
          style={{ fontSize: '0.76rem', color: '#A39BB3', marginTop: '2px' }}
        >
          {asset.contentType} · {formatBytes(asset.sizeBytes)}
          {asset.widthPx && asset.heightPx
            ? ` · ${asset.widthPx}×${asset.heightPx}px`
            : ''}
          {` · sort ${asset.sortOrder}`}
        </div>
        {asset.altText && (
          <div
            style={{ fontSize: '0.76rem', color: '#6E6781', marginTop: '2px' }}
          >
            Alt: {asset.altText}
          </div>
        )}
        {asset.derivativeStatus === 'PENDING' && (
          <div
            style={{ fontSize: '0.74rem', color: '#B45309', marginTop: '2px' }}
          >
            Thumbnail pending — the original is shown meanwhile.
          </div>
        )}
        {asset.derivativeStatus === 'FAILED' && (
          <div
            style={{ fontSize: '0.74rem', color: '#DC2626', marginTop: '2px' }}
          >
            Thumbnail failed
            {asset.derivativeError ? `: ${asset.derivativeError}` : ''}
          </div>
        )}
      </div>

      <div style={{ display: 'flex', gap: '6px' }}>
        {asset.url && (
          <a
            href={asset.url}
            target="_blank"
            rel="noreferrer"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
              padding: '5px 10px',
              borderRadius: '10px',
              border: '1px solid #F0E6EC',
              color: '#2B253E',
              fontSize: '0.76rem',
              fontWeight: 600,
              textDecoration: 'none',
            }}
          >
            <ExternalLink size={13} />
            Open
          </a>
        )}
        {canManage && (
          <ActionButton
            size="sm"
            variant="danger"
            icon={<Trash2 size={13} />}
            onClick={onDelete}
          >
            Remove
          </ActionButton>
        )}
      </div>
    </div>
  )
}
