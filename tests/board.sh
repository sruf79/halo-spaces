#!/bin/zsh
# Knapper Zugriff auf die Aufgabenliste (GitHub-Project „halo.spaces Aufgaben“)
# für neon: gibt nur aus, was gebraucht wird (id, Typ, Status, Titel), damit
# Aufträge anderer Sitzungen neons Kontext nicht mit ganzen Board-Listen füllen
# (Entscheidung des Maintainers vom 6.11.2026, docs/neon-sitzung.md).
# Braucht gh mit Scope project (geht nur lokal, nicht in Cloud-Sitzungen).
#   tests/board.sh liste [<Muster>]              offene Einträge (Status ≠ Done), Muster: Regex auf den Titel
#   tests/board.sh zeige <id|Muster>             ein Eintrag mit Text
#   tests/board.sh neu <bug|feature> <Titel> <Text> [<Status>]   legt an, gibt die id aus
#   tests/board.sh status <id> <todo|arbeit|ok|done> [<Commit-Hash>]   done archiviert gleich mit (Hash fürs Archivverzeichnis)
#   tests/board.sh notiz <id> <Text>             hängt einen Absatz an den Text an
#   tests/board.sh archiv <id> [<Commit-Hash>]   schreibt eine Zeile ins Archivverzeichnis, dann archiviert
#   tests/board.sh suche <Begriff>               offene und Done-Einträge sowie archivierte (Verzeichnis), höchstens 10 Zeilen
#   tests/board.sh archiv-zeige <id>             Status und Text eines (auch archivierten) Eintrags per Board-id
# Status: todo = Todo, arbeit = In Progress, ok = Wartet auf OK, done = Done.
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

BOARD=
board() {
  [[ -n $BOARD ]] || BOARD=$(gh project item-list 1 --owner sruf79 --limit 1000 --format json) \
    || fehler "Board nicht lesbar (gh project, Scope project?)"
  print -r -- $BOARD
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
setze() {   # <Item-id> <Feld> <Option>
  gh project item-edit --project-id $PROJEKT --id $1 --field-id $2 --single-select-option-id $3 >/dev/null
}

befehl=$1; (( $# )) && shift
# einmal laden (im eigenen Prozess, nicht in $(…)): danach liest jeder Schritt dieselbe Liste
[[ $befehl == (liste|zeige|neu|status|notiz|archiv|suche) ]] && board >/dev/null
case $befehl in
  liste)
    board | jq -r --arg m "${1:-.}" '[.items[] | select(.status != "Done" and (.title | test($m; "i")))]
      | sort_by(.title)[] | "\(.id)  \(.typ // "-")  \(.status // "-")  \(.title)"'
    ;;
  zeige)
    [[ -n $1 ]] || fehler "Aufruf: board.sh zeige <id|Muster>"
    { eintrag $1 || exit 1 } | jq -r '"\(.id)  \(.typ // "-")  \(.status // "-")\n\(.title)\n\n\(.content.body // "")"'
    ;;
  neu)
    typeset typ=$1 titel=$2 text=$3 st=${4:-todo} id
    typ_option $typ >/dev/null && [[ -n $titel ]] || fehler "Aufruf: board.sh neu <bug|feature> <Titel> <Text> [<Status>]"
    status_option $st >/dev/null || fehler "Status unbekannt: $st"
    board | jq -e --arg t $titel '.items[] | select(.status != "Done" and .title == $t)' >/dev/null \
      && fehler "offener Eintrag mit gleichem Titel existiert schon – ergänzen statt neu"
    id=$(gh project item-create 1 --owner sruf79 --title "$titel" --body "$text" --format json --jq .id) \
      || fehler "Eintrag ließ sich nicht anlegen"
    setze $id $FELD_TYP $(typ_option $typ) && setze $id $FELD_STATUS $(status_option $st) \
      || fehler "$id angelegt, Typ/Status ließ sich nicht setzen"
    print "$id  neu: $titel"
    ;;
  status)
    typeset opt e
    opt=$(status_option "$2") || fehler "Aufruf: board.sh status <id> <todo|arbeit|ok|done> [<Commit-Hash>]"
    e=$(eintrag $1) || exit 1
    setze $(print -r -- $e | jq -r .id) $FELD_STATUS $opt || fehler "Status ließ sich nicht setzen"
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
    e=$(eintrag $1) || exit 1
    di=$(print -r -- $e | jq -r '.content.id // ""')
    [[ $di == DI_* ]] || fehler "kein Entwurf im Board (content.id $di) – Notiz von Hand"
    body=$(print -r -- $e | jq -r '.content.body // ""')
    gh project item-edit --id $di --body "$body

$2" >/dev/null || fehler "Notiz ließ sich nicht anhängen"
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
    gh project item-archive 1 --owner sruf79 --id $(print -r -- $e | jq -r .id) >/dev/null || fehler "Archivieren fehlgeschlagen"
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
    gh api graphql -f query='query($i:ID!){node(id:$i){... on ProjectV2Item{id isArchived fieldValueByName(name:"Status"){... on ProjectV2ItemFieldSingleSelectValue{name}} content{... on DraftIssue{title body}}}}}' -f i=$1 \
      --jq '.data.node | "\(.id)  \(if .isArchived then "archiviert" else "aktiv" end)  \(.fieldValueByName.name // "-")\n\(.content.title)\n\n\(.content.body // "")"' \
      || fehler "Abfrage fehlgeschlagen"
    ;;
  *)
    sed -n '/^#   tests/s/^#   //p' $0
    exit 2
    ;;
esac
