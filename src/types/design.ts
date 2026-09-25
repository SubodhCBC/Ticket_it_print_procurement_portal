// src/types/design.ts
//
// Structured object model for the design editor. Everything on the canvas is a
// described object - never raw pixels - until export. Save, undo, grouping and
// masking all read off this one tree.

import type { TemplateFieldKey } from './index'

/* ── Units ──────────────────────────────────────────────────────── */

export type DesignUnit = 'in' | 'mm' | 'px'

/** Canvas pixels per unit at 96 dpi (the CSS reference), before dpi scaling. */
export const UNIT_TO_PX: Record<DesignUnit, number> = {
  in: 96,
  mm: 96 / 25.4,
  px: 1,
}

/* ── Shared primitives ──────────────────────────────────────────── */

export type BlendMode =
  | 'normal'
  | 'multiply'
  | 'screen'
  | 'overlay'
  | 'darken'
  | 'lighten'
  | 'color-dodge'
  | 'color-burn'
  | 'hard-light'
  | 'soft-light'
  | 'difference'
  | 'exclusion'
  | 'hue'
  | 'saturation'
  | 'color'
  | 'luminosity'

export type GradientStop = { offset: number; color: string }

export type Gradient = {
  kind: 'linear' | 'radial'
  /** Degrees, 0 = left-to-right. Linear only. */
  angle?: number
  stops: GradientStop[]
}

/** A solid colour string, or a gradient definition. */
export type Fill = string | Gradient

export type StrokeStyle = 'solid' | 'dashed' | 'dotted'

export type Stroke = {
  color: string
  width: number
  style?: StrokeStyle
  /** Explicit dash pattern; overrides `style` when present. */
  dash?: number[]
}

export type Shadow = {
  color: string
  blur: number
  offsetX: number
  offsetY: number
}

/**
 * Where a clip sits, in canvas pixels.
 *
 * Absolute, always — never the owner-relative offset fabric happens to be
 * holding at the time. The document has to describe the same boundary to a
 * reader that has no fabric object to measure it against, and a clip written
 * down in one anchoring mode and read back in the other lands somewhere else.
 */
export interface ClipBounds {
  /** Top-left of the *unrotated* box, before `angle` is applied about its centre. */
  x: number
  y: number
  width: number
  height: number
  /** Degrees, clockwise, about the box centre. */
  angle?: number
  /**
   * What the clip is pinned to, which decides what happens when the object it
   * clips is moved: `owner` travels with it (a mask group), `canvas` stays put
   * so the content can be slid around underneath it. Both exist in the editor,
   * so the document records which one this is rather than choosing for it.
   * Absent on version-1 documents; groups default to `owner` and everything
   * else to `canvas`, matching how each was built.
   */
  anchor?: 'canvas' | 'owner'
}

/** Non-destructive clip boundary applied to an object or group. */
export type ClipShape =
  | (ClipBounds & { kind: 'rect'; cornerRadius?: number })
  | (ClipBounds & { kind: 'ellipse' })
  | (ClipBounds & { kind: 'path'; path: string })
  | (ClipBounds & {
      kind: 'text'
      content: string
      fontFamily: string
      fontSize: number
      fontWeight?: string | number
    })

/**
 * Portal-specific: which layers a site user may edit when ordering, and which
 * merge field they map to. Not part of a generic editor, but it is why this
 * editor exists.
 */
export type SiteUserBinding = {
  editable: boolean
  fieldKey?: TemplateFieldKey
  label?: string
  helperText?: string
  required?: boolean
}

/* ── Base object ────────────────────────────────────────────────── */

export type DesignObjectType =
  'shape' | 'text' | 'image' | 'group' | 'barcode' | 'qrcode'

export interface BaseDesignObject {
  id: string
  type: DesignObjectType
  name: string
  /** Canvas pixels, top-left origin, unrotated. */
  x: number
  y: number
  width: number
  height: number
  /** Degrees, clockwise. */
  rotation: number
  /** 0-1. */
  opacity: number
  blendMode: BlendMode
  zIndex: number
  locked: boolean
  visible: boolean
  /** Non-destructive mask. The object keeps its full content; this hides the rest. */
  clipPath?: ClipShape | null
  binding?: SiteUserBinding
}

/* ── Concrete object types ──────────────────────────────────────── */

export type ShapeKind = 'rect' | 'ellipse' | 'polygon' | 'line' | 'path'

export interface ShapeObject extends BaseDesignObject {
  type: 'shape'
  shape: ShapeKind
  fill: Fill
  stroke?: Stroke
  cornerRadius?: number
  shadow?: Shadow
  /** SVG path data, for `shape: 'path'` (custom bezier). */
  path?: string
  /** Vertices for `shape: 'polygon'`, relative to the object box. */
  points?: { x: number; y: number }[]
}

