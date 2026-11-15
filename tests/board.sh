#!/bin/zsh
# Knapper Zugriff auf die Aufgabenliste (GitHub-Project „halo.spaces Aufgaben“)
# für neon: gibt nur aus, was gebraucht wird (id, Typ, Status, Titel), damit
# Aufträge anderer Sitzungen neons Kontext nicht mit ganzen Board-Listen füllen
# (Entscheidung des Maintainers vom 6.11.2026, docs/neon-sitzung.md).
# Braucht gh mit Scope project (geht nur lokal, nicht in Cloud-Sitzungen).
#   tests/board.sh liste [<Muster>]              offene Einträge (Status ≠ Done), Muster: Regex auf den Titel
#   tests/board.sh export                        offene Einträge mit Text als JSON {"items":[…]} (für tests/haeufung.py)
#   tests/board.sh zeige <id|Muster> […]         Einträge mit Text (mehrere in einem Aufruf: Board nur einmal geladen)
#   tests/board.sh neu <bug|feature> <Titel> <Text> [<Status>]   legt an, gibt die id aus
#   tests/board.sh status <id> <todo|arbeit|ok|done> [<Commit-Hash>]   done archiviert gleich mit (Hash fürs Archivverzeichnis)
#   tests/board.sh notiz <id> <Text>             hängt einen Absatz an den Text an
#   tests/board.sh archiv <id> [<Commit-Hash>]   schreibt eine Zeile ins Archivverzeichnis, dann archiviert
#   tests/board.sh suche <Begriff>               offene und Done-Einträge sowie archivierte (Verzeichnis), höchstens 10 Zeilen
#   tests/board.sh archiv-zeige <id>             Status und Text eines (auch archivierten) Eintrags per Board-id
#   tests/board.sh nachtragen                    Warteschlange (nicht angekommene Notizen/Status) nachtragen, Rest zeigen
# Status: todo = Todo, arbeit = In Progress, ok = Wartet auf OK, done = Done.
# Abfragelimit von GitHub: jeder gh-Aufruf wartet und wiederholt (tests/gh-wdh.zsh). Kommt eine Notiz oder ein
# Status trotzdem nicht an (Limit hält an, Board nicht lesbar), steht er in der Warteschlange
# ~/halo-nacht/board-warteschlange.txt (Warnung, Exitcode 0 – nicht selbst wiederholen, sonst doppelt); der nächste
# Aufruf, der das Board lesen kann, trägt ihn nach (Wochenprüfung W46: Notiz mit Hash ging am 14.11. verloren).
# Vor „neu“ mit „liste '^Bereich:'“ prüfen, ob ein offener Eintrag ergänzt werden sollte.
emulate -L zsh
setopt pipe_fail

PROJEKT=PVT_kwHODEPpks4BoBQw
# Archivverzeichnis (nur Datum | id | Typ | Titel | Hash, keine Texte): archivierte Einträge kommen aus der API
# nicht mehr in der Liste, nur noch einzeln per id (archiv-zeige)
ARCHIV=${HALO_ARCHIV:-$HOME/halo-aufgaben/archiv.md}
FELD_TYP=PVTSSF_lAHODEPpks4BoBQwzhmjN8Y
FELD_STATUS=PVTSSF_lAHODEPpks4BoBQwzhmjN5E
typ_option() { case $1 in bug) print ff678ae2;; feature) print 39bb4253;; *) return 1;; esac }
status_option() {
  case ${1:l} in
    todo) print f75ad846;; arbeit|"in progress") print 47fc9ee4;;
    ok|"wartet auf ok") print 2327eecc;; done) print 98236657;; *) return 1;;
  esac
}
fehler() { print -u2 "FEHLER: $*"; exit 1 }
source ${0:A:h}/gh-wdh.zsh 2>/dev/null || gh_wdh() { gh "$@" }   # (ältere Kopie ohne gh-wdh.zsh: ohne Wiederholen)
SKRIPT=${0:A}                                  # ($0 ist in Funktionen deren Name)
WARTESCHLANGE=${HALO_BOARD_WARTESCHLANGE:-$HOME/halo-nacht/board-warteschlange.txt}

