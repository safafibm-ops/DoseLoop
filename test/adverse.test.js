// Printed-badge photos taken in hard conditions (see scripts/make_adverse.py).
// npm test runs the fixed set in test/adverse/.
// Big random set:  python3 scripts/make_adverse.py --stress 150 /tmp/stress  then
//                  STRESS_DIR=/tmp/stress npx vitest run test/adverse.test.js
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import jpeg from 'jpeg-js'
import { beforeAll, describe, expect, it } from 'vitest'
import { scanPod } from '../src/scan/pipeline.js'

const DIR = process.env.STRESS_DIR ?? 'test/adverse'
const ONLY = process.env.ONLY
const man = JSON.parse(readFileSync(`${DIR}/manifest.json`, 'utf8'))
// a printout never has exactly the lab colours, so the dose may drift a little
const tol = (d) => Math.max(5, d * 0.2)

let cv
beforeAll(async () => {
  cv = await createRequire(import.meta.url)('@techstark/opencv-js')
}, 120000)

function scan(file) {
  const img = jpeg.decode(readFileSync(`${DIR}/${file}`), { useTArray: true, maxMemoryUsageInMB: 2000 })
  const t = performance.now()
  try {
    const res = scanPod(cv, { data: new Uint8ClampedArray(img.data.buffer), width: img.width, height: img.height }, { mode: 'end', today: new Date('2026-10-03') })
    return { res, ms: performance.now() - t }
  } catch (err) {
    return { err, ms: performance.now() - t }
  }
}

const line = (p, { res, err, ms }) => {
  const st = (res ?? err).steps ?? {}
  return [
    p.file.padEnd(46),
    res ? `dose ${res.dose.toFixed(1).padStart(6)} (true ${String(p.true_dose).padStart(3)})` : `ERROR ${err.code}: ${String(err.message).slice(0, 60)}`,
    st.selfTest ? `self ${st.selfTest.dE.toFixed(1)}` : '',
    st.markers ? `mk${st.markers.tries}` : '',
    st.qr?.tries ? `qr${st.qr.tries}` : '',
    `${Math.round(ms)}ms`,
  ].join(' ')
}

if (process.env.STRESS_DIR) {
  it('stress set', () => {
    const rows = []
    for (const p of man.photos) {
      if (ONLY && !p.file.includes(ONLY)) continue
      const r = scan(p.file)
      rows.push({ p, ...r })
      console.log(line(p, r))
    }
    const ok = rows.filter((r) => r.res)
    const good = ok.filter((r) => Math.abs(r.res.dose - r.p.true_dose) <= tol(r.p.true_dose))
    const codes = {}
    for (const r of rows) if (r.err) codes[r.err.code] = (codes[r.err.code] ?? 0) + 1
    const byCam = {}
    for (const r of rows) {
      const c = (byCam[r.p.camera + ' ' + r.p.sheet] ??= [0, 0])
      c[1]++
      if (r.res) c[0]++
    }
    console.log(`\n${rows.length} photos · read ${ok.length} · dose within max(5, 20%) ${good.length} · errors ${JSON.stringify(codes)}`)
    console.log('by camera/sheet (read/total)', JSON.stringify(byCam))
    console.log('mean |dose error|', (ok.reduce((s, r) => s + Math.abs(r.res.dose - r.p.true_dose), 0) / Math.max(1, ok.length)).toFixed(2))
  }, 3600000)
} else {
  describe('printed badge in hard conditions', () => {
    for (const p of man.photos) {
      if (ONLY && !p.file.includes(ONLY)) continue
      it(`${p.file} (${p.camera})`, () => {
        const r = scan(p.file)
        console.log(line(p, r))
        if (p.expected === 'ok') {
          expect(r.err?.message).toBeUndefined()
          expect(Math.abs(r.res.dose - p.true_dose)).toBeLessThanOrEqual(tol(p.true_dose))
        } else {
          expect(r.err?.code).toBeTruthy()
        }
      }, 60000)
    }
  })
}
