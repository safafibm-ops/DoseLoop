// The scan pipeline: photo of a pod -> verified, colour-corrected dose in ppm·hr.
// Pure functions: give it OpenCV (cv) and an ImageData-like {data, width, height}.
// Every step returns pictures/numbers so the UI can show the whole process.

import jsQR from 'jsqr'
import nacl from 'tweetnacl'
import SPEC from './podSpec.json'
import PUBLIC_KEY from './publicKey.json'
import C1 from './calibration/C1.json'
import { deltaE, fitCorrection, hexToRgb, interp, rgbToHex, rgbToLab } from './color.js'

const CALIBRATIONS = { C1 }
const PPM = 20 // pixels per mm in the flat (warped) pod view
const QR_PPM = 30 // sharper warp just for reading the QR
const MAX_SIDE = 1600
const SELF_TEST_MAX_DE = 3
const CLIP_LEVEL = 253
const CLIP_MAX_FRACTION = 0.04

export class ScanError extends Error {
  constructor(code, message, steps) {
    super(message)
    this.code = code
    this.steps = steps
  }
}

// ---------- helpers ----------
const matToImage = (cv, mat) => {
  const rgba = new cv.Mat()
  if (mat.channels() === 4) mat.copyTo(rgba)
  else cv.cvtColor(mat, rgba, mat.channels() === 1 ? cv.COLOR_GRAY2RGBA : cv.COLOR_RGB2RGBA)
  const img = { data: new Uint8ClampedArray(rgba.data), width: rgba.cols, height: rgba.rows }
  rgba.delete()
  return img
}

const median = (arr) => {
  if (!arr.length) return NaN
  const s = Float64Array.from(arr).sort()
  const m = s.length >> 1
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}

function dotCenters(rect) {
  const [x0, y0, w, h] = rect
  const pitch = 2.4
  const pts = []
  for (let gx = x0 + pitch / 2; gx < x0 + w; gx += pitch)
    for (let gy = y0 + pitch / 2; gy < y0 + h; gy += pitch) pts.push([gx, gy])
  return pts
}

/**
 * Median colour of a rectangle (mm) in the flat view, ignoring the edges,
 * optional "holes" (circles to skip) and pixels far from the typical brightness.
 */
function sampleRect(flat, rect, { inset = 0.2, holes = [], holeR = 0 } = {}) {
  const [x, y, w, h] = rect
  const x0 = Math.round((x + w * inset) * PPM), x1 = Math.round((x + w * (1 - inset)) * PPM)
  const y0 = Math.round((y + h * inset) * PPM), y1 = Math.round((y + h * (1 - inset)) * PPM)
  const px = []
  for (let yy = y0; yy < y1; yy++)
    for (let xx = x0; xx < x1; xx++) {
      const mx = xx / PPM, my = yy / PPM
      if (holes.some(([cx, cy]) => (mx - cx) ** 2 + (my - cy) ** 2 < holeR * holeR)) continue
      const i = (yy * flat.width + xx) * 4
      px.push([flat.data[i], flat.data[i + 1], flat.data[i + 2]])
    }
  const clipped = px.filter((p) => Math.max(...p) >= CLIP_LEVEL).length / px.length
  const lum = px.map((p) => p[0] + p[1] + p[2])
  const ml = median(lum)
  const keep = px.filter((_, i) => Math.abs(lum[i] - ml) < 60)
  const rgb = [0, 1, 2].map((c) => median(keep.map((p) => p[c])))
  return { rgb, clipped, n: keep.length, rect }
}

