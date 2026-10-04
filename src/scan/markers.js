// Finds the pod's 4 corner markers (black squares with a white square hole) in a photo.
//
// Robust to: strong perspective (markers of very different sizes), a sheet with many pods on it,
// dim or uneven light, blur and low resolution. How:
//  1. collect marker-shaped blobs with several threshold settings (stop as soon as a pod is found)
//  2. try every group of 4 blobs and keep groups whose marker sizes match what the pod's real
//     geometry predicts for that perspective (a group made of markers from 2 different pods,
//     or of other square-ish things, fails this test)
//  3. if several pods fit, take the biggest one nearest the middle of the photo

import SPEC from './podSpec.json'
import { areaScale, clockwise, convexArea, homography } from './geometry.js'

const CENTERS = SPEC.markers.centers // mm, clockwise from top-left
const MARKER_AREA = SPEC.markers.size ** 2 // mm²

// Threshold settings, tried in order. scale < 1 runs on a smaller copy (helps big blurry markers).
export const MARKER_TRIES = [
  { div: 25, c: 10 },
  { div: 40, c: 8 },
  { div: 15, c: 12 },
  { div: 25, c: 6, eq: true },
  { div: 25, c: 8, scale: 0.5 },
  { div: 12, c: 5, eq: true },
  { div: 25, c: 4 },
]

/**
 * gray: 1-channel cv.Mat. Returns { markers: [[x,y]×4] matching SPEC.markers.centers order (up to a
 * half turn), candidates: [{x,y,area,rect}], found: 0-4, tries }.
 * maxTries limits the work (the live camera uses fewer tries per frame).
 */
export function findMarkers(cv, gray, { maxTries = MARKER_TRIES.length } = {}) {
  let all = []
  let best = { found: 0 }
  const W = gray.cols, H = gray.rows
  for (let t = 0; t < Math.min(maxTries, MARKER_TRIES.length); t++) {
    const cands = candidatesWith(cv, gray, MARKER_TRIES[t])
    all = merge(all, cands)
    const g = group(all, W, H)
    if (g.markers) return { ...g, candidates: all, tries: t + 1 }
    if (g.found > best.found) best = g
  }
  return { markers: null, found: best.found, candidates: all, tries: Math.min(maxTries, MARKER_TRIES.length) }
}

function candidatesWith(cv, gray, { div, c, eq, scale = 1 }) {
  let img = gray
  const own = []
  if (scale !== 1) {
    img = new cv.Mat()
    cv.resize(gray, img, new cv.Size(Math.round(gray.cols * scale), Math.round(gray.rows * scale)), 0, 0, cv.INTER_AREA)
    own.push(img)
  }
  if (eq) {
    const e = new cv.Mat()
    cv.equalizeHist(img, e)
    own.push(e)
    img = e
  }
  try {
    return blobs(cv, img, div, c).map((b) => ({
      ...b,
      x: b.x / scale,
      y: b.y / scale,
      area: b.area / scale ** 2,
      rect: { x: b.rect.x / scale, y: b.rect.y / scale, width: b.rect.width / scale, height: b.rect.height / scale },
    }))
  } finally {
    own.forEach((m) => m.delete())
  }
}

// marker-shaped blobs: a convex 4-sided outline with exactly one 4-sided hole in its middle
function blobs(cv, gray, div, C) {
  const bin = new cv.Mat()
  const block = Math.max(3, Math.round(Math.max(gray.cols, gray.rows) / div) | 1)
  cv.adaptiveThreshold(gray, bin, 255, cv.ADAPTIVE_THRESH_MEAN_C, cv.THRESH_BINARY_INV, block, C)
  const contours = new cv.MatVector()
  const hier = new cv.Mat()
  cv.findContours(bin, contours, hier, cv.RETR_TREE, cv.CHAIN_APPROX_SIMPLE)
  const Hh = (i) => hier.intPtr(0, i) // [next, prev, firstChild, parent]
  const quad = (c) => {
    const approx = new cv.Mat()
    cv.approxPolyDP(c, approx, 0.06 * cv.arcLength(c, true), true)
    const ok = approx.rows === 4 && cv.isContourConvex(approx)
    approx.delete()
    return ok
  }
  const minArea = Math.max(36, (Math.min(gray.cols, gray.rows) * 0.008) ** 2)
  const maxArea = (Math.min(gray.cols, gray.rows) * 0.35) ** 2
  const out = []
  for (let i = 0; i < contours.size(); i++) {
    const c = contours.get(i)
    const area = cv.contourArea(c)
    if (area < minArea || area > maxArea || !quad(c)) continue
    const child = Hh(i)[2]
    if (child < 0 || Hh(child)[0] >= 0 || Hh(child)[2] >= 0) continue // exactly one hole, with nothing inside
    const cc = contours.get(child)
    const ratio = cv.contourArea(cc) / area
    if (ratio < 0.1 || ratio > 0.38 || !quad(cc)) continue
    const m = cv.moments(c)
    const mc = cv.moments(cc)
    const x = m.m10 / m.m00, y = m.m01 / m.m00
    // the hole must sit in the middle (rules out printed digits inside colour patches)
    if (Math.hypot(mc.m10 / mc.m00 - x, mc.m01 / mc.m00 - y) > 0.15 * Math.sqrt(area)) continue
    out.push({ area, x, y, rect: cv.boundingRect(c) })
  }
  bin.delete(); contours.delete(); hier.delete()
  return out
}

