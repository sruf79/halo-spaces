#!/bin/zsh
# CI-Wächter auf neon (tests/MAC-MINI.md Abschnitt 14): sieht alle 15 Minuten
# (LaunchAgent at.halo-spaces.ci-waechter) nach abgeschlossenen Läufen von
# test.yml auf main – ohne Claude, nur gh. Bei Rot trägt er je gescheiterter
# Prüfung einen Bug ins Board ein (oder ergänzt den offenen Eintrag zur selben
# Prüfung) und schickt eine Zeile aufs iPhone; Abgebrochenes wird nur
# protokolliert. Läufe, die Nachtlauf oder Wochenprüfung selbst beobachten,
# lässt er dabei aus. Fehler aus der Fehlerkonsole (Zeilen „KONSOLE  …“) trägt
# er für jeden Lauf als Bug ein – sie machen keinen Lauf rot.
# Wie der Nachtlauf wird die Datei nach ~/.config/halo-spaces/ kopiert.
#   ci-waechter.sh                       neue Läufe seit dem letzten Stand
#   ci-waechter.sh --trocken [--lauf ID] nur anzeigen: kein Board, kein Push, Stand bleibt
#   ci-waechter.sh --lauf ID             genau diesen Lauf auswerten (Stand bleibt)
# Stand: ~/halo-aufgaben/ci-waechter.stand (ID des zuletzt ausgewerteten Laufs),
# Protokoll: ~/halo-aufgaben/ci-waechter.log.
emulate -L zsh
setopt extendedglob pipefail

TROCKEN= NUR=
while (( $# )); do
  case $1 in
    --trocken) TROCKEN=1 ;;
    --lauf) shift; NUR=$1 ;;
    -h|--help) sed -n '2,16p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) print -u2 "Unbekannte Option: $1"; exit 2 ;;
  esac
  shift
done

path=(~/.local/bin /opt/homebrew/bin /usr/local/bin /Library/Frameworks/Python.framework/Versions/Current/bin $path)
R=sruf79/halo-spaces
PROJEKT=PVT_kwHODEPpks4BoBQw
FELD_TYP=PVTSSF_lAHODEPpks4BoBQwzhmjN8Y TYP_BUG=ff678ae2
FELD_STATUS=PVTSSF_lAHODEPpks4BoBQwzhmjN5E STATUS_TODO=f75ad846
DIR=$HOME/halo-aufgaben
STAND=$DIR/ci-waechter.stand
LOG=$DIR/ci-waechter.log
NACHT=$HOME/halo-nacht
mkdir -p $DIR
source ${0:A:h}/lauf-hilfen.zsh             # zeit, log, push

# Protokoll; im Trockenlauf nur auf den Bildschirm
melde() {
  print -ru2 -- "$*"
  [[ -z $TROCKEN ]] && log "$*"
}

# Zeitfenster der Nachtläufe und Wochenprüfungen (Epoch „von bis“ je Zeile) aus
# ~/halo-nacht/<datum>.log bzw. <datum>-woche.log: „Start, Sitzung“ bis „Ende“;
# ohne Ende bis jetzt, solange der Lauf noch läuft. Diese Läufe warten selbst
# auf ihre CI und berichten darüber.
nacht_fenster() {
  local f z von bis lock laeuft
  for f in $NACHT/<->-<->-<->(|-woche).log(Nom[1,6]); do
    [[ $f == *-woche.log ]] && lock=$NACHT/woche.lock || lock=$NACHT/lauf.lock
    laeuft=
    [[ -e $lock ]] && kill -0 $(<$lock) 2>/dev/null && laeuft=1
    von= bis=
    while IFS= read -r z; do
      if [[ $z == *" Start, Sitzung "* ]]; then
        von=$(date -j -f '%F %T' "${z[1,19]}" +%s 2>/dev/null) bis=
      elif [[ -n $von && $z == *" Ende" ]]; then
        bis=$(date -j -f '%F %T' "${z[1,19]}" +%s 2>/dev/null)
      fi
    done < $f
    [[ -z $von ]] && continue
    [[ -z $bis ]] && bis=$( [[ -n $laeuft ]] && date -v+1d +%s || stat -f %m $f )
    print "$von $bis"
  done
}
vom_nachtlauf() {   # <Epoch des Laufbeginns>
  local von bis
  for von bis in ${=FENSTER}; do
    (( $1 >= von && $1 <= bis )) && return 0
  done
  return 1
}

BOARD=
board() {
  [[ -n $BOARD ]] || BOARD=$(gh project item-list 1 --owner sruf79 --limit 300 --format json)
  print -r -- $BOARD
}

