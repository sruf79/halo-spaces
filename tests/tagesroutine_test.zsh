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
  HALO_ZR_TB=${HALO_ZR_TB:-0} zsh $SKRIPT --trocken $REPO 2>&1
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
  'Plan abgearbeitet: ohne Claude warten bis 15:00, dann Kontingent neu lesen und neu planen' \
  'leerer Plan genauso \(warten, neu planen, kein Ende\)' '3 Plan-Runden hintereinander mit Einträgen, aber ohne erledigten'
pruefe "Plan abgearbeitet um 20:10: Ende, kein neuer Plan" "$(lauf 2026-11-12T20:10:00+01:00 30)" \
  'Plan abgearbeitet: Ende \(nächste volle Stunde nach 20:30\), kein neuer Plan'
# Wochenende ab 09:00 (Maintainer 13.11.2026: zuerst 12:00, dann „um 10::00“, zuletzt „Start am Wochenende um 09:00“)
pruefe "Samstag 08:30: noch außerhalb des Zeitfensters, wartet ohne Claude bis 09:00 (16.11.2026)" "$(lauf 2026-11-14T08:30:00+01:00 30)" \
  'heute ab 09:00: nein' 'Würde: +ohne Claude warten bis 09:00'
pruefe "Sonntag 09:05: im Zeitfenster, Plan-Runde" "$(lauf 2026-11-15T09:05:00+01:00 30)" \
  'heute ab 09:00: ja' 'Würde: +Plan-Runde'
pruefe "Montag 09:05: Werktag ab 09:00" "$(lauf 2026-11-16T09:05:00+01:00 85)" 'heute ab 09:00: ja'
# Volldampf (Maintainer 13.11.2026): Override für Sollkurve und Sparmodus; 5-Stunden-Fenster bremst weiter
print -r -- "volldampf 2026-11-17T01:00+01:00 2026-11-24T01:00+01:00 Probe" > $T/vd.txt
JD=2026-11-17T10:00:00+01:00   # 9 h nach dem Reset, Soll 5.4 %
pruefe "ohne Volldampf: Woche 30 % am Dienstag 10:00 → deutlich über Soll, warten" "$(lauf $JD 30)" \
  'deutlich darüber' 'Entscheidung: warten bis 11:00' 'Volldampf: +keine Zeile' 'Tageslimit 20 eigene'
pruefe "Volldampf aktiv: Sollkurve bremst nicht, Plan-Runde, kein Tageslimit für Commits (17.11.2026)" "$(HALO_VOLLDAMPF_DATEI=$T/vd.txt lauf $JD 30)" \
  'Volldampf: +Volldampf aktiv bis 2026-11-24T01:00\+01:00 \(endet bei Wochenlimit\)' '→ Volldampf \(Sollkurve bremst nicht\)' \
  'Entscheidung: neu beginnen' 'komplexe Einträge: opus, Routine: sonnet' 'kein Tageslimit für Commits \(Volldampf\)' 'Würde: +Plan-Runde'
# Volldampf = maximale Produktivität (Maintainer 17.11.2026): Commit-Grenze, Zwischen-Release, Nachtlauf-Grenzen
print 'MAX_COMMITS_VOLLDAMPF=100' > $T/vd100.conf
pruefe "Volldampf: MAX_COMMITS_VOLLDAMPF aus der Konfiguration" "$(HALO_VOLLDAMPF_DATEI=$T/vd.txt lauf $JD 30 10 $T/vd100.conf)" 'Tageslimit 100 eigene'
pruefe "ohne Volldampf: Zwischen-Release aus, Tageslimit unverändert" "$(lauf 2026-11-17T10:00:00+01:00 3)" \
  'Zwischen-Release: aus \(nur im Volldampf\)' 'Tageslimit 20 eigene'
pruefe "Volldampf: Trockenlauf nennt den Wächter tests/zwischen-schleife.zsh" "$(HALO_VOLLDAMPF_DATEI=$T/vd.txt lauf $JD 30)" \
  'Zwischen-Release: Wächter tests/zwischen-schleife.zsh läuft'
