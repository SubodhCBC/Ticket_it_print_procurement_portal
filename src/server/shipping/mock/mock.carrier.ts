import { randomBytes } from 'node:crypto'
import PDFDocument from 'pdfkit'
import type {
  AddressSuggestion,
  Carrier,
  CollectionPoint,
  LabelStatus,
  RateOption,
  TrackingEventData,
  TrackingResult,
  ValidatedAddress,
} from '../carrier.types'
import { NzPostApiError } from '../nzpost/nzpost.errors'

/**
 * A stand-in for NZ Post, for `NZPOST_MODE=mock`.
 *
 * ---------------------------------------------------------------------------
 * Stateless on purpose
 * ---------------------------------------------------------------------------
 * The web server and the worker are separate processes, so nothing here keeps
 * state in memory. What a later call needs is carried in the identifiers: a mock
 * consignment id encodes how many parcels it has and when it was made, and a
 * tracking reference encodes its consignment. Tracking then "happens" on a
 * clock — picked up after one minute, delivered after four — so the whole flow,
 * including the order moving to DELIVERED, can be watched in a few minutes.
 *
 * Addresses and collection points are NZ Post's own spec examples plus a rural
 * one, so a rural surcharge can be seen.
 *
 * Every label says MOCK in large letters. It must never be mistaken for a
 * shipping label.
 */

const ADDRESSES: readonly ValidatedAddress[] = [
  fixture(
    '325595',
    '1344299',
    '151',
    'Victoria Avenue',
    'Remuera',
    'Auckland',
    '1050'
  ),
  fixture(
    '1945196',
    '2986570',
    '151',
    'Victoria Street West',
    'Auckland Central',
    'Auckland',
    '1010'
  ),
  fixture(
    '9000001',
    '2113001',
    '42C',
    'Tawa Drive',
    'Albany',
    'Auckland',
    '0632'
  ),
  fixture(
    '9000002',
    '54218',
    '71',
    'Oregon Street',
    'Ocean Grove',
    'Dunedin',
    '9013'
  ),
  fixture(
    '9000003',
    '99061',
    '62',
    'Wilson Street',
    'Whanganui',
    'Whanganui',
    '4500'
  ),
  fixture(
    '9000004',
    '3120044',
    '1203',
    'Kaipara Coast Highway',
    'Kaukapakapa',
    'Auckland',
    '0873',
    true
  ),
  fixture(
    '9000005',
    '150971',
    '88',
    'Taupo Quay',
    'Whanganui',
    'Whanganui',
    '4500'
  ),
  fixture(
    '9000006',
    '99054',
    '5',
    'Strathallan Street',
    'South Dunedin',
    'Dunedin',
    '9012'
  ),
]

const COLLECTION_POINTS: readonly CollectionPoint[] = [
  point(
    '99054',
    'Dunedin CourierPost Depot',
    '5 Strathallan Street',
    'South Dunedin',
    'Dunedin',
    '9012',
    '0800 268 7437',
    null
  ),
  point(
    '99061',
    'Wanganui CourierPost Depot',
    '62 Wilson Street',
    'Wanganui',
    'Wanganui',
    '4500',
    '0800 268 7437',
    null
  ),
  point(
    '150971',
    'Countdown Wanganui',
    '88-98 Taupo Quay',
    'Whanganui',
    'Whanganui',
    '4500',
    '06 349 0199',
    'Countdown'
  ),
  point(
    '58040',
    'NZ Post Shop Beachlands',
    '38 Wakelin Road',
    'Beachlands',
    'Auckland',
    '2018',
    '09 536 6118',
    null
  ),
]

/** Minutes after a label is made at which each mock scan appears. */
const MOCK_SCANS: ReadonlyArray<{
  minutes: number
  status: string
  description: string
}> = [
  {
    minutes: 1,
    status: 'Picked up',
    description: 'Picked up by courier from the sender (mock).',
  },
  {
    minutes: 2,
    status: 'In transit',
    description: 'In transit to the delivery depot (mock).',
  },
  {
    minutes: 3,
    status: 'Out for delivery',
    description: 'With the courier for delivery (mock).',
  },
  { minutes: 4, status: 'Delivered', description: 'Delivered (mock).' },
]

const CONSIGNMENT_PATTERN = /^MK([0-9A-K])([0-9A-Z]{8})([0-9A-Z]{2})$/
const TRACKING_PATTERN = /^(MK[0-9A-K][0-9A-Z]{8}[0-9A-Z]{2})(\d{2})NZ$/

