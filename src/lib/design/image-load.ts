// src/lib/design/image-load.ts
//
// Loading a picture onto the canvas when the address may not answer.
//
// Pictures used to be data URLs, which always load. A picture in the image
// library is an address, and an address can stop answering: the file was
// removed, the host is down, the session behind it lapsed. fabric 5's own
// loaders handle that badly. `fabric.Image.fromURL` hands its callback a 0×0
// image with no bitmap, whose `getSrc()` is '' — so a design opened like that
// saves the picture away — and anything that then reads the missing bitmap
// (filters do) throws inside the image's `onerror`, so the callback never
// finishes and whatever awaited it waits forever. `setSrc` empties the picture
// before it reports the failure. `fabric.Image.fromObject` drops the object.
//
// So every load that can meet an address goes through here: it answers null
// rather than a broken image, and never leaves a promise unsettled. A picture
// that cannot be drawn is stood in for by a marked box that keeps the address
// and the geometry, so saving the design writes the picture back unchanged.

import { fabric } from 'fabric'
// For its prototype defaults, which must be in place before any object is made.
import './fabric-defaults'

type FabricAny = fabric.Object & Record<string, any>

/** How long a picture may take before it is treated as not loading at all. */
const LOAD_TIMEOUT_MS = 60_000

/**
 * The fabric property a stand-in keeps the picture's address under.
 *
 * Not `src`: fabric writes `src` only for images, and the stand-in is a
 * rectangle. Listed in `CUSTOM_PROPS`, so undo snapshots and `canvasJson` keep
 * it too.
 */
export const UNLOADED_SRC_PROP = 'unloadedSrc'

/** What a stand-in says on the canvas. */
export const UNLOADED_IMAGE_LABEL = 'Picture could not be loaded'

/**
 * The picture's bitmap, or null when it will not load.
 *
 * With `crossOrigin="anonymous"` for an address — as the canvas needs it to
 * stay exportable — unless `crossOrigin` says otherwise; a data URL ignores the
 * setting. Never rejects.
 */
export function loadImageElementOrNull(
  src: string,
  options: { crossOrigin?: string | null; timeoutMs?: number } = {}
): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    if (!src || typeof window === 'undefined') return resolve(null)
    let settled = false
    const settle = (el: HTMLImageElement | null) => {
      if (settled) return
      settled = true
      window.clearTimeout(timer)
      resolve(el)
    }
    // A host that accepts the connection and never answers would otherwise
    // hold a design's opening for as long as the browser cares to wait.
    const timer = window.setTimeout(
      () => settle(null),
      options.timeoutMs ?? LOAD_TIMEOUT_MS
    )
    const crossOrigin =
      options.crossOrigin === undefined ? 'anonymous' : options.crossOrigin
    try {
      fabric.util.loadImage(
        src,
        (el: HTMLImageElement | null, isError?: boolean) =>
          settle(isError || !el ? null : el),
        null,
        crossOrigin ?? undefined
      )
    } catch {
      settle(null)
    }
  })
}

/** A fabric image of the picture, or null when it will not load. */
export async function loadFabricImage(
  src: string,
  options?: fabric.IImageOptions
): Promise<fabric.Image | null> {
  const el = await loadImageElementOrNull(src)
  if (!el) return null
  try {
    return new fabric.Image(el, options)
  } catch {
    return null
  }
}

/**
 * Draws the stand-in's mark over its fill: a dashed edge and the label.
 *
 * Drawn by overriding `_render`, as `applyPlaceholderLabel` does, so the
 * stand-in stays one object. Unscaled, so the words stay legible type however
 * the box is sized. Instance-only, so it is put back after an undo rebuilds
 * the object — see `markUnloadedImages`.
 */
