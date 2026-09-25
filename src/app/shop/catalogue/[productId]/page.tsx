// src/app/shop/catalogue/[productId]/page.tsx
'use client'

import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import { useAuth } from '@/hooks/useAuth'
import { stockLabel } from '@/components/shop/stock-label'
import { findVariant } from '@/services/data-source/api/product.mapper'
import { getProductWithPricing } from '@/services/products.service'
import type { EffectiveProduct } from '@/types'
import {
  StockAvailability,
  SupersededNotice,
} from '@/components/shop/ProductAvailability'
import {
  ArrowLeft,
  Check,
  ShieldCheck,
  ShieldAlert,
  Download,
  Package,
  FileDown,
  Sparkles,
} from 'lucide-react'

/** The four personalisation fields share one label and one input style. */
const fieldLabel: React.CSSProperties = {
  display: 'block',
  fontSize: '0.78rem',
  fontWeight: 600,
  color: '#5C566E',
  marginBottom: '4px',
}

const fieldInput: React.CSSProperties = {
  width: '100%',
  padding: '8px 12px',
  borderRadius: '10px',
  border: '1px solid #F0E6EC',
  fontSize: '0.84rem',
  color: '#2B253E',
  backgroundColor: '#FFFFFF',
  outline: 'none',
}

/**
 * A logistics fact: grey label over its value. These were four tinted,
 * bordered tiles inside the product card; the dividers above and below the
 * row already group them.
 */
const specLabel: React.CSSProperties = {
  display: 'block',
  fontSize: '0.74rem',
  fontWeight: 500,
  color: '#A39BB3',
  marginBottom: '2px',
}

const specValue: React.CSSProperties = {
  fontSize: '0.84rem',
  fontWeight: 600,
  color: '#2B253E',
}

