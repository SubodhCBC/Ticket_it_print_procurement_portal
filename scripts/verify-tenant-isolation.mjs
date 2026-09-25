/**
 * Proves that tenant isolation actually holds at the database level.
 *
 * Run with `npm run verify:isolation` against a migrated database.
 *
 * ---------------------------------------------------------------------------
 * Why this is a script in the repository and not a note in a wiki
 * ---------------------------------------------------------------------------
 * Row-Level Security is the kind of protection that fails silently. A broken
 * policy does not throw — queries keep succeeding and simply return the wrong
 * rows, which is indistinguishable from "that customer has no orders" until
 * somebody notices their data in someone else's export. Nothing else in the
 * test suite would catch it, because every other test runs as a single tenant
 * and would pass just as happily with the policies dropped.
 *
 * The fourth check is the one that earns this file's keep. SESSION_CONTEXT is
 * scoped to the *connection*, not the transaction, so unlike PostgreSQL's
 * `SET LOCAL` it survives commit and rollback. If withTenantScope stops
 * clearing it, a connection returned to the pool carries one request's tenant
 * into the next — and the queries that suffer are the unscoped ones: login,
 * user provisioning, the cross-tenant account list. Removing the clear makes
 * checks 4 and 5 fail and the rest still pass, which is exactly why they are
 * written separately.
 *
 * `connectionLimit=1` is not a detail. With a larger pool the second query
 * usually lands on a different connection and the leak hides.
 */
import { PrismaClient } from '@prisma/client'

const configured = process.env.DATABASE_URL
if (!configured) {
  console.error('DATABASE_URL is not set.')
  process.exit(1)
}

const url = configured.replace(/;+$/, '') + ';connectionLimit=1;poolTimeout=10'
const prisma = new PrismaClient({ datasources: { db: { url } } })

const KEY = 'app.current_account_id'
const TX_KEY = 'app.current_tx'

/** Sets the tenant bound to the current transaction, as withTenantScope does. */
const SET_TENANT = `DECLARE @tx BIGINT = CURRENT_TRANSACTION_ID();
  EXEC sp_set_session_context @key = N'${TX_KEY}', @value = @tx;
  EXEC sp_set_session_context @key = N'${KEY}', @value = @P1;`

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

/** The same shape as withTenantScope in src/server/db/client.ts. */
async function scoped(accountId, fn, options) {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(SET_TENANT, accountId)
    try {
      return await fn(tx)
    } finally {
      try {
        await tx.$executeRawUnsafe(
          `EXEC sp_set_session_context @key = N'${KEY}', @value = NULL;
           EXEC sp_set_session_context @key = N'${TX_KEY}', @value = NULL;`
        )
      } catch {
        // A timed-out transaction refuses this, which is the case under test.
      }
    }
  }, options)
}

const fixture = (suffix) => ({
  id: `acc_isolationcheck_${suffix}`,
  slug: `isolation-check-${suffix}`,
  accountCode: `ISOCHECK${suffix.toUpperCase()}`,
  name: `Isolation check ${suffix}`,
})

const A = fixture('a').id
const B = fixture('b').id
const CATEGORY = 'cat_isolationcheck_restricted'

