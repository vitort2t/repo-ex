"""Generates photo-style SVG food renders for the 'Sabor da Casa' demo mockups."""
import random, math, os, sys

OUT = sys.argv[1]
os.makedirs(OUT, exist_ok=True)

DEFS = """
<defs>
  <filter id="crumb" x="-5%" y="-5%" width="110%" height="110%">
    <feTurbulence type="fractalNoise" baseFrequency="0.32" numOctaves="4" seed="7" result="n"/>
    <feDiffuseLighting in="n" surfaceScale="2.1" lighting-color="#ffffff" diffuseConstant="1.15" result="l">
      <feDistantLight azimuth="225" elevation="48"/>
    </feDiffuseLighting>
    <feComposite in="l" in2="SourceGraphic" operator="arithmetic" k1="1.25" k2="0" k3="0" k4="0" result="t"/>
    <feComposite in="t" in2="SourceAlpha" operator="in"/>
  </filter>
  <filter id="fine" x="-5%" y="-5%" width="110%" height="110%">
    <feTurbulence type="fractalNoise" baseFrequency="0.7" numOctaves="3" seed="3" result="n"/>
    <feDiffuseLighting in="n" surfaceScale="0.9" lighting-color="#ffffff" diffuseConstant="1.1" result="l">
      <feDistantLight azimuth="225" elevation="60"/>
    </feDiffuseLighting>
    <feComposite in="l" in2="SourceGraphic" operator="arithmetic" k1="1.12" k2="0" k3="0" k4="0" result="t"/>
    <feComposite in="t" in2="SourceAlpha" operator="in"/>
  </filter>
  <filter id="sponge" x="-5%" y="-5%" width="110%" height="110%">
    <feTurbulence type="turbulence" baseFrequency="0.6" numOctaves="2" seed="11" result="n"/>
    <feDiffuseLighting in="n" surfaceScale="1.6" lighting-color="#ffffff" diffuseConstant="1.05" result="l">
      <feDistantLight azimuth="250" elevation="55"/>
    </feDiffuseLighting>
    <feComposite in="l" in2="SourceGraphic" operator="arithmetic" k1="1.2" k2="0" k3="0" k4="0" result="t"/>
    <feComposite in="t" in2="SourceAlpha" operator="in"/>
  </filter>
  <filter id="soft" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="6"/></filter>
  <filter id="soft2" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="2.2"/></filter>
  <filter id="blur1" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="0.8"/></filter>
  <filter id="linen" x="0" y="0" width="100%" height="100%">
    <feTurbulence type="fractalNoise" baseFrequency="0.012 0.9" numOctaves="2" seed="2" result="n"/>
    <feColorMatrix in="n" type="matrix" values="0 0 0 0 0.45  0 0 0 0 0.36  0 0 0 0 0.28  0 0 0 0.10 0"/>
  </filter>
  <filter id="wood" x="0" y="0" width="100%" height="100%">
    <feTurbulence type="fractalNoise" baseFrequency="0.006 0.12" numOctaves="4" seed="9" result="n"/>
    <feColorMatrix in="n" type="matrix" values="0 0 0 0 0.30  0 0 0 0 0.18  0 0 0 0 0.09  0 0 0 0.55 -0.05"/>
  </filter>
  <radialGradient id="vol" cx="35%" cy="30%" r="75%">
    <stop offset="0" stop-color="#fff" stop-opacity=".42"/>
    <stop offset=".35" stop-color="#fff" stop-opacity=".08"/>
    <stop offset=".75" stop-color="#000" stop-opacity=".18"/>
    <stop offset="1" stop-color="#000" stop-opacity=".45"/>
  </radialGradient>
  <radialGradient id="volsoft" cx="38%" cy="28%" r="80%">
    <stop offset="0" stop-color="#fff" stop-opacity=".30"/>
    <stop offset=".5" stop-color="#fff" stop-opacity="0"/>
    <stop offset="1" stop-color="#000" stop-opacity=".30"/>
  </radialGradient>
  <radialGradient id="plate" cx="50%" cy="45%" r="55%">
    <stop offset="0" stop-color="#ffffff"/>
    <stop offset=".72" stop-color="#fbfaf8"/>
    <stop offset=".86" stop-color="#ece8e3"/>
    <stop offset=".93" stop-color="#ffffff"/>
    <stop offset="1" stop-color="#dcd6cf"/>
  </radialGradient>
  <linearGradient id="bgWarm" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#f7f2ec"/><stop offset="1" stop-color="#eae1d6"/>
  </linearGradient>
  <linearGradient id="bgCream" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="#fbf8f4"/><stop offset="1" stop-color="#efe7dc"/>
  </linearGradient>
  <linearGradient id="woodG" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#b98a5e"/><stop offset="1" stop-color="#8e6340"/>
  </linearGradient>
  <linearGradient id="gloss" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#fff" stop-opacity=".55"/><stop offset="1" stop-color="#fff" stop-opacity="0"/>
  </linearGradient>
  <linearGradient id="glass" x1="0" y1="0" x2="1" y2="0">
    <stop offset="0" stop-color="#fff" stop-opacity=".55"/><stop offset=".12" stop-color="#fff" stop-opacity=".08"/>
    <stop offset=".8" stop-color="#fff" stop-opacity=".02"/><stop offset=".92" stop-color="#fff" stop-opacity=".4"/>
    <stop offset="1" stop-color="#fff" stop-opacity=".1"/>
  </linearGradient>
</defs>
"""

