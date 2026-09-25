// src/lib/design/transform.ts
//
// Grouping, masking/clipping, alignment, distribution and smart guides.
// All of these operate on the live fabric canvas; the document is re-read from
// the canvas afterwards, so none of them need to know about serialization.

import { fabric } from 'fabric'
import { isChrome, type FabricAny } from './serialize'
import { absoluteClipTransform } from './clip-geometry'
import { newId } from '@/types/design'

// Clip placement moved out to `clip-geometry`, which the serializer needs too
// and cannot import from here without a cycle. Re-exported so the editor keeps
// reaching for masking and clipping in one place.
export {
  absoluteClipBox,
  absoluteClipTransform,
  ownerLocalClipPlacement,
  type ClipTransform,
} from './clip-geometry'

/* ── Selection helpers ──────────────────────────────────────────── */

/** Selected objects, excluding chrome and locked layers. */
export function selectedObjects(canvas: fabric.Canvas): FabricAny[] {
  return (canvas.getActiveObjects() as FabricAny[]).filter((o) => !isChrome(o))
}

export function contentObjects(canvas: fabric.Canvas): FabricAny[] {
  return (canvas.getObjects() as FabricAny[]).filter((o) => !isChrome(o))
}

/* ── Grouping ───────────────────────────────────────────────────── */

/**
 * Collapse the active selection into a group. Fabric's ActiveSelection already
 * holds the objects with correct relative positions, so `toGroup()` preserves
 * layout for free.
 */
export function groupSelection(canvas: fabric.Canvas): FabricAny | null {
  const active = canvas.getActiveObject()
  if (!active || active.type !== 'activeSelection') return null
  const sel = active as fabric.ActiveSelection
  if (sel.getObjects().length < 2) return null

  const group = sel.toGroup() as FabricAny
  group.designId = newId('grp')
  group.designType = 'group'
  group.designName = 'Group'
  canvas.requestRenderAll()
  return group
}

/**
 * Dissolve a group, returning children to the top level with their absolute
 * transforms recalculated. Fabric's `toActiveSelection()` does that maths.
 */
export function ungroupSelection(canvas: fabric.Canvas): FabricAny[] {
  const active = canvas.getActiveObject()
  if (!active || active.type !== 'group') return []
  const group = active as fabric.Group
  const children = group.getObjects() as FabricAny[]
  group.toActiveSelection()
  canvas.requestRenderAll()
  return children
}

/**
 * Group edit mode: dim everything outside the group so children can be worked on
 * directly. Returns a restore function.
 */
export function enterGroupEditMode(
  canvas: fabric.Canvas,
  group: fabric.Group
): () => void {
  const others = contentObjects(canvas).filter(
    (o) => o !== (group as unknown as FabricAny)
  )
  const prior = others.map((o) => ({
    o,
    opacity: o.opacity ?? 1,
    selectable: o.selectable,
  }))
  others.forEach((o) =>
    o.set({ opacity: (o.opacity ?? 1) * 0.25, selectable: false })
  )

  // Children become individually addressable while the group is open.
  const children = group.getObjects() as FabricAny[]
  children.forEach((c) => c.set({ selectable: true, evented: true }))
  canvas.requestRenderAll()

  return () => {
    prior.forEach(({ o, opacity, selectable }) =>
      o.set({ opacity, selectable })
    )
    canvas.requestRenderAll()
  }
}

/* ── Masking / clipping ─────────────────────────────────────────── */

/**
 * Mask = a parent group holding the content, clipped by the shape.
 *
 * The clip is stored with `absolutePositioned: false`, which anchors it to the
 * group's centre rather than the canvas. That is what makes the mask and its
 * content travel together when the group is dragged - pinning the clip to canvas
 * coordinates left the shape behind while the content slid out from under it.
 *
 * Double-clicking the group opens it so the content can be repositioned inside a
 * stationary frame.
 */
export function createMask(canvas: fabric.Canvas): FabricAny | null {
  const sel = selectedObjects(canvas)
  if (sel.length !== 2) return null

  const all = canvas.getObjects()
  const sorted = [...sel].sort((a, b) => all.indexOf(a) - all.indexOf(b))
  const content = sorted[0]
  const shape = sorted[1]

  // Objects inside an ActiveSelection carry selection-relative coordinates.
  // Drop the selection first so left/top are absolute canvas positions.
  canvas.discardActiveObject()
  content.setCoords()
  shape.setCoords()

  const clip = cloneAsClip(shape)
  if (!clip) return null
  const shapeCentre = shape.getCenterPoint()
  const shapeLabel = (shape.layerName ||
    shape.designName ||
    shape.type) as string

  const index = all.indexOf(content)
  canvas.remove(content)
  canvas.remove(shape)

  const group = new fabric.Group([content], {
    subTargetCheck: true,
  }) as FabricAny
  const centre = group.getCenterPoint()

  // Re-express the clip relative to the group centre so it moves with the group.
  clip.set({
    originX: 'center',
    originY: 'center',
    left: shapeCentre.x - centre.x,
    top: shapeCentre.y - centre.y,
    absolutePositioned: false,
  })
  group.clipPath = clip as fabric.Object

  group.designId = newId('mask')
  group.designType = 'group'
  group.designName = 'Mask'
  group.isMaskGroup = true
  group.maskShapeType = shape.type
  group.maskShapeName = shapeLabel

  canvas.add(group)
  if (index >= 0) canvas.moveTo(group, index)
  canvas.setActiveObject(group)
  canvas.requestRenderAll()
  return group
}

