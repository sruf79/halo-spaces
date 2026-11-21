#!/bin/zsh
# Prüft die Kontingent-Drossel drossel_stufe aus tests/lauf-hilfen.zsh (Maintainer 20.11.2026: „ja, stell die ampel so um.
# wäre es nicht alarmierender, wenn wir mehr % token als % woche verbraucht haben?“) ohne Claude und ohne Netz: d = Verbrauch
# der Woche minus vergangene Wochenzeit (resetsAt aus kontingent.json, sonst Resetregel), Stufen an den Grenzen 0/5/15,
# Hysterese 1 Punkt, ab 90 % nur mit d > 0, Fail-open (kontingent.json fehlt/alt, nach dem Reset, Wert von vor dem Reset),
# nicht Volldampf, Schwellen aus der Konfiguration, Zustandsdatei.
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
# kont <Datei> <utilization> [<stand> [<resetsAt Unix-Sekunden>|-]]: kontingent.json wie tests/kontingent.sh
# Standard: Stand Do 19.11. 20:10 Wiener Zeit, resetsAt Di 24.11. 00:00 UTC (1795478400)
kont() {
  python3 -I -c '
import sys, json
w = {"utilization": float(sys.argv[2])}
if sys.argv[4] != "-": w["resetsAt"] = int(sys.argv[4])
json.dump({"stand": sys.argv[3], "info": {"unifiedWindows": {"seven_day": w}}}, open(sys.argv[1], "w"))' $1 $2 ${3:-2026-11-19T20:10:00+0100} ${4:-1795478400}
}
kont $T/k.json 0.30
# D [VAR=Wert …] -- [<Woche>]: Do 19.11.2026 20:12 Wiener Zeit = 19:12 UTC, 100,8 h vor dem Reset → Wochenzeit genau 40,0 %
D() {
  local -a v; while [[ $1 != -- ]]; do v+=($1); shift; done; shift
  env HALO_VOLLDAMPF_DATEI=$T/vd.txt HALO_VOLLDAMPF_BEENDET=$T/vd-beendet.txt HALO_JETZT=2026-11-19T20:12+01:00 \
    HALO_WOCHENANKER=$T/kein-anker.txt HALO_AS_CONF=$T/leer.conf HALO_TAGESROUTINE_CONF=$T/leer.conf \
    HALO_DROSSEL_DATEI=$T/stufe.txt HALO_KONTINGENT_JSON=$T/k.json $v \
    zsh -c 'LOG=/dev/null; source $1/lauf-hilfen.zsh; drossel_stufe $2' _ $HIER "$@" 2>&1
}

# Stufen an den Grenzen (d = Woche − 40,0)
pruefe "d = 0: Stufe 0" "$(rm -f $T/stufe.txt; D -- 40)" '^0 Stufe 0 \(0\.0 Punkte unter der Zeit\): reicht – Woche 40 %, Wochenzeit 40\.0 % \(Reset Di 01:00, resetsAt\)$'
pruefe "d = −10: Stufe 0" "$(rm -f $T/stufe.txt; D -- 30)" '^0 Stufe 0 \(10\.0 Punkte unter der Zeit\): reicht'
pruefe "d = 1: Stufe 1" "$(rm -f $T/stufe.txt; D -- 41)" '^1 Stufe 1 \(1\.0 Punkte über der Zeit(, vorher 0)?\): keine neuen Worker, Tagesroutine kein Fable'
pruefe "d = 5: noch Stufe 1" "$(rm -f $T/stufe.txt; D -- 45)" '^1 Stufe 1 \(5\.0 Punkte über der Zeit'
pruefe "d = 6: Stufe 2" "$(rm -f $T/stufe.txt; D -- 46)" '^2 Stufe 2 \(6\.0 Punkte über der Zeit(, vorher 0)?\): keine neuen Worker, Tagesroutine nur jede zweite Runde'
pruefe "d = 15: noch Stufe 2" "$(rm -f $T/stufe.txt; D -- 55)" '^2 Stufe 2 \(15\.0 Punkte über der Zeit'
pruefe "d = 16: Stufe 3" "$(rm -f $T/stufe.txt; D -- 56)" '^3 Stufe 3 \(16\.0 Punkte über der Zeit(, vorher 0)?\): keine neuen Worker, Tagesroutine nichts Neues bis zur vollen Stunde'
pruefe "Rechenrest an der Grenze zählt nicht (0,45 × 100 aus kontingent.json)" "$(rm -f $T/stufe.txt; kont $T/k45.json 0.45; D HALO_KONTINGENT_JSON=$T/k45.json -- 45)" '^1 Stufe 1 \(5\.0 Punkte'

