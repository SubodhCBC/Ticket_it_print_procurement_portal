export interface MarketingAsset {
  id: string
  sku: string
  title: string
  category:
    | 'Point of Sale'
    | 'Digital & Signage'
    | 'Apparel & Uniforms'
    | 'Print Collateral'
    | 'Branded Merch'
  description: string
  specifications: string
  unitCost: number
  packQuantity: number
  leadTimeDays: number
  dimensions: string
  thumbnail: string
  tags: string[]
  isAvailable: boolean
  approvalStatus: 'Approved' | 'Under Review' | 'Seasonal'
  brandGuidelinesUrl?: string
  stockRemaining: number
}

export interface SiteOrder {
  id: string
  orderNumber: string
  poNumber: string
  siteCode: string
  siteName: string
  orderedBy: string
  orderedByEmail: string
  createdAt: string
  status:
    'Pending Dispatch' | 'In Production' | 'Dispatched' | 'Delivered' | 'Billed'
  items: {
    assetId: string
    sku: string
    title: string
    quantity: number
    unitPrice: number
    totalPrice: number
    thumbnail: string
  }[]
  subtotal: number
  deliveryFee: number
  totalValue: number
  deliveryAddress: string
  recipientContact: string
  billingPeriod: string // e.g. "August 2026"
  notes?: string
}

export interface MonthlyBillingSummary {
  period: string
  invoiceNumber: string
  issueDate: string
  dueDate: string
  totalSitesActive: number
  totalOrders: number
  totalItemsDispatched: number
  totalAmount: number
  status: 'Current Unbilled' | 'Consolidated & Invoiced' | 'Settled'
  siteBreakdowns: {
    siteCode: string
    siteName: string
    orderCount: number
    totalSpend: number
    primaryCategory: string
    poCount: number
  }[]
}

export interface AuditLogEntry {
  id: string
  timestamp: string
  actorName: string
  actorRole: string
  actorEmail: string
  action:
    | 'ORDER_PLACED'
    | 'ASSET_MODIFIED'
    | 'BILLING_EXPORTED'
    | 'SITE_ACCESS_GRANTED'
    | 'CATALOG_UPDATED'
    | 'PO_APPROVED'
  targetResource: string
  details: string
  siteCode?: string
  valueAmount?: number
  ipAddress: string
}

