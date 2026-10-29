// Ryuk Profile — turns MLBB screenshots into the "Ryuk profile" showcase edit.
// Everything is drawn in the browser (nothing is uploaded). The free preview is
// half size with a watermark; the HD export is full size and costs ₹10 from the
// wallet (free while the wallet is switched off, like Auto Collage).
import { useEffect, useMemo, useRef, useState } from 'react'
import { X } from 'lucide-react'
import { loadImage, extractPieces, defaultLayout, render, hitTest, toBlob } from './ryukProfileEngine'
import { useWallet, walletEnabled, walletError, chargeProfileExport, PROFILE_EXPORT_PRICE } from '../../utils/wallet'
import './RyukProfile.css'

const SLOTS = [
  { key: 'profile', label: 'Profile screenshot', hint: 'Profile page in the game', required: true },
  { key: 'skin', label: 'Skin art', hint: 'Splash art of the skin to show on the right' },
  { key: 'collection', label: 'Collection', hint: 'Collection → Collectible (collector badge on the right)' },
  { key: 'stats', label: 'Statistics', hint: 'Battlefield → Statistics (Matches, Win Rate, MVP circles)' },
  { key: 'weekly', label: 'Weekly pass', hint: 'Recharge → Weekly Diamond Pass (days + hours left)' },
  { key: 'coa', label: 'COA', hint: 'A draw page where your COA (star) shows next to diamonds' },
]
const MAX_ITEMS = 40
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
  const [effItems, setEffItems] = useState([])       // one Effects / Battle Emote screenshot per effect
  const [hiddenEff, setHiddenEff] = useState(() => new Set())
  const [heroItems, setHeroItems] = useState([])     // Battlefield → Favorite screenshots (hero cards found automatically)
  const [sideItems, setSideItems] = useState([])     // right side: skin grids and other pictures
  const [hiddenSide, setHiddenSide] = useState(() => new Set())
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
  const hadWeekly = useRef(false)
  const hadCoa = useRef(false)

  const paid = walletEnabled
  const price = PROFILE_EXPORT_PRICE

  // free the little upload previews when leaving
  const thumbsRef = useRef(thumbs)
  thumbsRef.current = thumbs
  const itemsRef = useRef(items)
  itemsRef.current = items
  const sideRef = useRef(sideItems)
  sideRef.current = sideItems
  const effRef = useRef(effItems)
  effRef.current = effItems
  const heroRef = useRef(heroItems)
  heroRef.current = heroItems
  useEffect(() => () => {
    Object.values(thumbsRef.current).forEach((u) => URL.revokeObjectURL(u))
    itemsRef.current.forEach((it) => URL.revokeObjectURL(it.url))
    sideRef.current.forEach((it) => URL.revokeObjectURL(it.url))
    effRef.current.forEach((it) => URL.revokeObjectURL(it.url))
    heroRef.current.forEach((it) => URL.revokeObjectURL(it.url))
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

  const addTo = (setList, max) => (e) => {
    const list = [...(e.target.files || [])]
    e.target.value = ''
    const good = list.filter((f) => /^image\//.test(f.type) && f.size <= 25 * 1024 * 1024)
    setMsg(good.length < list.length ? 'Some files were skipped (only PNG/JPG pictures up to 25 MB).' : '')
    setList((cur) => [...cur, ...good.slice(0, Math.max(0, max - cur.length)).map((file) => ({ id: ++itemSeq, file, url: URL.createObjectURL(file) }))])
  }
  const removeFrom = (setList) => (id) => setList((cur) => {
    const it = cur.find((x) => x.id === id)
    if (it) URL.revokeObjectURL(it.url)
    return cur.filter((x) => x.id !== id)
  })
  const addEff = addTo(setEffItems, 40)
  const removeEff = removeFrom(setEffItems)
  const addHero = addTo(setHeroItems, 10)
  const removeHero = removeFrom(setHeroItems)

  const addSide = (e) => {
    const list = [...(e.target.files || [])]
    e.target.value = ''
    const good = list.filter((f) => /^image\//.test(f.type) && f.size <= 25 * 1024 * 1024)
    setMsg(good.length < list.length ? 'Some files were skipped (only PNG/JPG pictures up to 25 MB).' : '')
    setSideItems((cur) => [...cur, ...good.slice(0, Math.max(0, 24 - cur.length)).map((file) => ({ id: ++itemSeq, file, url: URL.createObjectURL(file) }))])
  }
  const removeSide = (id) => setSideItems((cur) => {
    const it = cur.find((x) => x.id === id)
    if (it) URL.revokeObjectURL(it.url)
    return cur.filter((x) => x.id !== id)
  })

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
    if (!files.profile) { setPieces(null); return }
    let cancelled = false
    ;(async () => {
      setBusy(true)
      try {
        const imgs = {}
        await Promise.all(Object.entries(files).map(async ([k, f]) => { imgs[k] = await loadImage(f) }))
        imgs.extras = await Promise.all(items.map((it) => loadImage(it.file)))
        imgs.side = await Promise.all(sideItems.map((it) => loadImage(it.file)))
        imgs.effects = await Promise.all(effItems.map((it) => loadImage(it.file)))
        imgs.heroes = await Promise.all(heroItems.map((it) => loadImage(it.file)))
        if (cancelled) return
        const p = extractPieces(imgs)
        const sameSkin = lastSkin.current === files.skin
        lastSkin.current = files.skin
        const keepWeekly = hadWeekly.current && !!p.weekly   // read now: the update below runs later
        const keepCoa = hadCoa.current && !!p.coa
        setPieces(p)
        setLayout((old) => {
          const fresh = defaultLayout(p, { immortal })
          if (!old) return fresh
          // keep the person's tweaks; only reset the skin framing for a new skin
          return {
            ...fresh,
            skin: sameSkin ? old.skin : fresh.skin,
            tileSize: old.tileSize, groupDX: old.groupDX, groupDY: old.groupDY, rank: old.rank, cards: old.cards ?? fresh.cards,
            diamonds: { ...fresh.diamonds, scale: old.diamonds.scale, dx: old.diamonds.dx, dy: old.diamonds.dy },
            weekly: keepWeekly ? old.weekly : fresh.weekly,
            side: old.side ?? fresh.side, stats: old.stats ?? fresh.stats, sizes: old.sizes ?? fresh.sizes,
            coa: keepCoa ? old.coa : fresh.coa,
          }
        })
        hadWeekly.current = !!p.weekly
        hadCoa.current = !!p.coa
        setMsg('')
      } catch (err) {
        if (!cancelled) setMsg(err?.message || 'Could not read the pictures.')
      } finally {
        if (!cancelled) setBusy(false)
      }
    })()
    return () => { cancelled = true }
  }, [files, items, sideItems, effItems, heroItems]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { setLayout((l) => (l ? { ...l, immortal } : l)) }, [immortal])

  // which item pictures are switched on (kept even when more items are added)
  const view = useMemo(() => {
    if (!layout || !pieces) return layout
    const n = pieces.extras?.length || 0
    const m = pieces.side?.length || 0
    const e = pieces.effects?.length || 0
    return {
      ...layout,
      showEffects: effItems.slice(0, e).map((it) => !hiddenEff.has(it.id)),
      showExtras: items.slice(0, n).map((it) => !hiddenItems.has(it.id)),
      showSide: [...sideItems.map((it) => !hiddenSide.has(it.id)), ...Array(Math.max(0, m - sideItems.length)).fill(true)].slice(0, m),
    }
  }, [layout, pieces, items, hiddenItems, sideItems, hiddenSide, effItems, hiddenEff])

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

  const effCount = pieces?.effects?.length || 0
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
          <label className={`rp-slot${effItems.length ? ' has' : ''}`}>
            <input type="file" accept="image/png,image/jpeg,image/webp" multiple onChange={addEff} hidden />
            <span className="rp-plus">+</span>
            <span className="rp-slot-label">Effects &amp; emotes</span>
            <span className="rp-slot-hint">One screenshot per effect: Recall, Elimination, Notification, Spawn, Battle Emote… The one in use (yellow frame) is taken.</span>
          </label>
          <label className={`rp-slot${items.length ? ' has' : ''}`}>
            <input type="file" accept="image/png,image/jpeg,image/webp" multiple onChange={addItems} hidden disabled={items.length >= MAX_ITEMS} />
            <span className="rp-plus">+</span>
            <span className="rp-slot-label">Items</span>
            <span className="rp-slot-hint">Your own cropped pictures (borders, emotes…). Wide item cards keep their text.</span>
          </label>
          <label className={`rp-slot${heroItems.length ? ' has' : ''}`}>
            <input type="file" accept="image/png,image/jpeg,image/webp" multiple onChange={addHero} hidden />
            <span className="rp-plus">+</span>
            <span className="rp-slot-label">Favourite heroes</span>
            <span className="rp-slot-hint">Battlefield → Favorite. Every hero card fully on screen is found. Scroll and add more screenshots for more heroes.</span>
          </label>
          <label className={`rp-slot${sideItems.length ? ' has' : ''}`}>
            <input type="file" accept="image/png,image/jpeg,image/webp" multiple onChange={addSide} hidden />
            <span className="rp-plus">+</span>
            <span className="rp-slot-label">Right side extras</span>
            <span className="rp-slot-hint">Skin icon grids or other pictures. They go above the hero cards on the right.</span>
          </label>
        </div>

        {effItems.length > 0 && (
          <div className="rp-items">
            {effItems.map((it, i) => (
              <span key={it.id} className="rp-item">
                <img src={it.url} alt={`Effect screenshot ${i + 1}`} />
                <button type="button" onClick={() => removeEff(it.id)} aria-label={`Remove effect ${i + 1}`}><X size={12} /></button>
              </span>
            ))}
          </div>
        )}

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

        {heroItems.length > 0 && (
          <div className="rp-items">
            {heroItems.map((it, i) => (
              <span key={it.id} className="rp-item">
                <img src={it.url} alt={`Favourite heroes screenshot ${i + 1}`} />
                <button type="button" onClick={() => removeHero(it.id)} aria-label={`Remove favourite heroes screenshot ${i + 1}`}><X size={12} /></button>
              </span>
            ))}
          </div>
        )}
        {heroItems.length > 0 && pieces && (pieces.side?.length || 0) === sideItems.length && (
          <p className="rp-msg">No full hero card was found. Use a Favorite screenshot where at least one row of cards is fully on screen.</p>
        )}

        {sideItems.length > 0 && (
          <div className="rp-items">
            {sideItems.map((it, i) => (
              <span key={it.id} className={`rp-item${hiddenSide.has(it.id) ? ' off' : ''}`}>
                <img src={it.url} alt={`Right side picture ${i + 1}`}
                  onClick={() => setHiddenSide((h) => { const n = new Set(h); n.has(it.id) ? n.delete(it.id) : n.add(it.id); return n })} />
                <button type="button" onClick={() => removeSide(it.id)} aria-label={`Remove right side picture ${i + 1}`}><X size={12} /></button>
              </span>
            ))}
          </div>
        )}

        {!pieces && (
          <p className="rp-empty">{busy ? 'Reading your screenshots…' : 'Add the profile screenshot to start.'}</p>
        )}

        {pieces && view && (
          <>
            <div className="rp-stage">
              <canvas ref={canvasRef} onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp} />
              <span className="rp-tip">Drag the yellow boxes</span>
            </div>

            <div className="rp-controls">
              <div className="rp-card">
                <h3>Sizes</h3>
                {pieces.panel && <Slider id="rp-sz-panel" label="Collection" min={0.6} max={1.3} step={0.01} value={layout.sizes.panel} onChange={(v) => set('sizes.panel', v)} />}
                {pieces.circles && <Slider id="rp-st-s" label="Win rate circles" min={0.6} max={1.4} step={0.01} value={layout.stats.size} onChange={(v) => set('stats.size', v)} />}
                {pieces.diamonds && layout.diamonds.show && <Slider id="rp-sz-dia" label="Diamonds" min={0.5} max={2} step={0.01} value={layout.sizes.diamonds} onChange={(v) => set('sizes.diamonds', v)} />}
                {pieces.coa && layout.coa.show && <Slider id="rp-sz-coa" label="COA" min={0.5} max={2} step={0.01} value={layout.sizes.coa} onChange={(v) => set('sizes.coa', v)} />}
                {pieces.weekly && layout.weekly.show && <Slider id="rp-sz-wk" label="Weekly pass" min={0.6} max={2.5} step={0.01} value={layout.sizes.weekly} onChange={(v) => set('sizes.weekly', v)} />}
                {(effCount > 0 || itemCount > 0) && <Slider id="rp-tile-s" label="Effects (max)" min={100} max={200} value={layout.tileSize} onChange={(v) => set('tileSize', v)} />}
                {pieces.side?.length > 0 && <Slider id="rp-side-s" label="Hero cards" min={0.6} max={1.2} step={0.01} value={layout.side.size} onChange={(v) => set('side.size', v)} />}
                {pieces.extras?.some((x) => x.wide) && <Slider id="rp-card-s" label="Item cards" min={80} max={220} value={layout.cards.height} onChange={(v) => set('cards.height', v)} />}
              </div>

              {pieces.skin && (
              <div className="rp-card">
                <h3>Skin</h3>
                <Slider id="rp-skin-x" label="Left / right" min={150} max={900} value={layout.skin.centerFromRight} onChange={(v) => set('skin.centerFromRight', v)} invert />
                <Slider id="rp-skin-f" label="Focus" min={0.1} max={0.9} step={0.01} value={layout.skin.focusX} onChange={(v) => set('skin.focusX', v)} />
                <Slider id="rp-skin-z" label="Zoom" min={1} max={2} step={0.01} value={layout.skin.zoom} onChange={(v) => set('skin.zoom', v)} />
                <Slider id="rp-skin-y" label="Up / down" min={0} max={1} step={0.01} value={layout.skin.offsetY} onChange={(v) => set('skin.offsetY', v)} />
              </div>
              )}

              <div className="rp-card">
                <h3>Boxes</h3>
                <label className="rp-check">
                  <input id="rp-immortal" type="checkbox" checked={immortal} onChange={(e) => setImmortal(e.target.checked)} />
                  Highest rank is Immortal (highlight it)
                </label>
                {pieces.diamonds && (
                  <label className="rp-check">
                    <input id="rp-dia" type="checkbox" checked={layout.diamonds.show} onChange={(e) => set('diamonds.show', e.target.checked)} />
                    {pieces.weekly ? 'Include diamonds (from the weekly pass screenshot)' : 'Include diamonds'}
                  </label>
                )}
                {pieces.weekly && (
                  <label className="rp-check">
                    <input id="rp-weekly" type="checkbox" checked={layout.weekly.show} onChange={(e) => set('weekly.show', e.target.checked)} />
                    Show weekly pass
                  </label>
                )}
                {pieces.coa && (
                  <label className="rp-check">
                    <input id="rp-coa" type="checkbox" checked={layout.coa.show} onChange={(e) => set('coa.show', e.target.checked)} />
                    Show COA
                  </label>
                )}
                {(effCount > 0 || itemCount > 0) && (
                  <>
                    <div className="rp-chips">
                      {effItems.slice(0, effCount).map((it, i) => (
                        <button key={it.id} type="button" className={`rp-chip-img${hiddenEff.has(it.id) ? '' : ' on'}`}
                          aria-label={`Effect ${i + 1}`}
                          onClick={() => setHiddenEff((h) => { const n = new Set(h); n.has(it.id) ? n.delete(it.id) : n.add(it.id); return n })}>
                          <img src={it.url} alt="" /> Effect {i + 1}
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
