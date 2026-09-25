import { apiClient } from '@/services/api.service'
import type { PaginatedResult, PrintTemplate, TemplateLayer } from '@/types'
import type { DesignDocument } from '@/types/design'
import type { ApiOffsetPage } from './catalog.types'
import type {
  ApiAcceptedCustomisation,
  ApiCustomisableTemplate,
  ApiTemplateAssetKind,
  ApiTemplateDetail,
  ApiTemplateOrientation,
  ApiTemplateSummary,
  ApiTemplateUnit,
  ApiTemplateVersion,
  ApiTemplateVisibility,
} from './template.types'
import {
  damFolderForTemplate,
  storeOwnedFileInDam,
} from '@/services/asset-storage'

/**
 * The template library, served by `/templates`.
 *
 * Same function signatures as the mock adapter it replaces, so the service
 * layer and every screen above it — the gallery, the builder, the storefront
 * customiser — are unchanged. See `../index.ts`.
 *
 * ---------------------------------------------------------------------------
 * Three things this file does that the mock never had to
 * ---------------------------------------------------------------------------
 * **Publishing is a separate call.** The builder expresses "publish" by sending
 * a payload with `status: 'PUBLISHED'`. The API refuses that on the save route
 * on purpose — publishing freezes an immutable version, which a status field
 * would hide — so `update()` saves first and then calls `/publish`. The screens
 * keep their one-button flow; the consequence stays explicit on the wire.
 *
 * **The thumbnail is uploaded, not stored inline.** `exportThumbnail()` in the
 * builder produces a `data:` URL. Sending that in the payload would put a
 * base64 PNG in a database column on every save. It goes into the image library
 * and is then registered on the template (see `@/services/asset-storage`).
 *
 * **Saves carry the version they were based on.** `expectedVersion` is what
 * makes two designers on one template a 409 rather than a silent overwrite.
 */

const TEMPLATES = '/templates'

// --- Mapping -------------------------------------------------------------------

const ORIENTATION_TO_API: Record<
  PrintTemplate['orientation'],
  ApiTemplateOrientation
> = {
  landscape: 'LANDSCAPE',
  portrait: 'PORTRAIT',
  square: 'SQUARE',
}

const ORIENTATION_FROM_API: Record<
  ApiTemplateOrientation,
  PrintTemplate['orientation']
> = {
  LANDSCAPE: 'landscape',
  PORTRAIT: 'portrait',
  SQUARE: 'square',
}

const UNIT_TO_API: Record<
  PrintTemplate['dimensions']['unit'],
  ApiTemplateUnit
> = {
  in: 'IN',
  mm: 'MM',
  px: 'PX',
}

const UNIT_FROM_API: Record<
  ApiTemplateUnit,
  PrintTemplate['dimensions']['unit']
> = {
  IN: 'in',
  MM: 'mm',
  PX: 'px',
}

/**
 * The API row as the UI's `PrintTemplate`.
 *
 * A summary row has no design document, so `layers` comes back empty and
 * `design` undefined. That is what the gallery wants — it renders a tile, not a
 * canvas — and the builder always reads a detail.
 */
