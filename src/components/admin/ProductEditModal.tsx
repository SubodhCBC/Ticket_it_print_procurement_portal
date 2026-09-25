// src/components/admin/ProductEditModal.tsx
'use client'

import React, { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X } from 'lucide-react'
import type { Product, ProductCategory } from '@/types'
import type { ApiUom } from '@/services/data-source/api/catalog.types'
import { FieldError, fieldOutline } from '@/components/ui/FormField'
import {
  packSizeLabel,
  parsePackSize,
  toApiUom,
  uomCode,
  UOM_OPTIONS,
} from '@/services/data-source/api/product.mapper'

/**
 * The SKU box starts empty.
 *
 * It used to open pre-filled with `SKU-4821` — a random number dressed up as a
 * product code. Anyone who did not notice created a product whose code means
 * nothing, and the code is the key imports, orders and invoices match on. An
 * example belongs in the placeholder, where it cannot be saved by accident.
 */
const SKU_EXAMPLE = 'BC-SOFT-90X55'

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

/** The fields this form can refuse on its own, before the server sees them. */
type ProductField = 'name' | 'sku' | 'widthMm' | 'heightMm'
type ProductErrors = Partial<Record<ProductField, string>>

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
  /** The server's refusal only; anything this form can see belongs to a field. */
  const [error, setError] = useState<string | null>(null)
  const [errors, setErrors] = useState<ProductErrors>({})

  // Reseeded whenever it opens or is handed a different product or category
  // list. Adjusted during render rather than in an effect, so the form never
  // paints the previous product's values first.
  //
  // The categories are compared by their ids joined into a string, not by the
  // identity of the array. `useProducts` returns `query.data ?? []` — a brand
  // new empty array on every render while that query is loading or failed — so
  // comparing references reseeded the form, which set state during render,
  // which rendered again: "Too many re-renders", with the modal open and the
  // typing lost.
  const categoriesKey = categories.map((c) => c.id).join(',')
  const [seededFor, setSeededFor] = useState<{
    product: typeof product
    categoriesKey: string
    isOpen: boolean
  } | null>(null)
  if (
    !seededFor ||
    seededFor.product !== product ||
    seededFor.categoriesKey !== categoriesKey ||
    seededFor.isOpen !== isOpen
  ) {
    setSeededFor({ product, categoriesKey, isOpen })
    setTagsText((product?.tags ?? []).join(', '))
    if (product) {
      setFormData(product)
    } else {
      setFormData({
        sku: '',
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
    setErrors({})
  }

  if (!isOpen) return null

  /** A field stops being wrong the moment it is edited. */
  const clearError = (key: ProductField) =>
    setErrors((previous) => {
      if (!previous[key]) return previous
      const next = { ...previous }
      delete next[key]
      return next
    })

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

  /**
   * A millimetre field, or nothing.
   *
   * Empty is not zero: a product with no fixed size — a design service — has no
   * trim, and the template studio leaves the artboard alone for it rather than
   * collapsing it to nothing.
   */
  const setMm = (
    key: 'widthMm' | 'heightMm' | 'bleedMm' | 'safeMarginMm',
    raw: string
  ) => {
    const trimmed = raw.trim()
    const value = trimmed === '' ? null : Number(trimmed)
    if (key === 'widthMm' || key === 'heightMm') clearError(key)
    setFormData({
      ...formData,
      [key]:
        value !== null && Number.isFinite(value) && value > 0 ? value : null,
    })
  }

  const trimOrientation =
    formData.widthMm && formData.heightMm
      ? formData.widthMm > formData.heightMm
        ? 'landscape'
        : formData.widthMm < formData.heightMm
          ? 'portrait'
          : 'square'
      : null

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    // Every field is checked in one pass, so the form is not discovered to be
    // wrong one refusal at a time.
    const found: ProductErrors = {}
    if (!formData.name?.trim()) found.name = 'Enter a product name.'
    if (!formData.sku?.trim()) {
      found.sku = 'Enter a SKU — it is the key used by imports and invoices.'
    }

    // Print size is optional, but half of it is not: the studio needs both
    // sides to build an artboard.
    const width = formData.widthMm ?? null
    const height = formData.heightMm ?? null
    if (width !== null && width < 1) {
      found.widthMm = 'Trim width must be at least 1 mm.'
    } else if (width === null && height !== null) {
      found.widthMm = 'Enter the trim width too, or clear the height.'
    }
    if (height !== null && height < 1) {
      found.heightMm = 'Trim height must be at least 1 mm.'
    } else if (height === null && width !== null) {
      found.heightMm = 'Enter the trim height too, or clear the width.'
    }

    setErrors(found)
    if (Object.values(found).some(Boolean)) return

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
            noValidate
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
                  htmlFor="product-name"
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
                  id="product-name"
                  type="text"
                  value={formData.name}
                  aria-invalid={errors.name ? true : undefined}
                  aria-describedby={
                    errors.name ? 'product-name-error' : undefined
                  }
                  onChange={(e) => {
                    clearError('name')
                    setFormData({ ...formData, name: e.target.value })
                  }}
                  placeholder="e.g. Validated Cold-Chain Thermal Tote 12L"
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: '10px',
                    fontSize: '0.84rem',
                    color: '#2B253E',
                    ...fieldOutline(Boolean(errors.name)),
                  }}
                />
                {errors.name && (
                  <FieldError id="product-name-error">{errors.name}</FieldError>
                )}
              </div>

              <div>
                <label
                  htmlFor="product-sku"
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
                  id="product-sku"
                  type="text"
                  value={formData.sku}
                  aria-invalid={errors.sku ? true : undefined}
                  aria-describedby={
                    errors.sku ? 'product-sku-error' : undefined
                  }
                  onChange={(e) => {
                    clearError('sku')
                    setFormData({ ...formData, sku: e.target.value })
                  }}
                  placeholder={`e.g. ${SKU_EXAMPLE}`}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: '10px',
                    fontSize: '0.84rem',
                    color: '#2B253E',
                    fontFamily: 'monospace',
                    ...fieldOutline(Boolean(errors.sku)),
                  }}
                />
                {errors.sku && (
                  <FieldError id="product-sku-error">{errors.sku}</FieldError>
                )}
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
                placeholder="e.g. 400gsm uncoated stock, printed both sides, rounded corners"
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

            {/* Print size (SOW AD-3). The template studio builds its artboard
                from these millimetres: without them a business card opens as
                the template's default A4 sheet, and the designer draws the
                wrong thing. Optional, because a design service has no trim. */}
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '12px',
                paddingTop: '14px',
                borderTop: '1px solid #F5EEF2',
              }}
            >
              <div>
                <span style={{ ...fieldLabel, marginBottom: '2px' }}>
                  Print size
                </span>
                <span style={fieldHint}>
                  The finished trim, in millimetres. A business card is 90 × 55;
                  make the height the larger number for a portrait card. The
                  design studio sizes its artboard from this. Leave empty for
                  something with no fixed size, like a design service.
                </span>
              </div>

              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(2, 1fr)',
                  gap: '12px',
                }}
              >
                <div>
                  <label htmlFor="product-widthMm" style={fieldLabel}>
                    Trim width (mm)
                  </label>
                  <input
                    id="product-widthMm"
                    type="number"
                    min="1"
                    step="1"
                    placeholder="e.g. 90"
                    value={formData.widthMm ?? ''}
                    aria-invalid={errors.widthMm ? true : undefined}
                    aria-describedby={
                      errors.widthMm ? 'product-widthMm-error' : undefined
                    }
                    onChange={(e) => setMm('widthMm', e.target.value)}
                    style={{
                      ...fieldInput,
                      ...fieldOutline(Boolean(errors.widthMm)),
                    }}
                  />
                  {errors.widthMm && (
                    <FieldError id="product-widthMm-error">
                      {errors.widthMm}
                    </FieldError>
                  )}
                </div>

                <div>
                  <label htmlFor="product-heightMm" style={fieldLabel}>
                    Trim height (mm)
                  </label>
                  <input
                    id="product-heightMm"
                    type="number"
                    min="1"
                    step="1"
                    placeholder="e.g. 55"
                    value={formData.heightMm ?? ''}
                    aria-invalid={errors.heightMm ? true : undefined}
                    aria-describedby={
                      errors.heightMm ? 'product-heightMm-error' : undefined
                    }
                    onChange={(e) => setMm('heightMm', e.target.value)}
                    style={{
                      ...fieldInput,
                      ...fieldOutline(Boolean(errors.heightMm)),
                    }}
                  />
                  {errors.heightMm && (
                    <FieldError id="product-heightMm-error">
                      {errors.heightMm}
                    </FieldError>
                  )}
                </div>

                <div>
                  <label htmlFor="product-bleedMm" style={fieldLabel}>
                    Bleed (mm)
                  </label>
                  <input
                    id="product-bleedMm"
                    type="number"
                    min="0"
                    step="0.5"
                    placeholder="e.g. 3"
                    value={formData.bleedMm ?? ''}
                    onChange={(e) => setMm('bleedMm', e.target.value)}
                    style={fieldInput}
                  />
                  <span style={fieldHint}>
                    How far artwork runs past the trim.
                  </span>
                </div>

                <div>
                  <label htmlFor="product-safeMarginMm" style={fieldLabel}>
                    Safe margin (mm)
                  </label>
                  <input
                    id="product-safeMarginMm"
                    type="number"
                    min="0"
                    step="0.5"
                    placeholder="e.g. 4"
                    value={formData.safeMarginMm ?? ''}
                    onChange={(e) => setMm('safeMarginMm', e.target.value)}
                    style={fieldInput}
                  />
                  <span style={fieldHint}>
                    Nothing important crosses this inset.
                  </span>
                </div>
              </div>

              {trimOrientation && (
                <span style={{ ...fieldHint, marginTop: 0 }}>
                  {formData.widthMm} × {formData.heightMm} mm ·{' '}
                  {trimOrientation} artboard in the design studio.
                </span>
              )}
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
                    placeholder="e.g. 50"
                    value={formData.lowStockThreshold ?? ''}
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
                    Reorder quantity (optional)
                  </label>
                  <input
                    id="product-reorderQuantity"
                    type="number"
                    min="1"
                    placeholder="e.g. 500"
                    value={formData.reorderQuantity ?? ''}
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
                    Lead time in days (optional)
                  </label>
                  <input
                    id="product-turnaroundDays"
                    type="number"
                    min="0"
                    placeholder="e.g. 5"
                    value={formData.turnaroundDays ?? ''}
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
                  placeholder="e.g. personalisable, retail"
                  style={fieldInput}
                />
                <span style={fieldHint}>Separate tags with commas.</span>
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
