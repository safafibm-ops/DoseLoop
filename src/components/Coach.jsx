// Glass pop-up that points at the one button the judge should press next.
// The button is found by its data-coach="..." attribute; the pop-up follows it while the page scrolls.
// If the button is off screen, a pill at the screen edge points to it (tapping it scrolls there and presses it).
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

const GAP = 14 // space between the button and the pop-up
const M = 8 // keep this far from the screen edges
const HAND = { above: '👇', below: '👆', left: '👉', right: '👈', up: '👆', down: '👇' }

const clamp = (v, lo, hi) => Math.min(Math.max(v, lo), Math.max(lo, hi))
const round = (r) => ({ x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) })

// Screen area not covered by the header, the tab bar or the guide card.
function screenArea() {
  const vh = window.innerHeight
  let top = 0
  let bottom = vh
  for (const el of document.querySelectorAll('.topbar, .tabbar')) {
    const r = el.getBoundingClientRect()
    if (!r.height || r.bottom <= 0 || r.top >= vh) continue
    if (r.top + r.height / 2 < vh / 2) top = Math.max(top, Math.round(r.bottom))
    else bottom = Math.min(bottom, Math.round(r.top))
  }
  const g = document.querySelector('.guide')?.getBoundingClientRect()
  return { top, bottom, vw: document.documentElement.clientWidth, vh, guide: g?.height ? round(g) : null }
}

// Lowest usable y for something spanning x0..x1 (the guide card only matters if it is underneath).
const bottomAt = (a, x0, x1) => (a.guide && x1 > a.guide.x && x0 < a.guide.x + a.guide.w ? Math.min(a.bottom, a.guide.y) : a.bottom)
const hitsGuide = (a, x, y, w, h) => a.guide && x < a.guide.x + a.guide.w && x + w > a.guide.x && y < a.guide.y + a.guide.h && y + h > a.guide.y

// Pick the first side (in order of preference) where the pop-up fits without covering the guide card.
function placeBubble(t, bw, bh, a, prefs, inBar) {
  const cx = t.x + t.w / 2
  const cy = t.y + t.h / 2
  const top = inBar ? 0 : a.top
  const sides = {
    above: { x: clamp(cx - bw / 2, M, a.vw - bw - M), y: t.y - GAP - bh },
    below: { x: clamp(cx - bw / 2, M, a.vw - bw - M), y: t.y + t.h + GAP },
    right: { x: t.x + t.w + GAP, y: clamp(cy - bh / 2, top + M, a.vh - bh - M) },
    left: { x: t.x - GAP - bw, y: clamp(cy - bh / 2, top + M, a.vh - bh - M) },
  }
  const onScreen = (c) => c.x >= M && c.x + bw <= a.vw - M && c.y >= M && c.y + bh <= a.vh - M
  const clear = (c) => onScreen(c) && c.y >= top && c.y + bh <= (inBar ? a.vh : a.bottom) && !hitsGuide(a, c.x, c.y, bw, bh)
  const side = prefs.find((s) => clear(sides[s])) ?? prefs.find((s) => onScreen(sides[s])) ?? prefs[0]
  const c = sides[side]
  const arrow = side === 'above' || side === 'below' ? { left: clamp(cx - c.x, 18, bw - 18) } : { top: clamp(cy - c.y, 16, bh - 16) }
  return { side, x: c.x, y: c.y, arrow }
}

/**
 * target: data-coach value of the button to point at (nothing is shown if it is missing)
 * text: what to do, e.g. "Tap to start the shift"; chip: small label, e.g. "2/6"
 * place: preferred sides, e.g. "below above"; edge: show the off-screen pill
 */
export default function Coach({ target, text, chip, place = 'above below', edge = true }) {
  const [view, setView] = useState(null)
  const bubble = useRef(null)

  // follow the button every frame (cheap: only re-renders when something moved)
  useEffect(() => {
    if (!target) return
    let raf
    let last = ''
    const tick = () => {
      raf = requestAnimationFrame(tick)
      const el = document.querySelector(`[data-coach="${target}"]`)
      let next = null
      if (el && !el.disabled && !document.querySelector('[data-coach-busy]')) {
        const r = el.getBoundingClientRect()
        if (r.width && r.height) {
          next = {
            target,
            t: round(r),
            radius: parseFloat(getComputedStyle(el).borderTopLeftRadius) || 10,
            inBar: !!el.closest('.topbar, .tabbar'),
            a: screenArea(),
            bw: bubble.current?.offsetWidth ?? 0,
            bh: bubble.current?.offsetHeight ?? 0,
          }
        }
      }
      const key = JSON.stringify(next)
      if (key !== last) {
        last = key
        setView(next)
      }
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [target])

  if (!target || !view || view.target !== target) return null
  const { t, a, bw, bh, inBar } = view
  const top = inBar ? 0 : a.top
  const bottom = inBar ? a.vh : bottomAt(a, t.x, t.x + t.w)
  const seen = Math.min(t.y + t.h, bottom) - Math.max(t.y, top)
  const visible = seen >= Math.min(t.h * 0.6, 56)
  if (!visible && !edge) return null

  const press = () => document.querySelector(`[data-coach="${target}"]`)?.click()
  // off-screen pill: scroll the button into view, then press it
  const reveal = () => {
    document.querySelector(`[data-coach="${target}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    setTimeout(press, 500)
  }
  const measured = bw > 0 && bh > 0

  let side, style, arrow
  if (visible) {
    const p = placeBubble(t, bw, bh, a, place.split(' '), inBar)
    side = p.side
    style = { left: p.x, top: p.y }
    arrow = p.arrow
  } else {
    side = t.y + t.h / 2 < top ? 'up' : 'down'
    const x = clamp(t.x + t.w / 2 - bw / 2, M, a.vw - bw - M)
    style = { left: x, top: side === 'up' ? top + 10 : bottomAt(a, x, x + bw) - bh - 10 }
  }

  return createPortal(
    <div className="coach" aria-live="polite">
      {visible && (
        <div
          className="coach-ring"
          style={{ left: t.x - 6, top: t.y - 6, width: t.w + 12, height: t.h + 12, borderRadius: view.radius + 6 }}
          aria-hidden="true"
        />
      )}
      <button
        key={`${target}-${visible}`}
        ref={bubble}
        type="button"
        className={`coach-bubble coach-${side} ${visible ? '' : 'coach-edge'} ${measured ? '' : 'coach-measuring'}`}
        style={style}
        onClick={visible ? press : reveal}
      >
        {chip && <b className="coach-chip">{chip}</b>}
        <span className="coach-hand" aria-hidden="true">
          {HAND[side]}
        </span>
        <span className="coach-text">{text}</span>
        {visible && <i className="coach-arrow" style={arrow} aria-hidden="true" />}
      </button>
    </div>,
    document.body,
  )
}
