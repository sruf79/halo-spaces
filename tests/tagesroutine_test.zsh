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
  HALO_ZS_LOCK=/nonexistent/zs.lock HALO_JETZT=$1 HALO_KONTINGENT_WOCHE=$2 HALO_KONTINGENT_5H=${3:-10} HALO_KONTINGENT_5H_ENDE=${TEST_5H_ENDE:-} \
  HALO_TAGESROUTINE_CONF=${4:-$T/leer.conf} HALO_SPAR_DATEI=${5:-$T/keine.tsv} HALO_PAUSEN_DATEI=$T/pausen.txt \
  HALO_VOLLDAMPF_DATEI=${HALO_VOLLDAMPF_DATEI:-$T/kein-volldampf.txt} HALO_VOLLDAMPF_BEENDET=$T/volldampf-beendet.txt HALO_WOCHENANKER=${HALO_WOCHENANKER:-$T/kein-anker.txt} \
  HALO_DROSSEL_STUFE=${HALO_DROSSEL_STUFE-0} HALO_DROSSEL_DATEI=${HALO_DROSSEL_DATEI:-$T/drossel.txt} HALO_DROSSEL_VERLAUF=${HALO_DROSSEL_VERLAUF:-$T/verlauf.json} \
  HALO_AS_CONF=${HALO_AS_CONF:-$T/leer.conf} HALO_KONTINGENT_JSON=${HALO_KONTINGENT_JSON:-$T/kein-kontingent.json} HALO_ZR_TB=${HALO_ZR_TB:-0} zsh $SKRIPT --trocken $REPO 2>&1
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

# Eigener Zweig statt main (Maintainer 18.11.2026, „hier folge ich deiner empfehlung“): Arbeitskopie auf
# pruef/tagesroutine-<datum> von origin/main, main bleibt unberührt; Zählen auf dem Zweig
O=$T/origin.git; git init -q --bare -b main $O
K=$T/klon; git clone -q $O $K 2>/dev/null
kc() { GIT_AUTHOR_DATE=${2:+"@$2 +0000"} git -C ${3:-$K} -c user.name=t -c user.email=t@t commit -q --allow-empty -m "$1" }
kc basis; git -C $K push -q origin main 2>/dev/null
kc lokal-auf-main   # fremder, nicht gepushter Commit auf main: gehört nicht in den Zweig der Tagesroutine
MAIN_VOR=$(git -C $K rev-parse main)
ak() { HALO_TR_WT=$T/wt zsh $SKRIPT --arbeitskopie $1 $K 2>&1 }
pruefe "Arbeitskopie: neu auf pruef/tagesroutine-<datum> von origin/main" "$(ak pruef/tagesroutine-20261118)" \
  '^Arbeitskopie: .*/wt neu angelegt auf pruef/tagesroutine-20261118$'
pruefe "Arbeitskopie: Zweig ohne den lokalen Commit auf main, main unverändert" \
  "$(git -C $T/wt log --format=%s; print main=$([[ $(git -C $K rev-parse main) == $MAIN_VOR ]] && print gleich || print anders); git -C $K branch --show-current)" \
  '^basis$' '^main=gleich$' '^main$'
[[ -n $(git -C $T/wt log --format=%s | grep lokal-auf-main) ]] && { print "FEHLER Arbeitskopie enthält den lokalen Commit von main"; FEHLER=1 }
kc eigen-zweig 3100 $T/wt
pruefe "Tageslimit zählt auf dem Zweig der Tagesroutine" \
  "$(HALO_TR_ZWEIG=pruef/tagesroutine-20261118 HALO_RUNDEN_ZEIT='3000 3300' zsh $SKRIPT --zaehlen $K 2>&1)" 'Eigene Commits: 1$' 'eigen-zweig'
pruefe "Arbeitskopie: zweiter Start am selben Tag bleibt auf dem Zweig" "$(ak pruef/tagesroutine-20261118)" \
  '^Arbeitskopie: .*/wt auf pruef/tagesroutine-20261118$'
print x >> $T/wt/datei; git -C $T/wt add datei; git -C $T/wt switch -q --detach 2>/dev/null; print y >> $T/wt/datei
pruefe "Arbeitskopie: nächster Tag sichert Ungespeichertes mit git stash und beginnt neu von origin/main" \
  "$(ak pruef/tagesroutine-20261119; git -C $T/wt branch --show-current; git -C $T/wt log --format=%s; git -C $T/wt stash list)" \
  'mit git stash gesichert' '^pruef/tagesroutine-20261119$' '^basis$' 'Tagesroutine: Ungespeichertes'
