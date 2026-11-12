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
pruefe "Abstand +12: nichts Neues bis morgen" "$(lauf $J9 45.3)" \
  'Abstand: \+12\.0' 'deutlich darüber \(> 10\)' 'Entscheidung: nichts Neues – Woche 12\.0 Punkte über dem Soll'
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
pruefe "5-Stunden-Fenster ≥ 80 % hat Vorrang vor dem Sparmodus" "$(lauf 2026-11-12T12:00:00+01:00 37 85)" \
  'Entscheidung: nichts Neues – 5-Stunden-Fenster 85 %'
exit $FEHLER
