#!/bin/bash
# Betrifft eine Änderung Farben? Nur dann läuft der Test zusätzlich im
# Dunkelmodus (CI-Job mac und release.sh; Entscheidung des Maintainers vom
# 4.11.2026). Im Zweifel gilt „betroffen“.
#   tests/farben-betroffen.sh <basis> [<ziel>]     Standard-Ziel: HEAD
# Basis: zuletzt dunkel getesteter Stand (CI) bzw. letztes Release (release.sh).
# Exitcode 0: Farben betroffen (dunkel testen), 1: nicht betroffen (nur hell).
set -u
cd "$(dirname "$0")/.."
BASE=${1:-}
ZIEL=${2:-HEAD}
if [ -z "$BASE" ] || ! git cat-file -e "$BASE^{commit}" 2>/dev/null; then
  echo "Farben betroffen: kein dunkel getesteter Stand bekannt"
  exit 0
fi
# Stilblätter und Symbole
DATEI=$(git diff --name-only "$BASE" "$ZIEL" | grep -E '\.css$|\.svg$|^extension/icons/' | head -1)
if [ -n "$DATEI" ]; then
  echo "Farben betroffen: $DATEI"
  exit 0
fi
# Farbwerte im Code (Erweiterung samt Einstellungs- und Info-Seite) und
# Prüfungen, die Farben oder den Dunkelmodus messen
ZEILE=$(git diff -U0 "$BASE" "$ZIEL" -- extension tests/halo_test.py | grep -E '^[+-][^+-]' |
  grep -iE -- '--mt-|rgba?\(|#[0-9a-f]{3,8}\b|color|prefers-color-scheme|dark|dunkel' | head -1)
if [ -n "$ZEILE" ]; then
  echo "Farben betroffen: $(echo "$ZEILE" | cut -c1-120)"
  exit 0
fi
# ausdrücklich verlangt
if git log --format=%B "$BASE..$ZIEL" 2>/dev/null | grep -qF '[dunkel]'; then
  echo "Farben betroffen: [dunkel] in einer Commit-Nachricht"
  exit 0
fi
echo "Farben nicht betroffen: nur hell"
exit 1
