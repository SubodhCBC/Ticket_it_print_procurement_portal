// src/components/ui/Skeleton.tsx

/**
 * Skeleton loading: the shape of what is coming, in place of a "Loading…" line.
 *
 * One set of pieces for the whole portal, so every screen loads the same way —
 * the same pale bars, the same slow shimmer. Each composite is shaped like the
 * thing it stands in for (a table, a grid of tiles, a detail page), so the page
 * does not jump when the data arrives.
 *
 * Accessibility: the wrapper is a polite status with a spoken label, and the
 * bars themselves are hidden from assistive technology. The shimmer stops for
 * anyone who has asked for reduced motion (see `.skeleton` in globals.css).
 */

const BASE = '#EDE4EA'

type Size = number | string

const px = (value: Size) => (typeof value === 'number' ? `${value}px` : value)

/** One bar or block. */
export function Skeleton({
  width = '100%',
  height = 12,
  radius = 6,
  circle = false,
  style,
}: {
  width?: Size
  height?: Size
  radius?: Size
  circle?: boolean
  style?: React.CSSProperties
}) {
  return (
    <span
      aria-hidden="true"
      className="skeleton"
      style={{
        display: 'block',
        width: px(width),
        height: px(height),
        borderRadius: circle ? '9999px' : px(radius),
        backgroundColor: BASE,
        flexShrink: 0,
        ...style,
      }}
    />
  )
}

/** The accessible wrapper every composite uses. */
export function SkeletonRegion({
  label = 'Loading',
  children,
  style,
}: {
  label?: string
  children: React.ReactNode
  style?: React.CSSProperties
}) {
  return (
    <div role="status" aria-live="polite" aria-busy="true" style={style}>
      <span style={visuallyHidden}>{label}</span>
      {children}
    </div>
  )
}

/** Lines of text, the last one shorter. */
export function SkeletonText({
  lines = 3,
  lineHeight = 10,
  gap = 8,
  lastWidth = '60%',
}: {
  lines?: number
  lineHeight?: number
  gap?: number
  lastWidth?: Size
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: px(gap) }}>
      {Array.from({ length: lines }, (_, i) => (
        <Skeleton
          key={i}
          height={lineHeight}
          width={i === lines - 1 && lines > 1 ? lastWidth : '100%'}
        />
      ))}
    </div>
  )
}

/** Rows of a table: a header band and `rows` lines of `columns` cells. */
export function SkeletonTable({
  rows = 6,
  columns = 5,
  label = 'Loading table',
  header = true,
  padding = '12px 20px',
}: {
  rows?: number
  columns?: number
  label?: string
  header?: boolean
  padding?: string
}) {
  // Uneven widths read as data rather than as a grid of identical bricks.
  const widths = ['70%', '45%', '85%', '55%', '40%', '65%', '50%', '75%']
  const template = `repeat(${columns}, minmax(0, 1fr))`

  return (
    <SkeletonRegion label={label}>
      {header && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: template,
            gap: '16px',
            padding,
          }}
        >
          {Array.from({ length: columns }, (_, c) => (
            <Skeleton key={c} height={8} width="50%" />
          ))}
        </div>
      )}
      {Array.from({ length: rows }, (_, r) => (
        <div
          key={r}
          style={{
            display: 'grid',
            gridTemplateColumns: template,
            gap: '16px',
            alignItems: 'center',
            padding,
            borderTop: '1px solid #F5EEF2',
          }}
        >
          {Array.from({ length: columns }, (_, c) => (
            <Skeleton
              key={c}
              height={c === 0 ? 12 : 10}
              width={widths[(r + c * 3) % widths.length]}
            />
          ))}
        </div>
      ))}
    </SkeletonRegion>
  )
}

/** The KPI tiles across the top of a dashboard. */
export function SkeletonStatCards({
  count = 4,
  label = 'Loading figures',
  minWidth = 200,
}: {
  count?: number
  label?: string
  minWidth?: number
}) {
  return (
    <SkeletonRegion
      label={label}
      style={{
        display: 'grid',
        gridTemplateColumns: `repeat(auto-fit, minmax(${minWidth}px, 1fr))`,
        gap: '14px',
      }}
    >
      {Array.from({ length: count }, (_, i) => (
        <div key={i} style={card}>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <Skeleton width="45%" height={10} />
            <Skeleton width={30} height={30} radius={8} />
          </div>
          <Skeleton width="60%" height={22} style={{ marginTop: '14px' }} />
          <Skeleton width="40%" height={9} style={{ marginTop: '10px' }} />
        </div>
      ))}
    </SkeletonRegion>
  )
}

