import { create } from 'zustand'
import { subscribeWithSelector } from 'zustand/middleware'
import { nanoid } from './nanoid'

const DEFAULT_CANVAS = { width: 3840, height: 2160 }

function layoutImages(allImages, canvasWidth) {
  const count = allImages.length
  if (count === 0) return []
  const cols = Math.ceil(Math.sqrt(count))
  const cellSize = Math.floor(canvasWidth / cols)
  return allImages.map((img, i) => ({
    ...img,
    x: (i % cols) * cellSize,
    y: Math.floor(i / cols) * cellSize,
    scaleX: cellSize / img.naturalWidth,
    scaleY: cellSize / img.naturalHeight,
  }))
}

const useStore = create(
  subscribeWithSelector((set, get) => ({
    canvasSize: { ...DEFAULT_CANVAS },
    stageScale: 0.15,
    stagePos: { x: 0, y: 0 },
    backgroundColor: '#000000',
    backgroundTransparent: false,

    setCanvasSize: (size) => set({ canvasSize: size }),
    setStageScale: (scale) => set({ stageScale: Math.min(Math.max(scale, 0.02), 5) }),
    setStagePos: (pos) => set({ stagePos: pos }),
    setBackgroundColor: (c) => set({ backgroundColor: c }),
    setBackgroundTransparent: (v) => set({ backgroundTransparent: v }),

    zoomIn: () => set(s => ({ stageScale: Math.min(s.stageScale * 1.15, 5) })),
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

    images: [],
    selectedIds: [],
    activeTool: 'select',

    setActiveTool: (t) => set({ activeTool: t, selectedIds: [] }),

    addImages: (newImages) => set(s => {
      const prepared = newImages.map((img, i) => ({
        id: nanoid(),
        src: img.src,
        name: img.name || 'Image',
        naturalWidth: img.naturalWidth,
        naturalHeight: img.naturalHeight,
        width: img.naturalWidth,
        height: img.naturalHeight,
        x: 0,
        y: 0,
        scaleX: 1,
        scaleY: 1,
        rotation: 0,
        opacity: 1,
        visible: true,
        locked: false,
        zIndex: s.images.length + i,
        fileSize: img.fileSize || 0,
      }))
      const allImages = [...s.images, ...prepared]
      const laid = layoutImages(allImages, s.canvasSize.width)
      return { images: laid }
    }),

    updateImage: (id, updates) => set(s => ({
      images: s.images.map(img => img.id === id ? { ...img, ...updates } : img)
    })),

    removeImage: (id) => set(s => {
      const filtered = s.images.filter(img => img.id !== id)
      const laid = layoutImages(filtered, s.canvasSize.width)
      return {
        images: laid,
        selectedIds: s.selectedIds.filter(sid => sid !== id),
      }
    }),

    removeSelected: () => set(s => {
      const filtered = s.images.filter(img => !s.selectedIds.includes(img.id))
      const laid = layoutImages(filtered, s.canvasSize.width)
      return { images: laid, selectedIds: [] }
    }),

    duplicateSelected: () => set(s => {
      const newImgs = s.selectedIds
        .map(id => s.images.find(img => img.id === id))
        .filter(Boolean)
        .map(img => ({
          ...img,
          id: nanoid(),
          zIndex: s.images.length,
        }))
      const allImages = [...s.images, ...newImgs]
      const laid = layoutImages(allImages, s.canvasSize.width)
      return { images: laid, selectedIds: newImgs.map(i => i.id) }
    }),

    clearAll: () => set({ images: [], selectedIds: [] }),

    selectImage: (id, multi = false) => set(s => {
      if (!id) return { selectedIds: [] }
      if (multi) {
        const already = s.selectedIds.includes(id)
        return { selectedIds: already ? s.selectedIds.filter(x => x !== id) : [...s.selectedIds, id] }
      }
      return { selectedIds: [id] }
    }),
    selectAll: () => set(s => ({ selectedIds: s.images.map(i => i.id) })),
    clearSelection: () => set({ selectedIds: [] }),

    bringForward: (id) => set(s => {
      const imgs = [...s.images]
      const idx = imgs.findIndex(i => i.id === id)
      if (idx < imgs.length - 1) {
        ;[imgs[idx].zIndex, imgs[idx + 1].zIndex] = [imgs[idx + 1].zIndex, imgs[idx].zIndex]
        return { images: [...imgs].sort((a, b) => a.zIndex - b.zIndex) }
      }
      return {}
    }),
    sendBackward: (id) => set(s => {
      const imgs = [...s.images]
      const idx = imgs.findIndex(i => i.id === id)
      if (idx > 0) {
        ;[imgs[idx].zIndex, imgs[idx - 1].zIndex] = [imgs[idx - 1].zIndex, imgs[idx].zIndex]
        return { images: [...imgs].sort((a, b) => a.zIndex - b.zIndex) }
      }
      return {}
    }),
    bringToFront: (id) => set(s => {
      const maxZ = Math.max(...s.images.map(i => i.zIndex))
      return { images: s.images.map(i => i.id === id ? { ...i, zIndex: maxZ + 1 } : i) }
    }),
    sendToBack: (id) => set(s => {
      const minZ = Math.min(...s.images.map(i => i.zIndex))
      return { images: s.images.map(i => i.id === id ? { ...i, zIndex: minZ - 1 } : i) }
    }),

    history: [],
    historyIndex: -1,

    saveSnapshot: () => set(s => {
      const snap = JSON.stringify(s.images)
      const newHistory = [...s.history.slice(0, s.historyIndex + 1), snap]
      return { history: newHistory.slice(-50), historyIndex: Math.min(newHistory.length - 1, 49) }
    }),

    undo: () => set(s => {
      if (s.historyIndex <= 0) return {}
      const newIdx = s.historyIndex - 1
      return { images: JSON.parse(s.history[newIdx]), historyIndex: newIdx }
    }),
    redo: () => set(s => {
      if (s.historyIndex >= s.history.length - 1) return {}
      const newIdx = s.historyIndex + 1
      return { images: JSON.parse(s.history[newIdx]), historyIndex: newIdx }
    }),
    canUndo: () => get().historyIndex > 0,
    canRedo: () => get().historyIndex < get().history.length - 1,

    isExporting: false,
    exportProgress: 0,
    setExporting: (v, p = 0) => set({ isExporting: v, exportProgress: p }),

    showLayers: true,
    showProperties: true,
    showGrid: false,
    snapToGrid: false,
    gridSize: 50,
    rulerVisible: false,

    toggleLayers: () => set(s => ({ showLayers: !s.showLayers })),
    toggleProperties: () => set(s => ({ showProperties: !s.showProperties })),
    toggleGrid: () => set(s => ({ showGrid: !s.showGrid })),
    toggleSnap: () => set(s => ({ snapToGrid: !s.snapToGrid })),
    setGridSize: (v) => set({ gridSize: v }),
  }))
)

export default useStore