uid = [0]
def nid(p):
    uid[0] += 1
    return f"{p}{uid[0]}"

def shadow(cx, cy, rx, ry, op=.28):
    return f'<ellipse cx="{cx}" cy="{cy}" rx="{rx}" ry="{ry}" fill="#3a2414" opacity="{op}" filter="url(#soft)"/>'

def plate(cx, cy, r):
    return (shadow(cx + 6, cy + 10, r * 1.02, r * .5, .22) +
            f'<ellipse cx="{cx}" cy="{cy}" rx="{r}" ry="{r*.56}" fill="url(#plate)"/>'
            f'<ellipse cx="{cx}" cy="{cy+2}" rx="{r*.7}" ry="{r*.38}" fill="none" stroke="#e6e0d8" stroke-width="1.2" opacity=".8"/>')

def board(cx, cy, w, h):
    rid = nid("b")
    return (shadow(cx + 8, cy + h * .55, w * .55, h * .18, .3) +
            f'<clipPath id="{rid}"><rect x="{cx-w/2}" y="{cy-h/2}" width="{w}" height="{h}" rx="{h*.12}"/></clipPath>'
            f'<g clip-path="url(#{rid})"><rect x="{cx-w/2}" y="{cy-h/2}" width="{w}" height="{h}" fill="url(#woodG)"/>'
            f'<rect x="{cx-w/2}" y="{cy-h/2}" width="{w}" height="{h}" filter="url(#wood)"/></g>'
            f'<rect x="{cx-w/2}" y="{cy+h/2-6}" width="{w}" height="6" rx="3" fill="#6e4a2e" opacity=".55"/>')

