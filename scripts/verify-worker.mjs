import sharp from 'sharp'

/**
 * `BASE_URL` so this can be pointed at a deployed environment, which is the
 * only place some of these checks mean anything. Defaults to the local
 * `next start` port.
 */
const BASE_URL = process.env.BASE_URL ?? 'http://localhost:3100'
const B = `${BASE_URL}/api/v1`

let pass = 0
let fail = 0

async function call(method, path, { token, body } = {}) {
  const res = await fetch(B + path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  })
  const text = await res.text()
  let json
  try {
    json = text ? JSON.parse(text) : null
  } catch {
    json = { _raw: text.slice(0, 300) }
  }
  return { status: res.status, json }
}

function check(label, actual, expected, extra = '') {
  const ok = JSON.stringify(actual) === JSON.stringify(expected)
  if (ok) pass++
  else fail++
  console.log(
    `${ok ? 'PASS' : 'FAIL'}  ${label}  (got ${JSON.stringify(actual)}, want ${JSON.stringify(expected)}) ${extra}`
  )
}

const note = (t) => console.log(`      ${t}`)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function pollJob(token, jobId, tries = 60) {
  for (let i = 0; i < tries; i++) {
    const res = await call('GET', `/catalog/products/import/jobs/${jobId}`, {
      token,
    })
    if (['COMPLETED', 'FAILED'].includes(res.json?.status)) return res.json
    await sleep(250)
  }
  return null
}

/**
 * Signs in, and says so plainly when it cannot.
 *
 * Without the guard a refused login returns undefined, and the script dies
 * several lines later on `undefined.find` — a stack trace that says nothing
 * about the cause. The most common cause is not a wrong password: it is this
 * suite's own auth rate limit, which allows ten attempts per window, and each
 * run of the three HTTP checks spends nine.
 */
async function login(who) {
  const res = await call('POST', '/auth/login', {
    body: { login: who, password: 'Password123!' },
  })
  if (res.status !== 200 || !res.json?.accessToken) {
    const why =
      res.status === 429
        ? [
            'The auth rate limit allows ten attempts per window, and one run of',
            'the three HTTP checks spends nine. Wait for the window to pass, or',
            'raise RATE_LIMIT_AUTH_MAX in this environment.',
          ]
        : ['Check the database is seeded and the credentials still match.']

    console.error('')
    console.error(
      `Could not sign in as ${who} — ${res.status} ${res.json?.error?.code ?? ''}`
    )
    for (const line of why) console.error(line)

    process.exit(1)
  }
  return res.json.accessToken
}

const admin = await login('dev.admin')

// Unique per run. The catalogue soft-deletes, so a SKU this script created
// stays taken after it "removes" the product -- and a second run would see the
// import report it as updated rather than created, which is correct behaviour
// and a failing test.
const SKU = `SQLSRV-WRK-${Date.now().toString().slice(-8)}`

// ---------------------------------------------------------------------------
console.log('--- bulk import: dry run ---')

const rows = [
  {
    sku: SKU,
    name: 'SQL Server worker flyer',
    categoryCode: 'FLYERS',
    basePrice: '1.25',
    moq: 50,
    tags: 'promo|seasonal',
  },
  {
    sku: `${SKU}-BAD`,
    name: 'Bad category',
    categoryCode: 'NOPE',
    basePrice: '1.00',
  },
  { sku: '', name: '', categoryCode: 'FLYERS', basePrice: 'not-a-price' },
]

const dry = await call('POST', '/catalog/products/import', {
  token: admin,
  body: { dryRun: true, rows },
})
check('import accepted with 202', dry.status, 202, `job=${dry.json.id}`)

const dryDone = await pollJob(admin, dry.json.id)
check('the worker drained it', dryDone?.status, 'COMPLETED')
check('  one row would be created', dryDone?.created, 1)
check('  two rows failed', dryDone?.failed, 2)

