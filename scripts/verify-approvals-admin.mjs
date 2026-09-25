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
const head = await login('dev.headoffice')
const site = await login('dev.siteuser')

const sites = (await call('GET', '/sites', { token: admin })).json.items
const mySite = sites.find((s) => s.addresses?.length > 0) ?? sites[0]
const ship =
  mySite.addresses?.find((a) => a.kind === 'SHIPPING') ?? mySite.addresses[0]

const placedOrders = []

/**
 * The designs this account can order, dearest first.
 *
 * A basket line is a design now, not a bare product: adding a product on its
 * own is refused with `TEMPLATE_REQUIRED`, because the design is what sets the
 * price. So the candidates are gathered from the template library and the
 * customiser — the same two calls the storefront makes, and the only place a
 * version id comes from — and the price that matters for sizing an order is the
 * design's, not the catalogue figure.
 *
 * Read once: this helper is called several times per run, and the library does
 * not change while it runs.
 */
let designs
async function orderableDesigns() {
  if (designs) return designs

  const templates =
    (
      await call('GET', '/templates?status=PUBLISHED&pageSize=50', {
        token: site,
      })
    ).json.items ?? []

  const found = []
  for (const summary of templates) {
    if (!summary.productId) continue

    // 404 for a template this account may not use; skipped, not fatal.
    const customiser = await call('GET', `/templates/${summary.id}/customise`, {
      token: site,
    })
    if (customiser.status !== 200) continue

    const product = (
      await call('GET', `/catalog/products/${customiser.json.productId}`, {
        token: site,
      })
    ).json
    if (product?.status !== 'ACTIVE' || !product.trackInventory) continue

    found.push({
      design: customiser.json,
      product,
      price: Number(customiser.json.price ?? product.basePrice ?? 0),
    })
  }

  designs = found.sort((a, b) => b.price - a.price)
  return designs
}

/**
 * Places an order worth at least `minTotal`, sized from what is actually
 * available rather than from a fixed quantity — earlier orders in this run hold
 * reservations, and the checkout refuses a line it cannot cover.
 */
async function placeOrder(minTotal) {
  await call('DELETE', '/cart', { token: site })

  for (const { design, product: p, price } of await orderableDesigns()) {
    const detail = (
      await call('GET', `/catalog/products/${p.id}`, { token: site })
    ).json
    const variant = detail.variants
      ?.slice()
      .sort((a, b) => b.stockOnHand - a.stockOnHand)[0]
    const available = variant
      ? variant.stockOnHand
      : p.stockOnHand - p.stockReserved
    const wanted = Math.max(p.moq, Math.ceil(minTotal / (price || 1)))
    if (available < wanted) continue

    const added = await call('POST', '/cart/lines', {
      token: site,
      body: {
        productId: p.id,
        ...(variant ? { variantId: variant.id } : {}),
        quantity: wanted,
        templateId: design.templateId,
        templateVersionId: design.versionId,
        customisation: {},
      },
    })
    if (added.status !== 201) continue

    const po = `${mySite.poPrefix ?? 'PO'}-APR-${Date.now().toString().slice(-6)}`
    await call('PATCH', '/cart/checkout-details', {
      token: site,
      body: {
        shippingAddressId: ship.id,
        poNumber: po,
        paymentMethod: 'NET_30_INVOICE',
        // Checkout refuses without a delivery choice since shipping became one.
        shippingMethod: 'STANDARD_PARCEL',
        acceptTerms: true,
      },
    })

    const session = await call('POST', '/cart/checkout-session', {
      token: site,
    })
    if (session.status !== 201) {
      note(
        `skipping ${p.sku}: ${session.json.error?.details?.issues?.[0]?.message ?? session.status}`
      )
      continue
    }

    const placed = await call('POST', '/orders', {
      token: site,
      body: { poNumber: po, acceptTerms: true },
    })
    if (placed.status === 201) placedOrders.push(placed.json.id)
    return { placed, sku: p.sku, qty: wanted, unit: p.basePrice }
  }

  return { placed: { status: 0, json: {} }, sku: null }
}

// ---------------------------------------------------------------------------
console.log('--- approvals: the account threshold (no rules) ---')

/** The rules endpoint answers with a bare array, not a page. */
const listRules = async () => {
  const res = await call('GET', '/approvals/rules', { token: admin })
  return Array.isArray(res.json) ? res.json : (res.json?.items ?? [])
}

/**
 * The first scenario is "no rules at all", so it has to start that way.
 *
 * This check used to read `.items` off that bare array, so it passed at zero
 * whatever the account held — and a run that died before its cleanup left a
 * rule behind that quietly routed the next run's order, making the threshold
 * scenario test the rule path instead. Only this script's own rule is removed,
 * matched on the name it creates below; anything else is left alone and the
 * check below fails, because a real rule means this scenario cannot run here.
 */
