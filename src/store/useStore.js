import { create } from 'zustand'
import { subscribeWithSelector } from 'zustand/middleware'
import { nanoid } from './nanoid'

const DEFAULT_CANVAS = { width: 3840, height: 2160 }


// ── Grid layout (matches the export exactly) ──────────────────────────────────
// Export PNG always draws the skins as a square-celled grid: ceil(√n) columns,
// in zIndex order, each image centre-cropped to a square. The canvas preview
// uses the same rule, so what you see is what you export.
const GRID_W = 3840
const byZ = (a, b) => (a.zIndex ?? 0) - (b.zIndex ?? 0)

function squareCrop(img) {
  const nw = img.naturalWidth || img.width || 1
  const nh = img.naturalHeight || img.height || 1
  // keep a crop that is already square (from Auto Collage, Hero Picker or the crop tool)
  if (img.cropW && img.cropH && Math.abs(img.cropW - img.cropH) <= 1) {
    return { cropX: img.cropX ?? 0, cropY: img.cropY ?? 0, cropW: img.cropW, cropH: img.cropW }
  }
  // otherwise: the centred square of the crop (or of the whole picture)
  const x0 = img.cropW ? img.cropX ?? 0 : 0, y0 = img.cropH ? img.cropY ?? 0 : 0
  const w = img.cropW || nw, h = img.cropH || nh
  const side = Math.min(w, h)
  return { cropX: x0 + (w - side) / 2, cropY: y0 + (h - side) / 2, cropW: side, cropH: side }
}

export function gridLayout(images) {
  const sorted = [...images].sort(byZ)
  const n = sorted.length
  if (!n) return { images: [], canvasSize: { ...DEFAULT_CANVAS } }
  const cols = Math.ceil(Math.sqrt(n))
  const rows = Math.ceil(n / cols)
  const cell = Math.floor(GRID_W / cols)
  const laid = sorted.map((img, i) => {
    const crop = squareCrop(img)
    const scale = cell / crop.cropW
    return {
      ...img, ...crop, zIndex: i,
      x: (i % cols) * cell, y: Math.floor(i / cols) * cell,
      scaleX: scale, scaleY: scale, rotation: 0,
    }
  })
  return { images: laid, canvasSize: { width: cols * cell, height: rows * cell } }
}

const LS_CANVAS_KEY   = 'ryuk_canvas_state'
const LS_HISTORY_KEY  = 'ryuk_export_history'
const LS_PROFILE_KEY  = 'ryuk_profile'
const LS_BG_KEY       = 'ryuk_bg'

function loadCanvasState() {
  try {
    const raw = localStorage.getItem(LS_CANVAS_KEY)
    return raw ? JSON.parse(raw) : null
  } catch { return null }
}

function saveCanvasState(images, canvasSize, backgroundColor, backgroundTransparent) {
  try {
    localStorage.setItem(LS_CANVAS_KEY, JSON.stringify({
      images,
      canvasSize,
      backgroundColor,
      backgroundTransparent,
    }))
  } catch (e) {
    console.warn('Canvas autosave failed:', e.message)
  }
}

export function loadExportHistory() {
  try {
    const raw = localStorage.getItem(LS_HISTORY_KEY)
    return raw ? JSON.parse(raw) : []
  } catch { return [] }
}

export function saveExportHistory(entry) {
  try {
    const history = loadExportHistory()
    const updated = [entry, ...history].slice(0, 30)
    localStorage.setItem(LS_HISTORY_KEY, JSON.stringify(updated))
    return updated
  } catch (e) {
    console.warn('Export history save failed:', e.message)
    return []
  }
}

export function clearExportHistory() {
  try { localStorage.removeItem(LS_HISTORY_KEY) } catch {}
}

export function saveProfileToStorage(profileImage, profileName) {
  try {
    if (profileName) {
      localStorage.setItem(LS_PROFILE_KEY, JSON.stringify({ profileName }))
    } else {
      localStorage.removeItem(LS_PROFILE_KEY)
    }
  } catch {}
}

