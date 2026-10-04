// The scan pipeline: photo of a pod -> verified, colour-corrected dose in ppm·hr.
// Pure functions: give it OpenCV (cv) and an ImageData-like {data, width, height}.
// Every step returns pictures/numbers so the UI can show the whole process.

import nacl from 'tweetnacl'
import SPEC from './podSpec.json'
import PUBLIC_KEY from './publicKey.json'
import C1 from './calibration/C1.json'
import { evenLight } from './light.js'
import { findMarkers } from './markers.js'
import { orient, readQr } from './qr.js'
import { deltaE, fitCorrection, hexToRgb, interp, rgbToHex, rgbToLab, toSrgb } from './color.js'

const CALIBRATIONS = { C1 }
const PPM = 20 // pixels per mm in the flat (warped) pod view
const WORK_SIDE = 1600 // markers are found on a copy at most this big
const FULL_SIDE = 3200 // the QR and colours are read from the photo at up to this size
const SELF_TEST_MAX_DE = 3 // held-out brown within this: full confidence
const SELF_TEST_RETAKE_DE = 6 // above this: retake. In between: the reading is kept, flagged as less certain
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
function sampleRect(flat, rect, { inset = 0.2, holes = [], holeR = 0, raw = flat } = {}) {
  const [x, y, w, h] = rect
  const x0 = Math.round((x + w * inset) * PPM), x1 = Math.round((x + w * (1 - inset)) * PPM)
  const y0 = Math.round((y + h * inset) * PPM), y1 = Math.round((y + h * (1 - inset)) * PPM)
  const px = []
  let clipped = 0
  for (let yy = y0; yy < y1; yy++)
    for (let xx = x0; xx < x1; xx++) {
      const mx = xx / PPM, my = yy / PPM
      if (holes.some(([cx, cy]) => (mx - cx) ** 2 + (my - cy) ** 2 < holeR * holeR)) continue
      const i = (yy * flat.width + xx) * 4
      px.push([flat.data[i], flat.data[i + 1], flat.data[i + 2]])
      // over-exposure is judged on the photo itself, before the light was evened out
      if (Math.max(raw.data[i], raw.data[i + 1], raw.data[i + 2]) >= CLIP_LEVEL) clipped++
    }
  const lum = px.map((p) => p[0] + p[1] + p[2])
  const ml = median(lum)
  const keep = px.filter((_, i) => Math.abs(lum[i] - ml) < 60)
  const rgb = [0, 1, 2].map((c) => median(keep.map((p) => p[c])))
  return { rgb, clipped: clipped / Math.max(1, px.length), n: keep.length, rect }
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
// RFC 4648 base32 (no padding) -> bytes
function base32(text) {
  const A = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
  const out = []
  let bits = 0, value = 0
  for (const ch of text) {
    const v = A.indexOf(ch)
    if (v < 0) throw new Error('bad base32')
    value = (value << 5) | v
    bits += 5
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255)
      bits -= 8
    }
  }
  return Uint8Array.from(out)
}

/**
 * Checks the pod's QR text. Two formats:
 *  DL2:serial:batch:date:cal:<signature in base32>   (current: compact QR)
 *  DL1|serial|batch|date|cal|<signature in base64>   (first printed batch)
 */
export function verifyPayload(text) {
  const v2 = text.startsWith('DL2:')
  const parts = text.split(v2 ? ':' : '|')
  if (parts.length !== 6 || (parts[0] !== 'DL1' && parts[0] !== 'DL2')) return { valid: false, reason: 'Not a DoseLoop pod code' }
  const [, serial, batch, mfgDate, cal, sigText] = parts
  const msg = new TextEncoder().encode(parts.slice(0, 5).join(v2 ? ':' : '|'))
  let valid = false
  try {
    const sig = v2 ? base32(sigText) : Uint8Array.from(atob(sigText), (c) => c.charCodeAt(0))
    const key = Uint8Array.from(atob(PUBLIC_KEY.key), (c) => c.charCodeAt(0))
    valid = sig.length === 64 && nacl.sign.detached.verify(msg, sig, key)
  } catch {
    valid = false
  }
  return { valid, serial, batch, mfgDate, cal, reason: valid ? 'Signature valid' : 'Signature does not match: copied or fake pod' }
}

