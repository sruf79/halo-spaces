#!/bin/zsh
# Prüft die Entscheidung der Tagesroutine im Trockenlauf (kein Claude, nichts geschrieben), besonders den
# Sparmodus (Maintainer 12.11.2026): Rate = (100 − Ist − Reserve) / Stunden bis zum Reset, nie negativ.
# Die Rechnung liegt in Python im Skript (ENTSCHEID_PY), daher kein node-Test unter tests/logik/.
#   zsh tests/tagesroutine_test.zsh    eine Zeile OK/FEHLER je Prüfung, Exitcode 0 nur bei Erfolg
emulate -L zsh
SKRIPT=${0:A:h}/tagesroutine.sh
REPO=${0:A:h:h}
T=$(mktemp -d); trap 'rm -rf $T' EXIT
: > $T/leer.conf
print 'RESERVE_NACHT=0' > $T/ohne-reserve.conf
FEHLER=0

# lauf <Jetzt> <Woche %> [<5h %>] [<Konfig>] [<Spar-Datei>]
lauf() {
  HALO_JETZT=$1 HALO_KONTINGENT_WOCHE=$2 HALO_KONTINGENT_5H=${3:-10} HALO_KONTINGENT_5H_ENDE= \
  HALO_TAGESROUTINE_CONF=${4:-$T/leer.conf} HALO_SPAR_DATEI=${5:-$T/keine.tsv} HALO_PAUSEN_DATEI=$T/pausen.txt \
  HALO_VOLLDAMPF_DATEI=${HALO_VOLLDAMPF_DATEI:-$T/kein-volldampf.txt} HALO_VOLLDAMPF_BEENDET=$T/volldampf-beendet.txt \
    zsh $SKRIPT --trocken $REPO 2>&1
}
# pruefe <Name> <Ausgabe> <Muster …>  (alle Muster müssen vorkommen, grep -E)
pruefe() {
  local name=$1 aus=$2 m; shift 2
  for m in "$@"; do
    if ! print -r -- "$aus" | grep -qE -- "$m"; then
      print -r -- "FEHLER $name – fehlt: $m"; FEHLER=1
      print -r -- "$aus" | sed 's/^/    /'; return
    fi
  done
  print -r -- "OK     $name"
}

# Do 12.11.2026 09:00 Wien = 08:00 UTC: 56 h seit Di 00:00 UTC, Soll 33.3 %, 112 h bis zum Reset
J9=2026-11-12T09:00:00+01:00
pruefe "Abstand −2: normale Stufen (im Soll, neu beginnen)" "$(lauf $J9 31.3)" \
  'Abstand: -2\.0 Punkte' 'Entscheidung: neu beginnen' 'komplexe Einträge: opus, Routine: sonnet'
pruefe "Abstand +3,7 um 09:00: Sparmodus, Rate (63−15)/112 h = 0.43, noch nichts angespart → warten" "$(lauf $J9 37)" \
  'Abstand: \+3\.7' 'Rate 0\.43 Punkte/h, Rest 63\.0, Reserve 15' 'Modell haiku' 'Entscheidung: Sparmodus: warten' 'nächster Versuch 10:00'
# 12:00: 59 h, Soll 35.1, Rate 48/109 = 0.44, angespart 3 h × 0.44 = 1.32 ≥ 1.0
pruefe "Abstand +1,9 um 12:00: Sparmodus beginnt einen Eintrag mit haiku" "$(lauf 2026-11-12T12:00:00+01:00 37)" \
  'Rate 0\.44' 'angespart 1\.32' 'Entscheidung: Sparmodus: ein Eintrag mit haiku' 'claude -p --model haiku'
pruefe "Abstand +12: wartet bis zur vollen Stunde statt zu enden" "$(lauf $J9 45.3)" \
  'Abstand: \+12\.0' 'deutlich darüber \(> 10\)' 'Entscheidung: warten bis 10:00 – Woche 12\.0 Punkte über dem Soll' \
  'Würde: +kein Claude, warten bis 10:00 .*neu entscheiden'
