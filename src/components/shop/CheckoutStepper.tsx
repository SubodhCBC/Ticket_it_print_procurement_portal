// src/components/shop/CheckoutStepper.tsx
'use client'

import { usePathname } from 'next/navigation'
import { Check } from 'lucide-react'

export function CheckoutStepper() {
  const pathname = usePathname()

  const steps = [
    {
      id: 'details',
      label: 'Site & PO Reference',
      sublabel: 'Account details',
      href: '/shop/checkout/details',
      number: 1,
    },
    {
      id: 'delivery',
      label: 'Delivery & Addresses',
      sublabel: 'Bill-to & Ship-to',
      href: '/shop/checkout/delivery',
      number: 2,
    },
    {
      id: 'review',
      label: 'Review & Submit',
      sublabel: 'On-account checkout',
      href: '/shop/checkout/review',
      number: 3,
    },
  ]

  const getCurrentStepIndex = () => {
    if (pathname.includes('/checkout/details')) return 0
    if (pathname.includes('/checkout/delivery')) return 1
    if (pathname.includes('/checkout/review')) return 2
    return 0
  }

  const currentIdx = getCurrentStepIndex()

  // Half a column: the connecting line runs from the centre of the first step
  // to the centre of the last, whatever the width of their labels.
  const lineInset = `${100 / (steps.length * 2)}%`

  // No card, no icons, no halo. The stepper says where the buyer is; the page
  // under it is what they are working on, so it should not compete with it.
  return (
    <div style={{ width: '100%' }}>
      <div
        style={{
          position: 'relative',
          display: 'grid',
          gridTemplateColumns: `repeat(${steps.length}, minmax(0, 1fr))`,
          maxWidth: '600px',
          margin: '0 auto',
        }}
      >
        {/* Progress Line */}
        <div
          style={{
            position: 'absolute',
            top: '12px',
            left: lineInset,
            right: lineInset,
            height: '1px',
            backgroundColor: '#F0E6EC',
            zIndex: 1,
          }}
        >
          <div
            style={{
              height: '100%',
              backgroundColor: '#F73582',
              width: `${(currentIdx / (steps.length - 1)) * 100}%`,
              transition: 'width 0.3s ease-out',
            }}
          />
        </div>

        {steps.map((step, idx) => {
          const isCompleted = idx < currentIdx
          const isCurrent = idx === currentIdx

          return (
            <div
              key={step.id}
              style={{
                position: 'relative',
                zIndex: 2,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                minWidth: 0,
                padding: '0 4px',
              }}
            >
              <div
                style={{
                  width: '24px',
                  height: '24px',
                  borderRadius: '50%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '0.72rem',
                  fontWeight: 600,
                  transition: 'background-color 0.2s ease',
                  backgroundColor: isCurrent ? '#F73582' : '#FFFFFF',
                  color: isCurrent
                    ? '#FFFFFF'
                    : isCompleted
                      ? '#F73582'
                      : '#A39BB3',
                  border:
                    isCompleted || isCurrent
                      ? '1px solid #F73582'
                      : '1px solid #DCD3E0',
                }}
              >
                {isCompleted ? (
                  <Check size={12} strokeWidth={2.5} />
                ) : (
                  step.number
                )}
              </div>

              <div style={{ marginTop: '6px', textAlign: 'center' }}>
                <span
                  style={{
                    fontSize: '0.78rem',
                    fontWeight: isCurrent ? 600 : 500,
                    display: 'block',
                    color: isCurrent
                      ? '#2B253E'
                      : isCompleted
                        ? '#6E6781'
                        : '#A39BB3',
                  }}
                >
                  {step.label}
                </span>
                <span
                  style={{
                    fontSize: '0.72rem',
                    color: '#A39BB3',
                    fontWeight: 400,
                  }}
                >
                  {step.sublabel}
                </span>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
