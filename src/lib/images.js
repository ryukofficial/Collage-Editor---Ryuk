// Loading pictures, reliably on weak internet.
//  • library skins come from GitHub's CDN; every download is retried with a
//    growing pause and its own time limit, and the service worker keeps a copy,
//    so the second time they load instantly (even offline)
//  • your uploads live in IndexedDB (never re-downloaded)
//  • small previews are made once and kept in memory for the editor
import { blobGet } from './db.js'

const inflight = new Map()
const sleep = ms => new Promise(r => setTimeout(r, ms))

export async function fetchBlob(url, { retries = 5, timeout = 25000, signal } = {}) {
  if (inflight.has(url)) return inflight.get(url)
  const p = (async () => {
    let lastErr
    for (let attempt = 0; attempt <= retries; attempt++) {
      if (signal?.aborted) throw new DOMException('cancelled', 'AbortError')
      const ctrl = new AbortController()
      const timer = setTimeout(() => ctrl.abort(), timeout)
      const stop = () => ctrl.abort()
      signal?.addEventListener('abort', stop, { once: true })
      try {
        const r = await fetch(url, { mode: 'cors', signal: ctrl.signal, cache: attempt ? 'reload' : 'default' })
        if (r.status === 404) throw Object.assign(new Error('not_found'), { permanent: true })
        if (!r.ok) throw new Error(`http_${r.status}`)
        const b = await r.blob()
        if (!b.size) throw new Error('empty')
        return b
      } catch (err) {
        lastErr = err
        if (err.permanent || signal?.aborted) break
        await sleep(Math.min(8000, 600 * 2 ** attempt))
      } finally {
        clearTimeout(timer)
        signal?.removeEventListener('abort', stop)
      }
    }
    throw lastErr || new Error('load_failed')
  })()
  inflight.set(url, p)
  p.finally(() => inflight.delete(url)).catch(() => {})
  return p
}

// The full picture of a collage item, as a Blob.
export async function itemBlob(item, opts) {
  if (item.blobId) {
    const b = await blobGet(item.blobId)
    if (!b) throw new Error('missing_upload')
    return b
  }
  return fetchBlob(item.src, opts)
}

export async function decode(blob, opts) {
  try { return await createImageBitmap(blob, opts) } catch {
    // some browsers can't resize while decoding, or can't decode this blob type
    const url = URL.createObjectURL(blob)
    try {
      const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('bad_image')); i.src = url })
      return await createImageBitmap(img)
    } finally { URL.revokeObjectURL(url) }
  }
}

export const itemBitmap = async (item, opts) => decode(await itemBlob(item, opts))

// ── previews for the editor ──────────────────────────────────────────────────
export const THUMB = 320
const thumbs = new Map()            // item id → ImageBitmap | Promise
const listeners = new Set()
export const onThumb = fn => { listeners.add(fn); return () => listeners.delete(fn) }

export function thumbOf(item) {
  const t = thumbs.get(item.id)
  return t instanceof Promise ? null : t || null
}

let running = 0
const waiting = []
function slot() { return running < 6 ? (running++, Promise.resolve()) : new Promise(r => waiting.push(r)) }
function free() { running--; const n = waiting.shift(); if (n) { running++; n() } }

export function loadThumb(item) {
  if (thumbs.has(item.id)) return
  const p = (async () => {
    await slot()
    try {
      const blob = await itemBlob(item)
      const full = await decode(blob)
      const side = Math.min(full.width, full.height)
      const c = item.crop || { x: (full.width - side) / 2, y: (full.height - side) / 2, s: side }
      const size = Math.min(THUMB, Math.round(c.s))
      const cv = new OffscreenCanvasOr(size, size)
      const ctx = cv.getContext('2d')
      ctx.imageSmoothingQuality = 'high'
      ctx.drawImage(full, c.x, c.y, c.s, c.s, 0, 0, size, size)
      full.close?.()
      const bmp = await createImageBitmap(cv)
      thumbs.set(item.id, bmp)
      listeners.forEach(fn => fn(item.id))
    } catch (err) {
      thumbs.set(item.id, { failed: true, error: err })
      setTimeout(() => { if (thumbs.get(item.id)?.failed) thumbs.delete(item.id) }, 15000)   // try again later
      listeners.forEach(fn => fn(item.id))
    } finally { free() }
  })()
  thumbs.set(item.id, p)
}

// call when an item's crop or picture changed
export function dropThumb(id) {
  const t = thumbs.get(id); t?.close?.(); thumbs.delete(id)
  const u = urls.get(id); if (typeof u === 'string') URL.revokeObjectURL(u); urls.delete(id)
}

// The preview as an <img> URL (for lists like Arrange)
const urls = new Map()
export function thumbUrl(item) {
  const u = urls.get(item.id)
  if (typeof u === 'string') return u
  if (u) return null
  const t = thumbOf(item)
  if (!t) { loadThumb(item); return null }
  if (t.failed) return null
  urls.set(item.id, true)
  const c = OffscreenCanvasOr(t.width, t.height)
  c.getContext('2d').drawImage(t, 0, 0)
  const done = b => { urls.set(item.id, URL.createObjectURL(b)); listeners.forEach(fn => fn(item.id)) }
  if (c.convertToBlob) c.convertToBlob({ type: 'image/jpeg', quality: 0.85 }).then(done).catch(() => urls.delete(item.id))
  else c.toBlob(b => (b ? done(b) : urls.delete(item.id)), 'image/jpeg', 0.85)
  return null
}

function OffscreenCanvasOr(w, h) {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h)
  const c = document.createElement('canvas'); c.width = w; c.height = h; return c
}

// Size of a picture blob without keeping it decoded
export async function measure(blob) {
  const b = await decode(blob)
  const out = { w: b.width, h: b.height }
  b.close?.()
  return out
}
