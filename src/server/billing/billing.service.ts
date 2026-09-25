import { Prisma } from '@prisma/client'
import { AuditAction } from '../audit/audit.actions'
import { changesBetween, created } from '../audit/audit-changes'
import { recordAudit } from '../audit/audit.service'
// The pure period helpers, not the cart service: that would pull its whole
// dependency chain in for two date functions.
import { billingPeriodRange } from '../cart/budget'
import { Role, type AuthenticatedActor } from '../context/request-context'
import { prisma, withTenantScope, type TransactionClient } from '../db/client'
import {
  BusinessRuleError,
  ConflictError,
  NotFoundError,
} from '../utils/errors'
import { findShippingMethod } from '../cart/shipping-methods'
import { createId } from '../utils/ids'
import {
  DEFAULT_TAX_BASIS,
  taxOn,
  totalWithTax,
  type TaxBasis,
} from './invoice-tax'
import { offsetPage, toSkipTake, type OffsetPage } from '../utils/pagination'
import type {
  GenerateInvoiceDto,
  IssueInvoiceDto,
  ListInvoicesQueryDto,
  MarkInvoicePaidDto,
  VoidInvoiceDto,
} from './invoice.validation'

const FULL_INVOICE = Prisma.validator<Prisma.InvoiceInclude>()({
  account: {
    select: { id: true, accountCode: true, name: true, contactEmail: true },
  },
  lines: {
    orderBy: [{ siteCode: 'asc' }, { orderedAt: 'asc' }],
    include: { items: { orderBy: { sequence: 'asc' } } },
  },
})

export type FullInvoice = Prisma.InvoiceGetPayload<{
  include: typeof FULL_INVOICE
}>

const INVOICE_SUMMARY = Prisma.validator<Prisma.InvoiceInclude>()({
  account: {
    select: { id: true, accountCode: true, name: true, contactEmail: true },
  },
  _count: { select: { lines: true } },
})

export type InvoiceSummary = Prisma.InvoiceGetPayload<{
  include: typeof INVOICE_SUMMARY
}>

/** The statuses whose orders are billable: the goods have left the building. */
const BILLABLE_ORDER_STATUSES = ['DISPATCHED', 'DELIVERED'] as const

/** What the billing explorer's KPI cards show for one period. */
export interface PeriodSummary {
  readonly billingPeriod: string
  readonly totalSpend: string
  readonly invoicedTotal: string
  readonly unbilledTotal: string
  readonly sitesBilled: number
  readonly invoicedOrders: number
  readonly unbilledOrders: number
  readonly invoices: {
    readonly draft: number
    readonly issued: number
    readonly paid: number
    readonly void: number
  }
  readonly settled: boolean
}

/**
 * Consolidated monthly billing.
 *
 * ---------------------------------------------------------------------------
 * Draft, then frozen
 * ---------------------------------------------------------------------------
 * A draft recomputes from the orders on every generation and holds no number.
 * Issuing allocates the number and freezes the lines. After that nothing changes
 * what a customer was billed — a mistake becomes a credit note, which is what a
 * finance team expects and what an auditor will ask for.
 *
 * ---------------------------------------------------------------------------
 * Everything on a line is copied
 * ---------------------------------------------------------------------------
 * The order number, the branch, the cost centre, the purchase order and the
 * amount are all snapshotted. An invoice states what was billed; an order that
 * is corrected next month must not silently restate a figure the customer has
 * already paid against.
 */

// --- Generating -------------------------------------------------------------

/**
 * Builds or rebuilds the draft invoice for one account and period.
 *
 * Rebuilding replaces the lines wholesale rather than merging: an order
 * cancelled since the last run has to disappear from the draft, and a merge that
 * only added would keep billing it.
 */
