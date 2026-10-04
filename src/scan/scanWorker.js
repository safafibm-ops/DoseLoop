// Runs the scan pipeline in a background thread so the screen stays smooth.
// Messages in:  { id, imageData, mode, today }   (or { warmup: true } to load OpenCV early,
//               or { probe: true, imageData } for a quick live-camera check -> { id, type: 'probe', result })
// Messages out: { id, type: 'stage', stage, data } … then { id, type: 'done', result }
//               or { id, type: 'fail', code, message } (a ScanError) or { id, type: 'crash', message }
import cvModule from '@techstark/opencv-js'
import { probePod, scanStages, ScanError } from './pipeline.js'

let ready = null
function getCv() {
  if (!ready)
    ready = (async () => {
      const mod = cvModule
      if (mod instanceof Promise) return { cv: await mod }
      if (!mod.Mat) await new Promise((resolve) => (mod.onRuntimeInitialized = resolve))
      return { cv: mod }
    })()
  return ready
}

self.onmessage = async (e) => {
  const { id, warmup, probe, imageData, mode, today } = e.data
  try {
    const { cv } = await getCv()
    if (warmup) return self.postMessage({ id, type: 'ready' })
    if (probe) return self.postMessage({ id, type: 'probe', result: probePod(cv, imageData) })
    const it = scanStages(cv, imageData, { mode, today: new Date(today) })
    for (;;) {
      const r = it.next()
      if (r.done) {
        const result = { ...r.value }
        delete result.steps // already sent stage by stage
        return self.postMessage({ id, type: 'done', result })
      }
      self.postMessage({ id, type: 'stage', stage: r.value.stage, data: r.value.data })
    }
  } catch (err) {
    if (err instanceof ScanError) self.postMessage({ id, type: 'fail', code: err.code, message: err.message })
    else self.postMessage({ id, type: 'crash', message: String(err?.message ?? err) })
  }
}