# Zwischenspeicher (Abfragelimit, 15.11.2026: Durchsicht von 17 Einträgen und Schreibbefehle luden das ganze Board
# je Aufruf und verbrauchten das Stundenkontingent): lesende Befehle sowie status und archiv nehmen die Liste aus
# der Datei, wenn sie jünger als HALO_BOARD_ZWISCHEN_S Sekunden ist (Standard 60; 0 = aus); notiz, neu und
# nachtragen lesen immer frisch (Notiz hängt an den aktuellen Text an). Schreibbefehle halten die Datei aktuell.
zmodload -F zsh/stat b:zstat 2>/dev/null; zmodload zsh/datetime 2>/dev/null
ZWISCHEN=${HALO_BOARD_ZWISCHEN:-$HOME/halo-nacht/board-zwischen.json}
ZWISCHEN_S=${HALO_BOARD_ZWISCHEN_S:-60}
zw_frisch() {
  local m
  (( ZWISCHEN_S > 0 )) && [[ -s $ZWISCHEN ]] && m=$(zstat +mtime $ZWISCHEN 2>/dev/null) && (( EPOCHSECONDS - m < ZWISCHEN_S ))
}
zw_speichern() {   # <JSON>
  (( ZWISCHEN_S > 0 )) || return 0
  mkdir -p ${ZWISCHEN:h} 2>/dev/null && print -r -- $1 > $ZWISCHEN.neu 2>/dev/null && mv $ZWISCHEN.neu $ZWISCHEN
  return 0
}
zw_aendern() {   # <jq-Filter> [jq-Argumente]: Zwischenspeicher und BOARD nachführen, bei Fehler verwerfen
  local f=$1; shift
  [[ -n $BOARD ]] || return 0
  BOARD=$(print -r -- $BOARD | jq -c "$@" "$f") && zw_speichern $BOARD || { BOARD=; rm -f $ZWISCHEN; }
  return 0
}
BOARD=
FRISCH=
board_laden() {
  [[ -n $BOARD ]] && return 0
  if [[ -z $FRISCH ]] && zw_frisch; then BOARD=$(<$ZWISCHEN); [[ -n $BOARD ]] && return 0; fi
  BOARD=$(gh_wdh project item-list 1 --owner sruf79 --limit 1000 --format json) || BOARD=
  [[ -n $BOARD ]] && zw_speichern $BOARD
  [[ -n $BOARD ]]
}
board() {
  board_laden || fehler "Board nicht lesbar (gh project, Scope project?)"
  print -r -- $BOARD
}
# Notiz oder Status, der nicht ankam: eine Zeile „<Zeit>\t<notiz|status>\t<id>\t<Wert base64>\t<Vorschau>“;
# beim Nachtragen selbst nicht erneut (HALO_BOARD_NACHTRAG gesetzt: Zeile bleibt einfach stehen)
in_warteschlange() {   # <notiz|status> <id> <Wert> <Grund>
  [[ -n $HALO_BOARD_NACHTRAG ]] && fehler "$4"
  [[ $2 == PVTI_* ]] || fehler "$4 (keine Board-id, nicht in die Warteschlange)"
  mkdir -p ${WARTESCHLANGE:h} && print -r -- "$(date '+%F %T')	$1	$2	$(print -rn -- $3 | base64 | tr -d '\n')	${${3//$'\n'/ }[1,60]}" >> $WARTESCHLANGE \
    || fehler "$4; Warteschlange nicht beschreibbar ($WARTESCHLANGE)"
  print -u2 "WARNUNG: $4 – in der Warteschlange ($WARTESCHLANGE), der nächste board.sh-Aufruf trägt es nach; nicht selbst wiederholen"
  exit 0
}
# Warteschlange abarbeiten (je Zeile ein eigener Aufruf mit frischem Text); was wieder scheitert, bleibt stehen
nachtragen() {
  [[ -s $WARTESCHLANGE && -z $HALO_BOARD_NACHTRAG ]] || return 0
  local zeit art id wert rest z bleibt=() n=0
  while IFS=$'\t' read -r zeit art id wert rest; do
    z="$zeit	$art	$id	$wert	$rest"
    wert=$(print -r -- $wert | base64 -D 2>/dev/null)
    if [[ $art == notiz ]] && HALO_BOARD_NACHTRAG=1 zsh $SKRIPT notiz $id "$wert" >/dev/null 2>&1; then n=$((n + 1))
    elif [[ $art == status ]] && HALO_BOARD_NACHTRAG=1 zsh $SKRIPT status $id ${=wert} >/dev/null 2>&1; then n=$((n + 1))
    else bleibt+=("$z"); fi
  done < $WARTESCHLANGE
  if (( ${#bleibt} )); then print -rl -- $bleibt > $WARTESCHLANGE.neu && mv $WARTESCHLANGE.neu $WARTESCHLANGE
  else rm -f $WARTESCHLANGE; fi
  (( n )) && { print -u2 "Warteschlange: $n nachgetragen, ${#bleibt} offen"; BOARD=; rm -f $ZWISCHEN }
  return 0
}
# id oder eindeutiges Titelmuster → Eintrag (JSON)
eintrag() {
  local e n
  e=$(board | jq -c --arg i $1 '[.items[] | select(.id == $i)]')
  if [[ $(print -r -- $e | jq length) == 0 ]]; then
    e=$(board | jq -c --arg m $1 '[.items[] | select(.status != "Done" and (.title | test($m; "i")))]') \
      || fehler "Muster ungültig: $1"
  fi
  n=$(print -r -- $e | jq length)
  (( n == 1 )) || fehler "„$1“ passt auf $n offene Einträge – id oder genaueres Muster angeben"
  print -r -- $e | jq -c '.[0]'
}
eintrag_direkt() {   # <PVTI_…-id> → Eintrag (JSON wie in der Liste, nur die genutzten Felder), ohne das Board zu laden
  gh_wdh api graphql -f query='query($i:ID!){node(id:$i){... on ProjectV2Item{id fieldValueByName(name:"Status"){... on ProjectV2ItemFieldSingleSelectValue{name}} content{... on DraftIssue{id title body}}}}}' -f i=$1 \
    --jq '.data.node | select(.id != null) | {id, status: .fieldValueByName.name, title: .content.title, content: {id: .content.id, body: .content.body}}'
}
setze() {   # <Item-id> <Feld> <Option>
  gh_wdh project item-edit --project-id $PROJEKT --id $1 --field-id $2 --single-select-option-id $3 >/dev/null
}

befehl=$1; (( $# )) && shift
# einmal laden (im eigenen Prozess, nicht in $(…)): danach liest jeder Schritt dieselbe Liste
# (notiz/status mit Board-id: auch ohne lesbares Board weiter – dann in die Warteschlange)
if [[ $befehl == (liste|export|zeige|neu|status|notiz|archiv|suche|nachtragen) ]]; then
  [[ $befehl == (notiz|neu|nachtragen) ]] && FRISCH=1
  # notiz mit Board-id fragt nur den einen Eintrag ab (ein Punkt statt der ganzen Liste, die allein mehr als 1000 Punkte kosten kann)
  if [[ $befehl == notiz && $1 == PVTI_* ]]; then :
  else
    board_laden || [[ $befehl == (notiz|status) && $1 == PVTI_* ]] || fehler "Board nicht lesbar (gh project, Scope project?)"
    [[ -n $BOARD ]] && nachtragen && board_laden
  fi
fi
case $befehl in
  liste)
    board | jq -r --arg m "${1:-.}" '[.items[] | select(.status != "Done" and (.title | test($m; "i")))]
      | sort_by(.title)[] | "\(.id)  \(.typ // "-")  \(.status // "-")  \(.title)"'
    ;;
  export)
    board | jq -c '{items: [.items[] | select(.status != "Done") | {id, typ, status, title, body: (.content.body // "")}]}'
    ;;
  zeige)
    [[ -n $1 ]] || fehler "Aufruf: board.sh zeige <id|Muster> [<id|Muster> …]"
    typeset z zn=0
    for z in "$@"; do
      (( zn++ )) && print "\n----"
      { eintrag $z || exit 1 } | jq -r '"\(.id)  \(.typ // "-")  \(.status // "-")\n\(.title)\n\n\(.content.body // "")"'
    done
    ;;
  neu)
    typeset typ=$1 titel=$2 text=$3 st=${4:-todo} id
    typ_option $typ >/dev/null && [[ -n $titel ]] || fehler "Aufruf: board.sh neu <bug|feature> <Titel> <Text> [<Status>]"
    status_option $st >/dev/null || fehler "Status unbekannt: $st"
    board | jq -e --arg t $titel '.items[] | select(.status != "Done" and .title == $t)' >/dev/null \
      && fehler "offener Eintrag mit gleichem Titel existiert schon – ergänzen statt neu"
    id=$(gh_wdh project item-create 1 --owner sruf79 --title "$titel" --body "$text" --format json --jq .id) \
      || fehler "Eintrag ließ sich nicht anlegen"
    setze $id $FELD_TYP $(typ_option $typ) && setze $id $FELD_STATUS $(status_option $st) \
      || fehler "$id angelegt, Typ/Status ließ sich nicht setzen"
    BOARD=; rm -f $ZWISCHEN   # (neuer Eintrag fehlt in der Liste)
    print "$id  neu: $titel"
    ;;
  status)
    typeset opt e
    opt=$(status_option "$2") || fehler "Aufruf: board.sh status <id> <todo|arbeit|ok|done> [<Commit-Hash>]"
    set -- $1 ${${${2:l}/in progress/arbeit}/wartet auf ok/ok} $3   # (für die Warteschlange ein Wort)
    [[ -n $BOARD ]] || in_warteschlange status $1 "$2${3:+ $3}" "Board nicht lesbar, Status $2 für $1 nicht gesetzt"
    e=$(eintrag $1) || exit 1
    setze $(print -r -- $e | jq -r .id) $FELD_STATUS $opt \
      || in_warteschlange status $(print -r -- $e | jq -r .id) "$2${3:+ $3}" "Status $2 ließ sich nicht setzen"
    zw_aendern '(.items[] | select(.id == $i) | .status) = $s' --arg i "$(print -r -- $e | jq -r .id)" \
      --arg s "$(case $2 in todo) print Todo;; arbeit) print "In Progress";; ok) print "Wartet auf OK";; done) print Done;; esac)"
    print -r -- "$(print -r -- $e | jq -r .id)  Status $2: $(print -r -- $e | jq -r .title)"
    # Done heißt immer auch archivieren (Entscheidung des Maintainers vom 12.11.2026): sonst bleibt der Eintrag
    # sichtbar; der Commit-Hash (optional, dritter Wert) kommt ins Archivverzeichnis
    if [[ $2 == done ]]; then
      $0 archiv $(print -r -- $e | jq -r .id) $3 || fehler "Status Done gesetzt, aber Archivieren fehlgeschlagen – mit „archiv“ nachholen"
    fi
    ;;
  notiz)
    typeset e di body
    [[ -n $2 ]] || fehler "Aufruf: board.sh notiz <id> <Text>"
    if [[ $1 == PVTI_* ]]; then
      e=$(eintrag_direkt $1)
      [[ -n $e ]] || in_warteschlange notiz $1 "$2" "Eintrag nicht lesbar, Notiz für $1 nicht angehängt"
      zw_frisch && BOARD=$(<$ZWISCHEN)   # (Zwischenspeicher nur nachführen, nie dafür laden)
    else
      [[ -n $BOARD ]] || in_warteschlange notiz $1 "$2" "Board nicht lesbar, Notiz für $1 nicht angehängt"
      e=$(eintrag $1) || exit 1
    fi
    di=$(print -r -- $e | jq -r '.content.id // ""')
    [[ $di == DI_* ]] || fehler "kein Entwurf im Board (content.id $di) – Notiz von Hand"
    body=$(print -r -- $e | jq -r '.content.body // ""')
    gh_wdh project item-edit --id $di --body "$body

