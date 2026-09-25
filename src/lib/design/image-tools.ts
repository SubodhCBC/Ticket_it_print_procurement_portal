// src/lib/design/image-tools.ts
//
// Fill, Fit and background removal for pictures on the canvas, shared by the
// operator's builder and the buyer's studio (they are the same component).
//
// Every result is expressed in terms the rest of the design already stores: a
// source crop and a scale for Fill and Fit, a new bitmap for a removed
// background. So a proof, a PDF or a thumbnail rendered from the document shows
// the same picture without knowing these tools exist. The two extra
// properties — the frame and how the picture sits in it — only let the tools
// be used again on the same box.

import type { fabric } from 'fabric'
import { loadImageElementOrNull } from './image-load'

type FabricImage = fabric.Object & Record<string, any>

export type ImageFit = 'fill' | 'fit'

/** Fabric properties these tools keep on an image. */
export const IMAGE_STYLE_PROPS = ['imageFrame', 'imageFit']

/**
 * The most pixels a background is removed at. A larger photo — a camera
 * original is 20-50 MP — is worked on scaled down to this, about 4240×2830 and
 * still enough for A4 at 300 dpi, because at full size the browser would take
 * many seconds and hundreds of megabytes. The picture keeps its box on the
 * canvas; only its bitmap has fewer pixels.
 */
export const WORKING_PIXELS = 12_000_000

/* ── Frames: Fill and Fit ───────────────────────────────────────── */

/** The unfiltered bitmap the picture is drawn from. */
export function sourceElementOf(
  img: FabricImage
): HTMLImageElement | HTMLCanvasElement | undefined {
  return (img._originalElement || img.getElement?.()) as
    HTMLImageElement | HTMLCanvasElement | undefined
}

function sourceSizeOf(img: FabricImage): { width: number; height: number } {
  const el = sourceElementOf(img) as HTMLImageElement | undefined
  return {
    width: Math.max(1, el?.naturalWidth || el?.width || img.width || 1),
    height: Math.max(1, el?.naturalHeight || el?.height || img.height || 1),
  }
}

/**
 * The box the picture has to occupy, in canvas pixels.
 *
 * Remembered rather than read off the picture, because Fit shrinks the picture
 * inside it: reading the box back after a Fit would make every following Fill
 * work to a smaller box than the one the designer drew.
 */
export function frameOf(img: FabricImage): { width: number; height: number } {
  const frame = img.imageFrame as
    { width?: number; height?: number } | undefined
  if (frame?.width && frame.height && frame.width > 0 && frame.height > 0) {
    return { width: frame.width, height: frame.height }
  }
  return { width: img.getScaledWidth(), height: img.getScaledHeight() }
}

/** Applies a change about the picture's centre, so it does not jump. */
function aboutCentre(img: FabricImage, change: () => void): void {
  const centre = img.getCenterPoint()
  change()
  img.setPositionByOrigin(centre, 'center', 'center')
  img.setCoords()
  img.set('dirty', true)
}

/**
 * Covers the frame with the picture, cropping what does not fit.
 *
 * The crop is centred on what was showing, so a picture already cropped to a
 * face stays on the face instead of snapping back to the middle of the photo.
 */
export function fillFrame(img: FabricImage): void {
  const frame = frameOf(img)
  const source = sourceSizeOf(img)
  const aspect = frame.width / frame.height

  let cropW = source.width
  let cropH = source.height
  if (source.width / source.height > aspect) {
    cropW = Math.max(1, Math.round(source.height * aspect))
  } else {
    cropH = Math.max(1, Math.round(source.width / aspect))
  }

  const shownCentreX = (img.cropX || 0) + (img.width || source.width) / 2
  const shownCentreY = (img.cropY || 0) + (img.height || source.height) / 2
  const clamp = (n: number, max: number) => Math.min(Math.max(0, n), max)
  const cropX = clamp(
    Math.round(shownCentreX - cropW / 2),
    source.width - cropW
  )
  const cropY = clamp(
    Math.round(shownCentreY - cropH / 2),
    source.height - cropH
  )

  aboutCentre(img, () =>
    img.set({
      cropX,
      cropY,
      width: cropW,
      height: cropH,
      scaleX: frame.width / cropW,
      scaleY: frame.height / cropH,
    })
  )
  img.srcCrop = { x: cropX, y: cropY, width: cropW, height: cropH }
  img.imageFrame = frame
  img.imageFit = 'fill'
}

