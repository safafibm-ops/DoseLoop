# SIH26118 - Team LoopHole - H2S Dosimeter Wristband: v6 PROTOTYPE MODEL
# (reusable frame + one-time laminated sensor card + motorised dock)
# Fusion 360, Hybrid Design, units mm.
# Run: UTILITIES > ADD-INS > Scripts and Add-Ins > select script > Run
# This script CLEARS the current design and rebuilds it. All views take ~2-5 minutes.
#
# v6 changes vs v5:
#   - The moulded disposable pod is gone. A reusable FRAME (body, shutter, rails, corner markers)
#     stays in the cradle for ~12 months.
#   - The one-time part is a flat laminated SENSOR CARD (28.6 x 40 x 2.7 mm): metallized white PET
#     backing, copper-acetate ink, 2 mm PET spacer, carbon/ZnO ribbons (reference only),
#     PTFE membrane ribbons, laser-perforated clear PET hole film, printed scale/QR/heat dot/state dots.
#   - The card slides in from one end of the frame and pushes the old card out of the other end.
#   - The dye-wick expiry label is replaced by an irreversible heat dot + QR date + app check.
#   - New: motorised DOCK that peels the foil, swaps the card and reads it under fixed light.
#
# Views:
#   y =    0 mm : worn band, shutter OPEN (during the shift)   <- main view for the PPT
#   y =  -85 mm : cradle + frame + card, shutter CLOSED (off-shift)
#   y =  +85 mm : exploded frame + card stack incl. peel foil
#   y = +360 mm : dock with the band in the nest (housing and lid shown clear)
# Axes: X = along the strap (around the wrist), Y = along the forearm, Z = up from the skin.
# All sizes are prototype targets; tune after lab tests. Demo data, lab validation pending.

import adsk.core, adsk.fusion, traceback

BUILD_CLOSED_VIEW = True     # set False to build faster
BUILD_EXPLODED_VIEW = True
BUILD_DOCK = True
GAP = 7.0                    # exploded layer spacing (mm)
EXAMPLE_STEP = 3             # sensing-ink darkness shown: 0 fresh ... 5 saturated
DOCK_Y = 360.0               # dock position along Y

MM = 0.1                     # Fusion API works in cm
NEW = adsk.fusion.FeatureOperations.NewBodyFeatureOperation
CUT = adsk.fusion.FeatureOperations.CutFeatureOperation
Z0 = 0.0                     # global Z lift (used to place the band inside the dock nest)

# ---------- key dimensions (mm) ----------
STRAP_W, STRAP_T = 24.0, 2.5
CR_W, CR_L, CR_H, CR_FLOOR = 38.0, 52.0, 7.3, 1.2   # cradle: X, Y, height, floor (same as v5)
CAV_W, CAV_L = 33.0, 47.0                           # cradle cavity

# reusable frame (sits in the cradle cavity, open at both Y ends for the card)
FR_W, FR_L = 32.0, 46.0
FR_BASE_Z, FR_BASE_T = 1.3, 0.8                     # frame floor 1.3 .. 2.1
FR_WALL = 1.6                                       # side walls (card guides)
FR_TOP_Z, FR_TOP_T = 5.3, 1.0                       # top plate 5.3 .. 6.3
ZT = FR_TOP_Z + FR_TOP_T                            # frame top = 6.3
OPEN_X, OPEN_Y0, OPEN_Y1 = 12.5, -8.0, 19.5         # top-plate opening over holes, scale, heat dot
QRW = (-8.0, 4.0, -19.9, -8.5)                      # top-plate QR window x0, x1, y0, y1

# one-time sensor card
CARD_W, CARD_L = 28.6, 40.0
CARD_Z = 2.2                                        # card bottom (on frame floor)
T_BACK, T_INK, T_GAP, T_FILM, T_PRINT = 0.3, 0.15, 2.0, 0.2, 0.05
Z_INK = CARD_Z + T_BACK                             # 2.5
Z_GAP = Z_INK + T_INK                               # 2.65
Z_FILM = Z_GAP + T_GAP                              # 4.65
Z_PRINT = Z_FILM + T_FILM                           # 4.85
CARD_TOP = Z_PRINT + T_PRINT                        # 4.9

SENS = {'cx': -7.0, 'cy': 5.0, 'w': 9.0, 'l': 22.0, 'rows': 7}
REF = {'cx': 7.0, 'cy': 9.0, 'w': 9.0, 'l': 12.0, 'rows': 4}
HOLE_R, HOLE_DX, HOLE_DY = 0.5, 2.8, 3.0            # 1.0 mm holes, 3 columns per window

