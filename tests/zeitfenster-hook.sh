#!/bin/zsh
# Zeitfenster-Hook (PreToolUse für das Werkzeug Bash, Befund B7, 9.11.2026): setzt zwei Regeln aus AGENTS.md
# technisch durch. Noch nicht in ~/.claude/settings.json eingetragen (siehe docs/testrechner.md).
#  1. Push-Sperre: 01:30–09:00 (Wiener Zeit) kein `git push`; 00:00–01:30 nur, wenn
#     tests/ci-noetig.sh origin/main HEAD Exitcode 0 meldet (Codeänderung). Push von Tags allein und
#     `--delete` sind nicht gesperrt.
#  2. Kein Testlauf (halo_test.py, update_test.py, store_shots.py, ui_tour.py), solange Runner.Worker läuft.
# Ausnahmen: Umgebungsvariable HALO_LAUF gesetzt (Läufe der Routinen) oder Datei ~/halo-nacht/SPERRE_AUS.
# Fail open: bei jedem Fehler Exitcode 0 – der Hook darf den Nachtlauf nie blockieren.
# Eingabe: Hook-JSON auf stdin (tool_input.command). Sperre: Exitcode 2 und Meldung auf stderr.
# Für Tests: HALO_JETZT=HHMM, HALO_CI_NOETIG=ja|nein, HALO_RUNNER=ja|nein, HALO_SPERRE_AUS=<Datei>.
cd ${0:A:h:h} 2>/dev/null || exit 0
[[ -n ${HALO_LAUF:-} ]] && exit 0
[[ -e ${HALO_SPERRE_AUS:-$HOME/halo-nacht/SPERRE_AUS} ]] && exit 0

EIN=$(cat 2>/dev/null) || exit 0
[[ -n $EIN ]] || exit 0
if command -v jq >/dev/null 2>&1; then
  BEFEHL=$(print -r -- "$EIN" | jq -r '.tool_input.command // empty' 2>/dev/null) || exit 0
elif command -v python3 >/dev/null 2>&1; then
  BEFEHL=$(print -r -- "$EIN" | python3 -c 'import sys,json; print(json.load(sys.stdin).get("tool_input",{}).get("command",""))' 2>/dev/null) || exit 0
else
  exit 0
fi
[[ -n $BEFEHL ]] || exit 0

JETZT=${HALO_JETZT:-$(TZ=Europe/Vienna date +%H%M 2>/dev/null)}
[[ $JETZT == [0-9][0-9][0-9][0-9] ]] || exit 0
JETZT=$((10#$JETZT))

sperre() { print -u2 "Zeitfenster-Hook: $1\nGrund: $2\nWie weiter: $3"; exit 2 }

# --- Regel 2: Testläufe während der CI ---
if [[ $BEFEHL =~ '(halo_test|update_test|store_shots|ui_tour)\.py' && $BEFEHL =~ 'python' ]]; then
  LAEUFT=${HALO_RUNNER:-}
  if [[ -z $LAEUFT ]]; then
    pgrep -f '[R]unner.Worker' >/dev/null 2>&1 && LAEUFT=ja || LAEUFT=nein
  fi
  [[ $LAEUFT == ja ]] && sperre "Testlauf gesperrt, solange die CI läuft (Runner.Worker)." \
    "Zwei Testfenster nehmen sich gegenseitig den Fokus (AGENTS.md, Testrechner)." \
    "Warten, bis die CI durch ist (tests/ci-warten.sh), oder Maintainer fragen (~/halo-nacht/SPERRE_AUS)."
fi

# --- Regel 1: Push-Sperre ---
if [[ $BEFEHL =~ '(^|[;&|(]|[[:space:]])git([[:space:]]+(-C|-c)[[:space:]]+[^[:space:]]+)*[[:space:]]+push([[:space:]]|$)' ]]; then
  [[ $BEFEHL =~ '(--delete|[[:space:]]-d[[:space:]]|[[:space:]]:[^[:space:]]+)' ]] && exit 0
  [[ $BEFEHL =~ '--tags' && ! $BEFEHL =~ 'push[[:space:]]+[^;&|]*(main|HEAD|claude/|pruef/)' ]] && exit 0
  if (( JETZT >= 130 && JETZT < 900 )); then
    sperre "Push gesperrt (01:30–09:00 Wiener Zeit)." \
      "Der Nachtlauf wartet auf die CI genau seines Commits; ein weiterer Push verlängert sie um eine Runde." \
      "Nach 09:00 pushen, oder früher nur, wenn der Bericht ~/halo-berichte/<datum>-nachtlauf.md vorliegt und der Maintainer zustimmt."
  fi
  if (( JETZT < 130 )); then
    NOETIG=${HALO_CI_NOETIG:-}
    if [[ -z $NOETIG ]]; then
      [[ -x tests/ci-noetig.sh ]] || exit 0
      zsh tests/ci-noetig.sh origin/main HEAD >/dev/null 2>&1; RC=$?
      case $RC in 0) NOETIG=ja ;; 1) NOETIG=nein ;; *) exit 0 ;; esac
    fi
    [[ $NOETIG == ja ]] && sperre "Push mit Codeänderung gesperrt (00:00–01:30 Wiener Zeit)." \
      "Die CI dazu muss bis 01:30 durch sein (AGENTS.md, Nachtlauf nicht behindern)." \
      "Nach 09:00 pushen (Doku-Änderungen ohne Thunderbird-Dateien sind erlaubt)."
  fi
fi
exit 0
