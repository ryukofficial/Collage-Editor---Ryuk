import { useState, useRef, useCallback, useEffect } from 'react'
import skinsData from '../../skins.json'
import useStore from '../store/useStore'
import { ASSET_REPOS, cdnUrl, loadAssetFiles } from '../utils/assetRepos'
import { sortForCollage } from '../utils/skinSeries'
import { useWallet, walletEnabled, refreshWallet, walletError, AUTO_COLLAGE_PRICE } from '../utils/wallet'
import { scanScreenshotsOnServer } from '../utils/serverScan'
import { buildVocabulary, scanScreenshots, disposeScanner, sortByPosition, norm } from '../utils/skinScanner'

// ─────────────────────────────────────────────────────────────────────────────
// Auto Collage
//
//   screenshots ──► skinScanner (reads the text on your own device — free, no API
//                   key, nothing is uploaded) ──► you check the list ──► collage
// ─────────────────────────────────────────────────────────────────────────────

const MAX_SCREENSHOTS = 40
const IMAGE_EXT = /\.(jpg|jpeg|png|webp)$/i

// ── Finding a skin's picture in the asset repos ──────────────────────────────

function slugify(str) {
  return str.toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim()
}

// How well an image filename (already slugified, no extension) fits a skin: 0 – 1
function matchScore(slug, heroId, skinName) {
  if (!slug.includes(heroId.toLowerCase())) return 0
  const keywords = slugify(skinName).split(' ').filter(w => w.length >= 3)
  if (keywords.length === 0) return 1
  const matched = keywords.filter(kw => slug.includes(kw))
  return matched.length / keywords.length
}

function candidateNames(heroName, skinName) {
  return [
    `${heroName} ${skinName}.jpg`,
    `${heroName} ${skinName}.png`,
    `${heroName} ${skinName}.webp`,
    `${heroName.toLowerCase()} ${skinName.toLowerCase()}.jpg`,
    `${heroName} ${skinName.split(' ')[0]}.jpg`,
  ]
}

// The merged file list of every repo in ASSET_REPOS (loaded once and cached by
// assetRepos), indexed once so looking up a few dozen skins stays instant.
let _index = null
async function getIndex() {
  const files = await loadAssetFiles()
  if (!_index || _index.files !== files) {
    _index = {
      files,
      byName: new Map(files.map(f => [f.name.toLowerCase(), f.url])),
      slugs: files.map(f => ({ url: f.url, slug: slugify(f.name.replace(IMAGE_EXT, '')) })),
    }
  }
  return _index
}

function lookup(index, heroId, heroName, skinName) {
  // 1) exact filename guess (case-insensitive) — gives the real-cased URL
  for (const candidate of candidateNames(heroName, skinName)) {
    const hit = index.byName.get(candidate.toLowerCase())
    if (hit) return hit
  }
  // 2) fuzzy match across all repos
  let best = null, bestScore = 0.3
  for (const f of index.slugs) {
    const score = matchScore(f.slug, heroId, skinName)
    if (score > bestScore) { bestScore = score; best = f.url }
  }
  return best
}

// For thumbnails.  string = found · null = the repos have no picture for it ·
// undefined = the file list could not be loaded (so we simply don't know).
const _thumbCache = new Map()
async function findThumb(rec) {
  if (_thumbCache.has(rec.key)) return _thumbCache.get(rec.key)
  let url
  try {
    url = lookup(await getIndex(), rec.heroId, rec.heroName, rec.skinName)
  } catch {
    return undefined
  }
  _thumbCache.set(rec.key, url)
  return url
}

const probe = url => new Promise(resolve => {
  const img = new Image()
  img.crossOrigin = 'anonymous'
  img.onload  = () => resolve(true)
  img.onerror = () => resolve(false)
  img.src = url
})

// For adding to the canvas: same lookup, plus a last resort when the file list
// is unavailable (e.g. GitHub API rate limit) — probe each repo's CDN directly.
async function fetchSkinImage(heroId, heroName, skinName) {
  const found = await findThumb({ key: `${heroId}__${skinName}`, heroId, heroName, skinName })
  if (found) return found
  if (found === null) return null

  for (const repo of ASSET_REPOS) {
    for (const candidate of candidateNames(heroName, skinName)) {
      const url = cdnUrl(repo, candidate)
      if (await probe(url)) return url
    }
  }
  return null
}

function loadImg(src) {
  return new Promise(resolve => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload  = () => resolve({ src, naturalWidth: img.naturalWidth, naturalHeight: img.naturalHeight })
    img.onerror = () => resolve(null)
    img.src = src
  })
}

// Like Promise.all(items.map(fn)) but with at most `limit` running at once.
async function mapLimit(items, limit, fn) {
  const out = new Array(items.length)
  let next = 0
  const run = async () => {
    while (next < items.length) {
      const i = next++
      out[i] = await fn(items[i], i)
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, run))
  return out
}

// ── The skin list (for the scanner and for "add a skin yourself") ────────────

let _vocab = null
function getVocab() {
  if (!_vocab) _vocab = buildVocabulary(skinsData)
  return _vocab
}

let _allSkins = null
function allSkins() {
  if (!_allSkins) {
    _allSkins = []
    for (const hero of skinsData) {
      for (const skin of hero.skins || []) {
        _allSkins.push({
          key: `${hero.id}__${skin.name}`,
          heroId: hero.id, heroName: hero.name, skinName: skin.name, tier: skin.tier || '',
          hay: norm(`${hero.name} ${skin.name}`),
        })
      }
    }
  }
  return _allSkins
}

function searchSkins(query, limit = 10) {
  const words = norm(query).split(' ').filter(Boolean)
  if (!words.length) return []
  return allSkins().filter(s => words.every(w => s.hay.includes(w))).slice(0, limit)
}

const fileId = f => `${f.name}|${f.size}|${f.lastModified}`

