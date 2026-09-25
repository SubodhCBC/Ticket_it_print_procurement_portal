// src/components/admin/ProductAdminUi.tsx
'use client'

import type {
  ButtonHTMLAttributes,
  CSSProperties,
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from 'react'
import { AlertTriangle, Check, Info, Lock } from 'lucide-react'
import { FieldError } from '@/components/ui/FormField'
import { Modal } from '@/components/ui/Modal'

/**
 * The building blocks the catalogue admin screens share, in the same inline
 * style as the rest of the admin area: white 14px cards on the page tint,
 * grey labels, one pink primary action.
 */

const COLORS = {
  text: '#2B253E',
  secondary: '#6E6781',
  muted: '#A39BB3',
  border: '#F0E6EC',
  hairline: '#F5EEF2',
  accent: '#F73582',
  accentSoft: '#FDE8F1',
  danger: '#DC2626',
  success: '#3F9C68',
}

const cardStyle: CSSProperties = {
  backgroundColor: '#FFFFFF',
  borderRadius: '14px',
  boxShadow:
    '0 1px 2px rgba(43, 37, 62, 0.04), 0 6px 16px rgba(43, 37, 62, 0.05)',
  padding: '20px',
  border: `1px solid ${COLORS.border}`,
  display: 'flex',
  flexDirection: 'column',
  gap: '16px',
}

const controlStyle: CSSProperties = {
  width: '100%',
  boxSizing: 'border-box',
  padding: '8px 12px',
  borderRadius: '10px',
  border: `1px solid ${COLORS.border}`,
  fontSize: '0.84rem',
  backgroundColor: '#FFFFFF',
  color: COLORS.text,
}

export function AdminCard({
  children,
  style,
}: {
  children: ReactNode
  style?: CSSProperties
}) {
  return <section style={{ ...cardStyle, ...style }}>{children}</section>
}

export function SectionHeading({
  title,
  description,
  action,
}: {
  title: string
  description?: ReactNode
  action?: ReactNode
}) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'space-between',
        gap: '12px',
        flexWrap: 'wrap',
      }}
    >
      <div style={{ minWidth: 0, flex: '1 1 260px' }}>
        <h2
          style={{
            fontSize: '0.95rem',
            fontWeight: 700,
            color: COLORS.text,
            margin: 0,
          }}
        >
          {title}
        </h2>
        {description && (
          <p
            style={{
              fontSize: '0.8rem',
              color: COLORS.secondary,
              margin: '4px 0 0',
              lineHeight: 1.5,
            }}
          >
            {description}
          </p>
        )}
      </div>
      {action && (
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          {action}
        </div>
      )}
    </div>
  )
}

type NoticeTone = 'error' | 'success' | 'info' | 'warning'

const NOTICE_TONES: Record<
  NoticeTone,
  { bg: string; color: string; icon: ReactNode }
> = {
  error: {
    bg: '#FEF2F2',
    color: COLORS.danger,
    icon: <AlertTriangle size={16} />,
  },
  success: { bg: '#ECFDF5', color: COLORS.success, icon: <Check size={16} /> },
  info: { bg: '#FCF7FA', color: COLORS.secondary, icon: <Info size={16} /> },
  warning: {
    bg: '#FFFBEB',
    color: '#B45309',
    icon: <AlertTriangle size={16} />,
  },
}

export function Notice({
  tone,
  children,
}: {
  tone: NoticeTone
  children: ReactNode
}) {
  const config = NOTICE_TONES[tone]
  return (
    <div
      role={tone === 'error' ? 'alert' : 'status'}
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: '8px',
        padding: '10px 14px',
        borderRadius: '10px',
        backgroundColor: config.bg,
        color: config.color,
        fontSize: '0.8rem',
        fontWeight: 500,
        lineHeight: 1.5,
      }}
    >
      <span style={{ flexShrink: 0, display: 'flex', marginTop: '1px' }}>
        {config.icon}
      </span>
      <div style={{ minWidth: 0, overflowWrap: 'anywhere' }}>{children}</div>
    </div>
  )
}

/** Shown in place of edit controls when the user may look but not change. */
export function ReadOnlyNotice({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        padding: '8px 12px',
        borderRadius: '10px',
        backgroundColor: '#FCF7FA',
        color: COLORS.secondary,
        fontSize: '0.78rem',
      }}
    >
      <Lock size={14} style={{ flexShrink: 0 }} />
      <span>{children}</span>
    </div>
  )
}

type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost'

const BUTTON_VARIANTS: Record<ButtonVariant, CSSProperties> = {
  primary: {
    backgroundColor: COLORS.accent,
    color: '#FFFFFF',
    border: '1px solid transparent',
  },
  secondary: {
    backgroundColor: '#FFFFFF',
    color: COLORS.text,
    border: `1px solid ${COLORS.border}`,
  },
  danger: {
    backgroundColor: '#FFFFFF',
    color: COLORS.danger,
    border: '1px solid #FECACA',
  },
  ghost: {
    backgroundColor: 'transparent',
    color: COLORS.secondary,
    border: '1px solid transparent',
  },
}

