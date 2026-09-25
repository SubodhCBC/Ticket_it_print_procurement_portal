import type { DesignDocument } from './design'

// src/lib/services/types.ts
// Domain Types and DTOs matching the Prisma schema and service layer contract

/**
 * Mirrors the API's `ProductStatus`. `DRAFT` is included because an
 * administrator browsing the catalogue sees unpublished products; every other
 * caller is filtered to the customer-visible statuses server-side.
 */
export type ProductStatus = 'DRAFT' | 'ACTIVE' | 'UNAVAILABLE' | 'SUPERSEDED'

export type ProductVisibility = 'ALL_ACCOUNTS' | 'RESTRICTED'

export type ProductUom =
  'EACH' | 'PACK' | 'BOX' | 'ROLL' | 'SET' | 'SQUARE_METRE'

export type ProductSizeOption = {
  id: string
  label: string
  dimensions: string
  widthInches: number
  heightInches: number
  priceMultiplier: number
  isPopular?: boolean
}

export type ProductMaterialOption = {
  id: string
  name: string
  description: string
  priceAddon: number
  recommendedFor?: string
}

export type ProductFinishOption = {
  id: string
  name: string
  description: string
  priceAddon: number
}

export type ProductVolumeDiscount = {
  minQty: number
  discountPercent: number
}

export type Product = {
  id: string
  sku: string
  name: string
  description: string
  thumbnailUrl: string
  categoryId: string
  categoryName?: string
  /** The shelf label — "Pack of 250". Not a number; see `unitsPerPack`. */
  packSize: string
  /**
   * How many pieces one pack holds, as a count.
   *
   * The portal sells packs: a quantity of 5 is five packs, 1,250 cards. The
   * label above says that in words but cannot be multiplied, so the count
   * travels beside it. Optional because the fixtures and the template builder
   * construct partial products that never had one.
   */
  unitsPerPack?: number
  uom: string
  basePrice: number
  moq: number
  orderMultiple: number
  status: ProductStatus
  stockRemaining?: number
  lowStockThreshold?: number
  isPersonalizable?: boolean
  personalizationTemplate?: string
  artworkUrl?: string
  printCategory?:
    | 'Signs'
    | 'Posters'
    | 'Banners'
    | 'Flyers'
    | 'Business Cards'
    | 'Brochures'
    | 'Catalogue'
    | 'Template Design'
    | 'Marketing Materials'
    | 'Promotional Products'
  availableSizes?: ProductSizeOption[]
  materials?: ProductMaterialOption[]
  finishingOptions?: ProductFinishOption[]
  volumeDiscounts?: ProductVolumeDiscount[]
  turnaroundDays?: number
  templatesCount?: number
  createdAt?: string
  updatedAt?: string

  // --- Straight from the API -------------------------------------------------
  // Present on anything loaded through the catalogue endpoints. Optional so the
  // fixtures and the template builder, which construct partial products of
  // their own, still satisfy the type.

  visibility?: ProductVisibility
  /** Physically on the shelf. `stockRemaining` is what is still buyable. */
  stockOnHand?: number
  /** Held for placed orders that have not shipped. */
  stockReserved?: number
  /** Whether stock is counted at all — false for print-on-demand. */
  trackInventory?: boolean
  /** Derived server-side: at or below the low-stock threshold. */
  isLowStock?: boolean
  reorderQuantity?: number | null
  tags?: string[]
  /** How GST applies to it (SOW F-06). */
  taxTreatment?: 'STANDARD' | 'ZERO_RATED' | 'EXEMPT'
  widthMm?: number | null
  heightMm?: number | null
  bleedMm?: number | null
  safeMarginMm?: number | null
  supersededBy?: { id: string; sku: string; name: string } | null

  /**
   * The option axes as the API models them — a named, ordered list of values.
   * `availableSizes` / `materials` / `finishingOptions` above are the same data
   * shaped for the controls that render them; this is what a variant's
   * `attributes` are keyed on.
   */
  optionAxes?: ProductOptionAxis[]
  /**
   * The orderable configurations. A product with option axes can only be added
   * to a basket as one of these — a line with options and no configuration
   * reaches production with nothing saying what to print.
   */
  variants?: ProductVariant[]
}

export type ProductOptionAxis = {
  id: string
  name: string
  values: string[]
  /**
   * What each value adds to the price of one pack, keyed by value. Every value
   * is present; zero means it costs nothing extra.
   */
  valuePrices: Record<string, number>
}

