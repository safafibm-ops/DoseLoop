"""Hard test photos: a PRINTED pod badge photographed by different phones and laptop webcams.

Each photo simulates the whole chain a judge goes through:
  printer   (paper tint, dot gain, duller colours, colour cross-talk)
  the scene (paper held at an angle, bent, any rotation, other pods on the sheet, desk/room behind)
  the light (warm/cool/dim lamps, uneven light, a shadow across the pod, glare)
  the camera(auto exposure + white balance, tone curve, saturation boost, sharpening, blur, noise, JPEG)

Outputs <out>/<name>.jpg and <out>/manifest.json (true printed dose, what should happen).
Uses the committed print/pod_face_*.png faces, so no signing key is needed.

Run:  python3 scripts/make_adverse.py                  -> test/adverse/  (small set used by `npm test`)
      python3 scripts/make_adverse.py --stress 200 DIR  -> a big random set (test/adverse.test.js with STRESS_DIR)
      python3 scripts/make_adverse.py --gap DIR 12      -> phone vs laptop pairs (test/adverse.test.js with GAP_DIR)
"""
import json
import sys

import cv2
import numpy as np
from PIL import Image

from podlib import ROOT, SPEC, linear_to_srgb, srgb_to_linear

FACE_PPM = 40  # print/pod_face_*.png are 40 px/mm
FACES = {d: np.asarray(Image.open(ROOT / f"print/pod_face_{d:03d}.png").convert("RGB")) for d in [0, 5, 10, 25, 50, 75, 100, 150, 200]}
POD_W, POD_H = SPEC["size_mm"]

# ---------- what is printed on the A4 page (mm) ----------

