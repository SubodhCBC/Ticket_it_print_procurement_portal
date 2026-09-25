// src/lib/design/background-removal.ts
//
// Cutting the subject out of a photo, in the browser.
//
// A pet, a person or a product in front of a real scene has no "background
// colour" to remove, so this uses a model trained to find the main subject:
// U²-Net-p (Apache-2.0, 4.6 MB), run with ONNX Runtime's WebAssembly build.
// Nothing leaves the browser, there is no service to pay for, and the model and
// runtime are served from this site. /onnx/ is copied out of node_modules by
// scripts/copy-onnx-runtime.mjs; /models/u2netp.onnx is NOT in git and nothing
// fetches it — it has to be placed in public/models/ by hand, and without it
// "Cut out subject" reports that the remover could not be loaded.
//
// The same model keeps Plain colour from cutting into a photo's subject.
//
// Both are fetched the first time someone removes a background, not with the
// studio: most people who open a template never press the button.

import type { InferenceSession } from 'onnxruntime-web'
import {
  clearAwayFrom,
  keepMainSubject,
  keyOutColour,
  looksLikePhoto,
  readSourcePixels,
} from './image-tools'

const MODEL_URL = '/models/u2netp.onnx'
const RUNTIME_PATH = '/onnx/'

/** The model's input is a 320×320 picture; its output is a 320×320 mask. */
const SIZE = 320
const MEAN = [0.485, 0.456, 0.406]
const STD = [0.229, 0.224, 0.225]

type Ort = typeof import('onnxruntime-web/wasm')

let loading: Promise<{ ort: Ort; session: InferenceSession }> | null = null

function loadModel(): Promise<{ ort: Ort; session: InferenceSession }> {
  if (!loading) {
    loading = (async () => {
      const ort = await import('onnxruntime-web/wasm')
      ort.env.wasm.wasmPaths = RUNTIME_PATH
      // One thread. Several need the page to be cross-origin isolated, which
      // this site is not, and the runtime only falls back after complaining.
      ort.env.wasm.numThreads = 1
      const session = await ort.InferenceSession.create(MODEL_URL, {
        executionProviders: ['wasm'],
        graphOptimizationLevel: 'all',
      })
      return { ort, session }
    })().catch((cause: unknown) => {
      // Forgotten, so the next press tries again rather than failing forever
      // after one dropped connection.
      loading = null
      throw new Error(
        'The background remover could not be loaded. Check your connection and try again.',
        { cause }
      )
    })
  }
  return loading
}

/** Starts fetching the model early — when the menu opens. Errors surface on use. */
export function preloadBackgroundModel(): void {
  void loadModel().catch(() => undefined)
}

function canvasOf(width: number, height: number) {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) throw new Error('This browser cannot edit pictures.')
  return { canvas, ctx }
}

/**
 * The subject kept, everything behind it made transparent.
 *
 * The model's mask becomes the picture's transparency (see `subjectAlpha`),
 * and what the model half-kept away from the subject — leaves, specks, a
 * caption — is cleared. A photo over `WORKING_PIXELS` is worked on at that
 * size.
 */
export async function removeBackgroundWithModel(
  source: HTMLImageElement | HTMLCanvasElement
): Promise<{ dataUrl: string }> {
  // Read before loading the model, so a picture that cannot be edited is
  // refused at once rather than after a download.
  const full = readSourcePixels(source)
  const alpha = await subjectAlpha(full.canvas, full.width, full.height)
  const px = full.image.data
  for (let p = 0; p < alpha.length; p++) {
    px[p * 4 + 3] = (px[p * 4 + 3] * alpha[p]) / 255
  }
  keepMainSubject(px, full.width, full.height)
  full.ctx.putImageData(full.image, 0, 0)
  return { dataUrl: full.canvas.toDataURL('image/png') }
}

/**
 * Removes the plain colour around a picture (see `keyOutColour`), the way a
 * background remover is expected to, with nothing to set but the tolerance.
 *
 * On flat artwork — a logo on white — it removes the colour that reaches the
 * edges, which gives the crispest outline and keeps what the artwork encloses:
 * white lettering inside a badge stays.
 *
 * On a photo the colour key cannot tell a pale backdrop from pale skin, a
 * highlight or a white collar, and at a high tolerance it cut holes through
 * faces. There the model finds the subject, and each pixel stays as opaque as
 * either of them says it should. With the subject known, the rest goes as a
 * background remover's would: the backdrop showing between an arm and the
 * body, whatever lies well away from the subject — lights, a doorway, a strip
 * of wall in another colour — and the specks left around it.
 */
