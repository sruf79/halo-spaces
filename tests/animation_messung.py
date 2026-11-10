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

from animation_lib import SAMPLER, messen, auswerten  # noqa: E402


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
