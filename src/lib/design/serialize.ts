// src/lib/design/serialize.ts
//
// Fabric canvas <-> DesignDocument. The document is the source of truth; fabric
// objects are the live editing representation rebuilt from it.

import { fabric } from 'fabric'

// Importing this also sets strokeUniform, so a free resize cannot leave a
// border thicker on two sides than the other two. Every other design module
// reaches fabric through this one, so the defaults land before any object does.
import { applyLineControls } from './fabric-defaults'
import { absoluteClipTransform, ownerLocalClipPlacement } from './clip-geometry'
import type {
  BlendMode,
  ClipShape,
  DesignObject,
  Fill,
  Gradient,
  GroupObject,
  ImageFilters,
  Shadow,
  ShapeObject,
  Stroke,
} from '@/types/design'
import { isGradient, newId } from '@/types/design'
import {
  applyTextCase,
  rawTextOf,
  textCaseOf,
  TEXT_STYLE_PROPS,
} from './text-style'
import { IMAGE_STYLE_PROPS } from './image-tools'
import {
  loadFabricImage,
  UNLOADED_SRC_PROP,
  unloadedImagePlaceholder,
} from './image-load'

/** Fabric props that must survive toObject/loadFromJSON round-trips. */
export const CUSTOM_PROPS = [
  ...TEXT_STYLE_PROPS,
  ...IMAGE_STYLE_PROPS,
  // The address of a picture that would not load, kept on its stand-in.
  UNLOADED_SRC_PROP,
  'designId',
  'designName',
  'designType',
  'codeValue',
  'codeFormat',
  'binding',
  'isPrintArea',
  'isGuide',
  'isOverlay',
  'isPasteboardMask',
  'isMockup',
  'selectable',
  'evented',
  'locked',
  'naturalAspect',
  'srcCrop',
  'imageFilters',
  'placeholderText',
  'gradientAngle',
  'layerId',
  'layerName',
  'layerLabel',
  'customType',
  'scanUrl',
  'fieldKey',
  'isEditableBySiteUser',
  'isRequired',
  'helperText',
]

export type FabricAny = fabric.Object & Record<string, any>

/** Print area and rulers/guides/grid overlays are chrome, never document objects. */
export function isChrome(o: FabricAny): boolean {
  return (
    !!o?.isPrintArea ||
    !!o?.isGuide ||
    !!o?.isOverlay ||
    !!o?.isPasteboardMask ||
    // The garment behind the artboard is scenery. It is never ordered, never
    // exported and never part of the document's objects.
    !!o?.isMockup
  )
}

/* ── Fill / stroke / shadow ─────────────────────────────────────── */

function fabricFillToDoc(obj: FabricAny): Fill {
  const f = obj.fill
  if (f && typeof f === 'object' && (f as fabric.Gradient).colorStops) {
    const g = f as any
    return {
      kind: g.type === 'radial' ? 'radial' : 'linear',
      angle: g.coords
        ? Math.round(
            (Math.atan2(
              (g.coords.y2 ?? 0) - (g.coords.y1 ?? 0),
              (g.coords.x2 ?? 0) - (g.coords.x1 ?? 0)
            ) *
              180) /
              Math.PI
          )
        : 0,
      stops: (g.colorStops || []).map((s: any) => ({
        offset: s.offset ?? 0,
        color: s.color ?? '#000000',
      })),
    }
  }
  return typeof f === 'string' ? f : 'transparent'
}

/** Build a fabric gradient sized to the object it will be applied to. */
export function docFillToFabric(
  fill: Fill,
  width: number,
  height: number
): string | fabric.Gradient {
  if (!isGradient(fill)) return fill || 'transparent'
  const g = fill as Gradient
  if (g.kind === 'radial') {
    const r = Math.max(width, height) / 2
    return new fabric.Gradient({
      type: 'radial',
      gradientUnits: 'pixels',
      coords: {
        x1: width / 2,
        y1: height / 2,
        r1: 0,
        x2: width / 2,
        y2: height / 2,
        r2: r,
      },
      colorStops: g.stops.map((s) => ({ offset: s.offset, color: s.color })),
    })
  }
  const rad = ((g.angle ?? 0) * Math.PI) / 180
  const dx = (Math.cos(rad) * width) / 2
  const dy = (Math.sin(rad) * height) / 2
  return new fabric.Gradient({
    type: 'linear',
    gradientUnits: 'pixels',
    coords: {
      x1: width / 2 - dx,
      y1: height / 2 - dy,
      x2: width / 2 + dx,
      y2: height / 2 + dy,
    },
    colorStops: g.stops.map((s) => ({ offset: s.offset, color: s.color })),
  })
}

