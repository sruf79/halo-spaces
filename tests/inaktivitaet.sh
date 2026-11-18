#!/bin/zsh
# Inaktivitätsregel für GitHub-Issues, die auf einen Nutzer warten (Maintainer 15.11.2026, Wortlaut in
# ENTSCHEIDUNGEN.md „GitHub: Inaktivitätsregel …“; docs/github-komm.md „Inaktivität“). Ohne Claude, nur
# gh und jq. Allgemeingültig: der Zustand jedes Issues wird bei jedem Aufruf aus GitHub abgeleitet,
# es gibt keine Datei mit Fristen oder Erinnerungen.
#
#   inaktivitaet.sh --trocken     zeigt je offenem Issue den Zustand, schließt nichts, schreibt nichts
#   inaktivitaet.sh               schließt die schließbaren Issues (für neon bzw. den Nachtlauf)
#   inaktivitaet.sh --anfragen    nur die Issues, bei denen eine Nachfrage fällig ist (nur anzeigen);
#                                 die Nachfrage postet die GitHub-Routine (halo-github), nie dieses Skript
#
# Begriffe (Konto des Maintainers = das Konto, mit dem halo-github postet: sruf79):
#   Markierung   Kommentar des Maintainer-Kontos mit „we will close this issue due to inactivity“
#   Antwort      Kommentar eines anderen Kontos nach der (letzten) Markierung; Bots zählen nicht
# Zeilen der Ausgabe:
#   schliessen #n <Nachfrage Wiener Zeit>   Markierung älter als 7 Tage, keine Antwort danach
#   wartet #n bis <Wiener Zeit>             Markierung jünger als 7 Tage, keine Antwort danach
#   anfrage #n <letzter Kommentar>          letzter Kommentar vom Maintainer-Konto ohne Markierung,
#                                           älter als 7 Tage: Nachfrage fällig (Routine)
#   ausgenommen #n (<Grund>)                Label keep-open/waiting-on-us, Zeile in der Ausnahmedatei oder
#                                           offener Board-Eintrag („ausgenommen #n (offener Board-Eintrag)“,
#                                           nur ohne offene Markierung, siehe unten)
#   offen #n | eigenes #n | kein-issue #n   nichts zu tun (Nutzer am Zug: wir; eigenes Issue; Pull Request)
# Beim Ausführen zusätzlich „abgeräumt #n (Board-Eintrag archiviert)“, „melden #n: verlinkter Board-Eintrag nicht
# abgeräumt (<Grund>)“, „geschlossen #n“ bzw. „FEHLER #n: …“, am Ende (nur wenn etwas geschlossen
# wurde) „Inaktivität: geschlossen #a, #b“ (diese Zeile übernimmt der Morgenbrief aus dem Nachtbericht)
# und je Issue eine Zeile in ~/halo-nacht/inaktivitaet.log. Rückgabe 1 bei einem FEHLER, 2 wenn GitHub
# nicht lesbar ist.
# Ausnahmen (Maintainer 15.11.2026: Nutzer wartet auf einen Fix von uns, bewusst offene Issues):
# Label `keep-open` bzw. `waiting-on-us` am Issue, sonst Zeile „<Nummer> | <Grund>“ in
# tests/inaktivitaet-ausnahmen.txt im Checkout (HALO_REPO, Standard ~/halo-spaces).
# Automatische Ausnahme (Maintainer 18.11.2026, ENTSCHEIDUNGEN.md „18.11.2026 – GitHub: Inaktivitätsregel, offener Board-Eintrag …“):
# ein Issue n ist ausgenommen, solange die Aufgabenliste einen offenen Eintrag (nicht archiviert, Status nicht Done,
# „Wartet auf OK“ zählt als offen) hat, der im Titel oder Text auf „GitHub #n“ verweist (auch „[GitHub #n]“,
# „GitHub-Issue #n“); erledigt oder archiviert endet die Ausnahme von selbst. Die Ausnahme gilt nur, solange wir
# nicht auf den Nutzer warten (Maintainer 18.11.2026 zu #31/#52): steht eine Markierung ohne Antwort danach oder
# ist unser letzter Kommentar eine Rückfrage (enthält „?“ außerhalb von Links; Deutung nach docs/github-komm.md
# „Wann Ausnahme“), läuft der normale Ablauf (Nachfrage, Frist) trotz Eintrag. Beim Schließen wird zuerst der verlinkte Eintrag (Titel enthält „GitHub #n“,
# reine Querverweise im Text nie) mit Notiz auf Done gesetzt und archiviert (rückholbar), dann das Issue
# geschlossen; ein Eintrag In Progress oder mit committetem Fix (Hash in den Notizen) bleibt stehen („melden“),
# das Issue wird trotzdem geschlossen; scheitert das Abräumen, bleibt das Issue offen (FEHLER, nächste Runde).
# Das Board wird je Lauf einmal über „tests/board.sh export“ geladen; ist es nicht lesbar, schließt das Skript
# nichts (FEHLER-Zeile). Board-Inhalte erscheinen nie in der Ausgabe, nur die Nummer.
# Proben: HALO_JETZT (Uhr), HALO_INA_AUSNAHMEN, HALO_INA_LOG, HALO_INA_DATEN (issues.json statt gh),
# HALO_INA_BOARD (Befehl statt „zsh $HALO_REPO/tests/board.sh“, bekommt „export“ angehängt).
# Test ohne Netz: zsh tests/inaktivitaet_test.zsh (gh-Attrappe, lädt mit INA_NUR_FUNKTIONEN=1).