// ---------- step 1: markers ----------
function findMarkers(cv, src) {
  const gray = new cv.Mat()
  const bin = new cv.Mat()
  cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY)
  cv.GaussianBlur(gray, gray, new cv.Size(3, 3), 0)
  const block = (Math.round(Math.max(src.cols, src.rows) / 25) | 1) + 0
  cv.adaptiveThreshold(gray, bin, 255, cv.ADAPTIVE_THRESH_MEAN_C, cv.THRESH_BINARY_INV, block, 10)
  const contours = new cv.MatVector()
  const hier = new cv.Mat()
  cv.findContours(bin, contours, hier, cv.RETR_TREE, cv.CHAIN_APPROX_SIMPLE)

  const H = (i) => hier.intPtr(0, i) // [next, prev, firstChild, parent]
  const quad = (c) => {
    const approx = new cv.Mat()
    cv.approxPolyDP(c, approx, 0.06 * cv.arcLength(c, true), true)
    const ok = approx.rows === 4 && cv.isContourConvex(approx)
    approx.delete()
    return ok
  }
  const minArea = (Math.min(src.cols, src.rows) * 0.012) ** 2
  const cands = []
  for (let i = 0; i < contours.size(); i++) {
    const c = contours.get(i)
    const area = cv.contourArea(c)
    if (area < minArea || !quad(c)) continue
    const child = H(i)[2]
    if (child < 0 || H(child)[0] >= 0 || H(child)[2] >= 0) continue // exactly one hole, with nothing inside
    const cc = contours.get(child)
    const ratio = cv.contourArea(cc) / area
    if (ratio < 0.1 || ratio > 0.4 || !quad(cc)) continue
    const m = cv.moments(c)
    const mc = cv.moments(cc)
    const x = m.m10 / m.m00, y = m.m01 / m.m00
    // the hole must sit in the middle (rules out printed digits inside colour patches)
    if (Math.hypot(mc.m10 / mc.m00 - x, mc.m01 / mc.m00 - y) > 0.12 * Math.sqrt(area)) continue
    cands.push({ area, x, y, rect: cv.boundingRect(c) })
  }
  gray.delete(); bin.delete(); contours.delete(); hier.delete()

  if (cands.length < 4) return { markers: null, candidates: cands }
  // choose the 4 most similar in size (largest group wins ties)
  cands.sort((a, b) => b.area - a.area)
  const top = cands.slice(0, 12)
  let best = null
  for (let a = 0; a < top.length; a++)
    for (let b = a + 1; b < top.length; b++)
      for (let c = b + 1; c < top.length; c++)
        for (let d = c + 1; d < top.length; d++) {
          const g = [top[a], top[b], top[c], top[d]]
          const ratio = g[0].area / g[3].area
          const span = quadArea(g)
          if (ratio > 2.5 || span === 0) continue
          // similar sizes first; between similar groups, the one spanning the biggest area
          if (!best || ratio < best.ratio - 0.3 || (ratio < best.ratio + 0.3 && span > best.span)) best = { ratio, span, g }
        }
  if (!best) return { markers: null, candidates: cands }
  // order clockwise on screen around their centre
  const cx = best.g.reduce((s, p) => s + p.x, 0) / 4
  const cy = best.g.reduce((s, p) => s + p.y, 0) / 4
  const markers = best.g.slice().sort((p, q) => Math.atan2(p.y - cy, p.x - cx) - Math.atan2(q.y - cy, q.x - cx))
  return { markers, candidates: cands }
}

// area of the convex quad through 4 points, or 0 if one point lies inside the others
function quadArea(g) {
  const cx = g.reduce((s, p) => s + p.x, 0) / 4, cy = g.reduce((s, p) => s + p.y, 0) / 4
  const o = g.slice().sort((p, q) => Math.atan2(p.y - cy, p.x - cx) - Math.atan2(q.y - cy, q.x - cx))
  let area = 0
  for (let k = 0; k < 4; k++) {
    const p = o[k], q = o[(k + 1) % 4], r = o[(k + 2) % 4]
    if ((q.x - p.x) * (r.y - q.y) - (q.y - p.y) * (r.x - q.x) <= 0) return 0
    area += p.x * q.y - q.x * p.y
  }
  return area / 2
}

