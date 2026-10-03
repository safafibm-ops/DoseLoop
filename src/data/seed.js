// Seeded demo data: 8 workers, 5 weeks of shifts, pods and alerts.
// Deterministic (same numbers every time) so the demo always tells the same story.
// All of it is DEMO DATA: lab validation pending.
import { CAPACITY, IN_USE_DAYS, LIMITS, RETIRE_AT, shiftStatus } from './limits.js'
import { addAlert, dayKey, OFF_SHIFT_TOLERANCE, round1 } from './log.js'

export const DEMO_WORKER = 'W-1042'
export const DEMO_POD = 'DL-000123'
export const SUPERVISOR = { id: 'S-2001', name: 'Anita Desai', role: 'Shift supervisor' }

const WORKERS = [
  { id: 'W-1042', name: 'Ravi Kumar', area: 'Sulphur Recovery Unit', mean: 7 },
  { id: 'W-1043', name: 'Priya Shetty', area: 'Effluent Treatment Plant', mean: 5 },
  { id: 'W-1044', name: 'Arjun Nair', area: 'Crude Distillation Unit', mean: 2.5 },
  { id: 'W-1045', name: 'Fatima Sheikh', area: 'Hydrotreater', mean: 3.5 },
  { id: 'W-1046', name: 'Suresh Gowda', area: 'Sour Water Stripper', mean: 7.5 },
  { id: 'W-1047', name: 'Meena Rao', area: 'Tank Farm', mean: 3 },
  { id: 'W-1048', name: 'Imran Khan', area: 'Lab and Sampling', mean: 2 },
  { id: 'W-1049', name: 'Deepa Pai', area: 'Sulphur Recovery Unit', mean: 11 },
]

const DAYS_BACK = 35
const SHIFT_START_HOUR = { A: 6, B: 14, C: 22 }

// scripted events so the dashboard has a story
const EVENTS = {
  'W-1048': { day: -3, dose: 86, note: 'sampling line leak' },
  'W-1046': { day: -5, offShift: 9.5 },
  'W-1043': { day: -2, dose: 46 },
  'W-1047': { day: -6, fake: true },
}

