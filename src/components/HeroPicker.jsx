import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import skinsData from '../../skins.json'
import useStore from '../store/useStore'

const TIERS = ['Legend', 'Grand', 'Exquisite', 'Deluxe', 'Exceptional', 'Common']

const TIER_STYLES = {
  Legend:      { bg: '#2a1a00', border: '#f5c842', text: '#f5c842', icon: '👑' },
  Grand:       { bg: '#1a002a', border: '#a855f7', text: '#c084fc', icon: '💜' },
  Exquisite:   { bg: '#001a2a', border: '#38bdf8', text: '#7dd3fc', icon: '💎' },
  Deluxe:      { bg: '#001a10', border: '#34d399', text: '#6ee7b7', icon: '✨' },
  Exceptional: { bg: '#1a1500', border: '#facc15', text: '#fde68a', icon: '⭐' },
  Common:      { bg: '#1a1a1a', border: '#6b7280', text: '#9ca3af', icon: '🔹' },
}

const PLACEHOLDER      = 'https://placehold.co/200x300/1a1a2e/6c63ff?text=No+Image'
const HERO_PLACEHOLDER = 'https://placehold.co/80x80/1a1a2e/6c63ff?text=?'
const CELL_SIZE        = 300
const GITHUB_API       = 'https://api.github.com/repos/ryukofficial/mlbb-assets/contents/'
const CDN_BASE         = 'https://raw.githubusercontent.com/ryukofficial/mlbb-assets/refs/heads/main/'

function slugify(str) {
  return str.toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim()
}

// Fuzzy match: returns true if all chars of query appear in order in str
// Also returns true for normal includes, and handles 1-char typos via bigram overlap
function fuzzyMatch(str, query) {
  if (!query) return true
  const s = str.toLowerCase()
  const q = query.toLowerCase().trim()
  if (s.includes(q)) return true
  // sequential char match (fast fuzzy)
  let si = 0, qi = 0
  while (si < s.length && qi < q.length) {
    if (s[si] === q[qi]) qi++
    si++
  }
  if (qi === q.length) return true
  // bigram overlap for typo tolerance (e.g. "langcelot" → "lancelot")
  if (q.length >= 4) {
    const bigrams = (t) => {
      const set = new Set()
      for (let i = 0; i < t.length - 1; i++) set.add(t[i] + t[i + 1])
      return set
    }
    const qb = bigrams(q)
    const sb = bigrams(s)
    let matches = 0
    qb.forEach(b => { if (sb.has(b)) matches++ })
    if (matches / qb.size >= 0.5) return true
  }
  return false
}

const HERO_ALIASES = {
  gusion: ['gusion', 'gus'], franco: ['franco'], johnson: ['johnson', 'john'],
  odette: ['odette'], lancelot: ['lancelot', 'lance'], alucard: ['alucard', 'alu'],
  vexana: ['vexana', 'vex'], layla: ['layla'], miya: ['miya'], ling: ['ling'],
}

function skinKeywords(skinName) {
  return slugify(skinName).split(' ').filter(w => w.length >= 3)
}

function matchScore(filename, heroId, skinName) {
  const f         = slugify(filename.replace(/\.(jpg|jpeg|png|webp)$/i, ''))
  const aliases   = HERO_ALIASES[heroId] || [heroId]
  const heroMatch = aliases.some(alias => f.includes(alias))
  if (!heroMatch) return 0
  const keywords = skinKeywords(skinName)
  if (keywords.length === 0) return 1
  const matched = keywords.filter(kw => f.includes(kw))
  return matched.length / keywords.length
}

function buildImageMap(files, heroId, skins) {
  const map        = {}
  const imageFiles = files.filter(f => /\.(jpg|jpeg|png|webp)$/i.test(f))
  for (const skin of skins) {
    let bestFile = null, bestScore = 0.3
    for (const file of imageFiles) {
      const score = matchScore(file, heroId, skin.name)
      if (score > bestScore) { bestScore = score; bestFile = file }
    }
    if (bestFile) map[skin.name] = CDN_BASE + encodeURIComponent(bestFile)
  }
  return map
}

