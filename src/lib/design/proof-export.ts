// src/lib/design/proof-export.ts
//
// Exporting a buyer's personalised proof.
//
// ---------------------------------------------------------------------------
// Why this renders rather than screenshots
// ---------------------------------------------------------------------------
// The on-screen proof is CSS: positioned divs approximating the artwork well
// enough for a buyer to check their wording. Capturing it would hand a printer
// the browser's font fallbacks, its rounding, and whatever the layout engine
// did with a box that was one pixel short.
//
// So the export goes back to the design document — the same one the builder
// saved and the same one INT-01 will eventually send to production — replaces
// the text of the layers this buyer was allowed to change, and renders that.
// What comes out is the artwork, not a picture of a web page.
//
// The canvas is offscreen and always disposed. Nothing here touches the proof
// the buyer is looking at.

import { fabric } from 'fabric'
import type { PrintTemplate } from '@/types'
import type { DesignDocument, DesignObject } from '@/types/design'
import { renderCodeBitmap } from './codes'
import { objectsToCanvas } from './serialize'
import { unloadedImageSources } from './image-load'
import { exportPDFPages, downloadBlob, safeFilename } from './export'

/** Pixels per unit at 96dpi, matching the builder's own conversion. */
const UNIT_TO_PX: Record<PrintTemplate['dimensions']['unit'], number> = {
  in: 96,
  mm: 96 / 25.4,
  px: 1,
}

/** The widest a side preview is drawn, whatever the caller has room for. */
const MAX_PREVIEW_PX = 4096

/**
 * No placeholder, deliberately.
 *
 * The builder passes specimen values so an administrator can size a code space
 * before anybody has a payload. A buyer's proof must not: a specimen code where
 * their own has not been entered is a proof that lies about what will print.
 */
const renderCode = (type: 'barcode' | 'qrcode', value: string) =>
  renderCodeBitmap(type, value)

/** The fields of a design object this module reads or writes. */
type EditableNode = DesignObject & {
  objects?: EditableNode[]
  fieldKey?: string
  id?: string
  isEditableBySiteUser?: boolean
  text?: string
}

/**
 * Swaps in what the buyer typed, walking groups.
 *
 * Matched on `fieldKey` first and the object id second — the same key the
 * customiser submits and the server validates against, so a value that reached
 * the order reaches the export too.
 *
 * Anything the buyer could not edit is returned untouched. That is the point:
 * this renders the artwork that will print, not a version the browser was
 * talked into.
 */
function applyValues(
  objects: EditableNode[],
  values: Record<string, string>
): EditableNode[] {
  return objects.map((object) => {
    if (Array.isArray(object.objects)) {
      return { ...object, objects: applyValues(object.objects, values) }
    }

    if (!object.isEditableBySiteUser) return object

    const key = object.fieldKey ?? object.id ?? ''
    const value = values[key]
    if (typeof value !== 'string' || value.length === 0) return object

    return { ...object, text: value }
  })
}

export interface ProofRender {
  canvas: fabric.Canvas
  area: { left: number; top: number; width: number; height: number }
}

/**
 * Builds an offscreen canvas holding the personalised artwork.
 *
 * Separate from `exportProof` so a caller that wants the pixels rather than a
 * file — a thumbnail, a confirmation screen — does not have to download one to
 * get them. Whoever calls it owns disposing the canvas.
 */
/**
 * Which sides this proof is of.
 *
 * The front always. Then the back the buyer is ordering: the one the document
 * names as chosen, or the only one there is. A design with no backs is one
 * page, which is most of them.
 */
export function proofSides(
  design: DesignDocument
): { name: string; objects: DesignObject[] }[] {
  const sides = [{ name: 'Front', objects: design.objects ?? [] }]
  const backs = design.backs ?? []
  if (backs.length === 0) return sides

  const chosen =
    backs.find((side) => side.id === design.defaultBackId) ?? backs[0]
  sides.push({ name: chosen.name, objects: chosen.objects ?? [] })
  return sides
}

export async function renderProofToCanvas(
  template: PrintTemplate,
  values: Record<string, string>,
  /** Which side to draw. 0 is the front; see `proofSides`. */
  sideIndex = 0
): Promise<ProofRender> {
  const design = template.design as DesignDocument | undefined
  if (!design) throw new Error('This design has no export data.')

  const factor = UNIT_TO_PX[template.dimensions.unit] ?? 96
  const width = Math.max(1, Math.round(template.dimensions.width * factor))
  const height = Math.max(1, Math.round(template.dimensions.height * factor))

  const element = document.createElement('canvas')
  element.width = width
  element.height = height

  // StaticCanvas, not Canvas: there is nothing to interact with, and the
  // interactive one installs document-level listeners that would outlive this.
  // Typed as Canvas because that is what the shared helpers take, and a static
  // canvas satisfies every method they call on it.
  const canvas = new fabric.StaticCanvas(element, {
    width,
    height,
    backgroundColor:
      design.background && design.background !== 'transparent'
        ? (design.background as string)
        : template.canvasConfig?.backgroundColor || '#ffffff',
  }) as unknown as fabric.Canvas

  const sides = proofSides(design)
  const side = sides[Math.min(sideIndex, sides.length - 1)]

  await objectsToCanvas(
    canvas,
    applyValues(side.objects as EditableNode[], values) as DesignObject[],
    renderCode,
    design.meta?.version
  )

  canvas.renderAll()

  return { canvas, area: { left: 0, top: 0, width, height } }
}