/** Shows the whole picture inside the frame, undistorted. */
export function fitFrame(img: FabricImage): void {
  const frame = frameOf(img)
  const source = sourceSizeOf(img)
  const scale = Math.min(
    frame.width / source.width,
    frame.height / source.height
  )

  aboutCentre(img, () =>
    img.set({
      cropX: 0,
      cropY: 0,
      width: source.width,
      height: source.height,
      scaleX: scale,
      scaleY: scale,
    })
  )
  img.srcCrop = undefined
  img.imageFrame = frame
  img.imageFit = 'fit'
}

/** Re-applies Fill or Fit — after the picture in the frame was swapped. */
export function refitImage(img: FabricImage): void {
  if (img.imageFit === 'fill') fillFrame(img)
  else if (img.imageFit === 'fit') fitFrame(img)
}

/**
 * Makes the box the picture occupies now its frame.
 *
 * After a resize by the handles or a crop, the box the user just made is the
 * one they mean; Fill and Fit work to it from then on.
 */
export function adoptCurrentBoxAsFrame(img: FabricImage): void {
  img.imageFrame = {
    width: img.getScaledWidth(),
    height: img.getScaledHeight(),
  }
  img.imageFit = undefined
}

/**
 * Crops the picture to a box drawn over it on the canvas.
 *
 * `box` is the crop rectangle's centre and its size on the canvas, drawn at the
 * picture's own angle. It is taken into the picture's own axes — undoing its
 * rotation, scale and flip — so a rotated or mirrored picture crops the part
 * the box covers, not the part an unrotated picture would have had there. A
 * box hanging over the picture's edge keeps only what is actually picture.
 *
 * The kept part stays exactly where it was on the canvas, and its box becomes
 * the frame Fill and Fit work to.
 */
export function cropImageToRect(
  img: FabricImage,
  box: { centre: { x: number; y: number }; width: number; height: number }
): void {
  const source = sourceSizeOf(img)
  const sx = Math.abs(img.scaleX || 1)
  const sy = Math.abs(img.scaleY || 1)
  const centre = img.getCenterPoint()
  const rad = ((img.angle || 0) * Math.PI) / 180
  const cos = Math.cos(rad)
  const sin = Math.sin(rad)

  // Canvas -> the picture's own axes, in source pixels, from its centre.
  const dx = box.centre.x - centre.x
  const dy = box.centre.y - centre.y
  let localX = (dx * cos + dy * sin) / sx
  let localY = (-dx * sin + dy * cos) / sy
  if (img.flipX) localX = -localX
  if (img.flipY) localY = -localY
  const w = Math.abs(box.width) / sx
  const h = Math.abs(box.height) / sy

  const oldCropX = img.cropX || 0
  const oldCropY = img.cropY || 0
  const oldW = img.width || source.width
  const oldH = img.height || source.height
  const shownCentreX = oldCropX + oldW / 2
  const shownCentreY = oldCropY + oldH / 2

  const clamp = (n: number, min: number, max: number) =>
    Math.min(Math.max(min, n), max)
  const left = shownCentreX + localX - w / 2
  const top = shownCentreY + localY - h / 2
  const cropX = clamp(Math.round(left), 0, source.width - 1)
  const cropY = clamp(Math.round(top), 0, source.height - 1)
  const cropW = clamp(Math.round(left + w), cropX + 1, source.width) - cropX
  const cropH = clamp(Math.round(top + h), cropY + 1, source.height) - cropY

  // Where the kept part's centre is on the canvas: the same trip back out.
  let keptX = cropX + cropW / 2 - shownCentreX
  let keptY = cropY + cropH / 2 - shownCentreY
  if (img.flipX) keptX = -keptX
  if (img.flipY) keptY = -keptY
  const px = keptX * sx
  const py = keptY * sy
  const keptCentre = {
    x: centre.x + px * cos - py * sin,
    y: centre.y + px * sin + py * cos,
  }

  img.set({ cropX, cropY, width: cropW, height: cropH })
  // Fabric reads only `x` and `y` from the point; its typings ask for a Point.
  img.setPositionByOrigin(keptCentre as fabric.Point, 'center', 'center')
  img.srcCrop = { x: cropX, y: cropY, width: cropW, height: cropH }
  img.setCoords()
  img.set('dirty', true)
  adoptCurrentBoxAsFrame(img)
}

/* ── Sources ────────────────────────────────────────────────────── */

