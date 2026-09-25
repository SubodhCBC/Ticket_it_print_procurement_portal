// src/components/admin/ApprovalRuleFormDrawer.tsx
'use client'

import { useState, type FormEvent, type ReactNode } from 'react'
import { AlertTriangle } from 'lucide-react'
import { Drawer } from '@/components/ui/Drawer'
import { useApprovalRuleMutations } from '@/hooks/useApprovals'
import type {
  ApprovalPortalRole,
  ApprovalRuleFields,
  ApprovalRuleView,
} from '@/services/data-source/api/approval.types'
import type { PortalUser, ProductCategory, Site } from '@/types'
import {
  APPROVAL_COLORS,
  disabledLook,
  errorBanner,
  errorMessage,
  fieldControl,
  fieldError,
  fieldHint,
  fieldLabel,
  primaryButton,
  ROLE_LABELS,
  secondaryButton,
  warningBanner,
} from './ApprovalShared'

const C = APPROVAL_COLORS
const FORM_ID = 'approval-rule-form'
/** The API's money format: up to ten digits and two decimals. */
const MONEY = /^\d{1,10}(\.\d{1,2})?$/
const ROLE_OPTIONS: ApprovalPortalRole[] = ['HEAD_OFFICE', 'ADMIN', 'SITE_USER']

type ApproverType = 'role' | 'user'

interface FormState {
  name: string
  description: string
  active: boolean
  tier: string
  minTotal: string
  categoryId: string
  requesterRole: ApprovalPortalRole | ''
  siteId: string
  approverType: ApproverType
  approverRole: ApprovalPortalRole | ''
  approverUserId: string
}

type FormErrors = Partial<Record<keyof FormState, string>>

function initialState(rule: ApprovalRuleView | null): FormState {
  return {
    name: rule?.name ?? '',
    description: rule?.description ?? '',
    active: rule?.active ?? true,
    tier: String(rule?.tier ?? 1),
    minTotal: rule?.minTotal ?? '',
    categoryId: rule?.categoryId ?? '',
    requesterRole: rule?.requesterRole ?? '',
    siteId: rule?.siteId ?? '',
    approverType: rule?.approverUserId ? 'user' : 'role',
    // A new rule starts with the usual answer — head office signs off.
    approverRole: rule ? (rule.approverRole ?? '') : 'HEAD_OFFICE',
    approverUserId: rule?.approverUserId ?? '',
  }
}

function validate(state: FormState): FormErrors {
  const errors: FormErrors = {}

  const name = state.name.trim()
  if (!name) errors.name = 'Give the rule a name.'
  else if (name.length > 200) errors.name = 'Keep the name to 200 characters.'

  if (state.description.trim().length > 1000) {
    errors.description = 'Keep the description to 1000 characters.'
  }

  const tier = Number(state.tier)
  if (!Number.isInteger(tier) || tier < 1 || tier > 20) {
    errors.tier = 'A whole number from 1 to 20.'
  }

  const minTotal = state.minTotal.trim()
  if (minTotal && !MONEY.test(minTotal)) {
    errors.minTotal = 'An amount such as 1000 or 1000.00.'
  }

  if (state.approverType === 'role' && !state.approverRole) {
    errors.approverRole = 'Choose the role that approves.'
  }
  if (state.approverType === 'user' && !state.approverUserId) {
    errors.approverUserId = 'Choose the person who approves.'
  }

  return errors
}

function toFields(state: FormState): ApprovalRuleFields {
  return {
    name: state.name.trim(),
    description: state.description.trim() || null,
    active: state.active,
    tier: Number(state.tier),
    minTotal: state.minTotal.trim() || null,
    categoryId: state.categoryId || null,
    requesterRole: state.requesterRole || null,
    siteId: state.siteId || null,
    // Exactly one approver. The other is cleared explicitly, so switching a
    // rule from a role to a person never leaves both set.
    approverRole:
      state.approverType === 'role' ? state.approverRole || null : null,
    approverUserId:
      state.approverType === 'user' ? state.approverUserId || null : null,
  }
}