export function loadProfileFromStorage() {
  try {
    const raw = localStorage.getItem(LS_PROFILE_KEY)
    return raw ? JSON.parse(raw) : null
  } catch { return null }
}

// ── One-time migration: clear stale canvas state if zIndex values
// are out of sync with array order (caused by old arrange bug) ──
function migrateCanvasState() {
  try {
    const raw = localStorage.getItem('ryuk_canvas_state')
    if (!raw) return null
    const data = JSON.parse(raw)
    if (!data?.images?.length) return data
    // Check if zIndex matches array order — if not, fix it
    const needsFix = data.images.some((img, i) => img.zIndex !== i)
    if (needsFix) {
      data.images = data.images
        .sort((a, b) => (a.zIndex ?? 0) - (b.zIndex ?? 0))
        .map((img, i) => ({ ...img, zIndex: i }))
      localStorage.setItem('ryuk_canvas_state', JSON.stringify(data))
    }
    return data
  } catch { return null }
}

const persisted = (() => {
  const p = migrateCanvasState()
  if (p?.images?.length) {
    const g = gridLayout(p.images)
    return { ...p, images: g.images, canvasSize: g.canvasSize }
  }
  return p
})()

const useStore = create(
  subscribeWithSelector((set, get) => ({
    canvasSize:            persisted?.canvasSize            ?? { ...DEFAULT_CANVAS },
    stageScale:            0.15,
    stagePos:              { x: 0, y: 0 },
    backgroundColor:       persisted?.backgroundColor       ?? '#000000',
    backgroundTransparent: persisted?.backgroundTransparent ?? false,

    setCanvasSize: (size) => {
      set({ canvasSize: size })
      const s = get()
      saveCanvasState(s.images, size, s.backgroundColor, s.backgroundTransparent)
    },
    setStageScale: (scale) => set({ stageScale: Math.min(Math.max(scale, 0.02), 5) }),
    setStagePos:   (pos)   => set({ stagePos: pos }),
    setBackgroundColor: (c) => {
      set({ backgroundColor: c })
      const s = get()
      saveCanvasState(s.images, s.canvasSize, c, s.backgroundTransparent)
    },
    setBackgroundTransparent: (v) => {
      set({ backgroundTransparent: v })
      const s = get()
      saveCanvasState(s.images, s.canvasSize, s.backgroundColor, v)
    },

    zoomIn:  () => set(s => ({ stageScale: Math.min(s.stageScale * 1.15, 5) })),
    zoomOut: () => set(s => ({ stageScale: Math.max(s.stageScale / 1.15, 0.02) })),
    zoomFit: () => {
      const { canvasSize } = get()
      const container = document.getElementById('canvas-container')
      if (!container) return
      const { clientWidth: cw, clientHeight: ch } = container
      const scale = Math.min((cw - 80) / canvasSize.width, (ch - 80) / canvasSize.height)
      const x = (cw - canvasSize.width * scale) / 2
      const y = (ch - canvasSize.height * scale) / 2
      set({ stageScale: scale, stagePos: { x, y } })
    },
    zoomActual: () => set({ stageScale: 1 }),

    images:      persisted?.images ?? [],
    selectedIds: [],
    activeTool:  'select',

    setActiveTool: (t) => set({ activeTool: t, selectedIds: [] }),

    setImages: (images) => {
      set({ images, selectedIds: [] })
      get()._persist()
    },

    // ── Reorder images from ArrangePanel ──────────────────────────────────────
    // Keep each slot's on-canvas position/size (x, y, rendered W/H, rotation),
    // and slot the new image content into the array in the user-chosen order.
    // So moving #9 to #1 actually swaps their places on the live canvas — not
    // just z-order — and the result matches the export.
    reorderImages: (newOrder) => {
      const s = get()
      if (!newOrder?.length || newOrder.length !== s.images.length) return

      const snap = JSON.stringify(s.images)
      const newHistory = [...s.history.slice(0, s.historyIndex + 1), snap]

      // the chosen order becomes the grid order (which is also the export order)
      const rank = new Map(newOrder.map((img, i) => [img.id, i]))
      set({
        images: s.images.map(img => ({ ...img, zIndex: rank.get(img.id) ?? img.zIndex })),
        selectedIds: [],
        history: newHistory.slice(-50),
        historyIndex: Math.min(newHistory.length - 1, 49),
      })
      get()._relayout()
    },

    _relayout: () => {
      const g = gridLayout(get().images)
      set({ images: g.images, canvasSize: g.canvasSize })
      get()._persist()
      setTimeout(() => get().zoomFit(), 50)
    },

    _persist: () => {
      const s = get()
      saveCanvasState(s.images, s.canvasSize, s.backgroundColor, s.backgroundTransparent)
    },

    addImages: (newImages) => {
      set(s => {
        const startZ = s.images.length
        const imgs = newImages.map((img, i) => ({
          id: nanoid(),
          src: img.src,
          name: img.name || 'Image',
          width: img.naturalWidth,
          height: img.naturalHeight,
          x: img.x ?? Math.random() * (s.canvasSize.width * 0.6),
          y: img.y ?? Math.random() * (s.canvasSize.height * 0.6),
          scaleX: img.scaleX ?? 1,
          scaleY: img.scaleY ?? 1,
          rotation: img.rotation ?? 0,
          opacity: 1,
          visible: true,
          locked: false,
          zIndex: startZ + i,
          naturalWidth: img.naturalWidth,
          naturalHeight: img.naturalHeight,
          fileSize: img.fileSize || 0,
          ...(img.cropW && img.cropH ? { cropX: img.cropX ?? 0, cropY: img.cropY ?? 0, cropW: img.cropW, cropH: img.cropH } : {}),
        }))
        return { images: [...s.images, ...imgs] }
      })
      get()._relayout()          // same grid as the export, fitted to the screen
    },

    updateImage: (id, updates) => {
      set(s => ({ images: s.images.map(img => img.id === id ? { ...img, ...updates } : img) }))
      get()._persist()
    },

    removeImage: (id) => {
      set(s => ({
        images: s.images.filter(img => img.id !== id),
        selectedIds: s.selectedIds.filter(sid => sid !== id),
      }))
      get()._relayout()
    },

    removeSelected: () => {
      set(s => ({
        images: s.images.filter(img => !s.selectedIds.includes(img.id)),
        selectedIds: [],
      }))
      get()._relayout()
    },

    duplicateSelected: () => {
      set(s => {
        const newImgs = s.selectedIds
          .map(id => s.images.find(img => img.id === id))
          .filter(Boolean)
          .map(img => ({ ...img, id: nanoid(), x: img.x + 30, y: img.y + 30, zIndex: s.images.length }))
        return { images: [...s.images, ...newImgs], selectedIds: newImgs.map(i => i.id) }
      })
      get()._relayout()
    },

    clearAll: () => {
      set({ images: [], selectedIds: [] })
      get()._persist()
    },

    selectImage: (id, multi = false) => set(s => {
      if (!id) return { selectedIds: [] }
      if (multi) {
        const already = s.selectedIds.includes(id)
        return { selectedIds: already ? s.selectedIds.filter(x => x !== id) : [...s.selectedIds, id] }
      }
      return { selectedIds: [id] }
    }),
    selectAll:      () => set(s => ({ selectedIds: s.images.map(i => i.id) })),
    clearSelection: () => set({ selectedIds: [] }),

    // ── Swap two images: swap src/name between slots, recalculate scale
    //    so each image keeps the same rendered pixel size it had before ──
    swapImages: (idA, idB) => {
      const s = get()
      const a = s.images.find(i => i.id === idA)
      const b = s.images.find(i => i.id === idB)
      if (!a || !b) return
      set({
        images: s.images.map(img =>
          img.id === idA ? { ...img, zIndex: b.zIndex } : img.id === idB ? { ...img, zIndex: a.zIndex } : img),
        selectedIds: [],
      })
      get()._relayout()
    },

    bringForward: (id) => {
      set(s => {
        const imgs = [...s.images]
        const idx = imgs.findIndex(i => i.id === id)
        if (idx < imgs.length - 1) {
          ;[imgs[idx].zIndex, imgs[idx + 1].zIndex] = [imgs[idx + 1].zIndex, imgs[idx].zIndex]
          return { images: [...imgs].sort((a, b) => a.zIndex - b.zIndex) }
        }
        return {}
      })
      get()._persist()
    },
    sendBackward: (id) => {
      set(s => {
        const imgs = [...s.images]
        const idx = imgs.findIndex(i => i.id === id)
        if (idx > 0) {
          ;[imgs[idx].zIndex, imgs[idx - 1].zIndex] = [imgs[idx - 1].zIndex, imgs[idx].zIndex]
          return { images: [...imgs].sort((a, b) => a.zIndex - b.zIndex) }
        }
        return {}
      })
      get()._persist()
    },
    bringToFront: (id) => {
      set(s => {
        const maxZ = Math.max(...s.images.map(i => i.zIndex))
        return { images: s.images.map(i => i.id === id ? { ...i, zIndex: maxZ + 1 } : i) }
      })
      get()._persist()
    },
    sendToBack: (id) => {
      set(s => {
        const minZ = Math.min(...s.images.map(i => i.zIndex))
        return { images: s.images.map(i => i.id === id ? { ...i, zIndex: minZ - 1 } : i) }
      })
      get()._persist()
    },

    applyGridLayout: (cols = 4, gap = 0) => {
      set(s => {
        if (!s.images.length) return {}
        const cw = s.canvasSize.width
        const cellW = (cw - gap * (cols - 1)) / cols
        const updated = s.images.map((img, i) => {
          const row = Math.floor(i / cols)
          const col = i % cols
          const scale = cellW / img.naturalWidth
          return { ...img, x: col * (cellW + gap), y: row * (img.naturalHeight * scale + gap), scaleX: scale, scaleY: scale, rotation: 0 }
        })
        return { images: updated }
      })
      get()._persist()
    },

    history:      [],
    historyIndex: -1,

    saveSnapshot: () => set(s => {
      const snap = JSON.stringify(s.images)
      const newHistory = [...s.history.slice(0, s.historyIndex + 1), snap]
      return { history: newHistory.slice(-50), historyIndex: Math.min(newHistory.length - 1, 49) }
    }),

    undo: () => {
      set(s => {
        if (s.historyIndex <= 0) return {}
        const newIdx = s.historyIndex - 1
        return { images: JSON.parse(s.history[newIdx]), historyIndex: newIdx }
      })
      get()._relayout()
    },
    redo: () => {
      set(s => {
        if (s.historyIndex >= s.history.length - 1) return {}
        const newIdx = s.historyIndex + 1
        return { images: JSON.parse(s.history[newIdx]), historyIndex: newIdx }
      })
      get()._relayout()
    },
    canUndo: () => get().historyIndex > 0,
    canRedo: () => get().historyIndex < get().history.length - 1,

    isExporting:    false,
    exportProgress: 0,
    setExporting: (v, p = 0) => set({ isExporting: v, exportProgress: p }),

    exportHistory: loadExportHistory(),

    addExportHistoryEntry: (entry) => set(s => {
      const updated = saveExportHistory(entry)
      return { exportHistory: updated }
    }),

    removeExportHistoryEntry: (id) => set(s => {
      const updated = s.exportHistory.filter(e => e.id !== id)
      try { localStorage.setItem(LS_HISTORY_KEY, JSON.stringify(updated)) } catch {}
      return { exportHistory: updated }
    }),

    clearExportHistoryStore: () => set(() => {
      clearExportHistory()
      return { exportHistory: [] }
    }),

    showLayers:     true,
    showProperties: true,
    showGrid:       false,
    snapToGrid:     false,
    gridSize:       50,
    rulerVisible:   false,

    toggleLayers:     () => set(s => ({ showLayers:     !s.showLayers })),
    toggleProperties: () => set(s => ({ showProperties: !s.showProperties })),
    toggleGrid:       () => set(s => ({ showGrid:       !s.showGrid })),
    toggleSnap:       () => set(s => ({ snapToGrid:     !s.snapToGrid })),
    setGridSize:      (v) => set({ gridSize: v }),
  }))
)

export default useStore
