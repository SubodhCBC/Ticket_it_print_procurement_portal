// src/app/admin/settings/page.tsx
'use client'

import { SkeletonForm } from '@/components/ui/Skeleton'
import React, { Suspense, useMemo, useState } from 'react'
import { FieldError, fieldOutline } from '@/components/ui/FormField'
import { useRouter, useSearchParams } from 'next/navigation'
import {
  Bell,
  Building,
  CheckCircle2,
  Key,
  Mail,
  Save,
  ShieldCheck,
  Sliders,
  User,
  Users,
} from 'lucide-react'
import { AdminHeader } from '@/components/admin/AdminHeader'
import { PermissionMatrix } from '@/components/admin/PermissionMatrix'
import { useAuth } from '@/hooks/useAuth'
import { useSettings, useSettingsMutations } from '@/hooks/useSettings'
import { PO_FORMAT_LEGEND_TEXT, previewPoFormat } from '@/lib/po-format'
import type { SettingsPatch } from '@/services/data-source/api/api-settings.adapter'

type SettingsTab =
  'profile' | 'orders' | 'notifications' | 'security' | 'permissions'

/**
 * Old links keep working.
 *
 * The tabs were `general | users | roles | po-validation | integrations` before
 * this screen was rebuilt around the account's real settings, and those names
 * are in bookmarks and in the admin sidebar.
 */
const TAB_ALIASES: Record<string, SettingsTab> = {
  profile: 'profile',
  general: 'orders',
  'po-validation': 'orders',
  orders: 'orders',
  notifications: 'notifications',
  security: 'security',
  users: 'permissions',
  roles: 'permissions',
  permissions: 'permissions',
}

const TABS: {
  id: SettingsTab
  icon: typeof User
  title: string
  subtitle: string
}[] = [
  {
    id: 'profile',
    icon: User,
    title: 'My Profile',
    subtitle: 'Your name and contact details',
  },
  {
    id: 'orders',
    icon: Sliders,
    title: 'Store & Order Rules',
    subtitle: 'Identity, locale and checkout policy',
  },
  {
    id: 'notifications',
    icon: Bell,
    title: 'Notifications & Alerts',
    subtitle: 'Where operational mail goes',
  },
  {
    id: 'security',
    icon: ShieldCheck,
    title: 'Security & Passwords',
    subtitle: 'Your password and session policy',
  },
  {
    id: 'permissions',
    icon: Users,
    title: 'Roles & Permissions',
    subtitle: 'The baseline each role carries',
  },
]

/* ── Shared presentation ─────────────────────────────────────────── */

/** The shared card: hairline border and a soft shadow, as on the admin dashboard. */
const S: Record<string, React.CSSProperties> = {
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: '14px',
    boxShadow:
      '0 1px 2px rgba(43, 37, 62, 0.04), 0 6px 16px rgba(43, 37, 62, 0.05)',
    padding: '20px',
    border: '1px solid #F0E6EC',
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
  },
  input: {
    width: '100%',
    padding: '8px 12px',
    borderRadius: '10px',
    border: '1px solid #F0E6EC',
    backgroundColor: '#FFFFFF',
    fontSize: '0.84rem',
    color: '#2B253E',
    outline: 'none',
  },
  label: {
    display: 'block',
    fontSize: '0.78rem',
    fontWeight: 600,
    color: '#5C566E',
    marginBottom: '6px',
  },
  grid2: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' },
  submit: {
    padding: '8px 14px',
    borderRadius: '10px',
    border: 'none',
    backgroundColor: '#F73582',
    color: '#FFFFFF',
    fontSize: '0.82rem',
    fontWeight: 600,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
  },
  hint: { fontSize: '0.76rem', color: '#6E6781', marginTop: '4px' },
}

function CardTitle({
  icon: Icon,
  children,
}: {
  icon: typeof User
  children: React.ReactNode
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
      {/* A bare grey icon. The pink tile it sat in repeated on every card and
          was louder than the title it labelled. */}
      <Icon size={16} color="#A39BB3" style={{ flexShrink: 0 }} />
      <span
        style={{
          fontWeight: 700,
          fontSize: '0.95rem',
          color: '#2B253E',
          letterSpacing: '-0.01em',
        }}
      >
        {children}
      </span>
    </div>
  )
}

function Toggle({
  checked,
  onChange,
  disabled,
}: {
  checked: boolean
  onChange: (v: boolean) => void
  disabled?: boolean
}) {
  return (
    <label
      style={{
        position: 'relative',
        display: 'inline-block',
        width: '36px',
        height: '20px',
        flexShrink: 0,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.5 : 1,
      }}
    >
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        style={{ opacity: 0, width: 0, height: 0 }}
      />
      <span
        style={{
          position: 'absolute',
          inset: 0,
          backgroundColor: checked ? '#F73582' : '#DCD3E0',
          borderRadius: '9999px',
          transition: 'all 200ms ease',
        }}
      >
        <span
          style={{
            position: 'absolute',
            height: '14px',
            width: '14px',
            left: checked ? '19px' : '3px',
            bottom: '3px',
            backgroundColor: '#FFFFFF',
            borderRadius: '50%',
            transition: 'all 200ms ease',
          }}
        />
      </span>
    </label>
  )
}

function SwitchRow({
  title,
  description,
  checked,
  onChange,
  disabled,
  note,
}: {
  title: string
  description: string
  checked: boolean
  onChange: (v: boolean) => void
  disabled?: boolean
  note?: string
}) {
  return (
    // No box of its own: a bordered, filled panel per switch put cards inside
    // the card. The card's spacing is enough to set one setting from the next.
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '16px',
      }}
    >
      <div>
        <div style={{ fontWeight: 600, fontSize: '0.84rem', color: '#2B253E' }}>
          {title}
        </div>
        <div style={S.hint}>{description}</div>
        {note && (
          <div
            style={{
              ...S.hint,
              color: '#B45309',
              fontWeight: 600,
              marginTop: '4px',
            }}
          >
            {note}
          </div>
        )}
      </div>
      <Toggle checked={checked} onChange={onChange} disabled={disabled} />
    </div>
  )
}

