// src/lib/design/text-style.ts
//
// Letter case and text effects, shared by the builder, the saved document and
// every renderer that rebuilds a design from it.
//
// Both are expressed in terms the canvas already draws. A case is the text that
// is shown; an effect is the shadow, stroke, fill and highlight it sets. So a
// proof, a PDF or a thumbnail rendered from the document looks the same without
// knowing either feature exists — the extra properties only remember the
// choice, so the menus can show it again.

import { fabric } from 'fabric'
import type { TextCase, TextEffectKind } from '@/types/design'

type FabricText = fabric.Object & Record<string, any>

/* ── Case ───────────────────────────────────────────────────────── */

export const TEXT_CASES: { value: TextCase; glyph: string; title: string }[] = [
  { value: 'none', glyph: 'Aa', title: 'As typed' },
  { value: 'lower', glyph: 'a↓', title: 'lowercase' },
  { value: 'upper', glyph: 'A↑', title: 'UPPERCASE' },
]

export function applyTextCase(text: string, textCase?: TextCase): string {
  if (textCase === 'upper') return text.toLocaleUpperCase()
  if (textCase === 'lower') return text.toLocaleLowerCase()
  return text
}

export function textCaseOf(o: FabricText): TextCase {
  return o.textCase === 'upper' || o.textCase === 'lower' ? o.textCase : 'none'
}

/**
 * What was typed, before any case was applied.
 *
 * The case changes what is shown, never what was written: "As typed" has to be
 * able to give a name back its capitals after it has been shown in lowercase.
 */
export function rawTextOf(o: FabricText): string {
  if (textCaseOf(o) !== 'none' && typeof o.rawText === 'string')
    return o.rawText
  return typeof o.text === 'string' ? o.text : ''
}

/**
 * Replaces the text shown, keeping an open editor in step.
 *
 * Fabric edits through a hidden textarea and works out each keystroke by
 * comparing it with the text it holds. Changing the text without the textarea
 * would make the next keystroke look like a paste of everything that differs.
 */
function showText(o: FabricText, text: string): void {
  if (o.text === text) return
  const start = o.selectionStart as number | undefined
  const end = o.selectionEnd as number | undefined
  o.set('text', text)
  if (o.isEditing) {
    const clamp = (n: number | undefined) =>
      Math.min(Math.max(0, n ?? 0), text.length)
    if (o.hiddenTextarea) o.hiddenTextarea.value = text
    o.selectionStart = clamp(start)
    o.selectionEnd = clamp(end)
    o.hiddenTextarea?.setSelectionRange?.(o.selectionStart, o.selectionEnd)
  }
  o.set('dirty', true)
}

/** Sets the case, showing the typed text in it. `none` shows it as typed. */
export function applyTextCaseToFabric(o: FabricText, next: TextCase): void {
  const raw = rawTextOf(o)
  if (next === 'none') {
    o.textCase = undefined
    o.rawText = undefined
  } else {
    o.textCase = next
    o.rawText = raw
  }
  showText(o, applyTextCase(raw, next))
}

/**
 * Writes text from outside the editor — a buyer's field value, the
 * personalisation list — as typed, shown in the object's case.
 */
export function setTextKeepingCase(o: FabricText, text: string): void {
  const textCase = textCaseOf(o)
  if (textCase === 'none') {
    o.set('text', text)
    return
  }
  o.rawText = text
  showText(o, applyTextCase(text, textCase))
}

/**
 * Carries an edit made on the canvas back into the typed text.
 *
 * The editor only ever sees the cased text, so the change is found by what it
 * did to that — the run that differs between before and after — and the same
 * run is replaced in the typed text. Everything the buyer did not touch keeps
 * the capitals it was typed with, and what they typed is shown cased at once.
 *
 * A case map that changes a string's length ("ß" to "SS") makes the positions
 * incomparable; the edited text is then taken as typed, which is only ever a
 * matter of case.
 */