# main nachziehen (21.11.2026): vor jeder Runde origin/main in den Zweig, als Merge, eigene Commits zählen wie zuvor
N=$T/nz; git clone -q $O $N 2>/dev/null
nc() { git -C ${3:-$N} add -A; GIT_AUTHOR_DATE=${2:+"@$2 +0000"} git -C ${3:-$N} -c user.name=t -c user.email=t@t commit -q -m "$1" }
print a > $N/a; nc main-1; git -C $N push -q origin main 2>/dev/null
git -C $K config user.name t; git -C $K config user.email t@t   # der Merge-Commit braucht einen Namen
git -C $K fetch -q origin main; git -C $K worktree add -q -b pruef/tagesroutine-20261121 $T/wt2 origin/main 2>/dev/null
nz() { HALO_TR_WT=$T/wt2 zsh $SKRIPT --nachziehen pruef/tagesroutine-20261121 $K 2>&1; print rc=$? }
pruefe "Nachziehen: Zweig frisch von origin/main, nichts zu tun" "$(nz)" '^Nachziehen: main schon enthalten$' '^rc=0$'
print e > $T/wt2/e; nc eigen-1 5100 $T/wt2
print b > $N/b; nc main-2 5150; git -C $N push -q origin main 2>/dev/null   # fremder Commit auf main, Autorzeit in der Runde
pruefe "Nachziehen: neuer Commit von main kommt als Merge in den Zweig" "$(nz; git -C $T/wt2 log --format=%s -1; git -C $T/wt2 log --format=%s)" \
  '^Nachziehen: 1 Commit\(s\) von main übernommen' '^rc=0$' '^Tagesroutine: origin/main in pruef/tagesroutine-20261121 übernommen$' '^main-2$' '^eigen-1$'
pruefe "Nachziehen: Commits von main zählen nicht als eigene (Tageslimit)" \
  "$(HALO_TR_ZWEIG=pruef/tagesroutine-20261121 HALO_RUNDEN_ZEIT='5000 5300' zsh $SKRIPT --zaehlen $K 2>&1)" 'Eigene Commits: 1$' 'eigen-1'
print b2 > $N/b; nc main-3; git -C $N push -q origin main 2>/dev/null
print offen >> $T/wt2/e
pruefe "Nachziehen: Ungespeichertes in der Arbeitskopie – nichts anfassen (Exitcode 1)" "$(nz; git -C $T/wt2 status --porcelain)" \
  'nicht nachgezogen: Ungespeichertes' '^rc=1$' '^ M e$'
git -C $T/wt2 checkout -q -- e; print anders > $T/wt2/b; nc eigen-konflikt 5200 $T/wt2
KOPF_VOR=$(git -C $T/wt2 rev-parse HEAD)
pruefe "Nachziehen: Konflikt mit main – abgebrochen, Zweig unverändert und sauber (Exitcode 1)" \
  "$(nz; [[ $(git -C $T/wt2 rev-parse HEAD) == $KOPF_VOR && -z $(git -C $T/wt2 status --porcelain) ]] && print unveraendert)" \
  'nicht nachgezogen: Konflikt mit origin/main' '^rc=1$' '^unveraendert$'
pruefe "Nachziehen: anderer Zweig in der Arbeitskopie – nichts tun" \
  "$(HALO_TR_WT=$T/wt2 zsh $SKRIPT --nachziehen pruef/tagesroutine-20261122 $K 2>&1; print rc=$?)" 'nicht nachgezogen: .* nicht auf pruef/tagesroutine-20261122' '^rc=1$'
pruefe "Skript: jede Claude-Runde zieht vorher main nach, ohne Rebase und ohne Force" "$(<$SKRIPT)" \
  '^  main_nachziehen \$WT \$PRUEF; log' 'merge -q --no-ff --no-edit'
grep -vE '^[[:space:]]*#' $SKRIPT | grep -qE 'git .*(rebase|push .*(--force|-f ))' && { print "FEHLER Skript nutzt Rebase oder Force"; FEHLER=1 }
mkdir -p $T/kein-wt/x
pruefe "Arbeitskopie: fremder Ordner ohne .git wird nicht benutzt (Exitcode 1)" \
  "$(HALO_TR_WT=$T/kein-wt zsh $SKRIPT --arbeitskopie pruef/tagesroutine-20261120 $K 2>&1; print rc=$?)" 'keine Arbeitskopie' '^rc=1$'
pruefe "Skript: Claude-Runde im Arbeitsordner, Prüfzweig aus dem Zweig, nie aus main" "$(<$SKRIPT)" \
  '\( cd \$WT && claude -p' 'push -q origin refs/heads/\$\{PRUEF\}:refs/heads/\$\{PRUEF\}' '^Arbeitsordner: \$WT'
grep -q 'push -q origin main:' $SKRIPT && { print "FEHLER Skript schiebt noch main auf den Prüfzweig"; FEHLER=1 }
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
  'deutlich darüber' 'Entscheidung: warten bis 11:00' 'Volldampf: +keine Zeile' 'Tageslimit 40 eigene'
pruefe "Volldampf aktiv: Sollkurve bremst nicht, Plan-Runde, kein Tageslimit für Commits (17.11.2026)" "$(HALO_VOLLDAMPF_DATEI=$T/vd.txt lauf $JD 30)" \
  'Volldampf: +Volldampf aktiv bis 2026-11-24T01:00\+01:00 \(pausiert beim Wochenlimit bis zum freien Reset\)' '→ Volldampf \(Sollkurve bremst nicht\)' \
  'Entscheidung: neu beginnen' 'komplexe Einträge: opus, Routine: sonnet' 'kein Tageslimit für Commits \(Volldampf\)' 'Würde: +Plan-Runde'
