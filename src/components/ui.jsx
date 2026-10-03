// Shared bits: icons, chips, page shells with navigation, and the demo guide.
import { STATUS } from '../data/limits.js'
import { SEVERITY } from '../data/log.js'
import { go, TOUR, useStore } from '../data/store.jsx'

const paths = {
  home: 'M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z',
  scan: 'M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3M7 12h10',
  history: 'M4 20V10M10 20V4M16 20v-7M22 20H2',
  pod: 'M6 3h12a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2zM8 7h8v4H8zM8 15h3',
  bell: 'M18 16V11a6 6 0 1 0-12 0v5l-2 2h16zM10 20a2 2 0 0 0 4 0',
  team: 'M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM2 21v-1a6 6 0 0 1 12 0v1M17 11a3 3 0 1 0 0-6M22 21v-1a5 5 0 0 0-4-4.9',
  report: 'M14 3H6a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8zM14 3v5h5M9 13h6M9 17h6',
}

export const Icon = ({ name, size = 22 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d={paths[name]} />
  </svg>
)

export const StatusChip = ({ status, children }) => (
  <span className="chip" style={{ '--c': STATUS[status].color }}>
    <i>{STATUS[status].icon}</i> {children ?? STATUS[status].label}
  </span>
)

export const SeverityChip = ({ severity }) => (
  <span className="chip" style={{ '--c': SEVERITY[severity].color }}>
    <i>{SEVERITY[severity].icon}</i> {SEVERITY[severity].label}
  </span>
)

export const DemoNote = () => <span className="demo-note">Demo data · lab validation pending</span>

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

function Header({ title, who, sub }) {
  const { logout, login, state } = useStore()
  const role = state.session?.role
  return (
    <header className="topbar">
      <button className="brand" onClick={() => go('/')} aria-label="DoseLoop home">
        <span className="logo-dots">
          <i style={{ background: '#afded0' }} />
          <i style={{ background: '#a7a271' }} />
          <i style={{ background: '#73533a' }} />
          <i style={{ background: '#241e1a' }} />
        </span>
        <span className="brand-name">DoseLoop</span>
      </button>
      <div className="who">
        <b>{who}</b>
        <span>{sub}</span>
      </div>
      <div className="role-switch" role="group" aria-label="Switch role">
        <button className={role === 'worker' ? 'on' : ''} onClick={() => (login('worker'), go('/w/home'))}>
          Worker
        </button>
        <button className={role === 'supervisor' ? 'on' : ''} onClick={() => (login('supervisor'), go('/s/dashboard'))}>
          Supervisor
        </button>
      </div>
      <button className="link small" onClick={() => (logout(), go('/'))} title={`Log out of ${title}`}>
        Exit
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
      <main className="page" key={path}>
        {children}
      </main>
      <nav className="tabbar" aria-label="Main">
        {tabs.map(([p, icon, label]) => (
          <button key={p} className={path.startsWith(p) ? 'on' : ''} onClick={() => go(p)}>
            <span className="tab-icon">
              <Icon name={icon} />
              {icon === 'bell' && unread > 0 && <em>{unread}</em>}
            </span>
            {label}
          </button>
        ))}
      </nav>
      <Guide path={path} />
    </div>
  )
}

/** Floating card that walks judges through the 2-minute demo. */
export function Guide({ path }) {
  const { state, endTour, login } = useStore()
  const step = state.tour?.step
  if (step == null) return null
  const done = step >= TOUR.length
  const t = TOUR[step]
  const act = () => {
    if (t.role) login(t.role)
    go(t.route)
  }
  return (
    <aside className="guide" aria-live="polite">
      <div className="guide-top">
        <span className="guide-badge">Guided demo</span>
        <span className="guide-dots">
          {TOUR.map((_, i) => (
            <i key={i} className={i < step ? 'done' : i === step ? 'now' : ''} />
          ))}
        </span>
        <button className="link small" onClick={endTour} aria-label="Close guided demo">
          ✕
        </button>
      </div>
      {done ? (
        <>
          <h4>That’s DoseLoop 🎉</h4>
          <p>One wristband, one pod, a phone scan: every worker’s H₂S dose logged per shift, offline, ready for DGMS/OISD.</p>
          <button className="cta small-cta" onClick={endTour}>
            Explore freely
          </button>
        </>
      ) : (
        <>
          <h4>
            {step + 1}. {t.title}
          </h4>
          <p>{t.text}</p>
          {path === t.route ? (
            t.hint && <p className="guide-hint">{t.hint}</p>
          ) : (
            <button className="cta small-cta" onClick={act}>
              {t.role ? 'Switch to supervisor' : 'Go'} →
            </button>
          )}
        </>
      )}
    </aside>
  )
}
