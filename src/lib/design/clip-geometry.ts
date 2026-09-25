// src/lib/design/clip-geometry.ts
//
// Where a clip path actually sits on the canvas, and how to put it back there.
//
// Fabric anchors a clip in one of two ways, and they mean different things by
// `left`/`top`. An `absolutePositioned` clip holds canvas coordinates. Every
// other clip holds an offset in its *owner's* local space, measured from the
// owner's centre — which is what `createMask` builds, so that dragging a mask
// group carries the shape along with the content instead of sliding the content
// out from under a shape pinned to the canvas.
//
// Anything that reads or writes a clip has to know which of the two it is
// holding, so the conversion lives here rather than being re-derived — reading
// a centre-anchored clip's `left`/`top` as canvas coordinates is how a mask
// ends up in the top-left corner of a reloaded template.

import { fabric } from 'fabric'
import type { FabricAny } from './serialize'

/** The clip's absolute canvas box, whichever anchoring mode it uses. */
export function absoluteClipBox(
  clip: FabricAny,
  owner: FabricAny
): {
  left: number
  top: number
  width: number
  height: number
  kind: string
} | null {
  if (!clip) return null
  const cw = (clip.width || 0) * (clip.scaleX || 1)
  const ch = (clip.height || 0) * (clip.scaleY || 1)
  if (clip.absolutePositioned) {
    return {
      left: clip.left || 0,
      top: clip.top || 0,
      width: cw,
      height: ch,
      kind: clip.type || 'rect',
    }
  }
  // Anchored to the owner's centre.
  const oc = owner.getCenterPoint()
  const sx = owner.scaleX || 1
  const sy = owner.scaleY || 1
  const w = cw * sx
  const h = ch * sy
  const cx = oc.x + (clip.left || 0) * sx
  const cy = oc.y + (clip.top || 0) * sy
  return {
    left: cx - w / 2,
    top: cy - h / 2,
    width: w,
    height: h,
    kind: clip.type || 'rect',
  }
}

/** A clip's true canvas placement: where its centre is, how big, how turned. */
export interface ClipTransform {
  centerX: number
  centerY: number
  width: number
  height: number
  angle: number
  kind: string
}

/**
 * The clip's placement in canvas space, rotation included.
 *
 * `absoluteClipBox` above answers a different question — the axis-aligned box a
 * CSS `clip-path` needs — and throws the angle away getting there. Releasing a
 * mask needs the real transform, or a shape that was clipping at 12 degrees
 * comes back square.
 *
 * The two anchoring modes need different arithmetic. An absolutely positioned
 * clip is already in canvas space, so fabric's own `getCenterPoint` resolves it
 * whatever its origin. A centre-anchored clip — what `createMask` builds — holds
 * an offset in the owner's *local* space, so it has to go through the owner's
 * transform matrix: reading `left`/`top` as canvas coordinates silently drops
 * the owner's own rotation and scale on top of the clip's.
 */
export function absoluteClipTransform(
  clip: FabricAny,
  owner: FabricAny
): ClipTransform | null {
  if (!clip) return null

  const kind = (clip.type as string) || 'rect'
  const w = clip.getScaledWidth
    ? clip.getScaledWidth()
    : (clip.width || 0) * (clip.scaleX || 1)
  const h = clip.getScaledHeight
    ? clip.getScaledHeight()
    : (clip.height || 0) * (clip.scaleY || 1)

  if (clip.absolutePositioned) {
    const c = clip.getCenterPoint()
    return {
      centerX: c.x,
      centerY: c.y,
      width: w,
      height: h,
      angle: clip.angle || 0,
      kind,
    }
  }

  // Local, centre-origin offset -> canvas. The matrix folds in the owner's
  // rotation, scale and position in one step.
  const centre = fabric.util.transformPoint(
    new fabric.Point(clip.left || 0, clip.top || 0),
    owner.calcTransformMatrix()
  )
  // Magnitudes: a flipped owner mirrors the clip, it does not give it a
  // negative width.
  const sx = Math.abs(owner.scaleX || 1)
  const sy = Math.abs(owner.scaleY || 1)

  return {
    centerX: centre.x,
    centerY: centre.y,
    width: w * sx,
    height: h * sy,
    angle: (owner.angle || 0) + (clip.angle || 0),
    kind,
  }
}

/**
 * The inverse of `absoluteClipTransform`: a canvas placement expressed in the
 * owner's local space, ready to hand to a centre-anchored clip.
 *
 * Rebuilding a saved mask needs this direction. The document stores where the
 * clip sits on the canvas, because that is the only description that survives
 * being read back by anything other than fabric; the live clip has to be
 * anchored to its owner, or the mask stops travelling with what it masks.
 */
export function ownerLocalClipPlacement(
  t: ClipTransform,
  owner: FabricAny
): { left: number; top: number; width: number; height: number; angle: number } {
  const local = fabric.util.transformPoint(
    new fabric.Point(t.centerX, t.centerY),
    fabric.util.invertTransform(owner.calcTransformMatrix())
  )
  // Magnitudes, matching the forward direction: a flipped owner mirrors the
  // clip rather than giving it a negative size.
  const sx = Math.abs(owner.scaleX || 1) || 1
  const sy = Math.abs(owner.scaleY || 1) || 1
  return {
    left: local.x,
    top: local.y,
    width: t.width / sx,
    height: t.height / sy,
    angle: t.angle - (owner.angle || 0),
  }
}
