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
  const ok = actual === expected
  if (ok) pass++
  else fail++
  console.log(
    `${ok ? 'PASS' : 'FAIL'}  ${label}  (got ${JSON.stringify(actual)}, want ${JSON.stringify(expected)}) ${extra}`
  )
  return ok
}

function note(text) {
  console.log(`      ${text}`)
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
const head = await login('dev.headoffice')
const site = await login('dev.siteuser')

// ---------------------------------------------------------------------------
console.log('--- cart ---')

await call('DELETE', '/cart', { token: site })

/**
 * Every basket line is a design now, so the line is built from a template
 * rather than from a product.
 *
 * Adding a bare product is refused with `TEMPLATE_REQUIRED` — what a job costs
 * is decided by the design printed on it, so a product on its own has nothing
 * to price against. These are the same two calls the storefront makes: the
 * library, then the customiser, which is where a version id comes from. Done
 * over HTTP rather than against the database so this check still means
 * something when `BASE_URL` points at a deployed environment.
 */
async function orderableDesign() {
  const templates = (
    await call('GET', '/templates?status=PUBLISHED&pageSize=50', {
      token: site,
    })
  ).json.items

  for (const summary of templates ?? []) {
    if (!summary.productId) continue

    // The customiser answers 404 for a template this account may not use, so
    // an unusable one is skipped rather than failing the run.
    const customiser = await call(`GET`, `/templates/${summary.id}/customise`, {
      token: site,
    })
    if (customiser.status !== 200) continue

    const product = (
      await call('GET', `/catalog/products/${customiser.json.productId}`, {
        token: site,
      })
    ).json
    if (product?.status !== 'ACTIVE') continue

    return { template: customiser.json, product }
  }

  console.error('No published design on an orderable product to order from.')
  process.exit(1)
}

const { template, product: detail } = await orderableDesign()
const p = detail
note(
  `using ${p.sku} via design ${template.code} v${template.version} — ` +
    `moq ${p.moq}, multiple ${p.orderMultiple}, stock ${p.stockOnHand}`
)
// A variant with stock, not simply the first one. This script dispatches what it
// orders, so the variant it used last time has less on the shelf than it did --
// pinning to variants[0] made the run succeed once and then fail for ever.
const variant = detail.variants
  ?.slice()
  .sort((a, b) => b.stockOnHand - a.stockOnHand)[0]
note(
  variant
    ? `configurable, so choosing ${variant.sku} (${variant.stockOnHand} on the shelf)`
    : 'no options to choose'
)

const qtyWanted = Math.max(p.moq, 10)

// Put on the shelf exactly what this run is about to take off it.
//
// The check orders and then dispatches, and dispatch consumes stock for good —
// so without this the seeded catalogue drains a little on every run and the
// suite eventually fails against a system that is working perfectly. Topping up
// first makes the net effect zero and the check repeatable, and it uses the
// ordinary adjustment endpoint rather than reaching into the table.
if (variant) {
  const shortfall = qtyWanted - variant.stockOnHand
  if (shortfall > 0) {
    await call('POST', `/catalog/products/${p.id}/stock`, {
      token: admin,
      body: {
        variantId: variant.id,
        delta: shortfall,
        reason: 'verify-order-flow: restocking what this run will consume',
      },
    })
    note(`topped ${variant.sku} up by ${shortfall} so the run nets out`)
  }
}

const added = await call('POST', '/cart/lines', {
  token: site,
  body: {
    productId: p.id,
    ...(variant ? { variantId: variant.id } : {}),
    quantity: qtyWanted,
    templateId: template.templateId,
    templateVersionId: template.versionId,
    customisation: {},
  },
})
check('add a line', added.status, 201, `${added.json.lines?.length} line(s)`)

const cart = await call('GET', '/cart', { token: site })
check('read the cart back', cart.status, 200, `subtotal=${cart.json.subtotal}`)

const validated = await call('POST', '/cart/validate', { token: site })
check(
  'validate',
  validated.status,
  201,
  `ok=${validated.json.valid ?? validated.json.isValid}`
)

// ---------------------------------------------------------------------------
console.log('\n--- checkout ---')

const sites = (await call('GET', '/sites', { token: admin })).json.items
const mySite = sites.find((s) => s.addresses?.length > 0) ?? sites[0]
const ship =
  mySite.addresses?.find((a) => a.kind === 'SHIPPING') ?? mySite.addresses?.[0]

// The branch enforces its own purchase-order prefix, so the reference has to
// start with it — the API says so in the validate response rather than making
// anyone guess.
const po = `${mySite.poPrefix ?? 'PO'}-FLOW-${Date.now().toString().slice(-5)}`
const details = await call('PATCH', '/cart/checkout-details', {
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
check('checkout details', details.status, 200)

const session = await call('POST', '/cart/checkout-session', { token: site })
check(
  'checkout session',
  session.status,
  201,
  `total=${session.json.total} approval=${session.json.requiresApproval}`
)

// A line naming a variant reserves against that variant, not the product, so
// that is where the counts move. The variant view does not expose
// stockReserved, so the reservation -- which is the race-safety mechanism and
// worth proving -- is read from the row.
const { PrismaClient } = await import('@prisma/client')
const db = new PrismaClient()
const stockOf = async () => {
  if (variant) {
    const v = await db.productVariant.findUnique({
      where: { id: variant.id },
      select: { stockOnHand: true, stockReserved: true },
    })
    return { onHand: v.stockOnHand, reserved: v.stockReserved }
  }
  const d = (await call('GET', `/catalog/products/${p.id}`, { token: admin }))
    .json
  return { onHand: d.stockOnHand, reserved: d.stockReserved }
}
const stockBefore = await stockOf()

// ---------------------------------------------------------------------------
console.log('\n--- order ---')

const placed = await call('POST', '/orders', {
  token: site,
  body: { poNumber: po, acceptTerms: true },
})
check(
  'place the order',
  placed.status,
  201,
  `number=${placed.json.orderNumber}`
)
check(
  '  the order number came from the sequence',
  /^ORD-\d{4}-\d{6}$/.test(placed.json.orderNumber ?? ''),
  true
)

const orderId = placed.json.id
const qty = placed.json.lines?.[0]?.quantity ?? 0

const stockAfter = await stockOf()
check(
  '  stock was reserved, not consumed',
  stockAfter.reserved - stockBefore.reserved,
  qty,
  `reserved ${stockBefore.reserved} → ${stockAfter.reserved}`
)
check(
  '  and the shelf count is untouched',
  stockAfter.onHand,
  stockBefore.onHand
)

const fetched = await call('GET', `/orders/${orderId}`, { token: site })
check(
  'read the order back',
  fetched.status,
  200,
  `status=${fetched.json.status}`
)
check(
  '  the shipping snapshot survived the JSON round trip',
  typeof fetched.json.shippingAddress === 'object' &&
    fetched.json.shippingAddress !== null,
  true,
  `city=${fetched.json.shippingAddress?.city}`
)

// ---------------------------------------------------------------------------
console.log('\n--- approvals ---')

const pending = await call('GET', '/approvals', { token: head })
check(
  'the approvals queue answers',
  pending.status,
  200,
  `${pending.json.items?.length ?? 0} awaiting`
)

const mine = await call('GET', `/approvals/orders/${orderId}`, { token: head })
if (mine.status === 200 && mine.json.steps?.length) {
  note(
    `order needs ${mine.json.steps.length} step(s); currentTier=${mine.json.currentTier}`
  )
  const step = mine.json.steps.find((s) => s.status === 'PENDING')
  if (step) {
    const decided = await call('POST', `/approvals/steps/${step.id}`, {
      token: head,
      body: { decision: 'APPROVED', comment: 'Flow smoke' },
    })
    check(
      'approve the step (approval_steps RLS reaches through the request)',
      decided.status,
      201,
      `status=${decided.json.status}`
    )
  }
} else {
  /**
   * No approval record is what a threshold hold looks like.
   *
   * `Account.approvalThreshold` is enforced through the ordinary status
   * transition rather than through approval steps — steps come from rules — so
   * an order over it is still PENDING_APPROVAL and still has to be released
   * before anything downstream can happen. Reading the absent record as "no
   * approval required" is what used to leave this run trying to dispatch a
   * held order and calling the refusal a stock fault.
   */
  const held = await call('GET', `/orders/${orderId}`, { token: head })
  if (held.json?.status === 'PENDING_APPROVAL') {
    const released = await call('POST', `/orders/${orderId}/status`, {
      token: head,
      body: {
        status: 'APPROVED',
        reason: 'Flow smoke: released a hold over the account threshold',
      },
    })
    check('release the threshold hold', released.json?.status, 'APPROVED')
  } else {
    note(`no approval required for this total (${mine.status})`)
  }
}

// ---------------------------------------------------------------------------
console.log('\n--- fulfilment ---')

for (const next of ['PROCESSING', 'DISPATCHED']) {
  const moved = await call('POST', `/orders/${orderId}/status`, {
    token: admin,
    body: {
      status: next,
      ...(next === 'DISPATCHED'
        ? { carrier: 'DHL', trackingNumber: 'FLOW1' }
        : {}),
    },
  })
  if (moved.status === 201) {
    check(`status → ${next}`, moved.json.status, next)
  } else {
    note(
      `status → ${next} refused (${moved.status}: ${moved.json.error?.message ?? ''})`
    )
  }
}

const stockShipped = await stockOf()
check(
  'dispatch consumed the shelf count',
  stockBefore.onHand - stockShipped.onHand,
  qty,
  `onHand ${stockBefore.onHand} → ${stockShipped.onHand}`
)
check(
  '  and released the reservation',
  stockShipped.reserved,
  stockBefore.reserved
)

// ---------------------------------------------------------------------------
console.log('\n--- billing ---')

const period = new Date().toISOString().slice(0, 7)
const periodView = await call('GET', `/billing/periods/${period}`, {
  token: admin,
})
check(
  'read the billing period',
  periodView.status,
  200,
  `${periodView.json.accounts?.length ?? 0} account(s) billable`
)

const generated = await call('POST', '/billing/invoices/generate', {
  token: admin,
  body: { billingPeriod: period },
})
check(
  'generate the invoice',
  generated.status,
  201,
  `status=${generated.json.status} number=${generated.json.invoiceNumber ?? '(draft)'}`
)
check('  a draft carries no number', generated.json.invoiceNumber, null)

const invoiceId = generated.json.id
const issued = await call('POST', `/billing/invoices/${invoiceId}/issue`, {
  token: admin,
  body: { dueInDays: 30 },
})
check(
  'issue it (MERGE ... HOLDLOCK allocates the number)',
  issued.status,
  201,
  `number=${issued.json.invoiceNumber}`
)
check(
  '  and the number is gapless and formatted',
  /^INV-\d{4}-\d{6}$/.test(issued.json.invoiceNumber ?? ''),
  true
)

const csv = await call('GET', `/billing/invoices/${invoiceId}/csv`, {
  token: admin,
})
check('csv export', csv.status, 200)

// ---------------------------------------------------------------------------
console.log('\n--- templates (the JSON-heaviest module) ---')

const templates = await call('GET', '/templates?limit=5', { token: admin })
check(
  'list templates',
  templates.status,
  200,
  `${templates.json.items?.length ?? 0} found`
)

const made = await call('POST', '/templates', {
  token: admin,
  body: {
    code: `FLOW-${Date.now().toString().slice(-8)}`,
    name: 'Flow smoke template',
    orientation: 'PORTRAIT',
    widthValue: 210,
    heightValue: 297,
    dimensionUnit: 'MM',
    bleedMargin: 3,
    safeMargin: 5,
    canvasConfig: { background: '#ffffff', grid: true },
    layers: [{ id: 'l1', type: 'text', text: 'Hello' }],
    // Publishing is the moment a design has to have a price — a draft may be
    // half-built, but what is put in front of a buyer may not be unpriced. No
    // product is attached, so there is no pack size for these to disagree with.
    price: 25,
    unitsPerPack: 1,
  },
})
check(
  'create a template (canvasConfig + layers as JSON text)',
  made.status,
  201,
  `id=${made.json.id}`
)

const tplId = made.json.id
// The summary a create returns deliberately carries no design document; the
// detail view is where the JSON columns are read back.
const full = await call('GET', `/templates/${tplId}`, { token: admin })
check(
  '  canvasConfig decoded on the detail view',
  full.json.canvasConfig?.background,
  '#ffffff'
)
check(
  '  layers decoded',
  Array.isArray(full.json.layers) && full.json.layers.length,
  1
)
const versioned = await call('POST', `/templates/${tplId}/versions`, {
  token: admin,
  body: { label: 'Flow snapshot' },
})
check('snapshot a version (the snapshot column)', versioned.status, 201)

const published = await call('POST', `/templates/${tplId}/publish`, {
  token: admin,
  body: { label: 'Flow smoke publish' },
})
check('publish it', published.status, 201, `status=${published.json.status}`)

// The duplicate endpoint used to be what proved the JSON columns survive a
// round trip through a second write. With it gone, a re-read after the publish
// asks the same question of the original.
const afterPublish = await call('GET', `/templates/${tplId}`, { token: admin })
check(
  '  canvasConfig survives the publish',
  afterPublish.json.canvasConfig?.background,
  '#ffffff'
)

// ---------------------------------------------------------------------------
console.log('\n--- cleanup ---')
if (tplId) await call('DELETE', `/templates/${tplId}`, { token: admin })
note(
  'orders, invoices and stock movements are left in place — they are history'
)

console.log(`\n${pass} passed, ${fail} failed`)

// Exit non-zero on failure, so `npm run verify` and any CI running this can
// tell. Without it the script prints its failures and then reports success,
// which is worse than having no check at all.
process.exit(fail === 0 ? 0 : 1)
