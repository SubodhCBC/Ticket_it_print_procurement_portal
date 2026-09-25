/**
 * The vocabulary of the audit log.
 *
 * Values are `entity.past_tense_verb`, and they are an API: dashboards filter
 * on them, alerts match on them, and rows already written keep whatever string
 * they were written with. Adding an action is safe. Renaming one orphans every
 * historical entry that used the old name, so treat it the way a permission
 * rename is treated.
 */
export const AuditAction = {
  // --- Accounts -------------------------------------------------------------
  ACCOUNT_CREATED: 'account.created',
  ACCOUNT_UPDATED: 'account.updated',
  ACCOUNT_STATUS_CHANGED: 'account.status_changed',
  ACCOUNT_DEACTIVATED: 'account.deactivated',
  ACCOUNT_SETTINGS_UPDATED: 'account.settings_updated',

  // --- Sites ----------------------------------------------------------------
  SITE_CREATED: 'site.created',
  SITE_UPDATED: 'site.updated',
  SITE_DEACTIVATED: 'site.deactivated',
  SITE_ADDRESS_ADDED: 'site.address_added',
  SITE_ADDRESS_VALIDATED: 'site.address_validated',

  // --- Users ----------------------------------------------------------------
  USER_UPDATED: 'user.updated',
  USER_ROLE_CHANGED: 'user.role_changed',
  USER_DEACTIVATED: 'user.deactivated',
  USER_PROVISIONED_FROM_LEGACY: 'user.provisioned_from_legacy',
  USER_PERMISSION_GRANTED: 'user.permission_granted',
  USER_PERMISSION_REVOKED: 'user.permission_revoked',

  // --- Invitations ----------------------------------------------------------
  INVITATION_SENT: 'invitation.sent',
  INVITATION_REVOKED: 'invitation.revoked',
  INVITATION_ACCEPTED: 'invitation.accepted',

  // --- Catalog --------------------------------------------------------------
  CATEGORY_CREATED: 'category.created',
  CATEGORY_UPDATED: 'category.updated',
  CATEGORY_DEACTIVATED: 'category.deactivated',
  CATEGORY_VISIBILITY_SET: 'category.visibility_set',

  PRODUCT_CREATED: 'product.created',
  PRODUCT_UPDATED: 'product.updated',
  PRODUCT_STATUS_CHANGED: 'product.status_changed',
  PRODUCT_DELETED: 'product.deleted',
  PRODUCT_OPTIONS_SET: 'product.options_set',
  PRODUCT_VARIANT_CREATED: 'product.variant_created',
  PRODUCT_VARIANT_UPDATED: 'product.variant_updated',
  PRODUCT_VARIANT_DELETED: 'product.variant_deleted',
  PRODUCT_TIERS_SET: 'product.volume_tiers_set',
  PRODUCT_VISIBILITY_SET: 'product.visibility_set',
  PRODUCT_ASSET_ATTACHED: 'product.asset_attached',
  PRODUCT_ASSET_REMOVED: 'product.asset_removed',
  PRODUCT_STOCK_ADJUSTED: 'product.stock_adjusted',
  PRODUCT_STOCK_RECONCILED: 'product.stock_reconciled',
  PRODUCT_IMPORTED: 'product.imported',
  PRODUCT_EXPORTED: 'product.exported',

  // --- Rate cards -----------------------------------------------------------
  RATE_CARD_CREATED: 'rate_card.created',
  RATE_CARD_UPDATED: 'rate_card.updated',
  RATE_CARD_STATUS_CHANGED: 'rate_card.status_changed',
  RATE_CARD_ITEMS_SET: 'rate_card.items_set',
  RATE_CARD_ITEM_REMOVED: 'rate_card.item_removed',
  RATE_CARD_DELETED: 'rate_card.deleted',

  // --- Orders ---------------------------------------------------------------
  ORDER_PLACED: 'order.placed',
  ORDER_STATUS_CHANGED: 'order.status_changed',
  ORDER_PAYMENT_RECORDED: 'order.payment_recorded',
  /// NZ Post reported the parcel delivered and the order followed. Distinct from
  /// ORDER_STATUS_CHANGED because nobody pressed a button.
  ORDER_DELIVERY_CONFIRMED: 'order.delivery_confirmed',

  // --- Shipping (NZ Post) ---------------------------------------------------
  SHIPMENT_LABEL_REQUESTED: 'shipment.label_requested',
  SHIPMENT_LABELLED: 'shipment.labelled',
  SHIPMENT_LABEL_FAILED: 'shipment.label_failed',
  SHIPMENT_LABEL_DOWNLOADED: 'shipment.label_downloaded',
  SHIPMENT_RETRIED: 'shipment.retried',
  SHIPMENT_VOIDED: 'shipment.voided',
  PICKUP_BOOKED: 'pickup.booked',

  // --- Approvals ------------------------------------------------------------
  APPROVAL_DECIDED: 'approval.decided',
  APPROVAL_RULE_CREATED: 'approval_rule.created',
  APPROVAL_RULE_UPDATED: 'approval_rule.updated',
  APPROVAL_RULE_DELETED: 'approval_rule.deleted',

  // --- Billing --------------------------------------------------------------
  INVOICE_GENERATED: 'invoice.generated',
  INVOICE_ISSUED: 'invoice.issued',
  INVOICE_PAID: 'invoice.paid',
  INVOICE_VOIDED: 'invoice.voided',

  // --- Credentials ----------------------------------------------------------
  PASSWORD_RESET_REQUESTED: 'password.reset_requested',
  PASSWORD_RESET_COMPLETED: 'password.reset_completed',
  /// Changed deliberately by a signed-in user, as opposed to recovered by a
  /// reset token. Worth telling apart in the trail: one is routine hygiene,
  /// the other is the tail end of "I lost my password".
  PASSWORD_CHANGED: 'password.changed',
  // --- Templates ------------------------------------------------------------
  TEMPLATE_CREATED: 'template.created',
  TEMPLATE_UPDATED: 'template.updated',
  TEMPLATE_STATUS_CHANGED: 'template.status_changed',
  TEMPLATE_PUBLISHED: 'template.published',
  TEMPLATE_VERSION_RESTORED: 'template.version_restored',
  TEMPLATE_DUPLICATED: 'template.duplicated',
  TEMPLATE_DELETED: 'template.deleted',
  TEMPLATE_VISIBILITY_SET: 'template.visibility_set',
  TEMPLATE_ASSET_ATTACHED: 'template.asset_attached',
  TEMPLATE_ASSET_REMOVED: 'template.asset_removed',

  // --- Document library (DAM) -----------------------------------------------
  /// Reads are logged as well as writes. A DAM holds documents whose *reading*
  /// is the sensitive act, and "who took the artwork" is unanswerable after the
  /// fact if only uploads were recorded.
  DAM_DOCUMENTS_LISTED: 'dam.documents_listed',
  DAM_DOCUMENT_VIEWED: 'dam.document_viewed',
  DAM_DOCUMENT_DOWNLOADED: 'dam.document_downloaded',
  DAM_DOCUMENT_UPLOADED: 'dam.document_uploaded',
  /// `ImageManagement/UnlinkFile`. The library has no undo and a file is named
  /// only by its folder and name, so this row is the only record that a
  /// particular file ever existed.
  DAM_DOCUMENT_DELETED: 'dam.document_deleted',
  DAM_FOLDER_CREATED: 'dam.folder_created',
} as const

