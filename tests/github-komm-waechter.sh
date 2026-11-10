#!/bin/zsh
# Wächter für die geplante Aufgabe „halo.spaces: GitHub-Kommunikation“ (läuft um 9:00, 14:00, 19:00 Wiener Zeit):
# LaunchAgent at.halo-spaces.github-komm-waechter ruft ihn um :15 danach auf, unabhängig von jeder Sitzung.
# Entscheidung des Maintainers vom 10.11.2026 („deiner empfehlung folgen“: Weg B, eigener LaunchAgent statt
# Prüfjob einer Sitzung). Ohne Claude, nur Dateien:
#   github-komm-waechter.sh [--trocken]     --trocken: nur ausgeben, nichts melden
# Der Lauf gilt als erfolgt, wenn nach (jetzt − 30 Minuten) entweder die Aufgabe „Letzte Prüfung: <UTC>“ in
# ~/halo-aufgaben/github-komm-stand.md aktualisiert hat oder die Vorprüfung „ÜBERSPRUNGEN github-kommunikation
# nichts neu“ ins Protokoll (~/halo-nacht/uebersprungen.log) schrieb. Sonst eine Meldung aufs iPhone (push(),
# erste Zeile „PUSH: …“ an github.comm.routine), höchstens einmal je Zeitfenster. Pausen: Routine github-komm.
emulate -L zsh
setopt pipefail
# Im LaunchAgent fehlt der PATH, in dem claude liegt (push() ruft claude auf): wie halo-zsh beim Nachtlauf setzen
export PATH=$HOME/.local/bin:/opt/homebrew/bin:/usr/local/bin:$PATH
source ${0:A:h}/lauf-hilfen.zsh
LOG=${HALO_WAECHTER_LOG:-$HOME/Library/Logs/halo-github-komm-waechter.log}
STAND=${HALO_KOMM_STAND:-$HOME/halo-aufgaben/github-komm-stand.md}
PROTO=${HALO_UEBERSPRUNGEN_LOG:-$HOME/halo-nacht/uebersprungen.log}
FRIST=${HALO_WAECHTER_MINUTEN:-30}
TROCKEN=; [[ $1 == --trocken ]] && TROCKEN=1

if [[ -z $TROCKEN ]] && HALO_PAUSE_EINMAL=1 pause_start github-komm; then exit 0; fi

# Board-Aufträge der Aufgabe (~/halo-aufgaben/board-uebergabe.txt) selbst zustellen: die Übergabe per SendMessage
# an neon-board scheiterte mehrfach („nicht erreichbar“); Einzelheiten tests/board-uebergabe.zsh
zsh ${0:A:h}/board-uebergabe.zsh ${TROCKEN:+--trocken}

# Ausgang der Aufgabe: ~/halo-aufgaben/github-push-ausgang.txt, je Zeile „<Zeit>\t<offen|zugestellt>\t<Text>“.
# Die Aufgabe schreibt „zugestellt“, wenn SendMessage an github.comm.routine klappte, sonst „offen“. Offene Zeilen
# stellt der Wächter selbst zu (push() sucht die Sitzung jedes Mal neu über ihren Namen, auch nach einer neu
# erstellten Sitzung) und markiert sie bei Erfolg als zugestellt; bei Misserfolg bleibt die Zeile für den nächsten Lauf.
AUSGANG=${HALO_PUSH_AUSGANG:-$HOME/halo-aufgaben/github-push-ausgang.txt}
FEHLERLOG=${HALO_UEBERSPRUNGEN_LOG:-$HOME/halo-nacht/uebersprungen.log}
if [[ -z $TROCKEN && -r $AUSGANG ]]; then
  offen=("${(@f)$(awk -F'\t' '$2=="offen"{print NR"\t"$3}' $AUSGANG | tail -n 5)}")
  for z in $offen; do
    [[ -n $z ]] || continue
    nr=${z%%$'\t'*}; txt=${z#*$'\t'}
    vorher=$(grep -ac "PUSH-FEHLER github-komm-waechter" $FEHLERLOG 2>/dev/null)
    push "$txt (nachgeliefert $(date +%H:%M))" github-komm-waechter
    nachher=$(grep -ac "PUSH-FEHLER github-komm-waechter" $FEHLERLOG 2>/dev/null)
    if [[ $vorher == $nachher ]]; then
      awk -F'\t' -v OFS='\t' -v n=$nr 'NR==n{$2="zugestellt"}1' $AUSGANG > $AUSGANG.neu && mv $AUSGANG.neu $AUSGANG
      log "nachgeliefert: $txt"
    else
      log "Zustellung gescheitert (bleibt offen): $txt"
    fi
  done
fi

# Zeitpunkt des letzten Belegs in Sekunden seit 1970 (0 = keiner)
beleg=$(python3 - "$STAND" "$PROTO" <<'PY'
import re, sys, datetime, os
best = 0
try:
    for z in open(sys.argv[1], encoding="utf-8"):
        m = re.match(r"Letzte Prüfung: (\d{4}-\d\d-\d\dT\d\d:\d\dZ)", z)
        if m:
            t = datetime.datetime.strptime(m.group(1), "%Y-%m-%dT%H:%MZ").replace(tzinfo=datetime.timezone.utc).timestamp()
            best = max(best, t); break
except OSError:
    pass
try:
    for z in open(sys.argv[2], encoding="utf-8"):
        m = re.match(r"(\d{4}-\d\d-\d\d \d\d:\d\d:\d\d) ÜBERSPRUNGEN github-kommunikation nichts neu", z)
        if m:
            t = datetime.datetime.strptime(m.group(1), "%Y-%m-%d %H:%M:%S").timestamp()
            best = max(best, t)
except OSError:
    pass
print(int(best))
PY
) || { log "FEHLER: Beleg nicht lesbar"; exit 1 }

jetzt=$(date +%s)
alter=$(( (jetzt - beleg) / 60 ))
if (( beleg > 0 && alter <= FRIST )); then
  print "OK: letzte Prüfung vor $alter Minuten"; exit 0
fi
wann="letzter Beleg vor $alter Minuten"; (( beleg > 0 )) || wann="kein Beleg gefunden"
text="PUSH: GitHub-Kommunikation $(date +%H:%M): Stand nicht aktualisiert, $wann (Aufgabe lief nicht oder ist hängen geblieben)"
print -r -- "$text"
[[ -n $TROCKEN ]] && exit 1
# höchstens eine Meldung je Fenster
marke=$HOME/halo-nacht/github-komm-waechter.letzte
if [[ -f $marke ]] && (( jetzt - $(stat -f %m $marke) < 3600 )); then log "schon gemeldet, keine zweite Meldung"; exit 1; fi
touch $marke
push ${text#PUSH: } github-komm-waechter
log "gemeldet: $text"
exit 1
