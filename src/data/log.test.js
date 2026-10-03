// Tests for the shift log: seeded demo data and the scan -> shift -> alert rules.
import { describe, expect, it } from 'vitest'
import { applyRejection, applyScan, reportRows, round1, toCsv } from './log.js'
import { DEMO_POD, DEMO_WORKER, seedState } from './seed.js'

const NOW = new Date('2026-10-03T07:00:00')
const scan = (dose, mode) => ({ dose, mode, pod: { serial: DEMO_POD, batch: 'B2610A', mfgDate: '2026-09-20' }, steps: { checks: { shutter: 'open' } } })
const at = (h, m = 0) => new Date(2026, 9, 3 + Math.floor(h / 24), h % 24, m)

describe('seeded demo data', () => {
  const state = seedState(NOW)

  it('has a team, history and a fresh pod for the demo worker', () => {
    expect(state.workers).toHaveLength(8)
    expect(state.shifts.length).toBeGreaterThan(150)
    expect(state.pods[DEMO_POD]).toMatchObject({ workerId: DEMO_WORKER, status: 'assigned', activatedAt: null })
  })

  it('every closed shift dose is end reading minus start reading', () => {
    for (const s of state.shifts.filter((x) => x.endAt)) expect(s.dose).toBeCloseTo(Math.max(0, s.endReading - s.startReading), 1)
  })

  it('no pod has two open shifts, and the demo worker has none', () => {
    const open = state.shifts.filter((s) => !s.endAt)
    expect(new Set(open.map((s) => s.podSerial)).size).toBe(open.length)
    expect(open.some((s) => s.workerId === DEMO_WORKER)).toBe(false)
  })

  it('tells the scripted stories (over limit, off-shift, fake pod)', () => {
    const types = new Set(state.alerts.map((a) => a.type))
    for (const t of ['over_limit', 'caution', 'off_shift', 'fake']) expect(types).toContain(t)
  })
})

describe('applyScan', () => {
  const seeded = seedState(NOW)

  it('start then end logs one shift with dose = end - start', () => {
    const before = seeded.shifts.length
    const a = applyScan(seeded, DEMO_WORKER, scan(1.2, 'start'), at(7))
    expect(a.outcome.kind).toBe('start')
    expect(a.state.pods[DEMO_POD].status).toBe('active')
    const b = applyScan(a.state, DEMO_WORKER, scan(13.6, 'end'), at(14))
    expect(b.outcome).toMatchObject({ kind: 'end', dose: 12.4, status: 'ok' })
    expect(b.state.shifts).toHaveLength(before + 1)
    expect(seeded.shifts).toHaveLength(before) // the old state is never changed
  })

  it('flags off-shift exposure when the next start is higher than the last end', () => {
    let s = applyScan(seeded, DEMO_WORKER, scan(1, 'start'), at(7)).state
    s = applyScan(s, DEMO_WORKER, scan(11, 'end'), at(14)).state
    const c = applyScan(s, DEMO_WORKER, scan(20, 'start'), at(31))
    expect(c.outcome.gap).toBe(9)
    expect(c.outcome.alerts.map((x) => x.type)).toContain('off_shift')
  })

  it('raises a critical alert for a dose over the 80 ppm·hr limit', () => {
    const s = applyScan(seeded, DEMO_WORKER, scan(2, 'start'), at(7)).state
    const r = applyScan(s, DEMO_WORKER, scan(92, 'end'), at(14))
    expect(r.outcome.status).toBe('over')
    expect(r.outcome.alerts[0]).toMatchObject({ type: 'over_limit', severity: 'critical' })
  })

  it('refuses an end scan with no open shift and a pod that belongs to someone else', () => {
    expect(applyScan(seeded, DEMO_WORKER, scan(5, 'end'), at(7)).outcome.kind).toBe('error')
    expect(applyScan(seeded, 'W-1043', scan(5, 'start'), at(7)).outcome.kind).toBe('error')
  })
})

describe('rejections and export', () => {
  const seeded = seedState(NOW)

  it('a fake pod becomes a critical alert', () => {
    const r = applyRejection(seeded, DEMO_WORKER, { code: 'fake', steps: { qr: { serial: 'DL-999999' } } }, at(7))
    expect(r.alert).toMatchObject({ type: 'fake', severity: 'critical', podSerial: 'DL-999999' })
  })

  it('CSV has one line per shift and readable status labels', () => {
    const rows = reportRows(seeded)
    const lines = toCsv(rows).split('\n')
    expect(lines).toHaveLength(rows.length + 1)
    expect(lines[0]).toContain('Shift dose (ppm·hr)')
    expect(lines.slice(1).every((l) => /,(Safe|Caution|Over limit),/.test(l))).toBe(true)
    expect(round1(rows[0].twa * 8)).toBeCloseTo(rows[0].dose, 0)
  })
})