/** A grid of tiles with a picture: products, templates, library files. */
export function SkeletonCardGrid({
  count = 8,
  minWidth = 220,
  imageRatio = '4 / 3',
  label = 'Loading items',
}: {
  count?: number
  minWidth?: number
  imageRatio?: string
  label?: string
}) {
  return (
    <SkeletonRegion
      label={label}
      style={{
        display: 'grid',
        gridTemplateColumns: `repeat(auto-fill, minmax(${minWidth}px, 1fr))`,
        gap: '16px',
      }}
    >
      {Array.from({ length: count }, (_, i) => (
        <div key={i} style={{ ...card, padding: '16px' }}>
          <Skeleton
            height="auto"
            radius={10}
            style={{ aspectRatio: imageRatio, maxWidth: '100%' }}
          />
          <Skeleton width="35%" height={9} style={{ marginTop: '14px' }} />
          <Skeleton width="80%" height={13} style={{ marginTop: '10px' }} />
          <div style={{ marginTop: '10px' }}>
            <SkeletonText lines={2} lineHeight={9} gap={6} />
          </div>
          <Skeleton height={32} radius={10} style={{ marginTop: '14px' }} />
        </div>
      ))}
    </SkeletonRegion>
  )
}

/** A stacked list: queue cards, invoices, grants, timeline entries. */
export function SkeletonList({
  count = 4,
  avatar = true,
  label = 'Loading list',
  bordered = true,
}: {
  count?: number
  avatar?: boolean
  label?: string
  bordered?: boolean
}) {
  return (
    <SkeletonRegion
      label={label}
      style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}
    >
      {Array.from({ length: count }, (_, i) => (
        <div
          key={i}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            padding: bordered ? '12px 14px' : '6px 0',
            borderRadius: '12px',
            border: bordered ? '1px solid #F0E6EC' : 'none',
            backgroundColor: bordered ? '#FFFFFF' : 'transparent',
          }}
        >
          {avatar && <Skeleton width={40} height={40} radius={10} />}
          <div style={{ flex: 1, minWidth: 0 }}>
            <Skeleton width={i % 2 ? '45%' : '60%'} height={12} />
            <Skeleton
              width={i % 2 ? '70%' : '35%'}
              height={9}
              style={{ marginTop: '8px' }}
            />
          </div>
          <Skeleton width={64} height={22} radius={9999} />
        </div>
      ))}
    </SkeletonRegion>
  )
}

/** A detail page: a heading, then a main card and a side card. */
export function SkeletonDetail({
  label = 'Loading details',
}: {
  label?: string
}) {
  return (
    <SkeletonRegion
      label={label}
      style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}
    >
      <div>
        <Skeleton width={220} height={20} />
        <Skeleton
          width={320}
          height={10}
          style={{ marginTop: '10px', maxWidth: '100%' }}
        />
      </div>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
          gap: '16px',
        }}
      >
        <div style={{ ...card, gridColumn: 'span 2' }}>
          <Skeleton width="30%" height={13} />
          <div style={{ marginTop: '16px' }}>
            <SkeletonText lines={5} />
          </div>
        </div>
        <div style={card}>
          <Skeleton width="45%" height={13} />
          <div style={{ marginTop: '16px' }}>
            <SkeletonText lines={4} />
          </div>
        </div>
      </div>
      <div style={{ ...card, padding: 0, overflow: 'hidden' }}>
        <SkeletonTable rows={3} columns={4} label="Loading lines" />
      </div>
    </SkeletonRegion>
  )
}

/** A form: label and field pairs. */
export function SkeletonForm({
  fields = 4,
  label = 'Loading form',
}: {
  fields?: number
  label?: string
}) {
  return (
    <SkeletonRegion
      label={label}
      style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}
    >
      {Array.from({ length: fields }, (_, i) => (
        <div key={i}>
          <Skeleton width={i % 2 ? '25%' : '35%'} height={9} />
          <Skeleton height={36} radius={10} style={{ marginTop: '8px' }} />
        </div>
      ))}
    </SkeletonRegion>
  )
}

