// Crop: choose which square part of a picture is used in the collage.
import { useEffect, useRef, useState } from 'react'
import { RotateCcw } from 'lucide-react'
import { Sheet, Spinner } from '../ui/Sheet.jsx'
import { itemBlob } from '../lib/images.js'
import { useCollage, cropOf } from '../lib/store.js'

export default function CropSheet({ item, onClose }) {
  const [url, setUrl] = useState(null)
  const [err, setErr] = useState('')
  const [crop, setCrop] = useState(() => cropOf(item))
  const box = useRef(null)
  const drag = useRef(null)
  const minS = Math.max(16, Math.round(Math.min(item.w, item.h) * 0.12)), maxS = Math.min(item.w, item.h)

  useEffect(() => {
    let u = null
    itemBlob(item).then(b => { u = URL.createObjectURL(b); setUrl(u) }).catch(() => setErr('Could not open this picture. Check your internet and try again.'))
    return () => { if (u) URL.revokeObjectURL(u) }
  }, [item])

  const clamp = c => {
    const s = Math.max(minS, Math.min(maxS, c.s))
    return { s, x: Math.max(0, Math.min(item.w - s, c.x)), y: Math.max(0, Math.min(item.h - s, c.y)) }
  }
  const scale = () => (box.current ? box.current.clientWidth / item.w : 1)
  const down = e => { e.currentTarget.setPointerCapture(e.pointerId); drag.current = { x: e.clientX, y: e.clientY, c: crop } }
  const move = e => {
    if (!drag.current) return
    const k = scale(), d = drag.current
    setCrop(clamp({ ...d.c, x: d.c.x + (e.clientX - d.x) / k, y: d.c.y + (e.clientY - d.y) / k }))
  }
  const up = () => { drag.current = null }
  const resize = s => setCrop(c => { const cx = c.x + c.s / 2, cy = c.y + c.s / 2; return clamp({ s, x: cx - s / 2, y: cy - s / 2 }) })

  const save = () => {
    const full = cropOf({ ...item, crop: null })
    const same = Math.abs(full.x - crop.x) < 1 && Math.abs(full.y - crop.y) < 1 && Math.abs(full.s - crop.s) < 1
    useCollage.getState().update(item.id, { crop: same ? null : { x: Math.round(crop.x), y: Math.round(crop.y), s: Math.round(crop.s) } })
    onClose()
  }

  const k = 100 / item.w
  return (
    <Sheet title="Crop" subtitle="Drag the square · use the slider to zoom" onClose={onClose}
      footer={<div className="row">
        <button className="btn btn-ghost" onClick={() => setCrop(cropOf({ ...item, crop: null }))}><RotateCcw size={16} /> Reset</button>
        <div className="grow" />
        <button className="btn btn-primary" onClick={save} disabled={!url}>Save crop</button>
      </div>}>
      {err && <div className="note err">{err}</div>}
      {!url && !err && <div className="center-fill" style={{ minHeight: 240 }}><Spinner size={26} /></div>}
      {url && (
        <>
          <div ref={box} style={{ position: 'relative', width: `min(100%, calc(58dvh * ${item.w / item.h}))`, aspectRatio: `${item.w} / ${item.h}`, margin: '0 auto', touchAction: 'none', userSelect: 'none', borderRadius: 12, overflow: 'hidden', background: '#000' }}>
            <img src={url} alt="" draggable={false} style={{ width: '100%', height: '100%', objectFit: 'fill' }} />
            <div onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}
              style={{
                position: 'absolute', left: `${crop.x * k}%`, top: `${(crop.y / item.h) * 100}%`, width: `${crop.s * k}%`, aspectRatio: '1',
                border: '2px solid #fff', boxShadow: '0 0 0 9999px rgba(0,0,0,.55)', cursor: 'move', borderRadius: 4,
              }}>
              <div style={{ position: 'absolute', inset: 0, backgroundImage: 'linear-gradient(rgba(255,255,255,.25) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.25) 1px, transparent 1px)', backgroundSize: '33.33% 33.33%', backgroundPosition: '-1px -1px' }} />
            </div>
          </div>
          <label className="label">Size · {Math.round(crop.s)} px</label>
          <input type="range" min={minS} max={maxS} value={crop.s} onChange={e => resize(+e.target.value)} style={{ width: '100%', accentColor: '#ff3d77' }} />
        </>
      )}
    </Sheet>
  )
}
