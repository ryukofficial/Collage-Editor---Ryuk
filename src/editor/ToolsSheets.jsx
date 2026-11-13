// Extra tools: cut skins out of a screenshot, and HD-enhance any picture.
import { useEffect, useRef, useState } from 'react'
import { ImagePlus, Trash2, Zap, Download } from 'lucide-react'
import toast from 'react-hot-toast'
import { Sheet, Spinner, Progress } from '../ui/Sheet.jsx'
import { useCollage, uid } from '../lib/store.js'
import { blobSet } from '../lib/db.js'
import { measure } from '../lib/images.js'
import { downloadBlob } from '../export/ExportSheet.jsx'

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
          <ImagePlus size={34} color="#ff8fb0" /><div className="h3" style={{ marginTop: 10 }}>Choose a screenshot</div>
        </button>
      ) : size && (
        <>
          <div ref={box} onClick={tap} style={{ position: 'relative', width: '100%', aspectRatio: `${size.w} / ${size.h}`, borderRadius: 12, overflow: 'hidden', touchAction: 'manipulation' }}>
            <img src={url} alt="" draggable={false} style={{ width: '100%', height: '100%' }} />
            {boxes.map((b, i) => (
              <div key={i} style={{ position: 'absolute', left: `${b.x / size.w * 100}%`, top: `${b.y / size.h * 100}%`, width: `${b.s / size.w * 100}%`, aspectRatio: '1', border: '2px solid #ff3d77', boxShadow: '0 0 0 1px rgba(0,0,0,.5)', borderRadius: 4, pointerEvents: 'none' }}>
                <span className="badge pink" style={{ position: 'absolute', top: 3, left: 3, background: '#ff3d77', color: '#fff' }}>{i + 1}</span>
              </div>
            ))}
          </div>
          <label className="label">Box size · {side} px</label>
          <input type="range" min={Math.round(Math.min(size.w, size.h) * 0.05)} max={Math.min(size.w, size.h)} value={side} onChange={e => setSide(+e.target.value)} style={{ width: '100%', accentColor: '#ff3d77' }} />
          <button className="btn btn-ghost btn-sm" style={{ marginTop: 10 }} onClick={() => input.current.click()}>Use another screenshot</button>
        </>
      )}
    </Sheet>
  )
}

// ── HD enhance any picture (same enhance as the export) ─────────────────────
export function EnhanceSheet({ onClose }) {
  const [file, setFile] = useState(null)
  const [state, setState] = useState('pick')    // pick | working | done | error
  const [p, setP] = useState({ f: 0, mins: 0 })
  const [out, setOut] = useState(null)
  const [msg, setMsg] = useState('')
  const input = useRef(null)
  const cancel = useRef(false)

  const run = async f => {
    setFile(f); setState('working'); setMsg(''); cancel.current = false
    try {
      const m = await import('../export/hd.js')
      const S = await m.getHdSession()
      const bmp = await createImageBitmap(f)
      const k = Math.min(2, Math.sqrt(m.MAX_OUT_PIXELS / (bmp.width * bmp.height)))
      if (k < 1.1) throw m.fail('too_big')
      const src = m.makeCanvas(bmp.width, bmp.height)
      src.getContext('2d').drawImage(bmp, 0, 0); bmp.close?.()
      const clock = m.makeClock(m.tilesOf(src.width, src.height), (f2, mins) => setP({ f: f2, mins }), () => cancel.current)
      const up = await m.upscalePiece(S, src, k, [], clock)
      const blob = await new Promise(r => up.toBlob(r, 'image/png'))
      const res = { blob, w: up.width, h: up.height, name: `${f.name.replace(/\.[^.]+$/, '')}-hd.png` }
      src.width = src.height = up.width = up.height = 1
      setOut(res); setState('done'); downloadBlob(res.blob, res.name)
    } catch (err) {
      setMsg({ no_webgpu: "This browser can't run HD (it needs Chrome with WebGPU on a newer phone or computer).", too_slow: 'This would take too long on this phone.', cancelled: 'Stopped.', too_big: 'This picture is already as big as phones can open.' }[err?.code] || `HD couldn't run: ${err?.message || err}`)
      setState('error')
    }
  }

  return (
    <Sheet title="HD enhance" subtitle="Any picture ×2 sharper, done on your phone · free" onClose={() => { cancel.current = true; onClose() }}>
      <input ref={input} type="file" accept="image/*" hidden onChange={e => { const f = e.target.files?.[0]; if (f) run(f); e.target.value = '' }} />
      {(state === 'pick' || state === 'error') && (
        <>
          {msg && <div className="note err" style={{ marginBottom: 12 }}>{msg}</div>}
          <button className="card" onClick={() => input.current.click()} style={{ width: '100%', padding: '40px 20px', textAlign: 'center', borderStyle: 'dashed' }}>
            <Zap size={34} color="var(--amber)" /><div className="h3" style={{ marginTop: 10 }}>Choose a picture</div>
            <div className="small muted" style={{ marginTop: 4 }}>Works best in Chrome on a newer phone</div>
          </button>
        </>
      )}
      {state === 'working' && (
        <div style={{ padding: '30px 4px' }}>
          <div className="center-fill" style={{ padding: 0, marginBottom: 16 }}><Spinner size={30} /></div>
          <div className="h3" style={{ textAlign: 'center', marginBottom: 10 }}>{p.f ? `Enhancing… about ${p.mins} min left` : 'Starting the enhancer…'}</div>
          <Progress value={p.f} />
          <button className="btn btn-ghost btn-block" style={{ marginTop: 18 }} onClick={() => { cancel.current = true }}>Stop</button>
        </div>
      )}
      {state === 'done' && out && (
        <div style={{ textAlign: 'center', padding: '20px 0' }}>
          <div className="h2">Saved to your downloads</div>
          <div className="small muted" style={{ marginTop: 6 }}>{out.w} × {out.h} px</div>
          <div className="row" style={{ marginTop: 18, justifyContent: 'center' }}>
            <button className="btn btn-ghost" onClick={() => downloadBlob(out.blob, out.name)}><Download size={16} /> Save again</button>
            <button className="btn btn-primary" onClick={() => { setState('pick'); setOut(null); setFile(null) }}>Another picture</button>
          </div>
        </div>
      )}
      {file && null}
    </Sheet>
  )
}
