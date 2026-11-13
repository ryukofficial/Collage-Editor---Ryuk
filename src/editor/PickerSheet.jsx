// Pick skins from the library: by hero, by tier (grouped by series) or search.
import { useEffect, useMemo, useState } from 'react'
import { Search, Check, ChevronRight, ChevronDown } from 'lucide-react'
import toast from 'react-hot-toast'
import { Sheet, Spinner } from '../ui/Sheet.jsx'
import { HEROES, ALL_SKINS, TIERS, TIER_STYLE, skinId, loadSkinIndex, skinPicture, searchSkins, tierOverrides } from '../lib/skins.js'
import { getSeries } from '../lib/skinSeries.js'
import { skinsToItems } from '../lib/add.js'
import { useCollage } from '../lib/store.js'

function SkinTile({ s, on, onToggle }) {
  const pic = skinPicture(s.id)
  return (
    <button className={`skin ${on ? 'on' : ''} ${pic ? '' : 'disabled'}`} onClick={() => pic && onToggle(s.id)} disabled={!pic}>
      <div className="skin-art">
        {pic && <img src={pic.url} alt="" loading="lazy" crossOrigin="anonymous" decoding="async" />}
        {on && <span className="skin-check"><Check size={14} strokeWidth={3} /></span>}
      </div>
      <div className="skin-name ellipsis">{s.skinName}</div>
      <div className="skin-sub ellipsis">{s.heroName}</div>
    </button>
  )
}

function Grid({ list, picked, toggle }) {
  return <div className="skin-grid">{list.map(s => <SkinTile key={s.id} s={s} on={picked.has(s.id)} onToggle={toggle} />)}</div>
}

// skins of a tier, grouped by series (a series goes with the tier most of its skins have)
function tierGroups(tier) {
  const ov = tierOverrides()
  const tierOf = s => ov[s.id] || s.tier || ''
  const seriesVotes = {}
  for (const s of ALL_SKINS) {
    const series = getSeries(s.heroId, s.skinName)
    const t = tierOf(s)
    if (series && t) { seriesVotes[series] ??= {}; seriesVotes[series][t] = (seriesVotes[series][t] || 0) + 1 }
  }
  const seriesTier = Object.fromEntries(Object.entries(seriesVotes).map(([k, v]) => [k, Object.entries(v).sort((a, b) => b[1] - a[1])[0][0]]))
  const groups = new Map()
  for (const s of ALL_SKINS) {
    const series = getSeries(s.heroId, s.skinName)
    const t = series ? seriesTier[series] : tierOf(s)
    if (t !== tier) continue
    const g = series || 'Other'
    if (!groups.has(g)) groups.set(g, [])
    groups.get(g).push(s)
  }
  return [...groups.entries()].sort(([a], [b]) => (a === 'Other') - (b === 'Other') || a.localeCompare(b))
}

