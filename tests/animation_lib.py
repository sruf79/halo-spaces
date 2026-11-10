"""Gemeinsame Hilfen für Animationsmessung (animation_messung.py) und die Prüfung in halo_test.py (ohne Import von halo_test)."""

# Hilfen im Chrome-Kontext: Messfühler, der je Bildwechsel Lage und Breite aufzeichnet
SAMPLER = r"""
w.__mcMess = w.__mcMess || {};
const M = w.__mcMess;
// Elemente je Bereich: Name -> () => [Element, Versatz-Fenster]
const off = (win) => { try { const e = win.browsingContext?.embedderElement || win.frameElement; if (!e || win == w) return [0, 0]; const r = e.getBoundingClientRect(); return [r.left, r.top]; } catch { return [0, 0]; } };
M.ziele = (modus) => {
  const z = {};
  const dd = (name, doc, id) => { z[name] = () => { const e = typeof id == "function" ? id() : doc()?.getElementById(id); return e ? [e, e.ownerDocument.defaultView] : null; }; };
  const top = (name, id) => dd(name, () => d, id);
  top("spacesToolbar", "spacesToolbar"); top("spacesPinnedButton", "spacesPinnedButton"); top("mcTodayToggle", "mcTodayToggle");
  top("tabmail-container", "tabmail-container"); top("today-pane-panel", "today-pane-panel"); top("today-splitter", "today-splitter");
  top("unifiedToolbarContainer", "unifiedToolbarContainer");
  z["toolbar-kinder"] = () => null;
  if (modus == "mail") {
    const a3 = () => tm.tabInfo[0]?.chromeBrowser?.contentWindow?.document;
    for (const id of ["folderPane", "folderPaneSplitter", "threadPane", "messagePane", "messagePaneSplitter"]) dd("a3." + id, a3, id);
  } else if (modus == "calendar" || modus == "tasks") {
    for (const id of ["calSidebar", "calsidebar_splitter", "calendarContent", "calendar-task-view-splitter", "calendar-task-details-container"]) top(id, id);
  } else if (modus == "chat") {
    for (const id of ["listPaneBox", "listSplitter", "chat-view", "contentPane"]) top(id, id);
  } else if (modus == "addressbook") {
    const ab = () => tm.currentTabInfo?.browser?.contentDocument;
    for (const id of ["booksPane", "booksSplitter", "cardsPane", "sharedSplitter", "detailsPane"]) dd("ab." + id, ab, id);
  } else if (modus == "settings") {
    const pd = () => tm.currentTabInfo?.browser?.contentDocument;
    for (const id of ["pref-category-box", "mainPrefPane", "preferencesContainer"]) dd("pref." + id, pd, id);
  }
  return z;
};
// aufzeichnen: startet eine rAF-Schleife, die in M.daten sammelt, bis M.stop gesetzt wird
M.start = (modus) => {
  const z = M.ziele(modus);
  M.daten = { frames: [], modus, hidden: d.hidden, start: performance.now() };
  M.stop = false;
  const sammeln = () => {
    const f = { t: Math.round(performance.now() * 100) / 100, e: {}, cls: {}, anim: 0, flags: {} };
    for (const [name, get] of Object.entries(z)) {
      let r; try { r = get(); } catch { r = null; }
      if (!r) continue;
      const [el, win] = r; const [ox, oy] = off(win); const b = el.getBoundingClientRect();
      const cs = win.getComputedStyle(el);
      f.e[name] = [Math.round((b.left + ox) * 100) / 100, Math.round((b.top + oy) * 100) / 100, Math.round(b.width * 100) / 100, Math.round(b.height * 100) / 100, cs.transform == "none" ? "" : cs.transform, el.style.width || "", cs.display == "none" ? "x" : ""];
      if (el.classList.contains("mc-side-anim") || el.classList.contains("mc-side-hidden") || el.hasAttribute("data-mc-anim")) f.cls[name] = [...el.classList].filter(c => c.startsWith("mc-")).join(" ") + (el.hasAttribute("data-mc-anim") ? " data-mc-anim" : "");
      if (el.__mcAnimating) f.flags[name] = 1;
    }
    try { const cs = w.getComputedStyle(d.documentElement); f.vars = { side: cs.getPropertyValue("--mc-side-right").trim(), tp: cs.getPropertyValue("--mc-tp-room").trim(), reserve: cs.getPropertyValue("--mc-tl-reserve").trim() }; } catch {}
    try { f.anim = d.getAnimations().filter(a => a.playState == "running").length; } catch {}
    try { const a3 = tm.tabInfo[0]?.chromeBrowser?.contentWindow; if (a3?.__mcAnimating) f.flags.a3 = 1; } catch {}
    if (w.__mcSpacesAnimating) f.flags.spaces = 1;
    // Toolbar-Knöpfe einzeln
    const kids = d.getElementById("unifiedToolbarContent")?.children || [];
    // vierter Wert: tatsächliche Sichtbarkeit (0 ohne Fläche oder bei display none, sonst die eigene Deckkraft)
    f.tb = [...kids].map(k => { const b = k.getBoundingClientRect(); const cs = w.getComputedStyle(k); const op = !b.width || cs.display == "none" || cs.visibility == "hidden" ? 0 : parseFloat(cs.opacity); return [k.id || k.localName + "." + (k.className || "").toString().split(" ")[0], Math.round(b.left * 100) / 100, Math.round(b.width * 100) / 100, Math.round(op * 100) / 100]; });
    M.daten.frames.push(f);
  };
  const loop = () => { sammeln(); if (!M.stop) w.requestAnimationFrame(loop); else M.fertig = true; };
  M.fertig = false;
  w.requestAnimationFrame(loop);
};
M.ende = async () => { M.stop = true; await until(() => M.fertig, 2000); return M.daten; };
"""


