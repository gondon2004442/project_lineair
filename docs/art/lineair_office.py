# Project Lineair - office sector kit + bullpen room
# Same camera and tile grid as lineair_room.py, warm palette instead of bare concrete.
# Run: blender -b --factory-startup --python lineair_office.py -- [kit|room|both] [samples] [res]

import bpy, sys, math, os

ARGS = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
MODE = ARGS[0] if len(ARGS) > 0 else "both"
SAMPLES = int(ARGS[1]) if len(ARGS) > 1 else 72
RES = int(ARGS[2]) if len(ARGS) > 2 else 1200

OUT = "/home/claude/out"
os.makedirs(OUT, exist_ok=True)

TILE = 2.0
WALL_H = 3.4
CAM_ELEV = 55.0
CHAR_BLEND = "/home/claude/out/lineair_char01.blend"
SKIP = {"GROUND", "KEY", "FILL", "RIM", "Camera"}

def srgb(h):
    h = h.lstrip("#"); o = []
    for i in (0, 2, 4):
        c = int(h[i:i+2], 16) / 255.0
        o.append(c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4)
    return (o[0], o[1], o[2], 1.0)

# concrete palette stays; the office adds warm wood, carpet and brass
PAL = {
    "wall":     srgb("#3A3E44"),
    "plinth":   srgb("#2A2E33"),
    "column":   srgb("#50555B"),
    "metal":    srgb("#6B6F75"),
    "dark":     srgb("#1A1D21"),
    "yellow":   srgb("#E8B923"),
    "red":      srgb("#C8102E"),
    "paper":    srgb("#C9CCC8"),
    "wood":     srgb("#6B4F32"),
    "wood_dk":  srgb("#40301E"),
    "brass":    srgb("#8A7038"),
    "carpet":   srgb("#464539"),
    "carpet_dk":srgb("#32311F"),
    "fabric":   srgb("#6B665A"),
    "leaf":     srgb("#2E4A33"),
    "binder":   srgb("#7A4B3A"),
}
MATS = {}

def mat(name, rgba, rough=0.82, emit=0.0, alpha=1.0):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    b = m.node_tree.nodes["Principled BSDF"]
    b.inputs["Base Color"].default_value = rgba
    b.inputs["Roughness"].default_value = rough
    if alpha < 1.0:
        b.inputs["Alpha"].default_value = alpha
        m.blend_method = "BLEND"
    if emit > 0:
        b.inputs["Emission Color"].default_value = rgba
        b.inputs["Emission Strength"].default_value = emit
    for k in ("Specular", "Specular IOR Level"):
        if k in b.inputs:
            b.inputs[k].default_value = 0.12
            break
    return m

def rebuild_mats():
    for k, v in PAL.items():
        MATS[k] = mat(k, v)
    MATS["brass"] = mat("brass2", PAL["brass"], 0.35)
    MATS["glass"] = mat("glass", srgb("#A9BCC0"), 0.08, 0.0, 0.16)
    MATS["lamp"] = mat("lamp", srgb("#1F5E3A"), 0.5, 3.0)
    MATS["red_lit"] = mat("red_lit", PAL["red"], 0.6, 6.0)

def box(name, loc, half, key, rot=(0, 0, 0), bevel=0.012):
    bpy.ops.mesh.primitive_cube_add(size=2, location=loc)
    o = bpy.context.object
    o.name = name; o.scale = half; o.rotation_euler = rot
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    if bevel:
        b = o.modifiers.new("bev", "BEVEL")
        b.width = bevel; b.segments = 2
        b.limit_method = "ANGLE"; b.angle_limit = math.radians(40)
    o.data.materials.append(MATS[key])
    bpy.ops.object.shade_flat()
    return o

def cyl(name, loc, r, h, key, rot=(0, 0, 0), verts=12):
    bpy.ops.mesh.primitive_cylinder_add(radius=r, depth=h, vertices=verts, location=loc, rotation=rot)
    o = bpy.context.object
    o.name = name
    o.data.materials.append(MATS[key])
    bpy.ops.object.shade_flat()
    return o

# ------------------------------------------------------------------ kit
def p_carpet(o=(0, 0, 0)):
    """Carpet tile. Warm-dark, low contrast - the opposite of the concrete slab."""
    box("carpet", (o[0], o[1], o[2] - 0.05), (TILE/2 - 0.015, TILE/2 - 0.015, 0.05), "carpet", bevel=0)
    box("seam", (o[0], o[1], o[2] - 0.11), (TILE/2, TILE/2, 0.06), "carpet_dk", bevel=0)

