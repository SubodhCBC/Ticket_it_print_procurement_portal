'use client'

import { SkeletonForm } from '@/components/ui/Skeleton'
import React, { useState } from 'react'
import { BadgeCheck, MapPin, Plus, Search } from 'lucide-react'
import { Drawer } from '@/components/ui/Drawer'
import { PO_FORMAT_LEGEND_TEXT, previewPoFormat } from '@/lib/po-format'
import {
  useAddSiteAddress,
  useSiteRecord,
  useUpdateSite,
  useValidateSiteAddress,
} from '@/hooks/useAccounts'
import { searchDeliveryAddresses } from '@/services/data-source/api/api-cart.adapter'
import type { ApiAddressSuggestion } from '@/services/data-source/api/cart.types'
import type {
  AddressKind,
  NewSiteAddressInput,
  SiteAddressRecord,
  SiteRecord,
  SiteStatus,
  UpdateSiteInput,
} from '@/types/customers-admin'
import {
  CheckboxField,
  CustomerStatusBadge,
  ErrorNote,
  Field,
  SuccessNote,
  Tag,
} from './CustomerAdminUi'
import {
  MONEY_PATTERN,
  buttonStyle,
  errorMessage,
  fieldStyle,
  hintStyle,
  palette,
  sameMoney,
  sectionTitleStyle,
  toMoneyInput,
  useRetained,
} from './customerAdmin.shared'

interface SiteEditDrawerProps {
  /** The branch to open, as listed; null closes the drawer. */
  site: SiteRecord | null
  /** SITE_MANAGE. Without it the drawer is read-only. */
  canManage: boolean
  onClose: () => void
}

/**
 * A branch: its settings and its addresses.
 *
 * Opens on the row already listed and loads GET /sites/:id before showing the
 * forms, so the fields and addresses are current even if the list is a couple
 * of minutes old.
 */
export function SiteEditDrawer({
  site,
  canManage,
  onClose,
}: SiteEditDrawerProps) {
  const shown = useRetained(site)
  // Asked for only while open (from `site`, not the retained copy), so
  // deactivating the branch after closing the drawer does not refetch it into
  // a 404.
  const { data, error, isFetchedAfterMount } = useSiteRecord(
    site?.id ?? null,
    site?.accountId
  )
  // The forms start from the branch as fetched for this opening — not from the
  // list row, which may be minutes old, nor from cached detail of an earlier
  // opening, which is shown while it refreshes. Either seeded the fields with
  // values that no longer matched once the fresh detail arrived under the same
  // key, so they read as edits and Save wrote them back.
  const fresh = data !== null && isFetchedAfterMount ? data : null
  // Closing idles the query: keep the last fresh detail on screen while the
  // drawer animates out, provided it is this branch's.
  const lastFresh = useRetained(fresh)
  const detail =
    site !== null ? fresh : lastFresh?.id === shown?.id ? lastFresh : null
  // The header is read-only, so the listed row will do until then.
  const header = detail ?? shown

  return (
    <Drawer
      isOpen={site !== null}
      onClose={onClose}
      width="540px"
      title={
        header ? (
          <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <MapPin size={16} color={palette.muted} />
            {header.name}
          </span>
        ) : (
          'Branch'
        )
      }
    >
      {header && (
        <>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              flexWrap: 'wrap',
              fontSize: '0.78rem',
              color: palette.secondary,
            }}
          >
            <span style={{ fontFamily: 'monospace' }}>{header.code}</span>
            {header.accountName && <span>· {header.accountName}</span>}
            <CustomerStatusBadge status={header.status} />
          </div>

          {error && (
            <ErrorNote
              message={`Could not ${detail ? 'refresh' : 'load'} this branch: ${errorMessage(error)}`}
            />
          )}
          {!canManage && (
            <ErrorNote message="You can view this branch but not change it: that needs the site management permission." />
          )}

          {detail ? (
            <>
              <SiteSettingsForm
                key={detail.id}
                site={detail}
                canManage={canManage}
              />
              <SiteAddressesSection
                key={`addresses-${detail.id}`}
                site={detail}
                canManage={canManage}
              />
            </>
          ) : (
            site !== null &&
            !error && <SkeletonForm fields={6} label="Loading branch" />
          )}
        </>
      )}
    </Drawer>
  )
}

