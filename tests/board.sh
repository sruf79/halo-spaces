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
#   tests/board.sh status <id> <todo|arbeit|ok|done> [<Commit-Hash>]   done archiviert gleich mit (Hash fürs Archivverzeichnis);
#                                                arbeit merkt sich, wer daran sitzt (~/halo-nacht/in-arbeit.tsv, Leitstand)
#   tests/board.sh notiz <id> <Text>             hängt einen Absatz an den Text an
#   tests/board.sh titel <id|Muster> <neuer Titel>   ersetzt den Titel eines offenen Eintrags (alter Wert ins Protokoll)
#   tests/board.sh text <id|Muster> <neuer Text>     ersetzt den ganzen Text eines offenen Eintrags (alter Wert ins Protokoll)
#   tests/board.sh archiv <id> [<Commit-Hash>]   schreibt eine Zeile ins Archivverzeichnis, dann archiviert
#   tests/board.sh suche <Begriff>               offene und Done-Einträge sowie archivierte (Verzeichnis), höchstens 10 Zeilen
#   tests/board.sh archiv-zeige <id>             Status und Text eines (auch archivierten) Eintrags per Board-id
#   tests/board.sh nachtragen                    Warteschlange (nicht angekommene Notizen/Status) nachtragen, Rest zeigen
# Status: todo = Todo, arbeit (auch in_progress) = In Progress, ok = Wartet auf OK, done = Done.
# Abfragelimit von GitHub: jeder gh-Aufruf wartet und wiederholt (tests/gh-wdh.zsh). Kommt eine Notiz, ein
# Status, Titel oder Text trotzdem nicht an (Limit hält an, Board nicht lesbar), steht er in der Warteschlange
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
    todo) print f75ad846;; arbeit|"in progress"|in_progress) print 47fc9ee4;;
    ok|"wartet auf ok") print 2327eecc;; done) print 98236657;; *) return 1;;
  esac
}
fehler() { print -u2 "FEHLER: $*"; exit 1 }
source ${0:A:h}/gh-wdh.zsh 2>/dev/null || gh_wdh() { gh "$@" }   # (ältere Kopie ohne gh-wdh.zsh: ohne Wiederholen)
SKRIPT=${0:A}                                  # ($0 ist in Funktionen deren Name)
WARTESCHLANGE=${HALO_BOARD_WARTESCHLANGE:-$HOME/halo-nacht/board-warteschlange.txt}
# titel/text: vor jeder Änderung eine Zeile „<Zeit>\t<titel|text>\t<id>\t<alter Wert>\t<neuer Wert, 200 Zeichen>“
# (Werte einzeilig: \n, \t und \\ als Zeichen), damit sich ein Versehen rückgängig machen lässt
AENDERUNGEN=${HALO_BOARD_AENDERUNGEN:-${WARTESCHLANGE:h}/board-aenderungen.log}
einzeilig() { local s=${1//\\/\\\\}; s=${s//$'\n'/\\n}; s=${s//$'\t'/\\t}; print -rn -- $s }

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
# Anlagedatum und Statuswechsel je Eintrag (gh project item-list liefert sie nicht): eine GraphQL-Abfrage, höchstens alle
# HALO_BOARD_ALTER_S Sekunden (Standard 900, Abfragelimit); ein jüngerer Stand des Leitstands (tests/leitstand-status.zsh,
# board48-sichtbar.json, gleiche Abfrage) zählt mit. Gibt [{id, createdAt, statusSeit}] aus, bei Fehler [] (nie Abbruch).
ALTER_DATEI=${HALO_BOARD_ALTER:-$HOME/halo-nacht/board-alter.json}
ALTER_S=${HALO_BOARD_ALTER_S:-900}
LEITSTAND_ALTER=${HALO_BOARD_ALTER_LEITSTAND:-$HOME/halo-nacht/leitstand/quellen/board48-sichtbar.json}
alter_laden() {
  local m l roh
  m=$(zstat +mtime $ALTER_DATEI 2>/dev/null) || m=0
  if [[ -s $LEITSTAND_ALTER ]] && l=$(zstat +mtime $LEITSTAND_ALTER 2>/dev/null) && (( l > m && EPOCHSECONDS - l < ALTER_S )); then
    roh=$(jq -c '[.[] | {id, createdAt, statusSeit: .fieldValueByName.updatedAt}]' $LEITSTAND_ALTER 2>/dev/null) \
      && [[ $roh == \[* ]] && { mkdir -p ${ALTER_DATEI:h} && print -r -- $roh > $ALTER_DATEI.neu && mv $ALTER_DATEI.neu $ALTER_DATEI } 2>/dev/null \
      && m=$EPOCHSECONDS
  fi
  if [[ ! -s $ALTER_DATEI ]] || (( EPOCHSECONDS - m >= ALTER_S )); then
    roh=$(gh_wdh api graphql --paginate -f query='query($endCursor:String){user(login:"sruf79"){projectV2(number:1){items(first:100,after:$endCursor){pageInfo{hasNextPage endCursor} nodes{id createdAt fieldValueByName(name:"Status"){... on ProjectV2ItemFieldSingleSelectValue{updatedAt}}}}}}}' \
      --jq '.data.user.projectV2.items.nodes[] | {id, createdAt, statusSeit: .fieldValueByName.updatedAt}' 2>/dev/null | jq -cs . 2>/dev/null)
    if [[ $roh == \[\{* ]]; then { mkdir -p ${ALTER_DATEI:h} && print -r -- $roh > $ALTER_DATEI.neu && mv $ALTER_DATEI.neu $ALTER_DATEI } 2>/dev/null
    elif [[ -s $ALTER_DATEI ]]; then roh=$(<$ALTER_DATEI)   # (alter Stand ist besser als keiner: Anlagedaten ändern sich nie)
    else roh='[]'; fi
    print -r -- $roh; return 0
  fi
  jq -c . $ALTER_DATEI 2>/dev/null || print '[]'
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
# Notiz, Status, Titel oder Text, der nicht ankam: eine Zeile „<Zeit>\t<notiz|status|titel|text>\t<id>\t<Wert base64>\t<Vorschau>“;
# beim Nachtragen selbst nicht erneut (HALO_BOARD_NACHTRAG gesetzt: Zeile bleibt einfach stehen)
in_warteschlange() {   # <notiz|status|titel|text> <id> <Wert> <Grund>
  [[ -n $HALO_BOARD_NACHTRAG ]] && fehler "$4"
  [[ $2 == PVTI_* ]] || fehler "$4 (keine Board-id, nicht in die Warteschlange)"
  mkdir -p ${WARTESCHLANGE:h} && print -r -- "$(date '+%F %T')	$1	$2	$(print -rn -- $3 | base64 | tr -d '\n')	${${3//$'\n'/ }[1,60]}" >> $WARTESCHLANGE \
    || fehler "$4; Warteschlange nicht beschreibbar ($WARTESCHLANGE)"
  print -u2 "WARNUNG: $4 – in der Warteschlange ($WARTESCHLANGE), der nächste board.sh-Aufruf trägt es nach; nicht selbst wiederholen"
  exit 0
}
# Warteschlange abarbeiten (je Zeile ein eigener Aufruf mit frischem Text); was wieder scheitert, bleibt stehen;
# titel/text für einen nicht mehr offenen Eintrag (Exitcode 3) wird verworfen
nachtragen() {
  [[ -s $WARTESCHLANGE && -z $HALO_BOARD_NACHTRAG ]] || return 0
  local zeit art id wert rest z bleibt=() n=0 rc
  while IFS=$'\t' read -r zeit art id wert rest; do
    z="$zeit	$art	$id	$wert	$rest"
    wert=$(print -r -- $wert | base64 -D 2>/dev/null)
    case $art in
      notiz) HALO_BOARD_NACHTRAG=1 zsh $SKRIPT notiz $id "$wert" >/dev/null 2>&1;;
      status) HALO_BOARD_NACHTRAG=1 zsh $SKRIPT status $id ${=wert} >/dev/null 2>&1;;
      titel|text) HALO_BOARD_NACHTRAG=1 zsh $SKRIPT $art $id "$wert" >/dev/null 2>&1;;
      *) false;;
    esac
    rc=$?
    if (( rc == 0 )); then n=$((n + 1))
    elif (( rc == 3 )) && [[ $art == (titel|text) ]]; then print -u2 "Warteschlange: $art für $id verworfen (Eintrag nicht mehr offen)"
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
  if [[ -z $BOARD && $1 == PVTI_* ]]; then   # Board nicht geladen: Einzelabfrage
    e=$(eintrag_direkt $1)
    [[ -n $e ]] || fehler "Eintrag $1 nicht lesbar"
    print -r -- $e; return 0
  fi
  e=$(board | jq -c --arg i $1 '[.items[] | select(.id == $i)]')
  if [[ $(print -r -- $e | jq length) == 0 && $1 == PVTI_* ]]; then   # unbekannte id (z. B. eben mit „neu“ angelegt, Zwischenspeicher kennt sie nicht): einzeln abfragen
    e=$(eintrag_direkt $1)
    if [[ -n $e && $(print -r -- $e | jq -r '.archiviert') != true ]]; then print -r -- $e; return 0; fi
    e='[]'
  fi
  if [[ $(print -r -- $e | jq length) == 0 ]]; then
    e=$(board | jq -c --arg m $1 '[.items[] | select(.status != "Done" and (.title | test($m; "i")))]') \
      || fehler "Muster ungültig: $1"
  fi
  n=$(print -r -- $e | jq length)
  (( n == 1 )) || fehler "„$1“ passt auf $n offene Einträge – id oder genaueres Muster angeben"
  print -r -- $e | jq -c '.[0]'
}
eintrag_direkt() {   # <PVTI_…-id> → Eintrag (JSON wie in der Liste, nur die genutzten Felder), ohne das Board zu laden
  gh_wdh api graphql -f query='query($i:ID!){node(id:$i){... on ProjectV2Item{id isArchived st: fieldValueByName(name:"Status"){... on ProjectV2ItemFieldSingleSelectValue{name}} typ: fieldValueByName(name:"Typ"){... on ProjectV2ItemFieldSingleSelectValue{name}} content{... on DraftIssue{id title body}}}}}' -f i=$1 \
    --jq '.data.node | select(.id != null) | {id, archiviert: .isArchived, typ: .typ.name, status: .st.name, title: .content.title, content: {id: .content.id, body: .content.body}}'
}
setze() {   # <Item-id> <Feld> <Option>
  gh_wdh project item-edit --project-id $PROJEKT --id $1 --field-id $2 --single-select-option-id $3 >/dev/null
}
# Wer sitzt woran (für den Leitstand, Maintainer 18.11.2026: „Anzahl gleichzeitiger agents sieht man nicht und auch
# nicht woran diese arbeiten“): status arbeit schreibt eine Zeile „<Epoche>\t<id>\t<Titel>\t<Prozesskette>\t<Zweig>\t<Ordner>“
# (Prozesskette = PIDs der Vorfahren, daran ordnet tests/leitstand-status.zsh Nachtlauf, Tagesroutine und Worker zu);
# jeder andere Status, archiv und eine Notiz „wartet auf Push“ räumen sie. Fehler hier halten board.sh nie auf.
IN_ARBEIT=${HALO_IN_ARBEIT:-$HOME/halo-nacht/in-arbeit.tsv}
in_arbeit_weg() {   # <id>
  [[ -s $IN_ARBEIT ]] || return 0
  { grep -v -F -- "	$1	" $IN_ARBEIT > $IN_ARBEIT.neu; mv $IN_ARBEIT.neu $IN_ARBEIT } 2>/dev/null
  return 0
}
in_arbeit_setzen() {   # <id> <Titel>
  local p=$$ kette=() zweig n=0
  while (( p > 1 && n++ < 40 )); do kette+=($p); p=$(ps -o ppid= -p $p 2>/dev/null) || break; p=${p// /}; [[ -n $p ]] || break; done
  zweig=$(git rev-parse --abbrev-ref HEAD 2>/dev/null)
  in_arbeit_weg $1
  { mkdir -p ${IN_ARBEIT:h} && print -r -- "$EPOCHSECONDS	$1	${${2//$'\t'/ }//$'\n'/ }	${(j:,:)kette}	${zweig:--}	$PWD" >> $IN_ARBEIT } 2>/dev/null
  return 0
}

befehl=$1; (( $# )) && shift
# einmal laden (im eigenen Prozess, nicht in $(…)): danach liest jeder Schritt dieselbe Liste
# (notiz/status mit Board-id: auch ohne lesbares Board weiter – dann in die Warteschlange)
if [[ $befehl == (liste|export|zeige|neu|status|notiz|titel|text|archiv|suche|nachtragen) ]]; then
  [[ $befehl == (notiz|titel|text|neu|nachtragen) ]] && FRISCH=1
  # notiz, status und archiv mit Board-id fragen nur den einen Eintrag ab (ein Punkt statt der ganzen Liste, die
  # mehr als 1000 Punkte kosten kann); ein frischer Zwischenspeicher wird nur mitgenutzt
  if [[ $befehl == (notiz|titel|text|status|archiv) && $1 == PVTI_* ]]; then
    zw_frisch && BOARD=$(<$ZWISCHEN)
  else
    board_laden || [[ $befehl == (notiz|titel|text|status) && $1 == PVTI_* ]] || fehler "Board nicht lesbar (gh project, Scope project?)"
    [[ -n $BOARD ]] && nachtragen && board_laden
  fi
fi
case $befehl in
  liste)
    board | jq -r --arg m "${1:-.}" '[.items[] | select(.status != "Done" and (.title | test($m; "i")))]
      | sort_by(.title)[] | "\(.id)  \(.typ // "-")  \(.status // "-")  \(.title)"'
    ;;
  export)
    # mit Anlagedatum (createdAt) und Zeit des letzten Statuswechsels (statusSeit) für tests/haeufung.py (Alters-Zuschlag)
    # und tests/morgenbrief.sh („Überfällig“); fehlen sie, null (Board-Eintrag „Ablauf: Alter der Einträge …“, 20.11.2026)
    typeset alter; alter=$(alter_laden)
    board | jq -c --argjson a "${alter:-[]}" '($a | map({key: .id, value: .}) | from_entries) as $m
      | {items: [.items[] | select(.status != "Done")
        | {id, typ, status, title, body: (.content.body // ""), createdAt: $m[.id].createdAt, statusSeit: $m[.id].statusSeit}]}'
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
    set -- $1 ${${${${2:l}/in progress/arbeit}/in_progress/arbeit}/wartet auf ok/ok} $3   # (für die Warteschlange ein Wort)
    # (vor dem Lesen: auch ein Status aus der Warteschlange zählt für den Leitstand)
    [[ $2 != arbeit && $1 == PVTI_* ]] && in_arbeit_weg $1
    e=$(eintrag $1) || { [[ $1 == PVTI_* ]] && in_warteschlange status $1 "$2${3:+ $3}" "Eintrag nicht lesbar, Status $2 für $1 nicht gesetzt"; exit 1 }
    if [[ $2 == arbeit ]]; then in_arbeit_setzen "$(print -r -- $e | jq -r .id)" "$(print -r -- $e | jq -r .title)"
    else in_arbeit_weg "$(print -r -- $e | jq -r .id)"; fi
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
    [[ $1 == PVTI_* && ${2:l} == *wartet\ auf\ push* ]] && in_arbeit_weg $1   # (auch wenn die Notiz in die Warteschlange geht)
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
    [[ ${2:l} == *wartet\ auf\ push* ]] && in_arbeit_weg $(print -r -- $e | jq -r .id)
    gh_wdh project item-edit --id $di --body "$body

$2" >/dev/null || in_warteschlange notiz $(print -r -- $e | jq -r .id) "$2" "Notiz ließ sich nicht anhängen"
    zw_aendern '(.items[] | select(.id == $i) | .content.body) = $b' --arg i "$(print -r -- $e | jq -r .id)" --arg b "$body

$2"
    print -r -- "$(print -r -- $e | jq -r .id)  Notiz ergänzt: $(print -r -- $e | jq -r .title)"
    ;;
  titel|text)
    # Vorhandene Einträge bearbeiten (laut neon-board erlaubte der Maintainer am 20.11.2026: „du darfst ab sofort
    # für jetzt und später immer vorhandene board-einträge bearbeiten“; von uns nicht geprüft). Ersetzt Titel bzw.
    # ganzen Text genau eines offenen Entwurfs (nicht Done, nicht archiviert); Typ und Status bleiben (Mutation
    # updateProjectV2DraftIssue nur mit diesem einen Feld). Gleicher Wert: nichts tun (Nachtragen idempotent).
    # Der alte Wert kommt vorher ins Änderungsprotokoll; scheitert das Schreiben: Warteschlange wie bei notiz.
    typeset e eid di alt neu=$2 was=${${befehl:/titel/Titel}:/text/Text}
    [[ -n $1 && $# == 2 ]] || fehler "Aufruf: board.sh $befehl <id|Muster> <neuer $was>"
    [[ -n ${neu//[[:space:]]/} ]] || fehler "neuer $was leer – nichts geändert"
    if [[ $befehl == titel ]]; then
      [[ $neu != *$'\n'* ]] || fehler "Titel mit Zeilenumbruch – nichts geändert"
      (( ${#neu} <= 256 )) || fehler "Titel länger als 256 Zeichen (${#neu}) – nichts geändert"
    fi
    if [[ $1 == PVTI_* ]]; then
      e=$(eintrag_direkt $1)
      [[ -n $e ]] || in_warteschlange $befehl $1 "$neu" "Eintrag nicht lesbar, $was für $1 nicht geändert"
      zw_frisch && BOARD=$(<$ZWISCHEN)   # (Zwischenspeicher nur nachführen, nie dafür laden)
    else
      [[ -n $BOARD ]] || fehler "Board nicht lesbar, $was für „$1“ nicht geändert (mit id kommt er in die Warteschlange)"
      e=$(eintrag $1) || exit 1
    fi
    eid=$(print -r -- $e | jq -r .id)
    # Exitcode 3: endgültig abgelehnt (nachtragen verwirft die Zeile)
    [[ $(print -r -- $e | jq -r '.archiviert // false') == true ]] && { print -u2 "FEHLER: $eid ist archiviert – nur offene Einträge"; exit 3 }
    [[ $(print -r -- $e | jq -r '.status // ""') == Done ]] && { print -u2 "FEHLER: $eid ist Done – nur offene Einträge"; exit 3 }
    di=$(print -r -- $e | jq -r '.content.id // ""')
    [[ $di == DI_* ]] || fehler "kein Entwurf im Board (content.id $di) – $was von Hand"
    alt=$(print -r -- $e | jq -r --arg f $befehl 'if $f == "titel" then (.title // "") else (.content.body // "") end')
    if [[ "$alt" != "$neu" ]]; then
      { mkdir -p ${AENDERUNGEN:h} && print -r -- "$(date '+%F %T')	$befehl	$eid	$(einzeilig "$alt")	$(einzeilig "${neu[1,200]}")" >> $AENDERUNGEN } 2>/dev/null \
        || fehler "Änderungsprotokoll nicht beschreibbar ($AENDERUNGEN) – nichts geändert"
      gh_wdh api graphql -f query="mutation(\$d:ID!,\$v:String!){updateProjectV2DraftIssue(input:{draftIssueId:\$d,${${befehl:/titel/title}:/text/body}:\$v}){draftIssue{id}}}" \
        -f d=$di -f v="$neu" >/dev/null || in_warteschlange $befehl $eid "$neu" "$was ließ sich nicht ändern"
      if [[ $befehl == titel ]]; then zw_aendern '(.items[] | select(.id == $i) | .title) = $v' --arg i $eid --arg v "$neu"
      else zw_aendern '(.items[] | select(.id == $i) | .content.body) = $v' --arg i $eid --arg v "$neu"; fi
    fi
    # ältere Werte derselben Art in der Warteschlange würden den neuen sonst beim Nachtragen überschreiben
    if [[ -z $HALO_BOARD_NACHTRAG && -s $WARTESCHLANGE ]] && grep -qF "	$befehl	$eid	" $WARTESCHLANGE; then
      { grep -vF "	$befehl	$eid	" $WARTESCHLANGE > $WARTESCHLANGE.neu; mv $WARTESCHLANGE.neu $WARTESCHLANGE
        [[ -s $WARTESCHLANGE ]] || rm -f $WARTESCHLANGE } 2>/dev/null
    fi
    if [[ "$alt" == "$neu" ]]; then print -r -- "$eid  $was unverändert (steht schon so): $(print -r -- $e | jq -r .title)"
    else print -r -- "$eid  $was geändert: $([[ $befehl == titel ]] && print -r -- $neu || print -r -- $e | jq -r .title)"; fi
    ;;
  archiv)
    typeset e aid
    e=$(eintrag $1) || exit 1
    aid=$(print -r -- $e | jq -r .id)
    in_arbeit_weg $aid
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
