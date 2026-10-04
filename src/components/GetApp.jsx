// Corner button: download the Android app (APK) or add DoseLoop to the iPhone home screen.
import { useEffect, useState } from 'react'
import { APK_URL, isNativeApp, platform } from '../native.js'

let installEvent = null // Chrome's "install this web app" prompt, if it offered one
window.addEventListener?.('beforeinstallprompt', (e) => {
  e.preventDefault()
  installEvent = e
})

export default function GetApp() {
  const [open, setOpen] = useState(false)
  const [canInstall, setCanInstall] = useState(!!installEvent)
  useEffect(() => {
    const on = () => setCanInstall(true)
    window.addEventListener('beforeinstallprompt', on)
    return () => window.removeEventListener('beforeinstallprompt', on)
  }, [])
  if (isNativeApp()) return null
  const here = platform()
  const install = async () => {
    installEvent?.prompt()
    await installEvent?.userChoice
    installEvent = null
    setCanInstall(false)
  }
  return (
    <div className="getapp">
      <button className="getapp-btn" onClick={() => setOpen(!open)} aria-expanded={open}>
        <span aria-hidden="true">📲</span> Get the app
      </button>
      {open && (
        <div className="getapp-sheet" role="dialog" aria-label="Get the DoseLoop app">
          <section className={here === 'android' ? 'here' : ''}>
            <b>Android</b>
            <a className="cta small-cta" href={APK_URL} download>
              ⬇ Download APK
            </a>
            <span className="small muted">
              Open the file and allow “install unknown apps” once. Works fully offline: the scan engine is inside the app.
            </span>
          </section>
          <section className={here === 'ios' ? 'here' : ''}>
            <b>iPhone / iPad</b>
            <span className="small muted">
              Open this site in Safari → Share → <b>Add to Home Screen</b>. It opens full screen and works offline. (An App Store build needs an
              Apple developer account.)
            </span>
          </section>
          {canInstall && (
            <section>
              <b>This device</b>
              <button className="cta secondary small-cta" onClick={install}>
                Install as web app
              </button>
            </section>
          )}
          <button className="link small" onClick={() => setOpen(false)}>
            Close
          </button>
        </div>
      )}
    </div>
  )
}
