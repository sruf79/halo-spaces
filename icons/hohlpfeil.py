"""Hohle Antwortpfeile (Vorschau „halo neu“, freigegeben 16.11.2026): Grundriss kleines Dreieck plus
Mittellinie des Schafts, rundum um d = 1,4 aufgeweitet und als Kontur gezeichnet (Strich nach F5; bei
1,6 liegt die Außenkante bei 2,2 wie in der Probe). Spitze, Kopfecken und Schweifende werden dadurch rund."""
import math

D = 1.4                                   # Mittellinie der Kontur (Aufweitung 2,2 minus halber Strich 0,8)


def _f(v):
    s = f"{v:.2f}".rstrip("0").rstrip(".")
    return "0" if s in ("-0", "") else s


def _p(p):
    return f"{_f(p[0])} {_f(p[1])}"


def _norm(v):
    l = math.hypot(*v)
    return (v[0] / l, v[1] / l)


def _add(a, b, k=1.0):
    return (a[0] + k * b[0], a[1] + k * b[1])


def _left(dv):                            # links in Blickrichtung (y nach unten)
    return (dv[1], -dv[0])


def _right(dv):
    return (-dv[1], dv[0])


def _cubic_split(p0, p1, p2, p3, t):
    l = lambda a, b: (a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t)
    a, b, c = l(p0, p1), l(p1, p2), l(p2, p3)
    e, f = l(a, b), l(b, c)
    g = l(e, f)
    return (p0, a, e, g), (g, f, c, p3)


def _isect(p, dv, q, ev):
    den = dv[0] * ev[1] - dv[1] * ev[0]
    if abs(den) < 1e-9:
        return None
    t = ((q[0] - p[0]) * ev[1] - (q[1] - p[1]) * ev[0]) / den
    return _add(p, dv, t)


def _cubic_offset(c, d, side):
    """Tiller-Hanson auf einem Teilstück: Kontrollpolygon um d verschieben."""
    p0, p1, p2, p3 = c
    nf = _right if side == "r" else _left
    legs = [(p0, p1), (p1, p2), (p2, p3)]
    off = []
    for a, b in legs:
        dv = _norm((b[0] - a[0], b[1] - a[1]))
        n = nf(dv)
        off.append((_add(a, n, d), _add(b, n, d), dv))
    q0 = off[0][0]
    q3 = off[2][1]
    q1 = _isect(off[0][0], off[0][2], off[1][0], off[1][2]) or off[0][1]
    q2 = _isect(off[1][0], off[1][2], off[2][0], off[2][2]) or off[2][0]
    return (q0, q1, q2, q3)


