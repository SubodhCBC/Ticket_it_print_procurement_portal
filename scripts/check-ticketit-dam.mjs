/**
 * Prints what Ticket-IT's ImageManagement endpoints actually return, so the
 * field-name guesses in `src/server/dam/dam.mapper.ts` can be checked against the
 * real thing.
 *
 * Same reason and same rules as `check-ticketit-auth.mjs`: the OpenAPI document
 * types no responses, this script is standalone (no project imports, nothing but
 * fetch), and it is not part of `npm run verify`.
 *
 *   node --env-file-if-exists=.env scripts/check-ticketit-dam.mjs <login> <password> [folderPath] [fileName]
 *
 * Read-only by default: it calls the listing, search and notes operations and
 * nothing that moves, deletes or touches the share cart. `getFileNotes` runs
 * only when a fileName is given.
 *
 * It finishes by reporting the *shape* of every URL the library handed back —
 * host, extension, query parameter names, and whether any of them is an expiry.
 * That is what decides whether a DAM link may be stored in a database column or
 * has to be re-resolved on every read. Values are never printed: an Azure `sig`
 * or an `X-Amz-Signature` is the credential itself.
 *
 * `--upload <path>` is the one exception, and it *writes*: it puts that file
 * into the library to settle which multipart field `UploadImage` binds. The
 * OpenAPI document declares both `imageFiles` and `imageFile` and marks neither
 * required, which is the guess `DAM_UPLOAD_FILE_FIELD` exists to correct. The
 * probe tries `imageFiles`, re-lists the folder to see whether the file landed,
 * and only falls back to `imageFile` if it did not. Use a QA account and a
 * throwaway file: whatever lands stays there until someone deletes it.
 *
 * The password is read from argv, so it lands in your shell history. Use a QA
 * account. Anything JWT-shaped, and every URL's query string (an Azure SAS
 * signature is a credential), is redacted from the output.
 */

const argv = process.argv.slice(2)
const uploadAt = argv.indexOf('--upload')
const uploadPath = uploadAt === -1 ? null : argv[uploadAt + 1]
if (uploadAt !== -1) argv.splice(uploadAt, uploadPath === undefined ? 1 : 2)

const [login, password, folderPath, fileName] = argv

/** The two names `UploadImage` declares. Only one of them is bound. */
const UPLOAD_FIELDS = ['imageFiles', 'imageFile']
const base = (process.env.TICKETIT_API_BASE_URL ?? '').replace(/\/+$/, '')

if (!base) {
  fail(
    'Set TICKETIT_API_BASE_URL, e.g. by running with --env-file-if-exists=.env.'
  )
}
if (!login || !password) {
  fail(
    'Usage: node scripts/check-ticketit-dam.mjs <login> <password> [folderPath] ' +
      '[fileName] [--upload <path>]'
  )
}
if (uploadAt !== -1 && !uploadPath) {
  fail('--upload needs the path of a file to upload.')
}

console.log(`base: ${base}\n`)

const signIn = await call('POST', '/api/v1/Account/login', { login, password })
console.log(`POST /api/v1/Account/login -> ${signIn.status} (${signIn.ms}ms)`)
if (signIn.status >= 400) {
  fail('Login failed. Check the credential with check-ticketit-auth.mjs first.')
}

const token = findJwt(signIn.body)
if (!token) fail('Nothing in the login response is shaped like a JWT.')

/** Ticket-IT's `SearchRequestModel`, exactly as the portal sends it. */
const paging = {
  pageNumber: 1,
  pageSize: 5,
  searchString: null,
  sortOn: null,
  sortDirection: null,
}

const operations = [
  ['GetFolderSubFolder', paging],
  ['GetFilesByClient', { ...paging, folderPath: folderPath ?? null }],
  ['GetImagesByClient', paging],
  ['AdvanceSearch', paging],
]
if (fileName) {
  operations.push([
    'getFileNotes',
    { fileNoteId: null, folderPath: folderPath ?? null, fileName },
  ])
}

let failures = 0
/** Every absolute URL any response mentioned, for the shape report at the end. */
const seenUrls = new Set()
for (const [operation, body] of operations) {
  const path = `/api/v1/ImageManagement/${operation}`
  const result = await call('POST', path, body, token)
  if (result.status >= 400) failures += 1

  console.log(`\n=== POST ${path} -> ${result.status} (${result.ms}ms)`)
  console.log(`request: ${JSON.stringify(body)}`)
  console.log(`shape:   ${shape(result.body, 0)}`)

  const row = firstRow(result.body, 0)
  if (row !== undefined) {
    console.log('first row:')
    if (isRecord(row)) {
      for (const [key, value] of Object.entries(row)) {
        console.log(`  ${key.padEnd(26)}${summarise(value)}`)
      }
    } else {
      console.log(`  ${summarise(row)}`)
    }
  }

  collectUrls(result.body, seenUrls)
  console.log('body:')
  console.log(indent(preview(result.body)))
}