/** Columns of cards, for the fulfilment board. */
export function SkeletonBoard({
  columns = 4,
  cards = 3,
  label = 'Loading board',
}: {
  columns?: number
  cards?: number
  label?: string
}) {
  return (
    <SkeletonRegion
      label={label}
      style={{
        display: 'grid',
        gridTemplateColumns: `repeat(${columns}, minmax(240px, 1fr))`,
        gap: '16px',
        overflowX: 'auto',
      }}
    >
      {Array.from({ length: columns }, (_, c) => (
        <div
          key={c}
          style={{
            backgroundColor: '#FCF7FA',
            borderRadius: '14px',
            padding: '12px',
            display: 'flex',
            flexDirection: 'column',
            gap: '10px',
          }}
        >
          <Skeleton width="50%" height={12} />
          {Array.from({ length: cards - (c % 2) }, (_, i) => (
            <div key={i} style={{ ...card, padding: '12px' }}>
              <Skeleton width="55%" height={11} />
              <Skeleton width="80%" height={9} style={{ marginTop: '8px' }} />
              <Skeleton width="35%" height={9} style={{ marginTop: '8px' }} />
            </div>
          ))}
        </div>
      ))}
    </SkeletonRegion>
  )
}

/** A chart or report area. */
export function SkeletonChart({
  height = 220,
  label = 'Loading chart',
}: {
  height?: number
  label?: string
}) {
  const bars = [55, 80, 40, 95, 70, 60, 85, 45, 75, 65]
  return (
    <SkeletonRegion label={label}>
      <div
        style={{
          height: `${height}px`,
          display: 'flex',
          alignItems: 'flex-end',
          gap: '10px',
          padding: '8px 4px 0',
        }}
      >
        {bars.map((h, i) => (
          <Skeleton key={i} height={`${h}%`} radius={6} style={{ flex: 1 }} />
        ))}
      </div>
    </SkeletonRegion>
  )
}

/** A design studio: toolbar, tool rail, canvas and properties panel. */
export function SkeletonStudio({
  label = 'Loading the studio',
  height = '72vh',
}: {
  label?: string
  height?: string
}) {
  return (
    <SkeletonRegion
      label={label}
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '12px',
        padding: '16px',
        height,
        minHeight: '420px',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        <Skeleton width={180} height={16} />
        <div style={{ flex: 1 }} />
        {[90, 70, 110].map((w) => (
          <Skeleton key={w} width={w} height={32} radius={10} />
        ))}
      </div>
      <div
        style={{
          flex: 1,
          display: 'grid',
          gridTemplateColumns: '56px minmax(0, 1fr) 260px',
          gap: '12px',
          minHeight: 0,
        }}
      >
        <div
          style={{
            ...card,
            padding: '10px',
            display: 'grid',
            gap: '10px',
            alignContent: 'start',
          }}
        >
          {Array.from({ length: 7 }, (_, i) => (
            <Skeleton key={i} height={34} radius={8} />
          ))}
        </div>
        <div
          style={{
            ...card,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: '#FCF7FA',
          }}
        >
          <Skeleton
            width="62%"
            height="78%"
            radius={4}
            style={{ backgroundColor: '#FFFFFF', border: '1px solid #F0E6EC' }}
          />
        </div>
        <div
          style={{
            ...card,
            display: 'flex',
            flexDirection: 'column',
            gap: '14px',
          }}
        >
          <Skeleton width="50%" height={12} />
          <SkeletonForm fields={4} label={label} />
        </div>
      </div>
    </SkeletonRegion>
  )
}

const card: React.CSSProperties = {
  backgroundColor: '#FFFFFF',
  border: '1px solid #F0E6EC',
  borderRadius: '14px',
  padding: '18px',
  minWidth: 0,
}

const visuallyHidden: React.CSSProperties = {
  position: 'absolute',
  width: '1px',
  height: '1px',
  padding: 0,
  margin: '-1px',
  overflow: 'hidden',
  clip: 'rect(0, 0, 0, 0)',
  whiteSpace: 'nowrap',
  border: 0,
}
