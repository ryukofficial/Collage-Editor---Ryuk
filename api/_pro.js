// "Export for editing" = the Ryuk effect. Server only — the recipe never reaches the browser.
//
//   1. the series logo on each skin made 1.15× bigger (only the logo itself);
//      where a clean, sharp copy of that logo exists it is used instead
//   2. colour, brightness and contrast matched to the approved reference look
//      (measured on a small preview of the skins, so every part of one collage
//      gets exactly the same correction)
//   3. strongest colours −9 %, all colours × 0.975, midtones a touch brighter
//   4. final look: colour +12 %, a little warmer, slightly less pink
//   5. very light sharpening
import sharp from 'sharp'
import { REF_L, REF_C } from './_pro_ref.js'
import { TAG_MASKS, MASK_SIZE } from './_tagmasks.js'
import { LOGO_IMAGES, LOGO_PLACES } from './_logos.js'

const LOGO_SCALE = 1.15
const MIDTONE = 3 * 100 / 255                             // +3 of 255, on the L* scale
// final look = the approved Ryuk effect (28 Oct)
const FINAL_CHROMA = 1.116 * 0.94          // Ryuk effect colour, −6% (matched to the editor's dark reference, 28 Oct)
const FINAL_B = 1.7                       // a little warmer (towards yellow)
const FINAL_A = -2.1                      // less pink
// brightness: darks and midtones a little lighter, highlights a little softer
const TONE_X = [0, 5, 12, 28, 48, 70, 93, 100]
const TONE_Y = [0, -0.8, -1.7, -3.1, -3.6, -1.7, 0, 0]   // darker shadows and midtones, whites kept
// last step: matched pixel by pixel to the editor's final collage (same 98 skins, 28 Oct)
const MATCH_X = [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60, 65, 70, 75, 80, 85, 90, 95, 100]
const MATCH_Y = [1.63, 5.79, 11.87, 16.92, 22.18, 27.68, 32.88, 37.99, 42.91, 47.74, 52.48, 57.13, 61.81, 66.52, 71.27, 75.94, 80.47, 84.97, 89.49, 94.35, 98.14]
const MATCH_CHROMA = 0.972 * 1.035
const MATCH_A = -0.62
const MATCH_B = -2.73
const SHARPEN = 0.7                         // matched to the editor's final collage

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
    L += interp(Math.min(Math.max(L, 0), 100), TONE_X, TONE_Y)
    L = interp(Math.min(Math.max(L, 0), 100), MATCH_X, MATCH_Y)
    labToRgb(L, (a + FINAL_A) * MATCH_CHROMA + MATCH_A, (b + FINAL_B) * MATCH_CHROMA + MATCH_B, d, p)
  }
}

// ── bigger series logo in one skin ──────────────────────────────────────────
// Only the logo itself is enlarged, using its exact outline from the skin library
// (_tagmasks.js). The original logo is first removed (filled in from the
// surrounding picture), then the 1.15× copy is placed with soft edges, pinned to
// the logo's own top-right corner. Faces, hair and background are never scaled.
// Skins not in the library (your own uploads) are left exactly as they are.
const maskCache = new Map()
function maskFor(key) {
  if (!key || !Object.prototype.hasOwnProperty.call(TAG_MASKS, key)) return null
  if (maskCache.has(key)) return maskCache.get(key)
  const [mx, my, mw, mh, b64] = TAG_MASKS[key]
  const bytes = Buffer.from(b64, 'base64'), bits = new Uint8Array(mw * mh)
  for (let i = 0; i < bits.length; i++) bits[i] = (bytes[i >> 3] >> (7 - (i & 7))) & 1
  const m = { mx, my, mw, mh, bits }
  maskCache.set(key, m)
  return m
}

// grows a 0/255 mask by r pixels (square neighbourhood)
function dilate(a, w, h, r) {
  if (r < 1) return a
  const tmp = new Uint8Array(a.length), out = new Uint8Array(a.length)
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let v = 0; for (let k = Math.max(0, x - r); k <= Math.min(w - 1, x + r) && !v; k++) v = a[y * w + k]
    tmp[y * w + x] = v
  }
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let v = 0; for (let k = Math.max(0, y - r); k <= Math.min(h - 1, y + r) && !v; k++) v = tmp[k * w + x]
    out[y * w + x] = v
  }
  return out
}

