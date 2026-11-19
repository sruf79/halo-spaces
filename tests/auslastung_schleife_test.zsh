#!/bin/zsh
# Prüft den Auslastungswächter tests/auslastung-schleife.zsh (Volldampf, Maintainer 17.11.2026) ohne Claude, ohne
# Thunderbird, ohne Netz: Entscheidung im Trockenlauf (Sollkurve 48 h, Schwellen, Tag/Nacht, Pausen, Doppelstart,
# Ende), feste Regeln im Skript und im Auftrag.
#   zsh tests/auslastung_schleife_test.zsh   eine Zeile OK/FEHLER je Fall, Exitcode 1 bei einem Fehler
emulate -L zsh
HIER=${0:A:h}
SKRIPT=$HIER/auslastung-schleife.zsh
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
print -r -- "volldampf 2026-11-17T01:00+01:00 2026-11-24T01:00+01:00 Probe" > $T/vd.txt
: > $T/leer.conf
# Aufgabenliste für die Vorprüfung (Maintainer 19.11.2026): Standard ein freier Bug
print -r -- '{"items":[{"id":"PVTI_frei12345","typ":"Bug","status":"Todo","title":"Mail: freier Bug","body":"Text"}]}' > $T/board.json
# W [VAR=Wert …]: Trockenlauf; Standard Di 17.11. 15:00 (14 h nach dem Reset, Soll 29,2 %), Woche 27 %, 5 Stunden 40 %,
# 1 Arbeits-Sitzung, kein Fable, kein Nachtlauf, letzter Start lange her
W() {
  env HALO_VOLLDAMPF_DATEI=$T/vd.txt HALO_VOLLDAMPF_BEENDET=$T/vd-beendet.txt HALO_JETZT=2026-11-17T15:00+01:00 \
    HALO_PAUSEN_DATEI=$T/pausen.txt HALO_AS_CONF=$T/leer.conf HALO_AS_DIR=$T/nacht HALO_AS_WT=$T/wt \
    HALO_AS_WOCHE=27 HALO_AS_5H=40 HALO_AS_STATUS=allowed HALO_AS_AKTIV=1 HALO_AS_FABLE=0 HALO_AS_NACHTLAUF=nein \
    HALO_AS_LETZTER=0 HALO_AS_NEON_STAND=$T/kein-stand.md HALO_AS_BELEGT= HALO_AS_BOARD=$T/board.json HALO_WOCHENANKER=$T/anker.txt HALO_WOCHENSTAND=$T/stand.txt HALO_ZR_FAELLIG=$T/kein-zf.txt \
    HALO_DROSSEL_STUFE=0 HALO_DROSSEL_DATEI=$T/drossel.txt HALO_DROSSEL_VERLAUF=$T/verlauf.json HALO_TAGESROUTINE_CONF=$T/leer.conf "$@" zsh $SKRIPT --trocken 2>&1
}

# Sollkurve (48 h ab Di 00:00 UTC = 01:00 Wiener Zeit)
pruefe "Soll 15:00 Di: 14 h seit Reset, 29,2 %" "$(W)" 'Soll 29\.2 % \(14\.0 h seit Reset\)'
pruefe "Soll Mi 13:00: 36 h, 75 %" "$(W HALO_JETZT=2026-11-18T13:00+01:00)" 'Soll 75\.0 % \(36\.0 h'
pruefe "Soll Do 01:00 (48 h): 100 %, danach gedeckelt" "$(W HALO_JETZT=2026-11-20T12:00+01:00 HALO_AS_WOCHE=90)" 'Soll 100\.0 %'
print -r -- "volldampf 2026-11-10T01:00+01:00 2026-11-24T01:00+01:00 Probe" > $T/vd2.txt
pruefe "Reset Di 00:59 Wiener Zeit gehört zur Vorwoche (168,0 h, Soll 100 %)" "$(W HALO_VOLLDAMPF_DATEI=$T/vd2.txt HALO_JETZT=2026-11-17T00:59+01:00 HALO_AS_WOCHE=50)" 'Soll 100\.0 % \(168\.0 h'
pruefe "Reset Di 01:00 Wiener Zeit: 0 h" "$(W HALO_JETZT=2026-11-17T01:00+01:00 HALO_AS_WOCHE=0 HALO_AS_5H=0 HALO_AS_AKTIV=0)" '0\.0 h seit Reset'

# Tag: Schwellen
pruefe "Tag, unter Soll: Worker mit opus" "$(W)" '^Prüfung:  starten opus unter dem Soll' 'Würde:    Worker mit opus'
# Vorrang für ein fälliges Zwischen-Release (neon-Auftrag #48): frische Marke → kein Worker; alt, tot oder fehlend → wie sonst
print -r -- "$(( $(date +%s) - 300 )) - fc2701d0000 pruef/sammel-fehler-1119 11:54" > $T/zf.txt
pruefe "Zwischen-Release fällig (frische Marke): kein neuer Worker" "$(W HALO_ZR_FAELLIG=$T/zf.txt)" \
  '^Prüfung:  warten Zwischen-Release fällig \(Stand fc2701d \(pruef/sammel-fehler-1119\) seit 11:54\) – keine neuen Worker$'
pruefe "Zwischen-Release fällig: auch kein Windows-Rundgang (5 Stunden 90 %)" "$(W HALO_ZR_FAELLIG=$T/zf.txt HALO_AS_5H=90)" 'warten Zwischen-Release fällig'
print -r -- "$(( $(date +%s) - 3700 )) - fc2701d0000 pruef/x 11:54" > $T/zf-alt.txt
pruefe "Marke älter als 60 Min.: Worker wie sonst" "$(W HALO_ZR_FAELLIG=$T/zf-alt.txt)" '^Prüfung:  starten opus unter dem Soll'
print -r -- "$(date +%s) 999999 fc2701d0000 pruef/x 11:54" > $T/zf-tot.txt
pruefe "Marke eines beendeten Wächters (PID tot): Worker wie sonst" "$(W HALO_ZR_FAELLIG=$T/zf-tot.txt)" '^Prüfung:  starten opus unter dem Soll'
pruefe "Tag, über Soll, 5 Stunden 40 %: Worker (Fenster unter 60 %)" "$(W HALO_AS_WOCHE=35)" 'starten opus 5-Stunden-Fenster unter 60'
pruefe "Tag, über Soll, 5 Stunden 60 %: warten" "$(W HALO_AS_WOCHE=35 HALO_AS_5H=60)" 'warten im Soll und 5-Stunden-Fenster ab 60'
pruefe "Tag, unter Soll, 5 Stunden 90 %: warten (FENSTER_STOPP)" "$(W HALO_AS_5H=90)" 'warten 5-Stunden-Fenster ab 90'
# Aufgabenzuteilung nach Aufwand (Maintainer 18.11.2026: „ich folge allen empfehlungen von dir.“, Empfehlung 1): ab 70 % nur tokenarm
pruefe "Tag, unter Soll, 5 Stunden 70 %, ein Worker läuft: tokenarmer Worker mit sonnet" "$(W HALO_AS_5H=70 HALO_AS_TOKENARM=0)" \
  '^Prüfung:  starten sonnet tokenarm \(5-Stunden-Fenster ab 70 %' 'Würde:    Worker mit sonnet starten, Klasse tokenarm'
