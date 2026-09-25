/**
 * Measures what catalogue search costs, so the decision about it can be made
 * from numbers rather than from worry.
 *
 * Run with `npm run bench:search`. It seeds a throwaway catalogue, times the
 * query the catalogue endpoint actually issues, and deletes what it made.
 *
 * ---------------------------------------------------------------------------
 * Why this exists
 * ---------------------------------------------------------------------------
 * Under PostgreSQL, `name ILIKE '%term%'` was answered from a GIN trigram index.
 * SQL Server has no trigram operator class, and full-text search is not present
 * in the standard container image (`SERVERPROPERTY('IsFullTextInstalled')`
 * returns 0), so the same query is a scan.
 *
 * "It is a scan" is not by itself a verdict. What matters is how much it costs
 * at the size this catalogue will actually reach, and that turns out to depend
 * far more on how rare the search term is than on how many products there are:
 * a common term finds its 25 rows almost immediately, and a rare one reads most
 * of the table before it can stop.
 *
 * Re-run this when the catalogue grows. The numbers, not the architecture, are
 * what should decide whether to build a word index.
 */
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()
const N = Number(process.env.BENCH_ROWS ?? 50000)
const PREFIX = 'BENCHSEARCH-'

async function seed(categoryId) {
  await prisma.$executeRaw`DELETE FROM products WHERE sku LIKE ${PREFIX + '%'}`
  await prisma.$executeRawUnsafe(`
    WITH n AS (
      SELECT TOP (${N}) ROW_NUMBER() OVER (ORDER BY (SELECT NULL)) AS i
      FROM sys.all_objects a CROSS JOIN sys.all_objects b
    )
    INSERT INTO products (id, sku, name, categoryId, status, basePrice, moq,
                          orderMultiple, packSize, uom, trackInventory, stockOnHand,
                          stockReserved, lowStockThreshold, tags, visibility,
                          description, createdAt, updatedAt)
    SELECT 'prd_bench_' + RIGHT('0000000' + CAST(i AS varchar(7)), 7),
           '${PREFIX}' + RIGHT('0000000' + CAST(i AS varchar(7)), 7),
           CASE i % 5
             WHEN 0 THEN 'Corrugated Yard Sign '
             WHEN 1 THEN 'Roll-Up Banner Stand '
             WHEN 2 THEN 'Tri-Fold Brochure '
             WHEN 3 THEN 'Business Card Pack '
             ELSE          'Saddle-Stitched Catalogue '
           END + CAST(i AS varchar(7)),
           '${categoryId}', 'ACTIVE', 10.00, 1, 1, 1, 'EACH', 0, 0, 0, 0, '[]',
           'ALL_ACCOUNTS',
           -- Widened deliberately: a scan reads whole rows, so a narrow test row
           -- would flatter the result.
           REPLICATE('filler text to make the row realistically wide. ', 8),
           SYSUTCDATETIME(), SYSUTCDATETIME()
    FROM n`)
}

async function time(label, sql, runs = 5) {
  await prisma.$queryRawUnsafe(sql) // warm the plan and the cache
  const ms = []
  for (let i = 0; i < runs; i++) {
    const started = process.hrtime.bigint()
    await prisma.$queryRawUnsafe(sql)
    ms.push(Number(process.hrtime.bigint() - started) / 1e6)
  }
  ms.sort((a, b) => a - b)
  const median = ms[Math.floor(runs / 2)]
  console.log(
    `  ${label.padEnd(42)} median ${median.toFixed(1)}ms  ` +
      `(min ${ms[0].toFixed(1)}, max ${ms[runs - 1].toFixed(1)})`
  )
  return median
}

try {
  const category = await prisma.productCategory.findFirst({
    select: { id: true },
  })
  if (!category) {
    console.error(
      'No product category to hang the fixtures off. Seed the database first.'
    )
    process.exit(1)
  }

  console.log(`seeding ${N.toLocaleString()} products…`)
  const started = Date.now()
  await seed(category.id)
  console.log(
    `  ${(await prisma.product.count()).toLocaleString()} products, seeded in ${Date.now() - started}ms\n`
  )

  const where = `deletedAt IS NULL AND ("name" LIKE '%TERM%' OR sku LIKE '%TERM%')`
  const query = (term) =>
    `SELECT TOP 25 id FROM products WHERE ${where.replaceAll('TERM', term)}`

  console.log('the query the catalogue endpoint issues — infix, both columns:')
  // 20% of the fixtures are Banner rows, so 25 matches turn up almost at once.
  const common = await time("a common term ('Banner')", query('Banner'))
  // Matches a handful of SKUs, so the scan runs nearly to the end first.
  const rare = await time(`a rare term ('${PREFIX}004')`, query(PREFIX + '004'))

  console.log('\nfor comparison — prefix, which an index can seek:')
  await time(
    "prefix on name ('Roll-Up%')",
    `SELECT TOP 25 id FROM products WHERE deletedAt IS NULL AND "name" LIKE 'Roll-Up%'`
  )
  await time(
    `prefix on sku ('${PREFIX}004%')`,
    `SELECT TOP 25 id FROM products WHERE deletedAt IS NULL AND sku LIKE '${PREFIX}004%'`
  )

  console.log(
    `\nthe spread is ${(rare / common).toFixed(0)}x between a common and a rare term at ` +
      `${N.toLocaleString()} rows.\n` +
      'A rare term is the one that costs, because it reads most of the table\n' +
      'before it can fill 25 results — so the figure to watch as the catalogue\n' +
      'grows is the rare one, and it grows roughly linearly with row count.'
  )
} finally {
  await prisma.$executeRaw`DELETE FROM products WHERE sku LIKE ${PREFIX + '%'}`
  console.log(`\ncleaned up; ${await prisma.product.count()} products remain.`)
  await prisma.$disconnect()
}
