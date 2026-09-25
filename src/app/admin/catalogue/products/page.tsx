// src/app/admin/catalogue/products/page.tsx
'use client'

import { SkeletonTable } from '@/components/ui/Skeleton'
import { useState } from 'react'
import Link from 'next/link'
import {
  Package,
  Plus,
  Search,
  Edit3,
  Trash2,
  Archive,
  ExternalLink,
  Eye,
  FileSpreadsheet,
  Images,
  Download,
} from 'lucide-react'
import { exportCatalogProducts } from '@/services/products.service'
import { saveBlob } from '@/services/data-source/api/api-reports.adapter'
import { toApiError } from '@/services/api.service'
import { AdminHeader } from '@/components/admin/AdminHeader'
import { StatusPill } from '@/components/admin/StatusPill'
import { ProductEditModal } from '@/components/admin/ProductEditModal'
import {
  ActionButton,
  ConfirmModal,
  Notice,
  StateBlock,
} from '@/components/admin/ProductAdminUi'
import { errorMessage } from '@/components/admin/ProductAdminUtils'
import { useAuth } from '@/hooks/useAuth'
import {
  useProducts,
  useProductCategories,
  useProductMutations,
} from '@/hooks/useProducts'
import type { Product } from '@/types'

const PAGE_SIZE = 20

const thStyle = (
  align: 'left' | 'right' | 'center' = 'left',
  edge = false
): React.CSSProperties => ({
  padding: edge ? '10px 20px' : '10px 14px',
  color: '#A39BB3',
  fontWeight: 500,
  fontSize: '0.74rem',
  whiteSpace: 'nowrap',
  textAlign: align,
})

const iconButton: React.CSSProperties = {
  width: '32px',
  height: '32px',
  borderRadius: '10px',
  backgroundColor: '#FFFFFF',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  color: '#6E6781',
  border: '1px solid #F0E6EC',
  cursor: 'pointer',
  textDecoration: 'none',
}

