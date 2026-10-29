// Ryuk Profile — turns MLBB screenshots into the "Ryuk profile" showcase edit.
// Everything is drawn in the browser (nothing is uploaded). The free preview is
// half size with a watermark; the HD export is full size and costs ₹10 from the
// wallet (free while the wallet is switched off, like Auto Collage).
import { useEffect, useMemo, useRef, useState } from 'react'
import { X } from 'lucide-react'
import { loadImage, extractPieces, defaultLayout, render, hitTest, toBlob, TILE_KEYS } from './ryukProfileEngine'
import { useWallet, walletEnabled, walletError, chargeProfileExport, PROFILE_EXPORT_PRICE } from '../../utils/wallet'
import './RyukProfile.css'

const SLOTS = [
  { key: 'profile', label: 'Profile screenshot', hint: 'Profile page in the game', required: true },
  { key: 'skin', label: 'Skin art', hint: 'Splash art of the skin to show', required: true },
  { key: 'collection', label: 'Collection', hint: 'Collection → Collectible (collector badge on the right)' },
  { key: 'effects', label: 'Effects', hint: 'Any Effects tab (uses the equipped bar + diamonds)' },
]
const TILE_LABELS = { notification: 'Notification', spawn: 'Spawn', recall: 'Recall', elimination: 'Elimination' }
const MAX_ITEMS = 6
let itemSeq = 0

function download(blob, name) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = name
  document.body.appendChild(a); a.click(); a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 5000)
}

