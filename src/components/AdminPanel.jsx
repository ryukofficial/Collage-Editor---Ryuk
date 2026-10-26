import { useState, useMemo } from 'react'
import skinsData from '../../skins.json'
import { adminSaveTiers } from '../utils/wallet'

const TIERS = ['Legend', 'Grand', 'Exquisite', 'Deluxe', 'Exceptional', 'Common']

const TIER_COLORS = {
  Legend:      { bg: '#2a1a00', border: '#f5c842', text: '#f5c842' },
  Grand:       { bg: '#1a002a', border: '#a855f7', text: '#c084fc' },
  Exquisite:   { bg: '#001a2a', border: '#38bdf8', text: '#7dd3fc' },
  Deluxe:      { bg: '#001a10', border: '#34d399', text: '#6ee7b7' },
  Exceptional: { bg: '#1a1500', border: '#facc15', text: '#fde68a' },
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
  const [selected, setSelected] = useState(new Set())
  const [bulkMode, setBulkMode] = useState(false)
  const [publishing, setPublishing] = useState(false)
  const [publishStatus, setPublishStatus] = useState(null)

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

  const save = (next) => {
    localStorage.setItem('mlbb_tiers', JSON.stringify(next))
    setAssignments(next)
  }

  const setTier = (heroId, skinName, tier) => {
    const key = `${heroId}__${skinName}`
    const next = { ...assignments, [key]: tier }
    save(next)
  }

  const bulkAssign = (tier) => {
    const next = { ...assignments }
    selected.forEach(key => { next[key] = tier })
    save(next)
    setSelected(new Set())
  }

  const toggleSelect = (key) => {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const selectAll = () => {
    setSelected(new Set(filtered.map(s => `${s.heroId}__${s.skinName}`)))
  }

  const clearSelection = () => setSelected(new Set())

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

  // Saves the tiers into skins.json on GitHub. The GitHub token lives only on the
  // server (/api/admin-save-tiers), which also checks that you are an admin.
  const handlePublish = async () => {
    setPublishing(true)
    setPublishStatus(null)
    try {
      const tiers = {}
      for (const hero of skinsData) for (const skin of hero.skins) {
        tiers[`${hero.id}__${skin.name}`] = assignments[`${hero.id}__${skin.name}`] || ''
      }
      await adminSaveTiers(tiers)
      setPublishStatus('success')
    } catch (e) {
      console.error('[admin] publish failed', e?.message)
      setPublishStatus('error')
    }
    setPublishing(false)
    setTimeout(() => setPublishStatus(null), 3000)
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
      background: '#0f1115', display: 'flex', flexDirection: 'column',
      fontFamily: "'DM Sans', sans-serif",
    }}>

      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '12px 16px', borderBottom: '1px solid #2a2e37',
        background: '#0f1115', flexShrink: 0, gap: '10px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span style={{ fontSize: '18px' }}>⚙️</span>
          <div>
            <h1 style={{ color: '#fff', fontSize: '16px', fontWeight: 700, margin: 0 }}>Admin Panel</h1>
            <p style={{ color: '#6b717c', fontSize: '11px', margin: 0 }}>{allSkins.length} skins total</p>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <button
            onClick={() => { setBulkMode(b => !b); clearSelection() }}
            style={{
              background: bulkMode ? '#1c1f26' : '#1c1f26',
              border: `1px solid ${bulkMode ? '#3b82f6' : '#2a2e37'}`,
              borderRadius: '8px', padding: '7px 12px',
              color: bulkMode ? '#3b82f6' : '#a1a7b3',
              fontWeight: 700, fontSize: '12px', cursor: 'pointer',
            }}
          >
            {bulkMode ? '✓ Bulk ON' : 'Bulk Select'}
          </button>

          {/* Export button */}
          <button
            onClick={handleExport}
            style={{
              background: saved ? '#065f46' : '#1c1f26',
              border: `1px solid ${saved ? '#34d399' : '#2a2e37'}`,
              borderRadius: '8px', padding: '7px 14px',
              color: saved ? '#34d399' : '#a1a7b3',
              fontWeight: 700, fontSize: '12px', cursor: 'pointer',
            }}
          >
            {saved ? '✓ Exported' : '⬇ Export'}
          </button>

          {/* Publish button */}
          <button
            onClick={handlePublish}
            disabled={publishing}
            style={{
              background: publishStatus === 'success' ? '#065f46'
                : publishStatus === 'error' ? '#3a0a0a'
                : '#3b82f6',
              border: `1px solid ${publishStatus === 'success' ? '#34d399' : publishStatus === 'error' ? '#ef4444' : 'transparent'}`,
              borderRadius: '8px', padding: '7px 14px',
              color: '#fff', fontWeight: 700, fontSize: '12px',
              cursor: publishing ? 'not-allowed' : 'pointer',
              opacity: publishing ? 0.7 : 1,
            }}
          >
            {publishing ? '⏳ Publishing...'
              : publishStatus === 'success' ? '✓ Published!'
              : publishStatus === 'error' ? '✕ Failed'
              : '🚀 Publish'}
          </button>

          <button
            onClick={onClose}
            style={{
              background: '#1c1f26', border: '1px solid #2a2e37', borderRadius: '8px',
              padding: '7px 12px', color: '#a1a7b3', fontSize: '12px', cursor: 'pointer',
            }}
          >✕</button>
        </div>
      </div>

      {/* Stats / tier filter bar */}
      <div style={{
        display: 'flex', gap: '6px', padding: '8px 16px', flexShrink: 0,
        borderBottom: '1px solid #1c1f26', overflowX: 'auto',
      }}>
        {[{ label: 'All', key: 'All' }, ...TIERS.map(t => ({ label: t, key: t })), { label: 'Unassigned', key: 'Unassigned' }].map(({ label, key }) => {
          const c = TIER_COLORS[key === 'All' || key === 'Unassigned' ? '' : key]
          const isActive = filterTier === key
          const count = key === 'All' ? allSkins.length : (stats[key] ?? 0)
          return (
            <button key={key}
              onClick={() => setFilterTier(isActive ? 'All' : key)}
              style={{
                flexShrink: 0,
                background: isActive ? (c?.bg || '#1c1f26') : '#1c1f26',
                border: `1px solid ${isActive ? (c?.border || '#3b82f6') : '#2a2e37'}`,
                borderRadius: '7px', padding: '4px 10px',
                color: isActive ? (c?.text || '#3b82f6') : '#6b717c',
                fontSize: '11px', fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap',
              }}
            >
              {label} <span style={{ opacity: 0.7 }}>({count})</span>
            </button>
          )
        })}
      </div>

      {/* Search + hero filter */}
      <div style={{
        display: 'flex', gap: '8px', padding: '8px 16px',
        flexShrink: 0, borderBottom: '1px solid #1c1f26',
      }}>
        <input
          type="text" placeholder="🔍 Search hero or skin..."
          value={search} onChange={e => setSearch(e.target.value)}
          style={{
            flex: 1, background: '#1c1f26', border: '1px solid #2a2e37',
            borderRadius: '8px', padding: '7px 12px', color: '#fff',
            fontSize: '13px', outline: 'none',
          }}
        />
        <select value={filterHero} onChange={e => setFilterHero(e.target.value)}
          style={{
            background: '#1c1f26', border: '1px solid #2a2e37', borderRadius: '8px',
            padding: '7px 10px', color: filterHero ? '#fff' : '#6b717c',
            fontSize: '12px', outline: 'none', minWidth: '120px',
          }}
        >
          <option value="">All Heroes</option>
          {heroList.map(h => <option key={h.id} value={h.id}>{h.name}</option>)}
        </select>
      </div>

      {/* Bulk mode toolbar */}
      {bulkMode && (
        <div style={{
          padding: '8px 16px', background: '#0f1115',
          borderBottom: '1px solid #2a2e37', flexShrink: 0,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
            <span style={{ color: '#a1a7b3', fontSize: '12px' }}>
              {selected.size > 0 ? `${selected.size} selected` : 'Tap checkbox to select'}
            </span>
            <button onClick={selectAll} style={{
              background: 'none', border: '1px solid #2a2e37', borderRadius: '6px',
              padding: '3px 8px', color: '#aaa', fontSize: '11px', cursor: 'pointer',
            }}>Select all ({filtered.length})</button>
            {selected.size > 0 && (
              <button onClick={clearSelection} style={{
                background: 'none', border: '1px solid #2a2e37', borderRadius: '6px',
                padding: '3px 8px', color: '#a1a7b3', fontSize: '11px', cursor: 'pointer',
              }}>Clear</button>
            )}
          </div>

          {selected.size > 0 && (
            <div>
              <p style={{ color: '#6b717c', fontSize: '11px', margin: '0 0 6px' }}>Assign {selected.size} skin{selected.size > 1 ? 's' : ''} to:</p>
              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                {TIERS.map(tier => {
                  const tc = TIER_COLORS[tier]
                  return (
                    <button key={tier} onClick={() => bulkAssign(tier)} style={{
                      background: tc.bg, border: `1px solid ${tc.border}`,
                      borderRadius: '8px', padding: '6px 14px',
                      color: tc.text, fontSize: '12px', fontWeight: 700,
                      cursor: 'pointer',
                    }}>
                      {tier}
                    </button>
                  )
                })}
                <button onClick={() => bulkAssign('')} style={{
                  background: '#1a1a1a', border: '1px solid #2a2e37',
                  borderRadius: '8px', padding: '6px 14px',
                  color: '#6b717c', fontSize: '12px', cursor: 'pointer',
                }}>
                  Clear tier
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Count row */}
      <div style={{ padding: '5px 16px', flexShrink: 0 }}>
        <span style={{ color: '#6b717c', fontSize: '11px' }}>
          Showing {filtered.length} skin{filtered.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Skin list */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '0 16px 80px' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          {filtered.map(({ heroId, heroName, skinName }) => {
            const key = `${heroId}__${skinName}`
            const currentTier = assignments[key] || ''
            const colors = TIER_COLORS[currentTier] || TIER_COLORS['']
            const isSelected = selected.has(key)

            return (
              <div key={key}
                style={{
                  display: 'flex', alignItems: 'center', gap: '10px',
                  background: isSelected ? '#1c1f26' : '#0f1115',
                  border: `1px solid ${isSelected ? '#3b82f6' : currentTier ? colors.border + '55' : '#1c1f26'}`,
                  borderRadius: '10px', padding: '10px 12px',
                  transition: 'all 0.15s',
                  cursor: 'default',
                }}
              >
                {/* Checkbox — only interaction point in bulk mode */}
                {bulkMode && (
                  <div
                    onClick={(e) => {
                      e.stopPropagation()
                      toggleSelect(key)
                      setSearch('')
                    }}
                    style={{
                      width: '28px', height: '28px', borderRadius: '7px', flexShrink: 0,
                      border: `2px solid ${isSelected ? '#3b82f6' : '#6b717c'}`,
                      background: isSelected ? '#3b82f6' : 'transparent',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      cursor: 'pointer',
                    }}
                  >
                    {isSelected && <span style={{ color: '#fff', fontSize: '14px', fontWeight: 700 }}>✓</span>}
                  </div>
                )}

                {/* Skin + hero name */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ color: '#fff', fontSize: '13px', fontWeight: 600, margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {skinName}
                  </p>
                  <p style={{ color: '#6b717c', fontSize: '11px', margin: 0 }}>{heroName}</p>
                </div>

                {/* Current tier badge */}
                {currentTier && (
                  <span style={{
                    background: colors.bg, border: `1px solid ${colors.border}`,
                    color: colors.text, fontSize: '10px', fontWeight: 700,
                    padding: '2px 7px', borderRadius: '6px', flexShrink: 0,
                  }}>
                    {currentTier}
                  </span>
                )}

                {/* Individual tier buttons (only when NOT in bulk mode) */}
                {!bulkMode && (
                  <div style={{ display: 'flex', gap: '3px', flexShrink: 0, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                    {TIERS.map(tier => {
                      const tc = TIER_COLORS[tier]
                      const isActive = currentTier === tier
                      return (
                        <button key={tier}
                          onClick={() => setTier(heroId, skinName, isActive ? '' : tier)}
                          style={{
                            background: isActive ? tc.bg : 'transparent',
                            border: `1px solid ${isActive ? tc.border : '#2a2e37'}`,
                            color: isActive ? tc.text : '#6b717c',
                            fontSize: '10px', fontWeight: isActive ? 700 : 400,
                            padding: '3px 7px', borderRadius: '6px',
                            cursor: 'pointer', transition: 'all 0.15s', whiteSpace: 'nowrap',
                          }}
                          onMouseEnter={e => { if (!isActive) { e.currentTarget.style.borderColor = tc.border; e.currentTarget.style.color = tc.text } }}
                          onMouseLeave={e => { if (!isActive) { e.currentTarget.style.borderColor = '#2a2e37'; e.currentTarget.style.color = '#6b717c' } }}
                        >
                          {tier}
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
    </div>
  )
}