const RULE_NAME = 'Everything to head office'
for (const stale of (await listRules()).filter((r) => r.name === RULE_NAME)) {
  await call('DELETE', `/approvals/rules/${stale.id}`, { token: admin })
  note(`removed a rule left by an earlier run: ${stale.id}`)
}

check('the account starts with no rules', (await listRules()).length, 0)

const big = await placeOrder(1200)
note(`${big.qty} x ${big.sku} at ${big.unit} — total ${big.placed.json.total}`)
check(
  'an order over the threshold is placed',
  big.placed.status,
  201,
  `number=${big.placed.json.orderNumber}`
)
check(
  '  and lands PENDING_APPROVAL, not APPROVED',
  big.placed.json.status,
  'PENDING_APPROVAL'
)

const bigId = big.placed.json.id

// A threshold hold creates no approval-request record, deliberately. The status
// event distinguishes the two -- "over the account threshold" rather than
// "submitted for approval" -- and it is decided through the ordinary status
// transition. Rules are what produce approval steps.
const noRecord = await call('GET', `/approvals/orders/${bigId}`, {
  token: head,
})
check('a threshold hold produces no approval record', noRecord.status, 404)

const selfApprove = await call('POST', `/orders/${bigId}/status`, {
  token: site,
  body: { status: 'APPROVED' },
})
check('the requester cannot approve their own order', selfApprove.status, 403)

const approved = await call('POST', `/orders/${bigId}/status`, {
  token: head,
  body: { status: 'APPROVED', comment: 'Within budget' },
})
check('head office approves it', approved.status, 201)
check(
  '  and the order is APPROVED',
  (await call('GET', `/orders/${bigId}`, { token: site })).json.status,
  'APPROVED'
)

// ---------------------------------------------------------------------------
console.log('\n--- approvals: a rule that routes ---')

const rule = await call('POST', '/approvals/rules', {
  token: admin,
  body: {
    name: RULE_NAME,
    minTotal: '0.00',
    approverRole: 'HEAD_OFFICE',
    tier: 1,
  },
})
check('create a rule', rule.status, 201)

const bothApprovers = await call('POST', '/approvals/rules', {
  token: admin,
  body: {
    name: 'Bad',
    approverRole: 'HEAD_OFFICE',
    approverUserId: 'usr_x',
    tier: 1,
  },
})
check('naming two approvers is refused', bothApprovers.status, 400)

const small = await placeOrder(50)
note(`${small.qty} x ${small.sku} — total ${small.placed.json.total}`)
check(
  'a small order is routed by the rule, not the threshold',
  small.placed.json.status,
  'PENDING_APPROVAL'
)

const smallId = small.placed.json.id
const routed = await call('GET', `/approvals/orders/${smallId}`, {
  token: head,
})
check(
  '  and this one does have an approval record',
  routed.status,
  200,
  `${routed.json.steps?.length} step(s)`
)

const step = routed.json.steps?.find((s) => s.status === 'PENDING')

// approval_steps carries a CHECK that a refusal has a comment; the DTO refuses
// first. Both are meant to hold.
const noReason = await call('POST', `/approvals/steps/${step.id}`, {
  token: head,
  body: { decision: 'REJECTED' },
})
check('a rejection without a reason is refused', noReason.status, 400)

const rejected = await call('POST', `/approvals/steps/${step.id}`, {
  token: head,
  body: { decision: 'REJECTED', comment: 'Not this quarter' },
})
check('reject it, with a reason', rejected.status, 201)

const rejectedOrder = await call('GET', `/orders/${smallId}`, { token: site })
check('  the order is REJECTED', rejectedOrder.json.status, 'REJECTED')
check(
  '  and the reservation was released',
  rejectedOrder.json.stockState ?? 'RELEASED',
  'RELEASED'
)

check(
  'delete the rule',
  (await call('DELETE', `/approvals/rules/${rule.json.id}`, { token: admin }))
    .status,
  204
)

// ---------------------------------------------------------------------------
console.log('\n--- admin: accounts, sites, settings ---')

const accounts = await call('GET', '/accounts', { token: admin })
check(
  'an admin lists every account',
  accounts.status,
  200,
  `${accounts.json.items?.length} account(s)`
)
check(
  '  head office cannot',
  (await call('GET', '/accounts', { token: head })).status,
  403
)

const code = `ADM-${Date.now().toString().slice(-6)}`
const newSite = await call('POST', '/sites', {
  token: admin,
  body: {
    code,
    name: 'Admin smoke branch',
    poRequired: false,
    addresses: [
      {
        kind: 'SHIPPING',
        line1: '1 Test Street',
        city: 'Leeds',
        postcode: 'LS1 1AA',
        country: 'GB',
        isDefault: true,
      },
    ],
  },
})
check('create a site with an address', newSite.status, 201)
check('  the address came back', newSite.json.addresses?.length, 1)