export default function RyukProfile({ onClose, onOpenWallet = () => {} }) {
  const wallet = useWallet()
  const [files, setFiles] = useState({})
  const [thumbs, setThumbs] = useState({})
  const [items, setItems] = useState([])            // extra item pictures: avatar borders, emotes…
  const [hiddenItems, setHiddenItems] = useState(() => new Set())
  const [pieces, setPieces] = useState(null)
  const [layout, setLayout] = useState(null)
  const [immortal, setImmortal] = useState(false)
  const [busy, setBusy] = useState(false)
  const [confirmPay, setConfirmPay] = useState(false)
  const [msg, setMsg] = useState('')
  const [active, setActive] = useState(null)
  const canvasRef = useRef(null)
  const drag = useRef(null)
  const raf = useRef(0)
  const lastSkin = useRef(null)

  const paid = walletEnabled
  const price = PROFILE_EXPORT_PRICE

  // free the little upload previews when leaving
  const thumbsRef = useRef(thumbs)
  thumbsRef.current = thumbs
  const itemsRef = useRef(items)
  itemsRef.current = items
  useEffect(() => () => {
    Object.values(thumbsRef.current).forEach((u) => URL.revokeObjectURL(u))
    itemsRef.current.forEach((it) => URL.revokeObjectURL(it.url))
  }, [])

  // Escape closes; other keys stay inside this screen, so the collage behind it
  // is never changed by Delete / Undo shortcuts while this is open
  const closeRef = useRef(onClose)
  closeRef.current = onClose
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') { e.stopImmediatePropagation(); closeRef.current?.(); return }
      if (e.target?.tagName === 'INPUT') return                       // sliders / checkboxes keep their keys
      if (['Tab', 'Enter', ' ', 'Spacebar'].includes(e.key)) return     // buttons keep working
      e.stopImmediatePropagation()
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [])

  const pick = (key) => (e) => {
    const f = e.target.files?.[0]
    e.target.value = ''
    if (!f) return
    if (!/^image\//.test(f.type)) { setMsg('Please choose a picture (PNG or JPG).'); return }
    if (f.size > 25 * 1024 * 1024) { setMsg('That picture is too large (max 25 MB).'); return }
    setMsg('')
    setFiles((p) => ({ ...p, [key]: f }))
    setThumbs((p) => { if (p[key]) URL.revokeObjectURL(p[key]); return { ...p, [key]: URL.createObjectURL(f) } })
  }

  const addItems = (e) => {
    const list = [...(e.target.files || [])]
    e.target.value = ''
    if (!list.length) return
    const good = list.filter((f) => /^image\//.test(f.type) && f.size <= 25 * 1024 * 1024)
    if (good.length < list.length) setMsg('Some files were skipped (only PNG/JPG pictures up to 25 MB).')
    else setMsg('')
    setItems((cur) => {
      const room = MAX_ITEMS - cur.length
      if (good.length > room) setMsg(`You can add up to ${MAX_ITEMS} items.`)
      return [...cur, ...good.slice(0, Math.max(0, room)).map((file) => ({ id: ++itemSeq, file, url: URL.createObjectURL(file) }))]
    })
  }
  const removeItem = (id) => setItems((cur) => {
    const it = cur.find((x) => x.id === id)
    if (it) URL.revokeObjectURL(it.url)
    return cur.filter((x) => x.id !== id)
  })

  // build the pieces whenever the uploads change
  useEffect(() => {
    if (!files.profile || !files.skin) { setPieces(null); return }
    let cancelled = false
    ;(async () => {
      setBusy(true)
      try {
        const imgs = {}
        await Promise.all(Object.entries(files).map(async ([k, f]) => { imgs[k] = await loadImage(f) }))
        imgs.extras = await Promise.all(items.map((it) => loadImage(it.file)))
        if (cancelled) return
        const p = extractPieces(imgs)
        const sameSkin = lastSkin.current === files.skin
        lastSkin.current = files.skin
        setPieces(p)
        setLayout((old) => {
          const fresh = defaultLayout(p, { immortal })
          if (!old) return fresh
          // keep the person's tweaks; only reset the skin framing for a new skin
          return {
            ...fresh,
            skin: sameSkin ? old.skin : fresh.skin,
            tileSize: old.tileSize, groupDX: old.groupDX, groupDY: old.groupDY, rank: old.rank, cards: old.cards ?? fresh.cards,
            showTiles: { ...fresh.showTiles, ...Object.fromEntries(TILE_KEYS.map((k) => [k, old.showTiles[k]])) },
            diamonds: { ...fresh.diamonds, scale: old.diamonds.scale, dx: old.diamonds.dx, dy: old.diamonds.dy },
          }
        })
        setMsg('')
      } catch (err) {
        if (!cancelled) setMsg(err?.message || 'Could not read the pictures.')
      } finally {
        if (!cancelled) setBusy(false)
      }
    })()
    return () => { cancelled = true }
  }, [files, items]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { setLayout((l) => (l ? { ...l, immortal } : l)) }, [immortal])

  // which item pictures are switched on (kept even when more items are added)
  const view = useMemo(() => {
    if (!layout || !pieces) return layout
    const n = pieces.extras?.length || 0
    return { ...layout, showExtras: items.slice(0, n).map((it) => !hiddenItems.has(it.id)) }
  }, [layout, pieces, items, hiddenItems])

  // draw the watermarked preview
  useEffect(() => {
    if (!pieces || !view) return
    cancelAnimationFrame(raf.current)
    raf.current = requestAnimationFrame(() => {
      const cv = canvasRef.current
      if (!cv) return
      const c = render(pieces, view, { scale: 0.5, watermark: true, highlight: active })
      cv.width = c.width; cv.height = c.height
      cv.getContext('2d').drawImage(c, 0, 0)
    })
    return () => cancelAnimationFrame(raf.current)
  }, [pieces, view, active])

  const set = (path, value) => setLayout((l) => {
    const n = { ...l }
    const keys = path.split('.')
    let o = n
    for (let i = 0; i < keys.length - 1; i++) { o[keys[i]] = { ...o[keys[i]] }; o = o[keys[i]] }
    o[keys[keys.length - 1]] = value
    return n
  })

  // ── drag the yellow boxes on the preview ──
  const toLayoutXY = (e) => {
    const r = canvasRef.current.getBoundingClientRect()
    return { x: (e.clientX - r.left) / r.width * pieces.W, y: (e.clientY - r.top) / r.height * 1080 }
  }
  const onDown = (e) => {
    if (!pieces || !layout) return
    const p = toLayoutXY(e)
    const g = hitTest(pieces, view, p.x, p.y)
    if (!g) return
    e.currentTarget.setPointerCapture?.(e.pointerId)
    drag.current = { g, p, start: g === 'group' ? { dx: layout.groupDX, dy: layout.groupDY } : { ...layout[g] } }
    setActive(g)
  }
  const onMove = (e) => {
    const d = drag.current
    if (!d) return
    const p = toLayoutXY(e)
    const dx = Math.round(d.start.dx + p.x - d.p.x), dy = Math.round(d.start.dy + p.y - d.p.y)
    if (d.g === 'group') setLayout((l) => ({ ...l, groupDX: dx, groupDY: dy }))
    else setLayout((l) => ({ ...l, [d.g]: { ...l[d.g], dx, dy } }))
  }
  const onUp = () => { drag.current = null; setActive(null) }

  const reset = () => pieces && setLayout(defaultLayout(pieces, { immortal }))

  const exportPreview = async () => {
    if (!pieces) return
    download(await toBlob(render(pieces, view, { scale: 0.5, watermark: true })), `ryuk-profile-preview-${Date.now()}.jpg`)
  }

  const exportHd = async () => {
    if (!pieces || busy) return
    setMsg('')
    if (paid) {
      if (!wallet.user) { onOpenWallet(`HD export costs ₹${price}. Log in or create an account first — your pictures stay here.`); return }
      if ((wallet.balance ?? 0) < price) { onOpenWallet(`HD export costs ₹${price}. Add money to your wallet first — your pictures stay here.`); return }
      if (!confirmPay) { setConfirmPay(true); return }
    }
    setConfirmPay(false)
    setBusy(true)
    try {
      // make the picture first, so nobody is charged if it fails
      const blob = await toBlob(render(pieces, view, { scale: 1, watermark: false }), 'image/jpeg', 0.95)
      if (!blob) throw new Error('Could not make the picture. Please try again.')
      if (paid) await chargeProfileExport()
      download(blob, `ryuk-profile-HD-${Date.now()}.jpg`)
    } catch (err) {
      const text = paid ? walletError(err) : (err?.message || 'Something went wrong. Please try again.')
      setMsg(text)
      if (paid && /insufficient_balance|not_logged_in/.test(`${err?.code} ${err?.message}`)) onOpenWallet(text)
    } finally {
      setBusy(false)
    }
  }

  const tileKeys = pieces?.tiles ? TILE_KEYS : []
  const itemCount = pieces?.extras?.length || 0
  const hdLabel = paid ? (confirmPay ? `Pay ₹${price} & download HD` : `HD export · ₹${price}`) : 'HD export'

  return (
    <div className="rp" role="dialog" aria-label="Ryuk Profile">
      <div className="rp-inner">
        <div className="rp-top">
          <h1>Ryuk Profile</h1>
          <button type="button" className="rp-close" onClick={onClose} aria-label="Close"><X size={18} /></button>
        </div>
        <p className="rp-sub">Upload your screenshots — the layout builds itself. Drag the yellow boxes and use the sliders to adjust.</p>

        <div className="rp-uploads">
          {SLOTS.map((s) => (
            <label key={s.key} className={`rp-slot${files[s.key] ? ' has' : ''}`}>
              <input type="file" accept="image/png,image/jpeg,image/webp" onChange={pick(s.key)} hidden />
              {thumbs[s.key] ? <img src={thumbs[s.key]} alt="" /> : <span className="rp-plus">+</span>}
              <span className="rp-slot-label">{s.label}{s.required && <b>*</b>}</span>
              <span className="rp-slot-hint">{s.hint}</span>
            </label>
          ))}
          <label className={`rp-slot${items.length ? ' has' : ''}`}>
            <input type="file" accept="image/png,image/jpeg,image/webp" multiple onChange={addItems} hidden disabled={items.length >= MAX_ITEMS} />
            <span className="rp-plus">+</span>
            <span className="rp-slot-label">Items</span>
            <span className="rp-slot-hint">Avatar borders, emotes… up to {MAX_ITEMS}. Item cards keep their name and text.</span>
          </label>
        </div>

        {items.length > 0 && (
          <div className="rp-items">
            {items.map((it, i) => (
              <span key={it.id} className="rp-item">
                <img src={it.url} alt={`Item ${i + 1}`} />
                <button type="button" onClick={() => removeItem(it.id)} aria-label={`Remove item ${i + 1}`}><X size={12} /></button>
              </span>
            ))}
          </div>
        )}

        {!pieces && (
          <p className="rp-empty">{busy ? 'Reading your screenshots…' : 'Add the profile screenshot and the skin art to start.'}</p>
        )}

        {pieces && view && (
          <>
            <div className="rp-stage">
              <canvas ref={canvasRef} onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp} />
              <span className="rp-tip">Drag the yellow boxes</span>
            </div>

            <div className="rp-controls">
              <div className="rp-card">
                <h3>Skin</h3>
                <Slider id="rp-skin-x" label="Left / right" min={150} max={900} value={layout.skin.centerFromRight} onChange={(v) => set('skin.centerFromRight', v)} invert />
                <Slider id="rp-skin-f" label="Focus" min={0.1} max={0.9} step={0.01} value={layout.skin.focusX} onChange={(v) => set('skin.focusX', v)} />
                <Slider id="rp-skin-z" label="Zoom" min={1} max={2} step={0.01} value={layout.skin.zoom} onChange={(v) => set('skin.zoom', v)} />
                <Slider id="rp-skin-y" label="Up / down" min={0} max={1} step={0.01} value={layout.skin.offsetY} onChange={(v) => set('skin.offsetY', v)} />
              </div>

              <div className="rp-card">
                <h3>Boxes</h3>
                <label className="rp-check">
                  <input id="rp-immortal" type="checkbox" checked={immortal} onChange={(e) => setImmortal(e.target.checked)} />
                  Highest rank is Immortal (highlight it)
                </label>
                {pieces.diamonds && (
                  <label className="rp-check">
                    <input id="rp-dia" type="checkbox" checked={layout.diamonds.show} onChange={(e) => set('diamonds.show', e.target.checked)} />
                    Show diamonds
                  </label>
                )}
                {pieces.diamonds && layout.diamonds.show && (
                  <Slider id="rp-dia-s" label="Diamonds size" min={1} max={2.6} step={0.05} value={layout.diamonds.scale} onChange={(v) => set('diamonds.scale', v)} />
                )}
                {(tileKeys.length > 0 || itemCount > 0) && (
                  <>
                    <Slider id="rp-tile-s" label="Tile size" min={110} max={200} value={layout.tileSize} onChange={(v) => set('tileSize', v)} />
                    <div className="rp-chips">
                      {tileKeys.map((k) => (
                        <button key={k} type="button" className={layout.showTiles[k] ? 'on' : ''} onClick={() => set('showTiles.' + k, !layout.showTiles[k])}>
                          {TILE_LABELS[k]}
                        </button>
                      ))}
                      {items.slice(0, itemCount).map((it, i) => (
                        <button key={it.id} type="button" className={`rp-chip-img${hiddenItems.has(it.id) ? '' : ' on'}`}
                          aria-label={`Item ${i + 1}`}
                          onClick={() => setHiddenItems((h) => { const n = new Set(h); n.has(it.id) ? n.delete(it.id) : n.add(it.id); return n })}>
                          <img src={it.url} alt="" /> Item {i + 1}
                        </button>
                      ))}
                    </div>
                  </>
                )}
                {pieces.extras?.some((x) => x.wide) && (
                  <Slider id="rp-card-s" label="Item card size" min={80} max={220} value={layout.cards.height} onChange={(v) => set('cards.height', v)} />
                )}
                <button type="button" className="rp-link" onClick={reset}>Reset layout</button>
              </div>
            </div>

            <div className="rp-export">
              <button type="button" className="rp-btn ghost" onClick={exportPreview} disabled={busy}>Free preview (watermark)</button>
              <button type="button" className="rp-btn" onClick={exportHd} disabled={busy}>{busy ? 'Working…' : hdLabel}</button>
            </div>
            {confirmPay && !busy && (
              <p className="rp-note">₹{price} will be taken from your wallet (balance ₹{wallet.balance ?? '…'}). <button type="button" className="rp-link" onClick={() => setConfirmPay(false)}>Cancel</button></p>
            )}
          </>
        )}
        {msg && <p className="rp-msg">{msg}</p>}
      </div>
    </div>
  )
}

function Slider({ id, label, min, max, step = 1, value, onChange, invert = false }) {
  const v = invert ? max + min - value : value
  return (
    <label className="rp-slider" htmlFor={id}>
      <span>{label}</span>
      <input id={id} type="range" min={min} max={max} step={step} value={v}
        onChange={(e) => { const n = Number(e.target.value); onChange(invert ? max + min - n : n) }} />
    </label>
  )
}
