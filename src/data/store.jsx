// App state: shift log, pods, alerts, who is logged in and the guided demo.
// Saved in IndexedDB so it works offline and survives a reload.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { get, set } from 'idb-keyval'
import { ackAlert, applyRejection, applyScan } from './log.js'
import { DEMO_WORKER, seedState } from './seed.js'

const KEY = 'doseloop-state-v1'
const Store = createContext(null)

// Steps of the guided 2-minute demo. `waitFor` is the event that completes a step;
// `coach` is the short line on the glass pop-up next to the button to press.
export const TOUR = [
  { title: 'Start the shift', text: 'You are Ravi, working in the Sulphur Recovery Unit. Scan your pod to start your shift.', sample: 's01_shift1_start.jpg', route: '/w/scan', waitFor: 'start', coach: 'Tap to scan Ravi’s pod and start the shift', hint: '👇 Tap the highlighted sample photo.' },
  { title: 'End the shift', text: 'Shift over. Scan the pod again: DoseLoop subtracts the start reading to get this shift’s dose.', sample: 's02_shift1_end.jpg', route: '/w/scan', waitFor: 'end', coach: 'Tap to scan again and end the shift', hint: '👇 Tap the highlighted sample photo.' },
  { title: 'Catch off-shift exposure', text: 'Next morning the pod reads higher than when you left. DoseLoop flags exposure that happened off shift.', sample: 's05_shift3_start.jpg', route: '/w/scan', waitFor: 'off_shift', coach: 'Tap: next morning’s start scan', hint: '👇 Tap the highlighted sample photo.' },
  { title: 'Reject a fake pod', text: 'Someone scans a copied pod. Its QR signature does not match, so it is rejected and reported.', sample: 'e02_fake_pod.jpg', route: '/w/scan', waitFor: 'fake', coach: 'Tap to scan a copied (fake) pod', hint: '👇 Tap the highlighted sample photo.' },
  { title: 'Supervisor view', text: 'Switch to Anita, the shift supervisor. She sees the whole team, today’s alerts and who is on shift.', route: '/s/dashboard', role: 'supervisor', waitFor: 'supervisor' },
  { title: 'Export the register', text: 'Download the exposure register as CSV or PDF for DGMS/OISD reporting.', route: '/s/reports', waitFor: 'export', coach: 'Download the exposure register', hint: '👇 Tap Download PDF or Download CSV.' },
]

export function StoreProvider({ children }) {
  const [state, setState] = useState(null)
  const ref = useRef(null) // latest state, so actions can read it synchronously

  useEffect(() => {
    let alive = true
    get(KEY)
      .then((s) => (s?.version === 1 ? s : null))
      .catch(() => null)
      .then((s) => {
        if (!alive) return
        ref.current = s ?? { ...seedState(), session: null, tour: null }
        setState(ref.current)
      })
    return () => {
      alive = false
    }
  }, [])

  useEffect(() => {
    if (state) set(KEY, state).catch(() => {})
  }, [state])

  const update = useCallback((fn) => {
    const next = fn(ref.current)
    ref.current = next
    setState(next)
    return next
  }, [])

  // advance the guided demo when its event happens
  const tourEvent = useCallback(
    (type) =>
      update((s) => {
        const step = s.tour?.step
        if (step == null || TOUR[step]?.waitFor !== type) return s
        return { ...s, tour: { ...s.tour, step: step + 1 } }
      }),
    [update],
  )

  const api = useMemo(
    () => ({
      login: (role, workerId = DEMO_WORKER) => update((s) => ({ ...s, session: { role, workerId } })),
      logout: () => update((s) => ({ ...s, session: null, tour: null })),
      reset: () => update((s) => ({ ...seedState(), session: s.session, tour: null })),
      startTour: () => update(() => ({ ...seedState(), session: { role: 'worker', workerId: DEMO_WORKER }, tour: { step: 0 } })),
      endTour: () => update((s) => ({ ...s, tour: null })),
      tourEvent,
      logScan(result) {
        let outcome
        update((s) => {
          const r = applyScan(s, s.session.workerId, result)
          outcome = r.outcome
          return { ...r.state, session: s.session, tour: s.tour }
        })
        if (outcome.kind === 'start' || outcome.kind === 'end') tourEvent(outcome.kind)
        if (outcome.alerts?.some((a) => a.type === 'off_shift')) tourEvent('off_shift')
        return outcome
      },
      logRejection(error) {
        let alert
        update((s) => {
          const r = applyRejection(s, s.session.workerId, error)
          alert = r.alert
          return r.state === s ? s : { ...r.state, session: s.session, tour: s.tour }
        })
        if (alert?.type === 'fake') tourEvent('fake')
        return alert
      },
      ack: (id) => update((s) => ({ ...ackAlert(s, id), session: s.session, tour: s.tour })),
    }),
    [update, tourEvent],
  )

  if (!state) return <div className="boot">Loading…</div>
  return <Store.Provider value={{ state, ...api }}>{children}</Store.Provider>
}

export const useStore = () => useContext(Store)

// ---------- tiny hash router ----------
const currentPath = () => window.location.hash.replace(/^#/, '') || '/'

export function useRoute() {
  const [path, setPath] = useState(currentPath)
  useEffect(() => {
    const on = () => {
      setPath(currentPath())
      window.scrollTo(0, 0)
    }
    window.addEventListener('hashchange', on)
    return () => window.removeEventListener('hashchange', on)
  }, [])
  return path
}

export const go = (path) => {
  window.location.hash = path
}
