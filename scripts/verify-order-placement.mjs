/**
 * Checks what `POST /orders` promises about placing a basket, through the API.
 *
 *   node --env-file-if-exists=.env scripts/verify-order-placement.mjs
 *   BASE_URL=https://portal.example.com node scripts/verify-order-placement.mjs
 *
 * Needs the application answering and the seeded dev users. Places three orders
 * for dev.siteuser. Everything it changes to get there — branch budgets, the
 * account's "require delivery notes" setting, two approval rules — is put back
 * before it exits, including when a check fails.
 *
 * What it proves, in order: the checkout session says whether delivery notes and
 * approval are needed; an order without required notes is refused with the same
 * issue shape as a basket refusal; notes sent on placement land on the order;
 * sending the same basket again answers 200 with the same order; a basket id that
 * is not the current basket is refused; two submits at the same moment make one
 * order; the approval preview matches the steps placement creates; and approving
 * through the status route decides those steps one tier at a time, refusing an
 * approver no open step is addressed to.
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

function errorOf(res) {
  return res.json?.error
    ? `${res.json.error.code}: ${res.json.error.message}`
    : ''
}

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
if (!template) {
  console.error(
    'No published, all-accounts template on an active product to order from.'
  )
  process.exit(1)
}

const sites = (await call('GET', '/sites', { token: admin })).json.items
const mySite = sites.find((s) => s.addresses?.length > 0) ?? sites[0]
const ship =
  mySite.addresses?.find((a) => a.kind === 'SHIPPING') ?? mySite.addresses?.[0]

/** An open basket for dev.siteuser with one line, ready for checkout. */
async function freshBasket(label) {
  await call('DELETE', '/cart', { token: site })

  const product = (
    await call('GET', `/catalog/products/${template.productId}`, {
      token: site,
    })
  ).json
  const variant = product.variants
    ?.slice()
    .sort((a, b) => b.stockOnHand - a.stockOnHand)[0]
  const quantity = Math.max(product.moq ?? 1, product.orderMultiple ?? 1)

  const onShelf = variant ? variant.stockOnHand : product.stockOnHand
  if (product.trackInventory && onShelf < quantity) {
    await call('POST', `/catalog/products/${product.id}/stock`, {
      token: admin,
      body: {
        ...(variant ? { variantId: variant.id } : {}),
        delta: quantity - onShelf,
        reason: 'verify-order-placement: restocking what this run will consume',
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
  if (added.status !== 201) {
    note(`${label}: could not add a line — ${errorOf(added)}`)
  }

  const po = `${mySite.poPrefix ?? 'PO'}-PLC-${Date.now().toString().slice(-6)}`
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

  const session = await call('POST', '/cart/checkout-session', { token: site })
  if (session.status !== 201) {
    note(
      `${label}: checkout session ${session.status} — ${JSON.stringify(session.json?.error?.details ?? session.json).slice(0, 600)}`
    )
  }
  return { session, po }
}

// Everything this run changes, so `finally` can put it back.
const capped = sites.filter((s) => s.monthlyBudget != null)
let accountId = null
let settingsRow = null
let createdSettings = false
const createdRules = []

try {
  for (const s of capped) {
    await call('PATCH', `/sites/${s.id}`, {
      token: admin,
      body: { monthlyBudget: null },
    })
  }

  // -------------------------------------------------------------------------
  console.log('--- delivery notes ---')

  const first = await freshBasket('first basket')
  check('checkout session', first.session.status, 201)
  const cartId = first.session.json?.cart?.id
  accountId = (
    await db.cart.findUnique({
      where: { id: cartId },
      select: { accountId: true },
    })
  ).accountId

  settingsRow = await db.accountSettings.findUnique({
    where: { accountId },
    select: { id: true, requireDeliveryNotes: true },
  })
  if (settingsRow) {
    await db.accountSettings.update({
      where: { accountId },
      data: { requireDeliveryNotes: true },
    })
  } else {
    await db.accountSettings.create({
      data: { accountId, requireDeliveryNotes: true },
    })
    createdSettings = true
  }

  const required = await call('POST', '/cart/checkout-session', {
    token: site,
  })
  check(
    'the session says delivery notes are required',
    required.json?.deliveryNotesRequired,
    true
  )
  check(
    '  and carries an approval preview',
    typeof required.json?.approval?.required,
    'boolean',
    JSON.stringify(required.json?.approval)
  )

  const noNotes = await call('POST', '/orders', {
    token: site,
    body: { poNumber: first.po, acceptTerms: true, cartId },
  })
  check('placing without notes is refused', noNotes.status, 422)
  check(
    '  as a basket issue',
    noNotes.json?.error?.details?.issues?.[0]?.code,
    'DELIVERY_NOTES_REQUIRED'
  )

  const blank = await call('POST', '/orders', {
    token: site,
    body: {
      poNumber: first.po,
      acceptTerms: true,
      cartId,
      deliveryNotes: '  ',
    },
  })
  check('  whitespace does not count as notes', blank.status, 422)

  // -------------------------------------------------------------------------
  console.log('\n--- placing once ---')

  const stale = await call('POST', '/orders', {
    token: site,
    body: {
      poNumber: first.po,
      acceptTerms: true,
      cartId: 'cart_not_the_current_one',
      deliveryNotes: 'Leave at reception',
    },
  })
  check(
    'a basket id that is not the current basket is refused',
    stale.status,
    409,
    errorOf(stale)
  )
  check(
    '  naming the current basket',
    stale.json?.error?.details?.currentCartId,
    cartId
  )

  const placed = await call('POST', '/orders', {
    token: site,
    body: {
      poNumber: first.po,
      acceptTerms: true,
      cartId,
      deliveryNotes: 'Leave at reception',
    },
  })
  check(
    'place the order',
    placed.status,
    201,
    `number=${placed.json?.orderNumber} ${errorOf(placed)}`
  )
  check(
    '  the delivery notes are on it',
    placed.json?.deliveryNotes,
    'Leave at reception'
  )

  const again = await call('POST', '/orders', {
    token: site,
    body: {
      poNumber: first.po,
      acceptTerms: true,
      cartId,
      deliveryNotes: 'Leave at reception',
    },
  })
  check('sending the same basket again answers 200', again.status, 200)
  check('  with the same order', again.json?.id, placed.json?.id)

  const madeFromIt = await db.order.count({ where: { cartId } })
  check('  and the basket became one order', madeFromIt, 1)

  // Off again: the rest of the run is about placement, not notes.
  await db.accountSettings.update({
    where: { accountId },
    data: { requireDeliveryNotes: settingsRow?.requireDeliveryNotes ?? false },
  })

  // -------------------------------------------------------------------------
  console.log('\n--- two submits at once ---')

  const second = await freshBasket('second basket')
  const secondCart = second.session.json?.cart?.id
  const body = { poNumber: second.po, acceptTerms: true, cartId: secondCart }
  const [a, b] = await Promise.all([
    call('POST', '/orders', { token: site, body }),
    call('POST', '/orders', { token: site, body }),
  ])
  note(
    `statuses ${a.status} / ${b.status} ${errorOf(a)} ${errorOf(b)}`.trimEnd()
  )
  check(
    'one created, the other answered with it',
    [a.status, b.status].sort().join(','),
    '200,201'
  )
  check('  the same order both times', a.json?.id, b.json?.id)
  check(
    '  and only one order exists for the basket',
    await db.order.count({ where: { cartId: secondCart } }),
    1
  )

  // -------------------------------------------------------------------------
  console.log('\n--- approval preview and the status route ---')

  const ruleBase = {
    minTotal: '0',
    siteId: second.session.json?.cart?.site?.id,
    description: 'verify-order-placement: removed when the run ends',
  }
  for (const rule of [
    { name: 'Verify placement tier 1', tier: 1, approverRole: 'HEAD_OFFICE' },
    { name: 'Verify placement tier 2', tier: 2, approverRole: 'ADMIN' },
  ]) {
    const created = await call('POST', '/approvals/rules', {
      token: head,
      body: { ...ruleBase, ...rule },
    })
    check(`create rule "${rule.name}"`, created.status, 201, errorOf(created))
    if (created.json?.id) createdRules.push(created.json.id)
  }

  const third = await freshBasket('third basket')
  const preview = third.session.json?.approval
  check('the preview says approval is needed', preview?.required, true)
  check('  by rule', preview?.reason, 'RULES')
  note(`preview steps: ${JSON.stringify(preview?.steps)}`)

  const pending = await call('POST', '/orders', {
    token: site,
    body: {
      poNumber: third.po,
      acceptTerms: true,
      cartId: third.session.json?.cart?.id,
    },
  })
  check(
    'placed and held for approval',
    pending.json?.status,
    'PENDING_APPROVAL',
    errorOf(pending)
  )
  const orderId = pending.json?.id

  const request = await call('GET', `/approvals/orders/${orderId}`, {
    token: head,
  })
  const describe = (steps) =>
    (steps ?? [])
      .map((s) => `${s.tier}:${s.approverUserId ?? s.approverRole}`)
      .sort()
      .join(' ')
  check(
    '  the steps created are the steps previewed',
    describe(request.json?.steps),
    describe(preview?.steps)
  )

  const tokenFor = { HEAD_OFFICE: head, ADMIN: admin }
  const tiers = [...new Set((preview?.steps ?? []).map((s) => s.tier))].sort(
    (x, y) => x - y
  )
  const lastTier = tiers.at(-1)

  const early = await call('POST', `/orders/${orderId}/status`, {
    token: site,
    body: { status: 'APPROVED' },
  })
  check('a buyer cannot approve through the status route', early.status, 403)

  let current = pending.json
  for (const tier of tiers) {
    const steps = (preview?.steps ?? []).filter((s) => s.tier === tier)
    for (const step of steps) {
      const token = tokenFor[step.approverRole]
      if (!token) {
        note(`tier ${tier}: no test user for ${JSON.stringify(step)}; stopping`)
        break
      }
      const decided = await call('POST', `/orders/${orderId}/status`, {
        token,
        body: { status: 'APPROVED', reason: `Verify tier ${tier}` },
      })
      check(
        `tier ${tier} approved by ${step.approverRole} through the status route`,
        decided.status,
        201,
        errorOf(decided)
      )
      current = decided.json ?? current
    }

    if (tier !== lastTier) {
      check(
        `  the order is still waiting after tier ${tier}`,
        current?.status,
        'PENDING_APPROVAL'
      )
      if (tier === 1) {
        // Tier 2 is the admin's now. Head office has nothing open.
        const notYours = await call('POST', `/orders/${orderId}/status`, {
          token: head,
          body: { status: 'APPROVED' },
        })
        check(
          '  head office is refused a step addressed to someone else',
          notYours.status,
          403
        )
        check(
          '  and told which step is open',
          notYours.json?.error?.details?.openSteps?.[0]?.approverRole,
          'ADMIN'
        )
      }
    }
  }

  check('approved once every tier is decided', current?.status, 'APPROVED')
  const decidedRequest = await call('GET', `/approvals/orders/${orderId}`, {
    token: head,
  })
  check(
    '  the approval request is approved too',
    decidedRequest.json?.status,
    'APPROVED'
  )
  check(
    '  with no step left pending',
    decidedRequest.json?.steps?.filter((s) => s.status === 'PENDING').length,
    0
  )
} finally {
  for (const id of createdRules) {
    await call('DELETE', `/approvals/rules/${id}`, { token: head })
  }
  if (createdRules.length > 0) note(`removed ${createdRules.length} rule(s)`)

  if (createdSettings && accountId) {
    await db.accountSettings.deleteMany({ where: { accountId } })
  } else if (settingsRow) {
    await db.accountSettings.update({
      where: { id: settingsRow.id },
      data: { requireDeliveryNotes: settingsRow.requireDeliveryNotes },
    })
  }

  for (const s of capped) {
    await call('PATCH', `/sites/${s.id}`, {
      token: admin,
      body: { monthlyBudget: s.monthlyBudget },
    })
  }
  if (capped.length > 0)
    note(`branch budgets restored: ${capped.map((s) => s.code).join(', ')}`)

  await db.$disconnect()
}

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail === 0 ? 0 : 1)
