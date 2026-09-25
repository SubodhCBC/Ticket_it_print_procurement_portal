/**
 * Runs every verification against one environment, and says what a failure
 * means.
 *
 *   npm run verify                                    # local `next start`
 *   BASE_URL=https://portal.example.com npm run verify
 *
 * ---------------------------------------------------------------------------
 * The order matters
 * ---------------------------------------------------------------------------
 * Schema first, because everything below it is built on guarantees the schema
 * carries — a missing security policy makes the isolation check meaningless
 * rather than merely failing, and a reverted filtered index makes the order flow
 * fail somewhere confusing. Then isolation and timestamps, which need only the
 * database. Then the three that need the application answering.
 *
 * ---------------------------------------------------------------------------
 * Why this lifts the branch budget
 * ---------------------------------------------------------------------------
 * The last three checks place real orders, and the order-flow check dispatches
 * its own. A dispatched order is committed spend and counts against the
 * branch's monthly cap for the rest of the month, so against a long-lived
 * database the suite eventually cannot place an order at all — and reports a
 * failure that is really the budget rule doing its job.
 *
 * Lifting it here rather than inside one of the checks is deliberate: it is a
 * property of running the suite, not of any single check, and one place to undo
 * is one place to get wrong. It is restored even when a check fails or the run
 * is interrupted.
 *
 * The suite also spends nine login attempts, against a bucket that allows ten
 * in production. Raise RATE_LIMIT_AUTH_MAX wherever this is expected to run;
 * the checks say so themselves when they are refused.
 */
import { spawnSync } from 'node:child_process'

const needsHttp = { http: true }
/** Imports TypeScript source directly, so it runs under tsx rather than plain node. */
const needsTsx = { tsx: true }
const CHECKS = [
  // First: it needs nothing — no database, no server — so a red here is a bug
  // in the rule itself, and it fails in a second rather than after the slow ones.
  [
    'PO format validator',
    'verify-po-format.mjs',
    needsTsx,
    'The purchase-order format rule (SOW F-14, QA-01) accepts or refuses the wrong references.',
  ],
  [
    'schema guarantees',
    'verify-schema-guarantees.mjs',
    {},
    'A migration was regenerated and Prisma dropped something it does not model.',
  ],
  [
    'tenant isolation',
    'verify-tenant-isolation.mjs',
    {},
    'Row-Level Security is not doing its job. Stop and read the output — this is the one that leaks data.',
  ],
  [
    'UTC timestamps',
    'verify-utc-timestamps.mjs',
    {},
    'Timestamp defaults record the server clock rather than UTC.',
  ],
  [
    'order flow',
    'verify-order-flow.mjs',
    needsHttp,
    'Cart, checkout, ordering, fulfilment, billing or templates.',
  ],
  [
    'worker',
    'verify-worker.mjs',
    needsHttp,
    'Bulk import, image derivatives or mail. Is the worker process running, and can it reach Redis?',
  ],
  [
    'approvals and admin',
    'verify-approvals-admin.mjs',
    needsHttp,
    'Approval routing, or the administration endpoints.',
  ],
  // Last: it reads the orders, approvals and users the checks above leave, so
  // every report has rows in it rather than passing on an empty file.
  [
    'report exports',
    'verify-report-exports.mjs',
    needsHttp,
    'A tabular report lacks a CSV or XLSX export, an export is broken, or the dashboard PDF is (SOW §15).',
  ],
]

const baseUrl = process.env.BASE_URL ?? 'http://localhost:3100'
const api = `${baseUrl}/api/v1`

/**
 * Retries once on a connection error, which is not defensive padding.
 *
 * `spawnSync` blocks the event loop for the whole of a child check — tens of
 * seconds. Node keeps HTTP connections alive across that, the server closes the
 * idle one, and the next request goes out on a dead socket and comes back
 * ECONNRESET. That is what lost the budget restore, and with it the run summary,
 * the first few times this was run.
 */
async function call(method, path, { token, body } = {}, attempt = 0) {
  let res
  try {
    res = await fetch(api + path, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    })
  } catch (error) {
    if (attempt === 0) return call(method, path, { token, body }, 1)
    throw error
  }

  const text = await res.text()
  try {
    return { status: res.status, json: text ? JSON.parse(text) : null }
  } catch {
    return { status: res.status, json: null }
  }
}

/** Lifts every branch's monthly cap, and hands back a function that puts them back. */
async function lend() {
  const login = await call('POST', '/auth/login', {
    body: { login: 'dev.admin', password: 'Password123!' },
  })
  if (login.status !== 200) {
    console.log(
      `could not sign in to lift the branch budgets (${login.status}); ` +
        'continuing, but an order may be refused for want of budget rather than a fault\n'
    )
    return async () => {}
  }

  const token = login.json.accessToken
  const sites = (await call('GET', '/sites', { token })).json?.items ?? []
  const capped = sites.filter((s) => s.monthlyBudget != null)

  for (const site of capped) {
    await call('PATCH', `/sites/${site.id}`, {
      token,
      body: { monthlyBudget: null },
    })
  }
  if (capped.length > 0) {
    console.log(
      `branch budgets lifted for this run: ${capped.map((s) => s.code).join(', ')}`
    )
  }

  return async () => {
    for (const site of capped) {
      await call('PATCH', `/sites/${site.id}`, {
        token,
        body: { monthlyBudget: site.monthlyBudget },
      })
    }
    if (capped.length > 0) console.log('branch budgets restored')
  }
}

console.log(
  `database : ${(process.env.DATABASE_URL ?? '(unset)').replace(/password=[^;]*/i, 'password=***')}`
)
console.log(`base url : ${baseUrl}\n`)

const restore = await lend()
const failed = []

try {
  for (const [label, file, opts, meaning] of CHECKS) {
    process.stdout.write(`── ${label} `.padEnd(60, '─') + '\n')

    const run = spawnSync(
      process.execPath,
      [...(opts.tsx ? ['--import', 'tsx'] : []), `scripts/${file}`],
      {
        stdio: 'inherit',
        env: { ...process.env, BASE_URL: baseUrl },
      }
    )

    if (run.status !== 0) failed.push([label, meaning, opts.http === true])
    console.log()
  }
} finally {
  // A cleanup that fails must not swallow the results. Reporting six passing
  // checks and a budget left lifted is far more useful than a stack trace and
  // no summary at all, which is what this did before.
  try {
    await restore()
  } catch (error) {
    console.log(
      `
could not restore the branch budgets: ${error instanceof Error ? error.message : String(error)}`
    )
    console.log(
      'put them back by hand, or the next run will report false failures.'
    )
  }
}

console.log('═'.repeat(60))
if (failed.length === 0) {
  console.log('all checks passed')
  process.exit(0)
}

console.log(`${failed.length} check(s) failed:\n`)
for (const [label, meaning, http] of failed) {
  console.log(`  ${label}`)
  console.log(`    ${meaning}`)
  if (http) console.log(`    Needs the application answering at ${baseUrl}.`)
}
process.exit(1)
