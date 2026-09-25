/**
 * Every tabular report exports as CSV and XLSX, and the executive dashboard as
 * PDF (SOW §15: "CSV and XLSX for every tabular report; PDF for the consolidated
 * billing summary and executive dashboards").
 *
 * Two halves.
 *
 * The first reads the source and needs nothing running: every table declared in
 * `src/server/reports/report-tables.ts` must have exactly one `.csv` and one
 * `.xlsx` route that uses it. A report added with only a CSV — the state this
 * whole area was in — fails here rather than in an acceptance test.
 *
 * The second calls every export route it found: the file type, the byte-order
 * mark on CSV, a real XLSX (a zip) and a real PDF, the rows matching the JSON
 * report, and the permissions that guard each.
 *
 *   BASE_URL=http://localhost:3000 node scripts/verify-report-exports.mjs
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'

const BASE_URL = process.env.BASE_URL ?? 'http://localhost:3100'
const B = `${BASE_URL}/api/v1`
const ROOT = new URL('..', import.meta.url).pathname.replace(
  /^\/([A-Za-z]:)/,
  '$1'
)
const REPORTS_DIR = join(ROOT, 'src', 'app', 'api', 'v1', 'reports')

let pass = 0
let fail = 0

/** The byte-order mark every CSV export starts with. */
const BOM = /^﻿/

function check(label, actual, expected, extra = '') {
  const ok = JSON.stringify(actual) === JSON.stringify(expected)
  if (ok) pass++
  else fail++
  console.log(
    `${ok ? 'PASS' : 'FAIL'}  ${label}  (got ${JSON.stringify(actual)}, want ${JSON.stringify(expected)}) ${extra}`
  )
  return ok
}

// --- 1. Every table has both routes -----------------------------------------

console.log('--- every report table has a CSV and an XLSX route ---')

const tablesSource = readFileSync(
  join(ROOT, 'src', 'server', 'reports', 'report-tables.ts'),
  'utf8'
)
const tables = [
  ...tablesSource.matchAll(/export const ([A-Z_]+):\s*ReportTable</g),
].map((match) => match[1])

function routeFiles(dir) {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry)
    if (statSync(path).isDirectory()) return routeFiles(path)
    return entry === 'route.ts' ? [path] : []
  })
}

const exportRoutes = routeFiles(REPORTS_DIR)
  .map((file) => {
    const folder = relative(REPORTS_DIR, file).split(sep).slice(0, -1).join('/')
    const format = folder.endsWith('.csv')
      ? 'csv'
      : folder.endsWith('.xlsx')
        ? 'xlsx'
        : null
    return { file, folder, format, source: readFileSync(file, 'utf8') }
  })
  .filter((route) => route.format)

for (const table of tables) {
  for (const format of ['csv', 'xlsx']) {
    const using = exportRoutes.filter(
      (route) =>
        route.format === format &&
        new RegExp(`\\b${table}\\b`).test(route.source)
    )
    check(`${table} has one .${format} route`, using.length, 1)
  }
}
check(
  'no export route renders a table that is not declared',
  exportRoutes.every((route) =>
    tables.some((t) => new RegExp(`\\b${t}\\b`).test(route.source))
  ),
  true
)

// --- 2. They work -----------------------------------------------------------

async function raw(path, token) {
  const res = await fetch(B + path, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  })
  const bytes = new Uint8Array(await res.arrayBuffer())
  return { res, bytes, status: res.status }
}

async function json(path, token) {
  const res = await fetch(B + path, {
    headers: { Authorization: `Bearer ${token}` },
  })
  return { status: res.status, body: await res.json().catch(() => null) }
}