function mulberry32(seed) {
  return () => {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function seedState(now = new Date()) {
  const rng = mulberry32(2610)
  const gauss = () => Math.sqrt(-2 * Math.log(1 - rng())) * Math.cos(2 * Math.PI * rng())
  const midnight = new Date(now)
  midnight.setHours(0, 0, 0, 0)
  const at = (day, hour) => new Date(midnight.getTime() + day * 86400000 + hour * 3600000)

  const state = {
    version: 1,
    seededAt: new Date(now).toISOString(),
    nextId: 0,
    workers: [],
    pods: {},
    shifts: [],
    alerts: [],
  }
  let serialNo = 200

  WORKERS.forEach((w, i) => {
    const worker = { id: w.id, name: w.name, area: w.area, podSerial: null }
    state.workers.push(worker)
    const offDay = i % 7
    let pod = null
    const newPod = (day, initial = 0, ageDays = 0) => {
      const serial = `DL-000${serialNo++}`
      const activated = at(day - ageDays, 6)
      pod = state.pods[serial] = {
        serial,
        workerId: w.id,
        batch: 'B2609C',
        mfgDate: dayKey(at(day - ageDays - 12, 0)),
        activatedAt: activated.toISOString(),
        lastReading: round1(initial),
        status: 'active',
      }
      worker.podSerial = serial
    }
    // first pod was already part-used when the history starts
    const age = (i * 4) % 20
    newPod(-DAYS_BACK, age * w.mean * 0.8, age)

    for (let day = -DAYS_BACK; day <= 0; day++) {
      const weekday = (day + DAYS_BACK) % 7
      if (weekday === offDay) continue
      const letter = ['A', 'B', 'C'][(Math.floor((day + DAYS_BACK) / 7) + i) % 3]
      const startAt = at(day, SHIFT_START_HOUR[letter])
      const endAt = new Date(startAt.getTime() + 8 * 3600000)
      if (startAt > now) continue
      if (w.id === 'W-1042' && day === 0) continue // the demo worker's shift today is scanned live

      // replace the pod at the start of a shift if it is due (30 days or 80% capacity)
      const inUse = (startAt - new Date(pod.activatedAt)) / 86400000
      const keepForStory = w.id === 'W-1049' && day > -2 // Deepa's pod is overdue on purpose
      if (!keepForStory && (inUse >= IN_USE_DAYS || pod.lastReading >= CAPACITY * RETIRE_AT)) {
        Object.assign(pod, { status: 'retired', retiredAt: startAt.toISOString(), retiredReason: inUse >= IN_USE_DAYS ? '30 days in use' : '80% capacity used' })
        newPod(day)
        pod.activatedAt = startAt.toISOString()
      }

      const ev = EVENTS[w.id]?.day === day ? EVENTS[w.id] : null
      if (ev?.fake)
        addAlert(state, { at: new Date(startAt.getTime() - 600000), workerId: w.id, podSerial: 'DL-000177', type: 'fake', severity: 'critical', title: 'Unverified pod scanned', detail: 'QR signature did not match. Possible copied or fake pod.' })

      // small drift between shifts, or a scripted off-shift exposure
      const drift = ev?.offShift ?? Math.max(0, gauss() * 0.15)
      const startReading = round1(pod.lastReading + drift)
      const offShift = round1(startReading - pod.lastReading)
      if (offShift > OFF_SHIFT_TOLERANCE)
        addAlert(state, { at: startAt, workerId: w.id, podSerial: pod.serial, type: 'off_shift', severity: 'serious', title: 'Exposure while off shift', detail: `Pod went up ${offShift} ppm·hr between shifts (shutter left open or pod stored near H₂S).` })

      const dose = round1(ev?.dose ?? Math.min(70, w.mean * Math.exp(0.55 * gauss() - 0.15)))
      const shift = {
        id: `sh-seed-${w.id}-${day}`,
        workerId: w.id,
        podSerial: pod.serial,
        date: dayKey(startAt),
        shift: letter,
        startAt: startAt.toISOString(),
        endAt: null,
        startReading,
        endReading: null,
        dose: null,
        offShift,
        source: 'seed',
      }
      state.shifts.push(shift)
      pod.lastReading = startReading
      pod.lastScanAt = startAt.toISOString()
      pod.shutter = 'open'
      if (endAt > now) continue // still on shift

      const endReading = round1(startReading + dose)
      Object.assign(shift, { endAt: endAt.toISOString(), endReading, dose: round1(endReading - startReading) })
      pod.lastReading = endReading
      pod.lastScanAt = endAt.toISOString()
      const status = shiftStatus(shift.dose)
      if (status === 'over')
        addAlert(state, { at: endAt, workerId: w.id, podSerial: pod.serial, type: 'over_limit', severity: 'critical', title: 'Shift dose over limit', detail: `${shift.dose} ppm·hr this shift (limit ${LIMITS.shiftIndia}).${ev?.note ? ` Cause logged: ${ev.note}.` : ''}` })
      else if (status === 'caution')
        addAlert(state, { at: endAt, workerId: w.id, podSerial: pod.serial, type: 'caution', severity: 'warning', title: 'High shift dose', detail: `${shift.dose} ppm·hr this shift (over half the ${LIMITS.shiftIndia} ppm·hr limit).` })
      if (pod.lastReading >= CAPACITY * RETIRE_AT && pod.status !== 'retire_due') {
        pod.status = 'retire_due'
        addAlert(state, { at: endAt, workerId: w.id, podSerial: pod.serial, type: 'retire', severity: 'warning', title: 'Replace pod: capacity used', detail: `${Math.round((pod.lastReading / CAPACITY) * 100)}% of capacity used (replace at ${RETIRE_AT * 100}%).` })
      }
    }
  })

  // the demo worker gets a fresh pod today (the one in the sample photos)
  const ravi = state.workers.find((w) => w.id === DEMO_WORKER)
  const oldPod = state.pods[ravi.podSerial]
  Object.assign(oldPod, { status: 'retired', retiredAt: at(0, 6).toISOString(), retiredReason: 'Replaced: new pod issued today' })
  state.pods[DEMO_POD] = { serial: DEMO_POD, workerId: DEMO_WORKER, batch: 'B2610A', mfgDate: '2026-09-20', activatedAt: null, lastReading: null, status: 'assigned' }
  ravi.podSerial = DEMO_POD

  // alerts older than 7 days were already handled by the supervisor
  const cutoff = new Date(now).getTime() - 7 * 86400000
  for (const a of state.alerts) if (new Date(a.at).getTime() < cutoff) a.ack = true
  state.alerts.sort((a, b) => b.at.localeCompare(a.at))
  state.shifts.sort((a, b) => a.startAt.localeCompare(b.startAt))
  return state
}