function fabricStrokeToDoc(obj: FabricAny): Stroke | undefined {
  if (!obj.stroke || !obj.strokeWidth) return undefined
  const dash: number[] | undefined = obj.strokeDashArray || undefined
  return {
    color: String(obj.stroke),
    width: obj.strokeWidth,
    dash,
    style: !dash ? 'solid' : dash[0] <= 2 ? 'dotted' : 'dashed',
  }
}

export function strokeDash(stroke?: Stroke): number[] | undefined {
  if (!stroke) return undefined
  if (stroke.dash) return stroke.dash
  if (stroke.style === 'dashed') return [8, 4]
  if (stroke.style === 'dotted') return [2, 3]
  return undefined
}

function fabricShadowToDoc(obj: FabricAny): Shadow | undefined {
  const s = obj.shadow as fabric.Shadow | null
  if (!s) return undefined
  return {
    color: s.color || 'rgba(0,0,0,0.3)',
    blur: s.blur ?? 0,
    offsetX: s.offsetX ?? 0,
    offsetY: s.offsetY ?? 0,
  }
}

export function docShadowToFabric(shadow?: Shadow): fabric.Shadow | undefined {
  if (!shadow) return undefined
  return new fabric.Shadow({
    color: shadow.color,
    blur: shadow.blur,
    offsetX: shadow.offsetX,
    offsetY: shadow.offsetY,
  })
}

/* ── Clip path (masking) ────────────────────────────────────────── */

function fabricClipToDoc(obj: FabricAny): ClipShape | null {
  const c = obj.clipPath as FabricAny | undefined
  if (!c) return null
  // Resolved through the owner, never read straight off the clip. A mask's clip
  // is anchored to its group's centre, so its `left`/`top` are an offset of a
  // few pixels, not a canvas position: writing those down as coordinates is what
  // moved every reloaded mask into the top-left corner of the sheet.
  const t = absoluteClipTransform(c, obj)
  if (!t) return null
  const box = {
    x: Math.round((t.centerX - t.width / 2) * 100) / 100,
    y: Math.round((t.centerY - t.height / 2) * 100) / 100,
    width: Math.round(t.width * 100) / 100,
    height: Math.round(t.height * 100) / 100,
    angle: Math.round(t.angle * 100) / 100,
    anchor: (c.absolutePositioned ? 'canvas' : 'owner') as 'canvas' | 'owner',
  }
  switch (c.type) {
    case 'circle':
    case 'ellipse':
      return { kind: 'ellipse', ...box }
    case 'path':
      return { kind: 'path', ...box, path: pathToString(c) }
    case 'i-text':
    case 'text':
    case 'textbox':
      return {
        kind: 'text',
        ...box,
        content: c.text || '',
        fontFamily: c.fontFamily || 'Inter',
        fontSize: c.fontSize || 48,
        fontWeight: c.fontWeight,
      }
    default:
      return { kind: 'rect', ...box, cornerRadius: c.rx || 0 }
  }
}

function pathToString(c: FabricAny): string {
  try {
    const p = c.path
    if (typeof p === 'string') return p
    if (Array.isArray(p)) return p.map((seg: any[]) => seg.join(' ')).join(' ')
  } catch {
    /* fall through */
  }
  return ''
}

/**
 * Rebuild a saved clip onto the object it belongs to.
 *
 * The document holds the clip in canvas space, because that is the only
 * description that means the same thing to a reader with no fabric object to
 * measure against. Putting it back means converting to whichever anchoring the
 * clip was built with - and an owner-anchored clip has to be *built* at its
 * owner-local size, since the owner's matrix scales it again on the way to the
 * screen: a rebuilt image carries whatever scale fits it to its saved box.
 *
 * `legacy` reads a version-1 document. See DESIGN_SCHEMA_VERSION.
 */
