#!/usr/bin/env python3
"""Messung der Sprünge beim Ein-/Ausblenden der Seitenleiste über den Seitenleisten-Knopf (nur Messen, ändert nichts).

Je Bereich (Mail, Adressbuch, Kalender in der Monatsansicht, Aufgaben, Chat, Einstellungen), Fensterbreite, Today-Pane
an/aus und gewähltem Element (Kontakt, Aufgabe) wird mit jedem Bildwechsel die Lage aller Knöpfe und Trennlinien der
oberen Zeilen (Hauptfenster und eingebettetes Dokument), der Ampel-Platzhalter (.titlebar-buttonbox) und die
Fenstermaße aufgezeichnet. Gemeldet werden Elemente, die nach dem Ende der Bewegung noch springen (> 1 px), die während
der Bewegung ruckartig springen (Einzelschritt deutlich über dem der Seitenleiste) und Bildabstände > 20 ms.
Mit --shots wird je Vorgang vor und nach der Animation ein Bild des Fensters (screencapture -l) aufgenommen und die
Lage des roten Schließknopfs (Ampel, nativ) verglichen – nur macOS.
Aufruf (Port ab 2870; nicht, solange auf neon die CI läuft):
  python3 tests/sprung_messung.py --port 2870 [--bereiche Adressbuch,Aufgaben] [--breiten 1280,1500] [--shots] [--json ordner]
"""
import argparse, glob, json, os, shutil, struct, subprocess, sys, time, zipfile, zlib

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import halo_test as H  # noqa: E402

ROOT = H.ROOT

from sprung_lib import SAMPLER, messen, auswerten  # noqa: E402


# --- Ampel nativ: Fensterbild per screencapture, roter Schließknopf suchen ---
def png_rgba(path):
    with open(path, "rb") as f:
        data = f.read()
    assert data[:8] == b"\x89PNG\r\n\x1a\n"
    pos, idat, w, h, ct, bd = 8, b"", 0, 0, 0, 0
    while pos < len(data):
        ln, typ = struct.unpack(">I4s", data[pos:pos + 8])
        body = data[pos + 8:pos + 8 + ln]
        if typ == b"IHDR":
            w, h, bd, ct = struct.unpack(">IIBB", body[:10])
        elif typ == b"IDAT":
            idat += body
        pos += 12 + ln
    raw = zlib.decompress(idat)
    ch = {2: 3, 6: 4, 0: 1, 4: 2}[ct]
    assert bd == 8
    stride = w * ch
    rows, prev, p = [], bytearray(stride), 0
    for _ in range(h):
        ft = raw[p]; cur = bytearray(raw[p + 1:p + 1 + stride]); p += 1 + stride
        for i in range(stride):
            a = cur[i - ch] if i >= ch else 0
            b = prev[i]
            c = prev[i - ch] if i >= ch else 0
            if ft == 1: cur[i] = (cur[i] + a) & 255
            elif ft == 2: cur[i] = (cur[i] + b) & 255
            elif ft == 3: cur[i] = (cur[i] + ((a + b) >> 1)) & 255
            elif ft == 4:
                pa, pb, pc = abs(b - c), abs(a - c), abs(a + b - 2 * c)
                pr = a if pa <= pb and pa <= pc else (b if pb <= pc else c)
                cur[i] = (cur[i] + pr) & 255
        rows.append(bytes(cur)); prev = cur
    return w, h, ch, rows


def ampel_rot(path, region=(11, 2, 90, 40)):
    """Lage der Ampel im Fensterbild: linke Kante und Mitte der drei Knöpfe (auch grau, wenn das Fenster nicht vorn
    ist) im Bereich links oben – Pixel, die vom Hintergrund abweichen, spaltenweise; (x links, x Mitte, y Mitte) oder None."""
    w, h, ch, rows = png_rgba(path)
    x0, y0, x1, y1 = region
    from collections import Counter
    bg = Counter(rows[y][x * ch:x * ch + 3] for y in range(y0, min(y1, h)) for x in range(x0, min(x1, w))).most_common(1)[0][0]
    pts = [(x, y) for y in range(y0, min(y1, h)) for x in range(x0, min(x1, w)) if max(abs(rows[y][x * ch + i] - bg[i]) for i in range(3)) > 40]
    if len(pts) < 20:
        return None
    xs = [p[0] for p in pts]; ys = [p[1] for p in pts]
    return (min(xs), round(sum(xs) / len(xs), 1), round(sum(ys) / len(ys), 1))


