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
| Scan | `#/w/scan` | Live camera with auto-capture, upload, sample photos; the 8 pipeline steps shown visually |
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

## Live camera and printed test badges

**📷 Camera** on the Scan screen opens a live camera inside the app (laptop webcam, phone browser or the
Android app). The browser asks for camera permission the first time. While the camera runs, a few frames a
second are checked in the background: the pod outline turns amber when the 4 corner markers are found and
green when the QR reads, and the photo is then taken by itself (`src/components/CameraScan.jsx`). If the
camera is blocked or missing, the app says how to allow it and offers a normal photo instead.

No pod? Print **`public/print/doseloop-test-badges.pdf`** (link on the Scan screen) on plain A4 at 100%:
one shift per page. Page 1 is a Safe shift (0 → 20 ppm·hr), page 2 the next shift on the same pod, over the
limit (20 → 120 ppm·hr), and page 3 a copied pod the app must reject. Scan them in order. They are the pod
face at 3× size, so even a laptop webcam can read them. Printed colours are never exactly the lab colours, so
a printed badge reads close to, not exactly, its label (demo data, lab validation pending).

### Built for bad photos

| Problem in real photos | What the scan does |
|---|---|
| Strong tilt, markers of very different sizes | Picks the 4 markers whose sizes and spacing match the pod's real geometry for that perspective (`markers.js`) |
| Several pods on one sheet, other square shapes | Same geometry check rejects mixed groups; the biggest pod nearest the middle wins |
| Dim, noisy or low-contrast photos | Up to 7 threshold settings, including contrast-equalised and half-size passes |
| Small or blurry QR | Read from the full-resolution photo (up to 3200 px), at 3 sizes × 4 clean-ups, then OpenCV's own QR reader (`qr.js`) |
| Dense QR | New pods use a compact code (`DL2:…`, version 6, 41×41 dots instead of 49×49); old `DL1|…` pods still verify |
| Shadow or lamp on one side | The plain pod background is measured in 2 mm cells and the light is evened out before sampling (`light.js`) |
| Phone tone curves and colour boost | Flexible tone curve through the greys, background and marker black, a 3×3 matrix, then a local fix from the printed browns (`color.js`) |
| White patch blown out on a bright day | Left out of the fit instead of failing; glare on the strip, reference or browns still means retake |
| Photo of a laptop screen (screen colours, sub-pixels) | The strip and reference are read straight against the 6 printed browns in the same photo, so whatever the screen and camera did to them cancels out (`readAgainstScale` in `color.js`) |
| Reflection of a window or lamp on the screen or glossy paper | The 4 corner markers are the same black; if one corner reads much lighter, the app asks for a retake |
| Moiré stripes from a screen | Plain patches that look streaky (smoothed spread over 4 ΔE) mean retake |
| Upside down or rotated | The QR corner decides which way up the pod is |

`test/adverse/` holds 14 simulated photos of a **printed** badge (printer, light, camera and blur effects from
`scripts/make_adverse.py`); `npm test` scans all of them. For a bigger random run:
`python3 scripts/make_adverse.py --stress 80 ../stress` then `STRESS_DIR=../stress npx vitest run test/adverse.test.js`.

### Same badge, laptop vs phone

Every reading comes with a **± range** (for example `6.3 ± 0.8 ppm·hr`). It comes from two checks: the dose is
read a second way (through the full colour correction instead of straight against the browns), and that reading
is redone 6 times, each without one brown step. Calm, even photos give a small ±; glare, screens and odd light
make it wider. A shift's ± combines its start and end scans.

`python3 scripts/make_adverse.py --gap ../gap 12` makes start + end photos of the same badges taken by a laptop
webcam and three phones (printed badge), and by three phones off a laptop screen showing the demo sample photos;
`GAP_DIR=../gap npx vitest run test/adverse.test.js --silent=false` compares the shift doses. Simulated result
(12 scenes, 24 pairs each, demo data, lab validation pending):

| Shift dose difference | Before | Now |
|---|---|---|
| Printed badge, phone vs laptop webcam: average / largest | 2.0 / 6.9 ppm·hr | 1.8 / 5.7 ppm·hr |
| Phone photo of the laptop screen vs the laptop: average / largest | 2.0 / 10.3 ppm·hr | 1.2 / 5.4 ppm·hr |
| Difference inside the two ± ranges | – | 43 of 48 |

Screen photos with a strong reflection are now sent back for a retake (8 of the 32 the old scan accepted, 3 of
them 6–8 ppm·hr off).

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
2. Read the QR (jsQR, OpenCV as a second reader) and check its Ed25519 signature (tweetnacl). Fakes are rejected.
3. Even out the light across the pod, then sample every colour patch (median of many pixels); reject glare, a
   reflection over part of the pod (corner blacks differ), and moiré stripes (streaky plain patches).
4. Colour correction: tone curve from the greys, background and black, a 3×3 matrix (browns weighted 3×), a
   local fix, then a curve through all 6 printed browns. The strip and reference are read straight against
   the 6 browns in the photo.
5. Self-test: the 25 ppm·hr brown is held out. Up to 3 ΔE off after correction is full confidence; 3–6 ΔE keeps
   the reading but flags it as less certain; more than 6 ΔE means retake.
6. Strip ΔE − reference ΔE (from fresh ink, in Lab) → batch curve → ppm·hr, with a ± range.
7. Check shutter dot, expiry wick, pod age and % capacity.

Layout and true colours of the pod face live in `src/scan/podSpec.json`, shared with the Python scripts.

## Sample pods (scripts/)

```bash
python3 -m pip install numpy pillow qrcode pynacl scikit-learn opencv-python-headless
python3 scripts/fit_curve.py   # fits the placeholder dose curve -> src/scan/calibration/C1.json
python3 scripts/make_pods.py   # pod faces (print/), A4 sheets, sample photos
python3 scripts/make_badges.py # printable test badges (public/print/), works without the signing key
python3 scripts/make_adverse.py # printed-badge test photos for npm test (test/adverse/)
python3 scripts/make_adverse.py --gap ../gap 12  # laptop vs phone pairs, incl. photos of a laptop screen
```

`print/pod_faces_A4.pdf` prints the pod faces at true size (46 × 32 mm) at 100% scale. Photograph them with
different phones and lights to test with real photos.

The ink colours and dose curve are **placeholders** until lab calibration. `make_pods.py` creates a private
signing key in `scripts/.keys/` (not committed); running it again on another computer makes a new key and
re-signs all samples, which is fine.

## Deploy

Hosted on Vercel (HTTPS is needed for the phone camera). Every push to `main` redeploys.
