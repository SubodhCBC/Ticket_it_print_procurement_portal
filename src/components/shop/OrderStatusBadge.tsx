// src/components/shop/OrderStatusBadge.tsx
'use client'

import React from 'react'
import { OrderStatus } from '@/types'
import {
  Clock,
  RefreshCw,
  Truck,
  CheckCircle2,
  AlertCircle,
  FileText,
  HelpCircle,
} from 'lucide-react'

interface OrderStatusBadgeProps {
  status: OrderStatus
  size?: 'sm' | 'md' | 'lg'
  showIcon?: boolean
}

/**
 * The order's fulfilment status, as a chip.
 *
 * The nine values are the server's lifecycle (`src/server/orders/order-status.ts`)
 * and nothing else. `PAID` was here once and should not have been: payment is a
 * separate axis, and on Net 30 terms an order is routinely delivered a month
 * before it is paid — showing it as a fulfilment badge told the buyer one axis
 * while the other was the one that had moved. `ORDER_PLACED`, `IN_PRODUCTION`
 * and `RECEIVED` were fixture-era display states the API never sends.
 *
 * The in-production icons used to spin. A badge that moves reads as something
 * happening on the page right now, which a status held for days is not.
 */
export function OrderStatusBadge({
  status,
  size = 'md',
  showIcon = true,
}: OrderStatusBadgeProps) {
  const iconSize = size === 'lg' ? 13 : 12

  const configs: Record<
    OrderStatus,
    {
      label: string
      bg: string
      text: string
      border: string
      icon: React.ReactNode
    }
  > = {
    DRAFT: {
      label: 'Draft PO',
      bg: 'rgba(100, 116, 139, 0.08)',
      text: '#6E6781',
      border: 'rgba(100, 116, 139, 0.25)',
      icon: <FileText size={iconSize} color="#6E6781" />,
    },
    PENDING_APPROVAL: {
      label: 'Pending Approval',
      bg: 'rgba(245, 158, 11, 0.12)',
      text: '#b45309',
      border: 'rgba(245, 158, 11, 0.35)',
      icon: <Clock size={iconSize} color="#b45309" />,
    },
    CHANGES_REQUESTED: {
      label: 'Changes Requested',
      bg: 'rgba(234, 88, 12, 0.12)',
      text: '#c2410c',
      border: 'rgba(234, 88, 12, 0.35)',
      icon: <AlertCircle size={iconSize} color="#c2410c" />,
    },
    APPROVED: {
      label: 'Approved',
      bg: 'rgba(16, 185, 129, 0.12)',
      text: '#047857',
      border: 'rgba(16, 185, 129, 0.35)',
      icon: <CheckCircle2 size={iconSize} color="#047857" />,
    },
    REJECTED: {
      label: 'Rejected',
      bg: 'rgba(239, 68, 68, 0.12)',
      text: '#b91c1c',
      border: 'rgba(239, 68, 68, 0.35)',
      icon: <Clock size={iconSize} color="#b91c1c" />,
    },
    CANCELLED: {
      label: 'Cancelled',
      bg: 'rgba(100, 116, 139, 0.12)',
      text: '#5C566E',
      border: 'rgba(100, 116, 139, 0.3)',
      icon: <Clock size={iconSize} color="#5C566E" />,
    },
    PROCESSING: {
      label: 'In Fulfilment',
      bg: 'rgba(245, 158, 11, 0.08)',
      text: '#d97706',
      border: 'rgba(245, 158, 11, 0.25)',
      icon: <RefreshCw size={iconSize} color="#d97706" />,
    },
    DISPATCHED: {
      label: 'Dispatched & In Transit',
      bg: 'rgba(168, 85, 247, 0.08)',
      text: '#7c3aed',
      border: 'rgba(168, 85, 247, 0.25)',
      icon: <Truck size={iconSize} color="#7c3aed" />,
    },
    DELIVERED: {
      label: 'Delivered to branch',
      bg: 'rgba(88, 185, 125, 0.08)',
      text: '#16a34a',
      border: 'rgba(88, 185, 125, 0.25)',
      icon: <CheckCircle2 size={iconSize} color="#16a34a" />,
    },
  }

  // A status the API grew and this build has not learned yet. Neutral on
  // purpose: the old fallback was RECEIVED, so anything unrecognised — a
  // rejection, a cancellation — was announced to the buyer as a live order.
  const current = configs[status] ?? {
    label: 'Unknown',
    bg: 'rgba(100, 116, 139, 0.08)',
    text: '#6E6781',
    border: 'rgba(100, 116, 139, 0.25)',
    icon: <HelpCircle size={iconSize} color="#6E6781" />,
  }

  const sizeStyles = {
    sm: { fontSize: '0.7rem', padding: '2px 8px', gap: '4px' },
    md: { fontSize: '0.74rem', padding: '3px 9px', gap: '5px' },
    lg: { fontSize: '0.8rem', padding: '4px 11px', gap: '6px' },
  }[size]

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        borderRadius: '9999px',
        backgroundColor: current.bg,
        color: current.text,
        border: `1px solid ${current.border}`,
        fontWeight: 600,
        lineHeight: 1.2,
        whiteSpace: 'nowrap',
        ...sizeStyles,
      }}
    >
      {showIcon && current.icon}
      <span>{current.label}</span>
    </span>
  )
}