export function loadImageElement(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const el = new Image()
    if (!src.startsWith('data:')) el.crossOrigin = 'anonymous'
    el.onload = () => resolve(el)
    el.onerror = () => reject(new Error('The picture could not be loaded.'))
    el.src = src
  })
}

/** The size a picture is worked on at: its own, or scaled down to `maxPixels`. */
export function workingSize(
  width: number,
  height: number,
  maxPixels = WORKING_PIXELS
): { width: number; height: number } {
  const scale = Math.min(1, Math.sqrt(maxPixels / (width * height)))
  return {
    width: Math.max(1, Math.floor(width * scale)),
    height: Math.max(1, Math.floor(height * scale)),
  }
}

/**
 * The picture's pixels on a canvas of its working size, ready to edit. Throws
 * the message a person should see when the picture cannot be read.
 */
export function readSourcePixels(source: HTMLImageElement | HTMLCanvasElement) {
  const naturalWidth =
    (source as HTMLImageElement).naturalWidth ||
    (source as HTMLCanvasElement).width
  const naturalHeight =
    (source as HTMLImageElement).naturalHeight ||
    (source as HTMLCanvasElement).height
  if (!naturalWidth || !naturalHeight) {
    throw new Error('This picture has not finished loading.')
  }
  const { width, height } = workingSize(naturalWidth, naturalHeight)

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) throw new Error('This browser cannot edit pictures.')
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(source, 0, 0, width, height)

  let image: ImageData
  try {
    image = ctx.getImageData(0, 0, width, height)
  } catch {
    throw new Error(
      'This picture comes from a site that does not allow it to be edited. Download it and upload the file instead.'
    )
  }
  return { canvas, ctx, image, width, height }
}

/**
 * Replaces the bitmap and keeps everything else: position, size, crop.
 *
 * Fabric's `setSrc` resets the width and height to the new bitmap's, which
 * would undo a crop and resize the picture on the canvas.
 *
 * The new bitmap need not have as many pixels as the old: a large photo's
 * cut-out is made at its working size, and Restore brings the full size back.
 * The crop is counted in the bitmap's pixels, so it is rescaled to the new
 * one and the scale the other way, which keeps the picture's box and place.
 *
 * Loaded first and swapped after, rather than through fabric's `setSrc`: that
 * empties the picture before it says the load failed, so a Restore from a
 * library address that no longer answers left a blank where the picture was.
 */
export async function swapImageSource(
  img: FabricImage,
  src: string
): Promise<void> {
  const element = await loadImageElementOrNull(src)
  if (!element) throw new Error('The picture could not be loaded.')
  swapImageElement(img, element)
}

/**
 * `swapImageSource` with the bitmap already loaded, done at once.
 *
 * For a swap that must not race anything else touching the picture: the
 * caller checks the picture is as it left it, and nothing can change between
 * that check and the swap. Load `element` with `loadImageElement`, so a URL
 * keeps CORS and the canvas stays exportable.
 */
export function swapImageElement(
  img: FabricImage,
  element: HTMLImageElement
): void {
  const keep = measureForSwap(img)
  img.setElement(element)
  keepBoxAfterSwap(img, keep)
}

type SwapMeasure = {
  before: { width: number; height: number }
  cropX: number
  cropY: number
  width: number
  height: number
  scaleX: number
  scaleY: number
  srcCrop?: { x: number; y: number; width: number; height: number }
}

function measureForSwap(img: FabricImage): SwapMeasure {
  const before = sourceSizeOf(img)
  return {
    before,
    cropX: img.cropX || 0,
    cropY: img.cropY || 0,
    width: img.width || before.width,
    height: img.height || before.height,
    scaleX: img.scaleX || 1,
    scaleY: img.scaleY || 1,
    srcCrop: img.srcCrop as SwapMeasure['srcCrop'],
  }
}

function keepBoxAfterSwap(img: FabricImage, keep: SwapMeasure): void {
  const after = sourceSizeOf(img)
  const rx = after.width / keep.before.width
  const ry = after.height / keep.before.height
  img.set({
    cropX: keep.cropX * rx,
    cropY: keep.cropY * ry,
    width: keep.width * rx,
    height: keep.height * ry,
    scaleX: keep.scaleX / rx,
    scaleY: keep.scaleY / ry,
  })
  if (keep.srcCrop) {
    img.srcCrop = {
      x: keep.srcCrop.x * rx,
      y: keep.srcCrop.y * ry,
      width: keep.srcCrop.width * rx,
      height: keep.srcCrop.height * ry,
    }
  }
  img.setCoords()
  img.set('dirty', true)
}

