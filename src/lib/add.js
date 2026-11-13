// Turning uploads and library skins into collage items.
import { blobSet } from './db.js'
import { fetchBlob, measure } from './images.js'
import { findSkinPicture, SKIN_BY_ID } from './skins.js'
import { uid, useCollage } from './store.js'

async function mapLimit(items, limit, fn) {
  const out = new Array(items.length)
  let next = 0
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) { const i = next++; out[i] = await fn(items[i], i) }
  }))
  return out
}

// Your own pictures → stored on the phone (IndexedDB), added to the collage.
export async function uploadsToItems(files, onProgress = () => {}) {
  let done = 0
  const list = await mapLimit([...files].filter(f => /^image\//.test(f.type) || /\.(png|jpe?g|webp|gif|bmp|heic|avif)$/i.test(f.name)), 3, async f => {
    try {
      const { w, h } = await measure(f)
      const blobId = uid()
      await blobSet(blobId, f)
      return { id: uid(), name: f.name.replace(/\.[^.]+$/, ''), w, h, blobId, crop: null }
    } catch { return null } finally { onProgress(++done) }
  })
  return list.filter(Boolean)
}

// Library skins (ids "heroId__Skin Name") → items. Downloads each picture once
// (it is needed for the export anyway, and the service worker keeps it).
export async function skinsToItems(ids, onProgress = () => {}) {
  let done = 0
  const failed = []
  const list = await mapLimit(ids, 6, async id => {
    const s = SKIN_BY_ID.get(id)
    try {
      const pic = await findSkinPicture(id)
      if (!pic) throw new Error('no_picture')
      const { w, h } = await measure(await fetchBlob(pic.url))
      return { id: uid(), name: s ? `${s.heroName} — ${s.skinName}` : id, w, h, src: pic.url, key: pic.file, skin: id, crop: null }
    } catch {
      failed.push(s ? `${s.heroName} — ${s.skinName}` : id)
      return null
    } finally { onProgress(++done) }
  })
  return { items: list.filter(Boolean), failed }
}

export async function addUploads(files, onProgress) {
  const items = await uploadsToItems(files, onProgress)
  useCollage.getState().add(items)
  return items
}
