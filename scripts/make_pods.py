"""Phase 1: draw sample pod faces and fake "phone photos" of them.

Outputs
  print/pod_face_<dose>.png   flat faces (40 px/mm) at 8 doses
  print/pod_faces_A4.pdf      the same faces at true size (46 x 32 mm) to print and photograph
  public/print/doseloop-test-badges.pdf  big printable demo badges (3x size, easy for any camera)
  public/samples/*.jpg        simulated phone photos (lighting, tilt, noise, glare...)
  public/samples/manifest.json  what each photo shows and its true dose
  src/scan/publicKey.json     public key the app uses to check QR signatures

The signing (private) key stays in scripts/.keys/ and is never committed.
Run: python3 scripts/make_pods.py
"""
import base64
import json

import cv2
import numpy as np
from nacl.signing import SigningKey
from PIL import Image, ImageDraw, ImageFont

from podlib import ROOT, SPEC, draw_face, linear_to_srgb, qr_payload, srgb_to_linear

rng = np.random.default_rng(7)
SERIAL, BATCH, MFG, CAL = "DL-000123", "B2610A", "2026-09-20", "C1"

# ---------- signing key ----------
key_file = ROOT / "scripts/.keys/signing_key.hex"
if key_file.exists():
    sk = SigningKey(bytes.fromhex(key_file.read_text().strip()))
else:
    sk = SigningKey.generate()
    key_file.parent.mkdir(exist_ok=True)
    key_file.write_text(bytes(sk).hex())
(ROOT / "src/scan/publicKey.json").write_text(json.dumps(
    {"note": "Ed25519 public key of the pod maker (demo key).", "key": base64.b64encode(bytes(sk.verify_key)).decode()}, indent=1))
GOOD = qr_payload(sk, SERIAL, BATCH, MFG, CAL)
FAKE = qr_payload(SigningKey.generate(), SERIAL, BATCH, MFG, CAL)  # copied pod, wrong key

# ---------- printable faces ----------
out_print = ROOT / "print"
out_print.mkdir(exist_ok=True)
DPI = 600
faces = []
for dose in [0, 5, 10, 25, 50, 75, 100, 150, 200]:
    face = draw_face(GOOD, dose, serial=SERIAL, batch=BATCH, ppm=40)
    face.save(out_print / f"pod_face_{dose:03d}.png")
    faces.append((dose, face))

# A4 sheet at true size: 46 x 32 mm each, 2 columns
px = lambda mm: int(round(mm / 25.4 * DPI))
sheet = Image.new("RGB", (px(210), px(297)), "white")
for k, (dose, face) in enumerate(faces):
    r, c = divmod(k, 2)
    f = face.resize((px(46), px(32)), Image.LANCZOS)
    x, y = px(20 + c * 90), px(20 + r * 45)
    sheet.paste(f, (x, y))
    # thin cut line
    cv = np.array(sheet)
    cv2.rectangle(cv, (x - 2, y - 2), (x + f.width + 1, y + f.height + 1), (180, 180, 180), 1)
    cv2.putText(cv, f"{dose} ppm.hr", (x + f.width + px(3), y + px(16)), cv2.FONT_HERSHEY_SIMPLEX, 1.6, (90, 90, 90), 3)
    sheet = Image.fromarray(cv)
sheet.save(out_print / "pod_faces_A4.pdf", resolution=DPI, quality=95, subsampling=0)

# ---------- big demo badges (what judges print to try the live camera) ----------
# Each pod face is printed 3x size (138 x 96 mm): the QR dots are 0.8 mm, readable by laptop webcams.
BIG = 3
BDPI = 300
bpx = lambda mm: int(round(mm / 25.4 * BDPI))


def badge_page(items, title):
    page = Image.new("RGB", (bpx(210), bpx(297)), "white")
    d = ImageDraw.Draw(page)
    font = lambda mm: ImageFont.load_default(size=bpx(mm))
    d.text((bpx(15), bpx(10)), title, fill="#111111", font=font(5))
    d.text((bpx(15), bpx(17)), "Print at 100% / Actual size on plain A4 paper. Demo data, lab validation pending.", fill="#555555", font=font(3))
    w, h = SPEC["size_mm"][0] * BIG, SPEC["size_mm"][1] * BIG
    for k, (label, face) in enumerate(items):
        x, y = (210 - w) / 2, 34 + k * (h + 30)
        d.text((bpx(x), bpx(y - 8)), label, fill="#111111", font=font(4.2))
        page.paste(face.resize((bpx(w), bpx(h)), Image.LANCZOS), (bpx(x), bpx(y)))
        d.rectangle([bpx(x) - 3, bpx(y) - 3, bpx(x + w) + 3, bpx(y + h) + 3], outline="#c8c8c8", width=2)
    d.text((bpx(15), bpx(282)), "DoseLoop app: Scan > Camera, then hold the badge flat in front of the camera. It captures by itself.",
           fill="#555555", font=font(3))
    return page