reportUrls(seenUrls)

if (!fileName) {
  console.log(
    '\n(getFileNotes skipped: pass a folderPath and a fileName to include it.)'
  )
}
if (uploadPath) failures += await probeUpload()
else console.log('\n(upload skipped: pass --upload <path> to include it.)')

process.exit(failures > 0 ? 1 : 0)

// --- Upload probe -------------------------------------------------------------

/**
 * Uploads one file under each candidate field name until the folder shows it,
 * and prints the `DAM_UPLOAD_FILE_FIELD` value to configure.
 *
 * Returns the number of failures to add to the run's total.
 */
async function probeUpload() {
  const { readFile } = await import('node:fs/promises')
  const { basename } = await import('node:path')

  let bytes
  try {
    bytes = await readFile(uploadPath)
  } catch (error) {
    console.error(`\n=== upload: cannot read ${uploadPath}: ${error.message}`)
    return 1
  }

  // A name nothing else in the library will have, so "did it land?" has one
  // answer. The extension is kept: the portal's own route insists on one.
  const name = basename(uploadPath)
  const dot = name.lastIndexOf('.')
  const stem = dot > 0 ? name.slice(0, dot) : name
  const extension = dot > 0 ? name.slice(dot) : ''
  const probeName = `${stem}-probe-${Date.now()}${extension}`

  console.log('\n=== POST /api/v1/ImageManagement/UploadImage')
  console.log(`file:    ${uploadPath} (${bytes.length} bytes) as ${probeName}`)
  console.log(`folder:  ${folderPath ?? '(root)'}`)

  for (const field of UPLOAD_FIELDS) {
    const form = new FormData()
    form.append(field, new Blob([bytes]), probeName)
    if (folderPath) form.append('folderPath', folderPath)

    const result = await call(
      'POST',
      '/api/v1/ImageManagement/UploadImage',
      form,
      token
    )
    console.log(`\nfield "${field}" -> ${result.status} (${result.ms}ms)`)
    console.log(`shape:   ${shape(result.body, 0)}`)
    console.log('body:')
    console.log(indent(preview(result.body)))

    if (result.status >= 400) {
      console.log(`  ${field} was refused; trying the next name.`)
      continue
    }

    if (await folderHas(probeName)) {
      console.log(
        `\nThe file is in the folder. Set DAM_UPLOAD_FILE_FIELD=${field}.\n` +
          `Delete ${probeName} from the library when you are done.`
      )
      return 0
    }
    console.log(
      `  Accepted, but ${probeName} is not in the folder — ${field} is not ` +
        'the field that binds.'
    )
  }

  console.error(
    `\nNeither ${UPLOAD_FIELDS.join(' nor ')} stored the file. UploadImage ` +
      'wants something this script does not send; read the controller.'
  )
  return 1
}

/** Whether `GetFilesByClient` lists a file of this name in the probe folder. */
async function folderHas(name) {
  const result = await call(
    'POST',
    '/api/v1/ImageManagement/GetFilesByClient',
    { ...paging, pageSize: 100, folderPath: folderPath ?? null },
    token
  )
  return JSON.stringify(result.body ?? null).includes(name)
}

// --- helpers ----------------------------------------------------------------

async function call(method, path, body, bearer) {
  const isMultipart = body instanceof FormData
  const headers = { Accept: 'application/json' }
  if (bearer) headers.Authorization = `Bearer ${bearer}`
  // No Content-Type for a multipart body: only fetch knows its boundary.
  if (body !== undefined && !isMultipart) {
    headers['Content-Type'] = 'application/json'
  }

  const started = Date.now()
  const response = await fetch(`${base}${path}`, {
    method,
    headers,
    body: isMultipart
      ? body
      : body === undefined
        ? undefined
        : JSON.stringify(body),
    // An upload of any size needs longer than a listing does.
    signal: AbortSignal.timeout(isMultipart ? 180_000 : 30_000),
  })

  const text = await response.text()
  let parsed
  try {
    parsed = text.trim() === '' ? undefined : JSON.parse(text)
  } catch {
    parsed = text
  }
  return { status: response.status, body: parsed, ms: Date.now() - started }
}

/** Keys and types two levels deep: enough to write the mapper from. */
function shape(value, depth) {
  if (value === undefined) return '(empty body)'
  if (value === null) return 'null'
  if (Array.isArray(value)) {
    const of =
      value.length > 0 && depth < 2 ? ` of ${shape(value[0], depth + 1)}` : ''
    return `array(${value.length})${of}`
  }
  if (!isRecord(value)) return typeof value
  if (depth >= 2) return 'object'

  const entries = Object.entries(value).map(
    ([key, entry]) => `${key}: ${shape(entry, depth + 1)}`
  )
  return `{ ${entries.join(', ')} }`
}