/** The shared box, wearing the red border when its own field is wrong. */
function control(hasError: boolean): React.CSSProperties {
  return { ...S.input, ...fieldOutline(hasError) }
}

/**
 * Deliberately loose: it catches a missing @ or a stray space, and leaves the
 * verdict on anything exotic to the server, which is the only thing that can
 * actually deliver mail.
 */
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/** Every field the settings page can be wrong about. */
type ErrorKey =
  | 'firstName'
  | 'lastName'
  | 'email'
  | 'approvalThreshold'
  | 'gstRatePercent'
  | 'notificationEmail'
  | 'lowStockAlertThreshold'
  | 'sessionTimeoutMinutes'
  | 'pwCurrent'
  | 'pwNext'
  | 'pwConfirm'

type Errors = Partial<Record<ErrorKey, string>>

/* ── Page ────────────────────────────────────────────────────────── */

function AdminSettingsContent() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const { user, logout } = useAuth()
  const { settings, isLoading, error } = useSettings()
  const {
    saveSettings,
    isSaving,
    saveProfile,
    isSavingProfile,
    changePassword,
    isChangingPassword,
  } = useSettingsMutations()

  // Derived from the URL rather than mirrored into state: the query string is
  // already the single source of truth — `setTab` writes it and the back button
  // rewrites it — and a copy in state only creates a second one to keep in step.
  const activeTab: SettingsTab =
    TAB_ALIASES[searchParams.get('tab') ?? ''] ?? 'profile'

  const setTab = (tab: SettingsTab) =>
    router.replace(`/admin/settings?tab=${tab}`)

  const [toast, setToast] = useState<{
    kind: 'ok' | 'err'
    msg: string
  } | null>(null)
  const flash = (kind: 'ok' | 'err', msg: string) => {
    setToast({ kind, msg })
    setTimeout(() => setToast(null), 4000)
  }
  const failure = (err: unknown, fallback: string) =>
    flash('err', err instanceof Error ? err.message : fallback)

  /**
   * One error per field, for every tab. Each is set on submit and cleared the
   * moment its own field changes, so a fixed field stops looking wrong at once.
   */
  const [errors, setErrors] = useState<Errors>({})
  const clear = (key: ErrorKey) =>
    setErrors((e) => (e[key] === undefined ? e : { ...e, [key]: undefined }))

  /* ── Profile, seeded from the session ── */
  const [profile, setProfile] = useState({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    department: '',
  })

  // Reseeded when the session user changes. Adjusted during render rather than
  // in an effect, so the form never paints empty first.
  const [profileSeededFrom, setProfileSeededFrom] = useState<typeof user>(null)
  if (user && user !== profileSeededFrom) {
    setProfileSeededFrom(user)
    setProfile({
      firstName: user.firstName ?? '',
      lastName: user.lastName ?? '',
      email: user.email ?? '',
      phone: user.phone ?? '',
      department: user.department ?? '',
    })
  }

  /* ── Settings form, seeded from the API ── */
  const [form, setForm] = useState<SettingsPatch>({})
  // The two amount boxes keep what was actually typed. Held only as numbers,
  // a half-written "1." or an outright "abc" could not be shown back to the
  // user, and there would be nothing to say "that is not a number" about.
  const [thresholdText, setThresholdText] = useState('')
  const [gstText, setGstText] = useState('')
  const [formSeededFrom, setFormSeededFrom] = useState<typeof settings>(null)
  if (settings && settings !== formSeededFrom) {
    setFormSeededFrom(settings)
    setForm({
      accountName: settings.accountName,
      currency: settings.currency,
      timezone: settings.timezone,
      orderNumberPrefix: settings.orderNumberPrefix,
      poPrefix: settings.poPrefix,
      poFormat: settings.poFormat ?? null,
      requirePoNumber: settings.requirePoNumber,
      // The API sends money as a string; the number input needs a number, and
      // null has to survive the round trip because it means "no approvals".
      approvalThreshold:
        settings.approvalThreshold === null
          ? null
          : Number(settings.approvalThreshold),
      enforceMoq: settings.enforceMoq,
      allowBackorders: settings.allowBackorders,
      requireDeliveryNotes: settings.requireDeliveryNotes,
      // An older API build does not send it; off is what it meant then.
      allowCustomDeliveryAddress: settings.allowCustomDeliveryAddress ?? false,
      sendOrderConfirmations: settings.sendOrderConfirmations,
      // An inherited address is shown as a placeholder, not as a value: putting
      // it in the field would turn the next save into an explicit override.
      notificationEmail: settings.notificationEmailInherited
        ? null
        : settings.notificationEmail,
      sendLowStockAlerts: settings.sendLowStockAlerts,
      lowStockAlertThreshold: settings.lowStockAlertThreshold,
      sendMonthlyBillingDigest: settings.sendMonthlyBillingDigest,
      sessionTimeoutMinutes: settings.sessionTimeoutMinutes,
      enforceTwoFactor: settings.enforceTwoFactor,
      // An API build without tax settings sends neither; NZ GST is what the
      // account would be billed at, so that is the value the form starts from.
      pricesIncludeGst: settings.pricesIncludeGst ?? false,
      gstRatePercent:
        settings.gstRatePercent === undefined
          ? 15
          : Number(settings.gstRatePercent),
    })
    setThresholdText(
      settings.approvalThreshold === null
        ? ''
        : String(Number(settings.approvalThreshold))
    )
    setGstText(
      settings.gstRatePercent === undefined
        ? '15'
        : String(Number(settings.gstRatePercent))
    )
  }

  const set = <K extends keyof SettingsPatch>(
    key: K,
    value: SettingsPatch[K]
  ) => setForm((f) => ({ ...f, [key]: value }))

  /** Send only the keys this tab owns, so two tabs cannot overwrite each other. */
  const saveTab = async (keys: (keyof SettingsPatch)[], label: string) => {
    const patch: SettingsPatch = {}
    for (const k of keys) {
      if (form[k] !== undefined) (patch as Record<string, unknown>)[k] = form[k]
    }
    try {
      await saveSettings(patch)
      flash('ok', label)
    } catch (err) {
      failure(err, 'Could not save. Please try again.')
    }
  }

  /* ── Password ── */
  const [pw, setPw] = useState({ current: '', next: '', confirm: '' })

  const submitPassword = async (e: React.FormEvent) => {
    e.preventDefault()

    const found: Errors = {}
    if (!pw.current) found.pwCurrent = 'Enter your current password.'
    if (pw.next.length < 12) {
      found.pwNext = 'Use at least 12 characters for the new password.'
    }
    if (pw.next !== pw.confirm) {
      found.pwConfirm = 'The two new passwords do not match.'
    }
    setErrors((e2) => ({
      ...e2,
      pwCurrent: found.pwCurrent,
      pwNext: found.pwNext,
      pwConfirm: found.pwConfirm,
    }))
    if (Object.keys(found).length > 0) return

    try {
      await changePassword(pw.current, pw.next)
      setPw({ current: '', next: '', confirm: '' })
      // The API revokes every refresh token, so this session can no longer be
      // renewed. Signing out now beats waiting for the first request that fails
      // to refresh and dumping the user on the login page mid-task.
      flash('ok', 'Password changed. Signing you out…')
      setTimeout(() => void logout(), 1200)
    } catch (err) {
      failure(err, 'Could not change your password.')
    }
  }

  const timezones = useMemo(() => {
    const supported = (
      Intl as unknown as { supportedValuesOf?: (k: string) => string[] }
    ).supportedValuesOf
    // A short fallback where the runtime has no zone table, rather than an empty
    // select the user cannot get out of.
    return supported
      ? supported('timeZone')
      : [
          'UTC',
          'America/Chicago',
          'America/New_York',
          'America/Los_Angeles',
          'Europe/London',
          'Australia/Sydney',
        ]
  }, [])

  const loading = isLoading && !settings

  return (
    <>
      <AdminHeader
        title="Settings & Configuration"
        subtitle="Your profile, the account's store and order policy, alert routing, and access."
      />

      <main
        style={{
          padding: '24px',
          display: 'flex',
          flexDirection: 'column',
          gap: '20px',
          maxWidth: '1280px',
          margin: '0 auto',
          width: '100%',
        }}
      >
        {/* Which account this is, and where it is stored — the two things the
            old banner said that AdminHeader does not. Its second copy of the
            page title is gone: the header directly above already carries it. */}
        <div>
          <div
            style={{
              fontSize: '0.95rem',
              fontWeight: 700,
              color: '#2B253E',
              letterSpacing: '-0.01em',
            }}
          >
            {settings
              ? `${settings.accountName} · ${settings.accountCode}`
              : 'Platform settings'}
          </div>
          <p
            style={{
              fontSize: '0.8rem',
              color: '#6E6781',
              margin: '4px 0 0',
            }}
          >
            Everything on this page is stored on the server and applies to your
            whole account.
          </p>
        </div>

        {toast && (
          <div
            style={{
              backgroundColor: toast.kind === 'ok' ? '#ECFDF5' : '#FEF2F2',
              color: toast.kind === 'ok' ? '#3F9C68' : '#DC2626',
              padding: '10px 14px',
              borderRadius: '10px',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              fontSize: '0.82rem',
              fontWeight: 600,
            }}
          >
            <CheckCircle2 size={16} style={{ flexShrink: 0 }} />
            <span>{toast.msg}</span>
          </div>
        )}

        {error && (
          <div
            style={{
              backgroundColor: '#FEF2F2',
              color: '#DC2626',
              padding: '10px 14px',
              borderRadius: '10px',
              fontSize: '0.82rem',
            }}
          >
            Could not load the account settings —{' '}
            {error instanceof Error ? error.message : 'unknown error'}. Reading
            them needs the <code>ACCOUNT_MANAGE</code> permission.
          </div>
        )}

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '260px 1fr',
            gap: '20px',
            alignItems: 'start',
          }}
        >
          {/* Tabs. The current one is a grey fill with a pink icon — the
              accent marks where you are, instead of a solid pink slab with a
              glow competing with the form beside it. */}
          <div
            style={{
              backgroundColor: '#FFFFFF',
              borderRadius: '14px',
              boxShadow:
                '0 1px 2px rgba(43, 37, 62, 0.04), 0 6px 16px rgba(43, 37, 62, 0.05)',
              padding: '8px',
              border: '1px solid #F0E6EC',
              display: 'flex',
              flexDirection: 'column',
              gap: '2px',
            }}
          >
            {TABS.map(({ id, icon: Icon, title, subtitle }) => {
              const on = activeTab === id
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => setTab(id)}
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '10px',
                    padding: '10px 12px',
                    borderRadius: '10px',
                    backgroundColor: on ? '#F5EEF2' : 'transparent',
                    color: on ? '#2B253E' : '#5C566E',
                    border: 'none',
                    cursor: 'pointer',
                    textAlign: 'left',
                    width: '100%',
                    transition: 'background-color 150ms ease',
                  }}
                >
                  <Icon
                    size={16}
                    color={on ? '#F73582' : '#A39BB3'}
                    style={{ marginTop: '1px', flexShrink: 0 }}
                  />
                  <div>
                    <div
                      style={{
                        fontWeight: on ? 600 : 500,
                        fontSize: '0.84rem',
                        lineHeight: 1.2,
                      }}
                    >
                      {title}
                    </div>
                    <div
                      style={{
                        fontSize: '0.74rem',
                        color: '#A39BB3',
                        marginTop: '3px',
                      }}
                    >
                      {subtitle}
                    </div>
                  </div>
                </button>
              )
            })}
          </div>

          {/* Panels */}
          <div
            style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}
          >
            {/* ── My Profile ── */}
            {activeTab === 'profile' && (
              <form
                noValidate
                onSubmit={async (e) => {
                  e.preventDefault()
                  if (!user) return

                  // All three checked together: one submit names every gap.
                  const found: Errors = {}
                  if (!profile.firstName.trim()) {
                    found.firstName = 'Enter your first name.'
                  }
                  if (!profile.lastName.trim()) {
                    found.lastName = 'Enter your last name.'
                  }
                  if (!profile.email.trim()) {
                    found.email = 'Enter your work email address.'
                  } else if (!EMAIL.test(profile.email.trim())) {
                    found.email =
                      'That does not look like an email address. Check for a missing @ or a typo.'
                  }
                  setErrors((prev) => ({
                    ...prev,
                    firstName: found.firstName,
                    lastName: found.lastName,
                    email: found.email,
                  }))
                  if (Object.keys(found).length > 0) return

                  try {
                    await saveProfile(user.id, {
                      firstName: profile.firstName,
                      lastName: profile.lastName,
                      email: profile.email,
                      phone: profile.phone || null,
                      department: profile.department || null,
                    })
                    flash('ok', 'Profile updated.')
                  } catch (err) {
                    failure(err, 'Could not update your profile.')
                  }
                }}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '20px',
                }}
              >
                <div style={S.card}>
                  <CardTitle icon={User}>Basic Information</CardTitle>

                  <div
                    style={{
                      display: 'flex',
                      gap: '20px',
                      alignItems: 'flex-start',
                    }}
                  >
                    <div
                      style={{
                        width: '56px',
                        height: '56px',
                        borderRadius: '50%',
                        backgroundColor: '#2B253E',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: '#FFFFFF',
                        fontWeight: 700,
                        fontSize: '1.05rem',
                        flexShrink: 0,
                      }}
                    >
                      {(profile.firstName[0] ?? '') +
                        (profile.lastName[0] ?? '')}
                    </div>

                    <div
                      style={{
                        flex: 1,
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '14px',
                      }}
                    >
                      <div style={S.grid2}>
                        <div>
                          <label htmlFor="set-first-name" style={S.label}>
                            First Name
                          </label>
                          <input
                            id="set-first-name"
                            style={control(Boolean(errors.firstName))}
                            aria-invalid={errors.firstName ? true : undefined}
                            aria-describedby={
                              errors.firstName
                                ? 'set-first-name-error'
                                : undefined
                            }
                            value={profile.firstName}
                            onChange={(e) => {
                              setProfile({
                                ...profile,
                                firstName: e.target.value,
                              })
                              clear('firstName')
                            }}
                          />
                          {errors.firstName && (
                            <FieldError id="set-first-name-error">
                              {errors.firstName}
                            </FieldError>
                          )}
                        </div>
                        <div>
                          <label htmlFor="set-last-name" style={S.label}>
                            Last Name
                          </label>
                          <input
                            id="set-last-name"
                            style={control(Boolean(errors.lastName))}
                            aria-invalid={errors.lastName ? true : undefined}
                            aria-describedby={
                              errors.lastName
                                ? 'set-last-name-error'
                                : undefined
                            }
                            value={profile.lastName}
                            onChange={(e) => {
                              setProfile({
                                ...profile,
                                lastName: e.target.value,
                              })
                              clear('lastName')
                            }}
                          />
                          {errors.lastName && (
                            <FieldError id="set-last-name-error">
                              {errors.lastName}
                            </FieldError>
                          )}
                        </div>
                      </div>

                      <div style={S.grid2}>
                        <div>
                          <label htmlFor="set-email" style={S.label}>
                            Work Email Address
                          </label>
                          <input
                            id="set-email"
                            type="email"
                            placeholder="jane.smith@company.co.nz"
                            style={control(Boolean(errors.email))}
                            aria-invalid={errors.email ? true : undefined}
                            aria-describedby={
                              errors.email ? 'set-email-error' : undefined
                            }
                            value={profile.email}
                            onChange={(e) => {
                              setProfile({ ...profile, email: e.target.value })
                              clear('email')
                            }}
                          />
                          {errors.email && (
                            <FieldError id="set-email-error">
                              {errors.email}
                            </FieldError>
                          )}
                        </div>
                        <div>
                          <label style={S.label}>Direct Phone Number</label>
                          <input
                            type="tel"
                            style={S.input}
                            value={profile.phone}
                            onChange={(e) =>
                              setProfile({ ...profile, phone: e.target.value })
                            }
                          />
                        </div>
                      </div>

                      <div style={S.grid2}>
                        <div>
                          <label style={S.label}>Department</label>
                          <input
                            style={S.input}
                            placeholder="Marketing"
                            value={profile.department}
                            onChange={(e) =>
                              setProfile({
                                ...profile,
                                department: e.target.value,
                              })
                            }
                          />
                        </div>
                        <div>
                          <label style={S.label}>Role</label>
                          <input
                            style={{
                              ...S.input,
                              backgroundColor: '#FCF7FA',
                              color: '#6E6781',
                            }}
                            value={user?.role ?? ''}
                            readOnly
                          />
                          <div style={S.hint}>
                            Set by an administrator on the Users screen.
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                  <button
                    type="submit"
                    disabled={isSavingProfile || !user}
                    style={{
                      ...S.submit,
                      opacity: isSavingProfile || !user ? 0.5 : 1,
                    }}
                  >
                    <Save size={14} />
                    <span>{isSavingProfile ? 'Saving…' : 'Save Profile'}</span>
                  </button>
                </div>
              </form>
            )}

            {/* ── Store & Order Rules ── */}
            {activeTab === 'orders' && (
              <form
                noValidate
                onSubmit={(e) => {
                  e.preventDefault()

                  const threshold = thresholdText.trim()
                  const gst = gstText.trim()
                  const found: Errors = {}
                  if (threshold !== '') {
                    const value = Number(threshold)
                    if (!Number.isFinite(value)) {
                      found.approvalThreshold =
                        'Approval threshold must be a number, or leave it empty so no order needs approval.'
                    } else if (value < 0) {
                      found.approvalThreshold =
                        'Approval threshold cannot be negative. Zero means every order needs approval.'
                    }
                  }
                  const gstValue = Number(gst)
                  if (gst === '' || !Number.isFinite(gstValue)) {
                    found.gstRatePercent =
                      'Enter the GST rate as a number. New Zealand GST is 15.'
                  } else if (gstValue < 0 || gstValue > 100) {
                    found.gstRatePercent = 'GST rate must be between 0 and 100.'
                  }
                  setErrors((prev) => ({
                    ...prev,
                    approvalThreshold: found.approvalThreshold,
                    gstRatePercent: found.gstRatePercent,
                  }))
                  if (Object.keys(found).length > 0) return

                  void saveTab(
                    [
                      'accountName',
                      'currency',
                      'timezone',
                      'orderNumberPrefix',
                      'poPrefix',
                      'poFormat',
                      'requirePoNumber',
                      'approvalThreshold',
                      'enforceMoq',
                      'allowBackorders',
                      'requireDeliveryNotes',
                      'allowCustomDeliveryAddress',
                      'pricesIncludeGst',
                      'gstRatePercent',
                    ],
                    'Store and order rules saved.'
                  )
                }}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '20px',
                }}
              >
                <div style={S.card}>
                  <CardTitle icon={Building}>
                    Store Identity &amp; Locale
                  </CardTitle>

                  <div style={S.grid2}>
                    <div>
                      <label style={S.label}>Store / Account Name</label>
                      <input
                        style={S.input}
                        disabled={loading}
                        placeholder="Northbridge Health Group"
                        value={form.accountName ?? ''}
                        onChange={(e) => set('accountName', e.target.value)}
                      />
                    </div>
                    <div>
                      <label htmlFor="set-order-prefix" style={S.label}>
                        Order Number Prefix
                      </label>
                      <input
                        id="set-order-prefix"
                        style={S.input}
                        disabled={loading}
                        placeholder="TKT-"
                        value={form.orderNumberPrefix ?? ''}
                        onChange={(e) =>
                          set('orderNumberPrefix', e.target.value)
                        }
                      />
                      <div style={S.hint}>
                        Sits in front of every order number this account raises,
                        such as TKT-.
                      </div>
                    </div>
                  </div>

                  <div style={S.grid2}>
                    <div>
                      <label style={S.label}>
                        Reporting &amp; Invoicing Currency
                      </label>
                      <select
                        style={S.input}
                        disabled={loading}
                        value={form.currency ?? 'USD'}
                        onChange={(e) => set('currency', e.target.value)}
                      >
                        <option value="USD">USD ($) — US Dollar</option>
                        <option value="AUD">AUD ($) — Australian Dollar</option>
                        <option value="GBP">GBP (£) — British Pound</option>
                        <option value="EUR">EUR (€) — Euro</option>
                        <option value="NZD">
                          NZD ($) — New Zealand Dollar
                        </option>
                      </select>
                      <div style={S.hint}>
                        Reporting and invoicing only. Prices are stored without
                        a currency, so changing this does not convert them.
                      </div>
                    </div>
                    <div>
                      <label style={S.label}>Operations Timezone</label>
                      <select
                        style={S.input}
                        disabled={loading}
                        value={form.timezone ?? 'UTC'}
                        onChange={(e) => set('timezone', e.target.value)}
                      >
                        {timezones.map((tz) => (
                          <option key={tz} value={tz}>
                            {tz}
                          </option>
                        ))}
                      </select>
                      <div style={S.hint}>
                        Decides which day a report bucket starts on and which
                        period an order is billed into.
                      </div>
                    </div>
                  </div>
                </div>

                <div style={S.card}>
                  <CardTitle icon={Sliders}>Checkout Rules</CardTitle>

                  <SwitchRow
                    title="Require a purchase-order number"
                    description="Buyers must supply a PO reference before an order can be placed."
                    checked={form.requirePoNumber ?? false}
                    onChange={(v) => set('requirePoNumber', v)}
                  />

                  <div style={{ maxWidth: '320px' }}>
                    <label htmlFor="set-po-prefix" style={S.label}>
                      Purchase-order prefix
                    </label>
                    <input
                      id="set-po-prefix"
                      style={S.input}
                      disabled={loading}
                      placeholder="PO-NBH"
                      value={form.poPrefix ?? ''}
                      onChange={(e) => set('poPrefix', e.target.value)}
                    />
                    <div style={S.hint}>
                      Optional. The customer&apos;s own PO series — separate
                      from the order number prefix above. A site may override
                      it.
                    </div>
                  </div>

                  <PoFormatSetting
                    value={form.poFormat ?? ''}
                    disabled={loading}
                    onChange={(v) => set('poFormat', v)}
                  />

                  <SwitchRow
                    title="Hold lines at their minimum order quantity"
                    description="Off, a buyer is told about a shortfall but may still proceed."
                    checked={form.enforceMoq ?? true}
                    onChange={(v) => set('enforceMoq', v)}
                  />
                  <SwitchRow
                    title="Allow backorders"
                    description="Accept an order for stock that is not on hand."
                    checked={form.allowBackorders ?? false}
                    onChange={(v) => set('allowBackorders', v)}
                  />
                  <SwitchRow
                    title="Require delivery notes"
                    description="Checkout asks for delivery instructions before the order is placed."
                    checked={form.requireDeliveryNotes ?? false}
                    onChange={(v) => set('requireDeliveryNotes', v)}
                  />
                  <SwitchRow
                    title="Allow a one-off delivery address"
                    description="Buyers may type a different ship-to address at checkout instead of choosing one of the branch's saved addresses. It is used for that order only and never added to the branch. Deny ORDER_CUSTOM_DELIVERY_ADDRESS to exclude a buyer."
                    checked={form.allowCustomDeliveryAddress ?? false}
                    onChange={(v) => set('allowCustomDeliveryAddress', v)}
                  />

                  <div style={{ maxWidth: '320px' }}>
                    <label htmlFor="set-approval-threshold" style={S.label}>
                      Approval threshold ({form.currency ?? 'USD'})
                    </label>
                    <input
                      id="set-approval-threshold"
                      type="text"
                      inputMode="decimal"
                      placeholder="1500.00"
                      style={control(Boolean(errors.approvalThreshold))}
                      disabled={loading}
                      aria-invalid={errors.approvalThreshold ? true : undefined}
                      aria-describedby={
                        errors.approvalThreshold
                          ? 'set-approval-threshold-error'
                          : 'set-approval-threshold-hint'
                      }
                      value={thresholdText}
                      onChange={(e) => {
                        const text = e.target.value
                        setThresholdText(text)
                        const trimmed = text.trim()
                        const value = Number(trimmed)
                        set(
                          'approvalThreshold',
                          trimmed === '' || !Number.isFinite(value)
                            ? null
                            : value
                        )
                        clear('approvalThreshold')
                      }}
                    />
                    {errors.approvalThreshold ? (
                      <FieldError id="set-approval-threshold-error">
                        {errors.approvalThreshold}
                      </FieldError>
                    ) : (
                      <div id="set-approval-threshold-hint" style={S.hint}>
                        Orders above this total need head-office approval. Blank
                        means none do;{' '}
                        <strong>zero means every order does</strong>, which is a
                        real setting rather than a way of switching it off.
                      </div>
                    )}
                  </div>
                </div>

                {/* Tax (SOW F-06, A-08). Applies to invoices generated from now
                    on; an issued invoice keeps the treatment it was issued with. */}
                <div style={S.card}>
                  <CardTitle icon={Building}>Tax (GST)</CardTitle>

                  <SwitchRow
                    title="Prices include GST"
                    description="On, catalogue and rate-card prices already contain GST and the invoice shows the GST within them. Off, GST is added on the invoice. Products marked zero-rated or exempt are never taxed."
                    checked={form.pricesIncludeGst ?? false}
                    onChange={(v) => set('pricesIncludeGst', v)}
                  />

                  <div style={{ maxWidth: '320px' }}>
                    <label htmlFor="set-gst-rate" style={S.label}>
                      GST rate (%)
                    </label>
                    <input
                      id="set-gst-rate"
                      type="text"
                      inputMode="decimal"
                      placeholder="15"
                      style={control(Boolean(errors.gstRatePercent))}
                      disabled={loading}
                      aria-invalid={errors.gstRatePercent ? true : undefined}
                      aria-describedby={
                        errors.gstRatePercent
                          ? 'set-gst-rate-error'
                          : 'set-gst-rate-hint'
                      }
                      value={gstText}
                      onChange={(e) => {
                        const text = e.target.value
                        setGstText(text)
                        const trimmed = text.trim()
                        const value = Number(trimmed)
                        set(
                          'gstRatePercent',
                          trimmed === '' || !Number.isFinite(value)
                            ? undefined
                            : value
                        )
                        clear('gstRatePercent')
                      }}
                    />
                    {errors.gstRatePercent ? (
                      <FieldError id="set-gst-rate-error">
                        {errors.gstRatePercent}
                      </FieldError>
                    ) : (
                      <div id="set-gst-rate-hint" style={S.hint}>
                        New Zealand GST is 15%. Changing it affects invoices
                        generated after saving, not ones already issued.
                      </div>
                    )}
                  </div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                  <button
                    type="submit"
                    disabled={isSaving || loading}
                    style={{
                      ...S.submit,
                      opacity: isSaving || loading ? 0.5 : 1,
                    }}
                  >
                    <Save size={14} />
                    <span>{isSaving ? 'Saving…' : 'Save Order Rules'}</span>
                  </button>
                </div>
              </form>
            )}

            {/* ── Notifications ── */}
            {activeTab === 'notifications' && (
              <form
                noValidate
                onSubmit={(e) => {
                  e.preventDefault()

                  const alertEmail = (form.notificationEmail ?? '').trim()
                  const threshold = form.lowStockAlertThreshold ?? 50
                  const found: Errors = {}
                  if (alertEmail && !EMAIL.test(alertEmail)) {
                    found.notificationEmail =
                      'That does not look like an email address. Clear the field to use the account contact instead.'
                  }
                  if (!Number.isFinite(threshold) || threshold < 0) {
                    found.lowStockAlertThreshold =
                      'The low-stock threshold must be zero or more units.'
                  }
                  setErrors((prev) => ({
                    ...prev,
                    notificationEmail: found.notificationEmail,
                    lowStockAlertThreshold: found.lowStockAlertThreshold,
                  }))
                  if (Object.keys(found).length > 0) return

                  void saveTab(
                    [
                      'sendOrderConfirmations',
                      'notificationEmail',
                      'sendLowStockAlerts',
                      'lowStockAlertThreshold',
                      'sendMonthlyBillingDigest',
                    ],
                    'Notification settings saved.'
                  )
                }}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '20px',
                }}
              >
                <div style={S.card}>
                  <CardTitle icon={Mail}>Email Notification Routing</CardTitle>

                  <SwitchRow
                    title="Customer order receipts and tracking emails"
                    description="Send an order confirmation and tracking link when a site places an order."
                    checked={form.sendOrderConfirmations ?? true}
                    onChange={(v) => set('sendOrderConfirmations', v)}
                  />

                  <div style={{ maxWidth: '440px' }}>
                    <label htmlFor="set-alert-email" style={S.label}>
                      Operational alert address
                    </label>
                    <input
                      id="set-alert-email"
                      type="email"
                      style={control(Boolean(errors.notificationEmail))}
                      disabled={loading}
                      aria-invalid={errors.notificationEmail ? true : undefined}
                      aria-describedby={
                        errors.notificationEmail
                          ? 'set-alert-email-error'
                          : 'set-alert-email-hint'
                      }
                      // Not a sample address: this is the real inherited one,
                      // shown greyed so saving does not turn it into an
                      // explicit override.
                      placeholder={
                        settings?.notificationEmailInherited
                          ? (settings.notificationEmail ??
                            'No account contact set')
                          : undefined
                      }
                      value={form.notificationEmail ?? ''}
                      onChange={(e) => {
                        set('notificationEmail', e.target.value)
                        clear('notificationEmail')
                      }}
                    />
                    {errors.notificationEmail ? (
                      <FieldError id="set-alert-email-error">
                        {errors.notificationEmail}
                      </FieldError>
                    ) : (
                      <div id="set-alert-email-hint" style={S.hint}>
                        {settings?.notificationEmailInherited
                          ? 'Currently inherited from the account contact. Type an address to override it.'
                          : 'Clear this field to fall back to the account contact address.'}
                      </div>
                    )}
                  </div>

                  <SwitchRow
                    title="Low-stock warehouse alerts"
                    description="Warn when a product falls to the threshold below."
                    checked={form.sendLowStockAlerts ?? true}
                    onChange={(v) => set('sendLowStockAlerts', v)}
                  />

                  <div style={{ maxWidth: '240px' }}>
                    <label htmlFor="set-low-stock" style={S.label}>
                      Low-stock threshold (units)
                    </label>
                    <input
                      id="set-low-stock"
                      type="number"
                      step={1}
                      style={control(Boolean(errors.lowStockAlertThreshold))}
                      disabled={loading || !(form.sendLowStockAlerts ?? true)}
                      aria-invalid={
                        errors.lowStockAlertThreshold ? true : undefined
                      }
                      aria-describedby={
                        errors.lowStockAlertThreshold
                          ? 'set-low-stock-error'
                          : undefined
                      }
                      value={form.lowStockAlertThreshold ?? 50}
                      onChange={(e) => {
                        set('lowStockAlertThreshold', Number(e.target.value))
                        clear('lowStockAlertThreshold')
                      }}
                    />
                    {errors.lowStockAlertThreshold && (
                      <FieldError id="set-low-stock-error">
                        {errors.lowStockAlertThreshold}
                      </FieldError>
                    )}
                  </div>

                  <SwitchRow
                    title="Monthly consolidated statement digest"
                    description="Email the multi-site billing statement to head office at the start of each month."
                    checked={form.sendMonthlyBillingDigest ?? true}
                    onChange={(v) => set('sendMonthlyBillingDigest', v)}
                  />
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                  <button
                    type="submit"
                    disabled={isSaving || loading}
                    style={{
                      ...S.submit,
                      opacity: isSaving || loading ? 0.5 : 1,
                    }}
                  >
                    <Save size={14} />
                    <span>{isSaving ? 'Saving…' : 'Save Notifications'}</span>
                  </button>
                </div>
              </form>
            )}

            {/* ── Security ── */}
            {activeTab === 'security' && (
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '20px',
                }}
              >
                <form noValidate onSubmit={submitPassword} style={S.card}>
                  <CardTitle icon={Key}>Change Your Password</CardTitle>

                  <div
                    style={{
                      padding: '10px 12px',
                      borderRadius: '10px',
                      backgroundColor: '#FFFBEB',
                      color: '#B45309',
                      fontSize: '0.78rem',
                      lineHeight: 1.5,
                    }}
                  >
                    Changing your password signs you out here, and stops every
                    other session being renewed. A device already signed in
                    keeps working for up to fifteen minutes, until its current
                    access token expires.
                  </div>

                  <div style={{ maxWidth: '440px' }}>
                    <label htmlFor="set-pw-current" style={S.label}>
                      Current Password
                    </label>
                    <input
                      id="set-pw-current"
                      type="password"
                      autoComplete="current-password"
                      style={control(Boolean(errors.pwCurrent))}
                      aria-invalid={errors.pwCurrent ? true : undefined}
                      aria-describedby={
                        errors.pwCurrent ? 'set-pw-current-error' : undefined
                      }
                      value={pw.current}
                      onChange={(e) => {
                        setPw({ ...pw, current: e.target.value })
                        clear('pwCurrent')
                      }}
                    />
                    {errors.pwCurrent && (
                      <FieldError id="set-pw-current-error">
                        {errors.pwCurrent}
                      </FieldError>
                    )}
                  </div>

                  <div style={{ ...S.grid2, maxWidth: '640px' }}>
                    <div>
                      <label htmlFor="set-pw-next" style={S.label}>
                        New Password
                      </label>
                      <input
                        id="set-pw-next"
                        type="password"
                        autoComplete="new-password"
                        style={control(Boolean(errors.pwNext))}
                        aria-invalid={errors.pwNext ? true : undefined}
                        aria-describedby={
                          errors.pwNext ? 'set-pw-next-error' : 'set-pw-hint'
                        }
                        value={pw.next}
                        onChange={(e) => {
                          setPw({ ...pw, next: e.target.value })
                          clear('pwNext')
                          clear('pwConfirm')
                        }}
                      />
                      {errors.pwNext ? (
                        <FieldError id="set-pw-next-error">
                          {errors.pwNext}
                        </FieldError>
                      ) : (
                        <div id="set-pw-hint" style={S.hint}>
                          At least 12 characters. Length matters more than
                          punctuation.
                        </div>
                      )}
                    </div>
                    <div>
                      <label htmlFor="set-pw-confirm" style={S.label}>
                        Confirm New Password
                      </label>
                      <input
                        id="set-pw-confirm"
                        type="password"
                        autoComplete="new-password"
                        style={control(Boolean(errors.pwConfirm))}
                        aria-invalid={errors.pwConfirm ? true : undefined}
                        aria-describedby={
                          errors.pwConfirm ? 'set-pw-confirm-error' : undefined
                        }
                        value={pw.confirm}
                        onChange={(e) => {
                          setPw({ ...pw, confirm: e.target.value })
                          clear('pwConfirm')
                        }}
                      />
                      {errors.pwConfirm && (
                        <FieldError id="set-pw-confirm-error">
                          {errors.pwConfirm}
                        </FieldError>
                      )}
                    </div>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                    {/* Enabled whatever the boxes hold: pressing it is how
                        the user finds out which one is wrong, and the answer
                        arrives under that box rather than as a dead button. */}
                    <button
                      type="submit"
                      disabled={isChangingPassword}
                      style={{
                        ...S.submit,
                        opacity: isChangingPassword ? 0.5 : 1,
                      }}
                    >
                      <Save size={14} />
                      <span>
                        {isChangingPassword ? 'Changing…' : 'Change Password'}
                      </span>
                    </button>
                  </div>
                </form>

                <form
                  noValidate
                  onSubmit={(e) => {
                    e.preventDefault()

                    const minutes = form.sessionTimeoutMinutes ?? 60
                    if (
                      !Number.isFinite(minutes) ||
                      minutes < 5 ||
                      minutes > 1440
                    ) {
                      setErrors((prev) => ({
                        ...prev,
                        sessionTimeoutMinutes:
                          'Sign-out time must be between 5 and 1440 minutes.',
                      }))
                      return
                    }
                    setErrors((prev) => ({
                      ...prev,
                      sessionTimeoutMinutes: undefined,
                    }))

                    void saveTab(
                      ['sessionTimeoutMinutes', 'enforceTwoFactor'],
                      'Session policy saved.'
                    )
                  }}
                  style={S.card}
                >
                  <CardTitle icon={ShieldCheck}>Session Policy</CardTitle>

                  <div style={{ maxWidth: '240px' }}>
                    <label htmlFor="set-session-timeout" style={S.label}>
                      Sign out after inactivity (minutes)
                    </label>
                    <input
                      id="set-session-timeout"
                      type="number"
                      step={1}
                      style={control(Boolean(errors.sessionTimeoutMinutes))}
                      disabled={loading}
                      aria-invalid={
                        errors.sessionTimeoutMinutes ? true : undefined
                      }
                      aria-describedby={
                        errors.sessionTimeoutMinutes
                          ? 'set-session-timeout-error'
                          : 'set-session-timeout-hint'
                      }
                      value={form.sessionTimeoutMinutes ?? 60}
                      onChange={(e) => {
                        set('sessionTimeoutMinutes', Number(e.target.value))
                        clear('sessionTimeoutMinutes')
                      }}
                    />
                    {errors.sessionTimeoutMinutes ? (
                      <FieldError id="set-session-timeout-error">
                        {errors.sessionTimeoutMinutes}
                      </FieldError>
                    ) : (
                      <div id="set-session-timeout-hint" style={S.hint}>
                        Between 5 and 1440. Advisory: the access token lives 15
                        minutes regardless, and this cannot extend it.
                      </div>
                    )}
                  </div>

                  <SwitchRow
                    title="Require two-factor authentication"
                    description="Every user in the account signs in with a second factor."
                    checked={form.enforceTwoFactor ?? false}
                    onChange={(v) => set('enforceTwoFactor', v)}
                    note={
                      settings && !settings.twoFactorEnforceable
                        ? 'Recorded but not yet enforced — there is no second-factor enrolment. Turning this on changes nothing at sign-in today.'
                        : undefined
                    }
                  />

                  <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                    <button
                      type="submit"
                      disabled={isSaving || loading}
                      style={{
                        ...S.submit,
                        opacity: isSaving || loading ? 0.5 : 1,
                      }}
                    >
                      <Save size={14} />
                      <span>
                        {isSaving ? 'Saving…' : 'Save Session Policy'}
                      </span>
                    </button>
                  </div>
                </form>
              </div>
            )}

            {/* ── Roles & Permissions ── */}
            {activeTab === 'permissions' && <PermissionMatrix />}
          </div>
        </div>
      </main>
    </>
  )
}

