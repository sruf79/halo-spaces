#!/bin/zsh
# Prüft die Kontingent-Drossel drossel_stufe aus tests/lauf-hilfen.zsh (Maintainer 19.11.2026: „ja umbauen und so rasch wie
# möglich live schalten“) ohne Claude und ohne Netz: Hochrechnung aus dem Verlauf, Stufen, Hysterese, zu wenig Daten,
# Unlesbares (Fail-open), nicht Volldampf, Schwellen aus der Konfiguration, Zustandsdatei.
#   zsh tests/drossel_test.zsh   eine Zeile OK/FEHLER je Fall, Exitcode 1 bei einem Fehler
emulate -L zsh
HIER=${0:A:h}
T=$(mktemp -d) || exit 1
trap 'rm -rf $T' EXIT
FEHLER=0
pruefe() {   # <Name> <Ausgabe> <Muster …> (grep -E, alle müssen vorkommen)
  local name=$1 aus=$2 m; shift 2
  for m in "$@"; do
    if ! print -r -- "$aus" | grep -qE -- "$m"; then
      print -r -- "FEHLER  $name – fehlt: $m"; FEHLER=1
      print -r -- "$aus" | sed 's/^/    /'; return
    fi
  done
  print -r -- "OK      $name"
}
print -r -- "volldampf 2026-11-17T01:00+01:00 2026-12-01T01:00+01:00 Probe" > $T/vd.txt
: > $T/leer.conf
# verlauf <Datei> <Woche jetzt> <Punkte je Stunde>: Punkte alle 30 Min. über 6 h vor Do 19.11. 12:00 UTC (wie der Leitstand)
verlauf() {
  python3 -I -c '
import sys, json, datetime as d
w, t = float(sys.argv[2]), float(sys.argv[3]); n = d.datetime(2026, 11, 19, 12, 0, tzinfo=d.timezone.utc)
p = [{"t": (n - d.timedelta(minutes=30 * i)).strftime("%Y-%m-%dT%H:%M:%SZ"), "woche": round(w - t * i / 2, 2), "fuenf": 1} for i in range(12, 0, -1)]
json.dump({"punkte": p}, open(sys.argv[1], "w"))' $1 $2 $3
}
# D [VAR=Wert …] -- <Woche>: Do 19.11.2026 13:00 Wiener Zeit = 12:00 UTC, nächster Reset Di 24.11. 00:00 UTC (108 h)
D() {
  local -a v; while [[ $1 != -- ]]; do v+=($1); shift; done; shift
  env HALO_VOLLDAMPF_DATEI=$T/vd.txt HALO_VOLLDAMPF_BEENDET=$T/vd-beendet.txt HALO_JETZT=2026-11-19T13:00+01:00 \
    HALO_WOCHENANKER=$T/kein-anker.txt HALO_AS_CONF=$T/leer.conf HALO_TAGESROUTINE_CONF=$T/leer.conf \
    HALO_DROSSEL_DATEI=$T/stufe.txt HALO_DROSSEL_VERLAUF=$T/v.json HALO_KONTINGENT_JSON=$T/kein-kontingent.json $v \
    zsh -c 'LOG=/dev/null; source $1/lauf-hilfen.zsh; drossel_stufe $2' _ $HIER "$@" 2>&1
}
# Woche 30 %, bis 98 % fehlen 68 Punkte; Fehlstunden = 108 − 68 / Tempo
verlauf $T/v.json 30 0.5;  pruefe "reicht: Tempo 0,5 → voll erst nach dem Reset, Stufe 0" "$(D -- 30)" '^0 Stufe 0 \(28 h Reserve\): reicht' 'Tempo 0\.50 Punkte/h über 6\.0 h Verlauf' 'Reset Di 01:00'
pruefe "Zustandsdatei geschrieben (Stufe, Fehlstunden, Zeit, seit; Wirkung; Grund)" "$(cat $T/stufe.txt)" \
  '^0 -28\.0 2026-11-19T12:00\+00:00 2026-11-19T12:00\+00:00$' '^reicht$' '^reicht bis Mi 05:00, 28 h nach dem Reset Di 01:00$'