function toTemplate(
  api: ApiTemplateSummary | ApiTemplateDetail
): PrintTemplate {
  const detail = 'layers' in api ? api : undefined

  return {
    id: api.id,
    productId: api.productId ?? '',
    productName: api.productName ?? '',
    // The UI's "category" is the label a tile prints, not an id.
    category: api.categoryName ?? '',
    price: api.price,
    unitsPerPack: api.unitsPerPack,
    name: api.name,
    description: api.description ?? '',
    thumbnailUrl: api.thumbnailUrl ?? '',
    orientation: ORIENTATION_FROM_API[api.orientation],
    aspectRatio: api.aspectRatio ?? '',
    dimensions: {
      width: api.dimensions.width,
      height: api.dimensions.height,
      unit: UNIT_FROM_API[api.dimensions.unit],
    },
    bleedMargin: api.bleedMargin,
    safeMargin: api.safeMargin,
    status: api.status,
    theme: (api.theme ?? 'modern') as PrintTemplate['theme'],
    canvasConfig: (detail?.canvasConfig ?? {
      backgroundColor: '#FFFFFF',
    }) as PrintTemplate['canvasConfig'],
    layers: (detail?.layers ?? []) as unknown as TemplateLayer[],
    // Carried through because a summary has no layers to count — without these
    // a gallery reports "0 editable fields" for every template it lists.
    editableFieldCount: api.editableFieldCount,
    layerCount: api.layerCount,
    ...(detail?.design
      ? { design: detail.design as unknown as DesignDocument }
      : {}),
    ...(detail?.canvasJson ? { canvasJson: detail.canvasJson } : {}),
    version: api.version,
    createdAt: api.createdAt,
    updatedAt: api.updatedAt,
    ...(api.createdByName ? { createdBy: api.createdByName } : {}),
    // Ownership, carried through for the customer galleries. Dropping these
    // does not fail anything loudly: the gallery simply decides that nothing
    // belongs to anyone, and shows an empty "Yours".
    visibility: api.visibility,
    ownerUserId: api.ownerUserId ?? null,
    ownerAccountId: api.ownerAccountId ?? null,
    sourceTemplateId: api.sourceTemplateId ?? null,
    // Detail reads only. A summary has no grants, and reporting an empty list
    // there would read as "restricted to nobody".
    ...(detail
      ? { restrictedToAccountIds: [...(detail.restrictedToAccountIds ?? [])] }
      : {}),
  }
}

/**
 * The fields a create or save writes.
 *
 * `status` is deliberately absent: the API has one route for saving and another
 * for publishing, and folding the two together here is what this adapter exists
 * to avoid. `thumbnailUrl` is absent for the same kind of reason — it is an
 * upload, handled separately.
 */
function toBody(input: Partial<PrintTemplate>): Record<string, unknown> {
  const body: Record<string, unknown> = {}

  if (input.name !== undefined) body.name = input.name
  if (input.description !== undefined) body.description = input.description
  // Empty string is the UI's "unset" for both; sending it would fail the id
  // check on the server, so it is omitted rather than forwarded.
  if (input.productId) body.productId = input.productId
  // Sent, and dropped server-side for anyone without PRICING_MANAGE. Omitted
  // when null rather than forwarded: null is the UI's "not priced yet", and the
  // server reads an absent field as "leave it alone", which is what an autosave
  // from a builder that never showed a price input has to mean.
  //
  // The pair or neither. The database holds the two together
  // (`templates_price_pair`), so one sent alone — an autosave landing between
  // typing the price and typing the units — was a save it could only refuse.
  if (input.price != null && input.unitsPerPack != null) {
    body.price = input.price
    body.unitsPerPack = input.unitsPerPack
  }
  if (input.theme !== undefined) body.theme = input.theme
  if (input.orientation !== undefined)
    body.orientation = ORIENTATION_TO_API[input.orientation]
  if (input.aspectRatio !== undefined) body.aspectRatio = input.aspectRatio
  if (input.dimensions !== undefined) {
    body.widthValue = input.dimensions.width
    body.heightValue = input.dimensions.height
    body.dimensionUnit = UNIT_TO_API[input.dimensions.unit]
  }
  if (input.bleedMargin !== undefined) body.bleedMargin = input.bleedMargin
  if (input.safeMargin !== undefined) body.safeMargin = input.safeMargin
  if (input.canvasConfig !== undefined) body.canvasConfig = input.canvasConfig
  if (input.layers !== undefined) body.layers = input.layers
  if (input.design !== undefined) body.design = input.design
  if (input.canvasJson !== undefined) body.canvasJson = input.canvasJson

  return body
}

// --- Thumbnails ----------------------------------------------------------------

/** `data:image/png;base64,...` — what the builder's canvas export produces. */
const DATA_URL = /^data:(image\/[a-z+.-]+);base64,(.+)$/i

