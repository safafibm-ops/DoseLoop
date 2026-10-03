// Runs the real pipeline on every sample photo and checks the result.
// Run: npm test
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import jpeg from 'jpeg-js'
import { beforeAll, describe, expect, it } from 'vitest'
import { scanPod } from './pipeline.js'
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
        res ? `dose ${res.dose.toFixed(1)} (true ${s.true_dose})` : `ERROR ${err.code}: ${err.message}`,
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
