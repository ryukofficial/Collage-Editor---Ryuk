// Auto Collage: screenshots of your MLBB collection → every skin found → collage.
// Reading happens on the phone (fast, works on weak internet after the first use).
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ImagePlus, X, ScanSearch, Check, Search, Copy, ChevronDown, ChevronRight, ZoomIn, Plus } from 'lucide-react'
import toast from 'react-hot-toast'
import { Sheet, Spinner, Progress } from '../ui/Sheet.jsx'
import { HEROES, skinPicture, loadSkinIndex, searchSkins } from '../lib/skins.js'
import { buildVocabulary, sortByPosition } from '../scan/match.js'
import { sortForCollage } from '../lib/skinSeries.js'
import { skinsToItems } from '../lib/add.js'
import { useCollage } from '../lib/store.js'
import { useWallet, walletEnabled, walletError, refreshWallet, chargeAutoCollage, AUTO_COLLAGE_PRICE } from '../lib/wallet.js'

const MAX_SHOTS = 40
let vocab = null
const getVocab = () => (vocab ||= buildVocabulary(HEROES))

function Tile({ c, on, tone, onToggle }) {
  const pic = skinPicture(c.key)
  return (
    <button className={`skin ${on ? 'on' : ''} ${pic ? '' : 'disabled'}`} onClick={() => pic && onToggle(c.key)}>
      <div className="skin-art" style={on ? undefined : { borderColor: tone === 'maybe' ? 'rgba(245,165,36,.45)' : 'transparent' }}>
        {pic ? <img src={pic.url} alt="" loading="lazy" crossOrigin="anonymous" /> : <div className="center-fill tiny muted">no picture</div>}
        {on && <span className="skin-check"><Check size={14} strokeWidth={3} /></span>}
      </div>
      <div className="skin-name ellipsis">{c.skinName}</div>
      <div className="skin-sub ellipsis">{c.heroName}</div>
    </button>
  )
}