def fenster_id(pid, lage):
    """Fenster-ID des Hauptfensters: Lage und Breite wie w.screenX/outerWidth (andere Fenster des Profils, z. B.
    „System settings“ oder die Spendenseite, haben andere Maße)."""
    try:
        sys.path.insert(0, os.path.join(ROOT, "tests"))
        import ui_tour
        wins = [x for x in ui_tour.windows_of(pid) if x["layer"] == 0 and abs(x["w"] - lage[2]) <= 2 and abs(x["x"] - lage[0]) <= 2]
        return wins[0]["id"] if wins else None
    except Exception:
        return None


def shot(wid, path):
    subprocess.run(["screencapture", "-x", "-o", "-l", str(wid), path], check=True, timeout=20)
    return path


BEREICHE = {
    "Mail": ("mail", "await toMail();"),
    "Adressbuch": ("addressbook", 'tm.openTab("addressBookTab", {}); await bis(() => tm.currentTabInfo?.browser?.contentDocument?.getElementById("booksSplitter")?.getBoundingClientRect().width > 0, "Adressbuch", 8000); await ruhig(2000);'),
    "Kalender": ("calendar", 'await toCalendar(); w.switchToView?.("month"); await ruhig(1500);'),
    "KalenderWoche": ("calendar", 'await toCalendar(); w.switchToView?.("week"); await ruhig(1500);'),
    "Aufgaben": ("tasks", 'tm.openTab("tasks", {}); await bis(() => tm.currentTabInfo?.mode?.name == "tasks" && d.getElementById("calSidebar")?.getBoundingClientRect().width > 0, "Aufgaben", 8000); await ruhig(1500);'),
    "Chat": ("chat", 'tm.openTab("chat", {}); await bis(() => tm.currentTabInfo?.mode?.name == "chat" && d.getElementById("listPaneBox")?.getBoundingClientRect().width > 0, "Chat", 8000); await ruhig(1500);'),
    "Einstellungen": ("settings", 'w.openPreferencesTab(); await bis(() => tm.currentTabInfo?.browser?.contentDocument?.getElementById("pref-category-box")?.getBoundingClientRect().width > 0, "Einstellungen", 8000); await ruhig(2000);'),
}