// returns the area the logo now covers (or null), so HD upscaling can keep the
// letters crisp instead of letting the AI redraw them
async function enlargeLogo(raw, W, H, ch, x, y, n, key) {
  const m = maskFor(key)
  if (!m || n < 32) return null
  const s = n / MASK_SIZE
  const pad = Math.ceil(4 * s)                                   // room for outlines / shadow
  const bx = Math.max(0, Math.floor(m.mx * s) - pad), by = Math.max(0, Math.floor(m.my * s) - pad)
  const bx2 = Math.min(n, Math.ceil((m.mx + m.mw) * s) + pad), by2 = Math.min(n, Math.ceil((m.my + m.mh) * s) + pad)
  const bw = bx2 - bx, bh = by2 - by
  if (bw < 4 || bh < 4 || x + bx2 > W || y + by2 > H) return null

  // logo mask at cell scale (inside the box)
  const big256 = new Uint8Array(m.mw * m.mh); for (let i = 0; i < big256.length; i++) big256[i] = m.bits[i] * 255
  const mw = Math.max(1, Math.round(m.mw * s)), mh = Math.max(1, Math.round(m.mh * s))
  const scaled = await sharp(Buffer.from(big256), { raw: { width: m.mw, height: m.mh, channels: 1 } }).resize(mw, mh, { kernel: 'cubic' }).extractChannel(0).raw().toBuffer()
  const ox = Math.round(m.mx * s) - bx, oy = Math.round(m.my * s) - by
  const hard = new Uint8Array(bw * bh)
  for (let r = 0; r < mh; r++) for (let c = 0; c < mw; c++) {
    const X = ox + c, Y = oy + r
    if (X >= 0 && X < bw && Y >= 0 && Y < bh && scaled[r * mw + c] > 96) hard[Y * bw + X] = 255
  }
  const hole = dilate(hard, bw, bh, Math.max(1, Math.round(2.5 * s)))   // logo + its edge pixels
  const keep = dilate(hard, bw, bh, Math.max(1, Math.round(1.2 * s)))   // what the bigger copy carries

  // copy the box (original pixels)
  const box = Buffer.alloc(bw * bh * ch)
  for (let r = 0; r < bh; r++) raw.copy(box, r * bw * ch, ((y + by + r) * W + x + bx) * ch, ((y + by + r) * W + x + bx + bw) * ch)

  // 1. remove the original logo: fill the hole smoothly from the surrounding picture
  const filled = fillHole(box, bw, bh, ch, hole)

  // 2. the logo 1.15× bigger (with soft edges), pinned to the logo's top-right corner
  const tw = Math.round(bw * LOGO_SCALE), th = Math.round(bh * LOGO_SCALE)
  const bigImg = await sharp(box, { raw: { width: bw, height: bh, channels: ch } }).resize(tw, th, { kernel: 'lanczos3' }).raw().toBuffer()
  const bigA = await sharp(Buffer.from(keep), { raw: { width: bw, height: bh, channels: 1 } })
    .resize(tw, th, { kernel: 'cubic' }).blur(Math.max(0.4, 0.8 * s)).extractChannel(0).raw().toBuffer()
  const right = x + bx2, top = y + by                              // same top-right corner
  for (let r = 0; r < bh; r++) {                                    // first paint the cleaned box back
    filled.copy(raw, ((y + by + r) * W + x + bx) * ch, r * bw * ch, (r + 1) * bw * ch)
  }
  for (let r = 0; r < th; r++) {
    const Y = top + r; if (Y < y || Y >= y + n || Y >= H) continue
    for (let c = 0; c < tw; c++) {
      const X = right - tw + c; if (X < x || X >= x + n || X >= W) continue
      const a = bigA[r * tw + c] / 255; if (a <= 0.004) continue
      const o = (Y * W + X) * ch, sidx = (r * tw + c) * ch
      for (let k = 0; k < 3; k++) raw[o + k] = Math.round(raw[o + k] * (1 - a) + bigImg[sidx + k] * a)
    }
  }
  const lx = Math.max(x, right - tw), ly = Math.max(y, top)
  return [lx, ly, Math.min(x + n, right) - lx, Math.min(y + n, top + th) - ly]
}

