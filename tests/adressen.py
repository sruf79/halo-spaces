#!/usr/bin/env python3
"""Datenschutz-Prüfung: Welche Adressen im Netz spricht halo.spaces an?

Sammelt alle http(s)-Adressen aus dem Paket (extension/, ohne die
mitgelieferte PST-Bibliothek in extension/vendor/, deren Adressen nur in
Kommentaren stehen) und aus chrome/*.css und vergleicht ihre Rechner mit der
Erlaubt-Liste unten. Eine neue Adresse ohne Eintrag macht die Prüfung rot –
so bleibt überprüfbar, was README und store/privacy-en.md versprechen.
Läuft ohne Thunderbird (CI-Job „statisch“).

Aufruf:  python3 tests/adressen.py        Exitcode 0 = nur erlaubte Adressen
"""
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# Rechner → wofür. ${…} steht für einen zur Laufzeit eingesetzten Rechner.
ERLAUBT = {
    "www.w3.org": "nur XML-Namensräume, keine Verbindung",
    "github.com": "Releases (Download der Updates), Links auf das Repo",
    "raw.githubusercontent.com": "updates.json (update_url im Manifest)",
    "api.open-meteo.com": "Wetter in der Today-Pane (nur mit Ort, Einstellung „Weather“)",
    "geocoding-api.open-meteo.com": "Ortssuche fürs Wetter",
    "support.mozilla.org": "Link „Keyboard Shortcuts“ im Menü Help",
    "buymeacoffee.com": "Link „Say Thanks“ (Spendenseite)",
    "${org}": "Absender-Logos: Domain des Absenders (Einstellung „Logos from sender websites“)",
    "www.${org}": "Absender-Logos: dieselbe Domain mit www.",
}

DATEIEN = (".js", ".mjs", ".html", ".json", ".css", ".xhtml")
ADRESSE = re.compile(r"https?://(\$\{[^}]+\}|www\.\$\{[^}]+\}|[A-Za-z0-9.-]+)")


def dateien():
    for top in ("extension", "chrome"):
        for dirpath, dirnames, files in os.walk(os.path.join(ROOT, top)):
            dirnames[:] = [d for d in dirnames if d != "vendor"]
            for f in files:
                # theme.css ist eine Kopie von chrome/userChrome.css (build.sh)
                if f.endswith(DATEIEN) and f != "theme.css":
                    yield os.path.join(dirpath, f)


def main():
    gefunden = {}
    for path in dateien():
        with open(path, encoding="utf-8", errors="replace") as fh:
            for nr, zeile in enumerate(fh, 1):
                for m in ADRESSE.finditer(zeile):
                    host = m.group(1).rstrip(".")
                    gefunden.setdefault(host, []).append(f"{os.path.relpath(path, ROOT)}:{nr}")
    fremd = {h: orte for h, orte in gefunden.items() if h not in ERLAUBT}
    for host in sorted(gefunden):
        print(f"{'OK    ' if host in ERLAUBT else 'FEHLER'}  {host} ({len(gefunden[host])}×){'' if host in ERLAUBT else ' – nicht in der Erlaubt-Liste: ' + ', '.join(gefunden[host][:5])}")
    unbenutzt = sorted(set(ERLAUBT) - set(gefunden))
    if unbenutzt:
        print("Hinweis: nicht mehr verwendet (aus der Liste nehmen): " + ", ".join(unbenutzt))
    if fremd:
        print(f"{len(fremd)} Adresse(n) ohne Eintrag – in tests/adressen.py (ERLAUBT) mit Zweck eintragen "
              "und README/store/privacy-en.md prüfen, oder entfernen")
        return 1
    print(f"Nur erlaubte Adressen ({len(gefunden)} Rechner)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