# Zustandsdatei: Zeile 1 „<Stufe> <d> <ISO> <seit ISO>“, Zeile 2 Wirkung, Zeile 3 Grund
rm -f $T/stufe.txt; D -- 41 >/dev/null
pruefe "Zustandsdatei geschrieben (Stufe, d, Zeit, seit; Wirkung; Grund)" "$(cat $T/stufe.txt)" \
  '^1 1\.0 2026-11-19T19:12\+00:00 2026-11-19T19:12\+00:00$' '^keine neuen Worker, Tagesroutine kein Fable$' \
  '^1\.0 Punkte über der Zeit: Woche 41 %, Wochenzeit 40\.0 % \(Reset Di 01:00, resetsAt\)$'
print -r -- "3 20.0 2026-11-19T19:00+00:00 2026-11-19T09:00+00:00" > $T/stufe.txt
pruefe "Stufe unverändert: seit bleibt" "$(D -- 60 >/dev/null; head -1 $T/stufe.txt)" '^3 20\.0 2026-11-19T19:12\+00:00 2026-11-19T09:00\+00:00$'
pruefe "Trockenlauf schreibt keinen Zustand" "$(rm -f $T/stufe.txt; D HALO_PAUSE_TROCKEN=1 -- 41 >/dev/null; ls $T/stufe.txt 2>&1)" 'No such file'

# Hysterese: zurück erst 1 Punkt unter der Einschaltgrenze
print -r -- "3 20.0 2026-11-19T19:00+00:00" > $T/stufe.txt
pruefe "Hysterese: Stufe 3 bleibt bei d = 14,5 (Grenze 15 − 1)" "$(D -- 54.5)" '^3 Stufe 3 \(14\.5 Punkte über der Zeit, gehalten, Rohstufe 2\)'
pruefe "Hysterese: bei d = 14 zurück auf Stufe 2" "$(D -- 54)" '^2 Stufe 2 \(14\.0 Punkte über der Zeit, vorher 3\)'
pruefe "Hysterese: Stufe 2 bleibt bei d = 4,5" "$(D -- 44.5)" '^2 Stufe 2 \(4\.5 Punkte über der Zeit, gehalten, Rohstufe 1\)'
pruefe "Hysterese: bei d = 4 zurück auf Stufe 1" "$(D -- 44)" '^1 Stufe 1 \(4\.0 Punkte über der Zeit, vorher 2\)'
pruefe "Hysterese: Stufe 1 bleibt bei d = −0,5" "$(D -- 39.5)" '^1 Stufe 1 \(0\.5 Punkte unter der Zeit, gehalten, Rohstufe 0\)'
pruefe "Hysterese: Stufe 1 endet bei d = −1" "$(D -- 39)" '^0 Stufe 0 \(1\.0 Punkte unter der Zeit, vorher 1\): reicht'
print -r -- "3 20.0 2026-11-19T19:00+00:00" > $T/stufe.txt
pruefe "Hysterese: von Stufe 3 bei d = −5 direkt auf 0" "$(D -- 35)" '^0 Stufe 0 \(5\.0 Punkte unter der Zeit, vorher 3\)'
print -r -- "3 20.0 2026-11-16T23:50+00:00" > $T/stufe.txt
pruefe "Zustand aus der Vorwoche gilt nicht (Wochenbeginn Di 00:00 UTC)" "$(D -- 54.5)" '^2 Stufe 2 \(14\.5 Punkte über der Zeit(, vorher 0)?\)'
print -r -- "Unsinn" > $T/stufe.txt
pruefe "Zustandsdatei unlesbar: wie ohne Zustand" "$(D -- 41)" '^1 Stufe 1'
print -r -- "3 20.0 2026-11-19T10:00+00:00" > $T/stufe.txt
print -r -- "anker 2026-11-19T11:00+01:00 96 2" > $T/anker.txt
pruefe "freier Reset ändert nichts: nur die Kalenderwoche zählt (Zustand bleibt gültig)" "$(D HALO_WOCHENANKER=$T/anker.txt -- 54.5)" '^3 Stufe 3 \(14\.5 Punkte über der Zeit, gehalten'
rm -f $T/stufe.txt