/** A clip path clone, initially in absolute canvas space. */
function cloneAsClip(source: FabricAny): FabricAny | null {
  const common = {
    left: source.left,
    top: source.top,
    originX: 'left' as const,
    originY: 'top' as const,
    angle: source.angle,
    absolutePositioned: true,
    // Nothing draws this shape, but fabric's default stroke width of 1 would
    // still count towards the box it measures - and that box is what gets
    // saved, so the mask would grow a pixel every time the template was
    // reopened. It is sized from the source's outer edge either way.
    strokeWidth: 0,
  }
  const w = source.getScaledWidth()
  const h = source.getScaledHeight()

  switch (source.type) {
    case 'circle':
    case 'ellipse':
      return new fabric.Ellipse({
        ...common,
        rx: w / 2,
        ry: h / 2,
      }) as FabricAny
    case 'path':
      return new fabric.Path((source as any).path, {
        ...common,
        scaleX: source.scaleX,
        scaleY: source.scaleY,
      }) as FabricAny
    case 'polygon':
      return new fabric.Polygon((source as any).points || [], {
        ...common,
        scaleX: source.scaleX,
        scaleY: source.scaleY,
      }) as FabricAny
    case 'i-text':
    case 'text':
    case 'textbox':
      return new fabric.Text((source as any).text || '', {
        ...common,
        fontFamily: (source as any).fontFamily,
        fontSize: (source as any).fontSize,
        fontWeight: (source as any).fontWeight,
        scaleX: source.scaleX,
        scaleY: source.scaleY,
      }) as FabricAny
    case 'rect':
    default:
      return new fabric.Rect({
        ...common,
        width: w,
        height: h,
        rx: (source as any).rx || 0,
        ry: (source as any).ry || 0,
      }) as FabricAny
  }
}

/**
 * Dissolve a mask: the content returns to the canvas and the mask shape comes
 * back as a real, editable object at the position it was clipping from.
 */
export function releaseMask(
  canvas: fabric.Canvas,
  group: FabricAny
): FabricAny | null {
  const clip = group.clipPath as FabricAny | undefined
  if (!clip) return null

  // Read the placement while the group is still intact: `toActiveSelection`
  // below dissolves it, and with it the transform this depends on.
  const placement = absoluteClipTransform(clip, group)
  const isEllipse = clip.type === 'circle' || clip.type === 'ellipse'

  // Free the content first so it keeps its on-screen position.
  if (group.type === 'group') {
    ;(group as unknown as fabric.Group).clipPath = undefined
    ;(group as unknown as fabric.Group).toActiveSelection()
    canvas.discardActiveObject()
  } else {
    group.clipPath = undefined
  }

  let restored: FabricAny | null = null
  if (placement) {
    // Anchored by its centre, not its corner. A rotated shape's top-left corner
    // is not where its unrotated box says it is, so placing by corner would
    // shift it by the difference on top of losing the angle.
    const common = {
      left: placement.centerX,
      top: placement.centerY,
      originX: 'center' as const,
      originY: 'center' as const,
      angle: placement.angle,
      fill: 'transparent',
      stroke: '#3b82f6',
      strokeWidth: 1,
    }
    restored = isEllipse
      ? (new fabric.Ellipse({
          ...common,
          rx: placement.width / 2,
          ry: placement.height / 2,
        }) as FabricAny)
      : (new fabric.Rect({
          ...common,
          width: placement.width,
          height: placement.height,
        }) as FabricAny)
    restored.designId = newId()
    restored.designType = 'shape'
    restored.designName = group.maskShapeName || 'Mask shape'
    canvas.add(restored)
    restored.setCoords()
  }

  canvas.requestRenderAll()
  return restored
}

/** True for a masked object or a mask group. */
export function hasMask(o: FabricAny | null | undefined): boolean {
  return !!o?.clipPath
}

/* ── Alignment & distribution ───────────────────────────────────── */

export type AlignMode =
  'left' | 'hcenter' | 'right' | 'top' | 'vmiddle' | 'bottom'
export type AlignTarget = {
  left: number
  top: number
  width: number
  height: number
}

export function alignObjects(
  objects: FabricAny[],
  mode: AlignMode,
  area: AlignTarget
) {
  objects.forEach((o) => {
    const w = o.getScaledWidth()
    const h = o.getScaledHeight()
    switch (mode) {
      case 'left':
        o.set({ left: area.left })
        break
      case 'hcenter':
        o.set({ left: area.left + (area.width - w) / 2 })
        break
      case 'right':
        o.set({ left: area.left + area.width - w })
        break
      case 'top':
        o.set({ top: area.top })
        break
      case 'vmiddle':
        o.set({ top: area.top + (area.height - h) / 2 })
        break
      case 'bottom':
        o.set({ top: area.top + area.height - h })
        break
    }
    o.setCoords()
  })
}

