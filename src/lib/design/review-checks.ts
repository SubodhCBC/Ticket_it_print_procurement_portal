// src/lib/design/review-checks.ts
//
// What a buyer should look at again before a design goes in the cart.
//
// Pure: a design document in, a list of findings out. No canvas, no React, so
// the rule can be read — and tested — on its own.

import type { DesignDocument, DesignObject, DesignSide } from '@/types/design'

export type ReviewSide = 'front' | 'back'

export type ReviewIssueKind =
  /** Still reads exactly what the published template says. */
  | 'unchanged-text'
  /** A text box with nothing in it. */
  | 'empty-text'
  /** A reserved picture space nobody has put a picture in. */
  | 'empty-image'

export interface ReviewIssue {
  /** Unique across both sides: `front:<objectId>`. */
  key: string
  objectId: string
  side: ReviewSide
  kind: ReviewIssueKind
  /** What to call it to a buyer. */
  label: string
}

/** Names the editor gives an object by default, which mean nothing to a buyer. */
const GENERIC_NAMES = new Set([
  'text',
  'i-text',
  'itext',
  'textbox',
  'image',
  'logo',
  'rect',
  'shape',
  'group',
  'layer',
])

const normalise = (value: string | undefined | null) =>
  (value ?? '').replace(/\s+/g, ' ').trim()

function snippet(value: string, max = 28): string {
  const text = normalise(value)
  return text.length > max ? `${text.slice(0, max - 1)}…` : text
}

/**
 * What to call an object to a buyer.
 *
 * The designer's label first — "Branch name" — then a name somebody actually
 * typed, then the merge field, then the words themselves.
 */
export function buyerLabel(object: DesignObject): string {
  const bound = normalise(object.binding?.label)
  if (bound) return bound

  const name = normalise(object.name)
  if (name && !GENERIC_NAMES.has(name.toLowerCase())) return name

  const fieldKey = normalise(object.binding?.fieldKey)
  if (fieldKey) return fieldKey

  if (object.type === 'text' && normalise(object.content)) {
    return `“${snippet(object.content)}”`
  }
  if (object.type === 'image') {
    return normalise(object.placeholder) || 'Picture space'
  }
  return object.type === 'text' ? 'Text box' : 'Item'
}

/** Every text object's wording, by id, groups included. */
function textsById(objects: DesignObject[] | undefined): Map<string, string> {
  const out = new Map<string, string>()
  const walk = (list: DesignObject[]) => {
    for (const object of list) {
      if (object.type === 'text') out.set(object.id, normalise(object.content))
      if (object.type === 'group') walk(object.children ?? [])
    }
  }
  walk(objects ?? [])
  return out
}

function inspectSide(
  objects: DesignObject[],
  published: Map<string, string>,
  side: ReviewSide,
  out: ReviewIssue[]
) {
  const walk = (list: DesignObject[], lockedParent: boolean) => {
    for (const object of list) {
      // Hidden objects do not print, so there is nothing to review in them.
      if (object.visible === false) continue
      const locked = lockedParent || object.locked

      if (object.type === 'group') {
        walk(object.children ?? [], locked)
        continue
      }

      if (object.type === 'text') {
        // Locked wording is the designer's own copy — "Call us", a heading —
        // not something the buyer was asked to fill in or could change.
        if (locked) continue
        const content = normalise(object.content)
        const original = published.get(object.id)
        const kind: ReviewIssueKind | null = !content
          ? 'empty-text'
          : original !== undefined && original === content
            ? 'unchanged-text'
            : null
        if (kind) {
          out.push({
            key: `${side}:${object.id}`,
            objectId: object.id,
            side,
            kind,
            label: buyerLabel(object),
          })
        }
        continue
      }

      // An empty picture space is worth a look however it was set up: it prints
      // as the placeholder box the preview shows.
      if (object.type === 'image' && !object.src) {
        out.push({
          key: `${side}:${object.id}`,
          objectId: object.id,
          side,
          kind: 'empty-image',
          label: buyerLabel(object),
        })
      }
    }
  }
  walk(objects, false)
}

/** The back this document prints: the one it names, or its only one. */
export function printedBack(design: DesignDocument): DesignSide | null {
  const backs = design.backs ?? []
  if (backs.length === 0) return null
  return backs.find((side) => side.id === design.defaultBackId) ?? backs[0]
}

/**
 * The things on the front and the printed back a buyer should check.
 *
 * `design` is the artwork as it will be ordered — already trimmed to the
 * chosen back. `published` is the operator's template, which is what "you
 * didn't change this" is measured against: the same object id on the front,
 * and on the back with the same id.
 */
export function findReviewIssues(
  design: DesignDocument,
  published: DesignDocument | null | undefined
): ReviewIssue[] {
  const issues: ReviewIssue[] = []
  inspectSide(
    design.objects ?? [],
    textsById(published?.objects),
    'front',
    issues
  )

  const back = printedBack(design)
  if (back) {
    const publishedBack = published?.backs?.find((side) => side.id === back.id)
    inspectSide(
      back.objects ?? [],
      textsById(publishedBack?.objects),
      'back',
      issues
    )
  }
  return issues
}
