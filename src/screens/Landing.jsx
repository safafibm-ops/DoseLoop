import { useState } from 'react'
import Coach from '../components/Coach.jsx'
import GetApp from '../components/GetApp.jsx'
import PodFace from '../components/PodFace.jsx'
import { DemoNote, Icon, Logo, StatusChip } from '../components/ui.jsx'
import { STATUS_TONE } from '../components/tokens.js'
import { LIMITS, shiftStatus } from '../data/limits.js'
import { go, useStore } from '../data/store.jsx'

const STEPS = [
  ['watch', 'Wear', 'A reusable wristband holds one clip-in pod for about 30 days.'],
  ['pod', 'Darken', 'Copper-acetate ink darkens as the H₂S dose builds up. No battery.'],
  ['camera', 'Scan', 'A phone photo at shift start and end. Colours are corrected for any light.'],
  ['report', 'Log', 'Dose per worker per shift, stored offline, ready for DGMS/OISD.'],
]

const VERDICT = { ok: 'Safe for one shift', caution: 'Caution: over half the shift limit', over: `Over the ${LIMITS.shiftIndia} ppm·hr shift limit` }

export function Landing() {
  const [dose, setDose] = useState(25)
  const status = shiftStatus(dose)
  return (
    <main className="landing">
      <header className="landing-bar">
        <span className="brand static">
          <Logo />
          <span className="brand-name">DoseLoop</span>
        </span>
        <GetApp />
      </header>

      <section className="landing-hero">
        <div className="landing-copy">
          <p className="team">Team LoopHole · SIH26118 · MRPL</p>
          <h1>Every worker’s H₂S dose, logged every shift.</h1>
          <p className="pitch">
            A battery-free wristband pod darkens as it absorbs H₂S. A phone photo at the start and end of the shift turns that colour into a
            ppm·hr reading for the worker’s log.
          </p>
          <div className="landing-actions">
            <button className="btn primary lg" data-coach="landing:try" onClick={() => go('/login')}>
              Try the demo
            </button>
            <span className="muted">2 minutes, no login, no pod needed</span>
          </div>
          <Coach target="landing:try" chip="Start here" text="2-minute guided demo, no login" place="below right" edge={false} />
        </div>

        <div className="hero-pod">
          <PodFace dose={dose} className="hero-face" />
          <label className="slider">
            <span>Drag to expose the pod to H₂S</span>
            <input type="range" min="0" max="220" step="1" value={dose} onChange={(e) => setDose(+e.target.value)} aria-label="H₂S dose in ppm·hr" />
          </label>
          <div className={`hero-read tone-${STATUS_TONE[status]}`}>
            <span className="hero-num">
              <b>{dose}</b> ppm·hr
            </span>
            <StatusChip status={status}>{VERDICT[status]}</StatusChip>
          </div>
          <p className="small muted">Placeholder colours until lab calibration.</p>
        </div>
      </section>

      <section className="how" aria-label="How it works">
        {STEPS.map(([icon, title, text], i) => (
          <div key={title} className="how-step">
            <span className="how-icon">
              <Icon name={icon} size={24} />
            </span>
            <b>
              {i + 1}. {title}
            </b>
            <span>{text}</span>
          </div>
        ))}
      </section>
      <DemoNote />
    </main>
  )
}

export function Login() {
  const { login, startTour } = useStore()
  const [guided, setGuided] = useState(true)
  const enter = (role) => {
    if (role === 'worker' && guided) startTour()
    else login(role)
    go(role === 'worker' ? (guided ? '/w/scan' : '/w/home') : '/s/dashboard')
  }
  return (
    <main className="login">
      <header className="landing-bar">
        <button className="btn ghost" onClick={() => go('/')}>
          <Icon name="back" size={20} /> Back
        </button>
        <GetApp />
      </header>
      <h1>Choose a demo user</h1>
      <p className="muted">No password in the demo. Pick who you want to be.</p>
      <div className="roles">
        <button className="role-card" data-coach="login:worker" onClick={() => enter('worker')}>
          <span className="avatar">RK</span>
          <span className="role-text">
            <b>Ravi Kumar</b>
            <span>Worker · Sulphur Recovery Unit</span>
            <span className="muted">Scan the pod, see your dose</span>
          </span>
          <Icon name="right" size={24} className="role-go" />
        </button>
        <button className="role-card" onClick={() => enter('supervisor')}>
          <span className="avatar sup">AD</span>
          <span className="role-text">
            <b>Anita Desai</b>
            <span>Shift supervisor</span>
            <span className="muted">Team dashboard, alerts, reports</span>
          </span>
          <Icon name="right" size={24} className="role-go" />
        </button>
      </div>
      {guided && <Coach target="login:worker" chip="Demo" text="Tap Ravi to start the guided demo" place="below above" edge={false} />}
      <label className="check">
        <input type="checkbox" checked={guided} onChange={(e) => setGuided(e.target.checked)} />
        <span>
          Guide me through the 2-minute demo
          <span className="muted"> (resets demo data)</span>
        </span>
      </label>
      <DemoNote />
    </main>
  )
}