# Volldampf = maximale Produktivität (Maintainer 17.11.2026): Commit-Grenze, Zwischen-Release, Nachtlauf-Grenzen
print 'MAX_COMMITS_VOLLDAMPF=100' > $T/vd100.conf
pruefe "Volldampf: MAX_COMMITS_VOLLDAMPF aus der Konfiguration" "$(HALO_VOLLDAMPF_DATEI=$T/vd.txt lauf $JD 30 10 $T/vd100.conf)" 'Tageslimit 100 eigene'
pruefe "ohne Volldampf: Zwischen-Release aus, Tageslimit unverändert" "$(lauf 2026-11-17T10:00:00+01:00 3)" \
  'Zwischen-Release: aus \(nur im Volldampf\)' 'Tageslimit 40 eigene'
pruefe "Volldampf: Trockenlauf nennt den Wächter tests/zwischen-schleife.zsh" "$(HALO_VOLLDAMPF_DATEI=$T/vd.txt lauf $JD 30)" \
  'Zwischen-Release: Wächter tests/zwischen-schleife.zsh läuft'
print -r -- "2026-11-17T01:00+01:00 2026-11-24T01:00+01:00 2026-11-17T08:00+01:00 98" > $T/volldampf-beendet.txt
pruefe "Volldampf pausiert: Zwischen-Release aus, Tageslimit normal" "$(HALO_VOLLDAMPF_DATEI=$T/vd.txt lauf $JD 30)" \
  'Zwischen-Release: aus' 'Tageslimit 40 eigene'
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
pruefe "Volldampf: Fable bei 5-Stunden-Fenster 65 % erlaubt (keine Fenstergrenze, 17.11.2026)" "$(HALO_VOLLDAMPF_DATEI=$T/vd.txt lauf $JD 30 65)" 'Fable: erlaubt'
pruefe "Volldampf: 5-Stunden-Fenster ≥ 80 % bremst weiter" "$(HALO_VOLLDAMPF_DATEI=$T/vd.txt lauf $JD 30 85)" \
  'Entscheidung: warten bis 11:00 – 5-Stunden-Fenster 85 %'
# Fenster-Takt im Volldampf (Maintainer 18.11.2026: „ich folge allen empfehlungen von dir.“, Empfehlung 3; fenster_takt aus
# lauf-hilfen.zsh wie im Auslastungswächter): Fenster 10:00–15:00, um 10:00 Fensterbeginn (Takt 25 %), 12:30 Mitte (75 %)
pruefe "Fenster-Takt: Volldampf, 40 % zu Fensterbeginn (Takt 25) → warten bis der Takt aufholt (10:45)" \
  "$(TEST_5H_ENDE=2026-11-17T15:00:00+01:00 HALO_VOLLDAMPF_DATEI=$T/vd.txt lauf $JD 30 40)" \
  'Entscheidung: warten bis 10:45 – Fenster-Takt: 5-Stunden-Fenster 40 % über 25 %' 'Fenster-Takt mit Reserve 25 Punkte' 'Würde: +kein Claude, warten bis 10:45'
pruefe "Fenster-Takt: Volldampf, 70 % zur Fenstermitte (Takt 75) → neu beginnen" \
  "$(TEST_5H_ENDE=2026-11-17T12:30:00+01:00 HALO_VOLLDAMPF_DATEI=$T/vd.txt lauf $JD 30 70)" 'Entscheidung: neu beginnen'
pruefe "Fenster-Takt: weit über dem Takt wartet höchstens bis zur vollen Stunde" \
  "$(TEST_5H_ENDE=2026-11-17T15:00:00+01:00 HALO_VOLLDAMPF_DATEI=$T/vd.txt lauf $JD 30 79)" 'Entscheidung: warten bis 11:00 – Fenster-Takt'
pruefe "Fenster-Takt: Fensterende unbekannt → kein Takt, nur die 80-%-Grenze" "$(HALO_VOLLDAMPF_DATEI=$T/vd.txt lauf $JD 30 79)" 'Entscheidung: neu beginnen'
pruefe "Fenster-Takt: ohne Volldampf kein Takt (Alltag unverändert)" "$(TEST_5H_ENDE=2026-11-17T15:00:00+01:00 lauf 2026-11-17T10:00:00+01:00 3 40)" \
  'Entscheidung: neu beginnen'
pruefe "Fenster-Takt: ab 80 % gilt weiter die harte Grenze (Pause bis Fensterende/volle Stunde)" \
  "$(TEST_5H_ENDE=2026-11-17T15:00:00+01:00 HALO_VOLLDAMPF_DATEI=$T/vd.txt lauf $JD 30 85)" 'Entscheidung: warten bis 11:00 – 5-Stunden-Fenster 85 %'
print 'FENSTER_RESERVE=50' > $T/res50.conf
pruefe "Fenster-Takt: FENSTER_RESERVE aus der Konfiguration (50)" "$(TEST_5H_ENDE=2026-11-17T15:00:00+01:00 HALO_VOLLDAMPF_DATEI=$T/vd.txt lauf $JD 30 40 $T/res50.conf)" \
  'Entscheidung: neu beginnen'
