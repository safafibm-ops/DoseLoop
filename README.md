# DoseLoop

Team LoopHole · SIH26118 (MRPL) · Passive colorimetric H₂S dosimeter wristband + phone reader.

A PWA (React + Vite) that reads a photo of the H₂S pod and logs each worker's dose (ppm·hr) per shift.
Full design: [docs/MASTER.md](docs/MASTER.md). Build rules: [CLAUDE.md](CLAUDE.md).

> **Demo data, lab validation pending.** All doses, costs and accuracy figures are targets or placeholders.

## Run it locally

```bash
npm install      # once, downloads libraries
npm run dev      # opens a local server, usually http://localhost:5173
npm test         # scan pipeline on every sample photo (also turned 90/180/270°), shift log rules
npm run build    # makes the production version in dist/
```

## Try the demo (no pod, no login, under 2 minutes)

Open the site → **Try demo** → keep *Guide me through the 2-minute demo* ticked → **Ravi Kumar (worker)**.
A guide card on the side explains each of the six steps, and a glass pop-up points at the exact button to tap next
(`src/components/Coach.jsx`):

1. **Start the shift**: tap the pulsing sample photo; every pipeline step opens one by one.
2. **End the shift**: the shift dose (end − start) is logged and compared with the 80 ppm·hr limit.
3. **Catch off-shift exposure**: the next start scan is higher than the last end scan, so it is flagged.
4. **Reject a fake pod**: a copied QR fails the signature check and raises a critical alert.
5. **Supervisor view**: team heatmap, who is on shift, open alerts, pods due for replacement.
6. **Export the register**: download the exposure register as PDF or CSV.

The team history (8 workers, 5 weeks) is seeded demo data, saved offline in the browser. Starting the guided demo again resets it.

## Screens (src/screens/)

| Screen | Path | What it shows |
|---|---|---|
| Landing | `#/` | Pitch, live pod face with a dose slider |
| Demo login | `#/login` | Worker or supervisor, optional guided tour |
| Home | `#/w/home` | Shift card, last dose vs limit, pod capacity ring, 7-day bars, alerts |
| Scan | `#/w/scan` | Sample photos, upload or camera; the 8 pipeline steps shown visually |
| History | `#/w/history` | 14-day doses and every shift with off-shift flags |
| Pod status | `#/w/pod` | Pod face, retire checks (days, capacity, expiry, shutter), reading over time |
| Alerts | `#/w/alerts`, `#/s/alerts` | Open and handled alerts, acknowledge |
| Supervisor dashboard | `#/s/dashboard` | KPIs, team dose heatmap, team list, needs attention |
| Worker detail | `#/s/worker/W-1042` | One worker's shifts and pod |
| Reports | `#/s/reports` | Exposure register preview, PDF and CSV export |

Logic lives in `src/data/`: `log.js` turns scans into shifts and alerts (pure functions, tested in
`log.test.js`), `seed.js` makes the demo team, `store.jsx` saves everything offline in IndexedDB.
Limits used: 80 ppm·hr per 8-h shift (India, 10 ppm TWA); ACGIH 8 ppm·hr shown as a stricter reference.

## Live scan view

When a photo is scanned, the Scan screen shows each stage on the photo itself as it happens: corner markers
found, the pod straightened (rotation and tilt), the QR signature checked, every colour area sampled, a
before/after slider for the colour correction, the self-test, strip minus reference, and the pod checks.
The step list shows only the current step; **Show all** opens every step with its details.

The scan engine (OpenCV.js + the pipeline) runs in a background worker (`src/scan/scanWorker.js`), so the
screen stays smooth, a stuck scan times out cleanly, and a broken file gives a clear message. Everything is
bundled with the app: no network is needed after the first visit (PWA) or at all (Android app).

## Android app (Phase 5)

The Android app wraps the same web app with Capacitor (`android/`, `capacitor.config.json`).

- **Download:** the **📲 Get the app** button (top-right of the landing and login screens) links to the latest
  APK. GitHub Actions (`.github/workflows/android.yml`) builds it on every PR and publishes it as the
  `apk-latest` release on every push to `main`.
- **Install:** open `DoseLoop.apk` on the phone and allow "install unknown apps" once. It is a debug build for testing.
- **iPhone:** open the site in Safari → Share → Add to Home Screen (works offline). A native iOS build needs an
  Apple developer account and a Mac.
- **Build it yourself:** `npm run android`, then open `android/` in Android Studio (needs JDK 21 and the Android SDK).

## How a scan works (src/scan/pipeline.js)

1. Find the 4 corner markers and straighten the photo into a flat pod view (OpenCV.js).
2. Read the QR (jsQR) and check its Ed25519 signature (tweetnacl). Fakes are rejected.
3. Sample every colour patch (median of many pixels); reject glare.
4. Colour correction: tone curve from greys + browns, then a 3×3 matrix (browns weighted 3×).
5. Self-test: the 25 ppm·hr brown is held out; more than 3 ΔE off after correction means retake.
6. Strip ΔE − reference ΔE (from fresh ink, in Lab) → batch curve → ppm·hr.
7. Check shutter dot, expiry wick, pod age and % capacity.

Layout and true colours of the pod face live in `src/scan/podSpec.json`, shared with the Python scripts.

## Sample pods (scripts/)

```bash
python3 -m pip install numpy pillow qrcode pynacl scikit-learn opencv-python-headless
python3 scripts/fit_curve.py   # fits the placeholder dose curve -> src/scan/calibration/C1.json
python3 scripts/make_pods.py   # pod faces (print/), A4 print sheet, sample photos (public/samples/)
```

`print/pod_faces_A4.pdf` prints the pod faces at true size (46 × 32 mm) at 100% scale. Photograph them with
different phones and lights to test with real photos.

The ink colours and dose curve are **placeholders** until lab calibration. `make_pods.py` creates a private
signing key in `scripts/.keys/` (not committed); running it again on another computer makes a new key and
re-signs all samples, which is fine.

## Deploy

Hosted on Vercel (HTTPS is needed for the phone camera). Every push to `main` redeploys.