export function docClipToFabric(
  clip: ClipShape | null | undefined,
  owner?: FabricAny,
  legacy = false
): fabric.Object | null {
  if (!clip) return null

  // A version-1 group clip was written out as the owner-local offset it already
  // was, so those numbers are the placement this function wants - it is only
  // the label that was wrong.
  const legacyGroupClip = legacy && !!owner && owner.type === 'group'
  const anchor =
    clip.anchor ?? (owner && owner.type === 'group' ? 'owner' : 'canvas')
  const toOwner = !!owner && (anchor === 'owner' || legacyGroupClip)

  const placement =
    toOwner && !legacyGroupClip
      ? ownerLocalClipPlacement(
          {
            centerX: clip.x + clip.width / 2,
            centerY: clip.y + clip.height / 2,
            width: clip.width,
            height: clip.height,
            angle: clip.angle ?? 0,
            kind: clip.kind,
          },
          owner as FabricAny
        )
      : {
          left: legacyGroupClip ? clip.x : clip.x + clip.width / 2,
          top: legacyGroupClip ? clip.y : clip.y + clip.height / 2,
          width: clip.width,
          height: clip.height,
          angle: clip.angle ?? 0,
        }

  const common = {
    left: placement.left,
    top: placement.top,
    // Centre origin, so a rotated clip turns about the box the document
    // describes instead of swinging around a corner.
    originX: 'center' as const,
    originY: 'center' as const,
    angle: placement.angle,
    absolutePositioned: !toOwner,
    // A clip is a boundary, never a drawn edge, and fabric's default stroke
    // width of 1 would count towards the box it measures - so the clip would
    // come back a pixel larger than it went in, once per save.
    strokeWidth: 0,
  }

  switch (clip.kind) {
    case 'ellipse':
      return new fabric.Ellipse({
        ...common,
        rx: placement.width / 2,
        ry: placement.height / 2,
      })
    case 'path': {
      const path = new fabric.Path(clip.path, common)
      // A path carries its own geometry, so it is sized by scaling rather than
      // by width/height - without this a resized custom mask comes back at
      // whatever size its path data happened to describe.
      if (path.width && placement.width > 0)
        path.scaleX = placement.width / path.width
      if (path.height && placement.height > 0)
        path.scaleY = placement.height / path.height
      return path
    }
    case 'text':
      return new fabric.Text(clip.content, {
        ...common,
        fontFamily: clip.fontFamily,
        fontSize: clip.fontSize,
        fontWeight: clip.fontWeight,
      })
    case 'rect':
    default:
      return new fabric.Rect({
        ...common,
        width: placement.width,
        height: placement.height,
        rx: clip.cornerRadius || 0,
        ry: clip.cornerRadius || 0,
      })
  }
}

/* ── Image placeholders ─────────────────────────────────────────── */

/** What an empty picture box says when the designer has not written anything. */
export const DEFAULT_PLACEHOLDER_LABEL = 'Upload Your Design'

/**
 * Paint a message inside an empty picture box.
 *
 * A grey rectangle tells a buyer nothing. The reference every customer knows
 * puts the instruction *in* the box — "Upload Your Design" — so the thing to do
 * is where the thing is, rather than in a panel they have to find first.
 *
 * Drawn by overriding `_render` rather than by grouping a rectangle with a text
 * object. A group would serialise as a group, and this has to stay one image
 * layer: it is what the buyer replaces, what the designer marks editable, and
 * what the storefront lists as a field. One object in, one object out.
 *
 * The label is unscaled on purpose. Stretch a 120px box to 600 and the message
 * should stay legible type, not five-times-tall letters.
 */
