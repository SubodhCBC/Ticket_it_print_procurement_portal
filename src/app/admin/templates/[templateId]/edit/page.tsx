// src/app/admin/templates/[templateId]/edit/page.tsx
'use client'

import { SkeletonStudio } from '@/components/ui/Skeleton'
import { useParams } from 'next/navigation'
import { useTemplate } from '@/hooks/useTemplates'
import { TemplateBuilderStudio } from '@/components/admin/TemplateBuilderStudio'
import {
  STUDIO_TOO_NARROW,
  StudioNeedsWiderScreen,
  StudioSmallScreenGuard,
} from '../../_components/StudioSmallScreen'
import { useMediaQuery } from '@/hooks/useMediaQuery'

export default function AdminTemplateEditPage() {
  const params = useParams()
  const templateId = params?.templateId as string
  // Fresh, not cached: the builder saves against the version it opens with.
  const { template, isLoading } = useTemplate(templateId, { fresh: true })
  const tooNarrow = useMediaQuery(STUDIO_TOO_NARROW)

  // Checked before the fetch is waited on: a phone is told the studio needs a
  // wider screen straight away, rather than after a skeleton it cannot use.
  if (tooNarrow) {
    return <StudioNeedsWiderScreen />
  }

  if (isLoading) {
    return <SkeletonStudio label="Loading the template builder" />
  }

  if (!template) {
    return (
      <main
        className="page-pad"
        style={{
          paddingBlock: '48px',
          textAlign: 'center',
          color: '#ef4444',
        }}
      >
        Template not found.
      </main>
    )
  }

  return (
    <StudioSmallScreenGuard>
      <TemplateBuilderStudio initialTemplate={template} isNew={false} />
    </StudioSmallScreenGuard>
  )
}
