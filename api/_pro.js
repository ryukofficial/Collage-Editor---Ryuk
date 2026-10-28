// "Export for editing" = the Ryuk effect. Server only — the recipe never reaches the browser.
//
//   1. series tags/logos in each skin's top-right corner made 1.15× bigger
//   2. colour, brightness and contrast matched to the approved reference look
//      (measured on a small preview of the skins, so every part of one collage
//      gets exactly the same correction)
//   3. strongest colours −9 %, all colours × 0.975, midtones a touch brighter
//   4. final look: colour +12 %, a little warmer, slightly less pink
//   5. very light sharpening
import sharp from 'sharp'
import { REF_L, REF_C } from './_pro_ref.js'

const TAG = { x0: 0.45, y0: 0, x1: 0.995, y1: 0.30 }   // where the series tag sits in a skin
const TAG_SCALE = 1.15
const MIDTONE = 3 * 100 / 255                             // +3 of 255, on the L* scale
const FINAL_CHROMA = 1.116                 // final look: colour up (tuned on the approved collages)
const FINAL_B = 2.37                      // a little warmer (towards yellow)
const FINAL_A = -0.54                     // slightly less pink
const SHARPEN = 0.1

// ── sRGB ⇄ CIELAB (D65) ─────────────────────────────────────────────────────
const toLin = new Float32Array(256)
for (let i = 0; i < 256; i++) { const c = i / 255; toLin[i] = c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4 }
const toSrgb = v => {
  v = v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055
  return v <= 0 ? 0 : v >= 1 ? 255 : Math.round(v * 255)
}
const Xn = 0.95047, Zn = 1.08883
const f  = t => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116)
const fi = t => (t > 0.206893 ? t * t * t : (t - 16 / 116) / 7.787)
export function rgbToLab(r8, g8, b8) {
  const r = toLin[r8], g = toLin[g8], b = toLin[b8]
  const fx = f((0.4124564 * r + 0.3575761 * g + 0.1804375 * b) / Xn)
  const fy = f(0.2126729 * r + 0.7151522 * g + 0.0721750 * b)
  const fz = f((0.0193339 * r + 0.1191920 * g + 0.9503041 * b) / Zn)
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)]
}
function labToRgb(L, a, b, out, o) {
  const ny = (L + 16) / 116
  const x = fi(ny + a / 500) * Xn, y = fi(ny), z = fi(ny - b / 200) * Zn
  out[o]     = toSrgb( 3.2404542 * x - 1.5371385 * y - 0.4985314 * z)
  out[o + 1] = toSrgb(-0.9692660 * x + 1.8760108 * y + 0.0415560 * z)
  out[o + 2] = toSrgb( 0.0556434 * x - 0.2040259 * y + 1.0572252 * z)
}

// ── statistics helpers ──────────────────────────────────────────────────────
export const QS = Array.from({ length: 101 }, (_, i) => i)          // percentiles 0..100
export function percentiles(values, qs = QS) {
  const s = Float32Array.from(values).sort()
  return qs.map(q => { const p = (q / 100) * (s.length - 1), i = Math.floor(p), t = p - i; return s[i] + ((s[Math.min(i + 1, s.length - 1)] - s[i]) * t) })
}
function interp(x, xs, ys) {                 // monotonic piecewise-linear lookup
  if (x <= xs[0]) return ys[0]
  const n = xs.length - 1
  if (x >= xs[n]) return ys[n]
  let lo = 0, hi = n
  while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (xs[mid] <= x) lo = mid; else hi = mid }
  const d = xs[hi] - xs[lo]
  return d > 1e-9 ? ys[lo] + (ys[hi] - ys[lo]) * (x - xs[lo]) / d : ys[lo]
}
const dedupe = xs => { const out = xs.slice(); for (let i = 1; i < out.length; i++) if (out[i] <= out[i - 1]) out[i] = out[i - 1] + 1e-6; return out }

// Works out the colour correction for one collage from a small preview of its skins.
export async function paramsFromPreview(preview) {
  const { data, info } = await sharp(preview, { limitInputPixels: 4_000_000 }).removeAlpha()
    .resize({ width: 640, height: 640, fit: 'inside', withoutEnlargement: true }).raw().toBuffer({ resolveWithObject: true })
  const n = info.width * info.height, ch = info.channels
  const Ls = new Float32Array(n), Cs = new Float32Array(n)
  for (let i = 0, p = 0; i < n; i++, p += ch) {
    const [L, a, b] = rgbToLab(data[p], data[p + 1], data[p + 2]); Ls[i] = L; Cs[i] = Math.hypot(a, b)
  }
  const srcL = dedupe(percentiles(Ls)), srcC = dedupe(percentiles(Cs))
  // where the strongest colours start, after matching
  const matched = new Float32Array(n)
  for (let i = 0; i < n; i++) matched[i] = interp(Cs[i], srcC, REF_C)
  const [p60, p90] = percentiles(matched, [60, 90])
  return { srcL, srcC, p60, p90: Math.max(p90, p60 + 1e-3) }
}

