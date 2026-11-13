// ➕ Add skins / 🏷 Change series — password-protected admin tools.
//
// Add skins: choose one or many pictures; each becomes a row (hero, skin name,
// tier, series). Series can be an existing one or a brand-new name. On save each
// picture is stored in the skin library, then all skins are added to skins.json
// in one go — the website rebuilds once and they appear about a minute later.
//
// Change series: find skins by hero or name and give them another series, a new
// series, or none.
import { useMemo, useRef, useState } from 'react'
import skinsData from '../../skins.json'
import { SERIES_NAMES, getSeries } from '../lib/skinSeries'

const TIERS = ['Legend', 'Grand', 'Exquisite', 'Deluxe', 'Exceptional', 'Common']
const ERRORS = {
  wrong_password: 'Wrong password.',
  skin_exists: 'That hero already has a skin with this name.',
  repos_full: 'The skin picture library is full. Create the next mlbb-assets repo and add it to src/utils/assetRepos.js.',
  not_configured: 'GITHUB_TOKEN is missing in Vercel, so changes can’t be saved.',
  bad_image: 'That picture could not be read. Try a JPG or PNG.',
  invalid_request: 'Check the names: letters, numbers and simple punctuation only.',
  too_large: 'The picture is too big.',
  busy: 'Someone else saved at the same moment. Tap save again.',
}
const errText = e => /fetch|network|load failed/i.test(e.message) ? 'Could not reach the server.' : e.message

async function api(body) {
  const r = await fetch('/api/admin-add-skin', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  const data = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(ERRORS[data.error] || 'Something went wrong. Try again.')
  return data
}

// shrink the picture on the phone first (max 1200 px), so the upload stays small
async function toJpegBase64(file) {
  const bmp = await createImageBitmap(file)
  const k = Math.min(1, 1200 / Math.max(bmp.width, bmp.height))
  const c = document.createElement('canvas')
  c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k)
  c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height)
  const blob = await new Promise(r => c.toBlob(r, 'image/jpeg', 0.93))
  const buf = new Uint8Array(await blob.arrayBuffer())
  let s = ''
  for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode(...buf.subarray(i, i + 0x8000))
  return btoa(s)
}

const heroIdOf = n => n.toLowerCase().replace(/[^a-z0-9]/g, '')

// ── series suggestions: similar names, not only exact matches ───────────────
const norm = s => s.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim()
const squash = s => norm(s).replace(/ /g, '')
function editDistance(a, b) {
  if (Math.abs(a.length - b.length) > 3) return 9
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i)
  for (let i = 1; i <= a.length; i++) {
    const cur = [i]
    for (let j = 1; j <= b.length; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1))
    prev = cur
  }
  return prev[b.length]
}
// higher = better; 0 = no match
function seriesScore(name, query) {
  const n = norm(name), q = norm(query)
  if (!q) return 1
  const nq = squash(name), qq = squash(query)
  if (n === q) return 100
  if (n.startsWith(q) || nq.startsWith(qq)) return 80
  const words = n.split(' ')
  if (words.some(w => w.startsWith(q))) return 70
  if (n.includes(q) || nq.includes(qq)) return 60
  const qw = q.split(' ')
  if (qw.every(x => words.some(w => w.startsWith(x)))) return 55                    // "sh cov" → Shadow Covenant
  if (qq.length >= 2 && words.map(w => w[0]).join('').startsWith(qq)) return 50       // "sc" → Shadow Covenant
  if (qq.length >= 3) {
    const best = Math.min(...words.map(w => editDistance(w.slice(0, Math.max(q.length, 3)), q)), editDistance(nq.slice(0, qq.length), qq))
    if (best <= (qq.length >= 5 ? 2 : 1)) return 40 - best                           // small typos: "covenent", "vesels"
  }
  return 0
}

