#!/bin/zsh
# Ein- und Ausschalter für Volldampf (Maintainer 17.11.2026: „in zukunft werden wir vielleicht öfters volldampf nutzen.
# daher müssen wir dieses regelwerk klar absichern um quasi mittels ein- und aus-schalter jederzeit aktivieren und wieder
# deaktivieren zu können“). Nur auf neon, nur auf Zuruf des Maintainers.
#   zsh tests/volldampf.sh an [<bis ISO-Zeit mit Zone>] [<Grund>]   ab jetzt; bis = nächster Wochenreset (Di 00:00 UTC, Wien 01:00 bzw. 02:00 im Sommer)
#   zsh tests/volldampf.sh aus                                      sofort aus: Regelzeile weg, Wächter beendet
#   zsh tests/volldampf.sh status                                   Zustand von Regel, Wächtern und Wochenwert
# „an“ schreibt die Regelzeile (~/halo-nacht/volldampf.txt, Auswertung wie bisher in lauf-hilfen.zsh) und startet den
# Auslastungs- und den Zwischen-Release-Wächter, falls sie nicht laufen. Nachtlauf und Tagesroutine lesen die Zeile bei
# jeder Entscheidung selbst; alle Volldampf-Werte (spätere Zeiten, Grenzen, Fable) gelten nur, solange die Zeile aktiv ist.
# „aus“ verschiebt die Zeile nach ~/halo-nacht/volldampf-aus-<Zeit>.txt (Verlauf), beendet die beiden Wächter und lässt
# laufende Worker ihre Arbeit fertigmachen (eigene Höchstdauer). Danach gelten sofort wieder die normalen Regeln.
# Wochenlimit (98 %) pausiert Volldampf nur bis zum freien Reset (Marke, lauf-hilfen.zsh; Maintainer 18.11.2026), danach läuft
# er von selbst weiter; Ende ist bis (automatischer Wochenreset) oder „aus“.
# Proben: HALO_VOLLDAMPF_DATEI, HALO_VD_KEINE_WAECHTER=1 (keine Prozesse starten/beenden), HALO_JETZT.
emulate -L zsh
export TZ=Europe/Vienna
HIER=${0:A:h}
LOG=
source $HIER/lauf-hilfen.zsh
DIR=${HALO_NACHT_DIR:-$HOME/halo-nacht}
DATEI=${HALO_VOLLDAMPF_DATEI:-$DIR/volldampf.txt}
WAECHTER=(auslastung zwischen)
skript() { case $1 in auslastung) print -r -- $HIER/auslastung-schleife.zsh;; zwischen) print -r -- $HIER/zwischen-schleife.zsh;; esac }
sperre() { case $1 in auslastung) print -r -- $DIR/auslastung-schleife.lock;; zwischen) print -r -- $DIR/zwischen-schleife.lock;; esac }
laeuft() { local l=$(sperre $1); [[ -r $l ]] && kill -0 "$(<$l)" 2>/dev/null }
naechster_reset() {   # nächster automatischer Wochenreset (Di 00:00 UTC = 01:00 Wien im Winter, 02:00 im Sommer) nach jetzt, ISO mit Zone
  # vorher fest 01:00 Wiener Zeit: im Sommer endete Volldampf eine Stunde vor dem Reset (18.11.2026)
  python3 -I -c '
import os, datetime as d
j = os.environ.get("HALO_JETZT")
n = d.datetime.fromisoformat(j).astimezone() if j else d.datetime.now().astimezone()
u = n.astimezone(d.timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
u += d.timedelta(days=(1 - u.weekday()) % 7)
if u <= n: u += d.timedelta(days=7)
print(u.astimezone().isoformat(timespec="minutes"))'
}
jetzt_iso() { python3 -I -c 'import os,datetime as d;j=os.environ.get("HALO_JETZT");print((d.datetime.fromisoformat(j).astimezone() if j else d.datetime.now().astimezone()).isoformat(timespec="minutes"))' }
zeigen() {
  local w s
  s=$(volldampf_status) && print -r -- "Regel:      $s" || print "Regel:      Volldampf aus"
  for w in $WAECHTER; do
    if laeuft $w; then print "Wächter:    $w läuft (PID $(<$(sperre $w)))"; else print "Wächter:    $w läuft nicht"; fi
  done
}
case ${1:-status} in
  an)
    shift
    bis=${1:-$(naechster_reset)}; [[ $# -gt 0 ]] && shift
    grund=${*:-„Volldampf an“ von Hand per tests/volldampf.sh (Maintainer-Zuruf)}
    if volldampf_aktiv >/dev/null; then print "Volldampf ist schon an."; zeigen; exit 0; fi
    # noch eine alte, abgelaufene oder wartende Zeile? Verlauf sichern, dann neu schreiben
    [[ -s $DATEI ]] && mv -f $DATEI $DIR/volldampf-alt-$(date +%Y%m%d-%H%M%S).txt
    volldampf_setzen $(jetzt_iso) $bis $grund || { print -u2 "FEHLER: Regelzeile nicht geschrieben"; exit 1 }
    volldampf_aktiv >/dev/null || { print -u2 "FEHLER: Regelzeile gilt nicht als aktiv (Zeit prüfen)"; exit 1 }
    if [[ -z $HALO_VD_KEINE_WAECHTER ]]; then
      for w in $WAECHTER; do laeuft $w || { rm -f $(sperre $w); nohup zsh $(skript $w) >/dev/null 2>&1 &! }; done
      sleep 3
    fi
    print "Volldampf an, bis $bis (beim Wochenlimit pausiert bis zum freien Reset)."; zeigen ;;
  aus)
    if [[ -s $DATEI ]]; then mv -f $DATEI $DIR/volldampf-aus-$(date +%Y%m%d-%H%M%S).txt; print "Regelzeile entfernt (Verlauf: volldampf-aus-….txt)."; else print "Keine Regelzeile, Volldampf war schon aus."; fi
    if [[ -z $HALO_VD_KEINE_WAECHTER ]]; then
      for w in $WAECHTER; do laeuft $w && kill "$(<$(sperre $w))" 2>/dev/null; done
      sleep 2
    fi
    print "Volldampf aus. Laufende Worker machen ihre Arbeit fertig; Nachtlauf und Tagesroutine gelten sofort wieder normal."; zeigen ;;
  status) zeigen ;;
  *) print -u2 "Aufruf: tests/volldampf.sh an [<bis>] [<Grund>] | aus | status"; exit 2 ;;
esac