// --- Settings ----------------------------------------------------------------------

function SiteSettingsForm({
  site,
  canManage,
}: {
  site: SiteRecord
  canManage: boolean
}) {
  const update = useUpdateSite()

  const [name, setName] = useState(site.name)
  const [status, setStatus] = useState<SiteStatus>(site.status)
  const [budget, setBudget] = useState(toMoneyInput(site.monthlyBudget))
  const [poRequired, setPoRequired] = useState(site.poRequired)
  const [poPrefix, setPoPrefix] = useState(site.poPrefix ?? '')
  const [poFormat, setPoFormat] = useState(site.poFormat ?? '')
  // Blank clears the format, so it is not an error to preview.
  const poFormatPreview = poFormat.trim() ? previewPoFormat(poFormat) : null
  const [costCentre, setCostCentre] = useState(site.costCentre ?? '')
  const [localError, setLocalError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  const changes: UpdateSiteInput = {}
  if (name.trim() !== site.name) changes.name = name.trim()
  if (status !== site.status) changes.status = status
  if (!sameMoney(budget, toMoneyInput(site.monthlyBudget)))
    changes.monthlyBudget = budget.trim() || null
  if (poRequired !== site.poRequired) changes.poRequired = poRequired
  if (poPrefix.trim() !== (site.poPrefix ?? ''))
    changes.poPrefix = poPrefix.trim() || null
  if (poFormat.trim() !== (site.poFormat ?? ''))
    changes.poFormat = poFormat.trim() || null
  if (costCentre.trim() !== (site.costCentre ?? ''))
    changes.costCentre = costCentre.trim() || null

  const hasChanges = Object.keys(changes).length > 0
  const locked = !canManage || update.isPending

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLocalError(null)
    setSaved(false)

    if (!name.trim()) {
      setLocalError('Branch name is required.')
      return
    }
    if (budget.trim() && !MONEY_PATTERN.test(budget.trim())) {
      setLocalError('Monthly budget must be an amount such as 1500.00.')
      return
    }
    if (!hasChanges) return

    try {
      await update.mutateAsync({
        id: site.id,
        accountId: site.accountId,
        input: changes,
      })
      setSaved(true)
    } catch {
      // Rendered below from `update.error`.
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}
    >
      <h3 style={sectionTitleStyle}>Settings</h3>

      <Field
        label="Site code"
        hint="Cannot be changed — it appears on purchase orders and invoices already issued."
      >
        <div
          style={{
            fontFamily: 'monospace',
            fontSize: '0.84rem',
            color: palette.secondary,
          }}
        >
          {site.code}
        </div>
      </Field>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: '12px',
        }}
      >
        <Field label="Branch name *" htmlFor="site-edit-name">
          <input
            id="site-edit-name"
            type="text"
            required
            maxLength={200}
            value={name}
            disabled={locked}
            onChange={(e) => setName(e.target.value)}
            style={fieldStyle(locked)}
          />
        </Field>
        <Field label="Status" htmlFor="site-edit-status">
          <select
            id="site-edit-status"
            value={status}
            disabled={locked}
            onChange={(e) => setStatus(e.target.value as SiteStatus)}
            style={fieldStyle(locked)}
          >
            <option value="ACTIVE">Active</option>
            <option value="INACTIVE">Inactive</option>
          </select>
        </Field>
        <Field
          label="Monthly budget"
          htmlFor="site-edit-budget"
          hint="Leave blank for no cap."
        >
          <input
            id="site-edit-budget"
            type="text"
            inputMode="decimal"
            placeholder="e.g. 2500.00"
            value={budget}
            disabled={locked}
            onChange={(e) => setBudget(e.target.value)}
            style={fieldStyle(locked)}
          />
        </Field>
        <Field label="Cost centre" htmlFor="site-edit-cost-centre">
          <input
            id="site-edit-cost-centre"
            type="text"
            maxLength={64}
            value={costCentre}
            disabled={locked}
            onChange={(e) => setCostCentre(e.target.value)}
            style={fieldStyle(locked)}
          />
        </Field>
        <Field label="PO prefix" htmlFor="site-edit-po-prefix">
          <input
            id="site-edit-po-prefix"
            type="text"
            maxLength={32}
            value={poPrefix}
            disabled={locked}
            onChange={(e) => setPoPrefix(e.target.value)}
            style={fieldStyle(locked)}
          />
        </Field>
      </div>

      <Field
        label="PO format"
        htmlFor="site-edit-po-format"
        hint={
          poFormatPreview === null
            ? `Optional; overrides the account's format. e.g. PO-####-YY. ${PO_FORMAT_LEGEND_TEXT}.`
            : poFormatPreview.ok
              ? `A valid reference looks like ${poFormatPreview.example}. ${PO_FORMAT_LEGEND_TEXT}.`
              : poFormatPreview.message
        }
      >
        <input
          id="site-edit-po-format"
          type="text"
          maxLength={64}
          placeholder="e.g. PO-####-YY"
          value={poFormat}
          disabled={locked}
          aria-invalid={poFormatPreview?.ok === false || undefined}
          onChange={(e) => setPoFormat(e.target.value)}
          style={{
            ...fieldStyle(locked),
            fontFamily: 'monospace',
            ...(poFormatPreview?.ok === false
              ? { borderColor: '#DC2626' }
              : {}),
          }}
        />
      </Field>

      <CheckboxField
        id="site-edit-po-required"
        label="Require a purchase order number for this branch"
        checked={poRequired}
        disabled={locked}
        onChange={setPoRequired}
      />

      <ErrorNote message={localError} />
      <ErrorNote error={update.error} />
      {saved && !hasChanges && (
        <SuccessNote>Branch settings saved.</SuccessNote>
      )}

      {canManage && (
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button
            type="submit"
            disabled={locked || !hasChanges}
            style={buttonStyle('primary', locked || !hasChanges)}
          >
            {update.isPending ? 'Saving…' : 'Save settings'}
          </button>
        </div>
      )}
    </form>
  )
}

