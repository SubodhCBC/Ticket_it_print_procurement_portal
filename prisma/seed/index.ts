/**
 * Seed entrypoint.
 *
 * Seeds are split per domain and composed here, so that `npm run db:seed`
 * always produces a complete, demo-ready environment.
 *
 * Uses the application's own client rather than `new PrismaClient()` so it
 * reads the same validated configuration, the same .env and the same pool
 * settings as the running app.
 *
 * It runs with no tenant scope open, which is what lets it write across
 * accounts: the Row-Level Security predicates treat an unset session context as
 * unrestricted, exactly as the PostgreSQL policies treated the table owner.
 */
import { prisma } from '../../src/server/db/client'
import { seedDevCatalog } from './dev-catalog.seed'
import { seedDevPricing } from './dev-pricing.seed'
import { seedDevUsers } from './dev-users.seed'

async function main(): Promise<void> {
  await prisma.$queryRaw`SELECT 1`

  await seedDevUsers(prisma)
  // After the users: nothing in the catalogue is tenant-scoped, but the log
  // reads in the order someone would set the system up.
  await seedDevCatalog(prisma)
  // Last: a rate card prices products, so both have to exist first.
  await seedDevPricing(prisma)

  console.log('[seed] done')
}

main()
  .catch((error: unknown) => {
    console.error('[seed] failed', error)
    process.exitCode = 1
  })
  .finally(() => {
    void prisma.$disconnect()
  })
