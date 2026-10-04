import { BarChart, CountUp, ReadingLine, Ring } from '../components/Charts.jsx'
import PodFace from '../components/PodFace.jsx'
import { DemoNote, fmtDate, fmtTime, fmtWhen, Icon, SeverityChip, StatusChip } from '../components/ui.jsx'
import { SEVERITY_TONE, STATUS_TONE, TONE } from '../components/tokens.js'
import { CAPACITY, IN_USE_DAYS, LIMITS, RETIRE_AT, SHELF_DAYS, shiftStatus } from '../data/limits.js'
import { daysInUse, OFF_SHIFT_TOLERANCE, shiftsOf, workerById, workerSummary } from '../data/log.js'
import { go, useStore } from '../data/store.jsx'

const DAY = 86400000

export function capacityColor(f) {
  return f >= RETIRE_AT ? TONE.over : f >= 0.6 ? TONE.caution : TONE.ok
}

/** Daily bars for the last `days` days (shift doses summed per day). */
export function dailyBars(shifts, days = 14, now = Date.now()) {
  const out = []
  for (let k = days - 1; k >= 0; k--) {
    const d = new Date(now - k * DAY)
    const key = d.toDateString()
    const list = shifts.filter((s) => s.endAt && new Date(s.startAt).toDateString() === key)
    const value = Math.round(list.reduce((t, s) => t + s.dose, 0) * 10) / 10
    out.push({
      key,
      label: d.toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' }),
      short: d.toLocaleDateString([], { day: 'numeric', month: 'short' }),
      value,
      status: list.length ? shiftStatus(value) : undefined,
      sub: list.length ? list.map((s) => `Shift ${s.shift}: ${s.dose}`).join(' · ') : 'Off duty',
    })
  }
  return out
}

export const LIMIT_REFS = [
  { value: LIMITS.shiftIndia, label: `India limit ${LIMITS.shiftIndia}`, scale: false },
  { value: LIMITS.shiftAcgih, label: `ACGIH ${LIMITS.shiftAcgih}`, dashed: true },
]

function PodCard({ pod }) {
  if (!pod) return null
  const reading = pod.lastReading ?? 0
  const f = reading / CAPACITY
  const days = daysInUse(pod)
  return (
    <button className="card pod-card tappable" onClick={() => go('/w/pod')}>
      <Ring value={reading} max={CAPACITY} marker={CAPACITY * RETIRE_AT} label={`${Math.round(f * 100)}%`} sub="used" color={capacityColor(f)} size={104} />
      <div className="grow">
        <h3>Pod {pod.serial}</h3>
        <p className="muted">
          {pod.status === 'assigned'
            ? 'New pod: activates on first scan'
            : `${reading} ppm·hr total · day ${Math.floor(days) + 1} of ${IN_USE_DAYS}`}
        </p>
        {pod.status === 'retire_due' && <StatusChip status="over">Replace this pod</StatusChip>}
        {pod.status === 'active' && <StatusChip status="ok">Active</StatusChip>}
      </div>
      <Icon name="right" size={24} className="go-icon" />
    </button>
  )
}

export function WorkerHome() {
  const { state } = useStore()
  const sum = workerSummary(state, state.session.workerId)
  const { worker, pod, open, last } = sum
  const bars = dailyBars(shiftsOf(state, worker.id), 7)
  return (
    <>
      <section className={`card shift-card ${open ? 'on' : ''}`}>
        <span className={`shift-state ${open ? 'on' : ''}`}>
          <i aria-hidden="true" /> {open ? 'On shift' : 'Off shift'}
        </span>
        <h2>{open ? `Since ${fmtTime(open.startAt)}` : 'Ready to start'}</h2>
        <p className="muted">{open ? `Start reading ${open.startReading} ppm·hr` : 'Open the shutter (green dot), then scan to start.'}</p>
        <button className="btn primary lg block" onClick={() => go('/w/scan')}>
          <Icon name="camera" size={24} />
          {open ? 'Scan to end shift' : 'Scan to start shift'}
        </button>
      </section>

      {last && (
        <button className={`card last-shift tappable edge tone-${STATUS_TONE[shiftStatus(last.dose)]}`} onClick={() => go('/w/history')}>
          <span className="card-label">Last shift · {fmtWhen(last.startAt)}</span>
          <span className="dose-line">
            <span className="big-dose">
              <CountUp value={last.dose} /> <small>ppm·hr</small>
            </span>
            <StatusChip status={shiftStatus(last.dose)} />
          </span>
          <DoseBullet dose={last.dose} />
        </button>
      )}

      <PodCard pod={pod} />

      <section className="card">
        <div className="card-head">
          <h3>Last 7 days</h3>
          <button className="btn ghost sm" onClick={() => go('/w/history')}>
            All shifts <Icon name="right" size={18} />
          </button>
        </div>
        <BarChart bars={bars} refs={LIMIT_REFS} height={160} />
      </section>

      {sum.alerts.length > 0 && (
        <button className="card alert-strip tappable" onClick={() => go('/w/alerts')}>
          <SeverityChip severity={sum.alerts[0].severity} />
          <b className="grow">{sum.alerts[0].title}</b>
          <span className="muted">{sum.alerts.length > 1 ? `+${sum.alerts.length - 1} more` : ''}</span>
          <Icon name="right" size={24} className="go-icon" />
        </button>
      )}
      <DemoNote />
    </>
  )
}

