// The pod face drawn as SVG from podSpec.json, with a live strip colour.
import SPEC from '../scan/podSpec.json'
import { inkHex } from '../data/limits.js'

const QR_N = 25
// a fixed QR-looking pattern (decorative; the real QR is in the sample photos)
const QR_CELLS = (() => {
  let seed = 7
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
  const cells = []
  const finder = (x, y) => x < 7 && y < 7
  for (let y = 0; y < QR_N; y++)
    for (let x = 0; x < QR_N; x++) {
      const f = finder(x, y) || finder(QR_N - 1 - x, y) || finder(x, QR_N - 1 - y)
      if (f) {
        const fx = x < 7 ? x : QR_N - 1 - x
        const fy = y < 7 ? y : QR_N - 1 - y
        const ring = Math.max(Math.abs(fx - 3), Math.abs(fy - 3))
        if (ring !== 2) cells.push([x, y])
      } else if (rnd() < 0.48 && !(x === 7 || y === 7 || x === QR_N - 8 || y === QR_N - 8)) cells.push([x, y])
    }
  return cells
})()

function dots(rect, d) {
  const [x0, y0, w, h] = rect
  const out = []
  for (let gx = x0 + 1.2; gx < x0 + w; gx += 2.4)
    for (let gy = y0 + 1.2; gy < y0 + h; gy += 2.4) out.push(<circle key={`${gx}-${gy}`} cx={gx} cy={gy} r={d / 2} />)
  return out
}

export default function PodFace({ dose = 0, humidity = 0, shutterOpen = true, wick = 0.2, className = '', label = true }) {
  const m = SPEC.markers
  const s = SPEC.scale
  const p = SPEC.patches
  const [wx, wy, ww, wh] = SPEC.wick.rect
  const sd = SPEC.shutterDots
  const [qx, qy, qw] = SPEC.qr
  const cell = qw / (QR_N + 2)
  return (
    <svg viewBox="-1 -1 48 34" className={`podface ${className}`} role="img" aria-label={`Pod face, strip at ${Math.round(dose)} ppm·hr`}>
      <rect x="-0.8" y="-0.8" width="47.6" height="33.6" rx="2.2" fill="#d2d2cd" />
      <rect x="0" y="0" width="46" height="32" rx="1.6" fill={SPEC.background} />
      {m.centers.map(([cx, cy]) => (
        <g key={cx + '-' + cy}>
          <rect x={cx - m.size / 2} y={cy - m.size / 2} width={m.size} height={m.size} fill={SPEC.black} />
          <rect x={cx - m.inner / 2} y={cy - m.inner / 2} width={m.inner} height={m.inner} fill={SPEC.background} />
        </g>
      ))}
      <rect x={SPEC.strip[0]} y={SPEC.strip[1]} width={SPEC.strip[2]} height={SPEC.strip[3]} fill={inkHex(dose + humidity)} stroke="#9a9a96" strokeWidth="0.12" className="ink" />
      <g fill="#efefec">{dots(SPEC.strip, 1.0)}</g>
      <rect x={SPEC.reference[0]} y={SPEC.reference[1]} width={SPEC.reference[2]} height={SPEC.reference[3]} fill={inkHex(humidity)} stroke="#9a9a96" strokeWidth="0.12" />
      <g fill="#1e1e1e">{dots(SPEC.reference, 1.2)}</g>
      {s.doses.map((d, k) => {
        const x = s.x + k * (s.w + s.gap)
        return (
          <g key={d}>
            <rect x={x} y={s.y} width={s.w} height={s.h} fill={SPEC.ink.colors[k]} />
            {label && (
              <text x={x + s.w / 2} y={s.y + s.h + 1.35} fontSize="1.25" textAnchor="middle" fill="#333">
                {d}
              </text>
            )}
          </g>
        )
      })}
      {p.colors.map((c, k) => {
        const r = Math.floor(k / p.cols), q = k % p.cols
        return <rect key={k} x={p.x + q * (p.cell + p.gap)} y={p.y + r * (p.cell + p.gap)} width={p.cell} height={p.cell} fill={c} />
      })}
      <rect x={qx} y={qy} width={qw} height={qw} fill="#fff" />
      <g fill={SPEC.black}>
        {QR_CELLS.map(([x, y]) => (
          <rect key={x + '-' + y} x={qx + cell * (x + 1)} y={qy + cell * (y + 1)} width={cell + 0.01} height={cell + 0.01} />
        ))}
      </g>
      <circle cx={sd.open[0]} cy={sd.open[1]} r={sd.r} fill={shutterOpen ? sd.green : sd.mask} />
      <circle cx={sd.closed[0]} cy={sd.closed[1]} r={sd.r} fill={shutterOpen ? sd.mask : sd.red} />
      <rect x={wx} y={wy} width={ww} height={wh} fill={SPEC.wick.track} stroke="#9a9a96" strokeWidth="0.1" />
      <rect x={wx} y={wy} width={ww * Math.min(1, wick)} height={wh} fill={SPEC.wick.dye} />
      <rect x={wx + ww - 0.45} y={wy} width="0.45" height={wh} fill={SPEC.wick.expiredLine} />
      {label && (
        <text x={wx} y={wy + wh + 2.2} fontSize="1.4" fill="#333">
          DoseLoop H₂S
        </text>
      )}
    </svg>
  )
}
