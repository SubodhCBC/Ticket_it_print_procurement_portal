// src/components/shop/ProductCard.tsx
'use client'

import { useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { motion } from 'framer-motion'
import { Eye, Tag, ShieldAlert, Palette, Package } from 'lucide-react'
import type { EffectiveProduct } from '@/types'
import { useTemplates } from '@/hooks/useTemplates'
import { stockLabel } from './stock-label'

interface ProductCardProps {
  product: EffectiveProduct
  index?: number
}

/**
 * A catalogue tile: what can be printed, not what it costs.
 *
 * Neither a price nor an "Add" button, and both absences are the same decision.
 * A product is no longer something a buyer can order — the design is, and the
 * design is what carries the price. So a tile's job is to get you to the
 * designs for this product, and quoting the stock's own price here would be
 * quoting a number nobody is ever charged.
 */
export function ProductCard({ product, index = 0 }: ProductCardProps) {
  const [isHovered, setIsHovered] = useState(false)
  // A tile with no picture says so, rather than borrowing a stock photo that
  // looks like the product and is not.
  const [imageFailed, setImageFailed] = useState(false)
  const showImage = Boolean(product.thumbnailUrl) && !imageFailed
  const stock = stockLabel(product)

  const isAvailable = product.status === 'ACTIVE'

  // The real number of published designs for this product.
  //
  // The tile used to render `product.templatesCount || 4`, and no API has ever
  // populated `templatesCount` — so every tile in the catalogue has always
  // claimed four designs, whatever it actually had. Asking for a single row and
  // reading the total is cheap, and now that the designs are the only way to
  // order the product, the count is the tile's most important number.
  const { total: designCountRaw, isLoading: designsLoading } = useTemplates({
    productId: product.id,
    status: 'PUBLISHED',
    pageSize: 1,
  })
  const designCount = designsLoading ? null : designCountRaw

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        duration: 0.2,
        delay: Math.min(index * 0.03, 0.3),
        ease: 'easeOut',
      }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '12px',
        padding: '16px',
        backgroundColor: isAvailable ? '#FFFFFF' : '#FCF7FA',
        borderRadius: '14px',
        // Hover darkens the hairline and nothing else: no lift, no shadow and
        // no zoom on the picture. A grid of tiles that each move under the
        // pointer reads as the page shifting.
        border:
          isHovered && isAvailable ? '1px solid #DCD3E0' : '1px solid #F0E6EC',
        transition: 'border-color 0.15s ease',
        overflow: 'hidden',
        opacity: isAvailable ? 1 : 0.85,
        height: '100%',
      }}
    >
      {/* 1. Thumbnail Container */}
      <div
        style={{
          position: 'relative',
          width: '100%',
          aspectRatio: '4 / 3',
          backgroundColor: '#FCF7FA',
          borderRadius: '10px',
          overflow: 'hidden',
        }}
      >
        <Link
          href={`/shop/catalogue/${product.id}`}
          style={{
            display: 'block',
            position: 'relative',
            width: '100%',
            height: '100%',
          }}
        >
          <div style={{ position: 'relative', width: '100%', height: '100%' }}>
            {showImage ? (
              <Image
                src={product.thumbnailUrl}
                alt={product.name}
                fill
                unoptimized
                sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 25vw"
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
                  width: '100%',
                  height: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#CFC6D6',
                }}
              >
                <Package size={36} />
              </div>
            )}
          </div>
        </Link>

        {/* Top Badges */}
        <div
          style={{
            position: 'absolute',
            top: '8px',
            left: '8px',
            right: '8px',
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            pointerEvents: 'none',
            zIndex: 2,
          }}
        >
          {/* Category Chip */}
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              padding: '2px 8px',
              borderRadius: '9999px',
              fontSize: '0.7rem',
              fontWeight: 600,
              backgroundColor: '#F5EEF2',
              color: '#5C566E',
            }}
          >
            {product.categoryName || 'Marketing Asset'}
          </span>

          {/* Status Badge */}
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'flex-end',
              gap: '4px',
            }}
          >
            {!isAvailable && (
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                  padding: '2px 8px',
                  borderRadius: '9999px',
                  fontSize: '0.7rem',
                  fontWeight: 600,
                  backgroundColor:
                    product.status === 'SUPERSEDED' ? '#FFFBEB' : '#FEF2F2',
                  color:
                    product.status === 'SUPERSEDED' ? '#B45309' : '#DC2626',
                }}
              >
                <ShieldAlert size={12} />
                {product.status === 'SUPERSEDED' ? 'Superseded' : 'Unavailable'}
              </span>
            )}

            {isAvailable &&
              product.isCustomPriced &&
              product.discountPct > 0 && (
                <span
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '3px',
                    padding: '2px 8px',
                    borderRadius: '9999px',
                    fontSize: '0.7rem',
                    fontWeight: 600,
                    backgroundColor: '#F73582',
                    color: '#FFFFFF',
                  }}
                >
                  <Tag size={10} />
                  {product.discountPct}% OFF
                </span>
              )}
          </div>
        </div>

        {/* Hover Quick View Button */}
        {isAvailable && isHovered && (
          <Link
            href={`/shop/catalogue/${product.id}`}
            style={{
              position: 'absolute',
              inset: 0,
              backgroundColor: 'rgba(15, 23, 42, 0.2)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 3,
              textDecoration: 'none',
            }}
          >
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '8px 14px',
                borderRadius: '10px',
                fontSize: '0.82rem',
                fontWeight: 600,
                backgroundColor: '#FFFFFF',
                color: '#2B253E',
              }}
            >
              <Eye size={14} />
              View Specs
            </span>
          </Link>
        )}
      </div>

      {/* 2. Content Details */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          flex: 1,
          justifyContent: 'space-between',
          gap: '12px',
        }}
      >
        <div>
          {/* SKU and Pack Size */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '8px',
              fontSize: '0.74rem',
              fontFamily: 'monospace',
              color: '#A39BB3',
              marginBottom: '6px',
            }}
          >
            <span>SKU: {product.sku}</span>
            <span
              style={{
                fontFamily: 'inherit',
                fontSize: '0.7rem',
                fontWeight: 600,
                color: '#5C566E',
                backgroundColor: '#F5EEF2',
                padding: '2px 8px',
                borderRadius: '9999px',
                whiteSpace: 'nowrap',
              }}
            >
              {product.packSize || `1 ${product.uom}`}
            </span>
          </div>

          {/* Product Title */}
          <Link
            href={`/shop/catalogue/${product.id}`}
            style={{
              fontWeight: 700,
              fontSize: '0.95rem',
              color: '#2B253E',
              letterSpacing: '-0.01em',
              textDecoration: 'none',
              display: '-webkit-box',
              WebkitLineClamp: 1,
              WebkitBoxOrient: 'vertical',
              overflow: 'hidden',
              lineHeight: 1.3,
            }}
          >
            {product.name}
          </Link>

          {/* Product Description */}
          <p
            style={{
              fontSize: '0.8rem',
              color: '#6E6781',
              margin: '4px 0 0',
              display: '-webkit-box',
              WebkitLineClamp: 2,
              WebkitBoxOrient: 'vertical',
              overflow: 'hidden',
              lineHeight: 1.45,
              minHeight: '2.9em',
            }}
          >
            {product.description}
          </p>
        </div>

        {/* Designs */}
        <div
          style={{
            paddingTop: '12px',
            borderTop: '1px solid #F5EEF2',
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
          }}
        >
          {isAvailable ? (
            <>
              <Link
                href={`/shop/templates?product=${product.id}`}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px',
                  padding: '8px 14px',
                  borderRadius: '10px',
                  backgroundColor: '#FFFFFF',
                  border: '1px solid #F0E6EC',
                  color: '#2B253E',
                  fontSize: '0.82rem',
                  fontWeight: 600,
                  textDecoration: 'none',
                  transition: 'background-color 0.15s ease',
                }}
              >
                <Palette size={14} />
                <span>
                  {designCount === null
                    ? 'Browse designs'
                    : designCount === 1
                      ? '1 design'
                      : `${designCount} designs`}{' '}
                  &rarr;
                </span>
              </Link>

              {stock && (
                <div
                  style={{
                    fontSize: '0.74rem',
                    fontWeight: 600,
                    color: stock.color,
                  }}
                >
                  {stock.text}
                </div>
              )}

              {/* Order rules mini pill */}
              {(product.moq > 1 || product.orderMultiple > 1) && (
                <div
                  style={{
                    fontSize: '0.74rem',
                    color: '#A39BB3',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                  }}
                >
                  <span>MOQ: {product.moq}</span>
                  {product.orderMultiple > 1 && (
                    <span>Multiple: {product.orderMultiple}</span>
                  )}
                </div>
              )}
            </>
          ) : (
            <div
              style={{
                padding: '8px',
                backgroundColor: '#F5EEF2',
                borderRadius: '10px',
                textAlign: 'center',
              }}
            >
              {product.status === 'SUPERSEDED' && product.supersededBy ? (
                <Link
                  href={`/shop/catalogue/${product.supersededBy.id}`}
                  style={{
                    fontSize: '0.76rem',
                    fontWeight: 600,
                    color: '#F73582',
                    textDecoration: 'none',
                  }}
                >
                  Replaced by {product.supersededBy.sku} &rarr;
                </Link>
              ) : (
                <span
                  style={{
                    fontSize: '0.76rem',
                    fontWeight: 500,
                    color: '#6E6781',
                  }}
                >
                  {product.status === 'SUPERSEDED'
                    ? 'Item superseded'
                    : 'Unavailable for ordering'}
                </span>
              )}
            </div>
          )}
        </div>
      </div>
    </motion.div>
  )
}
