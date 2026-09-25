/**
 * CSV writing, in one place.
 *
 * Every export in this system is opened in a spreadsheet by someone with access
 * to something worth stealing — a ledger, a price list, a catalogue. So the two
 * rules below are not formatting preferences, and they had drifted into three
 * copies (the invoice export, the report exports, and now the product export)
 * before this file existed.
 */

/**
 * Quotes a cell, and defuses it.
 *
 * A leading `=`, `+`, `-` or `@` is a formula prefix Excel executes on open, and
 * most of what goes through here is free text somebody typed: a product name, a
 * purchase-order reference, a branch name. The apostrophe makes Excel read it as
 * text; tab and carriage return are included because Excel treats them as
 * formula starters too.
 *
 * Quoting is RFC 4180: wrap when the value contains a quote, a comma or a line
 * break, and double any quote inside.
 */
export function csvCell(value: string): string {
  const guarded = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value
  return /[",\r\n]/.test(guarded) ? `"${guarded.replace(/"/g, '""')}"` : guarded
}

/** A header and its rows as CSV text, CRLF-separated. No BOM — see `withBom`. */
export function toCsv(
  header: readonly string[],
  rows: readonly (readonly string[])[]
): string {
  return [header, ...rows].map((row) => row.map(csvCell).join(',')).join('\r\n')
}

/**
 * The UTF-8 byte-order mark.
 *
 * Excel on Windows reads a CSV without one as the system code page, which turns
 * every accented character in a product name into mojibake — and these files are
 * meant to be edited and imported back.
 */
export const UTF8_BOM = '﻿'

/** CSV text ready to serve as a file. */
export function withBom(csv: string): string {
  return `${UTF8_BOM}${csv}`
}