function preloadImage(src) {
  return new Promise(resolve => {
    const img       = new Image()
    img.crossOrigin = 'anonymous'
    img.onload  = () => resolve({ width: img.naturalWidth, height: img.naturalHeight })
    img.onerror = () => resolve({ width: 300, height: 300 })
    img.src = src
  })
}

function loadTierAssignments() {
  try {
    const raw = localStorage.getItem('mlbb_tiers')
    return raw ? JSON.parse(raw) : {}
  } catch { return {} }
}

// ── Tracks the visible viewport height so sheet stays above keyboard ──
function useVisualViewportHeight() {
  const [vvHeight, setVvHeight] = useState(() =>
    window.visualViewport ? window.visualViewport.height : window.innerHeight
  )
  useEffect(() => {
    const vv = window.visualViewport
    if (!vv) return
    const update = () => setVvHeight(vv.height)
    vv.addEventListener('resize', update)
    vv.addEventListener('scroll', update)
    return () => {
      vv.removeEventListener('resize', update)
      vv.removeEventListener('scroll', update)
    }
  }, [])
  return vvHeight
}

// Scroll the search input into view when keyboard opens on iOS
function useScrollIntoView() {
  return useCallback(node => {
    if (!node) return
    const handler = () => {
      setTimeout(() => node.scrollIntoView({ behavior: 'smooth', block: 'start' }), 120)
    }
    node.addEventListener('focus', handler)
    return () => node.removeEventListener('focus', handler)
  }, [])
}

