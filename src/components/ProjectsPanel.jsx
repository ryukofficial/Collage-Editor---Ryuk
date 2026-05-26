import { useState, useEffect, useCallback, useRef } from 'react'
import { loadProjects, saveProject, deleteProject, renameProject } from '../utils/projectManager'

// ── tiny helpers ──────────────────────────────────────────────
function timeAgo(ts) {
  const diff = Date.now() - ts
  const m    = Math.floor(diff / 60000)
  if (m < 1)   return 'just now'
  if (m < 60)  return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24)  return `${h}h ago`
  const d = Math.floor(h / 24)
  return `${d}d ago`
}

// ── Confirm dialog ────────────────────────────────────────────
function Confirm({ message, onConfirm, onCancel }) {
  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 400,
      background: 'rgba(0,0,0,0.7)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <div style={{
        background: '#1a1a26', border: '1px solid #333',
        borderRadius: '14px', padding: '28px 24px', width: 'min(90vw,320px)',
        textAlign: 'center',
      }}>
        <p style={{ color: '#c8c8e8', fontSize: '14px', marginBottom: '20px' }}>{message}</p>
        <div style={{ display: 'flex', gap: '10px', justifyContent: 'center' }}>
          <button onClick={onCancel} style={{
            background: 'none', border: '1px solid #333', color: '#888',
            padding: '8px 20px', borderRadius: '8px', cursor: 'pointer', fontSize: '13px',
          }}>Cancel</button>
          <button onClick={onConfirm} style={{
            background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.4)',
            color: '#f87171', padding: '8px 20px', borderRadius: '8px',
            cursor: 'pointer', fontSize: '13px', fontWeight: 700,
          }}>Delete</button>
        </div>
      </div>
    </div>
  )
}

// ── Save-name input dialog ────────────────────────────────────
function SaveDialog({ defaultName, onSave, onCancel, saving }) {
  const [name, setName] = useState(defaultName)
  const inputRef        = useRef()
  useEffect(() => { inputRef.current?.focus(); inputRef.current?.select() }, [])

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 400,
      background: 'rgba(0,0,0,0.7)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <div style={{
        background: '#1a1a26', border: '1px solid #6c63ff',
        borderRadius: '16px', padding: '28px 24px', width: 'min(90vw, 340px)',
      }}>
        <h3 style={{ color: '#fff', fontSize: '16px', fontWeight: 700, marginBottom: '16px' }}>
          💾 Save Project
        </h3>
        <input
          ref={inputRef}
          value={name}
          onChange={e => setName(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') onSave(name); if (e.key === 'Escape') onCancel() }}
          placeholder="Project name…"
          maxLength={60}
          style={{
            width: '100%', background: '#12121a', border: '1px solid #333',
            borderRadius: '8px', padding: '10px 12px', color: '#fff',
            fontSize: '14px', outline: 'none', boxSizing: 'border-box', marginBottom: '16px',
          }}
        />
        <div style={{ display: 'flex', gap: '10px' }}>
          <button onClick={onCancel} style={{
            flex: 1, background: 'none', border: '1px solid #333', color: '#888',
            padding: '10px', borderRadius: '8px', cursor: 'pointer', fontSize: '13px',
          }}>Cancel</button>
          <button
            onClick={() => onSave(name)}
            disabled={!name.trim() || saving}
            style={{
              flex: 2, background: 'linear-gradient(135deg,#6c63ff,#a855f7)',
              border: 'none', color: '#fff', fontWeight: 700, fontSize: '14px',
              padding: '10px', borderRadius: '8px',
              cursor: name.trim() && !saving ? 'pointer' : 'not-allowed',
              opacity: !name.trim() || saving ? 0.6 : 1,
            }}
          >{saving ? 'Saving…' : 'Save'}</button>
        </div>
      </div>
    </div>
  )
}

