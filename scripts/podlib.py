"""Shared helpers for the pod scripts: colour maths, the placeholder ink curve and the pod face drawing.

Everything reads src/scan/podSpec.json so the scripts and the app always agree on layout and colours.
"""
import base64
import json
from pathlib import Path

import numpy as np
import qrcode
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
SPEC = json.loads((ROOT / "src/scan/podSpec.json").read_text())


# ---------- colour maths (same formulas as src/scan/color.js) ----------

def hex_rgb(h):
    h = h.lstrip("#")
    return np.array([int(h[i:i + 2], 16) for i in (0, 2, 4)], dtype=float)


def rgb_hex(rgb):
    return "#" + "".join(f"{int(round(min(255, max(0, c)))):02x}" for c in rgb)


def srgb_to_linear(c):
    c = np.asarray(c, dtype=float) / 255.0
    return np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)


def linear_to_srgb(c):
    c = np.clip(np.asarray(c, dtype=float), 0, 1)
    return 255.0 * np.where(c <= 0.0031308, c * 12.92, 1.055 * c ** (1 / 2.4) - 0.055)


M_RGB_XYZ = np.array([[0.4124, 0.3576, 0.1805], [0.2126, 0.7152, 0.0722], [0.0193, 0.1192, 0.9505]])
WHITE = np.array([0.95047, 1.0, 1.08883])


def rgb_to_lab(rgb):
    xyz = srgb_to_linear(rgb) @ M_RGB_XYZ.T / WHITE
    f = np.where(xyz > 216 / 24389, np.cbrt(xyz), (24389 / 27 * xyz + 16) / 116)
    return np.stack([116 * f[..., 1] - 16, 500 * (f[..., 0] - f[..., 1]), 200 * (f[..., 1] - f[..., 2])], -1)


def lab_to_rgb(lab):
    lab = np.asarray(lab, dtype=float)
    fy = (lab[..., 0] + 16) / 116
    fx = fy + lab[..., 1] / 500
    fz = fy - lab[..., 2] / 200
    f = np.stack([fx, fy, fz], -1)
    xyz = np.where(f ** 3 > 216 / 24389, f ** 3, (116 * f - 16) / (24389 / 27)) * WHITE
    return linear_to_srgb(xyz @ np.linalg.inv(M_RGB_XYZ).T)


def delta_e(a, b):
    return float(np.linalg.norm(np.asarray(a) - np.asarray(b)))


# ---------- placeholder ink curve ----------

INK_DOSES = np.array(SPEC["ink"]["doses"], dtype=float)
INK_LABS = np.array([rgb_to_lab(hex_rgb(c)) for c in SPEC["ink"]["colors"]])


def ink_lab(dose):
    """Ink colour (Lab) after `dose` ppm·hr. Straight lines in Lab between the placeholder anchors."""
    d = float(np.clip(dose, INK_DOSES[0], INK_DOSES[-1]))
    return np.array([np.interp(d, INK_DOSES, INK_LABS[:, k]) for k in range(3)])


def ink_rgb(dose):
    return lab_to_rgb(ink_lab(dose))


# ---------- QR payload ----------

def qr_message(serial, batch, mfg_date, cal):
    return f"DL1|{serial}|{batch}|{mfg_date}|{cal}"


def qr_payload(signing_key, serial, batch, mfg_date, cal):
    msg = qr_message(serial, batch, mfg_date, cal)
    sig = signing_key.sign(msg.encode()).signature
    return msg + "|" + base64.b64encode(sig).decode()


# ---------- pod face drawing ----------

def _font(px):
    return ImageFont.load_default(size=max(8, int(px)))