# Bug eintragen oder offenen Eintrag zur selben Prüfung ergänzen; gibt „neu“/„ergänzt“ aus
eintragen() {   # <Job> <Prüfung> <Text> <Ergänzung> [<Titelanfang>, Standard „Tests: CI rot“]
  local job=$1 pruefung=$2 text=$3 zusatz=$4 anfang=${5:-"Tests: CI rot"} kurz titel id di body
  kurz=${pruefung[1,90]}
  (( ${#pruefung} > 90 )) && kurz="${kurz% *} …"
  if [[ -n $job ]]; then titel="$anfang – $job: $kurz"; else titel="$anfang – $kurz"; fi
  # offener Eintrag zur selben Prüfung (egal welcher Job)? Vergleich über die ersten 60 Zeichen
  read -r id di <<< $(board | jq -r --arg p "${pruefung[1,60]}" --arg a "$anfang" \
    '[.items[] | select(.status != "Done" and (.title | startswith($a)) and (.title | contains($p)))][0] | "\(.id // "") \(.content.id // "")"')
  if [[ -n $id ]]; then
    # Fehlerkonsole: höchstens eine Ergänzung pro Tag (sonst wächst der Eintrag mit jedem Lauf)
    if [[ $anfang == "Tests: Fehlerkonsole" ]] && board | jq -e --arg i $id --arg t "${zusatz[1,15]}" \
         '.items[] | select(.id == $i) | .content.body | contains($t)' >/dev/null; then
      print ergänzt
      return
    fi
    if [[ -n $TROCKEN ]]; then
      print -u2 "  (trocken) würde ergänzen: $id"
    else
      body=$(board | jq -r --arg i $id '.items[] | select(.id == $i) | .content.body')
      gh project item-edit --id $di --body "$body

$zusatz" >/dev/null || { melde "FEHLER: Eintrag $id ließ sich nicht ergänzen"; return 1 }
    fi
    print ergänzt
    return
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

# einen roten Lauf auswerten: je Prüfung ein Eintrag, eine Zeile aufs iPhone
rot() {   # <Lauf-ID>
  local run=$1 info sha titel url heute flog job schritt zeile name detail jobs n=0 neu=0 erg=0 erste= ergebnis
  local -a namen zeilen
  local -A jobs_von detail_von
  info=$(gh run view $run -R $R --json headSha,displayTitle,url,jobs) || { melde "FEHLER: Lauf $run nicht lesbar"; return 1 }
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
    zeilen=(${(f)"$(print -r -- $flog | grep -a "^$job	" | grep -a 'FEHLER  ' | grep -av 'Prüfungen OK')"})
    if (( ! ${#zeilen} )); then
      # ohne FEHLER-Zeile (Abbruch vor oder außerhalb der Prüfungen): der gescheiterte Schritt
      schritt=$(jq -r --arg j $job '.jobs[] | select(.name == $j) | [.steps[] | select(.conclusion == "failure") | .name][0] // "?"' <<< $info)
      zeilen=("FEHLER  Schritt „$schritt“ abgebrochen – $(print -r -- $flog | grep -a "^$job	" | tail -15 | cut -f3- | cut -c30- | tr '\n' ' ' | cut -c1-900)")
    fi
    for zeile in $zeilen; do
      zeile=${zeile#*FEHLER  }
      name=${zeile%% – *}
      detail=${zeile#"$name"}; detail=${detail# – }
      if (( ! ${+jobs_von[$name]} )); then
        namen+=($name)
        jobs_von[$name]=$job
        detail_von[$name]=$detail
      elif [[ ", ${jobs_von[$name]}, " != *", $job, "* ]]; then   # mac hell und dunkel: einmal
        jobs_von[$name]+=", $job"
      fi
    done
  done
  for name in $namen; do
    n=$((n + 1))
    (( n > 8 )) && continue                  # mehr als 8 Prüfungen: nur zählen
    # „linux (release), linux (esr), linux (beta)“ → „linux“
    jobs=${jobs_von[$name]}
    [[ $jobs == "linux ("*"), linux ("*"), linux ("*")"* ]] && jobs=${jobs/linux \(*\), linux \(*\), linux \(*\)/linux}
    melde "  rot: $jobs: ${name[1,150]}"
    ergebnis=$(eintragen "$jobs" "$name" "Wo: CI (Workflow test.yml auf main), Job $jobs

Ist: Die Prüfung „$name“ ist rot.

Meldung: ${detail_von[$name][1,1200]}

Lauf: $url
Commit: $sha „$titel“

Erkannt am $heute vom CI-Wächter (tests/ci-waechter.sh). Ursache und Lösungsidee noch offen." \
      "**$heute:** erneut rot im Job $jobs – Lauf $url, Commit $sha") || continue
    [[ $ergebnis == neu ]] && neu=$((neu + 1)) || erg=$((erg + 1))
    [[ -z $erste ]] && erste="$jobs: ${name[1,70]}"
  done
  melde "Lauf $run ($sha) rot: $n Prüfung(en), $neu neu, $erg ergänzt"
  if [[ -z $TROCKEN ]]; then
    push "CI rot: Lauf $run ($sha) – ${erste:-?}$( (( n > 1 )) && print " (+$((n - 1)) weitere)") – Board: $neu neu, $erg ergänzt"
  fi
}

# Fehler aus der Fehlerkonsole (Zeilen „KONSOLE  …“ von tests/halo_test.py und update_test.py): nie Rot – sie
# halten kein Release auf (Entscheidung des Maintainers vom 5.11.2026) –, aber je Fehler ein Bug im Board
# („Tests: Fehlerkonsole – …“, offener Eintrag zum selben Fehler wird ergänzt). Für jeden abgeschlossenen Lauf,
# auch während Nachtlauf und Wochenprüfung (die werten diese Zeilen nicht selbst aus)
konsole() {   # <Lauf-ID>
  local run=$1 info sha titel url heute flog zeile job fehler key n=0 neu=0 erg=0 ergebnis
  local -a keys
  local -A jobs_von zeile_von
  info=$(gh run view $run -R $R --json headSha,displayTitle,url,jobs) || { melde "FEHLER: Lauf $run nicht lesbar"; return 1 }
  jq -e 'any(.jobs[]; .name == "changes" and any(.steps[]?; .name == "Gezielter Lauf" and .conclusion == "success"))' <<< $info >/dev/null && return 0
  flog=$(gh run view $run -R $R --log 2>/dev/null) || { melde "Lauf $run: Protokoll für die Fehlerkonsole nicht lesbar"; return 0 }
  sha=$(jq -r '.headSha[:7]' <<< $info)
  titel=$(jq -r '.displayTitle[:100]' <<< $info)
  url=$(jq -r .url <<< $info)
  heute=$(date '+%d.%m.%Y')
  for zeile in ${(f)"$(print -r -- $flog | grep -a 'KONSOLE  ')"}; do
    job=${zeile%%$'\t'*}
    fehler=${zeile#*KONSOLE  }
    key=${fehler%% – während *}
    key=${key#<->× }
    key=${key% \(*\)}                      # ohne Ort (Datei:Zeile) – der verschiebt sich mit jedem Commit
    [[ -z $key ]] && continue
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
    (( n > 8 )) && continue
    melde "  Fehlerkonsole: ${jobs_von[$key]}: ${key[1,150]}"
    ergebnis=$(eintragen "" "$key" "Wo: CI (Workflow test.yml auf main), Job(s) ${jobs_von[$key]}

Ist: halo.spaces schreibt einen Fehler in die Fehlerkonsole (die Prüfungen selbst können grün sein; Konsolenfehler halten kein Release auf).

Meldung: ${zeile_von[$key][1,1200]}

Lauf: $url
Commit: $sha „$titel“

Erkannt am $heute vom CI-Wächter (tests/ci-waechter.sh). Ursache und Lösungsidee noch offen. Absichtlich ausgelöst? Dann in der Prüfung mit erwartet(/Muster/) anmelden." \
      "**$heute:** erneut in der Fehlerkonsole, Job(s) ${jobs_von[$key]} – Lauf $url, Commit $sha" "Tests: Fehlerkonsole") || continue
    [[ $ergebnis == neu ]] && neu=$((neu + 1)) || erg=$((erg + 1))
  done
  melde "Lauf $run ($sha): Fehlerkonsole $n Fehler, $neu neu, $erg ergänzt"
  # aufs iPhone nur, wenn ein neuer Eintrag entstand (Wiederholungen nur im Board)
  if [[ -z $TROCKEN ]] && (( neu )); then
    push "Fehlerkonsole: Lauf $run ($sha) – $neu neue(r) Fehler im Board (kein Rot, Release nicht betroffen)"
  fi
}

auswerten() {   # <ID> <status> <conclusion> <Beginn-Epoch> <sha>
  local run=$1 st=$2 erg=$3 beginn=$4 sha=$5
  konsole $run
  if [[ -z $NUR ]] && vom_nachtlauf $beginn; then
    melde "Lauf $run ($sha): $erg – während Nachtlauf/Wochenprüfung, übernimmt deren Bericht"
    return
  fi
  case $erg in
    failure)   rot $run ;;
    cancelled) melde "Lauf $run ($sha): abgebrochen" ;;
    *)         melde "Lauf $run ($sha): $erg" ;;
  esac
}

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
  auswerten ${=zeile}
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
stand=$(<$STAND)
for run st erg beginn sha in ${=LISTE}; do
  (( run <= stand )) && continue
  [[ $st != completed ]] && break       # nicht überspringen: auf ihn warten
  auswerten $run $st $erg $beginn $sha
  stand=$run
  [[ -z $TROCKEN ]] && print $stand > $STAND
done
exit 0