// Fills the hole (255 = fill) in a box of pixels smoothly from the surrounding
// picture (pull-push: average down to coarse levels, then blend back up).
function fillHole(box, bw, bh, ch, hole) {
  const filled = Buffer.from(box)
  {
    const levels = []
    let w = bw, h = bh
    let col = new Float32Array(w * h * 3), wt = new Float32Array(w * h)
    for (let i = 0; i < w * h; i++) if (!hole[i]) { wt[i] = 1; col[i * 3] = box[i * ch]; col[i * 3 + 1] = box[i * ch + 1]; col[i * 3 + 2] = box[i * ch + 2] }
    levels.push({ w, h, col, wt })
    while (w > 1 || h > 1) {                                   // pull: halve size, keep weighted averages
      const nw = Math.max(1, Math.ceil(w / 2)), nh = Math.max(1, Math.ceil(h / 2))
      const nc = new Float32Array(nw * nh * 3), nwt = new Float32Array(nw * nh)
      for (let y2 = 0; y2 < h; y2++) for (let x2 = 0; x2 < w; x2++) {
        const i = y2 * w + x2, j = (y2 >> 1) * nw + (x2 >> 1), q = wt[i]
        if (!q) continue
        nwt[j] += q; nc[j * 3] += col[i * 3] * q; nc[j * 3 + 1] += col[i * 3 + 1] * q; nc[j * 3 + 2] += col[i * 3 + 2] * q
      }
      for (let j = 0; j < nw * nh; j++) if (nwt[j]) { nc[j * 3] /= nwt[j]; nc[j * 3 + 1] /= nwt[j]; nc[j * 3 + 2] /= nwt[j]; nwt[j] = Math.min(1, nwt[j]) }
      w = nw; h = nh; col = nc; wt = nwt; levels.push({ w, h, col, wt })
    }
    for (let l = levels.length - 2; l >= 0; l--) {               // push: fill gaps from the coarser level
      const L = levels[l], C = levels[l + 1]
      for (let y2 = 0; y2 < L.h; y2++) for (let x2 = 0; x2 < L.w; x2++) {
        const i = y2 * L.w + x2, q = L.wt[i]
        if (q >= 1) continue
        // bilinear sample of the coarser level
        const fx = Math.min(C.w - 1, Math.max(0, (x2 + 0.5) / 2 - 0.5)), fy = Math.min(C.h - 1, Math.max(0, (y2 + 0.5) / 2 - 0.5))
        const x0 = Math.floor(fx), y0 = Math.floor(fy), x1 = Math.min(C.w - 1, x0 + 1), y1 = Math.min(C.h - 1, y0 + 1), tx = fx - x0, ty = fy - y0
        for (let k = 0; k < 3; k++) {
          const v = (C.col[(y0 * C.w + x0) * 3 + k] * (1 - tx) + C.col[(y0 * C.w + x1) * 3 + k] * tx) * (1 - ty)
                  + (C.col[(y1 * C.w + x0) * 3 + k] * (1 - tx) + C.col[(y1 * C.w + x1) * 3 + k] * tx) * ty
          L.col[i * 3 + k] = L.col[i * 3 + k] * q + v * (1 - q)
        }
        L.wt[i] = 1
      }
    }
    const L0 = levels[0]
    for (let i = 0; i < bw * bh; i++) if (hole[i]) for (let k = 0; k < 3; k++) filled[i * ch + k] = Math.round(L0.col[i * 3 + k])
  }
  return filled
}

// ── Clean logos ─────────────────────────────────────────────────────────────
// For skins whose series logo we have as a clean, sharp picture (_logos.js),
// the logo on the skin is removed and the clean one is drawn 1.15× bigger in
// its place (same top-right corner). Everything else on the skin is untouched.
const logoCache = new Map()
async function cleanLogo(id) {
  if (logoCache.has(id)) return logoCache.get(id)
  const p = sharp(Buffer.from(LOGO_IMAGES[id], 'base64')).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
    .then(({ data, info }) => ({ data, w: info.width, h: info.height }))
  logoCache.set(id, p)
  p.catch(() => logoCache.delete(id))
  return p
}