def draw_face(payload, dose, humidity=0.0, shutter_open=True, wick=0.2, serial="", batch="", ppm=40):
    """Draw a flat pod face. dose/humidity are in ppm·hr; humidity darkens strip AND reference equally."""
    W, H = SPEC["size_mm"]
    img = Image.new("RGB", (int(W * ppm), int(H * ppm)), SPEC["background"])
    d = ImageDraw.Draw(img)
    mm = lambda v: v * ppm
    box = lambda r: [mm(r[0]), mm(r[1]), mm(r[0] + r[2]), mm(r[1] + r[3])]
    col = lambda rgb: tuple(int(round(c)) for c in rgb)

    # corner markers: black square with a white square hole
    m = SPEC["markers"]
    for cx, cy in m["centers"]:
        s, i = m["size"] / 2, m["inner"] / 2
        d.rectangle([mm(cx - s), mm(cy - s), mm(cx + s), mm(cy + s)], fill=SPEC["black"])
        d.rectangle([mm(cx - i), mm(cy - i), mm(cx + i), mm(cy + i)], fill=SPEC["background"])

    def window(rect, ink, dot_fill, dot_d):
        d.rectangle(box(rect), fill=col(ink), outline="#9a9a96", width=max(1, int(ppm * 0.1)))
        x0, y0, w, h = rect
        pitch = 2.4
        for gx in np.arange(x0 + pitch / 2, x0 + w, pitch):
            for gy in np.arange(y0 + pitch / 2, y0 + h, pitch):
                r = dot_d / 2
                d.ellipse([mm(gx - r), mm(gy - r), mm(gx + r), mm(gy + r)], fill=dot_fill)

    # sensing strip (white PTFE dots) and reference cell (black carbon/ZnO filter dots)
    window(SPEC["strip"], ink_rgb(dose + humidity), "#efefec", 1.0)
    window(SPEC["reference"], ink_rgb(humidity), "#1e1e1e", 1.2)

    # 6-step printed dose scale with labels
    s = SPEC["scale"]
    f = _font(mm(1.3))
    for k, dz in enumerate(s["doses"]):
        x = s["x"] + k * (s["w"] + s["gap"])
        d.rectangle(box([x, s["y"], s["w"], s["h"]]), fill=col(ink_rgb(dz)))
        d.text((mm(x + s["w"] / 2), mm(s["y"] + s["h"] + 0.9)), str(dz), fill="#333333", font=f, anchor="mm")

    # colour patches
    p = SPEC["patches"]
    for k, c in enumerate(p["colors"]):
        r, q = divmod(k, p["cols"])
        x, y = p["x"] + q * (p["cell"] + p["gap"]), p["y"] + r * (p["cell"] + p["gap"])
        d.rectangle(box([x, y, p["cell"], p["cell"]]), fill=c)

    # QR
    qr = qrcode.QRCode(error_correction=qrcode.constants.ERROR_CORRECT_M, border=1, box_size=10)
    qr.add_data(payload)
    qr.make(fit=True)
    q = SPEC["qr"]
    qimg = qr.make_image(fill_color=SPEC["black"], back_color="white").convert("RGB")
    img.paste(qimg.resize((int(mm(q[2])), int(mm(q[3]))), Image.NEAREST), (int(mm(q[0])), int(mm(q[1]))))

    # shutter-state dots: the plate covers one of them
    sd = SPEC["shutterDots"]
    for key, colour in (("open", sd["green"]), ("closed", sd["red"])):
        visible = (key == "open") == shutter_open
        cx, cy = sd[key]
        d.ellipse([mm(cx - sd["r"]), mm(cy - sd["r"]), mm(cx + sd["r"]), mm(cy + sd["r"])],
                  fill=colour if visible else sd["mask"])

    # dye-wick expiry indicator
    wk = SPEC["wick"]
    x, y, w, h = wk["rect"]
    d.rectangle(box(wk["rect"]), fill=wk["track"], outline="#9a9a96", width=max(1, int(ppm * 0.08)))
    d.rectangle(box([x, y, w * min(1.0, wick), h]), fill=wk["dye"])
    d.rectangle(box([x + w - 0.45, y, 0.45, h]), fill=wk["expiredLine"])

    # serial text
    d.text((mm(x), mm(y + h + 1.0)), f"{serial}  {batch}", fill="#333333", font=_font(mm(1.4)))
    d.text((mm(x), mm(y + h + 2.9)), "DoseLoop H2S", fill="#666666", font=_font(mm(1.2)))
    return img
