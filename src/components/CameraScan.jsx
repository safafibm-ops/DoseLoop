// Live camera for scanning a pod (or a printed badge).
// Asks for camera permission, shows the video, and checks a few frames a second in the background:
// when all 4 corner markers are in view AND the QR can be read, it takes the photo by itself.
// Works the same in a laptop browser, a phone browser and the Android app (no network needed).
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { probe } from '../scan/runScan.js'
import { Icon } from './ui.jsx'

const BACK = { facingMode: { ideal: 'environment' }, width: { ideal: 2560 }, height: { ideal: 1440 } }
const touch = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches
const FRONT = { facingMode: 'user', width: { ideal: 1920 }, height: { ideal: 1080 } }

function hintFor(status, look) {
  if (status === 'starting') return 'Starting the camera… allow access if your browser asks.'
  if (status !== 'live') return ''
  if (!look) return 'Looking for the badge…'
  if (look.found < 3) return 'Point the camera at the badge so all 4 black corner squares are in view.'
  if (look.found === 3) return 'Almost: 3 of 4 corners seen. Show the whole badge.'
  if (!look.qr) return look.size < 0.08 ? 'Badge found. Move closer so it fills more of the screen.' : 'Badge found. Hold still for a sharp QR code…'
  return 'Got it!'
}

// dashed outline the shape of a pod, in the middle of the view
function Guide({ ar }) {
  const pod = 46 / 32
  let w = 0.7
  let h = (w * ar) / pod
  if (h > 0.7) {
    h = 0.7
    w = (h * pod) / ar
  }
  return <rect x={(1 - w) / 2} y={(1 - h) / 2} width={w} height={h} className="cam-guide" />
}

function grab(video, canvas) {
  const w = video.videoWidth, h = video.videoHeight
  if (!w || !h) return null
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  ctx.drawImage(video, 0, 0, w, h)
  return ctx.getImageData(0, 0, w, h)
}

/**
 * onCapture(imageData): a photo was taken (auto or by hand). onClose(): user closed the camera.
 * onFallback(): open the phone's own camera / file picker instead.
 */
