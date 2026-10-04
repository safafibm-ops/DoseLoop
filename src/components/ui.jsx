// Shared bits: icons, chips, page shells with navigation, and the demo guide.
import Coach from './Coach.jsx'
import { STATUS } from '../data/limits.js'
import { SEVERITY } from '../data/log.js'
import { go, TOUR, useStore } from '../data/store.jsx'
import { SEVERITY_ICON, SEVERITY_TONE, STATUS_ICON, STATUS_TONE } from './tokens.js'

const paths = {
  home: 'M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z',
  scan: 'M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3M7 12h10',
  history: 'M4 20V10M10 20V4M16 20v-7M22 20H2',
  pod: 'M6 3h12a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2zM8 7h8v4H8zM8 15h3',
  bell: 'M18 16V11a6 6 0 1 0-12 0v5l-2 2h16zM10 20a2 2 0 0 0 4 0',
  team: 'M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM2 21v-1a6 6 0 0 1 12 0v1M17 11a3 3 0 1 0 0-6M22 21v-1a5 5 0 0 0-4-4.9',
  report: 'M14 3H6a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8zM14 3v5h5M9 13h6M9 17h6',
  check: 'M5 12.5l4.5 4.5L19 7.5',
  alert: 'M12 3.5l9.5 16.5h-19zM12 10v4.5M12 17.4v.2',
  stop: 'M8.2 3h7.6L21 8.2v7.6L15.8 21H8.2L3 15.8V8.2zM9 9l6 6M15 9l-6 6',
  x: 'M6 6l12 12M18 6L6 18',
  info: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 11v6M12 7.4v.2',
  camera: 'M4 8h3l2-3h6l2 3h3a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1zM12 17a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
  upload: 'M12 15V4M7 9l5-5 5 5M4 15v4a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-4',
  download: 'M12 4v11M7 10l5 5 5-5M4 15v4a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-4',
  print: 'M7 9V3h10v6M7 17H5a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2h-2M7 14h10v7H7z',
  phone: 'M8 2h8a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1zM11 18h2',
  torch: 'M8 3h8v4l-2 3v11h-4V10L8 7zM12 13v2',
  flip: 'M4 12a8 8 0 0 1 14-5.3L20 9M20 4v5h-5M20 12a8 8 0 0 1-14 5.3L4 15M4 20v-5h5',
  right: 'M9 6l6 6-6 6',
  down: 'M6 9l6 6 6-6',
  up: 'M6 15l6-6 6 6',
  back: 'M15 6l-6 6 6 6',
  clock: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7v5l3 2',
  exit: 'M15 4h4a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-4M10 17l5-5-5-5M15 12H4',
  play: 'M7 4.5v15l12-7.5z',
  square: 'M6 6h12v12H6z',
  shield: 'M12 3l8 3v6c0 4.5-3.4 8.2-8 9-4.6-.8-8-4.5-8-9V6zM8.5 12l2.5 2.5 4.5-5',
  watch: 'M9 2h6l1 4H8zM8 18h8l-1 4H9zM7 6h10a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1zM12 9v3l2 1',
}

export const Icon = ({ name, size = 22, className }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={className}>
    <path d={paths[name]} />
  </svg>
)

// Status always shows an icon and a word, never colour alone.

export const StatusChip = ({ status, children }) => (
  <span className={`chip tone-${STATUS_TONE[status]}`}>
    <Icon name={STATUS_ICON[status]} size={16} /> {children ?? STATUS[status].label}
  </span>
)

export const SeverityChip = ({ severity }) => (
  <span className={`chip tone-${SEVERITY_TONE[severity]}`}>
    <Icon name={SEVERITY_ICON[severity]} size={16} /> {SEVERITY[severity].label}
  </span>
)

export const DemoNote = () => (
  <p className="demo-note">
    <Icon name="info" size={16} /> Demo data. Lab validation pending.
  </p>
)

export const fmtTime = (iso) => new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
export const fmtDate = (iso) => new Date(iso).toLocaleDateString([], { day: 'numeric', month: 'short' })
export const fmtWhen = (iso) => {
  const d = new Date(iso)
  const today = new Date()
  const y = new Date(today)
  y.setDate(today.getDate() - 1)
  const same = (a, b) => a.toDateString() === b.toDateString()
  const day = same(d, today) ? 'Today' : same(d, y) ? 'Yesterday' : fmtDate(iso)
  return `${day}, ${fmtTime(iso)}`
}

/** The four ink colours of the pod, used as the DoseLoop mark. */
export const Logo = () => (
  <span className="logo-mark" aria-hidden="true">
    <i style={{ background: '#afded0' }} />
    <i style={{ background: '#a7a271' }} />
    <i style={{ background: '#73533a' }} />
    <i style={{ background: '#241e1a' }} />
  </span>
)

const WORKER_TABS = [
  ['/w/home', 'home', 'Home'],
  ['/w/scan', 'scan', 'Scan'],
  ['/w/history', 'history', 'History'],
  ['/w/pod', 'pod', 'Pod'],
  ['/w/alerts', 'bell', 'Alerts'],
]
const SUPER_TABS = [
  ['/s/dashboard', 'team', 'Team'],
  ['/s/alerts', 'bell', 'Alerts'],
  ['/s/reports', 'report', 'Reports'],
]

const initials = (name) =>
  name
    .split(' ')
    .map((p) => p[0])
    .join('')
    .slice(0, 2)

