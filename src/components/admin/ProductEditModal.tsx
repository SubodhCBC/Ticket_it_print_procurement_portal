// src/components/admin/ProductEditModal.tsx
'use client'

import React, { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X } from 'lucide-react'
import type { Product, ProductCategory } from '@/types'
import type { ApiUom } from '@/services/data-source/api/catalog.types'
import {
  packSizeLabel,
  parsePackSize,
  toApiUom,
  uomCode,
  UOM_OPTIONS,
} from '@/services/data-source/api/product.mapper'

/** A placeholder SKU for a new product, replaced by whoever creates it. */
function newSkuPlaceholder(): string {
  return `SKU-${Math.floor(1000 + Math.random() * 9000)}`
}

const STATUS_LABELS: Record<Product['status'], string> = {
  DRAFT: 'DRAFT (not orderable yet)',
  ACTIVE: 'ACTIVE (available for ordering)',
  UNAVAILABLE: 'UNAVAILABLE (hidden from ordering)',
  SUPERSEDED: 'SUPERSEDED (replaced by another product)',
}

/**
 * The statuses this form may move a product to, following the API's
 * transition table. SUPERSEDED is never offered: it needs a replacement
 * product, which this form cannot pick, and the API would refuse it.
 */
function statusChoices(
  current: Product['status'] | undefined
): { value: Product['status']; label: string }[] {
  const allowed: Product['status'][] =
    current === undefined
      ? ['DRAFT', 'ACTIVE']
      : current === 'DRAFT'
        ? ['DRAFT', 'ACTIVE']
        : current === 'ACTIVE'
          ? ['ACTIVE', 'UNAVAILABLE']
          : current === 'UNAVAILABLE'
            ? ['UNAVAILABLE', 'ACTIVE']
            : ['SUPERSEDED']
  return allowed.map((value) => ({ value, label: STATUS_LABELS[value] }))
}

interface ProductEditModalProps {
  product: Product | null
  categories: ProductCategory[]
  isOpen: boolean
  onClose: () => void
  onSave: (
    data: Omit<Product, 'id'> | Partial<Product>,
    isEditing: boolean
  ) => Promise<any>
}