# ---------- products ----------
def brigadeiro(cx, cy, r=34, seed=1):
    rnd = random.Random(seed)
    cid = nid("c")
    s = []
    # paper cup
    s.append(shadow(cx + 4, cy + r * .95, r * 1.05, r * .3, .35))
    cup = []
    n = 16
    for i in range(n):
        a0 = math.pi * i / n; a1 = math.pi * (i + 1) / n
        x0 = cx - r * 1.08 * math.cos(a0); x1 = cx - r * 1.08 * math.cos(a1)
        y0 = cy + r * .45 + r * .22 * math.sin(a0); y1 = cy + r * .45 + r * .22 * math.sin(a1)
        sh = .78 + .22 * math.sin(a0 + .4)
        col = f"rgb({int(92*sh)},{int(52*sh)},{int(30*sh)})"
        cup.append(f'<path d="M{x0:.1f},{y0:.1f} L{x1:.1f},{y1:.1f} L{x1*.96+cx*.04:.1f},{y1+r*.42:.1f} L{x0*.96+cx*.04:.1f},{y0+r*.42:.1f}Z" fill="{col}"/>')
    s += cup
    # ball
    s.append(f'<clipPath id="{cid}"><circle cx="{cx}" cy="{cy}" r="{r}"/></clipPath>')
    s.append(f'<circle cx="{cx}" cy="{cy}" r="{r}" fill="#3a1f12"/>')
    sp = [f'<g clip-path="url(#{cid})">']
    for _ in range(int(r * r * .55)):
        a = rnd.uniform(0, 2 * math.pi); d = r * math.sqrt(rnd.random()) * 1.02
        x = cx + d * math.cos(a); y = cy + d * math.sin(a)
        L = rnd.uniform(3.2, 5.2) * r / 34; W = 1.6 * r / 34
        rot = rnd.uniform(0, 180)
        c = rnd.choice(["#24120a", "#2f180d", "#4a2a18", "#5a341f", "#1b0d06"])
        sp.append(f'<rect x="{x-L/2:.1f}" y="{y-W/2:.1f}" width="{L:.1f}" height="{W:.1f}" rx="{W/2:.1f}" fill="{c}" transform="rotate({rot:.0f} {x:.1f} {y:.1f})"/>')
        if rnd.random() < .25:
            sp.append(f'<rect x="{x-L/2:.1f}" y="{y-W/2:.1f}" width="{L*.7:.1f}" height="{W*.4:.1f}" rx="{W/4:.1f}" fill="#8a5a3c" opacity=".55" transform="rotate({rot:.0f} {x:.1f} {y:.1f})"/>')
    sp.append('</g>')
    s += sp
    s.append(f'<circle cx="{cx}" cy="{cy}" r="{r}" fill="url(#vol)"/>')
    s.append(f'<ellipse cx="{cx-r*.38}" cy="{cy-r*.42}" rx="{r*.22}" ry="{r*.13}" fill="#fff" opacity=".35" filter="url(#soft2)" transform="rotate(-30 {cx-r*.38} {cy-r*.42})"/>')
    # cup front lip
    s.append(f'<path d="M{cx-r*1.08},{cy+r*.45} Q{cx},{cy+r*.95} {cx+r*1.08},{cy+r*.45}" fill="none" stroke="#6b3f24" stroke-width="2.4"/>')
    return "".join(s)

def coxinha(cx, cy, s=1.0, rot=0):
    w = 46 * s; h = 66 * s
    d = (f"M{cx},{cy-h*.62} C{cx+w*.18},{cy-h*.45} {cx+w*.62},{cy-h*.05} {cx+w*.6},{cy+h*.2} "
         f"C{cx+w*.58},{cy+h*.45} {cx+w*.3},{cy+h*.52} {cx},{cy+h*.52} "
         f"C{cx-w*.3},{cy+h*.52} {cx-w*.58},{cy+h*.45} {cx-w*.6},{cy+h*.2} "
         f"C{cx-w*.62},{cy-h*.05} {cx-w*.18},{cy-h*.45} {cx},{cy-h*.62}Z")
    g = [f'<g transform="rotate({rot} {cx} {cy})">', shadow(cx + 5, cy + h * .5, w * .62, h * .14, .38),
         f'<path d="{d}" fill="#c98636" filter="url(#crumb)"/>',
         f'<path d="{d}" fill="url(#vol)"/>',
         f'<path d="{d}" fill="#e7a548" opacity=".18"/>',
         '</g>']
    return "".join(g)

def pao_queijo(cx, cy, r=26, seed=2):
    rnd = random.Random(seed)
    pts = []
    n = 14
    for i in range(n):
        a = 2 * math.pi * i / n
        rr = r * rnd.uniform(.93, 1.06)
        pts.append((cx + rr * math.cos(a), cy + rr * .82 * math.sin(a)))
    d = f"M{(pts[0][0]+pts[-1][0])/2:.1f},{(pts[0][1]+pts[-1][1])/2:.1f} "
    for i in range(n):
        p = pts[i]; q = pts[(i + 1) % n]
        d += f"Q{p[0]:.1f},{p[1]:.1f} {(p[0]+q[0])/2:.1f},{(p[1]+q[1])/2:.1f} "
    d += "Z"
    s = [shadow(cx + 4, cy + r * .78, r * 1.0, r * .25, .35),
         f'<path d="{d}" fill="#e6b45e" filter="url(#fine)"/>',
         f'<path d="{d}" fill="url(#vol)"/>']
    # cracks
    for _ in range(3):
        x = cx + rnd.uniform(-r * .4, r * .3); y = cy + rnd.uniform(-r * .45, -r * .05)
        s.append(f'<path d="M{x:.1f},{y:.1f} q{r*.18:.1f},{r*.05:.1f} {r*.32:.1f},{-r*.1:.1f}" stroke="#f7e4b4" stroke-width="{r*.06:.1f}" fill="none" stroke-linecap="round" opacity=".9"/>')
        s.append(f'<path d="M{x:.1f},{y+1.2:.1f} q{r*.18:.1f},{r*.05:.1f} {r*.32:.1f},{-r*.1:.1f}" stroke="#a8702c" stroke-width="{r*.025:.1f}" fill="none" opacity=".5"/>')
    s.append(f'<ellipse cx="{cx-r*.3}" cy="{cy-r*.38}" rx="{r*.3}" ry="{r*.12}" fill="#fff" opacity=".28" filter="url(#soft2)"/>')
    return "".join(s)

