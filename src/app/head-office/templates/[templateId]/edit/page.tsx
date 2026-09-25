'use client'

import { SkeletonStudio } from '@/components/ui/Skeleton'
import { useParams } from 'next/navigation'
import { useTemplate } from '@/hooks/useTemplates'
import { TemplateBuilderStudio } from '@/components/admin/TemplateBuilderStudio'

/**
 * The same studio the operator uses, on a template of your own.
 *
 * `mode="owned"` swaps the Personalisation tab for Editable Fields: the layers
 * the designer opened up are filled in here rather than chosen. Everything else
 * — the canvas, the components, the properties panel — is the same, because the
 * ask was for the full builder and not a reduced one.
 *
 * The server refuses a save on a template that is not yours whatever this page
 * renders; this is the half that keeps someone from getting as far as trying.
 */
export default function EditTemplatePage() {
  const params = useParams()
  const templateId = params?.templateId as string
  // Fresh, not cached: the builder saves against the version it opens with.
  const { template, isLoading } = useTemplate(templateId, { fresh: true })

  if (isLoading) return <SkeletonStudio label="Loading your template" />
  if (!template) return <div style={wrap}>Template not found.</div>

  return (
    <TemplateBuilderStudio
      initialTemplate={template}
      isNew={false}
      mode="owned"
      canPublish
      // Under the portal's top bar: fill what is left of the window, not all of it.
      fitParent
    />
  )
}

const wrap: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  height: '60vh',
  color: '#A39BB3',
}