// Text box with a list of matching series under it. Typing a name that isn't in
// the list makes a new series.
function SeriesInput({ value, onChange, onPick, placeholder, disabled, style }) {
  const [open, setOpen] = useState(false)
  const matches = useMemo(() => SERIES_NAMES
    .map(s => [s, seriesScore(s, value || '')]).filter(([, sc]) => sc > 0)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 8).map(([s]) => s), [value])
  const exact = SERIES_NAMES.some(s => s.toLowerCase() === (value || '').trim().toLowerCase())
  const pick = s => { (onPick || onChange)(s); setOpen(false) }
  return (
    <div style={{ position: 'relative', flex: 1, minWidth: 0 }}>
      <input value={value} disabled={disabled} placeholder={placeholder} style={style} autoComplete="off"
        onChange={e => { onChange(e.target.value); setOpen(true) }}
        onFocus={() => setOpen(true)} onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); pick(matches[0] && !exact && (value || '').trim() && seriesScore(matches[0], value) >= 80 ? matches[0] : (value || '').trim()) } }} />
      {open && !disabled && (matches.length > 0 || (value || '').trim()) && (
        <div style={{ position: 'absolute', left: 0, right: 0, top: '100%', marginTop: '4px', zIndex: 5, background: 'var(--surface-2)', border: '1px solid #3a3a3c', borderRadius: '10px', overflow: 'hidden', boxShadow: '0 8px 24px rgba(0,0,0,0.5)', maxHeight: '240px', overflowY: 'auto' }}>
          {matches.map(s => (
            <button key={s} type="button" onMouseDown={e => e.preventDefault()} onClick={() => pick(s)}
              style={{ display: 'block', width: '100%', textAlign: 'left', background: s === value ? 'var(--line-2)' : 'none', border: 'none', borderBottom: '1px solid var(--line-2)', color: '#fff', fontSize: '13px', padding: '9px 11px', cursor: 'pointer' }}>{s}</button>
          ))}
          {(value || '').trim() && !exact && (
            <button type="button" onMouseDown={e => e.preventDefault()} onClick={() => pick(value.trim())}
              style={{ display: 'block', width: '100%', textAlign: 'left', background: 'none', border: 'none', color: '#f5a524', fontSize: '13px', padding: '9px 11px', cursor: 'pointer' }}>
              ➕ New series: “{value.trim()}”
            </button>
          )}
        </div>
      )}
    </div>
  )
}
const field = { width: '100%', boxSizing: 'border-box', background: 'var(--surface-2)', border: '1px solid var(--line-2)', borderRadius: '10px', padding: '9px 11px', color: '#fff', fontSize: '14px', outline: 'none' }
const small = { ...field, padding: '7px 9px', fontSize: '13px' }
const label = { display: 'block', color: 'var(--text-2)', fontSize: '12px', fontWeight: 600, margin: '12px 0 6px' }
const btn = (on = true) => ({ width: '100%', background: on ? '#ff3d77' : '#5a2236', border: 'none', borderRadius: '10px', color: '#fff', fontSize: '15px', fontWeight: 700, padding: '12px', cursor: on ? 'pointer' : 'default' })