/** How a text's letters are shown. The text keeps what was typed. */
export type TextCase = 'none' | 'lower' | 'upper'

export type TextEffectKind =
  'none' | 'shadow' | 'lift' | 'outline' | 'hollow' | 'glow' | 'background'

/**
 * The effect preset a text was given, and the two settings on it.
 *
 * A record of the choice, not the drawing: what renders is the `shadow`,
 * `stroke`, `color` and `highlight` the preset set, so a renderer that has never
 * heard of effects still draws the same text.
 */
export type TextEffect = {
  kind: Exclude<TextEffectKind, 'none'>
  color?: string
  /** 0-100. */
  intensity?: number
}

export interface TextObject extends BaseDesignObject {
  type: 'text'
  /** As typed. `textCase` decides how it is shown. */
  content: string
  /** Absent means as typed. */
  textCase?: Exclude<TextCase, 'none'>
  /** Colour painted behind the letters. */
  highlight?: string
  effect?: TextEffect
  fontFamily: string
  fontSize: number
  fontWeight: string | number
  fontStyle: 'normal' | 'italic'
  color: string
  align: 'left' | 'center' | 'right'
  letterSpacing: number
  lineHeight: number
  underline?: boolean
  stroke?: Stroke
  shadow?: Shadow
  /** SVG path for text on a curve. */
  path?: string
}

export type ImageFilters = {
  /** Degrees, -180 to 180. */
  hue?: number
  brightness?: number
  contrast?: number
  saturation?: number
  blur?: number
  grayscale?: number
}

export interface ImageObject extends BaseDesignObject {
  type: 'image'
  /** URL, data URL, or blob reference. */
  src: string
  /** Source-pixel crop rectangle. */
  crop?: { x: number; y: number; width: number; height: number }
  filters?: ImageFilters
  /** width / height of the untouched source, for proportional resize. */
  naturalAspect?: number
  /**
   * The box the picture has to occupy, in canvas pixels, and how it sits in
   * it. A record for the Fill and Fit tools: what renders is `crop` and the
   * object's own size.
   */
  frame?: { width: number; height: number }
  fit?: 'fill' | 'fit'
  shadow?: Shadow
  /**
   * What the empty box says before anybody has put a picture in it.
   *
   * A reserved space on a design is an instruction to whoever fills it, and the
   * instruction belongs inside the space: "Upload Your Design", "Your logo
   * here", "Branch photo — landscape". Only ever drawn while `src` is empty.
   */
  placeholder?: string
}

/** Machine-readable codes. Regenerated from `value`, never edited as pixels. */
export interface CodeObject extends BaseDesignObject {
  type: 'barcode' | 'qrcode'
  value: string
  format?: string
  foreground?: string
  background?: string
}

export interface GroupObject extends BaseDesignObject {
  type: 'group'
  /** Nested tree - a group may contain groups. Child coords are absolute. */
  children: DesignObject[]
}

export type DesignObject =
  ShapeObject | TextObject | ImageObject | CodeObject | GroupObject

/* ── Document ───────────────────────────────────────────────────── */

export type CanvasSize = {
  width: number
  height: number
  unit: DesignUnit
  /** Export resolution. 300 for print. */
  dpi: number
}

/**
 * One alternative reverse for a design.
 *
 * A business card has one front and, often, several backs: a plain one, one
 * carrying the branch's opening hours, one with a QR code to the booking page.
 * The designer draws each; the buyer picks one when they order.
 *
 * A side is a list of objects in the same canvas space as the front - same
 * size, same origin - so anything that can render the front can render a back
 * without knowing what it is looking at.
 */
export interface DesignSide {
  id: string
  /** What the buyer sees in the picker: "Opening hours", "Plain". */
  name: string
  objects: DesignObject[]
  /** Defaults to the document's own background when absent. */
  background?: Fill
}

export interface DesignDocument {
  canvasSize: CanvasSize
  /** Solid colour, gradient, or 'transparent'. */
  background: Fill
  objects: DesignObject[]
  /**
   * The thing being printed on, shown behind the artboard.
   *
   * A flyer is the sheet, so most designs have none of this. A cap is not: the
   * artboard is the 9 x 3.5cm panel above the peak, and a designer drawing into
   * it with nothing around it is working blind. So the garment is photographed
   * once and shown behind, with `area` saying where on that photograph the
   * printable panel sits — as fractions of the image, because the same
   * placement then holds at any zoom and any pixel size.
   *
   * It is scenery, not artwork. Nothing here is exported, ordered or printed;
   * the press receives what is inside the artboard and nothing else.
   *
   * On the template rather than on the product: one cap panel size is shared by
   * a dozen cap styles that photograph completely differently, and the mockup
   * belongs to the design that was drawn against it.
   */
  mockup?: {
    src: string
    /** The printable panel's place on the image, each 0..1. */
    area: { x: number; y: number; width: number; height: number }
    /**
     * The garment from other angles, in turn order, for a spin viewer.
     *
     * Viewing only: `src` and `area` above stay the frame the design is drawn
     * and edited against. These are what a buyer drags through to see the thing
     * from the back and the sides.
     *
     * Each frame carries its own `area`, because the printable panel moves as
     * the garment turns — a flat list of images would quietly assume the panel
     * sits in the same place on every angle. A frame with no `area` is one where
     * the panel is not visible at all, and shows the garment with no artwork on
     * it, which is the honest picture of a back three-quarter shot.
     *
     * The rule the whole field rests on: fractions are always of the image they
     * sit on, never of some other frame.
     */
    frames?: {
      src: string
      area?: { x: number; y: number; width: number; height: number }
    }[]
  }

