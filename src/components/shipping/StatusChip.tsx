// src/components/shipping/StatusChip.tsx
import type { ApiShipmentStatus } from '@/services/data-source/api/shipping.types'
import { SHIPMENT_STATUS } from './shipping-format'

/** A shipment's status as a small pill, worded the same everywhere it appears. */
export function StatusChip({ status }: { status: ApiShipmentStatus }) {
  const look = SHIPMENT_STATUS[status] ?? SHIPMENT_STATUS.PENDING
  return (
    <span
      style={{
        display: 'inline-block',
        fontSize: '0.7rem',
        fontWeight: 600,
        color: look.color,
        backgroundColor: look.background,
        padding: '2px 8px',
        borderRadius: '9999px',
        whiteSpace: 'nowrap',
      }}
    >
      {look.label}
    </span>
  )
}