/** Bounding box of a set of objects. */
export function boundsOfFabric(objects: FabricAny[]): AlignTarget {
  if (!objects.length) return { left: 0, top: 0, width: 0, height: 0 }
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  objects.forEach((o) => {
    minX = Math.min(minX, o.left ?? 0)
    minY = Math.min(minY, o.top ?? 0)
    maxX = Math.max(maxX, (o.left ?? 0) + o.getScaledWidth())
    maxY = Math.max(maxY, (o.top ?? 0) + o.getScaledHeight())
  })
  return { left: minX, top: minY, width: maxX - minX, height: maxY - minY }
}

/**
 * Equal gaps between 3+ objects. The outermost two stay put and everything
 * between them is respaced, which is what users expect from "distribute".
 */
export function distributeObjects(
  objects: FabricAny[],
  axis: 'horizontal' | 'vertical'
) {
  if (objects.length < 3) return
  const horiz = axis === 'horizontal'
  const sorted = [...objects].sort((a, b) =>
    horiz ? (a.left ?? 0) - (b.left ?? 0) : (a.top ?? 0) - (b.top ?? 0)
  )

  const first = sorted[0]
  const last = sorted[sorted.length - 1]
  const start = horiz ? (first.left ?? 0) : (first.top ?? 0)
  const end = horiz
    ? (last.left ?? 0) + last.getScaledWidth()
    : (last.top ?? 0) + last.getScaledHeight()

  const totalSize = sorted.reduce(
    (sum, o) => sum + (horiz ? o.getScaledWidth() : o.getScaledHeight()),
    0
  )
  const gap = (end - start - totalSize) / (sorted.length - 1)

  let cursor = start
  sorted.forEach((o) => {
    if (horiz) o.set({ left: cursor })
    else o.set({ top: cursor })
    o.setCoords()
    cursor += (horiz ? o.getScaledWidth() : o.getScaledHeight()) + gap
  })
}

/* ── Smart guides ───────────────────────────────────────────────── */

export type SmartGuide = { axis: 'x' | 'y'; position: number }

const SNAP_TOLERANCE = 6

/**
 * Alignment lines for a dragged object against its neighbours and the sheet.
 * Returns the guides to draw plus the nudged position that snaps to them.
 */
export function computeSmartGuides(
  moving: FabricAny,
  others: FabricAny[],
  sheet: AlignTarget | null
): { guides: SmartGuide[]; left: number; top: number } {
  const w = moving.getScaledWidth()
  const h = moving.getScaledHeight()
  let left = moving.left ?? 0
  let top = moving.top ?? 0

  // Candidate lines: each neighbour's left/centre/right and top/middle/bottom.
  const xLines: number[] = []
  const yLines: number[] = []

  const push = (t: AlignTarget) => {
    xLines.push(t.left, t.left + t.width / 2, t.left + t.width)
    yLines.push(t.top, t.top + t.height / 2, t.top + t.height)
  }
  others.forEach((o) =>
    push({
      left: o.left ?? 0,
      top: o.top ?? 0,
      width: o.getScaledWidth(),
      height: o.getScaledHeight(),
    })
  )
  if (sheet) push(sheet)

  const guides: SmartGuide[] = []

  // Match the moving object's own three x anchors against every candidate.
  const xAnchors = [left, left + w / 2, left + w]
  let bestX: { delta: number; line: number } | null = null
  xAnchors.forEach((anchor) => {
    xLines.forEach((line) => {
      const delta = line - anchor
      if (
        Math.abs(delta) <= SNAP_TOLERANCE &&
        (!bestX || Math.abs(delta) < Math.abs(bestX.delta))
      ) {
        bestX = { delta, line }
      }
    })
  })
  if (bestX) {
    left += (bestX as { delta: number; line: number }).delta
    guides.push({
      axis: 'x',
      position: (bestX as { delta: number; line: number }).line,
    })
  }

  const yAnchors = [top, top + h / 2, top + h]
  let bestY: { delta: number; line: number } | null = null
  yAnchors.forEach((anchor) => {
    yLines.forEach((line) => {
      const delta = line - anchor
      if (
        Math.abs(delta) <= SNAP_TOLERANCE &&
        (!bestY || Math.abs(delta) < Math.abs(bestY.delta))
      ) {
        bestY = { delta, line }
      }
    })
  })
  if (bestY) {
    top += (bestY as { delta: number; line: number }).delta
    guides.push({
      axis: 'y',
      position: (bestY as { delta: number; line: number }).line,
    })
  }

  return { guides, left, top }
}

/** Round a position onto the grid. */
export function snapToGrid(value: number, spacing: number): number {
  if (spacing <= 0) return value
  return Math.round(value / spacing) * spacing
}