export type AuditAction = (typeof AuditAction)[keyof typeof AuditAction]

/**
 * Actions that record something *happening* rather than something *changing*.
 *
 * Every other action is a mutation, and `recordAudit` will not compile without
 * its before and after values (SOW O-7: "every entity mutation capturing ...
 * before and after values"). The split is the enforcement: a service added next
 * year that audits a change without saying what changed is a type error, not a
 * gap somebody finds in an audit.
 *
 * An action belongs here only when there is genuinely no portal field that
 * moved:
 *
 * - **Reads.** A label downloaded, a catalogue exported, a document viewed.
 * - **Requests with no field of their own.** A reset request issues a token —
 *   which is a secret and is never logged — and changes nothing on the user.
 * - **Summaries of changes recorded elsewhere.** A bulk import's job entry; the
 *   products it touched each have their own mutation entry.
 * - **The document library.** Ticket-IT is the system of record for its files;
 *   the portal holds no prior state to compare, only the fact of the upload,
 *   folder or deletion.
 *
 * Adding an action here to get past the compiler defeats the point. If a field
 * changed, record it.
 */
export const EVENT_ACTIONS = [
  AuditAction.PASSWORD_RESET_REQUESTED,
  // The job's summary line. Every product the import created or changed has its
  // own PRODUCT_CREATED or PRODUCT_UPDATED entry with before and after values;
  // this one records that the job ran and what it counted.
  AuditAction.PRODUCT_IMPORTED,
  AuditAction.PRODUCT_EXPORTED,
  AuditAction.SHIPMENT_LABEL_DOWNLOADED,
  AuditAction.DAM_DOCUMENTS_LISTED,
  AuditAction.DAM_DOCUMENT_VIEWED,
  AuditAction.DAM_DOCUMENT_DOWNLOADED,
  AuditAction.DAM_DOCUMENT_UPLOADED,
  AuditAction.DAM_DOCUMENT_DELETED,
  AuditAction.DAM_FOLDER_CREATED,
] as const satisfies readonly AuditAction[]

export type AuditEventAction = (typeof EVENT_ACTIONS)[number]
export type AuditMutationAction = Exclude<AuditAction, AuditEventAction>

/**
 * Field names whose values are never written to the audit log, whatever they
 * are nested under.
 *
 * The log records *what changed*, and for these it records only that they
 * changed. An audit trail that captured a password hash or a live invitation
 * token would turn the compliance feature into the breach: audit rows are read
 * by more people, kept far longer, and exported more often than the tables they
 * describe.
 */
export const REDACTED_FIELDS: ReadonlySet<string> = new Set([
  'password',
  'passwordHash',
  'newPassword',
  'currentPassword',
  'token',
  'tokenHash',
  'refreshToken',
  'accessToken',
  'secret',
  'apiKey',
  'hmacSecret',
  'authorization',
  'cookie',
  'presignedUrl',
  'signedUrl',
])

export const REDACTED_PLACEHOLDER = '[redacted]'
