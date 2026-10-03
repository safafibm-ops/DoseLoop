# Team LoopHole – SIH26118 H₂S Dosimeter Wristband: Master Solution File

Oct 3, 2026 · @Mohammed Safaf

## Team and how to use this file

This is Team LoopHole's single reference for SIH26118: every design decision, number and plan we have agreed so far, start to end. Change a decision here first, then in the PPT.

| Field | Value |
| --- | --- |
| Team name | Team LoopHole |
| Problem statement | SIH26118 – Passive Colorimetric H₂S Exposure-Dosimeter Wristband with AI-Based Quantitative Reading |
| Organisation | MRPL |
| Category | Hardware |
| Team ID | Open question: add from the SIH portal |
| Theme | Open question: add from the SIH portal |
| Members and roles | Open question: add names, roles (chemistry, hardware/CAD, app, data, pitch) |

All costs, pod-life figures and accuracy numbers below are **design targets or estimates** until our lab data and supplier quotes confirm them. Say so in the pitch.

## 1. Problem

MRPL needs each worker's **cumulative H₂S dose (ppm·hr)**, logged per worker ID and per shift for DGMS/OISD reporting, without costly electronics.

The problem statement asks for:

- a passive colorimetric band that darkens progressively with dose
- a printed reference colour scale and a separate shelf-life/expiry patch
- a phone app that photographs it, corrects lighting, estimates dose and logs it per worker/shift
- temperature/humidity compensation (sealed reference cell or in-app)
- validation against lab H₂S at known concentration and time
- a stated shelf life (30/90 days)

