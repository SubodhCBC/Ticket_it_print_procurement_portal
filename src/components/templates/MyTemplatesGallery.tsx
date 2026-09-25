'use client'

import { SkeletonCardGrid } from '@/components/ui/Skeleton'
import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import {
  ArrowRight,
  LayoutTemplate,
  Pencil,
  Search,
  Unlock,
} from 'lucide-react'
import Link from 'next/link'
import { useAuth } from '@/hooks/useAuth'
import { useTemplates } from '@/hooks/useTemplates'
import type { PrintTemplate } from '@/types'

/**
 * A customer's own template library — and only their own.
 *
 * ---------------------------------------------------------------------------
 * What belongs here, and what belongs in the public gallery
 * ---------------------------------------------------------------------------
 * The list endpoint returns everything this person may *see*: their own copies
 * alongside whatever the operator and their head office have published to them.
 * That breadth is right for the endpoint — one visibility rule, enforced
 * server-side, because a gallery that decided visibility for itself would
 * eventually decide it differently from the route that enforces it.
 *
 * It is not right for this page. A design an admin or head office published is
 * a *library* design; it belongs on `/shop/templates`, where it can be browsed
 * and personalised. Listing it here too said "this is one of yours" about
 * something the server would refuse to let them save, and left the page
 * answering two questions at once. So the rows are filtered down to what this
 * person actually owns, and the library is a link away.
 *
 * Ownership is also what the edit action keys off, so nobody is offered an
 * editor the server will refuse to save from.
 *
 * ---------------------------------------------------------------------------
 * No blank canvas here
 * ---------------------------------------------------------------------------
 * This page edits; it does not author. `createTemplate` refuses anyone who is
 * not an administrator, and for a reason a head office or site user cannot
 * work around: a design has to carry a price before it can be ordered, and
 * PRICING_MANAGE is in no customer role, so a design built from nothing here
 * would be one nobody could ever buy. The hero used to offer "Start from
 * scratch" anyway, pointing at a `/new` route that has since been deleted —
 * so it led to a 404, and would have met the server's refusal if it had not.
 * A customer's designs arrive the two ways that guarantee a price:
 * personalising one from the library, or the copy granted when they order one.
 * So the only call to action is the library.
 *
 * ---------------------------------------------------------------------------
 * Why it looks like the rest of the shop
 * ---------------------------------------------------------------------------
 * The page header, the tiles, the pink call to action and the "customizable
 * fields" line are the ones `/shop/templates` and the operator gallery use. A
 * customer moves between those pages and this one in a single session, and a
 * private library drawn in its own visual language read as a different product.
 */

/**
 * Deliberately `PrintTemplate` and not a local shape.
 *
 * It was a local interface plus a cast, and the cast is what let the adapter
 * quietly stop carrying `ownerUserId`: every row then failed the ownership
 * test, "Yours" was empty, and nothing anywhere reported a fault. Reading the
 * real type means the next field the mapper forgets fails the build instead.
 */
type TemplateRow = PrintTemplate

/**
 * Owned outright, or — for a head office — owned by the account, which its
 * colleagues share. Anything else the list returns is a published library
 * design: visible to this person, but not theirs, and `/shop/templates` is
 * where those are browsed.
 */
function isOwnedBy(
  t: TemplateRow,
  userId: string | undefined,
  accountId: string | undefined
) {
  return (
    t.ownerUserId === userId ||
    (t.visibility === 'ACCOUNT' && t.ownerAccountId === accountId)
  )
}

