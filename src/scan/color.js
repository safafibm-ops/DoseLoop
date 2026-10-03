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

/**
 * Fit the colour correction from measured vs true colours (sRGB 0-255).
 * 1. Tone curve per channel (true = a · measured^p, in linear light) from neutrals + browns.
 * 2. 3x3 matrix from all patches + browns (browns weighted higher).
 * Returns correct(rgb) -> corrected sRGB.
 */
export function fitCorrection(samples) {
  // samples: [{ measured:[r,g,b], truth:[r,g,b], tone:bool, weight:number }]
  const tone = [0, 1, 2].map((ch) => {
    const pts = samples
      .filter((s) => s.tone)
      .map((s) => [toLinear(s.measured[ch]), toLinear(s.truth[ch])])
      .filter(([x, y]) => x > 0.004 && y > 0.004)
      .map(([x, y]) => [Math.log(x), Math.log(y)])
    const n = pts.length
    const mx = pts.reduce((s, p) => s + p[0], 0) / n
    const my = pts.reduce((s, p) => s + p[1], 0) / n
    const sxy = pts.reduce((s, p) => s + (p[0] - mx) * (p[1] - my), 0)
    const sxx = pts.reduce((s, p) => s + (p[0] - mx) ** 2, 0)
    const p = sxy / sxx
    return { p, a: Math.exp(my - p * mx) }
  })
  const applyTone = (rgb) => rgb.map((c, ch) => tone[ch].a * Math.max(toLinear(c), 1e-5) ** tone[ch].p)

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
  const Mx = [0, 1, 2].map((out) => [0, 1, 2].map((k) => B[k].reduce((s, v, j) => s + v * XtY[j][out], 0)))

  const correctLin = (rgb) => mulVec(Mx, applyTone(rgb))
  return {
    tone,
    matrix: Mx,
    correct: (rgb) => correctLin(rgb).map(toSrgb),
    correctLab: (rgb) => linToLab(correctLin(rgb).map((v) => Math.min(1, Math.max(0, v)))),
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
