// ─────────────────────────────────────────────────────────────────────────────
// Export: builds the collage PNG one row of skins at a time.
//   • unlimited size — the picture is streamed into a PNG, never one big canvas
//   • full quality — every skin is drawn at the size of the sharpest picture in
//     the collage (nothing is shrunk); the profile banner is fitted to the
//     collage width (or the collage grows to the banner's width)
//   • optional Ryuk effect (Dark / Classic) and HD ×2, both on the phone
//   • weak internet: all pictures are downloaded first (with retries, and kept
//     by the service worker), so the slow part never waits on the network
// ─────────────────────────────────────────────────────────────────────────────
import { gridOf, cropOf } from '../lib/store.js'
import { itemBlob, decode, cellBitmap } from '../lib/images.js'
import { blobGet } from '../lib/db.js'
import { PngWriter, PngWorkerWriter } from './png.js'

export const PAID_MAX_CELL = 1000         // the Ryuk effect works at up to 1000 px per skin (as before)
const MAX_CELL = 2048                     // more than Full HD per skin
const MAX_BAND_BYTES = 200e6              // one row of skins in memory at most

const abortErr = () => new DOMException('cancelled', 'AbortError')
const hex = c => { const m = /^#?([0-9a-f]{6})$/i.exec(c || ''); const v = parseInt(m ? m[1] : '000000', 16); return [v >> 16, (v >> 8) & 255, v & 255] }
const tick = () => new Promise(r => setTimeout(r, 0))

function canvas(w, h) {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h)
  const c = document.createElement('canvas'); c.width = w; c.height = h; return c
}
const ctxOf = (c, read = true) => { const x = c.getContext('2d', { willReadFrequently: read, alpha: false }); x.imageSmoothingEnabled = true; x.imageSmoothingQuality = 'high'; return x }

async function mapLimit(items, limit, fn) {
  let next = 0
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) { const i = next++; await fn(items[i], i) }
  }))
}

// Works out the size of the export (also shown in the export sheet before exporting).
export function planExport(items, banner, { paid = false, hdK = 1 } = {}) {
  const n = items.length
  const { cols, rows } = gridOf(n)
  let c = Math.max(1, ...items.map(it => Math.round(cropOf(it).s)))
  c = Math.min(c, paid ? PAID_MAX_CELL : MAX_CELL)
  if (banner?.w) c = Math.max(c, Math.min(paid ? PAID_MAX_CELL : MAX_CELL, Math.floor(banner.w / cols)))
  c = Math.max(8, Math.min(c, Math.floor(Math.sqrt(MAX_BAND_BYTES / 4 / cols / (hdK * hdK)))))
  const W = cols * c
  const bannerH = banner?.w ? Math.round(banner.h * W / banner.w) : 0
  return { n, cols, rows, cell: c, W, H: bannerH + rows * c, bannerH }
}