def p_panel_wall(o=(0, 0, 0), length=TILE, axis="x"):
    """Walnut wainscot to 1.6 m, bare concrete above, brass rail between."""
    hx, hy = (length/2, 0.22) if axis == "x" else (0.22, length/2)
    box("w.shaft", (o[0], o[1], o[2] + WALL_H/2), (hx, hy, WALL_H/2), "wall")
    box("w.wood", (o[0], o[1], o[2] + 0.80), (hx + 0.04, hy + 0.04, 0.80), "wood")
    box("w.rail", (o[0], o[1], o[2] + 1.63), (hx + 0.06, hy + 0.06, 0.035), "brass", bevel=0.006)
    box("w.base", (o[0], o[1], o[2] + 0.09), (hx + 0.06, hy + 0.06, 0.09), "wood_dk")
    n = max(1, int(length / 0.55))
    for i in range(n):
        t = -length/2 + length*(i + 0.5)/n
        px = o[0] + (t if axis == "x" else 0)
        py = o[1] + (t if axis == "y" else 0)
        gx, gy = (0.012, hy + 0.05) if axis == "x" else (hx + 0.05, 0.012)
        box("w.groove%d" % i, (px, py, o[2] + 0.85), (gx, gy, 0.72), "wood_dk", bevel=0)

def p_cubicle(o=(0, 0, 0), rot=0.0):
    """Fabric partition + desk inside. Waist-high cover, blocks sight, not bullets."""
    box("cub.panelA", (o[0], o[1] + 0.95, o[2] + 0.70), (1.05, 0.05, 0.70), "fabric", rot=(0, 0, rot))
    box("cub.capA", (o[0], o[1] + 0.95, o[2] + 1.41), (1.07, 0.07, 0.035), "metal", rot=(0, 0, rot), bevel=0.005)
    box("cub.panelB", (o[0] - 1.00, o[1] + 0.10, o[2] + 0.70), (0.05, 1.10, 0.70), "fabric", rot=(0, 0, rot))
    box("cub.capB", (o[0] - 1.00, o[1] + 0.10, o[2] + 1.41), (0.07, 1.12, 0.035), "metal", rot=(0, 0, rot), bevel=0.005)
    box("cub.top", (o[0], o[1] + 0.45, o[2] + 0.73), (0.90, 0.35, 0.03), "wood", rot=(0, 0, rot))
    box("cub.leg", (o[0], o[1] + 0.45, o[2] + 0.35), (0.84, 0.30, 0.35), "wood_dk", rot=(0, 0, rot))
    box("cub.type", (o[0] - 0.30, o[1] + 0.45, o[2] + 0.85), (0.20, 0.17, 0.09), "dark", rot=(0, 0, rot))
    box("cub.paper", (o[0] + 0.32, o[1] + 0.42, o[2] + 0.775), (0.15, 0.20, 0.015), "paper", rot=(0, 0, rot), bevel=0.003)
    box("cub.lamp", (o[0] + 0.62, o[1] + 0.62, o[2] + 0.94), (0.14, 0.09, 0.05), "lamp", rot=(0, 0, rot), bevel=0.01)
    cyl("cub.lampstem", (o[0] + 0.62, o[1] + 0.62, o[2] + 0.83), 0.015, 0.20, "brass")

def p_chair(o=(0, 0, 0), rot=0.0):
    box("ch.seat", (o[0], o[1], o[2] + 0.44), (0.24, 0.24, 0.05), "fabric", rot=(0, 0, rot))
    box("ch.back", (o[0], o[1] + 0.22, o[2] + 0.70), (0.24, 0.05, 0.24), "fabric", rot=(0, 0, rot))
    cyl("ch.post", (o[0], o[1], o[2] + 0.22), 0.04, 0.44, "metal")
    cyl("ch.base", (o[0], o[1], o[2] + 0.04), 0.28, 0.06, "dark", verts=10)