export function MyTemplatesGallery({
  basePath,
  browseHref,
}: {
  basePath: string
  /**
   * Where the published library lives for this audience. Optional, and head
   * office — the only caller since `/shop/my-templates` was removed — passes
   * nothing: `/shop/templates` is behind an AuthGuard that admits site users
   * and administrators only, so linking there would land them outside their
   * own portal. The page header and the empty state simply omit the link.
   */
  browseHref?: string
}) {
  const router = useRouter()
  const { user } = useAuth()
  const { data, isLoading } = useTemplates({ pageSize: 100 })
  const [searchQuery, setSearchQuery] = useState<string>('')

  const rows: TemplateRow[] = useMemo(() => data ?? [], [data])

  const owned = useMemo(
    () => rows.filter((t) => isOwnedBy(t, user?.id, user?.accountId)),
    [rows, user?.id, user?.accountId]
  )

  const mine = useMemo(() => {
    // Searched here rather than through the API: these rows are one person's
    // own library, already in hand, and a round trip per keystroke would make
    // the list flicker for no gain.
    const q = searchQuery.trim().toLowerCase()
    if (!q) return owned

    return owned.filter(
      (t) =>
        t.name.toLowerCase().includes(q) ||
        t.productName.toLowerCase().includes(q) ||
        t.category.toLowerCase().includes(q)
    )
  }, [owned, searchQuery])

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '20px',
      }}
    >
      {/* 1. Page header */}
      <div
        className="row-wrap"
        style={{ alignItems: 'flex-end', justifyContent: 'space-between' }}
      >
        <div style={{ minWidth: 0, maxWidth: '680px' }}>
          <h1
            style={{
              fontSize: '1.25rem',
              fontWeight: 700,
              color: '#2B253E',
              letterSpacing: '-0.01em',
              margin: 0,
            }}
          >
            My Templates — Your Own Designs, Ready to Edit
          </h1>
          <p
            style={{
              fontSize: '0.8rem',
              color: '#6E6781',
              lineHeight: 1.5,
              margin: '4px 0 0',
            }}
          >
            Every design here is yours: it opens straight in the editor and
            saves to your own copy. New designs are built by the print team —
            personalise one from the template library and the copy lands here.
          </p>
        </div>

        {browseHref ? (
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <Link
              href={browseHref}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                padding: '8px 14px',
                borderRadius: '10px',
                backgroundColor: '#F73582',
                color: '#FFFFFF',
                border: 'none',
                fontSize: '0.82rem',
                fontWeight: 600,
                textDecoration: 'none',
                whiteSpace: 'nowrap',
              }}
            >
              Browse Template Library →
            </Link>
          </div>
        ) : null}
      </div>

      {/* 2. Search */}
      <div
        className="row-wrap"
        style={{
          backgroundColor: '#FFFFFF',
          borderRadius: '14px',
          boxShadow:
            '0 1px 2px rgba(43, 37, 62, 0.04), 0 6px 16px rgba(43, 37, 62, 0.05)',
          border: '1px solid #F0E6EC',
          padding: '16px',
          justifyContent: 'space-between',
        }}
      >
        <div
          style={{
            position: 'relative',
            flex: '1 1 220px',
            minWidth: 0,
            maxWidth: '440px',
          }}
        >
          <Search
            size={16}
            style={{
              position: 'absolute',
              left: '12px',
              top: '50%',
              transform: 'translateY(-50%)',
              color: '#A39BB3',
            }}
          />
          <input
            type="text"
            placeholder="Search your templates by name, product, or format..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{
              width: '100%',
              paddingLeft: '36px',
              paddingRight: '12px',
              paddingTop: '8px',
              paddingBottom: '8px',
              borderRadius: '10px',
              border: '1px solid #F0E6EC',
              fontSize: '0.84rem',
              color: '#2B253E',
              backgroundColor: '#FFFFFF',
              outline: 'none',
            }}
          />
        </div>

        {/* "Showing 5 of 12 of your own templates" — the doubled "of" came from
            appending the tail to a count that already read as "5 of 12".
            The number counted is `owned`, not the hook's `total`: `total` is
            every template on the server, whoever made it, and this gallery
            shows one person's own. There is no server-side owner filter to ask
            for that total, so the honest figure is the one we hold. */}
        <span style={{ fontSize: '0.8rem', color: '#6E6781' }}>
          Showing{' '}
          <strong style={{ fontWeight: 600, color: '#2B253E' }}>
            {mine.length}
          </strong>
          {mine.length === owned.length
            ? ` of your own ${owned.length === 1 ? 'template' : 'templates'}`
            : ` of your ${owned.length} ${owned.length === 1 ? 'template' : 'templates'}`}
        </span>
      </div>

      {isLoading ? (
        <SkeletonCardGrid count={6} label="Loading your templates" />
      ) : mine.length === 0 ? (
        <EmptyState
          title={
            owned.length === 0
              ? 'No templates of your own yet'
              : 'No templates match your search'
          }
          body={
            owned.length === 0
              ? 'Personalise a design from the template library and your own editable copy is saved here, ready to edit whenever you like.'
              : 'Nothing in your library matches that. Try a different name, product, or format.'
          }
          browseHref={owned.length === 0 ? browseHref : undefined}
        />
      ) : (
        <TemplateGrid>
          {mine.map((tpl, index) => (
            <TemplateCard
              key={tpl.id}
              tpl={tpl}
              index={index}
              actions={
                <PrimaryAction
                  onClick={() => router.push(`${basePath}/${tpl.id}/edit`)}
                >
                  <Pencil size={14} />
                  <span>Edit This Design</span>
                  <ArrowRight size={14} />
                </PrimaryAction>
              }
            />
          ))}
        </TemplateGrid>
      )}
    </div>
  )
}

