// src/components/dam/dam-format.ts
import { isDamImage, type DamFile } from '@/services/dam.service'

/**
 * Small, pure helpers for showing library files. Kept apart from the
 * components so the picker, the pages and the tiles all word a file the same
 * way.
 */

/** One step of the folder trail: what to call it and the path to ask for. */
export interface DamCrumb {
  readonly name: string
  readonly path: string
}

const SEPARATORS = /[\\/]/

/** Ticket-IT may send an empty or padded path for the root; both mean root. */
export function normaliseDamPath(path: string | null | undefined) {
  const trimmed = path?.trim()
  return trimmed ? trimmed : null
}

export function damExtension(name: string): string {
  const dot = name.lastIndexOf('.')
  return dot > 0 ? name.slice(dot + 1).toLowerCase() : ''
}

export function isDamPdf(file: Pick<DamFile, 'name' | 'contentType'>) {
  if (file.contentType) return file.contentType === 'application/pdf'
  return damExtension(file.name) === 'pdf'
}

/** "PNG", "PDF", "SVG" — short enough for a badge. */
export function damTypeLabel(file: Pick<DamFile, 'name' | 'contentType'>) {
  const ext = damExtension(file.name)
  if (ext && ext.length <= 5) {
    return ext === 'jpeg' || ext === 'jfif' ? 'JPG' : ext.toUpperCase()
  }
  // `image/svg+xml` reads better as SVG than as SVG+XML.
  const subtype = file.contentType?.split('/')[1]?.split('+')[0]
  return subtype ? subtype.toUpperCase() : 'File'
}

export function formatDamBytes(bytes: number | null): string {
  if (bytes === null) return 'Unknown size'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

/**
 * Ticket-IT's timestamps carry no zone. `Date` reads a zone-less ISO string as
 * local time, which is the least-wrong reading available; anything it cannot
 * parse is shown exactly as it came rather than hidden.
 */
export function formatDamUpdated(value: string | null): string {
  if (!value) return 'Unknown'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  })
}

/**
 * The trail for a path reached without walking to it (the picker's opening
 * folder, a folder found by search). Each crumb's path is the prefix up to it,
 * joined with whichever separator the path itself uses; the last crumb keeps
 * the path exactly as given, since that one is known to be valid.
 */
export function trailFromPath(path: string | null | undefined): DamCrumb[] {
  const full = normaliseDamPath(path)
  if (!full) return []

  const separator = full.includes('\\') && !full.includes('/') ? '\\' : '/'
  const leading = SEPARATORS.test(full[0]) ? separator : ''
  const segments = full.split(SEPARATORS).filter(Boolean)

  return segments.map((name, i) => ({
    name,
    path:
      i === segments.length - 1
        ? full
        : leading + segments.slice(0, i + 1).join(separator),
  }))
}

/**
 * The path to open for a search hit that is a folder.
 *
 * The mapper fills `folderPath` from whichever key Ticket-IT used, and for a
 * folder row that may be the folder's own path or its parent's. If the path
 * already ends in the folder's name it is taken as the folder's own; otherwise
 * the name is appended.
 */
export function folderHitPath(hit: Pick<DamFile, 'name' | 'folderPath'>) {
  const parent = normaliseDamPath(hit.folderPath)
  if (!parent) return hit.name
  const segments = parent.split(SEPARATORS).filter(Boolean)
  if (segments[segments.length - 1] === hit.name) return parent
  const separator = parent.includes('\\') && !parent.includes('/') ? '\\' : '/'
  return parent.endsWith(separator)
    ? `${parent}${hit.name}`
    : `${parent}${separator}${hit.name}`
}

/**
 * The folder a file sits in, or `fallback` when the library did not say.
 *
 * The mapper also accepts `path` and `filePath`, which some payloads use for
 * the file's own full path; a path ending in the file's name is cut back to
 * its parent so notes are looked up in the folder, not "folder/file.png".
 */
export function damFileFolder(
  file: Pick<DamFile, 'name' | 'folderPath'>,
  fallback: string | null
): string | null {
  const path = normaliseDamPath(file.folderPath)
  // A bare file name says nothing about the folder; keep the one we know.
  if (!path || path === file.name) return fallback
  const segments = path.split(SEPARATORS)
  if (segments[segments.length - 1] !== file.name) return path
  const parent = path.slice(0, path.length - file.name.length)
  return normaliseDamPath(parent.replace(/[\\/]+$/, ''))
}

/** Identifies a file across listings: names are only unique within a folder. */
export function damFileKey(
  file: Pick<DamFile, 'name'>,
  folderPath: string | null
) {
  return JSON.stringify([normaliseDamPath(folderPath), file.name])
}

/**
 * Why this file cannot be placed on a design, or null when it can. The design
 * tools need a picture a browser can load, so a PDF or a file the library gave
 * no address for is shown but not offered.
 */
export function damPickProblem(
  file: Pick<DamFile, 'name' | 'contentType' | 'url'>
): string | null {
  if (isDamPdf(file)) return 'PDFs cannot be placed on a design.'
  if (!isDamImage(file)) return 'Only images can be used here.'
  if (!file.url) return 'The library gave no link for this file.'
  return null
}