async function replaceLogo(raw, W, H, ch, x, y, n, key) {
  const pl = Object.prototype.hasOwnProperty.call(LOGO_PLACES, key) ? LOGO_PLACES[key] : null
  if (!pl || n < 32 || !LOGO_IMAGES[pl[0]]) return null
  const lg = await cleanLogo(pl[0])
  const m = maskFor(key)
  const s = n / MASK_SIZE
  // where the logo sits now (cell coordinates) and where the bigger one goes
  const lx = pl[1] * s, ly = pl[2] * s, lw = pl[3] * s, lh = pl[4] * s
  const tw = Math.max(1, Math.round(lw * LOGO_SCALE)), th = Math.max(1, Math.round(lh * LOGO_SCALE))
  const right = Math.round(lx + lw), top = Math.round(ly)
  let L = Math.min(lx, right - tw), T = ly, R = lx + lw, B = Math.max(ly + lh, top + th)
  if (m) { L = Math.min(L, m.mx * s); T = Math.min(T, m.my * s); R = Math.max(R, (m.mx + m.mw) * s); B = Math.max(B, (m.my + m.mh) * s) }
  const pad = Math.ceil(4 * s)
  const bx = Math.max(0, Math.floor(L) - pad), by = Math.max(0, Math.floor(T) - pad)
  const bx2 = Math.min(n, Math.ceil(R) + pad), by2 = Math.min(n, Math.ceil(B) + pad)
  const bw = bx2 - bx, bh = by2 - by
  if (bw < 4 || bh < 4 || x + bx2 > W || y + by2 > H) return null

  // the area to clear: the old logo's outline (if known) + the clean logo's shape at the old size
  const hard = new Uint8Array(bw * bh)
  if (m) {
    const big256 = new Uint8Array(m.mw * m.mh); for (let i = 0; i < big256.length; i++) big256[i] = m.bits[i] * 255
    const mw = Math.max(1, Math.round(m.mw * s)), mh = Math.max(1, Math.round(m.mh * s))
    const scaled = await sharp(Buffer.from(big256), { raw: { width: m.mw, height: m.mh, channels: 1 } }).resize(mw, mh, { kernel: 'cubic', fit: 'fill' }).extractChannel(0).raw().toBuffer()
    const ox = Math.round(m.mx * s) - bx, oy = Math.round(m.my * s) - by
    for (let r = 0; r < mh; r++) for (let c = 0; c < mw; c++) {
      const X = ox + c, Y = oy + r
      if (X >= 0 && X < bw && Y >= 0 && Y < bh && scaled[r * mw + c] > 96) hard[Y * bw + X] = 255
    }
  }
  const ow = Math.max(1, Math.round(lw)), oh = Math.max(1, Math.round(lh))
  const oldA = await sharp(lg.data, { raw: { width: lg.w, height: lg.h, channels: 4 } }).resize(ow, oh, { kernel: 'cubic', fit: 'fill' }).extractChannel(3).raw().toBuffer()
  const ox = Math.round(lx) - bx, oy = Math.round(ly) - by
  for (let r = 0; r < oh; r++) for (let c = 0; c < ow; c++) {
    const X = ox + c, Y = oy + r
    if (X >= 0 && X < bw && Y >= 0 && Y < bh && oldA[r * ow + c] > 90) hard[Y * bw + X] = 255
  }
  const hole = dilate(hard, bw, bh, Math.max(1, Math.round(2.5 * s)))

  const box = Buffer.alloc(bw * bh * ch)
  for (let r = 0; r < bh; r++) raw.copy(box, r * bw * ch, ((y + by + r) * W + x + bx) * ch, ((y + by + r) * W + x + bx + bw) * ch)
  const filled = fillHole(box, bw, bh, ch, hole)
  for (let r = 0; r < bh; r++) filled.copy(raw, ((y + by + r) * W + x + bx) * ch, r * bw * ch, (r + 1) * bw * ch)

  // draw the clean logo 1.15× bigger, pinned to the old logo's top-right corner
  const big = await sharp(lg.data, { raw: { width: lg.w, height: lg.h, channels: 4 } })
    .resize(tw, th, { kernel: tw > lg.w ? 'lanczos3' : 'mitchell', fit: 'fill' }).raw().toBuffer()
  const X0 = x + right - tw, Y0 = y + top
  for (let r = 0; r < th; r++) {
    const Y = Y0 + r; if (Y < y || Y >= y + n || Y >= H) continue
    for (let c = 0; c < tw; c++) {
      const X = X0 + c; if (X < x || X >= x + n || X >= W) continue
      const si = (r * tw + c) * 4, a = big[si + 3] / 255; if (a <= 0.004) continue
      const o = (Y * W + X) * ch
      for (let k = 0; k < 3; k++) raw[o + k] = Math.round(raw[o + k] * (1 - a) + big[si + k] * a)
    }
  }
  const qx = Math.max(x, X0), qy = Math.max(y, Y0)
  return [qx, qy, Math.min(x + n, X0 + tw) - qx, Math.min(y + n, Y0 + th) - qy]
}

// image: PNG of one part; cells: [[x, y, n, key], …] skin cells inside it (key = the
// skin picture's file name in the library); P: from paramsFromPreview
// Returns { png, logos: [[x, y, w, h], …] } (logo areas inside this part).
export async function processPiece(image, cells, P) {
  const { data, info } = await sharp(image, { limitInputPixels: 16_000_000 }).removeAlpha().raw().toBuffer({ resolveWithObject: true })
  const { width: W, height: H, channels: ch } = info
  const logos = []
  for (const [x, y, n, key] of cells) {
    const box = (await replaceLogo(data, W, H, ch, x, y, n, key)) || (await enlargeLogo(data, W, H, ch, x, y, n, key))
    if (box && box[2] > 0 && box[3] > 0) logos.push(box)
  }
  ryukColour(data, ch, P)
  // very light sharpening: out = 1.1·img − 0.1·blur
  const blur = await sharp(data, { raw: { width: W, height: H, channels: ch } }).blur(1.2).raw().toBuffer()
  for (let i = 0; i < data.length; i++) { const v = data[i] * (1 + SHARPEN) - blur[i] * SHARPEN; data[i] = v < 0 ? 0 : v > 255 ? 255 : Math.round(v) }
  const png = await sharp(data, { raw: { width: W, height: H, channels: ch } }).png({ compressionLevel: 6 }).toBuffer()
  return { png, logos }
}
