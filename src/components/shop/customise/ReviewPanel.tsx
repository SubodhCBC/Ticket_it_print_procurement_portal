// src/components/shop/customise/ReviewPanel.tsx
'use client'

import { Fragment, type RefObject } from 'react'
import { AlertCircle, Check } from 'lucide-react'
import type { ReviewIssue, ReviewSide } from '@/lib/design/review-checks'
import { T, errorBox, primaryButton, secondaryButton } from './theme'

interface ReviewPanelProps {
  headingId: string
  headingRef: RefObject<HTMLHeadingElement | null>
  issues: ReviewIssue[]
  approved: boolean
  onApprovedChange: (approved: boolean) => void
  showApprovalError: boolean
  checkboxRef: RefObject<HTMLInputElement | null>
  onContinue: () => void
  onEdit: () => void
  /** Hover or focus on a field name; null when it ends. */
  onHighlight: (issue: ReviewIssue | null) => void
  /** A field name was clicked: go and fix it. */
  onIssueClick: (issue: ReviewIssue) => void
}

const CHECKS = [
  'Text is clear and easy to read',
  'Information is spelled correctly',
  'Images are sharp with no blurring',
]

/** What the red card says, told straight: what was found and what happens. */
function explain(issues: ReviewIssue[]): { title: string; body: string[] } {
  const unchanged = issues.some((issue) => issue.kind === 'unchanged-text')
  const emptyText = issues.some((issue) => issue.kind === 'empty-text')
  const emptyImage = issues.some((issue) => issue.kind === 'empty-image')

  const title =
    emptyImage && !unchanged && !emptyText
      ? 'Your design has empty picture spaces'
      : emptyImage
        ? 'Your design has details to check'
        : 'Your design has empty text fields'

  const body: string[] = []
  if (unchanged) {
    body.push(
      "We noticed you didn't change the placeholder text below. If you continue, it will print exactly as shown."
    )
  }
  if (emptyText) {
    body.push('Some text boxes below are empty, so nothing will print in them.')
  }
  if (emptyImage) {
    body.push(
      "Some picture spaces below don't have a picture yet. If you continue, they will print as they look in the preview."
    )
  }
  return { title, body }
}

const SIDE_LABEL: Record<ReviewSide, string> = { front: 'Front', back: 'Back' }