function Section({
  title,
  description,
  children,
}: {
  title: string
  description?: string
  children: ReactNode
}) {
  return (
    <fieldset
      style={{
        border: 'none',
        margin: 0,
        padding: 0,
        display: 'flex',
        flexDirection: 'column',
        gap: '12px',
      }}
    >
      <legend style={{ padding: 0, marginBottom: '4px' }}>
        <span
          style={{
            display: 'block',
            fontSize: '0.86rem',
            fontWeight: 700,
            color: C.text,
          }}
        >
          {title}
        </span>
        {description && (
          <span
            style={{
              display: 'block',
              fontSize: '0.74rem',
              color: C.secondary,
              marginTop: '2px',
            }}
          >
            {description}
          </span>
        )}
      </legend>
      {children}
    </fieldset>
  )
}

function Field({
  label,
  htmlFor,
  optional,
  hint,
  error,
  children,
}: {
  label: string
  htmlFor?: string
  optional?: boolean
  hint?: string
  error?: string
  children: ReactNode
}) {
  return (
    <div style={{ minWidth: 0 }}>
      <label htmlFor={htmlFor} style={fieldLabel}>
        {label}
        {optional && (
          <span style={{ fontWeight: 400, color: C.muted }}> (optional)</span>
        )}
      </label>
      {children}
      {error ? (
        <div role="alert" style={fieldError}>
          {error}
        </div>
      ) : (
        hint && <div style={fieldHint}>{hint}</div>
      )}
    </div>
  )
}

/**
 * Create or edit one approval rule.
 *
 * The parent remounts this with a fresh `key` each time it opens, so the form
 * always starts from the rule it was opened for.
 */
