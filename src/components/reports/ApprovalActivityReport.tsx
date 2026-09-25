// src/components/reports/ApprovalActivityReport.tsx
'use client'

import { SkeletonTable } from '@/components/ui/Skeleton'
import { useMemo, useState } from 'react'
import Link from 'next/link'
import {
  AdminCard,
  AdminTable,
  Field,
  Notice,
  SectionHeading,
  SelectInput,
  StatTile,
  StateBlock,
  Td,
  TextInput,
  Th,
} from '@/components/admin/ProductAdminUi'
import { errorMessage } from '@/components/admin/ProductAdminUtils'
import { useApprovalActivity } from '@/hooks/useReports'
import type {
  ApiApprovalOutcome,
  ApprovalActivityParams,
} from '@/services/data-source/api/governance.types'
import { ReportDownloadButtons } from './ReportDownloadButtons'
import { formatDateTime, formatMoney } from '@/lib/format'
import { dateInputToIso, formatHours, OUTCOME_LABELS } from './reportFormat'

const OUTCOME_COLOURS: Record<ApiApprovalOutcome, string> = {
  APPROVED: '#047857',
  REJECTED: '#B91C1C',
  CHANGES_REQUESTED: '#B45309',
}

/**
 * Approval activity (SOW §15): every decision in a window, by approver and
 * outcome, with the approval cycle time — submission to decision.
 *
 * Shared by the admin and head-office portals; the page decides the account
 * and where an order number links to.
 */
