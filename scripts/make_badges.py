"""Printable test badges: public/print/doseloop-test-badges.pdf (3 pages, one shift per page).

  Page 1  Shift 1: START 0 ppm·hr, END 20 ppm·hr   -> 20 ppm·hr this shift, Safe
  Page 2  Shift 2: START 20 ppm·hr, END 120 ppm·hr -> ~100-115 ppm·hr this shift, Over limit (80)
          (the placeholder curve reads ~10% high above 50 ppm·hr)
  Page 3  Copied pod (fake signature)              -> the app must reject it

Shift 2 starts on the exact face shift 1 ended on, so the pod shows no off-shift change.
Each pod face is printed 3x size (138 x 96 mm): the QR dots are 0.8 mm, readable by laptop webcams.

Signing: uses scripts/.keys/signing_key.hex when present. Without it (a fresh clone), the already
signed QR text is read back from print/pod_face_000.png and checked against src/scan/publicKey.json,
so this script never needs or changes the key. Run: python3 scripts/make_badges.py
"""
import base64
import json

import cv2
from nacl.signing import SigningKey, VerifyKey
from PIL import Image, ImageDraw, ImageFont

from podlib import ROOT, SPEC, draw_face, qr_message, qr_payload

SERIAL, BATCH, MFG, CAL = "DL-000123", "B2610A", "2026-09-20", "C1"


def good_payload():
    key_file = ROOT / "scripts/.keys/signing_key.hex"
    if key_file.exists():
        return qr_payload(SigningKey(bytes.fromhex(key_file.read_text().strip())), SERIAL, BATCH, MFG, CAL)
    text, _, _ = cv2.QRCodeDetector().detectAndDecode(cv2.imread(str(ROOT / "print/pod_face_000.png")))
    msg, sig = text.rsplit(":", 1)
    assert msg == qr_message(SERIAL, BATCH, MFG, CAL), f"unexpected QR text {text!r}"
    vk = VerifyKey(base64.b64decode(json.loads((ROOT / "src/scan/publicKey.json").read_text())["key"]))
    vk.verify(msg.encode(), base64.b32decode(sig + "=" * (-len(sig) % 8)))  # raises if it is not ours
    return text


GOOD = good_payload()
FAKE = qr_payload(SigningKey.generate(), SERIAL, BATCH, MFG, CAL)  # copied pod, wrong key

BIG = 3
BDPI = 300
bpx = lambda mm: int(round(mm / 25.4 * BDPI))


def badge_page(items, title, note):
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
    d.text((bpx(15), bpx(270)), note, fill="#111111", font=font(3.6))
    d.text((bpx(15), bpx(282)), "DoseLoop app: Scan > Camera, then hold the badge flat in front of the camera. It captures by itself.",
           fill="#555555", font=font(3))
    return page


def face(payload, dose, humid, **kw):
    return draw_face(payload, dose, humidity=humid, serial=SERIAL, batch=BATCH, ppm=60, **kw)


start1 = face(GOOD, 0, 0.3, wick=0.15)
end1 = face(GOOD, 20, 0.5, wick=0.2)
end2 = face(GOOD, 120, 0.5, wick=0.3)
pages = [
    badge_page([("1  Shift START  (new pod, 0 ppm·hr)", start1), ("2  Shift END  (pod at 20 ppm·hr)", end1)],
               "DoseLoop test badges: shift 1 (Safe)",
               "Expected: about 20 ppm·hr this shift, Safe. Scan 1 as Start shift, then 2 as End shift."),
    badge_page([("3  Shift START  (same pod, still 20 ppm·hr)", end1), ("4  Shift END  (pod at 120 ppm·hr)", end2)],
               "DoseLoop test badges: shift 2 (Over limit)",
               "Expected: about 100 to 115 ppm·hr this shift, Over limit (80). Scan page 1 first, then 3 as Start, 4 as End."),
    badge_page([("5  Copied pod  (fake signature)", face(FAKE, 20, 0.5, wick=0.2))],
               "DoseLoop test badges: shift 3 (must be rejected)",
               "Expected: 'Fake pod' error, nothing logged. The QR signature was not made by the pod maker."),
]
out_pub = ROOT / "public/print"
out_pub.mkdir(parents=True, exist_ok=True)
pages[0].save(out_pub / "doseloop-test-badges.pdf", save_all=True, append_images=pages[1:], resolution=BDPI, quality=95, subsampling=0)
pages[0].resize((pages[0].width // 4, pages[0].height // 4), Image.LANCZOS).save(out_pub / "doseloop-test-badges-preview.png")
print("wrote public/print/doseloop-test-badges.pdf (3 pages)")
