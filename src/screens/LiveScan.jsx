// The live scan view: shows what the scan engine is doing, stage by stage, on the photo itself.
import { useEffect, useRef, useState } from 'react'

// frame size for a w×h picture: full width, but never taller than 340 px
const frame = (w, h, extra) => ({ aspectRatio: `${w} / ${h}`, '--ar': w / h, ...extra })

const fmt = (n, d = 1) => (Number.isFinite(n) ? n.toFixed(d) : '–')

// How long each stage stays on screen (ms). The engine is usually faster; this is for people to follow.
export const STAGE_MS = { photo: 650, markers: 900, flat: 1100, qr: 800, sampling: 1000, correction: 1700, selfTest: 750, dose: 950, checks: 800 }

export const STAGE_LABEL = {
  photo: 'Photo',
  markers: 'Markers',
  flat: 'Straighten',
  qr: 'Genuine?',
  sampling: 'Sample',
  correction: 'Colour fix',
  selfTest: 'Self-test',
  dose: 'Dose',
  checks: 'Checks',
}

/** Draws an ImageData-like {data, width, height} onto a canvas. */
export function Picture({ image, alt, className = 'picture' }) {
  const ref = useRef(null)
  useEffect(() => {
    if (!image || !ref.current) return
    const c = ref.current
    c.width = image.width
    c.height = image.height
    c.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(image.data), image.width, image.height), 0, 0)
  }, [image])
  return <canvas ref={ref} className={className} aria-label={alt} role="img" />
}

/** The photo with the marker boxes and the pod outline drawn on top. */
export function MarkerPhoto({ photo, markers, animate = false }) {
  return (
    <div className="lv-frame" style={frame(photo.width, photo.height)}>
      <Picture image={photo} alt="Photo of the pod" className="lv-img" />
      {markers && (
        <svg className={`lv-svg ${animate ? 'anim' : ''}`} viewBox="0 0 1 1" preserveAspectRatio="none" aria-hidden="true">
          {markers.boxes.map(([x, y, w, h], i) => (
            <rect key={i} x={x} y={y} width={w} height={h} className="lv-box" style={{ animationDelay: `${i * 60}ms` }} />
          ))}
          {markers.quad && <polygon points={markers.quad.map((p) => p.join(',')).join(' ')} className="lv-quad" pathLength="1" />}
        </svg>
      )}
      {markers?.quad?.map(([x, y], i) => (
        <i key={i} className="lv-corner" style={{ left: `${x * 100}%`, top: `${y * 100}%`, animationDelay: `${300 + i * 90}ms` }} />
      ))}
    </div>
  )
}

/** Before/after slider for the colour correction. */
function Compare({ before, after, sweep }) {
  const [pos, setPos] = useState(sweep ? 100 : 50)
  useEffect(() => {
    if (!sweep) return
    const t = setTimeout(() => setPos(50), 80) // slide the corrected view in once
    return () => clearTimeout(t)
  }, [sweep])
  return (
    <div className="lv-frame compare" style={frame(before.width, before.height, { '--pos': `${pos}%` })}>
      <Picture image={before} alt="Flat pod view as photographed" className="lv-img" />
      <div className="compare-top">
        <Picture image={after} alt="Flat pod view after colour correction" className="lv-img" />
      </div>
      <i className="compare-line" />
      <span className="compare-tag left">Photo</span>
      <span className="compare-tag right">Corrected</span>
      <input type="range" min="0" max="100" value={pos} onChange={(e) => setPos(+e.target.value)} aria-label="Compare photo and corrected colours" />
    </div>
  )
}

/** Flat pod view with every sampled area outlined. */
function SampleMap({ flat, sampling }) {
  flat = sampling.even ?? flat // the view with the light evened out
  const [W, H] = sampling.size
  const areas = [...sampling.patches, ...sampling.scale, { ...sampling.strip, name: 'strip' }, { ...sampling.reference, name: 'reference' }]
  const bad = new Set(sampling.glareRects.map((r) => r.join()))
  return (
    <div className="lv-frame" style={frame(W, H)}>
      <Picture image={flat} alt="Flat pod view" className="lv-img" />
      <svg className="lv-svg anim" viewBox={`0 0 ${W} ${H}`} aria-hidden="true">
        {areas.map((a, i) => (
          <rect
            key={a.name}
            x={a.rect[0]}
            y={a.rect[1]}
            width={a.rect[2]}
            height={a.rect[3]}
            className={`lv-sample ${bad.has(a.rect.join()) ? 'bad' : ''} ${a.name === 'strip' || a.name === 'reference' ? 'key' : ''}`}
            style={{ animationDelay: `${i * 35}ms` }}
          />
        ))}
      </svg>
    </div>
  )
}

