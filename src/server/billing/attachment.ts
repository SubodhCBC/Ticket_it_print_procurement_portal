/**
 * The download filename for an invoice export.
 *
 * Falls back to the period for a draft, which has no number yet — and strips
 * everything but the safe characters, so nothing a user typed can reach the
 * header and split it.
 */
export function attachmentHeader(
  invoiceNumber: string | null,
  period: string,
  extension: string
): string {
  const name = (invoiceNumber ?? `draft-${period}`).replace(
    /[^A-Za-z0-9._-]/g,
    ''
  )
  return `attachment; filename="${name}.${extension}"`
}