function applyUnloadedLabel(obj: FabricAny): void {
  if (obj.__unloadedLabel) return
  obj.__unloadedLabel = true
  obj.dirty = true
  const base = Object.getPrototypeOf(obj)._render as (
    ctx: CanvasRenderingContext2D
  ) => void

  obj._render = function (this: FabricAny, ctx: CanvasRenderingContext2D) {
    base.call(this, ctx)
    const sx = Math.abs(this.scaleX || 1) || 1
    const sy = Math.abs(this.scaleY || 1) || 1
    const w = (this.width || 0) * sx
    const h = (this.height || 0) * sy

    ctx.save()
    ctx.scale(1 / sx, 1 / sy)
    ctx.setLineDash([6, 4])
    ctx.lineWidth = 1.5
    ctx.strokeStyle = '#dc2626'
    ctx.strokeRect(-w / 2 + 0.75, -h / 2 + 0.75, w - 1.5, h - 1.5)
    if (w >= 24 && h >= 16) {
      const size = Math.max(9, Math.min(16, w / 13))
      ctx.font = `600 ${size}px Inter, system-ui, sans-serif`
      ctx.fillStyle = '#991b1b'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      const lines: string[] = []
      let line = ''
      for (const word of UNLOADED_IMAGE_LABEL.split(' ')) {
        const next = line ? `${line} ${word}` : word
        if (line && ctx.measureText(next).width > w * 0.86) {
          lines.push(line)
          line = word
        } else {
          line = next
        }
      }
      if (line) lines.push(line)
      const lineHeight = size * 1.3
      const top = -((lines.length - 1) * lineHeight) / 2
      lines.forEach((l, i) => ctx.fillText(l, 0, top + i * lineHeight))
    }
    ctx.restore()
  }
}

/** The stand-in's own look: a pale warning fill and no stroke to measure. */
const STAND_IN_STYLE = {
  fill: 'rgba(254, 226, 226, 0.85)',
  // Zero, so the box fabric measures is exactly the picture's box and a save
  // writes back the size the picture had.
  strokeWidth: 0,
  stroke: null,
  strokeDashArray: null,
}

/**
 * A marked box standing where a picture that would not load belongs.
 *
 * `options` is the picture's placement — position, size, angle — and `src` its
 * address, which the box keeps so a save writes the picture back as it was.
 * The caller tags it (designType / customType, bindings) like the picture.
 */
export function unloadedImagePlaceholder(
  options: fabric.IRectOptions,
  src: string
): FabricAny {
  // Through `unknown`: fabric's own "no stroke" is null, which its typings
  // do not allow for.
  const box = new fabric.Rect({
    ...options,
    ...STAND_IN_STYLE,
  } as unknown as fabric.IRectOptions) as FabricAny
  box[UNLOADED_SRC_PROP] = src
  applyUnloadedLabel(box)
  return box
}

/** Every stand-in among these objects, groups included, top-level first. */
function collectUnloaded(objects: fabric.Object[], out: FabricAny[]) {
  for (const o of objects as FabricAny[]) {
    if (!o) continue
    if (typeof o[UNLOADED_SRC_PROP] === 'string') out.push(o)
    if (o.type === 'group' && typeof o.getObjects === 'function') {
      collectUnloaded(o.getObjects(), out)
    }
  }
  return out
}

/** The addresses of the pictures standing in among these objects. */
export function unloadedImageSources(objects: fabric.Object[]): string[] {
  return collectUnloaded(objects, []).map((o) => o[UNLOADED_SRC_PROP] as string)
}

/**
 * Puts the mark back on every stand-in among these objects.
 *
 * An undo, or `loadFromJSON`, rebuilds a stand-in as a plain rectangle: the
 * address survives as data, the drawing override does not.
 */
export function markUnloadedImages(objects: fabric.Object[]): void {
  collectUnloaded(objects, []).forEach(applyUnloadedLabel)
}

/** What the user is told when pictures in a design would not load. */
export function unloadedImagesMessage(count: number): string {
  return count === 1
    ? '1 picture could not be loaded from the image library. It stays in the design, marked on the canvas.'
    : `${count} pictures could not be loaded from the image library. They stay in the design, marked on the canvas.`
}