function warp(cv, src, imgPts, dstPts, size) {
  const s = cv.matFromArray(4, 1, cv.CV_32FC2, imgPts.flat())
  const d = cv.matFromArray(4, 1, cv.CV_32FC2, dstPts.flat())
  const Hm = cv.getPerspectiveTransform(s, d)
  const out = new cv.Mat()
  cv.warpPerspective(src, out, Hm, new cv.Size(size[0], size[1]), cv.INTER_LINEAR, cv.BORDER_REPLICATE)
  s.delete(); d.delete(); Hm.delete()
  return out
}

// ---------- step 2: QR + signature ----------
function readQr(cv, src, imgPts) {
  const [qx, qy, qw, qh] = SPEC.qr
  const margin = 1.5
  const dst = SPEC.markers.centers.map(([x, y]) => [(x - qx + margin) * QR_PPM, (y - qy + margin) * QR_PPM])
  const size = [Math.round((qw + 2 * margin) * QR_PPM), Math.round((qh + 2 * margin) * QR_PPM)]
  const m = warp(cv, src, imgPts, dst, size)
  const img = matToImage(cv, m)
  m.delete()
  return { code: jsQR(img.data, img.width, img.height, { inversionAttempts: 'dontInvert' }), image: img }
}

export function verifyPayload(text) {
  const parts = text.split('|')
  if (parts.length !== 6 || parts[0] !== 'DL1') return { valid: false, reason: 'Not a DoseLoop pod code' }
  const [, serial, batch, mfgDate, cal, sigB64] = parts
  const msg = new TextEncoder().encode(parts.slice(0, 5).join('|'))
  let valid = false
  try {
    const sig = Uint8Array.from(atob(sigB64), (c) => c.charCodeAt(0))
    const key = Uint8Array.from(atob(PUBLIC_KEY.key), (c) => c.charCodeAt(0))
    valid = nacl.sign.detached.verify(msg, sig, key)
  } catch {
    valid = false
  }
  return { valid, serial, batch, mfgDate, cal, reason: valid ? 'Signature valid' : 'Signature does not match: copied or fake pod' }
}