export function ActionButton({
  variant = 'secondary',
  size = 'md',
  pending = false,
  pendingLabel,
  icon,
  children,
  disabled,
  style,
  type = 'button',
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant
  size?: 'sm' | 'md'
  pending?: boolean
  pendingLabel?: string
  icon?: ReactNode
}) {
  const isDisabled = Boolean(disabled) || pending
  return (
    <button
      type={type}
      disabled={isDisabled}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '6px',
        padding: size === 'sm' ? '5px 10px' : '8px 14px',
        borderRadius: '10px',
        fontSize: size === 'sm' ? '0.76rem' : '0.82rem',
        fontWeight: 600,
        whiteSpace: 'nowrap',
        cursor: isDisabled ? 'not-allowed' : 'pointer',
        opacity: isDisabled ? 0.55 : 1,
        ...BUTTON_VARIANTS[variant],
        ...style,
      }}
      {...rest}
    >
      {icon}
      <span>{pending && pendingLabel ? pendingLabel : children}</span>
    </button>
  )
}

/**
 * One labelled control.
 *
 * `error` belongs to the field, not to the page: the message sits under the
 * box it is about, and the hint steps aside while it shows.
 */
export function Field({
  label,
  hint,
  error,
  htmlFor,
  children,
  style,
}: {
  label: string
  hint?: ReactNode
  error?: string | null
  htmlFor?: string
  children: ReactNode
  style?: CSSProperties
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', ...style }}>
      <label
        htmlFor={htmlFor}
        style={{
          display: 'block',
          fontSize: '0.78rem',
          fontWeight: 600,
          color: '#5C566E',
          marginBottom: '6px',
        }}
      >
        {label}
      </label>
      {children}
      {error ? (
        <FieldError id={htmlFor ? `${htmlFor}-error` : undefined}>
          {error}
        </FieldError>
      ) : hint ? (
        <div
          style={{
            fontSize: '0.74rem',
            color: COLORS.muted,
            marginTop: '4px',
            lineHeight: 1.4,
          }}
        >
          {hint}
        </div>
      ) : null}
    </div>
  )
}

export function TextInput({
  invalid,
  style,
  ...rest
}: InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }) {
  return (
    <input
      aria-invalid={invalid || undefined}
      style={{
        ...controlStyle,
        ...(invalid ? { borderColor: COLORS.danger } : {}),
        ...style,
      }}
      {...rest}
    />
  )
}

export function SelectInput({
  style,
  children,
  ...rest
}: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select style={{ ...controlStyle, ...style }} {...rest}>
      {children}
    </select>
  )
}

export function TextArea({
  style,
  ...rest
}: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      style={{ ...controlStyle, resize: 'vertical', ...style }}
      {...rest}
    />
  )
}

export function Th({
  children,
  align = 'left',
  first = false,
}: {
  children?: ReactNode
  align?: 'left' | 'right' | 'center'
  first?: boolean
}) {
  return (
    <th
      style={{
        padding: first ? '10px 16px' : '10px 12px',
        color: COLORS.muted,
        fontWeight: 500,
        fontSize: '0.74rem',
        whiteSpace: 'nowrap',
        textAlign: align,
      }}
    >
      {children}
    </th>
  )
}

export function Td({
  children,
  align = 'left',
  first = false,
  mono = false,
  style,
}: {
  children?: ReactNode
  align?: 'left' | 'right' | 'center'
  first?: boolean
  mono?: boolean
  style?: CSSProperties
}) {
  return (
    <td
      style={{
        padding: first ? '10px 16px' : '10px 12px',
        textAlign: align,
        color: COLORS.text,
        verticalAlign: 'middle',
        ...(mono
          ? {
              fontFamily: 'monospace',
              fontSize: '0.78rem',
              color: COLORS.secondary,
            }
          : {}),
        ...style,
      }}
    >
      {children}
    </td>
  )
}

/** A table that scrolls sideways inside its card instead of widening the page. */
export function AdminTable({
  head,
  children,
}: {
  head: ReactNode
  children: ReactNode
}) {
  return (
    <div style={{ overflowX: 'auto', margin: '0 -20px' }}>
      <table
        style={{
          width: '100%',
          borderCollapse: 'collapse',
          textAlign: 'left',
          fontSize: '0.84rem',
        }}
      >
        <thead>
          <tr>{head}</tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  )
}