const Chip = ({ ok, children }) => <span className={`lv-chip ${ok === false ? 'bad' : ok === 'warn' ? 'warn' : 'good'}`}>{children}</span>

/** What the big panel shows for one stage. */
function Visual({ stage, s, failed }) {
  switch (stage) {
    case 'photo':
      return (
        <div className="lv-frame sweep" style={frame(s.photo.image.width, s.photo.image.height)}>
          <Picture image={s.photo.image} alt="Photo of the pod" className="lv-img" />
        </div>
      )
    case 'markers':
      return <MarkerPhoto photo={s.photo.image} markers={s.markers} animate />
    case 'flat':
      return (
        <div className="lv-straighten" style={{ '--rot': `${fmt(s.flat.rotation, 1)}deg` }}>
          <div className="lv-frame" style={frame(s.flat.image.width, s.flat.image.height)}>
            <Picture image={s.flat.image} alt="Straightened pod" className="lv-img" />
          </div>
        </div>
      )
    case 'qr':
      return (
        <div className="lv-qr">
          <div className="lv-frame sweep" style={frame(s.qr.image.width, s.qr.image.height)}>
            <Picture image={s.qr.image} alt="QR code" className="lv-img" />
          </div>
          <div className="lv-qr-result">
            {s.qr.text ? (
              <Chip ok={!!s.qr.valid}>{s.qr.valid ? `✓ Genuine · ${s.qr.serial}` : '✕ Signature does not match'}</Chip>
            ) : (
              <Chip ok={false}>✕ QR not readable</Chip>
            )}
            <span className="small muted">Ed25519 signature, checked offline</span>
          </div>
        </div>
      )
    case 'sampling':
      return <SampleMap flat={s.flat.image} sampling={s.sampling} />
    case 'correction':
      return <Compare before={s.flat.image} after={s.correction.image} sweep />
    case 'selfTest': {
      const h = s.selfTest.holdout
      return (
        <div className="lv-swatches">
          <p className="small muted">Held-out 25 ppm·hr brown (not used for the fit)</p>
          <div className="lv-sw-row">
            <span className="lv-sw" style={{ background: h.measured }}>Photo</span>
            <span className="lv-arrow">→</span>
            <span className="lv-sw" style={{ background: h.corrected }}>Corrected</span>
            <span className="lv-arrow">≈</span>
            <span className="lv-sw" style={{ background: h.truth }}>Printed</span>
          </div>
          <Chip ok={s.selfTest.good ?? s.selfTest.pass ? true : s.selfTest.pass ? 'warn' : false}>
            {s.selfTest.pass ? (s.selfTest.good === false ? '!' : '✓') : '✕'} {fmt(s.selfTest.dE)} ΔE off (best under {s.selfTest.limit}, retake over {s.selfTest.retake})
          </Chip>
        </div>
      )
    }
    case 'dose':
      return (
        <div className="lv-swatches">
          <div className="lv-sw-row">
            <span className="lv-sw" style={{ background: s.dose.strip.corrected }}>
              Strip
              <small>{fmt(s.dose.strip.dE)} ΔE</small>
            </span>
            <span className="lv-arrow">−</span>
            <span className="lv-sw" style={{ background: s.dose.reference.corrected }}>
              Reference
              <small>{fmt(s.dose.reference.dE)} ΔE</small>
            </span>
            <span className="lv-arrow">=</span>
            <span className="lv-net">{fmt(s.dose.net)} ΔE</span>
          </div>
          <div className="lv-dose">
            {fmt(s.dose.dose)} <small>ppm·hr on the pod</small>
          </div>
          <p className="small muted">Batch curve (placeholder until lab calibration)</p>
        </div>
      )
    case 'checks':
      return (
        <div className="lv-checks">
          <Chip ok={s.checks.shutter === 'open' ? true : s.checks.shutter === 'closed' ? 'warn' : false}>Shutter {s.checks.shutter}</Chip>
          <Chip ok={!s.checks.expired}>Expiry {Math.round(s.checks.wick * 100)}%</Chip>
          <Chip ok={s.checks.ageDays <= 90}>{s.checks.ageDays} days old</Chip>
          <Chip ok={s.checks.retire ? 'warn' : true}>{Math.round(s.checks.capacity * 100)}% capacity used</Chip>
          {failed && <span className="small muted">See the result below</span>}
        </div>
      )
    default:
      return null
  }
}

