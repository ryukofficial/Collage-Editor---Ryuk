import { useState, useRef, useCallback } from 'react'
import skinsData from '../../skins.json'
import useStore from '../store/useStore'

// ── Constants ────────────────────────────────────────────────────────────────
const CDN_BASE   = 'https://raw.githubusercontent.com/ryukofficial/mlbb-assets/refs/heads/main/'
const GITHUB_API = 'https://api.github.com/repos/ryukofficial/mlbb-assets/contents/'
const PLACEHOLDER = 'https://placehold.co/200x300/1a1a2e/6c63ff?text=No+Image'

function slugify(str) {
  return str.toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim()
}

function matchScore(filename, heroId, skinName) {
  const f = slugify(filename.replace(/\.(jpg|jpeg|png|webp)$/i, ''))
  const heroMatch = f.includes(heroId.toLowerCase())
  if (!heroMatch) return 0
  const keywords = slugify(skinName).split(' ').filter(w => w.length >= 3)
  if (keywords.length === 0) return 1
  const matched = keywords.filter(kw => f.includes(kw))
  return matched.length / keywords.length
}

// Build a flat lookup: "heroname skinname" -> { heroId, heroName, skinName }
const SKIN_LOOKUP = {}
for (const hero of skinsData) {
  for (const skin of hero.skins) {
    const key = `${slugify(hero.name)} ${slugify(skin.name)}`
    SKIN_LOOKUP[key] = { heroId: hero.id, heroName: hero.name, skinName: skin.name }
  }
}

function findSkin(heroText, skinText) {
  const hSlug = slugify(heroText || '')
  const sSlug = slugify(skinText || '')
  const fullKey = `${hSlug} ${sSlug}`

  if (SKIN_LOOKUP[fullKey]) return SKIN_LOOKUP[fullKey]

  const hero = skinsData.find(h =>
    slugify(h.name) === hSlug ||
    slugify(h.name).includes(hSlug) ||
    hSlug.includes(slugify(h.name))
  )
  if (!hero) return null

  let best = null, bestScore = 0
  for (const skin of hero.skins) {
    const sWords = slugify(skin.name).split(' ').filter(w => w.length >= 3)
    const qWords = sSlug.split(' ').filter(w => w.length >= 3)
    if (sWords.length === 0) continue
    const matched = qWords.filter(w => sWords.some(sw => sw.includes(w) || w.includes(sw)))
    const score = matched.length / Math.max(sWords.length, 1)
    if (score > bestScore) { bestScore = score; best = skin }
  }
  if (best && bestScore > 0.3) {
    return { heroId: hero.id, heroName: hero.name, skinName: best.name }
  }
  return null
}

async function fetchSkinImage(heroId, heroName, skinName) {
  const candidates = [
    `${heroName} ${skinName}.jpg`,
    `${heroName} ${skinName}.png`,
    `${heroName} ${skinName}.webp`,
    `${heroName.toLowerCase()} ${skinName.toLowerCase()}.jpg`,
    `${heroName} ${skinName.split(' ')[0]}.jpg`,
  ]

  for (const candidate of candidates) {
    const url = CDN_BASE + encodeURIComponent(candidate)
    const ok = await new Promise(resolve => {
      const img = new Image()
      img.crossOrigin = 'anonymous'
      img.onload  = () => resolve(true)
      img.onerror = () => resolve(false)
      img.src = url
    })
    if (ok) return url
  }

  try {
    const res = await fetch(GITHUB_API, {
      headers: { 'Accept': 'application/vnd.github.v3+json' }
    })
    if (!res.ok) return null
    const files = await res.json()
    if (!Array.isArray(files)) return null
    const imageFiles = files
      .filter(f => /\.(jpg|jpeg|png|webp)$/i.test(f.name))
      .map(f => f.name)

    let bestFile = null, bestScore = 0.3
    for (const file of imageFiles) {
      const score = matchScore(file, heroId, skinName)
      if (score > bestScore) { bestScore = score; bestFile = file }
    }
    if (!bestFile) return null
    return CDN_BASE + encodeURIComponent(bestFile)
  } catch {
    return null
  }
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

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const url = URL.createObjectURL(file)
    img.onload = () => {
      const MAX = 1024
      let { naturalWidth: w, naturalHeight: h } = img
      if (w > MAX || h > MAX) {
        if (w > h) { h = Math.round(h * MAX / w); w = MAX }
        else        { w = Math.round(w * MAX / h); h = MAX }
      }
      const canvas = document.createElement('canvas')
      canvas.width  = w
      canvas.height = h
      canvas.getContext('2d').drawImage(img, 0, 0, w, h)
      URL.revokeObjectURL(url)
      const dataUrl = canvas.toDataURL('image/jpeg', 0.85)
      resolve(dataUrl.split(',')[1])
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      const r = new FileReader()
      r.onload = () => resolve(r.result.split(',')[1])
      r.onerror = reject
      r.readAsDataURL(file)
    }
    img.src = url
  })
}

