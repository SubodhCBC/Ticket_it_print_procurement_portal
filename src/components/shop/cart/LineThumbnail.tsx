// src/components/shop/cart/LineThumbnail.tsx
'use client'

import { PRODUCT_PLACEHOLDER_IMAGE } from '@/services/data-source/api/product.mapper'
import Image from 'next/image'

/**
 * A line's picture: the buyer's finished front when the line carries one, else
 * the product's image.
 *
 * A design preview is shown whole on a tinted ground — cropping it would cut
 * off the wording the buyer is checking. A product photo still fills the tile.
 */
export function LineThumbnail({
  preview,
  src,
  alt,
  size = 56,
}: {
  preview?: string | null
  src?: string | null
  alt: string
  size?: number
}) {
  const isDesign = Boolean(preview)

  return (
    <div
      style={{
        position: 'relative',
        width: `${size}px`,
        height: `${size}px`,
        borderRadius: '10px',
        overflow: 'hidden',
        backgroundColor: isDesign ? '#FAF6F8' : '#FFFFFF',
        border: '1px solid #F0E6EC',
        flexShrink: 0,
      }}
    >
      <Image
        src={preview || src || PRODUCT_PLACEHOLDER_IMAGE}
        alt={alt}
        fill
        unoptimized
        sizes={`${size}px`}
        style={{
          objectFit: isDesign ? 'contain' : 'cover',
          padding: isDesign ? '3px' : 0,
        }}
      />
    </div>
  )
}