/* ── Background removal ─────────────────────────────────────────── */

/**
 * Makes a plain background transparent.
 *
 * The background is the most common colour around the picture's edges, and
 * what is removed is that colour where it connects to an edge — so a white
 * logo on a white card keeps the white inside its letters. The pixels along
 * the cut are faded rather than cut hard, so the outline does not look jagged
 * against a coloured design.
 *
 * `tolerance` is 0-100: how different a shade may be and still count as the
 * background.
 *
 * `everywhere` also removes the colour where it does not reach an edge — the
 * patches of background showing between a subject's parts. `strayBits` then
 * drops what is left apart from the main subject: specks, scattered shapes and
 * small text (see `keepMainSubject`). Both are off by default because both
 * would cut into a logo.
 *
 * A picture over `WORKING_PIXELS` is worked on at that size.
 *
 * Done in the browser, with no service involved, which is also its limit: it
 * finds a plain background, not a person in front of a room.
 */
export async function removeSolidBackground(
  source: HTMLImageElement | HTMLCanvasElement,
  tolerance: number,
  options: { everywhere?: boolean; strayBits?: boolean } = {}
): Promise<{ dataUrl: string; removed: number }> {
  const { canvas, ctx, image, width, height } = readSourcePixels(source)
  const removed = keyOutColour(image.data, width, height, tolerance, options)
  ctx.putImageData(image, 0, 0)
  return { dataUrl: canvas.toDataURL('image/png'), removed }
}

/**
 * The colour key behind `removeSolidBackground`, on RGBA pixel data changed in
 * place — only the alpha is written. Returns the share of the picture cleared.
 */
export function keyOutColour(
  px: Uint8ClampedArray,
  w: number,
  h: number,
  tolerance: number,
  { everywhere = false, strayBits = false } = {}
): number {
  // 1. The background colour: the most common one along the edges, grouped
  //    into close shades so compression noise does not split it.
  const buckets = new Map<
    number,
    { n: number; r: number; g: number; b: number }
  >()
  const sample = (p: number) => {
    const i = p * 4
    if (px[i + 3] < 16) return
    const key = ((px[i] >> 4) << 8) | ((px[i + 1] >> 4) << 4) | (px[i + 2] >> 4)
    const bucket = buckets.get(key)
    if (bucket) {
      bucket.n++
      bucket.r += px[i]
      bucket.g += px[i + 1]
      bucket.b += px[i + 2]
    } else {
      buckets.set(key, { n: 1, r: px[i], g: px[i + 1], b: px[i + 2] })
    }
  }
  for (let x = 0; x < w; x++) {
    sample(x)
    sample((h - 1) * w + x)
  }
  for (let y = 0; y < h; y++) {
    sample(y * w)
    sample(y * w + w - 1)
  }
  let best: { n: number; r: number; g: number; b: number } | null = null
  for (const bucket of buckets.values()) {
    if (!best || bucket.n > best.n) best = bucket
  }
  if (!best)
    throw new Error('The edges of this picture are already transparent.')
  const bgR = best.r / best.n
  const bgG = best.g / best.n
  const bgB = best.b / best.n

  const limit = 10 + (Math.min(100, Math.max(0, tolerance)) / 100) * 110
  const limit2 = limit * limit
  const distance2 = (i: number) =>
    (px[i] - bgR) ** 2 + (px[i + 1] - bgG) ** 2 + (px[i + 2] - bgB) ** 2

  // 2. Flood from every edge through pixels close to that colour. Each pixel
  //    is marked when queued, so the queue never holds one twice.
  const removed = new Uint8Array(w * h)
  const queue = new Int32Array(w * h)
  let size = 0
  const visit = (p: number) => {
    if (removed[p]) return
    const i = p * 4
    if (px[i + 3] >= 16 && distance2(i) > limit2) return
    removed[p] = 1
    queue[size++] = p
  }
  for (let x = 0; x < w; x++) {
    visit(x)
    visit((h - 1) * w + x)
  }
  for (let y = 0; y < h; y++) {
    visit(y * w)
    visit(y * w + w - 1)
  }
  if (everywhere) {
    for (let p = 0; p < w * h; p++) visit(p)
  }
  while (size > 0) {
    const p = queue[--size]
    const x = p % w
    if (x > 0) visit(p - 1)
    if (x < w - 1) visit(p + 1)
    if (p >= w) visit(p - w)
    if (p < w * (h - 1)) visit(p + w)
  }

  // 3. Clear it, then fade the pixels along the cut by how close they are to
  //    the background colour.
  let count = 0
  for (let p = 0; p < w * h; p++) {
    if (removed[p]) {
      px[p * 4 + 3] = 0
      count++
    }
  }
  const soft = limit * 1.8
  for (let p = 0; p < w * h; p++) {
    if (removed[p]) continue
    const x = p % w
    const touches =
      (x > 0 && removed[p - 1]) ||
      (x < w - 1 && removed[p + 1]) ||
      (p >= w && removed[p - w]) ||
      (p < w * (h - 1) && removed[p + w])
    if (!touches) continue
    const i = p * 4
    const d = Math.sqrt(distance2(i))
    if (d >= soft) continue
    const keep = Math.min(1, Math.max(0, (d - limit) / (soft - limit)))
    px[i + 3] = Math.round(px[i + 3] * keep)
  }

  const ratio = count / (w * h)
  if (ratio < 0.005) {
    throw new Error(
      'No plain background was found around the edges of this picture. Try a higher tolerance.'
    )
  }
  const stray = strayBits ? keepMainSubject(px, w, h) : 0
  return ratio + stray
}