function decodeDataUrl(
  dataUrl: string
): { blob: Blob; contentType: string } | null {
  const match = DATA_URL.exec(dataUrl)
  if (!match) return null

  const [, contentType, base64] = match
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i)

  return { blob: new Blob([bytes], { type: contentType }), contentType }
}

/**
 * Puts a canvas-exported tile into storage and registers it on the template.
 *
 * Never allowed to fail the save it belongs to. A template that saved but whose
 * tile did not upload is a gallery with one missing picture; a save that failed
 * because of a picture is a designer's work lost.
 */
async function uploadThumbnail(
  templateId: string,
  dataUrl: string,
  kind: ApiTemplateAssetKind = 'THUMBNAIL'
): Promise<void> {
  const decoded = decodeDataUrl(dataUrl)
  if (!decoded) return

  const extension = decoded.contentType.split('/')[1]?.split('+')[0] ?? 'png'
  const filename = `${kind.toLowerCase()}.${extension}`

  await storeTemplateFile(templateId, decoded.blob, filename, kind)
}

/**
 * Stores one of the template's own files and registers it on the template.
 *
 * Into the image library, then attach (see `@/services/asset-storage`). The
 * browser never talks to object storage: presign is gone, and the server reads
 * the file out of the library and copies it to S3 itself.
 *
 * No `contentType` parameter: the blob carries its own type, and the type that
 * goes on the row is the one the library reports for the stored file.
 */
async function storeTemplateFile(
  templateId: string,
  file: Blob,
  filename: string,
  kind: ApiTemplateAssetKind
): Promise<void> {
  const assetsPath = `${TEMPLATES}/${encodeURIComponent(templateId)}/assets`

  const stored = await storeOwnedFileInDam(file, {
    fileName: filename,
    folderPath: damFolderForTemplate(templateId),
  })
  await apiClient.post(assetsPath, {
    damDocumentId: stored.damDocumentId,
    damUrl: stored.damUrl,
    filename,
    contentType: stored.contentType,
    sizeBytes: stored.sizeBytes,
    kind,
  })
}

/** Uploads a tile if there is a new one, and never lets it break the save. */
async function syncThumbnail(
  templateId: string,
  thumbnailUrl?: string
): Promise<void> {
  // Only a freshly exported `data:` URL is new. An `https://` value is the
  // signed URL a previous response handed back, and re-uploading it every save
  // would grow the asset table by one row a keystroke.
  if (!thumbnailUrl?.startsWith('data:')) return

  try {
    await uploadThumbnail(templateId, thumbnailUrl)
  } catch (error) {
    console.warn(
      'Template thumbnail could not be uploaded; the design was saved.',
      error
    )
  }
}

// --- Reads ---------------------------------------------------------------------

interface ListParams {
  page?: number
  pageSize?: number
  category?: string
  productId?: string
  status?: PrintTemplate['status'] | 'ALL'
  theme?: string
  search?: string
}

export async function list(
  params: ListParams = {}
): Promise<PaginatedResult<PrintTemplate>> {
  const page: ApiOffsetPage<ApiTemplateSummary> = await apiClient.get(
    TEMPLATES,
    {
      params: {
        page: params.page ?? 1,
        pageSize: params.pageSize ?? 25,
        // "ALL" is the filter's "no filter". It is a UI token, not a status, and
        // forwarding it would fail validation.
        ...(params.status && params.status !== 'ALL'
          ? { status: params.status }
          : {}),
        ...(params.productId ? { productId: params.productId } : {}),
        ...(params.theme && params.theme !== 'All'
          ? { theme: params.theme }
          : {}),
        ...(params.search ? { search: params.search } : {}),
        ...(params.category && params.category !== 'All'
          ? { categoryId: params.category }
          : {}),
        withThumbnails: true,
      },
    }
  )

  return {
    items: page.items.map(toTemplate),
    total: page.total,
    page: page.page,
    pageSize: page.pageSize,
    totalPages: page.totalPages,
  }
}