// The payload and the per-row results are both NVARCHAR(MAX) holding JSON now.
check(
  '  per-row results decode from the JSON column',
  Array.isArray(dryDone?.results),
  true,
  `${dryDone?.results?.length} row(s)`
)
note(
  `failures: ${JSON.stringify(dryDone?.results?.filter((r) => r.outcome === 'failed').map((r) => r.message?.slice(0, 60)))}`
)

const notWritten = await call(
  'GET',
  `/catalog/products?search=${SKU}&status=DRAFT`,
  { token: admin }
)
check('  a dry run wrote nothing', notWritten.json.items?.length ?? 0, 0)

// ---------------------------------------------------------------------------
console.log('\n--- bulk import: real run ---')

const real = await call('POST', '/catalog/products/import', {
  token: admin,
  body: { rows: [rows[0]] },
})
const realDone = await pollJob(admin, real.json.id)
check(
  'the real run completed',
  realDone?.status,
  'COMPLETED',
  `created=${realDone?.created}`
)

const created = await call(
  'GET',
  `/catalog/products?search=${SKU}&status=DRAFT`,
  { token: admin }
)
const product = created.json.items?.[0]
check('  the product exists', product?.sku, SKU)
check('  and landed as DRAFT, not published', product?.status, 'DRAFT')
// tags arrive as a pipe-delimited string in the file and are stored as a JSON array.
check('  tags parsed from the file and stored as JSON', product?.tags, [
  'promo',
  'seasonal',
])

const again = await call('POST', '/catalog/products/import', {
  token: admin,
  body: { rows: [{ ...rows[0], name: 'Renamed' }] },
})
check(
  'a re-import skips an existing SKU',
  (await pollJob(admin, again.json.id))?.skipped,
  1
)

const upd = await call('POST', '/catalog/products/import', {
  token: admin,
  body: {
    updateExisting: true,
    rows: [{ ...rows[0], name: 'Renamed by re-import' }],
  },
})
check(
  '  updateExisting updates it',
  (await pollJob(admin, upd.json.id))?.updated,
  1
)
const renamed = await call('GET', `/catalog/products/${product.id}`, {
  token: admin,
})
check('  the name changed', renamed.json.name, 'Renamed by re-import')
check('  and the status stayed DRAFT', renamed.json.status, 'DRAFT')

const jobs = await call('GET', '/catalog/products/import/jobs?pageSize=5', {
  token: admin,
})
check('the job list answers', jobs.status, 200)
check(
  '  and omits payload and results',
  jobs.json.items?.[0]?.results,
  undefined
)

// ---------------------------------------------------------------------------
console.log('\n--- image derivatives ---')

const png = await sharp({
  create: {
    width: 1600,
    height: 1200,
    channels: 3,
    background: { r: 30, g: 110, b: 90 },
  },
})
  .png()
  .toBuffer()

/**
 * An image reaches a product through the document library now.
 *
 * There is no presigned upload to object storage any more: the file goes to
 * Ticket-IT with `POST /dam/files`, and the attach names it by folder and file
 * name while the portal copies the bytes across. So this is the real path, not
 * a shortcut around it — which is also why it needs the library to be reachable.
 */
const folderPath = 'VerifyWorker'
const fileName = `worker-${Date.now().toString().slice(-6)}.png`
// Declared out here because the cleanup at the end removes it, and the whole
// section is skipped when the library is unreachable.
let assetId = null

const form = new FormData()
form.append('folderPath', folderPath)
form.append('files', new Blob([png], { type: 'image/png' }), fileName)

const uploaded = await fetch(`${B}/dam/files`, {
  method: 'POST',
  headers: { Authorization: `Bearer ${admin}` },
  body: form,
})
const uploadedJson = await uploaded.json().catch(() => null)

/**
 * Skipped rather than failed where the library cannot be reached at all, which
 * is the normal state of a local checkout. Two ways that happens, and neither
 * says anything about the render worker:
 *
 *   503  DAM_ENABLED is off, or DAM_SERVICE_LOGIN and DAM_SERVICE_PASSWORD are
 *        blank — which is how `.env` ships.
 *   403  TICKETIT_SESSION_REQUIRED: uploading is done as the person, through
 *        their Ticket-IT sign-in, and a seeded dev account has never had one.
 *
 * Anything else is a real failure and is reported as one.
 */
