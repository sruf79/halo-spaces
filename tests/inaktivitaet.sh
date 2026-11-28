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
#   anfrage #n <letzter Kommentar>          letzter Kommentar vom Maintainer-Konto ohne Markierung, eine
#                                           Rückfrage („?“ außerhalb von Links), älter als 7 Tage: Nachfrage fällig
#   zusage #n <letzter Kommentar>           wie anfrage, aber ohne Rückfrage und ohne offenen Board-Eintrag: der
#                                           Nutzer wartet auf uns; die Routine verknüpft die Zusage mit einem
#                                           Board-Eintrag („GitHub #n“) oder schließt selbst, nie Nachfrage
#   (Markierung: gilt nur, solange sie der letzte Kommentar ist; ein späterer Kommentar, auch ein eigener, hebt sie auf)
#   ausgenommen #n (<Grund>)                Label keep-open/waiting-on-us, Zeile in der Ausnahmedatei oder Zusage
#                                           mit offenem Board-Eintrag („ausgenommen #n (Nutzer wartet auf uns,
#                                           offener Board-Eintrag)“, nur ohne offene Markierung und Rückfrage, siehe unten)
#   offen #n | eigenes #n | kein-issue #n   nichts zu tun (Nutzer am Zug: wir; eigenes Issue; Pull Request)
# Beim Ausführen zusätzlich „geschlossen #n“ bzw. „FEHLER #n: …“, „weiter #n (offener Board-Eintrag läuft weiter)“
# wenn ein offener Eintrag auf das geschlossene Issue verweist, am Ende (nur wenn etwas geschlossen
# wurde) „Inaktivität: geschlossen #a, #b“ (diese Zeile übernimmt der Morgenbrief aus dem Nachtbericht)
# und je Issue eine Zeile in ~/halo-nacht/inaktivitaet.log. Rückgabe 1 bei einem FEHLER, 2 wenn GitHub
# nicht lesbar ist.
# Ausnahmen (Maintainer 15.11.2026: Nutzer wartet auf einen Fix von uns, bewusst offene Issues):
# Label `keep-open` bzw. `waiting-on-us` am Issue, sonst Zeile „<Nummer> | <Grund>“ in
# tests/inaktivitaet-ausnahmen.txt im Checkout (HALO_REPO, Standard ~/halo-spaces).
# Automatische Ausnahme (Maintainer 18.11.2026, ENTSCHEIDUNGEN.md „18.11.2026 – GitHub: Inaktivitätsregel, offener Board-Eintrag …“):
# ein Issue n ist ausgenommen, solange die Aufgabenliste einen offenen Eintrag (nicht archiviert, Status nicht Done,
# „Wartet auf OK“ zählt als offen) hat, der im Titel oder Text (mit Notizen) auf „GitHub #n“ verweist (auch „[GitHub #n]“,
# „GitHub-Issue #n“, „GitHub #45 und #67“); erledigt oder archiviert endet die Ausnahme von selbst. Die Ausnahme gilt nur, solange wir
# nicht auf den Nutzer warten (Maintainer 18.11.2026 zu #31/#52): steht eine Markierung ohne Antwort danach oder
# ist unser letzter Kommentar eine Rückfrage (enthält „?“ außerhalb von Links; Deutung nach docs/github-komm.md
# „Wann Ausnahme“), läuft der normale Ablauf (Nachfrage, Frist) trotz Eintrag. Seit 20.11.2026 (Maintainer, ENTSCHEIDUNGEN.md
# „GitHub-Issues: Bug oder Feature, Bewertung, Schließen“, Antwort 2: „das issue schliesst und die einträge laufen weiter da
# von einem guten feature oder einem gefixten bug alle user profitieren.“) ist der offene Eintrag allein keine Ausnahme mehr:
# nach Rückfrage, Nachfrage mit Markierung und 7 Tagen ohne Antwort wird das Issue geschlossen, verlinkte Einträge bleiben
# unverändert (keine Notiz, kein Done, kein Archiv; Zeile „weiter #n“). Das Board liest das Skript seit 28.11.2026
# nicht mehr selbst (das Token von comms darf „gh project“ nicht; Umsetzung der Logikprüfung vom 27.11.2026, Punkt 5),
# sondern nur die Nummern-Datei ~/halo-aufgaben/board-issue-nummern.json ({"zeit", "nummern"}), die
# tests/board-nummern.zsh aus „tests/board.sh export“ schreibt (Aufruf über tests/bilder-eingang.zsh, wenn die Datei
# älter als 6 Stunden ist). Fehlt sie, ist sie kaputt oder älter als 24 Stunden, gilt die Aufgabenliste als nicht
# lesbar: das Skript schließt nichts (FEHLER-Zeile, vorsichtshalber wie bisher) und schreibt den Grund ins Protokoll.
# Board-Inhalte erscheinen nie in der Ausgabe, nur die Nummer.
# Proben: HALO_JETZT (Uhr), HALO_INA_AUSNAHMEN, HALO_INA_LOG, HALO_INA_DATEN (issues.json statt gh),
# HALO_INA_NUMMERN (Nummern-Datei statt ~/halo-aufgaben/board-issue-nummern.json).
# Test ohne Netz: zsh tests/inaktivitaet_test.zsh (gh-Attrappe, lädt mit INA_NUR_FUNKTIONEN=1).

