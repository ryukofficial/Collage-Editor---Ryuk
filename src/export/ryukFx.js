// ─────────────────────────────────────────────────────────────────────────────
// The Ryuk effect (₹50 export), running on the phone. An exact port of the
// server version (api/_pro.js, 30 Oct) — same steps, same numbers:
//   1. Display-P3 library skins get their original colour numbers back
//   2. the series logo is made 1.15× bigger — replaced by a clean, sharp copy
//      where one exists, otherwise the skin's own logo is enlarged (exact outline)
//   3. colour: the chosen look (Dark or Classic), as Lab curves
// Works on RGBA pixel arrays (canvas ImageData), so it runs in a Web Worker.
// ─────────────────────────────────────────────────────────────────────────────
import { resize, blur } from './resample.js'

export const LOGO_SCALE = 1.15
const ED_LX = [0, 5.19, 9.13, 13.41, 18.52, 26.40, 33.48, 40.34, 47.23, 54.44, 62.33, 71.68, 82.82, 89.63, 95.06, 98.61, 100]
const ED_CX = [0, 12.55, 21.13, 32.11, 45.10, 54.70, 72.46, 150]
export const LOOKS = {
  // Ryuk Dark — the effect that was on the website (deeper shadows, colour −4 %)
  dark: {
    LY: [0.04, 3.92, 7.45, 11.12, 15.38, 22.47, 29.14, 35.68, 42.56, 49.74, 57.78, 67.3, 78.64, 85.92, 91.95, 95.89, 97.58],
    CY: [0.0, 11.71, 19.6, 30.02, 42.59, 52.29, 70.92, 150.0],
  },
  // Ryuk Classic — the original default look
  classic: {
    LY: [0.1, 4.99, 9.18, 13.41, 18.21, 25.88, 32.95, 39.69, 46.71, 53.85, 61.81, 71.05, 82.01, 88.8, 94.43, 98.27, 99.95],
    CY: [0.0, 12.2, 20.42, 31.27, 44.36, 54.47, 73.87, 150.0],
  },
}

// ── sRGB ⇄ CIELAB (D65) ─────────────────────────────────────────────────────
const toLin = new Float32Array(256)
for (let i = 0; i < 256; i++) { const c = i / 255; toLin[i] = c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4 }
const toSrgb = v => {
  v = v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055
  return v <= 0 ? 0 : v >= 1 ? 255 : Math.round(v * 255)
}
const Xn = 0.95047, Zn = 1.08883
const f = t => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116)
const fi = t => (t > 0.206893 ? t * t * t : (t - 16 / 116) / 7.787)
function rgbToLab(r8, g8, b8) {
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
function interp(x, xs, ys) {
  if (x <= xs[0]) return ys[0]
  const n = xs.length - 1
  if (x >= xs[n]) return ys[n]
  let lo = 0, hi = n
  while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (xs[mid] <= x) lo = mid; else hi = mid }
  const d = xs[hi] - xs[lo]
  return d > 1e-9 ? ys[lo] + (ys[hi] - ys[lo]) * (x - xs[lo]) / d : ys[lo]
}

// colour look (each distinct colour is worked out once, then reused)
const lookCache = { dark: new Map(), classic: new Map() }
const tmp3 = new Uint8ClampedArray(3)
export function applyLook(d, look = 'dark') {
  const { LY, CY } = LOOKS[look] || LOOKS.dark
  let cache = lookCache[look] || (lookCache[look] = new Map())
  for (let p = 0; p < d.length; p += 4) {
    const key = (d[p] << 16) | (d[p + 1] << 8) | d[p + 2]
    let v = cache.get(key)
    if (v === undefined) {
      let [L, a, b] = rgbToLab(d[p], d[p + 1], d[p + 2])
      L = interp(L, ED_LX, LY)
      const c = Math.hypot(a, b)
      if (c > 1e-4) { const k = interp(c, ED_CX, CY) / c; a *= k; b *= k }
      labToRgb(L, a, b, tmp3, 0)
      v = (tmp3[0] << 16) | (tmp3[1] << 8) | tmp3[2]
      if (cache.size > 3_000_000) { cache = lookCache[look] = new Map() }       // keeps memory in check
      cache.set(key, v)
    }
    d[p] = v >> 16; d[p + 1] = (v >> 8) & 255; d[p + 2] = v & 255
  }
}

// Library skins saved in Display P3: the browser turned them into sRGB when it
// drew the collage. Turn them back into their original numbers.
const S2P = [0.8225, 0.1774, 0, 0.0332, 0.9669, 0, 0.0171, 0.0724, 0.9108]
export function restoreP3(d, W, H, x, y, n) {
  const x1 = Math.min(W, x + n), y1 = Math.min(H, y + n)
  for (let Y = Math.max(0, y); Y < y1; Y++) {
    for (let X = Math.max(0, x); X < x1; X++) {
      const o = (Y * W + X) * 4
      const r = toLin[d[o]], g = toLin[d[o + 1]], b = toLin[d[o + 2]]
      d[o]     = toSrgb(S2P[0] * r + S2P[1] * g + S2P[2] * b)
      d[o + 1] = toSrgb(S2P[3] * r + S2P[4] * g + S2P[5] * b)
      d[o + 2] = toSrgb(S2P[6] * r + S2P[7] * g + S2P[8] * b)
    }
  }
}

