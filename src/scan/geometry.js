// Small geometry helpers (no OpenCV needed): homography from 4 point pairs, mapping points through it.

/** 3x3 homography H with H·src[i] ≈ dst[i] for 4 point pairs [[x, y], …]. Returns null if degenerate. */
export function homography(src, dst) {
  const A = []
  for (let i = 0; i < 4; i++) {
    const [x, y] = src[i], [u, v] = dst[i]
    A.push([x, y, 1, 0, 0, 0, -u * x, -u * y, u])
    A.push([0, 0, 0, x, y, 1, -v * x, -v * y, v])
  }
  // Gaussian elimination with partial pivoting on the 8x9 system
  for (let c = 0; c < 8; c++) {
    let p = c
    for (let r = c + 1; r < 8; r++) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r
    if (Math.abs(A[p][c]) < 1e-12) return null
    ;[A[c], A[p]] = [A[p], A[c]]
    for (let r = 0; r < 8; r++) {
      if (r === c) continue
      const f = A[r][c] / A[c][c]
      for (let k = c; k < 9; k++) A[r][k] -= f * A[c][k]
    }
  }
  const h = A.map((row, i) => row[8] / row[i])
  return [
    [h[0], h[1], h[2]],
    [h[3], h[4], h[5]],
    [h[6], h[7], 1],
  ]
}

export function apply(H, [x, y]) {
  const w = H[2][0] * x + H[2][1] * y + H[2][2]
  return [(H[0][0] * x + H[0][1] * y + H[0][2]) / w, (H[1][0] * x + H[1][1] * y + H[1][2]) / w]
}

/** How much H scales area at point (x, y): |det of the Jacobian|. */
export function areaScale(H, [x, y]) {
  const w = H[2][0] * x + H[2][1] * y + H[2][2]
  const [u, v] = apply(H, [x, y])
  const a = (H[0][0] - u * H[2][0]) / w, b = (H[0][1] - u * H[2][1]) / w
  const c = (H[1][0] - v * H[2][0]) / w, d = (H[1][1] - v * H[2][1]) / w
  return Math.abs(a * d - b * c)
}

/** Points sorted clockwise on screen (y down) around their centre. */
export function clockwise(pts, get = (p) => p) {
  const cx = pts.reduce((s, p) => s + get(p)[0], 0) / pts.length
  const cy = pts.reduce((s, p) => s + get(p)[1], 0) / pts.length
  return pts.slice().sort((p, q) => Math.atan2(get(p)[1] - cy, get(p)[0] - cx) - Math.atan2(get(q)[1] - cy, get(q)[0] - cx))
}

/** Signed area of a polygon; positive = clockwise on screen. 0 if it is not convex. */
export function convexArea(pts) {
  let area = 0
  for (let k = 0; k < pts.length; k++) {
    const p = pts[k], q = pts[(k + 1) % pts.length], r = pts[(k + 2) % pts.length]
    if ((q[0] - p[0]) * (r[1] - q[1]) - (q[1] - p[1]) * (r[0] - q[0]) <= 0) return 0
    area += p[0] * q[1] - q[0] * p[1]
  }
  return area / 2
}