# ab 90 % verbraucht: Stufe 3 nur mit d > 0 (Mo 23.11. 08:12 Wiener Zeit: 16,8 h vor dem Reset, Wochenzeit 90,0 %)
kont $T/k90.json 0.30 2026-11-23T08:10:00+0100
pruefe "Woche 92 % bei Wochenzeit 90 %: Stufe 3 (statt 1)" "$(D HALO_JETZT=2026-11-23T08:12+01:00 HALO_KONTINGENT_JSON=$T/k90.json -- 92)" '^3 Stufe 3 \(2\.0 Punkte über der Zeit.*Wochenzeit 90\.0 % .*ab 90 % verbraucht'
rm -f $T/stufe.txt
pruefe "Woche 90 % bei Wochenzeit 90 % (d = 0): keine Drossel" "$(D HALO_JETZT=2026-11-23T08:12+01:00 HALO_KONTINGENT_JSON=$T/k90.json -- 90)" '^0 Stufe 0 \(0\.0 Punkte unter der Zeit\)'
pruefe "Woche 95 % bei Wochenzeit 96 %: keine Drossel" "$(kont $T/k96.json 0.30 2026-11-23T18:15:00+0100; D HALO_JETZT=2026-11-23T18:16:48+01:00 HALO_KONTINGENT_JSON=$T/k96.json -- 95)" '^0 Stufe 0 \(1\.0 Punkte unter der Zeit\)'
print -r -- "DROSSEL_ROT=95" > $T/rot.conf
rm -f $T/stufe.txt
pruefe "DROSSEL_ROT aus der Konfiguration (95): 92 % nur Stufe 1" "$(D HALO_AS_CONF=$T/rot.conf HALO_JETZT=2026-11-23T08:12+01:00 HALO_KONTINGENT_JSON=$T/k90.json -- 92)" '^1 Stufe 1'
rm -f $T/stufe.txt

# resetsAt, Rückfall auf die Resetregel, Sommerzeit egal
pruefe "ohne resetsAt: Resetregel Di 00:00 UTC" "$(kont $T/kr.json 0.30 2026-11-19T20:10:00+0100 -; D HALO_KONTINGENT_JSON=$T/kr.json -- 41)" 'Wochenzeit 40\.0 % \(Reset Di 01:00, Resetregel\)'
rm -f $T/stufe.txt
pruefe "resetsAt eine Stunde später (Di 01:00 UTC): Wochenzeit 39,4 %" "$(kont $T/k1.json 0.30 2026-11-19T20:10:00+0100 1795482000; D HALO_KONTINGENT_JSON=$T/k1.json -- 41)" 'Wochenzeit 39\.4 % \(Reset Di 02:00, resetsAt\)'
rm -f $T/stufe.txt
print -r -- "volldampf 2026-06-30T02:00+02:00 2026-07-14T02:00+02:00 Sommer" > $T/vd-sommer.txt
pruefe "Sommerzeit: resetsAt Di 07.07. 00:00 UTC (02:00 Wiener Zeit), Do 02.07. 12:00 → 110 h vor dem Reset, 34,5 %" \
  "$(kont $T/ks.json 0.30 2026-07-02T11:50:00+0200 1783382400; D HALO_VOLLDAMPF_DATEI=$T/vd-sommer.txt HALO_JETZT=2026-07-02T12:00+02:00 HALO_KONTINGENT_JSON=$T/ks.json -- 20)" \
  '^0 Stufe 0 \(14\.5 Punkte unter der Zeit\).*Wochenzeit 34\.5 % \(Reset Di 02:00, resetsAt\)'