rm -f $T/stufe.txt
verlauf $T/v.json 30 0.65; pruefe "Stufe 1: 3 Fehlstunden" "$(D -- 30)" '^1 Stufe 1 \(3 Fehlstunden(, vorher 0)?\): keine neuen Worker, Routine Sonnet, kein Fable'
rm -f $T/stufe.txt
verlauf $T/v.json 30 0.75; pruefe "Stufe 2: 17 Fehlstunden" "$(D -- 30)" '^2 Stufe 2 \(17 Fehlstunden(, vorher 0)?\): keine neuen Worker, Tagesroutine nur jede zweite Runde'
rm -f $T/stufe.txt
print -r -- "3 40.0 2026-11-19T11:50+00:00 2026-11-19T09:00+00:00" > $T/stufe.txt
verlauf $T/v.json 30 1.0;  pruefe "Stufe 3 unverändert: seit bleibt, Grund mit Fehlstunden" "$(D -- 30 >/dev/null; cat $T/stufe.txt)" \
  '^3 40\.0 2026-11-19T12:00\+00:00 2026-11-19T09:00\+00:00$' '^keine neuen Worker, Tagesroutine nichts Neues bis zur vollen Stunde$' '^voll So 09:00, 40 Fehlstunden vor dem Reset Di 01:00$'
rm -f $T/stufe.txt
verlauf $T/v.json 30 1.0;  pruefe "Stufe 3: 40 Fehlstunden, voll So" "$(D -- 30)" '^3 Stufe 3 \(40 Fehlstunden(, vorher 0)?\): .*nichts Neues bis zur vollen Stunde' 'voll \(98 %\) So 09:00'
pruefe "Woche schon ab 98 %: alle Stunden bis zum Reset fehlen" "$(D -- 98)" '^3 Stufe 3 \(108 Fehlstunden'

# Hysterese: zurück erst 6 Stunden unter der Einschaltgrenze
print -r -- "3 40.0 2026-11-19T11:50+00:00" > $T/stufe.txt
verlauf $T/v.json 30 0.84; pruefe "Hysterese: Stufe 3 bleibt bei 27 Fehlstunden (Grenze 30 − 6)" "$(D -- 30)" '^3 Stufe 3 \(27 Fehlstunden, gehalten, Rohstufe 2\)'
verlauf $T/v.json 30 0.77; pruefe "Hysterese: bei 20 Fehlstunden zurück auf Stufe 2" "$(D -- 30)" '^2 Stufe 2 \(20 Fehlstunden, vorher 3\)'
print -r -- "2 20.0 2026-11-19T11:50+00:00" > $T/stufe.txt
verlauf $T/v.json 30 0.66; pruefe "Hysterese: Stufe 2 bleibt bei 5 Fehlstunden? nein, 6 unter 12 → Stufe 1" "$(D -- 30)" '^1 Stufe 1 \([0-9]+ Fehlstunden, vorher 2\)'
print -r -- "2 20.0 2026-11-19T11:50+00:00" > $T/stufe.txt
verlauf $T/v.json 30 0.7;  pruefe "Hysterese: Stufe 2 bleibt bei 11 Fehlstunden (Rohstufe 1)" "$(D -- 30)" '^2 Stufe 2 \(11 Fehlstunden, gehalten, Rohstufe 1\)'
print -r -- "1 3.0 2026-11-19T11:50+00:00" > $T/stufe.txt
verlauf $T/v.json 30 0.61; pruefe "Hysterese: Stufe 1 bleibt bei 3 h Reserve (über −6)" "$(D -- 30)" '^1 Stufe 1 \(3 h Reserve, gehalten, Rohstufe 0\)'
verlauf $T/v.json 30 0.59; pruefe "Hysterese: Stufe 1 endet bei 7 h Reserve" "$(D -- 30)" '^0 Stufe 0 \(7 h Reserve, vorher 1\): reicht'
print -r -- "3 40.0 2026-11-16T11:50+00:00" > $T/stufe.txt
pruefe "Zustand aus der Vorwoche gilt nicht" "$(D -- 30)" '^0 Stufe 0 \(7 h Reserve\): reicht'
print -r -- "Unsinn" > $T/stufe.txt
pruefe "Zustandsdatei unlesbar: wie ohne Zustand" "$(D -- 30)" '^0 Stufe 0'
pruefe "Trockenlauf schreibt keinen Zustand" "$(rm -f $T/stufe.txt; D HALO_PAUSE_TROCKEN=1 -- 30 >/dev/null; ls $T/stufe.txt 2>&1)" 'No such file'

