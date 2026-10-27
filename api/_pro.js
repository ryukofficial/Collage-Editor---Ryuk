// "Export for editing" processing. Server only — this recipe never reaches the browser.
//   • series tags in the top-right of each skin made 15% bigger
//   • colour prep for the editing preset: CIELAB chroma × 0.845, midtones −4 (of 255)
import sharp from 'sharp'

const CHROMA = 0.845
const MIDTONE = -4
const TAG_SCALE = 1.15
const TAG = { x0: 0.48, y0: 0, x1: 0.995, y1: 0.28 }

// ── colour ──────────────────────────────────────────────────────────────────
const toLin = new Float32Array(256)
for (let i = 0; i < 256; i++) { const c = i / 255; toLin[i] = c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4 }
const toSrgb = v => {
  v = v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055
  return v <= 0 ? 0 : v >= 1 ? 255 : Math.round(v * 255)
}
const Xn = 0.95047, Zn = 1.08883
const f  = t => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116)
const fi = t => (t > 0.206893 ? t * t * t : (t - 16 / 116) / 7.787)

function colourPrep(d, channels) {
  for (let p = 0; p < d.length; p += channels) {
    const r = toLin[d[p]], g = toLin[d[p + 1]], b = toLin[d[p + 2]]
    const fx = f((0.4124564 * r + 0.3575761 * g + 0.1804375 * b) / Xn)
    const fy = f(0.2126729 * r + 0.7151522 * g + 0.0721750 * b)
    const fz = f((0.0193339 * r + 0.1191920 * g + 0.9503041 * b) / Zn)
    let L = 116 * fy - 16
    const a = 500 * (fx - fy) * CHROMA, bb = 200 * (fy - fz) * CHROMA
    L += MIDTONE * (100 / 255) * Math.pow(Math.sin(Math.PI * Math.min(Math.max(L, 0), 100) / 100), 1.5)
    const ny = (L + 16) / 116
    const x = fi(ny + a / 500) * Xn, y = fi(ny), z = fi(ny - bb / 200) * Zn
    d[p]     = toSrgb( 3.2404542 * x - 1.5371385 * y - 0.4985314 * z)
    d[p + 1] = toSrgb(-0.9692660 * x + 1.8760108 * y + 0.0415560 * z)
    d[p + 2] = toSrgb( 0.0556434 * x - 0.2040259 * y + 1.0572252 * z)
  }
}

// ── bigger tag in one skin cell (x, y, n in piece pixels) ───────────────────
async function enlargeTag(raw, W, H, ch, x, y, n) {
  const sx = Math.round(x + TAG.x0 * n), sy = Math.round(y + TAG.y0 * n)
  const sw = Math.round((TAG.x1 - TAG.x0) * n), sh = Math.round((TAG.y1 - TAG.y0) * n)
  if (sw < 4 || sh < 4 || sx + sw > W || sy + sh > H) return
  const tw = Math.round(sw * TAG_SCALE), th = Math.round(sh * TAG_SCALE)
  const crop = Buffer.alloc(sw * sh * ch)
  for (let r = 0; r < sh; r++) raw.copy(crop, r * sw * ch, ((sy + r) * W + sx) * ch, ((sy + r) * W + sx + sw) * ch)
  const big = await sharp(crop, { raw: { width: sw, height: sh, channels: ch } }).resize(tw, th, { kernel: 'lanczos3' }).raw().toBuffer()
  const px = Math.max(x, Math.round(x + TAG.x1 * n - tw + 0.01 * n))
  const fx = 0.22 * tw, fy = 0.30 * th
  for (let r = 0; r < th; r++) {
    const Y = sy + r; if (Y >= y + n || Y >= H) break
    let my = Math.min(1, (th - 1 - r) / fy); my = my * my * (3 - 2 * my)
    for (let c = 0; c < tw; c++) {
      const X = px + c; if (X >= x + n || X >= W) break
      let mx = Math.min(1, c / fx); mx = mx * mx * (3 - 2 * mx)
      const m = mx * my; if (m <= 0) continue
      const o = (Y * W + X) * ch, s = (r * tw + c) * ch
      for (let k = 0; k < 3; k++) raw[o + k] = Math.round(raw[o + k] * (1 - m) + big[s + k] * m)
    }
  }
}

// image: PNG of one piece; cells: [[x, y, n], …] skin cells inside it
export async function processPiece(image, cells) {
  const img = sharp(image, { limitInputPixels: 16_000_000 }).removeAlpha()
  const { data, info } = await img.raw().toBuffer({ resolveWithObject: true })
  const { width: W, height: H, channels: ch } = info
  for (const [x, y, n] of cells) await enlargeTag(data, W, H, ch, x, y, n)
  colourPrep(data, ch)
  return sharp(data, { raw: { width: W, height: H, channels: ch } }).png({ compressionLevel: 6 }).toBuffer()
}
