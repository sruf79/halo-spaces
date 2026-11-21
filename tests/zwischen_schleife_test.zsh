#!/bin/zsh
# Prüft den Wächter tests/zwischen-schleife.zsh (Zwischen-Releases im Volldampf, Maintainer 17.11.2026) ohne Claude,
# ohne Thunderbird, ohne Netz: Entscheidung im Trockenlauf, feste Regeln im Skript und die Worktree-Mechanik
# (Wegwerf-Repos: Push über den Upstream origin/main, der gemeinsame Checkout mit fremden Änderungen bleibt unberührt).
#   zsh tests/zwischen_schleife_test.zsh   eine Zeile OK/FEHLER je Fall, Exitcode 1 bei einem Fehler
emulate -L zsh
HIER=${0:A:h}
SKRIPT=$HIER/zwischen-schleife.zsh
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
# W [VAR=Wert …]: Trockenlauf mit Standardwerten (10:00, Volldampf, grüner Stand, 3 Thunderbird-Commits, frei)
W() {
  env HALO_VOLLDAMPF_DATEI=$T/vd.txt HALO_VOLLDAMPF_BEENDET=$T/vd-beendet.txt HALO_WOCHENANKER=$T/kein-anker.txt HALO_VOLLDAMPF_JETZT=2026-11-17T10:00+01:00 \
    HALO_PAUSEN_DATEI=$T/pausen.txt HALO_BELEGT= HALO_ZS_STAND=abcdef1234567 HALO_ZS_TB=3 HALO_JETZT_HM=1000 \
    HALO_ZS_MISCHBAR=ja HALO_ZS_NUR_PRUEF=nein HALO_ZS_SPUERBAR=ja ZWISCHEN_ERZWINGEN= HALO_ZS_GESPERRT_DATEI=$T/gesperrt.txt HALO_ZS_5H=40 HALO_ZS_FENSTER_REST=3600 \
    "$@" zsh $SKRIPT --trocken 2>&1
}
L=$(git -C $HIER/.. tag -l 'v[0-9]*' --sort=-v:refname | head -1); L=${L#v}
S=$(grep -vE '^[[:space:]]*#' $SKRIPT)
NEU=${L%%.*}.$(( ${${L#*.}%%.*} + 1 )).0

pruefe "fällig: grüner Stand, 3 Thunderbird-Commits, 10:00" "$(W)" '^Prüfung:  fällig abcdef1234567 3 pruef/tagesroutine-[0-9]{8}$' "Zwischen-Release ${NEU//./\\.} für Stand abcdef1"
pruefe "Version: nächste Minor-Version nach dem letzten Tag ($L → $NEU)" "$(W)" "Release ${NEU//./\\.} "
pruefe "2 Thunderbird-Commits: warten (ab 3)" "$(W HALO_ZS_TB=2)" 'warten 2 Thunderbird-Commits .*\(ab 3, 5-Stunden-Fenster 40 %\)'
pruefe "Schwelle einstellbar (ZWISCHEN_RELEASE_AB=1)" "$(W HALO_ZS_TB=1 ZWISCHEN_RELEASE_AB=1)" 'fällig'
pruefe "kein grüner Stand auf einem Prüfzweig: warten" "$(W HALO_ZS_STAND=)" 'warten kein neuer grüner Stand'
pruefe "Stand eines roten Versuchs: warten bis zu einem neuen grünen Stand" "$(W HALO_ZS_GESPERRT=abcdef1234567)" 'warten Stand abcdef1 \(pruef/tagesroutine-[0-9]{8}\) war rot'
pruefe "neuer grüner Stand nach Rot: wieder fällig" "$(W HALO_ZS_GESPERRT=0000000 )" 'fällig'
pruefe "belegt (CI): warten" "$(W HALO_BELEGT='CI-Lauf auf dem GitHub-Runner')" 'warten belegt: CI-Lauf'
pruefe "08:59: Push-Sperre" "$(W HALO_JETZT_HM=0859)" 'warten Push-Sperre bis 09:00'
pruefe "22:29: noch fällig (spätester Push-Beginn 22:30)" "$(W HALO_JETZT_HM=2229)" 'fällig'
pruefe "22:30: kein Push-Beginn mehr, aber warten statt enden (Wächter läuft am nächsten Volldampf-Tag weiter)" "$(W HALO_JETZT_HM=2230)" 'Prüfung:  warten Push-Beginn nur bis 2230, wieder ab 09:00'
pruefe "23:59: weiter warten, kein Ende" "$(W HALO_JETZT_HM=2359)" 'Prüfung:  warten Push-Beginn nur bis 2230'
pruefe "ohne Volldampf: Ende" "$(W HALO_VOLLDAMPF_DATEI=$T/keine.txt)" 'ende Volldampf nicht aktiv'
print -r -- "2026-11-17T01:00+01:00 2026-11-24T01:00+01:00 2026-11-17T08:00+01:00 98" > $T/vd-beendet.txt
pruefe "Volldampf pausiert (Wochenlimit, 18.11.2026): warten statt Ende" "$(W)" 'warten Volldampf pausiert'
print -r -- "anker 2026-11-17T09:00+01:00 98 1" > $T/anker.txt
pruefe "nach dem freien Reset (Anker nach der Marke): wieder fällig" "$(W HALO_WOCHENANKER=$T/anker.txt)" 'fällig'
rm -f $T/anker.txt
rm -f $T/vd-beendet.txt
print -r -- "zwischen-release 2099-01-01T00:00+01:00 Probe" > $T/pausen.txt
pruefe "Pause zwischen-release in pausen.txt: warten" "$(W)" 'warten Pause'
rm -f $T/pausen.txt

# Prüfzweige aller Art (Maintainer 18.11.2026), Fenster-Schwelle, Sperrdatei
pruefe "anderer Prüfzweig grün (pruef/worker-…): fällig mit seinem Zweig" "$(W HALO_ZS_STAND='abcdef1234567 pruef/worker-20261118-0906-1')" \
  '^Prüfung:  fällig abcdef1234567 3 pruef/worker-20261118-0906-1$' 'von pruef/worker-20261118-0906-1 im Worktree'
pruefe "roter Versuch (Sperrdatei) nicht wiederholt: nächster Prüfzweig fällig" \
  "$(print -r -- abcdef1234567 > $T/gesperrt.txt; W HALO_ZS_STAND=$'abcdef1234567 pruef/a\n1234567abcdef pruef/b')" '^Prüfung:  fällig 1234567abcdef 3 pruef/b$'
pruefe "roter Versuch als einziger Kandidat: warten" "$(W HALO_ZS_STAND='abcdef1234567 pruef/a')" 'warten Stand abcdef1 \(pruef/a\) war rot'
rm -f $T/gesperrt.txt
pruefe "Fenster 90 % und 1 Thunderbird-Commit: fällig (Schwelle 1)" "$(W HALO_ZS_TB=1 HALO_ZS_5H=90)" '^Prüfung:  fällig abcdef1234567 1 pruef/.*5-Stunden-Fenster 90 %'
pruefe "Fenster 85 % (Grenze) und 1 Commit: fällig" "$(W HALO_ZS_TB=1 HALO_ZS_5H=85)" 'fällig'
pruefe "Fenster 40 % und 1 Thunderbird-Commit: warten (ab 3)" "$(W HALO_ZS_TB=1 HALO_ZS_5H=40)" 'warten 1 Thunderbird-Commits .*\(ab 3, 5-Stunden-Fenster 40 %\)'
pruefe "Fenster 90 %, aber Fensterende vorbei (alter Wert): warten" "$(W HALO_ZS_TB=1 HALO_ZS_5H=90 HALO_ZS_FENSTER_REST=0)" 'warten 1 Thunderbird-Commits .*ab 3, 5-Stunden-Fenster unbekannt'
pruefe "Fenster 90 % und 0 Thunderbird-Commits: warten" "$(W HALO_ZS_TB=0 HALO_ZS_5H=90)" 'warten 0 Thunderbird-Commits'
pruefe "Fenster 90 % ändert nichts an der Push-Sperre" "$(W HALO_ZS_TB=1 HALO_ZS_5H=90 HALO_JETZT_HM=0859)" 'warten Push-Sperre bis 09:00'
pruefe "Fenster 90 % ändert nichts an belegt (CI)" "$(W HALO_ZS_TB=1 HALO_ZS_5H=90 HALO_BELEGT='CI-Lauf auf dem GitHub-Runner')" 'warten belegt: CI-Lauf'
# Nur Spürbares (Maintainer 20.11.2026): Nutzer-Fix oder Dringendes unter extension/ oder chrome/, sonst Nachtlauf
pruefe "nichts Spürbares (nur Optik/Ablauf): warten mit Grund" "$(W HALO_ZS_SPUERBAR=nein)" 'warten Stand abcdef1 .*keinen Fehler, den Nutzer bemerken'
pruefe "nichts Spürbares, aber ZWISCHEN_ERZWINGEN=1 (Maintainer): fällig" "$(W HALO_ZS_SPUERBAR=nein ZWISCHEN_ERZWINGEN=1)" '^Prüfung:  fällig abcdef1234567 3 '
pruefe "erster Stand nicht spürbar, ERZWINGEN nur mit 1" "$(W HALO_ZS_SPUERBAR=nein ZWISCHEN_ERZWINGEN=ja)" 'warten .*keinen Fehler'
G=$T/sp
git init -q -b main $G; git -C $G config user.email t@t; git -C $G config user.name t
mkdir -p $G/chrome $G/tests; print a > $G/chrome/a.css; git -C $G add -A; git -C $G commit -qm 'Mail: früherer Fix (GitHub #1)'; git -C $G tag v1.0.0
print b > $G/tests/t.txt; git -C $G add -A; git -C $G commit -qm 'Tests: Prüfung dringend stabilisiert (GitHub #2)'
print c > $G/chrome/a.css; git -C $G add -A; git -C $G commit -qm 'Mail: Abstand der Liste wie im Vorbild'
SP1=$(git -C $G rev-parse HEAD)
pruefe "git: Nutzer-Fix nur vor dem letzten Tag bzw. außerhalb von extension/chrome: warten" \
  "$(W HALO_ZS_SPUERBAR=git HALO_REPO_MAIN=$G HALO_ZS_STAND="$SP1 pruef/sp")" 'warten .*keinen Fehler'
print d > $G/chrome/a.css; git -C $G add -A; git -C $G commit -qm 'Kalender: Absturz beim Öffnen behoben (GitHub #3)'
SP2=$(git -C $G rev-parse HEAD)
pruefe "git: Commit unter chrome/ mit Absturz und (GitHub #n) seit dem letzten Tag: fällig" \
  "$(W HALO_ZS_SPUERBAR=git HALO_REPO_MAIN=$G HALO_ZS_STAND="$SP2 pruef/sp")" "^Prüfung:  fällig $SP2 3 pruef/sp\$"
pruefe "Stand mit Commit „nicht nach main“: warten" "$(W HALO_ZS_NUR_PRUEF=ja)" 'warten Stand abcdef1 .*nicht nach main'
pruefe "Kandidaten aus GitHub-Läufen nur pruef/*, neuester grüner Stand je Zweig, ohne Diagnose-/Probezweige" "$S" \
  "gh run list -R \\\$R -w test.yml -e push -s success" 'startswith\("pruef/"\)' 'gesehen\[\$b\]' 'ZWEIG_AUS'
pruefe "Release mit dem Prüfzweig des Stands (zwischen-release.zsh prüft dessen Lauf)" "$S" 'HALO_PRUEFZWEIG=\$zw'

# Konflikt mit origin/main (echtes git, Wegwerf-Repo): kein Release; sauber mischbarer Zweig: fällig
K=$T/k.git KM=$T/km
git init -q --bare -b main $K; git clone -q $K $KM 2>/dev/null
git -C $KM config user.email t@t; git -C $KM config user.name t
print a > $KM/a.txt; git -C $KM add a.txt; git -C $KM commit -qm eins; git -C $KM push -q origin main
git -C $KM switch -q -c pruef/konflikt; print zweig > $KM/a.txt; git -C $KM commit -qam konflikt; KS=$(git -C $KM rev-parse HEAD)
git -C $KM switch -q -c pruef/sauber main; print neu > $KM/b.txt; git -C $KM add b.txt; git -C $KM commit -qm sauber; SS=$(git -C $KM rev-parse HEAD)
git -C $KM switch -q main; print haupt > $KM/a.txt; git -C $KM commit -qam haupt; git -C $KM push -q origin main
git -C $KM fetch -q origin
pruefe "Konflikt mit origin/main: kein Release (warten)" "$(W HALO_ZS_MISCHBAR=git HALO_ZS_NUR_PRUEF=git HALO_REPO_MAIN=$KM HALO_ZS_STAND="$KS pruef/konflikt")" 'warten Stand .* \(pruef/konflikt\) lässt sich nicht sauber .*Konflikt'
ZWEI="$KS pruef/konflikt"$'\n'"$SS pruef/sauber"
pruefe "Konflikt im ersten Zweig, zweiter sauber mischbar: der zweite ist fällig" \
  "$(W HALO_ZS_MISCHBAR=git HALO_ZS_NUR_PRUEF=git HALO_REPO_MAIN=$KM HALO_ZS_STAND=$ZWEI)" "^Prüfung:  fällig $SS 3 pruef/sauber\$"
pruefe "Commit „nicht nach main“ (echtes git): kein Release" \
  "$(git -C $KM switch -q pruef/sauber; git -C $KM commit -q --allow-empty -m 'Tests: Diagnose (nur Prüfzweig, kommt nicht nach main)'; D=$(git -C $KM rev-parse HEAD); git -C $KM switch -q main
     W HALO_ZS_MISCHBAR=git HALO_REPO_MAIN=$KM HALO_ZS_NUR_PRUEF=git HALO_ZS_STAND="$D pruef/sauber")" 'nicht nach main'

# feste Regeln im Skript
pruefe "gemeinsamer Checkout: kein stash, reset, checkout, merge, rebase, commit, push, clean" \
  "$(print -r -- $S | grep -cE 'git -C \$MAIN (stash|reset|checkout|merge( |$)|rebase|commit|push|clean|restore)')" '^0$'
pruefe "nur der eigene Worktree wird entfernt" "$(print -r -- $S | grep -E 'worktree remove')" 'worktree remove --force \$WT '
pruefe "Claude arbeitet im Worktree, Release über zwischen-release.zsh mit HALO_REPO=\$WT und dem geprüften Stand" "$S" \
  'cd \$WT && claude -p' 'HALO_REPO=\$WT HALO_ZR_STAND=\$p HALO_PRUEFZWEIG=\$zw ZWISCHEN_RELEASE_BIS=\$BIS zsh \$HIER/zwischen-release\.zsh'
pruefe "nie SKIP_TESTS/FORCE_TESTS/HOTFIX, kein release.sh/publish.sh direkt, kein Force-Push" \
  "$(print -r -- $S | grep -cE 'SKIP_TESTS|FORCE_TESTS|HOTFIX=|push -f|--force-with|release\.sh|publish\.sh| push [^|;]*--force')" '^0$'
pruefe "Listen-Commits nach dem Release nur ohne Thunderbird-Änderung" "$S" '! zsh \$WT/tests/ci-noetig.sh origin/main HEAD'
pruefe "Rot sperrt den Stand (auch über Neustarts, Sperrdatei), Abbruch vor dem Push erst beim zweiten Mal" "$S" 'rc == 1' 'ABBRUCH_AN=\$p' 'sperren \$p' 'print -r -- \$1 >> \$GDATEI'
pruefe "Name ohne „release.sh“ (belegt() sucht release\\.sh|publish\\.sh)" "$(print -r -- zwischen-schleife.zsh | grep -cE 'release\.sh|publish\.sh')" '^0$'

# Worktree-Mechanik mit Wegwerf-Repos (wie release_lauf und publish.sh: „git push“ ohne Ziel)
O=$T/origin.git M=$T/main WTT=$T/wt
git init -q --bare -b main $O
git clone -q $O $M 2>/dev/null
git -C $M config user.email t@t; git -C $M config user.name t
print a > $M/a.txt; print r > $M/README.md; git -C $M add a.txt README.md; git -C $M commit -qm eins; git -C $M push -q origin main
print b >> $M/a.txt; git -C $M commit -qam zwei                      # P: lokal, nicht gepusht
P=$(git -C $M rev-parse HEAD)
print fremd >> $M/a.txt; print neu > $M/fremd.txt                   # fremde, ungespeicherte Arbeit im Checkout
VORHER=$(git -C $M status --porcelain; md5 -q $M/a.txt)
git -C $M worktree add -q -f -B zr/release $WTT $P
git -C $WTT branch -q --set-upstream-to=origin/main
print w >> $WTT/README.md; git -C $WTT -c user.email=t@t -c user.name=t commit -qam "README: Versionshinweise"
GIT_CONFIG_COUNT=1 GIT_CONFIG_KEY_0=push.default GIT_CONFIG_VALUE_0=upstream git -C $WTT push -q 2>&1
pruefe "Worktree: „git push“ ohne Ziel landet über den Upstream auf origin main" \
  "$(git -C $O rev-parse main; git -C $WTT rev-parse HEAD)" "^$(git -C $WTT rev-parse HEAD)\$"
pruefe "Worktree: Checkout mit fremden Änderungen unberührt (Status, Inhalt, HEAD)" \
  "$( [[ "$(git -C $M status --porcelain; md5 -q $M/a.txt)" == "$VORHER" && $(git -C $M rev-parse HEAD) == $P ]] && print gleich)" '^gleich$'
pruefe "Worktree: ohne push.default=upstream lehnt git einen anderen Zweignamen ab (darum die Einstellung)" \
  "$(git -C $WTT commit -q --allow-empty -m x -c user.email=t@t 2>/dev/null; git -C $WTT -c user.email=t@t -c user.name=t commit -q --allow-empty -m x; git -C $WTT -c push.default=simple push -q 2>&1; print rc=$?)" 'rc=[1-9]'
# Ergebnis an neon statt aufs iPhone (Maintainer 18.11.2026), Zeile in zwischen-ergebnis.txt; Funktion aus dem Skript
FN=$(sed -n '/^melden() {/,/^}/p' $SKRIPT)
mel() {   # <an_neon-Rückgabe> <Argumente für melden …>
  ( source $HIER/lauf-hilfen.zsh 2>/dev/null; LOG=/dev/null MODUS= ERGEBNIS=$T/erg.txt HALO_PUSH_TROCKEN=1 HALO_HANDELN_LOG=$T/h.log
    local rc=$1; shift
    eval "$FN"
    an_neon() { print -r -- "AN_NEON<<$1>>"; return $rc }
    melden "$@" ) 2>&1
}
rm -f $T/erg.txt
A=$(mel 0 "ROT nach Wiederholung" 3.32.0 abcdef1234567 pruef/x "Push 111, Windows 222" $'linux (esr): Today-Pane\nmac: Seitenleiste' "ja (Lauf 111, Versuch 2)")
pruefe "Meldung an neon: Kopf, Läufe, je rote Prüfung eine Zeile, Wiederholung, „neon kümmert sich“, kein push" "$A" \
  '^AN_NEON<<\[zwischen-release\] ROT nach Wiederholung: Version 3\.32\.0, Stand abcdef1, Zweig pruef/x$' '^Läufe: Push 111, Windows 222$' \
  '^- linux \(esr\): Today-Pane$' '^- mac: Seitenleiste$' '^Wiederholung: ja \(Lauf 111, Versuch 2\)$' '^neon kümmert sich\.>>$'
pruefe "Meldung an neon: ohne iPhone, wenn neon erreicht wurde" "$(print -r -- $A | grep -c 'TROCKEN: push')" '^0$'
pruefe "Ergebniszeile (tail -1 genügt): Zeit | Version | Stand | Zweig | Ergebnis | Läufe | Prüfungen | Wiederholung" "$(tail -1 $T/erg.txt)" \
  '^20[0-9-]{8} [0-9:]{8} \| 3\.32\.0 \| abcdef1 \| pruef/x \| ROT nach Wiederholung \| Push 111, Windows 222 \| linux \(esr\): Today-Pane; mac: Seitenleiste \| Wiederholung ja'
pruefe "neon nicht erreichbar: einmal push() aufs iPhone" "$(mel 1 ABBRUCH 3.32.0 abcdef1234567 pruef/x - Grund nein)" \
  'TROCKEN: push \[info\] Zwischen-Release-Wächter konnte neon nicht erreichen \(ABBRUCH, Version 3\.32\.0, Stand abcdef1\)'
pruefe "an_neon mit HALO_PUSH_TROCKEN: kein Claude, ohne „PUSH:“" \
  "$( (source $HIER/lauf-hilfen.zsh; LOG=/dev/null HALO_PUSH_TROCKEN=1 an_neon '[zwischen-release] Probe') 2>&1)" '^TROCKEN: an_neon \[zwischen-release\] Probe$'
pruefe "Wächter meldet nicht mehr per push() (nur als Ersatzweg in melden)" "$(print -r -- $S | grep -c '^ *push ')" '^1$'
pruefe "Wächter meldet jedes Ergebnis: veröffentlicht, ROT, ABBRUCH, belegt über 60 Min." "$S" 'melden veröffentlicht' 'melden "ROT' 'melden ABBRUCH' 'melden "belegt über \$BELEGT_MAX Min\."' 'BELEGT_MAX=\$\{ZS_BELEGT_MAX:-60\}'
pruefe "belegt: Ausgabe nennt den fälligen Stand" "$(W HALO_BELEGT='CI-Lauf')" 'warten belegt: CI-Lauf \(fällig abcdef1 pruef/'

# Vorrang für ein fälliges Zwischen-Release (neon-Auftrag #48, 19.11.2026): Marke zwischen-faellig.txt
ZF=$T/zf.txt
pruefe "Trockenlauf bei belegt schreibt keine Marke" "$(W HALO_BELEGT='Testlauf (halo_test.py o. ä.)' HALO_ZR_FAELLIG=$ZF; [[ -e $ZF ]] && print da || print weg)" 'warten belegt: Testlauf' '^weg$'
vr() { ( source $HIER/lauf-hilfen.zsh 2>/dev/null; LOG=/dev/null HALO_ZR_FAELLIG=$ZF; eval "$1" ) 2>&1 }
pruefe "Marke setzen (atomar, PID des Wächters) und lesen" "$(vr 'zr_vorrang_setzen fc2701d pruef/sammel-fehler-1119 11:54; zr_vorrang; print rc=$?; ls ${ZF:h} | grep -c "\.neu$"; head -1 $ZF')" \
  '^Stand fc2701d \(pruef/sammel-fehler-1119\) seit 11:54$' '^rc=0$' '^0$' '^[0-9]+ [0-9]+ fc2701d pruef/sammel-fehler-1119 11:54$'
pruefe "Marke älter als 60 Min.: nicht mehr frisch" "$(vr 'zr_vorrang_setzen fc2701d pruef/x 11:54; HALO_ZR_JETZT=$(( $(date +%s) + 3600 )) zr_vorrang; print rc=$?')" '^rc=1$'
pruefe "Marke eines beendeten Wächters (PID tot): nicht frisch" "$(print -r -- "$(date +%s) 999999 fc2701d pruef/x 11:54" > $ZF; vr 'zr_vorrang; print rc=$?')" '^rc=1$'
pruefe "Marke löschen" "$(vr 'zr_vorrang_setzen fc2701d pruef/x 11:54; zr_vorrang_loeschen; zr_vorrang; print rc=$?; [[ -e $ZF ]] && print da || print weg')" '^rc=1$' '^weg$'
pruefe "Vorrang im Wächter: Marke bei belegt je Takt, während des Release-Laufs erneuert, danach und beim Ende entfernt, nach VORRANG_MAX aufgegeben" "$S" \
  'zr_vorrang_setzen \$w\[1\] \$w\[2\] \$VORRANG_HM' 'ERNEUERER=\$!' 'kill \$ERNEUERER 2>/dev/null; zr_vorrang_loeschen' \
  "trap 'zr_vorrang_loeschen; rm -f \\\$LOCK' EXIT" 'VORRANG_MAX=\$\{ZS_VORRANG_MAX:-120\}' 'melden "Vorrang aufgegeben nach \$VORRANG_MAX Min\."' \
  'if \[\[ \$z != fällig\* \]\]; then'
pruefe "Abbruch wegen belegt (zwischen-release.zsh) sperrt den Stand nicht" "$S" '"ABBRUCH: neon belegt"\* \]\] && return 3' '\(\( rc == 3 \)\) && \{ log .*rc=0 \}'

# Wiederholung in zwischen-release.zsh (Funktionen aus dem Skript, gh als Attrappe)
ZR=$HIER/zwischen-release.zsh
ZF=$(sed -n '/^rote_pruefungen() {/,/^}/p;/^wiederholen() {/,/^}/p;/^nach_wiederholung() {/,/^}/p' $ZR)
wdh() {   # <Zahl roter Prüfungen in einem Job> <Versuch vorher> <Ergebnis der Wiederholung> [HHMM]
  ( R=x MAX_ROT=5 WDH_BIS=2300 HALO_JETZT=${4:-1000} ROT_TEXT= WDH= N=$1 A=$2 E=$3 RR=$T/rerun HIER=${ZR_HIER:-$T/ohne-skript}
    export HALO_FLACKERN_STAND=$T/zr-stand RR
    rm -f $RR $T/zr-stand $T/zr-aufrufe
    sleep() { : }
    gh() {
      case "$*" in
        *--log-failed*) for (( i = 1; i <= N; i++ )); do print -r -- "linux (esr)	Tests	2026 FEHLER  Prüfung $i – Wert"; done ;;
        *"--json jobs"*) print -r -- "linux (esr)" ;;
        *"--json attempt --jq"*) [[ -e $RR ]] && print 2 || print $A ;;
        *"run rerun"*) touch $RR ;;
        *"attempt,status"*) print -r -- "2 completed" ;;
        *conclusion*) print -r -- $E ;;
      esac
    }
    eval "$ZF"
    nach_wiederholung 4711 3; print "rc=$? erg=$NW_ERG rerun=$([[ -e $RR ]] && print ja || print nein) WDH=$WDH" ) 2>&1
}
pruefe "roter Lauf: einmal gh run rerun --failed, Wiederholung grün" "$(wdh 2 1 success)" '^WIEDERHOLT: Lauf 4711' 'erg=success' 'rc=0 erg=success rerun=ja WDH=ja \(Lauf 4711, Versuch 2\)'
pruefe "zweites Rot bleibt rot (Ergebnis der Wiederholung wird gemeldet, kein dritter Versuch)" "$(wdh 2 1 failure)" 'erg=failure' 'rerun=ja'
pruefe "mehr als 5 rote Prüfungen in einem Job: keine Wiederholung (echter Fehler)" "$(wdh 6 1 success)" 'rc=1 erg= rerun=nein WDH=nein: mehr als 5 rote Prüfungen'
pruefe "5 rote Prüfungen: noch Wiederholung" "$(wdh 5 1 success)" 'rc=0 erg=success rerun=ja'
pruefe "schon wiederholt (Versuch 2, z. B. ci-wiederholen.sh): kein zweites rerun, nur warten" "$(wdh 1 2 failure)" 'rerun=nein WDH=ja \(Lauf 4711, Versuch 2, schon von anderer Stelle' 'erg=failure'
pruefe "nach 23:00 keine Wiederholung mehr (Release bis 24:00; gemeinsame Startgrenze 09:00 bis 00:00)" "$(wdh 1 1 success 2300)" 'rc=1 erg= rerun=nein WDH=nein: nur 09:00 bis 2300'
mkdir -p $T/zr; print -r -- 'print -r -- "$*" >> ${HALO_FLACKERN_STAND:h}/zr-aufrufe; [[ -e $RR ]] || { touch $RR; print -r -- "$2 wiederholt" >> $HALO_FLACKERN_STAND }' > $T/zr/ci-wiederholen.sh
pruefe "mit ci-wiederholen.sh: Start und Auswertung darüber (zwei Aufrufe --lauf), Wiederholung grün" \
  "$(ZR_HIER=$T/zr wdh 2 1 success; print -r -- "aufrufe=$(paste -sd, $T/zr-aufrufe)")" 'rc=0 erg=success rerun=ja' 'aufrufe=--lauf 4711,--lauf 4711$'