$2" >/dev/null || in_warteschlange notiz $(print -r -- $e | jq -r .id) "$2" "Notiz ließ sich nicht anhängen"
    zw_aendern '(.items[] | select(.id == $i) | .content.body) = $b' --arg i "$(print -r -- $e | jq -r .id)" --arg b "$body

$2"
    print -r -- "$(print -r -- $e | jq -r .id)  Notiz ergänzt: $(print -r -- $e | jq -r .title)"
    ;;
  archiv)
    typeset e aid
    e=$(eintrag $1) || exit 1
    aid=$(print -r -- $e | jq -r .id)
    # Zeile VOR dem Archivieren (einmal je id); scheitert das Schreiben, wird nicht archiviert
    if ! grep -qF " | $aid | " $ARCHIV 2>/dev/null; then
      mkdir -p ${ARCHIV:h} && print -r -- "$(date +%F) | $aid | $(print -r -- $e | jq -r '.typ // "-"') | $(print -r -- $e | jq -r .title) | ${2:--}" >> $ARCHIV \
        || fehler "Archivverzeichnis nicht beschreibbar ($ARCHIV), nicht archiviert"
    fi
    gh_wdh project item-archive 1 --owner sruf79 --id $(print -r -- $e | jq -r .id) >/dev/null || fehler "Archivieren fehlgeschlagen"
    zw_aendern 'del(.items[] | select(.id == $i))' --arg i $aid
    print -r -- "$(print -r -- $e | jq -r .id)  archiviert: $(print -r -- $e | jq -r .title)"
    ;;
  suche)
    typeset b=$1
    [[ -n $b ]] || fehler "Aufruf: board.sh suche <Begriff>"
    {
      board | jq -r --arg m "$b" '.items[] | select(.title | test($m; "i")) | "\(.id)  \(.typ // "-")  \(.status // "-")  \(.title)"'
      [[ -r $ARCHIV ]] && grep -i -- "$b" $ARCHIV | awk -F' [|] ' '{print $2"  "$3"  archiviert "$1"  "$4"  "$5}'
    } | head -n 10
    ;;
  archiv-zeige)
    [[ $1 == PVTI_* ]] || fehler "Aufruf: board.sh archiv-zeige <PVTI_…-id>"
    gh_wdh api graphql -f query='query($i:ID!){node(id:$i){... on ProjectV2Item{id isArchived fieldValueByName(name:"Status"){... on ProjectV2ItemFieldSingleSelectValue{name}} content{... on DraftIssue{title body}}}}}' -f i=$1 \
      --jq '.data.node | "\(.id)  \(if .isArchived then "archiviert" else "aktiv" end)  \(.fieldValueByName.name // "-")\n\(.content.title)\n\n\(.content.body // "")"' \
      || fehler "Abfrage fehlgeschlagen"
    ;;
  nachtragen)
    [[ -s $WARTESCHLANGE ]] && { print "offen:"; cut -f1-3,5 $WARTESCHLANGE } || print "Warteschlange leer"
    ;;
  *)
    sed -n '/^#   tests/s/^#   //p' $0
    exit 2
    ;;
esac