function TemplateGrid({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="grid-auto"
      style={{ ['--min']: '210px' } as React.CSSProperties}
    >
      {children}
    </div>
  )
}

function EmptyState({
  title,
  body,
  browseHref,
}: {
  title: string
  body: string
  browseHref?: string
}) {
  return (
    <div
      style={{
        backgroundColor: '#FFFFFF',
        borderRadius: '14px',
        boxShadow:
          '0 1px 2px rgba(43, 37, 62, 0.04), 0 6px 16px rgba(43, 37, 62, 0.05)',
        border: '1px solid #F0E6EC',
        padding: '32px',
        textAlign: 'center',
      }}
    >
      <LayoutTemplate
        size={16}
        color="#A39BB3"
        style={{ margin: '0 auto 8px auto' }}
      />
      <h3
        style={{
          fontSize: '0.95rem',
          fontWeight: 700,
          color: '#2B253E',
          margin: 0,
        }}
      >
        {title}
      </h3>
      <p
        style={{
          fontSize: '0.84rem',
          color: '#A39BB3',
          lineHeight: 1.5,
          maxWidth: '440px',
          marginTop: '6px',
          marginLeft: 'auto',
          marginRight: 'auto',
          marginBottom: browseHref ? '16px' : 0,
        }}
      >
        {body}
      </p>
      {browseHref ? (
        <Link
          href={browseHref}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            padding: '8px 14px',
            borderRadius: '10px',
            backgroundColor: '#F73582',
            color: '#FFFFFF',
            fontSize: '0.82rem',
            fontWeight: 600,
            textDecoration: 'none',
          }}
        >
          Browse Template Library
          <ArrowRight size={14} />
        </Link>
      ) : null}
    </div>
  )
}

