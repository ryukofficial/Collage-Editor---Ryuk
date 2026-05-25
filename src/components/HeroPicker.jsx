import { useState } from 'react'
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

export default function HeroPicker() {
  const [isOpen, setIsOpen] = useState(false)
  const [selectedHero, setSelectedHero] = useState(null)
  const [search, setSearch] = useState('')
  const addImages = useStore(s => s.addImages)
  const saveSnapshot = useStore(s => s.saveSnapshot)

  const filtered = skinsData.filter(h =>
    h.name.toLowerCase().includes(search.toLowerCase())
  )

  const handleAddSkin = (skin) => {
    if (!skin.image || skin.image === 'PASTE_URL_HERE') {
      alert('Image not added yet for this skin!')
      return
    }
    saveSnapshot()
    addImages([{
      id: Date.now() + Math.random(),
      src: skin.image,
      x: 100,
      y: 100,
      naturalWidth: 300,
      naturalHeight: 450,
      scaleX: 1,
      scaleY: 1,
      rotation: 0,
      opacity: 1,
    }])
    setIsOpen(false)
    setSelectedHero(null)
  }

  return (
    <>
      {/* Trigger Button */}
      <button
        className="btn-primary text-sm px-3"
        onClick={() => { setIsOpen(true); setSelectedHero(null); setSearch('') }}
      >
        + Create
      </button>

      {/* Modal Overlay */}
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm">
          <div className="w-full sm:w-[480px] max-h-[85vh] bg-[#0e0e1a] border border-[#252535] rounded-t-2xl sm:rounded-2xl flex flex-col overflow-hidden shadow-2xl">

            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-[#252535] shrink-0">
              {selectedHero ? (
                <button
                  className="text-[#6c63ff] text-sm font-medium flex items-center gap-1"
                  onClick={() => setSelectedHero(null)}
                >
                  ← Back
                </button>
              ) : (
                <span className="text-white font-bold text-base">Select Hero</span>
              )}
              {selectedHero && (
                <span className="text-white font-bold text-base">{selectedHero.name} Skins</span>
              )}
              <button
                className="text-[#888] hover:text-white text-xl leading-none"
                onClick={() => { setIsOpen(false); setSelectedHero(null) }}
              >
                ✕
              </button>
            </div>

            {/* Hero List */}
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
                          src={hero.image !== 'PASTE_HERO_IMAGE_URL_HERE' ? hero.image : HERO_PLACEHOLDER}
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

            {/* Skin List */}
            {selectedHero && (
              <div className="overflow-y-auto flex-1 px-3 py-3">
                <div className="grid grid-cols-2 gap-3">
                  {selectedHero.skins.map((skin, i) => {
                    const hasImage = skin.image && skin.image !== 'PASTE_URL_HERE'
                    return (
                      <button
                        key={i}
                        onClick={() => handleAddSkin(skin)}
                        className={`relative rounded-xl overflow-hidden border transition-all text-left ${
                          hasImage
                            ? 'border-[#252535] hover:border-[#6c63ff]'
                            : 'border-[#1a1a2e] opacity-50 cursor-not-allowed'
                        }`}
                      >
                        <img
                          src={hasImage ? skin.image : PLACEHOLDER}
                          alt={skin.name}
                          className="w-full h-36 object-cover bg-[#1a1a2e]"
                          onError={e => { e.target.src = PLACEHOLDER }}
                        />
                        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/90 to-transparent p-2">
                          <p className="text-white text-xs font-semibold leading-tight">{skin.name}</p>
                          <span className={`text-[10px] text-white px-1.5 py-0.5 rounded-full mt-1 inline-block ${CATEGORY_COLORS[skin.category] || 'bg-gray-500'}`}>
                            {skin.category}
                          </span>
                        </div>
                        {!hasImage && (
                          <div className="absolute inset-0 flex items-center justify-center">
                            <span className="text-[#555] text-xs">No image</span>
                          </div>
                        )}
                      </button>
                    )
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  )
}