/** Artwork has fewer distinct colours than this, counted at 64 levels a channel. */
const ARTWORK_COLOURS = 800
/** …or its eight commonest shades, at 16 levels a channel, cover this much of it. */
const ARTWORK_COVERAGE = 0.95

/**
 * Whether a picture is a photo rather than flat artwork.
 *
 * Artwork — a logo, lettering, a badge, even saved as a JPEG — is nearly all a
 * handful of colours. A photo spreads over thousands of shades, a plain studio
 * backdrop and a dark suit included. Measured over a sample of about 256×256
 * of the picture's pixels.
 *
 * When unsure this answers "photo": that only costs Plain colour a moment
 * finding the subject, where the other mistake cut holes through faces.
 */
export function looksLikePhoto(
  px: Uint8ClampedArray,
  w: number,
  h: number
): boolean {
  const step = Math.max(1, Math.floor(Math.sqrt((w * h) / 65536)))
  const fine = new Uint8Array(1 << 18)
  const coarse = new Uint32Array(1 << 12)
  let distinct = 0
  let sampled = 0
  for (let y = 0; y < h; y += step) {
    for (let x = 0; x < w; x += step) {
      const i = (y * w + x) * 4
      if (px[i + 3] < 128) continue
      sampled++
      const shade =
        ((px[i] >> 2) << 12) | ((px[i + 1] >> 2) << 6) | (px[i + 2] >> 2)
      if (!fine[shade]) {
        fine[shade] = 1
        distinct++
      }
      coarse[((px[i] >> 4) << 8) | ((px[i + 1] >> 4) << 4) | (px[i + 2] >> 4)]++
    }
  }
  if (!sampled || distinct < ARTWORK_COLOURS) return false
  const commonest = Array.from(coarse).sort((a, b) => b - a)
  let covered = 0
  for (let k = 0; k < 8; k++) covered += commonest[k]
  return covered / sampled < ARTWORK_COVERAGE
}

/**
 * Clears everything in a cut-out except the main subject, and returns the
 * share of the picture it cleared.
 *
 * Removing a background leaves the things that were not background: leaves,
 * specks, a caption, a strip of a frame. What stays is the largest solid
 * shape, plus any other shape at least a tenth of its size (a second person, a
 * product's lid). Shapes close to one another count as one, so an ear or a
 * tail just apart from the body stays with it, and the faint edge around what
 * stays is kept.
 *
 * `px` is RGBA pixel data, changed in place. The shapes are found on a grid of
 * at most 1024 cells across, so a large photo costs no more memory than a
 * small one.
 */
