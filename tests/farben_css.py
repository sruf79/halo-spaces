#!/usr/bin/env python3
"""Farbänderungen in Stilblättern erkennen (für tests/farben-betroffen.sh).

Aufruf: farben_css.py <basis> <ziel> <datei.css>…  Gibt die erste geänderte
Zeile mit Farbbezug aus (Datei: Zeile) bzw. nichts, wenn sich nur Maße,
Abstände, Schrift oder Anzeige geändert haben. Exitcode ≠ 0 bei Fehlern (dann
wertet das Skript „betroffen“).

Farbbezug: Farbwerte und -funktionen, Systemfarben, Eigenschaften, die Farbe
tragen (color, background, border, outline, fill, stroke, shadow, filter,
opacity, mask, image …), Dunkel-Blöcke und --mt-Variablen außer reinen
Maß-Variablen. Ein geänderter Selektor oder eine Klammerzeile zählt, wenn der
umgebende Block im Ziel- oder Basisstand Farbe setzt.
"""
import re
import subprocess
import sys

FARBE = re.compile(
    r"(rgba?|hsla?|hwb|lab|lch|oklab|oklch|color-mix|light-dark|color)\s*\("
    r"|#[0-9a-fA-F]{3,8}\b"
    r"|\b(color|background|border(?!-radius|-width|-spacing|-collapse)|outline(?!-offset|-width)|fill|stroke|"
    r"box-shadow|text-shadow|shadow|filter|backdrop-filter|opacity|mask|mix-blend-mode|list-style-image|"
    r"(?<![-\w])image(?![-\w])|gradient\(|appearance|caret|accent-color|scrollbar-color|-moz-context-properties|"
    r"color-scheme|forced-color-adjust)\b"
    r"|prefers-color-scheme|prefers-contrast|\[lwt-|lwtheme|:-moz-lwtheme|dark|dunkel|light|hell"
    r"|\b(AccentColor|AccentColorText|Canvas|CanvasText|Highlight|HighlightText|SelectedItem|SelectedItemText|"
    r"ButtonFace|ButtonText|ButtonBorder|GrayText|Field|FieldText|LinkText|Mark|MarkText|-moz-[A-Za-z]+Color|transparent|currentColor)\b",
    re.I)
MASS = re.compile(r"^(.*-)?(radius|font|gap|pad|padding|size|height|width|space|spacing|inset|margin|dur|duration|ease|z|"
                  r"line|weight|offset|top|left|right|bottom|start|end|head|edge|indent|w|h|x|y|cols?|rows?|step|speed|delay|scale)(-.*)?$")
VAR = re.compile(r"--mt-([A-Za-z0-9-]+)")


def farbig(text):
    t = re.sub(r"/\*.*?\*/", "", text)
    if FARBE.search(t):
        return True
    return any(not MASS.match(v) for v in VAR.findall(t))


def datei(ref, pfad):
    """Zeilen der Datei im Stand ref, Kommentare entfernt (auch über mehrere Zeilen)."""
    r = subprocess.run(["git", "show", f"{ref}:{pfad}"], capture_output=True, text=True)
    if r.returncode != 0:
        return []
    out, rein = [], False
    for z in r.stdout.split("\n"):
        code, i = "", 0
        while i < len(z):
            if rein:
                j = z.find("*/", i)
                if j < 0:
                    i = len(z)
                else:
                    rein, i = False, j + 2
            else:
                j = z.find("/*", i)
                if j < 0:
                    code += z[i:]
                    i = len(z)
                else:
                    code += z[i:j]
                    rein, i = True, j + 2
        out.append(code)
    return out


def block(zeilen, i):
    """Text des Blocks um Zeile i (0-basiert): von der letzten „{“ davor bis zur passenden „}“."""
    if not zeilen:
        return ""
    i = max(0, min(i, len(zeilen) - 1))
    a = i
    while a > 0 and "{" not in zeilen[a] and "}" not in zeilen[a - 1]:
        a -= 1
    b, tiefe = a, 0
    while b < len(zeilen):
        tiefe += zeilen[b].count("{") - zeilen[b].count("}")
        if tiefe <= 0 and b >= i and "}" in zeilen[b]:
            break
        b += 1
    return "\n".join(zeilen[a:b + 1])


def main():
    basis, ziel, *dateien = sys.argv[1:]
    for pfad in dateien:
        diff = subprocess.run(["git", "diff", "-U0", basis, ziel, "--", pfad], capture_output=True, text=True, check=True).stdout
        alt, neu = datei(basis, pfad), datei(ziel, pfad)
        a_nr = n_nr = 0
        for z in diff.split("\n"):
            m = re.match(r"@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@", z)
            if m:
                a_nr, n_nr = int(m.group(1)), int(m.group(2))
                continue
            if not z or z[0] not in "+-" or z.startswith(("+++", "---")):
                continue
            seite = z[0]
            zeilen = neu if seite == "+" else alt
            nr = n_nr if seite == "+" else a_nr
            if seite == "+":
                n_nr += 1
            else:
                a_nr += 1
            # nur der Code der Zeile zählt; Kommentare und Leerzeilen ändern nichts am Aussehen
            s = (zeilen[nr - 1] if 0 < nr <= len(zeilen) else z[1:]).strip()
            if not s:
                continue
            if farbig(s):
                print(f"{pfad}: {s[:100]}")
                return
            # Selektor oder Klammer geändert: Farbe im umgebenden Block?
            eigenschaft = re.match(r"^-?-?[A-Za-z-]+\s*:\s", s) or s.endswith(";") or (":" not in s and "(" in s)
            if "{" in s or "}" in s or not eigenschaft:
                if farbig(block(zeilen, nr - 1)):
                    print(f"{pfad}: {s[:100]} (Block mit Farbe)")
                    return


if __name__ == "__main__":
    main()