def cake_slice(cx, cy, s=1.0, kind="choc"):
    """Classic wedge: tip front-left, cut face visible (layers), top triangle."""
    L = 130 * s; slope = -0.16; h = 56 * s
    Tx, Ty = cx - L * .52, cy + h * .05
    Bx, By = Tx + L, Ty + L * slope
    Cx, Cy = cx + L * .18, cy - h * 1.05
    out = [shadow(cx + 8, Ty + h + 2, L * .6, 13 * s, .35)]
    if kind == "choc":
        layers = [("#4f2717", 16, "sponge"), ("#2a1108", 5, "fine"), ("#4f2717", 15, "sponge"), ("#2a1108", 5, "fine"), ("#4f2717", 15, "sponge")]
        top = "#2b1209"; edge = "#5e301b"
    elif kind == "carrot":
        layers = [("#e59a3a", 50, "sponge"), ("#2b1209", 6, "fine")]
        top = "#2b1209"; edge = "#63341d"
    else:
        layers = [("#cf9a55", 12, "fine"), ("#f2d44f", 32, "fine"), ("#f8f1e4", 12, "fine")]
        top = "#f7efe2"; edge = "#fff"
    tot = sum(l[1] for l in layers)
    # cut face drawn in local coords then skewed
    g = [f'<g transform="matrix(1,{slope},0,1,{Tx:.1f},{Ty:.1f})">']
    y = h
    for col, hh, f in layers:
        hh = h * hh / tot
        g.append(f'<rect x="0" y="{y-hh:.1f}" width="{L:.1f}" height="{hh+.5:.1f}" fill="{col}" filter="url(#{f})"/>')
        y -= hh
    g.append(f'<rect x="0" y="0" width="{L:.1f}" height="{h:.1f}" fill="url(#volsoft)" opacity=".55"/>')
    g.append('</g>')
    out += g
    # back crust edge (right side, below arc) hint
    out.append(f'<path d="M{Bx:.1f},{By:.1f} Q{Bx+6*s:.1f},{By+h*.5:.1f} {Bx:.1f},{By+h:.1f}" stroke="#000" stroke-opacity=".15" stroke-width="{3*s:.1f}" fill="none"/>')
    topd = f"M{Tx:.1f},{Ty:.1f} L{Bx:.1f},{By:.1f} Q{Bx-4*s:.1f},{Cy+8*s:.1f} {Cx:.1f},{Cy:.1f} Z"
    if kind == "lemon":
        out.append(f'<path d="{topd}" fill="{top}"/>')
        import random as _r
        rnd = _r.Random(5)
        for i in range(34):
            a = rnd.random(); b = rnd.random()
            if a + b > 1: a, b = 1 - a, 1 - b
            px = Tx + (Bx - Tx) * a + (Cx - Tx) * b; py = Ty + (By - Ty) * a + (Cy - Ty) * b
            rr = rnd.uniform(8, 13) * s
            gid = nid("m")
            out.append(f'<radialGradient id="{gid}" cx="40%" cy="35%" r="70%"><stop offset="0" stop-color="#fff"/><stop offset=".6" stop-color="#f7efe1"/><stop offset=".86" stop-color="#ecc996"/><stop offset="1" stop-color="#c88a4c"/></radialGradient>')
            out.append(f'<ellipse cx="{px:.1f}" cy="{py-rr*.5:.1f}" rx="{rr:.1f}" ry="{rr*.85:.1f}" fill="url(#{gid})"/>')
    else:
        out.append(f'<path d="{topd}" fill="{top}"/>')
        out.append(f'<path d="M{Tx+L*.08:.1f},{Ty-4*s:.1f} L{Tx+L*.45:.1f},{Ty+L*.45*slope-6*s:.1f} Q{Tx+L*.4:.1f},{Cy+h*.55:.1f} {Cx-L*.12:.1f},{Cy+h*.42:.1f}Z" fill="url(#gloss)" opacity=".35"/>')
        out.append(f'<path d="M{Tx:.1f},{Ty:.1f} L{Bx:.1f},{By:.1f}" stroke="{edge}" stroke-width="{2*s:.1f}" opacity=".8"/>')
        rnd = random.Random(9)
        for i in range(7):
            t = .06 + i * .14 + rnd.uniform(-.03, .03)
            dx = Tx + L * t; dy = Ty + L * t * slope
            dl = rnd.uniform(5, 15) * s
            out.append(f'<path d="M{dx-5*s:.1f},{dy-1:.1f} L{dx-3*s:.1f},{dy+dl:.1f} Q{dx:.1f},{dy+dl+5*s:.1f} {dx+3*s:.1f},{dy+dl:.1f} L{dx+5*s:.1f},{dy-1:.1f}Z" fill="{top}"/>')
    return "".join(out)