pruefe "Abstand > SPAR_MAX um 20:10: Wartezeit 21:00 nach LETZTER_BEGINN" "$(lauf 2026-11-12T20:10:00+01:00 50)" \
  'Entscheidung: warten bis 21:00' 'höchstens bis 20:30, sonst Lauf beenden'
# Mo 16.11. 12:00 Wien: 155 h, Soll 92.3; Ist 95 → Rest 5 < Reserve 15 → Rate 0
pruefe "Rest unter der Reserve: Rate 0, nichts Neues" "$(lauf 2026-11-16T12:00:00+01:00 95)" \
  'Rate 0\.00' 'Entscheidung: nichts Neues – Sparmodus: Rest 5\.0 nicht über der Reserve 15'
# kurz vor dem Reset (Mo 16.11. 19:00 Wien, 6 h übrig), Reserve 0: Rest 2 / 6 h = 0.33
pruefe "kurz vor dem Reset: Rate aus Reststunden (2 / 6 h)" "$(lauf 2026-11-16T19:00:00+01:00 98 10 $T/ohne-reserve.conf)" \
  'Rate 0\.33 Punkte/h, Rest 2\.0, Reserve 0 \(noch 6\.0 h'
print -r -- "2026-11-12	10:05	PVTI_x	haiku	37	38	1.0	12	erledigt" > $T/heute.tsv
pruefe "Tagesgrenze: ein Eintrag im Sparmodus je Tag, bis 3 gemessen" "$(lauf 2026-11-12T15:00:00+01:00 37 10 '' $T/heute.tsv)" \
  'Entscheidung: nichts Neues – Sparmodus: heute 1 Eintrag'
print -lr -- "2026-11-10	10:00	a	haiku	30	32	2.0	10	erledigt" "2026-11-10	12:00	b	haiku	32	34	2.0	10	erledigt" \
  "2026-11-11	10:00	c	haiku	34	37	3.0	10	erledigt" > $T/drei.tsv
pruefe "nach 3 Messungen: Kosten = Mittel (2.33), keine Tagesgrenze mehr" "$(lauf 2026-11-12T15:00:00+01:00 37 10 '' $T/drei.tsv)" \
  'Kosten je Eintrag 2\.33 \(Mittel aus 3 Messungen\)' 'Grenze keine'
pruefe "5-Stunden-Fenster ≥ 80 % hat Vorrang vor dem Sparmodus, wartet bis zur vollen Stunde" "$(lauf 2026-11-12T12:00:00+01:00 37 85)" \
  'Entscheidung: warten bis 13:00 – 5-Stunden-Fenster 85 %' 'Pause schreiben, warten bis 13:00'
pruefe "5-Stunden-Fenster: Fensterende vor der vollen Stunde wird genommen" \
  "$(HALO_KONTINGENT_5H_ENDE=2026-11-12T12:20:00+01:00 HALO_JETZT=2026-11-12T12:00:00+01:00 HALO_KONTINGENT_WOCHE=30 \
     HALO_KONTINGENT_5H=90 HALO_TAGESROUTINE_CONF=$T/leer.conf HALO_SPAR_DATEI=$T/keine.tsv HALO_PAUSEN_DATEI=$T/pausen.txt \
     zsh $SKRIPT --trocken $REPO 2>&1)" \
  'Entscheidung: warten bis 12:20' 'Fensterende 12:20'
[[ -e $T/pausen.txt ]] && { print "FEHLER Trockenlauf hat pausen.txt geschrieben"; FEHLER=1 }

