// The collage preview: a light, fast canvas that only draws what is on screen,
// so 1000+ skins stay smooth. Pinch / scroll to zoom, drag to move around,
// tap a skin to select it, long-press a skin and drag it to a new place.
import { useEffect, useRef, useCallback } from 'react'
import { useCollage, gridOf } from '../lib/store.js'
import { thumbOf, loadThumb, onThumb } from '../lib/images.js'
import { blobGet } from '../lib/db.js'

const CELL = 100

export default function Stage({ onTap, swapFrom, showNumbers }) {
  const wrap = useRef(null), cv = useRef(null)
  const items = useCollage(s => s.items)
  const bg = useCollage(s => s.bg)
  const banner = useCollage(s => s.banner)
  const selected = useCollage(s => s.selected)
  const move = useCollage(s => s.move)

  const st = useRef({ s: 1, tx: 0, ty: 0, fitted: false, userMoved: false, w: 0, h: 0, dpr: 1, cols: 0 })
  const data = useRef({})
  data.current = { items, bg, banner, selected, swapFrom, showNumbers }
  const bannerBmp = useRef({ id: null, bmp: null })
  const drag = useRef(null)          // { id, from, x, y, target }
  const raf = useRef(0)

  const geom = () => {
    const n = data.current.items.length
    const { cols, rows } = gridOf(Math.max(1, n))
    const b = data.current.banner
    const bannerH = b?.w ? (CELL * cols * b.h) / b.w : 0
    return { n, cols, rows, bannerH, W: cols * CELL, H: bannerH + rows * CELL }
  }

  const draw = useCallback(() => {
    raf.current = 0
    const c = cv.current
    if (!c) return
    const v = st.current, d = data.current, g = geom()
    const ctx = c.getContext('2d')
    ctx.setTransform(v.dpr, 0, 0, v.dpr, 0, 0)
    ctx.clearRect(0, 0, v.w, v.h)
    if (!g.n && !d.banner) return
    ctx.save()
    ctx.translate(v.tx, v.ty)
    ctx.scale(v.s, v.s)
    ctx.shadowColor = 'rgba(0,0,0,.6)'; ctx.shadowBlur = 30 / v.s
    ctx.fillStyle = d.bg; ctx.fillRect(0, 0, g.W, g.H)
    ctx.shadowBlur = 0
    ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high'

    if (g.bannerH) {
      const bb = bannerBmp.current
      if (bb.bmp && bb.id === d.banner.blobId) ctx.drawImage(bb.bmp, 0, 0, g.W, g.bannerH)
      else { ctx.fillStyle = '#16161e'; ctx.fillRect(0, 0, g.W, g.bannerH) }
    }

    // only the cells on screen
    const x0 = -v.tx / v.s, y0 = -v.ty / v.s, x1 = x0 + v.w / v.s, y1 = y0 + v.h / v.s
    const c0 = Math.max(0, Math.floor(x0 / CELL)), c1 = Math.min(g.cols - 1, Math.floor(x1 / CELL))
    const r0 = Math.max(0, Math.floor((y0 - g.bannerH) / CELL)), r1 = Math.min(g.rows - 1, Math.floor((y1 - g.bannerH) / CELL))
    const px = 1 / v.s
    const dr = drag.current
    for (let r = r0; r <= r1; r++) for (let col = c0; col <= c1; col++) {
      const i = r * g.cols + col
      if (i >= g.n) continue
      const it = d.items[i]
      const x = col * CELL, y = g.bannerH + r * CELL
      if (dr && dr.id === it.id) { ctx.fillStyle = '#101016'; ctx.fillRect(x, y, CELL, CELL); continue }
      const t = thumbOf(it)
      if (t && !t.failed) ctx.drawImage(t, x, y, CELL, CELL)
      else {
        ctx.fillStyle = '#17171f'; ctx.fillRect(x + px, y + px, CELL - 2 * px, CELL - 2 * px)
        if (t?.failed) { ctx.fillStyle = '#d9776f'; ctx.font = `bold ${CELL * 0.14}px DM Sans, sans-serif`; ctx.textAlign = 'center'; ctx.fillText('offline', x + CELL / 2, y + CELL / 2) }
        else loadThumb(it)
      }
      if (d.showNumbers && v.s * CELL > 40) {
        const fs = Math.min(13, v.s * CELL * 0.16) / v.s
        ctx.font = `700 ${fs}px DM Sans, sans-serif`
        const label = String(i + 1)
        const tw = ctx.measureText(label).width + fs * 0.8
        ctx.fillStyle = 'rgba(0,0,0,.65)'; ctx.fillRect(x + 3 * px, y + 3 * px, tw, fs * 1.35)
        ctx.fillStyle = '#fff'; ctx.textAlign = 'left'; ctx.textBaseline = 'top'; ctx.fillText(label, x + 3 * px + fs * 0.4, y + 3 * px + fs * 0.2)
      }
    }
    // selection / swap / drop target
    const ring = (id, color, w = 3) => {
      const i = d.items.findIndex(it => it.id === id)
      if (i < 0) return
      ctx.strokeStyle = color; ctx.lineWidth = w * px
      ctx.strokeRect((i % g.cols) * CELL + w * px / 2, g.bannerH + Math.floor(i / g.cols) * CELL + w * px / 2, CELL - w * px, CELL - w * px)
    }
    if (d.selected) ring(d.selected, '#c9a66b')
    if (d.swapFrom) ring(d.swapFrom, '#8c9a86')
    if (dr?.target != null) {
      const ti = dr.target
      ctx.fillStyle = 'rgba(201,166,107,.9)'
      ctx.fillRect((ti % g.cols) * CELL - 2 * px, g.bannerH + Math.floor(ti / g.cols) * CELL + 6 * px, 4 * px, CELL - 12 * px)
    }
    ctx.restore()
    // the skin being dragged follows the finger
    if (dr) {
      const it = d.items.find(x => x.id === dr.id), t = it && thumbOf(it)
      const size = Math.max(56, Math.min(120, v.s * CELL * 1.1))
      ctx.globalAlpha = 0.92
      ctx.shadowColor = 'rgba(0,0,0,.6)'; ctx.shadowBlur = 18
      if (t && !t.failed) ctx.drawImage(t, dr.x - size / 2, dr.y - size / 2, size, size)
      ctx.shadowBlur = 0; ctx.globalAlpha = 1
      ctx.strokeStyle = '#c9a66b'; ctx.lineWidth = 2; ctx.strokeRect(dr.x - size / 2, dr.y - size / 2, size, size)
    }
  }, [])

  const redraw = useCallback(() => { if (!raf.current) raf.current = requestAnimationFrame(draw) }, [draw])

  const fit = useCallback(() => {
    const v = st.current, g = geom()
    if (!v.w || !v.h) return
    const pad = 16
    v.s = Math.min((v.w - pad * 2) / g.W, (v.h - pad * 2) / g.H)
    v.tx = (v.w - g.W * v.s) / 2
    v.ty = Math.max(pad, (v.h - g.H * v.s) / 2)
    v.userMoved = false
    redraw()
  }, [redraw])

  // size of the canvas follows the screen
  useEffect(() => {
    const el = wrap.current
    const ro = new ResizeObserver(() => {
      const v = st.current
      v.w = el.clientWidth; v.h = el.clientHeight; v.dpr = Math.min(3, window.devicePixelRatio || 1)
      cv.current.width = Math.round(v.w * v.dpr); cv.current.height = Math.round(v.h * v.dpr)
      if (!v.userMoved) fit(); else redraw()
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [fit, redraw])

  // refit when the grid shape changes; redraw on any change
  useEffect(() => {
    const { cols } = gridOf(Math.max(1, items.length))
    if (cols !== st.current.cols || !st.current.userMoved) { st.current.cols = cols; fit() } else redraw()
  }, [items, banner, fit, redraw])
  useEffect(redraw, [bg, selected, swapFrom, showNumbers, redraw])
  useEffect(() => onThumb(redraw), [redraw])

  // banner preview
  useEffect(() => {
    let dead = false
    if (!banner?.blobId) { bannerBmp.current = { id: null, bmp: null }; redraw(); return }
    blobGet(banner.blobId).then(b => b && createImageBitmap(b, { resizeWidth: Math.min(1600, banner.w), resizeQuality: 'high' })).then(bmp => {
      if (dead || !bmp) return
      bannerBmp.current = { id: banner.blobId, bmp }; redraw()
    }).catch(() => {})
    return () => { dead = true }
  }, [banner, redraw])

  // ── gestures ───────────────────────────────────────────────────────────────
  useEffect(() => {
    const el = cv.current
    const pts = new Map()
    let start = null, pinch = null, moved = false, lpTimer = 0, lastTap = { t: 0, x: 0, y: 0 }
    const pos = e => { const r = el.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top } }
    const cellAt = (x, y, forDrop = false) => {
      const v = st.current, g = geom()
      const cx = (x - v.tx) / v.s, cy = (y - v.ty) / v.s - g.bannerH
      if (cx < 0 || cx >= g.W || cy < 0) return forDrop ? (cy < 0 ? 0 : null) : null
      const col = Math.floor(cx / CELL), row = Math.floor(cy / CELL)
      let i = row * g.cols + col
      if (forDrop) {
        if (cx - col * CELL > CELL / 2) i++          // right half: after this one
        return Math.min(g.n, i)
      }
      return i < g.n ? i : null
    }
    const clampScale = s => { const g = geom(), v = st.current; const fitS = Math.min(v.w / g.W, v.h / g.H); return Math.max(fitS * 0.4, Math.min(8, s)) }

    const down = e => {
      el.setPointerCapture(e.pointerId)
      pts.set(e.pointerId, pos(e))
      const v = st.current
      if (pts.size === 1) {
        const p = pos(e)
        start = { ...p, tx: v.tx, ty: v.ty }
        moved = false
        clearTimeout(lpTimer)
        const i = cellAt(p.x, p.y)
        if (i != null) {
          lpTimer = setTimeout(() => {
            if (moved || pts.size !== 1) return
            const it = data.current.items[i]
            drag.current = { id: it.id, from: i, x: p.x, y: p.y, target: i }
            navigator.vibrate?.(12)
            redraw()
          }, 380)
        }
      } else if (pts.size === 2) {
        clearTimeout(lpTimer)
        if (drag.current) { drag.current = null; redraw() }
        const [a, b] = [...pts.values()]
        pinch = { d: Math.hypot(a.x - b.x, a.y - b.y) || 1, mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2, s: v.s, tx: v.tx, ty: v.ty }
        moved = true
      }
    }
    const moveH = e => {
      if (!pts.has(e.pointerId)) return
      const p = pos(e)
      pts.set(e.pointerId, p)
      const v = st.current
      if (drag.current) {
        drag.current.x = p.x; drag.current.y = p.y
        const t = cellAt(p.x, p.y, true)
        drag.current.target = t
        // scroll when the finger is near the edge
        const edge = 40
        if (p.y < edge) v.ty += 6; else if (p.y > v.h - edge) v.ty -= 6
        redraw()
        return
      }
      if (pts.size === 2 && pinch) {
        const [a, b] = [...pts.values()]
        const d = Math.hypot(a.x - b.x, a.y - b.y) || 1
        const s = clampScale(pinch.s * d / pinch.d)
        const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2
        const cx = (pinch.mx - pinch.tx) / pinch.s, cy = (pinch.my - pinch.ty) / pinch.s
        v.s = s; v.tx = mx - cx * s; v.ty = my - cy * s; v.userMoved = true
        redraw()
        return
      }
      if (pts.size === 1 && start) {
        const dx = p.x - start.x, dy = p.y - start.y
        if (!moved && Math.hypot(dx, dy) > 8) { moved = true; clearTimeout(lpTimer) }
        if (moved) { v.tx = start.tx + dx; v.ty = start.ty + dy; v.userMoved = true; redraw() }
      }
    }
    const up = e => {
      if (!pts.has(e.pointerId)) return
      const p = pos(e)
      pts.delete(e.pointerId)
      clearTimeout(lpTimer)
      if (drag.current) {
        const { id, from, target } = drag.current
        drag.current = null
        if (target != null && target !== from && target !== from + 1) move(id, target > from ? target - 1 : target)
        redraw()
        return
      }
      if (pts.size === 1) {               // one finger left after a pinch: continue as a pan
        const [q] = [...pts.values()]
        start = { ...q, tx: st.current.tx, ty: st.current.ty }; pinch = null
        return
      }
      if (pts.size === 0) {
        pinch = null
        if (!moved && e.type === 'pointerup') {
          const now = performance.now()
          if (now - lastTap.t < 300 && Math.hypot(p.x - lastTap.x, p.y - lastTap.y) < 30) { fit(); lastTap.t = 0; return }
          lastTap = { t: now, x: p.x, y: p.y }
          const i = cellAt(p.x, p.y)
          onTapRef.current(i == null ? null : data.current.items[i].id)
        }
      }
    }
    const wheel = e => {
      e.preventDefault()
      const v = st.current, p = pos(e)
      const s = clampScale(v.s * Math.exp(-e.deltaY * 0.0015))
      const cx = (p.x - v.tx) / v.s, cy = (p.y - v.ty) / v.s
      v.s = s; v.tx = p.x - cx * s; v.ty = p.y - cy * s; v.userMoved = true
      redraw()
    }
    el.addEventListener('pointerdown', down)
    el.addEventListener('pointermove', moveH)
    el.addEventListener('pointerup', up)
    el.addEventListener('pointercancel', up)
    el.addEventListener('wheel', wheel, { passive: false })
    const noMenu = e => e.preventDefault()
    el.addEventListener('contextmenu', noMenu)
    return () => {
      el.removeEventListener('pointerdown', down); el.removeEventListener('pointermove', moveH)
      el.removeEventListener('pointerup', up); el.removeEventListener('pointercancel', up)
      el.removeEventListener('wheel', wheel); el.removeEventListener('contextmenu', noMenu)
    }
  }, [fit, redraw, move])

  const onTapRef = useRef(onTap)
  onTapRef.current = onTap

  return (
    <div className="stage" ref={wrap}>
      <canvas ref={cv} />
      <div className="stage-hud">
        <button className="chip" onClick={fit}>Fit</button>
      </div>
    </div>
  )
}
