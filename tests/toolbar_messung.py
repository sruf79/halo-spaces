#!/usr/bin/env python3
"""Toolbar und Today-Pane beim stetigen Verkleinern und Vergrößern des Fensters (Nachbildung des Ziehens mit der Maus:
viele kleine Größenänderungen hintereinander): je Schritt Breite von Abstandhaltern, Suchfeld, Pillen (sichtbar/
ausgeblendet), Überlauf-Knopf „»“, Today-Pane. Ausgabe: Richtungswechsel (Suchfeld wird beim Verkleinern wieder breiter,
Pille kommt zurück, Today-Pane wird wieder breiter) je Bereich, mit und ohne Seitenleiste.

  python3 tests/toolbar_messung.py --port 2870 --bereiche Mail,Adressbuch,Kalender,Aufgaben --von 2000 --bis 700 --schritt 10
"""
import argparse
import glob
import json
import os
import shutil
import subprocess
import sys
import time
import zipfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "tests"))
import halo_test as H  # noqa: E402

BEREICHE = {
    "Mail": "await toMail();",
    "Adressbuch": 'tm.openTab("addressBookTab", {}); await bis(() => tm.currentTabInfo?.browser?.contentDocument?.getElementById("booksSplitter")?.getBoundingClientRect().width > 0, "Adressbuch", 8000); await ruhig(1500);',
    "Kalender": 'await toCalendar(); w.switchToView?.("month"); await ruhig(1500);',
    "Aufgaben": 'tm.openTab("tasks", {}); await bis(() => tm.currentTabInfo?.mode?.name == "tasks" && d.getElementById("calSidebar")?.getBoundingClientRect().width > 0, "Aufgaben", 8000); await ruhig(1500);',
}

from toolbar_lib import MESS, auswerten  # noqa: E402



def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--port", type=int, default=2870)
    ap.add_argument("--tb", default=H.DEFAULT_TB)
    ap.add_argument("--xpi")
    ap.add_argument("--bereiche", default="Mail,Adressbuch,Kalender,Aufgaben")
    ap.add_argument("--von", type=int, default=2000)
    ap.add_argument("--bis", type=int, default=700)
    ap.add_argument("--schritt", type=int, default=10)
    ap.add_argument("--pause", type=int, default=40, help="ms zwischen zwei Größenänderungen (Ziehen)")
    ap.add_argument("--seitenleiste", default="1,0")
    ap.add_argument("--today", default="1", help="Today-Pane an (1) / aus (0) in Kalender und Aufgaben")
    ap.add_argument("--json")
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
    profile = H.create_profile(xpi, args.port, args.dark, prefix="halo-toolbar-")
    print(f"halo.spaces {version} · Profil {profile}", flush=True)
    proc = H.start_thunderbird(args.tb, profile, None)
    alle = {}
    try:
        if not H.wait_port(args.port):
            sys.exit("Thunderbird hat Marionette nicht geöffnet")
        time.sleep(8)
        m = H.Marionette(args.port)
        m.cmd("WebDriver:SetTimeouts", {"script": 300000})
        m.js("const s = w.screen; w.moveTo(s.availLeft, s.availTop); w.resizeTo(1500, 900); await wait(1200); return 1;")
        m.js('''if (!testCalendar()) { const c = cal.manager.createCalendar("storage", Services.io.newURI("moz-storage-calendar://")); c.name = "Halo Test"; cal.manager.registerCalendar(c); await ruhig(1000); } return 1;''')
        breiten = list(range(args.von, args.bis - 1, -args.schritt))
        for name in args.bereiche.split(","):
            # Ausgangslage je Bereich: 1500 px, Seitenleiste sichtbar
            m.js('w.resizeTo(1500, 900); await ruhig(800); if (w.gSpacesToolbar.isHidden) { d.getElementById("spacesPinnedButton").click(); await ruhig(1500); } return 1;')
            m.js(BEREICHE[name] + " return 1;")
            for today in [int(x) for x in args.today.split(",")]:
                if name not in ("Kalender", "Aufgaben") and today == 0:
                    continue
                if name in ("Kalender", "Aufgaben"):
                    m.js(f'''const offen = () => !!w.TodayPane?.isVisible && d.getElementById("today-pane-panel")?.getBoundingClientRect().width > 0;
                        if (!!{today} != offen()) {{ d.getElementById("mcTodayToggle")?.click(); await ruhig(1500); }} return 1;''')
                for seite in [int(x) for x in args.seitenleiste.split(",")]:
                    m.js(f'w.resizeTo({args.von}, 900); await until(() => w.outerWidth == {args.von}, 3000); await ruhig(1000); return 1;')
                    m.js(f'if (w.gSpacesToolbar.isHidden == !!{seite}) {{ d.getElementById("spacesPinnedButton").click(); await ruhig(1500); }} return 1;')
                    for richtung, folge in (("kleiner", breiten), ("groesser", list(reversed(breiten)))):
                        key = f"{name} tp{today} sl{seite} {richtung}"
                        daten = m.js(MESS + f'''const out = []; let stop = false; const bilder = [];
                            const loop = () => {{ bilder.push(w.__mcTb.mess()); if (!stop) w.requestAnimationFrame(loop); }}; w.requestAnimationFrame(loop);
                            for (const b of {json.dumps(folge)}) {{ w.resizeTo(b, 900); await wait({args.pause});
                            await new Promise(r => w.requestAnimationFrame(() => w.requestAnimationFrame(r))); out.push(w.__mcTb.mess()); }}
                            await ruhig(800); stop = true; await wait(50); out.push(Object.assign(w.__mcTb.mess(), {{ ruhe: 1 }})); return [out, bilder];''')
                        daten, bilder = daten
                        alle[key] = daten
                        alle[key + " bilder"] = bilder
                        melde(key, daten, richtung)
                        melde_bilder(key, bilder)
    finally:
        if args.json:
            os.makedirs(args.json, exist_ok=True)
            with open(os.path.join(args.json, "toolbar.json"), "w") as f:
                json.dump(alle, f, indent=1)
        H.stop_thunderbird(args.port, proc)
        if not args.keep:
            shutil.rmtree(profile, ignore_errors=True)




