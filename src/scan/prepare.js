// Turns a screenshot into the three grey pictures the text reader looks at:
//   1. plain grey                    (any text colour; the green skin names)
//   2. thin bright strokes only      (white text printed over artwork)
//   3. thin bright strokes, any hue  (green skin names over artwork)
// The pictures are returned as PGM files: the text reader opens them directly,
// so no time is spent compressing PNGs.
import { chooseScale, prepareGray } from './match.js'

function pgm(gray, w, h) {
  const head = new TextEncoder().encode(`P5\n${w} ${h}\n255\n`)
  const out = new Uint8Array(head.length + gray.length)
  out.set(head, 0); out.set(gray, head.length)
  return out
}

function stats(rgba) {
  let n = 0, sum = 0, sq = 0
  for (let p = 0; p < rgba.length; p += 4 * 61) {
    const v = (rgba[p] * 77 + rgba[p + 1] * 151 + rgba[p + 2] * 28) >> 8
    n++; sum += v; sq += v * v
  }
  const mean = n ? sum / n : 0
  return { mean, spread: n ? Math.sqrt(Math.max(0, sq / n - mean * mean)) : 0 }
}

// source: ImageBitmap; makeCanvas(w, h) → canvas (Offscreen in a worker)
export function prepareShot(source, zoom, makeCanvas) {
  const sw = source.width, sh = source.height
  const s = chooseScale(sw, sh, zoom)
  const w = Math.max(1, Math.round(sw * s)), h = Math.max(1, Math.round(sh * s))
  const c = makeCanvas(w, h)
  const ctx = c.getContext('2d', { willReadFrequently: true })
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(source, 0, 0, w, h)
  const { data } = ctx.getImageData(0, 0, w, h)
  c.width = c.height = 1
  const px = stats(data)
  if (px.spread < 1.5) return { blank: true, width: sw, height: sh, scale: w / sw, pixels: px, images: [] }
  const images = [
    pgm(prepareGray(data, w, h, 'plain'), w, h),
    pgm(prepareGray(data, w, h, 'tophat', {}), w, h),
    pgm(prepareGray(data, w, h, 'tophat', { source: 'max' }), w, h),
  ]
  return { blank: false, width: sw, height: sh, scale: w / sw, pixels: px, images }
}
