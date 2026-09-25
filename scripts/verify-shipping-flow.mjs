/**
 * Walks the NZ Post shipping flow end to end through the API.
 *
 *   node --env-file-if-exists=.env scripts/verify-shipping-flow.mjs
 *   BASE_URL=https://portal.example.com node scripts/verify-shipping-flow.mjs
 *   SHIPPING_VERIFY_WAIT_FOR_DELIVERY=true ...    # also wait ~5 minutes for
 *                                                 # mock tracking to deliver
 *
 * Meant for NZPOST_MODE=mock, where every address, rate, label, pickup and scan
 * comes from the built-in fake and nothing reaches NZ Post. It refuses to run
 * against live mode: it books a pickup, and a courier would come.
 *
 * Needs the application answering and the worker running — labels are made by
 * the worker.
 *
 * What it proves, in order: a buyer can validate an address, see rates, choose a
 * service and a collection point; the choice is frozen onto the placed order and
 * its quote stays out of the total, which carries only the flat delivery charge
 * the buyer picked at checkout; a label cannot be requested before production;
 * dispatch is refused with no label; a label is made, stored and downloadable;
 * a second label is refused while one is live; dispatch takes its tracking number
 * from the label; a dispatched label cannot be voided; a pickup can be booked;
 * tracking answers; and, when asked to wait, NZ Post's delivery scan moves the
 * order to DELIVERED.
 */
const BASE_URL = process.env.BASE_URL ?? 'http://localhost:3100'
const B = `${BASE_URL}/api/v1`
const WAIT_FOR_DELIVERY =
  process.env.SHIPPING_VERIFY_WAIT_FOR_DELIVERY === 'true'

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

