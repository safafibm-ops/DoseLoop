// Small hand-made SVG charts with hover/focus tooltips.
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { STATUS } from '../data/limits.js'

export function useWidth(fallback = 320) {
  const ref = useRef(null)
  const [w, setW] = useState(fallback)
  useLayoutEffect(() => {
    if (!ref.current) return
    const ro = new ResizeObserver(([e]) => setW(Math.max(200, Math.round(e.contentRect.width))))
    ro.observe(ref.current)
    return () => ro.disconnect()
  }, [])
  return [ref, w]
}

function useTip() {
  const [tip, setTip] = useState(null)
  const show = (e, content) => {
    const box = e.currentTarget.closest('.chart-wrap').getBoundingClientRect()
    const r = e.currentTarget.getBoundingClientRect()
    const x = (e.clientX ?? r.left + r.width / 2) - box.left
    const y = (e.clientY ?? r.top) - box.top
    setTip({ x, y, content, w: box.width })
  }
  const hide = () => setTip(null)
  const el = tip && (
    <div className="tip" style={{ left: Math.min(Math.max(tip.x, 70), tip.w - 70), top: tip.y }} role="status">
      {tip.content}
    </div>
  )
  return { show, hide, el }
}

const TipBody = ({ value, title, sub, status }) => (
  <>
    <b>{value}</b>
    <span>{title}</span>
    {sub && <span className="muted">{sub}</span>}
    {status && (
      <span style={{ color: STATUS[status].color }}>
        {STATUS[status].icon} {STATUS[status].label}
      </span>
    )}
  </>
)

/** Bars coloured by status, with reference lines (limits). */
export function BarChart({ bars, refs = [], height = 190, unit = 'ppm·hr', onBarClick }) {
  const [ref, width] = useWidth()
  const tip = useTip()
  const pad = { l: 34, r: 8, t: 12, b: 26 }
  const maxV = Math.max(10, ...bars.map((b) => b.value), ...refs.filter((r) => r.scale !== false).map((r) => r.value)) * 1.1
  const innerW = width - pad.l - pad.r
  const innerH = height - pad.t - pad.b
  const bw = innerW / Math.max(1, bars.length)
  const y = (v) => pad.t + innerH - (v / maxV) * innerH
  const ticks = [0, maxV / 3, (2 * maxV) / 3].map((t) => Math.round(t))
  const every = Math.ceil(bars.length / Math.max(1, Math.floor(innerW / 48)))
  return (
    <div className="chart-wrap" ref={ref}>
      <svg width={width} height={height} className="chart-svg">
        {ticks.map((t) => (
          <g key={t}>
            <line x1={pad.l} x2={width - pad.r} y1={y(t)} y2={y(t)} className="grid" />
            <text x={pad.l - 6} y={y(t) + 4} textAnchor="end" className="axis-label">
              {t}
            </text>
          </g>
        ))}
        {bars.map((b, i) => {
          const x = pad.l + i * bw
          const h = Math.max(b.value > 0 ? 2 : 0, y(0) - y(b.value))
          const w = Math.max(2, bw - 3)
          const r = Math.min(4, w / 2, h)
          const color = STATUS[b.status]?.color ?? '#3987e5'
          const top = y(0) - h
          return (
            <g
              key={b.key}
              className="bar"
              tabIndex={0}
              onPointerMove={(e) => tip.show(e, <TipBody value={`${b.value} ${unit}`} title={b.label} sub={b.sub} status={b.status} />)}
              onFocus={(e) => tip.show(e, <TipBody value={`${b.value} ${unit}`} title={b.label} sub={b.sub} status={b.status} />)}
              onPointerLeave={tip.hide}
              onBlur={tip.hide}
              onClick={() => onBarClick?.(b)}
            >
              <rect x={x} y={pad.t} width={bw} height={innerH} fill="transparent" />
              <path
                d={`M${x + 1.5},${y(0)} V${top + r} Q${x + 1.5},${top} ${x + 1.5 + r},${top} H${x + 1.5 + w - r} Q${x + 1.5 + w},${top} ${x + 1.5 + w},${top + r} V${y(0)} Z`}
                fill={color}
                className="bar-fill"
              />
              {i % every === 0 && (
                <text x={x + bw / 2} y={height - 8} textAnchor="middle" className="axis-label">
                  {b.short}
                </text>
              )}
            </g>
          )
        })}
        {refs.map((r) =>
          r.value < maxV ? (
            <g key={r.label}>
              <line x1={pad.l} x2={width - pad.r} y1={y(r.value)} y2={y(r.value)} className={`refline ${r.dashed ? 'dashed' : ''}`} />
              <text x={width - pad.r} y={y(r.value) - 4} textAnchor="end" className="ref-label">
                {r.label}
              </text>
            </g>
          ) : null,
        )}
        <line x1={pad.l} x2={width - pad.r} y1={y(0)} y2={y(0)} className="baseline" />
      </svg>
      {tip.el}
    </div>
  )
}

