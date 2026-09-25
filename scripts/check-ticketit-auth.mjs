/**
 * Prints what Ticket-IT actually returns for a login, so the mapping in
 * `src/server/auth/ticketit/` can be checked against the real thing.
 *
 * It exists because the published OpenAPI document types every request body and
 * no response at all — all 183 operations declare `200: "Success"` with no
 * schema. The client code is written defensively for that reason, and this is
 * how you confirm which of its fallbacks is actually being used.
 *
 * Deliberately standalone: no project imports, no database, nothing but fetch.
 * It verifies the upstream contract, not our reading of it, and it is *not*
 * wired into `npm run verify` — that suite must pass with no credentials and no
 * network.
 *
 *   node scripts/check-ticketit-auth.mjs <login> <password>
 *   node --env-file-if-exists=.env scripts/check-ticketit-auth.mjs <login> <password>
 *
 * The base URL comes from TICKETIT_API_BASE_URL, or a third argument.
 *
 * The password is read from argv, so it lands in your shell history. Use a QA
 * account, and rotate it if it is one that matters.
 */

const [login, password, baseArg] = process.argv.slice(2)
const base = (baseArg ?? process.env.TICKETIT_API_BASE_URL ?? '').replace(
  /\/+$/,
  ''
)

if (!base) {
  fail('Set TICKETIT_API_BASE_URL, or pass the base URL as the third argument.')
}
if (!login || !password) {
  fail(
    'Usage: node scripts/check-ticketit-auth.mjs <login> <password> [baseUrl]'
  )
}

/** Field names the portal reads off the profile. Reported present or missing. */
const MAPPED_FIELDS = [
  'userId',
  'login',
  'userName',
  'email',
  'firstName',
  'lastName',
  'fullName',
  'phone',
  'clientName',
  'regionName',
  'groupName',
  'userRoles',
  'hasAdminRole',
  'isHeadOfficeAdmin',
  // The three the schema has no place for. If any of these turn up, the mapper
  // will use them and users keep their branch and must-change flag.
  'outletId',
  'isPasswordChangeRequired',
  'isActive',
]

console.log(`base: ${base}\n`)

await step('GET /api/health', () => call('GET', '/api/health'))

const loginResponse = await step('POST /api/v1/Account/login', () =>
  call('POST', '/api/v1/Account/login', { login, password })
)

const token = findJwt(loginResponse.body)
console.log(`\ntoken found: ${token ? 'yes' : 'NO'}`)
if (!token) {
  console.log(
    'Nothing in the login response is shaped like a JWT. The portal would ' +
      'reject this as an upstream contract change — see extractToken() in ' +
      'src/server/auth/ticketit/ticketit-auth.repository.ts.'
  )
  process.exit(1)
}

const profile = await step('GET /api/v1/User/GetCurrentLoginUserDetails', () =>
  call('GET', '/api/v1/User/GetCurrentLoginUserDetails', undefined, token)
)

console.log(
  '\n--- fields the portal maps -------------------------------------'
)
const source = unwrap(profile.body)
for (const field of MAPPED_FIELDS) {
  const present = field in source
  const value = present ? summarise(source[field]) : ''
  console.log(`  ${present ? '+' : '-'} ${field.padEnd(26)}${value}`)
}

const missing = ['outletId', 'isPasswordChangeRequired'].filter(
  (field) => !(field in source)
)
if (missing.length > 0) {
  console.log(
    `\nNot returned: ${missing.join(', ')}. The portal leaves the stored value ` +
      'alone for these rather than overwriting it with null — so a replicated ' +
      'user keeps the branch they were attached to, but a change upstream to ' +
      'either will never reach the portal.'
  )
}

// --- helpers ----------------------------------------------------------------

async function step(name, run) {
  const started = Date.now()
  const result = await run()
  console.log(
    `${name} -> ${result.status} (${Date.now() - started}ms)\n` +
      indent(preview(result.body))
  )
  if (result.status >= 400) fail(`${name} failed.`)
  return result
}

async function call(method, path, body, token) {
  const headers = { Accept: 'application/json' }
  if (token) headers.Authorization = `Bearer ${token}`
  if (body !== undefined) headers['Content-Type'] = 'application/json'

  const response = await fetch(`${base}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(30_000),
  })

  const text = await response.text()
  let parsed
  try {
    parsed = text.trim() === '' ? undefined : JSON.parse(text)
  } catch {
    parsed = text
  }
  return { status: response.status, body: parsed }
}

/** Redacts anything JWT-shaped, so a token never reaches the terminal in full. */
function preview(body) {
  if (body === undefined) return '(empty body)'
  const json = JSON.stringify(body, redactJwt, 2)
  return json.length > 4000 ? `${json.slice(0, 4000)}\n... (truncated)` : json
}

function redactJwt(_key, value) {
  return typeof value === 'string' && looksLikeJwt(value)
    ? `<jwt: ${value.length} chars>`
    : value
}

function findJwt(payload) {
  if (typeof payload === 'string') return looksLikeJwt(payload) ? payload : null
  if (typeof payload !== 'object' || payload === null) return null

  for (const value of Object.values(payload)) {
    if (typeof value === 'string' && looksLikeJwt(value)) return value
    const nested = findJwt(value)
    if (nested) return nested
  }
  return null
}

function looksLikeJwt(value) {
  const parts = value.trim().split('.')
  return parts.length === 3 && parts.every((p) => /^[A-Za-z0-9_-]+$/.test(p))
}

function unwrap(payload) {
  let current = payload
  for (let depth = 0; depth < 3; depth += 1) {
    if (Array.isArray(current)) {
      current = current[0]
      continue
    }
    if (typeof current !== 'object' || current === null) return {}
    if ('userId' in current) return current

    const wrapper = ['data', 'result', 'response', 'payload', 'user'].find(
      (key) => typeof current[key] === 'object' && current[key] !== null
    )
    if (!wrapper) return current
    current = current[wrapper]
  }
  return typeof current === 'object' && current !== null ? current : {}
}

/** One line per field: enough to see the shape, never the whole value. */
function summarise(value) {
  if (value === null) return 'null'
  if (Array.isArray(value)) return `array(${value.length})`
  if (typeof value === 'object') return 'object'
  if (typeof value === 'string') {
    return value.length > 40 ? `"${value.slice(0, 40)}…"` : `"${value}"`
  }
  return String(value)
}

function indent(text) {
  return text
    .split('\n')
    .map((line) => `  ${line}`)
    .join('\n')
}

function fail(message) {
  console.error(message)
  process.exit(1)
}
