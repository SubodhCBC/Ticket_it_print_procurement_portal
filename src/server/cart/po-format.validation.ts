import { z } from 'zod'
import { parsePoFormat, PO_FORMAT_MAX_LENGTH } from '@/lib/po-format'

/**
 * A PO format as an account, site or settings form sends it (SOW F-14, AD-8).
 *
 * Trimmed; blank means "no format" and is stored as null, so clearing the field
 * clears the rule rather than saving an empty string. Anything else has to parse,
 * and the refusal carries the parser's own message — the same sentence the admin
 * form's live preview shows, so the two cannot disagree about why.
 *
 * Nullish, so an update that omits it leaves the stored format alone and one
 * that sends null removes it.
 */
export const PoFormatField = z
  .string()
  .trim()
  .max(PO_FORMAT_MAX_LENGTH)
  .transform((value, ctx) => {
    if (value === '') return null

    const parsed = parsePoFormat(value)
    if (!parsed.ok) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: parsed.message })
      return z.NEVER
    }
    return value
  })
  .nullish()
