// ─────────────────────────────────────────────────────────────────────────────
// HD upscale ×2 in the customer's browser (free — no server, no paid service).
//
// Uses a fast Real-ESRGAN model made for anime/illustrations (about 8× faster
// than the big one, nearly the same result) through onnxruntime-web on the
// phone's graphics chip (WebGPU).
//
//   • every skin is upscaled on its own in one go (no wasted overlap), so
//     nothing bleeds across borders; the profile banner is done in tiles
//   • if the picture is already as big as a phone can save, nothing is redone
//   • logos are NOT redrawn by the AI (it can scramble small letters): their
//     area is enlarged smoothly and sharpened instead, blended in softly
//   • the final picture is kept under 16 million pixels so phones can save it
// ─────────────────────────────────────────────────────────────────────────────
const ORT_VERSION = '1.29.0'
const ORT_BASE = `https://cdn.jsdelivr.net/npm/onnxruntime-web@${ORT_VERSION}/dist/`
const MODEL_URL = '/models/realesrgan-fast.onnx'
const MAX_OUT_PIXELS = 16_000_000
const TILE = 400            // AI input tile (pixels) — a whole skin fits in one
const OVERLAP = 12          // overlap between tiles, hides tile edges
const AI_MIX = 0.65         // how much of the AI result is used (the rest is a plain smooth enlarge) — full AI looked over-processed
const MAX_MINUTES = 20      // if the device would take longer than this, stop and export without HD

let cancelled = false
export function cancelHdUpscale() { cancelled = true }
const fail = code => Object.assign(new Error(code), { code })

let ortPromise = null
function loadOrt() {
  if (window.ort) return Promise.resolve(window.ort)
  if (!ortPromise) {
    ortPromise = new Promise((resolve, reject) => {
      const s = document.createElement('script')
      s.src = ORT_BASE + 'ort.webgpu.min.js'
      s.crossOrigin = 'anonymous'
      s.onload = () => (window.ort ? resolve(window.ort) : reject(new Error('upscaler_unavailable')))
      s.onerror = () => { ortPromise = null; reject(new Error('upscaler_unavailable')) }
      document.head.appendChild(s)
    })
  }
  return ortPromise
}

let sessionPromise = null
async function getSession() {
  if (!sessionPromise) {
    sessionPromise = (async () => {
      const ort = await loadOrt()
      ort.env.wasm.wasmPaths = ORT_BASE
      ort.env.wasm.numThreads = Math.min(4, navigator.hardwareConcurrency || 1)
      const res = await fetch(MODEL_URL)
      if (!res.ok) throw new Error('upscaler_unavailable')
      const model = new Uint8Array(await res.arrayBuffer())
      // The graphics chip (WebGPU) is needed: on the processor alone this model
      // would take far too long on a phone.
      const tries = []
      let gpuOk = false
      try { gpuOk = !!(navigator.gpu && await navigator.gpu.requestAdapter()) } catch { gpuOk = false }
      if (gpuOk) tries.push('webgpu')
      if (window.__ryukAllowCpuUpscale) tries.push('wasm')      // tests only
      if (!tries.length) throw fail('no_webgpu')
      let lastErr = null
      for (const ep of tries) {
        try {
          const session = await ort.InferenceSession.create(model, { executionProviders: [ep], graphOptimizationLevel: 'all' })
          return { ort, session, ep }
        } catch (e) { lastErr = e }
      }
      throw lastErr || new Error('upscaler_unavailable')
    })()
    sessionPromise.catch(() => { sessionPromise = null })
  }
  return sessionPromise
}

// RGBA ImageData → AI ×4 → RGBA Uint8ClampedArray (w*4, h*4)
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

const canvas = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c }
const ctx2d = c => { const x = c.getContext('2d', { willReadFrequently: true }); x.imageSmoothingEnabled = true; x.imageSmoothingQuality = 'high'; return x }

// Upscales one rectangle of `src` (a canvas) with the AI, in overlapping tiles,
// and draws it at scale `k` into `dst` (a 2D context).
async function upscaleRect(S, src, rx, ry, rw, rh, dst, k, clock) {
  const sctx = src.getContext('2d', { willReadFrequently: true })
  for (let ty = 0; ty < rh; ty += TILE) {
    for (let tx = 0; tx < rw; tx += TILE) {
      const tw = Math.min(TILE, rw - tx), th = Math.min(TILE, rh - ty)
      // tile plus overlap, never crossing the rectangle's own edges
      const ax = Math.max(0, tx - OVERLAP), ay = Math.max(0, ty - OVERLAP)
      const bx = Math.min(rw, tx + tw + OVERLAP), by = Math.min(rh, ty + th + OVERLAP)
      if (cancelled) throw fail('cancelled')
      const tile = sctx.getImageData(rx + ax, ry + ay, bx - ax, by - ay)
      const up = await aiUpscale4(S, tile)
      clock.tick()
      const upC = canvas(up.width, up.height)
      upC.getContext('2d').putImageData(new ImageData(up.data, up.width, up.height), 0, 0)
      // keep only the tile itself (drop the overlap), scaled from ×4 to ×k
      const sx = (tx - ax) * 4, sy = (ty - ay) * 4
      const X0 = Math.round((rx + tx) * k), Y0 = Math.round((ry + ty) * k)
      const X1 = Math.round((rx + tx + tw) * k), Y1 = Math.round((ry + ty + th) * k)
      dst.globalAlpha = AI_MIX                      // blended over the smooth enlarge already drawn there
      dst.drawImage(upC, sx, sy, tw * 4, th * 4, X0, Y0, X1 - X0, Y1 - Y0)
      dst.globalAlpha = 1
      upC.width = upC.height = 1
      await new Promise(r => setTimeout(r, 0))      // keep the page responsive
    }
  }
}

