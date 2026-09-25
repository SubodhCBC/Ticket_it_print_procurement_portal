/**
 * Template payloads exactly as the API returns them.
 *
 * Mirrors `modules/templates/dto/template-response.ts`. Dimensions are numbers
 * rather than the money-style strings the rest of this API uses: these are
 * physical measurements the canvas does arithmetic on, and NUMERIC(10,3) has no
 * rounding trap at poster sizes.
 *
 * The design document and the layer array are passed through untyped on
 * purpose. They are the editor's own model, the server stores them whole and
 * hands them back byte for byte, and a second definition here would go stale
 * the first time the builder gained a control.
 */

export type ApiTemplateStatus = 'DRAFT' | 'PUBLISHED' | 'ARCHIVED'
export type ApiTemplateVisibility = 'ALL_ACCOUNTS' | 'RESTRICTED'
export type ApiTemplateOrientation = 'LANDSCAPE' | 'PORTRAIT' | 'SQUARE'
export type ApiTemplateUnit = 'IN' | 'MM' | 'PX'
export type ApiTemplateAssetKind = 'THUMBNAIL' | 'PREVIEW' | 'SOURCE'
export type ApiDerivativeStatus =
  'NOT_APPLICABLE' | 'PENDING' | 'READY' | 'FAILED'

export interface ApiTemplateDimensions {
  width: number
  height: number
  unit: ApiTemplateUnit
}

/** One box a buyer may fill in, derived by the server from the editable layers. */
export interface ApiTemplateField {
  key: string
  layerId: string
  type: string
  label: string
  helperText?: string
  isRequired: boolean
  /** What the designer put there. The customiser shows it as the placeholder. */
  defaultValue: string
}

export interface ApiTemplateAsset {
  id: string
  kind: ApiTemplateAssetKind
  filename: string
  contentType: string
  sizeBytes: number
  altText: string | null
  widthPx: number | null
  heightPx: number | null
  derivativeStatus: ApiDerivativeStatus
  derivativeError: string | null
  damDocumentId: string | null
  sortOrder: number
  /** Short-lived, minted per response. Never store one. */
  url?: string
  thumbnailUrl?: string
}

export interface ApiTemplateVersion {
  id: string
  version: number
  label: string | null
  createdByName: string | null
  createdAt: string
  /** Whether this is the snapshot the storefront currently renders. */
  isPublished: boolean
}

/** A gallery row. Carries no design document. */
export interface ApiTemplateSummary {
  id: string
  code: string
  name: string
  description: string | null
  status: ApiTemplateStatus
  visibility: ApiTemplateVisibility
  /**
   * Who the row belongs to. Null on the operator's own library; set on every
   * template a customer built or was given a copy of. The gallery reads these
   * to tell "yours" from "available to you", and the server decides ownership
   * -- these are reported, never sent.
   */
  ownerUserId: string | null
  ownerAccountId: string | null
  /** The template this one was copied from, if it was copied. */
  sourceTemplateId: string | null
  productId: string | null
  /** Joined by the server, so a gallery prints a name without a fetch per tile. */
  productName: string | null
  productSku: string | null
  categoryId: string | null
  categoryName: string | null
  /**
   * What a pack of this design costs, and how many pieces are in a pack.
   * Null until someone prices it — publishing refuses to let that reach a
   * storefront, so a null here is always a draft.
   */
  price: number | null
  unitsPerPack: number | null
  theme: string | null
  orientation: ApiTemplateOrientation
  aspectRatio: string | null
  dimensions: ApiTemplateDimensions
  bleedMargin: number
  safeMargin: number
  /** The draft's revision counter, and the optimistic-concurrency token. */
  version: number
  /** Null until the template has been published once. */
  publishedVersion: number | null
  publishedAt: string | null
  editableFieldCount: number
  layerCount: number
  /** Signed, and minted per response. Absent when the template has no tile. */
  thumbnailUrl?: string
  createdByName: string | null
  updatedByName: string | null
  createdAt: string
  updatedAt: string
}

/** The working copy: what the builder opens. */
export interface ApiTemplateDetail extends ApiTemplateSummary {
  canvasConfig: Record<string, unknown>
  layers: Record<string, unknown>[]
  design: Record<string, unknown> | null
  canvasJson: string | null
  fields: ApiTemplateField[]
  assets: ApiTemplateAsset[]
  versions: ApiTemplateVersion[]
  restrictedToAccountIds: string[]
}

/**
 * What a buyer personalises: the published snapshot, not the working copy.
 *
 * Carries `versionId` and `version` because that is what a cart line records —
 * so the basket remembers the artwork the buyer actually saw, even after the
 * designer has moved on.
 */
export interface ApiCustomisableTemplate {
  templateId: string
  versionId: string
  version: number
  code: string
  name: string
  description: string | null
  productId: string | null
  /** From the live product row, not the frozen snapshot: a product renamed
   *  since publication reads by its current name everywhere else in the shop,
   *  and the artwork is the only part that must not move. */
  productName: string | null
  productSku: string | null
  categoryName: string | null
  /** From the frozen version: what this buyer pays, whatever the draft says now. */
  price: number | null
  unitsPerPack: number | null
  orientation: ApiTemplateOrientation
  aspectRatio: string | null
  dimensions: ApiTemplateDimensions
  bleedMargin: number
  safeMargin: number
  canvasConfig: Record<string, unknown>
  layers: Record<string, unknown>[]
  design: Record<string, unknown> | null
  canvasJson: string | null
  fields: ApiTemplateField[]
  thumbnailUrl?: string
  previewUrl?: string
}

/** The result of checking a personalisation before it goes in the basket. */
export interface ApiAcceptedCustomisation {
  templateId: string
  versionId: string
  version: number
  fields: Record<string, string>
}