# zu wenig Verlauf: Schnitt seit Reset bzw. freiem Reset
rm -f $T/stufe.txt
pruefe "kein Verlauf: Schnitt seit Reset (60 h, Woche 30 → 0,5/h)" "$(D HALO_DROSSEL_VERLAUF=$T/fehlt.json -- 30)" '^0 Stufe 0 \(28 h Reserve\)' 'Schnitt seit Reset \(60 h, Verlauf zu kurz\)'
print -r -- '{"punkte":[{"t":"2026-11-19T11:00:00Z","woche":25}]}' > $T/kurz.json
pruefe "Verlauf unter 3 h: Schnitt seit Reset" "$(D HALO_DROSSEL_VERLAUF=$T/kurz.json -- 30)" 'Schnitt seit Reset'
print -r -- 'kein json' > $T/kaputt.json
pruefe "Verlauf unlesbar: Schnitt seit Reset" "$(D HALO_DROSSEL_VERLAUF=$T/kaputt.json -- 30)" '^0 Stufe 0 .*Schnitt seit Reset'
print -r -- "anker 2026-11-19T07:00+01:00 96 2" > $T/anker.txt
pruefe "nach freiem Reset: Schnitt seit Anker ab dem Wert danach ((30−2)/6 h)" "$(D HALO_WOCHENANKER=$T/anker.txt HALO_DROSSEL_VERLAUF=$T/fehlt.json -- 30)" \
  'Tempo 4\.67 Punkte/h Schnitt seit freiem Reset \(6 h' '^3 Stufe 3'
print -r -- '{"punkte":[{"t":"2026-11-19T06:00:00Z","woche":90},{"t":"2026-11-19T06:30:00Z","woche":95},{"t":"2026-11-19T07:30:00Z","woche":3},{"t":"2026-11-19T09:00:00Z","woche":10}]}' > $T/sturz.json
pruefe "Sturz im Verlauf: nur die Punkte danach (Tempo (30−3)/4,5 h)" "$(D HALO_WOCHENANKER=$T/kein-anker.txt HALO_DROSSEL_VERLAUF=$T/sturz.json -- 30)" 'Tempo 6\.00 Punkte/h über 4\.5 h Verlauf'
print -r -- "volldampf 2026-11-24T01:00+01:00 2026-12-01T01:00+01:00 Probe" > $T/vd-neu.txt
pruefe "kurz nach dem Reset (30 Min.): zu wenig Daten → keine Drossel (Fail-open)" \
  "$(D HALO_VOLLDAMPF_DATEI=$T/vd-neu.txt HALO_JETZT=2026-11-24T01:30+01:00 HALO_DROSSEL_VERLAUF=$T/fehlt.json -- 1)" '^0 Fail-open: zu wenig Daten \(0\.5 h seit Reset'

# Unlesbares, nicht Volldampf, abgeschaltet, Schwellen
pruefe "Woche nicht lesbar: Fail-open" "$(D -- )" '^0 Fail-open: Woche nicht lesbar – keine Drossel'
pruefe "Rechnung scheitert: Fail-open" "$(D VOLLDAMPF_WOCHE_ENDE=abc -- 30)" '^0 Fail-open: Hochrechnung gescheitert'
verlauf $T/v.json 30 1.0
pruefe "nicht Volldampf: aus" "$(D HALO_VOLLDAMPF_DATEI=$T/kein-vd.txt -- 30)" '^0 aus \(Volldampf nicht aktiv\)'
print -r -- "2026-11-17T01:00+01:00 2026-12-01T01:00+01:00 2026-11-19T08:00+01:00 98" > $T/vd-beendet.txt
pruefe "Volldampf pausiert (Wochenlimit): aus" "$(D -- 30)" '^0 aus'
rm -f $T/vd-beendet.txt
print -r -- "DROSSEL_AUS=1" > $T/aus.conf
pruefe "DROSSEL_AUS=1 schaltet ab" "$(D HALO_AS_CONF=$T/aus.conf -- 30)" '^0 aus \(DROSSEL_AUS=1\)'
print -l "DROSSEL_STUFE3=50 # Kommentar" "DROSSEL_STUFE2=abc" > $T/s3.conf
rm -f $T/stufe.txt
pruefe "Schwelle aus auslastung.conf (Stufe 3 erst über 50), ungültiger Wert übergangen" "$(D HALO_AS_CONF=$T/s3.conf -- 30)" '^2 Stufe 2 \(40 Fehlstunden'
print -r -- "DROSSEL_STUFE3=20" > $T/tr.conf
rm -f $T/stufe.txt
pruefe "tagesroutine.conf gilt nach auslastung.conf" "$(D HALO_AS_CONF=$T/s3.conf HALO_TAGESROUTINE_CONF=$T/tr.conf -- 30)" '^3 Stufe 3'
pruefe "Probe HALO_DROSSEL_STUFE" "$(D HALO_DROSSEL_STUFE=2 -- 30)" '^2 Stufe 2 \(Probe'
exit $FEHLER
