/**
 * Which SKU an image file is for, read off its name.
 *
 * A photographer's folder is named by stock code, and one product usually has
 * several shots: `BC-001.jpg`, `BC-001_2.jpg`, `BC-001-back.png`,
 * `BC-001 (1).jpg`. So the name is tried whole first, then with its trailing
 * segments cut off one at a time, and the longest one that is a real SKU wins.
 *
 * Longest-first matters because SKUs contain the same separators the suffixes
 * use. `BC-001-A.jpg` must land on `BC-001-A` when that product exists, and only
 * fall back to `BC-001` when it does not.
 *
 * Pure, so it can be tested without a database: this returns the candidates and
 * the service decides which of them exist.
 */

/** The same shape `Sku` in product.validation.ts accepts, before upper-casing. */
const SKU_SHAPE = /^[A-Za-z0-9][A-Za-z0-9._/-]*$/

/** Where a trailing variant suffix may start. */
const SEPARATORS = new Set(['_', '-', '.', ' '])

/**
 * How many trailing segments may be cut. Three covers `SKU_front_hi-res`; more
 * than that and a short prefix of an unrelated SKU starts to look like a match.
 */
const MAX_SEGMENTS_CUT = 3

export interface SkuCandidate {
  /** Upper-cased, as SKUs are stored. */
  readonly sku: string
  /** What was cut off the end to get here; empty for the whole name. */
  readonly suffix: string
}

/** The file name without folders or its final extension. */
export function filenameStem(filename: string): string {
  const base = filename.split(/[\\/]/).pop() ?? filename
  const dot = base.lastIndexOf('.')
  const stem = dot > 0 ? base.slice(0, dot) : base
  // A browser's "(1)" on a re-downloaded file is never part of a stock code.
  return stem.replace(/\s*\(\d+\)$/, '').trim()
}

/** Candidate SKUs for a file name, longest first, without duplicates. */
export function skuCandidates(filename: string): SkuCandidate[] {
  const stem = filenameStem(filename)
  const candidates: SkuCandidate[] = []
  const seen = new Set<string>()

  const push = (value: string) => {
    const trimmed = value.trim()
    if (trimmed.length < 2 || !SKU_SHAPE.test(trimmed)) return
    const sku = trimmed.toUpperCase()
    if (seen.has(sku)) return
    seen.add(sku)
    candidates.push({ sku, suffix: stem.slice(trimmed.length) })
  }

  push(stem)

  let rest = stem
  for (let cut = 0; cut < MAX_SEGMENTS_CUT; cut++) {
    let index = rest.length - 1
    while (index > 0 && !SEPARATORS.has(rest[index])) index--
    if (index <= 0) break
    rest = rest.slice(0, index)
    push(rest)
  }

  return candidates
}