rm -f $T/stufe.txt

# Woche aus kontingent.json
pruefe "ohne Woche: Wert aus kontingent.json" "$(kont $T/k41.json 0.41; D HALO_KONTINGENT_JSON=$T/k41.json -- )" '^1 Stufe 1 .*Woche 41 %'
rm -f $T/stufe.txt
pruefe "ungerundeter Wochenwert aus kontingent.json bevorzugt" "$(kont $T/k4123.json 0.4123; D HALO_KONTINGENT_JSON=$T/k4123.json -- 41)" 'Woche 41\.23 %'
rm -f $T/stufe.txt
pruefe "ungerundeter Wert nur, wenn er zum übergebenen passt" "$(D -- 41)" 'Woche 41 %'
rm -f $T/stufe.txt

# Fail-open
pruefe "kontingent.json fehlt: Fail-open" "$(D HALO_KONTINGENT_JSON=$T/fehlt.json -- 60)" '^0 Fail-open: kontingent\.json nicht lesbar – keine Drossel$'
print -r -- 'kein json' > $T/kaputt.json
pruefe "kontingent.json unlesbar: Fail-open" "$(D HALO_KONTINGENT_JSON=$T/kaputt.json -- 60)" '^0 Fail-open: kontingent\.json nicht lesbar'
pruefe "Stand älter als 3 h: Fail-open" "$(kont $T/kalt.json 0.60 2026-11-19T17:10:00+0100; D HALO_KONTINGENT_JSON=$T/kalt.json -- 60)" '^0 Fail-open: Kontingent-Stand Do 17:10 älter als 3 h'
pruefe "Stand genau 3 h alt: noch gültig" "$(kont $T/k3.json 0.30 2026-11-19T17:12:00+0100; D HALO_KONTINGENT_JSON=$T/k3.json -- 41)" '^1 Stufe 1'
rm -f $T/stufe.txt
pruefe "Stand in der Zukunft: Fail-open" "$(kont $T/kz.json 0.30 2026-11-19T21:00:00+0100; D HALO_KONTINGENT_JSON=$T/kz.json -- 60)" '^0 Fail-open: Kontingent-Stand'
print -r -- "DROSSEL_STAND_STUNDEN=4" > $T/stand.conf
pruefe "DROSSEL_STAND_STUNDEN aus der Konfiguration (4 h)" "$(D HALO_AS_CONF=$T/stand.conf HALO_KONTINGENT_JSON=$T/kalt.json -- 60)" '^3 Stufe 3'
rm -f $T/stufe.txt
# Nach dem Dienstag-Reset: alter Wert (95 %) gegen Wochenzeit ~0 ergäbe fälschlich Stufe 3
pruefe "jetzt nach resetsAt (Wert noch aus der alten Woche): Fail-open" \
  "$(kont $T/kreset.json 0.95 2026-11-24T00:50:00+0100; D HALO_JETZT=2026-11-24T01:30+01:00 HALO_KONTINGENT_JSON=$T/kreset.json -- 95)" '^0 Fail-open: Reset Di 01:00 vorbei, Wochenwert noch von davor'
pruefe "Nach-Reset-Lücke: resetsAt schon neu, Stand von vor dem Reset: Fail-open" \
  "$(kont $T/kluecke.json 0.95 2026-11-23T23:50:00+0100 1796083200; D HALO_JETZT=2026-11-24T01:30+01:00 HALO_KONTINGENT_JSON=$T/kluecke.json -- 95)" '^0 Fail-open: Wochenwert von vor dem Reset Di 01:00'
pruefe "nach dem Reset mit frischem Wert: rechnet wieder (Wochenzeit 0,3 %)" \
  "$(kont $T/kneu.json 0.01 2026-11-24T01:25:00+0100 1796083200; D HALO_JETZT=2026-11-24T01:30+01:00 HALO_KONTINGENT_JSON=$T/kneu.json -- 1)" '^1 Stufe 1 \(0\.7 Punkte über der Zeit.*Wochenzeit 0\.3 %'