def messen(m, modus, vorgang_js, nachlauf_ms=450):
    """Fühler starten, Vorgang ausführen, nachlaufen lassen, Fühler beenden; Rohdaten zurück."""
    m.js(SAMPLER + f'w.__mcMess.start("{modus}"); await wait(120); return 1;')
    vorgang_js()
    m.js(f"await wait({nachlauf_ms}); return 1;")
    return m.js(SAMPLER + "return await w.__mcMess.ende();")


def auswerten(daten, kern):
    """kern: Name des Hauptelements (Seitenleiste bzw. Heute-Fenster), dessen Breite die Animation führt."""
    fr = daten["frames"]
    if len(fr) < 3:
        return {"fehler": f"nur {len(fr)} Bilder"}
    ts = [f["t"] for f in fr]
    gaps = [round(b - a, 1) for a, b in zip(ts, ts[1:])]
    # Hauptelement: Verlauf der Breite
    ws = [f["e"].get(kern, [0, 0, 0])[2] for f in fr]
    final = ws[-1]
    bewegt = [i for i in range(1, len(ws)) if abs(ws[i] - ws[i - 1]) > 0.5]
    if not bewegt:
        return {"fehler": f"{kern}: keine Breitenänderung gemessen", "bilder": len(fr), "verdeckt": daten["hidden"]}
    i0, i1 = bewegt[0], bewegt[-1]
    dauer = round(ts[i1] - ts[i0 - 1], 0)
    # Schrittgrößen während der Bewegung
    steps = [round(abs(ws[i] - ws[i - 1]), 1) for i in range(i0, i1 + 1)]
    # Nachzügler: alle Elemente (Kasten + Toolbar-Knöpfe), die sich nach i1 noch um > 0.5 px bewegen
    spaet = {}
    for name in set(n for f in fr for n in f["e"]):
        serie = [f["e"].get(name) for f in fr]
        for i in range(i1 + 1, len(fr)):
            a, b = serie[i - 1], serie[i]
            if not a or not b:
                continue
            # nicht sichtbar (ganz links außerhalb des Fensters oder ohne Fläche): zählt nicht
            if (a[0] + a[2] <= 1 and b[0] + b[2] <= 1) or (a[2] <= 1 and b[2] <= 1) or (a[2] <= 1 and a[0] + a[2] <= 1) or (b[2] <= 1 and b[0] + b[2] <= 1):
                continue
            dx = max(abs(a[0] - b[0]), abs(a[2] - b[2]), abs(a[1] - b[1]))
            if dx > 0.5:
                spaet.setdefault(name, []).append((i - i1, round(dx, 1), round(ts[i] - ts[i1], 0)))
    tbspaet = {}
    for i in range(i1 + 1, len(fr)):
        a, b = {k[0]: k for k in fr[i - 1]["tb"]}, {k[0]: k for k in fr[i]["tb"]}
        for k in b:
            # leerer Abstandhalter vorn: unsichtbar, seine Wirkung zeigt sich an den Knöpfen dahinter
            if k.startswith("li.spacer"):
                continue
            if k in a and (abs(a[k][1] - b[k][1]) > 0.5 or abs(a[k][2] - b[k][2]) > 0.5):
                tbspaet.setdefault(k, []).append((i - i1, round(abs(a[k][1] - b[k][1]), 1), round(ts[i] - ts[i1], 0)))
    # Knöpfe, die schlagartig erscheinen oder verschwinden (Sichtbarkeit springt um mehr als 0,5 zwischen zwei Bildern)
    plopp = {}
    for i in range(1, len(fr)):
        a, b = {k[0]: k for k in fr[i - 1]["tb"]}, {k[0]: k for k in fr[i]["tb"]}
        for k in b:
            if k.startswith("li.spacer") or k not in a or len(a[k]) < 4 or len(b[k]) < 4:
                continue
            if abs(a[k][3] - b[k][3]) > 0.5:
                plopp.setdefault(k, []).append((i, a[k][3], b[k][3]))
    # Sprung im ersten Bild: Elemente, die sich im ersten Bildwechsel bewegen, bevor das Hauptelement sich bewegt
    frueh = {}
    for name in set(n for f in fr for n in f["e"]):
        serie = [f["e"].get(name) for f in fr]
        for i in range(1, i0):
            a, b = serie[i - 1], serie[i]
            if a and b and max(abs(a[0] - b[0]), abs(a[2] - b[2]), abs(a[1] - b[1])) > 0.5:
                frueh.setdefault(name, []).append((i, round(max(abs(a[0] - b[0]), abs(a[2] - b[2])), 1)))
    # Toolbar: Anfang gegen Ende
    # Knöpfe, die sich in mehr als einer Richtung bewegen (hin und zurück): Umkehr zählen
    umkehr = {}
    for name in set(n for f in fr for n in f["e"]):
        serie = [f["e"].get(name) for f in fr]
        lef = [s[0] for s in serie if s]
        dirs = [1 if b - a > 0.5 else -1 for a, b in zip(lef, lef[1:]) if abs(b - a) > 0.5]
        wechsel = sum(1 for a, b in zip(dirs, dirs[1:]) if a != b)
        if wechsel:
            umkehr[name] = wechsel
    flags = sorted({k for f in fr for k in f["flags"]})
    return {
        "bilder": len(fr), "verdeckt": daten["hidden"], "dauer_ms": dauer, "breite": [round(ws[0], 1), round(final, 1)],
        "max_luecke_ms": max(gaps) if gaps else 0, "luecken>24ms": sum(1 for g in gaps if g > 24),
        "schritt_max_px": max(steps) if steps else 0, "schritte": steps[:40],
        "nachzuegler": {k: v[:6] for k, v in spaet.items()}, "toolbar_nachzuegler": {k: v[:6] for k, v in tbspaet.items()},
        "plopp": plopp, "fruehe_spruenge": frueh, "richtungswechsel": umkehr, "merker": flags,
    }