def pfeil(tip=(4.8, 11.0), h=4.4, schaft=(("L", (13.0, 11.0)), ("C", (16.9, 11.0), (19.6, 13.8), (19.8, 18.0))), d=D, teile=4):
    """Kontur (Liste von Segmenten) eines nach links zeigenden hohlen Pfeils.
    Dreieck: Spitze tip, Grundlinie senkrecht bei x = tip.x + h, halbe Höhe h; Schaft beginnt in der
    Mitte der Grundlinie und läuft zuerst waagrecht nach rechts (erstes Teilstück eine Linie)."""
    cx, cy = tip
    bx = cx + h
    T, U, Lo = (cx, cy), (bx, cy - h), (bx, cy + h)
    nTU = _norm((-1, -1))
    nTL = _norm((-1, 1))
    seg = [("M", (bx + d, cy - d)), ("L", (bx + d, cy - h)),
           ("A", d, 0, 0, _add(U, nTU, d)), ("L", _add(T, nTU, d)),
           ("A", d, 0, 0, _add(T, nTL, d)), ("L", _add(Lo, nTL, d)),
           ("A", d, 0, 0, (bx + d, cy + h)), ("L", (bx + d, cy + d))]
    # Schaft in Teilstücke (Linie, Bogen mit Mittelpunkt, Kubik) mit Richtung zerlegen
    parts, cur = [], (bx, cy)
    for s in schaft:
        if s[0] == "L":
            parts.append(("L", cur, s[1]))
            cur = s[1]
        elif s[0] == "C":
            c = (cur, s[1], s[2], s[3])
            pieces, rest = [], c
            for k in range(teile, 1, -1):
                a, rest = _cubic_split(*rest, 1 / k)
                pieces.append(a)
            pieces.append(rest)
            for pc in pieces:
                parts.append(("C", pc))
            cur = s[3]
        elif s[0] == "A":                 # ("A", r, sweep, Ende, Mittelpunkt)
            parts.append(("A", cur, s[1], s[2], s[3], s[4]))
            cur = s[3]

    def dir_start(pt):
        if pt[0] == "L":
            return _norm((pt[2][0] - pt[1][0], pt[2][1] - pt[1][1]))
        if pt[0] == "C":
            return _norm((pt[1][1][0] - pt[1][0][0], pt[1][1][1] - pt[1][0][1]))
        _, a, r, sw, e, m = pt
        rv = (a[0] - m[0], a[1] - m[1])
        return _norm(_right(rv) if sw == 1 else _left(rv))  # Tangente

    def dir_end(pt):
        if pt[0] == "L":
            return dir_start(pt)
        if pt[0] == "C":
            return _norm((pt[1][3][0] - pt[1][2][0], pt[1][3][1] - pt[1][2][1]))
        _, a, r, sw, e, m = pt
        rv = (e[0] - m[0], e[1] - m[1])
        return _norm(_right(rv) if sw == 1 else _left(rv))

    def side(pt, sd):
        nf = _right if sd == "r" else _left
        if pt[0] == "L":
            n = nf(dir_start(pt))
            return [("L", _add(pt[2], n, d))]
        if pt[0] == "C":
            q = _cubic_offset(pt[1], d, sd)
            return [("C", q[1], q[2], q[3])]
        _, a, r, sw, e, m = pt
        n = nf(dir_end(pt))
        # Mittelpunkt liegt bei sweep 1 rechts, bei 0 links
        inner = (sw == 1 and sd == "r") or (sw == 0 and sd == "l")
        return [("A", r - d if inner else r + d, 0, sw, _add(e, n, d))]

    for pt in parts:
        seg += side(pt, "r")
    end = cur
    de = dir_end(parts[-1])
    seg.append(("A", d, 0, 0, _add(end, de, d)))
    seg.append(("A", d, 0, 0, _add(end, _left(de), d)))
    # linke Seite rückwärts
    back = []
    starts = []
    for pt in parts:
        n = _left(dir_start(pt))
        if pt[0] == "L":
            starts.append(_add(pt[1], n, d))
        elif pt[0] == "C":
            starts.append(_cubic_offset(pt[1], d, "l")[0])
        else:
            starts.append(_add(pt[1], n, d))
    for i in range(len(parts) - 1, -1, -1):
        pt = parts[i]
        st = starts[i] if i > 0 else (bx + d, cy - d)
        if pt[0] == "L":
            back.append(("L", st))
        elif pt[0] == "C":
            q = _cubic_offset(pt[1], d, "l")
            back.append(("C", q[2], q[1], st))
        else:
            _, a, r, sw, e, m = pt
            inner = sw == 0
            back.append(("A", r - d if inner else r + d, 0, 1 - sw, st))
    seg += back
    seg.append(("Z",))
    return seg


def spiegeln(seg, w=24.0):
    out = []
    m = lambda p: (w - p[0], p[1])
    for s in seg:
        if s[0] in ("M", "L"):
            out.append((s[0], m(s[1])))
        elif s[0] == "A":
            out.append(("A", s[1], s[2], 1 - s[3], m(s[4])))
        elif s[0] == "C":
            out.append(("C", m(s[1]), m(s[2]), m(s[3])))
        else:
            out.append(s)
    return out


def schieben(seg, dx):
    out = []
    m = lambda p: (p[0] + dx, p[1])
    for s in seg:
        if s[0] in ("M", "L"):
            out.append((s[0], m(s[1])))
        elif s[0] == "A":
            out.append(("A", s[1], s[2], s[3], m(s[4])))
        elif s[0] == "C":
            out.append(("C", m(s[1]), m(s[2]), m(s[3])))
        else:
            out.append(s)
    return out