export function syncTextCaseAfterEdit(o: FabricText | null | undefined): void {
  if (!o) return
  const textCase = textCaseOf(o)
  if (textCase === 'none') return

  const shown = typeof o.text === 'string' ? o.text : ''
  const raw = typeof o.rawText === 'string' ? o.rawText : shown
  const before = applyTextCase(raw, textCase)

  let nextRaw = shown
  if (before.length === raw.length) {
    let prefix = 0
    while (
      prefix < before.length &&
      prefix < shown.length &&
      before[prefix] === shown[prefix]
    )
      prefix++
    let suffix = 0
    while (
      suffix < before.length - prefix &&
      suffix < shown.length - prefix &&
      before[before.length - 1 - suffix] === shown[shown.length - 1 - suffix]
    )
      suffix++
    nextRaw =
      raw.slice(0, prefix) +
      shown.slice(prefix, shown.length - suffix) +
      raw.slice(raw.length - suffix)
  }

  o.rawText = nextRaw
  const cased = applyTextCase(nextRaw, textCase)
  // Only a change that keeps the length can be shown mid-edit without moving
  // the caret; anything else is shown cased the next time the text is set.
  if (cased !== shown && cased.length === shown.length) showText(o, cased)
}

/* ── Effects ────────────────────────────────────────────────────── */

export const TEXT_EFFECTS: {
  kind: TextEffectKind
  label: string
  /** Whether the effect has a colour of its own to choose. */
  color: boolean
  /** Whether it has a strength to set. */
  intensity: boolean
}[] = [
  { kind: 'none', label: 'None', color: false, intensity: false },
  { kind: 'shadow', label: 'Shadow', color: true, intensity: true },
  { kind: 'lift', label: 'Lift', color: false, intensity: true },
  { kind: 'outline', label: 'Outline', color: true, intensity: true },
  { kind: 'hollow', label: 'Hollow', color: true, intensity: true },
  { kind: 'glow', label: 'Glow', color: true, intensity: true },
  { kind: 'background', label: 'Background', color: true, intensity: false },
]

const DEFAULT_INTENSITY = 50

