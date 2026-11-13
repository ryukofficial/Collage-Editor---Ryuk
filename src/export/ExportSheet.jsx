// Export: free full-quality PNG, or the paid Ryuk looks (Dark / Classic) with
// optional HD ×2. Everything runs on the phone; the wallet is only asked to
// take the ₹50 when the picture is ready.
import { useEffect, useMemo, useRef, useState } from 'react'
import { Download, Share2, Sparkles, Lock, Check, Zap, ImageIcon } from 'lucide-react'
import toast from 'react-hot-toast'
import { Sheet, Spinner, Progress } from '../ui/Sheet.jsx'
import { useCollage } from '../lib/store.js'
import { planExport } from './exporter.js'
import { useWallet, walletEnabled, walletError, chargeProExport, PRO_EXPORT_PRICE } from '../lib/wallet.js'
import { addExport, makeThumb } from '../lib/projects.js'

const fmtMP = (w, h) => `${w.toLocaleString()} × ${h.toLocaleString()} px · ${(w * h / 1e6).toFixed(1)} MP`
const pref = (k, d) => { try { return localStorage.getItem(k) ?? d } catch { return d } }
const setPref = (k, v) => { try { localStorage.setItem(k, v) } catch { /* */ } }

export function downloadBlob(blob, name) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = name
  document.body.appendChild(a); a.click(); a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 120000)
}

function isStale(e) { return /module script|dynamically imported module|error loading dynamically/i.test(e?.message || '') }