def brownie(cx, cy, s=1.0, seed=4):
    rnd = random.Random(seed)
    W = 70 * s; H = 30 * s; D = 34 * s
    x0 = cx - W / 2; yb = cy + H / 2; yt = cy - H / 2
    out = [shadow(cx + 6, yb + 2, W * .65, 9 * s, .38)]
    out.append(f'<rect x="{x0}" y="{yt}" width="{W}" height="{H}" fill="#3b1e11" filter="url(#sponge)"/>')
    out.append(f'<path d="M{x0+W},{yt} l{D*.5},{-D*.45} l0,{H} l{-D*.5},{D*.45}Z" fill="#2c160c" filter="url(#sponge)"/>')
    top = f"M{x0},{yt} L{x0+D*.5},{yt-D*.45} L{x0+W+D*.5},{yt-D*.45} L{x0+W},{yt}Z"
    out.append(f'<path d="{top}" fill="#4d2a18" filter="url(#crumb)"/>')
    for _ in range(9):
        px = x0 + rnd.uniform(.1, .9) * W + rnd.uniform(0, .4) * D
        py = yt - rnd.uniform(.1, .9) * D * .45
        out.append(f'<path d="M{px:.1f},{py:.1f} l{rnd.uniform(4,10)*s:.1f},{rnd.uniform(-2,2)*s:.1f} l{rnd.uniform(3,6)*s:.1f},{rnd.uniform(-3,3)*s:.1f}" stroke="#7a4a2e" stroke-width="{1.1*s}" fill="none" opacity=".8"/>')
    out.append(f'<path d="{top}" fill="url(#gloss)" opacity=".25"/>')
    # chocolate chunks on front
    for _ in range(5):
        px = x0 + rnd.uniform(.05, .95) * W; py = yt + rnd.uniform(.2, .85) * H
        out.append(f'<rect x="{px:.1f}" y="{py:.1f}" width="{4*s:.1f}" height="{3*s:.1f}" rx="1" fill="#1f0e06"/>')
    return "".join(out)

def cookie(cx, cy, r=30, seed=6):
    rnd = random.Random(seed)
    out = [shadow(cx + 4, cy + r * .45, r * 1.05, r * .3, .35)]
    out.append(f'<ellipse cx="{cx}" cy="{cy+r*.12}" rx="{r}" ry="{r*.62}" fill="#a96a32"/>')
    out.append(f'<ellipse cx="{cx}" cy="{cy}" rx="{r}" ry="{r*.6}" fill="#c98f4c" filter="url(#crumb)"/>')
    out.append(f'<ellipse cx="{cx}" cy="{cy}" rx="{r}" ry="{r*.6}" fill="url(#volsoft)"/>')
    for _ in range(7):
        a = rnd.uniform(0, 2 * math.pi); d = r * .7 * math.sqrt(rnd.random())
        x = cx + d * math.cos(a); y = cy + d * .6 * math.sin(a)
        cs = rnd.uniform(3, 5.5) * r / 30
        out.append(f'<path d="M{x-cs:.1f},{y+cs*.4:.1f} Q{x:.1f},{y-cs*1.1:.1f} {x+cs:.1f},{y+cs*.4:.1f}Z" fill="#2a140a"/>')
        out.append(f'<path d="M{x-cs*.4:.1f},{y-cs*.2:.1f} q{cs*.3:.1f},{-cs*.4:.1f} {cs*.5:.1f},0" stroke="#7d5038" stroke-width=".9" fill="none"/>')
    return "".join(out)

