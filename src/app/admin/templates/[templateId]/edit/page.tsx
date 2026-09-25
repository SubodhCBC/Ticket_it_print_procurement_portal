// src/app/admin/templates/[templateId]/edit/page.tsx
'use client'

import { SkeletonStudio } from '@/components/ui/Skeleton'
import { useParams } from 'next/navigation'
import { useTemplate } from '@/hooks/useTemplates'
import { TemplateBuilderStudio } from '@/components/admin/TemplateBuilderStudio'

export default function AdminTemplateEditPage() {
  const params = useParams()
  const templateId = params?.templateId as string
  // Fresh, not cached: the builder saves against the version it opens with.
  const { template, isLoading } = useTemplate(templateId, { fresh: true })

  if (isLoading) {
    return <SkeletonStudio label="Loading the template builder" />
  }

  if (!template) {
    return (
      <div style={{ padding: '48px', textAlign: 'center', color: '#ef4444' }}>
        Template not found.
      </div>
    )
  }

  return <TemplateBuilderStudio initialTemplate={template} isNew={false} />
}