const dupSite = await call('POST', '/sites', {
  token: admin,
  body: { code, name: 'Duplicate', poRequired: false, addresses: [] },
})
check('a duplicate site code is a 409, not a 500', dupSite.status, 409)

check(
  'deactivate it',
  (await call('DELETE', `/sites/${newSite.json.id}`, { token: admin })).status,
  204
)

const settings = await call('GET', '/settings', { token: admin })
check(
  'settings read',
  settings.status,
  200,
  `${settings.json.settings?.currency ?? settings.json.currency} / ${settings.json.settings?.timezone ?? settings.json.timezone}`
)

const tz = settings.json.settings?.timezone ?? settings.json.timezone
const patched = await call('PATCH', '/settings', {
  token: admin,
  body: { timezone: 'Australia/Melbourne' },
})
check(
  'settings patch',
  patched.status,
  200,
  `timezone=${patched.json.settings?.timezone ?? patched.json.timezone}`
)
await call('PATCH', '/settings', { token: admin, body: { timezone: tz } })
note(`timezone restored to ${tz}`)

// ---------------------------------------------------------------------------
console.log('\n--- admin: users and permission grants ---')

const users = await call('GET', '/users', { token: admin })
check('list users', users.status, 200, `${users.json.items?.length} user(s)`)

const target = users.json.items.find((u) => u.login === 'dev.siteuser')

const mine = await call('GET', '/users/me/permissions', { token: head })
check(
  'my own permissions',
  mine.status,
  200,
  `${mine.json.permissions?.length} held`
)

// The account-wide grant is what the filtered unique index had to preserve: a
// NULL resourceId is not constrained, so the service finds and branches rather
// than upserting. Under a plain SQL Server unique index this would have been
// one row for the whole table.
const grant1 = await call('POST', `/users/${target.id}/permissions`, {
  token: admin,
  body: { permission: 'APPROVAL_ACT', effect: 'ALLOW', reason: 'smoke' },
})
check('grant an account-wide permission (NULL resourceId)', grant1.status, 201)

const grant2 = await call('POST', `/users/${target.id}/permissions`, {
  token: admin,
  body: { permission: 'APPROVAL_ACT', effect: 'DENY', reason: 'smoke again' },
})
check(
  '  granting it again updates rather than duplicating',
  grant2.json.id,
  grant1.json.id,
  `effect now ${grant2.json.effect}`
)

const scoped = await call('POST', `/users/${target.id}/permissions`, {
  token: admin,
  body: { permission: 'APPROVAL_ACT', effect: 'ALLOW', resourceId: 'site-123' },
})
check('  a resource-scoped grant is a separate row', scoped.status, 201)
check('    with its own id', scoped.json.id !== grant1.json.id, true)

const grants = await call('GET', `/users/${target.id}/permissions`, {
  token: admin,
})
const count = grants.json.grants?.length ?? grants.json.items?.length ?? 0
check('list the grants', grants.status, 200, `${count} grant(s)`)

for (const body of [
  { permission: 'APPROVAL_ACT' },
  { permission: 'APPROVAL_ACT', resourceId: 'site-123' },
]) {
  await call('DELETE', `/users/${target.id}/permissions`, {
    token: admin,
    body,
  })
}
note('grants revoked')

const me = (await call('GET', '/auth/me', { token: admin })).json
const myId = me.user?.id ?? me.id
check(
  'you cannot change your own role',
  (
    await call('PATCH', `/users/${myId}`, {
      token: admin,
      body: { role: 'SITE_USER' },
    })
  ).status,
  422
)
check(
  'you cannot deactivate yourself',
  (await call('DELETE', `/users/${myId}`, { token: admin })).status,
  422
)

// ---------------------------------------------------------------------------
console.log('\n--- cleanup ---')
for (const id of placedOrders) {
  const o = await call('GET', `/orders/${id}`, { token: admin })
  if (['REJECTED', 'CANCELLED', 'DELIVERED'].includes(o.json.status)) continue
  const cancelled = await call('POST', `/orders/${id}/status`, {
    token: admin,
    body: { status: 'CANCELLED', comment: 'Smoke test cleanup' },
  })
  note(
    `${o.json.orderNumber}: ${o.json.status} → ${cancelled.json.status ?? cancelled.status} (releases its reservation)`
  )
}

console.log(`\n${pass} passed, ${fail} failed`)

// Exit non-zero on failure, so `npm run verify` and any CI running this can
// tell. Without it the script prints its failures and then reports success,
// which is worse than having no check at all.
process.exit(fail === 0 ? 0 : 1)