# shutter (reusable, on the frame); slides 1.5 mm along Y
SHUT_W, SHUT_CY, SHUT_L, SHUT_T = 24.6, 5.5, 23.0, 0.5
SHUT_Z = 5.35                                       # 0.45 mm above the card hole film
SHUT_SLIDE = 1.5

# ---------- colours (RGB) ----------
COL = {
    'strap': (40, 44, 52),      # graphite FKM
    'cradle': (22, 22, 24),     # matte black antistatic PC/PA12 (cuts glare)
    'frame': (244, 244, 240),   # matte white frame (neutral background)
    'green': (22, 163, 74),     # shutter OPEN indicator
    'orange': (240, 90, 20),    # safety orange: safety functions only
    'red': (200, 30, 30),       # tamper / void
    'steel': (176, 182, 189),   # 316L stainless
    'white': (255, 255, 255),
    'black': (12, 12, 12),
    'silver': (200, 200, 205),
    'carbon': (35, 35, 35),
    'heat': (235, 225, 210),    # heat dot before trigger (turns dark when overheated)
    'pcb': (20, 110, 60),
    'motor': (70, 72, 78),
    'rubber': (30, 30, 30),
    'led': (255, 250, 230),
    'clear': (205, 222, 235),   # fallback if no clear appearance is found
}
# Dose scale (placeholder until lab calibration): fresh copper acetate (pale blue-green) -> olive -> brown -> CuS black
SCALE = [(175, 222, 208), (175, 200, 170), (167, 162, 113),
         (152, 125, 81), (115, 83, 58), (36, 30, 26)]
QR_COLS = [(0, 170, 220), (220, 0, 140), (255, 210, 0), (220, 30, 30), (0, 160, 70),
           (30, 60, 200), (12, 12, 12), (0, 170, 220), (255, 210, 0)]

app = design = BASE = CLEAR = None
FAILED = []


# ---------- appearances ----------
def _lib():
    libs = app.materialLibraries
    for n in ('Fusion Appearance Library', 'Fusion 360 Appearance Library'):
        lib = libs.itemByName(n)
        if lib:
            return lib
    for i in range(libs.count):
        if 'Appearance' in libs.item(i).name:
            return libs.item(i)
    return None


def find_base():
    lib = _lib()
    if not lib:
        return None
    a = lib.appearances.itemByName('Plastic - Matte (Yellow)')
    if a:
        return a
    for i in range(min(lib.appearances.count, 500)):
        c = lib.appearances.item(i)
        if c.appearanceProperties.itemById('opaque_albedo'):
            return c
    return None


def find_clear():
    lib = _lib()
    if not lib:
        return None
    for i in range(min(lib.appearances.count, 2000)):
        a = lib.appearances.item(i)
        n = a.name.lower()
        if 'clear' in n and ('glass' in n or 'plastic' in n or 'polycarbonate' in n or 'acrylic' in n):
            return a
    return None


def paint(body, rgb):
    if not BASE:
        return
    key = 'SIH %d-%d-%d' % rgb
    ap = design.appearances.itemByName(key)
    if not ap:
        ap = design.appearances.addByCopy(BASE, key)
        p = adsk.core.ColorProperty.cast(ap.appearanceProperties.itemById('opaque_albedo'))
        if p:
            p.value = adsk.core.Color.create(rgb[0], rgb[1], rgb[2], 0)
    body.appearance = ap


def paint_clear(body):
    if CLEAR:
        ap = design.appearances.itemByName('SIH Clear PC')
        if not ap:
            ap = design.appearances.addByCopy(CLEAR, 'SIH Clear PC')
        body.appearance = ap
    else:
        paint(body, COL['clear'])


# ---------- geometry helpers ----------
def P(x, y, z=0.0):
    return adsk.core.Point3D.create(x * MM, y * MM, z * MM)


def new_comp(root, name):
    occ = root.occurrences.addNewComponent(adsk.core.Matrix3D.create())
    occ.component.name = name
    return occ.component


def sketch(comp):
    return comp.sketches.add(comp.xYConstructionPlane)


def add_rect(sk, cx, cy, w, l):
    sk.sketchCurves.sketchLines.addTwoPointRectangle(P(cx - w / 2, cy - l / 2), P(cx + w / 2, cy + l / 2))


