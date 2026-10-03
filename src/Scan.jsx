import { useEffect, useRef, useState } from 'react'
import { loadOpenCv } from './scan/opencv.js'
import { scanPod } from './scan/pipeline.js'
import SPEC from './scan/podSpec.json'

const fmt = (n, d = 1) => (Number.isFinite(n) ? n.toFixed(d) : '–')

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

function Step({ n, title, ok, children }) {
  return (
    <section className="step-card">
      <h3>
        <span className={`badge ${ok === false ? 'bad' : ok ? 'good' : ''}`}>{n}</span> {title}
      </h3>
      {children}
    </section>
  )
}

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

function Results({ result, error, sample }) {
  const s = (result ?? error)?.steps ?? {}
  return (
    <div className="results">
      {error && <div className="banner bad">✕ {error.message}</div>}
      {result && (
        <div className="banner good">
          <div className="big">{fmt(result.dose)} ppm·hr</div>
          <div>
            Pod {result.pod.serial} · {result.mode === 'start' ? 'start' : 'end'} of shift reading
            {sample && ` · true simulated dose ${sample.true_dose}`}
          </div>
          {result.warnings.map((w) => (
            <div key={w} className="warn">⚠ {w}</div>
          ))}
        </div>
      )}

      {s.markers && (
        <Step n="1" title="Find the 4 corner markers" ok={s.markers.found >= 4 && !!s.flat}>
          <Picture image={s.markers.image} alt="Photo with markers" />
          {s.flat && (
            <>
              <p>Straightened to a flat {SPEC.size_mm[0]} × {SPEC.size_mm[1]} mm pod view:</p>
              <Picture image={s.flat.image} alt="Flat pod view" />
            </>
          )}
        </Step>
      )}

      {s.qr && (
        <Step n="2" title="Read the QR and check its signature" ok={!!s.qr.valid}>
          {s.qr.text ? (
            <ul className="facts">
              <li>Serial: {s.qr.serial}</li>
              <li>Batch: {s.qr.batch} · made {s.qr.mfgDate} · curve {s.qr.cal}</li>
              <li className={s.qr.valid ? 'good' : 'bad'}>{s.qr.valid ? '✓' : '✕'} {s.qr.reason}</li>
            </ul>
          ) : (
            <p>No QR code found.</p>
          )}
        </Step>
      )}

      {s.sampling && (
        <Step n="3" title="Sample the colour patches" ok={!s.sampling.glare}>
          <p>
            Median of many pixels in each of {s.sampling.patches.length} colour patches, {s.sampling.scale.length} brown
            steps, the strip and the reference cell (dots skipped).
            {s.sampling.glare ? ` Glare found on ${s.sampling.glare} area(s).` : ' No glare or clipping.'}
          </p>
        </Step>
      )}

      {s.correction && (
        <Step n="4" title="Correct the colours for this light and camera" ok>
          <p>
            Tone curve from greys + browns, then a 3×3 colour matrix (browns weighted 3×). Average error after
            correction: <b>{fmt(s.correction.meanFitDE)} ΔE</b>.
          </p>
          <table className="ctable">
            <thead>
              <tr><th>Patch</th><th>Photo</th><th>Corrected</th><th>True</th><th>ΔE</th></tr>
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
        </Step>
      )}

      {s.selfTest && (
        <Step n="5" title="Self-test on a held-out brown" ok={s.selfTest.pass}>
          <p>
            The 25 ppm·hr brown was not used for fitting. After correction it is {fmt(s.selfTest.dE)} ΔE from its true
            colour (limit {s.selfTest.limit}). {s.selfTest.pass ? 'Photo accepted.' : 'Photo rejected.'}
          </p>
        </Step>
      )}

      {s.dose && (
        <Step n="6" title="Strip minus reference, then the batch curve" ok>
          <div className="duo">
            <div>
              <b>Strip</b>
              <Swatch color={s.dose.strip.measured} label="photo" />
              <Swatch color={s.dose.strip.corrected} label="corrected" />
              <div>ΔE from fresh ink: {fmt(s.dose.strip.dE)}</div>
            </div>
            <div>
              <b>Reference cell</b>
              <Swatch color={s.dose.reference.measured} label="photo" />
              <Swatch color={s.dose.reference.corrected} label="corrected" />
              <div>ΔE from fresh ink: {fmt(s.dose.reference.dE)}</div>
            </div>
          </div>
          <p>
            H₂S signal = {fmt(s.dose.strip.dE)} − {fmt(s.dose.reference.dE)} = <b>{fmt(s.dose.net)} ΔE</b> →{' '}
            <b>{fmt(s.dose.dose)} ppm·hr</b>
          </p>
          <CurveChart curve={s.dose.curve} net={s.dose.net} dose={s.dose.dose} />
          <p className="small">Placeholder curve fitted on simulated data. Lab calibration pending.</p>
        </Step>
      )}

      {s.checks && (
        <Step n="7" title="Pod checks" ok={!s.checks.expired && s.checks.shutter === 'open' && !s.checks.retire}>
          <ul className="facts">
            <li className={s.checks.shutter === 'open' ? 'good' : 'bad'}>
              Shutter: {s.checks.shutter === 'open' ? 'open (green dot)' : s.checks.shutter === 'closed' ? 'closed (red dot)' : 'unclear'}
            </li>
            <li className={s.checks.expired ? 'bad' : 'good'}>
              Expiry indicator: {Math.round(s.checks.wick * 100)}% of the way to the line · {s.checks.ageDays} of {SPEC.shelf_days} days since made
            </li>
            <li className={s.checks.retire ? 'bad' : 'good'}>
              Capacity used: {Math.round(s.checks.capacity * 100)}% (replace at {SPEC.retire_fraction * 100}%)
            </li>
          </ul>
        </Step>
      )}

      {result && (
        <Step n="8" title="Log it">
          <p className="small">Saving to the worker's shift log arrives in the next phase.</p>
        </Step>
      )}
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

export default function Scan({ onBack }) {
  const [mode, setMode] = useState('start')
  const [samples, setSamples] = useState([])
  const [status, setStatus] = useState('')
  const [out, setOut] = useState(null)
  const [preview, setPreview] = useState(null)

  useEffect(() => {
    fetch('/samples/manifest.json')
      .then((r) => r.json())
      .then((m) => setSamples(m.samples))
      .catch(() => setSamples([]))
    loadOpenCv() // start the 10 MB download early
  }, [])

  useEffect(() => {
    if (out) document.querySelector('.results')?.scrollIntoView({ behavior: 'smooth' })
  }, [out])

  async function run(src, sample = null) {
    setOut(null)
    setPreview(src)
    setStatus('Loading the image engine (first time only)…')
    try {
      const { cv } = await loadOpenCv()
      setStatus('Scanning…')
      const data = await fileToImageData(src)
      await new Promise((r) => setTimeout(r, 30)) // let the screen update first
      try {
        setOut({ result: scanPod(cv, data, { mode }), sample })
      } catch (e) {
        if (!e.steps) console.error(e)
        setOut({ error: e, sample })
      }
    } catch (e) {
      setOut({ error: e, sample })
    }
    setStatus('')
  }

  const onFile = (e) => {
    const f = e.target.files?.[0]
    if (f) run(URL.createObjectURL(f))
    e.target.value = ''
  }

  return (
    <main className="scan">
      <button className="link" onClick={onBack}>← Back</button>
      <h1>Scan a pod</h1>
      <p className="note">Demo data, lab validation pending.</p>

      <div className="toggle" role="group" aria-label="Scan type">
        {['start', 'end'].map((m) => (
          <button key={m} className={mode === m ? 'on' : ''} onClick={() => setMode(m)}>
            Shift {m}
          </button>
        ))}
      </div>

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

      <h2>Or pick a sample photo</h2>
      <div className="samples">
        {samples.map((s) => (
          <button key={s.file} className="sample" onClick={() => run(`/samples/${s.file}`, s)}>
            <img src={`/samples/${s.file}`} alt="" loading="lazy" />
            <span>{s.title}</span>
            <span className="small">{s.light}</span>
          </button>
        ))}
      </div>

      {status && <div className="banner">{status}</div>}
      {preview && !status && !out && <img className="picture" src={preview} alt="Selected" />}
      {out && <Results {...out} />}
    </main>
  )
}