// Logo areas: smooth enlarge + light sharpen (no AI), soft-blended into the AI result.
function crispLogos(src, dst, logos, k) {
  for (const [x, y, w, h] of logos) {
    const pad = Math.max(2, Math.round(Math.min(w, h) * 0.06))
    const x0 = Math.max(0, x - pad), y0 = Math.max(0, y - pad)
    const x1 = Math.min(src.width, x + w + pad), y1 = Math.min(src.height, y + h + pad)
    const W = Math.round((x1 - x0) * k), H = Math.round((y1 - y0) * k)
    if (W < 4 || H < 4) continue
    const c = canvas(W, H), cx = ctx2d(c)
    cx.drawImage(src, x0, y0, x1 - x0, y1 - y0, 0, 0, W, H)
    const img = cx.getImageData(0, 0, W, H), d = img.data
    // light unsharp mask (3×3 box blur)
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
    const base = dst.getImageData(Math.round(x0 * k), Math.round(y0 * k), W, H), b = base.data
    const feather = Math.max(2, Math.round(pad * k))
    for (let yy = 0; yy < H; yy++) for (let xx = 0; xx < W; xx++) {
      const edge = Math.min(xx, yy, W - 1 - xx, H - 1 - yy)
      let a = Math.min(1, edge / feather); a = a * a * (3 - 2 * a)
      const i = (yy * W + xx) * 4
      for (let ch = 0; ch < 3; ch++) {
        const sharp = d[i + ch] * 1.5 - blur[i + ch] * 0.5
        b[i + ch] = b[i + ch] * (1 - a) + sharp * a
      }
    }
    dst.putImageData(base, Math.round(x0 * k), Math.round(y0 * k))
    c.width = c.height = 1
  }
}

// blob: the finished "Export for editing" PNG (with .layout and .logos)
// Returns a new PNG blob about twice as big.
export async function hdUpscale(blob, { onProgress = () => {} } = {}) {
  const layout = blob.layout, logos = blob.logos || []
  const bmp = await createImageBitmap(blob)
  const k = Math.min(2, Math.sqrt(MAX_OUT_PIXELS / (bmp.width * bmp.height)))
  if (k < 1.1) { bmp.close?.(); return blob }           // already as big as it can be — nothing to gain
  const S = await getSession()
  const src = canvas(bmp.width, bmp.height); src.getContext('2d').drawImage(bmp, 0, 0); bmp.close?.()
  const out = canvas(Math.round(src.width * k), Math.round(src.height * k)), octx = ctx2d(out)
  // smooth ×k first, so anything not covered below is never left empty
  octx.drawImage(src, 0, 0, out.width, out.height)

  cancelled = false
  const jobs = []
  if (layout?.bannerH > 0) jobs.push([0, 0, src.width, layout.bannerH])
  if (layout?.cellSize) {
    const c = layout.cellSize
    for (let r = 0; r < layout.rows; r++) for (let col = 0; col < layout.cols; col++) {
      if (r * layout.cols + col >= layout.skins.length) continue
      jobs.push([col * c, layout.bannerH + r * c, c, c])
    }
  } else {
    jobs.push([0, 0, src.width, src.height])
  }
  // time check: after a few tiles, estimate the total and stop early if it's too long
  const tilesOf = (w, h) => Math.ceil(w / TILE) * Math.ceil(h / TILE)
  const totalTiles = jobs.reduce((t, [, , w, h]) => t + tilesOf(w, h), 0)
  const t0 = performance.now()
  const clock = {
    done: 0,
    tick() {
      this.done++
      const perTile = (performance.now() - t0) / this.done
      const leftMin = (perTile * (totalTiles - this.done)) / 60000
      if (this.done === 3 && leftMin > MAX_MINUTES) throw fail('too_slow')
      onProgress(this.done / totalTiles, Math.max(1, Math.round(leftMin)))
    },
  }
  for (const [x, y, w, h] of jobs) await upscaleRect(S, src, x, y, w, h, octx, k, clock)
  crispLogos(src, octx, logos, k)
  const result = await new Promise(r => out.toBlob(r, 'image/png'))
  src.width = src.height = out.width = out.height = 1
  if (!result) throw new Error('upscaler_failed')
  return result
}

// Warm up (download the model) without blocking anything.
export function preloadHdUpscale() { getSession().catch(() => {}) }