export async function generateInvoice(
  actor: AuthenticatedActor,
  dto: GenerateInvoiceDto
): Promise<FullInvoice> {
  const accountId = resolveAccount(actor, dto.accountId)
  const { start, end } = billingPeriodRange(dto.billingPeriod)

  const orders = await withTenantScope(accountId, (tx) =>
    tx.order.findMany({
      where: {
        accountId,
        billingPeriod: dto.billingPeriod,
        status: { in: [...BILLABLE_ORDER_STATUSES] },
        // Belt and braces: `billingPeriod` is the authority, but an order whose
        // stamped period disagreed with its own creation date would be a data
        // problem worth not compounding.
        createdAt: { gte: start, lt: end },
      },
      include: {
        site: {
          select: { id: true, code: true, name: true, costCentre: true },
        },
        lines: {
          select: {
            id: true,
            sku: true,
            name: true,
            variantSku: true,
            uom: true,
            packSize: true,
            quantity: true,
            unitPrice: true,
            lineTotal: true,
            taxTreatment: true,
            notes: true,
          },
          orderBy: { createdAt: 'asc' },
        },
      },
      orderBy: { createdAt: 'asc' },
    })
  )

  const basis = await taxBasisFor(accountId)

  // An order already frozen onto an issued invoice must never be billed twice,
  // however many times this is run.
  const alreadyBilled = await withTenantScope(accountId, (tx) =>
    tx.invoiceLine.findMany({
      where: {
        orderId: { in: orders.map((order) => order.id) },
        invoice: { status: { in: ['ISSUED', 'PAID'] } },
      },
      select: { orderId: true },
    })
  )
  const billed = new Set(alreadyBilled.map((line) => line.orderId))
  const billable = orders.filter((order) => !billed.has(order.id))

  // Every order broken into what was billed on it, taxed item by item. Built
  // before the transaction: it is arithmetic on rows already read.
  const billedOrders = billable.map((order) => billedItems(order, basis))

  const subtotal = billable.reduce(
    (total, order) => total.plus(order.total),
    new Prisma.Decimal(0)
  )
  const tax = billedOrders.reduce(
    (total, order) => total.plus(order.tax),
    new Prisma.Decimal(0)
  )
  const total = totalWithTax(subtotal, tax, basis)
  const siteCount = new Set(billable.map((order) => order.siteId)).size

  let previousDraft: InvoiceAuditRow | null = null
  const invoice = await withTenantScope(accountId, async (tx) => {
    // The whole row, not just the id: regenerating a draft overwrites its
    // figures, and the audit entry shows what they were.
    const existing = await tx.invoice.findFirst({
      where: { accountId, billingPeriod: dto.billingPeriod, status: 'DRAFT' },
      include: { lines: { select: { orderNumber: true } } },
    })
    previousDraft = existing ? invoiceForAudit(existing) : null

    const invoiceId = existing?.id ?? createId('inv')

    if (existing) {
      await tx.invoiceLine.deleteMany({ where: { invoiceId } })
      await tx.invoice.update({
        where: { id: invoiceId },
        data: {
          subtotal,
          tax,
          total,
          taxRatePercent: basis.ratePercent,
          pricesIncludeTax: basis.pricesIncludeTax,
          orderCount: billable.length,
          siteCount,
          notes: dto.notes ?? null,
        },
      })
    } else {
      await tx.invoice.create({
        data: {
          id: invoiceId,
          accountId,
          billingPeriod: dto.billingPeriod,
          status: 'DRAFT',
          subtotal,
          tax,
          total,
          taxRatePercent: basis.ratePercent,
          pricesIncludeTax: basis.pricesIncludeTax,
          orderCount: billable.length,
          siteCount,
          notes: dto.notes ?? null,
        },
      })
    }

    if (billable.length > 0) {
      const lineIds = billable.map(() => createId('ivl'))

      await tx.invoiceLine.createMany({
        data: billable.map((order, index) => ({
          id: lineIds[index],
          invoiceId,
          orderId: order.id,
          orderNumber: order.orderNumber,
          orderedAt: order.createdAt,
          siteId: order.siteId,
          siteCode: order.site.code,
          siteName: order.site.name,
          costCentre: order.site.costCentre,
          poNumber: order.poNumber,
          campaignCode: order.campaignCode,
          // SOW B-05 pairs it with the PO on the backing file. Copied now, like
          // every other column here, so a later edit to the order cannot change
          // what an issued invoice says.
          customerReference: order.customerReference,
          // Already JSON on the order, copied as-is: re-encoding would rewrite a
          // snapshot nobody changed (SOW F-15, B-09).
          billingSnapshot: order.billingSnapshot,
          // B-04, B-08, B-10 and B-11, frozen with the rest.
          placedByName: order.placedByName,
          placedByEmail: order.placedByEmail,
          placedByRole: order.placedByRole,
          shippingSnapshot: order.shippingSnapshot,
          recipientName: order.recipientName,
          deliveryNotes: order.deliveryNotes,
          orderNotes: order.notes,
          orderStatus: order.status,
          trackingNumber: order.trackingNumber,
          itemCount: order.lines.length,
          amount: order.total,
          tax: billedOrders[index].tax,
        })),
      })

      await tx.invoiceLineItem.createMany({
        data: billedOrders.flatMap(({ items }, index) =>
          items.map((item, sequence) => ({
            id: createId('ivi'),
            accountId,
            invoiceId,
            invoiceLineId: lineIds[index],
            sequence: sequence + 1,
            ...item,
          }))
        ),
      })
    }

    return tx.invoice.findFirstOrThrow({
      where: { id: invoiceId },
      include: FULL_INVOICE,
    })
  })

  await recordAudit({
    action: AuditAction.INVOICE_GENERATED,
    entityType: 'ACCOUNT',
    entityId: accountId,
    entityName: `${dto.billingPeriod} draft`,
    accountId,
    changes: previousDraft
      ? changesBetween(
          previousDraft,
          invoiceForAudit(invoice),
          INVOICE_AUDIT_FIELDS
        )
      : created(invoiceForAudit(invoice), INVOICE_AUDIT_FIELDS),
    details: { invoiceId: invoice.id, skippedAlreadyBilled: billed.size },
  })

  console.info(
    `Drafted ${dto.billingPeriod} for ${accountId}: ${billable.length} orders, ${subtotal.toFixed(2)}.`
  )
  return invoice
}

