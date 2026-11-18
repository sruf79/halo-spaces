#!/usr/bin/env python3
"""Test für rundgang_vergleich.py ohne Thunderbird: Popup-Rundung je nach Art.

Baut zwei kleine Rundgang-Ordner aus erfundenen Messwerten und prüft, dass Popover (20 px) und Datumswahl
(6 px) keine Ausreißer sind, Abweichungen vom Soll der Art aber schon – auch wenn die Art nur in
ui_tour.py steht (ältere Ergebnisse) und wenn der falsche Wert der häufigste ist.
  python3 tests/rundgang_vergleich_test.py      → eine Zeile OK/FEHLER je Prüfung, Exitcode 0 nur bei Erfolg
"""
import json
import os
import subprocess
import sys
import tempfile

HIER = os.path.dirname(os.path.abspath(__file__))
fehler = 0


def check(name, ok, info=""):
    global fehler
    print(("OK      " if ok else "FEHLER  ") + name + ("" if ok else f" – {info}"))
    fehler += 0 if ok else 1


def popup(tag, radius):
    return {"kind": "popup", "popup": {"tag": tag, "radius": radius, "bg": "rgb(1, 2, 3)"}}


def rundgang(ordner, flaechen):
    """flaechen: [(id, art oder None, tag, radius)] → hell-ergebnis.json und hell-messung.json"""
    os.makedirs(ordner)
    erg, mess = [], {}
    for sid, art, tag, radius in flaechen:
        e = {"id": sid, "area": "kalender", "kind": "popup", "title": sid, "ok": True}
        if art:
            e["art"] = art
        erg.append(e)
        mess[sid] = popup(tag, radius)
    json.dump(erg, open(os.path.join(ordner, "hell-ergebnis.json"), "w"))
    json.dump(mess, open(os.path.join(ordner, "hell-messung.json"), "w"))


def auswerten(ordner):
    r = subprocess.run([sys.executable, "-I", os.path.join(HIER, "rundgang_vergleich.py"), ordner],
                       capture_output=True, text=True)
    if r.returncode:
        raise RuntimeError(r.stderr[-800:])
    return json.load(open(os.path.join(ordner, "vergleich.json"), encoding="utf-8"))


def radius_aus(v):
    return {x["id"]: x for x in v["ausreisser"] if x["mass"] == "Radius"}


with tempfile.TemporaryDirectory() as tmp:
    # vorher: alte Messung mit Popover 20 px; ohne Art im Ergebnis, kal-schnellfenster steht in ui_tour.py als popover
    rundgang(os.path.join(tmp, "2026-11-01"), [
        ("menue-a", None, "menupopup", "12px"), ("menue-b", None, "menupopup", "12px"),
        ("kal-schnellfenster", None, "panel", "20px"),
    ])
    rundgang(os.path.join(tmp, "2026-11-08"), [
        ("menue-a", None, "menupopup", "12px"), ("menue-b", None, "menupopup", "12px"),
        ("menue-c", None, "menupopup", "12px"),
        ("kal-schnellfenster", None, "panel", "20px"),       # Art aus ui_tour.py
        ("kal-termin-datum", None, "panel", "6px"),          # Art aus ui_tour.py
        ("popover-neu", "popover", "panel", "20px"),
        ("popover-falsch", "popover", "panel", "12px"),
        ("datum-falsch", "datum", "panel", "12px"),
        ("tooltip-eckig", None, "tooltip", "0px"),
    ])
    v = auswerten(os.path.join(tmp, "2026-11-08"))
    r = radius_aus(v)
    check("Rundgang-Vergleich: Popover mit 20 px ist kein Ausreißer (Art im Ergebnis)", "popover-neu" not in r, r.get("popover-neu"))
    check("Rundgang-Vergleich: Popover mit 20 px ohne Art im Ergebnis (Art aus ui_tour.py)", "kal-schnellfenster" not in r,
          r.get("kal-schnellfenster"))
    check("Rundgang-Vergleich: Datumswahl mit 6 px ist kein Ausreißer (Art aus ui_tour.py)", "kal-termin-datum" not in r,
          r.get("kal-termin-datum"))
    check("Rundgang-Vergleich: Popover mit 12 px ist ein Ausreißer gegen 20 px",
          r.get("popover-falsch", {}).get("soll", "").startswith("20px"), r.get("popover-falsch"))
    check("Rundgang-Vergleich: Datumswahl mit 12 px ist ein Ausreißer gegen 6 px",
          r.get("datum-falsch", {}).get("soll", "").startswith("6px"), r.get("datum-falsch"))
    check("Rundgang-Vergleich: eckiger Tooltip (0 px) bleibt Ausreißer gegen 12 px",
          r.get("tooltip-eckig", {}).get("soll", "").startswith("12px"), r.get("tooltip-eckig"))
    check("Rundgang-Vergleich: Menüs mit 12 px sind keine Ausreißer", not {"menue-a", "menue-b", "menue-c"} & set(r), sorted(r))
    # in beiden Läufen gemessen sind nur menue-a/b und kal-schnellfenster, alle richtig gerundet
    check("Rundgang-Vergleich: gegen den vorigen Lauf kein neuer Radius-Ausreißer bei richtig gerundeten Popups",
          not [x for x in v["neu"] if " | Radius | " in x], v["neu"])
    md = open(os.path.join(tmp, "2026-11-08", "vergleich.md"), encoding="utf-8").read()
    check("Rundgang-Vergleich: vergleich.md nennt den Sollwert der Art", "datum-falsch = 12px (Soll 6px (Datumswahl)" in md,
          [z for z in md.splitlines() if "datum-falsch" in z])

    # falscher Wert als häufigster: drei Datumswahlen mit 12 px – der Modus würde sie nicht melden
    rundgang(os.path.join(tmp, "x", "2026-11-09"), [
        ("menue-a", None, "menupopup", "12px"),
        ("d1", "datum", "panel", "12px"), ("d2", "datum", "panel", "12px"), ("d3", "datum", "panel", "12px"),
    ])
    r = radius_aus(auswerten(os.path.join(tmp, "x", "2026-11-09")))
    check("Rundgang-Vergleich: Abweichung vom Soll auch dann, wenn sie der häufigste Wert ist", sorted(r) == ["d1", "d2", "d3"], sorted(r))

sys.exit(1 if fehler else 0)
