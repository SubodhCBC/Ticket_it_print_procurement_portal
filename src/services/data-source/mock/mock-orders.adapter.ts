// src/lib/data-source/mock/mock-orders.adapter.ts
import initialOrders from './fixtures/orders.json'
import type { Order, OrderStatus, PaginatedResult } from '@/types'
import { simulateLatency, paginate } from './utils'

let ordersStore: Order[] = JSON.parse(JSON.stringify(initialOrders))

export async function list(params?: {
  page?: number
  pageSize?: number
  status?: OrderStatus | 'ALL'
  siteId?: string
  accountId?: string
  search?: string
  startDate?: string
  endDate?: string
}): Promise<PaginatedResult<Order>> {
  await simulateLatency()
  let results = [...ordersStore]

  if (params?.status && params.status !== 'ALL') {
    results = results.filter((o) => o.status === params.status)
  }

  if (params?.siteId) {
    results = results.filter((o) => o.siteId === params.siteId)
  }

  if (params?.accountId) {
    results = results.filter((o) => o.accountId === params.accountId)
  }

  if (params?.search) {
    const q = params.search.toLowerCase().trim()
    results = results.filter(
      (o) =>
        o.orderNumber.toLowerCase().includes(q) ||
        (o.poReference && o.poReference.toLowerCase().includes(q)) ||
        o.siteName.toLowerCase().includes(q) ||
        o.siteCode.toLowerCase().includes(q) ||
        o.userName.toLowerCase().includes(q) ||
        (o.trackingNumber && o.trackingNumber.toLowerCase().includes(q)) ||
        o.lineItems.some(
          (item) =>
            item.productName.toLowerCase().includes(q) ||
            item.sku.toLowerCase().includes(q)
        )
    )
  }

  // Sort newest first
  results.sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  )

  return paginate(results, params?.page ?? 1, params?.pageSize ?? 20)
}

export async function getById(id: string): Promise<Order | null> {
  await simulateLatency()
  const order = ordersStore.find((o) => o.id === id || o.orderNumber === id)
  return order ? JSON.parse(JSON.stringify(order)) : null
}

export async function create(
  input: Omit<
    Order,
    'id' | 'orderNumber' | 'createdAt' | 'updatedAt' | 'itemCount'
  >
): Promise<Order> {
  await simulateLatency()

  const totalAmount = input.lineItems.reduce(
    (sum, item) => sum + item.lineTotal,
    0
  )
  const itemCount = input.lineItems.reduce((sum, item) => sum + item.qty, 0)
  const now = new Date().toISOString()
  const orderNumber = `ORD-2026-${Math.floor(1000 + Math.random() * 9000)}`

  const newOrder: Order = {
    ...input,
    id: `ord-${Date.now()}`,
    orderNumber,
    totalAmount,
    itemCount,
    status: input.status || 'RECEIVED',
    createdAt: now,
    updatedAt: now,
  }

  ordersStore.unshift(newOrder)
  return JSON.parse(JSON.stringify(newOrder))
}

export async function updateStatus(
  id: string,
  newStatus: OrderStatus,
  metadata?: {
    carrier?: string
    trackingNumber?: string
    deliveryNotes?: string
  }
): Promise<Order> {
  await simulateLatency()
  const idx = ordersStore.findIndex((o) => o.id === id || o.orderNumber === id)
  if (idx === -1) {
    throw new Error(`Order with ID "${id}" not found`)
  }

  const now = new Date().toISOString()
  const current = ordersStore[idx]

  const updated: Order = {
    ...current,
    status: newStatus,
    updatedAt: now,
    carrier: metadata?.carrier ?? current.carrier,
    trackingNumber: metadata?.trackingNumber ?? current.trackingNumber,
    deliveryNotes: metadata?.deliveryNotes ?? current.deliveryNotes,
  }

  if (newStatus === 'DISPATCHED' && !updated.dispatchedAt) {
    updated.dispatchedAt = now
    if (!updated.carrier) updated.carrier = 'Rahhawan Direct Logistics'
    if (!updated.trackingNumber)
      updated.trackingNumber = `RH-EXP-${Math.floor(10000 + Math.random() * 90000)}`
  } else if (newStatus === 'DELIVERED' && !updated.deliveredAt) {
    updated.deliveredAt = now
  }

  ordersStore[idx] = updated
  return JSON.parse(JSON.stringify(updated))
}

