// Extra tool: cut skins out of a screenshot.
import { useEffect, useRef, useState } from 'react'
import { ImagePlus, Trash2 } from 'lucide-react'
import toast from 'react-hot-toast'
import { Sheet } from '../ui/Sheet.jsx'
import { useCollage, uid } from '../lib/store.js'
import { blobSet } from '../lib/db.js'
import { measure } from '../lib/images.js'

// ── Cut skins from a screenshot: tap each skin, add them all ────────────────
export function CutSheet({ onClose, onAdded }) {
  const [file, setFile] = useState(null)
  const [url, setUrl] = useState(null)
  const [size, setSize] = useState(null)       // { w, h }
  const [side, setSide] = useState(0)
  const [boxes, setBoxes] = useState([])
  const input = useRef(null), box = useRef(null)

  useEffect(() => {
    if (!file) return
    const u = URL.createObjectURL(file); setUrl(u)
    measure(file).then(s => { setSize(s); setSide(Math.round(Math.min(s.w, s.h) * 0.2)) }).catch(() => toast.error("That picture couldn't be opened"))
    return () => URL.revokeObjectURL(u)
  }, [file])

  const tap = e => {
    if (!size) return
    const r = box.current.getBoundingClientRect(), k = size.w / r.width
    const cx = (e.clientX - r.left) * k, cy = (e.clientY - r.top) * k
    const hit = boxes.findIndex(b => cx >= b.x && cx <= b.x + b.s && cy >= b.y && cy <= b.y + b.s)
    if (hit >= 0) { setBoxes(bs => bs.filter((_, i) => i !== hit)); return }
    const s = Math.min(side, size.w, size.h)
    setBoxes(bs => [...bs, { x: Math.max(0, Math.min(size.w - s, cx - s / 2)), y: Math.max(0, Math.min(size.h - s, cy - s / 2)), s }])
  }
  const add = async () => {
    const blobId = uid()
    await blobSet(blobId, file)
    const items = boxes.map((b, i) => ({ id: uid(), name: `${file.name.replace(/\.[^.]+$/, '')} ${i + 1}`, w: size.w, h: size.h, blobId, crop: { x: Math.round(b.x), y: Math.round(b.y), s: Math.round(b.s) } }))
    useCollage.getState().add(items)
    toast.success(`Added ${items.length} skins`)
    onAdded?.(); onClose()
  }

  return (
    <Sheet title="Cut from screenshot" subtitle={file ? 'Tap each skin to cut it out · tap a box to remove it' : 'Cut skins out of any picture, at full quality'} onClose={onClose} full
      footer={file && <div className="row">
        <button className="btn btn-ghost" onClick={() => setBoxes([])} disabled={!boxes.length}><Trash2 size={16} /> Clear</button>
        <div className="grow" />
        <button className="btn btn-primary" onClick={add} disabled={!boxes.length}>Add {boxes.length || ''} to collage</button>
      </div>}>
      <input ref={input} type="file" accept="image/*" hidden onChange={e => { const f = e.target.files?.[0]; if (f) { setFile(f); setBoxes([]) } e.target.value = '' }} />
      {!file ? (
        <button className="card" onClick={() => input.current.click()} style={{ width: '100%', padding: '40px 20px', textAlign: 'center', borderStyle: 'dashed' }}>
          <ImagePlus size={34} color="#e2c79a" /><div className="h3" style={{ marginTop: 10 }}>Choose a screenshot</div>
        </button>
      ) : size && (
        <>
          <div ref={box} onClick={tap} style={{ position: 'relative', width: '100%', aspectRatio: `${size.w} / ${size.h}`, borderRadius: 12, overflow: 'hidden', touchAction: 'manipulation' }}>
            <img src={url} alt="" draggable={false} style={{ width: '100%', height: '100%' }} />
            {boxes.map((b, i) => (
              <div key={i} style={{ position: 'absolute', left: `${b.x / size.w * 100}%`, top: `${b.y / size.h * 100}%`, width: `${b.s / size.w * 100}%`, aspectRatio: '1', border: '2px solid #c9a66b', boxShadow: '0 0 0 1px rgba(0,0,0,.5)', borderRadius: 4, pointerEvents: 'none' }}>
                <span className="badge pink" style={{ position: 'absolute', top: 3, left: 3, background: '#c9a66b', color: '#1b150c' }}>{i + 1}</span>
              </div>
            ))}
          </div>
          <label className="label">Box size · {side} px</label>
          <input type="range" min={Math.round(Math.min(size.w, size.h) * 0.05)} max={Math.min(size.w, size.h)} value={side} onChange={e => setSide(+e.target.value)} style={{ width: '100%', accentColor: '#c9a66b' }} />
          <button className="btn btn-ghost btn-sm" style={{ marginTop: 10 }} onClick={() => input.current.click()}>Use another screenshot</button>
        </>
      )}
    </Sheet>
  )
}
