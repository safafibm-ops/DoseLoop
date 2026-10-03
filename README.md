# DoseLoop

Team LoopHole · SIH26118 (MRPL) · Passive colorimetric H₂S dosimeter wristband + phone reader.

A PWA (React + Vite) that reads a photo of the H₂S pod and logs each worker's dose (ppm·hr) per shift.
Full design: [docs/MASTER.md](docs/MASTER.md). Build rules: [CLAUDE.md](CLAUDE.md).

> **Demo data, lab validation pending.** All doses, costs and accuracy figures are targets or placeholders.

## Run it locally

```bash
npm install      # once, downloads libraries
npm run dev      # opens a local server, usually http://localhost:5173
npm run build    # makes the production version in dist/
```

## Deploy

Hosted on Vercel (HTTPS is needed for the phone camera). Every push to `main` redeploys.
