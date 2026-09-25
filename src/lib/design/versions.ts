// src/lib/design/versions.ts
//
// Version history for a template.
//
// Backed by the API since `modules/templates` landed. Snapshots used to live in
// localStorage because the data source was an in-memory mock with no version
// endpoint, and the note here said swapping these two functions for API calls
// was the only change needed. This is that swap.
//
// Two consequences worth knowing:
//
//   * These are now async. The panel awaits them.
//   * A listed version carries no design document. The server holds the whole
//     snapshot, and sending forty of them to render a list of forty rows would
//     be megabytes to draw a scrollbar. Restoring asks the server to apply one
//     and hands back the restored template, which is what the canvas reloads
//     from — see `restoreTemplateVersion` in templates.service.
//
// The history is also no longer per-browser. A snapshot a colleague took on
// another machine is in this list, which is the point of moving it.

import {
  getTemplateVersions,
  snapshotTemplate,
} from '@/services/templates.service'

export type TemplateVersion = {
  id: string
  /** ISO timestamp of the save. */
  at: string
  /** 'Saved', 'Published', or a label the designer typed. */
  label: string
  /** Template version counter at the time of the save. */
  version: number
  /** Who took it. Null for a snapshot cut before authorship was recorded. */
  by?: string | null
  /** Whether this is the snapshot the storefront currently renders. */
  isPublished?: boolean
}

export async function listVersions(
  templateId: string
): Promise<TemplateVersion[]> {
  if (!templateId) return []

  try {
    const versions = await getTemplateVersions(templateId)
    // The API already returns newest first; the sort is here so a caller that
    // relies on the order does not depend on that staying true.
    return versions
      .map((version) => ({
        id: version.id,
        at: version.createdAt,
        label: version.label ?? 'Saved',
        version: version.version,
        by: version.createdByName,
        isPublished: version.isPublished,
      }))
      .sort((a, b) => (a.version < b.version ? 1 : -1))
  } catch {
    // A history that cannot be listed is an empty panel, never a broken
    // editor: the designer is mid-save and the snapshot list is the least
    // important thing on the screen.
    return []
  }
}

/**
 * Cuts a restore point from the current draft and returns the new history.
 *
 * A failed snapshot must never fail the save it belongs to — the design is
 * already stored by the time this runs, and losing a restore point is not
 * losing work.
 */
export async function saveVersion(
  templateId: string,
  entry: { label: string }
): Promise<TemplateVersion[]> {
  if (!templateId) return []

  try {
    await snapshotTemplate(templateId, entry.label)
  } catch {
    /* The design saved; only the restore point did not. */
  }

  return listVersions(templateId)
}

/** "just now", "4 min ago", "2 h ago", else a short date. */
export function relativeTime(iso: string): string {
  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return ''
  const secs = Math.max(0, Math.round((Date.now() - then) / 1000))
  if (secs < 45) return 'just now'
  const mins = Math.round(secs / 60)
  if (mins < 60) return `${mins} min ago`
  const hours = Math.round(mins / 60)
  if (hours < 24) return `${hours} h ago`
  return new Date(iso).toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}
