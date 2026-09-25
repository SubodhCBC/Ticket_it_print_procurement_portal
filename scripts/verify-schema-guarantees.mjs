/**
 * Checks the parts of the schema that Prisma does not know about.
 *
 * Run with `npm run verify:schema` after any migration, in every environment.
 *
 * ---------------------------------------------------------------------------
 * Why this is not paranoia
 * ---------------------------------------------------------------------------
 * Several things this database depends on cannot be expressed in
 * schema.prisma, so Prisma reads them as drift and will offer to remove them.
 * `migrate dev` does exactly that, and it does it quietly, in the same prompt as
 * a legitimate change:
 *
 *   * The filtered unique indexes. `@unique` on a nullable column means "one
 *     NULL only" on SQL Server. Lose the filter and the schema allows one user
 *     with no legacy counterpart, one draft invoice, one outstanding invitation
 *     -- the second of each fails on the unique index.
 *   * The UTC column defaults. `@default(now())` means GETDATE() to Prisma,
 *     which records the server's local wall clock and labels it +00:00. On a
 *     non-UTC server every defaulted timestamp is wrong by the offset.
 *   * The Row-Level Security policy. Tenant isolation at the database level is
 *     entirely this, and losing it fails no test that runs as a single tenant.
 *   * The CHECK constraints standing in for enums, the ISJSON constraints
 *     standing in for jsonb, the order-number sequence and procedure, and the
 *     trigger that stops two rate cards being live for one customer at once.
 *
 * Every one of those fails silently. The application keeps answering 200; it
 * just answers wrongly, or accepts data it should have refused. So the check is
 * counts and definitions, not behaviour -- behaviour is what the other scripts
 * cover, and behaviour is exactly what would not notice.
 */
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

let pass = 0
let fail = 0

function check(label, actual, expected, note = '') {
  const ok = JSON.stringify(actual) === JSON.stringify(expected)
  if (ok) pass++
  else fail++
  console.log(
    `${ok ? 'PASS' : 'FAIL'}  ${label.padEnd(52)} ` +
      `got ${JSON.stringify(actual)}, want ${JSON.stringify(expected)} ${note}`
  )
}

/** Returns the single number a one-column, one-row query produced. */
async function count(sql) {
  const [row] = await prisma.$queryRawUnsafe(sql)
  return Number(Object.values(row)[0])
}