pruefe "Tag, unter Soll, 5 Stunden 70 %, kein Worker läuft: auch dann nur tokenarm (kein opus)" "$(W HALO_AS_5H=70 HALO_AS_AKTIV=0 HALO_AS_TOKENARM=0)" 'starten sonnet tokenarm'
pruefe "5 Stunden 70 %, ein tokenarmer Worker läuft schon: warten (TOKENARM_MAX 1)" "$(W HALO_AS_5H=70 HALO_AS_TOKENARM=1)" \
  'warten 5-Stunden-Fenster ab 70 % \(Drossel: nur tokenarm, 1 tokenarme Worker aktiv, Grenze 1\)'
pruefe "5 Stunden 69 %: noch tokenschwer (opus, Klasse normal)" "$(W HALO_AS_5H=69 HALO_AS_TOKENARM=0)" 'starten opus unter dem Soll' 'Klasse normal'
pruefe "5 Stunden 75 %, Soll weit verfehlt: kein Fable, nur tokenarm" "$(W HALO_AS_5H=75 HALO_AS_WOCHE=5 HALO_AS_TOKENARM=0)" 'starten sonnet tokenarm'
pruefe "5 Stunden 75 %, über dem Soll: warten (Soll gilt auch für tokenarm)" "$(W HALO_AS_5H=75 HALO_AS_WOCHE=35 HALO_AS_TOKENARM=0)" 'warten im Soll'
pruefe "5 Stunden 75 %, nachts unter Soll: tokenarm" "$(W HALO_JETZT=2026-11-18T03:00+01:00 HALO_AS_WOCHE=40 HALO_AS_5H=75 HALO_AS_TOKENARM=0)" 'starten sonnet tokenarm .*nachts'
print -l "MODELL_TOKENARM=haiku" "TOKENARM_MAX=2" > $T/tokenarm.conf
pruefe "MODELL_TOKENARM und TOKENARM_MAX aus der Datei" "$(W HALO_AS_CONF=$T/tokenarm.conf HALO_AS_5H=75 HALO_AS_TOKENARM=1)" 'starten haiku tokenarm'
mkdir -p $T/nacht/auslastung
print -r -- "$$ sid sonnet 1 /wt pruef/x /erg tokenarm" > $T/nacht/auslastung/worker-3
print -r -- "$$ sid opus 1 /wt pruef/y /erg normal" > $T/nacht/auslastung/worker-4
print -r -- "999999 sid sonnet 1 /wt pruef/z /erg tokenarm" > $T/nacht/auslastung/worker-5
pruefe "tokenarme Worker aus den Zustandsdateien gezählt (lebend, Feld 8)" "$(W HALO_AS_5H=75 HALO_AS_TOKENARM=)" 'Drossel: nur tokenarm, 1 tokenarme Worker aktiv'
rm -f $T/nacht/auslastung/worker-<3-5>
pruefe "Fenster-Takt: 40 % nach 19 Min. (Reserve 25): warten" "$(W HALO_AS_5H=40 HALO_FENSTER_REST=16860)" 'warten Fenster-Takt'
pruefe "Fenster-Takt: 20 % nach 19 Min.: starten" "$(W HALO_AS_5H=20 HALO_FENSTER_REST=16860)" 'starten opus'
pruefe "Fenster-Takt: 60 % nach 3 h (Soll 60+25): starten" "$(W HALO_AS_5H=60 HALO_FENSTER_REST=7200)" 'starten opus'
pruefe "Fenster-Takt: gemeinsame Rechnung fenster_takt aus lauf-hilfen.zsh (auch Tagesroutine)" \
  "$(source $HIER/lauf-hilfen.zsh 2>/dev/null; fenster_takt 16860 25; fenster_takt 7200 25; fenster_takt 20000 25 || print unbekannt; fenster_takt '' || print leer)" '^31
85
unbekannt
leer$'
pruefe "Fenster-Takt: Wächter rechnet nicht selbst" "$(grep -vE '^[[:space:]]*#' $SKRIPT | grep -cE 'fenster_takt "\$rest"|18000')" '^1$'
# Kontingent-Drossel (Maintainer 19.11.2026: „ja umbauen und so rasch wie möglich live schalten“, drossel_stufe in lauf-hilfen.zsh)
pruefe "Drossel Stufe 1: kein neuer Worker, auch bei 5 Stunden 40 % (unter FENSTER_MIN)" "$(W HALO_DROSSEL_STUFE=1 HALO_AS_WOCHE=35)" '^Prüfung:  warten Drossel Stufe 1'
pruefe "Drossel Stufe 2 und 3: kein Worker, auch kein tokenarmer" "$(W HALO_DROSSEL_STUFE=2; W HALO_DROSSEL_STUFE=3 HALO_AS_5H=75 HALO_AS_TOKENARM=0)" 'warten Drossel Stufe 2' 'warten Drossel Stufe 3'
pruefe "Drossel Stufe 0: Lage nennt sie, Worker startet" "$(W HALO_DROSSEL_STUFE=0)" 'starten opus .*; Drossel Stufe 0'
print -r -- '{"punkte":[{"t":"2026-11-17T08:00:00Z","woche":10},{"t":"2026-11-17T11:00:00Z","woche":25}]}' > $T/verlauf-schnell.json
pruefe "Drossel echt gerechnet ((27−10)/6 h, voll lange vor dem Reset): Stufe 3, Zustand geschrieben? nein im Trockenlauf" \
  "$(W HALO_DROSSEL_STUFE= HALO_DROSSEL_VERLAUF=$T/verlauf-schnell.json; ls $T/drossel.txt 2>&1)" \
  'warten Drossel Stufe 3 \([0-9]+ Fehlstunden.*Tempo 2\.83 Punkte/h über 6\.0 h Verlauf' 'No such file'
pruefe "Drossel: Schleife hält den Zustand frisch, auch wenn pruefen vorher zurückkehrte" "$(grep -c '\[\[ \$z == \*Drossel\* \]\] || drossel_stufe >/dev/null' $SKRIPT)" '^1$'
pruefe "Drossel nur im Volldampf" "$(W HALO_DROSSEL_STUFE= HALO_DROSSEL_VERLAUF=$T/verlauf-schnell.json HALO_VOLLDAMPF_DATEI=$T/kein-vd.txt)" 'ende Volldampf nicht aktiv'
pruefe "Drossel: 30 Min. nach dem Reset zu wenig Daten → Fail-open, Lage nennt es, Worker startet" "$(W HALO_DROSSEL_STUFE= HALO_DROSSEL_VERLAUF=$T/fehlt.json HALO_JETZT=2026-11-17T01:30+01:00 HALO_AS_WOCHE=0 HALO_AS_5H=0)" 'starten opus .*Drossel Fail-open'
pruefe "Fable: 20 Punkte unter Soll, 5 Stunden 40 %, kein Fable-Lauf" "$(W HALO_AS_WOCHE=9)" 'starten fable Soll weit verfehlt'
pruefe "Fable auch bei laufendem Fable-Lauf (keine Mengengrenze im Volldampf, 17.11.2026)" "$(W HALO_AS_WOCHE=9 HALO_AS_FABLE=1)" 'starten fable'
pruefe "kein Fable bei 5 Stunden 50 %" "$(W HALO_AS_WOCHE=9 HALO_AS_5H=50)" 'starten opus'
pruefe "kein Fable bei nur 19 Punkten unter Soll" "$(W HALO_AS_WOCHE=11)" 'starten opus'