# Tageslimit: nur Commits dieses Laufs (Autorzeit in einer eigenen Runde), auch nach einem Rebase von main
G=$T/repo; git init -q -b main $G
gc() { GIT_AUTHOR_DATE="@$1 +0000" GIT_COMMITTER_DATE="@$1 +0000" git -C $G -c user.name=t -c user.email=t@t commit -q --allow-empty -m "$2" }
gc 1000 alt; gc 2000 fremd-vorher; gc 3100 eigen-1; gc 3200 eigen-2; gc 3500 fremd-danach
git -C $G checkout -q -b neu HEAD~4; gc 2500 remote-commit
git -C $G checkout -q main; GIT_COMMITTER_DATE="@9000 +0000" git -C $G -c user.name=t -c user.email=t@t rebase -q neu
zaehl() { HALO_RUNDEN_ZEIT=$1 zsh $SKRIPT --zaehlen $G 2>&1 }
pruefe "Tageslimit zählt nur eigene Commits, nicht fremde, auch nach Rebase von main" "$(zaehl '3000 3300')" \
  'Eigene Commits: 2$' 'eigen-1' 'eigen-2'
pruefe "Tageslimit ohne eigene Runde: 0, obwohl main neu geschrieben ist" "$(zaehl '')" 'Eigene Commits: 0$'
pruefe "Tageslimit mit zwei Runden" "$(zaehl '3000 3150;3400 3600')" 'Eigene Commits: 2$' 'eigen-1' 'fremd-danach'
# „nichts_passend“ (Sparmodus) beendet den Lauf nicht mehr: warten bis zur nächsten vollen Stunde, nur bis 20:30
np() { HALO_JETZT=$1 HALO_TAGESROUTINE_CONF=$T/leer.conf HALO_PAUSEN_DATEI=$T/pausen.txt zsh $SKRIPT --nichts-passend $REPO 2>&1 }
pruefe "nichts_passend um 12:28: warten bis 13:00 statt Ende" "$(np 2026-11-12T12:28:00+01:00)" '^warten [0-9]+$'
pruefe "nichts_passend um 12:28: Wartezeit ist genau 13:00" \
  "$([[ $(np 2026-11-12T12:28:00+01:00) == "warten $(python3 -c 'import datetime as d;print(int(d.datetime.fromisoformat("2026-11-12T13:00:00+01:00").timestamp()))')" ]] && echo gleich)" '^gleich$'
pruefe "nichts_passend um 19:40: noch warten (20:00 liegt vor 20:30)" "$(np 2026-11-12T19:40:00+01:00)" '^warten '
pruefe "nichts_passend um 20:00: Ende (nächste Stunde 21:00 nach 20:30)" "$(np 2026-11-12T20:00:00+01:00)" '^ende$'
# „Plan abgearbeitet“ ist kein Ende (Maintainer 13.11.2026): warten bis zur vollen Stunde, dann neu planen; nur bis 20:30
pruefe "Plan abgearbeitet um 14:20: warten bis 15:00, dann neu planen" "$(lauf 2026-11-12T14:20:00+01:00 30)" \
  'Plan abgearbeitet: ohne Claude warten bis 15:00, dann Kontingent neu lesen und neu planen' '3 Plan-Runden hintereinander ohne erledigten Eintrag'
pruefe "Plan abgearbeitet um 20:10: Ende, kein neuer Plan" "$(lauf 2026-11-12T20:10:00+01:00 30)" \
  'Plan abgearbeitet: Ende \(nächste volle Stunde nach 20:30\), kein neuer Plan'
# Wochenende ab 09:00 (Maintainer 13.11.2026: zuerst 12:00, dann „um 10::00“, zuletzt „Start am Wochenende um 09:00“)
pruefe "Samstag 08:30: noch außerhalb des Zeitfensters" "$(lauf 2026-11-14T08:30:00+01:00 30)" \
  'heute ab 09:00: nein' 'Würde: +nichts tun \(außerhalb des Zeitfensters\)'