pruefe "ci-wiederholen.sh wiederholt nicht (z. B. eigene Grenze): kein Rerun, Grund genannt" \
  "$(print -r -- 'print -r -- "$*" >> ${HALO_FLACKERN_STAND:h}/zr-aufrufe' > $T/zr/ci-wiederholen.sh; ZR_HIER=$T/zr wdh 2 1 success)" 'rc=1 erg= rerun=nein WDH=nein: ci-wiederholen.sh hat nicht wiederholt'
pruefe "vor 09:00 keine Wiederholung" "$(wdh 1 1 success 0859)" 'rc=1 erg= rerun=nein WDH=nein: nur 09:00'
pruefe "Wiederholung über ci-wiederholen.sh (flackern.log, Hinweis beim zweiten Flackern), ohne Skript gh run rerun" "$(grep -vE '^[[:space:]]*#' $ZR)" \
  'zsh \$HIER/ci-wiederholen.sh --lauf \$id' 'zsh \$HIER/ci-wiederholen.sh --lauf \$1' 'gh run rerun \$id -R \$R --failed'
pruefe "zwischen-release.zsh: Push- und Windows-Lauf vor ROT einmal wiederholt" "$(grep -vE '^[[:space:]]*#' $ZR)" \
  'nach_wiederholung \$\{L%% \*\} 150' 'nach_wiederholung \$\{W%% \*\} 60' 'auch in der Wiederholung rot' 'auch in der Wiederholung nicht grün'