export function StatTile({
  label,
  value,
  tone = 'default',
  hint,
}: {
  label: string
  value: ReactNode
  tone?: 'default' | 'danger' | 'success'
  hint?: ReactNode
}) {
  return (
    <div
      style={{
        paddingTop: '12px',
        borderTop: `1px solid ${COLORS.hairline}`,
      }}
    >
      <div
        style={{ fontSize: '0.76rem', color: COLORS.muted, fontWeight: 500 }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: '1.15rem',
          fontWeight: 700,
          marginTop: '4px',
          color:
            tone === 'danger'
              ? COLORS.danger
              : tone === 'success'
                ? COLORS.success
                : COLORS.text,
        }}
      >
        {value}
      </div>
      {hint && (
        <div
          style={{ fontSize: '0.74rem', color: COLORS.muted, marginTop: '2px' }}
        >
          {hint}
        </div>
      )}
    </div>
  )
}

export function StateBlock({
  title,
  description,
  icon,
  tone = 'muted',
}: {
  title: string
  description?: ReactNode
  icon?: ReactNode
  tone?: 'muted' | 'error'
}) {
  return (
    <div
      role={tone === 'error' ? 'alert' : undefined}
      style={{
        padding: '28px 16px',
        textAlign: 'center',
        color: COLORS.muted,
        fontSize: '0.84rem',
      }}
    >
      {icon && (
        <div
          style={{
            display: 'flex',
            justifyContent: 'center',
            marginBottom: '8px',
          }}
        >
          {icon}
        </div>
      )}
      <div
        style={{
          fontWeight: 600,
          color: tone === 'error' ? COLORS.danger : COLORS.text,
        }}
      >
        {title}
      </div>
      {description && (
        <div style={{ fontSize: '0.8rem', marginTop: '4px', lineHeight: 1.5 }}>
          {description}
        </div>
      )}
    </div>
  )
}

/**
 * A confirmation for anything destructive or hard to undo.
 *
 * The server's refusal is shown inside the dialog, beside the button that
 * caused it, and the dialog stays open so the reader can act on it. It cannot
 * be dismissed while the request is in flight.
 */
export function ConfirmModal({
  isOpen,
  title,
  message,
  confirmLabel,
  pendingLabel = 'Working…',
  tone = 'danger',
  pending = false,
  error,
  confirmDisabled = false,
  onConfirm,
  onCancel,
  children,
}: {
  isOpen: boolean
  title: string
  message: ReactNode
  confirmLabel: string
  pendingLabel?: string
  tone?: 'danger' | 'primary'
  pending?: boolean
  error?: string | null
  confirmDisabled?: boolean
  onConfirm: () => void
  onCancel: () => void
  children?: ReactNode
}) {
  return (
    <Modal
      isOpen={isOpen}
      onClose={pending ? () => undefined : onCancel}
      title={title}
      maxWidth="480px"
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
        <div
          style={{
            fontSize: '0.84rem',
            color: COLORS.secondary,
            lineHeight: 1.55,
          }}
        >
          {message}
        </div>
        {children}
        {error && <Notice tone="error">{error}</Notice>}
        <div
          style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}
        >
          <ActionButton onClick={onCancel} disabled={pending}>
            Cancel
          </ActionButton>
          <ActionButton
            variant={tone === 'danger' ? 'danger' : 'primary'}
            onClick={onConfirm}
            pending={pending}
            pendingLabel={pendingLabel}
            disabled={confirmDisabled}
            style={
              tone === 'danger'
                ? {
                    backgroundColor: COLORS.danger,
                    color: '#FFFFFF',
                    border: '1px solid transparent',
                  }
                : undefined
            }
          >
            {confirmLabel}
          </ActionButton>
        </div>
      </div>
    </Modal>
  )
}

/** Tabs for a long admin page; the active tab carries the accent underline. */
export function AdminTabs<T extends string>({
  tabs,
  active,
  onChange,
}: {
  tabs: { id: T; label: string; badge?: ReactNode }[]
  active: T
  onChange: (id: T) => void
}) {
  return (
    <div
      role="tablist"
      style={{
        display: 'flex',
        gap: '4px',
        borderBottom: `1px solid ${COLORS.border}`,
        overflowX: 'auto',
      }}
    >
      {tabs.map((tab) => {
        const isActive = tab.id === active
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => onChange(tab.id)}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '10px 14px',
              border: 'none',
              borderBottom: `2px solid ${isActive ? COLORS.accent : 'transparent'}`,
              marginBottom: '-1px',
              backgroundColor: 'transparent',
              color: isActive ? COLORS.text : COLORS.secondary,
              fontSize: '0.84rem',
              fontWeight: isActive ? 700 : 500,
              cursor: 'pointer',
              whiteSpace: 'nowrap',
            }}
          >
            {tab.label}
            {tab.badge !== undefined && (
              <span
                style={{
                  fontSize: '0.7rem',
                  fontWeight: 600,
                  padding: '1px 7px',
                  borderRadius: '9999px',
                  backgroundColor: isActive ? COLORS.accentSoft : '#F5EEF2',
                  color: isActive ? COLORS.accent : COLORS.secondary,
                }}
              >
                {tab.badge}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}
