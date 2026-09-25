// src/app/shop/templates/customize/[templateId]/page.tsx
'use client'

import { SkeletonStudio } from '@/components/ui/Skeleton'
import { useParams, useSearchParams } from 'next/navigation'
import { useSelector } from 'react-redux'
import type { RootState } from '@/store'
import { useCustomisableTemplate } from '@/hooks/useTemplates'
import { toCustomisableTemplate } from '@/services/data-source/api/api-templates.adapter'
import { TemplateCustomizerStudio } from '@/components/shop/TemplateCustomizerStudio'

/**
 * The buyer's personalisation studio.
 *
 * Reads the **published snapshot**, not the designer's working copy.
 *
 * `useTemplate` would have been the obvious hook and the wrong one: it returns
 * the draft. A site user cannot see an unpublished *template* — the visibility
 * filter stops that — but on a template that is already published they would
 * have been shown the designer's unsaved rework and personalised artwork nobody
 * has approved. The frozen version is the whole point, and this is where it is
 * honoured.
 */
export default function ShopTemplateCustomizePage() {
  const params = useParams()
  const searchParams = useSearchParams()
  const templateId = params?.templateId as string
  const { template: published, isLoading } = useCustomisableTemplate(templateId)

  /**
   * The basket line being re-opened, when there is one.
   *
   * `?line=` is how the cart sends a buyer back to a personalisation they
   * saved. Read from the basket already in the store rather than fetched: the
   * cart is loaded for every signed-in buyer, and a second request for a row
   * that is already in memory is a slower page for nothing.
   */
  const lineId = searchParams?.get('line') ?? undefined
  const savedLine = useSelector((state: RootState) =>
    lineId ? state.cart.items.find((item) => item.id === lineId) : undefined
  )

  if (isLoading) {
    return <SkeletonStudio label="Loading the personalisation studio" />
  }

  if (!published) {
    // The studio route has no padding from SaaSLayout's <main>, so this state
    // carries its own.
    return (
      <div
        style={{
          padding: '32px',
          textAlign: 'center',
          fontSize: '0.84rem',
          color: '#DC2626',
        }}
      >
        Template not found or not published.
      </div>
    )
  }

  const { template, versionId, version } = toCustomisableTemplate(published)

  return (
    <TemplateCustomizerStudio
      template={template}
      // The server's field list, not a second derivation of it in the studio.
      fields={published.fields}
      templateVersionId={versionId}
      templateVersion={version}
      existingLineId={savedLine ? lineId : undefined}
      savedValues={
        (savedLine?.customisation as Record<string, string> | undefined) ??
        undefined
      }
      // What the line was ordered as, so re-opening it starts on the same
      // quantity and stock rather than the defaults.
      savedQuantity={savedLine?.qty}
      savedOptions={savedLine?.options ?? undefined}
    />
  )
}
