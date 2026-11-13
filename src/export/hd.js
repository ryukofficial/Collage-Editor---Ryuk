// ─────────────────────────────────────────────────────────────────────────────
// HD upscale ×2 on the customer's phone (free, no server). Same enhance as
// before — fast Real-ESRGAN anime model, 65 % AI over a smooth enlarge,
// 400 px tiles with 12 px overlap, logos enlarged + sharpened instead of
// redrawn by the AI — but now done one skin at a time while the export is
// written, so it never needs one giant canvas.
// ─────────────────────────────────────────────────────────────────────────────
const ORT_VERSION = '1.29.0'
const ORT_BASE = `https://cdn.jsdelivr.net/npm/onnxruntime-web@${ORT_VERSION}/dist/`
const MODEL_URL = '/models/realesrgan-fast.onnx'
export const AI_MIX = 0.65
const TILE = 400, OVERLAP = 12
export const MAX_MINUTES = 20
// biggest picture the HD export makes (so phones can still open and save it)
export const MAX_OUT_PIXELS = (navigator.deviceMemory || 4) >= 8 ? 64_000_000 : 32_000_000

export const fail = code => Object.assign(new Error(code), { code })

let ortPromise = null
function loadOrt() {
  if (window.ort) return Promise.resolve(window.ort)
  if (!ortPromise) {
    ortPromise = new Promise((resolve, reject) => {
      const s = document.createElement('script')
      s.src = ORT_BASE + 'ort.webgpu.min.js'
      s.crossOrigin = 'anonymous'
      s.onload = () => (window.ort ? resolve(window.ort) : reject(fail('upscaler_unavailable')))
      s.onerror = () => { ortPromise = null; s.remove(); reject(fail('upscaler_unavailable')) }
      document.head.appendChild(s)
    })
  }
  return ortPromise
}

let sessionPromise = null
export function getHdSession() {
  if (!sessionPromise) {
    sessionPromise = (async () => {
      let gpuOk = false
      try { gpuOk = !!(navigator.gpu && await navigator.gpu.requestAdapter()) } catch { gpuOk = false }
      if (!gpuOk && !window.__ryukAllowCpuUpscale) throw fail('no_webgpu')
      const ort = await loadOrt()
      ort.env.wasm.wasmPaths = ORT_BASE
      ort.env.wasm.numThreads = Math.min(4, navigator.hardwareConcurrency || 1)
      let model = null
      for (let i = 0; i < 4 && !model; i++) {
        try {
          const res = await fetch(MODEL_URL)
          if (!res.ok) throw fail('upscaler_unavailable')
          model = new Uint8Array(await res.arrayBuffer())
        } catch (e) { if (i === 3) throw fail('upscaler_unavailable'); await new Promise(r => setTimeout(r, 1000 * (i + 1))) }
      }
      const session = await ort.InferenceSession.create(model, { executionProviders: [gpuOk ? 'webgpu' : 'wasm'], graphOptimizationLevel: 'all' })
      return { ort, session }
    })()
    sessionPromise.catch(() => { sessionPromise = null })
  }
  return sessionPromise
}
// Warm up (download the model) without blocking anything.
export function preloadHd() { getHdSession().catch(() => {}) }
export async function hdSupported() {
  try { return !!(navigator.gpu && await navigator.gpu.requestAdapter()) } catch { return false }
}

// RGBA ImageData → AI ×4 → RGBA
async function aiUpscale4(S, img) {
  const { ort, session } = S
  const w = img.width, h = img.height, n = w * h, d = img.data
  const input = new Float32Array(3 * n)
  for (let i = 0; i < n; i++) { input[i] = d[i * 4] / 255; input[n + i] = d[i * 4 + 1] / 255; input[2 * n + i] = d[i * 4 + 2] / 255 }
  const out = await session.run({ input: new ort.Tensor('float32', input, [1, 3, h, w]) })
  const o = out.output.data, W = w * 4, H = h * 4, N = W * H
  const rgba = new Uint8ClampedArray(N * 4)
  for (let i = 0; i < N; i++) { rgba[i * 4] = o[i] * 255 + 0.5; rgba[i * 4 + 1] = o[N + i] * 255 + 0.5; rgba[i * 4 + 2] = o[2 * N + i] * 255 + 0.5; rgba[i * 4 + 3] = 255 }
  out.output.dispose?.()
  return { data: rgba, width: W, height: H }
}

export const makeCanvas = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c }
const ctx2d = c => { const x = c.getContext('2d', { willReadFrequently: true }); x.imageSmoothingEnabled = true; x.imageSmoothingQuality = 'high'; return x }

// counts tiles, estimates the time left, stops if it would take too long
export function makeClock(totalTiles, onProgress, isCancelled) {
  const t0 = performance.now()
  return {
    done: 0,
    tick() {
      if (isCancelled()) throw fail('cancelled')
      this.done++
      const perTile = (performance.now() - t0) / this.done
      const leftMin = (perTile * (totalTiles - this.done)) / 60000
      if (this.done === 3 && leftMin > MAX_MINUTES) throw fail('too_slow')
      onProgress(this.done / totalTiles, Math.max(1, Math.round(leftMin)))
    },
  }
}
export const tilesOf = (w, h) => Math.ceil(w / TILE) * Math.ceil(h / TILE)