export default function CameraScan({ onCapture, onClose, onFallback }) {
  const video = useRef(null)
  const canvas = useRef(null)
  const stream = useRef(null)
  const [status, setStatus] = useState('starting') // starting | live | denied | unsupported | error
  const [error, setError] = useState('')
  const [look, setLook] = useState(null)
  const [facing, setFacing] = useState('back')
  const [cams, setCams] = useState(1)
  const [torch, setTorch] = useState(null) // null = not available
  const [attempt, setAttempt] = useState(0)
  const [ar, setAr] = useState(4 / 3)
  const done = useRef(false)
  const captured = useRef(onCapture)
  useEffect(() => {
    captured.current = onCapture
  })

  // open the camera
  useEffect(() => {
    let alive = true
    const stop = () => stream.current?.getTracks().forEach((t) => t.stop())
    async function start() {
      setStatus('starting')
      setLook(null)
      if (!navigator.mediaDevices?.getUserMedia) {
        setStatus('unsupported')
        return
      }
      let s
      try {
        s = await navigator.mediaDevices.getUserMedia({ video: facing === 'back' ? BACK : FRONT, audio: false })
      } catch (e) {
        if (e?.name === 'NotAllowedError' || e?.name === 'SecurityError') {
          if (alive) setStatus('denied')
          return
        }
        try {
          s = await navigator.mediaDevices.getUserMedia({ video: true, audio: false }) // any camera at all
        } catch (e2) {
          if (!alive) return
          setError(e2?.name === 'NotFoundError' ? 'No camera was found on this device.' : 'The camera could not be started.')
          setStatus(e2?.name === 'NotAllowedError' ? 'denied' : 'error')
          return
        }
      }
      if (!alive) {
        s.getTracks().forEach((t) => t.stop())
        return
      }
      stream.current = s
      const v = video.current
      v.srcObject = s
      try {
        await v.play()
      } catch {
        // autoplay is allowed for muted inline video; the frames still arrive
      }
      const track = s.getVideoTracks()[0]
      const caps = track.getCapabilities?.() ?? {}
      if (caps.focusMode?.includes?.('continuous')) track.applyConstraints({ advanced: [{ focusMode: 'continuous' }] }).catch(() => {})
      setTorch(caps.torch ? false : null)
      navigator.mediaDevices
        .enumerateDevices?.()
        .then((d) => alive && setCams(d.filter((x) => x.kind === 'videoinput').length))
        .catch(() => {})
      if (alive) setStatus('live')
    }
    start()
    return () => {
      alive = false
      stop()
    }
  }, [facing, attempt])

  // check frames in the background; take the photo when the badge can be read
  useEffect(() => {
    if (status !== 'live') return
    let alive = true
    let last = 0
    async function loop() {
      while (alive && !done.current) {
        const wait = 250 - (performance.now() - last)
        if (wait > 0) await new Promise((r) => setTimeout(r, wait))
        last = performance.now()
        const v = video.current
        if (!alive || !v || v.readyState < 2) continue
        const frame = grab(v, canvas.current)
        if (!frame) continue
        const res = await probe(new ImageData(new Uint8ClampedArray(frame.data), frame.width, frame.height))
        if (!alive || done.current) return
        setLook(res)
        if (res?.qr) {
          done.current = true
          setTimeout(() => captured.current(frame), 350) // let "Got it!" show for a moment
          return
        }
      }
    }
    loop()
    return () => {
      alive = false
    }
  }, [status])

  const shoot = () => {
    const frame = video.current && grab(video.current, canvas.current)
    if (!frame || done.current) return
    done.current = true
    captured.current(frame)
  }
  const flipTorch = () => {
    const track = stream.current?.getVideoTracks()[0]
    if (!track) return
    const on = !torch
    track.applyConstraints({ advanced: [{ torch: on }] }).then(() => setTorch(on), () => setTorch(null))
  }

  const quad = look?.quad
  const tone = look?.qr ? 'ok' : quad ? 'near' : ''
  return createPortal(
    <div className="cam" role="dialog" aria-modal="true" aria-label="Camera">
      <div className="cam-top">
        <button className="cam-btn" onClick={onClose} aria-label="Close camera">
          <Icon name="x" size={24} />
        </button>
        <span className="cam-title">Scan the badge</span>
        <span className="cam-tools">
          {torch !== null && (
            <button className={`cam-btn ${torch ? 'on' : ''}`} onClick={flipTorch} aria-label="Torch" aria-pressed={torch}>
              <Icon name="torch" size={22} />
            </button>
          )}
          {cams > 1 && (
            <button className="cam-btn" onClick={() => setFacing(facing === 'back' ? 'front' : 'back')} aria-label="Switch camera">
              <Icon name="flip" size={22} />
            </button>
          )}
        </span>
      </div>

      <div className="cam-view">
        <div className={`cam-frame ${status === 'live' ? '' : 'idle'}`} style={{ '--ar': ar }}>
          <video
            ref={video}
            playsInline
            muted
            autoPlay
            className={facing === 'front' ? 'mirror' : ''}
            onLoadedMetadata={(e) => e.target.videoHeight && setAr(e.target.videoWidth / e.target.videoHeight)}
          />
          {status === 'live' && (
            <svg className={`cam-svg ${facing === 'front' ? 'mirror' : ''}`} viewBox="0 0 1 1" preserveAspectRatio="none" aria-hidden="true">
              {quad ? (
                <polygon points={quad.map((p) => p.join(',')).join(' ')} className={`cam-quad ${tone}`} />
              ) : (
                <Guide ar={ar} />
              )}
            </svg>
          )}
        </div>
        {status === 'denied' && (
          <div className="cam-msg">
            <b>Camera access is blocked</b>
            <p>
              Allow the camera for this site, then tap Try again. On a laptop, click the camera icon at the right of the address bar. On a phone, open
              the browser’s site settings and allow Camera.
            </p>
            <div className="actions">
              <button className="btn primary" onClick={() => setAttempt(attempt + 1)}>
                Try again
              </button>
              <button className="btn secondary on-dark" onClick={onFallback}>
                Use a photo instead
              </button>
            </div>
          </div>
        )}
        {(status === 'unsupported' || status === 'error') && (
          <div className="cam-msg">
            <b>{status === 'unsupported' ? 'This browser cannot open a live camera here' : error}</b>
            <p>You can still take a photo with the phone’s camera app or upload one.</p>
            <div className="actions">
              <button className="btn primary" onClick={onFallback}>
                Take or choose a photo
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="cam-bottom">
        <p className={`cam-hint ${tone}`} aria-live="polite">
          {hintFor(status, look)}
        </p>
        {status === 'live' && (
          <div className="cam-row">
            <button className="cam-alt" onClick={onFallback}>
              {touch ? 'Camera app' : 'Choose a file'}
            </button>
            <button className="cam-shutter" onClick={shoot} aria-label="Take photo now" />
            <span className="cam-auto">Auto-capture on</span>
          </div>
        )}
      </div>
      <canvas ref={canvas} hidden />
    </div>,
    document.body,
  )
}
