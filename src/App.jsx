import React, { useRef, useState, useCallback, useEffect } from 'react'
import { Stage, Layer, Image as KonvaImage, Rect } from 'react-konva'
import { Toaster } from 'react-hot-toast'
import useStore from './store/useStore'
import { nanoid } from './store/nanoid'
import { useDrop } from './useDrop'
import { useKeyboard } from './useKeyboard'
import useImage from 'use-image'
import HeroPicker from './components/HeroPicker'
import AutoCollage from './components/AutoCollage'
import AdminPanel from './components/AdminPanel'
import WelcomeScreen, { useWelcome } from './components/WelcomeScreen'
import HomeGlass from './components/HomeGlass'
import ProjectsPanel from './components/ProjectsPanel'
import { Menu, Undo2, Redo2, Trash2, LayoutGrid, Upload, UserPlus, Plus, Sparkles, Download, X, Wallet } from 'lucide-react'
import WalletPanel from './components/WalletPanel'
import { useWallet, walletEnabled, AUTO_COLLAGE_PRICE, walletError } from './utils/wallet'
import { PRO_EXPORT_PRICE, makeEditingExport } from './utils/proExport'
import { autoSave, loadAutoSave, generateThumbnail } from './utils/projectManager'

const AUTO_HISTORY_KEY   = 'ryuk_autosave_history'
const AUTO_HISTORY_LIMIT = 10

// ── Theme + toolbar button styles ────────────────────────────────────────────
// One calm palette for the whole app: graphite surfaces, one blue accent.
const C = {
  bg: '#000000', surface: '#111113', raised: '#1c1c1e', border: '#2c2c2e', divider: '#232326',
  text: '#ffffff', text2: '#c7c7cc', text3: '#8e8e93', accent: '#ff3d77', danger: '#ef4444',
}
const btnBase = {
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
  height: '34px', padding: '0 12px', borderRadius: '8px',
  border: `1px solid ${C.border}`, background: C.raised, color: C.text,
  fontSize: '13px', fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap',
  lineHeight: 1, flexShrink: 0,
}
const btnPrimary   = { ...btnBase, background: C.accent, border: `1px solid ${C.accent}`, color: '#fff' }
const btnGhost     = { ...btnBase }
const btnIcon      = { ...btnBase, width: '34px', padding: 0 }
const btnArrangeOn = { ...btnBase }