/**
 * A picture of one side, at whatever width the caller has room for.
 *
 * Rendered rather than screenshotted, for the same reason the PDF is: this is
 * what will print. Used wherever a side has to be *shown* rather than exported
 * — the back a buyer is picking between, the front and back on a proof.
 *
 * Returns an empty string rather than throwing when the canvas cannot be read,
 * which happens with an image loaded from a host that sent no CORS headers. A
 * missing thumbnail is a gap in a grid; an exception is a blank screen.
 */
export async function renderSidePreview(
  template: PrintTemplate,
  objects: DesignObject[],
  values: Record<string, string> = {},
  maxWidth = 320
): Promise<string> {
  const design = template.design as DesignDocument | undefined
  if (!design) return ''

  const factor = UNIT_TO_PX[template.dimensions.unit] ?? 96
  const width = Math.max(1, Math.round(template.dimensions.width * factor))
  const height = Math.max(1, Math.round(template.dimensions.height * factor))

  const element = document.createElement('canvas')
  element.width = width
  element.height = height

  const canvas = new fabric.StaticCanvas(element, {
    width,
    height,
    backgroundColor:
      design.background && design.background !== 'transparent'
        ? (design.background as string)
        : template.canvasConfig?.backgroundColor || '#ffffff',
  }) as unknown as fabric.Canvas

  try {
    await objectsToCanvas(
      canvas,
      applyValues(objects as EditableNode[], values) as DesignObject[],
      renderCode,
      design.meta?.version
    )
    canvas.renderAll()
    // Scaled to the width asked for, up as well as down. Capping this at 1 drew
    // a 3.5in card at 336px and left the browser to stretch it into a 760px
    // modal — which is why the preview was soft. Fabric redraws the vectors at
    // the new scale, so going up costs nothing in sharpness; the ceiling only
    // keeps a huge `maxWidth` from asking for a canvas the browser will refuse.
    return canvas.toDataURL({
      format: 'png',
      multiplier: Math.min(maxWidth, MAX_PREVIEW_PX) / width,
    })
  } catch {
    return ''
  } finally {
    canvas.dispose()
  }
}

/** One object's box on a side preview, in the preview's own pixels. */
export interface PreviewBounds {
  x: number
  y: number
  w: number
  h: number
}

/** A side preview together with where each object landed on it. */
export interface SidePreviewWithBounds {
  /** Empty when the canvas could not be read (an image with no CORS headers). */
  dataUrl: string
  /** The preview's size in pixels — the space `bounds` is measured in. */
  width: number
  height: number
  /** Keyed by design object id, groups and their children alike. */
  bounds: Record<string, PreviewBounds>
}

type MeasurableObject = fabric.Object & {
  designId?: string
  _getNonTransformedDimensions?: () => { x: number; y: number }
  getObjects?: () => fabric.Object[]
}

/**
 * The same picture `renderSidePreview` draws, plus each object's box on it.
 *
 * A sibling rather than a change to `renderSidePreview`, whose callers want a
 * string and nothing else. The boxes are what lets a review screen point at
 * "this is the text you have not changed" on the picture itself.
 *
 * Measured through each object's full transform matrix rather than
 * `getBoundingRect`: fabric 5 measures a grouped child against its group's
 * centre, and the matrix is the one thing that carries the group's own
 * position, rotation and scale.
 */
