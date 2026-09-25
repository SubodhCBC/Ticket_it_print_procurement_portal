import { csvCell } from '../utils/csv'

/**
 * CSV for the exportable reports.
 *
 * The quoting and the formula guard come from `utils/csv`: they were copied into
 * this file and into the invoice export, which is two places for one rule to
 * stop matching itself.
 */
export function toCsv(
  header: readonly string[],
  rows: readonly (readonly string[])[]
): string {
  return [header, ...rows].map((row) => row.map(csvCell).join(',')).join('\r\n')
}
