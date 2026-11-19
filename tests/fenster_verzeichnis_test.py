#!/usr/bin/env python3
"""Test für fenster_verzeichnis.py ohne Thunderbird: Einordnung, Abgleich mit dem Rundgang, Abdeckungszahl.

Baut ein kleines erfundenes omni.ja und eine Messung und prüft Art, Stand und Zahl „x von y“.
  python3 tests/fenster_verzeichnis_test.py      → eine Zeile OK/FEHLER je Prüfung, Exitcode 0 nur bei Erfolg
"""
import os
import sys
import tempfile
import zipfile

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import fenster_verzeichnis as fv  # noqa: E402

fehler = 0


def check(name, ok, info=""):
    global fehler
    print(("OK      " if ok else "FEHLER  ") + name + ("" if ok else f" – {info}"))
    fehler += 0 if ok else 1


with tempfile.TemporaryDirectory() as t:
    omni = os.path.join(t, "omni.ja")
    with zipfile.ZipFile(omni, "w") as z:
        z.writestr("chrome/messenger/content/messenger/preferences/fonts.xhtml", "<window><dialog id='x'>")
        z.writestr("chrome/messenger/content/messenger/am-server.xhtml", "<html><body>")
        z.writestr("chrome/messenger/content/messenger/aboutDialog.xhtml", "<window windowtype='x'>")
        z.writestr("chrome/calendar/content/calendar-summary-dialog.xhtml", "<window>")
        z.writestr("chrome/pippki/content/pippki/certViewer.xhtml", "<dialog>")
        z.writestr("chrome/devtools/content/framework/toolbox.xhtml", "<window>")
        z.writestr("chrome/messenger/skin/classic/messenger/messages/mail/Footer.html", "<html>")
    doks = fv.dokumente(omni)
    arten = dict(doks)
    check("Dokumente ohne devtools und skin", len(doks) == 5, str(doks))
    check("Einordnung dialog/fenster/seite",
          arten.get("chrome/messenger/content/messenger/preferences/fonts.xhtml") == "dialog"
          and arten.get("chrome/messenger/content/messenger/aboutDialog.xhtml") == "fenster"
          and arten.get("chrome/messenger/content/messenger/am-server.xhtml") == "seite", str(arten))
    mess = [{"einst-dlg-schriften": {"url": "chrome://messenger/content/preferences/fonts.xhtml", "sub": "fonts.xhtml"},
             "konto-server": {"url": "about:accountsettings", "page": "chrome://messenger/content/am-server.xhtml"},
             "dlg-blank": {"url": "about:blank", "sub": "about:blank"}}]
    abg = fv.abgedeckt('const x = winUrl("calendar-summary-dialog");', mess)
    text, (x, y) = fv.verzeichnis(doks, abg, {"einst-dlg-schriften": "halo", "konto-server": "teilweise"})
    check("Unterdialog, Kontoseite und winUrl zählen als abgedeckt", (x, y) == (3, 5), f"{x} von {y}")
    check("Zahl im Kopf", "Abgedeckt: 3 von 5 Dokumenten" in text, text[:200])
    check("Zustand aus dem Rundgang", "| halo |" in text and "| teilweise |" in text)
    check("nicht erreichbar mit Grund", "certViewer.xhtml | dialog | nicht erreichbar |" in text and "Serverzertifikat" in text)
    check("fehlendes Dokument als fehlt", "aboutDialog.xhtml | fenster | fehlt |" in text)
    check("macOS-Fenster getrennt", "## Fenster, die macOS selbst zeichnet" in text)

sys.exit(1 if fehler else 0)