def p_glass(o=(0, 0, 0), length=TILE, axis="x"):
    """Manager's office partition. You can see the fight through it; it shatters."""
    hx, hy = (length/2, 0.04) if axis == "x" else (0.04, length/2)
    box("g.pane", (o[0], o[1], o[2] + 1.55), (hx, hy, 0.95), "glass", bevel=0)
    box("g.sill", (o[0], o[1], o[2] + 0.30), (hx + 0.05, hy + 0.06, 0.30), "wood")
    box("g.head", (o[0], o[1], o[2] + 2.55), (hx + 0.05, hy + 0.06, 0.06), "wood_dk")
    box("g.mull", (o[0], o[1], o[2] + 1.55), (0.04, hy + 0.05, 0.95), "wood_dk", bevel=0.005)

def p_shelf(o=(0, 0, 0), rot=0.0):
    box("sh.body", (o[0], o[1], o[2] + 0.95), (0.60, 0.22, 0.95), "wood_dk", rot=(0, 0, rot))
    for i, z in enumerate((0.42, 0.92, 1.42)):
        box("sh.shelf%d" % i, (o[0], o[1], o[2] + z), (0.56, 0.24, 0.02), "wood", rot=(0, 0, rot), bevel=0.004)
        for j in range(5):
            bx = o[0] - 0.44 + j * 0.22
            box("sh.bind%d_%d" % (i, j), (bx, o[1], o[2] + z + 0.17),
                (0.08, 0.18, 0.15), "binder" if (i + j) % 3 else "paper", rot=(0, 0, rot), bevel=0.004)

def p_props(o=(0, 0, 0)):
    """Water cooler + planter: the two things every office corridor has."""
    box("wc.body", (o[0] - 0.45, o[1], o[2] + 0.45), (0.20, 0.20, 0.45), "metal")
    cyl("wc.bottle", (o[0] - 0.45, o[1], o[2] + 1.15), 0.17, 0.50, "glass")
    box("pl.pot", (o[0] + 0.50, o[1], o[2] + 0.22), (0.24, 0.24, 0.22), "wood_dk")
    for k, (dx, dy, dz, s) in enumerate(((0, 0, 0.62, 0.22), (0.14, 0.08, 0.86, 0.17), (-0.12, -0.06, 0.80, 0.15))):
        box("pl.leaf%d" % k, (o[0] + 0.50 + dx, o[1] + dy, o[2] + dz), (s, s, 0.06), "leaf",
            rot=(0, 0, math.radians(20 * k)), bevel=0.01)

def p_tube(o=(0, 0, 0)):
    """Pneumatic tube station - how the building moves paperwork between levels."""
    cyl("tb.pipe", (o[0], o[1], o[2] + 1.90), 0.11, 2.60, "brass")
    box("tb.hopper", (o[0], o[1] - 0.14, o[2] + 1.05), (0.26, 0.20, 0.30), "brass")
    box("tb.mouth", (o[0], o[1] - 0.30, o[2] + 1.05), (0.17, 0.06, 0.17), "dark", bevel=0.005)
    box("tb.plate", (o[0], o[1] - 0.22, o[2] + 1.48), (0.20, 0.04, 0.09), "paper", bevel=0.004)

def p_door(o=(0, 0, 0)):
    box("d.jambL", (o[0] - 1.05, o[1], o[2] + WALL_H/2), (0.35, 0.26, WALL_H/2), "wall")
    box("d.jambR", (o[0] + 1.05, o[1], o[2] + WALL_H/2), (0.35, 0.26, WALL_H/2), "wall")
    box("d.lintel", (o[0], o[1], o[2] + WALL_H - 0.45), (1.40, 0.26, 0.45), "wall")
    box("d.void", (o[0], o[1], o[2] + 1.35), (0.70, 0.20, 1.35), "dark")
    box("d.frame", (o[0], o[1] - 0.24, o[2] + 1.40), (0.82, 0.05, 1.40), "wood")
    box("d.lamp", (o[0], o[1] - 0.26, o[2] + 2.86), (0.22, 0.06, 0.09), "red_lit", bevel=0.004)
    for m, dy in enumerate((0.62, 0.86)):
        box("d.mark%d" % m, (o[0], o[1] - dy, o[2] + 0.008), (0.78, 0.05, 0.010), "yellow", bevel=0)

KIT = [
    ("carpet",  p_carpet,     2.9),
    ("panel",   p_panel_wall, 4.6),
    ("cubicle", p_cubicle,    3.6),
    ("chair",   p_chair,      2.0),
    ("glass",   p_glass,      4.6),
    ("shelf",   p_shelf,      3.0),
    ("props",   p_props,      3.0),
    ("tube",    p_tube,       4.0),
]