export const MARKETING_ASSETS: MarketingAsset[] = [
  {
    id: 'asset_01',
    sku: 'POS-STD-088',
    title: 'Ultra-HD Curved Floor Standee Banner (Spring Campaign)',
    category: 'Point of Sale',
    description:
      'Freestanding 2000mm tension fabric curved display banner with certified brand color reproduction for retail floor entrances.',
    specifications:
      '2000mm x 850mm • 260gsm Fire-rated Polyester Fabric • Aluminum Snap-lock base',
    unitCost: 145.0,
    packQuantity: 1,
    leadTimeDays: 3,
    dimensions: '2000 x 850 x 300 mm',
    thumbnail:
      'https://images.unsplash.com/photo-1542744094-3a31f272c490?w=600&auto=format&fit=crop&q=80',
    tags: ['Entrance', 'Spring 2026', 'Tension Fabric', 'Bestseller'],
    isAvailable: true,
    approvalStatus: 'Approved',
    stockRemaining: 48,
  },
  {
    id: 'asset_02',
    sku: 'POS-HLT-012',
    title: 'Acrylic Countertop Brand Display & QR Shelf Talkers (Pack of 20)',
    category: 'Point of Sale',
    description:
      'Diamond-polished clear acrylic countertop stands with interchangeable magnetic QR graphic inserts for checkout desks.',
    specifications:
      'Pack of 20 Units • 3mm Optical Cast Acrylic • A5 Portrait Format',
    unitCost: 89.5,
    packQuantity: 20,
    leadTimeDays: 2,
    dimensions: '148 x 210 x 60 mm',
    thumbnail:
      'https://images.unsplash.com/photo-1586023492125-27b2c045efd7?w=600&auto=format&fit=crop&q=80',
    tags: ['Countertop', 'Point of Sale', 'QR Enabled', 'Pack Item'],
    isAvailable: true,
    approvalStatus: 'Approved',
    stockRemaining: 120,
  },
  {
    id: 'asset_03',
    sku: 'DIG-VID-4K',
    title: '4K Ultra-Motion In-Store Digital Video Asset Bundle (Q3/Q4)',
    category: 'Digital & Signage',
    description:
      'High-bitrate dynamic digital signage loops tailored for 16:9 vertical pillar screens and widescreen horizontal wall displays.',
    specifications:
      '3840x2160 60fps ProRes / H.265 • 15s / 30s Loop Versions • USB & CMS Push',
    unitCost: 0.0,
    packQuantity: 1,
    leadTimeDays: 0,
    dimensions: 'Digital Asset • 4.8 GB Master',
    thumbnail:
      'https://images.unsplash.com/photo-1460925895917-afdab827c52f?w=600&auto=format&fit=crop&q=80',
    tags: ['Digital Signage', 'Instant Download', '4K Video', 'Zero Cost'],
    isAvailable: true,
    approvalStatus: 'Approved',
    stockRemaining: 9999,
  },
  {
    id: 'asset_04',
    sku: 'APP-STF-050',
    title: 'Executive Store Staff Uniform & Embroidered Apron Set (Pack of 10)',
    category: 'Apparel & Uniforms',
    description:
      'Heavyweight organic cotton blend retail staff uniforms with precision laser-embroidered brand chest logo and brass hardware.',
    specifications:
      'Pack of 10 Units • 65% Recycled Cotton / 35% Poly • Stain & Water Repellent',
    unitCost: 220.0,
    packQuantity: 10,
    leadTimeDays: 5,
    dimensions: 'Mixed Sizes (S, M, L, XL)',
    thumbnail:
      'https://images.unsplash.com/photo-1489987707025-afc232f7ea0f?w=600&auto=format&fit=crop&q=80',
    tags: ['Uniforms', 'Store Staff', 'Embroidered', 'Pack of 10'],
    isAvailable: true,
    approvalStatus: 'Approved',
    stockRemaining: 65,
  },
  {
    id: 'asset_05',
    sku: 'PRN-CAT-500',
    title: 'Luxury Seasonal Lookbook & Product Catalogues (Box of 250)',
    category: 'Print Collateral',
    description:
      'Foil-stamped soft-touch velvet laminated lookbooks featuring certified carbon-neutral paper stock and lay-flat pur binding.',
    specifications:
      'Box of 250 Copies • 350gsm Silk Cover / 170gsm Inner • Gold Hot Foil Accent',
    unitCost: 340.0,
    packQuantity: 250,
    leadTimeDays: 4,
    dimensions: '210 x 280 mm • 48 Pages',
    thumbnail:
      'https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?w=600&auto=format&fit=crop&q=80',
    tags: ['Lookbook', 'Print', 'Gold Foil', 'High Volume'],
    isAvailable: true,
    approvalStatus: 'Approved',
    stockRemaining: 84,
  },
  {
    id: 'asset_06',
    sku: 'MRC-VIP-025',
    title:
      'VIP Client Welcome Gifting Box with Laser-Engraved Thermos (Kit of 25)',
    category: 'Branded Merch',
    description:
      'Matte black magnetic closure presentation boxes with matte copper double-wall vacuum insulated bottles and notebook kit.',
    specifications:
      'Kit of 25 Gift Sets • Laser-engraved Stainless Steel • Certified FSC Paper Notebook',
    unitCost: 480.0,
    packQuantity: 25,
    leadTimeDays: 4,
    dimensions: '280 x 220 x 95 mm Gift Box',
    thumbnail:
      'https://images.unsplash.com/photo-1513151233558-d860c5398176?w=600&auto=format&fit=crop&q=80',
    tags: ['VIP Gift', 'Merchandise', 'Client Delight', 'Luxury Box'],
    isAvailable: true,
    approvalStatus: 'Approved',
    stockRemaining: 32,
  },
  {
    id: 'asset_07',
    sku: 'POS-WIN-099',
    title: 'Double-Sided Window Static Cling Decal Package (Storefront)',
    category: 'Point of Sale',
    description:
      'Zero-residue static vinyl window graphics with UV-resistant inks engineered for quick application and bubble-free removal.',
    specifications:
      'Set of 6 Decals • 800 x 1200mm each • 150 Micron Static Cling Film',
    unitCost: 115.0,
    packQuantity: 6,
    leadTimeDays: 2,
    dimensions: '800 x 1200 mm',
    thumbnail:
      'https://images.unsplash.com/photo-1513519245088-0e12902e5a38?w=600&auto=format&fit=crop&q=80',
    tags: ['Window Display', 'Exterior', 'UV Proof', 'Reusable'],
    isAvailable: true,
    approvalStatus: 'Approved',
    stockRemaining: 70,
  },
  {
    id: 'asset_08',
    sku: 'PRN-FLY-1000',
    title: 'Promotional Direct Mail Vouchers & Door Drop Leaflets (1,000 Pack)',
    category: 'Print Collateral',
    description:
      'High-impact tactile promotional vouchers with unique scratch-off activation codes and perforation.',
    specifications:
      'Pack of 1,000 Leaflets • 250gsm Silk Artboard • Spot Gloss UV Coating',
    unitCost: 195.0,
    packQuantity: 1000,
    leadTimeDays: 3,
    dimensions: 'DL Format (99 x 210 mm)',
    thumbnail:
      'https://images.unsplash.com/photo-1507679799987-c73779587ccf?w=600&auto=format&fit=crop&q=80',
    tags: ['Direct Mail', 'Vouchers', 'Promo Flyers', 'High Impact'],
    isAvailable: true,
    approvalStatus: 'Approved',
    stockRemaining: 150,
  },
]