// options: { bg, banner, look: null | 'dark' | 'classic', hd: { session, k, clock } | null,
//            onProgress(fraction, label), signal }
// → { blob, width, height, failed: [names], logos }
export async function exportCollage(items, { bg = '#000000', banner = null, look = null, hd = null, onProgress = () => {}, signal } = {}) {
  if (!items.length) throw new Error('empty')
  const check = () => { if (signal?.aborted) throw abortErr() }
  const plan = planExport(items, banner, { paid: !!look, hdK: hd?.k || 1 })
  const { cols, rows, cell: c, W, bannerH } = plan
  const k = hd ? Math.round(c * hd.k) / c : 1
  const co = Math.round(c * k), Wo = cols * co, bHo = Math.round(bannerH * k)
  const Ho = bHo + rows * co
  const [br, bgG, bb] = hex(bg)

  // 1. download every picture first (weak internet: retries happen here)
  const blobs = new Array(items.length), failed = []
  let got = 0
  onProgress(0, 'Getting your skins…')
  await mapLimit(items, 12, async (it, i) => {
    check()
    try { blobs[i] = await itemBlob(it, { signal, retries: 6 }) } catch (err) { if (err?.name === 'AbortError') throw err }
    onProgress(0.25 * (++got / items.length), `Getting your skins… ${got} / ${items.length}`)
  })
  // one more round for any that failed (the connection may be back)
  for (let i = 0; i < items.length; i++) {
    if (blobs[i]) continue
    check()
    try { blobs[i] = await itemBlob(items[i], { signal, retries: 3 }) } catch (err) { if (err?.name === 'AbortError') throw err; failed.push(items[i].name || `#${i + 1}`) }
  }

  // 2. the Ryuk effect (paid exports only)
  let fx = null
  if (look) {
    onProgress(0.26, 'Preparing the Ryuk effect…')
    const { createEffect } = await import('./effect.js')
    fx = await createEffect(items.map(it => it.key || null), look)
  }

  let png
  try { png = new PngWorkerWriter(Wo, Ho); await png.start() } catch { png = new PngWriter(Wo, Ho); await png.start() }
  const logosAll = []
  let rowsDone = 0
  const totalWork = rows + (bannerH ? 1 : 0)
  const step = label => onProgress(0.27 + 0.73 * (++rowsDone / totalWork), label)

  try {
    // 3. the profile banner
    if (bannerH) {
      check()
      const bmp = await decode(await blobGet(banner.blobId))
      if (!hd) {
        const stripH = Math.max(1, Math.min(bHo, Math.floor(8e6 / Wo)))
        const sc = canvas(Wo, stripH)
        for (let y = 0; y < bHo; y += stripH) {
          const h = Math.min(stripH, bHo - y)
          if (sc.height !== h) sc.height = h
          const x = ctxOf(sc)
          x.fillStyle = bg; x.fillRect(0, 0, Wo, h)
          x.drawImage(bmp, 0, -y, Wo, bHo)                  // same transform for every strip: no seams
          let data = x.getImageData(0, 0, Wo, h).data
          if (fx) data = await fx.pixels(data, Wo, h)
          await png.writeRows(data, h)
          check()
        }
      } else {
        // HD: strips of the banner at normal size, upscaled with some overlap
        const { upscalePiece } = await import('./hd.js')
        const S = 400, M = 16
        for (let y = 0; y < bannerH; y += S) {
          const y0 = Math.max(0, y - M), y1 = Math.min(bannerH, y + S + M)
          const sc = canvas(W, y1 - y0), x = ctxOf(sc)
          x.drawImage(bmp, 0, -y0, W, bannerH)
          let data = x.getImageData(0, 0, W, y1 - y0)
          if (fx) data = new ImageData(await fx.pixels(data.data, W, y1 - y0), W, y1 - y0)
          const src = document.createElement('canvas'); src.width = W; src.height = y1 - y0
          src.getContext('2d').putImageData(data, 0, 0)
          const up = await upscalePiece(hd.session, src, k, [], hd.clock)
          const oy0 = Math.round(y * k), oy1 = y + S >= bannerH ? bHo : Math.round((y + S) * k)
          const top = oy0 - Math.round(y0 * k)
          const rowsOut = up.getContext('2d', { willReadFrequently: true }).getImageData(0, top, Wo, oy1 - oy0).data
          await png.writeRows(rowsOut, oy1 - oy0)
          src.width = src.height = up.width = up.height = 1
          check()
        }
      }
      bmp.close?.()
      step('Profile banner done')
    }

    // the colour of empty cells (after the effect, so it matches)
    let fill = [br, bgG, bb]
    if (fx) { const px = await fx.pixels(new Uint8ClampedArray([br, bgG, bb, 255]), 1, 1); fill = [px[0], px[1], px[2]] }

    // 4. the skins, one row at a time. Each row's pictures are decoded at cell
    //    size in parallel (off the main thread), the next row while this one is written.
    const decodeRow = r => {
      const out = []
      for (let col = 0; col < cols; col++) {
        const i = r * cols + col
        if (i >= items.length) break
        out.push({ i, col, bmp: blobs[i] ? cellBitmap(blobs[i], items[i], c).catch(() => null) : Promise.resolve(null) })
      }
      return out
    }
    const fast = !fx && !hd && Wo <= 16384 && Wo * c <= 40e6
    const rowCanvas = fast ? canvas(Wo, c) : null
    const cellCanvas = canvas(c, c)
    let next = decodeRow(0)
    for (let r = 0; r < rows; r++) {
      check()
      const cellsInRow = next
      next = r + 1 < rows ? decodeRow(r + 1) : null
      for (const cell of cellsInRow) cell.bmp = await cell.bmp
      for (const cell of cellsInRow) if (!cell.bmp && blobs[cell.i]) failed.push(items[cell.i].name || `#${cell.i + 1}`)

      if (fast) {
        // no effect, no HD: draw the whole row and read it once
        const x = ctxOf(rowCanvas)
        x.fillStyle = bg; x.fillRect(0, 0, Wo, c)
        for (const { col, bmp } of cellsInRow) if (bmp) { x.drawImage(bmp, col * c, 0); bmp.close?.() }
        await png.writeRows(x.getImageData(0, 0, Wo, c).data, c)
        step(`Row ${r + 1} of ${rows}`)
        continue
      }

      const band = new Uint8ClampedArray(Wo * co * 4)
      for (let i = 0; i < band.length; i += 4) { band[i] = fill[0]; band[i + 1] = fill[1]; band[i + 2] = fill[2]; band[i + 3] = 255 }
      const drawn = []
      for (const { i, col, bmp } of cellsInRow) {
        if (!bmp) { drawn.push(null); continue }
        const x = ctxOf(cellCanvas)
        x.fillStyle = bg; x.fillRect(0, 0, c, c)
        x.drawImage(bmp, 0, 0)
        bmp.close?.()
        drawn.push({ i, col, data: x.getImageData(0, 0, c, c).data })
      }

      // effect (in parallel on the workers)
      await Promise.all(drawn.map(async d => {
        if (!d) return
        if (fx) { const out = await fx.cell(d.data, c, items[d.i].key || null); d.data = out.data; d.logos = out.logos } else d.logos = []
      }))

      for (const d of drawn) {
        if (!d) continue
        let px = d.data
        if (hd) {
          const { upscalePiece } = await import('./hd.js')
          const src = document.createElement('canvas'); src.width = src.height = c
          src.getContext('2d').putImageData(new ImageData(px, c, c), 0, 0)
          const up = await upscalePiece(hd.session, src, k, d.logos, hd.clock)
          px = up.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, co, co).data
          src.width = src.height = up.width = up.height = 1
        }
        for (const [lx, ly, lw, lh] of d.logos) logosAll.push([d.col * co + lx * k, bHo + r * co + ly * k, lw * k, lh * k])
        const x0 = d.col * co * 4
        for (let y = 0; y < co; y++) band.set(px.subarray(y * co * 4, (y + 1) * co * 4), y * Wo * 4 + x0)
      }
      await png.writeRows(band, co)
      step(`Row ${r + 1} of ${rows}`)
      await tick()
    }
  } finally {
    fx?.close()
  }

  const blob = await png.finish()
  return { blob, width: Wo, height: Ho, failed, logos: logosAll, cell: co }
}
