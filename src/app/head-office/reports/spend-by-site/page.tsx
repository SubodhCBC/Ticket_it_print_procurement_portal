// src/app/head-office/reports/spend-by-site/page.tsx
'use client'

import { Skeleton as UiSkeleton } from '@/components/ui/Skeleton'
import Link from 'next/link'
import { motion } from 'framer-motion'
import { ChevronRight, TrendingUp, BarChart3, Building2 } from 'lucide-react'
import { useHODashboardKPIs } from '@/hooks/useHeadOffice'
import { useAuth } from '@/hooks/useAuth'
import { ReportDownloadButtons } from '@/components/reports/ReportDownloadButtons'
import { formatMoney, formatNumber } from '@/lib/format'

// ─── Period filter labels ────────────────────────────────────────────────────
/** The page's placeholder bar, drawn by the shared skeleton. */
function Skeleton({
  w = '100%',
  h = '1rem',
  br = '8px',
}: {
  w?: string
  h?: string
  br?: string
}) {
  return <UiSkeleton width={w} height={h} radius={br} />
}

// ─── SVG Bar Chart ────────────────────────────────────────────────────────────
function SiteBarChart({
  data,
}: {
  data: {
    siteName: string
    siteCode: string
    totalSpend: number
    ordersCount: number
  }[]
}) {
  if (!data.length) return null
  const maxSpend = Math.max(...data.map((d) => d.totalSpend), 1)
  // One accent, not a colour per bar. The first site is the one the cards
  // below badge as the top site, so it takes the pink and the rest sit back
  // in grey as context; five hues said nothing the bar heights didn't.
  const H = 220,
    barWidth = 60,
    gap = 32,
    PAD_X = 40,
    PAD_Y = 24
  const totalWidth = PAD_X * 2 + data.length * (barWidth + gap) - gap

  return (
    <svg
      viewBox={`0 0 ${totalWidth} ${H + 64}`}
      style={{
        width: '100%',
        minWidth: `${totalWidth}px`,
        height: `${H + 64}px`,
      }}
    >
      {/* Grid lines */}
      {[0, 0.25, 0.5, 0.75, 1].map((pct) => {
        const y = PAD_Y + (1 - pct) * H
        return (
          <g key={pct}>
            <line
              x1={PAD_X - 8}
              y1={y}
              x2={totalWidth - PAD_X + 8}
              y2={y}
              stroke="#F5EEF2"
              strokeWidth="1"
            />
            <text
              x={PAD_X - 12}
              y={y + 4}
              textAnchor="end"
              fontSize="9"
              fill="#A39BB3"
              fontFamily="inherit"
            >
              ${Math.round((maxSpend * pct) / 1000)}k
            </text>
          </g>
        )
      })}
      {/* Bars */}
      {data.map((d, i) => {
        const x = PAD_X + i * (barWidth + gap)
        const barH = (d.totalSpend / maxSpend) * H
        const y = PAD_Y + H - barH
        const isTop = i === 0
        return (
          <g key={d.siteCode}>
            {/* Bar fill */}
            {/* `initial` rather than static `y`/`height` props: animating an
                SVG attribute the component never declared a starting value for
                leaves framer-motion writing `height="undefined"` on the first
                frame, which the browser rejects. */}
            <motion.rect
              x={x}
              width={barWidth}
              rx="4"
              fill={isTop ? '#F73582' : '#DCD3E0'}
              initial={{ y: PAD_Y + H, height: 0 }}
              animate={{ y, height: barH }}
              transition={{ duration: 0.2, delay: i * 0.04, ease: 'easeOut' }}
            />
            {/* Value label */}
            <motion.text
              x={x + barWidth / 2}
              y={y - 8}
              textAnchor="middle"
              fontSize="10"
              fill={isTop ? '#2B253E' : '#6E6781'}
              fontWeight="600"
              fontFamily="inherit"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.2, delay: i * 0.04 + 0.2 }}
            >
              ${(d.totalSpend / 1000).toFixed(1)}k
            </motion.text>
            {/* Site code label */}
            <text
              x={x + barWidth / 2}
              y={PAD_Y + H + 20}
              textAnchor="middle"
              fontSize="8"
              fill="#2B253E"
              fontWeight="600"
              fontFamily="inherit"
            >
              {d.siteCode.split('-').slice(0, 2).join('-')}
            </text>
            <text
              x={x + barWidth / 2}
              y={PAD_Y + H + 33}
              textAnchor="middle"
              fontSize="7.5"
              fill="#A39BB3"
              fontFamily="inherit"
            >
              {formatNumber(d.ordersCount)}{' '}
              {d.ordersCount === 1 ? 'order' : 'orders'}
            </text>
          </g>
        )
      })}
    </svg>
  )
}