export function ReviewPanel({
  headingId,
  headingRef,
  issues,
  approved,
  onApprovedChange,
  showApprovalError,
  checkboxRef,
  onContinue,
  onEdit,
  onHighlight,
  onIssueClick,
}: ReviewPanelProps) {
  const { title, body } = explain(issues)
  const bySide = (['front', 'back'] as const)
    .map((side) => ({
      side,
      items: issues.filter((issue) => issue.side === side),
    }))
    .filter((group) => group.items.length > 0)
  const approvalError = showApprovalError && !approved

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div>
        <h2
          id={headingId}
          ref={headingRef}
          tabIndex={-1}
          style={{
            margin: 0,
            fontSize: '1.4rem',
            fontWeight: 700,
            color: T.text,
            letterSpacing: '-0.01em',
          }}
        >
          Review your design
        </h2>
        <p
          style={{
            margin: '6px 0 0',
            fontSize: '0.88rem',
            color: T.secondary,
            lineHeight: 1.5,
          }}
        >
          Double-check the following details before you continue.
        </p>
      </div>

      <ul
        style={{
          listStyle: 'none',
          margin: 0,
          padding: 0,
          display: 'flex',
          flexDirection: 'column',
          gap: '10px',
        }}
      >
        {CHECKS.map((check) => (
          <li
            key={check}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              fontSize: '0.86rem',
              color: T.text,
            }}
          >
            <span
              aria-hidden="true"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: '20px',
                height: '20px',
                borderRadius: '50%',
                backgroundColor: T.accentSoft,
                color: T.accent,
                flexShrink: 0,
              }}
            >
              <Check size={12} strokeWidth={3} />
            </span>
            {check}
          </li>
        ))}
      </ul>

      {issues.length > 0 && (
        <div
          style={{
            padding: '14px 16px',
            borderRadius: '12px',
            backgroundColor: T.errorBg,
            border: `1px solid ${T.errorBorder}`,
            display: 'flex',
            gap: '10px',
          }}
        >
          <AlertCircle
            size={18}
            color={T.errorText}
            style={{ flexShrink: 0, marginTop: '1px' }}
            aria-hidden="true"
          />
          <div style={{ minWidth: 0 }}>
            <div
              style={{ fontSize: '0.88rem', fontWeight: 700, color: T.text }}
            >
              {title}
            </div>
            {body.map((line) => (
              <p
                key={line}
                style={{
                  margin: '6px 0 0',
                  fontSize: '0.82rem',
                  color: T.secondary,
                  lineHeight: 1.5,
                }}
              >
                {line}
              </p>
            ))}
            <div
              style={{
                marginTop: '10px',
                display: 'flex',
                flexDirection: 'column',
                gap: '6px',
              }}
            >
              {bySide.map((group) => (
                <div
                  key={group.side}
                  style={{
                    fontSize: '0.84rem',
                    color: T.text,
                    lineHeight: 1.6,
                  }}
                >
                  <span style={{ fontWeight: 700 }}>
                    {SIDE_LABEL[group.side]}:
                  </span>{' '}
                  {group.items.map((issue, index) => (
                    <Fragment key={issue.key}>
                      {index > 0 && ', '}
                      <button
                        type="button"
                        title="Show on the preview · click to edit"
                        onMouseEnter={() => onHighlight(issue)}
                        onMouseLeave={() => onHighlight(null)}
                        onFocus={() => onHighlight(issue)}
                        onBlur={() => onHighlight(null)}
                        onClick={() => onIssueClick(issue)}
                        style={{
                          background: 'none',
                          border: 'none',
                          padding: 0,
                          font: 'inherit',
                          fontWeight: 500,
                          color: T.text,
                          textDecoration: 'underline',
                          textUnderlineOffset: '3px',
                          textDecorationColor: T.errorText,
                          cursor: 'pointer',
                          borderRadius: '3px',
                        }}
                      >
                        {issue.label}
                      </button>
                    </Fragment>
                  ))}
                </div>
              ))}
            </div>
            <p
              style={{
                margin: '10px 0 0',
                fontSize: '0.76rem',
                color: T.muted,
              }}
            >
              Hover over a name to see it on your design, or click it to go back
              and edit.
            </p>
          </div>
        </div>
      )}

      <div
        style={{
          borderTop: `1px solid ${T.border}`,
          paddingTop: '18px',
          display: 'flex',
          flexDirection: 'column',
          gap: '12px',
        }}
      >
        <label
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            gap: '10px',
            fontSize: '0.86rem',
            color: T.text,
            lineHeight: 1.45,
            cursor: 'pointer',
          }}
        >
          <input
            ref={checkboxRef}
            type="checkbox"
            checked={approved}
            onChange={(e) => onApprovedChange(e.target.checked)}
            aria-invalid={approvalError}
            aria-describedby={
              approvalError ? `${headingId}-approval` : undefined
            }
            style={{
              width: '18px',
              height: '18px',
              marginTop: '1px',
              accentColor: T.accent,
              flexShrink: 0,
              cursor: 'pointer',
            }}
          />
          I have authorization to use the design, I have reviewed and approve
          it.
        </label>

        {approvalError && (
          <div id={`${headingId}-approval`} role="alert" style={errorBox}>
            Please check the approval box to indicate that you approve this
            design
          </div>
        )}

        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '10px',
            marginTop: '4px',
          }}
        >
          <button
            type="button"
            onClick={onContinue}
            style={{ ...primaryButton(), width: '100%', padding: '12px 18px' }}
          >
            Continue
          </button>
          <button
            type="button"
            onClick={onEdit}
            style={{
              ...secondaryButton(),
              width: '100%',
              padding: '11px 18px',
            }}
          >
            Edit my design
          </button>
        </div>
      </div>
    </div>
  )
}
