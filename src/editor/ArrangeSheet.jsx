// Arrange: big grid of every skin. Tap one, tap another to swap them.
import { useMemo, useState } from 'react'
import { Minus, Plus, ArrowUpToLine, ArrowDownToLine, Search, Wand2 } from 'lucide-react'
import { Sheet } from '../ui/Sheet.jsx'
import Thumb from './Thumb.jsx'
import { useCollage } from '../lib/store.js'
import { sortForCollage } from '../lib/skinSeries.js'
import { SKIN_BY_ID } from '../lib/skins.js'

const loadCols = () => { try { const v = +localStorage.getItem('arrangeCols2'); if (v >= 3 && v <= 12) return v } catch { /* */ } return window.innerWidth >= 900 ? 9 : window.innerWidth >= 600 ? 7 : 5 }

export default function ArrangeSheet({ onClose }) {
  const items = useCollage(s => s.items)
  const [order, setOrder] = useState(items)
  const [sel, setSel] = useState(null)
  const [cols, setCols] = useState(loadCols)
  const [q, setQ] = useState('')
  const changed = order.some((it, i) => it.id !== items[i]?.id)

  const setC = d => setCols(c => { const v = Math.min(12, Math.max(3, c + d)); try { localStorage.setItem('arrangeCols2', String(v)) } catch { /* */ } return v })
  const tap = i => {
    if (sel === null) return setSel(i)
    if (sel === i) return setSel(null)
    const next = order.slice(); [next[sel], next[i]] = [next[i], next[sel]]
    setOrder(next); setSel(null)
  }
  const moveTo = (i, to) => {
    const next = order.slice(); const [m] = next.splice(i, 1); next.splice(to, 0, m)
    setOrder(next); setSel(null)
  }
  const autoSort = () => {
    const lib = order.filter(it => it.skin && SKIN_BY_ID.has(it.skin))
    const rest = order.filter(it => !(it.skin && SKIN_BY_ID.has(it.skin)))
    const sorted = sortForCollage(lib.map(it => ({ it, heroId: SKIN_BY_ID.get(it.skin).heroId, skinName: SKIN_BY_ID.get(it.skin).skinName }))).map(x => x.it)
    setOrder([...sorted, ...rest]); setSel(null)
  }
  const shown = useMemo(() => {
    const k = q.trim().toLowerCase()
    return order.map((it, i) => ({ it, i })).filter(({ it, i }) => !k || (it.name || '').toLowerCase().includes(k) || String(i + 1) === k)
  }, [order, q])

  const apply = () => { if (changed) useCollage.getState().setOrder(order.map(i => i.id)); onClose() }

  return (
    <Sheet title="Arrange" subtitle={`Tap a skin, then tap another to swap · ${order.length} skins`} onClose={onClose} full wide
      actions={<button className="btn btn-primary btn-sm" onClick={apply}>{changed ? 'Apply' : 'Done'}</button>}
      footer={sel !== null ? (
        <div className="row">
          <div style={{ width: 44, height: 44, borderRadius: 10, overflow: 'hidden', flexShrink: 0 }}><Thumb item={order[sel]} /></div>
          <div className="grow"><div className="small" style={{ fontWeight: 700 }}>#{sel + 1} selected</div><div className="tiny muted ellipsis">{order[sel]?.name}</div></div>
          <button className="icon-btn" title="Move to first" onClick={() => moveTo(sel, 0)}><ArrowUpToLine size={18} /></button>
          <button className="icon-btn" title="Move to last" onClick={() => moveTo(sel, order.length - 1)}><ArrowDownToLine size={18} /></button>
          <button className="btn btn-ghost btn-sm" onClick={() => setSel(null)}>Cancel</button>
        </div>
      ) : null}>
      <div className="row" style={{ marginBottom: 12, gap: 8 }}>
        <div className="search grow"><Search size={16} /><input className="field field-sm" placeholder="Find by name or number" value={q} onChange={e => setQ(e.target.value)} /></div>
        <div className="row" style={{ gap: 4, background: 'var(--surface-2)', border: '1px solid var(--line)', borderRadius: 10, padding: 2 }}>
          <button className="icon-btn plain" style={{ width: 34, height: 34 }} onClick={() => setC(-1)} aria-label="Bigger"><Minus size={16} /></button>
          <span className="tiny muted" style={{ minWidth: 34, textAlign: 'center' }}>{cols}/row</span>
          <button className="icon-btn plain" style={{ width: 34, height: 34 }} onClick={() => setC(1)} aria-label="Smaller"><Plus size={16} /></button>
        </div>
      </div>
      <div className="row" style={{ marginBottom: 12, gap: 8, flexWrap: 'wrap' }}>
        <button className="chip" onClick={autoSort}><Wand2 size={14} /> Sort by series & tier</button>
        {changed && <button className="chip" onClick={() => { setOrder(items); setSel(null) }}>Undo changes</button>}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`, gap: cols > 8 ? 4 : 7 }}>
        {shown.map(({ it, i }) => (
          <button key={it.id} onClick={() => tap(i)} style={{
            position: 'relative', aspectRatio: '1', borderRadius: cols > 8 ? 8 : 12, overflow: 'hidden',
            outline: sel === i ? '3px solid var(--pink)' : 'none', outlineOffset: -3,
            boxShadow: sel === i ? 'var(--glow)' : 'none', background: 'var(--surface-2)',
          }}>
            <Thumb item={it} />
            <span style={{ position: 'absolute', top: 4, left: 4, fontSize: cols > 8 ? 9 : 10.5, fontWeight: 800, padding: '1px 5px', borderRadius: 5, background: i === 0 ? 'rgba(201,166,107,.92)' : 'rgba(0,0,0,.65)', color: i === 0 ? '#1b150c' : '#fff' }}>{i === 0 ? '1st' : i + 1}</span>
            {sel !== null && sel !== i && <span style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,.12)' }} />}
          </button>
        ))}
      </div>
    </Sheet>
  )
}