# Director statt Wortliste (Maintainer 21.11.2026): Urteil, Beleg, Gedächtnis, Schatten/an/aus, Grenzen – ohne Claude
# (HALO_ZS_DIRECTOR ersetzt den Aufruf), Probe über --urteil in einem Wegwerf-Repo
D=$T/dir
git init -q -b main $D; git -C $D config user.email t@t; git -C $D config user.name t
mkdir -p $D/chrome $D/tests $D/extension; print a > $D/chrome/a.css; git -C $D add -A; git -C $D commit -qm 'Mail: alter Fix'; DALT=$(git -C $D rev-parse --short HEAD); git -C $D tag v1.0.0
print b > $D/tests/t.txt; git -C $D add -A; git -C $D commit -qm 'Tests: Prüfung stabilisiert'; DTEST=$(git -C $D rev-parse --short HEAD)
print c > $D/chrome/a.css; git -C $D add -A; git -C $D commit -qm 'Kalender: Absturz beim Öffnen behoben'; DFIX=$(git -C $D rev-parse --short HEAD)
DS1=$(git -C $D rev-parse HEAD)
U() {   # <Stand> [VAR=Wert …]: ein Urteil über --urteil (Protokoll, Gedächtnis, Ergebnisse in $T)
  local st=$1; shift
  env HALO_REPO_MAIN=$D HALO_ZS_URTEIL_DATEI=$T/u.txt HALO_ZS_URTEIL_MODUS_DATEI=$T/modus.txt HALO_ZS_GEDAECHTNIS=$T/ged.md \
    HALO_ZS_ERGEBNIS=$T/erg.txt HALO_ZS_LOG=$T/zs.log HALO_PAUSEN_DATEI=$T/p2.txt HALO_ZS_5H=40 HALO_ZS_FENSTER_REST=3600 \
    ZS_URTEIL= HALO_ZS_SPUERBAR=git "$@" zsh $SKRIPT --urteil $st pruef/d 2>&1
}
pruefe "Director: Schatten ist Standard – Director „nein“, Wortliste (Absturz) entscheidet ja, Zeile im Protokoll" \
  "$(U $DS1 HALO_ZS_DIRECTOR='nein Nur ein kleiner Fix.'; cat $T/u.txt)" 'Director \(schatten\): nein – Nur ein kleiner Fix\. \(Quelle director\); Wortliste ja; Entscheidung ja' \
  '^Entscheidung: ja$' "\| ${DS1[1,12]} \| pruef/d \| schatten \| nein \| - \| - \| Nur ein kleiner Fix\. \| wortliste ja \| quelle director \| schlüssel [0-9a-f]{12}$"
