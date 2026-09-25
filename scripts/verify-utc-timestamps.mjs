/**
 * Proves the timestamp columns record UTC, whatever the server's clock says.
 *
 * Run with `npm run verify:utc` against a migrated database.
 *
 * ---------------------------------------------------------------------------
 * Why this needs a script rather than an eyeball
 * ---------------------------------------------------------------------------
 * The fault this guards is invisible on a UTC server, which every local
 * container is. Prisma renders `@default(now())` as `DEFAULT (getdate())`, and
 * GETDATE() returns local wall-clock time with no offset; assigning that to a
 * DATETIMEOFFSET column labels it +00:00. On a UTC box that is accidentally
 * right. On a server in Mumbai it is five and a half hours wrong, silently, and
 * every reader downstream believes it.
 *
 * So the check does not ask "is the value about right" -- on a UTC host it
 * always is. It asks the two questions that stay true anywhere:
 *
 *   1. does any DATETIMEOFFSET column still default to GETDATE()
 *   2. does a row inserted *through the default* land on the same instant as
 *      SYSUTCDATETIME(), rather than on the server's local wall clock
 *
 * `migrate dev` reads the UTC defaults as drift and offers to put GETDATE()
 * back, so question one is not answered once and for all.
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
    `${ok ? 'PASS' : 'FAIL'}  ${label}  ` +
      `(got ${JSON.stringify(actual)}, want ${JSON.stringify(expected)}) ${note}`
  )
}

try {
  // --- 1. no column still defaults to local time ---------------------------
  const [{ stale }] = await prisma.$queryRaw`
    SELECT COUNT(*) AS stale
    FROM sys.default_constraints d
    JOIN sys.objects o ON o.object_id = d.parent_object_id
    JOIN sys.columns c
      ON c.object_id = d.parent_object_id AND c.column_id = d.parent_column_id
    JOIN sys.types t ON t.user_type_id = c.user_type_id
    WHERE t.name = 'datetimeoffset'
      AND d.definition LIKE '%getdate%'
      AND o.name <> '_prisma_migrations'`
  check('no timestamp column defaults to local time', Number(stale), 0)

  const [{ utc }] = await prisma.$queryRaw`
    SELECT COUNT(*) AS utc
    FROM sys.default_constraints d
    JOIN sys.columns c
      ON c.object_id = d.parent_object_id AND c.column_id = d.parent_column_id
    JOIN sys.types t ON t.user_type_id = c.user_type_id
    WHERE t.name = 'datetimeoffset'
      AND d.definition LIKE '%sysutcdatetime%'`
  check(
    'and they default to UTC instead',
    Number(utc) > 0,
    true,
    `${utc} column(s)`
  )

  // --- 2. a row written through the default lands on the true instant ------
  // Inserted with raw SQL on purpose: Prisma sends createdAt itself, so an
  // ordinary create would exercise the client rather than the column default,
  // which is the thing under test.
  const id = 'cat_utccheck'
  await prisma.$executeRaw`DELETE FROM product_categories WHERE id = ${id}`
  await prisma.$executeRaw`
    INSERT INTO product_categories (id, code, name, sortOrder, status, updatedAt)
    VALUES (${id}, 'UTCCHECK', 'UTC check', 0, 'ACTIVE', SYSUTCDATETIME())`

  const [row] = await prisma.$queryRaw`
    SELECT
      DATEDIFF(SECOND, createdAt, SYSUTCDATETIME()) AS driftSeconds,
      DATEPART(TZOFFSET, createdAt)                 AS offsetMinutes,
      DATEPART(TZOFFSET, SYSDATETIMEOFFSET())       AS serverOffsetMinutes
    FROM product_categories WHERE id = ${id}`

  check(
    'a defaulted timestamp is the true instant',
    Math.abs(Number(row.driftSeconds)) <= 2,
    true,
    `${row.driftSeconds}s from SYSUTCDATETIME()`
  )
  check('  and is stored at +00:00', Number(row.offsetMinutes), 0)

  if (Number(row.serverOffsetMinutes) === 0) {
    console.log(
      '      note: this server is on UTC, so the drift check cannot fail here. ' +
        'The default definition is what actually protects a non-UTC server, ' +
        'which is why the first two checks exist.'
    )
  }

  await prisma.$executeRaw`DELETE FROM product_categories WHERE id = ${id}`
} finally {
  await prisma.$disconnect()
}

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail === 0 ? 0 : 1)
