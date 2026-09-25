// src/app/admin/templates/builder/page.tsx
'use client'

import { TemplateBuilderStudio } from '@/components/admin/TemplateBuilderStudio'
import { StudioSmallScreenGuard } from '../_components/StudioSmallScreen'

export default function AdminTemplateBuilderPage() {
  return (
    <StudioSmallScreenGuard>
      <TemplateBuilderStudio isNew={true} />
    </StudioSmallScreenGuard>
  )
}
