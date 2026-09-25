// src/app/shop/checkout/details/page.tsx
'use client'

import React, { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useAuth } from '@/hooks/useAuth'
import { useCart } from '@/hooks/useCart'
import { formatMoney } from '@/components/shop/cart/line-format'
import {
  Building2,
  FileText,
  ArrowRight,
  ArrowLeft,
  AlertCircle,
  Lock,
  Info,
  Tag,
} from 'lucide-react'

export default function CheckoutDetailsPage() {
  const router = useRouter()
  const { user } = useAuth()
  const {
    checkoutState,
    updateCheckoutState,
    subtotal,
    shipping,
    total,
    totalCount,
    purchaseOrder,
    budget,
    siteName,
    siteCode,
    isLoading,
  } = useCart()

  const [poReference, setPoReference] = useState<string>(
    checkoutState.poReference || ''
  )
  const [campaignCode, setCampaignCode] = useState<string>(
    checkoutState.campaignCode || ''
  )
  // Sent with the order itself — the basket has no column for it.
  const [projectCode, setProjectCode] = useState<string>(
    checkoutState.projectCode || ''
  )
  const [customerReference, setCustomerReference] = useState<string>(
    checkoutState.customerReference || ''
  )
  const [poError, setPoError] = useState<string | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)

  // A reload of this step renders before the basket arrives. The fields take
  // the server's values once, when they do — and never again, which would
  // overwrite whatever the buyer has started typing.
  const hydrated = useRef(!isLoading)
  useEffect(() => {
    if (hydrated.current || isLoading) return
    hydrated.current = true
    setPoReference((current) => current || checkoutState.poReference || '')
    setCampaignCode((current) => current || checkoutState.campaignCode || '')
    setProjectCode((current) => current || checkoutState.projectCode || '')
    setCustomerReference(
      (current) => current || checkoutState.customerReference || ''
    )
  }, [
    isLoading,
    checkoutState.poReference,
    checkoutState.campaignCode,
    checkoutState.projectCode,
    checkoutState.customerReference,
  ])

  /**
   * The purchase-order rule is the server's.
   *
   * Whether a reference is required comes from the branch or the account, and
   * the prefix from the user, branch or account. This page used to ask the
   * account directory — which a site user cannot read, so it always answered
   * "required" — and pre-filled a random reference with a made-up prefix that
   * the server would then refuse at the last step.
   */
  const isMandatoryPo = purchaseOrder?.required ?? false
  const poPrefix = purchaseOrder?.prefix ?? null
  const poFormat = purchaseOrder?.format ?? null
  const poExample = purchaseOrder?.formatExample ?? null

  const handleNext = async (e: React.FormEvent) => {
    e.preventDefault()
    if (isSaving) return

    const po = poReference.trim()
    if (isMandatoryPo && !po) {
      setPoError('A purchase-order reference is required for this branch.')
      return
    }

    setPoError(null)
    setSaveError(null)
    setIsSaving(true)

    const saved = await updateCheckoutState({
      poReference: po,
      campaignCode: campaignCode.trim(),
      customerReference: customerReference.trim(),
      // Not a cart field: held locally (and in the checkout draft) until
      // `POST /orders` carries it.
      projectCode: projectCode.trim(),
    })

    setIsSaving(false)

    if (!saved.success) {
      setSaveError(saved.error)
      return
    }

    // Saving never refuses a reference — the prefix, length and characters are
    // reported by validation instead. Read here, so the buyer fixes it on this
    // step rather than discovering it at the final one.
    const check = saved.validation?.purchaseOrder
    if (check && !check.valid) {
      setPoError(check.message ?? 'This purchase-order reference is not valid.')
      return
    }

    router.push('/shop/checkout/delivery')
  }

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'minmax(0, 1fr) 340px',
        gap: '20px',
        alignItems: 'start',
      }}
    >
      {/* Page header. It spans both columns instead of sitting inside the form
          card, so the title belongs to the page and the card holds the
          form. */}
      <div style={{ gridColumn: '1 / -1', minWidth: 0 }}>
        <span
          style={{
            display: 'block',
            marginBottom: '4px',
            fontSize: '0.76rem',
            fontWeight: 500,
            color: '#A39BB3',
          }}
        >
          Step 1 of 3
        </span>
        <h1
          style={{
            fontSize: '1.25rem',
            fontWeight: 700,
            color: '#2B253E',
            letterSpacing: '-0.01em',
            margin: 0,
          }}
        >
          Customer & Site Details
        </h1>
        <p style={{ fontSize: '0.8rem', color: '#6E6781', margin: '4px 0 0' }}>
          Your account affiliation and site ordering credentials are
          pre-populated automatically.
        </p>
      </div>

      {/* Main Details Form (Left) */}
      <div
        style={{
          backgroundColor: '#FFFFFF',
          borderRadius: '14px',
          boxShadow:
            '0 1px 2px rgba(43, 37, 62, 0.04), 0 6px 16px rgba(43, 37, 62, 0.05)',
          border: '1px solid #F0E6EC',
          padding: '20px',
          display: 'flex',
          flexDirection: 'column',
          gap: '20px',
        }}
      >
        <form
          onSubmit={handleNext}
          style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}
        >
          {/* Pre-populated Account & User details. A grey fill rather than a
              bordered card inside the card: it is read-only, and the fill sets
              it apart from the fields below without a second frame. */}
          <div
            style={{
              borderRadius: '10px',
              backgroundColor: '#FCF7FA',
              padding: '16px',
              display: 'flex',
              flexDirection: 'column',
              gap: '14px',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '8px',
                flexWrap: 'wrap',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  fontSize: '0.84rem',
                  fontWeight: 600,
                  color: '#2B253E',
                }}
              >
                <Building2 size={16} color="#A39BB3" />
                <span>Customer Account Association</span>
              </div>
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                  fontSize: '0.7rem',
                  fontWeight: 600,
                  color: '#3F9C68',
                  backgroundColor: '#ECFDF5',
                  padding: '2px 8px',
                  borderRadius: '9999px',
                }}
              >
                <Lock size={11} /> Verified Account
              </span>
            </div>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: '14px',
                fontSize: '0.84rem',
              }}
            >
              <div>
                <span
                  style={{
                    color: '#A39BB3',
                    fontSize: '0.74rem',
                    fontWeight: 500,
                    display: 'block',
                    marginBottom: '2px',
                  }}
                >
                  Customer Account:
                </span>
                <span
                  style={{
                    fontWeight: 600,
                    color: '#2B253E',
                    display: 'block',
                  }}
                >
                  {user?.accountName ?? '—'}
                </span>
                <span
                  style={{
                    fontFamily: 'monospace',
                    fontSize: '0.74rem',
                    color: '#A39BB3',
                  }}
                >
                  ID: {user?.accountId}
                </span>
              </div>

              <div>
                <span
                  style={{
                    color: '#A39BB3',
                    fontSize: '0.74rem',
                    fontWeight: 500,
                    display: 'block',
                    marginBottom: '2px',
                  }}
                >
                  Ordering Branch:
                </span>
                <span
                  style={{
                    fontWeight: 600,
                    color: '#2B253E',
                    display: 'block',
                  }}
                >
                  {siteName ?? user?.siteName ?? '—'}
                </span>
                <span
                  style={{
                    fontFamily: 'monospace',
                    fontSize: '0.74rem',
                    color: '#A39BB3',
                  }}
                >
                  Site Code: {siteCode ?? user?.siteCode ?? '—'}
                </span>
              </div>

              <div>
                <span
                  style={{
                    color: '#A39BB3',
                    fontSize: '0.74rem',
                    fontWeight: 500,
                    display: 'block',
                    marginBottom: '2px',
                  }}
                >
                  Ordering User:
                </span>
                <span
                  style={{
                    fontWeight: 600,
                    color: '#2B253E',
                    display: 'block',
                  }}
                >
                  {user?.name ?? '—'}
                </span>
                <span style={{ fontSize: '0.74rem', color: '#A39BB3' }}>
                  {user?.email}
                </span>
              </div>

              <div>
                <span
                  style={{
                    color: '#A39BB3',
                    fontSize: '0.74rem',
                    fontWeight: 500,
                    display: 'block',
                    marginBottom: '2px',
                  }}
                >
                  Monthly Budget Cap:
                </span>
                <span
                  style={{
                    fontWeight: 600,
                    color: '#2B253E',
                    display: 'block',
                  }}
                >
                  {/* The branch's cap and position, as the server priced this
                      basket against it. Null cap means uncapped. */}
                  {budget === null
                    ? '—'
                    : budget.cap === null
                      ? 'Uncapped'
                      : formatMoney(budget.cap)}
                </span>
                <span style={{ fontSize: '0.74rem', color: '#A39BB3' }}>
                  {budget?.remaining != null
                    ? `${formatMoney(budget.remaining)} remaining this month`
                    : 'Billed to Head Office'}
                </span>
              </div>
            </div>
          </div>

          {/* PO Reference Field */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '8px',
                flexWrap: 'wrap',
              }}
            >
              <label
                htmlFor="poReference"
                style={{
                  fontSize: '0.78rem',
                  fontWeight: 600,
                  color: '#5C566E',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                }}
              >
                <FileText size={14} color="#A39BB3" />
                <span>Purchase Order (PO) / Internal Reference</span>
                {isMandatoryPo ? (
                  <span style={{ color: '#DC2626', fontWeight: 600 }}>*</span>
                ) : (
                  <span
                    style={{
                      color: '#A39BB3',
                      fontWeight: 400,
                      fontSize: '0.76rem',
                    }}
                  >
                    (Optional)
                  </span>
                )}
              </label>

              {isMandatoryPo && (
                <span
                  style={{
                    fontSize: '0.7rem',
                    fontWeight: 600,
                    color: '#5C566E',
                    backgroundColor: '#F5EEF2',
                    padding: '2px 8px',
                    borderRadius: '9999px',
                  }}
                >
                  Required by Account Policy
                </span>
              )}
            </div>

            <p
              style={{
                fontSize: '0.78rem',
                color: '#6E6781',
                margin: 0,
                lineHeight: 1.5,
              }}
            >
              Enter your site's PO, authorization code, or internal job
              reference for this collateral batch. This reference will appear on
              your monthly consolidated billing statement.
            </p>

            {poFormat ? (
              <p style={{ fontSize: '0.76rem', color: '#6E6781', margin: 0 }}>
                Format{' '}
                <strong style={{ fontFamily: 'monospace', color: '#2B253E' }}>
                  {poFormat}
                </strong>
                {poExample && (
                  <>
                    , for example{' '}
                    <strong
                      style={{ fontFamily: 'monospace', color: '#2B253E' }}
                    >
                      {poExample}
                    </strong>
                  </>
                )}
                {poPrefix && (
                  <>
                    , starting with{' '}
                    <strong
                      style={{ fontFamily: 'monospace', color: '#2B253E' }}
                    >
                      {poPrefix}
                    </strong>
                  </>
                )}
                . # is a digit, @ a letter and YY the year.
              </p>
            ) : (
              poPrefix && (
                <p style={{ fontSize: '0.76rem', color: '#6E6781', margin: 0 }}>
                  Must start with{' '}
                  <strong style={{ fontFamily: 'monospace', color: '#2B253E' }}>
                    {poPrefix}
                  </strong>
                  .
                </p>
              )
            )}

            <input
              id="poReference"
              type="text"
              value={poReference}
              onChange={(e) => {
                setPoReference(e.target.value)
                if (poError) setPoError(null)
              }}
              maxLength={64}
              placeholder={
                poExample
                  ? `e.g. ${poExample}`
                  : poPrefix
                    ? `e.g. ${poPrefix}-1042`
                    : 'e.g. PO-1042'
              }
              style={{
                width: '100%',
                padding: '8px 12px',
                borderRadius: '10px',
                border: poError ? '1px solid #DC2626' : '1px solid #F0E6EC',
                fontSize: '0.84rem',
                fontFamily: 'monospace',
                fontWeight: 500,
                color: '#2B253E',
                backgroundColor: '#FFFFFF',
                outline: 'none',
                transition: 'border-color 0.15s ease',
              }}
            />

            {poError && (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '8px 12px',
                  borderRadius: '10px',
                  backgroundColor: '#FEF2F2',
                  border: '1px solid #FECACA',
                  color: '#DC2626',
                  fontSize: '0.78rem',
                  fontWeight: 500,
                }}
              >
                <AlertCircle size={14} color="#DC2626" />
                <span>{poError}</span>
              </div>
            )}
          </div>

          {/* Marketing Campaign Code */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <label
                htmlFor="campaignCode"
                style={{
                  fontSize: '0.78rem',
                  fontWeight: 600,
                  color: '#5C566E',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                }}
              >
                <Tag size={14} color="#A39BB3" />
                <span>Campaign Code</span>
                <span
                  style={{
                    color: '#A39BB3',
                    fontWeight: 400,
                    fontSize: '0.76rem',
                  }}
                >
                  (Optional)
                </span>
              </label>
            </div>

            <p
              style={{
                fontSize: '0.78rem',
                color: '#6E6781',
                margin: 0,
                lineHeight: 1.5,
              }}
            >
              Attribute this order to a brand initiative or seasonal rollout.
            </p>

            {/* No suggested codes: the API has no campaign list, and the three
                that were here were invented. */}
            <input
              id="campaignCode"
              type="text"
              value={campaignCode}
              // Saved with the step, not per keystroke: every save is a round
              // trip that re-prices the whole basket.
              onChange={(e) => setCampaignCode(e.target.value)}
              maxLength={64}
              placeholder="e.g. CMP-SPRING-2026"
              style={{
                width: '100%',
                padding: '8px 12px',
                borderRadius: '10px',
                border: '1px solid #F0E6EC',
                fontSize: '0.84rem',
                fontFamily: 'monospace',
                fontWeight: 500,
                color: '#2B253E',
                backgroundColor: '#FFFFFF',
                outline: 'none',
              }}
            />
          </div>

          {/* Project code: its own field, because it reports and bills
              separately from the campaign. */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <label
              htmlFor="projectCode"
              style={{
                fontSize: '0.78rem',
                fontWeight: 600,
                color: '#5C566E',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
              }}
            >
              <Tag size={14} color="#A39BB3" />
              <span>Project Code</span>
              <span
                style={{
                  color: '#A39BB3',
                  fontWeight: 400,
                  fontSize: '0.76rem',
                }}
              >
                (Optional)
              </span>
            </label>
            <p
              style={{
                fontSize: '0.78rem',
                color: '#6E6781',
                margin: 0,
                lineHeight: 1.5,
              }}
            >
              Charge this order to a project or cost budget.
            </p>
            <input
              id="projectCode"
              type="text"
              value={projectCode}
              onChange={(e) => setProjectCode(e.target.value)}
              maxLength={64}
              placeholder="e.g. PRJ-STORE-REFIT"
              style={{
                width: '100%',
                padding: '8px 12px',
                borderRadius: '10px',
                border: '1px solid #F0E6EC',
                fontSize: '0.84rem',
                fontFamily: 'monospace',
                fontWeight: 500,
                color: '#2B253E',
                backgroundColor: '#FFFFFF',
                outline: 'none',
              }}
            />
          </div>

          {/* Your reference: free text, no rule, never required. */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <label
              htmlFor="customerReference"
              style={{
                fontSize: '0.78rem',
                fontWeight: 600,
                color: '#5C566E',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
              }}
            >
              <Tag size={14} color="#A39BB3" />
              <span>Your Reference</span>
              <span
                style={{
                  color: '#A39BB3',
                  fontWeight: 400,
                  fontSize: '0.76rem',
                }}
              >
                (Optional)
              </span>
            </label>

            <p
              style={{
                fontSize: '0.78rem',
                color: '#6E6781',
                margin: 0,
                lineHeight: 1.5,
              }}
            >
              Anything that helps you recognise this order later — a job name,
              an internal code or a note for your finance team. It appears on
              the order and on your monthly invoice, and you can search your
              orders by it.
            </p>

            <input
              id="customerReference"
              type="text"
              value={customerReference}
              onChange={(e) => setCustomerReference(e.target.value)}
              maxLength={200}
              placeholder="e.g. Spring window refit – Level 2"
              style={{
                width: '100%',
                padding: '8px 12px',
                borderRadius: '10px',
                border: '1px solid #F0E6EC',
                fontSize: '0.84rem',
                fontWeight: 500,
                color: '#2B253E',
                backgroundColor: '#FFFFFF',
                outline: 'none',
              }}
            />
          </div>

          {saveError && (
            <div
              role="alert"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '8px 12px',
                borderRadius: '10px',
                backgroundColor: '#FEF2F2',
                border: '1px solid #FECACA',
                color: '#DC2626',
                fontSize: '0.78rem',
                fontWeight: 500,
              }}
            >
              <AlertCircle size={14} color="#DC2626" />
              <span>{saveError}</span>
            </div>
          )}

          {/* Buttons */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '8px',
              flexWrap: 'wrap',
              paddingTop: '16px',
              borderTop: '1px solid #F5EEF2',
            }}
          >
            <Link
              href="/shop/cart"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '8px 14px',
                borderRadius: '10px',
                border: '1px solid #F0E6EC',
                backgroundColor: '#FFFFFF',
                color: '#2B253E',
                fontSize: '0.82rem',
                fontWeight: 600,
                textDecoration: 'none',
              }}
            >
              <ArrowLeft size={14} /> Back to Cart
            </Link>

            <button
              type="submit"
              disabled={isSaving || isLoading}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '8px 14px',
                borderRadius: '10px',
                backgroundColor: '#F73582',
                color: '#FFFFFF',
                fontSize: '0.82rem',
                fontWeight: 600,
                cursor: isSaving || isLoading ? 'not-allowed' : 'pointer',
                opacity: isSaving || isLoading ? 0.5 : 1,
                border: 'none',
                transition: 'background-color 0.15s ease',
              }}
            >
              <span>
                {isSaving ? 'Checking…' : 'Continue to Delivery Details'}
              </span>
              <ArrowRight size={14} />
            </button>
          </div>
        </form>
      </div>

      {/* Side Summary (Right). A plain card: line rows, then the policy note
          under a hairline. */}
      <div
        style={{
          backgroundColor: '#FFFFFF',
          borderRadius: '14px',
          boxShadow:
            '0 1px 2px rgba(43, 37, 62, 0.04), 0 6px 16px rgba(43, 37, 62, 0.05)',
          border: '1px solid #F0E6EC',
          padding: '20px',
          display: 'flex',
          flexDirection: 'column',
          gap: '14px',
        }}
      >
        <h3
          style={{
            fontSize: '0.95rem',
            fontWeight: 700,
            color: '#2B253E',
            letterSpacing: '-0.01em',
            margin: 0,
          }}
        >
          Order Quick Snapshot
        </h3>

        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
            fontSize: '0.8rem',
          }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              color: '#6E6781',
            }}
          >
            <span>Total Items:</span>
            <strong style={{ color: '#2B253E', fontWeight: 600 }}>
              {totalCount} items
            </strong>
          </div>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              color: '#6E6781',
            }}
          >
            <span>Subtotal:</span>
            <strong style={{ color: '#2B253E', fontWeight: 600 }}>
              ${subtotal.toFixed(2)}
            </strong>
          </div>
          {/* Delivery is chosen on the next step; until then the total is the
              subtotal, and the row says so rather than showing free. */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              gap: '12px',
              color: '#6E6781',
            }}
          >
            <span>Shipping:</span>
            {shipping ? (
              <strong style={{ color: '#2B253E', fontWeight: 600 }}>
                ${Number(shipping.price).toFixed(2)}
              </strong>
            ) : (
              <span style={{ color: '#A39BB3' }}>Chosen at delivery</span>
            )}
          </div>
          <div
            style={{
              display: 'flex',
              alignItems: 'baseline',
              justifyContent: 'space-between',
              color: '#6E6781',
            }}
          >
            <span>Order Total:</span>
            <strong
              style={{ color: '#2B253E', fontSize: '1rem', fontWeight: 700 }}
            >
              ${total.toFixed(2)}
            </strong>
          </div>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              color: '#6E6781',
            }}
          >
            <span>Payment Terms:</span>
            <strong style={{ color: '#2B253E', fontWeight: 600 }}>
              On-Account Billing
            </strong>
          </div>
        </div>

        <div
          style={{
            paddingTop: '14px',
            borderTop: '1px solid #F5EEF2',
            fontSize: '0.76rem',
            color: '#6E6781',
            display: 'flex',
            flexDirection: 'column',
            gap: '6px',
            lineHeight: 1.45,
          }}
        >
          <div
            style={{
              fontSize: '0.8rem',
              fontWeight: 600,
              color: '#2B253E',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            <Info size={14} color="#A39BB3" />
            <span>Account B2B Policy</span>
          </div>
          <p style={{ margin: 0 }}>
            Orders are authorized under your group contract. Your Head Office
            finance controller will review the consolidated report at month end.
          </p>
        </div>
      </div>
    </div>
  )
}
