// src/lib/data-source/mock/mock-pricing.adapter.ts
import initialRateCards from './fixtures/rate-cards.json'
import type { RateCard, PaginatedResult } from '@/types'
import { simulateLatency, paginate } from './utils'

let rateCardsStore: RateCard[] = JSON.parse(JSON.stringify(initialRateCards))

export async function list(params?: {
  accountId?: string
  search?: string
  status?: RateCard['status']
  page?: number
  pageSize?: number
}): Promise<PaginatedResult<RateCard>> {
  await simulateLatency()
  let results = [...rateCardsStore]

  if (params?.accountId) {
    results = results.filter((rc) => rc.accountId === params.accountId)
  }

  if (params?.status) {
    results = results.filter((rc) => rc.status === params.status)
  }

  if (params?.search) {
    const q = params.search.toLowerCase()
    results = results.filter(
      (rc) =>
        rc.name.toLowerCase().includes(q) ||
        rc.accountName.toLowerCase().includes(q)
    )
  }

  return paginate(results, params?.page ?? 1, params?.pageSize ?? 20)
}

export async function getById(id: string): Promise<RateCard | null> {
  await simulateLatency()
  const rc = rateCardsStore.find((r) => r.id === id)
  return rc ? JSON.parse(JSON.stringify(rc)) : null
}

export async function getByAccountId(
  accountId: string
): Promise<RateCard | null> {
  await simulateLatency()
  const rc = rateCardsStore.find(
    (r) => r.accountId === accountId && r.status === 'ACTIVE'
  )
  return rc ? JSON.parse(JSON.stringify(rc)) : null
}

export async function create(
  input: Omit<RateCard, 'id' | 'itemCount'>
): Promise<RateCard> {
  await simulateLatency()
  const newRateCard: RateCard = {
    ...input,
    id: `rc-${Date.now()}`,
    itemCount: input.items?.length || 0,
  }
  rateCardsStore.unshift(newRateCard)
  return JSON.parse(JSON.stringify(newRateCard))
}

export async function update(
  id: string,
  input: Partial<RateCard>
): Promise<RateCard> {
  await simulateLatency()
  const idx = rateCardsStore.findIndex((rc) => rc.id === id)
  if (idx === -1) {
    throw new Error(`Rate card with ID "${id}" not found`)
  }

  const updated: RateCard = {
    ...rateCardsStore[idx],
    ...input,
    itemCount: input.items ? input.items.length : rateCardsStore[idx].itemCount,
  }

  rateCardsStore[idx] = updated
  return JSON.parse(JSON.stringify(updated))
}

export async function calculateItemPrice(
  productId: string,
  basePrice: number,
  accountId?: string
): Promise<{
  effectivePrice: number
  discountPct: number
  rateCardName?: string
}> {
  await simulateLatency(50)
  if (!accountId) {
    return { effectivePrice: basePrice, discountPct: 0 }
  }

  const rateCard = rateCardsStore.find(
    (rc) => rc.accountId === accountId && rc.status === 'ACTIVE'
  )
  if (!rateCard) {
    return { effectivePrice: basePrice, discountPct: 0 }
  }

  const override = rateCard.items.find((item) => item.productId === productId)
  if (override) {
    if (override.fixedPrice !== undefined && override.fixedPrice !== null) {
      const discountPct = Number(
        (((basePrice - override.fixedPrice) / basePrice) * 100).toFixed(1)
      )
      return {
        effectivePrice: override.fixedPrice,
        discountPct,
        rateCardName: rateCard.name,
      }
    }
    if (override.discountPct) {
      const effectivePrice = Number(
        (basePrice * (1 - override.discountPct / 100)).toFixed(2)
      )
      return {
        effectivePrice,
        discountPct: override.discountPct,
        rateCardName: rateCard.name,
      }
    }
  }

  if (rateCard.defaultDiscountPct > 0) {
    const effectivePrice = Number(
      (basePrice * (1 - rateCard.defaultDiscountPct / 100)).toFixed(2)
    )
    return {
      effectivePrice,
      discountPct: rateCard.defaultDiscountPct,
      rateCardName: rateCard.name,
    }
  }

  return {
    effectivePrice: basePrice,
    discountPct: 0,
    rateCardName: rateCard.name,
  }
}
