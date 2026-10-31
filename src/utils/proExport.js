// ─────────────────────────────────────────────────────────────────────────────
// "Export for editing" (₹50). The collage is made in the browser as usual, then
// sent to the server in small parts; the server makes the series tags bigger
// and preps the colours for the editing preset. The recipe stays on the server,
// so this only works through a paid export.
// ─────────────────────────────────────────────────────────────────────────────
import { proExportStart, proExportPiece, proExportFinish } from './wallet'

export const PRO_EXPORT_PRICE = 50
const MAX_PX = 900_000            // pixels per part (keeps every upload under 4 MB)
const PARALLEL = 3

// Splits the collage into parts that never cut through a skin cell.
function planParts(layout) {
  const { width: W, bannerH, cols, rows, cellSize: c, skins } = layout
  const parts = []
  if (bannerH > 0) {
    const h = Math.max(1, Math.floor(MAX_PX / W))
    for (let y = 0; y < bannerH; y += h) parts.push({ x: 0, y, w: W, h: Math.min(h, bannerH - y), cells: [] })
  }
  const cellsPerRowPart = Math.max(1, Math.min(cols, Math.floor(MAX_PX / (c * c))))
  const rowsPerPart = cellsPerRowPart === cols ? Math.max(1, Math.min(Math.floor(MAX_PX / (W * c)), Math.floor(100 / cols) || 1)) : 1
  for (let r = 0; r < rows; r += rowsPerPart) {
    const nr = Math.min(rowsPerPart, rows - r)
    for (let col = 0; col < cols; col += cellsPerRowPart) {
      const nc = Math.min(cellsPerRowPart, cols - col)
      const part = { x: col * c, y: bannerH + r * c, w: nc * c, h: nr * c, cells: [] }
      for (let rr = 0; rr < nr; rr++) for (let cc = 0; cc < nc; cc++) {
        const i = (r + rr) * cols + (col + cc)
        if (skins[i]) part.cells.push([cc * c, rr * c, c, skins[i]])
      }
      parts.push(part)
    }
  }
  return parts
}

// look: 'dark' or 'classic' (the two Ryuk effects the customer can choose)
export async function makeEditingExport(blob, { onProgress = () => {}, look = 'dark' } = {}) {
  const layout = blob.layout
  if (!layout) throw new Error('invalid_request')
  const parts = planParts(layout)
  const bmp = await createImageBitmap(blob)
  // a small preview of the skins (not the profile banner): the server measures it
  // once so every part of this collage gets exactly the same colour correction
  const gridH = layout.height - layout.bannerH
  const ps = Math.min(1, 640 / Math.max(layout.width, gridH))
  const pc = document.createElement('canvas'); pc.width = Math.max(1, Math.round(layout.width * ps)); pc.height = Math.max(1, Math.round(gridH * ps))
  const pctx = pc.getContext('2d', { alpha: false }); pctx.imageSmoothingQuality = 'high'
  pctx.drawImage(bmp, 0, layout.bannerH, layout.width, gridH, 0, 0, pc.width, pc.height)
  const preview = await new Promise(r => pc.toBlob(r, 'image/jpeg', 0.95))
  pc.width = pc.height = 1
  const exportId = await proExportStart(parts.length)       // ₹50 is taken here
  const out = document.createElement('canvas')
  out.width = layout.width; out.height = layout.height
  const octx = out.getContext('2d', { alpha: false })
  let done = 0, next = 0, failed = null
  const allLogos = []

  async function worker() {
    while (next < parts.length && !failed) {
      const p = parts[next++]
      try {
        const cv = document.createElement('canvas'); cv.width = p.w; cv.height = p.h
        cv.getContext('2d', { alpha: false }).drawImage(bmp, p.x, p.y, p.w, p.h, 0, 0, p.w, p.h)
        // high-quality JPEG instead of PNG: looks the same, about 8× less data to send
        const part = await new Promise(r => cv.toBlob(r, 'image/jpeg', 0.95))
        cv.width = cv.height = 1
        const { blob: res, logos } = await proExportPiece(exportId, preview, part, p.cells, look)
        for (const [lx, ly, lw, lh] of logos) allLogos.push([p.x + lx, p.y + ly, lw, lh])
        const back = await createImageBitmap(res)
        octx.drawImage(back, p.x, p.y); back.close?.()
      } catch (err) {
        failed = err
      } finally {
        done++; onProgress(done / parts.length)
      }
    }
  }
  try {
    await Promise.all(Array.from({ length: Math.min(PARALLEL, parts.length) }, worker))
  } finally {
    bmp.close?.()
  }
  // refunds automatically only when nothing at all could be made
  const fin = await proExportFinish(exportId, !!failed).catch(() => null)
  if (failed) { out.width = out.height = 1; const e = failed; e.refunded = !!fin?.refunded; throw e }
  const result = await new Promise(r => out.toBlob(r, 'image/png'))
  out.width = out.height = 1
  if (!result) throw new Error('server_error')
  result.logos = allLogos              // where the logos are (kept crisp by HD upscale)
  result.layout = layout
  return result
}
