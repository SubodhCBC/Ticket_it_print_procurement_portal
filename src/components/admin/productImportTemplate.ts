// src/components/admin/productImportTemplate.ts

/**
 * The bulk product import file, as the importer reads it (SOW M-13).
 *
 * One list of columns, in one order, for everything that writes that file: the
 * downloadable template, the "Insert example" button on the import page, and
 * the catalogue export — which puts these columns first, in this order, so an
 * exported file can be edited and imported straight back.
 *
 * Mirrors `ImportRowSchema` in `src/server/catalog/product.validation.ts`. The
 * server serves the same template from `GET /catalog/products/import/template`;
 * this copy is the fallback while that endpoint is not deployed.
 */
export const IMPORT_TEMPLATE_COLUMNS = [
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
  // Last, as on the server, so every column before it keeps its place.
  'taxTreatment',
] as const

/** Two rows showing a typical product and a pack, one of them with every field. */
const EXAMPLE_ROWS: readonly (readonly string[])[] = [
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

/** RFC 4180: quoted only when it has to be, with quotes doubled. */
function csvCell(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value
}

/** The template: the header row and the example rows. */
export const IMPORT_TEMPLATE_CSV = [IMPORT_TEMPLATE_COLUMNS, ...EXAMPLE_ROWS]
  .map((row) => row.map(csvCell).join(','))
  .join('\n')

export const IMPORT_TEMPLATE_FILENAME = 'product-import-template.csv'
