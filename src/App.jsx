import React, { useRef, useState, useCallback, useEffect } from 'react'
import { Stage, Layer, Image as KonvaImage, Rect } from 'react-konva'
import { Toaster } from 'react-hot-toast'
import useStore from './store/useStore'
import { nanoid } from './store/nanoid'
import { useDrop } from './useDrop'
import { useKeyboard } from './useKeyboard'
import useImage from 'use-image'
import HeroPicker from './components/HeroPicker'
import AdminPanel from './components/AdminPanel'
import WelcomeScreen, { useWelcome } from './components/WelcomeScreen'
import ProjectsPanel from './components/ProjectsPanel'
import { autoSave, loadAutoSave, generateThumbnail } from './utils/projectManager'

const AUTO_HISTORY_KEY   = 'ryuk_autosave_history'
const AUTO_HISTORY_LIMIT = 10

// ── Toolbar button style helpers ─────────────────────────────────────────────
const btnBase = {
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  border: '1px solid #2a2a3a', borderRadius: '8px',
  fontSize: '13px', fontWeight: 600, cursor: 'pointer',
  padding: '7px 12px', whiteSpace: 'nowrap', transition: 'all 0.15s',
  lineHeight: 1,
}
const btnPrimary   = { ...btnBase, background: 'linear-gradient(135deg,#6c63ff,#a855f7)', color: '#fff', border: 'none' }
const btnGhost     = { ...btnBase, background: 'none', color: '#c8c8e8' }
const btnArrangeOn = { ...btnBase, background: 'rgba(34,197,94,0.15)', color: '#22c55e', border: '1px solid #22c55e' }

function CanvasImage({ img, isSelected, onSelect }) {
  const [image] = useImage(img.src)
  const onSelectRef = useRef(onSelect)
  onSelectRef.current = onSelect
  const handleClick = useCallback(() => {
    onSelectRef.current(img.id)
  }, [img.id])
  const borderColor = isSelected ? '#6c63ff' : null
  return (
    <KonvaImage
      image={image}
      x={img.x} y={img.y}
      width={img.naturalWidth} height={img.naturalHeight}
      scaleX={img.scaleX} scaleY={img.scaleY}
      rotation={img.rotation} opacity={img.opacity}
      onClick={handleClick}
      onTap={handleClick}
      stroke={borderColor || undefined}
      strokeWidth={borderColor ? 6 : 0}
      strokeScaleEnabled={true}
      hitStrokeWidth={0}
      perfectDrawEnabled={false}
    />
  )
}