def sheet_true_size():
    """The 9 true-size pods of print/pod_faces_A4.pdf (2 columns)."""
    return [(d, 20 + (k % 2) * 90, 20 + (k // 2) * 45, 1.0) for k, d in enumerate(FACES)]


def sheet_big(dose):
    """public/print/doseloop-test-badges.pdf: pods printed 3x size, a 0 ppm·hr one above the one we aim at."""
    x = (210 - POD_W * 3) / 2
    return [(0, x, 34, 3.0), (dose, x, 34 + POD_H * 3 + 30, 3.0)]


def render_region(layout, x0, y0, x1, y1, R):
    """Page area [x0,x1]x[y0,y1] mm at R px/mm (white paper, pods pasted in)."""
    w, h = int((x1 - x0) * R), int((y1 - y0) * R)
    img = np.full((h, w, 3), 255, np.uint8)
    for dose, px, py, s in layout:
        fw, fh = int(round(POD_W * s * R)), int(round(POD_H * s * R))
        ox, oy = int(round((px - x0) * R)), int(round((py - y0) * R))
        if ox >= w or oy >= h or ox + fw <= 0 or oy + fh <= 0:
            continue
        face = cv2.resize(FACES[dose], (fw, fh), interpolation=cv2.INTER_AREA)
        sx0, sy0 = max(0, -ox), max(0, -oy)
        dx0, dy0 = max(0, ox), max(0, oy)
        cw, ch = min(fw - sx0, w - dx0), min(fh - sy0, h - dy0)
        img[dy0:dy0 + ch, dx0:dx0 + cw] = face[sy0:sy0 + ch, sx0:sx0 + cw]
    return img


# ---------- printer ----------

def printer(img, rng, strength):
    """Office printer look: duller colours, darker mid-tones, cream paper, grey-ish black, slight ink spread."""
    lin = srgb_to_linear(img.astype(np.float32))
    lum = lin @ np.array([0.2126, 0.7152, 0.0722])
    lin = lin + (lum[..., None] - lin) * rng.uniform(0.05, 0.25) * strength          # less saturated
    lin = lin ** (1 + rng.uniform(0.05, 0.3, 3) * strength)                            # dot gain per ink
    mix = np.eye(3) + rng.normal(0, 0.04 * strength, (3, 3))                            # ink cross-talk
    lin = np.clip(lin @ (mix / mix.sum(1, keepdims=True)).T, 0, 1)
    paper = np.array([0.97, 0.96, 0.92]) ** rng.uniform(0.5, 2.0)
    black = rng.uniform(0.01, 0.04)
    lin = black + (paper - black) * lin
    out = linear_to_srgb(lin)
    return cv2.GaussianBlur(out.astype(np.float32), (0, 0), 0.6)


# ---------- camera + scene ----------
LIGHTS = {"daylight": [1, 1, 1], "tube": [0.9, 1, 1.12], "warm LED": [1.15, 0.95, 0.68], "tungsten": [1.3, 0.92, 0.5], "sodium": [1.25, 0.8, 0.4]}


def shoot(layout, target, cam, rng, opts):
    """Photograph the page. target = (x, y, w, h) mm of the pod to aim at."""
    W, H = cam["size"]
    tx, ty, tw, th = target
    fill = opts.get("fill", rng.uniform(0.3, 0.6))      # pod width / image width
    k = fill * W / tw                                    # camera px per mm (before tilt)
    angle = np.deg2rad(opts.get("angle", rng.uniform(-180, 180)))
    tilt = opts.get("tilt", rng.uniform(0, 0.25))
    centre = np.array([W / 2, H / 2]) + rng.uniform(-0.12, 0.12, 2) * [W, H]

    # page mm -> image px: rotate + scale about the pod centre, then perspective from a tilted page
    pc = np.array([tx + tw / 2, ty + th / 2])
    R = np.array([[np.cos(angle), -np.sin(angle)], [np.sin(angle), np.cos(angle)]])
    box = np.array([[-1, -1], [1, -1], [1, 1], [-1, 1]]) * 60  # a 120 mm square around the pod
    d = np.array([R @ (p * k) + centre for p in box])
    tdir = rng.uniform(0, 2 * np.pi)
    for i, p in enumerate(box):  # far side shrinks, near side grows
        s = 1 - tilt * (np.cos(tdir) * p[0] + np.sin(tdir) * p[1]) / 60
        d[i] = centre + (d[i] - centre) * s
    Hm = cv2.getPerspectiveTransform(np.float32(box + pc), np.float32(d))

    # which part of the page is visible -> render just that, finer than the camera sees it
    inv = np.linalg.inv(Hm)
    corners = cv2.perspectiveTransform(np.float32([[[0, 0], [W, 0], [W, H], [0, H]]]), inv)[0]
    x0, y0 = np.clip(corners.min(0) - 2, [-50, -50], [260, 350])
    x1, y1 = np.clip(corners.max(0) + 2, [-50, -50], [260, 350])
    Rr = float(np.clip(k * 1.6, 6, 40))
    while (x1 - x0) * Rr * (y1 - y0) * Rr > 40e6:
        Rr *= 0.8
    page = render_region(layout, x0, y0, x1, y1, Rr)
    page = printer(page, rng, opts.get("print", 1.0))
    # outside the A4 sheet: desk / room
    yy, xx = np.mgrid[0:page.shape[0], 0:page.shape[1]]
    mx, my = x0 + xx / Rr, y0 + yy / Rr
    off = (mx < 0) | (mx > 210) | (my < 0) | (my > 297)
    desk = np.array(opts.get("desk", rng.uniform(30, 150, 3)))
    page[off] = desk
    del yy, xx, mx, my, off

    toPage = np.array([[1 / Rr, 0, x0], [0, 1 / Rr, y0], [0, 0, 1]])
    M = Hm @ toPage
    # ink pixels much finer than the camera: pre-blur so the warp doesn't alias
    shrink = k / Rr
    if shrink < 0.7:
        page = cv2.GaussianBlur(page, (0, 0), 0.45 / shrink)
    img = cv2.warpPerspective(page, M, (W, H), flags=cv2.INTER_LINEAR, borderMode=cv2.BORDER_REPLICATE)

    # paper bend: smooth wobble of a few px
    bend = opts.get("bend", rng.uniform(0, 1))
    if bend > 0:
        gy, gx = np.mgrid[0:H, 0:W].astype(np.float32)
        amp = bend * 0.006 * fill * W
        ph = rng.uniform(0, 6.28)
        dx = amp * np.sin(gy / H * np.pi * 1.3 + ph)
        dy = amp * np.sin(gx / W * np.pi * 1.1 + ph * 0.7)
        img = cv2.remap(img, gx + dx, gy + dy, cv2.INTER_LINEAR, borderMode=cv2.BORDER_REPLICATE)
        del gx, gy, dx, dy

    lin = srgb_to_linear(img)
    gy, gx = np.mgrid[0:H, 0:W].astype(np.float32)
    gx /= W
    gy /= H
    # light colour and uneven light
    light = opts.get("light", rng.choice(list(LIGHTS)))
    lin *= np.array(LIGHTS[light], np.float32)
    g = opts.get("gradient", rng.uniform(0, 0.5))
    ang = rng.uniform(0, 6.28)
    field = 1 + g * ((gx - 0.5) * np.cos(ang) + (gy - 0.5) * np.sin(ang))
    field *= 1 - opts.get("vignette", rng.uniform(0, 0.35)) * ((gx - 0.5) ** 2 + (gy - 0.5) ** 2) * 2
    if opts.get("shadow", rng.random() < 0.25):  # soft shadow of the phone / hand
        sa = rng.uniform(0, 6.28)
        pos = (gx - 0.5 - rng.uniform(-0.15, 0.15)) * np.cos(sa) + (gy - 0.5) * np.sin(sa)
        field *= 1 - rng.uniform(0.25, 0.5) / (1 + np.exp(-pos / 0.02))
    lin *= field[..., None]
    if opts.get("glare"):
        cx, cy = rng.uniform(0.35, 0.65, 2)
        lin += 1.5 * np.exp(-(((gx - cx) / 0.05) ** 2 + ((gy - cy) / 0.035) ** 2))[..., None]
    del gx, gy, field
    return develop(lin, cam, rng, opts)


def develop(lin, cam, rng, opts):
    """What the camera does to the light (linear RGB, H x W x 3) that reaches its sensor."""
    # camera: exposure, white balance, tone curve, saturation, blur, sharpening, noise, JPEG
    expo = opts.get("exposure", rng.uniform(0.6, 1.15))
    p99 = np.percentile(lin.reshape(-1, 3).max(1), 99)
    lin = lin / p99 * expo
    awb = opts.get("awb", rng.uniform(0.3, 1.0))  # how much the camera fixes the light colour
    gw = lin.reshape(-1, 3).mean(0)
    lin *= (gw.mean() / gw) ** awb
    lin = np.clip(lin, 0, None)
    lum = lin @ np.array([0.2126, 0.7152, 0.0722], np.float32)
    lin = lum[..., None] + (lin - lum[..., None]) * cam["sat"] * rng.uniform(0.95, 1.1)
    del lum
    lin = np.clip(lin, 0, 1)
    s = linear_to_srgb(lin) / 255
    curve = cam["contrast"]
    s = s + curve * s * (1 - s) * (s - 0.5) * 2  # S-curve
    out = np.clip(s * 255, 0, 255).astype(np.float32)
    del lin, s
    blur = opts.get("blur", cam["blur"] * rng.uniform(0.6, 1.6))
    if blur > 0.2:
        out = cv2.GaussianBlur(out, (0, 0), blur)
    if opts.get("motion"):
        L = int(opts["motion"])
        kern = np.zeros((L, L), np.float32)
        kern[L // 2] = 1 / L
        rot = cv2.getRotationMatrix2D((L / 2 - 0.5, L / 2 - 0.5), rng.uniform(0, 180), 1)
        out = cv2.filter2D(out, -1, cv2.warpAffine(kern, rot, (L, L)))
    if cam["sharpen"]:
        out = cv2.addWeighted(out, 1 + cam["sharpen"], cv2.GaussianBlur(out, (0, 0), 1.5), -cam["sharpen"], 0)
    noise = opts.get("noise", cam["noise"]) / max(expo, 0.3)
    out += rng.normal(0, noise, out.shape).astype(np.float32) * (0.4 + out / 255)
    out = np.clip(out, 0, 255).astype(np.uint8)
    q = opts.get("jpeg", cam["jpeg"])
    return Image.fromarray(out), q


# ---------- a phone photographing a laptop screen ----------

def screen_shot(path, cam, rng, opts):
    """Phone photo of a laptop screen that shows the photo at `path` (what a judge does when the
    sample photo is open on a laptop). Adds the panel's own colours, its RGB sub-pixels and dark row
    gaps (these make moiré stripes when the phone's pixels don't line up), screen tilt and room
    reflections on the glass, then the phone camera."""
    src = np.asarray(Image.open(path).convert("RGB"))
    sw = int(opts.get("shown", rng.uniform(900, 1400)))  # screen pixels the photo is shown across
    sh = int(round(src.shape[0] * sw / src.shape[1]))
    disp = cv2.resize(src, (sw, sh), interpolation=cv2.INTER_AREA).astype(np.float32) / 255
    # the panel: its own gamma, white point and (smaller) colour range
    lin = disp ** opts.get("gamma", rng.uniform(2.0, 2.5))
    lin *= np.array(opts.get("white", [rng.uniform(0.88, 1.0), 1, rng.uniform(1.0, 1.15)]), np.float32)
    lum = lin @ np.array([0.2126, 0.7152, 0.0722], np.float32)
    lin = lum[..., None] + (lin - lum[..., None]) * opts.get("gamut", rng.uniform(0.65, 1.0))
    del lum
    # sub-pixels: each screen pixel is 3 vertical stripes (R, G, B) with a dark gap under it
    F = 3
    big = np.repeat(np.repeat(lin, F, 0), F, 1)
    mask = np.zeros((F, F, 3), np.float32)
    for c in range(3):
        mask[:, c, c] = 1
    mask[F - 1] *= 0.35
    mask /= mask.mean((0, 1))
    big *= np.tile(mask, (sh, sw, 1))
    del lin
    # where the screen is in the phone photo
    W, H = cam["size"]
    fill = opts.get("fill", rng.uniform(0.6, 0.95))  # shown photo width / phone photo width
    k = fill * W / big.shape[1]                       # phone px per sub-pixel column
    ang = np.deg2rad(opts.get("angle", rng.uniform(-8, 8)))
    tilt = opts.get("tilt", rng.uniform(0, 0.15))
    centre = np.array([W / 2, H / 2]) + rng.uniform(-0.05, 0.05, 2) * [W, H]
    hw, hh = big.shape[1] / 2, big.shape[0] / 2
    box = np.array([[-hw, -hh], [hw, -hh], [hw, hh], [-hw, hh]])
    R = np.array([[np.cos(ang), -np.sin(ang)], [np.sin(ang), np.cos(ang)]])
    tdir = rng.uniform(0, 2 * np.pi)
    d = []
    for p in box:
        q = centre + R @ (p * k)
        sc = 1 - tilt * (np.cos(tdir) * p[0] / hw + np.sin(tdir) * p[1] / hh) / 2
        d.append(centre + (q - centre) * sc)
    Hm = cv2.getPerspectiveTransform(np.float32(box + [hw, hh]), np.float32(d))
    # lens blur happens before the sensor samples the screen (too little of it -> moiré)
    optics = opts.get("optics", rng.uniform(0.5, 1.4))  # phone px
    big = cv2.GaussianBlur(big, (0, 0), max(0.3, optics / k))
    bezel = np.float32(opts.get("bezel", rng.uniform(0.02, 0.3)))  # browser page around the photo
    img = cv2.warpPerspective(big, Hm, (W, H), flags=cv2.INTER_LINEAR, borderMode=cv2.BORDER_CONSTANT, borderValue=(float(bezel),) * 3)
    del big
    # the glass reflects the room: an even veil plus a soft bright patch (window, lamp)
    gy, gx = np.mgrid[0:H, 0:W].astype(np.float32)
    gx /= W
    gy /= H
    img += np.float32(opts.get("veil", rng.uniform(0, 0.04)))
    refl = opts.get("reflection", rng.uniform(0, 0.25) if rng.random() < 0.5 else 0)
    if refl:
        cx, cy, r = rng.uniform(0.2, 0.8), rng.uniform(0.2, 0.8), rng.uniform(0.15, 0.4)
        tint = np.array([1, 0.97, 0.9], np.float32)
        img += refl * np.exp(-((gx - cx) ** 2 + (gy - cy) ** 2) / (2 * r * r))[..., None] * tint
    del gx, gy
    return develop(img, cam, rng, {"blur": 0, "awb": opts.get("awb", rng.uniform(0.3, 1.0)), **opts})


CAMS = {
    "phone-12MP": {"size": (4000, 3000), "blur": 1.2, "noise": 2.5, "sat": 1.25, "contrast": 0.35, "sharpen": 0.6, "jpeg": 88},
    "phone-budget": {"size": (3264, 2448), "blur": 1.8, "noise": 5, "sat": 1.3, "contrast": 0.45, "sharpen": 0.9, "jpeg": 80},
    "phone-small": {"size": (2048, 1536), "blur": 1.1, "noise": 3.5, "sat": 1.2, "contrast": 0.3, "sharpen": 0.5, "jpeg": 82},
    "webcam-1080p": {"size": (1920, 1080), "blur": 1.3, "noise": 4.5, "sat": 1.1, "contrast": 0.25, "sharpen": 0.4, "jpeg": 85},
    "webcam-720p": {"size": (1280, 720), "blur": 1.1, "noise": 6, "sat": 1.05, "contrast": 0.2, "sharpen": 0.3, "jpeg": 80},
}

# The fixed set used by `npm test`: each one is a named adverse condition.
FIXED = [
    # name, camera, sheet ('big' badge or the 'true'-size 9-pod sheet), dose, options, expected
    ("big_phone_daylight", "phone-12MP", "big", 25, {"light": "daylight", "fill": 0.55, "angle": 8}, "ok"),
    ("big_phone_tungsten_tilt", "phone-budget", "big", 50, {"light": "tungsten", "tilt": 0.3, "angle": -35, "fill": 0.45}, "ok"),
    ("big_phone_shadow", "phone-12MP", "big", 10, {"light": "tube", "shadow": True, "gradient": 0.4}, "ok"),
    ("big_phone_dim_noisy", "phone-budget", "big", 100, {"light": "warm LED", "exposure": 0.35, "noise": 9}, "ok"),
    ("big_phone_upside_down_bent", "phone-small", "big", 0, {"angle": 182, "bend": 1.0}, "ok"),
    ("big_webcam_1080p", "webcam-1080p", "big", 25, {"light": "tube", "fill": 0.4, "angle": 3}, "ok"),
    # too far for a 720p webcam: the QR dots blur together, so the app must ask for a retake
    ("big_webcam_720p_far", "webcam-720p", "big", 50, {"light": "warm LED", "fill": 0.45, "angle": -6}, "retake"),
    ("big_webcam_sodium", "webcam-1080p", "big", 150, {"light": "sodium", "fill": 0.5, "awb": 0.2}, "ok"),
    ("true_phone_sheet_close", "phone-12MP", "true", 25, {"fill": 0.42, "angle": 0, "light": "daylight"}, "ok"),
    ("true_phone_sheet_rotated", "phone-12MP", "true", 75, {"fill": 0.4, "angle": 95, "light": "tube"}, "ok"),
    ("true_phone_sheet_warm_blur", "phone-budget", "true", 5, {"fill": 0.45, "light": "warm LED", "blur": 2.0}, "ok"),
    ("big_phone_motion_blur", "phone-12MP", "big", 25, {"motion": 25}, "retake"),
    ("big_webcam_720p_close", "webcam-720p", "big", 50, {"light": "warm LED", "fill": 0.55, "angle": -4}, "ok"),
    ("true_phone_sheet_shadow_tilt", "phone-small", "true", 100, {"fill": 0.45, "shadow": True, "tilt": 0.2, "light": "tube"}, "ok"),
]


def target_of(layout, dose):
    for d, x, y, s in layout:
        if d == dose:
            return (x, y, POD_W * s, POD_H * s)


def make(name, cam, sheet, dose, opts, rng):
    layout = sheet_big(dose) if sheet == "big" else sheet_true_size()
    img, q = shoot(layout, target_of(layout, dose), CAMS[cam], rng, opts)
    return img, q


GAP_PRINT_CAMS = ["webcam-1080p", "phone-12MP", "phone-budget", "phone-small"]  # first one = the laptop
GAP_SCREEN_CAMS = ["phone-12MP", "phone-budget", "phone-small"]
GAP_SHIFTS = [("s01_shift1_start", "s02_shift1_end"), ("s03_shift2_start", "s04_shift2_end"), ("s05_shift3_start", "s06_shift3_end")]


def gap(out, n, seed):
    """Phone vs laptop: the same start + end badges scanned by different cameras.
    print:  printed big badges (0 ppm·hr and the end dose), same scene, laptop webcam vs phones.
    screen: the demo sample photos open on a laptop, photographed off the screen by phones."""
    out.mkdir(parents=True, exist_ok=True)
    pairs = []
    for i in range(n):
        base = np.random.default_rng([seed, i])
        end = int(base.choice([10, 25, 50]))
        opts = {"light": str(base.choice(list(LIGHTS))), "fill": float(base.uniform(0.45, 0.6)), "angle": float(base.uniform(-20, 20)),
                "tilt": float(base.uniform(0, 0.2)), "exposure": float(base.uniform(0.7, 1.1)), "awb": float(base.uniform(0.4, 1.0))}
        for cam in GAP_PRINT_CAMS:
            files = []
            for which, dose in (("start", 0), ("end", end)):
                rng = np.random.default_rng([seed, i, 1 if which == "start" else 2])  # same scene for every camera
                layout = sheet_big(end)
                img, q = shoot(layout, target_of(layout, dose), CAMS[cam], rng, opts)
                name = f"p{i:02d}_{cam}_{which}.jpg"
                img.save(out / name, quality=q)
                files.append(name)
            pairs.append({"kind": "print", "scene": i, "camera": cam, "start": files[0], "end": files[1], "true": end})
            print(pairs[-1], flush=True)
        s0, s1 = GAP_SHIFTS[i % len(GAP_SHIFTS)]
        sopts = {"shown": float(base.uniform(900, 1400)), "gamma": float(base.uniform(2.0, 2.5)), "gamut": float(base.uniform(0.65, 1.0)),
                 "white": [float(base.uniform(0.88, 1.0)), 1.0, float(base.uniform(1.0, 1.15))]}
        for cam in GAP_SCREEN_CAMS:
            files = []
            for which, sample in (("start", s0), ("end", s1)):
                rng = np.random.default_rng([seed, i, 3, len(files)])
                img, q = screen_shot(ROOT / f"public/samples/{sample}.jpg", CAMS[cam], rng, sopts)
                name = f"s{i:02d}_{cam}_{which}.jpg"
                img.save(out / name, quality=q)
                files.append(name)
            pairs.append({"kind": "screen", "scene": i, "camera": cam, "start": files[0], "end": files[1],
                          "laptop_start": f"public/samples/{s0}.jpg", "laptop_end": f"public/samples/{s1}.jpg"})
            print(pairs[-1], flush=True)
    (out / "manifest.json").write_text(json.dumps({"pairs": pairs}, indent=1))


def main():
    args = sys.argv[1:]
    if args[:1] == ["--stress"]:
        n, out = int(args[1]), ROOT / args[2]
        rng = np.random.default_rng(int(args[3]) if len(args) > 3 else 1)
        out.mkdir(parents=True, exist_ok=True)
        man = []
        for i in range(n):
            cam = rng.choice(list(CAMS))
            sheet = "big" if cam.startswith("webcam") or rng.random() < 0.5 else "true"
            dose = int(rng.choice(list(FACES)))
            opts = {"glare": rng.random() < 0.08}
            if sheet == "true":
                opts["fill"] = rng.uniform(0.3, 0.6)
            name = f"r{i:03d}_{cam}_{sheet}_{dose}"
            img, q = make(name, cam, sheet, dose, opts, rng)
            img.save(out / f"{name}.jpg", quality=q)
            man.append({"file": f"{name}.jpg", "camera": cam, "sheet": sheet, "true_dose": dose, "glare": bool(opts["glare"])})
            print(name, flush=True)
        (out / "manifest.json").write_text(json.dumps({"photos": man}, indent=1))
        return
    if args[:1] == ["--gap"]:
        gap(ROOT / args[1], int(args[2]) if len(args) > 2 else 5, int(args[3]) if len(args) > 3 else 1)
        return
    out = ROOT / (args[0] if args else "test/adverse")
    out.mkdir(parents=True, exist_ok=True)
    rng = np.random.default_rng(11)
    man = []
    for name, cam, sheet, dose, opts, expected in FIXED:
        img, q = make(name, cam, sheet, dose, opts, rng)
        # keep the repo small: phone photos are stored at 2400 px (still sharper than the scan needs)
        if max(img.size) > 2400:
            k = 2400 / max(img.size)
            img = img.resize((round(img.width * k), round(img.height * k)), Image.LANCZOS)
        img.save(out / f"{name}.jpg", quality=min(q, 85))
        man.append({"file": f"{name}.jpg", "camera": cam, "sheet": sheet, "true_dose": dose, "conditions": opts, "expected": expected})
        print(name, img.size)
    (out / "manifest.json").write_text(json.dumps(
        {"note": "Simulated photos of a PRINTED badge (printer + scene + light + camera). See scripts/make_adverse.py.", "photos": man}, indent=1))


if __name__ == "__main__":
    main()