function toRgba(color: string, alpha: number): string {
  const match = /^#([0-9a-f]{6})$/i.exec(color)
  if (!match) return color
  const n = parseInt(match[1], 16)
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`
}

/** The colour the letters are painted in. Hollow text carries it on its outline. */
function lettersColor(o: FabricText): string {
  if (o.textEffect === 'hollow' && typeof o.stroke === 'string' && o.stroke)
    return o.stroke
  return typeof o.fill === 'string' && o.fill && o.fill !== 'transparent'
    ? o.fill
    : '#000000'
}

function defaultEffectColor(kind: TextEffectKind, letters: string): string {
  switch (kind) {
    case 'shadow':
      return '#000000'
    case 'outline':
      return '#111827'
    case 'background':
      return '#fde68a'
    default:
      // Hollow and glow read best in the text's own colour.
      return letters
  }
}

/**
 * Which effect the object shows.
 *
 * The recorded choice is believed only while the object still draws it: a
 * shadow removed in the Style panel means the text no longer has a Shadow
 * effect, whatever was chosen earlier.
 */
function effectKindOf(o: FabricText): TextEffectKind {
  const hasShadow = !!o.shadow
  const hasStroke = !!o.stroke && (o.strokeWidth || 0) > 0
  const kind = o.textEffect as TextEffectKind | undefined
  switch (kind) {
    case 'shadow':
    case 'lift':
    case 'glow':
      return hasShadow ? kind : 'none'
    case 'outline':
      return hasStroke && o.fill !== 'transparent' ? kind : 'none'
    case 'hollow':
      return hasStroke && o.fill === 'transparent' ? kind : 'none'
    case 'background':
      return o.textBackgroundColor ? kind : 'none'
    default:
      return 'none'
  }
}

export function textEffectOf(o: FabricText): {
  kind: TextEffectKind
  color: string
  intensity: number
} {
  const kind = effectKindOf(o)
  return {
    kind,
    color:
      typeof o.textEffectColor === 'string' && o.textEffectColor
        ? o.textEffectColor
        : defaultEffectColor(kind, lettersColor(o)),
    intensity:
      typeof o.textEffectIntensity === 'number'
        ? o.textEffectIntensity
        : DEFAULT_INTENSITY,
  }
}

/**
 * Gives the text an effect, replacing whatever effect it had.
 *
 * Sizes are proportional to the font size, so an effect chosen on a headline
 * and on a footnote looks like the same effect. Choosing the effect the text
 * already has keeps its colour and strength; a new one starts from defaults.
 */
export function applyTextEffectToFabric(
  o: FabricText,
  kind: TextEffectKind,
  patch: { color?: string; intensity?: number } = {}
): void {
  const current = textEffectOf(o)
  const same = current.kind === kind
  const letters = lettersColor(o)
  const color =
    patch.color ?? (same ? current.color : defaultEffectColor(kind, letters))
  const intensity = Math.min(
    100,
    Math.max(
      0,
      patch.intensity ?? (same ? current.intensity : DEFAULT_INTENSITY)
    )
  )

  // Clear the previous effect first, per-character overrides included, so two
  // effects never stack and a highlighted word does not keep its own outline.
  for (const key of ['stroke', 'strokeWidth', 'textBackgroundColor']) {
    try {
      o.removeStyle?.(key)
    } catch {
      /* no per-character styles to clear */
    }
  }
  if (o.fill === 'transparent') o.set('fill', letters)
  o.set('shadow', null as never)
  o.set({
    stroke: null,
    strokeWidth: 0,
    paintFirst: 'fill',
    textBackgroundColor: '',
  } as never)

  const size = Math.max(1, Number(o.fontSize) || 16)
  // 0.25x at the weakest, 1.75x at the strongest.
  const k = 0.25 + (intensity / 100) * 1.5
  const px = (n: number) => Math.max(0, Math.round(n * 10) / 10)

  switch (kind) {
    case 'shadow':
      o.set(
        'shadow',
        new fabric.Shadow({
          color: toRgba(color, 0.5),
          blur: px(size * 0.04 * k),
          offsetX: px(size * 0.05 * k),
          offsetY: px(size * 0.05 * k),
        })
      )
      break
    case 'lift':
      o.set(
        'shadow',
        new fabric.Shadow({
          color: `rgba(15,23,42,${(0.15 + (intensity / 100) * 0.35).toFixed(2)})`,
          blur: px(size * 0.25 * k),
          offsetX: 0,
          offsetY: px(size * 0.06 * k),
        })
      )
      break
    case 'glow':
      o.set(
        'shadow',
        new fabric.Shadow({
          color: toRgba(color, 0.9),
          blur: px(size * 0.35 * k),
          offsetX: 0,
          offsetY: 0,
        })
      )
      break
    case 'outline':
      // Painted under the fill, so the outline sits outside the letters and
      // does not eat into them.
      o.set({
        stroke: color,
        strokeWidth: Math.max(0.5, px(size * 0.04 * k)),
        paintFirst: 'stroke',
      } as never)
      break
    case 'hollow':
      o.set({
        fill: 'transparent',
        stroke: color,
        strokeWidth: Math.max(0.5, px(size * 0.03 * k)),
      } as never)
      break
    case 'background':
      o.set('textBackgroundColor', color as never)
      break
    default:
      break
  }

  if (kind === 'none') {
    o.textEffect = undefined
    o.textEffectColor = undefined
    o.textEffectIntensity = undefined
  } else {
    o.textEffect = kind
    o.textEffectColor = color
    o.textEffectIntensity = intensity
  }
  o.set('dirty', true)
}

/** Fabric properties these features keep on an object. */
export const TEXT_STYLE_PROPS = [
  'textCase',
  'rawText',
  'textEffect',
  'textEffectColor',
  'textEffectIntensity',
]