function errorOf(res) {
  return res.json?.error
    ? `${res.json.error.code}: ${res.json.error.message}`
    : ''
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

async function login(who) {
  const res = await call('POST', '/auth/login', {
    body: { login: who, password: 'Password123!' },
  })
  if (res.status !== 200 || !res.json?.accessToken) {
    console.error(`Could not sign in as ${who} — ${res.status} ${errorOf(res)}`)
    process.exit(1)
  }
  return res.json.accessToken
}

const admin = await login('dev.admin')
const head = await login('dev.headoffice')
const site = await login('dev.siteuser')

// ---------------------------------------------------------------------------
console.log('--- integration status ---')

const status = await call('GET', '/shipping/status', { token: admin })
check('status answers', status.status, 200, `mode=${status.json?.mode}`)
if (status.json?.mode !== 'mock') {
  console.error(
    `\nNZPOST_MODE is "${status.json?.mode}". This check books a courier pickup and ` +
      'must only run against mock mode.'
  )
  process.exit(1)
}
check(
  '  a buyer cannot read it',
  (await call('GET', '/shipping/status', { token: site })).status,
  403
)

// ---------------------------------------------------------------------------
console.log('\n--- basket ---')

await call('DELETE', '/cart', { token: site })
// A previous run's delivery choice survives on the open basket; start clean so
// the "no address yet" check means what it says.
await call('DELETE', '/cart/shipping', { token: site })

// Every new basket line is a design (template pricing), so the line is built
// from a published template every account can see, on an orderable product.
const { PrismaClient } = await import('@prisma/client')
const db = new PrismaClient()
const template = await db.template.findFirst({
  where: {
    status: 'PUBLISHED',
    deletedAt: null,
    visibility: 'ALL_ACCOUNTS',
    productId: { not: null },
    publishedVersionId: { not: null },
    product: { status: 'ACTIVE', deletedAt: null },
  },
  select: { id: true, code: true, productId: true, publishedVersionId: true },
})
await db.$disconnect()
if (!template) {
  console.error(
    'No published, all-accounts template on an active product to order from.'
  )
  process.exit(1)
}

const detail = (
  await call('GET', `/catalog/products/${template.productId}`, { token: site })
).json
const product = detail
const variant = detail.variants
  ?.slice()
  .sort((a, b) => b.stockOnHand - a.stockOnHand)[0]
const quantity = Math.max(product.moq ?? 1, product.orderMultiple ?? 1)

// Put back what this run will take off the shelf, as the order-flow check does.
const onShelf = variant ? variant.stockOnHand : product.stockOnHand
if (product.trackInventory && onShelf < quantity) {
  await call('POST', `/catalog/products/${product.id}/stock`, {
    token: admin,
    body: {
      ...(variant ? { variantId: variant.id } : {}),
      delta: quantity - onShelf,
      reason: 'verify-shipping-flow: restocking what this run will consume',
    },
  })
}

const added = await call('POST', '/cart/lines', {
  token: site,
  body: {
    productId: product.id,
    ...(variant ? { variantId: variant.id } : {}),
    quantity,
    templateId: template.id,
    templateVersionId: template.publishedVersionId,
    customisation: {},
  },
})
check(
  'add a line',
  added.status,
  201,
  `${product.sku} x${quantity} design ${template.code} ${errorOf(added)}`
)
if (added.status !== 201) {
  note(JSON.stringify(added.json?.error?.details ?? added.json).slice(0, 600))
}

// ---------------------------------------------------------------------------
console.log('\n--- checkout: NZ Post address, rates, collection point ---')

check(
  'address search refuses three characters',
  (await call('GET', '/shipping/addresses?q=151', { token: site })).status,
  400
)

const found = await call('GET', '/shipping/addresses?q=151%20Victoria', {
  token: site,
})
check(
  'address search',
  found.status,
  200,
  `${found.json.items?.length ?? 0} suggestion(s)`
)
const suggestion =
  found.json.items?.find((row) => row.fullAddress.includes('Remuera')) ??
  found.json.items?.[0]

const beforeAddress = await call('GET', '/cart/shipping/options', {
  token: site,
})
check('options before an address is refused', beforeAddress.status, 422)

const chosen = await call('PUT', '/cart/shipping/address', {
  token: site,
  body: { addressId: suggestion.addressId },
})
check(
  'choose the address',
  chosen.status,
  200,
  chosen.json.selection?.fullAddress ?? errorOf(chosen)
)
check(
  '  split into parts by NZ Post',
  chosen.json.selection?.deliveryAddress?.street,
  'Victoria Avenue'
)
check('  and never billed', chosen.json.selection?.freightBilled, false)

const options = await call('GET', '/cart/shipping/options', { token: site })
check(
  'rates',
  options.status,
  200,
  `source=${options.json.source} options=${options.json.options?.length}`
)
check('  from NZ Post (the mock)', options.json.source, 'NZPOST')
note(
  `parcel estimate ${options.json.parcelEstimate?.weightGrams} g; missing weights: ${options.json.parcelEstimate?.missingWeightSkus?.join(', ') || 'none'}`
)

const service =
  options.json.options?.find((row) => row.serviceCode === 'CPOLP') ??
  options.json.options?.[0]
check(
  'choosing an unknown service is refused',
  (
    await call('PUT', '/cart/shipping/service', {
      token: site,
      body: { serviceCode: 'NOPE' },
    })
  ).status,
  422
)

const points = await call('GET', '/cart/shipping/collection-points?count=3', {
  token: site,
})
check(
  'collection points',
  points.status,
  200,
  `${points.json.items?.length ?? 0} near`
)
const collect = await call('PUT', '/cart/shipping/collection-point', {
  token: site,
  body: { collectionPointId: points.json.items?.[0]?.id },
})
check(
  'choose a collection point',
  collect.json?.selection?.deliveryKind,
  'COLLECTION'
)
const back = await call('PUT', '/cart/shipping/collection-point', {
  token: site,
  body: { collectionPointId: null },
})
check(
  '  and go back to the address',
  back.json?.selection?.deliveryKind,
  'ADDRESS'
)

const picked = await call('PUT', '/cart/shipping/service', {
  token: site,
  body: { serviceCode: service.serviceCode },
})
check(
  'choose the service',
  picked.status,
  200,
  `${picked.json.selection?.service?.code} ${picked.json.selection?.service?.priceInclGst}`
)
check(
  '  the price came from the carrier, not the client',
  picked.json.selection?.service?.priceInclGst,
  service.totalInclGst
)

// ---------------------------------------------------------------------------
console.log('\n--- order ---')

const sites = (await call('GET', '/sites', { token: admin })).json.items
const mySite = sites.find((s) => s.addresses?.length > 0) ?? sites[0]
const ship =
  mySite.addresses?.find((a) => a.kind === 'SHIPPING') ?? mySite.addresses?.[0]
const po = `${mySite.poPrefix ?? 'PO'}-SHIP-${Date.now().toString().slice(-5)}`

await call('PATCH', '/cart/checkout-details', {
  token: site,
  body: {
    shippingAddressId: ship.id,
    poNumber: po,
    paymentMethod: 'NET_30_INVOICE',
    shippingMethod: 'STANDARD_PARCEL',
    acceptTerms: true,
  },
})
// Every run places an order, and on a long-lived database the branch's monthly
// cap fills up — then the refusal is the budget rule doing its job, not a
// shipping fault. Lifted only around placement and put straight back, the same
// trade `verify-all.mjs` makes for the whole suite.
const capped = sites.filter((s) => s.monthlyBudget != null)
for (const s of capped) {
  await call('PATCH', `/sites/${s.id}`, {
    token: admin,
    body: { monthlyBudget: null },
  })
}

const session = await call('POST', '/cart/checkout-session', { token: site })
check('checkout session', session.status, 201, errorOf(session))
if (session.status !== 201) {
  note(
    JSON.stringify(session.json?.error?.details ?? session.json).slice(0, 800)
  )
}

const placed = await call('POST', '/orders', {
  token: site,
  body: { poNumber: po, acceptTerms: true },
})

for (const s of capped) {
  await call('PATCH', `/sites/${s.id}`, {
    token: admin,
    body: { monthlyBudget: s.monthlyBudget },
  })
}
if (capped.length > 0)
  note(
    `branch budgets lifted for placement and restored: ${capped.map((s) => s.code).join(', ')}`
  )

check(
  'place the order',
  placed.status,
  201,
  `number=${placed.json.orderNumber}`
)
const orderId = placed.json.id

// Everything after this acts on the order. Without one, every later check would
// fail for the same reason and bury it.
if (!orderId) {
  console.log(`\n${pass} passed, ${fail} failed — stopped: no order to fulfil`)
  process.exit(1)
}

check(
  '  the delivery choice was frozen onto it',
  placed.json.shipping?.service?.code,
  service.serviceCode
)
// Two numbers, two meanings. The flat delivery charge the buyer picked is what
// the branch is invoiced and is in the total; the NZ Post quote is the client's
// own freight cost on its account and is only recorded.
check('  the flat delivery charge is on it', placed.json.shippingCost, '6.50')
check(
  '  the total is lines plus that charge, not the NZ Post quote',
  placed.json.total,
  (Number(placed.json.subtotal) + Number(placed.json.shippingCost)).toFixed(2)
)

// Approval, when this total needs it.
const approval = await call('GET', `/approvals/orders/${orderId}`, {
  token: head,
})
for (const step of approval.json?.steps?.filter(
  (s) => s.status === 'PENDING'
) ?? []) {
  await call('POST', `/approvals/steps/${step.id}`, {
    token: head,
    body: { decision: 'APPROVED', comment: 'Shipping flow' },
  })
}

const parcels = [
  {
    weightKg: 1.25,
    lengthCm: 32,
    widthCm: 24,
    heightCm: 12,
    description: 'Box 1',
  },
]

const tooEarly = await call('POST', `/orders/${orderId}/shipments`, {
  token: admin,
  body: { parcels },
})
check(
  'a label before production is refused',
  tooEarly.status,
  422,
  errorOf(tooEarly)
)

check(
  'status → PROCESSING',
  (
    await call('POST', `/orders/${orderId}/status`, {
      token: admin,
      body: { status: 'PROCESSING' },
    })
  ).json.status,
  'PROCESSING'
)

const noLabel = await call('POST', `/orders/${orderId}/status`, {
  token: admin,
  body: { status: 'DISPATCHED' },
})
check(
  'dispatch with no label and no carrier is refused',
  noLabel.status,
  422,
  errorOf(noLabel)
)

// ---------------------------------------------------------------------------
console.log('\n--- label ---')

check(
  'a buyer cannot request a label',
  (
    await call('POST', `/orders/${orderId}/shipments`, {
      token: site,
      body: { parcels },
    })
  ).status,
  403
)

const key = `verify-${Date.now()}`
const requested = await call('POST', `/orders/${orderId}/shipments`, {
  token: admin,
  body: { parcels, idempotencyKey: key },
})
check(
  'request the label',
  requested.status,
  201,
  `status=${requested.json.status} ${errorOf(requested)}`
)
const shipmentId = requested.json.id

const replay = await call('POST', `/orders/${orderId}/shipments`, {
  token: admin,
  body: { parcels, idempotencyKey: key },
})
check(
  '  the same idempotency key returns the same shipment',
  replay.json?.id,
  shipmentId,
  `(${replay.status})`
)

const second = await call('POST', `/orders/${orderId}/shipments`, {
  token: admin,
  body: { parcels },
})
check('  a second label while one is live is refused', second.status, 409)

let shipment = requested.json
for (
  let i = 0;
  i < 30 && !['LABELLED', 'FAILED'].includes(shipment.status);
  i += 1
) {
  await sleep(1_000)
  shipment = (
    await call('GET', `/orders/${orderId}/shipments/${shipmentId}`, {
      token: admin,
    })
  ).json
}
check(
  'the worker made the label',
  shipment.status,
  'LABELLED',
  `consignment=${shipment.consignmentId} ${shipment.lastError ?? ''}`
)
check(
  '  the parcel has a tracking reference',
  Boolean(shipment.parcels?.[0]?.trackingReference),
  true,
  shipment.parcels?.[0]?.trackingReference ?? ''
)

const link = await call(
  'GET',
  `/orders/${orderId}/shipments/${shipmentId}/label`,
  { token: admin }
)
check(
  'label download link',
  link.status,
  200,
  link.json?.filename ?? errorOf(link)
)
if (link.status === 200) {
  const pdf = await fetch(link.json.url)
  const head4 = Buffer.from(await pdf.arrayBuffer())
    .subarray(0, 4)
    .toString('latin1')
  check('  the link serves a PDF', head4, '%PDF', `(${pdf.status})`)
}

// ---------------------------------------------------------------------------
console.log('\n--- dispatch and pickup ---')

const dispatched = await call('POST', `/orders/${orderId}/status`, {
  token: admin,
  body: { status: 'DISPATCHED' },
})
check(
  'dispatch without typing a tracking number',
  dispatched.status,
  201,
  errorOf(dispatched)
)
check(
  '  the tracking number came from the label',
  dispatched.json.trackingNumber,
  shipment.parcels?.[0]?.trackingReference
)
check(
  '  the carrier is NZ Post',
  dispatched.json.carrier,
  'NZ Post (CourierPost)'
)

const lateVoid = await call(
  'POST',
  `/orders/${orderId}/shipments/${shipmentId}/void`,
  {
    token: admin,
    body: { reason: 'Trying to void after dispatch' },
  }
)
check('a dispatched label cannot be voided', lateVoid.status, 422)

const pickup = await call('POST', '/shipping/pickups', {
  token: admin,
  body: {
    pickupAt: new Date(Date.now() + 2 * 60 * 60_000).toISOString(),
    shipmentIds: [shipmentId],
    instructions: 'Verify script — mock only',
  },
})
check(
  'book a pickup',
  pickup.status,
  201,
  `status=${pickup.json?.status} job=${pickup.json?.carrierJobId} ${errorOf(pickup)}`
)
check(
  '  the shipment is on it',
  pickup.json?.shipmentIds?.includes(shipmentId),
  true
)

const queue = await call(
  'GET',
  '/shipping/shipments?status=LABELLED&pageSize=5',
  { token: admin }
)
check('fulfilment queue', queue.status, 200, `${queue.json.total} labelled`)

// ---------------------------------------------------------------------------
console.log('\n--- tracking ---')

const tracking = await call('GET', `/orders/${orderId}/tracking`, {
  token: site,
})
check(
  'the buyer can read tracking',
  tracking.status,
  200,
  `${tracking.json.events?.length ?? 0} event(s), refreshQueued=${tracking.json.refreshQueued}`
)

const orderView = await call('GET', `/orders/${orderId}`, { token: site })
check(
  'the order view carries its shipments',
  orderView.json.shipments?.length,
  1
)

if (WAIT_FOR_DELIVERY) {
  note(
    'waiting for the mock delivery scan (about four minutes after labelling)…'
  )
  let delivered = null
  for (let i = 0; i < 40; i += 1) {
    await sleep(10_000)
    const refreshed = await call(
      'POST',
      `/orders/${orderId}/tracking/refresh`,
      { token: admin }
    )
    const current = await call('GET', `/orders/${orderId}`, { token: admin })
    if (current.json.status === 'DELIVERED') {
      delivered = current.json
      note(`refresh: ${JSON.stringify(refreshed.json)}`)
      break
    }
  }
  check(
    'NZ Post delivery moved the order to DELIVERED',
    delivered?.status,
    'DELIVERED'
  )
  const timeline = delivered?.history?.at(-1)
  check('  recorded as the system', timeline?.actorName, 'System (NZ Post)')
  const events = await call('GET', `/orders/${orderId}/tracking`, {
    token: site,
  })
  check(
    '  and the delivered event is on the timeline',
    events.json.events?.some((e) => e.isDelivered),
    true,
    `${events.json.events?.length} event(s)`
  )
} else {
  note(
    'set SHIPPING_VERIFY_WAIT_FOR_DELIVERY=true to wait for the mock delivery scan'
  )
}

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail === 0 ? 0 : 1)