pruefe "Director: gleiches Urteil je Schlüssel gemerkt (kein neuer Aufruf, keine neue Zeile)" \
  "$(U $DS1 HALO_ZS_DIRECTOR="ja $DFIX 1 Absturz."; print -r -- "zeilen=$(wc -l < $T/u.txt | tr -d ' ')")" 'Director \(schatten\): nein .*Quelle gemerkt' 'zeilen=1$'
git -C $D switch -q -c pruef/d2; git -C $D commit -q --allow-empty -m 'Tests: leer'; DS2=$(git -C $D rev-parse HEAD); git -C $D switch -q main
pruefe "Director: neuer Stand ohne neuen Commit unter extension/chrome – „nein“ gilt weiter" \
  "$(U $DS2 HALO_ZS_DIRECTOR="ja $DFIX 1 Absturz.")" 'Quelle gemerkt'
print -r -- an > $T/modus.txt
print d > $D/extension/x.js; git -C $D add -A; git -C $D commit -qm 'Mail: Senden scheiterte bei Anhängen'; DFIX2=$(git -C $D rev-parse --short HEAD); DS3=$(git -C $D rev-parse HEAD)
pruefe "Director an (Modus aus Datei): neuer Commit unter extension/ → neues Urteil, „ja“ mit gültigem Beleg entscheidet gegen die Wortliste" \
  "$(U $DS3 HALO_ZS_DIRECTOR="Ich lese die Commits.