export const MOCK_ORDERS: SiteOrder[] = [
  {
    id: 'ord_901',
    orderNumber: 'ORD-2026-8819',
    poNumber: 'PO-APX104-9421',
    siteCode: 'APEX-NYC-104',
    siteName: 'Downtown Flagship #104 (5th Ave, NY)',
    orderedBy: 'Marcus Vance',
    orderedByEmail: 'marcus.vance@apexretail.com',
    createdAt: '2026-08-18T14:22:00Z',
    status: 'In Production',
    items: [
      {
        assetId: 'asset_01',
        sku: 'POS-STD-088',
        title: 'Ultra-HD Curved Floor Standee Banner (Spring Campaign)',
        quantity: 2,
        unitPrice: 145.0,
        totalPrice: 290.0,
        thumbnail:
          'https://images.unsplash.com/photo-1542744094-3a31f272c490?w=600&auto=format&fit=crop&q=80',
      },
      {
        assetId: 'asset_05',
        sku: 'PRN-CAT-500',
        title: 'Luxury Seasonal Lookbook & Product Catalogues (Box of 250)',
        quantity: 1,
        unitPrice: 340.0,
        totalPrice: 340.0,
        thumbnail:
          'https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?w=600&auto=format&fit=crop&q=80',
      },
    ],
    subtotal: 630.0,
    deliveryFee: 0.0,
    totalValue: 630.0,
    deliveryAddress: '740 5th Avenue, Suite 104, New York, NY 10019',
    recipientContact: 'Marcus Vance (+1 212-555-0199)',
    billingPeriod: 'August 2026',
    notes: 'Please expedite for upcoming Friday flagship product relaunch.',
  },
  {
    id: 'ord_902',
    orderNumber: 'ORD-2026-8812',
    poNumber: 'PO-APX104-9380',
    siteCode: 'APEX-NYC-104',
    siteName: 'Downtown Flagship #104 (5th Ave, NY)',
    orderedBy: 'Marcus Vance',
    orderedByEmail: 'marcus.vance@apexretail.com',
    createdAt: '2026-08-10T09:15:00Z',
    status: 'Delivered',
    items: [
      {
        assetId: 'asset_02',
        sku: 'POS-HLT-012',
        title:
          'Acrylic Countertop Brand Display & QR Shelf Talkers (Pack of 20)',
        quantity: 1,
        unitPrice: 89.5,
        totalPrice: 89.5,
        thumbnail:
          'https://images.unsplash.com/photo-1586023492125-27b2c045efd7?w=600&auto=format&fit=crop&q=80',
      },
      {
        assetId: 'asset_04',
        sku: 'APP-STF-050',
        title:
          'Executive Store Staff Uniform & Embroidered Apron Set (Pack of 10)',
        quantity: 2,
        unitPrice: 220.0,
        totalPrice: 440.0,
        thumbnail:
          'https://images.unsplash.com/photo-1489987707025-afc232f7ea0f?w=600&auto=format&fit=crop&q=80',
      },
    ],
    subtotal: 529.5,
    deliveryFee: 0.0,
    totalValue: 529.5,
    deliveryAddress: '740 5th Avenue, Suite 104, New York, NY 10019',
    recipientContact: 'Marcus Vance (+1 212-555-0199)',
    billingPeriod: 'August 2026',
  },
  {
    id: 'ord_903',
    orderNumber: 'ORD-2026-8790',
    poNumber: 'PO-CHI-0811',
    siteCode: 'APEX-CHI-022',
    siteName: 'Chicago Magnificent Mile #022',
    orderedBy: 'Sarah Jenkins',
    orderedByEmail: 'sarah.jenkins@apexretail.com',
    createdAt: '2026-08-16T11:45:00Z',
    status: 'Dispatched',
    items: [
      {
        assetId: 'asset_06',
        sku: 'MRC-VIP-025',
        title:
          'VIP Client Welcome Gifting Box with Laser-Engraved Thermos (Kit of 25)',
        quantity: 2,
        unitPrice: 480.0,
        totalPrice: 960.0,
        thumbnail:
          'https://images.unsplash.com/photo-1513151233558-d860c5398176?w=600&auto=format&fit=crop&q=80',
      },
    ],
    subtotal: 960.0,
    deliveryFee: 0.0,
    totalValue: 960.0,
    deliveryAddress: '830 N Michigan Ave, Chicago, IL 60611',
    recipientContact: 'Sarah Jenkins (+1 312-555-0144)',
    billingPeriod: 'August 2026',
  },
  {
    id: 'ord_904',
    orderNumber: 'ORD-2026-8742',
    poNumber: 'PO-LAX-0309',
    siteCode: 'APEX-LAX-008',
    siteName: 'Los Angeles Beverly Center #008',
    orderedBy: 'Tariq Al-Mansoor',
    orderedByEmail: 'tariq.m@apexretail.com',
    createdAt: '2026-08-14T16:10:00Z',
    status: 'Delivered',
    items: [
      {
        assetId: 'asset_07',
        sku: 'POS-WIN-099',
        title: 'Double-Sided Window Static Cling Decal Package (Storefront)',
        quantity: 3,
        unitPrice: 115.0,
        totalPrice: 345.0,
        thumbnail:
          'https://images.unsplash.com/photo-1513519245088-0e12902e5a38?w=600&auto=format&fit=crop&q=80',
      },
      {
        assetId: 'asset_08',
        sku: 'PRN-FLY-1000',
        title:
          'Promotional Direct Mail Vouchers & Door Drop Leaflets (1,000 Pack)',
        quantity: 4,
        unitPrice: 195.0,
        totalPrice: 780.0,
        thumbnail:
          'https://images.unsplash.com/photo-1507679799987-c73779587ccf?w=600&auto=format&fit=crop&q=80',
      },
    ],
    subtotal: 1125.0,
    deliveryFee: 0.0,
    totalValue: 1125.0,
    deliveryAddress: '8500 Beverly Blvd, Los Angeles, CA 90048',
    recipientContact: 'Tariq Al-Mansoor (+1 310-555-0178)',
    billingPeriod: 'August 2026',
  },
]

