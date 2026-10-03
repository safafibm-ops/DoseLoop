# Team LoopHole – SIH26118 H₂S Dosimeter: Web App Prototype

Full design reference: `docs/MASTER.md` (exported from the master Claude Doc). Read it before big changes.

## What we are building
A PWA (React + Vite) that reads a photo of our passive colorimetric H₂S pod and logs the worker's dose (ppm·hr) per shift.
Judges open one link in a browser, no install. Optional Android APK via Capacitor later.

## Fixed decisions (ask the user before changing any)
- One reusable wristband + one disposable pod per worker per ~30 days; scanned at start and end of every shift.
- Shift dose = end scan − start scan. Change between last end scan and next start scan should be ~0, else flag off-shift exposure.
- Pod face: 4 corner markers, QR, colour patches, 6-step brown scale (0 · 10 · 25 · 50 · 100 · 200 ppm·hr, placeholders), sensing strip, reference cell, green/red shutter dots, dye-wick expiry indicator.
- Ink: pale blue-green → olive → brown → black as dose rises. Colour curve is a PLACEHOLDER until lab calibration; label it so in the UI.
- Prototype uses a normal QR (jsQR) + tweetnacl signature check. JAB Code is the final design only.
- Pod retires at: 30 days in use, 80% capacity (~200 ppm·hr), expiry indicator, tamper tab, or leak event.

## Stack
React + Vite, OpenCV.js, jsQR, tweetnacl, IndexedDB (offline), vite-plugin-pwa, Vercel hosting (HTTPS for camera), Capacitor (optional APK).
Python (scripts/) for generating sample pod faces; scikit-learn to fit the dose curve, exported as JSON coefficients.

## Scan pipeline
1. Find 4 corner markers, warp to a flat pod view.
2. Decode QR, verify signature; reject fakes.
3. Sample patches (median of many pixels); reject glare/clipping.
4. Colour correction: tone curve from neutrals + brown steps, 3×3 matrix from colour patches + browns (weighted to browns).
5. Self-test: held-out brown patch > ~3 ΔE after correction → retake.
6. Lab ΔE of strip − Lab ΔE of reference → batch curve → ppm·hr.
7. Check shutter dot (green = open at shift start), expiry, days in use, % capacity.
8. Log worker ID, shift, time, dose, pod serial. Show every step visually.

## Screens
Landing (pitch + Try demo) · Demo login · Scan (start/end, sample photos + upload + camera) · Shift history · Pod status · Alerts · Supervisor dashboard · Report export (CSV/PDF, DGMS/OISD format).

## Build phases
0 Setup + Vercel · 1 Sample pod images (scripts/) · 2 Scan pipeline · 3 Screens + seeded demo data · 4 PWA · 5 APK (optional) · 6 README, demo video.

## Rules
- All doses, costs and accuracy figures are targets/placeholders; say "demo data, lab validation pending" in the UI and README.
- Keep it simple and beginner-friendly; explain changes step by step.
- Demo must work fully in under 2 minutes with no pod and no login.
