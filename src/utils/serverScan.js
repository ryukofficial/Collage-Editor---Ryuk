// ─────────────────────────────────────────────────────────────────────────────
// Paid Auto Collage scan: the screenshots are read on the server.
//
//   1. /api/scan-start   takes ₹10 and opens a scan for N screenshots
//   2. /api/scan-page    reads one screenshot (only for that paid scan)
//   3. /api/scan-finish  closes it; refunds the ₹10 if no skin was found at all
//
// Returns the same shape as scanScreenshots() in skinScanner.js, so the Auto
// Collage screen works the same either way.
// ─────────────────────────────────────────────────────────────────────────────
import { sortByPosition } from './skinScanner'
import { startScan, scanPage, finishScan, walletError } from './wallet'

const MAX_UPLOAD = 3.8 * 1024 * 1024         // the server accepts up to 4 MB per screenshot
const PARALLEL = 3                           // screenshots read at the same time

const abortError = () => new DOMException('Scan cancelled', 'AbortError')

// Returns { blob, width } ready to upload: the original file when it's small
// enough, otherwise a re-encoded copy (full-colour JPEG, so no quality is lost
// that matters for reading text). `width` is the original width (for boxes).
async function uploadable(file) {
  if (/^image\/(png|jpe?g|webp)$/i.test(file.type) && file.size <= MAX_UPLOAD) return { blob: file, width: null }
  const bmp = await createImageBitmap(file)
  try {
    let scale = Math.min(1, 3000 / Math.max(bmp.width, bmp.height))
    for (let attempt = 0; attempt < 5; attempt++) {
      const canvas = document.createElement('canvas')
      canvas.width = Math.round(bmp.width * scale)
      canvas.height = Math.round(bmp.height * scale)
      canvas.getContext('2d').drawImage(bmp, 0, 0, canvas.width, canvas.height)
      const blob = await new Promise(r => canvas.toBlob(r, 'image/jpeg', 1))
      canvas.width = canvas.height = 1
      if (blob && blob.size <= MAX_UPLOAD) return { blob, width: bmp.width }
      scale *= 0.8
    }
    throw Object.assign(new Error('too_large'), { code: 'too_large' })
  } finally {
    bmp.close?.()
  }
}

export async function scanScreenshotsOnServer(files, vocab, options = {}) {
  const { onProgress = () => {}, signal } = options
  const total = files.length
  let done = 0
  const progress = (message) => onProgress({ page: done, total, percent: Math.round(5 + 90 * done / total), message })

  progress('Starting your scan (₹10)…')
  const scanId = await startScan(total)
  if (signal?.aborted) { await finishScan(scanId).catch(() => {}); throw abortError() }

  const results = new Array(total).fill(null)
  const errors = new Array(total).fill(null)
  let next = 0
  progress(`Uploading and reading ${total} screenshot${total === 1 ? '' : 's'}…`)

  async function worker() {
    while (next < total) {
      const i = next++
      if (signal?.aborted) return
      try {
        const { blob, width } = await uploadable(files[i])
        const out = await scanPage(scanId, blob, signal)
        // boxes come back in the uploaded image's pixels: map them to the original
        const f = width && out.width ? width / out.width : 1
        if (f !== 1) {
          for (const m of [...out.matches, ...out.possible, ...out.ambiguous]) {
            if (m.box) m.box = { x0: m.box.x0 * f, y0: m.box.y0 * f, x1: m.box.x1 * f, y1: m.box.y1 * f }
            if (m.h) m.h *= f
          }
        }
        results[i] = out
      } catch (err) {
        if (err?.name === 'AbortError' || signal?.aborted) return
        errors[i] = err
      } finally {
        done++
        progress(`Read ${done} of ${total} screenshot${total === 1 ? '' : 's'}…`)
      }
    }
  }

  let finish = null
  try {
    await Promise.all(Array.from({ length: Math.min(PARALLEL, total) }, worker))
  } finally {
    finish = await finishScan(scanId).catch(() => null)     // refund happens here when nothing was found
  }
  if (signal?.aborted) throw abortError()

  // ── put the results together, like the on-device scanner does ──
  onProgress({ page: total, total, percent: 97, message: 'Matching names…' })
  const skipped = [], shots = [], lines = []
  let words = 0
  const sure = new Map(), maybe = new Map(), shared = new Map()
  let pageNo = 0
  results.forEach((r, i) => {
    const name = files[i].name || `image ${i + 1}`
    if (!r) {
      skipped.push(name)
      shots.push({ file: i, failed: true, sure: [], maybe: [] })
      lines.push(`Screenshot ${i + 1}: not read — ${walletError(errors[i])}`)
      return
    }
    const page = pageNo++
    const slim = m => ({ key: m.key, heroName: m.heroName, skinName: m.skinName, box: m.box })
    shots.push({
      file: i,
      sure: sortByPosition(r.matches).map(slim),
      maybe: [...r.possible.map(slim), ...r.ambiguous.map(a => ({ key: `?${a.name}`, heroName: '?', skinName: a.name, box: a.box }))],
    })
    // the same skin on several screenshots counts once (first place it was seen)
    for (const m of r.matches) if (!sure.has(m.key)) sure.set(m.key, { ...m, page })
    for (const m of r.possible) if (!maybe.has(m.key)) maybe.set(m.key, { ...m, page })
    for (const a of r.ambiguous) if (!shared.has(a.name)) shared.set(a.name, { ...a, page })
    lines.push(`Screenshot ${i + 1}: ${r.width}×${r.height} → ${r.matches.length} sure, ${r.possible.length} maybe`)
    for (const st of r.stats || []) {
      words += st.count
      lines.push(`  ${st.variant}: ${st.count} words in ${Number(st.seconds).toFixed(1)}s (size ×${Number(st.scale).toFixed(2)})`)
    }
  })
  const result = {
    matches: sortByPosition([...sure.values()]),
    possible: sortByPosition([...maybe.values()].filter(m => !sure.has(m.key))),
    ambiguous: [...shared.values()].filter(a => !a.options.some(o => sure.has(`${o.heroId}__${o.skinName}`))),
  }
  const refunded = !!finish?.refunded
  const report = [
    'Skin scan report (server)',
    `Result: ${result.matches.length} sure, ${result.possible.length} maybe, ${result.ambiguous.length} shared-name from ${pageNo} screenshot${pageNo === 1 ? '' : 's'}`,
    refunded ? 'Nothing was found, so the ₹10 was refunded to the wallet.' : 'Charged ₹10.',
    '',
    ...lines,
  ].join('\n')
  onProgress({ page: total, total, percent: 100, message: 'Done' })
  return { ...result, skipped, report, info: { words, engine: 'server', refunded }, shots }
}