# Kontingent-Drossel im Volldampf (Maintainer 19.11.2026: „ja umbauen und so rasch wie möglich live schalten“, drossel_stufe in lauf-hilfen.zsh)
pruefe "Drossel Stufe 0: wie bisher (neu, Fable erlaubt)" "$(HALO_DROSSEL_STUFE=0 HALO_VOLLDAMPF_DATEI=$T/vd.txt lauf $JD 30 55)" \
  'Drossel: +Stufe 0' 'Fable: erlaubt' 'Entscheidung: neu beginnen'
pruefe "Drossel Stufe 1: kein Fable, Plan/komplex bleiben opus, Routine sonnet, neu beginnen" "$(HALO_DROSSEL_STUFE=1 HALO_VOLLDAMPF_DATEI=$T/vd.txt lauf $JD 30 55)" \
  'komplexe Einträge: opus, Routine: sonnet; Fable: nein' 'Drossel: +Stufe 1' 'Entscheidung: neu beginnen'
pruefe "Drossel Stufe 1: keine wirkungslose Modellumschaltung mehr im Skript" "$(grep -c 'E\[M_ROUTINE\]=\$KONF\[MODELL_ROUTINE\]' $SKRIPT)" '^0$'
pruefe "Drossel Stufe 2: diese Runde läuft, die nächste wird ausgesetzt" "$(HALO_DROSSEL_STUFE=2 HALO_VOLLDAMPF_DATEI=$T/vd.txt lauf $JD 30 55)" \
  'Drossel: +Stufe 2 .*die nächste wird ausgesetzt' 'Entscheidung: neu beginnen'
pruefe "Drossel Stufe 3: nichts Neues bis zur vollen Stunde" "$(HALO_DROSSEL_STUFE=3 HALO_VOLLDAMPF_DATEI=$T/vd.txt lauf 2026-11-17T10:20:00+01:00 30 55)" \
  'Entscheidung: warten bis 11:00 – Drossel Stufe 3' 'Würde: +kein Claude, warten bis 11:00'
pruefe "Drossel Stufe 3 ändert ein Warten wegen des 5-Stunden-Fensters nicht" "$(HALO_DROSSEL_STUFE=3 HALO_VOLLDAMPF_DATEI=$T/vd.txt lauf $JD 30 85)" \
  'Entscheidung: warten bis 11:00 – 5-Stunden-Fenster 85 %'
pruefe "Drossel ohne Volldampf: keine Zeile, keine Wirkung" "$(HALO_DROSSEL_STUFE=3 lauf $JD 4)" 'Entscheidung: neu beginnen'
pruefe "Drossel ohne Volldampf: keine Drossel-Zeile" "$(HALO_DROSSEL_STUFE=3 lauf $JD 4 | grep -c '^Drossel:')" '^0$'
# seit 20.11.2026: Verbrauch gegen vergangene Zeit der Kalenderwoche (Di 10:00: 9 h von 168 h = 5,4 %)
print -r -- '{"stand":"2026-11-17T09:55:00+0100","info":{"unifiedWindows":{"seven_day":{"utilization":0.30,"resetsAt":1795478400}}}}' > $T/kont-tr.json
pruefe "Drossel echt gerechnet (Woche 30 % gegen Wochenzeit 5,4 %): Stufe 3, nichts Neues bis 11:00" \
  "$(HALO_DROSSEL_STUFE= HALO_KONTINGENT_JSON=$T/kont-tr.json HALO_VOLLDAMPF_DATEI=$T/vd.txt lauf 2026-11-17T10:00:00+01:00 30 55)" \
  'Drossel: +Stufe 3 \(24\.6 Punkte über der Zeit' 'Wochenzeit 5\.4 % \(Reset Di 01:00, resetsAt\)' 'Entscheidung: warten bis 11:00'
pruefe "Drossel echt gerechnet, Woche 4 %: Stufe 0, neu beginnen" \
  "$(HALO_DROSSEL_STUFE= HALO_KONTINGENT_JSON=$T/kont-tr.json HALO_VOLLDAMPF_DATEI=$T/vd.txt lauf 2026-11-17T10:00:00+01:00 4 55)" \
  'Drossel: +Stufe 0 \(1\.4 Punkte unter der Zeit' 'Entscheidung: neu beginnen'
pruefe "Drossel ohne kontingent.json: Fail-open" \
  "$(HALO_DROSSEL_STUFE= HALO_VOLLDAMPF_DATEI=$T/vd.txt lauf 2026-11-17T10:00:00+01:00 30 55)" 'Drossel: +Fail-open: kontingent\.json nicht lesbar' 'Entscheidung: neu beginnen'
