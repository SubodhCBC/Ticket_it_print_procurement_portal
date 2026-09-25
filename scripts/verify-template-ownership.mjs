/**
 * Proves who can see, edit, publish and copy a template.
 *
 * Run with `npm run verify:templates`. Needs the application answering and a
 * seeded database.
 *
 * ---------------------------------------------------------------------------
 * Why this one matters more than most
 * ---------------------------------------------------------------------------
 * Templates were the operator's alone until customers were allowed to build
 * too, and the obvious way to allow it — granting TEMPLATE_MANAGE to head
 * office and site users — would also have let them edit, publish and delete the
 * operator's originals. The route permission is now TEMPLATE_USE almost
 * everywhere, and the real rule lives in the service: you may change a template
 * if you hold the permission or you own it.
 *
 * That means the authorisation is no longer visible in the route file. A
 * mistake in `canManage` would not fail a build, would not fail a typecheck,
 * and would not fail any test that exercises one role at a time. It would just
 * quietly let one customer edit another's work, or the operator's.
 *
 * So every check below is a refusal as much as a permission.
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
    json = { _raw: text.slice(0, 200) }
  }
  return { status: res.status, json }
}

function check(label, actual, expected, note = '') {
  const ok = JSON.stringify(actual) === JSON.stringify(expected)
  if (ok) pass++
  else fail++
  console.log(
    `${ok ? 'PASS' : 'FAIL'}  ${label}  (got ${JSON.stringify(actual)}, want ${JSON.stringify(expected)}) ${note}`
  )
}

const note = (t) => console.log(`      ${t}`)

async function login(who) {
  const res = await call('POST', '/auth/login', {
    body: { login: who, password: 'Password123!' },
  })
  if (res.status !== 200 || !res.json?.accessToken) {
    console.error('')
    console.error(`Could not sign in as ${who} — ${res.status}`)
    console.error('If this is 429, the auth rate limit is ten per window.')
    process.exit(1)
  }
  return res.json.accessToken
}

const admin = await login('dev.admin')
const head = await login('dev.headoffice')
const site = await login('dev.siteuser')

const stamp = Date.now().toString().slice(-8)
const made = []

/**
 * A canvas of the size the builder actually sends.
 *
 * Every template these scripts built used to carry `layers` and nothing else,
 * so `canvasJson` -- which the builder sends on every save -- was never once
 * exercised. Its column had been left NVARCHAR(500) by the port, and so every
 * save and publish from the real builder failed with P2000 while all 26 checks
 * here passed. A payload that omits the biggest field it can send is not a
 * test of saving.
 */
const canvasOf = (label) =>
  JSON.stringify({
    version: '5.3.0',
    objects: [
      {
        type: 'rect',
        left: 0,
        top: 0,
        width: 794,
        height: 1123,
        fill: '#ffffff',
      },
      {
        type: 'i-text',
        text: label,
        left: 40,
        top: 60,
        fontSize: 28,
        layerId: 'l1',
      },
      // Padding to a realistic weight: a canvas with one photo on it runs to
      // hundreds of kilobytes, and 500 characters is what used to be allowed.
      {
        type: 'image',
        src: 'data:image/png;base64,' + 'A'.repeat(40_000),
        layerId: 'l2',
      },
    ],
  })

const draft = (code, name) => ({
  code,
  name,
  canvasJson: canvasOf(name),
  orientation: 'PORTRAIT',
  widthValue: 210,
  heightValue: 297,
  dimensionUnit: 'MM',
  bleedMargin: 3,
  safeMargin: 5,
  canvasConfig: { background: '#ffffff' },
  layers: [
    {
      id: 'l1',
      type: 'text',
      content: 'Your business name',
      isEditable: true,
      label: 'Business name',
    },
  ],
})

async function create(token, code, name) {
  const res = await call('POST', '/templates', {
    token,
    body: draft(code, name),
  })
  if (res.status === 201) made.push(res.json.id)
  return res
}