// --- Addresses ---------------------------------------------------------------------

const KIND_LABELS: Record<AddressKind, string> = {
  BILLING: 'Billing',
  SHIPPING: 'Shipping',
}

function SiteAddressesSection({
  site,
  canManage,
}: {
  site: SiteRecord
  canManage: boolean
}) {
  const [adding, setAdding] = useState(false)
  const [added, setAdded] = useState(false)

  return (
    <section
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '10px',
        borderTop: `1px solid ${palette.divider}`,
        paddingTop: '16px',
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
        <h3 style={sectionTitleStyle}>
          Addresses{' '}
          <span style={{ color: palette.muted, fontWeight: 500 }}>
            ({site.addresses.length})
          </span>
        </h3>
        {canManage && !adding && (
          <button
            type="button"
            onClick={() => {
              setAdded(false)
              setAdding(true)
            }}
            style={{
              ...buttonStyle('secondary'),
              padding: '5px 10px',
              fontSize: '0.76rem',
            }}
          >
            <Plus size={14} />
            Add address
          </button>
        )}
      </div>

      {added && <SuccessNote>Address added.</SuccessNote>}

      {site.addresses.length === 0 ? (
        <div style={{ ...hintStyle, marginTop: 0 }}>
          No addresses on file. Checkout delivers to a branch&apos;s shipping
          addresses, so add at least one.
        </div>
      ) : (
        site.addresses.map((address) => (
          <AddressCard
            key={address.id}
            address={address}
            site={site}
            canManage={canManage}
          />
        ))
      )}

      {adding && (
        <SiteAddressForm
          site={site}
          onCancel={() => setAdding(false)}
          onAdded={() => {
            setAdding(false)
            setAdded(true)
          }}
        />
      )}
    </section>
  )
}

