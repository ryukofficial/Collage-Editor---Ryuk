// Home: start a collage in one tap.
import { useEffect, useRef, useState } from 'react'
import { Menu, ScanSearch, Plus, Layers, Upload, Contact, FolderOpen, Scissors, Zap, Wallet, ChevronRight, Gem } from 'lucide-react'
import { useCollage } from './lib/store.js'
import { makeThumb } from './lib/projects.js'
import { loadThumb } from './lib/images.js'
import { useWallet, walletEnabled, AUTO_COLLAGE_PRICE } from './lib/wallet.js'

export default function Home({ open, onContinue, onMenu, onUpload, onBrand }) {
  const items = useCollage(s => s.items)
  const bg = useCollage(s => s.bg)
  const name = useCollage(s => s.name)
  const wallet = useWallet()
  const [thumb, setThumb] = useState(null)
  const file = useRef(null)

  useEffect(() => {
    if (!items.length) { setThumb(null); return }
    items.slice(0, 64).forEach(loadThumb)
    const t = setTimeout(() => makeThumb(items, bg).then(setThumb), 900)
    return () => clearTimeout(t)
  }, [items, bg])

  const tiles = [
    { icon: Plus, title: 'Pick skins', sub: 'By hero', color: '#ff3d77', on: () => open('picker', 'heroes') },
    { icon: Layers, title: 'By tier', sub: 'Legend, Grand, series…', color: '#c084fc', on: () => open('picker', 'tiers') },
    { icon: Upload, title: 'Upload', sub: 'Your own pictures', color: '#38bdf8', on: () => file.current.click() },
    { icon: Contact, title: 'Ryuk Profile', sub: 'Profile showcase edit', color: '#f5c842', on: () => open('profile') },
    { icon: Scissors, title: 'Cut skins', sub: 'From a screenshot', color: '#34d399', on: () => open('cut') },
    { icon: Zap, title: 'HD enhance', sub: 'Any picture ×2', color: '#f5a524', on: () => open('enhance') },
  ]

  return (
    <div className="app">
      <div className="topbar">
        <button className="icon-btn" onClick={onMenu} aria-label="Menu"><Menu size={20} /></button>
        <div className="brand grow" onClick={onBrand}>Ryuk <b>Creates</b></div>
        {walletEnabled && (
          <button className="wallet-pill" onClick={() => open('wallet')}>
            <Wallet size={16} color="#ff8fb0" />{wallet.user ? `₹${wallet.balance ?? '…'}` : 'Log in'}
          </button>
        )}
      </div>

      <div className="home">
        <div className="home-wrap">
          {items.length > 0 && (
            <button className="card row" onClick={onContinue} style={{ width: '100%', padding: 12, marginBottom: 14, textAlign: 'left' }}>
              <div style={{ width: 62, height: 62, borderRadius: 12, overflow: 'hidden', background: 'var(--surface-2)', flexShrink: 0 }}>{thumb && <img src={thumb} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}</div>
              <div className="grow"><div className="h3">Continue editing</div><div className="small muted">{name || 'My collage'} · {items.length} skins</div></div>
              <ChevronRight size={20} className="muted" />
            </button>
          )}

          <button className="hero-card" onClick={() => open('auto')}>
            <div className="tiles">{Array.from({ length: 16 }, (_, i) => <i key={i} />)}</div>
            <span className="badge pink" style={{ alignSelf: 'flex-start', marginBottom: 10, background: 'rgba(255,61,119,.22)' }}><ScanSearch size={12} style={{ marginRight: 5 }} /> AUTO COLLAGE{walletEnabled ? ` · ₹${AUTO_COLLAGE_PRICE}` : ''}</span>
            <div className="h1" style={{ maxWidth: 320 }}>Your whole collection,<br /><span className="grad-text">one tap.</span></div>
            <div className="small" style={{ color: 'var(--text-2)', marginTop: 8, maxWidth: 330 }}>Upload screenshots of your skins — every skin is found and placed for you.</div>
          </button>

          <div className="tile-grid">
            {tiles.map(t => (
              <button key={t.title} className="tile" onClick={t.on}>
                <span className="ti" style={{ background: `${t.color}22`, color: t.color }}><t.icon size={21} /></span>
                <span><span className="h3">{t.title}</span><br /><span className="small muted">{t.sub}</span></span>
              </button>
            ))}
          </div>

          <button className="list-item card" style={{ marginTop: 12 }} onClick={() => open('projects')}>
            <span className="li-icon"><FolderOpen size={19} /></span>
            <span className="grow"><span className="h3">Projects & history</span><br /><span className="small muted">Saved collages, recent versions, exports</span></span>
            <ChevronRight size={18} className="muted" />
          </button>

          <a className="list-item card" style={{ marginTop: 10, background: 'linear-gradient(135deg, rgba(56,189,248,.10), rgba(124,92,255,.10))' }} href="https://ryukofficial.in" target="_blank" rel="noopener noreferrer">
            <span className="li-icon" style={{ color: '#7dd3fc' }}><Gem size={19} /></span>
            <span className="grow"><span className="h3">Recharge Diamonds</span><br /><span className="small muted">ryukofficial.in</span></span>
            <ChevronRight size={18} className="muted" />
          </a>

          <p className="tiny muted" style={{ textAlign: 'center', marginTop: 22 }}>Unlimited skins · full quality export · works on weak internet</p>
        </div>
      </div>
      <input ref={file} type="file" accept="image/*" multiple hidden onChange={e => { onUpload([...e.target.files]); e.target.value = '' }} />
    </div>
  )
}
