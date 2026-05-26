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

function CanvasImage({ img, isSelected, onSelect }) {
  const [image] = useImage(img.src)
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
      stroke={isSelected ? '#6c63ff' : undefined}
      strokeWidth={isSelected ? 2 : 0}
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

  // ── Welcome screen ────────────────────────────────────────────
  const { show: showWelcome, dismiss: dismissWelcome } = useWelcome()

  // ── Admin panel state ─────────────────────────────────────────
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

  // ── Export history store ──────────────────────────────────────
  const exportHistory            = useStore(s => s.exportHistory)
  const addExportHistoryEntry    = useStore(s => s.addExportHistoryEntry)
  const removeExportHistoryEntry = useStore(s => s.removeExportHistoryEntry)
  const clearExportHistoryStore  = useStore(s => s.clearExportHistoryStore)

  const { isDragging, handleFiles, onDragEnter, onDragLeave, onDragOver, onDrop } = useDrop()

  useKeyboard()

  // ── Show restore toast once on mount if canvas was saved ──────
  useEffect(() => {
    const persisted = localStorage.getItem('ryuk_canvas_state')
    if (!persisted) return
    try {
      const { images: imgs } = JSON.parse(persisted)
      if (imgs?.length) {
        import('react-hot-toast').then(({ default: toast }) => {
          toast(`✨ Restored ${imgs.length} image${imgs.length !== 1 ? 's' : ''} from your last session`, {
            duration: 3500,
            style: { background: '#1a1a26', color: '#c8c8e8', border: '1px solid #6c63ff55' },
          })
        })
      }
    } catch {}
  }, [])

  // ── Device back button handling ───────────────────────────────
  const hasSelection = selectedIds.length > 0

  useEffect(() => {
    const handlePopState = () => {
      if (historyOpen)         { setHistoryOpen(false);         return }
      if (showPasswordPrompt)  { setShowPasswordPrompt(false);  return }
      if (adminOpen)           { setAdminOpen(false);           return }
      if (diamondPopupOpen)    { setDiamondPopupOpen(false);    return }
      if (showWelcome)         { dismissWelcome();               return }
      if (hasSelection)        { clearSelection();               return }
    }

    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [historyOpen, showPasswordPrompt, adminOpen, diamondPopupOpen, showWelcome, hasSelection, dismissWelcome, clearSelection])

  // ─────────────────────────────────────────────────────────────

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
    try {
      const { exportCollage, downloadBlob } = await import('./utils/imageUtils')
      const blob = await exportCollage(images, backgroundColor, profileImage || null)
      const filename = `ryukcreates-${Date.now()}.png`
      downloadBlob(blob, filename)

      // Generate thumbnail for history
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

      toast.success('Exported! Check your downloads.', { id })
    } catch (e) {
      toast.error('Export failed: ' + e.message, { id })
    }
  }

  return (
    <div className="flex flex-col h-screen bg-void text-text overflow-hidden">
      <Toaster position="bottom-right" toastOptions={{ style: { background: '#1a1a26', color: '#c8c8e8', border: '1px solid #252535' } }} />

      {/* ── Welcome Screen ───────────────────────────────────── */}
      {showWelcome && <WelcomeScreen onDismiss={dismissWelcome} />}

      {/* ── Admin Panel ───────────────────────────────────────── */}
      {adminOpen && <AdminPanel onClose={() => setAdminOpen(false)} />}

      {/* ── Export History Modal ──────────────────────────────── */}
      {historyOpen && (
        <div
          style={{
            position: 'fixed', inset: 0, zIndex: 250,
            background: 'rgba(0,0,0,0.72)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
          onClick={e => { if (e.target === e.currentTarget) setHistoryOpen(false) }}
        >
          <div style={{
            background: '#1a1a26', border: '1px solid #6c63ff55',
            borderRadius: '18px', padding: '28px 24px',
            width: 'min(94vw, 520px)', maxHeight: '80vh',
            display: 'flex', flexDirection: 'column', gap: '16px',
          }}>
            {/* header */}
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
                <button onClick={() => setHistoryOpen(false)} style={{
                  background: 'none', border: 'none', color: '#666',
                  fontSize: '20px', cursor: 'pointer', lineHeight: 1,
                }}>✕</button>
              </div>
            </div>

            {/* list */}
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
                    {/* thumbnail */}
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
                    {/* info */}
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
                    {/* delete */}
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

      {/* ── Diamond ticker ────────────────────────────────────── */}
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

      {/* ── Diamond popup ─────────────────────────────────────── */}
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

      <header className="bg-panel border-b border-border shrink-0">
        <div className="flex items-center justify-between px-4 py-2">
          <span
            className="font-display font-bold text-lg text-gradient shrink-0 cursor-pointer select-none"
            onClick={handleLogoClick}
            title="Ryuk Creates"
          >
            Ryuk Creates
          </span>
          <div className="flex gap-2 items-center">
            <HeroPicker />
            <button
              className="btn-ghost text-sm px-2"
              onClick={() => { setHistoryOpen(true); window.history.pushState({ overlay: 'history' }, '') }}
              title="Export History"
            >
              📁
            </button>
            <button className="btn-primary text-sm px-3" onClick={handleExport}>Export PNG</button>
          </div>
        </div>
        <div className="flex items-center gap-2 px-4 pb-2 flex-wrap">
          <button className="btn-ghost text-sm px-2" onClick={undo}>Undo</button>
          <button className="btn-ghost text-sm px-2" onClick={redo}>Redo</button>
          <button className="btn-ghost text-sm px-2" onClick={clearAll}>Clear</button>
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
      </header>

      <div id="canvas-container" className="flex-1 relative bg-grid overflow-hidden"
        onDragEnter={onDragEnter} onDragLeave={onDragLeave} onDragOver={onDragOver} onDrop={onDrop}>

        {isDragging && (
          <div className="absolute inset-0 z-50 flex items-center justify-center bg-accent/10 border-2 border-dashed border-accent">
            <p className="text-accent text-xl font-semibold">Drop images here</p>
          </div>
        )}

        {hasSelection && (
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
          onClick={e => { if (e.target === e.target.getStage()) clearSelection() }}
        >
          <Layer>
            <Rect width={canvasSize.width} height={canvasSize.height} fill={backgroundColor} />
            {images.map(img => (
              <CanvasImage key={img.id} img={img} isSelected={selectedIds.includes(img.id)} onSelect={selectImage} />
            ))}
          </Layer>
        </Stage>
      </div>
    </div>
  )
}