def face(payload, dose, humid, **kw):
    return draw_face(payload, dose, humidity=humid, serial=SERIAL, batch=BATCH, ppm=60, **kw)


pages = [
    badge_page([("1  Shift START  (new pod, 0 ppm·hr)", face(GOOD, 0, 0.3, wick=0.15)),
                ("2  Shift END  (25 ppm·hr this shift)", face(GOOD, 25, 0.5, wick=0.2))], "DoseLoop test badges: one shift"),
    badge_page([("3  Copied pod  (fake signature: must be rejected)", face(FAKE, 10, 0.5, wick=0.2)),
                ("4  Shutter left closed  (start scan must refuse it)", face(GOOD, 18, 1.0, shutter_open=False, wick=0.2))],
               "DoseLoop test badges: things the app must catch"),
]
out_pub = ROOT / "public/print"
out_pub.mkdir(parents=True, exist_ok=True)
pages[0].save(out_pub / "doseloop-test-badges.pdf", save_all=True, append_images=pages[1:], resolution=BDPI, quality=95, subsampling=0)
pages[0].resize((pages[0].width // 4, pages[0].height // 4), Image.LANCZOS).save(out_pub / "doseloop-test-badges-preview.png")

# ---------- simulated phone photos ----------
LIGHTS = {  # per-channel gain in linear light
    "daylight": [1.0, 1.0, 1.0],
    "tube light": [0.92, 1.0, 1.08],
    "warm LED": [1.12, 0.94, 0.66],
    "dim room": [0.5, 0.47, 0.42],
    "harsh sodium lamp": [1.2, 0.8, 0.42],
}


def scene(face, ppm):
    """Pod face inside the black cradle, on a strap. Returns image + pod-plane origin offset (mm)."""
    W, H = SPEC["size_mm"]
    pad_x, pad_y = 24, 9
    img = np.zeros((int((H + 2 * pad_y) * ppm), int((W + 2 * pad_x) * ppm), 3), np.uint8)
    img[:] = (24, 24, 26)  # strap
    cy0, cy1 = int((pad_y - 4) * ppm), int((pad_y + H + 4) * ppm)
    cx0, cx1 = int((pad_x - 4) * ppm), int((pad_x + W + 4) * ppm)
    img[:, cx0:cx1] = (0, 0, 0)
    img[cy0:cy1, cx0:cx1] = (14, 14, 15)  # cradle
    img[int((pad_y - 0.8) * ppm):int((pad_y + H + 0.8) * ppm), int((pad_x - 0.8) * ppm):int((pad_x + W + 0.8) * ppm)] = (210, 210, 205)  # pod rim
    f = np.array(face)
    img[int(pad_y * ppm):int(pad_y * ppm) + f.shape[0], int(pad_x * ppm):int(pad_x * ppm) + f.shape[1]] = f
    return img, (pad_x, pad_y)


def photo(face, light, angle=0.0, scale=22.0, tilt=0.03, glare=False, noise=2.0, size=(1600, 1200)):
    ppm = 30
    sc, (ox, oy) = scene(face, ppm)
    w_out, h_out = size
    # pod-plane corners (scene px) -> photo px: rotate, scale, then jitter corners for perspective
    hs, ws = sc.shape[:2]
    src = np.float32([[0, 0], [ws, 0], [ws, hs], [0, hs]])
    k = scale / ppm
    centre = np.array([w_out / 2 + rng.uniform(-60, 60), h_out / 2 + rng.uniform(-40, 40)])
    a = np.deg2rad(angle)
    R = np.array([[np.cos(a), -np.sin(a)], [np.sin(a), np.cos(a)]])
    dst = np.array([R @ ((p - [ws / 2, hs / 2]) * k) + centre for p in src])
    dst += rng.uniform(-1, 1, dst.shape) * tilt * scale * 46
    Hm = cv2.getPerspectiveTransform(src, np.float32(dst))

    # table background
    yy, xx = np.mgrid[0:h_out, 0:w_out]
    bg = np.stack([95 + 25 * xx / w_out, 100 + 10 * yy / h_out, 110 + 0 * xx], -1) + rng.normal(0, 4, (h_out, w_out, 3))
    warped = cv2.warpPerspective(sc, Hm, size, flags=cv2.INTER_AREA)
    mask = cv2.warpPerspective(np.full(sc.shape[:2], 255, np.uint8), Hm, size) > 0
    img = np.where(mask[..., None], warped, np.clip(bg, 0, 255)).astype(np.float64)

    # lighting in linear light: colour of light, gentle shading across the frame, optional glare
    lin = srgb_to_linear(img)
    shade = 1.0 + 0.04 * (xx / w_out - 0.5) - 0.03 * (yy / h_out - 0.5)
    gains = np.array(LIGHTS[light]) / max(1.0, max(LIGHTS[light]))  # camera auto-exposure keeps the brightest channel in range
    lin = lin * gains * shade[..., None] * rng.uniform(0.85, 1.0)
    if glare:
        sx, sy = cv2.perspectiveTransform(np.float32([[[(ox + 12) * ppm, (oy + 6) * ppm]]]), Hm)[0, 0]
        g = np.exp(-(((xx - sx) / 70) ** 2 + ((yy - sy) / 45) ** 2))
        lin = lin + 2.5 * g[..., None]
    out = linear_to_srgb(lin) + rng.normal(0, noise, lin.shape)
    out = cv2.GaussianBlur(np.clip(out, 0, 255).astype(np.uint8), (0, 0), 0.8)
    return Image.fromarray(out)


SAMPLES = [
    # file, title, dose, humidity, light, extra, expected
    ("s01_shift1_start", "Shift 1 start, new pod", 0, 0.3, "daylight", {}, "ok"),
    ("s02_shift1_end", "Shift 1 end", 7.5, 0.5, "tube light", {"angle": -8}, "ok"),
    ("s03_shift2_start", "Shift 2 start", 7.5, 0.8, "warm LED", {"angle": 5}, "ok"),
    ("s04_shift2_end", "Shift 2 end", 18, 1.0, "daylight", {"angle": 12, "scale": 19}, "ok"),
    ("s05_shift3_start", "Shift 3 start (exposed off-shift)", 26, 1.2, "dim room", {"noise": 3.5}, "ok"),
    ("s06_shift3_end", "Shift 3 end", 41, 1.5, "tube light", {"angle": -15}, "ok"),
    ("s07_day12", "Day 12, upside-down photo", 95, 2.0, "warm LED", {"angle": 178}, "ok"),
    ("s08_day20", "Day 20", 150, 2.5, "daylight", {"scale": 25}, "ok"),
    ("s09_day27_retire", "Day 27, pod near capacity", 210, 3.0, "tube light", {"angle": 4}, "ok"),
    ("e01_glare", "Glare on the strip", 41, 1.5, "daylight", {"glare": True}, "retake"),
    ("e02_fake_pod", "Copied pod (bad signature)", 10, 0.5, "daylight", {"payload": FAKE}, "fake"),
    ("e03_shutter_closed", "Shift start with shutter closed", 18, 1.0, "tube light", {"shutter_open": False}, "shutter"),
    ("e04_expired", "Expired pod (wick at line)", 0, 0.5, "daylight", {"wick": 1.0}, "expired"),
    ("e05_sodium_lamp", "Strong orange street lamp", 50, 1.0, "harsh sodium lamp", {"angle": -6}, "ok"),
]

out_dir = ROOT / "public/samples"
out_dir.mkdir(parents=True, exist_ok=True)
manifest = []
for name, title, dose, humid, light, extra, expected in SAMPLES:
    face = draw_face(extra.get("payload", GOOD), dose, humidity=humid, shutter_open=extra.get("shutter_open", True),
                     wick=extra.get("wick", 0.15 + dose / 1000), serial=SERIAL, batch=BATCH, ppm=30)
    kw = {k: v for k, v in extra.items() if k in ("angle", "scale", "glare", "noise")}
    photo(face, light, **kw).save(out_dir / f"{name}.jpg", quality=90)
    manifest.append({"file": f"{name}.jpg", "title": title, "true_dose": dose, "humidity": humid,
                     "light": light, "expected": expected})
(out_dir / "manifest.json").write_text(json.dumps(
    {"note": "Simulated photos. Demo data, lab validation pending.", "worker": "W-1042", "pod": SERIAL, "samples": manifest}, indent=1))
print(f"wrote {len(faces)} print faces, A4 sheet and {len(manifest)} sample photos")
