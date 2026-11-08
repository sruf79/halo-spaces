#!/bin/zsh
# CI-Wächter auf neon (tests/MAC-MINI.md Abschnitt 14): sieht alle 15 Minuten
# (LaunchAgent at.halo-spaces.ci-waechter) nach abgeschlossenen Läufen von
# test.yml auf main – ohne Claude, nur gh. Bei Rot trägt er je rotem Lauf einen
# Bug ins Board ein, die gescheiterten Prüfungen als Liste im Text; Prüfungen
# mit offenem Eintrag ergänzen diesen (eine Notiz je Eintrag und Lauf) – ohne
# Meldung aufs iPhone (seit 7.11.2026). War eine Prüfung 3× rot, ohne dass sich
# dazwischen etwas geändert hat, was Thunderbird betrifft (tests/ci-noetig.sh),
# vermerkt er einmal je Prüfung und Eintrag „wackelig: …“ (Verlauf
# ~/halo-aufgaben/ci-waechter.rot). Abgebrochenes wird nur protokolliert. Läufe, die Nachtlauf oder Wochenprüfung selbst beobachten,
# lässt er dabei aus. Fehler aus Fehlerkonsole und Fehlerprotokoll (Zeilen
# „KONSOLE  …“/„PROTOKOLL  …“) trägt er für jeden Lauf als Bug ein – kein Rot.
# Jobs mit continue-on-error (Versuchsjobs wie windows-github) zählen nicht: kein
# Eintrag, keine Meldung aufs iPhone, auch nicht für ihre KONSOLE-/PROTOKOLL-
# Zeilen (Entscheidung des Maintainers vom 5.11.2026; ihre Fehler sammelt ein
# Eintrag von Hand). Fällt continue-on-error weg, zählen sie wieder.
# Rote Läufe aus dem Nachtlauf trägt der Nachtlauf selbst ein (tests/ci-runde.zsh, ruft --lauf); was er
# nicht eingetragen hat (~/halo-nacht/<datum>.ci-eingetragen), holt der Wächter nach dem Ende des
# Nachtlaufs nach (~/halo-aufgaben/ci-waechter.nachholen; Entscheidung des Maintainers vom 7.11.2026).
# Rote Prüfungen eines Laufs der Nacht, die ein späterer Lauf derselben Nacht auf einem anderen Commit grün zeigt,
# gelten als repariert (ci_reparatur in tests/ci-runde.zsh): kein neuer Eintrag, nur eine Zeile im Nachtlauf-Bericht;
# ein offener Eintrag wird mit Notiz auf Done gesetzt und archiviert. Grün nur auf demselben Commit: Eintrag mit
# Notiz „flackert“ (Entscheidung des Maintainers vom 7.11.2026).
# Wie der Nachtlauf wird die Datei nach ~/.config/halo-spaces/ kopiert.
#   ci-waechter.sh                       neue Läufe seit dem letzten Stand
#   ci-waechter.sh --trocken [--lauf ID] nur anzeigen: kein Board, kein Push, Stand bleibt
#   ci-waechter.sh --lauf ID             genau diesen Lauf auswerten (Stand bleibt); Exitcode 3, wenn ein
#                                        Eintrag scheiterte (Board oder Lauf nicht lesbar)
#   ci-waechter.sh --datei PROTOKOLL     nur KONSOLE-/PROTOKOLL-Zeilen aus einer Datei (release.sh: Update-Test)
# Stand: ~/halo-aufgaben/ci-waechter.stand (ID des zuletzt ausgewerteten Laufs),
# Protokoll: ~/halo-aufgaben/ci-waechter.log.
emulate -L zsh
setopt extendedglob pipefail

TROCKEN= NUR= DATEI=
while (( $# )); do
  case $1 in
    --trocken) TROCKEN=1 ;;
    --lauf) shift; NUR=$1 ;;
    --datei) shift; DATEI=$1 ;;
    -h|--help) sed -n '2,31p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) print -u2 "Unbekannte Option: $1"; exit 2 ;;
  esac
  shift
done

path=(~/.local/bin /opt/homebrew/bin /usr/local/bin /Library/Frameworks/Python.framework/Versions/Current/bin $path)
R=sruf79/halo-spaces
PROJEKT=PVT_kwHODEPpks4BoBQw
FELD_TYP=PVTSSF_lAHODEPpks4BoBQwzhmjN8Y TYP_BUG=ff678ae2
FELD_STATUS=PVTSSF_lAHODEPpks4BoBQwzhmjN5E STATUS_TODO=f75ad846 STATUS_DONE=98236657
DIR=$HOME/halo-aufgaben
STAND=$DIR/ci-waechter.stand
NACHHOLEN=$DIR/ci-waechter.nachholen   # rote Läufe des Nachtlaufs, nachzuholen nach seinem Ende
VERSUCHE=$DIR/ci-waechter.versuche     # „<Lauf> <Anzahl>“: Leseversuche eines unlesbaren Laufs
ROT=$DIR/ci-waechter.rot               # „<Lauf><Tab><Commit><Tab><Prüfung>“ je roter Prüfung (für „wackelig“)
LOG=$DIR/ci-waechter.log
NACHT=$HOME/halo-nacht
mkdir -p $DIR
source ${0:A:h}/lauf-hilfen.zsh             # zeit, log, push
source ${0:A:h}/ci-runde.zsh                # ci_laeufe_holen, ci_reparatur (in derselben Nacht repariert?)
# launchd setzt keine Locale: ohne UTF-8 zählt zsh Bytes statt Zeichen (${x[1,60]} schneidet mitten in „ü“ oder „–“,
# dann findet der Abgleich offene Einträge nicht mehr und legt Dubletten an)
export LC_CTYPE=${LC_CTYPE:-en_US.UTF-8} LANG=${LANG:-en_US.UTF-8}

