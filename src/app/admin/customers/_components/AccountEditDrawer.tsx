'use client'

import React, { useState } from 'react'
import { Drawer } from '@/components/ui/Drawer'
import { fieldOutline } from '@/components/ui/FormField'
import { useUpdateAccount } from '@/hooks/useAccounts'
import { PO_FORMAT_LEGEND_TEXT, previewPoFormat } from '@/lib/po-format'
import type { Account } from '@/types'
import type { AccountStatus, UpdateAccountInput } from '@/types/customers-admin'
import { CheckboxField, ErrorNote, Field } from './CustomerAdminUi'
import {
  MONEY_PATTERN,
  buttonStyle,
  fieldStyle,
  hintStyle,
  palette,
  sameMoney,
  toMoneyInput,
  useRetained,
} from './customerAdmin.shared'

interface AccountEditDrawerProps {
  /** The account to edit; null closes the drawer. */
  account: Account | null
  /** ACCOUNT_MANAGE. Without it the form is shown read-only. */
  canManage: boolean
  onClose: () => void
}

export function AccountEditDrawer({
  account,
  canManage,
  onClose,
}: AccountEditDrawerProps) {
  const shown = useRetained(account)

  return (
    <Drawer
      isOpen={account !== null}
      onClose={onClose}
      width="480px"
      title={shown ? `Edit account · ${shown.name}` : 'Edit account'}
    >
      {shown && (
        <AccountEditForm
          key={shown.id}
          account={shown}
          canManage={canManage}
          onDone={onClose}
        />
      )}
    </Drawer>
  )
}

const STATUS_OPTIONS: Array<{ value: AccountStatus; label: string }> = [
  { value: 'ACTIVE', label: 'Active' },
  { value: 'SUSPENDED', label: 'Suspended' },
  { value: 'INACTIVE', label: 'Inactive' },
]

/** Enough to catch a typo — the address is proved by the mail that follows. */
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

type FormErrors = {
  name?: string
  contactEmail?: string
  threshold?: string
}