# ------------------------------------------------------------------ scene
def base_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    rebuild_mats()
    sc = bpy.context.scene
    sc.render.engine = "CYCLES"
    sc.cycles.device = "CPU"
    sc.cycles.samples = SAMPLES
    sc.cycles.use_denoising = False
    sc.cycles.transparent_max_bounces = 8
    sc.render.image_settings.file_format = "PNG"
    sc.render.image_settings.color_mode = "RGBA"
    sc.view_settings.view_transform = "Standard"
    w = bpy.data.worlds.new("W"); sc.world = w
    w.use_nodes = True
    w.node_tree.nodes["Background"].inputs[0].default_value = (0.030, 0.030, 0.033, 1)
    w.node_tree.nodes["Background"].inputs[1].default_value = 0.8
    return sc

def sun(name, energy, rx, rz, angle=5.0, shadow=True):
    bpy.ops.object.light_add(type="SUN", location=(0, 0, 8))
    o = bpy.context.object
    o.name = name; o.data.energy = energy
    o.data.angle = math.radians(angle)
    o.rotation_euler = (math.radians(rx), 0, math.radians(rz))
    try: o.data.cycles.cast_shadow = shadow
    except Exception: pass
    return o

def fluoro(loc, sx=1.5, sy=0.35, energy=90):
    """Ceiling strip light - the office reads by pools, not by one window."""
    bpy.ops.object.light_add(type="AREA", location=(loc[0], loc[1], 3.05))
    o = bpy.context.object
    o.data.shape = "RECTANGLE"
    o.data.size = sx; o.data.size_y = sy
    o.data.energy = energy
    o.data.color = (1.0, 0.97, 0.88)
    o.rotation_euler = (0, 0, 0)
    return o

def camera(ortho, target, dist=60.0):
    el = math.radians(CAM_ELEV); az = math.radians(-90)
    loc = (target[0] + dist*math.cos(el)*math.cos(az),
           target[1] + dist*math.cos(el)*math.sin(az),
           target[2] + dist*math.sin(el))
    bpy.ops.object.camera_add(location=loc)
    cam = bpy.context.object
    cam.data.type = "ORTHO"; cam.data.ortho_scale = ortho
    cam.rotation_euler = (math.radians(90 - CAM_ELEV), 0, 0)
    bpy.context.scene.camera = cam
    return cam

def render(path, rx, ry):
    sc = bpy.context.scene
    sc.render.resolution_x = rx; sc.render.resolution_y = ry
    sc.render.resolution_percentage = 100
    sc.render.filepath = path
    bpy.ops.render.render(write_still=True)

def place_character(loc, yaw_deg):
    if not os.path.exists(CHAR_BLEND):
        return None
    with bpy.data.libraries.load(CHAR_BLEND, link=False) as (src, dst):
        dst.objects = [n for n in src.objects if n not in SKIP]
    coll = bpy.context.collection
    brought = []
    for ob in dst.objects:
        if ob is None or ob.type not in ("MESH", "EMPTY"):
            continue
        coll.objects.link(ob); brought.append(ob)
    pivot = next((o for o in brought if o.name.startswith("PIVOT")), None)
    if pivot:
        pivot.location = loc
        pivot.rotation_euler = (0, 0, math.radians(yaw_deg))
    return pivot

# ------------------------------------------------------------------ outputs
def do_kit():
    for key, fn, ortho in KIT:
        base_scene()
        bpy.context.scene.render.film_transparent = True
        fn((0, 0, 0))
        bpy.ops.mesh.primitive_plane_add(size=14, location=(0, 0, 0))
        bpy.context.object.is_shadow_catcher = True
        sun("KEY", 2.7, 24, -38, 4.0, True)
        sun("FILL", 1.0, 58, 118, 12.0, False)
        sun("RIM", 1.2, -52, 8, 8.0, False)
        camera(ortho, (0, 0, ortho * 0.22), dist=30)
        render(os.path.join(OUT, "office_%s.png" % key), 320, 320)