ja $DFIX2 2 Senden mit Anhang war kaputt.")" "Director \(an\): ja ${DFIX2} Kriterium 2 – Senden mit Anhang war kaputt\. \(Quelle director\); Wortliste ja; Entscheidung ja"
rm -f $T/u.txt
pruefe "Director an: „nein“ schlägt die Wortliste (Absturz im Text)" "$(U $DS3 HALO_ZS_DIRECTOR='nein Einzelmeldung, kleiner Fix.')" 'Entscheidung nein' '^Entscheidung: nein$'
rm -f $T/u.txt
pruefe "Director an: Beleg außerhalb von extension/chrome wird „nein“" "$(U $DS3 HALO_ZS_DIRECTOR="ja $DTEST 1 x")" 'nein .*Beleg ungültig \(Commit [0-9a-f]+ ändert nichts unter extension/ oder chrome/\)' '^Entscheidung: nein$'
rm -f $T/u.txt
pruefe "Director an: Beleg schon im letzten Tag wird „nein“" "$(U $DS3 HALO_ZS_DIRECTOR="ja $DALT 1 x")" 'Beleg ungültig \(Commit [0-9a-f]+ ist schon in v1\.0\.0\)'
rm -f $T/u.txt
pruefe "Director an: Kriterium außerhalb 1–4 wird „nein“" "$(U $DS3 HALO_ZS_DIRECTOR="ja $DFIX2 5 x")" 'Beleg ungültig \(Kriterium „5“ nicht 1–4\)'
rm -f $T/u.txt
pruefe "Director an: Commit nicht im Stand wird „nein“" "$(U $DS1 HALO_ZS_DIRECTOR="ja $DFIX2 1 x")" 'Beleg ungültig \(Commit [0-9a-f]+ liegt nicht im Stand\)'
rm -f $T/u.txt
pruefe "Director an: ohne Ergebniszeile Ausfall, Rückfall auf die Wortliste" "$(U $DS3 HALO_ZS_DIRECTOR='Fehler: Netz')" 'Director \(an\): ausfall – ohne Ergebniszeile.*Wortliste ja; Entscheidung ja'
pruefe "Director an: Ausfall ist nicht gemerkt (nächster Takt fragt neu)" "$(U $DS3 HALO_ZS_DIRECTOR='nein jetzt geurteilt.')" 'Director \(an\): nein – jetzt geurteilt\. \(Quelle director\)'
rm -f $T/u.txt
pruefe "Director: Tagesgrenze der Aufrufe (ZS_URTEIL_MAX=0) → Ausfall, Wortliste" "$(U $DS3 ZS_URTEIL_MAX=0 HALO_ZS_DIRECTOR='nein x')" 'ausfall – Tagesgrenze 0 Director-Urteile.*Entscheidung ja'
pruefe "Director: 5-Stunden-Fenster 96 % → kein Aufruf, Wortliste" "$(U $DS3 HALO_ZS_5H=96 HALO_ZS_DIRECTOR='nein x')" 'ausfall – 5-Stunden-Fenster 96 %'
rm -f $T/u.txt
pruefe "Director aus (ZS_URTEIL=aus): kein Urteil, kein Protokoll, nur die Wortliste" \
  "$(U $DS3 ZS_URTEIL=aus HALO_ZS_DIRECTOR='nein x'; print -r -- "protokoll=$([[ -e $T/u.txt ]] && print ja || print nein)")" '^Entscheidung: ja$' 'protokoll=nein'