export default function PickerSheet({ onClose, startTab = 'heroes' }) {
  const [tab, setTab] = useState(startTab)
  const [ready, setReady] = useState(false)
  const [hero, setHero] = useState(null)
  const [tier, setTier] = useState('Legend')
  const [q, setQ] = useState('')
  const [picked, setPicked] = useState(() => new Set())
  const [closed, setClosed] = useState({})
  const [adding, setAdding] = useState(null)
  const have = useCollage(s => s.items)
  const inCollage = useMemo(() => new Set(have.map(i => i.skin).filter(Boolean)), [have])

  useEffect(() => { loadSkinIndex().then(() => setReady(true)) }, [])

  const toggle = id => setPicked(p => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n })
  const toggleAll = list => setPicked(p => {
    const ids = list.filter(s => skinPicture(s.id)).map(s => s.id)
    const all = ids.every(id => p.has(id))
    const n = new Set(p); ids.forEach(id => (all ? n.delete(id) : n.add(id))); return n
  })

  const heroes = useMemo(() => {
    const k = q.trim().toLowerCase()
    return k ? HEROES.filter(h => h.name.toLowerCase().includes(k)) : HEROES
  }, [q])
  const heroSkins = useMemo(() => hero ? (hero.skins || []).map(sk => ALL_SKINS.find(s => s.id === skinId(hero.id, sk.name))).filter(Boolean) : [], [hero])
  const groups = useMemo(() => (tab === 'tiers' ? tierGroups(tier) : []), [tab, tier])
  const found = useMemo(() => (tab === 'search' ? searchSkins(q, 120) : []), [tab, q])

  const add = async () => {
    const ids = [...picked]
    if (!ids.length) return
    setAdding({ done: 0, total: ids.length })
    const { items, failed } = await skinsToItems(ids, done => setAdding({ done, total: ids.length }))
    useCollage.getState().add(items)
    setAdding(null)
    if (failed.length) toast.error(`${failed.length} skin${failed.length > 1 ? 's' : ''} couldn't download (check your internet): ${failed.slice(0, 3).join(', ')}${failed.length > 3 ? '…' : ''}`, { duration: 6000 })
    else toast.success(`Added ${items.length} skin${items.length > 1 ? 's' : ''}`)
    onClose()
  }

  const title = tab === 'heroes' && hero ? hero.name : 'Add skins'
  return (
    <Sheet title={title} subtitle={hero && tab === 'heroes' ? `${heroSkins.length} skins` : 'From the Ryuk skin library'} onClose={hero && tab === 'heroes' ? () => setHero(null) : onClose} back={!!(hero && tab === 'heroes')} full wide
      footer={
        <div className="row">
          <div className="grow small muted">{picked.size ? `${picked.size} selected` : 'Tap skins to select them'}{inCollage.size ? ` · ${inCollage.size} already in your collage` : ''}</div>
          {picked.size > 0 && <button className="btn btn-ghost btn-sm" onClick={() => setPicked(new Set())}>Clear</button>}
          <button className="btn btn-primary" disabled={!picked.size || !!adding} onClick={add}>
            {adding ? <><Spinner /> {adding.done}/{adding.total}</> : `Add ${picked.size || ''}`}
          </button>
        </div>
      }>
      {!(hero && tab === 'heroes') && (
        <div className="seg" style={{ marginBottom: 12 }}>
          {[['heroes', 'Heroes'], ['tiers', 'Tiers'], ['search', 'Search']].map(([k, l]) => (
            <button key={k} className={tab === k ? 'on' : ''} onClick={() => { setTab(k); setQ('') }}>{l}</button>
          ))}
        </div>
      )}
      {!ready && <div className="center-fill"><Spinner size={26} /></div>}

      {ready && tab === 'heroes' && !hero && (
        <>
          <div className="search" style={{ marginBottom: 12 }}><Search size={17} /><input className="field" placeholder="Find a hero" value={q} onChange={e => setQ(e.target.value)} /></div>
          <div className="col" style={{ gap: 2 }}>
            {heroes.map(h => {
              const picks = (h.skins || []).filter(sk => picked.has(skinId(h.id, sk.name))).length
              return (
                <button key={h.id} className="list-item" onClick={() => { setHero(h); setQ('') }}>
                  <span className="li-icon" style={{ fontWeight: 800, color: 'var(--pink)' }}>{h.name.slice(0, 1)}</span>
                  <span className="grow"><span className="h3">{h.name}</span><br /><span className="small muted">{(h.skins || []).length} skins</span></span>
                  {picks > 0 && <span className="badge pink">{picks}</span>}
                  <ChevronRight size={18} className="muted" />
                </button>
              )
            })}
          </div>
        </>
      )}

      {ready && tab === 'heroes' && hero && (
        <>
          <div className="row" style={{ marginBottom: 12 }}>
            <button className="chip" onClick={() => toggleAll(heroSkins)}>Select all</button>
          </div>
          <Grid list={heroSkins} picked={picked} toggle={toggle} />
        </>
      )}

      {ready && tab === 'tiers' && (
        <>
          <div className="tabs" style={{ marginBottom: 14 }}>
            {TIERS.map(t => <button key={t} className={`chip ${tier === t ? 'on' : ''}`} onClick={() => setTier(t)}>{TIER_STYLE[t].icon} {t}</button>)}
          </div>
          {!groups.length && <p className="muted small" style={{ textAlign: 'center', padding: 30 }}>No {tier} skins yet.</p>}
          {groups.map(([name, list]) => (
            <div key={name} style={{ marginBottom: 18 }}>
              <div className="row" style={{ marginBottom: 10 }}>
                <button className="row grow" style={{ gap: 8, textAlign: 'left' }} onClick={() => setClosed(c => ({ ...c, [name]: !c[name] }))}>
                  {closed[name] ? <ChevronRight size={16} /> : <ChevronDown size={16} />}
                  <span className="h3" style={{ color: name === 'Other' ? 'var(--text-2)' : TIER_STYLE[tier].color }}>{name === 'Other' ? 'Other skins' : `${name}`}</span>
                  <span className="badge">{list.length}</span>
                </button>
                <button className="chip" onClick={() => toggleAll(list)}>Select all</button>
              </div>
              {!closed[name] && <Grid list={list} picked={picked} toggle={toggle} />}
            </div>
          ))}
        </>
      )}

      {ready && tab === 'search' && (
        <>
          <div className="search" style={{ marginBottom: 14 }}><Search size={17} /><input className="field" autoFocus placeholder="Hero or skin name, e.g. gusion cosmic" value={q} onChange={e => setQ(e.target.value)} /></div>
          {q.trim() && !found.length && <p className="muted small" style={{ textAlign: 'center', padding: 30 }}>Nothing found.</p>}
          <Grid list={found} picked={picked} toggle={toggle} />
        </>
      )}
    </Sheet>
  )
}