export function ProductEditModal({
  product,
  categories,
  isOpen,
  onClose,
  onSave,
}: ProductEditModalProps) {
  const isEditing = Boolean(product?.id)

  const [formData, setFormData] = useState<Partial<Product>>({
    sku: '',
    name: '',
    description: '',
    categoryId: 'cat-signs',
    packSize: 'Pack of 10',
    uom: 'PK',
    basePrice: 100,
    moq: 1,
    orderMultiple: 1,
    status: 'ACTIVE',
    trackInventory: true,
    lowStockThreshold: 0,
  })

  const [isSubmitting, setIsSubmitting] = useState(false)
  const [tagsText, setTagsText] = useState('')
  const [error, setError] = useState<string | null>(null)

  // Reseeded whenever it opens or is handed a different product or category
  // list. Adjusted during render rather than in an effect, so the form never
  // paints the previous product's values first.
  const [seededFor, setSeededFor] = useState<{
    product: typeof product
    categories: typeof categories
    isOpen: boolean
  } | null>(null)
  if (
    !seededFor ||
    seededFor.product !== product ||
    seededFor.categories !== categories ||
    seededFor.isOpen !== isOpen
  ) {
    setSeededFor({ product, categories, isOpen })
    setTagsText((product?.tags ?? []).join(', '))
    if (product) {
      setFormData(product)
    } else {
      setFormData({
        sku: newSkuPlaceholder(),
        name: '',
        description: '',
        categoryId: categories[0]?.id || 'cat-signs',
        packSize: 'Pack of 5',
        uom: 'PK',
        basePrice: 120,
        moq: 1,
        orderMultiple: 1,
        status: 'ACTIVE',
        trackInventory: true,
        lowStockThreshold: 0,
      })
    }
    setError(null)
  }

  if (!isOpen) return null

  // The unit and the count are what is edited; the "Box of 100" label is
  // composed from them, so it can never say something the two do not.
  const packUom = toApiUom(formData.uom)
  const packQty = parsePackSize(formData.packSize)
  const uomOption = UOM_OPTIONS.find((option) => option.value === packUom)
  const uomNoun = uomOption?.noun ?? 'unit'
  const uomPlural = uomOption?.plural ?? 'units'
  const setPack = (qty: number, uom: ApiUom) =>
    setFormData({
      ...formData,
      packSize: packSizeLabel(Math.max(1, qty), uom),
      uom: uomCode(uom),
    })
  const basePrice = Number(formData.basePrice) || 0

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!formData.name || !formData.sku) {
      setError('Product name and SKU are required')
      return
    }

    const selectedCat = categories.find((c) => c.id === formData.categoryId)

    setIsSubmitting(true)
    setError(null)
    try {
      await onSave(
        {
          ...formData,
          categoryName: selectedCat ? selectedCat.name : formData.categoryName,
          basePrice: Number(formData.basePrice),
          moq: Number(formData.moq),
          orderMultiple: Number(formData.orderMultiple),
          lowStockThreshold: Number(formData.lowStockThreshold ?? 0),
          tags: tagsText
            .split(',')
            .map((tag) => tag.trim())
            .filter(Boolean),
        } as any,
        isEditing
      )
      onClose()
    } catch (err: any) {
      setError(err.message || 'Failed to save product')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <AnimatePresence>
      <div
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(15, 23, 42, 0.4)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 100,
          padding: '20px',
        }}
      >
        <motion.div
          initial={{ scale: 0.95, opacity: 0, y: 10 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.95, opacity: 0, y: 10 }}
          style={{
            backgroundColor: '#FFFFFF',
            borderRadius: '14px',
            border: '1px solid #F0E6EC',
            width: '100%',
            maxWidth: '680px',
            maxHeight: '90vh',
            display: 'flex',
            flexDirection: 'column',
            boxShadow: '0 12px 32px rgba(15, 23, 42, 0.12)',
            overflow: 'hidden',
          }}
        >
          {/* Header */}
          <div
            style={{
              padding: '16px 20px',
              borderBottom: '1px solid #F5EEF2',
              display: 'flex',
              alignItems: 'flex-start',
              justifyContent: 'space-between',
              gap: '12px',
            }}
          >
            <div>
              <h2
                style={{
                  fontSize: '1rem',
                  fontWeight: 700,
                  color: '#2B253E',
                  margin: 0,
                }}
              >
                {isEditing
                  ? 'Edit Catalogue Product'
                  : 'Create New Catalogue Product'}
              </h2>
              <div
                style={{
                  fontSize: '0.8rem',
                  color: '#6E6781',
                  marginTop: '4px',
                }}
              >
                Manage item attributes, packaging specifications, and master
                pricing.
              </div>
            </div>

            <button
              type="button"
              onClick={onClose}
              style={{
                width: '32px',
                height: '32px',
                borderRadius: '10px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
                color: '#6E6781',
              }}
            >
              <X size={16} />
            </button>
          </div>

          {/* Form Content */}
          <form
            onSubmit={handleSubmit}
            style={{
              padding: '20px',
              overflowY: 'auto',
              display: 'flex',
              flexDirection: 'column',
              gap: '16px',
            }}
          >
            {error && (
              <div
                style={{
                  padding: '10px 14px',
                  borderRadius: '10px',
                  backgroundColor: '#FEF2F2',
                  color: '#DC2626',
                  fontSize: '0.8rem',
                  fontWeight: 500,
                }}
              >
                {error}
              </div>
            )}

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: '14px',
              }}
            >
              <div>
                <label
                  style={{
                    display: 'block',
                    fontSize: '0.78rem',
                    fontWeight: 600,
                    color: '#5C566E',
                    marginBottom: '6px',
                  }}
                >
                  Product Name *
                </label>
                <input
                  type="text"
                  required
                  value={formData.name}
                  onChange={(e) =>
                    setFormData({ ...formData, name: e.target.value })
                  }
                  placeholder="e.g. Validated Cold-Chain Thermal Tote 12L"
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: '10px',
                    border: '1px solid #F0E6EC',
                    fontSize: '0.84rem',
                    backgroundColor: '#FFFFFF',
                    color: '#2B253E',
                  }}
                />
              </div>

              <div>
                <label
                  style={{
                    display: 'block',
                    fontSize: '0.78rem',
                    fontWeight: 600,
                    color: '#5C566E',
                    marginBottom: '6px',
                  }}
                >
                  Master SKU *
                </label>
                <input
                  type="text"
                  required
                  value={formData.sku}
                  onChange={(e) =>
                    setFormData({ ...formData, sku: e.target.value })
                  }
                  placeholder="e.g. PKG-COLD-TOTE-03"
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: '10px',
                    border: '1px solid #F0E6EC',
                    fontSize: '0.84rem',
                    backgroundColor: '#FFFFFF',
                    color: '#2B253E',
                    fontFamily: 'monospace',
                  }}
                />
              </div>
            </div>

            <div>
              <label
                style={{
                  display: 'block',
                  fontSize: '0.78rem',
                  fontWeight: 600,
                  color: '#5C566E',
                  marginBottom: '6px',
                }}
              >
                Description
              </label>
              <textarea
                rows={2}
                value={formData.description}
                onChange={(e) =>
                  setFormData({ ...formData, description: e.target.value })
                }
                placeholder="Detailed marketing and regulatory specifications..."
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  borderRadius: '10px',
                  border: '1px solid #F0E6EC',
                  fontSize: '0.84rem',
                  backgroundColor: '#FFFFFF',
                  color: '#2B253E',
                  resize: 'vertical',
                }}
              />
            </div>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: '14px',
              }}
            >
              <div>
                <label
                  style={{
                    display: 'block',
                    fontSize: '0.78rem',
                    fontWeight: 600,
                    color: '#5C566E',
                    marginBottom: '6px',
                  }}
                >
                  Product Category
                </label>
                <select
                  value={formData.categoryId}
                  onChange={(e) =>
                    setFormData({ ...formData, categoryId: e.target.value })
                  }
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: '10px',
                    border: '1px solid #F0E6EC',
                    fontSize: '0.84rem',
                    backgroundColor: '#FFFFFF',
                    color: '#2B253E',
                  }}
                >
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label
                  style={{
                    display: 'block',
                    fontSize: '0.78rem',
                    fontWeight: 600,
                    color: '#5C566E',
                    marginBottom: '6px',
                  }}
                >
                  Product Status
                </label>
                <select
                  value={formData.status}
                  disabled={isEditing && product?.status === 'SUPERSEDED'}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      status: e.target.value as Product['status'],
                    })
                  }
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: '10px',
                    border: '1px solid #F0E6EC',
                    fontSize: '0.84rem',
                    backgroundColor: '#FFFFFF',
                    color: '#2B253E',
                  }}
                >
                  {statusChoices(isEditing ? product?.status : undefined).map(
                    (choice) => (
                      <option key={choice.value} value={choice.value}>
                        {choice.label}
                      </option>
                    )
                  )}
                </select>
                {isEditing && (
                  <div
                    style={{
                      fontSize: '0.74rem',
                      color: '#A39BB3',
                      marginTop: '4px',
                    }}
                  >
                    To supersede a product with its replacement, use the
                    lifecycle actions on the product page.
                  </div>
                )}
              </div>
            </div>

            {/*
              What one orderable unit is, and what it costs.

              Picked as a unit and a count rather than typed as "Box of 100":
              the API stores the two separately, only ever read the number out
              of the sentence, and ignored the word — so "Box" and "Pack" typed
              here changed nothing but the screen.
            */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(3, 1fr)',
                gap: '12px',
              }}
            >
              <div>
                <label
                  style={{
                    display: 'block',
                    fontSize: '0.78rem',
                    fontWeight: 600,
                    color: '#5C566E',
                    marginBottom: '6px',
                  }}
                >
                  Sold by
                </label>
                <select
                  value={packUom}
                  onChange={(e) => {
                    const uom = e.target.value as ApiUom
                    // Sold singly means one in the unit, whatever was there.
                    setPack(uom === 'EACH' ? 1 : packQty, uom)
                  }}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: '10px',
                    border: '1px solid #F0E6EC',
                    fontSize: '0.84rem',
                    backgroundColor: '#FFFFFF',
                    color: '#2B253E',
                  }}
                >
                  {UOM_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label
                  style={{
                    display: 'block',
                    fontSize: '0.78rem',
                    fontWeight: 600,
                    color: '#5C566E',
                    marginBottom: '6px',
                  }}
                >
                  Units in one {uomNoun}
                </label>
                <input
                  type="number"
                  min="1"
                  step="1"
                  value={packQty}
                  disabled={packUom === 'EACH'}
                  onChange={(e) =>
                    setPack(parseInt(e.target.value, 10) || 1, packUom)
                  }
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: '10px',
                    border: '1px solid #F0E6EC',
                    fontSize: '0.84rem',
                    backgroundColor: packUom === 'EACH' ? '#F8F5F7' : '#FFFFFF',
                    color: '#2B253E',
                  }}
                />
              </div>

              <div>
                <label
                  style={{
                    display: 'block',
                    fontSize: '0.78rem',
                    fontWeight: 600,
                    color: '#5C566E',
                    marginBottom: '6px',
                  }}
                >
                  Price per {uomNoun} ($)
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={formData.basePrice}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      basePrice: parseFloat(e.target.value) || 0,
                    })
                  }
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: '10px',
                    border: '1px solid #F0E6EC',
                    fontSize: '0.84rem',
                    backgroundColor: '#FFFFFF',
                    color: '#2B253E',
                  }}
                />
              </div>
            </div>

            <div
              style={{
                fontSize: '0.78rem',
                color: '#6E6781',
                marginTop: '-6px',
              }}
            >
              Sold as <strong>{packSizeLabel(packQty, packUom)}</strong> at $
              {basePrice.toFixed(2)} per {uomNoun}
              {packQty > 1
                ? ` ($${(basePrice / packQty).toFixed(2)} each)`
                : ''}
              . MOQ and order multiple below count {uomPlural}, not pieces.
            </div>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(2, 1fr)',
                gap: '12px',
              }}
            >
              <div>
                <label
                  style={{
                    display: 'block',
                    fontSize: '0.78rem',
                    fontWeight: 600,
                    color: '#5C566E',
                    marginBottom: '6px',
                  }}
                >
                  MOQ
                </label>
                <input
                  type="number"
                  min="1"
                  value={formData.moq}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      moq: parseInt(e.target.value, 10) || 1,
                    })
                  }
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: '10px',
                    border: '1px solid #F0E6EC',
                    fontSize: '0.84rem',
                    backgroundColor: '#FFFFFF',
                    color: '#2B253E',
                  }}
                />
              </div>

              <div>
                <label
                  style={{
                    display: 'block',
                    fontSize: '0.78rem',
                    fontWeight: 600,
                    color: '#5C566E',
                    marginBottom: '6px',
                  }}
                >
                  Order Multiple
                </label>
                <input
                  type="number"
                  min="1"
                  value={formData.orderMultiple}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      orderMultiple: parseInt(e.target.value, 10) || 1,
                    })
                  }
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: '10px',
                    border: '1px solid #F0E6EC',
                    fontSize: '0.84rem',
                    backgroundColor: '#FFFFFF',
                    color: '#2B253E',
                  }}
                />
              </div>
            </div>

            {/* Stock and lead time (SOW AD-3). Pictures and artwork are
                attached in the product's Assets panel, not typed as URLs. */}
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '12px',
                paddingTop: '14px',
                borderTop: '1px solid #F5EEF2',
              }}
            >
              <label
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  fontSize: '0.82rem',
                  fontWeight: 600,
                  color: '#2B253E',
                  cursor: 'pointer',
                }}
              >
                <input
                  type="checkbox"
                  checked={formData.trackInventory ?? true}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      trackInventory: e.target.checked,
                    })
                  }
                />
                Count stock for this product
                <span style={{ ...fieldHint, marginTop: 0 }}>
                  Off for print-on-demand, where there is no shelf to run out of
                </span>
              </label>

              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
                  gap: '12px',
                }}
              >
                <div>
                  <label htmlFor="product-lowStockThreshold" style={fieldLabel}>
                    Low-stock threshold
                  </label>
                  <input
                    id="product-lowStockThreshold"
                    type="number"
                    min="0"
                    value={formData.lowStockThreshold ?? ''}
                    placeholder="0"
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        lowStockThreshold: wholeNumberOr(
                          e.target.value,
                          0,
                          undefined
                        ),
                      })
                    }
                    style={fieldInput}
                  />
                  <span style={fieldHint}>
                    Alert when available stock falls to this
                  </span>
                </div>

                <div>
                  <label htmlFor="product-reorderQuantity" style={fieldLabel}>
                    Reorder quantity
                  </label>
                  <input
                    id="product-reorderQuantity"
                    type="number"
                    min="1"
                    value={formData.reorderQuantity ?? ''}
                    placeholder="Optional"
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        reorderQuantity: wholeNumberOr(e.target.value, 1, null),
                      })
                    }
                    style={fieldInput}
                  />
                  <span style={fieldHint}>
                    Suggested on the low-stock alert
                  </span>
                </div>

                <div>
                  <label htmlFor="product-turnaroundDays" style={fieldLabel}>
                    Lead time (days)
                  </label>
                  <input
                    id="product-turnaroundDays"
                    type="number"
                    min="0"
                    value={formData.turnaroundDays ?? ''}
                    placeholder="Optional"
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        turnaroundDays: wholeNumberOr(
                          e.target.value,
                          0,
                          undefined
                        ),
                      })
                    }
                    style={fieldInput}
                  />
                </div>
              </div>

              <div>
                <label htmlFor="product-tax" style={fieldLabel}>
                  GST treatment
                </label>
                <select
                  id="product-tax"
                  value={formData.taxTreatment ?? 'STANDARD'}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      taxTreatment: e.target.value as
                        'STANDARD' | 'ZERO_RATED' | 'EXEMPT',
                    })
                  }
                  style={fieldInput}
                >
                  <option value="STANDARD">Standard (GST applies)</option>
                  <option value="ZERO_RATED">Zero-rated</option>
                  <option value="EXEMPT">Exempt</option>
                </select>
              </div>

              <div>
                <label htmlFor="product-tags" style={fieldLabel}>
                  Tags
                </label>
                <input
                  id="product-tags"
                  type="text"
                  value={tagsText}
                  onChange={(e) => setTagsText(e.target.value)}
                  placeholder="Comma separated, e.g. personalisable, retail"
                  style={fieldInput}
                />
              </div>

              <p style={{ ...fieldHint, margin: 0 }}>
                Thumbnail and artwork files are added in the product&apos;s
                Assets panel after it is saved.
              </p>
            </div>

            {/* Footer Buttons */}
            <div
              style={{
                marginTop: '4px',
                paddingTop: '16px',
                borderTop: '1px solid #F5EEF2',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'flex-end',
                gap: '8px',
              }}
            >
              <button
                type="button"
                onClick={onClose}
                style={{
                  padding: '8px 14px',
                  borderRadius: '10px',
                  border: '1px solid #F0E6EC',
                  backgroundColor: '#FFFFFF',
                  color: '#2B253E',
                  fontSize: '0.82rem',
                  fontWeight: 600,
                }}
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                style={{
                  padding: '8px 14px',
                  borderRadius: '10px',
                  border: 'none',
                  backgroundColor: '#F73582',
                  color: '#FFFFFF',
                  fontSize: '0.82rem',
                  fontWeight: 600,
                  opacity: isSubmitting ? 0.5 : 1,
                }}
              >
                {isSubmitting
                  ? 'Saving...'
                  : isEditing
                    ? 'Update Product'
                    : 'Create Product'}
              </button>
            </div>
          </form>
        </motion.div>
      </div>
    </AnimatePresence>
  )
}

/** A whole number from an input, or the empty value when the box is cleared. */
function wholeNumberOr<E extends null | undefined>(
  value: string,
  min: number,
  empty: E
): number | E {
  if (value.trim() === '') return empty
  const parsed = Math.floor(Number(value))
  return Number.isFinite(parsed) ? Math.max(min, parsed) : empty
}

const fieldLabel: React.CSSProperties = {
  display: 'block',
  fontSize: '0.78rem',
  fontWeight: 600,
  color: '#5C566E',
  marginBottom: '6px',
}

const fieldInput: React.CSSProperties = {
  width: '100%',
  padding: '8px 12px',
  borderRadius: '10px',
  border: '1px solid #F0E6EC',
  fontSize: '0.84rem',
  backgroundColor: '#FFFFFF',
  color: '#2B253E',
}

const fieldHint: React.CSSProperties = {
  display: 'block',
  marginTop: '4px',
  fontSize: '0.72rem',
  fontWeight: 400,
  color: '#A39BB3',
}
