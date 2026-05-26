import { useState, useMemo } from 'react'
import skinsData from '../../skins.json'

const TIERS = ['Legend', 'Grand', 'Exquisite', 'Deluxe', 'Exceptional', 'Common']

const TIER_COLORS = {
  Legend:      { bg: '#2a1a00', border: '#f5c842', text: '#f5c842' },
  Grand:       { bg: '#1a002a', border: '#a855f7', text: '#c084fc' },
  Exquisite:   { bg: '#001a2a', border: '#38bdf8', text: '#7dd3fc' },
  Deluxe:      { bg: '#001a10', border: '#34d399', text: '#6ee7b7' },
  Exceptional: { bg: '#1a1a00', border: '#facc15', text: '#fde68a' },
  Common:      { bg: '#1a1a1a', border: '#6b7280', text: '#9ca3af' },
  '':          { bg: '#12121a', border: '#252535', text: '#555' },
}

function loadSaved() {
  try {
    const raw = localStorage.getItem('mlbb_tiers')
    return raw ? JSON.parse(raw) : {}
  } catch { return {} }
}

export default function AdminPanel({ onClose }) {
  const [assignments, setAssignments] = useState(loadSaved)
  const [search, setSearch] = useState('')
  const [filterTier, setFilterTier] = useState('All')
  const [filterHero, setFilterHero] = useState('')
  const [saved, setSaved] = useState(false)

  const allSkins = useMemo(() => {
    const list = []
    for (const hero of skinsData) {
      for (const skin of hero.skins) {
        list.push({ heroId: hero.id, heroName: hero.name, skinName: skin.name })
      }
    }
    return list
  }, [])

  const filtered = useMemo(() => {
    return allSkins.filter(s => {
      const q = search.toLowerCase()
      const matchSearch = !q ||
        s.skinName.toLowerCase().includes(q) ||
        s.heroName.toLowerCase().includes(q)
      const key = `${s.heroId}__${s.skinName}`
      const tier = assignments[key] || ''
      const matchTier = filterTier === 'All' || tier === filterTier ||
        (filterTier === 'Unassigned' && !tier)
      const matchHero = !filterHero || s.heroId === filterHero
      return matchSearch && matchTier && matchHero
    })
  }, [allSkins, search, filterTier, filterHero, assignments])

  const setTier = (heroId, skinName, tier) => {
    const key = `${heroId}__${skinName}`
    setAssignments(prev => {
      const next = { ...prev, [key]: tier }
      localStorage.setItem('mlbb_tiers', JSON.stringify(next))
      return next
    })
  }

  const handleExport = () => {
    const updated = skinsData.map(hero => ({
      ...hero,
      skins: hero.skins.map(skin => ({
        ...skin,
        tier: assignments[`${hero.id}__${skin.name}`] || '',
      }))
    }))
    const blob = new Blob([JSON.stringify(updated, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'skins.json'
    a.click()
    URL.revokeObjectURL(url)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  const stats = useMemo(() => {
    const counts = { Unassigned: 0 }
    TIERS.forEach(t => counts[t] = 0)
    for (const s of allSkins) {
      const tier = assignments[`${s.heroId}__${s.skinName}`] || ''
      if (tier) counts[tier] = (counts[tier] || 0) + 1
      else counts.Unassigned++
    }
    return counts
  }, [allSkins, assignments])

  const heroList = useMemo(() => skinsData.map(h => ({ id: h.id, name: h.name })), [])

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 500,
      background: '#080810',
      display: 'flex', flexDirection: 'column',
      fontFamily: "'DM Sans', sans-serif",
    }}>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '14px 20px', borderBottom: '1px solid #252535',
        background: '#0e0e1a', flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <span style={{ fontSize: '20px' }}>⚙️</span>
          <div>
            <h1 style={{ color: '#fff', fontSize: '17px', fontWeight: 700, margin: 0 }}>Admin Panel</h1>
            <p style={{ color: '#555', fontSize: '12px', margin: 0 }}>Assign tiers to skins · {allSkins.length} total skins</p>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          <button
            onClick={handleExport}
            style={{
              background: saved ? '#065f46' : 'linear-gradient(135deg, #6c63ff, #a855f7)',
              border: 'none', borderRadius: '10px', padding: '9px 18px',
              color: '#fff', fontWeight: 700, fontSize: '13px', cursor: 'pointer',
              transition: 'all 0.2s',
            }}
          >
            {saved ? '✓ Exported!' : '⬇ Export skins.json'}
          </button>
          <button
            onClick={onClose}
            style={{
              background: '#1a1a2e', border: '1px solid #333', borderRadius: '8px',
              padding: '9px 14px', color: '#888', fontSize: '13px', cursor: 'pointer',
            }}
          >
            ✕ Close
          </button>
        </div>
      </div>

      {/* Stats bar */}
      <div style={{
        display: 'flex', gap: '8px', padding: '10px 20px', flexShrink: 0,
        borderBottom: '1px solid #1a1a2e', overflowX: 'auto',
      }}>
        {[...TIERS, 'Unassigned'].map(tier => {
          const c = TIER_COLORS[tier === 'Unassigned' ? '' : tier]
          return (
            <button
              key={tier}
              onClick={() => setFilterTier(filterTier === tier ? 'All' : tier)}
              style={{
                flexShrink: 0,
                background: filterTier === tier ? (c?.bg || '#1a1a2e') : '#12121a',
                border: `1px solid ${filterTier === tier ? (c?.border || '#555') : '#252535'}`,
                borderRadius: '8px', padding: '5px 12px',
                color: c?.text || '#888', fontSize: '12px', fontWeight: 600,
                cursor: 'pointer', whiteSpace: 'nowrap',
              }}
            >
              {tier} <span style={{ opacity: 0.7 }}>({stats[tier] || 0})</span>
            </button>
          )
        })}
      </div>

      {/* Filters */}
      <div style={{
        display: 'flex', gap: '10px', padding: '10px 20px',
        flexShrink: 0, borderBottom: '1px solid #1a1a2e',
      }}>
        <input
          type="text"
          placeholder="🔍 Search hero or skin..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{
            flex: 1, background: '#12121a', border: '1px solid #252535',
            borderRadius: '8px', padding: '8px 12px', color: '#fff',
            fontSize: '13px', outline: 'none',
          }}
        />
        <select
          value={filterHero}
          onChange={e => setFilterHero(e.target.value)}
          style={{
            background: '#12121a', border: '1px solid #252535', borderRadius: '8px',
            padding: '8px 12px', color: filterHero ? '#fff' : '#666',
            fontSize: '13px', outline: 'none', minWidth: '140px',
          }}
        >
          <option value="">All Heroes</option>
          {heroList.map(h => (
            <option key={h.id} value={h.id}>{h.name}</option>
          ))}
        </select>
      </div>

      {/* Results count */}
      <div style={{ padding: '6px 20px', flexShrink: 0 }}>
        <span style={{ color: '#555', fontSize: '12px' }}>
          Showing {filtered.length} skin{filtered.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Skin list */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '0 20px 20px' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          {filtered.map(({ heroId, heroName, skinName }) => {
            const key = `${heroId}__${skinName}`
            const currentTier = assignments[key] || ''
            const colors = TIER_COLORS[currentTier] || TIER_COLORS['']
            return (
              <div
                key={key}
                style={{
                  display: 'flex', alignItems: 'center', gap: '12px',
                  background: '#0e0e1a', border: `1px solid ${currentTier ? colors.border + '55' : '#1a1a2e'}`,
                  borderRadius: '10px', padding: '10px 14px',
                  transition: 'border-color 0.2s',
                }}
              >
                {/* Hero + skin name */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ color: '#fff', fontSize: '13px', fontWeight: 600, margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {skinName}
                  </p>
                  <p style={{ color: '#555', fontSize: '11px', margin: 0 }}>{heroName}</p>
                </div>

                {/* Tier badge if assigned */}
                {currentTier && (
                  <span style={{
                    background: colors.bg, border: `1px solid ${colors.border}`,
                    color: colors.text, fontSize: '11px', fontWeight: 700,
                    padding: '2px 8px', borderRadius: '6px', flexShrink: 0,
                  }}>
                    {currentTier}
                  </span>
                )}

                {/* Tier selector */}
                <div style={{ display: 'flex', gap: '4px', flexShrink: 0, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                  {TIERS.map(tier => {
                    const tc = TIER_COLORS[tier]
                    const isActive = currentTier === tier
                    return (
                      <button
                        key={tier}
                        onClick={() => setTier(heroId, skinName, isActive ? '' : tier)}
                        style={{
                          background: isActive ? tc.bg : 'transparent',
                          border: `1px solid ${isActive ? tc.border : '#252535'}`,
                          color: isActive ? tc.text : '#555',
                          fontSize: '11px', fontWeight: isActive ? 700 : 400,
                          padding: '3px 8px', borderRadius: '6px',
                          cursor: 'pointer', transition: 'all 0.15s',
                          whiteSpace: 'nowrap',
                        }}
                        onMouseEnter={e => { if (!isActive) { e.currentTarget.style.borderColor = tc.border; e.currentTarget.style.color = tc.text } }}
                        onMouseLeave={e => { if (!isActive) { e.currentTarget.style.borderColor = '#252535'; e.currentTarget.style.color = '#555' } }}
                      >
                        {tier}
                      </button>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
            }
