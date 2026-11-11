#!/bin/zsh
# Hook gegen Bearbeiten erzeugter Dateien (PreToolUse für die Werkzeuge Edit und Write, Ergänzung zu
# Stufe 6, Freigabe des Maintainers 11.11.2026). Eingetragen in ~/.claude/settings.json, Kopie unter
# ~/.config/halo-spaces/erzeugt-hook.sh. Sperrt nur Edit/Write, nie Bash: build.sh und release.sh
# erzeugen diese Dateien weiter selbst.
# Gesperrt (Exitcode 2, Meldung auf stderr):
#   extension/theme.css    Kopie von chrome/userChrome.css durch build.sh
#   dist/**                Bauergebnisse (nur in einem Ordner mit build.sh, also einem halo-spaces-Stand)
#   *.xpi                  Pakete
# Nicht abdeckbar: der Bereiche-Block in chrome/userChrome.css (wird aus chrome/spaces.css erzeugt);
# die Meldung weist darauf hin.
# Fail open: bei jedem Fehler Exitcode 0. Ausnahme: Datei ~/halo-nacht/SPERRE_AUS (wie Zeitfenster-Hook).
# Eingabe: Hook-JSON auf stdin (tool_input.file_path). Für Tests: HALO_SPERRE_AUS=<Datei>.
[[ -e ${HALO_SPERRE_AUS:-$HOME/halo-nacht/SPERRE_AUS} ]] && exit 0
EIN=$(cat 2>/dev/null) || exit 0
[[ -n $EIN ]] || exit 0
if command -v jq >/dev/null 2>&1; then
  P=$(print -r -- "$EIN" | jq -r '.tool_input.file_path // empty' 2>/dev/null) || exit 0
elif command -v python3 >/dev/null 2>&1; then
  P=$(print -r -- "$EIN" | python3 -I -c 'import sys,json; print(json.load(sys.stdin).get("tool_input",{}).get("file_path",""))' 2>/dev/null) || exit 0
else
  exit 0
fi
[[ -n $P ]] || exit 0
P=${P:a} 2>/dev/null || exit 0

sperre() {
  print -u2 "Erzeugt-Hook: $P ist eine erzeugte Datei ($1).
Quelle bearbeiten: chrome/userChrome.css bzw. chrome/spaces.css (Kalender, Aufgaben, Adressbuch, Chat,
Einstellungen; auch der Bereiche-Block in userChrome.css wird aus spaces.css erzeugt), dann ./build.sh."
  exit 2
}
case $P in
  */extension/theme.css) [[ -e ${P%/extension/theme.css}/build.sh ]] && sperre "Kopie von chrome/userChrome.css durch build.sh" ;;
  *.xpi) sperre "Paket aus build.sh" ;;
esac
# dist/** nur in einem Stand mit build.sh daneben
local d=${P:h}
while [[ $d != / && -n $d ]]; do
  if [[ ${d:t} == dist && -e ${d:h}/build.sh ]]; then sperre "Bauergebnis in dist/"; fi
  d=${d:h}
done
exit 0
