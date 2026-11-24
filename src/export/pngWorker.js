// Writes the PNG off the main thread: the page keeps drawing the next row of
// skins while this worker filters and compresses the previous one.
import { PngWriter } from './png.js'

let png = null
self.onmessage = async ({ data: m }) => {
  try {
    if (m.type === 'start') { png = new PngWriter(m.w, m.h); await png.start(); self.postMessage({ id: m.id }) }
    else if (m.type === 'rows') { await png.writeRows(new Uint8ClampedArray(m.buf), m.rows); self.postMessage({ id: m.id }) }
    else if (m.type === 'finish') { const blob = await png.finish(); png = null; self.postMessage({ id: m.id, blob }) }
  } catch (err) {
    self.postMessage({ id: m.id, error: String(err?.message || err) })
  }
}
