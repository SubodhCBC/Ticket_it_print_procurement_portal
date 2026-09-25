'use client'

import React from 'react'
import {
  useDeactivateAccount,
  useDeactivateManagedUser,
  useDeactivateSite,
} from '@/hooks/useAccounts'
import type { Account, PortalUser } from '@/types'
import type { SiteRecord } from '@/types/customers-admin'
import { ConfirmActionModal, ErrorNote } from './CustomerAdminUi'
import { palette, useRetained } from './customerAdmin.shared'

const noteStyle: React.CSSProperties = {
  margin: 0,
  color: palette.secondary,
  fontSize: '0.8rem',
}

/** DELETE /accounts/:id, confirmed. Soft, and deliberately not cascaded. */
export function AccountDeactivateModal({
  account,
  currentAccountId,
  onDeactivated,
  onClose,
}: {
  account: Account | null
  /** The signed-in user's own account, to warn before cutting it off. */
  currentAccountId?: string
  /** After a successful deactivation only; `onClose` also runs on cancel. */
  onDeactivated?: (account: Account) => void
  onClose: () => void
}) {
  const shown = useRetained(account)
  const deactivate = useDeactivateAccount()

  const close = () => {
    deactivate.reset()
    onClose()
  }

  const confirm = async () => {
    if (!shown) return
    try {
      await deactivate.mutateAsync(shown.id)
      onDeactivated?.(shown)
      close()
    } catch {
      // Rendered in the dialog from `deactivate.error`.
    }
  }

  return (
    <ConfirmActionModal
      isOpen={account !== null}
      title="Deactivate account"
      confirmLabel="Deactivate account"
      pendingLabel="Deactivating…"
      isPending={deactivate.isPending}
      error={deactivate.error}
      onConfirm={() => void confirm()}
      onClose={close}
    >
      {shown && (
        <>
          <p style={{ margin: 0 }}>
            Deactivate <strong>{shown.name}</strong>{' '}
            <span style={{ fontFamily: 'monospace', color: palette.secondary }}>
              ({shown.accountCode})
            </span>
            ?
          </p>
          <p style={noteStyle}>
            The account is marked inactive and removed from listings. Orders,
            invoices and audit history are kept.
          </p>
          <p style={noteStyle}>
            Its users and its {shown.sitesCount ?? 0} branch
            {shown.sitesCount === 1 ? '' : 'es'} are <strong>not</strong>{' '}
            deactivated with it — nothing is cascaded. Deactivate them
            separately if they should lose access.
          </p>
          {shown.id === currentAccountId && (
            <ErrorNote message="This is the account you are signed in under." />
          )}
        </>
      )}
    </ConfirmActionModal>
  )
}

/** DELETE /sites/:id, confirmed. Soft. */
export function SiteDeactivateModal({
  site,
  onClose,
}: {
  site: SiteRecord | null
  onClose: () => void
}) {
  const shown = useRetained(site)
  const deactivate = useDeactivateSite()

  const close = () => {
    deactivate.reset()
    onClose()
  }

  const confirm = async () => {
    if (!shown) return
    try {
      await deactivate.mutateAsync({ id: shown.id, accountId: shown.accountId })
      close()
    } catch {
      // Rendered in the dialog from `deactivate.error`.
    }
  }

  return (
    <ConfirmActionModal
      isOpen={site !== null}
      title="Deactivate branch"
      confirmLabel="Deactivate branch"
      pendingLabel="Deactivating…"
      isPending={deactivate.isPending}
      error={deactivate.error}
      onConfirm={() => void confirm()}
      onClose={close}
    >
      {shown && (
        <>
          <p style={{ margin: 0 }}>
            Deactivate <strong>{shown.name}</strong>{' '}
            <span style={{ fontFamily: 'monospace', color: palette.secondary }}>
              ({shown.code})
            </span>
            {shown.accountName ? ` in ${shown.accountName}` : ''}?
          </p>
          <p style={noteStyle}>
            The branch is marked inactive and removed from listings, so no new
            orders can be placed against it. Historical orders and invoices keep
            referring to it.
          </p>
          <p style={noteStyle}>
            Users attached to this branch are not deactivated.
          </p>
        </>
      )}
    </ConfirmActionModal>
  )
}

/** DELETE /users/:id, confirmed. Soft, and ends every session. */
export function UserDeactivateModal({
  user,
  currentUserId,
  onClose,
}: {
  user: PortalUser | null
  currentUserId?: string
  onClose: () => void
}) {
  const shown = useRetained(user)
  const deactivate = useDeactivateManagedUser()
  const isSelf = shown !== null && shown.id === currentUserId

  const close = () => {
    deactivate.reset()
    onClose()
  }

  const confirm = async () => {
    if (!shown) return
    try {
      await deactivate.mutateAsync({
        id: shown.id,
        accountId: shown.accountId ?? '',
      })
      close()
    } catch {
      // Rendered in the dialog from `deactivate.error`.
    }
  }

  return (
    <ConfirmActionModal
      isOpen={user !== null}
      title="Deactivate user"
      confirmLabel="Deactivate user"
      pendingLabel="Deactivating…"
      isPending={deactivate.isPending}
      error={deactivate.error}
      confirmDisabled={isSelf}
      onConfirm={() => void confirm()}
      onClose={close}
    >
      {shown && (
        <>
          <p style={{ margin: 0 }}>
            Deactivate <strong>{shown.name}</strong>{' '}
            <span style={{ color: palette.secondary }}>({shown.email})</span>?
          </p>
          <p style={noteStyle}>
            They are disabled, removed from the user list and signed out of
            every session. Orders and approvals they made are kept.
          </p>
          {isSelf && (
            <ErrorNote message="You cannot deactivate your own account." />
          )}
        </>
      )}
    </ConfirmActionModal>
  )
}
