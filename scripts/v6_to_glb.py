"""Turn the v6 Fusion 360 script (docs/cad/v6_wristband_dock.py) into web 3D models (.glb).

It runs the SAME build functions as the Fusion script, so the web model has the same parts,
sizes and colours. Only Fusion's edge fillets on top/bottom faces are skipped; vertical
corner roundings are kept.

Run:  python3 scripts/v6_to_glb.py        (needs: pip install trimesh shapely manifold3d)
Out:  public/project/models/band.glb, exploded.glb, dock.glb
"""
import importlib.util
import os
import sys
import types
from unittest import mock

import numpy as np
import trimesh
from shapely.geometry import Point, box as sbox

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'docs', 'cad', 'v6_wristband_dock.py')
OUT = os.path.join(ROOT, 'public', 'project', 'models')

# --- load the Fusion script with a stand-in "adsk" module (only constants are read at import) ---
adsk = types.ModuleType('adsk')
adsk.core, adsk.fusion = mock.MagicMock(), mock.MagicMock()
sys.modules.update({'adsk': adsk, 'adsk.core': adsk.core, 'adsk.fusion': adsk.fusion})
spec = importlib.util.spec_from_file_location('v6', SRC)
v6 = importlib.util.module_from_spec(spec)
spec.loader.exec_module(v6)

CLEAR = (205, 222, 235)
parts = []          # [Body] in the current scene


class Body:
    def __init__(self, mesh, rgb, name):
        self.mesh, self.rgb, self.name = mesh, rgb, name


class Comp:
    def __init__(self, name):
        self.name = name


def slab(cx, cy, z, w, l, h, rv=0.0):
    if rv and rv * 2 < min(w, l):
        poly = sbox(cx - w / 2 + rv, cy - l / 2 + rv, cx + w / 2 - rv, cy + l / 2 - rv).buffer(rv, 6)
    else:
        poly = sbox(cx - w / 2, cy - l / 2, cx + w / 2, cy + l / 2)
    m = trimesh.creation.extrude_polygon(poly, h)
    m.apply_translation((0, 0, z + v6.Z0))
    return m


def disc(x, y, r, z, h):
    m = trimesh.creation.extrude_polygon(Point(x, y).buffer(r, 8), h)
    m.apply_translation((0, 0, z + v6.Z0))
    return m


def add(comp, name, mesh, rgb):
    b = Body(mesh, rgb, '%s / %s' % (comp.name, name))
    parts.append(b)
    return b


def cut(target, tool):
    try:
        r = target.mesh.difference(tool, engine='manifold')
        if len(r.faces):
            target.mesh = r
    except Exception as e:  # keep the uncut body rather than fail the whole model
        print('cut skipped on', target.name, e)


# --- replace the Fusion helpers with mesh builders (same arguments as in the script) ---
def box(comp, name, cx, cy, z, w, l, h, rgb, rv=0, rtop=0, rbot=0, tip=None):
    return add(comp, name, slab(cx, cy, z, w, l, h, rv), CLEAR if rgb == 'clear' else rgb)


def cut_rect(comp, target, cx, cy, z, w, l, h):
    cut(target, slab(cx, cy, z, w, l, h))


def cut_holes(comp, target, centres, r, z, h):
    tool = trimesh.util.concatenate([disc(x, y, r, z, h) for (x, y) in centres])
    cut(target, tool)


def multi_box(comp, name, specs, z, h):
    for s in specs:
        add(comp, name, slab(s[0], s[1], z, s[2], s[3], h), s[4])


def multi_disc(comp, name, centres, r, z, h, rgb):
    for (x, y) in centres:
        add(comp, name, disc(x, y, r, z, h), rgb)


def cyl(comp, name, p1, p2, r, rgb):
    a = np.array([p1[0], p1[1], p1[2] + v6.Z0])
    b = np.array([p2[0], p2[1], p2[2] + v6.Z0])
    m = trimesh.creation.cylinder(radius=r, segment=[a, b], sections=24)
    return add(comp, name, m, CLEAR if rgb == 'clear' else rgb)


v6.box, v6.cut_rect, v6.cut_holes = box, cut_rect, cut_holes
v6.multi_box, v6.multi_disc, v6.cyl = multi_box, multi_disc, cyl
v6.new_comp = lambda root, name: Comp(name)


def export(fname, centre_y=0.0):
    scene = trimesh.Scene()
    mats = {}
    for i, b in enumerate(parts):
        rgb = tuple(int(c) for c in b.rgb)
        clear = rgb == CLEAR
        if rgb not in mats:
            mats[rgb] = trimesh.visual.material.PBRMaterial(
                # glTF colours are linear; Fusion RGB values are sRGB
                baseColorFactor=[(c / 255) ** 2.2 for c in rgb] + [0.28 if clear else 1.0],
                metallicFactor=0.6 if rgb in (v6.COL['steel'], v6.COL['silver']) else 0.0,
                roughnessFactor=0.15 if clear else 0.55,
                alphaMode='BLEND' if clear else 'OPAQUE', doubleSided=clear)
        m = b.mesh.copy()
        m.apply_translation((0, -centre_y, 0))
        # Fusion: Z up, mm  ->  glTF: Y up, metres (so phone AR shows true size)
        m.apply_transform(trimesh.transformations.rotation_matrix(-np.pi / 2, (1, 0, 0)))
        m.apply_scale(0.001)
        m.visual = trimesh.visual.TextureVisuals(material=mats[rgb])
        scene.add_geometry(m, node_name='%03d %s' % (i, b.name))
    os.makedirs(OUT, exist_ok=True)
    path = os.path.join(OUT, fname)
    scene.export(path)
    print('%-13s %4d parts  %6.1f KB' % (fname, len(parts), os.path.getsize(path) / 1024))
    parts.clear()


# Worn band, shutter open (the main view)
v6.build_band(None)
v6.build_cradle(None, 0, '')
v6.build_frame(None, 0, 0, '', shutter_open=True)
v6.build_card(None, 0, 0, '', False)
export('band.glb')

# Exploded frame + card layers + peel foil
v6.build_cradle(None, 85, '')
v6.build_frame(None, 85, v6.GAP, '', shutter_open=True)
v6.build_card(None, 85, v6.GAP, '', True)
export('exploded.glb', centre_y=85)

# Motorised dock with the band in the nest
v6.build_dock(None, v6.DOCK_Y)
export('dock.glb', centre_y=v6.DOCK_Y - 67.5)
