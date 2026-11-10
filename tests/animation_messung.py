#!/usr/bin/env python3
"""Messung der Ein-/Ausblend-Animationen und des Ziehens der Trennlinien in allen Bereichen (nur Messen, ändert nichts).

Je Bereich (Mail, Kalender, Aufgaben, Adressbuch, Chat, Einstellungen) und Vorgang (Seitenleiste aus, ein; Heute-Fenster
ein, aus – nur Mail und Kalender; Trennlinie ziehen) wird mit jedem Bildwechsel (requestAnimationFrame, ~16 ms) die Lage
und Breite der beteiligten Elemente aufgezeichnet, dazu laufende Übergänge/Animationen und die Klassen/Merker der
Erweiterung. Ausgewertet werden:
  - Bildabstände (verlorene Bilder),
  - „Nachzügler“: Elemente, die sich noch bewegen, nachdem die Seitenleiste ihre Endbreite erreicht hat,
  - Sprünge im ersten Bild und größte Einzelschritte,
  - Zustand vor und nach dem Vorgang (soll nach dem Ruhen gleich bleiben).
Aufruf (Port ab 2850; nicht, solange auf neon die CI läuft):
  python3 tests/animation_messung.py --port 2851 [--bereich Kalender] [--json ordner] [--tb PFAD]
Ausgabe: je Vorgang eine Zeile, mit --json die Rohdaten (Bildfolgen) je Vorgang in diese Dateien.
"""
import argparse, glob, json, os, shutil, subprocess, sys, time, zipfile

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import halo_test as H  # noqa: E402

ROOT = H.ROOT

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
    try { f.anim = d.getAnimations().filter(a => a.playState == "running").length; } catch {}
    try { const a3 = tm.tabInfo[0]?.chromeBrowser?.contentWindow; if (a3?.__mcAnimating) f.flags.a3 = 1; } catch {}
    if (w.__mcSpacesAnimating) f.flags.spaces = 1;
    // Toolbar-Knöpfe einzeln
    const kids = d.getElementById("unifiedToolbarContent")?.children || [];
    f.tb = [...kids].map(k => { const b = k.getBoundingClientRect(); return [k.id || k.localName + "." + (k.className || "").toString().split(" ")[0], Math.round(b.left * 100) / 100, Math.round(b.width * 100) / 100]; });
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
            dx = max(abs(a[0] - b[0]), abs(a[2] - b[2]), abs(a[1] - b[1]))
            if dx > 0.5:
                spaet.setdefault(name, []).append((i - i1, round(dx, 1), round(ts[i] - ts[i1], 0)))
    tbspaet = {}
    for i in range(i1 + 1, len(fr)):
        a, b = {k[0]: k for k in fr[i - 1]["tb"]}, {k[0]: k for k in fr[i]["tb"]}
        for k in b:
            if k in a and (abs(a[k][1] - b[k][1]) > 0.5 or abs(a[k][2] - b[k][2]) > 0.5):
                tbspaet.setdefault(k, []).append((i - i1, round(abs(a[k][1] - b[k][1]), 1), round(ts[i] - ts[i1], 0)))
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
        "fruehe_spruenge": frueh, "richtungswechsel": umkehr, "merker": flags,
    }


def zustand(m, modus):
    return m.js(SAMPLER + f'const z = w.__mcMess.ziele("{modus}"); const o = {{}}; for (const [n, g] of Object.entries(z)) {{ try {{ const r = g(); if (r) {{ const b = r[0].getBoundingClientRect(); o[n] = [Math.round(b.left), Math.round(b.width), r[0].style.width || "", r[0].style.minWidth || ""]; }} }} catch {{}} }} '
                'const k = d.getElementById("unifiedToolbarContent")?.children || []; o["toolbar"] = [...k].map(x => Math.round(x.getBoundingClientRect().left) + ":" + Math.round(x.getBoundingClientRect().width)); return o;')


BEREICHE = {
    "Mail": ("mail", "a3.folderPane", 'await toMail();'),
    "Kalender": ("calendar", "calSidebar", 'await toCalendar();'),
    "Aufgaben": ("tasks", "calSidebar", 'tm.openTab("tasks", {}); await bis(() => tm.currentTabInfo?.mode?.name == "tasks" && d.getElementById("calSidebar")?.getBoundingClientRect().width > 0, "Aufgaben", 8000); await ruhig(1500);'),
    "Adressbuch": ("addressbook", "ab.booksPane", 'tm.openTab("addressBookTab", {}); await bis(() => tm.currentTabInfo?.browser?.contentDocument?.getElementById("booksSplitter")?.getBoundingClientRect().width > 0, "Adressbuch", 8000); await ruhig(2000);'),
    "Chat": ("chat", "listPaneBox", 'tm.openTab("chat", {}); await bis(() => tm.currentTabInfo?.mode?.name == "chat" && d.getElementById("listPaneBox")?.getBoundingClientRect().width > 0, "Chat", 8000); await ruhig(1500);'),
    "Einstellungen": ("settings", "pref.pref-category-box", 'w.openPreferencesTab(); await bis(() => tm.currentTabInfo?.browser?.contentDocument?.getElementById("pref-category-box")?.getBoundingClientRect().width > 0, "Einstellungen", 8000); await ruhig(2000);'),
}