# Protokoll; im Trockenlauf nur auf den Bildschirm
melde() {
  print -ru2 -- "$*"
  [[ -z $TROCKEN ]] && log "$*"
}

# Zeitfenster der Nachtläufe und Wochenprüfungen (Epoch „von bis Art“ je Zeile, Art nacht oder woche) aus
# ~/halo-nacht/<datum>.log bzw. <datum>-woche.log: „Start, Sitzung“ (bzw. „Start CI-Abschluss“ eines
# Nachtlaufs ohne Claude) bis „Ende“;
# ohne Ende bis jetzt, solange der Lauf noch läuft. Diese Läufe warten selbst
# auf ihre CI und berichten darüber.
nacht_fenster() {
  local f z von bis lock laeuft art
  for f in $NACHT/<->-<->-<->(|-woche).log(Nom[1,6]); do
    [[ $f == *-woche.log ]] && lock=$NACHT/woche.lock art=woche || lock=$NACHT/lauf.lock art=nacht
    laeuft=
    [[ -e $lock ]] && kill -0 $(<$lock) 2>/dev/null && laeuft=1
    von= bis=
    while IFS= read -r z; do
      if [[ $z == *" Start, Sitzung "* ]]; then
        von=$(date -j -f '%F %T' "${z[1,19]}" +%s 2>/dev/null) bis=
      elif [[ -z $von && $z == *" Start CI-Abschluss"* ]]; then
        von=$(date -j -f '%F %T' "${z[1,19]}" +%s 2>/dev/null) bis=
      elif [[ -n $von && $z == *" Ende" ]]; then
        bis=$(date -j -f '%F %T' "${z[1,19]}" +%s 2>/dev/null)
      fi
    done < $f
    [[ -z $von ]] && continue
    [[ -z $bis ]] && bis=$( [[ -n $laeuft ]] && date -v+1d +%s || stat -f %m $f )
    print "$von $bis $art"
  done
}
VOM_ART= VOM_BIS=
vom_nachtlauf() {   # <Epoch des Laufbeginns>; setzt VOM_ART (nacht/woche) und VOM_BIS (Ende des Fensters)
  local von bis art
  [[ $1 == <-> ]] || return 1
  for von bis art in ${=FENSTER}; do
    (( $1 >= von && $1 <= bis )) && { VOM_ART=$art VOM_BIS=$bis; return 0 }
  done
  return 1
}
nachtlauf_laeuft() { [[ -e $NACHT/lauf.lock ]] && kill -0 $(<$NACHT/lauf.lock) 2>/dev/null }