// --- Items and tax ----------------------------------------------------------

type BillableOrder = Prisma.OrderGetPayload<{
  select: {
    orderNumber: true
    total: true
    shippingCost: true
    shippingMethod: true
    lines: {
      select: {
        id: true
        sku: true
        name: true
        variantSku: true
        uom: true
        packSize: true
        quantity: true
        unitPrice: true
        lineTotal: true
        taxTreatment: true
        notes: true
      }
    }
  }
}>

interface BilledItem {
  readonly orderLineId: string | null
  readonly kind: 'PRODUCT' | 'DELIVERY'
  readonly sku: string
  readonly name: string
  readonly variantSku: string | null
  readonly uom: string | null
  readonly packSize: number | null
  readonly quantity: number
  readonly unitPrice: Prisma.Decimal
  readonly lineValue: Prisma.Decimal
  readonly taxTreatment: string
  readonly taxAmount: Prisma.Decimal
  readonly notes: string | null
}

/**
 * One order as billed: a PRODUCT item per order line and a DELIVERY item for
 * its delivery charge, each taxed.
 *
 * The items must add up to the order's total, or the backing file would not
 * reconcile to the invoice, and a file that is out by a delivery charge is
 * worse than no file because it looks right. Every order is written that way
 * at placement (total = lines + delivery), so a mismatch is a data fault to
 * stop on rather than a rounding difference to paper over.
 */