# jede zweite Runde (Stufe 2): drossel_anwenden aus dem Skript, ohne Claude
DA=$(sed -n '/^drossel_anwenden() {/,/^}/p' $SKRIPT)
# Zweitlesung 19.11.2026: Aussetzen nur nach einer echten Claude-Runde (runde() setzt den Merker), nie bei rotem Prüfzweig
# oder fälligem Release unter Tage in der ersten Plan-Runde
DS='eval "$1"; typeset -A E; pruef_rot() { print -r -- "$ROT_PROBE" }; rut_zeile() { print -r -- "$RUT_PROBE" }
  DROSSEL_AUSSETZEN= E[DROSSEL]="Stufe 2 (Probe)"; RUNDEN_ZEIT=("0 1500"); export HALO_JETZT=2026-11-17T10:00+01:00
  echt() { (( DROSSEL_STUFE == 2 )) && DROSSEL_AUSSETZEN=1 }   # wie in runde()
  schritt() { E[ENTSCHEIDUNG]=neu E[WARTEN_BIS]= E[GRUND]=g; drossel_anwenden; print -r -- "$1 $E[ENTSCHEIDUNG] $E[WARTEN_BIS] | $E[GRUND]" }'
pruefe "Drossel Stufe 2: ohne Claude-Runde kein Aussetzen; nach echter Runde wartet die nächste so lange wie sie (25 Min.), danach läuft wieder eine; Grenzen 10 und 60 Min." \
  "$(zsh -c "$DS"'
    DROSSEL_STUFE=2 PLANRUNDE=1 GEPLANT=1
    schritt A; schritt B; echt; schritt C; schritt D
    RUNDEN_ZEIT=("0 60"); echt; schritt kurz; RUNDEN_ZEIT=("0 9000"); echt; schritt lang
    echt; DROSSEL_STUFE=0; schritt S0; DROSSEL_STUFE=2; schritt S2' _ "$DA")" \
  '^A neu  ' '^B neu  ' '^C warten 2026-11-17T10:25' '^D neu  ' 'kurz warten 2026-11-17T10:10' 'lang warten 2026-11-17T11:00' '^S0 neu' '^S2 neu'
pruefe "Drossel: runde() setzt den Merker nur bei Stufe 2" "$(sed -n '/^runde() {/,/^}/p' $SKRIPT | grep -c '(( DROSSEL_STUFE == 2 )) && DROSSEL_AUSSETZEN=1')" '^1$'
pruefe "Drossel Stufe 3: roter Prüfzweig wird nicht gebremst, schon gemeldeter schon" \
  "$(zsh -c "$DS"'
    DROSSEL_STUFE=3 PLANRUNDE=1 GEPLANT=1 PRUEF=pruef/x E[VOLLE]=2026-11-17T11:00+01:00
    ROT_PROBE="123 abc1234" schritt rot; ROT_GEMELDET="123 abc1234" ROT_PROBE="123 abc1234" schritt gemeldet; ROT_PROBE= schritt gruen' _ "$DA")" \
  '^rot neu .*nicht gebremst: roter Prüfzweig' '^gemeldet warten 2026-11-17T11:00' '^gruen warten'
pruefe "Drossel Stufe 2/3: Release unter Tage in der ersten Plan-Runde nicht gebremst, später schon" \
  "$(zsh -c "$DS"'
    DROSSEL_STUFE=3 PLANRUNDE=0 GEPLANT= E[VOLLE]=2026-11-17T11:00+01:00 E[TAG]=2026-11-17
    RUT_PROBE="ja Nachtlauf ohne Release" schritt rut; RUT_PROBE="nein – nichts zu entscheiden" schritt nein
    PLANRUNDE=1; RUT_PROBE="ja x" schritt spaeter
    DROSSEL_STUFE=2 PLANRUNDE=0; echt; RUT_PROBE="ja x" schritt rut2' _ "$DA")" \
  '^rut neu .*nicht gebremst: Release unter Tage' '^nein warten' '^spaeter warten' '^rut2 neu .*Release unter Tage'
pruefe "Drossel: Hauptschleife wendet sie vor jedem neuen Eintrag an" "$(grep -c 'entscheiden; drossel_anwenden; log' $SKRIPT)" '^1$'
pruefe "Fenster-Takt: Skript nutzt die gemeinsame Rechnung aus lauf-hilfen.zsh" "$(grep -c 'FENSTER_DEF_PY\$ENTSCHEID_PY' $SKRIPT; grep -c '^FENSTER_DEF_PY=' $REPO/tests/lauf-hilfen.zsh)" '^1
1$'
pruefe "Volldampf angemeldet (Montag): keine Wirkung, nur Vermerk" "$(HALO_VOLLDAMPF_DATEI=$T/vd.txt lauf 2026-11-16T12:00:00+01:00 95)" \
  'Volldampf angemeldet \(ab 2026-11-17T01:00\+01:00, bis 2026-11-24T01:00\+01:00\), nicht aktiv' 'Rate 0\.00' 'Tageslimit 40 eigene'
print -r -- "2026-11-17T01:00+01:00 2026-11-24T01:00+01:00 2026-11-17T08:00+01:00 98" > $T/volldampf-beendet.txt
pruefe "Volldampf pausiert (Wochenlimit): normale Regeln, Vermerk" "$(HALO_VOLLDAMPF_DATEI=$T/vd.txt lauf $JD 30)" \
  'Volldampf pausiert: Wochenlimit erreicht um 17\.11\. 08:00 \(98 %\), wartet auf den freien Reset' 'deutlich darüber' 'Tageslimit 40 eigene'