export type ProductVariant = {
  id: string
  sku: string
  /** Option name to chosen value, e.g. `{ Size: 'A2', Finish: 'Matte' }`. */
  attributes: Record<string, string>
  /** What this configuration costs. Equals the base price unless overridden. */
  effectivePrice: number
  availableStock: number
  status: string
}

/**
 * The minimum a quantity control needs to know about a product: what it can be
 * ordered in. A cart line carries these without being a full catalogue entry,
 * which is why the controls take this rather than `Product`.
 */
export type OrderableProduct = Pick<
  Product,
  'moq' | 'orderMultiple' | 'uom' | 'packSize' | 'unitsPerPack'
>

export type ProductCategory = {
  id: string
  name: string
  code: string
  description: string
  itemCount: number
}

// ─── Master Design Template Types (Admin & Site User) ───────────────────────

export type TemplateFieldKey =
  | 'businessName'
  | 'contactName'
  | 'phone'
  | 'email'
  | 'website'
  | 'address'
  | 'hours'
  | 'logo'
  | 'tagline'
  | 'promoOffer'
  | 'qrCode'
  /**
   * A CODE128 payload. Added alongside `qrCode` because a barcode space was
   * otherwise unpublishable: publishing requires a field key on every editable
   * layer, and there was no key that meant "barcode", so an administrator could
   * mark the space and then never ship the template.
   */
  | 'barcode'
  | 'customNotes'

export type TemplateLayerType =
  | 'text'
  | 'image'
  | 'logo'
  | 'shape'
  | 'badge'
  | 'qrcode'
  | 'divider'
  | 'barcode'

export type TemplateLayerStyle = {
  fontSize?: number
  fontFamily?: string
  fontWeight?: string | number
  fontStyle?: 'normal' | 'italic'
  color?: string
  textAlign?: 'left' | 'center' | 'right'
  backgroundColor?: string
  borderColor?: string
  borderWidth?: number
  borderRadius?: number
  opacity?: number
  letterSpacing?: number
  lineHeight?: number
  textTransform?: 'uppercase' | 'lowercase' | 'none'
  boxShadow?: string
  padding?: number
  /**
   * CSS clip-path derived from a builder mask, relative to the layer's own box
   * (e.g. "inset(10% 0% 5% 20%)"). Lets the storefront honour a mask that the
   * flat layer model cannot otherwise express.
   */
  clipPath?: string
}

export type TemplateLayer = {
  id: string
  type: TemplateLayerType
  name: string
  isEditableBySiteUser: boolean // Admin defines this rule!
  fieldKey?: TemplateFieldKey
  label: string
  helperText?: string
  x: number // percentage (0-100) or pixels
  y: number // percentage (0-100) or pixels
  width: number // percentage (0-100) or pixels
  height: number // percentage (0-100) or pixels
  content: string // text string, image url, svg, or qr payload
  style: TemplateLayerStyle
  zIndex?: number
  rotation?: number
  isRequired?: boolean
}

export type TemplateTheme =
  | 'modern'
  | 'corporate'
  | 'healthcare'
  | 'promotional'
  | 'minimalist'
  | 'luxury'
  | 'vibrant'
  | 'retail'
  | 'grand-opening'