function billedItems(
  order: BillableOrder,
  basis: TaxBasis
): { items: BilledItem[]; tax: Prisma.Decimal } {
  const items: BilledItem[] = order.lines.map((line) => ({
    orderLineId: line.id,
    kind: 'PRODUCT',
    sku: line.sku,
    name: line.name,
    variantSku: line.variantSku,
    uom: line.uom,
    packSize: line.packSize,
    quantity: line.quantity,
    unitPrice: line.unitPrice,
    lineValue: line.lineTotal,
    taxTreatment: line.taxTreatment,
    taxAmount: taxOn(line.lineTotal, line.taxTreatment, basis),
    notes: line.notes,
  }))

  if (!order.shippingCost.isZero()) {
    const method = findShippingMethod(order.shippingMethod)
    items.push({
      orderLineId: null,
      kind: 'DELIVERY',
      sku: 'DELIVERY',
      // The name the buyer chose it by, so the row reads as what it was.
      name: `Delivery: ${method?.label ?? order.shippingMethod ?? 'charge'}`,
      variantSku: null,
      uom: null,
      packSize: null,
      quantity: 1,
      unitPrice: order.shippingCost,
      lineValue: order.shippingCost,
      // Freight to a New Zealand address is a standard-rated supply.
      taxTreatment: 'STANDARD',
      taxAmount: taxOn(order.shippingCost, 'STANDARD', basis),
      notes: null,
    })
  }

  const itemsTotal = items.reduce(
    (total, item) => total.plus(item.lineValue),
    new Prisma.Decimal(0)
  )
  if (!itemsTotal.equals(order.total)) {
    throw new BusinessRuleError(
      `Order ${order.orderNumber} does not add up: its lines and delivery come to ` +
        `${itemsTotal.toFixed(2)} but its total is ${order.total.toFixed(2)}. ` +
        'It cannot be invoiced until that is corrected.',
      {
        details: {
          orderNumber: order.orderNumber,
          itemsTotal: itemsTotal.toFixed(2),
          orderTotal: order.total.toFixed(2),
        },
      }
    )
  }

  return {
    items,
    tax: items.reduce(
      (total, item) => total.plus(item.taxAmount),
      new Prisma.Decimal(0)
    ),
  }
}

/** The account's GST convention, or New Zealand's defaults when it has none. */
async function taxBasisFor(accountId: string): Promise<TaxBasis> {
  const settings = await withTenantScope(accountId, (tx) =>
    tx.accountSettings.findFirst({
      where: { accountId },
      select: { gstRatePercent: true, pricesIncludeGst: true },
    })
  )
  return settings
    ? {
        ratePercent: settings.gstRatePercent,
        pricesIncludeTax: settings.pricesIncludeGst,
      }
    : DEFAULT_TAX_BASIS
}

// --- Issuing ----------------------------------------------------------------

/**
 * Numbers a draft and freezes it.
 *
 * The number comes from a counter table taken with an upsert that increments
 * under the row lock, not from a sequence: several jurisdictions require invoice
 * numbers to be unbroken, and a sequence does not roll back. The lock that would
 * be unacceptable on checkout costs nothing here, because issuing is an
 * operator's monthly batch rather than a customer's request.
 */
export async function issueInvoice(
  actor: AuthenticatedActor,
  invoiceId: string,
  dto: IssueInvoiceDto
): Promise<FullInvoice> {
  const before = await requireInvoice(actor, invoiceId)

  if (before.status !== 'DRAFT') {
    throw new ConflictError('Only a draft invoice can be issued.', {
      details: { status: before.status, invoiceNumber: before.invoiceNumber },
    })
  }

  if (before.orderCount === 0) {
    // An invoice for nothing is not a zero-value invoice, it is a mistake — and
    // once numbered it cannot be withdrawn without a void.
    throw new BusinessRuleError(
      'This period has no billable orders, so there is nothing to issue.',
      { details: { billingPeriod: before.billingPeriod } }
    )
  }

  const issuedAt = new Date()
  const dueAt = new Date(issuedAt.getTime() + dto.paymentTermDays * 86_400_000)

  const invoice = await withTenantScope(before.accountId, async (tx) => {
    const invoiceNumber = await nextInvoiceNumber(tx, issuedAt)

    await tx.invoice.update({
      where: { id: invoiceId },
      data: { status: 'ISSUED', invoiceNumber, issuedAt, dueAt },
    })

    return tx.invoice.findFirstOrThrow({
      where: { id: invoiceId },
      include: FULL_INVOICE,
    })
  })

  await recordAudit({
    action: AuditAction.INVOICE_ISSUED,
    entityType: 'ACCOUNT',
    entityId: before.accountId,
    entityName: invoice.invoiceNumber ?? invoiceId,
    accountId: before.accountId,
    changes: changesBetween(before, invoice, [
      'status',
      'invoiceNumber',
      'issuedAt',
      'dueAt',
    ]),
    details: { invoiceId, billingPeriod: invoice.billingPeriod },
  })

  console.info(`Issued ${invoice.invoiceNumber} (${invoice.total.toFixed(2)}).`)
  return invoice
}

