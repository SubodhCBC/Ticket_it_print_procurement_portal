// src/lib/design/codes.ts
//
// QR and barcode bitmaps, shared by the admin builder and the shop customiser.
//
// One implementation on purpose. The builder had these privately, and the
// customiser drew a lucide QR glyph with "SCAN ME" under it instead — so an
// administrator marked out a code space, a buyer typed their URL into it, and
// the proof they approved showed an icon that was not their code. A second
// renderer is a second answer to "what will actually print".

import QRCode from 'qrcode'
import JsBarcode from 'jsbarcode'

/**
 * Generated far larger than the size they are drawn at, then scaled down.
 *
 * Fabric re-renders at devicePixelRatio and again on every zoom, and the print
 * export needs the detail as well: downscaling stays crisp, upscaling goes
 * soft. Generating at 1:1 is what made these blurry.
 */
export const QR_SOURCE_PX = 1024

export const BARCODE_OPTS = {
  format: 'CODE128',
  displayValue: true,
  margin: 0,
  width: 4, // px per module (default 2)
  height: 220, // default 100
  fontSize: 40, // default 20
} as const

/** High-resolution CODE128 bitmap. Throws if jsbarcode rejects the value. */
export function barcodeDataUrl(value: string): string {
  const tmp = document.createElement('canvas')
  JsBarcode(tmp, value, BARCODE_OPTS)
  return tmp.toDataURL('image/png')
}

/** High-resolution QR bitmap, or null if the payload could not be encoded. */
export function qrDataUrl(value: string): Promise<string | null> {
  return new Promise((resolve) => {
    QRCode.toDataURL(
      value,
      { errorCorrectionLevel: 'H', margin: 1, width: QR_SOURCE_PX },
      (err, url) => resolve(err ? null : url)
    )
  })
}

export type CodeType = 'qrcode' | 'barcode'

/**
 * A code bitmap for `value`, or null when it cannot be encoded.
 *
 * `fallback` is what an empty value renders as. The builder wants one — an
 * administrator placing a code space needs to see its size and position before
 * anybody has supplied a payload. The customiser must not pass one: showing a
 * buyer a specimen code where their own has not been entered is exactly the
 * confusion this module exists to remove.
 */
export async function renderCodeBitmap(
  type: CodeType,
  value: string,
  fallback?: { qr: string; barcode: string }
): Promise<string | null> {
  const payload =
    value || (type === 'qrcode' ? fallback?.qr : fallback?.barcode) || ''
  if (!payload) return null
  try {
    return type === 'qrcode'
      ? await qrDataUrl(payload)
      : barcodeDataUrl(payload)
  } catch {
    return null
  }
}

/** The specimen values the builder falls back to before anything is typed. */
export const CODE_PLACEHOLDERS = {
  qr: 'https://example.com',
  barcode: '123456789',
} as const

/**
 * Whether CODE128 can carry this value, asked by encoding it.
 *
 * jsbarcode's own accepted set is the only definition that matters, and it
 * changes between versions; a regular expression here would be a guess that
 * disagrees with the encoder in front of the buyer.
 */
export function canEncodeBarcode(value: string): boolean {
  if (!value) return false
  try {
    barcodeDataUrl(value)
    return true
  } catch {
    return false
  }
}