export type PrintTemplate = {
  id: string
  productId: string
  productName: string
  category: string
  /**
   * What one pack of this design costs, and how many pieces that buys.
   *
   * The price of a print job belongs to the design, not to the stock it prints
   * on: a buyer personalising a template pays what the template costs however
   * far they move the text about. `unitsPerPack` is there to print "2.50 each"
   * beside "250.00" — a cart quantity of 2 is two packs, not two pieces.
   *
   * Null on a design nobody has priced. Publishing refuses that, so a null
   * only ever reaches an operator looking at their own draft.
   */
  price: number | null
  unitsPerPack: number | null
  name: string
  description: string
  thumbnailUrl: string
  previewMockupUrl?: string
  orientation: 'landscape' | 'portrait' | 'square'
  aspectRatio: string // e.g. "4:3", "16:9", "1:1", "2:3", "3:4"
  dimensions: {
    width: number
    height: number
    unit: 'in' | 'mm' | 'px'
  }
  bleedMargin: number // e.g. 0.125 inches (trim margin)
  safeMargin: number // e.g. 0.25 inches (content safe area)
  status: 'PUBLISHED' | 'DRAFT' | 'ARCHIVED'
  theme: TemplateTheme
  canvasConfig: {
    backgroundColor: string
    backgroundImageUrl?: string
    bgGradient?: string
    bgPattern?: string
  }
  layers: TemplateLayer[]
  /**
   * Counts the server computed, present on gallery rows.
   *
   * A listing deliberately carries no design document, so `layers` is empty
   * there and counting it would report zero for every template. These are the
   * numbers to render; fall back to `layers` only on a detail.
   */
  editableFieldCount?: number
  layerCount?: number
  /**
   * Structured design document - the editor's source of truth. Groups, masks,
   * gradients and filters live here; `layers` is the flat, derived view the
   * storefront renders. See src/types/design.ts.
   */
  design?: DesignDocument
  /**
   * Full fabric canvas serialization. Kept so templates saved before `design`
   * existed still reopen correctly.
   */
  canvasJson?: string
  version: number
  createdAt: string
  updatedAt: string
  createdBy?: string
  /**
   * Ownership, as the server reports it.
   *
   * Optional because the fixture adapter never set them and the operator's
   * screens never ask. A customer's gallery does: it splits its rows on
   * `ownerUserId`, and offers an editor only for what the server would let
   * them save.
   */
  visibility?: 'ALL_ACCOUNTS' | 'RESTRICTED' | 'ACCOUNT' | 'PRIVATE'
  ownerUserId?: string | null
  ownerAccountId?: string | null
  sourceTemplateId?: string | null
  /**
   * The accounts a RESTRICTED template is granted to. Only a detail read
   * carries it; a gallery row does not.
   */
  restrictedToAccountIds?: string[]
}

export type CustomizedArtworkData = {
  templateId: string
  templateName: string
  previewUrl: string
  fields: Record<TemplateFieldKey | string, string>
  selectedSize?: ProductSizeOption
  selectedMaterial?: ProductMaterialOption
  selectedFinish?: ProductFinishOption
  customizedAt: string
}

export type Address = {
  street: string
  suite?: string
  city: string
  state: string
  postalCode: string
  country: string
}

export type Site = {
  id: string
  accountId: string
  accountName?: string
  name: string
  code: string
  billToAddress: Address
  shipToAddress: Address
  activeUsersCount?: number
  totalOrdersCount?: number
  monthlySpend?: number
  /** The branch's monthly budget; absent means no cap. */
  monthlyBudget?: number
  poRequired?: boolean
  poPrefix?: string
  costCentre?: string
  createdAt?: string
}

export type Account = {
  id: string
  name: string
  accountCode: string
  status: 'ACTIVE' | 'INACTIVE' | 'SUSPENDED'
  contactEmail: string
  contactPhone?: string
  sitesCount?: number
  activeRateCardId?: string
  activeRateCardName?: string
  totalMonthlySpend?: number
  approvalThreshold?: number
  requirePoNumber?: boolean
  poPrefix?: string
  poFormat?: string
  createdAt?: string
}

export type UserRole = 'ADMIN' | 'HEAD_OFFICE' | 'SITE_USER'

export type PortalUser = {
  id: string
  email: string
  name: string
  role: UserRole
  avatar?: string
  siteId?: string
  siteName?: string
  siteCode?: string
  accountId?: string
  accountName?: string
  department?: string
  monthlyBudgetCap?: number
  poPrefix?: string
  status: 'ACTIVE' | 'INVITED' | 'DISABLED'
  createdAt?: string
}

/**
 * The order's fulfilment lifecycle — the nine the server defines in
 * `src/server/orders/order-status.ts`, and nothing else.
 *
 * This union used to carry four more: `PAID`, `ORDER_PLACED`, `IN_PRODUCTION`
 * and `RECEIVED`. They were display states from the fixtures, the API has never
 * sent one, and `PAID` in particular belongs to `PaymentStatus` — an order on
 * Net 30 terms is routinely delivered a month before it is paid, so a value
 * from that axis in this one made the ordinary sequence unrepresentable.
 */
export type OrderStatus =
  | 'DRAFT'
  | 'PENDING_APPROVAL'
  | 'CHANGES_REQUESTED'
  | 'APPROVED'
  | 'PROCESSING'
  | 'DISPATCHED'
  | 'DELIVERED'
  | 'REJECTED'
  | 'CANCELLED'

export type PaymentStatus = 'UNPAID' | 'PAYMENT_PENDING' | 'PAID' | 'REFUNDED'

export type CorporatePaymentMethod =
  | 'CORPORATE_INVOICE'
  | 'PURCHASING_CARD'
  | 'CORPORATE_ACH'
  | 'PREAPPROVED_CREDIT'

