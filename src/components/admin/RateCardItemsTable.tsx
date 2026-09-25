// src/components/admin/RateCardItemsTable.tsx
'use client'

import { SkeletonTable } from '@/components/ui/Skeleton'
import React, { useEffect, useState } from 'react'
import { AlertTriangle, Search, Trash2 } from 'lucide-react'
import { RateCardConfirmModal } from '@/components/admin/RateCardConfirmModal'
import { useRateCardAdminMutations, useRateCardItems } from '@/hooks/usePricing'
import { toApiError } from '@/services'
import type { RateCardItemRow } from '@/services/pricing.service'
import type { PriceSource, RateCard } from '@/types'
import { formatMoney, formatNumber } from '@/lib/format'

const PAGE_SIZE = 25

const SOURCE_LABELS: Record<PriceSource, string> = {
  CATALOG_BASE: 'Catalogue price',
  CATALOG_VOLUME_TIER: 'Catalogue tier',
  CONTRACT_FIXED_PRICE: 'Fixed price',
  CONTRACT_VOLUME_TIER: 'Contract tier',
  CONTRACT_ITEM_DISCOUNT: 'Item discount',
  CONTRACT_DEFAULT_DISCOUNT: 'Card default',
}

const thStyle: React.CSSProperties = {
  padding: '10px 14px',
  color: '#A39BB3',
  fontWeight: 500,
  fontSize: '0.74rem',
  whiteSpace: 'nowrap',
}

const tdStyle: React.CSSProperties = {
  padding: '12px 14px',
  verticalAlign: 'top',
}

const mutedBoxStyle: React.CSSProperties = {
  padding: '32px',
  textAlign: 'center',
  color: '#A39BB3',
  fontSize: '0.84rem',
}

/** What was negotiated for the line, in words. */
function describeTerms(item: RateCardItemRow, cardDefault: number): string {
  if (item.fixedPrice != null) return `Fixed ${formatMoney(item.fixedPrice)}`
  if (item.itemDiscountPct != null) return `${item.itemDiscountPct}% off`
  if (item.tiers?.length) return 'Volume tiers only'
  return `Card default (${cardDefault}%)`
}

interface RateCardItemsTableProps {
  rateCard: RateCard
  canManage: boolean
}

/**
 * One card's negotiated lines: server-paged, searchable by product name or SKU.
 *
 * `effectivePrice` is what the line quotes at the product's minimum order
 * quantity, and `source` names the rule that produced it. A line priced above
 * the public catalogue is flagged, not hidden: it is usually a data-entry
 * mistake, and occasionally a real term somebody needs to see.
 */