// ── logo outlines ───────────────────────────────────────────────────────────
const maskCache = new Map()
function maskFor(lib, key) {
  if (!key || !Object.prototype.hasOwnProperty.call(lib.masks, key)) return null
  if (maskCache.has(key)) return maskCache.get(key)
  const [mx, my, mw, mh, b64] = lib.masks[key]
  const bin = atob(b64), bits = new Uint8Array(mw * mh)
  for (let i = 0; i < bits.length; i++) bits[i] = (bin.charCodeAt(i >> 3) >> (7 - (i & 7))) & 1
  const m = { mx, my, mw, mh, bits }
  maskCache.set(key, m)
  return m
}

// the outline mask scaled to the cell (Catmull-Rom, like the server)
function scaledMask(m, s) {
  const big = new Uint8Array(m.mw * m.mh)
  for (let i = 0; i < big.length; i++) big[i] = m.bits[i] * 255
  const mw = Math.max(1, Math.round(m.mw * s)), mh = Math.max(1, Math.round(m.mh * s))
  return { data: resize(big, m.mw, m.mh, 1, mw, mh, 'cubic'), mw, mh }
}

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

function copyBox(d, W, x0, y0, bw, bh) {
  const box = new Uint8ClampedArray(bw * bh * 4)
  for (let r = 0; r < bh; r++) box.set(d.subarray(((y0 + r) * W + x0) * 4, ((y0 + r) * W + x0 + bw) * 4), r * bw * 4)
  return box
}
function pasteBox(d, W, x0, y0, box, bw, bh) {
  for (let r = 0; r < bh; r++) d.set(box.subarray(r * bw * 4, (r + 1) * bw * 4), ((y0 + r) * W + x0) * 4)
}

