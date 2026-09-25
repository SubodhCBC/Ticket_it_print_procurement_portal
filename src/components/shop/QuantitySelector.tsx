// src/components/shop/QuantitySelector.tsx
'use client'

import React, { useState } from 'react'
import { Plus, Minus, AlertCircle } from 'lucide-react'
import type { OrderableProduct } from '@/types'
import { validateProductQty } from '@/store/cartSlice'

interface QuantitySelectorProps {
  product: OrderableProduct
  value: number
  onChange: (qty: number, isValid: boolean) => void
  size?: 'sm' | 'md' | 'lg'
  disabled?: boolean
  showInlineHelp?: boolean
}

export function QuantitySelector({
  product,
  value,
  onChange,
  size = 'md',
  disabled = false,
  showInlineHelp = true,
}: QuantitySelectorProps) {
  const moq = product.moq || 1
  const multiple = product.orderMultiple || 1
  const [inputValue, setInputValue] = useState<string>(String(value))
  const [error, setError] = useState<string | null>(() =>
    validateProductQty(product, value)
  )

  // When the parent changes the value or product, the field follows it.
  // Adjusted during render, which React prefers to syncing in an effect.
  const [synced, setSynced] = useState({ value, product })
  if (synced.value !== value || synced.product !== product) {
    setSynced({ value, product })
    setInputValue(String(value))
    setError(validateProductQty(product, value))
  }

  const handleStep = (direction: 'up' | 'down') => {
    if (disabled) return
    const current = parseInt(inputValue, 10) || moq
    let next: number

    if (direction === 'up') {
      if (current < moq) {
        next = moq
      } else {
        next = current + multiple
      }
    } else {
      next = current - multiple
      if (next < moq) {
        next = moq
      }
    }

    const err = validateProductQty(product, next)
    setError(err)
    setInputValue(String(next))
    onChange(next, err === null)
  }

  const handleManualInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value
    setInputValue(raw)
    const parsed = parseInt(raw, 10)

    if (isNaN(parsed) || raw.trim() === '') {
      setError('Please enter a valid quantity')
      onChange(0, false)
      return
    }

    const err = validateProductQty(product, parsed)
    setError(err)
    onChange(parsed, err === null)
  }

  const dims = {
    sm: { btn: 28, inputWidth: 44, fontSize: '0.78rem' },
    md: { btn: 34, inputWidth: 56, fontSize: '0.84rem' },
    lg: { btn: 42, inputWidth: 68, fontSize: '0.95rem' },
  }[size]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
      <div style={{ display: 'inline-flex', alignItems: 'center' }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            borderRadius: '10px',
            border: error ? '1px solid #DC2626' : '1px solid #F0E6EC',
            backgroundColor: disabled ? '#FCF7FA' : '#FFFFFF',
            overflow: 'hidden',
            opacity: disabled ? 0.5 : 1,
          }}
        >
          <button
            type="button"
            onClick={() => handleStep('down')}
            disabled={disabled || value <= moq}
            aria-label="Decrease quantity"
            style={{
              width: `${dims.btn}px`,
              height: `${dims.btn}px`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#6E6781',
              cursor: disabled || value <= moq ? 'not-allowed' : 'pointer',
              backgroundColor: 'transparent',
              border: 'none',
              opacity: disabled || value <= moq ? 0.5 : 1,
              transition: 'background-color 0.15s ease',
            }}
          >
            <Minus size={size === 'sm' ? 12 : 14} />
          </button>

          <input
            type="number"
            value={inputValue}
            onChange={handleManualInput}
            disabled={disabled}
            min={moq}
            step={multiple}
            style={{
              width: `${dims.inputWidth}px`,
              height: `${dims.btn}px`,
              fontWeight: 600,
              fontSize: dims.fontSize,
              textAlign: 'center',
              color: '#2B253E',
              backgroundColor: 'transparent',
              border: 'none',
              borderLeft: '1px solid #F0E6EC',
              borderRight: '1px solid #F0E6EC',
              outline: 'none',
              padding: 0,
            }}
          />

          <button
            type="button"
            onClick={() => handleStep('up')}
            disabled={disabled}
            aria-label="Increase quantity"
            style={{
              width: `${dims.btn}px`,
              height: `${dims.btn}px`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#6E6781',
              cursor: disabled ? 'not-allowed' : 'pointer',
              backgroundColor: 'transparent',
              border: 'none',
              transition: 'background-color 0.15s ease',
            }}
          >
            <Plus size={size === 'sm' ? 12 : 14} />
          </button>
        </div>

        {/* UOM / Pack size */}
        <span
          style={{
            marginLeft: '8px',
            fontSize: '0.74rem',
            fontWeight: 500,
            color: '#A39BB3',
            whiteSpace: 'nowrap',
          }}
        >
          {product.uom || 'units'}
          {product.packSize ? ` (${product.packSize})` : ''}
        </span>
      </div>

      {/* Rules & error text */}
      {showInlineHelp && (
        <div style={{ minHeight: '16px' }}>
          {error ? (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                fontSize: '0.74rem',
                color: '#DC2626',
                fontWeight: 500,
              }}
            >
              <AlertCircle size={12} color="#DC2626" />
              <span>{error}</span>
            </div>
          ) : moq > 1 || multiple > 1 ? (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                fontSize: '0.72rem',
                color: '#A39BB3',
              }}
            >
              <span>
                {moq > 1 && `MOQ: ${moq}`}
                {moq > 1 && multiple > 1 && ' • '}
                {multiple > 1 && `Multiple of ${multiple}`}
              </span>
            </div>
          ) : null}
        </div>
      )}
    </div>
  )
}
