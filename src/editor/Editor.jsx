// The editor: collage preview, a top bar (undo / redo / export) and a dock of tools.
import { useRef, useState } from 'react'
import { ChevronLeft, Undo2, Redo2, Download, Plus, ScanSearch, Upload, LayoutGrid, UserSquare2, Palette, Trash2, Crop, ArrowUpToLine, ArrowLeftRight, X, Hash, FolderOpen } from 'lucide-react'
import toast from 'react-hot-toast'
import Stage from './Stage.jsx'
import Thumb from './Thumb.jsx'
import { useCollage } from '../lib/store.js'
import { addUploads } from '../lib/add.js'
import { blobSet } from '../lib/db.js'
import { measure } from '../lib/images.js'
import { uid } from '../lib/store.js'

export default function Editor({ open, onHome }) {
  const items = useCollage(s => s.items)
  const selected = useCollage(s => s.selected)
  const banner = useCollage(s => s.banner)
  const past = useCollage(s => s.past.length)
  const future = useCollage(s => s.future.length)
  const name = useCollage(s => s.name)
  const { undo, redo, select, remove, move, swap } = useCollage.getState()
  const [swapFrom, setSwapFrom] = useState(null)
  const [numbers, setNumbers] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const upload = useRef(null), bannerInput = useRef(null)

  const sel = items.find(i => i.id === selected)
  const selIndex = sel ? items.indexOf(sel) : -1

  const onTap = id => {
    if (swapFrom) {
      if (id && id !== swapFrom) { swap(swapFrom, id); toast.success('Swapped') }
      setSwapFrom(null); select(null)
      return
    }
    select(id === selected ? null : id)
  }

  const doUpload = async files => {
    if (!files?.length) return
    const t = toast.loading('Adding pictures…')
    const added = await addUploads(files, n => toast.loading(`Adding pictures… ${n}/${files.length}`, { id: t }))
    toast.success(`Added ${added.length} picture${added.length === 1 ? '' : 's'}`, { id: t })
  }
  const setBannerFile = async f => {
    if (!f) return
    try {
      const { w, h } = await measure(f)
      const blobId = uid()
      await blobSet(blobId, f)
      useCollage.getState().setBanner({ blobId, w, h, name: f.name })
      toast.success('Profile picture added on top')
    } catch { toast.error("That picture couldn't be opened") }
  }

  const tools = [
    { icon: Plus, label: 'Add skins', on: () => open('picker'), accent: true },
    { icon: ScanSearch, label: 'Auto', on: () => open('auto') },
    { icon: Upload, label: 'Upload', on: () => upload.current.click() },
    { icon: LayoutGrid, label: 'Arrange', on: () => open('arrange'), disabled: items.length < 2 },
    { icon: UserSquare2, label: banner ? 'Profile ✓' : 'Profile', on: () => open('banner') },
    { icon: Palette, label: 'Colour', on: () => open('background') },
    { icon: Hash, label: numbers ? 'Numbers ✓' : 'Numbers', on: () => setNumbers(n => !n) },
    { icon: FolderOpen, label: 'Projects', on: () => open('projects') },
  ]

  return (
    <div className="app" onDragOver={e => { e.preventDefault(); setDragOver(true) }} onDragLeave={() => setDragOver(false)}
      onDrop={e => { e.preventDefault(); setDragOver(false); doUpload(e.dataTransfer.files) }}>
      <div className="topbar">
        <button className="icon-btn" onClick={onHome} aria-label="Home"><ChevronLeft size={20} /></button>
        <div className="grow" style={{ minWidth: 0 }}>
          <div className="h3 ellipsis">{name || 'My collage'}</div>
          <div className="tiny muted">{items.length} skin{items.length === 1 ? '' : 's'}{banner ? ' · profile' : ''}</div>
        </div>
        <button className="icon-btn" disabled={!past} onClick={undo} aria-label="Undo"><Undo2 size={18} /></button>
        <button className="icon-btn" disabled={!future} onClick={redo} aria-label="Redo"><Redo2 size={18} /></button>
        <button className="btn btn-primary" disabled={!items.length} onClick={() => open('export')}><Download size={17} /> Export</button>
      </div>

      <Stage onTap={onTap} swapFrom={swapFrom} showNumbers={numbers} />

      {!items.length && (
        <div style={{ position: 'absolute', inset: '70px 20px 120px', display: 'grid', placeItems: 'center', pointerEvents: 'none', textAlign: 'center' }}>
          <div>
            <div className="h2">Your collage is empty</div>
            <div className="small muted" style={{ marginTop: 6 }}>Add skins from the library, use Auto Collage, or upload pictures.</div>
          </div>
        </div>
      )}

      {sel && (
        <div className="selbar glass">
          <div style={{ width: 30, height: 30, borderRadius: 8, overflow: 'hidden', flexShrink: 0 }}><Thumb item={sel} /></div>
          <span className="small" style={{ fontWeight: 700, maxWidth: 110 }}>#{selIndex + 1}</span>
          <button className="icon-btn plain" title="Crop" onClick={() => open('crop', sel)}><Crop size={18} /></button>
          <button className="icon-btn plain" title="Swap with…" onClick={() => { setSwapFrom(sel.id); toast('Now tap the skin to swap with', { icon: '↔️' }) }}><ArrowLeftRight size={18} /></button>
          <button className="icon-btn plain" title="Move to first" onClick={() => { move(sel.id, 0); select(null) }}><ArrowUpToLine size={18} /></button>
          <button className="icon-btn plain" title="Remove" onClick={() => remove(sel.id)} style={{ color: 'var(--red)' }}><Trash2 size={18} /></button>
          <button className="icon-btn plain" title="Close" onClick={() => select(null)}><X size={18} /></button>
        </div>
      )}
      {swapFrom && !sel && (
        <div className="selbar glass"><span className="small" style={{ fontWeight: 700 }}>Tap a skin to swap</span><button className="btn btn-sm btn-ghost" onClick={() => setSwapFrom(null)}>Cancel</button></div>
      )}

      <div className="dock">
        <div className="dock-inner glass">
          {tools.map(t => (
            <button key={t.label} className={`dock-btn ${t.accent ? 'accent' : ''}`} onClick={t.on} disabled={t.disabled}>
              <t.icon size={21} />{t.label}
            </button>
          ))}
          <span className="dock-sep" />
          <button className="dock-btn" disabled={!items.length} onClick={() => { if (confirm('Remove every skin from this collage? (Undo can bring them back.)')) useCollage.getState().clear() }}><Trash2 size={21} />Clear</button>
        </div>
      </div>

      <input ref={upload} type="file" accept="image/*" multiple hidden onChange={e => { doUpload([...e.target.files]); e.target.value = '' }} />
      <input ref={bannerInput} type="file" accept="image/*" hidden onChange={e => { setBannerFile(e.target.files?.[0]); e.target.value = '' }} />
      {dragOver && <div className="drop-hint">Drop pictures to add them</div>}
    </div>
  )
}
