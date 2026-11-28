#!/bin/zsh
# Prüft das Warten des GitHub-Wächters auf die Zeile des laufenden Fensters (Logikprüfung 27.11.2026, Punkt 3):
# gefälschte Ausgang-Datei, eigenes HOME im Testordner, kein Claude (HALO_PUSH_TROCKEN=1), Wartezeit abgekürzt über
# HALO_WAECHTER_TAKT/HALO_WAECHTER_BIS. Drei Fälle: Zeile schon da, Zeile kommt während des Wartens, Zeile kommt nie.
#   zsh tests/github_komm_waechter_test.zsh    eine Zeile OK/FEHLER je Prüfung, Exitcode 0 nur bei Erfolg
emulate -L zsh
SKRIPT=${0:A:h}/github-komm-waechter.sh
T=$(mktemp -d); trap 'rm -rf $T' EXIT
FEHLER=0
fenster=$(( $(date +%s) / 3600 * 3600 ))          # Beginn der laufenden Stunde
fz=$(date -u -r $(( fenster + 12*60 )) +%Y-%m-%dT%H:%MZ)   # Zeit einer Zeile des laufenden Fensters (:12)
alt=$(date -u -r $(( fenster - 5*3600 )) +%Y-%m-%dT%H:%MZ) # Zeile eines früheren Fensters

# lauf <Fall> <Sekunden bis Ende des Wartens>: Wächter mit Testdateien, Ausgabe auf stdout
lauf() {
  local d=$T/$1
  mkdir -p $d/home/halo-nacht
  : > $d/home/halo-nacht/pausen.txt
  print -r -- "Letzte Prüfung: $(date -u +%Y-%m-%dT%H:%MZ)" > $d/stand.md   # frischer Beleg: keine Meldung „lief nicht“
  HOME=$d/home HALO_PUSH_TROCKEN=1 HALO_PAUSEN_DATEI=$d/home/halo-nacht/pausen.txt \
  HALO_BOARD_UEBERGABE=$d/keine-uebergabe.txt HALO_UEBERGABE_LOG=$d/uebergabe.log \
  HALO_WAECHTER_LOG=$d/waechter.log HALO_KOMM_STAND=$d/stand.md HALO_UEBERSPRUNGEN_LOG=$d/uebersprungen.log \
  HALO_PUSH_AUSGANG=$d/ausgang.txt HALO_WAECHTER_FENSTER=$fenster HALO_WAECHTER_BIS=$(( $(date +%s) + $2 )) \
  HALO_WAECHTER_TAKT=1 zsh $SKRIPT 2>&1
}
# pruefe <Name> <Text> <Muster …> (alle müssen vorkommen); pruefe_nicht <Name> <Text> <Muster>
pruefe() {
  local name=$1 aus=$2 m; shift 2
  for m in "$@"; do
    if ! print -r -- "$aus" | grep -qE -- "$m"; then
      print -r -- "FEHLER $name – fehlt: $m"; FEHLER=1; print -r -- "$aus" | sed 's/^/    /'; return
    fi
  done
  print -r -- "OK     $name"
}
pruefe_nicht() {
  if print -r -- "$2" | grep -qE -- "$3"; then print -r -- "FEHLER $1 – steht drin: $3"; FEHLER=1
  else print -r -- "OK     $1"; fi
}

# Fall 1: Zeile des Fensters steht schon da → kein Warten, sofort zugestellt
mkdir -p $T/da; print -r -- "$fz	offen	GitHub: nichts Neues" > $T/da/ausgang.txt
s=$(date +%s); aus=$(lauf da 20); dauer=$(( $(date +%s) - s ))
pruefe "Zeile schon da: zugestellt" "$(cat $T/da/waechter.log; cat $T/da/ausgang.txt)" 'nachgeliefert: GitHub: nichts Neues' '	zugestellt	'
pruefe_nicht "Zeile schon da: kein Warten" "$(cat $T/da/waechter.log)" 'noch keine Zeile'
(( dauer < 10 )) && print "OK     Zeile schon da: fertig in $dauer s" || { print "FEHLER Zeile schon da: dauerte $dauer s"; FEHLER=1 }

# Fall 2: nur eine alte Zeile; die neue kommt nach 3 s → Wächter wartet, stellt sie dann zu
mkdir -p $T/spaet; print -r -- "$alt	zugestellt	GitHub alt" > $T/spaet/ausgang.txt
( sleep 3; print -r -- "$fz	offen	GitHub spät" >> $T/spaet/ausgang.txt ) &   # feste Pause: die Aufgabe schreibt verspätet
aus=$(lauf spaet 20); wait
pruefe "Zeile kommt spät: gewartet und zugestellt" "$(cat $T/spaet/waechter.log; cat $T/spaet/ausgang.txt)" \
  'noch keine Zeile für das Fenster' 'Zeile nach [0-9]+ s da' 'nachgeliefert: GitHub spät' "$fz	zugestellt	GitHub spät"
pruefe_nicht "Zeile kommt spät: kein Abbruch des Wartens" "$(cat $T/spaet/waechter.log)" 'keine Zeile, weiter wie bisher'

# Fall 3: keine Zeile bis zum Ende des Wartens (hier 3 s) → weiter wie bisher, alte Zeilen unverändert
mkdir -p $T/nie; print -r -- "$alt	offen	GitHub alt offen" > $T/nie/ausgang.txt
s=$(date +%s); aus=$(lauf nie 3); dauer=$(( $(date +%s) - s ))
pruefe "Zeile kommt nie: Warten endet, weiter wie bisher" "$(cat $T/nie/waechter.log)" \
  'noch keine Zeile für das Fenster' 'keine Zeile, weiter wie bisher' 'nachgeliefert: GitHub alt offen'
pruefe "Zeile kommt nie: Beleg-Prüfung läuft danach" "$aus" '^OK: letzte Prüfung vor'
(( dauer >= 2 && dauer < 15 )) && print "OK     Zeile kommt nie: wartete $dauer s" || { print "FEHLER Zeile kommt nie: dauerte $dauer s"; FEHLER=1 }

exit $FEHLER