export async function markInvoicePaid(
  actor: AuthenticatedActor,
  invoiceId: string,
  dto: MarkInvoicePaidDto
): Promise<FullInvoice> {
  const before = await requireInvoice(actor, invoiceId)

  if (before.status !== 'ISSUED') {
    throw new ConflictError(
      before.status === 'PAID'
        ? 'This invoice is already settled.'
        : 'Only an issued invoice can be settled.',
      { details: { status: before.status } }
    )
  }

  const invoice = await withTenantScope(before.accountId, (tx) =>
    tx.invoice.update({
      where: { id: invoiceId },
      data: {
        status: 'PAID',
        paidAt: dto.paidAt ?? new Date(),
        paymentReference: dto.paymentReference ?? null,
      },
      include: FULL_INVOICE,
    })
  )

  await recordAudit({
    action: AuditAction.INVOICE_PAID,
    entityType: 'ACCOUNT',
    entityId: before.accountId,
    entityName: invoice.invoiceNumber ?? invoiceId,
    accountId: before.accountId,
    changes: changesBetween(before, invoice, [
      'status',
      'paidAt',
      'paymentReference',
    ]),
    details: { invoiceId, total: invoice.total.toFixed(2) },
  })

  return invoice
}

/**
 * Cancels an issued invoice.
 *
 * The number is kept. An invoice number that simply disappears is exactly what a
 * tax audit asks about — "voided" is an answer, "missing" is not.
 *
 * Voiding frees the orders to be billed again, which is how a corrected invoice
 * is produced: void, regenerate, reissue.
 */
export async function voidInvoice(
  actor: AuthenticatedActor,
  invoiceId: string,
  dto: VoidInvoiceDto
): Promise<FullInvoice> {
  const before = await requireInvoice(actor, invoiceId)

  if (before.status === 'VOID') {
    throw new ConflictError('This invoice is already void.')
  }
  if (before.status === 'DRAFT') {
    throw new BusinessRuleError(
      'A draft has never been sent to anyone. Regenerate it instead of voiding it.'
    )
  }

  const invoice = await withTenantScope(before.accountId, (tx) =>
    tx.invoice.update({
      where: { id: invoiceId },
      data: { status: 'VOID', voidReason: dto.reason },
      include: FULL_INVOICE,
    })
  )

  await recordAudit({
    action: AuditAction.INVOICE_VOIDED,
    entityType: 'ACCOUNT',
    entityId: before.accountId,
    entityName: invoice.invoiceNumber ?? invoiceId,
    accountId: before.accountId,
    changes: changesBetween(before, invoice, ['status', 'voidReason']),
    details: { invoiceId, total: invoice.total.toFixed(2) },
  })

  console.info(`Voided ${invoice.invoiceNumber}: ${dto.reason}`)
  return invoice
}

// --- Audit ------------------------------------------------------------------

const INVOICE_AUDIT_FIELDS = [
  'billingPeriod',
  'status',
  'subtotal',
  'tax',
  'total',
  'taxRatePercent',
  'pricesIncludeTax',
  'orderCount',
  'siteCount',
  'notes',
  'orderNumbers',
] as const

type InvoiceAuditRow = ReturnType<typeof invoiceForAudit>

/**
 * An invoice with the orders it bills, by number.
 *
 * The order list is the part of a regenerated draft most worth seeing change —
 * an order that dropped off, or one that arrived late — and the invoice's own
 * lines are rewritten on every regeneration, so their ids would say nothing.
 */