export default function ProductDetailPage() {
  const params = useParams()
  const { user } = useAuth()

  const productId = params?.productId as string
  const [product, setProduct] = useState<EffectiveProduct | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  /** Option name to chosen value, e.g. `{ Size: 'A2', Finish: 'Matte' }`. */
  const [chosenOptions, setChosenOptions] = useState<Record<string, string>>({})
  const [imageFailed, setImageFailed] = useState(false)

  // Dynamic Personalization state
  const [customBranchHeadline, setCustomBranchHeadline] = useState('')
  const [customPromoTag, setCustomPromoTag] = useState(
    'Spring Health & Wellness Campaign'
  )
  const [customPhone, setCustomPhone] = useState('+1 (212) 555-0199')
  const [customHours, setCustomHours] = useState('Mon-Sat 8AM-9PM')

  useEffect(() => {
    async function loadProduct() {
      if (!productId) return
      setIsLoading(true)
      try {
        const item = await getProductWithPricing(productId, user?.accountId)
        if (item) {
          setProduct(item)
          setImageFailed(false)
          setCustomBranchHeadline(user?.siteName || '')
        }
      } catch (err) {
        console.error('Failed to load product detail', err)
      } finally {
        setIsLoading(false)
      }
    }

    loadProduct()
  }, [productId, user?.accountId, user?.siteName])

  if (isLoading) {
    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '20px',
        }}
      >
        <div
          style={{
            width: '180px',
            height: '20px',
            borderRadius: '10px',
            backgroundColor: '#F5EEF2',
          }}
        />
        <div
          style={{
            height: '480px',
            borderRadius: '14px',
            backgroundColor: '#F5EEF2',
          }}
        />
      </div>
    )
  }

  if (!product) {
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
        <h3
          style={{
            fontSize: '0.95rem',
            fontWeight: 700,
            color: '#2B253E',
            margin: 0,
          }}
        >
          Product Not Found
        </h3>
        <p
          style={{
            fontSize: '0.84rem',
            color: '#A39BB3',
            lineHeight: 1.5,
            maxWidth: '440px',
            margin: '6px auto 16px',
          }}
        >
          The requested marketing asset does not exist or is not available for
          your site.
        </p>
        <Link
          href="/shop/catalogue"
          style={{
            padding: '8px 14px',
            borderRadius: '10px',
            backgroundColor: '#F73582',
            color: '#FFFFFF',
            fontSize: '0.82rem',
            fontWeight: 600,
            textDecoration: 'none',
            display: 'inline-block',
          }}
        >
          Return to Catalogue
        </Link>
      </div>
    )
  }

  const optionAxes = product.optionAxes ?? []
  const selectedVariant = findVariant(product, chosenOptions)

  const isAvailable = product.status === 'ACTIVE'
  const stock = stockLabel(product)
  const moq = product.moq || 1
  const multiple = product.orderMultiple || 1

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '20px',
      }}
    >
      {/* 1. Breadcrumbs */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '12px',
          flexWrap: 'wrap',
        }}
      >
        <Link
          href="/shop/catalogue"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            fontSize: '0.8rem',
            fontWeight: 600,
            color: '#6E6781',
            textDecoration: 'none',
          }}
        >
          <ArrowLeft size={14} />
          <span>Back to Asset Catalogue</span>
        </Link>

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            fontSize: '0.74rem',
            color: '#A39BB3',
            fontFamily: 'monospace',
          }}
        >
          <span>ID: {product.id}</span>
          <span>•</span>
          <span>SKU: {product.sku}</span>
        </div>
      </div>

      {/* 2. Main Product Hero */}
      <div
        style={{
          backgroundColor: '#FFFFFF',
          borderRadius: '14px',
          boxShadow:
            '0 1px 2px rgba(43, 37, 62, 0.04), 0 6px 16px rgba(43, 37, 62, 0.05)',
          border: '1px solid #F0E6EC',
          overflow: 'hidden',
          display: 'grid',
          gridTemplateColumns: 'minmax(300px, 5fr) minmax(360px, 7fr)',
          gap: 0,
        }}
      >
        {/* Left Column: Image */}
        <div
          style={{
            backgroundColor: '#FCF7FA',
            padding: '24px',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            alignItems: 'center',
            borderRight: '1px solid #F5EEF2',
            position: 'relative',
          }}
        >
          <div
            style={{
              position: 'relative',
              width: '100%',
              maxWidth: '380px',
              aspectRatio: '1 / 1',
              borderRadius: '10px',
              overflow: 'hidden',
              backgroundColor: '#FFFFFF',
            }}
          >
            {product.thumbnailUrl && !imageFailed ? (
              <Image
                src={product.thumbnailUrl}
                alt={product.name}
                fill
                priority
                unoptimized
                sizes="(max-width: 768px) 100vw, 400px"
                onError={() => setImageFailed(true)}
                style={{
                  objectFit: 'cover',
                  filter: !isAvailable
                    ? 'grayscale(80%) contrast(85%)'
                    : 'none',
                }}
              />
            ) : (
              <div
                role="img"
                aria-label={`${product.name}: no picture`}
                style={{
                  position: 'absolute',
                  inset: 0,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#CFC6D6',
                  backgroundColor: '#FCF7FA',
                }}
              >
                <Package size={48} />
              </div>
            )}

            {/* Customization live overlay badge on preview */}
            {customBranchHeadline && (
              <div
                style={{
                  position: 'absolute',
                  bottom: '10px',
                  left: '10px',
                  right: '10px',
                  backgroundColor: 'rgba(15, 23, 42, 0.8)',
                  borderRadius: '10px',
                  padding: '8px 12px',
                  color: '#FFFFFF',
                  fontSize: '0.72rem',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    fontWeight: 600,
                    color: '#DCD3E0',
                  }}
                >
                  <Check size={12} />
                  Custom Template:
                </div>
                <div
                  style={{
                    fontWeight: 600,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {customBranchHeadline}
                </div>
                <div style={{ fontSize: '0.68rem', color: '#A39BB3' }}>
                  {customPromoTag}
                </div>
              </div>
            )}

            {!isAvailable && (
              <div
                style={{
                  position: 'absolute',
                  inset: 0,
                  backgroundColor: 'rgba(15, 23, 42, 0.45)',
                  backdropFilter: 'blur(2px)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: '16px',
                }}
              >
                <div
                  style={{
                    backgroundColor: '#FFFFFF',
                    borderRadius: '14px',
                    padding: '16px',
                    textAlign: 'center',
                    maxWidth: '280px',
                  }}
                >
                  <ShieldAlert
                    size={20}
                    color="#DC2626"
                    style={{ margin: '0 auto 8px auto' }}
                  />
                  <h4
                    style={{
                      fontSize: '0.9rem',
                      fontWeight: 700,
                      color: '#2B253E',
                      margin: 0,
                    }}
                  >
                    {product.status === 'SUPERSEDED'
                      ? 'Item Superseded'
                      : 'Item Unavailable'}
                  </h4>
                  <p
                    style={{
                      fontSize: '0.76rem',
                      color: '#6E6781',
                      margin: '4px 0 0',
                    }}
                  >
                    {product.status === 'SUPERSEDED'
                      ? 'This revision has been archived and replaced with an updated specification.'
                      : 'This asset is currently not available for site dispatch.'}
                  </p>
                  {product.status === 'SUPERSEDED' && product.supersededBy && (
                    <Link
                      href={`/shop/catalogue/${product.supersededBy.id}`}
                      style={{
                        display: 'inline-block',
                        marginTop: '8px',
                        fontSize: '0.8rem',
                        fontWeight: 600,
                        color: '#F73582',
                        textDecoration: 'none',
                      }}
                    >
                      View replacement: {product.supersededBy.sku} —{' '}
                      {product.supersededBy.name} &rarr;
                    </Link>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Details & Order Controls */}
        <div
          style={{
            padding: '24px',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            gap: '20px',
          }}
        >
          <div
            style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}
          >
            {/* Category & Status */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                flexWrap: 'wrap',
              }}
            >
              <span
                style={{
                  padding: '2px 8px',
                  borderRadius: '9999px',
                  fontSize: '0.7rem',
                  fontWeight: 600,
                  backgroundColor: '#F5EEF2',
                  color: '#5C566E',
                }}
              >
                {product.categoryName || 'Marketing Collateral'}
              </span>

              <span
                style={{
                  padding: '2px 8px',
                  borderRadius: '9999px',
                  fontSize: '0.7rem',
                  fontWeight: 600,
                  backgroundColor:
                    product.status === 'ACTIVE' ? '#ECFDF5' : '#FEF2F2',
                  color: product.status === 'ACTIVE' ? '#3F9C68' : '#DC2626',
                }}
              >
                {product.status === 'ACTIVE'
                  ? 'Approved for Site Orders'
                  : product.status}
              </span>

              <StockAvailability product={product} />

              <span
                style={{
                  fontFamily: 'monospace',
                  fontSize: '0.74rem',
                  color: '#A39BB3',
                  marginLeft: 'auto',
                }}
              >
                SKU: {product.sku}
              </span>
            </div>

            {/* Title */}
            <h1
              style={{
                fontSize: '1.25rem',
                fontWeight: 700,
                color: '#2B253E',
                letterSpacing: '-0.01em',
                lineHeight: 1.25,
                margin: 0,
              }}
            >
              {product.name}
            </h1>

            {/* Description */}
            <p
              style={{
                fontSize: '0.84rem',
                color: '#6E6781',
                lineHeight: 1.6,
                margin: 0,
              }}
            >
              {product.description}
            </p>

            {/* Logistics Specs Grid */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))',
                gap: '12px',
                padding: '14px 0',
                borderTop: '1px solid #F5EEF2',
                borderBottom: '1px solid #F5EEF2',
              }}
            >
              <div>
                <span style={specLabel}>Pack Size</span>
                <span style={specValue}>{product.packSize || '1 Unit'}</span>
              </div>
              <div>
                <span style={specLabel}>UOM</span>
                <span style={specValue}>{product.uom || 'EA'}</span>
              </div>
              <div>
                <span style={specLabel}>MOQ</span>
                <span style={specValue}>
                  {moq} {product.uom}
                </span>
              </div>
              <div>
                <span style={specLabel}>Order Multiple</span>
                <span style={specValue}>
                  {multiple > 1 ? `Multiples of ${multiple}` : 'Any Qty ≥ MOQ'}
                </span>
              </div>
              {stock && (
                <div>
                  <span style={specLabel}>Availability</span>
                  <span style={{ ...specValue, color: stock.color }}>
                    {stock.text}
                  </span>
                </div>
              )}
            </div>

            {/* Dynamic Template Personalization Tool. A section of the card
                rather than a pink panel inside it: the dividers either side
                already set it apart. */}
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '12px',
              }}
            >
              <div>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: '8px',
                    flexWrap: 'wrap',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                    }}
                  >
                    <Sparkles size={16} color="#A39BB3" />
                    <span
                      style={{
                        fontSize: '0.95rem',
                        fontWeight: 700,
                        color: '#2B253E',
                      }}
                    >
                      Personalize Marketing Asset Template
                    </span>
                  </div>
                  <span
                    style={{
                      fontSize: '0.7rem',
                      fontWeight: 600,
                      padding: '2px 8px',
                      borderRadius: '9999px',
                      backgroundColor: '#F5EEF2',
                      color: '#5C566E',
                    }}
                  >
                    Web-to-Print Ready
                  </span>
                </div>
                <p
                  style={{
                    fontSize: '0.76rem',
                    color: '#A39BB3',
                    margin: '3px 0 0',
                    lineHeight: 1.5,
                  }}
                >
                  Customize this asset with your branch details before
                  submission. Customized graphics are rendered and attached to
                  your order.
                </p>
              </div>

              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr',
                  gap: '12px',
                }}
              >
                <div>
                  <label style={fieldLabel}>Branch / Location Headline</label>
                  <input
                    type="text"
                    value={customBranchHeadline}
                    onChange={(e) => setCustomBranchHeadline(e.target.value)}
                    placeholder="e.g. Apex Midtown Central"
                    style={fieldInput}
                  />
                </div>

                <div>
                  <label style={fieldLabel}>Campaign Promo Tagline</label>
                  <input
                    type="text"
                    value={customPromoTag}
                    onChange={(e) => setCustomPromoTag(e.target.value)}
                    placeholder="e.g. Spring Health & Wellness Expo"
                    style={fieldInput}
                  />
                </div>

                <div>
                  <label style={fieldLabel}>Local Branch Phone</label>
                  <input
                    type="text"
                    value={customPhone}
                    onChange={(e) => setCustomPhone(e.target.value)}
                    placeholder="e.g. +1 (212) 555-0199"
                    style={fieldInput}
                  />
                </div>

                <div>
                  <label style={fieldLabel}>Operating Hours / Date Note</label>
                  <input
                    type="text"
                    value={customHours}
                    onChange={(e) => setCustomHours(e.target.value)}
                    placeholder="e.g. Mon-Sat 8AM-9PM"
                    style={fieldInput}
                  />
                </div>
              </div>
            </div>

            {/* Optional artwork / reference file (SOW F-10). Shown only when
                the product has one; the link is signed by the API. */}
            {product.artworkUrl && (
              <div
                style={{
                  paddingTop: '16px',
                  borderTop: '1px solid #F5EEF2',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '12px',
                  flexWrap: 'wrap',
                }}
              >
                <div
                  style={{ display: 'flex', alignItems: 'center', gap: '10px' }}
                >
                  <FileDown
                    size={16}
                    color="#A39BB3"
                    style={{ flexShrink: 0 }}
                  />
                  <div>
                    <div
                      style={{
                        fontSize: '0.84rem',
                        fontWeight: 600,
                        color: '#2B253E',
                      }}
                    >
                      Approved artwork & reference file
                    </div>
                    <div style={{ fontSize: '0.76rem', color: '#A39BB3' }}>
                      The file supplied for {product.sku}
                    </div>
                  </div>
                </div>

                <a
                  href={product.artworkUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '8px 14px',
                    borderRadius: '10px',
                    backgroundColor: '#FFFFFF',
                    border: '1px solid #F0E6EC',
                    color: '#2B253E',
                    fontSize: '0.82rem',
                    fontWeight: 600,
                    textDecoration: 'none',
                    whiteSpace: 'nowrap',
                  }}
                >
                  <Download size={14} />
                  <span>Download artwork</span>
                </a>
              </div>
            )}
          </div>

          {/* Configuration.

              The API models every axis the same way — a named list of values —
              and a product that declares any can only be ordered as one of its
              variants. */}
          {optionAxes.length > 0 && (
            <div
              style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}
            >
              <h3
                style={{
                  fontSize: '0.95rem',
                  fontWeight: 700,
                  color: '#2B253E',
                  margin: 0,
                }}
              >
                Choose your configuration
              </h3>

              {optionAxes.map((axis) => (
                <div
                  key={axis.id}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '6px',
                  }}
                >
                  <span
                    style={{
                      fontSize: '0.78rem',
                      fontWeight: 600,
                      color: '#5C566E',
                    }}
                  >
                    {axis.name}
                  </span>
                  <div
                    style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}
                  >
                    {axis.values.map((value) => {
                      const isChosen = chosenOptions[axis.name] === value
                      return (
                        <button
                          key={value}
                          type="button"
                          onClick={() =>
                            setChosenOptions((current) => ({
                              ...current,
                              [axis.name]: value,
                            }))
                          }
                          style={{
                            padding: '6px 12px',
                            borderRadius: '10px',
                            // The chosen value is the current state, so it takes
                            // the accent; weight stays put so nothing reflows.
                            border: isChosen
                              ? '1px solid #F73582'
                              : '1px solid #F0E6EC',
                            backgroundColor: '#FFFFFF',
                            color: isChosen ? '#F73582' : '#2B253E',
                            fontSize: '0.8rem',
                            fontWeight: 600,
                            cursor: 'pointer',
                            transition:
                              'border-color 0.15s ease, color 0.15s ease',
                          }}
                        >
                          {value}
                        </button>
                      )
                    })}
                  </div>
                </div>
              ))}

              {!selectedVariant && (
                <p
                  style={{
                    fontSize: '0.76rem',
                    color: '#B45309',
                    margin: 0,
                    fontWeight: 500,
                  }}
                >
                  {Object.keys(chosenOptions).length < optionAxes.length
                    ? 'Choose one value on every option to continue.'
                    : 'That combination is not available. Try another.'}
                </p>
              )}

              {selectedVariant && (
                <p style={{ fontSize: '0.76rem', color: '#6E6781', margin: 0 }}>
                  <strong style={{ fontWeight: 600, color: '#2B253E' }}>
                    {selectedVariant.sku}
                  </strong>
                  {' • '}
                  {selectedVariant.availableStock} available
                </p>
              )}
            </div>
          )}

          {/* Ordering Validation & CTA */}
          <div
            style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}
          >
            {isAvailable ? (
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '12px',
                }}
              >
                {/*
                  One way in, and it is the designs.

                  This used to be "Add to Cart" beside "Choose Template", which
                  offered a buyer a choice that no longer exists: a product on
                  its own has no price, because what a job costs is decided by
                  the design printed on it. So the only route to a basket runs
                  through a design, and this is the door to them.
                */}
                <Link
                  href={`/shop/templates?product=${product.id}`}
                  style={{
                    padding: '8px 14px',
                    borderRadius: '10px',
                    fontSize: '0.82rem',
                    fontWeight: 600,
                    cursor: 'pointer',
                    backgroundColor: '#F73582',
                    color: '#FFFFFF',
                    border: 'none',
                    transition: 'background-color 0.15s ease',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '6px',
                    textDecoration: 'none',
                  }}
                >
                  <Sparkles size={16} />
                  <span>Choose a design &amp; personalise &rarr;</span>
                </Link>

                <p
                  style={{
                    fontSize: '0.76rem',
                    color: '#A39BB3',
                    textAlign: 'center',
                    margin: 0,
                  }}
                >
                  Pick a design, make it yours, and its price is what you pay.
                </p>
              </div>
            ) : (
              <div
                style={{
                  padding: '14px 16px',
                  borderRadius: '10px',
                  backgroundColor: '#FCF7FA',
                  textAlign: 'center',
                }}
              >
                <p
                  style={{
                    fontSize: '0.84rem',
                    fontWeight: 600,
                    color: '#5C566E',
                    margin: 0,
                  }}
                >
                  Ordering Disabled for this Asset
                </p>
                <p
                  style={{
                    fontSize: '0.76rem',
                    color: '#6E6781',
                    margin: '4px 0 0 0',
                  }}
                >
                  This product is unavailable or superseded by an updated
                  marketing release.
                </p>
                {product.status === 'SUPERSEDED' && product.supersededBy && (
                  <div style={{ marginTop: '8px' }}>
                    <SupersededNotice supersededBy={product.supersededBy} />
                  </div>
                )}
              </div>
            )}

            {/* On-Account Reassurance */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                fontSize: '0.76rem',
                color: '#A39BB3',
                paddingTop: '4px',
              }}
            >
              <ShieldCheck
                size={16}
                color="#A39BB3"
                style={{ flexShrink: 0 }}
              />
              <span>
                Orders are processed on-account and consolidated into your
                monthly billing report. Zero credit card required.
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
