#!/bin/zsh
# Offene Aufträge an neon als Datei statt nur im Gesprächsverlauf, damit neon
# nach dem Verdichten seines Kontexts weiß, wem es noch was schuldet
# (docs/neon-sitzung.md). tests/neon-hook.sh lädt die Datei bei
# jedem Start und nach jedem Verdichten wieder in die Sitzung.
#   tests/neon-stand.sh neu <von> <Auftrag>     legt an, gibt die Nummer aus
#   tests/neon-stand.sh notiz <Nr> <Stand>      ersetzt den Stand (z. B. „Test läuft, Log …“)
#   tests/neon-stand.sh fertig <Nr> <Ergebnis>  erledigt (nach der Antwort an <von>): ins Archiv
#   tests/neon-stand.sh zeige
# <von>: Name der Sitzung, an die die Antwort geht (wie in ListAgents).
# HALO_STAND_NAME=board: eigene Liste der Sitzung neon-board
# (~/halo-aufgaben/board-stand.md), sonst neon-stand.md.
emulate -L zsh

DIR=${HALO_NEON_STAND:-$HOME/halo-aufgaben}
N=${HALO_STAND_NAME:-neon}
[[ $N == (neon|board) ]] || { print -u2 "HALO_STAND_NAME: neon oder board"; exit 2 }
STAND=$DIR/$N-stand.md
ARCHIV=$DIR/$N-stand-archiv.md
NR=$DIR/$N-stand.nr
mkdir -p $DIR
[[ -f $STAND ]] || print "# Offene Aufträge an ${${N/board/neon-board}}" > $STAND
einzeilig() { print -r -- ${${1//$'\n'/ }//[|]/;} }   # eine Zeile, | trennt die Spalten

case $1 in
  neu)
    [[ -n $2 && -n $3 ]] || { print -u2 "Aufruf: neon-stand.sh neu <von> <Auftrag>"; exit 2 }
    n=$(( $(cat $NR 2>/dev/null || print 0) + 1 ))
    print $n > $NR
    print -r -- "- #$n | $(date '+%d.%m. %H:%M') | von $(einzeilig $2) | $(einzeilig $3) | Stand: angenommen" >> $STAND
    print "#$n"
    ;;
  notiz|fertig)
    [[ $2 == <-> && -n $3 ]] || { print -u2 "Aufruf: neon-stand.sh $1 <Nr> <Text>"; exit 2 }
    zeile=$(grep -E "^- #$2 \|" $STAND) || { print -u2 "Auftrag #$2 ist nicht offen"; exit 1 }
    if [[ $1 == notiz ]]; then
      neu="${zeile% [|] Stand: *} | Stand: $(date '+%H:%M') $(einzeilig $3)"
      awk -v nr="- #$2 |" -v neu="$neu" 'index($0, nr) == 1 { print neu; next } { print }' $STAND > $STAND.tmp
    else
      print -r -- "${zeile% [|] Stand: *} | erledigt $(date '+%d.%m. %H:%M'): $(einzeilig $3)" >> $ARCHIV
      awk -v nr="- #$2 |" 'index($0, nr) != 1' $STAND > $STAND.tmp
    fi
    mv $STAND.tmp $STAND
    print "#$2 ${1/fertig/erledigt}"
    ;;
  zeige)
    if grep -q '^- #' $STAND; then grep '^- #' $STAND; else print "keine offenen Aufträge"; fi
    ;;
  *)
    sed -n '/^#   tests/s/^#   //p' $0
    exit 2
    ;;
esac