function invoiceForAudit<
  T extends {
    billingPeriod: string
    status: string
    subtotal: unknown
    tax: unknown
    total: unknown
    taxRatePercent: unknown
    pricesIncludeTax: boolean
    orderCount: number
    siteCount: number
    notes: string | null
    lines: readonly { orderNumber: string }[]
  },
>(invoice: T) {
  return {
    billingPeriod: invoice.billingPeriod,
    status: invoice.status,
    subtotal: invoice.subtotal,
    tax: invoice.tax,
    total: invoice.total,
    taxRatePercent: invoice.taxRatePercent,
    pricesIncludeTax: invoice.pricesIncludeTax,
    orderCount: invoice.orderCount,
    siteCount: invoice.siteCount,
    notes: invoice.notes,
    orderNumbers: invoice.lines.map((line) => line.orderNumber).sort(),
  }
}

// --- Reading ----------------------------------------------------------------

export async function listInvoices(
  actor: AuthenticatedActor,
  query: ListInvoicesQueryDto
): Promise<OffsetPage<InvoiceSummary>> {
  const accountId =
    actor.role === Role.ADMIN ? (query.accountId ?? null) : actor.accountId

  const clauses: Prisma.InvoiceWhereInput[] = []
  if (accountId) clauses.push({ accountId })
  if (query.status) clauses.push({ status: query.status })
  if (query.billingPeriod) clauses.push({ billingPeriod: query.billingPeriod })
  if (query.search) {
    clauses.push({
      invoiceNumber: { contains: query.search },
    })
  }
  if (query.overdue) {
    // Issued, past its due date, and not yet settled.
    clauses.push({ status: 'ISSUED', dueAt: { lt: new Date() } })
  }

  const where: Prisma.InvoiceWhereInput =
    clauses.length > 0 ? { AND: clauses } : {}
  const { skip, take } = toSkipTake(query)

  const read = async (client: TransactionClient | typeof prisma) =>
    Promise.all([
      client.invoice.findMany({
        where,
        include: INVOICE_SUMMARY,
        orderBy: [{ billingPeriod: 'desc' }, { createdAt: 'desc' }],
        skip,
        take,
      }),
      client.invoice.count({ where }),
    ])

  const [items, total] = accountId
    ? await withTenantScope(accountId, read)
    : await read(prisma)

  return offsetPage(items, total, query)
}

export async function findInvoiceById(
  actor: AuthenticatedActor,
  invoiceId: string
): Promise<FullInvoice> {
  const invoice = await requireInvoice(actor, invoiceId)

  const full = await withTenantScope(invoice.accountId, (tx) =>
    tx.invoice.findFirst({ where: { id: invoiceId }, include: FULL_INVOICE })
  )

  if (!full) throw new NotFoundError('Invoice')
  return full
}

/**
 * The KPI cards on the billing explorer.
 *
 * `unbilled` is the number worth having: orders in the period that have shipped
 * but are not on an issued invoice. Without it, a month can look fully settled
 * while a dozen orders quietly sit outside every invoice.
 */