INA_R=sruf79/halo-spaces
INA_EIGENER=sruf79
INA_REPO=${HALO_REPO:-$HOME/halo-spaces}
INA_AUSNAHMEN=${HALO_INA_AUSNAHMEN:-$INA_REPO/tests/inaktivitaet-ausnahmen.txt}
INA_LOG=${HALO_INA_LOG:-$HOME/halo-nacht/inaktivitaet.log}
INA_BOARD=${HALO_INA_BOARD:-zsh $INA_REPO/tests/board.sh}
INA_BOARD_NOTIZ='Issue wegen Inaktivität geschlossen (Maintainer 18.11.2026)'
INA_MARKE='we will close this issue due to inactivity'
INA_LABELS='keep-open waiting-on-us'
INA_FRIST=$(( 7 * 86400 ))
# ci_jetzt (HALO_JETZT), ci_wien
source ${${(%):-%x}:A:h}/ci-runde.zsh

# --- reine Auswertung (Daten aus Dateien) ---

# Ausnahmedatei → JSON {"<n>": "<Grund>"}; Zeilen „<n> | <Grund>“, „#“ am Zeilenanfang ist Kommentar
ina_ausnahmen_lesen() {   # <Datei>
  [[ -r $1 ]] || { print '{}'; return }
  awk -F'|' '/^[ \t]*[0-9]+[ \t]*\|/ { n = $1; gsub(/[ \t]/, "", n); g = $2; for (k = 3; k <= NF; k++) g = g "|" $k
    gsub(/^[ \t]+|[ \t]+$/, "", g); gsub(/["\\]/, "", g); printf "{\"%s\": \"%s\"}\n", n, g }' $1 | jq -s 'add // {}'
}

# Export der Aufgabenliste ({"items": [{status, title, body}]}) → JSON {"<n>": true} der Issues, auf die ein
# offener Eintrag verweist („GitHub #n“, „[GitHub #n]“, „GitHub-Issue #n“; nicht „GitHub: PR #n“)
ina_board_nummern() {   # <export.json>
  jq -c 'if (.items | type) != "array" then error("kein Board-Export") else . end
    | [.items[] | select(.status != "Done") | ((.title // "") + "\n" + (.body // ""))
       | scan("GitHub(?:-[A-Za-z]+)? #([0-9]+)"; "i") | .[0]] | unique | map({(.): true}) | add // {}' $1
}

# verlinkte Einträge zu Issue n (Titel enthält „GitHub #n“ bzw. „GitHub-Issue #n“) → Zeilen „<id>\t<Grund>\t<Notiz da>“;
# Grund leer = abräumbar, sonst „In Progress“ bzw. „Fix committet“ (nur melden)
ina_board_verlinkt() {   # <export.json> <n>
  jq -r --arg n $2 --arg notiz $INA_BOARD_NOTIZ '.items[] | select(.status != "Done")
    | select((.title // "") | test("GitHub(-[A-Za-z]+)? #" + $n + "([^0-9]|$)"; "i"))
    | (.body // "") as $b
    | [.id, (if .status == "In Progress" then "In Progress"
             elif ($b | test("(committet|Commit|Fix)[^\n]*\\b[0-9a-f]{7,40}\\b"; "i")) then "Fix committet" else "" end),
       (if ($b | contains($notiz)) then "1" else "" end)] | @tsv' $1
}

# verlinkte Einträge vor dem Schließen abräumen (Notiz, Done = archivieren); Rückgabe 1, wenn das scheitert.
# HALO_BOARD_NACHTRAG: board.sh legt nichts in die Warteschlange, sondern scheitert (sonst käme es später doppelt)
ina_board_abraeumen() {   # <export.json> <n>
  local id grund da
  while IFS=$'\t' read -r id grund da; do
    [[ -n $id ]] || continue
    if [[ -n $grund ]]; then print "melden #$2: verlinkter Board-Eintrag nicht abgeräumt ($grund)"; continue; fi
    if [[ -z $da ]] && ! HALO_BOARD_NACHTRAG=1 ${=INA_BOARD} notiz $id $INA_BOARD_NOTIZ >/dev/null 2>&1; then
      print "FEHLER #$2: Board-Eintrag nicht abgeräumt (Notiz), Issue nicht geschlossen"; return 1
    fi
    if ! HALO_BOARD_NACHTRAG=1 ${=INA_BOARD} status $id done >/dev/null 2>&1; then
      print "FEHLER #$2: Board-Eintrag nicht abgeräumt (Done/Archiv), Issue nicht geschlossen"; return 1
    fi
    print "abgeräumt #$2 (Board-Eintrag archiviert)"
  done < <(ina_board_verlinkt $1 $2)
  return 0
}

# Zustand je Issue → Zeilen (siehe Kopf)
# issues.json: [{number, pr, autor, labels: [..], comments: [{login, bot, created_at, body}]}]
ina_auswerten() {   # <issues.json> <ausnahmen.json> <jetzt Epoch> [<board.json> aus ina_board_nummern]
  TZ=Europe/Vienna jq -r --slurpfile a $2 --argjson jetzt $3 --argjson frist $INA_FRIST \
      --slurpfile b ${4:-/dev/null} \
      --arg ich $INA_EIGENER --arg marke $INA_MARKE --arg labels $INA_LABELS '
    ($a[0]) as $aus | ($b[0] // {}) as $board | ($labels | split(" ")) as $lab
    | def zeit: .created_at | fromdate;
      def wien: strflocaltime("%d.%m.%Y-%H:%M");
    sort_by(.number)[] | .number as $n
    | ([.comments[]? | select((.bot | not) and (.login | test("\\[bot\\]$") | not))] | sort_by(zeit)) as $k
    | ([$k[] | select(.login == $ich and (.body | ascii_downcase | contains($marke)))] | last) as $m
    | ([.labels[]? | select(. as $l | $lab | index($l))] | first) as $label
    | if .pr then "kein-issue #\($n)"
      elif $aus[$n | tostring] then "ausgenommen #\($n) (\($aus[$n | tostring]))"
      elif $label then "ausgenommen #\($n) (Label \($label))"
      elif .autor == $ich then "eigenes #\($n)"
      elif $m != null and ([$k[] | select(.login != $ich and zeit > ($m | zeit))] | length) == 0 then
        if $jetzt - ($m | zeit) > $frist then "schliessen #\($n) \($m | zeit | wien)"
        else "wartet #\($n) bis \(($m | zeit) + $frist | wien)" end
      elif $board[$n | tostring] and ((($k | length) > 0 and $k[-1].login == $ich
             and ($k[-1].body | gsub("https?://[^\\s)]+"; "") | test("\\?"))) | not)
        then "ausgenommen #\($n) (offener Board-Eintrag)"
      elif ($k | length) > 0 and ($k[-1].login == $ich) and ($k[-1].body | ascii_downcase | contains($marke) | not)
           and $jetzt - ($k[-1] | zeit) > $frist then "anfrage #\($n) \($k[-1] | zeit | wien)"
      else "offen #\($n)" end' $1
}

ina_schliess_text() {
  print -r -- "Closing due to inactivity, since we have not heard back. Feel free to reopen this issue with more details at any time. Thanks!"
}

# --- Abruf (gh) ---

# offene Issues und PRs mit Kommentaren (nur Issues) → issues.json; Rückgabe 1, wenn gh nicht lesbar ist
ina_issues_holen() {   # <Datei>
  emulate -L zsh
  setopt pipe_fail
  local datei=$1 liste n k
  liste=$(gh api "repos/$INA_R/issues?state=open&per_page=100" --paginate \
    --jq '.[] | {number, pr: (.pull_request != null), autor: .user.login, labels: [.labels[].name]}' | jq -s .) || return 1
  print -r -- '[]' > $datei
  for n in $(print -r -- $liste | jq -r '.[] | select(.pr | not) | .number'); do
    k=$(gh api "repos/$INA_R/issues/$n/comments?per_page=100" --paginate \
      --jq '.[] | {login: .user.login, bot: (.user.type == "Bot"), created_at, body}' | jq -s .) || return 1
    jq --argjson n $n --argjson k "$k" '. + [{number: $n, comments: $k}]' $datei > $datei.tmp && mv $datei.tmp $datei
  done
  # Kommentare zu den Issues der Liste dazu (PRs ohne Kommentare)
  print -r -- $liste | jq --slurpfile k $datei '[.[] | . as $i | . + {comments: ([$k[0][] | select(.number == $i.number) | .comments] | first // [])}]' > $datei.tmp \
    && mv $datei.tmp $datei
}

ina_gh_token() {   # gh ohne Anmeldung: Token aus hosts.yml wie in der geplanten Aufgabe
  gh api user >/dev/null 2>&1 && return
  local t=$(grep -o 'ghp_[A-Za-z0-9]*' ~/.config/gh/hosts.yml 2>/dev/null | head -1)
  [[ -n $t ]] && export GH_TOKEN=$t
}

# --- Lauf ---
ina_lauf() {   # [--trocken | --anfragen]
  emulate -L zsh
  setopt pipe_fail
  local modus=$1 tmp n wann st fehler=0 zu=()
  tmp=$(mktemp -d) || return 2
  {
    if [[ -n $HALO_INA_DATEN ]]; then cp $HALO_INA_DATEN $tmp/i.json
    else ina_issues_holen $tmp/i.json || { print "FEHLER Issues nicht lesbar (gh)"; return 2 }; fi
    if [[ ! -r $INA_AUSNAHMEN ]]; then
      # ohne Ausnahmedatei nie schließen (bewusst offene Issues wären sonst nicht geschützt)
      [[ -z $modus ]] && { print "FEHLER Ausnahmedatei $INA_AUSNAHMEN fehlt, nichts geschlossen"; return 1 }
      print "Hinweis: Ausnahmedatei $INA_AUSNAHMEN fehlt"
    fi
    ina_ausnahmen_lesen $INA_AUSNAHMEN > $tmp/a.json
    # Aufgabenliste einmal je Lauf; nicht lesbar: nie schließen (Issues mit offenem Eintrag wären nicht geschützt)
    if ! { ${=INA_BOARD} export > $tmp/board.json 2>/dev/null && ina_board_nummern $tmp/board.json > $tmp/b.json 2>/dev/null }; then
      [[ -z $modus ]] && { print "FEHLER Aufgabenliste nicht lesbar (tests/board.sh export), nichts geschlossen"; return 1 }
      print "Hinweis: Aufgabenliste nicht lesbar, Ausnahme „offener Board-Eintrag“ nicht geprüft"
      print '{}' > $tmp/b.json
    fi
    ina_auswerten $tmp/i.json $tmp/a.json $(ci_jetzt) $tmp/b.json > $tmp/z.txt || { print "FEHLER Auswertung"; return 2 }
    if [[ $modus == --anfragen ]]; then grep '^anfrage ' $tmp/z.txt; return 0; fi
    print "# Inaktivität $(ci_wien $(ci_jetzt)) (Wiener Zeit)"
    if [[ $modus == --trocken ]]; then
      sed 's/^schliessen \(#[0-9]*\) \(.*\)/würde schließen \1 (Nachfrage \2)/' $tmp/z.txt
      return 0
    fi
    grep -v '^schliessen ' $tmp/z.txt
    while read -r _ n wann; do
      n=${n#\#}
      # unmittelbar vorher noch einmal: offen und kein PR
      if ! st=$(gh api repos/$INA_R/issues/$n --jq 'if .pull_request then "pr" else .state end' 2>$tmp/err); then
        print "FEHLER #$n: nicht lesbar"; fehler=1; continue
      fi
      [[ $st == open ]] || { print "übersprungen #$n ($st)"; continue }
      # zuerst den verlinkten Board-Eintrag abräumen, dann schließen (Maintainer 18.11.2026)
      ina_board_abraeumen $tmp/board.json $n || { fehler=1; continue }
      if gh issue close $n -R $INA_R --reason "not planned" --comment "$(ina_schliess_text)" >/dev/null 2>$tmp/err; then
        print "geschlossen #$n (Nachfrage $wann)"
        zu+=("#$n")
        mkdir -p ${INA_LOG:h} && print -r -- "$(date '+%F %T') geschlossen #$n wegen Inaktivität (Nachfrage $wann)" >> $INA_LOG
      else
        print "FEHLER #$n: $(head -1 $tmp/err)"; fehler=1
      fi
    done < <(grep '^schliessen ' $tmp/z.txt)
    (( $#zu )) && print "Inaktivität: geschlossen ${(j:, :)zu}"
    return $fehler
  } always { rm -rf $tmp }
}

[[ -n $INA_NUR_FUNKTIONEN ]] && return 0
emulate -L zsh
path=(~/.local/bin /opt/homebrew/bin /usr/local/bin $path)
[[ -n $HALO_INA_DATEN ]] || ina_gh_token
case $1 in
  ''|--trocken|--anfragen) ina_lauf $1; exit $? ;;
  *) sed -n '/^#   inaktivitaet.sh/,/^#$/s/^# //p' $0; exit 2 ;;
esac