export type OrderStatusHistory = {
  status: OrderStatus
  timestamp: string
  actorName: string
  actorRole: string
  comment?: string
}

export type OrderLineItem = {
  id: string
  orderId: string
  productId: string
  productName: string
  sku: string
  thumbnailUrl?: string
  qty: number
  unitPrice: number
  lineTotal: number
  packSize?: string
  uom?: string
  customizations?: Record<string, string>
  templateId?: string
  templateName?: string
  selectedSize?: string
  selectedMaterial?: string
  selectedFinish?: string
  customizedArtworkUrl?: string
  /**
   * The configuration as it was ordered — `{ Finish: 'Gloss Laminate' }` —
   * frozen at placement. Absent for a line with no options.
   */
  options?: Record<string, string>
  /** The buyer's note for this line only (SOW F-19). */
  notes?: string
}

export type Order = {
  id: string
  orderNumber: string
  accountId: string
  accountName: string
  siteId: string
  siteCode: string
  siteName: string
  userId: string
  userName: string
  userEmail: string
  /** The role the order was placed in (SOW F-13), e.g. SITE_USER. */
  userRole?: string
  poReference?: string
  campaignCode?: string
  projectCode?: string
  /** The buyer's own free-text name for the order. */
  customerReference?: string
  status: OrderStatus
  paymentStatus?: PaymentStatus
  paymentMethod?: CorporatePaymentMethod
  paymentReference?: string
  paidBy?: string
  paidAt?: string
  /** Lines plus delivery: what the branch is invoiced. */
  totalAmount: number
  /** The lines alone, before delivery. */
  subtotalAmount?: number
  /** What delivery added. Zero on orders placed before it was charged. */
  shippingCost?: number
  shippingMethod?: 'COURIERPOST_EXPRESS' | 'STANDARD_PARCEL'
  /** "CourierPost Express (Next Day)" */
  shippingMethodLabel?: string
  itemCount: number
  requiresApproval?: boolean
  approvalNotes?: string
  approvedBy?: string
  approvedAt?: string
  rejectedReason?: string
  changesRequestedNotes?: string
  createdAt: string
  updatedAt: string
  dispatchedAt?: string
  deliveredAt?: string
  /**
   * For whoever delivers: sent with the order at checkout, editable at
   * dispatch, printed on the courier label.
   */
  deliveryNotes?: string
  /** The basket's free-text notes, carried to the order at placement. */
  notes?: string
  /**
   * The NZ Post address, service or collection point chosen at checkout.
   * Recorded for dispatch, never billed. Single-order read only.
   */
  nzPostDelivery?: {
    kind: 'ADDRESS' | 'COLLECTION'
    fullAddress: string | null
    collectionPointName: string | null
    serviceDescription: string | null
    /** The service code the label defaults to. */
    serviceCode: string | null
    /**
     * Whether NZ Post validated the address at checkout. Without it, a label
     * needs the delivery address typed in parts.
     */
    addressValidated: boolean
    /** The packed size checkout estimated — the label form's starting values. */
    parcelEstimate: {
      weightKg: number
      lengthCm: number
      widthCm: number
      heightCm: number
      /** Products with no recorded weight, estimated at a floor instead. */
      missingWeightSkus: string[]
    } | null
  }
  carrier?: string
  trackingNumber?: string
  requestedDeliveryDate?: string
  deliveryAddress?: Address
  /** Who the order was billed to, frozen at placement. Absent on older orders. */
  billingAddress?: Address
  recipientContact?: {
    name: string
    phone?: string
    email?: string
  }
  customizedArtwork?: CustomizedArtworkData
  statusHistory?: OrderStatusHistory[]
  lineItems: OrderLineItem[]
}

/**
 * Which rule produced a price. Reported by the API rather than inferred: "20%
 * off" reached by a contract ladder and by the card's blanket discount are the
 * same number and a very different conversation with the customer.
 */
export type PriceSource =
  | 'CATALOG_BASE'
  | 'CATALOG_VOLUME_TIER'
  | 'CONTRACT_FIXED_PRICE'
  | 'CONTRACT_VOLUME_TIER'
  | 'CONTRACT_ITEM_DISCOUNT'
  | 'CONTRACT_DEFAULT_DISCOUNT'

export type RateCardTier = {
  minQuantity: number
  discountPercent: number
}