function TemplateCard({
  tpl,
  index,
  actions,
}: {
  tpl: TemplateRow
  index: number
  actions: React.ReactNode
}) {
  // The server's counts, because a listing carries no layers to count. Falling
  // back to the layers keeps a detail-shaped template — a freshly created one,
  // say — rendering correctly.
  const editableCount =
    tpl.editableFieldCount ??
    tpl.layers.filter((l) => l.isEditableBySiteUser).length

  const unit = tpl.dimensions.unit === 'in' ? '"' : ` ${tpl.dimensions.unit}`

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, delay: Math.min(index * 0.04, 0.3) }}
      style={{
        backgroundColor: '#FFFFFF',
        borderRadius: '14px',
        boxShadow:
          '0 1px 2px rgba(43, 37, 62, 0.04), 0 6px 16px rgba(43, 37, 62, 0.05)',
        border: '1px solid #F0E6EC',
        padding: '16px',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        gap: '12px',
      }}
    >
      {/* Visual Preview Header. A quiet ground frames the preview; the
          design's own canvas colour belongs to the mini-proof below, since an
          exported tile already carries it. */}
      <div
        style={{
          position: 'relative',
          width: '100%',
          aspectRatio: '16 / 10',
          backgroundColor: '#FCF7FA',
          borderRadius: '10px',
          overflow: 'hidden',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '12px',
        }}
      >
        {/* The tile the builder exported. Preferred over the mini-proof below:
            it is what was actually on the canvas — fonts, images and all —
            where the proof can only approximate boxes it has the layers for,
            and a listing row has none. */}
        {tpl.thumbnailUrl ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={tpl.thumbnailUrl}
            alt={`${tpl.name} preview`}
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'contain',
              borderRadius: '6px',
            }}
          />
        ) : tpl.layers.length === 0 ? (
          /* No tile and no layers to draw. Saying so beats an empty white
             rectangle that reads as a broken image. */
          <div
            style={{
              width: '100%',
              height: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: '6px',
              border: '1px dashed #F0E6EC',
              color: '#A39BB3',
              fontSize: '0.72rem',
              fontWeight: 500,
              textAlign: 'center',
              padding: '8px',
            }}
          >
            No preview yet — open the editor and save
          </div>
        ) : (
          <div
            style={{
              position: 'relative',
              width: '100%',
              height: '100%',
              borderRadius: '6px',
              overflow: 'hidden',
              backgroundColor: tpl.canvasConfig.backgroundColor,
              backgroundImage: tpl.canvasConfig.bgGradient || 'none',
            }}
          >
            {tpl.layers.map((l) => (
              <div
                key={l.id}
                style={{
                  position: 'absolute',
                  left: `${l.x}%`,
                  top: `${l.y}%`,
                  width: `${l.width}%`,
                  height: `${l.height}%`,
                  backgroundColor: l.style.backgroundColor || 'transparent',
                  color: l.style.color || '#ffffff',
                  fontSize: `${Math.max((l.style.fontSize || 14) * 0.45, 8)}px`,
                  fontWeight: l.style.fontWeight || 600,
                  overflow: 'hidden',
                  lineHeight: 1.2,
                  display: 'flex',
                  alignItems: 'center',
                }}
              >
                {l.type === 'text' && (
                  <span
                    style={{
                      width: '100%',
                      whiteSpace: 'nowrap',
                      textOverflow: 'ellipsis',
                      overflow: 'hidden',
                    }}
                  >
                    {l.content}
                  </span>
                )}
                {l.type === 'qrcode' && (
                  <span
                    style={{
                      backgroundColor: '#fff',
                      color: '#000',
                      padding: '2px',
                      fontSize: '7px',
                      fontWeight: 700,
                    }}
                  >
                    QR
                  </span>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Category / size pill */}
        <div
          style={{
            position: 'absolute',
            top: '8px',
            left: '8px',
            padding: '2px 8px',
            borderRadius: '9999px',
            fontSize: '0.7rem',
            fontWeight: 600,
            backgroundColor: '#F5EEF2',
            color: '#5C566E',
          }}
        >
          {tpl.category ? `${tpl.category} • ` : ''}
          {tpl.dimensions.width}
          {unit} × {tpl.dimensions.height}
          {unit}
        </div>

        {/* Status, not ownership: every row on this page is already yours, so
            what is worth saying is whether this copy is a draft or published. */}
        <div
          style={{
            position: 'absolute',
            top: '8px',
            right: '8px',
            padding: '2px 8px',
            borderRadius: '9999px',
            fontSize: '0.7rem',
            fontWeight: 600,
            backgroundColor: tpl.status === 'PUBLISHED' ? '#ECFDF5' : '#FFFBEB',
            color: tpl.status === 'PUBLISHED' ? '#3F9C68' : '#B45309',
          }}
        >
          {tpl.status}
        </div>
      </div>

      {/* Body */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '10px',
          flex: 1,
        }}
      >
        <div>
          <h3
            style={{
              fontSize: '0.95rem',
              fontWeight: 700,
              color: '#2B253E',
              letterSpacing: '-0.01em',
              margin: 0,
              lineHeight: 1.3,
              overflowWrap: 'anywhere',
            }}
          >
            {tpl.name}
          </h3>
          <p
            style={{
              fontSize: '0.76rem',
              color: '#A39BB3',
              margin: '3px 0 0 0',
            }}
          >
            {tpl.productName ? (
              <>
                Base Product:{' '}
                <strong style={{ fontWeight: 600, color: '#6E6781' }}>
                  {tpl.productName}
                </strong>
              </>
            ) : (
              'No base product'
            )}
            {tpl.sourceTemplateId ? ' · copied from the library' : ''}
          </p>
        </div>

        {tpl.description ? (
          <p
            style={{
              fontSize: '0.8rem',
              color: '#6E6781',
              lineHeight: 1.5,
              margin: 0,
            }}
          >
            {tpl.description}
          </p>
        ) : null}

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            flexWrap: 'wrap',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              fontSize: '0.76rem',
              color: '#6E6781',
            }}
          >
            <Unlock size={14} color="#A39BB3" />
            <span>{editableCount} customisable fields</span>
          </div>
        </div>

        {/* Actions */}
        <div
          style={{
            display: 'flex',
            gap: '8px',
            marginTop: 'auto',
            paddingTop: '2px',
          }}
        >
          {actions}
        </div>
      </div>
    </motion.div>
  )
}

function PrimaryAction({
  children,
  onClick,
  disabled,
}: {
  children: React.ReactNode
  onClick: () => void
  disabled?: boolean
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        flex: 1,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '6px',
        padding: '8px 14px',
        borderRadius: '10px',
        backgroundColor: '#F73582',
        color: '#FFFFFF',
        fontSize: '0.82rem',
        fontWeight: 600,
        border: 'none',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.5 : 1,
        transition: 'background-color 0.15s ease',
      }}
      onMouseEnter={(e) => {
        if (disabled) return
        e.currentTarget.style.backgroundColor = '#E02573'
      }}
      onMouseLeave={(e) => {
        if (disabled) return
        e.currentTarget.style.backgroundColor = '#F73582'
      }}
    >
      {children}
    </button>
  )
}