def extrude(comp, sk, z, h, op, targets=None):
    ext = comp.features.extrudeFeatures
    profs = adsk.core.ObjectCollection.create()
    for i in range(sk.profiles.count):
        profs.add(sk.profiles.item(i))
    inp = ext.createInput(profs, op)
    inp.setDistanceExtent(False, adsk.core.ValueInput.createByReal(h * MM))
    zz = z + Z0
    if zz:
        inp.startExtent = adsk.fusion.OffsetStartDefinition.create(adsk.core.ValueInput.createByReal(zz * MM))
    if targets:
        inp.participantBodies = targets
    f = ext.add(inp)
    sk.isVisible = False
    return f


TOL = 1e-4


def _is_line(e):
    return e.geometry.curveType == adsk.core.Curve3DTypes.Line3DCurveType


def p_vert(e, b):
    bb = e.boundingBox
    return (_is_line(e) and (bb.maxPoint.z - bb.minPoint.z) > TOL
            and (bb.maxPoint.x - bb.minPoint.x) < TOL and (bb.maxPoint.y - bb.minPoint.y) < TOL)


def p_top(e, b):
    z = b.boundingBox.maxPoint.z
    bb = e.boundingBox
    return abs(bb.maxPoint.z - z) < TOL and abs(bb.minPoint.z - z) < TOL


def p_bot(e, b):
    z = b.boundingBox.minPoint.z
    bb = e.boundingBox
    return abs(bb.maxPoint.z - z) < TOL and abs(bb.minPoint.z - z) < TOL


def p_tip(x_mm):
    return lambda e, b: p_vert(e, b) and e.boundingBox.minPoint.x > x_mm * MM


def fillet(comp, body, r, pred):
    edges = adsk.core.ObjectCollection.create()
    for i in range(body.edges.count):
        e = body.edges.item(i)
        if pred(e, body):
            edges.add(e)
    if edges.count == 0:
        return body
    try:
        fi = comp.features.filletFeatures.createInput()
        val = adsk.core.ValueInput.createByReal(r * MM)
        try:
            fi.edgeSetInputs.addConstantRadiusEdgeSet(edges, val, True)
        except AttributeError:
            fi.addConstantRadiusEdgeSet(edges, val, True)
        f = comp.features.filletFeatures.add(fi)
        if f.bodies.count:
            return f.bodies.item(0)
    except:
        FAILED.append(body.name)
    return body


def box(comp, name, cx, cy, z, w, l, h, rgb, rv=0, rtop=0, rbot=0, tip=None):
    sk = sketch(comp)
    add_rect(sk, cx, cy, w, l)
    b = extrude(comp, sk, z, h, NEW).bodies.item(0)
    b.name = name
    if rgb == 'clear':
        paint_clear(b)
    else:
        paint(b, rgb)
    if rv:
        b = fillet(comp, b, rv, p_tip(tip) if tip is not None else p_vert)
    if rtop:
        b = fillet(comp, b, rtop, p_top)
    if rbot:
        b = fillet(comp, b, rbot, p_bot)
    return b


def cut_rect(comp, target, cx, cy, z, w, l, h):
    sk = sketch(comp)
    add_rect(sk, cx, cy, w, l)
    extrude(comp, sk, z, h, CUT, [target])


def cut_holes(comp, target, centres, r, z, h):
    sk = sketch(comp)
    for (x, y) in centres:
        sk.sketchCurves.sketchCircles.addByCenterRadius(P(x, y), r * MM)
    extrude(comp, sk, z, h, CUT, [target])


def multi_box(comp, name, specs, z, h):
    """Many small coloured squares in one feature. specs: (cx, cy, w, l, rgb)."""
    sk = sketch(comp)
    for s in specs:
        add_rect(sk, s[0], s[1], s[2], s[3])
    f = extrude(comp, sk, z, h, NEW)
    for i in range(f.bodies.count):
        b = f.bodies.item(i)
        bb = b.boundingBox
        mx = (bb.minPoint.x + bb.maxPoint.x) / 2 / MM
        my = (bb.minPoint.y + bb.maxPoint.y) / 2 / MM
        s = min(specs, key=lambda q: (q[0] - mx) ** 2 + (q[1] - my) ** 2)
        b.name = '%s %d' % (name, i + 1)
        paint(b, s[4])


def multi_disc(comp, name, centres, r, z, h, rgb):
    sk = sketch(comp)
    for (x, y) in centres:
        sk.sketchCurves.sketchCircles.addByCenterRadius(P(x, y), r * MM)
    f = extrude(comp, sk, z, h, NEW)
    for i in range(f.bodies.count):
        b = f.bodies.item(i)
        b.name = '%s %d' % (name, i + 1)
        paint(b, rgb)