function ryukColour(d, ch, P) {
  for (let p = 0; p < d.length; p += ch) {
    let [L, a, b] = rgbToLab(d[p], d[p + 1], d[p + 2])
    // 1. match to the reference look
    L = interp(L, P.srcL, REF_L)
    const c = Math.hypot(a, b)
    if (c > 1e-4) {
      const mc = interp(c, P.srcC, REF_C)
      // 2. strongest colours −9 %, everything × 0.975
      const w = Math.min(1, Math.max(0, (mc - P.p60) / (P.p90 - P.p60)))
      const k = (mc / c) * (1 - 0.09 * w) * 0.975 * FINAL_CHROMA
      a *= k; b *= k
    }
    L += MIDTONE * Math.sin(Math.PI * Math.min(Math.max(L, 0), 100) / 100)
    labToRgb(L, a + FINAL_A, b + FINAL_B, d, p)
  }
}

// ── bigger series tag in one skin (x, y, n in piece pixels) ─────────────────
// The bigger copy is pinned to the same top-right corner, so it fully covers the
// original tag. It is fully solid wherever the original tag was, and only fades
// in the thin band it adds on the left and at the bottom — so no ghost edges.
async function enlargeTag(raw, W, H, ch, x, y, n) {
  const sx = Math.round(x + TAG.x0 * n), sy = Math.round(y + TAG.y0 * n)
  const sw = Math.round((TAG.x1 - TAG.x0) * n), sh = Math.round((TAG.y1 - TAG.y0) * n)
  if (sw < 8 || sh < 8 || sx + sw > W || sy + sh > H) return
  const tw = Math.round(sw * TAG_SCALE), th = Math.round(sh * TAG_SCALE)
  const crop = Buffer.alloc(sw * sh * ch)
  for (let r = 0; r < sh; r++) raw.copy(crop, r * sw * ch, ((sy + r) * W + sx) * ch, ((sy + r) * W + sx + sw) * ch)
  const big = await sharp(crop, { raw: { width: sw, height: sh, channels: ch } })
    .resize(tw, th, { kernel: 'lanczos3' }).sharpen({ sigma: 0.6, m1: 0.4, m2: 0.8 }).raw().toBuffer()
  const right = Math.round(x + TAG.x1 * n)                 // same right edge as the original box
  const px = right - tw
  const bandX = tw - sw, bandY = th - sh                    // the extra area the bigger copy adds
  const cellRight = x + n, cellBottom = y + n
  for (let r = 0; r < th; r++) {
    const Y = sy + r; if (Y >= cellBottom || Y >= H) break
    let my = r < sh ? 1 : 1 - (r - sh + 1) / (bandY + 1)    // fade only below the original tag
    my = my * my * (3 - 2 * my)
    for (let c = 0; c < tw; c++) {
      const X = px + c; if (X < x || X >= cellRight || X >= W) continue
      let mx = c >= bandX ? 1 : (c + 1) / (bandX + 1)       // fade only left of the original tag
      mx = mx * mx * (3 - 2 * mx)
      const m = mx * my; if (m <= 0) continue
      const o = (Y * W + X) * ch, s = (r * tw + c) * ch
      for (let k = 0; k < 3; k++) raw[o + k] = Math.round(raw[o + k] * (1 - m) + big[s + k] * m)
    }
  }
}

// image: PNG of one part; cells: [[x, y, n], …] skin cells inside it; P: from paramsFromPreview
export async function processPiece(image, cells, P) {
  const { data, info } = await sharp(image, { limitInputPixels: 16_000_000 }).removeAlpha().raw().toBuffer({ resolveWithObject: true })
  const { width: W, height: H, channels: ch } = info
  for (const [x, y, n] of cells) await enlargeTag(data, W, H, ch, x, y, n)
  ryukColour(data, ch, P)
  // very light sharpening: out = 1.1·img − 0.1·blur
  const blur = await sharp(data, { raw: { width: W, height: H, channels: ch } }).blur(1.2).raw().toBuffer()
  for (let i = 0; i < data.length; i++) { const v = data[i] * (1 + SHARPEN) - blur[i] * SHARPEN; data[i] = v < 0 ? 0 : v > 255 ? 255 : Math.round(v) }
  return sharp(data, { raw: { width: W, height: H, channels: ch } }).png({ compressionLevel: 6 }).toBuffer()
}
