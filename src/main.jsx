import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
// Fonts are bundled with the app so they work offline (PWA and APK).
import '@fontsource/atkinson-hyperlegible-next/latin-400.css'
import '@fontsource/atkinson-hyperlegible-next/latin-500.css'
import '@fontsource/atkinson-hyperlegible-next/latin-600.css'
import '@fontsource/atkinson-hyperlegible-next/latin-700.css'
import '@fontsource/atkinson-hyperlegible-next/latin-800.css'
import '@fontsource/barlow-semi-condensed/latin-600.css'
import './index.css'
import App from './App.jsx'
import { registerSW } from 'virtual:pwa-register'
import { isNativeApp } from './native.js'

// Offline cache for the website. The Android app already carries every file inside the APK.
if (!isNativeApp()) registerSW({ immediate: true })

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