function AccountEditForm({
  account,
  canManage,
  onDone,
}: {
  account: Account
  canManage: boolean
  onDone: () => void
}) {
  const update = useUpdateAccount()

  const [name, setName] = useState(account.name)
  const [status, setStatus] = useState<AccountStatus>(account.status)
  const [contactEmail, setContactEmail] = useState(account.contactEmail ?? '')
  const [contactPhone, setContactPhone] = useState(account.contactPhone ?? '')
  const [threshold, setThreshold] = useState(
    toMoneyInput(account.approvalThreshold)
  )
  const [requirePo, setRequirePo] = useState(account.requirePoNumber ?? false)
  const [poPrefix, setPoPrefix] = useState(account.poPrefix ?? '')
  const [poFormat, setPoFormat] = useState(account.poFormat ?? '')
  // Blank clears the format, so it is not an error to preview.
  const poFormatPreview = poFormat.trim() ? previewPoFormat(poFormat) : null
  // Checked as it is typed, so it needs no entry in `errors`: rewriting the
  // format is what clears it.
  const poFormatError =
    poFormatPreview?.ok === false
      ? `${poFormatPreview.message} PO format uses # for a digit, @ for a letter and YY for the year.`
      : null
  // Per-field, under the field it belongs to. The banner below is the API's.
  const [errors, setErrors] = useState<FormErrors>({})

  // Only what changed is sent: PATCH treats an omitted field as "leave alone"
  // and an explicit null as "clear", and a blanked-out field means the latter.
  const changes: UpdateAccountInput = {}
  if (name.trim() !== account.name) changes.name = name.trim()
  if (status !== account.status) changes.status = status
  if (contactEmail.trim() !== (account.contactEmail ?? ''))
    changes.contactEmail = contactEmail.trim() || null
  if (contactPhone.trim() !== (account.contactPhone ?? ''))
    changes.contactPhone = contactPhone.trim() || null
  if (!sameMoney(threshold, toMoneyInput(account.approvalThreshold)))
    changes.approvalThreshold = threshold.trim() || null
  if (requirePo !== (account.requirePoNumber ?? false))
    changes.requirePoNumber = requirePo
  if (poPrefix.trim() !== (account.poPrefix ?? ''))
    changes.poPrefix = poPrefix.trim() || null
  if (poFormat.trim() !== (account.poFormat ?? ''))
    changes.poFormat = poFormat.trim() || null

  const hasChanges = Object.keys(changes).length > 0
  const locked = !canManage || update.isPending

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    // Every field in one pass, so an account with three things wrong is not
    // discovered one refusal at a time.
    const found: FormErrors = {}
    if (!name.trim()) found.name = 'Enter an account name.'
    if (contactEmail.trim() && !EMAIL_PATTERN.test(contactEmail.trim()))
      found.contactEmail = 'Use a valid email address, like name@company.co.nz.'
    if (threshold.trim() && !MONEY_PATTERN.test(threshold.trim()))
      found.threshold =
        'Approval threshold must be an amount like 1500.00, or leave it empty for no threshold.'

    setErrors(found)
    if (Object.values(found).some(Boolean) || poFormatError) return

    if (!hasChanges) return

    try {
      await update.mutateAsync({ id: account.id, input: changes })
      onDone()
    } catch {
      // Rendered below from `update.error`.
    }
  }

  return (
    <form
      noValidate
      onSubmit={handleSubmit}
      style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}
    >
      {!canManage && (
        <ErrorNote message="You can view this account but not change it: that needs the account management permission." />
      )}

      <Field
        label="Account code"
        hint="Cannot be changed — it appears on invoices and purchase orders already issued."
      >
        <div
          style={{
            fontFamily: 'monospace',
            fontSize: '0.84rem',
            color: palette.secondary,
          }}
        >
          {account.accountCode}
        </div>
      </Field>

      <Field
        label="Account name *"
        htmlFor="account-edit-name"
        error={errors.name}
      >
        <input
          id="account-edit-name"
          type="text"
          maxLength={200}
          placeholder="e.g. Northbridge Health Group"
          value={name}
          disabled={locked}
          aria-invalid={errors.name ? true : undefined}
          onChange={(e) => {
            setName(e.target.value)
            setErrors((current) => ({ ...current, name: undefined }))
          }}
          style={{
            ...fieldStyle(locked),
            ...(errors.name ? fieldOutline(true) : {}),
          }}
        />
      </Field>

      <Field
        label="Status"
        htmlFor="account-edit-status"
        hint="To remove the account from listings altogether, use Deactivate on its row."
      >
        <select
          id="account-edit-status"
          value={status}
          disabled={locked}
          onChange={(e) => setStatus(e.target.value as AccountStatus)}
          style={fieldStyle(locked)}
        >
          {STATUS_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </Field>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
          gap: '12px',
        }}
      >
        <Field
          label="Contact email"
          htmlFor="account-edit-email"
          error={errors.contactEmail}
        >
          <input
            id="account-edit-email"
            type="text"
            inputMode="email"
            autoComplete="email"
            maxLength={254}
            placeholder="e.g. procurement@company.co.nz"
            value={contactEmail}
            disabled={locked}
            aria-invalid={errors.contactEmail ? true : undefined}
            onChange={(e) => {
              setContactEmail(e.target.value)
              setErrors((current) => ({ ...current, contactEmail: undefined }))
            }}
            style={{
              ...fieldStyle(locked),
              ...(errors.contactEmail ? fieldOutline(true) : {}),
            }}
          />
        </Field>
        <Field label="Contact phone" htmlFor="account-edit-phone">
          <input
            id="account-edit-phone"
            type="tel"
            maxLength={40}
            value={contactPhone}
            disabled={locked}
            onChange={(e) => setContactPhone(e.target.value)}
            style={fieldStyle(locked)}
          />
        </Field>
      </div>

      <Field
        label="Approval threshold"
        htmlFor="account-edit-threshold"
        hint="Orders above this total need approval. Leave blank for no threshold."
        error={errors.threshold}
      >
        <input
          id="account-edit-threshold"
          type="text"
          inputMode="decimal"
          placeholder="e.g. 1500.00"
          value={threshold}
          disabled={locked}
          aria-invalid={errors.threshold ? true : undefined}
          onChange={(e) => {
            setThreshold(e.target.value)
            setErrors((current) => ({ ...current, threshold: undefined }))
          }}
          style={{
            ...fieldStyle(locked),
            ...(errors.threshold ? fieldOutline(true) : {}),
          }}
        />
      </Field>

      <CheckboxField
        id="account-edit-require-po"
        label="Require a purchase order number at checkout"
        checked={requirePo}
        disabled={locked}
        onChange={setRequirePo}
      />

      <Field
        label="PO prefix"
        htmlFor="account-edit-po-prefix"
        hint="Put in front of every purchase order this account raises."
      >
        <input
          id="account-edit-po-prefix"
          type="text"
          maxLength={32}
          placeholder="e.g. PO-STJ"
          value={poPrefix}
          disabled={locked}
          onChange={(e) => setPoPrefix(e.target.value)}
          style={fieldStyle(locked)}
        />
      </Field>

      <Field
        label="PO format"
        htmlFor="account-edit-po-format"
        hint={
          poFormatPreview?.ok
            ? `A valid reference looks like ${poFormatPreview.example}. ${PO_FORMAT_LEGEND_TEXT}.`
            : `Optional — a mask such as PO-####-YY. ${PO_FORMAT_LEGEND_TEXT}. A site may set its own.`
        }
        error={poFormatError}
      >
        <input
          id="account-edit-po-format"
          type="text"
          maxLength={64}
          placeholder="e.g. PO-####-YY"
          value={poFormat}
          disabled={locked}
          aria-invalid={poFormatError ? true : undefined}
          onChange={(e) => setPoFormat(e.target.value)}
          style={{
            ...fieldStyle(locked),
            fontFamily: 'monospace',
            ...(poFormatError ? fieldOutline(true) : {}),
          }}
        />
      </Field>

      <ErrorNote error={update.error} />

      <div
        style={{
          display: 'flex',
          justifyContent: 'flex-end',
          alignItems: 'center',
          gap: '8px',
        }}
      >
        {canManage && !hasChanges && (
          <span style={{ ...hintStyle, marginTop: 0, marginRight: 'auto' }}>
            No changes yet
          </span>
        )}
        <button
          type="button"
          onClick={onDone}
          disabled={update.isPending}
          style={buttonStyle('secondary', update.isPending)}
        >
          {canManage ? 'Cancel' : 'Close'}
        </button>
        {canManage && (
          <button
            type="submit"
            disabled={locked || !hasChanges}
            style={buttonStyle('primary', locked || !hasChanges)}
          >
            {update.isPending ? 'Saving…' : 'Save changes'}
          </button>
        )}
      </div>
    </form>
  )
}
