// src/app/head-office/catalogue/page.tsx
'use client'

import { SkeletonCardGrid } from '@/components/ui/Skeleton'
import { useState } from 'react'
import Image from 'next/image'
import {
  Package,
  Search,
  Building2,
  Lock,
  LayoutTemplate,
  CheckCircle2,
} from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { useTemplates } from '@/hooks/useTemplates'
import { useProducts } from '@/hooks/useProducts'

export default function HeadOfficeCataloguePage() {
  const { user } = useAuth()
  const [selectedTab, setSelectedTab] = useState<'products' | 'templates'>(
    'products'
  )
  const [searchQuery, setSearchQuery] = useState('')

  const { data: productsData, isLoading: isProductsLoading } = useProducts({
    search: searchQuery || undefined,
  })

  const { data: templatesData, isLoading: isTemplatesLoading } = useTemplates({
    status: 'PUBLISHED',
    search: searchQuery || undefined,
  })

  const products = productsData?.items || []
  const templates = templatesData || []
  const isLoading = isProductsLoading || isTemplatesLoading

  if (isLoading) {
    return <SkeletonCardGrid count={8} label="Loading the catalogue" />
  }

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '20px',
      }}
    >
      {/* 1. Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-end',
          justifyContent: 'space-between',
          gap: '12px',
          flexWrap: 'wrap',
        }}
      >
        <div style={{ minWidth: 0 }}>
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              marginBottom: '6px',
              fontSize: '0.76rem',
              fontWeight: 500,
              color: '#A39BB3',
            }}
          >
            <Building2 size={14} />
            <span>
              {user?.organization ?? 'Your account'} • Head Office Governance
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
            Corporate Approved Print Catalogue & Templates
          </h1>

          <p
            style={{ fontSize: '0.8rem', color: '#6E6781', margin: '4px 0 0' }}
          >
            Read-only master view of approved marketing collateral, materials,
            rate cards, and design templates available to branch sites.
          </p>
        </div>

        {/* Read-Only Badge */}
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '3px 10px',
              borderRadius: '9999px',
              backgroundColor: '#F5EEF2',
              color: '#5C566E',
              fontSize: '0.72rem',
              fontWeight: 600,
            }}
          >
            <Lock size={12} color="#6E6781" />
            <span>Read-Only Oversight Access</span>
          </div>
        </div>
      </div>

      {/* 2. Tab Switcher & Search. A plain row rather than a card: these are
          the controls for the grid below, not content of their own. */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '12px',
        }}
      >
        <div style={{ display: 'flex', gap: '4px' }}>
          <button
            onClick={() => setSelectedTab('products')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '8px 14px',
              borderRadius: '10px',
              border: `1px solid ${selectedTab === 'products' ? '#F0E6EC' : 'transparent'}`,
              fontSize: '0.82rem',
              fontWeight: 600,
              cursor: 'pointer',
              backgroundColor:
                selectedTab === 'products' ? '#FFFFFF' : 'transparent',
              color: selectedTab === 'products' ? '#F73582' : '#6E6781',
            }}
          >
            <Package size={16} />
            Print Products ({products.length})
          </button>

          <button
            onClick={() => setSelectedTab('templates')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '8px 14px',
              borderRadius: '10px',
              border: `1px solid ${selectedTab === 'templates' ? '#F0E6EC' : 'transparent'}`,
              fontSize: '0.82rem',
              fontWeight: 600,
              cursor: 'pointer',
              backgroundColor:
                selectedTab === 'templates' ? '#FFFFFF' : 'transparent',
              color: selectedTab === 'templates' ? '#F73582' : '#6E6781',
            }}
          >
            <LayoutTemplate size={16} />
            Master Templates ({templates.length})
          </button>
        </div>

        <div
          style={{ position: 'relative', minWidth: '280px', maxWidth: '400px' }}
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
            placeholder="Search items by name or SKU..."
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
      </div>

      {/* 3. Content Display */}
      {selectedTab === 'products' ? (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
            gap: '20px',
          }}
        >
          {products.map((prod) => (
            <div
              key={prod.id}
              style={{
                backgroundColor: '#FFFFFF',
                borderRadius: '14px',
                boxShadow:
                  '0 1px 2px rgba(43, 37, 62, 0.04), 0 6px 16px rgba(43, 37, 62, 0.05)',
                border: '1px solid #F0E6EC',
                overflow: 'hidden',
                display: 'flex',
                flexDirection: 'column',
              }}
            >
              <div
                style={{
                  position: 'relative',
                  width: '100%',
                  height: '180px',
                  backgroundColor: '#F5EEF2',
                }}
              >
                <Image
                  src={prod.thumbnailUrl}
                  alt={prod.name}
                  fill
                  unoptimized
                  style={{ objectFit: 'cover' }}
                />
                <div
                  style={{
                    position: 'absolute',
                    top: '10px',
                    left: '10px',
                    padding: '2px 8px',
                    borderRadius: '9999px',
                    backgroundColor: '#FFFFFF',
                    color: '#5C566E',
                    fontSize: '0.7rem',
                    fontWeight: 600,
                  }}
                >
                  {prod.categoryName || 'Print Collateral'}
                </div>
              </div>

              <div
                style={{
                  padding: '16px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '6px',
                  flex: 1,
                }}
              >
                <div
                  style={{
                    fontSize: '0.74rem',
                    color: '#A39BB3',
                    fontWeight: 500,
                  }}
                >
                  SKU: {prod.sku}
                </div>
                <h3
                  style={{
                    fontSize: '0.95rem',
                    fontWeight: 700,
                    color: '#2B253E',
                    margin: 0,
                  }}
                >
                  {prod.name}
                </h3>
                <p
                  style={{
                    fontSize: '0.8rem',
                    color: '#6E6781',
                    lineHeight: 1.45,
                    margin: 0,
                  }}
                >
                  {prod.description}
                </p>

                <div
                  style={{
                    marginTop: 'auto',
                    borderTop: '1px solid #F5EEF2',
                    paddingTop: '12px',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                  }}
                >
                  {/*
                    No price. A product is stock, and what a job costs is set by
                    the design printed on it — so the price lives on the design
                    and this card shows what the stock actually is instead.
                  */}
                  <div>
                    <span
                      style={{
                        fontSize: '0.74rem',
                        color: '#A39BB3',
                        display: 'block',
                      }}
                    >
                      Supplied as
                    </span>
                    <strong
                      style={{
                        fontSize: '0.84rem',
                        fontWeight: 600,
                        color: '#2B253E',
                      }}
                    >
                      {prod.packSize || '1'} per {prod.uom || 'unit'}
                    </strong>
                  </div>
                  <span
                    style={{
                      fontSize: '0.7rem',
                      fontWeight: 600,
                      padding: '2px 8px',
                      borderRadius: '9999px',
                      backgroundColor: '#F5EEF2',
                      color: '#5C566E',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    MOQ {prod.moq}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
            gap: '20px',
          }}
        >
          {templates.map((tpl) => (
            <div
              key={tpl.id}
              style={{
                backgroundColor: '#FFFFFF',
                borderRadius: '14px',
                boxShadow:
                  '0 1px 2px rgba(43, 37, 62, 0.04), 0 6px 16px rgba(43, 37, 62, 0.05)',
                border: '1px solid #F0E6EC',
                overflow: 'hidden',
                display: 'flex',
                flexDirection: 'column',
              }}
            >
              <div
                style={{
                  position: 'relative',
                  width: '100%',
                  aspectRatio: '16 / 10',
                  backgroundColor: tpl.canvasConfig.backgroundColor,
                  backgroundImage: tpl.canvasConfig.bgGradient || 'none',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: '16px',
                }}
              >
                <div
                  style={{
                    position: 'relative',
                    width: '100%',
                    height: '100%',
                    borderRadius: '4px',
                    overflow: 'hidden',
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
                        color: l.style.color || '#ffffff',
                        fontSize: `${Math.max((l.style.fontSize || 14) * 0.4, 8)}px`,
                        fontWeight: l.style.fontWeight || 600,
                        overflow: 'hidden',
                        display: 'flex',
                        alignItems: 'center',
                      }}
                    >
                      {l.type === 'text' && (
                        <span
                          style={{
                            whiteSpace: 'nowrap',
                            textOverflow: 'ellipsis',
                            overflow: 'hidden',
                          }}
                        >
                          {l.content}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              <div
                style={{
                  padding: '16px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '6px',
                  flex: 1,
                }}
              >
                {/* Approval is the one status on the card, so it keeps its
                    green; the check glyph became an icon. */}
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    fontSize: '0.74rem',
                    color: '#3F9C68',
                    fontWeight: 600,
                  }}
                >
                  <CheckCircle2 size={13} />
                  Approved Brand Master ({tpl.category})
                </div>
                <h3
                  style={{
                    fontSize: '0.95rem',
                    fontWeight: 700,
                    color: '#2B253E',
                    margin: 0,
                  }}
                >
                  {tpl.name}
                </h3>
                <p style={{ fontSize: '0.8rem', color: '#6E6781', margin: 0 }}>
                  Product: {tpl.productName}
                </p>

                <div
                  style={{
                    marginTop: 'auto',
                    borderTop: '1px solid #F5EEF2',
                    paddingTop: '12px',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: '8px',
                    fontSize: '0.76rem',
                    color: '#A39BB3',
                  }}
                >
                  <span>
                    Dimensions:{' '}
                    <strong style={{ fontWeight: 600, color: '#2B253E' }}>
                      {tpl.dimensions.width}&quot; × {tpl.dimensions.height}
                      &quot;
                    </strong>
                  </span>
                  <span style={{ color: '#6E6781', fontWeight: 600 }}>
                    {tpl.layers.filter((l) => l.isEditableBySiteUser).length}{' '}
                    Editable Fields
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
