// src/lib/design/export.ts
//
// Raster, vector and print-ready output. Everything renders the print area only,
// with editor chrome (rulers, guides, grid) hidden and the viewport neutralised
// so zoom/pan never leak into the artwork.

import { fabric } from 'fabric'
import type { CanvasSize, DesignUnit } from '@/types/design'
import { UNIT_TO_PX } from '@/types/design'
import { isChrome, type FabricAny } from './serialize'

export type RasterFormat = 'png' | 'jpeg'

export type ExportArea = {
  left: number
  top: number
  width: number
  height: number
}

export type ExportOptions = {
  /** Output resolution. 300 for print, 96 for screen. */
  dpi?: number
  /** Explicit pixel width; overrides dpi when set. */
  pixelWidth?: number
  quality?: number
  /** Extra bleed (canvas px) to include beyond the trim box. */
  bleedPx?: number
  background?: string
}

type RenderScope = {
  canvas: fabric.Canvas
  area: ExportArea
}

/**
 * Hide chrome and reset the viewport, run `fn`, then restore everything.
 * Hidden and locked-invisible layers stay hidden - export respects layer state.
 */
function withCleanCanvas<T>(canvas: fabric.Canvas, fn: () => T): T {
  const chrome = (canvas.getObjects() as FabricAny[]).filter(
    (o) => isChrome(o) && !o.isPrintArea
  )
  const wasVisible = chrome.map((o) => o.visible)
  chrome.forEach((o) => o.set('visible', false))

  const active = canvas.getActiveObject()
  canvas.discardActiveObject()

  const vpt = canvas.viewportTransform
    ? ([...canvas.viewportTransform] as number[])
    : null
  canvas.setViewportTransform([1, 0, 0, 1, 0, 0])
  canvas.renderAll()

  try {
    return fn()
  } finally {
    if (vpt)
      canvas.setViewportTransform(
        vpt as fabric.Canvas['viewportTransform'] & number[]
      )
    chrome.forEach((o, i) => o.set('visible', wasVisible[i]))
    if (active) canvas.setActiveObject(active)
    canvas.requestRenderAll()
  }
}

/** Multiplier that turns the 96 dpi working canvas into the requested output. */
export function resolveMultiplier(
  area: ExportArea,
  opts: ExportOptions
): number {
  if (opts.pixelWidth && area.width > 0) return opts.pixelWidth / area.width
  return Math.max(0.1, (opts.dpi ?? 96) / 96)
}

/* ── Raster ─────────────────────────────────────────────────────── */

export function exportRaster(
  { canvas, area }: RenderScope,
  format: RasterFormat = 'png',
  opts: ExportOptions = {}
): string {
  const bleed = opts.bleedPx ?? 0
  return withCleanCanvas(canvas, () => {
    try {
      return canvas.toDataURL({
        format,
        quality: opts.quality ?? 0.95,
        left: area.left - bleed,
        top: area.top - bleed,
        width: area.width + bleed * 2,
        height: area.height + bleed * 2,
        multiplier: resolveMultiplier(area, opts),
      })
    } catch {
      // Tainted canvas - a cross-origin image without CORS headers.
      return ''
    }
  })
}

/* ── SVG ────────────────────────────────────────────────────────── */

/** Vector-preserving output. Text stays text, shapes stay paths. */
export function exportSVG({ canvas, area }: RenderScope): string {
  return withCleanCanvas(canvas, () =>
    canvas.toSVG({
      viewBox: {
        x: area.left,
        y: area.top,
        width: area.width,
        height: area.height,
      },
      width: `${area.width}`,
      height: `${area.height}`,
    } as fabric.IToSVGOptions)
  )
}

/* ── PDF ────────────────────────────────────────────────────────── */

export type PdfOptions = ExportOptions & {
  /** Draw crop marks and a bleed boundary outside the trim box. */
  cropMarks?: boolean
  /** Bleed in the document's own unit. */
  bleed?: number
}

const PT_PER_UNIT: Record<DesignUnit, number> = {
  in: 72,
  mm: 72 / 25.4,
  px: 72 / 96,
}

/**
 * Print-ready PDF. The page is sized in real-world units (not pixels), the
 * artwork is placed at the requested dpi, and crop marks sit in the bleed.
 */
export async function exportPDF(
  scope: RenderScope,
  size: CanvasSize,
  opts: PdfOptions = {}
): Promise<Blob | null> {
  return exportPDFPages([scope], size, opts)
}