// ── Mode Select Screen ─────────────────────────────────────────
function ModeSelect({ onSelectMode }) {
  return (
    <div style={{ padding: '20px 16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
      <p style={{ color: '#888', fontSize: '12px', textAlign: 'center', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
        Choose selection mode
      </p>
      <button
        onClick={() => onSelectMode('hero')}
        style={{
          display: 'flex', alignItems: 'center', gap: '16px',
          background: '#1a1a2e', border: '1px solid #252535',
          borderRadius: '14px', padding: '16px 18px', cursor: 'pointer',
          textAlign: 'left', transition: 'border-color 0.2s',
        }}
        onMouseEnter={e => e.currentTarget.style.borderColor = '#6c63ff'}
        onMouseLeave={e => e.currentTarget.style.borderColor = '#252535'}
      >
        <span style={{ fontSize: '32px' }}>🦸</span>
        <div>
          <p style={{ color: '#fff', fontSize: '15px', fontWeight: 700, margin: '0 0 4px' }}>Hero</p>
          <p style={{ color: '#888', fontSize: '12px', margin: 0 }}>Browse skins by hero — search and pick per character</p>
        </div>
        <span style={{ marginLeft: 'auto', color: '#6c63ff', fontSize: '18px' }}>›</span>
      </button>
      <button
        onClick={() => onSelectMode('collection')}
        style={{
          display: 'flex', alignItems: 'center', gap: '16px',
          background: '#1a1a2e', border: '1px solid #252535',
          borderRadius: '14px', padding: '16px 18px', cursor: 'pointer',
          textAlign: 'left', transition: 'border-color 0.2s',
        }}
        onMouseEnter={e => e.currentTarget.style.borderColor = '#a855f7'}
        onMouseLeave={e => e.currentTarget.style.borderColor = '#252535'}
      >
        <span style={{ fontSize: '32px' }}>💎</span>
        <div>
          <p style={{ color: '#fff', fontSize: '15px', fontWeight: 700, margin: '0 0 4px' }}>Collection</p>
          <p style={{ color: '#888', fontSize: '12px', margin: 0 }}>Browse by tier — Legend, Grand, Exquisite and more</p>
        </div>
        <span style={{ marginLeft: 'auto', color: '#a855f7', fontSize: '18px' }}>›</span>
      </button>
    </div>
  )
}

// ── Collection Mode ────────────────────────────────────────────
function CollectionMode({ repoFiles, imageCache, setImageCache, fetchError, selectedSkins, setSelectedSkins }) {
  const [activeTier, setActiveTier] = useState('Legend')
  const [search, setSearch]         = useState('')
  const searchRef                   = useScrollIntoView()

  const assignments = useMemo(() => loadTierAssignments(), [])

  const tierSkins = useMemo(() => {
    const result = []
    for (const hero of skinsData) {
      for (const skin of hero.skins) {
        const key  = `${hero.id}__${skin.name}`
        const tier = assignments[key] || skin.tier || ''
        if (tier === activeTier) {
          result.push({ ...skin, heroId: hero.id, heroName: hero.name, tier })
        }
      }
    }
    return result
  }, [activeTier, assignments])

  const filtered = useMemo(() => {
    if (!search.trim()) return tierSkins
    const q = search.toLowerCase()
    return tierSkins.filter(s =>
      fuzzyMatch(s.name, q) || fuzzyMatch(s.heroName, q)
    )
  }, [tierSkins, search])

  useEffect(() => {
    if (repoFiles.length === 0) return
    const heroIds = [...new Set(tierSkins.map(s => s.heroId))]
    heroIds.forEach(heroId => {
      if (imageCache[heroId]) return
      const hero = skinsData.find(h => h.id === heroId)
      if (!hero) return
      const map = buildImageMap(repoFiles, heroId, hero.skins)
      setImageCache(prev => ({ ...prev, [heroId]: map }))
    })
  }, [activeTier, repoFiles])

  function getSkinImage(heroId, skinName) {
    return (imageCache[heroId] || {})[skinName] || null
  }

  const toggleSkin = (skin, resolvedUrl) => {
    if (!resolvedUrl) return
    setSelectedSkins(prev => {
      const key    = `${skin.heroId}__${skin.name}`
      const exists = prev.find(s => `${s.heroId}__${s.name}` === key)
      if (exists) return prev.filter(s => `${s.heroId}__${s.name}` !== key)
      return [...prev, { ...skin, image: resolvedUrl }]
    })
  }

  const tierCounts = useMemo(() => {
    const counts = {}
    for (const hero of skinsData) {
      for (const skin of hero.skins) {
        const key  = `${hero.id}__${skin.name}`
        const tier = assignments[key] || skin.tier || ''
        if (tier) counts[tier] = (counts[tier] || 0) + 1
      }
    }
    return counts
  }, [assignments])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
      {/* Tier tabs */}
      <div style={{
        display: 'flex', gap: '6px', padding: '10px 12px',
        overflowX: 'auto', flexShrink: 0, borderBottom: '1px solid #1a1a2e',
      }}>
        {TIERS.map(tier => {
          const ts       = TIER_STYLES[tier]
          const isActive = activeTier === tier
          const count    = tierCounts[tier] || 0
          return (
            <button
              key={tier}
              onClick={() => { setActiveTier(tier); setSearch('') }}
              style={{
                flexShrink: 0,
                background: isActive ? ts.bg : '#12121a',
                border: `1px solid ${isActive ? ts.border : '#252535'}`,
                borderRadius: '8px', padding: '6px 12px',
                color: isActive ? ts.text : '#666',
                fontSize: '12px', fontWeight: isActive ? 700 : 400,
                cursor: 'pointer', whiteSpace: 'nowrap',
                display: 'flex', alignItems: 'center', gap: '5px',
              }}
            >
              <span>{ts.icon}</span>
              <span>{tier}</span>
              {count > 0 && (
                <span style={{
                  background: isActive ? ts.border + '33' : '#1a1a2e',
                  color: isActive ? ts.text : '#555',
                  fontSize: '10px', padding: '1px 5px', borderRadius: '4px',
                }}>
                  {count}
                </span>
              )}
            </button>
          )
        })}
      </div>

      {/* Search */}
      <div style={{ padding: '10px 12px', flexShrink: 0 }}>
        <input
          ref={searchRef}
          type="text"
          placeholder={`🔍 Search in ${activeTier}...`}
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{
            width: '100%', background: '#12121a', border: '1px solid #252535',
            borderRadius: '8px', padding: '8px 12px', color: '#fff',
            fontSize: '13px', outline: 'none', boxSizing: 'border-box',
          }}
        />
      </div>

      {/* Skin grid */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '0 12px 12px' }}>
        {filtered.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px 20px' }}>
            <p style={{ fontSize: '32px', marginBottom: '12px' }}>
              {tierCounts[activeTier] ? '🔍' : '📭'}
            </p>
            <p style={{ color: '#888', fontSize: '14px', fontWeight: 600, marginBottom: '6px' }}>
              {search ? 'No results found' : `No ${activeTier} skins assigned yet`}
            </p>
            <p style={{ color: '#555', fontSize: '12px' }}>
              {search ? 'Try a different search term' : 'Use the Admin Panel to assign skins to this tier'}
            </p>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px' }}>
            {filtered.map((skin, i) => {
              const resolvedUrl = getSkinImage(skin.heroId, skin.name)
              const hasImage    = !!resolvedUrl
              const key         = `${skin.heroId}__${skin.name}`
              const isSelected  = selectedSkins.find(s => `${s.heroId}__${s.name}` === key)
              const ts          = TIER_STYLES[activeTier]
              return (
                <button
                  key={i}
                  onClick={() => toggleSkin(skin, resolvedUrl)}
                  style={{
                    position: 'relative', borderRadius: '10px', overflow: 'hidden',
                    border: `2px solid ${isSelected ? ts.border : hasImage ? '#252535' : '#1a1a2e'}`,
                    opacity: hasImage ? 1 : 0.4,
                    cursor: hasImage ? 'pointer' : 'not-allowed',
                    transform: isSelected ? 'scale(0.97)' : 'scale(1)',
                    transition: 'all 0.15s',
                    background: 'none', padding: 0, textAlign: 'left',
                  }}
                >
                  <img
                    src={hasImage ? resolvedUrl : PLACEHOLDER}
                    alt={skin.name}
                    style={{ width: '100%', height: '112px', objectFit: 'cover', display: 'block', background: '#1a1a2e' }}
                    onError={e => { e.target.src = PLACEHOLDER }}
                  />
                  {isSelected && (
                    <div style={{
                      position: 'absolute', top: '4px', right: '4px',
                      width: '18px', height: '18px', background: ts.border,
                      borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      <span style={{ color: '#000', fontSize: '10px', fontWeight: 700 }}>✓</span>
                    </div>
                  )}
                  <div style={{
                    position: 'absolute', bottom: 0, left: 0, right: 0,
                    background: 'linear-gradient(to top, rgba(0,0,0,0.9), transparent)',
                    padding: '16px 6px 5px',
                  }}>
                    <p style={{
                      color: '#fff', fontSize: '9px', fontWeight: 600, margin: '0 0 2px', lineHeight: 1.2,
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}>
                      {skin.name}
                    </p>
                    <p style={{ color: '#aaa', fontSize: '9px', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {skin.heroName}
                    </p>
                  </div>
                  {!hasImage && (
                    <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <span style={{ color: '#555', fontSize: '10px' }}>No Image</span>
                    </div>
                  )}
                </button>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Main HeroPicker ────────────────────────────────────────────
export default function HeroPicker() {
  const [isOpen,        setIsOpen]        = useState(false)
  const [mode,          setMode]          = useState(null)   // null | 'hero' | 'collection'
  const [selectedHero,  setSelectedHero]  = useState(null)
  const [search,        setSearch]        = useState('')
  const [selectedSkins, setSelectedSkins] = useState([])
  const [isAdding,      setIsAdding]      = useState(false)
  const [repoFiles,     setRepoFiles]     = useState([])
  const [imageCache,    setImageCache]    = useState({})
  const [fetchError,    setFetchError]    = useState(false)

  const heroSearchRef = useScrollIntoView()

  // ── Keyboard-aware sheet positioning ─────────────────────────
  const vvHeight       = useVisualViewportHeight()
  const keyboardHeight = window.innerHeight - vvHeight

  const overlayStyle = {
    position: 'fixed',
    inset: 0,
    zIndex: 50,
    display: 'flex',
    alignItems: 'flex-end',
    justifyContent: 'center',
    background: 'rgba(0,0,0,0.7)',
    backdropFilter: 'blur(4px)',
  }

  const sheetStyle = {
    width: '100%',
    maxWidth: '480px',
    maxHeight: `min(${vvHeight * 0.85}px, 85dvh)`,
    marginBottom: `${keyboardHeight}px`,
    background: '#0e0e1a',
    border: '1px solid #252535',
    borderRadius: '20px 20px 0 0',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
    boxShadow: '0 -8px 40px rgba(0,0,0,0.6)',
    paddingBottom: keyboardHeight > 0 ? '0px' : 'env(safe-area-inset-bottom, 0px)',
    transition: 'margin-bottom 0.2s ease, max-height 0.2s ease',
  }
  // ─────────────────────────────────────────────────────────────

  const addImages    = useStore(s => s.addImages)
  const saveSnapshot = useStore(s => s.saveSnapshot)
  const updateImage  = useStore(s => s.updateImage)
  const images       = useStore(s => s.images)
  const hasImages    = images.length > 0

  // ── Back-button support ──────────────────────────────────────
  const historyPushed = useRef(false)

  const handleClose = useCallback(() => {
    setIsOpen(false)
    setSelectedHero(null)
    setSelectedSkins([])
    setSearch('')
    setMode(null)
  }, [])

  useEffect(() => {
    if (isOpen) {
      window.history.pushState({ heroPickerOpen: true }, '')
      historyPushed.current = true

      const onPopState = () => {
        // If a hero is selected, go back to hero list; if in a mode, go back to mode select
        if (selectedHero) {
          setSelectedHero(null)
          setSelectedSkins([])
          window.history.pushState({ heroPickerOpen: true }, '')
          return
        }
        if (mode) {
          setMode(null)
          window.history.pushState({ heroPickerOpen: true }, '')
          return
        }
        handleClose()
        historyPushed.current = false
      }

      window.addEventListener('popstate', onPopState)
      return () => window.removeEventListener('popstate', onPopState)
    } else {
      if (historyPushed.current) {
        historyPushed.current = false
        window.history.back()
      }
    }
  }, [isOpen, mode, selectedHero, handleClose])
  // ─────────────────────────────────────────────────────────────

  // Fetch repo file listing once when picker opens
  useEffect(() => {
    if (!isOpen || repoFiles.length > 0) return
    fetch(GITHUB_API)
      .then(r => r.json())
      .then(data => {
        if (!Array.isArray(data)) { setFetchError(true); return }
        const names = data
          .filter(f => f.type === 'file' && /\.(jpg|jpeg|png|webp)$/i.test(f.name))
          .map(f => f.name)
        setRepoFiles(names)
      })
      .catch(() => setFetchError(true))
  }, [isOpen])

  // Build image map for selected hero
  useEffect(() => {
    if (!selectedHero || repoFiles.length === 0 || imageCache[selectedHero.id]) return
    const map = buildImageMap(repoFiles, selectedHero.id, selectedHero.skins)
    setImageCache(prev => ({ ...prev, [selectedHero.id]: map }))
  }, [selectedHero, repoFiles])

  function getSkinImage(hero, skin) {
    return (imageCache[hero.id] || {})[skin.name] || null
  }

  function getHeroImage(hero) {
    return Object.values(imageCache[hero.id] || {})[0] || HERO_PLACEHOLDER
  }

  const filtered = skinsData.filter(h => fuzzyMatch(h.name, search))

  const toggleSkin = (skin, resolvedUrl) => {
    if (!resolvedUrl) return
    setSelectedSkins(prev => {
      const exists = prev.find(s => s.name === skin.name)
      if (exists) return prev.filter(s => s.name !== skin.name)
      return [...prev, { ...skin, image: resolvedUrl }]
    })
  }

  const handleAddToCanvas = async () => {
    if (!selectedSkins.length || isAdding) return
    setIsAdding(true)
    saveSnapshot()
    const totalAfter = images.length + selectedSkins.length
    const cols       = Math.ceil(Math.sqrt(totalAfter))
    const newImages  = await Promise.all(
      selectedSkins.map(async (skin, i) => {
        const { width, height } = await preloadImage(skin.image)
        const globalIndex = images.length + i
        return {
          src: skin.image,
          x: (globalIndex % cols) * CELL_SIZE,
          y: Math.floor(globalIndex / cols) * CELL_SIZE,
          naturalWidth: width, naturalHeight: height,
          scaleX: CELL_SIZE / width, scaleY: CELL_SIZE / height,
          rotation: 0, opacity: 1,
        }
      })
    )
    images.forEach((img, i) => {
      updateImage(img.id, {
        x: (i % cols) * CELL_SIZE,
        y: Math.floor(i / cols) * CELL_SIZE,
        scaleX: CELL_SIZE / img.naturalWidth,
        scaleY: CELL_SIZE / img.naturalHeight,
      })
    })
    addImages(newImages)
    setIsAdding(false)
    setIsOpen(false)
    setSelectedHero(null)
    setSelectedSkins([])
    setMode(null)
  }

  const headerTitle = () => {
    if (!mode) return 'Add Skins'
    if (mode === 'hero') {
      if (selectedHero) return selectedHero.name
      return 'Select Hero'
    }
    if (mode === 'collection') return 'Collection'
    return 'Add Skins'
  }

  const handleBack = () => {
    if (selectedHero) { setSelectedHero(null); setSelectedSkins([]); return }
    if (mode)         { setMode(null);          return }
    handleClose()
  }

  const showBack = !!(mode || selectedHero)

  return (
    <>
      <button className="btn-ghost text-sm px-3" onClick={() => setIsOpen(true)}>
        + Add Skins
      </button>

      {isOpen && (
        <div style={overlayStyle} onClick={e => { if (e.target === e.currentTarget) handleClose() }}>
          <div style={sheetStyle}>

            {/* ── Sheet header ── */}
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '14px 16px 10px', borderBottom: '1px solid #1a1a2e', flexShrink: 0,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                {showBack && (
                  <button
                    onClick={handleBack}
                    style={{
                      background: 'none', border: 'none', color: '#6c63ff',
                      fontSize: '20px', cursor: 'pointer', padding: '0 4px', lineHeight: 1,
                    }}
                  >‹</button>
                )}
                <span style={{ color: '#fff', fontSize: '16px', fontWeight: 700 }}>
                  {headerTitle()}
                </span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                {selectedSkins.length > 0 && (
                  <button
                    onClick={handleAddToCanvas}
                    disabled={isAdding}
                    style={{
                      background: 'linear-gradient(135deg, #6c63ff, #a855f7)',
                      border: 'none', borderRadius: '8px', padding: '7px 14px',
                      color: '#fff', fontWeight: 700, fontSize: '13px', cursor: 'pointer',
                      opacity: isAdding ? 0.6 : 1,
                    }}
                  >
                    {isAdding ? 'Adding…' : `Add ${selectedSkins.length}`}
                  </button>
                )}
                <button
                  onClick={handleClose}
                  style={{
                    background: 'none', border: 'none', color: '#666',
                    fontSize: '20px', cursor: 'pointer', lineHeight: 1, padding: '2px 4px',
                  }}
                >✕</button>
              </div>
            </div>

            {/* ── Sheet body ── */}
            <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>

              {/* Mode select */}
              {!mode && (
                <div style={{ overflowY: 'auto', flex: 1 }}>
                  <ModeSelect onSelectMode={setMode} />
                </div>
              )}

              {/* Collection mode */}
              {mode === 'collection' && (
                <CollectionMode
                  repoFiles={repoFiles}
                  imageCache={imageCache}
                  setImageCache={setImageCache}
                  fetchError={fetchError}
                  selectedSkins={selectedSkins}
                  setSelectedSkins={setSelectedSkins}
                />
              )}

              {/* Hero mode — hero list */}
              {mode === 'hero' && !selectedHero && (
                <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
                  <div style={{ padding: '10px 12px', flexShrink: 0 }}>
                    <input
                      ref={heroSearchRef}
                      type="text"
                      placeholder="🔍 Search hero..."
                      value={search}
                      onChange={e => setSearch(e.target.value)}
                      style={{
                        width: '100%', background: '#12121a', border: '1px solid #252535',
                        borderRadius: '8px', padding: '8px 12px', color: '#fff',
                        fontSize: '13px', outline: 'none', boxSizing: 'border-box',
                      }}
                    />
                  </div>
                  <div style={{ flex: 1, overflowY: 'auto', padding: '0 12px 12px' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px' }}>
                      {filtered.map(hero => (
                        <button
                          key={hero.id}
                          onClick={() => { setSelectedHero(hero); setSearch('') }}
                          style={{
                            background: '#1a1a2e', border: '1px solid #252535',
                            borderRadius: '12px', overflow: 'hidden', cursor: 'pointer',
                            padding: 0, textAlign: 'left', transition: 'border-color 0.15s',
                          }}
                          onMouseEnter={e => e.currentTarget.style.borderColor = '#6c63ff'}
                          onMouseLeave={e => e.currentTarget.style.borderColor = '#252535'}
                        >
                          <img
                            src={getHeroImage(hero)}
                            alt={hero.name}
                            style={{ width: '100%', height: '80px', objectFit: 'cover', display: 'block' }}
                            onError={e => { e.target.src = HERO_PLACEHOLDER }}
                          />
                          <div style={{ padding: '6px 8px' }}>
                            <p style={{
                              color: '#fff', fontSize: '11px', fontWeight: 600, margin: '0 0 2px',
                              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                            }}>
                              {hero.name}
                            </p>
                            <p style={{ color: '#666', fontSize: '10px', margin: 0 }}>
                              {hero.skins.length} skins
                            </p>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* Hero mode — skin list */}
              {mode === 'hero' && selectedHero && (
                <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
                  <div style={{ padding: '10px 12px', flexShrink: 0 }}>
                    <input
                      type="text"
                      placeholder="🔍 Search skin..."
                      value={search}
                      onChange={e => setSearch(e.target.value)}
                      style={{
                        width: '100%', background: '#12121a', border: '1px solid #252535',
                        borderRadius: '8px', padding: '8px 12px', color: '#fff',
                        fontSize: '13px', outline: 'none', boxSizing: 'border-box',
                      }}
                    />
                  </div>
                  <div style={{ flex: 1, overflowY: 'auto', padding: '0 12px 12px' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px' }}>
                      {selectedHero.skins
                        .filter(s => fuzzyMatch(s.name, search))
                        .map((skin, i) => {
                          const resolvedUrl = getSkinImage(selectedHero, skin)
                          const hasImage    = !!resolvedUrl
                          const isSelected  = selectedSkins.find(s => s.name === skin.name)
                          return (
                            <button
                              key={i}
                              onClick={() => toggleSkin(skin, resolvedUrl)}
                              style={{
                                position: 'relative', borderRadius: '10px', overflow: 'hidden',
                                border: `2px solid ${isSelected ? '#6c63ff' : hasImage ? '#252535' : '#1a1a2e'}`,
                                opacity: hasImage ? 1 : 0.4,
                                cursor: hasImage ? 'pointer' : 'not-allowed',
                                transform: isSelected ? 'scale(0.97)' : 'scale(1)',
                                transition: 'all 0.15s',
                                background: 'none', padding: 0, textAlign: 'left',
                              }}
                            >
                              <img
                                src={hasImage ? resolvedUrl : PLACEHOLDER}
                                alt={skin.name}
                                style={{ width: '100%', height: '112px', objectFit: 'cover', display: 'block', background: '#1a1a2e' }}
                                onError={e => { e.target.src = PLACEHOLDER }}
                              />
                              {isSelected && (
                                <div style={{
                                  position: 'absolute', top: '4px', right: '4px',
                                  width: '18px', height: '18px', background: '#6c63ff',
                                  borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                }}>
                                  <span style={{ color: '#fff', fontSize: '10px', fontWeight: 700 }}>✓</span>
                                </div>
                              )}
                              <div style={{
                                position: 'absolute', bottom: 0, left: 0, right: 0,
                                background: 'linear-gradient(to top, rgba(0,0,0,0.9), transparent)',
                                padding: '16px 6px 5px',
                              }}>
                                <p style={{
                                  color: '#fff', fontSize: '9px', fontWeight: 600, margin: 0, lineHeight: 1.2,
                                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                                }}>
                                  {skin.name}
                                </p>
                              </div>
                              {!hasImage && (
                                <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                  <span style={{ color: '#555', fontSize: '10px' }}>No Image</span>
                                </div>
                              )}
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