print -r -- "2026-11-17T01:00+01:00 2026-11-24T01:00+01:00 2026-11-17T08:00+01:00 98" > $T/volldampf-beendet.txt
pruefe "Volldampf beendet: Zwischen-Release aus, Tageslimit normal" "$(HALO_VOLLDAMPF_DATEI=$T/vd.txt lauf $JD 30)" \
  'Zwischen-Release: aus' 'Tageslimit 20 eigene'
rm -f $T/volldampf-beendet.txt
pruefe "Skript: Commit-Grenze nur wenn MAX_COMMITS > 0; kein eigener Push nach main, kein Release, keine eigene Zwischen-Release-Runde" \
  "$(grep -c 'MAX_COMMITS > 0 && \$(eigene_commits_zahl)' $SKRIPT; grep -E -c '^[^#]*(push[^|;]* origin[^|;]* HEAD:main|release\.sh|publish\.sh|zwischen-release\.zsh)' $SKRIPT)" '^1$' '^0$'
pruefe "Nachtlauf: Volldampf hebt Fortsetzungen und Commit-Grenze an (50/40), normal 4/6" \
  "$(grep -E 'VD_FORTSETZ_MAX=|VD_MAX_COMMITS=|NACHT_MAX_COMMITS=\$VD_MAX_COMMITS FORTSETZ_MAX=\$VD_FORTSETZ_MAX|NACHT_MAX_COMMITS=\$NORMAL_MAX_COMMITS FORTSETZ_MAX=4' $REPO/tests/nachtlauf.sh)" \
  'VD_FORTSETZ_MAX:-50' 'VD_MAX_COMMITS:-40' 'NACHT_MAX_COMMITS=\$VD_MAX_COMMITS FORTSETZ_MAX=\$VD_FORTSETZ_MAX' 'NORMAL_MAX_COMMITS FORTSETZ_MAX=4'
pruefe "Auftrag: Abschnitt Zwischen-Release über den Wächter, nie selbst" "$(<$REPO/tests/tagesroutine-auftrag.md)" \
  'Zwischen-Release \(Volldampf' 'tests/zwischen-schleife\.zsh' 'nie du'
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
# Beginn 08:45 nur mit Volldampf (Maintainer 16.11.2026: „nur solange volldampf läuft“); LaunchAgent startet 08:45
J845=2026-11-17T08:45:00+01:00
pruefe "ohne Volldampf 08:45: außerhalb, wartet ohne Claude bis 09:00" "$(lauf $J845 3)" \
  'heute ab 09:00: nein' 'Würde: +ohne Claude warten bis 09:00 \(Beginn ohne Volldampf\)'
pruefe "Volldampf 08:45: Zeitfenster ab 08:45, Plan-Runde" "$(HALO_VOLLDAMPF_DATEI=$T/vd.txt lauf $J845 3)" \
  'mit Volldampf ab 08:45' 'heute ab 08:45: ja' 'Würde: +Plan-Runde'
pruefe "Volldampf Samstag 08:45: auch am Wochenende ab 08:45" "$(HALO_VOLLDAMPF_DATEI=$T/vd.txt lauf 2026-11-21T08:45:00+01:00 30)" \
  'heute ab 08:45: ja'
pruefe "Volldampf 08:30: noch vor dem Beginn, wartet bis 08:45" "$(HALO_VOLLDAMPF_DATEI=$T/vd.txt lauf 2026-11-17T08:30:00+01:00 3)" \
  'heute ab 08:45: nein' 'warten bis 08:45'
pruefe "ohne Volldampf 07:00: nichts tun (mehr als 60 Min. vor dem Beginn)" "$(lauf 2026-11-17T07:00:00+01:00 3)" \
  'Würde: +nichts tun \(außerhalb des Zeitfensters\)'
pruefe "ohne Volldampf 09:05: Beginn 09:00 unverändert" "$(lauf 2026-11-17T09:05:00+01:00 3)" 'heute ab 09:00: ja'
pruefe "Skript wartet vor dem Beginn auf WARTE_START, dann neu entscheiden" "$(grep -c 'E\[WARTE_START\]' $SKRIPT)" '^[3-9]'
pruefe "Skript wartet auf das Ende des Nachtlaufs (lauf.lock) vor der ersten Runde" "$(grep -c 'lauf.lock.*kill -0' $SKRIPT)" '^[1-9]'
pruefe "LaunchAgent: sieben Tage 08:45" "$(grep -A2 'pruefe_agent "Tagesroutine"' $REPO/tests/mac-mini-setup.sh)" \
  'for t in 1 2 3 4 5 6 0;.*<integer>8</integer>.*<integer>45</integer>'
