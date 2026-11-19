#!/bin/zsh
# Wächter für Zwischen-Releases im Volldampf (Maintainer 17.11.2026, Wortlaute in ENTSCHEIDUNGEN.md: „volldampf bedeutet
# maximale produktivität …“, „nochmals: produktivität steht über allem. ich habe auch kein problem mit 30 releases
# untertags während volldampf läuft solange wir so viel wie möglich abarbeiten können“; Tests laufen wie bisher:
# „wir wollen keine defekten releases veröffentlichen …“). Von Hand im Hintergrund starten (kein LaunchAgent):
#   nohup zsh ~/halo-spaces/tests/zwischen-schleife.zsh >/dev/null 2>&1 &!
#   zsh tests/zwischen-schleife.zsh --einmal    eine Prüfung (und ggf. ein Zwischen-Release), dann Ende
#   zsh tests/zwischen-schleife.zsh --trocken   nur zeigen, was jetzt geschähe (kein Claude, kein Push, kein Worktree)
# Alle TAKT Minuten (5): Volldampf aktiv? (sonst Ende) Push-Beginn 09:00 bis BIS (22:30, danach warten bis 09:00)? keine Pause
# „zwischen-release“ in pausen.txt? Kandidaten: je Prüfzweig pruef/<name> (Tagesroutine, Worker, Sammelzweige …) der
# neueste Stand mit grünem Push-Lauf (Linux-CI, Quelle: GitHub-Lauf des Zweigs), neueste zuerst; übersprungen wird ein
# Stand, der schon in origin/main liegt, der Stand eines roten Versuchs (~/halo-nacht/zwischen-gesperrt.txt, über Neustarts;
# erst ein neuer grüner Stand nach der Behebung) und ein Stand, der weder Vorfahr von main ist noch sich sauber mit
# origin/main mischen lässt (Konflikt = kein Release); nie Diagnose-/Probezweige (ZWEIG_AUS) oder ein Stand mit einem
# Commit „nicht nach main“/„nur Prüfzweig“ in der Nachricht. Fällig ist der erste Kandidat mit mindestens AB (3) Commits mit
# Thunderbird-Änderung über origin/main; steht das 5-Stunden-Fenster auf FENSTER_AB (85 %) oder mehr (kontingent.json,
# höchstens KONT_ALTER Minuten alt, sonst tests/kontingent.sh; Fensterende über fenster_rest noch nicht erreicht), genügt
# AB_FENSTER (1) Commit (Maintainer 18.11.2026: „mehrmals ein neues release machen? … Ja.“). neon nicht belegt? Dann:
#   1. Worktree WT (~/halo-zwischen-release, Zweig zr/release, Upstream origin/main) auf P; origin/main dort
#      hineinmischen (Konflikt: abbrechen, kein Release). Der Checkout ~/halo-spaces wird nie angefasst (kein stash,
#      kein reset, kein checkout): andere Sitzungen und parallele Agenten arbeiten dort weiter.
#   2. Version: nächste Minor-Version nach dem letzten Tag (3.27.0 → 3.28.0).
#   3. Kurze Claude-Runde im Worktree (MODELL, sonnet): README „What's new in <version>“ als eigener Commit, englische
#      Notizdatei ~/halo-nacht/<datum>-notes-<version>.md, Ergebnisdatei „bereit“.
#   4. tests/zwischen-release.zsh im Worktree (HALO_ZR_STAND=P, HALO_PRUEFZWEIG=sein Zweig): Push nach main, Push-Lauf und Windows-Lauf grün, dann
#      release-unter-tage.sh --volldampf → NUR_CI=1 release.sh (Testmarke nur bei vollständig grüner CI samt Windows)
#      und publish.sh. Danach lokale Listen-Commits von publish.sh (ohne Thunderbird-Änderung) nach main pushen.
#   Rot oder ABBRUCH: kein Release; derselbe Stand P wird nicht noch einmal versucht.
#   Echtes Rot (nach der Wiederholung): je rote Prüfung eine Zeile in ~/halo-nacht/rot-zaehler.txt, die Meldung an neon
#   nennt die Modellstufe (rot_zaehlen; docs/release.md „Rote Änderung auf einen Nebenzweig“, Maintainer 18.11.2026).
# Der Abstand zwischen zwei Releases ist nur die Dauer von CI und Windows. Den Checkout ~/halo-spaces gleicht der
# Nachtlauf ab (git rebase origin/main, Schritt 0 b): die Commits aus main sind dann schon in origin/main.
# Zum Proben: HALO_JETZT_HM=HHMM, HALO_ZS_STAND=<Zeilen „Commit [Zweig]“|leer> (statt der GitHub-Läufe),
# HALO_ZS_TB=<Zahl>, HALO_ZS_MISCHBAR/HALO_ZS_NUR_PRUEF=ja|nein|git (git: echtes git im Repo HALO_REPO_MAIN), HALO_ZS_5H=<%>,
# HALO_ZS_FENSTER_REST=<Sekunden>, HALO_BELEGT=<Grund|leer>, HALO_ZS_GESPERRT=<Commit>, HALO_ZS_GESPERRT_DATEI,
# HALO_VOLLDAMPF_DATEI/…_BEENDET/HALO_VOLLDAMPF_JETZT, HALO_PAUSEN_DATEI.
emulate -L zsh
setopt extendedglob
export TZ=Europe/Vienna HALO_LAUF=zwischen-release
path=(~/.local/bin /opt/homebrew/bin /usr/local/bin /Library/Frameworks/Python.framework/Versions/Current/bin $path)
HIER=${0:A:h}
MAIN=${HALO_REPO_MAIN:-${HIER:h}}
WT=${HALO_ZR_WT:-$HOME/halo-zwischen-release}
DIR=$HOME/halo-nacht
TAKT=${ZS_TAKT:-5} AB=${ZWISCHEN_RELEASE_AB:-3} BIS=${ZWISCHEN_RELEASE_BIS:-2230} MODELL=${ZS_MODELL:-sonnet}
# Diagnose- und Probezweige kommen nie in ein Release (Name), ebenso ein Stand mit einem Commit, der es sagt (Nachricht)
ZWEIG_AUS=${ZS_ZWEIG_AUS:-'(diagnose|flackern|probe)'} NICHT_MAIN='nicht nach main|nur (auf dem |für den )?Prüfzweig'
FENSTER_AB=${ZWISCHEN_RELEASE_FENSTER:-85} AB_FENSTER=${ZWISCHEN_RELEASE_AB_FENSTER:-1} KONT_ALTER=${ZS_KONT_ALTER:-15}
R=sruf79/halo-spaces
MODUS=
[[ $1 == --(einmal|trocken) ]] && MODUS=${1#--}
TAG=$(date +%F)
LOG=$DIR/$TAG-zwischen-schleife.log
if [[ $MODUS == trocken ]]; then LOG=/dev/null; export HALO_PAUSE_TROCKEN=1 HALO_UEBERSPRUNGEN_LOG=/dev/null; fi
REPO=$WT   # belegt() prüft Ungespeichertes nur im eigenen Worktree, nicht im gemeinsamen Checkout
source $HIER/lauf-hilfen.zsh
GESPERRT=${HALO_ZS_GESPERRT:-}
GDATEI=${HALO_ZS_GESPERRT_DATEI:-$DIR/zwischen-gesperrt.txt}   # Stände roter Versuche (eine Zeile je Commit)
ERGEBNIS=${HALO_ZS_ERGEBNIS:-$DIR/zwischen-ergebnis.txt}       # eine Zeile je Ergebnis, neueste unten (tail -1)
BELEGT_MAX=${ZS_BELEGT_MAX:-60}                                 # Minuten „belegt“ bei fälligem Stand, dann Meldung an neon

# Jedes Ergebnis geht an die Sitzung neon, nicht aufs iPhone (Maintainer 18.11.2026: „ich möchte hier nicht involviert und
# informiert werden. der wächter soll solche probleme direkt an dich wenden und du kümmerst dich um die nächsten schritte
# automatisch.“), und als Zeile nach $ERGEBNIS:
#   <Zeit> | <Version> | <Stand> | <Zweig> | <Ergebnis> | <Läufe> | <rote Prüfungen bzw. Grund> | Wiederholung <…>
# Nur wenn neon nicht erreichbar ist (an_neon scheitert), einmal push() aufs iPhone.
melden() {   # <Ergebnis> <Version> <Stand> <Zweig> <Läufe> <Details, je Zeile eine Prüfung oder ein Grund> <Wiederholung> [<Modellstufe>]
  local erg=$1 v=${2:--} p=${3:--} zw=${4:--} laeufe=${5:--} det=$6 wdh=${7:-nein} stufe=$8 text
  local -a zl=(${(f)det}); zl=("- "${^zl})
  [[ $MODUS == trocken ]] || print -r -- "$(date '+%F %T') | $v | ${p[1,7]} | $zw | $erg | $laeufe | ${${det//$'\n'/; }[1,400]:--} | Wiederholung $wdh" >> $ERGEBNIS
  text="[zwischen-release] $erg: Version $v, Stand ${p[1,7]}, Zweig $zw
Läufe: $laeufe${det:+
${(F)zl}}
Wiederholung: $wdh${stufe:+
$stufe}
neon kümmert sich."
  log "an neon: ${text//$'\n'/ | }"
  an_neon "$text" zwischen-release && return 0
  push "Zwischen-Release-Wächter konnte neon nicht erreichen ($erg, Version $v, Stand ${p[1,7]})" zwischen-release
}

# Echtes Rot (rote Prüfungen und Wiederholung gelaufen oder mehr als MAX_ROT rote Prüfungen): je rote Prüfung eine Zeile
# in rot-zaehler.txt (rot_eintragen, lauf-hilfen.zsh), ausgegeben wird die Zeile „Modellstufe: …“ für die Meldung
# (höchste Stufe der roten Prüfungen; docs/release.md „Rote Änderung auf einen Nebenzweig“, Maintainer 18.11.2026).
# Kein Rot im Sinn der Regel: Wiederholung nicht gelaufen oder nicht fertig, keine rote Prüfung (Zeitüberschreitung).
rot_zaehlen() {   # <Details „<Job>: <Prüfung>“ je Zeile> <Wiederholung> <Stand> <Zweig>
  local det=$1 wdh=$2 p=$3 zw=$4 z k e n=0 m=Opus
  [[ -n $det ]] || return 0
  [[ $wdh == ja* && $wdh != *"nicht fertig"* || $wdh == *"mehr als"* ]] || return 0
  for z in ${(f)det}; do
    k=${z#*: }; [[ -n $k ]] || continue
    e=$(rot_eintragen "$k" $zw ${p[1,12]}) || continue
    (( ${e%% *} > n )) && { n=${e%% *}; m=${e#* } }
  done
  (( n )) || return 0
  print -r -- "Modellstufe: $n. Rot dieser Prüfung in 14 Tagen → $m (1 Opus, 2 und 3 Fable unter 50 % im 5-Stunden-Fenster, ab 4 Maintainer); Ursache belegen mit Skill systematic-debugging, belegter trennbarer Verursacher auf einen Nebenzweig, Rest neu prüfen und veröffentlichen (docs/release.md „Rote Änderung auf einen Nebenzweig“; Verursacher nur über tests/rot-nebenzweig.sh zurücknehmen, das zählt selbst)"
}

# Kandidaten „<Commit> <Zweig>“: je Prüfzweig der neueste Stand mit grünem Push-Lauf, neueste zuerst, nicht schon in origin/main
kandidaten() {
  if [[ -n ${HALO_ZS_STAND+x} ]]; then
    local z; for z in ${(f)HALO_ZS_STAND}; do z=(${=z}); print -r -- "$z[1] ${z[2]:-pruef/tagesroutine-$(date +%Y%m%d)}"; done
    return
  fi
  git -C $MAIN fetch -q origin main 2>/dev/null
  local s b; typeset -A gesehen
  gh run list -R $R -w test.yml -e push -s success -L 60 --json headSha,headBranch \
      --jq '.[] | select(.headBranch | startswith("pruef/")) | "\(.headSha) \(.headBranch)"' 2>/dev/null \
    | while read -r s b; do
        [[ -n ${HALO_PRUEFZWEIG:-} && $b != $HALO_PRUEFZWEIG ]] && continue
        [[ ${b#pruef/} =~ $ZWEIG_AUS ]] && continue
        (( ${+gesehen[$b]} )) && continue; gesehen[$b]=1      # nur der neueste grüne Stand je Zweig
        git -C $MAIN cat-file -e "$s^{commit}" 2>/dev/null || git -C $MAIN fetch -q origin "refs/heads/$b" 2>/dev/null
        git -C $MAIN cat-file -e "$s^{commit}" 2>/dev/null || continue
        git -C $MAIN merge-base --is-ancestor $s origin/main 2>/dev/null && continue
        print -r -- "$s $b"
      done
}
# Vorfahr von main oder sauber mit origin/main mischbar (git merge-tree, ohne Worktree und ohne Checkout)
mischbar() {
  [[ -n ${HALO_ZS_MISCHBAR+x} && $HALO_ZS_MISCHBAR != git ]] && { [[ $HALO_ZS_MISCHBAR == ja ]]; return }
  git -C $MAIN merge-base --is-ancestor $1 main 2>/dev/null && return 0
  git -C $MAIN merge-tree --write-tree origin/main $1 >/dev/null 2>&1
}
nur_pruef() {   # Commit über origin/main, dessen Nachricht sagt, dass er nicht nach main gehört
  [[ -n ${HALO_ZS_NUR_PRUEF+x} && $HALO_ZS_NUR_PRUEF != git ]] && { [[ $HALO_ZS_NUR_PRUEF == ja ]]; return }
  git -C $MAIN log --format=%B $1 --not origin/main 2>/dev/null | grep -qiE -- $NICHT_MAIN
}
gesperrt() {
  [[ $1 == $GESPERRT ]] && return 0
  [[ -r $GDATEI ]] && grep -qxF -- $1 $GDATEI
}
sperren() { GESPERRT=$1; [[ $MODUS == trocken ]] || print -r -- $1 >> $GDATEI }
# Sekunden bis zum Ende des 5-Stunden-Fensters (aus kontingent.json), wie im Auslastungswächter
fenster_rest() {
  [[ -n ${HALO_ZS_FENSTER_REST+x} ]] && { print -r -- $HALO_ZS_FENSTER_REST; return }
  python3 -I -c 'import json,sys,time;e=json.load(open(sys.argv[1]))["info"]["unifiedWindows"]["five_hour"];print(max(0,int(e["resetsAt"]-time.time())))' $DIR/kontingent.json 2>/dev/null
}
FENSTER_PY='
import sys, json, time
d = json.load(open(sys.argv[1]))
if time.time() - time.mktime(time.strptime(d["stand"][:19], "%Y-%m-%dT%H:%M:%S")) > float(sys.argv[2]) * 60: sys.exit(1)
print(round(100 * d["info"]["unifiedWindows"]["five_hour"]["utilization"]))
'
# 5-Stunden-Fenster in % (nur wenn das Fenster noch läuft); kontingent.sh nur, wenn kontingent.json älter als KONT_ALTER ist
fenster5() {
  local f r
  if [[ -n ${HALO_ZS_5H+x} ]]; then f=$HALO_ZS_5H
  else
    f=$(python3 -I -c $FENSTER_PY $DIR/kontingent.json $KONT_ALTER 2>/dev/null) \
      || { zsh $HIER/kontingent.sh >/dev/null 2>&1; f=$(python3 -I -c $FENSTER_PY $DIR/kontingent.json 5 2>/dev/null) }
  fi
  [[ $f == <-> ]] || return 1
  r=$(fenster_rest); [[ $r == <-> ]] && (( r > 0 )) || return 1
  print -r -- $f
}
tb_zahl() {   # Commits in <P>, die nicht (auch nicht als Kopie) in origin/main sind und Thunderbird ändern
  [[ -n $HALO_ZS_TB ]] && { print $HALO_ZS_TB; return }
  local c n=0 t
  # bringt die Mischung mit origin/main überhaupt etwas für Thunderbird? (sonst wäre es ein leeres Release)
  t=$(git -C $MAIN merge-tree --write-tree origin/main $1 2>/dev/null) && ! zsh $MAIN/tests/ci-noetig.sh origin/main $t 2>/dev/null \
    && { print 0; return }
  for c in $(git -C $MAIN rev-list --no-merges --cherry-pick --right-only origin/main...$1 2>/dev/null); do
    zsh $MAIN/tests/ci-noetig.sh "${c}^" "$c" 2>/dev/null && n=$((n + 1))
  done
  print $n
}
naechste_version() {
  local t=$(git -C $MAIN tag -l 'v[0-9]*' --sort=-v:refname | head -1)
  t=${t#v}; [[ $t == <->.<->.<-> ]] || return 1
  print -r -- ${t%%.*}.$(( ${${t#*.}%%.*} + 1 )).0
}
fenster_text() { [[ -z $1 ]] && return; [[ $1 == <-> ]] && print -rn -- ", 5-Stunden-Fenster $1 %" || print -rn -- ", 5-Stunden-Fenster unbekannt" }
# Prüfung: gibt „fällig <P> <n> <Zweig>[, 5-Stunden-Fenster …]“, „warten <Grund>“ oder „ende <Grund>“ aus
pruefen() {
  local j p n g
  local vd
  HALO_JETZT=${HALO_VOLLDAMPF_JETZT:-} volldampf_aktiv >/dev/null; vd=$?
  (( vd == 1 )) && { print -r -- "ende Volldampf nicht aktiv"; return }
  # Wochenlimit: Volldampf pausiert nur bis zum freien Reset (Maintainer 18.11.2026) – warten, nicht enden
  (( vd == 2 )) && { print -r -- "warten Volldampf pausiert (Wochenlimit, wartet auf den freien Reset)"; return }
  j=$((10#${HALO_JETZT_HM:-$(date +%H%M)}))
  # nach BIS warten statt enden: der Wächter startet nicht von selbst neu, endete er um 22:30, gab es an den folgenden
  # Volldampf-Tagen keine Zwischen-Releases mehr (18.11.2026); er endet erst mit Volldampf (oben)
  (( j >= BIS )) && { print -r -- "warten Push-Beginn nur bis $BIS, wieder ab 09:00"; return }
  (( j >= 900 )) || { print -r -- "warten Push-Sperre bis 09:00"; return }
  g=$(pause_aktiv zwischen-release) && { print -r -- "warten Pause $g"; return }
  local -a kand; local k z zw ab=$AB f5= grund= erster=
  kand=(${(f)"$(kandidaten)"})
  (( $#kand )) || { print -r -- "warten kein neuer grüner Stand auf einem Prüfzweig"; return }
  for k in $kand; do
    z=(${=k}); p=$z[1] zw=$z[2]
    gesperrt $p && { grund=${grund:-"Stand ${p[1,7]} ($zw) war rot, erst ein neuer grüner Stand"}; continue }
    nur_pruef $p && { grund=${grund:-"Stand ${p[1,7]} ($zw) enthält einen Commit „nicht nach main“"}; continue }
    mischbar $p || { grund=${grund:-"Stand ${p[1,7]} ($zw) lässt sich nicht sauber mit origin/main mischen (Konflikt)"}; continue }
    n=$(tb_zahl $p)
    if (( n < ab && n >= AB_FENSTER && ab != AB_FENSTER )) && [[ -z $f5 ]]; then
      f5=$(fenster5) || f5=-
      [[ $f5 == <-> ]] && (( f5 >= FENSTER_AB )) && ab=$AB_FENSTER
    fi
    (( n >= ab )) && { erster="$p $n $zw"; break }
    grund=${grund:-"$n Thunderbird-Commits bis ${p[1,7]} ($zw) über origin/main (ab $ab$(fenster_text $f5))"}
  done
  [[ -n $erster ]] || { print -r -- "warten ${grund:-kein fälliger Stand}"; return }
  z=(${=erster}); p=$z[1] n=$z[2] zw=$z[3]
  if [[ -n ${HALO_BELEGT+x} ]]; then g=$HALO_BELEGT; else g=$(belegt) || g=; fi
  [[ -z $g && -e $DIR/lauf.lock ]] && kill -0 $(<$DIR/lauf.lock) 2>/dev/null && g="Nachtlauf läuft"
  [[ -n $g ]] && { print -r -- "warten belegt: $g (fällig ${p[1,7]} $zw)"; return }
  print -r -- "fällig $p $n $zw$(fenster_text $f5)"
}

# ein Zwischen-Release für Stand <P>; Rückgabe 0 = veröffentlicht, 1 = rot (Stand gesperrt), 2 = Abbruch vor dem Push
release_lauf() {   # <P> <Prüfzweig>
  local p=$1 zw=$2 v notes erg sid aus rc g
  git -C $MAIN fetch -q --tags origin main 2>>$LOG || { log "git fetch gescheitert"; melden ABBRUCH - $p $zw - "git fetch gescheitert"; return 2 }
  v=$(naechste_version) || { log "keine Version ableitbar"; melden ABBRUCH - $p $zw - "keine Version ableitbar"; return 2 }
  notes=$DIR/$TAG-notes-$v.md erg=$DIR/$TAG-zwischen-release-$v.erg aus=$DIR/$TAG-zwischen-release-$v.log
  log "Zwischen-Release $v für Stand ${p[1,7]} von $zw: Worktree $WT"
  # eigener Worktree: nur dieser Ordner wird ersetzt (enthält nur Dateien dieses Wächters)
  if [[ -e $WT ]]; then git -C $MAIN worktree remove --force $WT 2>>$LOG || { log "Worktree $WT nicht entfernbar"; melden ABBRUCH $v $p $zw - "Worktree $WT nicht entfernbar"; return 2 }; fi
  git -C $MAIN worktree add -q -f -B zr/release $WT $p 2>>$LOG || { log "Worktree nicht angelegt"; melden ABBRUCH $v $p $zw - "Worktree nicht angelegt"; return 2 }
  git -C $WT branch -q --set-upstream-to=origin/main 2>>$LOG
  cp -p $MAIN/repo.conf $WT/ 2>>$LOG || { log "repo.conf fehlt"; melden ABBRUCH $v $p $zw - "repo.conf fehlt"; return 2 }
  if ! git -C $WT merge-base --is-ancestor origin/main HEAD; then
    git -C $WT merge -q --no-edit -m "Volldampf: origin/main für Zwischen-Release $v übernommen" origin/main >>$LOG 2>&1 \
      || { git -C $WT merge --abort 2>/dev/null; log "Zwischen-Release $v: Konflikt mit origin/main – kein Release"
           melden "ABBRUCH (Konflikt, Stand gesperrt)" $v $p $zw - "Konflikt mit origin/main"; return 1 }
  fi
  sid=$(uuidgen | tr A-Z a-z); rm -f $erg
  log "Vorbereitung mit $MODELL, Sitzung $sid"
  ( cd $WT && claude -p --model $MODELL --session-id $sid --permission-mode auto "Unbeaufsichtigter Zwischen-Release von halo.spaces im Volldampf (tests/zwischen-schleife.zsh). AGENTS.md gilt. Arbeitsordner: $WT (eigener Worktree, Zweig zr/release; den Ordner ~/halo-spaces nicht anfassen). Version $v.
1. Commits seit dem letzten Tag lesen: git log --format='%h %s' \$(git tag -l 'v*' --sort=-v:refname | head -1)..HEAD (git show --stat je Commit nach Bedarf).
2. README.md: Abschnitt „What's new in $v“ nach dem Muster der vorhandenen Abschnitte (Englisch, knapp, nur was Nutzer merken; nichts aus der privaten Aufgabenliste, kein „Apple“). Steht oben ein Abschnitt für eine Version ohne Tag (nie veröffentlicht), dessen Punkte in den neuen Abschnitt übernehmen und den alten entfernen.
3. Eigener Commit nur mit README.md, Nachricht „README: Versionshinweise $v“ (Ende: Co-Authored-By-Zeile wie üblich). Keine andere Datei ändern, nicht pushen, kein Release-Skript aufrufen.
4. Englische Notizdatei mit gleichem Inhalt (ohne Überschrift „What's new“) nach $notes.
5. Ergebnisdatei $erg mit einer Zeile „bereit“ oder „nein <Grund>“." > $DIR/$TAG-zwischen-release-$v.txt 2>&1 )
  [[ $(head -1 $erg 2>/dev/null) == bereit ]] || { log "Zwischen-Release $v: Vorbereitung ohne „bereit“ ($(head -1 $erg 2>/dev/null))"
    melden ABBRUCH $v $p $zw - "Vorbereitung (README/Notizen) ohne „bereit“: $(head -1 $erg 2>/dev/null)"; return 2 }
  HALO_REPO=$WT HALO_ZR_STAND=$p HALO_PRUEFZWEIG=$zw ZWISCHEN_RELEASE_BIS=$BIS zsh $HIER/zwischen-release.zsh $v $notes > $aus 2>&1; rc=$?
  cat $aus >> $LOG
  # für die Meldung: Läufe, rote Prüfungen, Wiederholung (Zeilen von zwischen-release.zsh)
  local laeufe det wdh
  laeufe=${(j:, :)${(f)"$(sed -n 's/^LAUF: //p' $aus)"}}
  det=$(sed -n 's/^ROTE-PRÜFUNG: //p' $aus)
  wdh=$(sed -n 's/^WIEDERHOLUNG: //p' $aus | tail -1)
  [[ -z $wdh ]] && grep -q '^WIEDERHOLT: ' $aus && wdh="ja ($(sed -n 's/^WIEDERHOLT: //p' $aus | paste -sd ';' -))"
  if (( rc == 0 )); then
    # Listen-Commits von publish.sh (pr-freigaben), nur ohne Thunderbird-Änderung
    git -C $WT fetch -q origin main 2>/dev/null
    if [[ -n $(git -C $WT rev-list origin/main..HEAD 2>/dev/null) ]] && ! zsh $WT/tests/ci-noetig.sh origin/main HEAD; then
      git -C $WT push -q origin HEAD:main 2>>$LOG && log "Listen-Commits nach main gepusht"
    fi
    log "Zwischen-Release $v veröffentlicht"
    melden veröffentlicht $v $p $zw "$laeufe" "$(grep -E 'in der Wiederholung grün' $aus)" "${wdh:-nein (nicht nötig)}"
    return 0
  fi
  g=$(grep -E '^(ABBRUCH|ROT|FEHLER)' $aus | tail -1)
  log "Zwischen-Release $v nicht veröffentlicht: ${g:-Exitcode $rc}"
  if [[ $g == ABBRUCH* ]]; then melden ABBRUCH $v $p $zw "$laeufe" "${g#ABBRUCH: }" "$wdh"; return 2; fi
  if git -C $WT rev-parse -q --verify "refs/tags/v$v" >/dev/null; then
    melden "FEHLER nach dem Tag (getaggt, nicht fertig veröffentlicht; docs/release.md)" $v $p $zw "$laeufe" "${g:-Exitcode $rc}${det:+
$det}" "$wdh"
  elif [[ $g == ROT* ]]; then
    melden "ROT${wdh:+ nach Wiederholung}" $v $p $zw "$laeufe" "${g#ROT: }${det:+
$det}" "$wdh" "$(rot_zaehlen "$det" "$wdh" $p $zw)"
  else
    melden "FEHLER" $v $p $zw "$laeufe" "${g:-Exitcode $rc}" "$wdh"
  fi
  return 1
}

if [[ $MODUS == trocken ]]; then
  z=$(pruefen)
  print -r -- "Zwischen-Schleife – Trockenlauf (kein Claude, kein Push, kein Worktree)"
  print -r -- "Prüfung:  $z"
  if [[ $z == fällig* ]]; then
    w=(${=${z#fällig }}); print -r -- "Würde:    Zwischen-Release $(naechste_version) für Stand ${w[1][1,7]} von ${w[3]%,} im Worktree $WT"
  fi
  exit 0
fi
mkdir -p $DIR
LOCK=$DIR/zwischen-schleife.lock
[[ -e $LOCK ]] && kill -0 $(<$LOCK) 2>/dev/null && { print -u2 "Zwischen-Schleife läuft schon (PID $(<$LOCK))"; exit 1 }
print $$ > $LOCK
trap 'rm -f $LOCK' EXIT
log "Zwischen-Schleife gestartet (Takt $TAKT Min., alle Prüfzweige pruef/*, ab $AB Thunderbird-Commits, ab $AB_FENSTER bei 5-Stunden-Fenster ab $FENSTER_AB %, Push-Beginn bis $BIS)"
ALT= ABBRUCH_AN= BELEGT_SEIT= BELEGT_GEMELDET=
while true; do
  z=$(pruefen)
  # fälliger Stand, aber neon seit über BELEGT_MAX Minuten belegt: einmal je Stand an neon melden
  if [[ $z == "warten belegt: "* ]]; then
    BELEGT_SEIT=${BELEGT_SEIT:-$(date +%s)}
    if (( $(date +%s) - BELEGT_SEIT >= BELEGT_MAX * 60 )) && [[ $BELEGT_GEMELDET != ${z##* \(fällig } ]]; then
      w=(${=${${z##* \(fällig }%\)}})
      melden "belegt über $BELEGT_MAX Min." - "$w[1]" "$w[2]" - "${${z#warten belegt: }% \(fällig *}" "nein"
      BELEGT_GEMELDET=${z##* \(fällig }
    fi
  else
    BELEGT_SEIT=
  fi
  case $z in
    ende*)   log "Ende: ${z#ende }"; break ;;
    fällig*) w=(${=${z#fällig }}); p=$w[1]
             release_lauf $p ${w[3]%,}; rc=$?
             # rot (oder Konflikt): derselbe Stand erst nach der Behebung (neuer grüner Stand); Abbruch vor dem
             # Push (belegt, Uhrzeit, Vorbereitung): ein zweiter Versuch, dann ebenfalls gesperrt
             if (( rc == 1 )) || { (( rc == 2 )) && [[ $p == $ABBRUCH_AN ]] }; then sperren $p; log "Stand ${p[1,7]} gesperrt bis zu einem neuen grünen Stand"
             elif (( rc == 2 )); then ABBRUCH_AN=$p; fi
             ALT= ;;
    *)       [[ $z != $ALT ]] && log "${z#warten }"; ALT=$z ;;
  esac
  [[ $MODUS == einmal ]] && break
  sleep $(( TAKT * 60 ))
done
exit 0