// Fills the hole (255 = fill) smoothly from the surrounding picture (pull-push).
function fillHole(box, bw, bh, hole) {
  const filled = new Uint8ClampedArray(box)
  const levels = []
  let w = bw, h = bh
  let col = new Float32Array(w * h * 3), wt = new Float32Array(w * h)
  for (let i = 0; i < w * h; i++) if (!hole[i]) { wt[i] = 1; col[i * 3] = box[i * 4]; col[i * 3 + 1] = box[i * 4 + 1]; col[i * 3 + 2] = box[i * 4 + 2] }
  levels.push({ w, h, col, wt })
  while (w > 1 || h > 1) {
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
  for (let l = levels.length - 2; l >= 0; l--) {
    const L = levels[l], C = levels[l + 1]
    for (let y2 = 0; y2 < L.h; y2++) for (let x2 = 0; x2 < L.w; x2++) {
      const i = y2 * L.w + x2, q = L.wt[i]
      if (q >= 1) continue
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
  for (let i = 0; i < bw * bh; i++) if (hole[i]) for (let k = 0; k < 3; k++) filled[i * 4 + k] = Math.round(L0.col[i * 3 + k])
  return filled
}

// The skin's own logo, 1.15× bigger (only the logo itself, exact outline).
function enlargeLogo(lib, d, W, H, x, y, n, key) {
  const m = maskFor(lib, key)
  if (!m || n < 32) return null
  const s = n / lib.maskSize
  const pad = Math.ceil(4 * s)
  const bx = Math.max(0, Math.floor(m.mx * s) - pad), by = Math.max(0, Math.floor(m.my * s) - pad)
  const bx2 = Math.min(n, Math.ceil((m.mx + m.mw) * s) + pad), by2 = Math.min(n, Math.ceil((m.my + m.mh) * s) + pad)
  const bw = bx2 - bx, bh = by2 - by
  if (bw < 4 || bh < 4 || x + bx2 > W || y + by2 > H) return null

  const { data: scaled, mw, mh } = scaledMask(m, s)
  const ox = Math.round(m.mx * s) - bx, oy = Math.round(m.my * s) - by
  const hard = new Uint8Array(bw * bh)
  for (let r = 0; r < mh; r++) for (let c = 0; c < mw; c++) {
    const X = ox + c, Y = oy + r
    if (X >= 0 && X < bw && Y >= 0 && Y < bh && scaled[r * mw + c] > 96) hard[Y * bw + X] = 255
  }
  const hole = dilate(hard, bw, bh, Math.max(1, Math.round(2.5 * s)))
  const keep = dilate(hard, bw, bh, Math.max(1, Math.round(1.2 * s)))

  const box = copyBox(d, W, x + bx, y + by, bw, bh)
  const filled = fillHole(box, bw, bh, hole)
  const tw = Math.round(bw * LOGO_SCALE), th = Math.round(bh * LOGO_SCALE)
  const bigImg = resize(box, bw, bh, 4, tw, th, 'lanczos3')
  const bigA = blur(resize(keep, bw, bh, 1, tw, th, 'cubic'), tw, th, Math.max(0.4, 0.8 * s))
  const right = x + bx2, top = y + by
  pasteBox(d, W, x + bx, y + by, filled, bw, bh)
  for (let r = 0; r < th; r++) {
    const Y = top + r; if (Y < y || Y >= y + n || Y >= H) continue
    for (let c = 0; c < tw; c++) {
      const X = right - tw + c; if (X < x || X >= x + n || X >= W) continue
      const a = bigA[r * tw + c] / 255; if (a <= 0.004) continue
      const o = (Y * W + X) * 4, si = (r * tw + c) * 4
      for (let k = 0; k < 3; k++) d[o + k] = Math.round(d[o + k] * (1 - a) + bigImg[si + k] * a)
    }
  }
  const lx = Math.max(x, right - tw), ly = Math.max(y, top)
  return [lx, ly, Math.min(x + n, right) - lx, Math.min(y + n, top + th) - ly]
}

// A clean copy of the series logo, drawn 1.15× bigger where the old one was.
function replaceLogo(lib, d, W, H, x, y, n, key) {
  const pl = Object.prototype.hasOwnProperty.call(lib.places, key) ? lib.places[key] : null
  const lg = pl && lib.logos.get(pl[0])
  if (!pl || n < 32 || !lg) return null
  const m = maskFor(lib, key)
  const s = n / lib.maskSize
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

  const hard = new Uint8Array(bw * bh)
  if (m) {
    const { data: scaled, mw, mh } = scaledMask(m, s)
    const ox = Math.round(m.mx * s) - bx, oy = Math.round(m.my * s) - by
    for (let r = 0; r < mh; r++) for (let c = 0; c < mw; c++) {
      const X = ox + c, Y = oy + r
      if (X >= 0 && X < bw && Y >= 0 && Y < bh && scaled[r * mw + c] > 96) hard[Y * bw + X] = 255
    }
  }
  const ow = Math.max(1, Math.round(lw)), oh = Math.max(1, Math.round(lh))
  const oldRGBA = resize(lg.data, lg.w, lg.h, 4, ow, oh, 'cubic')
  const ox = Math.round(lx) - bx, oy = Math.round(ly) - by
  for (let r = 0; r < oh; r++) for (let c = 0; c < ow; c++) {
    const X = ox + c, Y = oy + r
    if (X >= 0 && X < bw && Y >= 0 && Y < bh && oldRGBA[(r * ow + c) * 4 + 3] > 90) hard[Y * bw + X] = 255
  }
  const hole = dilate(hard, bw, bh, Math.max(1, Math.round(2.5 * s)))
  const box = copyBox(d, W, x + bx, y + by, bw, bh)
  pasteBox(d, W, x + bx, y + by, fillHole(box, bw, bh, hole), bw, bh)

  const big = resize(lg.data, lg.w, lg.h, 4, tw, th, tw > lg.w ? 'lanczos3' : 'mitchell')
  const X0 = x + right - tw, Y0 = y + top
  for (let r = 0; r < th; r++) {
    const Y = Y0 + r; if (Y < y || Y >= y + n || Y >= H) continue
    for (let c = 0; c < tw; c++) {
      const X = X0 + c; if (X < x || X >= x + n || X >= W) continue
      const si = (r * tw + c) * 4, a = big[si + 3] / 255; if (a <= 0.004) continue
      const o = (Y * W + X) * 4
      for (let k = 0; k < 3; k++) d[o + k] = Math.round(d[o + k] * (1 - a) + big[si + k] * a)
    }
  }
  const qx = Math.max(x, X0), qy = Math.max(y, Y0)
  return [qx, qy, Math.min(x + n, X0 + tw) - qx, Math.min(y + n, Y0 + th) - qy]
}

// One band of the collage (RGBA, W × H).
//   cells: [[x, y, n, key]] skin cells inside the band (key = library file name or null)
//   lib:   { maskSize, masks, places, p3: Set, logos: Map(id → { data, w, h }) }
// Changes `d` in place; returns the logo areas (the HD upscale keeps them crisp).
export function processBand(d, W, H, cells, lib, look = 'dark') {
  const logos = []
  for (const [x, y, n, key] of cells) if (key && lib.p3.has(key)) restoreP3(d, W, H, x, y, n)
  for (const [x, y, n, key] of cells) {
    if (!key) continue
    const box = replaceLogo(lib, d, W, H, x, y, n, key) || enlargeLogo(lib, d, W, H, x, y, n, key)
    if (box && box[2] > 0 && box[3] > 0) logos.push(box)
  }
  applyLook(d, look)
  return logos
}

// Which logo pictures a collage needs (so only those are downloaded).
export function logosNeeded(lib, keys) {
  const ids = new Set()
  for (const k of keys) if (k && Object.prototype.hasOwnProperty.call(lib.places, k)) ids.add(lib.places[k][0])
  return [...ids]
}
