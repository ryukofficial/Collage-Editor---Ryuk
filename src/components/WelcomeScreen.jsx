import { useEffect, useState } from 'react'

const STORAGE_KEY = 'ryuk_welcomed_v1'

const features = [
  { icon: '∞',  label: 'Unlimited Collage',    desc: 'Add as many skins as you want — no cap' },
  { icon: '💎', label: 'Full Quality Export',   desc: 'PNG export at native resolution, zero compression' },
  { icon: '🦸', label: 'Hero & Tier Picker',    desc: 'Browse every MLBB skin by hero or tier' },
  { icon: '⚡', label: 'Instant Canvas',        desc: 'Drag, drop, arrange — smooth & fast' },
]

export default function WelcomeScreen({ onDismiss }) {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    // Small delay so the fade-in is noticeable
    const t = setTimeout(() => setVisible(true), 30)
    return () => clearTimeout(t)
  }, [])

  const handleDismiss = () => {
    localStorage.setItem(STORAGE_KEY, '1')
    onDismiss()
  }

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
        background: 'radial-gradient(ellipse at 60% 20%, #1a0a2e 0%, #0a0a14 55%, #000 100%)',
        opacity: visible ? 1 : 0,
        transition: 'opacity 0.5s ease',
      }}
    >
      {/* Animated background orbs */}
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Cinzel:wght@700;900&family=Outfit:wght@300;400;600&display=swap');

        @keyframes orb1 {
          0%,100% { transform: translate(0,0) scale(1); }
          50%      { transform: translate(30px,-20px) scale(1.08); }
        }
        @keyframes orb2 {
          0%,100% { transform: translate(0,0) scale(1); }
          50%      { transform: translate(-20px,25px) scale(1.05); }
        }
        @keyframes shimmer {
          0%   { background-position: -200% center; }
          100% { background-position: 200% center; }
        }
        @keyframes float {
          0%,100% { transform: translateY(0); }
          50%      { transform: translateY(-6px); }
        }
        @keyframes featureIn {
          from { opacity: 0; transform: translateX(-12px); }
          to   { opacity: 1; transform: translateX(0); }
        }
        .welcome-feature {
          animation: featureIn 0.4s ease both;
        }
        .welcome-feature:nth-child(1) { animation-delay: 0.35s; }
        .welcome-feature:nth-child(2) { animation-delay: 0.5s;  }
        .welcome-feature:nth-child(3) { animation-delay: 0.65s; }
        .welcome-feature:nth-child(4) { animation-delay: 0.8s;  }

        .welcome-cta {
          animation: featureIn 0.4s ease 1s both;
        }
        .welcome-cta:hover {
          transform: scale(1.03);
          box-shadow: 0 0 40px rgba(108,99,255,0.55), 0 0 80px rgba(168,85,247,0.25);
        }
        .welcome-cta:active { transform: scale(0.98); }

        .logo-text {
          background: linear-gradient(90deg, #fff 20%, #a78bfa 50%, #6c63ff 65%, #fff 80%);
          background-size: 200% auto;
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
          animation: shimmer 3s linear infinite, float 4s ease-in-out infinite;
        }
      `}</style>

      {/* BG orbs */}
      <div style={{
        position: 'absolute', width: '420px', height: '420px',
        borderRadius: '50%', top: '-80px', right: '-60px',
        background: 'radial-gradient(circle, rgba(108,99,255,0.18) 0%, transparent 70%)',
        animation: 'orb1 8s ease-in-out infinite', pointerEvents: 'none',
      }} />
      <div style={{
        position: 'absolute', width: '320px', height: '320px',
        borderRadius: '50%', bottom: '-60px', left: '-40px',
        background: 'radial-gradient(circle, rgba(168,85,247,0.15) 0%, transparent 70%)',
        animation: 'orb2 10s ease-in-out infinite', pointerEvents: 'none',
      }} />

      {/* Card */}
      <div style={{
        position: 'relative',
        width: '100%',
        maxWidth: '420px',
        background: 'rgba(14,14,26,0.85)',
        border: '1px solid rgba(108,99,255,0.35)',
        borderRadius: '24px',
        padding: '36px 28px 28px',
        backdropFilter: 'blur(20px)',
        boxShadow: '0 8px 60px rgba(0,0,0,0.7), inset 0 1px 0 rgba(255,255,255,0.06)',
        overflow: 'hidden',
      }}>
        {/* Top accent line */}
        <div style={{
          position: 'absolute', top: 0, left: '10%', right: '10%', height: '2px',
          background: 'linear-gradient(90deg, transparent, #6c63ff, #a855f7, transparent)',
          borderRadius: '0 0 2px 2px',
        }} />

        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: '6px' }}>
          <h1
            className="logo-text"
            style={{
              fontFamily: '"Cinzel", serif',
              fontSize: 'clamp(28px, 7vw, 38px)',
              fontWeight: 900,
              margin: 0,
              letterSpacing: '0.04em',
              lineHeight: 1.1,
            }}
          >
            Ryuk Creates
          </h1>
          <p style={{
            fontFamily: '"Outfit", sans-serif',
            color: '#7c7c9e',
            fontSize: '12px',
            fontWeight: 300,
            letterSpacing: '0.22em',
            textTransform: 'uppercase',
            margin: '8px 0 0',
          }}>
            MLBB Collage Studio
          </p>
        </div>

        {/* Divider */}
        <div style={{
          height: '1px',
          background: 'linear-gradient(90deg, transparent, rgba(108,99,255,0.3), transparent)',
          margin: '22px 0',
        }} />

        {/* Welcome copy */}
        <p style={{
          fontFamily: '"Outfit", sans-serif',
          color: '#b0b0cc',
          fontSize: '14px',
          fontWeight: 400,
          textAlign: 'center',
          margin: '0 0 22px',
          lineHeight: 1.6,
        }}>
          Build stunning MLBB skin collages in seconds.<br />
          Everything is free. Everything is unlimited.
        </p>

        {/* Feature list */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '26px' }}>
          {features.map((f, i) => (
            <div
              key={i}
              className="welcome-feature"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '14px',
                background: 'rgba(108,99,255,0.07)',
                border: '1px solid rgba(108,99,255,0.15)',
                borderRadius: '12px',
                padding: '10px 14px',
              }}
            >
              <span style={{
                fontSize: f.icon === '∞' ? '22px' : '18px',
                fontFamily: f.icon === '∞' ? '"Cinzel", serif' : undefined,
                color: '#a78bfa',
                width: '26px',
                textAlign: 'center',
                flexShrink: 0,
                lineHeight: 1,
              }}>
                {f.icon}
              </span>
              <div>
                <p style={{
                  fontFamily: '"Outfit", sans-serif',
                  color: '#e0e0f0',
                  fontSize: '13px',
                  fontWeight: 600,
                  margin: '0 0 2px',
                }}>
                  {f.label}
                </p>
                <p style={{
                  fontFamily: '"Outfit", sans-serif',
                  color: '#6b6b8a',
                  fontSize: '11px',
                  margin: 0,
                  lineHeight: 1.4,
                }}>
                  {f.desc}
                </p>
              </div>
            </div>
          ))}
        </div>

        {/* CTA */}
        <button
          className="welcome-cta"
          onClick={handleDismiss}
          style={{
            width: '100%',
            padding: '15px',
            borderRadius: '14px',
            background: 'linear-gradient(135deg, #6c63ff 0%, #a855f7 100%)',
            border: 'none',
            color: '#fff',
            fontFamily: '"Outfit", sans-serif',
            fontWeight: 600,
            fontSize: '15px',
            letterSpacing: '0.04em',
            cursor: 'pointer',
            transition: 'transform 0.18s ease, box-shadow 0.18s ease',
            boxShadow: '0 4px 24px rgba(108,99,255,0.35)',
          }}
        >
          Start Creating →
        </button>

        {/* Fine print */}
        <p style={{
          fontFamily: '"Outfit", sans-serif',
          color: '#3a3a55',
          fontSize: '10px',
          textAlign: 'center',
          margin: '14px 0 0',
          letterSpacing: '0.05em',
        }}>
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