try {
  console.log('--- tenant isolation ---')
  check(
    'row-level security policies',
    await count(
      `SELECT COUNT(*) FROM sys.security_policies WHERE is_enabled = 1`
    ),
    1
  )
  // 23 from the port, plus the five tenant-owned shipping tables added by
  // 20260911090000 (cart_shipping_selections, order_shipping, shipments,
  // shipment_parcels, shipment_tracking_events), plus
  // category_account_visibility from 20260916120000, plus invoice_line_items
  // from 20260917180000. pickup_bookings, integration_calls and
  // reconciliation_runs are
  // platform data and deliberately uncovered.
  check(
    '  tables covered',
    await count(
      `SELECT COUNT(DISTINCT target_object_id) FROM sys.security_predicates`
    ),
    30
  )
  check(
    '  filter predicates (hide other tenants on read)',
    await count(
      `SELECT COUNT(*) FROM sys.security_predicates WHERE predicate_type_desc = 'FILTER'`
    ),
    30
  )
  check(
    '  block predicates (refuse writes into another tenant)',
    await count(
      `SELECT COUNT(*) FROM sys.security_predicates WHERE predicate_type_desc = 'BLOCK'`
    ),
    60
  )
  check(
    '  predicate functions',
    await count(
      `SELECT COUNT(*) FROM sys.objects WHERE name LIKE 'rls[_]%' AND type IN ('IF','FN')`
    ),
    8
  )

  console.log('\n--- unique indexes over nullable columns ---')
  // Eleven constraints whose meaning changes without the filter: ten from the
  // port and shipments.consignmentId. Counted by has_filter rather than by name,
  // so a rename does not hide a loss.
  check(
    'filtered unique indexes',
    await count(`
    SELECT COUNT(*) FROM sys.indexes
    WHERE is_unique = 1 AND has_filter = 1 AND object_id IN (
      OBJECT_ID('dbo.sites'), OBJECT_ID('dbo.users'), OBJECT_ID('dbo.invitations'),
      OBJECT_ID('dbo.refresh_tokens'), OBJECT_ID('dbo.orders'), OBJECT_ID('dbo.invoices'),
      OBJECT_ID('dbo.templates'), OBJECT_ID('dbo.user_permission_grants'),
      OBJECT_ID('dbo.shipments'))`),
    11
  )

  console.log('\n--- timestamps ---')
  check(
    'columns still defaulting to local time',
    await count(`
    SELECT COUNT(*) FROM sys.default_constraints d
    JOIN sys.objects o ON o.object_id = d.parent_object_id
    JOIN sys.columns c ON c.object_id = d.parent_object_id AND c.column_id = d.parent_column_id
    JOIN sys.types t ON t.user_type_id = c.user_type_id
    WHERE t.name = 'datetimeoffset' AND d.definition LIKE '%getdate%'
      AND o.name <> '_prisma_migrations'`),
    0
  )
  check(
    '  defaulting to UTC instead',
    await count(`
    SELECT COUNT(*) FROM sys.default_constraints d
    JOIN sys.columns c ON c.object_id = d.parent_object_id AND c.column_id = d.parent_column_id
    JOIN sys.types t ON t.user_type_id = c.user_type_id
    WHERE t.name = 'datetimeoffset' AND d.definition LIKE '%sysutcdatetime%'`),
    // 42, plus category_account_visibility.createdAt from 20260916120000, plus
    // invoice_line_items.createdAt, integration_calls.occurredAt and
    // reconciliation_runs.startedAt from 20260917180000.
    46
  )

  console.log(
    '\n--- constraints standing in for types Prisma cannot express ---'
  )
  // 42 from the port and the template migrations, plus carts_shippingMethod_enum
  // and orders_shippingMethod_enum from 20260911000000, plus six from the
  // shipping tables: two delivery kinds, two quote sources, shipment and pickup
  // status; plus product_categories_visibility_enum from 20260916120000; plus
  // nine from 20260917180000: tax treatment on products, order lines and
  // invoice items, an invoice item's kind, the ordering role, and the mode,
  // outcome and kind of integration calls and reconciliation runs.
  check(
    'enum value checks',
    await count(
      `SELECT COUNT(*) FROM sys.check_constraints WHERE name LIKE '%[_]enum'`
    ),
    60
  )
  // 11, plus product_options_valuePrices_is_json and
  // order_line_items_options_is_json from 20260911000000, plus the three JSON
  // columns on each of the two delivery-choice tables and the label request
  // stored on a shipment, plus orders_billingSnapshot_is_json from
  // 20260916180000 and invoice_lines_billingSnapshot_is_json from
  // 20260916190000, plus the before and after values on every audit entry from
  // 20260917120000, plus invoice_lines_shippingSnapshot_is_json from
  // 20260917180000.
  check(
    'ISJSON checks',
    await count(
      `SELECT COUNT(*) FROM sys.check_constraints WHERE name LIKE '%[_]is[_]json'`
    ),
    25
  )
  // 36 from the port, plus templates_owner_matches_visibility, which pins the
  // rule that a customer-owned template names its owner and an operator-owned
  // one does not; plus templates_price_pair and templates_price_non_negative,
  // which pin that a design's price and its pack size move together and that
  // neither is nonsense; plus orders_shippingCost_non_negative, which keeps a
  // delivery charge from being a refund; plus five from shipping: the two
  // freight quotes are never negative, a voided shipment says when, a labelled
  // one has both a consignment and a PDF, and a parcel has a weight and a size;
  // plus three from 20260917180000: the GST rate is a percentage, and invoice
  // items and integration calls carry no negative figures.
  check(
    'business-rule checks',
    await count(`
    SELECT COUNT(*) FROM sys.check_constraints
    WHERE name NOT LIKE '%[_]enum' AND name NOT LIKE '%[_]is[_]json'`),
    48
  )

  console.log('\n--- columns that hold whole documents ---')
  // A design is not a string with a length. `canvasJson` was left NVARCHAR(500)
  // by the port -- every String column was given an explicit width and this one
  // kept Prisma's default -- which is smaller than fabric's serialisation of an
  // empty artboard. Every save and every publish from the builder failed with
  // P2000 while every check in this suite passed, because nothing here sent a
  // canvasJson until it did. max_length of -1 is what MAX reads as.
  check(
    'template document columns are MAX',
    await count(`
    SELECT COUNT(*) FROM sys.columns
    WHERE object_id = OBJECT_ID('dbo.templates')
      AND name IN ('canvasConfig', 'layers', 'design', 'canvasJson')
      AND max_length = -1`),
    4
  )
  check(
    '  and so is a version snapshot',
    await count(`
    SELECT COUNT(*) FROM sys.columns
    WHERE object_id = OBJECT_ID('dbo.template_versions')
      AND name = 'snapshot' AND max_length = -1`),
    1
  )

  console.log('\n--- numbering and the overlap rule ---')
  check(
    'order-number sequence',
    await count(
      `SELECT COUNT(*) FROM sys.sequences WHERE name = 'order_number_seq'`
    ),
    1
  )
  check(
    'order-number procedure',
    await count(
      `SELECT COUNT(*) FROM sys.procedures WHERE name = 'next_order_number'`
    ),
    1
  )
  check(
    'rate-card overlap trigger',
    await count(`
    SELECT COUNT(*) FROM sys.triggers
    WHERE name = 'rate_cards_no_overlapping_active' AND is_disabled = 0`),
    1
  )

  console.log('\n--- database settings ---')
  // Not schema, but the same kind of silent-if-wrong: the code assumes
  // PostgreSQL's non-blocking reads.
  check(
    'read-committed snapshot is on',
    await count(
      `SELECT CAST(is_read_committed_snapshot_on AS INT) FROM sys.databases WHERE name = DB_NAME()`
    ),
    1
  )
  check(
    'collation is case-insensitive',
    await count(
      `SELECT CASE WHEN CONVERT(varchar(128), DATABASEPROPERTYEX(DB_NAME(),'Collation')) LIKE '%[_]CI[_]%' THEN 1 ELSE 0 END`
    ),
    1
  )
} finally {
  await prisma.$disconnect()
}

console.log(`\n${pass} passed, ${fail} failed`)
if (fail > 0) {
  console.log(
    '\nA failure here usually means a migration was regenerated and Prisma removed\n' +
      'something it does not model. The migrations that own these are\n' +
      '20260907140000 (RLS), 20260907160000 (filtered indexes),\n' +
      '20260907150000 (constraints, sequence, trigger) and\n' +
      '20260908050000 (UTC defaults). Reapply the ones that dropped.'
  )
}
process.exit(fail === 0 ? 0 : 1)