INA_R=sruf79/halo-spaces
INA_EIGENER=sruf79
INA_REPO=${HALO_REPO:-$HOME/halo-spaces}
INA_AUSNAHMEN=${HALO_INA_AUSNAHMEN:-$INA_REPO/tests/inaktivitaet-ausnahmen.txt}
INA_LOG=${HALO_INA_LOG:-$HOME/halo-nacht/inaktivitaet.log}
INA_NUMMERN=${HALO_INA_NUMMERN:-$HOME/halo-aufgaben/board-issue-nummern.json}
INA_NUMMERN_ALTER=$(( 24 * 3600 ))
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

# Nummern-Datei (tests/board-nummern.zsh: {"zeit": "<ISO>", "nummern": [n, …]}) → JSON {"<n>": true} der Issues, auf
# die ein offener Eintrag verweist (Muster „GitHub #n“ usw. wertet board-nummern.zsh aus, unverändert wie bisher hier).
# Fehlt die Datei, ist sie kaputt, älter als 24 Stunden oder mehr als eine Stunde in der Zukunft: Rückgabe 1, Grund
# auf stderr
ina_nummern_lesen() {   # <Datei> <jetzt Epoch>
  [[ -e $1 ]] || { print -u2 -r -- "Nummern-Datei ${1:t} fehlt"; return 1 }
  local stand
  stand=$(jq -er 'if (.nummern | type) == "array" and (.nummern | all(type == "number" and . > 0 and floor == .))
    then .zeit | fromdate else error("kaputt") end' $1 2>/dev/null) || { print -u2 -r -- "Nummern-Datei ${1:t} nicht lesbar (kein {\"zeit\", \"nummern\"})"; return 1 }
  if (( $2 - stand > INA_NUMMERN_ALTER )); then
    print -u2 -r -- "Nummern-Datei ${1:t} älter als 24 Stunden (Stand $(ci_wien $stand) Wiener Zeit)"; return 1
  fi
  if (( stand - $2 > 3600 )); then
    print -u2 -r -- "Nummern-Datei ${1:t} mit Zeit in der Zukunft (Stand $(ci_wien $stand) Wiener Zeit)"; return 1
  fi
  jq -c '[.nummern[] | tostring] | unique | map({(.): true}) | add // {}' $1
}

# Zustand je Issue → Zeilen (siehe Kopf)
# issues.json: [{number, pr, autor, labels: [..], comments: [{login, bot, created_at, body}]}]
ina_auswerten() {   # <issues.json> <ausnahmen.json> <jetzt Epoch> [<board.json> aus ina_nummern_lesen]
  TZ=Europe/Vienna jq -r --slurpfile a $2 --argjson jetzt $3 --argjson frist $INA_FRIST \
      --slurpfile b ${4:-/dev/null} \
      --arg ich $INA_EIGENER --arg marke $INA_MARKE --arg labels $INA_LABELS '
    ($a[0]) as $aus | ($b[0] // {}) as $board | ($labels | split(" ")) as $lab
    | def zeit: .created_at | fromdate;
      def wien: strflocaltime("%d.%m.%Y-%H:%M");
      def frage: .body | gsub("https?://[^\\s)]+"; "") | test("\\?");   # Rückfrage: „?“ außerhalb von Links
    sort_by(.number)[] | .number as $n
    | ([.comments[]? | select((.bot | not) and (.login | test("\\[bot\\]$") | not))] | sort_by(zeit)) as $k
    | ([$k[] | select(.login == $ich and (.body | ascii_downcase | contains($marke)))] | last) as $m
    | ([.labels[]? | select(. as $l | $lab | index($l))] | first) as $label
    | (($k | length) > 0 and $k[-1].login == $ich) as $wir_zuletzt
    | if .pr then "kein-issue #\($n)"
      elif $aus[$n | tostring] then "ausgenommen #\($n) (\($aus[$n | tostring]))"
      elif $label then "ausgenommen #\($n) (Label \($label))"
      elif .autor == $ich then "eigenes #\($n)"
      # Markierung zählt nur als letzter Kommentar: eine Antwort des Nutzers oder ein späterer eigener Kommentar
      # (z. B. Zusage nach der Nachfrage) hebt sie auf, die Frist beginnt erst mit einer neuen Markierung
      elif $m != null and ([$k[] | select(zeit > ($m | zeit))] | length) == 0 then
        if $jetzt - ($m | zeit) > $frist then "schliessen #\($n) \($m | zeit | wien)"
        else "wartet #\($n) bis \(($m | zeit) + $frist | wien)" end
      elif $board[$n | tostring] and (($wir_zuletzt and ($k[-1] | frage)) | not)
        then "ausgenommen #\($n) (Nutzer wartet auf uns, offener Board-Eintrag)"
      elif $wir_zuletzt and ($k[-1].body | ascii_downcase | contains($marke) | not)
           and $jetzt - ($k[-1] | zeit) > $frist then
        # nur nach einer Rückfrage warten wir auf den Nutzer (Nachfrage); ohne Rückfrage wartet er auf uns
        # (docs/github-komm.md „Wann Ausnahme“): Zusage gehört auf die Aufgabenliste, sonst schließen
        if $k[-1] | frage then "anfrage #\($n) \($k[-1] | zeit | wien)"
        else "zusage #\($n) \($k[-1] | zeit | wien)" end
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
  local modus=$1 tmp n wann st grund fehler=0 zu=()
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
    # Aufgabenliste nur aus der Nummern-Datei; fehlt sie oder ist sie zu alt: vorsichtshalber nie schließen
    if ! ina_nummern_lesen $INA_NUMMERN $(ci_jetzt) > $tmp/b.json 2> $tmp/b.err; then
      grund=$(head -1 $tmp/b.err)
      mkdir -p ${INA_LOG:h} && print -r -- "$(date '+%F %T') FEHLER Aufgabenliste nicht lesbar: $grund, nichts geschlossen" >> $INA_LOG
      [[ -z $modus ]] && { print "FEHLER Aufgabenliste nicht lesbar ($grund), nichts geschlossen"; return 1 }
      print "Hinweis: Aufgabenliste nicht lesbar ($grund), Ausnahme „offener Board-Eintrag“ nicht geprüft"
      print '{}' > $tmp/b.json
    fi
    ina_auswerten $tmp/i.json $tmp/a.json $(ci_jetzt) $tmp/b.json > $tmp/z.txt || { print "FEHLER Auswertung"; return 2 }
    if [[ $modus == --anfragen ]]; then grep '^anfrage ' $tmp/z.txt; return 0; fi
    print "# Inaktivität $(ci_wien $(ci_jetzt)) (Wiener Zeit)"
    if [[ $modus == --trocken ]]; then
      # „würde schließen“ nennt, ob ein offener Board-Eintrag weiterläuft (Maintainer 20.11.2026)
      awk -v bn="$(jq -r 'keys | join(" ")' $tmp/b.json)" 'BEGIN { n = split(bn, x, " "); for (i = 1; i <= n; i++) b["#" x[i]] = 1 }
        $1 == "schliessen" { w = $3; for (k = 4; k <= NF; k++) w = w " " $k
          print "würde schließen " $2 " (Nachfrage " w ")" ($2 in b ? ", offener Board-Eintrag läuft weiter" : ""); next }
        { print }' $tmp/z.txt
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
      if gh issue close $n -R $INA_R --reason "not planned" --comment "$(ina_schliess_text)" >/dev/null 2>$tmp/err; then
        print "geschlossen #$n (Nachfrage $wann)"
        zu+=("#$n")
        # verlinkte Einträge laufen weiter (Maintainer 20.11.2026), nur Hinweis ohne Board-Inhalt
        jq -e --arg n $n '.[$n]' $tmp/b.json >/dev/null 2>&1 && print "weiter #$n (offener Board-Eintrag läuft weiter)"
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
