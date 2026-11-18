#!/bin/zsh
# Zwischen-Release im Volldampf (Maintainer 17.11.2026, Wortlaut in ENTSCHEIDUNGEN.md: „volldampf bedeutet maximale
# produktivität. … das betrifft die anzahl der gleichzeitigen agents, die anzahl der releases, einfach alles.“).
# Einziger Weg, auf dem tagsüber Thunderbird-Änderungen nach main gehen und veröffentlicht werden (sonst pusht nur
# der Nachtlauf). Gilt NUR bei aktiver Volldampf-Zeile (~/halo-nacht/volldampf.txt, beim Wochenlimit pausiert bis zum freien Reset).
# Aufgerufen vom Wächter tests/zwischen-schleife.zsh (Maintainer 17.11.2026: „ich habe auch kein problem mit 30 releases
# untertags während volldampf läuft solange wir so viel wie möglich abarbeiten können“), auf neon, in einem eigenen
# Worktree (HALO_REPO, Zweig zr/release mit Upstream origin/main): der Checkout ~/halo-spaces bleibt unberührt.
#   tests/zwischen-release.zsh --pruefen <version> <notizen>   nur die Bedingungen vor dem Push prüfen (kein Warten)
#   tests/zwischen-release.zsh <version> <notizen>             prüfen, Prüfzweig abwarten, pushen, CI samt Windows
#                                                             abwarten, dann tests/release-unter-tage.sh --volldampf
# Bedingungen vor dem Push (eine nicht erfüllt: „ABBRUCH: <Grund>“, Exitcode 1, nichts gepusht):
#   - Volldampf aktiv (volldampf_aktiv)
#   - Push-Beginn 09:00 bis 22:30 Wiener Zeit (ZWISCHEN_RELEASE_BIS): nie in der Push-Sperre 01:30–09:00; CI
#     (~35–50 Min.) und Windows (~30 Min.) sind vor 24:00 durch (release-unter-tage.sh --volldampf bis 24:00)
#   - nichts belegt (CI, Testlauf, andere Sitzung, Ungespeichertes, release.sh/publish.sh, Nachtlauf)
#   - Zweig main oder ein Zweig mit Upstream origin/main (Worktree), sauber, origin/main enthalten; Version, Tag,
#     README „What's new in x.y.z“, Notizdatei
#   - Thunderbird-Änderungen über origin/main: der letzte Lauf auf dem Prüfzweig (pruef/tagesroutine-<JJJJMMTT>,
#     sonst HALO_PRUEFZWEIG) zu einem Stand, nach dem bis HEAD nichts Thunderbird betrifft, ist grün; mit
#     HALO_ZR_STAND=<Commit> (Wächter, mit HALO_PRUEFZWEIG=<sein Prüfzweig pruef/<name>>, Maintainer 18.11.2026):
#     genau dieser Stand grün, und HEAD bringt darüber nur, was origin/main seither geändert hat, und README.md
# Danach: git push origin HEAD:main, Push-Lauf (Linux, Mac) grün abwarten, Windows-Lauf starten und grün abwarten,
# dann release-unter-tage.sh --volldampf (NUR_CI=1 release.sh: ohne vollständig grüne CI samt Windows keine Marke).
# Roter Push- oder Windows-Lauf: die roten Jobs einmal wiederholen (gh run rerun --failed, nicht bei mehr als 5 roten
# Prüfungen in einem Job und nicht nach 23:00); erst ein zweites Rot gilt. Ausgabezeilen für den Wächter: „LAUF: Push|Windows
# <id>“, „WIEDERHOLT: …“, „ROTE-PRÜFUNG: <Job>: <Prüfung>“, „WIEDERHOLUNG: ja …|nein: <Grund>“.
# Rot: kein Release, Ausgabe „ROT: …“, Exitcode 1 (rote CI auf main behandelt Regel 0 des nächsten Laufs).
# Zum Proben: HALO_JETZT=HHMM, HALO_VOLLDAMPF_JETZT=<ISO-Zeit> (Uhr für volldampf_aktiv), HALO_BELEGT=<Grund|leer>, HALO_VOLLDAMPF_DATEI/HALO_VOLLDAMPF_BEENDET (lauf-hilfen.zsh).
# Name mit .zsh: belegt() sucht Prozesse „release\.sh|publish\.sh“ – das Skript darf sich nicht selbst sperren.
emulate -L zsh
export TZ=Europe/Vienna
path=(/opt/homebrew/bin /usr/local/bin $path)
HIER=${0:A:h}
REPO=${HALO_REPO:-${HIER:h}}
R=sruf79/halo-spaces
BIS=${ZWISCHEN_RELEASE_BIS:-2230}   # spätester Push-Beginn (HHMM; Maintainer 17.11.2026 „30 releases untertags“; 17.11.2026 abends: kein Zeitlimit außer Nachtlauf, daher 22:30 statt 19:30)
PRUEFEN=
[[ $1 == --pruefen ]] && { PRUEFEN=1; shift }
VERSION=$1 NOTIZEN=$2
abbruch() { print -r -- "ABBRUCH: $1 – kein Zwischen-Release"; exit 1 }
rot() {   # <Grund> – mit den roten Prüfungen (ROT_TEXT) und dem Stand der Wiederholung (WDH) für die Meldung an neon
  local z
  for z in ${(f)ROT_TEXT}; do [[ -n $z ]] && print -r -- "ROTE-PRÜFUNG: $z"; done
  [[ -n $WDH ]] && print -r -- "WIEDERHOLUNG: $WDH"
  print -r -- "ROT: $1 – kein Zwischen-Release"; exit 1
}
ROT_TEXT= WDH=
MAX_ROT=${ZR_MAX_ROT:-5}           # mehr rote Prüfungen in einem Job: echter Fehler, keine Wiederholung (wie ci-wiederholen.sh)
WDH_BIS=${ZR_WIEDERHOLEN_BIS:-2300} # spätester Beginn einer Wiederholung (Mac/Windows auf neon, Release bis 24:00)
[[ -n $VERSION && -n $NOTIZEN ]] || { print -u2 "Aufruf: ${0:t} [--pruefen] <version> <notizen.md>"; exit 2 }
cd $REPO || abbruch "kein Checkout unter $REPO"
LOG=/dev/null; source $HIER/lauf-hilfen.zsh

