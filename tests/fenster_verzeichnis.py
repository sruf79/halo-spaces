#!/usr/bin/env python3
"""Gesamtverzeichnis aller Fenster, Dialoge und Seiten von Thunderbird und Abgleich mit dem Rundgang.

Liest die Dokumente (.xhtml/.html) aus Thunderbirds Programmpaket (omni.ja, nur lesen), ordnet sie als
Dialog, Fenster oder Seite ein und zählt, welche der Design-Rundgang (tests/ui_tour.py) erreicht:
Adressen aus der Messung eines Rundgangs (<ordner>/<hell|dunkel>-messung.json) und Dateinamen, die
ui_tour.py selbst nennt. Je Dokument steht der Zustand aus dem Rundgang (halo / teilweise / original).
Fenster, die macOS selbst zeichnet (Sichern, Drucken …), stehen getrennt; was im Testprofil nicht
erreichbar ist, steht mit Grund in NICHT_ERREICHBAR.

  python3 tests/fenster_verzeichnis.py [--tb /Applications/Thunderbird.app] [--rundgang <ordner>] [--aus <datei.md>]

Ohne --aus geht die Liste auf die Standardausgabe. Bilder und Ergebnisse nie ins Repo (AGENTS.md
Datenschutz): die Liste gehört nach ~/halo-aufgaben/.
"""
import argparse
import glob
import json
import os
import re
import sys
import zipfile

HIER = os.path.dirname(os.path.abspath(__file__))

# Ordner im Paket, die keine Oberfläche von Thunderbird mit halo.spaces sind
AUSGENOMMEN = ("chrome/devtools/", "/skin/", "/test/", "/tests/", "neterror/supportpages/")

# about:-Adressen aus der Messung → Dokument im Paket (Dateiname ohne Endung, klein)
ABOUT = {
    "about:3pane": "about3pane", "about:message": "aboutmessage", "mailbox": "aboutmessage",
    "about:addressbook": "aboutaddressbook", "about:accountsettings": "accountmanager",
    "about:preferences": "preferences", "about:addons": "aboutaddons", "about:import": "aboutimport",
    "about:support": "aboutsupport", "about:config": "config", "about:downloads": "aboutdownloads",
}

# Fenster, die macOS selbst zeichnet – stehen nicht im Quelltext, halo.spaces kann sie nicht gestalten
MACOS = [
    ("Sichern unter / Öffnen (Dateiauswahl)", "Anhang speichern, Datei anhängen, Import/Export"),
    ("Drucken (Systemdialog)", "„Drucken über das System“ aus der Druckvorschau"),
    ("Farben (Farbfenster des Systems)", "Farbwahl in Einstellungen und Kalender-Eigenschaften"),
    ("Schriften (Schriftfenster des Systems)", "nur über Systemdienste"),
    ("Mitteilungen (Benachrichtigungen)", "neue Mail, Erinnerungen"),
    ("Schlüsselbund / Passwortabfrage des Systems", "Hauptpasswort über das System, Zertifikate"),
    ("Teilen-Menü", "Menü „Teilen“ von macOS"),
]

# Im Testprofil nicht erreichbar, mit Grund (Dateiname ohne Endung, klein)
NICHT_ERREICHBAR = {
    "updates": "braucht ein angebotenes Update vom Update-Server",
    "profileselection": "Profilverwaltung erscheint nur vor dem Start von Thunderbird",
    "profiledowngrade": "nur beim Start mit einem neueren Profil",
    "createprofilewizard": "Profilverwaltung vor dem Start",
    "certviewer": "braucht ein Serverzertifikat (echter Server)",
    "exceptiondialog": "braucht einen Server mit ungültigem Zertifikat",
    "clientauthask": "braucht einen Server, der ein Client-Zertifikat verlangt",
    "downloadcert": "braucht ein heruntergeladenes Zertifikat",
    "msgsendlistdialog": "Versandfortschritt braucht einen echten Postausgangsserver",
}


def dokumente(omni):
    """[(pfad, art)] aller Dokumente im Paket; art: dialog, fenster oder seite"""
    aus = []
    with zipfile.ZipFile(omni) as z:
        for n in z.namelist():
            if not re.search(r"/content/.*\.x?html$", n) or any(a in n for a in AUSGENOMMEN):
                continue
            text = z.read(n)[:6000].decode("utf-8", "replace")
            art = "dialog" if re.search(r"<dialog[\s>]", text) else \
                "fenster" if re.search(r"<window[\s>]|windowtype=", text) else "seite"
            aus.append((n, art))
    return sorted(aus)


def stamm(pfad):
    return re.sub(r"\.x?html$", "", pfad.rsplit("/", 1)[-1].split("?")[0].split("#")[0]).lower()


