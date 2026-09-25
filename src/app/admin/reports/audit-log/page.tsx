// src/app/admin/reports/audit-log/page.tsx
'use client'

import { SkeletonTable } from '@/components/ui/Skeleton'
import React, {
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import {
  ChevronLeft,
  ChevronRight,
  RotateCcw,
  RotateCw,
  Search,
} from 'lucide-react'
import { AdminHeader } from '@/components/admin/AdminHeader'
import { AuditAccountPicker } from '@/components/admin/AuditAccountPicker'
import { AuditLogTable } from '@/components/admin/AuditLogTable'
import {
  AUDIT_ACTIONS,
  AUDIT_ACTION_GROUPS,
  AUDIT_ENTITY_TYPES,
  AUDIT_ENTITY_TYPE_LABELS,
  auditActionLabel,
  isAuditEntityType,
} from '@/components/admin/AuditLogVocabulary'
import { useAuditLogs } from '@/hooks/useAuditLogs'
import { useAuth } from '@/hooks/useAuth'
import { ApiError } from '@/services/api.service'
import type { AuditEntityType, AuditLogEntry, AuditLogQuery } from '@/types'

const PAGE_PATH = '/admin/reports/audit-log'
const PAGE_SIZES = [25, 50, 100] as const
const DEFAULT_PAGE_SIZE = 25
const TEXT_DEBOUNCE_MS = 350
const DATE_INPUT = /^\d{4}-\d{2}-\d{2}$/
/** What the API accepts for `field`: a bare identifier. */
const FIELD_NAME = /^[A-Za-z][A-Za-z0-9]{0,63}$/

type FilterKey =
  | 'accountId'
  | 'search'
  | 'entityType'
  | 'action'
  | 'entityId'
  | 'actorId'
  | 'field'
  | 'from'
  | 'to'
type UrlKey = FilterKey | 'page' | 'pageSize'

const FILTER_KEYS: readonly FilterKey[] = [
  'accountId',
  'search',
  'entityType',
  'action',
  'entityId',
  'actorId',
  'field',
  'from',
  'to',
]

type Filters = Record<Exclude<FilterKey, 'entityType'>, string> & {
  entityType: AuditEntityType | ''
  page: number
  pageSize: number
}

/**
 * The URL is the source of truth for every filter, so a filtered view can be
 * reloaded, bookmarked or pasted to a colleague. Anything malformed in it is
 * ignored rather than sent to the API to be refused.
 */
function readFilters(params: URLSearchParams): Filters {
  const text = (key: string) => params.get(key)?.trim() ?? ''
  const entityType = text('entityType')
  const from = text('from')
  const to = text('to')
  const page = Number(params.get('page'))
  const pageSize = Number(params.get('pageSize'))

  return {
    accountId: text('accountId'),
    search: text('search'),
    entityType: isAuditEntityType(entityType) ? entityType : '',
    action: text('action'),
    entityId: text('entityId'),
    actorId: text('actorId'),
    field: FIELD_NAME.test(text('field')) ? text('field') : '',
    from: DATE_INPUT.test(from) ? from : '',
    to: DATE_INPUT.test(to) ? to : '',
    page: Number.isInteger(page) && page >= 1 ? page : 1,
    pageSize: (PAGE_SIZES as readonly number[]).includes(pageSize)
      ? pageSize
      : DEFAULT_PAGE_SIZE,
  }
}

/**
 * A `YYYY-MM-DD` date input as the first or last millisecond of that day in
 * the viewer's own time zone — the API's range is inclusive at both ends, so
 * "to 3 March" has to mean the end of 3 March, not its first instant.
 */
function localDayBoundary(date: string, edge: 'start' | 'end'): string {
  const [year = 1970, month = 1, day = 1] = date.split('-').map(Number)
  const at =
    edge === 'start'
      ? new Date(year, month - 1, day, 0, 0, 0, 0)
      : new Date(year, month - 1, day, 23, 59, 59, 999)
  return at.toISOString()
}

function toApiParams(filters: Filters): AuditLogQuery {
  return {
    page: filters.page,
    pageSize: filters.pageSize,
    ...(filters.accountId ? { accountId: filters.accountId } : {}),
    ...(filters.search ? { search: filters.search } : {}),
    ...(filters.entityType ? { entityType: filters.entityType } : {}),
    ...(filters.action ? { action: filters.action } : {}),
    ...(filters.entityId ? { entityId: filters.entityId } : {}),
    ...(filters.actorId ? { actorId: filters.actorId } : {}),
    ...(filters.field ? { field: filters.field } : {}),
    ...(filters.from ? { from: localDayBoundary(filters.from, 'start') } : {}),
    ...(filters.to ? { to: localDayBoundary(filters.to, 'end') } : {}),
  }
}

/**
 * A text box that writes to the URL once typing pauses.
 *
 * `committed` remembers the last value this box pushed, so the URL catching up
 * with it is not mistaken for an outside change and does not overwrite
 * whatever has been typed since. A genuine outside change — Reset,
 * back/forward, a row's "only this actor" — does replace the draft.
 */
function useDebouncedText(value: string, onCommit: (next: string) => void) {
  const [draft, setDraft] = useState(value)
  const committed = useRef(value)
  const commitRef = useRef(onCommit)

  useEffect(() => {
    commitRef.current = onCommit
  })

  useEffect(() => {
    if (value !== committed.current) {
      committed.current = value
      setDraft(value)
    }
  }, [value])

  useEffect(() => {
    if (draft.trim() === committed.current) return
    const timer = window.setTimeout(() => {
      const next = draft.trim()
      if (next === committed.current) return
      committed.current = next
      commitRef.current(next)
    }, TEXT_DEBOUNCE_MS)
    return () => window.clearTimeout(timer)
  }, [draft])

  /**
   * Sets the box and what it counts as committed together, for a change the
   * caller writes to the URL itself (Reset). Setting only the draft left a
   * commit scheduled, which — if the URL had not caught up by the time it
   * fired — wrote the old filters straight back.
   */
  const reset = useCallback((next: string) => {
    committed.current = next
    setDraft(next)
  }, [])

  return [draft, setDraft, reset] as const
}

function AuditLogContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { role, user } = useAuth()
  const isAdmin = role === 'admin'

  const queryString = searchParams?.toString() ?? ''
  const filters = useMemo(
    () => readFilters(new URLSearchParams(queryString)),
    [queryString]
  )
  const apiParams = useMemo(() => toApiParams(filters), [filters])
  const rangeInvalid = Boolean(
    filters.from && filters.to && filters.from > filters.to
  )

  const { data, isLoading, isFetching, isPlaceholderData, error, refetch } =
    useAuditLogs(apiParams, {
      enabled: !rangeInvalid,
    })

  const updateUrl = useCallback(
    (changes: Partial<Record<UrlKey, string>>) => {
      // Built on the address bar as it is now, not on the query string this
      // render saw: two changes close together (a search committing, then a
      // select) would otherwise each start from the same old URL, and the
      // second would quietly undo the first.
      const next = new URLSearchParams(window.location.search)
      for (const [key, value] of Object.entries(changes)) {
        if (value) next.set(key, value)
        else next.delete(key)
      }
      // A different question starts at its first page.
      if (!('page' in changes)) next.delete('page')
      const qs = next.toString()
      router.replace(qs ? `${PAGE_PATH}?${qs}` : PAGE_PATH, { scroll: false })
    },
    [router]
  )

  const [searchDraft, setSearchDraft, resetSearch] = useDebouncedText(
    filters.search,
    (search) => updateUrl({ search })
  )
  const [entityIdDraft, setEntityIdDraft, resetEntityId] = useDebouncedText(
    filters.entityId,
    (entityId) => updateUrl({ entityId })
  )
  const [actorIdDraft, setActorIdDraft, resetActorId] = useDebouncedText(
    filters.actorId,
    (actorId) => updateUrl({ actorId })
  )
  const [fieldDraft, setFieldDraft, resetField] = useDebouncedText(
    filters.field,
    // Only a well-formed name reaches the URL; the API refuses anything else.
    (field) => updateUrl({ field: FIELD_NAME.test(field) ? field : '' })
  )
  const fieldProblem =
    fieldDraft.trim() !== '' && !FIELD_NAME.test(fieldDraft.trim())
      ? 'Letters and digits only, starting with a letter — e.g. basePrice.'
      : null

  const hasFilters = FILTER_KEYS.some((key) => Boolean(filters[key]))

  const resetFilters = () => {
    resetSearch('')
    resetEntityId('')
    resetActorId('')
    resetField('')
    const qs =
      filters.pageSize === DEFAULT_PAGE_SIZE
        ? ''
        : `?pageSize=${filters.pageSize}`
    router.replace(`${PAGE_PATH}${qs}`, { scroll: false })
  }

  const goToPage = (page: number) =>
    updateUrl({ page: page > 1 ? String(page) : '' })

  const filterByActor = (entry: AuditLogEntry) => {
    if (entry.actorId) updateUrl({ actorId: entry.actorId })
  }
  const filterByEntity = (entry: AuditLogEntry) =>
    updateUrl({ entityType: entry.entityType, entityId: entry.entityId })
  const filterByField = (field: string) => {
    resetField(field)
    updateUrl({ field })
  }

  // The actor filter takes an id; name it when a loaded row says who that is.
  const actorMatch = filters.actorId
    ? data?.items.find((entry) => entry.actorId === filters.actorId)
    : undefined

  const actionIsListed =
    !filters.action || AUDIT_ACTIONS.includes(filters.action)
  const apiError = error instanceof ApiError ? error : null

  const total = data?.total ?? 0
  const firstShown =
    data && data.items.length > 0 ? (data.page - 1) * data.pageSize + 1 : 0
  const lastShown =
    firstShown > 0 && data ? firstShown + data.items.length - 1 : 0

  return (
    <>
      <AdminHeader
        title="Audit Log"
        subtitle="Every change the platform recorded — who did what, to which record, and when"
        actionButton={
          <button
            type="button"
            onClick={() => void refetch()}
            disabled={rangeInvalid || isFetching}
            style={{
              ...secondaryButtonStyle,
              opacity: rangeInvalid || isFetching ? 0.6 : 1,
            }}
          >
            <RotateCw size={15} />
            <span>{isFetching ? 'Refreshing...' : 'Refresh'}</span>
          </button>
        }
      />

      <main
        style={{
          padding: '24px',
          display: 'flex',
          flexDirection: 'column',
          gap: '20px',
        }}
      >
        {/* Filters — all applied by the API, and all mirrored in the URL. */}
        <section style={cardStyle} aria-label="Audit log filters">
          <div
            style={{
              padding: '18px 20px',
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))',
              gap: '14px',
            }}
          >
            <div>
              <label htmlFor="audit-account" style={labelStyle}>
                Account
              </label>
              {isAdmin ? (
                <AuditAccountPicker
                  value={filters.accountId}
                  ownAccountId={user?.accountId}
                  ownAccountName={user?.accountName}
                  onChange={(accountId) => updateUrl({ accountId })}
                  style={controlStyle}
                />
              ) : (
                <div
                  id="audit-account"
                  style={{
                    ...controlStyle,
                    backgroundColor: '#FAF6F8',
                    color: '#6E6781',
                  }}
                >
                  {filters.accountId && filters.accountId !== user?.accountId
                    ? `Account ${filters.accountId}`
                    : (user?.accountName ?? 'Your account')}
                </div>
              )}
            </div>

            <div>
              <label htmlFor="audit-search" style={labelStyle}>
                Search
              </label>
              <div style={{ position: 'relative' }}>
                <Search
                  size={15}
                  color="#A39BB3"
                  style={{
                    position: 'absolute',
                    left: '11px',
                    top: '50%',
                    transform: 'translateY(-50%)',
                  }}
                />
                <input
                  id="audit-search"
                  type="search"
                  value={searchDraft}
                  onChange={(e) => setSearchDraft(e.target.value)}
                  placeholder="Actor name/email, entity name or id"
                  maxLength={120}
                  style={{ ...controlStyle, paddingLeft: '32px' }}
                />
              </div>
            </div>

            <div>
              <label htmlFor="audit-entity-type" style={labelStyle}>
                Entity type
              </label>
              <select
                id="audit-entity-type"
                value={filters.entityType}
                onChange={(e) => updateUrl({ entityType: e.target.value })}
                style={controlStyle}
              >
                <option value="">All entity types</option>
                {AUDIT_ENTITY_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {AUDIT_ENTITY_TYPE_LABELS[type]}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="audit-action" style={labelStyle}>
                Action
              </label>
              <select
                id="audit-action"
                value={filters.action}
                onChange={(e) => updateUrl({ action: e.target.value })}
                style={controlStyle}
              >
                <option value="">All actions</option>
                {!actionIsListed && (
                  <option value={filters.action}>
                    {auditActionLabel(filters.action)} ({filters.action})
                  </option>
                )}
                {AUDIT_ACTION_GROUPS.map((group) => (
                  <optgroup key={group.label} label={group.label}>
                    {group.actions.map((action) => (
                      <option key={action} value={action}>
                        {auditActionLabel(action)}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="audit-entity-id" style={labelStyle}>
                Entity ID
              </label>
              <input
                id="audit-entity-id"
                type="text"
                value={entityIdDraft}
                onChange={(e) => setEntityIdDraft(e.target.value)}
                placeholder="Exact record id"
                maxLength={128}
                style={controlStyle}
              />
            </div>

            <div>
              <label htmlFor="audit-actor-id" style={labelStyle}>
                Actor
              </label>
              <input
                id="audit-actor-id"
                type="text"
                value={actorIdDraft}
                onChange={(e) => setActorIdDraft(e.target.value)}
                placeholder="User id, or pick from a row"
                maxLength={64}
                style={controlStyle}
              />
              {filters.actorId && (
                <div style={hintStyle}>
                  {actorMatch
                    ? `${actorMatch.actorName} (${actorMatch.actorEmail})`
                    : 'Filtering on this user id'}
                </div>
              )}
            </div>

            <div>
              <label htmlFor="audit-field" style={labelStyle}>
                Changed field
              </label>
              <input
                id="audit-field"
                type="text"
                value={fieldDraft}
                onChange={(e) => setFieldDraft(e.target.value)}
                placeholder="e.g. basePrice, or pick from an entry"
                maxLength={64}
                aria-invalid={fieldProblem ? true : undefined}
                style={{
                  ...controlStyle,
                  ...(fieldProblem ? { borderColor: '#DC2626' } : {}),
                }}
              />
              {fieldProblem && (
                <div style={{ ...hintStyle, color: '#DC2626' }}>
                  {fieldProblem}
                </div>
              )}
            </div>

            <div>
              <label htmlFor="audit-from" style={labelStyle}>
                From
              </label>
              <input
                id="audit-from"
                type="date"
                value={filters.from}
                max={filters.to || undefined}
                onChange={(e) => updateUrl({ from: e.target.value })}
                style={controlStyle}
              />
            </div>

            <div>
              <label htmlFor="audit-to" style={labelStyle}>
                To
              </label>
              <input
                id="audit-to"
                type="date"
                value={filters.to}
                min={filters.from || undefined}
                onChange={(e) => updateUrl({ to: e.target.value })}
                style={controlStyle}
              />
            </div>
          </div>

          <div
            style={{
              padding: '12px 20px',
              borderTop: '1px solid #F5EEF2',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '12px',
              flexWrap: 'wrap',
            }}
          >
            <p
              style={{
                margin: 0,
                fontSize: '0.76rem',
                color: '#6E6781',
                maxWidth: '640px',
              }}
            >
              {isAdmin
                ? 'The trail is read one account at a time. Choose an account above to read its entries; dates are inclusive and in your local time.'
                : 'You are reading your own account’s trail. Dates are inclusive and in your local time.'}
            </p>
            <button
              type="button"
              onClick={resetFilters}
              disabled={!hasFilters}
              style={{ ...secondaryButtonStyle, opacity: hasFilters ? 1 : 0.5 }}
            >
              <RotateCcw size={14} />
              <span>Reset filters</span>
            </button>
          </div>
        </section>

        {/* Results */}
        <section
          style={{ ...cardStyle, overflow: 'hidden' }}
          aria-label="Audit entries"
          aria-busy={isFetching}
        >
          <div
            style={{
              padding: '14px 20px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '12px',
              flexWrap: 'wrap',
            }}
          >
            <div
              style={{ fontWeight: 700, fontSize: '0.95rem', color: '#2B253E' }}
            >
              {data && !rangeInvalid
                ? `${total.toLocaleString()} ${total === 1 ? 'entry' : 'entries'}`
                : 'Entries'}
              {isFetching && data && (
                <span
                  style={{
                    marginLeft: '10px',
                    fontSize: '0.74rem',
                    fontWeight: 500,
                    color: '#A39BB3',
                  }}
                >
                  Updating...
                </span>
              )}
            </div>
            <label
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                fontSize: '0.78rem',
                color: '#6E6781',
              }}
            >
              Rows per page
              <select
                value={filters.pageSize}
                onChange={(e) =>
                  updateUrl({
                    pageSize:
                      Number(e.target.value) === DEFAULT_PAGE_SIZE
                        ? ''
                        : e.target.value,
                  })
                }
                style={{ ...controlStyle, width: 'auto', padding: '6px 10px' }}
              >
                {PAGE_SIZES.map((size) => (
                  <option key={size} value={size}>
                    {size}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {rangeInvalid ? (
            <StateMessage tone="danger">
              “From” must be on or before “To”. Adjust the date range to see
              entries.
            </StateMessage>
          ) : error ? (
            <div
              role="alert"
              style={{ padding: '20px', borderTop: '1px solid #F5EEF2' }}
            >
              <div
                style={{
                  padding: '14px 16px',
                  borderRadius: '10px',
                  backgroundColor: '#FEF2F2',
                  color: '#DC2626',
                  fontSize: '0.82rem',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '6px',
                }}
              >
                <strong>
                  Could not load the audit log
                  {apiError?.status ? ` (${apiError.status})` : ''}
                </strong>
                <span>{error.message}</span>
                {apiError?.status === 403 && (
                  <span style={{ color: '#6E6781' }}>
                    Only platform admins may read another account’s trail, and
                    reading any trail needs the audit permission.
                  </span>
                )}
                {apiError?.requestId && (
                  <span style={{ color: '#6E6781', fontSize: '0.74rem' }}>
                    Request ID: <code>{apiError.requestId}</code>
                  </span>
                )}
                <div
                  style={{
                    display: 'flex',
                    gap: '8px',
                    marginTop: '4px',
                    flexWrap: 'wrap',
                  }}
                >
                  <button
                    type="button"
                    onClick={() => void refetch()}
                    style={secondaryButtonStyle}
                  >
                    Try again
                  </button>
                  {hasFilters && (
                    <button
                      type="button"
                      onClick={resetFilters}
                      style={secondaryButtonStyle}
                    >
                      Reset filters
                    </button>
                  )}
                </div>
              </div>
            </div>
          ) : isLoading || !data ? (
            <SkeletonTable
              rows={10}
              columns={5}
              label="Loading audit entries"
            />
          ) : data.items.length === 0 ? (
            data.total > 0 ? (
              <StateMessage>
                Page {data.page} is past the end of these results.{' '}
                <button
                  type="button"
                  onClick={() => goToPage(1)}
                  style={linkButtonStyle}
                >
                  Go to the first page
                </button>
              </StateMessage>
            ) : (
              <StateMessage>
                No audit entries match these filters.
                {hasFilters && (
                  <>
                    {' '}
                    <button
                      type="button"
                      onClick={resetFilters}
                      style={linkButtonStyle}
                    >
                      Reset filters
                    </button>
                  </>
                )}
              </StateMessage>
            )
          ) : (
            <>
              <AuditLogTable
                entries={data.items}
                dimmed={isPlaceholderData}
                onFilterActor={filterByActor}
                onFilterEntity={filterByEntity}
                onFilterField={filterByField}
              />

              <div
                style={{
                  padding: '12px 20px',
                  borderTop: '1px solid #F5EEF2',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '12px',
                  flexWrap: 'wrap',
                  fontSize: '0.78rem',
                  color: '#6E6781',
                }}
              >
                <span>
                  Showing {firstShown.toLocaleString()}–
                  {lastShown.toLocaleString()} of {total.toLocaleString()}
                </span>
                <div
                  style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
                >
                  <button
                    type="button"
                    onClick={() => goToPage(data.page - 1)}
                    disabled={data.page <= 1 || isPlaceholderData}
                    style={{
                      ...secondaryButtonStyle,
                      opacity: data.page <= 1 || isPlaceholderData ? 0.5 : 1,
                    }}
                  >
                    <ChevronLeft size={14} />
                    <span>Previous</span>
                  </button>
                  <span style={{ whiteSpace: 'nowrap' }}>
                    Page {data.page} of {data.totalPages}
                  </span>
                  <button
                    type="button"
                    onClick={() => goToPage(data.page + 1)}
                    disabled={data.page >= data.totalPages || isPlaceholderData}
                    style={{
                      ...secondaryButtonStyle,
                      opacity:
                        data.page >= data.totalPages || isPlaceholderData
                          ? 0.5
                          : 1,
                    }}
                  >
                    <span>Next</span>
                    <ChevronRight size={14} />
                  </button>
                </div>
              </div>
            </>
          )}
        </section>
      </main>
    </>
  )
}

function StateMessage({
  children,
  tone = 'muted',
}: {
  children: React.ReactNode
  tone?: 'muted' | 'danger'
}) {
  return (
    <div
      role={tone === 'danger' ? 'alert' : undefined}
      style={{
        padding: '32px',
        textAlign: 'center',
        color: tone === 'danger' ? '#DC2626' : '#A39BB3',
        fontSize: '0.84rem',
        borderTop: '1px solid #F5EEF2',
      }}
    >
      {children}
    </div>
  )
}

export default function AuditLogPage() {
  return (
    <Suspense
      fallback={
        <div style={{ padding: '24px' }}>
          <SkeletonTable rows={10} columns={5} label="Loading the audit log" />
        </div>
      }
    >
      <AuditLogContent />
    </Suspense>
  )
}

const cardStyle: React.CSSProperties = {
  backgroundColor: '#FFFFFF',
  borderRadius: '14px',
  boxShadow:
    '0 1px 2px rgba(43, 37, 62, 0.04), 0 6px 16px rgba(43, 37, 62, 0.05)',
  border: '1px solid #F0E6EC',
}

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: '0.78rem',
  fontWeight: 600,
  color: '#5C566E',
  marginBottom: '6px',
}

const controlStyle: React.CSSProperties = {
  width: '100%',
  padding: '8px 12px',
  borderRadius: '10px',
  border: '1px solid #F0E6EC',
  fontSize: '0.84rem',
  backgroundColor: '#FFFFFF',
  color: '#2B253E',
  boxSizing: 'border-box',
}

const hintStyle: React.CSSProperties = {
  fontSize: '0.72rem',
  color: '#A39BB3',
  marginTop: '4px',
}

const secondaryButtonStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '6px',
  padding: '8px 14px',
  borderRadius: '10px',
  border: '1px solid #F0E6EC',
  backgroundColor: '#FFFFFF',
  color: '#2B253E',
  fontSize: '0.82rem',
  fontWeight: 600,
  cursor: 'pointer',
}

const linkButtonStyle: React.CSSProperties = {
  border: 'none',
  background: 'none',
  padding: 0,
  color: '#F73582',
  fontWeight: 600,
  fontSize: 'inherit',
  cursor: 'pointer',
}