pruefe "Director: LEHRE ins Gedächtnis (Datum, Quelle, Ablauf 30 Tage), NOTFALL-HINWEIS nur ins Protokoll" \
  "$(U $DS3 HALO_ZS_DIRECTOR="LEHRE: Senden-Fehler zählt als Grundfunktion
NOTFALL-HINWEIS: Senden scheitert für alle seit 3.36.0
nein Testfall."; cat $T/ged.md $T/u.txt)" "^$(date +%F) \| Senden-Fehler zählt als Grundfunktion \| Quelle: Urteil Stand ${DS3[1,7]} \| Ablauf: $(date -v+30d +%F)\$" \
  '\| an \| notfall-hinweis \| - \| - \| Senden scheitert für alle seit 3\.36\.0 \|'
rm -f $T/u.txt
print -r -- "$(date +%F) 11:00:00 | ${DS1[1,12]} | pruef/x | an | ja | ${DFIX} | 4 | alle Mac-Nutzer | wortliste nein | quelle director | schlüssel aaaaaaaaaaaa" > $T/u.txt
print -r -- "$(date +%F) 13:00:00 | 3.9.0 | ${DS1[1,7]} | pruef/x | veröffentlicht | - | - | Wiederholung nein" > $T/erg.txt
pruefe "Director an: höchstens ein Zwischen-Release je Tag nach Kriterium 4" "$(U $DS3 HALO_ZS_DIRECTOR="ja $DFIX2 4 Für alle Windows-Nutzer blockiert.")" 'Tagesgrenze Kriterium 4 \(1 je Tag\) erreicht' '^Entscheidung: nein$'
pruefe "Director an: Kriterium 1–3 ohne Tagesgrenze" "$(rm -f $T/u.txt; print -r -- "$(date +%F) 11:00:00 | ${DS1[1,12]} | pruef/x | an | ja | ${DFIX} | 4 | x | wortliste nein | quelle director | schlüssel aaaaaaaaaaaa" > $T/u.txt; U $DS3 HALO_ZS_DIRECTOR="ja $DFIX2 1 Absturz.")" '^Entscheidung: ja$'
rm -f $T/u.txt $T/erg.txt
git -C $D switch -q -c pruef/nurtests v1.0.0; mkdir -p $D/tests; print t > $D/tests/n.txt; git -C $D add -A; git -C $D commit -qm 'Tests: nur Tests'; DS4=$(git -C $D rev-parse HEAD); git -C $D switch -q main
pruefe "Director: ohne Commit unter extension/chrome seit dem Tag „nein“ ohne Aufruf (Skript)" "$(U $DS4 HALO_ZS_DIRECTOR="ja $DFIX 1 x")" 'Director \(an\): nein – keine Änderung unter extension/ oder chrome/ seit v1\.0\.0 \(Quelle skript\)'
pruefe "Trockenlauf: kein Claude (Ausfall), kein Protokoll; Entscheidung nach Wortliste" \
  "$(rm -f $T/u.txt; W HALO_ZS_SPUERBAR=git HALO_REPO_MAIN=$D HALO_ZS_STAND="$DS3 pruef/d" HALO_ZS_URTEIL_DATEI=$T/u.txt HALO_ZS_URTEIL_MODUS_DATEI=$T/modus.txt; print -r -- "protokoll=$([[ -e $T/u.txt ]] && print ja || print nein)")" \
  'Director \(an\): ausfall – Trockenlauf \(kein Claude\)' "^Prüfung:  fällig $DS3 3 pruef/d\$" 'protokoll=nein'