# Grenze der Arbeits-Sitzungen
pruefe "4 Arbeits-Sitzungen aktiv: warten (Standard 4)" "$(W HALO_AS_AKTIV=4)" 'warten 4 Arbeits-Sitzungen aktiv \(Grenze 4\)'
pruefe "3 aktiv: noch ein Worker" "$(W HALO_AS_AKTIV=3)" 'starten'
print -r -- "MAX_WORKER=6   # Probe" > $T/sechs.conf
pruefe "MAX_WORKER=6 aus der Datei: 5 aktiv → starten" "$(W HALO_AS_CONF=$T/sechs.conf HALO_AS_AKTIV=5)" 'starten'
print -r -- "MAX_WORKER=20" > $T/zwanzig.conf
pruefe "MAX_WORKER=20 auf 8 begrenzt" "$(W HALO_AS_CONF=$T/zwanzig.conf HALO_AS_AKTIV=8)" 'Grenze 8\)'
print -l "UNBEKANNT=1" "MODELL=sonnet" > $T/modell.conf
pruefe "MODELL aus der Datei, unbekannte Schlüssel übergangen" "$(W HALO_AS_CONF=$T/modell.conf)" 'starten sonnet'

# Nacht (00:00–09:00 oder Nachtlauf läuft): Grenze MAX_WORKER − 1, nur unter Soll
pruefe "Nacht 03:00, unter Soll, 2 aktiv: starten" "$(W HALO_JETZT=2026-11-18T03:00+01:00 HALO_AS_WOCHE=40 HALO_AS_AKTIV=2)" 'starten opus unter dem Soll .*nachts'
pruefe "Nacht 03:00, 4 aktiv: warten (Grenze 4, keine Nachtabsenkung)" "$(W HALO_JETZT=2026-11-18T03:00+01:00 HALO_AS_WOCHE=40 HALO_AS_AKTIV=4)" 'warten 4 Arbeits-Sitzungen aktiv \(Grenze 4\)'
pruefe "Nacht 03:00, über Soll, 5 Stunden 10 %: warten (nachts nur unter Soll)" "$(W HALO_JETZT=2026-11-18T03:00+01:00 HALO_AS_WOCHE=70 HALO_AS_5H=10)" 'warten nachts nur unter dem Soll'
pruefe "08:59 noch Nacht, 09:00 Tag" "$(W HALO_JETZT=2026-11-18T08:59+01:00 HALO_AS_WOCHE=70 HALO_AS_5H=10)" 'nachts nur'
pruefe "09:00 Tag: über Soll, 5 Stunden 10 % → starten" "$(W HALO_JETZT=2026-11-18T09:00+01:00 HALO_AS_WOCHE=70 HALO_AS_5H=10)" 'starten opus 5-Stunden-Fenster'
pruefe "Nachtlauf läuft um 10:00 (lauf.lock): gleiche Grenze wie tagsüber" "$(W HALO_AS_NACHTLAUF=ja HALO_AS_AKTIV=4)" 'Grenze 4\)'
pruefe "23:30: kein Zeitende, Tagregeln" "$(W HALO_JETZT=2026-11-17T23:30+01:00 HALO_AS_WOCHE=40)" 'starten'

# Doppelstart, Pausen, Ende
pruefe "letzter Start vor 5 Minuten: warten" "$(W HALO_AS_LETZTER=$(( $(date -j -f %Y-%m-%dT%H:%M%z 2026-11-17T14:55+0100 +%s) )))" 'warten letzter Worker vor weniger als 10 Minuten'
pruefe "letzter Start vor 11 Minuten: starten" "$(W HALO_AS_LETZTER=$(( $(date -j -f %Y-%m-%dT%H:%M%z 2026-11-17T14:49+0100 +%s) )))" 'starten'
print -r -- "auslastung 2099-01-01T00:00+01:00 Probe" > $T/pausen.txt
pruefe "Pause auslastung: warten" "$(W)" 'warten Pause bis 2099'
print -r -- "alle 2099-01-01T00:00+01:00 Probe" > $T/pausen.txt
pruefe "Pause alle: warten" "$(W)" 'warten Pause'
print -r -- "auslastung 2026-11-17T14:00+01:00 abgelaufen" > $T/pausen.txt
pruefe "abgelaufene Pause zählt nicht" "$(W)" 'starten'
rm -f $T/pausen.txt
pruefe "ohne Volldampf: Ende" "$(W HALO_VOLLDAMPF_DATEI=$T/keine.txt)" 'ende Volldampf nicht aktiv'
pruefe "nach dem Volldampf-Fenster: Ende" "$(W HALO_JETZT=2026-11-24T02:00+01:00)" 'ende Volldampf nicht aktiv'
print -r -- "2026-11-17T01:00+01:00 2026-11-24T01:00+01:00 2026-11-18T08:00+01:00 98" > $T/vd-beendet.txt
# Wochenlimit pausiert nur (Maintainer 18.11.2026): warten statt Ende, nach dem freien Reset (Anker) von selbst weiter
pruefe "Volldampf pausiert (Marke): warten, kein Ende" "$(W)" 'warten Volldampf pausiert \(Wochenlimit erreicht, wartet auf den freien Reset\) – Woche 27'
print -r -- "anker 2026-11-18T09:00+01:00 98 2" > $T/anker.txt
pruefe "Marke vor dem freien Reset (Anker): Volldampf läuft weiter, Worker" "$(W HALO_JETZT=2026-11-18T10:00+01:00 HALO_AS_WOCHE=2)" 'starten'
rm -f $T/vd-beendet.txt
pruefe "Status rejected: warten (Wochenlimit), kein Ende" "$(W HALO_AS_STATUS=rejected)" 'warten Wochenlimit \(Status rejected'
pruefe "Status allowed_warning: weiter" "$(W HALO_AS_STATUS=allowed_warning)" 'starten'
pruefe "Woche 98 %: warten, Volldampf pausiert bis zum freien Reset" "$(W HALO_AS_WOCHE=98 HALO_JETZT=2026-11-19T12:00+01:00)" 'warten Wochenlimit erreicht \(Woche 98 %\) – Volldampf pausiert bis zum freien Reset'
# Sollkurve nach dem freien Reset: Anker Fr 20.11. 10:00, jetzt Sa 10:00 → 24 h / 87 h = 27,6 % (statt 48-h-Kurve 100 %)
print -r -- "anker 2026-11-20T10:00+01:00 98 2" > $T/anker.txt
pruefe "Soll nach Anker: bis nächster Reset 27,6 %" "$(W HALO_JETZT=2026-11-21T10:00+01:00 HALO_AS_WOCHE=20)" 'Soll 27\.6 % \(bis nächster Reset, 24\.0 h seit freiem Reset\)' 'starten opus unter dem Soll'
pruefe "nach Anker über dem Soll, 5 Stunden 60 %: warten" "$(W HALO_JETZT=2026-11-21T10:00+01:00 HALO_AS_WOCHE=30 HALO_AS_5H=60)" 'warten im Soll'
pruefe "Übergang Di 24.11. 01:00: Volldampf-Fenster vorbei, Wächter endet" "$(W HALO_JETZT=2026-11-24T01:00+01:00)" 'ende Volldampf nicht aktiv'
rm -f $T/anker.txt
pruefe "Grenze erreicht: Kontingent wird nicht gemessen (warten vor Messung)" "$(W HALO_AS_AKTIV=4 HALO_AS_WOCHE=)" 'warten 4 Arbeits-Sitzungen'

