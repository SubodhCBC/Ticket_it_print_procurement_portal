// src/app/shop/catalogue/page.tsx
'use client'

import { SkeletonCardGrid } from '@/components/ui/Skeleton'
import { useEffect, useMemo, useState } from 'react'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { useAuth } from '@/hooks/useAuth'
import { useCart } from '@/hooks/useCart'
import {
  getVisibleProductsForAccount,
  getProductCategories,
} from '@/services/products.service'
import { ProductCard } from '@/components/shop/ProductCard'
import { useTemplates } from '@/hooks/useTemplates'
import {
  ChevronLeft,
  ChevronRight,
  Package,
  Search,
  ShoppingCart,
} from 'lucide-react'
import { formatMoney } from '@/lib/format'
import { packCount } from '@/components/shop/cart/line-format'

const PAGE_SIZE = 24

/** The templates endpoint's largest page; see `designCounts` below. */
const DESIGN_COUNT_PAGE = 100

export default function ShopCataloguePage() {
  const { user } = useAuth()
  const { totalCount, subtotal, setIsCartDrawerOpen } = useCart()

  const [selectedCategory, setSelectedCategory] = useState<string>('All')
  const [searchQuery, setSearchQuery] = useState<string>('')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)

  const accountId = user?.accountId ?? ''

  // Search, category and paging all run on the server. Filtering one fetched
  // page in the browser hid every product past the first fifty.
  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(searchQuery.trim())
      setPage(1)
    }, 300)
    return () => clearTimeout(timer)
  }, [searchQuery])

  const categoriesQuery = useQuery({
    queryKey: ['catalogue', 'categories'],
    queryFn: () => getProductCategories(),
    staleTime: 5 * 60 * 1000,
  })
  const categories = categoriesQuery.data ?? []

  const productsQuery = useQuery({
    queryKey: [
      'catalogue',
      'products',
      { accountId, category: selectedCategory, search, page },
    ],
    queryFn: () =>
      getVisibleProductsForAccount(accountId, {
        page,
        pageSize: PAGE_SIZE,
        categoryId: selectedCategory === 'All' ? undefined : selectedCategory,
        search: search || undefined,
        // Superseded and unavailable items stay in view, greyed out, so a
        // buyer looking for one finds what replaced it.
        includeUnavailable: true,
      }),
    placeholderData: keepPreviousData,
    enabled: Boolean(user),
  })
  const filteredProducts = productsQuery.data?.items ?? []
  const totalProducts = productsQuery.data?.total ?? 0
  const totalPages = productsQuery.data?.totalPages ?? 1
  const isLoading = productsQuery.isPending

  const chooseCategory = (id: string) => {
    setSelectedCategory(id)
    setPage(1)
  }

  // How many published designs each product has — counted ONCE for the page.
  //
  // Each tile used to ask for this itself, so a full page of 24 products issued
  // 24 extra requests purely to print a number. One list read answers all of
  // them. `DESIGN_COUNT_PAGE` is the endpoint's ceiling, so when the published
  // library is larger than a single page the counts would be undercounts; the
  // tiles then fall back to "Browse designs" rather than print a wrong number.
  const publishedDesigns = useTemplates({
    status: 'PUBLISHED',
    pageSize: DESIGN_COUNT_PAGE,
  })
  const designCounts = useMemo(() => {
    if (publishedDesigns.isLoading || publishedDesigns.error) return null
    if (publishedDesigns.total > publishedDesigns.data.length) return null
    const counts = new Map<string, number>()
    for (const design of publishedDesigns.data) {
      if (!design.productId) continue
      counts.set(design.productId, (counts.get(design.productId) ?? 0) + 1)
    }
    return counts
  }, [
    publishedDesigns.data,
    publishedDesigns.total,
    publishedDesigns.isLoading,
    publishedDesigns.error,
  ])

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '20px',
      }}
    >
      {/* 1. Page header. The site this catalogue is scoped to used to sit in a
          chip on a dark banner; it now leads the description. */}
      <div className="stack-sm" style={{ justifyContent: 'space-between' }}>
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
            Approved product catalogue
          </h1>
          <p
            style={{
              fontSize: '0.8rem',
              color: '#6E6781',
              lineHeight: 1.5,
              margin: '4px 0 0',
            }}
          >
            {user?.siteName && (
              <>
                <span style={{ fontWeight: 600, color: '#2B253E' }}>
                  {user.siteName}
                  {user.siteCode ? ` (${user.siteCode})` : ''}
                </span>
                {' · '}
              </>
            )}
            Order pre-approved print, point-of-sale displays, and packaging.
            Billed on-account directly to your Head Office monthly statement
            with zero online payment required.
          </p>
        </div>

        {/* Quick cart summary. One secondary button; the count it used to
            repeat in a green badge is already in its label. */}
        <button
          className="touch-target"
          onClick={() => setIsCartDrawerOpen(true)}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
            padding: '8px 14px',
            borderRadius: '10px',
            backgroundColor: '#FFFFFF',
            color: '#2B253E',
            border: '1px solid #F0E6EC',
            fontSize: '0.82rem',
            fontWeight: 600,
            cursor: 'pointer',
            whiteSpace: 'nowrap',
            flexShrink: 0,
            transition: 'background-color 0.15s ease',
          }}
        >
          <ShoppingCart size={16} />
          <span style={{ fontWeight: 500, color: '#6E6781' }}>
            Session Cart
          </span>
          <span>
            {/* The basket counts packs, not pieces and not "items" — the same
                noun the basket, checkout and order screens use. */}
            {formatMoney(subtotal)} ({packCount(totalCount)})
          </span>
        </button>
      </div>

      {/* 2. Filter & Search Controls */}
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
        <div className="row-wrap" style={{ justifyContent: 'space-between' }}>
          {/* Search Input */}
          <div
            style={{
              position: 'relative',
              flex: '1 1 220px',
              minWidth: 0,
              maxWidth: '460px',
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
                pointerEvents: 'none',
              }}
            />
            <input
              type="text"
              placeholder="Search by product name or SKU..."
              aria-label="Search the catalogue"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="touch-target"
              style={{
                width: '100%',
                paddingLeft: '36px',
                paddingRight: searchQuery ? '60px' : '12px',
                paddingTop: '8px',
                paddingBottom: '8px',
                borderRadius: '10px',
                border: '1px solid #F0E6EC',
                fontSize: '0.84rem',
                color: '#2B253E',
                backgroundColor: '#FFFFFF',
                outline: 'none',
                transition: 'border-color 0.15s ease',
              }}
            />
            {searchQuery && (
              <button
                className="touch-target"
                onClick={() => setSearchQuery('')}
                style={{
                  position: 'absolute',
                  right: '12px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  fontSize: '0.78rem',
                  fontWeight: 600,
                  color: '#6E6781',
                  cursor: 'pointer',
                  border: 'none',
                  background: 'none',
                }}
              >
                Clear
              </button>
            )}
          </div>

          <div style={{ fontSize: '0.8rem', color: '#6E6781' }}>
            Showing{' '}
            <strong style={{ fontWeight: 600, color: '#2B253E' }}>
              {totalProducts}
            </strong>{' '}
            approved product{totalProducts === 1 ? '' : 's'}
            {productsQuery.isFetching && !isLoading ? ' · updating…' : ''}
          </div>
        </div>

        {/* Category Pills */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            overflowX: 'auto',
            paddingBottom: '2px',
          }}
        >
          <button
            type="button"
            className="touch-target"
            onClick={() => chooseCategory('All')}
            style={{
              padding: '5px 12px',
              borderRadius: '9999px',
              fontSize: '0.78rem',
              fontWeight: 600,
              whiteSpace: 'nowrap',
              cursor: 'pointer',
              border: 'none',
              transition: 'background-color 0.15s ease, color 0.15s ease',
              backgroundColor:
                selectedCategory === 'All' ? '#F73582' : '#F5EEF2',
              color: selectedCategory === 'All' ? '#FFFFFF' : '#5C566E',
            }}
          >
            All Categories
          </button>

          {categories.map((cat) => {
            const isSelected = selectedCategory === cat.id
            return (
              <button
                key={cat.id}
                type="button"
                className="touch-target"
                onClick={() => chooseCategory(cat.id)}
                style={{
                  padding: '5px 12px',
                  borderRadius: '9999px',
                  fontSize: '0.78rem',
                  fontWeight: 600,
                  whiteSpace: 'nowrap',
                  cursor: 'pointer',
                  border: 'none',
                  transition: 'background-color 0.15s ease, color 0.15s ease',
                  backgroundColor: isSelected ? '#F73582' : '#F5EEF2',
                  color: isSelected ? '#FFFFFF' : '#5C566E',
                }}
              >
                {cat.name}
              </button>
            )
          })}
        </div>
      </div>

      {/* 3. Products Grid */}
      {isLoading ? (
        <SkeletonCardGrid count={8} label="Loading the catalogue" />
      ) : productsQuery.isError ? (
        <p
          role="alert"
          style={{
            margin: 0,
            padding: '24px',
            textAlign: 'center',
            color: '#DC2626',
            fontSize: '0.84rem',
          }}
        >
          The catalogue could not be loaded. Refresh the page to try again.
        </p>
      ) : filteredProducts.length === 0 ? (
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
          <Package
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
            No Products Found
          </h3>
          <p
            style={{
              fontSize: '0.84rem',
              color: '#A39BB3',
              maxWidth: '440px',
              margin: '6px auto 16px',
              lineHeight: 1.5,
            }}
          >
            {search || selectedCategory !== 'All'
              ? 'No products match your current search and filter criteria. Try clearing filters to see all available items.'
              : 'There are currently no products configured for your account catalogue visibility. Please contact your Platform Administrator.'}
          </p>
          <button
            className="touch-target"
            onClick={() => {
              setSearchQuery('')
              setSearch('')
              chooseCategory('All')
            }}
            style={{
              padding: '8px 14px',
              borderRadius: '10px',
              backgroundColor: '#F73582',
              color: '#FFFFFF',
              fontSize: '0.82rem',
              fontWeight: 600,
              cursor: 'pointer',
              border: 'none',
            }}
          >
            Reset Filters
          </button>
        </div>
      ) : (
        <div
          className="grid-auto"
          style={{ ['--min']: '200px' } as React.CSSProperties}
        >
          {filteredProducts.map((product, index) => (
            <ProductCard
              key={product.id}
              product={product}
              index={index}
              designCount={
                designCounts ? (designCounts.get(product.id) ?? 0) : null
              }
            />
          ))}
        </div>
      )}

      {totalPages > 1 && (
        <div
          className="row-wrap"
          style={{
            justifyContent: 'space-between',
            fontSize: '0.8rem',
            color: '#6E6781',
          }}
        >
          <span>
            Page {page} of {totalPages}
          </span>
          <div className="row-wrap">
            <button
              type="button"
              className="touch-target"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
              style={pagerButton}
            >
              <ChevronLeft size={14} /> Previous
            </button>
            <button
              type="button"
              className="touch-target"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
              style={pagerButton}
            >
              Next <ChevronRight size={14} />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

const pagerButton: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: '4px',
  padding: '6px 10px',
  borderRadius: '8px',
  border: '1px solid #F0E6EC',
  backgroundColor: '#FFFFFF',
  color: '#2B253E',
  fontSize: '0.78rem',
  fontWeight: 600,
  cursor: 'pointer',
}
