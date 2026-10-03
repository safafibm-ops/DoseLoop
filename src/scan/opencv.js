// Loads OpenCV.js (about 10 MB) only when the first scan needs it.
// The OpenCV object is "thenable", so it must never be returned straight from a promise
// (the promise would try to unwrap it). We always hand it over inside { cv }.
let ready = null

export function loadOpenCv() {
  if (!ready) {
    ready = import('./cvModule.js').then(async ({ getModule }) => {
      const mod = getModule()
      if (mod instanceof Promise) {
        const cv = await mod
        return { cv }
      }
      if (!mod.Mat) await new Promise((resolve) => (mod.onRuntimeInitialized = resolve))
      return { cv: mod }
    })
  }
  return ready
}
