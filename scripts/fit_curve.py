"""Fit the dose curve: (strip ΔE − reference ΔE) -> ppm·hr, and save it for the app.

Today the training data is SIMULATED from the placeholder ink colours in podSpec.json.
After lab exposure, replace `simulate()` with the measured (ΔE, known dose) pairs.

Run: python3 scripts/fit_curve.py
"""
import json

import numpy as np
from sklearn.isotonic import IsotonicRegression

from podlib import ROOT, SPEC, delta_e, ink_lab

CAL_ID = "C1"
rng = np.random.default_rng(1)


def simulate(n=4000):
    ink0 = ink_lab(0)
    doses = rng.uniform(0, SPEC["capacity_ppmh"], n)
    humid = rng.uniform(0, 4, n)  # humidity/ageing darkening, same on strip and reference
    net = np.array([delta_e(ink_lab(d + h), ink0) - delta_e(ink_lab(h), ink0) for d, h in zip(doses, humid)])
    net += rng.normal(0, 0.6, n)  # reading noise
    return net, doses


net, doses = simulate()
model = IsotonicRegression(increasing=True, out_of_bounds="clip").fit(net, doses)

# Store the curve as a small lookup table the app interpolates.
xs = np.linspace(net.min(), net.max(), 60)
ys = model.predict(xs)
pred = model.predict(net)
mae = float(np.mean(np.abs(pred - doses)))

out = {
    "id": CAL_ID,
    "note": "PLACEHOLDER curve fitted on simulated data (scikit-learn IsotonicRegression). Replace with lab data.",
    "input": "deltaE76(strip, fresh ink) - deltaE76(reference, fresh ink)",
    "ink0_lab": [round(v, 3) for v in ink_lab(0)],
    "x": [round(float(v), 3) for v in xs],
    "y": [round(float(v), 2) for v in ys],
    "fit_mae_ppmh": round(mae, 2),
}
path = ROOT / f"src/scan/calibration/{CAL_ID}.json"
path.parent.mkdir(parents=True, exist_ok=True)
path.write_text(json.dumps(out, indent=1))
print(f"saved {path.relative_to(ROOT)}  (mean abs error on simulated data: {mae:.1f} ppm·hr)")
