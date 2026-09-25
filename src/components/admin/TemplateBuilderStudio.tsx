'use client'

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import type {
  Product,
  PrintTemplate,
  TemplateLayer,
  TemplateLayerType,
  TemplateLayerStyle,
  TemplateFieldKey,
  TemplateTheme,
  ProductSizeOption,
} from '@/types'
import { useTemplateMutations } from '@/hooks/useTemplates'
import { restoreTemplateVersion } from '@/services/templates.service'
import { useProducts } from '@/hooks/useProducts'
import { useAuth } from '@/hooks/useAuth'
import { useDamAccess, useDamSessionLost } from '@/hooks/useDam'
import {
  DamImagePicker,
  type DamPickedImage,
} from '@/components/dam/DamImagePicker'
import { checkCanvasUrl } from '@/services/dam.service'
import {
  cutoutFileName,
  DAM_HOST_BLOCKED,
  DAM_PICTURE_SLOW,
  DAM_SESSION_ENDED,
  dataUrlToBlob,
  readFileAsDataUrl,
  storePictureInDam,
  withImageSource,
  type DamStoreOutcome,
} from '@/lib/design/dam-images'
import {
  enlivenSnapshot,
  loadFabricImage,
  loadImageElementOrNull,
  markUnloadedImages,
  UNLOADED_SRC_PROP,
  unloadedImagePlaceholder,
  unloadedImageSources,
  unloadedImagesMessage,
  withUnloadableImagesReplaced,
} from '@/lib/design/image-load'
import {
  absoluteClipBox,
  distributeObjects,
  computeSmartGuides,
  contentObjects,
  type SmartGuide,
  groupSelection,
  ungroupSelection,
  enterGroupEditMode,
  createMask,
  releaseMask,
  hasMask,
} from '@/lib/design/transform'
import {
  applyImageFilters,
  applyPlaceholderLabel,
  canvasToObjects,
  DEFAULT_PLACEHOLDER_LABEL,
  docFillToFabric,
  objectsToCanvas,
} from '@/lib/design/serialize'
import {
  applyDiff,
  canRedo as historyCanRedo,
  canUndo as historyCanUndo,
  diffObjects,
  emptyHistory,
  pushEntry,
  redoEntry,
  undoEntry,
  type HistoryEntry,
  type HistoryLabel,
  type HistoryState,
  type ObjectSnapshot,
} from '@/lib/design/history'
import {
  listVersions,
  relativeTime,
  saveVersion,
  type TemplateVersion,
} from '@/lib/design/versions'
import {
  DESIGN_SCHEMA_VERSION,
  newId,
  type DesignDocument,
  type DesignObject,
  type DesignSide,
  type Gradient,
  type ImageFilters,
  type DesignUnit,
  type TextCase,
  type TextEffectKind,
} from '@/types/design'
import {
  exportRaster,
  exportSVG,
  exportPDF,
  downloadDataUrl,
  downloadBlob,
  downloadText,
  safeFilename,
  type RasterFormat,
} from '@/lib/design/export'
import { fabric } from 'fabric'
import {
  applyStrokeDefaults,
  applyLineControls,
} from '@/lib/design/fabric-defaults'
import {
  barcodeDataUrl,
  CODE_PLACEHOLDERS,
  qrDataUrl,
  renderCodeBitmap as renderCodeShared,
} from '@/lib/design/codes'
import { proofSides, renderSidePreview } from '@/lib/design/proof-export'
import { parsePackSize } from '@/services/data-source/api/product.mapper'
import {
  applyTextCaseToFabric,
  applyTextEffectToFabric,
  rawTextOf,
  setTextKeepingCase,
  syncTextCaseAfterEdit,
  TEXT_CASES,
  TEXT_EFFECTS,
  TEXT_STYLE_PROPS,
  textEffectOf,
} from '@/lib/design/text-style'
import {
  adoptCurrentBoxAsFrame,
  cropImageToRect,
  fillFrame,
  fitFrame,
  IMAGE_STYLE_PROPS,
  loadImageElement,
  sourceElementOf,
  swapImageElement,
  swapImageSource,
  type ImageFit,
} from '@/lib/design/image-tools'
import {
  preloadBackgroundModel,
  removeBackgroundWithModel,
  removeColourBackground,
} from '@/lib/design/background-removal'
import {
  Type,
  Hash,
  Barcode,
  QrCode,
  Square,
  Circle as CircleIcon,
  Image as ImageIcon,
  Minus,
  Star,
  Calendar,
  Undo,
  Redo,
  ZoomIn,
  ZoomOut,
  Maximize,
  Eye,
  EyeOff,
  Lock,
  Unlock,
  Save,
  Upload,
  PaintBucket,
  Ruler,
  Triangle,
  PenTool,
  Grid3x3,
  Magnet,
  Group as GroupIcon,
  Ungroup,
  Crop,
  Contrast,
  CircleSlash,
  Download,
  History,
  FolderOpen,
  ChevronRight,
  Trash2,
  Copy,
  Plus,
  ChevronUp,
  ChevronDown,
  ChevronsUp,
  ChevronsDown,
  GripVertical,
  AlignLeft,
  AlignCenter,
  AlignRight,
  AlignJustify,
  AlignHorizontalSpaceAround,
  AlignVerticalSpaceAround,
  Sparkles,
  Highlighter,
  Eraser,
  CaseSensitive,
  Expand,
  Minimize2,
  WandSparkles,
  SlidersHorizontal,
  Replace,
  RotateCcw,
  RotateCwSquare,
  ImageUp,
  AlignVerticalJustifyStart,
  AlignVerticalJustifyCenter,
  AlignVerticalJustifyEnd,
  X,
  Check,
  Loader2,
  Images,
} from 'lucide-react'

interface TemplateBuilderStudioProps {
  initialTemplate?: PrintTemplate
  isNew?: boolean

  /**
   * Whose template this is, which decides what the left panel is for.
   *
   * `catalogue` is the operator building the library: the second tab is
   * Personalisation, where they choose which layers a customer may later
   * change.
   *
   * `owned` is a customer working on their own copy. They get the same
   * canvas and the same tools — the ask was explicitly for the full builder,
   * not a cut-down one — but the second tab becomes Editable Fields, where the
   * layers the designer opened up are filled in rather than chosen. Most
   * customers want to put their branch name on a design and print it, and that
   * is one panel away rather than a hunt across the canvas.
   */
  /**
   * `customise` is a buyer personalising a published design before ordering it.
   * Same canvas and same tools as `owned` - the ask was for the full builder -
   * but nothing here writes to the template row. The artwork belongs to the
   * order being placed, not to the library: `onArtworkSave` hands it to whoever
   * is hosting this studio, and the master design is never touched.
   */
  mode?: 'catalogue' | 'owned' | 'customise'

  /**
   * Whether this actor may publish. False for a site user, who may build and
   * edit endlessly in private but not make a design everyone will print.
   */
  canPublish?: boolean

  /**
   * Takes the place of saving to the template row.
   *
   * When this is given, the studio never calls the templates API: `Save` builds
   * the artwork and hands it over, and the host decides where it goes. That is
   * what keeps a buyer's rework off the operator's design while still letting
   * them use every tool on it.
   */
  onArtworkSave?: (artwork: StudioArtwork) => Promise<void> | void

  /**
   * Called once with a handle onto the live canvas, for a host that owns the
   * surrounding chrome. It needs to read the artwork when its own buttons are
   * pressed - export a proof, price a run, put a line in the basket - and to
   * write branch details in without the buyer typing them twice.
   */
  onReady?: (api: StudioHandle) => void

  /**
   * Draw the studio's own top bar. A host that already has one - the buyer's
   * order bar, with its units and its Create PO - passes false rather than
   * stacking two rows of half-overlapping actions.
   */
  showHeader?: boolean

  /**
   * Fill the host's content area instead of the whole window. For a page in
   * the portal layout, whose own top bar sits above the studio: sized to the
   * window, the studio ran off the bottom by that bar's height, and the page
   * scrolled behind it. On by default for a studio without its own top bar,
   * which is always hosted.
   */
  fitParent?: boolean

  /** Fires when there are, or are no longer, edits the host has not stored. */
  onDirtyChange?: (dirty: boolean) => void
}

/**
 * How a new back starts: from nothing, from the front, or from a picture the
 * buyer was sent by their designer.
 */
export type NewBackKind =
  | 'blank'
  | 'front'
  | { image: string; naturalWidth: number; naturalHeight: number }

/** Everything a host needs to store or print what is currently on the canvas. */
export interface StudioArtwork {
  design: DesignDocument
  layers: TemplateLayer[]
  canvasJson: string
  thumbnailUrl: string
  /**
   * The editable layers' current wording, keyed the way the cart and the
   * server's `acceptCustomisation` key them. Read off the canvas rather than
   * kept alongside it: the buyer can retype a field on the artwork itself, and
   * a value that disagreed with what is drawn is the one that would print.
   */
  values: Record<string, string>
}

export interface StudioHandle {
  /** The artwork as it stands, built on demand. */
  getArtwork: () => StudioArtwork | null
  /** The backs this design offers, and which one is on the canvas. */
  sides: () => {
    backs: { id: string; name: string }[]
    activeBackId: string | null
  }
  /** Put a side on the canvas. `null` is the front. */
  showSide: (backId: string | null) => void
  /** Add a back and open it. Returns its id. */
  addBack: (kind: NewBackKind, name?: string) => string
  /** Write values into the editable layers, as "Auto-fill branch info" does. */
  applyValues: (values: Record<string, string>) => void
  /**
   * True when there are edits the host has not been handed yet — a picture
   * still uploading to the image library among them.
   */
  isDirty: () => boolean
  /**
   * True while a picture is uploading to the image library. It lands on the
   * canvas when that finishes, so artwork read now would be without it.
   */
  isUploading: () => boolean
  /**
   * Opens the print preview — every side, drawn as it will print — over the
   * studio. For a host that draws its own bar, and so has no studio Preview
   * button to press. Resolves once the preview is showing, or has failed.
   *
   * `backId` previews that back instead of the design's default — `null` for
   * no back — for a host whose order prints a back of the buyer's choosing.
   */
  openPreview: (options?: { backId?: string | null }) => Promise<void>
}

/* ────────────────────────────────────────────────────────────────
   Constants
   ──────────────────────────────────────────────────────────────── */

const SIDEBAR_COMPONENTS = [
  { id: 'text', icon: Type, label: 'Text' },
  { id: 'number', icon: Hash, label: 'Number' },
  { id: 'barcode', icon: Barcode, label: 'Barcode' },
  { id: 'qrcode', icon: QrCode, label: 'QR code' },
  { id: 'rect', icon: Square, label: 'Rect' },
  { id: 'circle', icon: CircleIcon, label: 'Circle' },
  { id: 'polygon', icon: Triangle, label: 'Polygon' },
  { id: 'path', icon: PenTool, label: 'Pen' },
  { id: 'image', icon: ImageIcon, label: 'Image' },
  { id: 'line', icon: Minus, label: 'Line' },
  { id: 'rank', icon: Star, label: 'Rank' },
  { id: 'date', icon: Calendar, label: 'Date' },
]

/**
 * Layer types that hold wording a buyer can be handed.
 *
 * Mirrors `PERSONALISABLE_TYPES` on the server, which is what decides whether a
 * value sent with an order is accepted. Keeping the studio's own list in step
 * means the fields it offers are the fields the basket will take.
 */
const PERSONALISABLE_LAYER_TYPES: string[] = [
  'text',
  'badge',
  'qrcode',
  'barcode',
]

const FIELD_KEY_OPTIONS: {
  key: TemplateFieldKey
  label: string
  defaultPlaceholder: string
}[] = [
  {
    key: 'businessName',
    label: 'Business / Branch Name',
    defaultPlaceholder: 'Apex Midtown Central Health',
  },
  {
    key: 'contactName',
    label: 'Contact Person Name',
    defaultPlaceholder: 'Dr. Marcus Vance, PharmD',
  },
  {
    key: 'phone',
    label: 'Phone Number',
    defaultPlaceholder: '+1 (212) 555-0199',
  },
  {
    key: 'email',
    label: 'Official Email',
    defaultPlaceholder: 'contact@apexhealth.org',
  },
  {
    key: 'website',
    label: 'Website URL',
    defaultPlaceholder: 'https://apexhealth.org',
  },
  {
    key: 'address',
    label: 'Physical Address',
    defaultPlaceholder: '450 Lexington Ave, Suite 100',
  },
  {
    key: 'hours',
    label: 'Opening Hours',
    defaultPlaceholder: 'Mon-Sat 8AM-8PM',
  },
  { key: 'logo', label: 'Brand Logo', defaultPlaceholder: '' },
  {
    key: 'tagline',
    label: 'Tagline / Subhead',
    defaultPlaceholder: 'Excellence in Community Patient Care',
  },
  {
    key: 'promoOffer',
    label: 'Promotional Offer',
    defaultPlaceholder: 'Free Health Checks This Saturday',
  },
  {
    key: 'qrCode',
    label: 'QR Code Target',
    defaultPlaceholder: 'https://apexhealth.org',
  },
  {
    key: 'barcode',
    label: 'Barcode Value',
    defaultPlaceholder: '5901234123457',
  },
  { key: 'customNotes', label: 'Custom Notes', defaultPlaceholder: '' },
]

/** Fallback canvas for a brand-new template before a product is picked. */
const DEFAULT_DIMENSIONS: PrintTemplate['dimensions'] = {
  width: 8.27,
  height: 11.69,
  unit: 'in',
}

/** Reduce a width:height pair to its simplest whole-number ratio (3.5 x 2 -> "7:4"). */
function aspectRatioOf(w: number, h: number): string {
  const a = Math.round(w * 100)
  const b = Math.round(h * 100)
  const gcd = (x: number, y: number): number => (y ? gcd(y, x % y) : x)
  const d = gcd(a, b) || 1
  return `${a / d}:${b / d}`
}

/** Canvas setup derived from a catalogue size option. */
function setupFromSize(size: ProductSizeOption): Partial<PrintTemplate> {
  return setupFromInches(size.widthInches, size.heightInches)
}

function setupFromInches(w: number, h: number): Partial<PrintTemplate> {
  return {
    dimensions: { width: w, height: h, unit: 'in' },
    orientation: w > h ? 'landscape' : w < h ? 'portrait' : 'square',
    aspectRatio: aspectRatioOf(w, h),
  }
}

/**
 * The trim size a product prints at, from the product itself.
 *
 * `availableSizes` only exists when a product carries an option literally named
 * "Size", which most do not: a business card is 90x55mm and has options for
 * corners and finish. Choosing one used to leave the artboard at whatever size
 * it already was, so the designer drew an A4 sheet for a card.
 *
 * The millimetres on the row are the real trim, and they are on every product
 * that has a physical size at all. Returns null for one that has none — a
 * design service, say — where the honest answer is to leave the artboard alone.
 */
function setupFromProduct(product: Product): Partial<PrintTemplate> | null {
  const size =
    product.availableSizes?.find((s) => s.isPopular) ||
    product.availableSizes?.[0]
  // A size option whose dimensions are the product's own is the same answer by
  // a longer road; either way this is the trim.
  if (size?.widthInches && size?.heightInches) return setupFromSize(size)

  const w = product.widthMm
  const h = product.heightMm
  if (!w || !h) return null
  return {
    ...setupFromInches(
      Math.round((w / 25.4) * 1000) / 1000,
      Math.round((h / 25.4) * 1000) / 1000
    ),
    ...marginsFromProduct(product),
  }
}

/**
 * The bleed and safe margins the product is actually printed to.
 *
 * The artboard adopted a product's size but kept whatever margins the template
 * was carrying — for a new one, 0.375in of safe area, which is 9.5mm. On a
 * 90x35mm cap panel that leaves a strip 71mm by 16mm to design in, and on a
 * business card it puts the guide most of the way to the middle. Both are the
 * template's default rather than anything about the thing being printed.
 *
 * Only where the product says. A product with no margins on it leaves the
 * template's alone rather than resetting them to zero, which would draw a safe
 * area flush with the trim and quietly promise something no printer honours.
 */
function marginsFromProduct(product: Product): Partial<PrintTemplate> {
  const toIn = (mm: number) => Math.round((mm / 25.4) * 1000) / 1000
  return {
    ...(product.bleedMm != null ? { bleedMargin: toIn(product.bleedMm) } : {}),
    ...(product.safeMarginMm != null
      ? { safeMargin: toIn(product.safeMarginMm) }
      : {}),
  }
}

/**
 * Properties fabric can style per character. Anything here applies to just the
 * highlighted range while editing; everything else is object-level only.
 */
const CHAR_STYLE_KEYS = new Set([
  'fill',
  'fontSize',
  'fontFamily',
  'fontWeight',
  'fontStyle',
  'underline',
  'overline',
  'linethrough',
  'textBackgroundColor',
  'stroke',
  'strokeWidth',
])

/** Sizes offered in the text toolbar dropdown; any value can still be typed. */
/** Collapsed/expanded height of the contextual text toolbar. */
const TEXT_BAR_HEIGHT = 26

/** Widths of the Format and Effects menus under the text toolbar. */
const FORMAT_MENU_WIDTH = 204
const EFFECTS_MENU_WIDTH = 272

/**
 * The Remove BG working overlay's motion: a band of light crossing the picture
 * and a slow pulse of the veil over it. Transform and opacity only, so they
 * keep moving while the cut-out holds the page's thread.
 */
const BG_WORK_KEYFRAMES = `
@keyframes bg-work-sweep {
  from { transform: translateX(-100%); }
  to { transform: translateX(100%); }
}
@keyframes bg-work-pulse {
  0%, 100% { opacity: 0.75; }
  50% { opacity: 1; }
}
`

/** Every menu that hangs under the floating text and image toolbars. */
type ToolbarMenuKind = 'format' | 'effects' | 'adjust' | 'removebg' | 'opacity'

const MENU_WIDTHS: Record<ToolbarMenuKind, number> = {
  format: FORMAT_MENU_WIDTH,
  effects: EFFECTS_MENU_WIDTH,
  adjust: 304,
  removebg: 284,
  opacity: 284,
}

/** The image toolbar's Opacity button: a chequerboard, the usual sign for see-through. */
function TransparencyIcon({ size = 15 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden="true">
      <rect
        x="1"
        y="1"
        width="14"
        height="14"
        rx="2"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.2"
      />
      <path
        d="M1.6 1.6h3.47v3.47H1.6zM8.53 1.6H12v3.47H8.53zM5.07 5.07h3.46v3.46H5.07zM12 5.07h2.4v3.46H12zM1.6 8.53h3.47V12H1.6zM8.53 8.53H12V12H8.53zM5.07 12h3.46v2.4H5.07zM12 12h2.4v2.4H12z"
        fill="currentColor"
      />
    </svg>
  )
}

/** The Adjust menu's sliders, in the image filters' own units. */
const IMAGE_ADJUSTMENTS: {
  key: keyof ImageFilters
  label: string
  min: number
  max: number
  step: number
  /** A strip showing what moving the slider does. */
  track: string
}[] = [
  {
    key: 'hue',
    label: 'Hue',
    min: -180,
    max: 180,
    step: 1,
    track:
      'linear-gradient(90deg,#ff0000,#ffff00,#00ff00,#00ffff,#0000ff,#ff00ff,#ff0000)',
  },
  {
    key: 'saturation',
    label: 'Saturation',
    min: -1,
    max: 1,
    step: 0.01,
    track: 'linear-gradient(90deg,#9ca3af,#f59e0b)',
  },
  {
    key: 'brightness',
    label: 'Brightness',
    min: -1,
    max: 1,
    step: 0.01,
    track: 'linear-gradient(90deg,#000000,#ffffff)',
  },
]

const FONT_SIZES = [
  8, 9, 10, 11, 12, 14, 16, 18, 20, 24, 28, 32, 36, 42, 48, 56, 64, 72, 96, 128,
]

const FONT_OPTIONS = [
  'Inter',
  'Arial',
  'Helvetica',
  'Times New Roman',
  'Georgia',
  'Courier New',
  'Verdana',
  'Trebuchet MS',
  'Impact',
]

const BLEND_MODES = [
  'normal',
  'multiply',
  'screen',
  'overlay',
  'darken',
  'lighten',
  'color-dodge',
  'color-burn',
  'hard-light',
  'soft-light',
  'difference',
  'exclusion',
  'hue',
  'saturation',
  'color',
  'luminosity',
]

const THEME_OPTIONS: TemplateTheme[] = [
  'modern',
  'corporate',
  'healthcare',
  'promotional',
  'minimalist',
  'luxury',
  'vibrant',
  'retail',
  'grand-opening',
]

const COLOR_SWATCHES = [
  '#ffffff',
  '#f8fafc',
  '#94a3b8',
  '#334155',
  '#0f172a',
  '#000000',
  '#ef4444',
  '#ec4899',
  '#f43f5e',
  '#f97316',
  '#3b82f6',
  '#0284c7',
  '#06b6d4',
  '#0d9488',
  '#10b981',
  '#059669',
  '#84cc16',
  '#eab308',
  '#f59e0b',
  '#8b5cf6',
  '#7c3aed',
  '#4f46e5',
]

/** The pasteboard: the surface the artboard floats on. */
const PASTEBOARD_COLOR = '#e2e8f0'

/**
 * How strongly artwork hanging off the artboard is washed out. At 0.82 the
 * overhang is still legible enough to grab and drag back, which is the whole
 * reason for dimming it rather than clipping it away.
 */
const PASTEBOARD_DIM = 0.82

/**
 * How far the dim extends beyond the artboard, in canvas units.
 *
 * It has to cover the viewport at the lowest zoom `fitToScreen` will settle on
 * (0.05), where a wide monitor still only sees some tens of thousands of canvas
 * units. Generous, and free: the mask is never cached, so its size costs
 * nothing beyond the one fill it already does.
 */
const PASTEBOARD_PAD = 50_000

/** Extra fabric props that must survive toJSON / loadFromJSON round-trips. */
const CUSTOM_PROPS = [
  'layerId',
  'layerName',
  'layerLabel',
  'customType',
  'scanUrl',
  'fieldKey',
  'isEditableBySiteUser',
  'isRequired',
  'helperText',
  'isPrintArea',
  'isGuide',
  'isPasteboardMask',
  'isMockup',
  'placeholderText',
  'selectable',
  'evented',
  // Letter case and text effects. Kept through undo, copy and duplicate, or
  // an undone edit would come back without the typed text behind its case.
  ...TEXT_STYLE_PROPS,
  // A picture's frame and how it sits in it, so Fill and Fit survive undo,
  // copy and duplicate.
  ...IMAGE_STYLE_PROPS,
]

const FIELD_LABELS: Record<string, string> = Object.fromEntries(
  FIELD_KEY_OPTIONS.map((f) => [f.key, f.label])
)

const UNIT_TO_PX: Record<string, number> = { in: 96, mm: 96 / 25.4, px: 1 }

/**
 * The pack size a linked product fixes on its designs, or null when it fixes none.
 *
 * A product that counts stock reserves and ships in its own packs, and the
 * server refuses to publish a design claiming a different one — see
 * `assertPublishable`. So for those the builder takes the product's number
 * rather than asking for it: a field with exactly one acceptable answer is a
 * field that can only be got wrong, and it was, at publish, with the reason two
 * screens away. Print-on-demand holds no stock and prices in any pack it likes.
 *
 * An unset `trackInventory` counts as stocked, because that is the column's
 * default.
 */
function stockedPackSize(product: Product | undefined): number | null {
  if (!product || product.trackInventory === false) return null
  return parsePackSize(product.packSize)
}

/**
 * Selection chrome: round dot handles and a dashed outline, rather than fabric's
 * default hollow squares. Set on the prototype so every object gets it - ones
 * drawn now, and ones rebuilt from a saved template later.
 *
 * The outline is blue, not red: red dashed is already the bleed guide, and two
 * red dashed rectangles on the same sheet would be genuinely confusing.
 */
/**
 * Fabric renders each object into an offscreen cache, budgeted at 2M pixels by
 * default. A large-format sheet blows straight past that - a 33x80in banner is
 * 24.3M px, nearly 12x over - and fabric responds by rendering the cache at a
 * reduced scale and blowing it back up, which is visibly soft. Raise the budget
 * so print-sized artwork renders at its true resolution.
 */
// These tuning knobs are real at runtime but missing from @types/fabric.
const fabricTuning = fabric as unknown as {
  perfLimitSizeTotal: number
  maxCacheSideLimit: number
  textureSize: number
  devicePixelRatio: number
}
fabricTuning.perfLimitSizeTotal = 33554432 // 32M px
fabricTuning.maxCacheSideLimit = 11000 // covers a 100in edge at 96dpi
fabricTuning.textureSize = 4096 // filter resolution for large images

Object.assign(fabric.Object.prototype, {
  cornerStyle: 'circle',
  cornerSize: 9,
  touchCornerSize: 22,
  cornerColor: '#93c5fd',
  cornerStrokeColor: '#60a5fa',
  transparentCorners: false,
  borderColor: '#3b82f6',
  borderDashArray: [3, 3],
  borderScaleFactor: 1.4,
  padding: 2,
})

/**
 * Rebuild a QR or barcode bitmap when the document model restores one. Passed to
 * objectsToCanvas so serialization stays free of encoder dependencies.
 */
/**
 * The builder shows a specimen code before anyone has typed a payload, so an
 * administrator can size and place the space. The customiser deliberately does
 * not — see `lib/design/codes.ts`.
 */
const renderCodeBitmap = (type: 'barcode' | 'qrcode', value: string) =>
  renderCodeShared(type, value, CODE_PLACEHOLDERS)

const QR_DISPLAY_PX = 140
const BARCODE_DISPLAY_PX = 220

type FabricAny = fabric.Object & Record<string, any>

/**
 * Whether a canvas still has the overlay context fabric draws selections on.
 *
 * `contextTop` is real but absent from @types/fabric, hence the cast. It is
 * null on a canvas that has been disposed, and on one whose initialisation was
 * interrupted -- and `setDimensions` on such a canvas arms `hasLostContext`,
 * which sends the next `renderAll` down the one branch in fabric that passes a
 * null context to `renderTopLayer`, whose first statement is `ctx.save()`.
 */
const hasTopContext = (canvas: fabric.Canvas): boolean =>
  Boolean((canvas as unknown as { contextTop?: unknown }).contextTop)

/* ────────────────────────────────────────────────────────────────
   Geometry + serialization helpers
   ──────────────────────────────────────────────────────────────── */

/** Print area size in canvas pixels, derived from the template's real-world dimensions. */
function printAreaPx(dims: PrintTemplate['dimensions']) {
  const factor = UNIT_TO_PX[dims.unit] ?? 96
  return {
    w: Math.max(40, Math.round(dims.width * factor)),
    h: Math.max(40, Math.round(dims.height * factor)),
  }
}

/**
 * The shop-side customizer renders layers inside a fixed-width preview box and
 * treats style.fontSize as raw px in that box. Store font sizes in that space so
 * text comes out proportionally correct there. Mirrors TemplateCustomizerStudio.
 */
function previewBaseWidth(orientation: PrintTemplate['orientation']) {
  return orientation === 'portrait' ? 380 : orientation === 'square' ? 440 : 540
}

function mapToLayerType(obj: FabricAny): TemplateLayerType {
  const ct = obj.customType
  if (ct === 'qrcode') return 'qrcode'
  if (ct === 'barcode') return 'barcode'
  if (ct === 'logo') return 'logo'
  if (ct === 'image') return 'image'
  if (ct === 'rank' || ct === 'badge') return 'badge'
  switch (obj.type) {
    case 'i-text':
    case 'text':
    case 'textbox':
      return 'text'
    case 'line':
      return 'divider'
    case 'image':
      return 'image'
    default:
      return 'shape'
  }
}

function defaultNameFor(type: string) {
  const found = SIDEBAR_COMPONENTS.find((c) => c.id === type)
  return found ? found.label : 'Layer'
}

/** Vertices of a regular n-gon inscribed in `radius`, first point at the top. */
function regularPolygonPoints(sides: number, radius: number) {
  const n = Math.max(3, Math.min(24, Math.round(sides)))
  return Array.from({ length: n }, (_, i) => {
    const a = (i / n) * Math.PI * 2 - Math.PI / 2
    return {
      x: radius + radius * Math.cos(a),
      y: radius + radius * Math.sin(a),
    }
  })
}

/**
 * SVG path data through a set of anchors. `smooth` emits quadratic Béziers whose
 * control points are the anchors and whose endpoints are the midpoints between
 * them - the standard way to draw a curve that passes smoothly through a
 * polyline without asking the user to place control handles by hand.
 */
function pathFromPoints(
  pts: { x: number; y: number }[],
  smooth: boolean,
  closed: boolean
): string {
  if (pts.length < 2) return ''
  if (!smooth) {
    const d =
      `M ${pts[0].x} ${pts[0].y} ` +
      pts
        .slice(1)
        .map((p) => `L ${p.x} ${p.y}`)
        .join(' ')
    return closed ? `${d} Z` : d
  }
  const mid = (a: { x: number; y: number }, b: { x: number; y: number }) => ({
    x: (a.x + b.x) / 2,
    y: (a.y + b.y) / 2,
  })
  let d = `M ${pts[0].x} ${pts[0].y}`
  for (let i = 1; i < pts.length - 1; i++) {
    const m = mid(pts[i], pts[i + 1])
    d += ` Q ${pts[i].x} ${pts[i].y} ${m.x} ${m.y}`
  }
  const last = pts[pts.length - 1]
  d += ` L ${last.x} ${last.y}`
  return closed ? `${d} Z` : d
}

/** QR codes and barcodes are fabric Images too, so `type === 'image'` is not enough. */
function isCodeLayer(o: FabricAny | null | undefined): boolean {
  if (!o) return false
  return (
    o.customType === 'qrcode' ||
    o.customType === 'barcode' ||
    o.designType === 'qrcode' ||
    o.designType === 'barcode' ||
    o.scanUrl !== undefined ||
    o.codeValue !== undefined
  )
}

/**
 * A real picture layer - an uploaded image, a logo, or the empty placeholder
 * dropped from the palette. Machine-readable codes are explicitly excluded:
 * replacing or cropping their bitmap would corrupt them.
 */
function isPhotoLayer(o: FabricAny | null | undefined): boolean {
  if (!o || isCodeLayer(o)) return false
  const ct = o.customType || o.designType
  if (ct === 'image' || ct === 'logo') return true
  return !ct && o.type === 'image'
}

/** True for the print area, the bleed/safe guides and the pasteboard dim -
 *  never serialized as layers. */
function isChrome(obj: FabricAny) {
  return (
    !!obj.isPrintArea ||
    !!obj.isGuide ||
    !!obj.isPasteboardMask ||
    !!obj.isMockup
  )
}

/**
 * Whether an object is still on the canvas, directly or inside a group.
 *
 * For work that finishes after an upload: the object it was for may have been
 * deleted meanwhile, or replaced by a fresh instance by undo. A multi-selection
 * is not a parent — its members are still the canvas's own objects.
 */
function isOnCanvas(c: fabric.Canvas, o: FabricAny): boolean {
  let top: FabricAny = o
  while (top.group && top.group.type !== 'activeSelection') {
    top = top.group as FabricAny
  }
  return c.getObjects().includes(top)
}

/** Absolute canvas box of a clip shape. */
type ClipBox = {
  left: number
  top: number
  width: number
  height: number
  kind: string
}

/** An object's true canvas-space geometry, group transforms already folded in. */
type AbsGeom = {
  left: number
  top: number
  width: number
  height: number
  angle: number
  scaleX: number
  scaleY: number
}

/**
 * Absolute geometry via fabric's own matrix maths. `calcTransformMatrix` walks up
 * through every parent group, so this is correct for nested groups and for groups
 * that have been rotated or scaled - none of which hand-rolled offset maths gets
 * right.
 */
function absoluteGeom(obj: FabricAny): AbsGeom {
  const d = fabric.util.qrDecompose(obj.calcTransformMatrix())
  const scaleX = Math.abs(d.scaleX)
  const scaleY = Math.abs(d.scaleY)
  const width = (obj.width || 0) * scaleX
  const height = (obj.height || 0) * scaleY
  // qrDecompose reports the centre; layers are stored top-left.
  return {
    left: d.translateX - width / 2,
    top: d.translateY - height / 2,
    width,
    height,
    angle: d.angle,
    scaleX,
    scaleY,
  }
}

/**
 * Translate a fabric mask into a CSS clip-path relative to the layer's own box,
 * so the storefront hides exactly what the builder hides. Without this a masked
 * image would render there fully un-clipped.
 */
function clipPathToCss(
  obj: FabricAny,
  geom: AbsGeom,
  inherited?: ClipBox | null
): string | undefined {
  // `inherited` carries a parent group's mask down to the children the flat
  // layer list emits - without it, masked content renders unclipped in the shop.
  const own = obj.clipPath as FabricAny | undefined
  const box = inherited || (own ? absoluteClipBox(own, obj) : null)
  if (!box || geom.width <= 0 || geom.height <= 0) return undefined

  const cw = box.width
  const ch = box.height
  const cl = box.left
  const ct = box.top
  const clip = { type: box.kind, rx: (own as FabricAny | undefined)?.rx }
  if (cw <= 0 || ch <= 0) return undefined

  const pct = (n: number) => `${Math.round(n * 1000) / 10}%`

  if (clip.type === 'circle' || clip.type === 'ellipse') {
    const rx = cw / 2 / geom.width
    const ry = ch / 2 / geom.height
    const cx = (cl + cw / 2 - geom.left) / geom.width
    const cy = (ct + ch / 2 - geom.top) / geom.height
    return `ellipse(${pct(rx)} ${pct(ry)} at ${pct(cx)} ${pct(cy)})`
  }

  // Rect and anything else: inset from each edge, clamped so an oversized mask
  // simply does not clip.
  const insetL = Math.max(0, (cl - geom.left) / geom.width)
  const insetT = Math.max(0, (ct - geom.top) / geom.height)
  const insetR = Math.max(0, (geom.left + geom.width - (cl + cw)) / geom.width)
  const insetB = Math.max(0, (geom.top + geom.height - (ct + ch)) / geom.height)
  if (!insetL && !insetT && !insetR && !insetB) return undefined

  const radius = clip.rx ? ` round ${Math.round(clip.rx)}px` : ''
  return `inset(${pct(insetT)} ${pct(insetR)} ${pct(insetB)} ${pct(insetL)}${radius})`
}

/** Convert a fabric object into the percentage-based TemplateLayer the rest of the app consumes. */
function fabricToLayer(
  obj: FabricAny,
  pa: fabric.Rect,
  zIndex: number,
  fontScale: number,
  inheritedClip?: ClipBox | null
): TemplateLayer {
  const paL = pa.left || 0
  const paT = pa.top || 0
  const paW = pa.width || 1
  const paH = pa.height || 1

  // Fold in any parent-group transform rather than reading raw left/top, which
  // are group-relative for a child and would place it wrongly.
  const geom = absoluteGeom(obj)
  const w = geom.width
  const h = geom.height
  const type = mapToLayerType(obj)

  const style: TemplateLayerStyle = { opacity: obj.opacity ?? 1 }
  const clipCss = clipPathToCss(obj, geom, inheritedClip)
  if (clipCss) style.clipPath = clipCss

  if (obj.type === 'i-text' || obj.type === 'text' || obj.type === 'textbox') {
    const t = obj as unknown as fabric.IText
    style.fontSize = Math.max(
      1,
      Math.round((t.fontSize || 16) * geom.scaleY * fontScale)
    )
    style.fontFamily = t.fontFamily || 'Inter'
    style.fontWeight = (t.fontWeight as string | number) || 'normal'
    style.fontStyle = (t.fontStyle as 'normal' | 'italic') || 'normal'
    style.color = (t.fill as string) || '#000000'
    style.textAlign = (t.textAlign as 'left' | 'center' | 'right') || 'left'
    style.lineHeight = t.lineHeight || 1.16
    style.letterSpacing = t.charSpacing
      ? Math.round((t.charSpacing / 1000) * (t.fontSize || 16) * fontScale)
      : 0
    // The layer keeps the text as typed; its case goes out as CSS.
    const textCase = (obj as FabricAny).textCase
    if (textCase === 'upper') style.textTransform = 'uppercase'
    else if (textCase === 'lower') style.textTransform = 'lowercase'
  } else {
    // Not for a picture. `fill` on a fabric image is the paint behind a bitmap
    // that covers it, and it defaults to black - so an image layer was going
    // out with `backgroundColor: rgb(0,0,0)`, and every renderer that draws a
    // layer's background before its content painted a solid black rectangle
    // where the photograph should be.
    if (type !== 'image' && type !== 'logo') {
      style.backgroundColor = (obj.fill as string) || 'transparent'
    }
    style.borderColor = (obj.stroke as string) || undefined
    style.borderWidth = obj.strokeWidth || 0
    if (obj.type === 'circle')
      style.borderRadius = Math.round(Math.min(w, h) / 2)
    else if ((obj as any).rx) style.borderRadius = Math.round((obj as any).rx)
  }

  let content = ''
  if (type === 'text' || type === 'badge') {
    content = rawTextOf(obj as FabricAny)
  } else if (type === 'qrcode' || type === 'barcode') {
    content = obj.scanUrl || ''
  } else if (type === 'image' || type === 'logo') {
    // A picture that would not load stands in as a rectangle carrying its
    // address, which is written back so the flat list does not lose it either.
    content =
      typeof (obj as any).getSrc === 'function'
        ? (obj as any).getSrc()
        : obj[UNLOADED_SRC_PROP] || obj.src || ''
  }

  const name =
    obj.layerName || defaultNameFor(obj.customType || obj.type || 'layer')

  return {
    id: obj.layerId || `layer-${Math.random().toString(36).slice(2, 10)}`,
    type,
    name,
    isEditableBySiteUser: !!obj.isEditableBySiteUser,
    fieldKey: obj.fieldKey || undefined,
    label: obj.layerLabel || name,
    helperText: obj.helperText || undefined,
    x: Number((((geom.left - paL) / paW) * 100).toFixed(2)),
    y: Number((((geom.top - paT) / paH) * 100).toFixed(2)),
    width: Number(((w / paW) * 100).toFixed(2)),
    height: Number(((h / paH) * 100).toFixed(2)),
    content,
    style,
    zIndex,
    rotation: Math.round(geom.angle || 0),
    isRequired: !!obj.isRequired,
  }
}

/** Rebuild a fabric object from a stored TemplateLayer. Async for image-backed layers. */
function layerToFabric(
  layer: TemplateLayer,
  pa: { left: number; top: number; width: number; height: number },
  fontScale: number
): Promise<fabric.Object | null> {
  // A layer arrives as JSON the server passed through without inspecting: the
  // validation schema has opinions about a layer's identity and editability and
  // deliberately none about its style or geometry. So a template created through
  // the API -- which is how every customer copy is made -- can carry a layer
  // with no `style` at all, and reading through it white-screened the whole
  // builder on a page that had rendered nothing yet. Defaults here, once,
  // rather than seventeen optional chains below.
  const style: TemplateLayerStyle = layer.style ?? {}
  const at = (v: number | undefined, fallback: number) =>
    typeof v === 'number' && Number.isFinite(v) ? v : fallback

  const left = pa.left + (at(layer.x, 5) / 100) * pa.width
  const top = pa.top + (at(layer.y, 5) / 100) * pa.height
  const width = (at(layer.width, 30) / 100) * pa.width
  const height = (at(layer.height, 10) / 100) * pa.height

  const shared = {
    left,
    top,
    originX: 'left' as const,
    originY: 'top' as const,
    angle: layer.rotation || 0,
    opacity: style.opacity ?? 1,
  }

  const tagOn = (o: FabricAny) => {
    o.layerId = layer.id
    o.layerName = layer.name
    o.layerLabel = layer.label
    o.fieldKey = layer.fieldKey
    o.isEditableBySiteUser = layer.isEditableBySiteUser
    o.isRequired = layer.isRequired
    o.helperText = layer.helperText
    return o
  }

  return new Promise((resolve) => {
    if (layer.type === 'text' || layer.type === 'badge') {
      const t = new fabric.IText(layer.content || ' ', {
        ...shared,
        fontSize: Math.max(1, (style.fontSize || 14) / (fontScale || 1)),
        fontFamily: style.fontFamily || 'Inter',
        fontWeight: style.fontWeight || 'normal',
        fontStyle: style.fontStyle || 'normal',
        fill: style.color || '#000000',
        textAlign: style.textAlign || 'left',
        lineHeight: style.lineHeight || 1.16,
      }) as FabricAny
      // The flat layer holds the typed text and the case as CSS; the canvas
      // shows it cased, as the design document does.
      if (style.textTransform === 'uppercase') applyTextCaseToFabric(t, 'upper')
      else if (style.textTransform === 'lowercase')
        applyTextCaseToFabric(t, 'lower')
      if (layer.type === 'badge') t.customType = 'rank'
      resolve(tagOn(t))
      return
    }

    if (layer.type === 'qrcode') {
      qrDataUrl(layer.content || 'https://example.com').then((url) => {
        if (!url) return resolve(null)
        fabric.Image.fromURL(url, (img) => {
          const o = img as FabricAny
          o.set(shared)
          o.customType = 'qrcode'
          o.scanUrl = layer.content
          o.scaleToWidth(width > 0 ? width : QR_DISPLAY_PX)
          resolve(tagOn(o))
        })
      })
      return
    }

    if (layer.type === 'barcode') {
      try {
        fabric.Image.fromURL(
          barcodeDataUrl(layer.content || '123456789'),
          (img) => {
            const o = img as FabricAny
            o.set(shared)
            o.customType = 'barcode'
            o.scanUrl = layer.content
            o.scaleToWidth(width > 0 ? width : BARCODE_DISPLAY_PX)
            resolve(tagOn(o))
          }
        )
      } catch {
        resolve(null)
      }
      return
    }

    if (layer.type === 'image' || layer.type === 'logo') {
      if (!layer.content) {
        const ph = new fabric.Rect({
          ...shared,
          width: Math.max(1, width),
          height: Math.max(1, height),
          fill: '#e5e7eb',
          stroke: '#9ca3af',
          strokeDashArray: [4, 4],
          strokeWidth: 1,
        }) as FabricAny
        ph.customType = layer.type
        return resolve(tagOn(ph))
      }
      const src = layer.content
      void loadFabricImage(src).then((img) => {
        if (!img) {
          // Stood in for rather than dropped, so the design opens and a save
          // keeps the address. See `unloadedImagePlaceholder`.
          const ph = unloadedImagePlaceholder(
            {
              ...shared,
              width: Math.max(1, width),
              height: Math.max(1, height > 0 ? height : width),
            },
            src
          )
          ph.customType = layer.type
          return resolve(tagOn(ph))
        }
        const o = img as FabricAny
        o.set(shared)
        o.customType = layer.type
        if (width > 0) o.scaleToWidth(width)
        resolve(tagOn(o))
      })
      return
    }

    if (layer.type === 'divider') {
      const l = new fabric.Line([0, 0, width || 80, height || 0], {
        ...shared,
        stroke: style.borderColor || style.backgroundColor || '#000000',
        strokeWidth: style.borderWidth || 1,
      }) as FabricAny
      l.customType = 'line'
      applyLineControls(l)
      resolve(tagOn(l))
      return
    }

    // shape (rect / circle)
    const isCircle =
      !!style.borderRadius && style.borderRadius >= Math.min(width, height) / 2
    const shape = isCircle
      ? (new fabric.Circle({
          ...shared,
          radius: Math.max(1, width / 2),
        }) as FabricAny)
      : (new fabric.Rect({
          ...shared,
          width: Math.max(1, width),
          height: Math.max(1, height),
          rx: style.borderRadius || 0,
          ry: style.borderRadius || 0,
        }) as FabricAny)
    shape.set({
      fill: style.backgroundColor || 'transparent',
      stroke: style.borderColor || '#000000',
      strokeWidth: style.borderWidth ?? 1,
    })
    shape.customType = isCircle ? 'circle' : 'rect'
    resolve(tagOn(shape))
  })
}

/* ────────────────────────────────────────────────────────────────
   Component
   ──────────────────────────────────────────────────────────────── */

/**
 * A short, stable key for a picture's source, to look one up by value.
 *
 * Sources are often data URLs megabytes long, and a map keyed by the string
 * itself would keep another copy of each alive. Length plus FNV-1a over
 * characters sampled across it and its tail — the same idea as the history's
 * long-string fingerprint.
 */
function pictureSourceKey(src: string): string {
  let hash = 0x811c9dc5
  const step = Math.max(1, Math.floor(src.length / 2000))
  for (let i = 0; i < src.length; i += step) {
    hash ^= src.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  for (let i = Math.max(0, src.length - 256); i < src.length; i++) {
    hash ^= src.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  return `${src.length}:${(hash >>> 0).toString(36)}`
}

/** How many cut-outs remember their original at once; the oldest go first. */
const CUTOUT_ORIGINALS_LIMIT = 50

function rememberCutoutOriginal(
  originals: Map<string, string>,
  cutoutSrc: string,
  original: string
): void {
  const key = pictureSourceKey(cutoutSrc)
  originals.delete(key)
  originals.set(key, original)
  while (originals.size > CUTOUT_ORIGINALS_LIMIT) {
    const oldest = originals.keys().next().value
    if (oldest === undefined) break
    originals.delete(oldest)
  }
}

export function TemplateBuilderStudio({
  initialTemplate,
  isNew = false,
  mode = 'catalogue',
  canPublish = true,
  onArtworkSave,
  onReady,
  showHeader = true,
  fitParent = !showHeader,
  onDirtyChange,
}: TemplateBuilderStudioProps) {
  const isCustomise = mode === 'customise'
  // Both non-operator modes get Editable Fields where the operator gets
  // Personalisation: one fills the layers in, the other chooses which ones can
  // be filled in, and only the operator is choosing.
  const isOwned = mode !== 'catalogue'
  const router = useRouter()
  const { createTemplate, updateTemplate } = useTemplateMutations()

  // Templates can be built for anything in the catalogue - signs, banners,
  // flyers, business cards - not a fixed list baked into this component.
  const { data: productPage, isLoading: productsLoading } = useProducts({
    pageSize: 100,
  })
  const products = useMemo(() => productPage?.items || [], [productPage])
  // Read by the save, which is a callback that outlives the render it was made in.
  const productsRef = useRef(products)
  productsRef.current = products

  // What a design costs is the print team's decision, so everyone else reads it
  // rather than sets it. The server drops these fields from a save by anyone
  // without the permission regardless — this only stops a customer being shown
  // an input whose value would be silently discarded.
  const { hasPermission } = useAuth()
  const canSetPrice = hasPermission('PRICING_MANAGE')

  // The image library (DAM), reached with the user's own Ticket-IT session.
  // Both false for a portal-native user, who has none: their pictures embed in
  // the design exactly as they always did, and no library button is shown.
  const { canBrowse: canBrowseDam, canUpload: canUploadDam } = useDamAccess()
  const damSessionLost = useDamSessionLost()

  const canvasRef = useRef<HTMLCanvasElement>(null)
  const wrapperRef = useRef<HTMLDivElement>(null)
  const fabricRef = useRef<fabric.Canvas | null>(null)
  const printAreaRef = useRef<fabric.Rect | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [zoom, setZoom] = useState(100)
  const [activeObj, setActiveObj] = useState<FabricAny | null>(null)
  const [revision, setRevision] = useState(0)
  const [leftTab, setLeftTab] = useState<'component' | 'collection'>(
    'component'
  )
  const [rightTab, setRightTab] = useState<'style' | 'info'>('style')
  const [toast, setToast] = useState<{
    kind: 'ok' | 'err' | 'info'
    msg: string
  } | null>(null)
  /**
   * The sides the preview modal is showing, or null when it is closed.
   *
   * A list rather than the single thumbnail this used to hold. A design with a
   * back is two things that get printed, and a preview that showed only
   * whichever face happened to be open was answering a different question from
   * the one being asked — "is this right to send" is about the whole garment.
   */
  const [preview, setPreview] = useState<
    { name: string; url: string; blank?: boolean }[] | null
  >(null)
  const [previewBusy, setPreviewBusy] = useState(false)
  /** Which frame of the spin set is facing the viewer. */
  const [spinFrame, setSpinFrame] = useState(0)
  /**
   * How far the artwork has been turned, in degrees.
   *
   * A continuous angle rather than a "which side" flag, because the turn is the
   * point: at 90° the sheet is edge-on, and a boolean cannot express that. Even
   * multiples of 180 face the front, odd ones the back.
   */
  const [flipDeg, setFlipDeg] = useState(0)
  const [showGuides, setShowGuides] = useState(true)
  const [isEditingTitle, setIsEditingTitle] = useState(false)

  /* ── Canvas engine (point 1) ── */
  const canvasFrameRef = useRef<HTMLDivElement>(null)
  const normalizeStackRef = useRef<((c: fabric.Canvas) => void) | null>(null)
  const resetHistoryRef = useRef<(() => void) | null>(null)
  const altDragRef = useRef<((o: FabricAny) => void) | null>(null)
  const runAtomicRef = useRef<
    (<T>(label: HistoryLabel, fn: () => T) => T) | null
  >(null)
  const markDirtyRef = useRef<(() => void) | null>(null)
  /**
   * The handle handed to a host is built once, so everything it reaches for
   * goes through a ref. Otherwise the host would be holding the first render's
   * closures - the canvas of a template it opened, not the one being edited.
   */
  const personalisableLayersRef = useRef<{ o: FabricAny }[]>([])
  const buildArtworkRef = useRef<(() => StudioArtwork | null) | null>(null)
  const applyFieldValuesRef = useRef<
    ((values: Record<string, string>) => void) | null
  >(null)
  const openPreviewRef = useRef<StudioHandle['openPreview'] | null>(null)
  const dirtyRef = useRef<string | null>(null)
  /**
   * Counts every edit marked dirty. A save reads it before building what it
   * sends and clears dirty only if it has not moved since — an edit that lands
   * while the save is in flight was not in it.
   */
  const dirtyGenRef = useRef(0)
  /** Uploads to the image library in flight, for the host's handle. */
  const damUploadsRef = useRef(0)
  /** See `reportUnloadedImages`; a ref because the loaders run before it exists. */
  const reportUnloadedImagesRef = useRef<
    ((objects: fabric.Object[]) => void) | null
  >(null)
  /** Addresses already reported as not loading. */
  const unloadedToldRef = useRef(new Set<string>())
  const selectLayerRef = useRef<
    ((o: FabricAny, additive?: boolean) => void) | null
  >(null)
  const rulerHRef = useRef<HTMLCanvasElement>(null)
  const rulerVRef = useRef<HTMLCanvasElement>(null)
  const [rulerUnit, setRulerUnit] = useState<DesignUnit>('in')
  const [showRulers, setShowRulers] = useState(true)
  const [showGrid, setShowGrid] = useState(false)
  const [gridSpacing, setGridSpacing] = useState(24)
  const [snapGrid, setSnapGrid] = useState(false)
  const [bgTransparent, setBgTransparent] = useState(false)
  const [canvasDpi, setCanvasDpi] = useState(300)
  /** Guides the user dragged off the rulers, in canvas px. */
  const userGuidesRef = useRef<{ horizontal: number[]; vertical: number[] }>({
    horizontal: [],
    vertical: [],
  })
  const [guideDrag, setGuideDrag] = useState<'h' | 'v' | null>(null)
  /** Mirrors the ref so the toolbar's clear button reacts to guide changes. */
  const [guideCount, setGuideCount] = useState(0)
  /** The guide currently being dragged on the canvas, if any. */
  const movingGuideRef = useRef<{ axis: 'h' | 'v'; index: number } | null>(null)
  const syncGuideCountRef = useRef<(() => void) | null>(null)
  const removeGuideRef = useRef<((a: 'h' | 'v', i: number) => void) | null>(
    null
  )
  const guideAtRef = useRef<
    | ((p: {
        x: number
        y: number
      }) => { axis: 'h' | 'v'; index: number } | null)
    | null
  >(null)
  const spaceDownRef = useRef(false)
  const [spacePanning, setSpacePanning] = useState(false)

  // Live values for fabric handlers bound once at init.
  const snapGridRef = useRef(snapGrid)
  const gridSpacingRef = useRef(gridSpacing)
  const showGridRef = useRef(showGrid)
  const drawRulersRef = useRef<(() => void) | null>(null)
  useEffect(() => {
    snapGridRef.current = snapGrid
  }, [snapGrid])
  useEffect(() => {
    gridSpacingRef.current = gridSpacing
  }, [gridSpacing])
  useEffect(() => {
    showGridRef.current = showGrid
    fabricRef.current?.requestRenderAll()
  }, [showGrid])

  // The canvas init effect runs once; these let its handlers reach the latest
  // callbacks without re-binding every fabric listener.
  const openGroupEditRef = useRef<((o: FabricAny) => void) | null>(null)
  const enterMaskContentRef = useRef<((o: FabricAny) => void) | null>(null)
  const openImagePickerRef = useRef<((o: FabricAny) => void) | null>(null)

  /** Which object a pending file-picker choice should fill. */
  const uploadTargetRef = useRef<FabricAny | null>(null)

  /** Open the OS file picker, optionally aimed at an existing layer. */
  const openImagePicker = useCallback((target?: FabricAny | null) => {
    uploadTargetRef.current = target || null
    fileInputRef.current?.click()
  }, [])

  /**
   * What a pick from the image library should fill: a layer (a new image when
   * null), or the mockup photo. A ref as well as state, because the picker
   * closes itself straight after `onPick` and the target must outlive that.
   */
  const libraryRequestRef = useRef<FabricAny | null | 'mockup'>(null)
  const [libraryFor, setLibraryFor] = useState<'layer' | 'mockup' | null>(null)

  /** Open the image library, aimed like `openImagePicker`, or at the mockup. */
  const openImageLibrary = useCallback(
    (target: FabricAny | null | 'mockup') => {
      libraryRequestRef.current = target
      setLibraryFor(target === 'mockup' ? 'mockup' : 'layer')
    },
    []
  )

  /**
   * The newest request for each layer. A slow upload finishing after a later
   * one for the same space would otherwise put the older picture back.
   * Returns whether this request is still the newest when asked.
   */
  const placementSeqRef = useRef(new Map<string, number>())
  const claimPlacement = useCallback((target: FabricAny | null) => {
    const key = target?.layerId as string | undefined
    if (!key) return () => true
    const seq = (placementSeqRef.current.get(key) ?? 0) + 1
    placementSeqRef.current.set(key, seq)
    return () => placementSeqRef.current.get(key) === seq
  }, [])

  /**
   * Library work in flight — uploads, and checks that a picked picture can be
   * used — shown as a status pill until it finishes. Counted rather than put
   * in a toast, whose timers would clear it while an upload is still going.
   */
  const [damBusy, setDamBusy] = useState({ upload: 0, load: 0 })
  const trackDamWork = useCallback(
    async <T,>(kind: 'upload' | 'load', work: Promise<T>): Promise<T> => {
      if (kind === 'upload') damUploadsRef.current += 1
      setDamBusy((b) => ({ ...b, [kind]: b[kind] + 1 }))
      try {
        return await work
      } finally {
        if (kind === 'upload') damUploadsRef.current -= 1
        setDamBusy((b) => ({ ...b, [kind]: b[kind] - 1 }))
      }
    },
    []
  )

  // Paint-bucket tool: click objects on the canvas to fill them
  const [fillMode, setFillMode] = useState(false)
  const [fillColor, setFillColor] = useState('#3b82f6')
  const [fillPaletteOpen, setFillPaletteOpen] = useState(false)
  /**
   * The Format or Effects menu under the text toolbar, and where it opens.
   * Fixed-position for the same reason as the fill palette: the bar scrolls
   * sideways and would clip anything hanging below it.
   */
  const [textMenu, setTextMenu] = useState<{
    kind: ToolbarMenuKind
    left: number
    top: number
  } | null>(null)
  const textMenuRef = useRef<HTMLDivElement>(null)
  const fillGroupRef = useRef<HTMLDivElement>(null)
  const fillBtnRef = useRef<HTMLButtonElement>(null)
  /** Viewport coords for the palette. It must be position:fixed - the toolbar
   *  sets overflow-x:auto, which makes it a scroll container and clips any
   *  absolutely positioned child that hangs below it. */
  const [fillAnchor, setFillAnchor] = useState<{
    left: number
    top: number
  } | null>(null)
  const fillModeRef = useRef(fillMode)
  const fillColorRef = useRef(fillColor)
  useEffect(() => {
    fillModeRef.current = fillMode
  }, [fillMode])
  useEffect(() => {
    fillColorRef.current = fillColor
  }, [fillColor])

  // Layer panel: drag-to-reorder and inline rename
  const [dragLayerId, setDragLayerId] = useState<string | null>(null)
  const [dropHint, setDropHint] = useState<{
    id: string
    place: 'above' | 'below'
  } | null>(null)
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>(
    {}
  )
  /** layerIds currently in the canvas selection, so panel rows can mirror it. */
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  /** Right-click menu anchor, in wrapper-relative pixels. */
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null)

  /* ── Smart guides (point 6) ── */
  const [smartGuidesOn, setSmartGuidesOn] = useState(true)
  const smartGuidesOnRef = useRef(smartGuidesOn)
  const activeSmartGuidesRef = useRef<SmartGuide[]>([])
  useEffect(() => {
    smartGuidesOnRef.current = smartGuidesOn
  }, [smartGuidesOn])

  const [template, setTemplate] = useState<PrintTemplate>(
    initialTemplate || {
      id: 'tpl-new',
      productId: '',
      productName: '',
      category: '',
      // Unpriced until someone prices it. Publishing is what refuses to let a
      // design reach a storefront in this state.
      price: null,
      unitsPerPack: null,
      name: 'Untitled Template',
      description:
        'Master template with locked brand guidelines and customizable site fields.',
      thumbnailUrl: '',
      orientation: 'portrait',
      aspectRatio: '3:4',
      dimensions: DEFAULT_DIMENSIONS,
      bleedMargin: 0.125,
      safeMargin: 0.375,
      status: 'DRAFT',
      theme: 'retail' as TemplateTheme,
      canvasConfig: { backgroundColor: '#ffffff' },
      layers: [],
      version: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }
  )

  const bump = useCallback(() => setRevision((r) => r + 1), [])
  /** Ticks per frame of a drag; see `createTicker`. */
  const [liveTicker] = useState(createTicker)
  const bumpTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  /** A bump for a burst of small edits, such as arrow nudges: once it pauses. */
  const bumpSoon = useCallback(() => {
    if (bumpTimerRef.current) clearTimeout(bumpTimerRef.current)
    bumpTimerRef.current = setTimeout(() => {
      bumpTimerRef.current = null
      setRevision((r) => r + 1)
    }, 200)
  }, [])

  // Keep the latest template readable from fabric event handlers without re-binding them.
  const templateRef = useRef(template)
  useEffect(() => {
    templateRef.current = template
  }, [template])

  /**
   * The version the server holds, as of the last response that said so.
   *
   * A ref as well as `template.version`, because state reaches `templateRef`
   * only after a render, and a save that started in that gap sent the version
   * the server had already moved past — refused as a collision with this tab's
   * own previous save. `Math.max` wherever it is set: versions only go up, so a
   * slow response landing after a newer one must not wind it back.
   */
  const serverVersionRef = useRef(template.version)
  /** The save in flight; the next save waits for it. See `handleSave`. */
  const saveChainRef = useRef<Promise<void>>(Promise.resolve())

  /* ── History ─────────────────────────────────────────────────── */

  const lockRef = useRef(true) // suspends recording during init / undo / redo
  const snapTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [canUndo, setCanUndo] = useState(false)
  const [canRedo, setCanRedo] = useState(false)

  /**
   * Command-pattern history. Each entry holds only the objects that actually
   * changed, as before/after document snapshots - not a copy of the whole canvas.
   * A long session therefore costs a few KB rather than tens of megabytes.
   */
  const historyStateRef = useRef<HistoryState>(emptyHistory())
  /** The document as of the last commit, used as the diff baseline. */
  const baselineRef = useRef<ObjectSnapshot[]>([])

  const refreshHistoryFlags = useCallback(() => {
    setCanUndo(historyCanUndo(historyStateRef.current))
    setCanRedo(historyCanRedo(historyStateRef.current))
  }, [])

  /**
   * Capture the canvas with fabric's own serialization. Undo needs an exact
   * reproduction, and the document model cannot give one for mask groups (whose
   * clip is anchored to the group centre) or for groups generally (rebuilding
   * from absolute children makes fabric recompute the bounds and shift them).
   */
  const captureObjects = useCallback((c: fabric.Canvas): ObjectSnapshot[] => {
    return (c.getObjects() as FabricAny[])
      .filter((o) => !isChrome(o))
      .map((o, i) => ({
        id: o.layerId || o.designId || `anon-${i}`,
        index: i,
        data: o.toObject(CUSTOM_PROPS) as Record<string, unknown>,
      }))
  }, [])

  const snapshot = useCallback(
    (label: HistoryLabel = 'style') => {
      const c = fabricRef.current
      if (!c || lockRef.current) return
      const next = captureObjects(c)
      const diffs = diffObjects(baselineRef.current, next)
      if (!diffs.length) return
      historyStateRef.current = pushEntry(historyStateRef.current, {
        label,
        at: Date.now(),
        objects: diffs,
      })
      baselineRef.current = next
      refreshHistoryFlags()
      markDirtyRef.current?.()
    },
    [captureObjects, refreshHistoryFlags]
  )

  /**
   * Coalesces bursts of continuous edits (dragging a slider, typing) into one
   * history entry instead of one per frame.
   */
  const snapshotSoon = useCallback(
    (label: HistoryLabel = 'style') => {
      if (snapTimerRef.current) clearTimeout(snapTimerRef.current)
      snapTimerRef.current = setTimeout(() => snapshot(label), 450)
    },
    [snapshot]
  )

  /**
   * Run a compound operation as a single undo step.
   *
   * Masking, grouping and pasting each perform several canvas mutations, and
   * every add/remove/modify fires the recorder. Without this, one "Create mask"
   * became three history entries - so the first undo dropped the group and the
   * second resurrected the mask shape on its own, which looks like undo
   * inventing a new circle rather than reversing the action.
   */
  const runAtomic = useCallback(
    <T,>(label: HistoryLabel, fn: () => T): T => {
      const wasLocked = lockRef.current
      lockRef.current = true
      try {
        return fn()
      } finally {
        lockRef.current = wasLocked
        if (!wasLocked) snapshot(label)
      }
    },
    [snapshot]
  )

  /** Re-baseline without recording, e.g. right after a load. */
  const resetHistory = useCallback(() => {
    const c = fabricRef.current
    historyStateRef.current = emptyHistory()
    baselineRef.current = c ? captureObjects(c) : []
    refreshHistoryFlags()
  }, [captureObjects, refreshHistoryFlags])

  useEffect(() => {
    resetHistoryRef.current = resetHistory
  }, [resetHistory])

  /**
   * The original behind each cut-out, keyed by the cut-out's source.
   *
   * `bgOriginalSrc` lives on the fabric object and is not part of a history
   * snapshot, so an undo or redo that rebuilt a cut-out used to lose it — and
   * with it the Restore original button. Keys are `pictureSourceKey`s; the
   * originals are strings the history already holds.
   */
  const cutoutOriginalsRef = useRef(new Map<string, string>())

  /**
   * Replay one entry in either direction. Only the objects named in the diff are
   * touched; everything else on the canvas is left exactly as it is.
   */
  const applyHistoryEntry = useCallback(
    async (entry: HistoryEntry, direction: 'undo' | 'redo') => {
      const c = fabricRef.current
      if (!c) return
      lockRef.current = true

      const byId = new Map<string, FabricAny>()
      ;(c.getObjects() as FabricAny[])
        .filter((o) => !isChrome(o))
        .forEach((o) => {
          const id = o.layerId || o.designId
          if (id) byId.set(id, o)
        })

      /** Objects that could not be rebuilt, left exactly as they are. */
      const skipped = new Set<string>()
      const rebuiltAll: fabric.Object[] = []

      /** A rebuilt cut-out gets its original back, so Restore stays offered. */
      const reattachOriginals = (o: FabricAny) => {
        if (o.type === 'image' && !o.bgOriginalSrc) {
          const original = cutoutOriginalsRef.current.get(
            pictureSourceKey((o as unknown as fabric.Image).getSrc() || '')
          )
          if (original) o.bgOriginalSrc = original
        }
        if (o.type === 'group' && typeof o.getObjects === 'function') {
          ;(o.getObjects() as FabricAny[]).forEach(reattachOriginals)
        }
      }

      for (const d of entry.objects) {
        const target = direction === 'undo' ? d.before : d.after
        const existing = byId.get(d.id)

        if (!target) {
          if (existing) c.remove(existing)
          continue
        }

        // Rebuild through fabric so groups, clip paths and images come back
        // byte-for-byte as they were, rather than being re-derived. A picture
        // whose address no longer answers comes back as its marked stand-in,
        // not as nothing: fabric alone drops it, and the undo lost it for good.
        const rebuilt = await enlivenSnapshot(target.data)
        if (!rebuilt) {
          skipped.add(d.id)
          continue
        }
        rebuiltAll.push(rebuilt)
        reattachOriginals(rebuilt)

        // Put it back at the same depth so undo does not reshuffle the stack.
        const index = existing ? c.getObjects().indexOf(existing) : -1
        if (existing) c.remove(existing)
        c.add(rebuilt)
        c.moveTo(rebuilt, index >= 0 ? index : target.index + 1)
      }

      // Only what was applied. Moving the baseline for an object left on the
      // canvas unchanged would have the two disagree, and the next snapshot
      // would record the difference as an edit nobody made.
      baselineRef.current = applyDiff(
        baselineRef.current,
        skipped.size > 0
          ? entry.objects.filter((d) => !skipped.has(d.id))
          : entry.objects,
        direction
      )

      normalizeStackRef.current?.(c)
      c.discardActiveObject()
      c.requestRenderAll()
      setActiveObj(null)
      setSelectedIds([])
      lockRef.current = false
      refreshHistoryFlags()
      bump()
      reportUnloadedImagesRef.current?.(rebuiltAll)
    },
    [bump, refreshHistoryFlags]
  )

  const undo = useCallback(() => {
    const { entry, next } = undoEntry(historyStateRef.current)
    if (!entry) return
    historyStateRef.current = next
    void applyHistoryEntry(entry, 'undo')
  }, [applyHistoryEntry])

  const redo = useCallback(() => {
    const { entry, next } = redoEntry(historyStateRef.current)
    if (!entry) return
    historyStateRef.current = next
    void applyHistoryEntry(entry, 'redo')
  }, [applyHistoryEntry])

  /* ── Guides (bleed / safe area) ───────────────────────────────── */

  const rebuildGuides = useCallback(
    (c: fabric.Canvas, pa: fabric.Rect, tpl: PrintTemplate) => {
      ;(c.getObjects() as FabricAny[])
        .filter((o) => o.isGuide)
        .forEach((g) => c.remove(g))

      const factor = UNIT_TO_PX[tpl.dimensions.unit] ?? 96
      const bleed = (tpl.bleedMargin || 0) * factor
      const safe = (tpl.safeMargin || 0) * factor
      const L = pa.left || 0
      const T = pa.top || 0
      const W = pa.width || 0
      const H = pa.height || 0

      const mk = (
        left: number,
        top: number,
        w: number,
        h: number,
        stroke: string
      ) => {
        const r = new fabric.Rect({
          left,
          top,
          width: Math.max(1, w),
          height: Math.max(1, h),
          fill: 'transparent',
          stroke,
          strokeWidth: 1,
          strokeDashArray: [6, 4],
          selectable: false,
          evented: false,
          hoverCursor: 'default',
        }) as FabricAny
        r.isGuide = true
        return r
      }

      if (bleed > 0)
        c.add(mk(L - bleed, T - bleed, W + bleed * 2, H + bleed * 2, '#f43f5e'))
      if (safe > 0)
        c.add(mk(L + safe, T + safe, W - safe * 2, H - safe * 2, '#3b82f6'))
      c.requestRenderAll()
    },
    []
  )

  /* ── Pasteboard dim ───────────────────────────────────────────── */

  /**
   * Wash out whatever hangs off the artboard, the way Photoshop greys out the
   * area beyond the canvas.
   *
   * A single even-odd path — an outer rectangle with the artboard punched out of
   * it — rather than the two obvious alternatives:
   *
   * A rectangle with an inverted `clipPath` reads better, but fabric's
   * `needsItsOwnCache()` returns true for anything with a clip path and
   * `shouldCache()` ORs that in ahead of `objectCaching`, so the flag below
   * would be ignored and fabric would try to cache a shape 100,000 units on a
   * side. `perfLimitSizeTotal` would then clamp the cache and rescale it, and
   * the punched edge — the one edge that has to land exactly on the artboard
   * border — would come back soft.
   *
   * Four abutting strips avoid the cache but meet along shared edges, and two
   * separately composited translucent fills do not sum to one across the pixels
   * they share: the joins show as hairlines wherever artwork crosses them.
   *
   * `fabric.Path` inherits `shouldCache` unchanged, so with no clip path
   * `objectCaching: false` is honoured and this draws in a single fill.
   */
  const rebuildPasteboardMask = useCallback(
    (c: fabric.Canvas, pa: fabric.Rect) => {
      ;(c.getObjects() as FabricAny[])
        .filter((o) => o.isPasteboardMask)
        .forEach((m) => c.remove(m))

      const L = pa.left || 0
      const T = pa.top || 0
      const W = pa.width || 0
      const H = pa.height || 0
      const P = PASTEBOARD_PAD
      const outerW = W + P * 2
      const outerH = H + P * 2

      // Local coordinates, top-left origin; `left`/`top` place the whole thing.
      const outer = `M 0 0 H ${outerW} V ${outerH} H 0 Z`
      const hole = `M ${P} ${P} H ${P + W} V ${P + H} H ${P} Z`

      const mask = new fabric.Path(`${outer} ${hole}`, {
        left: L - P,
        top: T - P,
        originX: 'left',
        originY: 'top',
        fill: PASTEBOARD_COLOR,
        fillRule: 'evenodd',
        // Fabric defaults strokeWidth to 1 and inflates the bounding box by it
        // even with no stroke colour set. Nothing here is stroked.
        strokeWidth: 0,
        opacity: PASTEBOARD_DIM,
        selectable: false,
        evented: false,
        hoverCursor: 'default',
        objectCaching: false,
      }) as FabricAny
      mask.isPasteboardMask = true
      c.add(mask)
      c.bringToFront(mask)
      c.requestRenderAll()
    },
    []
  )

  /* ── Viewport ─────────────────────────────────────────────────── */

  const fitToScreen = useCallback(() => {
    const c = fabricRef.current
    const pa = printAreaRef.current
    const wrap = wrapperRef.current
    if (!c || !pa || !wrap) return

    const boxW = wrap.clientWidth
    const boxH = wrap.clientHeight
    // A not-yet-laid-out wrapper reports 0, which would otherwise clamp the zoom
    // to the 5% floor and leave the sheet a speck in the corner. Retry instead.
    if (boxW < 40 || boxH < 40) {
      requestAnimationFrame(() => fitToScreenRef.current?.())
      return
    }

    const pad = 80
    const sx = (boxW - pad) / (pa.width || 1)
    const sy = (boxH - pad) / (pa.height || 1)
    const s = Math.max(0.05, Math.min(sx, sy, 8))
    c.setViewportTransform([
      s,
      0,
      0,
      s,
      (boxW - (pa.width || 0) * s) / 2 - (pa.left || 0) * s,
      (boxH - (pa.height || 0) * s) / 2 - (pa.top || 0) * s,
    ])
    setZoom(Math.round(s * 100))
    c.requestRenderAll()
  }, [])

  // Lets the retry above re-enter without making fitToScreen self-referential.
  const fitToScreenRef = useRef<(() => void) | null>(null)
  useEffect(() => {
    fitToScreenRef.current = fitToScreen
  }, [fitToScreen])

  const applyZoom = useCallback((pct: number) => {
    const c = fabricRef.current
    const wrap = wrapperRef.current
    if (!c || !wrap) return
    const clamped = Math.max(10, Math.min(pct, 800))
    c.zoomToPoint(
      new fabric.Point(wrap.clientWidth / 2, wrap.clientHeight / 2),
      clamped / 100
    )
    setZoom(clamped)
    c.requestRenderAll()
  }, [])

  /* ── Canvas init (once) ───────────────────────────────────────── */

  useEffect(() => {
    if (!canvasRef.current || !wrapperRef.current) return

    // Fabric snapshots devicePixelRatio once, when its module is first
    // evaluated, and sizes every canvas backstore from that snapshot. The
    // editor can mount long after - and a page loaded at 100% browser zoom and
    // then zoomed to 125% before the builder opens would build its canvas at
    // 1x on a 1.25x screen, which is the whole artboard rendered at four fifths
    // of the pixels it is shown at. Re-read it against the screen here, because
    // the constructor below is what sizes the backstore.
    fabricTuning.devicePixelRatio = window.devicePixelRatio || 1

    const canvas = new fabric.Canvas(canvasRef.current, {
      backgroundColor: PASTEBOARD_COLOR,
      preserveObjectStacking: true,
      selection: true,
      // Photoshop semantics. Fabric ships the inverse (corners uniform by
      // default, Shift to free them); false gives free resize by default,
      // Shift for proportional, and altKey layers centred scaling on top - so
      // Alt+Shift is a proportional resize about the centre.
      uniformScaling: false,
      uniScaleKey: 'shiftKey',
      centeredKey: 'altKey',
    })
    fabricRef.current = canvas
    canvas.setDimensions({
      width: wrapperRef.current.clientWidth,
      height: wrapperRef.current.clientHeight,
    })

    const tpl = templateRef.current
    const { w, h } = printAreaPx(tpl.dimensions)

    const printArea = new fabric.Rect({
      left: 0,
      top: 0,
      width: w,
      height: h,
      fill: tpl.canvasConfig.backgroundColor || '#ffffff',
      selectable: false,
      evented: false,
      hoverCursor: 'default',
      stroke: '#bfdbfe',
      strokeWidth: 1,
    }) as FabricAny
    printArea.isPrintArea = true
    canvas.add(printArea)
    printAreaRef.current = printArea
    rebuildGuides(canvas, printArea, tpl)
    rebuildPasteboardMask(canvas, printArea)

    // Anything added lands on top of the stack, which would put it above the
    // pasteboard dim and leave that one object un-faded off the artboard.
    // Thirteen call sites add objects — paste, undo, drop, pen, duplicate,
    // mask — and pinning the chrome from each of them is a rule someone
    // eventually forgets. Doing it on the event covers every path there is,
    // including any added later. `bringToFront` only splices the object array
    // and fires nothing, so this cannot re-enter.
    canvas.on('object:added', () => normalizeStackRef.current?.(canvas))

    /* ── Pan & zoom ── */
    canvas.on('mouse:wheel', (opt) => {
      const e = opt.e as WheelEvent
      e.preventDefault()
      e.stopPropagation()
      if (e.ctrlKey || e.metaKey) {
        let next = canvas.getZoom() * 0.999 ** e.deltaY
        next = Math.max(0.1, Math.min(next, 8))
        canvas.zoomToPoint(new fabric.Point(e.offsetX, e.offsetY), next)
        setZoom(Math.round(next * 100))
      } else {
        const vpt = canvas.viewportTransform
        if (vpt) {
          vpt[4] -= e.deltaX
          vpt[5] -= e.deltaY
          canvas.requestRenderAll()
        }
      }
    })

    let isPanning = false
    let lastX = 0
    let lastY = 0

    /* ── Ruler guides: grab, move, and drag off to delete ── */
    canvas.on('mouse:down', (opt) => {
      if (penModeRef.current || fillModeRef.current) return
      const evt = opt.e as MouseEvent
      if (evt.altKey || evt.button === 1 || spaceDownRef.current) return
      // An object under the cursor wins; guides sit behind the artwork.
      if (opt.target && !isChrome(opt.target as FabricAny)) return
      const hit = guideAtRef.current?.(canvas.getPointer(evt))
      if (!hit) return
      movingGuideRef.current = hit
      canvas.selection = false
    })

    canvas.on('mouse:move', (opt) => {
      const evt = opt.e as MouseEvent
      const moving = movingGuideRef.current
      if (moving) {
        const p = canvas.getPointer(evt)
        const g = userGuidesRef.current
        if (moving.axis === 'v') g.vertical[moving.index] = Math.round(p.x)
        else g.horizontal[moving.index] = Math.round(p.y)
        canvas.requestRenderAll()
        return
      }
      // Hover feedback so guides read as grabbable.
      if (penModeRef.current || fillModeRef.current) return
      if (opt.target && !isChrome(opt.target as FabricAny)) return
      const over = guideAtRef.current?.(canvas.getPointer(evt))
      if (over) canvas.setCursor(over.axis === 'v' ? 'ew-resize' : 'ns-resize')
    })

    canvas.on('mouse:dblclick', (opt) => {
      if (penModeRef.current) return
      if (opt.target && !isChrome(opt.target as FabricAny)) return
      const hit = guideAtRef.current?.(canvas.getPointer(opt.e as MouseEvent))
      if (hit) removeGuideRef.current?.(hit.axis, hit.index)
    })

    /* ── Pen tool: place anchors, then close or finish ── */
    canvas.on('mouse:down', (opt) => {
      if (!penModeRef.current) return
      const evt = opt.e as MouseEvent
      if (evt.altKey || evt.button === 1) return
      const p = canvas.getPointer(evt)
      const pts = penPointsRef.current

      // Clicking back on the first anchor closes the shape.
      if (pts.length > 2) {
        const first = pts[0]
        const nearFirst =
          Math.hypot(p.x - first.x, p.y - first.y) * (canvas.getZoom() || 1) <
          10
        if (nearFirst) {
          finishPenRef.current?.(true)
          return
        }
      }
      pts.push({ x: p.x, y: p.y })
      canvas.requestRenderAll()
    })

    // Rubber band from the last anchor to the cursor.
    canvas.on('mouse:move', (opt) => {
      if (!penModeRef.current || !penPointsRef.current.length) return
      const p = canvas.getPointer(opt.e as MouseEvent)
      penHoverRef.current = { x: p.x, y: p.y }
      canvas.requestRenderAll()
    })

    canvas.on('mouse:dblclick', () => {
      if (penModeRef.current) finishPenRef.current?.(false)
    })
    canvas.on('mouse:down', (opt) => {
      if (penModeRef.current) return
      const evt = opt.e as MouseEvent
      // Spacebar-drag pans like every other design tool.
      // Alt over a layer duplicates it and drags the copy; alt over empty canvas
      // still pans. Middle-drag and spacebar-drag always pan.
      const overLayer = opt.target && !isChrome(opt.target as FabricAny)
      // Not when a transform handle is under the cursor, and not with Shift
      // held: Alt+Shift is the centred proportional-resize gesture, and
      // grabbing a corner with Alt was duplicating the object mid-resize.
      const onHandle = !!(opt.target as FabricAny | undefined)?.__corner
      if (
        evt.altKey &&
        overLayer &&
        !onHandle &&
        !evt.shiftKey &&
        !spaceDownRef.current &&
        evt.button !== 1
      ) {
        altDragRef.current?.(opt.target as FabricAny)
        return
      }
      // Alt pans over open canvas only. On a transform handle it belongs to
      // fabric's centred-scaling gesture: `centeredKey: 'altKey'` above. The
      // duplicate branch already stepped aside for handles, but this one did
      // not, so Alt- and Alt+Shift-resizing fell through to here and panned the
      // viewport instead of scaling the selection. Middle-drag and spacebar
      // always pan, handle or not — neither is a fabric modifier.
      if (
        evt.button === 1 ||
        spaceDownRef.current ||
        (evt.altKey && !onHandle)
      ) {
        isPanning = true
        canvas.selection = false
        lastX = evt.clientX
        lastY = evt.clientY
      }
    })

    /* ── Paint bucket: click to fill, Ctrl+click to pick up a colour ── */
    canvas.on('mouse:down', (opt) => {
      if (!fillModeRef.current || penModeRef.current) return
      const evt = opt.e as MouseEvent
      if (evt.altKey || evt.button === 1) return // leave panning alone

      const picking = evt.ctrlKey || evt.metaKey
      const color = fillColorRef.current
      const target = opt.target as FabricAny | null

      const paint = (o: FabricAny | fabric.Rect, prop: 'fill' | 'stroke') => {
        if (picking) {
          const current = (o as FabricAny).get(prop)
          if (typeof current === 'string' && current !== 'transparent')
            setFillColor(current)
          return
        }
        ;(o as FabricAny).set(prop, color)
        // Shapes are cached; without invalidating, the old bitmap keeps drawing
        // and the fill silently appears to do nothing.
        ;(o as FabricAny).set('dirty', true)
        canvas.requestRenderAll()
        snapshot()
        bump()
      }

      if (target && !isChrome(target)) {
        if (target.type === 'image') {
          setToast({ kind: 'err', msg: 'Images cannot be filled' })
          setTimeout(() => setToast(null), 2200)
          return
        }
        // A line has no interior, so its stroke is the thing you can see.
        paint(target, target.type === 'line' ? 'stroke' : 'fill')
        return
      }

      // Empty space inside the sheet fills the background, as a paint bucket should.
      const pa = printAreaRef.current
      if (!pa) return
      const p = canvas.getPointer(evt)
      const inside =
        p.x >= (pa.left || 0) &&
        p.x <= (pa.left || 0) + (pa.width || 0) &&
        p.y >= (pa.top || 0) &&
        p.y <= (pa.top || 0) + (pa.height || 0)
      if (inside) paint(pa, 'fill')
    })

    canvas.on('mouse:move', (opt) => {
      if (!isPanning) return
      const e = opt.e as MouseEvent
      const vpt = canvas.viewportTransform
      if (vpt) {
        vpt[4] += e.clientX - lastX
        vpt[5] += e.clientY - lastY
        canvas.requestRenderAll()
        lastX = e.clientX
        lastY = e.clientY
      }
    })

    canvas.on('mouse:up', (opt) => {
      const moving = movingGuideRef.current
      if (moving) {
        movingGuideRef.current = null
        canvas.selection = true
        // Released back over a ruler (or off the canvas entirely) -> delete it,
        // the way every design tool discards a guide.
        const el = canvasRef.current
        const r = el?.getBoundingClientRect()
        const e = opt.e as MouseEvent
        const offCanvas =
          !!r &&
          (e.clientX < r.left ||
            e.clientY < r.top ||
            e.clientX > r.right ||
            e.clientY > r.bottom)
        if (offCanvas) removeGuideRef.current?.(moving.axis, moving.index)
        else {
          syncGuideCountRef.current?.()
          canvas.requestRenderAll()
        }
      }
      if (canvas.viewportTransform)
        canvas.setViewportTransform(canvas.viewportTransform)
      isPanning = false
      canvas.selection = true
    })

    /* ── Double-click: open a group, or edit content inside a mask ── */
    canvas.on('mouse:dblclick', (opt) => {
      const target = opt.target as FabricAny | null
      if (!target || isChrome(target)) return
      if (target.type === 'group') {
        openGroupEditRef.current?.(target)
      } else if (isPhotoLayer(target)) {
        // Only picture layers open the file picker. A QR or barcode is a fabric
        // Image as well, and swapping its bitmap would break the code.
        openImagePickerRef.current?.(target)
      } else if (target.clipPath) {
        enterMaskContentRef.current?.(target)
      }
    })

    /* ── Selection tracking ── */
    const syncActive = () => {
      setActiveObj((canvas.getActiveObject() as FabricAny) || null)
      // Mirror a canvas marquee/shift-click selection onto the layers panel.
      setSelectedIds(
        (canvas.getActiveObjects() as FabricAny[])
          .filter((o) => !isChrome(o))
          .map((o) => o.layerId)
          .filter(Boolean)
      )
    }
    canvas.on('selection:created', syncActive)
    canvas.on('selection:updated', syncActive)
    canvas.on('selection:cleared', () => {
      setActiveObj(null)
      setSelectedIds([])
    })

    /* ── Live property readout while dragging / scaling ── */
    // Only the readouts on the live ticker follow along; the studio as a whole
    // re-renders once, when the drag ends (`object:modified` below). Rendering
    // it on every frame made a drag stutter in half-second steps.
    let rafId = 0
    const liveBump = () => {
      if (rafId) return
      rafId = requestAnimationFrame(() => {
        rafId = 0
        liveTicker.tick()
      })
    }
    /* ── Snap while dragging: grid first, else smart guides ── */
    canvas.on('object:moving', (opt) => {
      const o = opt.target as FabricAny | null
      const pa = printAreaRef.current
      if (!o || !pa) return

      if (snapGridRef.current) {
        const step = gridSpacingRef.current
        if (!step) return
        const ox = pa.left || 0
        const oy = pa.top || 0
        o.set({
          left: ox + Math.round(((o.left || 0) - ox) / step) * step,
          top: oy + Math.round(((o.top || 0) - oy) / step) * step,
        })
        activeSmartGuidesRef.current = []
        return
      }

      if (!smartGuidesOnRef.current) {
        activeSmartGuidesRef.current = []
        return
      }

      // Align against every other object's edges/centres, and the sheet itself.
      const others = contentObjects(canvas).filter((x) => x !== o)
      const sheet = {
        left: pa.left || 0,
        top: pa.top || 0,
        width: pa.width || 0,
        height: pa.height || 0,
      }
      const res = computeSmartGuides(o, others, sheet)
      o.set({ left: res.left, top: res.top })
      activeSmartGuidesRef.current = res.guides
    })

    // Guides are a drag affordance only - clear them once the drag ends.
    const clearSmartGuides = () => {
      if (activeSmartGuidesRef.current.length) {
        activeSmartGuidesRef.current = []
        canvas.requestRenderAll()
      }
    }
    canvas.on('mouse:up', clearSmartGuides)
    canvas.on('object:modified', clearSmartGuides)

    /* ── 15-degree rotation snap while shift is held ── */
    canvas.on('object:rotating', (opt) => {
      const e = opt.e as MouseEvent
      const o = opt.target as FabricAny | null
      if (!o || !e?.shiftKey) return
      o.set('angle', Math.round((o.angle || 0) / 15) * 15)
    })

    canvas.on('object:moving', liveBump)
    canvas.on('object:scaling', liveBump)
    canvas.on('object:rotating', liveBump)

    /* ── History recording ── */
    const record = () => {
      // While history is locked — loading, undo, redo — objects arrive one at
      // a time, often from separate image loads. One render for the lot, not
      // one per object: an undo that restored 30 moved texts took 16 seconds.
      if (lockRef.current) {
        bumpSoon()
        return
      }
      snapshot()
      bump()
    }
    canvas.on('object:added', record)
    canvas.on('object:removed', record)
    // A picture resized by its handles has a new frame: Fill and Fit work to
    // the box the user just drew. Registered before `record` so the history
    // step that records the resize records the frame with it.
    canvas.on('object:modified', (opt) => {
      const target = (opt as { target?: FabricAny }).target
      const event = opt as { action?: string; transform?: { action?: string } }
      const action = event.transform?.action || event.action || ''
      if (
        target?.type === 'image' &&
        isPhotoLayer(target) &&
        action.startsWith('scale')
      ) {
        adoptCurrentBoxAsFrame(target)
      }
    })
    canvas.on('object:modified', record)
    canvas.on('text:changed', (opt) => {
      // Text with a case format shows what is typed re-cased, and keeps the
      // typed text behind it up to date.
      syncTextCaseAfterEdit((opt as { target?: FabricAny }).target)
      snapshotSoon()
      bump()
    })

    /* ── Load existing layers, then arm history ── */
    const paBox = { left: 0, top: 0, width: w, height: h }
    const scale = previewBaseWidth(tpl.orientation) / (w || 1)
    // Rebuild bottom-to-top so the saved stacking order is what you get back.
    const incoming = [...(tpl.layers || [])].sort(
      (a, b) => (a.zIndex ?? 0) - (b.zIndex ?? 0)
    )

    // StrictMode double-mounts this effect in dev, so these callbacks can land
    // after dispose(). Touching a disposed canvas throws on its null 2D context.
    const isLive = () => fabricRef.current === canvas

    const armHistory = () => {
      if (!isLive()) return
      fitToScreen()
      lockRef.current = false
      // Baseline the diff engine on whatever finished loading.
      resetHistoryRef.current?.()
      bump()
    }

    if (tpl.design?.objects?.length) {
      // The structured document is the source of truth: it carries groups,
      // masks, gradients and filters that the flat layer list cannot express.
      const doc = tpl.design
      if (doc.grid) {
        setShowGrid(!!doc.grid.enabled)
        setGridSpacing(doc.grid.spacing || 24)
        setSnapGrid(!!doc.grid.snap)
      }
      if (doc.background === 'transparent') setBgTransparent(true)
      if (doc.canvasSize?.dpi) setCanvasDpi(doc.canvasSize.dpi)
      // The backs come in as documents and stay there until one is opened. The
      // front is what the canvas shows on arrival, always: it is the side the
      // design is known by.
      setMockup(doc.mockup)
      mockupRef.current = doc.mockup
      setBacks(doc.backs ?? [])
      backsRef.current = doc.backs ?? []
      setActiveBackId(null)
      activeBackIdRef.current = null
      setDefaultBackId(doc.defaultBackId ?? null)
      defaultBackIdRef.current = doc.defaultBackId ?? null
      stashedFrontRef.current = null

      objectsToCanvas(canvas, doc.objects, renderCodeBitmap, doc.meta?.version)
        .then((built) => {
          if (!isLive()) return
          // Artwork arrives on top of the chrome that was built before it, so
          // pin the whole stack rather than only sinking the print area — the
          // dim has to sit above the artwork it washes out.
          normalizeStackRef.current?.(canvas)
          canvas.requestRenderAll()
          reportUnloadedImagesRef.current?.(built)
        })
        .finally(armHistory)
    } else if (tpl.canvasJson) {
      // Full canvas state wins: it carries groups and masks, which the flat
      // layer list cannot express.
      //
      // Pictures that will not load are stood in for first. `loadFromJSON`
      // drops them without a word, and the next save would have written the
      // design out without them.
      const raw = tpl.canvasJson
      let parsed: Record<string, unknown> | null = null
      try {
        parsed = typeof raw === 'string' ? JSON.parse(raw) : raw
      } catch {
        parsed = null
      }
      void (
        parsed ? withUnloadableImagesReplaced(parsed) : Promise.resolve(raw)
      )
        .catch(() => raw)
        .then((json) => {
          if (!isLive()) return
          canvas.loadFromJSON(json, () => {
            if (!isLive()) return
            const restored = canvas.getObjects() as FabricAny[]
            // Artwork saved before uniform strokes carries strokeUniform:false.
            applyStrokeDefaults(restored)
            markUnloadedImages(restored)
            const pa = restored.find((o) => o.isPrintArea) as
              fabric.Rect | undefined
            if (pa) {
              pa.set({
                selectable: false,
                evented: false,
                hoverCursor: 'default',
              })
              printAreaRef.current = pa
              canvas.remove(printArea)
            }
            restored
              .filter((o) => o.isGuide)
              .forEach((g) => g.set({ selectable: false, evented: false }))
            if (printAreaRef.current) {
              rebuildGuides(canvas, printAreaRef.current, tpl)
              rebuildPasteboardMask(canvas, printAreaRef.current)
              canvas.sendToBack(printAreaRef.current)
            }
            ;(canvas.getObjects() as FabricAny[])
              .filter((o) => o.isGuide)
              .forEach((g) => canvas.bringToFront(g))
            canvas.renderAll()
            reportUnloadedImagesRef.current?.(restored)
            armHistory()
          })
        })
    } else {
      Promise.all(incoming.map((l) => layerToFabric(l, paBox, scale)))
        .then((objs) => {
          if (!isLive()) return
          objs.forEach((o) => {
            if (o) canvas.add(o)
          })
          normalizeStackRef.current?.(canvas)
          canvas.requestRenderAll()
          reportUnloadedImagesRef.current?.(
            objs.filter(Boolean) as fabric.Object[]
          )
        })
        .finally(armHistory)
    }

    /* ── Grid overlay, drawn in canvas space and clipped to the sheet ── */
    canvas.on('after:render', () => {
      const ctx = canvas.getContext()
      const pa = printAreaRef.current
      if (!ctx || !pa) return

      if (showGridRef.current && gridSpacingRef.current > 0) {
        const step = gridSpacingRef.current
        const vpt = canvas.viewportTransform
        ctx.save()
        if (vpt) ctx.transform(vpt[0], vpt[1], vpt[2], vpt[3], vpt[4], vpt[5])
        const L = pa.left || 0
        const T = pa.top || 0
        const W = pa.width || 0
        const H = pa.height || 0
        ctx.beginPath()
        ctx.rect(L, T, W, H)
        ctx.clip()
        ctx.strokeStyle = 'rgba(59,130,246,0.22)'
        ctx.lineWidth = 1 / (canvas.getZoom() || 1)
        ctx.beginPath()
        for (let x = L; x <= L + W; x += step) {
          ctx.moveTo(x, T)
          ctx.lineTo(x, T + H)
        }
        for (let y = T; y <= T + H; y += step) {
          ctx.moveTo(L, y)
          ctx.lineTo(L + W, y)
        }
        ctx.stroke()
        ctx.restore()
      }

      // User guides pulled off the rulers.
      const g = userGuidesRef.current
      if (g.horizontal.length || g.vertical.length) {
        const vpt = canvas.viewportTransform
        ctx.save()
        if (vpt) ctx.transform(vpt[0], vpt[1], vpt[2], vpt[3], vpt[4], vpt[5])
        ctx.strokeStyle = '#06b6d4'
        ctx.lineWidth = 1 / (canvas.getZoom() || 1)
        ctx.beginPath()
        const span = 100000
        g.vertical.forEach((x) => {
          ctx.moveTo(x, -span)
          ctx.lineTo(x, span)
        })
        g.horizontal.forEach((y) => {
          ctx.moveTo(-span, y)
          ctx.lineTo(span, y)
        })
        ctx.stroke()
        ctx.restore()
      }

      // Smart alignment guides, drawn while an object is being dragged.
      const sg = activeSmartGuidesRef.current
      if (sg.length) {
        const vpt = canvas.viewportTransform
        ctx.save()
        if (vpt) ctx.transform(vpt[0], vpt[1], vpt[2], vpt[3], vpt[4], vpt[5])
        ctx.strokeStyle = '#ec4899'
        ctx.lineWidth = 1 / (canvas.getZoom() || 1)
        ctx.setLineDash([
          4 / (canvas.getZoom() || 1),
          4 / (canvas.getZoom() || 1),
        ])
        ctx.beginPath()
        const span = 100000
        sg.forEach((g) => {
          if (g.axis === 'x') {
            ctx.moveTo(g.position, -span)
            ctx.lineTo(g.position, span)
          } else {
            ctx.moveTo(-span, g.position)
            ctx.lineTo(span, g.position)
          }
        })
        ctx.stroke()
        ctx.setLineDash([])
        ctx.restore()
      }

      /*
       * Merge-field affordance: a dashed underline beneath every layer bound to
       * a field key.
       *
       * A dropped merge field carries realistic sample content - "Apex Midtown
       * Central Health" rather than "{{businessName}}" - so the layout can be
       * judged against text of a believable length, and so the storefront has a
       * fallback for a site user whose profile has no name on it. The cost of
       * that choice is that a bound layer is otherwise indistinguishable from
       * static text, which is what this underline buys back.
       *
       * Drawn here rather than as a fabric object so it is never selectable,
       * never serialised, and never exported: this handler paints on the
       * on-screen context, which `toDataURL` does not render into.
       */
      const bound: FabricAny[] = []
      const collectBound = (list: fabric.Object[]) => {
        list.forEach((obj) => {
          const o = obj as FabricAny
          // A hidden layer takes its whole subtree with it - marking artwork
          // that is not on screen would be worse than not marking it at all.
          if (isChrome(o) || o.visible === false) return
          if (o.fieldKey) bound.push(o)
          const kids = (o as unknown as fabric.Group).getObjects?.()
          if (kids?.length) collectBound(kids)
        })
      }
      collectBound(canvas.getObjects())

      if (bound.length) {
        const vpt = canvas.viewportTransform
        const z = canvas.getZoom() || 1
        ctx.save()
        if (vpt) ctx.transform(vpt[0], vpt[1], vpt[2], vpt[3], vpt[4], vpt[5])
        ctx.strokeStyle = '#0d9488'
        ctx.lineWidth = 1 / z
        ctx.setLineDash([4 / z, 3 / z])
        bound.forEach((o) => {
          const g = absoluteGeom(o)
          if (g.width <= 0) return
          // Rotate about the layer's own centre so the underline stays glued to
          // the baseline of text set at an angle.
          ctx.save()
          ctx.translate(g.left + g.width / 2, g.top + g.height / 2)
          ctx.rotate((g.angle * Math.PI) / 180)
          const y = g.height / 2 + 2 / z
          ctx.beginPath()
          ctx.moveTo(-g.width / 2, y)
          ctx.lineTo(g.width / 2, y)
          ctx.stroke()
          ctx.restore()
        })
        ctx.setLineDash([])
        ctx.restore()
      }

      // Pen preview: the polyline so far, plus a rubber band to the cursor.
      const pen = penPointsRef.current
      if (penModeRef.current && pen.length) {
        const vpt = canvas.viewportTransform
        const z = canvas.getZoom() || 1
        ctx.save()
        if (vpt) ctx.transform(vpt[0], vpt[1], vpt[2], vpt[3], vpt[4], vpt[5])
        const preview = penHoverRef.current
          ? [...pen, penHoverRef.current]
          : pen
        ctx.strokeStyle = '#2563eb'
        ctx.lineWidth = 2 / z
        if (preview.length > 1) {
          const d = new Path2D(
            pathFromPoints(preview, penSmoothRef.current, false)
          )
          ctx.stroke(d)
        }
        // Anchor dots; the first is larger to show where the path can close.
        pen.forEach((pt, i) => {
          ctx.beginPath()
          ctx.arc(pt.x, pt.y, (i === 0 ? 5 : 3.5) / z, 0, Math.PI * 2)
          ctx.fillStyle = i === 0 ? '#ffffff' : '#2563eb'
          ctx.fill()
          ctx.lineWidth = 1.5 / z
          ctx.strokeStyle = '#2563eb'
          ctx.stroke()
        })
        ctx.restore()
      }

      drawRulersRef.current?.()
    })

    /* ── Keep canvas filling its wrapper ── */
    let hadSize = false
    let lastW = 0
    let lastH = 0
    const ro = new ResizeObserver(() => {
      const wrap = wrapperRef.current
      const fc = fabricRef.current
      // `contextTop` as well as the ref, and the reason is specific.
      // `setDimensions` sets fabric's `hasLostContext`, and the render it
      // schedules then takes a branch of `renderAll` that hands `contextTop`
      // straight to `renderTopLayer`, whose first statement is `ctx.save()`
      // with no null check. It is the one path in fabric where a missing
      // context fails on `save` rather than on `clearRect` -- which is exactly
      // the "Cannot read properties of null (reading 'save')" seen once in dev.
      // A canvas that is disposed, or that a Fast Refresh interrupted before it
      // finished initialising, has no top context and nothing here to do.
      if (!wrap || !fc || !hasTopContext(fc)) return
      const w = wrap.clientWidth
      const h = wrap.clientHeight
      // Ignore the zero-size measurement React reports before first layout.
      if (w < 1 || h < 1) return

      // Resizing a canvas clears its bitmap, so only do it when the size has
      // genuinely changed. Redundant calls were a visible flicker.
      if (w === lastW && h === lastH) return
      lastW = w
      lastH = h

      fc.setDimensions({ width: w, height: h })
      fc.requestRenderAll()
      // Re-fit once the wrapper first gets a real size, so the sheet is framed
      // correctly even if the very first fit ran too early.
      if (!hadSize) {
        hadSize = true
        fitToScreenRef.current?.()
      }
    })
    ro.observe(wrapperRef.current)

    return () => {
      if (rafId) cancelAnimationFrame(rafId)
      ro.disconnect()
      canvas.dispose()
      fabricRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /**
   * Re-resolve the backstore when the device pixel ratio changes.
   *
   * It is not a constant: browser zoom changes it, and so does dragging the
   * window from a scaled laptop panel onto an external monitor. Fabric reads
   * `fabric.devicePixelRatio` once per `setDimensions`, so without this the
   * canvas keeps whatever ratio it was born with and goes soft the moment
   * either happens.
   *
   * A `matchMedia` on the current ratio fires exactly when it stops being the
   * current one, so the listener re-arms itself against the new value.
   * `setDimensions` with the size the canvas already has is what re-runs
   * fabric's retina sizing.
   */
  useEffect(() => {
    let mq: MediaQueryList | null = null

    const onChange = () => {
      const c = fabricRef.current
      const wrap = wrapperRef.current
      // `contextTop` for the same reason as the resize observer above: this is
      // the other caller of setDimensions, and setDimensions is what arms the
      // one fabric path that dereferences a null context with `save()`.
      if (c && wrap && hasTopContext(c)) {
        fabricTuning.devicePixelRatio = window.devicePixelRatio || 1
        c.setDimensions({
          width: wrap.clientWidth,
          height: wrap.clientHeight,
        })
        // The caches were rasterised at the old ratio, and nothing about the
        // objects themselves changed - fabric would happily redraw the stale
        // bitmaps at the new resolution.
        c.getObjects().forEach((o) => o.set('dirty', true as never))
        c.requestRenderAll()
        drawRulersRef.current?.()
      }
      arm()
    }

    function arm() {
      const dpr = window.devicePixelRatio || 1
      mq = window.matchMedia(`(resolution: ${dpr}dppx)`)
      mq.addEventListener('change', onChange, { once: true })
    }

    arm()
    return () => mq?.removeEventListener('change', onChange)
  }, [])

  /* ── Resize the print area when the template dimensions change ── */
  const dimsKey = `${template.dimensions.width}x${template.dimensions.height}${template.dimensions.unit}|${template.bleedMargin}|${template.safeMargin}`
  const dimsKeyRef = useRef(dimsKey)
  useEffect(() => {
    if (dimsKeyRef.current === dimsKey) return
    dimsKeyRef.current = dimsKey
    const c = fabricRef.current
    const pa = printAreaRef.current
    if (!c || !pa) return

    const prevW = pa.width || 0
    const prevH = pa.height || 0
    const { w, h } = printAreaPx(template.dimensions)
    pa.set({ width: w, height: h })
    pa.setCoords()

    /* The artwork comes with it.
       A design drawn on A4 and then pointed at a business card used to keep
       every object at its old pixel size: a rectangle drawn for the sheet hung
       three times off the edge of the card, and the artboard looked broken
       rather than resized.
       Position maps per axis, so what sat against the right edge still does.
       Size scales by the smaller of the two ratios, so nothing is stretched
       into a shape the designer did not draw -- and text keeps its proportions,
       since its size is carried by the same scale. */
    if (prevW > 0 && prevH > 0 && (w !== prevW || h !== prevH)) {
      const rx = w / prevW
      const ry = h / prevH
      const k = Math.min(rx, ry)
      ;(c.getObjects() as FabricAny[])
        .filter((o) => !isChrome(o))
        .forEach((o) => {
          o.set({
            left: (o.left ?? 0) * rx,
            top: (o.top ?? 0) * ry,
            scaleX: (o.scaleX ?? 1) * k,
            scaleY: (o.scaleY ?? 1) * k,
          })
          o.setCoords()
        })
    }

    rebuildGuides(c, pa, template)
    rebuildPasteboardMask(c, pa)
    fitToScreen()
    snapshotSoon()
    bump()
  }, [
    dimsKey,
    template,
    rebuildGuides,
    rebuildPasteboardMask,
    fitToScreen,
    snapshotSoon,
    bump,
  ])

  /* ── Paint-bucket mode ── */
  const fillModeWasOnRef = useRef(false)
  useEffect(() => {
    const c = fabricRef.current
    if (!c) return
    // Only while the bucket is on, or the moment it goes off. Otherwise there
    // is nothing to change, and this ran — with a canvas redraw — every render.
    if (!fillMode && !fillModeWasOnRef.current) return
    fillModeWasOnRef.current = fillMode
    c.selection = !fillMode
    c.defaultCursor = fillMode ? 'crosshair' : 'default'
    c.hoverCursor = fillMode ? 'crosshair' : 'move'
    // Objects stay hit-testable but immovable, so a click paints instead of drags.
    ;(c.getObjects() as FabricAny[])
      .filter((o) => !isChrome(o))
      .forEach((o) => {
        o.lockMovementX = fillMode
        o.lockMovementY = fillMode
      })
    if (fillMode) {
      c.discardActiveObject()
      setActiveObj(null)
    }
    c.requestRenderAll()
  }, [fillMode, revision])

  /* ── Guide visibility ── */
  useEffect(() => {
    const c = fabricRef.current
    if (!c) return
    const guides = (c.getObjects() as FabricAny[]).filter((o) => o.isGuide)
    // Nothing to change on most renders: skip the canvas redraw.
    if (guides.every((g) => (g.visible !== false) === showGuides)) return
    guides.forEach((g) => g.set('visible', showGuides))
    c.requestRenderAll()
  }, [showGuides, revision])

  /* ── Right-click context menu (point 3) ───────────────────────── */

  /** Open the menu at the pointer, selecting whatever sits under it. */
  const openContextMenu = useCallback(
    (e: React.MouseEvent, layer?: FabricAny) => {
      e.preventDefault()
      e.stopPropagation()
      const c = fabricRef.current
      const frame = canvasFrameRef.current
      if (!c || !frame) return

      if (layer) {
        // From a layer row: keep an existing multi-selection intact.
        const already = (c.getActiveObjects() as FabricAny[]).includes(layer)
        if (!already) selectLayerRef.current?.(layer)
      } else {
        const target = c.findTarget(
          e.nativeEvent as unknown as Event,
          false
        ) as FabricAny | undefined
        if (target && !isChrome(target)) {
          // findTarget returns the ActiveSelection itself, while getActiveObjects
          // returns its members - so a plain `includes` reports "not selected"
          // for a multi-selection. Discarding and re-activating it then applies
          // the selection's relative transform twice and visibly moves every
          // member, which is why masking from this menu shifted X/Y.
          const isSelection = target.type === 'activeSelection'
          const already =
            isSelection ||
            (c.getActiveObjects() as FabricAny[]).includes(target)
          if (!already) {
            c.discardActiveObject()
            c.setActiveObject(target)
            c.requestRenderAll()
            setActiveObj(target)
          }
        }
      }

      const box = frame.getBoundingClientRect()
      setMenu({ x: e.clientX - box.left, y: e.clientY - box.top })
    },
    []
  )

  const closeContextMenu = useCallback(() => setMenu(null), [])

  useEffect(() => {
    if (!fillPaletteOpen) return
    const close = (e: MouseEvent) => {
      // Ignore clicks inside the group, including the button that opened it.
      if (fillGroupRef.current?.contains(e.target as Node)) return
      setFillPaletteOpen(false)
    }
    const dismiss = () => setFillPaletteOpen(false)
    window.addEventListener('click', close)
    window.addEventListener('resize', dismiss)
    window.addEventListener('scroll', dismiss, true)
    return () => {
      window.removeEventListener('click', close)
      window.removeEventListener('resize', dismiss)
      window.removeEventListener('scroll', dismiss, true)
    }
  }, [fillPaletteOpen])

  // A text menu closes on a press anywhere else — the canvas included, which is
  // also how the selection it edits changes — and when the window moves.
  useEffect(() => {
    if (!textMenu) return
    const close = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null
      if (textMenuRef.current?.contains(target)) return
      if (target?.closest?.('[data-text-menu-trigger]')) return
      setTextMenu(null)
    }
    const dismiss = () => setTextMenu(null)
    window.addEventListener('mousedown', close)
    window.addEventListener('resize', dismiss)
    return () => {
      window.removeEventListener('mousedown', close)
      window.removeEventListener('resize', dismiss)
    }
  }, [textMenu])

  useEffect(() => {
    if (!menu) return
    const close = () => setMenu(null)
    window.addEventListener('click', close)
    window.addEventListener('contextmenu', close)
    return () => {
      window.removeEventListener('click', close)
      window.removeEventListener('contextmenu', close)
    }
  }, [menu])

  /* ── Rulers (point 1) ─────────────────────────────────────────── */

  const RULER = 22

  /**
   * Draw both rulers in the viewer's chosen unit. Tick spacing is chosen so the
   * labels stay readable at any zoom, and the origin is the print area's corner
   * rather than the raw canvas, so measurements match the artwork.
   */
  const drawRulers = useCallback(() => {
    const c = fabricRef.current
    const pa = printAreaRef.current
    const hEl = rulerHRef.current
    const vEl = rulerVRef.current
    if (!c || !pa || !hEl || !vEl) return

    const dpr = window.devicePixelRatio || 1
    const zoom = c.getZoom() || 1
    const vpt = c.viewportTransform || [1, 0, 0, 1, 0, 0]
    const perUnit = UNIT_TO_PX[rulerUnit] ?? 96

    // Pick a step that renders at roughly 60-140 screen px.
    const candidates =
      rulerUnit === 'mm'
        ? [1, 5, 10, 25, 50, 100, 250]
        : rulerUnit === 'px'
          ? [10, 25, 50, 100, 250, 500]
          : [0.125, 0.25, 0.5, 1, 2, 5, 10]
    const step =
      candidates.find((s) => s * perUnit * zoom >= 60) ??
      candidates[candidates.length - 1]

    const label = (v: number) =>
      rulerUnit === 'px'
        ? String(Math.round(v))
        : String(Math.round(v * 1000) / 1000)

    const setup = (el: HTMLCanvasElement, w: number, h: number) => {
      const pw = Math.max(1, Math.floor(w * dpr))
      const ph = Math.max(1, Math.floor(h * dpr))
      const ctx = el.getContext('2d')
      if (!ctx) return null
      // Assigning width/height clears the canvas, so only do it on a real size
      // change; otherwise just clear. This runs on every render.
      if (el.width !== pw || el.height !== ph) {
        el.width = pw
        el.height = ph
        el.style.width = `${w}px`
        el.style.height = `${h}px`
      } else {
        ctx.setTransform(1, 0, 0, 1, 0, 0)
        ctx.clearRect(0, 0, pw, ph)
      }
      ctx.setTransform(1, 0, 0, 1, 0, 0)
      ctx.scale(dpr, dpr)
      ctx.fillStyle = '#f8fafc'
      ctx.fillRect(0, 0, w, h)
      ctx.strokeStyle = '#cbd5e1'
      ctx.fillStyle = '#64748b'
      ctx.font = '9px Inter, system-ui, sans-serif'
      ctx.lineWidth = 1
      return ctx
    }

    const cw = c.getWidth()
    const ch = c.getHeight()
    const originX = pa.left || 0
    const originY = pa.top || 0

    // Horizontal
    const hctx = setup(hEl, cw, RULER)
    if (hctx) {
      const first =
        Math.floor((-vpt[4] / zoom - originX) / perUnit / step) * step
      const last = (cw - vpt[4]) / zoom - originX
      hctx.beginPath()
      for (let u = first; u * perUnit <= last; u += step) {
        const sx = (originX + u * perUnit) * zoom + vpt[4]
        if (sx < -40 || sx > cw + 40) continue
        hctx.moveTo(Math.round(sx) + 0.5, RULER - 6)
        hctx.lineTo(Math.round(sx) + 0.5, RULER)
        hctx.fillText(label(u), Math.round(sx) + 3, 11)
      }
      hctx.stroke()
      hctx.beginPath()
      hctx.moveTo(0, RULER - 0.5)
      hctx.lineTo(cw, RULER - 0.5)
      hctx.stroke()
    }

    // Vertical
    const vctx = setup(vEl, RULER, ch)
    if (vctx) {
      const first =
        Math.floor((-vpt[5] / zoom - originY) / perUnit / step) * step
      const last = (ch - vpt[5]) / zoom - originY
      vctx.beginPath()
      for (let u = first; u * perUnit <= last; u += step) {
        const sy = (originY + u * perUnit) * zoom + vpt[5]
        if (sy < -40 || sy > ch + 40) continue
        vctx.moveTo(RULER - 6, Math.round(sy) + 0.5)
        vctx.lineTo(RULER, Math.round(sy) + 0.5)
        vctx.save()
        vctx.translate(9, Math.round(sy) - 3)
        vctx.rotate(-Math.PI / 2)
        vctx.fillText(label(u), 0, 0)
        vctx.restore()
      }
      vctx.stroke()
      vctx.beginPath()
      vctx.moveTo(RULER - 0.5, 0)
      vctx.lineTo(RULER - 0.5, ch)
      vctx.stroke()
    }
  }, [rulerUnit])

  useEffect(() => {
    drawRulersRef.current = drawRulers
    drawRulers()
  }, [drawRulers, showRulers, revision])

  /** Drop a guide where the drag off a ruler ended. */
  const finishGuideDrag = useCallback(
    (clientX: number, clientY: number) => {
      const c = fabricRef.current
      const el = canvasRef.current
      if (!c || !el || !guideDrag) return setGuideDrag(null)
      const rect = el.getBoundingClientRect()
      const p = fabric.util.transformPoint(
        new fabric.Point(clientX - rect.left, clientY - rect.top),
        fabric.util.invertTransform(c.viewportTransform || [1, 0, 0, 1, 0, 0])
      )
      if (guideDrag === 'h')
        userGuidesRef.current.horizontal.push(Math.round(p.y))
      else userGuidesRef.current.vertical.push(Math.round(p.x))
      setGuideDrag(null)
      syncGuideCountRef.current?.()
      c.requestRenderAll()
      bump()
    },
    [guideDrag, bump]
  )

  // Releasing outside the canvas would otherwise leave the drag stuck on.
  useEffect(() => {
    if (!guideDrag) return
    const cancel = () => setGuideDrag(null)
    window.addEventListener('mouseup', cancel)
    return () => window.removeEventListener('mouseup', cancel)
  }, [guideDrag])

  const syncGuideCount = useCallback(() => {
    const g = userGuidesRef.current
    setGuideCount(g.horizontal.length + g.vertical.length)
  }, [])

  /** The guide under a canvas-space point, within a few screen pixels. */
  const guideAt = useCallback((p: { x: number; y: number }) => {
    const zoom = fabricRef.current?.getZoom() || 1
    const tol = 6 / zoom
    const g = userGuidesRef.current
    const vi = g.vertical.findIndex((x) => Math.abs(x - p.x) <= tol)
    if (vi >= 0) return { axis: 'v' as const, index: vi }
    const hi = g.horizontal.findIndex((y) => Math.abs(y - p.y) <= tol)
    if (hi >= 0) return { axis: 'h' as const, index: hi }
    return null
  }, [])

  const removeGuide = useCallback(
    (axis: 'h' | 'v', index: number) => {
      const list =
        axis === 'v'
          ? userGuidesRef.current.vertical
          : userGuidesRef.current.horizontal
      if (index < 0 || index >= list.length) return
      list.splice(index, 1)
      syncGuideCount()
      fabricRef.current?.requestRenderAll()
      bump()
    },
    [syncGuideCount, bump]
  )

  useEffect(() => {
    guideAtRef.current = guideAt
    syncGuideCountRef.current = syncGuideCount
    removeGuideRef.current = removeGuide
  }, [guideAt, syncGuideCount, removeGuide])

  const clearGuides = useCallback(() => {
    userGuidesRef.current = { horizontal: [], vertical: [] }
    syncGuideCount()
    fabricRef.current?.requestRenderAll()
    bump()
  }, [syncGuideCount, bump])

  /* ── Background transparency (point 1) ────────────────────────── */

  useEffect(() => {
    const c = fabricRef.current
    const pa = printAreaRef.current
    if (!c || !pa) return

    // The checkerboard is chrome: it shows transparency in the editor but is
    // hidden on export, so the output really is transparent.
    const existing = (c.getObjects() as FabricAny[]).find(
      (o) => o.isCheckerboard
    )
    if (existing) c.remove(existing)

    // Nothing to indicate when there is a garment behind: what is "behind the
    // transparency" is the cap, and a chequerboard over it would hide the one
    // thing the mockup exists to show.
    if (bgTransparent && !mockupRef.current?.src) {
      pa.set('fill', 'transparent')
      const tile = document.createElement('canvas')
      tile.width = 16
      tile.height = 16
      const tctx = tile.getContext('2d')
      if (tctx) {
        tctx.fillStyle = '#ffffff'
        tctx.fillRect(0, 0, 16, 16)
        tctx.fillStyle = '#e2e8f0'
        tctx.fillRect(0, 0, 8, 8)
        tctx.fillRect(8, 8, 8, 8)
      }
      const board = new fabric.Rect({
        left: pa.left,
        top: pa.top,
        width: pa.width,
        height: pa.height,
        selectable: false,
        evented: false,
        // Fabric accepts a canvas source at runtime; its types only list img/url.
        fill: new fabric.Pattern({
          source: tile as unknown as HTMLImageElement,
          repeat: 'repeat',
        }),
      }) as FabricAny
      board.isCheckerboard = true
      // Overlay, so it is never a document object -- but NOT a guide. Guides
      // are brought to the front by `normalizeStack`, and this one went with
      // them: an opaque chequered rectangle painted over the artwork, hiding
      // every object inside the artboard. It is a backdrop. It belongs at the
      // very bottom of the stack, under the sheet itself.
      board.isOverlay = true
      c.add(board)
      c.sendToBack(board)
    } else if (bgTransparent) {
      pa.set('fill', 'transparent')
    } else if ((pa.fill as string) === 'transparent') {
      pa.set(
        'fill',
        templateRef.current.canvasConfig.backgroundColor || '#ffffff'
      )
    }
    c.sendToBack(pa)
    const board = (c.getObjects() as FabricAny[]).find((o) => o.isCheckerboard)
    if (board) c.sendToBack(board)
    c.requestRenderAll()
    bump()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bgTransparent])

  /* ── Object creation ──────────────────────────────────────────── */

  const tagNew = useCallback((o: FabricAny, type: string) => {
    o.layerId = `layer-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
    o.layerName = defaultNameFor(type)
    o.layerLabel = defaultNameFor(type)
    o.customType = type
    o.isEditableBySiteUser = false
    o.isRequired = false
    return o
  }, [])

  /** Positions an object so its centre lands on (x, y) in canvas coordinates. */
  const placeCentered = useCallback(
    (o: fabric.Object, x: number, y: number) => {
      o.set({ originX: 'left', originY: 'top' })
      o.setCoords()
      o.set({
        left: x - o.getScaledWidth() / 2,
        top: y - o.getScaledHeight() / 2,
      })
      o.setCoords()
    },
    []
  )

  /**
   * Moves a new object into the safe area, and off an object already sitting
   * at the same spot.
   *
   * Click-to-add puts things in the middle of the view, which is wherever the
   * canvas happens to be scrolled or zoomed — often the grey pasteboard, where
   * nothing prints. So the object is pulled onto the sheet, inside the safe
   * area, and each further click steps down and to the right instead of
   * stacking exactly on the last one.
   */
  const settleOnSheet = useCallback((o: FabricAny) => {
    const c = fabricRef.current
    const pa = printAreaRef.current
    if (!c || !pa) return
    const factor = UNIT_TO_PX[templateRef.current.dimensions.unit] ?? 96
    const inset = (templateRef.current.safeMargin || 0) * factor
    const areaL = (pa.left || 0) + inset
    const areaT = (pa.top || 0) + inset
    const areaW = Math.max(1, (pa.width || 0) - inset * 2)
    const areaH = Math.max(1, (pa.height || 0) - inset * 2)

    o.setCoords()
    const box = o.getBoundingRect(true, true)
    // Where the box can start and stay inside; centred when it is larger.
    const fit = (start: number, size: number, from: number, span: number) =>
      size >= span
        ? from + (span - size) / 2
        : Math.min(Math.max(start, from), from + span - size)
    let left = fit(box.left, box.width, areaL, areaW)
    let top = fit(box.top, box.height, areaT, areaH)

    if (box.width < areaW && box.height < areaH) {
      const step = Math.max(8, Math.round(Math.min(areaW, areaH) * 0.04))
      const taken = (c.getObjects() as FabricAny[])
        .filter((x) => x !== o && !isChrome(x))
        .map((x) => x.getBoundingRect(true, true))
      const occupied = () =>
        taken.some(
          (b) =>
            Math.abs(b.left - left) < step / 2 &&
            Math.abs(b.top - top) < step / 2
        )
      // Down and right, turning back at an edge, so the next one stays near
      // the part of the sheet in view rather than jumping to the far side.
      let dx = step
      let dy = step
      for (let n = 0; n < 40 && occupied(); n++) {
        if (left + dx < areaL || left + dx + box.width > areaL + areaW) dx = -dx
        if (top + dy < areaT || top + dy + box.height > areaT + areaH) dy = -dy
        left = Math.min(Math.max(left + dx, areaL), areaL + areaW - box.width)
        top = Math.min(Math.max(top + dy, areaT), areaT + areaH - box.height)
      }
    }

    o.set({
      left: (o.left ?? 0) + (left - box.left),
      top: (o.top ?? 0) + (top - box.top),
    })
    o.setCoords()
  }, [])

  const addObject = useCallback(
    (
      type: string,
      x: number,
      y: number,
      { keepOnSheet = false }: { keepOnSheet?: boolean } = {}
    ) => {
      const canvas = fabricRef.current
      if (!canvas) return

      const commit = (o: FabricAny) => {
        // QR/barcode/image bitmaps resolve asynchronously - bail if the canvas
        // was torn down (or replaced) while we were waiting.
        if (fabricRef.current !== canvas) return
        placeCentered(o, x, y)
        if (keepOnSheet) settleOnSheet(o)
        tagNew(o, type)
        // Here rather than in the 'line' branch, so any later shape that turns
        // out to be one-dimensional is covered without anyone remembering to.
        applyLineControls(o)
        canvas.add(o)
        canvas.setActiveObject(o)
        canvas.requestRenderAll()
        setActiveObj(o)
      }

      // Defaults are proportional to the sheet, not fixed pixels. 24px suits an
      // A4 page; on a 33x80in banner the same 24px is a speck, which is why a
      // dropped label had to be hand-tuned to be legible at all.
      const sheetW = printAreaRef.current?.width || 794
      const k = Math.max(0.5, Math.min(sheetW / 794, 8))
      const px = (n: number) => Math.round(n * k)

      const textDefaults = {
        fontFamily: 'Inter',
        fill: '#000000',
        fontSize: px(24),
        originX: 'left' as const,
        originY: 'top' as const,
      }

      switch (type) {
        case 'text':
          return commit(new fabric.IText('Text', textDefaults) as FabricAny)
        case 'number':
          return commit(new fabric.IText('0.00', textDefaults) as FabricAny)
        case 'date':
          return commit(
            new fabric.IText(
              new Date().toISOString().slice(0, 10),
              textDefaults
            ) as FabricAny
          )
        case 'rank':
          return commit(
            new fabric.IText('★★★★★', {
              ...textDefaults,
              fontSize: 32,
            }) as FabricAny
          )
        case 'rect':
          return commit(
            new fabric.Rect({
              fill: 'transparent',
              stroke: '#000000',
              strokeWidth: 1,
              width: px(160),
              height: px(90),
              originX: 'left',
              originY: 'top',
            }) as FabricAny
          )
        case 'circle':
          return commit(
            new fabric.Circle({
              fill: 'transparent',
              stroke: '#000000',
              strokeWidth: 1,
              radius: px(50),
              originX: 'left',
              originY: 'top',
            }) as FabricAny
          )
        case 'polygon':
          return commit(
            new fabric.Polygon(regularPolygonPoints(5, px(60)), {
              fill: 'transparent',
              stroke: '#000000',
              strokeWidth: 1,
              originX: 'left',
              originY: 'top',
            }) as FabricAny
          )
        case 'path':
          // The pen is a canvas mode, not a drop: turn it on instead.
          setPenMode(true)
          setToast({
            kind: 'ok',
            msg: 'Pen: click to place points, Enter or double-click to finish',
          })
          setTimeout(() => setToast(null), 3200)
          return
        case 'line':
          return commit(
            new fabric.Line([0, 0, px(160), 0], {
              stroke: '#000000',
              strokeWidth: 2,
              originX: 'left',
              originY: 'top',
            }) as FabricAny
          )
        case 'image': {
          // A reserved space with the instruction inside it. A bare grey
          // rectangle tells whoever has to fill it nothing at all.
          const box = new fabric.Rect({
            fill: '#e5e7eb',
            stroke: '#9ca3af',
            strokeDashArray: [4, 4],
            strokeWidth: 1,
            width: px(160),
            height: px(120),
            originX: 'left',
            originY: 'top',
          }) as FabricAny
          applyPlaceholderLabel(box, DEFAULT_PLACEHOLDER_LABEL)
          return commit(box)
        }
        case 'barcode': {
          try {
            fabric.Image.fromURL(barcodeDataUrl('123456789'), (img) => {
              const o = img as FabricAny
              o.scaleToWidth(px(BARCODE_DISPLAY_PX))
              o.scanUrl = '123456789'
              commit(o)
            })
          } catch {
            setToast({ kind: 'err', msg: 'Could not generate barcode' })
          }
          return
        }
        case 'qrcode': {
          qrDataUrl('https://example.com').then((url) => {
            if (!url)
              return setToast({
                kind: 'err',
                msg: 'Could not generate QR code',
              })
            fabric.Image.fromURL(url, (img) => {
              const o = img as FabricAny
              o.scaleToWidth(px(QR_DISPLAY_PX))
              o.scanUrl = 'https://example.com'
              commit(o)
            })
          })
          return
        }
        default:
          return
      }
    },
    [placeCentered, settleOnSheet, tagNew]
  )

  /** Canvas-space coordinates of the current viewport centre - used for click-to-add. */
  const viewportCentre = useCallback(() => {
    const c = fabricRef.current
    const wrap = wrapperRef.current
    if (!c || !wrap) return { x: 0, y: 0 }
    const vpt = c.viewportTransform
    if (!vpt) return { x: wrap.clientWidth / 2, y: wrap.clientHeight / 2 }
    const p = fabric.util.transformPoint(
      new fabric.Point(wrap.clientWidth / 2, wrap.clientHeight / 2),
      fabric.util.invertTransform(vpt)
    )
    return { x: p.x, y: p.y }
  }, [])

  /* ── Drag & drop ──────────────────────────────────────────────── */

  const handleDragStart = (
    e: React.DragEvent<HTMLDivElement>,
    type: string
  ) => {
    e.dataTransfer.setData('type', type)
    e.dataTransfer.effectAllowed = 'copy'
  }

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'copy'
  }

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    const type = e.dataTransfer.getData('type')
    const canvas = fabricRef.current
    const el = canvasRef.current
    if (!type || !canvas || !el) return

    const rect = el.getBoundingClientRect()
    let x = e.clientX - rect.left
    let y = e.clientY - rect.top

    if (canvas.viewportTransform) {
      const p = fabric.util.transformPoint(
        new fabric.Point(x, y),
        fabric.util.invertTransform(canvas.viewportTransform)
      )
      x = p.x
      y = p.y
    }

    addObject(type, x, y)

    // Dropped from the Collection tab: bind the new text layer to its merge field.
    const fieldKey = e.dataTransfer.getData('fieldKey')
    if (!fieldKey) return
    const created = canvas.getActiveObject() as FabricAny | null
    if (!created) return
    const meta = FIELD_KEY_OPTIONS.find((f) => f.key === fieldKey)
    created.fieldKey = fieldKey
    created.isEditableBySiteUser = true
    created.layerName = meta?.label || fieldKey
    created.layerLabel = meta?.label || fieldKey
    if (meta?.defaultPlaceholder && created.type === 'i-text') {
      ;(created as unknown as fabric.IText).set('text', meta.defaultPlaceholder)
    }
    canvas.requestRenderAll()
    snapshot()
    bump()
  }

  /* ── Object mutation helpers ──────────────────────────────────── */

  const mutateActive = useCallback(
    (fn: (o: FabricAny) => void, historyMode: 'now' | 'soon' = 'soon') => {
      const o = activeObj
      if (!o) return
      fn(o)
      o.setCoords()
      fabricRef.current?.requestRenderAll()
      if (historyMode === 'now') snapshot()
      else snapshotSoon()
      bump()
    },
    [activeObj, snapshot, snapshotSoon, bump]
  )

  /**
   * Edit any object, not only the selected one.
   *
   * `mutateActive` covers the inspector, where the object being edited is by
   * definition the one selected. The personalisation list edits rows the user
   * has not selected, and selecting each row to change a checkbox would keep
   * yanking the canvas around.
   */
  const mutateObject = useCallback(
    (o: FabricAny, fn: (o: FabricAny) => void) => {
      fn(o)
      o.setCoords()
      fabricRef.current?.requestRenderAll()
      snapshot()
      bump()
    },
    [snapshot, bump]
  )

  /**
   * Write branch details straight onto the artwork.
   *
   * Matched on the same key the basket uses - the merge field where there is
   * one, the layer id otherwise - so a value filled in by the host lands on the
   * layer that value will be checked against. Anything the design does not have
   * a field for is ignored rather than guessed at.
   */
  const applyFieldValues = useCallback(
    (values: Record<string, string>) => {
      const c = fabricRef.current
      if (!c) return
      runAtomicRef.current?.('text', () => {
        for (const { o } of personalisableLayersRef.current) {
          if (!o.isEditableBySiteUser) continue
          const key = (o.fieldKey as string) || (o.layerId as string)
          const next = values[key]
          if (typeof next !== 'string') continue
          const t = o as unknown as fabric.IText
          if (typeof t.set === 'function' && 'text' in t)
            setTextKeepingCase(o as FabricAny, next)
          o.setCoords()
        }
      })
      c.requestRenderAll()
      snapshot()
      bump()
    },
    [snapshot, bump]
  )

  /* ── Text editing helpers ─────────────────────────────────────── */

  /** Read a text property off the selection, with a fallback. */
  const textProp = useCallback(
    <T,>(key: string, fallback: T): T => {
      const t = activeObj as unknown as Record<string, T> | null
      const v = t?.[key]
      return v === undefined || v === null ? fallback : v
    },
    [activeObj]
  )

  /**
   * A text object's on-screen size is fontSize x scaleY. Resizing by handle
   * changes scale, so bake that back into fontSize and reset scale - otherwise
   * the number in the toolbar drifts from what you see.
   */
  const effectiveFontSize = useCallback((): number => {
    const o = activeObj
    if (!o) return 16
    const t = o as unknown as fabric.IText
    return Math.max(1, Math.round((t.fontSize || 16) * (o.scaleY || 1)))
  }, [activeObj])

  const setFontSize = useCallback(
    (size: number) => {
      const next = Math.max(1, Math.min(600, Math.round(size)))
      mutateActive((o) => {
        o.set({ scaleX: 1, scaleY: 1 })
        ;(o as unknown as fabric.IText).set('fontSize', next)
      })
    },
    [mutateActive]
  )

  const stepFontSize = useCallback(
    (delta: number) => setFontSize(effectiveFontSize() + delta),
    [effectiveFontSize, setFontSize]
  )

  const setTextProp = useCallback(
    (key: string, value: unknown, commit: 'now' | 'soon' = 'now') =>
      mutateActive((o) => {
        const t = o as unknown as fabric.IText
        const editing = !!(o as FabricAny).isEditing
        const hasRange = editing && t.selectionStart !== t.selectionEnd

        if (hasRange && CHAR_STYLE_KEYS.has(key)) {
          // Characters are highlighted inside the editor: style just those.
          t.setSelectionStyles({ [key]: value })
        } else {
          // Whole object. Per-character overrides from an earlier selection edit
          // would win over the object value, so clear them for this property.
          if (CHAR_STYLE_KEYS.has(key)) {
            try {
              ;(
                t as unknown as { removeStyle?: (p: string) => void }
              ).removeStyle?.(key)
            } catch {
              /* no per-character styles to clear */
            }
          }
          o.set(key as keyof fabric.Object, value as never)
        }

        // Fabric only invalidates its render cache when set() sees a *changed*
        // value, so force it. Without this the glyphs keep drawing from the old
        // cached bitmap until the next keystroke dirties it.
        o.set('dirty', true as never)
      }, commit),
    [mutateActive]
  )

  const toggleTextProp = useCallback(
    (key: 'underline' | 'linethrough') => {
      const t = activeObj as unknown as fabric.IText | null
      if (!t) return
      const editing = !!(activeObj as FabricAny)?.isEditing
      const hasRange = editing && t.selectionStart !== t.selectionEnd
      const current = hasRange
        ? !!(
            t.getSelectionStyles(
              t.selectionStart,
              t.selectionEnd,
              true
            ) as Record<string, unknown>[]
          )?.[0]?.[key]
        : !!(t as unknown as Record<string, boolean>)[key]
      setTextProp(key, !current)
    },
    [activeObj, setTextProp]
  )

  const deleteSelected = useCallback(() => {
    const c = fabricRef.current
    if (!c) return
    const targets = c
      .getActiveObjects()
      .filter((o) => !isChrome(o as FabricAny))
    if (!targets.length) return
    // One gesture, one undo step: removing five objects individually recorded
    // five entries, so undo restored them one at a time.
    runAtomicRef.current?.('delete', () => {
      targets.forEach((o) => c.remove(o))
      c.discardActiveObject()
      c.requestRenderAll()
      setActiveObj(null)
      setSelectedIds([])
    })
  }, [])

  /* ── Pen tool: custom bezier paths (point 2) ──────────────────── */

  const [penMode, setPenMode] = useState(false)
  const [penSmooth, setPenSmooth] = useState(true)
  const penPointsRef = useRef<{ x: number; y: number }[]>([])
  const penHoverRef = useRef<{ x: number; y: number } | null>(null)
  const penModeRef = useRef(penMode)
  const penSmoothRef = useRef(penSmooth)
  useEffect(() => {
    penModeRef.current = penMode
  }, [penMode])
  useEffect(() => {
    penSmoothRef.current = penSmooth
  }, [penSmooth])

  const cancelPen = useCallback(() => {
    penPointsRef.current = []
    penHoverRef.current = null
    setPenMode(false)
    fabricRef.current?.requestRenderAll()
  }, [])

  /** Turn the placed anchors into a real fabric.Path object. */
  const finishPen = useCallback(
    (closed = false) => {
      const c = fabricRef.current
      const pts = penPointsRef.current
      if (!c || pts.length < 2) return cancelPen()

      // Normalise to a local origin so left/top mean what they do elsewhere.
      const minX = Math.min(...pts.map((p) => p.x))
      const minY = Math.min(...pts.map((p) => p.y))
      const local = pts.map((p) => ({ x: p.x - minX, y: p.y - minY }))
      const d = pathFromPoints(local, penSmoothRef.current, closed)
      if (!d) return cancelPen()

      const path = new fabric.Path(d, {
        left: minX,
        top: minY,
        originX: 'left',
        originY: 'top',
        fill: closed ? 'transparent' : '',
        stroke: '#000000',
        strokeWidth: 2,
      }) as FabricAny
      path.layerId = `layer-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
      path.designId = path.layerId
      path.customType = 'path'
      path.layerName = 'Path'
      path.layerLabel = 'Path'
      path.isEditableBySiteUser = false

      c.add(path)
      c.setActiveObject(path)
      normalizeStackRef.current?.(c)
      c.requestRenderAll()
      setActiveObj(path)
      penPointsRef.current = []
      penHoverRef.current = null
      setPenMode(false)
      snapshot('add')
      bump()
    },
    [cancelPen, snapshot, bump]
  )

  const finishPenRef = useRef<((closed?: boolean) => void) | null>(null)
  const cancelPenRef = useRef<(() => void) | null>(null)
  useEffect(() => {
    finishPenRef.current = finishPen
    cancelPenRef.current = cancelPen
  }, [finishPen, cancelPen])

  /* ── Clipboard (point 9) ──────────────────────────────────────── */

  /** Detached clones, so the source can be deleted and still paste. */
  const clipboardRef = useRef<fabric.Object[]>([])
  const [clipboardCount, setClipboardCount] = useState(0)
  const PASTE_OFFSET = 18

  const copySelected = useCallback(() => {
    const c = fabricRef.current
    if (!c) return
    const targets = (c.getActiveObjects() as FabricAny[]).filter(
      (o) => !isChrome(o)
    )
    if (!targets.length) return
    Promise.all(
      targets.map(
        (o) =>
          new Promise<fabric.Object>((resolve) =>
            o.clone((clone: fabric.Object) => resolve(clone), CUSTOM_PROPS)
          )
      )
    ).then((clones) => {
      clipboardRef.current = clones
      setClipboardCount(clones.length)
      setToast({
        kind: 'ok',
        msg: `Copied ${clones.length} layer${clones.length > 1 ? 's' : ''}`,
      })
      setTimeout(() => setToast(null), 1600)
    })
  }, [])

  const pasteClipboard = useCallback(() => {
    const c = fabricRef.current
    if (!c || !clipboardRef.current.length) return
    // Clone again on paste so repeated pastes do not share one object.
    Promise.all(
      clipboardRef.current.map(
        (o) =>
          new Promise<FabricAny>((resolve) =>
            o.clone(
              (clone: fabric.Object) => resolve(clone as FabricAny),
              CUSTOM_PROPS
            )
          )
      )
    ).then((clones) => {
      if (fabricRef.current !== c) return
      runAtomicRef.current?.('paste', () => {
        c.discardActiveObject()
        clones.forEach((clone) => {
          clone.set({
            left: (clone.left || 0) + PASTE_OFFSET,
            top: (clone.top || 0) + PASTE_OFFSET,
          })
          // A fresh identity, or the diff engine would treat this as a move.
          clone.layerId = `layer-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
          clone.designId = clone.layerId
          clone.setCoords()
          c.add(clone)
        })
        // Offset the stored copies too, so a second paste steps further along.
        clipboardRef.current.forEach((o) =>
          o.set({
            left: (o.left || 0) + PASTE_OFFSET,
            top: (o.top || 0) + PASTE_OFFSET,
          })
        )
        if (clones.length === 1) c.setActiveObject(clones[0])
        else
          c.setActiveObject(new fabric.ActiveSelection(clones, { canvas: c }))
        normalizeStackRef.current?.(c)
        c.requestRenderAll()
        setActiveObj((c.getActiveObject() as FabricAny) || null)
        bump()
      })
    })
  }, [bump])

  /**
   * Alt+drag: leave the original where it is and drag a fresh copy. The clone is
   * made active before fabric begins its drag, so the pointer carries the copy.
   */
  const altDragDuplicate = useCallback(
    (source: FabricAny) => {
      const c = fabricRef.current
      if (!c || isChrome(source)) return
      source.clone((clone: fabric.Object) => {
        if (fabricRef.current !== c) return
        const o = clone as FabricAny
        o.layerId = `layer-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
        o.designId = o.layerId
        o.layerName = `${source.layerName || 'Layer'} copy`
        c.add(o)
        c.setActiveObject(o)
        c.requestRenderAll()
        setActiveObj(o)
        snapshot('duplicate')
        bump()
      }, CUSTOM_PROPS)
    },
    [snapshot, bump]
  )

  useEffect(() => {
    altDragRef.current = altDragDuplicate
  }, [altDragDuplicate])

  useEffect(() => {
    runAtomicRef.current = runAtomic
  }, [runAtomic])

  const cutSelected = useCallback(() => {
    const c = fabricRef.current
    if (!c) return
    copySelected()
    const targets = (c.getActiveObjects() as FabricAny[]).filter(
      (o) => !isChrome(o)
    )
    if (!targets.length) return
    runAtomicRef.current?.('delete', () => {
      targets.forEach((o) => c.remove(o))
      c.discardActiveObject()
      c.requestRenderAll()
      setActiveObj(null)
      setSelectedIds([])
      bump()
    })
  }, [copySelected, bump])

  const duplicateSelected = useCallback(() => {
    const c = fabricRef.current
    const o = c?.getActiveObject() as FabricAny | undefined
    if (!c || !o || isChrome(o)) return
    o.clone((clone: FabricAny) => {
      clone.set({ left: (o.left || 0) + 20, top: (o.top || 0) + 20 })
      clone.layerId = `layer-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
      clone.layerName = `${o.layerName || 'Layer'} copy`
      c.add(clone)
      c.setActiveObject(clone)
      c.requestRenderAll()
      setActiveObj(clone)
    }, CUSTOM_PROPS)
  }, [])

  const alignSelected = useCallback(
    (mode: 'left' | 'hcenter' | 'right' | 'top' | 'vmiddle' | 'bottom') => {
      const c = fabricRef.current
      const pa = printAreaRef.current
      if (!c || !pa) return
      const targets = c
        .getActiveObjects()
        .filter((o) => !isChrome(o as FabricAny))
      if (!targets.length) return

      const L = pa.left || 0
      const T = pa.top || 0
      const W = pa.width || 0
      const H = pa.height || 0

      targets.forEach((o) => {
        const w = o.getScaledWidth()
        const h = o.getScaledHeight()
        switch (mode) {
          case 'left':
            o.set({ left: L })
            break
          case 'hcenter':
            o.set({ left: L + (W - w) / 2 })
            break
          case 'right':
            o.set({ left: L + W - w })
            break
          case 'top':
            o.set({ top: T })
            break
          case 'vmiddle':
            o.set({ top: T + (H - h) / 2 })
            break
          case 'bottom':
            o.set({ top: T + H - h })
            break
        }
        o.setCoords()
      })
      c.requestRenderAll()
      snapshot()
      bump()
    },
    [snapshot, bump]
  )

  /** Equal gaps between three or more selected layers (point 6). */
  const distributeSelected = useCallback(
    (axis: 'horizontal' | 'vertical') => {
      const c = fabricRef.current
      if (!c) return
      const targets = (c.getActiveObjects() as FabricAny[]).filter(
        (o) => !isChrome(o)
      )
      if (targets.length < 3) {
        setToast({
          kind: 'err',
          msg: 'Select three or more layers to distribute',
        })
        setTimeout(() => setToast(null), 2600)
        return
      }
      distributeObjects(targets, axis)
      c.requestRenderAll()
      snapshot()
      bump()
    },
    [snapshot, bump]
  )

  /* ── Effects: shadow, dash, gradient, filters, crop (point 7) ─── */

  const shadowOf = useCallback((): fabric.Shadow | null => {
    return (activeObj?.shadow as fabric.Shadow | undefined) || null
  }, [activeObj])

  const setShadow = useCallback(
    (
      patch: Partial<{
        color: string
        blur: number
        offsetX: number
        offsetY: number
      }>
    ) => {
      mutateActive((o) => {
        const s = (o.shadow as fabric.Shadow | undefined) || null
        o.set(
          'shadow',
          new fabric.Shadow({
            color: patch.color ?? s?.color ?? 'rgba(15,23,42,0.35)',
            blur: patch.blur ?? s?.blur ?? 8,
            offsetX: patch.offsetX ?? s?.offsetX ?? 4,
            offsetY: patch.offsetY ?? s?.offsetY ?? 4,
          })
        )
        o.set('dirty', true as never)
      }, 'soon')
    },
    [mutateActive]
  )

  const clearShadow = useCallback(
    () =>
      mutateActive((o) => {
        o.set('shadow', undefined as never)
        o.set('dirty', true as never)
      }, 'now'),
    [mutateActive]
  )

  /* ── Text format and effects (the text toolbar's menus) ── */

  const setTextCase = useCallback(
    (next: TextCase) =>
      mutateActive((o) => applyTextCaseToFabric(o, next), 'now'),
    [mutateActive]
  )

  /** A preset records one history step; dragging its slider records one too. */
  const applyEffect = useCallback(
    (kind: TextEffectKind, patch?: { color?: string; intensity?: number }) =>
      mutateActive(
        (o) => applyTextEffectToFabric(o, kind, patch),
        patch ? 'soon' : 'now'
      ),
    [mutateActive]
  )

  const toggleTextMenu = useCallback(
    (kind: ToolbarMenuKind, anchor: HTMLElement) => {
      const rect = anchor.getBoundingClientRect()
      const width = MENU_WIDTHS[kind]
      setTextMenu((open) =>
        open?.kind === kind
          ? null
          : {
              kind,
              // Centred under its button, and kept on screen near an edge.
              left: Math.max(
                12,
                Math.min(
                  rect.left + rect.width / 2 - width / 2,
                  window.innerWidth - width - 12
                )
              ),
              top: rect.bottom + 8,
            }
      )
    },
    []
  )

  const setDash = useCallback(
    (style: 'solid' | 'dashed' | 'dotted') =>
      mutateActive((o) => {
        const w = Math.max(1, o.strokeWidth || 1)
        const dash =
          style === 'dashed'
            ? [w * 4, w * 3]
            : style === 'dotted'
              ? [1, w * 2.5]
              : undefined
        o.set('strokeDashArray', dash as never)
        o.set('strokeLineCap', (style === 'dotted' ? 'round' : 'butt') as never)
        o.set('dirty', true as never)
      }, 'now'),
    [mutateActive]
  )

  const dashStyle = useMemo<'solid' | 'dashed' | 'dotted'>(() => {
    const d = activeObj?.strokeDashArray as number[] | undefined
    if (!d || !d.length) return 'solid'
    return d[0] <= 2 ? 'dotted' : 'dashed'
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeObj, revision])

  /* ── Gradient fill ── */

  const gradientOf = useCallback((): Gradient | null => {
    const f = activeObj?.fill
    if (!f || typeof f !== 'object' || !(f as fabric.Gradient).colorStops)
      return null
    const g = f as unknown as {
      type: string
      colorStops: { offset: number; color: string }[]
    }
    return {
      kind: g.type === 'radial' ? 'radial' : 'linear',
      // Read back the angle we stored. It cannot be recovered from the gradient
      // coordinates: those bake in the object's aspect ratio, so atan2 on them
      // returns a different angle for anything that is not square.
      angle: (activeObj?.gradientAngle as number) ?? 0,
      stops: g.colorStops.map((s) => ({ offset: s.offset, color: s.color })),
    }
  }, [activeObj])

  /** Rebuild the fabric gradient from a plain definition, sized to the object. */
  const applyGradient = useCallback(
    (g: Gradient | null) => {
      mutateActive((o) => {
        if (!g) {
          o.set('fill', '#3b82f6')
        } else {
          o.set(
            'fill',
            docFillToFabric(
              g,
              o.getScaledWidth() || 1,
              o.getScaledHeight() || 1
            ) as never
          )
          // Kept alongside the fill so the slider reflects the real value.
          o.gradientAngle = g.angle ?? 0
        }
        o.set('dirty', true as never)
      }, 'now')
    },
    [mutateActive]
  )

  /* ── Image filters ── */

  const filtersOf = useCallback((): ImageFilters => {
    return (activeObj?.imageFilters as ImageFilters | undefined) || {}
  }, [activeObj])

  const setFilter = useCallback(
    (key: keyof ImageFilters, value: number) => {
      mutateActive((o) => {
        const next = {
          ...((o.imageFilters as ImageFilters) || {}),
          [key]: value,
        }
        o.imageFilters = next
        applyImageFilters(o as unknown as fabric.Image, next)
        o.set('dirty', true as never)
      }, 'soon')
    },
    [mutateActive]
  )

  const resetFilters = useCallback(
    () =>
      mutateActive((o) => {
        o.imageFilters = {}
        applyImageFilters(o as unknown as fabric.Image, {})
        o.set('dirty', true as never)
      }, 'now'),
    [mutateActive]
  )

  /* ── Crop ── */

  const [cropping, setCropping] = useState(false)
  const cropRectRef = useRef<FabricAny | null>(null)
  /**
   * The picture being cropped.
   *
   * Held from the moment Crop is pressed, not read from the selection when
   * Apply is. Starting a crop selects the blue box, and the selection is what
   * `activeObj` follows — so Apply used to find a rectangle where it expected
   * a picture, and quietly cancelled.
   */
  const cropTargetRef = useRef<FabricAny | null>(null)

  const startCrop = useCallback(() => {
    const c = fabricRef.current
    const o = activeObj
    if (!c || !o || o.type !== 'image' || cropRectRef.current) return
    const centre = o.getCenterPoint()
    // Drawn over the picture at its own angle, and not rotatable: the crop is
    // a region of the picture, measured along the picture's own edges.
    const rect = new fabric.Rect({
      left: centre.x,
      top: centre.y,
      originX: 'center',
      originY: 'center',
      angle: o.angle || 0,
      width: o.getScaledWidth(),
      height: o.getScaledHeight(),
      fill: 'rgba(59,130,246,0.15)',
      stroke: '#3b82f6',
      strokeWidth: 2,
      strokeUniform: true,
      strokeDashArray: [6, 4],
      transparentCorners: false,
      lockRotation: true,
    }) as FabricAny
    rect.setControlsVisibility({ mtr: false })
    rect.isOverlay = true
    rect.isGuide = true
    cropTargetRef.current = o
    cropRectRef.current = rect
    c.add(rect)
    c.setActiveObject(rect)
    c.requestRenderAll()
    setCropping(true)
  }, [activeObj])

  const cancelCrop = useCallback(() => {
    const c = fabricRef.current
    const target = cropTargetRef.current
    if (c && cropRectRef.current) c.remove(cropRectRef.current)
    cropRectRef.current = null
    cropTargetRef.current = null
    setCropping(false)
    // Back to the picture, so its toolbar and panel come back with it.
    if (c && target && c.getObjects().includes(target)) {
      c.setActiveObject(target)
    }
    c?.requestRenderAll()
  }, [])

  /** Crops the picture to the blue box — see `cropImageToRect`. */
  const applyCrop = useCallback(() => {
    const c = fabricRef.current
    const img = cropTargetRef.current
    const rect = cropRectRef.current
    if (
      !c ||
      !img ||
      !rect ||
      img.type !== 'image' ||
      !c.getObjects().includes(img)
    ) {
      cancelCrop()
      return
    }

    cropImageToRect(img, {
      centre: rect.getCenterPoint(),
      // The box's own size, without the dashed stroke drawn around it.
      width: (rect.width || 0) * (rect.scaleX || 1),
      height: (rect.height || 0) * (rect.scaleY || 1),
    })

    c.remove(rect)
    cropRectRef.current = null
    cropTargetRef.current = null
    setCropping(false)
    c.setActiveObject(img)
    c.requestRenderAll()
    snapshot()
    bump()
  }, [cancelCrop, snapshot, bump])

  const resetCrop = useCallback(() => {
    mutateActive((o) => {
      const el = (o as unknown as fabric.Image).getElement() as HTMLImageElement
      if (!el) return
      o.set({
        cropX: 0,
        cropY: 0,
        width: el.naturalWidth,
        height: el.naturalHeight,
      })
      o.srcCrop = undefined
      adoptCurrentBoxAsFrame(o)
      o.set('dirty', true as never)
    }, 'now')
  }, [mutateActive])

  /* ── Image toolbar: fill, fit, remove background, adjust ── */

  const fillImage = useCallback(
    () =>
      mutateActive((o) => {
        if (o.type === 'image') fillFrame(o)
      }, 'now'),
    [mutateActive]
  )

  const fitImage = useCallback(
    () =>
      mutateActive((o) => {
        if (o.type === 'image') fitFrame(o)
      }, 'now'),
    [mutateActive]
  )

  /** Puts one adjustment back to neutral, leaving the others. */
  const resetFilter = useCallback(
    (key: keyof ImageFilters) =>
      mutateActive((o) => {
        const next = { ...((o.imageFilters as ImageFilters) || {}) }
        delete next[key]
        o.imageFilters = next
        applyImageFilters(o as unknown as fabric.Image, next)
        o.set('dirty', true as never)
      }, 'now'),
    [mutateActive]
  )

  /**
   * A quarter turn clockwise, about the picture's centre so it stays where it
   * is. Any angle it already had is kept on top.
   */
  const rotateImage = useCallback(
    () => mutateActive((o) => o.rotate(((o.angle || 0) + 90) % 360), 'now'),
    [mutateActive]
  )

  const [bgTolerance, setBgTolerance] = useState(100)
  const [bgBusy, setBgBusy] = useState(false)
  /**
   * What Remove BG removes: everything behind the subject, found by the model,
   * or one plain colour around the edges — which stays the sharper answer for
   * a logo on white.
   */
  const [bgMode, setBgMode] = useState<'subject' | 'colour'>('subject')

  /** The picture Remove BG is working on, for the overlay shown over it meanwhile. */
  const bgTargetRef = useRef<FabricAny | null>(null)
  /** Where that picture sits in the canvas area, in screen pixels. */
  const [bgOverlay, setBgOverlay] = useState<{
    x: number
    y: number
    w: number
    h: number
    angle: number
  } | null>(null)

  // Keeps the working overlay on the picture, through any zoom or pan.
  useEffect(() => {
    const c = fabricRef.current
    const img = bgTargetRef.current
    if (!bgBusy || !c || !img) {
      setBgOverlay(null)
      return
    }
    const place = () => {
      const vpt = c.viewportTransform || [1, 0, 0, 1, 0, 0]
      const centre = fabric.util.transformPoint(img.getCenterPoint(), vpt)
      const next = {
        x: centre.x,
        y: centre.y,
        w: img.getScaledWidth() * vpt[0],
        h: img.getScaledHeight() * vpt[3],
        angle: img.angle || 0,
      }
      setBgOverlay((prev) =>
        prev &&
        Math.abs(prev.x - next.x) < 0.5 &&
        Math.abs(prev.y - next.y) < 0.5 &&
        Math.abs(prev.w - next.w) < 0.5 &&
        Math.abs(prev.h - next.h) < 0.5 &&
        prev.angle === next.angle
          ? prev
          : next
      )
    }
    place()
    c.on('after:render', place)
    return () => {
      c.off('after:render', place)
    }
  }, [bgBusy])

  const showImageToast = useCallback(
    (kind: 'ok' | 'err' | 'info', msg: string) => {
      setToast({ kind, msg })
      setTimeout(
        () => setToast(null),
        kind === 'ok' ? 2600 : kind === 'info' ? 5600 : 4200
      )
    },
    []
  )

  /**
   * Says that pictures would not load — once for each.
   *
   * Called after everything that rebuilds objects: opening the design, turning
   * to another side, restoring a version, undo. Each can meet the same missing
   * picture again, and one that has been mentioned is not mentioned again.
   */
  const reportUnloadedImages = useCallback((objects: fabric.Object[]) => {
    const told = unloadedToldRef.current
    const fresh = unloadedImageSources(objects).filter((src) => !told.has(src))
    if (fresh.length === 0) return
    fresh.forEach((src) => told.add(src))
    setToast({ kind: 'err', msg: unloadedImagesMessage(fresh.length) })
    setTimeout(() => setToast(null), 6000)
  }, [])
  reportUnloadedImagesRef.current = reportUnloadedImages

  /**
   * An upload refused because the user's Ticket-IT session has gone.
   *
   * The library status is refetched, so it stops being offered and the next
   * picture is kept in the design straight away rather than uploaded in full
   * to be refused again. Said once, quietly — the picture is still placed.
   * True when that is what happened, so the caller skips its own error.
   */
  const damSessionToldRef = useRef(false)
  const noteDamSessionLost = useCallback(
    (outcome: DamStoreOutcome): boolean => {
      if (outcome.ok || !damSessionLost(outcome.code)) return false
      if (!damSessionToldRef.current) {
        damSessionToldRef.current = true
        showImageToast('info', DAM_SESSION_ENDED)
      }
      return true
    },
    [damSessionLost, showImageToast]
  )

  /**
   * Moves a fresh cut-out into the image library once it is on the canvas.
   *
   * After the fact, so Remove BG finishes — overlay gone, canvas usable — when
   * it always did, and the upload carries on behind it. The swap happens only
   * if nothing else touched the picture meanwhile: a Restore, another removal,
   * a Replace or an undo all leave it showing something else, and they win.
   * `bgOriginalSrc` is left alone, so Restore still brings the original back.
   *
   * The undo history is rewritten to the new address rather than given a step
   * of its own: the picture looks identical, so that step would be an undo
   * that visibly does nothing — and the history stops holding megabytes.
   */
  const keepCutoutInDam = useCallback(
    async (c: fabric.Canvas, img: FabricAny, dataUrl: string) => {
      if (!canUploadDam) return
      const blob = dataUrlToBlob(dataUrl)
      if (!blob) return
      const stored = await trackDamWork(
        'upload',
        storePictureInDam(
          blob,
          cutoutFileName(img.layerName, (img.bgOriginalSrc as string) || '')
        )
      )
      // The cut-out is already on the canvas; with no session it just stays
      // inside the design, which is no error of the user's.
      if (noteDamSessionLost(stored)) return
      const untouched = () =>
        fabricRef.current === c &&
        isOnCanvas(c, img) &&
        bgTargetRef.current !== img &&
        (img as unknown as fabric.Image).getSrc() === dataUrl
      if (!untouched()) return
      if (!stored.ok) {
        showImageToast(
          'err',
          `The cut-out was kept inside the design instead: ${stored.reason}`
        )
        return
      }
      const element = await loadImageElement(stored.url).catch(() => null)
      if (!element || !untouched()) return

      swapImageElement(img, element)
      applyImageFilters(
        img as unknown as fabric.Image,
        img.imageFilters as ImageFilters | undefined
      )
      const to = (img as unknown as fabric.Image).getSrc()
      // An undo can now bring this cut-out back under its library address.
      const original = cutoutOriginalsRef.current.get(pictureSourceKey(dataUrl))
      if (original) {
        rememberCutoutOriginal(cutoutOriginalsRef.current, to, original)
      }
      // Only this picture's own snapshots. A duplicate or a paste made while
      // the upload ran carries the same data URL under an id of its own, and
      // it still shows that data URL — rewriting it would have undo put back
      // an address the object never had. Snapshots are keyed by the top-level
      // object, so a picture inside a group is found by its group's id.
      let owner: FabricAny = img
      while (owner.group && owner.group.type !== 'activeSelection') {
        owner = owner.group as FabricAny
      }
      const ownerId = (owner.layerId || owner.designId) as string | undefined
      const rewrite = (s: ObjectSnapshot | null) => {
        if (!s || !ownerId || s.id !== ownerId) return s
        const data = withImageSource(s.data, dataUrl, to)
        return data === s.data ? s : { ...s, data }
      }
      if (ownerId) {
        const history = historyStateRef.current
        historyStateRef.current = {
          ...history,
          entries: history.entries.map((entry) =>
            entry.objects.some((d) => d.id === ownerId)
              ? {
                  ...entry,
                  objects: entry.objects.map((d) =>
                    d.id === ownerId
                      ? {
                          ...d,
                          before: rewrite(d.before),
                          after: rewrite(d.after),
                        }
                      : d
                  ),
                }
              : entry
          ),
        }
        baselineRef.current = baselineRef.current.map(
          (s) => rewrite(s) as ObjectSnapshot
        )
      }
      c.requestRenderAll()
      markDirtyRef.current?.()
    },
    [canUploadDam, noteDamSessionLost, showImageToast, trackDamWork]
  )

  /**
   * Removes the picture's background: the subject cut out by the model, or a
   * plain colour — see `bgMode`.
   *
   * Always from the original picture, so trying again works on
   * what was uploaded rather than on the previous attempt. The original is
   * kept on the object for Restore; undo also brings it back, since history
   * records the picture's source.
   */
  const removeImageBackground = useCallback(async () => {
    const c = fabricRef.current
    const img = activeObj
    if (!c || !img || img.type !== 'image' || bgBusy) return
    bgTargetRef.current = img
    setBgBusy(true)
    // Two frames, so the working overlay is on screen before the work — much
    // of which holds the page's thread — begins.
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
    )
    try {
      const original =
        (img.bgOriginalSrc as string | undefined) ||
        (img as unknown as fabric.Image).getSrc()
      const source = img.bgOriginalSrc
        ? await loadImageElement(img.bgOriginalSrc as string)
        : sourceElementOf(img)
      if (!source) throw new Error('This picture has not finished loading.')

      const { dataUrl } =
        bgMode === 'subject'
          ? await removeBackgroundWithModel(source)
          : await removeColourBackground(source, bgTolerance)
      if (fabricRef.current !== c) return
      await swapImageSource(img, dataUrl)
      img.bgOriginalSrc = original
      rememberCutoutOriginal(cutoutOriginalsRef.current, dataUrl, original)
      applyImageFilters(
        img as unknown as fabric.Image,
        img.imageFilters as ImageFilters | undefined
      )
      c.requestRenderAll()
      snapshot()
      bump()
      showImageToast('ok', 'Background removed')
      // Not awaited: the overlay comes off now, whatever the upload does.
      void keepCutoutInDam(c, img, dataUrl)
    } catch (error) {
      showImageToast(
        'err',
        error instanceof Error
          ? error.message
          : 'Could not remove the background'
      )
    } finally {
      bgTargetRef.current = null
      setBgBusy(false)
    }
  }, [
    activeObj,
    bgBusy,
    bgMode,
    bgTolerance,
    snapshot,
    bump,
    showImageToast,
    keepCutoutInDam,
  ])

  const restoreImageBackground = useCallback(async () => {
    const c = fabricRef.current
    const img = activeObj
    if (!c || !img || img.type !== 'image' || !img.bgOriginalSrc || bgBusy)
      return
    setBgBusy(true)
    try {
      await swapImageSource(img, img.bgOriginalSrc as string)
      img.bgOriginalSrc = undefined
      applyImageFilters(
        img as unknown as fabric.Image,
        img.imageFilters as ImageFilters | undefined
      )
      c.requestRenderAll()
      snapshot()
      bump()
    } catch {
      showImageToast('err', 'Could not restore the original picture')
    } finally {
      setBgBusy(false)
    }
  }, [activeObj, bgBusy, snapshot, bump, showImageToast])

  /* ── Layer list operations ────────────────────────────────────── */

  const canvasLayers = useMemo(() => {
    const c = fabricRef.current
    if (!c) return [] as FabricAny[]
    return (c.getObjects() as FabricAny[]).filter((o) => !isChrome(o)).reverse()
    // revision drives recomputation - fabric objects live outside React state
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [revision])

  /**
   * The layers panel's handlers, current as of the last render. Rows get
   * `layerActions`, which never changes identity and calls through to these,
   * so a memoised row is not re-rendered just because a handler was re-made.
   */
  const layerActionsRef = useRef<LayerRowActions | null>(null)
  useEffect(() => {
    layerActionsRef.current = {
      select: (o, additive) => selectLayer(o, additive),
      contextMenu: (e, o) => openContextMenu(e, o),
      canDropOn: (id) => !!dragLayerId && dragLayerId !== id,
      dragStart: (id) => setDragLayerId(id),
      dragEnd: () => {
        setDragLayerId(null)
        setDropHint(null)
      },
      dragOver: (id, place) => {
        if (!dropHint || dropHint.id !== id || dropHint.place !== place) {
          setDropHint({ id, place })
        }
      },
      drop: (id, place) => {
        if (dragLayerId) reorderLayer(dragLayerId, id, place)
        setDragLayerId(null)
        setDropHint(null)
      },
      toggleExpanded: (id) =>
        setExpandedGroups((prev) => ({ ...prev, [id]: !prev[id] })),
      startRename: (id) => setRenamingId(id),
      finishRename: (o, name) => {
        renameLayer(o, name.trim() || 'Layer')
        setRenamingId(null)
      },
      cancelRename: () => setRenamingId(null),
      ungroup: (o) => doUngroup(o),
      pickImage: (o) => openImagePicker(o),
      toggleVisible: (o) => toggleLayerVisible(o),
      toggleLock: (o) => toggleLayerLock(o),
      remove: (o) => removeLayer(o),
      setOpacity: (o, percent) => setLayerOpacity(o, percent),
      openGroup: (o) => openGroupEdit(o),
    }
  })
  const layerActions = useMemo<LayerRowActions>(() => {
    const call =
      <K extends keyof LayerRowActions>(name: K) =>
      (...args: Parameters<LayerRowActions[K]>) =>
        (
          layerActionsRef.current?.[name] as
            ((...a: Parameters<LayerRowActions[K]>) => unknown) | undefined
        )?.(...args)
    return {
      select: call('select'),
      contextMenu: call('contextMenu'),
      canDropOn: (id: string) => !!layerActionsRef.current?.canDropOn(id),
      dragStart: call('dragStart'),
      dragEnd: call('dragEnd'),
      dragOver: call('dragOver'),
      drop: call('drop'),
      toggleExpanded: call('toggleExpanded'),
      startRename: call('startRename'),
      finishRename: call('finishRename'),
      cancelRename: call('cancelRename'),
      ungroup: call('ungroup'),
      pickImage: call('pickImage'),
      toggleVisible: call('toggleVisible'),
      toggleLock: call('toggleLock'),
      remove: call('remove'),
      setOpacity: call('setOpacity'),
      openGroup: call('openGroup'),
    }
  }, [])

  /**
   * Every layer the storefront will be offered, in the order it is saved.
   *
   * Groups are walked, because `serializeLayers` flattens them: a text inside a
   * group is saved as its own layer, so leaving groups out here would hide
   * fields that the customiser then shows. `owner` is the top-level object to
   * select when the row is clicked — fabric cannot make a group's child the
   * active object on its own.
   */
  const personalisableLayers = useMemo(() => {
    const out: { o: FabricAny; owner: FabricAny; depth: number }[] = []
    const walk = (o: FabricAny, owner: FabricAny, depth: number) => {
      if (o.type === 'group') {
        ;(o as unknown as fabric.Group)
          .getObjects()
          .forEach((child) => walk(child as FabricAny, owner, depth + 1))
        return
      }
      out.push({ o, owner, depth })
    }
    canvasLayers.forEach((o) => walk(o, o, 0))
    personalisableLayersRef.current = out
    return out
  }, [canvasLayers])

  /**
   * Select a layer from the panel. Shift/Ctrl/Cmd-click adds or removes it from
   * the selection, building a real fabric ActiveSelection so the canvas handles
   * and the panel stay in step.
   */
  const selectLayer = useCallback((o: FabricAny, additive = false) => {
    const c = fabricRef.current
    if (!c || o.selectable === false) return

    if (!additive) {
      c.discardActiveObject()
      c.setActiveObject(o)
    } else {
      const current = (c.getActiveObjects() as FabricAny[]).filter(
        (x) => !isChrome(x)
      )
      const next = current.includes(o)
        ? current.filter((x) => x !== o)
        : [...current, o]
      c.discardActiveObject()
      if (next.length === 1) {
        c.setActiveObject(next[0])
      } else if (next.length > 1) {
        c.setActiveObject(new fabric.ActiveSelection(next, { canvas: c }))
      }
    }
    c.requestRenderAll()
    setActiveObj((c.getActiveObject() as FabricAny) || null)
    setSelectedIds(
      (c.getActiveObjects() as FabricAny[])
        .filter((x) => !isChrome(x))
        .map((x) => x.layerId)
        .filter(Boolean)
    )
  }, [])

  useEffect(() => {
    selectLayerRef.current = selectLayer
  }, [selectLayer])

  /** Per-layer opacity (point 3). */
  const setLayerOpacity = useCallback(
    (o: FabricAny, pct: number) => {
      o.set('opacity', Math.max(0, Math.min(100, pct)) / 100)
      fabricRef.current?.requestRenderAll()
      snapshotSoon()
      bump()
    },
    [snapshotSoon, bump]
  )

  const toggleLayerVisible = useCallback(
    (o: FabricAny) => {
      o.set('visible', o.visible === false)
      fabricRef.current?.requestRenderAll()
      snapshot()
      bump()
    },
    [snapshot, bump]
  )

  const toggleLayerLock = useCallback(
    (o: FabricAny) => {
      const locked = o.selectable === false
      o.set({ selectable: locked, evented: locked })
      if (!locked && fabricRef.current?.getActiveObject() === o) {
        fabricRef.current.discardActiveObject()
        setActiveObj(null)
      }
      fabricRef.current?.requestRenderAll()
      snapshot()
      bump()
    },
    [snapshot, bump]
  )

  const removeLayer = useCallback((o: FabricAny) => {
    const c = fabricRef.current
    if (!c) return
    if (c.getActiveObject() === o) {
      c.discardActiveObject()
      setActiveObj(null)
    }
    c.remove(o)
    c.requestRenderAll()
  }, [])

  /**
   * The print area must stay behind everything and the bleed/safe guides in front,
   * so any reorder is followed by pinning that chrome back into place.
   */
  const normalizeStack = useCallback((c: fabric.Canvas) => {
    const pa = printAreaRef.current
    if (pa) c.sendToBack(pa)
    const objects = c.getObjects() as FabricAny[]
    // The dim goes above the artwork it washes out; the guides go above the
    // dim, or a bleed line crossing the pasteboard would fade along with it.
    objects.filter((o) => o.isPasteboardMask).forEach((m) => c.bringToFront(m))
    objects.filter((o) => o.isGuide).forEach((g) => c.bringToFront(g))
    // Below everything, the sheet included: it stands for what is *behind* a
    // transparent background, and anything it covers is artwork nobody can see.
    objects
      .filter((o) => o.isCheckerboard)
      .forEach((board) => c.sendToBack(board))
    // The garment sits under the sheet too, for the same reason.
    objects.filter((o) => o.isMockup).forEach((m) => c.sendToBack(m))
  }, [])

  useEffect(() => {
    normalizeStackRef.current = normalizeStack
  }, [normalizeStack])

  type ArrangeMode = 'front' | 'forward' | 'backward' | 'back'

  const arrangeLayer = useCallback(
    (o: FabricAny, mode: ArrangeMode) => {
      const c = fabricRef.current
      if (!c || isChrome(o)) return
      switch (mode) {
        case 'front':
          c.bringToFront(o)
          break
        case 'forward':
          c.bringForward(o)
          break
        case 'backward':
          c.sendBackwards(o)
          break
        case 'back':
          c.sendToBack(o)
          break
      }
      normalizeStack(c)
      c.requestRenderAll()
      snapshot()
      bump()
    },
    [normalizeStack, snapshot, bump]
  )

  const arrangeSelected = useCallback(
    (mode: ArrangeMode) => {
      const o = fabricRef.current?.getActiveObject() as FabricAny | undefined
      if (o) arrangeLayer(o, mode)
    },
    [arrangeLayer]
  )

  /**
   * Drop-to-reorder. `list` is top-first (as the panel shows it); it is applied to
   * the canvas bottom-first, since fabric index 0 is the backmost object.
   */
  const applyLayerOrder = useCallback(
    (topFirst: FabricAny[]) => {
      const c = fabricRef.current
      if (!c) return
      const pa = printAreaRef.current
      if (pa) c.sendToBack(pa)
      const base = pa ? 1 : 0
      ;[...topFirst].reverse().forEach((o, i) => c.moveTo(o, base + i))
      normalizeStack(c)
      c.requestRenderAll()
      snapshot()
      bump()
    },
    [normalizeStack, snapshot, bump]
  )

  const reorderLayer = useCallback(
    (draggedId: string, targetId: string, place: 'above' | 'below') => {
      if (draggedId === targetId) return
      const list = [...canvasLayers]
      const from = list.findIndex((o) => o.layerId === draggedId)
      if (from < 0) return
      const [moved] = list.splice(from, 1)
      const target = list.findIndex((o) => o.layerId === targetId)
      if (target < 0) return
      list.splice(place === 'below' ? target + 1 : target, 0, moved)
      applyLayerOrder(list)
    },
    [canvasLayers, applyLayerOrder]
  )

  const renameLayer = useCallback(
    (o: FabricAny, name: string) => {
      o.layerName = name
      if (!o.layerLabel) o.layerLabel = name
      snapshot()
      bump()
    },
    [snapshot, bump]
  )

  /* ── Grouping (point 4) ───────────────────────────────────────── */

  /** Give a fabric object the identity fields the layer panel reads. */
  const tagLayer = useCallback((o: FabricAny, type: string, name: string) => {
    if (!o.layerId)
      o.layerId = `layer-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
    o.customType = type
    if (!o.layerName) o.layerName = name
    if (!o.layerLabel) o.layerLabel = o.layerName
    if (o.isEditableBySiteUser === undefined) o.isEditableBySiteUser = false
    return o
  }, [])

  const doGroup = useCallback(() => {
    runAtomic('group', () => {
      const c = fabricRef.current
      if (!c) return
      const group = groupSelection(c)
      if (!group) {
        setToast({ kind: 'err', msg: 'Select two or more layers to group' })
        setTimeout(() => setToast(null), 2400)
        return
      }
      tagLayer(group, 'group', 'Group')
      normalizeStack(c)
      c.requestRenderAll()
      setActiveObj(group)
      bump()
    })
  }, [runAtomic, tagLayer, normalizeStack, bump])

  const doUngroup = useCallback(
    (target?: FabricAny) => {
      runAtomic('ungroup', () => {
        const c = fabricRef.current
        if (!c) return
        // Allow ungrouping straight from the layers panel, not just the canvas
        // selection, which can be stale or cleared.
        const group =
          target && target.type === 'group'
            ? target
            : (c.getActiveObject() as FabricAny | undefined)?.type === 'group'
              ? (c.getActiveObject() as FabricAny)
              : null
        if (group) c.setActiveObject(group)
        const children = ungroupSelection(c)
        if (!children.length) {
          setToast({ kind: 'err', msg: 'Select a group to ungroup' })
          setTimeout(() => setToast(null), 2400)
          return
        }
        // Children return as top-level objects with absolute transforms recalculated.
        children.forEach((child) =>
          tagLayer(child, child.customType || 'rect', 'Layer')
        )
        normalizeStack(c)
        c.requestRenderAll()
        setActiveObj(null)
        bump()
      })
    },
    [runAtomic, tagLayer, normalizeStack, bump]
  )

  /** Group edit mode dims everything outside the open group. */
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null)
  const exitGroupEditRef = useRef<(() => void) | null>(null)

  const exitGroupEdit = useCallback(() => {
    exitGroupEditRef.current?.()
    exitGroupEditRef.current = null
    setEditingGroupId(null)
    bump()
  }, [bump])

  const openGroupEdit = useCallback(
    (group: FabricAny) => {
      const c = fabricRef.current
      if (!c || group.type !== 'group') return
      exitGroupEditRef.current?.()
      exitGroupEditRef.current = enterGroupEditMode(
        c,
        group as unknown as fabric.Group
      )
      setEditingGroupId(group.layerId || null)
      bump()
    },
    [bump]
  )

  /* ── Masking / clipping (point 5) ─────────────────────────────── */

  const doCreateMask = useCallback(() => {
    runAtomic('mask', () => {
      const c = fabricRef.current
      if (!c) return
      const group = createMask(c)
      if (!group) {
        setToast({
          kind: 'err',
          msg: 'Select exactly two layers — the top one becomes the mask',
        })
        setTimeout(() => setToast(null), 3200)
        return
      }
      tagLayer(group, 'group', 'Mask')
      group.layerName = 'Mask'
      setExpandedGroups((prev) => ({ ...prev, [group.layerId]: true }))
      normalizeStack(c)
      c.requestRenderAll()
      setActiveObj(group)
      bump()
      setToast({
        kind: 'ok',
        msg: 'Masked — drag to move both together, double-click to reposition inside',
      })
      setTimeout(() => setToast(null), 3600)
    })
  }, [runAtomic, tagLayer, normalizeStack, bump])

  const doReleaseMask = useCallback(() => {
    runAtomic('unmask', () => {
      const c = fabricRef.current
      const o = c?.getActiveObject() as FabricAny | undefined
      if (!c || !o || !hasMask(o)) return
      const restored = releaseMask(c, o)
      if (restored) tagLayer(restored, 'rect', 'Mask shape')
      normalizeStack(c)
      c.requestRenderAll()
      bump()
    })
  }, [runAtomic, tagLayer, normalizeStack, bump])

  /**
   * "Edit content inside the mask": the clip is absolutely positioned, so simply
   * selecting the masked object lets it slide underneath a stationary mask.
   */
  const [maskContentId, setMaskContentId] = useState<string | null>(null)

  const enterMaskContentEdit = useCallback((o: FabricAny) => {
    if (!hasMask(o)) return
    setMaskContentId(o.layerId || null)
    fabricRef.current?.setActiveObject(o)
    fabricRef.current?.requestRenderAll()
    setActiveObj(o)
    setToast({
      kind: 'ok',
      msg: 'Move or resize the content — the mask stays put',
    })
    setTimeout(() => setToast(null), 2800)
  }, [])

  useEffect(() => {
    openGroupEditRef.current = openGroupEdit
    enterMaskContentRef.current = enterMaskContentEdit
    openImagePickerRef.current = openImagePicker
  }, [openGroupEdit, enterMaskContentEdit, openImagePicker])

  /* ── Image upload ─────────────────────────────────────────────── */

  /**
   * Puts a picture on the canvas: into an existing image's box, into a
   * placeholder, or as a new image in the middle of the view.
   *
   * Shared by an upload, a pick from the image library and the fallback to an
   * embedded copy, so all three place a picture the same way. `src` is a data
   * URL or a library URL. Fabric loads a URL with CORS and records that on the
   * object, so undo, copy and paste reload it the same way and the canvas
   * stays exportable; a data URL ignores the setting.
   *
   * Often called seconds after the request, once an upload finishes, so the
   * target is looked up again: undo re-creates objects, so the same layer can
   * be a new instance by now, and a deleted one has nothing left to fill.
   * Returns false when nothing was placed for that reason.
   */
  const placeImageSource = useCallback(
    (
      c: fabric.Canvas,
      src: string,
      requested: FabricAny | null,
      /** The side on screen when the picture was asked for. */
      side: string | null
    ): boolean => {
      if (!src || fabricRef.current !== c) return false
      // Every side is drawn on this one canvas, so `fabricRef.current === c`
      // still holds after a switch, and a picture asked for on the front
      // landed on whichever back was open by the time its upload finished.
      // Checked now and again once the picture has loaded. Placing it on the
      // side it was meant for is not clean — that side is a stashed document
      // whose tile and field list were taken when it was put away — so it is
      // not placed, and the user is told.
      const onSide = () =>
        fabricRef.current === c &&
        !switchingSideRef.current &&
        activeBackIdRef.current === side
      const sideChanged = () => {
        showImageToast(
          'err',
          `You switched sides while that picture was loading, so it was not placed. Switch back and add it again${src.startsWith('data:') ? '' : ' from the image library'}.`
        )
        return false
      }
      if (!onSide()) return sideChanged()
      const target: FabricAny | null =
        !requested || isOnCanvas(c, requested)
          ? requested
          : (c.getObjects() as FabricAny[]).find(
              (o) =>
                !!requested.layerId &&
                o.layerId === requested.layerId &&
                !isChrome(o)
            ) || null
      if (requested && !target) {
        showImageToast(
          'err',
          'The space for that picture was removed before it was ready'
        )
        return false
      }
      const unreadable = () =>
        showImageToast(
          'err',
          src.startsWith('data:')
            ? 'That picture could not be read'
            : 'That picture could not be loaded from the image library'
        )
      const removed = () =>
        showImageToast(
          'err',
          'The space for that picture was removed before it was ready'
        )

      const finish = (o: FabricAny) => {
        c.setActiveObject(o)
        c.requestRenderAll()
        setActiveObj(o)
        snapshot()
        bump()
      }

      // 1. An existing bitmap: the new picture takes its place and its box.
      if (target && target.type === 'image') {
        // Measured before the swap. Fabric resets the size to the new
        // bitmap's but keeps the old picture's crop offsets, so a replaced
        // picture that had been cropped or filled came back shifted, or
        // partly blank, and somewhere else.
        const centre = target.getCenterPoint()
        if (!target.imageFrame) adoptCurrentBoxAsFrame(target)
        // Loaded before the picture is touched. Fabric's `setSrc` empties it
        // first and reports the failure afterwards, so a Replace from an
        // address that did not answer left a blank where the picture was.
        void loadImageElementOrNull(src).then((element) => {
          if (fabricRef.current !== c) return
          if (!onSide()) return void sideChanged()
          if (!element) return unreadable()
          if (!isOnCanvas(c, target)) return removed()
          ;(target as unknown as fabric.Image).setElement(element)
          // A new picture has no background of its own to restore.
          target.bgOriginalSrc = undefined
          target.set({ cropX: 0, cropY: 0 })
          // Fit when Fit was chosen; otherwise the new picture fills the
          // box the old one occupied, whatever its shape.
          if (target.imageFit === 'fit') fitFrame(target)
          else fillFrame(target)
          target.setPositionByOrigin(centre, 'center', 'center')
          target.setCoords()
          finish(target)
        })
        return true
      }

      // 2. A placeholder dropped from the palette: become a real image in the
      //    same box, inheriting the placeholder's identity and bindings.
      if (target) {
        const box = {
          left: target.left || 0,
          top: target.top || 0,
          width: target.getScaledWidth(),
          height: target.getScaledHeight(),
          angle: target.angle || 0,
        }
        void loadFabricImage(src).then((img) => {
          if (fabricRef.current !== c) return
          if (!onSide()) return void sideChanged()
          if (!img) return unreadable()
          if (!isOnCanvas(c, target)) return removed()
          const o = img as FabricAny
          o.set({
            left: box.left,
            top: box.top,
            angle: box.angle,
            originX: 'left',
            originY: 'top',
          })
          if (box.width > 0 && box.height > 0) {
            // The reserved space is the picture's frame: it covers the box
            // the designer drew, cropped from the middle, and Fit is one
            // click away on the image toolbar. It used to be scaled to the
            // box's width only, spilling above or below a portrait slot.
            o.imageFrame = { width: box.width, height: box.height }
            fillFrame(o)
            o.set({ left: box.left, top: box.top })
            o.setCoords()
          } else if (box.width > 0) {
            o.scaleToWidth(box.width)
          }
          o.layerId = target.layerId
          o.layerName = target.layerName || 'Image'
          o.layerLabel = target.layerLabel
          o.customType = target.customType === 'logo' ? 'logo' : 'image'
          o.isEditableBySiteUser = !!target.isEditableBySiteUser
          o.fieldKey = target.fieldKey
          o.helperText = target.helperText
          o.isRequired = !!target.isRequired
          if (target.clipPath) o.clipPath = target.clipPath
          const index = c.getObjects().indexOf(target)
          c.remove(target)
          c.add(o)
          if (index >= 0) c.moveTo(o, index)
          finish(o)
        })
        return true
      }

      // 3. No target: drop a new image at the centre of the view.
      void loadFabricImage(src).then((img) => {
        if (fabricRef.current !== c) return
        if (!onSide()) return void sideChanged()
        if (!img) return unreadable()
        const o = img as FabricAny
        const pa = printAreaRef.current
        const maxW = (pa?.width || 400) * 0.4
        if (o.getScaledWidth() > maxW) o.scaleToWidth(maxW)
        const centre = viewportCentre()
        placeCentered(o, centre.x, centre.y)
        settleOnSheet(o)
        tagNew(o, 'image')
        c.add(o)
        finish(o)
      })
      return true
    },
    [
      bump,
      placeCentered,
      settleOnSheet,
      showImageToast,
      snapshot,
      tagNew,
      viewportCentre,
    ]
  )

  /**
   * The file picker's choice.
   *
   * When this user may upload to the image library, the picture goes there
   * first and the design keeps its URL. If the library refuses it, or its host
   * will not let the canvas read it back, the picture is embedded as it always
   * was and the user is told why. Without the library — no Ticket-IT session,
   * or a role that cannot upload — it is embedded straight away, as before.
   */
  const handleImageFile = useCallback(
    async (file: File) => {
      const c = fabricRef.current
      if (!c) return
      const target = uploadTargetRef.current
      uploadTargetRef.current = null
      // Recorded now, before the upload: see `placeImageSource`.
      const side = activeBackIdRef.current
      const isLatest = claimPlacement(target)
      const embed = async () => {
        const src = await readFileAsDataUrl(file).catch(() => '')
        if (!src || fabricRef.current !== c || !isLatest()) return false
        return placeImageSource(c, src, target, side)
      }

      if (!canUploadDam) {
        await embed()
        return
      }
      const stored = await trackDamWork(
        'upload',
        storePictureInDam(file, file.name)
      )
      const quiet = noteDamSessionLost(stored)
      if (fabricRef.current !== c || !isLatest()) return
      if (stored.ok) {
        placeImageSource(c, stored.url, target, side)
        return
      }
      if ((await embed()) && !quiet) {
        showImageToast(
          'err',
          `The picture was kept inside the design instead: ${stored.reason}`
        )
      }
    },
    [
      canUploadDam,
      claimPlacement,
      noteDamSessionLost,
      placeImageSource,
      showImageToast,
      trackDamWork,
    ]
  )

  /* ── QR / barcode payload refresh ─────────────────────────────── */

  const updateScanPayload = useCallback(
    (o: FabricAny, value: string) => {
      o.scanUrl = value
      const safe = value.trim()

      // A new payload encodes to a different natural bitmap width; hold the
      // on-canvas size steady so the layer does not jump around while typing.
      const displayWidth = o.getScaledWidth()
      const done = () => {
        o.scaleToWidth(displayWidth)
        o.setCoords()
        fabricRef.current?.requestRenderAll()
        snapshotSoon()
        bump()
      }
      if (!safe) return bump()

      if (o.customType === 'qrcode') {
        qrDataUrl(safe).then((url) => {
          if (!url || o.type !== 'image') return bump()
          ;(o as unknown as fabric.Image).setSrc(url, done)
        })
      } else if (o.customType === 'barcode') {
        try {
          const url = barcodeDataUrl(safe)
          if (o.type !== 'image') return bump()
          ;(o as unknown as fabric.Image).setSrc(url, done)
        } catch {
          // jsbarcode rejects some strings mid-typing - keep the old bitmap
          bump()
        }
      } else {
        bump()
      }
    },
    [bump, snapshotSoon]
  )

  /* ── The thing being printed on ────────────────────────────────
     A flyer is the sheet. A cap is not: the artboard is the panel above the
     peak, and drawing into a 9 x 3.5cm rectangle with nothing around it is
     working blind. So the garment goes behind the artboard, positioned so its
     printable panel lands exactly on it.

     Chrome, not artwork: it is never selected, never serialised as an object,
     never exported and never printed. */

  const [mockup, setMockup] = useState<DesignDocument['mockup']>(undefined)
  const mockupRef = useRef<DesignDocument['mockup']>(undefined)
  mockupRef.current = mockup
  const mockupFileRef = useRef<HTMLInputElement>(null)

  /**
   * The garment photographed from every angle, if it was.
   *
   * Viewing only, and separate from the `src`/`area` the design is edited
   * against: the printable panel moves as the garment turns, and on some
   * angles faces away entirely — which is why a frame carries its own `area`
   * and may carry none at all. Absent on every design nobody has photographed
   * this way, which is all of them until someone shoots one.
   */
  const spinFrames = mockup?.frames ?? []

  const rebuildMockup = useCallback((c: fabric.Canvas, pa: fabric.Rect) => {
    ;(c.getObjects() as FabricAny[])
      .filter((o) => o.isMockup)
      .forEach((o) => c.remove(o))

    const spec = mockupRef.current
    if (!spec?.src) return

    void loadFabricImage(spec.src).then((img) => {
      // A photo that will not load leaves the artboard as it is without one,
      // rather than behind an empty image object.
      if (!img || fabricRef.current !== c) return
      const f = img as FabricAny
      const area = spec.area
      const paW = pa.width || 1
      const paH = pa.height || 1
      // Sized so the panel on the photograph covers the artboard exactly.
      const w = paW / Math.max(area.width, 0.01)
      const h = paH / Math.max(area.height, 0.01)
      f.set({
        left: (pa.left || 0) - area.x * w,
        top: (pa.top || 0) - area.y * h,
        originX: 'left',
        originY: 'top',
        scaleX: w / (f.width || 1),
        scaleY: h / (f.height || 1),
        selectable: false,
        evented: false,
        hoverCursor: 'default',
        excludeFromExport: true,
      })
      f.isMockup = true
      c.add(f)
      c.sendToBack(f)
      c.requestRenderAll()
    })
  }, [])

  /**
   * The garment's own colour shows through, so the artboard stops being white.
   *
   * A white rectangle over an olive cap is not a preview of anything. With a
   * mockup the artboard becomes an outline, and the pasteboard dim comes off
   * too: the whole point is to see the cap.
   */
  const applyMockupChrome = useCallback(
    (c: fabric.Canvas, pa: fabric.Rect) => {
      const on = !!mockupRef.current?.src
      pa.set({
        fill: on
          ? 'transparent'
          : bgTransparent
            ? 'transparent'
            : templateRef.current.canvasConfig.backgroundColor || '#ffffff',
      })
      if (on) {
        ;(c.getObjects() as FabricAny[])
          .filter((o) => o.isPasteboardMask)
          .forEach((o) => c.remove(o))
      }
      c.requestRenderAll()
    },
    [bgTransparent]
  )

  /**
   * The latest mockup photo asked for. An upload that finishes after a newer
   * one — or after the mockup was removed — is dropped.
   */
  const mockupSeqRef = useRef(0)

  /** Put a photograph — embedded, or a library URL — behind the artboard. */
  const applyMockupSource = useCallback((src: string, seq: number) => {
    // Loaded with CORS when it is a URL, as `rebuildMockup` will load it, so
    // the browser's cached copy is one the canvas may read.
    loadImageElement(src)
      .then((probe) => {
        if (seq !== mockupSeqRef.current) return
        const pa = printAreaRef.current
        const paW = pa?.width || 1
        const paH = pa?.height || 1
        // Opens at half the image's width, with a height that gives the panel
        // the artboard's own proportions — so nothing is stretched before the
        // designer has touched it.
        const width = 0.5
        const height = Math.min(
          0.9,
          ((paH / paW) * width * probe.naturalWidth) /
            (probe.naturalHeight || 1)
        )
        setMockup({
          src,
          area: { x: 0.25, y: Math.max(0, 0.5 - height / 2), width, height },
        })
        markDirtyRef.current?.()
      })
      .catch(() => {
        // An unreadable photo did nothing before either.
      })
  }, [])

  /** Put a photograph of the garment behind the artboard. */
  const handleMockupFile = useCallback(
    async (file: File) => {
      const seq = ++mockupSeqRef.current
      const embed = async () => {
        const src = await readFileAsDataUrl(file).catch(() => '')
        if (!src || seq !== mockupSeqRef.current) return false
        applyMockupSource(src, seq)
        return true
      }
      // Same order as a picture on the artwork: the library first when this
      // user may upload there, embedded when not or when that fails.
      if (!canUploadDam) {
        await embed()
        return
      }
      const stored = await trackDamWork(
        'upload',
        storePictureInDam(file, file.name)
      )
      const quiet = noteDamSessionLost(stored)
      if (seq !== mockupSeqRef.current) return
      if (stored.ok) {
        applyMockupSource(stored.url, seq)
        return
      }
      if ((await embed()) && !quiet) {
        showImageToast(
          'err',
          `The photo was kept inside the design instead: ${stored.reason}`
        )
      }
    },
    [
      applyMockupSource,
      canUploadDam,
      noteDamSessionLost,
      showImageToast,
      trackDamWork,
    ]
  )

  /**
   * A picture chosen in the image library, placed wherever the library was
   * opened for.
   *
   * Never embedded as a fallback: a picture the canvas cannot read is one the
   * browser will not hand over the bytes of either. The user is told why.
   */
  const handleLibraryPick = useCallback(
    async (picked: DamPickedImage) => {
      const request = libraryRequestRef.current
      // Slow is not blocked: a picture the library was only slow to send may
      // work a moment later, and saying the host forbids it has people give up.
      const refused = (check: 'blocked' | 'timeout') =>
        check === 'timeout'
          ? `That picture can't be used right now: ${DAM_PICTURE_SLOW}. Try again in a moment.`
          : `That picture can't be used here: ${DAM_HOST_BLOCKED}`

      if (request === 'mockup') {
        const seq = ++mockupSeqRef.current
        const check = await trackDamWork('load', checkCanvasUrl(picked.url))
        if (seq !== mockupSeqRef.current) return
        if (check !== 'ok') {
          showImageToast('err', refused(check))
          return
        }
        applyMockupSource(picked.url, seq)
        return
      }

      const c = fabricRef.current
      if (!c) return
      // Recorded now, before the check: see `placeImageSource`.
      const side = activeBackIdRef.current
      const isLatest = claimPlacement(request)
      const check = await trackDamWork('load', checkCanvasUrl(picked.url))
      if (fabricRef.current !== c || !isLatest()) return
      if (check !== 'ok') {
        showImageToast('err', refused(check))
        return
      }
      placeImageSource(c, picked.url, request, side)
    },
    [
      applyMockupSource,
      claimPlacement,
      placeImageSource,
      showImageToast,
      trackDamWork,
    ]
  )

  /** Nudge where the panel sits on the photograph. Fractions, clamped. */
  const setMockupArea = useCallback(
    (
      patch: Partial<{ x: number; y: number; width: number; height: number }>
    ) => {
      setMockup((prev) => {
        if (!prev) return prev
        const next = { ...prev.area, ...patch }
        return {
          ...prev,
          area: {
            x: Math.min(0.99, Math.max(0, next.x)),
            y: Math.min(0.99, Math.max(0, next.y)),
            width: Math.min(1, Math.max(0.02, next.width)),
            height: Math.min(1, Math.max(0.02, next.height)),
          },
        }
      })
      markDirtyRef.current?.()
    },
    []
  )

  /* Redrawn whenever the photograph, its placement or the artboard changes. */
  useEffect(() => {
    const c = fabricRef.current
    const pa = printAreaRef.current
    if (!c || !pa) return
    applyMockupChrome(c, pa)
    rebuildMockup(c, pa)
    if (!mockup?.src) rebuildPasteboardMask(c, pa)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mockup, dimsKey, applyMockupChrome, rebuildMockup, rebuildPasteboardMask])

  /* ── Sides: the front, and the backs it can be printed with ────
     A business card has one front and often several backs — plain, opening
     hours, a QR to the booking page — and the buyer picks one when they order.

     Only one side is ever on the canvas. The others are held here as documents
     and swapped in, which is what lets every tool, shortcut and panel work on a
     back exactly as it works on the front: there is nothing to teach them,
     because a back *is* a design. */

  /** The backs, in the order the designer arranged them. */
  const [backs, setBacks] = useState<DesignSide[]>([])
  /** `null` while the front is on the canvas. */
  const [activeBackId, setActiveBackId] = useState<string | null>(null)
  const [renamingBackId, setRenamingBackId] = useState<string | null>(null)
  /**
   * The back a buyer gets unless they pick another, and the one the preview
   * shows.
   *
   * Chosen by the designer rather than taken from the order the backs happen to
   * sit in, which is what this used to do — a designer who drew the plain
   * reverse first and the good one second had no way to say which was the good
   * one. Null falls back to the first, so a design with one back needs no
   * decision and every design drawn before this still behaves.
   */
  const [defaultBackId, setDefaultBackId] = useState<string | null>(null)
  const defaultBackIdRef = useRef<string | null>(null)
  defaultBackIdRef.current = defaultBackId

  /**
   * Whether this back is the chosen one, resolving the fallback the same way
   * `serializeDocument` and `proofSides` do — an unset choice, or one pointing
   * at a back since deleted, means the first.
   */
  const isDefaultBack = (id: string) =>
    (backs.find((side) => side.id === defaultBackId)?.id ?? backs[0]?.id) === id
  /**
   * The front, taken off the canvas when a back is opened.
   *
   * Its layer list and its tile are captured at the same moment, while the
   * front is still the thing on screen. Both are derived from live fabric
   * objects, and both describe the design everywhere outside this editor -- the
   * storefront's field list comes from `layers`, and the tile stands for the
   * whole template. Recomputing them from whatever is on the canvas at save
   * time would file a back's text as the design's editable fields and put a
   * picture of the reverse on every gallery card.
   */
  const stashedFrontRef = useRef<{
    objects: DesignObject[]
    layers: TemplateLayer[]
    thumbnail: string
  } | null>(null)
  const backsRef = useRef<DesignSide[]>([])
  backsRef.current = backs
  const activeBackIdRef = useRef<string | null>(null)
  activeBackIdRef.current = activeBackId
  /** Guards the reload the switch performs against being read as an edit. */
  const switchingSideRef = useRef(false)
  /**
   * Both are defined further down, and the switch above needs them while the
   * front is still on the canvas. Refs rather than a reordering: `serializeLayers`
   * and `exportThumbnail` are declared beside the save that is their main
   * caller, and moving them here would put them a long way from it.
   */
  const serializeLayersRef = useRef<(() => TemplateLayer[]) | null>(null)
  const exportThumbnailRef = useRef<(() => string) | null>(null)
  const switchToSideRef = useRef<
    ((backId: string | null) => Promise<void>) | null
  >(null)
  const createBackRef = useRef<
    ((kind: NewBackKind, name?: string) => string) | null
  >(null)

  /** Content objects only — the print area, guides and dim stay put. */
  const clearContent = useCallback((c: fabric.Canvas) => {
    ;(c.getObjects() as FabricAny[])
      .filter((o) => !isChrome(o))
      .forEach((o) => c.remove(o))
    c.discardActiveObject()
  }, [])

  /**
   * Move to another side, taking the current one off the canvas first.
   *
   * The read is from the canvas rather than from state, because the canvas is
   * where the last half-second of dragging lives. History is re-baselined on
   * arrival: an undo that reached back across a switch would be undoing an edit
   * the person can no longer see.
   */
  const switchToSide = useCallback(
    async (nextBackId: string | null) => {
      const c = fabricRef.current
      if (!c || switchingSideRef.current) return
      const currentId = activeBackIdRef.current
      if (currentId === nextBackId) return

      switchingSideRef.current = true
      lockRef.current = true
      try {
        const current = canvasToObjects(c)
        if (currentId === null) {
          stashedFrontRef.current = {
            objects: current,
            layers: serializeLayersRef.current?.() ?? [],
            thumbnail: exportThumbnailRef.current?.() ?? '',
          }
        } else {
          setBacks((prev) =>
            prev.map((side) =>
              side.id === currentId ? { ...side, objects: current } : side
            )
          )
          backsRef.current = backsRef.current.map((side) =>
            side.id === currentId ? { ...side, objects: current } : side
          )
        }

        clearContent(c)

        const incoming =
          nextBackId === null
            ? (stashedFrontRef.current?.objects ?? [])
            : (backsRef.current.find((side) => side.id === nextBackId)
                ?.objects ?? [])

        const built = await objectsToCanvas(
          c,
          incoming,
          renderCodeBitmap,
          DESIGN_SCHEMA_VERSION
        )
        normalizeStackRef.current?.(c)
        c.requestRenderAll()
        setActiveBackId(nextBackId)
        activeBackIdRef.current = nextBackId
        setActiveObj(null)
        setSelectedIds([])
        reportUnloadedImagesRef.current?.(built)
      } finally {
        lockRef.current = false
        switchingSideRef.current = false
        resetHistoryRef.current?.()
        bump()
      }
    },
    [clearContent, bump]
  )

  switchToSideRef.current = switchToSide

  /**
   * Scale everything on this side to sit inside the safe area, centred.
   *
   * For a design drawn at one size and now on a sheet of another -- the state a
   * template gets into when its product changes under it. Uniform, so nothing
   * is stretched, and the artwork moves as one piece so the layout survives.
   */
  const fitArtworkToSheet = useCallback(() => {
    const c = fabricRef.current
    const pa = printAreaRef.current
    if (!c || !pa) return
    const content = (c.getObjects() as FabricAny[]).filter((o) => !isChrome(o))
    if (content.length === 0) return

    runAtomicRef.current?.('resize', () => {
      const factor = UNIT_TO_PX[templateRef.current.dimensions.unit] ?? 96
      const inset = (templateRef.current.safeMargin || 0) * factor
      const areaL = (pa.left || 0) + inset
      const areaT = (pa.top || 0) + inset
      const areaW = Math.max(1, (pa.width || 0) - inset * 2)
      const areaH = Math.max(1, (pa.height || 0) - inset * 2)

      // The block the artwork occupies, taken from the objects themselves
      // rather than from the sheet they happened to be drawn on.
      const boxes = content.map((o) => o.getBoundingRect(true, true))
      const minX = Math.min(...boxes.map((b) => b.left))
      const minY = Math.min(...boxes.map((b) => b.top))
      const maxX = Math.max(...boxes.map((b) => b.left + b.width))
      const maxY = Math.max(...boxes.map((b) => b.top + b.height))
      const w = Math.max(1, maxX - minX)
      const h = Math.max(1, maxY - minY)

      const k = Math.min(areaW / w, areaH / h)
      const offsetX = areaL + (areaW - w * k) / 2
      const offsetY = areaT + (areaH - h * k) / 2

      content.forEach((o) => {
        o.set({
          left: offsetX + ((o.left ?? 0) - minX) * k,
          top: offsetY + ((o.top ?? 0) - minY) * k,
          scaleX: (o.scaleX ?? 1) * k,
          scaleY: (o.scaleY ?? 1) * k,
        })
        o.setCoords()
      })
    })
    c.requestRenderAll()
    setToast({ kind: 'ok', msg: 'Artwork fitted to the safe area' })
    setTimeout(() => setToast(null), 2600)
  }, [])

  /**
   * A new back, opened for editing.
   *
   * The three ways anyone actually starts one: from nothing, from the front
   * they have already drawn, or from a picture they were sent. A blank back is
   * the default because a back is rarely the front again.
   */
  const createBack = useCallback(
    (
      kind:
        | 'blank'
        | 'front'
        | { image: string; naturalWidth: number; naturalHeight: number },
      name?: string
    ) => {
      const c = fabricRef.current
      const pa = printAreaRef.current
      let objects: DesignObject[] = []

      if (kind === 'front') {
        objects =
          activeBackIdRef.current === null && c
            ? canvasToObjects(c)
            : (stashedFrontRef.current?.objects ?? [])
        objects = objects.map((o) => ({ ...o, id: newId('obj') }))
      } else if (typeof kind === 'object') {
        const areaW = pa?.width ?? 1
        const areaH = pa?.height ?? 1
        // Contained, not stretched: a logo squeezed to the shape of a card is
        // not the logo any more.
        const scale = Math.min(
          areaW / (kind.naturalWidth || areaW),
          areaH / (kind.naturalHeight || areaH)
        )
        const width = (kind.naturalWidth || areaW) * scale
        const height = (kind.naturalHeight || areaH) * scale
        objects = [
          {
            id: newId('img'),
            type: 'image',
            name: 'Uploaded back',
            x: (areaW - width) / 2,
            y: (areaH - height) / 2,
            width,
            height,
            rotation: 0,
            opacity: 1,
            blendMode: 'normal',
            zIndex: 1,
            locked: false,
            visible: true,
            src: kind.image,
          } as DesignObject,
        ]
      }

      const side: DesignSide = {
        id: newId('side'),
        name: name || `Back ${backsRef.current.length + 1}`,
        objects,
      }
      setBacks((prev) => [...prev, side])
      backsRef.current = [...backsRef.current, side]
      markDirtyRef.current?.()
      void switchToSide(side.id)
      return side.id
    },
    [switchToSide]
  )

  createBackRef.current = createBack

  const addBack = useCallback(() => createBack('blank'), [createBack])

  /** The active back, copied. What "one more like this one" means. */
  const duplicateBack = useCallback(
    (id: string) => {
      const c = fabricRef.current
      const source = backsRef.current.find((side) => side.id === id)
      if (!source) return
      const objects =
        id === activeBackIdRef.current && c
          ? canvasToObjects(c)
          : source.objects
      const copy: DesignSide = {
        id: newId('side'),
        name: `${source.name} copy`,
        objects: objects.map((o) => ({ ...o })),
      }
      setBacks((prev) => [...prev, copy])
      backsRef.current = [...backsRef.current, copy]
      markDirtyRef.current?.()
      void switchToSide(copy.id)
    },
    [switchToSide]
  )

  const removeBack = useCallback(
    (id: string) => {
      const remaining = backsRef.current.filter((side) => side.id !== id)
      setBacks(remaining)
      backsRef.current = remaining
      markDirtyRef.current?.()
      if (activeBackIdRef.current === id) void switchToSide(null)
    },
    [switchToSide]
  )

  const renameBack = useCallback((id: string, name: string) => {
    setBacks((prev) =>
      prev.map((side) => (side.id === id ? { ...side, name } : side))
    )
    backsRef.current = backsRef.current.map((side) =>
      side.id === id ? { ...side, name } : side
    )
    markDirtyRef.current?.()
  }, [])

  /**
   * Every side, with the one on screen read from the canvas.
   *
   * Used by the serializer and by anything that needs the whole design rather
   * than the side being worked on.
   */
  const collectSides = useCallback((): {
    front: DesignObject[]
    backs: DesignSide[]
  } => {
    const c = fabricRef.current
    const live = c ? canvasToObjects(c) : []
    const currentId = activeBackIdRef.current

    return {
      front:
        currentId === null ? live : (stashedFrontRef.current?.objects ?? []),
      backs: backsRef.current.map((side) =>
        side.id === currentId ? { ...side, objects: live } : side
      ),
    }
  }, [])

  /* ── Serialization / export / save ────────────────────────────── */

  /**
   * Flat, storefront-facing layer list. Groups have no equivalent in
   * TemplateLayer, so they are flattened to their children (in absolute canvas
   * space) rather than collapsing to a single meaningless shape. The grouping
   * itself survives in `canvasJson`.
   */
  const serializeLayers = useCallback((): TemplateLayer[] => {
    const c = fabricRef.current
    const pa = printAreaRef.current
    if (!c || !pa) return []
    const scale =
      previewBaseWidth(templateRef.current.orientation) / (pa.width || 1)

    const out: TemplateLayer[] = []
    // Groups are walked, not mutated: fabricToLayer resolves each child's true
    // canvas position from its transform matrix, so nested, rotated and scaled
    // groups all flatten correctly and the live canvas is never touched.
    const emit = (o: FabricAny, inherited?: ClipBox | null) => {
      if (o.type === 'group') {
        // A mask group's clip belongs to the group; hand it to the children,
        // since the flat list has no group to hang it on.
        const own = o.clipPath as FabricAny | undefined
        const next = own ? absoluteClipBox(own, o) : inherited
        ;(o as unknown as fabric.Group)
          .getObjects()
          .forEach((child) => emit(child as FabricAny, next))
        return
      }
      out.push(fabricToLayer(o, pa, out.length + 1, scale, inherited))
    }

    ;(c.getObjects() as FabricAny[])
      .filter((o) => !isChrome(o))
      .forEach((o) => emit(o))
    return out
  }, [])

  /**
   * The structured design document - the editor's source of truth. Groups,
   * masks, gradients and filters live here; `layers` is the derived flat view.
   */
  const serializeDocument = useCallback((): DesignDocument => {
    const tpl = templateRef.current
    const now = new Date().toISOString()
    const sides = collectSides()
    return {
      canvasSize: {
        width: tpl.dimensions.width,
        height: tpl.dimensions.height,
        unit: tpl.dimensions.unit,
        dpi: canvasDpi,
      },
      background: bgTransparent
        ? 'transparent'
        : (printAreaRef.current?.fill as string) || '#ffffff',
      // Every side, not the one on screen. `collectSides` reads the canvas for
      // whichever is active and takes the rest from where they were stashed, so
      // saving while a back is open saves the front too.
      objects: sides.front,
      ...(mockupRef.current ? { mockup: mockupRef.current } : {}),
      // The designer's choice, not the drawing order. Falls back to the first
      // back when nothing has been chosen or the chosen one has since been
      // deleted — a dangling id would leave `proofSides` with no back at all.
      ...(sides.backs.length > 0
        ? {
            backs: sides.backs,
            defaultBackId:
              sides.backs.find((side) => side.id === defaultBackIdRef.current)
                ?.id ?? sides.backs[0].id,
          }
        : {}),
      // Ruler guides are deliberately not saved. They are one designer's
      // working scaffolding, not part of the artwork: persisting them pushes
      // them onto everyone who later opens the template, with no way to tell
      // whose they were or why. The grid stays, because it is a setting rather
      // than a set of positions.
      grid: { enabled: showGrid, spacing: gridSpacing, snap: snapGrid },
      meta: {
        createdAt: tpl.createdAt || now,
        updatedAt: now,
        name: tpl.name,
        version: DESIGN_SCHEMA_VERSION,
      },
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bgTransparent, canvasDpi, showGrid, gridSpacing, snapGrid, collectSides])

  /** Legacy fallback for templates saved before the document model. */
  const serializeCanvas = useCallback((): string => {
    const c = fabricRef.current
    if (!c) return ''
    try {
      return JSON.stringify(c.toJSON(CUSTOM_PROPS))
    } catch {
      return ''
    }
  }, [])

  /** PNG of just the print area, guides hidden and viewport neutralised. */
  const exportThumbnail = useCallback((): string => {
    const c = fabricRef.current
    const pa = printAreaRef.current
    if (!c || !pa) return ''
    // The dim hides with the guides: the thumbnail crops to the artboard, but
    // the mask's clipped edge would still soften the crop's outermost pixels.
    const guides = (c.getObjects() as FabricAny[]).filter(
      (o) => o.isGuide || o.isPasteboardMask || o.isCheckerboard
    )
    const wasVisible = guides.map((g) => g.visible)
    guides.forEach((g) => g.set('visible', false))

    const vpt = c.viewportTransform
      ? ([...c.viewportTransform] as number[])
      : null
    c.setViewportTransform([1, 0, 0, 1, 0, 0])

    let url = ''
    try {
      url = c.toDataURL({
        format: 'png',
        left: pa.left || 0,
        top: pa.top || 0,
        width: pa.width || 0,
        height: pa.height || 0,
        multiplier: Math.min(1, 600 / (pa.width || 600)),
      })
    } catch {
      // tainted canvas from a cross-origin image - fall back to the stored thumbnail
      url = ''
    }

    if (vpt)
      c.setViewportTransform(
        vpt as fabric.Canvas['viewportTransform'] & number[]
      )
    guides.forEach((g, i) => g.set('visible', wasVisible[i]))
    c.requestRenderAll()
    return url
  }, [])

  /* ── Autosave & version history (point 10) ────────────────────── */

  const [versions, setVersions] = useState<TemplateVersion[]>([])
  const [versionsOpen, setVersionsOpen] = useState(false)
  const [autosaveOn, setAutosaveOn] = useState(true)
  const [dirtySince, setDirtySince] = useState<string | null>(null)
  dirtyRef.current = dirtySince
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null)
  const [autosaving, setAutosaving] = useState(false)
  const autosaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const handleSaveRef = useRef<
    ((publish?: boolean, silent?: boolean) => Promise<void>) | null
  >(null)

  useEffect(() => {
    const id = initialTemplate?.id || ''
    // A hosted studio is not editing the template, so its history is neither
    // shown nor asked for: a buyer requesting the operator's version history
    // gets a refusal, and rightly.
    if (!id || isCustomise) {
      setVersions([])
      return
    }

    // The history is a request now rather than a localStorage read. `cancelled`
    // drops a late answer: switching templates quickly would otherwise let the
    // first template's history land in the second template's panel.
    let cancelled = false
    void listVersions(id)
      // A history that will not load is a panel with nothing in it, not a
      // broken editor. The canvas is what this screen is for.
      .catch(() => [])
      .then((rows) => {
        if (!cancelled) setVersions(rows)
      })

    return () => {
      cancelled = true
    }
  }, [initialTemplate?.id, isCustomise])

  /**
   * Report dirtiness on the value, never on the host's function identity.
   *
   * A host that passes an inline arrow — the ordinary way to write one — hands
   * this a new function on every render. With that in the dependency array the
   * effect re-ran each time, called the host's setState, re-rendered the host,
   * and arrived back here with another new arrow: "Maximum update depth
   * exceeded", and a studio too busy re-rendering to accept a keystroke.
   */
  const onDirtyChangeRef = useRef(onDirtyChange)
  onDirtyChangeRef.current = onDirtyChange
  /**
   * A picture still uploading to the image library counts as unsaved: it is
   * not in the design until it lands, and leaving now loses it without trace.
   */
  const uploadingToDam = damBusy.upload > 0
  useEffect(() => {
    onDirtyChangeRef.current?.(dirtySince !== null || uploadingToDam)
  }, [dirtySince, uploadingToDam])

  // The browser's own "Leave site?" prompt, only while an upload is in flight.
  useEffect(() => {
    if (!uploadingToDam) return
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [uploadingToDam])

  /** Marked dirty by every committed edit; drives the autosave countdown. */
  const markDirty = useCallback(() => {
    dirtyGenRef.current += 1
    setDirtySince((prev) => prev || new Date().toISOString())
  }, [])

  /**
   * After a save lands: clean only if nothing was marked since `savedGen` was
   * read as the save began. A picture placed, or a cut-out moved into the
   * library, while the request was out was not in what it sent — clearing
   * dirty then reported unsaved work as saved. It stays dirty instead, with a
   * fresh time so the autosave countdown starts again for it.
   */
  const settleDirty = useCallback((savedGen: number) => {
    setDirtySince(
      dirtyGenRef.current === savedGen ? null : new Date().toISOString()
    )
  }, [])

  /**
   * What is on the canvas, in every shape a host might need it in.
   *
   * Built on demand rather than mirrored into state: the canvas is the source
   * of truth, and a copy kept in step with it is a copy that is occasionally
   * not.
   */
  const buildArtwork = useCallback((): StudioArtwork | null => {
    if (!fabricRef.current) return null
    // The front's layers, for the same reason the tile is the front's: this is
    // the list a storefront reads fields from.
    const layers =
      activeBackIdRef.current === null
        ? serializeLayers()
        : (stashedFrontRef.current?.layers ?? [])
    const values: Record<string, string> = {}
    for (const layer of layers) {
      if (!layer.isEditableBySiteUser) continue
      if (!PERSONALISABLE_LAYER_TYPES.includes(layer.type)) continue
      values[layer.fieldKey || layer.id] = layer.content ?? ''
    }
    return {
      design: serializeDocument(),
      layers,
      canvasJson: serializeCanvas(),
      // The front's, whichever side is being worked on. A host showing this as
      // "the proof" means the design, not the face that happens to be open.
      thumbnailUrl:
        activeBackIdRef.current === null
          ? exportThumbnail()
          : (stashedFrontRef.current?.thumbnail ?? ''),
      values,
    }
  }, [exportThumbnail, serializeCanvas, serializeDocument, serializeLayers])

  useEffect(() => {
    buildArtworkRef.current = buildArtwork
    applyFieldValuesRef.current = applyFieldValues
    serializeLayersRef.current = serializeLayers
    exportThumbnailRef.current = exportThumbnail
  }, [buildArtwork, applyFieldValues, serializeLayers, exportThumbnail])

  /** One save, start to finish. Callers go through `handleSave`, which queues. */
  const runSave = useCallback(
    async (publish = false, silent = false) => {
      /* ── Hosted: the artwork belongs to the caller, not to the library ──
         No product check, no version snapshot, no create or update. A buyer
         personalising a design must be able to save their own work without
         any of it reaching the template every other branch prints from. */
      if (onArtworkSave) {
        // Read before the artwork is built. See `settleDirty`.
        const savedGen = dirtyGenRef.current
        const artwork = buildArtwork()
        if (!artwork) return
        try {
          await onArtworkSave(artwork)
          settleDirty(savedGen)
          setLastSavedAt(new Date().toISOString())
        } catch (err) {
          if (silent) return
          setToast({
            kind: 'err',
            msg: (err as Error)?.message || 'Could not save your changes',
          })
          setTimeout(() => setToast(null), 3600)
        }
        return
      }

      // A template the storefront cannot attach to a product is not orderable.
      if (!templateRef.current.productId) {
        setRightTab('info')
        setToast({
          kind: 'err',
          msg: 'Link a product first — pick one in the Info tab',
        })
        setTimeout(() => setToast(null), 3600)
        return
      }

      // Nor is one with no price. The server refuses this too — it is the rule
      // `assertPublishable` holds — but a draft that saves happily and then
      // fails on publish, blaming a field two panels away, is the shape of bug
      // the "no field name" rule above already had once.
      //
      // A stocked product's pack size wins over whatever the field holds, so a
      // design is never refused at publish for disagreeing with its product.
      const fixedPackSize = stockedPackSize(
        productsRef.current.find((p) => p.id === templateRef.current.productId)
      )
      const unitsPerPack = fixedPackSize ?? templateRef.current.unitsPerPack
      if (
        publish &&
        (templateRef.current.price == null || unitsPerPack == null)
      ) {
        setRightTab('info')
        setToast({
          kind: 'err',
          msg: 'Price this design first — set the pack price and units in the Info tab',
        })
        setTimeout(() => setToast(null), 3600)
        return
      }

      // Read before the payload is built. See `settleDirty`.
      const savedGen = dirtyGenRef.current
      // The front's, whichever side is on the canvas. See `stashedFrontRef`.
      const onFront = activeBackIdRef.current === null
      const layers = onFront
        ? serializeLayers()
        : (stashedFrontRef.current?.layers ?? templateRef.current.layers)
      const thumb = onFront
        ? exportThumbnail()
        : (stashedFrontRef.current?.thumbnail ?? '')
      const payload: PrintTemplate = {
        ...templateRef.current,
        unitsPerPack,
        // The version this save is based on — the ref, not templateRef, which
        // lags a render behind the last save's response. See serverVersionRef.
        version: serverVersionRef.current,
        layers,
        design: serializeDocument(),
        canvasJson: serializeCanvas(),
        thumbnailUrl: thumb || templateRef.current.thumbnailUrl,
        canvasConfig: {
          ...templateRef.current.canvasConfig,
          backgroundColor: (printAreaRef.current?.fill as string) || '#ffffff',
        },
        status: publish ? 'PUBLISHED' : templateRef.current.status,
        updatedAt: new Date().toISOString(),
      }
      setTemplate(payload)

      try {
        if (isNew) {
          const created = await createTemplate(payload)
          setToast({
            kind: 'ok',
            msg: `Template "${created?.name || payload.name}" created`,
          })
          setTimeout(() => router.push('/admin/templates'), 1000)
        } else {
          const saved = await updateTemplate(payload.id, payload)
          serverVersionRef.current = Math.max(
            serverVersionRef.current,
            saved.version
          )
          // The version the server now holds, carried back into local state.
          //
          // Every save increments it, and the next save sends it as
          // `expectedVersion` — the token that turns two designers on one
          // template into a refusal rather than a silent overwrite. Leaving it
          // stale would make the *second* save of every session collide with
          // the first one's result and fail.
          //
          // `status` and `publishedVersion` come back too: publishing goes
          // through a second request the adapter makes, so the local row would
          // otherwise still read DRAFT on a template that is live.
          setTemplate((prev) => ({
            ...prev,
            version: serverVersionRef.current,
            status: saved.status,
            updatedAt: saved.updatedAt,
            thumbnailUrl: saved.thumbnailUrl || prev.thumbnailUrl,
          }))

          if (!silent) {
            // Explicit saves are the ones worth being able to return to.
            // Publishing already cuts a version server-side, so this only asks
            // for one on a plain draft save; the endpoint is a no-op when the
            // draft is already snapshotted at this version.
            setVersions(await saveVersion(payload.id, { label: 'Draft saved' }))
            setToast({
              kind: 'ok',
              msg: publish ? 'Template published to storefront' : 'Draft saved',
            })
            setTimeout(() => setToast(null), 2600)
          }
          settleDirty(savedGen)
          setLastSavedAt(new Date().toISOString())
        }
      } catch (err) {
        if (silent) return
        setToast({ kind: 'err', msg: (err as Error)?.message || 'Save failed' })
        setTimeout(() => setToast(null), 3600)
      }
    },
    [
      buildArtwork,
      createTemplate,
      exportThumbnail,
      isNew,
      onArtworkSave,
      router,
      serializeCanvas,
      serializeDocument,
      serializeLayers,
      settleDirty,
      updateTemplate,
    ]
  )

  /**
   * Which explicit save is running, for the header buttons.
   *
   * A publish serialises the canvas, uploads the tile and makes up to three
   * requests, and for all of it the buttons used to look exactly as they had
   * before the click — a slow publish and one that never started were
   * indistinguishable. Autosaves are silent and do not set this.
   */
  const [saveAction, setSaveAction] = useState<'save' | 'publish' | null>(null)
  const explicitSavesRef = useRef(0)

  /**
   * Saves run one at a time.
   *
   * Every save sends the version it was based on, and each success moves that
   * version on. Two saves in flight together — the autosave four seconds after
   * an edit, still uploading its tile, and a Publish clicked meanwhile — both
   * sent the same version, so whichever landed second was refused as though
   * another designer had got there first, when it had collided with this tab.
   * Queued, the second builds its payload after the first has returned, from the
   * version the first produced. A real second designer still gets refused.
   */
  const handleSave = useCallback(
    (publish = false, silent = false): Promise<void> => {
      if (!silent) {
        explicitSavesRef.current += 1
        setSaveAction(publish ? 'publish' : 'save')
      }
      const next = saveChainRef.current
        .catch(() => undefined)
        // Let the busy state paint first. Building the payload serialises the
        // whole canvas and exports the tile synchronously, and a state update
        // made just before that work would not reach the screen until after it.
        .then(() =>
          silent
            ? undefined
            : new Promise<void>((resolve) =>
                requestAnimationFrame(() => setTimeout(resolve, 0))
              )
        )
        .then(() => runSave(publish, silent))
        .finally(() => {
          if (silent) return
          explicitSavesRef.current -= 1
          if (explicitSavesRef.current === 0) setSaveAction(null)
        })
      saveChainRef.current = next
      return next
    },
    [runSave]
  )

  /**
   * Hand the host its handle, once the canvas exists.
   *
   * `onReady` is deliberately called with functions rather than data: a host
   * that held a copy of the artwork would be holding it as of some earlier
   * render, and the one thing it must never do is price or print that.
   */
  const onReadyRef = useRef(onReady)
  onReadyRef.current = onReady
  /** Handed over once per mount, for the same reason as above. */
  const handedOverRef = useRef(false)
  useEffect(() => {
    if (!onReadyRef.current || handedOverRef.current) return
    handedOverRef.current = true
    onReadyRef.current({
      getArtwork: () => buildArtworkRef.current?.() ?? null,
      sides: () => ({
        backs: backsRef.current.map((side) => ({
          id: side.id,
          name: side.name,
        })),
        activeBackId: activeBackIdRef.current,
      }),
      showSide: (backId) => void switchToSideRef.current?.(backId),
      addBack: (kind, name) => createBackRef.current?.(kind, name) ?? '',
      applyValues: (values) => applyFieldValuesRef.current?.(values),
      isDirty: () => dirtyRef.current !== null || damUploadsRef.current > 0,
      isUploading: () => damUploadsRef.current > 0,
      openPreview: (options) =>
        openPreviewRef.current?.(options) ?? Promise.resolve(),
    })
    // Once, and empty on purpose: the handle reads through refs, so it never
    // goes stale, and handing it over again would re-run whatever the host does
    // on receipt — which is usually setState.
  }, [])

  /* ── Export (point 11) ────────────────────────────────────────── */

  const [exportOpen, setExportOpen] = useState(false)
  const [exportFormat, setExportFormat] = useState<
    'png' | 'jpeg' | 'svg' | 'pdf'
  >('png')
  const [exportDpi, setExportDpi] = useState(300)
  const [exportQuality, setExportQuality] = useState(92)
  const [exportBleed, setExportBleed] = useState(true)
  const [exportCropMarks, setExportCropMarks] = useState(true)
  const [exporting, setExporting] = useState(false)

  /** The trim box, in canvas pixels. */
  const exportArea = useCallback(() => {
    const pa = printAreaRef.current
    if (!pa) return null
    return {
      left: pa.left || 0,
      top: pa.top || 0,
      width: pa.width || 0,
      height: pa.height || 0,
    }
  }, [])

  const runExport = useCallback(async () => {
    const c = fabricRef.current
    const area = exportArea()
    if (!c || !area) return
    const tpl = templateRef.current
    const name = safeFilename(tpl.name)
    const unitFactor = UNIT_TO_PX[tpl.dimensions.unit] ?? 96
    const bleedPx = exportBleed ? (tpl.bleedMargin || 0) * unitFactor : 0

    setExporting(true)
    try {
      if (exportFormat === 'svg') {
        downloadText(exportSVG({ canvas: c, area }), `${name}.svg`)
      } else if (exportFormat === 'pdf') {
        const blob = await exportPDF(
          { canvas: c, area },
          { ...tpl.dimensions, dpi: exportDpi },
          {
            dpi: exportDpi,
            bleed: exportBleed ? tpl.bleedMargin || 0 : 0,
            cropMarks: exportCropMarks,
          }
        )
        if (!blob) throw new Error('Export blocked by a cross-origin image')
        downloadBlob(blob, `${name}.pdf`)
      } else {
        const url = exportRaster(
          { canvas: c, area },
          exportFormat as RasterFormat,
          {
            dpi: exportDpi,
            quality: exportQuality / 100,
            bleedPx,
          }
        )
        if (!url) throw new Error('Export blocked by a cross-origin image')
        downloadDataUrl(
          url,
          `${name}.${exportFormat === 'jpeg' ? 'jpg' : 'png'}`
        )
      }
      setToast({ kind: 'ok', msg: `Exported ${name}.${exportFormat}` })
      setTimeout(() => setToast(null), 2600)
      setExportOpen(false)
    } catch (err) {
      setToast({ kind: 'err', msg: (err as Error)?.message || 'Export failed' })
      setTimeout(() => setToast(null), 3600)
    } finally {
      setExporting(false)
    }
  }, [
    exportArea,
    exportBleed,
    exportCropMarks,
    exportDpi,
    exportFormat,
    exportQuality,
  ])

  /** Pixel dimensions the current settings will produce. */
  const exportPixels = useMemo(() => {
    const area = exportArea()
    if (!area) return null
    const m = exportFormat === 'svg' ? 1 : Math.max(0.1, exportDpi / 96)
    return {
      w: Math.round(area.width * m),
      h: Math.round(area.height * m),
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exportArea, exportDpi, exportFormat, revision, template.dimensions])

  useEffect(() => {
    handleSaveRef.current = handleSave
  }, [handleSave])

  useEffect(() => {
    markDirtyRef.current = markDirty
  }, [markDirty])

  /**
   * Debounced autosave: fires ~4s after the last edit settles. Only for
   * templates that already exist - autosaving a brand-new one would create a
   * fresh record on every keystroke.
   */
  useEffect(() => {
    // A hosted studio does not autosave. Its save goes through the host, and
    // for a buyer that means a basket line and a priced run - not something to
    // fire four seconds after a nudged text box.
    if (onArtworkSave) return
    if (!autosaveOn || isNew || !dirtySince) return
    if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current)
    autosaveTimerRef.current = setTimeout(async () => {
      if (!templateRef.current.productId) return
      setAutosaving(true)
      try {
        await handleSaveRef.current?.(false, true)
      } finally {
        setAutosaving(false)
      }
    }, 4000)
    return () => {
      if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current)
    }
  }, [autosaveOn, isNew, dirtySince, onArtworkSave])

  /** Roll the canvas back to a stored snapshot. */
  /**
   * Restores a snapshot.
   *
   * The server applies it — a listed version deliberately carries no design
   * document, because sending forty of them to draw a list of forty rows would
   * be megabytes to render a scrollbar. It hands back the restored template,
   * and the canvas reloads from that.
   *
   * Restoring is itself a save on the server, so it bumps the version and can
   * be undone by restoring the one it replaced. It publishes nothing: the
   * storefront keeps rendering whatever it was until somebody publishes.
   */
  const restoreVersion = useCallback(
    async (v: TemplateVersion) => {
      const c = fabricRef.current
      const templateId = templateRef.current.id
      if (!c || !templateId) return

      let doc: DesignDocument | undefined
      try {
        // After any save still in flight, so its response cannot land on top
        // of the restored draft.
        await saveChainRef.current.catch(() => undefined)
        const restored = await restoreTemplateVersion(templateId, v.version)
        doc = restored.design
        // Restoring is a save on the server and moves the version on. The next
        // save used to send the version from before the restore, and was
        // refused as a collision every time.
        serverVersionRef.current = Math.max(
          serverVersionRef.current,
          restored.version
        )
        setTemplate((prev) => ({
          ...prev,
          version: serverVersionRef.current,
          updatedAt: restored.updatedAt,
        }))
      } catch (err) {
        setToast({
          kind: 'err',
          msg: (err as Error)?.message || 'Could not restore that version',
        })
        setTimeout(() => setToast(null), 3600)
        return
      }

      if (!doc) {
        setToast({
          kind: 'err',
          msg: 'That version holds no artwork to restore',
        })
        setTimeout(() => setToast(null), 3600)
        return
      }

      lockRef.current = true
      ;(c.getObjects() as FabricAny[])
        .filter((o) => !isChrome(o))
        .forEach((o) => c.remove(o))
      c.discardActiveObject()
      setActiveObj(null)
      setSelectedIds([])
      let built: fabric.Object[] = []
      try {
        built = await objectsToCanvas(
          c,
          doc.objects,
          renderCodeBitmap,
          doc.meta?.version
        )
        if (doc.background && doc.background !== 'transparent') {
          printAreaRef.current?.set('fill', doc.background as string)
        }
        normalizeStackRef.current?.(c)
        c.requestRenderAll()
      } finally {
        lockRef.current = false
      }
      reportUnloadedImagesRef.current?.(built)
      resetHistoryRef.current?.()
      setVersionsOpen(false)
      // Not marked dirty: the server already holds this state. Marking it would
      // start an autosave countdown for a change that has already been saved.
      bump()
      setVersions(await listVersions(templateId))
      setToast({
        kind: 'ok',
        msg: `Restored v${v.version} from ${relativeTime(v.at)}`,
      })
      setTimeout(() => setToast(null), 2800)
    },
    [bump]
  )

  /**
   * Every side of the design, drawn as it will print.
   *
   * Rendered through `renderSidePreview` rather than screenshotted off the
   * canvas, which is what `exportThumbnail` did and why this only ever showed
   * one face: the canvas holds the side that happens to be open, while the
   * document holds all of them.
   *
   * The front and one back — the one the design is set to print.
   *
   * One back rather than all of them, because that is what an order carries: a
   * buyer picks a single reverse and the press receives two faces. Showing all
   * four of a design's backs here would be previewing something nobody will
   * ever hold. The others are reachable by making one of them the chosen back
   * in the sides bar, which re-renders this.
   *
   * The live document, not the saved one. A designer pressing Preview wants to
   * see what they have just done, including the parts they have not saved.
   */
  const openPreview = useCallback(
    async (options?: { backId?: string | null }) => {
      setPreviewBusy(true)
      setSpinFrame(0)
      setFlipDeg(0)
      try {
        const full = serializeDocument()
        // A host that knows which back will print says so; the design's own
        // default is only the designer's suggestion. `null` previews the front
        // with a blank back, which is what an order with a blank back receives.
        const chosen =
          options && 'backId' in options
            ? (full.backs ?? []).find((side) => side.id === options.backId)
            : undefined
        const design =
          options && 'backId' in options
            ? chosen
              ? { ...full, backs: [chosen], defaultBackId: chosen.id }
              : { ...full, backs: [], defaultBackId: null }
            : full
        const tpl = { ...templateRef.current, design }
        const sides = proofSides(design)

        // Drawn for the device pixels the frame covers, not its CSS width: the
        // frame is at most 760px, and on a 2x screen that is 1520 real pixels.
        const previewWidth = Math.round(760 * (window.devicePixelRatio || 1))

        const rendered = await Promise.all(
          sides.map(async (side) => ({
            name: side.name,
            url: await renderSidePreview(tpl, side.objects, {}, previewWidth),
          }))
        )

        // A side that could not be captured is kept, with no url, and the modal
        // says so where the picture would be. `renderSidePreview` returns an
        // empty string rather than throwing when the canvas is tainted by an
        // image whose host sent no CORS headers — dropping those sides silently
        // would show a designer a one-sided preview of a two-sided design and
        // give them no reason to doubt it.
        if (rendered.every((side) => !side.url)) {
          setToast({
            kind: 'err',
            msg: 'Preview blocked by a cross-origin image',
          })
          return
        }
        // Nothing printed on the back is still a back: the sheet turns over
        // to show it blank, rather than refusing to turn at all.
        setPreview(
          rendered.length === 1
            ? [...rendered, { name: 'Back (blank)', url: '', blank: true }]
            : rendered
        )
      } finally {
        setPreviewBusy(false)
      }
    },
    [serializeDocument]
  )

  // Read through a ref by the host's handle, which is handed over once and
  // must still open the preview of whatever is on the canvas now.
  useEffect(() => {
    openPreviewRef.current = openPreview
  }, [openPreview])

  /* ── Keyboard shortcuts ───────────────────────────────────────── */

  useEffect(() => {
    const typingInDom = () => {
      const el = document.activeElement
      return (
        !!el &&
        (el.tagName === 'INPUT' ||
          el.tagName === 'TEXTAREA' ||
          el.tagName === 'SELECT')
      )
    }
    const editingOnCanvas = () =>
      !!(fabricRef.current?.getActiveObject() as FabricAny)?.isEditing

    const onKeyDown = (e: KeyboardEvent) => {
      if (typingInDom() || editingOnCanvas()) return
      const mod = e.ctrlKey || e.metaKey

      if (mod && e.key.toLowerCase() === 'z') {
        e.preventDefault()
        if (e.shiftKey) redo()
        else undo()
        return
      }
      if (mod && e.key.toLowerCase() === 'y') {
        e.preventDefault()
        redo()
        return
      }
      if (mod && e.key.toLowerCase() === 'd') {
        e.preventDefault()
        duplicateSelected()
        return
      }
      if (mod && e.key.toLowerCase() === 'c') {
        e.preventDefault()
        copySelected()
        return
      }
      if (mod && e.key.toLowerCase() === 'v') {
        e.preventDefault()
        pasteClipboard()
        return
      }
      if (mod && e.key.toLowerCase() === 'x') {
        e.preventDefault()
        cutSelected()
        return
      }
      if (mod && e.key.toLowerCase() === 'g') {
        e.preventDefault()
        if (e.shiftKey) doUngroup()
        else doGroup()
        return
      }
      if (mod && e.key.toLowerCase() === 'e') {
        e.preventDefault()
        setExportOpen(true)
        return
      }
      // Arrange: Ctrl+] / Ctrl+[ step, add Shift to jump to front / back
      if (mod && (e.key === ']' || e.key === '[')) {
        e.preventDefault()
        const forward = e.key === ']'
        arrangeSelected(
          e.shiftKey
            ? forward
              ? 'front'
              : 'back'
            : forward
              ? 'forward'
              : 'backward'
        )
        return
      }
      if (mod && e.key.toLowerCase() === 's') {
        e.preventDefault()
        handleSave(false)
        return
      }
      if (!mod && e.key.toLowerCase() === 'f') {
        e.preventDefault()
        setFillMode((v) => !v)
        return
      }
      if (e.key === 'Enter' && penModeRef.current) {
        e.preventDefault()
        finishPenRef.current?.(false)
        return
      }
      if (e.key === 'Escape') {
        if (penModeRef.current) {
          cancelPenRef.current?.()
          return
        }
        setFillMode(false)
        setExportOpen(false)
        exitGroupEdit()
        setMaskContentId(null)
        return
      }
      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault()
        deleteSelected()
        return
      }
      // Nudge with arrow keys, 10px with shift
      const step = e.shiftKey ? 10 : 1
      const obj = fabricRef.current?.getActiveObject()
      if (!obj) return
      const moves: Record<string, [number, number]> = {
        ArrowLeft: [-step, 0],
        ArrowRight: [step, 0],
        ArrowUp: [0, -step],
        ArrowDown: [0, step],
      }
      const d = moves[e.key]
      if (!d) return
      e.preventDefault()
      obj.set({ left: (obj.left || 0) + d[0], top: (obj.top || 0) + d[1] })
      obj.setCoords()
      fabricRef.current?.requestRenderAll()
      snapshotSoon()
      // The position readout follows every press; the studio catches up once
      // the key is let go, not on each repeat.
      liveTicker.tick()
      bumpSoon()
    }

    // Spacebar held = pan mode, released = back to selection.
    const onSpaceDown = (e: KeyboardEvent) => {
      if (e.code !== 'Space' || typingInDom() || editingOnCanvas()) return
      if (spaceDownRef.current) return
      e.preventDefault()
      spaceDownRef.current = true
      setSpacePanning(true)
      const c = fabricRef.current
      if (c) {
        c.defaultCursor = 'grab'
        c.setCursor('grab')
      }
    }
    const onSpaceUp = (e: KeyboardEvent) => {
      if (e.code !== 'Space') return
      spaceDownRef.current = false
      setSpacePanning(false)
      const c = fabricRef.current
      if (c) c.defaultCursor = 'default'
    }

    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keydown', onSpaceDown)
    window.addEventListener('keyup', onSpaceUp)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keydown', onSpaceDown)
      window.removeEventListener('keyup', onSpaceUp)
    }
  }, [
    arrangeSelected,
    bump,
    bumpSoon,
    copySelected,
    cutSelected,
    deleteSelected,
    doGroup,
    doUngroup,
    duplicateSelected,
    exitGroupEdit,
    handleSave,
    liveTicker,
    pasteClipboard,
    redo,
    snapshotSoon,
    undo,
  ])

  /* ── Derived view data ────────────────────────────────────────── */

  const isText =
    !!activeObj && ['i-text', 'text', 'textbox'].includes(activeObj.type || '')
  /** The selected text's case and effect, read from the object each render. */
  const currentCase: TextCase =
    isText &&
    (activeObj?.textCase === 'upper' || activeObj?.textCase === 'lower')
      ? activeObj.textCase
      : 'none'
  const currentEffect =
    isText && activeObj
      ? textEffectOf(activeObj)
      : { kind: 'none' as TextEffectKind, color: '#000000', intensity: 50 }
  const isScannable =
    !!activeObj &&
    (activeObj.customType === 'qrcode' || activeObj.customType === 'barcode')
  const isImage = !!activeObj && activeObj.type === 'image'
  /**
   * Whether this layer can be bound to a storefront field at all.
   *
   * `TemplateCustomizerStudio` files every image and logo under "brand
   * protected" regardless of the flag, so the inspector must not offer a tick
   * box that the storefront quietly ignores. Same rule, same source, as the
   * Collection tab's list.
   */
  const bindingLocked =
    !!activeObj && ['image', 'logo'].includes(mapToLayerType(activeObj))
  /** A real bitmap or an empty placeholder - never a QR/barcode. */
  const isImageLayer = isPhotoLayer(activeObj)
  /** An actual loaded bitmap that can be cropped or filtered. */
  const isPhotoBitmap = isImageLayer && isImage
  /**
   * The image toolbar: for a picture or an empty upload space, and kept up
   * while a crop is being dragged. Admin and site user alike — the buyer's
   * studio is this component.
   */
  const showImageBar = (isImageLayer && !isScannable) || cropping
  const imageFit = isPhotoBitmap
    ? (activeObj?.imageFit as ImageFit | undefined)
    : undefined
  const imageOpacity = Math.round((activeObj?.opacity ?? 1) * 100)
  const imageAdjusted =
    isPhotoBitmap &&
    IMAGE_ADJUSTMENTS.some(
      (row) => (filtersOf()[row.key] as number | undefined) ?? 0
    )
  /** A menu belongs to its own toolbar: selecting anything else hides it. */
  const textMenuOpen =
    textMenu &&
    ((isText && (textMenu.kind === 'format' || textMenu.kind === 'effects')) ||
      (isPhotoBitmap &&
        (textMenu.kind === 'adjust' ||
          textMenu.kind === 'removebg' ||
          textMenu.kind === 'opacity')))
      ? textMenu
      : null
  const paFill = (printAreaRef.current?.fill as string) || '#ffffff'
  const editableCount = canvasLayers.filter(
    (l) => l.isEditableBySiteUser
  ).length

  /**
   * Whether a layer is wording someone can retype in the Editable Fields tab.
   *
   * Only real text objects. The test used to be "anything but a picture", so a
   * rectangle or a circle arrived as a field with an empty text box — nothing to
   * type into it could ever change, since a shape has no text to set. A QR code
   * or barcode is left out for the same reason: its value is not a caption.
   */
  const isWording = (o: FabricAny) =>
    typeof (o as { text?: unknown }).text === 'string'

  /**
   * What the Editable Fields tab actually offers, which is every piece of
   * wording rather than only the fields somebody ticked.
   *
   * The tab counted the ticked ones and the panel now lists all of them, so on
   * a design nobody had marked up it said "(0)" above a panel full of text.
   * The number on a tab has to be the number of things behind it.
   */
  const wordingCount = personalisableLayers.filter(({ o }) =>
    isWording(o)
  ).length

  const setMeta = <K extends keyof PrintTemplate>(
    key: K,
    value: PrintTemplate[K]
  ) => setTemplate((prev) => ({ ...prev, [key]: value }))

  const setDims = (patch: Partial<PrintTemplate['dimensions']>) =>
    setTemplate((prev) => ({
      ...prev,
      dimensions: { ...prev.dimensions, ...patch },
    }))

  const activeProduct = products.find((p) => p.id === template.productId)
  const productSizes = activeProduct?.availableSizes || []

  /** Set when the linked product fixes the pack size — see `stockedPackSize`. */
  const lockedPackSize = stockedPackSize(activeProduct)
  const unitsPerPack = lockedPackSize ?? template.unitsPerPack

  /**
   * The "each" figure, or null while the pair is incomplete.
   *
   * Derived rather than stored: two numbers that must agree are one number too
   * many, and a rounded per-unit price multiplied back up would not come to the
   * pack price the buyer is actually charged.
   */
  const perUnitPrice =
    template.price != null && unitsPerPack
      ? template.price / unitsPerPack
      : null

  /** Which catalogue size the canvas currently matches, if any. */
  const activeSizeId =
    template.dimensions.unit === 'in'
      ? productSizes.find(
          (s) =>
            s.widthInches === template.dimensions.width &&
            s.heightInches === template.dimensions.height
        )?.id || ''
      : ''

  const applyProduct = (id: string) => {
    const p = products.find((x) => x.id === id)
    if (!p) return
    // The artboard becomes the product's trim the moment it is chosen, so the
    // design is print-correct from the first object placed on it.
    const setup = setupFromProduct(p)
    const packSize = stockedPackSize(p)
    setTemplate((prev) => ({
      ...prev,
      productId: p.id,
      productName: p.name,
      category: p.printCategory || p.categoryName || prev.category,
      ...(setup ?? {}),
      ...(packSize != null ? { unitsPerPack: packSize } : {}),
    }))
    if (!setup) {
      setToast({
        kind: 'err',
        // Pointing at a "sheet size" control here was wrong: the Print size
        // selector only appears for a product carrying a "Size" option axis,
        // which a business card does not, so the advice named something that
        // was not on the screen. The trim lives on the product.
        msg: `"${p.name}" has no trim size, so the artboard is unchanged. Add it in Catalogue → Print Products → Edit (Print size, in mm).`,
      })
      setTimeout(() => setToast(null), 4200)
    }
  }

  const applySize = (sizeId: string) => {
    const size = productSizes.find((s) => s.id === sizeId)
    if (size) setTemplate((prev) => ({ ...prev, ...setupFromSize(size) }))
  }

  return (
    <div
      style={{
        ...ST.shell,
        // A studio on its own owns the window. One under a host's bar owns
        // whatever is left of it, which `100vh` would overshoot by exactly the
        // height of that bar.
        ...(fitParent ? { height: '100%', flex: 1, minHeight: 0 } : null),
      }}
    >
      {/* ─── 1. TOP BAR ─────────────────────────────────────────── */}
      {showHeader && (
        <header style={ST.topBar}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              minWidth: 0,
            }}
          >
            <div style={ST.brandDot} />
            {isEditingTitle ? (
              <input
                autoFocus
                value={template.name}
                onChange={(e) => setMeta('name', e.target.value)}
                onBlur={() => setIsEditingTitle(false)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === 'Escape')
                    setIsEditingTitle(false)
                }}
                style={{ ...ST.input, fontWeight: 600, width: 280 }}
              />
            ) : (
              <h1
                onDoubleClick={() => setIsEditingTitle(true)}
                title="Double-click to rename"
                style={ST.title}
              >
                {template.name}
              </h1>
            )}
            {/* A buyer is not looking at a library row, so its publication state
              is not theirs to read: on this screen the design is simply the one
              they are personalising. */}
            {!isCustomise && (
              <span
                style={{
                  ...ST.badge,
                  backgroundColor:
                    template.status === 'PUBLISHED' ? '#dcfce7' : '#f1f5f9',
                  color:
                    template.status === 'PUBLISHED' ? '#15803d' : '#475569',
                }}
              >
                {template.status}
              </span>
            )}
            <span style={ST.subtle}>
              {canvasLayers.length} layers · {editableCount} editable
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {/* Rendering every side takes a beat on a heavy design, so the
                button says so rather than looking ignored. */}
            <button
              onClick={() => void openPreview()}
              disabled={previewBusy}
              style={{ ...ST.btnGhost, opacity: previewBusy ? 0.6 : 1 }}
            >
              <Eye size={14} /> {previewBusy ? 'Rendering…' : 'Preview'}
            </button>
            <span
              style={ST.saveStatus}
              title="Autosave status"
              aria-live="polite"
            >
              {saveAction === 'publish'
                ? 'Publishing…'
                : autosaving || saveAction === 'save'
                  ? 'Saving…'
                  : dirtySince || uploadingToDam
                    ? 'Unsaved changes'
                    : lastSavedAt
                      ? `Saved ${relativeTime(lastSavedAt)}`
                      : ''}
            </span>
            {/* Version history is the template's, and a hosted studio is not
              editing the template. Restoring one here would pull the operator's
              artwork over the buyer's own work. */}
            {!isCustomise && (
              <button
                onClick={() => setVersionsOpen(true)}
                style={ST.btnGhost}
                title="Version history"
              >
                <History size={14} /> History
              </button>
            )}
            <button onClick={() => setExportOpen(true)} style={ST.btnGhost}>
              <Download size={14} /> Export
            </button>
            {/* Busy only while one of these buttons' own saves runs. An autosave
                no longer disables them: saves queue, so a Publish clicked during
                an autosave goes next instead of the click doing nothing. */}
            <button
              onClick={() => handleSave(false)}
              disabled={saveAction !== null}
              aria-busy={saveAction === 'save'}
              // Saving is the only thing a site user can do here, so it takes the
              // primary weight when publishing is not theirs to offer.
              style={{
                ...(canPublish ? ST.btnSecondary : ST.btnPrimary),
                ...(saveAction !== null
                  ? { opacity: 0.7, cursor: 'progress' }
                  : {}),
              }}
            >
              {saveAction === 'save' ? (
                <Loader2
                  size={14}
                  style={{ animation: 'spin 0.8s linear infinite' }}
                />
              ) : (
                <Save size={14} />
              )}{' '}
              {saveAction === 'save'
                ? 'Saving…'
                : canPublish
                  ? 'Save draft'
                  : 'Save'}
            </button>
            {/* The server refuses a site user's publish, and a button that always
              fails is worse than no button: it reads as the design being broken
              rather than as the rule it is. The status dropdown hides
              "Published" for the same reason. */}
            {canPublish && (
              <button
                onClick={() => handleSave(true)}
                disabled={saveAction !== null}
                aria-busy={saveAction === 'publish'}
                style={{
                  ...ST.btnPrimary,
                  ...(saveAction !== null
                    ? { opacity: 0.7, cursor: 'progress' }
                    : {}),
                }}
              >
                {saveAction === 'publish' ? (
                  <>
                    <Loader2
                      size={14}
                      style={{ animation: 'spin 0.8s linear infinite' }}
                    />{' '}
                    Publishing…
                  </>
                ) : (
                  <>
                    <Check size={14} /> Publish
                  </>
                )}
              </button>
            )}
          </div>
        </header>
      )}

      {/* ─── 2. TOOLBAR ─────────────────────────────────────────── */}
      <div style={ST.toolBar}>
        <IconButton title="Undo (Ctrl+Z)" onClick={undo} disabled={!canUndo}>
          <Undo size={16} />
        </IconButton>
        <IconButton
          title="Redo (Ctrl+Shift+Z)"
          onClick={redo}
          disabled={!canRedo}
        >
          <Redo size={16} />
        </IconButton>

        <div style={ST.sep} />

        <IconButton title="Zoom out" onClick={() => applyZoom(zoom - 10)}>
          <ZoomOut size={16} />
        </IconButton>
        <span style={ST.zoomPill}>{zoom}%</span>
        <IconButton title="Zoom in" onClick={() => applyZoom(zoom + 10)}>
          <ZoomIn size={16} />
        </IconButton>
        <IconButton title="Fit to screen" onClick={fitToScreen}>
          <Maximize size={16} />
        </IconButton>

        <div style={ST.sep} />

        <IconButton
          title="Align left"
          onClick={() => alignSelected('left')}
          disabled={!activeObj}
        >
          <AlignLeft size={16} />
        </IconButton>
        <IconButton
          title="Align centre"
          onClick={() => alignSelected('hcenter')}
          disabled={!activeObj}
        >
          <AlignCenter size={16} />
        </IconButton>
        <IconButton
          title="Align right"
          onClick={() => alignSelected('right')}
          disabled={!activeObj}
        >
          <AlignRight size={16} />
        </IconButton>
        <IconButton
          title="Align top"
          onClick={() => alignSelected('top')}
          disabled={!activeObj}
        >
          <AlignVerticalJustifyStart size={16} />
        </IconButton>
        <IconButton
          title="Align middle"
          onClick={() => alignSelected('vmiddle')}
          disabled={!activeObj}
        >
          <AlignVerticalJustifyCenter size={16} />
        </IconButton>
        <IconButton
          title="Align bottom"
          onClick={() => alignSelected('bottom')}
          disabled={!activeObj}
        >
          <AlignVerticalJustifyEnd size={16} />
        </IconButton>
        <IconButton
          title="Distribute horizontally (needs 3+ layers)"
          onClick={() => distributeSelected('horizontal')}
          disabled={selectedIds.length < 3}
        >
          <AlignHorizontalSpaceAround size={16} />
        </IconButton>
        <IconButton
          title="Distribute vertically (needs 3+ layers)"
          onClick={() => distributeSelected('vertical')}
          disabled={selectedIds.length < 3}
        >
          <AlignVerticalSpaceAround size={16} />
        </IconButton>
        <IconButton
          title={smartGuidesOn ? 'Smart guides: on' : 'Smart guides: off'}
          onClick={() => setSmartGuidesOn((v) => !v)}
          active={smartGuidesOn}
        >
          <Sparkles size={16} />
        </IconButton>

        <div style={ST.sep} />

        {/* Paint bucket. The palette lives in a popover rather than inline:
            twenty-odd swatches in the toolbar squeezed every other control
            until the icons were unreadable. */}
        <div ref={fillGroupRef} style={ST.fillGroup}>
          <IconButton
            title={
              fillMode
                ? 'Fill tool on — click a shape to fill it (Esc to exit)'
                : 'Fill tool (F) — click shapes to paint them'
            }
            onClick={() => setFillMode((v) => !v)}
            active={fillMode}
          >
            <PaintBucket size={16} />
          </IconButton>
          <button
            title="Fill colour"
            ref={fillBtnRef}
            onClick={(e) => {
              e.stopPropagation()
              const r = fillBtnRef.current?.getBoundingClientRect()
              if (r) {
                const W = 232
                setFillAnchor({
                  // Keep it on screen when the button sits near the right edge.
                  left: Math.min(r.left, window.innerWidth - W - 12),
                  top: r.bottom + 6,
                })
              }
              setFillPaletteOpen((v) => !v)
            }}
            style={ST.fillWellBtn}
          >
            <span
              style={{
                ...ST.fillWellChip,
                backgroundColor: /^#[0-9a-f]{6}$/i.test(fillColor)
                  ? fillColor
                  : '#3b82f6',
              }}
            />
            <ChevronDown size={11} />
          </button>

          {fillPaletteOpen && (
            <div
              style={{
                ...ST.fillPopover,
                left: fillAnchor?.left ?? 0,
                top: fillAnchor?.top ?? 0,
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <div style={ST.fillPopoverGrid}>
                {COLOR_SWATCHES.map((c) => (
                  <button
                    key={c}
                    onClick={() => {
                      setFillColor(c)
                      setFillMode(true)
                    }}
                    title={c}
                    style={{
                      ...ST.fillPopoverSwatch,
                      backgroundColor: c,
                      outline: c === fillColor ? '2px solid #2563eb' : 'none',
                      outlineOffset: 1,
                      borderColor: c === '#ffffff' ? '#d1d5db' : 'transparent',
                    }}
                  />
                ))}
              </div>
              <div style={ST.fillPopoverFoot}>
                <input
                  type="color"
                  value={
                    /^#[0-9a-f]{6}$/i.test(fillColor) ? fillColor : '#3b82f6'
                  }
                  onChange={(e) => {
                    setFillColor(e.target.value)
                    setFillMode(true)
                  }}
                  style={ST.colorWell}
                  title="Custom colour"
                />
                <input
                  style={ST.input}
                  value={fillColor}
                  onChange={(e) => setFillColor(e.target.value)}
                />
              </div>
              <p style={{ ...ST.hint, margin: '6px 0 0' }}>
                Click a shape to fill it. Ctrl+click picks a colour up.
              </p>
            </div>
          )}
        </div>

        <div style={ST.sep} />

        <IconButton
          title={
            showGuides ? 'Hide bleed / safe guides' : 'Show bleed / safe guides'
          }
          onClick={() => setShowGuides((v) => !v)}
          active={showGuides}
        >
          {showGuides ? <Eye size={16} /> : <EyeOff size={16} />}
        </IconButton>
        {penMode && (
          <>
            <IconButton
              title={penSmooth ? 'Curved segments' : 'Straight segments'}
              onClick={() => setPenSmooth((v) => !v)}
              active={penSmooth}
            >
              <PenTool size={16} />
            </IconButton>
            <span style={ST.subtle}>
              {penSmooth ? 'Curved' : 'Straight'} · Enter to finish · Esc to
              cancel
            </span>
            <div style={ST.sep} />
          </>
        )}
        <IconButton
          title={showRulers ? 'Hide rulers' : 'Show rulers'}
          onClick={() => setShowRulers((v) => !v)}
          active={showRulers}
        >
          <Ruler size={16} />
        </IconButton>
        <IconButton
          title={showGrid ? 'Hide grid' : 'Show grid'}
          onClick={() => setShowGrid((v) => !v)}
          active={showGrid}
        >
          <Grid3x3 size={16} />
        </IconButton>
        <IconButton
          title={snapGrid ? 'Snap to grid: on' : 'Snap to grid: off'}
          onClick={() => setSnapGrid((v) => !v)}
          active={snapGrid}
        >
          <Magnet size={16} />
        </IconButton>
        {showGrid && (
          <input
            type="number"
            min={4}
            max={200}
            value={gridSpacing}
            onChange={(e) => {
              setGridSpacing(Math.max(4, Number(e.target.value) || 4))
              fabricRef.current?.requestRenderAll()
            }}
            title="Grid spacing in canvas pixels"
            style={ST.gridInput}
          />
        )}
        {guideCount > 0 && (
          <IconButton
            title={`Remove all ${guideCount} ruler guide${guideCount > 1 ? 's' : ''} — or double-click a guide, or drag it back onto a ruler`}
            onClick={clearGuides}
          >
            <X size={16} />
          </IconButton>
        )}
        <IconButton
          title="Group (Ctrl+G)"
          onClick={doGroup}
          disabled={!activeObj}
        >
          <GroupIcon size={16} />
        </IconButton>
        <IconButton
          title="Ungroup (Ctrl+Shift+G)"
          onClick={doUngroup}
          disabled={activeObj?.type !== 'group'}
        >
          <Ungroup size={16} />
        </IconButton>
        <IconButton
          title="Create mask — select two layers, the top one clips the lower"
          onClick={doCreateMask}
          disabled={!activeObj}
        >
          <Contrast size={16} />
        </IconButton>
        <IconButton
          title="Release mask — unclip the content and restore the shape"
          onClick={doReleaseMask}
          disabled={!hasMask(activeObj)}
        >
          <CircleSlash size={16} />
        </IconButton>

        <div style={ST.sep} />

        <IconButton
          title="Duplicate (Ctrl+D)"
          onClick={duplicateSelected}
          disabled={!activeObj}
        >
          <Copy size={16} />
        </IconButton>
        <IconButton
          title="Delete (Del)"
          onClick={deleteSelected}
          disabled={!activeObj}
          danger
        >
          <Trash2 size={16} />
        </IconButton>

        <span style={{ ...ST.subtle, marginLeft: 'auto' }}>
          Alt-drag or middle-drag to pan · Ctrl+wheel to zoom
        </span>
      </div>

      <div
        style={{ display: 'flex', flex: 1, minHeight: 0, overflow: 'hidden' }}
      >
        {/* ─── 3. LEFT SIDEBAR ──────────────────────────────────── */}
        <aside style={ST.leftPanel}>
          <div style={ST.tabRow}>
            <button
              onClick={() => setLeftTab('component')}
              style={leftTab === 'component' ? ST.tabOn : ST.tabOff}
            >
              Component
            </button>
            <button
              onClick={() => setLeftTab('collection')}
              style={leftTab === 'collection' ? ST.tabOn : ST.tabOff}
            >
              {isOwned ? `Editable Fields (${wordingCount})` : 'Collection'}
            </button>
          </div>

          <div style={ST.panelScroll}>
            {leftTab === 'component' ? (
              <>
                <div style={ST.groupLabel}>Common</div>
                <div style={ST.paletteGrid}>
                  {SIDEBAR_COMPONENTS.map((comp) => {
                    const Icon = comp.icon
                    return (
                      <div
                        key={comp.id}
                        draggable
                        onDragStart={(e) => handleDragStart(e, comp.id)}
                        onClick={() => {
                          const c = viewportCentre()
                          addObject(comp.id, c.x, c.y, { keepOnSheet: true })
                        }}
                        title={`Drag onto the canvas, or click to add`}
                        style={ST.paletteItem}
                        onMouseOver={(e) =>
                          (e.currentTarget.style.borderColor = '#3b82f6')
                        }
                        onMouseOut={(e) =>
                          (e.currentTarget.style.borderColor = '#e5e7eb')
                        }
                      >
                        <Icon
                          size={20}
                          color="#4b5563"
                          style={{ marginBottom: 6 }}
                        />
                        <span
                          style={{
                            fontSize: '0.65rem',
                            color: '#4b5563',
                            fontWeight: 500,
                          }}
                        >
                          {comp.label}
                        </span>
                      </div>
                    )
                  })}
                </div>

                <div style={{ ...ST.groupLabel, marginTop: 20 }}>Assets</div>
                <button
                  style={ST.btnBlock}
                  onClick={() => openImagePicker(null)}
                >
                  <Upload size={14} /> Upload image
                </button>
                {canBrowseDam && (
                  <button
                    style={{ ...ST.btnBlock, marginTop: 6 }}
                    onClick={() => openImageLibrary(null)}
                  >
                    <Images size={14} /> Image library
                  </button>
                )}
              </>
            ) : isOwned ? (
              /* ─── Editable Fields ────────────────────────────────
                 The same layers the Personalisation panel opposite lets the
                 designer open up — filled in here rather than chosen. A
                 customer who only wants their branch name on the artwork never
                 has to find the text on the canvas, and cannot touch anything
                 the designer kept back. */
              <>
                <div style={ST.groupLabel}>Editable Fields</div>
                <p style={ST.hint}>
                  Change the wording here and the artwork updates as you type.
                  Everything else is brand-protected — open the Component tab if
                  you want to change the design itself.
                </p>

                {/* Pictures the designer opened up, first.
                    A logo is the one thing a branch almost always replaces, and
                    hunting for it on the canvas to double-click it is not
                    obvious to somebody who has never used a design tool. */}
                {(() => {
                  const photos = personalisableLayers.filter((r) => {
                    const t = mapToLayerType(r.o)
                    return (
                      r.o.isEditableBySiteUser &&
                      (t === 'image' || t === 'logo')
                    )
                  })
                  if (photos.length === 0) return null
                  return (
                    <div style={{ marginBottom: 14 }}>
                      {photos.map(({ o }) => (
                        <div
                          key={(o.layerId as string) ?? 'photo'}
                          style={ST.fieldCard}
                        >
                          <div style={ST.editFieldLabel}>
                            {(o.layerLabel as string) ||
                              (o.layerName as string) ||
                              'Your logo'}
                          </div>
                          <button
                            style={ST.btnBlock}
                            onClick={() => {
                              fabricRef.current?.setActiveObject(o)
                              fabricRef.current?.requestRenderAll()
                              openImagePicker(o)
                            }}
                          >
                            <Upload size={14} /> Upload your logo
                          </button>
                          {canBrowseDam && (
                            <button
                              style={{ ...ST.btnBlock, marginTop: 6 }}
                              onClick={() => {
                                fabricRef.current?.setActiveObject(o)
                                fabricRef.current?.requestRenderAll()
                                openImageLibrary(o)
                              }}
                            >
                              <Images size={14} /> Choose from image library
                            </button>
                          )}
                          <p style={{ ...ST.hint, margin: '6px 0 0' }}>
                            Replaces the picture in place, at the size and
                            position the designer set.
                          </p>
                        </div>
                      ))}
                    </div>
                  )
                })()}

                {(() => {
                  /*
                   * Every piece of wording on the design, not only the fields
                   * the designer opened up.
                   *
                   * This listed `isEditableBySiteUser` alone, which was right
                   * when that flag decided what a buyer could touch. It no
                   * longer does: a buyer has the whole canvas, and can retype
                   * any of this by double-clicking it. So a design where nobody
                   * ticked the boxes showed "Editable Fields (0)" and an empty
                   * panel — telling someone who does not want to touch the
                   * artwork that there was nothing here for them, while the
                   * text sat one canvas away.
                   *
                   * The designer's own fields still come first and keep their
                   * labels; the rest follow under their own heading. Typing
                   * here changes the artwork exactly as typing on the canvas
                   * does, which is the point: it is the same object.
                   */
                  // Text objects only — see `isWording`. Shapes have no wording.
                  const marked = personalisableLayers.filter(
                    (r) => r.o.isEditableBySiteUser && isWording(r.o)
                  )
                  const rest = personalisableLayers.filter(
                    (r) => !r.o.isEditableBySiteUser && isWording(r.o)
                  )

                  if (marked.length === 0 && rest.length === 0) {
                    return (
                      <p style={ST.hint}>
                        This design has no text on it. Add some from the
                        Component tab, or change the artwork directly.
                      </p>
                    )
                  }

                  const field = ({ o }: { o: FabricAny }) => {
                    const label =
                      (o.layerLabel as string) ||
                      (o.layerName as string) ||
                      (o.fieldKey as string) ||
                      'Text'
                    // As typed: an uppercase layer still edits what was written.
                    const value = rawTextOf(o as FabricAny)

                    const write = (next: string) =>
                      mutateObject(o, (target) => {
                        setTextKeepingCase(target as FabricAny, next)
                      })

                    return (
                      <div
                        key={(o.layerId as string) ?? label}
                        style={ST.fieldCard}
                      >
                        <div style={ST.editFieldLabel}>{label}</div>
                        <textarea
                          value={value}
                          rows={2}
                          onChange={(e) => write(e.target.value)}
                          onFocus={() => {
                            // Select it on the canvas too, so the person can
                            // see which part of the artwork they are changing.
                            fabricRef.current?.setActiveObject(o)
                            fabricRef.current?.requestRenderAll()
                          }}
                          style={ST.fieldInput}
                        />
                        <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                          <button
                            style={ST.editFieldChip}
                            onClick={() => write(value.toUpperCase())}
                          >
                            ALL CAPS
                          </button>
                          <button
                            style={ST.editFieldChip}
                            onClick={() =>
                              write(
                                value
                                  .toLowerCase()
                                  .replace(/\b\w/g, (c) => c.toUpperCase())
                              )
                            }
                          >
                            Title Case
                          </button>
                        </div>
                      </div>
                    )
                  }

                  return (
                    <>
                      {marked.map((row) => field(row))}
                      {rest.length > 0 && (
                        <>
                          <div style={{ ...ST.groupLabel, marginTop: 14 }}>
                            {marked.length > 0
                              ? 'Other text on this design'
                              : 'Text on this design'}
                          </div>
                          <p style={ST.hint}>
                            Not set up as a form field by the designer, but it
                            is your copy — change it here rather than on the
                            artwork if you would rather not move anything.
                          </p>
                          {rest.map((row) => field(row))}
                        </>
                      )}
                    </>
                  )
                })()}
              </>
            ) : (
              <>
                <div style={ST.groupLabel}>Personalisation</div>
                <p style={ST.hint}>
                  Choose which of this design&apos;s layers a site user may
                  change. Everything else stays brand-protected.
                </p>
                {(() => {
                  // Pictures can be opened up now, and that is a change worth
                  // stating. This panel used to lock them: an editable image was
                  // a promise the storefront could not keep, because the only
                  // thing it offered a buyer was a text box, and typing into one
                  // does not replace a logo.
                  //
                  // A buyer now personalises on the canvas itself, so "editable"
                  // on a picture means what it says: they may put their own
                  // logo in this box. It still never becomes a *field* — the
                  // server rebuilds those from the text layers alone, and an
                  // uploaded logo travels with the artwork instead.
                  const rows = personalisableLayers
                  const open = rows.filter((r) => r.o.isEditableBySiteUser)
                  const locked = rows.length - open.length
                  if (rows.length === 0)
                    return (
                      <p style={ST.hint}>
                        Nothing on the canvas yet. Add a layer, or drag a merge
                        field below.
                      </p>
                    )
                  return (
                    <>
                      <div style={ST.personCount}>
                        <span style={{ color: '#0f766e', fontWeight: 700 }}>
                          {open.length} editable
                        </span>
                        <span style={ST.subtle}>·</span>
                        <span style={ST.subtle}>{locked} brand-protected</span>
                      </div>
                      <div style={ST.personList}>
                        {rows.map(({ o, owner, depth }) => {
                          const layerType = mapToLayerType(o)
                          const photo =
                            layerType === 'image' || layerType === 'logo'
                          const on = !!o.isEditableBySiteUser
                          const preview =
                            (o.text as string | undefined) ||
                            (o.layerName as string | undefined) ||
                            (o.customType as string | undefined) ||
                            o.type ||
                            'layer'
                          return (
                            <div
                              key={o.layerId || o.designId}
                              onClick={() => selectLayer(owner)}
                              title="Select this layer on the canvas"
                              style={{
                                ...ST.personRow,
                                marginLeft: depth * 10,
                                borderColor: on ? '#5eead4' : '#e5e7eb',
                                backgroundColor: on ? '#f0fdfa' : '#ffffff',
                              }}
                            >
                              <label
                                style={ST.personHead}
                                onClick={(e) => e.stopPropagation()}
                              >
                                <input
                                  type="checkbox"
                                  checked={on}
                                  onChange={(e) =>
                                    mutateObject(o, (t) => {
                                      t.isEditableBySiteUser = e.target.checked
                                      // A field with no label reaches the
                                      // storefront as a blank caption.
                                      if (e.target.checked && !t.layerLabel)
                                        t.layerLabel =
                                          (t.layerName as string) ||
                                          defaultNameFor(
                                            (t.customType as string) ||
                                              t.type ||
                                              'field'
                                          )
                                    })
                                  }
                                />
                                <span style={ST.personName}>
                                  {(o.layerLabel as string) ||
                                    (o.layerName as string) ||
                                    preview}
                                </span>
                                {photo && (
                                  <span
                                    style={ST.mergeTag}
                                    title="The buyer may replace this picture with their own"
                                  >
                                    logo
                                  </span>
                                )}
                                {!!o.fieldKey && (
                                  <span
                                    style={ST.mergeTag}
                                    title={`Bound to the "${
                                      FIELD_LABELS[o.fieldKey as string] ||
                                      o.fieldKey
                                    }" merge field`}
                                  >
                                    {o.fieldKey as string}
                                  </span>
                                )}
                              </label>
                              <div style={ST.personPreview}>{preview}</div>
                              {on && (
                                <div
                                  style={ST.personControls}
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  <select
                                    style={ST.personSelect}
                                    value={(o.fieldKey as string) || ''}
                                    onChange={(e) =>
                                      mutateObject(o, (t) => {
                                        t.fieldKey = e.target.value || undefined
                                      })
                                    }
                                  >
                                    <option value="">— free text —</option>
                                    {FIELD_KEY_OPTIONS.map((f) => (
                                      <option key={f.key} value={f.key}>
                                        {f.label}
                                      </option>
                                    ))}
                                  </select>
                                  <input
                                    style={ST.personSelect}
                                    value={(o.layerLabel as string) || ''}
                                    placeholder="Form label"
                                    onChange={(e) =>
                                      mutateObject(o, (t) => {
                                        t.layerLabel = e.target.value
                                      })
                                    }
                                  />
                                  <input
                                    style={ST.personSelect}
                                    value={(o.helperText as string) || ''}
                                    placeholder="Helper text (optional)"
                                    onChange={(e) =>
                                      mutateObject(o, (t) => {
                                        t.helperText = e.target.value
                                      })
                                    }
                                  />
                                  <label style={ST.personReq}>
                                    <input
                                      type="checkbox"
                                      checked={!!o.isRequired}
                                      onChange={(e) =>
                                        mutateObject(o, (t) => {
                                          t.isRequired = e.target.checked
                                        })
                                      }
                                    />
                                    <span>Required</span>
                                  </label>
                                </div>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    </>
                  )
                })()}

                <div style={{ ...ST.groupLabel, marginTop: 16 }}>
                  Merge fields
                </div>
                <p style={ST.hint}>
                  Drop a field to add a text layer already bound to it. Site
                  users fill these in when they order.
                </p>
                <div
                  style={{ display: 'flex', flexDirection: 'column', gap: 6 }}
                >
                  {FIELD_KEY_OPTIONS.map((f) => (
                    <div
                      key={f.key}
                      draggable
                      onDragStart={(e) => {
                        e.dataTransfer.setData('type', 'text')
                        e.dataTransfer.setData('fieldKey', f.key)
                        e.dataTransfer.effectAllowed = 'copy'
                      }}
                      style={ST.fieldChip}
                      title={f.defaultPlaceholder || f.label}
                    >
                      <span style={{ fontWeight: 600 }}>{f.label}</span>
                      <span style={{ ...ST.subtle, fontSize: '0.6rem' }}>
                        {f.key}
                      </span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </aside>

        {/* ─── 4. CANVAS ────────────────────────────────────────── */}
        {/* A column, because the sides bar sits above the artboard rather than
            over it: the frame below is `position: relative` and everything in
            it — rulers, the canvas itself — is absolutely placed to fill it, so
            a sibling in normal flow would be painted over and invisible. */}
        <div style={ST.canvasColumn}>
          {/* ─── Sides: front, and the backs it prints with ──────────
              Above the canvas rather than in a panel, because which side you
              are looking at is the single most important thing to be sure of
              while drawing on it. */}
          <div style={ST.sideBar}>
            <span style={ST.sideBarLabel}>Sides</span>
            <button
              onClick={() => void switchToSide(null)}
              style={activeBackId === null ? ST.sideTabOn : ST.sideTab}
              title="The front of this design"
            >
              Front
            </button>
            {backs.map((side) => {
              const on = side.id === activeBackId
              return (
                <span key={side.id} style={ST.sideTabWrap}>
                  <button
                    onClick={() => void switchToSide(side.id)}
                    onDoubleClick={() => setRenamingBackId(side.id)}
                    style={on ? ST.sideTabOn : ST.sideTab}
                    title="Click to edit this back — double-click to rename"
                  >
                    {renamingBackId === side.id ? (
                      <input
                        autoFocus
                        value={side.name}
                        onChange={(e) => renameBack(side.id, e.target.value)}
                        onBlur={() => setRenamingBackId(null)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === 'Escape')
                            setRenamingBackId(null)
                        }}
                        onClick={(e) => e.stopPropagation()}
                        style={ST.sideRenameInput}
                      />
                    ) : (
                      side.name
                    )}
                  </button>
                  {/*
                    Which back the buyer gets unless they pick another, and the
                    one Preview shows. Marked on every tab rather than only the
                    open one, because "which of these prints" is a question
                    about the set, and answering it only for whichever tab
                    happens to be selected would mean clicking through them to
                    find out.
                  */}
                  {backs.length > 1 && (
                    <button
                      onClick={() => {
                        setDefaultBackId(side.id)
                        markDirtyRef.current?.()
                      }}
                      style={{
                        ...ST.sideAction,
                        color: isDefaultBack(side.id) ? '#f59e0b' : '#94a3b8',
                      }}
                      title={
                        isDefaultBack(side.id)
                          ? 'Shown in Preview, and what a buyer gets by default'
                          : 'Show this back in Preview, and give it to buyers by default'
                      }
                    >
                      <Star
                        size={11}
                        fill={isDefaultBack(side.id) ? '#f59e0b' : 'none'}
                      />
                    </button>
                  )}
                  {on && (
                    <>
                      <button
                        onClick={() => duplicateBack(side.id)}
                        style={ST.sideAction}
                        title="Duplicate this back"
                      >
                        <Copy size={11} />
                      </button>
                      <button
                        onClick={() => removeBack(side.id)}
                        style={{ ...ST.sideAction, color: '#dc2626' }}
                        title="Delete this back"
                      >
                        <Trash2 size={11} />
                      </button>
                    </>
                  )}
                </span>
              )
            })}
            <button
              onClick={addBack}
              style={ST.sideAdd}
              title="Add another back a buyer can choose from"
            >
              <Plus size={12} /> Add back
            </button>
            {backs.length > 0 && (
              <span style={ST.sideBarHint}>
                {backs.length === 1
                  ? 'The buyer prints this back'
                  : `The buyer picks one of ${backs.length} — ★ is the default`}
              </span>
            )}
          </div>

          <div ref={canvasFrameRef} style={ST.canvasFrame}>
            {showRulers && (
              <>
                {/* Corner: click to cycle the ruler unit */}
                <button
                  onClick={() =>
                    setRulerUnit((u) =>
                      u === 'in' ? 'mm' : u === 'mm' ? 'px' : 'in'
                    )
                  }
                  title="Click to switch ruler units"
                  style={ST.rulerCorner}
                >
                  {rulerUnit}
                </button>
                {/* Drag off a ruler to drop a guide */}
                <canvas
                  ref={rulerHRef}
                  onMouseDown={() => setGuideDrag('h')}
                  title="Drag down to add a horizontal guide"
                  style={{ ...ST.rulerH, cursor: 'ns-resize' }}
                />
                <canvas
                  ref={rulerVRef}
                  onMouseDown={() => setGuideDrag('v')}
                  title="Drag right to add a vertical guide"
                  style={{ ...ST.rulerV, cursor: 'ew-resize' }}
                />
              </>
            )}

            <div
              ref={wrapperRef}
              style={{
                ...ST.canvasArea,
                top: showRulers ? 22 : 0,
                left: showRulers ? 22 : 0,
                cursor: spacePanning ? 'grab' : undefined,
              }}
              onDragOver={handleDragOver}
              onDrop={handleDrop}
              onContextMenu={(e) => openContextMenu(e)}
              onMouseUp={(e) =>
                guideDrag && finishGuideDrag(e.clientX, e.clientY)
              }
            >
              <canvas ref={canvasRef} />
            </div>

            {/* Remove BG at work: a sweep of light over the picture. A sibling
                of the canvas area rather than a child, which fabric rewraps. */}
            {bgOverlay && (
              <div
                data-bg-working=""
                style={{
                  ...ST.bgWorkLayer,
                  top: showRulers ? 22 : 0,
                  left: showRulers ? 22 : 0,
                }}
              >
                <style>{BG_WORK_KEYFRAMES}</style>
                <div
                  data-bg-working-box=""
                  style={{
                    ...ST.bgWorkBox,
                    left: bgOverlay.x,
                    top: bgOverlay.y,
                    width: bgOverlay.w,
                    height: bgOverlay.h,
                    transform: `translate(-50%, -50%) rotate(${bgOverlay.angle}deg)`,
                  }}
                >
                  <div style={ST.bgWorkSweep} />
                </div>
                <div
                  role="status"
                  aria-live="polite"
                  style={{
                    ...ST.bgWorkBadge,
                    left: bgOverlay.x,
                    top: bgOverlay.y,
                  }}
                >
                  <Loader2
                    size={14}
                    style={{ animation: 'spin 0.9s linear infinite' }}
                  />
                  Removing background…
                </div>
              </div>
            )}

            {/* Right-click menu */}
            {menu && (
              <div
                style={{ ...ST.ctxMenu, left: menu.x, top: menu.y }}
                onClick={(e) => e.stopPropagation()}
                onContextMenu={(e) => e.preventDefault()}
              >
                {(
                  [
                    [
                      'Bring to front',
                      () => arrangeSelected('front'),
                      !activeObj,
                    ],
                    [
                      'Bring forward',
                      () => arrangeSelected('forward'),
                      !activeObj,
                    ],
                    [
                      'Send backward',
                      () => arrangeSelected('backward'),
                      !activeObj,
                    ],
                    ['Send to back', () => arrangeSelected('back'), !activeObj],
                    ['---', null, false],
                    ['Group', doGroup, selectedIds.length < 2],
                    ['Ungroup', () => doUngroup(), activeObj?.type !== 'group'],
                    ['---', null, false],
                    ['Create mask', doCreateMask, selectedIds.length !== 2],
                    ['Release mask', doReleaseMask, !hasMask(activeObj)],
                    ['---', null, false],
                    [
                      'Distribute horizontally',
                      () => distributeSelected('horizontal'),
                      selectedIds.length < 3,
                    ],
                    [
                      'Distribute vertically',
                      () => distributeSelected('vertical'),
                      selectedIds.length < 3,
                    ],
                    ['---', null, false],
                    ['Copy', copySelected, !activeObj],
                    ['Paste', pasteClipboard, clipboardCount === 0],
                    ['Duplicate', duplicateSelected, !activeObj],
                    ['Delete', deleteSelected, !activeObj],
                  ] as [string, (() => void) | null, boolean][]
                ).map(([label, action, disabled], i) =>
                  label === '---' ? (
                    <div key={`sep-${i}`} style={ST.ctxSep} />
                  ) : (
                    <button
                      key={label}
                      disabled={disabled}
                      onClick={() => {
                        action?.()
                        closeContextMenu()
                      }}
                      style={{
                        ...ST.ctxItem,
                        color: disabled
                          ? '#cbd5e1'
                          : label === 'Delete'
                            ? '#ef4444'
                            : '#334155',
                        cursor: disabled ? 'default' : 'pointer',
                      }}
                    >
                      {label}
                    </button>
                  )
                )}
              </div>
            )}

            {/* Text toolbar: a floating overlay, deliberately NOT part of the
              column layout. Animating its height resized the canvas wrapper on
              every frame, and each resize clears and repaints the canvas bitmap
              - that was the blink on every selection change. As an overlay the
              canvas geometry never changes, so showing it costs only a fade. */}
            <div style={{ ...ST.textBarDock, top: showRulers ? 30 : 8 }}>
              <div
                aria-hidden={!isText}
                style={{
                  ...ST.textBar,
                  opacity: isText ? 1 : 0,
                  // `none` when settled, so the bar is not promoted to its own
                  // composited layer and its text keeps subpixel antialiasing.
                  transform: isText ? 'none' : 'translateY(-10px) scale(0.985)',
                  visibility: isText ? 'visible' : 'hidden',
                  pointerEvents: isText ? 'auto' : 'none',
                }}
              >
                <select
                  value={textProp<string>('fontFamily', 'Inter')}
                  onChange={(e) => setTextProp('fontFamily', e.target.value)}
                  title="Font"
                  style={{ ...ST.textSelect, minWidth: 132 }}
                >
                  {FONT_OPTIONS.map((f) => (
                    <option key={f} value={f} style={{ fontFamily: f }}>
                      {f}
                    </option>
                  ))}
                </select>

                <div style={ST.sep} />

                <select
                  value={
                    FONT_SIZES.includes(effectiveFontSize())
                      ? effectiveFontSize()
                      : ''
                  }
                  onChange={(e) =>
                    e.target.value && setFontSize(Number(e.target.value))
                  }
                  title="Font size"
                  style={{ ...ST.textSelect, width: 64 }}
                >
                  {!FONT_SIZES.includes(effectiveFontSize()) && (
                    <option value="">{effectiveFontSize()}</option>
                  )}
                  {FONT_SIZES.map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
                <IconButton
                  title="Decrease font size"
                  onClick={() => stepFontSize(-1)}
                >
                  <span style={ST.sizeGlyphSmall}>A</span>
                </IconButton>
                <IconButton
                  title="Increase font size"
                  onClick={() => stepFontSize(1)}
                >
                  <span style={ST.sizeGlyphBig}>A</span>
                </IconButton>

                <div style={ST.sep} />

                <IconButton
                  title="Bold"
                  onClick={() =>
                    setTextProp(
                      'fontWeight',
                      String(textProp('fontWeight', 'normal')) === 'bold'
                        ? 'normal'
                        : 'bold'
                    )
                  }
                  active={String(textProp('fontWeight', 'normal')) === 'bold'}
                >
                  <span style={{ fontWeight: 800, fontSize: 13 }}>B</span>
                </IconButton>
                <IconButton
                  title="Italic"
                  onClick={() =>
                    setTextProp(
                      'fontStyle',
                      textProp<string>('fontStyle', 'normal') === 'italic'
                        ? 'normal'
                        : 'italic'
                    )
                  }
                  active={textProp<string>('fontStyle', 'normal') === 'italic'}
                >
                  <span
                    style={{
                      fontStyle: 'italic',
                      fontWeight: 700,
                      fontSize: 13,
                    }}
                  >
                    I
                  </span>
                </IconButton>
                <IconButton
                  title="Underline"
                  onClick={() => toggleTextProp('underline')}
                  active={textProp('underline', false)}
                >
                  <span
                    style={{
                      textDecoration: 'underline',
                      fontWeight: 700,
                      fontSize: 13,
                    }}
                  >
                    U
                  </span>
                </IconButton>
                <IconButton
                  title="Strikethrough"
                  onClick={() => toggleTextProp('linethrough')}
                  active={textProp('linethrough', false)}
                >
                  <span
                    style={{
                      textDecoration: 'line-through',
                      fontWeight: 700,
                      fontSize: 13,
                    }}
                  >
                    S
                  </span>
                </IconButton>

                <div style={ST.sep} />

                {/* Text colour */}
                <label style={ST.textColorWrap} title="Text colour">
                  <span
                    style={{ fontWeight: 800, fontSize: 12, lineHeight: 1 }}
                  >
                    A
                  </span>
                  <span
                    style={{
                      ...ST.textColorBar,
                      backgroundColor: String(textProp('fill', '#000000')),
                    }}
                  />
                  <input
                    type="color"
                    value={
                      /^#[0-9a-f]{6}$/i.test(
                        String(textProp('fill', '#000000'))
                      )
                        ? String(textProp('fill', '#000000'))
                        : '#000000'
                    }
                    onChange={(e) =>
                      setTextProp('fill', e.target.value, 'soon')
                    }
                    style={ST.hiddenColor}
                  />
                </label>

                {/* Highlight */}
                <label style={ST.textColorWrap} title="Highlight colour">
                  <Highlighter size={13} />
                  <span
                    style={{
                      ...ST.textColorBar,
                      backgroundColor:
                        String(textProp('textBackgroundColor', '')) ||
                        'transparent',
                      backgroundImage: textProp('textBackgroundColor', '')
                        ? undefined
                        : 'linear-gradient(45deg,transparent 45%,#ef4444 45%,#ef4444 55%,transparent 55%)',
                    }}
                  />
                  <input
                    type="color"
                    value={
                      /^#[0-9a-f]{6}$/i.test(
                        String(textProp('textBackgroundColor', ''))
                      )
                        ? String(textProp('textBackgroundColor', ''))
                        : '#ffff00'
                    }
                    onChange={(e) =>
                      setTextProp('textBackgroundColor', e.target.value, 'soon')
                    }
                    style={ST.hiddenColor}
                  />
                </label>
                <IconButton
                  title="Clear highlight"
                  onClick={() => setTextProp('textBackgroundColor', '')}
                >
                  <Eraser size={15} />
                </IconButton>

                <div style={ST.sep} />

                {(['left', 'center', 'right', 'justify'] as const).map((a) => (
                  <IconButton
                    key={a}
                    title={`Align ${a}`}
                    onClick={() => setTextProp('textAlign', a)}
                    active={textProp('textAlign', 'left') === a}
                  >
                    {a === 'left' ? (
                      <AlignLeft size={15} />
                    ) : a === 'center' ? (
                      <AlignCenter size={15} />
                    ) : a === 'right' ? (
                      <AlignRight size={15} />
                    ) : (
                      <AlignJustify size={15} />
                    )}
                  </IconButton>
                ))}

                <div style={ST.sep} />

                <span style={ST.textBarLabel}>Spacing</span>
                <input
                  type="number"
                  step={10}
                  value={Math.round(textProp<number>('charSpacing', 0))}
                  onChange={(e) =>
                    setTextProp(
                      'charSpacing',
                      Number(e.target.value) || 0,
                      'soon'
                    )
                  }
                  title="Letter spacing (1/1000 em)"
                  style={ST.textNum}
                />
                <span style={ST.textBarLabel}>Line</span>
                <input
                  type="number"
                  step={0.05}
                  min={0.5}
                  max={4}
                  value={Number(
                    textProp<number>('lineHeight', 1.16).toFixed(2)
                  )}
                  onChange={(e) =>
                    setTextProp(
                      'lineHeight',
                      Number(e.target.value) || 1.16,
                      'soon'
                    )
                  }
                  title="Line height"
                  style={ST.textNum}
                />

                <div style={ST.sep} />

                {/* Format and Effects open menus, like the fill palette does,
                    rather than adding a dozen controls to a bar that already
                    scrolls. */}
                <button
                  type="button"
                  data-text-menu-trigger=""
                  title="Format"
                  aria-haspopup="dialog"
                  aria-expanded={textMenuOpen?.kind === 'format'}
                  onClick={(e) => toggleTextMenu('format', e.currentTarget)}
                  style={{
                    ...ST.textMenuBtn,
                    ...(textMenuOpen?.kind === 'format' ||
                    currentCase !== 'none'
                      ? ST.textMenuBtnOn
                      : null),
                  }}
                >
                  <CaseSensitive size={15} />
                  Format
                </button>
                <button
                  type="button"
                  data-text-menu-trigger=""
                  title="Effects"
                  aria-haspopup="dialog"
                  aria-expanded={textMenuOpen?.kind === 'effects'}
                  onClick={(e) => toggleTextMenu('effects', e.currentTarget)}
                  style={{
                    ...ST.textMenuBtn,
                    ...(textMenuOpen?.kind === 'effects' ||
                    currentEffect.kind !== 'none'
                      ? ST.textMenuBtnOn
                      : null),
                  }}
                >
                  <Sparkles size={14} />
                  Effects
                </button>
              </div>
            </div>

            {/* Image toolbar: the same floating overlay as the text one, for a
                picture or an empty upload space. */}
            <div style={{ ...ST.textBarDock, top: showRulers ? 30 : 8 }}>
              <div
                aria-hidden={!showImageBar}
                style={{
                  ...ST.textBar,
                  opacity: showImageBar ? 1 : 0,
                  transform: showImageBar
                    ? 'none'
                    : 'translateY(-10px) scale(0.985)',
                  visibility: showImageBar ? 'visible' : 'hidden',
                  pointerEvents: showImageBar ? 'auto' : 'none',
                }}
              >
                {cropping ? (
                  <>
                    <span style={ST.textBarLabel}>
                      Drag the blue box over the part to keep
                    </span>
                    <div style={ST.sep} />
                    <button
                      type="button"
                      onClick={applyCrop}
                      style={{ ...ST.textMenuBtn, ...ST.textMenuBtnOn }}
                    >
                      <Check size={14} />
                      Apply crop
                    </button>
                    <button
                      type="button"
                      onClick={cancelCrop}
                      style={ST.textMenuBtn}
                    >
                      <X size={14} />
                      Cancel
                    </button>
                  </>
                ) : !isPhotoBitmap ? (
                  <>
                    <button
                      type="button"
                      onClick={() => activeObj && openImagePicker(activeObj)}
                      style={{ ...ST.textMenuBtn, ...ST.textMenuBtnOn }}
                    >
                      <ImageUp size={15} />
                      Upload image
                    </button>
                    {canBrowseDam && (
                      <button
                        type="button"
                        title="Choose a picture from the image library"
                        onClick={() => activeObj && openImageLibrary(activeObj)}
                        style={ST.textMenuBtn}
                      >
                        <Images size={14} />
                        Library
                      </button>
                    )}
                    <span style={ST.textBarLabel}>
                      Fill, fit, crop and adjust once a picture is in this space
                    </span>
                  </>
                ) : (
                  <>
                    <button
                      type="button"
                      title="Fill the frame — the edges are cropped"
                      aria-pressed={imageFit === 'fill'}
                      onClick={fillImage}
                      style={{
                        ...ST.textMenuBtn,
                        ...(imageFit === 'fill' ? ST.textMenuBtnOn : null),
                      }}
                    >
                      <Expand size={14} />
                      Fill
                    </button>
                    <button
                      type="button"
                      title="Fit the whole picture inside the frame"
                      aria-pressed={imageFit === 'fit'}
                      onClick={fitImage}
                      style={{
                        ...ST.textMenuBtn,
                        ...(imageFit === 'fit' ? ST.textMenuBtnOn : null),
                      }}
                    >
                      <Minimize2 size={14} />
                      Fit
                    </button>

                    <div style={ST.sep} />

                    <button
                      type="button"
                      title="Crop the picture"
                      onClick={startCrop}
                      style={ST.textMenuBtn}
                    >
                      <Crop size={14} />
                      Crop
                    </button>
                    <button
                      type="button"
                      data-text-menu-trigger=""
                      title="Remove the background"
                      aria-haspopup="dialog"
                      aria-expanded={textMenuOpen?.kind === 'removebg'}
                      onClick={(e) => {
                        // Start fetching the model while the menu is read, so
                        // the first cut-out does not wait for the download.
                        if (textMenuOpen?.kind !== 'removebg')
                          preloadBackgroundModel()
                        toggleTextMenu('removebg', e.currentTarget)
                      }}
                      style={{
                        ...ST.textMenuBtn,
                        ...(textMenuOpen?.kind === 'removebg' ||
                        activeObj?.bgOriginalSrc
                          ? ST.textMenuBtnOn
                          : null),
                      }}
                    >
                      <WandSparkles size={14} />
                      Remove BG
                    </button>
                    <button
                      type="button"
                      data-text-menu-trigger=""
                      title="Adjust hue, saturation and brightness"
                      aria-haspopup="dialog"
                      aria-expanded={textMenuOpen?.kind === 'adjust'}
                      onClick={(e) => toggleTextMenu('adjust', e.currentTarget)}
                      style={{
                        ...ST.textMenuBtn,
                        ...(textMenuOpen?.kind === 'adjust' || imageAdjusted
                          ? ST.textMenuBtnOn
                          : null),
                      }}
                    >
                      <SlidersHorizontal size={14} />
                      Adjust
                    </button>

                    <div style={ST.sep} />

                    <button
                      type="button"
                      title="Replace the picture, keeping its place"
                      onClick={() => activeObj && openImagePicker(activeObj)}
                      style={ST.textMenuBtn}
                    >
                      <Replace size={14} />
                      Replace
                    </button>
                    {canBrowseDam && (
                      <button
                        type="button"
                        title="Replace with a picture from the image library"
                        onClick={() => activeObj && openImageLibrary(activeObj)}
                        style={ST.textMenuBtn}
                      >
                        <Images size={14} />
                        Library
                      </button>
                    )}

                    <div style={ST.sep} />

                    <button
                      type="button"
                      data-text-menu-trigger=""
                      title="Opacity"
                      aria-label="Opacity"
                      aria-haspopup="dialog"
                      aria-expanded={textMenuOpen?.kind === 'opacity'}
                      onClick={(e) =>
                        toggleTextMenu('opacity', e.currentTarget)
                      }
                      style={{
                        ...ST.textMenuBtn,
                        ...(textMenuOpen?.kind === 'opacity' ||
                        imageOpacity < 100
                          ? ST.textMenuBtnOn
                          : null),
                      }}
                    >
                      <TransparencyIcon />
                    </button>

                    <div style={ST.sep} />

                    <button
                      type="button"
                      title="Rotate"
                      aria-label="Rotate"
                      onClick={rotateImage}
                      style={ST.textMenuBtn}
                    >
                      <RotateCwSquare size={15} />
                    </button>
                  </>
                )}
              </div>
            </div>

            {/* ── Format menu: letter case ── */}
            {textMenuOpen?.kind === 'format' && (
              <div
                ref={textMenuRef}
                role="dialog"
                aria-label="Text format"
                style={{
                  ...ST.textMenu,
                  width: FORMAT_MENU_WIDTH,
                  left: textMenuOpen.left,
                  top: textMenuOpen.top,
                }}
              >
                <div style={ST.textMenuRow}>
                  <span style={ST.textMenuLabel}>Case</span>
                  <div
                    role="radiogroup"
                    aria-label="Letter case"
                    style={ST.textMenuSeg}
                  >
                    {TEXT_CASES.map((option) => {
                      const on = currentCase === option.value
                      return (
                        <button
                          key={option.value}
                          type="button"
                          role="radio"
                          aria-checked={on}
                          title={option.title}
                          onClick={() => setTextCase(option.value)}
                          style={{
                            ...ST.textMenuCaseBtn,
                            ...(on ? ST.textMenuCaseBtnOn : null),
                          }}
                        >
                          {option.glyph}
                        </button>
                      )
                    })}
                  </div>
                </div>
                <p style={ST.textMenuHint}>
                  The text keeps what was typed; &ldquo;Aa&rdquo; shows it as
                  typed again.
                </p>
              </div>
            )}

            {/* ── Effects menu: presets, then the chosen one's settings ── */}
            {textMenuOpen?.kind === 'effects' && (
              <div
                ref={textMenuRef}
                role="dialog"
                aria-label="Text effects"
                style={{
                  ...ST.textMenu,
                  width: EFFECTS_MENU_WIDTH,
                  left: textMenuOpen.left,
                  top: textMenuOpen.top,
                }}
              >
                <div style={ST.effectGrid}>
                  {TEXT_EFFECTS.map((effect) => {
                    const on = currentEffect.kind === effect.kind
                    return (
                      <button
                        key={effect.kind}
                        type="button"
                        aria-pressed={on}
                        title={effect.label}
                        onClick={() => applyEffect(effect.kind)}
                        style={{
                          ...ST.effectTile,
                          ...(on ? ST.effectTileOn : null),
                        }}
                      >
                        <span
                          style={{
                            ...ST.effectSwatch,
                            ...effectPreviewStyle(effect.kind),
                          }}
                        >
                          Ag
                        </span>
                        <span style={ST.effectLabel}>{effect.label}</span>
                      </button>
                    )
                  })}
                </div>

                {(() => {
                  const meta = TEXT_EFFECTS.find(
                    (effect) => effect.kind === currentEffect.kind
                  )
                  if (!meta || meta.kind === 'none') return null
                  return (
                    <div style={ST.effectControls}>
                      {meta.color && (
                        <label style={ST.textMenuRow}>
                          <span style={ST.textMenuLabel}>Colour</span>
                          <input
                            type="color"
                            value={
                              /^#[0-9a-f]{6}$/i.test(currentEffect.color)
                                ? currentEffect.color
                                : '#000000'
                            }
                            onChange={(e) =>
                              applyEffect(meta.kind, { color: e.target.value })
                            }
                            style={ST.colorWell}
                          />
                        </label>
                      )}
                      {meta.intensity && (
                        <label style={ST.textMenuRow}>
                          <span style={ST.textMenuLabel}>Intensity</span>
                          <input
                            type="range"
                            min={0}
                            max={100}
                            value={currentEffect.intensity}
                            onChange={(e) =>
                              applyEffect(meta.kind, {
                                intensity: Number(e.target.value),
                              })
                            }
                            style={{ flex: 1, minWidth: 0 }}
                          />
                          <span style={ST.textMenuValue}>
                            {currentEffect.intensity}
                          </span>
                        </label>
                      )}
                    </div>
                  )
                })()}

                <p style={ST.textMenuHint}>
                  Fine-tune the shadow and outline in the Style panel.
                </p>
              </div>
            )}

            {/* ── Adjust menu: hue, saturation, brightness ── */}
            {textMenuOpen?.kind === 'adjust' && (
              <div
                ref={textMenuRef}
                role="dialog"
                aria-label="Adjust picture"
                style={{
                  ...ST.textMenu,
                  width: MENU_WIDTHS.adjust,
                  left: textMenuOpen.left,
                  top: textMenuOpen.top,
                }}
              >
                {IMAGE_ADJUSTMENTS.map((row) => {
                  const value =
                    (filtersOf()[row.key] as number | undefined) ?? 0
                  return (
                    <div key={row.key} style={ST.adjustRow}>
                      <span style={ST.adjustLabel}>{row.label}</span>
                      <div style={ST.textMenuRow}>
                        <div style={ST.adjustSlider}>
                          <div
                            aria-hidden="true"
                            style={{ ...ST.adjustTrack, background: row.track }}
                          />
                          <input
                            type="range"
                            min={row.min}
                            max={row.max}
                            step={row.step}
                            value={value}
                            aria-label={row.label}
                            onChange={(e) =>
                              setFilter(row.key, Number(e.target.value))
                            }
                            style={ST.adjustRange}
                          />
                        </div>
                        <button
                          type="button"
                          title={`Reset ${row.label.toLowerCase()}`}
                          aria-label={`Reset ${row.label.toLowerCase()}`}
                          disabled={value === 0}
                          onClick={() => resetFilter(row.key)}
                          style={{
                            ...ST.adjustReset,
                            opacity: value === 0 ? 0.4 : 1,
                          }}
                        >
                          <RotateCcw size={13} />
                        </button>
                        <input
                          type="number"
                          min={row.min}
                          max={row.max}
                          step={row.step}
                          value={Number(value.toFixed(2))}
                          aria-label={`${row.label} value`}
                          onChange={(e) => {
                            const next = Number(e.target.value)
                            if (!Number.isFinite(next)) return
                            setFilter(
                              row.key,
                              Math.min(row.max, Math.max(row.min, next))
                            )
                          }}
                          style={ST.adjustNumber}
                        />
                      </div>
                    </div>
                  )
                })}
              </div>
            )}

            {/* ── Opacity menu ── */}
            {textMenuOpen?.kind === 'opacity' && activeObj && (
              <div
                ref={textMenuRef}
                role="dialog"
                aria-label="Opacity"
                style={{
                  ...ST.textMenu,
                  width: MENU_WIDTHS.opacity,
                  left: textMenuOpen.left,
                  top: textMenuOpen.top,
                }}
              >
                <div style={ST.adjustRow}>
                  <span style={ST.adjustLabel}>Opacity</span>
                  <div style={ST.textMenuRow}>
                    <div style={ST.adjustSlider}>
                      <div
                        aria-hidden="true"
                        style={{
                          ...ST.adjustTrack,
                          background:
                            'linear-gradient(to right, rgba(17,24,39,0.04), #111827)',
                        }}
                      />
                      <input
                        type="range"
                        min={0}
                        max={100}
                        step={1}
                        value={imageOpacity}
                        aria-label="Opacity"
                        onChange={(e) =>
                          setLayerOpacity(activeObj, Number(e.target.value))
                        }
                        style={ST.adjustRange}
                      />
                    </div>
                    <button
                      type="button"
                      title="Reset opacity"
                      aria-label="Reset opacity"
                      disabled={imageOpacity === 100}
                      onClick={() => setLayerOpacity(activeObj, 100)}
                      style={{
                        ...ST.adjustReset,
                        opacity: imageOpacity === 100 ? 0.4 : 1,
                      }}
                    >
                      <RotateCcw size={13} />
                    </button>
                    <input
                      type="number"
                      min={0}
                      max={100}
                      step={1}
                      value={imageOpacity}
                      aria-label="Opacity value"
                      onChange={(e) => {
                        const next = Number(e.target.value)
                        if (Number.isFinite(next))
                          setLayerOpacity(activeObj, next)
                      }}
                      style={ST.adjustNumber}
                    />
                  </div>
                </div>
              </div>
            )}

            {/* ── Remove background menu ── */}
            {textMenuOpen?.kind === 'removebg' && (
              <div
                ref={textMenuRef}
                role="dialog"
                aria-label="Remove background"
                style={{
                  ...ST.textMenu,
                  width: MENU_WIDTHS.removebg,
                  left: textMenuOpen.left,
                  top: textMenuOpen.top,
                }}
              >
                <div
                  role="radiogroup"
                  aria-label="What to remove"
                  style={ST.textMenuSeg}
                >
                  {(
                    [
                      ['subject', 'Cut out subject'],
                      ['colour', 'Plain colour'],
                    ] as const
                  ).map(([mode, label]) => (
                    <button
                      key={mode}
                      type="button"
                      role="radio"
                      aria-checked={bgMode === mode}
                      disabled={bgBusy}
                      onClick={() => setBgMode(mode)}
                      style={{
                        ...ST.textMenuCaseBtn,
                        ...(bgMode === mode ? ST.textMenuCaseBtnOn : null),
                        fontSize: '0.72rem',
                      }}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <p style={{ ...ST.textMenuHint, color: '#4b5563' }}>
                  {bgMode === 'subject'
                    ? 'Finds the main subject — a person, a pet, a product — and removes everything behind it, stray bits included. Runs in your browser; the first cut-out downloads the model once.'
                    : 'Removes one plain colour around the edges — the sharpest result for a logo or a product shot on white. On a photo, the person or product in it is kept whole.'}
                </p>
                {bgMode === 'colour' && (
                  <label style={ST.textMenuRow}>
                    <span style={ST.textMenuLabel}>Tolerance</span>
                    <input
                      type="range"
                      min={0}
                      max={100}
                      value={bgTolerance}
                      onChange={(e) => setBgTolerance(Number(e.target.value))}
                      style={{ flex: 1, minWidth: 0 }}
                    />
                    <span style={ST.textMenuValue}>{bgTolerance}</span>
                  </label>
                )}
                <button
                  type="button"
                  disabled={bgBusy}
                  onClick={() => void removeImageBackground()}
                  style={{
                    ...ST.btnPrimary,
                    justifyContent: 'center',
                    opacity: bgBusy ? 0.7 : 1,
                  }}
                >
                  {bgBusy ? (
                    <>
                      <Loader2
                        size={14}
                        style={{ animation: 'spin 1s linear infinite' }}
                      />
                      {bgMode === 'subject' ? 'Cutting out…' : 'Working…'}
                    </>
                  ) : (
                    <>
                      <WandSparkles size={14} />
                      {activeObj?.bgOriginalSrc
                        ? 'Remove again'
                        : 'Remove background'}
                    </>
                  )}
                </button>
                {activeObj?.bgOriginalSrc && (
                  <button
                    type="button"
                    disabled={bgBusy}
                    onClick={() => void restoreImageBackground()}
                    style={{ ...ST.btnBlock, justifyContent: 'center' }}
                  >
                    <RotateCcw size={14} />
                    Restore original
                  </button>
                )}
                {bgMode === 'colour' && (
                  <p style={ST.textMenuHint}>
                    A higher tolerance removes more shades of the background
                    colour.
                  </p>
                )}
              </div>
            )}

            {guideDrag && (
              <div style={ST.guideHint}>
                Release over the canvas to drop a{' '}
                {guideDrag === 'h' ? 'horizontal' : 'vertical'} guide
              </div>
            )}
          </div>
        </div>

        {/* ─── 5. RIGHT SIDEBAR ─────────────────────────────────── */}
        <aside style={ST.rightPanel}>
          <div style={ST.tabRow}>
            <button
              onClick={() => setRightTab('style')}
              style={rightTab === 'style' ? ST.tabOn : ST.tabOff}
            >
              Style
            </button>
            {/* The Info tab is the template's own record - its name, the
                product it prints on, the sheet size. None of that is the
                buyer's to change: the order takes its product and its
                dimensions from the published template, so a control here would
                appear to resize something and then not. */}
            {!isCustomise && (
              <button
                onClick={() => setRightTab('info')}
                style={rightTab === 'info' ? ST.tabOn : ST.tabOff}
              >
                Info
              </button>
            )}
          </div>

          <div style={{ ...ST.panelScroll, padding: 16 }}>
            {rightTab === 'info' && !isCustomise ? (
              /* ── Template metadata ── */
              <>
                <Section title="Template">
                  <Field label="Name">
                    <input
                      style={ST.input}
                      value={template.name}
                      onChange={(e) => setMeta('name', e.target.value)}
                    />
                  </Field>
                  <Field label="Description">
                    <textarea
                      style={{ ...ST.input, minHeight: 64, resize: 'vertical' }}
                      value={template.description}
                      onChange={(e) => setMeta('description', e.target.value)}
                    />
                  </Field>
                  <Field label="Status">
                    <select
                      style={ST.input}
                      value={template.status}
                      onChange={(e) =>
                        setMeta(
                          'status',
                          e.target.value as PrintTemplate['status']
                        )
                      }
                    >
                      <option value="DRAFT">Draft</option>
                      {/* Publishing is what makes a design visible to other
                          people, so it is a head office decision. A site user
                          may build and edit endlessly in private; offering the
                          option and then having the server refuse it would be
                          a worse way to say so. The server refuses it either
                          way — this is the half that does not waste the
                          person's time. */}
                      {canPublish && (
                        <option value="PUBLISHED">Published</option>
                      )}
                      <option value="ARCHIVED">Archived</option>
                    </select>
                  </Field>
                  <Field label="Theme">
                    <select
                      style={ST.input}
                      value={template.theme}
                      onChange={(e) =>
                        setMeta('theme', e.target.value as TemplateTheme)
                      }
                    >
                      {THEME_OPTIONS.map((t) => (
                        <option key={t} value={t}>
                          {t}
                        </option>
                      ))}
                    </select>
                  </Field>
                </Section>

                <Section title="Product">
                  <Field label="Linked product">
                    <select
                      style={ST.input}
                      value={template.productId}
                      onChange={(e) => applyProduct(e.target.value)}
                      disabled={productsLoading}
                    >
                      <option value="">
                        {productsLoading
                          ? 'Loading catalogue…'
                          : '— choose a product —'}
                      </option>
                      {/* Keep an unknown/retired product visible rather than silently blank */}
                      {!!template.productId &&
                        !products.some((p) => p.id === template.productId) && (
                          <option value={template.productId}>
                            {template.productName || template.productId}
                          </option>
                        )}
                      {products.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.printCategory ? `${p.printCategory} — ` : ''}
                          {p.name}
                        </option>
                      ))}
                    </select>
                  </Field>

                  {productSizes.length > 0 && (
                    <Field label="Print size">
                      <select
                        style={ST.input}
                        value={activeSizeId}
                        onChange={(e) => applySize(e.target.value)}
                      >
                        {!activeSizeId && (
                          <option value="">
                            Custom ({template.aspectRatio})
                          </option>
                        )}
                        {productSizes.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.label}
                            {s.isPopular ? ' ★' : ''}
                          </option>
                        ))}
                      </select>
                    </Field>
                  )}

                  {!!activeProduct && (
                    <p style={ST.hint}>
                      {template.dimensions.width}&quot; ×{' '}
                      {template.dimensions.height}&quot; ·{' '}
                      {template.orientation} · {template.aspectRatio}
                      {activeProduct.turnaroundDays
                        ? ` · ${activeProduct.turnaroundDays}-day turnaround`
                        : ''}
                    </p>
                  )}

                  <Field label="Category">
                    <input
                      style={ST.input}
                      value={template.category}
                      onChange={(e) => setMeta('category', e.target.value)}
                    />
                  </Field>
                </Section>

                <Section title="Pricing">
                  <div style={ST.grid2}>
                    <Field label="Price per pack">
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        style={ST.input}
                        disabled={!canSetPrice}
                        value={template.price ?? ''}
                        onChange={(e) =>
                          setMeta(
                            'price',
                            e.target.value === ''
                              ? null
                              : Number(e.target.value)
                          )
                        }
                      />
                    </Field>
                    <Field label="Units per pack">
                      <input
                        type="number"
                        step="1"
                        min="1"
                        style={ST.input}
                        disabled={!canSetPrice || lockedPackSize != null}
                        value={unitsPerPack ?? ''}
                        onChange={(e) =>
                          setMeta(
                            'unitsPerPack',
                            e.target.value === ''
                              ? null
                              : Math.trunc(Number(e.target.value))
                          )
                        }
                      />
                    </Field>
                  </div>

                  <p style={ST.hint}>
                    {perUnitPrice !== null
                      ? `$${(template.price ?? 0).toFixed(2)} · $${perUnitPrice.toFixed(2)} each / ${unitsPerPack} units`
                      : canSetPrice
                        ? lockedPackSize != null
                          ? 'Set the pack price. It cannot be published until you do.'
                          : 'Set both to price this design. It cannot be published until you do.'
                        : 'Set by the print team. Whatever you change in the design, this is the price.'}
                  </p>

                  {lockedPackSize != null && activeProduct && (
                    <p style={ST.hint}>
                      Units per pack comes from the product:{' '}
                      {activeProduct.name} is stocked as &ldquo;
                      {activeProduct.packSize}&rdquo;. Change it on the product,
                      not here.
                    </p>
                  )}
                </Section>

                {/* What the design is printed on.
                    For a sheet there is nothing to show. For a cap, a t-shirt
                    or a tote, the artboard is one panel of the thing, and a
                    designer needs to see the thing. */}
                <Section title="Product mockup">
                  {mockup?.src ? (
                    <>
                      <div style={ST.mockupPreviewWrap}>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={mockup.src}
                          alt="Product mockup"
                          style={ST.mockupPreview}
                        />
                        {/* Where the printable panel lands on it. */}
                        <div
                          style={{
                            position: 'absolute',
                            left: `${mockup.area.x * 100}%`,
                            top: `${mockup.area.y * 100}%`,
                            width: `${mockup.area.width * 100}%`,
                            height: `${mockup.area.height * 100}%`,
                            border: '1.5px solid #2563eb',
                            backgroundColor: 'rgba(37,99,235,0.12)',
                            pointerEvents: 'none',
                          }}
                        />
                      </div>
                      <p style={ST.hint}>
                        The blue box is the printable area — the artboard sits
                        exactly there. Nudge it until it covers the panel that
                        is actually printed.
                      </p>
                      <div style={ST.grid2}>
                        <Field label="Left %">
                          <input
                            type="number"
                            step="1"
                            style={ST.input}
                            value={Math.round(mockup.area.x * 100)}
                            onChange={(e) =>
                              setMockupArea({ x: Number(e.target.value) / 100 })
                            }
                          />
                        </Field>
                        <Field label="Top %">
                          <input
                            type="number"
                            step="1"
                            style={ST.input}
                            value={Math.round(mockup.area.y * 100)}
                            onChange={(e) =>
                              setMockupArea({ y: Number(e.target.value) / 100 })
                            }
                          />
                        </Field>
                        <Field label="Width %">
                          <input
                            type="number"
                            step="1"
                            style={ST.input}
                            value={Math.round(mockup.area.width * 100)}
                            onChange={(e) =>
                              setMockupArea({
                                width: Number(e.target.value) / 100,
                              })
                            }
                          />
                        </Field>
                        <Field label="Height %">
                          <input
                            type="number"
                            step="1"
                            style={ST.input}
                            value={Math.round(mockup.area.height * 100)}
                            onChange={(e) =>
                              setMockupArea({
                                height: Number(e.target.value) / 100,
                              })
                            }
                          />
                        </Field>
                      </div>
                      <button
                        style={ST.btnBlock}
                        onClick={() => {
                          // A photo still uploading must not bring it back.
                          mockupSeqRef.current++
                          setMockup(undefined)
                          mockupRef.current = undefined
                          markDirtyRef.current?.()
                        }}
                      >
                        <Trash2 size={14} /> Remove mockup
                      </button>
                    </>
                  ) : (
                    <>
                      <p style={ST.hint}>
                        Printing onto a cap, a t-shirt or a bag? Put a photo of
                        it behind the artboard so the design is drawn in place
                        rather than on a blank rectangle.
                      </p>
                      <button
                        style={ST.btnBlock}
                        onClick={() => mockupFileRef.current?.click()}
                      >
                        <Upload size={14} /> Upload product photo
                      </button>
                      {canBrowseDam && (
                        <button
                          style={{ ...ST.btnBlock, marginTop: 6 }}
                          onClick={() => openImageLibrary('mockup')}
                        >
                          <Images size={14} /> Choose from image library
                        </button>
                      )}
                    </>
                  )}
                  <input
                    ref={mockupFileRef}
                    type="file"
                    accept="image/*"
                    hidden
                    onChange={(e) => {
                      const f = e.target.files?.[0]
                      if (f) handleMockupFile(f)
                      e.target.value = ''
                    }}
                  />

                  {/*
                    The turnaround set.

                    Addresses rather than files, unlike the single photo above,
                    and the difference is arithmetic: one photo inlined as a
                    data URL is a few hundred kilobytes in the document, while
                    twenty-four of them is more than the whole design is
                    allowed to weigh. These live wherever the shoot was
                    published and the document keeps the addresses.

                    Writes `frames` only. A designer attaching angles has not
                    changed the face they drew against, and the artboard is
                    anchored to that.
                  */}
                  <Field label="Turnaround angles">
                    <textarea
                      style={{ ...ST.input, minHeight: 76, fontSize: 11 }}
                      placeholder={
                        'One image address per line, in turn order.\nLeave empty for no 360 view.'
                      }
                      value={spinFrames.map((f) => f.src).join('\n')}
                      onChange={(e) => {
                        const srcs = e.target.value
                          .split('\n')
                          .map((line) => line.trim())
                          .filter(Boolean)
                        setMockup((prev) =>
                          prev
                            ? {
                                ...prev,
                                ...(srcs.length > 0
                                  ? { frames: srcs.map((src) => ({ src })) }
                                  : { frames: undefined }),
                              }
                            : prev
                        )
                        markDirtyRef.current?.()
                      }}
                    />
                  </Field>
                  <p style={ST.hint}>
                    {spinFrames.length >= 2
                      ? `${spinFrames.length} angles — Preview will let you drag to turn it.`
                      : spinFrames.length === 1
                        ? 'One angle is a picture, not a turn. Add at least two.'
                        : 'Photograph the garment every 15° or so for a smooth turn.'}
                  </p>
                </Section>

                <Section title="Print setup">
                  <div style={ST.grid2}>
                    <Field label="Width">
                      <input
                        type="number"
                        step="0.01"
                        style={ST.input}
                        value={template.dimensions.width}
                        onChange={(e) =>
                          setDims({ width: Number(e.target.value) || 0 })
                        }
                      />
                    </Field>
                    <Field label="Height">
                      <input
                        type="number"
                        step="0.01"
                        style={ST.input}
                        value={template.dimensions.height}
                        onChange={(e) =>
                          setDims({ height: Number(e.target.value) || 0 })
                        }
                      />
                    </Field>
                  </div>
                  <Field label="Unit">
                    <select
                      style={ST.input}
                      value={template.dimensions.unit}
                      onChange={(e) =>
                        setDims({
                          unit: e.target
                            .value as PrintTemplate['dimensions']['unit'],
                        })
                      }
                    >
                      <option value="in">inches</option>
                      <option value="mm">millimetres</option>
                      <option value="px">pixels</option>
                    </select>
                  </Field>
                  <div style={ST.grid2}>
                    <Field label={`Bleed (${template.dimensions.unit})`}>
                      <input
                        type="number"
                        step="0.01"
                        style={ST.input}
                        value={template.bleedMargin}
                        onChange={(e) =>
                          setMeta('bleedMargin', Number(e.target.value) || 0)
                        }
                      />
                    </Field>
                    <Field label={`Safe (${template.dimensions.unit})`}>
                      <input
                        type="number"
                        step="0.01"
                        style={ST.input}
                        value={template.safeMargin}
                        onChange={(e) =>
                          setMeta('safeMargin', Number(e.target.value) || 0)
                        }
                      />
                    </Field>
                  </div>

                  {/* Rescue for artwork drawn at another size.
                      Changing the sheet now brings the design with it, but a
                      template resized before that carries A4 objects on a card
                      and hangs off every edge. One click puts them back. */}
                  <button
                    style={ST.btnBlock}
                    title="Scale and centre everything on this side to fit inside the safe area"
                    onClick={fitArtworkToSheet}
                  >
                    <Crop size={14} /> Fit artwork to this sheet
                  </button>

                  {/* What the printer actually works to.
                      A template saved before the product's margins were set —
                      or before they changed — keeps its own, because moving a
                      safe area underneath artwork somebody has already placed
                      is not a thing to do quietly. Offered as one click
                      instead, with the numbers stated. */}
                  {(() => {
                    const p = products.find((x) => x.id === template.productId)
                    const want = p ? marginsFromProduct(p) : {}
                    const differs =
                      (want.bleedMargin !== undefined &&
                        Math.abs(want.bleedMargin - template.bleedMargin) >
                          0.001) ||
                      (want.safeMargin !== undefined &&
                        Math.abs(want.safeMargin - template.safeMargin) > 0.001)
                    if (!p || !differs) return null
                    const mm = (v?: number) =>
                      v === undefined ? '—' : `${Math.round(v * 25.4)}mm`
                    return (
                      <button
                        style={ST.btnBlock}
                        title={`Set this template's margins to the ones ${p.name} is printed to`}
                        onClick={() =>
                          setTemplate((prev) => ({ ...prev, ...want }))
                        }
                      >
                        Use {p.name.split('(')[0].trim()} margins · safe{' '}
                        {mm(want.safeMargin)}, bleed {mm(want.bleedMargin)}
                      </button>
                    )
                  })()}
                  <div style={ST.grid2}>
                    <Field label="Orientation">
                      <select
                        style={ST.input}
                        value={template.orientation}
                        onChange={(e) =>
                          setMeta(
                            'orientation',
                            e.target.value as PrintTemplate['orientation']
                          )
                        }
                      >
                        <option value="portrait">Portrait</option>
                        <option value="landscape">Landscape</option>
                        <option value="square">Square</option>
                      </select>
                    </Field>
                    <Field label="Aspect ratio">
                      <input
                        style={ST.input}
                        value={template.aspectRatio}
                        onChange={(e) => setMeta('aspectRatio', e.target.value)}
                      />
                    </Field>
                  </div>
                </Section>
              </>
            ) : !activeObj ? (
              /* ── Canvas properties (nothing selected) ── */
              <>
                <Section title="Canvas">
                  <div style={ST.grid2}>
                    <Field label={`Width (${template.dimensions.unit})`}>
                      <input
                        type="number"
                        step="0.01"
                        style={ST.input}
                        value={template.dimensions.width}
                        onChange={(e) =>
                          setDims({ width: Number(e.target.value) || 0 })
                        }
                      />
                    </Field>
                    <Field label={`Height (${template.dimensions.unit})`}>
                      <input
                        type="number"
                        step="0.01"
                        style={ST.input}
                        value={template.dimensions.height}
                        onChange={(e) =>
                          setDims({ height: Number(e.target.value) || 0 })
                        }
                      />
                    </Field>
                  </div>
                  <p style={ST.hint}>
                    {printAreaPx(template.dimensions).w} ×{' '}
                    {printAreaPx(template.dimensions).h} px at 96 dpi
                  </p>
                </Section>

                <Section title="Background">
                  <label style={ST.checkRow}>
                    <input
                      type="checkbox"
                      checked={bgTransparent}
                      onChange={(e) => setBgTransparent(e.target.checked)}
                    />
                    <span>Transparent background</span>
                  </label>
                  {bgTransparent && (
                    <p style={ST.hint}>
                      The chequerboard is editor-only — PNG and SVG export with
                      a genuinely transparent background. JPEG has no alpha
                      channel and will fall back to white.
                    </p>
                  )}
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      marginBottom: 10,
                      opacity: bgTransparent ? 0.4 : 1,
                      pointerEvents: bgTransparent ? 'none' : 'auto',
                    }}
                  >
                    <input
                      type="color"
                      value={
                        /^#[0-9a-f]{6}$/i.test(paFill) ? paFill : '#ffffff'
                      }
                      onChange={(e) => {
                        printAreaRef.current?.set('fill', e.target.value)
                        fabricRef.current?.requestRenderAll()
                        snapshotSoon()
                        bump()
                      }}
                      style={ST.colorWell}
                    />
                    <input
                      style={ST.input}
                      value={paFill}
                      onChange={(e) => {
                        printAreaRef.current?.set('fill', e.target.value)
                        fabricRef.current?.requestRenderAll()
                        snapshotSoon()
                        bump()
                      }}
                    />
                  </div>
                  <Swatches
                    onPick={(c) => {
                      printAreaRef.current?.set('fill', c)
                      fabricRef.current?.requestRenderAll()
                      snapshot()
                      bump()
                    }}
                  />
                </Section>

                <p style={ST.hint}>
                  Select a layer on the canvas to edit its properties.
                </p>
              </>
            ) : (
              /* ── Selected object properties ── */
              <>
                <Section title="Position & size">
                  <LiveGeometry
                    obj={activeObj}
                    ticker={liveTicker}
                    revision={revision}
                    mutate={mutateActive}
                  />
                </Section>

                {isText && (
                  <Section title="Text">
                    <p style={ST.hint}>
                      Font, size, weight, colour and highlight are in the text
                      toolbar above the canvas.
                    </p>
                    <div style={ST.grid2}>
                      <NumBox
                        label="Sp"
                        value={Math.round(textProp<number>('charSpacing', 0))}
                        onChange={(v) => setTextProp('charSpacing', v, 'soon')}
                      />
                      <NumBox
                        label="Lh"
                        value={Number(
                          textProp<number>('lineHeight', 1.16).toFixed(2)
                        )}
                        onChange={(v) =>
                          setTextProp('lineHeight', v > 0 ? v : 1.16, 'soon')
                        }
                      />
                    </div>
                    <Field label="Content">
                      <textarea
                        style={{
                          ...ST.input,
                          minHeight: 56,
                          resize: 'vertical',
                        }}
                        // What was typed; the canvas shows it in the chosen case.
                        value={rawTextOf(activeObj as FabricAny)}
                        onChange={(e) =>
                          mutateActive((o) =>
                            setTextKeepingCase(o, e.target.value)
                          )
                        }
                      />
                    </Field>
                    <Field label="Font">
                      <select
                        style={ST.input}
                        value={
                          (activeObj as unknown as fabric.IText).fontFamily ||
                          'Inter'
                        }
                        onChange={(e) =>
                          mutateActive(
                            (o) =>
                              (o as unknown as fabric.IText).set(
                                'fontFamily',
                                e.target.value
                              ),
                            'now'
                          )
                        }
                      >
                        {FONT_OPTIONS.map((f) => (
                          <option key={f} value={f}>
                            {f}
                          </option>
                        ))}
                      </select>
                    </Field>
                    <div style={ST.grid2}>
                      <Field label="Size">
                        <input
                          type="number"
                          style={ST.input}
                          value={Math.round(
                            ((activeObj as unknown as fabric.IText).fontSize ||
                              16) * (activeObj.scaleY || 1)
                          )}
                          onChange={(e) => {
                            const v = Number(e.target.value)
                            if (Number.isNaN(v)) return
                            mutateActive((o) => {
                              if (v <= 0) return
                              o.set({ scaleX: 1, scaleY: 1 })
                              ;(o as unknown as fabric.IText).set('fontSize', v)
                            })
                          }}
                        />
                      </Field>
                      <Field label="Weight">
                        <select
                          style={ST.input}
                          value={String(
                            (activeObj as unknown as fabric.IText).fontWeight ??
                              'normal'
                          )}
                          onChange={(e) =>
                            mutateActive(
                              (o) =>
                                (o as unknown as fabric.IText).set(
                                  'fontWeight',
                                  e.target.value
                                ),
                              'now'
                            )
                          }
                        >
                          <option value="normal">Normal</option>
                          <option value="bold">Bold</option>
                          <option value="600">Semi-bold</option>
                          <option value="800">Extra-bold</option>
                        </select>
                      </Field>
                    </div>
                    <Field label="Alignment">
                      <div style={{ display: 'flex', gap: 6 }}>
                        {(['left', 'center', 'right'] as const).map((a) => (
                          <button
                            key={a}
                            onClick={() =>
                              mutateActive(
                                (o) =>
                                  (o as unknown as fabric.IText).set(
                                    'textAlign',
                                    a
                                  ),
                                'now'
                              )
                            }
                            style={{
                              ...ST.segBtn,
                              ...((activeObj as unknown as fabric.IText)
                                .textAlign === a
                                ? ST.segBtnOn
                                : null),
                            }}
                          >
                            {a === 'left' ? (
                              <AlignLeft size={14} />
                            ) : a === 'center' ? (
                              <AlignCenter size={14} />
                            ) : (
                              <AlignRight size={14} />
                            )}
                          </button>
                        ))}
                        <button
                          onClick={() =>
                            mutateActive((o) => {
                              const t = o as unknown as fabric.IText
                              t.set(
                                'fontStyle',
                                t.fontStyle === 'italic' ? 'normal' : 'italic'
                              )
                            }, 'now')
                          }
                          style={{
                            ...ST.segBtn,
                            ...((activeObj as unknown as fabric.IText)
                              .fontStyle === 'italic'
                              ? ST.segBtnOn
                              : null),
                            fontStyle: 'italic',
                            fontWeight: 700,
                          }}
                        >
                          I
                        </button>
                      </div>
                    </Field>
                    <Field label="Colour">
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 8,
                        }}
                      >
                        <input
                          type="color"
                          value={
                            /^#[0-9a-f]{6}$/i.test(String(activeObj.fill))
                              ? String(activeObj.fill)
                              : '#000000'
                          }
                          onChange={(e) =>
                            mutateActive((o) => o.set('fill', e.target.value))
                          }
                          style={ST.colorWell}
                        />
                        <input
                          style={ST.input}
                          value={String(activeObj.fill ?? '')}
                          onChange={(e) =>
                            mutateActive((o) => o.set('fill', e.target.value))
                          }
                        />
                      </div>
                    </Field>
                    <Swatches
                      onPick={(c) =>
                        mutateActive((o) => o.set('fill', c), 'now')
                      }
                    />
                  </Section>
                )}

                {!isText && !isImage && (
                  <Section title="Appearance">
                    <Field label="Fill">
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 8,
                        }}
                      >
                        <input
                          type="color"
                          value={
                            /^#[0-9a-f]{6}$/i.test(String(activeObj.fill))
                              ? String(activeObj.fill)
                              : '#ffffff'
                          }
                          onChange={(e) =>
                            mutateActive((o) => o.set('fill', e.target.value))
                          }
                          style={ST.colorWell}
                        />
                        <input
                          style={ST.input}
                          value={String(activeObj.fill ?? '')}
                          onChange={(e) =>
                            mutateActive((o) => o.set('fill', e.target.value))
                          }
                          placeholder="transparent"
                        />
                      </div>
                    </Field>
                    <Field label="Stroke">
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 8,
                        }}
                      >
                        <input
                          type="color"
                          value={
                            /^#[0-9a-f]{6}$/i.test(String(activeObj.stroke))
                              ? String(activeObj.stroke)
                              : '#000000'
                          }
                          onChange={(e) =>
                            mutateActive((o) => o.set('stroke', e.target.value))
                          }
                          style={ST.colorWell}
                        />
                        <input
                          style={ST.input}
                          value={String(activeObj.stroke ?? '')}
                          onChange={(e) =>
                            mutateActive((o) => o.set('stroke', e.target.value))
                          }
                        />
                      </div>
                    </Field>
                    <div style={ST.grid2}>
                      <NumBox
                        label="Border"
                        value={activeObj.strokeWidth ?? 0}
                        onChange={(v) =>
                          mutateActive((o) =>
                            o.set('strokeWidth', Math.max(0, v))
                          )
                        }
                      />
                      <NumBox
                        label="Radius"
                        value={Math.round((activeObj as any).rx || 0)}
                        onChange={(v) =>
                          mutateActive((o) =>
                            o.set({
                              rx: Math.max(0, v),
                              ry: Math.max(0, v),
                            } as any)
                          )
                        }
                      />
                    </div>
                    <Swatches
                      onPick={(c) =>
                        mutateActive((o) => o.set('fill', c), 'now')
                      }
                    />
                  </Section>
                )}

                {isImageLayer && !isScannable && (
                  <Section title="Image">
                    <button
                      style={ST.btnBlock}
                      onClick={() => openImagePicker(activeObj)}
                    >
                      <Upload size={14} />
                      {isImage ? ' Replace image' : ' Choose image'}
                    </button>
                    {canBrowseDam && (
                      <button
                        style={{ ...ST.btnBlock, marginTop: 6 }}
                        onClick={() => openImageLibrary(activeObj)}
                      >
                        <Images size={14} /> From image library
                      </button>
                    )}
                    <p style={ST.hint}>
                      {isImage
                        ? canUploadDam
                          ? 'Double-click the image on the canvas to swap it. Uploads are stored in the image library and the design keeps their address.'
                          : 'Double-click the image on the canvas to swap it. Uploads embed as data URLs, so they survive save and reload.'
                        : 'This is a reserved space — double-click it on the canvas to pick a file, or leave it empty for the buyer to fill.'}
                    </p>

                    {/* What the empty box says.
                        The instruction belongs inside the space it applies to,
                        not in a panel the buyer has to find first. Only offered
                        while the box is empty: once there is a picture in it
                        there is nothing left to instruct. */}
                    {!isImage && (
                      <Field label="Message inside the box">
                        <input
                          style={ST.input}
                          value={
                            (activeObj.placeholderText as string) ??
                            DEFAULT_PLACEHOLDER_LABEL
                          }
                          placeholder={DEFAULT_PLACEHOLDER_LABEL}
                          onChange={(e) =>
                            mutateActive((o) => {
                              applyPlaceholderLabel(o, e.target.value)
                            }, 'soon')
                          }
                        />
                      </Field>
                    )}
                  </Section>
                )}

                {isScannable && (
                  <Section
                    title={
                      activeObj.customType === 'qrcode' ? 'QR code' : 'Barcode'
                    }
                  >
                    <Field label="Scan target">
                      <input
                        style={ST.input}
                        value={activeObj.scanUrl || ''}
                        onChange={(e) =>
                          updateScanPayload(activeObj, e.target.value)
                        }
                        placeholder={
                          activeObj.customType === 'qrcode'
                            ? 'https://example.com'
                            : '123456789'
                        }
                      />
                    </Field>
                    <p style={ST.hint}>
                      {activeObj.customType === 'barcode'
                        ? 'CODE128. The bitmap keeps its last valid value while you type.'
                        : 'Regenerates the QR bitmap as you type.'}
                    </p>
                  </Section>
                )}

                {/* ── Gradient fill (shapes only) ── */}
                {!isText && !isImage && (
                  <Section title="Gradient">
                    {(() => {
                      const g = gradientOf()
                      const css = (stops: Gradient['stops']) =>
                        stops
                          .map(
                            (st) =>
                              `${st.color} ${Math.round(st.offset * 100)}%`
                          )
                          .join(', ')
                      return (
                        <>
                          <div
                            style={{ display: 'flex', gap: 6, marginBottom: 8 }}
                          >
                            <button
                              onClick={() => applyGradient(null)}
                              style={{
                                ...ST.segBtn,
                                ...(!g ? ST.segBtnOn : null),
                              }}
                            >
                              Solid
                            </button>
                            <button
                              onClick={() =>
                                applyGradient({
                                  kind: 'linear',
                                  angle: g?.angle ?? 0,
                                  stops: g?.stops ?? [
                                    { offset: 0, color: '#3b82f6' },
                                    { offset: 1, color: '#ec4899' },
                                  ],
                                })
                              }
                              style={{
                                ...ST.segBtn,
                                ...(g?.kind === 'linear' ? ST.segBtnOn : null),
                              }}
                            >
                              Linear
                            </button>
                            <button
                              onClick={() =>
                                applyGradient({
                                  kind: 'radial',
                                  stops: g?.stops ?? [
                                    { offset: 0, color: '#ffffff' },
                                    { offset: 1, color: '#3b82f6' },
                                  ],
                                })
                              }
                              style={{
                                ...ST.segBtn,
                                ...(g?.kind === 'radial' ? ST.segBtnOn : null),
                              }}
                            >
                              Radial
                            </button>
                          </div>

                          {g && (
                            <>
                              <div
                                style={{
                                  height: 22,
                                  borderRadius: 4,
                                  borderWidth: 1,
                                  borderStyle: 'solid',
                                  borderColor: '#d1d5db',
                                  marginBottom: 8,
                                  background:
                                    g.kind === 'radial'
                                      ? `radial-gradient(circle, ${css(g.stops)})`
                                      : `linear-gradient(${g.angle ?? 0}deg, ${css(g.stops)})`,
                                }}
                              />
                              {g.kind === 'linear' && (
                                <Field label={`Angle — ${g.angle ?? 0}°`}>
                                  <input
                                    type="range"
                                    min={0}
                                    max={360}
                                    value={g.angle ?? 0}
                                    onChange={(e) =>
                                      applyGradient({
                                        ...g,
                                        angle: Number(e.target.value),
                                      })
                                    }
                                    style={{ width: '100%' }}
                                  />
                                </Field>
                              )}
                              {g.stops.map((st, i) => (
                                <div key={i} style={ST.stopRow}>
                                  <input
                                    type="color"
                                    value={
                                      /^#[0-9a-f]{6}$/i.test(st.color)
                                        ? st.color
                                        : '#000000'
                                    }
                                    onChange={(e) =>
                                      applyGradient({
                                        ...g,
                                        stops: g.stops.map((x, xi) =>
                                          xi === i
                                            ? { ...x, color: e.target.value }
                                            : x
                                        ),
                                      })
                                    }
                                    style={ST.colorWell}
                                  />
                                  <input
                                    type="range"
                                    min={0}
                                    max={100}
                                    value={Math.round(st.offset * 100)}
                                    onChange={(e) =>
                                      applyGradient({
                                        ...g,
                                        stops: g.stops.map((x, xi) =>
                                          xi === i
                                            ? {
                                                ...x,
                                                offset:
                                                  Number(e.target.value) / 100,
                                              }
                                            : x
                                        ),
                                      })
                                    }
                                    style={{ flex: 1, minWidth: 0 }}
                                  />
                                  {g.stops.length > 2 && (
                                    <MiniBtn
                                      title="Remove stop"
                                      danger
                                      onClick={() =>
                                        applyGradient({
                                          ...g,
                                          stops: g.stops.filter(
                                            (_, xi) => xi !== i
                                          ),
                                        })
                                      }
                                    >
                                      <X size={12} />
                                    </MiniBtn>
                                  )}
                                </div>
                              ))}
                              <button
                                style={ST.btnBlock}
                                onClick={() =>
                                  applyGradient({
                                    ...g,
                                    stops: [
                                      ...g.stops,
                                      { offset: 1, color: '#0f172a' },
                                    ].sort((a, b) => a.offset - b.offset),
                                  })
                                }
                              >
                                + Add stop
                              </button>
                            </>
                          )}
                        </>
                      )
                    })()}
                  </Section>
                )}

                {activeObj.type === 'polygon' && (
                  <Section title="Polygon">
                    <NumBox
                      label="Sides"
                      value={
                        ((activeObj as unknown as fabric.Polygon).points || [])
                          .length
                      }
                      onChange={(v) =>
                        mutateActive((o) => {
                          const poly = o as unknown as fabric.Polygon
                          const r = Math.max(4, o.getScaledWidth() / 2)
                          const pts = regularPolygonPoints(v, r)
                          poly.set({
                            points: pts as unknown as fabric.Point[],
                            width: r * 2,
                            height: r * 2,
                          })
                          poly.setCoords()
                          o.set('dirty', true as never)
                        }, 'now')
                      }
                    />
                    <p style={ST.hint}>Between 3 and 24 sides.</p>
                  </Section>
                )}

                {/* ── Stroke dash pattern ── */}
                {!isImage && (
                  <Section title="Stroke style">
                    <div style={{ display: 'flex', gap: 6 }}>
                      {(['solid', 'dashed', 'dotted'] as const).map((d) => (
                        <button
                          key={d}
                          onClick={() => setDash(d)}
                          style={{
                            ...ST.segBtn,
                            ...(dashStyle === d ? ST.segBtnOn : null),
                            textTransform: 'capitalize',
                          }}
                        >
                          {d}
                        </button>
                      ))}
                    </div>
                  </Section>
                )}

                {/* ── Drop shadow ── */}
                <Section title="Drop shadow">
                  {(() => {
                    const sh = shadowOf()
                    return (
                      <>
                        <label style={ST.checkRow}>
                          <input
                            type="checkbox"
                            checked={!!sh}
                            onChange={(e) =>
                              e.target.checked ? setShadow({}) : clearShadow()
                            }
                          />
                          <span>Enable shadow</span>
                        </label>
                        {sh && (
                          <>
                            <Field label="Colour">
                              <div
                                style={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: 8,
                                }}
                              >
                                <input
                                  type="color"
                                  value={
                                    /^#[0-9a-f]{6}$/i.test(sh.color || '')
                                      ? (sh.color as string)
                                      : '#0f172a'
                                  }
                                  onChange={(e) =>
                                    setShadow({ color: e.target.value })
                                  }
                                  style={ST.colorWell}
                                />
                                <input
                                  style={ST.input}
                                  value={sh.color || ''}
                                  onChange={(e) =>
                                    setShadow({ color: e.target.value })
                                  }
                                />
                              </div>
                            </Field>
                            <div style={ST.grid2}>
                              <NumBox
                                label="Blur"
                                value={Math.round(sh.blur ?? 0)}
                                onChange={(v) =>
                                  setShadow({ blur: Math.max(0, v) })
                                }
                              />
                              <NumBox
                                label="X"
                                value={Math.round(sh.offsetX ?? 0)}
                                onChange={(v) => setShadow({ offsetX: v })}
                              />
                              <NumBox
                                label="Y"
                                value={Math.round(sh.offsetY ?? 0)}
                                onChange={(v) => setShadow({ offsetY: v })}
                              />
                            </div>
                          </>
                        )}
                      </>
                    )
                  })()}
                </Section>

                {/* ── Blend mode + lock ── */}
                <Section title="Blend">
                  <label style={ST.checkRow}>
                    <input
                      type="checkbox"
                      checked={activeObj.selectable === false}
                      onChange={() => toggleLayerLock(activeObj)}
                    />
                    <span>Lock layer</span>
                  </label>
                  <Field label="Blend mode">
                    <select
                      style={ST.input}
                      value={
                        (activeObj.globalCompositeOperation as string) ===
                        'source-over'
                          ? 'normal'
                          : (activeObj.globalCompositeOperation as string) ||
                            'normal'
                      }
                      onChange={(e) =>
                        mutateActive((o) => {
                          const v = e.target.value
                          o.set(
                            'globalCompositeOperation',
                            (v === 'normal' ? 'source-over' : v) as never
                          )
                          o.set('dirty', true as never)
                        }, 'now')
                      }
                    >
                      {BLEND_MODES.map((m) => (
                        <option key={m} value={m}>
                          {m}
                        </option>
                      ))}
                    </select>
                  </Field>
                </Section>

                {/* ── Image crop and filters ── */}
                {isPhotoBitmap && (
                  <>
                    <Section title="Crop">
                      {cropping ? (
                        <>
                          <p style={ST.hint}>
                            Drag and resize the blue rectangle over the image,
                            then apply.
                          </p>
                          <div style={{ display: 'flex', gap: 6 }}>
                            <button
                              style={{
                                ...ST.btnPrimary,
                                flex: 1,
                                justifyContent: 'center',
                              }}
                              onClick={applyCrop}
                            >
                              <Check size={14} /> Apply
                            </button>
                            <button
                              style={{ ...ST.btnBlock, flex: 1 }}
                              onClick={cancelCrop}
                            >
                              Cancel
                            </button>
                          </div>
                        </>
                      ) : (
                        <div style={{ display: 'flex', gap: 6 }}>
                          <button
                            style={{ ...ST.btnBlock, flex: 1 }}
                            onClick={startCrop}
                          >
                            <Crop size={14} /> Crop
                          </button>
                          <button
                            style={{ ...ST.btnBlock, flex: 1 }}
                            onClick={resetCrop}
                          >
                            Reset
                          </button>
                        </div>
                      )}
                    </Section>

                    <Section title="Filters">
                      {(
                        [
                          ['hue', 'Hue', -180, 180, 1],
                          ['brightness', 'Brightness', -1, 1, 0.05],
                          ['contrast', 'Contrast', -1, 1, 0.05],
                          ['saturation', 'Saturation', -1, 1, 0.05],
                          ['blur', 'Blur', 0, 1, 0.02],
                          ['grayscale', 'Greyscale', 0, 1, 1],
                        ] as [
                          keyof ImageFilters,
                          string,
                          number,
                          number,
                          number,
                        ][]
                      ).map(([key, label, min, max, step]) => {
                        const val = filtersOf()[key] ?? 0
                        return (
                          <Field
                            key={key}
                            label={`${label} — ${Number(val).toFixed(2)}`}
                          >
                            <input
                              type="range"
                              min={min}
                              max={max}
                              step={step}
                              value={val}
                              onChange={(e) =>
                                setFilter(key, Number(e.target.value))
                              }
                              style={{ width: '100%' }}
                            />
                          </Field>
                        )
                      })}
                      <button style={ST.btnBlock} onClick={resetFilters}>
                        Reset filters
                      </button>
                    </Section>
                  </>
                )}

                {/* ── The part that makes this a *master* template ── */}
                <Section title="Site-user binding">
                  <Field label="Layer name">
                    <input
                      style={ST.input}
                      value={activeObj.layerName || ''}
                      onChange={(e) =>
                        mutateActive((o) => {
                          o.layerName = e.target.value
                        })
                      }
                    />
                  </Field>

                  <label
                    style={{
                      ...ST.checkRow,
                      opacity: bindingLocked ? 0.55 : 1,
                    }}
                    title={
                      bindingLocked
                        ? 'The storefront never makes an image or logo editable'
                        : undefined
                    }
                  >
                    <input
                      type="checkbox"
                      disabled={bindingLocked}
                      checked={
                        !!activeObj.isEditableBySiteUser && !bindingLocked
                      }
                      onChange={(e) =>
                        mutateActive((o) => {
                          o.isEditableBySiteUser = e.target.checked
                        }, 'now')
                      }
                    />
                    <span>Editable by site user</span>
                    {bindingLocked && <Lock size={11} color="#9ca3af" />}
                  </label>

                  {activeObj.isEditableBySiteUser && !bindingLocked && (
                    <>
                      <Field label="Merge field">
                        <select
                          style={ST.input}
                          value={activeObj.fieldKey || ''}
                          onChange={(e) =>
                            mutateActive((o) => {
                              o.fieldKey = e.target.value || undefined
                            }, 'now')
                          }
                        >
                          <option value="">— none (free text) —</option>
                          {FIELD_KEY_OPTIONS.map((f) => (
                            <option key={f.key} value={f.key}>
                              {f.label}
                            </option>
                          ))}
                        </select>
                      </Field>
                      <Field label="Form label">
                        <input
                          style={ST.input}
                          value={activeObj.layerLabel || ''}
                          onChange={(e) =>
                            mutateActive((o) => {
                              o.layerLabel = e.target.value
                            })
                          }
                        />
                      </Field>
                      <Field label="Helper text">
                        <input
                          style={ST.input}
                          value={activeObj.helperText || ''}
                          onChange={(e) =>
                            mutateActive((o) => {
                              o.helperText = e.target.value
                            })
                          }
                          placeholder="Shown under the field in the storefront"
                        />
                      </Field>
                      <label style={ST.checkRow}>
                        <input
                          type="checkbox"
                          checked={!!activeObj.isRequired}
                          onChange={(e) =>
                            mutateActive((o) => {
                              o.isRequired = e.target.checked
                            }, 'now')
                          }
                        />
                        <span>Required</span>
                      </label>
                    </>
                  )}
                </Section>
              </>
            )}
          </div>

          {/* ── Block list (stacking order: top row = front) ── */}
          <div style={ST.blockList}>
            <div style={ST.blockListHead}>
              <span>Layers · front to back</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                <MiniBtn
                  title="Bring to front (Ctrl+Shift+])"
                  onClick={() => arrangeSelected('front')}
                >
                  <ChevronsUp size={13} />
                </MiniBtn>
                <MiniBtn
                  title="Bring forward (Ctrl+])"
                  onClick={() => arrangeSelected('forward')}
                >
                  <ChevronUp size={13} />
                </MiniBtn>
                <MiniBtn
                  title="Send backward (Ctrl+[)"
                  onClick={() => arrangeSelected('backward')}
                >
                  <ChevronDown size={13} />
                </MiniBtn>
                <MiniBtn
                  title="Send to back (Ctrl+Shift+[)"
                  onClick={() => arrangeSelected('back')}
                >
                  <ChevronsDown size={13} />
                </MiniBtn>
                <span style={{ ...ST.subtle, marginLeft: 6 }}>
                  {canvasLayers.length}
                </span>
              </div>
            </div>

            <div
              style={{ ...ST.panelScroll, padding: 8 }}
              onDragOver={(e) => {
                // Rows stop propagation, so reaching here means the empty space
                // below the list: drop there to send the layer to the back.
                if (!dragLayerId) return
                e.preventDefault()
                if (dropHint) setDropHint(null)
              }}
              onDrop={(e) => {
                if (!dragLayerId) return
                e.preventDefault()
                const last = canvasLayers[canvasLayers.length - 1]
                if (last && dropHint === null)
                  reorderLayer(dragLayerId, last.layerId, 'below')
                setDragLayerId(null)
                setDropHint(null)
              }}
            >
              {canvasLayers.length === 0 && (
                <p style={ST.hint}>
                  Nothing on the canvas yet — drag a component from the left.
                </p>
              )}
              {canvasLayers.map((o, i) => {
                const expanded = !!expandedGroups[o.layerId]
                return (
                  <LayerRow
                    key={o.layerId}
                    o={o}
                    // Counted from the background up, so the number matches
                    // the zIndex that gets saved.
                    stackPos={canvasLayers.length - i}
                    selected={
                      activeObj === o || selectedIds.includes(o.layerId)
                    }
                    dragging={dragLayerId === o.layerId}
                    hint={
                      dropHint && dropHint.id === o.layerId
                        ? dropHint.place
                        : null
                    }
                    renaming={renamingId === o.layerId}
                    expanded={expanded}
                    signature={layerSignature(o, expanded)}
                    actions={layerActions}
                  />
                )
              })}

              {/* Base layer: always the floor of the stack, never reorderable. */}
              <div
                onClick={() => {
                  fabricRef.current?.discardActiveObject()
                  fabricRef.current?.requestRenderAll()
                  setActiveObj(null)
                  setRightTab('style')
                }}
                title="Background — the base layer. Click to edit its colour."
                style={{
                  ...ST.layerRow,
                  marginTop: 6,
                  borderStyle: 'dashed',
                  borderColor: !activeObj ? '#3b82f6' : '#cbd5e1',
                  backgroundColor: !activeObj ? '#eff6ff' : '#f8fafc',
                  cursor: 'pointer',
                }}
              >
                <Lock size={12} color="#cbd5e1" style={{ flexShrink: 0 }} />
                <span style={ST.stackPos}>0</span>
                <span
                  style={{
                    ...ST.bgChip,
                    backgroundColor: /^#[0-9a-f]{6}$/i.test(paFill)
                      ? paFill
                      : '#ffffff',
                  }}
                />
                <span
                  style={{
                    ...ST.layerName,
                    cursor: 'pointer',
                    fontWeight: 600,
                  }}
                >
                  Background
                </span>
                <span
                  style={{
                    ...ST.subtle,
                    marginLeft: 'auto',
                    fontSize: '0.6rem',
                  }}
                >
                  BASE
                </span>
              </div>
            </div>

            <div style={ST.blockListFoot}>
              Drag rows to restack · top row prints in front
            </div>
          </div>
        </aside>
      </div>

      {/* ─── Version history ────────────────────────────────────── */}
      {versionsOpen && (
        <div style={ST.modalBackdrop} onClick={() => setVersionsOpen(false)}>
          <div
            style={{ ...ST.modal, width: 420 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={ST.modalHead}>
              <span style={{ fontWeight: 600, fontSize: '0.875rem' }}>
                Version history
              </span>
              <button
                style={ST.iconBtnBase}
                onClick={() => setVersionsOpen(false)}
                title="Close"
              >
                <X size={16} />
              </button>
            </div>
            <div style={{ padding: 12, maxHeight: '60vh', overflowY: 'auto' }}>
              <label style={ST.checkRow}>
                <input
                  type="checkbox"
                  checked={autosaveOn}
                  onChange={(e) => setAutosaveOn(e.target.checked)}
                />
                <span>Autosave every few seconds</span>
              </label>

              {versions.length === 0 ? (
                <p style={ST.hint}>
                  No versions yet. A snapshot is kept each time you save a draft
                  or publish, and it is shared with everyone who can open this
                  template.
                </p>
              ) : (
                versions.map((v, i) => (
                  <div key={v.id} style={ST.versionRow}>
                    <div
                      style={{ ...ST.versionThumb, background: '#f1f5f9' }}
                    />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: '0.75rem', fontWeight: 600 }}>
                        v{v.version}
                        {i === 0 ? ' · latest' : ''}
                      </div>
                      <div style={ST.subtle}>
                        {relativeTime(v.at)} · {v.label}
                        {v.by ? ` · ${v.by}` : ''}
                        {v.isPublished ? ' · live' : ''}
                      </div>
                    </div>
                    <button
                      style={ST.btnGhost}
                      onClick={() => restoreVersion(v)}
                      disabled={i === 0}
                      title={
                        i === 0
                          ? 'This is the current saved version'
                          : 'Replace the canvas with this version'
                      }
                    >
                      Restore
                    </button>
                  </div>
                ))
              )}
              <p style={ST.hint}>
                Snapshots are kept in this browser (the mock data source has no
                version endpoint yet). The most recent 20 are retained.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ─── Export dialog ──────────────────────────────────────── */}
      {exportOpen && (
        <div style={ST.modalBackdrop} onClick={() => setExportOpen(false)}>
          <div
            style={{ ...ST.modal, width: 380 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={ST.modalHead}>
              <span style={{ fontWeight: 600, fontSize: '0.875rem' }}>
                Export artwork
              </span>
              <button
                style={ST.iconBtnBase}
                onClick={() => setExportOpen(false)}
                title="Close"
              >
                <X size={16} />
              </button>
            </div>
            <div style={{ padding: 16 }}>
              <Field label="Format">
                <div style={{ display: 'flex', gap: 6 }}>
                  {(['png', 'jpeg', 'svg', 'pdf'] as const).map((f) => (
                    <button
                      key={f}
                      onClick={() => setExportFormat(f)}
                      style={{
                        ...ST.segBtn,
                        ...(exportFormat === f ? ST.segBtnOn : null),
                        textTransform: 'uppercase',
                        fontWeight: 600,
                      }}
                    >
                      {f}
                    </button>
                  ))}
                </div>
              </Field>

              {exportFormat === 'svg' ? (
                <p style={ST.hint}>
                  Vector output — text stays text and shapes stay paths, so it
                  scales without loss. Resolution settings do not apply.
                </p>
              ) : (
                <>
                  <Field label="Resolution">
                    <div style={{ display: 'flex', gap: 6 }}>
                      {[96, 150, 300, 600].map((d) => (
                        <button
                          key={d}
                          onClick={() => setExportDpi(d)}
                          style={{
                            ...ST.segBtn,
                            ...(exportDpi === d ? ST.segBtnOn : null),
                          }}
                        >
                          {d}
                        </button>
                      ))}
                    </div>
                  </Field>
                  <p style={ST.hint}>
                    {exportDpi} DPI
                    {exportPixels
                      ? ` · ${exportPixels.w} × ${exportPixels.h} px`
                      : ''}
                    {exportDpi >= 300
                      ? ' · print quality'
                      : ' · screen quality'}
                  </p>
                </>
              )}

              {exportFormat === 'jpeg' && (
                <Field label={`JPEG quality — ${exportQuality}%`}>
                  <input
                    type="range"
                    min={40}
                    max={100}
                    value={exportQuality}
                    onChange={(e) => setExportQuality(Number(e.target.value))}
                    style={{ width: '100%' }}
                  />
                </Field>
              )}

              {exportFormat !== 'svg' && (
                <label style={ST.checkRow}>
                  <input
                    type="checkbox"
                    checked={exportBleed}
                    onChange={(e) => setExportBleed(e.target.checked)}
                  />
                  <span>
                    Include {template.bleedMargin}
                    {template.dimensions.unit} bleed
                  </span>
                </label>
              )}

              {exportFormat === 'pdf' && (
                <label style={ST.checkRow}>
                  <input
                    type="checkbox"
                    checked={exportCropMarks}
                    onChange={(e) => setExportCropMarks(e.target.checked)}
                  />
                  <span>Crop marks</span>
                </label>
              )}

              <p style={ST.hint}>
                Hidden layers and editor guides are excluded from output.
              </p>

              <button
                onClick={runExport}
                disabled={exporting}
                style={{
                  ...ST.btnPrimary,
                  width: '100%',
                  justifyContent: 'center',
                  marginTop: 8,
                }}
              >
                <Download size={14} />
                {exporting
                  ? 'Exporting…'
                  : `Download ${exportFormat.toUpperCase()}`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── Mode banners ───────────────────────────────────────── */}
      {editingGroupId && (
        <div style={ST.modeBanner}>
          <FolderOpen size={13} />
          <span>Editing inside group — click a child to select it</span>
          <button onClick={exitGroupEdit} style={ST.modeBannerBtn}>
            Done
          </button>
        </div>
      )}

      {!editingGroupId && maskContentId && (
        <div style={ST.modeBanner}>
          <Contrast size={13} />
          <span>
            Editing masked content — move or resize it behind the mask
          </span>
          <button
            onClick={doReleaseMask}
            style={{ ...ST.modeBannerBtn, backgroundColor: '#7c3aed' }}
          >
            Release mask
          </button>
          <button
            onClick={() => setMaskContentId(null)}
            style={ST.modeBannerBtn}
          >
            Done
          </button>
        </div>
      )}

      {/* The one file picker every Upload, Choose and Replace button opens.
          Mounted here, always. It used to live inside the Components tab, so
          on any other tab — Personalisation, Editable Fields — there was no
          input to click and Replace did nothing at all. */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) void handleImageFile(f)
          e.target.value = ''
        }}
      />

      {/* The image library behind every "Library" button above. Mounted only
          for a user who can reach it: without a Ticket-IT session there is
          nothing to browse, so nothing is offered. */}
      {canBrowseDam && (
        <DamImagePicker
          isOpen={libraryFor !== null}
          onClose={() => setLibraryFor(null)}
          onPick={(picked) => void handleLibraryPick(picked)}
          allowUpload={canUploadDam}
          title={
            libraryFor === 'mockup'
              ? 'Choose a product photo'
              : 'Choose a picture'
          }
        />
      )}

      {/* ─── Preview modal ──────────────────────────────────────── */}
      {preview && (
        <div style={ST.modalBackdrop} onClick={() => setPreview(null)}>
          <div style={ST.modal} onClick={(e) => e.stopPropagation()}>
            <div style={ST.modalHead}>
              <span style={{ fontWeight: 600, fontSize: '0.875rem' }}>
                {template.name} — print preview
              </span>
              <button
                style={ST.iconBtnBase}
                onClick={() => setPreview(null)}
                title="Close"
              >
                <X size={16} />
              </button>
            </div>
            <div style={ST.modalBody}>
              {/*
                One face at a time, and the turn between them.

                Laid side by side this answered "what are both sides" when the
                question a designer actually asks is "is this right" — and a
                sheet has a front and a back the way a card does, not two
                halves seen at once. So it turns: the two rendered faces are
                stacked back to back in 3D, and switching rotates the pair
                rather than swapping the picture.

                The angle is continuous rather than a flag, which is what makes
                it read as a physical object — at 90 degrees the sheet is
                edge-on, and you can stop it there by dragging.
              */}
              <FlipPreview
                sides={preview}
                angle={flipDeg}
                onAngle={setFlipDeg}
                label={template.name}
                ratio={
                  template.dimensions.width / (template.dimensions.height || 1)
                }
              />

              <SpinPreview
                frames={spinFrames}
                frame={spinFrame}
                onFrame={setSpinFrame}
              />
            </div>
          </div>
        </div>
      )}

      {/* ─── Toast ──────────────────────────────────────────────── */}
      {toast ? (
        <div
          style={{
            ...ST.toast,
            backgroundColor:
              toast.kind === 'ok'
                ? '#065f46'
                : toast.kind === 'info'
                  ? '#1f2937'
                  : '#991b1b',
          }}
        >
          {toast.kind === 'ok' ? (
            <Check size={14} />
          ) : toast.kind === 'info' ? (
            <Images size={14} />
          ) : (
            <X size={14} />
          )}
          <span>{toast.msg}</span>
        </div>
      ) : damBusy.upload + damBusy.load > 0 ? (
        // Same place as the toast, which takes it over while it shows: the
        // upload's own result arrives as a toast, and two pills would stack.
        <div
          role="status"
          aria-live="polite"
          style={{ ...ST.toast, backgroundColor: '#1f2937' }}
        >
          <Loader2
            size={14}
            style={{ animation: 'spin 0.9s linear infinite' }}
          />
          <span>
            {damBusy.upload > 0
              ? 'Uploading to the image library…'
              : 'Loading from the image library…'}
          </span>
        </div>
      ) : null}
    </div>
  )
}

/* ────────────────────────────────────────────────────────────────
   Presentational bits (module scope so React keeps them mounted)
   ──────────────────────────────────────────────────────────────── */

/**
 * The design as a physical sheet you can turn over.
 *
 * The faces are stacked in the same place rather than laid out beside each
 * other, each hiding its own back, and the whole stack rotates. That is what
 * makes it read as one object with two sides instead of two pictures of one
 * thing — and it is why the angle is a number rather than an index: at 90° the
 * sheet is edge-on, which is a real state a flag cannot hold.
 *
 * Dragging turns it and releases to the nearest face, so it cannot be left
 * stranded showing nothing. Every side is reachable, which is why the rotation
 * accumulates past 360° instead of wrapping — turning "forward" through four
 * backs should keep going forward rather than snapping backwards on the fourth.
 */
function FlipPreview({
  sides,
  angle,
  onAngle,
  label,
  ratio,
}: {
  /** `blank`: a side with nothing printed on it, drawn as the bare sheet. */
  sides: { name: string; url: string; blank?: boolean }[]
  angle: number
  onAngle: (deg: number) => void
  label: string
  /** Sheet width ÷ height. The box is shaped from this rather than from the
   *  image, so a portrait design can never be shown in a landscape frame. */
  ratio: number
}) {
  const dragRef = useRef<{ x: number; from: number } | null>(null)
  const [dragging, setDragging] = useState(false)

  /**
   * Whether there is anything to turn to. A design with nothing on its back is
   * handed in with a blank back side, so it turns too; only a lone side with
   * no back at all renders flat and uses the whole frame.
   */
  const turnable = sides.length > 1

  /** Which face a given angle lands on. */
  const faceAt = (deg: number) => {
    const step = Math.round(deg / 180)
    return ((step % sides.length) + sides.length) % sides.length
  }
  const facing = turnable ? faceAt(angle) : 0

  /** Pointer travel for a half turn. A modal's width, not a desk's. */
  const PX_PER_HALF_TURN = 260

  const turnTo = (index: number) => {
    // The shortest way round to the requested face, from wherever it is now.
    const current = Math.round(angle / 180)
    const currentFace = faceAt(angle)
    let delta = index - currentFace
    if (delta > sides.length / 2) delta -= sides.length
    if (delta < -sides.length / 2) delta += sides.length
    onAngle((current + delta) * 180)
  }

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '16px',
      }}
    >
      {/* The frame: the sheet's own proportions, and the edge nothing crosses. */}
      <div
        onPointerDown={
          turnable
            ? (e) => {
                e.currentTarget.setPointerCapture(e.pointerId)
                dragRef.current = { x: e.clientX, from: angle }
                setDragging(true)
              }
            : undefined
        }
        onPointerMove={
          turnable
            ? (e) => {
                const drag = dragRef.current
                if (!drag) return
                onAngle(
                  drag.from + ((e.clientX - drag.x) / PX_PER_HALF_TURN) * 180
                )
              }
            : undefined
        }
        onPointerUp={
          turnable
            ? (e) => {
                if (e.currentTarget.hasPointerCapture(e.pointerId))
                  e.currentTarget.releasePointerCapture(e.pointerId)
                dragRef.current = null
                setDragging(false)
                // Never left edge-on: settle onto whichever face is nearest.
                onAngle(Math.round(angle / 180) * 180)
              }
            : undefined
        }
        style={{
          position: 'relative',
          // The sheet's own proportions, and nothing else touching them.
          //
          // The width is picked so the height that follows from the ratio
          // already fits — rather than being clamped afterwards. `aspect-ratio`
          // with `width: 100%` and a `max-height` is three rules arguing: the
          // ratio sets the height, `max-height` cuts it, and the width stays
          // where it was, leaving a frame wider than the sheet and a band of
          // background down either side of the artwork.
          //
          // Solving for the width instead means the frame is always exactly
          // the shape of the sheet, so `object-fit: contain` below has nothing
          // left to letterbox.
          width: `min(100%, 760px, calc(58vh * ${ratio}))`,
          aspectRatio: `${ratio}`,
          margin: '0 auto',
          // The edge a turning corner cannot cross. Rotating a rectangle under
          // perspective swings its near edge well outside the box it started
          // in, and without this it spilled across the whole modal.
          overflow: 'hidden',
          cursor: turnable ? 'ew-resize' : 'default',
          touchAction: 'none',
          userSelect: 'none',
        }}
      >
        {/* The stage, inset so a turning corner has somewhere to go. A sheet
            with nothing to turn to needs no room and uses the whole frame. */}
        <div
          style={{
            position: 'absolute',
            inset: turnable ? '7%' : 0,
            perspective: turnable ? '2200px' : undefined,
          }}
        >
          <div
            style={{
              position: 'relative',
              width: '100%',
              height: '100%',
              transformStyle: turnable ? 'preserve-3d' : undefined,
              transform: turnable ? `rotateY(${angle}deg)` : undefined,
              transition: dragging ? 'none' : 'transform 0.55s ease',
            }}
          >
            {(turnable ? sides : sides.slice(0, 1)).map((side, index) => (
              <div
                key={side.name}
                style={{
                  // Every face fills the same box, which the parent has already
                  // shaped. None of them sizes it — that was the bug.
                  position: 'absolute',
                  inset: 0,
                  transform: turnable
                    ? `rotateY(${index * 180}deg)`
                    : undefined,
                  backfaceVisibility: turnable ? 'hidden' : undefined,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                {side.blank ? (
                  <div
                    role="img"
                    aria-label={`${label} — ${side.name}: nothing printed`}
                    style={{
                      width: '100%',
                      height: '100%',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      backgroundColor: '#ffffff',
                      boxShadow: '0 2px 12px rgba(0,0,0,0.15)',
                      color: '#94a3b8',
                      fontSize: '12px',
                      fontWeight: 600,
                    }}
                  >
                    Blank back — nothing is printed on this side
                  </div>
                ) : side.url ? (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img
                    src={side.url}
                    alt={`${label} — ${side.name}`}
                    draggable={false}
                    style={{
                      display: 'block',
                      width: '100%',
                      height: '100%',
                      objectFit: 'contain',
                      boxShadow: '0 2px 12px rgba(0,0,0,0.15)',
                    }}
                  />
                ) : (
                  <div
                    style={{
                      padding: '28px 20px',
                      borderRadius: '10px',
                      border: '1px dashed #cbd5e1',
                      backgroundColor: '#f8fafc',
                      color: '#64748b',
                      fontSize: '12px',
                      textAlign: 'center',
                    }}
                  >
                    This side could not be captured — an image on it comes from
                    a host that does not allow it to be read. It will still
                    print.
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* A lone side with no back has nothing to turn to, so it is not offered. */}
      {turnable && (
        <div
          style={{
            display: 'flex',
            gap: '8px',
            flexWrap: 'wrap',
            justifyContent: 'center',
          }}
        >
          {sides.map((side, index) => {
            const on = index === facing
            return (
              <button
                key={side.name}
                onClick={() => turnTo(index)}
                style={{
                  padding: '7px 16px',
                  borderRadius: '8px',
                  fontSize: '12px',
                  fontWeight: 700,
                  cursor: 'pointer',
                  backgroundColor: '#ffffff',
                  color: on ? '#0f172a' : '#64748b',
                  border: on ? '2px solid #2563eb' : '1px solid #cbd5e1',
                }}
              >
                {side.name}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

/**
 * Turn the garment by dragging, from a set of photographs.
 *
 * A spin viewer rather than a 3D model, which is a deliberate trade. The
 * artboard is a flat fabric.js canvas and the backdrop is a photograph, so
 * there is no geometry here to rotate — putting some in would mean a garment
 * model per product and a renderer beside the one that already draws the
 * artwork. Scrubbing through frames buys the thing people actually want, which
 * is to see the garment from behind before committing, at the cost of a
 * photo shoot per garment rather than a modelling job.
 *
 * Renders nothing at all below two frames: one photograph is a picture, and a
 * drag handle over a picture that cannot turn is a promise the page cannot
 * keep.
 */
function SpinPreview({
  frames,
  frame,
  onFrame,
}: {
  frames: { src: string; area?: unknown }[]
  frame: number
  onFrame: (index: number) => void
}) {
  const dragRef = useRef<{ x: number; from: number } | null>(null)

  if (frames.length < 2) return null

  const wrap = (index: number) =>
    ((index % frames.length) + frames.length) % frames.length

  /** How far the pointer travels for one frame. Tuned so a full turn is
   *  roughly the width of the modal rather than the width of the desk. */
  const PX_PER_FRAME = 14

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId)
    dragRef.current = { x: e.clientX, from: frame }
  }

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current
    if (!drag) return
    const steps = Math.round((e.clientX - drag.x) / PX_PER_FRAME)
    onFrame(wrap(drag.from + steps))
  }

  const endDrag = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.currentTarget.hasPointerCapture(e.pointerId))
      e.currentTarget.releasePointerCapture(e.pointerId)
    dragRef.current = null
  }

  return (
    <div
      style={{
        marginTop: '18px',
        paddingTop: '16px',
        borderTop: '1px solid #e2e8f0',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '10px',
      }}
    >
      <div
        role="slider"
        tabIndex={0}
        aria-label="Turn the garment"
        aria-valuemin={1}
        aria-valuemax={frames.length}
        aria-valuenow={frame + 1}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        // Arrow keys as well as the drag: a spin viewer that only answers to a
        // mouse is one a keyboard cannot turn at all.
        onKeyDown={(e) => {
          if (e.key === 'ArrowRight') onFrame(wrap(frame + 1))
          if (e.key === 'ArrowLeft') onFrame(wrap(frame - 1))
        }}
        style={{
          cursor: 'ew-resize',
          touchAction: 'none',
          userSelect: 'none',
          borderRadius: '12px',
          overflow: 'hidden',
          border: '1px solid #e2e8f0',
          backgroundColor: '#f8fafc',
          maxWidth: '420px',
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={frames[frame]?.src}
          alt={`Garment, angle ${frame + 1} of ${frames.length}`}
          draggable={false}
          style={{ display: 'block', width: '100%', height: 'auto' }}
        />
      </div>

      <span style={{ fontSize: '11px', color: '#64748b' }}>
        Drag to turn · {frame + 1} / {frames.length}
      </span>
    </div>
  )
}

/**
 * A counter the canvas ticks on every frame of a drag, scale or rotate, for
 * the few readouts that follow the object live. Subscribing them to it, rather
 * than re-rendering the studio per frame, is what keeps a drag smooth: the
 * whole studio took about half a second to render.
 */
function createTicker() {
  let count = 0
  const listeners = new Set<() => void>()
  return {
    subscribe(listener: () => void) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    read: () => count,
    tick() {
      count++
      listeners.forEach((listener) => listener())
    },
  }
}

type Ticker = ReturnType<typeof createTicker>

/**
 * The selected object's position, size, angle and opacity. Re-renders on the
 * live ticker while the object is dragged, and with the studio (`revision`)
 * after any other change.
 */
const LiveGeometry = React.memo(function LiveGeometry({
  obj,
  ticker,
  mutate,
}: {
  obj: FabricAny
  ticker: Ticker
  /** Changes with every studio render, which re-renders these fields too. */
  revision: number
  mutate: (fn: (o: FabricAny) => void) => void
}) {
  React.useSyncExternalStore(ticker.subscribe, ticker.read, ticker.read)
  return (
    <div style={ST.grid2}>
      <NumBox
        label="X"
        value={Math.round(obj.left || 0)}
        onChange={(v) => mutate((o) => o.set('left', v))}
      />
      <NumBox
        label="Y"
        value={Math.round(obj.top || 0)}
        onChange={(v) => mutate((o) => o.set('top', v))}
      />
      <NumBox
        label="W"
        value={Math.round(obj.getScaledWidth())}
        onChange={(v) =>
          mutate((o) => {
            if (v > 0) o.scaleToWidth(v)
          })
        }
      />
      <NumBox
        label="H"
        value={Math.round(obj.getScaledHeight())}
        onChange={(v) =>
          mutate((o) => {
            if (v > 0) o.scaleToHeight(v)
          })
        }
      />
      <NumBox
        label="∠"
        value={Math.round(obj.angle || 0)}
        onChange={(v) => mutate((o) => o.set('angle', v))}
      />
      <NumBox
        label="%"
        value={Math.round((obj.opacity ?? 1) * 100)}
        onChange={(v) =>
          mutate((o) => o.set('opacity', Math.max(0, Math.min(100, v)) / 100))
        }
      />
    </div>
  )
})

type LayerPlace = 'above' | 'below'

/** What a layers-panel row can do. A stable object: see `LayerRow`. */
type LayerRowActions = {
  select: (o: FabricAny, additive: boolean) => void
  contextMenu: (e: React.MouseEvent<HTMLDivElement>, o: FabricAny) => void
  /** Whether a layer being dragged in the panel may be dropped on this one. */
  canDropOn: (id: string) => boolean
  dragStart: (id: string) => void
  dragEnd: () => void
  dragOver: (id: string, place: LayerPlace) => void
  drop: (id: string, place: LayerPlace) => void
  toggleExpanded: (id: string) => void
  startRename: (id: string) => void
  finishRename: (o: FabricAny, name: string) => void
  cancelRename: () => void
  ungroup: (o: FabricAny) => void
  pickImage: (o: FabricAny) => void
  toggleVisible: (o: FabricAny) => void
  toggleLock: (o: FabricAny) => void
  remove: (o: FabricAny) => void
  setOpacity: (o: FabricAny, percent: number) => void
  openGroup: (o: FabricAny) => void
}

/**
 * What a layers-panel row shows of its layer, as one string. Fabric changes
 * objects in place, so this is how a memoised row learns its layer changed.
 */
function layerSignature(o: FabricAny, expanded: boolean): string {
  const own = [
    o.layerName,
    o.visible !== false,
    o.selectable !== false,
    Math.round((o.opacity ?? 1) * 100),
    !!o.clipPath,
    !!o.isEditableBySiteUser,
    o.fieldKey || '',
    o.type,
    o.customType || '',
    o.designType || '',
  ].join('|')
  if (o.type !== 'group' || !expanded) return own
  const children = ((o as unknown as fabric.Group).getObjects() as FabricAny[])
    .map((c) =>
      [c.layerName, c.visible !== false, c.selectable !== false, c.type].join(
        ':'
      )
    )
    .join(',')
  return `${own}#${children}`
}

/**
 * One row of the layers panel.
 *
 * Memoised: with a few dozen layers, rendering the panel was most of the half
 * second a studio render took, on every selection and every edit. A row now
 * renders again only when its own layer changes (`signature`) or its
 * selection, drag or rename state does. `actions` never changes identity; it
 * reaches the studio's current handlers.
 */
const LayerRow = React.memo(function LayerRow({
  o,
  stackPos,
  selected,
  dragging,
  hint,
  renaming,
  expanded,
  actions,
}: {
  o: FabricAny
  stackPos: number
  selected: boolean
  dragging: boolean
  hint: LayerPlace | null
  renaming: boolean
  expanded: boolean
  signature: string
  actions: LayerRowActions
}) {
  const hidden = o.visible === false
  const locked = o.selectable === false
  const Icon =
    SIDEBAR_COMPONENTS.find((c) => c.id === o.customType)?.icon || Square
  const placeOf = (e: React.DragEvent<HTMLDivElement>): LayerPlace => {
    const box = e.currentTarget.getBoundingClientRect()
    return e.clientY < box.top + box.height / 2 ? 'above' : 'below'
  }

  return (
    <>
      <div
        draggable={!renaming}
        onDragStart={(e) => {
          actions.dragStart(o.layerId)
          e.dataTransfer.effectAllowed = 'move'
          // Firefox needs a payload for the drag to start at all.
          e.dataTransfer.setData('text/plain', o.layerId)
        }}
        onDragEnd={() => actions.dragEnd()}
        onDragOver={(e) => {
          if (!actions.canDropOn(o.layerId)) return
          e.preventDefault()
          e.stopPropagation()
          e.dataTransfer.dropEffect = 'move'
          actions.dragOver(o.layerId, placeOf(e))
        }}
        onDrop={(e) => {
          if (!actions.canDropOn(o.layerId)) return
          e.preventDefault()
          e.stopPropagation()
          actions.drop(o.layerId, placeOf(e))
        }}
        onClick={(e) => actions.select(o, e.shiftKey || e.ctrlKey || e.metaKey)}
        onContextMenu={(e) => actions.contextMenu(e, o)}
        style={{
          ...ST.layerRow,
          backgroundColor: selected ? '#eff6ff' : '#ffffff',
          opacity: dragging ? 0.4 : hidden ? 0.5 : 1,
          borderLeftColor: selected ? '#3b82f6' : '#e5e7eb',
          borderRightColor: selected ? '#3b82f6' : '#e5e7eb',
          borderTopColor:
            hint === 'above' ? '#3b82f6' : selected ? '#3b82f6' : '#e5e7eb',
          borderBottomColor:
            hint === 'below' ? '#3b82f6' : selected ? '#3b82f6' : '#e5e7eb',
          borderTopWidth: hint === 'above' ? 2 : 1,
          borderBottomWidth: hint === 'below' ? 2 : 1,
        }}
      >
        <GripVertical
          size={12}
          color="#cbd5e1"
          style={{ flexShrink: 0, cursor: 'grab' }}
        />
        <span style={ST.stackPos}>{stackPos}</span>
        {o.type === 'group' ? (
          <button
            title={expanded ? 'Collapse' : 'Expand'}
            onClick={(e) => {
              e.stopPropagation()
              actions.toggleExpanded(o.layerId)
            }}
            style={ST.treeToggle}
          >
            {expanded ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
          </button>
        ) : null}
        <Icon size={13} color="#6b7280" style={{ flexShrink: 0 }} />

        {renaming ? (
          <input
            autoFocus
            defaultValue={o.layerName || ''}
            onClick={(e) => e.stopPropagation()}
            onBlur={(e) => actions.finishRename(o, e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') e.currentTarget.blur()
              if (e.key === 'Escape') actions.cancelRename()
            }}
            style={ST.renameInput}
          />
        ) : (
          <span
            style={ST.layerName}
            title={`${o.layerName || 'Layer'} — double-click to rename`}
            onDoubleClick={(e) => {
              e.stopPropagation()
              actions.startRename(o.layerId)
            }}
          >
            {o.layerName || 'Layer'}
          </span>
        )}

        {o.clipPath && (
          <span
            style={ST.maskTag}
            title="Masked — double-click to move the content"
          >
            MASK
          </span>
        )}
        {o.isEditableBySiteUser && <span style={ST.editableTag}>EDIT</span>}
        {o.fieldKey && (
          <span
            style={ST.mergeTag}
            title={`Bound to the "${
              FIELD_LABELS[o.fieldKey] || o.fieldKey
            }" merge field - a site user fills this in when they order`}
          >
            {o.fieldKey}
          </span>
        )}
        <div
          style={{
            display: 'flex',
            gap: 2,
            marginLeft: 'auto',
            flexShrink: 0,
          }}
        >
          {o.type === 'group' && (
            <MiniBtn
              title="Ungroup this group"
              onClick={() => actions.ungroup(o)}
            >
              <Ungroup size={12} />
            </MiniBtn>
          )}
          {isPhotoLayer(o) && (
            <MiniBtn
              title="Choose an image file"
              onClick={() => actions.pickImage(o)}
            >
              <Upload size={12} />
            </MiniBtn>
          )}
          <MiniBtn
            title={hidden ? 'Show' : 'Hide'}
            onClick={() => actions.toggleVisible(o)}
          >
            {hidden ? <EyeOff size={12} /> : <Eye size={12} />}
          </MiniBtn>
          <MiniBtn
            title={locked ? 'Unlock' : 'Lock'}
            onClick={() => actions.toggleLock(o)}
          >
            {locked ? <Lock size={12} /> : <Unlock size={12} />}
          </MiniBtn>
          <MiniBtn title="Delete" onClick={() => actions.remove(o)} danger>
            <Trash2 size={12} />
          </MiniBtn>
        </div>
      </div>
      {selected && (
        <div style={ST.opacityRow}>
          <span style={ST.opacityLabel}>Opacity</span>
          <input
            type="range"
            min={0}
            max={100}
            value={Math.round((o.opacity ?? 1) * 100)}
            onClick={(e) => e.stopPropagation()}
            onChange={(e) => actions.setOpacity(o, Number(e.target.value))}
            style={ST.opacityRange}
          />
          <span style={ST.opacityValue}>
            {Math.round((o.opacity ?? 1) * 100)}%
          </span>
        </div>
      )}
      {o.type === 'group' && expanded && (
        <GroupChildren
          group={o as unknown as fabric.Group}
          depth={1}
          onOpenGroup={() => actions.openGroup(o)}
        />
      )}
    </>
  )
})

function Section({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  return (
    <div style={{ marginBottom: 22 }}>
      <div style={ST.sectionTitle}>{title}</div>
      {children}
    </div>
  )
}

function Field({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={ST.fieldLabel}>{label}</div>
      {children}
    </div>
  )
}

function NumBox({
  label,
  value,
  onChange,
}: {
  label: string
  value: number
  onChange: (v: number) => void
}) {
  return (
    <div style={ST.numBox}>
      <span style={ST.numBoxLabel}>{label}</span>
      <input
        type="number"
        value={Number.isFinite(value) ? value : 0}
        onChange={(e) => {
          const v = Number(e.target.value)
          if (!Number.isNaN(v)) onChange(v)
        }}
        style={ST.numBoxInput}
      />
    </div>
  )
}

/**
 * A CSS stand-in for each text effect, for the tiles in the Effects menu. Only
 * a picture of the effect: what the canvas draws is set by `text-style`.
 */
function effectPreviewStyle(kind: TextEffectKind): React.CSSProperties {
  switch (kind) {
    case 'shadow':
      return { textShadow: '2px 2px 1px rgba(0,0,0,0.45)' }
    case 'lift':
      return { textShadow: '0 3px 6px rgba(15,23,42,0.35)' }
    case 'outline':
      return {
        color: '#ffffff',
        WebkitTextStroke: '1.5px #111827',
        paintOrder: 'stroke fill',
      }
    case 'hollow':
      return { color: 'transparent', WebkitTextStroke: '1px #1f2937' }
    case 'glow':
      return { color: '#db2777', textShadow: '0 0 6px rgba(219,39,119,0.85)' }
    case 'background':
      return { backgroundColor: '#fde68a', padding: '0 3px', borderRadius: 2 }
    default:
      return {}
  }
}

function IconButton({
  title,
  onClick,
  disabled,
  active,
  danger,
  children,
}: {
  title: string
  onClick: () => void
  disabled?: boolean
  active?: boolean
  danger?: boolean
  children: React.ReactNode
}) {
  return (
    <button
      title={title}
      onClick={onClick}
      disabled={disabled}
      style={{
        ...ST.iconBtnBase,
        color: danger ? '#ef4444' : active ? '#2563eb' : '#6b7280',
        backgroundColor: active ? '#eff6ff' : 'transparent',
        opacity: disabled ? 0.35 : 1,
        cursor: disabled ? 'not-allowed' : 'pointer',
      }}
    >
      {children}
    </button>
  )
}

function MiniBtn({
  title,
  onClick,
  danger,
  children,
}: {
  title: string
  onClick: () => void
  danger?: boolean
  children: React.ReactNode
}) {
  return (
    <button
      title={title}
      onClick={(e) => {
        e.stopPropagation()
        onClick()
      }}
      style={{
        backgroundColor: 'transparent',
        borderWidth: 0,
        borderStyle: 'none',
        padding: 2,
        cursor: 'pointer',
        display: 'flex',
        color: danger ? '#ef4444' : '#9ca3af',
      }}
    >
      {children}
    </button>
  )
}

/**
 * Nested children of an expanded group. Recurses, so a group inside a group
 * renders as a deeper branch. Children are edited through group edit mode
 * rather than being independently reorderable at the top level.
 */
function GroupChildren({
  group,
  depth,
  onOpenGroup,
}: {
  group: fabric.Group
  depth: number
  onOpenGroup: () => void
}) {
  const children = (group.getObjects() as FabricAny[]).slice().reverse()
  const g = group as unknown as FabricAny
  // A mask group's shape lives on clipPath, not in the child list, so surface it
  // as its own row - the mask is a layer as far as the user is concerned.
  const maskShape = g.clipPath as FabricAny | undefined
  return (
    <>
      {maskShape && (
        <div
          onClick={onOpenGroup}
          title="Mask shape - the boundary this group is clipped to"
          style={{
            ...ST.treeRow,
            paddingLeft: 10 + depth * 14,
            borderColor: '#ddd6fe',
            backgroundColor: '#faf5ff',
          }}
        >
          <span style={ST.treeSpine} />
          {maskShape.type === 'ellipse' || maskShape.type === 'circle' ? (
            <CircleIcon size={11} color="#7c3aed" style={{ flexShrink: 0 }} />
          ) : (
            <Square size={11} color="#7c3aed" style={{ flexShrink: 0 }} />
          )}
          <span style={{ ...ST.layerName, maxWidth: 96, color: '#7c3aed' }}>
            {g.maskShapeName || 'Mask shape'}
          </span>
          <span style={ST.maskTag}>MASK</span>
        </div>
      )}
      {children.map((child, i) => {
        const Icon =
          SIDEBAR_COMPONENTS.find((c) => c.id === child.customType)?.icon ||
          Square
        const isNested = child.type === 'group'
        return (
          <div key={child.layerId || `${depth}-${i}`}>
            <div
              onClick={onOpenGroup}
              title={`${child.layerName || 'Layer'} — double-click the group on the canvas to edit`}
              style={{ ...ST.treeRow, paddingLeft: 10 + depth * 14 }}
            >
              <span style={ST.treeSpine} />
              <Icon size={11} color="#94a3b8" style={{ flexShrink: 0 }} />
              <span style={{ ...ST.layerName, maxWidth: 96 }}>
                {child.layerName || (isNested ? 'Group' : 'Layer')}
              </span>
              {child.clipPath && <span style={ST.maskTag}>MASK</span>}
              {child.isEditableBySiteUser && (
                <span style={ST.editableTag}>EDIT</span>
              )}
            </div>
            {isNested && (
              <GroupChildren
                group={child as unknown as fabric.Group}
                depth={depth + 1}
                onOpenGroup={onOpenGroup}
              />
            )}
          </div>
        )
      })}
    </>
  )
}

function Swatches({ onPick }: { onPick: (color: string) => void }) {
  return (
    <div style={ST.swatchGrid}>
      {COLOR_SWATCHES.map((c) => (
        <button
          key={c}
          onClick={() => onPick(c)}
          title={c}
          style={{
            ...ST.swatch,
            backgroundColor: c,
            borderColor: c === '#ffffff' ? '#d1d5db' : 'transparent',
          }}
        />
      ))}
    </div>
  )
}

/* ────────────────────────────────────────────────────────────────
   Styles
   ──────────────────────────────────────────────────────────────── */

const ST: Record<string, React.CSSProperties> = {
  sideBar: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    padding: '6px 10px',
    borderBottom: '1px solid #e5e7eb',
    backgroundColor: '#f9fafb',
    flexWrap: 'wrap',
    minHeight: 34,
  },
  sideBarLabel: {
    fontSize: '0.65rem',
    fontWeight: 700,
    letterSpacing: '0.04em',
    textTransform: 'uppercase',
    color: '#6b7280',
    marginRight: 2,
  },
  sideBarHint: {
    fontSize: '0.65rem',
    color: '#6b7280',
    marginLeft: 'auto',
  },
  sideTabWrap: { display: 'inline-flex', alignItems: 'center', gap: 2 },
  sideTab: {
    padding: '3px 10px',
    borderRadius: 6,
    border: '1px solid #e5e7eb',
    backgroundColor: '#ffffff',
    color: '#4b5563',
    fontSize: '0.7rem',
    fontWeight: 600,
    cursor: 'pointer',
  },
  sideTabOn: {
    padding: '3px 10px',
    borderRadius: 6,
    border: '1px solid #2563eb',
    backgroundColor: '#eff6ff',
    color: '#1d4ed8',
    fontSize: '0.7rem',
    fontWeight: 700,
    cursor: 'pointer',
  },
  sideRenameInput: {
    width: 96,
    border: 'none',
    outline: 'none',
    background: 'transparent',
    font: 'inherit',
    color: 'inherit',
  },
  sideAction: {
    display: 'inline-flex',
    alignItems: 'center',
    padding: '3px 4px',
    borderRadius: 5,
    border: '1px solid #e5e7eb',
    backgroundColor: '#ffffff',
    color: '#6b7280',
    cursor: 'pointer',
  },
  sideAdd: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 4,
    padding: '3px 10px',
    borderRadius: 6,
    border: '1px dashed #cbd5e1',
    backgroundColor: '#ffffff',
    color: '#4b5563',
    fontSize: '0.7rem',
    fontWeight: 600,
    cursor: 'pointer',
  },
  shell: {
    display: 'flex',
    flexDirection: 'column',
    height: '100vh',
    backgroundColor: '#ffffff',
    color: '#333333',
    fontFamily: 'Inter, system-ui, sans-serif',
    overflow: 'hidden',
  },
  topBar: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '8px 16px',
    borderBottomWidth: 1,
    borderBottomStyle: 'solid',
    borderBottomColor: '#e5e7eb',
    flexShrink: 0,
  },
  brandDot: {
    width: 20,
    height: 20,
    backgroundColor: '#4f46e5',
    borderRadius: 4,
    flexShrink: 0,
  },
  title: {
    margin: 0,
    fontSize: '1rem',
    fontWeight: 600,
    cursor: 'text',
    whiteSpace: 'nowrap',
  },
  badge: {
    fontSize: '0.625rem',
    fontWeight: 700,
    padding: '2px 8px',
    borderRadius: 999,
    letterSpacing: 0.4,
  },
  subtle: { fontSize: '0.7rem', color: '#9ca3af', whiteSpace: 'nowrap' },
  toolBar: {
    display: 'flex',
    alignItems: 'center',
    gap: 4,
    padding: '6px 16px',
    borderBottomWidth: 1,
    borderBottomStyle: 'solid',
    borderBottomColor: '#e5e7eb',
    backgroundColor: '#f9fafb',
    flexShrink: 0,
    overflowX: 'auto',
  },
  sep: {
    width: 1,
    height: 16,
    backgroundColor: '#d1d5db',
    margin: '0 8px',
    flexShrink: 0,
  },
  iconBtnBase: {
    flexShrink: 0,
    padding: 5,
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: 'transparent',
    borderRadius: 4,
    cursor: 'pointer',
    color: '#6b7280',
    display: 'flex',
    alignItems: 'center',
  },
  fillGroup: {
    position: 'relative',
    display: 'flex',
    alignItems: 'center',
    gap: 2,
    flexShrink: 0,
  },
  fillWellBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: 3,
    padding: '3px 4px',
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: '#d1d5db',
    borderRadius: 4,
    backgroundColor: '#ffffff',
    cursor: 'pointer',
    color: '#6b7280',
    flexShrink: 0,
  },
  fillWellChip: {
    width: 18,
    height: 14,
    borderRadius: 2,
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: 'rgba(0,0,0,0.15)',
    display: 'block',
  },
  fillPopover: {
    // Fixed, not absolute: the toolbar is a scroll container (overflow-x: auto)
    // and would clip an absolutely positioned child hanging below it.
    position: 'fixed',
    zIndex: 60,
    width: 224,
    padding: 8,
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: '#e2e8f0',
    borderRadius: 8,
    backgroundColor: '#ffffff',
    boxShadow: '0 8px 24px rgba(15,23,42,0.16)',
  },
  fillPopoverGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(11, 1fr)',
    gap: 3,
  },
  fillPopoverSwatch: {
    width: '100%',
    aspectRatio: '1',
    borderRadius: 3,
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: 'transparent',
    cursor: 'pointer',
    padding: 0,
  },
  fillPopoverFoot: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    marginTop: 8,
  },
  fillWell: {
    width: 26,
    height: 24,
    padding: 0,
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: '#d1d5db',
    borderRadius: 4,
    cursor: 'pointer',
    backgroundColor: '#fff',
    flexShrink: 0,
  },
  fillStrip: { display: 'flex', gap: 3, alignItems: 'center', flexShrink: 0 },
  fillSwatch: {
    width: 15,
    height: 15,
    borderRadius: 3,
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: 'transparent',
    cursor: 'pointer',
    padding: 0,
    flexShrink: 0,
  },
  /**
   * Full-width dock that centres the toolbar with flexbox. Centring the bar
   * itself with left:50% + translateX(-50%) parked it on a half pixel whenever
   * its width was odd, which renders text blurry.
   */
  textBarDock: {
    position: 'absolute',
    left: 0,
    right: 0,
    zIndex: 8,
    display: 'flex',
    justifyContent: 'center',
    pointerEvents: 'none',
  },
  textBar: {
    display: 'flex',
    alignItems: 'center',
    gap: 3,
    minHeight: TEXT_BAR_HEIGHT,
    padding: '6px 10px',
    maxWidth: 'calc(100% - 48px)',
    borderRadius: 8,
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: '#e2e8f0',
    // Opaque on purpose. A translucent background plus backdrop-filter blurred
    // the canvas showing through it - that was the "canvas text looks blurry".
    backgroundColor: '#ffffff',
    boxShadow: '0 6px 20px rgba(15,23,42,0.13), 0 1px 3px rgba(15,23,42,0.08)',
    overflowX: 'auto',
    overflowY: 'hidden',
    transformOrigin: 'top center',
    boxSizing: 'border-box',
    transition:
      'opacity 200ms cubic-bezier(0.16, 1, 0.3, 1), transform 240ms cubic-bezier(0.16, 1, 0.3, 1), visibility 240ms',
  },
  textSelect: {
    padding: '4px 6px',
    fontSize: '0.75rem',
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: '#d1d5db',
    borderRadius: 4,
    outline: 'none',
    color: '#1f2937',
    backgroundColor: '#ffffff',
    fontFamily: 'inherit',
    flexShrink: 0,
  },
  textNum: {
    width: 56,
    padding: '4px 6px',
    fontSize: '0.75rem',
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: '#d1d5db',
    borderRadius: 4,
    outline: 'none',
    color: '#1f2937',
    fontFamily: 'inherit',
    flexShrink: 0,
  },
  textBarLabel: {
    fontSize: '0.65rem',
    color: '#9ca3af',
    fontWeight: 600,
    flexShrink: 0,
    marginLeft: 2,
  },
  textMenuBtn: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 5,
    flexShrink: 0,
    padding: '4px 8px',
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: 'transparent',
    borderRadius: 6,
    backgroundColor: 'transparent',
    color: '#374151',
    fontSize: '0.75rem',
    fontWeight: 600,
    fontFamily: 'inherit',
    whiteSpace: 'nowrap',
    cursor: 'pointer',
  },
  textMenuBtnOn: {
    backgroundColor: '#eff6ff',
    borderColor: '#bfdbfe',
    color: '#1d4ed8',
  },
  textMenu: {
    position: 'fixed',
    zIndex: 60,
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
    padding: 12,
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: '#e2e8f0',
    borderRadius: 10,
    backgroundColor: '#ffffff',
    boxShadow: '0 8px 24px rgba(15,23,42,0.16)',
  },
  textMenuRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
  },
  textMenuLabel: {
    minWidth: 52,
    fontSize: '0.7rem',
    fontWeight: 600,
    color: '#6b7280',
  },
  textMenuValue: {
    width: 24,
    textAlign: 'right',
    fontSize: '0.7rem',
    color: '#374151',
  },
  textMenuSeg: {
    display: 'flex',
    flex: 1,
    gap: 6,
  },
  textMenuCaseBtn: {
    flex: 1,
    height: 32,
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: '#e5e7eb',
    borderRadius: 6,
    backgroundColor: '#ffffff',
    color: '#374151',
    fontSize: '0.8rem',
    fontWeight: 600,
    fontFamily: 'inherit',
    cursor: 'pointer',
  },
  textMenuCaseBtnOn: {
    borderColor: '#2563eb',
    backgroundColor: '#eff6ff',
    color: '#1d4ed8',
    boxShadow: '0 0 0 1px #2563eb',
  },
  textMenuHint: {
    margin: 0,
    fontSize: '0.65rem',
    lineHeight: 1.4,
    color: '#9ca3af',
  },
  effectGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(4, 1fr)',
    gap: 6,
  },
  effectTile: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 4,
    padding: '6px 2px',
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: '#e5e7eb',
    borderRadius: 8,
    backgroundColor: '#ffffff',
    fontFamily: 'inherit',
    cursor: 'pointer',
  },
  effectTileOn: {
    borderColor: '#2563eb',
    backgroundColor: '#eff6ff',
    boxShadow: '0 0 0 1px #2563eb',
  },
  effectSwatch: {
    fontSize: 18,
    fontWeight: 800,
    lineHeight: 1.15,
    color: '#1f2937',
  },
  effectLabel: {
    fontSize: '0.62rem',
    fontWeight: 600,
    color: '#4b5563',
  },
  effectControls: {
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
    paddingTop: 10,
    borderTop: '1px solid #f1f5f9',
  },
  adjustRow: {
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
  },
  adjustLabel: {
    fontSize: '0.72rem',
    fontWeight: 600,
    color: '#374151',
  },
  adjustSlider: {
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
    flex: 1,
    minWidth: 0,
  },
  adjustTrack: {
    height: 6,
    borderRadius: 999,
    border: '1px solid #e5e7eb',
  },
  adjustRange: {
    width: '100%',
    margin: 0,
    accentColor: '#111827',
    cursor: 'pointer',
  },
  adjustReset: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 26,
    height: 26,
    flexShrink: 0,
    padding: 0,
    border: 'none',
    borderRadius: 6,
    backgroundColor: 'transparent',
    color: '#4b5563',
    cursor: 'pointer',
  },
  adjustNumber: {
    width: 64,
    flexShrink: 0,
    padding: '4px 6px',
    fontSize: '0.75rem',
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: '#d1d5db',
    borderRadius: 6,
    outline: 'none',
    color: '#1f2937',
    fontFamily: 'inherit',
  },
  sizeGlyphSmall: { fontWeight: 700, fontSize: 10, lineHeight: 1 },
  sizeGlyphBig: { fontWeight: 700, fontSize: 15, lineHeight: 1 },
  textColorWrap: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 1,
    padding: '3px 5px',
    borderRadius: 4,
    cursor: 'pointer',
    color: '#4b5563',
    position: 'relative',
    flexShrink: 0,
  },
  textColorBar: {
    width: 16,
    height: 4,
    borderRadius: 1,
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: 'rgba(0,0,0,0.12)',
    display: 'block',
  },
  hiddenColor: {
    position: 'absolute',
    inset: 0,
    opacity: 0,
    width: '100%',
    height: '100%',
    cursor: 'pointer',
    padding: 0,
    borderWidth: 0,
    borderStyle: 'none',
  },
  zoomPill: {
    fontSize: '0.7rem',
    fontWeight: 600,
    padding: '4px 8px',
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: '#e5e7eb',
    borderRadius: 4,
    backgroundColor: '#ffffff',
    minWidth: 46,
    textAlign: 'center',
  },
  leftPanel: {
    width: 260,
    backgroundColor: '#f9fafb',
    borderRightWidth: 1,
    borderRightStyle: 'solid',
    borderRightColor: '#e5e7eb',
    display: 'flex',
    flexDirection: 'column',
    flexShrink: 0,
    minHeight: 0,
  },
  rightPanel: {
    width: 300,
    backgroundColor: '#f9fafb',
    borderLeftWidth: 1,
    borderLeftStyle: 'solid',
    borderLeftColor: '#e5e7eb',
    display: 'flex',
    flexDirection: 'column',
    flexShrink: 0,
    minHeight: 0,
  },
  /**
   * A panel's scrolling body. `minHeight: 0` lets it shrink to the panel and
   * scroll inside it rather than grow the page; `overscrollBehavior` keeps a
   * wheel that reaches its end from scrolling the page behind it.
   */
  panelScroll: {
    padding: 12,
    flex: 1,
    minHeight: 0,
    overflowY: 'auto',
    // Up and down only: a panel never scrolls sideways.
    overflowX: 'hidden',
    overscrollBehavior: 'contain',
  },
  tabRow: { display: 'flex', borderBottom: '1px solid #e5e7eb', flexShrink: 0 },
  tabOn: {
    flex: 1,
    padding: 10,
    backgroundColor: '#ffffff',
    borderWidth: 0,
    borderStyle: 'none',
    borderBottomWidth: 2,
    borderBottomStyle: 'solid',
    borderBottomColor: '#3b82f6',
    fontWeight: 600,
    fontSize: '0.8125rem',
    color: '#111827',
    cursor: 'pointer',
  },
  tabOff: {
    flex: 1,
    padding: 10,
    backgroundColor: 'transparent',
    borderWidth: 0,
    borderStyle: 'none',
    borderBottomWidth: 2,
    borderBottomStyle: 'solid',
    borderBottomColor: 'transparent',
    fontWeight: 500,
    fontSize: '0.8125rem',
    color: '#6b7280',
    cursor: 'pointer',
  },
  groupLabel: {
    fontSize: '0.7rem',
    fontWeight: 700,
    color: '#374151',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 10,
  },
  paletteGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, 1fr)',
    gap: 8,
  },
  paletteItem: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '12px 4px',
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: '#e5e7eb',
    borderRadius: 4,
    cursor: 'grab',
    transition: 'border-color 0.15s',
    userSelect: 'none',
  },
  /* ── Editable Fields (the customer's own copy) ─────────────── */
  fieldCard: {
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: '#e5e7eb',
    borderRadius: 8,
    padding: '10px 10px 8px',
    marginBottom: 10,
    backgroundColor: '#ffffff',
  } as React.CSSProperties,
  editFieldLabel: {
    fontSize: '0.72rem',
    fontWeight: 700,
    color: '#0f172a',
    marginBottom: 6,
  } as React.CSSProperties,
  fieldInput: {
    width: '100%',
    boxSizing: 'border-box',
    resize: 'vertical',
    padding: '7px 9px',
    fontSize: '0.78rem',
    fontFamily: 'inherit',
    lineHeight: 1.4,
    color: '#0f172a',
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: '#d1d5db',
    borderRadius: 6,
    outline: 'none',
  } as React.CSSProperties,
  editFieldChip: {
    padding: '3px 8px',
    fontSize: '0.62rem',
    fontWeight: 700,
    color: '#475569',
    backgroundColor: '#f1f5f9',
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: '#e2e8f0',
    borderRadius: 5,
    cursor: 'pointer',
  } as React.CSSProperties,
  personCount: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    padding: '4px 2px 8px',
    fontSize: '0.68rem',
  },
  personList: { display: 'flex', flexDirection: 'column', gap: 6 },
  personRow: {
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
    padding: '8px 10px',
    borderWidth: 1,
    borderStyle: 'solid',
    borderRadius: 4,
    cursor: 'pointer',
    fontSize: '0.7rem',
  },
  personHead: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    cursor: 'pointer',
  },
  personName: {
    fontWeight: 600,
    color: '#374151',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    flex: 1,
  },
  personPreview: {
    fontSize: '0.65rem',
    color: '#9ca3af',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  personControls: { display: 'flex', flexDirection: 'column', gap: 4 },
  personSelect: {
    width: '100%',
    padding: '4px 6px',
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: '#d1d5db',
    borderRadius: 4,
    fontSize: '0.68rem',
    backgroundColor: '#ffffff',
  },
  personReq: {
    display: 'flex',
    alignItems: 'center',
    gap: 5,
    fontSize: '0.66rem',
    color: '#6b7280',
    cursor: 'pointer',
  },
  fieldChip: {
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
    padding: '8px 10px',
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: '#e5e7eb',
    borderRadius: 4,
    cursor: 'grab',
    fontSize: '0.7rem',
    color: '#374151',
  },
  mockupPreviewWrap: {
    position: 'relative',
    width: '100%',
    borderRadius: 8,
    overflow: 'hidden',
    border: '1px solid #e5e7eb',
    backgroundColor: '#f9fafb',
    marginBottom: 8,
  },
  mockupPreview: {
    display: 'block',
    width: '100%',
    height: 'auto',
  },
  canvasColumn: {
    flex: 1,
    minWidth: 0,
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
  },
  canvasFrame: {
    flex: 1,
    position: 'relative',
    minWidth: 0,
    minHeight: 0,
    backgroundColor: '#e2e8f0',
    overflow: 'hidden',
  },
  rulerCorner: {
    position: 'absolute',
    left: 0,
    top: 0,
    width: 22,
    height: 22,
    zIndex: 3,
    backgroundColor: '#f1f5f9',
    borderWidth: 0,
    borderStyle: 'none',
    borderRightWidth: 1,
    borderRightStyle: 'solid',
    borderRightColor: '#cbd5e1',
    borderBottomWidth: 1,
    borderBottomStyle: 'solid',
    borderBottomColor: '#cbd5e1',
    fontSize: '0.55rem',
    fontWeight: 700,
    color: '#475569',
    cursor: 'pointer',
    textTransform: 'uppercase',
    padding: 0,
  },
  rulerH: { position: 'absolute', left: 22, top: 0, zIndex: 2 },
  rulerV: { position: 'absolute', left: 0, top: 22, zIndex: 2 },
  gridInput: {
    width: 46,
    padding: '3px 5px',
    fontSize: '0.7rem',
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: '#d1d5db',
    borderRadius: 4,
    outline: 'none',
    color: '#1f2937',
    fontFamily: 'inherit',
    flexShrink: 0,
  },
  guideHint: {
    position: 'absolute',
    bottom: 12,
    left: '50%',
    transform: 'translateX(-50%)',
    backgroundColor: '#0f172a',
    color: '#ffffff',
    padding: '5px 12px',
    borderRadius: 999,
    fontSize: '0.7rem',
    zIndex: 5,
    pointerEvents: 'none',
  },
  canvasArea: {
    // Absolutely filled rather than flex: the parent frame is position:relative
    // so `flex: 1` collapsed this to zero height and the canvas rendered at the
    // minimum 5% zoom.
    position: 'absolute',
    right: 0,
    bottom: 0,
    backgroundColor: '#e2e8f0',
    overflow: 'hidden',
  },
  bgWorkLayer: {
    position: 'absolute',
    right: 0,
    bottom: 0,
    overflow: 'hidden',
    pointerEvents: 'none',
  },
  bgWorkBox: {
    position: 'absolute',
    overflow: 'hidden',
    borderRadius: 2,
    outline: '2px solid rgba(59, 130, 246, 0.9)',
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
    animation: 'bg-work-pulse 1.6s ease-in-out infinite',
  },
  bgWorkSweep: {
    position: 'absolute',
    inset: 0,
    background:
      'linear-gradient(100deg, transparent 20%, rgba(255, 255, 255, 0.9) 50%, transparent 80%)',
    animation: 'bg-work-sweep 1.3s ease-in-out infinite',
  },
  bgWorkBadge: {
    position: 'absolute',
    transform: 'translate(-50%, -50%)',
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    padding: '6px 10px',
    borderRadius: 999,
    backgroundColor: 'rgba(17, 24, 39, 0.85)',
    color: '#ffffff',
    fontSize: '0.72rem',
    fontWeight: 600,
    whiteSpace: 'nowrap',
    boxShadow: '0 4px 14px rgba(0, 0, 0, 0.18)',
  },
  sectionTitle: {
    fontSize: '0.7rem',
    fontWeight: 700,
    color: '#1e3a8a',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginBottom: 10,
    paddingBottom: 6,
    borderBottomWidth: 1,
    borderBottomStyle: 'solid',
    borderBottomColor: '#e5e7eb',
  },
  fieldLabel: {
    fontSize: '0.6875rem',
    fontWeight: 600,
    color: '#6b7280',
    marginBottom: 4,
  },
  input: {
    width: '100%',
    padding: '6px 8px',
    fontSize: '0.75rem',
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: '#d1d5db',
    borderRadius: 4,
    outline: 'none',
    color: '#1f2937',
    backgroundColor: '#ffffff',
    fontFamily: 'inherit',
    boxSizing: 'border-box',
  },
  // `minmax(0, 1fr)`, not `1fr`: a plain fraction never goes below its content,
  // and a number input's own width is ~150px, so two of them overran the panel
  // and it scrolled sideways.
  grid2: {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
    gap: 8,
  },
  numBox: {
    display: 'flex',
    alignItems: 'center',
    minWidth: 0,
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: '#d1d5db',
    borderRadius: 4,
    backgroundColor: '#ffffff',
    padding: '4px 8px',
    marginBottom: 8,
  },
  numBoxLabel: {
    fontSize: '0.7rem',
    color: '#9ca3af',
    marginRight: 6,
    // Never shrink: a long label like "Border" was being squeezed to 14px by the
    // full-width input and overlapping the number.
    flexShrink: 0,
    whiteSpace: 'nowrap',
  },
  numBoxInput: {
    flex: 1,
    minWidth: 0,
    // Sized by its box, not by the ~150px an input asks for on its own.
    width: '100%',
    borderWidth: 0,
    borderStyle: 'none',
    outline: 'none',
    fontSize: '0.75rem',
    color: '#1f2937',
    fontFamily: 'inherit',
    backgroundColor: 'transparent',
  },
  colorWell: {
    width: 34,
    height: 30,
    padding: 0,
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: '#d1d5db',
    borderRadius: 4,
    cursor: 'pointer',
    backgroundColor: '#fff',
    flexShrink: 0,
  },
  swatchGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(11, 1fr)',
    gap: 3,
  },
  swatch: {
    width: '100%',
    aspectRatio: '1',
    borderRadius: 3,
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: 'transparent',
    cursor: 'pointer',
    padding: 0,
  },
  segBtn: {
    flex: 1,
    padding: '5px 0',
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: '#d1d5db',
    borderRadius: 4,
    backgroundColor: '#ffffff',
    cursor: 'pointer',
    color: '#6b7280',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '0.75rem',
  },
  segBtnOn: {
    backgroundColor: '#eff6ff',
    borderColor: '#3b82f6',
    color: '#2563eb',
  },
  checkRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    fontSize: '0.75rem',
    color: '#374151',
    marginBottom: 10,
    cursor: 'pointer',
    fontWeight: 500,
  },
  hint: {
    fontSize: '0.6875rem',
    color: '#9ca3af',
    lineHeight: 1.5,
    margin: '6px 0',
  },
  btnBlock: {
    width: '100%',
    padding: '8px 12px',
    fontSize: '0.75rem',
    fontWeight: 600,
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: '#d1d5db',
    borderRadius: 4,
    backgroundColor: '#ffffff',
    color: '#374151',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  btnGhost: {
    padding: '6px 12px',
    backgroundColor: 'transparent',
    color: '#374151',
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: '#d1d5db',
    borderRadius: 4,
    cursor: 'pointer',
    fontWeight: 500,
    fontSize: '0.8125rem',
    display: 'flex',
    alignItems: 'center',
    gap: 6,
  },
  btnSecondary: {
    padding: '6px 12px',
    backgroundColor: '#ffffff',
    color: '#1f2937',
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: '#9ca3af',
    borderRadius: 4,
    cursor: 'pointer',
    fontWeight: 600,
    fontSize: '0.8125rem',
    display: 'flex',
    alignItems: 'center',
    gap: 6,
  },
  btnPrimary: {
    padding: '6px 14px',
    backgroundColor: '#3b82f6',
    color: '#ffffff',
    borderWidth: 0,
    borderStyle: 'none',
    borderRadius: 4,
    cursor: 'pointer',
    fontWeight: 600,
    fontSize: '0.8125rem',
    display: 'flex',
    alignItems: 'center',
    gap: 6,
  },
  blockList: {
    borderTopWidth: 1,
    borderTopStyle: 'solid',
    borderTopColor: '#e5e7eb',
    display: 'flex',
    flexDirection: 'column',
    height: 300,
    flexShrink: 0,
  },
  blockListFoot: {
    padding: '5px 10px',
    borderTopWidth: 1,
    borderTopStyle: 'solid',
    borderTopColor: '#e5e7eb',
    backgroundColor: '#f9fafb',
    fontSize: '0.625rem',
    color: '#9ca3af',
    textAlign: 'center',
  },
  stackPos: {
    fontSize: '0.6rem',
    fontWeight: 700,
    color: '#94a3b8',
    minWidth: 12,
    textAlign: 'center',
    flexShrink: 0,
  },
  bgChip: {
    width: 13,
    height: 13,
    borderRadius: 3,
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: '#cbd5e1',
    flexShrink: 0,
    display: 'inline-block',
  },
  blockListHead: {
    padding: '8px 12px',
    backgroundColor: '#f3f4f6',
    borderBottomWidth: 1,
    borderBottomStyle: 'solid',
    borderBottomColor: '#e5e7eb',
    fontSize: '0.7rem',
    fontWeight: 700,
    color: '#374151',
    display: 'flex',
    justifyContent: 'space-between',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  layerRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    padding: '6px 8px',
    borderRadius: 4,
    // Longhand only: mixing `border`/`borderColor` shorthand with the per-side
    // overrides the drop indicator sets makes React warn about conflicts.
    borderStyle: 'solid',
    borderWidth: 1,
    fontSize: '0.7rem',
    color: '#374151',
    cursor: 'pointer',
    marginBottom: 4,
  },
  stopRow: { display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 },
  opacityRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    padding: '2px 8px 6px 30px',
    marginTop: -2,
    marginBottom: 4,
  },
  opacityLabel: {
    fontSize: '0.6rem',
    color: '#94a3b8',
    fontWeight: 600,
    flexShrink: 0,
  },
  opacityRange: {
    flex: 1,
    minWidth: 0,
    height: 3,
    accentColor: '#3b82f6',
    cursor: 'pointer',
  },
  opacityValue: {
    fontSize: '0.6rem',
    color: '#64748b',
    fontWeight: 600,
    minWidth: 28,
    textAlign: 'right',
    flexShrink: 0,
  },
  ctxMenu: {
    position: 'absolute',
    zIndex: 60,
    minWidth: 190,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: '#e2e8f0',
    borderRadius: 6,
    boxShadow: '0 8px 24px rgba(15,23,42,0.18)',
    padding: 4,
  },
  ctxItem: {
    display: 'block',
    width: '100%',
    textAlign: 'left',
    padding: '5px 10px',
    backgroundColor: 'transparent',
    borderWidth: 0,
    borderStyle: 'none',
    borderRadius: 4,
    fontSize: '0.75rem',
    fontFamily: 'inherit',
  },
  ctxSep: { height: 1, backgroundColor: '#f1f5f9', margin: '4px 0' },
  layerName: {
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    maxWidth: 84,
    cursor: 'text',
  },
  renameInput: {
    flex: 1,
    minWidth: 0,
    padding: '1px 4px',
    fontSize: '0.7rem',
    fontFamily: 'inherit',
    color: '#1f2937',
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: '#3b82f6',
    borderRadius: 3,
    outline: 'none',
    backgroundColor: '#ffffff',
  },
  treeToggle: {
    backgroundColor: 'transparent',
    borderWidth: 0,
    borderStyle: 'none',
    padding: 0,
    cursor: 'pointer',
    color: '#64748b',
    display: 'flex',
    alignItems: 'center',
    flexShrink: 0,
  },
  treeRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 5,
    // Longhand: both call sites override paddingLeft for tree indentation.
    paddingTop: 4,
    paddingRight: 8,
    paddingBottom: 4,
    paddingLeft: 8,
    fontSize: '0.66rem',
    color: '#64748b',
    cursor: 'pointer',
    borderRadius: 3,
    marginBottom: 2,
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: '#f1f5f9',
  },
  treeSpine: {
    width: 6,
    height: 1,
    backgroundColor: '#cbd5e1',
    flexShrink: 0,
  },
  maskTag: {
    fontSize: '0.55rem',
    fontWeight: 800,
    color: '#7c3aed',
    backgroundColor: '#ede9fe',
    padding: '1px 4px',
    borderRadius: 3,
    flexShrink: 0,
  },
  modeBanner: {
    position: 'fixed',
    bottom: 24,
    left: '50%',
    transform: 'translateX(-50%)',
    backgroundColor: '#1e293b',
    color: '#ffffff',
    padding: '8px 12px 8px 14px',
    borderRadius: 999,
    fontSize: '0.75rem',
    fontWeight: 500,
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    zIndex: 150,
    boxShadow: '0 4px 14px rgba(0,0,0,0.25)',
  },
  modeBannerBtn: {
    backgroundColor: '#3b82f6',
    color: '#ffffff',
    borderWidth: 0,
    borderStyle: 'none',
    borderRadius: 999,
    padding: '3px 12px',
    fontSize: '0.7rem',
    fontWeight: 600,
    cursor: 'pointer',
  },
  editableTag: {
    fontSize: '0.55rem',
    fontWeight: 800,
    color: '#15803d',
    backgroundColor: '#dcfce7',
    padding: '1px 4px',
    borderRadius: 3,
    flexShrink: 0,
  },
  mergeTag: {
    fontSize: '0.55rem',
    fontWeight: 700,
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
    color: '#0f766e',
    backgroundColor: '#ccfbf1',
    border: '1px dashed #5eead4',
    padding: '0 4px',
    borderRadius: 3,
    flexShrink: 0,
    maxWidth: 92,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  modalBackdrop: {
    position: 'fixed',
    inset: 0,
    backgroundColor: 'rgba(15,23,42,0.65)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 100,
    padding: 32,
  },
  modal: {
    backgroundColor: '#ffffff',
    borderRadius: 8,
    // A width, not just a ceiling. Sized to the artwork rather than left to
    // hug it: the preview renders at 900px, and a modal that shrank to fit
    // showed a business card as a postage stamp in the middle of the screen.
    width: 'min(1000px, 92vw)',
    maxWidth: '92vw',
    maxHeight: '92vh',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
    boxShadow: '0 20px 40px rgba(0,0,0,0.3)',
  },
  modalHead: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '10px 14px',
    borderBottomWidth: 1,
    borderBottomStyle: 'solid',
    borderBottomColor: '#e5e7eb',
    gap: 24,
  },
  saveStatus: {
    fontSize: '0.7rem',
    color: '#94a3b8',
    fontWeight: 500,
    whiteSpace: 'nowrap',
    minWidth: 92,
    textAlign: 'right',
  },
  versionRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    padding: '8px 6px',
    borderBottomWidth: 1,
    borderBottomStyle: 'solid',
    borderBottomColor: '#f1f5f9',
  },
  versionThumb: {
    width: 40,
    height: 40,
    objectFit: 'contain',
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: '#e2e8f0',
    borderRadius: 4,
    flexShrink: 0,
  },
  modalBody: { padding: 20, overflow: 'auto', backgroundColor: '#f1f5f9' },
  previewImg: {
    display: 'block',
    maxWidth: '100%',
    // Leaves room for the modal's own header and the side buttons under the
    // artwork; taller than this and the buttons fall off the bottom.
    maxHeight: '72vh',
    boxShadow: '0 2px 12px rgba(0,0,0,0.15)',
  },
  toast: {
    position: 'fixed',
    bottom: 24,
    left: '50%',
    transform: 'translateX(-50%)',
    color: '#ffffff',
    padding: '10px 18px',
    borderRadius: 6,
    fontSize: '0.8125rem',
    fontWeight: 500,
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    zIndex: 200,
    boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
  },
}