# Doppelstart des Wächters: zweite Instanz endet sofort
mkdir -p $T/nacht; sleep 30 & SP=$!; print $SP > $T/nacht/auslastung-schleife.lock
pruefe "zweiter Wächter bei lebender Sperre: Ende mit Meldung" \
  "$(env HALO_AS_DIR=$T/nacht HALO_VOLLDAMPF_DATEI=$T/vd.txt zsh $SKRIPT --einmal 2>&1; print rc=$?)" 'läuft schon \(PID' 'rc=1'
kill $SP 2>/dev/null

# feste Regeln im Skript
S=$(grep -vE '^[[:space:]]*#' $SKRIPT)
pruefe "einziger Push: Nachpush pruef/worker-*; kein release.sh/publish.sh, keine Regeln/Hooks" \
  "$(print -r -- $S | grep -cE 'release\.sh|publish\.sh|settings\.json|zeitfenster-hook|volldampf_setzen|pause_setzen'; print -r -- $S | grep -E 'git [^|;]*push' | sed 's/^ *//')" \
  '^0$' '^if git -C \$MAIN push -q origin refs/heads/\$\{b\}:refs/heads/\$\{b\} 2>>\$LOG; then ok\+=\(\$b\); else fehl\+=\(\$b\); fi$'
pruefe "genau ein Push im Skript" "$(print -r -- $S | grep -cE 'git [^|;]*push')" '^1$'
pruefe "Checkout: nur fetch, worktree add/remove, leere Worker-Zweige löschen" \
  "$(print -r -- $S | grep -oE 'git -C \$MAIN [a-z-]+' | sort -u | tr '\n' ' ')" '^git -C \$MAIN branch git -C \$MAIN fetch git -C \$MAIN for-each-ref git -C \$MAIN push git -C \$MAIN rev-list git -C \$MAIN rev-parse git -C \$MAIN worktree $'
pruefe "Checkout: worktree nur add --detach und remove, branch nur -D eines Zweigs auf dem Basis-Commit" \
  "$(print -r -- $S | grep -oE 'git -C \$MAIN (worktree [a-z]+( --?[a-z]+)*|branch [^2]*)' | sort -u)" \
  '^git -C \$MAIN branch -q -D \$zw $' '^git -C \$MAIN worktree add -q --detach$' '^git -C \$MAIN worktree remove$'
pruefe "Checkout: Zweig nur weg, wenn er auf den Basis-Commit zeigt" "$S" 'refs/heads/\$zw 2>/dev/null\) == \$basis \]\]'
pruefe "Worker ohne HALO_LAUF, gleiche Flags wie die Tagesroutine" "$S" \
  'env -u HALO_LAUF HALO_WORKER=\$nr claude -p --model \$m --session-id \$sid --permission-mode auto'
pruefe "Sitzungs-ID im Protokoll (belegt() übergeht eigene Läufe)" "$S" 'log "Worker \$nr gestartet: \$m, Klasse \$klasse, Sitzung \$sid'
pruefe "Klasse im Auftragskopf und als Feld 8 der Zustandsdatei, dazu Fingerabdruck (10) und Basis (11)" "$S" 'Modell \$m, Klasse \$klasse' '\$erg \$klasse \$\{rnr:--\} \$fp \$\{basis:--\}" > \$ZUSTAND/worker-\$nr'
pruefe "Ports 2874–2889, zwei je Nummer, höchstens 8 Nummern" "$S" '2874 \+ 2 \* \(nr - 1\)' 'for i in \{1\.\.8\}' 'MAX_WORKER\] > 8'
pruefe "Pause-Name auslastung steht in PAUSEN_ROUTINEN" "$(source $HIER/lauf-hilfen.zsh 2>/dev/null; print ${PAUSEN_ROUTINEN[(Ie)auslastung]})" '^[1-9]'
A=$(<$HIER/auslastung-auftrag.md)
pruefe "Auftrag: Board-Sperre, Push nur auf den eigenen Prüfzweig, Testlauf über auslastung-test.zsh" "$A" \
  'board\.sh status <id> arbeit' 'In Arbeit: worker-<Nr>' 'HEAD:<Zweig aus JETZT>' 'nie nach main' 'zsh tests/auslastung-test\.zsh'
pruefe "Auftrag: keine Design-Einträge, keine geplanten Einträge von Nachtlauf/Tagesroutine, Gedächtnis" "$A" \
  'Design- und Optik-Einträge' '<Heute>-plan\.md' 'tagesroutine-plan' 'worker-gedaechtnis\.md' 'Rückblick'
pruefe "Nacht- und Tagesauftrag übergehen Worker-Einträge" \
  "$(grep -c 'In Arbeit: worker-<Nr>' $HIER/nachtlauf-auftrag.md $HIER/tagesroutine-auftrag.md)" 'nachtlauf-auftrag\.md:1' 'tagesroutine-auftrag\.md:1'
pruefe "Testhilfe: Ports 2874–2889, Sperre bilder.lock, belegt()" "$(<$HIER/auslastung-test.zsh)" '<2874-2889>' 'lockf -t 3600 \$HOME/halo-nacht/bilder\.lock' 'g=\$\(nachtschutz .*\|\| belegt\)'
# freie Worker-Nummer: lebende Worker behalten ihre Nummer (bis 17.11.2026 bekam jeder Worker Nummer 1)
mkdir -p $T/zustand
FN=$(sed -n '/^freie_nummer() {/,/^}/p' $SKRIPT)
print -r -- "$$ sid opus 1 /wt pruef/x /erg" > $T/zustand/worker-1
print -r -- "999999 sid opus 1 /wt pruef/y /erg" > $T/zustand/worker-2
pruefe "freie Nummer: Worker 1 lebt, Worker 2 beendet → 2" "$(ZUSTAND=$T/zustand; eval $FN; freie_nummer)" '^2$'
print -r -- "$$ sid opus 1 /wt pruef/y /erg" > $T/zustand/worker-2
pruefe "freie Nummer: 1 und 2 leben → 3" "$(ZUSTAND=$T/zustand; eval $FN; freie_nummer)" '^3$'
# belegt(): nur echte Programmaufrufe, nicht Auftragstexte von claude -p (hielt Testsperre und Nachtlauf an)
M=$(source $HIER/lauf-hilfen.zsh 2>/dev/null; print -r -- "$BELEGT_TEST_MUSTER"; print -r -- "$BELEGT_RELEASE_MUSTER"; print -r -- "$BELEGT_TB_MUSTER")
MT=${${(f)M}[1]} MR=${${(f)M}[2]} MB=${${(f)M}[3]}
CL='claude -p --model opus --session-id x --permission-mode auto JETZT: … tests/halo_test.py kein release.sh/publish.sh ./release.sh 3 /Applications/Thunderbird.app/Contents/MacOS/thunderbird -marionette'
pruefe "belegt: Auftragstext von claude -p zählt nicht" "$(print -r -- $CL | grep -cE -- $MT; print -r -- $CL | grep -cE -- $MR; print -r -- $CL | grep -cE -- $MB)" '^0$' '^0
0
0$'
pruefe "belegt: echte Läufe zählen" "$(print -r -- 'python3 /x/tests/halo_test.py --port 2874' | grep -cE -- $MT; print -r -- '/bin/zsh ./release.sh 3.31.0' | grep -cE -- $MR; print -r -- '/Applications/Thunderbird Beta.app/Contents/MacOS/thunderbird -profile /p -no-remote -marionette' | grep -cE -- $MB)" '^1
1
1$'
# Nachtlauf-Schutz der Testhilfe: 01:10–01:45 beginnt kein Testlauf
NS=$(grep '^nachtschutz()' $HIER/auslastung-test.zsh)
pruefe "Testhilfe: Nachtlauf-Schutz 01:10–01:45" "$(eval $NS; for h in 0100 0110 0130 0144 0145 2300; do HALO_AS_TEST_HM=$h nachtschutz && print "$h ja" || print "$h nein"; done)" \
  '0100 nein' '0110 ja' '0130 ja' '0144 ja' '0145 nein' '2300 nein'