/** Ring gauge for a single headline number (e.g. pod capacity). */
export function Ring({ value, max, size = 120, label, sub, color = '#ff6a13', marker }) {
  const r = size / 2 - 9
  const c = 2 * Math.PI * r
  const f = Math.max(0, Math.min(1, value / max))
  const mAngle = marker != null ? (marker / max) * 2 * Math.PI - Math.PI / 2 : null
  return (
    <div className="ring" style={{ width: size, height: size }}>
      <svg width={size} height={size}>
        <circle cx={size / 2} cy={size / 2} r={r} className="ring-track" strokeWidth="10" fill="none" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={color}
          strokeWidth="10"
          fill="none"
          strokeLinecap="round"
          strokeDasharray={`${c * f} ${c}`}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          className="ring-fill"
        />
        {mAngle != null && (
          <line
            x1={size / 2 + (r - 8) * Math.cos(mAngle)}
            y1={size / 2 + (r - 8) * Math.sin(mAngle)}
            x2={size / 2 + (r + 8) * Math.cos(mAngle)}
            y2={size / 2 + (r + 8) * Math.sin(mAngle)}
            className="ring-marker"
          />
        )}
      </svg>
      <div className="ring-text">
        <b>{label}</b>
        {sub && <span>{sub}</span>}
      </div>
    </div>
  )
}

// sequential blue ramp (dark steps → light) for magnitude
const RAMP = ['#104281', '#184f95', '#1c5cab', '#256abf', '#2a78d6', '#3987e5', '#5598e7', '#6da7ec', '#86b6ef', '#9ec5f4', '#b7d3f6']
export const rampColor = (v, max) => RAMP[Math.min(RAMP.length - 1, Math.floor((Math.max(0, v) / max) * (RAMP.length - 1)))]

/** Workers × days grid. cell(rowId, colKey) → { value, status, sub } or null. */
export function Heatmap({ rows, cols, cell, max = 40, onRowClick }) {
  const tip = useTip()
  return (
    <div className="chart-wrap heat-wrap">
      <div className="heat" style={{ gridTemplateColumns: `minmax(92px, 130px) repeat(${cols.length}, minmax(18px, 1fr))` }}>
        <div />
        {cols.map((c, i) => (
          <div key={c.key} className="heat-col">
            {i % 2 === 0 ? c.label : ''}
          </div>
        ))}
        {rows.map((r) => (
          <div className="heat-row" key={r.id} style={{ display: 'contents' }}>
            <button className="heat-name" onClick={() => onRowClick?.(r)}>
              {r.label}
              <span>{r.sub}</span>
            </button>
            {cols.map((c) => {
              const v = cell(r.id, c.key)
              if (!v) return <div key={c.key} className="heat-cell off" />
              const bg = rampColor(v.value, max)
              const light = RAMP.indexOf(bg) >= 7
              const content = <TipBody value={`${v.value} ppm·hr`} title={`${r.label} · ${c.title}`} sub={v.sub} status={v.status} />
              return (
                <div
                  key={c.key}
                  className={`heat-cell ${v.status}`}
                  style={{ background: bg, color: light ? '#0b0b0b' : '#fff' }}
                  tabIndex={0}
                  onPointerMove={(e) => tip.show(e, content)}
                  onFocus={(e) => tip.show(e, content)}
                  onPointerLeave={tip.hide}
                  onBlur={tip.hide}
                  onClick={() => onRowClick?.(r)}
                >
                  {v.status === 'over' ? '✕' : v.status === 'caution' ? '!' : ''}
                </div>
              )
            })}
          </div>
        ))}
      </div>
      <div className="heat-legend">
        <span>Daily dose</span>
        <span className="heat-scale">
          {RAMP.map((c) => (
            <i key={c} style={{ background: c }} />
          ))}
        </span>
        <span>0 → {max}+ ppm·hr</span>
        <span>
          <b style={{ color: STATUS.caution.color }}>!</b> caution · <b style={{ color: STATUS.over.color }}>✕</b> over limit
        </span>
      </div>
      {tip.el}
    </div>
  )
}