/**
 * One PDF, one page per side.
 *
 * A business card is two pieces of artwork that print together, and a proof
 * that showed only the front would be approving half of what arrives. Each
 * scope is a rendered canvas; they share the page size, the bleed and the crop
 * marks, because they are the same physical item.
 *
 * Returns null if any side fails to rasterise -- a tainted canvas, usually --
 * rather than a PDF that is silently missing a page.
 */
export async function exportPDFPages(
  scopes: readonly RenderScope[],
  size: CanvasSize,
  opts: PdfOptions = {}
): Promise<Blob | null> {
  if (scopes.length === 0) return null
  const { jsPDF } = await import('jspdf')

  const dpi = opts.dpi ?? size.dpi ?? 300
  const bleedUnits = opts.bleed ?? 0
  const bleedPx = bleedUnits * UNIT_TO_PX[size.unit]
  const marks = opts.cropMarks ?? false
  // Room for the marks themselves, beyond the bleed.
  const marginUnits = marks ? Math.max(bleedUnits, 0.25) : bleedUnits

  const trimW = size.width
  const trimH = size.height
  const pageW = trimW + marginUnits * 2
  const pageH = trimH + marginUnits * 2

  const toPt = PT_PER_UNIT[size.unit]
  const doc = new jsPDF({
    unit: 'pt',
    format: [pageW * toPt, pageH * toPt],
    orientation: pageW >= pageH ? 'landscape' : 'portrait',
    compress: true,
  })

  // Artwork covers trim + bleed, centred inside the page margin.
  const artUnits = {
    x: marginUnits - bleedUnits,
    y: marginUnits - bleedUnits,
    w: trimW + bleedUnits * 2,
    h: trimH + bleedUnits * 2,
  }

  for (const [index, scope] of scopes.entries()) {
    const image = exportRaster(scope, 'png', { dpi, bleedPx })
    if (!image) return null

    // jsPDF opens with a page already on it, so only the sides after the first
    // ask for one.
    if (index > 0) doc.addPage([pageW * toPt, pageH * toPt])

    doc.addImage(
      image,
      'PNG',
      artUnits.x * toPt,
      artUnits.y * toPt,
      artUnits.w * toPt,
      artUnits.h * toPt,
      undefined,
      'FAST'
    )

    if (marks) drawCropMarks(doc, { marginUnits, trimW, trimH, toPt })
  }

  return doc.output('blob')
}

function drawCropMarks(
  doc: import('jspdf').jsPDF,
  {
    marginUnits,
    trimW,
    trimH,
    toPt,
  }: { marginUnits: number; trimW: number; trimH: number; toPt: number }
) {
  const len = Math.min(marginUnits * 0.6, 0.2) * toPt // mark length
  const gap = Math.min(marginUnits * 0.25, 0.08) * toPt // offset from trim edge
  const L = marginUnits * toPt
  const T = marginUnits * toPt
  const R = (marginUnits + trimW) * toPt
  const B = (marginUnits + trimH) * toPt

  doc.setLineWidth(0.5)
  doc.setDrawColor(0, 0, 0)

  const corners: [number, number, number, number][] = [
    // top-left
    [L - gap, T, L - gap - len, T],
    [L, T - gap, L, T - gap - len],
    // top-right
    [R + gap, T, R + gap + len, T],
    [R, T - gap, R, T - gap - len],
    // bottom-left
    [L - gap, B, L - gap - len, B],
    [L, B + gap, L, B + gap + len],
    // bottom-right
    [R + gap, B, R + gap + len, B],
    [R, B + gap, R, B + gap + len],
  ]
  corners.forEach(([x1, y1, x2, y2]) => doc.line(x1, y1, x2, y2))
}

/* ── Download helpers ───────────────────────────────────────────── */

export function downloadDataUrl(dataUrl: string, filename: string) {
  const a = document.createElement('a')
  a.href = dataUrl
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  downloadDataUrl(url, filename)
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export function downloadText(
  text: string,
  filename: string,
  mime = 'image/svg+xml'
) {
  downloadBlob(new Blob([text], { type: mime }), filename)
}

export function safeFilename(name: string): string {
  return (
    (name || 'template')
      .replace(/[^\w\-. ]+/g, '')
      .trim()
      .replace(/\s+/g, '-') || 'template'
  )
}