export async function removeColourBackground(
  source: HTMLImageElement | HTMLCanvasElement,
  tolerance: number
): Promise<{ dataUrl: string; photo: boolean }> {
  const full = readSourcePixels(source)
  const { width: w, height: h } = full
  const px = full.image.data
  const photo = looksLikePhoto(px, w, h)

  if (!photo) {
    keyOutColour(px, w, h, tolerance)
  } else {
    const before = new Uint8ClampedArray(w * h)
    for (let p = 0; p < before.length; p++) before[p] = px[p * 4 + 3]
    keyOutColour(px, w, h, tolerance, { everywhere: true })
    // The canvas still holds the untouched picture: the key only wrote to
    // the pixel data read from it.
    const subject = await subjectAlpha(full.canvas, w, h)
    for (let p = 0; p < subject.length; p++) {
      const kept = (before[p] * subject[p]) / 255
      if (kept > px[p * 4 + 3]) px[p * 4 + 3] = kept
    }
    clearAwayFrom(px, w, h, subject)
    keepMainSubject(px, w, h)
  }

  full.ctx.putImageData(full.image, 0, 0)
  return { dataUrl: full.canvas.toDataURL('image/png'), photo }
}

/**
 * How much of each pixel of `picture` (w×h) is the subject, 0-255.
 *
 * The model sees the picture at 320×320 and answers with how likely each of
 * those pixels is to be the subject. That answer is stretched back to the
 * picture's size — smoothly, so the outline is soft rather than stepped.
 */
async function subjectAlpha(
  picture: HTMLCanvasElement,
  w: number,
  h: number
): Promise<Uint8ClampedArray> {
  const { ort, session } = await loadModel()

  // 1. The model's input: the picture at 320×320, scaled by its brightest
  //    value and normalised per channel — the preprocessing U²-Net was
  //    trained with.
  const small = canvasOf(SIZE, SIZE)
  small.ctx.imageSmoothingQuality = 'high'
  small.ctx.drawImage(picture, 0, 0, SIZE, SIZE)
  const px = small.ctx.getImageData(0, 0, SIZE, SIZE).data
  let brightest = 0
  for (let i = 0; i < px.length; i += 4) {
    brightest = Math.max(brightest, px[i], px[i + 1], px[i + 2])
  }
  brightest = brightest || 1

  const plane = SIZE * SIZE
  const input = new Float32Array(3 * plane)
  for (let p = 0; p < plane; p++) {
    const i = p * 4
    input[p] = (px[i] / brightest - MEAN[0]) / STD[0]
    input[plane + p] = (px[i + 1] / brightest - MEAN[1]) / STD[1]
    input[2 * plane + p] = (px[i + 2] / brightest - MEAN[2]) / STD[2]
  }

  const output = await session.run({
    [session.inputNames[0]]: new ort.Tensor('float32', input, [
      1,
      3,
      SIZE,
      SIZE,
    ]),
  })
  const prediction = output[session.outputNames[0]].data as Float32Array

  // 2. The mask, stretched to 0-1. A faint haze of low confidence over the
  //    background is dropped and near-certain subject is made solid, so a
  //    busy scene does not come back as a ghost of itself.
  let min = Infinity
  let max = -Infinity
  for (let p = 0; p < plane; p++) {
    min = Math.min(min, prediction[p])
    max = Math.max(max, prediction[p])
  }
  const range = max - min || 1

  const mask = canvasOf(SIZE, SIZE)
  const maskImage = mask.ctx.createImageData(SIZE, SIZE)
  for (let p = 0; p < plane; p++) {
    const certainty = (prediction[p] - min) / range
    const i = p * 4
    maskImage.data[i] = 255
    maskImage.data[i + 1] = 255
    maskImage.data[i + 2] = 255
    maskImage.data[i + 3] = ((certainty - 0.1) / 0.8) * 255
  }
  mask.ctx.putImageData(maskImage, 0, 0)

  // 3. Back to the picture's size, smoothly.
  const scaled = canvasOf(w, h)
  scaled.ctx.imageSmoothingQuality = 'high'
  scaled.ctx.drawImage(mask.canvas, 0, 0, w, h)
  const data = scaled.ctx.getImageData(0, 0, w, h).data
  const alpha = new Uint8ClampedArray(w * h)
  for (let p = 0; p < alpha.length; p++) alpha[p] = data[p * 4 + 3]
  return alpha
}
