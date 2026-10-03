import { useEffect } from 'react'
import { Shell } from './components/ui.jsx'
import { go, StoreProvider, useRoute, useStore } from './data/store.jsx'
import { SUPERVISOR } from './data/seed.js'
import { workerById } from './data/log.js'
import { Landing, Login } from './screens/Landing.jsx'
import Scan from './screens/Scan.jsx'
import { Dashboard, Reports, WorkerDetail } from './screens/Supervisor.jsx'
import { AlertsPage, History, PodPage, WorkerHome } from './screens/Worker.jsx'

const WORKER_PAGES = {
  '/w/home': ['Home', WorkerHome],
  '/w/scan': ['Scan', Scan],
  '/w/history': ['History', History],
  '/w/pod': ['Pod', PodPage],
  '/w/alerts': ['Alerts', () => <AlertsPage scope="mine" />],
}

function Routes() {
  const path = useRoute()
  const { state, login } = useStore()
  const session = state.session

  // deep links work without logging in: pick the matching demo role
  const needed = path.startsWith('/w/') ? 'worker' : path.startsWith('/s/') ? 'supervisor' : null
  const known = needed || path === '/' || path === '' || path === '/login'
  useEffect(() => {
    if (needed && session?.role !== needed) login(needed)
    if (!known) go('/')
  }, [needed, known, session?.role, login])

  if (path === '/' || path === '') return <Landing />
  if (path === '/login') return <Login />
  if (!needed || session?.role !== needed) return null

  if (path.startsWith('/w/')) {
    const [, Page] = WORKER_PAGES[path] ?? WORKER_PAGES['/w/home']
    const w = workerById(state, session.workerId)
    return (
      <Shell kind="worker" path={path} title="worker" who={w.name} sub={`${w.id} · ${w.area}`}>
        <Page />
      </Shell>
    )
  }
  if (path.startsWith('/s/')) {
    const page = path.startsWith('/s/worker/') ? <WorkerDetail id={path.split('/')[3]} /> : path === '/s/alerts' ? <AlertsPage scope="all" /> : path === '/s/reports' ? <Reports /> : <Dashboard />
    return (
      <Shell kind="supervisor" path={path} title="supervisor" who={SUPERVISOR.name} sub={SUPERVISOR.role}>
        {page}
      </Shell>
    )
  }
  return null
}

export default function App() {
  return (
    <StoreProvider>
      <Routes />
    </StoreProvider>
  )
}
