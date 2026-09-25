// src/components/admin/AuditLogVocabulary.ts
import type { AuditEntityType } from '@/types'

/**
 * The audit log's vocabulary, as the explorer displays it.
 *
 * A static mirror of `src/server/audit/audit.entity-types.ts` and
 * `src/server/audit/audit.actions.ts` — the browser cannot import server
 * modules. When the server adds an action, add it here too; an action missing
 * from this list still shows in the table and can still be filtered on from a
 * shared link, it just is not offered in the dropdown.
 */

export const AUDIT_ENTITY_TYPES: readonly AuditEntityType[] = [
  'ACCOUNT',
  'SITE',
  'USER',
  'INVITATION',
  'PERMISSION',
  'PRODUCT',
  'RATE_CARD',
  'ORDER',
  'TEMPLATE',
  'INTEGRATION',
  'SYSTEM',
]

export const AUDIT_ENTITY_TYPE_LABELS: Record<AuditEntityType, string> = {
  ACCOUNT: 'Account',
  SITE: 'Site',
  USER: 'User',
  INVITATION: 'Invitation',
  PERMISSION: 'Permission',
  PRODUCT: 'Product',
  RATE_CARD: 'Rate card',
  ORDER: 'Order',
  TEMPLATE: 'Template',
  INTEGRATION: 'Integration',
  SYSTEM: 'System',
}

export function isAuditEntityType(value: string): value is AuditEntityType {
  return (AUDIT_ENTITY_TYPES as readonly string[]).includes(value)
}

export const AUDIT_ACTIONS: readonly string[] = [
  'account.created',
  'account.updated',
  'account.status_changed',
  'account.deactivated',
  'account.settings_updated',
  'site.created',
  'site.updated',
  'site.deactivated',
  'site.address_added',
  'site.address_validated',
  'user.updated',
  'user.role_changed',
  'user.deactivated',
  'user.provisioned_from_legacy',
  'user.permission_granted',
  'user.permission_revoked',
  'invitation.sent',
  'invitation.revoked',
  'invitation.accepted',
  'category.created',
  'category.updated',
  'category.deactivated',
  'category.visibility_set',
  'product.created',
  'product.updated',
  'product.status_changed',
  'product.deleted',
  'product.options_set',
  'product.variant_created',
  'product.variant_updated',
  'product.variant_deleted',
  'product.volume_tiers_set',
  'product.visibility_set',
  'product.asset_attached',
  'product.asset_removed',
  'product.stock_adjusted',
  'product.stock_reconciled',
  'product.imported',
  'rate_card.created',
  'rate_card.updated',
  'rate_card.status_changed',
  'rate_card.items_set',
  'rate_card.item_removed',
  'rate_card.deleted',
  'order.placed',
  'order.status_changed',
  'order.payment_recorded',
  'order.delivery_confirmed',
  'shipment.label_requested',
  'shipment.labelled',
  'shipment.label_failed',
  'shipment.label_downloaded',
  'shipment.retried',
  'shipment.voided',
  'pickup.booked',
  'approval.decided',
  'approval_rule.created',
  'approval_rule.updated',
  'approval_rule.deleted',
  'invoice.generated',
  'invoice.issued',
  'invoice.paid',
  'invoice.voided',
  'password.reset_requested',
  'password.reset_completed',
  'password.changed',
  'template.created',
  'template.updated',
  'template.status_changed',
  'template.published',
  'template.version_restored',
  'template.duplicated',
  'template.deleted',
  'template.visibility_set',
  'template.asset_attached',
  'template.asset_removed',
  'dam.documents_listed',
  'dam.document_viewed',
  'dam.document_downloaded',
  'dam.document_uploaded',
]

const SUBJECT_LABELS: Record<string, string> = {
  rate_card: 'Rate card',
  approval_rule: 'Approval rule',
  dam: 'Document library',
}

function capitalise(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1)
}

function subjectLabel(subject: string): string {
  return SUBJECT_LABELS[subject] ?? capitalise(subject.replace(/_/g, ' '))
}

/** `rate_card.status_changed` → `Rate card: status changed`. */
export function auditActionLabel(action: string): string {
  const dot = action.indexOf('.')
  if (dot < 0) return capitalise(action.replace(/_/g, ' '))
  const verb = action.slice(dot + 1).replace(/[._]/g, ' ')
  return `${subjectLabel(action.slice(0, dot))}: ${verb}`
}

/** The action list grouped by subject, in declaration order, for `<optgroup>`s. */
export const AUDIT_ACTION_GROUPS: readonly {
  label: string
  actions: readonly string[]
}[] = (() => {
  const groups = new Map<string, string[]>()
  for (const action of AUDIT_ACTIONS) {
    const subject = action.split('.')[0] ?? action
    const bucket = groups.get(subject)
    if (bucket) bucket.push(action)
    else groups.set(subject, [action])
  }
  return [...groups].map(([subject, actions]) => ({
    label: subjectLabel(subject),
    actions,
  }))
})()

const ROLE_LABELS: Record<string, string> = {
  ADMIN: 'Admin',
  HEAD_OFFICE: 'Head office',
  SITE_USER: 'Site user',
}

/** Unknown roles are shown as written rather than coerced into a known one. */
export function auditActorRoleLabel(role: string): string {
  return ROLE_LABELS[role] ?? role
}