export function ApprovalActivityReport({
  accountId,
  orderHref,
}: {
  /** Omitted: the signed-in user's own account. */
  accountId?: string
  orderHref: (orderId: string) => string
}) {
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [outcome, setOutcome] = useState<ApiApprovalOutcome | ''>('')
  const [approverId, setApproverId] = useState('')

  const rangeProblem = from && to && from > to ? 'From is after To.' : null

  const params: ApprovalActivityParams = useMemo(
    () => ({
      ...(accountId ? { accountId } : {}),
      ...(from ? { from: dateInputToIso(from, 'start') } : {}),
      ...(to ? { to: dateInputToIso(to, 'endExclusive') } : {}),
      ...(outcome ? { outcome } : {}),
      ...(approverId ? { approverId } : {}),
    }),
    [accountId, from, to, outcome, approverId]
  )

  const { data, isLoading, isFetching, error } = useApprovalActivity(
    params,
    !rangeProblem
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <AdminCard>
        <SectionHeading
          title="Filters"
          description={
            data
              ? `Decisions from ${formatDateTime(data.from)} to ${formatDateTime(data.to)}. Leave the dates empty for the default window.`
              : 'Leave the dates empty for the default window.'
          }
        />
        <div
          className="grid-auto"
          style={{ ['--min']: '180px', gap: '12px' } as React.CSSProperties}
        >
          <Field label="From" htmlFor="approval-from">
            <TextInput
              id="approval-from"
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
            />
          </Field>
          <Field label="To" htmlFor="approval-to">
            <TextInput
              id="approval-to"
              type="date"
              value={to}
              invalid={Boolean(rangeProblem)}
              onChange={(e) => setTo(e.target.value)}
            />
          </Field>
          <Field label="Outcome" htmlFor="approval-outcome">
            <SelectInput
              id="approval-outcome"
              value={outcome}
              onChange={(e) =>
                setOutcome(e.target.value as ApiApprovalOutcome | '')
              }
            >
              <option value="">All outcomes</option>
              {Object.entries(OUTCOME_LABELS).map(([value, text]) => (
                <option key={value} value={value}>
                  {text}
                </option>
              ))}
            </SelectInput>
          </Field>
          <Field label="Approver" htmlFor="approval-approver">
            <SelectInput
              id="approval-approver"
              value={approverId}
              onChange={(e) => setApproverId(e.target.value)}
            >
              <option value="">All approvers</option>
              {(data?.byApprover ?? [])
                .filter((row) => row.approverId)
                .map((row) => (
                  <option key={row.approverId} value={row.approverId!}>
                    {row.approverName}
                  </option>
                ))}
            </SelectInput>
          </Field>
        </div>
        {rangeProblem && <Notice tone="error">{rangeProblem}</Notice>}
      </AdminCard>

      {error ? (
        <AdminCard>
          <StateBlock
            tone="error"
            title="The approval activity report could not be loaded"
            description={errorMessage(error, 'Try again in a moment.')}
          />
        </AdminCard>
      ) : isLoading || !data ? (
        <AdminCard>
          <SkeletonTable
            rows={6}
            columns={7}
            label="Loading approval activity"
          />
        </AdminCard>
      ) : (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '20px',
            opacity: isFetching ? 0.6 : 1,
          }}
        >
          <AdminCard>
            <SectionHeading title="Summary" />
            <div
              className="grid-auto"
              style={{ ['--min']: '150px', gap: '12px' } as React.CSSProperties}
            >
              <StatTile label="Decisions" value={data.totals.decisions} />
              <StatTile
                label="Approved"
                value={data.totals.approved}
                tone="success"
              />
              <StatTile
                label="Rejected"
                value={data.totals.rejected}
                tone={data.totals.rejected > 0 ? 'danger' : 'default'}
              />
              <StatTile
                label="Changes requested"
                value={data.totals.changesRequested}
              />
              <StatTile
                label="Average cycle time"
                value={formatHours(data.totals.averageHoursToDecision)}
                hint="Submission to decision"
              />
              <StatTile
                label="Median cycle time"
                value={formatHours(data.totals.medianHoursToDecision)}
              />
            </div>
          </AdminCard>

          <AdminCard>
            <SectionHeading
              title="By approver"
              action={
                <ReportDownloadButtons
                  report="approvals/activity-by-approver"
                  params={params}
                  disabled={data.byApprover.length === 0}
                />
              }
            />
            {data.byApprover.length === 0 ? (
              <StateBlock title="No decisions in this window" />
            ) : (
              <AdminTable
                head={
                  <>
                    <Th first>Approver</Th>
                    <Th align="right">Decisions</Th>
                    <Th align="right">Approved</Th>
                    <Th align="right">Rejected</Th>
                    <Th align="right">Changes</Th>
                    <Th align="right">Average</Th>
                    <Th align="right">Median</Th>
                  </>
                }
              >
                {data.byApprover.map((row) => (
                  <tr
                    key={row.approverId ?? row.approverName}
                    style={{ borderTop: '1px solid #F5EEF2' }}
                  >
                    <Td first style={{ fontWeight: 600 }}>
                      {row.approverName}
                    </Td>
                    <Td align="right">{row.decisions}</Td>
                    <Td align="right">{row.approved}</Td>
                    <Td align="right">{row.rejected}</Td>
                    <Td align="right">{row.changesRequested}</Td>
                    <Td align="right">
                      {formatHours(row.averageHoursToDecision)}
                    </Td>
                    <Td align="right">
                      {formatHours(row.medianHoursToDecision)}
                    </Td>
                  </tr>
                ))}
              </AdminTable>
            )}
          </AdminCard>

          <AdminCard>
            <SectionHeading
              title={`Decisions (${data.decisions.length})`}
              description="Newest first. A two-tier approval is two decisions, one per tier."
              action={
                <ReportDownloadButtons
                  report="approvals/activity"
                  params={params}
                  disabled={data.decisions.length === 0}
                />
              }
            />
            {data.decisions.length === 0 ? (
              <StateBlock title="No decisions match these filters" />
            ) : (
              <AdminTable
                head={
                  <>
                    {/* The order number leads the row: a bare timestamp in the
                        first column told the reader nothing once the table was
                        scrolled sideways on a phone. */}
                    <Th first>Order</Th>
                    <Th>Decided</Th>
                    <Th>Site</Th>
                    <Th align="right">Total</Th>
                    <Th>Approver</Th>
                    <Th>Route</Th>
                    <Th>Outcome</Th>
                    <Th align="right">Cycle time</Th>
                    <Th>Comment</Th>
                  </>
                }
              >
                {data.decisions.map((row, index) => (
                  <tr
                    key={`${row.orderId}-${row.tier ?? 'hold'}-${index}`}
                    style={{ borderTop: '1px solid #F5EEF2' }}
                  >
                    <Td first>
                      <Link
                        href={orderHref(row.orderId)}
                        style={{
                          color: '#F73582',
                          fontWeight: 600,
                          textDecoration: 'none',
                          fontFamily: 'monospace',
                        }}
                      >
                        {row.orderNumber}
                      </Link>
                    </Td>
                    <Td style={{ whiteSpace: 'nowrap' }}>
                      {formatDateTime(row.decidedAt)}
                    </Td>
                    <Td>
                      {row.siteName}{' '}
                      <span style={{ color: '#A39BB3' }}>{row.siteCode}</span>
                    </Td>
                    <Td align="right">{formatMoney(row.orderTotal)}</Td>
                    <Td>
                      {row.approverName}
                      {row.approverRole && (
                        <div style={{ fontSize: '0.74rem', color: '#A39BB3' }}>
                          {row.approverRole}
                        </div>
                      )}
                    </Td>
                    <Td style={{ whiteSpace: 'nowrap' }}>
                      {row.route === 'RULE'
                        ? `Rule, tier ${row.tier ?? '—'}`
                        : 'Threshold'}
                    </Td>
                    <Td>
                      <span
                        style={{
                          fontWeight: 600,
                          color: OUTCOME_COLOURS[row.outcome],
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {OUTCOME_LABELS[row.outcome] ?? row.outcome}
                      </span>
                    </Td>
                    <Td align="right">{formatHours(row.hoursToDecision)}</Td>
                    <Td style={{ maxWidth: '260px', overflowWrap: 'anywhere' }}>
                      {row.comment ?? (
                        <span style={{ color: '#A39BB3' }}>—</span>
                      )}
                    </Td>
                  </tr>
                ))}
              </AdminTable>
            )}
          </AdminCard>
        </div>
      )}
    </div>
  )
}
