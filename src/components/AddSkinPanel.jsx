// ➕ Add new skin — password-protected form.
// Picks a hero (or types a new one), skin name, tier, optional series and the
// skin picture. The server checks the password, stores the picture in the skin
// library and adds the skin to skins.json; the website then rebuilds itself and
// the skin appears in about a minute.
import { useMemo, useRef, useState } from 'react'
import skinsData from '../../skins.json'
import { SERIES_NAMES } from '../utils/skinSeries'

const TIERS = ['Legend', 'Grand', 'Exquisite', 'Deluxe', 'Exceptional', 'Common']
const ERRORS = {
  wrong_password: 'Wrong password.',
  skin_exists: 'This hero already has a skin with that name.',
  file_exists: 'A picture with this name is already in the library.',
  repos_full: 'The skin picture library is full. Create the next mlbb-assets repo and add it to src/utils/assetRepos.js.',
  not_configured: 'GITHUB_TOKEN is missing in Vercel, so skins can’t be saved.',
  bad_image: 'That picture could not be read. Try a JPG or PNG.',
  invalid_request: 'Check the names: letters, numbers and simple punctuation only.',
  too_large: 'The picture is too big.',
}

// shrink the picture on the phone first (max 1200 px), so the upload stays small
async function toJpegBase64(file) {
  const bmp = await createImageBitmap(file)
  const k = Math.min(1, 1200 / Math.max(bmp.width, bmp.height))
  const c = document.createElement('canvas')
  c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k)
  c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height)
  const blob = await new Promise(r => c.toBlob(r, 'image/jpeg', 0.95))
  const buf = new Uint8Array(await blob.arrayBuffer())
  let s = ''
  for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode(...buf.subarray(i, i + 0x8000))
  return btoa(s)
}

const field = { width: '100%', boxSizing: 'border-box', background: '#1c1c1e', border: '1px solid #2c2c2e', borderRadius: '10px', padding: '10px 12px', color: '#fff', fontSize: '14px', outline: 'none' }
const label = { display: 'block', color: '#c7c7cc', fontSize: '12px', fontWeight: 600, margin: '12px 0 6px' }

