import { useState } from 'react'
import Scan from './Scan.jsx'

// Placeholder 6-step scale (ppm·hr). Real values come from lab calibration.
const SCALE = [
  { dose: 0, color: '#9fd3c7' },
  { dose: 10, color: '#a7b98a' },
  { dose: 25, color: '#7a7d3a' },
  { dose: 50, color: '#6b3f1d' },
  { dose: 100, color: '#3e2412' },
  { dose: 200, color: '#1b1b1b' },
]

function DemoNote() {
  return <p className="note">Demo data, lab validation pending.</p>
}

function Landing({ onTryDemo }) {
  return (
    <main className="landing">
      <p className="team">Team LoopHole · SIH26118 · MRPL</p>
      <h1>DoseLoop</h1>
      <p className="pitch">
        A battery-free H₂S wristband that darkens with dose, and a phone scan that turns its colour
        into a logged ppm·hr reading for every worker, every shift.
      </p>
      <button className="cta" onClick={onTryDemo}>
        Try demo
      </button>
      <div className="scale" aria-label="Placeholder dose colour scale">
        {SCALE.map((s) => (
          <div key={s.dose} className="step">
            <span className="swatch" style={{ background: s.color }} />
            <span>{s.dose}</span>
          </div>
        ))}
      </div>
      <p className="scale-label">ppm·hr (placeholder scale)</p>
      <DemoNote />
    </main>
  )
}

export default function App() {
  const [screen, setScreen] = useState('landing')
  return screen === 'landing' ? (
    <Landing onTryDemo={() => setScreen('demo')} />
  ) : (
    <Scan onBack={() => setScreen('landing')} />
  )
}