def cyl(comp, name, p1, p2, r, rgb):
    tbm = adsk.fusion.TemporaryBRepManager.get()
    a = (p1[0], p1[1], p1[2] + Z0)
    b2 = (p2[0], p2[1], p2[2] + Z0)
    tb = tbm.createCylinderOrCone(P(*a), r * MM, P(*b2), r * MM)
    bf = comp.features.baseFeatures.add()
    bf.startEdit()
    comp.bRepBodies.add(tb, bf)
    bf.finishEdit()
    b = bf.bodies.item(bf.bodies.count - 1)
    b.name = name
    if rgb == 'clear':
        paint_clear(b)
    else:
        paint(b, rgb)
    return b


def hole_centres(win, oy):
    n = win['rows']
    return [(win['cx'] + dx, oy + win['cy'] + (k - (n - 1) / 2.0) * HOLE_DY)
            for dx in (-HOLE_DX, 0.0, HOLE_DX) for k in range(n)]


def ribbons(win, oy, width):
    """One ribbon per hole column (membrane / carbon), so the ink stays visible between columns."""
    return [(win['cx'] + dx, oy + win['cy'], width, win['l']) for dx in (-HOLE_DX, 0.0, HOLE_DX)]


# ---------- reusable wristband: straps, lugs, buckle, keeper, breakaway (unchanged from v5) ----------
def build_band(root, oy=0.0, tag=''):
    c = new_comp(root, 'Wristband (reusable)' + tag)
    for sx in (1, -1):
        box(c, 'Strap lug (overmould)', 24 * sx, oy, 0, 12, 30, 3.0, COL['strap'], rv=3, rtop=0.8)
        cyl(c, 'Quick-release spring bar 316L', (20.5 * sx, oy - 14, 1.5), (20.5 * sx, oy + 14, 1.5), 0.9, COL['steel'])

    # Long strap: 11 holes -> fits ~130-200 mm wrists
    a = box(c, 'Strap A - holes (FKM)', 89, oy, 0, 122, STRAP_W, STRAP_T, COL['strap'],
            rv=11.9, tip=89, rtop=0.8, rbot=0.8)
    cut_holes(c, a, [(50 + 7 * i, oy) for i in range(11)], 1.6, -0.5, 3.5)

    box(c, 'Strap B - buckle (FKM)', -54, oy, 0, 48, STRAP_W, STRAP_T, COL['strap'], rtop=0.8, rbot=0.8)
    frame = box(c, 'Buckle frame 316L', -82, oy, 0, 8, 30, 3.0, COL['steel'], rv=2.0)
    cut_rect(c, frame, -82, oy, -0.5, 4.4, 25, 4.0)
    cyl(c, 'Buckle pin 316L', (-79.6, oy - 13, 1.5), (-79.6, oy + 13, 1.5), 0.9, COL['steel'])
    box(c, 'Buckle tongue 316L', -82.5, oy, 2.2, 7, 2.0, 1.2, COL['steel'], rv=0.6)

    loop = box(c, 'Keeper loop (FKM)', -66, oy, -1.0, 6, 28, 6.5, COL['strap'], rv=1.5)
    cut_rect(c, loop, -66, oy, 0, 7, 24.6, 4.5)

    box(c, 'Breakaway link half A', -44.6, oy, -0.6, 4.8, 27, 3.7, COL['orange'], rv=1.2, rtop=0.6)
    box(c, 'Breakaway link half B', -39.4, oy, -0.6, 4.8, 27, 3.7, COL['orange'], rv=1.2, rtop=0.6)


# ---------- reusable cradle: now open at BOTH Y ends (card in at -Y, old card out at +Y) ----------
def build_cradle(root, oy, tag):
    c = new_comp(root, 'Cradle (reusable)' + tag)
    shell = box(c, 'Cradle shell (antistatic PC/PA12)', 0, oy, 0, CR_W, CR_L, CR_H, COL['cradle'],
                rv=5, rtop=1.0, rbot=1.0)
    cut_rect(c, shell, 0, oy, CR_FLOOR, CAV_W, CAV_L, 7.0)                  # frame cavity
    cut_rect(c, shell, 0, oy - 24.25, CR_FLOOR, CAV_W, 4.5, 7.0)           # card entry end
    cut_rect(c, shell, 0, oy + 24.25, CARD_Z - 0.1, CARD_W + 1.4, 4.5, 3.2)  # old-card exit slot