export async function periodSummary(
  actor: AuthenticatedActor,
  billingPeriod: string,
  accountId?: string
): Promise<PeriodSummary> {
  const scope = resolveAccount(actor, accountId)

  const [invoices, orders, billedLines] = await withTenantScope(scope, (tx) =>
    Promise.all([
      tx.invoice.findMany({
        where: { accountId: scope, billingPeriod },
        select: { status: true, total: true },
      }),
      tx.order.findMany({
        where: {
          accountId: scope,
          billingPeriod,
          status: { in: [...BILLABLE_ORDER_STATUSES] },
        },
        select: { id: true, total: true, siteId: true },
      }),
      tx.invoiceLine.findMany({
        where: {
          invoice: {
            accountId: scope,
            billingPeriod,
            status: { in: ['ISSUED', 'PAID'] },
          },
        },
        select: { orderId: true, siteId: true },
      }),
    ])
  )

  const billedOrderIds = new Set(billedLines.map((line) => line.orderId))
  const unbilled = orders.filter((order) => !billedOrderIds.has(order.id))

  const sum = (rows: { total: Prisma.Decimal }[]) =>
    rows.reduce((total, row) => total.plus(row.total), new Prisma.Decimal(0))

  const live = invoices.filter(
    (invoice) => invoice.status !== 'VOID' && invoice.status !== 'DRAFT'
  )

  return {
    billingPeriod,
    totalSpend: sum(orders).toFixed(2),
    invoicedTotal: sum(live).toFixed(2),
    unbilledTotal: sum(unbilled).toFixed(2),
    sitesBilled: new Set(billedLines.map((line) => line.siteId)).size,
    invoicedOrders: billedOrderIds.size,
    unbilledOrders: unbilled.length,
    invoices: {
      draft: invoices.filter((invoice) => invoice.status === 'DRAFT').length,
      issued: invoices.filter((invoice) => invoice.status === 'ISSUED').length,
      paid: invoices.filter((invoice) => invoice.status === 'PAID').length,
      void: invoices.filter((invoice) => invoice.status === 'VOID').length,
    },
    // Settled means every shipped order is on a paid invoice — not merely that
    // some invoice exists.
    settled:
      orders.length > 0 &&
      unbilled.length === 0 &&
      invoices.filter((invoice) => invoice.status === 'ISSUED').length === 0,
  }
}

// --- Internals --------------------------------------------------------------

/**
 * The next gapless invoice number.
 *
 * The upsert's increment happens under the row lock Postgres takes for the
 * conflicting insert, which serialises two operators issuing at the same
 * instant, and it rolls back with the transaction — so a failed issue hands the
 * number back rather than burning it.
 */
async function nextInvoiceNumber(
  tx: TransactionClient,
  at: Date
): Promise<string> {
  const year = at.getUTCFullYear()

  // PostgreSQL did this with INSERT ... ON CONFLICT DO UPDATE ... RETURNING.
  // MERGE is the SQL Server equivalent, and HOLDLOCK is not optional: without
  // it two concurrent calls for a year that does not exist yet both fall to the
  // NOT MATCHED branch and one fails on the primary key. Holding the range lock
  // makes the second wait and take the MATCHED branch instead.
  //
  // Still inside the caller's transaction, which is the point -- an invoice
  // number must be gapless, so a failed issue has to hand the number back.
  const rows = await tx.$queryRaw<{ lastNumber: number }[]>`
    MERGE "invoice_sequences" WITH (HOLDLOCK) AS target
    USING (VALUES (${year})) AS source ("year")
      ON target."year" = source."year"
    WHEN MATCHED THEN
      UPDATE SET "lastNumber" = target."lastNumber" + 1,
                 "updatedAt" = TODATETIMEOFFSET(SYSUTCDATETIME(), 0)
    WHEN NOT MATCHED THEN
      INSERT ("year", "lastNumber", "updatedAt")
      VALUES (source."year", 1, TODATETIMEOFFSET(SYSUTCDATETIME(), 0))
    OUTPUT inserted."lastNumber";`

  const next = rows[0]?.lastNumber
  if (next === undefined)
    throw new Error('Could not allocate an invoice number.')

  return `INV-${year}-${String(next).padStart(6, '0')}`
}

function resolveAccount(actor: AuthenticatedActor, requested?: string): string {
  if (actor.role === Role.ADMIN && requested) return requested
  return actor.accountId
}

/**
 * Reads the invoice outside any scope, only to learn which account owns it.
 *
 * A customer asking for another account's invoice gets 404: confirming that an
 * invoice number belongs to somebody discloses that they are a customer.
 */
async function requireInvoice(actor: AuthenticatedActor, invoiceId: string) {
  const invoice = await prisma.invoice.findFirst({ where: { id: invoiceId } })
  if (!invoice) throw new NotFoundError('Invoice')
  if (actor.role !== Role.ADMIN && invoice.accountId !== actor.accountId) {
    throw new NotFoundError('Invoice')
  }
  return invoice
}
