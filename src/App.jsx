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
const AUTO_HISTORY_LIMIT = 10   // keep last N auto-save snapshots

function CanvasImage({ img, isSelected, onSelect, isSwapFirst }) {
  const [image] = useImage(img.src)
  const strokeColor = isSwapFirst ? '#f97316' : isSelected ? '#6c63ff' : undefined
  const strokeWidth = (isSwapFirst || isSelected) ? 2 : 0
  return (
    <KonvaImage
      image={image}
      x={img.x}
      y={img.y}
      width={img.naturalWidth}
      height={img.naturalHeight}
      scaleX={img.scaleX}
      scaleY={img.scaleY}
      rotation={img.rotation}
      opacity={img.opacity}
      onClick={() => onSelect(img.id)}
      onTap={() => onSelect(img.id)}
      stroke={strokeColor}
      strokeWidth={strokeWidth}
      strokeScaleEnabled={false}
      hitStrokeWidth={0}
      perfectDrawEnabled={false}
    />
  )
}

export default function App() {
  const stageRef        = useRef()
  const fileInputRef    = useRef()
  const profileInputRef = useRef()

  const [profileImage, setProfileImage] = useState(null)
  const [profileName,  setProfileName]  = useState('')
  const [diamondPopupOpen, setDiamondPopupOpen] = useState(false)
  const [historyOpen, setHistoryOpen]   = useState(false)
  const [sidebarOpen, setSidebarOpen]   = useState(false)
  const [swapMode, setSwapMode]         = useState(false)
  const [swapFirst, setSwapFirst]       = useState(null)

  // ── Projects panel ─────────────────────────────────────────
  const [projectsOpen, setProjectsOpen] = useState(false)

  // ── Welcome screen ─────────────────────────────────────────
  const { show: showWelcome, dismiss: dismissWelcome } = useWelcome()

  // ── Admin panel state ──────────────────────────────────────
  const [adminOpen, setAdminOpen] = useState(false)
  const [showPasswordPrompt, setShowPasswordPrompt] = useState(false)
  const [passwordInput, setPasswordInput] = useState('')
  const [passwordError, setPasswordError] = useState(false)
  const logoClickCount = useRef(0)
  const logoClickTimer = useRef(null)

  const ADMIN_PASSWORD = 'ryuk2025'

  const handleLogoClick = useCallback(() => {
    logoClickCount.current += 1
    if (logoClickTimer.current) clearTimeout(logoClickTimer.current)
    logoClickTimer.current = setTimeout(() => {
      logoClickCount.current = 0
    }, 800)
    if (logoClickCount.current >= 3) {
      logoClickCount.current = 0
      clearTimeout(logoClickTimer.current)
      setShowPasswordPrompt(true)
      setPasswordInput('')
      setPasswordError(false)
      window.history.pushState({ overlay: 'password' }, '')
    }
  }, [])

  const handlePasswordSubmit = () => {
    if (passwordInput === ADMIN_PASSWORD) {
      setShowPasswordPrompt(false)
      setAdminOpen(true)
      setPasswordError(false)
      window.history.pushState({ overlay: 'admin' }, '')
    } else {
      setPasswordError(true)
      setPasswordInput('')
    }
  }

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
  const setBackgroundColor = useStore(s => s.setBackgroundColor)
  const swapImages      = useStore(s => s.swapImages)

  // ── Export history store ───────────────────────────────────
  const exportHistory            = useStore(s => s.exportHistory)
  const addExportHistoryEntry    = useStore(s => s.addExportHistoryEntry)
  const removeExportHistoryEntry = useStore(s => s.removeExportHistoryEntry)
  const clearExportHistoryStore  = useStore(s => s.clearExportHistoryStore)

  // ── Make Konva canvas transparent so container bg shows through ──
  useEffect(() => {
    if (!stageRef.current) return
    const canvas = stageRef.current.container().querySelector('canvas')
    if (canvas) canvas.style.background = 'transparent'
  })

  const openHeroPicker = useRef(null)

  const handleOpenHeroPicker = useCallback(() => {
    if (openHeroPicker.current) openHeroPicker.current()
  }, [])

  const { isDragging, handleFiles, onDragEnter, onDragLeave, onDragOver, onDrop } = useDrop()
  useKeyboard()

  // ── Auto-save: write on every images/backgroundColor change ─
  // Debounced 2s so rapid edits don't hammer localStorage
  const autoSaveTimer = useRef(null)
  useEffect(() => {
    if (!images.length) return   // nothing to save yet
    clearTimeout(autoSaveTimer.current)
    autoSaveTimer.current = setTimeout(async () => {
      const snapshot = { images, backgroundColor, canvasSize, stageScale, stagePos }
      // silent auto-save (latest)
      autoSave(snapshot)
      // also push to auto-save history ring buffer
      try {
        const thumbnail = await generateThumbnail(images, backgroundColor)
        const raw       = localStorage.getItem(AUTO_HISTORY_KEY)
        const history   = raw ? JSON.parse(raw) : []
        history.unshift({ savedAt: Date.now(), imageCount: images.length, thumbnail, snapshot })
        if (history.length > AUTO_HISTORY_LIMIT) history.splice(AUTO_HISTORY_LIMIT)
        localStorage.setItem(AUTO_HISTORY_KEY, JSON.stringify(history))
      } catch {}
    }, 2000)
    return () => clearTimeout(autoSaveTimer.current)
  }, [images, backgroundColor])

  // ── Session restore toast (show once per browser session only) ──
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

  // ── Load a saved project snapshot onto the canvas ──────────
  const handleLoadProject = useCallback((snapshot) => {
    if (!snapshot) return
    if (snapshot.images)      setImages(snapshot.images)
    if (snapshot.backgroundColor) setBackgroundColor(snapshot.backgroundColor)
    clearSelection()
  }, [setImages, setBackgroundColor, clearSelection])

  // ── Current snapshot (passed to ProjectsPanel for saving) ──
  const currentSnapshot = { images, backgroundColor, canvasSize, stageScale, stagePos }

  // ── Device back button handling ────────────────────────────
  const hasSelection = selectedIds.length > 0

  useEffect(() => {
    const handlePopState = () => {
      if (projectsOpen)       { setProjectsOpen(false);       return }
      if (historyOpen)        { setHistoryOpen(false);        return }
      if (showPasswordPrompt) { setShowPasswordPrompt(false); return }
      if (adminOpen)          { setAdminOpen(false);          return }
      if (diamondPopupOpen)   { setDiamondPopupOpen(false);   return }
      if (showWelcome)        { dismissWelcome();              return }
      if (hasSelection)       { clearSelection();              return }
    }
    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [projectsOpen, historyOpen, showPasswordPrompt, adminOpen, diamondPopupOpen, showWelcome, hasSelection, dismissWelcome, clearSelection])

  const openProjects = () => {
    window.history.pushState({ overlay: 'projects' }, '')
    setProjectsOpen(true)
  }

  const openHistory = () => {
    window.history.pushState({ overlay: 'history' }, '')
    setHistoryOpen(true)
  }
  const closeHistory = () => setHistoryOpen(false)

  const handleProfileUpload = (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    const url = URL.createObjectURL(file)
    setProfileImage(url)
    setProfileName(file.name)
    e.target.value = ''
  }

  const handleRemoveProfile = () => {
    if (profileImage) URL.revokeObjectURL(profileImage)
    setProfileImage(null)
    setProfileName('')
  }

  const handleSwapTap = (id) => {
    if (!swapFirst) {
      setSwapFirst(id)
      selectImage(id)
    } else if (swapFirst === id) {
      // tapped same skin — deselect
      setSwapFirst(null)
      clearSelection()
    } else {
      saveSnapshot()
      swapImages(swapFirst, id)
      setSwapFirst(null)
    }
  }

  const exitSwapMode = () => {
    setSwapMode(false)
    setSwapFirst(null)
    clearSelection()
  }

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
    setStagePos({
      x: pointer.x - mousePointTo.x * newScale,
      y: pointer.y - mousePointTo.y * newScale,
    })
  }

  const handleExport = async () => {
    if (!images.length) return
    const toast = (await import('react-hot-toast')).default
    const id = toast.loading('Exporting collage...')
    let blob = null
    let filename = `ryukcreates-${Date.now()}.png`

    try {
      const { exportCollage, downloadBlob } = await import('./utils/imageUtils')
      blob = await exportCollage(images, backgroundColor, profileImage || null)
      downloadBlob(blob, filename)
      toast.success('Exported! Check your downloads.', { id })
    } catch (e) {
      toast.error('Export failed: ' + e.message, { id })
      return
    }

    let thumbnail = null
    try {
      const bmp = await createImageBitmap(blob)
      const tw  = 160
      const th  = Math.round((bmp.height / bmp.width) * tw)
      const tc  = document.createElement('canvas')
      tc.width  = tw
      tc.height = th
      tc.getContext('2d').drawImage(bmp, 0, 0, tw, th)
      thumbnail = tc.toDataURL('image/jpeg', 0.6)
    } catch {}

    addExportHistoryEntry({
      id:         nanoid(),
      timestamp:  Date.now(),
      thumbnail,
      filename,
      imageCount: images.length,
    })
  }

  return (
    <div className="flex flex-col h-screen bg-void text-text overflow-hidden">
      <Toaster position="bottom-right" toastOptions={{ style: { background: '#1a1a26', color: '#c8c8e8', border: '1px solid #252535' } }} />

      {/* ── Welcome Screen ───────────────────────────────────── */}
      {showWelcome && <WelcomeScreen onDismiss={dismissWelcome} />}

      {/* ── Admin Panel ──────────────────────────────────────── */}
      {adminOpen && <AdminPanel onClose={() => setAdminOpen(false)} />}

      {/* ── Projects Panel ───────────────────────────────────── */}
      {projectsOpen && (
        <ProjectsPanel
          onClose={() => setProjectsOpen(false)}
          currentSnapshot={currentSnapshot}
          onLoadProject={handleLoadProject}
        />
      )}

      {/* ── Export History Modal ─────────────────────────────── */}
      {historyOpen && (
        <div
          style={{
            position: 'fixed', inset: 0, zIndex: 250,
            background: 'rgba(0,0,0,0.72)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
          onClick={e => { if (e.target === e.currentTarget) closeHistory() }}
        >
          <div style={{
            background: '#1a1a26', border: '1px solid #6c63ff55',
            borderRadius: '18px', padding: '28px 24px',
            width: 'min(94vw, 520px)', maxHeight: '80vh',
            display: 'flex', flexDirection: 'column', gap: '16px',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <h2 style={{ color: '#c8c8e8', fontSize: '17px', fontWeight: 700, margin: 0 }}>
                📁 Export History
              </h2>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                {exportHistory.length > 0 && (
                  <button
                    onClick={() => { if (window.confirm('Clear all export history?')) clearExportHistoryStore() }}
                    style={{
                      background: 'none', border: '1px solid #333', color: '#888',
                      fontSize: '12px', padding: '4px 10px', borderRadius: '6px', cursor: 'pointer',
                    }}
                  >Clear all</button>
                )}
                <button onClick={closeHistory} style={{
                  background: 'none', border: 'none', color: '#666',
                  fontSize: '20px', cursor: 'pointer', lineHeight: 1,
                }}>✕</button>
              </div>
            </div>
            <div style={{ overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {exportHistory.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '40px 0', color: '#555', fontSize: '14px' }}>
                  No exports yet. Hit <strong style={{ color: '#6c63ff' }}>Export PNG</strong> to save your first collage.
                </div>
              ) : (
                exportHistory.map(entry => (
                  <div key={entry.id} style={{
                    display: 'flex', alignItems: 'center', gap: '14px',
                    background: '#12121a', borderRadius: '10px', padding: '10px 12px',
                    border: '1px solid #222',
                  }}>
                    <div style={{
                      width: '54px', height: '36px', borderRadius: '6px', overflow: 'hidden',
                      background: '#0d0d14', flexShrink: 0,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      {entry.thumbnail
                        ? <img src={entry.thumbnail} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        : <span style={{ fontSize: '18px' }}>🖼️</span>
                      }
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{
                        color: '#c8c8e8', fontSize: '13px', fontWeight: 600,
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      }}>
                        {entry.filename}
                      </div>
                      <div style={{ color: '#555', fontSize: '11px', marginTop: '2px' }}>
                        {new Date(entry.timestamp).toLocaleString()} · {entry.imageCount} image{entry.imageCount !== 1 ? 's' : ''}
                      </div>
                    </div>
                    <button
                      onClick={() => removeExportHistoryEntry(entry.id)}
                      style={{
                        background: 'none', border: 'none', color: '#444',
                        fontSize: '16px', cursor: 'pointer', flexShrink: 0, padding: '4px',
                      }}
                      title="Remove from history"
                    >🗑</button>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Password Prompt ───────────────────────────────────── */}
      {showPasswordPrompt && (
        <div
          style={{
            position: 'fixed', inset: 0, zIndex: 300,
            background: 'rgba(0,0,0,0.75)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
          onClick={e => { if (e.target === e.currentTarget) setShowPasswordPrompt(false) }}
        >
          <div style={{
            background: '#1a1a26', border: '1px solid #6c63ff',
            borderRadius: '16px', padding: '32px 28px', width: '320px', textAlign: 'center',
          }}>
            <div style={{ fontSize: '28px', marginBottom: '12px' }}>🔐</div>
            <h2 style={{ color: '#c8c8e8', fontSize: '18px', fontWeight: 700, marginBottom: '8px' }}>Admin Access</h2>
            <p style={{ color: '#666', fontSize: '13px', marginBottom: '20px' }}>Enter password to continue</p>
            <input
              autoFocus
              type="password"
              value={passwordInput}
              onChange={e => { setPasswordInput(e.target.value); setPasswordError(false) }}
              onKeyDown={e => e.key === 'Enter' && handlePasswordSubmit()}
              placeholder="Password"
              style={{
                width: '100%', background: '#12121a', border: `1px solid ${passwordError ? '#ef4444' : '#333'}`,
                borderRadius: '8px', padding: '10px 14px', color: '#fff', fontSize: '14px',
                outline: 'none', marginBottom: '8px',
              }}
            />
            {passwordError && (
              <p style={{ color: '#ef4444', fontSize: '12px', marginBottom: '8px' }}>Incorrect password</p>
            )}
            <button
              onClick={handlePasswordSubmit}
              style={{
                width: '100%', background: 'linear-gradient(135deg, #6c63ff, #a855f7)',
                border: 'none', borderRadius: '10px', padding: '11px',
                color: '#fff', fontWeight: 700, fontSize: '14px', cursor: 'pointer', marginTop: '4px',
              }}
            >
              Enter
            </button>
          </div>
        </div>
      )}

      {/* ── Diamond ticker ─────────────────────────────────────── */}
      {!diamondPopupOpen && (
        <div style={{
          position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 50,
          background: 'linear-gradient(135deg, #a855f7, #6c63ff)',
          overflow: 'hidden', height: '40px', display: 'flex', alignItems: 'center',
        }}>
          <style>{`
            @keyframes ticker { 0% { transform: translateX(100vw); } 100% { transform: translateX(-100%); } }
            .ticker-text { display: inline-block; white-space: nowrap; animation: ticker 10s linear infinite;
              font-weight: 700; font-size: 15px; color: #fff; letter-spacing: 0.05em; }
          `}</style>
          <span
            className="ticker-text"
            style={{ cursor: 'pointer' }}
            onClick={() => {
              setDiamondPopupOpen(true)
              window.history.pushState({ overlay: 'diamond' }, '')
            }}
          >
            💎 Recharge Diamonds Now &nbsp;&nbsp;&nbsp;&nbsp;&nbsp; 💎 Recharge Diamonds Now &nbsp;&nbsp;&nbsp;&nbsp;&nbsp; 💎 Recharge Diamonds Now
          </span>
        </div>
      )}

      {/* ── Diamond popup ──────────────────────────────────────── */}
      {diamondPopupOpen && (
        <div
          style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(0,0,0,0.65)',
            display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          onClick={e => { if (e.target === e.currentTarget) setDiamondPopupOpen(false) }}
        >
          <div style={{ background: '#1a1a26', border: '1px solid #6c63ff', borderRadius: '16px',
            padding: '32px 28px', width: '340px', textAlign: 'center', position: 'relative' }}>
            <button onClick={() => setDiamondPopupOpen(false)} style={{
              position: 'absolute', top: '12px', right: '14px', background: 'none',
              border: 'none', color: '#888', fontSize: '18px', cursor: 'pointer', lineHeight: 1,
            }}>✕</button>
            <div style={{ fontSize: '40px', marginBottom: '12px' }}>💎</div>
            <h2 style={{ color: '#c8c8e8', fontSize: '20px', fontWeight: 700, margin: '0 0 8px' }}>Recharge Diamonds</h2>
            <p style={{ color: '#888', fontSize: '14px', margin: '0 0 24px' }}>Get diamonds to unlock premium collage features.</p>
            <a href="https://ryukofficial.in" target="_blank" rel="noopener noreferrer" style={{
              display: 'block', background: 'linear-gradient(135deg, #a855f7, #6c63ff)',
              color: '#fff', fontWeight: 700, fontSize: '15px', padding: '12px 0',
              borderRadius: '10px', textDecoration: 'none', marginBottom: '10px',
            }}>Recharge Now →</a>
            <button onClick={() => setDiamondPopupOpen(false)} style={{
              background: 'none', border: '1px solid #333', color: '#888', fontSize: '13px',
              padding: '8px 0', width: '100%', borderRadius: '8px', cursor: 'pointer',
            }}>Maybe later</button>
          </div>
        </div>
      )}

      <input ref={profileInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleProfileUpload} />

      {/* ── Sidebar overlay backdrop ──────────────────────────── */}
      {sidebarOpen && (
        <div
          style={{ position: 'fixed', inset: 0, zIndex: 180, background: 'rgba(0,0,0,0.45)' }}
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* ── Sidebar ──────────────────────────────────────────── */}
      <div style={{
        position: 'fixed',
        top: 0,
        left: sidebarOpen ? 0 : '-260px',
        width: '240px',
        height: '100vh',
        zIndex: 190,
        background: '#13131f',
        borderRight: '1px solid #252535',
        display: 'flex',
        flexDirection: 'column',
        transition: 'left 0.28s cubic-bezier(0.4,0,0.2,1)',
        boxShadow: sidebarOpen ? '8px 0 40px rgba(0,0,0,0.6)' : 'none',
        padding: '0',
      }}>
        {/* Sidebar header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '16px 18px 14px',
          borderBottom: '1px solid #1e1e2e',
        }}>
          <span style={{
            fontWeight: 800, fontSize: '16px',
            background: 'linear-gradient(135deg, #6c63ff, #a855f7)',
            WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
            letterSpacing: '0.02em',
          }}>
            Ryuk Creates
          </span>
          <button
            onClick={() => setSidebarOpen(false)}
            style={{ background: 'none', border: 'none', color: '#555', fontSize: '18px', cursor: 'pointer', lineHeight: 1, padding: '2px 4px' }}
          >✕</button>
        </div>

        {/* Sidebar items */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '10px 10px' }}>

          {/* Projects */}
          <button
            onClick={() => { setSidebarOpen(false); openProjects() }}
            style={{
              display: 'flex', alignItems: 'center', gap: '12px',
              width: '100%', background: 'none', border: 'none',
              borderRadius: '10px', padding: '11px 12px', cursor: 'pointer',
              textAlign: 'left', transition: 'background 0.15s',
              color: '#c8c8e8',
            }}
            onMouseEnter={e => e.currentTarget.style.background = '#1a1a2e'}
            onMouseLeave={e => e.currentTarget.style.background = 'none'}
          >
            <span style={{ fontSize: '20px' }}>🗂</span>
            <div>
              <p style={{ margin: 0, fontSize: '13px', fontWeight: 600, color: '#c8c8e8' }}>Projects</p>
              <p style={{ margin: 0, fontSize: '11px', color: '#555' }}>Manage saved collages</p>
            </div>
          </button>

          {/* Divider */}
          <div style={{ height: '1px', background: '#1e1e2e', margin: '6px 4px' }} />

          {/* Contact Developer */}
          <a
            href="https://wa.me/+918453899194"
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: 'flex', alignItems: 'center', gap: '12px',
              borderRadius: '10px', padding: '11px 12px', cursor: 'pointer',
              textDecoration: 'none', transition: 'background 0.15s',
            }}
            onMouseEnter={e => e.currentTarget.style.background = '#1a1a2e'}
            onMouseLeave={e => e.currentTarget.style.background = 'none'}
          >
            <span style={{ fontSize: '20px' }}>💬</span>
            <div>
              <p style={{ margin: 0, fontSize: '13px', fontWeight: 600, color: '#c8c8e8' }}>Contact Developer</p>
              <p style={{ margin: 0, fontSize: '11px', color: '#555' }}>Chat on WhatsApp</p>
            </div>
          </a>

          {/* Divider */}
          <div style={{ height: '1px', background: '#1e1e2e', margin: '6px 4px' }} />

          {/* Buy MLBB Accounts */}
          <a
            href="https://www.whatsapp.com/channel/0029Vb7BZhZ7oQhVBdxFo73a?fbclid=PAT01DUASCSQJleHRuA2FlbQIxMABzcnRjBmFwcF9pZA81NjcwNjczNDMzNTI0MjcAAaftojPvLOq9dat9Kskjv451MI1zY98jDFGT2rEZQkNSjC7LLWSe3h8G5-nNow_aem_bfpEVaxKSi_wv74yn0fCWg"
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: 'flex', alignItems: 'center', gap: '12px',
              borderRadius: '10px', padding: '11px 12px', cursor: 'pointer',
              textDecoration: 'none', transition: 'background 0.15s',
            }}
            onMouseEnter={e => e.currentTarget.style.background = '#1a1a2e'}
            onMouseLeave={e => e.currentTarget.style.background = 'none'}
          >
            <span style={{ fontSize: '20px' }}>🎮</span>
            <div>
              <p style={{ margin: 0, fontSize: '13px', fontWeight: 600, color: '#c8c8e8' }}>Buy MLBB Accounts</p>
              <p style={{ margin: 0, fontSize: '11px', color: '#25D366' }}>Browse on WhatsApp Channel</p>
            </div>
          </a>
        </div>

        {/* Sidebar footer */}
        <div style={{ padding: '14px 18px', borderTop: '1px solid #1e1e2e' }}>
          <p style={{ margin: 0, fontSize: '11px', color: '#333', textAlign: 'center' }}>Ryuk Creates © 2025</p>
        </div>
      </div>

      <header className="bg-panel border-b border-border shrink-0">
        <div className="flex items-center justify-between px-4 py-2">
          {/* Left: logo only */}
          <span
            className="font-display font-bold text-lg text-gradient shrink-0 cursor-pointer select-none"
            onClick={handleLogoClick}
            title="Ryuk Creates"
          >
            Ryuk Creates
          </span>

          {/* Right: action buttons */}
          <div className="flex gap-2 items-center flex-wrap">
            <button
              className="btn-primary text-sm px-3"
              onClick={handleOpenHeroPicker}
              title="Create collage"
            >
              + Create
            </button>
            <HeroPicker onRegisterOpen={fn => { openHeroPicker.current = fn }} />
            <button className="btn-primary text-sm px-3" onClick={handleExport}>Export PNG</button>
          </div>
        </div>

        <div className="flex items-center justify-between px-4 pb-2 flex-wrap gap-2">
          {/* Left: sidebar toggle */}
          <button
            onClick={() => setSidebarOpen(o => !o)}
            title="Menu"
            style={{
              background: sidebarOpen ? '#1a1a2e' : 'none',
              border: '1px solid #252535',
              borderRadius: '8px',
              color: '#c8c8e8',
              fontSize: '16px',
              cursor: 'pointer',
              padding: '4px 9px',
              lineHeight: 1,
              transition: 'background 0.15s',
            }}
          >
            ☰
          </button>

          {/* Right: undo, redo, clear, upload, profile */}
          <div className="flex items-center gap-2 flex-wrap">
            <button className="btn-ghost text-sm px-2" onClick={undo}>Undo</button>
            <button className="btn-ghost text-sm px-2" onClick={redo}>Redo</button>
            <button className="btn-ghost text-sm px-2" onClick={clearAll}>Clear</button>
            <button
              className="btn-ghost text-sm px-2"
              onClick={() => { setSwapMode(m => !m); setSwapFirst(null); clearSelection() }}
              style={{
                color: swapMode ? '#6c63ff' : undefined,
                border: swapMode ? '1px solid #6c63ff' : undefined,
                borderRadius: '6px',
              }}
            >
              {swapMode ? '⇄ Swapping' : '⇄ Swap'}
            </button>
            <label className="btn-ghost text-sm px-2 cursor-pointer">
              Upload
              <input ref={fileInputRef} type="file" multiple accept="image/*" style={{ display: 'none' }}
                onChange={e => { if (e.target.files?.length) { handleFiles(e.target.files); e.target.value = '' } }} />
            </label>
            {!profileImage ? (
              <button className="btn-ghost text-sm px-2 cursor-pointer text-[#6c63ff] border border-[#6c63ff]/40 rounded"
                onClick={() => profileInputRef.current?.click()}>
                + Add Profile
              </button>
            ) : (
              <div className="flex items-center gap-2 bg-[#1a1a2e] border border-[#6c63ff]/40 rounded px-2 py-1">
                <img src={profileImage} alt="profile" className="w-5 h-5 rounded object-cover" />
                <span className="text-xs text-[#6c63ff] max-w-[80px] truncate">{profileName}</span>
                <button className="text-[#888] hover:text-red-400 text-xs ml-1" onClick={handleRemoveProfile}>✕</button>
              </div>
            )}
          </div>
        </div>
      </header>

      <div id="canvas-container" className="flex-1 relative overflow-hidden" style={{ background: '#1a1a26' }}
        onDragEnter={onDragEnter} onDragLeave={onDragLeave} onDragOver={onDragOver} onDrop={onDrop}>

        {isDragging && (
          <div className="absolute inset-0 z-50 flex items-center justify-center bg-accent/10 border-2 border-dashed border-accent">
            <p className="text-accent text-xl font-semibold">Drop images here</p>
          </div>
        )}

        {/* ── Empty state ── */}
        {!images.length && !isDragging && (
          <div style={{
            position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center', gap: '14px',
            pointerEvents: 'none',
            background: '#1a1a26',
          }}>
            <div style={{
              width: '72px', height: '72px', borderRadius: '20px',
              background: 'linear-gradient(135deg, #6c63ff22, #a855f722)',
              border: '1px solid #6c63ff33',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '32px', marginBottom: '4px',
            }}>🎨</div>
            <p style={{ color: '#c8c8e8', fontSize: '17px', fontWeight: 700, opacity: 0.4, margin: 0 }}>
              Your canvas is empty
            </p>
            <p style={{ color: '#555', fontSize: '12px', opacity: 0.8, margin: 0, textAlign: 'center', lineHeight: 1.6, maxWidth: '220px' }}>
              Tap <span style={{ color: '#6c63ff', fontWeight: 600 }}>+ Create</span> to add skins,{' '}
              or <span style={{ color: '#6c63ff', fontWeight: 600 }}>Upload</span> your own images
            </p>
            <div style={{ marginTop: '12px', display: 'flex', gap: '10px' }}>
              {['💎', '👑', '✨', '🎮', '💜'].map((e, i) => (
                <div key={i} style={{
                  width: '36px', height: '36px', borderRadius: '10px',
                  background: '#1a1a2e', border: '1px solid #252535',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '18px', opacity: 0.25,
                }}>{e}</div>
              ))}
            </div>
          </div>
        )}

        {swapMode && (
          <div style={{
            position: 'absolute', top: '12px', left: '50%', transform: 'translateX(-50%)',
            zIndex: 100, display: 'flex', alignItems: 'center', gap: '10px',
            background: '#1a1a26', border: `1px solid ${swapFirst ? '#f97316' : '#6c63ff'}`,
            borderRadius: '10px', padding: '6px 14px',
            boxShadow: '0 4px 20px rgba(0,0,0,0.5)',
          }}>
            <span style={{ fontSize: '16px' }}>⇄</span>
            <span style={{ fontSize: '12px', color: swapFirst ? '#f97316' : '#6c63ff', fontWeight: 600 }}>
              {swapFirst ? 'Now tap the skin to swap with' : 'Tap a skin to start swapping'}
            </span>
            <button onClick={exitSwapMode} style={{
              background: 'none', border: 'none', color: '#666',
              fontSize: '16px', cursor: 'pointer', lineHeight: 1, padding: '2px 4px',
            }}>✕</button>
          </div>
        )}

        {hasSelection && !swapMode && (
          <div style={{
            position: 'absolute', top: '12px', left: '50%', transform: 'translateX(-50%)',
            zIndex: 100, display: 'flex', alignItems: 'center', gap: '8px',
            background: '#1a1a26', border: '1px solid #6c63ff55', borderRadius: '10px',
            padding: '6px 12px', boxShadow: '0 4px 20px rgba(0,0,0,0.5)',
          }}>
            <span style={{ fontSize: '12px', color: '#888' }}>{selectedIds.length} selected</span>
            <div style={{ width: '1px', height: '16px', background: '#333' }} />
            <button onClick={removeSelected} style={{
              display: 'flex', alignItems: 'center', gap: '5px',
              background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.35)',
              color: '#f87171', fontSize: '13px', fontWeight: 600, padding: '4px 10px',
              borderRadius: '7px', cursor: 'pointer',
            }}>🗑 Delete</button>
            <button onClick={clearSelection} style={{
              background: 'none', border: 'none', color: '#666', fontSize: '16px', cursor: 'pointer', lineHeight: 1, padding: '2px 4px',
            }}>✕</button>
          </div>
        )}

        <Stage
          ref={stageRef}
          width={window.innerWidth}
          height={window.innerHeight - 80}
          scaleX={stageScale} scaleY={stageScale}
          x={stagePos.x} y={stagePos.y}
          onWheel={handleWheel}
          onClick={e => {
            if (e.target === e.target.getStage()) {
              if (swapMode) { setSwapFirst(null); clearSelection() }
              else clearSelection()
            }
          }}
          style={{ background: 'transparent' }}
        >
          <Layer>
            {images.length > 0 && <Rect width={canvasSize.width} height={canvasSize.height} fill={backgroundColor} />}
            {images.map(img => (
              <CanvasImage
                key={img.id}
                img={img}
                isSelected={selectedIds.includes(img.id)}
                onSelect={id => swapMode ? handleSwapTap(id) : selectImage(id)}
                isSwapFirst={swapMode && swapFirst === img.id}
              />
            ))}
          </Layer>
        </Stage>
      </div>
    </div>
  )
}