rm -f $T/stufe.txt
print -r -- '{"stand":"2026-11-19T20:10:00+0100","info":{"unifiedWindows":{"seven_day":{"resetsAt":1795478400}}}}' > $T/kohne.json
pruefe "ohne Woche und ohne Wochenwert in kontingent.json: Fail-open" "$(D HALO_KONTINGENT_JSON=$T/kohne.json -- )" '^0 Fail-open: Woche nicht lesbar'
print -r -- "3 20.0 2026-11-19T19:00+00:00 2026-11-19T09:00+00:00" > $T/stufe.txt
pruefe "Fail-open erneuert nur die Zeit (Stufe bleibt Gedächtnis, Marke offen)" "$(D HALO_KONTINGENT_JSON=$T/fehlt.json -- 60 >/dev/null; cat $T/stufe.txt)" \
  '^3 20\.0 2026-11-19T19:12\+00:00 2026-11-19T09:00\+00:00 offen$' '^keine Drossel \(Fail-open\)$' '^kontingent\.json nicht lesbar$'
pruefe "nach Fail-open gilt die Stufe als Gedächtnis weiter (Hysterese)" "$(D -- 54.5)" '^3 Stufe 3 \(14\.5 Punkte über der Zeit, gehalten'
rm -f $T/stufe.txt
pruefe "Rechnung scheitert (Zustand nicht schreibbar): Fail-open" "$(D HALO_DROSSEL_DATEI=/dev/null/x/stufe.txt -- 41)" '^0 Fail-open: Rechnung gescheitert'

# nicht Volldampf, abgeschaltet, Schwellen
pruefe "nicht Volldampf: aus" "$(D HALO_VOLLDAMPF_DATEI=$T/kein-vd.txt -- 60)" '^0 aus \(Volldampf nicht aktiv\)'
print -r -- "2026-11-17T01:00+01:00 2026-12-01T01:00+01:00 2026-11-19T08:00+01:00 98" > $T/vd-beendet.txt
pruefe "Volldampf pausiert (Wochenlimit): aus" "$(D -- 60)" '^0 aus'
rm -f $T/vd-beendet.txt
print -r -- "DROSSEL_AUS=1" > $T/aus.conf
pruefe "DROSSEL_AUS=1 schaltet ab" "$(D HALO_AS_CONF=$T/aus.conf -- 60)" '^0 aus \(DROSSEL_AUS=1\)'
print -l "DROSSEL_STUFE3=20 # Kommentar" "DROSSEL_STUFE2=abc" "DROSSEL_TEMPO_STUNDEN=6" > $T/s3.conf
rm -f $T/stufe.txt
pruefe "Schwelle aus auslastung.conf (Stufe 3 erst über 20), ungültiger und alter Wert übergangen" "$(D HALO_AS_CONF=$T/s3.conf -- 56)" '^2 Stufe 2 \(16\.0 Punkte'
print -r -- "DROSSEL_STUFE3=10" > $T/tr.conf
rm -f $T/stufe.txt
pruefe "tagesroutine.conf gilt nach auslastung.conf" "$(D HALO_AS_CONF=$T/s3.conf HALO_TAGESROUTINE_CONF=$T/tr.conf -- 52)" '^3 Stufe 3'
print -r -- "DROSSEL_HYSTERESE=3" > $T/hy.conf
print -r -- "2 10.0 2026-11-19T19:00+00:00" > $T/stufe.txt
pruefe "DROSSEL_HYSTERESE aus der Konfiguration (3): Stufe 2 bleibt bei d = 3" "$(D HALO_AS_CONF=$T/hy.conf -- 43)" '^2 Stufe 2 \(3\.0 Punkte über der Zeit, gehalten'
pruefe "Probe HALO_DROSSEL_STUFE" "$(D HALO_DROSSEL_STUFE=2 -- 30)" '^2 Stufe 2 \(Probe'
pruefe "keine Hochrechnung mehr (kein Verlauf, kein Tempo)" "$(sed -n '/^DROSSEL_PY=/,/^drossel_stufe()/p' $HIER/lauf-hilfen.zsh | grep -cE 'verlauf|tempo')" '^0$'
exit $FEHLER