def abgedeckt(tour_text, messungen):
    """{stamm: [ids]} – was der Rundgang erreicht (Messung) oder ui_tour.py beim Namen nennt"""
    aus = {}
    for m in messungen:
        for sid, v in m.items():
            for u in (v.get("url"), v.get("sub"), v.get("page")):
                if not u:
                    continue
                kopf = u.split("#")[0].split("?")[0]
                s = ABOUT.get(kopf) or ABOUT.get(kopf.split(":")[0]) or stamm(kopf)
                aus.setdefault(s, []).append(sid)
    for n in re.findall(r"([\w-]+)\.x?html", tour_text):
        aus.setdefault(n.lower(), []).append("ui_tour.py")
    for n in re.findall(r'winUrl\("([\w-]+)"', tour_text):
        aus.setdefault(n.lower(), []).append("ui_tour.py")
    return aus


def zustaende(ergebnisse):
    """{id: zustand} aus <hell|dunkel>-ergebnis.json"""
    z = {}
    for e in ergebnisse:
        for x in e:
            if x.get("zustand"):
                z.setdefault(x["id"], x["zustand"])
    return z


def verzeichnis(doks, abg, zust):
    """Markdown-Text mit Abdeckungszahl, Tabelle je Dokument, macOS-Fenstern und Nicht-Erreichbarem"""
    zeilen, zahl = [], {}
    for pfad, art in doks:
        s = stamm(pfad)
        ids = sorted(set(abg.get(s, [])))
        if ids:
            st = "abgedeckt"
        elif s in NICHT_ERREICHBAR:
            st = "nicht erreichbar"
        else:
            st = "fehlt"
        zs = sorted({zust[i] for i in ids if i in zust})
        zahl.setdefault(art, [0, 0])
        zahl[art][1] += 1
        zahl[art][0] += st == "abgedeckt"
        bem = ", ".join(i for i in ids if i != "ui_tour.py")[:80] or ("in ui_tour.py genannt" if ids else NICHT_ERREICHBAR.get(s, ""))
        zeilen.append(f"| {pfad.replace('chrome/', '', 1)} | {art} | {st} | {'/'.join(zs) or '–'} | {bem} |")
    gesamt = [sum(v[0] for v in zahl.values()), sum(v[1] for v in zahl.values())]
    kopf = [f"Abgedeckt: {gesamt[0]} von {gesamt[1]} Dokumenten (" +
            ", ".join(f"{a} {v[0]} von {v[1]}" for a, v in sorted(zahl.items())) + ")", "",
            "Art: dialog = eigenes Dialogfenster, fenster = eigenes Fenster, seite = Tab, Unterdialog oder Teil eines Fensters.",
            "Zustand aus dem Rundgang: halo, teilweise (halo mit Original-Resten), original.", "",
            "| Dokument | Art | Stand | Zustand | Rundgang / Grund |", "|---|---|---|---|---|"]
    mac = ["", "## Fenster, die macOS selbst zeichnet", "", "| Fenster | wo |", "|---|---|"] + \
        [f"| {a} | {b} |" for a, b in MACOS]
    return "\n".join(kopf + zeilen + mac) + "\n", gesamt


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--tb", default=os.environ.get("HALO_TB", "/Applications/Thunderbird.app"))
    ap.add_argument("--rundgang", action="append", default=[], help="Ordner eines Rundgangs (mehrfach möglich)")
    ap.add_argument("--aus")
    a = ap.parse_args()
    omni = next((p for p in (os.path.join(a.tb, "Contents/Resources/omni.ja"), os.path.join(a.tb, "omni.ja"))
                 if os.path.exists(p)), None)
    if not omni:
        sys.exit(f"FEHLER kein omni.ja unter {a.tb}")
    mess, erg = [], []
    for o in a.rundgang:
        mess += [json.load(open(p)) for p in sorted(glob.glob(os.path.join(o, "*-messung.json")))]
        erg += [json.load(open(p)) for p in sorted(glob.glob(os.path.join(o, "*-ergebnis.json")))]
    text, (x, y) = verzeichnis(dokumente(omni), abgedeckt(open(os.path.join(HIER, "ui_tour.py")).read(), mess),
                               zustaende(erg))
    text = f"# Gesamtverzeichnis Fenster, Dialoge, Seiten\n\nThunderbird: {omni}; Rundgang: {', '.join(a.rundgang) or '–'}\n\n" + text
    if a.aus:
        open(a.aus, "w").write(text)
    else:
        sys.stdout.write(text)
    print(f"abgedeckt {x} von {y}", file=sys.stderr)


if __name__ == "__main__":
    main()