export async function getById(id: string): Promise<PrintTemplate | null> {
  try {
    const detail: ApiTemplateDetail = await apiClient.get(
      `${TEMPLATES}/${encodeURIComponent(id)}`
    )
    return toTemplate(detail)
  } catch {
    // The gallery and the editor both treat "not found" as an empty state
    // rather than an error page, which is what the mock adapter did too.
    return null
  }
}

// --- Writes --------------------------------------------------------------------

export async function create(
  input: Omit<PrintTemplate, 'id' | 'createdAt' | 'updatedAt' | 'version'>
): Promise<PrintTemplate> {
  const created: ApiTemplateDetail = await apiClient.post(
    TEMPLATES,
    toBody(input)
  )

  await syncThumbnail(created.id, input.thumbnailUrl)

  // A create that also asked to publish: the builder's "Save & publish" on a
  // template that does not exist yet.
  if (input.status === 'PUBLISHED') {
    return toTemplate(await publishRequest(created.id))
  }

  return toTemplate(created)
}

export async function update(
  id: string,
  input: Partial<PrintTemplate>
): Promise<PrintTemplate> {
  const body = toBody(input)

  // A save that carries nothing but a thumbnail — the builder does this when
  // only the tile changed — would fail the API's "a save must change
  // something" rule. There is genuinely nothing to save, so skip the PATCH.
  let saved: ApiTemplateDetail | undefined
  if (Object.keys(body).length > 0) {
    saved = await apiClient.patch(`${TEMPLATES}/${encodeURIComponent(id)}`, {
      ...body,
      // What turns two designers on one template into a 409 instead of a
      // silent overwrite. Omitted when the caller does not know its version —
      // a partial update from a screen that never loaded the whole row.
      ...(input.version !== undefined
        ? { expectedVersion: input.version }
        : {}),
    })
  }

  await syncThumbnail(id, input.thumbnailUrl)

  if (input.status === 'PUBLISHED') {
    return toTemplate(await publishRequest(id))
  }

  return toTemplate(
    saved ?? (await apiClient.get(`${TEMPLATES}/${encodeURIComponent(id)}`))
  )
}

async function publishRequest(
  id: string,
  label?: string
): Promise<ApiTemplateDetail> {
  return apiClient.post(`${TEMPLATES}/${encodeURIComponent(id)}/publish`, {
    ...(label ? { label } : {}),
  })
}

export async function remove(id: string): Promise<void> {
  await apiClient.delete(`${TEMPLATES}/${encodeURIComponent(id)}`)
}

/**
 * The gallery's publish / unpublish / archive buttons.
 *
 * PUBLISHED goes to `/publish` because it cuts a version; the other two are
 * ordinary status changes.
 */
export async function setStatus(
  id: string,
  status: PrintTemplate['status']
): Promise<PrintTemplate> {
  if (status === 'PUBLISHED') return toTemplate(await publishRequest(id))

  const updated: ApiTemplateDetail = await apiClient.post(
    `${TEMPLATES}/${encodeURIComponent(id)}/status`,
    { status }
  )
  return toTemplate(updated)
}

/**
 * Who can see an operator template. Admin only (TEMPLATE_MANAGE).
 *
 * The grant list is replaced wholesale. ALL_ACCOUNTS deletes every existing
 * grant, so the ids are not sent for it; RESTRICTED needs at least one.
 */
export async function setVisibility(
  id: string,
  visibility: Extract<ApiTemplateVisibility, 'ALL_ACCOUNTS' | 'RESTRICTED'>,
  accountIds: string[]
): Promise<PrintTemplate> {
  const updated: ApiTemplateDetail = await apiClient.post(
    `${TEMPLATES}/${encodeURIComponent(id)}/visibility`,
    {
      visibility,
      accountIds: visibility === 'RESTRICTED' ? [...new Set(accountIds)] : [],
    }
  )
  return toTemplate(updated)
}

// --- Versions ------------------------------------------------------------------