function AddressCard({
  address,
  site,
  canManage,
}: {
  address: SiteAddressRecord
  site: SiteRecord
  canManage: boolean
}) {
  const locality = [address.city, address.region, address.postcode]
    .filter(Boolean)
    .join(', ')

  return (
    <div
      style={{
        border: `1px solid ${palette.border}`,
        borderRadius: '10px',
        padding: '10px 12px',
        fontSize: '0.8rem',
        color: palette.label,
        lineHeight: 1.45,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          flexWrap: 'wrap',
          marginBottom: '4px',
        }}
      >
        <Tag>{KIND_LABELS[address.kind]}</Tag>
        {address.isDefault && <Tag>Default</Tag>}
        {address.label && (
          <span style={{ fontWeight: 600, color: palette.text }}>
            {address.label}
          </span>
        )}
      </div>
      {address.recipientName && <div>{address.recipientName}</div>}
      <div>{address.line1}</div>
      {address.line2 && <div>{address.line2}</div>}
      <div>
        {locality} · {address.country}
      </div>
      {address.phone && (
        <div style={{ color: palette.muted }}>{address.phone}</div>
      )}
      <AddressCheck address={address} site={site} canManage={canManage} />
    </div>
  )
}

/**
 * "Address check" (SOW F-16): finds the address in NZ Post and stores NZ Post's
 * version of it — its lines, DPID and rural flag — so checkout and the courier
 * label use a verified address. Already-checked addresses show what NZ Post said.
 */
function AddressCheck({
  address,
  site,
  canManage,
}: {
  address: SiteAddressRecord
  site: SiteRecord
  canManage: boolean
}) {
  const validate = useValidateSiteAddress()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<ApiAddressSuggestion[] | null>(null)
  const [searching, setSearching] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  const checked = Boolean(address.nzPostValidatedAt)

  const start = () => {
    setQuery(
      [address.line1, address.line2, address.city, address.postcode]
        .filter(Boolean)
        .join(', ')
    )
    setResults(null)
    setError(null)
    setDone(false)
    setOpen(true)
  }

  const search = async () => {
    const q = query.trim()
    if (q.length < 4) {
      setError('Type at least four characters of the address.')
      return
    }
    setSearching(true)
    setError(null)
    try {
      setResults(await searchDeliveryAddresses(q, 6))
    } catch (err) {
      setResults(null)
      setError(errorMessage(err))
    } finally {
      setSearching(false)
    }
  }

  const choose = async (suggestion: ApiAddressSuggestion) => {
    setError(null)
    try {
      await validate.mutateAsync({
        siteId: site.id,
        accountId: site.accountId,
        addressId: address.id,
        nzPostAddressId: suggestion.addressId,
      })
      setOpen(false)
      setDone(true)
    } catch (err) {
      setError(errorMessage(err))
    }
  }

  return (
    <div style={{ marginTop: '6px' }}>
      {checked ? (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            flexWrap: 'wrap',
            color: '#228B53',
            fontSize: '0.74rem',
            fontWeight: 600,
          }}
        >
          <BadgeCheck size={13} />
          NZ Post verified
          {address.dpid && (
            <span style={{ color: palette.muted, fontWeight: 400 }}>
              · DPID {address.dpid}
            </span>
          )}
          {address.isRural && <Tag>Rural delivery</Tag>}
          {done && (
            <span style={{ color: palette.muted, fontWeight: 400 }}>
              · just updated
            </span>
          )}
        </div>
      ) : (
        <div style={{ ...hintStyle, marginTop: 0 }}>
          Not checked against NZ Post.
        </div>
      )}

      {canManage && !open && (
        <button
          type="button"
          onClick={start}
          style={{
            ...buttonStyle('secondary'),
            marginTop: '6px',
            padding: '4px 10px',
            fontSize: '0.74rem',
          }}
        >
          <Search size={12} />
          {checked ? 'Check again' : 'Address check'}
        </button>
      )}

      {open && (
        <div
          style={{
            marginTop: '8px',
            display: 'flex',
            flexDirection: 'column',
            gap: '6px',
          }}
        >
          <div style={{ display: 'flex', gap: '6px' }}>
            <input
              aria-label="Search NZ Post for this address"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  void search()
                }
              }}
              style={{ ...fieldStyle(), flex: 1, minWidth: 0 }}
            />
            <button
              type="button"
              onClick={() => void search()}
              disabled={searching}
              style={buttonStyle('primary', searching)}
            >
              {searching ? 'Searching…' : 'Search'}
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              style={buttonStyle('secondary')}
            >
              Cancel
            </button>
          </div>

          {results && results.length === 0 && (
            <div style={{ ...hintStyle, marginTop: 0 }}>
              NZ Post found no match. Try fewer words, such as the street and
              suburb.
            </div>
          )}
          {results && results.length > 0 && (
            <ul
              style={{
                listStyle: 'none',
                margin: 0,
                padding: 0,
                display: 'flex',
                flexDirection: 'column',
                gap: '4px',
              }}
            >
              {results.map((suggestion) => (
                <li key={suggestion.addressId}>
                  <button
                    type="button"
                    disabled={validate.isPending}
                    onClick={() => void choose(suggestion)}
                    style={{
                      width: '100%',
                      textAlign: 'left',
                      padding: '6px 8px',
                      borderRadius: '8px',
                      border: `1px solid ${palette.border}`,
                      backgroundColor: '#FFFFFF',
                      color: palette.text,
                      fontSize: '0.76rem',
                      cursor: validate.isPending ? 'wait' : 'pointer',
                    }}
                  >
                    {suggestion.fullAddress}
                  </button>
                </li>
              ))}
            </ul>
          )}
          <div style={{ ...hintStyle, marginTop: 0 }}>
            Choosing a result replaces this address&apos;s street, suburb, city
            and postcode with NZ Post&apos;s. A unit or level typed on line 2 is
            kept.
          </div>
          {error && <ErrorNote message={error} />}
        </div>
      )}
    </div>
  )
}

