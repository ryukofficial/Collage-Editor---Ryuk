import { useState, useEffect } from 'react'
import skinsData from '../../skins.json'
import useStore from '../store/useStore'

const CATEGORY_COLORS = {
  Basic: 'bg-gray-500',
  Elite: 'bg-blue-500',
  Special: 'bg-green-500',
  Starlight: 'bg-yellow-500',
  Season: 'bg-orange-400',
  Epic: 'bg-purple-500',
  Legend: 'bg-yellow-400',
  Collector: 'bg-pink-500',
  Mythic: 'bg-red-500',
  Collab: 'bg-cyan-500',
}

const PLACEHOLDER = 'https://placehold.co/200x300/1a1a2e/6c63ff?text=No+Image'
const HERO_PLACEHOLDER = 'https://placehold.co/80x80/1a1a2e/6c63ff?text=?'
const CELL_SIZE = 300
const GITHUB_API = 'https://api.github.com/repos/ryukofficial/mlbb-assets/contents/'
const CDN_BASE = 'https://raw.githubusercontent.com/ryukofficial/mlbb-assets/refs/heads/main/'

// ── Fuzzy matching helpers ─────────────────────────────────────

function slugify(str) {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')  // remove special chars like . ' -
    .replace(/\s+/g, ' ')
    .trim()
}

// Short aliases for hero names so "gus" matches "gusion"
const HERO_ALIASES = {
  gusion:   ['gusion', 'gus'],
  franco:   ['franco'],
  johnson:  ['johnson', 'john'],
  odette:   ['odette'],
  lancelot: ['lancelot', 'lance'],
  alucard:  ['alucard', 'alu'],
  vexana:   ['vexana', 'vex'],
  layla:    ['layla'],
  miya:     ['miya'],
  ling:     ['ling'],
}

// Keywords from skin name — splits into meaningful words (ignores short words)
function skinKeywords(skinName) {
  return slugify(skinName)
    .split(' ')
    .filter(w => w.length >= 3)
}

// Score how well a filename matches a hero + skin
function matchScore(filename, heroId, skinName) {
  const f = slugify(filename.replace(/\.(jpg|jpeg|png|webp)$/i, ''))
  const aliases = HERO_ALIASES[heroId] || [heroId]

  // Must contain at least one hero alias
  const heroMatch = aliases.some(alias => f.includes(alias))
  if (!heroMatch) return 0

  // Check how many skin keywords appear in filename
  const keywords = skinKeywords(skinName)
  if (keywords.length === 0) return 1  // at least hero matched

  const matched = keywords.filter(kw => f.includes(kw))
  return matched.length / keywords.length
}

// For each skin, find the best matching filename (score > 0.3)
function buildImageMap(files, heroId, skins) {
  const map = {}
  const imageFiles = files.filter(f => /\.(jpg|jpeg|png|webp)$/i.test(f))

  for (const skin of skins) {
    let bestFile = null
    let bestScore = 0.3  // minimum threshold

    for (const file of imageFiles) {
      const score = matchScore(file, heroId, skin.name)
      if (score > bestScore) {
        bestScore = score
        bestFile = file
      }
    }

    if (bestFile) {
      map[skin.name] = CDN_BASE + encodeURIComponent(bestFile)
    }
  }

  return map
}

// ── Image preload ──────────────────────────────────────────────

function preloadImage(src) {
  return new Promise((resolve) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight })
    img.onerror = () => resolve({ width: 300, height: 300 })
    img.src = src
  })
}

// ── Component ──────────────────────────────────────────────────