# Windows-Rundgang bei knappem 5-Stunden-Fenster (Maintainer 18.11.2026: „wäre auch ein perfekter task …“, „ich folge allen empfehlungen von dir.“)
print -r -- "# Offene Aufträge an neon
- #35 | 16.11. 21:44 | von designer | Bildauftrag Probe, Windows-VM, hell und dunkel | Stand: angenommen" > $T/stand.md
R() { W HALO_AS_NEON_STAND=$T/stand.md HALO_AS_5H=86 "$@" }
pruefe "Rundgang: 86 %, tagsüber, frei, offen → Rundgang mit sonnet (vor Takt und Drossel)" "$(R HALO_FENSTER_REST=16860)" \
  '^Prüfung:  rundgang sonnet Auftrag #35 \(5-Stunden-Fenster 86 % ab 85 %\)' 'Würde:    Windows-Rundgang mit sonnet starten \(Auftrag #35 wörtlich, Rahmen tests/auslastung-rundgang\.md, höchstens 120 Min\.\)'
pruefe "Rundgang: auch bei Drossel Stufe 3 (Windows-Rundgang nie gebremst)" "$(R HALO_DROSSEL_STUFE=3)" 'rundgang sonnet Auftrag #35'
pruefe "Rundgang: auch ab 90 % (Stopp gilt nur für Worker)" "$(R HALO_AS_5H=92)" 'rundgang sonnet Auftrag #35'
pruefe "Rundgang: 84 % → nicht fällig, tokenarmer Worker" "$(R HALO_AS_5H=84 HALO_AS_TOKENARM=0)" 'Rundgang: nicht fällig – 5-Stunden-Fenster unter 85 %' 'starten sonnet tokenarm'
pruefe "Rundgang: 98 % → nicht fällig (Limit zu nah)" "$(R HALO_AS_5H=98)" 'Rundgang: nicht fällig – 5-Stunden-Fenster ab 98 %' 'warten 5-Stunden-Fenster ab 90'
pruefe "Rundgang: 08:59 nicht, 22:00 nicht, 21:59 ja" "$(R HALO_JETZT=2026-11-18T08:59+01:00 HALO_AS_WOCHE=40; R HALO_JETZT=2026-11-17T22:00+01:00; R HALO_JETZT=2026-11-17T21:59+01:00)" \
  'Rundgang: nicht fällig – nur 0900–2200' 'rundgang sonnet'
pruefe "Rundgang: Nachtlauf läuft → nicht fällig" "$(R HALO_AS_NACHTLAUF=ja)" 'Rundgang: nicht fällig – Nachtlauf läuft'
pruefe "Rundgang: belegt (CI) → nicht fällig" "$(R HALO_AS_BELEGT='CI-Lauf auf dem GitHub-Runner')" 'Rundgang: nicht fällig – belegt: CI-Lauf auf dem GitHub-Runner'
pruefe "Rundgang: Auftrag nicht mehr offen (archiviert) → nicht fällig" "$(R HALO_AS_NEON_STAND=$T/kein-stand.md)" 'Rundgang: nicht fällig – Auftrag #35 nicht offen'
mkdir -p $T/nacht/auslastung
print -r -- "2026-11-17 10:00 sid" > $T/nacht/auslastung/rundgang-35-2026-11-17
pruefe "Rundgang: heute schon gestartet → nicht fällig; am nächsten Tag wieder" \
  "$(R; R HALO_JETZT=2026-11-18T15:00+01:00 HALO_AS_WOCHE=40)" 'Rundgang: nicht fällig – heute schon gestartet' 'rundgang sonnet Auftrag #35 .*Woche 40'
print -r -- "2026-11-17 12:00 erledigt /x 30" > $T/nacht/auslastung/rundgang-35-erledigt
pruefe "Rundgang: erledigt → nie wieder" "$(R HALO_JETZT=2026-11-19T15:00+01:00 HALO_AS_WOCHE=60)" 'Rundgang: nicht fällig – Auftrag #35 erledigt'
rm -f $T/nacht/auslastung/rundgang-35-*
print -r -- "RUNDGANG_NR=0" > $T/rg-aus.conf
pruefe "Rundgang: RUNDGANG_NR=0 → aus" "$(R HALO_AS_CONF=$T/rg-aus.conf)" 'Rundgang: nicht fällig – aus'
pruefe "Rundgang: Pause auslastung gilt auch für ihn" "$(print -r -- 'auslastung 2099-01-01T00:00+01:00 Probe' > $T/pausen.txt; R; rm -f $T/pausen.txt)" 'warten Pause'
pruefe "Rundgang: Volldampf pausiert (Wochenlimit) → kein Start" "$(R HALO_AS_WOCHE=98)" 'warten Wochenlimit erreicht'
pruefe "Rundgang im Skript: Auftrag wörtlich, eigene Zeitgrenze, Marke je Tag, Ergebnis nach neon-stand.md" "$S" \
  'Auftrag #\$rnr \(wörtlich aus' 'max=\$K\[RUNDGANG_MAX_MIN\]' 'rundgang-\$rnr-\$\(date \+%F\)' 'neon-stand\.sh notiz \$z\[9\]' 'rundgang-\$z\[9\]-erledigt'
# Ende des Rundgangs: Ergebnis als Stand in neon-stand.md (Auftrag bleibt offen, neon meldet dem Designer), erledigt → Marke
AR=$(sed -n '/^kopie_nach_lauf() {/,/^}/p;/^aufraeumen() {/,/^}/p' $SKRIPT)
mkdir -p $T/ar/zustand $T/ar/stand; print -r -- "erledigt /ablage 24" > $T/ar/erg
print -r -- "- #35 | 16.11. 21:44 | von designer | Bildauftrag Probe | Stand: angenommen" > $T/ar/stand/neon-stand.md
print -r -- "999999 sid sonnet 1 /wt pruef/w $T/ar/erg rundgang 35" > $T/ar/zustand/worker-6
pruefe "Rundgang beendet: Stand in neon-stand.md, Auftrag bleibt, Marke erledigt" \
  "$(ZUSTAND=$T/ar/zustand LOG=/dev/null; log() { : }; export HALO_NEON_STAND=$T/ar/stand; eval $AR; aufraeumen; cat $T/ar/stand/neon-stand.md; ls $T/ar/zustand)" \
  'Bildauftrag Probe \| Stand: [0-9:]+ Windows-Rundgang automatisch .*beendet: erledigt /ablage 24' 'rundgang-35-erledigt' 'Designer melden'
RG=$(<$HIER/auslastung-rundgang.md)
pruefe "Rundgang-Rahmen: nichts am Auftrag ändern, Voraussetzungen, belegt und bilder.lock, kein Commit/Push, Ergebnis, Wortlaut" "$RG" \
  'Der Auftrag gilt unverändert' 'Voraussetzungen des Auftrags prüfen' 'belegt' 'bilder\.lock' 'Nichts committen, nichts pushen' \
  'erledigt <Ablageordner>' 'wäre auch ein perfekter task' 'ich folge allen empfehlungen von dir'