  /**
   * The reverses this design offers, in the order the designer arranged them.
   *
   * Held in the document rather than in a table of their own, and that is a
   * decision worth stating. A back is artwork, and every piece of machinery
   * this system already has for artwork works on the document: publishing
   * snapshots it, a version restores it, copying a template for a customer
   * copies it, and the customiser loads it. A table would have needed all four
   * taught about it separately, and a migration besides.
   *
   * Absent or empty means a single-sided design, which is most of them.
   */
  backs?: DesignSide[]
  /** Which back a buyer gets before they choose. Null means the first. */
  defaultBackId?: string | null
  /**
   * @deprecated Ruler guides are no longer saved with a template — they are the
   * designer's own scaffolding, not artwork. Documents written before that
   * change still carry the field, so it stays on the type; nothing reads it.
   */
  guides?: { horizontal: number[]; vertical: number[] }
  grid?: { enabled: boolean; spacing: number; snap: boolean }
  meta: {
    createdAt: string
    updatedAt: string
    name: string
    version?: number
  }
}

/**
 * 2 — clips are stored in absolute canvas space, with their rotation.
 *
 * Version 1 wrote out whatever `left`/`top` a clip was holding. For a mask that
 * is an offset from its group's centre, so a document saved at version 1 puts
 * every mask near the canvas origin; `docClipToFabric` reads those back the old
 * way rather than dragging the corruption forward.
 */
export const DESIGN_SCHEMA_VERSION = 2

/* ── Helpers ────────────────────────────────────────────────────── */

export function isGroup(o: DesignObject): o is GroupObject {
  return o.type === 'group'
}

export function isCode(o: DesignObject): o is CodeObject {
  return o.type === 'barcode' || o.type === 'qrcode'
}

export function isGradient(f: Fill | undefined): f is Gradient {
  return !!f && typeof f === 'object' && 'stops' in f
}

/** Depth-first walk over the object tree, groups included. */
export function walkObjects(
  objects: DesignObject[],
  visit: (o: DesignObject, parent: GroupObject | null) => void,
  parent: GroupObject | null = null
): void {
  for (const o of objects) {
    visit(o, parent)
    if (isGroup(o)) walkObjects(o.children, visit, o)
  }
}

/** Flatten the tree to a list, groups included. */
export function flattenObjects(objects: DesignObject[]): DesignObject[] {
  const out: DesignObject[] = []
  walkObjects(objects, (o) => out.push(o))
  return out
}

export function findObject(
  objects: DesignObject[],
  id: string
): DesignObject | null {
  let hit: DesignObject | null = null
  walkObjects(objects, (o) => {
    if (!hit && o.id === id) hit = o
  })
  return hit
}

/** Bounding box enclosing a set of objects, in canvas pixels. */
export function boundsOf(objects: DesignObject[]) {
  if (!objects.length) return { x: 0, y: 0, width: 0, height: 0 }
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const o of objects) {
    minX = Math.min(minX, o.x)
    minY = Math.min(minY, o.y)
    maxX = Math.max(maxX, o.x + o.width)
    maxY = Math.max(maxY, o.y + o.height)
  }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY }
}

export function newId(prefix = 'obj'): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`
}

/* ── Unit conversion ────────────────────────────────────────────── */

/** Canvas pixels for a real-world measurement, at the CSS 96 dpi reference. */
export function toPx(value: number, unit: DesignUnit): number {
  return value * UNIT_TO_PX[unit]
}

export function fromPx(px: number, unit: DesignUnit): number {
  return px / UNIT_TO_PX[unit]
}

/** Canvas size in pixels, ignoring dpi (dpi only scales export). */
export function canvasPx(size: CanvasSize) {
  return {
    width: Math.max(1, Math.round(toPx(size.width, size.unit))),
    height: Math.max(1, Math.round(toPx(size.height, size.unit))),
  }
}

/** Multiplier that turns the 96 dpi working canvas into an export at `dpi`. */
export function exportMultiplier(size: CanvasSize): number {
  return Math.max(1, (size.dpi || 96) / 96)
}
