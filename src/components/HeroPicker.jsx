import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import skinsData from '../../skins.json'
import useStore from '../store/useStore'
import { loadAssetFiles } from '../utils/assetRepos'
import { getSeries } from '../utils/skinSeries'

const TIERS = [
  'Legend', 'Grand', 'Exquisite', 'Deluxe', 'Exceptional','Starlight', 'Epic', 
]

const TIER_STYLES = {
  Legend:          { bg: '#2a1a00', border: '#f5c842', text: '#f5c842', icon: '👑' },
  Grand:           { bg: '#1a002a', border: '#a855f7', text: '#c084fc', icon: '💜' },
  Exquisite:       { bg: '#001a2a', border: '#38bdf8', text: '#7dd3fc', icon: '💎' },
  Deluxe:          { bg: '#001a10', border: '#34d399', text: '#6ee7b7', icon: '✨' },
  Exceptional:     { bg: '#1a1500', border: '#facc15', text: '#fde68a', icon: '⭐' },
  Starlight:       { bg: '#1a1a2a', border: '#818cf8', text: '#c7d2fe', icon: '🌟' },
  Epic:            { bg: '#1a002a', border: '#e879f9', text: '#f0abfc', icon: '🔮' },
}

const PLACEHOLDER      = 'https://placehold.co/200x300/1a1a2e/6c63ff?text=No+Image'
const HERO_PLACEHOLDER = 'https://placehold.co/80x80/1a1a2e/6c63ff?text=?'

function slugify(str) {
  return str.toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim()
}

function fuzzyMatch(str, query) {
  if (!query) return true
  const s = str.toLowerCase(), q = query.toLowerCase().trim()
  if (s.includes(q)) return true
  let si = 0, qi = 0
  while (si < s.length && qi < q.length) { if (s[si] === q[qi]) qi++; si++ }
  if (qi === q.length) return true
  if (q.length >= 4) {
    const bigrams = t => { const set = new Set(); for (let i = 0; i < t.length-1; i++) set.add(t[i]+t[i+1]); return set }
    const qb = bigrams(q), sb = bigrams(s); let m = 0
    qb.forEach(b => { if (sb.has(b)) m++ })
    if (m / qb.size >= 0.5) return true
  }
  return false
}

const HERO_ALIASES = {
  yuzhong: ['yu zhong','yuzhong'], gusion: ['gusion','gus'], franco: ['franco'],
  johnson: ['johnson','john'], odette: ['odette'], lancelot: ['lancelot','lance'],
  alucard: ['alucard','alu'], vexana: ['vexana','vex'], layla: ['layla'], miya: ['miya'], ling: ['ling'],
}

function skinKeywords(n) { return slugify(n).split(' ').filter(w => w.length >= 3) }

function matchScore(filename, heroId, skinName) {
  const f = slugify(filename.replace(/\.(jpg|jpeg|png|webp)$/i, ''))
  const aliases = HERO_ALIASES[heroId] || [heroId]
  if (!aliases.some(a => f.includes(a))) return 0
  const kw = skinKeywords(skinName)
  if (kw.length === 0) return 1
  return kw.filter(k => f.includes(k)).length / kw.length
}

// files: [{ name, url }] from loadAssetFiles() — already image-only and merged across all asset repos
function buildImageMap(files, heroId, skins) {
  const map = {}
  for (const skin of skins) {
    let best = null, bestScore = 0.3
    for (const file of files) {
      const s = matchScore(file.name, heroId, skin.name)
      if (s > bestScore) { bestScore = s; best = file }
    }
    if (best) map[skin.name] = best.url
  }
  return map
}

function loadTierAssignments() {
  try { return JSON.parse(localStorage.getItem('mlbb_tiers') || '{}') } catch { return {} }
}

// Compute majority tier for each series
function computeSeriesTiers(assignments) {
  const counts = {}
  for (const hero of skinsData) {
    for (const skin of hero.skins) {
      const series = getSeries(hero.id, skin.name)
      if (!series) continue
      const key  = `${hero.id}__${skin.name}`
      const tier = assignments[key] || skin.tier || ''
      if (!tier) continue
      if (!counts[series]) counts[series] = {}
      counts[series][tier] = (counts[series][tier] || 0) + 1
    }
  }
  const seriesTier = {}
  for (const [series, c] of Object.entries(counts))
    seriesTier[series] = Object.entries(c).sort((a,b) => b[1]-a[1])[0][0]
  return seriesTier
}