pruefe "Rundgang: keine Inhalte der Aufgabenliste im Repo (keine Karten-ID im Rahmen)" "$(print -r -- $RG | grep -cE 'JQN|PVTI_')" '^0$'
pruefe "Auftrag: ohne Volldampf kein neuer Eintrag (Regel 6)" "$A" 'nichts_passend Volldampf nicht aktiv'
pruefe "Auftrag: Klasse tokenarm (nur wenig Token, nie Fehlersuche/Analyse/Fable, zurück wenn zu groß)" "$A" \
  'Klasse tokenarm' 'Fehlersuche ohne benannte Ursache' 'kein Fable' 'zurück tokenarm zu groß'

# --- Vorprüfung ohne Sprachmodell (Maintainer 19.11.2026, „1. ja“: Worker nur bei passendem Eintrag, leere Läufe sofort beenden) ---
B() {   # <Datei> <JSON-Einträge, durch Komma getrennt>
  print -r -- "{\"items\":[$2]}" > $1
}
e() { print -r -- "{\"id\":\"$1\",\"typ\":\"$2\",\"status\":\"$3\",\"title\":\"$4\",\"body\":\"${5:-Text}\"}" }
mkdir -p $T/vp
B $T/vp/aus.json "$(e PVTI_a1111 Bug 'In Progress' 'Mail: in Arbeit'),$(e PVTI_a2222 Bug 'Wartet auf OK' 'Mail: wartet'),$(e PVTI_a3333 Bug Done 'Mail: fertig'),$(e PVTI_a4444 Bug Todo 'Mail: gesperrt' 'Text\n\nIn Arbeit: worker-2 (Auslastungswächter)'),$(e PVTI_a5555 Feature Todo 'Design: Knöpfe'),$(e PVTI_a6666 Bug Todo 'Anhänge: Kachel (Design-Eintrag)'),$(e PVTI_a7777 Feature Todo 'Ablauf: Regel'),$(e PVTI_a8888 Feature Todo 'Store: Text'),$(e PVTI_a9999 Feature Todo 'Release: Notizen'),$(e PVTI_b1111 Feature Todo 'Fenster: schmaler [GitHub #31]')"
V() { W HALO_AS_BOARD=$T/vp/aus.json HALO_AS_DIR=$T/vp/nacht "$@" }
pruefe "Vorprüfung: nur In Progress, Wartet auf OK, Done, In-Arbeit-Sperre, Design, Ablauf, Store, Release, Feature [GitHub #n] → kein Worker" \
  "$(V)" '^Prüfung:  leer kein passender Eintrag \(kein Todo-Eintrag ohne Sperre' 'Würde:    keinen Worker starten \(kein passender Eintrag\), nächste Prüfung in 15 Minuten'
pruefe "Vorprüfung: auch Klasse tokenarm ohne Eintrag → kein Worker" "$(V HALO_AS_5H=75 HALO_AS_TOKENARM=0)" '^Prüfung:  leer kein passender Eintrag'
pruefe "Vorprüfung: auch Fable nicht" "$(V HALO_AS_WOCHE=9)" '^Prüfung:  leer kein passender Eintrag'
for f in "$(e PVTI_c1111 Bug Todo 'Mail: nach Rückgabe' 'Text\n\nIn Arbeit: worker-1 (…)\n\nIn Arbeit beendet: worker-1, zurück: belegt')" \
         "$(e PVTI_c2222 Bug Todo 'Mail: aufgegeben' 'In Arbeit: worker-1\n\nIn Arbeit aufgegeben: worker-1, doppelt')" \
         "$(e PVTI_c3333 Bug Todo 'Suchfeld klappt zu [GitHub #67]')" \
         "$(e PVTI_c4444 Feature Todo 'Kalender: neue Ansicht')"; do
  B $T/vp/eins.json "$f"
  pruefe "Vorprüfung: passend – ${${f#*title\":\"}%%\"*}" "$(V HALO_AS_BOARD=$T/vp/eins.json)" '^Prüfung:  starten opus' 'Vorprüfung: 1 Einträge, 0 Bug-Jagd-Fälle möglich'
done
B $T/vp/plan.json "$(e PVTI_lAHODEPpks4BoBQwzhJwOZw Bug Todo 'Tests: Windows rot'),$(e PVTI_lAHODEPpks4BoBQwzhJ76tE Bug Todo 'Import: PST')"
mkdir -p $T/vp/nacht
print -r -- '| 1 | JwOZw | Tests: Windows rot | 5 |' > $T/vp/nacht/2026-11-17-plan.md
print -r -- 'PVTI_lAHODEPpks4BoBQwzhJ76tE	routine	Import: PST' > $T/vp/nacht/2026-11-17-tagesroutine-plan.tsv
pruefe "Vorprüfung: Einträge im Plan von heute (kurze id im Nachtlauf-Plan, volle id im Tagesroutine-Plan) → kein Worker" "$(V HALO_AS_BOARD=$T/vp/plan.json)" '^Prüfung:  leer kein passender Eintrag'
pruefe "Vorprüfung: Plan von gestern zählt nicht" "$(V HALO_AS_BOARD=$T/vp/plan.json HALO_JETZT=2026-11-18T15:00+01:00 HALO_AS_WOCHE=60 HALO_AS_5H=40)" 'Vorprüfung: 2 Einträge' '^Prüfung:  starten'
rm -f $T/vp/nacht/2026-11-17-*
print -r -- "# Bug-Jagd
## 1. Fall eins
## 2. Fall zwei" > $T/vp/nacht/bugjagd-mail-2026-11-17.md
print -r -- "2026-11-18 05:58 worker-x bugjagd-mail-2026-11-17.md#1" > $T/vp/nacht/auslastung-vergeben.txt
pruefe "Vorprüfung: freier Bug-Jagd-Fall (#2) → Worker" "$(V)" 'Vorprüfung: 0 Einträge, 1 Bug-Jagd-Fälle möglich' '^Prüfung:  starten opus'
pruefe "Vorprüfung: Bug-Jagd-Fälle nie für Klasse tokenarm" "$(V HALO_AS_5H=75 HALO_AS_TOKENARM=0)" 'leer kein passender Eintrag \(.*Bug-Jagd-Fälle nur für Klasse normal'
print -r -- "2026-11-18 06:00 worker-y bugjagd-mail-2026-11-17.md#2" >> $T/vp/nacht/auslastung-vergeben.txt
pruefe "Vorprüfung: alle Bug-Jagd-Fälle vergeben → kein Worker" "$(V)" '^Prüfung:  leer kein passender Eintrag'
pruefe "Vorprüfung: Liste nicht lesbar → warten, kein Worker" "$(W HALO_AS_BOARD=$T/fehlt.json)" '^Prüfung:  warten Aufgabenliste nicht lesbar – kein Worker ohne Vorprüfung'
print -r -- 'kein json' > $T/vp/kaputt.json
pruefe "Vorprüfung: Liste nicht auswertbar → warten" "$(W HALO_AS_BOARD=$T/vp/kaputt.json)" '^Prüfung:  warten Aufgabenliste nicht auswertbar'
pruefe "Vorprüfung erst nach allen Schwellen (Grenze erreicht: Liste nicht geladen)" "$(W HALO_AS_AKTIV=4 HALO_AS_BOARD=$T/fehlt.json)" 'warten 4 Arbeits-Sitzungen'
pruefe "Vorprüfung: Rundgang braucht keinen Listeneintrag" "$(print -r -- '- #35 | x | Bildauftrag' > $T/vp/stand.md; W HALO_AS_BOARD=$T/fehlt.json HALO_AS_NEON_STAND=$T/vp/stand.md HALO_AS_5H=86)" '^Prüfung:  rundgang sonnet'
# Befund „nichts_passend“ des Workers: gleiche Kandidaten → kein weiterer Worker, bis sich die Liste ändert (höchstens LEER_GUELTIG)
eval "$(sed -n "/^PASSEND_PY='/,/^'\$/p" $SKRIPT)"
FP=$(python3 -I -c $PASSEND_PY $T/board.json 2026-11-17 $T/vp/leer | head -1 | cut -d' ' -f3)
JETZT_S=$(date -j -f %Y-%m-%dT%H:%M%z 2026-11-17T15:00+0100 +%s)
mkdir -p $T/vp/leer/auslastung
L() { W HALO_AS_DIR=$T/vp/leer "$@" }
print -r -- "$FP $(( JETZT_S - 3600 )) 14:00" > $T/vp/leer/auslastung/leer-normal
pruefe "nichts_passend vor 1 h, Kandidaten gleich → kein Worker" "$(L)" '^Prüfung:  leer kein passender Eintrag \(Kandidaten unverändert seit „nichts_passend“ eines Workers um 14:00'
pruefe "nichts_passend der Klasse normal gilt auch für tokenarm" "$(L HALO_AS_5H=75 HALO_AS_TOKENARM=0)" 'leer kein passender Eintrag \(Kandidaten unverändert'
print -r -- '{"items":[{"id":"PVTI_frei12345","typ":"Bug","status":"Todo","title":"Mail: freier Bug","body":"Text\n\nneue Notiz"}]}' > $T/vp/geaendert.json
pruefe "Kandidat hat neue Notiz → Worker" "$(L HALO_AS_BOARD=$T/vp/geaendert.json)" '^Prüfung:  starten opus'
print -r -- "$FP $(( JETZT_S - 721 * 60 )) 03:00" > $T/vp/leer/auslastung/leer-normal
pruefe "Befund älter als LEER_GUELTIG (720 Min.) → Worker" "$(L)" '^Prüfung:  starten opus'
rm -f $T/vp/leer/auslastung/leer-normal
print -r -- "$FP $(( JETZT_S - 600 )) 14:50" > $T/vp/leer/auslastung/leer-tokenarm
pruefe "nichts_passend nur tokenarm: Klasse normal startet trotzdem" "$(L)" '^Prüfung:  starten opus'
pruefe "nichts_passend tokenarm: tokenarm nicht mehr" "$(L HALO_AS_5H=75 HALO_AS_TOKENARM=0)" 'leer kein passender Eintrag \(Kandidaten unverändert'
print -r -- "LEER_WARTEN=20" > $T/vp/lw.conf
pruefe "LEER_WARTEN aus der Datei" "$(V HALO_AS_CONF=$T/vp/lw.conf)" 'nächste Prüfung in 20 Minuten'
pruefe "Schleife: „leer“ jedes Mal ins Protokoll, Wartezeit LEER_WARTEN" "$S" \
  'leer\*\) +log "\$\{z#leer \}; nächste Prüfung in \$K\[LEER_WARTEN\] Minuten"; warte=\$K\[LEER_WARTEN\]' 'sleep \$\(\( warte \* 60 \)\)'