/* ── Snapshots: fabric's own `toObject` data ────────────────────── */

type Snapshot = Record<string, unknown>

/**
 * A picture's snapshot turned into its stand-in's: a rectangle with the same
 * placement, the address kept, and every custom property (bindings, crop,
 * frame) carried over so the document it saves to is unchanged.
 */
function standInSnapshot(data: Snapshot): Snapshot {
  const next: Snapshot = { ...data, ...STAND_IN_STYLE, type: 'rect' }
  delete next.src
  delete next.crossOrigin
  delete next.filters
  delete next.resizeFilter
  delete next.cropX
  delete next.cropY
  next[UNLOADED_SRC_PROP] = data.src
  // A picture with no kind of its own would be saved as a shape.
  if (!next.designType && !next.customType) next.customType = 'image'
  return next
}

/**
 * These snapshots with every picture that will not load replaced by its
 * stand-in, looking inside groups. The same object comes back when nothing
 * had to change.
 *
 * Each picture is loaded the way fabric will load it — with the
 * `crossOrigin` it recorded — so a picture judged loadable here is one
 * fabric's own rebuild will get.
 */
export async function withUnloadableImagesReplaced(
  data: Snapshot
): Promise<Snapshot> {
  if (data.type === 'image' && typeof data.src === 'string' && data.src) {
    const el = await loadImageElementOrNull(data.src, {
      crossOrigin: (data.crossOrigin as string | null | undefined) ?? null,
    })
    return el ? data : standInSnapshot(data)
  }
  const children = data.objects
  if (!Array.isArray(children)) return data
  let changed = false
  const mapped = await Promise.all(
    children.map(async (child) => {
      if (!child || typeof child !== 'object') return child
      const next = await withUnloadableImagesReplaced(child as Snapshot)
      if (next !== child) changed = true
      return next
    })
  )
  return changed ? { ...data, objects: mapped } : data
}

/** `fabric.util.enlivenObjects` for one snapshot. Never rejects. */
function enliven(data: Snapshot): Promise<FabricAny | null> {
  return new Promise((resolve) => {
    try {
      fabric.util.enlivenObjects(
        [data],
        (objs: fabric.Object[]) => resolve((objs?.[0] as FabricAny) || null),
        ''
      )
    } catch {
      resolve(null)
    }
  })
}

/** How many objects a snapshot describes, its group's children included. */
function snapshotCount(data: Snapshot): number {
  if (data.type !== 'group' || !Array.isArray(data.objects)) return 1
  return (data.objects as Snapshot[]).reduce(
    (n, child) =>
      n + (child && typeof child === 'object' ? snapshotCount(child) : 0),
    1
  )
}

function liveCount(obj: FabricAny): number {
  if (obj.type !== 'group' || typeof obj.getObjects !== 'function') return 1
  return (obj.getObjects() as FabricAny[]).reduce(
    (n, child) => n + liveCount(child),
    1
  )
}

/**
 * Rebuilds one object from its snapshot, as undo and redo need it.
 *
 * fabric drops a picture whose address fails — the object itself, or one
 * child of a group — and an undo that lost an object that way lost it for
 * good. Rebuilt as fabric would first, which is exact and the ordinary case;
 * only when something came back missing are the pictures checked and the
 * failing ones stood in for. Null only when the snapshot cannot be rebuilt
 * for some other reason.
 */
export async function enlivenSnapshot(
  data: Snapshot
): Promise<FabricAny | null> {
  const first = await enliven(data)
  if (first && liveCount(first) === snapshotCount(data)) {
    markUnloadedImages([first])
    return first
  }
  const repaired = await withUnloadableImagesReplaced(data)
  if (repaired === data) {
    if (first) markUnloadedImages([first])
    return first
  }
  const second = await enliven(repaired)
  const result = second ?? first
  if (result) markUnloadedImages([result])
  return result
}