def bolo_pote(cx, cy, s=1.0):
    W = 62 * s; H = 86 * s
    x0 = cx - W / 2; yt = cy - H / 2; yb = cy + H / 2
    cid = nid("p")
    out = [shadow(cx + 5, yb, W * .62, 8 * s, .35)]
    out.append(f'<clipPath id="{cid}"><path d="M{x0},{yt+8*s} L{x0},{yb-6*s} Q{x0},{yb} {x0+6*s},{yb} L{x0+W-6*s},{yb} Q{x0+W},{yb} {x0+W},{yb-6*s} L{x0+W},{yt+8*s}Z"/></clipPath>')
    out.append(f'<g clip-path="url(#{cid})">')
    layers = [("#4a2416", 20, "sponge"), ("#f4e6cf", 10, "fine"), ("#3a1a0e", 6, "fine"), ("#4a2416", 18, "sponge"), ("#f4e6cf", 10, "fine"), ("#2c140a", 10, "fine")]
    y = yb
    for col, hh, f in layers:
        hh *= s
        out.append(f'<path d="M{x0-2},{y} L{x0-2},{y-hh} Q{cx},{y-hh-3*s} {x0+W+2},{y-hh} L{x0+W+2},{y}Z" fill="{col}" filter="url(#{f})"/>')
        y -= hh
    out.append(f'<rect x="{x0}" y="{yt}" width="{W}" height="{H}" fill="url(#glass)"/>')
    out.append(f'<rect x="{x0}" y="{yt}" width="{W}" height="{H}" fill="url(#volsoft)" opacity=".5"/>')
    out.append('</g>')
    # rim & lid
    out.append(f'<rect x="{x0-2*s}" y="{yt}" width="{W+4*s}" height="{9*s}" rx="{3*s}" fill="#e9e4dd" opacity=".75"/>')
    out.append(f'<path d="M{x0},{yt+8*s} L{x0},{yb-6*s}" stroke="#fff" stroke-opacity=".7" stroke-width="{2*s}"/>')
    # sprinkles on top
    rnd = random.Random(3)
    for _ in range(14):
        px = x0 + rnd.uniform(.12, .88) * W; py = y + rnd.uniform(-1, 3) * s
        out.append(f'<rect x="{px:.1f}" y="{py:.1f}" width="{3.5*s:.1f}" height="{1.3*s:.1f}" rx=".6" fill="#1f0e06" transform="rotate({rnd.randint(0,180)} {px:.1f} {py:.1f})"/>')
    return "".join(out)

def empada(cx, cy, r=30):
    out = [shadow(cx + 4, cy + r * .6, r * 1.05, r * .28, .35)]
    out.append(f'<path d="M{cx-r},{cy} L{cx-r*.82},{cy+r*.58} Q{cx},{cy+r*.78} {cx+r*.82},{cy+r*.58} L{cx+r},{cy}Z" fill="#cf9550" filter="url(#fine)"/>')
    # fluted edge
    for i in range(12):
        x = cx - r * .9 + i * r * 1.8 / 11
        out.append(f'<path d="M{x:.1f},{cy+r*.05:.1f} L{x+1:.1f},{cy+r*.6:.1f}" stroke="#a46c33" stroke-width="1.2" opacity=".55"/>')
    out.append(f'<ellipse cx="{cx}" cy="{cy}" rx="{r}" ry="{r*.42}" fill="#dca55f" filter="url(#crumb)"/>')
    out.append(f'<ellipse cx="{cx}" cy="{cy-2}" rx="{r*.8}" ry="{r*.32}" fill="#e8b96f" filter="url(#fine)"/>')
    out.append(f'<ellipse cx="{cx}" cy="{cy-2}" rx="{r*.8}" ry="{r*.32}" fill="url(#volsoft)"/>')
    out.append(f'<ellipse cx="{cx-r*.25}" cy="{cy-r*.12}" rx="{r*.25}" ry="{r*.08}" fill="#fff" opacity=".3" filter="url(#soft2)"/>')
    return "".join(out)

