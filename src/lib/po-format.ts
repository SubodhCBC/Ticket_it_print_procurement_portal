/**
 * Purchase-order formats (SOW F-14: "validated against a configurable format
 * rule"; AD-8: "PO format rule").
 *
 * Pure and dependency-free, because two very different places need exactly the
 * same answer: the server, which refuses a basket whose PO does not fit, and the
 * admin forms, which preview a format while it is typed. A rule the form accepts
 * and checkout then reads differently is worse than having no rule.
 *
 * ---------------------------------------------------------------------------
 * The grammar
 * ---------------------------------------------------------------------------
 *   #    a digit, 0–9
 *   @    a letter, A–Z (either case)
 *   *    a letter or a digit
 *   YY   two digits naming last year, this year or next year
 *
 * Everything else is a literal: letters, digits, `/`, `_` and `-`, compared
 * without regard to case — the same leniency the prefix check gives, because
 * finance systems disagree about shift keys. `YY` is a symbol only in capitals,
 * so a format can still contain a literal lower-case `yy`.
 *
 *   PO-####-YY     PO-1234-26
 *   @@/#####       AB/12345
 *   ACM-****       ACM-7Q2X
 *
 * Every symbol stands for a fixed number of characters, so a format has one
 * length and a reference is checked in a single left-to-right pass. There is no
 * regular expression built from admin input, and so nothing an admin can type
 * that makes checkout backtrack.
 */

export const PO_FORMAT_MIN_LENGTH = 3
export const PO_FORMAT_MAX_LENGTH = 64

/** For the admin forms: what each symbol means, in display order. */
export const PO_FORMAT_LEGEND: ReadonlyArray<{
  readonly symbol: string
  readonly meaning: string
}> = [
  { symbol: '#', meaning: 'a digit (0–9)' },
  { symbol: '@', meaning: 'a letter (A–Z)' },
  { symbol: '*', meaning: 'a letter or a digit' },
  { symbol: 'YY', meaning: 'last year, this year or next year, as two digits' },
]

/** The legend as one line of hint text, e.g. "# a digit (0–9) · @ a letter (A–Z) · …". */
export const PO_FORMAT_LEGEND_TEXT = PO_FORMAT_LEGEND.map(
  ({ symbol, meaning }) => `${symbol} ${meaning}`
).join(' · ')

export type PoFormatToken =
  | { readonly kind: 'LITERAL'; readonly char: string }
  | { readonly kind: 'DIGIT' }
  | { readonly kind: 'LETTER' }
  | { readonly kind: 'ALNUM' }
  | { readonly kind: 'YEAR' }

export type ParsedPoFormat =
  | {
      readonly ok: true
      readonly tokens: readonly PoFormatToken[]
      /** How many characters a matching reference has. */
      readonly length: number
    }
  | { readonly ok: false; readonly message: string }

export type PoFormatMismatch = 'LENGTH' | 'CHARACTER' | 'YEAR'

function isDigit(char: string): boolean {
  return char >= '0' && char <= '9'
}

function isLetter(char: string): boolean {
  return (char >= 'A' && char <= 'Z') || (char >= 'a' && char <= 'z')
}

function isLiteral(char: string): boolean {
  return (
    isDigit(char) ||
    isLetter(char) ||
    char === '/' ||
    char === '_' ||
    char === '-'
  )
}

/**
 * Reads a format, or says what is wrong with it in words an administrator can
 * act on.
 *
 * Three rules beyond the alphabet. It must contain at least one symbol — a
 * format with none is a fixed string, and a PO that can only ever be one value
 * is a configuration mistake. It must be 3–64 characters. And it must start
 * with something that produces a letter or digit, because every PO reference
 * does (see `PO_PATTERN` in the purchase-order rule): a format beginning with
 * `/` or `-` could never be satisfied.
 */
