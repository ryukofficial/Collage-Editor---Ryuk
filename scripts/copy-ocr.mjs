// Copies the text reader (Tesseract) into public/ocr so the website serves it
// itself: no third-party CDN, so Auto Collage works wherever the site works,
// and the service worker can keep it on the phone after the first use.
import { mkdirSync, copyFileSync, existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'

const require = createRequire(import.meta.url)
const dir = p => path.dirname(require.resolve(`${p}/package.json`))
const out = path.resolve('public/ocr')
mkdirSync(path.join(out, 'core'), { recursive: true })

copyFileSync(path.join(dir('tesseract.js'), 'dist/worker.min.js'), path.join(out, 'worker.min.js'))
for (const f of ['tesseract-core-lstm.wasm.js', 'tesseract-core-simd-lstm.wasm.js', 'tesseract-core-relaxedsimd-lstm.wasm.js']) {
  copyFileSync(path.join(dir('tesseract.js-core'), f), path.join(out, 'core', f))
}
const lang = path.join(dir('@tesseract.js-data/eng'), '4.0.0_best_int/eng.traineddata.gz')
if (!existsSync(lang)) throw new Error('eng best_int data missing')
copyFileSync(lang, path.join(out, 'eng.traineddata.gz'))
console.log('[ocr] copied text reader into public/ocr')
