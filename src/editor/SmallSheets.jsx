import { useEffect, useRef, useState } from 'react'
import { Trash2, Replace } from 'lucide-react'
import toast from 'react-hot-toast'
import { Sheet } from '../ui/Sheet.jsx'
import { useCollage, uid } from '../lib/store.js'
import { blobGet, blobSet } from '../lib/db.js'
import { measure } from '../lib/images.js'

const SWATCHES = ['#000000', '#0b0b12', '#ffffff', '#111827', '#1e1b4b', '#3b0764', '#4c0519', '#052e16', '#0c4a6e', '#7c2d12', '#c9a66b', '#f5c842']

export function BackgroundSheet({ onClose }) {
  const bg = useCollage(s => s.bg)
  const setBg = useCollage(s => s.setBg)
  return (
    <Sheet title="Background colour" subtitle="Shows in empty spaces of the grid" onClose={onClose}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 10 }}>
        {SWATCHES.map(c => (
          <button key={c} onClick={() => setBg(c)} aria-label={c} style={{ aspectRatio: '1', borderRadius: 14, background: c, border: bg === c ? '3px solid var(--pink)' : '1px solid var(--line-2)' }} />
        ))}
      </div>
      <label className="row" style={{ marginTop: 16, gap: 12 }}>
        <input type="color" value={bg} onChange={e => setBg(e.target.value)} style={{ width: 52, height: 40, border: 'none', background: 'none' }} />
        <span className="small muted">Any colour · {bg}</span>
      </label>
    </Sheet>
  )
}

export function BannerSheet({ onClose }) {
  const banner = useCollage(s => s.banner)
  const [url, setUrl] = useState(null)
  const input = useRef(null)
  useEffect(() => {
    let u = null
    if (banner?.blobId) blobGet(banner.blobId).then(b => { if (b) { u = URL.createObjectURL(b); setUrl(u) } })
    return () => { if (u) URL.revokeObjectURL(u) }
  }, [banner])
  const replace = async f => {
    if (!f) return
    try {
      const { w, h } = await measure(f)
      const blobId = uid()
      await blobSet(blobId, f)
      useCollage.getState().setBanner({ blobId, w, h, name: f.name })
    } catch { toast.error("That picture couldn't be opened") }
  }
  return (
    <Sheet title="Profile banner" subtitle="Sits on top of the collage, as wide as the grid" onClose={onClose}
      footer={<div className="row">
        <button className="btn btn-danger" onClick={() => { useCollage.getState().setBanner(null); onClose() }}><Trash2 size={16} /> Remove</button>
        <div className="grow" />
        <button className="btn btn-primary" onClick={() => input.current.click()}><Replace size={16} /> Replace</button>
      </div>}>
      {url && <img src={url} alt="" style={{ width: '100%', borderRadius: 12 }} />}
      {banner && <p className="small muted" style={{ marginTop: 10 }}>{banner.w} × {banner.h} px · never shrunk: if it is wider than the grid, the skins are drawn bigger instead.</p>}
      <input ref={input} type="file" accept="image/*" hidden onChange={e => { replace(e.target.files?.[0]); e.target.value = '' }} />
    </Sheet>
  )
}