try {
  // Written with no scope open, which is the unrestricted path — the same one
  // migrations, seeds and the login lookup use.
  for (const suffix of ['a', 'b']) {
    const data = fixture(suffix)
    await prisma.account.upsert({
      where: { id: data.id },
      create: data,
      update: {},
    })
  }

  const both = await prisma.account.findMany({
    where: { id: { in: [A, B] } },
    select: { id: true },
  })
  check('unscoped, both accounts are visible', both.length, 2)

  const visible = await scoped(A, (tx) =>
    tx.account.findMany({ where: { id: { in: [A, B] } }, select: { id: true } })
  )
  check(
    'scoped to A, only A is visible',
    visible.map((r) => r.id),
    [A]
  )

  // The BLOCK predicate. A filter alone would hide other tenants' rows on read
  // while still letting a write land in one of them, which is the more damaging
  // direction.
  let refused = false
  try {
    await scoped(A, (tx) =>
      tx.site.create({
        data: {
          id: 'sit_isolationcheck',
          accountId: B,
          code: 'ISOCHECK',
          name: 'Should never exist',
        },
      })
    )
  } catch {
    refused = true
  }
  check('scoped to A, a write owned by B is refused', refused, true)

  const orphan = await prisma.site.findMany({
    where: { id: 'sit_isolationcheck' },
  })
  check('  and no row was written', orphan.length, 0)

  // --- a restricted category's allow-list ------------------------------------
  // Migration 20260916120000 added category_account_visibility to the policy.
  // The rows say which customers hold a contract category, so one tenant must
  // neither read nor write another's — the same guarantee
  // product_account_visibility has had since the port.
  await prisma.productCategory.upsert({
    where: { id: CATEGORY },
    create: {
      id: CATEGORY,
      code: 'ISOCHECK-RESTRICTED',
      name: 'Isolation check restricted category',
      visibility: 'RESTRICTED',
    },
    update: {},
  })
  for (const accountId of [A, B]) {
    await prisma.categoryAccountVisibility.upsert({
      where: { categoryId_accountId: { categoryId: CATEGORY, accountId } },
      create: {
        id: `cav_isolationcheck_${accountId}`,
        categoryId: CATEGORY,
        accountId,
      },
      update: {},
    })
  }

  const grantedToA = await scoped(A, (tx) =>
    tx.categoryAccountVisibility.findMany({
      where: { categoryId: CATEGORY },
      select: { accountId: true },
    })
  )
  check(
    "scoped to A, a restricted category's allow-list shows only A",
    grantedToA.map((row) => row.accountId),
    [A]
  )

  let grantRefused = false
  try {
    await scoped(A, (tx) =>
      tx.categoryAccountVisibility.update({
        where: { categoryId_accountId: { categoryId: CATEGORY, accountId: A } },
        data: { accountId: B },
      })
    )
  } catch {
    grantRefused = true
  }
  check('  and A cannot move its grant onto B', grantRefused, true)

  // --- the leak ------------------------------------------------------------
  await scoped(A, (tx) => tx.account.findMany({ select: { id: true } }))
  const afterScope = await prisma.account.findMany({
    where: { id: { in: [A, B] } },
    select: { id: true },
  })
  check(
    'the connection is unscoped again once a scope closes',
    afterScope.length,
    2,
    '← the pooled-connection leak'
  )

  try {
    await scoped(A, async () => {
      throw new Error('deliberate failure inside a tenant scope')
    })
  } catch {
    // expected
  }
  const afterThrow = await prisma.account.findMany({
    where: { id: { in: [A, B] } },
    select: { id: true },
  })
  check('and also after a scope that threw', afterThrow.length, 2)

  // --- a tenant left behind -------------------------------------------------
  // The clear above can fail: a transaction that has timed out refuses every
  // statement, the reset included. Migration 20260911100000 binds the tenant to
  // the transaction that set it, so what is left behind must be inert. Both
  // checks run on the single pooled connection, which is the one that carries
  // the leftover value.
  await prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(SET_TENANT, A)
    // Deliberately not cleared.
  })
  const afterUncleared = await prisma.account.findMany({
    where: { id: { in: [A, B] } },
    select: { id: true },
  })
  check(
    'a tenant never cleared by its transaction is ignored afterwards',
    afterUncleared.length,
    2,
    '← SESSION_CONTEXT outlives the transaction'
  )

  let timedOut = false
  try {
    await scoped(
      A,
      async (tx) => {
        await tx.$executeRawUnsafe(`WAITFOR DELAY '00:00:02'`)
      },
      { timeout: 500 }
    )
  } catch {
    timedOut = true
  }
  const afterTimeout = await prisma.account.findMany({
    where: { id: { in: [A, B] } },
    select: { id: true },
  })
  check('a scope that times out', timedOut, true)
  check(
    '  leaves nothing that filters the next query',
    afterTimeout.length,
    2,
    '← the 2026-09-11 order-placement incident'
  )
} finally {
  await prisma.site.deleteMany({ where: { id: 'sit_isolationcheck' } })
  // Before the accounts: the allow-list rows reference them.
  await prisma.categoryAccountVisibility.deleteMany({
    where: { categoryId: CATEGORY },
  })
  await prisma.productCategory.deleteMany({ where: { id: CATEGORY } })
  await prisma.account.deleteMany({ where: { id: { in: [A, B] } } })
  await prisma.$disconnect()
}

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail === 0 ? 0 : 1)