pruefe "Sonntag 09:05: im Zeitfenster, Plan-Runde" "$(lauf 2026-11-15T09:05:00+01:00 30)" \
  'heute ab 09:00: ja' 'Würde: +Plan-Runde'
pruefe "Montag 09:05: Werktag ab 09:00" "$(lauf 2026-11-16T09:05:00+01:00 85)" 'heute ab 09:00: ja'
# Volldampf (Maintainer 13.11.2026): Override für Sollkurve und Sparmodus; 5-Stunden-Fenster bremst weiter
print -r -- "volldampf 2026-11-17T01:00+01:00 2026-11-24T01:00+01:00 Probe" > $T/vd.txt
JD=2026-11-17T10:00:00+01:00   # 9 h nach dem Reset, Soll 5.4 %
pruefe "ohne Volldampf: Woche 30 % am Dienstag 10:00 → deutlich über Soll, warten" "$(lauf $JD 30)" \
  'deutlich darüber' 'Entscheidung: warten bis 11:00' 'Volldampf: +keine Zeile' 'Tageslimit 20 eigene'
pruefe "Volldampf aktiv: Sollkurve bremst nicht, Plan-Runde, Tageslimit doppelt" "$(HALO_VOLLDAMPF_DATEI=$T/vd.txt lauf $JD 30)" \
  'Volldampf: +Volldampf aktiv bis 2026-11-24T01:00\+01:00 \(endet bei Wochenlimit\)' '→ Volldampf \(Sollkurve bremst nicht\)' \
  'Entscheidung: neu beginnen' 'komplexe Einträge: opus, Routine: sonnet' 'Tageslimit 40 eigene' 'Würde: +Plan-Runde'
pruefe "Volldampf: Fable bei 5-Stunden-Fenster 55 % erlaubt (unter 60), ohne Soll-Bedingung" "$(HALO_VOLLDAMPF_DATEI=$T/vd.txt lauf $JD 30 55)" \
  'Fable: erlaubt'
pruefe "Volldampf: Fable bei 5-Stunden-Fenster 65 % nicht erlaubt" "$(HALO_VOLLDAMPF_DATEI=$T/vd.txt lauf $JD 30 65)" 'Fable: nein'
pruefe "Volldampf: 5-Stunden-Fenster ≥ 80 % bremst weiter" "$(HALO_VOLLDAMPF_DATEI=$T/vd.txt lauf $JD 30 85)" \
  'Entscheidung: warten bis 11:00 – 5-Stunden-Fenster 85 %'
pruefe "Volldampf angemeldet (Montag): keine Wirkung, nur Vermerk" "$(HALO_VOLLDAMPF_DATEI=$T/vd.txt lauf 2026-11-16T12:00:00+01:00 95)" \
  'Volldampf angemeldet \(ab 2026-11-17T01:00\+01:00, bis 2026-11-24T01:00\+01:00\), nicht aktiv' 'Rate 0\.00' 'Tageslimit 20 eigene'
print -r -- "2026-11-17T01:00+01:00 2026-11-24T01:00+01:00 2026-11-17T08:00+01:00 98" > $T/volldampf-beendet.txt
pruefe "Volldampf beendet (Wochenlimit): normale Regeln, Vermerk" "$(HALO_VOLLDAMPF_DATEI=$T/vd.txt lauf $JD 30)" \
  'Volldampf beendet: Wochenlimit erreicht um 17\.11\. 08:00 \(98 %\)' 'deutlich darüber' 'Tageslimit 20 eigene'
rm -f $T/volldampf-beendet.txt
pruefe "Trockenlauf beendet Volldampf nie (Woche 99 %, kein Marker)" "$(HALO_VOLLDAMPF_DATEI=$T/vd.txt lauf $JD 99)" 'Volldampf aktiv'
[[ -e $T/volldampf-beendet.txt ]] && { print "FEHLER Trockenlauf hat volldampf-beendet.txt geschrieben"; FEHLER=1 }
exit $FEHLER
