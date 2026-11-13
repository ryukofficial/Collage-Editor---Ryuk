// Ryuk Creates service worker — keeps what the app needs on the phone.
//   app files (/assets): cache first (their names change with every update)
//   pages: network first, cached copy when offline
//   text reader, effect data, HD model, skin pictures, fonts: cache first
const VERSION = 'v2'
const APP = `app-${VERSION}`, DATA = 'data-v1', SKINS = 'skins-v1'

self.addEventListener('install', e => { self.skipWaiting() })
self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k.startsWith('app-') && k !== APP) await caches.delete(k)
    await self.clients.claim()
  })())
})

async function cacheFirst(req, name, { limit = 0 } = {}) {
  const cache = await caches.open(name)
  const hit = await cache.match(req, { ignoreVary: true })
  if (hit) return hit
  const res = await fetch(req)
  if (res.ok || res.type === 'opaque') {
    cache.put(req, res.clone()).then(() => limit && trim(cache, limit)).catch(() => {})
  }
  return res
}
async function trim(cache, limit) {
  const keys = await cache.keys()
  for (let i = 0; i < keys.length - limit; i++) await cache.delete(keys[i])
}
async function networkFirst(req, name) {
  const cache = await caches.open(name)
  try {
    const res = await fetch(req)
    if (res.ok) cache.put(req, res.clone()).catch(() => {})
    return res
  } catch {
    return (await cache.match(req)) || (await cache.match('/')) || Response.error()
  }
}

self.addEventListener('fetch', e => {
  const req = e.request
  if (req.method !== 'GET') return
  const url = new URL(req.url)
  if (url.origin === location.origin) {
    if (url.pathname.startsWith('/api/')) return
    if (req.mode === 'navigate') return e.respondWith(networkFirst(req, APP))
    if (url.pathname.startsWith('/assets/')) return e.respondWith(cacheFirst(req, APP))
    if (/^\/(ocr|fx|models)\//.test(url.pathname)) return e.respondWith(cacheFirst(req, DATA))
    if (url.pathname === '/skin-index.json') return e.respondWith(networkFirst(req, DATA))
    return
  }
  if (url.hostname === 'raw.githubusercontent.com' && /\/ryukofficial\/mlbb-assets/.test(url.pathname) && req.mode === 'cors') {
    return e.respondWith(cacheFirst(req, SKINS, { limit: 4000 }))
  }
  if (url.hostname === 'cdn.jsdelivr.net' && url.pathname.includes('onnxruntime-web')) return e.respondWith(cacheFirst(req, DATA))
  if (url.hostname === 'fonts.gstatic.com' || url.hostname === 'fonts.googleapis.com') return e.respondWith(cacheFirst(req, DATA))
})