export default function HeroPicker() {
  const [isOpen, setIsOpen]           = useState(false)
  const [selectedHero, setSelectedHero] = useState(null)
  const [search, setSearch]           = useState('')
  const [selectedSkins, setSelectedSkins] = useState([])
  const [isAdding, setIsAdding]       = useState(false)

  // All filenames fetched from GitHub, and per-hero image maps
  const [repoFiles, setRepoFiles]     = useState([])        // raw filenames
  const [imageCache, setImageCache]   = useState({})        // heroId -> { skinName -> url }
  const [fetchError, setFetchError]   = useState(false)

  const addImages    = useStore(s => s.addImages)
  const saveSnapshot = useStore(s => s.saveSnapshot)
  const updateImage  = useStore(s => s.updateImage)
  const images       = useStore(s => s.images)
  const hasImages    = images.length > 0

  // Fetch repo file list once when picker opens
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

  // When a hero is selected, build its image map if not cached
  useEffect(() => {
    if (!selectedHero || repoFiles.length === 0) return
    if (imageCache[selectedHero.id]) return  // already built

    const map = buildImageMap(repoFiles, selectedHero.id, selectedHero.skins)
    setImageCache(prev => ({ ...prev, [selectedHero.id]: map }))
  }, [selectedHero, repoFiles])

  // Get resolved URL for a skin
  function getSkinImage(hero, skin) {
    const map = imageCache[hero.id] || {}
    return map[skin.name] || null
  }

  // Get best image for hero card (first matched skin)
  function getHeroImage(hero) {
    const map = imageCache[hero.id] || {}
    const first = Object.values(map)[0]
    return first || HERO_PLACEHOLDER
  }

  const filtered = skinsData.filter(h =>
    h.name.toLowerCase().includes(search.toLowerCase())
  )

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
    const cols = Math.ceil(Math.sqrt(totalAfter))

    const newImages = await Promise.all(
      selectedSkins.map(async (skin, i) => {
        const { width, height } = await preloadImage(skin.image)
        const globalIndex = images.length + i
        return {
          src: skin.image,
          x: (globalIndex % cols) * CELL_SIZE,
          y: Math.floor(globalIndex / cols) * CELL_SIZE,
          naturalWidth: width,
          naturalHeight: height,
          scaleX: CELL_SIZE / width,
          scaleY: CELL_SIZE / height,
          rotation: 0,
          opacity: 1,
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
  }

  const handleClose = () => {
    setIsOpen(false)
    setSelectedHero(null)
    setSelectedSkins([])
    setSearch('')
  }

  const handleBackToHeroes = () => {
    setSelectedHero(null)
    setSelectedSkins([])
  }

  return (
    <>
      <button
        className="btn-primary text-sm px-3"
        onClick={() => { setIsOpen(true); setSelectedHero(null); setSearch('') }}
      >
        {hasImages ? '+ Add More' : '+ Create'}
      </button>

      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm">
          <div className="w-full sm:w-[480px] max-h-[85vh] bg-[#0e0e1a] border border-[#252535] rounded-t-2xl sm:rounded-2xl flex flex-col overflow-hidden shadow-2xl">

            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-[#252535] shrink-0">
              <div className="flex items-center gap-2">
                {selectedHero ? (
                  <button
                    className="text-[#6c63ff] text-sm font-medium flex items-center gap-1"
                    onClick={handleBackToHeroes}
                  >
                    ← Back
                  </button>
                ) : (
                  <span className="text-white font-bold text-base">Select Hero</span>
                )}
                {selectedHero && (
                  <span className="text-white font-bold text-base">{selectedHero.name}</span>
                )}
              </div>
              <button
                className="text-[#888] hover:text-white text-xl leading-none"
                onClick={handleClose}
              >✕</button>
            </div>

            {/* Fetch error banner */}
            {fetchError && (
              <div className="px-4 py-2 bg-red-900/30 border-b border-red-800 shrink-0">
                <p className="text-red-400 text-xs">⚠ Could not load images from GitHub. Check your connection.</p>
              </div>
            )}

            {/* Hero list */}
            {!selectedHero && (
              <>
                <div className="px-4 py-2 shrink-0">
                  <input
                    type="text"
                    placeholder="Search hero..."
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    className="w-full bg-[#1a1a2e] border border-[#252535] rounded-lg px-3 py-2 text-sm text-white placeholder-[#555] outline-none focus:border-[#6c63ff]"
                  />
                </div>
                <div className="overflow-y-auto flex-1 px-3 pb-4">
                  <div className="grid grid-cols-2 gap-3">
                    {filtered.map(hero => (
                      <button
                        key={hero.id}
                        onClick={() => setSelectedHero(hero)}
                        className="flex items-center gap-3 bg-[#1a1a2e] hover:bg-[#252545] border border-[#252535] hover:border-[#6c63ff] rounded-xl p-3 transition-all text-left"
                      >
                        <img
                          src={getHeroImage(hero)}
                          alt={hero.name}
                          className="w-12 h-12 rounded-lg object-cover shrink-0 bg-[#252535]"
                          onError={e => { e.target.src = HERO_PLACEHOLDER }}
                        />
                        <div>
                          <p className="text-white text-sm font-semibold">{hero.name}</p>
                          <p className="text-[#888] text-xs">{hero.role}</p>
                          <p className="text-[#555] text-xs">{hero.skins.length} skins</p>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              </>
            )}

            {/* Skin grid */}
            {selectedHero && (
              <>
                <div className="px-4 py-2 shrink-0 flex items-center justify-between">
                  <span className="text-[#888] text-xs">
                    {repoFiles.length === 0 && !fetchError
                      ? '⏳ Loading images...'
                      : selectedSkins.length > 0
                      ? `${selectedSkins.length} skin${selectedSkins.length > 1 ? 's' : ''} selected`
                      : 'Tap skins to select'}
                  </span>
                  {selectedSkins.length > 0 && (
                    <button className="text-[#6c63ff] text-xs" onClick={() => setSelectedSkins([])}>
                      Clear all
                    </button>
                  )}
                </div>

                <div className="overflow-y-auto flex-1 px-3 pb-4">
                  <div className="grid grid-cols-3 gap-2">
                    {selectedHero.skins.map((skin, i) => {
                      const resolvedUrl = getSkinImage(selectedHero, skin)
                      const hasImage = !!resolvedUrl
                      const isSelected = selectedSkins.find(s => s.name === skin.name)
                      return (
                        <button
                          key={i}
                          onClick={() => toggleSkin(skin, resolvedUrl)}
                          className={`relative rounded-xl overflow-hidden border-2 transition-all text-left ${
                            !hasImage
                              ? 'border-[#1a1a2e] opacity-40 cursor-not-allowed'
                              : isSelected
                              ? 'border-[#6c63ff] scale-[0.97]'
                              : 'border-[#252535] hover:border-[#6c63ff]'
                          }`}
                        >
                          <img
                            src={hasImage ? resolvedUrl : PLACEHOLDER}
                            alt={skin.name}
                            className="w-full h-28 object-cover bg-[#1a1a2e]"
                            onError={e => { e.target.src = PLACEHOLDER }}
                          />
                          {isSelected && (
                            <div className="absolute top-1 right-1 w-5 h-5 bg-[#6c63ff] rounded-full flex items-center justify-center">
                              <span className="text-white text-xs font-bold">✓</span>
                            </div>
                          )}
                          <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/90 to-transparent p-1.5">
                            <p className="text-white text-[10px] font-semibold leading-tight truncate">{skin.name}</p>
                            <span className={`text-[9px] text-white px-1 py-0.5 rounded-full mt-0.5 inline-block ${CATEGORY_COLORS[skin.category] || 'bg-gray-500'}`}>
                              {skin.category}
                            </span>
                          </div>
                          {!hasImage && (
                            <div className="absolute inset-0 flex items-center justify-center">
                              <span className="text-[#555] text-xs">No Image</span>
                            </div>
                          )}
                        </button>
                      )
                    })}
                  </div>
                </div>

                <div className="px-4 py-3 border-t border-[#252535] shrink-0">
                  <button
                    onClick={handleAddToCanvas}
                    disabled={selectedSkins.length === 0 || isAdding}
                    className={`w-full py-3 rounded-xl font-semibold text-sm transition-all ${
                      selectedSkins.length > 0 && !isAdding
                        ? 'bg-[#6c63ff] text-white hover:bg-[#5a52dd]'
                        : 'bg-[#1a1a2e] text-[#555] cursor-not-allowed'
                    }`}
                  >
                    {isAdding
                      ? 'Loading...'
                      : selectedSkins.length > 0
                      ? `Add ${selectedSkins.length} Skin${selectedSkins.length > 1 ? 's' : ''} to Canvas`
                      : 'Select skins to add'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  )
        }