def leaf(cx, cy, s=1, rot=0, col="#7c9a5a"):
    return f'<path transform="rotate({rot} {cx} {cy})" d="M{cx},{cy} q{8*s},{-10*s} {20*s},{-4*s} q{-8*s},{12*s} {-20*s},{4*s}Z" fill="{col}" opacity=".9"/>'

def scene(body, w=400, h=400, bg="url(#bgWarm)", extra=""):
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w} {h}" width="{w}" height="{h}">{DEFS}'
            f'<rect width="{w}" height="{h}" fill="{bg}"/><rect width="{w}" height="{h}" filter="url(#linen)"/>'
            f'<ellipse cx="{w*.25}" cy="{h*.1}" rx="{w*.6}" ry="{h*.35}" fill="#fff" opacity=".35" filter="url(#soft)"/>{extra}{body}</svg>')

def save(name, svg):
    open(os.path.join(OUT, name + ".svg"), "w").write(svg)

# Individual product shots (square)
save("brigadeiro", scene(plate(200, 235, 150) + brigadeiro(140, 215, 38, 1) + brigadeiro(258, 210, 38, 2) + brigadeiro(200, 268, 40, 3)))
save("coxinha", scene(plate(200, 240, 155) + coxinha(150, 230, 1.3, -14) + coxinha(250, 228, 1.3, 12) + coxinha(200, 262, 1.35, 0)))
save("paodequeijo", scene(board(200, 250, 300, 170) + pao_queijo(140, 225, 34, 1) + pao_queijo(225, 215, 33, 2) + pao_queijo(185, 280, 36, 3) + pao_queijo(275, 272, 32, 4)))
save("bolochocolate", scene(plate(200, 255, 150) + cake_slice(200, 245, 1.5, "choc")))
save("bolocenoura", scene(plate(200, 255, 150) + cake_slice(200, 245, 1.5, "carrot")))
save("tortalimao", scene(plate(200, 255, 150) + cake_slice(200, 250, 1.45, "lemon") + leaf(300, 300, 1.4, 20)))
save("brownie", scene(board(200, 255, 300, 150) + brownie(150, 240, 1.25, 1) + brownie(255, 262, 1.25, 2)))
save("cookie", scene(plate(200, 245, 150) + cookie(150, 225, 46, 1) + cookie(255, 220, 44, 2) + cookie(200, 280, 48, 3)))
save("bolopote", scene(bolo_pote(150, 215, 1.55) + bolo_pote(268, 232, 1.4), bg="url(#bgCream)"))
save("empada", scene(plate(200, 245, 150) + empada(150, 228, 44) + empada(255, 226, 42) + empada(203, 280, 46)))

# Wide hero composition
hero = (board(330, 330, 420, 200) + pao_queijo(220, 300, 34, 1) + pao_queijo(290, 290, 32, 2) + pao_queijo(255, 350, 35, 3)
        + brigadeiro(410, 300, 30, 4) + brigadeiro(470, 312, 30, 5) + brigadeiro(440, 355, 31, 6)
        + plate(640, 330, 150) + cake_slice(645, 330, 1.25, "carrot") + bolo_pote(120, 290, 1.25) + leaf(540, 410, 1.6, 10) + leaf(560, 400, 1.2, -30))
save("hero", scene(hero, 800, 460))
hero2 = (plate(250, 300, 170) + cake_slice(255, 300, 1.45, "choc") + plate(560, 310, 150) + coxinha(520, 300, 1.2, -14) + coxinha(605, 298, 1.2, 12) + coxinha(562, 330, 1.25, 0))
save("hero2", scene(hero2, 800, 460))
print("ok")

# Portrait composition for arch frame
hv = (board(200, 470, 330, 190) + pao_queijo(130, 440, 34, 1) + pao_queijo(205, 430, 33, 2) + pao_queijo(165, 495, 35, 3)
      + brigadeiro(270, 455, 30, 4) + brigadeiro(300, 505, 30, 5)
      + plate(200, 255, 165) + cake_slice(200, 255, 1.35, "choc") + leaf(320, 560, 1.6, 10) + leaf(90, 300, 1.3, -40))
save("hero_v", scene(hv, 400, 620))
