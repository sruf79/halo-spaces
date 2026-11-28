#!/bin/zsh
# Nummern-Datei für die Inaktivitätsprüfung (tests/inaktivitaet.sh; Umsetzung der Logikprüfung vom 27.11.2026,
# Punkt 5): Das Token von comms darf „gh project“ nicht lesen, darum liest inaktivitaet.sh das Board nicht mehr
# selbst, sondern nur diese Datei. Das Skript lädt die Aufgabenliste einmal („board.sh export“, liegt im selben
# Ordner, also im Checkout wie in der Kopie unter ~/.config/halo-spaces/) und schreibt
#   ~/halo-aufgaben/board-issue-nummern.json   {"zeit": "<UTC, ISO 8601>", "nummern": [15, 16, …]}
# Nur die Nummern der GitHub-Issues, auf die ein offener Eintrag verweist (Status nicht Done, „Wartet auf OK“ zählt
# als offen; Titel oder Text samt Notizen: „GitHub #n“, „[GitHub #n]“, „GitHub-Issue #n“, Aufzählungen wie
# „GitHub #45 und #67“, „GitHub-Issues #65, #66“; nicht „GitHub: PR #n“; Muster unverändert aus inaktivitaet.sh),
# dazu die Zeit. Keine Titel, Texte oder ids: Issue-Nummern sind auf GitHub ohnehin öffentlich.
# Geschrieben wird über eine neue Datei (mv), nie halb. Ist das Board nicht lesbar oder der Export kaputt, bleibt
# die alte Datei unverändert, Exitcode 1 und eine Zeile „FEHLER Aufgabenliste nicht lesbar: <Text>“ auf stderr
# (Text höchstens 300 Zeichen, Token und „Authorization“ durch *** ersetzt).
# Aufgerufen von tests/bilder-eingang.zsh (alle 15 Minuten, aber nur wenn die Datei älter als 6 Stunden ist),
# von Hand: zsh tests/board-nummern.zsh
# Proben: HALO_AUFGABEN (statt ~/halo-aufgaben), HALO_BN_DATEI (Zieldatei), HALO_BN_BOARD (Befehl statt
# „zsh <Ordner>/board.sh“, bekommt „export“ angehängt), HALO_BN_ZEIT (Zeit statt der Uhr).
# Test ohne Netz: zsh tests/board_nummern_test.zsh (board.sh-Attrappe; BN_NUR_FUNKTIONEN=1 lädt nur die Funktionen).

BN_DATEI=${HALO_BN_DATEI:-${HALO_AUFGABEN:-$HOME/halo-aufgaben}/board-issue-nummern.json}
BN_BOARD=${HALO_BN_BOARD:-zsh ${${(%):-%x}:A:h}/board.sh}

# Export der Aufgabenliste ({"items": [{status, title, body}]}) → {"zeit": …, "nummern": [n, …]} (aufsteigend)
bn_nummern() {   # <export.json> <zeit>
  jq -c --arg zeit $2 'if (.items | type) != "array" then error("kein Board-Export") else . end
    | {zeit: $zeit, nummern: ([.items[] | select(.status != "Done") | ((.title // "") + "\n" + (.body // ""))
       | scan("GitHub(?:-[A-Za-z]+)? #[0-9]+(?:(?:, ?| und | and | oder | or |/)#[0-9]+)*"; "i")
       | scan("[0-9]+") | tonumber] | unique)}' $1
}

# Fehlertext (stderr von board.sh) → eine Zeile, höchstens 300 Zeichen, Token maskiert
bn_fehler_text() {   # <stderr-Datei>
  local t; t=$(tr '\n\r\t' '   ' < $1 2>/dev/null | tr -d '\000-\010\013-\037\177' | sed -E 's/Authorization.*/***/I; s/[[:space:]]+$//; s/(gh[opsur]_|github_pat_)[^[:space:]]*/***/g; s/((GH_|GITHUB_)?TOKEN|Bearer|token)[=: ]+[^[:space:]]*/***/gI')
  print -r -- ${t[1,300]}
}

bn_lauf() {
  emulate -L zsh
  setopt pipe_fail
  local tmp zeit t
  tmp=$(mktemp -d) || return 1
  {
    zeit=${HALO_BN_ZEIT:-$(date -u +%Y-%m-%dT%H:%M:%SZ)}
    if ! ${=BN_BOARD} export > $tmp/board.json 2> $tmp/board.err; then
      t=$(bn_fehler_text $tmp/board.err)
      print -u2 -r -- "FEHLER Aufgabenliste nicht lesbar: ${t:-board.sh export ohne Fehlertext}"
      return 1
    fi
    if ! bn_nummern $tmp/board.json $zeit > $tmp/n.json 2>/dev/null || [[ ! -s $tmp/n.json ]]; then
      print -u2 -r -- "FEHLER Aufgabenliste nicht lesbar: Export ohne Einträge (kein {\"items\": […]})"
      return 1
    fi
    mkdir -p ${BN_DATEI:h} && cp $tmp/n.json $BN_DATEI.neu && mv -f $BN_DATEI.neu $BN_DATEI || {
      rm -f $BN_DATEI.neu; print -u2 -r -- "FEHLER $BN_DATEI nicht schreibbar"; return 1 }
    print -r -- "Board-Nummern: $(jq -r '.nummern | length' $BN_DATEI) Issue(s) mit offenem Eintrag, Stand $zeit"
  } always { rm -rf $tmp }
}

[[ -n $BN_NUR_FUNKTIONEN ]] && return 0
emulate -L zsh
path=(~/.local/bin /opt/homebrew/bin /usr/local/bin $path)
bn_lauf; exit $?