async function login(who) {
  const res = await fetch(`${B}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ login: who, password: 'Password123!' }),
  })
  const body = await res.json().catch(() => null)
  if (!body?.accessToken) {
    console.error(`Could not sign in as ${who} — ${res.status}`)
    process.exit(1)
  }
  return body.accessToken
}

/** Enough CSV to count rows and read a header; quoted newlines are respected. */
function csvRows(text) {
  const rows = []
  let row = []
  let cell = ''
  let quoted = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        cell += '"'
        i++
      } else if (c === '"') quoted = false
      else cell += c
    } else if (c === '"') quoted = true
    else if (c === ',') {
      row.push(cell)
      cell = ''
    } else if (c === '\r' && text[i + 1] === '\n') {
      row.push(cell)
      rows.push(row)
      row = []
      cell = ''
      i++
    } else cell += c
  }
  row.push(cell)
  rows.push(row)
  return rows
}

const admin = await login('dev.admin')
const head = await login('dev.headoffice')
const site = await login('dev.siteuser')

// A year, so every report has something in it on a seeded database.
const to = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10)
const from = new Date(Date.now() - 365 * 86_400_000).toISOString().slice(0, 10)
const window = `from=${from}&to=${to}`

console.log('\n--- every export answers with the file it says ---')
for (const route of exportRoutes.sort((a, b) =>
  a.folder.localeCompare(b.folder)
)) {
  const path = `/reports/${route.folder}?${window}`
  const { res, bytes, status } = await raw(path, admin)
  const type = res.headers.get('content-type') ?? ''
  const disposition = res.headers.get('content-disposition') ?? ''

  if (
    !check(
      `${route.folder} answers`,
      status,
      200,
      status !== 200 ? new TextDecoder().decode(bytes).slice(0, 200) : ''
    )
  ) {
    continue
  }
  if (route.format === 'csv') {
    check(`  is CSV`, type, 'text/csv; charset=utf-8')
    check(
      `  starts with a BOM`,
      [bytes[0], bytes[1], bytes[2]],
      [0xef, 0xbb, 0xbf]
    )
  } else {
    check(
      `  is XLSX`,
      type,
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    )
    // An .xlsx is a zip; a JSON error body sent with the right header is not.
    check(`  is a zip`, String.fromCharCode(bytes[0], bytes[1]), 'PK')
  }
  check(
    `  names the file for download`,
    new RegExp(
      `^attachment; filename="[a-z-]+-\\d{4}-\\d{2}-\\d{2}(-to-\\d{4}-\\d{2}-\\d{2})?\\.${route.format}"$`
    ).test(disposition),
    true,
    disposition
  )
}

console.log("\n--- the rows are the JSON report's rows ---")
const pairs = [
  ['spend/by-site', (b) => b, `?${window}`],
  ['orders/by-status', (b) => b, `?${window}`],
  ['orders/ageing', (b) => b.orders, ''],
  ['approvals/activity', (b) => b.decisions, `?${window}`],
  ['users/access-review', (b) => b.users, ''],
]
for (const [path, rowsOf, query] of pairs) {
  const listed = await json(`/reports/${path}${query}`, admin)
  const file = await raw(`/reports/${path}.csv${query}`, admin)
  const lines = csvRows(new TextDecoder().decode(file.bytes).replace(BOM, ''))
  check(
    `${path}: CSV rows = JSON rows`,
    lines.length - 1,
    rowsOf(listed.body)?.length
  )
}

const history = await json(
  `/reports/orders/history?${window}&pageSize=1`,
  admin
)
const historyFile = await raw(`/reports/orders/history.csv?${window}`, admin)
check(
  'orders/history: the export carries every line, not a page',
  csvRows(new TextDecoder().decode(historyFile.bytes).replace(BOM, '')).length -
    1,
  history.body?.total
)

const bySite = csvRows(
  new TextDecoder()
    .decode((await raw(`/reports/spend/by-site.csv?${window}`, admin)).bytes)
    .replace(BOM, '')
)
check('the CSV that existed before keeps its headers', bySite[0], [
  'Branch code',
  'Branch',
  'Orders',
  'Spend',
  'Share %',
])

console.log('\n--- the permissions that guard them ---')
// A site user's reports cover their own branches (SOW §15 access levels), so
// they may export — but naming a branch outside them is refused, not answered
// with zeros.
check(
  'a site user can export their own branch',
  (await raw(`/reports/spend/by-site.xlsx?${window}`, site)).status,
  200
)
const me = (await json('/auth/me', site)).body
const accountSites = (await json('/sites?limit=100', head)).body?.items ?? []
const foreignSite = accountSites.find(
  (candidate) => candidate.id !== me?.siteId
)
if (foreignSite) {
  check(
    '  and cannot export another branch',
    (
      await raw(
        `/reports/spend/by-site.xlsx?${window}&siteId=${foreignSite.id}`,
        site
      )
    ).status,
    403
  )
}
check(
  'head office cannot export spend across accounts',
  (await raw(`/reports/spend/by-account.csv?${window}`, head)).status,
  403
)
check(
  'head office cannot export another account’s approvals',
  (
    await raw(
      `/reports/approvals/activity.csv?${window}&accountId=acc_someone_else`,
      head
    )
  ).status,
  403
)
check(
  'a site user cannot pull the access review',
  (await raw('/reports/users/access-review.xlsx', site)).status,
  403
)
check(
  'anonymous is refused',
  (await raw('/reports/orders/ageing.csv')).status,
  401
)

console.log('\n--- the executive dashboard as PDF ---')
const pdf = await raw(`/reports/dashboard/pdf?${window}`, head)
check('head office gets its dashboard', pdf.status, 200)
check('  as a PDF', pdf.res.headers.get('content-type'), 'application/pdf')
check('  that is one', new TextDecoder().decode(pdf.bytes.slice(0, 5)), '%PDF-')
check(
  'the platform-wide one is refused to head office',
  (await raw(`/reports/dashboard/pdf?${window}&scope=platform`, head)).status,
  403
)
check(
  '  and given to an administrator',
  (await raw(`/reports/dashboard/pdf?${window}&scope=platform`, admin)).status,
  200
)

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail === 0 ? 0 : 1)