export const mockCarrier: Carrier = {
  kind: 'mock',

  async searchAddresses(query, count) {
    const tokens = query
      .toLowerCase()
      .split(/[\s,]+/)
      .filter(Boolean)
    return ADDRESSES.filter((address) =>
      tokens.every((token) => address.fullAddress.toLowerCase().includes(token))
    )
      .slice(0, count)
      .map((address): AddressSuggestion => ({
        addressId: address.addressId,
        dpid: address.dpid,
        fullAddress: address.fullAddress,
      }))
  },

  async getAddress(addressId) {
    const address = ADDRESSES.find((row) => row.addressId === addressId)
    if (!address) throw notFound('ParcelAddress details')
    return address
  },

  async quoteDomestic(query) {
    const address = ADDRESSES.find(
      (row) => row.addressId === query.deliveryAddressId
    )
    if (!address) throw notFound('ShippingOptions domestic')

    const rural = address.isRural
    const kg = Math.max(0.1, query.weightKg)
    return [
      rate('CPOLE', 'CP Online Economy (mock)', 7.9 + kg * 1.1, rural, false),
      rate('CPOLP', 'CP Online Parcel (mock)', 11.5 + kg * 1.7, rural, false),
      rate(
        'CPOLTPDL',
        'CP Online Overnight (mock)',
        16.2 + kg * 2.2,
        rural,
        true
      ),
    ]
  },

  async collectionPoints(addressId, count) {
    if (!ADDRESSES.some((row) => row.addressId === addressId)) {
      throw notFound('Collection Address')
    }
    return COLLECTION_POINTS.slice(0, Math.max(1, count))
  },

  async submitLabel(payload) {
    const parcels = Array.isArray(payload.parcel_details)
      ? payload.parcel_details.length
      : 1
    const countDigit = Math.min(Math.max(parcels, 1), 20)
      .toString(36)
      .toUpperCase()
    const time = Date.now()
      .toString(36)
      .toUpperCase()
      .padStart(8, '0')
      .slice(-8)
    const suffix = randomBytes(2).toString('hex').toUpperCase().slice(0, 2)
    return {
      consignmentId: `MK${countDigit}${time}${suffix}`,
      messageId: `mock-${randomBytes(8).toString('hex')}`,
    }
  },

  async labelStatus(consignmentId) {
    const parsed = parseConsignment(consignmentId)
    if (!parsed) throw notFound('ParcelLabel status')

    return {
      consignmentId,
      status: 'Complete',
      complete: true,
      failed: false,
      // NZ Post's example gives a label about two weeks; the mock follows.
      expiresAt: new Date(parsed.createdAt + 14 * 24 * 60 * 60 * 1000),
      labels: Array.from({ length: parsed.parcels }, (_, index) => ({
        labelId: `${consignmentId}-${index + 1}`,
        trackingReference: trackingReferenceFor(consignmentId, index + 1),
        status: 'Complete',
        errors: [],
      })),
      errors: [],
    } satisfies LabelStatus
  },

  async downloadLabel(consignmentId) {
    const parsed = parseConsignment(consignmentId)
    if (!parsed) throw notFound('ParcelLabel download')
    return renderMockLabel(consignmentId, parsed.parcels)
  },

  async bookPickup() {
    return {
      jobId: String(30_000_000 + Math.floor(Math.random() * 9_000_000)),
      jobNumber: String(19_000_000 + Math.floor(Math.random() * 900_000)),
      responseType: 'AP',
      rejectCode: '0',
      messageId: `mock-${randomBytes(8).toString('hex')}`,
    }
  },

  async track(trackingReferences) {
    const now = Date.now()
    return trackingReferences.map((reference): TrackingResult => {
      const match = TRACKING_PATTERN.exec(reference)
      const parsed = match?.[1] ? parseConsignment(match[1]) : null
      if (!parsed) {
        return {
          trackingReference: reference,
          events: [],
          error: 'No such ticket number was found (mock)',
        }
      }

      const events: TrackingEventData[] = MOCK_SCANS.filter(
        (scan) => parsed.createdAt + scan.minutes * 60_000 <= now
      ).map((scan, index) => ({
        occurredAt: new Date(parsed.createdAt + scan.minutes * 60_000),
        status: scan.status,
        description: scan.description,
        edifactCode: null,
        depotName: 'Mock Depot',
        signedByName: scan.status === 'Delivered' ? 'Mock Recipient' : null,
        seqRef: `${reference}-${index + 1}`,
      }))

      return { trackingReference: reference, events, error: null }
    })
  },
}

// --- Internals ----------------------------------------------------------------