export function applyPlaceholderLabel(obj: FabricAny, label: string): void {
  obj.placeholderText = label
  obj.dirty = true

  const base = Object.getPrototypeOf(obj)._render as (
    ctx: CanvasRenderingContext2D
  ) => void

  obj._render = function (this: FabricAny, ctx: CanvasRenderingContext2D) {
    base.call(this, ctx)
    const text = (this.placeholderText as string) || ''
    if (!text) return

    const sx = Math.abs(this.scaleX || 1) || 1
    const sy = Math.abs(this.scaleY || 1) || 1
    const w = (this.width || 0) * sx
    const h = (this.height || 0) * sy
    if (w < 24 || h < 16) return

    ctx.save()
    // Back out of the object's own scale so the type keeps its proportions.
    ctx.scale(1 / sx, 1 / sy)
    const size = Math.max(9, Math.min(20, w / 11))
    ctx.font = `600 ${size}px Inter, system-ui, sans-serif`
    ctx.fillStyle = '#6b7280'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'

    // Wrapped to the box, because "Upload Your Design" on one line stops fitting
    // the moment a designer draws a tall narrow slot for a logo.
    const lines: string[] = []
    let line = ''
    for (const word of text.split(/\s+/)) {
      const next = line ? `${line} ${word}` : word
      if (line && ctx.measureText(next).width > w * 0.84) {
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
    ctx.restore()
  }
}

/* ── Image filters ──────────────────────────────────────────────── */

export function applyImageFilters(img: fabric.Image, f?: ImageFilters) {
  const filters: fabric.IBaseFilter[] = []
  if (!f) {
    img.filters = filters
    img.applyFilters()
    return
  }
  const F = fabric.Image.filters as any
  // Fabric's rotation runs -1 to 1 for -180 to 180 degrees.
  if (f.hue) filters.push(new F.HueRotation({ rotation: f.hue / 180 }))
  if (f.brightness) filters.push(new F.Brightness({ brightness: f.brightness }))
  if (f.contrast) filters.push(new F.Contrast({ contrast: f.contrast }))
  if (f.saturation) filters.push(new F.Saturation({ saturation: f.saturation }))
  if (f.blur) filters.push(new F.Blur({ blur: f.blur }))
  if (f.grayscale) filters.push(new F.Grayscale())
  img.filters = filters
  img.applyFilters()
}

/* ── Editor-tag compatibility ───────────────────────────────────── */
//
// The builder tags fabric objects with layerId / layerName / customType /
// scanUrl and loose binding fields. Accept either naming so the document model
// can be adopted without rewriting every call site in the editor.

function idOf(o: FabricAny): string {
  return o.designId || o.layerId || newId()
}
function nameOf(o: FabricAny): string {
  return (
    o.designName ||
    o.layerName ||
    o.designType ||
    o.customType ||
    o.type ||
    'Layer'
  )
}
function kindOf(o: FabricAny): string | undefined {
  return o.designType || o.customType
}
function codeValueOf(o: FabricAny): string {
  return o.codeValue ?? o.scanUrl ?? ''
}
function bindingOf(o: FabricAny) {
  if (o.binding) return o.binding
  if (!o.isEditableBySiteUser && !o.fieldKey) return undefined
  return {
    editable: !!o.isEditableBySiteUser,
    fieldKey: o.fieldKey || undefined,
    label: o.layerLabel || undefined,
    helperText: o.helperText || undefined,
    required: !!o.isRequired,
  }
}

/** Write both namings back onto a rebuilt object so the editor keeps working. */
export function applyEditorTags(f: FabricAny, o: DesignObject): FabricAny {
  f.designId = o.id
  f.layerId = o.id
  f.designName = o.name
  f.layerName = o.name
  f.designType = o.type
  // The editor keys behaviour off customType; keep it in step with the document
  // type so a reloaded template behaves like a freshly drawn one.
  if (!f.customType) f.customType = o.type === 'group' ? 'group' : o.type
  f.binding = o.binding
  f.isEditableBySiteUser = !!o.binding?.editable
  f.fieldKey = o.binding?.fieldKey
  f.layerLabel = o.binding?.label || o.name
  f.helperText = o.binding?.helperText
  f.isRequired = !!o.binding?.required
  return f
}

/* ── Fabric object -> document object ───────────────────────────── */

function shapeKindOf(
  obj: FabricAny
): 'rect' | 'ellipse' | 'polygon' | 'line' | 'path' {
  switch (obj.type) {
    case 'circle':
    case 'ellipse':
      return 'ellipse'
    case 'line':
      return 'line'
    case 'polygon':
    case 'triangle':
      return 'polygon'
    case 'path':
      return 'path'
    default:
      return 'rect'
  }
}

export function fabricToDesignObject(
  obj: FabricAny,
  zIndex: number
): DesignObject {
  const base = {
    id: idOf(obj),
    name: nameOf(obj),
    x: Math.round((obj.left ?? 0) * 100) / 100,
    y: Math.round((obj.top ?? 0) * 100) / 100,
    width: Math.round(obj.getScaledWidth() * 100) / 100,
    height: Math.round(obj.getScaledHeight() * 100) / 100,
    rotation: Math.round(obj.angle ?? 0),
    opacity: obj.opacity ?? 1,
    blendMode: ((obj.globalCompositeOperation as string) ||
      'normal') as BlendMode,
    zIndex,
    locked: obj.selectable === false,
    visible: obj.visible !== false,
    clipPath: fabricClipToDoc(obj),
    binding: bindingOf(obj),
  }

  if (obj.type === 'group') {
    const group = obj as unknown as fabric.Group
    return {
      ...base,
      type: 'group',
      // Child coords are stored absolutely so ungrouping is lossless.
      children: group
        .getObjects()
        .map((child, i) =>
          fabricToDesignObject(
            childInAbsoluteSpace(child as FabricAny, group),
            i + 1
          )
        ),
    } as GroupObject
  }

  const kind = kindOf(obj)
  if (kind === 'qrcode' || kind === 'barcode') {
    return {
      ...base,
      type: kind,
      value: codeValueOf(obj),
      format: obj.codeFormat,
    } as DesignObject
  }

  /*
   * A picture, or the space reserved for one.
   *
   * The type test alone was not enough. An empty box is a `fabric.Rect` that
   * has been *tagged* as an image — that is what makes it a slot a buyer can
   * upload into — and `obj.type` says "rect", so it fell through to the shape
   * branch below and was saved as a grey rectangle. Reloading turned every
   * reserved space into decoration: no upload, no instruction, no field.
   */
  if (obj.type === 'image' || kind === 'image' || kind === 'logo') {
    const img = obj as unknown as fabric.Image
    return {
      ...base,
      type: 'image',
      // `getSrc` exists on a real image and not on the rectangle standing in
      // for one, which is exactly the difference between full and empty. A
      // picture that would not load is a rectangle too, but a full one: its
      // address is kept on it, so saving does not empty the space.
      src:
        typeof img.getSrc === 'function'
          ? img.getSrc()
          : (obj[UNLOADED_SRC_PROP] as string) || (obj.src as string) || '',
      placeholder: (obj.placeholderText as string) || undefined,
      crop: obj.srcCrop || undefined,
      filters: obj.imageFilters || undefined,
      naturalAspect: obj.naturalAspect,
      frame: obj.imageFrame || undefined,
      fit: obj.imageFit || undefined,
      shadow: fabricShadowToDoc(obj),
    } as DesignObject
  }

  if (obj.type === 'i-text' || obj.type === 'text' || obj.type === 'textbox') {
    const t = obj as unknown as fabric.IText
    return {
      ...base,
      type: 'text',
      // As typed. The case it is shown in travels separately, so a buyer's
      // value set into this layer is cased the same way the designer's was.
      content: rawTextOf(obj),
      fontFamily: t.fontFamily || 'Inter',
      fontSize: Math.round((t.fontSize || 16) * (obj.scaleY || 1)),
      fontWeight: (t.fontWeight as string | number) ?? 'normal',
      fontStyle: (t.fontStyle as 'normal' | 'italic') || 'normal',
      color: typeof t.fill === 'string' ? t.fill : '#000000',
      align: (t.textAlign as 'left' | 'center' | 'right') || 'left',
      letterSpacing: t.charSpacing ?? 0,
      lineHeight: t.lineHeight ?? 1.16,
      underline: !!t.underline,
      stroke: fabricStrokeToDoc(obj),
      shadow: fabricShadowToDoc(obj),
      textCase: textCaseOf(obj) === 'none' ? undefined : textCaseOf(obj),
      // The highlight was drawn and never saved, so it vanished on reload.
      highlight:
        typeof t.textBackgroundColor === 'string' && t.textBackgroundColor
          ? t.textBackgroundColor
          : undefined,
      effect: obj.textEffect
        ? {
            kind: obj.textEffect,
            color: obj.textEffectColor,
            intensity: obj.textEffectIntensity,
          }
        : undefined,
    } as DesignObject
  }

  return {
    ...base,
    type: 'shape',
    shape: shapeKindOf(obj),
    fill: fabricFillToDoc(obj),
    stroke: fabricStrokeToDoc(obj),
    cornerRadius: obj.rx || 0,
    shadow: fabricShadowToDoc(obj),
    path: obj.type === 'path' ? pathToString(obj) : undefined,
  } as DesignObject
}

/**
 * Fabric stores group children relative to the group centre. Re-express one in
 * absolute canvas space so the document tree is position-independent.
 *
 * Through the group's transform matrix, not by adding offsets to its centre.
 * The matrix is the only thing that carries the group's own rotation, and a
 * child of a turned group is not where `left + width / 2 + child.left` says it
 * is - a 30 degree group put its children a hundred pixels from where they were
 * drawn. The matrix also folds in the group's scale, which the hand arithmetic
 * applied to the offset but not to the child's own size.
 *
 * The clone is a genuine absolute-space object: origin, angle and scale are all
 * rewritten, and `group` is cleared so anything that asks the clone for its
 * transform is not handed the group's a second time. That lets nested groups
 * recurse through this same function.
 */
function childInAbsoluteSpace(
  child: FabricAny,
  group: fabric.Group
): FabricAny {
  const g = group as unknown as FabricAny
  // `getPointByOrigin` answers in the group's local space, rotation of the
  // child included; the matrix takes it from there to the canvas.
  const corner = fabric.util.transformPoint(
    child.getPointByOrigin('left', 'top'),
    g.calcTransformMatrix()
  )
  // Magnitudes: a flipped group mirrors its children, it does not give them a
  // negative size.
  const sx = Math.abs(g.scaleX || 1)
  const sy = Math.abs(g.scaleY || 1)

  const clone = Object.create(Object.getPrototypeOf(child)) as FabricAny
  Object.assign(clone, child)
  clone.group = undefined
  clone.left = corner.x
  clone.top = corner.y
  clone.originX = 'left'
  clone.originY = 'top'
  clone.angle = (g.angle || 0) + (child.angle || 0)
  clone.scaleX = (child.scaleX || 1) * sx
  clone.scaleY = (child.scaleY || 1) * sy
  return clone
}

/* ── Document -> fabric ─────────────────────────────────────────── */

export type CodeRenderer = (
  type: 'barcode' | 'qrcode',
  value: string
) => Promise<string | null>

/** Rebuild one document object as a live fabric object. */
export async function designObjectToFabric(
  o: DesignObject,
  renderCode: CodeRenderer,
  legacy = false
): Promise<fabric.Object | null> {
  const shared = {
    left: o.x,
    top: o.y,
    originX: 'left' as const,
    originY: 'top' as const,
    angle: o.rotation || 0,
    opacity: o.opacity ?? 1,
    visible: o.visible !== false,
    selectable: !o.locked,
    evented: !o.locked,
  }

  // The clip is anchored to the object, so it is built last - after whatever
  // scale fits the object to its saved box, which the clip is measured against.
  const tag = (f: FabricAny): FabricAny => {
    applyEditorTags(f, o)
    f.globalCompositeOperation =
      o.blendMode === 'normal' ? 'source-over' : o.blendMode
    const clip = docClipToFabric(o.clipPath, f, legacy)
    if (clip) f.clipPath = clip
    return f
  }

  if (o.type === 'group') {
    const children = (
      await Promise.all(
        o.children.map((c) => designObjectToFabric(c, renderCode, legacy))
      )
    ).filter(Boolean) as fabric.Object[]
    if (!children.length) return null
    // Position, angle and scale are deliberately withheld from the group.
    // Its children were saved in absolute canvas space and rebuilt there, so
    // fabric's own bounds calculation already puts the group exactly where it
    // was; handing it `shared` on top of that would apply the group's rotation
    // and offset a second time, to children that are already carrying them.
    const group = new fabric.Group(children, {
      opacity: shared.opacity,
      visible: shared.visible,
      selectable: shared.selectable,
      evented: shared.evented,
      // Matching `createMask`, so a reloaded mask group answers a click inside
      // it the way one built in this session does.
      subTargetCheck: !!o.clipPath,
    }) as FabricAny
    group.designType = 'group'
    return tag(group)
  }

  if (o.type === 'qrcode' || o.type === 'barcode') {
    const url = await renderCode(o.type, o.value)
    if (!url) return null
    const img = await loadFabricImage(url)
    if (!img) return null
    const f = img as FabricAny
    f.set(shared)
    f.designType = o.type
    f.codeValue = o.value
    f.codeFormat = o.format
    if (o.width > 0) f.scaleToWidth(o.width)
    return tag(f)
  }

  if (o.type === 'image') {
    if (!o.src) {
      // The dashed edge counts towards the box fabric measures, so the saved
      // size has it taken off before it is added back. Without this a reserved
      // space grew by a pixel every time the template was opened and saved.
      const edge = 1
      const ph = new fabric.Rect({
        ...shared,
        width: Math.max(1, o.width - edge),
        height: Math.max(1, o.height - edge),
        fill: '#e5e7eb',
        stroke: '#9ca3af',
        strokeDashArray: [4, 4],
        strokeWidth: edge,
      }) as FabricAny
      ph.designType = 'image'
      applyPlaceholderLabel(ph, o.placeholder ?? DEFAULT_PLACEHOLDER_LABEL)
      return tag(ph)
    }
    const img = await loadFabricImage(o.src)
    if (!img) {
      // The design still opens. A picture whose address does not answer —
      // removed from the library, host down — is stood in for by a marked box
      // that keeps the address and everything else the document said about
      // it, so saving writes the picture back exactly as it was loaded.
      const ph = unloadedImagePlaceholder(
        {
          ...shared,
          width: Math.max(1, o.width),
          height: Math.max(1, o.height),
        },
        o.src
      )
      ph.designType = 'image'
      ph.naturalAspect = o.naturalAspect
      ph.srcCrop = o.crop
      ph.imageFilters = o.filters
      ph.imageFrame = o.frame
      ph.imageFit = o.fit
      if (o.placeholder) ph.placeholderText = o.placeholder
      if (o.shadow) ph.set('shadow', docShadowToFabric(o.shadow))
      return tag(ph)
    }
    const f = img as FabricAny
    f.set(shared)
    f.designType = 'image'
    f.naturalAspect = o.naturalAspect
    f.srcCrop = o.crop
    f.imageFilters = o.filters
    f.imageFrame = o.frame
    f.imageFit = o.fit
    if (o.crop) {
      f.set({
        cropX: o.crop.x,
        cropY: o.crop.y,
        width: o.crop.width,
        height: o.crop.height,
      })
    }
    applyImageFilters(f as unknown as fabric.Image, o.filters)
    // Both axes, from the box that was saved. `scaleToWidth` scales the
    // height to match the source's aspect ratio, which silently undoes a
    // free resize - and inside a mask that reads as the picture moving,
    // because what the mask shows shifts with it.
    const naturalW = f.width || 0
    const naturalH = f.height || 0
    const sx = o.width > 0 && naturalW > 0 ? o.width / naturalW : f.scaleX || 1
    const sy = o.height > 0 && naturalH > 0 ? o.height / naturalH : sx
    f.set({ scaleX: sx, scaleY: sy })
    if (o.shadow) f.set('shadow', docShadowToFabric(o.shadow))
    return tag(f)
  }

  if (o.type === 'text') {
    const t = new fabric.IText(applyTextCase(o.content, o.textCase) || ' ', {
      ...shared,
      fontFamily: o.fontFamily,
      fontSize: o.fontSize,
      fontWeight: o.fontWeight,
      fontStyle: o.fontStyle,
      fill: o.color,
      textAlign: o.align,
      charSpacing: o.letterSpacing,
      lineHeight: o.lineHeight,
      underline: o.underline,
      textBackgroundColor: o.highlight || '',
    }) as FabricAny
    t.designType = 'text'
    if (o.textCase) {
      t.textCase = o.textCase
      t.rawText = o.content
    }
    if (o.stroke) t.set({ stroke: o.stroke.color, strokeWidth: o.stroke.width })
    if (o.shadow) t.set('shadow', docShadowToFabric(o.shadow))
    if (o.effect) {
      t.textEffect = o.effect.kind
      t.textEffectColor = o.effect.color
      t.textEffectIntensity = o.effect.intensity
      // An outline sits outside the letters; the document keeps the stroke but
      // not the paint order, which is what the preset decides.
      if (o.effect.kind === 'outline') t.set('paintFirst', 'stroke' as never)
    }
    return tag(t)
  }

  // shape - every other type returned above
  const s = o as ShapeObject
  const fill = docFillToFabric(s.fill, s.width, s.height)
  const strokeProps = s.stroke
    ? {
        stroke: s.stroke.color,
        strokeWidth: s.stroke.width,
        strokeDashArray: strokeDash(s.stroke),
      }
    : // Explicitly zero, not left to fabric. `strokeWidth` defaults to 1 on a
      // shape with no stroke to draw, and it still counts towards the box the
      // object measures - so a document that recorded that box would hand it
      // back as the shape's own width, and every save/reload cycle would grow
      // the shape by a pixel.
      { strokeWidth: 0 }
  // The saved box includes the stroke, which fabric adds back on top of
  // `width`/`height`. Take it off, or the same drift arrives by the other road.
  const strokeW = s.stroke?.width || 0
  const rawW = s.width - strokeW
  const rawH = s.height - strokeW
  // A line is one-dimensional, so its short side is legitimately zero. Every
  // other shape needs at least a pixel to exist at all.
  const boxW = Math.max(1, rawW)
  const boxH = Math.max(1, rawH)
  let shape: FabricAny
  switch (s.shape) {
    case 'ellipse':
      shape = new fabric.Ellipse({
        ...shared,
        rx: Math.max(0.5, boxW / 2),
        ry: Math.max(0.5, boxH / 2),
        fill,
        ...strokeProps,
      }) as FabricAny
      break
    case 'line':
      // The stroke is the whole of a line's thickness, so a horizontal one
      // measures `strokeWidth` tall. Passing that straight back as the second
      // point would tilt the line by the width of its own stroke, once per save.
      shape = new fabric.Line([0, 0, Math.max(1, rawW), Math.max(0, rawH)], {
        ...shared,
        stroke:
          s.stroke?.color || (typeof s.fill === 'string' ? s.fill : '#000000'),
        strokeWidth: s.stroke?.width || 1,
        strokeDashArray: strokeDash(s.stroke),
      }) as FabricAny
      break
    case 'polygon':
      shape = new fabric.Polygon(
        s.points?.length
          ? s.points
          : [
              { x: boxW / 2, y: 0 },
              { x: boxW, y: boxH },
              { x: 0, y: boxH },
            ],
        { ...shared, fill, ...strokeProps }
      ) as FabricAny
      break
    case 'path': {
      const path = new fabric.Path(s.path || 'M 0 0 L 10 10', {
        ...shared,
        fill,
        ...strokeProps,
      }) as FabricAny
      // Path data describes the shape at the size it was drawn, so a path that
      // was resized afterwards is only that size again once it is scaled back
      // to the box the document recorded.
      if (path.width && boxW > 0) path.scaleX = boxW / path.width
      if (path.height && boxH > 0) path.scaleY = boxH / path.height
      shape = path
      break
    }
    case 'rect':
    default:
      shape = new fabric.Rect({
        ...shared,
        width: boxW,
        height: boxH,
        rx: s.cornerRadius || 0,
        ry: s.cornerRadius || 0,
        fill,
        ...strokeProps,
      }) as FabricAny
      break
  }
  shape.designType = 'shape'
  if (s.shadow) shape.set('shadow', docShadowToFabric(s.shadow))
  // No-op for everything but a line, which needs end handles rather than corners.
  applyLineControls(shape)
  return tag(shape)
}

/* ── Whole-canvas conversion ────────────────────────────────────── */

/** Read the live canvas back out as document objects, in z-order. */
export function canvasToObjects(canvas: fabric.Canvas): DesignObject[] {
  return (canvas.getObjects() as FabricAny[])
    .filter((o) => !isChrome(o))
    .map((o, i) => fabricToDesignObject(o, i + 1))
}

/**
 * Whether this canvas has been thrown away.
 *
 * `dispose()` nulls the drawing contexts and leaves the rest of the object
 * standing, so a dead canvas still answers `add()` quite happily — and the
 * render that `add()` queues behind it reaches for a context that is no longer
 * there. What comes out is `Cannot read properties of null (reading 'save')`,
 * from an animation frame, with nothing in the stack naming the caller.
 *
 * It matters here because rebuilding artwork is asynchronous: images load. The
 * canvas the rebuild started for can be gone by the time the objects are ready
 * — a route change, a fast unmount, or React's development double-mount, which
 * tears the first canvas down while the first load is still in flight.
 *
 * `contextContainer` is real but absent from @types/fabric, hence the cast.
 */
function isDisposed(canvas: fabric.Canvas): boolean {
  return !(canvas as unknown as { contextContainer?: unknown }).contextContainer
}

/** Rebuild the canvas content from a document. Chrome is left untouched. */
export async function objectsToCanvas(
  canvas: fabric.Canvas,
  objects: DesignObject[],
  renderCode: CodeRenderer,
  schemaVersion?: number
): Promise<fabric.Object[]> {
  // A document with no version on it predates the fix to how clips are stored,
  // so it is read the old way. See DESIGN_SCHEMA_VERSION.
  const legacy = (schemaVersion ?? 1) < 2
  const ordered = [...objects].sort((a, b) => (a.zIndex ?? 0) - (b.zIndex ?? 0))
  const built = (
    await Promise.all(
      ordered.map((o) => designObjectToFabric(o, renderCode, legacy))
    )
  ).filter(Boolean) as fabric.Object[]
  // Between the first await and here, the canvas may have been disposed. Adding
  // to it is precisely what queues the render that dies on a null context, so
  // the objects are dropped instead: whoever disposed the canvas did not want
  // them, and the caller's own liveness check is about to say so too.
  if (isDisposed(canvas)) return []
  built.forEach((f) => canvas.add(f))
  return built
}
