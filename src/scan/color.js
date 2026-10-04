// Colour maths used by the scan pipeline (same formulas as scripts/podlib.py).

export const hexToRgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16))
export const rgbToHex = (rgb) =>
  '#' + rgb.map((c) => Math.round(Math.min(255, Math.max(0, c))).toString(16).padStart(2, '0')).join('')

export const toLinear = (c) => {
  const v = c / 255
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
}
export const toSrgb = (v) => {
  const c = Math.min(1, Math.max(0, v))
  return 255 * (c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055)
}

const M = [
  [0.4124, 0.3576, 0.1805],
  [0.2126, 0.7152, 0.0722],
  [0.0193, 0.1192, 0.9505],
]
const WHITE = [0.95047, 1.0, 1.08883]

export function linToLab(lin) {
  const f = M.map((row, i) => {
    const t = (row[0] * lin[0] + row[1] * lin[1] + row[2] * lin[2]) / WHITE[i]
    return t > 216 / 24389 ? Math.cbrt(t) : ((24389 / 27) * t + 16) / 116
  })
  return [116 * f[1] - 16, 500 * (f[0] - f[1]), 200 * (f[1] - f[2])]
}
export const rgbToLab = (rgb) => linToLab(rgb.map(toLinear))
export const deltaE = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])

// ---- small linear algebra for the 3x3 colour matrix ----
function inv3(m) {
  const [a, b, c] = m[0], [d, e, f] = m[1], [g, h, i] = m[2]
  const A = e * i - f * h, B = -(d * i - f * g), C = d * h - e * g
  const det = a * A + b * B + c * C
  return [
    [A / det, -(b * i - c * h) / det, (b * f - c * e) / det],
    [B / det, (a * i - c * g) / det, -(a * f - c * d) / det],
    [C / det, -(a * h - b * g) / det, (a * e - b * d) / det],
  ]
}
export const mulVec = (m, v) => m.map((r) => r[0] * v[0] + r[1] * v[1] + r[2] * v[2])

// Tone curve for one channel: straight lines in log-log space through the anchor points
// (measured, true) in linear light, kept rising. Handles the S-shaped curves phones apply.
function toneCurve(points) {
  let pts = points
    .filter(([x, y]) => x > 0.002 && y > 0.002)
    .map(([x, y, w]) => ({ x: Math.log(x), y: Math.log(y), w }))
    .sort((a, b) => a.x - b.x)
  // pool points that are too close to tell apart, and any that would make the curve fall
  const pooled = []
  for (const p of pts) {
    pooled.push({ ...p })
    for (;;) {
      const n = pooled.length
      if (n < 2) break
      const a = pooled[n - 2], b = pooled[n - 1]
      if (b.x - a.x > 0.05 && b.y > a.y) break
      const w = a.w + b.w
      pooled.splice(n - 2, 2, { x: (a.x * a.w + b.x * b.w) / w, y: (a.y * a.w + b.y * b.w) / w, w })
    }
  }
  pts = pooled
  if (pts.length < 2) {
    const off = pts.length ? pts[0].y - pts[0].x : 0
    return (v) => Math.exp(Math.log(Math.max(toLinear(v), 1e-5)) + off)
  }
  const slope = (a, b) => Math.min(2.5, Math.max(0.4, (b.y - a.y) / (b.x - a.x)))
  const s0 = slope(pts[0], pts[1]), s1 = slope(pts[pts.length - 2], pts[pts.length - 1])
  const lut = Float64Array.from({ length: 256 }, (_, v) => {
    const x = Math.log(Math.max(toLinear(v), 1e-5))
    if (x <= pts[0].x) return Math.exp(pts[0].y + s0 * (x - pts[0].x))
    const last = pts[pts.length - 1]
    if (x >= last.x) return Math.exp(last.y + s1 * (x - last.x))
    let i = 1
    while (pts[i].x < x) i++
    const a = pts[i - 1], b = pts[i]
    return Math.exp(a.y + ((x - a.x) / (b.x - a.x)) * (b.y - a.y))
  })
  return (v) => {
    const lo = Math.max(0, Math.min(254, Math.floor(v)))
    const t = Math.min(1, Math.max(0, v - lo))
    return lut[lo] * (1 - t) + lut[lo + 1] * t
  }
}