/** Horizontal scale 0 → 100 ppm·hr showing where one shift dose sits against both limits. */
export function DoseBullet({ dose }) {
  const max = 100
  const pct = (v) => `${Math.min(100, (v / max) * 100)}%`
  return (
    <div className="bullet" role="img" aria-label={`${dose} ppm·hr. India shift limit ${LIMITS.shiftIndia}, ACGIH ${LIMITS.shiftAcgih}.`}>
      <div className="bullet-track">
        <i className={`bullet-fill tone-${STATUS_TONE[shiftStatus(dose)]}`} style={{ width: pct(dose) }} />
        <span className="bullet-mark dashed" style={{ left: pct(LIMITS.shiftAcgih) }} title="ACGIH" />
        <span className="bullet-mark" style={{ left: pct(LIMITS.shiftIndia) }} title="India" />
      </div>
      <div className="bullet-labels">
        <span style={{ left: pct(LIMITS.shiftAcgih) }}>ACGIH {LIMITS.shiftAcgih}</span>
        <span style={{ left: pct(LIMITS.shiftIndia) }}>India {LIMITS.shiftIndia}</span>
      </div>
    </div>
  )
}

export function History({ workerId: wid }) {
  const { state } = useStore()
  const workerId = wid ?? state.session.workerId
  const shifts = shiftsOf(state, workerId)
  const done = shifts.filter((s) => s.endAt).reverse()
  const bars = dailyBars(shifts, 14)
  const total = Math.round(bars.reduce((t, b) => t + b.value, 0) * 10) / 10
  const worked = bars.filter((b) => b.status).length
  return (
    <>
      <section className="card">
        <div className="card-head">
          <h3>Daily dose, last 14 days</h3>
        </div>
        <div className="stats-row">
          <div>
            <b>{total}</b>
            <span>ppm·hr total</span>
          </div>
          <div>
            <b>{worked ? Math.round((total / worked) * 10) / 10 : 0}</b>
            <span>avg per shift</span>
          </div>
          <div>
            <b>{Math.max(0, ...bars.map((b) => b.value))}</b>
            <span>highest day</span>
          </div>
        </div>
        <BarChart bars={bars} refs={LIMIT_REFS} />
      </section>
      <section className="card">
        <h3>Shifts</h3>
        <ul className="shift-list">
          {shifts
            .filter((s) => !s.endAt)
            .map((s) => (
              <li key={s.id} className="open">
                <div>
                  <b>{fmtWhen(s.startAt)}</b>
                  <span className="muted">
                    Shift {s.shift} · {s.podSerial} · started at {s.startReading}
                  </span>
                </div>
                <span className="chip live">
                  <i aria-hidden="true" /> On shift
                </span>
              </li>
            ))}
          {done.slice(0, 40).map((s) => (
            <li key={s.id}>
              <div>
                <b>
                  {fmtDate(s.startAt)} · Shift {s.shift}
                </b>
                <span className="muted">
                  {fmtTime(s.startAt)}–{fmtTime(s.endAt)} · {s.podSerial} · {s.startReading} → {s.endReading}
                </span>
                {s.offShift > OFF_SHIFT_TOLERANCE && (
                  <span className="flag">
                    <Icon name="alert" size={16} /> +{s.offShift} ppm·hr while off shift
                  </span>
                )}
              </div>
              <div className="right">
                <b className="num">
                  {s.dose} <small>ppm·hr</small>
                </b>
                <StatusChip status={shiftStatus(s.dose)} />
              </div>
            </li>
          ))}
          {!shifts.length && <li className="empty">No shifts yet. Scan your pod to start one.</li>}
        </ul>
      </section>
      <DemoNote />
    </>
  )
}