// ---------- main ----------
const DISPLAY_SIDE = 900 // photos sent to the screen are at most this big

/** Small copy of an image for the screen (keeps memory low on phones). */
function displayImage(cv, mat) {
  const k = Math.min(1, DISPLAY_SIDE / Math.max(mat.cols, mat.rows))
  if (k === 1) return matToImage(cv, mat)
  const small = new cv.Mat()
  cv.resize(mat, small, new cv.Size(Math.round(mat.cols * k), Math.round(mat.rows * k)), 0, 0, cv.INTER_AREA)
  const img = matToImage(cv, small)
  small.delete()
  return img
}

/** Whole flat pod view with the colour correction applied (lookup tables keep it fast). */
function correctImage(img, corr) {
  const tone = corr.toneLut
  const N = 4096
  const toS = Uint8ClampedArray.from({ length: N + 1 }, (_, i) => Math.round(toSrgb(i / N)))
  const M = corr.matrix
  const out = new Uint8ClampedArray(img.data.length)
  const d = img.data
  for (let i = 0; i < d.length; i += 4) {
    const r = tone[0][d[i]], g = tone[1][d[i + 1]], b = tone[2][d[i + 2]]
    for (let ch = 0; ch < 3; ch++) {
      const v = M[ch][0] * r + M[ch][1] * g + M[ch][2] * b
      out[i + ch] = toS[Math.round(Math.min(1, Math.max(0, v)) * N)]
    }
    out[i + 3] = 255
  }
  return { data: out, width: img.width, height: img.height }
}

// copy of an image at most `side` px on its long side
function shrink(cv, m, side) {
  const k = side / Math.max(m.cols, m.rows)
  if (k >= 1) return m.clone()
  const out = new cv.Mat()
  cv.resize(m, out, new cv.Size(Math.round(m.cols * k), Math.round(m.rows * k)), 0, 0, cv.INTER_AREA)
  return out
}

/** Every stage in order. The screen uses these names to show live progress. */
export const STAGES = ['photo', 'markers', 'flat', 'qr', 'sampling', 'correction', 'selfTest', 'dose', 'checks']

/**
 * The pipeline as a series of stages: yields { stage, data } after each one, so a screen can show
 * the work as it happens. Returns the final result; throws ScanError (with the steps so far) on failure.
 */
