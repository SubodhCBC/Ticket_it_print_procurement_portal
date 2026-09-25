// src/components/admin/PermissionMatrix.tsx
'use client'

import { SkeletonTable } from '@/components/ui/Skeleton'
import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Check, ChevronRight, Search, ShieldCheck } from 'lucide-react'
import {
  getPermissionCatalog,
  type PermissionCatalog,
  type PermissionDescriptor,
} from '@/services/data-source/api/api-authorization.adapter'
import type { Permission } from '@/types/auth'

/**
 * The role/permission baseline, read from the API.
 *
 * Read-only by design: the baseline is compiled into the server
 * (`common/authorization/permissions.ts`), and departures from it are per-user
 * grants, not edits to this table.
 *
 * Laid out as ten collapsed groups rather than one flat list of thirty-three
 * rows. Flat, this was about 2,200px tall — every question about it ("can head
 * office issue invoices?") meant scrolling past everything else, and the role
 * columns scrolled off the top on the way. Collapsed, the group rows carry
 * their own per-role tallies, so the closed state answers the shape of the
 * model on one screen and opening a group is only needed for the detail.
 */
export function PermissionMatrix() {
  const [catalog, setCatalog] = useState<PermissionCatalog | null>(null)
  const [catalogError, setCatalogError] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState<Set<string>>(new Set())

  useEffect(() => {
    let cancelled = false

    getPermissionCatalog()
      .then((result) => {
        if (!cancelled) setCatalog(result)
      })
      .catch((err: unknown) => {
        if (cancelled) return
        // Reading the catalogue needs USER_MANAGE. A head-office user reaching
        // this tab is refused, which is the rule working rather than a fault.
        setCatalogError(
          err instanceof Error
            ? err.message
            : 'Could not load the permission matrix.'
        )
      })

    return () => {
      cancelled = true
    }
  }, [])

  const roles = useMemo(
    () =>
      (catalog?.roles ?? []).map((role) => ({
        id: role.role,
        title: role.label,
        subtitle: role.description,
        permissions: new Set<Permission>(role.permissions),
      })),
    [catalog]
  )

  /** Grouped as the API groups them, so a new permission needs no change here. */
  const groups = useMemo(() => {
    const byGroup = new Map<string, PermissionDescriptor[]>()
    for (const permission of catalog?.permissions ?? []) {
      const existing = byGroup.get(permission.group)
      if (existing) existing.push(permission)
      else byGroup.set(permission.group, [permission])
    }
    return [...byGroup.entries()]
  }, [catalog])

  const needle = query.trim().toLowerCase()

  /**
   * Groups after the search, each with the rows that matched.
   *
   * A group whose own name matches keeps all of its rows: searching "billing"
   * should show what billing covers, not an empty heading.
   */
  const visible = useMemo(() => {
    if (!needle) return groups.map(([g, p]) => [g, p] as const)
    return groups
      .map(([group, permissions]) => {
        if (group.toLowerCase().includes(needle))
          return [group, permissions] as const
        return [
          group,
          permissions.filter(
            (p) =>
              p.key.toLowerCase().includes(needle) ||
              humanise(p.key).toLowerCase().includes(needle) ||
              // The description is why "invoice" or "approve" finds anything:
              // the keys are named after the module, not the task.
              p.description.toLowerCase().includes(needle)
          ),
        ] as const
      })
      .filter(([, permissions]) => permissions.length > 0)
  }, [groups, needle])

  // While searching, everything that matched is open: a hit hidden inside a
  // collapsed group looks like no hit at all.
  const isOpen = (group: string) => Boolean(needle) || open.has(group)

  const toggle = (group: string) =>
    setOpen((prev) => {
      const next = new Set(prev)
      if (next.has(group)) next.delete(group)
      else next.add(group)
      return next
    })

  const allOpen = groups.length > 0 && open.size === groups.length
  const total = catalog?.permissions.length ?? 0

  /**
   * How tall the scrolling box may be, measured rather than guessed.
   *
   * A fixed `calc(100vh - Npx)` needs N to account for the app header, the page
   * banner, this card's own header and its controls — four heights that change
   * with the viewport, the account name wrapping, and any later edit to the
   * page above. The first N chosen here was 56px short, and expanding every
   * group put the whole page back into scroll, which is the thing this layout
   * exists to prevent. Asking the element where it actually sits costs one
   * rect read and cannot drift.
   */
  const scrollerRef = useRef<HTMLDivElement>(null)
  const [maxHeight, setMaxHeight] = useState<number | null>(null)

  useEffect(() => {
    const measure = () => {
      const el = scrollerRef.current
      if (!el) return
      // Viewport-relative, so this is literally the room left underneath it.
      const top = el.getBoundingClientRect().top
      setMaxHeight(Math.max(220, Math.floor(window.innerHeight - top - 24)))
    }
    // After paint: before it, the card has not been laid out and `top` is 0.
    const raf = requestAnimationFrame(measure)
    window.addEventListener('resize', measure)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', measure)
    }
    // Re-measured when the catalogue lands, which is when the card gets its
    // real height and everything below the header shifts.
  }, [catalog, catalogError])

  return (
    <div style={S.card}>
      {/* ── Header ── */}
      <div style={S.head}>
        <div>
          <div style={S.title}>What each role can do</div>
          <div style={S.subtitle}>
            The baseline each role carries. Compiled into the API — per-user
            departures are grants on the Users screen, not edits here.
          </div>
        </div>
        <span style={S.countPill}>
          <ShieldCheck size={13} />
          {total} permissions · {roles.length} roles
        </span>
      </div>

      {/* ── Controls ── */}
      <div className="row-wrap" style={S.controls}>
        <div style={S.searchWrap}>
          <Search
            size={16}
            color="#A39BB3"
            style={{
              position: 'absolute',
              left: 12,
              top: '50%',
              transform: 'translateY(-50%)',
              pointerEvents: 'none',
            }}
          />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Find a permission — name, code or group"
            style={S.search}
          />
        </div>
        <button
          type="button"
          onClick={() =>
            setOpen(allOpen ? new Set() : new Set(groups.map(([g]) => g)))
          }
          className="touch-target"
          disabled={!catalog || Boolean(needle)}
          style={{
            ...S.ghostBtn,
            opacity: !catalog || needle ? 0.5 : 1,
          }}
        >
          {allOpen ? 'Collapse all' : 'Expand all'}
        </button>
      </div>

      {catalogError && <div style={S.error}>{catalogError}</div>}

      {!catalogError && !catalog && (
        <SkeletonTable
          rows={8}
          columns={5}
          label="Loading the permission matrix"
        />
      )}

      {catalog && visible.length === 0 && (
        <div style={S.empty}>Nothing matches &ldquo;{query}&rdquo;.</div>
      )}

      {catalog && visible.length > 0 && (
        <div
          ref={scrollerRef}
          className="table-scroll"
          style={{
            ...S.scroller,
            // Until the first measurement, unbounded: a wrong guess that
            // briefly shows a longer list beats one that clips it.
            maxHeight: maxHeight ?? undefined,
          }}
        >
          <table style={S.table}>
            {/* Sticky, so the role a tick belongs to is never off-screen. */}
            <thead style={S.thead}>
              <tr>
                <th style={{ ...S.th, ...S.thName }}>Capability</th>
                {roles.map((r) => (
                  <th
                    key={r.id}
                    style={{ ...S.th, ...S.thRole }}
                    title={r.subtitle}
                  >
                    <div style={S.roleName}>{r.title}</div>
                    <div style={S.roleTally}>
                      {r.permissions.size}/{total}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>

            <tbody>
              {visible.map(([group, permissions]) => {
                const expanded = isOpen(group)
                return (
                  <React.Fragment key={group}>
                    <tr
                      onClick={() => !needle && toggle(group)}
                      style={{
                        ...S.groupRow,
                        cursor: needle ? 'default' : 'pointer',
                      }}
                    >
                      <td style={S.groupCell}>
                        <div style={S.groupInner}>
                          <ChevronRight
                            size={14}
                            color="#A39BB3"
                            style={{
                              transform: expanded
                                ? 'rotate(90deg)'
                                : 'rotate(0deg)',
                              transition: 'transform 140ms ease',
                              flexShrink: 0,
                            }}
                          />
                          <span style={S.groupName}>{group}</span>
                          <span style={S.groupCount}>{permissions.length}</span>
                        </div>
                      </td>

                      {/* Closed, these tallies are the summary — the reason the
                          collapsed view is worth reading on its own. */}
                      {roles.map((r) => {
                        const held = permissions.filter((p) =>
                          r.permissions.has(p.key)
                        ).length
                        return (
                          <td key={r.id} style={S.groupTallyCell}>
                            <span
                              style={{
                                ...S.groupTally,
                                color:
                                  held === 0
                                    ? '#DCD3E0'
                                    : held === permissions.length
                                      ? '#3F9C68'
                                      : '#5C566E',
                                backgroundColor:
                                  held === permissions.length
                                    ? '#ECFDF5'
                                    : 'transparent',
                              }}
                            >
                              {held}
                            </span>
                          </td>
                        )
                      })}
                    </tr>

                    {expanded &&
                      permissions.map((perm) => (
                        <tr key={perm.key} style={S.row}>
                          <td style={S.nameCell}>
                            <div style={S.nameInner}>
                              {/* Name and code on one line, not stacked: stacked,
                                thirty-three rows were twice as tall for the same
                                information. */}
                              <span style={S.permName}>
                                {humanise(perm.key)}
                              </span>
                              <code style={S.permKey}>{perm.key}</code>
                            </div>
                            <div style={S.permDesc}>{perm.description}</div>
                          </td>

                          {roles.map((r) => (
                            <td key={r.id} style={S.markCell}>
                              {r.permissions.has(perm.key) ? (
                                <span style={S.granted}>
                                  <Check size={15} strokeWidth={2.5} />
                                </span>
                              ) : (
                                // A quiet dash, not a red cross in a circle:
                                // with 132 cells the denials are the background,
                                // and only the grants should catch the eye.
                                <span style={S.denied}>—</span>
                              )}
                            </td>
                          ))}
                        </tr>
                      ))}
                  </React.Fragment>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

/** `ORDER_VIEW_SITE` → `Order view site`. */
function humanise(key: string): string {
  return key
    .toLowerCase()
    .split('_')
    .join(' ')
    .replace(/^./, (c) => c.toUpperCase())
}

const S: Record<string, React.CSSProperties> = {
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: '14px',
    boxShadow:
      '0 1px 2px rgba(43, 37, 62, 0.04), 0 6px 16px rgba(43, 37, 62, 0.05)',
    border: '1px solid #F0E6EC',
    overflow: 'hidden',
  },
  head: {
    padding: '16px 20px',
    borderBottom: '1px solid #F5EEF2',
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: '16px',
    flexWrap: 'wrap',
  },
  title: {
    fontWeight: 700,
    fontSize: '0.95rem',
    color: '#2B253E',
    letterSpacing: '-0.01em',
  },
  subtitle: {
    fontSize: '0.76rem',
    color: '#A39BB3',
    marginTop: '3px',
    maxWidth: '54ch',
  },
  countPill: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '4px',
    fontSize: '0.7rem',
    fontWeight: 600,
    backgroundColor: '#F5EEF2',
    color: '#5C566E',
    padding: '2px 8px',
    borderRadius: '9999px',
    whiteSpace: 'nowrap',
    flexShrink: 0,
  },
  controls: {
    padding: '12px 20px',
    borderBottom: '1px solid #F5EEF2',
  },
  searchWrap: {
    position: 'relative',
    flex: 1,
    minWidth: '200px',
    maxWidth: '380px',
  },
  search: {
    width: '100%',
    padding: '8px 12px 8px 36px',
    borderRadius: '10px',
    border: '1px solid #F0E6EC',
    backgroundColor: '#FFFFFF',
    fontSize: '0.84rem',
    color: '#2B253E',
    outline: 'none',
  },
  ghostBtn: {
    padding: '8px 14px',
    borderRadius: '10px',
    border: '1px solid #F0E6EC',
    backgroundColor: '#FFFFFF',
    color: '#2B253E',
    fontSize: '0.82rem',
    fontWeight: 600,
    cursor: 'pointer',
    whiteSpace: 'nowrap',
  },
  /**
   * The matrix scrolls inside its own box, so the settings page keeps a fixed
   * height whatever the catalogue grows to and the tab rail stays in view. The
   * height itself is measured at runtime — see `maxHeight` above.
   *
   * Both axes: a column per role means five or six roles are already wider
   * than a laptop, and scrolling only vertically pushed that overflow out onto
   * the page, which then scrolled sideways as a whole.
   */
  scroller: { overflowY: 'auto' },
  table: {
    width: '100%',
    minWidth: '760px',
    borderCollapse: 'collapse',
    textAlign: 'left',
    fontSize: '0.84rem',
  },
  /**
   * White, not a grey band: the column names are labels, not data. It still
   * needs a fill because rows scroll underneath it. The rule under it is an
   * inset shadow rather than a border because, in a collapsed table, a border
   * does not travel with a sticky header — it stays behind and scrolls away.
   */
  thead: {
    position: 'sticky',
    top: 0,
    zIndex: 1,
    backgroundColor: '#FFFFFF',
    boxShadow: 'inset 0 -1px 0 #F0E6EC',
  },
  th: {
    padding: '10px 14px',
    color: '#A39BB3',
    fontWeight: 500,
    fontSize: '0.74rem',
  },
  thName: {
    width: '46%',
    minWidth: '260px',
    paddingLeft: '20px',
    position: 'sticky',
    left: 0,
    zIndex: 2,
    backgroundColor: '#FFFFFF',
    boxShadow: 'inset -1px 0 0 #F0E6EC, inset 0 -1px 0 #F0E6EC',
  },
  thRole: { textAlign: 'center', width: '13.5%' },
  roleName: { fontWeight: 600, color: '#2B253E', fontSize: '0.76rem' },
  roleTally: { fontSize: '0.7rem', color: '#A39BB3', fontWeight: 500 },

  groupRow: { borderTop: '1px solid #F5EEF2' },
  groupCell: {
    padding: '10px 14px 10px 20px',
    color: '#2B253E',
    position: 'sticky',
    left: 0,
    zIndex: 1,
    backgroundColor: '#FFFFFF',
    boxShadow: 'inset -1px 0 0 #F0E6EC, inset 0 1px 0 #F5EEF2',
  },
  groupInner: { display: 'flex', alignItems: 'center', gap: '8px' },
  groupName: { fontWeight: 600, fontSize: '0.84rem' },
  groupCount: {
    fontSize: '0.7rem',
    fontWeight: 600,
    color: '#5C566E',
    backgroundColor: '#F5EEF2',
    borderRadius: '9999px',
    padding: '2px 8px',
  },
  groupTallyCell: { textAlign: 'center', padding: '10px 14px' },
  groupTally: {
    display: 'inline-block',
    minWidth: '22px',
    padding: '2px 8px',
    borderRadius: '9999px',
    fontSize: '0.74rem',
    fontWeight: 600,
  },

  row: { borderTop: '1px solid #F5EEF2' },
  // Indented to line up with the group name: 20px gutter, 14px chevron, 8px gap.
  nameCell: {
    padding: '8px 14px 8px 42px',
    position: 'sticky',
    left: 0,
    zIndex: 1,
    backgroundColor: '#FFFFFF',
    boxShadow: 'inset -1px 0 0 #F0E6EC, inset 0 1px 0 #F5EEF2',
  },
  permDesc: {
    fontSize: '0.74rem',
    color: '#A39BB3',
    marginTop: '2px',
    lineHeight: 1.4,
  },
  nameInner: {
    display: 'flex',
    alignItems: 'baseline',
    gap: '8px',
    flexWrap: 'wrap',
  },
  permName: { fontWeight: 500, color: '#2B253E' },
  permKey: {
    fontSize: '0.7rem',
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
    color: '#A39BB3',
  },
  markCell: { textAlign: 'center', padding: '8px 14px' },
  // A bare green tick. The tick is the status signal, so it keeps its colour;
  // the tinted circle behind it doubled the weight of every grant for nothing.
  granted: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: '#3F9C68',
  },
  denied: { color: '#DCD3E0', fontWeight: 500 },

  error: {
    padding: '32px',
    textAlign: 'center',
    color: '#DC2626',
    fontSize: '0.84rem',
  },
  empty: {
    padding: '32px',
    textAlign: 'center',
    color: '#A39BB3',
    fontSize: '0.84rem',
  },
}
