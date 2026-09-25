// src/app/shop/checkout/delivery/page.tsx
'use client'

import React, { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useAuth } from '@/hooks/useAuth'
import { useCart } from '@/hooks/useCart'
import { getSiteAddresses } from '@/services/accounts.service'
import type { Address } from '@/types'
import type { CheckoutState } from '@/store/cartSlice'
import { OrderTotals } from '@/components/shop/cart/OrderTotals'
import {
  formatDate,
  formatMoney,
  shippingOptionName,
} from '@/components/shop/cart/line-format'
import { NzPostDeliveryPanel } from '@/components/shop/checkout/NzPostDeliveryPanel'
import { getCartShipping } from '@/services/data-source/api/api-cart.adapter'
import {
  Truck,
  Building2,
  User,
  FileEdit,
  ArrowRight,
  ArrowLeft,
  ShieldCheck,
  AlertCircle,
  Loader2,
  PackageCheck,
} from 'lucide-react'

type ShippingMethod = NonNullable<CheckoutState['shippingMethod']>

/** `POST /orders` accepts up to this many characters of `deliveryNotes`. */
const DELIVERY_NOTES_MAX = 500

/** The fields of a one-off delivery address, as typed. */
interface OneOffForm {
  label: string
  recipientName: string
  line1: string
  line2: string
  city: string
  region: string
  postcode: string
  country: string
  phone: string
}

const EMPTY_ONE_OFF: OneOffForm = {
  label: '',
  recipientName: '',
  line1: '',
  line2: '',
  city: '',
  region: '',
  postcode: '',
  country: '',
  phone: '',
}

const oneOffInput: React.CSSProperties = {
  width: '100%',
  padding: '8px 12px',
  borderRadius: '10px',
  border: '1px solid #F0E6EC',
  backgroundColor: '#FFFFFF',
  fontSize: '0.84rem',
  color: '#2B253E',
  outline: 'none',
}

/** A section heading inside the form card. */
const sectionTitle: React.CSSProperties = {
  fontSize: '0.84rem',
  fontWeight: 600,
  color: '#2B253E',
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  margin: 0,
}

const summaryLabel: React.CSSProperties = {
  color: '#A39BB3',
  fontSize: '0.74rem',
  fontWeight: 500,
  display: 'block',
  marginBottom: '2px',
}

const summaryValue: React.CSSProperties = {
  color: '#2B253E',
  fontWeight: 600,
  display: 'block',
}

function addressLines(address: Address): [string, string] {
  const street = [address.street, address.suite].filter(Boolean).join(', ')
  const locality = [
    [address.city, address.state].filter(Boolean).join(', '),
    address.postalCode,
  ]
    .filter(Boolean)
    .join(' ')
  return [street, locality]
}

