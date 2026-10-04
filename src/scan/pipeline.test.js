// Runs the real pipeline on every sample photo and checks the result.
// Run: npm test
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import jpeg from 'jpeg-js'
import { beforeAll, describe, expect, it } from 'vitest'
import { scanPod, scanStages, STAGES, verifyPayload } from './pipeline.js'
import manifest from '../../public/samples/manifest.json'

let cv
beforeAll(async () => {
  // In Node, OpenCV.js is a CommonJS module that exports a promise
  cv = await createRequire(import.meta.url)('@techstark/opencv-js')
}, 120000)

const TODAY = new Date('2026-10-03')

describe('sample photos', () => {
  for (const s of manifest.samples) {
    it(`${s.file}: ${s.title}`, () => {
      const img = jpeg.decode(readFileSync(`public/samples/${s.file}`), { useTArray: true })
      let res, err
      try {
        res = scanPod(cv, { data: new Uint8ClampedArray(img.data), width: img.width, height: img.height }, { mode: 'start', today: TODAY })
      } catch (e) {
        err = e
      }
      const st = (res ?? err).steps ?? {}
      console.log(
        s.file.padEnd(24),
        res ? `dose ${res.dose.toFixed(1)} ± ${res.doseErr.toFixed(1)} (true ${s.true_dose})` : `ERROR ${err.code}: ${err.message}`,
        st.sampling?.uneven != null ? `uneven ${st.sampling.uneven.toFixed(2)}` : '',
        st.selfTest ? `selftest ${st.selfTest.dE.toFixed(2)}` : '',
        st.correction ? `fit ${st.correction.meanFitDE.toFixed(2)}` : '',
        st.checks ? `shutter ${st.checks.shutter} wick ${st.checks.wick.toFixed(2)}` : '',
      )
      if (s.expected === 'ok') {
        expect(err?.message).toBeUndefined()
        expect(Math.abs(res.dose - s.true_dose)).toBeLessThan(Math.max(4, s.true_dose * 0.15))
      } else {
        const code = { retake: 'glare', fake: 'fake', shutter: 'shutter', expired: 'expired' }[s.expected]
        expect(err?.code).toBe(code)
      }
    })
  }
})

// ---------- robustness: the same pod photo turned, shrunk, or broken ----------
const load = (file) => {
  const img = jpeg.decode(readFileSync(`public/samples/${file}`), { useTArray: true })
  return { data: new Uint8ClampedArray(img.data), width: img.width, height: img.height }
}

// turn an RGBA image by 90° clockwise `times` times
function rotate(img, times) {
  let cur = img
  for (let t = 0; t < times; t++) {
    const { width: w, height: h, data } = cur
    const out = new Uint8ClampedArray(data.length)
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const s = (y * w + x) * 4, d = (x * h + (h - 1 - y)) * 4
        out.set(data.subarray(s, s + 4), d)
      }
    cur = { data: out, width: h, height: w }
  }
  return cur
}

describe('robustness', () => {
  const file = 's02_shift1_end.jpg'
  const truth = manifest.samples.find((s) => s.file === file).true_dose

  it('reports every stage in order', () => {
    const it = scanStages(cv, load(file), { mode: 'end', today: TODAY })
    const seen = []
    let r
    while (!(r = it.next()).done) seen.push(r.value.stage)
    expect(seen).toEqual(STAGES)
    expect(r.value.steps.correction.image.width).toBe(r.value.steps.flat.image.width)
  })

  for (const turns of [1, 2, 3])
    it(`reads the same dose when the photo is turned ${turns * 90}°`, () => {
      const res = scanPod(cv, rotate(load(file), turns), { mode: 'end', today: TODAY })
      expect(Math.abs(res.dose - truth)).toBeLessThan(4)
    })

  it('rejects a broken or tiny image with a clear message', () => {
    expect(() => scanPod(cv, { data: new Uint8ClampedArray(16), width: 2, height: 2 })).toThrow(/too small/)
    expect(() => scanPod(cv, { data: new Uint8ClampedArray(3), width: 500, height: 500 })).toThrow(/not a readable photo/)
  })

  it('says how many markers it saw when the pod is not in the photo', () => {
    const blank = { data: new Uint8ClampedArray(640 * 480 * 4).fill(200), width: 640, height: 480 }
    let err
    try {
      scanPod(cv, blank)
    } catch (e) {
      err = e
    }
    expect(err.code).toBe('markers')
    expect(err.steps.markers.found).toBe(0)
  })
})

describe('pod QR codes', () => {
  const sample = (file) => scanPod(cv, load(file), { mode: 'end', today: TODAY }).steps.qr.text
  it('reads the compact DL2 code and rejects a changed one', () => {
    const text = sample('s02_shift1_end.jpg')
    expect(text.startsWith('DL2:')).toBe(true)
    expect(verifyPayload(text).valid).toBe(true)
    expect(verifyPayload(text.replace('DL-000123', 'DL-000124')).valid).toBe(false)
  })
  it('still accepts pods printed with the first (DL1) code', () => {
    const dl1 = 'DL1|DL-000123|B2610A|2026-09-20|C1|WB0LujxfIPmO4OaUichb0lryAJGR8Ke8K9JhdUpAd9h71EixRs2XnaLY4uNmfD2978rPIlsUcFLDt+ufbsx6DA=='
    expect(verifyPayload(dl1).valid).toBe(true)
    expect(verifyPayload(dl1.replace('C1|', 'C2|')).valid).toBe(false)
  })
})