// ── Arrange Panel ─────────────────────────────────────────────────────────────
function ArrangePanel({ images, onClose, onReorder }) {
  const [order, setOrder] = useState(() => [...images])
  const dragIdx     = useRef(null)
  const dragOverIdx = useRef(null)

  useEffect(() => { setOrder([...images]) }, [images])

  const handleDragStart = (i) => { dragIdx.current = i }
  const handleDragEnter = (i) => { dragOverIdx.current = i }
  const handleDragEnd   = () => {
    const from = dragIdx.current
    const to   = dragOverIdx.current
    if (from === null || to === null || from === to) return
    const next = [...order]
    const [moved] = next.splice(from, 1)
    next.splice(to, 0, moved)
    setOrder(next)
    dragIdx.current     = null
    dragOverIdx.current = null
  }

  const moveUp    = (i) => { if (i === 0) return; const a = [...order]; [a[i-1],a[i]]=[a[i],a[i-1]]; setOrder(a) }
  const moveDown  = (i) => { if (i === order.length-1) return; const a=[...order]; [a[i],a[i+1]]=[a[i+1],a[i]]; setOrder(a) }
  const moveFirst = (i) => { const a=[...order]; const [m]=a.splice(i,1); setOrder([m,...a]) }
  const moveLast  = (i) => { const a=[...order]; const [m]=a.splice(i,1); setOrder([...a,m]) }

  const handleApply = () => { onReorder([...order]) }

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 250,
        background: 'rgba(0,0,0,0.75)',
        display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
      }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div style={{
        background: '#13131f', borderRadius: '20px 20px 0 0',
        border: '1px solid #252535', borderBottom: 'none',
        width: '100%', maxWidth: '480px',
        maxHeight: '82vh', display: 'flex', flexDirection: 'column',
        boxShadow: '0 -8px 40px rgba(0,0,0,0.7)',
      }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 18px 12px', borderBottom: '1px solid #1e1e2e', flexShrink: 0 }}>
          <div>
            <p style={{ margin: 0, fontSize: '15px', fontWeight: 700, color: '#c8c8e8' }}>⠿ Arrange Order</p>
            <p style={{ margin: '2px 0 0', fontSize: '11px', color: '#555' }}>Drag or use arrows · tap Apply to confirm</p>
          </div>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <button onClick={handleApply}
              style={{ background: 'linear-gradient(135deg,#22c55e,#16a34a)', border: 'none', borderRadius: '8px', color: '#fff', fontSize: '13px', fontWeight: 700, padding: '7px 16px', cursor: 'pointer' }}>
              Apply
            </button>
            <button onClick={onClose}
              style={{ background: 'none', border: 'none', color: '#666', fontSize: '20px', cursor: 'pointer', lineHeight: 1, padding: '2px 4px' }}>✕</button>
          </div>
        </div>

        {/* List */}
        <div style={{ overflowY: 'auto', flex: 1, padding: '10px 12px 20px' }}>
          {order.length === 0 && (
            <p style={{ textAlign: 'center', color: '#555', fontSize: '13px', marginTop: '40px' }}>No images on canvas yet.</p>
          )}
          {order.map((img, i) => (
            <div
              key={img.id}
              draggable
              onDragStart={() => handleDragStart(i)}
              onDragEnter={() => handleDragEnter(i)}
              onDragEnd={handleDragEnd}
              onDragOver={e => e.preventDefault()}
              style={{
                display: 'flex', alignItems: 'center', gap: '10px',
                background: '#1a1a2e', border: '1px solid #252535',
                borderRadius: '10px', padding: '8px 10px', marginBottom: '7px',
                cursor: 'grab', userSelect: 'none', transition: 'background 0.1s',
              }}
              onMouseEnter={e => e.currentTarget.style.background = '#20203a'}
              onMouseLeave={e => e.currentTarget.style.background = '#1a1a2e'}
            >
              {/* Drag handle */}
              <span style={{ color: '#444', fontSize: '16px', flexShrink: 0 }}>⠿</span>

              {/* Thumbnail */}
              <div style={{ width: '40px', height: '40px', borderRadius: '6px', overflow: 'hidden', flexShrink: 0, background: '#0e0e1a' }}>
                <img src={img.src} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              </div>

              {/* Position badge + name */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{
                    background: i === 0 ? '#22c55e22' : i === order.length - 1 ? '#a855f722' : '#252535',
                    border: `1px solid ${i === 0 ? '#22c55e' : i === order.length - 1 ? '#a855f7' : '#333'}`,
                    color: i === 0 ? '#22c55e' : i === order.length - 1 ? '#a855f7' : '#666',
                    fontSize: '10px', fontWeight: 700, borderRadius: '4px', padding: '1px 5px', flexShrink: 0,
                  }}>
                    {i === 0 ? '1st' : i === order.length - 1 ? 'Last' : `#${i + 1}`}
                  </span>
                  <span style={{ color: '#c8c8e8', fontSize: '12px', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {img.name || `Image ${i + 1}`}
                  </span>
                </div>
              </div>

              {/* Arrow buttons */}
              <div style={{ display: 'flex', gap: '3px', flexShrink: 0 }}>
                <button onClick={() => moveFirst(i)} disabled={i === 0} title="Move to first"
                  style={{ background: 'none', border: '1px solid #333', borderRadius: '5px', color: i === 0 ? '#333' : '#888', fontSize: '11px', padding: '3px 6px', cursor: i === 0 ? 'default' : 'pointer' }}>⇈</button>
                <button onClick={() => moveUp(i)} disabled={i === 0} title="Move up"
                  style={{ background: 'none', border: '1px solid #333', borderRadius: '5px', color: i === 0 ? '#333' : '#888', fontSize: '11px', padding: '3px 6px', cursor: i === 0 ? 'default' : 'pointer' }}>↑</button>
                <button onClick={() => moveDown(i)} disabled={i === order.length - 1} title="Move down"
                  style={{ background: 'none', border: '1px solid #333', borderRadius: '5px', color: i === order.length - 1 ? '#333' : '#888', fontSize: '11px', padding: '3px 6px', cursor: i === order.length - 1 ? 'default' : 'pointer' }}>↓</button>
                <button onClick={() => moveLast(i)} disabled={i === order.length - 1} title="Move to last"
                  style={{ background: 'none', border: '1px solid #333', borderRadius: '5px', color: i === order.length - 1 ? '#333' : '#888', fontSize: '11px', padding: '3px 6px', cursor: i === order.length - 1 ? 'default' : 'pointer' }}>⇊</button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

export default function App() {
  const stageRef        = useRef()
  const containerRef    = useRef()
  const fileInputRef    = useRef()
  const profileInputRef = useRef()
  const openHeroPicker  = useRef(null)

  const [profileImage,      setProfileImage]      = useState(null)
  const [profileName,       setProfileName]        = useState('')
  const [diamondPopupOpen,  setDiamondPopupOpen]   = useState(false)
  const [historyOpen,       setHistoryOpen]        = useState(false)
  const [sidebarOpen,       setSidebarOpen]        = useState(false)
  const [projectsOpen,      setProjectsOpen]       = useState(false)
  const [adminOpen,         setAdminOpen]          = useState(false)
  const [showPasswordPrompt,setShowPasswordPrompt] = useState(false)
  const [passwordInput,     setPasswordInput]      = useState('')
  const [passwordError,     setPasswordError]      = useState(false)
  const [arrangeOpen,       setArrangeOpen]        = useState(false)

  const logoClickCount = useRef(0)
  const logoClickTimer = useRef(null)
  const ADMIN_PASSWORD = 'ryuk2025'

  const { show: showWelcome, dismiss: dismissWelcome } = useWelcome()

  // ── Store ───────────────────────────────────────────────────────────────────
  const images          = useStore(s => s.images)
  const selectedIds     = useStore(s => s.selectedIds)
  const canvasSize      = useStore(s => s.canvasSize)
  const stageScale      = useStore(s => s.stageScale)
  const stagePos        = useStore(s => s.stagePos)
  const backgroundColor = useStore(s => s.backgroundColor)
  const selectImage     = useStore(s => s.selectImage)
  const clearSelection  = useStore(s => s.clearSelection)
  const setStageScale   = useStore(s => s.setStageScale)
  const setStagePos     = useStore(s => s.setStagePos)
  const clearAll        = useStore(s => s.clearAll)
  const undo            = useStore(s => s.undo)
  const redo            = useStore(s => s.redo)
  const removeSelected  = useStore(s => s.removeSelected)
  const setImages       = useStore(s => s.setImages)
  const reorderImages   = useStore(s => s.reorderImages)
  const setBackgroundColor      = useStore(s => s.setBackgroundColor)
  const saveSnapshot            = useStore(s => s.saveSnapshot)
  const exportHistory           = useStore(s => s.exportHistory)
  const addExportHistoryEntry   = useStore(s => s.addExportHistoryEntry)
  const removeExportHistoryEntry= useStore(s => s.removeExportHistoryEntry)
  const clearExportHistoryStore = useStore(s => s.clearExportHistoryStore)

  const hasSelection = selectedIds.length > 0

  // ── Container size: always matches the actual canvas-container element ───────
  const [containerSize, setContainerSize] = useState({ width: window.innerWidth, height: window.innerHeight })

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    // Set immediately on mount
    setContainerSize({ width: el.clientWidth, height: el.clientHeight })
    const ro = new ResizeObserver(() => {
      setContainerSize({ width: el.clientWidth, height: el.clientHeight })
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // ── Fit images to screen whenever images change or container resizes ─────────
  const fitToImages = useCallback(() => {
    const el = containerRef.current
    if (!el || !images.length) return
    const cw = el.clientWidth
    const ch = el.clientHeight
    // Compute bounding box of all images on the canvas
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
    for (const img of images) {
      const w = img.naturalWidth  * img.scaleX
      const h = img.naturalHeight * img.scaleY
      if (img.x     < minX) minX = img.x
      if (img.y     < minY) minY = img.y
      if (img.x + w > maxX) maxX = img.x + w
      if (img.y + h > maxY) maxY = img.y + h
    }
    const bw = maxX - minX
    const bh = maxY - minY
    const pad = 40
    const scale = Math.min((cw - pad * 2) / bw, (ch - pad * 2) / bh, 5)
    const x = (cw - bw * scale) / 2 - minX * scale
    const y = (ch - bh * scale) / 2 - minY * scale
    setStageScale(scale)
    setStagePos({ x, y })
  }, [images, setStageScale, setStagePos])

  // Run fitToImages whenever images are added (length increases)
  const prevImageCount = useRef(0)
  useEffect(() => {
    if (images.length > 0 && images.length !== prevImageCount.current) {
      prevImageCount.current = images.length
      // Small delay so container is fully painted
      const t = setTimeout(fitToImages, 50)
      return () => clearTimeout(t)
    }
  }, [images.length, fitToImages])

  // ── Konva canvas transparent ────────────────────────────────────────────────
  useEffect(() => {
    if (!stageRef.current) return
    const canvas = stageRef.current.container().querySelector('canvas')
    if (canvas) canvas.style.background = 'transparent'
  })

  const { isDragging, handleFiles, onDragEnter, onDragLeave, onDragOver, onDrop } = useDrop()
  useKeyboard()

  // ── Auto-save ───────────────────────────────────────────────────────────────
  const autoSaveTimer = useRef(null)
  useEffect(() => {
    if (!images.length) return
    clearTimeout(autoSaveTimer.current)
    autoSaveTimer.current = setTimeout(async () => {
      const snapshot = { images, backgroundColor, canvasSize, stageScale, stagePos }
      autoSave(snapshot)
      try {
        const thumbnail = await generateThumbnail(images, backgroundColor)
        const raw     = localStorage.getItem(AUTO_HISTORY_KEY)
        const history = raw ? JSON.parse(raw) : []
        history.unshift({ savedAt: Date.now(), imageCount: images.length, thumbnail, snapshot })
        if (history.length > AUTO_HISTORY_LIMIT) history.splice(AUTO_HISTORY_LIMIT)
        localStorage.setItem(AUTO_HISTORY_KEY, JSON.stringify(history))
      } catch {}
    }, 2000)
    return () => clearTimeout(autoSaveTimer.current)
  }, [images, backgroundColor])

  // ── Session restore toast ───────────────────────────────────────────────────
  useEffect(() => {
    const saved = loadAutoSave()
    if (!saved?.images?.length) return
    const alreadyShown = sessionStorage.getItem('ryuk_restore_shown')
    if (alreadyShown) return
    sessionStorage.setItem('ryuk_restore_shown', '1')
    import('react-hot-toast').then(({ default: toast }) => {
      toast(`✨ Restored ${saved.images.length} image${saved.images.length !== 1 ? 's' : ''} from your last session`, {
        duration: 3500,
        style: { background: '#1a1a26', color: '#c8c8e8', border: '1px solid #6c63ff55' },
      })
    })
  }, [])

  // ── Back button ─────────────────────────────────────────────────────────────
  useEffect(() => {
    const handlePopState = () => {
      if (arrangeOpen)         { setArrangeOpen(false);         return }
      if (projectsOpen)        { setProjectsOpen(false);        return }
      if (historyOpen)         { setHistoryOpen(false);         return }
      if (showPasswordPrompt)  { setShowPasswordPrompt(false);  return }
      if (adminOpen)           { setAdminOpen(false);           return }
      if (diamondPopupOpen)    { setDiamondPopupOpen(false);    return }
      if (showWelcome)         { dismissWelcome();              return }
      if (hasSelection)        { clearSelection();              return }
    }
    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [arrangeOpen, projectsOpen, historyOpen, showPasswordPrompt, adminOpen, diamondPopupOpen, showWelcome, hasSelection, dismissWelcome, clearSelection])

  // ── Handlers ────────────────────────────────────────────────────────────────
  const handleOpenHeroPicker = useCallback(() => {
    if (openHeroPicker.current) openHeroPicker.current()
  }, [])

  const handleLoadProject = useCallback((snapshot) => {
    if (!snapshot) return
    if (snapshot.images)          setImages(snapshot.images)
    if (snapshot.backgroundColor) setBackgroundColor(snapshot.backgroundColor)
    clearSelection()
  }, [setImages, setBackgroundColor, clearSelection])

  const currentSnapshot = { images, backgroundColor, canvasSize, stageScale, stagePos }

  const openProjects = () => { window.history.pushState({ overlay: 'projects' }, ''); setProjectsOpen(true) }
  const openHistory  = () => { window.history.pushState({ overlay: 'history' }, '');  setHistoryOpen(true) }
  const closeHistory = () => setHistoryOpen(false)

  const handleLogoClick = useCallback(() => {
    logoClickCount.current += 1
    if (logoClickTimer.current) clearTimeout(logoClickTimer.current)
    logoClickTimer.current = setTimeout(() => { logoClickCount.current = 0 }, 800)
    if (logoClickCount.current >= 3) {
      logoClickCount.current = 0
      clearTimeout(logoClickTimer.current)
      setShowPasswordPrompt(true); setPasswordInput(''); setPasswordError(false)
      window.history.pushState({ overlay: 'password' }, '')
    }
  }, [])

  const handlePasswordSubmit = () => {
    if (passwordInput === ADMIN_PASSWORD) {
      setShowPasswordPrompt(false); setAdminOpen(true); setPasswordError(false)
      window.history.pushState({ overlay: 'admin' }, '')
    } else {
      setPasswordError(true); setPasswordInput('')
    }
  }

  const handleProfileUpload = (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setProfileImage(URL.createObjectURL(file))
    setProfileName(file.name)
    e.target.value = ''
  }

  const handleRemoveProfile = () => {
    if (profileImage) URL.revokeObjectURL(profileImage)
    setProfileImage(null); setProfileName('')
  }

  // ── Arrange ─────────────────────────────────────────────────────────────────
  const handleOpenArrange = useCallback(() => {
    if (!images.length) return
    window.history.pushState({ overlay: 'arrange' }, '')
    setArrangeOpen(true)
  }, [images.length])

  const handleReorder = useCallback((newOrder) => {
    reorderImages(newOrder)
    setArrangeOpen(false)
  }, [reorderImages])

  // ── Wheel zoom ──────────────────────────────────────────────────────────────
  const handleWheel = (e) => {
    e.evt.preventDefault()
    const scaleBy  = 1.08
    const stage    = e.target.getStage()
    const oldScale = stage.scaleX()
    const pointer  = stage.getPointerPosition()
    const mousePointTo = {
      x: (pointer.x - stage.x()) / oldScale,
      y: (pointer.y - stage.y()) / oldScale,
    }
    const newScale = e.evt.deltaY < 0 ? oldScale * scaleBy : oldScale / scaleBy
    setStageScale(newScale)
    setStagePos({ x: pointer.x - mousePointTo.x * newScale, y: pointer.y - mousePointTo.y * newScale })
  }

  // ── Export ──────────────────────────────────────────────────────────────────
  const handleExport = async () => {
    if (!images.length) return
    const toast    = (await import('react-hot-toast')).default
    const id       = toast.loading('Exporting collage...')
    let blob       = null
    const filename = `ryukcreates-${Date.now()}.png`
    try {
      const { exportCollage, downloadBlob } = await import('./utils/imageUtils')
      const sortedImages = [...images].sort((a, b) => (a.zIndex ?? 0) - (b.zIndex ?? 0))
      blob = await exportCollage(sortedImages, backgroundColor, profileImage || null)
      downloadBlob(blob, filename)
      toast.success('Exported! Check your downloads.', { id })
    } catch (e) {
      toast.error('Export failed: ' + e.message, { id }); return
    }
    let thumbnail = null
    try {
      const bmp = await createImageBitmap(blob)
      const tw  = 160, th = Math.round((bmp.height / bmp.width) * tw)
      const tc  = document.createElement('canvas')
      tc.width = tw; tc.height = th
      tc.getContext('2d').drawImage(bmp, 0, 0, tw, th)
      thumbnail = tc.toDataURL('image/jpeg', 0.6)
    } catch {}
    addExportHistoryEntry({ id: nanoid(), timestamp: Date.now(), thumbnail, filename, imageCount: images.length })
  }

  // ────────────────────────────────────────────────────────────────────────────
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100dvh', background: '#0e0e1a', color: '#c8c8e8', overflow: 'hidden' }}>
      <Toaster position="bottom-right" toastOptions={{ style: { background: '#1a1a26', color: '#c8c8e8', border: '1px solid #252535' } }} />

      {showWelcome  && <WelcomeScreen onDismiss={dismissWelcome} />}
      {adminOpen    && <AdminPanel onClose={() => setAdminOpen(false)} />}
      {projectsOpen && <ProjectsPanel onClose={() => setProjectsOpen(false)} currentSnapshot={currentSnapshot} onLoadProject={handleLoadProject} />}

      {/* ── Arrange Panel ────────────────────────────────────────────────── */}
      {arrangeOpen && (
        <ArrangePanel
          images={[...images].sort((a, b) => (a.zIndex ?? 0) - (b.zIndex ?? 0))}
          onClose={() => setArrangeOpen(false)}
          onReorder={handleReorder}
        />
      )}

      {/* ── Export History Modal ──────────────────────────────────────────── */}
      {historyOpen && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 250, background: 'rgba(0,0,0,0.72)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          onClick={e => { if (e.target === e.currentTarget) closeHistory() }}>
          <div style={{ background: '#1a1a26', border: '1px solid #6c63ff55', borderRadius: '18px', padding: '28px 24px', width: 'min(94vw,520px)', maxHeight: '80vh', display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <h2 style={{ color: '#c8c8e8', fontSize: '17px', fontWeight: 700, margin: 0 }}>📁 Export History</h2>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                {exportHistory.length > 0 && (
                  <button onClick={() => { if (window.confirm('Clear all export history?')) clearExportHistoryStore() }}
                    style={{ background: 'none', border: '1px solid #333', color: '#888', fontSize: '12px', padding: '4px 10px', borderRadius: '6px', cursor: 'pointer' }}>Clear all</button>
                )}
                <button onClick={closeHistory} style={{ background: 'none', border: 'none', color: '#666', fontSize: '20px', cursor: 'pointer', lineHeight: 1 }}>✕</button>
              </div>
            </div>
            <div style={{ overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {exportHistory.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '40px 0', color: '#555', fontSize: '14px' }}>
                  No exports yet. Hit <strong style={{ color: '#6c63ff' }}>Export PNG</strong> to save your first collage.
                </div>
              ) : exportHistory.map(entry => (
                <div key={entry.id} style={{ display: 'flex', alignItems: 'center', gap: '14px', background: '#12121a', borderRadius: '10px', padding: '10px 12px', border: '1px solid #222' }}>
                  <div style={{ width: '54px', height: '36px', borderRadius: '6px', overflow: 'hidden', background: '#0d0d14', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {entry.thumbnail ? <img src={entry.thumbnail} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <span style={{ fontSize: '18px' }}>🖼️</span>}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ color: '#c8c8e8', fontSize: '13px', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{entry.filename}</div>
                    <div style={{ color: '#555', fontSize: '11px', marginTop: '2px' }}>{new Date(entry.timestamp).toLocaleString()} · {entry.imageCount} image{entry.imageCount !== 1 ? 's' : ''}</div>
                  </div>
                  <button onClick={() => removeExportHistoryEntry(entry.id)} style={{ background: 'none', border: 'none', color: '#444', fontSize: '16px', cursor: 'pointer', flexShrink: 0, padding: '4px' }} title="Remove">🗑</button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── Password Prompt ───────────────────────────────────────────────── */}
      {showPasswordPrompt && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 300, background: 'rgba(0,0,0,0.75)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          onClick={e => { if (e.target === e.currentTarget) setShowPasswordPrompt(false) }}>
          <div style={{ background: '#1a1a26', border: '1px solid #6c63ff', borderRadius: '16px', padding: '32px 28px', width: '320px', textAlign: 'center' }}>
            <div style={{ fontSize: '28px', marginBottom: '12px' }}>🔐</div>
            <h2 style={{ color: '#c8c8e8', fontSize: '18px', fontWeight: 700, marginBottom: '8px' }}>Admin Access</h2>
            <p style={{ color: '#666', fontSize: '13px', marginBottom: '20px' }}>Enter password to continue</p>
            <input autoFocus type="password" value={passwordInput}
              onChange={e => { setPasswordInput(e.target.value); setPasswordError(false) }}
              onKeyDown={e => e.key === 'Enter' && handlePasswordSubmit()}
              placeholder="Password"
              style={{ width: '100%', background: '#12121a', border: `1px solid ${passwordError ? '#ef4444' : '#333'}`, borderRadius: '8px', padding: '10px 14px', color: '#fff', fontSize: '14px', outline: 'none', marginBottom: '8px', boxSizing: 'border-box' }} />
            {passwordError && <p style={{ color: '#ef4444', fontSize: '12px', marginBottom: '8px' }}>Incorrect password</p>}
            <button onClick={handlePasswordSubmit}
              style={{ width: '100%', background: 'linear-gradient(135deg,#6c63ff,#a855f7)', border: 'none', borderRadius: '10px', padding: '11px', color: '#fff', fontWeight: 700, fontSize: '14px', cursor: 'pointer', marginTop: '4px' }}>
              Enter
            </button>
          </div>
        </div>
      )}

      {/* ── Diamond ticker ────────────────────────────────────────────────── */}
      {!diamondPopupOpen && (
        <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 50, background: 'linear-gradient(135deg,#a855f7,#6c63ff)', overflow: 'hidden', height: '36px', display: 'flex', alignItems: 'center' }}>
          <style>{`@keyframes ticker{0%{transform:translateX(100vw)}100%{transform:translateX(-100%)}} .ticker-text{display:inline-block;white-space:nowrap;animation:ticker 10s linear infinite;font-weight:700;font-size:14px;color:#fff;letter-spacing:.05em}`}</style>
          <span className="ticker-text" style={{ cursor: 'pointer' }}
            onClick={() => { setDiamondPopupOpen(true); window.history.pushState({ overlay: 'diamond' }, '') }}>
            💎 Recharge Diamonds Now &nbsp;&nbsp;&nbsp;&nbsp;&nbsp; 💎 Recharge Diamonds Now &nbsp;&nbsp;&nbsp;&nbsp;&nbsp; 💎 Recharge Diamonds Now
          </span>
        </div>
      )}

      {/* ── Diamond popup ─────────────────────────────────────────────────── */}
      {diamondPopupOpen && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(0,0,0,0.65)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          onClick={e => { if (e.target === e.currentTarget) setDiamondPopupOpen(false) }}>
          <div style={{ background: '#1a1a26', border: '1px solid #6c63ff', borderRadius: '16px', padding: '32px 28px', width: '340px', textAlign: 'center', position: 'relative' }}>
            <button onClick={() => setDiamondPopupOpen(false)} style={{ position: 'absolute', top: '12px', right: '14px', background: 'none', border: 'none', color: '#888', fontSize: '18px', cursor: 'pointer' }}>✕</button>
            <div style={{ fontSize: '40px', marginBottom: '12px' }}>💎</div>
            <h2 style={{ color: '#c8c8e8', fontSize: '20px', fontWeight: 700, margin: '0 0 8px' }}>Recharge Diamonds</h2>
            <p style={{ color: '#888', fontSize: '14px', margin: '0 0 24px' }}>Get diamonds to unlock premium collage features.</p>
            <a href="https://ryukofficial.in" target="_blank" rel="noopener noreferrer"
              style={{ display: 'block', background: 'linear-gradient(135deg,#a855f7,#6c63ff)', color: '#fff', fontWeight: 700, fontSize: '15px', padding: '12px 0', borderRadius: '10px', textDecoration: 'none', marginBottom: '10px' }}>
              Recharge Now →
            </a>
            <button onClick={() => setDiamondPopupOpen(false)}
              style={{ background: 'none', border: '1px solid #333', color: '#888', fontSize: '13px', padding: '8px 0', width: '100%', borderRadius: '8px', cursor: 'pointer' }}>
              Maybe later
            </button>
          </div>
        </div>
      )}

      <input ref={fileInputRef}    type="file" multiple accept="image/*" style={{ display: 'none' }} onChange={e => { if (e.target.files?.length) { handleFiles(e.target.files); e.target.value = '' } }} />
      <input ref={profileInputRef} type="file" accept="image/*"          style={{ display: 'none' }} onChange={handleProfileUpload} />

      {/* ── Sidebar backdrop ──────────────────────────────────────────────── */}
      {sidebarOpen && <div style={{ position: 'fixed', inset: 0, zIndex: 180, background: 'rgba(0,0,0,0.45)' }} onClick={() => setSidebarOpen(false)} />}

      {/* ── Sidebar ───────────────────────────────────────────────────────── */}
      <div style={{ position: 'fixed', top: 0, left: sidebarOpen ? 0 : '-260px', width: '240px', height: '100vh', zIndex: 190, background: '#13131f', borderRight: '1px solid #252535', display: 'flex', flexDirection: 'column', transition: 'left 0.28s cubic-bezier(0.4,0,0.2,1)', boxShadow: sidebarOpen ? '8px 0 40px rgba(0,0,0,0.6)' : 'none' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 18px 14px', borderBottom: '1px solid #1e1e2e' }}>
          <span style={{ fontWeight: 800, fontSize: '16px', background: 'linear-gradient(135deg,#6c63ff,#a855f7)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>Ryuk Creates</span>
          <button onClick={() => setSidebarOpen(false)} style={{ background: 'none', border: 'none', color: '#555', fontSize: '18px', cursor: 'pointer' }}>✕</button>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: '10px' }}>
          {[
            { icon: '🗂', label: 'Projects', sub: 'Manage saved collages', action: () => { setSidebarOpen(false); openProjects() } },
            { icon: '📁', label: 'Export History', sub: 'View past exports', action: () => { setSidebarOpen(false); openHistory() } },
          ].map(item => (
            <button key={item.label} onClick={item.action}
              style={{ display: 'flex', alignItems: 'center', gap: '12px', width: '100%', background: 'none', border: 'none', borderRadius: '10px', padding: '11px 12px', cursor: 'pointer', textAlign: 'left', transition: 'background 0.15s' }}
              onMouseEnter={e => e.currentTarget.style.background = '#1a1a2e'}
              onMouseLeave={e => e.currentTarget.style.background = 'none'}>
              <span style={{ fontSize: '20px' }}>{item.icon}</span>
              <div>
                <p style={{ margin: 0, fontSize: '13px', fontWeight: 600, color: '#c8c8e8' }}>{item.label}</p>
                <p style={{ margin: 0, fontSize: '11px', color: '#555' }}>{item.sub}</p>
              </div>
            </button>
          ))}
          <div style={{ height: '1px', background: '#1e1e2e', margin: '6px 4px' }} />
          <a href="https://wa.me/+918453899194" target="_blank" rel="noopener noreferrer"
            style={{ display: 'flex', alignItems: 'center', gap: '12px', borderRadius: '10px', padding: '11px 12px', textDecoration: 'none', transition: 'background 0.15s' }}
            onMouseEnter={e => e.currentTarget.style.background = '#1a1a2e'}
            onMouseLeave={e => e.currentTarget.style.background = 'none'}>
            <span style={{ fontSize: '20px' }}>💬</span>
            <div>
              <p style={{ margin: 0, fontSize: '13px', fontWeight: 600, color: '#c8c8e8' }}>Contact Developer</p>
              <p style={{ margin: 0, fontSize: '11px', color: '#555' }}>Chat on WhatsApp</p>
            </div>
          </a>
          <div style={{ height: '1px', background: '#1e1e2e', margin: '6px 4px' }} />
          <a href="https://www.whatsapp.com/channel/0029Vb7BZhZ7oQhVBdxFo73a" target="_blank" rel="noopener noreferrer"
            style={{ display: 'flex', alignItems: 'center', gap: '12px', borderRadius: '10px', padding: '11px 12px', textDecoration: 'none', transition: 'background 0.15s' }}
            onMouseEnter={e => e.currentTarget.style.background = '#1a1a2e'}
            onMouseLeave={e => e.currentTarget.style.background = 'none'}>
            <span style={{ fontSize: '20px' }}>🎮</span>
            <div>
              <p style={{ margin: 0, fontSize: '13px', fontWeight: 600, color: '#c8c8e8' }}>Buy MLBB Accounts</p>
              <p style={{ margin: 0, fontSize: '11px', color: '#25D366' }}>Browse on WhatsApp Channel</p>
            </div>
          </a>
        </div>
        <div style={{ padding: '14px 18px', borderTop: '1px solid #1e1e2e' }}>
          <p style={{ margin: 0, fontSize: '11px', color: '#333', textAlign: 'center' }}>Ryuk Creates © 2025</p>
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════════════════
          HEADER
      ══════════════════════════════════════════════════════════════════════ */}
      <header style={{ background: '#13131f', borderBottom: '1px solid #1e1e2e', flexShrink: 0 }}>

        {/* Row 1: Logo + primary actions */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 12px', gap: '8px' }}>
          <span style={{ fontWeight: 800, fontSize: '17px', background: 'linear-gradient(135deg,#6c63ff,#a855f7)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', cursor: 'pointer', flexShrink: 0 }}
            onClick={handleLogoClick}>
            Ryuk Creates
          </span>
          <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            <button style={btnPrimary} onClick={handleOpenHeroPicker}>+ Create</button>
            <HeroPicker onRegisterOpen={fn => { openHeroPicker.current = fn }} />
            <button style={btnPrimary} onClick={handleExport}>Export PNG</button>
          </div>
        </div>

        {/* Row 2: Secondary actions */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '0 12px 10px', flexWrap: 'wrap' }}>
          <button style={{ ...btnGhost, padding: '7px 10px' }} onClick={() => setSidebarOpen(o => !o)}>☰</button>
          <button style={btnGhost} onClick={undo}>↩</button>
          <button style={btnGhost} onClick={redo}>↪</button>
          <button style={btnGhost} onClick={clearAll}>🗑</button>

          {/* Arrange button */}
          <button
            style={images.length ? btnArrangeOn : { ...btnGhost, opacity: 0.4, cursor: 'not-allowed' }}
            onClick={handleOpenArrange}
          >
            ⠿ Arrange
          </button>

          {/* Upload */}
          <label style={{ ...btnGhost, cursor: 'pointer' }}>
            ⬆ Upload
            <input ref={fileInputRef} type="file" multiple accept="image/*" style={{ display: 'none' }}
              onChange={e => { if (e.target.files?.length) { handleFiles(e.target.files); e.target.value = '' } }} />
          </label>

          {/* Profile */}
          {!profileImage ? (
            <button style={{ ...btnGhost, color: '#6c63ff', border: '1px solid rgba(108,99,255,0.4)' }}
              onClick={() => profileInputRef.current?.click()}>
              + Profile
            </button>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', background: '#1a1a2e', border: '1px solid rgba(108,99,255,0.4)', borderRadius: '8px', padding: '5px 8px' }}>
              <img src={profileImage} alt="profile" style={{ width: '18px', height: '18px', borderRadius: '4px', objectFit: 'cover' }} />
              <span style={{ fontSize: '11px', color: '#6c63ff', maxWidth: '70px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{profileName}</span>
              <button onClick={handleRemoveProfile} style={{ background: 'none', border: 'none', color: '#888', fontSize: '12px', cursor: 'pointer', padding: 0, lineHeight: 1 }}>✕</button>
            </div>
          )}
        </div>
      </header>

      {/* ══════════════════════════════════════════════════════════════════════
          CANVAS AREA
      ══════════════════════════════════════════════════════════════════════ */}
      <div
        id="canvas-container"
        ref={containerRef}
        style={{ flex: 1, position: 'relative', overflow: 'hidden', background: '#1a1a26', marginBottom: '36px' }}
        onDragEnter={onDragEnter} onDragLeave={onDragLeave} onDragOver={onDragOver} onDrop={onDrop}
      >

        {isDragging && (
          <div style={{ position: 'absolute', inset: 0, zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(108,99,255,0.1)', border: '2px dashed #6c63ff' }}>
            <p style={{ color: '#6c63ff', fontSize: '20px', fontWeight: 600 }}>Drop images here</p>
          </div>
        )}

        {/* Empty state */}
        {!images.length && !isDragging && (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '14px', pointerEvents: 'none' }}>
            <div style={{ width: '72px', height: '72px', borderRadius: '20px', background: 'linear-gradient(135deg,#6c63ff22,#a855f722)', border: '1px solid #6c63ff33', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '32px' }}>🎨</div>
            <p style={{ color: '#c8c8e8', fontSize: '17px', fontWeight: 700, opacity: 0.4, margin: 0 }}>Your canvas is empty</p>
            <p style={{ color: '#555', fontSize: '12px', margin: 0, textAlign: 'center', lineHeight: 1.6, maxWidth: '220px' }}>
              Tap <span style={{ color: '#6c63ff', fontWeight: 600 }}>+ Create</span> to add skins, or <span style={{ color: '#6c63ff', fontWeight: 600 }}>Upload</span> your own images
            </p>
          </div>
        )}

        {/* Selection toolbar */}
        {hasSelection && (
          <div style={{ position: 'absolute', top: '10px', left: '50%', transform: 'translateX(-50%)', zIndex: 100, display: 'flex', alignItems: 'center', gap: '8px', background: '#13131f', border: '1px solid #6c63ff55', borderRadius: '10px', padding: '6px 12px', boxShadow: '0 4px 20px rgba(0,0,0,0.5)', whiteSpace: 'nowrap' }}>
            <span style={{ fontSize: '12px', color: '#888' }}>{selectedIds.length} selected</span>
            <div style={{ width: '1px', height: '16px', background: '#333' }} />
            <button onClick={removeSelected} style={{ display: 'flex', alignItems: 'center', gap: '5px', background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.35)', color: '#f87171', fontSize: '13px', fontWeight: 600, padding: '4px 10px', borderRadius: '7px', cursor: 'pointer' }}>🗑 Delete</button>
            <button onClick={clearSelection} style={{ background: 'none', border: 'none', color: '#666', fontSize: '16px', cursor: 'pointer', lineHeight: 1, padding: '2px 4px' }}>✕</button>
          </div>
        )}

        <Stage
          ref={stageRef}
          width={containerSize.width}
          height={containerSize.height}
          scaleX={stageScale} scaleY={stageScale}
          x={stagePos.x} y={stagePos.y}
          onWheel={handleWheel}
          onClick={e => { if (e.target === e.target.getStage()) clearSelection() }}
          style={{ background: 'transparent' }}
        >
          <Layer>
            {images.length > 0 && <Rect width={canvasSize.width} height={canvasSize.height} fill={backgroundColor} />}
            {[...images].sort((a, b) => (a.zIndex ?? 0) - (b.zIndex ?? 0)).map(img => (
              <CanvasImage
                key={img.id}
                img={img}
                isSelected={selectedIds.includes(img.id)}
                onSelect={selectImage}
              />
            ))}
          </Layer>
        </Stage>
      </div>
    </div>
  )
}