# Kontakt bzw. Aufgabe anlegen und wählen (wahl=1) oder abwählen
WAHL = {
    "addressbook": ('''const { MailServices } = ChromeUtils.importESModule("resource:///modules/MailServices.sys.mjs");
        const cw = tm.currentTabInfo.browser.contentWindow;
        if (!w.__sprCard) { const book = MailServices.ab.directories.find(b => !b.readOnly); const card = Cc["@mozilla.org/addressbook/cardproperty;1"].createInstance(Ci.nsIAbCard);
          card.displayName = "Halo Sprung"; card.primaryEmail = "sprung@example.invalid"; w.__sprCard = book.addCard(card); await ruhig(800); }
        cw.cardsPane.cardsList.selectedIndex = 0; await ruhig(1000);''',
                    'try { tm.currentTabInfo.browser.contentWindow.cardsPane.cardsList.selectedIndex = -1; } catch {} await ruhig(800);'),
    "tasks": ('''if (!w.__sprTodo) { const c = testCalendar(); const t = new (ChromeUtils.importESModule("resource:///modules/CalTodo.sys.mjs").CalTodo)(); t.title = "Halo Sprung"; w.__sprTodo = await c.addItem(t); await ruhig(1500); }
        const tree = d.getElementById("calendar-task-tree"); const n = tree?.view?.rowCount || tree?.mTreeView?.rowCount || 0; if (tree && n) { tree.view.selection.select(0); } else { const r = d.querySelector("#calendar-task-tree-detail, .mc-task-card, [mc-task-row]"); r?.click?.(); } await ruhig(1000);''',
              'try { d.getElementById("calendar-task-tree")?.view?.selection?.clearSelection(); } catch {} await ruhig(800);'),
}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--port", type=int, default=2870)
    ap.add_argument("--tb", default=H.DEFAULT_TB)
    ap.add_argument("--xpi")
    ap.add_argument("--bereiche", default="Mail,Adressbuch,Kalender,Aufgaben,Chat,Einstellungen")
    ap.add_argument("--breiten", default="1100,1280,1400,1500,1728,1900")
    ap.add_argument("--today", default="1,0", help="Today-Pane an (1) / aus (0), kommagetrennt")
    ap.add_argument("--wahl", default="0,1", help="Element gewählt (1) / nicht (0)")
    ap.add_argument("--wiederholungen", type=int, default=1)
    ap.add_argument("--shots", action="store_true")
    ap.add_argument("--json")
    ap.add_argument("--dark", action="store_true")
    ap.add_argument("--keep", action="store_true")
    ap.add_argument("--termine", type=int, default=0, help="so viele Termine im laufenden Monat anlegen (Monatsraster voll)")
    args = ap.parse_args()
    if not args.xpi:
        b = subprocess.run([os.path.join(ROOT, "build.sh")], capture_output=True, text=True, cwd=ROOT)
        if b.returncode:
            sys.exit("build.sh fehlgeschlagen:\n" + b.stderr)
    xpi = args.xpi or max((x for x in glob.glob(os.path.join(ROOT, "dist", "halo-spaces-*.xpi")) if not x.endswith("-atn.xpi")), key=os.path.getmtime)
    with zipfile.ZipFile(xpi) as zf:
        version = json.loads(zf.read("manifest.json"))["version"]
    H.faktisch_setzen(version)
    profile = H.create_profile(xpi, args.port, args.dark, prefix="halo-sprung-")
    print(f"halo.spaces {version} · Profil {profile}", flush=True)
    proc = H.start_thunderbird(args.tb, profile, None)
    alle = {}
    shotdir = args.json or os.path.join(ROOT, "tests", "shots", "sprung")
    try:
        if not H.wait_port(args.port):
            sys.exit("Thunderbird hat Marionette nicht geöffnet")
        time.sleep(8)
        m = H.Marionette(args.port)
        m.cmd("WebDriver:SetTimeouts", {"script": 120000})
        m.js("const s = w.screen; w.moveTo(s.availLeft, s.availTop); w.resizeTo(1500, 900); await wait(1200); return 1;")
        # Testkalender wie im Volllauf (für Aufgaben)
        m.js('''if (!testCalendar()) { const c = cal.manager.createCalendar("storage", Services.io.newURI("moz-storage-calendar://")); c.name = "Halo Test"; cal.manager.registerCalendar(c); await ruhig(1000); } return 1;''')
        if args.termine:
            # Termine über den Monat verteilt (bis zu 10 je Tag), damit das Monatsraster voll ist
            n = m.js(f'''const {{ CalEvent }} = ChromeUtils.importESModule("resource:///modules/CalEvent.sys.mjs");
                const c = testCalendar(); const now = cal.dtz.now(); let n = 0;
                for (let i = 0; i < {args.termine}; i++) {{ const e = new CalEvent(); e.title = "Halo Termin " + i;
                  const s = now.clone(); s.day = 1 + (i % 28); s.hour = 7 + (i % 11); s.minute = 0; s.second = 0;
                  const en = s.clone(); en.hour += 1; e.startDate = s; e.endDate = en; await c.addItem(e); n++; }}
                await ruhig(2000); return n;''')
            print(f"Termine angelegt: {n}", flush=True)
        info = m.js("return { hidden: d.hidden, occluded: w.windowUtils?.isOccluded ?? null, v: Services.appinfo.version, avail: [w.screen.availWidth, w.screen.availHeight] };")
        print(f"Fenster: {info}", flush=True)
        wid = fenster_id(proc.pid, m.js("return [w.screenX, w.screenY, w.outerWidth, w.outerHeight];")) if args.shots else None
        if args.shots:
            os.makedirs(shotdir, exist_ok=True)
            print(f"Fenster-ID für screencapture: {wid}", flush=True)
        for name in args.bereiche.split(","):
            modus, geh = BEREICHE[name]
            m.js(geh + " return 1;")
            # Maße der „+“-Knöpfe (Adressbuch: .mc-lh-plus; Kalender/Aufgaben: new-event) samt Symbol
            print("  Maße +:", m.js('''const R = e => { if (!e) return null; const r = e.getBoundingClientRect(); return [Math.round(r.width * 10) / 10, Math.round(r.height * 10) / 10]; };
                const ab = d.querySelector("#mcListHeader > .mc-lh-plus"); const ne = d.querySelector('#unifiedToolbarContent > li[item-id="new-event"]');
                const pb = ab && w.getComputedStyle(ab, "::before"); const ic = ne?.querySelector(".button-icon"); const bt = ne?.querySelector("button");
                const cs = ab && w.getComputedStyle(ab);
                return { abPlus: R(ab), abIcon: pb ? [pb.width, pb.height] : null, abBg: cs && cs.backgroundColor, abStyle: cs && [cs.width, cs.minWidth, cs.padding, cs.margin, cs.flex, cs.boxSizing, ab.textContent, ab.children.length], neLi: R(ne), neButton: R(bt), neIcon: R(ic), neBg: bt && w.getComputedStyle(bt).backgroundColor, neRadius: bt && w.getComputedStyle(bt).borderRadius };'''), flush=True)
            for breite in [int(x) for x in args.breiten.split(",")]:
                m.js(f"w.resizeTo({breite}, 900); await until(() => w.outerWidth == {breite}, 3000); await ruhig(1000); return 1;")
                for today in [int(x) for x in args.today.split(",")]:
                    if modus not in ("mail", "calendar", "tasks") and today == 1:
                        continue
                    # Today-Pane über den Knopf der Erweiterung auf den gewünschten Stand
                    m.js(f'''const tp = d.getElementById("today-pane-panel"); const offen = () => tp && !tp.collapsed && tp.getBoundingClientRect().width > 0;
                        if (!!{today} != offen()) {{ d.getElementById("mcTodayToggle")?.click(); await ruhig(1500); }} return 1;''')
                    for wahl in [int(x) for x in args.wahl.split(",")]:
                        if modus not in WAHL and wahl == 1:
                            continue
                        if modus in WAHL:
                            m.js(WAHL[modus][wahl] + " return 1;")
                        # Ausgangslage: Seitenleiste sichtbar
                        if m.js(SAMPLER + f'const k = w.__mcSpr.kern("{modus}"); return k ? Math.round(k.getBoundingClientRect().width) : -1;') <= 0:
                            m.js('d.getElementById("spacesPinnedButton").click(); await ruhig(1500); return 1;')
                        for wdh in range(args.wiederholungen):
                            for label in ("aus", "ein"):
                                key = f"{name} {breite} tp{today} wahl{wahl} {label}" + (f" #{wdh + 1}" if args.wiederholungen > 1 else "")
                                vor = nach = None
                                if wid:
                                    vor = ampel_rot(shot(wid, os.path.join(shotdir, key.replace(" ", "_") + "_vor.png")))
                                fr = messen(m, modus, 'd.getElementById("spacesPinnedButton").click();')
                                if wid:
                                    nach = ampel_rot(shot(wid, os.path.join(shotdir, key.replace(" ", "_") + "_nach.png")))
                                a = auswerten(fr)
                                if wid:
                                    a["ampel"] = [vor, nach]
                                alle[key] = a
                                if args.json:
                                    os.makedirs(args.json, exist_ok=True)
                                    with open(os.path.join(args.json, key.replace(" ", "_") + ".json"), "w") as f:
                                        json.dump(fr, f)
                                melde(key, a)
    finally:
        if args.json:
            os.makedirs(args.json, exist_ok=True)
            with open(os.path.join(args.json, "auswertung.json"), "w") as f:
                json.dump(alle, f, indent=1)
        H.stop_thunderbird(args.port, proc)
        if not args.keep:
            shutil.rmtree(profile, ignore_errors=True)


