import { useEffect, useState } from 'react'
import { Heatmap } from '../components/Charts.jsx'
import { DemoNote, fmtWhen, Icon, SeverityChip, StatusChip } from '../components/ui.jsx'
import { SEVERITY_TONE } from '../components/tokens.js'
import { CAPACITY, LIMITS, shiftStatus } from '../data/limits.js'
import { closedShifts, REPORT_COLUMNS, reportRows, round1, toCsv, workerById, workerSummary } from '../data/log.js'
import { go, useStore } from '../data/store.jsx'
import { capacityColor, History } from './Worker.jsx'

const DAY = 86400000
const RANGES = [7, 14, 30]

function RangePicker({ days, setDays, options = RANGES }) {
  return (
    <div className="segmented" role="group" aria-label="Date range">
      {options.map((d) => (
        <button key={d} className={days === d ? 'on' : ''} aria-pressed={days === d} onClick={() => setDays(d)}>
          Last {d} days
        </button>
      ))}
    </div>
  )
}

const startOfDay = (ms) => {
  const d = new Date(ms)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

export function Dashboard() {
  const { state, ack, tourEvent } = useStore()
  const [days, setDays] = useState(14)
  useEffect(() => {
    tourEvent('supervisor')
  }, [tourEvent])

  const now = Date.now()
  const from = startOfDay(now - (days - 1) * DAY)
  const shifts = closedShifts(state, from)
  const onShift = state.shifts.filter((s) => !s.endAt)
  const openAlerts = state.alerts.filter((a) => !a.ack)
  const top = shifts.reduce((m, s) => (!m || s.dose > m.dose ? s : m), null)

  // heatmap: total dose per worker per day
  const cols = []
  for (let k = days - 1; k >= 0; k--) {
    const d = new Date(now - k * DAY)
    cols.push({ key: d.toDateString(), label: d.getDate(), title: d.toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' }) })
  }
  const byCell = {}
  for (const s of shifts) {
    const k = `${s.workerId}|${new Date(s.startAt).toDateString()}`
    byCell[k] = byCell[k] ?? { value: 0, list: [] }
    byCell[k].value = round1(byCell[k].value + s.dose)
    byCell[k].list.push(`Shift ${s.shift}: ${s.dose}`)
  }
  const cell = (wid, key) => {
    const c = byCell[`${wid}|${key}`]
    return c ? { value: c.value, status: shiftStatus(c.value), sub: c.list.join(' · ') } : null
  }
  const rows = state.workers.map((w) => ({ id: w.id, label: w.name, sub: w.area }))

  return (
    <>
      <div className="filters">
        <RangePicker days={days} setDays={setDays} options={[7, 14]} />
      </div>
      <section className="kpis">
        <div className="kpi">
          <span>On shift now</span>
          <b>{onShift.length}</b>
          <em>of {state.workers.length} workers</em>
        </div>
        <div className="kpi">
          <span>Shifts logged</span>
          <b>{shifts.length}</b>
          <em>last {days} days</em>
        </div>
        <button className={`kpi tappable ${openAlerts.length ? 'hot' : ''}`} onClick={() => go('/s/alerts')}>
          <span>{openAlerts.length > 0 && <Icon name="alert" size={16} />} Open alerts</span>
          <b>{openAlerts.length}</b>
          <em>{openAlerts.filter((a) => a.severity === 'critical').length} critical</em>
        </button>
        <div className="kpi">
          <span>Highest shift dose</span>
          <b>{top ? top.dose : '–'}</b>
          <em>{top ? `${workerById(state, top.workerId)?.name}, ${new Date(top.startAt).toLocaleDateString([], { day: 'numeric', month: 'short' })}` : ''}</em>
        </div>
      </section>

      <section className="card">
        <div className="card-head">
          <h3>Team exposure by day</h3>
          <span className="muted small">Select a worker for details</span>
        </div>
        <Heatmap rows={rows} cols={cols} cell={cell} max={30} onRowClick={(r) => go(`/s/worker/${r.id}`)} />
      </section>

      <div className="two-col">
        <section className="card">
          <h3>Team</h3>
          <ul className="team-list">
            {state.workers.map((w) => {
              const sum = workerSummary(state, w.id, now)
              const f = (sum.pod?.lastReading ?? 0) / CAPACITY
              return (
                <li key={w.id} onClick={() => go(`/s/worker/${w.id}`)} onKeyDown={(e) => e.key === 'Enter' && go(`/s/worker/${w.id}`)} role="button" tabIndex={0}>
                  <span className={`dot ${sum.open ? 'live' : ''}`} title={sum.open ? 'On shift' : 'Off shift'} />
                  <div className="grow">
                    <b>{w.name}</b>
                    <span className="muted small">
                      {sum.open ? 'On shift' : 'Off shift'} · {w.area} · {sum.pod?.serial}
                    </span>
                    <div className="mini-track" title={`Pod ${Math.round(f * 100)}% used`}>
                      <i style={{ width: `${Math.min(100, f * 100)}%`, background: capacityColor(f) }} />
                    </div>
                  </div>
                  <div className="right">
                    {sum.last ? <StatusChip status={shiftStatus(sum.last.dose)}>{sum.last.dose}</StatusChip> : <span className="muted small">no shifts</span>}
                    {sum.alerts.length > 0 && (
                      <span className="badge-count" title="Open alerts">
                        <Icon name="bell" size={14} /> {sum.alerts.length}
                      </span>
                    )}
                  </div>
                </li>
              )
            })}
          </ul>
        </section>
        <section className="card">
          <div className="card-head">
            <h3>Needs attention</h3>
            <button className="btn ghost sm" onClick={() => go('/s/alerts')}>
              All alerts <Icon name="right" size={18} />
            </button>
          </div>
          <ul className="alert-list">
            {openAlerts.slice(0, 4).map((a) => (
              <li key={a.id} className={`alert-item tone-${SEVERITY_TONE[a.severity]}`}>
                <div className="alert-top">
                  <SeverityChip severity={a.severity} />
                  <span className="muted small">{fmtWhen(a.at)}</span>
                </div>
                <b>{a.title}</b>
                <span>
                  {workerById(state, a.workerId)?.name}: {a.detail}
                </span>
                <button className="btn secondary sm ack" onClick={() => ack(a.id)}>
                  <Icon name="check" size={18} /> Acknowledge
                </button>
              </li>
            ))}
            {!openAlerts.length && (
              <li className="empty">
                <Icon name="shield" size={28} /> All clear. No open alerts.
              </li>
            )}
          </ul>
        </section>
      </div>
      <DemoNote />
    </>
  )
}

export function WorkerDetail({ id }) {
  const { state } = useStore()
  const w = workerById(state, id)
  if (!w) return <p className="empty">Worker not found.</p>
  const sum = workerSummary(state, id)
  const f = (sum.pod?.lastReading ?? 0) / CAPACITY
  return (
    <>
      <button className="btn ghost back" onClick={() => go('/s/dashboard')}>
        <Icon name="back" size={20} /> Team
      </button>
      <section className="card worker-head">
        <span className="avatar">{w.name.split(' ').map((p) => p[0]).join('')}</span>
        <div className="grow">
          <h2>{w.name}</h2>
          <p className="muted">
            {w.id} · {w.area}
          </p>
        </div>
        <div className="right">
          {sum.open ? (
            <span className="chip live">
              <i aria-hidden="true" /> On shift
            </span>
          ) : (
            <span className="chip off">Off shift</span>
          )}
        </div>
      </section>
      <section className="kpis">
        <div className="kpi">
          <span>14-day total</span>
          <b>{sum.total14}</b>
          <em>ppm·hr</em>
        </div>
        <div className="kpi">
          <span>Highest shift</span>
          <b>{sum.max14}</b>
          <em>limit {LIMITS.shiftIndia}</em>
        </div>
        <div className="kpi">
          <span>Pod {sum.pod?.serial}</span>
          <b>{Math.round(f * 100)}%</b>
          <em>capacity used</em>
          <span className="mini-track" aria-hidden="true">
            <i style={{ width: `${Math.min(100, f * 100)}%`, background: capacityColor(f) }} />
          </span>
        </div>
      </section>
      <History workerId={id} />
    </>
  )
}

function download(name, blob) {
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = name
  document.body.appendChild(a)
  a.click()
  setTimeout(() => {
    URL.revokeObjectURL(a.href)
    a.remove()
  }, 1000)
}

async function makePdf(rows, { days, workerLabel }) {
  const [{ jsPDF }, { autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')])
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })
  const now = new Date()
  doc.setFontSize(16)
  doc.text('H2S Personal Exposure Register', 14, 16)
  doc.setFontSize(10)
  doc.text(`DoseLoop passive dosimeter · MRPL · ${workerLabel} · last ${days} days · generated ${now.toLocaleString()}`, 14, 23)
  doc.setTextColor(200, 40, 40)
  doc.text('DEMO DATA - lab validation pending. Column layout is a draft of the DGMS/OISD register.', 14, 29)
  doc.setTextColor(0, 0, 0)
  const cols = REPORT_COLUMNS.filter(([k]) => k !== 'area')
  autoTable(doc, {
    startY: 34,
    head: [cols.map(([, h]) => h.replace('ppm·hr', 'ppm.hr'))],
    body: rows.map((r) => cols.map(([k]) => (k === 'status' ? { ok: 'Safe', caution: 'Caution', over: 'OVER LIMIT' }[r.status] : r[k]))),
    styles: { fontSize: 7.5, cellPadding: 1.4 },
    headStyles: { fillColor: [255, 106, 19], textColor: 20 },
    didParseCell: (d) => {
      if (d.section === 'body' && d.row.raw[11] === 'OVER LIMIT') d.cell.styles.textColor = [200, 30, 30]
    },
  })
  const y = doc.lastAutoTable.finalY + 10
  const over = rows.filter((r) => r.status === 'over').length
  doc.text(`Shifts: ${rows.length}   Over limit (${LIMITS.shiftIndia} ppm.hr): ${over}   Off-shift exposure events: ${rows.filter((r) => r.offShift).length}`, 14, Math.min(y, 190))
  doc.text('Supervisor signature: ____________________     Safety officer: ____________________', 14, Math.min(y + 8, 198))
  const pages = doc.getNumberOfPages()
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i)
    doc.setFontSize(8)
    doc.text(`Page ${i} of ${pages}`, 283, 205, { align: 'right' })
  }
  return doc.output('blob')
}

export function Reports() {
  const { state, tourEvent } = useStore()
  const [days, setDays] = useState(30)
  const [workerId, setWorkerId] = useState('all')
  const [busy, setBusy] = useState(false)
  const from = startOfDay(Date.now() - (days - 1) * DAY)
  const rows = reportRows(state, { fromMs: from, workerId })
  const total = round1(rows.reduce((t, r) => t + r.dose, 0))
  const over = rows.filter((r) => r.status === 'over').length
  const off = rows.filter((r) => r.offShift).length
  const workerLabel = workerId === 'all' ? 'All workers' : workerById(state, workerId)?.name
  const stamp = new Date().toISOString().slice(0, 10)

  const csv = () => {
    download(`doseloop-register-${stamp}.csv`, new Blob(['\ufeff' + toCsv(rows)], { type: 'text/csv;charset=utf-8' }))
    tourEvent('export')
  }
  const pdf = async () => {
    setBusy(true)
    try {
      download(`doseloop-register-${stamp}.pdf`, await makePdf(rows, { days, workerLabel }))
      tourEvent('export')
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <div className="filters">
        <RangePicker days={days} setDays={setDays} />
        <select className="select" value={workerId} onChange={(e) => setWorkerId(e.target.value)} aria-label="Worker">
          <option value="all">All workers</option>
          {state.workers.map((w) => (
            <option key={w.id} value={w.id}>
              {w.name}
            </option>
          ))}
        </select>
      </div>
      <section className="kpis">
        <div className="kpi">
          <span>Shifts</span>
          <b>{rows.length}</b>
          <em>{workerLabel}</em>
        </div>
        <div className="kpi">
          <span>Total dose</span>
          <b>{total}</b>
          <em>ppm·hr</em>
        </div>
        <div className={`kpi ${over ? 'hot' : ''}`}>
          <span>{over > 0 && <Icon name="stop" size={16} />} Over limit</span>
          <b>{over}</b>
          <em>shifts &gt; {LIMITS.shiftIndia} ppm·hr</em>
        </div>
        <div className="kpi">
          <span>Off-shift events</span>
          <b>{off}</b>
          <em>pod changed between shifts</em>
        </div>
      </section>
      <section className="card">
        <div className="card-head">
          <h3>Exposure register</h3>
          <div className="actions">
            <button className="btn primary" data-coach="export:pdf" onClick={pdf} disabled={busy || !rows.length}>
              {busy ? <span className="spinner small" /> : <Icon name="download" size={20} />}
              {busy ? 'Making PDF…' : 'Download PDF'}
            </button>
            <button className="btn secondary" onClick={csv} disabled={!rows.length}>
              <Icon name="download" size={20} /> Download CSV
            </button>
          </div>
        </div>
        <p className="muted small">Columns are a draft of the DGMS/OISD register; align with the official template once received.</p>
        {!rows.length && <p className="empty">No shifts in this range. Pick a longer range or another worker.</p>}
        <div className="table-scroll">
          <table className="rtable">
            <thead>
              <tr>
                {REPORT_COLUMNS.map(([k, h]) => (
                  <th key={k}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows
                .slice(-15)
                .reverse()
                .map((r, i) => (
                  <tr key={i} className={r.status}>
                    {REPORT_COLUMNS.map(([k]) => (
                      <td key={k}>{k === 'status' ? <StatusChip status={r.status} /> : r[k]}</td>
                    ))}
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
        {rows.length > 15 && <p className="muted small">Showing the latest 15 of {rows.length} rows. The download has all of them.</p>}
      </section>
      <DemoNote />
    </>
  )
}
