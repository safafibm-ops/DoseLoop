import { useEffect, useRef, useState } from 'react'
import { CountUp } from '../components/Charts.jsx'
import CameraScan from '../components/CameraScan.jsx'
import { DemoNote, fmtTime, SeverityChip, StatusChip } from '../components/ui.jsx'
import { LIMITS, SHELF_DAYS } from '../data/limits.js'
import { isNativeApp } from '../native.js'
import { openShiftFor, workerById } from '../data/log.js'
import { TOUR, useStore } from '../data/store.jsx'
import { STAGES } from '../scan/pipeline.js'
import { runScan, warmUp } from '../scan/runScan.js'
import { LiveView, MarkerPhoto, Picture, STAGE_MS } from './LiveScan.jsx'
import { DoseBullet } from './Worker.jsx'

const fmt = (n, d = 1) => (Number.isFinite(n) ? n.toFixed(d) : '–')
const Swatch = ({ color, label }) => (
  <span className="sw" title={color}>
    <span style={{ background: color }} />
    {label}
  </span>
)

// Small chart of the batch curve with this scan's point on it.
function CurveChart({ curve, net, dose }) {
  const w = 300, h = 160, pad = 30
  const maxX = curve.x[curve.x.length - 1], maxY = curve.y[curve.y.length - 1]
  const X = (v) => pad + (v / maxX) * (w - pad - 8)
  const Y = (v) => h - pad - (v / maxY) * (h - pad - 8)
  const path = curve.x.map((x, i) => `${i ? 'L' : 'M'}${X(Math.max(0, x))},${Y(curve.y[i])}`).join(' ')
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="chart" role="img" aria-label="Dose curve">
      <line x1={pad} y1={h - pad} x2={w - 8} y2={h - pad} className="axis" />
      <line x1={pad} y1={8} x2={pad} y2={h - pad} className="axis" />
      <path d={path} className="curve" />
      <circle cx={X(Math.max(0, net))} cy={Y(dose)} r="5" className="point" />
      <text x={w / 2} y={h - 6} textAnchor="middle">strip ΔE − reference ΔE</text>
      <text x={10} y={h / 2} textAnchor="middle" transform={`rotate(-90 10 ${h / 2})`}>ppm·hr</text>
    </svg>
  )
}

/** One pipeline step: a one-line summary that expands to show how it was done. */
function Step({ n, title, summary, ok, children, open: startOpen = false }) {
  const [open, setOpen] = useState(startOpen)
  return (
    <section className={`step-card reveal ${ok === false ? 'failed' : ''}`}>
      <button className="step-head" onClick={() => setOpen(!open)} aria-expanded={open} disabled={!children}>
        <span className={`badge ${ok === false ? 'bad' : ok ? 'good' : ''}`}>{ok === false ? '✕' : ok ? '✓' : n}</span>
        <span className="step-text">
          <b>{title}</b>
          <span>{summary}</span>
        </span>
        {children && <span className="chev">{open ? '−' : '+'}</span>}
      </button>
      {open && children && <div className="step-body">{children}</div>}
    </section>
  )
}