export type RateCardItem = {
  id: string
  rateCardId: string
  productId: string
  productSku: string
  productName: string
  basePrice: number
  fixedPrice?: number
  discountPct?: number
  effectivePrice: number

  /** The contract's own volume ladder for this product. */
  tiers?: RateCardTier[]
  /** The quantity `effectivePrice` was worked out at — the product's MOQ. */
  effectiveAtQuantity?: number
  source?: PriceSource
  /** True when this negotiated line prices *above* the public catalogue price. */
  aboveCatalogPrice?: boolean
}

export type RateCard = {
  id: string
  accountId: string
  accountName: string
  name: string
  effectiveFrom: string
  effectiveTo?: string
  defaultDiscountPct: number
  status: 'ACTIVE' | 'DRAFT' | 'ARCHIVED'
  itemCount: number
  /**
   * Empty on a list response and populated on a single-card read — a card can
   * carry two thousand negotiated lines, so the list reports `itemCount` and
   * leaves the lines to whoever opens the card.
   */
  items: RateCardItem[]

  /**
   * Whether the card is pricing anything at this instant. Distinct from
   * `status`: an ACTIVE card outside its effective window quotes nobody.
   */
  isInForce?: boolean
  notes?: string
  accountCode?: string
}

/** What an audit entry is about — mirrors `AuditEntityType` on the server. */
export type AuditEntityType =
  | 'ACCOUNT'
  | 'SITE'
  | 'USER'
  | 'INVITATION'
  | 'PERMISSION'
  | 'PRODUCT'
  | 'RATE_CARD'
  | 'ORDER'
  | 'TEMPLATE'
  | 'INTEGRATION'
  | 'SYSTEM'

export type AuditLogEntry = {
  id: string
  /** Null when the entry was written by the system rather than a signed-in user. */
  actorId: string | null
  actorName: string
  actorEmail: string
  /** The role held at the time, which may be one this build does not know. */
  actorRole: UserRole | (string & {})
  action: string
  entityType: AuditEntityType
  entityId: string
  entityName?: string
  ipAddress?: string
  userAgent?: string
  /** Ties the entry to the structured server logs for the same request. */
  requestId?: string
  /**
   * The difference view (§12): one row per changed field, old beside new.
   * `before` is null on a creation and `after` on a removal.
   */
  changes: AuditFieldChange[]
  /**
   * Whether before and after values were recorded at all. False for an event
   * with no fields, and for entries written before values were captured — which
   * must read "not recorded", not "nothing changed".
   */
  changesCaptured: boolean
  details?: unknown
  timestamp: string
}

export type AuditFieldChange = {
  field: string
  before: unknown
  after: unknown
}

/**
 * Filters for `GET /audit-logs`. One account per query: without `accountId`
 * the caller's own account is used, and only admins may name another.
 */
export type AuditLogQuery = {
  accountId?: string
  actorId?: string
  entityType?: AuditEntityType
  entityId?: string
  action?: string
  /** ISO 8601, inclusive. */
  from?: string
  /** ISO 8601, inclusive. */
  to?: string
  /** Actor name/email, entity name or entity id. */
  search?: string
  /** Entries whose recorded change includes this field, e.g. `basePrice`. */
  field?: string
  page?: number
  pageSize?: number
}

export type MonthlyBillingSiteSummary = {
  siteId: string
  siteCode: string
  siteName: string
  accountName: string
  ordersCount: number
  purchaseOrdersCount: number
  totalSpend: number
  topCategory: string
  status: 'SETTLED' | 'PENDING' | 'DISPUTED'
}

export type MonthlyBillingReport = {
  period: string
  invoiceNumber: string
  invoiceDate: string
  dueDate: string
  totalSpend: number
  totalOrders: number
  activeSitesCount: number
  siteBreakdowns: MonthlyBillingSiteSummary[]
  categoryBreakdown: { category: string; spend: number; percentage: number }[]
}

export type DashboardKPIs = {
  totalRevenueMonth: number
  /**
   * Growth against the previous window, or null when there is no previous
   * window to compare against. Null is not zero: zero says "flat", null says
   * "nothing to compare yet", and the tiles render it as a dash.
   */
  revenueDeltaPct: number | null
  activeOrdersCount: number
  ordersDeltaPct: number | null
  /**
   * The live queue, as of now rather than over the reporting window.
   *
   * Everything above this line describes the last thirty days; everything in
   * this block describes the moment the page loaded. The split is deliberate —
   * an order placed six weeks ago and still in production is work somebody is
   * waiting on today, and a windowed count hides exactly the orders that are
   * stuck.
   */
  pendingFulfilmentCount: number
  openOrdersCount: number
  awaitingApprovalCount: number
  inFulfilmentCount: number
  inTransitCount: number
  ordersPerDay: number
  activeSitesCount: number
  activeAccountsCount: number
  recentOrders: Order[]
  statusDistribution: { status: OrderStatus; count: number; value: number }[]
  revenueTrend: { month: string; spend: number; orders: number }[]
}