# ---------- reusable frame + shutter ----------
def build_frame(root, oy, g, tag, shutter_open=True):
    L = lambda n: n * g
    fr = new_comp(root, 'Frame (reusable, ~12 months)' + tag)
    box(fr, 'Frame floor', 0, oy, FR_BASE_Z + L(0), FR_W, FR_L, FR_BASE_T, COL['frame'], rv=1.5)
    for sx in (1, -1):
        box(fr, 'Card guide wall', sx * (FR_W / 2 - FR_WALL / 2), oy, FR_BASE_Z + FR_BASE_T + L(0),
            FR_WALL, FR_L, FR_TOP_Z - FR_BASE_Z - FR_BASE_T, COL['frame'])
        box(fr, 'Spring lip (holds card flat)', sx * 14.0, oy, CARD_TOP + 0.05 + L(8), 0.8, CARD_L - 4,
            FR_TOP_Z - CARD_TOP - 0.05, COL['frame'])
    top = box(fr, 'Frame top plate', 0, oy, FR_TOP_Z + L(8), FR_W, FR_L, FR_TOP_T, COL['frame'], rv=1.5, rtop=0.4)
    cut_rect(fr, top, 0, oy + (OPEN_Y0 + OPEN_Y1) / 2, FR_TOP_Z - 0.5 + L(8),
             2 * OPEN_X, OPEN_Y1 - OPEN_Y0, FR_TOP_T + 1.0)                       # holes / scale / heat dot
    cut_rect(fr, top, (QRW[0] + QRW[1]) / 2, oy + (QRW[2] + QRW[3]) / 2, FR_TOP_Z - 0.5 + L(8),
             QRW[1] - QRW[0], QRW[3] - QRW[2], FR_TOP_T + 1.0)                    # QR window

    # corner markers printed on the frame (reusable)
    z0 = ZT + L(8)
    corners = [(-13.5, 21.2), (13.5, 21.2), (-13.5, -21.2), (13.5, -21.2)]
    multi_box(fr, 'Corner marker', [(x, oy + y, 3.0, 3.0, COL['black']) for (x, y) in corners], z0, 0.08)
    multi_box(fr, 'Marker centre', [(x, oy + y, 1.2, 1.2, COL['white']) for (x, y) in corners], z0 + 0.08, 0.04)

    # flush hole-shutter plate (clear UV-blocking PC, same hole pattern as the card)
    s = new_comp(root, 'Hole-shutter plate (reusable)' + tag)
    dy = 0.0 if shutter_open else -SHUT_SLIDE
    zs = SHUT_Z + L(9)
    for sx in (1, -1):
        box(s, 'Shutter guide rail', sx * 12.25, oy + (OPEN_Y0 + OPEN_Y1) / 2, zs + SHUT_T + 0.05,
            0.5, OPEN_Y1 - OPEN_Y0, ZT - SHUT_Z - SHUT_T - 0.05, COL['frame'])
    plate = box(s, 'Shutter plate (clear UV-block PC)', 0, oy + SHUT_CY + dy, zs, SHUT_W, SHUT_L, SHUT_T,
                'clear', rv=1.0)
    holes_all = [(x, y + dy) for (x, y) in hole_centres(SENS, oy) + hole_centres(REF, oy)]
    cut_holes(s, plate, holes_all, HOLE_R, zs - 0.2, SHUT_T + 0.4)
    # black flag hides the red card dot when OPEN and the green dot when CLOSED
    box(s, 'State flag', 7.0, oy - 3.1 + dy, zs + SHUT_T, 2.4, 1.5, 0.05, COL['black'])
    box(s, 'Slider tab (glove ridge)', 0, oy + SHUT_CY + SHUT_L / 2 + 0.7 + dy, zs, 6.0, 1.4,
        ZT + 0.5 - SHUT_Z, COL['orange'], rv=0.5)


