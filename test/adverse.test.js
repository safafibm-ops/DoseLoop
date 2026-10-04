// Printed-badge photos taken in hard conditions (see scripts/make_adverse.py).
// npm test runs the fixed set in test/adverse/.
// Big random set:  python3 scripts/make_adverse.py --stress 150 /tmp/stress  then
//                  STRESS_DIR=/tmp/stress npx vitest run test/adverse.test.js
// Phone vs laptop: python3 scripts/make_adverse.py --gap /tmp/gap 12  then
//                  GAP_DIR=/tmp/gap npx vitest run test/adverse.test.js --silent=false
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import jpeg from 'jpeg-js'
import { beforeAll, describe, expect, it } from 'vitest'
import { scanPod } from '../src/scan/pipeline.js'

const DIR = process.env.STRESS_DIR ?? process.env.GAP_DIR ?? 'test/adverse'
const ONLY = process.env.ONLY
const man = JSON.parse(readFileSync(`${DIR}/manifest.json`, 'utf8'))
// a printout never has exactly the lab colours, so the dose may drift a little
const tol = (d) => Math.max(5, d * 0.2)

let cv
beforeAll(async () => {
  cv = await createRequire(import.meta.url)('@techstark/opencv-js')
}, 120000)

function scan(file) {
  const img = jpeg.decode(readFileSync(file.includes('/') ? file : `${DIR}/${file}`), { useTArray: true, maxMemoryUsageInMB: 2000 })
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
    res ? `± ${res.doseErr?.toFixed(1)}` : '',
    st.sampling?.uneven != null ? `uneven ${st.sampling.uneven.toFixed(1)} blk ${st.sampling.blackSpread.toFixed(1)}` : '',
    st.markers ? `mk${st.markers.tries}` : '',
    st.qr?.tries ? `qr${st.qr.tries}` : '',
    `${Math.round(ms)}ms`,
  ].join(' ')
}

if (process.env.GAP_DIR) {
  it('phone vs laptop gap', () => {
    const memo = {}
    const read = (f) => {
      if (!(f in memo)) {
        const r = scan(f)
        memo[f] = r.res ? { dose: r.res.dose, doseErr: r.res.doseErr } : null
        if (r.err) console.log(`  ${f}: ${r.err.code} ${r.err.message.slice(0, 80)}`)
      }
      return memo[f]
    }
    const shift = (a, b) => {
      const s = read(a), e = read(b)
      if (!s || !e) return null
      return { dose: e.dose - s.dose, err: Math.hypot(s.doseErr ?? 0, e.doseErr ?? 0) }
    }
    const rows = []
    for (const p of man.pairs) {
      const phone = shift(p.start, p.end)
      const laptop =
        p.kind === 'screen'
          ? shift(p.laptop_start, p.laptop_end)
          : shift(...['start', 'end'].map((w) => man.pairs.find((q) => q.kind === 'print' && q.scene === p.scene && q.camera === 'webcam-1080p')[w]))
      if (p.kind === 'print' && p.camera === 'webcam-1080p') continue
      const gap = phone && laptop ? phone.dose - laptop.dose : null
      const inRange = phone && laptop ? Math.abs(gap) <= Math.hypot(phone.err, laptop.err) : null
      rows.push({ p, phone, laptop, gap, inRange })
      const f = (x) => (x ? `${x.dose.toFixed(1)} ± ${x.err.toFixed(1)}` : 'retake').padStart(12)
      console.log(`${p.kind.padEnd(6)} scene ${String(p.scene).padStart(2)} ${p.camera.padEnd(13)} laptop ${f(laptop)}  phone ${f(phone)}  gap ${gap == null ? '-' : gap.toFixed(1)}`)
    }
    for (const kind of ['print', 'screen']) {
      const r = rows.filter((x) => x.p.kind === kind)
      const g = r.filter((x) => x.gap != null)
      const abs = g.map((x) => Math.abs(x.gap)).sort((a, b) => a - b)
      console.log(
        `${kind}: ${r.length} pairs · both read ${g.length} · retake ${r.length - g.length}` +
          ` · mean |gap| ${(abs.reduce((s, x) => s + x, 0) / Math.max(1, abs.length)).toFixed(2)} · max ${abs.at(-1)?.toFixed(2)}` +
          ` · gap inside the ± ranges ${g.filter((x) => x.inRange).length}/${g.length}`,
      )
    }
  }, 3600000)
} else if (process.env.STRESS_DIR) {
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