export default function CheckoutDeliveryPage() {
  const router = useRouter()
  const { user } = useAuth()
  const {
    checkoutState,
    updateCheckoutState,
    billTo,
    customDeliveryAddress,
    setOneOffDeliveryAddress,
    chooseShippingMethod,
    shipping,
    shippingOptions,
    subtotal,
    total,
    siteId: cartSiteId,
    siteName,
    siteCode,
    deliveryNotesRequired,
    isLoading: isCartLoading,
  } = useCart()

  // Whatever `getSiteAddresses` returns, rather than a second copy of its
  // shape that would drift the moment a field was added to it.
  type SiteDelivery = Awaited<ReturnType<typeof getSiteAddresses>>
  const [siteData, setSiteData] = useState<SiteDelivery>(null)

  const [selectedAddressId, setSelectedAddressId] = useState<string | null>(
    checkoutState.shippingAddressId ?? null
  )

  // A saved branch address, or one typed for this order (F-18). The one-off
  // form starts from the address already on the basket, once, when the
  // validation that carries it arrives — adjusted during render rather than in
  // an effect so the form never paints empty first.
  const [shipToMode, setShipToMode] = useState<'SAVED' | 'ONE_OFF'>('SAVED')
  const [oneOff, setOneOff] = useState<OneOffForm>(EMPTY_ONE_OFF)
  const [oneOffSeeded, setOneOffSeeded] = useState(false)
  if (!oneOffSeeded && !isCartLoading) {
    setOneOffSeeded(true)
    const current = customDeliveryAddress.current
    if (current && current.id === checkoutState.shippingAddressId) {
      setShipToMode('ONE_OFF')
      setOneOff({
        label: current.label ?? '',
        recipientName: current.recipientName ?? '',
        line1: current.line1,
        line2: current.line2 ?? '',
        city: current.city,
        region: current.region ?? '',
        postcode: current.postcode,
        country: current.country,
        phone: current.phone ?? '',
      })
    }
  }
  // An account that switched the option off since keeps the buyer on the
  // saved addresses; the stale one-off is reported by validation.
  const oneOffActive = shipToMode === 'ONE_OFF' && customDeliveryAddress.allowed
  const setOneOffField = (field: keyof OneOffForm, value: string) =>
    setOneOff((current) => ({ ...current, [field]: value }))

  // Carried to the order at placement: the cart has no field for them, but
  // `POST /orders` does (`recipientName`, `recipientPhone`, `recipientEmail`).
  const [contactName, setContactName] = useState(
    checkoutState.deliveryContactName || user?.name || ''
  )
  const [contactPhone, setContactPhone] = useState(
    checkoutState.deliveryContactPhone || ''
  )
  const [contactEmail, setContactEmail] = useState(
    checkoutState.deliveryContactEmail || ''
  )
  // Sent as `deliveryNotes` on `POST /orders`: the field the courier label,
  // the order record, approvals and the billing export all read. They used to
  // be saved as the basket's `notes`, which none of those show. A basket saved
  // that way still offers its notes here, once.
  const [instructions, setInstructions] = useState(
    checkoutState.deliveryInstructions || checkoutState.notes || ''
  )
  const [instructionsError, setInstructionsError] = useState<string | null>(
    null
  )
  /** `YYYY-MM-DD`. The server holds it as a date-time. */
  const [requestedDate, setRequestedDate] = useState(
    checkoutState.requestedDeliveryDate?.slice(0, 10) ?? ''
  )

  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  /** The branch whose addresses have been answered for, success or not. */
  const [loadedSiteId, setLoadedSiteId] = useState<string | null>(null)

  /**
   * The method being saved right now. The radio shows it at once, and falls
   * back to whatever the server holds when the save settles — so a refused
   * choice snaps back instead of lying about what the order will cost.
   */
  const [savingMethod, setSavingMethod] = useState<ShippingMethod | null>(null)
  const [shippingError, setShippingError] = useState<string | null>(null)
  const chosenMethod = savingMethod ?? checkoutState.shippingMethod ?? null

  // No fallback ids: the branch and account come from the session, and a buyer
  // with neither has nothing to deliver to.
  const siteId = cartSiteId ?? user?.siteId ?? null

  // A reload of this step renders before the basket arrives. The server's
  // values — and the contact and instructions restored from the session — are
  // taken once, when they do, and never over what is being typed.
  const [hydrated, setHydrated] = useState(!isCartLoading)
  if (!hydrated && !isCartLoading) {
    setHydrated(true)
    setInstructions(
      (current) =>
        current ||
        checkoutState.deliveryInstructions ||
        checkoutState.notes ||
        ''
    )
    // The restored name beats the signed-in user's, which is only a default.
    setContactName(
      (current) => checkoutState.deliveryContactName || current || ''
    )
    setContactPhone((current) => current || checkoutState.deliveryContactPhone)
    setContactEmail(
      (current) => current || checkoutState.deliveryContactEmail || ''
    )
    setRequestedDate(
      (current) =>
        current || checkoutState.requestedDeliveryDate?.slice(0, 10) || ''
    )
    if (checkoutState.shippingAddressId)
      setSelectedAddressId(checkoutState.shippingAddressId)
  }

  /** Today as a UTC calendar day — the granularity the server compares at. */
  const todayUtc = new Date().toISOString().slice(0, 10)

  // Derived: loading until this branch's addresses have been answered for.
  const isLoading = siteId !== null && loadedSiteId !== siteId

  useEffect(() => {
    if (!siteId) return

    let cancelled = false

    getSiteAddresses(siteId)
      .then((addresses) => {
        if (cancelled) return
        setSiteData(addresses)
        // Default to whatever the buyer already chose, else the branch's
        // default shipping address.
        setSelectedAddressId(
          (current) => current ?? addresses?.shipToAddressId ?? null
        )
      })
      .catch(() => {
        if (!cancelled)
          setErrorMsg("Could not load this branch's delivery addresses.")
      })
      .finally(() => {
        if (!cancelled) setLoadedSiteId(siteId)
      })

    return () => {
      cancelled = true
    }
  }, [siteId])

  /** Saves the choice immediately: the server prices it into the total. */
  const handleChooseMethod = async (method: ShippingMethod) => {
    if (savingMethod || method === checkoutState.shippingMethod) return

    setSavingMethod(method)
    setShippingError(null)
    if (errorMsg?.startsWith('Choose a shipping method')) setErrorMsg(null)

    const saved = await chooseShippingMethod(method)
    setSavingMethod(null)

    if (!saved.success) setShippingError(saved.error)
  }

  const handleNext = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!contactName.trim()) {
      setErrorMsg('Please enter a delivery contact name.')
      return
    }

    // A saved address must be one of this branch's; the id on the basket may
    // be a one-off typed earlier, which the saved list does not contain.
    const savedChoice =
      siteData?.addresses.find((option) => option.id === selectedAddressId)
        ?.id ?? null

    if (oneOffActive) {
      if (
        !oneOff.line1.trim() ||
        !oneOff.city.trim() ||
        !oneOff.postcode.trim()
      ) {
        setErrorMsg(
          'Enter the street address, city and postcode for the delivery address.'
        )
        return
      }
      if (!/^[A-Za-z]{2}$/.test(oneOff.country.trim())) {
        setErrorMsg(
          'Enter the delivery country as its two-letter code, for example NZ.'
        )
        return
      }
    } else if (!savedChoice) {
      setErrorMsg(
        (siteData?.addresses.length ?? 0) === 0
          ? customDeliveryAddress.allowed
            ? 'This branch has no saved delivery address. Enter one under "Deliver somewhere else".'
            : 'This branch has no delivery address on file. An administrator has to add one before you can check out.'
          : 'Choose a delivery address.'
      )
      return
    }

    if (savingMethod) return

    if (!checkoutState.shippingMethod) {
      setShippingError('Please choose one of the delivery options above.')
      setErrorMsg('Choose a shipping method to continue to review.')
      return
    }

    const email = contactEmail.trim()
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setErrorMsg(
        'Enter a valid email for the receiving contact, or leave it blank.'
      )
      return
    }

    if (requestedDate && requestedDate < todayUtc) {
      setErrorMsg('The requested delivery date cannot be in the past.')
      return
    }

    const trimmedInstructions = instructions.trim()
    if (deliveryNotesRequired && !trimmedInstructions) {
      setInstructionsError(
        'This account requires delivery instructions on every order.'
      )
      setErrorMsg('Add delivery instructions to continue to review.')
      return
    }
    if (trimmedInstructions.length > DELIVERY_NOTES_MAX) {
      setInstructionsError(
        `Keep delivery instructions to ${DELIVERY_NOTES_MAX} characters.`
      )
      return
    }

    setErrorMsg(null)
    setInstructionsError(null)
    setIsSaving(true)

    // The address and date go to the server's basket, which the order is
    // written from. The receiving contact and the instructions stay local
    // until placement — the cart has no field for them and `POST /orders`
    // does. The delivery method was saved when it was chosen.
    // A typed address goes first, through its own endpoint, which pins it as
    // the basket's delivery address; the details below then leave that alone.
    if (oneOffActive) {
      const trimmed = (value: string) => value.trim() || undefined
      // The address chosen in the NZ Post panel, if one was. Sent with the
      // typed lines so the server verifies it and stores NZ Post's version —
      // otherwise the order would carry the typed address and the label the
      // NZ Post one, and the two need not agree.
      const nzPost = await getCartShipping(cartSiteId ?? undefined).catch(
        () => null
      )
      const nzPostAddressId =
        nzPost?.selection?.deliveryKind === 'ADDRESS'
          ? (nzPost.selection.nzPostAddressId ?? undefined)
          : undefined
      const stored = await setOneOffDeliveryAddress({
        ...(nzPostAddressId ? { nzPostAddressId } : {}),
        label: trimmed(oneOff.label),
        recipientName: trimmed(oneOff.recipientName),
        line1: oneOff.line1.trim(),
        line2: trimmed(oneOff.line2),
        city: oneOff.city.trim(),
        region: trimmed(oneOff.region),
        postcode: oneOff.postcode.trim(),
        country: oneOff.country.trim().toUpperCase(),
        phone: trimmed(oneOff.phone),
      })
      if (!stored.success) {
        setIsSaving(false)
        setErrorMsg(stored.error)
        return
      }
    }

    const saved = await updateCheckoutState({
      ...(oneOffActive ? {} : { shippingAddressId: savedChoice ?? undefined }),
      // Pin the bill-to shown above so the order records exactly it. None on
      // file clears any stale pin, and the server resolves again.
      billingAddressId: billTo?.addressId ?? '',
      requestedDeliveryDate: requestedDate,
      // Instructions saved on the basket by the old form move to the order's
      // own field; leaving them would print them on the order twice.
      ...(checkoutState.notes ? { notes: '' } : {}),
      deliveryContactName: contactName.trim(),
      deliveryContactPhone: contactPhone.trim(),
      deliveryContactEmail: email,
      deliveryInstructions: trimmedInstructions,
    })

    setIsSaving(false)

    if (!saved.success) {
      setErrorMsg(saved.error)
      return
    }

    router.push('/shop/checkout/review')
  }

  // The server's bill-to — the same one the order will record — rather than a
  // pick from the branch's own addresses, which could not see the head office's.
  // No invented fallbacks: none on file says so.
  const billAddress = billTo?.address ?? null
  const billStreet = billAddress
    ? [billAddress.line1, billAddress.line2].filter(Boolean).join(', ')
    : ''
  const billLocality = billAddress
    ? [
        [billAddress.city, billAddress.region].filter(Boolean).join(', '),
        billAddress.postcode,
      ]
        .filter(Boolean)
        .join(' ')
    : ''

  const selectedAddress =
    siteData?.addresses.find((option) => option.id === selectedAddressId) ??
    null

  const branchName = siteName ?? user?.siteName ?? null
  const branchCode = siteCode ?? user?.siteCode ?? null
  const isBusy = isSaving || savingMethod !== null

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
          Step 2 of 3
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
          Delivery & Address Configuration
        </h1>
        <p style={{ fontSize: '0.8rem', color: '#6E6781', margin: '4px 0 0' }}>
          Confirm where the order ships, how it travels, and who receives it at
          the branch.
        </p>
      </div>

      {/* Main Form (Left) */}
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
          {/* 1. Separate Bill-To & Ship-To Displays. Two columns inside the
              card rather than two framed cards within it. */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: '20px',
            }}
          >
            {/* Bill-To Card */}
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '8px',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '8px',
                  paddingBottom: '8px',
                  borderBottom: '1px solid #F5EEF2',
                }}
              >
                <span style={sectionTitle}>
                  <Building2 size={16} color="#A39BB3" />
                  <span>
                    Bill-To Address (
                    {billTo?.source === 'SITE' ? 'Branch' : 'Head Office'})
                  </span>
                </span>
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
                  Fixed
                </span>
              </div>

              <div
                style={{
                  fontSize: '0.8rem',
                  color: '#6E6781',
                  lineHeight: 1.5,
                }}
              >
                <p
                  style={{
                    fontWeight: 600,
                    color: '#2B253E',
                    margin: '0 0 2px 0',
                  }}
                >
                  {billAddress?.recipientName || user?.accountName || '—'}
                </p>
                {billStreet || billLocality ? (
                  <>
                    {billStreet && <p style={{ margin: 0 }}>{billStreet}</p>}
                    {billLocality && (
                      <p style={{ margin: 0 }}>{billLocality}</p>
                    )}
                    {billAddress?.country && (
                      <p style={{ margin: 0, color: '#A39BB3' }}>
                        {billAddress.country}
                      </p>
                    )}
                  </>
                ) : (
                  !isLoading && (
                    <p style={{ margin: 0, color: '#A39BB3' }}>
                      No billing address on file.
                    </p>
                  )
                )}
              </div>

              <span
                style={{
                  fontSize: '0.74rem',
                  color: '#A39BB3',
                  fontStyle: 'italic',
                  paddingTop: '4px',
                }}
              >
                Invoiced directly on monthly consolidated ledger
              </span>
            </div>

            {/* Ship-To Selection Card */}
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '8px',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '8px',
                  paddingBottom: '8px',
                  borderBottom: '1px solid #F5EEF2',
                }}
              >
                <span style={sectionTitle}>
                  <Truck size={16} color="#A39BB3" />
                  <span>Ship-To Destination</span>
                </span>
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
                  Site Receiving
                </span>
              </div>

              {branchName && (
                <p
                  style={{
                    margin: 0,
                    fontSize: '0.8rem',
                    fontWeight: 600,
                    color: '#2B253E',
                  }}
                >
                  {branchName}
                  {branchCode && (
                    <span
                      style={{
                        fontWeight: 500,
                        color: '#A39BB3',
                        fontFamily: 'monospace',
                      }}
                    >
                      {' '}
                      ({branchCode})
                    </span>
                  )}
                </p>
              )}

              {/* Where this order ships.

                  The branch's saved addresses, chosen by id — and, where the
                  account allows it, one typed for this order only. That one is
                  never added to the branch. */}
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '8px',
                }}
              >
                {(siteData?.addresses.length ?? 0) === 0 &&
                  !isLoading &&
                  !customDeliveryAddress.allowed && (
                    <p
                      style={{
                        fontSize: '0.78rem',
                        color: '#DC2626',
                        margin: 0,
                        fontWeight: 500,
                      }}
                    >
                      This branch has no delivery address on file. An
                      administrator has to add one before an order can be
                      placed.
                    </p>
                  )}

                {siteData?.addresses.map((option, optionIdx) => {
                  const [street, locality] = addressLines(option.address)
                  return (
                    <label
                      key={option.id}
                      style={{
                        display: 'flex',
                        alignItems: 'flex-start',
                        gap: '8px',
                        cursor: 'pointer',
                        paddingTop: optionIdx === 0 ? 0 : '8px',
                        borderTop:
                          optionIdx === 0 ? 'none' : '1px solid #F5EEF2',
                      }}
                    >
                      <input
                        type="radio"
                        name="addressChoice"
                        checked={
                          !oneOffActive && selectedAddressId === option.id
                        }
                        onChange={() => {
                          setShipToMode('SAVED')
                          setSelectedAddressId(option.id)
                        }}
                        style={{ marginTop: '2px', accentColor: '#F73582' }}
                      />
                      <div style={{ fontSize: '0.8rem', color: '#6E6781' }}>
                        <strong
                          style={{
                            color: '#2B253E',
                            fontWeight: 600,
                            display: 'block',
                          }}
                        >
                          {option.label}
                          {option.isDefault ? ' (default)' : ''}
                        </strong>
                        {street && (
                          <p style={{ margin: '2px 0 0 0' }}>{street}</p>
                        )}
                        {locality && <p style={{ margin: 0 }}>{locality}</p>}
                        {option.address.country && (
                          <p style={{ margin: 0, color: '#A39BB3' }}>
                            {option.address.country}
                          </p>
                        )}
                      </div>
                    </label>
                  )
                })}

                {customDeliveryAddress.allowed && (
                  <div
                    style={{
                      paddingTop: (siteData?.addresses.length ?? 0) ? '8px' : 0,
                      borderTop:
                        (siteData?.addresses.length ?? 0)
                          ? '1px solid #F5EEF2'
                          : 'none',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '10px',
                    }}
                  >
                    <label
                      style={{
                        display: 'flex',
                        alignItems: 'flex-start',
                        gap: '8px',
                        cursor: 'pointer',
                      }}
                    >
                      <input
                        type="radio"
                        name="addressChoice"
                        checked={oneOffActive}
                        onChange={() => {
                          setShipToMode('ONE_OFF')
                          setOneOff((current) =>
                            current.country
                              ? current
                              : {
                                  ...current,
                                  country:
                                    siteData?.shipToAddress?.country || 'NZ',
                                }
                          )
                        }}
                        style={{ marginTop: '2px', accentColor: '#F73582' }}
                      />
                      <div style={{ fontSize: '0.8rem', color: '#6E6781' }}>
                        <strong
                          style={{
                            color: '#2B253E',
                            fontWeight: 600,
                            display: 'block',
                          }}
                        >
                          Deliver somewhere else
                        </strong>
                        <p style={{ margin: '2px 0 0 0' }}>
                          A one-off address for this order only. It is not added
                          to the branch&apos;s saved addresses.
                        </p>
                        {oneOffActive && (
                          <p style={{ margin: '2px 0 0 0', color: '#A39BB3' }}>
                            Find the same address under NZ Post delivery below
                            to have it verified; the verified version is the one
                            the order and the label use.
                          </p>
                        )}
                      </div>
                    </label>

                    {oneOffActive && (
                      <div
                        style={{
                          display: 'grid',
                          gridTemplateColumns:
                            'repeat(auto-fit, minmax(200px, 1fr))',
                          gap: '10px',
                          paddingLeft: '22px',
                          fontSize: '0.78rem',
                        }}
                      >
                        {(
                          [
                            ['label', 'Label', 'e.g. Pop-up store', 120, false],
                            [
                              'recipientName',
                              'Recipient',
                              'Who signs for it',
                              160,
                              false,
                            ],
                            ['line1', 'Street address *', '', 200, true],
                            ['line2', 'Unit, level, building', '', 200, false],
                            ['city', 'City *', '', 120, true],
                            ['region', 'Region', '', 120, false],
                            ['postcode', 'Postcode *', '', 24, true],
                            ['country', 'Country code *', 'NZ', 2, true],
                            ['phone', 'Phone', '', 40, false],
                          ] as const
                        ).map(([field, text, placeholder, max, required]) => (
                          <label
                            key={field}
                            style={{
                              display: 'flex',
                              flexDirection: 'column',
                              gap: '4px',
                              fontWeight: 600,
                              color: '#5C566E',
                            }}
                          >
                            {text}
                            <input
                              type="text"
                              value={oneOff[field]}
                              maxLength={max}
                              required={required}
                              placeholder={placeholder}
                              autoComplete={
                                field === 'line1'
                                  ? 'address-line1'
                                  : field === 'line2'
                                    ? 'address-line2'
                                    : field === 'city'
                                      ? 'address-level2'
                                      : field === 'postcode'
                                        ? 'postal-code'
                                        : field === 'country'
                                          ? 'country'
                                          : undefined
                              }
                              onChange={(e) =>
                                setOneOffField(
                                  field,
                                  field === 'country'
                                    ? e.target.value.toUpperCase()
                                    : e.target.value
                                )
                              }
                              style={{
                                ...oneOffInput,
                                fontWeight: 400,
                                ...(field === 'country'
                                  ? { fontFamily: 'monospace' }
                                  : {}),
                              }}
                            />
                          </label>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* 2. Shipping method. Radio cards, saved as soon as one is picked,
              because the choice changes what the order costs and the running
              total beside the form should say so straight away. */}
          <div
            style={{
              paddingTop: '20px',
              borderTop: '1px solid #F5EEF2',
              display: 'flex',
              flexDirection: 'column',
              gap: '12px',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '8px',
              }}
            >
              <h4 style={sectionTitle}>
                <PackageCheck size={16} color="#A39BB3" />
                <span>Shipping Method *</span>
              </h4>
              {savingMethod && (
                <span
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px',
                    fontSize: '0.74rem',
                    color: '#6E6781',
                  }}
                >
                  <Loader2
                    size={12}
                    style={{ animation: 'spin 1s linear infinite' }}
                  />
                  Saving…
                </span>
              )}
            </div>

            <div
              role="radiogroup"
              aria-label="Shipping method"
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                gap: '10px',
              }}
            >
              {shippingOptions.map((option) => {
                const selected = chosenMethod === option.code
                const disabled = savingMethod !== null
                return (
                  <label
                    key={option.code}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '10px',
                      padding: '12px 14px',
                      borderRadius: '12px',
                      border: selected
                        ? '1px solid #F73582'
                        : shippingError
                          ? '1px solid #FECACA'
                          : '1px solid #F0E6EC',
                      backgroundColor: selected ? '#FDE8F1' : '#FFFFFF',
                      cursor: disabled ? 'wait' : 'pointer',
                      transition:
                        'border-color 0.15s ease, background-color 0.15s ease',
                    }}
                  >
                    <input
                      type="radio"
                      name="shippingMethod"
                      value={option.code}
                      checked={selected}
                      disabled={disabled}
                      onChange={() => void handleChooseMethod(option.code)}
                      style={{ margin: 0, accentColor: '#F73582' }}
                    />
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span
                        style={{
                          display: 'block',
                          fontSize: '0.82rem',
                          fontWeight: 600,
                          color: '#2B253E',
                        }}
                      >
                        {option.label}
                      </span>
                      <span
                        style={{
                          display: 'block',
                          fontSize: '0.74rem',
                          color: '#6E6781',
                        }}
                      >
                        {option.eta}
                      </span>
                    </span>
                    <span
                      style={{
                        fontSize: '0.84rem',
                        fontWeight: 700,
                        color: '#2B253E',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {formatMoney(Number(option.price))}
                    </span>
                  </label>
                )
              })}
            </div>

            {shippingOptions.length === 0 && (
              <p style={{ margin: 0, fontSize: '0.78rem', color: '#A39BB3' }}>
                {isCartLoading
                  ? 'Loading delivery options…'
                  : 'No delivery methods are available for this basket right now.'}
              </p>
            )}

            {shippingError && (
              <p
                role="alert"
                style={{
                  margin: 0,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  fontSize: '0.76rem',
                  fontWeight: 500,
                  color: '#DC2626',
                }}
              >
                <AlertCircle size={12} color="#DC2626" />
                {shippingError}
              </p>
            )}
          </div>

          {/* 2b. NZ Post: where and how the courier carries it. Optional and
              recorded for dispatch — the shipping method above is what the
              order pays. */}
          <NzPostDeliveryPanel />

          {/* 3. Delivery Contact Details. A section under a hairline rather
              than a grey framed box, so the inputs sit on the card itself. */}
          <div
            style={{
              paddingTop: '20px',
              borderTop: '1px solid #F5EEF2',
              display: 'flex',
              flexDirection: 'column',
              gap: '14px',
            }}
          >
            <h4 style={sectionTitle}>
              <User size={16} color="#A39BB3" />
              <span>Receiving Contact Person</span>
            </h4>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: '14px',
                fontSize: '0.78rem',
              }}
            >
              <div>
                <label
                  style={{
                    display: 'block',
                    fontWeight: 600,
                    color: '#5C566E',
                    marginBottom: '6px',
                  }}
                >
                  Contact Name *
                </label>
                <input
                  type="text"
                  required
                  value={contactName}
                  onChange={(e) => setContactName(e.target.value)}
                  maxLength={200}
                  placeholder="Full name"
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: '10px',
                    border: '1px solid #F0E6EC',
                    backgroundColor: '#FFFFFF',
                    fontSize: '0.84rem',
                    color: '#2B253E',
                    outline: 'none',
                  }}
                />
              </div>

              <div>
                <label
                  style={{
                    display: 'block',
                    fontWeight: 600,
                    color: '#5C566E',
                    marginBottom: '6px',
                  }}
                >
                  Contact Phone
                </label>
                <input
                  type="tel"
                  value={contactPhone}
                  autoComplete="tel"
                  onChange={(e) => setContactPhone(e.target.value)}
                  maxLength={40}
                  placeholder="+64 21 123 4567"
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: '10px',
                    border: '1px solid #F0E6EC',
                    backgroundColor: '#FFFFFF',
                    fontSize: '0.84rem',
                    color: '#2B253E',
                    outline: 'none',
                  }}
                />
              </div>

              <div>
                <label
                  style={{
                    display: 'block',
                    fontWeight: 600,
                    color: '#5C566E',
                    marginBottom: '6px',
                  }}
                >
                  Contact Email
                </label>
                <input
                  type="email"
                  value={contactEmail}
                  onChange={(e) => setContactEmail(e.target.value)}
                  maxLength={254}
                  placeholder="receiving@branch.co.nz"
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: '10px',
                    border: '1px solid #F0E6EC',
                    backgroundColor: '#FFFFFF',
                    fontSize: '0.84rem',
                    color: '#2B253E',
                    outline: 'none',
                  }}
                />
              </div>

              <div>
                <label
                  style={{
                    display: 'block',
                    fontWeight: 600,
                    color: '#5C566E',
                    marginBottom: '6px',
                  }}
                >
                  Requested Delivery Date
                </label>
                <input
                  type="date"
                  value={requestedDate}
                  min={todayUtc}
                  onChange={(e) => setRequestedDate(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: '10px',
                    border: '1px solid #F0E6EC',
                    backgroundColor: '#FFFFFF',
                    fontSize: '0.84rem',
                    color: '#2B253E',
                    outline: 'none',
                  }}
                />
              </div>
            </div>
          </div>

          {/* 4. Delivery Instructions */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <label
              style={{
                fontSize: '0.78rem',
                fontWeight: 600,
                color: '#5C566E',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
              }}
            >
              <FileEdit size={14} color="#A39BB3" />
              <span>Special Delivery & Dispatch Instructions</span>
              {deliveryNotesRequired ? (
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
            <p style={{ fontSize: '0.78rem', color: '#6E6781', margin: 0 }}>
              Provide instructions for the courier (e.g. security gate code,
              loading bay receiving hours, cold storage handover). They are
              printed on the courier label
              {deliveryNotesRequired
                ? ', and your account requires them on every order.'
                : '.'}
            </p>
            <textarea
              id="deliveryInstructions"
              rows={3}
              maxLength={DELIVERY_NOTES_MAX}
              value={instructions}
              required={deliveryNotesRequired}
              aria-invalid={instructionsError ? true : undefined}
              onChange={(e) => {
                setInstructions(e.target.value)
                if (instructionsError) setInstructionsError(null)
              }}
              placeholder="e.g. Loading dock open 8am - 4pm. Ring buzzer B for dispensary access."
              style={{
                width: '100%',
                padding: '8px 12px',
                borderRadius: '10px',
                border: instructionsError
                  ? '1px solid #DC2626'
                  : '1px solid #F0E6EC',
                backgroundColor: '#FFFFFF',
                fontSize: '0.84rem',
                color: '#2B253E',
                lineHeight: 1.5,
                outline: 'none',
                fontFamily: 'inherit',
              }}
            />
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                gap: '8px',
                fontSize: '0.74rem',
              }}
            >
              <span style={{ color: '#DC2626', fontWeight: 500 }}>
                {instructionsError}
              </span>
              <span style={{ color: '#A39BB3', whiteSpace: 'nowrap' }}>
                {instructions.length}/{DELIVERY_NOTES_MAX}
              </span>
            </div>
          </div>

          {errorMsg && (
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
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Action Buttons */}
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
              href="/shop/checkout/details"
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
              <ArrowLeft size={14} /> Back to Details
            </Link>

            <button
              type="submit"
              disabled={isBusy}
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
                cursor: isBusy ? 'not-allowed' : 'pointer',
                opacity: isBusy ? 0.5 : 1,
                border: 'none',
                transition: 'background-color 0.15s ease',
              }}
            >
              <span>{isSaving ? 'Saving...' : 'Continue to Final Review'}</span>
              <ArrowRight size={14} />
            </button>
          </div>
        </form>
      </div>

      {/* Side Summary (Right). A plain card of label/value rows, then the
          running totals the server priced. */}
      <div
        style={{
          position: 'sticky',
          top: '80px',
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
          Delivery Summary
        </h3>

        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '12px',
            fontSize: '0.84rem',
          }}
        >
          <div>
            <span style={summaryLabel}>Ordering Branch</span>
            <strong style={summaryValue}>
              {branchName ?? '—'}
              {branchCode && (
                <span
                  style={{
                    fontWeight: 500,
                    color: '#A39BB3',
                    fontFamily: 'monospace',
                  }}
                >
                  {' '}
                  ({branchCode})
                </span>
              )}
            </strong>
          </div>

          <div>
            <span style={summaryLabel}>Ship To</span>
            {oneOffActive ? (
              <>
                <strong style={summaryValue}>
                  {oneOff.label.trim() || 'One-off delivery'}
                </strong>
                <span
                  style={{
                    display: 'block',
                    fontSize: '0.78rem',
                    color: '#6E6781',
                    lineHeight: 1.45,
                  }}
                >
                  {[
                    oneOff.line1,
                    oneOff.line2,
                    oneOff.city,
                    oneOff.postcode,
                    oneOff.country,
                  ]
                    .map((part) => part.trim())
                    .filter(Boolean)
                    .join(', ') || 'Enter the address'}
                </span>
              </>
            ) : selectedAddress ? (
              <>
                <strong style={summaryValue}>{selectedAddress.label}</strong>
                <span
                  style={{
                    display: 'block',
                    fontSize: '0.78rem',
                    color: '#6E6781',
                    lineHeight: 1.45,
                  }}
                >
                  {addressLines(selectedAddress.address)
                    .filter(Boolean)
                    .join(', ')}
                </span>
              </>
            ) : (
              <span style={{ color: '#A39BB3' }}>
                {isLoading ? 'Loading…' : 'No address selected'}
              </span>
            )}
          </div>

          <div>
            <span style={summaryLabel}>Delivery Method</span>
            {shipping ? (
              <strong style={summaryValue}>
                {shippingOptionName(shipping)}
              </strong>
            ) : (
              <span style={{ color: '#A39BB3' }}>Not chosen yet</span>
            )}
          </div>

          <div>
            <span style={summaryLabel}>Receiving Contact</span>
            <strong style={summaryValue}>
              {contactName.trim() || '—'}
              {contactPhone.trim() && (
                <span style={{ fontWeight: 500, color: '#6E6781' }}>
                  {' '}
                  · {contactPhone.trim()}
                </span>
              )}
            </strong>
          </div>

          <div>
            <span style={summaryLabel}>Requested Delivery</span>
            {requestedDate ? (
              <strong style={summaryValue}>{formatDate(requestedDate)}</strong>
            ) : (
              <span style={{ color: '#A39BB3' }}>No date requested</span>
            )}
          </div>

          <div>
            <span style={summaryLabel}>PO Reference</span>
            <strong style={{ ...summaryValue, fontFamily: 'monospace' }}>
              {checkoutState.poReference || 'Pending Entry'}
            </strong>
          </div>
        </div>

        <div style={{ paddingTop: '14px', borderTop: '1px solid #F5EEF2' }}>
          <OrderTotals
            subtotal={subtotal}
            shippingMethod={shipping ? shippingOptionName(shipping) : null}
            shippingPrice={shipping ? Number(shipping.price) : null}
            total={total}
            pendingShippingText="Choose a method"
            totalNote="Excl. tax (On-Account)"
          />
        </div>

        {/* A note, not a warning: a quiet grey line rather than a green
            panel. */}
        <div
          style={{
            color: '#6E6781',
            fontSize: '0.76rem',
            display: 'flex',
            alignItems: 'flex-start',
            gap: '8px',
            lineHeight: 1.45,
          }}
        >
          <ShieldCheck
            size={16}
            color="#A39BB3"
            style={{ flexShrink: 0, marginTop: '1px' }}
          />
          <span>
            Physical packing slip and barcode manifest will be attached to
            cartons.
          </span>
        </div>
      </div>
    </div>
  )
}