// ── Main Component ────────────────────────────────────────────────────────────
export default function AutoCollage({ onClose }) {
  const addImages    = useStore(s => s.addImages)
  const saveSnapshot = useStore(s => s.saveSnapshot)

  const [step, setStep]               = useState('upload')
  const [screenshots, setScreenshots] = useState([])
  const [found, setFound]             = useState([])
  const [failed, setFailed]           = useState([])
  const [progress, setProgress]       = useState('')
  const [error, setError]             = useState('')
  const fileRef = useRef()

  const handleFiles = useCallback((files) => {
    const imgs = Array.from(files).filter(f => f.type.startsWith('image/'))
    if (!imgs.length) return
    setScreenshots(imgs)
    setStep('ready')
    setError('')
  }, [])

  const handleScan = useCallback(async () => {
    if (!screenshots.length) return
    setStep('scanning')
    setFound([])
    setFailed([])
    setError('')

    try {
      const imageContents = await Promise.all(screenshots.map(async (file) => {
        const b64 = await fileToBase64(file)
        return { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: b64 } }
      }))

      setProgress('Reading skin names from screenshots…')

      const response = await fetch('/api/scan-skins', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'claude-sonnet-4-5',
          max_tokens: 1000,
          messages: [{
            role: 'user',
            content: [
              ...imageContents,
              {
                type: 'text',
                text: `These are screenshots from the Mobile Legends: Bang Bang skin selection screen.
For each skin visible, extract the hero name and skin name exactly as shown in the UI.
Return ONLY a JSON array, no explanation, no markdown, like this:
[{"hero":"Fanny","skin":"Galactic Starhawk"},{"hero":"Alucard","skin":"Child of the Fall"}]
Include every skin you can read. If a skin name spans two lines, join them with a space.`,
              }
            ]
          }]
        })
      })

      const data = await response.json()
      if (!response.ok) throw new Error(`API ${response.status}: ${JSON.stringify(data?.error || data)}`)

      const rawText = data.content.map(c => c.text || '').join('')
      let parsed = []
      try {
        const clean = rawText.replace(/```json|```/g, '').trim()
        parsed = JSON.parse(clean)
      } catch {
        throw new Error('Could not parse skin list from AI response')
      }

      setProgress(`Found ${parsed.length} skins in screenshots. Matching to database…`)

      const matchedSkins = []
      const failedSkins  = []

      for (const { hero, skin } of parsed) {
        const match = findSkin(hero, skin)
        if (match) {
          matchedSkins.push({ ...match, heroText: hero, skinText: skin })
        } else {
          failedSkins.push(`${hero} — ${skin}`)
        }
      }

      const seen = new Set()
      const unique = matchedSkins.filter(m => {
        const key = `${m.heroId}__${m.skinName}`
        if (seen.has(key)) return false
        seen.add(key)
        return true
      })

      setFound(unique)
      setFailed(failedSkins)
      setStep('results')
      setProgress('')

    } catch (err) {
      setError(err.message || 'Something went wrong')
      setStep('ready')
    }
  }, [screenshots])

  const handleAddToCanvas = useCallback(async () => {
    if (!found.length) return
    setStep('adding')
    setProgress(`Fetching ${found.length} skin images…`)

    const results = []
    for (let i = 0; i < found.length; i++) {
      const { heroId, heroName, skinName } = found[i]
      setProgress(`Fetching ${i + 1} / ${found.length}: ${heroName} — ${skinName}`)
      const url = await fetchSkinImage(heroId, heroName, skinName)
      if (!url) continue
      const loaded = await loadImg(url)
      if (!loaded) continue
      results.push({
        src: url,
        name: `${heroName} — ${skinName}`,
        naturalWidth: loaded.naturalWidth,
        naturalHeight: loaded.naturalHeight,
        fileSize: 0,
      })
    }

    if (!results.length) {
      setError('Could not load any skin images. Check your internet connection.')
      setStep('results')
      return
    }

    saveSnapshot()
    addImages(results)
    onClose()
  }, [found, addImages, saveSnapshot, onClose])

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 300,
        background: 'rgba(0,0,0,0.85)',
        display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
      }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div style={{
        background: '#13131f', borderRadius: '20px 20px 0 0',
        border: '1px solid #252535', borderBottom: 'none',
        width: '100%', maxWidth: '520px',
        maxHeight: '88vh', display: 'flex', flexDirection: 'column',
        boxShadow: '0 -8px 40px rgba(0,0,0,0.8)',
      }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 18px 12px', borderBottom: '1px solid #1e1e2e', flexShrink: 0 }}>
          <div>
            <p style={{ margin: 0, fontSize: '15px', fontWeight: 700, color: '#c8c8e8' }}>✨ Auto Collage</p>
            <p style={{ margin: '2px 0 0', fontSize: '11px', color: '#555' }}>
              Upload MLBB screenshots → AI reads skin names → builds collage
            </p>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#666', fontSize: '20px', cursor: 'pointer', lineHeight: 1, padding: '2px 6px' }}>✕</button>
        </div>

        {/* Body */}
        <div style={{ overflowY: 'auto', flex: 1, padding: '16px 16px 28px' }}>

          {/* Upload area */}
          {(step === 'upload' || step === 'ready') && (
            <>
              <div
                onClick={() => fileRef.current?.click()}
                style={{
                  border: '2px dashed #252535', borderRadius: '14px',
                  padding: '32px 20px', textAlign: 'center', cursor: 'pointer',
                  background: screenshots.length ? 'rgba(108,99,255,0.06)' : 'transparent',
                  transition: 'all 0.15s',
                }}
                onMouseEnter={e => e.currentTarget.style.borderColor = '#6c63ff'}
                onMouseLeave={e => e.currentTarget.style.borderColor = '#252535'}
              >
                <div style={{ fontSize: '36px', marginBottom: '10px' }}>📸</div>
                <p style={{ margin: '0 0 4px', color: '#c8c8e8', fontWeight: 700, fontSize: '15px' }}>
                  {screenshots.length ? `${screenshots.length} screenshot${screenshots.length > 1 ? 's' : ''} selected` : 'Tap to upload screenshots'}
                </p>
                <p style={{ margin: 0, color: '#555', fontSize: '12px' }}>
                  MLBB skin showcase / collection / inventory screens
                </p>
                <input
                  ref={fileRef} type="file" multiple accept="image/*"
                  style={{ display: 'none' }}
                  onChange={e => { if (e.target.files?.length) handleFiles(e.target.files) }}
                />
              </div>

              {screenshots.length > 0 && (
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '12px' }}>
                  {screenshots.map((f, i) => (
                    <div key={i} style={{ position: 'relative', width: '72px', height: '72px', borderRadius: '8px', overflow: 'hidden', border: '1px solid #252535' }}>
                      <img src={URL.createObjectURL(f)} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    </div>
                  ))}
                </div>
              )}

              {error && (
                <div style={{ marginTop: '12px', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: '10px', padding: '10px 14px' }}>
                  <p style={{ margin: 0, color: '#f87171', fontSize: '13px' }}>⚠️ {error}</p>
                </div>
              )}

              {step === 'ready' && (
                <button
                  onClick={handleScan}
                  style={{
                    marginTop: '16px', width: '100%',
                    background: 'linear-gradient(135deg,#6c63ff,#a855f7)',
                    border: 'none', borderRadius: '12px',
                    color: '#fff', fontSize: '15px', fontWeight: 700,
                    padding: '14px', cursor: 'pointer',
                  }}
                >
                  🔍 Scan Screenshots
                </button>
              )}
            </>
          )}

          {/* Scanning */}
          {step === 'scanning' && (
            <div style={{ textAlign: 'center', padding: '40px 20px' }}>
              <div style={{ fontSize: '40px', marginBottom: '16px' }}>🤖</div>
              <p style={{ margin: '0 0 8px', color: '#c8c8e8', fontWeight: 700, fontSize: '16px' }}>Reading skin names…</p>
              <p style={{ margin: 0, color: '#6c63ff', fontSize: '13px' }}>{progress}</p>
            </div>
          )}

          {/* Results */}
          {step === 'results' && (
            <>
              <div style={{ display: 'flex', gap: '8px', marginBottom: '14px' }}>
                <div style={{ flex: 1, background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.3)', borderRadius: '10px', padding: '10px', textAlign: 'center' }}>
                  <p style={{ margin: 0, fontSize: '22px', fontWeight: 800, color: '#22c55e' }}>{found.length}</p>
                  <p style={{ margin: 0, fontSize: '11px', color: '#555' }}>Matched</p>
                </div>
                <div style={{ flex: 1, background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)', borderRadius: '10px', padding: '10px', textAlign: 'center' }}>
                  <p style={{ margin: 0, fontSize: '22px', fontWeight: 800, color: '#f87171' }}>{failed.length}</p>
                  <p style={{ margin: 0, fontSize: '11px', color: '#555' }}>Not found</p>
                </div>
              </div>

              {found.length > 0 && (
                <>
                  <p style={{ margin: '0 0 8px', fontSize: '12px', fontWeight: 700, color: '#22c55e' }}>✅ MATCHED SKINS</p>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(72px, 1fr))', gap: '7px', marginBottom: '16px' }}>
                    {found.map((m, i) => (
                      <div key={i} style={{ borderRadius: '8px', overflow: 'hidden', border: '1px solid #252535', background: '#0e0e1a' }}>
                        <div style={{ width: '100%', paddingBottom: '100%', position: 'relative', background: '#1a1a2e' }}>
                          <img
                            src={PLACEHOLDER}
                            alt=""
                            onError={e => { e.target.src = PLACEHOLDER }}
                            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
                          />
                        </div>
                        <div style={{ padding: '4px 5px' }}>
                          <p style={{ margin: 0, fontSize: '9px', color: '#6c63ff', fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.heroName}</p>
                          <p style={{ margin: 0, fontSize: '8px', color: '#666', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.skinName}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}

              {failed.length > 0 && (
                <>
                  <p style={{ margin: '0 0 6px', fontSize: '12px', fontWeight: 700, color: '#f87171' }}>❌ COULDN'T MATCH</p>
                  <div style={{ background: '#0e0e1a', border: '1px solid #1e1e2e', borderRadius: '10px', padding: '10px 12px', marginBottom: '16px' }}>
                    {failed.map((f, i) => (
                      <p key={i} style={{ margin: i ? '4px 0 0' : 0, fontSize: '12px', color: '#555' }}>• {f}</p>
                    ))}
                  </div>
                </>
              )}

              {error && (
                <div style={{ marginBottom: '12px', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: '10px', padding: '10px 14px' }}>
                  <p style={{ margin: 0, color: '#f87171', fontSize: '13px' }}>⚠️ {error}</p>
                </div>
              )}

              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  onClick={() => { setStep('upload'); setScreenshots([]); setFound([]); setFailed([]) }}
                  style={{ flex: 1, background: 'none', border: '1px solid #252535', borderRadius: '10px', color: '#888', fontSize: '13px', fontWeight: 600, padding: '12px', cursor: 'pointer' }}
                >
                  ↩ Try Again
                </button>
                {found.length > 0 && (
                  <button
                    onClick={handleAddToCanvas}
                    style={{ flex: 2, background: 'linear-gradient(135deg,#22c55e,#16a34a)', border: 'none', borderRadius: '10px', color: '#fff', fontSize: '14px', fontWeight: 700, padding: '12px', cursor: 'pointer' }}
                  >
                    Add {found.length} Skins to Canvas →
                  </button>
                )}
              </div>
            </>
          )}

          {/* Adding to canvas */}
          {step === 'adding' && (
            <div style={{ textAlign: 'center', padding: '40px 20px' }}>
              <div style={{ fontSize: '40px', marginBottom: '16px' }}>⬇️</div>
              <p style={{ margin: '0 0 8px', color: '#c8c8e8', fontWeight: 700, fontSize: '16px' }}>Adding skins to canvas…</p>
              <p style={{ margin: 0, color: '#6c63ff', fontSize: '13px' }}>{progress}</p>
            </div>
          )}

        </div>
      </div>
    </div>
  )
}