/** Step line of a pod's cumulative reading, with a crosshair that snaps to the nearest scan. */
export function ReadingLine({ points, height = 170, max, refs = [] }) {
  const [ref, width] = useWidth()
  const [hover, setHover] = useState(null)
  const pad = { l: 34, r: 10, t: 12, b: 24 }
  if (points.length < 2)
    return (
      <div className="chart-wrap empty" ref={ref}>
        Scan the pod twice to see its reading over time.
      </div>
    )
  const t0 = points[0].t, t1 = points[points.length - 1].t
  const maxV = Math.max(max ?? 0, ...points.map((p) => p.v)) * 1.05
  const x = (t) => pad.l + ((t - t0) / Math.max(1, t1 - t0)) * (width - pad.l - pad.r)
  const y = (v) => pad.t + (height - pad.t - pad.b) * (1 - v / maxV)
  const d = points.map((p, i) => `${i ? 'L' : 'M'}${x(p.t).toFixed(1)},${y(p.v).toFixed(1)}`).join(' ')
  const onMove = (e) => {
    const bx = e.currentTarget.getBoundingClientRect().left
    const px = e.clientX - bx
    let best = 0
    points.forEach((p, i) => {
      if (Math.abs(x(p.t) - px) < Math.abs(x(points[best].t) - px)) best = i
    })
    setHover(best)
  }
  const hp = hover != null ? points[hover] : null
  return (
    <div className="chart-wrap" ref={ref}>
      <svg width={width} height={height} className="chart-svg" onPointerMove={onMove} onPointerLeave={() => setHover(null)}>
        {[0, maxV / 2].map((t) => (
          <g key={t}>
            <line x1={pad.l} x2={width - pad.r} y1={y(t)} y2={y(t)} className="grid" />
            <text x={pad.l - 6} y={y(t) + 4} textAnchor="end" className="axis-label">
              {Math.round(t)}
            </text>
          </g>
        ))}
        {refs.map((r) =>
          r.value < maxV ? (
            <g key={r.label}>
              <line x1={pad.l} x2={width - pad.r} y1={y(r.value)} y2={y(r.value)} className="refline dashed" />
              <text x={width - pad.r} y={y(r.value) - 4} textAnchor="end" className="ref-label">
                {r.label}
              </text>
            </g>
          ) : null,
        )}
        <path d={d} className="line" />
        {hp && (
          <>
            <line x1={x(hp.t)} x2={x(hp.t)} y1={pad.t} y2={height - pad.b} className="crosshair" />
            <circle cx={x(hp.t)} cy={y(hp.v)} r="5" className="line-dot" />
          </>
        )}
        <text x={pad.l} y={height - 6} className="axis-label">
          {points[0].label}
        </text>
        <text x={width - pad.r} y={height - 6} textAnchor="end" className="axis-label">
          {points[points.length - 1].label}
        </text>
      </svg>
      {hp && (
        <div className="tip" style={{ left: Math.min(Math.max(x(hp.t), 70), width - 70), top: y(hp.v) }}>
          <b>{hp.v} ppm·hr</b>
          <span>{hp.title}</span>
        </div>
      )}
    </div>
  )
}

/** Animated number that counts up to `value`. */
export function CountUp({ value, decimals = 1, ms = 700 }) {
  const [v, setV] = useState(0)
  useEffect(() => {
    let raf
    const t0 = performance.now()
    const tick = (t) => {
      const k = Math.min(1, (t - t0) / ms)
      setV(value * (1 - (1 - k) ** 3))
      if (k < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [value, ms])
  return <>{v.toFixed(decimals)}</>
}
