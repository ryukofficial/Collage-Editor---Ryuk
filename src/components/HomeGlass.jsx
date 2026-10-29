// Home screen (shown while the canvas is empty) — bento tiles, black background.
// Covers the editor; the editing toolbar only appears once skins are added.
import { Menu, Wallet, User } from 'lucide-react'

const PREVIEW = [
  ['#ffcf8a', '#c2410c'], ['#c9a7ff', '#5b21b6'], ['#8be9ff', '#0e7490'], ['#ff9aa8', '#be123c'],
  ['#c9a7ff', '#5b21b6'], ['#ffcf8a', '#c2410c'], ['#ff9aa8', '#be123c'], ['#8be9ff', '#0e7490'],
  ['#bbf7d0', '#15803d'], ['#ffcf8a', '#c2410c'], ['#c9a7ff', '#5b21b6'], ['#8be9ff', '#0e7490'],
]

const pill = {
  display: 'flex', alignItems: 'center', gap: '6px', height: '36px', padding: '0 13px',
  borderRadius: '999px', background: '#1c1c1e', border: 'none', color: '#fff',
  fontSize: '13px', fontWeight: 700, cursor: 'pointer',
}

function Tile({ emoji, title, sub, bg, onClick, children, big, cta }) {
  return (
    <button onClick={onClick} style={{
      gridColumn: big ? '1 / 3' : undefined,
      minHeight: big ? '180px' : '120px',
      position: 'relative', overflow: 'hidden', textAlign: 'left', cursor: 'pointer',
      borderRadius: '22px', border: 'none', padding: '16px', color: '#fff', background: bg,
      display: 'flex', flexDirection: 'column', justifyContent: 'flex-end',
    }}>
      {children}
      <span style={{ position: 'absolute', top: '14px', left: '16px', fontSize: big ? '28px' : '26px' }}>{emoji}</span>
      <span style={{ position: 'relative', fontSize: big ? '22px' : '17px', fontWeight: 800 }}>{title}</span>
      <span style={{ position: 'relative', fontSize: '12.5px', opacity: 0.85, marginTop: '3px' }}>{sub}</span>
      {cta && (
        <span style={{ position: 'absolute', right: '16px', bottom: '16px', background: '#fff', color: '#000', fontWeight: 800, fontSize: '13px', padding: '9px 14px', borderRadius: '999px' }}>{cta}</span>
      )}
    </button>
  )
}

export default function HomeGlass({ onAuto, onRyukProfile, onPick, onTier, onUpload, onProjects, onWallet, onMenu, onLogo, user, balance, price }) {
  return (
    <div style={{ position: 'fixed', inset: '0 0 36px 0', zIndex: 45, background: '#000', color: '#fff', overflowY: 'auto' }}>
      <div style={{ maxWidth: '520px', margin: '0 auto', padding: '0 16px 24px' }}>

        {/* Top bar: menu, name, wallet + account */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '14px 0' }}>
          <button onClick={onMenu} aria-label="Menu" style={{ ...pill, width: '36px', padding: 0, justifyContent: 'center' }}><Menu size={17} /></button>
          <span onClick={onLogo} style={{ fontSize: '20px', fontWeight: 800, userSelect: 'none', cursor: 'default' }}>
            Ryuk<span style={{ color: '#ff3d77' }}>.</span>
          </span>
          <span style={{ flex: 1 }} />
          {onWallet && (user ? (
            <>
              <button onClick={onWallet} style={pill}><Wallet size={15} /> ₹{balance ?? '…'}</button>
              <button onClick={onWallet} aria-label="Account" style={{ ...pill, width: '36px', padding: 0, justifyContent: 'center' }}><User size={17} /></button>
            </>
          ) : (
            <button onClick={onWallet} style={{ ...pill, background: '#fff', color: '#000' }}><User size={15} /> Log in</button>
          ))}
        </div>

        <h1 style={{ margin: '6px 0 14px', fontSize: '28px', fontWeight: 800 }}>Create</h1>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
          <Tile big emoji="✨" title="Auto Collage" sub="Screenshots → collage" onClick={onAuto}
            cta={price ? `Try ₹${price}` : 'Try it'}
            bg="linear-gradient(135deg, #ff3d77, #7b2ff7 60%, #00c2ff)">
            {/* tilted collage preview */}
            <span style={{
              position: 'absolute', right: '-22px', top: '18px', width: '190px',
              display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '2px',
              borderRadius: '12px', overflow: 'hidden', transform: 'rotate(8deg)',
              boxShadow: '0 10px 30px rgba(0,0,0,0.4)',
            }}>
              {PREVIEW.map(([a, b], i) => <i key={i} style={{ height: '36px', background: `linear-gradient(160deg, ${a}, ${b})` }} />)}
            </span>
          </Tile>
          <Tile emoji="🦸" title="Pick skins" sub="By hero" onClick={onPick} bg="linear-gradient(135deg, #ffb800, #ff6a00)" />
          <Tile emoji="🖼️" title="Upload" sub="Your images" onClick={onUpload} bg="linear-gradient(135deg, #00d68f, #00838f)" />
          <Tile emoji="💎" title="By tier" sub="Legend, Collector…" onClick={onTier} bg="#1c1c1e" />
          <Tile emoji="📁" title="My projects" sub="Saved collages" onClick={onProjects} bg="#1c1c1e" />
          {onRyukProfile && (
            <Tile big emoji="🪪" title="Ryuk Profile" sub="Profile screenshot → showcase edit" onClick={onRyukProfile}
              cta="Try it" bg="linear-gradient(135deg, #1c1c1e, #3a2a00 70%, #ffd628)" />
          )}
        </div>

        <p style={{ margin: '22px 0 0', textAlign: 'center', fontSize: '11px', color: '#636366' }}>Fan-made tool · Not affiliated with Moonton</p>
      </div>
    </div>
  )
}