function pipelineSteps(s, error, logged) {
  const steps = []
  const failedAt = error?.code
  if (s.markers)
    steps.push(
      <Step
        key="1"
        n="1"
        title="Find the pod"
        ok={s.markers.quad ? true : false}
        summary={
          !s.markers.quad
            ? `Only ${s.markers.found} of 4 corner markers found`
            : s.flat
              ? `4 corner markers found, photo straightened (rotated ${Math.abs(Math.round(s.flat.rotation))}°)`
              : '4 corner markers found'
        }
      >
        <MarkerPhoto photo={s.photo.image} markers={s.markers} />
        {s.flat && <Picture image={s.flat.image} alt="Flat pod view" />}
      </Step>,
    )
  if (s.qr)
    steps.push(
      <Step key="2" n="2" title="Check it is genuine" ok={!!s.qr.valid} summary={s.qr.text ? `${s.qr.serial} · ${s.qr.reason}` : 'QR code not readable'}>
        {s.qr.text && (
          <ul className="facts">
            <li>Serial {s.qr.serial} · batch {s.qr.batch} · made {s.qr.mfgDate}</li>
            <li>Ed25519 signature checked offline against the maker’s public key</li>
          </ul>
        )}
      </Step>,
    )
  if (s.sampling)
    steps.push(
      <Step key="3" n="3" title="Read the colours" ok={!s.sampling.glare && !(s.sampling.uneven > s.sampling.unevenLimit) && !(s.sampling.blackSpread > s.sampling.blackLimit)} summary={s.sampling.glare ? `Glare on ${s.sampling.glare} area(s)` : s.sampling.blackSpread > s.sampling.blackLimit ? `Reflection over the pod: corners differ by ${fmt(s.sampling.blackSpread)} L*` : s.sampling.uneven > s.sampling.unevenLimit ? `Colour areas are streaky (${fmt(s.sampling.uneven)} ΔE): screen stripes or a reflection` : `${s.sampling.patches.length + s.sampling.scale.length + 2 - (s.sampling.skipped?.length ?? 0)} areas sampled, light evened out${s.sampling.skipped?.length ? `, ${s.sampling.skipped.join(' & ')} over-exposed (left out)` : ''}`} />,
    )
  if (s.correction)
    steps.push(
      <Step key="4" n="4" title="Correct for light and camera" ok summary={`Tone curve + 3×3 matrix (average error ${fmt(s.correction.meanGlobalDE)} ΔE), then a curve through all 6 printed brown steps (${fmt(s.correction.meanFitDE)} ΔE; the 25 ppm·hr row is left out for the self-test)`}>
        <table className="ctable">
          <thead>
            <tr>
              <th>Patch</th>
              <th>Photo</th>
              <th>Corrected</th>
              <th>True</th>
              <th>ΔE</th>
            </tr>
          </thead>
          <tbody>
            {s.correction.table.map((p) => (
              <tr key={p.name}>
                <td>{p.name}</td>
                <td><Swatch color={p.measured} /></td>
                <td><Swatch color={p.corrected} /></td>
                <td><Swatch color={p.truth} /></td>
                <td>{fmt(p.dE)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Step>,
    )
  if (s.selfTest)
    steps.push(
      <Step
        key="5"
        n="5"
        title="Self-test"
        ok={s.selfTest.pass}
        summary={`Held-out 25 ppm·hr brown is ${fmt(s.selfTest.dE)} ΔE off (best under ${s.selfTest.limit}, retake over ${s.selfTest.retake})${s.selfTest.good === false ? ' · lower confidence' : ''}`}
      />,
    )
  if (s.dose)
    steps.push(
      <Step key="6" n="6" title="Strip minus reference → dose" ok summary={`${fmt(s.dose.strip.dE)} − ${fmt(s.dose.reference.dE)} = ${fmt(s.dose.net)} ΔE → ${fmt(s.dose.dose)}${s.dose.doseErr != null ? ` ± ${fmt(s.dose.doseErr)}` : ''} ppm·hr`}>
        <div className="duo">
          <div>
            <b>Strip</b>
            <Swatch color={s.dose.strip.measured} label="photo" />
            <Swatch color={s.dose.strip.corrected} label="corrected" />
          </div>
          <div>
            <b>Reference cell</b>
            <Swatch color={s.dose.reference.measured} label="photo" />
            <Swatch color={s.dose.reference.corrected} label="corrected" />
          </div>
        </div>
        <p className="small">The reference cell sees the same humidity and heat but no H₂S, so subtracting it cancels them.</p>
        <CurveChart curve={s.dose.curve} net={s.dose.net} dose={s.dose.dose} />
        <p className="small">Placeholder curve fitted on simulated data. Lab calibration pending.</p>
      </Step>,
    )
  if (s.checks)
    steps.push(
      <Step
        key="7"
        n="7"
        title="Pod checks"
        ok={!s.checks.expired && !(failedAt === 'shutter')}
        summary={`Shutter ${s.checks.shutter} · expiry ${Math.round(s.checks.wick * 100)}% · ${s.checks.ageDays}/${SHELF_DAYS} days · ${Math.round(s.checks.capacity * 100)}% used`}
      />,
    )
  if (logged) steps.push(<Step key="8" n="8" title="Log it" ok summary={logged} />)
  return steps
}

const ERROR_TITLE = { fake: 'Pod rejected: not genuine', expired: 'Pod expired', shutter: 'Open the shutter', image: 'Cannot use this photo' }

function Outcome({ out, worker }) {
  const { result, error, outcome, alert } = out
  if (error)
    return (
      <div className="outcome bad reveal">
        <div className="outcome-icon">✕</div>
        <div>
          <b>{ERROR_TITLE[error.code] ?? 'Retake the photo'}</b>
          <p>{error.message}</p>
          {alert && <p className="small">Reported to the supervisor as a {alert.severity} alert.</p>}
        </div>
      </div>
    )
  if (outcome?.kind === 'error')
    return (
      <div className="outcome warn reveal">
        <div className="outcome-icon">!</div>
        <div>
          <b>Not logged</b>
          <p>{outcome.message}</p>
        </div>
      </div>
    )
  const raised = outcome?.alerts ?? []
  return (
    <div className={`outcome ${outcome.kind === 'end' ? outcome.status : 'good'} reveal`}>
      {outcome.kind === 'start' ? (
        <>
          <div className="outcome-icon">▶</div>
          <div>
            <span className="eyebrow">Shift started · {fmtTime(outcome.shift.startAt)}</span>
            <div className="big-dose">
              <CountUp value={result.dose} />
              {result.doseErr != null && <span className="pm"> ± {fmt(result.doseErr)}</span>} <small>ppm·hr on the pod</small>
            </div>
            <p className="muted">Saved for {worker.name}. Scan again at the end of the shift.</p>
          </div>
        </>
      ) : (
        <>
          <div className="outcome-icon">■</div>
          <div>
            <span className="eyebrow">
              Shift ended · {fmtTime(outcome.shift.startAt)}–{fmtTime(outcome.shift.endAt)}
            </span>
            <div className="big-dose">
              <CountUp value={outcome.dose} />
              {outcome.doseErr != null && <span className="pm"> ± {fmt(outcome.doseErr)}</span>} <small>ppm·hr this shift</small>
            </div>
            <StatusChip status={outcome.status} />
            <p className="muted small">
              End {outcome.shift.endReading} − start {outcome.shift.startReading} = {outcome.dose} ppm·hr · 8-h TWA {fmt(outcome.dose / LIMITS.shiftHours)} ppm
              {outcome.doseErr != null && ' · ± is how far the photos alone could move the reading (lab validation pending)'}
            </p>
            <DoseBullet dose={outcome.dose} />
          </div>
        </>
      )}
      {raised.map((a) => (
        <div key={a.id} className="raised">
          <SeverityChip severity={a.severity} /> <b>{a.title}</b> <span>{a.detail}</span>
        </div>
      ))}
      {result.warnings.map((w) => (
        <div key={w} className="raised">
          <SeverityChip severity="warning" /> <span>{w}</span>
        </div>
      ))}
    </div>
  )
}

// Opens a photo (file, camera frame or sample URL) as pixels, at most 3200 px on the long side
// (full detail for the QR code). createImageBitmap applies the phone's EXIF rotation; <img> is the fallback.
async function fileToImageData(src) {
  if (typeof ImageData !== 'undefined' && src instanceof ImageData) return src
  const MAX = 3200
  const draw = (w, h, paint) => {
    const k = Math.min(1, MAX / Math.max(w, h))
    const c = document.createElement('canvas')
    c.width = Math.max(1, Math.round(w * k))
    c.height = Math.max(1, Math.round(h * k))
    const ctx = c.getContext('2d', { willReadFrequently: true })
    paint(ctx, c.width, c.height)
    return ctx.getImageData(0, 0, c.width, c.height)
  }
  try {
    if (typeof createImageBitmap === 'function') {
      const blob = src instanceof Blob ? src : await (await fetch(src)).blob()
      const bmp = await createImageBitmap(blob, { imageOrientation: 'from-image' })
      const data = draw(bmp.width, bmp.height, (ctx, w, h) => ctx.drawImage(bmp, 0, 0, w, h))
      bmp.close?.()
      return data
    }
  } catch {
    // fall through to the <img> route
  }
  const url = src instanceof Blob ? URL.createObjectURL(src) : src
  try {
    const img = await new Promise((resolve, reject) => {
      const im = new Image()
      im.onload = () => resolve(im)
      im.onerror = () => reject(new Error('Could not open that image. Use a JPG or PNG photo.'))
      im.src = url
    })
    return draw(img.naturalWidth, img.naturalHeight, (ctx, w, h) => ctx.drawImage(img, 0, 0, w, h))
  } finally {
    if (src instanceof Blob) URL.revokeObjectURL(url)
  }
}

export default function Scan() {
  const { state, logScan, logRejection } = useStore()
  const worker = workerById(state, state.session.workerId)
  const open = worker.podSerial ? openShiftFor(state, worker.podSerial) : null
  const [override, setOverride] = useState(null)
  const mode = override ?? (open ? 'end' : 'start')
  const [samples, setSamples] = useState([])
  const [scan, setScan] = useState(null) // { steps, arrived: [stage], shown: n, running, end: {result|error,…} }
  const [allSteps, setAllSteps] = useState(false)
  const [camera, setCamera] = useState(false)
  const nativeCam = useRef(null)
  const liveRef = useRef(null)
  const outcomeRef = useRef(null)
  const runId = useRef(0)
  const tourSample = state.tour ? TOUR[state.tour.step]?.sample : null

  useEffect(() => {
    fetch('samples/manifest.json')
      .then((r) => r.json())
      .then((m) => setSamples(m.samples))
      .catch(() => setSamples([]))
    warmUp() // start loading the image engine early
  }, [])

  // show the stages one by one, at a pace people can follow
  const shownStage = scan ? scan.arrived[scan.shown - 1] : null
  useEffect(() => {
    if (!scan || scan.shown >= scan.arrived.length) return
    const wait = scan.shown === 0 ? 0 : STAGE_MS[shownStage] ?? 700
    const t = setTimeout(() => setScan((x) => (x ? { ...x, shown: x.shown + 1 } : x)), wait)
    return () => clearTimeout(t)
  }, [scan, shownStage])

  // the last stage stays up a moment, then the result appears
  const allShown = !!scan && scan.shown >= scan.arrived.length
  const [settled, setSettled] = useState(false)
  useEffect(() => {
    if (!scan?.end || !allShown) return
    const t = setTimeout(() => setSettled(true), scan.arrived.length ? STAGE_MS[shownStage] ?? 700 : 0)
    return () => clearTimeout(t)
  }, [scan?.end, allShown, shownStage, scan?.arrived.length])
  const finished = !!scan?.end && allShown && settled

  useEffect(() => {
    if (finished) outcomeRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [finished])

  async function run(src, sample = null) {
    const id = ++runId.current
    const scanMode = mode
    setAllSteps(false)
    setSettled(false)
    setScan({ steps: {}, arrived: [], shown: 0, running: true, end: null, sample })
    requestAnimationFrame(() => liveRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }))
    const onStage = (stage, data) => {
      if (id !== runId.current) return
      setScan((x) => ({ ...x, steps: { ...x.steps, [stage]: data }, arrived: x.arrived.includes(stage) ? x.arrived : [...x.arrived, stage] }))
    }
    let end
    try {
      const data = await fileToImageData(src)
      const result = await runScan(data, { mode: scanMode }, onStage)
      const outcome = logScan(result)
      end = { result, outcome, logged: outcome.kind === 'error' ? null : `Saved to ${worker.name}’s shift log on this phone (works offline)` }
    } catch (e) {
      if (!e.steps && !e.crash) console.error(e)
      const alert = e.steps && (e.code === 'fake' || e.code === 'expired') ? logRejection(e) : null
      end = { error: e.code ? e : { code: 'image', message: e.message || 'Something went wrong. Please try again.' }, alert }
    }
    if (id !== runId.current) return
    setOverride(null)
    setScan((x) => ({ ...x, running: false, end }))
  }

  const onFile = (e) => {
    const f = e.target.files?.[0]
    if (f) run(f)
    e.target.value = ''
  }

  const ordered = tourSample ? [...samples].sort((a, b) => (b.file === tourSample) - (a.file === tourSample)) : samples
  const visible = scan ? Object.fromEntries(scan.arrived.slice(0, scan.shown).map((k) => [k, scan.steps[k]])) : {}
  const cards = scan ? pipelineSteps(visible, finished ? scan.end.error : null, finished ? scan.end.logged : null) : []
  const busy = !!scan && !finished
  const out = scan?.end ? { ...scan.end, sample: scan.sample } : null

  return (
    <>
      <section className="card scan-top">
        <div className="toggle" role="group" aria-label="Scan type">
          {['start', 'end'].map((m) => (
            <button key={m} className={mode === m ? 'on' : ''} onClick={() => setOverride(m)} disabled={busy}>
              Shift {m}
            </button>
          ))}
        </div>
        <p className="muted small">
          {open ? `On shift since ${fmtTime(open.startAt)}. Scan to end it.` : 'Off shift. Open the shutter (green dot) and scan to start.'}
        </p>
        <div className="actions">
          <button className="cta small-cta" onClick={() => setCamera(true)} disabled={busy} data-coach="camera">
            📷 Camera
          </button>
          <input ref={nativeCam} type="file" accept="image/*" capture="environment" onChange={onFile} hidden />
          <label className={`cta secondary small-cta ${busy ? 'disabled' : ''}`}>
            Upload photo
            <input type="file" accept="image/*" onChange={onFile} disabled={busy} hidden />
          </label>
        </div>
        {!isNativeApp() && (
          <p className="small muted print-tip">
            No pod?{' '}
            <a href="print/doseloop-test-badges.pdf" target="_blank" rel="noopener">
              🖨 Print the test badges (A4 PDF)
            </a>{' '}
            and show them to the camera.
          </p>
        )}
      </section>

      {busy && <span data-coach-busy hidden />}

      {camera && (
        <CameraScan
          onCapture={(frame) => {
            setCamera(false)
            run(frame)
          }}
          onClose={() => setCamera(false)}
          onFallback={() => {
            setCamera(false)
            nativeCam.current?.click()
          }}
        />
      )}

      {scan && (
        <div className="results" ref={liveRef}>
          <LiveView
            shown={scan.arrived.slice(0, scan.shown)}
            steps={scan.steps}
            running={!finished}
            failed={finished && !!scan.end.error}
            stages={STAGES}
          />

          {cards.length > 0 && (
            <section className={`steps-drop ${allSteps ? 'open' : ''}`}>
              <button className="steps-toggle" onClick={() => setAllSteps(!allSteps)} aria-expanded={allSteps}>
                <span>{allSteps ? `All ${cards.length} steps` : finished ? `Step ${cards.length} · last step` : `Step ${cards.length} · working now`}</span>
                <span className="chev">{allSteps ? 'Hide ▴' : `Show all ${cards.length} ▾`}</span>
              </button>
              {allSteps ? cards : cards[cards.length - 1]}
            </section>
          )}

          {finished && (
            <div ref={outcomeRef}>
              <Outcome out={out} worker={worker} />
            </div>
          )}
          {finished && out.sample && (
            <p className="small center">
              Sample photo: {out.sample.title} ({out.sample.light}) · true simulated dose {out.sample.true_dose} ppm·hr
            </p>
          )}
        </div>
      )}

      <h3 className="section-title">Sample photos (no pod needed)</h3>
      <div className="samples">
        {ordered.map((s) => (
          <button
            key={s.file}
            className={`sample ${s.file === tourSample ? 'next' : ''}`}
            data-coach={`sample:${s.file}`}
            onClick={() => run(`samples/${s.file}`, s)}
            disabled={busy}
          >
            <img src={`samples/${s.file}`} alt="" loading="lazy" />
            <span>{s.title}</span>
            <span className="small muted">{s.light}</span>
          </button>
        ))}
      </div>
      <DemoNote />
    </>
  )
}