pruefe "Liste höchstens alle BOARD_ALTER Minuten (15) über board.sh export, Zwischenspeicher" "$S" \
  'BOARD_ALTER 15' "find \\\$f -mmin -\\\$K\\[BOARD_ALTER\\]" 'board\.sh export'
# aufraeumen: Befund nichts_passend mit Fingerabdruck merken (nicht bei „Volldampf nicht aktiv“)
mkdir -p $T/np/zustand
print -r -- "nichts_passend alles Optik" > $T/np/erg1; print -r -- "nichts_passend Volldampf nicht aktiv" > $T/np/erg2
print -r -- "999999 sid opus 1 /kein-wt pruef/w $T/np/erg1 normal - 0123456789abcdef -" > $T/np/zustand/worker-1
print -r -- "999998 sid sonnet 1 /kein-wt pruef/w $T/np/erg2 tokenarm - fedcba9876543210 -" > $T/np/zustand/worker-2
pruefe "aufraeumen: nichts_passend → leer-normal mit Fingerabdruck; „Volldampf nicht aktiv“ → kein Befund" \
  "$(setopt extendedglob; ZUSTAND=$T/np/zustand; log() { : }; eval $AR; aufraeumen; ls $T/np/zustand; cat $T/np/zustand/leer-normal)" '^leer-normal$' '^0123456789abcdef [0-9]+ [0-9]{2}:[0-9]{2}$'
pruefe "aufraeumen: kein leer-tokenarm bei „Volldampf nicht aktiv“" "$(ls $T/np/zustand | grep -c tokenarm)" '^0$'

# --- Worktree nach dem Lauf (Maintainer 19.11.2026: Zweig erst beim ersten Commit, leere Worktrees und Zweige sofort weg) ---
export GIT_AUTHOR_NAME=T GIT_AUTHOR_EMAIL=t@t GIT_COMMITTER_NAME=T GIT_COMMITTER_EMAIL=t@t
G=$T/git; mkdir -p $G
git init -q -b main $G/repo && print '/repo.conf\n/dist/' > $G/repo/.gitignore && print a > $G/repo/a.txt
git -C $G/repo add -A && git -C $G/repo commit -qm start
BASIS=$(git -C $G/repo rev-parse HEAD)
KN=$(sed -n '/^kopie_nach_lauf() {/,/^}/p' $SKRIPT)
K() { (setopt extendedglob; MAIN=$G/repo LOG=$G/log; log() { print -r -- "$*" >> $G/log }; eval $KN; kopie_nach_lauf "$@") }
wt() { git -C $G/repo worktree add -q --detach $G/$1 $BASIS }
wt w1; print x > $G/w1/repo.conf; mkdir $G/w1/dist; print x > $G/w1/dist/a.xpi
K $G/w1 pruef/worker-1 $BASIS
pruefe "leerer Worktree ohne Zweig (nur repo.conf, dist/) → entfernt" "$( [[ -d $G/w1 ]] && print da || print weg; git -C $G/repo worktree list | grep -c w1)" '^weg$' '^0$'
wt w2; git -C $G/w2 switch -q -c pruef/worker-2
K $G/w2 pruef/worker-2 $BASIS
pruefe "Zweig angelegt, aber kein Commit → Worktree und Zweig weg" "$( [[ -d $G/w2 ]] && print da || print weg; git -C $G/repo branch --list pruef/worker-2 | grep -c .)" '^weg$' '^0$'
wt w3; git -C $G/w3 switch -q -c pruef/worker-3; print b > $G/w3/b.txt; git -C $G/w3 add b.txt; git -C $G/w3 commit -qm b
K $G/w3 pruef/worker-3 $BASIS
pruefe "Commit auf dem Zweig → Worktree und Zweig bleiben" "$( [[ -d $G/w3 ]] && print da; git -C $G/repo branch --list pruef/worker-3 | grep -c .)" '^da$' '^1$'
wt w4; print c > $G/w4/c.txt; git -C $G/w4 add c.txt; git -C $G/w4 commit -qm c
K $G/w4 pruef/worker-4 $BASIS
pruefe "Commit ohne Zweig (git switch -c vergessen) → Zweig nachträglich, nichts verloren" \
  "$( [[ -d $G/w4 ]] && print da; git -C $G/w4 symbolic-ref --short HEAD; git -C $G/repo log -1 --format=%s pruef/worker-4)" '^da$' '^pruef/worker-4$' '^c$'
