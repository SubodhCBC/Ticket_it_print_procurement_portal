// src/components/admin/ProductAdminUtils.ts
import { ApiError } from '@/services/api.service'

/**
 * Small helpers shared by the catalogue admin screens. Kept out of the `.tsx`
 * component module so that file exports components only.
 */

/** Money as the API validates it: up to ten digits and two decimals. */
export const MONEY_PATTERN = /^\d{1,10}(\.\d{1,2})?$/

/**
 * The message an administrator should see for a failed call.
 *
 * The API's own message first — it is written for exactly this reader, e.g.
 * "This category still has 3 product(s)…". A validation failure adds its
 * per-field issues, since "Request validation failed" alone says nothing.
 */
export function errorMessage(error: unknown, fallback: string): string {
  if (error instanceof ApiError) {
    const issues = error.details?.issues
    if (Array.isArray(issues) && issues.length > 0) {
      const detail = issues
        .slice(0, 5)
        .map((issue) => {
          const entry = issue as { path?: string; message?: string }
          return entry.path
            ? `${entry.path}: ${entry.message ?? 'invalid'}`
            : (entry.message ?? 'invalid')
        })
        .join('; ')
      return `${error.message} — ${detail}`
    }
    return error.message || fallback
  }
  if (error instanceof Error && error.message) return error.message
  return fallback
}

export function formatMoney(value: string | number | null | undefined): string {
  const amount = Number(value ?? 0)
  return `$${Number.isFinite(amount) ? amount.toFixed(2) : '0.00'}`
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024)
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—'
  const date = new Date(iso)
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString()
}

/** "Category Code", "category_code" and "categoryCode" all read the same. */
export function normaliseHeader(header: string): string {
  return header.toLowerCase().replace(/[^a-z0-9]/g, '')
}

/**
 * RFC 4180-ish CSV: quoted fields, doubled quotes inside them, commas and
 * newlines inside quotes, CRLF or LF. Blank lines are dropped.
 *
 * Hand-rolled rather than a dependency because the files in question are a
 * merchandiser's spreadsheet export, not arbitrary CSV — but splitting on
 * commas, as the old importer did, broke on the first description containing
 * one.
 */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let inQuotes = false
  const input = text.replace(/^﻿/, '')

  for (let index = 0; index < input.length; index += 1) {
    const char = input[index]

    if (inQuotes) {
      if (char === '"') {
        if (input[index + 1] === '"') {
          field += '"'
          index += 1
        } else {
          inQuotes = false
        }
      } else {
        field += char
      }
      continue
    }

    if (char === '"' && field.trim() === '') {
      field = ''
      inQuotes = true
    } else if (char === ',') {
      row.push(field)
      field = ''
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && input[index + 1] === '\n') index += 1
      row.push(field)
      rows.push(row)
      row = []
      field = ''
    } else {
      field += char
    }
  }

  row.push(field)
  rows.push(row)

  return rows
    .map((cells) => cells.map((cell) => cell.trim()))
    .filter((cells) => cells.some((cell) => cell !== ''))
}
