import { useState } from 'react'
import PodFace from '../components/PodFace.jsx'
import { DemoNote, StatusChip } from '../components/ui.jsx'
import { LIMITS, shiftStatus } from '../data/limits.js'
import { go, useStore } from '../data/store.jsx'

const STEPS = [
  ['⌚', 'Wear', 'Reusable wristband holds a clip-in pod for ~30 days.'],
  ['🟫', 'Darken', 'Copper-acetate ink darkens as H₂S dose builds up. No battery.'],
  ['📱', 'Scan', 'Phone photo at shift start and end. Colours corrected for any light.'],
  ['📋', 'Log', 'Dose per worker per shift, offline, ready for DGMS/OISD.'],
]

export function Landing() {
  const [dose, setDose] = useState(25)
  const status = shiftStatus(dose)
  return (
    <main className="landing">
      <p className="team">Team LoopHole · SIH26118 · MRPL</p>
      <h1>DoseLoop</h1>
      <p className="pitch">
        A battery-free H₂S wristband that darkens with dose, and a phone scan that turns its colour into a logged ppm·hr
        reading for every worker, every shift.
      </p>
      <button className="cta" onClick={() => go('/login')}>
        Try demo
      </button>

      <section className="hero-pod">
        <PodFace dose={dose} className="hero-face" />
        <label className="slider">
          <span>Drag to expose the pod to H₂S</span>
          <input type="range" min="0" max="220" step="1" value={dose} onChange={(e) => setDose(+e.target.value)} aria-label="H₂S dose in ppm·hr" />
        </label>
        <div className="hero-read">
          <b>{dose}</b> ppm·hr <StatusChip status={status}>{status === 'ok' ? 'Safe for one shift' : status === 'caution' ? 'Caution' : `Over ${LIMITS.shiftIndia} ppm·hr shift limit`}</StatusChip>
        </div>
        <p className="small">Placeholder colours until lab calibration.</p>
      </section>

      <section className="how">
        {STEPS.map(([icon, title, text]) => (
          <div key={title} className="how-step">
            <span className="how-icon">{icon}</span>
            <b>{title}</b>
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
      <button className="link" onClick={() => go('/')}>
        ← Back
      </button>
      <h1>Who are you?</h1>
      <p className="muted">Demo login: no password. Pick a role.</p>
      <div className="roles">
        <button className="role-card" onClick={() => enter('worker')}>
          <span className="avatar">RK</span>
          <b>Ravi Kumar</b>
          <span>Worker · Sulphur Recovery Unit</span>
          <span className="muted small">Scan the pod, see your dose</span>
        </button>
        <button className="role-card" onClick={() => enter('supervisor')}>
          <span className="avatar sup">AD</span>
          <b>Anita Desai</b>
          <span>Shift supervisor</span>
          <span className="muted small">Team dashboard, alerts, reports</span>
        </button>
      </div>
      <label className="check">
        <input type="checkbox" checked={guided} onChange={(e) => setGuided(e.target.checked)} /> Guide me through the 2-minute demo
        (resets demo data)
      </label>
      <DemoNote />
    </main>
  )
}