wt w5; print x >> $G/w5/a.txt
K $G/w5 pruef/worker-5 $BASIS
pruefe "ungespeicherte Änderung ohne Commit → bleibt, Grund im Protokoll" "$( [[ -d $G/w5 ]] && print da; cat $G/log)" '^da$' 'w5 bleibt: ungespeicherte Änderungen'
wt w6; print x > $G/w6/vorschau-1.png
K $G/w6 pruef/worker-6 $BASIS
pruefe "unversionierte Datei → bleibt" "$( [[ -d $G/w6 ]] && print da; cat $G/log)" '^da$' 'w6 bleibt: ungespeicherte'
wt w7
K $G/w7 pruef/worker-7 ""
pruefe "alter Worker ohne Basis-Commit (Feld 11) → nicht angefasst" "$( [[ -d $G/w7 ]] && print da)" '^da$'
pruefe "Datum je Start: Ergebnis, Ausgabe und Bericht mit dem Datum des Starts, Protokoll je Takt" "$S" \
  'local tag=\$\(date \+%F\)' 'erg=\$DIR/\$tag-worker-' 'halo-berichte/\$tag-worker-\$nr\.md' 'LOG=\$DIR/\$\(date \+%F\)-auslastung\.log   # je Takt'
pruefe "Auftrag: Zweig erst vor dem ersten Commit, nachts nicht pushen, Nachpush durch den Wächter" "$A" \
  'git switch -c <Zweig aus JETZT>' '00:00–09:00 nicht pushen' 'pusht der\s*$' 'HEAD:<Zweig aus JETZT>' 'Vorprüfung'
# Nachpush der Worker-Zweige ab 09:00 (neon 19.11.2026), einmal je Tag, nur pruef/worker-*, nie main
git init -q --bare -b main $G/origin.git
git -C $G/repo remote add origin $G/origin.git && git -C $G/repo push -q origin main
git -C $G/repo branch pruef/worker-alt main
git -C $G/repo push -q origin pruef/worker-4                       # schon auf origin, unverändert
git -C $G/repo branch pruef/anders pruef/worker-3; git -C $G/repo branch pruef/worker-nacht pruef/worker-3
git -C $G/w3 commit -q --allow-empty -m nachts                       # w3 hat neuen Commit nach dem Push
git -C $G/repo checkout -q main; print z > $G/repo/z.txt; git -C $G/repo add z.txt; git -C $G/repo commit -qm lokal-main
NP=$(sed -n '/^zweige_nachpushen() {/,/^}/p' $SKRIPT)
N() { (setopt extendedglob; MAIN=$G/repo ZUSTAND=$G/zustand LOG=$G/nplog; mkdir -p $ZUSTAND; log() { print -r -- "$*" >> $G/nplog }; eval $NP; zweige_nachpushen "$@") }
: > $G/nplog; N 0859
pruefe "Nachpush: vor 09:00 nichts" "$(git -C $G/origin.git branch --list 'pruef/*' | tr -d ' *' | tr '\n' ' '; cat $G/nplog)" '^pruef/worker-4 $'
N 0900
pruefe "Nachpush 09:00: nur pruef/worker-* mit Commits vor origin/main und neuem Stand; nie main, nie andere Präfixe" \
  "$(git -C $G/origin.git branch --list | tr -d ' *' | sort | tr '\n' ' '; print; git -C $G/origin.git rev-parse main; git -C $G/repo rev-parse origin/main; cat $G/nplog)" \
  '^main pruef/worker-3 pruef/worker-4 pruef/worker-nacht $' 'Nachpush Worker-Zweige .*: 2 gepusht: pruef/worker-3, pruef/worker-nacht$'
pruefe "Nachpush: lokales main nicht gepusht" "$( [[ $(git -C $G/origin.git rev-parse main) != $(git -C $G/repo rev-parse main) ]] && print ok)" '^ok$'
git -C $G/w3 commit -q --allow-empty -m noch-einer; : > $G/nplog; N 1400
pruefe "Nachpush: einmal je Tag (Marke)" "$(cat $G/nplog; ls $G/zustand)" '^nachpush-[0-9-]+$'
pruefe "Schleife: Nachpush je Takt aufgerufen" "$S" 'zweige_nachpushen \$\(date \+%H%M\)'
# Grenzen (neon 19.11.2026: am 19.11. 25 alte Zweige vom 18.11. auf einmal gepusht): letzter Commit höchstens 24 h alt,
# höchstens 3 je Tag (neueste zuerst), Rest nur im Protokoll; Marke vor dem ersten Push
NZ() { (setopt extendedglob; MAIN=$G/repo ZUSTAND=$1 LOG=$G/nplog; shift; log() { print -r -- "$*" >> $G/nplog }; eval $NP; zweige_nachpushen "$@") }
git -C $G/repo push -q origin pruef/worker-3 2>/dev/null   # (Stand von oben schon auf origin)
git -C $G/repo checkout -q --detach main
for i in 1 2 3 4 5; do
  git -C $G/repo checkout -q -b pruef/worker-frisch$i main
  GIT_COMMITTER_DATE="$(date -v-${i}H '+%Y-%m-%dT%H:%M:%S')" git -C $G/repo commit -q --allow-empty -m frisch$i
done
git -C $G/repo checkout -q -b pruef/worker-uralt main
GIT_COMMITTER_DATE="$(date -v-25H '+%Y-%m-%dT%H:%M:%S')" git -C $G/repo commit -q --allow-empty -m uralt
git -C $G/repo checkout -q main
: > $G/nplog; NZ $G/zustand2 1000
pruefe "Nachpush: höchstens 3 je Tag, neueste zuerst; älter als 24 h nicht gepusht; Rest im Protokoll" \
  "$(git -C $G/origin.git branch --list 'pruef/worker-frisch*' 'pruef/worker-uralt' | tr -d ' *' | sort | tr '\n' ' '; print; cat $G/nplog)" \
  '^pruef/worker-frisch1 pruef/worker-frisch2 pruef/worker-frisch3 $' ': 3 gepusht: pruef/worker-frisch1, pruef/worker-frisch2, pruef/worker-frisch3;' \
  'zu alt, nicht gepusht: pruef/worker-uralt' 'über der Grenze, nicht gepusht: pruef/worker-frisch4, pruef/worker-frisch5$'
: > $G/nplog; NZ $G/zustand2 1500
pruefe "Nachpush: zweiter Durchgang am selben Tag pusht nichts (Marke)" "$(cat $G/nplog; git -C $G/origin.git branch --list 'pruef/worker-frisch4' | grep -c .)" '^0$'
mv $G/origin.git $G/origin-weg.git
: > $G/nplog; NZ $G/zustand3 1000
pruefe "Nachpush: git fetch scheitert → noch keine Marke, nächster Versuch im nächsten Takt (nichts gepusht)" \
  "$(ls $G/zustand3 2>/dev/null | grep -c nachpush; cat $G/nplog)" '^0$' 'git fetch gescheitert'
mv $G/origin-weg.git $G/origin.git
pruefe "Nachpush: Marke wird vor der Push-Schleife geschrieben" \
  "$(sed -n '/^zweige_nachpushen() {/,/^}/p' $SKRIPT | grep -nE 'läuft" > \$marke|for b in \$kand' | cut -d: -f1 | tr '\n' ' ')" '^[0-9]+ [0-9]+ $'
exit $FEHLER
