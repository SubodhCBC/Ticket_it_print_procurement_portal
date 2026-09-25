import type { PrintTemplate, PaginatedResult } from '@/types'
import { getDataSource } from '@/services/data-source'
import type {
  ApiAcceptedCustomisation,
  ApiCustomisableTemplate,
  ApiTemplateVersion,
  ApiTemplateVisibility,
} from '@/services/data-source/api/template.types'

/**
 * The template library.
 *
 * A pass-through to whichever adapter `getDataSource()` names, exactly like the
 * other domain services — the screens above never learn which side they are
 * talking to. It is the API adapter now; it was a fixture until the backend
 * module landed, and the swap was one line in `data-source/index.ts`.
 */

export async function getTemplates(params?: {
  page?: number
  pageSize?: number
  category?: string
  productId?: string
  status?: PrintTemplate['status'] | 'ALL'
  theme?: string
  search?: string
}): Promise<PaginatedResult<PrintTemplate>> {
  return getDataSource().templates.list(params)
}

export async function getTemplateById(
  id: string
): Promise<PrintTemplate | null> {
  return getDataSource().templates.getById(id)
}

export async function createTemplate(
  data: Omit<PrintTemplate, 'id' | 'createdAt' | 'updatedAt' | 'version'>
): Promise<PrintTemplate> {
  return getDataSource().templates.create(data)
}

export async function updateTemplate(
  id: string,
  data: Partial<PrintTemplate>
): Promise<PrintTemplate> {
  return getDataSource().templates.update(id, data)
}

export async function deleteTemplate(id: string): Promise<void> {
  return getDataSource().templates.remove(id)
}

/**
 * Publishing freezes an immutable version and points the storefront at it.
 *
 * Not a status change, which is why it has its own name here as well as its own
 * endpoint: unpublishing is reversible and changes nothing already ordered,
 * whereas publishing is the moment customers move onto new artwork.
 */
export async function publishTemplate(id: string): Promise<PrintTemplate> {
  return getDataSource().templates.setStatus(id, 'PUBLISHED')
}

export async function unpublishTemplate(id: string): Promise<PrintTemplate> {
  return getDataSource().templates.setStatus(id, 'DRAFT')
}

export async function archiveTemplate(id: string): Promise<PrintTemplate> {
  return getDataSource().templates.setStatus(id, 'ARCHIVED')
}

/**
 * Who can see an operator template: every account, or only the named ones.
 *
 * Admin only (TEMPLATE_MANAGE). The grant list is replaced wholesale, and
 * switching to ALL_ACCOUNTS deletes the existing grants on the server.
 */
export async function setTemplateVisibility(
  id: string,
  visibility: Extract<ApiTemplateVisibility, 'ALL_ACCOUNTS' | 'RESTRICTED'>,
  accountIds: string[]
): Promise<PrintTemplate> {
  return getDataSource().templates.setVisibility(id, visibility, accountIds)
}

// --- Version history -------------------------------------------------------------

export async function getTemplateVersions(
  templateId: string
): Promise<ApiTemplateVersion[]> {
  return getDataSource().templates.listVersions(templateId)
}

/** Cuts a restore point from the current draft without publishing it. */
export async function snapshotTemplate(
  templateId: string,
  label?: string
): Promise<ApiTemplateVersion[]> {
  return getDataSource().templates.snapshotVersion(templateId, label)
}

export async function restoreTemplateVersion(
  templateId: string,
  version: number
): Promise<PrintTemplate> {
  return getDataSource().templates.restoreVersion(templateId, version)
}

// --- Personalisation -------------------------------------------------------------

/**
 * The published artwork a buyer personalises.
 *
 * Deliberately not `getTemplateById`, which returns the designer's working
 * copy: a template being reworked must not change under somebody who is
 * halfway through ordering it.
 */
export async function getCustomisableTemplate(
  templateId: string
): Promise<ApiCustomisableTemplate> {
  return getDataSource().templates.getCustomisable(templateId)
}

/**
 * Checks a personalisation against the published template.
 *
 * Returns the accepted values and the version they were checked against — what
 * the cart line records, so the basket remembers the artwork the buyer saw. A
 * value aimed at a layer the designer locked comes back as an error rather than
 * being quietly dropped.
 */
export async function customiseTemplate(
  templateId: string,
  fields: Record<string, string>
): Promise<ApiAcceptedCustomisation> {
  return getDataSource().templates.customise(templateId, fields)
}
