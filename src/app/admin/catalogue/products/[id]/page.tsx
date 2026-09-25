// src/app/admin/catalogue/products/[id]/page.tsx
'use client'

import { SkeletonDetail } from '@/components/ui/Skeleton'
import { useState } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { ArrowLeft, Package, Edit3 } from 'lucide-react'
import { AdminHeader } from '@/components/admin/AdminHeader'
import { StatusPill } from '@/components/admin/StatusPill'
import { ProductEditModal } from '@/components/admin/ProductEditModal'
import { ProductOptionPricingEditor } from '@/components/admin/ProductOptionPricingEditor'
import { ProductLifecycleActions } from '@/components/admin/ProductLifecycleActions'
import { ProductStockPanel } from '@/components/admin/ProductStockPanel'
import { ProductVariantsPanel } from '@/components/admin/ProductVariantsPanel'
import { ProductVolumeTiersEditor } from '@/components/admin/ProductVolumeTiersEditor'
import { ProductVisibilityPanel } from '@/components/admin/ProductVisibilityPanel'
import { ProductAssetsPanel } from '@/components/admin/ProductAssetsPanel'
import {
  ActionButton,
  AdminCard,
  AdminTabs,
  ReadOnlyNotice,
  StateBlock,
} from '@/components/admin/ProductAdminUi'
import { errorMessage, formatMoney } from '@/components/admin/ProductAdminUtils'
import { useAuth } from '@/hooks/useAuth'
import {
  useAdminProduct,
  useProductCategories,
  useProductMutations,
} from '@/hooks/useProducts'
import type { Product } from '@/types'

type Tab =
  'overview' | 'variants' | 'pricing' | 'inventory' | 'visibility' | 'assets'

function Attribute({
  label,
  children,
  mono = false,
}: {
  label: string
  children: React.ReactNode
  mono?: boolean
}) {
  return (
    <div style={{ paddingTop: '12px', borderTop: '1px solid #F5EEF2' }}>
      <div style={{ fontSize: '0.76rem', color: '#A39BB3', fontWeight: 500 }}>
        {label}
      </div>
      <div
        style={{
          fontSize: '0.9rem',
          fontWeight: 600,
          color: '#2B253E',
          marginTop: '4px',
          ...(mono ? { fontFamily: 'monospace' } : {}),
        }}
      >
        {children}
      </div>
    </div>
  )
}