# Häufung (Maintainer 14.11.2026: „der automatismus soll natürlich bei der tagesroutine und auch bei der
# nachtroutine automatisch eingesetzt werden“): jede Plan-Runde ruft tests/haeufung.py, Gruppen gehen in den Auftrag
pruefe "Häufung: Trockenlauf nennt den Aufruf vor jeder Plan-Runde" "$(lauf 2026-11-15T09:05:00+01:00 30)" \
  'Häufung: +vor jeder Plan-Runde python3 .*haeufung\.py' 'Würde: +Plan-Runde'
pruefe "Häufung: Plan-Runde gibt die Zeile „Häufung (Skript)“ in den Auftrag" \
  "$(grep -c 'JETZT: Plan-Runde.*Häufung (Skript): \$HAEUFUNG' $SKRIPT)" '^1$'
pruefe "Häufung: Auftrag Schritt 2 macht die Gruppen verbindlich" "$(<$REPO/tests/tagesroutine-auftrag.md)" \
  'tests/haeufung.py' 'Diese Gruppen sind verbindlich' 'direkt hintereinander' 'Skript gescheitert'
eval "$(sed -n '/^haeufung_zeile()/,/^}/p' $SKRIPT)"
print -r -- '{"items":[{"id":"a","status":"Todo","title":"Mail-Toolbar: Spacer wie in Apple Mail"},
 {"id":"b","status":"Todo","title":"Mailfenster: Toolbar-Knöpfe ohne Hover-Kreise"},
 {"id":"c","status":"Todo","title":"Kalender: Mini-Kalender näher an den Rand"}]}' > $T/board.json
pruefe "Häufung: Plan-Runde bekommt Gruppe und Zuschlag aus dem Skript" \
  "$(DIR=$T TAG=2026-11-15 HAEUFUNG_SKRIPT=$REPO/tests/haeufung.py HALO_HAEUFUNG_EINGABE=$T/board.json haeufung_zeile; \
     grep '^gruppe' $T/2026-11-15-haeufung.tsv)" \
  'Häufung: 1 Gruppen aus 3 offenen Einträgen \(G1 2\)' 'verbindlich' $'^gruppe\tG1\t2\t0\.5\t1\ta,b\t'
print kaputt > $T/kaputt.json
pruefe "Häufung: Skript scheitert → Rückfall-Zeile, Plan-Runde läuft trotzdem" \
  "$(DIR=$T TAG=2026-11-15 HAEUFUNG_SKRIPT=$REPO/tests/haeufung.py HALO_HAEUFUNG_EINGABE=$T/kaputt.json haeufung_zeile; print rc=$?)" \
  '^FEHLER, Skript gescheitert .*selbst gruppieren' 'rc=0'
# Designer (Freigabe des Maintainers 14.11.2026): Design-Einträge mit mindestens Opus, Designfragen sofort aufs iPhone
pruefe "Designer: Trockenlauf nennt Design-Einträge mit Opus" "$(lauf 2026-11-15T09:05:00+01:00 30)" \
  'Designer: +Einträge „design“ mit opus \(Director beauftragt den Designer, Designfragen sofort aufs iPhone\)'
eval "$(sed -n '/^designer_modell()/,/^}/p;/^designfrage_melden()/,/^}/p' $SKRIPT)"
pruefe "Designer: Modell opus bleibt, sonnet wird nicht beauftragt" \
  "$(designer_modell opus; designer_modell claude-opus-5-5; designer_modell fable; print -n x; designer_modell sonnet; print y)" \
  '^opus$' '^claude-opus-5-5$' '^fable$' '^xy$'
dm() { ( source $REPO/tests/lauf-hilfen.zsh; LOG=/dev/null HALO_PUSH_TROCKEN=1 HALO_HANDELN_LOG=$T/handeln.log designfrage_melden "$@" ) 2>&1 }
pruefe "Designer: vorschau meldet sofort als [handeln] mit Link" \
  "$(dm design 'Mail-Toolbar: Spacer' 'vorschau PVTI_x https://claude.ai/artifact/abc Welche Variante, A oder B?')" \
  'TROCKEN: push \[handeln\] Designfrage „Mail-Toolbar: Spacer“: Welche Variante, A oder B\? – Bilder: https://claude.ai/artifact/abc' '^sofort$'