export default function AddSkinPanel({ onClose }) {
  const heroes = useMemo(() => [...skinsData].sort((a, b) => a.name.localeCompare(b.name)), [])
  const [tab, setTab] = useState('add')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 260, background: 'rgba(0,0,0,0.82)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}
      onClick={e => { if (e.target === e.currentTarget && !busy) onClose() }}>
      <div style={{ background: 'var(--surface)', borderRadius: '26px 26px 0 0', border: '1px solid var(--line-2)', borderBottom: 'none', width: '100%', maxWidth: '640px', height: '94vh', display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px 10px', borderBottom: '1px solid var(--line)' }}>
          <p style={{ margin: 0, fontSize: '15px', fontWeight: 700, color: '#fff' }}>🛠 Skin library</p>
          <button onClick={onClose} disabled={busy} style={{ background: 'none', border: 'none', color: 'var(--text-3)', fontSize: '20px', cursor: 'pointer' }}>✕</button>
        </div>

        <div style={{ padding: '10px 16px 0' }}>
          <input type="password" value={password} onChange={e => setPassword(e.target.value)} autoComplete="off" placeholder="Password" style={field} />
          <div style={{ display: 'flex', gap: '6px', marginTop: '10px' }}>
            {[['add', '➕ Add skins'], ['series', '🏷 Change series']].map(([k, t]) => (
              <button key={k} onClick={() => !busy && setTab(k)}
                style={{ flex: 1, padding: '9px', borderRadius: '10px', fontSize: '13px', fontWeight: 700, cursor: 'pointer',
                  background: tab === k ? '#ff3d77' : 'var(--surface-2)', color: '#fff', border: `1px solid ${tab === k ? '#ff3d77' : 'var(--line-2)'}` }}>{t}</button>
            ))}
          </div>
        </div>

        <datalist id="skin-lib-heroes">{heroes.map(h => <option key={h.id} value={h.name} />)}</datalist>

        <div style={{ overflowY: 'auto', flex: 1, padding: '4px 16px 24px' }}>
          {tab === 'add'
            ? <AddSkins heroes={heroes} password={password} busy={busy} setBusy={setBusy} />
            : <ChangeSeries heroes={heroes} password={password} busy={busy} setBusy={setBusy} />}
        </div>
      </div>
    </div>
  )
}

// ── Add skins (one or many) ─────────────────────────────────────────────────
let rowId = 0
function guessFromFile(name, heroes) {
  const base = name.replace(/\.[a-z0-9]+$/i, '').replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim()
  const lower = base.toLowerCase()
  const hero = [...heroes].sort((a, b) => b.name.length - a.name.length).find(h => lower.startsWith(h.name.toLowerCase() + ' '))
  return hero ? { hero: hero.name, skin: base.slice(hero.name.length).trim() } : { hero: '', skin: base }
}

function AddSkins({ heroes, password, busy, setBusy }) {
  const [rows, setRows] = useState([])        // { id, file, preview, hero, skin, tier, series, status, error }
  const [msg, setMsg] = useState(null)
  const [allSeries, setAllSeries] = useState('')
  const fileRef = useRef(null)

  const addFiles = files => {
    setMsg(null)
    const next = [...files].filter(f => f.type.startsWith('image/')).map(f => ({
      id: ++rowId, file: f, preview: URL.createObjectURL(f), ...guessFromFile(f.name, heroes), tier: '', series: '', status: '', error: '',
    }))
    setRows(r => [...r, ...next].slice(0, 50))
    if (fileRef.current) fileRef.current.value = ''
  }
  const upd = (id, patch) => setRows(r => r.map(x => x.id === id ? { ...x, ...patch } : x))
  const remove = id => setRows(r => r.filter(x => x.id !== id))
  const setAll = patch => setRows(r => r.map(x => ({ ...x, ...patch })))

  const problems = row => {
    if (!row.hero.trim() || !row.skin.trim()) return 'Enter the hero and skin name'
    const h = heroes.find(x => x.name.toLowerCase() === row.hero.trim().toLowerCase())
    if (h && h.skins.some(s => s.name.toLowerCase() === row.skin.trim().toLowerCase())) return `${h.name} already has this skin`
    const dup = rows.filter(x => x.hero.trim().toLowerCase() === row.hero.trim().toLowerCase() && x.skin.trim().toLowerCase() === row.skin.trim().toLowerCase())
    if (dup.length > 1) return 'Same skin twice in this list'
    return ''
  }

  const save = async () => {
    setMsg(null)
    if (!password) return setMsg({ ok: false, text: 'Enter the password at the top.' })
    if (!rows.length) return setMsg({ ok: false, text: 'Choose at least one picture.' })
    const bad = rows.find(r => problems(r))
    if (bad) return setMsg({ ok: false, text: `${bad.hero || 'A row'} ${bad.skin}: ${problems(bad)}.` })
    setBusy(true)
    try {
      // 1. pictures, one by one
      for (const r of rows) {
        if (r.status === 'uploaded') continue
        upd(r.id, { status: 'uploading', error: '' })
        try {
          await api({ action: 'image', password, heroName: r.hero.trim(), skinName: r.skin.trim(), image: await toJpegBase64(r.file) })
          upd(r.id, { status: 'uploaded' }); r.status = 'uploaded'
        } catch (e) {
          upd(r.id, { status: 'error', error: errText(e) })
          throw e
        }
      }
      // 2. all skins in one change
      const res = await api({ action: 'add', password, skins: rows.map(r => ({ heroName: r.hero.trim(), skinName: r.skin.trim(), tier: r.tier, series: r.series.trim() })) })
      setRows([])
      setMsg({ ok: true, text: `✅ Added ${res.added.length} skin${res.added.length === 1 ? '' : 's'}. The website updates in about a minute — then refresh the page.` })
    } catch (e) {
      setMsg({ ok: false, text: errText(e) })
    } finally { setBusy(false) }
  }

  return (
    <>
      <label style={label}>Skin pictures (pick one or many)</label>
      <input ref={fileRef} type="file" accept="image/*" multiple disabled={busy} onChange={e => addFiles(e.target.files || [])} style={{ ...field, padding: '8px' }} />
      <p style={{ color: 'var(--text-3)', fontSize: '11px', margin: '6px 0 0' }}>
        Tip: name the files like "Alice Divine Owl.jpg" and the hero and skin fill in by themselves. Up to 50 at once.
      </p>

      {rows.length > 1 && (
        <div style={{ display: 'flex', gap: '6px', marginTop: '12px', alignItems: 'center' }}>
          <span style={{ color: 'var(--text-2)', fontSize: '12px', flexShrink: 0 }}>Set all:</span>
          <select defaultValue="" onChange={e => { if (e.target.value !== '') setAll({ tier: e.target.value === '-' ? '' : e.target.value }); e.target.value = '' }} style={small} disabled={busy}>
            <option value="">Tier…</option><option value="-">— none —</option>
            {TIERS.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
          <SeriesInput value={allSeries} onChange={setAllSeries} placeholder="Series…" style={small} disabled={busy}
            onPick={s => { setAll({ series: s }); setAllSeries('') }} />
        </div>
      )}

      {rows.map(r => {
        const p = problems(r)
        const isNewHero = r.hero.trim() && !heroes.some(h => h.name.toLowerCase() === r.hero.trim().toLowerCase())
        const isNewSeries = r.series.trim() && !SERIES_NAMES.some(s => s.toLowerCase() === r.series.trim().toLowerCase())
        return (
          <div key={r.id} style={{ display: 'flex', gap: '10px', marginTop: '12px', padding: '10px', background: '#17171a', border: `1px solid ${r.status === 'error' ? '#ff6b6b' : r.status === 'uploaded' ? '#22c55e' : 'var(--line-2)'}`, borderRadius: '12px' }}>
            <img src={r.preview} alt="" style={{ width: '78px', height: '78px', objectFit: 'cover', borderRadius: '12px', flexShrink: 0 }} />
            <div style={{ flex: 1, minWidth: 0, display: 'grid', gap: '6px' }}>
              <input list="skin-lib-heroes" value={r.hero} onChange={e => upd(r.id, { hero: e.target.value })} placeholder="Hero" style={small} disabled={busy} />
              <input value={r.skin} onChange={e => upd(r.id, { skin: e.target.value })} placeholder="Skin name" style={small} disabled={busy} />
              <div style={{ display: 'flex', gap: '6px' }}>
                <select value={r.tier} onChange={e => upd(r.id, { tier: e.target.value })} style={small} disabled={busy}>
                  <option value="">Tier: none</option>
                  {TIERS.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
                <SeriesInput value={r.series} onChange={v => upd(r.id, { series: v })} placeholder="Series (or new)" style={small} disabled={busy} />
              </div>
              <p style={{ margin: 0, fontSize: '11px', color: r.error || p ? '#ff6b6b' : 'var(--text-3)' }}>
                {r.error || p || [isNewHero && 'New hero', isNewSeries && 'New series', r.status === 'uploading' && 'Uploading…', r.status === 'uploaded' && 'Picture saved ✓'].filter(Boolean).join(' · ')}
              </p>
            </div>
            {!busy && <button onClick={() => remove(r.id)} style={{ background: 'none', border: 'none', color: 'var(--text-3)', fontSize: '16px', cursor: 'pointer', alignSelf: 'flex-start' }}>✕</button>}
          </div>
        )
      })}

      {msg && <p style={{ margin: '14px 0 0', fontSize: '13px', color: msg.ok ? '#22c55e' : '#ff6b6b' }}>{msg.text}</p>}
      <button onClick={save} disabled={busy} style={{ ...btn(!busy), marginTop: '16px' }}>
        {busy ? 'Saving…' : rows.length > 1 ? `Add ${rows.length} skins` : 'Add skin'}
      </button>
      <p style={{ color: 'var(--text-3)', fontSize: '11px', margin: '10px 0 0' }}>
        Name each skin exactly as in the game, so Auto Collage can read it from screenshots.
      </p>
    </>
  )
}

// ── Change series ───────────────────────────────────────────────────────────
function ChangeSeries({ heroes, password, busy, setBusy }) {
  const [q, setQ] = useState('')
  const [edits, setEdits] = useState({})      // key → new series ('' = none)
  const [msg, setMsg] = useState(null)

  const all = useMemo(() => heroes.flatMap(h => h.skins.map(s => ({
    key: `${h.id}__${s.name}`, heroId: h.id, hero: h.name, skin: s.name, series: getSeries(h.id, s.name) || '',
  }))), [heroes])
  const shown = useMemo(() => {
    const t = q.trim().toLowerCase()
    if (!t) return []
    return all.filter(x => x.hero.toLowerCase().includes(t) || x.skin.toLowerCase().includes(t) || (x.series && seriesScore(x.series, t) >= 38)).slice(0, 80)
  }, [q, all])
  const changed = Object.entries(edits).filter(([k, v]) => (all.find(x => x.key === k)?.series || '') !== v.trim())

  const save = async () => {
    setMsg(null)
    if (!password) return setMsg({ ok: false, text: 'Enter the password at the top.' })
    if (!changed.length) return setMsg({ ok: false, text: 'Nothing changed yet.' })
    setBusy(true)
    try {
      const changes = changed.map(([k, v]) => { const x = all.find(y => y.key === k); return { heroId: x.heroId, skinName: x.skin, series: v.trim() } })
      const res = await api({ action: 'series', password, changes })
      setEdits({})
      setMsg({ ok: true, text: `✅ Changed ${res.changed} skin${res.changed === 1 ? '' : 's'}. The website updates in about a minute — then refresh the page.` })
    } catch (e) { setMsg({ ok: false, text: errText(e) }) } finally { setBusy(false) }
  }

  return (
    <>
      <label style={label}>Find skins (hero, skin or series name)</label>
      <input value={q} onChange={e => setQ(e.target.value)} placeholder="e.g. Alice, Divine Owl, Soul Vessels" style={field} />
      {q.trim() && !shown.length && <p style={{ color: 'var(--text-3)', fontSize: '12px' }}>No skins found.</p>}
      {shown.map(x => {
        const v = edits[x.key] ?? x.series
        const isNew = v.trim() && !SERIES_NAMES.some(s => s.toLowerCase() === v.trim().toLowerCase())
        const dirty = v.trim() !== x.series
        return (
          <div key={x.key} style={{ marginTop: '8px', padding: '9px 10px', background: '#17171a', border: `1px solid ${dirty ? '#ff3d77' : 'var(--line-2)'}`, borderRadius: '10px' }}>
            <p style={{ margin: '0 0 6px', color: '#fff', fontSize: '13px', fontWeight: 600 }}>{x.hero} · <span style={{ color: 'var(--text-2)', fontWeight: 400 }}>{x.skin}</span></p>
            <div style={{ display: 'flex', gap: '6px' }}>
              <SeriesInput value={v} disabled={busy} onChange={val => setEdits(s => ({ ...s, [x.key]: val }))} placeholder="No series" style={small} />
              {v && <button disabled={busy} onClick={() => setEdits(s => ({ ...s, [x.key]: '' }))} style={{ ...small, width: 'auto', cursor: 'pointer' }}>None</button>}
            </div>
            {(isNew || dirty) && <p style={{ margin: '4px 0 0', fontSize: '11px', color: '#f5a524' }}>{[isNew && 'New series', dirty && `was: ${x.series || 'none'}`].filter(Boolean).join(' · ')}</p>}
          </div>
        )
      })}

      {msg && <p style={{ margin: '14px 0 0', fontSize: '13px', color: msg.ok ? '#22c55e' : '#ff6b6b' }}>{msg.text}</p>}
      <button onClick={save} disabled={busy} style={{ ...btn(!busy), marginTop: '16px' }}>
        {busy ? 'Saving…' : `Save ${changed.length || ''} change${changed.length === 1 ? '' : 's'}`}
      </button>
      <p style={{ color: 'var(--text-3)', fontSize: '11px', margin: '10px 0 0' }}>
        Type a name nobody used before to make a new series. Skins of the same series stay together in Auto Collage.
      </p>
    </>
  )
}