// ── Project card ──────────────────────────────────────────────
function ProjectCard({ project, onLoad, onDelete, onRename }) {
  const [menuOpen,    setMenuOpen]    = useState(false)
  const [renameMode,  setRenameMode]  = useState(false)
  const [nameVal,     setNameVal]     = useState(project.name)
  const [confirmDel,  setConfirmDel]  = useState(false)
  const menuRef = useRef()

  // close menu on outside click
  useEffect(() => {
    if (!menuOpen) return
    const handler = e => { if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [menuOpen])

  const handleRename = () => {
    const trimmed = nameVal.trim()
    if (trimmed && trimmed !== project.name) onRename(project.id, trimmed)
    setRenameMode(false)
    setMenuOpen(false)
  }

  return (
    <>
      {confirmDel && (
        <Confirm
          message={`Delete "${project.name}"? This can't be undone.`}
          onConfirm={() => { onDelete(project.id); setConfirmDel(false) }}
          onCancel={() => setConfirmDel(false)}
        />
      )}
      <div style={{
        display: 'flex', alignItems: 'center', gap: '12px',
        background: '#12121a', border: '1px solid #222',
        borderRadius: '12px', padding: '10px 12px',
        transition: 'border-color 0.15s',
      }}
        onMouseEnter={e => e.currentTarget.style.borderColor = '#6c63ff44'}
        onMouseLeave={e => e.currentTarget.style.borderColor = '#222'}
      >
        {/* thumbnail */}
        <div
          onClick={() => onLoad(project)}
          style={{
            width: '60px', height: '40px', borderRadius: '7px',
            overflow: 'hidden', background: '#0d0d14', flexShrink: 0,
            cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          {project.thumbnail
            ? <img src={project.thumbnail} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            : <span style={{ fontSize: '20px' }}>🖼️</span>
          }
        </div>

        {/* info */}
        <div style={{ flex: 1, minWidth: 0 }} onClick={() => !renameMode && onLoad(project)}>
          {renameMode ? (
            <input
              autoFocus
              value={nameVal}
              onChange={e => setNameVal(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleRename(); if (e.key === 'Escape') { setRenameMode(false); setNameVal(project.name) } }}
              onBlur={handleRename}
              onClick={e => e.stopPropagation()}
              maxLength={60}
              style={{
                width: '100%', background: '#1a1a2e', border: '1px solid #6c63ff',
                borderRadius: '6px', padding: '3px 8px', color: '#fff',
                fontSize: '13px', outline: 'none', boxSizing: 'border-box',
              }}
            />
          ) : (
            <div style={{
              color: '#c8c8e8', fontSize: '13px', fontWeight: 600, cursor: 'pointer',
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>
              {project.name}
            </div>
          )}
          <div style={{ color: '#555', fontSize: '11px', marginTop: '2px' }}>
            {timeAgo(project.savedAt)} · {project.imageCount} image{project.imageCount !== 1 ? 's' : ''}
          </div>
        </div>

        {/* menu button */}
        <div ref={menuRef} style={{ position: 'relative', flexShrink: 0 }}>
          <button
            onClick={e => { e.stopPropagation(); setMenuOpen(v => !v) }}
            style={{
              background: 'none', border: 'none', color: '#555',
              fontSize: '18px', cursor: 'pointer', padding: '4px 6px', lineHeight: 1,
              borderRadius: '6px',
            }}
            title="Options"
          >⋯</button>
          {menuOpen && (
            <div style={{
              position: 'absolute', right: 0, top: '28px', zIndex: 10,
              background: '#1a1a26', border: '1px solid #333', borderRadius: '10px',
              minWidth: '130px', boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
              overflow: 'hidden',
            }}>
              {[
                { label: '📂 Load',   action: () => { onLoad(project); setMenuOpen(false) } },
                { label: '✏️ Rename', action: () => { setRenameMode(true); setMenuOpen(false) } },
                { label: '🗑 Delete', action: () => { setConfirmDel(true); setMenuOpen(false) }, danger: true },
              ].map(item => (
                <button
                  key={item.label}
                  onClick={item.action}
                  style={{
                    width: '100%', background: 'none', border: 'none',
                    color: item.danger ? '#f87171' : '#c8c8e8',
                    fontSize: '13px', padding: '10px 14px', textAlign: 'left',
                    cursor: 'pointer',
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = '#252535'}
                  onMouseLeave={e => e.currentTarget.style.background = 'none'}
                >
                  {item.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  )
}

// ── Main ProjectsPanel ────────────────────────────────────────
export default function ProjectsPanel({
  onClose,
  // current canvas state for saving
  currentSnapshot,  // { images, backgroundColor, canvasSize, stageScale, stagePos }
  // callback to restore a snapshot
  onLoadProject,
}) {
  const [projects,     setProjects]     = useState([])
  const [tab,          setTab]          = useState('projects')   // 'projects' | 'autosaves'
  const [showSave,     setShowSave]     = useState(false)
  const [saving,       setSaving]       = useState(false)
  const [autoSaves,    setAutoSaves]    = useState([])
  const [toast,        setToast]        = useState(null)

  const showToast = useCallback((msg) => {
    setToast(msg)
    setTimeout(() => setToast(null), 2200)
  }, [])

  useEffect(() => {
    setProjects(loadProjects())
    // load auto-save history from localStorage
    try {
      const raw = localStorage.getItem('ryuk_autosave_history')
      setAutoSaves(raw ? JSON.parse(raw) : [])
    } catch { setAutoSaves([]) }
  }, [])

  const handleSave = async (name) => {
    if (!name.trim()) return
    setSaving(true)
    const project = await saveProject(name, currentSnapshot)
    setSaving(false)
    setShowSave(false)
    if (project) {
      setProjects(loadProjects())
      showToast(`✅ Saved "${name}"`)
    } else {
      showToast('❌ Save failed (storage full?)')
    }
  }

  const handleDelete = (id) => {
    deleteProject(id)
    setProjects(loadProjects())
  }

  const handleRename = (id, newName) => {
    renameProject(id, newName)
    setProjects(loadProjects())
  }

  const handleLoad = (project) => {
    onLoadProject(project.snapshot)
    onClose()
  }

  const defaultSaveName = () => {
    const d = new Date()
    return `Collage ${d.toLocaleDateString('en-GB', { day:'2-digit', month:'short' })} ${d.toLocaleTimeString('en-GB', { hour:'2-digit', minute:'2-digit' })}`
  }

  const canSave = currentSnapshot?.images?.length > 0

  return (
    <>
      {showSave && (
        <SaveDialog
          defaultName={defaultSaveName()}
          onSave={handleSave}
          onCancel={() => setShowSave(false)}
          saving={saving}
        />
      )}

      <div
        style={{
          position: 'fixed', inset: 0, zIndex: 250,
          background: 'rgba(0,0,0,0.72)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}
        onClick={e => { if (e.target === e.currentTarget) onClose() }}
      >
        <div style={{
          background: '#1a1a26', border: '1px solid #6c63ff55',
          borderRadius: '18px', width: 'min(94vw, 520px)',
          maxHeight: '82vh', display: 'flex', flexDirection: 'column',
        }}>

          {/* ── Header ── */}
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '20px 22px 0', flexShrink: 0,
          }}>
            <h2 style={{ color: '#c8c8e8', fontSize: '17px', fontWeight: 700, margin: 0 }}>
              🗂 Projects
            </h2>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              {canSave && (
                <button
                  onClick={() => setShowSave(true)}
                  style={{
                    background: 'linear-gradient(135deg,#6c63ff,#a855f7)',
                    border: 'none', color: '#fff', fontWeight: 700,
                    fontSize: '13px', padding: '7px 14px',
                    borderRadius: '8px', cursor: 'pointer',
                  }}
                >💾 Save current</button>
              )}
              <button onClick={onClose} style={{
                background: 'none', border: 'none', color: '#666',
                fontSize: '20px', cursor: 'pointer', lineHeight: 1,
              }}>✕</button>
            </div>
          </div>

          {/* ── Tabs ── */}
          <div style={{
            display: 'flex', gap: '4px', padding: '14px 22px 0', flexShrink: 0,
          }}>
            {[
              { id: 'projects',  label: `📁 Saved (${projects.length})` },
              { id: 'autosaves', label: `🕐 Auto-saves (${autoSaves.length})` },
            ].map(t => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                style={{
                  background: tab === t.id ? '#252535' : 'none',
                  border: `1px solid ${tab === t.id ? '#6c63ff55' : 'transparent'}`,
                  color: tab === t.id ? '#c8c8e8' : '#666',
                  fontSize: '13px', fontWeight: tab === t.id ? 600 : 400,
                  padding: '7px 14px', borderRadius: '8px', cursor: 'pointer',
                }}
              >{t.label}</button>
            ))}
          </div>

          {/* ── Body ── */}
          <div style={{
            flex: 1, overflowY: 'auto',
            padding: '14px 22px 22px',
            display: 'flex', flexDirection: 'column', gap: '8px',
          }}>
            {tab === 'projects' && (
              projects.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '50px 0', color: '#555' }}>
                  <div style={{ fontSize: '36px', marginBottom: '12px' }}>📂</div>
                  <p style={{ fontSize: '14px', fontWeight: 600, color: '#666', marginBottom: '6px' }}>No saved projects yet</p>
                  <p style={{ fontSize: '12px' }}>Hit <strong style={{ color: '#6c63ff' }}>Save current</strong> to save your collage.</p>
                </div>
              ) : (
                projects.map(p => (
                  <ProjectCard
                    key={p.id}
                    project={p}
                    onLoad={handleLoad}
                    onDelete={handleDelete}
                    onRename={handleRename}
                  />
                ))
              )
            )}

            {tab === 'autosaves' && (
              autoSaves.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '50px 0', color: '#555' }}>
                  <div style={{ fontSize: '36px', marginBottom: '12px' }}>🕐</div>
                  <p style={{ fontSize: '14px', fontWeight: 600, color: '#666', marginBottom: '6px' }}>No auto-saves yet</p>
                  <p style={{ fontSize: '12px' }}>Auto-saves appear here as you work.</p>
                </div>
              ) : (
                autoSaves.map((snap, i) => (
                  <div
                    key={i}
                    onClick={() => { onLoadProject(snap.snapshot); onClose() }}
                    style={{
                      display: 'flex', alignItems: 'center', gap: '12px',
                      background: '#12121a', border: '1px solid #222',
                      borderRadius: '12px', padding: '10px 12px',
                      cursor: 'pointer', transition: 'border-color 0.15s',
                    }}
                    onMouseEnter={e => e.currentTarget.style.borderColor = '#6c63ff44'}
                    onMouseLeave={e => e.currentTarget.style.borderColor = '#222'}
                  >
                    {snap.thumbnail
                      ? <img src={snap.thumbnail} alt="" style={{ width: '60px', height: '40px', objectFit: 'cover', borderRadius: '7px', flexShrink: 0 }} />
                      : <div style={{ width: '60px', height: '40px', borderRadius: '7px', background: '#0d0d14', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><span style={{ fontSize: '20px' }}>🖼️</span></div>
                    }
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ color: '#c8c8e8', fontSize: '13px', fontWeight: 600 }}>
                        Auto-save #{autoSaves.length - i}
                      </div>
                      <div style={{ color: '#555', fontSize: '11px', marginTop: '2px' }}>
                        {timeAgo(snap.savedAt)} · {snap.imageCount} image{snap.imageCount !== 1 ? 's' : ''}
                      </div>
                    </div>
                    <span style={{ color: '#6c63ff', fontSize: '13px', flexShrink: 0 }}>Restore →</span>
                  </div>
                ))
              )
            )}
          </div>
        </div>
      </div>

      {/* ── Toast ── */}
      {toast && (
        <div style={{
          position: 'fixed', bottom: '60px', left: '50%', transform: 'translateX(-50%)',
          background: '#1a1a26', border: '1px solid #6c63ff55',
          borderRadius: '10px', padding: '10px 18px',
          color: '#c8c8e8', fontSize: '13px', fontWeight: 600,
          zIndex: 500, pointerEvents: 'none',
          boxShadow: '0 4px 20px rgba(0,0,0,0.5)',
        }}>
          {toast}
        </div>
      )}
    </>
  )
          }
