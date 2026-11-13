// The Ryuk effect engine for an export: downloads only what this collage needs
// (the effect data once, plus the clean logos of its skins), then runs on a few
// Web Workers so it is fast and the page stays responsive.
import { logosNeeded } from './ryukFx.js'

let libPromise = null
function loadLibrary() {
  if (!libPromise) {
    libPromise = fetch('/fx/library.json').then(r => {
      if (!r.ok) throw new Error('effect_data')
      return r.json()
    }).catch(err => { libPromise = null; throw err })
  }
  return libPromise
}

const logoCache = new Map()
async function loadLogo(id) {
  if (!logoCache.has(id)) {
    const p = (async () => {
      let lastErr
      for (let i = 0; i < 4; i++) {
        try {
          const r = await fetch(`/fx/logos/${encodeURIComponent(id)}.webp`)
          if (!r.ok) throw new Error('effect_data')
          const bmp = await createImageBitmap(await r.blob(), { premultiplyAlpha: 'none', colorSpaceConversion: 'none' })
          const c = new OffscreenCanvas(bmp.width, bmp.height)
          const ctx = c.getContext('2d')
          ctx.drawImage(bmp, 0, 0)
          const { data } = ctx.getImageData(0, 0, bmp.width, bmp.height)
          bmp.close?.()
          return { data, w: c.width, h: c.height }
        } catch (err) { lastErr = err; await new Promise(r => setTimeout(r, 700 * (i + 1))) }
      }
      throw lastErr
    })()
    logoCache.set(id, p)
    p.catch(() => logoCache.delete(id))
  }
  return logoCache.get(id)
}

// Downloads what the effect needs ahead of time (when the export sheet opens).
export function prefetchEffect() { loadLibrary().catch(() => {}) }

// keys: library file names of the collage's skins (null for uploads)
export async function createEffect(keys, look) {
  const lib = await loadLibrary()
  const logos = {}
  await Promise.all(logosNeeded(lib, keys).map(async id => { logos[id] = await loadLogo(id) }))
  const n = Math.max(1, Math.min(4, (navigator.hardwareConcurrency || 4) - 1))
  const workers = Array.from({ length: n }, () => new Worker(new URL('./fxWorker.js', import.meta.url), { type: 'module' }))
  await Promise.all(workers.map(w => new Promise((resolve, reject) => {
    w.onmessage = e => (e.data.type === 'ready' ? resolve() : null)
    w.onerror = e => reject(new Error(e.message || 'effect_failed'))
    w.postMessage({ type: 'init', lib, logos })
  })))

  const idle = [...workers], queue = []
  let seq = 0
  const pump = () => {
    while (idle.length && queue.length) {
      const w = idle.pop(), job = queue.shift()
      w.onmessage = e => {
        idle.push(w)
        if (e.data.type === 'error') job.reject(new Error(e.data.message))
        else job.resolve({ data: new Uint8ClampedArray(e.data.buf), logos: e.data.logos })
        pump()
      }
      w.onerror = e => { job.reject(new Error(e.message || 'effect_failed')) }
      w.postMessage({ type: 'band', id: ++seq, buf: job.data.buffer, W: job.W, H: job.H, cells: job.cells, look }, [job.data.buffer])
    }
  }
  const run = (data, W, H, cells) => new Promise((resolve, reject) => { queue.push({ data, W, H, cells, resolve, reject }); pump() })

  return {
    // one skin cell (n × n RGBA); returns the new pixels and the logo areas
    cell: (data, n, key) => run(data, n, n, [[0, 0, n, key]]),
    // colour only (the profile banner, empty cells)
    pixels: (data, W, H) => run(data, W, H, []).then(r => r.data),
    close: () => workers.forEach(w => w.terminate()),
  }
}