// add new blobs, skipping ones already found by an earlier threshold setting
function merge(list, add) {
  const out = list.slice()
  for (const b of add) {
    const same = out.find((a) => Math.hypot(a.x - b.x, a.y - b.y) < 0.35 * Math.sqrt(Math.min(a.area, b.area)))
    if (!same) out.push(b)
  }
  return out
}

// ---------- choosing the 4 markers of one pod ----------
const MAX_CANDS = 32
const SIZE_TOL = Math.log(1.8) // marker area may differ from the prediction by this factor
const EDGE_TOL = Math.log(1.32) // distance between markers, in marker sides, may differ by this factor

/** Best group of 4 blobs that fits the pod's geometry. */
export function group(cands, W, H) {
  const c = cands.slice().sort((a, b) => b.area - a.area).slice(0, MAX_CANDS)
  const n = c.length
  // pairs that could be corners of the same pod: distance 4-40 marker sides, sizes within 8x
  const ok = c.map((a) => c.map((b) => {
    if (a === b) return false
    const side = Math.sqrt(Math.max(a.area, b.area))
    const d = Math.hypot(a.x - b.x, a.y - b.y) / side
    return d > 4 && d < 40 && Math.max(a.area, b.area) / Math.min(a.area, b.area) < 8
  }))
  let found = n ? 1 : 0
  const fits = []
  for (let i = 0; i < n; i++)
    for (let j = i + 1; j < n; j++) {
      if (!ok[i][j]) continue
      found = Math.max(found, 2)
      for (let k = j + 1; k < n; k++) {
        if (!ok[i][k] || !ok[j][k]) continue
        found = Math.max(found, 3)
        for (let l = k + 1; l < n; l++) {
          if (!ok[i][l] || !ok[j][l] || !ok[k][l]) continue
          const f = fit([c[i], c[j], c[k], c[l]])
          if (f) fits.push(f)
        }
      }
    }
  if (!fits.length) return { markers: null, found }
  // biggest pods first; among similar sizes, the one nearest the middle of the photo
  const maxSpan = Math.max(...fits.map((f) => f.span))
  const diag = Math.hypot(W, H)
  const score = (f) => (f.span / maxSpan) * 0.6 - (Math.hypot(f.cx - W / 2, f.cy - H / 2) / diag) * 1.2 - f.err * 0.15
  const best = fits.reduce((a, b) => (score(b) > score(a) ? b : a))
  return { markers: best.pts, found: 4, err: best.err }
}

// Does this group of 4 look like one pod? Returns its corner order and fit error, or null.
function fit(g) {
  const o = clockwise(g, (p) => [p.x, p.y])
  const pts = o.map((p) => [p.x, p.y])
  const span = convexArea(pts)
  if (!span) return null
  let best = null
  for (let r = 0; r < 4; r++) {
    // o[i] is the marker at CENTERS[(i + r) % 4]
    const order = [0, 1, 2, 3].map((k) => (k - r + 4) % 4) // index into o for CENTERS[k]
    const Hm = homography(CENTERS, order.map((i) => pts[i]))
    if (!Hm) continue
    let err = 0
    for (let k = 0; k < 4; k++) {
      // marker size vs what this perspective predicts
      const expected = MARKER_AREA * areaScale(Hm, CENTERS[k])
      err = Math.max(err, Math.abs(Math.log(o[order[k]].area / expected)))
      // edge length in "marker sides" vs the real pod (41 x 27 mm = 13.7 x 9 sides): rules out
      // a group made of the bottom markers of one pod and the top markers of the next one
      const a = o[order[k]], b = o[order[(k + 1) % 4]]
      const sides = Math.hypot(a.x - b.x, a.y - b.y) / ((Math.sqrt(a.area) + Math.sqrt(b.area)) / 2)
      const real = Math.hypot(CENTERS[k][0] - CENTERS[(k + 1) % 4][0], CENTERS[k][1] - CENTERS[(k + 1) % 4][1]) / SPEC.markers.size
      err = Math.max(err, Math.abs(Math.log(sides / real)) * (SIZE_TOL / EDGE_TOL))
    }
    if (err < SIZE_TOL && (!best || err < best.err)) best = { err, pts: order.map((i) => pts[i]) }
  }
  if (!best) return null
  return { ...best, span, cx: pts.reduce((s, p) => s + p[0], 0) / 4, cy: pts.reduce((s, p) => s + p[1], 0) / 4 }
}
