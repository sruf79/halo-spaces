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
    HALO_ZS_MISCHBAR=ja HALO_ZS_NUR_PRUEF=nein HALO_ZS_GESPERRT_DATEI=$T/gesperrt.txt HALO_ZS_5H=40 HALO_ZS_FENSTER_REST=3600 \
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
pruefe "22:30: Ende (Release vor 01:00, nichts nach 01:30)" "$(W HALO_JETZT_HM=2230)" 'ende Push-Beginn nur bis 2230'
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
exit $FEHLER