// Upscales rectangle (rx, ry, rw, rh) of `src` with the AI in overlapping tiles,
// drawing it at scale k into `dst` (already holding the smooth enlarge).
async function upscaleRect(S, src, rx, ry, rw, rh, dst, k, clock) {
  const sctx = src.getContext('2d', { willReadFrequently: true })
  for (let ty = 0; ty < rh; ty += TILE) {
    for (let tx = 0; tx < rw; tx += TILE) {
      const tw = Math.min(TILE, rw - tx), th = Math.min(TILE, rh - ty)
      const ax = Math.max(0, tx - OVERLAP), ay = Math.max(0, ty - OVERLAP)
      const bx = Math.min(rw, tx + tw + OVERLAP), by = Math.min(rh, ty + th + OVERLAP)
      const tile = sctx.getImageData(rx + ax, ry + ay, bx - ax, by - ay)
      const up = await aiUpscale4(S, tile)
      clock.tick()
      const upC = makeCanvas(up.width, up.height)
      upC.getContext('2d').putImageData(new ImageData(up.data, up.width, up.height), 0, 0)
      const sx = (tx - ax) * 4, sy = (ty - ay) * 4
      const X0 = Math.round((rx + tx) * k), Y0 = Math.round((ry + ty) * k)
      const X1 = Math.round((rx + tx + tw) * k), Y1 = Math.round((ry + ty + th) * k)
      dst.globalAlpha = AI_MIX
      dst.drawImage(upC, sx, sy, tw * 4, th * 4, X0, Y0, X1 - X0, Y1 - Y0)
      dst.globalAlpha = 1
      upC.width = upC.height = 1
      await new Promise(r => setTimeout(r, 0))
    }
  }
}

// Logo areas: smooth enlarge + light sharpen (no AI), soft-blended in.
function crispLogos(src, dst, logos, k) {
  for (const [x, y, w, h] of logos) {
    const pad = Math.max(2, Math.round(Math.min(w, h) * 0.06))
    const x0 = Math.max(0, x - pad), y0 = Math.max(0, y - pad)
    const x1 = Math.min(src.width, x + w + pad), y1 = Math.min(src.height, y + h + pad)
    const W = Math.round((x1 - x0) * k), H = Math.round((y1 - y0) * k)
    if (W < 4 || H < 4) continue
    const c = makeCanvas(W, H), cx = ctx2d(c)
    cx.drawImage(src, x0, y0, x1 - x0, y1 - y0, 0, 0, W, H)
    const img = cx.getImageData(0, 0, W, H), d = img.data
    const blur = new Float32Array(d.length)
    for (let yy = 0; yy < H; yy++) for (let xx = 0; xx < W; xx++) {
      for (let ch = 0; ch < 3; ch++) {
        let sum = 0, cnt = 0
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
          const X = xx + dx, Y = yy + dy
          if (X >= 0 && X < W && Y >= 0 && Y < H) { sum += d[(Y * W + X) * 4 + ch]; cnt++ }
        }
        blur[(yy * W + xx) * 4 + ch] = sum / cnt
      }
    }
    const bx = Math.round(x0 * k), by = Math.round(y0 * k)
    const bw = Math.min(W, dst.canvas.width - bx), bh = Math.min(H, dst.canvas.height - by)
    if (bw < 1 || bh < 1) continue
    const base = dst.getImageData(bx, by, bw, bh), b = base.data
    const feather = Math.max(2, Math.round(pad * k))
    for (let yy = 0; yy < bh; yy++) for (let xx = 0; xx < bw; xx++) {
      const edge = Math.min(xx, yy, W - 1 - xx, H - 1 - yy)
      let a = Math.min(1, edge / feather); a = a * a * (3 - 2 * a)
      const i = (yy * W + xx) * 4, j = (yy * bw + xx) * 4
      for (let ch = 0; ch < 3; ch++) {
        const sharp = d[i + ch] * 1.5 - blur[i + ch] * 0.5
        b[j + ch] = b[j + ch] * (1 - a) + sharp * a
      }
    }
    dst.putImageData(base, bx, by)
    c.width = c.height = 1
  }
}

// One picture (a skin cell, or a strip of the profile banner) → ×k with the AI.
// src: canvas; logos: [[x, y, w, h]] inside src. Returns a canvas.
export async function upscalePiece(S, src, k, logos, clock) {
  const out = makeCanvas(Math.round(src.width * k), Math.round(src.height * k)), octx = ctx2d(out)
  octx.drawImage(src, 0, 0, out.width, out.height)          // smooth enlarge first
  await upscaleRect(S, src, 0, 0, src.width, src.height, octx, k, clock)
  if (logos?.length) crispLogos(src, octx, logos, k)
  return out
}
