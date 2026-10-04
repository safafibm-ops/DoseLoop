import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  build: { chunkSizeWarningLimit: 16000 }, // OpenCV.js is one big file, loaded only on the scan screen
  worker: { format: 'es' }, // the scan runs in a background worker (src/scan/scanWorker.js)
  plugins: [
    react(),
    // Makes the app installable and work offline (service worker + manifest).
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: false, // registered in main.jsx (skipped inside the Android app, which is offline already)
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      workbox: {
        // the scan worker (OpenCV.js inside) is ~16 MB; cache it and the sample photos so the demo works offline
        maximumFileSizeToCacheInBytes: 20 * 1024 * 1024,
        globPatterns: ['**/*.{js,css,html,svg,png,jpg,json,pdf,woff2}'], // woff2: bundled fonts
      },
      manifest: {
        name: 'DoseLoop – H₂S Dose Reader',
        short_name: 'DoseLoop',
        description: 'Reads a photo of the passive H₂S pod and logs each worker’s shift dose (ppm·hr).',
        theme_color: '#1a2027',
        background_color: '#eef1f4',
        display: 'standalone',
        start_url: '/',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
    }),
  ],
})