export async function renderSidePreviewWithBounds(
  template: PrintTemplate,
  objects: DesignObject[],
  values: Record<string, string> = {},
  maxWidth = 960,
  options: { format?: 'png' | 'jpeg'; quality?: number } = {}
): Promise<SidePreviewWithBounds> {
  const factor = UNIT_TO_PX[template.dimensions.unit] ?? 96
  const width = Math.max(1, Math.round(template.dimensions.width * factor))
  const height = Math.max(1, Math.round(template.dimensions.height * factor))
  const scale = Math.min(maxWidth, MAX_PREVIEW_PX) / width
  const outWidth = Math.max(1, Math.round(width * scale))
  const outHeight = Math.max(1, Math.round(height * scale))
  const empty: SidePreviewWithBounds = {
    dataUrl: '',
    width: outWidth,
    height: outHeight,
    bounds: {},
  }

  const design = template.design as DesignDocument | undefined
  if (!design) return empty

  const element = document.createElement('canvas')
  element.width = width
  element.height = height

  const canvas = new fabric.StaticCanvas(element, {
    width,
    height,
    backgroundColor:
      design.background && design.background !== 'transparent'
        ? (design.background as string)
        : template.canvasConfig?.backgroundColor || '#ffffff',
  }) as unknown as fabric.Canvas

  try {
    const built = await objectsToCanvas(
      canvas,
      applyValues(objects as EditableNode[], values) as DesignObject[],
      renderCode,
      design.meta?.version
    )
    canvas.renderAll()

    const bounds: Record<string, PreviewBounds> = {}
    const measure = (object: fabric.Object) => {
      const node = object as MeasurableObject
      const matrix = object.calcTransformMatrix()
      const dims =
        typeof node._getNonTransformedDimensions === 'function'
          ? node._getNonTransformedDimensions()
          : { x: object.width ?? 0, y: object.height ?? 0 }
      const corners = [
        [-1, -1],
        [1, -1],
        [1, 1],
        [-1, 1],
      ].map(([sx, sy]) =>
        fabric.util.transformPoint(
          new fabric.Point((sx * dims.x) / 2, (sy * dims.y) / 2),
          matrix
        )
      )
      const xs = corners.map((point) => point.x)
      const ys = corners.map((point) => point.y)
      // Clipped to the artboard: a box hanging off the edge would point at
      // somewhere the buyer cannot see.
      const left = Math.max(0, Math.min(...xs))
      const top = Math.max(0, Math.min(...ys))
      const right = Math.min(width, Math.max(...xs))
      const bottom = Math.min(height, Math.max(...ys))
      if (node.designId && right > left && bottom > top) {
        bounds[node.designId] = {
          x: left * scale,
          y: top * scale,
          w: (right - left) * scale,
          h: (bottom - top) * scale,
        }
      }
      if (object.type === 'group' && typeof node.getObjects === 'function') {
        node.getObjects().forEach(measure)
      }
    }
    built.forEach(measure)

    let dataUrl = ''
    try {
      dataUrl = canvas.toDataURL({
        format: options.format ?? 'png',
        quality: options.quality ?? 0.9,
        multiplier: scale,
      })
    } catch {
      // Tainted by an image from a host with no CORS headers. The boxes are
      // still right; there is just no picture to put them on.
      dataUrl = ''
    }
    return { dataUrl, width: outWidth, height: outHeight, bounds }
  } catch {
    return empty
  } finally {
    canvas.dispose()
  }
}

/**
 * Renders the personalised proof and downloads it as a print-ready PDF.
 *
 * Bleed and crop marks come from the template, so what the buyer downloads
 * carries the same trim allowance the production file will.
 */
export async function exportProof({
  template,
  values,
  filename,
}: {
  template: PrintTemplate
  values: Record<string, string>
  filename: string
}): Promise<void> {
  const design = template.design as DesignDocument | undefined
  if (!design) throw new Error('This design has no export data.')

  // One canvas per side, all built before any of them is rasterised: a card is
  // one item that happens to have two faces, and a proof of half of it is not a
  // proof.
  const renders: ProofRender[] = []
  for (let index = 0; index < proofSides(design).length; index += 1) {
    renders.push(await renderProofToCanvas(template, values, index))
  }
  try {
    // A picture that would not load is drawn as a marked box. Fine on a
    // screen, where it says what it is; not in a file a printer works from.
    const missing = renders.reduce(
      (n, render) =>
        n + unloadedImageSources(render.canvas.getObjects()).length,
      0
    )
    if (missing > 0) {
      throw new Error(
        `${missing === 1 ? '1 picture' : `${missing} pictures`} in this design could not be loaded from the image library, so the proof was not exported. Try again in a moment.`
      )
    }

    const blob = await exportPDFPages(
      renders.map((render) => ({ canvas: render.canvas, area: render.area })),
      { ...template.dimensions, dpi: 300 },
      {
        dpi: 300,
        bleed: template.bleedMargin || 0,
        cropMarks: (template.bleedMargin || 0) > 0,
      }
    )

    if (!blob) {
      // `exportPDF` returns null when the canvas is tainted — an image loaded
      // from a host that sent no CORS headers. Saying so beats a silent no-op.
      throw new Error(
        'The proof could not be exported because an image in it is not readable. ' +
          'Ask an administrator to re-upload the artwork.'
      )
    }

    downloadBlob(blob, `${safeFilename(filename)}.pdf`)
  } finally {
    // Always disposed: an offscreen canvas left behind holds its bitmap, and a
    // buyer exporting a few proofs would accumulate them for the session.
    renders.forEach((render) => render.canvas.dispose())
  }
}