export function RateCardItemsTable({
  rateCard,
  canManage,
}: RateCardItemsTableProps) {
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)

  // Debounced, so typing a SKU is one request rather than one per keystroke.
  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(searchInput.trim())
      setPage(1)
    }, 300)
    return () => clearTimeout(timer)
  }, [searchInput])

  const { data, isLoading, isFetching, error, refetch } = useRateCardItems(
    rateCard.id,
    { search: search || undefined, page, pageSize: PAGE_SIZE }
  )

  const { removeItem } = useRateCardAdminMutations()
  const [pendingRemove, setPendingRemove] = useState<RateCardItemRow | null>(
    null
  )
  const [removeError, setRemoveError] = useState<string | null>(null)

  const isArchived = rateCard.status === 'ARCHIVED'
  const items = data?.items ?? []
  const total = data?.total ?? 0
  const totalPages = Math.max(1, data?.totalPages ?? 1)
  const firstRow = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1
  const lastRow = Math.min(page * PAGE_SIZE, total)
  const aboveCount = items.filter((item) => item.aboveCatalogPrice).length

  const closeRemove = () => {
    setPendingRemove(null)
    setRemoveError(null)
  }

  const confirmRemove = async () => {
    if (!pendingRemove) return
    setRemoveError(null)
    try {
      await removeItem.mutateAsync({
        rateCardId: rateCard.id,
        productId: pendingRemove.productId,
      })
      // Removing the last row on a later page would leave an empty page.
      if (items.length === 1 && page > 1) setPage(page - 1)
      closeRemove()
    } catch (err) {
      setRemoveError(toApiError(err).message)
    }
  }

  const fallbackText =
    rateCard.defaultDiscountPct > 0
      ? `the card's default ${rateCard.defaultDiscountPct}% discount`
      : 'catalogue price (this card has no default discount)'

  return (
    <div>
      <div
        className="row-wrap"
        style={{
          justifyContent: 'space-between',
          padding: '0 20px 10px',
        }}
      >
        <div style={{ fontSize: '0.84rem', fontWeight: 600, color: '#2B253E' }}>
          Negotiated SKU lines
          {data && (
            <span
              style={{ fontWeight: 500, color: '#A39BB3', marginLeft: '6px' }}
            >
              ({total})
            </span>
          )}
          {isFetching && !isLoading && (
            <span
              style={{
                fontWeight: 500,
                color: '#A39BB3',
                marginLeft: '8px',
                fontSize: '0.74rem',
              }}
            >
              Updating...
            </span>
          )}
        </div>

        <div style={{ position: 'relative', width: '280px', maxWidth: '100%' }}>
          <Search
            size={14}
            color="#A39BB3"
            style={{
              position: 'absolute',
              left: '10px',
              top: '50%',
              transform: 'translateY(-50%)',
            }}
          />
          <input
            type="search"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search by product name or SKU..."
            aria-label="Search rate card lines"
            style={{
              width: '100%',
              padding: '6px 10px 6px 30px',
              borderRadius: '10px',
              border: '1px solid #F0E6EC',
              fontSize: '0.8rem',
              backgroundColor: '#FFFFFF',
              color: '#2B253E',
            }}
          />
        </div>
      </div>

      {aboveCount > 0 && (
        <div
          role="status"
          style={{
            margin: '0 20px 10px',
            padding: '8px 12px',
            borderRadius: '10px',
            backgroundColor: '#FFFBEB',
            color: '#B45309',
            fontSize: '0.78rem',
            fontWeight: 500,
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          }}
        >
          <AlertTriangle size={14} style={{ flexShrink: 0 }} />
          {aboveCount === 1
            ? '1 line on this page prices above the public catalogue price.'
            : `${aboveCount} lines on this page price above the public catalogue price.`}
        </div>
      )}

      {isLoading ? (
        <SkeletonTable rows={5} columns={6} label="Loading negotiated lines" />
      ) : error ? (
        <div style={{ ...mutedBoxStyle, color: '#DC2626' }} role="alert">
          {toApiError(error).message}{' '}
          <button
            type="button"
            onClick={() => void refetch()}
            style={{
              border: 'none',
              background: 'none',
              color: '#F73582',
              fontWeight: 600,
              cursor: 'pointer',
              fontSize: '0.84rem',
            }}
          >
            Retry
          </button>
        </div>
      ) : items.length === 0 ? (
        <div style={mutedBoxStyle}>
          {search
            ? `No lines match "${search}".`
            : `No SKU-level lines on this card. Every product is quoted at ${fallbackText}.`}
        </div>
      ) : (
        <div className="table-scroll">
          <table
            style={{
              width: '100%',
              minWidth: '760px',
              borderCollapse: 'collapse',
              textAlign: 'left',
              fontSize: '0.84rem',
            }}
          >
            <thead>
              <tr>
                <th style={{ ...thStyle, paddingLeft: '20px' }}>Product</th>
                <th style={{ ...thStyle, textAlign: 'right' }}>List price</th>
                <th style={thStyle}>Negotiated terms</th>
                <th style={{ ...thStyle, textAlign: 'right' }}>
                  Effective price
                </th>
                <th style={thStyle}>Price source</th>
                {canManage && (
                  <th style={{ ...thStyle, paddingRight: '20px' }}>
                    <span style={{ position: 'absolute', left: '-9999px' }}>
                      Actions
                    </span>
                  </th>
                )}
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id} style={{ borderTop: '1px solid #F5EEF2' }}>
                  <td style={{ ...tdStyle, paddingLeft: '20px' }}>
                    <div style={{ fontWeight: 600, color: '#2B253E' }}>
                      {item.productName}
                    </div>
                    <div
                      style={{
                        fontFamily: 'monospace',
                        fontSize: '0.74rem',
                        color: '#6E6781',
                        marginTop: '2px',
                      }}
                    >
                      {item.productSku} · {item.uom}
                    </div>
                  </td>
                  <td
                    style={{
                      ...tdStyle,
                      textAlign: 'right',
                      color: '#6E6781',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {formatMoney(item.basePrice)}
                  </td>
                  <td style={{ ...tdStyle, color: '#2B253E' }}>
                    <div>
                      {describeTerms(item, rateCard.defaultDiscountPct)}
                    </div>
                    {item.tiers && item.tiers.length > 0 && (
                      <div
                        style={{
                          fontSize: '0.74rem',
                          color: '#6E6781',
                          marginTop: '2px',
                        }}
                      >
                        {item.tiers
                          .map(
                            (tier) =>
                              `${tier.minQuantity}+: ${tier.discountPercent}%`
                          )
                          .join(' · ')}
                      </div>
                    )}
                  </td>
                  <td
                    style={{
                      ...tdStyle,
                      textAlign: 'right',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    <div
                      style={{
                        fontWeight: 700,
                        color: item.aboveCatalogPrice ? '#B45309' : '#2B253E',
                      }}
                    >
                      {formatMoney(item.effectivePrice)}
                    </div>
                    {item.effectiveAtQuantity != null && (
                      <div
                        style={{
                          fontSize: '0.72rem',
                          color: '#A39BB3',
                          marginTop: '2px',
                        }}
                      >
                        at MOQ {item.effectiveAtQuantity}
                      </div>
                    )}
                  </td>
                  <td style={tdStyle}>
                    <span
                      style={{
                        display: 'inline-block',
                        padding: '2px 8px',
                        borderRadius: '9999px',
                        backgroundColor: '#F5EEF2',
                        color: '#5C566E',
                        fontSize: '0.72rem',
                        fontWeight: 600,
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {item.source ? SOURCE_LABELS[item.source] : 'Unknown'}
                    </span>
                    {item.aboveCatalogPrice && (
                      <div
                        title="This negotiated line quotes more than the public catalogue price at MOQ."
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '4px',
                          marginTop: '4px',
                          color: '#B45309',
                          fontSize: '0.72rem',
                          fontWeight: 600,
                          whiteSpace: 'nowrap',
                        }}
                      >
                        <AlertTriangle size={12} />
                        Above catalogue price
                      </div>
                    )}
                  </td>
                  {canManage && (
                    <td
                      style={{
                        ...tdStyle,
                        paddingRight: '20px',
                        textAlign: 'right',
                      }}
                    >
                      <button
                        type="button"
                        className="touch-target"
                        onClick={() => {
                          setRemoveError(null)
                          setPendingRemove(item)
                        }}
                        disabled={isArchived}
                        title={
                          isArchived
                            ? 'An archived rate card cannot be edited.'
                            : 'Remove this line'
                        }
                        aria-label={`Remove ${item.productName} from this rate card`}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '4px',
                          padding: '5px 10px',
                          borderRadius: '10px',
                          border: '1px solid #FECACA',
                          backgroundColor: '#FFFFFF',
                          color: '#DC2626',
                          fontSize: '0.76rem',
                          fontWeight: 600,
                          cursor: isArchived ? 'not-allowed' : 'pointer',
                          opacity: isArchived ? 0.5 : 1,
                        }}
                      >
                        <Trash2 size={12} />
                        Remove
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {data && total > 0 && (
        <div
          className="row-wrap"
          style={{
            justifyContent: 'space-between',
            padding: '10px 20px 14px',
            borderTop: '1px solid #F5EEF2',
            fontSize: '0.78rem',
            color: '#6E6781',
          }}
        >
          <span>
            Showing {formatNumber(firstRow)}–{formatNumber(lastRow)} of{' '}
            {formatNumber(total)} negotiated {total === 1 ? 'line' : 'lines'}
          </span>
          <div className="row-wrap">
            <button
              type="button"
              className="touch-target"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1 || isFetching}
              style={pagerButtonStyle(page <= 1 || isFetching)}
            >
              Previous
            </button>
            <span>
              Page {page} of {totalPages}
            </span>
            <button
              type="button"
              className="touch-target"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages || isFetching}
              style={pagerButtonStyle(page >= totalPages || isFetching)}
            >
              Next
            </button>
          </div>
        </div>
      )}

      <RateCardConfirmModal
        isOpen={pendingRemove !== null}
        title="Remove negotiated line"
        message={
          pendingRemove && (
            <>
              Remove <strong>{pendingRemove.productName}</strong> (
              {pendingRemove.productSku}) from <strong>{rateCard.name}</strong>?
              The product will be quoted at {fallbackText} for{' '}
              {rateCard.accountName}.
            </>
          )
        }
        confirmLabel="Remove line"
        pendingLabel="Removing..."
        isPending={removeItem.isPending}
        error={removeError}
        onConfirm={() => void confirmRemove()}
        onClose={closeRemove}
      />
    </div>
  )
}

function pagerButtonStyle(disabled: boolean): React.CSSProperties {
  return {
    padding: '5px 10px',
    borderRadius: '10px',
    border: '1px solid #F0E6EC',
    backgroundColor: '#FFFFFF',
    color: '#2B253E',
    fontSize: '0.76rem',
    fontWeight: 600,
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.5 : 1,
  }
}