const libraryOutOfReach =
  uploaded.status === 503 ||
  uploadedJson?.error?.code === 'TICKETIT_SESSION_REQUIRED'

if (libraryOutOfReach) {
  note(
    `image derivatives skipped: ${uploadedJson?.error?.message ?? 'the image library is unavailable'}`
  )
  note(
    'needs DAM_ENABLED with service credentials, and an operator signed in through Ticket-IT'
  )
} else {
  check('upload to the image library', uploaded.status, 201)

  const stored = (uploadedJson?.files ?? uploadedJson?.items ?? [])[0]
  check('  the library holds it', stored?.name, fileName)

  const attached = await call(
    'POST',
    `/catalog/products/${product.id}/assets`,
    {
      token: admin,
      body: {
        damDocumentId: `${folderPath}/${fileName}`,
        ...(stored?.url ? { damUrl: stored.url } : {}),
        filename: fileName,
        kind: 'IMAGE',
      },
    }
  )
  check('  attach', attached.status, 201)

  assetId = attached.json.assets?.find((a) => a.filename === fileName)?.id
  note(
    `status right after attach: ${attached.json.assets?.find((a) => a.id === assetId)?.derivativeStatus}`
  )

  let asset = null
  for (let i = 0; i < 80; i++) {
    const view = await call('GET', `/catalog/products/${product.id}`, {
      token: admin,
    })
    asset = view.json.assets?.find((a) => a.id === assetId)
    if (asset?.derivativeStatus && asset.derivativeStatus !== 'PENDING') break
    await sleep(250)
  }
  check('the render worker generated them', asset?.derivativeStatus, 'READY')
  check(
    '  and recorded the source dimensions',
    `${asset?.widthPx}x${asset?.heightPx}`,
    '1600x1200'
  )

  for (const [label, url, cap] of [
    ['thumbnail', asset?.thumbnailUrl, 320],
    ['preview', asset?.previewUrl, 1200],
  ]) {
    if (!url) {
      check(`  ${label} url present`, false, true)
      continue
    }
    const buf = Buffer.from(await (await fetch(url)).arrayBuffer())
    const meta = await sharp(buf).metadata()
    check(
      `  ${label} is a resized webp`,
      meta.format,
      'webp',
      `${meta.width}x${meta.height}, ${buf.length} bytes`
    )
    check(
      `    and fits inside ${cap}px`,
      meta.width <= cap && meta.height <= cap,
      true
    )
  }

  // The library keeps its own copy; the portal copied the bytes out, so the
  // upload is litter once the asset exists.
  await call(
    'DELETE',
    `/dam/files?folderPath=${encodeURIComponent(folderPath)}&fileName=${encodeURIComponent(fileName)}`,
    { token: admin }
  )
}

// ---------------------------------------------------------------------------
console.log('\n--- mail through the queue ---')

const forgot = await call('POST', '/password/forgot', {
  body: { identifier: 'dev.admin' },
})
check('password/forgot accepted', forgot.status, 204)
note('the worker log should show a sent "Reset your password" mail')

// ---------------------------------------------------------------------------
console.log('\n--- cleanup ---')
if (assetId) {
  check(
    'asset removed',
    (
      await call(
        'DELETE',
        `/catalog/products/${product.id}/assets/${assetId}`,
        { token: admin }
      )
    ).status,
    204
  )
}
check(
  'imported product removed',
  (await call('DELETE', `/catalog/products/${product.id}`, { token: admin }))
    .status,
  204
)

console.log(`\n${pass} passed, ${fail} failed`)

// Exit non-zero on failure, so `npm run verify` and any CI running this can
// tell. Without it the script prints its failures and then reports success,
// which is worse than having no check at all.
process.exit(fail === 0 ? 0 : 1)