function SiteAddressForm({
  site,
  onCancel,
  onAdded,
}: {
  site: SiteRecord
  onCancel: () => void
  onAdded: () => void
}) {
  const add = useAddSiteAddress()
  const hasDefault = (kind: AddressKind) =>
    site.addresses.some((address) => address.kind === kind && address.isDefault)

  const [kind, setKind] = useState<AddressKind>('SHIPPING')
  const [label, setLabel] = useState('')
  const [recipientName, setRecipientName] = useState('')
  const [line1, setLine1] = useState('')
  const [line2, setLine2] = useState('')
  const [city, setCity] = useState('')
  const [region, setRegion] = useState('')
  const [postcode, setPostcode] = useState('')
  const [country, setCountry] = useState('NZ')
  const [phone, setPhone] = useState('')
  // The first address of a kind is the obvious default; after that it is a
  // deliberate choice, because setting it clears the existing default.
  const [isDefault, setIsDefault] = useState(!hasDefault('SHIPPING'))
  const [localError, setLocalError] = useState<string | null>(null)
  // The NZ Post result the address was found as, if it was.
  const [nzPost, setNzPost] = useState<ApiAddressSuggestion | null>(null)
  const locked = add.isPending

  /**
   * Fills the empty lines from NZ Post's one-line address — "12 Queen Street,
   * Auckland Central, Auckland 1010" — so the form reads as the address. The
   * server replaces them with NZ Post's own on save anyway.
   */
  const applyNzPost = (suggestion: ApiAddressSuggestion) => {
    setNzPost(suggestion)
    const parts = suggestion.fullAddress.split(',').map((part) => part.trim())
    const last = parts[parts.length - 1] ?? ''
    const postcodeMatch = last.match(/\s(\d{4})$/)
    setLine1(parts[0] ?? '')
    if (parts.length > 2) setLine2(parts.slice(1, -1).join(', '))
    setCity(postcodeMatch ? last.slice(0, postcodeMatch.index).trim() : last)
    if (postcodeMatch) setPostcode(postcodeMatch[1])
    setCountry('NZ')
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLocalError(null)

    if (!line1.trim() || !city.trim() || !postcode.trim()) {
      setLocalError('Address line 1, city and postcode are required.')
      return
    }
    if (!/^[A-Za-z]{2}$/.test(country.trim())) {
      setLocalError('Country must be a two-letter code such as NZ or AU.')
      return
    }

    // Optional fields are omitted when blank rather than sent empty: the API
    // accepts them as absent, not as null.
    const optional = (value: string) => value.trim() || undefined
    const input: NewSiteAddressInput = {
      kind,
      label: optional(label),
      recipientName: optional(recipientName),
      line1: line1.trim(),
      line2: optional(line2),
      city: city.trim(),
      region: optional(region),
      postcode: postcode.trim(),
      country: country.trim().toUpperCase(),
      phone: optional(phone),
      isDefault,
      ...(nzPost ? { nzPostAddressId: nzPost.addressId } : {}),
    }

    try {
      await add.mutateAsync({
        siteId: site.id,
        accountId: site.accountId,
        input,
      })
      onAdded()
    } catch {
      // Rendered below from `add.error`.
    }
  }

  const input = (
    id: string,
    labelText: string,
    value: string,
    onChange: (value: string) => void,
    options: {
      required?: boolean
      maxLength?: number
      placeholder?: string
    } = {}
  ) => (
    <Field label={`${labelText}${options.required ? ' *' : ''}`} htmlFor={id}>
      <input
        id={id}
        type="text"
        value={value}
        required={options.required}
        maxLength={options.maxLength}
        placeholder={options.placeholder}
        disabled={locked}
        onChange={(e) => onChange(e.target.value)}
        style={fieldStyle(locked)}
      />
    </Field>
  )

  return (
    <form
      onSubmit={handleSubmit}
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '12px',
        border: `1px solid ${palette.border}`,
        borderRadius: '12px',
        padding: '14px',
        backgroundColor: palette.page,
      }}
    >
      <div
        style={{ fontWeight: 600, fontSize: '0.84rem', color: palette.text }}
      >
        New address
      </div>

      {nzPost ? (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            flexWrap: 'wrap',
            fontSize: '0.78rem',
            color: '#228B53',
            fontWeight: 600,
          }}
        >
          <BadgeCheck size={14} />
          Found in NZ Post: {nzPost.fullAddress}
          <button
            type="button"
            onClick={() => setNzPost(null)}
            disabled={locked}
            style={{
              ...buttonStyle('secondary', locked),
              padding: '2px 8px',
              fontSize: '0.72rem',
            }}
          >
            Enter by hand instead
          </button>
        </div>
      ) : (
        <NzPostAddressSearch disabled={locked} onChoose={applyNzPost} />
      )}

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
          gap: '10px',
        }}
      >
        <Field label="Kind *" htmlFor="address-kind">
          <select
            id="address-kind"
            value={kind}
            disabled={locked}
            onChange={(e) => {
              const next = e.target.value as AddressKind
              setKind(next)
              setIsDefault(!hasDefault(next))
            }}
            style={fieldStyle(locked)}
          >
            <option value="SHIPPING">Shipping</option>
            <option value="BILLING">Billing</option>
          </select>
        </Field>
        {input('address-label', 'Label', label, setLabel, {
          maxLength: 120,
          placeholder: 'e.g. Loading dock',
        })}
        {input(
          'address-recipient',
          'Recipient',
          recipientName,
          setRecipientName,
          {
            maxLength: 160,
          }
        )}
        {input('address-phone', 'Phone', phone, setPhone, { maxLength: 40 })}
      </div>

      {input('address-line1', 'Address line 1', line1, setLine1, {
        required: true,
        maxLength: 200,
      })}
      {input('address-line2', 'Address line 2', line2, setLine2, {
        maxLength: 200,
      })}

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))',
          gap: '10px',
        }}
      >
        {input('address-city', 'City', city, setCity, {
          required: true,
          maxLength: 120,
        })}
        {input('address-region', 'Region', region, setRegion, {
          maxLength: 120,
        })}
        {input('address-postcode', 'Postcode', postcode, setPostcode, {
          required: true,
          maxLength: 24,
        })}
        <Field label="Country *" htmlFor="address-country">
          <input
            id="address-country"
            type="text"
            required
            maxLength={2}
            value={country}
            disabled={locked}
            onChange={(e) => setCountry(e.target.value.toUpperCase())}
            style={{ ...fieldStyle(locked), textTransform: 'uppercase' }}
          />
        </Field>
      </div>

      <CheckboxField
        id="address-default"
        label={
          hasDefault(kind)
            ? `Make this the default ${KIND_LABELS[kind].toLowerCase()} address (replaces the current default)`
            : `Default ${KIND_LABELS[kind].toLowerCase()} address`
        }
        checked={isDefault}
        disabled={locked}
        onChange={setIsDefault}
      />

      <ErrorNote message={localError} />
      <ErrorNote error={add.error} />

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
        <button
          type="button"
          onClick={onCancel}
          disabled={locked}
          style={buttonStyle('secondary', locked)}
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={locked}
          style={buttonStyle('primary', locked)}
        >
          {add.isPending ? 'Adding…' : 'Add address'}
        </button>
      </div>
    </form>
  )
}