export default function ProductsCataloguePage() {
  const [selectedCategory, setSelectedCategory] = useState<string>('All')
  const [selectedStatus, setSelectedStatus] = useState<
    Product['status'] | 'ALL'
  >('ALL')
  const [searchQuery, setSearchQuery] = useState<string>('')
  // Reset to 1 by every filter change: page 4 of the old result set is
  // usually past the end of the new one.
  const [page, setPage] = useState(1)

  const { hasPermission } = useAuth()
  const canManage = hasPermission('CATALOG_MANAGE')

  const { categories: categoriesData } = useProductCategories()
  const {
    data: productsData,
    isLoading,
    isFetching,
    error,
    refetch,
  } = useProducts(
    {
      categoryId: selectedCategory === 'All' ? undefined : selectedCategory,
      status: selectedStatus === 'ALL' ? undefined : selectedStatus,
      search: searchQuery || undefined,
      page,
      pageSize: PAGE_SIZE,
    },
    // The page on screen stays while the next loads, rather than the table
    // collapsing to a loading panel on every page turn.
    { keepPreviousPage: true }
  )

  const { createProduct, updateProduct, deleteProduct } = useProductMutations()

  const [isExporting, setIsExporting] = useState(false)
  const [exportError, setExportError] = useState<string | null>(null)

  /**
   * Every product matching the filters on screen, as CSV — all pages, not the
   * one showing. Its first columns are the import template's, so the file can
   * be edited and imported back.
   */
  const exportProducts = async () => {
    setExportError(null)
    setIsExporting(true)
    try {
      const { blob, filename } = await exportCatalogProducts({
        categoryId: selectedCategory === 'All' ? undefined : selectedCategory,
        status: selectedStatus === 'ALL' ? undefined : selectedStatus,
        search: searchQuery || undefined,
      })
      saveBlob(blob, filename)
    } catch (err) {
      setExportError(
        toApiError(err).status === 404
          ? 'Product export is not available on the server yet.'
          : errorMessage(err, 'The product export could not be downloaded.')
      )
    } finally {
      setIsExporting(false)
    }
  }

  const [modalState, setModalState] = useState<{
    isOpen: boolean
    product: Product | null
  }>({ isOpen: false, product: null })

  const [removal, setRemoval] = useState<Product | null>(null)
  const [removalError, setRemovalError] = useState<string | null>(null)
  const [isRemoving, setIsRemoving] = useState(false)

  const handleSaveProduct = async (
    data: Omit<Product, 'id'> | Partial<Product>,
    isEditing: boolean
  ) => {
    if (isEditing && modalState.product) {
      await updateProduct(modalState.product.id, data)
    } else {
      await createProduct(data as Omit<Product, 'id'>)
    }
  }

  /**
   * Only a draft can be deleted. A published product is referenced by orders
   * and invoices, so it is archived — marked unavailable — instead, the same
   * rule the API enforces.
   */
  const confirmRemoval = async () => {
    if (!removal) return
    setIsRemoving(true)
    setRemovalError(null)
    // A deleted draft leaves the list; an archived product leaves it only when
    // a status filter is on (it can only be ACTIVE, which it no longer is).
    const leavesPage = removal.status === 'DRAFT' || selectedStatus !== 'ALL'
    try {
      if (removal.status === 'DRAFT') {
        await deleteProduct(removal.id)
      } else {
        await updateProduct(removal.id, { status: 'UNAVAILABLE' })
      }
      // The last product on a later page: step back rather than show an empty
      // page.
      if (leavesPage && page > 1 && productsData?.items.length === 1) {
        setPage(page - 1)
      }
      setRemoval(null)
    } catch (err) {
      setRemovalError(errorMessage(err, 'The product could not be updated.'))
    } finally {
      setIsRemoving(false)
    }
  }

  return (
    <>
      <AdminHeader
        title="Product Catalogue & DAM"
        subtitle="Manage collateral products, packaging specifications, MOQ rules, and pricing"
        actionButton={
          canManage ? (
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              <Link
                href="/admin/catalogue/products/import"
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
                <FileSpreadsheet size={16} />
                <span>Bulk CSV Import</span>
              </Link>
              <Link
                href="/admin/catalogue/products/images"
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
                <Images size={16} />
                <span>Bulk Image Upload</span>
              </Link>
              <ActionButton
                icon={<Download size={16} />}
                pending={isExporting}
                pendingLabel="Exporting…"
                onClick={() => void exportProducts()}
                title="Download every product matching the current filters as CSV"
              >
                Export CSV
              </ActionButton>
              <ActionButton
                variant="primary"
                icon={<Plus size={16} />}
                onClick={() => setModalState({ isOpen: true, product: null })}
              >
                Add New Product
              </ActionButton>
            </div>
          ) : undefined
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
        {exportError && <Notice tone="error">{exportError}</Notice>}

        {/* Filter Bar */}
        <div
          style={{
            backgroundColor: '#FFFFFF',
            borderRadius: '14px',
            boxShadow:
              '0 1px 2px rgba(43, 37, 62, 0.04), 0 6px 16px rgba(43, 37, 62, 0.05)',
            padding: '16px 20px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '12px',
            border: '1px solid #F0E6EC',
            flexWrap: 'wrap',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              backgroundColor: '#FFFFFF',
              border: '1px solid #F0E6EC',
              borderRadius: '10px',
              padding: '8px 12px',
              flex: '1',
              minWidth: '240px',
            }}
          >
            <Search size={16} color="#A39BB3" />
            <input
              type="text"
              placeholder="Search products by name or SKU..."
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value)
                setPage(1)
              }}
              style={{
                border: 'none',
                backgroundColor: 'transparent',
                fontSize: '0.84rem',
                color: '#2B253E',
                width: '100%',
              }}
            />
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span
              style={{ fontSize: '0.78rem', color: '#6E6781', fontWeight: 500 }}
            >
              Category:
            </span>
            <select
              value={selectedCategory}
              onChange={(e) => {
                setSelectedCategory(e.target.value)
                setPage(1)
              }}
              style={{
                padding: '8px 12px',
                borderRadius: '10px',
                border: '1px solid #F0E6EC',
                fontSize: '0.84rem',
                backgroundColor: '#FFFFFF',
                color: '#2B253E',
              }}
            >
              <option value="All">
                All Categories ({categoriesData.length})
              </option>
              {categoriesData.map((cat) => (
                <option key={cat.id} value={cat.id}>
                  {cat.name} ({cat.itemCount})
                </option>
              ))}
            </select>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span
              style={{ fontSize: '0.78rem', color: '#6E6781', fontWeight: 500 }}
            >
              Status:
            </span>
            <select
              value={selectedStatus}
              onChange={(e) => {
                setSelectedStatus(e.target.value as Product['status'] | 'ALL')
                setPage(1)
              }}
              style={{
                padding: '8px 12px',
                borderRadius: '10px',
                border: '1px solid #F0E6EC',
                fontSize: '0.84rem',
                backgroundColor: '#FFFFFF',
                color: '#2B253E',
              }}
            >
              <option value="ALL">All Statuses</option>
              <option value="DRAFT">Draft Only</option>
              <option value="ACTIVE">Active Only</option>
              <option value="UNAVAILABLE">Unavailable Only</option>
              <option value="SUPERSEDED">Superseded Only</option>
            </select>
          </div>
        </div>

        {/* Products Table Card */}
        <div
          style={{
            backgroundColor: '#FFFFFF',
            borderRadius: '14px',
            boxShadow:
              '0 1px 2px rgba(43, 37, 62, 0.04), 0 6px 16px rgba(43, 37, 62, 0.05)',
            border: '1px solid #F0E6EC',
            overflow: 'hidden',
          }}
        >
          {isLoading ? (
            <SkeletonTable rows={8} columns={6} label="Loading products" />
          ) : error && !productsData ? (
            <div style={{ padding: '8px 0 20px' }}>
              <StateBlock
                tone="error"
                title="Products could not be loaded"
                description={errorMessage(error, 'Try again in a moment.')}
              />
              <div style={{ display: 'flex', justifyContent: 'center' }}>
                <ActionButton onClick={() => void refetch()}>
                  Retry
                </ActionButton>
              </div>
            </div>
          ) : !productsData?.items.length ? (
            <StateBlock
              icon={<Package size={20} color="#DCD3E0" />}
              title="No products found"
              description="Try adjusting your search query or filters."
            />
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table
                style={{
                  width: '100%',
                  borderCollapse: 'collapse',
                  textAlign: 'left',
                  fontSize: '0.84rem',
                }}
              >
                <thead>
                  <tr>
                    <th style={thStyle('left', true)}>Item Details</th>
                    <th style={thStyle()}>SKU</th>
                    <th style={thStyle()}>Category</th>
                    <th style={thStyle()}>Pack Size / UOM</th>
                    <th style={thStyle('center')}>MOQ</th>
                    <th style={thStyle('right')}>Base Price</th>
                    <th style={thStyle()}>Status</th>
                    <th style={thStyle('right', true)}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {productsData.items.map((prod) => {
                    const isDraft = prod.status === 'DRAFT'
                    const canArchive = prod.status === 'ACTIVE'
                    return (
                      <tr
                        key={prod.id}
                        style={{
                          borderTop: '1px solid #F5EEF2',
                          transition: 'background-color 120ms ease',
                        }}
                        onMouseEnter={(e) =>
                          (e.currentTarget.style.backgroundColor = '#FCF7FA')
                        }
                        onMouseLeave={(e) =>
                          (e.currentTarget.style.backgroundColor =
                            'transparent')
                        }
                      >
                        <td style={{ padding: '12px 20px' }}>
                          <div
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: '12px',
                            }}
                          >
                            <img
                              src={prod.thumbnailUrl}
                              alt={prod.name}
                              style={{
                                width: '40px',
                                height: '40px',
                                borderRadius: '10px',
                                objectFit: 'cover',
                                border: '1px solid #F0E6EC',
                                flexShrink: 0,
                              }}
                            />
                            <div>
                              <Link
                                href={`/admin/catalogue/products/${prod.id}`}
                                style={{
                                  fontWeight: 600,
                                  color: '#2B253E',
                                  textDecoration: 'none',
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '6px',
                                }}
                              >
                                <span>{prod.name}</span>
                                <ExternalLink size={12} color="#A39BB3" />
                              </Link>
                              <div
                                style={{
                                  fontSize: '0.76rem',
                                  color: '#A39BB3',
                                  marginTop: '2px',
                                  maxWidth: '320px',
                                  overflow: 'hidden',
                                  textOverflow: 'ellipsis',
                                  whiteSpace: 'nowrap',
                                }}
                              >
                                {prod.description}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td
                          style={{
                            padding: '12px 14px',
                            fontFamily: 'monospace',
                            fontSize: '0.78rem',
                            color: '#6E6781',
                          }}
                        >
                          {prod.sku}
                        </td>
                        <td style={{ padding: '12px 14px', color: '#2B253E' }}>
                          {prod.categoryName || 'General'}
                        </td>
                        <td style={{ padding: '12px 14px', color: '#6E6781' }}>
                          {prod.packSize} ({prod.uom})
                        </td>
                        <td
                          style={{
                            padding: '12px 14px',
                            textAlign: 'center',
                            color: '#6E6781',
                          }}
                        >
                          {prod.moq}
                        </td>
                        <td
                          style={{
                            padding: '12px 14px',
                            textAlign: 'right',
                            fontWeight: 600,
                            color: '#2B253E',
                          }}
                        >
                          ${prod.basePrice.toFixed(2)}
                        </td>
                        <td style={{ padding: '12px 14px' }}>
                          <StatusPill status={prod.status} />
                        </td>
                        <td
                          style={{ padding: '12px 20px', textAlign: 'right' }}
                        >
                          <div
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'flex-end',
                              gap: '8px',
                            }}
                          >
                            <Link
                              href={`/admin/catalogue/products/${prod.id}`}
                              title="View Full Details"
                              style={iconButton}
                            >
                              <Eye size={14} />
                            </Link>
                            {canManage && (
                              <>
                                <button
                                  type="button"
                                  onClick={() =>
                                    setModalState({
                                      isOpen: true,
                                      product: prod,
                                    })
                                  }
                                  title="Edit Product"
                                  disabled={prod.status === 'SUPERSEDED'}
                                  style={{
                                    ...iconButton,
                                    opacity:
                                      prod.status === 'SUPERSEDED' ? 0.45 : 1,
                                  }}
                                >
                                  <Edit3 size={14} />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setRemovalError(null)
                                    setRemoval(prod)
                                  }}
                                  disabled={!isDraft && !canArchive}
                                  title={
                                    isDraft
                                      ? 'Delete draft'
                                      : canArchive
                                        ? 'Archive (mark unavailable)'
                                        : 'Already archived — manage it from the product page'
                                  }
                                  style={{
                                    ...iconButton,
                                    color: '#DC2626',
                                    border: '1px solid #FECACA',
                                    opacity: !isDraft && !canArchive ? 0.45 : 1,
                                  }}
                                >
                                  {isDraft ? (
                                    <Trash2 size={14} />
                                  ) : (
                                    <Archive size={14} />
                                  )}
                                </button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {productsData && productsData.totalPages > 1 && (
          <nav
            aria-label="Product pages"
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: '12px',
              fontSize: '0.8rem',
              color: '#6E6781',
            }}
          >
            <span>
              Showing {(productsData.page - 1) * productsData.pageSize + 1}–
              {Math.min(
                productsData.page * productsData.pageSize,
                productsData.total
              )}{' '}
              of {productsData.total} products
              {isFetching && !isLoading ? ' · Loading…' : ''}
            </span>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <ActionButton
                size="sm"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1 || isFetching}
              >
                Previous
              </ActionButton>
              <span>
                Page {productsData.page} of {productsData.totalPages}
              </span>
              <ActionButton
                size="sm"
                onClick={() =>
                  setPage((p) => Math.min(productsData.totalPages, p + 1))
                }
                disabled={page >= productsData.totalPages || isFetching}
              >
                Next
              </ActionButton>
            </div>
          </nav>
        )}
      </main>

      {canManage && (
        <ProductEditModal
          product={modalState.product}
          categories={categoriesData}
          isOpen={modalState.isOpen}
          onClose={() => setModalState({ isOpen: false, product: null })}
          onSave={handleSaveProduct}
        />
      )}

      <ConfirmModal
        isOpen={removal !== null}
        title={removal?.status === 'DRAFT' ? 'Delete draft' : 'Archive product'}
        message={
          removal?.status === 'DRAFT' ? (
            <>
              Delete the draft <strong>{removal?.name}</strong>? Only drafts can
              be deleted, because nobody has been able to order them.
            </>
          ) : (
            <>
              <strong>{removal?.name}</strong> is published and referenced by
              orders, so it cannot be deleted. Archive it instead? It will be
              marked unavailable and can be reactivated later.
            </>
          )
        }
        confirmLabel={
          removal?.status === 'DRAFT' ? 'Delete draft' : 'Mark unavailable'
        }
        pendingLabel={removal?.status === 'DRAFT' ? 'Deleting…' : 'Archiving…'}
        pending={isRemoving}
        error={removalError}
        onConfirm={() => void confirmRemoval()}
        onCancel={() => setRemoval(null)}
      />
    </>
  )
}
