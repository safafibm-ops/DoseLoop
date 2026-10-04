// Starts a scan and reports each stage as it finishes.
// The scan runs in a background worker (with OpenCV inside it), so the screen stays smooth.
// Everything is bundled with the app, so it works with no network (PWA and Android app).
import { ScanError } from './pipeline.js'

const TIMEOUT_MS = 60000 // first scan on a slow phone includes loading the 10 MB image engine
const NO_ENGINE = 'This browser cannot run the scan engine. Please use a recent Chrome, Edge, Firefox or Safari.'
let worker = null
let nextId = 1

function getWorker() {
  if (typeof Worker === 'undefined') return null
  if (!worker) {
    try {
      const w = new Worker(new URL('./scanWorker.js', import.meta.url), { type: 'module' })
      // if it fails to load (e.g. during warm-up), forget it so the next scan starts a fresh one
      w.addEventListener('error', () => worker === w && (worker = null))
      worker = w
    } catch {
      return null
    }
  }
  return worker
}

/** Start loading the image engine early (on the scan screen) so the first scan is quick. */
export function warmUp() {
  getWorker()?.postMessage({ id: 0, warmup: true })
}

function viaWorker(w, imageData, opts, onStage) {
  return new Promise((resolve, reject) => {
    const id = nextId++
    const steps = {}
    const finish = (fn) => {
      clearTimeout(timer)
      w.removeEventListener('message', onMsg)
      w.removeEventListener('error', onErr)
      fn()
    }
    const onMsg = (e) => {
      const m = e.data
      if (m.id !== id) return
      if (m.type === 'stage') {
        steps[m.stage] = m.data
        onStage(m.stage, m.data)
      } else if (m.type === 'done') finish(() => resolve({ ...m.result, steps }))
      else if (m.type === 'fail') finish(() => reject(new ScanError(m.code, m.message, steps)))
      else if (m.type === 'crash') finish(() => reject(Object.assign(new Error(m.message), { crash: true })))
    }
    const onErr = (e) => {
      e.preventDefault?.()
      // a worker that failed to load is thrown away; the next scan gets a fresh one
      w.terminate()
      worker = null
      finish(() => reject(Object.assign(new Error(e.message || 'The scan engine failed to start. Please try again.'), { crash: true })))
    }
    const timer = setTimeout(() => {
      // a stuck worker is thrown away; the next scan gets a fresh one
      w.terminate()
      worker = null
      finish(() => reject(Object.assign(new Error('The scan took too long. Please try again.'), { crash: true })))
    }, TIMEOUT_MS)
    w.addEventListener('message', onMsg)
    w.addEventListener('error', onErr)
    // hand the pixels over instead of copying them (a 12 MP photo is ~50 MB)
    w.postMessage({ id, imageData, mode: opts.mode, today: (opts.today ?? new Date()).toISOString() }, [imageData.data.buffer])
  })
}

/**
 * Scan one photo. onStage(stage, data) is called after each pipeline stage.
 * Resolves with the result; rejects with ScanError (retake / fake / expired …) or Error.
 */
export async function runScan(imageData, opts, onStage = () => {}) {
  const w = getWorker()
  if (!w) throw Object.assign(new Error(NO_ENGINE), { crash: true })
  return viaWorker(w, imageData, opts, onStage)
}

/**
 * Quick live-camera check of one video frame: { found, quad, qr, genuine, size }.
 * Resolves null if the engine is busy or fails (the camera just tries the next frame).
 */
export function probe(imageData) {
  const w = getWorker()
  if (!w) return Promise.resolve(null)
  return new Promise((resolve) => {
    const id = nextId++
    const finish = (v) => {
      clearTimeout(timer)
      w.removeEventListener('message', onMsg)
      resolve(v)
    }
    const onMsg = (e) => {
      if (e.data.id !== id) return
      finish(e.data.type === 'probe' ? e.data.result : null)
    }
    const timer = setTimeout(() => finish(null), 15000)
    w.addEventListener('message', onMsg)
    w.postMessage({ id, probe: true, imageData }, [imageData.data.buffer])
  })
}
