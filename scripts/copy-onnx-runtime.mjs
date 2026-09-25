// scripts/copy-onnx-runtime.mjs
//
// Puts the ONNX Runtime WebAssembly files where the browser can fetch them.
//
// Remove BG in the template studio runs a background-removal model in the
// browser (see src/lib/design/background-removal.ts). The runtime that runs it
// is a WebAssembly binary shipped inside `onnxruntime-web`, and the browser has
// to download it from this site: served from /onnx/, copied out of
// node_modules rather than committed, so it is always the build of the
// installed package and fourteen megabytes of binary never enter git.
//
// Runs before `dev` and `build`. Safe to run any number of times: a file that
// is already in place and the same size is left alone.

import { copyFileSync, existsSync, mkdirSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const from = join(root, 'node_modules', 'onnxruntime-web', 'dist')
const to = join(root, 'public', 'onnx')

// The CPU-only runtime `onnxruntime-web/wasm` loads, and its loader.
const FILES = ['ort-wasm-simd-threaded.wasm', 'ort-wasm-simd-threaded.mjs']

if (!existsSync(from)) {
  console.warn(
    '[copy-onnx-runtime] onnxruntime-web is not installed; Remove BG will not work until `npm install` has run.'
  )
  process.exit(0)
}

mkdirSync(to, { recursive: true })

let copied = 0
for (const name of FILES) {
  const source = join(from, name)
  const target = join(to, name)
  if (!existsSync(source)) {
    console.error(`[copy-onnx-runtime] missing ${source}`)
    process.exit(1)
  }
  if (existsSync(target) && statSync(target).size === statSync(source).size) {
    continue
  }
  copyFileSync(source, target)
  copied++
}

console.log(
  copied > 0
    ? `[copy-onnx-runtime] copied ${copied} file(s) to public/onnx`
    : '[copy-onnx-runtime] public/onnx is up to date'
)