export const MONTHLY_BILLING_SUMMARY: MonthlyBillingSummary = {
  period: 'August 2026 (Month-to-Date)',
  invoiceNumber: 'INV-APEX-2026-08',
  issueDate: '2026-08-31',
  dueDate: '2026-09-30 (Net 30)',
  totalSitesActive: 34,
  totalOrders: 68,
  totalItemsDispatched: 412,
  totalAmount: 38450.0,
  status: 'Current Unbilled',
  siteBreakdowns: [
    {
      siteCode: 'APEX-NYC-104',
      siteName: 'Downtown Flagship #104 (New York)',
      orderCount: 6,
      totalSpend: 4280.0,
      primaryCategory: 'Point of Sale & Catalogues',
      poCount: 6,
    },
    {
      siteCode: 'APEX-LAX-008',
      siteName: 'Los Angeles Beverly Center #008',
      orderCount: 5,
      totalSpend: 3950.0,
      primaryCategory: 'Promotional Print & Window Decals',
      poCount: 5,
    },
    {
      siteCode: 'APEX-CHI-022',
      siteName: 'Chicago Magnificent Mile #022',
      orderCount: 4,
      totalSpend: 3120.0,
      primaryCategory: 'VIP Gifting & Merch',
      poCount: 4,
    },
    {
      siteCode: 'APEX-MIA-019',
      siteName: 'Miami Lincoln Road #019',
      orderCount: 5,
      totalSpend: 2840.0,
      primaryCategory: 'Storefront Static Clings',
      poCount: 5,
    },
    {
      siteCode: 'APEX-SFO-031',
      siteName: 'San Francisco Union Square #031',
      orderCount: 4,
      totalSpend: 2650.0,
      primaryCategory: 'Staff Uniforms & Aprons',
      poCount: 4,
    },
    {
      siteCode: 'APEX-DAL-015',
      siteName: 'Dallas NorthPark Center #015',
      orderCount: 3,
      totalSpend: 2100.0,
      primaryCategory: 'Floor Standees',
      poCount: 3,
    },
    {
      siteCode: 'APEX-BOS-011',
      siteName: 'Boston Newbury Street #011',
      orderCount: 4,
      totalSpend: 1980.0,
      primaryCategory: 'Lookbooks & Brochures',
      poCount: 4,
    },
    {
      siteCode: 'APEX-SEA-028',
      siteName: 'Seattle Westlake Center #028',
      orderCount: 3,
      totalSpend: 1850.0,
      primaryCategory: 'Countertop Acrylics',
      poCount: 3,
    },
  ],
}