# freier Reset (Maintainer 18.11.2026): Anker nach der Marke → Volldampf läuft weiter; im Volldampf gilt seit 20.11.2026 das
# Soll der Kalenderwoche (9 h von 168 h = 5,4 %), auch nach dem freien Reset
print -r -- "anker 2026-11-17T09:00+01:00 98 2" > $T/anker.txt
pruefe "nach dem freien Reset: Volldampf wieder aktiv, Soll der Kalenderwoche" "$(HALO_WOCHENANKER=$T/anker.txt HALO_VOLLDAMPF_DATEI=$T/vd.txt lauf $JD 3)" \
  'Volldampf aktiv bis 2026-11-24T01:00\+01:00 \(pausiert beim Wochenlimit bis zum freien Reset; freier Reset 17\.11\. 09:00\)' \
  'Soll: +5\.4 % \(vergangene Zeit der Kalenderwoche\)' 'Entscheidung: neu beginnen'
# ohne Volldampf (Maintainer 23.11.2026: „immer von dienstag 01:00 auf dienstag 01:00“): Soll ab Di 01:00 (9 h = 5,4 %),
# der freie Reset nur als Information
pruefe "ohne Volldampf nach dem freien Reset: Soll weiter ab Di 01:00, Anker nur Information" "$(HALO_WOCHENANKER=$T/anker.txt lauf $JD 3)" \
  'Soll: +5\.4 %   Ist' 'freier Reset Di 2026-11-17 09:00 \(zählt für das Soll nicht\)'
rm -f $T/anker.txt
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
# Volldampf aus mitten am Tag (Maintainer 17.11.2026: „wir müssen dann sofort weiter aktiv im regulären modus laufen.“):
# Zeitgrenzen werden bei jeder Entscheidung und in der Wache jede Minute neu gesetzt, nicht nur beim Start
GS=$(sed -n '/^grenzen_setzen() {/,/^}/p' $SKRIPT)
pruefe "Zeitgrenzen folgen Volldampf sofort (an → 23:30/23:59, aus → 20:30/22:00, HART neu)" "$(
  typeset -A KONF; KONF=(LETZTER_BEGINN 23:30 ENDE 23:59 LETZTER_BEGINN_VOLLDAMPF 23:30 ENDE_VOLLDAMPF 23:59)
  LB_NORMAL=20:30 ENDE_NORMAL=22:00 TAG=2026-11-17 LOG=/dev/null
  uhr() { date -j -f '%F %H:%M' "$TAG $1" +%s }
  source ${SKRIPT:h}/lauf-hilfen.zsh; eval $GS
  export HALO_JETZT=2026-11-17T21:00+01:00 HALO_VOLLDAMPF_DATEI=$T/vd.txt HALO_VOLLDAMPF_BEENDET=$T/gs-beendet.txt
  grenzen_setzen; print "an $KONF[LETZTER_BEGINN] $KONF[ENDE] $(( HART == $(uhr 23:59) ))"
  HALO_VOLLDAMPF_DATEI=$T/kein-volldampf.txt grenzen_setzen; print "aus $KONF[LETZTER_BEGINN] $KONF[ENDE] $(( HART == $(uhr 22:00) ))"
  grenzen_setzen ja; print "ja $KONF[ENDE]"; grenzen_setzen nein; print "nein $KONF[ENDE]")" \
  '^an 23:30 23:59 1' '^aus 20:30 22:00 1' '^ja 23:59' '^nein 22:00'
pruefe "volldampf_lesen setzt die Zeitgrenzen, Wache liest sie jede Minute neu" "$(<$SKRIPT)" \
  'grenzen_setzen \$VD' 'while \(\( \$\(date \+%s\) < \$\(grenzen_setzen; print \$HART\) \)\)'
# Platzhalter-Woche 0 beim Start (08:45, nur Tag und Zeitfenster) ist kein freier Reset (18.11.2026): mit NUR_ZEIT kein
# Wochenstand, kein Anker; ohne NUR_ZEIT (echter Wert) erkennt derselbe Sturz den Anker
VL=$(sed -n '/^volldampf_lesen() {/,/^}/p' $SKRIPT)
print "2026-11-18T08:00+01:00 67" > $T/stand.txt
pruefe "Start 08:45: Platzhalter-Woche 0 schreibt keinen Anker und keinen Wochenstand" "$(
  LOG=/dev/null; source ${SKRIPT:h}/lauf-hilfen.zsh; eval $VL; grenzen_setzen() { : }; volldampf_status() { : }
  export HALO_JETZT=2026-11-18T08:45+01:00 HALO_WOCHENSTAND=$T/stand.txt HALO_WOCHENANKER=$T/fa-anker.txt HALO_PUSH_TROCKEN=1 \
    HALO_UEBERSPRUNGEN_LOG=/dev/null HALO_HANDELN_LOG=/dev/null HALO_VOLLDAMPF_DATEI=$T/kein-volldampf.txt HALO_VOLLDAMPF_ERINNERT=$T/fa-erinnert.txt
  TROCKEN= K_WOCHE=0; NUR_ZEIT=1 volldampf_lesen >/dev/null
  print "nur_zeit anker=$([[ -e $T/fa-anker.txt ]] && print ja || print nein) stand=$(<$T/stand.txt)"
  volldampf_lesen >/dev/null
  print "echt anker=$([[ -s $T/fa-anker.txt ]] && print ja || print nein)")" \
  '^nur_zeit anker=nein stand=2026-11-18T08:00\+01:00 67$' '^echt anker=ja$'