function useVisualViewportHeight() {
  const [h, setH] = useState(() => window.visualViewport ? window.visualViewport.height : window.innerHeight)
  useEffect(() => {
    const vv = window.visualViewport; if (!vv) return
    const up = () => setH(vv.height)
    vv.addEventListener('resize', up); vv.addEventListener('scroll', up)
    return () => { vv.removeEventListener('resize', up); vv.removeEventListener('scroll', up) }
  }, [])
  return h
}

function useScrollIntoView() {
  return useCallback(node => {
    if (!node) return
    const h = () => setTimeout(() => node.scrollIntoView({ behavior: 'smooth', block: 'start' }), 120)
    node.addEventListener('focus', h)
    return () => node.removeEventListener('focus', h)
  }, [])
}

function ModeSelect({ onSelectMode }) {
  return (
    <div style={{ padding: '20px 16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
      <p style={{ color: '#c7c7cc', fontSize: '12px', textAlign: 'center', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Choose selection mode</p>
      {[
        { mode: 'hero', icon: '🦸', title: 'Hero', desc: 'Browse skins by hero', color: '#ff3d77' },
        { mode: 'collection', icon: '💎', title: 'Collection', desc: 'Browse by tier — Legend, Grand, Exquisite and more', color: '#ff3d77' },
      ].map(({ mode, icon, title, desc, color }) => (
        <button key={mode} onClick={() => onSelectMode(mode)}
          style={{ display: 'flex', alignItems: 'center', gap: '16px', background: '#1c1c1e', border: '1px solid #2c2c2e', borderRadius: '14px', padding: '16px 18px', cursor: 'pointer', textAlign: 'left', transition: 'border-color 0.2s' }}
          onMouseEnter={e => e.currentTarget.style.borderColor = color}
          onMouseLeave={e => e.currentTarget.style.borderColor = '#2c2c2e'}>
          <span style={{ fontSize: '32px' }}>{icon}</span>
          <div>
            <p style={{ color: '#fff', fontSize: '15px', fontWeight: 700, margin: '0 0 4px' }}>{title}</p>
            <p style={{ color: '#c7c7cc', fontSize: '12px', margin: 0 }}>{desc}</p>
          </div>
          <span style={{ marginLeft: 'auto', color, fontSize: '18px' }}>›</span>
        </button>
      ))}
    </div>
  )
}

function CollectionMode({ repoFiles, imageCache, setImageCache, selectedSkins, setSelectedSkins }) {
  const [activeTier, setActiveTier] = useState('Legend')
  const [search, setSearch]         = useState('')
  const [collapsed, setCollapsed]   = useState({})
  const searchRef                   = useScrollIntoView()
  const assignments                 = useMemo(() => loadTierAssignments(), [])
  const seriesTiers                 = useMemo(() => computeSeriesTiers(assignments), [assignments])

  const tierSkins = useMemo(() => {
    const result = []
    for (const hero of skinsData) {
      for (const skin of hero.skins) {
        const series   = getSeries(hero.id, skin.name)
        const key      = `${hero.id}__${skin.name}`
        const skinTier = assignments[key] || skin.tier || ''
        if (series) {
          if (seriesTiers[series] === activeTier)
            result.push({ ...skin, heroId: hero.id, heroName: hero.name, skinTier })
        } else {
          if (skinTier === activeTier)
            result.push({ ...skin, heroId: hero.id, heroName: hero.name, skinTier })
        }
      }
    }
    return result
  }, [activeTier, assignments, seriesTiers])

  const filtered = useMemo(() => {
    if (!search.trim()) return tierSkins
    const q = search.toLowerCase()
    return tierSkins.filter(s => fuzzyMatch(s.name, q) || fuzzyMatch(s.heroName, q))
  }, [tierSkins, search])

  const grouped = useMemo(() => {
    const map = {}
    for (const skin of filtered) {
      const series = getSeries(skin.heroId, skin.name) || 'Other'
      if (!map[series]) map[series] = []
      map[series].push(skin)
    }
    return Object.entries(map).sort(([a],[b]) => {
      if (a==='Other') return 1; if (b==='Other') return -1; return a.localeCompare(b)
    })
  }, [filtered])

  useEffect(() => {
    if (!repoFiles.length) return
    ;[...new Set(tierSkins.map(s => s.heroId))].forEach(heroId => {
      if (imageCache[heroId]) return
      const hero = skinsData.find(h => h.id === heroId); if (!hero) return
      setImageCache(prev => ({ ...prev, [heroId]: buildImageMap(repoFiles, heroId, hero.skins) }))
    })
  }, [activeTier, repoFiles])

  const getSkinImg = (heroId, skinName) => (imageCache[heroId] || {})[skinName] || null

  const toggleSkin = (skin, url) => {
    if (!url) return
    setSelectedSkins(prev => {
      const k = `${skin.heroId}__${skin.name}`
      return prev.find(s => `${s.heroId}__${s.name}` === k)
        ? prev.filter(s => `${s.heroId}__${s.name}` !== k)
        : [...prev, { ...skin, image: url }]
    })
  }

  const tierCounts = useMemo(() => {
    const counts = {}
    for (const hero of skinsData) {
      for (const skin of hero.skins) {
        const series   = getSeries(hero.id, skin.name)
        const key      = `${hero.id}__${skin.name}`
        const skinTier = assignments[key] || skin.tier || ''
        if (series) { const t = seriesTiers[series]; if (t) counts[t] = (counts[t]||0)+1 }
        else if (skinTier) counts[skinTier] = (counts[skinTier]||0)+1
      }
    }
    return counts
  }, [assignments, seriesTiers])

  const TIER_STYLES_DEFAULT = { bg: '#1a1a1a', border: '#555', text: '#aaa', icon: '🎮' }
  const ts = TIER_STYLES[activeTier] || TIER_STYLES_DEFAULT

  return (
    <div style={{ display:'flex', flexDirection:'column', flex:1, overflow:'hidden' }}>
      {/* Tier tabs */}
      <div style={{ display:'flex', gap:'6px', padding:'10px 12px', overflowX:'auto', flexShrink:0, borderBottom:'1px solid #232326' }}>
        {TIERS.map(tier => {
          const s = TIER_STYLES[tier]||TIER_STYLES['Basic'], isActive = activeTier===tier, count = tierCounts[tier]||0
          return (
            <button key={tier} onClick={() => { setActiveTier(tier); setSearch(''); setCollapsed({}) }}
              style={{ flexShrink:0, background:isActive?s.bg:'#1c1c1e', border:`1px solid ${isActive?s.border:'#2c2c2e'}`, borderRadius:'8px', padding:'6px 12px', color:isActive?s.text:'#8e8e93', fontSize:'12px', fontWeight:isActive?700:400, cursor:'pointer', whiteSpace:'nowrap', display:'flex', alignItems:'center', gap:'5px' }}>
              <span>{s.icon}</span><span>{tier}</span>
              {count>0 && <span style={{ background:isActive?s.border+'33':'#232326', color:isActive?s.text:'#8e8e93', fontSize:'10px', padding:'1px 5px', borderRadius:'4px' }}>{count}</span>}
            </button>
          )
        })}
      </div>

      {/* Search */}
      <div style={{ padding:'10px 12px', flexShrink:0 }}>
        <input ref={searchRef} type="text" placeholder={`🔍 Search in ${activeTier}...`} value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ width:'100%', background:'#1c1c1e', border:'1px solid #2c2c2e', borderRadius:'8px', padding:'8px 12px', color:'#fff', fontSize:'13px', outline:'none', boxSizing:'border-box' }} />
      </div>

      {/* Grouped list */}
      <div style={{ flex:1, overflowY:'auto', padding:'0 10px 12px' }}>
        {filtered.length===0 ? (
          <div style={{ textAlign:'center', padding:'40px 20px' }}>
            <p style={{ fontSize:'32px', marginBottom:'12px' }}>{tierCounts[activeTier]?'🔍':'📭'}</p>
            <p style={{ color:'#c7c7cc', fontSize:'14px', fontWeight:600, marginBottom:'6px' }}>
              {search?'No results found':`No ${activeTier} skins yet`}
            </p>
            <p style={{ color:'#8e8e93', fontSize:'12px' }}>
              {search?'Try a different search term':'Use Admin Panel to assign skins'}
            </p>
          </div>
        ) : grouped.map(([series, skins]) => {
          const isCollapsed = collapsed[series], isOther = series==='Other'
          return (
            <div key={series} style={{ marginBottom:'16px' }}>
              <button onClick={() => setCollapsed(p => ({ ...p, [series]: !p[series] }))}
                style={{ width:'100%', display:'flex', alignItems:'center', justifyContent:'space-between', background:isOther?'#1c1c1e':ts.bg, border:`1px solid ${isOther?'#2c2c2e':ts.border+'66'}`, borderRadius:'10px', padding:'8px 12px', marginBottom:isCollapsed?0:'8px', cursor:'pointer' }}>
                <div style={{ display:'flex', alignItems:'center', gap:'8px' }}>
                  <span style={{ fontSize:'14px' }}>{isOther?'🎮':ts.icon}</span>
                  <span style={{ color:isOther?'#aeaeb2':ts.text, fontSize:'12px', fontWeight:700 }}>
                    {isOther?'Other':`${series} Series`}
                  </span>
                  <span style={{ background:isOther?'#232326':ts.border+'33', color:isOther?'#8e8e93':ts.text, fontSize:'10px', padding:'1px 6px', borderRadius:'4px', fontWeight:600 }}>
                    {skins.length}
                  </span>
                </div>
                <span style={{ color:isOther?'#8e8e93':ts.text, fontSize:'14px', transform:isCollapsed?'rotate(-90deg)':'rotate(0deg)', transition:'transform 0.2s', display:'inline-block' }}>▾</span>
              </button>

              {!isCollapsed && (
                <div style={{ display:'grid', gridTemplateColumns:'repeat(4, 1fr)', gap:'6px' }}>
                  {skins.map((skin, i) => {
                    const url = getSkinImg(skin.heroId, skin.name), hasImg = !!url
                    const k = `${skin.heroId}__${skin.name}`
                    const isSel = selectedSkins.find(s => `${s.heroId}__${s.name}`===k)
                    const showBadge = skin.skinTier && skin.skinTier!==activeTier
                    const bs = TIER_STYLES[skin.skinTier]||TIER_STYLES_DEFAULT
                    return (
                      <button key={i} onClick={() => toggleSkin(skin, url)}
                        style={{ position:'relative', borderRadius:'10px', overflow:'hidden', border:`2px solid ${isSel?ts.border:hasImg?'#2c2c2e':'#232326'}`, opacity:hasImg?1:0.4, cursor:hasImg?'pointer':'not-allowed', transform:isSel?'scale(0.95)':'scale(1)', transition:'all 0.15s', background:'#1c1c1e', padding:0, textAlign:'center', display:'flex', flexDirection:'column' }}>
                        <div style={{ position:'relative', width:'100%' }}>
                          <img src={hasImg?url:PLACEHOLDER} alt={skin.name}
                            crossOrigin="anonymous"
                            style={{ width:'100%', height:'80px', objectFit:'cover', display:'block', background:'#1c1c1e' }}
                            onError={e => { e.target.src=PLACEHOLDER }} />
                          {isSel && (
                            <div style={{ position:'absolute', top:'3px', right:'3px', width:'16px', height:'16px', background:ts.border, borderRadius:'50%', display:'flex', alignItems:'center', justifyContent:'center' }}>
                              <span style={{ color:'#000', fontSize:'9px', fontWeight:800 }}>✓</span>
                            </div>
                          )}
                          {showBadge && (
                            <div style={{ position:'absolute', top:'3px', left:'3px', background:bs.bg, border:`1px solid ${bs.border}`, borderRadius:'4px', padding:'1px 3px' }}>
                              <span style={{ color:bs.text, fontSize:'7px', fontWeight:700 }}>{skin.skinTier}</span>
                            </div>
                          )}
                          {!hasImg && (
                            <div style={{ position:'absolute', inset:0, display:'flex', alignItems:'center', justifyContent:'center' }}>
                              <span style={{ color:'#8e8e93', fontSize:'9px' }}>No Image</span>
                            </div>
                          )}
                        </div>
                        <div style={{ padding:'4px 4px 5px', background:'#1c1c1e', borderTop:'1px solid #232326' }}>
                          <p style={{ color:'#ffffff', fontSize:'8px', fontWeight:700, margin:0, lineHeight:1.3, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{skin.name}</p>
                          <p style={{ color:'#8e8e93', fontSize:'7px', margin:'1px 0 0', lineHeight:1.2, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{skin.heroName}</p>
                        </div>
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default function HeroPicker({ open, onClose, initialMode = null }) {
  const [isOpen,         setIsOpen]         = useState(false)
  const [mode,           setMode]           = useState(null)
  const [selectedHero,   setSelectedHero]   = useState(null)
  const [selectedSkins,  setSelectedSkins]  = useState([])
  const [search,         setSearch]         = useState('')
  const [repoFiles,      setRepoFiles]      = useState([])
  const [imageCache,     setImageCache]     = useState({})
  const [fetchError,     setFetchError]     = useState(false)
  const [isAdding,       setIsAdding]       = useState(false)
  const [keyboardHeight, setKeyboardHeight] = useState(0)

  useEffect(() => { if (open) { setIsOpen(true); if (initialMode) setMode(initialMode) } }, [open, initialMode])

  const heroSearchRef = useScrollIntoView()
  const vvHeight      = useVisualViewportHeight()
  const addImages     = useStore(s => s.addImages)
  const saveSnapshot  = useStore(s => s.saveSnapshot)
  const updateImage   = useStore(s => s.updateImage)
  const images        = useStore(s => s.images)
  const hasImages     = images.length > 0
  const historyPushed = useRef(false)

  const handleClose = useCallback(() => {
    setIsOpen(false); setSelectedHero(null); setSelectedSkins([])
    setSearch(''); setMode(null); if (onClose) onClose()
  }, [onClose])

  useEffect(() => {
    if (isOpen) {
      window.history.pushState({ heroPickerOpen: true }, '')
      historyPushed.current = true
      const onPop = () => {
        if (selectedHero) { setSelectedHero(null); setSelectedSkins([]); window.history.pushState({ heroPickerOpen: true }, ''); return }
        if (mode) { setMode(null); window.history.pushState({ heroPickerOpen: true }, ''); return }
        handleClose(); historyPushed.current = false
      }
      window.addEventListener('popstate', onPop)
      return () => window.removeEventListener('popstate', onPop)
    } else {
      if (historyPushed.current) { historyPushed.current = false; window.history.back() }
    }
  }, [isOpen, mode, selectedHero, handleClose])

  useEffect(() => {
    if (!isOpen) return
    let cancelled = false
    // Merged image list from every repo in ASSET_REPOS (cached for the session)
    loadAssetFiles()
      .then(files => { if (!cancelled) setRepoFiles(files) })
      .catch(() => { if (!cancelled) setFetchError(true) })
    return () => { cancelled = true }
  }, [isOpen])

  useEffect(() => {
    if (!selectedHero || !repoFiles.length || imageCache[selectedHero.id]) return
    setImageCache(prev => ({ ...prev, [selectedHero.id]: buildImageMap(repoFiles, selectedHero.id, selectedHero.skins) }))
  }, [selectedHero, repoFiles])

  const getSkinImage   = (hero, skin) => (imageCache[hero.id]||{})[skin.name]||null
  const getHeroImage   = hero => Object.values(imageCache[hero.id]||{})[0]||HERO_PLACEHOLDER
  const filteredHeroes = skinsData.filter(h => fuzzyMatch(h.name, search))

  const toggleSkin = (skin, url) => {
    if (!url) return
    setSelectedSkins(prev => {
      const exists = prev.find(s => s.name===skin.name)
      return exists ? prev.filter(s => s.name!==skin.name) : [...prev, { ...skin, image: url }]
    })
  }

  const handleAddToCanvas = async () => {
  if (!selectedSkins.length || isAdding) return
  setIsAdding(true)
  saveSnapshot()

  const CANVAS_W = 3840
  const total = images.length + selectedSkins.length
  const cols = Math.ceil(Math.sqrt(total))
  const cell = Math.floor(CANVAS_W / cols)

  // Re-layout existing images
  images.forEach((img, i) => updateImage(img.id, {
    x: (i % cols) * cell,
    y: Math.floor(i / cols) * cell,
    scaleX: cell / img.naturalWidth,
    scaleY: cell / img.naturalHeight,
  }))

  // Load new skins, skip any that fail
  const skinData = await Promise.all(selectedSkins.map(skin =>
    new Promise(resolve => {
      const el = new Image()
      el.crossOrigin = 'anonymous'
      el.onload  = () => resolve({ skin, nw: el.naturalWidth, nh: el.naturalHeight, ok: true })
      el.onerror = () => resolve({ skin, nw: 0, nh: 0, ok: false })
      el.src = skin.image
    })
  ))

  const newImages = skinData
    .filter(({ ok }) => ok)
    .map(({ skin, nw, nh }, i) => {
      const gi = images.length + i
      const scale  = Math.max(cell / nw, cell / nh)
      const scaledW = nw * scale
      const scaledH = nh * scale
      const offsetX = (scaledW - cell) / 2
      const offsetY = (scaledH - cell) / 2
      return {
        src: skin.image,
        x: (gi % cols) * cell,
        y: Math.floor(gi / cols) * cell,
        naturalWidth: nw,
        naturalHeight: nh,
        scaleX: scale,
        scaleY: scale,
        cropX: offsetX / scale,
        cropY: offsetY / scale,
        cropW: cell / scale,
        cropH: cell / scale,
        rotation: 0,
        opacity: 1,
        name: skin.name,
        fileSize: 0,
      }
    })

  addImages(newImages)
  setIsAdding(false)
  setIsOpen(false)
  setSelectedHero(null)
  setSelectedSkins([])
  }

  const headerTitle = () => {
    if (!mode) return 'Add Skins'
    if (mode==='hero') return selectedHero?selectedHero.name:'Select Hero'
    if (mode==='collection') return 'Collection'
    return 'Add Skins'
  }

  const handleBack = () => {
    if (selectedHero) { setSelectedHero(null); setSelectedSkins([]); return }
    if (mode) { setMode(null); return }
    handleClose()
  }

  return (
    <>
      {isOpen && (
        <div style={{ position:'fixed', inset:0, zIndex:200, display:'flex', alignItems:'flex-end', justifyContent:'center', background:'rgba(0,0,0,0.7)' }}
          onClick={e => { if (e.target===e.currentTarget) handleClose() }}>
          <div style={{ width:'100%', maxWidth:'480px', maxHeight:`min(${vvHeight*0.85}px, 85dvh)`, marginBottom:`${keyboardHeight}px`, background:'#111113', border:'1px solid #2c2c2e', borderRadius:'20px 20px 0 0', display:'flex', flexDirection:'column', overflow:'hidden', boxShadow:'0 -8px 40px rgba(0,0,0,0.7)', paddingBottom:keyboardHeight>0?'0px':'env(safe-area-inset-bottom, 0px)', transition:'margin-bottom 0.2s ease' }}>

            {/* Header */}
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'14px 16px 10px', borderBottom:'1px solid #232326', flexShrink:0 }}>
              <div style={{ display:'flex', alignItems:'center', gap:'10px' }}>
                {(mode||selectedHero) && <button onClick={handleBack} style={{ background:'none', border:'none', color:'#ff3d77', fontSize:'20px', cursor:'pointer', padding:'0 4px', lineHeight:1 }}>‹</button>}
                <span style={{ color:'#fff', fontSize:'16px', fontWeight:700 }}>{headerTitle()}</span>
              </div>
              <div style={{ display:'flex', alignItems:'center', gap:'8px' }}>
                {selectedSkins.length>0 && (
                  <button onClick={handleAddToCanvas} disabled={isAdding}
                    style={{ background:'#ff3d77', border:'none', borderRadius:'8px', padding:'7px 14px', color:'#fff', fontWeight:700, fontSize:'13px', cursor:'pointer', opacity:isAdding?0.6:1 }}>
                    {isAdding?'Adding…':`Add ${selectedSkins.length}`}
                  </button>
                )}
                <button onClick={handleClose} style={{ background:'none', border:'none', color:'#8e8e93', fontSize:'20px', cursor:'pointer', lineHeight:1, padding:'2px 4px' }}>✕</button>
              </div>
            </div>

            {/* Body */}
            <div style={{ flex:1, overflow:'hidden', display:'flex', flexDirection:'column' }}>
              {!mode && <div style={{ overflowY:'auto', flex:1 }}><ModeSelect onSelectMode={setMode} /></div>}

              {mode==='collection' && (
                <CollectionMode repoFiles={repoFiles} imageCache={imageCache} setImageCache={setImageCache}
                  selectedSkins={selectedSkins} setSelectedSkins={setSelectedSkins} />
              )}

              {mode==='hero' && !selectedHero && (
                <div style={{ display:'flex', flexDirection:'column', flex:1, overflow:'hidden' }}>
                  <div style={{ padding:'10px 12px', flexShrink:0 }}>
                    <input ref={heroSearchRef} type="text" placeholder="🔍 Search hero..." value={search} onChange={e => setSearch(e.target.value)}
                      style={{ width:'100%', background:'#1c1c1e', border:'1px solid #2c2c2e', borderRadius:'8px', padding:'8px 12px', color:'#fff', fontSize:'13px', outline:'none', boxSizing:'border-box' }} />
                  </div>
                  <div style={{ flex:1, overflowY:'auto', padding:'0 12px 12px' }}>
                    <div style={{ display:'grid', gridTemplateColumns:'repeat(3, 1fr)', gap:'8px' }}>
                      {filteredHeroes.map(hero => (
                        <button key={hero.id} onClick={() => { setSelectedHero(hero); setSearch('') }}
                          style={{ background:'#1c1c1e', border:'1px solid #2c2c2e', borderRadius:'12px', overflow:'hidden', cursor:'pointer', padding:0, textAlign:'left', transition:'border-color 0.15s' }}
                          onMouseEnter={e => e.currentTarget.style.borderColor='#ff3d77'}
                          onMouseLeave={e => e.currentTarget.style.borderColor='#2c2c2e'}>
                          <img src={getHeroImage(hero)} alt={hero.name} crossOrigin="anonymous" style={{ width:'100%', height:'80px', objectFit:'cover', display:'block' }} onError={e => { e.target.src=HERO_PLACEHOLDER }} />
                          <div style={{ padding:'6px 8px' }}>
                            <p style={{ color:'#fff', fontSize:'11px', fontWeight:600, margin:'0 0 2px', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{hero.name}</p>
                            <p style={{ color:'#8e8e93', fontSize:'10px', margin:0 }}>{hero.skins.length} skins</p>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {mode==='hero' && selectedHero && (
                <div style={{ display:'flex', flexDirection:'column', flex:1, overflow:'hidden' }}>
                  <div style={{ padding:'10px 12px', flexShrink:0 }}>
                    <input type="text" placeholder="🔍 Search skin..." value={search} onChange={e => setSearch(e.target.value)}
                      style={{ width:'100%', background:'#1c1c1e', border:'1px solid #2c2c2e', borderRadius:'8px', padding:'8px 12px', color:'#fff', fontSize:'13px', outline:'none', boxSizing:'border-box' }} />
                  </div>
                  <div style={{ flex:1, overflowY:'auto', padding:'0 10px 12px' }}>
                    <div style={{ display:'grid', gridTemplateColumns:'repeat(4, 1fr)', gap:'6px' }}>
                      {selectedHero.skins.filter(s => fuzzyMatch(s.name, search)).map((skin, i) => {
                        const url=getSkinImage(selectedHero, skin), hasImg=!!url
                        const isSel=selectedSkins.find(s => s.name===skin.name)
                        return (
                          <button key={i} onClick={() => toggleSkin(skin, url)}
                            style={{ position:'relative', borderRadius:'10px', overflow:'hidden', border:`2px solid ${isSel?'#ff3d77':hasImg?'#2c2c2e':'#232326'}`, opacity:hasImg?1:0.4, cursor:hasImg?'pointer':'not-allowed', transform:isSel?'scale(0.95)':'scale(1)', transition:'all 0.15s', background:'#1c1c1e', padding:0, textAlign:'center', display:'flex', flexDirection:'column' }}>
                            <div style={{ position:'relative', width:'100%' }}>
                              <img src={hasImg?url:PLACEHOLDER} alt={skin.name} crossOrigin="anonymous" style={{ width:'100%', height:'80px', objectFit:'cover', display:'block', background:'#1c1c1e' }} onError={e => { e.target.src=PLACEHOLDER }} />
                              {isSel && (
                                <div style={{ position:'absolute', top:'3px', right:'3px', width:'16px', height:'16px', background:'#ff3d77', borderRadius:'50%', display:'flex', alignItems:'center', justifyContent:'center' }}>
                                  <span style={{ color:'#fff', fontSize:'9px', fontWeight:800 }}>✓</span>
                                </div>
                              )}
                              {!hasImg && <div style={{ position:'absolute', inset:0, display:'flex', alignItems:'center', justifyContent:'center' }}><span style={{ color:'#8e8e93', fontSize:'9px' }}>No Image</span></div>}
                            </div>
                            <div style={{ padding:'4px 4px 5px', background:'#1c1c1e', borderTop:'1px solid #232326' }}>
                              <p style={{ color:'#ffffff', fontSize:'8px', fontWeight:700, margin:0, lineHeight:1.3, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{skin.name}</p>
                            </div>
                          </button>
                        )
                      })}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