// ---------- main ----------
export function scanPod(cv, imageData, { mode = 'start', today = new Date() } = {}) {
  const steps = {}
  let src = cv.matFromImageData(imageData)
  const scale = Math.min(1, MAX_SIDE / Math.max(src.cols, src.rows))
  if (scale < 1) {
    const small = new cv.Mat()
    cv.resize(src, small, new cv.Size(Math.round(src.cols * scale), Math.round(src.rows * scale)), 0, 0, cv.INTER_AREA)
    src.delete()
    src = small
  }

  try {
    // 1. markers -> flat view
    const { markers, candidates } = findMarkers(cv, src)
    const overlay = new cv.Mat()
    src.copyTo(overlay) // a real copy, so drawing on it never touches src
    for (const c of candidates)
      cv.rectangle(overlay, new cv.Point(c.rect.x, c.rect.y), new cv.Point(c.rect.x + c.rect.width, c.rect.y + c.rect.height), [255, 200, 0, 255], 2)
    if (!markers) {
      steps.markers = { image: matToImage(cv, overlay), found: candidates.length }
      overlay.delete()
      throw new ScanError('markers', 'Could not find the 4 corner markers. Fill the frame with the pod, hold steady, and retake.', steps)
    }
    for (let k = 0; k < 4; k++) {
      const a = markers[k], b = markers[(k + 1) % 4]
      cv.line(overlay, new cv.Point(a.x, a.y), new cv.Point(b.x, b.y), [0, 230, 120, 255], 4)
      cv.circle(overlay, new cv.Point(a.x, a.y), 14, [0, 230, 120, 255], -1)
    }
    steps.markers = { image: matToImage(cv, overlay), found: 4 }
    overlay.delete()

    // try the 4 possible orientations; the right one is where the QR sits in its corner
    const pts = markers.map((m) => [m.x, m.y])
    const dist = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1])
    const rotations = [0, 1, 2, 3]
      .map((r) => [0, 1, 2, 3].map((k) => pts[(k + r) % 4]))
      .sort((a, b) => dist(b[0], b[1]) - dist(b[1], b[2]) - (dist(a[0], a[1]) - dist(a[1], a[2])))
    let qr = null, imgPts = null
    for (const cand of rotations) {
      const r = readQr(cv, src, cand)
      if (r.code) { qr = r; imgPts = cand; break }
      if (!qr) qr = r
    }
    imgPts = imgPts || rotations[0]
    const W = SPEC.size_mm[0] * PPM, H = SPEC.size_mm[1] * PPM
    const flatMat = warp(cv, src, imgPts, SPEC.markers.centers.map(([x, y]) => [x * PPM, y * PPM]), [W, H])
    const flat = matToImage(cv, flatMat)
    flatMat.delete()
    steps.flat = { image: flat }

    // 2. QR + signature
    if (!qr.code) {
      steps.qr = { image: qr.image, text: null }
      throw new ScanError('qr', 'Could not read the QR code. Move closer, avoid blur, and retake.', steps)
    }
    const pod = verifyPayload(qr.code.data)
    steps.qr = { image: qr.image, text: qr.code.data, ...pod }
    if (!pod.valid) throw new ScanError('fake', `Pod rejected: ${pod.reason}.`, steps)
    const cal = CALIBRATIONS[pod.cal]
    if (!cal) throw new ScanError('cal', `No calibration "${pod.cal}" in this app version.`, steps)

    // 3. sample patches
    const P = SPEC.patches
    const patches = P.names.map((name, k) => {
      const r = Math.floor(k / P.cols), q = k % P.cols
      const rect = [P.x + q * (P.cell + P.gap), P.y + r * (P.cell + P.gap), P.cell, P.cell]
      return { name, truth: hexToRgb(P.colors[k]), neutral: P.neutrals.includes(name), ...sampleRect(flat, rect) }
    })
    const S = SPEC.scale
    const scale6 = S.doses.map((dose, k) => {
      const rect = [S.x + k * (S.w + S.gap), S.y, S.w, S.h]
      return { name: `${dose} ppm·hr`, dose, truth: hexToRgb(SPEC.ink.colors[SPEC.ink.doses.indexOf(dose)]), holdout: k === S.holdout, ...sampleRect(flat, rect) }
    })
    const strip = sampleRect(flat, SPEC.strip, { inset: 0.08, holes: dotCenters(SPEC.strip), holeR: 0.85 })
    const reference = sampleRect(flat, SPEC.reference, { inset: 0.08, holes: dotCenters(SPEC.reference), holeR: 0.95 })
    const glare = [...patches, ...scale6, strip, reference].filter((p) => p.clipped > CLIP_MAX_FRACTION)
    steps.sampling = { patches, scale: scale6, strip, reference, glare: glare.length }
    if (glare.length)
      throw new ScanError('glare', 'Glare or overexposure on the pod. Tilt the phone slightly or move out of direct light, then retake.', steps)

    // 4. colour correction (browns weighted 3x, held-out brown not used)
    const samples = [
      ...patches.map((p) => ({ measured: p.rgb, truth: p.truth, tone: p.neutral, weight: 1 })),
      ...scale6.filter((s) => !s.holdout).map((s) => ({ measured: s.rgb, truth: s.truth, tone: true, weight: 3 })),
    ]
    const corr = fitCorrection(samples)
    const show = (p) => ({
      name: p.name,
      measured: rgbToHex(p.rgb),
      corrected: rgbToHex(corr.correct(p.rgb)),
      truth: rgbToHex(p.truth),
      dE: deltaE(corr.correctLab(p.rgb), rgbToLab(p.truth)),
    })
    const fitted = [...patches, ...scale6.filter((s) => !s.holdout)].map(show)
    const held = show(scale6.find((s) => s.holdout))
    steps.correction = {
      table: [...patches, ...scale6].map(show),
      meanFitDE: fitted.reduce((s, p) => s + p.dE, 0) / fitted.length,
      holdout: held,
      tone: corr.tone,
      matrix: corr.matrix,
    }

    // 5. self-test
    steps.selfTest = { dE: held.dE, limit: SELF_TEST_MAX_DE, pass: held.dE <= SELF_TEST_MAX_DE }
    if (!steps.selfTest.pass)
      throw new ScanError('selftest', `Colour self-test failed (${held.dE.toFixed(1)} ΔE > ${SELF_TEST_MAX_DE}). Retake in even light.`, steps)

    // 6. dose
    const ink0 = cal.ink0_lab
    const stripLab = corr.correctLab(strip.rgb)
    const refLab = corr.correctLab(reference.rgb)
    const dEs = deltaE(stripLab, ink0)
    const dEr = deltaE(refLab, ink0)
    const net = dEs - dEr
    const dose = Math.max(0, interp(net, cal.x, cal.y))
    steps.dose = {
      strip: { measured: rgbToHex(strip.rgb), corrected: rgbToHex(corr.correct(strip.rgb)), lab: stripLab, dE: dEs },
      reference: { measured: rgbToHex(reference.rgb), corrected: rgbToHex(corr.correct(reference.rgb)), lab: refLab, dE: dEr },
      ink0: rgbToHex(hexToRgb(SPEC.ink.colors[0])),
      net,
      dose,
      curve: cal,
    }

    // 7. checks: shutter, expiry, capacity
    const sd = SPEC.shutterDots
    const dot = (c) => corr.correctLab(sampleRect(flat, [c[0] - sd.r * 0.6, c[1] - sd.r * 0.6, sd.r * 1.2, sd.r * 1.2], { inset: 0 }).rgb)
    const openLab = dot(sd.open), closedLab = dot(sd.closed)
    const isGreen = (l) => l[1] < -20, isRed = (l) => l[1] > 25
    const shutter = isGreen(openLab) && !isRed(closedLab) ? 'open' : isRed(closedLab) && !isGreen(openLab) ? 'closed' : 'unclear'

    const [wx, wy, ww, wh] = SPEC.wick.rect
    const cols = 40
    let filled = 0
    for (let k = 0; k < cols; k++) {
      const x = wx + 0.2 + ((ww - 0.9) * (k + 0.5)) / cols
      const lab = corr.correctLab(sampleRect(flat, [x - 0.1, wy + wh * 0.3, 0.2, wh * 0.4], { inset: 0 }).rgb)
      if (lab[2] < -25) filled = k + 1
      else break
    }
    const wick = filled / cols
    const ageDays = Math.floor((today - new Date(pod.mfgDate)) / 86400000)
    const expired = wick >= 0.95 || ageDays > SPEC.shelf_days
    const capacity = dose / SPEC.capacity_ppmh
    steps.checks = {
      shutter,
      wick,
      ageDays,
      expired,
      capacity,
      retire: capacity >= SPEC.retire_fraction,
    }
    if (expired) throw new ScanError('expired', 'Pod expired: the expiry indicator has reached the line. Replace the pod.', steps)
    if (mode === 'start' && shutter !== 'open')
      throw new ScanError('shutter', 'Shutter is not open (no green dot). Slide the shutter open, then scan again.', steps)

    return { ok: true, pod, dose, mode, steps, warnings: warnings(steps, mode) }
  } finally {
    src.delete()
  }
}

function warnings(steps, mode) {
  const w = []
  if (mode === 'end' && steps.checks.shutter === 'closed') w.push('Shutter already closed at end scan; scan before closing next time.')
  if (steps.checks.retire) w.push('Pod is at or above 80% capacity. Replace it now.')
  return w
}