export function PodPage({ workerId: wid }) {
  const { state } = useStore()
  const worker = workerById(state, wid ?? state.session.workerId)
  const pod = state.pods[worker.podSerial]
  const reading = pod.lastReading ?? 0
  const f = reading / CAPACITY
  const days = daysInUse(pod)
  const shelf = (Date.now() - new Date(pod.mfgDate)) / DAY
  const points = []
  for (const s of shiftsOf(state, worker.id).filter((x) => x.podSerial === pod.serial)) {
    points.push({ t: new Date(s.startAt).getTime(), v: s.startReading, label: fmtDate(s.startAt), title: `Start of shift ${s.shift}, ${fmtWhen(s.startAt)}` })
    if (s.endAt) points.push({ t: new Date(s.endAt).getTime(), v: s.endReading, label: fmtDate(s.endAt), title: `End of shift ${s.shift}, ${fmtWhen(s.endAt)}` })
  }
  const checks = [
    { label: 'Capacity used', value: f, limit: RETIRE_AT, text: `${Math.round(f * 100)}% (replace at ${RETIRE_AT * 100}%)` },
    { label: 'Days in use', value: days / IN_USE_DAYS, limit: 1, text: pod.activatedAt ? `${Math.floor(days)} of ${IN_USE_DAYS} days` : 'Not activated yet' },
    { label: 'Sealed shelf life', value: shelf / SHELF_DAYS, limit: 1, text: `${Math.floor(shelf)} of ${SHELF_DAYS} days since made` },
  ]
  return (
    <>
      <section className="card pod-hero">
        <PodFace dose={reading} shutterOpen={pod.shutter !== 'closed'} wick={0.15 + shelf / SHELF_DAYS * 0.8} />
        <div className="pod-meta">
          <h2>{pod.serial}</h2>
          <p className="muted">
            Batch {pod.batch} · made {pod.mfgDate}
            {pod.activatedAt ? ` · first scan ${fmtWhen(pod.activatedAt)}` : ''}
          </p>
          <div className="big-dose">
            {reading} <small>ppm·hr on the strip</small>
          </div>
          {pod.status === 'retire_due' ? <StatusChip status="over">Replace this pod now</StatusChip> : pod.status === 'assigned' ? <StatusChip status="caution">Activates on first scan</StatusChip> : <StatusChip status="ok">In service</StatusChip>}
        </div>
      </section>
      <section className="card">
        <h3>Retire checks</h3>
        {checks.map((c) => (
          <div className="meter" key={c.label}>
            <div className="meter-head">
              <span>{c.label}</span>
              <b>{c.text}</b>
            </div>
            <div className="meter-track">
              <i style={{ width: `${Math.min(100, (c.value / c.limit) * 100)}%`, background: capacityColor((c.value / c.limit) * RETIRE_AT) }} />
            </div>
          </div>
        ))}
        <ul className="facts">
          <li>
            <Icon name="check" size={18} className="ok-ic" /> Tamper tab intact (checked on the photo)
          </li>
          <li>
            <Icon name="check" size={18} className="ok-ic" /> No leak events
          </li>
          <li>
            <span className={`shutter-dot ${pod.shutter === 'closed' ? 'closed' : ''}`} aria-hidden="true" />
            {pod.shutter === 'closed' ? 'Shutter closed (red dot)' : 'Shutter open (green dot) at last scan'}
          </li>
        </ul>
      </section>
      <section className="card">
        <h3>Reading over time</h3>
        <ReadingLine points={points} max={CAPACITY * RETIRE_AT} refs={[{ value: CAPACITY * RETIRE_AT, label: 'Replace at 200' }]} />
      </section>
      <DemoNote />
    </>
  )
}

export function AlertsPage({ scope }) {
  const { state, ack } = useStore()
  const list = state.alerts.filter((a) => scope === 'all' || a.workerId === state.session.workerId)
  const open = list.filter((a) => !a.ack)
  const seen = list.filter((a) => a.ack)
  const Item = ({ a }) => {
    const w = workerById(state, a.workerId)
    return (
      <li className={`alert-item tone-${SEVERITY_TONE[a.severity]} ${a.ack ? 'acked' : ''}`}>
        <div className="alert-top">
          <SeverityChip severity={a.severity} />
          <span className="muted small">{fmtWhen(a.at)}</span>
        </div>
        <b>{a.title}</b>
        <span>{a.detail}</span>
        <span className="muted small">
          {scope === 'all' && w ? `${w.name} · ${w.area} · ` : ''}
          {a.podSerial ?? ''}
        </span>
        {!a.ack && (
          <button className="btn secondary sm ack" onClick={() => ack(a.id)}>
            <Icon name="check" size={18} /> {scope === 'all' ? 'Acknowledge' : 'Mark as seen'}
          </button>
        )}
      </li>
    )
  }
  return (
    <>
      <section className="card">
        <h3>Open alerts ({open.length})</h3>
        <ul className="alert-list">
          {open.map((a) => (
            <Item key={a.id} a={a} />
          ))}
          {!open.length && (
            <li className="empty">
              <Icon name="shield" size={28} /> No open alerts.
            </li>
          )}
        </ul>
      </section>
      {seen.length > 0 && (
        <section className="card">
          <h3>Handled</h3>
          <ul className="alert-list">
            {seen.slice(0, 15).map((a) => (
              <Item key={a.id} a={a} />
            ))}
          </ul>
        </section>
      )}
      <DemoNote />
    </>
  )
}