export function ApprovalRuleFormDrawer({
  isOpen,
  onClose,
  rule,
  accountId,
  accountLabel,
  sendAccountId,
  sites,
  users,
  categories,
  onSaved,
}: {
  isOpen: boolean
  onClose: () => void
  /** `null` to create. */
  rule: ApprovalRuleView | null
  accountId: string
  accountLabel?: string
  /** Administrators name the account; everyone else writes to their own. */
  sendAccountId: boolean
  sites: readonly Site[]
  users: readonly PortalUser[]
  categories: readonly ProductCategory[]
  onSaved: (rule: ApprovalRuleView, kind: 'created' | 'updated') => void
}) {
  const { createRule, updateRule, isSaving } = useApprovalRuleMutations()

  const [state, setState] = useState<FormState>(() => initialState(rule))
  const [errors, setErrors] = useState<FormErrors>({})
  const [serverError, setServerError] = useState<string | null>(null)

  const update = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setState((previous) => ({ ...previous, [key]: value }))
    setErrors((previous) => ({ ...previous, [key]: undefined }))
  }

  const close = () => {
    if (!isSaving) onClose()
  }

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()

    const found = validate(state)
    setErrors(found)
    if (Object.values(found).some(Boolean)) return

    setServerError(null)
    const fields = toFields(state)

    try {
      const saved = rule
        ? await updateRule(rule.id, fields)
        : await createRule({
            ...fields,
            ...(sendAccountId && accountId ? { accountId } : {}),
          })
      onSaved(saved, rule ? 'updated' : 'created')
    } catch (error) {
      setServerError(errorMessage(error, 'The rule could not be saved.'))
    }
  }

  const noConditions =
    !state.minTotal.trim() &&
    !state.categoryId &&
    !state.requesterRole &&
    !state.siteId

  // The API only accepts an active user of the account as a named approver.
  const activeUsers = users.filter((user) => user.status === 'ACTIVE')
  const unknownUser =
    state.approverUserId &&
    !activeUsers.some((user) => user.id === state.approverUserId)
  const unknownSite =
    state.siteId && !sites.some((site) => site.id === state.siteId)
  const unknownCategory =
    state.categoryId &&
    !categories.some((category) => category.id === state.categoryId)

  return (
    <Drawer
      isOpen={isOpen}
      onClose={close}
      width="520px"
      title={rule ? 'Edit approval rule' : 'New approval rule'}
      footer={
        <div
          style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}
        >
          <button
            type="button"
            onClick={close}
            disabled={isSaving}
            style={{ ...secondaryButton, ...disabledLook(isSaving) }}
          >
            Cancel
          </button>
          <button
            type="submit"
            form={FORM_ID}
            disabled={isSaving}
            style={{ ...primaryButton, ...disabledLook(isSaving) }}
          >
            {isSaving ? 'Saving…' : rule ? 'Save changes' : 'Create rule'}
          </button>
        </div>
      }
    >
      <form
        id={FORM_ID}
        noValidate
        onSubmit={(event) => void handleSubmit(event)}
        style={{ display: 'flex', flexDirection: 'column', gap: '22px' }}
      >
        {accountLabel && (
          <div style={{ fontSize: '0.78rem', color: C.secondary }}>
            Account:{' '}
            <strong style={{ color: C.text, fontWeight: 600 }}>
              {accountLabel}
            </strong>
          </div>
        )}

        {serverError && (
          <div role="alert" style={errorBanner}>
            <span>{serverError}</span>
          </div>
        )}

        <Section title="Rule">
          <Field label="Name" htmlFor="rule-name" error={errors.name}>
            <input
              id="rule-name"
              type="text"
              maxLength={200}
              value={state.name}
              disabled={isSaving}
              placeholder="e.g. Orders over $1,000 need head office"
              onChange={(event) => update('name', event.target.value)}
              style={fieldControl}
            />
          </Field>

          <Field
            label="Description"
            htmlFor="rule-description"
            optional
            error={errors.description}
          >
            <textarea
              id="rule-description"
              rows={2}
              maxLength={1000}
              value={state.description}
              disabled={isSaving}
              onChange={(event) => update('description', event.target.value)}
              style={{
                ...fieldControl,
                resize: 'vertical',
                fontFamily: 'inherit',
              }}
            />
          </Field>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
              gap: '12px',
            }}
          >
            <Field
              label="Tier"
              htmlFor="rule-tier"
              error={errors.tier}
              hint="Tiers are decided in order, lowest first."
            >
              <input
                id="rule-tier"
                type="number"
                min={1}
                max={20}
                step={1}
                value={state.tier}
                disabled={isSaving}
                onChange={(event) => update('tier', event.target.value)}
                style={fieldControl}
              />
            </Field>

            <Field
              label="Status"
              hint={
                state.active
                  ? 'Matches new orders.'
                  : 'Paused — matches nothing until it is switched back on.'
              }
            >
              <button
                type="button"
                role="switch"
                aria-checked={state.active}
                aria-label="Rule active"
                disabled={isSaving}
                onClick={() => update('active', !state.active)}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '8px',
                  background: 'none',
                  border: 'none',
                  padding: '6px 0',
                  cursor: isSaving ? 'not-allowed' : 'pointer',
                  fontSize: '0.82rem',
                  fontWeight: 600,
                  color: C.text,
                }}
              >
                <span
                  aria-hidden
                  style={{
                    width: '36px',
                    height: '20px',
                    borderRadius: '9999px',
                    backgroundColor: state.active ? C.success : '#DCD3E0',
                    position: 'relative',
                    transition: 'background-color 150ms ease',
                    flexShrink: 0,
                  }}
                >
                  <span
                    style={{
                      position: 'absolute',
                      top: '2px',
                      left: state.active ? '18px' : '2px',
                      width: '16px',
                      height: '16px',
                      borderRadius: '50%',
                      backgroundColor: '#FFFFFF',
                      transition: 'left 150ms ease',
                    }}
                  />
                </span>
                {state.active ? 'Active' : 'Paused'}
              </button>
            </Field>
          </div>
        </Section>

        <Section
          title="Conditions"
          description="A blank condition does not constrain. Every condition you set must match."
        >
          <Field
            label="Order total at or above"
            htmlFor="rule-min-total"
            optional
            error={errors.minTotal}
          >
            <div style={{ position: 'relative' }}>
              <span
                aria-hidden
                style={{
                  position: 'absolute',
                  left: '12px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  color: C.muted,
                  fontSize: '0.84rem',
                }}
              >
                $
              </span>
              <input
                id="rule-min-total"
                type="text"
                inputMode="decimal"
                value={state.minTotal}
                disabled={isSaving}
                placeholder="1000.00"
                onChange={(event) => update('minTotal', event.target.value)}
                style={{ ...fieldControl, paddingLeft: '26px' }}
              />
            </div>
          </Field>

          <Field label="Category" htmlFor="rule-category" optional>
            <select
              id="rule-category"
              value={state.categoryId}
              disabled={isSaving}
              onChange={(event) => update('categoryId', event.target.value)}
              style={fieldControl}
            >
              <option value="">Any category</option>
              {unknownCategory && (
                <option value={state.categoryId}>
                  {rule?.categoryName ?? `Category ${state.categoryId}`}
                </option>
              )}
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Requester role" htmlFor="rule-requester-role" optional>
            <select
              id="rule-requester-role"
              value={state.requesterRole}
              disabled={isSaving}
              onChange={(event) =>
                update(
                  'requesterRole',
                  event.target.value as ApprovalPortalRole | ''
                )
              }
              style={fieldControl}
            >
              <option value="">Anyone</option>
              {ROLE_OPTIONS.map((role) => (
                <option key={role} value={role}>
                  {ROLE_LABELS[role]}
                </option>
              ))}
            </select>
          </Field>

          <Field
            label="Site"
            htmlFor="rule-site"
            optional
            hint={
              sites.length === 0
                ? 'No sites found for this account.'
                : undefined
            }
          >
            <select
              id="rule-site"
              value={state.siteId}
              disabled={isSaving}
              onChange={(event) => update('siteId', event.target.value)}
              style={fieldControl}
            >
              <option value="">Any site</option>
              {unknownSite && (
                <option value={state.siteId}>Site {state.siteId}</option>
              )}
              {sites.map((site) => (
                <option key={site.id} value={site.id}>
                  {site.name} ({site.code})
                </option>
              ))}
            </select>
          </Field>

          {noConditions && (
            <div style={{ ...warningBanner, justifyContent: 'flex-start' }}>
              <AlertTriangle size={16} style={{ flexShrink: 0 }} />
              <span>
                No conditions: this rule will require approval for{' '}
                <strong>every order</strong> in the account.
              </span>
            </div>
          )}
        </Section>

        <Section
          title="Approver"
          description="Name exactly one approver — a role or a specific person."
        >
          <div
            role="radiogroup"
            aria-label="Approver type"
            style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}
          >
            {(['role', 'user'] as const).map((type) => {
              const selected = state.approverType === type
              return (
                <label
                  key={type}
                  style={{
                    flex: '1 1 140px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    padding: '8px 12px',
                    borderRadius: '10px',
                    border: `1px solid ${selected ? C.accent : C.border}`,
                    backgroundColor: selected ? C.accentSoft : '#FFFFFF',
                    cursor: isSaving ? 'not-allowed' : 'pointer',
                    fontSize: '0.82rem',
                    fontWeight: 600,
                    color: C.text,
                  }}
                >
                  <input
                    type="radio"
                    name="approver-type"
                    value={type}
                    checked={selected}
                    disabled={isSaving}
                    onChange={() => {
                      update('approverType', type)
                      setErrors((previous) => ({
                        ...previous,
                        approverRole: undefined,
                        approverUserId: undefined,
                      }))
                    }}
                    style={{ accentColor: C.accent }}
                  />
                  {type === 'role' ? 'A role' : 'A specific person'}
                </label>
              )
            })}
          </div>

          {state.approverType === 'role' ? (
            <Field
              label="Approving role"
              htmlFor="rule-approver-role"
              error={errors.approverRole}
              hint="Anyone holding the role in the account may decide, except the person who placed the order."
            >
              <select
                id="rule-approver-role"
                value={state.approverRole}
                disabled={isSaving}
                onChange={(event) =>
                  update(
                    'approverRole',
                    event.target.value as ApprovalPortalRole | ''
                  )
                }
                style={fieldControl}
              >
                <option value="">Choose a role…</option>
                {ROLE_OPTIONS.map((role) => (
                  <option key={role} value={role}>
                    {ROLE_LABELS[role]}
                  </option>
                ))}
              </select>
            </Field>
          ) : (
            <Field
              label="Approving person"
              htmlFor="rule-approver-user"
              error={errors.approverUserId}
              hint={
                activeUsers.length === 0
                  ? 'No active users found for this account.'
                  : 'Only active users of this account can approve.'
              }
            >
              <select
                id="rule-approver-user"
                value={state.approverUserId}
                disabled={isSaving}
                onChange={(event) =>
                  update('approverUserId', event.target.value)
                }
                style={fieldControl}
              >
                <option value="">Choose a person…</option>
                {unknownUser && (
                  <option value={state.approverUserId}>
                    Current approver ({state.approverUserId})
                  </option>
                )}
                {activeUsers.map((user) => (
                  <option key={user.id} value={user.id}>
                    {user.name} — {user.email} ({ROLE_LABELS[user.role]})
                  </option>
                ))}
              </select>
            </Field>
          )}
        </Section>
      </form>
    </Drawer>
  )
}