export function* scanStages(cv, imageData, { mode = 'start', today = new Date() } = {}) {
  const steps = {}
  const done = (stage, data) => {
    steps[stage] = data
    return { stage, data }
  }
  if (!imageData?.width || !imageData?.height || imageData.data?.length !== imageData.width * imageData.height * 4)
    throw new ScanError('image', 'That file is not a readable photo. Try another one.', steps)
  if (Math.min(imageData.width, imageData.height) < 240)
    throw new ScanError('image', 'Photo is too small. Use the full camera resolution and retake.', steps)

  // full = the photo at up to 3200 px (QR + colours); work = a copy at up to 1600 px (markers, screen)
  const input = cv.matFromImageData(imageData)
  const full = shrink(cv, input, FULL_SIDE)
  input.delete()
  const work = shrink(cv, full, WORK_SIDE)
  const gray = new cv.Mat()
  cv.cvtColor(work, gray, cv.COLOR_RGBA2GRAY)
  const k = full.cols / work.cols // work -> full coordinates
  const nx = (x) => x / work.cols, ny = (y) => y / work.rows

  try {
    yield done('photo', { image: displayImage(cv, work) })

    // 1. markers -> which way up -> flat view
    const { markers, candidates, found, tries } = findMarkers(cv, gray)
    const boxes = candidates.map((c) => [nx(c.rect.x), ny(c.rect.y), nx(c.rect.width), ny(c.rect.height)])
    if (!markers) {
      yield done('markers', { found, boxes, quad: null, tries })
      throw new ScanError(
        'markers',
        found === 3
          ? 'Only 3 of the 4 corner markers are in view. Move back a little so the whole pod is in the photo, and retake.'
          : 'Could not find the 4 corner markers. Fill the frame with the pod, hold steady, and retake.',
        steps,
      )
    }
    yield done('markers', { found: 4, boxes, quad: markers.map(([x, y]) => [nx(x), ny(y)]), tries })

    // the QR corner tells which way up the pod is; try the other way too if it can't be read
    const up = orient(cv, gray, markers)
    const ways = [up, [up[2], up[3], up[0], up[1]]]
    let qr = null
    let imgPts = up
    let qrTries = 0
    for (const way of ways) {
      const r = readQr(cv, full, way.map(([x, y]) => [x * k, y * k]))
      qrTries += r.tries
      if (!qr) qr = r
      if (r.code) {
        qr = r
        imgPts = way
        break
      }
    }
    qr.tries = qrTries
    const dist = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1])
    const W = SPEC.size_mm[0] * PPM, H = SPEC.size_mm[1] * PPM
    const flatMat = warp(cv, full, imgPts.map(([x, y]) => [x * k, y * k]), SPEC.markers.centers.map(([x, y]) => [x * PPM, y * PPM]), [W, H])
    const flat = matToImage(cv, flatMat)
    flatMat.delete()
    // how much the photo was turned and tilted (top edge of the pod vs horizontal; side ratio)
    const rotation = (Math.atan2(imgPts[1][1] - imgPts[0][1], imgPts[1][0] - imgPts[0][0]) * 180) / Math.PI
    const top = dist(imgPts[0], imgPts[1]), bottom = dist(imgPts[3], imgPts[2])
    const left = dist(imgPts[0], imgPts[3]), right = dist(imgPts[1], imgPts[2])
    const tilt = Math.max(top / bottom, bottom / top, left / right, right / left) - 1
    yield done('flat', { image: flat, rotation, tilt, corners: imgPts.map(([x, y]) => [nx(x), ny(y)]) })

    // 2. QR + signature
    if (!qr.code) {
      yield done('qr', { image: qr.image, text: null, tries: qr.tries })
      throw new ScanError('qr', 'Could not read the QR code. Move closer, avoid blur, and retake.', steps)
    }
    const pod = verifyPayload(qr.code.data)
    yield done('qr', { image: qr.image, text: qr.code.data, tries: qr.tries, how: qr.how, ...pod })
    if (!pod.valid) throw new ScanError('fake', `Pod rejected: ${pod.reason}.`, steps)
    const cal = CALIBRATIONS[pod.cal]
    if (!cal) throw new ScanError('cal', `No calibration "${pod.cal}" in this app version.`, steps)

    // 3. even out the light across the pod, then sample patches
    const light = evenLight(flat, PPM)
    const even = light.image
    const at = (rect, opts) => sampleRect(even, rect, { ...opts, raw: flat })
    const P = SPEC.patches
    const patches = P.names.map((name, k) => {
      const r = Math.floor(k / P.cols), q = k % P.cols
      const rect = [P.x + q * (P.cell + P.gap), P.y + r * (P.cell + P.gap), P.cell, P.cell]
      return { name, truth: hexToRgb(P.colors[k]), neutral: P.neutrals.includes(name), ...at(rect) }
    })
    const S = SPEC.scale
    const scale6 = S.doses.map((dose, k) => {
      const rect = [S.x + k * (S.w + S.gap), S.y, S.w, S.h]
      return { name: `${dose} ppm·hr`, dose, truth: hexToRgb(SPEC.ink.colors[SPEC.ink.doses.indexOf(dose)]), holdout: k === S.holdout, ...at(rect) }
    })
    const strip = at(SPEC.strip, { inset: 0.08, holes: dotCenters(SPEC.strip), holeR: 0.85 })
    const reference = at(SPEC.reference, { inset: 0.08, holes: dotCenters(SPEC.reference), holeR: 0.95 })
    // the black of the corner markers: the darkest known colour, pins the bottom of the tone curve
    const mk = SPEC.markers
    const mid = (mk.size + mk.inner) / 4
    const band = (mk.size - mk.inner) / 8
    const ring = mk.centers.flatMap(([cx, cy]) => [
      [cx - mid, cy - mid - band, 2 * mid, 2 * band],
      [cx - mid, cy + mid - band, 2 * mid, 2 * band],
      [cx - mid - band, cy - mid, 2 * band, 2 * mid],
      [cx + mid - band, cy - mid, 2 * band, 2 * mid],
    ]).map((r) => at(r, { inset: 0 }).rgb)
    const black = [0, 1, 2].map((c) => median(ring.map((v) => v[c])))

    // glare on the strip, the reference or the browns spoils the reading; a bright patch that is
    // over-exposed (common for the white patch on a bright day) is just left out of the fit
    const over = (p) => p.clipped > CLIP_MAX_FRACTION
    const critical = [...scale6, strip, reference].filter(over)
    const skipped = patches.filter(over)
    const glare = [...critical, ...skipped]
    yield done('sampling', {
      patches,
      scale: scale6,
      strip,
      reference,
      even,
      lightSpread: light.spread,
      glare: critical.length + (skipped.length > 3 ? skipped.length : 0),
      skipped: skipped.map((p) => p.name),
      glareRects: glare.map((g) => g.rect),
      size: SPEC.size_mm,
    })
    if (critical.length || skipped.length > 3)
      throw new ScanError('glare', 'Glare or overexposure on the pod. Tilt the phone slightly or move out of direct light, then retake.', steps)

    // 4. colour correction (browns weighted 3x, held-out brown not used)
    const samples = [
      ...patches.filter((p) => !over(p)).map((p) => ({ measured: p.rgb, truth: p.truth, tone: p.neutral, weight: 1 })),
      ...scale6.filter((s) => !s.holdout).map((s) => ({ measured: s.rgb, truth: s.truth, tone: false, weight: 3 })),
      { measured: black, truth: hexToRgb(SPEC.black), tone: true, weight: 1 },
      // the pod's plain background: a big, well-lit grey that every photo has
      ...(light.background && light.clipped < 0.1 ? [{ measured: light.background, truth: hexToRgb(SPEC.background), tone: true, weight: 2 }] : []),
    ]
    const corr = fitCorrection(samples)
    if (![...corr.matrix.flat(), ...corr.toneLut.flatMap((t) => [...t])].every(Number.isFinite))
      throw new ScanError('selftest', 'Colour correction could not be fitted. Retake in even light.', steps)
    const show = (p) => ({
      name: p.name,
      measured: rgbToHex(p.rgb),
      corrected: rgbToHex(corr.correct(p.rgb)),
      truth: rgbToHex(p.truth),
      dE: deltaE(corr.correctLab(p.rgb), rgbToLab(p.truth)),
    })
    const fitted = [...patches, ...scale6.filter((s) => !s.holdout)].map(show)
    const held = show(scale6.find((s) => s.holdout))
    yield done('correction', {
      table: [...patches, ...scale6].map(show),
      meanFitDE: fitted.reduce((s, p) => s + p.dE, 0) / fitted.length,
      // the same before the local fix (tone curve + matrix only)
      meanGlobalDE: [...patches, ...scale6.filter((s) => !s.holdout)].reduce((s, p) => s + deltaE(corr.globalLab(p.rgb), rgbToLab(p.truth)), 0) / fitted.length,
      holdout: held,
      matrix: corr.matrix,
      image: correctImage(even, corr),
    })

    // 5. self-test
    yield done('selfTest', {
      dE: held.dE,
      limit: SELF_TEST_MAX_DE,
      retake: SELF_TEST_RETAKE_DE,
      good: held.dE <= SELF_TEST_MAX_DE,
      pass: held.dE <= SELF_TEST_RETAKE_DE,
      holdout: held,
    })
    if (!steps.selfTest.pass)
      throw new ScanError('selftest', `Colour self-test failed (${held.dE.toFixed(1)} ΔE > ${SELF_TEST_RETAKE_DE}). Retake in even light.`, steps)

    // 6. dose
    const ink0 = cal.ink0_lab
    const stripLab = corr.correctLab(strip.rgb)
    const refLab = corr.correctLab(reference.rgb)
    const dEs = deltaE(stripLab, ink0)
    const dEr = deltaE(refLab, ink0)
    const net = dEs - dEr
    const dose = Math.max(0, interp(net, cal.x, cal.y))
    yield done('dose', {
      strip: { measured: rgbToHex(strip.rgb), corrected: rgbToHex(corr.correct(strip.rgb)), lab: stripLab, dE: dEs },
      reference: { measured: rgbToHex(reference.rgb), corrected: rgbToHex(corr.correct(reference.rgb)), lab: refLab, dE: dEr },
      ink0: rgbToHex(hexToRgb(SPEC.ink.colors[0])),
      net,
      dose,
      curve: cal,
    })

    // 7. checks: shutter, expiry, capacity
    const sd = SPEC.shutterDots
    const dot = (c) => corr.correctLab(at([c[0] - sd.r * 0.6, c[1] - sd.r * 0.6, sd.r * 1.2, sd.r * 1.2], { inset: 0 }).rgb)
    const openLab = dot(sd.open), closedLab = dot(sd.closed)
    const isGreen = (l) => l[1] < -20, isRed = (l) => l[1] > 25
    const shutter = isGreen(openLab) && !isRed(closedLab) ? 'open' : isRed(closedLab) && !isGreen(openLab) ? 'closed' : 'unclear'

    const [wx, wy, ww, wh] = SPEC.wick.rect
    const cols = 40
    let filled = 0
    for (let k = 0; k < cols; k++) {
      const x = wx + 0.2 + ((ww - 0.9) * (k + 0.5)) / cols
      const lab = corr.correctLab(at([x - 0.1, wy + wh * 0.3, 0.2, wh * 0.4], { inset: 0 }).rgb)
      if (lab[2] < -25) filled = k + 1
      else break
    }
    const wick = filled / cols
    const ageDays = Math.floor((today - new Date(pod.mfgDate)) / 86400000)
    const expired = wick >= 0.95 || ageDays > SPEC.shelf_days
    const capacity = dose / SPEC.capacity_ppmh
    yield done('checks', { shutter, wick, ageDays, expired, capacity, retire: capacity >= SPEC.retire_fraction })
    if (expired) throw new ScanError('expired', 'Pod expired: the expiry indicator has reached the line. Replace the pod.', steps)
    if (mode === 'start' && shutter !== 'open')
      throw new ScanError('shutter', 'Shutter is not open (no green dot). Slide the shutter open, then scan again.', steps)

    return { ok: true, pod, dose, mode, steps, warnings: warnings(steps, mode) }
  } finally {
    full.delete()
    work.delete()
    gray.delete()
  }
}

