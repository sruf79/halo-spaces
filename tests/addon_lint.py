#!/usr/bin/env python3
"""Mozillas Add-on-Prüfung (addons-linter, wie bei addons.thunderbird.net) auf extension/.

Rot nur bei Fehlern; erwartbar und ausgenommen ist, dass eine Experiment-API
(experiment_apis) als „privileged“ gilt – Thunderbird erlaubt sie, der
Linter kennt nur Firefox. Warnungen (z. B. Thunderbird-APIs, die der Linter
nicht kennt) werden nur ausgegeben. Braucht Node (npx); CI-Job „statisch“.

Aufruf:  python3 tests/addon_lint.py
"""
import json
import os
import subprocess
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
LINTER = "addons-linter@7.20.0"
# (Code, Pfad im Manifest) – erwartbare Fehler einer Thunderbird-Experiment-Erweiterung
ERWARTET = {("MANIFEST_FIELD_PRIVILEGED", "/experiment_apis")}


def main():
    out = subprocess.run(["npx", "--yes", LINTER, "--output", "json", "--self-hosted", os.path.join(ROOT, "extension")],
                         capture_output=True, text=True)
    try:
        res = json.loads(out.stdout)
    except ValueError:
        print("FEHLER  addons-linter lieferte kein Ergebnis:", (out.stderr or out.stdout)[-800:])
        return 1
    fehler = 0
    for m in res.get("errors", []):
        erwartet = (m.get("code"), m.get("dataPath") or m.get("instancePath")) in ERWARTET or \
            (m.get("code") == "MANIFEST_FIELD_PRIVILEGED" and "/experiment_apis" in m.get("message", ""))
        print(f"{'erwartet' if erwartet else 'FEHLER  '}  {m.get('code')} {m.get('file') or ''}:{m.get('line') or ''} {m.get('message', '')[:160]}")
        fehler += not erwartet
    for m in res.get("warnings", []):
        print(f"Warnung   {m.get('code')} {m.get('file') or ''}:{m.get('line') or ''} {m.get('message', '')[:160]}")
    print(f"{LINTER}: {fehler} Fehler (ohne erwartete), {len(res.get('warnings', []))} Warnungen")
    return 1 if fehler else 0


if __name__ == "__main__":
    sys.exit(main())