def melde(key, a):
    if "fehler" in a:
        print(f"{key:40s} KEINE MESSUNG: {a['fehler']} ({a['bilder']} Bilder)", flush=True)
        return
    n_ende, n_ruck = len(a["ende"]), len(a["ruck"])
    ampel = ""
    if a.get("ampel"):
        v, n = a["ampel"]
        if v and n:
            ampel = f", Ampel rot {v[0]},{v[1]} → {n[0]},{n[1]}" + (" SPRUNG" if abs(v[0] - n[0]) > 0.5 or abs(v[1] - n[1]) > 0.5 else "")
        else:
            ampel = f", Ampel nicht gefunden {a['ampel']}"
    print(f"{key:40s} {a['dauer_ms']:4d} ms, Breite {a['breite'][0]}→{a['breite'][1]}, {a['bilder']} Bilder, Bild max {a.get('bild_max')} mittel {a.get('bild_mittel')} ms, Lücken>20ms: {a['luecken']}, Ende-Sprünge: {n_ende}, Rucke: {n_ruck}"
          f"{', Fenster ' + str(a['win']) if a['win'] else ''}{ampel}", flush=True)
    for k, v in list(a["ende"].items())[:12]:
        print(f"      ENDE {k}: {v[:4]}", flush=True)
    for k, v in list(a["ruck"].items())[:12]:
        print(f"      RUCK {k}: {v}", flush=True)
    if a.get("win_wann"):
        print(f"      Fenster ändert sich bei Bild {a['win_wann'][:4]}", flush=True)


if __name__ == "__main__":
    main()