/** The first element of the first non-empty array found, three levels deep. */
function firstRow(value, depth) {
  if (Array.isArray(value)) return value.length > 0 ? value[0] : undefined
  if (!isRecord(value) || depth >= 3) return undefined

  for (const entry of Object.values(value)) {
    const row = firstRow(entry, depth + 1)
    if (row !== undefined) return row
  }
  return undefined
}

function preview(body) {
  if (body === undefined) return '(empty body)'
  const json = JSON.stringify(body, (_key, value) => redact(value), 2)
  return json.length > 4000 ? `${json.slice(0, 4000)}\n... (truncated)` : json
}

function redact(value) {
  if (typeof value !== 'string') return value
  if (looksLikeJwt(value)) return `<jwt: ${value.length} chars>`
  if (/^https?:\/\//i.test(value) && value.includes('?')) {
    return `${value.slice(0, value.indexOf('?'))}?<query redacted>`
  }
  return value
}

/** One line per field: enough to see the shape, never the whole value. */
function summarise(value) {
  if (value === null) return 'null'
  if (Array.isArray(value)) return `array(${value.length})`
  if (isRecord(value)) return `object { ${Object.keys(value).join(', ')} }`
  if (typeof value === 'string') {
    const safe = redact(value)
    return safe.length > 60 ? `"${safe.slice(0, 60)}…"` : `"${safe}"`
  }
  return `${String(value)} (${typeof value})`
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

function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
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

// --- URL shapes ---------------------------------------------------------------

/**
 * Reports what the URLs in a response actually look like, without printing one.
 *
 * This is the question the portal cannot answer for itself and that decides
 * whether a DAM link may be stored in a database column: a permanent public URL
 * can be; a signed one with an expiry is a credential that will be a 403 by the
 * time anyone opens the row, and must be re-fetched per request instead.
 *
 * Only the host, the extension, the query *parameter names* and whether any of
 * them looks like an expiry are printed. Never a value: an Azure `sig` or an
 * `X-Amz-Signature` is the credential itself.
 */
function collectUrls(value, into, depth = 0) {
  if (typeof value === 'string') {
    if (/^https?:\/\//i.test(value)) into.add(value)
    return
  }
  if (depth >= 6 || value === null || typeof value !== 'object') return
  for (const entry of Object.values(value)) collectUrls(entry, into, depth + 1)
}

/** Query keys that mean "this link stops working". */
const EXPIRY_KEYS = [
  'se', // Azure SAS expiry
  'sig', // Azure SAS signature
  'sv', // Azure SAS version
  'st',
  'sp',
  'x-amz-expires',
  'x-amz-signature',
  'x-amz-credential',
  'expires',
  'expiry',
  'token',
  'access_token',
  'signature',
]

function describeUrl(raw) {
  let url
  try {
    url = new URL(raw)
  } catch {
    return 'unparseable'
  }

  const keys = [...url.searchParams.keys()]
  const expiring = keys.filter((key) => EXPIRY_KEYS.includes(key.toLowerCase()))
  const extension = url.pathname.includes('.')
    ? url.pathname.slice(url.pathname.lastIndexOf('.'))
    : '(none)'

  return [
    `host=${url.host}`,
    `ext=${extension}`,
    keys.length === 0 ? 'query=(none)' : `query=[${keys.join(', ')}]`,
    expiring.length > 0
      ? `SIGNED/EXPIRING (${expiring.join(', ')})`
      : 'no expiry parameter',
  ].join('  ')
}

function reportUrls(urls) {
  console.log('\n=== URL shapes seen in the responses above')
  if (urls.size === 0) {
    console.log(
      '  No absolute URLs anywhere. The library does not hand out links at ' +
        'all, so the portal cannot serve a DAM file to a browser without ' +
        'proxying the bytes itself.'
    )
    return
  }

  const described = new Set()
  for (const url of urls) described.add(describeUrl(url))
  for (const line of described) console.log(`  ${line}`)

  const anySigned = [...described].some((line) => line.includes('SIGNED'))
  console.log(
    anySigned
      ? '\n  At least one link is signed with an expiry. A URL like that is a\n' +
          '  credential, not an address: it must NOT be stored in a database\n' +
          '  column and re-served later. Store folderPath + fileName and\n' +
          '  re-resolve the URL on each read.'
      : '\n  No expiry parameters. Still confirm with Ticket-IT that these URLs\n' +
          '  are public (no bearer token needed), allow CORS from the portal\n' +
          '  origin, and are not rotated — none of which is visible from here.\n' +
          '  Fetch one signed out, from a browser, before relying on it.'
  )
}
