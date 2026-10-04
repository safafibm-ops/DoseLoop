import { useEffect, useRef, useState } from 'react'
import { CountUp } from '../components/Charts.jsx'
import { DemoNote, fmtTime, SeverityChip, StatusChip } from '../components/ui.jsx'
import { LIMITS, SHELF_DAYS } from '../data/limits.js'
import { openShiftFor, workerById } from '../data/log.js'
import { TOUR, useStore } from '../data/store.jsx'
import { loadOpenCv } from '../scan/opencv.js'
import { scanPod } from '../scan/pipeline.js'
import { DoseBullet } from './Worker.jsx'

const fmt = (n, d = 1) => (Number.isFinite(n) ? n.toFixed(d) : '–')
const STEP_MS = 280

// Draws an ImageData-like {data, width, height} onto a canvas.
function Picture({ image, alt }) {
  const ref = useRef(null)
  useEffect(() => {
    if (!image || !ref.current) return
    const c = ref.current
    c.width = image.width
    c.height = image.height
    c.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(image.data), image.width, image.height), 0, 0)
  }, [image])
  return <canvas ref={ref} className="picture" aria-label={alt} />
}

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
      <Step key="1" n="1" title="Find the pod" ok={!!s.flat} summary={s.flat ? '4 corner markers found, photo straightened' : `Only ${s.markers.found} marker(s) found`} open={!s.flat}>
        <Picture image={s.markers.image} alt="Photo with markers" />
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
      <Step key="3" n="3" title="Read the colours" ok={!s.sampling.glare} summary={s.sampling.glare ? `Glare on ${s.sampling.glare} area(s)` : `${s.sampling.patches.length + s.sampling.scale.length + 2} areas sampled, no glare`} />,
    )
  if (s.correction)
    steps.push(
      <Step key="4" n="4" title="Correct for light and camera" ok summary={`Tone curve + 3×3 matrix · average error ${fmt(s.correction.meanFitDE)} ΔE`}>
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
      <Step key="5" n="5" title="Self-test" ok={s.selfTest.pass} summary={`Held-out 25 ppm·hr brown is ${fmt(s.selfTest.dE)} ΔE off (limit ${s.selfTest.limit})`} />,
    )
  if (s.dose)
    steps.push(
      <Step key="6" n="6" title="Strip minus reference → dose" ok summary={`${fmt(s.dose.strip.dE)} − ${fmt(s.dose.reference.dE)} = ${fmt(s.dose.net)} ΔE → ${fmt(s.dose.dose)} ppm·hr`}>
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

function Outcome({ out, worker }) {
  const { result, error, outcome, alert } = out
  if (error)
    return (
      <div className="outcome bad reveal">
        <div className="outcome-icon">✕</div>
        <div>
          <b>{error.code === 'fake' ? 'Pod rejected: not genuine' : error.code === 'expired' ? 'Pod expired' : 'Retake the photo'}</b>
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
              <CountUp value={result.dose} /> <small>ppm·hr on the pod</small>
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
              <CountUp value={outcome.dose} /> <small>ppm·hr this shift</small>
            </div>
            <StatusChip status={outcome.status} />
            <p className="muted small">
              End {outcome.shift.endReading} − start {outcome.shift.startReading} = {outcome.dose} ppm·hr · 8-h TWA {fmt(outcome.dose / LIMITS.shiftHours)} ppm
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

function fileToImageData(src) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      const k = Math.min(1, 1600 / Math.max(img.naturalWidth, img.naturalHeight))
      const c = document.createElement('canvas')
      c.width = Math.round(img.naturalWidth * k)
      c.height = Math.round(img.naturalHeight * k)
      const ctx = c.getContext('2d')
      ctx.drawImage(img, 0, 0, c.width, c.height)
      resolve(ctx.getImageData(0, 0, c.width, c.height))
    }
    img.onerror = () => reject(new Error('Could not open that image.'))
    img.src = src
  })
}