# ---------- one-time laminated sensor card ----------
def build_card(root, oy, g, tag, show_foil):
    L = lambda n: n * g
    c = new_comp(root, 'Sensor card (one-time)' + tag)
    box(c, 'Metallized white PET backing (barrier + white base)', 0, oy, CARD_Z + L(1),
        CARD_W, CARD_L, T_BACK, COL['white'], rv=1.0)
    box(c, 'Copper acetate ink - sensing lane', SENS['cx'], oy + SENS['cy'], Z_INK + L(2),
        SENS['w'], SENS['l'], T_INK, SCALE[EXAMPLE_STEP])
    box(c, 'Copper acetate ink - reference cell', REF['cx'], oy + REF['cy'], Z_INK + L(2),
        REF['w'], REF['l'], T_INK, SCALE[0])

    sp = box(c, 'Rigid PET spacer (2.0 mm air gap)', 0, oy, Z_GAP + L(3), CARD_W, CARD_L, T_GAP, COL['white'], rv=1.0)
    for win in (SENS, REF):
        cut_rect(c, sp, win['cx'], oy + win['cy'], Z_GAP - 0.5 + L(3), win['w'], win['l'], T_GAP + 1.0)

    multi_box(c, 'Carbon/ZnO ribbon (reference only)',
              [r + (COL['carbon'],) for r in ribbons(REF, oy, 1.6)], Z_FILM - 0.5 + L(4), 0.4)
    multi_box(c, 'PTFE membrane ribbon',
              [r + (COL['white'],) for r in ribbons(SENS, oy, 1.4) + ribbons(REF, oy, 1.4)],
              Z_FILM - 0.1 + L(5), 0.1)

    film = box(c, 'Laser-perforated clear PET hole film', 0, oy, Z_FILM + L(6), CARD_W, CARD_L, T_FILM,
               'clear', rv=1.0)
    cut_holes(c, film, hole_centres(SENS, oy) + hole_centres(REF, oy), HOLE_R, Z_FILM - 0.2 + L(6), T_FILM + 0.4)

    # printed on the hole film in one pass (measured per roll, true values stored in the QR)
    z0 = Z_PRINT + L(6)
    multi_box(c, 'Dose scale patch', [(0.0, oy - 5.0 + 3.6 * i, 3.0, 3.0, SCALE[i]) for i in range(6)], z0, T_PRINT)
    box(c, 'Colour QR base', (QRW[0] + QRW[1]) / 2, oy - 14.2, z0, 11, 11, T_PRINT, COL['white'])
    finders = [(-6.0, -10.2), (2.0, -10.2), (-6.0, -18.2)]
    multi_box(c, 'QR finder', [(x, oy + y, 3.0, 3.0, COL['black']) for (x, y) in finders], z0 + T_PRINT, 0.05)
    multi_box(c, 'QR finder centre', [(x, oy + y, 1.2, 1.2, COL['white']) for (x, y) in finders], z0 + 2 * T_PRINT, 0.03)
    multi_box(c, 'QR colour module',
              [(-3.5 + 1.6 * i, oy - 17.2 + 1.6 * j, 1.4, 1.4, QR_COLS[3 * j + i]) for i in range(3) for j in range(3)],
              z0 + T_PRINT, 0.05)
    multi_disc(c, 'Irreversible heat dot (wax-melt)', [(REF['cx'], oy + 0.8)], 1.5, z0, T_PRINT, COL['heat'])
    multi_box(c, 'Shutter state dot', [(7.0, oy - 4.6, 2.0, 1.4, COL['green']),
                                       (7.0, oy - 3.1, 2.0, 1.4, COL['red'])], z0, T_PRINT)
    box(c, 'Void tear stripe (tamper)', 0, oy + CARD_L / 2 - 0.8, z0, CARD_W - 2, 1.2, T_PRINT, COL['red'])

    if show_foil:
        f = new_comp(root, 'Peel-off foil (as shipped)' + tag)
        box(f, 'Peel-off foil', 0, oy, CARD_TOP + 0.05 + L(10), CARD_W, CARD_L, 0.05, COL['silver'])
        box(f, 'Foil pull tab (leading edge, gripped by the dock)', 0, oy + CARD_L / 2 + 3.0,
            CARD_TOP + 0.05 + L(10), 10, 6, 0.05, COL['orange'])