# Nachtlauf: ohne Volldampf (aus, Ende) sofort wieder alle normalen Grenzen samt Ende 08:00
pruefe "Nachtlauf: Rückfall setzt auch ENDE auf 08:00 zurück und meldet „Volldampf aus“" "$(<${SKRIPT:h}/nachtlauf.sh)" \
  'ENDE=\$NORMAL_ENDE NACHT_ENDE_TEXT=\$NORMAL_ENDE_TEXT' 'Volldampf aus \(von Hand ausgeschaltet'
# belegt_tag (Umbau P2 K3, Satz P2 des Maintainers 25.11.2026): Ungespeichertes in ~/halo-spaces zählt nicht als belegt,
# CI und Testlauf weiter. Eigene Probe-Repo, Muster auf $T eingeengt, Probeprozesse als Kinder (exec -a), Ports und
# Sitzungen als Attrappe; echte Prozesse, Sperren und das echte Repo fasst der Test nicht an
BT=$(sed -n '/^belegt_tag() {/,/^}/p' $SKRIPT)
mkdir -p $T/bt-nacht $T/bt-home
git -C $T init -q bt-repo && print a > $T/bt-repo/f && git -C $T/bt-repo add f \
  && git -C $T/bt-repo -c user.name=t -c user.email=t@t commit -qm a && print b > $T/bt-repo/f
bt() {   # <Probe: leer|ci|test> – Ausgabe „frei“ oder der Grund von belegt_tag, dazu der Grund von belegt
  (
    LOG=/dev/null; source ${SKRIPT:h}/lauf-hilfen.zsh; eval $BT
    aktive_sitzung() { return 1 }; lsof() { return 1 }
    HOME=$T/bt-home DIR=$T/bt-nacht REPO=$T/bt-repo REST_MITNEHMEN=
    BELEGT_CI_MUSTER="$T/bt-ci/Runner\.Worker" BELEGT_TEST_MUSTER="$T/bt-probe/tests/halo_test\.py"
    BELEGT_TB_MUSTER="$T/bt-kein-tb" BELEGT_RELEASE_MUSTER="$T/bt-kein-release"
    local p=
    case $1 in
      ci) ( exec -a $T/bt-ci/Runner.Worker zsh -fc 'zmodload zsh/zselect; zselect -t 3000' ) & p=$! ;;
      test) ( exec -a python3 zsh -fc 'zmodload zsh/zselect; zselect -t 3000' $T/bt-probe/tests/halo_test.py ) & p=$! ;;
    esac
    [[ -n $p ]] && sleep 0.5
    print -r -- "tag=$(belegt_tag || print frei) gesamt=$(belegt || print frei)"
    [[ -n $p ]] && kill $p 2>/dev/null
  )
}
pruefe "belegt_tag: Ungespeichertes in ~/halo-spaces hält die Tagesroutine nicht auf (belegt() selbst meldet es weiter)" "$(bt leer)" \
  '^tag=frei gesamt=ungespeicherte Änderungen in '
pruefe "belegt_tag: CI-Lauf zählt als belegt" "$(bt ci)" '^tag=CI-Lauf auf dem GitHub-Runner '
pruefe "belegt_tag: Testlauf zählt als belegt" "$(bt test)" '^tag=Testlauf \(halo_test\.py o\. ä\.\) '
print 1234567 > $T/bt-nacht/lauf.lock
pruefe "belegt_tag: Sperre eines toten Nachtlaufs zählt nicht" "$(bt leer)" '^tag=frei '
print $$ > $T/bt-nacht/lauf.lock
pruefe "belegt_tag: laufender Nachtlauf zählt als belegt" "$(bt leer)" '^tag=Nachtlauf läuft oder wartet '
rm -f $T/bt-nacht/lauf.lock

# --- Leere Plan-Runde nicht stündlich wiederholen (Logikprüfung 27.11.2026, Punkt 7): Fingerabdruck und Entscheidung
# über die Proben --fingerabdruck und --auslassen (kein Claude, kein Fetch, nur Testdateien und ein Wegwerf-Repo)
FPR=$T/fp-repo FPN=$T/fp-nacht; mkdir -p $FPN
git init -q $FPR && git -C $FPR -c user.name=t -c user.email=t@t commit -q --allow-empty -m eins \
  && git -C $FPR update-ref refs/remotes/origin/main HEAD
print -lr -- "# Häufung 2026-11-29" "" "Erzeugt 2026-11-29 09:01 von tests/haeufung.py aus 97 offenen Einträgen" "## G1: 3 Einträge" > $FPN/2026-11-29-haeufung.md
print -r -- "umbau 2026-11-23 2026-12-01" > $FPN/umbau-woche.txt
print -r -- "PVTI_a	erledigt" > $FPN/2026-11-29-tagesroutine-erledigt.txt
fp() { HALO_NACHT_DIR=$FPN HALO_TAG=2026-11-29 HALO_UMBAU_DATEI=$FPN/umbau-woche.txt HALO_UMBAU_LOCKERUNG=$FPN/umbau-lockerung.txt \
  zsh $SKRIPT --fingerabdruck $FPR 2>&1 }
