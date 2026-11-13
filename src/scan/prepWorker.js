// Prepares screenshots off the main thread, so the page never freezes.
import { prepareShot } from './prepare.js'

self.onmessage = async ({ data: m }) => {
  try {
    const bmp = await createImageBitmap(m.file)
    const out = prepareShot(bmp, m.zoom, (w, h) => new OffscreenCanvas(w, h))
    bmp.close?.()
    self.postMessage({ id: m.id, ok: true, out }, out.images.map(a => a.buffer))
  } catch (err) {
    self.postMessage({ id: m.id, ok: false, error: String(err?.message || err) })
  }
}
