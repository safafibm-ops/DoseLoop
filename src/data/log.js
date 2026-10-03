// Shift log logic: turns scan results into shifts and alerts.
// Pure functions on a plain state object, so they are easy to test and to save in IndexedDB.
import { CAPACITY, IN_USE_DAYS, LIMITS, RETIRE_AT, shiftStatus, STATUS } from './limits.js'

export const OFF_SHIFT_TOLERANCE = 2 // ppm·hr the pod may change between shifts before we flag it
export const READING_DROP_TOLERANCE = 3 // a reading this much lower than the last one is suspicious
const DAY = 86400000

export const SEVERITY = {
  critical: { label: 'Critical', icon: '✕', color: '#d03b3b' },
  serious: { label: 'Serious', icon: '▲', color: '#ec835a' },
  warning: { label: 'Warning', icon: '!', color: '#fab219' },
}

export const round1 = (x) => Math.round(x * 10) / 10
export const dayKey = (d) => {
  const t = new Date(d)
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`
}
export const shiftLetter = (d) => {
  const h = new Date(d).getHours()
  return h >= 6 && h < 14 ? 'A' : h >= 14 && h < 22 ? 'B' : 'C'
}

const nextId = (state, prefix) => `${prefix}-${++state.nextId}`

export function addAlert(state, { at, workerId, podSerial, type, severity, title, detail }) {
  const alert = { id: nextId(state, 'al'), at: new Date(at).toISOString(), workerId, podSerial, type, severity, title, detail, ack: false }
  state.alerts.unshift(alert)
  return alert
}

export const openShiftFor = (state, podSerial) => state.shifts.find((s) => s.podSerial === podSerial && !s.endAt)
export const workerById = (state, id) => state.workers.find((w) => w.id === id)

/** Days the pod has been in use (first scan to `now`). */
export const daysInUse = (pod, now = Date.now()) => (pod?.activatedAt ? (now - new Date(pod.activatedAt)) / DAY : 0)

/**
 * Log a successful scan for `workerId`. Returns a NEW state plus what happened.
 * result: the scan pipeline's result ({ dose, mode, pod: { serial, batch, mfgDate }, steps })
 */
export function applyScan(prev, workerId, result, now = new Date()) {
  const state = structuredClone(prev)
  const at = new Date(now).toISOString()
  const serial = result.pod.serial
  const reading = round1(result.dose)
  const worker = workerById(state, workerId)
  const raised = []
  const alert = (a) => raised.push(addAlert(state, { at, workerId, podSerial: serial, ...a }))

  let pod = state.pods[serial]
  if (pod && pod.workerId !== workerId) {
    const owner = workerById(state, pod.workerId)
    alert({ type: 'pod_mismatch', severity: 'serious', title: 'Pod belongs to another worker', detail: `${serial} is assigned to ${owner?.name ?? pod.workerId}.` })
    return { state, outcome: { kind: 'error', message: `This pod is assigned to ${owner?.name ?? pod.workerId}. Use your own pod.`, alerts: raised } }
  }
  if (!pod) {
    // a new pod for this worker: it replaces the old one
    const old = worker?.podSerial ? state.pods[worker.podSerial] : null
    if (old && !openShiftFor(state, old.serial)) Object.assign(old, { status: 'retired', retiredAt: at, retiredReason: 'Replaced by a new pod' })
    pod = state.pods[serial] = { serial, workerId, batch: result.pod.batch, mfgDate: result.pod.mfgDate, activatedAt: null, lastReading: null, status: 'assigned' }
    if (worker) worker.podSerial = serial
  }
  if (!pod.activatedAt) {
    pod.activatedAt = at
    pod.status = 'active'
  }
  const open = openShiftFor(state, serial)
  let outcome

  if (result.mode === 'start') {
    if (open) return { state: prev, outcome: { kind: 'error', message: 'A shift is already open on this pod. Scan the end of shift instead.', alerts: [] } }
    const gap = pod.lastReading == null ? 0 : round1(reading - pod.lastReading)
    if (gap > OFF_SHIFT_TOLERANCE)
      alert({ type: 'off_shift', severity: 'serious', title: 'Exposure while off shift', detail: `Pod went up ${gap} ppm·hr between shifts (shutter left open or pod stored near H₂S).` })
    if (gap < -READING_DROP_TOLERANCE)
      alert({ type: 'reading_drop', severity: 'serious', title: 'Reading lower than last scan', detail: `Pod reads ${-gap} ppm·hr less than at the last scan. Possible pod swap.` })
    const shift = { id: nextId(state, 'sh'), workerId, podSerial: serial, date: dayKey(now), shift: shiftLetter(now), startAt: at, endAt: null, startReading: reading, endReading: null, dose: null, offShift: gap, source: 'scan' }
    state.shifts.push(shift)
    outcome = { kind: 'start', shift, gap, alerts: raised }
  } else {
    if (!open) return { state: prev, outcome: { kind: 'error', message: 'No open shift on this pod. Scan the start of your shift first.', alerts: [] } }
    let dose = round1(reading - open.startReading)
    if (dose < -READING_DROP_TOLERANCE)
      alert({ type: 'reading_drop', severity: 'serious', title: 'End reading lower than start', detail: `End ${reading} < start ${open.startReading} ppm·hr. Possible pod swap.` })
    dose = Math.max(0, dose)
    Object.assign(open, { endAt: at, endReading: reading, dose })
    const status = shiftStatus(dose)
    if (status === 'over')
      alert({ type: 'over_limit', severity: 'critical', title: 'Shift dose over limit', detail: `${dose} ppm·hr this shift (limit ${LIMITS.shiftIndia}).` })
    else if (status === 'caution')
      alert({ type: 'caution', severity: 'warning', title: 'High shift dose', detail: `${dose} ppm·hr this shift (over half the ${LIMITS.shiftIndia} ppm·hr limit).` })
    outcome = { kind: 'end', shift: open, dose, status, alerts: raised }
  }

  pod.lastReading = reading
  pod.lastScanAt = at
  pod.shutter = result.steps?.checks?.shutter ?? null
  if (reading / CAPACITY >= RETIRE_AT && pod.status !== 'retire_due') {
    pod.status = 'retire_due'
    alert({ type: 'retire', severity: 'warning', title: 'Replace pod: capacity used', detail: `${Math.round((reading / CAPACITY) * 100)}% of capacity used (replace at ${RETIRE_AT * 100}%).` })
  }
  if (daysInUse(pod, new Date(now).getTime()) >= IN_USE_DAYS && pod.status !== 'retire_due') {
    pod.status = 'retire_due'
    alert({ type: 'in_use_limit', severity: 'warning', title: 'Replace pod: 30 days in use', detail: `In use for ${Math.floor(daysInUse(pod, new Date(now).getTime()))} days.` })
  }
  return { state, outcome }
}

/** Log a rejected scan. Only security-relevant rejections become alerts. */
export function applyRejection(prev, workerId, error, now = new Date()) {
  const types = {
    fake: { type: 'fake', severity: 'critical', title: 'Unverified pod scanned', detail: 'QR signature did not match. Possible copied or fake pod.' },
    expired: { type: 'expired', severity: 'critical', title: 'Expired pod scanned', detail: 'Expiry indicator reached the line. Pod must be replaced.' },
  }
  const t = types[error.code]
  if (!t) return { state: prev, alert: null }
  const state = structuredClone(prev)
  const serial = error.steps?.qr?.serial ?? null
  const alert = addAlert(state, { at: now, workerId, podSerial: serial, ...t })
  return { state, alert }
}

export function ackAlert(prev, id) {
  const state = structuredClone(prev)
  const a = state.alerts.find((x) => x.id === id)
  if (a) a.ack = true
  return state
}

// ---------- selectors ----------
export const shiftsOf = (state, workerId) =>
  state.shifts.filter((s) => s.workerId === workerId).sort((a, b) => a.startAt.localeCompare(b.startAt))

export const closedShifts = (state, fromMs = 0) => state.shifts.filter((s) => s.endAt && new Date(s.startAt).getTime() >= fromMs)

export function workerSummary(state, workerId, now = Date.now()) {
  const shifts = shiftsOf(state, workerId)
  const done = shifts.filter((s) => s.endAt)
  const last = done[done.length - 1] ?? null
  const worker = workerById(state, workerId)
  const pod = worker?.podSerial ? state.pods[worker.podSerial] : null
  const since = now - 14 * DAY
  const recent = done.filter((s) => new Date(s.startAt).getTime() >= since)
  return {
    worker,
    pod,
    open: pod ? openShiftFor(state, pod.serial) ?? null : null,
    last,
    recent,
    total14: round1(recent.reduce((t, s) => t + s.dose, 0)),
    max14: recent.reduce((m, s) => Math.max(m, s.dose), 0),
    alerts: state.alerts.filter((a) => a.workerId === workerId && !a.ack),
  }
}

/** Rows for the exposure register (CSV/PDF). */
export function reportRows(state, { fromMs = 0, workerId = 'all' } = {}) {
  return closedShifts(state, fromMs)
    .filter((s) => workerId === 'all' || s.workerId === workerId)
    .sort((a, b) => a.startAt.localeCompare(b.startAt))
    .map((s) => {
      const w = workerById(state, s.workerId)
      return {
        date: s.date,
        shift: s.shift,
        workerId: s.workerId,
        name: w?.name ?? '',
        area: w?.area ?? '',
        pod: s.podSerial,
        start: new Date(s.startAt).toTimeString().slice(0, 5),
        end: new Date(s.endAt).toTimeString().slice(0, 5),
        startReading: s.startReading,
        endReading: s.endReading,
        dose: s.dose,
        twa: round1(s.dose / LIMITS.shiftHours),
        status: shiftStatus(s.dose),
        offShift: s.offShift > OFF_SHIFT_TOLERANCE ? s.offShift : 0,
      }
    })
}

export const REPORT_COLUMNS = [
  ['date', 'Date'],
  ['shift', 'Shift'],
  ['workerId', 'Worker ID'],
  ['name', 'Name'],
  ['area', 'Area'],
  ['pod', 'Pod serial'],
  ['start', 'Start'],
  ['end', 'End'],
  ['startReading', 'Start reading (ppm·hr)'],
  ['endReading', 'End reading (ppm·hr)'],
  ['dose', 'Shift dose (ppm·hr)'],
  ['twa', '8-h TWA (ppm)'],
  ['status', 'Status'],
  ['offShift', 'Off-shift change (ppm·hr)'],
]

export function toCsv(rows) {
  const esc = (v) => {
    const s = String(v ?? '')
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  const cell = (r, k) => (k === 'status' ? STATUS[r.status]?.label ?? r.status : r[k])
  const head = REPORT_COLUMNS.map(([, h]) => esc(h)).join(',')
  return [head, ...rows.map((r) => REPORT_COLUMNS.map(([k]) => esc(cell(r, k))).join(','))].join('\n')
}