function scanErrorMessage(err) {
  const msg = String(err?.message || err || '').trim()
  return `Scan failed${msg ? `: ${msg}` : ''}. The text reader downloads once (about 6 MB), so make sure you're online and try again.`
}

// ── Small pieces ─────────────────────────────────────────────────────────────

const ACCENT = { sure: '#22c55e', maybe: '#f59e0b', pick: '#ff3d77' }

function Art({ url }) {
  const [broken, setBroken] = useState(false)
  useEffect(() => { setBroken(false) }, [url])
  if (url && !broken) {
    return (
      <img
        src={url} alt="" loading="lazy" decoding="async"
        onError={() => setBroken(true)}
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
      />
    )
  }
  return (
    <div style={{
      position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
      textAlign: 'center', padding: '4px', color: '#636366', fontSize: '10px', fontWeight: 700,
    }}>
      {url === undefined ? '…' : 'No image'}
    </div>
  )
}

function SkinCard({ rec, url, on, tone, onToggle }) {
  const accent = ACCENT[tone] || ACCENT.sure
  return (
    <button
      type="button" onClick={onToggle} aria-pressed={on}
      title={`${rec.heroName} — ${rec.skinName}`}
      style={{
        padding: 0, textAlign: 'left', cursor: 'pointer', borderRadius: '9px', overflow: 'hidden',
        background: '#000000', border: `2px solid ${on ? accent : '#2c2c2e'}`,
        opacity: on ? 1 : 0.55, transition: 'opacity 0.12s, border-color 0.12s',
      }}
    >
      <div style={{ width: '100%', paddingBottom: '100%', position: 'relative', background: '#1c1c1e' }}>
        <Art url={url} />
        {on && (
          <span style={{
            position: 'absolute', top: '4px', right: '4px', width: '18px', height: '18px', borderRadius: '50%',
            background: accent, color: '#fff', fontSize: '11px', fontWeight: 800,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>✓</span>
        )}
      </div>
      <div style={{ padding: '4px 5px 5px' }}>
        <p style={{ margin: 0, fontSize: '10px', color: '#ff6b96', fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{rec.heroName}</p>
        <p style={{ margin: 0, fontSize: '9px', color: '#aeaeb2', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{rec.skinName}</p>
      </div>
    </button>
  )
}

const gridStyle = { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(84px, 1fr))', gap: '8px', marginBottom: '18px' }
const sectionTitle = (color) => ({ margin: '0 0 3px', fontSize: '12px', fontWeight: 700, color })
const sectionHint  = { margin: '0 0 8px', fontSize: '11px', color: '#8e8e93' }
const errorBox = { marginBottom: '12px', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: '10px', padding: '10px 14px' }

// Full-screen view of one screenshot with a box around every skin name the scan
// found in it, so a card without a box is easy to spot.
function ShotViewer({ url, shot, picked, thumbs, title, onClose, onPrev, onNext }) {
  const [size, setSize] = useState(null)
  useEffect(() => { setSize(null) }, [url])
  const boxes = [
    ...shot.sure.map(m => ({ ...m, tone: 'sure' })),
    ...shot.maybe.map(m => ({ ...m, tone: 'maybe' })),
  ].filter(m => m.box)
  const navBtn = { background: 'rgba(255,255,255,0.08)', border: '1px solid #2c2c2e', borderRadius: '10px', color: '#ffffff', fontSize: '13px', fontWeight: 600, padding: '9px 14px', cursor: 'pointer' }
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 400, background: '#0b0d10', display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', padding: '12px 14px' }}>
        <p style={{ margin: 0, color: '#ffffff', fontSize: '13px', fontWeight: 700 }}>{title}</p>
        <button type="button" onClick={onClose} aria-label="Close" style={{ background: 'none', border: 'none', color: '#aaa', fontSize: '22px', cursor: 'pointer', lineHeight: 1 }}>✕</button>
      </div>
      <p style={{ margin: '0 14px 8px', color: '#aeaeb2', fontSize: '11px', lineHeight: 1.5 }}>
        <span style={{ color: '#22c55e' }}>Green box</span> = found and going in the collage,{' '}
        <span style={{ color: '#f87171' }}>red</span> = found but left out (no picture or unticked),{' '}
        <span style={{ color: '#f59e0b' }}>amber</span> = maybe. A skin name with no box was missed:
        add it with “Missing a skin?”.
      </p>
      <div style={{ flex: 1, overflow: 'auto', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 8px' }}>
        <div style={{ position: 'relative', display: 'inline-block', maxWidth: '100%' }}>
          <img
            src={url} alt=""
            onLoad={e => setSize({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })}
            style={{ display: 'block', maxWidth: '100%', maxHeight: '70vh', objectFit: 'contain' }}
          />
          {size && boxes.map((m, i) => {
            const pad = 0.004
            const on = m.tone === 'sure' && picked.has(m.key)
            const noPic = thumbs[m.key] === null
            const color = m.tone === 'maybe' ? '#f59e0b' : on && !noPic ? '#22c55e' : '#f87171'
            return (
              <div key={i} title={`${m.heroName} — ${m.skinName}`} style={{
                position: 'absolute', pointerEvents: 'none', border: `2px solid ${color}`, borderRadius: '4px',
                left: `${(m.box.x0 / size.w - pad) * 100}%`, top: `${(m.box.y0 / size.h - pad) * 100}%`,
                width: `${((m.box.x1 - m.box.x0) / size.w + 2 * pad) * 100}%`, height: `${((m.box.y1 - m.box.y0) / size.h + 2 * pad) * 100}%`,
              }} />
            )
          })}
        </div>
      </div>
      <div style={{ padding: '10px 14px 4px', maxHeight: '22vh', overflow: 'auto' }}>
        {shot.failed && <p style={{ margin: 0, color: '#f87171', fontSize: '12px' }}>This screenshot could not be opened.</p>}
        {[...shot.sure, ...shot.maybe].map((m, i) => {
          const isMaybe = i >= shot.sure.length
          const noPic = thumbs[m.key] === null
          const left = !isMaybe && !picked.has(m.key)
          return (
            <p key={i} style={{ margin: '0 0 3px', fontSize: '12px', color: isMaybe ? '#f59e0b' : left || noPic ? '#f87171' : '#ffffff' }}>
              {isMaybe ? '? ' : '✓ '}{m.skinName} <span style={{ color: '#aeaeb2' }}>— {m.heroName}</span>
              {noPic && <span style={{ color: '#f87171' }}> · no picture in your repos</span>}
              {left && !noPic && <span style={{ color: '#f87171' }}> · unticked</span>}
              {isMaybe && <span style={{ color: '#aeaeb2' }}> · maybe (not ticked)</span>}
            </p>
          )
        })}
      </div>
      <div style={{ display: 'flex', gap: '8px', justifyContent: 'space-between', padding: '8px 14px 18px' }}>
        <button type="button" onClick={onPrev} disabled={!onPrev} style={{ ...navBtn, opacity: onPrev ? 1 : 0.35 }}>← Previous</button>
        <button type="button" onClick={onNext} disabled={!onNext} style={{ ...navBtn, opacity: onNext ? 1 : 0.35 }}>Next →</button>
      </div>
    </div>
  )
}

// ── Main Component ────────────────────────────────────────────────────────────
export default function AutoCollage({ onClose, onOpenWallet = () => {} }) {
  const wallet = useWallet()
  const addImages    = useStore(s => s.addImages)
  const saveSnapshot = useStore(s => s.saveSnapshot)

  const [step, setStep]               = useState('upload')   // upload | ready | scanning | results | adding
  const [screenshots, setScreenshots] = useState([])
  const [progress, setProgress]       = useState({ percent: 0, message: '' })
  const [error, setError]             = useState('')
  const [skipped, setSkipped]         = useState([])
  const [cands, setCands]             = useState([])          // skins shown in the lists (sure / maybe / manual)
  const [shared, setShared]           = useState([])          // names that belong to several heroes
  const [picked, setPicked]           = useState(() => new Set())
  const [thumbs, setThumbs]           = useState({})
  const [query, setQuery]             = useState('')
  const [addOpen, setAddOpen]         = useState(false)       // the "add a skin by name" box
  const [focusSearch, setFocusSearch] = useState(false)       // true only when the person opened that box themselves
  const [report, setReport]           = useState('')          // plain-text "what the scanner saw" (troubleshooting)
  const [readInfo, setReadInfo]       = useState(null)        // { words, engine } from the last scan
  const [shots, setShots]             = useState([])          // what each screenshot showed on its own
  const [shotsOpen, setShotsOpen]     = useState(false)
  const [viewShot, setViewShot]       = useState(-1)          // index into shots of the one shown full screen
  const [detailsOpen, setDetailsOpen] = useState(false)
  const [copied, setCopied]           = useState(false)
  const fileRef  = useRef()
  const abortRef = useRef(null)

  // Stop any scan and free the text reader's memory when the sheet closes.
  useEffect(() => () => {
    if (abortRef.current) abortRef.current.abort()
    disposeScanner()
  }, [])

  // Small previews of the chosen screenshots (one object URL per file, freed when
  // the file is removed or the sheet closes).
  const previewUrls = useRef(new Map())
  const previewOf = (file) => {
    const id = fileId(file)
    let url = previewUrls.current.get(id)
    if (!url) { url = URL.createObjectURL(file); previewUrls.current.set(id, url) }
    return url
  }
  useEffect(() => {
    const keep = new Set(screenshots.map(fileId))
    for (const [id, url] of previewUrls.current) {
      if (!keep.has(id)) { URL.revokeObjectURL(url); previewUrls.current.delete(id) }
    }
  }, [screenshots])
  useEffect(() => () => {
    previewUrls.current.forEach(url => URL.revokeObjectURL(url))
    previewUrls.current.clear()
  }, [])

  // Look up a picture for every skin on the results screen.
  useEffect(() => {
    if (step !== 'results') return
    let alive = true
    const recs = [...cands, ...shared.flatMap(s => s.options)]
    Promise.all(recs.map(async r => [r.key, await findThumb(r)])).then(pairs => {
      if (alive) setThumbs(prev => ({ ...prev, ...Object.fromEntries(pairs) }))
    })
    return () => { alive = false }
  }, [step, cands, shared])

  const handleFiles = useCallback((fileList) => {
    const incoming = Array.from(fileList).filter(f => f.type.startsWith('image/'))
    if (!incoming.length) return
    setScreenshots(prev => {
      const seen = new Set(prev.map(fileId))
      const merged = [...prev]
      for (const f of incoming) {
        if (seen.has(fileId(f))) continue
        seen.add(fileId(f))
        merged.push(f)
      }
      return merged.slice(0, MAX_SCREENSHOTS)
    })
    setStep('ready')
    setError('')
  }, [])

  const removeScreenshot = useCallback((index) => {
    setScreenshots(prev => prev.filter((_, i) => i !== index))
  }, [])

  // removed the last screenshot → back to the empty upload box
  useEffect(() => {
    if (step === 'ready' && screenshots.length === 0) setStep('upload')
  }, [step, screenshots])

  const handleScan = useCallback(async () => {
    if (!screenshots.length) return
    // Paid mode: the screenshots are read on the server after ₹10 is taken
    if (walletEnabled) {
      if (!wallet.ready) return
      if (!wallet.user) { onOpenWallet(`Log in to scan (₹${AUTO_COLLAGE_PRICE} per Auto Collage scan; refunded if no skin is found).`); return }
      let fresh = null
      try { fresh = await refreshWallet() } catch { fresh = null }
      if (!fresh || fresh.balance < AUTO_COLLAGE_PRICE) {
        onOpenWallet(`You need ₹${AUTO_COLLAGE_PRICE} to scan. Add money below — your screenshots stay selected.`)
        return
      }
    }
    const ctrl = new AbortController()
    abortRef.current = ctrl
    setStep('scanning')
    setError('')
    setProgress({ percent: 0, message: 'Starting…' })

    try {
      const scan = walletEnabled ? scanScreenshotsOnServer : scanScreenshots
      const res = await scan(screenshots, getVocab(), {
        signal: ctrl.signal,
        onProgress: p => setProgress({ percent: p.percent, message: p.message }),
      })

      setCands([
        ...res.matches.map(r => ({ ...r, group: 'sure' })),
        ...res.possible.map(r => ({ ...r, group: 'maybe' })),
      ])
      setShared(res.ambiguous.map(a => ({
        ...a,
        options: a.options.map(o => ({ ...o, key: `${o.heroId}__${o.skinName}` })),
      })))
      setPicked(new Set(res.matches.map(r => r.key)))      // sure ones start ticked, "maybe" ones don't
      setSkipped(res.skipped || [])
      setQuery('')
      const nothing = !res.matches.length && !res.possible.length && !res.ambiguous.length
      setAddOpen(nothing)
      setFocusSearch(false)                                // don't pop the keyboard up over the results
      setReport(res.report || '')
      setReadInfo(res.info || null)
      setShots(res.shots || [])
      setShotsOpen(false); setViewShot(-1)
      setDetailsOpen(nothing)                              // show the details straight away when nothing was found
      setCopied(false)
      setStep('results')
    } catch (err) {
      if (err?.name === 'AbortError') { setStep('ready'); return }
      console.error('[AutoCollage] scan failed', err)
      setError(walletEnabled ? walletError(err) : scanErrorMessage(err))
      setStep('ready')
      if (walletEnabled && /insufficient_balance|not_logged_in/.test(`${err?.code} ${err?.message}`)) onOpenWallet(walletError(err))
    } finally {
      if (abortRef.current === ctrl) abortRef.current = null
    }
  }, [screenshots, wallet.ready, wallet.user, onOpenWallet])

  const handleCancel = useCallback(() => {
    if (abortRef.current) abortRef.current.abort()
  }, [])

  const toggle = useCallback((key) => {
    setPicked(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key); else next.add(key)
      return next
    })
  }, [])

  const addManual = useCallback((skin) => {
    setCands(prev => (prev.some(c => c.key === skin.key) ? prev : [...prev, { ...skin, group: 'manual' }]))
    setPicked(prev => new Set(prev).add(skin.key))
  }, [])

  // Everything that is ticked and has a picture to use, in the order it appears
  // in the screenshots (skins added by hand go last), without duplicates.
  const chosenSkins = useCallback(() => {
    const byKey = new Map()
    for (const c of cands) byKey.set(c.key, c)
    for (const s of shared) {
      for (const o of s.options) if (!byKey.has(o.key)) byKey.set(o.key, { ...o, page: s.page, box: s.box, h: s.h })
    }
    const ticked = [...byKey.values()].filter(c => picked.has(c.key) && thumbs[c.key] !== null)
    // screenshot order first, then the Auto Collage series order (see utils/skinSeries.js)
    return sortForCollage([...sortByPosition(ticked.filter(c => c.box)), ...ticked.filter(c => !c.box)])
  }, [cands, shared, picked, thumbs])

  const handleAddToCanvas = useCallback(async () => {
    const chosen = chosenSkins()
    if (!chosen.length) return
    setStep('adding')
    setError('')
    setProgress({ percent: 0, message: `Fetching ${chosen.length} skin images…` })

    let done = 0
    const loaded = await mapLimit(chosen, 6, async ({ heroId, heroName, skinName }) => {
      let out = null
      const url = await fetchSkinImage(heroId, heroName, skinName)
      if (url) {
        const img = await loadImg(url)
        if (img) {
          out = {
            src: url,
            name: `${heroName} — ${skinName}`,
            naturalWidth: img.naturalWidth,
            naturalHeight: img.naturalHeight,
            fileSize: 0,
          }
        }
      }
      done++
      setProgress({ percent: Math.round(100 * done / chosen.length), message: `Fetching ${done} / ${chosen.length}: ${heroName} — ${skinName}` })
      return out
    })
    const results = loaded.filter(Boolean)

    if (!results.length) {
      setError('Could not load any skin images. Check your internet connection.')
      setStep('results')
      return
    }

    // ── Grid layout: fill canvas edge to edge, no gaps, all 1:1 ──
    const CANVAS_W = 3840
    const CANVAS_H = 2160
    const total = results.length
    const cols = Math.ceil(Math.sqrt(total * (CANVAS_W / CANVAS_H)))
    const rows = Math.ceil(total / cols)
    // Use square cells: pick the smaller dimension so cells are 1:1
    const cellSize = Math.min(CANVAS_W / cols, CANVAS_H / rows)
    const cellW = cellSize
    const cellH = cellSize

    const positioned = results.map((img, i) => {
      const col = i % cols
      const row = Math.floor(i / cols)
      // Cover-fit: uniform scale so image fills the square cell, then center-crop
      const scale = Math.max(cellW / img.naturalWidth, cellH / img.naturalHeight)
      const scaledW = img.naturalWidth  * scale
      const scaledH = img.naturalHeight * scale
      // Offset to center the image within the cell (crop from center)
      const offsetX = (scaledW - cellW) / 2
      const offsetY = (scaledH - cellH) / 2
      return {
        ...img,
        x: col * cellW,
        y: row * cellH,
        scaleX: scale,
        scaleY: scale,
        cropX: offsetX / scale,
        cropY: offsetY / scale,
        cropW: cellW / scale,
        cropH: cellH / scale,
      }
    })
    // ─────────────────────────────────────────────────────────────

    saveSnapshot()
    addImages(positioned)

    onClose()
  }, [chosenSkins, addImages, saveSnapshot, onClose])

  const startOver = useCallback(() => {
    setScreenshots([])
    setCands([]); setShared([]); setPicked(new Set()); setSkipped([])
    setError(''); setQuery(''); setAddOpen(false); setFocusSearch(false)
    setReport(''); setReadInfo(null); setDetailsOpen(false); setCopied(false)
    setShots([]); setShotsOpen(false); setViewShot(-1)
    setStep('upload')
  }, [])

  // Copies the scan report so it can be pasted into a message.
  const copyReport = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(report)
    } catch {
      // clipboard blocked or unavailable: copy through a temporary text box instead
      const box = document.createElement('textarea')
      box.value = report
      box.style.cssText = 'position:fixed;opacity:0;top:0;left:0'
      document.body.appendChild(box)
      box.select()
      try { document.execCommand('copy') } catch { /* nothing more to try */ }
      box.remove()
    }
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }, [report])

  // ── Render ──────────────────────────────────────────────────────────────────
  const sure  = cands.filter(c => c.group === 'sure')
  const maybe = cands.filter(c => c.group === 'maybe')
  const mine  = cands.filter(c => c.group === 'manual')
  const nothingFound = !sure.length && !maybe.length && !shared.length
  const { ticked, addable } = countPicked(cands, shared, picked, thumbs)
  const found7  = query.trim() ? searchSkins(query, 7) : []
  const matches = found7.slice(0, 6)
  const busy = step === 'scanning' || step === 'adding'
  const hardlyAnyText = !!readInfo && readInfo.words < 15

  // "Scan details": what the scanner saw. Handy when a scan finds nothing.
  const detailsBlock = report ? (
    <div style={{ margin: '4px 0 16px' }}>
      <button
        type="button" onClick={() => setDetailsOpen(o => !o)} aria-expanded={detailsOpen}
        style={{ background: 'none', border: 'none', color: '#aeaeb2', fontSize: '12px', fontWeight: 600, cursor: 'pointer', padding: '4px 0' }}
      >
        {detailsOpen ? '▾' : '▸'} Scan details
      </button>
      {detailsOpen && (
        <div style={{ marginTop: '6px' }}>
          <p style={{ margin: '0 0 8px', color: '#8e8e93', fontSize: '11px', lineHeight: 1.5 }}>
            What the scanner saw, in case something went wrong. It includes a sample of the text it read from your
            screenshots (that can include your in-game name), so only share it if you’re happy to.
          </p>
          <pre style={{
            margin: 0, maxHeight: '220px', overflow: 'auto', background: '#000000', border: '1px solid #232326',
            borderRadius: '8px', padding: '10px', color: '#c7c7cc', fontSize: '10.5px', lineHeight: 1.45,
            whiteSpace: 'pre-wrap', wordBreak: 'break-word', userSelect: 'text',
          }}>{report}</pre>
          <button
            type="button" onClick={copyReport}
            style={{ marginTop: '8px', background: 'none', border: '1px solid #2c2c2e', borderRadius: '8px', color: copied ? '#22c55e' : '#ff6b96', fontSize: '12px', fontWeight: 600, padding: '8px 14px', cursor: 'pointer' }}
          >
            {copied ? 'Copied ✓' : 'Copy report'}
          </button>
        </div>
      )}
    </div>
  ) : null

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 300,
        background: 'rgba(0,0,0,0.85)',
        display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
      }}
      onClick={e => { if (e.target === e.currentTarget && !busy) onClose() }}
    >
      <div style={{
        background: '#111113', borderRadius: '20px 20px 0 0',
        border: '1px solid #2c2c2e', borderBottom: 'none',
        width: '100%', maxWidth: '520px',
        maxHeight: '88vh', display: 'flex', flexDirection: 'column',
        boxShadow: '0 -8px 40px rgba(0,0,0,0.8)',
      }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 18px 12px', borderBottom: '1px solid #232326', flexShrink: 0 }}>
          <div>
            <p style={{ margin: 0, fontSize: '15px', fontWeight: 700, color: '#ffffff' }}>✨ Auto Collage</p>
            <p style={{ margin: '2px 0 0', fontSize: '11px', color: '#8e8e93' }}>
              {walletEnabled
                ? `Upload MLBB screenshots → skin names are read on our server (₹${AUTO_COLLAGE_PRICE}) → builds collage`
                : 'Upload MLBB screenshots → skin names are read on your device (free) → builds collage'}
            </p>
          </div>
          <button onClick={onClose} aria-label="Close" style={{ background: 'none', border: 'none', color: '#8e8e93', fontSize: '20px', cursor: 'pointer', lineHeight: 1, padding: '2px 6px' }}>✕</button>
        </div>

        {/* Body */}
        <div style={{ overflowY: 'auto', flex: 1, padding: '16px 16px 20px' }}>

          {/* Upload area */}
          {(step === 'upload' || step === 'ready') && (
            <>
              <div
                onClick={() => fileRef.current?.click()}
                style={{
                  border: '2px dashed #2c2c2e', borderRadius: '14px',
                  padding: '28px 20px', textAlign: 'center', cursor: 'pointer',
                  background: screenshots.length ? 'rgba(255,61,119,0.06)' : 'transparent',
                  transition: 'all 0.15s',
                }}
                onMouseEnter={e => e.currentTarget.style.borderColor = '#ff3d77'}
                onMouseLeave={e => e.currentTarget.style.borderColor = '#2c2c2e'}
              >
                <div style={{ fontSize: '36px', marginBottom: '10px' }}>📸</div>
                <p style={{ margin: '0 0 4px', color: '#ffffff', fontWeight: 700, fontSize: '15px' }}>
                  {screenshots.length ? `${screenshots.length} screenshot${screenshots.length > 1 ? 's' : ''} selected` : 'Tap to upload screenshots'}
                </p>
                <p style={{ margin: 0, color: '#8e8e93', fontSize: '12px' }}>
                  {screenshots.length ? 'Tap here to add more' : 'MLBB skin showcase / collection / inventory screens'}
                </p>
                <input
                  ref={fileRef} type="file" multiple accept="image/*"
                  style={{ display: 'none' }}
                  onChange={e => {
                    if (e.target.files?.length) handleFiles(e.target.files)
                    e.target.value = ''
                  }}
                />
              </div>

              {screenshots.length === 0 && (
                <p style={{ margin: '12px 2px 0', color: '#8e8e93', fontSize: '11px', lineHeight: 1.5 }}>
                  {walletEnabled
                    ? `₹${AUTO_COLLAGE_PRICE} per scan, refunded automatically if no skin is found. Your screenshots are read on our server and deleted straight away — they are never stored or shared. `
                    : 'Free — no AI key needed, and your screenshots never leave your device. The first scan downloads a small text reader (about 6 MB) once. '}
                  Screenshots where the skin names are clearly visible work best (up to {MAX_SCREENSHOTS} at a time).
                </p>
              )}

              {screenshots.length > 0 && (
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '12px' }}>
                  {screenshots.map((f, i) => (
                    <div key={fileId(f)} style={{ position: 'relative', width: '72px', height: '72px', borderRadius: '8px', overflow: 'hidden', border: '1px solid #2c2c2e' }}>
                      <img src={previewOf(f)} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      <button
                        onClick={() => removeScreenshot(i)} aria-label="Remove screenshot"
                        style={{ position: 'absolute', top: '2px', right: '2px', width: '20px', height: '20px', borderRadius: '50%', border: 'none', background: 'rgba(0,0,0,0.7)', color: '#ddd', fontSize: '11px', lineHeight: 1, cursor: 'pointer', padding: 0 }}
                      >✕</button>
                    </div>
                  ))}
                </div>
              )}

              {error && (
                <div style={{ ...errorBox, marginTop: '12px', marginBottom: 0 }}>
                  <p style={{ margin: 0, color: '#f87171', fontSize: '13px' }}>⚠️ {error}</p>
                </div>
              )}

              {step === 'ready' && (
                <button
                  onClick={handleScan}
                  style={{
                    marginTop: '16px', width: '100%',
                    background: '#ff3d77',
                    border: 'none', borderRadius: '12px',
                    color: '#fff', fontSize: '15px', fontWeight: 700,
                    padding: '14px', cursor: 'pointer',
                  }}
                >
                  🔍 Scan Screenshots{walletEnabled ? ` · ₹${AUTO_COLLAGE_PRICE}` : ''}
                </button>
              )}
            </>
          )}

          {/* Scanning */}
          {step === 'scanning' && (
            <div style={{ textAlign: 'center', padding: '30px 12px 10px' }}>
              <div style={{ fontSize: '40px', marginBottom: '14px' }}>🔍</div>
              <p style={{ margin: '0 0 8px', color: '#ffffff', fontWeight: 700, fontSize: '16px' }}>Reading skin names…</p>
              <p style={{ margin: '0 0 14px', color: '#ff3d77', fontSize: '13px', minHeight: '18px' }}>{progress.message}</p>
              <div style={{ height: '8px', background: '#232326', borderRadius: '99px', overflow: 'hidden' }}>
                <div style={{ width: `${progress.percent}%`, height: '100%', background: '#ff3d77', transition: 'width 0.25s' }} />
              </div>
              <p style={{ margin: '8px 0 18px', color: '#8e8e93', fontSize: '11px' }}>
                {progress.percent}% · {walletEnabled ? 'read on our server, screenshots are not stored' : 'runs on your device, nothing is uploaded'}
              </p>
              <button
                onClick={handleCancel}
                style={{ background: 'none', border: '1px solid #2c2c2e', borderRadius: '10px', color: '#c7c7cc', fontSize: '13px', fontWeight: 600, padding: '10px 22px', cursor: 'pointer' }}
              >
                Cancel
              </button>
            </div>
          )}

          {/* Results */}
          {step === 'results' && (
            <>
              <div style={{ display: 'flex', gap: '8px', marginBottom: '14px' }}>
                <div style={{ flex: 1, background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.3)', borderRadius: '10px', padding: '10px', textAlign: 'center' }}>
                  <p style={{ margin: 0, fontSize: '22px', fontWeight: 800, color: '#22c55e' }}>{sure.length}</p>
                  <p style={{ margin: 0, fontSize: '11px', color: '#8e8e93' }}>Found</p>
                </div>
                {(maybe.length > 0 || shared.length > 0) && (
                  <div style={{ flex: 1, background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.3)', borderRadius: '10px', padding: '10px', textAlign: 'center' }}>
                    <p style={{ margin: 0, fontSize: '22px', fontWeight: 800, color: '#f59e0b' }}>{maybe.length + shared.length}</p>
                    <p style={{ margin: 0, fontSize: '11px', color: '#8e8e93' }}>Need a look</p>
                  </div>
                )}
              </div>

              {ticked > addable && (
                <p style={{ margin: '0 0 14px', color: '#f59e0b', fontSize: '12px', lineHeight: 1.5 }}>
                  ⚠️ {ticked - addable} ticked skin{ticked - addable > 1 ? 's have' : ' has'} no picture in your asset repos yet, so
                  {ticked - addable > 1 ? ' they' : ' it'} will be left out.
                </p>
              )}

              {shots.length > 0 && !nothingFound && (() => {
                const total = shots.reduce((n, sh) => n + sh.sure.length, 0)
                const repeats = total - sure.length
                return (
                  <div style={{ marginBottom: '16px', background: '#000000', border: '1px solid #232326', borderRadius: '10px', padding: '10px 12px' }}>
                    <button
                      type="button" onClick={() => setShotsOpen(o => !o)} aria-expanded={shotsOpen}
                      style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'none', border: 'none', color: '#ffffff', fontSize: '13px', fontWeight: 700, cursor: 'pointer', padding: 0, textAlign: 'left' }}
                    >
                      <span>🔍 Check each screenshot</span>
                      <span style={{ color: '#aeaeb2', fontSize: '12px' }}>{shotsOpen ? '▾' : '▸'}</span>
                    </button>
                    <p style={{ margin: '4px 0 0', color: '#8e8e93', fontSize: '11px', lineHeight: 1.5 }}>
                      {total} name{total === 1 ? '' : 's'} read across {shots.length} screenshot{shots.length === 1 ? '' : 's'}
                      {repeats > 0 ? ` · ${repeats} appeared in more than one screenshot, so they're counted once` : ''}.
                      Open a screenshot to see a box on every skin found; one without a box was missed.
                    </p>
                    {shotsOpen && (
                      <div style={{ marginTop: '10px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        {shots.map((sh, i) => {
                          const file = screenshots[sh.file]
                          return (
                            <button
                              key={i} type="button" onClick={() => setViewShot(i)}
                              style={{ display: 'flex', gap: '10px', alignItems: 'center', background: '#111113', border: '1px solid #2c2c2e', borderRadius: '9px', padding: '6px', cursor: 'pointer', textAlign: 'left' }}
                            >
                              {file && <img src={previewOf(file)} alt="" style={{ width: '72px', height: '40px', objectFit: 'cover', borderRadius: '5px', flexShrink: 0 }} />}
                              <span style={{ color: '#ffffff', fontSize: '12px', lineHeight: 1.4 }}>
                                Screenshot {sh.file + 1} · <b style={{ color: sh.failed ? '#f87171' : '#22c55e' }}>{sh.failed ? 'could not open' : `${sh.sure.length} found`}</b>
                                {sh.maybe.length > 0 && <span style={{ color: '#f59e0b' }}> · {sh.maybe.length} maybe</span>}
                              </span>
                            </button>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )
              })()}

              {nothingFound && (
                <div style={{ background: '#000000', border: '1px solid #232326', borderRadius: '10px', padding: '12px 14px', marginBottom: '16px' }}>
                  <p style={{ margin: '0 0 4px', color: '#ffffff', fontSize: '13px', fontWeight: 700 }}>No skin names recognised</p>
                  {readInfo?.refunded && <p style={{ margin: '0 0 6px', color: '#22c55e', fontSize: '12px', fontWeight: 600 }}>Your ₹{AUTO_COLLAGE_PRICE} has been refunded to your wallet.</p>}
                  <p style={{ margin: 0, color: '#8e8e93', fontSize: '12px', lineHeight: 1.5 }}>
                    {hardlyAnyText
                      ? 'The scanner could hardly read any text in these screenshots. '
                      : 'The scanner read text from your screenshots, but none of it matched a skin name. '}
                    Try screenshots where the skin names are large and clearly visible (not covered by pop-ups),
                    or add skins by hand below. If it keeps happening, copy the scan details below and send them to the developer.
                  </p>
                </div>
              )}

              {nothingFound && detailsBlock}

              {/* Add a skin the scan missed — kept at the top so the results sit right under the box */}
              {!addOpen ? (
                <button
                  type="button" onClick={() => { setFocusSearch(true); setAddOpen(true) }}
                  style={{ width: '100%', background: 'none', border: '1px dashed #2c2c2e', borderRadius: '10px', color: '#ff6b96', fontSize: '13px', fontWeight: 600, padding: '10px', cursor: 'pointer', marginBottom: '18px' }}
                >
                  🔎 Missing a skin? Add it by name
                </button>
              ) : (
                <div style={{ marginBottom: '18px' }}>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <input
                      autoFocus={focusSearch} value={query} onChange={e => setQuery(e.target.value)}
                      placeholder="Hero or skin name, e.g. fanny galactic"
                      autoCapitalize="none" autoCorrect="off" spellCheck={false}
                      style={{ flex: 1, minWidth: 0, boxSizing: 'border-box', background: '#000000', border: '1px solid #2c2c2e', borderRadius: '10px', color: '#ffffff', fontSize: '14px', padding: '10px 12px', outline: 'none' }}
                    />
                    <button
                      type="button" onClick={() => { setQuery(''); setAddOpen(false) }}
                      style={{ background: 'none', border: '1px solid #2c2c2e', borderRadius: '10px', color: '#c7c7cc', fontSize: '13px', fontWeight: 600, padding: '0 14px', cursor: 'pointer' }}
                    >
                      Done
                    </button>
                  </div>
                  {query.trim() !== '' && (
                    <div style={{ marginTop: '8px', background: '#000000', border: '1px solid #232326', borderRadius: '10px', overflow: 'hidden' }}>
                      {matches.length === 0 && <p style={{ margin: 0, padding: '10px 12px', color: '#8e8e93', fontSize: '12px' }}>No skin matches “{query.trim()}”.</p>}
                      {matches.map(s => {
                        const on = picked.has(s.key)
                        return (
                          <button
                            key={s.key} type="button" onClick={() => (on ? toggle(s.key) : addManual(s))}
                            style={{ display: 'flex', width: '100%', alignItems: 'center', justifyContent: 'space-between', gap: '8px', background: 'none', border: 'none', borderBottom: '1px solid #232326', color: '#ffffff', textAlign: 'left', padding: '11px 12px', cursor: 'pointer', fontSize: '13px' }}
                          >
                            <span><b style={{ color: '#ff6b96' }}>{s.heroName}</b> — {s.skinName}</span>
                            <span style={{ color: on ? '#22c55e' : '#aeaeb2', fontSize: '12px', flexShrink: 0 }}>{on ? '✓ added' : '+ add'}</span>
                          </button>
                        )
                      })}
                      {found7.length > matches.length && (
                        <p style={{ margin: 0, padding: '8px 12px', color: '#8e8e93', fontSize: '11px' }}>More matches — keep typing to narrow it down.</p>
                      )}
                    </div>
                  )}
                </div>
              )}

              {mine.length > 0 && (
                <>
                  <p style={sectionTitle('#ff6b96')}>➕ ADDED BY YOU</p>
                  <div style={{ ...gridStyle, marginTop: '8px' }}>
                    {mine.map(c => <SkinCard key={c.key} rec={c} url={thumbs[c.key]} tone="pick" on={picked.has(c.key)} onToggle={() => toggle(c.key)} />)}
                  </div>
                </>
              )}

              {sure.length > 0 && (
                <>
                  <p style={sectionTitle('#22c55e')}>✅ FOUND</p>
                  <p style={sectionHint}>Tap a skin to leave it out of the collage.</p>
                  <div style={gridStyle}>
                    {sure.map(c => <SkinCard key={c.key} rec={c} url={thumbs[c.key]} tone="sure" on={picked.has(c.key)} onToggle={() => toggle(c.key)} />)}
                  </div>
                </>
              )}

              {maybe.length > 0 && (
                <>
                  <p style={sectionTitle('#f59e0b')}>🤔 MAYBE</p>
                  <p style={sectionHint}>The text was hard to read here, so these might be right. Tap the ones you want.</p>
                  <div style={gridStyle}>
                    {maybe.map(c => <SkinCard key={c.key} rec={c} url={thumbs[c.key]} tone="maybe" on={picked.has(c.key)} onToggle={() => toggle(c.key)} />)}
                  </div>
                </>
              )}

              {shared.map(s => (
                <div key={s.options.map(o => o.key).join('|')}>
                  <p style={sectionTitle('#ff6b96')}>👥 “{s.name}” — which hero?</p>
                  <p style={sectionHint}>Several heroes have a skin with this name. Tap the one(s) you own.</p>
                  <div style={gridStyle}>
                    {s.options.map(o => <SkinCard key={o.key} rec={o} url={thumbs[o.key]} tone="pick" on={picked.has(o.key)} onToggle={() => toggle(o.key)} />)}
                  </div>
                </div>
              ))}

              {skipped.length > 0 && (
                <p style={{ margin: '14px 0 0', color: '#8e8e93', fontSize: '11px' }}>
                  Couldn’t open: {skipped.join(', ')}
                </p>
              )}

              {!nothingFound && detailsBlock}

              {error && (
                <div style={{ ...errorBox, marginTop: '14px', marginBottom: 0 }}>
                  <p style={{ margin: 0, color: '#f87171', fontSize: '13px' }}>⚠️ {error}</p>
                </div>
              )}
            </>
          )}

          {/* Adding to canvas */}
          {step === 'adding' && (
            <div style={{ textAlign: 'center', padding: '30px 12px 10px' }}>
              <div style={{ fontSize: '40px', marginBottom: '14px' }}>⬇️</div>
              <p style={{ margin: '0 0 8px', color: '#ffffff', fontWeight: 700, fontSize: '16px' }}>Adding skins to canvas…</p>
              <p style={{ margin: '0 0 14px', color: '#ff3d77', fontSize: '13px', minHeight: '18px' }}>{progress.message}</p>
              <div style={{ height: '8px', background: '#232326', borderRadius: '99px', overflow: 'hidden' }}>
                <div style={{ width: `${progress.percent}%`, height: '100%', background: '#16a34a', transition: 'width 0.25s' }} />
              </div>
            </div>
          )}

        </div>

        {/* Footer (results only) — stays in view however long the list is */}
        {step === 'results' && (
          <div style={{ display: 'flex', gap: '8px', padding: '12px 16px 18px', borderTop: '1px solid #232326', flexShrink: 0 }}>
            <button
              onClick={startOver}
              style={{ flex: 1, background: 'none', border: '1px solid #2c2c2e', borderRadius: '10px', color: '#c7c7cc', fontSize: '13px', fontWeight: 600, padding: '12px', cursor: 'pointer' }}
            >
              ↩ Start over
            </button>
            <button
              onClick={handleAddToCanvas}
              disabled={addable === 0}
              style={{
                flex: 2, border: 'none', borderRadius: '10px', color: '#fff', fontSize: '14px', fontWeight: 700, padding: '12px',
                background: addable ? '#16a34a' : '#2c2c2e',
                cursor: addable ? 'pointer' : 'default', opacity: addable ? 1 : 0.6,
              }}
            >
              {addable
                ? `Add ${addable} Skin${addable > 1 ? 's' : ''} to Canvas →`
                : ticked ? 'No pictures for these skins' : 'Tick some skins to add'}
            </button>
          </div>
        )}
      </div>

      {viewShot >= 0 && shots[viewShot] && screenshots[shots[viewShot].file] && (
        <ShotViewer
          url={previewOf(screenshots[shots[viewShot].file])}
          shot={shots[viewShot]} picked={picked} thumbs={thumbs}
          title={`Screenshot ${shots[viewShot].file + 1} of ${screenshots.length}`}
          onClose={() => setViewShot(-1)}
          onPrev={viewShot > 0 ? () => setViewShot(viewShot - 1) : null}
          onNext={viewShot < shots.length - 1 ? () => setViewShot(viewShot + 1) : null}
        />
      )}


    </div>
  )
}

// How many different skins are ticked (a skin can appear in two lists), and how
// many of those have a picture in the asset repos (thumbs[key] === null means the
// repos were listed and there is none; undefined means we don't know yet).
function countPicked(cands, shared, picked, thumbs) {
  const keys = new Set()
  for (const c of cands) if (picked.has(c.key)) keys.add(c.key)
  for (const s of shared) for (const o of s.options) if (picked.has(o.key)) keys.add(o.key)
  let addable = 0
  for (const k of keys) if (thumbs[k] !== null) addable++
  return { ticked: keys.size, addable }
}