function fixture(
  addressId: string,
  dpid: string,
  streetNumber: string,
  street: string,
  suburb: string,
  city: string,
  postcode: string,
  isRural = false
): ValidatedAddress {
  return {
    addressId,
    dpid,
    streetNumber,
    street,
    suburb,
    city,
    postcode,
    countryCode: 'NZ',
    isRural,
    latitude: null,
    longitude: null,
    fullAddress: `${streetNumber} ${street}, ${suburb}, ${city} ${postcode}`,
  }
}

function point(
  id: string,
  name: string,
  addressLine1: string,
  suburb: string,
  city: string,
  postcode: string,
  phone: string,
  partner: string | null
): CollectionPoint {
  return {
    id,
    name,
    fullAddress: `${addressLine1}, ${suburb}, ${city} ${postcode}`,
    addressLine1,
    suburb,
    city,
    postcode,
    phone,
    partner,
    distanceMetres: 1_500 + (Number(id) % 4_000),
    latitude: null,
    longitude: null,
    hours: [0, 1, 2, 3, 4].map((day) => ({
      day,
      open: '08:30',
      close: '17:30',
    })),
  }
}

function rate(
  serviceCode: string,
  description: string,
  priceExcl: number,
  rural: boolean,
  signatureIncluded: boolean
): RateOption {
  const round = (value: number) => (Math.round(value * 100) / 100).toFixed(2)
  const withGst = (value: number) => value * 1.15
  const addonExcl = rural ? 4 : 0
  return {
    carrier: 'CourierPost',
    serviceCode,
    description,
    priceExclGst: round(priceExcl),
    priceInclGst: round(withGst(priceExcl)),
    mandatoryAddons: rural
      ? [
          {
            code: 'CPOLRD',
            description: 'CP Online Rural Delivery (mock)',
            priceExclGst: round(addonExcl),
            priceInclGst: round(withGst(addonExcl)),
          },
        ]
      : [],
    totalExclGst: round(priceExcl + addonExcl),
    totalInclGst: round(withGst(priceExcl + addonExcl)),
    trackingIncluded: true,
    signatureIncluded,
  }
}

function parseConsignment(
  consignmentId: string
): { parcels: number; createdAt: number } | null {
  const match = CONSIGNMENT_PATTERN.exec(consignmentId)
  if (!match?.[1] || !match[2]) return null
  const parcels = parseInt(match[1], 36)
  const createdAt = parseInt(match[2], 36)
  return Number.isFinite(parcels) && Number.isFinite(createdAt)
    ? { parcels: Math.max(1, parcels), createdAt }
    : null
}

function trackingReferenceFor(consignmentId: string, sequence: number): string {
  return `${consignmentId}${String(sequence).padStart(2, '0')}NZ`
}

function notFound(operation: string): NzPostApiError {
  return new NzPostApiError(
    404,
    [
      {
        code: '404',
        message: 'Resource not found',
        details:
          'Not one of the mock fixtures. Mock mode only knows its own sample data.',
      },
    ],
    null,
    operation
  )
}

/** One 174 x 100 mm page per parcel, the size NZ Post's example label uses. */
function renderMockLabel(
  consignmentId: string,
  parcels: number
): Promise<Buffer> {
  const doc = new PDFDocument({ size: [493, 283], margin: 18 })
  const chunks: Buffer[] = []
  const finished = new Promise<Buffer>((resolve, reject) => {
    doc.on('data', (chunk: Buffer) => chunks.push(chunk))
    doc.on('end', () => resolve(Buffer.concat(chunks)))
    doc.on('error', reject)
  })

  for (let index = 1; index <= parcels; index += 1) {
    if (index > 1) doc.addPage({ size: [493, 283], margin: 18 })
    doc
      .fontSize(34)
      .fillColor('#b00020')
      .text('MOCK LABEL', { align: 'center' })
    doc
      .fontSize(11)
      .fillColor('#b00020')
      .text('NOT A SHIPPING LABEL — DO NOT ATTACH TO A PARCEL', {
        align: 'center',
      })
    doc.moveDown(1.2).fillColor('#000000').fontSize(14)
    doc.text(`Consignment ${consignmentId}`)
    doc.text(`Parcel ${index} of ${parcels}`)
    doc.text(`Tracking ${trackingReferenceFor(consignmentId, index)}`)
    doc.moveDown(0.6).fontSize(9).fillColor('#555555')
    doc.text(
      'Generated by the portal in NZPOST_MODE=mock. No request was sent to NZ Post.'
    )
  }

  doc.end()
  return finished
}
