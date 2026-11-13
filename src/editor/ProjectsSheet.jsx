// Projects: save the collage under a name, reopen earlier versions, see exports.
import { useEffect, useState } from 'react'
import { Save, Trash2, Pencil, FolderOpen, Clock, Download } from 'lucide-react'
import toast from 'react-hot-toast'
import { Sheet } from '../ui/Sheet.jsx'
import { useCollage, saveNow } from '../lib/store.js'
import { listProjects, saveProject, deleteProject, renameProject, listRecent, rememberVersion, listExports, deleteExport, clearExports } from '../lib/projects.js'

const when = t => new Date(t).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })

function Row({ thumb, title, sub, children, onOpen }) {
  return (
    <div className="row" style={{ padding: 10, borderRadius: 14, background: 'var(--surface)', border: '1px solid var(--line)' }}>
      <button onClick={onOpen} style={{ width: 64, height: 64, borderRadius: 10, overflow: 'hidden', background: 'var(--surface-2)', flexShrink: 0 }} disabled={!onOpen}>
        {thumb ? <img src={thumb} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : null}
      </button>
      <button className="grow" style={{ textAlign: 'left', minWidth: 0 }} onClick={onOpen} disabled={!onOpen}>
        <div className="h3 ellipsis">{title}</div>
        <div className="tiny muted">{sub}</div>
      </button>
      {children}
    </div>
  )
}

export default function ProjectsSheet({ onClose, onOpened }) {
  const [tab, setTab] = useState('saved')
  const [projects, setProjects] = useState([])
  const [recent, setRecent] = useState([])
  const [exports, setExports] = useState([])
  const s = useCollage()
  const [name, setName] = useState(s.name || '')

  const reload = async () => { setProjects(await listProjects()); setRecent(await listRecent()); setExports(await listExports()) }
  useEffect(() => { rememberVersion().finally(reload) }, [])

  const open = doc => {
    if (s.items.length && !confirm('Open this? Your current collage is kept in "Recent".')) return
    rememberVersion().then(() => { useCollage.getState().load(doc); saveNow(); onOpened?.(); onClose() })
  }
  const save = async () => {
    if (!s.items.length) return
    await saveProject(name || 'My collage')
    toast.success('Saved')
    reload()
  }

  return (
    <Sheet title="Projects" subtitle="Saved on this phone" onClose={onClose} full>
      <div className="seg" style={{ marginBottom: 14 }}>
        {[['saved', 'Saved'], ['recent', 'Recent'], ['exports', 'Exports']].map(([k, l]) => <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{l}</button>)}
      </div>

      {tab === 'saved' && (
        <>
          {s.items.length > 0 && (
            <div className="row" style={{ marginBottom: 16 }}>
              <input className="field" placeholder="Name this collage" value={name} onChange={e => setName(e.target.value)} />
              <button className="btn btn-primary" onClick={save}><Save size={16} /> Save</button>
            </div>
          )}
          {!projects.length && <p className="small muted" style={{ textAlign: 'center', padding: 30 }}>No saved projects yet.</p>}
          <div className="col" style={{ gap: 8 }}>
            {projects.map(p => (
              <Row key={p.id} thumb={p.thumb} title={p.name} sub={`${p.count} skins · ${when(p.savedAt)}`} onOpen={() => open({ ...p.doc, name: p.name, projectId: p.id })}>
                <button className="icon-btn plain" onClick={async () => { const n = prompt('New name', p.name); if (n?.trim()) { await renameProject(p.id, n.trim()); reload() } }}><Pencil size={16} /></button>
                <button className="icon-btn plain" style={{ color: 'var(--red)' }} onClick={async () => { if (confirm(`Delete "${p.name}"?`)) { await deleteProject(p.id); reload() } }}><Trash2 size={16} /></button>
              </Row>
            ))}
          </div>
        </>
      )}

      {tab === 'recent' && (
        <>
          <p className="small muted" style={{ marginBottom: 12 }}><Clock size={13} style={{ verticalAlign: -2 }} /> Earlier versions, kept automatically.</p>
          {!recent.length && <p className="small muted" style={{ textAlign: 'center', padding: 30 }}>Nothing yet.</p>}
          <div className="col" style={{ gap: 8 }}>
            {recent.map(r => (
              <Row key={r.id} thumb={r.thumb} title={`${r.count} skins`} sub={when(r.savedAt)} onOpen={() => open(r.doc)}>
                <FolderOpen size={18} className="muted" />
              </Row>
            ))}
          </div>
        </>
      )}

      {tab === 'exports' && (
        <>
          {!exports.length && <p className="small muted" style={{ textAlign: 'center', padding: 30 }}>No exports yet.</p>}
          <div className="col" style={{ gap: 8 }}>
            {exports.map(e => (
              <Row key={e.id} thumb={e.thumb} title={e.name} sub={`${e.count} skins${e.size ? ` · ${e.size}` : ''}${e.look && e.look !== 'free' ? ` · Ryuk ${e.look}` : ''} · ${when(e.at)}`}>
                <button className="icon-btn plain" onClick={async () => { await deleteExport(e.id); reload() }}><Trash2 size={16} /></button>
              </Row>
            ))}
          </div>
          {exports.length > 0 && <button className="btn btn-ghost btn-sm" style={{ marginTop: 14 }} onClick={async () => { await clearExports(); reload() }}><Download size={14} /> Clear history</button>}
        </>
      )}
    </Sheet>
  )
}
