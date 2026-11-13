// Runs the Ryuk effect off the main thread, one skin (or one strip) at a time.
import { processBand } from './ryukFx.js'

let lib = null

self.onmessage = ({ data: m }) => {
  if (m.type === 'init') {
    lib = { maskSize: m.lib.maskSize, masks: m.lib.masks, places: m.lib.places, p3: new Set(m.lib.p3), logos: new Map(Object.entries(m.logos)) }
    self.postMessage({ type: 'ready' })
    return
  }
  if (m.type === 'band') {
    try {
      const d = new Uint8ClampedArray(m.buf)
      const logos = processBand(d, m.W, m.H, m.cells, lib, m.look)
      self.postMessage({ type: 'done', id: m.id, buf: d.buffer, logos }, [d.buffer])
    } catch (err) {
      self.postMessage({ type: 'error', id: m.id, message: String(err?.message || err) })
    }
  }
}