def do_room():
    base_scene()
    bpy.context.scene.render.film_transparent = False

    W, H = 8, 6                      # 16 x 12 m bullpen
    x0, y0 = -(W*TILE)/2, -(H*TILE)/2
    for i in range(W):
        for j in range(H):
            p_carpet((x0 + TILE*i + TILE/2, y0 + TILE*j + TILE/2, 0))

    for i in range(W):
        cx = x0 + TILE*i + TILE/2
        if i not in (3, 4):
            p_panel_wall((cx, y0 + H*TILE + 0.22, 0), TILE, "x")
    p_door((x0 + TILE*3 + TILE, y0 + H*TILE + 0.22, 0))
    for j in range(H):
        cy = y0 + TILE*j + TILE/2
        p_panel_wall((x0 - 0.22, cy, 0), TILE, "y")
        p_panel_wall((x0 + W*TILE + 0.22, cy, 0), TILE, "y")
    for i in range(W):
        cx = x0 + TILE*i + TILE/2
        box("nearwall", (cx, y0 - 0.22, 0.30), (TILE/2, 0.22, 0.30), "wood_dk")

    # two columns survive from the concrete shell - the office was built around them
    for cx in (x0 + 5.0, x0 + 11.0):
        box("col", (cx, y0 + 6.0, WALL_H/2), (0.42, 0.42, WALL_H/2), "column")
        box("col.base", (cx, y0 + 6.0, 0.18), (0.52, 0.52, 0.18), "plinth")

    # cubicle farm: two clusters, back to back
    for (cx, cy, rz) in ((3.0, 3.2, 0), (6.2, 3.2, 0), (3.0, 8.6, 180), (6.2, 8.6, 180)):
        p_cubicle((x0 + cx, y0 + cy, 0), math.radians(rz))
        p_chair((x0 + cx + 0.05, y0 + cy - 0.35 + (0.7 if rz else 0), 0), math.radians(rz + 20))
    for (cx, cy, rz) in ((12.4, 3.2, 0), (9.4, 3.2, 0)):
        p_cubicle((x0 + cx, y0 + cy, 0), math.radians(rz))
        p_chair((x0 + cx + 0.05, y0 + cy - 0.35, 0), math.radians(rz - 15))

    # manager's glass office: a real 4x4 m box in the far corner
    gx, gy = x0 + W*TILE - 4.0, y0 + H*TILE - 4.0
    for j in range(2):
        p_glass((gx + 1.0 + j*2.0, gy, 0), TILE, "x")
    p_glass((gx, gy + 1.0, 0), TILE, "y")
    p_glass((gx, gy + 3.0, 0), TILE, "y")
    box("mg.desk", (gx + 2.3, gy + 2.4, 0.74), (0.85, 0.42, 0.04), "wood")
    box("mg.deskmod", (gx + 2.3, gy + 2.4, 0.36), (0.78, 0.36, 0.36), "wood_dk")
    box("mg.paper", (gx + 2.7, gy + 2.3, 0.79), (0.15, 0.19, 0.014), "paper", bevel=0.003)
    box("mg.lamp", (gx + 1.7, gy + 2.6, 0.92), (0.14, 0.09, 0.05), "lamp", bevel=0.01)
    p_chair((gx + 2.3, gy + 3.1, 0), math.radians(185))
    p_shelf((gx + 2.2, gy + 3.62, 0), math.radians(180))

    p_props((x0 + 1.4, y0 + 10.4, 0))
    p_tube((x0 + 0.30, y0 + 6.4, 0))
    p_shelf((x0 + 6.6, y0 + 11.3, 0), math.radians(180))
    p_props((x0 + 14.6, y0 + 1.4, 0))

    # paperwork on the floor: something already happened in here
    import random
    random.seed(7)
    for k in range(26):
        px = x0 + random.uniform(1.2, W*TILE - 1.2)
        py = y0 + random.uniform(1.0, H*TILE - 1.4)
        box("sheet%d" % k, (px, py, 0.012), (0.11, 0.15, 0.004), "paper",
            rot=(0, 0, random.uniform(0, 3.14)), bevel=0)

    sun("KEY", 1.2, 30, -52, 6.0, True)
    sun("FILL", 0.95, 60, 120, 14.0, False)
    for i in range(3):
        for j in range(3):
            fluoro((x0 + 3.2 + i*5.0, y0 + 2.4 + j*4.0), 2.4, 0.32, 150)

    place_character((x0 + 9.2, y0 + 6.0, 0), 168)
    camera(20.4, (0, 0.6, 1.0), dist=60)
    render(os.path.join(OUT, "office_bullpen.png"), RES, int(RES * 0.66))

if MODE in ("kit", "both"):
    do_kit()
if MODE in ("room", "both"):
    do_room()
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUT, "lineair_office.blend"))
print("DONE")
