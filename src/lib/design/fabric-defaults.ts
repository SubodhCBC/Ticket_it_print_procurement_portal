// src/lib/design/fabric-defaults.ts
//
// Editor-wide fabric defaults. Imported for its side effect by `serialize.ts`,
// which every other design module depends on, so these are in place before the
// first object is constructed.

import { fabric } from 'fabric'

/**
 * Draw strokes at a constant width regardless of how the object is scaled.
 *
 * `strokeWidth` lives in the object's own coordinate space, so by default a
 * stroke is stretched along with the shape: scale a rectangle taller than it is
 * wide and its top and bottom edges render at `strokeWidth * scaleY` while its
 * left and right edges render at `strokeWidth * scaleX`. Two sides go bold, two
 * stay put, and a free resize gives you a border of two different thicknesses.
 *
 * The deeper problem is that nothing downstream models that. `fabricStrokeToDoc`
 * saves one `stroke.width` per object, so the document, the PDF and the print
 * output all describe an even border — only the canvas disagreed. Uniform
 * strokes make what you see match what you save, and match what every other
 * design tool does on a free resize.
 */
fabric.Object.prototype.strokeUniform = true

/**
 * Re-render while scaling instead of stretching the cached bitmap.
 *
 * Without this the uniform stroke is only correct once you let go of the handle:
 * mid-drag fabric stretches the cache, which reintroduces exactly the uneven
 * border above and then snaps to the right one on mouse-up. Costs a redraw per
 * scaling frame, which an artboard of this size can afford.
 */
fabric.Object.prototype.noScaleCache = false

/**
 * Draw text straight to the canvas instead of through an offscreen cache.
 *
 * A cached object is rasterised into its own bitmap at
 * `objectScale x canvasZoom x devicePixelRatio`, then blitted back at whatever
 * sub-pixel offset its position works out to. That blit is a resample, and on
 * glyph stems - one or two pixels wide once the sheet is zoomed to fit - a
 * resample is the difference between a crisp edge and a grey smear. Uncached,
 * the same glyphs go through the browser's own text rasteriser at the canvas's
 * full device resolution, hinted and snapped, on every frame.
 *
 * Set on `fabric.Text`, so IText and Textbox inherit it. Shapes and images keep
 * their caches: they have no hinting to lose, and they are what the cache
 * actually pays off on.
 */
fabric.Text.prototype.objectCaching = false

/**
 * Force the uniform-stroke defaults onto objects that came from stored JSON.
 *
 * Fabric writes `strokeUniform` into `toObject()` output, so every template
 * saved before this module existed carries `strokeUniform: false` — and
 * `loadFromJSON` restores that, overriding the prototype default above. Without
 * this pass old artwork keeps the uneven border while new artwork does not.
 *
 * Groups are walked, because a group's children are serialised with their own
 * copy of the flag.
 */
export function applyStrokeDefaults(objects: fabric.Object[]): void {
  objects.forEach((o) => {
    o.set({ strokeUniform: true, noScaleCache: false })
    // Control visibility is per-instance, so restored lines need it reapplied
    // just as much as freshly built ones.
    applyLineControls(o)
    const children = (o as fabric.Group).getObjects?.()
    if (children?.length) applyStrokeDefaults(children)
  })
}

/**
 * Give a line the two end handles it can actually be resized by.
 *
 * A `fabric.Line` is one-dimensional: a horizontal one has `height: 0`, so the
 * only thickness its bounding box has is `strokeWidth`. That breaks the corner
 * controls in two visible ways.
 *
 * The eight handles collapse onto three positions — `tl`, `ml` and `bl` land
 * within a stroke-width of each other — which is why a selected line appears to
 * show doubled dots at its ends.
 *
 * Worse, fabric derives a new scale by dividing the dragged dimension by the
 * old one. Against a height of `strokeWidth` that divisor is about 2, so a
 * thirty-pixel drag sets `scaleY` to roughly 15 — on every corner drag, in
 * either direction. Repeat it and the scale compounds while the drawn segment
 * stays where it is, leaving the line adrift in a selection box many times its
 * size, and eventually outside it.
 *
 * Along its own axis the arithmetic is sound, so `ml` and `mr` stay. Rotation
 * is unaffected and stays too.
 */
export function applyLineControls(object: fabric.Object): void {
  if (object.type !== 'line') return
  object.setControlsVisibility({
    tl: false,
    tr: false,
    bl: false,
    br: false,
    mt: false,
    mb: false,
    ml: true,
    mr: true,
    mtr: true,
  })
}
