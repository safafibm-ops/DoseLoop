// Evens out uneven light across the pod (a shadow from the phone, a lamp to one side, vignetting).
// The pod's plain background is printed in one known colour everywhere, so any change in it across
// the photo is the light. We measure it in small cells, smooth it, and divide it out.

import SPEC from './podSpec.json'
import { toLinear, toSrgb } from './color.js'

const CELL = 2 // mm
const SIGMA = 3.5 // mm, how smooth the light map is
const PAD = 0.7 // mm kept clear around every printed element

// everything printed on the pod (mm rectangles), so the rest is plain background
function elements() {
  const m = SPEC.markers
  const s = SPEC.scale
  const p = SPEC.patches
  const sd = SPEC.shutterDots
  const [wx, wy, ww, wh] = SPEC.wick.rect
  const r = [
    ...m.centers.map(([x, y]) => [x - m.size / 2, y - m.size / 2, m.size, m.size]),
    SPEC.strip,
    SPEC.reference,
    SPEC.qr,
    [s.x, s.y, s.doses.length * (s.w + s.gap), s.h + 2.2], // scale + its numbers
    [p.x, p.y, p.cols * (p.cell + p.gap), Math.ceil(p.names.length / p.cols) * (p.cell + p.gap)],
    [sd.open[0] - sd.r, sd.open[1] - sd.r, sd.closed[0] - sd.open[0] + 2 * sd.r, 2 * sd.r],
    [wx, wy, ww, wh + 5], // expiry indicator + the serial text under it
  ]
  return r.map(([x, y, w, h]) => [x - PAD, y - PAD, w + 2 * PAD, h + 2 * PAD])
}

const isBackground = (els, x, y) => {
  const [W, H] = SPEC.size_mm
  if (x < PAD || y < PAD || x > W - PAD || y > H - PAD) return false
  return !els.some(([ex, ey, ew, eh]) => x >= ex && x <= ex + ew && y >= ey && y <= ey + eh)
}

/**
 * flat: straightened pod view (RGBA, ppm px per mm). Returns { image (evened), map (light per cell,
 * for the screen), background (its sRGB colour once evened), spread (how uneven the light was: brightest / darkest cell), cells }.
 */
export function evenLight(flat, ppm) {
  const [W, H] = SPEC.size_mm
  const els = elements()
  const nx = Math.ceil(W / CELL), ny = Math.ceil(H / CELL)
  const lin = Float32Array.from({ length: 256 }, (_, v) => toLinear(v))
  const cells = []
  const step = Math.max(1, Math.round(ppm / 5))
  for (let cy = 0; cy < ny; cy++)
    for (let cx = 0; cx < nx; cx++) {
      const vals = [[], [], []]
      let total = 0
      let hot = 0
      for (let y = cy * CELL; y < (cy + 1) * CELL; y += step / ppm)
        for (let x = cx * CELL; x < (cx + 1) * CELL; x += step / ppm) {
          total++
          if (!isBackground(els, x, y)) continue
          const i = (Math.round(y * ppm) * flat.width + Math.round(x * ppm)) * 4
          if (i < 0 || i >= flat.data.length) continue
          for (let c = 0; c < 3; c++) vals[c].push(lin[flat.data[i + c]])
          if (Math.max(flat.data[i], flat.data[i + 1], flat.data[i + 2]) >= 253) hot++
        }
      if (vals[0].length < total * 0.3 || vals[0].length < 4) continue
      const med = vals.map((v) => v.sort((a, b) => a - b)[v.length >> 1])
      cells.push({ x: (cx + 0.5) * CELL, y: (cy + 0.5) * CELL, rgb: med, hot: hot / vals[0].length })
    }
  if (cells.length < 12) return { image: flat, spread: 1, cells: 0, background: null, clipped: 1 }

  // drop odd cells (a speck of glare, a smudge): far from the typical background brightness
  const lum = (c) => 0.2126 * c.rgb[0] + 0.7152 * c.rgb[1] + 0.0722 * c.rgb[2]
  const sorted = cells.map(lum).sort((a, b) => a - b)
  const mid = sorted[sorted.length >> 1]
  const good = cells.filter((c) => lum(c) > mid * 0.25 && lum(c) < mid * 2.5)
  const ref = [0, 1, 2].map((ch) => good.map((c) => c.rgb[ch]).sort((a, b) => a - b)[good.length >> 1])

  // smooth light map on a 1 mm grid (Gaussian-weighted average of the cells)
  const gw = W + 1, gh = H + 1
  const map = new Float32Array(gw * gh * 3)
  for (let y = 0; y < gh; y++)
    for (let x = 0; x < gw; x++) {
      const acc = [0, 0, 0]
      let wsum = 0
      for (const c of good) {
        const w = Math.exp(-((c.x - x) ** 2 + (c.y - y) ** 2) / (2 * SIGMA * SIGMA))
        wsum += w
        for (let ch = 0; ch < 3; ch++) acc[ch] += w * c.rgb[ch]
      }
      for (let ch = 0; ch < 3; ch++) map[(y * gw + x) * 3 + ch] = acc[ch] / wsum / ref[ch]
    }
  const lums = good.map(lum)
  const spread = Math.max(...lums) / Math.max(1e-4, Math.min(...lums))

  // divide it out, pixel by pixel (bilinear between grid points)
  const out = new Uint8ClampedArray(flat.data.length)
  const N = 4096
  const toS = Uint8ClampedArray.from({ length: N + 1 }, (_, i) => Math.round(toSrgb(i / N)))
  for (let py = 0; py < flat.height; py++) {
    const fy = Math.min(gh - 1.001, py / ppm)
    const y0 = Math.floor(fy), ty = fy - y0
    for (let px = 0; px < flat.width; px++) {
      const fx = Math.min(gw - 1.001, px / ppm)
      const x0 = Math.floor(fx), tx = fx - x0
      const i = (py * flat.width + px) * 4
      for (let ch = 0; ch < 3; ch++) {
        const a = map[(y0 * gw + x0) * 3 + ch], b = map[(y0 * gw + x0 + 1) * 3 + ch]
        const c = map[((y0 + 1) * gw + x0) * 3 + ch], d = map[((y0 + 1) * gw + x0 + 1) * 3 + ch]
        const light = (a * (1 - tx) + b * tx) * (1 - ty) + (c * (1 - tx) + d * tx) * ty
        const v = lin[flat.data[i + ch]] / Math.max(0.05, light)
        out[i + ch] = toS[Math.round(Math.min(1, v) * N)]
      }
      out[i + 3] = 255
    }
  }
  return { image: { data: out, width: flat.width, height: flat.height }, spread, cells: good.length, background: ref.map(toSrgb), clipped: good.reduce((n, c) => n + c.hot, 0) / good.length }
}