def melde(key, daten, richtung):
    a = auswerten(daten, richtung)
    s = [x["search"] for x in daten]
    tp = [x["tp"] for x in daten]
    print(f"{key:34s} {len(daten)} Schritte, Suchfeld {s[0]}→{s[-1]} (min {min(x for x in s if x is not None) if any(x is not None for x in s) else None}), "
          f"Today-Pane {tp[0]}→{tp[-1]}; Rückwärts: Suche {len(a['suche'])}, Pillen {len(a['pillen'])}, Today {len(a['today'])}, nach Lupe wieder breiter {len(a['lupe'])}, Fenster {len(a['fenster'])}", flush=True)
    for k in ("suche", "pillen", "today", "lupe"):
        for x in a[k][:6]:
            print(f"      {k.upper()} {x}", flush=True)


def melde_bilder(key, bilder):
    """Je Bild (rAF) während des Ziehens: Hin und Her der Today-Pane und des Suchfelds innerhalb der Folge (Zucken)."""
    wechsel = {"tp": 0, "tpLeft": 0, "search": 0}
    beispiele = []
    for feld in wechsel:
        serie = [(b["w"], b[feld]) for b in bilder if b.get(feld) is not None]
        richtung = 0
        for (w0, a), (w1, b) in zip(serie, serie[1:]):
            d = b - a
            if abs(d) < 0.5:
                continue
            r = 1 if d > 0 else -1
            if richtung and r != richtung:
                wechsel[feld] += 1
                if len(beispiele) < 6:
                    beispiele.append((feld, w0, w1, a, b))
            richtung = r
    print(f"      je Bild ({len(bilder)} Bilder): Richtungswechsel Today-Breite {wechsel['tp']}, Today-Lage {wechsel['tpLeft']}, Suchfeld {wechsel['search']}" +
          (f"; z. B. {beispiele}" if beispiele else ""), flush=True)


if __name__ == "__main__":
    main()