export function keepMainSubject(
  px: Uint8ClampedArray,
  w: number,
  h: number
): number {
  // 1. Where the picture is solid, on the grid.
  const step = Math.max(1, Math.ceil(Math.max(w, h) / 1024))
  const gw = Math.ceil(w / step)
  const gh = Math.ceil(h / step)
  const cells = gw * gh
  const solid = new Uint8Array(cells)
  for (let y = 0; y < h; y++) {
    const row = Math.floor(y / step) * gw
    for (let x = 0; x < w; x++) {
      if (px[(y * w + x) * 4 + 3] >= 128) solid[row + Math.floor(x / step)] = 1
    }
  }

  // 2. Grown by a little, so parts a small gap apart join into one shape.
  const reach = Math.max(1, Math.round(Math.max(gw, gh) * 0.015))
  const near = dilate(solid, gw, gh, reach)

  // 3. The shapes, and how much solid picture is in each.
  const label = new Int32Array(cells)
  const queue = new Int32Array(cells)
  const area: number[] = [0]
  let largest = 0
  for (let start = 0; start < cells; start++) {
    if (!near[start] || label[start]) continue
    const id = area.length
    let n = 0
    let size = 0
    const visit = (c: number) => {
      if (!near[c] || label[c]) return
      label[c] = id
      queue[size++] = c
    }
    visit(start)
    while (size > 0) {
      const c = queue[--size]
      n += solid[c]
      const x = c % gw
      if (x > 0) visit(c - 1)
      if (x < gw - 1) visit(c + 1)
      if (c >= gw) visit(c - gw)
      if (c < cells - gw) visit(c + gw)
    }
    area.push(n)
    largest = Math.max(largest, n)
  }
  if (!largest) return 0
  const keep = area.map((n) => n >= largest * 0.1)
  keep[0] = false

  // 4. Clear every pixel outside a kept shape.
  let cleared = 0
  for (let y = 0; y < h; y++) {
    const row = Math.floor(y / step) * gw
    for (let x = 0; x < w; x++) {
      if (keep[label[row + Math.floor(x / step)]]) continue
      const i = (y * w + x) * 4 + 3
      if (px[i] > 0) {
        px[i] = 0
        cleared++
      }
    }
  }
  return cleared / (w * h)
}

/**
 * Clears every pixel further than a short reach — `reachShare` of the
 * picture's longer side — from where `mask` is solid, and returns the share of
 * the picture it cleared. `mask` holds 0-255 for each pixel of `px` (w×h).
 *
 * A mask with nothing solid in it clears nothing: it found no subject to keep
 * things near.
 */
export function clearAwayFrom(
  px: Uint8ClampedArray,
  w: number,
  h: number,
  mask: Uint8ClampedArray,
  reachShare = 0.02
): number {
  const step = Math.max(1, Math.ceil(Math.max(w, h) / 1024))
  const gw = Math.ceil(w / step)
  const gh = Math.ceil(h / step)
  const solid = new Uint8Array(gw * gh)
  let any = false
  for (let y = 0; y < h; y++) {
    const row = Math.floor(y / step) * gw
    for (let x = 0; x < w; x++) {
      if (mask[y * w + x] >= 128) {
        solid[row + Math.floor(x / step)] = 1
        any = true
      }
    }
  }
  if (!any) return 0

  const reach = Math.max(1, Math.round(Math.max(gw, gh) * reachShare))
  const near = dilate(solid, gw, gh, reach)
  let cleared = 0
  for (let y = 0; y < h; y++) {
    const row = Math.floor(y / step) * gw
    for (let x = 0; x < w; x++) {
      if (near[row + Math.floor(x / step)]) continue
      const i = (y * w + x) * 4 + 3
      if (px[i] > 0) {
        px[i] = 0
        cleared++
      }
    }
  }
  return cleared / (w * h)
}

/** Grows the set cells of a grid by `r` cells in every direction. */
function dilate(src: Uint8Array, gw: number, gh: number, r: number) {
  const across = new Uint8Array(src.length)
  for (let y = 0; y < gh; y++) {
    const row = y * gw
    let n = 0
    for (let x = 0; x < gw + r; x++) {
      if (x < gw) n += src[row + x]
      if (x > 2 * r) n -= src[row + x - 2 * r - 1]
      const at = x - r
      if (at >= 0 && at < gw) across[row + at] = n > 0 ? 1 : 0
    }
  }
  const out = new Uint8Array(src.length)
  for (let x = 0; x < gw; x++) {
    let n = 0
    for (let y = 0; y < gh + r; y++) {
      if (y < gh) n += across[y * gw + x]
      if (y > 2 * r) n -= across[(y - 2 * r - 1) * gw + x]
      const at = y - r
      if (at >= 0 && at < gh) out[at * gw + x] = n > 0 ? 1 : 0
    }
  }
  return out
}