FP1=$(fp)
setopt extendedglob
if [[ $FP1 == [0-9a-f](#c16) ]]; then print "OK     Fingerabdruck: 16 Zeichen Prüfsumme"; else print "FEHLER Fingerabdruck: „$FP1“"; FEHLER=1; fi
gleich_oder() {   # <Name> <erwartet gleich|anders> <Abdruck>
  if [[ ($2 == gleich && $3 == $FP1) || ($2 == anders && $3 != $FP1) ]]; then print -r -- "OK     $1"
  else print -r -- "FEHLER $1 ($3 gegen $FP1)"; FEHLER=1; fi
}
sed -i '' 's/09:01/10:01/' $FPN/2026-11-29-haeufung.md
gleich_oder "Fingerabdruck: Erzeugungszeit der Häufung zählt nicht" gleich "$(fp)"
sed -i '' 's/97 offenen/96 offenen/' $FPN/2026-11-29-haeufung.md
gleich_oder "Fingerabdruck: geänderte Häufung zählt" anders "$(fp)"
sed -i '' 's/96 offenen/97 offenen/' $FPN/2026-11-29-haeufung.md
print -r -- "lockerung 2026-11-28 2026-12-01" > $FPN/umbau-lockerung.txt
gleich_oder "Fingerabdruck: Lockerung der Umbau-Woche zählt" anders "$(fp)"
rm $FPN/umbau-lockerung.txt
gleich_oder "Fingerabdruck: ohne Lockerung wieder gleich" gleich "$(fp)"
print -r -- "umbau 2026-11-23 2026-11-30" > $FPN/umbau-woche.txt
gleich_oder "Fingerabdruck: Schalter der Umbau-Woche zählt" anders "$(fp)"
print -r -- "umbau 2026-11-23 2026-12-01" > $FPN/umbau-woche.txt
print -r -- "PVTI_b	zurück" >> $FPN/2026-11-29-tagesroutine-erledigt.txt
gleich_oder "Fingerabdruck: Liste „heute erledigt“ zählt" anders "$(fp)"
print -r -- "PVTI_a	erledigt" > $FPN/2026-11-29-tagesroutine-erledigt.txt
git -C $FPR -c user.name=t -c user.email=t@t commit -q --allow-empty -m zwei && git -C $FPR update-ref refs/remotes/origin/main HEAD
gleich_oder "Fingerabdruck: neuer Stand von origin/main zählt" anders "$(fp)"
git -C $FPR update-ref refs/remotes/origin/main HEAD~1
gleich_oder "Fingerabdruck: alter Stand wieder gleich" gleich "$(fp)"

# Entscheidung: letzte echte Runde begann Sa 28.11. 09:00:20 Wien
R9=$(python3 -I -c 'import datetime as d;print(int(d.datetime.fromisoformat("2026-11-28T09:00:20+01:00").timestamp()))')
ausl() { HALO_JETZT=$1 zsh $SKRIPT --auslassen "$2" "$3" $R9 $REPO 2>&1 }
pruefe "Auslassen: gleich um 10:00 → keine Plan-Runde" "$(ausl 2026-11-28T10:00:30+01:00 $FP1 $FP1)" '^auslassen$'
pruefe "Auslassen: gleich um 12:00 → keine Plan-Runde" "$(ausl 2026-11-28T12:00:40+01:00 $FP1 $FP1)" '^auslassen$'
pruefe "Auslassen: geändert → echte Plan-Runde" "$(ausl 2026-11-28T10:00:30+01:00 $FP1 0123456789abcdef)" '^runde geändert$'
pruefe "Auslassen: kein neuer Abdruck (Häufung/Fetch gescheitert) → echte Plan-Runde" "$(ausl 2026-11-28T10:00:30+01:00 $FP1 '')" '^runde geändert$'
pruefe "Auslassen: gleich, aber 4 Stunden um (13:00, Wecker 10 s früher als die Runde) → echte Plan-Runde" \
  "$(ausl 2026-11-28T13:00:10+01:00 $FP1 $FP1)" '^runde 4 Stunden$'
pruefe "Auslassen: gleich nach 5 Stunden → echte Plan-Runde" "$(ausl 2026-11-28T14:00:30+01:00 $FP1 $FP1)" '^runde 4 Stunden$'
# Schleife: „leerer Plan ist kein Ende“ bleibt – das Auslassen wartet wie ein leerer Plan (nach_plan 0 0) und endet nie selbst
SKRIPTTEXT=$(<$SKRIPT)
if [[ $SKRIPTTEXT == *'if [[ $a == auslassen ]]; then'*'nach_plan 0 0 $OHNE_ERGEBNIS'*'Plan-Runde ausgelassen: nichts geändert'*'continue'* ]]; then
  print "OK     Auslassen in der Schleife: wartet wie ein leerer Plan (nach_plan 0 0), kein Ende"
else print "FEHLER Auslassen in der Schleife: Verdrahtung nicht gefunden"; FEHLER=1; fi
exit $FEHLER
