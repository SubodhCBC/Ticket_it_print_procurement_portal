import { fromStringList } from '../db/json-column'
import { toCsv, withBom } from '../utils/csv'
import type { FullProduct } from './products.service'

/**
 * The catalogue as a spreadsheet, and the spreadsheet the importer expects
 * (SOW M-13: "bulk import and export with template download").
 *
 * ---------------------------------------------------------------------------
 * One column list, three files
 * ---------------------------------------------------------------------------
 * The export, the blank template and `ImportRowSchema` have to agree, or the
 * headline feature — export, edit in Excel, import back — breaks in the least
 * visible way possible: a column the importer silently ignores. So the import
 * columns are declared once here, in the order the importer reads them, and both
 * files are built from that one list.
 *
 * A column added to `ImportRowSchema` belongs in `IMPORT_COLUMNS` in the same
 * change, and so does the import screen's own copy of the header line
 * (`src/app/admin/catalogue/products/import/page.tsx`) until that screen
 * downloads this template instead of carrying its own.
 *
 * ---------------------------------------------------------------------------
 * The read-only tail
 * ---------------------------------------------------------------------------
 * `status`, `visibility` and the two stock figures are exported because whoever
 * opens the file wants to see them, and they are *not* import columns: status is
 * an audited transition, visibility is its own endpoint, and stock moves through
 * adjustments so that every change has a reason. The importer ignores them by
 * name, and the import screen lists them as ignored.
 */

/** Editable, and read back by `ImportRowSchema` in this order. */
export const IMPORT_COLUMNS = [
  'sku',
  'name',
  'categoryCode',
  'basePrice',
  'moq',
  'orderMultiple',
  'packSize',
  'uom',
  'widthMm',
  'heightMm',
  'bleedMm',
  'safeMarginMm',
  'lowStockThreshold',
  'leadTimeDays',
  'tags',
  'description',
  // Last of the editable columns, so every column before it keeps its place.
  'taxTreatment',
] as const

/** Exported for information; ignored on the way back in. */
export const READ_ONLY_COLUMNS = [
  'status',
  'visibility',
  'stockOnHand',
  'stockReserved',
] as const

export const EXPORT_COLUMNS = [...IMPORT_COLUMNS, ...READ_ONLY_COLUMNS] as const

/**
 * The importer's own per-file maximum (`ImportProductsSchema`).
 *
 * The export is capped at the same number rather than at something larger, so
 * that every file this produces is a file the importer will accept. An export of
 * 12,000 rows that cannot be imported back is worse than being asked to filter.
 */
export const MAX_EXPORT_ROWS = 10_000

/** Empty for null: a cell reading "null" would import as the word. */
const text = (value: string | null | undefined): string => value ?? ''

const decimal = (value: { toFixed(digits: number): string } | null): string =>
  value == null ? '' : value.toFixed(2)

const number = (value: number | null): string =>
  value == null ? '' : String(value)

/**
 * One row per product, in `EXPORT_COLUMNS` order.
 *
 * `tags` uses the same `|` separator the importer splits on, so a round trip
 * neither loses a tag nor invents one — a comma would have been quoted here and
 * read back as a single tag containing commas.
 */
function toRow(product: FullProduct): string[] {
  return [
    product.sku,
    product.name,
    product.category.code,
    decimal(product.basePrice),
    number(product.moq),
    number(product.orderMultiple),
    number(product.packSize),
    product.uom,
    number(product.widthMm),
    number(product.heightMm),
    decimal(product.bleedMm),
    decimal(product.safeMarginMm),
    number(product.lowStockThreshold),
    number(product.leadTimeDays),
    fromStringList(product.tags).join('|'),
    text(product.description),
    product.taxTreatment,
    product.status,
    product.visibility,
    number(product.stockOnHand),
    number(product.stockReserved),
  ]
}

export function toProductCsv(products: readonly FullProduct[]): string {
  return withBom(toCsv([...EXPORT_COLUMNS], products.map(toRow)))
}

/**
 * The blank template, with two filled rows.
 *
 * Examples rather than an empty header alone, because the questions people
 * actually have are "what goes in uom", "how do I write two tags" and "does
 * price include the currency" — and one row answers all three. The second row
 * shows a pack product, an empty optional column and a description with a comma
 * in it, which is the cell most likely to be quoted wrongly by hand.
 */
export function importTemplateCsv(): string {
  const rows = [
    [
      'POS-BANNER-SUMMER',
      'Summer Campaign Tension Banner',
      'BANNERS',
      '165.00',
      '1',
      '1',
      '1',
      'EACH',
      '850',
      '2000',
      '3',
      '5',
      '0',
      '7',
      'campaign|outdoor',
      'Tension banner, printed both sides',
      'STANDARD',
    ],
    [
      'FLY-A5-100',
      'A5 Flyer (pack of 100)',
      'FLYERS',
      '42.50',
      '1',
      '1',
      '100',
      'PACK',
      '148',
      '210',
      '3',
      '4',
      '10',
      '5',
      '',
      'Gloss 150gsm',
      '',
    ],
  ]

  return withBom(toCsv([...IMPORT_COLUMNS], rows))
}
