// The collage being edited. The order of `items` IS the order in the grid and
// in the exported picture (left to right, top to bottom).
//   item: { id, name, w, h, src? (library URL), blobId? (upload in IndexedDB),
//           crop: { x, y, s } | null (null = centred square), key? (library file), skin? }
import { create } from 'zustand'
import { kvGet, kvSet } from './db.js'
import { dropThumb } from './images.js'

export const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4)

const HISTORY = 60
const snap = s => ({ items: s.items, bg: s.bg, banner: s.banner })

export const useCollage = create((set, get) => ({
  loaded: false,
  items: [],
  bg: '#000000',
  banner: null,                 // Ryuk profile / banner picture on top: { blobId, w, h, name }
  name: '',                     // project name (when saved as a project)
  projectId: null,
  past: [],
  future: [],
  selected: null,               // id of the selected skin

  // every change goes through here (undo + autosave)
  commit(patch) {
    const s = get()
    set({ ...patch, past: [...s.past, snap(s)].slice(-HISTORY), future: [] })
    scheduleSave()
  },
  undo() {
    const s = get()
    if (!s.past.length) return
    const prev = s.past[s.past.length - 1]
    set({ ...prev, past: s.past.slice(0, -1), future: [snap(s), ...s.future].slice(0, HISTORY), selected: null })
    scheduleSave()
  },
  redo() {
    const s = get()
    if (!s.future.length) return
    const next = s.future[0]
    set({ ...next, future: s.future.slice(1), past: [...s.past, snap(s)].slice(-HISTORY), selected: null })
    scheduleSave()
  },

  add(newItems, { atStart = false } = {}) {
    if (!newItems.length) return
    const items = atStart ? [...newItems, ...get().items] : [...get().items, ...newItems]
    get().commit({ items })
  },
  remove(ids) {
    const drop = new Set([].concat(ids))
    get().commit({ items: get().items.filter(i => !drop.has(i.id)), selected: null })
  },
  swap(a, b) {
    const items = get().items.slice()
    const ia = items.findIndex(i => i.id === a), ib = items.findIndex(i => i.id === b)
    if (ia < 0 || ib < 0 || ia === ib) return
    ;[items[ia], items[ib]] = [items[ib], items[ia]]
    get().commit({ items })
  },
  move(id, to) {
    const items = get().items.slice()
    const from = items.findIndex(i => i.id === id)
    if (from < 0) return
    const [it] = items.splice(from, 1)
    items.splice(Math.max(0, Math.min(items.length, to)), 0, it)
    get().commit({ items })
  },
  setOrder(ids) {
    const byId = new Map(get().items.map(i => [i.id, i]))
    const items = ids.map(id => byId.get(id)).filter(Boolean)
    if (items.length === byId.size) get().commit({ items })
  },
  update(id, patch) {
    dropThumb(id)
    get().commit({ items: get().items.map(i => (i.id === id ? { ...i, ...patch } : i)) })
  },
  replaceItem(id, item) {
    dropThumb(id)
    get().commit({ items: get().items.map(i => (i.id === id ? { ...item, id } : i)) })
  },
  clear() { get().commit({ items: [], selected: null, banner: null, name: '', projectId: null }) },
  setBg(bg) { get().commit({ bg }) },
  setBanner(banner) { get().commit({ banner }) },
  select(id) { set({ selected: id }) },
  load(doc) {
    set({ items: doc.items || [], bg: doc.bg || '#000000', banner: doc.banner || null, name: doc.name || '', projectId: doc.projectId || null, past: [], future: [], selected: null })
    scheduleSave()
  },
}))

// ── autosave (IndexedDB) ─────────────────────────────────────────────────────
let saveTimer = null
function scheduleSave() {
  clearTimeout(saveTimer)
  saveTimer = setTimeout(saveNow, 600)
}
export async function saveNow() {
  const s = useCollage.getState()
  try {
    await kvSet('current', { items: s.items, bg: s.bg, banner: s.banner, name: s.name, projectId: s.projectId, savedAt: Date.now() })
  } catch (err) { console.warn('[autosave]', err?.message) }
}
window.addEventListener('pagehide', () => { clearTimeout(saveTimer); saveNow() })

export async function restoreCollage() {
  const doc = await kvGet('current')
  if (doc) useCollage.setState({ items: doc.items || [], bg: doc.bg || '#000000', banner: doc.banner || null, name: doc.name || '', projectId: doc.projectId || null })
  useCollage.setState({ loaded: true })
  return doc
}

// Grid of n squares: as close to a square picture as possible.
export function gridOf(n) {
  const cols = Math.max(1, Math.ceil(Math.sqrt(n)))
  return { cols, rows: Math.max(1, Math.ceil(n / cols)) }
}

// The square part of a picture that is used (centre square unless cropped).
export function cropOf(item, w = item.w, h = item.h) {
  if (item.crop) return item.crop
  const s = Math.min(w, h)
  return { x: (w - s) / 2, y: (h - s) / 2, s }
}