export function parsePoFormat(format: string): ParsedPoFormat {
  if (
    format.length < PO_FORMAT_MIN_LENGTH ||
    format.length > PO_FORMAT_MAX_LENGTH
  ) {
    return {
      ok: false,
      message: `A PO format must be ${PO_FORMAT_MIN_LENGTH}–${PO_FORMAT_MAX_LENGTH} characters.`,
    }
  }

  const tokens: PoFormatToken[] = []
  let length = 0

  for (let index = 0; index < format.length;) {
    const char = format[index]!

    if (char === 'Y' && format[index + 1] === 'Y') {
      tokens.push({ kind: 'YEAR' })
      length += 2
      index += 2
      continue
    }

    if (char === '#') tokens.push({ kind: 'DIGIT' })
    else if (char === '@') tokens.push({ kind: 'LETTER' })
    else if (char === '*') tokens.push({ kind: 'ALNUM' })
    else if (isLiteral(char)) tokens.push({ kind: 'LITERAL', char })
    else {
      return {
        ok: false,
        message:
          `"${char}" cannot be used in a PO format. Use letters, digits, / _ - ` +
          'and the symbols # @ * YY.',
      }
    }

    length += 1
    index += 1
  }

  if (!tokens.some((token) => token.kind !== 'LITERAL')) {
    return {
      ok: false,
      message:
        'A PO format needs at least one symbol (# @ * or YY); without one it only allows a single fixed reference.',
    }
  }

  const first = tokens[0]!
  if (
    first.kind === 'LITERAL' &&
    !isDigit(first.char) &&
    !isLetter(first.char)
  ) {
    return {
      ok: false,
      message: 'A PO format must start with a letter, a digit or a symbol.',
    }
  }

  return { ok: true, tokens, length }
}

/** The two-digit years `YY` accepts: last, this and next, in UTC. */
function acceptedYears(now: Date): readonly number[] {
  const year = now.getUTCFullYear() % 100
  return [(year + 99) % 100, year, (year + 1) % 100]
}

/**
 * Whether a reference fits a format: null when it does, otherwise why not.
 *
 * A stored format that no longer parses answers null. Formats are validated on
 * write, so this only happens if a bad value reached the column some other way
 * — and it must not then refuse every order the account places.
 */
export function matchPoFormat(
  reference: string,
  format: string,
  now: Date = new Date()
): PoFormatMismatch | null {
  const parsed = parsePoFormat(format)
  if (!parsed.ok) return null

  if (reference.length !== parsed.length) return 'LENGTH'

  let position = 0
  for (const token of parsed.tokens) {
    const char = reference[position]!

    switch (token.kind) {
      case 'LITERAL':
        if (char.toUpperCase() !== token.char.toUpperCase()) return 'CHARACTER'
        position += 1
        break
      case 'DIGIT':
        if (!isDigit(char)) return 'CHARACTER'
        position += 1
        break
      case 'LETTER':
        if (!isLetter(char)) return 'CHARACTER'
        position += 1
        break
      case 'ALNUM':
        if (!isDigit(char) && !isLetter(char)) return 'CHARACTER'
        position += 1
        break
      case 'YEAR': {
        const second = reference[position + 1]!
        if (!isDigit(char) || !isDigit(second)) return 'CHARACTER'
        const year = Number(char + second)
        if (!acceptedYears(now).includes(year)) return 'YEAR'
        position += 2
        break
      }
    }
  }

  return null
}

/**
 * A reference that fits, for messages and placeholders: `PO-####-YY` becomes
 * `PO-1234-26`. Null for a format that does not parse.
 */
export function examplePoReference(
  format: string,
  now: Date = new Date()
): string | null {
  const parsed = parsePoFormat(format)
  if (!parsed.ok) return null

  const digits = '1234567890'
  const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
  let nextDigit = 0
  let nextLetter = 0
  const year = String(now.getUTCFullYear() % 100).padStart(2, '0')

  return parsed.tokens
    .map((token) => {
      switch (token.kind) {
        case 'LITERAL':
          return token.char
        case 'DIGIT':
          return digits[nextDigit++ % digits.length]
        case 'LETTER':
          return letters[nextLetter++ % letters.length]
        case 'ALNUM':
          // Alternate, so a format of `****` shows both kinds are allowed.
          return (nextDigit + nextLetter) % 2 === 0
            ? letters[nextLetter++ % letters.length]
            : digits[nextDigit++ % digits.length]
        case 'YEAR':
          return year
      }
    })
    .join('')
}

/** What an admin form shows beside the field while a format is typed. */
export type PoFormatPreview =
  | { readonly ok: true; readonly example: string; readonly length: number }
  | { readonly ok: false; readonly message: string }

export function previewPoFormat(
  format: string,
  now: Date = new Date()
): PoFormatPreview {
  const parsed = parsePoFormat(format.trim())
  if (!parsed.ok) return parsed

  return {
    ok: true,
    example: examplePoReference(format.trim(), now) ?? '',
    length: parsed.length,
  }
}