// ─── Trend Line ───────────────────────────────────────────────────────────────
function TrendLineChart({
  data,
}: {
  data: { month: string; spend: number; orders: number }[]
}) {
  if (!data.length) return null
  const maxSpend = Math.max(...data.map((d) => d.spend), 1)
  const W = 480,
    H = 100,
    PAD = 16
  const points = data.map((d, i) => ({
    x: PAD + (i / (data.length - 1)) * (W - 2 * PAD),
    y: H - PAD - (d.spend / maxSpend) * (H - 2 * PAD),
    ...d,
  }))
  const pathD = points
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`)
    .join(' ')
  const areaD = `${pathD} L ${points[points.length - 1].x} ${H - PAD} L ${points[0].x} ${H - PAD} Z`

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      style={{ width: '100%', height: '100%', overflow: 'visible' }}
    >
      {[0.5, 1].map((pct) => (
        <line
          key={pct}
          x1={PAD}
          y1={H - PAD - pct * (H - 2 * PAD)}
          x2={W - PAD}
          y2={H - PAD - pct * (H - 2 * PAD)}
          stroke="#F5EEF2"
          strokeWidth="1"
        />
      ))}
      {/* A flat fill under the line rather than a fading blue gradient, and a
          grey line with the latest month picked out in the accent: the month
          being read is the one that gets the colour. */}
      <motion.path
        d={areaD}
        fill="#FCF7FA"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.2 }}
      />
      <motion.path
        d={pathD}
        fill="none"
        stroke="#A39BB3"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        initial={{ pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ duration: 0.3, ease: 'easeOut' }}
      />
      {points.map((p, i) => {
        const isCurrent = i === points.length - 1
        return (
          <g key={i}>
            <circle
              cx={p.x}
              cy={p.y}
              r="3.5"
              fill={isCurrent ? '#F73582' : '#A39BB3'}
              stroke="#FFFFFF"
              strokeWidth="2"
            />
            <text
              x={p.x}
              y={H + 2}
              textAnchor="middle"
              fontSize="9"
              fill="#A39BB3"
              fontFamily="inherit"
              fontWeight="500"
            >
              {p.month}
            </text>
            <text
              x={p.x}
              y={p.y - 8}
              textAnchor="middle"
              fontSize="8.5"
              fill={isCurrent ? '#2B253E' : '#6E6781'}
              fontWeight="600"
              fontFamily="inherit"
            >
              ${(p.spend / 1000).toFixed(1)}k
            </text>
          </g>
        )
      })}
    </svg>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function HOSpendInsightsPage() {
  const { user } = useAuth()
  // The account the signed-in user belongs to. The API scopes every
  // head-office read to it anyway; this is what the screen asks about.
  const { data: kpis, isLoading } = useHODashboardKPIs(user?.accountId ?? '')

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '20px',
      }}
    >
      {/* Header, with the breadcrumb over the title */}
      <div style={{ minWidth: 0 }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
            marginBottom: '6px',
            fontSize: '0.76rem',
            color: '#A39BB3',
          }}
        >
          <Link
            href="/head-office/dashboard"
            style={{
              color: '#A39BB3',
              textDecoration: 'none',
              fontWeight: 500,
            }}
          >
            Dashboard
          </Link>
          <ChevronRight size={12} />
          <span style={{ color: '#6E6781', fontWeight: 500 }}>
            Spend Insights
          </span>
        </div>
        <h1
          style={{
            fontSize: '1.25rem',
            fontWeight: 700,
            color: '#2B253E',
            letterSpacing: '-0.01em',
            margin: 0,
          }}
        >
          Spend by site
        </h1>
        <p style={{ fontSize: '0.8rem', color: '#6E6781', margin: '4px 0 0' }}>
          {isLoading
            ? '...'
            : `${kpis?.accountName} — what each of your sites spent`}
        </p>
        {/* Every branch, not the twenty the strip below shows. */}
        <div style={{ marginTop: '10px' }}>
          <ReportDownloadButtons report="spend/by-site" label="Spend by site" />
        </div>
      </div>

      {/* KPI Row */}
      <div
        className="grid-auto"
        style={{ ['--min']: '220px' } as React.CSSProperties}
      >
        {isLoading
          ? [0, 1, 2].map((i) => (
              <div
                key={i}
                style={{
                  backgroundColor: '#FFFFFF',
                  borderRadius: '14px',
                  boxShadow:
                    '0 1px 2px rgba(43, 37, 62, 0.04), 0 6px 16px rgba(43, 37, 62, 0.05)',
                  padding: '18px',
                  border: '1px solid #F0E6EC',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '10px',
                }}
              >
                <Skeleton h="0.7rem" w="50%" />
                <Skeleton h="1.5rem" w="75%" />
              </div>
            ))
          : [
              // Only the change carries a colour, because only there does the
              // colour mean something: up or down. The two amounts are plain.
              {
                label: 'Spend This Month',
                value: formatMoney(kpis?.totalSpendThisMonth ?? 0),
                color: '#2B253E',
              },
              {
                label: 'Spend Last Month',
                value: formatMoney(kpis?.totalSpendLastMonth ?? 0),
                color: '#2B253E',
              },
              {
                label: 'Month-on-Month Change',
                value: `${(kpis?.spendDeltaPct ?? 0) >= 0 ? '+' : ''}${kpis?.spendDeltaPct?.toFixed(1) ?? 0}%`,
                color: (kpis?.spendDeltaPct ?? 0) >= 0 ? '#3F9C68' : '#DC2626',
              },
            ].map((c, i) => (
              <motion.div
                key={c.label}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.2, delay: i * 0.04 }}
                style={{
                  backgroundColor: '#FFFFFF',
                  borderRadius: '14px',
                  boxShadow:
                    '0 1px 2px rgba(43, 37, 62, 0.04), 0 6px 16px rgba(43, 37, 62, 0.05)',
                  padding: '18px',
                  border: '1px solid #F0E6EC',
                }}
              >
                <div
                  style={{
                    fontSize: '0.78rem',
                    fontWeight: 500,
                    color: '#6E6781',
                  }}
                >
                  {c.label}
                </div>
                <div
                  style={{
                    marginTop: '12px',
                    fontSize: '1.5rem',
                    fontWeight: 700,
                    color: c.color,
                    letterSpacing: '-0.02em',
                    lineHeight: 1.1,
                  }}
                >
                  {c.value}
                </div>
              </motion.div>
            ))}
      </div>

      {/* Spend by Site Bar Chart */}
      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2 }}
        style={{
          backgroundColor: '#FFFFFF',
          borderRadius: '14px',
          boxShadow:
            '0 1px 2px rgba(43, 37, 62, 0.04), 0 6px 16px rgba(43, 37, 62, 0.05)',
          padding: '20px',
          border: '1px solid #F0E6EC',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            marginBottom: '16px',
          }}
        >
          <BarChart3 size={16} color="#A39BB3" />
          <h2
            style={{
              fontSize: '0.95rem',
              fontWeight: 700,
              color: '#2B253E',
              letterSpacing: '-0.01em',
              margin: 0,
            }}
          >
            Spend by Site — This Month
          </h2>
        </div>
        {isLoading ? (
          <div
            style={{
              display: 'flex',
              alignItems: 'flex-end',
              gap: '12px',
              height: '200px',
            }}
          >
            {[70, 50, 85, 40].map((h, i) => (
              <div
                key={i}
                style={{
                  flex: 1,
                  height: `${h}%`,
                  backgroundColor: '#F5EEF2',
                  borderRadius: '4px 4px 0 0',
                }}
              />
            ))}
          </div>
        ) : (
          <div className="table-scroll">
            <SiteBarChart data={kpis?.spendBySite ?? []} />
          </div>
        )}
      </motion.div>

      {/* 6-Month Trend */}
      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2 }}
        style={{
          backgroundColor: '#FFFFFF',
          borderRadius: '14px',
          boxShadow:
            '0 1px 2px rgba(43, 37, 62, 0.04), 0 6px 16px rgba(43, 37, 62, 0.05)',
          padding: '20px',
          border: '1px solid #F0E6EC',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            marginBottom: '16px',
          }}
        >
          <TrendingUp size={16} color="#A39BB3" />
          <h2
            style={{
              fontSize: '0.95rem',
              fontWeight: 700,
              color: '#2B253E',
              letterSpacing: '-0.01em',
              margin: 0,
            }}
          >
            6-Month Spend Trend
          </h2>
        </div>
        {isLoading ? (
          <div
            style={{
              height: '130px',
              display: 'flex',
              flexDirection: 'column',
              gap: '0.5rem',
            }}
          >
            <Skeleton h="90px" />
            <Skeleton h="0.7rem" w="80%" />
          </div>
        ) : (
          <div style={{ height: '145px', position: 'relative' }}>
            <TrendLineChart data={kpis?.spendTrend ?? []} />
          </div>
        )}
      </motion.div>

      {/* Site detail cards */}
      <div>
        <h2
          style={{
            fontSize: '0.95rem',
            fontWeight: 700,
            color: '#2B253E',
            letterSpacing: '-0.01em',
            margin: '0 0 12px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          }}
        >
          <Building2 size={16} color="#A39BB3" /> Site Performance — This Month
        </h2>
        <div
          className="grid-auto"
          style={{ ['--min']: '280px' } as React.CSSProperties}
        >
          {isLoading
            ? [0, 1, 2].map((i) => (
                <div
                  key={i}
                  style={{
                    backgroundColor: '#FFFFFF',
                    borderRadius: '14px',
                    boxShadow:
                      '0 1px 2px rgba(43, 37, 62, 0.04), 0 6px 16px rgba(43, 37, 62, 0.05)',
                    padding: '18px',
                    border: '1px solid #F0E6EC',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '10px',
                  }}
                >
                  <Skeleton h="0.75rem" w="70%" />
                  <Skeleton h="1.5rem" w="50%" />
                  <Skeleton h="0.7rem" w="60%" />
                </div>
              ))
            : kpis?.spendBySite?.map((s, i) => (
                // The top site is marked by its badge and its pink share bar,
                // not by a pink border and glow around the whole card.
                <motion.div
                  key={s.siteId}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.2, delay: i * 0.04 }}
                  style={{
                    backgroundColor: '#FFFFFF',
                    borderRadius: '14px',
                    boxShadow:
                      '0 1px 2px rgba(43, 37, 62, 0.04), 0 6px 16px rgba(43, 37, 62, 0.05)',
                    padding: '18px',
                    border: '1px solid #F0E6EC',
                    position: 'relative',
                    overflow: 'hidden',
                  }}
                >
                  {i === 0 && (
                    <div
                      style={{
                        position: 'absolute',
                        top: '16px',
                        right: '16px',
                        backgroundColor: '#F5EEF2',
                        color: '#5C566E',
                        borderRadius: '9999px',
                        padding: '2px 8px',
                        fontSize: '0.7rem',
                        fontWeight: 600,
                      }}
                    >
                      Top site
                    </div>
                  )}
                  <div
                    style={{
                      fontSize: '0.74rem',
                      fontWeight: 500,
                      color: '#A39BB3',
                      marginBottom: '4px',
                    }}
                  >
                    {s.siteCode}
                  </div>
                  <div
                    style={{
                      fontSize: '0.95rem',
                      fontWeight: 700,
                      color: '#2B253E',
                      marginBottom: '14px',
                    }}
                  >
                    {s.siteName}
                  </div>
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      marginBottom: '12px',
                    }}
                  >
                    <div>
                      <div
                        style={{
                          fontSize: '0.74rem',
                          color: '#A39BB3',
                          fontWeight: 500,
                        }}
                      >
                        Spend
                      </div>
                      <div
                        style={{
                          fontSize: '1.25rem',
                          fontWeight: 700,
                          color: '#2B253E',
                          letterSpacing: '-0.02em',
                        }}
                      >
                        {formatMoney(s.totalSpend)}
                      </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div
                        style={{
                          fontSize: '0.74rem',
                          color: '#A39BB3',
                          fontWeight: 500,
                        }}
                      >
                        Orders
                      </div>
                      <div
                        style={{
                          fontSize: '1.25rem',
                          fontWeight: 700,
                          color: '#2B253E',
                          letterSpacing: '-0.02em',
                        }}
                      >
                        {s.ordersCount}
                      </div>
                    </div>
                  </div>
                  <div
                    style={{
                      height: '6px',
                      backgroundColor: '#F5EEF2',
                      borderRadius: '9999px',
                      overflow: 'hidden',
                    }}
                  >
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${s.percentageOfTotal}%` }}
                      transition={{
                        duration: 0.3,
                        delay: i * 0.04,
                        ease: 'easeOut',
                      }}
                      style={{
                        height: '100%',
                        backgroundColor: i === 0 ? '#F73582' : '#DCD3E0',
                        borderRadius: '9999px',
                      }}
                    />
                  </div>
                  <div
                    style={{
                      fontSize: '0.76rem',
                      color: '#A39BB3',
                      marginTop: '6px',
                    }}
                  >
                    {s.percentageOfTotal.toFixed(1)}% of account total
                  </div>
                </motion.div>
              ))}
        </div>
      </div>

      <style>{`
        @keyframes shimmer { 0%{background-position:200% 0} 100%{background-position:-200% 0}}
      `}</style>
    </div>
  )
}
