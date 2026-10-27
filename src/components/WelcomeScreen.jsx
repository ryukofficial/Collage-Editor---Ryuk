import { useEffect, useState } from 'react'

const STORAGE_KEY = 'ryuk_welcomed_v1'

const features = [
  { icon: '∞',  label: 'Unlimited Collage',    desc: 'Add as many skins as you want — no cap' },
  { icon: '💎', label: 'Full Quality Export',   desc: 'PNG export at native resolution, zero compression' },
  { icon: '🦸', label: 'Hero & Tier Picker',    desc: 'Browse every MLBB skin by hero or tier' },
  { icon: '⚡', label: 'Instant Canvas',        desc: 'Drag, drop, arrange — smooth & fast' },
]

export default function WelcomeScreen({ onDismiss }) {
  const handleDismiss = () => {
    try { localStorage.setItem(STORAGE_KEY, '1') } catch { /* private mode: just close */ }
    onDismiss()
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: '16px', background: '#000000',
    }}>
      <div style={{
        width: '100%', maxWidth: '400px',
        background: '#111113', border: '1px solid #2c2c2e', borderRadius: '16px',
        padding: '28px 22px 22px',
      }}>
        {/* Name */}
        <div style={{ textAlign: 'center', marginBottom: '20px' }}>
          <h1 style={{ fontSize: '26px', fontWeight: 700, color: '#ffffff', margin: 0, letterSpacing: '-0.01em' }}>
            Ryuk Creates
          </h1>
          <p style={{ color: '#8e8e93', fontSize: '12px', fontWeight: 600, letterSpacing: '0.12em', textTransform: 'uppercase', margin: '6px 0 0' }}>
            MLBB Collage Studio
          </p>
        </div>

        <p style={{ color: '#c7c7cc', fontSize: '14px', textAlign: 'center', margin: '0 0 20px', lineHeight: 1.6 }}>
          Build MLBB skin collages in seconds.<br />
          Everything is free. Everything is unlimited.
        </p>

        {/* Feature list */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '22px' }}>
          {features.map((f, i) => (
            <div key={i} style={{
              display: 'flex', alignItems: 'center', gap: '12px',
              background: '#1c1c1e', border: '1px solid #232326', borderRadius: '10px', padding: '10px 12px',
            }}>
              <span style={{ fontSize: '18px', width: '24px', textAlign: 'center', flexShrink: 0, lineHeight: 1, color: '#ff6b96' }}>
                {f.icon}
              </span>
              <div>
                <p style={{ color: '#ffffff', fontSize: '13px', fontWeight: 600, margin: '0 0 2px' }}>{f.label}</p>
                <p style={{ color: '#aeaeb2', fontSize: '11px', margin: 0, lineHeight: 1.4 }}>{f.desc}</p>
              </div>
            </div>
          ))}
        </div>

        <button
          onClick={handleDismiss}
          style={{
            width: '100%', height: '44px', borderRadius: '10px',
            background: '#ff3d77', border: 'none', color: '#fff',
            fontWeight: 600, fontSize: '15px', cursor: 'pointer',
          }}
        >
          Start Creating
        </button>

        <p style={{ color: '#636366', fontSize: '10px', textAlign: 'center', margin: '12px 0 0', letterSpacing: '0.04em' }}>
          Fan-made tool · Not affiliated with Moonton
        </p>
      </div>
    </div>
  )
}

// ── Hook: call this in App to decide whether to show welcome ──
export function useWelcome() {
  const [show, setShow] = useState(false)

  useEffect(() => {
    if (!localStorage.getItem(STORAGE_KEY)) {
      setShow(true)
    }
  }, [])

  const dismiss = () => setShow(false)
  return { show, dismiss }
}
