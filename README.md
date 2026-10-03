# DoseLoop

Team LoopHole · SIH26118 (MRPL) · Passive colorimetric H₂S dosimeter wristband + phone reader.

A PWA (React + Vite) that reads a photo of the H₂S pod and logs each worker's dose (ppm·hr) per shift.
Full design: [docs/MASTER.md](docs/MASTER.md). Build rules: [CLAUDE.md](CLAUDE.md).

> **Demo data, lab validation pending.** All doses, costs and accuracy figures are targets or placeholders.

## Run it locally

```bash
npm install      # once, downloads libraries
npm run dev      # opens a local server, usually http://localhost:5173
npm test         # runs the scan pipeline on every sample photo
npm run build    # makes the production version in dist/
```

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