pruefe "Designer: Meldung steht im handeln-Log" "$(<$T/handeln.log)" 'tagesroutine Designfrage „Mail-Toolbar: Spacer“'
pruefe "Designer: entscheidung eines Design-Eintrags sofort" "$(dm design 'Sidebar: Schrift' 'entscheidung Größe wie Mail oder wie Kalender?')" \
  'push \[handeln\] Designfrage „Sidebar: Schrift“: Größe wie Mail oder wie Kalender\?' '^sofort$'
pruefe "Designer: entscheidung ohne Design bleibt fürs Tagesende (keine Meldung)" "$(dm komplex 'Code: Module' 'entscheidung Reihenfolge?'; print ende)" '^ende$'
pruefe "Designer: erledigt meldet nichts" "$(dm design 'X' 'erledigt abc123'; print ende)" '^ende$'
pruefe "Designer: Auftrag kennt vorschau, Einstufung design und den Designer-Auftrag" "$(<$REPO/tests/tagesroutine-auftrag.md)" \
  'vorschau <id> <Link> <Frage>' '<komplex\|routine\|design>' 'tests/designer-auftrag.md' 'SOFORT als' 'kein Design-Eintrag'
pruefe "Designer: Eintragsrunde gibt Design-Einträgen den Designer-Kopf" "$(grep -c 'Design-Eintrag: Du bist der Director' $SKRIPT)" '^1$'
# Leerer Plan ist kein Ende (Berichtigung von neon 14.11.2026 zur Entscheidung 13.11.2026)
eval "$(sed -n '/^nichts_passend_weiter()/,/^}/p;/^nach_plan()/,/^}/p' $SKRIPT)"
ts() { python3 -c 'import sys,datetime as d;print(int(d.datetime.fromisoformat(sys.argv[1]).timestamp()))' $1 }
L=$(ts 2026-11-14T20:30:00+01:00)
pruefe "Leerer Plan in Runde 1 um 09:10: warten bis 10:00 statt Ende, Zähler bleibt 0" \
  "$(nach_plan 0 0 0 $(ts 2026-11-14T09:10:00+01:00) $L)" "^warten $(ts 2026-11-14T10:00:00+01:00) 0\$"
pruefe "Leerer Plan in Runde 3 um 15:06: warten bis 16:00, Zähler bleibt 2" \
  "$(nach_plan 0 0 2 $(ts 2026-11-14T15:06:00+01:00) $L)" "^warten $(ts 2026-11-14T16:00:00+01:00) 2\$"
pruefe "Leerer Plan um 20:10: Ende (nächste volle Stunde nach 20:30)" "$(nach_plan 0 0 0 $(ts 2026-11-14T20:10:00+01:00) $L)" '^ende 0$'
pruefe "Plan mit Einträgen, keiner erledigt, dritter in Folge: Leerlauf-Ende" "$(nach_plan 2 0 2 $(ts 2026-11-14T15:06:00+01:00) $L)" '^leerlauf 3$'
pruefe "Plan mit Einträgen, einer erledigt: Zähler zurück auf 0, warten" "$(nach_plan 2 1 2 $(ts 2026-11-14T15:06:00+01:00) $L)" '^warten [0-9]+ 0$'
pruefe "Leere Pläne zählen nicht zum Leerlauf: viele leere Runden ohne Ende" \
  "$(o=0; for i in 1 2 3 4 5; do w=(${=$(nach_plan 0 0 $o $(ts 2026-11-14T1${i}:10:00+01:00) $L)}); o=$w[-1]; print -n "$w[1] "; done)" '^(warten ){5}$'
pruefe "Skript: kein Ende mehr mit „kein Plan in Plan-Runde“" "$(grep -c 'kein Plan in Plan-Runde' $SKRIPT)" '^0$'
pruefe "Skript: Bericht „Plan-Runde n: 0 Einträge, nächste Planung“" "$(grep -c '0 Einträge, nächste Planung' $SKRIPT)" '^[1-9]'
exit $FEHLER