# rote Läufe des Nachtlaufs nachholen, die er nicht selbst eingetragen hat (abgebrochen, Board nicht
# erreichbar, Lauf erst nach seinem Ende fertig) – erst nach seinem Ende; gleiche Dublettenprüfung (eintragen)
nachholen() {
  [[ -s $NACHHOLEN ]] || return 0
  nachtlauf_laeuft && return 0
  local run rest=()
  for run in $(<$NACHHOLEN); do
    if grep -qxF -- $run $NACHT/*.ci-eingetragen(N) /dev/null 2>/dev/null; then
      melde "Lauf $run: vom Nachtlauf eingetragen"
    elif [[ -n $TROCKEN ]]; then
      print -u2 "  (trocken) würde nachholen: Lauf $run"
    elif ! rot $run || (( RUN_FEHL )); then
      rest+=($run)
    else
      melde "Lauf $run: nach dem Nachtlauf nachgeholt"
    fi
  done
  [[ -n $TROCKEN ]] && return 0
  if (( ${#rest} )); then print -l $rest > $NACHHOLEN; else rm -f $NACHHOLEN; fi
}

BOARD=
board() {   # scheitert (Exitcode 1), wenn das Board nicht lesbar ist – dann nichts anlegen (sonst Dubletten)
  [[ -n $BOARD ]] || BOARD=$(gh project item-list 1 --owner sruf79 --limit 1000 --format json) || { BOARD=; return 1 }
  [[ -n $BOARD ]] || return 1
  print -r -- $BOARD
}

# Bug eintragen oder offenen Eintrag zur selben Prüfung ergänzen; gibt „neu“/„ergänzt“ aus
eintragen() {   # <Job> <Prüfung> <Text> <Ergänzung> [<Titelanfang>, Standard „Tests: CI rot“] [<Schlüssel>]
  local job=$1 pruefung=$2 text=$3 zusatz=$4 anfang=${5:-"Tests: CI rot"} schluessel=$6 kurz titel id di body b
  kurz=${pruefung[1,90]}
  if (( ${#pruefung} > 90 )); then
    kurz=${kurz% *}
    # mindestens die 60 Zeichen, über die ein offener Eintrag wiedergefunden wird (sonst bei langen Wörtern wie
    # Pfaden jedes Mal ein neuer Eintrag)
    (( ${#kurz} < 60 )) && kurz=${pruefung[1,89]}
    kurz+=" …"
  fi
  if [[ -n $job ]]; then titel="$anfang – $job: $kurz"; else titel="$anfang – $kurz"; fi
  b=$(board) || { melde "FEHLER: Board nicht lesbar – nichts eingetragen"; return 1 }
  if [[ -n $schluessel ]]; then
    # Fehlerkonsole/-protokoll: über die ganze (normalisierte) Meldung im Text – zwei Meldungen mit gleichem Anfang
    # bleiben getrennt
    text+="

Schlüssel: $schluessel"
    read -r id di <<< $(print -r -- $b | jq -r --arg s "Schlüssel: $schluessel" --arg a "$anfang" \
      '[.items[] | select(.status != "Done" and (.title | startswith($a)) and ((.content.body // "") | contains($s)))][0] | "\(.id // "") \(.content.id // "")"')
  else
    # offener Eintrag zur selben Prüfung (egal welcher Job)? Vergleich über die ersten 60 Zeichen
    read -r id di <<< $(print -r -- $b | jq -r --arg p "${pruefung[1,60]}" --arg a "$anfang" \
      '[.items[] | select(.status != "Done" and (.title | startswith($a)) and (.title | contains($p)))][0] | "\(.id // "") \(.content.id // "")"')
  fi
  if [[ -n $id ]]; then
    # Fehlerkonsole/-protokoll: höchstens eine Ergänzung pro Tag (sonst wächst der Eintrag mit jedem Lauf)
    if [[ -n $schluessel ]] && print -r -- $b | jq -e --arg i $id --arg t "${zusatz[1,15]}" \
         '.items[] | select(.id == $i) | (.content.body // "") | contains($t)' >/dev/null; then
      print ergänzt
      return
    fi
    if [[ -n $TROCKEN ]]; then
      print -u2 "  (trocken) würde ergänzen: $id"
    else
      body=$(print -r -- $b | jq -r --arg i $id '.items[] | select(.id == $i) | .content.body')
      gh project item-edit --id $di --body "$body

$zusatz" >/dev/null || { melde "FEHLER: Eintrag $id ließ sich nicht ergänzen"; return 1 }
    fi
    print ergänzt
    return
  fi
  if [[ -n $schluessel ]]; then
    # schon einmal als behoben (Done) eingetragen? Dann flackert der Fehler vermutlich – im neuen Eintrag sagen
    local frueher
    frueher=$(print -r -- $b | jq -r --arg s "Schlüssel: $schluessel" --arg a "$anfang" \
      '[.items[] | select(.status == "Done" and (.title | startswith($a)) and ((.content.body // "") | contains($s))) | .title][0] // ""')
    [[ -n $frueher ]] && text+="

Wieder aufgetreten: „$frueher“ war schon Done – der Fehler tritt vermutlich nur manchmal auf; behoben erst nach mehreren Läufen ohne ihn."
  fi
  if [[ -n $TROCKEN ]]; then
    print "  (trocken) würde anlegen: $titel" >&2
  else
    id=$(gh project item-create 1 --owner sruf79 --title "$titel" --body "$text" --format json --jq .id) \
      || { melde "FEHLER: Eintrag „$titel“ ließ sich nicht anlegen"; return 1 }
    gh project item-edit --project-id $PROJEKT --id $id --field-id $FELD_TYP --single-select-option-id $TYP_BUG >/dev/null
    gh project item-edit --project-id $PROJEKT --id $id --field-id $FELD_STATUS --single-select-option-id $STATUS_TODO >/dev/null
    BOARD=                                   # neu laden: der nächste Job findet ihn dann
  fi
  print neu
}

# Versuchsjobs eines Commits: Jobs, die in .github/workflows/test.yml dieses Stands
# continue-on-error haben (Job-Schlüssel bzw. sein name:). Ausgabe eine Zeile je Job.
versuchsjobs() {   # <Commit>
  gh api "repos/$R/contents/.github/workflows/test.yml?ref=$1" --jq .content 2>/dev/null | base64 -D 2>/dev/null | awk '
    /^jobs:/ { in_jobs = 1; next }
    in_jobs && /^[^ #]/ { in_jobs = 0 }
    in_jobs && /^  [A-Za-z0-9_-]+:[ ]*$/ { job = $1; sub(/:$/, "", job); name[job] = job; next }
    in_jobs && job != "" && /^    name:/ { n = $0; sub(/^    name:[ ]*/, "", n); gsub(/["\047]/, "", n); name[job] = n }
    in_jobs && job != "" && /^    continue-on-error:[ ]*true/ { versuch[job] = 1 }
    END { for (j in versuch) print name[j] }'
}

# Zeile für den Nachtlauf-Bericht: auf stdout (ruft der Nachtlauf --lauf, landet sie über ci_nacht_abschluss im
# Bericht); beim Nachholen nach dem Nachtlauf direkt an ~/halo-berichte/<Tag des Laufs>-nachtlauf.md anhängen
bericht_zeile() {   # <Zeile> <Beginn-Epoch des roten Laufs>
  print -r -- "- $1"
  [[ -n $TROCKEN ]] && return 0
  nachtlauf_laeuft && return 0
  local b=$HOME/halo-berichte/$(date -r $2 +%F)-nachtlauf.md
  [[ -e $b ]] || return 0
  grep -qxF -- "- $1" $b && return 0
  grep -qx '## CI rot, in derselben Nacht repariert (ci-waechter.sh, nachgeholt)' $b \
    || print "\n## CI rot, in derselben Nacht repariert (ci-waechter.sh, nachgeholt)\n" >> $b
  print -r -- "- $1" >> $b
}

# offener „Tests: CI rot“-Eintrag zu einer Prüfung: alte Form (Prüfung im Titel) oder Lauf-Eintrag (Prüfung als
# Zeile „- <Prüfung> (Job …)“ in der Liste des Textes); Vergleich über die ersten 60 Zeichen. Ausgabe „<id> <Inhalt-id>“
offen_finden() {   # <Prüfung> <Board-JSON>
  print -r -- $2 | jq -r --arg p "${1[1,60]}" --arg a "Tests: CI rot" \
    '[.items[] | select(.status != "Done" and (.title | startswith($a)) and ((.title | contains($p)) or ((.content.body // "") | contains("\n- " + $p))))][0] | "\(.id // "") \(.content.id // "")"'
}

# Prüfungen der Liste eines Lauf-Eintrags (Zeilen „- …“ nach „Ist: … rot:“ bis zur Leerzeile), je Zeile ein Name
liste_von() {   # <Text>
  print -r -- $1 | awk '/^Ist: .* rot:$/ { l = 1; next } l && /^$/ { exit } l && /^- / { print }' \
    | sed -e 's/^- //' -e 's/ (Job [^)]*)$//'
}

# in derselben Nacht repariert: offenen Eintrag zur Prüfung (offen_finden) mit Notiz auf Done setzen und
# archivieren; listet ein Lauf-Eintrag noch andere Prüfungen, die nicht repariert sind, nur die Notiz.
# Ohne offenen Eintrag nichts. Rückgabe 1, wenn das Board nicht lesbar ist oder ein Schritt scheitert
repariert_schliessen() {   # <Prüfung> <Notiz>
  local b id di body p rest=
  b=$(board) || { melde "FEHLER: Board nicht lesbar – repariert nicht geschlossen"; return 1 }
  read -r id di <<< $(offen_finden "$1" "$b")
  [[ -n $id ]] || return 0
  body=$(print -r -- $b | jq -r --arg i $id '.items[] | select(.id == $i) | .content.body')
  for p in ${(f)"$(liste_von "$body")"}; do
    [[ -z $p || ${p[1,60]} == ${1[1,60]} ]] && continue
    [[ $body == *"Prüfung „${p[1,60]}"*"in derselben Nacht repariert"* ]] || rest+=" „${p[1,60]}“"
  done
  if [[ -n $rest ]]; then
    if [[ -n $TROCKEN ]]; then
      print -u2 "  (trocken) würde Notiz anlegen (übrige Prüfungen noch rot): $id"
      return 0
    fi
    gh project item-edit --id $di --body "$body

${2/in derselben Nacht repariert/Prüfung „$1“ in derselben Nacht repariert} Übrige Prüfungen des Eintrags noch offen:$rest" >/dev/null \
      || { melde "FEHLER: Eintrag $id (repariert) ließ sich nicht ergänzen"; return 1 }
    BOARD=
    melde "  Eintrag $id: Prüfung in derselben Nacht repariert – Notiz, übrige noch offen"
    return 0
  fi
  if [[ -n $TROCKEN ]]; then
    print -u2 "  (trocken) würde mit Notiz auf Done setzen und archivieren: $id"
    return 0
  fi
  gh project item-edit --id $di --body "$body

$2" >/dev/null \
    && gh project item-edit --project-id $PROJEKT --id $id --field-id $FELD_STATUS --single-select-option-id $STATUS_DONE >/dev/null \
    && gh project item-archive 1 --owner sruf79 --id $id >/dev/null \
    || { melde "FEHLER: Eintrag $id (repariert) ließ sich nicht schließen"; return 1 }
  BOARD=
  melde "  Eintrag $id: in derselben Nacht repariert – Done, archiviert"
}

# „wackelig“: dieselbe Prüfung mindestens dreimal rot, ohne dass sich dazwischen etwas geändert hat, was
# Thunderbird betrifft (tests/ci-noetig.sh im Arbeitsordner ~/halo-spaces; gleicher Commit zählt immer als
# unverändert, unbekannte Commits als geändert). Verlauf: ~/halo-aufgaben/ci-waechter.rot
code_gleich() {   # <Commit> <Commit>: 0 = keine Thunderbird-Änderung dazwischen
  local repo=${HALO_REPO:-$HOME/halo-spaces}
  [[ $1 == $2 ]] && return 0
  [[ -x $repo/tests/ci-noetig.sh ]] || return 1
  git -C $repo cat-file -e "$1^{commit}" 2>/dev/null && git -C $repo cat-file -e "$2^{commit}" 2>/dev/null || return 1
  $repo/tests/ci-noetig.sh $1 $2 >/dev/null 2>&1
  (( $? == 1 ))
}
wackelig() {   # <Prüfung> <Commit> <Lauf>; gibt „Läufe a, b, c“ aus, wenn die Prüfung (mit diesem Lauf) 3× so rot war
  local name=$1 sha=$2 run=$3 r s p
  local -a gleich=($run)
  [[ -r $ROT ]] || return 0
  while IFS=$'\t' read -r r s p; do
    [[ $p == $name && $r != $run ]] || continue
    (( ${gleich[(Ie)$r]} )) && continue
    code_gleich $s $sha && gleich+=($r)
  done < $ROT
  (( ${#gleich} >= 3 )) && print -r -- "Läufe ${(j:, :)${(@on)gleich}}"
  return 0
}
rot_merken() {   # <Lauf> <Commit> <Prüfung>: in den Verlauf (einmal je Lauf und Prüfung, höchstens 1000 Zeilen)
  [[ -n $TROCKEN ]] && return 0
  grep -qxF -- "$1	$2	$3" $ROT 2>/dev/null && return 0
  print -r -- "$1	$2	$3" >> $ROT
  (( $(wc -l < $ROT) > 1000 )) && { tail -800 $ROT > $ROT.neu && mv $ROT.neu $ROT }
  return 0
}

# einen roten Lauf auswerten: ein Eintrag je Lauf mit den gescheiterten Prüfungen als Liste; Prüfungen mit
# offenem Eintrag ergänzen diesen (eine Notiz je Eintrag und Lauf) statt neu (keine Meldung aufs iPhone)
rot() {   # <Lauf-ID>
  local run=$1 info sha titel url heute flog job schritt zeile name detail jobs n=0 neu=0 erg=0 rep=0 ergebnis
  local beginn vollsha nacht_bis= laeufe= zustand gid gsha notiz
  RUN_FEHL=0                               # 1: ein Eintrag scheiterte (--lauf: Exitcode 3)
  local -a namen zeilen versuch rote
  local -A jobs_von detail_von paare_von jobs_rot notiz_von
  info=$(gh run view $run -R $R --json headSha,displayTitle,url,jobs,createdAt) || { melde "FEHLER: Lauf $run nicht lesbar"; return 1 }
  versuch=(${(f)"$(versuchsjobs $(jq -r .headSha <<< $info))"})
  # gezielter Lauf von Hand (nur einzelne Prüfungen/Systeme, test.yml): Fehlersuche, kein Board-Eintrag
  if jq -e 'any(.jobs[]; .name == "changes" and any(.steps[]?; .name == "Gezielter Lauf" and .conclusion == "success"))' <<< $info >/dev/null; then
    log "Lauf $run: gezielter Lauf von Hand – kein Eintrag"
    return 0
  fi
  sha=$(jq -r '.headSha[:7]' <<< $info)
  titel=$(jq -r '.displayTitle[:100]' <<< $info)
  url=$(jq -r .url <<< $info)
  heute=$(date '+%d.%m.%Y %H:%M')
  flog=$(gh run view $run -R $R --log-failed 2>/dev/null)
  # gescheiterte Prüfungen sammeln; dieselbe Prüfung in mehreren Jobs ergibt einen Eintrag
  for job in ${(f)"$(jq -r '.jobs[] | select(.conclusion == "failure") | .name' <<< $info)"}; do
    if (( ${versuch[(Ie)$job]} )); then
      melde "  Versuchsjob $job rot – kein Eintrag (continue-on-error)"
      continue
    fi
    zeilen=(${(f)"$(print -r -- $flog | grep -a "^$job	" | grep -a 'FEHLER  ' | grep -av 'Prüfungen OK')"})
    if (( ! ${#zeilen} )); then
      # ohne FEHLER-Zeile (Abbruch vor oder außerhalb der Prüfungen): der gescheiterte Schritt
      schritt=$(jq -r --arg j $job '.jobs[] | select(.name == $j) | [.steps[] | select(.conclusion == "failure") | .name][0] // "?"' <<< $info)
      zeilen=("$job	$schritt	FEHLER  Schritt „$schritt“ abgebrochen – $(print -r -- $flog | grep -a "^$job	" | tail -15 | cut -f3- | cut -c30- | tr '\n' ' ' | cut -c1-900)")
    fi
    for zeile in $zeilen; do
      schritt=${${zeile#*	}%%	*}               # Feld 2: Schritt (Test hell/dunkel)
      zeile=${zeile#*FEHLER  }
      name=${zeile%% – *}
      detail=${zeile#"$name"}; detail=${detail# – }
      [[ $'\n'${paare_von[$name]}$'\n' == *$'\n'"$job|$schritt"$'\n'* ]] || paare_von[$name]+="$job|$schritt"$'\n'
      if (( ! ${+jobs_von[$name]} )); then
        namen+=($name)
        jobs_von[$name]=$job
        detail_von[$name]=$detail
      elif [[ ", ${jobs_von[$name]}, " != *", $job, "* ]]; then   # mac hell und dunkel: einmal
        jobs_von[$name]+=", $job"
      fi
    done
  done
  # Lauf der Nacht (Fenster aus nacht_fenster)? Dann die späteren Läufe derselben Nacht lesen: repariert/flackert
  beginn=$(jq -r '.createdAt // empty | fromdate' <<< $info 2>/dev/null)
  vollsha=$(jq -r .headSha <<< $info)
  if vom_nachtlauf $beginn && [[ $VOM_ART == nacht ]]; then
    nacht_bis=$VOM_BIS laeufe=$(mktemp)
    ci_laeufe_holen $laeufe 40 || { melde "  Läufe der Nacht nicht lesbar – ohne Prüfung auf Reparatur"; nacht_bis= }
  fi
  for name in $namen; do
    # „linux (release), linux (esr), linux (beta)“ → „linux“
    jobs=${jobs_von[$name]}
    [[ $jobs == "linux ("*"), linux ("*"), linux ("*")"* ]] && jobs=${jobs/linux \(*\), linux \(*\), linux \(*\)/linux}
    zustand=rot notiz=
    [[ -n $nacht_bis ]] && read -r zustand gid gsha <<< $(ci_reparatur $laeufe $vollsha $beginn $nacht_bis "$name" ${(f)paare_von[$name]})
    if [[ $zustand == repariert ]]; then
      rep=$((rep + 1))
      zeile="CI rot, in derselben Nacht repariert: $jobs: ${name[1,150]} (rot: Lauf $run, grün: Lauf $gid, Commit $gsha)"
      melde "  $zeile"
      bericht_zeile "$zeile" $beginn
      repariert_schliessen "$name" "**$(date '+%d.%m.%Y %H:%M'):** in derselben Nacht repariert – rot: Lauf $run (Commit $sha), grün: Lauf $gid (Commit $gsha), Job $jobs. Done (Entscheidung des Maintainers vom 7.11.2026)." || RUN_FEHL=1
      continue
    fi
    notiz=
    if [[ $zustand == flackert ]]; then
      melde "  flackert: $jobs: ${name[1,150]} (rot: Lauf $run, grün: Lauf $gid, gleicher Commit $gsha)"
      notiz="flackert: in derselben Nacht ohne Reparaturcommit grün (Lauf $gid, gleicher Commit $gsha) – zählt nicht als repariert: „${name[1,150]}“"
    fi
    n=$((n + 1))
    melde "  rot: $jobs: ${name[1,150]}"
    rote+=($name) jobs_rot[$name]=$jobs notiz_von[$name]=$notiz
  done
  [[ -n $laeufe ]] && rm -f $laeufe $laeufe.*(N)
  if (( ${#rote} )); then
    # ein Eintrag je Lauf: Prüfungen mit offenem Eintrag ergänzen diesen, die übrigen kommen
    # zusammen in einen neuen Eintrag; Board nicht lesbar → nichts anlegen (sonst Dubletten)
    local b id di wack zusatz text ttl kurz z
    local -a ohne ids
    local -A zeilen_von
    if ! b=$(board); then
      melde "FEHLER: Board nicht lesbar – nichts eingetragen"
      RUN_FEHL=1
    else
      for name in $rote; do
        wack=$(wackelig "$name" $vollsha $run)
        rot_merken $run $vollsha "$name"
        z="- $name (Job ${jobs_rot[$name]})"
        [[ -n ${notiz_von[$name]} ]] && z+=$'\n'"${notiz_von[$name]}"
        read -r id di <<< $(offen_finden "$name" "$b")
        if [[ -n $id ]]; then
          # „wackelig“ nur einmal je Prüfung und Eintrag
          if [[ -n $wack ]] && ! print -r -- $b | jq -e --arg i $id --arg w "wackelig: „${name[1,60]}" \
               '.items[] | select(.id == $i) | (.content.body // "") | contains($w)' >/dev/null; then
            z+=$'\n'"wackelig: „${name[1,150]}“ war 3× rot ohne Codeänderung, die Thunderbird betrifft ($wack)"
            melde "  wackelig: ${jobs_rot[$name]}: ${name[1,150]} ($wack)"
          fi
          (( ${+zeilen_von[$id]} )) || ids+=($id)
          zeilen_von[$id]+=$z$'\n'
          [[ -n $di ]] && zeilen_von[$id.di]=$di
          erg=$((erg + 1))
        else
          if [[ -n $wack ]]; then
            z+=$'\n'"wackelig: „${name[1,150]}“ war 3× rot ohne Codeänderung, die Thunderbird betrifft ($wack)"
            melde "  wackelig: ${jobs_rot[$name]}: ${name[1,150]} ($wack)"
          fi
          ohne+=($name) zeilen_von[neu]+=$z$'\n'
        fi
      done
      for id in $ids; do
        zusatz="**$heute:** erneut rot – Lauf $url, Commit $sha:
${zeilen_von[$id]%$'\n'}"
        if [[ -n $TROCKEN ]]; then
          print -u2 "  (trocken) würde ergänzen: $id"
          continue
        fi
        text=$(print -r -- $b | jq -r --arg i $id '.items[] | select(.id == $i) | .content.body')
        gh project item-edit --id ${zeilen_von[$id.di]} --body "$text

$zusatz" >/dev/null || { melde "FEHLER: Eintrag $id ließ sich nicht ergänzen"; RUN_FEHL=1 }
      done
      if (( ${#ohne} )); then
        neu=${#ohne}
        if (( neu == 1 )); then
          # eine Prüfung: Titel wie bisher „<Job>: <Prüfung>“
          kurz=${ohne[1][1,90]}
          if (( ${#ohne[1]} > 90 )); then
            kurz=${kurz% *}; (( ${#kurz} < 60 )) && kurz=${ohne[1][1,89]}; kurz+=" …"
          fi
          ttl="Tests: CI rot – ${jobs_rot[${ohne[1]}]}: $kurz"
        else
          ttl="Tests: CI rot – Lauf $run ($sha): $neu Prüfungen, u. a. ${ohne[1][1,60]}"
        fi
        text="Wo: CI (Workflow test.yml auf main), Lauf $run

Ist: $neu Prüfung(en) rot:
${zeilen_von[neu]%$'\n'}

Meldungen:"
        for name in ${ohne[1,30]}; do
          text+="
„${name[1,150]}“: ${detail_von[$name][1,$(( neu > 5 ? 400 : 1200 ))]}"
        done
        (( neu > 30 )) && text+="
… und $(( neu - 30 )) weitere (siehe Lauf)"
        text+="

Lauf: $url
Commit: $sha „$titel“

Erkannt am $heute vom CI-Wächter (tests/ci-waechter.sh, ein Eintrag je rotem Lauf). Ursache und Lösungsidee noch offen."
        if [[ -n $TROCKEN ]]; then
          print -u2 "  (trocken) würde anlegen: $ttl"
          print -r -- $text | sed -n '/^Ist: /,/^$/p' | sed 's/^/    /' >&2
        else
          id=$(gh project item-create 1 --owner sruf79 --title "$ttl" --body "$text" --format json --jq .id) \
            && gh project item-edit --project-id $PROJEKT --id $id --field-id $FELD_TYP --single-select-option-id $TYP_BUG >/dev/null \
            && gh project item-edit --project-id $PROJEKT --id $id --field-id $FELD_STATUS --single-select-option-id $STATUS_TODO >/dev/null \
            || { melde "FEHLER: Eintrag „$ttl“ ließ sich nicht anlegen"; RUN_FEHL=1 }
          BOARD=
        fi
      fi
    fi
  fi
  melde "Lauf $run ($sha) rot: $n Prüfung(en), $neu in neuem Eintrag, $erg in offenen Einträgen ergänzt$( (( rep )) && print -n ", $rep in derselben Nacht repariert")"
  # keine Meldung aufs iPhone (Entscheidung des Maintainers vom 7.11.2026, ENTSCHEIDUNGEN.md): Board und Protokoll genügen
  return 0
}

# Fehler aus Fehlerkonsole und Fehlerprotokoll (Zeilen „KONSOLE  …“/„PROTOKOLL  …“ von tests/halo_test.py und
# update_test.py): nie Rot – sie halten kein Release auf (Entscheidung des Maintainers vom 5.11.2026) –, aber je
# Meldung ein Bug im Board („Tests: Fehlerkonsole – …“ bzw. „Tests: Fehlerprotokoll – …“; ein offener Eintrag zur
# selben Meldung wird höchstens einmal am Tag ergänzt). Für jeden abgeschlossenen Lauf, auch während Nachtlauf und
# Wochenprüfung (die werten diese Zeilen nicht selbst aus)
konsole_zeilen() {   # <Zeilen> <Quelle (Lauf-Adresse bzw. Datei)> <Commit> <Commit-Titel> [<Job für Zeilen ohne Job>]
  local zeilen=$1 quelle=$2 sha=$3 titel=$4 standardjob=$5 heute zeile job fehler key n=0 neu=0 erg=0 fehl=0 ergebnis art wo meldung
  local -a keys
  local -A jobs_von zeile_von
  heute=$(date '+%d.%m.%Y')
  for zeile in ${(f)zeilen}; do
    if [[ -n $standardjob ]]; then job=$standardjob; else job=${zeile%%$'\t'*}; fi
    if [[ $zeile == *"PROTOKOLL  "* ]]; then  # Fehlerprotokoll der Erweiterung (mail-cards-debug.log)
      fehler=${zeile#*PROTOKOLL  }; art=P
    else
      fehler=${zeile#*KONSOLE  }; art=K
    fi
    key=${fehler%% – während *}
    key=${key#<->× }
    [[ $art == K ]] && key=${key% \(*\)}  # ohne Ort (Datei:Zeile) – der verschiebt sich mit jedem Commit
    [[ -z $key ]] && continue
    key="$art|$key"
    if (( ! ${+jobs_von[$key]} )); then
      keys+=($key)
      jobs_von[$key]=$job
      zeile_von[$key]=$fehler
    elif [[ ", ${jobs_von[$key]}, " != *", $job, "* ]]; then
      jobs_von[$key]+=", $job"
    fi
  done
  (( ${#keys} )) || return 0
  for key in $keys; do
    n=$((n + 1))
    # keine Obergrenze von 8 wie bei Rot: sonst kämen bei vielen Meldungen die hinteren nie ins Board (jeder Lauf
    # nennt sie in derselben Reihenfolge); Wiederholungen kosten nur einen Vergleich
    (( n > 60 )) && { (( n == 61 )) && melde "  … mehr als 60 Meldungen, Rest im nächsten Lauf"; continue }
    meldung=${key[3,-1]}
    if [[ ${key[1]} == P ]]; then
      art="Tests: Fehlerprotokoll" wo="in sein Fehlerprotokoll (mail-cards-debug.log)"
    else
      art="Tests: Fehlerkonsole" wo="in die Fehlerkonsole"
    fi
    melde "  ${art#Tests: }: ${jobs_von[$key]}: ${meldung[1,150]}"
    ergebnis=$(eintragen "" "$meldung" "Wo: ${jobs_von[$key]}

Ist: halo.spaces schreibt einen Fehler $wo (die Prüfungen selbst können grün sein; solche Fehler halten kein Release auf).

Meldung: ${zeile_von[$key][1,1200]}

Quelle: $quelle
Commit: $sha „$titel“

**$heute:** erkannt vom CI-Wächter (tests/ci-waechter.sh) – am selben Tag keine Ergänzung mehr. Ursache und Lösungsidee noch offen. Absichtlich ausgelöst? Dann in der Prüfung mit erwartet(/Muster/) anmelden. Behoben erst, wenn ein Lauf mit denselben Jobs (bei „dunkel“ auch dunkel) die Meldung nicht mehr nennt." \
      "**$heute:** erneut ${wo#in }, ${jobs_von[$key]} – $quelle, Commit $sha" "$art" "$meldung") || { fehl=1; continue }
    [[ $ergebnis == neu ]] && neu=$((neu + 1)) || erg=$((erg + 1))
  done
  melde "Fehlerkonsole/-protokoll ($quelle): $n Meldung(en), $neu neu, $erg ergänzt"
  # aufs iPhone nur, wenn ein neuer Eintrag entstand (Wiederholungen nur im Board)
  if [[ -z $TROCKEN ]] && (( neu )); then
    push "Fehlerkonsole/-protokoll: $neu neue(r) Fehler im Board ($sha; kein Rot, Release nicht betroffen)"
  fi
  # Board (zeitweise) nicht erreichbar: Exitcode 2 – der Lauf wird im nächsten Durchgang erneut ausgewertet
  # (schon Eingetragenes findet er dann wieder)
  (( ! fehl )) || return 2
}

konsole() {   # <Lauf-ID>; Exitcode 2, wenn der Lauf nicht lesbar ist (dann später erneut)
  local run=$1 info flog
  info=$(gh run view $run -R $R --json headSha,displayTitle,url,jobs) || { melde "Lauf $run nicht lesbar (Fehlerkonsole) – später erneut"; return 2 }
  jq -e 'any(.jobs[]; .name == "changes" and any(.steps[]?; .name == "Gezielter Lauf" and .conclusion == "success"))' <<< $info >/dev/null && return 0
  flog=$(gh run view $run -R $R --log 2>/dev/null) || { melde "Lauf $run: Protokoll nicht lesbar (Fehlerkonsole) – später erneut"; return 2 }
  # Zeilen aus Versuchsjobs (continue-on-error) weglassen; die Zeilen beginnen mit „<Job><Tab>“
  local j
  for j in ${(f)"$(versuchsjobs $(jq -r .headSha <<< $info))"}; do
    [[ -n $j ]] && flog=$(print -r -- $flog | grep -av "^$j	")
  done
  konsole_zeilen "$(print -r -- $flog | grep -aE 'KONSOLE  |PROTOKOLL  ')" "$(jq -r .url <<< $info)" \
    "$(jq -r '.headSha[:7]' <<< $info)" "$(jq -r '.displayTitle[:100]' <<< $info)"
}

auswerten() {   # <ID> <status> <conclusion> <Beginn-Epoch> <sha>
  local run=$1 st=$2 erg=$3 beginn=$4 sha=$5
  konsole $run || return 2
  if [[ -z $NUR ]] && vom_nachtlauf $beginn; then
    melde "Lauf $run ($sha): $erg – während Nachtlauf/Wochenprüfung, übernimmt deren Bericht"
    # Rot aus dem Nachtlauf: nach seinem Ende nachholen, falls er es nicht selbst eingetragen hat
    [[ $erg == failure && $VOM_ART == nacht && -z $TROCKEN ]] && print $run >> $NACHHOLEN
    return 0
  fi
  case $erg in
    failure)   rot $run || return 1; [[ -n $NUR ]] && (( RUN_FEHL )) && return 1; return 0 ;;
    cancelled) melde "Lauf $run ($sha): abgebrochen" ;;
    *)         melde "Lauf $run ($sha): $erg" ;;
  esac
}

# release.sh: Zeilen aus dem Protokoll des Update-Tests (läuft nicht in der CI) – nie ein Fehler für den Aufrufer
if [[ -n $DATEI ]]; then
  [[ -r $DATEI ]] || { melde "Datei $DATEI nicht lesbar"; exit 0 }
  konsole_zeilen "$(grep -aE 'KONSOLE  |PROTOKOLL  ' $DATEI)" "Update-Test (${DATEI:t})" \
    "$(git -C ${0:A:h:h} rev-parse --short HEAD 2>/dev/null)" "Update-Test vor dem Release" "Update-Test"
  exit 0
fi

# Pause (eine Datei: ~/halo-nacht/pausen.txt, Routine ci-waechter): nichts melden, nichts ins Board;
# von Hand gerufene Läufe (--nur, --trocken, --datei oben) pausieren nie
if [[ -z $NUR && -z $TROCKEN ]] && HALO_PAUSE_EINMAL=1 pause_start ci-waechter; then
  exit 0
fi

FENSTER=$(nacht_fenster)
LISTE=$(gh run list -R $R -w test.yml -b main -L 30 --json databaseId,status,conclusion,createdAt,headSha \
  --jq 'sort_by(.databaseId) | .[] | "\(.databaseId) \(.status) \(.conclusion // "-") \(.createdAt | fromdate) \(.headSha[:7])"') \
  || { log "FEHLER: gh run list gescheitert"; exit 1 }

if [[ -n $NUR ]]; then
  zeile=$(print -r -- $LISTE | grep "^$NUR ")
  if [[ -z $zeile ]]; then              # älter als die letzten 30 Läufe
    zeile=$(gh run view $NUR -R $R --json databaseId,status,conclusion,createdAt,headSha \
      --jq '"\(.databaseId) \(.status) \(.conclusion // "-") \(.createdAt | fromdate) \(.headSha[:7])"') || exit 1
  fi
  auswerten ${=zeile} || exit 3
  exit 0
fi

if [[ ! -s $STAND ]]; then
  # erster Start: nichts Altes melden, ab dem neuesten abgeschlossenen Lauf beobachten
  letzter=$(print -r -- $LISTE | awk '$2 == "completed" { id = $1 } END { print id }')
  if [[ -z $TROCKEN ]]; then
    print $letzter > $STAND
    log "erster Start: Stand $letzter, ältere Läufe werden nicht gemeldet"
  else
    print "erster Start: Stand wäre $letzter"
  fi
  exit 0
fi
nachholen
stand=$(<$STAND)
for run st erg beginn sha in ${=LISTE}; do
  (( run <= stand )) && continue
  [[ $st != completed ]] && break       # nicht überspringen: auf ihn warten
  if ! auswerten $run $st $erg $beginn $sha; then
    # Lauf (noch) nicht lesbar: Stand nicht weiterschieben, sonst gingen seine Meldungen verloren; nach 4 Versuchen
    # (rund eine Stunde) überspringen, damit ein dauerhaft unlesbarer Lauf den Wächter nicht anhält
    local vrun= vn=0
    [[ -r $VERSUCHE ]] && read -r vrun vn < $VERSUCHE
    [[ $vrun == $run ]] && vn=$((vn + 1)) || vn=1
    if (( vn < 4 )); then
      [[ -z $TROCKEN ]] && print "$run $vn" > $VERSUCHE
      break
    fi
    melde "Lauf $run: nach 4 Versuchen nicht lesbar – übersprungen"
  fi
  stand=$run
  [[ -z $TROCKEN ]] && print $stand > $STAND
done
exit 0