export default function AutoCollageSheet({ onClose, onOpenWallet }) {
  const wallet = useWallet()
  const [shots, setShots] = useState([])                 // File[]
  const [urls, setUrls] = useState([])
  const [phase, setPhase] = useState('pick')             // pick | scanning | results | adding
  const [prog, setProg] = useState({ percent: 0, message: '' })
  const [cands, setCands] = useState([])                 // { key, heroName, skinName, group, box, page }
  const [shared, setShared] = useState([])
  const [picked, setPicked] = useState(() => new Set())
  const [perShot, setPerShot] = useState([])
  const [report, setReport] = useState('')
  const [info, setInfo] = useState(null)
  const [error, setError] = useState('')
  const [q, setQ] = useState('')
  const [open, setOpen] = useState({ maybe: true, shots: false, details: false })
  const [rescanning, setRescanning] = useState(-1)
  const paidFor = useRef(false)
  const ctrl = useRef(null)
  const input = useRef(null)

  useEffect(() => { loadSkinIndex(); import('../scan/scanner.js').then(m => m.warmUpScanner()).catch(() => {}) }, [])
  useEffect(() => {
    const u = shots.map(f => URL.createObjectURL(f)); setUrls(u)
    return () => u.forEach(URL.revokeObjectURL)
  }, [shots])

  const addFiles = files => {
    const list = [...files].filter(f => /^image\//.test(f.type) || /\.(png|jpe?g|webp)$/i.test(f.name))
    setShots(s => {
      const seen = new Set(s.map(f => `${f.name}|${f.size}`))
      const next = [...s, ...list.filter(f => !seen.has(`${f.name}|${f.size}`))]
      if (next.length > MAX_SHOTS) toast.error(`Up to ${MAX_SHOTS} screenshots at a time.`)
      return next.slice(0, MAX_SHOTS)
    })
    setError('')
  }

  const applyResult = (res, pageMap = i => i, merge = false) => {
    const sure = res.matches.map(r => ({ ...r, page: pageMap(r.page ?? 0), group: 'sure' }))
    const maybe = res.possible.map(r => ({ ...r, page: pageMap(r.page ?? 0), group: 'maybe' }))
    const amb = res.ambiguous.map(a => ({ ...a, page: pageMap(a.page ?? 0), options: a.options.map(o => ({ ...o, key: `${o.heroId}__${o.skinName}` })) }))
    if (!merge) {
      setCands([...sure, ...maybe]); setShared(amb); setPicked(new Set(sure.map(r => r.key)))
    } else {
      const sureKeys = new Set(sure.map(r => r.key))
      setCands(prev => {
        const have = new Map(prev.map(c => [c.key, c]))
        const out = prev.map(c => (sureKeys.has(c.key) && c.group === 'maybe' ? { ...c, group: 'sure' } : c))
        for (const r of [...sure, ...maybe]) if (!have.has(r.key)) out.push(r)
        return out
      })
      setShared(prev => [...prev, ...amb.filter(a => !prev.some(p => p.name === a.name))])
      setPicked(prev => { const n = new Set(prev); sure.forEach(r => n.add(r.key)); return n })
    }
  }

  const scan = async () => {
    if (!shots.length) return
    if (walletEnabled && !paidFor.current) {
      if (!wallet.user) { onOpenWallet(`Log in to use Auto Collage (₹${AUTO_COLLAGE_PRICE}, charged only when you add skins).`); return }
      let fresh = null
      try { fresh = await refreshWallet() } catch { fresh = null }
      if (fresh && fresh.balance < AUTO_COLLAGE_PRICE) { onOpenWallet(`Auto Collage costs ₹${AUTO_COLLAGE_PRICE}. Add money — your screenshots stay here.`); return }
    }
    setPhase('scanning'); setError('')
    const c = new AbortController(); ctrl.current = c
    try {
      const { scanScreenshots } = await import('../scan/scanner.js')
      const res = await scanScreenshots(shots, getVocab(), { signal: c.signal, onProgress: setProg })
      applyResult(res)
      setPerShot(res.shots); setReport(res.report); setInfo(res.info)
      const nothing = !res.matches.length && !res.possible.length && !res.ambiguous.length
      setOpen(o => ({ ...o, details: nothing, shots: nothing }))
      setPhase('results')
    } catch (err) {
      if (err?.name === 'AbortError') { setPhase('pick'); return }
      console.error('[auto collage]', err)
      setError(`Couldn't read the screenshots: ${err?.message || err}. Check your internet once (the reader downloads the first time) and try again.`)
      setPhase('pick')
    } finally { ctrl.current = null }
  }

  // read one screenshot again, closer (for small text)
  const rescan = async i => {
    setRescanning(i)
    try {
      const { scanScreenshots } = await import('../scan/scanner.js')
      const res = await scanScreenshots([shots[i]], getVocab(), { closer: true, onProgress: () => {} })
      applyResult(res, () => i, true)
      setPerShot(prev => prev.map(s => (s.file === i ? { ...res.shots[0], file: i } : s)))
      setReport(r => `${r}\n\n── closer look at screenshot ${i + 1} ──\n${res.report}`)
      const n = res.matches.length + res.possible.length
      toast(n ? `Found ${n} on screenshot ${i + 1}` : `Nothing more on screenshot ${i + 1}`)
    } catch (err) { toast.error(String(err?.message || err)) } finally { setRescanning(-1) }
  }

  const toggle = useCallback(key => setPicked(p => { const n = new Set(p); n.has(key) ? n.delete(key) : n.add(key); return n }), [])
  const addManual = s => {
    const key = s.id
    setCands(prev => (prev.some(c => c.key === key) ? prev : [...prev, { key, heroId: s.heroId, heroName: s.heroName, skinName: s.skinName, group: 'manual' }]))
    setPicked(p => new Set(p).add(key)); setQ('')
  }

  const chosen = useMemo(() => {
    const byKey = new Map(cands.map(c => [c.key, c]))
    for (const s of shared) for (const o of s.options) if (!byKey.has(o.key)) byKey.set(o.key, { ...o, page: s.page, box: s.box })
    const ticked = [...byKey.values()].filter(c => picked.has(c.key) && skinPicture(c.key))
    return sortForCollage([...sortByPosition(ticked.filter(c => c.box)), ...ticked.filter(c => !c.box)])
  }, [cands, shared, picked])

  const add = async () => {
    if (!chosen.length) return
    setError('')
    if (walletEnabled && !paidFor.current) {
      try { await chargeAutoCollage(chosen.length); paidFor.current = true } catch (err) {
        setError(walletError(err))
        if (/insufficient_balance|not_logged_in/.test(`${err?.code} ${err?.message}`)) onOpenWallet(walletError(err))
        return
      }
    }
    setPhase('adding'); setProg({ percent: 0, message: '' })
    const { items, failed } = await skinsToItems(chosen.map(c => c.key), done => setProg({ percent: Math.round(100 * done / chosen.length), message: `Getting skins… ${done} / ${chosen.length}` }))
    useCollage.getState().add(items)
    if (failed.length) toast.error(`${failed.length} skin(s) couldn't download. Add them again from "Add skins" when your internet is better.`, { duration: 7000 })
    else toast.success(`Added ${items.length} skins`)
    onClose()
  }

  const copyReport = async () => { try { await navigator.clipboard.writeText(report); toast.success('Copied') } catch { toast.error('Copy blocked') } }

  const sure = cands.filter(c => c.group === 'sure'), maybe = cands.filter(c => c.group === 'maybe'), mine = cands.filter(c => c.group === 'manual')
  const found = q.trim() ? searchSkins(q, 8) : []
  const close = () => { ctrl.current?.abort(); onClose() }

  return (
    <Sheet title="Auto Collage" subtitle={phase === 'results' ? `${sure.length} found${maybe.length ? ` · ${maybe.length} maybe` : ''}${info ? ` · read in ${info.seconds}s` : ''}` : 'Screenshots of your skins → collage'} onClose={close} full wide
      footer={
        phase === 'pick' ? (
          <button className="btn btn-primary btn-lg btn-block" disabled={!shots.length} onClick={scan}>
            <ScanSearch size={19} /> Find skins in {shots.length || ''} screenshot{shots.length === 1 ? '' : 's'}
          </button>
        ) : phase === 'scanning' ? (
          <button className="btn btn-ghost btn-block" onClick={() => ctrl.current?.abort()}>Cancel</button>
        ) : phase === 'results' ? (
          <div className="row">
            <button className="btn btn-ghost" onClick={() => { setPhase('pick'); setCands([]); setShared([]) }}>Back</button>
            <button className="btn btn-primary grow btn-lg" disabled={!chosen.length} onClick={add}>
              Add {chosen.length} skin{chosen.length === 1 ? '' : 's'}{walletEnabled && !paidFor.current ? ` · ₹${AUTO_COLLAGE_PRICE}` : ''}
            </button>
          </div>
        ) : null
      }>
      {error && <div className="note err" style={{ marginBottom: 12 }}>{error}</div>}

      {phase === 'pick' && (
        <>
          <input ref={input} type="file" accept="image/*" multiple hidden onChange={e => { addFiles(e.target.files); e.target.value = '' }} />
          {!shots.length ? (
            <button className="card" onClick={() => input.current.click()} style={{ width: '100%', padding: '36px 20px', textAlign: 'center', borderStyle: 'dashed', borderColor: 'rgba(201,166,107,.4)', background: 'var(--grad-soft)' }}>
              <ImagePlus size={36} color="#e2c79a" />
              <div className="h2" style={{ marginTop: 10 }}>Choose screenshots</div>
              <div className="small muted" style={{ marginTop: 6, lineHeight: 1.5 }}>Open your Collection / skins page in MLBB, take screenshots<br />where the skin names are visible, then pick them here.</div>
              {walletEnabled && <div className="badge pink" style={{ marginTop: 14 }}>₹{AUTO_COLLAGE_PRICE} · only charged when skins are added</div>}
            </button>
          ) : (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(96px, 1fr))', gap: 10 }}>
                {shots.map((f, i) => (
                  <div key={i} style={{ position: 'relative', aspectRatio: '9 / 16', borderRadius: 12, overflow: 'hidden', background: 'var(--surface-2)' }}>
                    {urls[i] && <img src={urls[i]} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}
                    <button className="icon-btn" style={{ position: 'absolute', top: 4, right: 4, width: 28, height: 28, background: 'rgba(0,0,0,.6)' }} onClick={() => setShots(s => s.filter((_, j) => j !== i))} aria-label="Remove"><X size={14} /></button>
                    <span className="badge" style={{ position: 'absolute', bottom: 4, left: 4, background: 'rgba(0,0,0,.65)' }}>{i + 1}</span>
                  </div>
                ))}
                <button onClick={() => input.current.click()} style={{ aspectRatio: '9 / 16', borderRadius: 12, border: '1.5px dashed var(--line-2)', display: 'grid', placeItems: 'center', color: 'var(--text-3)' }}><Plus size={26} /></button>
              </div>
              <p className="small muted" style={{ marginTop: 14 }}>Tip: clear screenshots with the names fully visible give the best results. Everything is read on your phone.</p>
            </>
          )}
        </>
      )}

      {(phase === 'scanning' || phase === 'adding') && (
        <div style={{ padding: '36px 4px' }}>
          <div className="center-fill" style={{ padding: 0, marginBottom: 18 }}><Spinner size={34} /></div>
          <div className="h3" style={{ textAlign: 'center', marginBottom: 12 }}>{prog.message || 'Starting…'}</div>
          <Progress value={(prog.percent || 0) / 100} />
          <div className="small muted" style={{ textAlign: 'center', marginTop: 8 }}>{prog.percent || 0}%</div>
        </div>
      )}

      {phase === 'results' && (
        <>
          {info && info.words < 15 && <div className="note warn" style={{ marginBottom: 14 }}>Hardly any text could be read. Make sure the screenshots show the skin names clearly.</div>}

          <section style={{ marginBottom: 20 }}>
            <div className="row" style={{ marginBottom: 10 }}>
              <span className="h3 grow" style={{ color: 'var(--green)' }}>Found · {sure.length}</span>
              {sure.length > 0 && <button className="chip" onClick={() => setPicked(p => { const all = sure.every(c => p.has(c.key)); const n = new Set(p); sure.forEach(c => (all ? n.delete(c.key) : n.add(c.key))); return n })}>Select all</button>}
            </div>
            {sure.length ? <div className="skin-grid">{sure.map(c => <Tile key={c.key} c={c} on={picked.has(c.key)} onToggle={toggle} />)}</div>
              : <p className="small muted">No skin names were recognised for sure.</p>}
          </section>

          {maybe.length > 0 && (
            <section style={{ marginBottom: 20 }}>
              <button className="row" style={{ marginBottom: 10, width: '100%' }} onClick={() => setOpen(o => ({ ...o, maybe: !o.maybe }))}>
                {open.maybe ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                <span className="h3 grow" style={{ color: 'var(--amber)', textAlign: 'left' }}>Maybe · {maybe.length}</span>
                <span className="tiny muted">tap the ones you own</span>
              </button>
              {open.maybe && <div className="skin-grid">{maybe.map(c => <Tile key={c.key} c={c} tone="maybe" on={picked.has(c.key)} onToggle={toggle} />)}</div>}
            </section>
          )}

          {shared.map(s => (
            <section key={s.name} style={{ marginBottom: 20 }}>
              <div className="h3" style={{ marginBottom: 4 }}>"{s.name}" — which hero?</div>
              <div className="small muted" style={{ marginBottom: 10 }}>Several heroes have a skin with this name.</div>
              <div className="skin-grid">{s.options.map(o => <Tile key={o.key} c={o} on={picked.has(o.key)} onToggle={toggle} />)}</div>
            </section>
          ))}

          <section style={{ marginBottom: 20 }}>
            <div className="h3" style={{ marginBottom: 10 }}>Missing one? Add it by name</div>
            <div className="search"><Search size={16} /><input className="field" placeholder="e.g. gusion cosmic gleam" value={q} onChange={e => setQ(e.target.value)} /></div>
            {found.length > 0 && (
              <div className="col" style={{ marginTop: 8, gap: 2 }}>
                {found.map(s => (
                  <button key={s.id} className="list-item" onClick={() => addManual(s)}>
                    <span className="li-icon" style={{ overflow: 'hidden' }}>{skinPicture(s.id) && <img src={skinPicture(s.id).url} alt="" crossOrigin="anonymous" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}</span>
                    <span className="grow"><b>{s.skinName}</b><br /><span className="small muted">{s.heroName}</span></span>
                    <Plus size={18} />
                  </button>
                ))}
              </div>
            )}
            {mine.length > 0 && <div className="skin-grid" style={{ marginTop: 12 }}>{mine.map(c => <Tile key={c.key} c={c} on={picked.has(c.key)} onToggle={toggle} />)}</div>}
          </section>

          <section style={{ marginBottom: 12 }}>
            <button className="row" style={{ width: '100%', marginBottom: 10 }} onClick={() => setOpen(o => ({ ...o, shots: !o.shots }))}>
              {open.shots ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
              <span className="h3 grow" style={{ textAlign: 'left' }}>Screenshot by screenshot</span>
            </button>
            {open.shots && perShot.map(s => (
              <div key={s.file} className="row" style={{ padding: '8px 0', borderBottom: '1px solid var(--line)' }}>
                <div style={{ width: 44, height: 64, borderRadius: 8, overflow: 'hidden', flexShrink: 0, background: 'var(--surface-2)' }}>{urls[s.file] && <img src={urls[s.file]} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}</div>
                <div className="grow">
                  <div className="small" style={{ fontWeight: 700 }}>Screenshot {s.file + 1}</div>
                  <div className="tiny muted">{s.failed ? 'could not be opened' : `${s.sure.length} found · ${s.maybe.length} maybe`}</div>
                </div>
                <button className="btn btn-ghost btn-sm" disabled={rescanning >= 0} onClick={() => rescan(s.file)}>
                  {rescanning === s.file ? <Spinner /> : <ZoomIn size={15} />} Look closer
                </button>
              </div>
            ))}
          </section>

          {report && (
            <section>
              <button className="row" style={{ width: '100%', marginBottom: 8 }} onClick={() => setOpen(o => ({ ...o, details: !o.details }))}>
                {open.details ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                <span className="small grow muted" style={{ textAlign: 'left', fontWeight: 600 }}>Scan details (for support)</span>
              </button>
              {open.details && (
                <>
                  <pre style={{ fontSize: 11, whiteSpace: 'pre-wrap', background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 10, padding: 10, maxHeight: 220, overflow: 'auto', color: 'var(--text-3)' }}>{report}</pre>
                  <button className="btn btn-ghost btn-sm" style={{ marginTop: 8 }} onClick={copyReport}><Copy size={14} /> Copy</button>
                </>
              )}
            </section>
          )}
        </>
      )}
    </Sheet>
  )
}
