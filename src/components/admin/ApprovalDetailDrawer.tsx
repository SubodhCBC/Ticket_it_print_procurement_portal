// src/components/admin/ApprovalDetailDrawer.tsx
'use client'

import { Drawer } from '@/components/ui/Drawer'
import type {
  ApprovalDecision,
  ApprovalRequestView,
} from '@/services/data-source/api/approval.types'
import { ApprovalRequestDetail } from './ApprovalRequestDetail'

/**
 * The queue's slide-over for one request.
 *
 * The detail is keyed on the request, so opening a different row starts with a
 * clean comment box and no leftover notice from the last one.
 */
export function ApprovalDetailDrawer({
  request,
  isOpen,
  onClose,
  canAct,
  onDecided,
}: {
  request: ApprovalRequestView | null
  isOpen: boolean
  onClose: () => void
  canAct: boolean
  onDecided?: (updated: ApprovalRequestView, decision: ApprovalDecision) => void
}) {
  return (
    <Drawer
      isOpen={isOpen}
      onClose={onClose}
      width="560px"
      title={request ? `Approval · ${request.orderNumber}` : 'Approval'}
    >
      {request && (
        <ApprovalRequestDetail
          key={request.id}
          request={request}
          canAct={canAct}
          onDecided={onDecided}
        />
      )}
    </Drawer>
  )
}