export const MOCK_AUDIT_LOGS: AuditLogEntry[] = [
  {
    id: 'aud_001',
    timestamp: '2026-08-20T11:42:15Z',
    actorName: 'Marcus Vance',
    actorRole: 'Customer / Site User',
    actorEmail: 'marcus.vance@apexretail.com',
    action: 'ORDER_PLACED',
    targetResource: 'ORD-2026-8819 (PO-APX104-9421)',
    details:
      'Ordered 2x Curved Standees & 1x Box Lookbooks for Downtown Flagship #104 ($630.00 total)',
    siteCode: 'APEX-NYC-104',
    valueAmount: 630.0,
    ipAddress: '198.51.100.42 (Retail Terminal)',
  },
  {
    id: 'aud_002',
    timestamp: '2026-08-20T09:18:30Z',
    actorName: 'Elena Rostova',
    actorRole: 'Customer Head Office',
    actorEmail: 'elena.rostova@apexgroup.hq',
    action: 'BILLING_EXPORTED',
    targetResource: 'Consolidated Billing Report (INV-APEX-2026-08)',
    details:
      'Generated and downloaded transaction-level CSV backing report for 34 sites ($38,450.00 total)',
    siteCode: 'APEX-HQ-GLOBAL',
    valueAmount: 38450.0,
    ipAddress: '203.0.113.88 (Corporate VPN)',
  },
  {
    id: 'aud_003',
    timestamp: '2026-08-19T16:05:10Z',
    actorName: 'David Sterling',
    actorRole: 'Portal Administrator',
    actorEmail: 'david.sterling@yellowdelivery.io',
    action: 'CATALOG_UPDATED',
    targetResource: 'POS-STD-088 (Curved Standee)',
    details:
      'Approved Spring 2026 high-resolution artwork master and updated tier pricing schedule',
    siteCode: 'SYS-GLOBAL',
    valueAmount: 145.0,
    ipAddress: '192.0.2.14 (Admin Console)',
  },
  {
    id: 'aud_004',
    timestamp: '2026-08-18T14:20:00Z',
    actorName: 'Marcus Vance',
    actorRole: 'Customer / Site User',
    actorEmail: 'marcus.vance@apexretail.com',
    action: 'PO_APPROVED',
    targetResource: 'PO-APX104-9421',
    details:
      'Validated internal store PO number against monthly branch budget cap ($8,500 cap)',
    siteCode: 'APEX-NYC-104',
    valueAmount: 630.0,
    ipAddress: '198.51.100.42 (Retail Terminal)',
  },
  {
    id: 'aud_005',
    timestamp: '2026-08-17T10:30:22Z',
    actorName: 'David Sterling',
    actorRole: 'Portal Administrator',
    actorEmail: 'david.sterling@yellowdelivery.io',
    action: 'SITE_ACCESS_GRANTED',
    targetResource: 'APEX-SEA-028 (Seattle Westlake)',
    details:
      'Configured new site branch profile, allocated PO prefix PO-SEA-028 and assigned store manager access',
    siteCode: 'APEX-SEA-028',
    ipAddress: '192.0.2.14 (Admin Console)',
  },
]