export async function updateDetails(
  id: string,
  details: Partial<Omit<Order, 'id' | 'orderNumber' | 'lineItems'>>
): Promise<Order> {
  await simulateLatency()
  const idx = ordersStore.findIndex((o) => o.id === id || o.orderNumber === id)
  if (idx === -1) {
    throw new Error(`Order with ID "${id}" not found`)
  }

  ordersStore[idx] = {
    ...ordersStore[idx],
    ...details,
    updatedAt: new Date().toISOString(),
  }

  return JSON.parse(JSON.stringify(ordersStore[idx]))
}

export async function approveOrder(
  id: string,
  approverName: string,
  notes?: string
): Promise<Order> {
  await simulateLatency()
  const idx = ordersStore.findIndex((o) => o.id === id || o.orderNumber === id)
  if (idx === -1) {
    throw new Error(`Order with ID "${id}" not found`)
  }

  const now = new Date().toISOString()
  const current = ordersStore[idx]
  const history = current.statusHistory || []

  const updated: Order = {
    ...current,
    status: 'APPROVED',
    paymentStatus: 'PAYMENT_PENDING',
    approvedBy: approverName,
    approvedAt: now,
    approvalNotes: notes || 'Approved by Head Office Controller',
    updatedAt: now,
    statusHistory: [
      ...history,
      {
        status: 'APPROVED',
        timestamp: now,
        actorName: approverName,
        actorRole: 'HEAD_OFFICE',
        comment: notes || 'Approved for procurement',
      },
    ],
  }

  ordersStore[idx] = updated
  return JSON.parse(JSON.stringify(updated))
}

export async function requestChanges(
  id: string,
  approverName: string,
  notes: string
): Promise<Order> {
  await simulateLatency()
  const idx = ordersStore.findIndex((o) => o.id === id || o.orderNumber === id)
  if (idx === -1) {
    throw new Error(`Order with ID "${id}" not found`)
  }

  const now = new Date().toISOString()
  const current = ordersStore[idx]
  const history = current.statusHistory || []

  const updated: Order = {
    ...current,
    status: 'CHANGES_REQUESTED',
    changesRequestedNotes: notes,
    updatedAt: now,
    statusHistory: [
      ...history,
      {
        status: 'CHANGES_REQUESTED',
        timestamp: now,
        actorName: approverName,
        actorRole: 'HEAD_OFFICE',
        comment: notes,
      },
    ],
  }

  ordersStore[idx] = updated
  return JSON.parse(JSON.stringify(updated))
}

export async function payOrder(
  id: string,
  paymentMethod: Order['paymentMethod'] = 'CORPORATE_INVOICE',
  paymentRef?: string,
  paidBy: string = 'Elena Rostova (Head Office)'
): Promise<Order> {
  await simulateLatency()
  const idx = ordersStore.findIndex((o) => o.id === id || o.orderNumber === id)
  if (idx === -1) {
    throw new Error(`Order with ID "${id}" not found`)
  }

  const now = new Date().toISOString()
  const current = ordersStore[idx]
  const history = current.statusHistory || []
  const ref = paymentRef || `CORP-TXN-${Date.now().toString().slice(-6)}`

  const updated: Order = {
    ...current,
    status: 'IN_PRODUCTION',
    paymentStatus: 'PAID',
    paymentMethod,
    paymentReference: ref,
    paidBy,
    paidAt: now,
    updatedAt: now,
    statusHistory: [
      ...history,
      {
        status: 'PAID',
        timestamp: now,
        actorName: paidBy,
        actorRole: 'HEAD_OFFICE',
        comment: `Corporate payment settled via ${paymentMethod.replace(/_/g, ' ')} (${ref}). Production started.`,
      },
    ],
  }

  ordersStore[idx] = updated
  return JSON.parse(JSON.stringify(updated))
}

export async function rejectOrder(
  id: string,
  approverName: string,
  reason: string
): Promise<Order> {
  await simulateLatency()
  const idx = ordersStore.findIndex((o) => o.id === id || o.orderNumber === id)
  if (idx === -1) {
    throw new Error(`Order with ID "${id}" not found`)
  }

  const now = new Date().toISOString()
  const current = ordersStore[idx]
  const history = current.statusHistory || []

  const updated: Order = {
    ...current,
    status: 'REJECTED',
    approvedBy: approverName,
    approvedAt: now,
    rejectedReason: reason || 'Budget allocation cap exceeded for this site',
    updatedAt: now,
    statusHistory: [
      ...history,
      {
        status: 'REJECTED',
        timestamp: now,
        actorName: approverName,
        actorRole: 'HEAD_OFFICE',
        comment: reason,
      },
    ],
  }

  ordersStore[idx] = updated
  return JSON.parse(JSON.stringify(updated))
}