export default function AdminSettingsPage() {
  const { hasPermission, isLoading } = useAuth()

  // The admin area admits head office, but account settings are read and
  // written with ACCOUNT_MANAGE, which head office does not hold. Without this
  // the page loaded and every request came back 403.
  if (!isLoading && !hasPermission('ACCOUNT_MANAGE')) {
    return (
      <div
        role="status"
        style={{
          margin: '32px auto',
          maxWidth: '480px',
          padding: '24px',
          textAlign: 'center',
          borderRadius: '14px',
          border: '1px solid #F0E6EC',
          backgroundColor: '#FFFFFF',
          color: '#6E6781',
          fontSize: '0.84rem',
          lineHeight: 1.5,
        }}
      >
        <div style={{ fontWeight: 700, color: '#2B253E', marginBottom: '6px' }}>
          Settings are managed by your administrator
        </div>
        Account settings, such as purchase-order rules, approval thresholds and
        notifications, can only be changed by a platform administrator.
      </div>
    )
  }

  return (
    <Suspense
      fallback={
        <div style={{ padding: '24px', maxWidth: '720px' }}>
          <SkeletonForm fields={6} label="Loading settings" />
        </div>
      }
    >
      <AdminSettingsContent />
    </Suspense>
  )
}

/** The account's PO format, previewed as it is typed. Blank clears it. */
function PoFormatSetting({
  value,
  disabled,
  onChange,
}: {
  value: string
  disabled: boolean
  onChange: (value: string) => void
}) {
  // Blank clears the format, so it is not an error to preview.
  const preview = value.trim() ? previewPoFormat(value) : null
  return (
    <div style={{ maxWidth: '320px' }}>
      <label htmlFor="set-po-format" style={S.label}>
        Purchase-order format
      </label>
      <input
        id="set-po-format"
        style={{
          ...S.input,
          fontFamily: 'monospace',
          ...(preview?.ok === false ? { borderColor: '#DC2626' } : {}),
        }}
        disabled={disabled}
        maxLength={64}
        placeholder="PO-####-YY"
        aria-invalid={preview?.ok === false || undefined}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      <div
        style={{
          ...S.hint,
          ...(preview?.ok === false ? { color: '#DC2626' } : {}),
        }}
      >
        {preview === null
          ? `Optional. Set it and every PO reference must have this shape. ${PO_FORMAT_LEGEND_TEXT}. A site may set its own.`
          : preview.ok
            ? `A valid reference looks like ${preview.example}. ${PO_FORMAT_LEGEND_TEXT}.`
            : preview.message}
      </div>
    </div>
  )
}