export default function Scan() {
  const { state, logScan, logRejection } = useStore()
  const worker = workerById(state, state.session.workerId)
  const open = worker.podSerial ? openShiftFor(state, worker.podSerial) : null
  const [override, setOverride] = useState(null)
  const mode = override ?? (open ? 'end' : 'start')
  const [samples, setSamples] = useState([])
  const [busy, setBusy] = useState('')
  const [out, setOut] = useState(null)
  const [shown, setShown] = useState(0)
  const resultsRef = useRef(null)
  const outcomeRef = useRef(null)
  const tourSample = state.tour ? TOUR[state.tour.step]?.sample : null

  useEffect(() => {
    fetch('/samples/manifest.json')
      .then((r) => r.json())
      .then((m) => setSamples(m.samples))
      .catch(() => setSamples([]))
    loadOpenCv() // start the image engine download early
  }, [])

  // reveal the steps one by one
  const steps = out ? pipelineSteps((out.result ?? out.error)?.steps ?? {}, out.error, out.logged) : []
  const total = steps.length
  useEffect(() => {
    if (!out || shown >= total) return
    const id = setTimeout(() => setShown(shown + 1), STEP_MS)
    return () => clearTimeout(id)
  }, [out, shown, total])
  useEffect(() => {
    if (out) resultsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [out])

  async function run(src, sample = null) {
    setOut(null)
    setShown(0)
    setBusy('Loading the image engine (first time only)…')
    try {
      const { cv } = await loadOpenCv()
      setBusy('Scanning…')
      const data = await fileToImageData(src)
      await new Promise((r) => setTimeout(r, 30)) // let the screen update first
      try {
        const result = scanPod(cv, data, { mode })
        const outcome = logScan(result)
        const logged = outcome.kind === 'error' ? null : `Saved to ${worker.name}’s shift log on this phone (works offline)`
        setOut({ result, outcome, sample, logged })
      } catch (e) {
        if (!e.steps) console.error(e)
        const alert = e.steps ? logRejection(e) : null
        setOut({ error: e, alert, sample })
      }
    } catch (e) {
      setOut({ error: e, sample })
    }
    setOverride(null)
    setBusy('')
  }

  const onFile = (e) => {
    const f = e.target.files?.[0]
    if (f) run(URL.createObjectURL(f))
    e.target.value = ''
  }

  useEffect(() => {
    if (out && shown === total) outcomeRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [out, shown, total])

  const ordered = tourSample ? [...samples].sort((a, b) => (b.file === tourSample) - (a.file === tourSample)) : samples
  const allShown = shown >= steps.length

  return (
    <>
      <section className="card scan-top">
        <div className="toggle" role="group" aria-label="Scan type">
          {['start', 'end'].map((m) => (
            <button key={m} className={mode === m ? 'on' : ''} onClick={() => setOverride(m)}>
              Shift {m}
            </button>
          ))}
        </div>
        <p className="muted small">
          {open ? `On shift since ${fmtTime(open.startAt)}. Scan to end it.` : 'Off shift. Open the shutter (green dot) and scan to start.'}
        </p>
        <div className="actions">
          <label className="cta small-cta">
            📷 Camera
            <input type="file" accept="image/*" capture="environment" onChange={onFile} hidden />
          </label>
          <label className="cta secondary small-cta">
            Upload photo
            <input type="file" accept="image/*" onChange={onFile} hidden />
          </label>
        </div>
      </section>

      {(busy || (out && !allShown)) && <span data-coach-busy hidden />}
      {busy && (
        <div className="banner scanning">
          <span className="spinner" /> {busy}
        </div>
      )}

      {out && (
        <div className="results" ref={resultsRef}>
          {steps.slice(0, shown)}
          {allShown && (
            <div ref={outcomeRef}>
              <Outcome out={out} worker={worker} />
            </div>
          )}
          {allShown && out.sample && (
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
            onClick={() => run(`/samples/${s.file}`, s)}
            disabled={!!busy}
          >
            <img src={`/samples/${s.file}`} alt="" loading="lazy" />
            <span>{s.title}</span>
            <span className="small muted">{s.light}</span>
          </button>
        ))}
      </div>
      <DemoNote />
    </>
  )
}
