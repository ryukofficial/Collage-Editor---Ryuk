import { useEffect, useRef } from 'react'
import { X, ChevronLeft } from 'lucide-react'

// ── phone back button closes the top sheet ──────────────────────────────────
const stack = []
let ignorePops = 0
window.addEventListener('popstate', () => {
  if (ignorePops > 0) { ignorePops--; return }
  const top = stack.pop()
  if (top) { top.popped = true; top.close() }
})

export function useBack(onClose, active = true) {
  const ref = useRef(onClose)
  ref.current = onClose
  useEffect(() => {
    if (!active) return
    const entry = { popped: false, close: () => ref.current?.() }
    stack.push(entry)
    history.pushState({ ryuk: stack.length }, '')
    return () => {
      const i = stack.indexOf(entry)
      if (i >= 0) stack.splice(i, 1)
      if (!entry.popped) { ignorePops++; history.back() }
    }
  }, [active])
}

// A panel that slides up from the bottom on phones (centred on big screens).
export function Sheet({ title, subtitle, onClose, children, footer, full = false, wide = false, back = false, actions = null, className = '' }) {
  useBack(onClose)
  return (
    <div className="sheet-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className={`sheet ${full ? 'full' : ''} ${wide ? 'wide' : ''} ${className}`} role="dialog" aria-label={typeof title === 'string' ? title : undefined}>
        <div className="sheet-grip" />
        <div className="sheet-head">
          {back && <button className="icon-btn plain" onClick={onClose} aria-label="Back"><ChevronLeft size={22} /></button>}
          <div className="sheet-title">
            <div className="h2 ellipsis">{title}</div>
            {subtitle && <div className="small muted" style={{ marginTop: 2 }}>{subtitle}</div>}
          </div>
          {actions}
          {!back && <button className="icon-btn" onClick={onClose} aria-label="Close"><X size={19} /></button>}
        </div>
        <div className="sheet-body">{children}</div>
        {footer && <div className="sheet-foot">{footer}</div>}
      </div>
    </div>
  )
}

export function Spinner({ size = 18 }) {
  return (
    <svg className="spin" width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity=".2" strokeWidth="3" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  )
}

export function Progress({ value }) {
  return <div className="bar"><i style={{ width: `${Math.max(2, Math.min(100, value * 100))}%` }} /></div>
}
