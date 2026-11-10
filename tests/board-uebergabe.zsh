#!/bin/zsh
# Stellt Board-Aufträge der geplanten GitHub-Aufgabe zu, ohne dass dafür eine Sitzung erreichbar sein muss
# (die Übergabe per SendMessage an neon-board scheiterte mehrfach: „nicht erreichbar“).
# Datei ~/halo-aufgaben/board-uebergabe.txt, je Zeile (Tabulator-getrennt, Zeilenumbrüche im Text als \n):
#   <Zeit>\t<offen|zugestellt>\tneu\t<bug|feature>\t<todo|ok>\t<Titel>\t<Text>
#   <Zeit>\t<offen|zugestellt>\tnotiz\t<id oder Titelmuster>\t-\t-\t<Text>
# Jede offene Zeile führt board.sh aus; bei Erfolg (oder „gibt es schon“) wird sie „zugestellt“, sonst bleibt sie
# offen (nächster Lauf) und der Fehler steht im Protokoll. Aufruf: board-uebergabe.zsh [--trocken]
emulate -L zsh
setopt pipefail
DATEI=${HALO_BOARD_UEBERGABE:-$HOME/halo-aufgaben/board-uebergabe.txt}
BOARDSH=${HALO_BOARDSH:-$HOME/.config/halo-spaces/board.sh}
PROTO=${HALO_UEBERGABE_LOG:-$HOME/Library/Logs/halo-board-uebergabe.log}
TROCKEN=; [[ $1 == --trocken ]] && TROCKEN=1
log() { print -r -- "$(date '+%F %T') $*" >> $PROTO }
[[ -r $DATEI ]] || exit 0
n=0; fehler=0
while IFS=$'\t' read -r zeit stand aktion a b titel text; do
  n=$((n+1))
  [[ $stand == offen ]] || continue
  text=${text//\\n/$'\n'}
  if [[ -n $TROCKEN ]]; then print "TROCKEN: $aktion $a ${titel:0:60}"; continue; fi
  case $aktion in
    neu)   out=$($BOARDSH neu $a "$titel" "$text" $b 2>&1); rc=$? ;;
    notiz) out=$($BOARDSH notiz $a "$text" 2>&1); rc=$? ;;
    *)     out="unbekannte Aktion $aktion"; rc=1 ;;
  esac
  if (( rc == 0 )) || [[ $out == *"existiert schon"* ]]; then
    awk -F'\t' -v OFS='\t' -v n=$n 'NR==n{$2="zugestellt"}1' $DATEI > $DATEI.neu && mv $DATEI.neu $DATEI
    log "zugestellt: $aktion ${titel:-$a} → ${${out%%$'\n'*}:0:120}"
  else
    fehler=1; log "FEHLER (bleibt offen): $aktion ${titel:-$a}: ${${out%%$'\n'*}:0:200}"
  fi
done < $DATEI
exit $fehler
