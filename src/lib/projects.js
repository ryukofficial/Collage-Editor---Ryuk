// Saved projects, recent versions (automatic) and export history — all in
// IndexedDB. Pictures you uploaded are stored once and shared between them.
import { kvGet, kvSet, blobSet, blobKeys, blobDel } from './db.js'
import { useCollage, uid, gridOf, cropOf, restoreCollage } from './store.js'
import { thumbOf } from './images.js'
import { libraryFile } from './skins.js'

const MAX_RECENT = 12, MAX_EXPORTS = 40

export const docOf = s => ({ items: s.items, bg: s.bg, banner: s.banner })

// small JPEG of the collage for the lists (made from the editor's previews)
export async function makeThumb(items, bg = '#000') {
  if (!items.length) return null
  const { cols, rows } = gridOf(items.length)
  const cell = Math.max(4, Math.floor(240 / cols))
  const c = document.createElement('canvas')
  c.width = cols * cell; c.height = rows * cell
  const x = c.getContext('2d')
  x.fillStyle = bg; x.fillRect(0, 0, c.width, c.height)
  items.forEach((it, i) => {
    const t = thumbOf(it)
    if (t && !t.failed) x.drawImage(t, (i % cols) * cell, Math.floor(i / cols) * cell, cell, cell)
    else { x.fillStyle = '#1a1a23'; x.fillRect((i % cols) * cell + 1, Math.floor(i / cols) * cell + 1, cell - 2, cell - 2) }
  })
  return c.toDataURL('image/jpeg', 0.7)
}

// ── projects ─────────────────────────────────────────────────────────────────
export const listProjects = async () => (await kvGet('projects')) || []

export async function saveProject(name) {
  const s = useCollage.getState()
  const list = await listProjects()
  const id = s.projectId && list.some(p => p.id === s.projectId) ? s.projectId : uid()
  const entry = { id, name: name.trim() || 'Untitled', savedAt: Date.now(), count: s.items.length, thumb: await makeThumb(s.items, s.bg), doc: docOf(s) }
  const next = [entry, ...list.filter(p => p.id !== id)]
  await kvSet('projects', next)
  useCollage.setState({ projectId: id, name: entry.name })
  return entry
}
export async function deleteProject(id) { await kvSet('projects', (await listProjects()).filter(p => p.id !== id)) }
export async function renameProject(id, name) {
  await kvSet('projects', (await listProjects()).map(p => (p.id === id ? { ...p, name } : p)))
}

// ── recent versions (saved by themselves while you work) ─────────────────────
export const listRecent = async () => (await kvGet('recent')) || []
export async function rememberVersion() {
  const s = useCollage.getState()
  if (!s.items.length) return
  const list = await listRecent()
  const sig = s.items.map(i => i.id).join(',') + s.bg
  if (list[0]?.sig === sig) return
  const entry = { id: uid(), sig, savedAt: Date.now(), count: s.items.length, thumb: await makeThumb(s.items, s.bg), doc: docOf(s) }
  await kvSet('recent', [entry, ...list].slice(0, MAX_RECENT))
}

// ── export history ───────────────────────────────────────────────────────────
export const listExports = async () => (await kvGet('exports')) || []
export async function addExport(entry) {
  await kvSet('exports', [{ id: uid(), at: Date.now(), ...entry }, ...(await listExports())].slice(0, MAX_EXPORTS))
}
export async function deleteExport(id) { await kvSet('exports', (await listExports()).filter(e => e.id !== id)) }
export async function clearExports() { await kvSet('exports', []) }

// Uploads nobody uses any more (not in the collage, a project or a recent version)
export async function cleanUnusedUploads() {
  try {
    const used = new Set()
    const take = doc => { for (const i of doc?.items || []) if (i.blobId) used.add(i.blobId); if (doc?.banner?.blobId) used.add(doc.banner.blobId) }
    take(useCollage.getState())
    for (const p of await listProjects()) take(p.doc)
    for (const r of await listRecent()) take(r.doc)
    for (const k of await blobKeys()) if (!used.has(k)) await blobDel(k)
  } catch { /* not important */ }
}

// ── moving data from the old version of the website (localStorage) ──────────
function dataUrlToBlob(u) {
  const [head, body] = u.split(',')
  const mime = /data:([^;]+)/.exec(head)?.[1] || 'image/png'
  const bin = atob(body)
  const a = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) a[i] = bin.charCodeAt(i)
  return new Blob([a], { type: mime })
}

async function convertImages(images = []) {
  const out = []
  for (const img of [...images].sort((a, b) => (a.zIndex ?? 0) - (b.zIndex ?? 0))) {
    const w = img.naturalWidth || img.width, h = img.naturalHeight || img.height
    if (!w || !h || !img.src) continue
    const item = { id: uid(), name: img.name || 'Picture', w, h, crop: null }
    if (img.cropW && img.cropH) {
      const s = Math.min(img.cropW, img.cropH)
      item.crop = { x: (img.cropX || 0) + (img.cropW - s) / 2, y: (img.cropY || 0) + (img.cropH - s) / 2, s }
    }
    if (img.src.startsWith('data:')) {
      item.blobId = uid()
      await blobSet(item.blobId, dataUrlToBlob(img.src))
    } else if (img.src.startsWith('http')) {
      item.src = img.src
      item.key = libraryFile(img.src)
    } else continue                     // blob: links from an old session can't be opened any more
    out.push(item)
  }
  return out
}

export async function migrateOldData() {
  if (await kvGet('migrated')) return
  try {
    const read = k => { try { return JSON.parse(localStorage.getItem(k) || 'null') } catch { return null } }
    const canvas = read('ryuk_canvas_state') || read('ryuk_autosave')
    if (canvas?.images?.length && !(await kvGet('current'))) {
      await kvSet('current', { items: await convertImages(canvas.images), bg: canvas.backgroundColor || '#000000', banner: null, savedAt: Date.now() })
    }
    const projects = read('ryuk_projects') || []
    const conv = []
    for (const p of projects) {
      const items = await convertImages(p.snapshot?.images)
      if (items.length) conv.push({ id: p.id || uid(), name: p.name || 'Project', savedAt: p.savedAt || Date.now(), count: items.length, thumb: p.thumbnail || null, doc: { items, bg: p.snapshot?.backgroundColor || '#000000', banner: null } })
    }
    if (conv.length) await kvSet('projects', [...(await listProjects()), ...conv])
    const exp = read('ryuk_export_history') || []
    if (exp.length) await kvSet('exports', exp.map(e => ({ id: e.id || uid(), at: e.timestamp || Date.now(), name: e.filename, count: e.imageCount, thumb: e.thumbnail || null })))
    await kvSet('migrated', Date.now())
    // free the old storage only after everything was copied
    for (const k of ['ryuk_canvas_state', 'ryuk_autosave', 'ryuk_autosave_history', 'ryuk_projects', 'ryuk_export_history']) localStorage.removeItem(k)
  } catch (err) {
    console.warn('[migrate]', err?.message)
  }
}

export async function startStorage() {
  await migrateOldData()
  return restoreCollage()
}

export { cropOf }
