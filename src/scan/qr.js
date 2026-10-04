// Reads the pod's QR code from the full-resolution photo.
// Real photos are blurry, noisy, dim or printed with fuzzy dots, so it tries several clean-ups
// (sharpen, smooth + black/white, local black/white) at a few sizes and stops at the first that reads.

import jsQR from 'jsqr'
import SPEC from './podSpec.json'
import { areaScale, homography } from './geometry.js'

const MARGIN = 2 // mm of quiet zone around the QR
const SIZES = [28, 20, 38] // pixels per mm to try (≈ 6, 4 and 8 px per QR module)

const toRgba = (cv, m) => {
  const rgba = new cv.Mat()
  cv.cvtColor(m, rgba, m.channels() === 1 ? cv.COLOR_GRAY2RGBA : cv.COLOR_RGB2RGBA)
  const img = { data: new Uint8ClampedArray(rgba.data), width: rgba.cols, height: rgba.rows }
  rgba.delete()
  return img
}

/** The QR area of the photo, straightened, at `ppm` pixels per mm (grey). */
function qrPatch(cv, src, H, ppm) {
  const [qx, qy, qw, qh] = SPEC.qr
  const x0 = qx - MARGIN, y0 = qy - MARGIN, w = qw + 2 * MARGIN, h = qh + 2 * MARGIN
  // pixels per mm in the photo around the QR: warp at that size (no detail lost), then resize
  const srcPpm = Math.sqrt(areaScale(H, [qx + qw / 2, qy + qh / 2]))
  const base = Math.min(Math.max(srcPpm, 8), 60)
  const dstPts = [[x0, y0], [x0 + w, y0], [x0 + w, y0 + h], [x0, y0 + h]]
  const imgPts = dstPts.map((p) => {
    const v = H[2][0] * p[0] + H[2][1] * p[1] + H[2][2]
    return [(H[0][0] * p[0] + H[0][1] * p[1] + H[0][2]) / v, (H[1][0] * p[0] + H[1][1] * p[1] + H[1][2]) / v]
  })
  const bw = Math.round(w * base), bh = Math.round(h * base)
  const s = cv.matFromArray(4, 1, cv.CV_32FC2, imgPts.flat())
  const d = cv.matFromArray(4, 1, cv.CV_32FC2, [0, 0, bw, 0, bw, bh, 0, bh])
  const M = cv.getPerspectiveTransform(s, d)
  const warped = new cv.Mat()
  cv.warpPerspective(src, warped, M, new cv.Size(bw, bh), cv.INTER_LINEAR, cv.BORDER_REPLICATE)
  s.delete(); d.delete(); M.delete()
  const gray = new cv.Mat()
  cv.cvtColor(warped, gray, cv.COLOR_RGBA2GRAY)
  warped.delete()
  const out = new cv.Mat()
  const tw = Math.round(w * ppm), th = Math.round(h * ppm)
  cv.resize(gray, out, new cv.Size(tw, th), 0, 0, tw < bw ? cv.INTER_AREA : cv.INTER_CUBIC)
  gray.delete()
  return { mat: out, srcPpm }
}

// clean-ups, each returns a new grey Mat
const CLEANUPS = [
  ['as is', (cv, g) => g.clone()],
  [
    'sharpened',
    (cv, g) => {
      const n = new cv.Mat()
      cv.normalize(g, n, 0, 255, cv.NORM_MINMAX)
      const b = new cv.Mat()
      cv.GaussianBlur(n, b, new cv.Size(0, 0), 2)
      cv.addWeighted(n, 1.8, b, -0.8, 0, n)
      b.delete()
      return n
    },
  ],
  [
    'smoothed black/white',
    (cv, g, ppm) => {
      const b = new cv.Mat()
      cv.GaussianBlur(g, b, new cv.Size(0, 0), Math.max(0.6, ppm * 0.05))
      cv.threshold(b, b, 0, 255, cv.THRESH_BINARY + cv.THRESH_OTSU)
      return b
    },
  ],
  [
    'local black/white',
    (cv, g, ppm) => {
      const b = new cv.Mat()
      cv.GaussianBlur(g, b, new cv.Size(0, 0), Math.max(0.6, ppm * 0.04))
      const block = Math.round(ppm * 1.2) | 1 // about 5 modules
      cv.adaptiveThreshold(b, b, 255, cv.ADAPTIVE_THRESH_MEAN_C, cv.THRESH_BINARY, Math.max(3, block), 4)
      return b
    },
  ],
]

let detector = null
function cvDecode(cv, gray) {
  if (!cv.QRCodeDetector) return null
  detector ??= new cv.QRCodeDetector()
  const pts = new cv.Mat()
  const straight = new cv.Mat()
  try {
    return detector.detectAndDecode(gray, pts, straight) || null
  } catch {
    return null
  } finally {
    pts.delete()
    straight.delete()
  }
}

/**
 * pts: the 4 marker centres in the photo, in SPEC.markers.centers order.
 * Returns { code (jsQR result or null), image (straightened QR for the screen), tries, how }.
 */
export function readQr(cv, src, pts, { sizes = SIZES, cleanups = CLEANUPS } = {}) {
  const H = homography(SPEC.markers.centers, pts)
  let image = null
  let tries = 0
  for (const ppm of sizes) {
    const { mat } = qrPatch(cv, src, H, ppm)
    try {
      if (!image) image = toRgba(cv, mat)
      for (const [how, clean] of cleanups) {
        tries++
        const m = clean(cv, mat, ppm)
        const img = toRgba(cv, m)
        m.delete()
        const code = jsQR(img.data, img.width, img.height, { inversionAttempts: 'dontInvert' })
        if (code) return { code, image, tries, how: `${how}, ${ppm} px/mm` }
      }
      // second opinion: OpenCV's own QR reader (already in the bundle) on the plain patch
      tries++
      const text = cvDecode(cv, mat)
      if (text) return { code: { data: text }, image, tries, how: `OpenCV reader, ${ppm} px/mm` }
    } finally {
      mat.delete()
    }
  }
  return { code: null, image, tries, how: null }
}

/**
 * Which way up is the pod? The markers fix it up to a half turn; the QR corner is the busiest
 * (most edges) of the two candidates. Returns pts reordered so pts[0] is the pod's top-left marker.
 */
export function orient(cv, gray, pts) {
  const flip = [pts[2], pts[3], pts[0], pts[1]]
  const score = (p) => {
    const H = homography(SPEC.markers.centers, p)
    const [qx, qy, qw, qh] = SPEC.qr
    // sample edge strength on a grid inside the QR area
    let sum = 0, n = 0
    const step = qw / 24
    const at = (x, y) => {
      const v = H[2][0] * x + H[2][1] * y + H[2][2]
      const u = Math.round((H[0][0] * x + H[0][1] * y + H[0][2]) / v)
      const w = Math.round((H[1][0] * x + H[1][1] * y + H[1][2]) / v)
      if (u < 0 || w < 0 || u >= gray.cols || w >= gray.rows) return null
      return gray.ucharPtr(w, u)[0]
    }
    for (let y = qy + step; y < qy + qh - step; y += step)
      for (let x = qx + step; x < qx + qw - step; x += step) {
        const a = at(x, y), b = at(x + step, y), c = at(x, y + step)
        if (a == null || b == null || c == null) continue
        sum += Math.abs(a - b) + Math.abs(a - c)
        n++
      }
    return n ? sum / n : 0
  }
  return score(flip) > score(pts) ? flip : pts
}
