#!/bin/zsh
# Wächter für Zwischen-Releases im Volldampf (Maintainer 17.11.2026, Wortlaute in ENTSCHEIDUNGEN.md: „volldampf bedeutet
# maximale produktivität …“, „nochmals: produktivität steht über allem. ich habe auch kein problem mit 30 releases
# untertags während volldampf läuft solange wir so viel wie möglich abarbeiten können“; Tests laufen wie bisher:
# „wir wollen keine defekten releases veröffentlichen …“). Von Hand im Hintergrund starten (kein LaunchAgent):
#   nohup zsh ~/halo-spaces/tests/zwischen-schleife.zsh >/dev/null 2>&1 &!
#   zsh tests/zwischen-schleife.zsh --einmal    eine Prüfung (und ggf. ein Zwischen-Release), dann Ende
#   zsh tests/zwischen-schleife.zsh --trocken   nur zeigen, was jetzt geschähe (kein Claude, kein Push, kein Worktree)
# Alle TAKT Minuten (5): Volldampf aktiv? (sonst Ende) Push-Beginn 09:00 bis BIS (22:30, danach Ende)? keine Pause
# „zwischen-release“ in pausen.txt? Neuester grüner Stand P auf dem Prüfzweig pruef/tagesroutine-<JJJJMMTT> (Vorfahr
# von main), mindestens AB (3) Commits mit Thunderbird-Änderung über origin/main, P nicht der Stand eines roten
# Versuchs (erst ein neuer grüner Stand nach der Behebung), neon nicht belegt? Dann:
#   1. Worktree WT (~/halo-zwischen-release, Zweig zr/release, Upstream origin/main) auf P; origin/main dort
#      hineinmischen (Konflikt: abbrechen, kein Release). Der Checkout ~/halo-spaces wird nie angefasst (kein stash,
#      kein reset, kein checkout): andere Sitzungen und parallele Agenten arbeiten dort weiter.
#   2. Version: nächste Minor-Version nach dem letzten Tag (3.27.0 → 3.28.0).
#   3. Kurze Claude-Runde im Worktree (MODELL, sonnet): README „What's new in <version>“ als eigener Commit, englische
#      Notizdatei ~/halo-nacht/<datum>-notes-<version>.md, Ergebnisdatei „bereit“.
#   4. tests/zwischen-release.zsh im Worktree (HALO_ZR_STAND=P): Push nach main, Push-Lauf und Windows-Lauf grün, dann
#      release-unter-tage.sh --volldampf → NUR_CI=1 release.sh (Testmarke nur bei vollständig grüner CI samt Windows)
#      und publish.sh. Danach lokale Listen-Commits von publish.sh (ohne Thunderbird-Änderung) nach main pushen.
#   Rot oder ABBRUCH: kein Release; derselbe Stand P wird nicht noch einmal versucht.
# Der Abstand zwischen zwei Releases ist nur die Dauer von CI und Windows. Den Checkout ~/halo-spaces gleicht der
# Nachtlauf ab (git rebase origin/main, Schritt 0 b): die Commits aus main sind dann schon in origin/main.
# Zum Proben: HALO_JETZT_HM=HHMM, HALO_ZS_STAND=<Commit|leer>, HALO_ZS_TB=<Zahl>, HALO_BELEGT=<Grund|leer>,
# HALO_ZS_GESPERRT=<Commit>, HALO_VOLLDAMPF_DATEI/…_BEENDET/HALO_VOLLDAMPF_JETZT, HALO_PAUSEN_DATEI.
emulate -L zsh
setopt extendedglob
export TZ=Europe/Vienna HALO_LAUF=zwischen-release
path=(~/.local/bin /opt/homebrew/bin /usr/local/bin /Library/Frameworks/Python.framework/Versions/Current/bin $path)
HIER=${0:A:h}
MAIN=${HALO_REPO_MAIN:-${HIER:h}}
WT=${HALO_ZR_WT:-$HOME/halo-zwischen-release}
DIR=$HOME/halo-nacht
TAKT=${ZS_TAKT:-5} AB=${ZWISCHEN_RELEASE_AB:-3} BIS=${ZWISCHEN_RELEASE_BIS:-2230} MODELL=${ZS_MODELL:-sonnet}
R=sruf79/halo-spaces
MODUS=
[[ $1 == --(einmal|trocken) ]] && MODUS=${1#--}
TAG=$(date +%F)
LOG=$DIR/$TAG-zwischen-schleife.log
if [[ $MODUS == trocken ]]; then LOG=/dev/null; export HALO_PAUSE_TROCKEN=1 HALO_UEBERSPRUNGEN_LOG=/dev/null; fi
REPO=$WT   # belegt() prüft Ungespeichertes nur im eigenen Worktree, nicht im gemeinsamen Checkout
source $HIER/lauf-hilfen.zsh
GESPERRT=${HALO_ZS_GESPERRT:-}

# neuester grüner Stand auf dem Prüfzweig, der in main liegt
stand() {
  if [[ -n ${HALO_ZS_STAND+x} ]]; then [[ -n $HALO_ZS_STAND ]] && print -r -- $HALO_ZS_STAND; return; fi
  local pz=${HALO_PRUEFZWEIG:-pruef/tagesroutine-$(date +%Y%m%d)} s
  for s in $(gh run list -R $R -w test.yml -b $pz -e push -s success -L 20 --json headSha --jq '.[].headSha' 2>/dev/null); do
    git -C $MAIN merge-base --is-ancestor $s main 2>/dev/null && { print -r -- $s; return 0 }
  done
  return 1
}
tb_zahl() {   # Commits in <P>, die nicht in origin/main sind und Thunderbird ändern
  [[ -n $HALO_ZS_TB ]] && { print $HALO_ZS_TB; return }
  local c n=0
  for c in $(git -C $MAIN rev-list --no-merges $1 --not origin/main 2>/dev/null); do
    zsh $MAIN/tests/ci-noetig.sh "${c}^" "$c" 2>/dev/null && n=$((n + 1))
  done
  print $n
}
naechste_version() {
  local t=$(git -C $MAIN tag -l 'v[0-9]*' --sort=-v:refname | head -1)
  t=${t#v}; [[ $t == <->.<->.<-> ]] || return 1
  print -r -- ${t%%.*}.$(( ${${t#*.}%%.*} + 1 )).0
}
# Prüfung: gibt „fällig <P> <n>“, „warten <Grund>“ oder „ende <Grund>“ aus
pruefen() {
  local j p n g
  HALO_JETZT=${HALO_VOLLDAMPF_JETZT:-} volldampf_aktiv >/dev/null || { print -r -- "ende Volldampf nicht aktiv"; return }
  j=$((10#${HALO_JETZT_HM:-$(date +%H%M)}))
  (( j >= BIS )) && { print -r -- "ende Push-Beginn nur bis $BIS"; return }
  (( j >= 900 )) || { print -r -- "warten Push-Sperre bis 09:00"; return }
  g=$(pause_aktiv zwischen-release) && { print -r -- "warten Pause $g"; return }
  p=$(stand) || { print -r -- "warten kein grüner Stand auf dem Prüfzweig"; return }
  [[ $p == $GESPERRT ]] && { print -r -- "warten Stand ${p[1,7]} war rot, erst ein neuer grüner Stand"; return }
  n=$(tb_zahl $p)
  (( n >= AB )) || { print -r -- "warten $n Thunderbird-Commits bis ${p[1,7]} über origin/main (ab $AB)"; return }
  if [[ -n ${HALO_BELEGT+x} ]]; then g=$HALO_BELEGT; else g=$(belegt) || g=; fi
  [[ -z $g && -e $DIR/lauf.lock ]] && kill -0 $(<$DIR/lauf.lock) 2>/dev/null && g="Nachtlauf läuft"
  [[ -n $g ]] && { print -r -- "warten belegt: $g"; return }
  print -r -- "fällig $p $n"
}

# ein Zwischen-Release für Stand <P>; Rückgabe 0 = veröffentlicht, 1 = rot (Stand gesperrt), 2 = Abbruch vor dem Push
release_lauf() {
  local p=$1 v notes erg sid aus rc g
  git -C $MAIN fetch -q --tags origin main 2>>$LOG || { log "git fetch gescheitert"; return 2 }
  v=$(naechste_version) || { log "keine Version ableitbar"; return 2 }
  notes=$DIR/$TAG-notes-$v.md erg=$DIR/$TAG-zwischen-release-$v.erg aus=$DIR/$TAG-zwischen-release-$v.log
  log "Zwischen-Release $v für Stand ${p[1,7]}: Worktree $WT"
  # eigener Worktree: nur dieser Ordner wird ersetzt (enthält nur Dateien dieses Wächters)
  if [[ -e $WT ]]; then git -C $MAIN worktree remove --force $WT 2>>$LOG || { log "Worktree $WT nicht entfernbar"; return 2 }; fi
  git -C $MAIN worktree add -q -f -B zr/release $WT $p 2>>$LOG || { log "Worktree nicht angelegt"; return 2 }
  git -C $WT branch -q --set-upstream-to=origin/main 2>>$LOG
  cp -p $MAIN/repo.conf $WT/ 2>>$LOG || { log "repo.conf fehlt"; return 2 }
  if ! git -C $WT merge-base --is-ancestor origin/main HEAD; then
    git -C $WT merge -q --no-edit -m "Volldampf: origin/main für Zwischen-Release $v übernommen" origin/main >>$LOG 2>&1 \
      || { git -C $WT merge --abort 2>/dev/null; log "Zwischen-Release $v: Konflikt mit origin/main – kein Release"; return 1 }
  fi
  sid=$(uuidgen | tr A-Z a-z); rm -f $erg
  log "Vorbereitung mit $MODELL, Sitzung $sid"
  ( cd $WT && claude -p --model $MODELL --session-id $sid --permission-mode auto "Unbeaufsichtigter Zwischen-Release von halo.spaces im Volldampf (tests/zwischen-schleife.zsh). AGENTS.md gilt. Arbeitsordner: $WT (eigener Worktree, Zweig zr/release; den Ordner ~/halo-spaces nicht anfassen). Version $v.
1. Commits seit dem letzten Tag lesen: git log --format='%h %s' \$(git tag -l 'v*' --sort=-v:refname | head -1)..HEAD (git show --stat je Commit nach Bedarf).
2. README.md: Abschnitt „What's new in $v“ nach dem Muster der vorhandenen Abschnitte (Englisch, knapp, nur was Nutzer merken; nichts aus der privaten Aufgabenliste, kein „Apple“). Steht oben ein Abschnitt für eine Version ohne Tag (nie veröffentlicht), dessen Punkte in den neuen Abschnitt übernehmen und den alten entfernen.
3. Eigener Commit nur mit README.md, Nachricht „README: Versionshinweise $v“ (Ende: Co-Authored-By-Zeile wie üblich). Keine andere Datei ändern, nicht pushen, kein Release-Skript aufrufen.
4. Englische Notizdatei mit gleichem Inhalt (ohne Überschrift „What's new“) nach $notes.
5. Ergebnisdatei $erg mit einer Zeile „bereit“ oder „nein <Grund>“." > $DIR/$TAG-zwischen-release-$v.txt 2>&1 )
  [[ $(head -1 $erg 2>/dev/null) == bereit ]] || { log "Zwischen-Release $v: Vorbereitung ohne „bereit“ ($(head -1 $erg 2>/dev/null))"; return 2 }
  HALO_REPO=$WT HALO_ZR_STAND=$p ZWISCHEN_RELEASE_BIS=$BIS zsh $HIER/zwischen-release.zsh $v $notes > $aus 2>&1; rc=$?
  cat $aus >> $LOG
  if (( rc == 0 )); then
    # Listen-Commits von publish.sh (pr-freigaben), nur ohne Thunderbird-Änderung
    git -C $WT fetch -q origin main 2>/dev/null
    if [[ -n $(git -C $WT rev-list origin/main..HEAD 2>/dev/null) ]] && ! zsh $WT/tests/ci-noetig.sh origin/main HEAD; then
      git -C $WT push -q origin HEAD:main 2>>$LOG && log "Listen-Commits nach main gepusht"
    fi
    log "Zwischen-Release $v veröffentlicht"
    push "Zwischen-Release $v veröffentlicht (Volldampf) – Bericht ~/halo-berichte/$TAG-halo.spaces-$v.md" zwischen-release
    return 0
  fi
  g=$(grep -E '^(ABBRUCH|ROT|FEHLER)' $aus | tail -1)
  log "Zwischen-Release $v nicht veröffentlicht: ${g:-Exitcode $rc}"
  [[ $g == ABBRUCH* ]] && return 2
  git -C $WT rev-parse -q --verify "refs/tags/v$v" >/dev/null \
    && push "Zwischen-Release $v getaggt, aber Fehler (${g:-Exitcode $rc}) – bitte prüfen (docs/release.md)" zwischen-release handeln
  return 1
}

if [[ $MODUS == trocken ]]; then
  z=$(pruefen)
  print -r -- "Zwischen-Schleife – Trockenlauf (kein Claude, kein Push, kein Worktree)"
  print -r -- "Prüfung:  $z"
  [[ $z == fällig* ]] && print -r -- "Würde:    Zwischen-Release $(naechste_version) für Stand ${${${z#fällig }%% *}[1,7]} im Worktree $WT"
  exit 0
fi
mkdir -p $DIR
LOCK=$DIR/zwischen-schleife.lock
[[ -e $LOCK ]] && kill -0 $(<$LOCK) 2>/dev/null && { print -u2 "Zwischen-Schleife läuft schon (PID $(<$LOCK))"; exit 1 }
print $$ > $LOCK
trap 'rm -f $LOCK' EXIT
log "Zwischen-Schleife gestartet (Takt $TAKT Min., ab $AB Thunderbird-Commits, Push-Beginn bis $BIS)"
ALT= ABBRUCH_AN=
while true; do
  z=$(pruefen)
  case $z in
    ende*)   log "Ende: ${z#ende }"; break ;;
    fällig*) p=${${z#fällig }%% *}
             release_lauf $p; rc=$?
             # rot (oder Konflikt): derselbe Stand erst nach der Behebung (neuer grüner Stand); Abbruch vor dem
             # Push (belegt, Uhrzeit, Vorbereitung): ein zweiter Versuch, dann ebenfalls gesperrt
             if (( rc == 1 )) || { (( rc == 2 )) && [[ $p == $ABBRUCH_AN ]] }; then GESPERRT=$p; log "Stand ${p[1,7]} gesperrt bis zu einem neuen grünen Stand"
             elif (( rc == 2 )); then ABBRUCH_AN=$p; fi
             ALT= ;;
    *)       [[ $z != $ALT ]] && log "${z#warten }"; ALT=$z ;;
  esac
  [[ $MODUS == einmal ]] && break
  sleep $(( TAKT * 60 ))
done
exit 0