# Volldampf
VD=$(HALO_JETZT=${HALO_VOLLDAMPF_JETZT:-} volldampf_aktiv) || abbruch "Volldampf nicht aktiv (Zwischen-Release nur mit Volldampf-Zeile)"
# Uhrzeit: Push-Beginn nur 09:00–13:00
J=${HALO_JETZT:-$(date +%H%M)}; J=$((10#$J))
(( J >= 900 )) || abbruch "Push-Sperre bis 09:00 (jetzt $(printf %04d $J))"
(( J < BIS )) || abbruch "Push-Beginn nur bis $(printf %04d $BIS) (jetzt $(printf %04d $J)), damit neon ab 00:00 frei ist"
# belegt? (CI, Testlauf, andere Sitzung, Ungespeichertes, release.sh/publish.sh; dazu der Nachtlauf)
if [[ -n ${HALO_BELEGT+x} ]]; then GR=$HALO_BELEGT
else
  GR=$(belegt) || GR=
  [[ -z $GR && -e $HOME/halo-nacht/lauf.lock ]] && kill -0 $(<$HOME/halo-nacht/lauf.lock) 2>/dev/null && GR="Nachtlauf läuft"
fi
[[ -z $GR ]] || abbruch "neon belegt: $GR"
git fetch -q --tags origin main 2>/dev/null || abbruch "git fetch gescheitert"
# Stand
ZWEIG=$(git rev-parse --abbrev-ref HEAD)
if [[ $ZWEIG != main ]]; then
  [[ $(git rev-parse --abbrev-ref @{upstream} 2>/dev/null) == origin/main ]] || abbruch "weder Zweig main noch Upstream origin/main ($ZWEIG)"
  # „git push“ ohne Ziel (im Veröffentlichen-Skript) geht im Worktree-Zweig an seinen Upstream origin/main
  export GIT_CONFIG_COUNT=1 GIT_CONFIG_KEY_0=push.default GIT_CONFIG_VALUE_0=upstream
fi
[[ -z $(git status --porcelain --untracked-files=no) ]] || abbruch "ungespeicherte Änderungen im Repo"
git merge-base --is-ancestor origin/main HEAD || abbruch "origin/main ist nicht in main enthalten (erst abgleichen)"
LETZT=$(git tag -l 'v[0-9]*' --sort=-v:refname | head -1)
[[ -n $LETZT ]] || abbruch "kein Release-Tag gefunden"
[[ $VERSION == <->.<->.<-> ]] || abbruch "Version „$VERSION“ ist nicht x.y.z"
[[ $(print -l ${LETZT#v} $VERSION | sort -V | tail -1) == $VERSION && v$VERSION != $LETZT ]] || abbruch "Version $VERSION nicht höher als $LETZT"
git rev-parse -q --verify "v$VERSION" >/dev/null && abbruch "Tag v$VERSION gibt es schon"
git show HEAD:README.md | grep -qF "What's new in $VERSION" || abbruch "README ohne „What's new in $VERSION“ (eigener Commit „README: Versionshinweise $VERSION“)"
[[ -s $NOTIZEN ]] || abbruch "Notizdatei $NOTIZEN fehlt oder ist leer"
SHA=$(git rev-parse HEAD)
PUSHEN=
zsh tests/ci-noetig.sh origin/main HEAD && PUSHEN=1

# Prüfzweig: neuester Lauf zu einem Stand P (Vorfahr von HEAD, danach nichts für Thunderbird) – „<id> <status> <ergebnis>“
PZ=${HALO_PRUEFZWEIG:-pruef/tagesroutine-$(date +%Y%m%d)}
pruef_lauf() {
  local id sha st erg f
  if [[ -n $HALO_ZR_STAND ]]; then
    # Wächter: genau dieser Stand; darüber nur Änderungen von origin/main (seit der Gabelung) und README.md
    for f in $(git diff --name-only $HALO_ZR_STAND HEAD); do
      [[ $f == README.md ]] && continue
      git diff --name-only $(git merge-base $HALO_ZR_STAND origin/main) origin/main | grep -qxF -- $f || return 1
    done
    gh run list -R $R -w test.yml -b $PZ -e push -c $HALO_ZR_STAND -L 1 --json databaseId,status,conclusion \
      --jq '.[0] | select(. != null) | "\(.databaseId) \(.status) \(.conclusion)"' 2>/dev/null | grep .
    return
  fi
  gh run list -R $R -w test.yml -b $PZ -e push -L 20 --json databaseId,headSha,status,conclusion \
      --jq '.[] | "\(.databaseId) \(.headSha) \(.status) \(.conclusion)"' 2>/dev/null \
    | while read -r id sha st erg; do
        git merge-base --is-ancestor $sha HEAD 2>/dev/null || continue
        zsh tests/ci-noetig.sh $sha HEAD && continue
        print -r -- "$id $st $erg"; return 0
      done
  return 1
}
if [[ -n $PUSHEN ]]; then
  P=$(pruef_lauf) || abbruch "kein Lauf auf $PZ zu diesem Stand (das Skript der Tagesroutine schiebt Fertiges dorthin)"
  if [[ -n $PRUEFEN ]]; then
    [[ $P == *" completed success" ]] || abbruch "Prüfzweig $PZ nicht grün (Lauf $P)"
  else
    # bis 30 Minuten auf einen laufenden Prüfzweig-Lauf warten (Linux ~17 Min.)
    for i in {1..30}; do [[ $P == *" completed "* ]] && break; sleep 60; P=$(pruef_lauf); done
    [[ $P == *" completed success" ]] || abbruch "Prüfzweig $PZ nicht grün (Lauf $P)"
    J=$((10#$(date +%H%M)))
    (( J >= 900 && J < BIS )) || abbruch "Push-Beginn nur bis $(printf %04d $BIS) (nach dem Warten auf den Prüfzweig)"
  fi
fi
print -r -- "OK: Bedingungen erfüllt (Volldampf $VD; letztes Release $LETZT; ${PUSHEN:+Push nötig, Prüfzweig grün}${PUSHEN:-nichts für Thunderbird zu pushen})"
[[ -n $PRUEFEN ]] && exit 0

# --- Push und CI ---
# warte_lauf <Ereignis> <frühestes createdAt|leer> <Minuten> → „<id> <ergebnis>“ des Laufs auf main zu $SHA
warte_lauf() {
  local z i
  for (( i = 0; i < $3; i++ )); do
    z=$(gh run list -R $R -w test.yml -b main -c $SHA -e $1 -L 5 --json databaseId,status,conclusion,createdAt \
          --jq "[.[] | select(.createdAt >= \"$2\")][0] | select(. != null) | \"\(.databaseId) \(.status) \(.conclusion)\"" 2>/dev/null)
    [[ $z == *" completed "* ]] && { print -r -- "${z%% *} ${z##* }"; return 0 }
    sleep 60
  done
  return 1
}
# rote Prüfungen des letzten Versuchs von <Lauf>: „<Job>: <Prüfung>“ je Zeile (windows-github zählt nicht); rote Jobs
# ohne FEHLER-Zeile (Pakete, Start, Zeitüberschreitung) als „<Job>: (Job ohne FEHLER-Zeile)“
rote_pruefungen() {   # <Lauf>
  local flog j
  flog=$(gh run view $1 -R $R --log-failed 2>/dev/null)
  print -r -- $flog | grep -a 'FEHLER  ' | awk -F'\t' '$1 != "windows-github" { z = $3; sub(/^.*FEHLER  /, "", z)
    i = index(z, " – "); if (i) z = substr(z, 1, i - 1); print $1 ": " substr(z, 1, 160) }' | sort -u
  for j in ${(f)"$(gh run view $1 -R $R --json jobs --jq '.jobs[] | select(.conclusion == "failure" and .name != "windows-github") | .name' 2>/dev/null)"}; do
    [[ -z $j ]] && continue
    awk -F'\t' -v j=$j '$1 == j && /FEHLER  / { t = 1 } END { exit !t }' <<< $flog || print -r -- "$j: (Job ohne FEHLER-Zeile)"
  done
}
# Ein roter Lauf wird vor dem Urteil ROT einmal wiederholt (gh run rerun --failed; neon 18.11.2026 nach dem gescheiterten
# 3.31.0: ein Flackerer sperrte den Stand ohne zweiten Versuch). Nur ein zweites Rot gilt; mehr als MAX_ROT rote Prüfungen
# in einem Job sind ein echter Fehler (keine Wiederholung). Hat schon jemand wiederholt (Versuch ≥ 2, z. B.
# tests/ci-wiederholen.sh über den CI-Wächter), wird auf diesen Versuch gewartet statt erneut gestartet.
# Rückgabe 0 = Wiederholung fertig (Ergebnis neu lesen), 1 = keine Wiederholung (Grund in WDH), 2 = nicht fertig.
wiederholen() {   # <Lauf> <Minuten>
  local id=$1 n a z i j
  ROT_TEXT=$(rote_pruefungen $id)
  n=$(print -r -- $ROT_TEXT | awk -F': ' 'NF { c[$1]++ } END { m = 0; for (j in c) if (c[j] > m) m = c[j]; print m }')
  (( n > MAX_ROT )) && { WDH="nein: mehr als $MAX_ROT rote Prüfungen in einem Job (echter Fehler)"; return 1 }
  a=$(gh run view $id -R $R --json attempt --jq .attempt 2>/dev/null)
  if [[ $a == 1 ]]; then
    j=$((10#${HALO_JETZT:-$(date +%H%M)}))
    (( j >= 900 && j < WDH_BIS )) || { WDH="nein: nur 09:00 bis $(printf %04d $WDH_BIS) eine Wiederholung (Release bis 24:00, neon-Jobs nie nach 00:00)"; return 1 }
    if [[ -r $HIER/ci-wiederholen.sh ]]; then
      # über ci-wiederholen.sh: dieselben Grenzen, Zeilen „rot“/„wiederholt“ in ~/halo-nacht/flackern.log (für das
      # Auswerten nach dem Lauf und den Hinweis bei zweitem Flackern in 7 Tagen)
      zsh $HIER/ci-wiederholen.sh --lauf $id >/dev/null 2>&1
      grep -qx "$id wiederholt" ${HALO_FLACKERN_STAND:-$HOME/halo-nacht/flackern.stand} 2>/dev/null \
        || { WDH="nein: ci-wiederholen.sh hat nicht wiederholt (Grund in ~/halo-nacht/flackern.log)"; return 1 }
    else
      gh run rerun $id -R $R --failed >/dev/null 2>&1 || { WDH="nein: gh run rerun gescheitert"; return 1 }
    fi
    print -r -- "WIEDERHOLT: Lauf $id, rote Jobs einmal ($(date +%H:%M))"
    WDH="ja (Lauf $id, Versuch 2)"
  else
    WDH="ja (Lauf $id, Versuch $a, schon von anderer Stelle wiederholt)"
  fi
  for (( i = 0; i < $2; i++ )); do
    sleep 60   # zuerst warten: GitHub setzt den Lauf erst nach einigen Sekunden wieder auf „queued“
    z=$(gh run view $id -R $R --json attempt,status --jq '"\(.attempt) \(.status)"' 2>/dev/null)
    [[ $z == <2->" completed" ]] && return 0
  done
  return 2
}
# nach einem roten Lauf: einmal wiederholen und neu lesen; Ergebnis des letzten Versuchs in NW_ERG, sonst Rückgabe 1
# (nicht in $( … ) aufrufen: WDH, ROT_TEXT und die Zeile „WIEDERHOLT:“ gingen sonst verloren)
nach_wiederholung() {   # <Lauf> <Minuten>
  local r; wiederholen $1 $2; r=$?
  (( r == 2 )) && WDH="$WDH, nach $2 Min. nicht fertig"
  (( r == 0 )) || return 1
  # Ergebnis der Wiederholung in flackern.log (flackert/bleibt-rot, Hinweis an neon beim zweiten Flackern in 7 Tagen)
  [[ -r $HIER/ci-wiederholen.sh ]] && zsh $HIER/ci-wiederholen.sh --lauf $1 >/dev/null 2>&1
  NW_ERG=$(gh run view $1 -R $R --json conclusion --jq .conclusion 2>/dev/null)
}
windows_gruen() { gh run view $1 -R $R --json jobs --jq 'any(.jobs[]; .name == "windows" and .conclusion == "success")' 2>/dev/null | grep -q true }
if [[ -n $PUSHEN ]]; then
  git push -q origin HEAD:main || abbruch "Push nach main abgelehnt (kein Force)"
  print -r -- "gepusht: ${SHA[1,7]} nach main ($(date +%H:%M))"
  L=$(warte_lauf push "" 100) || rot "Push-Lauf zu ${SHA[1,7]} nach 100 Min. nicht fertig"
  print -r -- "LAUF: Push ${L%% *}"
  if [[ $L != *" success" ]]; then
    print -r -- "Push-Lauf ${L%% *} zu ${SHA[1,7]}: ${L##* } – einmal wiederholen"
    nach_wiederholung ${L%% *} 100 || rot "Push-Lauf ${L%% *} zu ${SHA[1,7]}: ${L##* }${WDH:+ (Wiederholung $WDH)}"
    [[ $NW_ERG == success ]] || { ROT_TEXT=$(rote_pruefungen ${L%% *}); rot "Push-Lauf ${L%% *} zu ${SHA[1,7]} auch in der Wiederholung rot" }
    print -r -- "Push-Lauf ${L%% *} in der Wiederholung grün (geflackert: ${(j:; :)${(f)ROT_TEXT}})"
    ROT_TEXT=
  fi
  print -r -- "Push-Lauf ${L%% *} grün (Linux, Mac)"
fi
# Windows-Lauf zum Pushstand (release.sh verlangt ihn; ohne ihn keine Marke)
T0=$(date -u +%FT%TZ)
gh workflow run test.yml -R $R -f ziel=windows --ref main 2>/dev/null || rot "Windows-Lauf ließ sich nicht starten"
W=$(warte_lauf workflow_dispatch $T0 60) || rot "Windows-Lauf zu ${SHA[1,7]} nach 60 Min. nicht fertig"
print -r -- "LAUF: Windows ${W%% *}"
if ! windows_gruen ${W%% *}; then
  print -r -- "Windows-Lauf ${W%% *} zu ${SHA[1,7]} nicht grün – einmal wiederholen"
  nach_wiederholung ${W%% *} 60 || rot "Windows-Lauf ${W%% *} zu ${SHA[1,7]} nicht grün${WDH:+ (Wiederholung $WDH)}"
  windows_gruen ${W%% *} || { ROT_TEXT=$(rote_pruefungen ${W%% *}); rot "Windows-Lauf ${W%% *} zu ${SHA[1,7]} auch in der Wiederholung nicht grün" }
  print -r -- "Windows-Lauf ${W%% *} in der Wiederholung grün (geflackert: ${(j:; :)${(f)ROT_TEXT}})"
  ROT_TEXT=
fi
print -r -- "Windows-Lauf ${W%% *} grün"
zsh $HIER/release-unter-tage.sh --volldampf $VERSION $NOTIZEN