/** Runs every stage at once (tests and simple callers). */
export function scanPod(cv, imageData, opts) {
  const it = scanStages(cv, imageData, opts)
  for (;;) {
    const r = it.next()
    if (r.done) return r.value
  }
}

function warnings(steps, mode) {
  const w = []
  if (!steps.selfTest.good)
    w.push(`Colour self-test ${steps.selfTest.dE.toFixed(1)} ΔE (best under ${SELF_TEST_MAX_DE}): this reading is less certain. Scan in even, bright light for full accuracy.`)
  if (mode === 'end' && steps.checks.shutter === 'closed') w.push('Shutter already closed at end scan; scan before closing next time.')
  if (steps.checks.retire) w.push('Pod is at or above 80% capacity. Replace it now.')
  return w
}

/**
 * Quick look for the live camera (a few times a second): is a pod in view, and can its QR be read?
 * Returns { found: 0-4 markers, quad: corners (0-1) or null, qr: read?, genuine: signature ok?, size }.
 */
export function probePod(cv, imageData) {
  const input = cv.matFromImageData(imageData)
  const full = shrink(cv, input, FULL_SIDE)
  input.delete()
  const work = shrink(cv, full, 960)
  const gray = new cv.Mat()
  cv.cvtColor(work, gray, cv.COLOR_RGBA2GRAY)
  try {
    const { markers, found } = findMarkers(cv, gray, { maxTries: 4 })
    if (!markers) return { found, quad: null, qr: false, genuine: false, size: 0 }
    const quad = markers.map(([x, y]) => [x / work.cols, y / work.rows])
    let area = 0
    for (let i = 0; i < 4; i++) area += quad[i][0] * quad[(i + 1) % 4][1] - quad[(i + 1) % 4][0] * quad[i][1]
    const k = full.cols / work.cols
    const up = orient(cv, gray, markers)
    for (const way of [up, [up[2], up[3], up[0], up[1]]]) {
      const r = readQr(cv, full, way.map(([x, y]) => [x * k, y * k]), { sizes: [28] })
      if (r.code) return { found: 4, quad, qr: true, genuine: verifyPayload(r.code.data).valid, size: Math.abs(area) / 2 }
    }
    return { found: 4, quad, qr: false, genuine: false, size: Math.abs(area) / 2 }
  } finally {
    full.delete()
    work.delete()
    gray.delete()
  }
}