export default function AddSkinPanel({ onClose }) {
  const heroes = useMemo(() => [...skinsData].sort((a, b) => a.name.localeCompare(b.name)), [])
  const [password, setPassword] = useState('')
  const [hero, setHero] = useState('')
  const [skin, setSkin] = useState('')
  const [tier, setTier] = useState('')
  const [series, setSeries] = useState('')
  const [file, setFile] = useState(null)
  const [preview, setPreview] = useState(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null)        // { ok, text }
  const fileRef = useRef(null)

  const knownHero = heroes.find(h => h.name.toLowerCase() === hero.trim().toLowerCase())
  const pick = f => {
    if (!f) return
    setFile(f); setMsg(null)
    if (preview) URL.revokeObjectURL(preview)
    setPreview(URL.createObjectURL(f))
  }

  const save = async () => {
    setMsg(null)
    if (!password) return setMsg({ ok: false, text: 'Enter the password.' })
    if (!hero.trim() || !skin.trim()) return setMsg({ ok: false, text: 'Enter the hero and the skin name.' })
    if (!file) return setMsg({ ok: false, text: 'Choose the skin picture.' })
    setBusy(true)
    try {
      const image = await toJpegBase64(file)
      const r = await fetch('/api/admin-add-skin', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password, heroName: hero.trim(), skinName: skin.trim(), tier, series, image }),
      })
      const data = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(ERRORS[data.error] || 'Could not save the skin. Try again.')
      setMsg({ ok: true, text: `✅ ${data.hero} – ${data.skin} added. The website updates in about a minute — then refresh the page.` })
      setSkin(''); setFile(null); setPreview(null); setSeries('')
      if (fileRef.current) fileRef.current.value = ''
    } catch (e) {
      setMsg({ ok: false, text: /fetch|network|load failed/i.test(e.message) ? 'Could not reach the server.' : e.message })
    } finally { setBusy(false) }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 260, background: 'rgba(0,0,0,0.82)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}
      onClick={e => { if (e.target === e.currentTarget && !busy) onClose() }}>
      <div style={{ background: '#111113', borderRadius: '16px 16px 0 0', border: '1px solid #2c2c2e', borderBottom: 'none', width: '100%', maxWidth: '520px', maxHeight: '94vh', display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px 10px', borderBottom: '1px solid #232326' }}>
          <div>
            <p style={{ margin: 0, fontSize: '15px', fontWeight: 700, color: '#fff' }}>➕ Add new skin</p>
            <p style={{ margin: '2px 0 0', fontSize: '11px', color: '#8e8e93' }}>Adds it to the picker, Auto Collage and the scanner</p>
          </div>
          <button onClick={onClose} disabled={busy} style={{ background: 'none', border: 'none', color: '#8e8e93', fontSize: '20px', cursor: 'pointer' }}>✕</button>
        </div>

        <div style={{ overflowY: 'auto', padding: '4px 16px 24px' }}>
          <label style={label}>Password</label>
          <input type="password" value={password} onChange={e => setPassword(e.target.value)} autoComplete="off" style={field} />

          <label style={label}>Hero</label>
          <input list="add-skin-heroes" value={hero} onChange={e => setHero(e.target.value)} placeholder="Pick or type a hero" style={field} />
          <datalist id="add-skin-heroes">{heroes.map(h => <option key={h.id} value={h.name} />)}</datalist>
          {hero.trim() && !knownHero && <p style={{ color: '#f5a524', fontSize: '11px', margin: '4px 0 0' }}>New hero — it will be added too.</p>}

          <label style={label}>Skin name</label>
          <input value={skin} onChange={e => setSkin(e.target.value)} placeholder="e.g. Divine Owl" style={field} />
          {knownHero && skin.trim() && knownHero.skins.some(s => s.name.toLowerCase() === skin.trim().toLowerCase()) &&
            <p style={{ color: '#ff6b6b', fontSize: '11px', margin: '4px 0 0' }}>{knownHero.name} already has this skin.</p>}

          <label style={label}>Tier</label>
          <select value={tier} onChange={e => setTier(e.target.value)} style={field}>
            <option value="">— none —</option>
            {TIERS.map(t => <option key={t} value={t}>{t}</option>)}
          </select>

          <label style={label}>Series (optional)</label>
          <select value={series} onChange={e => setSeries(e.target.value)} style={field}>
            <option value="">— none —</option>
            {SERIES_NAMES.map(s => <option key={s} value={s}>{s}</option>)}
          </select>

          <label style={label}>Skin picture</label>
          <input ref={fileRef} type="file" accept="image/*" onChange={e => pick(e.target.files?.[0])} style={{ ...field, padding: '8px' }} />
          {preview && <img src={preview} alt="" style={{ marginTop: '10px', width: '140px', height: '140px', objectFit: 'cover', borderRadius: '10px', border: '1px solid #2c2c2e' }} />}

          {msg && <p style={{ margin: '14px 0 0', fontSize: '13px', color: msg.ok ? '#22c55e' : '#ff6b6b' }}>{msg.text}</p>}

          <button onClick={save} disabled={busy}
            style={{ marginTop: '16px', width: '100%', background: busy ? '#5a2236' : '#ff3d77', border: 'none', borderRadius: '10px', color: '#fff', fontSize: '15px', fontWeight: 700, padding: '12px', cursor: busy ? 'default' : 'pointer' }}>
            {busy ? 'Saving…' : 'Add skin'}
          </button>
          <p style={{ color: '#8e8e93', fontSize: '11px', margin: '10px 0 0' }}>
            Name the skin exactly as in the game, so Auto Collage can read it from screenshots.
          </p>
        </div>
      </div>
    </div>
  )
}