**Exposure limits** ([Factories Act Second Schedule](https://comply4hr.com/docs/nat/FA/FAS2.htm), [ACGIH via J.J. Keller](https://jjkellercompliancenetwork.com/regsense/hydrogen-sulfide-h2s)):

| Limit | 8-hour TWA | STEL (15 min) | Dose per 8-hour shift |
| --- | --- | --- | --- |
| India, Factories Act | 10 ppm | 15 ppm | 80 ppm·hr |
| ACGIH (stricter) | 1 ppm | 15 ppm | 8 ppm·hr |

Real workplaces usually sit far below these, with short peaks. A [wastewater study](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC9923040/) found TWAs well below limits despite peaks, and a [refinery survey](https://ntrl.ntis.gov/NTRL/dashboard/searchResults/titleDetail/PB84146901.xhtml) measured about 1 ppm. That is why cumulative dose matters more than one instant reading.

**Why passive:** irreversible reaction, no battery or calibration, cheap and hygienic, and suited to hazardous zones (ATEX/PESO Zone 0, to be certified).

## 2. Existing solutions and gaps

No existing option gives a cheap, cold-chain-free, continuous dose with a digital per-shift log.

| Solution | What it does | Gap |
| --- | --- | --- |
| Electronic monitors (BW Clip, Dräger Pac) | Instant readings, peak alarms | Costly, maintenance and calibration, imported, no cumulative dose |
| [Morphix ChromAir / SafeAir H₂S badge](https://allsafeindustries.com/chromair-monitoring-badges.aspx) | 6 colour cells, 1–240 ppm·hr | Read by eye in 6 steps, refrigeration, no expiry check, no digital log, single use |
| Dräger diffusion tubes | Stain-length reading | Fragile glass, manual reading, no record |
| Radiello / SKC passive samplers | Lab-grade accuracy | Need lab analysis, results take days |
| Lead-acetate tape | Detects presence | Yes/no only, uses lead |
| Research: MIT NFC/RFID chemical badges; 2023 ML-read cumulative VOC wearable | Digital read-out ideas | Not H₂S field products; the VOC wearable needs fixed lighting |
| Competing SIH teams on GitHub (HydroNexus, shrayop, H2SENTRY, SulfiTrack) | ArUco → lighting correction → Lab/ΔE → ML → dashboard | Trained only on **simulated** data; one uses CuSO₄ |

Our benchmark is ChromAir's 1–240 ppm·hr range, delivered as a continuous reading with a digital, auditable log.

## 3. Our solution: one product

**One reusable wristband + one multi-shift clip-in sensor pod per worker per month.** The pod is scanned at the start and end of every shift, logged per shift, and replaced after about 30 days or when its dose capacity is used, whichever comes first.

We rejected splitting this into two products (a shift badge and a 90-day badge): one product is clearer for an ideathon and covers both needs.

**Differentiation:**

1. Real lab-validated calibration data, not simulated.
2. A chemically real expiry indicator (time-temperature indicator).
3. No cold chain; stable at Indian ambient temperatures.
4. A continuous reading with regression, not 6 bins.
5. Temperature/humidity compensation through a reference cell, tested on real data.
6. Lead-free chemistry.
7. Per-shift dose records from one pod, with off-shift leak detection.
8. A smart colour QR carrying signed, batch-specific calibration, so it works offline.
9. A reusable high-quality band that cuts waste and cost per shift.

**One line for the PPT:** "One reusable wristband, one pod per worker per month: scanned every shift, logged per shift, 90-day sealed shelf life, 30-day in-use life, about 25–30 shifts in typical refinery exposure."

## 4. Chemistry

**Main reagent: copper acetate** behind a diffusion membrane. Cu²⁺ + H₂S → CuS, so the strip darkens from pale blue-green (fresh ink) through olive and brown to black as dose builds up; confirm exact colours from our first lab strips. Bismuth (Bi(OH)₃) is kept as a side test for comparison in the lab data.

| Point | Copper acetate (chosen) | Bismuth (side test) |
| --- | --- | --- |
| Availability | Made in India; stocked by SRL, Loba, Merck | Mostly imported, less commonly stocked |
| Cost | Cheaper | \~2–4× per kg (estimate; get 2 supplier quotes) |
| Indian climate | Fairly dry film; humidity effect corrected by reference cell | Needs wet pH-11 coating that dries in heat and is neutralised by CO₂ |
| Shelf life | 90 days easier, sealed in foil | Needs moisture + CO₂ barrier |
| Sensitivity | ppm range, right for occupational limits | ppb, overkill |
| Toxicity | Mild, sealed mg amounts | Non-toxic |
| Colour change | Pale blue-green → olive → brown → black | White → yellow/brown |
| Manufacturing | Easy ink-print or dip-coat | Needs pH and moisture control |

Pitch wording: "lead-free, low-toxicity, sealed reagent" (not "non-toxic"). Present the humidity issue as "tested compensation", not a weakness.

**Amounts.** Assuming about 20 mL/min uptake, 200 ppm·hr delivers only \~0.3 mg H₂S, which reacts with \~2 mg copper acetate. We load 5–10 mg. The limit is how dark the strip gets while still readable, not running out of chemical.

**Reference cell.** The same ink under the same holes and air gap, with a small activated-carbon/ZnO filter dot under each hole, so humidity reaches it and the ink stays visible between the dots. It sees the same temperature, humidity and ageing but no H₂S. Real signal = strip change − reference change. Example: strip 12 units, reference 2 units, so H₂S signal = 10 units. The filter (tens of mg) lasts far beyond 30 days at these levels.

**Expiry indicator.** A dye-wick time-temperature indicator: dye moves along a paper track faster when hot, never goes back, and cannot be reset. It starts at manufacture and tracks the 90-day sealed shelf life. When the dye reaches the EXPIRED line, the app rejects the pod.

**Material rule.** No sulfur-cured or natural rubber near the pod: it can release sulfur compounds and cause false darkening. Our FKM strap is peroxide- or bisphenol-cured, not sulfur-cured.

## 5. Hardware (v5)

One reusable wristband holds one disposable pod; a flush clear shutter plate on the pod opens for the shift and closes off-shift, so nothing sticks out or flaps.

### Reusable wristband (one per worker, \~12-month life)

| Part | Material | Size (mm) | Colour | Purpose and safety |
| --- | --- | --- | --- | --- |
| Strap A (long, 11 holes) | FKM fluoroelastomer, peroxide/bisphenol-cured (no sulfur) | 122 × 24 × 2.5 | Graphite | Fits 130–200 mm wrists; resists oils and fuels |
| Strap B (short) | FKM | 48 × 24 × 2.5 | Graphite | Carries buckle and keeper |
| Strap lugs (overmould) | FKM | 12 × 30 × 3 | Graphite | Join straps to cradle |
| Breakaway link | Antistatic polymer, two snap halves | 10 × 27 × 3.7 | Safety orange | Releases if snagged by machinery; release force to set and test |
| Quick-release spring bars ×2 | 316L stainless | Ø1.8 × 28 | Steel | Swap straps; fit the collar clip |
| Buckle frame, pin, tongue | 316L stainless | Frame 8 × 30 × 3 | Steel | No light metals (Zone 0 spark rule) |
| Keeper loop | FKM | 6 × 28 × 6.5 | Graphite | No dangling strap end |
| Cradle with 2 retaining lips | Antistatic PC or PA12 | 38 × 52 × 7.3, R5 corners | Matte black | Holds pod; pod slides in from the elbow end; black cuts glare |
| Collar clip adapter (optional) | Antistatic PC + 316L clip | Fits spring-bar lugs | Black | Breathing-zone wear for compliance checks |

### Disposable sensor pod (46 × 32 × \~6 mm, one per worker per \~30 days)

| # | Part (top to bottom) | Material | Size (mm) | Colour | Purpose |
| --- | --- | --- | --- | --- | --- |
| 1 | Peel-off foil + pull tab | Foil laminate | 29 × 46 | Silver, orange tab | Blocks gas until first use; peeling starts the 30-day clock |
| 2 | Hole-shutter plate + slider tab | UV-blocking clear PC | 27.4 × 23 × 0.5; tab 6 × 1.5 | Clear, orange tab | Slides 1.5 mm: holes aligned = OPEN (shift), offset = CLOSED (off-shift); flush, cannot flap |
| 3 | Shutter guide rails | Moulded with pod | 0.6 × 26 × 0.9 | White | Guide the plate; two click positions |
| 4 | Diffusion cap | UV-blocking clear PC | 9 × 22 and 9 × 12, 0.8 thick | Clear | 1.0 mm holes on a 2.8 × 3.0 grid (21 + 12 holes), \~8–9% open area, tuned in lab |
| 5 | PTFE membrane dots | PTFE microporous | Ø1.4 under each hole | White | Keep out dust, water, sweat; ink visible between dots |
| 6 | Carbon/ZnO filter dots (reference only) | Carbon/ZnO pad | Ø1.6 × 0.5 under each hole | Black | Scrub H₂S, let humidity through |
| 7 | Fixed air gap | — | 2.0 | — | Diffusion length (Fick's law) |
| 8 | Copper-acetate ink | 5–10 mg copper acetate | 9 × 22 sensing, 9 × 12 reference | Pale blue-green → black | Sensing lane and reference cell |
| 9 | White backing | PET | 0.3 | White | Neutral colour background |
| 10 | Printed face | Inks on pod body | See purpose | — | 6-step dose scale beside the strip; colour QR 11 × 11; 4 corner markers 3 × 3; dye-wick expiry 3 × 12; green/red shutter-state dots |
| 11 | Pod body + flange | Moulded PC/PP | 29 × 46 × 4.8 on 32 × 46 × 1.2 | Matte white | Keyed slide-in fit, R1.5 corners |
| 12 | Tamper / pull tab | Moulded with pod | 10 × 7 | Red | Breaks on removal; pod cannot be reused |
| 13 | Back barrier | Foil/PET | 32 × 46 × 0.1 | Silver | No reagent touches skin |

Shipped in a foil pouch with desiccant. Overall height on the wrist is about 8 mm.

### Using one pod across many shifts

1. **Shift start:** slide the shutter OPEN (green dot shows), then scan. The app rejects a start scan that shows red.
2. **Shift end:** scan, then slide the shutter CLOSED (red dot shows). Shift dose = end scan − start scan.
3. **Off-shift check:** the change between the last end scan and the next start scan should be \~0; otherwise the app flags off-shift exposure.
4. **Binding:** on first scan the pod serial is bound to one worker. One pod = one worker's monthly record, with an entry per shift.

### Eye check without a phone

The 6 patches beside the strip run from pale blue-green (fresh) through olive and brown to black, each labelled with a dose (placeholders until calibration: 0 · 10 · 25 · 50 · 100 · 200 ppm·hr). Under them: OK / CAUTION / LEAVE AREA labels with ✓ ! ✕ icons for colour-blind users. The app gives the exact dose and the audit log.

### Pod life (targets to validate)

Targets: detection limit \~1 ppm·hr, readable range \~240 ppm·hr, replace at \~80% used (\~200 ppm·hr). 8-hour shifts, 6 per week.

| Average H₂S | Dose per shift | Life of one pod |
| --- | --- | --- |
| 0.25 ppm (low) | 2 ppm·hr | 30 days (in-use cap) |
| 0.5 ppm (low–medium) | 4 ppm·hr | 30 days (cap) |
| 1 ppm (medium) | 8 ppm·hr | \~4 weeks (\~25 shifts) |
| 3 ppm (elevated) | 24 ppm·hr | \~1.5 weeks |
| 10 ppm (India legal limit) | 80 ppm·hr | 2–3 shifts |
| Leak event, 100 ppm for 30 min | 50 ppm·hr | Retire the pod; keep it as evidence |

**Retire the pod at whichever comes first:** 90-day sealed shelf life (expiry indicator), 30 days in use (app), 80% dose capacity, tamper tab broken, or a major leak event.

### Safety and standards built in

| Requirement | Basis | How we meet it |
| --- | --- | --- |
| Entanglement near machinery | [Jewellery near machinery must be secured or break away](https://ohsinsider.com/?p=97234) | Breakaway link, quick-release lugs, flush shutter, no flaps |
| Static in explosive atmospheres | [IEC/EN 60079-0 non-metallic materials](https://www.cortemgroup.com/en/news/the-non-metallic-materials-used-in-equipment-for-atex-zones-according-to-the-iec-en-60079-0-standard), ISO 80079-36 | Antistatic grades, small plastic areas; PESO/ATEX approval planned |
| Light-metal impact sparks | [Light metals excluded from Zone 0](https://www.igem.org.uk/asset/D0A844EF-80FD-4E2C-8EF8C5D075B7194D) | 316L stainless only; no aluminium, magnesium or titanium |
| Oils and fuels on the strap | [FKM resists oil and diesel, suits wearables](https://en.wikipedia.org/wiki/FKM) | FKM straps instead of silicone |
| Skin contact | ISO 10993 | FKM strap, foil back barrier (tests to confirm) |
| Water and dust | IEC 60529, IP67 target | Sealed pod, PTFE membrane dots |
| Breathing-zone sampling | [Personal samplers sit within 30 cm of nose and mouth](https://open-exam-prep.com/study-guides/cih/air-sampling-instrumentation/active-passive-sampling) | Optional collar clip; wrist-vs-collar comparison in validation |
| Wrist sizes | [Indian women 13.2–15.5 cm](https://www.ece.uvic.ca/~bctill/papers/mocap/Nag_etal_2003.pdf); [men \~15.2–18 cm](https://pmc.ncbi.nlm.nih.gov/articles/PMC10308009/table/T1) | 11 holes cover 130–200 mm with glove and sleeve margin |
| Glove use and visual coding | ISO 3864 safety colours | 6 mm ridged orange slider; orange only on safety functions; red tamper tab |
| No sharp edges | Good practice | R0.5–5 mm rounding on every part |

## 6. Smart colour QR code

The colour QR is the pod's ID card and its colour ruler in one: it carries signed calibration data offline and gives the app many known colours to correct each phone's camera.

**What it is.** A colour 2D code (JAB Code, an ISO-standard colour barcode with an open-source decoder) printed on the pod. With 8 colours, each cell holds 3 bits instead of 1, so it fits \~100 bytes in a small area with cells big enough for phones to read.

**What it stores:**

- pod serial, batch number, manufacture date
- the batch's calibration coefficients (dose curve)
- true colour values of that batch's printed patches, measured once per batch with a spectrophotometer
- a digital signature that proves the pod is genuine

**Why both a colour QR and a brown scale:**

| Need | Black-and-white QR | Colour QR | Brown scale |
| --- | --- | --- | --- |
| Brightness and white balance | Yes | Yes | Yes |
| How each phone renders specific hues | No (only 2 neutral points) | Yes (many hues) | Partly (one colour family) |
| Fine correction in the strip's own colours | No | Partly | Yes |
| Offline calibration + signature in 10 mm | Tight, tiny cells | Yes | No |
| Eye check without a phone | No | No | Yes |

**How the app uses it.** The colour QR fixes the camera's overall colour response; the brown scale fine-tunes the exact range the strip uses. Browns alone sit almost on one line of colour space, so a colour matrix fitted only on them is unstable; the QR hues fix that. The QR cells are also spread across the pod, which helps detect glare and shadows.

**Honest limits.** The accuracy gain over browns alone is unproven; we test it on 3–4 phones with and without the QR hues. Copy protection comes from the signature, not the colours, since good printers can copy colours. Normal phone camera apps cannot read it; we design the light/dark pattern to still read as a normal QR so the serial is readable by any phone.

**PPT line:** "Colour QR = ID + offline signed calibration + full colour correction; printed brown scale = fine correction + phone-free eye check."

**SIH prototype (decided Oct 4).** The web prototype uses a normal black-and-white QR (read with jsQR) for serial, batch, date, calibration and signature, plus the printed colour patches and brown scale for colour correction. JAB Code stays in the final product design and in the PPT; a browser JAB decoder is future work.

## 7. Software

A Progressive Web App (PWA) turns one photo into a logged, lighting-corrected dose in seconds, offline.

**Why a PWA (decided Oct 4).** Judges open one link in any browser, on laptop or phone, with nothing to install. On a phone it uses the camera, works offline and can be added to the home screen like an app. The same code is wrapped into an optional Android APK with Capacitor; no Windows .exe.

**Scan pipeline:**

1. Detect the 4 corner markers and straighten the image into a flat view of the pod.
2. Decode the QR (JAB Code in the final design; normal QR with jsQR in the prototype) and verify its signature; a fake pod is rejected.
3. Sample colour patches (QR hues in the final design), brown patches, black and white (median of many pixels each).
4. Check photo quality: clipped pixels or uneven light triggers a retake.
5. Fit the colour correction: neutral and brown lightness steps fix the tone curve; a 3×3 colour matrix uses the colour patches plus browns, weighted towards the browns.
6. Self-test: a held-out brown patch more than \~3 ΔE off after correction rejects the photo.
7. Measure strip and reference cell in Lab colour; strip ΔE − reference ΔE, through the batch curve, gives ppm·hr.
8. Check the shutter state (green dot = open), expiry indicator, days in use and % capacity used.
9. Log worker ID, shift, time, dose and pod serial; works offline, syncs later, exports DGMS/OISD reports.

**Camera settings (browser camera constraints where supported; CameraX in the Android APK):** lock exposure and white balance; HDR, beauty and scene modes off; optional flash; RAW where supported.

**Stack:** React + Vite PWA; OpenCV.js (image processing in the browser); jsQR + tweetnacl (QR and signature check) in the prototype, JAB Code in the final design; dose curve fitted offline with scikit-learn and stored as coefficients; offline log in the browser (IndexedDB) with cloud sync and supervisor dashboard later; hosted on Vercel (HTTPS, needed for the camera); optional Android APK via Capacitor.

**App screens:** worker login, scan (start/end of shift), dose history per shift, pod status (% used, days left, expiry), alerts, supervisor dashboard, report export.

## 8. Budget

Estimated cost is about **₹30–65 per worker per month (₹1–3 per shift)** at volume. All prices are approximate wholesale estimates for \~10,000 units, not quotes; replace them with 2 supplier quotes each.

### Reusable wristband (one per worker, \~12-month life)

| Component | Material / process | Est. cost (₹) |
| --- | --- | --- |
| Straps A + B, lugs, keeper | FKM, moulded | 80–150 |
| Breakaway link | Antistatic polymer | 5–10 |
| Quick-release spring bars ×2 | 316L stainless | 4–10 |
| Cradle with lips | Antistatic PC or PA12, injection moulded | 10–18 |
| Buckle frame, pin, tongue | 316L stainless | 10–20 |
| Bonding and assembly | Overmould | 5–10 |
| **Band total** |  | **114–218** |

### Disposable sensor pod (one per worker per \~30 days)

| Component | Material / process | Est. cost (₹) |
| --- | --- | --- |
| Reagent | Copper acetate, 5–10 mg | <0.05 |
| Reference filter dots | Activated carbon / ZnO | <0.10 |
| Membrane dots | PTFE microporous | 2–5 |
| Diffusion cap | UV-blocking clear PC, moulded with holes | 2–4 |
| Hole-shutter plate + rails | UV-blocking clear PC, moulded | 2–4 |
| Pod body | Moulded, keyed, with tamper tab | 3–6 |
| Backing, back barrier, peel foil | White PET, foil/PET laminate | 1–3 |
| Printing | Colour QR, dose scale, markers, state dots | 1–3 |
| Expiry indicator | Dye-wick time-temperature label | 2–5 |
| Packaging | Foil pouch + desiccant | 1–3 |
| Assembly and QC | Coating, lamination, inspection | 5–10 |
| Batch calibration | Spectrophotometer + chamber tests, spread per pod | 1–3 |
| **Pod total** |  | **20–46** |

### Cost per worker

| Period | Calculation | Est. cost (₹) |
| --- | --- | --- |
| Per month | 1 pod + 1/12 of band | 30–65 |
| Per year | 12 pods + 1 band | 350–770 |
| Per shift | Monthly cost ÷ \~25 shifts | 1–3 |

For comparison, a single-use Morphix SafeAir H₂S badge costs [$160.65 per 50](https://publiclab.org/n/14892), about ₹270 each (approximate exchange rate). Using one per shift for 25 shifts is roughly ₹6,700 per worker per month. Electronic monitors need a unit price plus bump tests and sensor replacement; get an MRPL or vendor quote.

**Software running cost:** the app is free to workers; cloud hosting and database for a plant are a small fixed monthly cost (to estimate).

### SIH prototype budget (approximate)

| Item | Est. cost (₹) |
| --- | --- |
| Chemicals (copper acetate, ZnO, activated carbon, bismuth for side test) | 1,500–3,000 |
| PTFE membrane sheet, PET film, foil laminate | 1,000–2,000 |
| 3D-printed cradles, pods and caps (deferred: no printer access) | 500–1,500 |
| Printing (colour QR, scales, labels) | 300–800 |
| FKM 24 mm quick-release straps (off-the-shelf for prototype) | 500–1,000 |
| H₂S test gas and chamber access | Via college or partner lab (to confirm) |

## 9. Lab validation plan

We prove every claim with real chamber data: dose accuracy, humidity compensation, shelf life and cross-phone reading. This is our biggest edge over teams using simulated data.

### Setup

- **Chamber:** sealed acrylic or glass box (\~10–20 L) with a small fan for even air.
- **H₂S source:** certified calibration gas (e.g. 25–50 ppm in nitrogen), diluted with clean air to set levels. Avoid generating H₂S chemically in an open lab.
- **Reference measurement:** a calibrated electronic H₂S meter inside the chamber logs true ppm; true dose = measured ppm × time.
- **Logger:** temperature and humidity inside the chamber.
- **Reading:** our app plus a fixed-light photo station as a control.
- **Safety:** fume hood or ventilated room, personal H₂S alarm, a trained supervisor, gas cylinder handled by the lab. Partner with the college chemistry lab or an MRPL/industry lab.

### Tests (targets to confirm)

| # | Test | Method | Pass target |
| --- | --- | --- | --- |
| 1 | Dose calibration curve | Pods at 5+ dose levels from \~1 to 240 ppm·hr, 3 pods each | Smooth curve; app dose within ±20% of true dose |
| 2 | Saturation curve | Increase dose until ΔE stops rising | Readable to ≥240 ppm·hr; else plan Lane B or C |
| 3 | Same dose, different paths | 2 ppm × 8 h vs 16 ppm × 1 h | Same reading within ±20% (proves ppm·hr response) |
| 4 | Detection limit | Repeated low-dose and blank pods | Detects \~1 ppm·hr above blank noise |
| 5 | Humidity and temperature | No H₂S, sweep 30–90% RH and 20–45 °C | Reference-corrected reading stays near zero |
| 6 | Reference cell | Known doses; check filter at max dose over 30 days | Reference cell unchanged; no filter breakthrough |
| 7 | Shutter seal | Shutter closed in H₂S | No change in the pod |
| 8 | Multi-shift accuracy | Simulate 25 shifts with start/end scans | Sum of shift doses matches total dose |
| 9 | 30-day wear | Pods worn or cycled 30 days, no H₂S | Drift stays below detection limit |
| 10 | Shelf life | Sealed pods aged at room temp and 40–45 °C; tested at 30 and 90 days | Calibration still valid; expiry indicator matches ageing |
| 11 | Cross-phone | Same pods, 3–4 phones, varied lighting, with and without colour QR hues | Low spread between phones; shows the QR's benefit |
| 12 | Cross-sensitivity | Other sulfur gases or common plant vapours | No significant false darkening |
| 13 | Bismuth comparison | Same doses on bismuth strips | Data that justifies choosing copper acetate |
| 14 | Breakaway release force | Pull test on 20 breakaway links | Never releases in normal wear; releases on a machine snag (force to set) |
| 15 | Wrist vs collar | Pods worn side by side on wrist and collar in a field pilot | Known, stable wrist-to-breathing-zone ratio |
| 16 | Shutter durability | 60+ open/close cycles, then the shutter seal test | Still seals; holes still align when open |

**Deliverables for the PPT:** dose calibration graph, saturation curve, humidity-compensation before/after graph, and a predicted-vs-actual dose plot.

## 10. Risks and mitigations

Every known weakness has a planned fix and a lab test (section 9) that proves it.

| Risk | Mitigation | Proven by test |
| --- | --- | --- |
| Humidity and heat darken the copper film | Reference cell subtraction | 5, 6 |
| Lighting varies on site | Colour QR + brown scale correction, photo self-test, locked camera settings | 11 |
| Different phones render colours differently | Colour QR hues in the correction matrix | 11 |
| Reagent ageing on the shelf | Foil pouch, expiry indicator, 90-day limit | 10 |
| Ageing and fouling during use (dust, sweat, humidity cycles) | PTFE membrane dots, 30-day in-use cap | 9 |
| Low per-shift doses near the detection limit | Report "below 2 ppm·hr"; weekly totals exact; strictest limit (8 ppm·hr) is 4× higher | 4, 8 |
| 240:1 range on one lane is ambitious | Saturation test; Lane B or C as future fix | 2 |
| Off-shift exposure counted as work dose | Shutter + start/end scans; app flags gaps | 7, 8 |
| Worker forgets a scan | Next scan still gives cumulative dose; app flags the combined period | 8 |
| Pod swapped, reused or faked | Serial bound to one worker, tamper tab, QR signature | — |
| Other sulfur gases cause false readings | Membrane choice, cross-sensitivity tests | 12 |
| Filter in the reference cell gets used up | ZnO/carbon sized far above 30-day need | 6 |
| Sulfur from rubber parts darkens the ink | Peroxide- or bisphenol-cured FKM only; no sulfur-cured rubber | — |
| Static charge in hazardous zones | Antistatic grades, small plastic areas; PESO/ATEX certification | — |
| Skin irritation from the strap | ISO 10993-tested FKM strap; foil back barrier | — |
| Accuracy not yet proven | No claims before chamber validation | 1, 3 |
| H₂S handling in the lab | Certified gas, ventilation, alarm, supervised partner lab | — |
| Band snags in machinery | Breakaway link, quick-release lugs, flush shutter with no flaps | 14 |
| Shutter knocked closed mid-shift | Two click detents; app checks the green dot at shift start | 16 |
| Wrist is outside the breathing zone | Optional collar clip; wrist-vs-collar factor from the pilot | 15 |

## 11. Future scope

For SIH we keep one sensing lane and one medium hole size; these extensions are added only if validation shows a need.

- **Lane B (low sensitivity, high dose):** added if the saturation test fails. Same hole size, fewer holes, so manufacturing stays simple; the two lanes also cross-check each other.
- **Lane C (stain length):** a dark front moving along a channel, read as length, so lighting does not matter. A backup if colour readings still vary after correction.
- **Certification:** PESO/ATEX approval for Zone 0 use.

We rejected a two-lane large/small-hole design and a three-lane design for now: they add complexity before we know they are needed.

## 12. Design assets, pitch and open items

**CAD (Fusion 360, Hybrid Design, mm).** Python scripts are run via Utilities → Add-ins → Scripts and Add-Ins.

- **v3 (done):** silicone strap with buckle and holes, cradle with rails and lips, clip-in pod with sensing window, reference cell, colour QR, brown scale, markers, expiry wick, tamper tab, plus an exploded view.
- **v**5 (done): flush hole-shutter plate, 1.0 mm cap holes over both windows, filter dots in the reference cell, FKM straps with breakaway link and quick-release lugs; three views (shutter open, closed, exploded).
- **PPT images:** File → Capture Image (transparent background), Inspect → Section Analysis for the layers, labels added in PowerPoint; optional Animation workspace auto-explode or Render workspace.

**PPT.** Use only the official SIH template (max 6 slides): Title, Proposed Solution, Technical Approach, Feasibility & Viability, then Impact & Benefits and Research & References (confirm the last two against the official template). Three sample design decks were made as a guide.

**What judges reward (from winner write-ups):** a working, even rough, demo over polished slides; real collected data; scope kept small. Pitch order: problem stat → one-line solution → live demo → impact and cost comparison. Our demo: the live web app reading sample pod photos (paper-printed pod faces) step by step; a predicted-vs-actual plot is added once lab strips are exposed at known doses.

### Software prototype and submission (decided Oct 4)

We have no 3D-printer access, so the submission is the PPT plus three links: the live web app, the GitHub repo, and a Drive folder with the demo video. The physical pod is shown through CAD renders and paper-printed pod faces.

**What a judge sees after clicking the app link (about 2 minutes):**

1. Landing page: one-line pitch and a **Try demo** button.
2. Demo mode, already logged in as a sample worker, with built-in sample pod photos (start and end of shift), since judges have no pod.
3. Each scan step shown visually: markers found, image straightened, colours corrected, strip ΔE − reference ΔE, dose in ppm·hr.
4. Shift log, pod status (% used, days left, expiry) and an alert for a high dose.
5. Supervisor dashboard and a DGMS/OISD report download.
6. An **Upload your own photo** option and a small optional **Download Android APK** button.

**Build plan:**

| Phase | Work | Output | Time |
| --- | --- | --- | --- |
| 0 | GitHub repo, Vite + React app, Vercel deploy | Live HTTPS link | ½ day |
| 1 | Python script draws pod faces at 8+ doses (placeholder colour curve); print on paper; photograph with 2–3 phones under tube light, sunlight, yellow LED; synthetic variants | Sample image set | 1 day |
| 2 | Scan pipeline in the browser (OpenCV.js, jsQR, tweetnacl) | Photo → dose, each step shown | 3–4 days |
| 3 | App screens with offline storage and seeded demo history | Full demo flow | 2–3 days |
| 4 | vite-plugin-pwa: installable, offline | PWA tested on a phone | ½ day |
| 5 | Capacitor APK on GitHub Releases (optional) | APK download | ½ day |
| 6 | README (live link, screenshots, GIF, "demo data, lab validation pending"), demo video to Drive, links in PPT | Submission links | 1 day |

Coding is done in Claude Code connected to the GitHub repo, using this file as the project context.

### CAD images (v5)

Shutter OPEN (plate holes aligned with cap holes, used during a shift):

&#91;image: v5 pod, shutter open\]

Shutter CLOSED (holes offset, off-shift):

&#91;image: v5 pod, shutter closed\]

Exploded view (peel foil and tab, shutter plate, PTFE dots, filter dots, ink, backing, pod body, cradle):

&#91;image: v5 pod, exploded view\]

### Open items

- [ ] Team ID, theme, member names and roles
- [ ] 2 supplier quotes per component; confirm per-pod cost
- [ ] Exact MRPL/DGMS/OISD dose figures for the eye-check labels and alerts
- [ ] Partner lab and H₂S test gas access
- [ ] Final dose labels on the brown scale (after calibration)
- [ ] Reference links in the PPT
- [ ] Export v5 PPT images from Fusion 360 (Capture Image, Section Analysis)
- [ ] Build the PWA prototype (phases 0–6) in Claude Code
- [ ] Live app link, GitHub link and Drive video link in the PPT