function Header({ title, who, sub }) {
  const { logout, login, state } = useStore()
  const role = state.session?.role
  return (
    <header className="topbar">
      <button className="brand" onClick={() => go('/')} aria-label="DoseLoop home">
        <Logo />
        <span className="brand-name">DoseLoop</span>
      </button>
      <div className="who">
        <span className="avatar small" aria-hidden="true">
          {initials(who)}
        </span>
        <span className="who-text">
          <b>{who}</b>
          <span>{sub}</span>
        </span>
      </div>
      <div className="role-switch" role="group" aria-label="Switch role">
        <button className={role === 'worker' ? 'on' : ''} aria-pressed={role === 'worker'} data-coach="role:worker" onClick={() => (login('worker'), go('/w/home'))}>
          Worker
        </button>
        <button className={role === 'supervisor' ? 'on' : ''} aria-pressed={role === 'supervisor'} data-coach="role:supervisor" onClick={() => (login('supervisor'), go('/s/dashboard'))}>
          Supervisor
        </button>
      </div>
      <button className="exit" onClick={() => (logout(), go('/'))} title={`Log out of ${title}`}>
        <Icon name="exit" size={20} />
        <span>Exit</span>
      </button>
    </header>
  )
}

export function Shell({ kind, path, title, who, sub, children }) {
  const { state } = useStore()
  const tabs = kind === 'worker' ? WORKER_TABS : SUPER_TABS
  const unread = state.alerts.filter((a) => !a.ack && (kind === 'supervisor' || a.workerId === state.session?.workerId)).length
  return (
    <div className={`shell ${kind} ${state.tour ? 'touring' : ''}`}>
      <Header title={title} who={who} sub={sub} />
      <div className="shell-body">
        <nav className="tabbar" aria-label="Main">
          {tabs.map(([p, icon, label]) => {
            const on = path.startsWith(p) || (p === '/s/dashboard' && path.startsWith('/s/worker/'))
            return (
              <button key={p} className={on ? 'on' : ''} aria-current={on ? 'page' : undefined} data-coach={`tab:${p}`} onClick={() => go(p)}>
                <span className="tab-icon">
                  <Icon name={icon} size={24} />
                  {icon === 'bell' && unread > 0 && <em aria-label={`${unread} open`}>{unread}</em>}
                </span>
                <span className="tab-label">{label}</span>
              </button>
            )
          })}
        </nav>
        <main className="page" key={path}>
          {children}
        </main>
      </div>
      <Guide path={path} />
    </div>
  )
}

// Which button the pop-up points at for tour step `n`, given where the judge is now.
function coachFor(n, path, role) {
  const t = TOUR[n]
  const chip = `${n + 1}/${TOUR.length}`
  const wantRole = t.route.startsWith('/s/') ? 'supervisor' : 'worker'
  if (role !== wantRole)
    return wantRole === 'supervisor'
      ? { target: 'role:supervisor', chip, text: 'Switch to Anita, the supervisor', place: 'below left' }
      : { target: 'role:worker', chip, text: 'Switch back to Ravi, the worker', place: 'below left' }
  if (path !== t.route) {
    const tab = t.route.startsWith('/s/') ? 'below above' : 'above below'
    return { target: `tab:${t.route}`, chip, text: `Open ${t.route === '/s/reports' ? 'Reports' : t.route === '/w/scan' ? 'Scan' : 'Team'}`, place: tab }
  }
  if (t.sample) return { target: `sample:${t.sample}`, chip, text: t.coach, place: 'below above' }
  if (t.waitFor === 'export') return { target: 'export:pdf', chip, text: t.coach, place: 'above below right' }
  return null
}

/** Floating card that walks judges through the 2-minute demo, plus the pop-up on the next button. */
export function Guide({ path }) {
  const { state, endTour, login } = useStore()
  const step = state.tour?.step
  if (step == null) return null
  const done = step >= TOUR.length
  const coach = done ? null : coachFor(step, path, state.session?.role)
  return (
    <>
      {coach && <Coach {...coach} />}
      <GuideCard path={path} step={step} done={done} endTour={endTour} login={login} />
    </>
  )
}

function GuideCard({ path, step, done, endTour, login }) {
  const t = TOUR[step]
  const act = () => {
    if (t.role) login(t.role)
    go(t.route)
  }
  return (
    <aside className="guide" aria-live="polite" aria-label="Guided demo">
      <div className="guide-top">
        <span className="guide-badge">Guided demo {done ? '' : `${step + 1}/${TOUR.length}`}</span>
        <span className="guide-dots" aria-hidden="true">
          {TOUR.map((_, i) => (
            <i key={i} className={i < step ? 'done' : i === step ? 'now' : ''} />
          ))}
        </span>
        <button className="icon-btn" onClick={endTour} aria-label="Close guided demo">
          <Icon name="x" size={20} />
        </button>
      </div>
      {done ? (
        <>
          <h4>That’s DoseLoop</h4>
          <p>One wristband, one pod, a phone scan: every worker’s H₂S dose logged per shift, offline, ready for DGMS/OISD.</p>
          <button className="btn primary" onClick={endTour}>
            Explore freely
          </button>
        </>
      ) : (
        <>
          <h4>{t.title}</h4>
          <p>{t.text}</p>
          {path === t.route ? (
            t.hint && <p className="guide-hint">{t.hint}</p>
          ) : (
            <button className="btn primary" onClick={act}>
              {t.role ? 'Switch to supervisor' : 'Go to this step'}
            </button>
          )}
        </>
      )}
    </aside>
  )
}