def melde(titel, a, out, roh, jsondir, key):
    if jsondir:
        os.makedirs(jsondir, exist_ok=True)
        with open(os.path.join(jsondir, key.replace(" ", "_").replace("/", "-") + ".json"), "w") as f:
            json.dump(roh, f)
    out[key] = a
    if "fehler" in a:
        print(f"{titel:42s} KEINE MESSUNG: {a['fehler']} (Bilder {a.get('bilder')}, verdeckt {a.get('verdeckt')})", flush=True)
        return
    nz = len(a["nachzuegler"]) + len(a["toolbar_nachzuegler"])
    print(f"{titel:42s} {a['dauer_ms']:4.0f} ms, Breite {a['breite'][0]}→{a['breite'][1]}, Lücken>24ms: {a['luecken>24ms']} (max {a['max_luecke_ms']} ms), "
          f"größter Schritt {a['schritt_max_px']} px, Nachzügler: {nz}, frühe Sprünge: {len(a['fruehe_spruenge'])}, Richtungswechsel: {len(a['richtungswechsel'])}", flush=True)
    for k, v in {**a["nachzuegler"], **{"tb:" + k: v for k, v in a["toolbar_nachzuegler"].items()}}.items():
        print(f"      Nachzügler {k}: (Bild nach Ende, px, ms nach Ende) {v}", flush=True)
    for k, v in a["fruehe_spruenge"].items():
        print(f"      früher Sprung {k}: {v[:3]}", flush=True)
    if a["richtungswechsel"]:
        print(f"      Richtungswechsel: {a['richtungswechsel']}", flush=True)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--port", type=int, default=2851)
    ap.add_argument("--tb", default=H.DEFAULT_TB)
    ap.add_argument("--xpi")
    ap.add_argument("--bereich", help="nur dieser Bereich (Mail, Kalender, Aufgaben, Adressbuch, Chat, Einstellungen)")
    ap.add_argument("--json", help="Ordner für die Rohdaten")
    ap.add_argument("--dark", action="store_true")
    ap.add_argument("--keep", action="store_true")
    args = ap.parse_args()
    if not args.xpi:
        b = subprocess.run([os.path.join(ROOT, "build.sh")], capture_output=True, text=True, cwd=ROOT)
        if b.returncode:
            sys.exit("build.sh fehlgeschlagen:\n" + b.stderr)
    xpi = args.xpi or max((x for x in glob.glob(os.path.join(ROOT, "dist", "halo-spaces-*.xpi")) if not x.endswith("-atn.xpi")), key=os.path.getmtime)
    with zipfile.ZipFile(xpi) as zf:
        version = json.loads(zf.read("manifest.json"))["version"]
    H.faktisch_setzen(version)
    profile = H.create_profile(xpi, args.port, args.dark, prefix="halo-mess-")
    print(f"halo.spaces {version} · Profil {profile}", flush=True)
    proc = H.start_thunderbird(args.tb, profile, None)
    out = {}
    try:
        if not H.wait_port(args.port):
            sys.exit("Thunderbird hat Marionette nicht geöffnet")
        time.sleep(8)
        m = H.Marionette(args.port)
        m.cmd("WebDriver:SetTimeouts", {"script": 120000})
        m.js("const s = w.screen; w.moveTo(s.availLeft, s.availTop); w.resizeTo(1522, 900); await wait(1200); return 1;")
        info = m.js("return { hidden: d.hidden, focus: d.hasFocus(), occluded: w.windowUtils?.isOccluded ?? null, v: Services.appinfo.version };")
        print(f"Fenster: {info}", flush=True)

        def klick(id_js):
            return lambda: m.js(f'{id_js}; await wait(30); return 1;')
        for name, (modus, kern, geh) in BEREICHE.items():
            if args.bereich and args.bereich.lower() != name.lower():
                continue
            print(f"\n=== {name} ===", flush=True)
            try:
                m.js(geh + " return 1;")
            except Exception as e:
                print(f"  nicht erreichbar: {e}", flush=True)
                continue
            m.js("w.__mcAnimating = false; return 1;")
            # Seitenleiste sichtbar machen (Ausgangslage)
            vis = m.js(SAMPLER + f'const g = w.__mcMess.ziele("{modus}")["{kern}"]; const r = g && g(); return r ? Math.round(r[0].getBoundingClientRect().width) : -1;')
            print(f"  Seitenleiste Breite vor dem Test: {vis}", flush=True)
            if vis <= 0:
                m.js('d.getElementById("spacesPinnedButton").click(); await ruhig(1000); return 1;')
            z0 = zustand(m, modus)
            # 1) aus  2) ein  (Knopf oben links), 3) aus, 4) ein nochmals
            for n, label in enumerate(["Seitenleiste aus", "Seitenleiste ein", "Seitenleiste aus (2)", "Seitenleiste ein (2)"]):
                roh = messen(m, modus, lambda: m.js('d.getElementById("spacesPinnedButton").click(); return 1;'), 700)
                m.js("await ruhig(1500); return 1;")
                a = auswerten(roh, kern)
                zn = zustand(m, modus)
                melde(f"{name}: {label}", a, out, roh, args.json, f"{name} {label}")
                if label == "Seitenleiste ein (2)":
                    diff = {k: [z0.get(k), zn.get(k)] for k in set(z0) | set(zn) if z0.get(k) != zn.get(k)}
                    print(f"  Zustand nach 2×Aus/Ein gegen Anfang, Abweichungen: {diff if diff else 'keine'}", flush=True)
            # Heute-Fenster (nur wo es existiert: Mail, Kalender, Aufgaben)
            if modus in ("mail", "calendar", "tasks"):
                for label in ["Heute-Fenster ein", "Heute-Fenster aus", "Heute-Fenster ein (2)", "Heute-Fenster aus (2)"]:
                    roh = messen(m, modus, lambda: m.js('const b = d.getElementById("mcTodayToggle"); if (!b) throw new Error("kein Heute-Knopf"); b.click(); return 1;'), 700)
                    m.js("await ruhig(1500); return 1;")
                    a = auswerten(roh, "today-pane-panel")
                    melde(f"{name}: {label}", a, out, roh, args.json, f"{name} {label}")
            # Trennlinie ziehen: ruhig und gleichmäßig 40 px nach rechts, 80 px nach links, zurück
            sp = {"mail": 'tm.tabInfo[0].chromeBrowser.contentWindow.document.getElementById("folderPaneSplitter")', "calendar": 'd.getElementById("calsidebar_splitter")',
                  "tasks": 'd.getElementById("calsidebar_splitter")', "chat": 'd.getElementById("listSplitter")',
                  "addressbook": 'tm.currentTabInfo.browser.contentDocument.getElementById("booksSplitter")', "settings": None}[modus]
            if sp:
                pos = m.js(f"""const s = {sp}; const win = s.ownerDocument.defaultView; const e = win.frameElement || win.browsingContext?.embedderElement; const o = e && win != w ? e.getBoundingClientRect() : {{ left: 0, top: 0 }};
                    const r = s.getBoundingClientRect(); return {{ x: Math.round(o.left + r.left + r.width / 2), y: Math.round(o.top + r.top + 300) }};""")

                def ziehen():
                    x, y = pos["x"], pos["y"]
                    steps = [{"type": "pointerMove", "x": x, "y": y, "origin": "viewport"}, {"type": "pointerDown", "button": 0}]
                    for i in range(1, 21):  # 40 px nach rechts in 20 Schritten à 16 ms
                        steps.append({"type": "pointerMove", "x": x + 2 * i, "y": y, "origin": "viewport", "duration": 16})
                    for i in range(1, 21):  # und zurück
                        steps.append({"type": "pointerMove", "x": x + 40 - 2 * i, "y": y, "origin": "viewport", "duration": 16})
                    steps.append({"type": "pointerUp", "button": 0})
                    m.cmd("WebDriver:PerformActions", {"actions": [{"type": "pointer", "id": "maus", "parameters": {"pointerType": "mouse"}, "actions": steps}]})
                    m.cmd("WebDriver:ReleaseActions", {})
                z1 = zustand(m, modus)
                roh = messen(m, modus, ziehen, 500)
                m.js("await ruhig(1000); return 1;")
                a = auswerten(roh, kern)
                melde(f"{name}: Trennlinie ziehen 40 px hin und zurück", a, out, roh, args.json, f"{name} Ziehen")
                z2 = zustand(m, modus)
                diff = {k: [z1.get(k), z2.get(k)] for k in set(z1) | set(z2) if z1.get(k) != z2.get(k)}
                print(f"  Zustand nach dem Ziehen hin und zurück gegen vorher, Abweichungen: {diff if diff else 'keine'}", flush=True)
        if args.json:
            with open(os.path.join(args.json, "auswertung.json"), "w") as f:
                json.dump(out, f, indent=1)
    finally:
        H.stop_thunderbird(args.port, proc)
        if not args.keep:
            shutil.rmtree(profile, ignore_errors=True)


if __name__ == "__main__":
    main()
