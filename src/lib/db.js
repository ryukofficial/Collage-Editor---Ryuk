// Tiny IndexedDB helper. Pictures you upload and your projects live here
// (localStorage holds only ~5 MB and made big collages fail to save).
//   blobs – uploaded pictures, by id
//   kv    – everything else (current collage, projects, history), by name
const DB_NAME = 'ryuk-creates'
const VERSION = 1
let dbPromise = null

function open() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, VERSION)
      req.onupgradeneeded = () => {
        const db = req.result
        if (!db.objectStoreNames.contains('blobs')) db.createObjectStore('blobs')
        if (!db.objectStoreNames.contains('kv')) db.createObjectStore('kv')
      }
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error)
      req.onblocked = () => reject(new Error('storage_blocked'))
    }).catch(err => { dbPromise = null; throw err })
  }
  return dbPromise
}

async function run(store, mode, fn) {
  const db = await open()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, mode)
    const req = fn(tx.objectStore(store))
    tx.oncomplete = () => resolve(req?.result)
    tx.onerror = () => reject(tx.error)
    tx.onabort = () => reject(tx.error || new Error('storage_aborted'))
  })
}

export const kvGet = key => run('kv', 'readonly', s => s.get(key)).catch(() => undefined)
export const kvSet = (key, value) => run('kv', 'readwrite', s => s.put(value, key))
export const kvDel = key => run('kv', 'readwrite', s => s.delete(key))

export const blobGet = id => run('blobs', 'readonly', s => s.get(id)).catch(() => undefined)
export const blobSet = (id, blob) => run('blobs', 'readwrite', s => s.put(blob, id))
export const blobDel = id => run('blobs', 'readwrite', s => s.delete(id))
export const blobKeys = () => run('blobs', 'readonly', s => s.getAllKeys()).catch(() => [])

// Asks the browser not to clear our storage when the phone is low on space.
export function persistStorage() {
  try { navigator.storage?.persist?.() } catch { /* not supported */ }
}