try {
  // -------------------------------------------------------------------------
  console.log('--- a template takes its scope from whoever built it ---')

  const byAdmin = await create(admin, `OWN-A-${stamp}`, 'Operator library')
  check('an admin creates one', byAdmin.status, 201)
  check(
    '  and it is the operator library',
    byAdmin.json.visibility,
    'ALL_ACCOUNTS'
  )

  const byHead = await create(head, `OWN-H-${stamp}`, 'Head office design')
  check('a head office creates one', byHead.status, 201)
  check('  and it belongs to the account', byHead.json.visibility, 'ACCOUNT')

  const bySite = await create(site, `OWN-S-${stamp}`, 'Site user design')
  check('a site user creates one', bySite.status, 201)
  check('  and it is private', bySite.json.visibility, 'PRIVATE')

  // -------------------------------------------------------------------------
  console.log('\n--- nobody can change what is not theirs ---')

  const rename = { name: 'Renamed by someone else' }

  check(
    "a site user cannot edit the operator's template",
    (
      await call('PATCH', `/templates/${byAdmin.json.id}`, {
        token: site,
        body: rename,
      })
    ).status,
    403
  )
  check(
    'a site user cannot edit the head office template',
    (
      await call('PATCH', `/templates/${byHead.json.id}`, {
        token: site,
        body: rename,
      })
    ).status,
    403
  )
  check(
    "a head office cannot edit the operator's template",
    (
      await call(
        'PATCH',
        `/templates/${byHead.json.id === byAdmin.json.id ? '' : byAdmin.json.id}`,
        { token: head, body: rename }
      )
    ).status,
    403
  )
  check(
    'a site user can edit their own',
    (
      await call('PATCH', `/templates/${bySite.json.id}`, {
        token: site,
        body: { name: 'Renamed by me' },
      })
    ).status,
    200
  )
  check(
    'a head office can edit its account template',
    (
      await call('PATCH', `/templates/${byHead.json.id}`, {
        token: head,
        body: { name: 'Renamed by head office' },
      })
    ).status,
    200
  )
  check(
    'an admin can edit anything',
    (
      await call('PATCH', `/templates/${bySite.json.id}`, {
        token: admin,
        body: { description: 'Touched by the operator' },
      })
    ).status,
    200
  )

  // -------------------------------------------------------------------------
  console.log('\n--- publishing is a head office decision ---')

  const sitePublish = await call(
    'POST',
    `/templates/${bySite.json.id}/publish`,
    {
      token: site,
      body: { label: 'Trying to publish' },
    }
  )
  check('a site user cannot publish, even their own', sitePublish.status, 403)
  note(`"${sitePublish.json?.error?.message ?? ''}"`)

  check(
    'a head office can publish its own',
    (
      await call('POST', `/templates/${byHead.json.id}/publish`, {
        token: head,
        body: { label: 'Published' },
      })
    ).status,
    201
  )

  // -------------------------------------------------------------------------
  console.log('\n--- what each role can see ---')

  const seenBySite =
    (await call('GET', '/templates?limit=100', { token: site })).json.items ??
    []
  const ids = new Set(seenBySite.map((t) => t.id))
  check(
    'a site user sees the published head office template',
    ids.has(byHead.json.id),
    true
  )
  check('  and their own draft', ids.has(bySite.json.id), true)
  check(
    "  and not the operator's unpublished draft",
    ids.has(byAdmin.json.id),
    false
  )

  const seenByHead =
    (await call('GET', '/templates?limit=100', { token: head })).json.items ??
    []
  const headIds = new Set(seenByHead.map((t) => t.id))
  check(
    "a head office does not see a site user's private template",
    headIds.has(bySite.json.id),
    false
  )

  // -------------------------------------------------------------------------
  console.log('\n--- the canvas survives a save, a reopen and a publish ---')

  const canvas = canvasOf('Round trip')
  const saved = await call('PATCH', `/templates/${bySite.json.id}`, {
    token: site,
    body: { canvasJson: canvas },
  })
  check('a save carrying a full canvas is accepted', saved.status, 200)

  const reopened = await call('GET', `/templates/${bySite.json.id}`, {
    token: site,
  })
  check(
    '  and it comes back the same length',
    reopened.json?.canvasJson?.length ?? 0,
    canvas.length
  )
  check('  byte for byte', reopened.json?.canvasJson === canvas, true)
  note(`${canvas.length} characters`)

  const publishedWithCanvas = await call(
    'POST',
    `/templates/${byHead.json.id}/publish`,
    {
      token: head,
      body: { label: 'With a canvas on it' },
    }
  )
  check('publishing one with a canvas on it', publishedWithCanvas.status, 201)
} finally {
  console.log('\n--- cleanup ---')
  for (const id of made.reverse()) {
    await call('DELETE', `/templates/${id}`, { token: admin })
  }
  note(`${made.length} template(s) removed`)
}

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail === 0 ? 0 : 1)