export async function listVersions(
  templateId: string
): Promise<ApiTemplateVersion[]> {
  if (!templateId) return []
  return apiClient.get(
    `${TEMPLATES}/${encodeURIComponent(templateId)}/versions`
  )
}

/** Cuts a restore point from the current draft and returns the whole history. */
export async function snapshotVersion(
  templateId: string,
  label?: string
): Promise<ApiTemplateVersion[]> {
  return apiClient.post(
    `${TEMPLATES}/${encodeURIComponent(templateId)}/versions`,
    {
      ...(label ? { label } : {}),
    }
  )
}

/** Copies a version back over the draft. Publishes nothing. */
export async function restoreVersion(
  templateId: string,
  version: number
): Promise<PrintTemplate> {
  const restored: ApiTemplateDetail = await apiClient.post(
    `${TEMPLATES}/${encodeURIComponent(templateId)}/versions/restore`,
    { version }
  )
  return toTemplate(restored)
}

// --- Personalisation -----------------------------------------------------------

/** The published artwork a buyer personalises — never the working copy. */
export async function getCustomisable(
  templateId: string
): Promise<ApiCustomisableTemplate> {
  return apiClient.get(
    `${TEMPLATES}/${encodeURIComponent(templateId)}/customise`
  )
}

/**
 * Checks a personalisation before it goes in the basket.
 *
 * Returns the accepted values and the version they were checked against, which
 * is what the cart line records — so the basket remembers the artwork the buyer
 * actually saw. A value aimed at a locked layer comes back as an error, not as
 * a silently dropped field.
 */
export async function customise(
  templateId: string,
  fields: Record<string, string>
): Promise<ApiAcceptedCustomisation> {
  return apiClient.post(
    `${TEMPLATES}/${encodeURIComponent(templateId)}/customise`,
    { fields }
  )
}

/**
 * The published snapshot, in the shape the customiser studio renders.
 *
 * The studio was written against `PrintTemplate` — the designer's model — and
 * reshaping it here rather than there keeps one component instead of two that
 * drift. What the caller must *also* keep is `versionId`: it is what the cart
 * line records, and dropping it is how a personalisation stops saying which
 * artwork it belongs to.
 */
export function toCustomisableTemplate(api: ApiCustomisableTemplate): {
  template: PrintTemplate
  versionId: string
  version: number
} {
  return {
    versionId: api.versionId,
    version: api.version,
    template: {
      id: api.templateId,
      productId: api.productId ?? '',
      productName: api.productName ?? '',
      category: api.categoryName ?? '',
      // The frozen price, which is what this buyer will be charged.
      price: api.price,
      unitsPerPack: api.unitsPerPack,
      name: api.name,
      description: api.description ?? '',
      thumbnailUrl: api.thumbnailUrl ?? '',
      orientation: ORIENTATION_FROM_API[api.orientation],
      aspectRatio: api.aspectRatio ?? '1:1',
      dimensions: {
        width: api.dimensions.width,
        height: api.dimensions.height,
        unit: UNIT_FROM_API[api.dimensions.unit],
      },
      bleedMargin: api.bleedMargin,
      safeMargin: api.safeMargin,
      status: 'PUBLISHED',
      theme: 'modern',
      canvasConfig: api.canvasConfig as PrintTemplate['canvasConfig'],
      layers: api.layers as unknown as TemplateLayer[],
      ...(api.design
        ? { design: api.design as unknown as DesignDocument }
        : {}),
      ...(api.canvasJson ? { canvasJson: api.canvasJson } : {}),
      // The *version* number, not the draft's. A buyer's basket records this,
      // and showing the draft's counter here would put a number on the screen
      // that matches nothing the order will carry.
      version: api.version,
      createdAt: '',
      updatedAt: '',
    },
  }
}

// --- Assets --------------------------------------------------------------------

export async function removeAsset(
  templateId: string,
  assetId: string
): Promise<void> {
  await apiClient.delete(
    `${TEMPLATES}/${encodeURIComponent(templateId)}/assets/${encodeURIComponent(assetId)}`
  )
}
