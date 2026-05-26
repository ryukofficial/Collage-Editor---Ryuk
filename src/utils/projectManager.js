// ── projectManager.js ─────────────────────────────────────────
// Handles auto-save (session restore) and named project saves.
// All data lives in localStorage under two keys:
//   ryuk_autosave        → latest canvas snapshot (auto, silent)
//   ryuk_projects        → array of named saved projects

const AUTO_KEY     = 'ryuk_autosave'
const PROJECTS_KEY = 'ryuk_projects'
const MAX_PROJECTS = 20          // cap so localStorage doesn't balloon

// ── Helpers ───────────────────────────────────────────────────
function readJSON(key, fallback) {
  try {
    const raw = localStorage.getItem(key)
    return raw ? JSON.parse(raw) : fallback
  } catch {
    return fallback
  }
}

function writeJSON(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
    return true
  } catch (e) {
    console.warn('[projectManager] localStorage write failed:', e)
    return false
  }
}

// ── Thumbnail generator ───────────────────────────────────────
// Draws all images onto a tiny canvas and returns a jpeg data URL.
// Falls back to null on any error.
export async function generateThumbnail(images, backgroundColor = '#0e0e1a') {
  try {
    if (!images.length) return null
    const TW = 200, TH = 130
    const canvas = document.createElement('canvas')
    canvas.width  = TW
    canvas.height = TH
    const ctx = canvas.getContext('2d')
    ctx.fillStyle = backgroundColor
    ctx.fillRect(0, 0, TW, TH)

    // find bounding box of all images
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
    for (const img of images) {
      const w = img.naturalWidth  * (img.scaleX ?? 1)
      const h = img.naturalHeight * (img.scaleY ?? 1)
      minX = Math.min(minX, img.x)
      minY = Math.min(minY, img.y)
      maxX = Math.max(maxX, img.x + w)
      maxY = Math.max(maxY, img.y + h)
    }
    const bw = maxX - minX || 1
    const bh = maxY - minY || 1
    const scale = Math.min(TW / bw, TH / bh) * 0.92
    const offX  = (TW - bw * scale) / 2 - minX * scale
    const offY  = (TH - bh * scale) / 2 - minY * scale

    await Promise.all(
      images.map(img => new Promise(resolve => {
        const el       = new Image()
        el.crossOrigin = 'anonymous'
        el.onload = () => {
          const w = img.naturalWidth  * (img.scaleX ?? 1) * scale
          const h = img.naturalHeight * (img.scaleY ?? 1) * scale
          ctx.save()
          ctx.globalAlpha = img.opacity ?? 1
          ctx.drawImage(el, img.x * scale + offX, img.y * scale + offY, w, h)
          ctx.restore()
          resolve()
        }
        el.onerror = resolve
        el.src = img.src
      }))
    )
    return canvas.toDataURL('image/jpeg', 0.55)
  } catch {
    return null
  }
}

// ── Auto-save (session restore) ───────────────────────────────
// Call this whenever images/backgroundColor changes.
export function autoSave(snapshot) {
  // snapshot = { images, backgroundColor, canvasSize, stageScale, stagePos }
  writeJSON(AUTO_KEY, { ...snapshot, savedAt: Date.now() })
}

export function loadAutoSave() {
  return readJSON(AUTO_KEY, null)
}

export function clearAutoSave() {
  try { localStorage.removeItem(AUTO_KEY) } catch {}
}

// ── Named projects ────────────────────────────────────────────
export function loadProjects() {
  return readJSON(PROJECTS_KEY, [])
}

// Save or overwrite a named project.
// Returns the saved project object, or null on failure.
export async function saveProject(name, snapshot) {
  const projects = loadProjects()
  const existing = projects.findIndex(p => p.name === name)
  const thumbnail = await generateThumbnail(snapshot.images, snapshot.backgroundColor)

  const project = {
    id:          existing >= 0 ? projects[existing].id : `proj_${Date.now()}`,
    name:        name.trim(),
    savedAt:     Date.now(),
    thumbnail,
    imageCount:  snapshot.images.length,
    snapshot,
  }

  if (existing >= 0) {
    projects[existing] = project
  } else {
    projects.unshift(project)
    if (projects.length > MAX_PROJECTS) projects.splice(MAX_PROJECTS)
  }

  const ok = writeJSON(PROJECTS_KEY, projects)
  return ok ? project : null
}

export function deleteProject(id) {
  const projects = loadProjects().filter(p => p.id !== id)
  writeJSON(PROJECTS_KEY, projects)
}

export function renameProject(id, newName) {
  const projects = loadProjects()
  const p = projects.find(p => p.id === id)
  if (p) { p.name = newName.trim(); p.savedAt = Date.now() }
  writeJSON(PROJECTS_KEY, projects)
}