# ---------- motorised dock (concept) ----------
# Part sizes are real catalogue sizes: NEMA 17 stepper 42.3 mm square; Raspberry Pi Zero 2 W 65 x 30 mm;
# Raspberry Pi Camera Module 3 25 x 24 x 11.5 mm; N20 gear motor 12 x 10 mm; A4988 driver ~20 x 15 mm.
def build_dock(root, oy):
    global Z0
    ZD = 80.0                       # deck top = where the cradle sits
    YMIN, YMAX = -215.0, 80.0
    YC, DD, DW = (YMIN + YMAX) / 2, YMAX - YMIN, 160.0
    PATH = ZD + CARD_Z              # card path height (bottom of card)

    c = new_comp(root, 'Dock (motorised card changer)')
    sh = box(c, 'Dock housing (opaque in product; shown clear)', 0, oy + YC, 0, DW, DD, ZD - 6, 'clear', rv=8)
    cut_rect(c, sh, 0, oy + YC, 3, DW - 6, DD - 6, ZD)
    deck = box(c, 'Deck plate', 0, oy + YC, ZD - 6, DW, DD, 6, COL['cradle'], rv=8)
    cut_rect(c, deck, 0, oy + 50, ZD - 7, 40, 44, 8)                                 # used-card chute

    # nest: 4 locating posts around the cradle, strap slots stay free
    for sx in (1, -1):
        for sy in (1, -1):
            box(c, 'Nest locating post', sx * 21.0, oy + sy * 23.0, ZD, 4, 6, 6, COL['motor'])
    box(c, 'Card track (magazine to cradle)', 0, oy - 55.0, ZD, 30, 58, CARD_Z, COL['motor'])
    box(c, 'Exit lip to chute', 0, oy + 28.0, ZD, 30, 4, CARD_Z, COL['motor'])

    # sealed card magazine (bottom-fed stack, spring follower, desiccant lid)
    m_in_y0, m_in_y1 = -80.0, -40.0
    mag = box(c, 'Sealed card magazine (25 cards)', 0, oy + (m_in_y0 + m_in_y1) / 2, PATH,
              CARD_W + 5.0, (m_in_y1 - m_in_y0) + 3.0, 100, 'clear')
    cut_rect(c, mag, 0, oy + (m_in_y0 + m_in_y1) / 2, PATH, CARD_W + 0.8, (m_in_y1 - m_in_y0) + 0.6, 101)
    cut_rect(c, mag, 0, oy + m_in_y1 + 0.8, PATH - 0.1, CARD_W + 0.8, 2.0, 3.1)        # front exit slot
    cut_rect(c, mag, 0, oy + m_in_y0 - 0.8, PATH - 0.1, 22, 2.0, 3.0)                  # pusher slot
    box(c, 'Card stack (each card sealed by its own foil)', 0, oy + (m_in_y0 + m_in_y1) / 2, PATH,
        CARD_W, CARD_L, 70, COL['white'])
    box(c, 'Follower plate', 0, oy + (m_in_y0 + m_in_y1) / 2, PATH + 70.5, CARD_W, CARD_L, 1.5, COL['steel'])
    cyl(c, 'Follower spring', (0, oy - 60, PATH + 72), (0, oy - 60, PATH + 98), 5, COL['steel'])
    box(c, 'Magazine lid with desiccant + gasket', 0, oy + (m_in_y0 + m_in_y1) / 2, PATH + 100,
        CARD_W + 5.0, (m_in_y1 - m_in_y0) + 3.0, 4, COL['cradle'])

    # pusher: NEMA 17 stepper -> T8 lead screw -> carriage -> flat push rod (60 mm stroke)
    zs = ZD + 21.15
    box(c, 'Stepper NEMA 17 (card pusher)', 0, oy - 190.0, ZD, 42.3, 40, 42.3, COL['motor'])
    cyl(c, 'Shaft coupler', (0, oy - 170, zs), (0, oy - 164, zs), 5, COL['steel'])
    cyl(c, 'T8 lead screw', (0, oy - 164, zs), (0, oy - 86, zs), 4, COL['steel'])
    cyl(c, 'Guide rod', (16, oy - 170, zs), (16, oy - 86, zs), 3, COL['steel'])
    box(c, 'Screw end bearing', 8, oy - 84.0, PATH + 5.8, 30, 4, 22, COL['motor'])
    box(c, 'Lead-screw carriage (shown at start)', 4, oy - 153.0, zs - 11, 34, 16, 22, COL['cradle'])
    box(c, 'Carriage arm', 0, oy - 141.0, PATH + 2.4, 10, 8, zs - 11 - PATH - 2.4, COL['cradle'])
    box(c, 'Push rod (stainless strip)', 0, oy - 113.0, PATH + 0.2, 20, 64, 2.2, COL['steel'])
    box(c, 'Home limit switch', 24, oy - 160.0, ZD, 12, 6, 6, COL['black'])

    # foil peeler: sharp peel bar + pinch rollers on an N20 gear motor + take-up spool
    box(c, 'Peel bar (strips foil back over a sharp edge)', 0, oy - 37.5, PATH + 3.0, 34, 2, 1.2, COL['steel'])
    cyl(c, 'Pinch roller (lower)', (-16, oy - 34.5, PATH + 8), (16, oy - 34.5, PATH + 8), 3.5, COL['rubber'])
    cyl(c, 'Pinch roller (upper)', (-16, oy - 34.5, PATH + 15.2), (16, oy - 34.5, PATH + 15.2), 3.5, COL['rubber'])
    box(c, 'N20 gear motor (foil peel)', 30, oy - 34.5, PATH + 6.6, 24, 10, 12, COL['motor'])
    cyl(c, 'Used-foil take-up spool', (-14, oy - 34.5, PATH + 32), (14, oy - 34.5, PATH + 32), 4, COL['silver'])

    # light-box lid with camera (opaque black in the product; shown clear here)
    lid = box(c, 'Light-box lid (opaque black in product; shown clear)', 0, oy, ZD, 70, 58, 120, 'clear', rv=4)
    cut_rect(c, lid, 0, oy, ZD - 1, 66, 54, 117)
    cut_rect(c, lid, 0, oy, ZD - 1, 74, 30, 7)                                          # strap slots
    box(c, 'Raspberry Pi Camera Module 3', 0, oy, ZD + 104.5, 25, 24, 11.5, COL['pcb'])
    cyl(c, 'Camera lens', (0, oy, ZD + 104.5), (0, oy, ZD + 101), 4, COL['black'])
    multi_box(c, 'LED (high-CRI, 5000 K)',
              [(20 * cx, oy + 20 * cy, 3, 3, COL['led']) for (cx, cy) in
               ((1, 0), (-1, 0), (0, 1), (0, -1), (0.7, 0.7), (-0.7, 0.7), (0.7, -0.7), (-0.7, -0.7))],
              ZD + 114.5, 1.5)
    dif = box(c, 'Diffuser ring', 0, oy, ZD + 95, 60, 50, 1, 'clear')
    cut_holes(c, dif, [(0, oy)], 7, ZD + 94, 3)
    box(c, 'Lid interlock switch (motors off when open)', 41, oy + 20.0, ZD, 12, 6, 6, COL['black'])

    # electronics and bin in the base
    box(c, 'Raspberry Pi Zero 2 W', -40, oy - 110.0, 3, 65, 30, 5, COL['pcb'])
    box(c, 'Stepper driver A4988', 15, oy - 110.0, 3, 20, 15, 10, COL['pcb'])
    box(c, 'Motor driver DRV8833 (N20)', 40, oy - 110.0, 3, 18, 16, 5, COL['pcb'])
    box(c, 'USB-C 5 V 3 A power inlet', 0, oy + YMIN + 6, 15, 14, 8, 8, COL['black'])
    bin_ = box(c, 'Sealed used-card bin (kept as dose evidence)', 0, oy + 50, 6, 50, 50, 66, COL['motor'], rv=3)
    cut_rect(c, bin_, 0, oy + 50, 9, 46, 46, 70)
    box(c, 'Status OLED 0.96 in', 52, oy + 45.0, ZD, 27, 27, 3, COL['black'])
    cyl(c, 'Start button', (52, oy + 66, ZD), (52, oy + 66, ZD + 4), 6, COL['orange'])

    # band in the nest (worker takes the band off and lays it flat; the lid must close to run)
    Z0 = ZD
    build_band(root, oy, ' (in dock)')
    build_cradle(root, oy, ' (in dock)')
    build_frame(root, oy, 0, ' (in dock)', shutter_open=False)
    build_card(root, oy, 0, ' (in dock)', False)
    Z0 = 0.0