export type PaginatedResult<T> = {
  items: T[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}

export type ServiceError = {
  code: string
  message: string
  field?: string
}

// ─── Head Office Module Types ────────────────────────────────────────────────

export type HOSpendBysite = {
  siteId: string
  siteCode: string
  siteName: string
  ordersCount: number
  totalSpend: number
  percentageOfTotal: number
}

export type HOSpendTrend = {
  month: string
  spend: number
  orders: number
}

export type HODashboardKPIs = {
  accountId: string
  accountName: string
  totalSpendThisMonth: number
  totalSpendLastMonth: number
  /** Null where there is no prior month; see `DashboardKPIs.revenueDeltaPct`. */
  spendDeltaPct: number | null
  orderCountThisMonth: number
  orderCountLastMonth: number
  ordersDeltaPct: number | null
  activeSitesCount: number
  topSite: { siteName: string; siteCode: string; spend: number }
  recentOrders: Order[]
  spendBySite: HOSpendBysite[]
  spendTrend: HOSpendTrend[]
}

export type HOBillingLineItem = {
  // Identity
  orderNumber: string
  orderDate: string
  // Account / Site
  accountName: string
  accountId: string
  siteName: string
  siteId: string
  siteCode: string
  // User / Contact
  orderedByUser: string
  orderedByEmail: string
  // PO Reference
  poReference: string
  // Product
  productName: string
  sku: string
  packSize: string
  uom: string
  // Qty / Pricing
  qty: number
  /** Null where the row carries no per-product detail — a dash, not $0.00. */
  unitPrice: number | null
  lineValue: number
  taxTreatment: string
  // Order totals
  orderTotal: number
  // Addresses
  shipToAddress: string
  deliveryContact: string
  deliveryInstructions: string
  billToAddress: string
  billToEntity: string
  // Status
  status: OrderStatus
  notes: string
}

export type HOMonthlyBillingReport = {
  accountId: string
  accountName: string
  period: string
  periodLabel: string
  generatedAt: string
  invoiceRef: string
  totalSpend: number
  totalOrders: number
  totalLineItems: number
  activeSitesCount: number
  siteBreakdowns: HOSpendBysite[]
  lineItems: HOBillingLineItem[]
  categoryBreakdown: { category: string; spend: number; percentage: number }[]
}

// ─── Site User / Shop Module Types ──────────────────────────────────────────

export type AccountOrderRules = {
  accountId: string
  accountName: string
  requirePoNumber: boolean
  poPrefix?: string
  /**
   * Order total above which an order needs approval (Account.approvalThreshold).
   * Not a spend cap — the per-user ceiling is PortalUser.monthlyBudgetCap.
   */
  approvalThreshold?: number
  requireDeliveryNotes?: boolean
  defaultCarrier?: string
}

export type EffectiveProduct = Product & {
  effectivePrice: number
  discountPct: number
  rateCardName?: string
  isCustomPriced: boolean
}

export type OrderDeliveryDetails = {
  billToAddress: Address
  shipToAddress: Address
  deliveryContactName: string
  deliveryContactPhone?: string
  deliveryInstructions?: string
  isCustomShippingAddress?: boolean
}

// ─── Enterprise Integrations & Webhooks ─────────────────────────────────────

export type TargetIntegrationSystem =
  'PRINT_PRODUCTION' | 'WAREHOUSE_3PL' | 'ERP_FINANCE'

export type IntegrationWebhook = {
  id: string
  name: string
  targetSystem: TargetIntegrationSystem
  url: string
  events: string[]
  status: 'ACTIVE' | 'PAUSED'
  secretKey: string
  lastTriggeredAt?: string
  successRatePct: number
  totalCalls: number
}

export type WebhookDeliveryLog = {
  id: string
  webhookId: string
  webhookName: string
  targetSystem: TargetIntegrationSystem
  event: string
  status: 'SUCCESS' | 'FAILED' | 'RETRYING'
  httpCode: number
  payloadSummary: string
  timestamp: string
  responseTimeMs: number
}