export default function ExportSheet({ onClose, onOpenWallet }) {
  const { items, bg, banner } = useCollage()
  const wallet = useWallet()
  const [look, setLook] = useState(() => pref('ryuk_export_look', 'free'))
  const [hd, setHd] = useState(() => pref('ryuk_hd_upscale', '1') !== '0')
  const [hdOk, setHdOk] = useState(null)
  const [phase, setPhase] = useState('options')       // options | working | pay | done
  const [prog, setProg] = useState({ p: 0, label: '' })
  const [hdInfo, setHdInfo] = useState(null)
  const [result, setResult] = useState(null)
  const [error, setError] = useState('')
  const ctrl = useRef(null)
  const skipHd = useRef(false)
  const paid = look !== 'free'

  useEffect(() => {
    import('./hd.js').then(m => m.hdSupported()).then(setHdOk).catch(() => setHdOk(false))
    import('./effect.js').then(m => m.prefetchEffect()).catch(() => {})
  }, [])
  useEffect(() => { if (paid && hd && hdOk) import('./hd.js').then(m => m.preloadHd()).catch(() => {}) }, [paid, hd, hdOk])

  const plan = useMemo(() => planExport(items, banner, { paid }), [items, banner, paid])
  const hdK = useMemo(() => Math.min(2, Math.sqrt((navigator.deviceMemory || 4) >= 8 ? 64e6 / (plan.W * plan.H) : 32e6 / (plan.W * plan.H))), [plan])
  const willHd = paid && hd && hdOk && hdK >= 1.1
  const outSize = willHd ? fmtMP(plan.cols * Math.round(plan.cell * hdK), Math.round(plan.bannerH * hdK) + plan.rows * Math.round(plan.cell * hdK)) : fmtMP(plan.W, plan.H)

  const choose = v => { setLook(v); setPref('ryuk_export_look', v) }
  const toggleHd = () => { setHd(h => { setPref('ryuk_hd_upscale', h ? '0' : '1'); return !h }) }

  async function start() {
    setError('')
    if (paid && walletEnabled) {
      if (!wallet.user) { onOpenWallet(`Ryuk exports cost ₹${PRO_EXPORT_PRICE}. Log in or create an account first.`); return }
      if ((wallet.balance ?? 0) < PRO_EXPORT_PRICE) { onOpenWallet(`Ryuk exports cost ₹${PRO_EXPORT_PRICE}. Add money to your wallet first.`); return }
    }
    setPhase('working')
    skipHd.current = false
    let note = ''
    const run = async useHd => {
      const c = new AbortController(); ctrl.current = c
      const { exportCollage } = await import('./exporter.js')
      let hdOpt = null
      if (useHd) {
        setProg({ p: 0, label: 'Starting HD…' })
        const m = await import('./hd.js')
        const session = await m.getHdSession()
        const p = planExport(items, banner, { paid, hdK })
        const cells = items.length
        const tiles = cells * m.tilesOf(p.cell, p.cell) + (p.bannerH ? m.tilesOf(p.W, p.bannerH) + Math.ceil(p.bannerH / 400) : 0)
        hdOpt = { session, k: hdK, clock: m.makeClock(tiles, (f, mins) => setHdInfo({ f, mins }), () => skipHd.current) }
      }
      return exportCollage(items, {
        bg, banner, look: paid ? look : null, hd: hdOpt, signal: c.signal,
        onProgress: (p, label) => setProg({ p, label }),
      })
    }
    try {
      let out
      try {
        out = await run(willHd)
      } catch (err) {
        if (!willHd || err?.name === 'AbortError' && !skipHd.current) throw err
        const why = { no_webgpu: "This browser can't run HD (it needs Chrome with WebGPU).", too_slow: 'HD would take too long on this phone.', cancelled: 'HD skipped.' }[err?.code] ||
          (skipHd.current ? 'HD skipped.' : "HD couldn't run on this phone.")
        console.warn('[hd]', err?.code || err?.message)
        note = `${why} Exported without HD.`
        setHdInfo(null)
        out = await run(false)
      }
      const look_ = paid ? look : 'free'
      const name = `ryukcreates-${look_ === 'free' ? '' : look_ + '-'}${Date.now()}.png`
      const res = { ...out, name, note }
      setResult(res)
      if (paid && walletEnabled) { setPhase('pay'); await pay(res) } else finish(res)
    } catch (err) {
      if (err?.name === 'AbortError') { setPhase('options'); return }
      console.error('[export]', err)
      setError(isStale(err) ? 'The website was just updated. Refresh the page and export again.' : `Export failed: ${err?.message || err}`)
      setPhase('options')
    } finally { ctrl.current = null }
  }

  async function pay(res = result) {
    setError('')
    try {
      await chargeProExport()
      finish(res)
    } catch (err) {
      setError(walletError(err))
      if (/insufficient_balance|not_logged_in/.test(`${err?.code} ${err?.message}`)) onOpenWallet(walletError(err))
    }
  }

  async function finish(res) {
    downloadBlob(res.blob, res.name)
    setPhase('done')
    if (res.failed?.length) toast.error(`${res.failed.length} skin${res.failed.length > 1 ? 's' : ''} couldn't download and ${res.failed.length > 1 ? 'are' : 'is'} empty. Export again when your internet is better.`, { duration: 7000 })
    else if (res.note) toast(res.note, { duration: 6000 })
    addExport({ name: res.name, count: items.length, size: `${res.width}×${res.height}`, look: paid ? look : 'free', thumb: await makeThumb(items, bg) }).catch(() => {})
  }

  const share = async () => {
    try {
      const file = new File([result.blob], result.name, { type: 'image/png' })
      if (navigator.canShare?.({ files: [file] })) await navigator.share({ files: [file], title: 'Ryuk Creates collage' })
      else downloadBlob(result.blob, result.name)
    } catch { /* closed */ }
  }

  const busy = phase === 'working'
  const close = () => { if (busy) { ctrl.current?.abort() } onClose() }

  const options = [
    { k: 'free', title: 'Original', sub: 'Full quality PNG, no effect', price: 'Free', icon: <ImageIcon size={20} /> },
    { k: 'dark', title: 'Ryuk Dark', sub: 'Deeper, richer tone + bigger logos', price: walletEnabled ? `₹${PRO_EXPORT_PRICE}` : '', icon: <Sparkles size={20} /> },
    { k: 'classic', title: 'Ryuk Classic', sub: 'The original Ryuk effect + bigger logos', price: walletEnabled ? `₹${PRO_EXPORT_PRICE}` : '', icon: <Sparkles size={20} /> },
  ]

  return (
    <Sheet title={phase === 'done' ? 'Exported' : 'Export'} subtitle={`${items.length} skins${banner ? ' + profile banner' : ''}`} onClose={close}
      footer={
        phase === 'options' ? (
          <button className="btn btn-primary btn-lg btn-block" onClick={start} disabled={!items.length}>
            {paid && walletEnabled ? <><Lock size={17} /> Export · ₹{PRO_EXPORT_PRICE}</> : <><Download size={18} /> Export PNG</>}
          </button>
        ) : phase === 'working' ? (
          <div className="row">
            {willHd && hdInfo && <button className="btn btn-ghost" onClick={() => { skipHd.current = true; ctrl.current?.abort() }}>Skip HD</button>}
            <div className="grow" />
            <button className="btn btn-ghost" onClick={() => ctrl.current?.abort()}>Cancel</button>
          </div>
        ) : phase === 'pay' ? (
          <button className="btn btn-primary btn-lg btn-block" onClick={() => pay()} disabled={!error}>
            {error ? 'Try payment again' : <><Spinner /> Taking ₹{PRO_EXPORT_PRICE} from your wallet…</>}
          </button>
        ) : (
          <div className="row">
            <button className="btn btn-ghost grow" onClick={() => downloadBlob(result.blob, result.name)}><Download size={17} /> Save again</button>
            <button className="btn btn-primary grow" onClick={share}><Share2 size={17} /> Share</button>
          </div>
        )
      }>
      {error && <div className="note err" style={{ marginBottom: 12 }}>{error}</div>}

      {phase === 'options' && (
        <div className="col" style={{ gap: 10 }}>
          {options.map(o => (
            <button key={o.k} className={`option ${look === o.k ? 'on' : ''}`} onClick={() => choose(o.k)}>
              <span className="li-icon" style={{ width: 40, height: 40, borderRadius: 12, display: 'grid', placeItems: 'center', background: o.k === 'free' ? 'var(--surface-2)' : 'var(--grad-soft)', color: o.k === 'free' ? 'var(--text-2)' : '#ff8fb0' }}>{o.icon}</span>
              <span className="grow"><span className="h3">{o.title}</span><br /><span className="small muted">{o.sub}</span></span>
              {o.price && <span className="price">{o.price}</span>}
              <span className="radio" />
            </button>
          ))}

          {paid && (
            <button className="option" onClick={toggleHd} disabled={hdOk === false} style={{ opacity: hdOk === false ? 0.6 : 1 }}>
              <span className="li-icon" style={{ width: 40, height: 40, borderRadius: 12, display: 'grid', placeItems: 'center', background: 'var(--surface-2)', color: 'var(--amber)' }}><Zap size={20} /></span>
              <span className="grow"><span className="h3">HD ×2 enhance</span><br />
                <span className="small muted">{hdOk === false ? 'Needs Chrome with WebGPU on a newer phone or computer' : hdK < 1.1 ? 'Already as big as phones can open' : 'Free · done on your phone · keep this page open'}</span></span>
              <span className={`switch ${willHd ? 'on' : ''}`} />
            </button>
          )}

          <div className="note" style={{ marginTop: 4 }}>
            <div className="row" style={{ gap: 8 }}><Check size={16} color="var(--green)" /> <b>{outSize}</b></div>
            <div className="small muted" style={{ marginTop: 4 }}>
              Every skin at {Math.round(willHd ? plan.cell * hdK : plan.cell)} px — no quality is lost{paid ? '' : ', nothing is shrunk'}. Large collages take a little longer; keep this page open.
            </div>
          </div>
          {paid && walletEnabled && wallet.user && <div className="tiny muted" style={{ textAlign: 'center' }}>Wallet balance ₹{wallet.balance ?? '…'} · you pay only when the picture is ready</div>}
        </div>
      )}

      {phase === 'working' && (
        <div style={{ padding: '18px 2px' }}>
          <div className="h3" style={{ marginBottom: 10 }}>{prog.label || 'Working…'}</div>
          <Progress value={prog.p} />
          <div className="small muted" style={{ marginTop: 8 }}>{Math.round(prog.p * 100)}%</div>
          {willHd && hdInfo && (
            <div className="note" style={{ marginTop: 16 }}>
              <div className="row" style={{ gap: 8 }}><Zap size={16} color="var(--amber)" /> HD enhance · {Math.round(hdInfo.f * 100)}% · about {hdInfo.mins} min left</div>
            </div>
          )}
          <div className="tiny muted" style={{ marginTop: 18 }}>Keep this page open until it finishes.</div>
        </div>
      )}

      {phase === 'pay' && (
        <div className="center-fill" style={{ minHeight: 160 }}>
          <div><Check size={34} color="var(--green)" /><div className="h3" style={{ marginTop: 8 }}>Your picture is ready</div>
            <div className="small muted">{result && fmtMP(result.width, result.height)}</div></div>
        </div>
      )}

      {phase === 'done' && result && (
        <div className="center-fill" style={{ minHeight: 180 }}>
          <div>
            <div style={{ width: 64, height: 64, borderRadius: 20, background: 'rgba(34,197,94,.14)', display: 'grid', placeItems: 'center', margin: '0 auto 12px' }}><Check size={32} color="var(--green)" /></div>
            <div className="h2">Saved to your downloads</div>
            <div className="small muted" style={{ marginTop: 6 }}>{fmtMP(result.width, result.height)} · {(result.blob.size / 1e6).toFixed(1)} MB PNG</div>
            {result.note && <div className="small" style={{ marginTop: 10, color: 'var(--amber)' }}>{result.note}</div>}
          </div>
        </div>
      )}
    </Sheet>
  )
}