/**
 * Finds an address in NZ Post's ParcelAddress, for the new-address form: the
 * address is then saved with NZ Post's lines, DPID and rural flag (SOW F-16).
 */
function NzPostAddressSearch({
  disabled,
  onChoose,
}: {
  disabled: boolean
  onChoose: (suggestion: ApiAddressSuggestion) => void
}) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<ApiAddressSuggestion[] | null>(null)
  const [searching, setSearching] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const search = async () => {
    const q = query.trim()
    if (q.length < 4) {
      setError('Type at least four characters of the address.')
      return
    }
    setSearching(true)
    setError(null)
    try {
      setResults(await searchDeliveryAddresses(q, 6))
    } catch (err) {
      setResults(null)
      setError(errorMessage(err))
    } finally {
      setSearching(false)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
      <div style={{ display: 'flex', gap: '6px' }}>
        <input
          aria-label="Find the address in NZ Post"
          placeholder="Find in NZ Post, e.g. 12 Queen Street Auckland"
          value={query}
          disabled={disabled}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              void search()
            }
          }}
          style={{ ...fieldStyle(disabled), flex: 1, minWidth: 0 }}
        />
        <button
          type="button"
          onClick={() => void search()}
          disabled={disabled || searching}
          style={buttonStyle('secondary', disabled || searching)}
        >
          <Search size={13} />
          {searching ? 'Searching…' : 'Find'}
        </button>
      </div>
      {results && results.length === 0 && (
        <div style={{ ...hintStyle, marginTop: 0 }}>
          NZ Post found no match. Enter the address below by hand.
        </div>
      )}
      {results && results.length > 0 && (
        <ul
          style={{
            listStyle: 'none',
            margin: 0,
            padding: 0,
            display: 'flex',
            flexDirection: 'column',
            gap: '4px',
          }}
        >
          {results.map((suggestion) => (
            <li key={suggestion.addressId}>
              <button
                type="button"
                disabled={disabled}
                onClick={() => {
                  setResults(null)
                  onChoose(suggestion)
                }}
                style={{
                  width: '100%',
                  textAlign: 'left',
                  padding: '6px 8px',
                  borderRadius: '8px',
                  border: `1px solid ${palette.border}`,
                  backgroundColor: '#FFFFFF',
                  color: palette.text,
                  fontSize: '0.76rem',
                  cursor: 'pointer',
                }}
              >
                {suggestion.fullAddress}
              </button>
            </li>
          ))}
        </ul>
      )}
      <div style={{ ...hintStyle, marginTop: 0 }}>
        Optional. A New Zealand address found here is saved as NZ Post has it,
        with its delivery point and rural flag.
      </div>
      {error && <ErrorNote message={error} />}
    </div>
  )
}