export default function ProductDetailPage() {
  const params = useParams()
  const router = useRouter()
  const productId = (params.id as string) || ''

  const { hasPermission } = useAuth()
  const canManage = hasPermission('CATALOG_MANAGE')
  const canPrice = hasPermission('PRICING_MANAGE')
  const canStock = hasPermission('INVENTORY_MANAGE')

  const { product, view, isLoading, error, refetch } =
    useAdminProduct(productId)
  const { categories } = useProductCategories()
  const { updateProduct } = useProductMutations()

  const [tab, setTab] = useState<Tab>('overview')
  const [isEditOpen, setIsEditOpen] = useState(false)

  // The modal shows its own error and closes on success; the mutation
  // invalidates `['products']`, which refreshes this page's query too.
  const handleSave = async (data: Omit<Product, 'id'> | Partial<Product>) => {
    await updateProduct(productId, data)
  }

  if (isLoading) {
    return (
      <>
        <AdminHeader title="Product Details" />
        <main style={{ padding: '24px' }}>
          <SkeletonDetail label="Loading product" />
        </main>
      </>
    )
  }

  if (error && !view) {
    return (
      <>
        <AdminHeader title="Product Details" />
        <main style={{ padding: '24px' }}>
          <AdminCard>
            <StateBlock
              tone="error"
              title="The product could not be loaded"
              description={errorMessage(error, 'Try again in a moment.')}
            />
            <div style={{ display: 'flex', justifyContent: 'center' }}>
              <ActionButton onClick={() => void refetch()}>Retry</ActionButton>
            </div>
          </AdminCard>
        </main>
      </>
    )
  }

  if (!product || !view) {
    return (
      <>
        <AdminHeader title="Product Not Found" />
        <main style={{ padding: '24px', textAlign: 'center' }}>
          <StateBlock
            icon={<Package size={20} color="#DCD3E0" />}
            title="Product was not found"
            description="It may have been deleted, or you may not have access to it."
          />
          <Link
            href="/admin/catalogue/products"
            style={{ color: '#F73582', fontSize: '0.8rem', fontWeight: 600 }}
          >
            ← Back to Catalogue
          </Link>
        </main>
      </>
    )
  }

  const optionsKey = view.options
    .map((option) => `${option.name}=${option.values.join(',')}`)
    .join(';')

  return (
    <>
      <AdminHeader
        title={product.name}
        subtitle={`SKU: ${product.sku} • Category: ${view.category.name}`}
        actionButton={
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Link
              href="/admin/catalogue/products"
              style={{
                display: 'flex',
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
              }}
            >
              <ArrowLeft size={16} />
              <span>Back</span>
            </Link>
            {canManage && (
              <ActionButton
                variant="primary"
                icon={<Edit3 size={16} />}
                disabled={view.status === 'SUPERSEDED'}
                title={
                  view.status === 'SUPERSEDED'
                    ? 'A superseded product cannot be edited'
                    : undefined
                }
                onClick={() => setIsEditOpen(true)}
              >
                Edit Attributes
              </ActionButton>
            )}
          </div>
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
        <AdminTabs<Tab>
          active={tab}
          onChange={setTab}
          tabs={[
            { id: 'overview', label: 'Overview' },
            {
              id: 'variants',
              label: 'Options & variants',
              badge: view.variants.length,
            },
            {
              id: 'pricing',
              label: 'Pricing',
              badge: view.volumeTiers.length || undefined,
            },
            {
              id: 'inventory',
              label: 'Inventory',
              badge: view.isLowStock ? 'Low' : undefined,
            },
            {
              id: 'visibility',
              label: 'Visibility',
              badge:
                view.visibility === 'RESTRICTED' ? 'Restricted' : undefined,
            },
            { id: 'assets', label: 'Files', badge: view.assets.length },
          ]}
        />

        {tab === 'overview' && (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
              gap: '20px',
              alignItems: 'start',
            }}
          >
            <AdminCard>
              <img
                src={product.thumbnailUrl}
                alt={product.name}
                style={{
                  width: '100%',
                  height: '260px',
                  objectFit: 'cover',
                  borderRadius: '10px',
                  border: '1px solid #F0E6EC',
                }}
              />

              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}
              >
                <div
                  style={{
                    fontSize: '0.78rem',
                    color: '#6E6781',
                    fontWeight: 500,
                  }}
                >
                  Current Status
                </div>
                <StatusPill status={view.status} size="lg" />
              </div>

              <div
                style={{ borderTop: '1px solid #F5EEF2', paddingTop: '16px' }}
              >
                <div style={{ fontSize: '0.75rem', color: '#A39BB3' }}>
                  Base unit price
                </div>
                <div
                  style={{
                    fontSize: '1.5rem',
                    fontWeight: 700,
                    color: '#2B253E',
                    letterSpacing: '-0.02em',
                    marginTop: '4px',
                  }}
                >
                  {formatMoney(view.basePrice)}
                  <span
                    style={{
                      fontSize: '0.8rem',
                      color: '#A39BB3',
                      fontWeight: 500,
                      marginLeft: '6px',
                    }}
                  >
                    / {product.uom}
                  </span>
                </div>
              </div>

              <div
                style={{
                  borderTop: '1px solid #F5EEF2',
                  paddingTop: '16px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '10px',
                }}
              >
                <div
                  style={{
                    fontSize: '0.84rem',
                    fontWeight: 600,
                    color: '#2B253E',
                  }}
                >
                  Lifecycle
                </div>
                {!canManage && (
                  <ReadOnlyNotice>
                    Status changes need the Catalog Manage permission.
                  </ReadOnlyNotice>
                )}
                <ProductLifecycleActions
                  view={view}
                  canManage={canManage}
                  onDeleted={() => router.push('/admin/catalogue/products')}
                />
              </div>
            </AdminCard>

            <AdminCard>
              <div>
                <h2
                  style={{
                    fontSize: '0.95rem',
                    fontWeight: 700,
                    color: '#2B253E',
                    margin: 0,
                  }}
                >
                  Specification & Packaging Attributes
                </h2>
                <p
                  style={{
                    fontSize: '0.8rem',
                    color: '#6E6781',
                    margin: '4px 0 0',
                    lineHeight: 1.5,
                  }}
                >
                  {view.description || 'No description.'}
                </p>
              </div>

              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                  gap: '14px 20px',
                }}
              >
                <Attribute label="SKU Identifier" mono>
                  {view.sku}
                </Attribute>
                <Attribute label="Category">
                  {view.category.name}{' '}
                  <span style={{ color: '#A39BB3', fontWeight: 500 }}>
                    ({view.category.code})
                  </span>
                </Attribute>
                <Attribute label="Packaging & Pack Size">
                  {product.packSize}
                </Attribute>
                <Attribute label="Minimum Order Quantity (MOQ)">
                  {view.moq} {product.uom}
                </Attribute>
                <Attribute label="Order Increment Multiple">
                  Every {view.orderMultiple} unit(s)
                </Attribute>
                <Attribute label="Lead Time">
                  {view.leadTimeDays === null
                    ? '—'
                    : `${view.leadTimeDays} day(s)`}
                </Attribute>
                <Attribute label="Trim Size">
                  {product.widthMm && product.heightMm
                    ? `${product.widthMm} × ${product.heightMm} mm`
                    : '—'}
                </Attribute>
                <Attribute label="Bleed / Safe Margin">
                  {product.bleedMm ?? '—'} mm / {product.safeMarginMm ?? '—'} mm
                </Attribute>
                <Attribute label="Visibility">
                  {view.visibility === 'ALL_ACCOUNTS'
                    ? 'All accounts'
                    : 'Restricted'}
                </Attribute>
                <Attribute label="Available Stock">
                  {view.trackInventory
                    ? `${view.availableStock}${view.isLowStock ? ' (low)' : ''}`
                    : 'Not tracked'}
                </Attribute>
              </div>

              {view.tags.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                  {view.tags.map((tag) => (
                    <span
                      key={tag}
                      style={{
                        fontSize: '0.72rem',
                        padding: '2px 8px',
                        borderRadius: '9999px',
                        backgroundColor: '#F5EEF2',
                        color: '#5C566E',
                      }}
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              )}

              <div
                style={{
                  padding: '14px 16px',
                  backgroundColor: '#FCF7FA',
                  borderRadius: '10px',
                  fontSize: '0.78rem',
                  color: '#6E6781',
                  lineHeight: 1.5,
                }}
              >
                Customer-specific prices come from account rate cards, applied
                on top of the base price and volume tiers.{' '}
                <Link
                  href="/admin/pricing/rate-cards"
                  style={{ color: '#F73582', fontWeight: 600 }}
                >
                  Manage rate cards
                </Link>
              </div>
            </AdminCard>
          </div>
        )}

        {tab === 'variants' && (
          <ProductVariantsPanel view={view} canManage={canManage} />
        )}

        {tab === 'pricing' && (
          <>
            <ProductVolumeTiersEditor view={view} canEdit={canPrice} />
            <ProductOptionPricingEditor
              key={optionsKey}
              product={product}
              readOnly={!canManage}
            />
          </>
        )}

        {tab === 'inventory' && (
          <ProductStockPanel view={view} canAdjust={canStock} />
        )}

        {tab === 'visibility' && (
          <ProductVisibilityPanel view={view} canManage={canManage} />
        )}

        {tab === 'assets' && (
          <ProductAssetsPanel view={view} canManage={canManage} />
        )}
      </main>

      {canManage && (
        <ProductEditModal
          product={product}
          categories={categories}
          isOpen={isEditOpen}
          onClose={() => setIsEditOpen(false)}
          onSave={handleSave}
        />
      )}
    </>
  )
}