def pfad(seg):
    out = []
    for s in seg:
        if s[0] in ("M", "L"):
            out.append(s[0] + _p(s[1]))
        elif s[0] == "A":
            out.append(f"A{_f(s[1])} {_f(s[1])} 0 {s[2]} {s[3]} {_p(s[4])}")
        elif s[0] == "C":
            out.append("C" + " ".join(_p(x) for x in s[1:]))
        else:
            out.append("Z")
    return "".join(out)


def _dist_seg(p, a, b):
    vx, vy = b[0] - a[0], b[1] - a[1]
    t = max(0, min(1, ((p[0] - a[0]) * vx + (p[1] - a[1]) * vy) / (vx * vx + vy * vy)))
    return math.hypot(p[0] - a[0] - t * vx, p[1] - a[1] - t * vy)


def _dist_tri(p, tri):
    return min(_dist_seg(p, tri[i], tri[(i + 1) % 3]) for i in range(3))


def hinterer_kopf(tip, h, vorn_tri, luft, d=D, s=1.6):
    """Nur der Kopf als offene Kontur, ausgespart, wo der vordere Pfeil liegt: Abstand der Kontur-
    Mittellinie zum vorderen Dreieck mindestens Aufweitung + Luft + halber Strich (runde Enden)."""
    cx, cy = tip
    bx = cx + h
    T, U = (cx, cy), (bx, cy - h)
    nTU = _norm((-1, -1))
    grenze = (d + s / 2) + luft + s / 2
    # obere Hälfte: Kante T→U (Versatz), dann Bogen um U von nTU über (0,-1) nach (1,0)
    a0 = math.atan2(nTU[1], nTU[0])                  # -135°
    def punkt(u):                                    # u in [0, 2]: 0..1 Kante, 1..2 Bogen
        if u <= 1:
            return _add(_add(T, nTU, d), (U[0] - T[0], U[1] - T[1]), u)
        ang = a0 + (u - 1) * (math.pi * 3 / 4)       # bis 0°
        return (U[0] + d * math.cos(ang), U[1] + d * math.sin(ang))
    lo, hi = 0.0, 2.0
    if _dist_tri(punkt(hi), vorn_tri) >= grenze:
        u = hi
    else:
        for _ in range(60):
            mid = (lo + hi) / 2
            if _dist_tri(punkt(mid), vorn_tri) >= grenze:
                lo = mid
            else:
                hi = mid
        u = lo
    p_ob = punkt(u)
    p_un = (p_ob[0], 2 * cy - p_ob[1])
    seg = [("M", p_ob)]
    if u > 1:
        seg.append(("A", d, 0, 0, _add(U, nTU, d)))
        seg.append(("L", _add(T, nTU, d)))
    else:
        seg.append(("L", _add(T, nTU, d)))
    nTL = _norm((-1, 1))
    seg.append(("A", d, 0, 0, _add(T, nTL, d)))
    if u > 1:
        Lo = (bx, cy + h)
        seg.append(("L", _add(Lo, nTL, d)))
        seg.append(("A", d, 0, 0, p_un))
    else:
        seg.append(("L", p_un))
    return seg, u



def zeichnungen():
    """Antworten, Allen antworten, Weiterleiten, Umleiten als Pfad-Daten (viewBox 24)."""
    reply = pfeil()
    # Allen antworten: vorderer Pfeil 2,2 nach rechts, zweiter Kopf 2,6 nach links nur als Kontur mit
    # 1,1 Luft zum vorderen; alles 0,1 nach links, damit beide Enden gleich wenig über den Rand ragen
    tri = ((4.8 + 2.2, 11.0), (9.2 + 2.2, 6.6), (9.2 + 2.2, 15.4))
    hinten, _ = hinterer_kopf((4.8 - 2.6, 11.0), 4.4, tri, 1.1)
    alle = pfad(schieben(reply, 2.1)) + pfad(schieben(hinten, -0.1))
    # Umleiten: Kopf nach rechts, Schaft mit Kehre nach unten zurück (gespiegelt gezeichnet)
    um = pfeil(tip=(4.4, 9.4), schaft=(("L", (14.4, 9.4)), ("A", 4.8, 1, (14.4, 19.0), (14.4, 14.2)), ("L", (11.6, 19.0))))
    return {
        "reply": pfad(reply),
        "reply-all": alle,
        "forward": pfad(spiegeln(reply)),
        "redirect": pfad(spiegeln(um)),
    }
