// Reads skin names from one screenshot on the server (Tesseract + sharp).
// Screenshots are only held in memory for the few seconds this takes; nothing
// is written to disk or logged.
import { createRequire } from 'node:module'
import path from 'node:path'
import fs from 'node:fs'
import sharp from 'sharp'
import { chooseScale, prepareGray, wordsFromOcr, matchPages, buildVocabulary } from '../src/utils/skinScanner.js'
import { httpError } from './_http.js'

const require = createRequire(import.meta.url)
const Tesseract = require('tesseract.js')
const LANG_DIR = path.join(path.dirname(require.resolve('@tesseract.js-data/eng/package.json')), '4.0.0_best_int')

sharp.cache(false)                 // don't keep decoded screenshots around
sharp.concurrency(1)

let _vocab = null
function vocab() {
  if (!_vocab) _vocab = buildVocabulary(JSON.parse(fs.readFileSync(path.join(process.cwd(), 'skins.json'), 'utf8')))
  return _vocab
}

let _worker = null
async function worker() {
  if (!_worker) {
    _worker = (async () => {
      const w = await Tesseract.createWorker('eng', 1, { langPath: LANG_DIR, gzip: true, cacheMethod: 'none', cachePath: '/tmp' })
      await w.setParameters({ tessedit_pageseg_mode: '11', user_defined_dpi: '300', preserve_interword_spaces: '1' })
      return w
    })().catch(err => { _worker = null; throw err })
  }
  return _worker
}

const MAX_PIXELS = 40e6            // refuse absurdly large images (decompression bombs)

async function readAt(input, zoom) {
  const meta = await sharp(input, { limitInputPixels: MAX_PIXELS, failOn: 'error' }).metadata()
  // apply EXIF rotation so width/height are the displayed ones
  const rotated = meta.orientation && meta.orientation >= 5
  const W0 = rotated ? meta.height : meta.width, H0 = rotated ? meta.width : meta.height
  if (!W0 || !H0) throw new Error('no size')
  const scale = chooseScale(W0, H0, zoom)
  const W = Math.max(1, Math.round(W0 * scale)), H = Math.max(1, Math.round(H0 * scale))
  const { data } = await sharp(input, { limitInputPixels: MAX_PIXELS, failOn: 'error' })
    .rotate().removeAlpha().resize(W, H, { kernel: 'lanczos3', fit: 'fill' }).ensureAlpha()
    .raw().toBuffer({ resolveWithObject: true })

  const w = await worker()
  const layers = [], stats = []
  for (const [variant, gray] of [
    ['normal', () => prepareGray(data, W, H, 'plain')],
    ['bright-text', () => prepareGray(data, W, H, 'tophat')],
    ['coloured-text', () => prepareGray(data, W, H, 'tophat', { source: 'max' })],
  ]) {
    const t0 = Date.now()
    const png = await sharp(Buffer.from(gray()), { raw: { width: W, height: H, channels: 1 } }).png({ compressionLevel: 1 }).toBuffer()
    const { data: d } = await w.recognize(png, {}, { blocks: true })
    const words = wordsFromOcr(d, scale)
    layers.push(words)
    stats.push({ variant, scale, seconds: (Date.now() - t0) / 1000, count: words.length })
  }
  return { layers, stats, width: W0, height: H0 }
}

// Returns { matches, possible, ambiguous, found, stats, width, height } for one screenshot.
export async function readScreenshotServer(input) {
  let first
  try {
    first = await readAt(input, 1)
  } catch (err) {
    if (/unsupported image|Input buffer|pixel limit|corrupt|no size|bad seek|VipsJpeg|Invalid/i.test(String(err?.message))) throw httpError(400, 'bad_image')
    throw err
  }
  let layers = first.layers, stats = first.stats
  let quick = matchPages([{ layers }], vocab())
  if (!quick.matches.length) {
    // nothing sure: the text may be small; read it once more, bigger
    const more = await readAt(input, 1.6)
    if (more.stats[0].scale > first.stats[0].scale * 1.15) {
      layers = [...layers, ...more.layers]
      stats = [...stats, ...more.stats.map(s => ({ ...s, variant: `closer: ${s.variant}` }))]
      quick = matchPages([{ layers }], vocab())
    }
  }
  const found = quick.matches.length + quick.possible.length + quick.ambiguous.length
  // Only the skins found (and where they are) go back — never the rest of the
  // text read from the picture, so the paid scan can't be used as a general reader.
  const slim = m => ({ key: m.key, heroId: m.heroId, heroName: m.heroName, skinName: m.skinName, tier: m.tier, score: m.score, box: m.box, h: m.h })
  return {
    matches: quick.matches.map(slim),
    possible: quick.possible.map(slim),
    ambiguous: quick.ambiguous.map(a => ({ name: a.name, options: a.options, box: a.box, h: a.h })),
    found,
    stats: stats.map(s => ({ variant: s.variant, scale: s.scale, seconds: s.seconds, count: s.count })),
    width: first.width, height: first.height,
  }
}