function caption(stage, s) {
  switch (stage) {
    case 'photo':
      return 'Analysing the photo…'
    case 'markers':
      return s.markers.quad ? `Found the 4 corner markers${s.markers.tries > 1 ? ` (try ${s.markers.tries})` : ''}` : `Found ${s.markers.found} of 4 corner markers`
    case 'flat': {
      return `Straightened: rotated ${Math.abs(Math.round(s.flat.rotation))}°, perspective tilt ${Math.round(s.flat.tilt * 100)}% corrected`
    }
    case 'qr':
      return !s.qr.text
        ? `QR code not readable (${s.qr.tries ?? 1} ways tried)`
        : s.qr.valid
          ? `Genuine pod: QR signature verified${s.qr.tries > 1 ? ` (read on try ${s.qr.tries})` : ''}`
          : 'QR signature does not match: copied or fake pod'
    case 'sampling': {
      if (s.sampling.glare) return `Glare on ${s.sampling.glare} area(s)`
      const n = s.sampling.patches.length + s.sampling.scale.length + 2 - (s.sampling.skipped?.length ?? 0)
      const light = s.sampling.lightSpread > 1.15 ? `Evened out uneven light (${Math.round((s.sampling.lightSpread - 1) * 100)}% brighter on one side), ` : ''
      const skip = s.sampling.skipped?.length ? `, ${s.sampling.skipped.join(' & ')} over-exposed so left out` : ''
      return `${light}${light ? 's' : 'S'}ampled ${n} colour areas${skip}`
    }
    case 'correction':
      return s.correction.meanGlobalDE != null
        ? `Colour corrected for light and camera · average error ${fmt(s.correction.meanGlobalDE)} ΔE, ${fmt(s.correction.meanFitDE)} after the local fix`
        : `Colour corrected for light and camera · ${fmt(s.correction.meanFitDE)} ΔE average error`
    case 'selfTest':
      return !s.selfTest.pass ? 'Self-test failed' : s.selfTest.good === false ? 'Self-test passed, lower confidence' : 'Self-test passed'
    case 'dose':
      return 'Strip minus reference → dose'
    case 'checks':
      return 'Checking shutter, expiry and capacity'
    default:
      return ''
  }
}

/**
 * Big live panel + stage bar.
 * shown: stages already on screen (the last one is current); running: engine still working.
 */
export function LiveView({ shown, steps, running, failed, stages }) {
  const stage = shown[shown.length - 1]
  return (
    <section className={`card live ${failed ? 'failed' : ''}`} aria-live="polite">
      <div className="lv-bar" role="list" aria-label="Scan progress">
        {stages.map((st) => {
          const i = shown.indexOf(st)
          const state = i < 0 ? '' : st === stage ? (failed ? 'fail' : running || i === shown.length - 1 ? 'now' : 'done') : 'done'
          return (
            <span key={st} role="listitem" className={`lv-seg ${state}`} title={STAGE_LABEL[st]}>
              <i />
              <em>{STAGE_LABEL[st]}</em>
            </span>
          )
        })}
      </div>
      <div className="lv-stage" key={stage ?? 'wait'}>
        {stage ? <Visual stage={stage} s={steps} failed={failed} /> : <div className="lv-wait"><span className="spinner" /> Loading the image engine…</div>}
      </div>
      {stage && (
        <p className={`lv-caption ${failed ? 'bad' : ''}`}>
          {running && <span className="spinner small" />} {caption(stage, steps)}
        </p>
      )}
    </section>
  )
}