const LOCAL_SIGMA = 10 // ΔE: how far a reference colour's leftover error spreads
const LOCAL_PRIOR = 0.03 // pulls the local fix towards zero far from any reference colour

/**
 * Fit the colour correction from measured vs true colours (sRGB 0-255).
 * 1. Tone curve per channel (linear light) through the grey patches and the pod background.
 * 2. 3x3 matrix from all patches + browns (browns weighted higher).
 * 3. Local fix: what is still off at each reference colour is spread to nearby colours, so a strip
 *    colour is corrected mostly by the printed browns next to it.
 * samples: [{ measured, truth, tone: bool, weight }]
 */
export function fitCorrection(samples) {
  const curves = [0, 1, 2].map((ch) =>
    toneCurve(samples.filter((s) => s.tone).map((s) => [toLinear(s.measured[ch]), toLinear(s.truth[ch]), s.weight])),
  )
  const applyTone = (rgb) => rgb.map((c, ch) => curves[ch](Math.min(255, Math.max(0, c))))

  // weighted least squares: truth ≈ Mx · toned
  const XtX = [[0, 0, 0], [0, 0, 0], [0, 0, 0]]
  const XtY = [[0, 0, 0], [0, 0, 0], [0, 0, 0]]
  for (const s of samples) {
    const x = applyTone(s.measured)
    const y = s.truth.map(toLinear)
    for (let i = 0; i < 3; i++)
      for (let j = 0; j < 3; j++) {
        XtX[i][j] += s.weight * x[i] * x[j]
        XtY[i][j] += s.weight * x[i] * y[j]
      }
  }
  const B = inv3(XtX)
  // matrix rows = output channels
  const Mx = [0, 1, 2].map((out) => [0, 1, 2].map((k) => B[k].reduce((sum, v, j) => sum + v * XtY[j][out], 0)))
  const clampLin = (v) => v.map((c) => Math.min(1, Math.max(0, c)))
  const globalLab = (rgb) => linToLab(clampLin(mulVec(Mx, applyTone(rgb))))

  const anchors = samples.map((s) => {
    const g = globalLab(s.measured)
    const t = rgbToLab(s.truth)
    return { g, res: [t[0] - g[0], t[1] - g[1], t[2] - g[2]], w: s.weight }
  })
  const correctLab = (rgb) => {
    const g = globalLab(rgb)
    const acc = [0, 0, 0]
    let wsum = LOCAL_PRIOR
    for (const a of anchors) {
      const w = a.w * Math.exp(-((g[0] - a.g[0]) ** 2 + (g[1] - a.g[1]) ** 2 + (g[2] - a.g[2]) ** 2) / (2 * LOCAL_SIGMA ** 2))
      wsum += w
      for (let k = 0; k < 3; k++) acc[k] += w * a.res[k]
    }
    return [g[0] + acc[0] / wsum, g[1] + acc[1] / wsum, g[2] + acc[2] / wsum]
  }
  return {
    toneLut: curves.map((f) => Float64Array.from({ length: 256 }, (_, v) => f(v))),
    matrix: Mx,
    globalLab, // tone curve + matrix only (before the local fix)
    correctLab,
    correct: (rgb) => labToRgb(correctLab(rgb)),
  }
}

export function interp(x, xs, ys) {
  if (x <= xs[0]) return ys[0]
  if (x >= xs[xs.length - 1]) return ys[ys.length - 1]
  let i = 1
  while (xs[i] < x) i++
  const t = (x - xs[i - 1]) / (xs[i] - xs[i - 1])
  return ys[i - 1] + t * (ys[i] - ys[i - 1])
}

const M_INV = [
  [3.2406, -1.5372, -0.4986],
  [-0.9689, 1.8758, 0.0415],
  [0.0557, -0.204, 1.057],
]

export function labToRgb([L, a, b]) {
  const fy = (L + 16) / 116
  const f = [fy + a / 500, fy, fy - b / 200]
  const xyz = f.map((t, i) => (t ** 3 > 216 / 24389 ? t ** 3 : (116 * t - 16) / (24389 / 27)) * WHITE[i])
  return mulVec(M_INV, xyz).map(toSrgb)
}
