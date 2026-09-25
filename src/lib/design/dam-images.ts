// src/lib/design/dam-images.ts
//
// Pictures the design tools put in the image library (DAM) instead of inside
// the design.
//
// A picture read with `readAsDataURL` rides along in the design JSON, in every
// saved version and in every cart line's artwork — megabytes each time. One
// stored in the library is a URL. But the library is reached with the user's
// own Ticket-IT session, so a portal-native user has none, and its host may not
// send CORS headers, which the canvas needs to stay exportable. Every caller
// therefore keeps the old way as the fallback, and these helpers say which way
// a picture went and, when it was the fallback, why in words for the user.

import {
  checkCanvasUrl,
  DamUploadError,
  FRESH_UPLOAD_CHECK_MS,
  uploadImageToDam,
} from '@/services/dam.service'

/**
 * Where a picture ended up: at a URL the canvas can use, or nowhere yet.
 *
 * `code` says why in a form a caller can act on — above all
 * `TICKETIT_SESSION_REQUIRED`, after which every further upload would be
 * refused the same way.
 */
export type DamStoreOutcome =
  { ok: true; url: string } | { ok: false; reason: string; code: string }

/**
 * What the user is told when the library's host will not let the canvas read
 * a picture. The browser would load it, but the canvas would then refuse every
 * export, thumbnail and Remove BG — so it is never placed from that address.
 */
export const DAM_HOST_BLOCKED =
  "the image library's host doesn't allow the designer to use its pictures"

/**
 * What the user is told when the library took too long to send a picture
 * back. Not the same as blocked: the picture may well work a moment later.
 */
export const DAM_PICTURE_SLOW =
  'the image library took too long to send the picture'

/**
 * Said once when the user's Ticket-IT session turns out to have ended. Every
 * picture after it is kept inside the design without trying the library.
 */
export const DAM_SESSION_ENDED =
  'Your image library session has ended, so pictures are kept inside the design. Sign in to Ticket-IT again to use the library.'

/**
 * Uploads a picture and confirms the canvas can draw it without tainting.
 *
 * Never throws: an outcome that is not `ok` carries the reason, and the caller
 * decides what to fall back to.
 */
export async function storePictureInDam(
  picture: Blob,
  fileName: string
): Promise<DamStoreOutcome> {
  let url: string
  try {
    url = (await uploadImageToDam(picture, { fileName })).url
  } catch (error) {
    const reason =
      error instanceof DamUploadError || error instanceof Error
        ? error.message
        : 'the image library did not accept it'
    const code =
      error instanceof DamUploadError ? error.code : 'DAM_UPLOAD_FAILED'
    return { ok: false, reason, code }
  }
  const check = await checkCanvasUrl(url, FRESH_UPLOAD_CHECK_MS)
  if (check === 'timeout') {
    return { ok: false, reason: DAM_PICTURE_SLOW, code: 'DAM_CHECK_TIMEOUT' }
  }
  if (check === 'blocked') {
    return { ok: false, reason: DAM_HOST_BLOCKED, code: 'DAM_HOST_BLOCKED' }
  }
  return { ok: true, url }
}

/** The file's bytes as a data URL — the way pictures were always embedded. */
export function readFileAsDataUrl(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result || ''))
    reader.onerror = () => reject(new Error('That picture could not be read'))
    reader.readAsDataURL(file)
  })
}

/** A `data:` URL back into bytes, for uploading a canvas-made picture. */
export function dataUrlToBlob(dataUrl: string): Blob | null {
  const match = /^data:([^;,]*)((?:;[^;,]*)*),(.*)$/s.exec(dataUrl)
  if (!match) return null
  const [, type, params, payload] = match
  const contentType = type || 'application/octet-stream'
  try {
    if (!params.split(';').includes('base64')) {
      return new Blob([decodeURIComponent(payload)], { type: contentType })
    }
    const binary = atob(payload)
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
    return new Blob([bytes], { type: contentType })
  } catch {
    return null
  }
}

/**
 * A readable file name for a cut-out: the layer's name, else the picture's own
 * file name, with `-cutout.png`. The library adds its own unique suffix.
 */
export function cutoutFileName(layerName: unknown, src: string): string {
  let stem = typeof layerName === 'string' ? layerName.trim() : ''
  if (!stem || /^(image|logo|layer)$/i.test(stem)) {
    let tail = ''
    if (!src.startsWith('data:')) {
      tail = src.split(/[?#]/)[0].split('/').pop() || ''
      try {
        tail = decodeURIComponent(tail)
      } catch {
        // A malformed escape: the raw name is still a name.
      }
    }
    stem = tail.replace(/\.[a-z0-9]+$/i, '') || stem || 'picture'
  }
  return `${stem.replace(/\.[a-z0-9]+$/i, '')}-cutout.png`
}

/**
 * A fabric snapshot (`toObject` output) with one picture's source replaced,
 * looking inside groups. The same object comes back when nothing matched, so a
 * caller rewriting a whole history allocates only for what changed.
 *
 * `crossOrigin` is written with it: fabric reloads a snapshot with the value it
 * recorded, and a URL reloaded without CORS would taint the canvas on undo.
 */
export function withImageSource<T extends Record<string, unknown>>(
  data: T,
  from: string,
  to: string
): T {
  let next: T = data
  if (data.type === 'image' && data.src === from) {
    next = { ...next, src: to, crossOrigin: 'anonymous' }
  }
  const children = data.objects
  if (Array.isArray(children)) {
    let changed = false
    const mapped = children.map((child) => {
      if (!child || typeof child !== 'object') return child
      const swapped = withImageSource(
        child as Record<string, unknown>,
        from,
        to
      )
      if (swapped !== child) changed = true
      return swapped
    })
    if (changed) next = { ...next, objects: mapped }
  }
  return next
}