pruefe "ZWISCHEN_ERZWINGEN=1 braucht kein Urteil" \
  "$(W HALO_ZS_SPUERBAR=nein ZWISCHEN_ERZWINGEN=1 HALO_REPO_MAIN=$D HALO_ZS_STAND="$DS3 pruef/d" HALO_ZS_URTEIL_DATEI=$T/u.txt HALO_ZS_URTEIL_MODUS_DATEI=$T/modus.txt)" '^Prüfung:  fällig ' 
pruefe "Director nur lesend: Werkzeuge Bash/Read/Grep/Glob, dontAsk, nur git log/show/diff und gh issue, Opus, Zeitgrenze" "$S" \
  "--tools Bash,Read,Grep,Glob" '--permission-mode dontAsk' "'Bash\(git log:\*\)' 'Bash\(git show:\*\)' 'Bash\(git diff:\*\)'" \
  'DIRECTOR_MODELL=\$\{ZS_DIRECTOR_MODELL:-opus\}' 'pkill -f -- "--session-id \$sid"' 'zwischen-director-auftrag\.md'
pruefe "Director löst nie Notfall-Release oder Hotfix aus (kein notfall-release, kein workflow run im Skript)" \
  "$(print -r -- $S | grep -cE 'notfall-release|workflow run|HOTFIX')" '^0$'
pruefe "Auftrag des Directors: Ergebniszeile, Notfall nur Hinweis, nur lesen, Dazulernen" "$(<$HIER/zwischen-director-auftrag.md)" \
  '`ja <Commit-Hash' '`nein <ein Satz' 'NOTFALL-HINWEIS' 'verordnet und startet allein er' 'Nur lesen' 'Dazulernen' 'Release am Tag: Kriterien'

exit $FEHLER
