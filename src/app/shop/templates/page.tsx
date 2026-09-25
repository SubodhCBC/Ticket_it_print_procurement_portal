// src/app/shop/templates/page.tsx
'use client'

import { SkeletonCardGrid } from '@/components/ui/Skeleton'
import { useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { motion } from 'framer-motion'
import {
  LayoutTemplate,
  Search,
  ArrowRight,
  CheckCircle2,
  Unlock,
} from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { useTemplates } from '@/hooks/useTemplates'

const CATEGORIES = [
  'All',
  'Signs',
  'Posters',
  'Banners',
  'Flyers',
  'Business Cards',
]

export default function ShopTemplateGalleryPage() {
  const { user } = useAuth()
  const [selectedCategory, setSelectedCategory] = useState<string>('All')
  const [searchQuery, setSearchQuery] = useState<string>('')

  /**
   * Arrived from a product in the catalogue.
   *
   * That card offers "Browse Design Templates" and links here with the product
   * on the URL. Without reading it, following that link listed the whole
   * library — every other product's designs alongside the one being looked at —
   * and left the buyer to work out which was which.
   *
   * Read from the URL rather than held in state, so the link can be shared and
   * the back button behaves.
   */
  const productId = useSearchParams()?.get('product') ?? ''

  const { data: templates, isLoading } = useTemplates({
    category: selectedCategory === 'All' ? undefined : selectedCategory,
    productId: productId || undefined,
    status: 'PUBLISHED',
    search: searchQuery || undefined,
  })

  /** The product's name, taken from the designs themselves. */
  const productName = templates?.[0]?.productName || ''

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '20px',
      }}
    >
      {/* 1. Page header. The site chip and the two reassurances from the old
          banner stay, as the lead of the description and a line of grey meta. */}
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-end',
          justifyContent: 'space-between',
          gap: '12px',
          flexWrap: 'wrap',
        }}
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
            {productId
              ? productName
                ? `Designs For ${productName}`
                : 'Designs For This Product'
              : 'Design Template Library — Signs, Posters & Banners'}
          </h1>

          <p
            style={{
              fontSize: '0.8rem',
              color: '#6E6781',
              lineHeight: 1.5,
              margin: '4px 0 0',
            }}
          >
            <span style={{ fontWeight: 600, color: '#2B253E' }}>
              {user?.siteName
                ? `${user.siteName}${user.siteCode ? ` (${user.siteCode})` : ''}`
                : 'Your account'}
            </span>
            {' · '}
            Choose a pre-approved professional master template. Personalize your
            branch name, contact details, logo, and QR codes while adhering to
            strict brand design guidelines.
          </p>

          {/* Filtered by a product, and saying so. A gallery that has quietly
              hidden most of itself is one a buyer keeps searching in vain. */}
          {productId && (
            <Link
              href="/shop/templates"
              style={{
                display: 'inline-block',
                marginTop: '8px',
                fontSize: '0.8rem',
                fontWeight: 600,
                color: '#F73582',
                textDecoration: 'none',
              }}
            >
              ← Show every design in the library
            </Link>
          )}

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '16px',
              flexWrap: 'wrap',
              marginTop: '8px',
              fontSize: '0.76rem',
              color: '#A39BB3',
            }}
          >
            <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <CheckCircle2 size={14} color="#A39BB3" />
              Zero Site User Payment Required
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <CheckCircle2 size={14} color="#A39BB3" />
              Submitted Direct to Head Office for Approval
            </span>
          </div>
        </div>

        <Link
          href="/shop/catalogue"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            padding: '8px 14px',
            borderRadius: '10px',
            backgroundColor: '#FFFFFF',
            color: '#2B253E',
            border: '1px solid #F0E6EC',
            fontSize: '0.82rem',
            fontWeight: 600,
            textDecoration: 'none',
            whiteSpace: 'nowrap',
          }}
        >
          Browse Products Catalogue →
        </Link>
      </div>

      {/* 2. Filters & Search */}
      <div
        style={{
          backgroundColor: '#FFFFFF',
          borderRadius: '14px',
          boxShadow:
            '0 1px 2px rgba(43, 37, 62, 0.04), 0 6px 16px rgba(43, 37, 62, 0.05)',
          border: '1px solid #F0E6EC',
          padding: '16px',
          display: 'flex',
          flexDirection: 'column',
          gap: '12px',
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '12px',
          }}
        >
          <div
            style={{
              position: 'relative',
              flex: 1,
              minWidth: '260px',
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
              placeholder="Search templates by product, occasion, or format..."
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

          <span style={{ fontSize: '0.8rem', color: '#6E6781' }}>
            Showing{' '}
            <strong style={{ fontWeight: 600, color: '#2B253E' }}>
              {templates.length}
            </strong>{' '}
            published master templates
          </span>
        </div>

        {/* Categories */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            overflowX: 'auto',
            paddingBottom: '2px',
          }}
        >
          {CATEGORIES.map((cat) => {
            const isSelected = selectedCategory === cat
            return (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                style={{
                  padding: '5px 12px',
                  borderRadius: '9999px',
                  fontSize: '0.78rem',
                  fontWeight: 600,
                  whiteSpace: 'nowrap',
                  cursor: 'pointer',
                  border: 'none',
                  backgroundColor: isSelected ? '#F73582' : '#F5EEF2',
                  color: isSelected ? '#FFFFFF' : '#5C566E',
                  transition: 'background-color 0.15s ease, color 0.15s ease',
                }}
              >
                {cat}
              </button>
            )
          })}
        </div>
      </div>

      {/* 3. Templates Grid */}
      {isLoading ? (
        <SkeletonCardGrid count={6} label="Loading designs" />
      ) : templates.length === 0 ? (
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
            No Templates Found
          </h3>
          <p
            style={{
              fontSize: '0.84rem',
              color: '#A39BB3',
              lineHeight: 1.5,
              maxWidth: '440px',
              margin: '6px auto 0',
            }}
          >
            No published templates match your current filter. Try clearing your
            search.
          </p>
        </div>
      ) : (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
            gap: '16px',
          }}
        >
          {templates.map((tpl, index) => {
            const editableCount = tpl.layers.filter(
              (l) => l.isEditableBySiteUser
            ).length

            return (
              <motion.div
                key={tpl.id}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{
                  duration: 0.2,
                  delay: Math.min(index * 0.04, 0.3),
                }}
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
                {/* Visual Preview Header. A quiet ground frames the preview;
                    the design's own canvas colour belongs to the sketch below,
                    since a saved thumbnail already carries it. */}
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
                  {/* The saved thumbnail first, the sketch only as a fallback.

                      The sketch below draws text and a QR box and nothing else,
                      so a design whose artwork is a photograph - or a shape, or
                      anything masked - renders as an empty card. Every template
                      saved through the builder carries a picture of its own
                      canvas; that is the honest preview, and this is a gallery
                      of previews. */}
                  {tpl.thumbnailUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={tpl.thumbnailUrl}
                      alt={tpl.name}
                      style={{
                        width: '100%',
                        height: '100%',
                        objectFit: 'contain',
                        borderRadius: '6px',
                      }}
                    />
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
                            backgroundColor:
                              l.style.backgroundColor || 'transparent',
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
                    {tpl.category} • {tpl.dimensions.width}&quot; ×{' '}
                    {tpl.dimensions.height}&quot;
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
                      Base Product:{' '}
                      <strong style={{ fontWeight: 600, color: '#6E6781' }}>
                        {tpl.productName}
                      </strong>
                    </p>
                  </div>

                  {/*
                    The price, which belongs to the design rather than to the
                    product it prints on — so this tile is the first place in
                    the whole storefront a buyer sees one.
                  */}
                  {tpl.price != null && tpl.unitsPerPack ? (
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'baseline',
                        gap: '8px',
                      }}
                    >
                      <span
                        style={{
                          fontSize: '1.1rem',
                          fontWeight: 700,
                          color: '#2B253E',
                          letterSpacing: '-0.01em',
                        }}
                      >
                        ${tpl.price.toFixed(2)}
                      </span>
                      <span style={{ fontSize: '0.74rem', color: '#A39BB3' }}>
                        ${(tpl.price / tpl.unitsPerPack).toFixed(2)} each /{' '}
                        {tpl.unitsPerPack} units
                      </span>
                    </div>
                  ) : null}

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

                  {/* Grey meta rather than a green pill: it describes the
                      design, it is not a status, and at tile width the pill
                      wrapped into a two-line lozenge. */}
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: '6px',
                      fontSize: '0.76rem',
                      color: '#6E6781',
                      lineHeight: 1.4,
                    }}
                  >
                    <Unlock
                      size={14}
                      color="#A39BB3"
                      style={{ flexShrink: 0, marginTop: '1px' }}
                    />
                    <span>
                      {editableCount} Customizable Fields (Logo, Phone, Text,
                      QR)
                    </span>
                  </div>

                  {/* Button */}
                  <Link
                    href={`/shop/templates/customize/${tpl.id}`}
                    style={{
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
                      textDecoration: 'none',
                      marginTop: 'auto',
                      transition: 'background-color 0.15s ease',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.backgroundColor = '#E02573'
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.backgroundColor = '#F73582'
                    }}
                  >
                    <span>Customize This Design</span>
                    <ArrowRight size={14} />
                  </Link>
                </div>
              </motion.div>
            )
          })}
        </div>
      )}
    </div>
  )
}