function CanvasImage({ img, isSelected, onSelect }) {
  const [image] = useImage(img.src, 'anonymous') // ← add 'anonymous' for CORS
  const onSelectRef = useRef(onSelect)
  onSelectRef.current = onSelect
  const handleClick = useCallback(() => {
    onSelectRef.current(img.id)
  }, [img.id])
  const borderColor = isSelected ? '#ff3d77' : null

  // Build crop props only when crop data exists on the image
  const cropProps = (img.cropW && img.cropH) ? {
    crop: {
      x: img.cropX ?? 0,
      y: img.cropY ?? 0,
      width: img.cropW,
      height: img.cropH,
    },
    width: img.cropW,
    height: img.cropH,
  } : {
    width: img.naturalWidth,
    height: img.naturalHeight,
  }

  return (
    <KonvaImage
      image={image}
      x={img.x} y={img.y}
      {...cropProps}
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

// ── Arrange Panel (Grid Mode) ─────────────────────────────────────────────────
// Tap a skin to select it (yellow ring), tap another to swap them.
// Works smoothly with 200-300+ skins. Apply confirms the new order.
function ArrangePanel({ images, onClose, onReorder }) {
  const [order, setOrder] = useState(() =>
    [...images].sort((a, b) => (a.zIndex ?? 0) - (b.zIndex ?? 0))
  )
  const [selectedIdx, setSelectedIdx] = useState(null)
  const [search, setSearch] = useState('')

  useEffect(() => {
    setOrder([...images].sort((a, b) => (a.zIndex ?? 0) - (b.zIndex ?? 0)))
  }, [images])

  const handleTap = (i) => {
    if (selectedIdx === null) {
      // First tap — select this cell
      setSelectedIdx(i)
    } else if (selectedIdx === i) {
      // Tap same cell — deselect
      setSelectedIdx(null)
    } else {
      // Second tap — swap the two cells
      const next = [...order]
      ;[next[selectedIdx], next[i]] = [next[i], next[selectedIdx]]
      setOrder(next)
      setSelectedIdx(null)
    }
  }

  const moveToFirst = (i) => {
    const next = [...order]
    const [m] = next.splice(i, 1)
    setOrder([m, ...next])
    setSelectedIdx(null)
  }

  const handleApply = () => { onReorder([...order]); onClose() }

  // Filter for search (searches by name/index)
  const filtered = search.trim()
    ? order.map((img, i) => ({ img, i })).filter(({ img, i }) =>
        (img.name || `Image ${i+1}`).toLowerCase().includes(search.toLowerCase()) ||
        String(i + 1).includes(search)
      )
    : order.map((img, i) => ({ img, i }))

  const CELL = 80

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 250,
        background: 'rgba(0,0,0,0.82)',
        display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
      }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div style={{
        background: '#111113', borderRadius: '20px 20px 0 0',
        border: '1px solid #2c2c2e', borderBottom: 'none',
        width: '100%', maxWidth: '520px',
        maxHeight: '88vh', display: 'flex', flexDirection: 'column',
        boxShadow: '0 -4px 16px rgba(0,0,0,0.35)',
      }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px 10px', borderBottom: '1px solid #232326', flexShrink: 0 }}>
          <div>
            <p style={{ margin: 0, fontSize: '15px', fontWeight: 700, color: '#ffffff' }}>⠿ Arrange Order</p>
            <p style={{ margin: '2px 0 0', fontSize: '11px', color: '#8e8e93' }}>
              Tap to select · tap another to swap · {order.length} skins
            </p>
          </div>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <button onClick={handleApply}
              style={{ background: '#ff3d77', border: 'none', borderRadius: '8px', color: '#fff', fontSize: '13px', fontWeight: 700, padding: '7px 18px', cursor: 'pointer' }}>
              Apply
            </button>
            <button onClick={onClose}
              style={{ background: 'none', border: 'none', color: '#8e8e93', fontSize: '20px', cursor: 'pointer', lineHeight: 1, padding: '2px 6px' }}>✕</button>
          </div>
        </div>

        {/* Search bar */}
        <div style={{ padding: '10px 14px 6px', flexShrink: 0 }}>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder={`Search by name or number (1–${order.length})…`}
            style={{
              width: '100%', boxSizing: 'border-box',
              background: '#1c1c1e', border: '1px solid #2c2c2e',
              borderRadius: '8px', padding: '8px 12px',
              color: '#ffffff', fontSize: '13px', outline: 'none',
            }}
          />
        </div>

        {/* Selected item info bar */}
        {selectedIdx !== null && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '6px 14px', background: 'rgba(255,61,119,0.08)', borderTop: '1px solid rgba(255,61,119,0.2)', flexShrink: 0 }}>
            <img src={order[selectedIdx]?.src} alt="" style={{ width: '28px', height: '28px', borderRadius: '5px', objectFit: 'cover', border: '1px solid #2c2c2e' }} />
            <span style={{ flex: 1, fontSize: '12px', color: '#ff3d77', fontWeight: 600 }}>
              #{selectedIdx + 1} selected — tap another to swap, or tap it again to cancel
            </span>
            <button
              onClick={() => moveToFirst(selectedIdx)}
              style={{ background: 'rgba(255,61,119,0.2)', border: '1px solid rgba(255,61,119,0.4)', borderRadius: '6px', color: '#ff6b96', fontSize: '11px', fontWeight: 700, padding: '4px 8px', cursor: 'pointer' }}>
              → #1
            </button>
            <button onClick={() => setSelectedIdx(null)}
              style={{ background: 'none', border: 'none', color: '#8e8e93', fontSize: '16px', cursor: 'pointer', padding: '2px' }}>✕</button>
          </div>
        )}

        {/* Grid */}
        <div style={{ overflowY: 'auto', flex: 1, padding: '10px 12px 24px' }}>
          {order.length === 0 && (
            <p style={{ textAlign: 'center', color: '#8e8e93', fontSize: '13px', marginTop: '40px' }}>No images on canvas yet.</p>
          )}
          <div style={{
            display: 'grid',
            gridTemplateColumns: `repeat(auto-fill, minmax(${CELL}px, 1fr))`,
            gap: '8px',
          }}>
            {filtered.map(({ img, i }) => {
              const isSelected = selectedIdx === i
              const isFirst = i === 0
              const isLast  = i === order.length - 1
              const badgeColor = isFirst ? '#22c55e' : isLast ? '#ff3d77' : '#636366'
              const badgeBg    = isFirst ? 'rgba(34,197,94,0.18)' : isLast ? 'rgba(255,61,119,0.18)' : 'rgba(0,0,0,0.55)'
              const label      = isFirst ? '1st' : isLast ? 'Last' : `#${i + 1}`
              return (
                <div
                  key={img.id}
                  onClick={() => handleTap(i)}
                  style={{
                    position: 'relative',
                    width: '100%',
                    paddingBottom: '100%',
                    borderRadius: '10px',
                    overflow: 'hidden',
                    cursor: 'pointer',
                    border: isSelected
                      ? '2.5px solid #ff3d77'
                      : '2px solid #2c2c2e',
                    boxShadow: isSelected ? '0 0 0 3px rgba(255,61,119,0.25)' : 'none',
                    transition: 'border 0.12s, box-shadow 0.12s',
                    background: '#000000',
                    flexShrink: 0,
                  }}
                >
                  <img
                    src={img.src}
                    alt=""
                    style={{
                      position: 'absolute', inset: 0,
                      width: '100%', height: '100%',
                      objectFit: 'cover',
                      pointerEvents: 'none',
                    }}
                  />
                  {/* Overlay when selected */}
                  {isSelected && (
                    <div style={{
                      position: 'absolute', inset: 0,
                      background: 'rgba(255,61,119,0.15)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      <span style={{ fontSize: '22px' }}>✔</span>
                    </div>
                  )}
                  {/* Position badge */}
                  <div style={{
                    position: 'absolute', top: '4px', left: '4px',
                    background: badgeBg,
                    border: `1px solid ${badgeColor}`,
                    color: badgeColor,
                    fontSize: '9px', fontWeight: 800,
                    borderRadius: '4px', padding: '1px 4px',
                    lineHeight: 1.4,
                  }}>
                    {label}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}

// After a new version is deployed, a page that was already open can't load the
// old code pieces any more ("Importing a module script failed").
function isStaleModule(e) {
  return /module script|dynamically imported module|error loading dynamically|Failed to fetch/i.test(e?.message || '')
}

export default function App() {
  const stageRef        = useRef()
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
  const [arrangeOpen,       setArrangeOpen]        = useState(false)
  const [autoCollageOpen,   setAutoCollageOpen]    = useState(false)
  const [heroPickerOpen,    setHeroPickerOpen]     = useState(false)
  const [pickerMode,        setPickerMode]         = useState(null)
  const [exportMenuOpen,    setExportMenuOpen]     = useState(false)
  const [hdUpscaleOn,       setHdUpscaleOn]        = useState(() => { try { return localStorage.getItem('ryuk_hd_upscale') !== '0' } catch { return true } })
  const setHdUpscale = on => { setHdUpscaleOn(on); try { localStorage.setItem('ryuk_hd_upscale', on ? '1' : '0') } catch {} }
  const [walletOpen,        setWalletOpen]         = useState(null)    // null = closed, otherwise { reason }
  const wallet = useWallet()

  const logoClickCount = useRef(0)
  const logoClickTimer = useRef(null)

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

  const zoomFit = useStore(s => s.zoomFit)

  // ── Stage size: track canvas-container dimensions ───────────────────────────
  const [stageSize, setStageSize] = useState({ width: window.innerWidth, height: window.innerHeight })
  useEffect(() => {
    const container = document.getElementById('canvas-container')
    if (!container) return
    const ro = new ResizeObserver(entries => {
      const { width, height } = entries[0].contentRect
      setStageSize({ width, height })
    })
    ro.observe(container)
    // Set initial size
    setStageSize({ width: container.clientWidth, height: container.clientHeight })
    return () => ro.disconnect()
  }, [])

  // ── Fit canvas to screen on mount ──────────────────────────────────────────
  useEffect(() => {
    const timer = setTimeout(() => zoomFit(), 100)
    return () => clearTimeout(timer)
  }, [])

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
        style: { background: '#111113', color: '#ffffff', border: '1px solid #2c2c2e' },
      })
    })
  }, [])

  // ── Back button ─────────────────────────────────────────────────────────────
  useEffect(() => {
    const handlePopState = () => {
      if (arrangeOpen)         { setArrangeOpen(false);         return }
      if (projectsOpen)        { setProjectsOpen(false);        return }
      if (historyOpen)         { setHistoryOpen(false);         return }
      if (adminOpen)           { setAdminOpen(false);           return }
      if (diamondPopupOpen)    { setDiamondPopupOpen(false);    return }
      if (showWelcome)         { dismissWelcome();              return }
      if (hasSelection)        { clearSelection();              return }
    }
    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [arrangeOpen, projectsOpen, historyOpen, adminOpen, diamondPopupOpen, showWelcome, hasSelection, dismissWelcome, clearSelection])

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

  // Admin area: tap the name 3 times. Only accounts marked as admin in the
  // database get in (no password in the website code any more).
  const openAdmin = useCallback(() => {
    setAdminOpen(true)
    window.history.pushState({ overlay: 'admin' }, '')
  }, [])
  const handleLogoClick = useCallback(() => {
    logoClickCount.current += 1
    if (logoClickTimer.current) clearTimeout(logoClickTimer.current)
    logoClickTimer.current = setTimeout(() => { logoClickCount.current = 0 }, 800)
    if (logoClickCount.current >= 3) {
      logoClickCount.current = 0
      clearTimeout(logoClickTimer.current)
      if (!walletEnabled || wallet.admin) openAdmin()
      else setWalletOpen({ reason: 'Admin area: log in with the admin account, then tap the name 3 times again.' })
    }
  }, [wallet.admin, openAdmin])

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
  const handleExport = async (mode = 'normal') => {
    if (!images.length) return
    const paid = mode === 'editor'
    if (paid) {
      // locked behind the wallet: log in and have ₹50 first
      if (!wallet.user) { setWalletOpen({ reason: `Export for editing costs ₹${PRO_EXPORT_PRICE}. Log in or create an account first.` }); return }
      if ((wallet.balance ?? 0) < PRO_EXPORT_PRICE) { setWalletOpen({ reason: `Export for editing costs ₹${PRO_EXPORT_PRICE}. Add money to your wallet first.` }); return }
    }
    const toast    = (await import('react-hot-toast')).default
    const id       = toast.loading('Exporting collage...')
    let blob       = null
    const filename = `ryukcreates-${paid ? 'for-editing-' : ''}${Date.now()}.png`
    let hdNote = null
    try {
      const { exportCollage, downloadBlob } = await import('./utils/imageUtils')
      const sortedImages = [...images].sort((a, b) => (a.zIndex ?? 0) - (b.zIndex ?? 0))
      blob = await exportCollage(sortedImages, backgroundColor, profileImage || null, {
        maxCell: paid ? 1000 : 0,
        onProgress: (p) => toast.loading(`Exporting… ${Math.round(p * (paid ? 40 : 100))}%`, { id }),
      })
      if (paid) {
        const failedImgs = blob.failedImages
        try {
          blob = await makeEditingExport(blob, { onProgress: p => toast.loading(`Preparing for editing… ${Math.round(40 + p * 60)}%`, { id }) })
        } catch (err) {
          toast.error(walletError(err) + (err?.refunded ? ` Your ₹${PRO_EXPORT_PRICE} was refunded.` : ''), { id, duration: 7000 })
          return
        }
        blob.failedImages = failedImgs
        // HD upscale ×2 on this device (free); if the device can't, keep the export as is
        if (hdUpscaleOn) {
          // loaded inside the try: if it can't load (e.g. the site was just updated
          // while this page was open) the paid export still downloads, without HD
          let cancelHdUpscale = () => {}
          const stopBtn = <button onClick={() => cancelHdUpscale()} style={{ marginLeft: '8px', background: 'none', border: '1px solid #8e8e93', color: 'inherit', borderRadius: '6px', padding: '2px 8px', cursor: 'pointer' }}>Skip</button>
          try {
            toast.loading(<span>Enhancing (HD upscale)… starting{stopBtn}</span>, { id })
            const mod = await import('./utils/hdUpscale')
            cancelHdUpscale = mod.cancelHdUpscale
            const big = await mod.hdUpscale(blob, {
              onProgress: (p, minsLeft) => toast.loading(<span>Enhancing (HD upscale)… {Math.round(p * 100)}% · about {minsLeft} min left · keep this page open{stopBtn}</span>, { id }),
            })
            big.failedImages = failedImgs
            blob = big
          } catch (err) {
            const why = {
              no_webgpu: "This browser can't run HD upscale (it needs Chrome with WebGPU on a newer phone or computer).",
              too_slow: 'HD upscale would take too long on this device.',
              cancelled: 'HD upscale skipped.',
            }[err?.code] || (isStaleModule(err)
              ? 'The website was just updated, so HD couldn\'t load on this open page. Refresh the page to get HD next time.'
              : "HD upscale couldn't run on this device.")
            console.warn('[hd upscale]', err?.code || err?.message)
            hdNote = `${why} Your export (Ryuk effect + bigger logos) is downloading without it.`
          }
        }
      }
      downloadBlob(blob, filename)
      if (blob.failedImages && blob.failedImages.length) {
        toast.error(`Exported, but ${blob.failedImages.length} skin(s) couldn't load and are blank. Try exporting again.`, { id, duration: 6000 })
      } else if (hdNote) {
        toast.success(hdNote, { id, duration: 8000 })
      } else {
        toast.success(paid ? `Exported for editing (₹${PRO_EXPORT_PRICE}). Check your downloads.` : 'Exported! Check your downloads.', { id })
      }
    } catch (e) {
      if (isStaleModule(e)) {
        toast.error('The website was just updated. Refresh the page and export again.', { id, duration: 8000 }); return
      }
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
    <div style={{ display: 'flex', flexDirection: 'column', height: '100dvh', background: C.bg, color: C.text, overflow: 'hidden' }}>
      {!images.length && (
        <HomeGlass
          onAuto={() => setAutoCollageOpen(true)}
          onPick={() => { setPickerMode(null); setHeroPickerOpen(true) }}
          onTier={() => { setPickerMode('collection'); setHeroPickerOpen(true) }}
          onUpload={() => fileInputRef.current?.click()}
          onProjects={() => setProjectsOpen(true)}
          onWallet={walletEnabled ? () => setWalletOpen({}) : null}
          onMenu={() => setSidebarOpen(true)}
          onLogo={handleLogoClick}
          user={wallet.user}
          balance={wallet.balance}
          price={walletEnabled ? AUTO_COLLAGE_PRICE : null}
        />
      )}
      <Toaster position="bottom-right" toastOptions={{ style: { background: '#111113', color: '#ffffff', border: '1px solid #2c2c2e' } }} />

      {showWelcome  && <WelcomeScreen onDismiss={dismissWelcome} />}
      {adminOpen    && <AdminPanel onClose={() => setAdminOpen(false)} />}
      {projectsOpen && <ProjectsPanel onClose={() => setProjectsOpen(false)} currentSnapshot={currentSnapshot} onLoadProject={handleLoadProject} />}

      {/* ── Arrange Panel ────────────────────────────────────────────────── */}
      {autoCollageOpen && (
        <AutoCollage onClose={() => setAutoCollageOpen(false)} onOpenWallet={reason => setWalletOpen({ reason })} />
      )}

      {walletOpen && <WalletPanel reason={walletOpen.reason} onClose={() => setWalletOpen(null)} />}

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
          <div style={{ background: '#111113', border: '1px solid #2c2c2e', borderRadius: '18px', padding: '28px 24px', width: 'min(94vw,520px)', maxHeight: '80vh', display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <h2 style={{ color: '#ffffff', fontSize: '17px', fontWeight: 700, margin: 0 }}>📁 Export History</h2>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                {exportHistory.length > 0 && (
                  <button onClick={() => { if (window.confirm('Clear all export history?')) clearExportHistoryStore() }}
                    style={{ background: 'none', border: '1px solid #2c2c2e', color: '#c7c7cc', fontSize: '12px', padding: '4px 10px', borderRadius: '6px', cursor: 'pointer' }}>Clear all</button>
                )}
                <button onClick={closeHistory} style={{ background: 'none', border: 'none', color: '#8e8e93', fontSize: '20px', cursor: 'pointer', lineHeight: 1 }}>✕</button>
              </div>
            </div>
            <div style={{ overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {exportHistory.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '40px 0', color: '#8e8e93', fontSize: '14px' }}>
                  No exports yet. Hit <strong style={{ color: '#ff3d77' }}>Export PNG</strong> to save your first collage.
                </div>
              ) : exportHistory.map(entry => (
                <div key={entry.id} style={{ display: 'flex', alignItems: 'center', gap: '14px', background: '#1c1c1e', borderRadius: '10px', padding: '10px 12px', border: '1px solid #2c2c2e' }}>
                  <div style={{ width: '54px', height: '36px', borderRadius: '6px', overflow: 'hidden', background: '#000000', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {entry.thumbnail ? <img src={entry.thumbnail} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <span style={{ fontSize: '18px' }}>🖼️</span>}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ color: '#ffffff', fontSize: '13px', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{entry.filename}</div>
                    <div style={{ color: '#8e8e93', fontSize: '11px', marginTop: '2px' }}>{new Date(entry.timestamp).toLocaleString()} · {entry.imageCount} image{entry.imageCount !== 1 ? 's' : ''}</div>
                  </div>
                  <button onClick={() => removeExportHistoryEntry(entry.id)} style={{ background: 'none', border: 'none', color: '#636366', fontSize: '16px', cursor: 'pointer', flexShrink: 0, padding: '4px' }} title="Remove">🗑</button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── Diamond ticker ────────────────────────────────────────────────── */}
      {!diamondPopupOpen && (
        <button
          onClick={() => { setDiamondPopupOpen(true); window.history.pushState({ overlay: 'diamond' }, '') }}
          style={{ position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 50, height: '36px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', background: C.surface, border: 'none', borderTop: `1px solid ${C.divider}`, color: C.text2, fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}>
          💎 Recharge Diamonds <span style={{ color: C.accent }}>ryukofficial.in →</span>
        </button>
      )}

      {/* ── Diamond popup ─────────────────────────────────────────────────── */}
      {diamondPopupOpen && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(0,0,0,0.65)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          onClick={e => { if (e.target === e.currentTarget) setDiamondPopupOpen(false) }}>
          <div style={{ background: '#111113', border: '1px solid #2c2c2e', borderRadius: '16px', padding: '32px 28px', width: '340px', textAlign: 'center', position: 'relative' }}>
            <button onClick={() => setDiamondPopupOpen(false)} style={{ position: 'absolute', top: '12px', right: '14px', background: 'none', border: 'none', color: '#c7c7cc', fontSize: '18px', cursor: 'pointer' }}>✕</button>
            <div style={{ fontSize: '40px', marginBottom: '12px' }}>💎</div>
            <h2 style={{ color: '#ffffff', fontSize: '20px', fontWeight: 700, margin: '0 0 8px' }}>Recharge Diamonds</h2>
            <p style={{ color: '#c7c7cc', fontSize: '14px', margin: '0 0 24px' }}>Get diamonds to unlock premium collage features.</p>
            <a href="https://ryukofficial.in" target="_blank" rel="noopener noreferrer"
              style={{ display: 'block', background: '#ff3d77', color: '#fff', fontWeight: 700, fontSize: '15px', padding: '12px 0', borderRadius: '10px', textDecoration: 'none', marginBottom: '10px' }}>
              Recharge Now →
            </a>
            <button onClick={() => setDiamondPopupOpen(false)}
              style={{ background: 'none', border: '1px solid #2c2c2e', color: '#c7c7cc', fontSize: '13px', padding: '8px 0', width: '100%', borderRadius: '8px', cursor: 'pointer' }}>
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
      <div style={{ position: 'fixed', top: 0, left: sidebarOpen ? 0 : '-260px', width: '240px', height: '100vh', zIndex: 190, background: '#111113', borderRight: '1px solid #2c2c2e', display: 'flex', flexDirection: 'column', transition: 'left 0.28s cubic-bezier(0.4,0,0.2,1)', boxShadow: 'none' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 18px 14px', borderBottom: '1px solid #232326' }}>
          <span style={{ fontWeight: 700, fontSize: '16px', color: C.text }}>Ryuk Creates</span>
          <button onClick={() => setSidebarOpen(false)} style={{ background: 'none', border: 'none', color: '#8e8e93', fontSize: '18px', cursor: 'pointer' }}>✕</button>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: '10px' }}>
          {[
            { icon: '🗂', label: 'Projects', sub: 'Manage saved collages', action: () => { setSidebarOpen(false); openProjects() } },
            { icon: '📁', label: 'Export History', sub: 'View past exports', action: () => { setSidebarOpen(false); openHistory() } },
            ...(walletEnabled ? [{ icon: '💳', label: 'Wallet', sub: wallet.user ? `Balance ₹${wallet.balance ?? '…'}` : 'Log in or create an account', action: () => { setSidebarOpen(false); setWalletOpen({}) } }] : []),
            ...(wallet.admin ? [{ icon: '🛠', label: 'Admin panel', sub: 'Skin tiers', action: () => { setSidebarOpen(false); openAdmin() } }] : []),
          ].map(item => (
            <button key={item.label} onClick={item.action}
              style={{ display: 'flex', alignItems: 'center', gap: '12px', width: '100%', background: 'none', border: 'none', borderRadius: '10px', padding: '11px 12px', cursor: 'pointer', textAlign: 'left', transition: 'background 0.15s' }}
              onMouseEnter={e => e.currentTarget.style.background = '#1c1c1e'}
              onMouseLeave={e => e.currentTarget.style.background = 'none'}>
              <span style={{ fontSize: '20px' }}>{item.icon}</span>
              <div>
                <p style={{ margin: 0, fontSize: '13px', fontWeight: 600, color: '#ffffff' }}>{item.label}</p>
                <p style={{ margin: 0, fontSize: '11px', color: '#8e8e93' }}>{item.sub}</p>
              </div>
            </button>
          ))}
          <div style={{ height: '1px', background: '#232326', margin: '6px 4px' }} />
          <a href="https://wa.me/+918453899194" target="_blank" rel="noopener noreferrer"
            style={{ display: 'flex', alignItems: 'center', gap: '12px', borderRadius: '10px', padding: '11px 12px', textDecoration: 'none', transition: 'background 0.15s' }}
            onMouseEnter={e => e.currentTarget.style.background = '#1c1c1e'}
            onMouseLeave={e => e.currentTarget.style.background = 'none'}>
            <span style={{ fontSize: '20px' }}>💬</span>
            <div>
              <p style={{ margin: 0, fontSize: '13px', fontWeight: 600, color: '#ffffff' }}>Contact Developer</p>
              <p style={{ margin: 0, fontSize: '11px', color: '#8e8e93' }}>Chat on WhatsApp</p>
            </div>
          </a>
          <div style={{ height: '1px', background: '#232326', margin: '6px 4px' }} />
          <a href="https://www.whatsapp.com/channel/0029Vb7BZhZ7oQhVBdxFo73a" target="_blank" rel="noopener noreferrer"
            style={{ display: 'flex', alignItems: 'center', gap: '12px', borderRadius: '10px', padding: '11px 12px', textDecoration: 'none', transition: 'background 0.15s' }}
            onMouseEnter={e => e.currentTarget.style.background = '#1c1c1e'}
            onMouseLeave={e => e.currentTarget.style.background = 'none'}>
            <span style={{ fontSize: '20px' }}>🎮</span>
            <div>
              <p style={{ margin: 0, fontSize: '13px', fontWeight: 600, color: '#ffffff' }}>Buy MLBB Accounts</p>
              <p style={{ margin: 0, fontSize: '11px', color: '#25D366' }}>Browse on WhatsApp Channel</p>
            </div>
          </a>
        </div>
        <div style={{ padding: '14px 18px', borderTop: '1px solid #232326' }}>
          <p style={{ margin: 0, fontSize: '11px', color: '#2c2c2e', textAlign: 'center' }}>Ryuk Creates © 2025</p>
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════════════════
          HEADER
      ══════════════════════════════════════════════════════════════════════ */}
      <header style={{ background: C.surface, borderBottom: `1px solid ${C.divider}`, flexShrink: 0 }}>

        {/* Row 1: menu + name on the left, Export on the right */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 12px', gap: '8px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
            <button style={btnIcon} onClick={() => setSidebarOpen(o => !o)} aria-label="Menu" title="Menu"><Menu size={17} /></button>
            <span style={{ fontWeight: 700, fontSize: '16px', color: C.text, letterSpacing: '-0.01em', cursor: 'pointer', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
              onClick={handleLogoClick}>
              Ryuk Creates
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
            {walletEnabled && (
              <button style={btnGhost} onClick={() => setWalletOpen({})} aria-label="Wallet" title="Wallet">
                <Wallet size={16} />
                {wallet.user ? (wallet.balance == null ? '…' : `₹${wallet.balance.toLocaleString('en-IN')}`) : 'Log in'}
              </button>
            )}
            <div style={{ position: 'relative' }}>
              <button style={btnPrimary} onClick={() => setExportMenuOpen(o => !o)} aria-haspopup="menu" aria-expanded={exportMenuOpen}>
                <Download size={16} /> Export
              </button>
              {exportMenuOpen && (
                <>
                  <div onClick={() => setExportMenuOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 150 }} />
                  <div role="menu" style={{ position: 'absolute', right: 0, top: '40px', zIndex: 160, width: '240px', background: C.surface, border: `1px solid ${C.border}`, borderRadius: '12px', padding: '6px', boxShadow: '0 10px 30px rgba(0,0,0,0.5)' }}>
                    {[
                      { mode: 'normal', title: 'Export PNG', sub: 'Full quality, free' },
                      ...(walletEnabled ? [{ mode: 'editor', title: `🔒 Export for editing · ₹${PRO_EXPORT_PRICE}`, sub: hdUpscaleOn ? 'Ryuk effect + bigger logos + HD upscale ×2. Paid from your wallet' : 'Ryuk effect + bigger logos. Paid from your wallet' }] : []),
                    ].map(o => (
                      <button key={o.mode} role="menuitem" onClick={() => { setExportMenuOpen(false); handleExport(o.mode) }}
                        style={{ display: 'block', width: '100%', textAlign: 'left', background: 'none', border: 'none', borderRadius: '8px', padding: '10px 12px', color: C.text, cursor: 'pointer' }}>
                        <span style={{ display: 'block', fontSize: '14px', fontWeight: 700 }}>{o.title}</span>
                        <span style={{ display: 'block', fontSize: '12px', color: C.text3, marginTop: '2px' }}>{o.sub}</span>
                      </button>
                    ))}
                    {walletEnabled && (
                      <label style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 12px 10px', borderTop: `1px solid ${C.border}`, marginTop: '4px', fontSize: '12.5px', color: C.text2, cursor: 'pointer' }}>
                        <input type="checkbox" id="hd-upscale" checked={hdUpscaleOn} onChange={e => setHdUpscale(e.target.checked)} />
                        <span>HD upscale ×2 for “Export for editing” <span style={{ color: C.text3 }}>(free, done on your device)</span></span>
                      </label>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Row 2: everything for building the collage (wraps onto a second line on small phones) */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '0 12px 10px', flexWrap: 'wrap' }}>
          <HeroPicker open={heroPickerOpen} initialMode={pickerMode} onClose={() => { setHeroPickerOpen(false); setPickerMode(null) }} />
          {/* Add / Auto / Upload live on the home screen while the canvas is empty */}
          {images.length > 0 && (<>
            <button style={btnGhost} onClick={() => setHeroPickerOpen(true)}><Plus size={16} /> Add Skins</button>
            <button style={btnGhost} onClick={() => setAutoCollageOpen(true)}><Sparkles size={15} /> Auto</button>
            <button style={btnGhost} onClick={() => fileInputRef.current?.click()}><Upload size={15} /> Upload</button>
          </>)}

          {/* Profile */}
          {!profileImage ? (
            <button style={btnGhost} onClick={() => profileInputRef.current?.click()}>
              <UserPlus size={15} /> Profile
            </button>
          ) : (
            <div style={{ ...btnBase, cursor: 'default', gap: '6px', padding: '0 8px' }}>
              <img src={profileImage} alt="profile" style={{ width: '20px', height: '20px', borderRadius: '4px', objectFit: 'cover' }} />
              <span style={{ fontSize: '12px', color: C.text2, maxWidth: '80px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{profileName}</span>
              <button onClick={handleRemoveProfile} aria-label="Remove profile" style={{ background: 'none', border: 'none', color: C.text3, cursor: 'pointer', padding: 0, display: 'flex' }}><X size={14} /></button>
            </div>
          )}

          {/* Arrange */}
          {images.length > 0 && (
            <button style={btnArrangeOn} onClick={handleOpenArrange}>
              <LayoutGrid size={15} /> Arrange
            </button>
          )}

          <button style={btnIcon} onClick={undo} aria-label="Undo" title="Undo"><Undo2 size={16} /></button>
          <button style={btnIcon} onClick={redo} aria-label="Redo" title="Redo"><Redo2 size={16} /></button>
          {images.length > 0 && <button style={{ ...btnIcon, color: C.danger }} onClick={clearAll} aria-label="Clear canvas" title="Clear canvas"><Trash2 size={16} /></button>}
        </div>
      </header>

      {/* ══════════════════════════════════════════════════════════════════════
          CANVAS AREA
      ══════════════════════════════════════════════════════════════════════ */}
      <div id="canvas-container" style={{ flex: 1, position: 'relative', overflow: 'hidden', background: C.bg, marginBottom: '36px' }}
        onDragEnter={onDragEnter} onDragLeave={onDragLeave} onDragOver={onDragOver} onDrop={onDrop}>

        {isDragging && (
          <div style={{ position: 'absolute', inset: 0, zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(255,61,119,0.1)', border: '2px dashed #ff3d77' }}>
            <p style={{ color: '#ff3d77', fontSize: '20px', fontWeight: 600 }}>Drop images here</p>
          </div>
        )}


        {/* Selection toolbar */}
        {hasSelection && (
          <div style={{ position: 'absolute', top: '10px', left: '50%', transform: 'translateX(-50%)', zIndex: 100, display: 'flex', alignItems: 'center', gap: '8px', background: '#111113', border: '1px solid #2c2c2e', borderRadius: '10px', padding: '6px 12px', boxShadow: '0 4px 20px rgba(0,0,0,0.5)', whiteSpace: 'nowrap' }}>
            <span style={{ fontSize: '12px', color: '#c7c7cc' }}>{selectedIds.length} selected</span>
            <div style={{ width: '1px', height: '16px', background: '#2c2c2e' }} />
            <button onClick={removeSelected} style={{ display: 'flex', alignItems: 'center', gap: '5px', background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.35)', color: '#f87171', fontSize: '13px', fontWeight: 600, padding: '4px 10px', borderRadius: '7px', cursor: 'pointer' }}>🗑 Delete</button>
            <button onClick={clearSelection} style={{ background: 'none', border: 'none', color: '#8e8e93', fontSize: '16px', cursor: 'pointer', lineHeight: 1, padding: '2px 4px' }}>✕</button>
          </div>
        )}

        <Stage
          ref={stageRef}
          width={stageSize.width}
          height={stageSize.height}
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