def run(context):
    global app, design, BASE, CLEAR, Z0
    ui = None
    try:
        app = adsk.core.Application.get()
        ui = app.userInterface
        design = adsk.fusion.Design.cast(app.activeProduct)
        if not design:
            ui.messageBox('Open a Hybrid Design first, then run this script.')
            return
        root = design.rootComponent
        for i in range(root.occurrences.count - 1, -1, -1):
            root.occurrences.item(i).deleteMe()
        del FAILED[:]
        Z0 = 0.0
        BASE = find_base()
        CLEAR = find_clear()

        build_band(root)
        build_cradle(root, 0, '')
        build_frame(root, 0, 0, '', shutter_open=True)
        build_card(root, 0, 0, '', False)
        if BUILD_CLOSED_VIEW:
            build_cradle(root, -85, ' (shutter closed)')
            build_frame(root, -85, 0, ' (shutter closed)', shutter_open=False)
            build_card(root, -85, 0, ' (shutter closed)', False)
        if BUILD_EXPLODED_VIEW:
            build_cradle(root, 85, ' (exploded)')
            build_frame(root, 85, GAP, ' (exploded)', shutter_open=True)
            build_card(root, 85, GAP, ' (exploded)', True)
        if BUILD_DOCK:
            build_dock(root, DOCK_Y)

        app.activeViewport.fit()
        msg = 'Wristband v6 prototype created (frame + one-time card + dock).'
        if not BASE:
            msg += '\nColours skipped (appearance library not found).'
        if not CLEAR:
            msg += '\nClear parts shown as pale blue (no clear appearance found).'
        if FAILED:
            msg += '\nSome edge roundings skipped: ' + ', '.join(sorted(set(FAILED)))
        ui.messageBox(msg)
    except:
        Z0 = 0.0
        if ui:
            ui.messageBox('Failed:\n{}'.format(traceback.format_exc()))
