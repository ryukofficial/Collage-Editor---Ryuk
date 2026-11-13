// Small, exact image resampling helpers for the Ryuk effect.
// They work on plain byte arrays, so the effect gives the same result in every
// browser (canvas scaling differs between phones) and can be tested in Node.

const KERNELS = {
  // Catmull-Rom (what libvips/sharp call "cubic")
  cubic: { radius: 2, fn: x => {
    x = Math.abs(x)
    if (x < 1) return 1.5 * x * x * x - 2.5 * x * x + 1
    if (x < 2) return -0.5 * x * x * x + 2.5 * x * x - 4 * x + 2
    return 0
  } },
  // Mitchell–Netravali, B = C = 1/3
  mitchell: { radius: 2, fn: x => {
    x = Math.abs(x)
    const B = 1 / 3, C = 1 / 3
    if (x < 1) return ((12 - 9 * B - 6 * C) * x * x * x + (-18 + 12 * B + 6 * C) * x * x + (6 - 2 * B)) / 6
    if (x < 2) return ((-B - 6 * C) * x * x * x + (6 * B + 30 * C) * x * x + (-12 * B - 48 * C) * x + (8 * B + 24 * C)) / 6
    return 0
  } },
  lanczos3: { radius: 3, fn: x => {
    x = Math.abs(x)
    if (x < 1e-8) return 1
    if (x >= 3) return 0
    const px = Math.PI * x
    return (3 * Math.sin(px) * Math.sin(px / 3)) / (px * px)
  } },
}

// Weights for one axis: for each output position, the first source index and
// the normalised weights. Downscaling widens the kernel (proper anti-aliasing).
function axisWeights(srcLen, dstLen, kernel) {
  const k = KERNELS[kernel]
  const scale = srcLen / dstLen
  const stretch = Math.max(1, scale)
  const support = k.radius * stretch
  const out = new Array(dstLen)
  for (let i = 0; i < dstLen; i++) {
    const centre = (i + 0.5) * scale - 0.5
    const lo = Math.ceil(centre - support), hi = Math.floor(centre + support)
    const w = []
    let sum = 0
    for (let j = lo; j <= hi; j++) { const v = k.fn((j - centre) / stretch); w.push(v); sum += v }
    if (Math.abs(sum) > 1e-12) for (let n = 0; n < w.length; n++) w[n] /= sum
    out[i] = { lo, w }
  }
  return out
}

// Resizes `src` (w × h, `ch` channels, Uint8) to dw × dh. Returns a Uint8ClampedArray.
// RGBA pictures are resized with premultiplied alpha (no dark fringes), like sharp.
export function resize(src, w, h, ch, dw, dh, kernel = 'cubic') {
  if (ch === 4) {
    const pre = new Float32Array(src.length)
    for (let i = 0; i < src.length; i += 4) {
      const a = src[i + 3] / 255
      pre[i] = src[i] * a; pre[i + 1] = src[i + 1] * a; pre[i + 2] = src[i + 2] * a; pre[i + 3] = src[i + 3]
    }
    const out = resizeRaw(pre, w, h, 4, dw, dh, kernel, false)
    const res = new Uint8ClampedArray(out.length)
    for (let i = 0; i < out.length; i += 4) {
      const a = out[i + 3]
      const k = a > 0.5 ? 255 / a : 0
      res[i] = Math.round(out[i] * k); res[i + 1] = Math.round(out[i + 1] * k); res[i + 2] = Math.round(out[i + 2] * k); res[i + 3] = Math.round(a)
    }
    return res
  }
  return resizeRaw(src, w, h, ch, dw, dh, kernel, true)
}

function resizeRaw(src, w, h, ch, dw, dh, kernel, toBytes) {
  const wx = axisWeights(w, dw, kernel), wy = axisWeights(h, dh, kernel)
  const tmp = new Float32Array(dw * h * ch)                    // horizontal pass
  for (let y = 0; y < h; y++) {
    const row = y * w
    for (let x = 0; x < dw; x++) {
      const { lo, w: ws } = wx[x]
      const o = (y * dw + x) * ch
      for (let c = 0; c < ch; c++) {
        let acc = 0
        for (let n = 0; n < ws.length; n++) {
          const sx = Math.min(w - 1, Math.max(0, lo + n))
          acc += src[(row + sx) * ch + c] * ws[n]
        }
        tmp[o + c] = acc
      }
    }
  }
  const out = toBytes ? new Uint8ClampedArray(dw * dh * ch) : new Float32Array(dw * dh * ch)   // vertical pass
  for (let y = 0; y < dh; y++) {
    const { lo, w: ws } = wy[y]
    for (let x = 0; x < dw; x++) {
      const o = (y * dw + x) * ch
      for (let c = 0; c < ch; c++) {
        let acc = 0
        for (let n = 0; n < ws.length; n++) {
          const sy = Math.min(h - 1, Math.max(0, lo + n))
          acc += tmp[(sy * dw + x) * ch + c] * ws[n]
        }
        out[o + c] = toBytes ? Math.round(acc) : Math.min(255, Math.max(0, acc))
      }
    }
  }
  return out
}

// Gaussian blur of a single-channel image (like sharp's blur(sigma)).
export function blur(src, w, h, sigma) {
  const radius = Math.max(1, Math.ceil(sigma * Math.sqrt(-2 * Math.log(0.2))))
  const k = new Float32Array(radius * 2 + 1)
  let sum = 0
  for (let i = -radius; i <= radius; i++) { const v = Math.exp(-(i * i) / (2 * sigma * sigma)); k[i + radius] = v; sum += v }
  for (let i = 0; i < k.length; i++) k[i] /= sum
  const tmp = new Float32Array(w * h), out = new Uint8ClampedArray(w * h)
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let acc = 0
    for (let i = -radius; i <= radius; i++) acc += src[y * w + Math.min(w - 1, Math.max(0, x + i))] * k[i + radius]
    tmp[y * w + x] = acc
  }
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let acc = 0
    for (let i = -radius; i <= radius; i++) acc += tmp[Math.min(h - 1, Math.max(0, y + i)) * w + x] * k[i + radius]
    out[y * w + x] = Math.round(acc)
  }
  return out
}
