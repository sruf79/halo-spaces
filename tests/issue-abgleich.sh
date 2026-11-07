#!/bin/zsh
# Issue-Abgleich: behobene GitHub-Issues den Nutzern mitteilen (Entscheidung des Maintainers vom
# 7.11.2026, Sitzung „agents.md von Neon“, Wortlaut in ENTSCHEIDUNGEN.md; docs/github-komm.md „Status“).
# Ohne Claude, nur git, gh, jq. Fix-Commits enden auf „(GitHub #n)“ bzw. „(GitHub #n, #m)“; ein
# Teil-Fix „(GitHub #n, teilweise)“ zählt nie. Zurückgenommene Commits (git revert) zählen nicht.
#
#   issue-abgleich.sh [--trocken]           Abgleich der Commits auf origin/main seit dem Stand:
#                                           Liste nach ~/halo-aufgaben/issue-abgleich.txt (--trocken: nur
#                                           Ausgabe, Stand und Liste bleiben unberührt)
#   issue-abgleich.sh --kennzahl            nur die Zahl „offen, Fix älter als 1 Tag, ohne Antwort“ (trocken)
#   issue-abgleich.sh schliessen <von> <bis> <version> [--trocken]
#                                           für publish.sh: Issues aus git log <von>..<bis> mit
#                                           „Fixed in <version>“ schließen (--trocken: nur anzeigen)
#
# Zeilen der Liste (und der Ausgabe):
#   antworten #n <Commit> <Wiener Zeit> <Epoch>   offen, Fix auf main mit grüner CI, Antwort „behoben“ fehlt
#   schliessen #n                                 offen, Fix auf main mit grüner CI → schließt publish.sh beim Release
#   beantwortet #n | wartet-ci #n <Commit> | geschlossen #n | kein-issue #n
#   board-hinweis #n <Item-id> <Status>           Board-Eintrag mit „GitHub-Issue #n“ ist Done bzw. hat einen
#                                                 Commit, das Issue ist offen ohne „behoben“-Antwort und kein
#                                                 Commit trägt „(GitHub #n)“ (nur Hinweis)
#   board-fehler <Grund>                          Board nicht lesbar (bricht nichts ab)
#   kennzahl issue_ohne_antwort <Zahl>            „antworten“-Zeilen mit Fix älter als 24 Stunden
# „Grüne CI“: ein Lauf von test.yml auf main, der den Fix enthält und als grüne Vollrunde zählt (alle
# Testjobs success, Job-Ergebnisse wie in tests/ci-runde.zsh, nie die Gesamt-Conclusion).
# „behoben“-Antwort: Kommentar von sruf79 nach dem (ersten grünen) Fix-Commit mit „fixed“ oder „behoben“.
# Stand ~/halo-aufgaben/issue-abgleich.stand („seit=<Commit>“): Beginn der Suche; fehlt er, das
# vorletzte Release-Tag. Er rückt auf ein neueres Release-Tag vor, sobald kein Issue aus den Commits
# bis dorthin mehr offen ist.
# Aufrufer: tests/github-vorpruefung.sh (weckt die GitHub-Routine), tests/wochenpruefung.sh (Kennzahl),
# publish.sh (schliessen). Kopie in ~/.config/halo-spaces/ (tests/mac-mini-setup.sh, SK_PAARE).
# Test ohne Netz: zsh tests/issue_abgleich_test.zsh (lädt diese Datei mit IA_NUR_FUNKTIONEN=1).

IA_R=sruf79/halo-spaces
IA_EIGENER=sruf79
IA_REPO=${HALO_REPO:-$HOME/halo-spaces}
IA_STAND=${HALO_ISSUE_STAND:-$HOME/halo-aufgaben/issue-abgleich.stand}
IA_LISTE=${HALO_ISSUE_LISTE:-$HOME/halo-aufgaben/issue-abgleich.txt}
IA_ANTWORT='fixed|behoben'
# CI_JQ, ci_jetzt, ci_wien, ci_laeufe_holen
source ${${(%):-%x}:A:h}/ci-runde.zsh

# --- reine Auswertung (Daten aus Dateien) ---

# git log → TSV „<sha>\t<Epoch>\t<Betreff>\t<zurückgenommene Commits>“ (neueste zuerst)
ia_commits_holen() {   # <Bereich>
  git -C $IA_REPO log --format='%H%x1f%ct%x1f%s%x1f%b%x1e' $1 | awk 'BEGIN { RS = "\036"; FS = "\037" }
    NF >= 3 { sha = $1; gsub(/[\n\r]/, "", sha); b = $4; rev = ""
      while (match(b, /This reverts commit [0-9a-f]+/)) { rev = rev (rev == "" ? "" : " ") substr(b, RSTART + 20, RLENGTH - 20); b = substr(b, RSTART + RLENGTH) }
      printf "%s\t%s\t%s\t%s\n", sha, $2, $3, rev }'
}

# volle Fixe „<n> <sha> <Epoch>“ aus der TSV (neueste zuerst): ohne Teil-Fixe, ohne Revert-Commits und
# ohne zurückgenommene Commits (ein Revert, der selbst zurückgenommen wurde, nimmt nichts zurück)
ia_fixes() {   # <commits.tsv>
  emulate -L zsh
  local -A weg
  local sha t s rev r rest nums n
  while IFS=$'\t' read -r sha t s rev; do
    [[ -n ${weg[$sha]} ]] && continue
    for r in ${=rev}; do weg[$r]=1; done
    [[ -n $rev || $s == Revert\ * ]] && continue
    rest=$s
    while [[ $rest =~ '\(GitHub (#[0-9]+(, #[0-9]+)*)(, teilweise)?\)' ]]; do
      nums=$match[1]
      rest=${rest#*"$MATCH"}
      [[ -n $match[3] ]] && continue
      for n in ${(s:, :)nums}; do print -r -- "${n#\#} $sha $t"; done
    done
  done < $1
}

# Köpfe (headSha) grüner Vollrunden aus der Läufe-Datei von ci_laeufe_holen
ia_gruene_koepfe() { jq -r "$CI_JQ"' [.[] | select(gruen) | .headSha] | unique[]' $1 }
ia_enthalten() { git -C $IA_REPO merge-base --is-ancestor $1 $2 2>/dev/null }

# Fixe → JSON [{n, sha, t, gruen}]
ia_fixes_json() {   # <fixes> <laeufe.json>
  emulate -L zsh
  local n sha t g k koepfe=($(ia_gruene_koepfe $2))
  local -A cache
  {
    while read -r n sha t; do
      if [[ -z ${cache[$sha]} ]]; then
        cache[$sha]=false
        for k in $koepfe; do ia_enthalten $sha $k && { cache[$sha]=true; break }; done
      fi
      print -r -- "{\"n\": $n, \"sha\": \"$sha\", \"t\": $t, \"gruen\": ${cache[$sha]}}"
    done < $1
  } | jq -s .
}

# Auswertung → Zeilen (siehe Kopf); issues.json: {"<n>": {state, pr, comments: [{login, created_at, body}]}}
ia_auswerten() {   # <fixes.json> <issues.json>
  TZ=Europe/Vienna jq -r --slurpfile i $2 --arg ich $IA_EIGENER --arg re $IA_ANTWORT '
    ($i[0]) as $iss
    | group_by(.n)[] | .[0].n as $n | ($iss[$n | tostring]) as $is
    | ([.[] | select(.gruen)] | sort_by(.t) | first) as $g
    | (sort_by(.t) | last) as $neu
    | if $is == null or $is.pr then "kein-issue #\($n)"
      elif $is.state != "open" then "geschlossen #\($n)"
      elif $g == null then "wartet-ci #\($n) \($neu.sha[:7])"
      elif any($is.comments[]?; .login == $ich and (.created_at | fromdate) >= $g.t and (.body | test($re; "i")))
        then "beantwortet #\($n)\nschliessen #\($n)"
      else "antworten #\($n) \($g.sha[:7]) \($g.t | strflocaltime("%d.%m.%Y-%H:%M")) \($g.t)\nschliessen #\($n)" end' $1
}

# Board-Einträge mit „GitHub-Issue #n“: Nummern (für den Abruf der Issues)
ia_board_nummern() { jq -r '[.items[] | (.content.body // "") | scan("GitHub-Issue #([0-9]+)")[0]] | unique[]' $1 }
# Hinweise: Eintrag Done bzw. mit Commit, Issue offen ohne „behoben“-Antwort, Nummer nicht schon in den Fixen
ia_board_hinweise() {   # <board.json> <issues.json> <bekannte Nummern, durch Leerzeichen getrennt>
  jq -r --slurpfile i $2 --arg ich $IA_EIGENER --arg re $IA_ANTWORT --arg bek " $3 " '
    ($i[0]) as $iss
    | .items[] | select(.status == "Done" or ((.content.body // "") | test("committet|[Cc]ommit [0-9a-f]{7}")))
    | . as $it | (.content.body // "") | [scan("GitHub-Issue #([0-9]+)")[0]] | unique[]
    | . as $n | ($iss[$n]) as $is
    | select($bek | contains(" \($n) ") | not)
    | select($is != null and ($is.pr | not) and $is.state == "open")
    | select(any($is.comments[]?; .login == $ich and (.body | test($re; "i"))) | not)
    | "board-hinweis #\($n) \($it.id) \($it.status // "-")"' $1
}

# „antworten“-Zeilen mit Fix älter als 24 Stunden
ia_kennzahl() {   # <Auswertung>
  local jetzt=$(ci_jetzt)
  awk -v j=$jetzt '$1 == "antworten" && $5 + 86400 < j { n++ } END { print n + 0 }' $1
}

# --- Abruf (gh) ---

# Issues → issues.json; Rückgabe 1, wenn gh nicht lesbar ist
ia_issues_holen() {   # <Datei> <Nummer …>
  emulate -L zsh
  local datei=$1 n e k; shift
  print -r -- '{}' > $datei
  for n in ${(u)@}; do
    if ! e=$(gh api repos/$IA_R/issues/$n --jq '{state, pr: (.pull_request != null)}' 2>$datei.err); then
      grep -q 'Not Found\|404' $datei.err || return 1
      continue
    fi
    k=$(gh api "repos/$IA_R/issues/$n/comments?per_page=100" --paginate --jq '.[] | {login: .user.login, created_at, body}' | jq -s .) || return 1
    jq --arg n $n --argjson e "$e" --argjson k "$k" '. + {($n): ($e + {comments: $k})}' $datei > $datei.tmp && mv $datei.tmp $datei
  done
  rm -f $datei.err
}

ia_gh_token() {   # gh ohne Anmeldung: Token aus hosts.yml wie in der geplanten Aufgabe
  gh api user >/dev/null 2>&1 && return
  local t=$(grep -o 'ghp_[A-Za-z0-9]*' ~/.config/gh/hosts.yml 2>/dev/null | head -1)
  [[ -n $t ]] && export GH_TOKEN=$t
}

# Text beim Schließen (englisch, kurz, ohne Interna)
ia_schliess_text() { print -r -- "Fixed in $1. Thunderbird installs the update automatically. Thanks for reporting!" }

# Issues aus git log <von>..<bis> schließen. Zeilen „würde schließen #n“, „geschlossen #n“,
# „schon geschlossen #n“, „kein Issue #n“, „FEHLER #n: …“; Rückgabe 1 bei einem FEHLER
ia_schliessen() {   # <von> <bis> <version> [--trocken]
  emulate -L zsh
  local von=$1 bis=$2 version=$3 trocken=$4 tmp n st fehler=0
  tmp=$(mktemp) || return 1
  ia_commits_holen "$von..$bis" > $tmp.tsv || { print "FEHLER git log $von..$bis"; rm -f $tmp*; return 1 }
  for n in ${(u)${(f)"$(ia_fixes $tmp.tsv | cut -d' ' -f1)"}}; do
    [[ -n $n ]] || continue
    if ! st=$(gh api repos/$IA_R/issues/$n --jq 'if .pull_request then "pr" else .state end' 2>$tmp.err); then
      if grep -q 'Not Found\|404' $tmp.err; then print "kein Issue #$n"; else print "FEHLER #$n: nicht lesbar"; fehler=1; fi
      continue
    fi
    case $st in
      pr)     print "kein Issue #$n" ;;
      closed) print "schon geschlossen #$n" ;;
      open)
        if [[ $trocken == --trocken ]]; then
          print "würde schließen #$n"
        elif gh issue close $n -R $IA_R --reason completed --comment "$(ia_schliess_text $version)" >/dev/null 2>$tmp.err; then
          print "geschlossen #$n"
        else
          print "FEHLER #$n: $(head -1 $tmp.err)"; fehler=1
        fi ;;
      *)      print "FEHLER #$n: Zustand „$st“"; fehler=1 ;;
    esac
  done
  rm -f $tmp*
  return $fehler
}

# --- Abgleich ---
ia_abgleich() {   # [--trocken] [--kennzahl]
  emulate -L zsh
  setopt pipe_fail
  local trocken= kennzahl= a tmp seit tag n fixnr=() boardnr=() bek
  for a; do case $a in --trocken) trocken=1;; --kennzahl) kennzahl=1 trocken=1;; esac; done
  tmp=$(mktemp -d) || return 2
  {
    git -C $IA_REPO fetch -q origin main --tags 2>/dev/null || print -u2 "Hinweis: git fetch nicht möglich, lokaler Stand"
    seit=$(sed -n 's/^seit=//p' $IA_STAND 2>/dev/null | head -1)
    [[ -n $seit ]] || seit=$(git -C $IA_REPO tag -l 'v[0-9]*' --sort=-v:refname | sed -n 2p)
    [[ -n $seit ]] && git -C $IA_REPO rev-parse -q --verify "$seit^{commit}" >/dev/null || { print "FEHLER Stand „$seit“ unbekannt"; return 2 }
    ia_commits_holen "$seit..origin/main" > $tmp/c.tsv || { print "FEHLER git log $seit..origin/main"; return 2 }
    ia_fixes $tmp/c.tsv > $tmp/f.txt
    fixnr=(${(u)${(f)"$(cut -d' ' -f1 $tmp/f.txt)"}})
    ci_laeufe_holen $tmp/l.json 60 || { print "FEHLER CI-Läufe nicht lesbar (gh)"; return 2 }
    if gh project item-list 1 --owner sruf79 --limit 1000 --format json > $tmp/b.json 2>$tmp/b.err && jq -e .items $tmp/b.json >/dev/null 2>&1; then
      boardnr=($(ia_board_nummern $tmp/b.json))
    else
      print "board-fehler ${$(head -1 $tmp/b.err):-unlesbar}" > $tmp/board.txt
      rm -f $tmp/b.json
    fi
    ia_issues_holen $tmp/i.json $fixnr $boardnr || { print "FEHLER Issues nicht lesbar (gh)"; return 2 }
    ia_fixes_json $tmp/f.txt $tmp/l.json > $tmp/f.json
    ia_auswerten $tmp/f.json $tmp/i.json > $tmp/a.txt
    [[ -s $tmp/b.json ]] && ia_board_hinweise $tmp/b.json $tmp/i.json "$fixnr" >> $tmp/board.txt
    if [[ -n $kennzahl ]]; then ia_kennzahl $tmp/a.txt; return 0; fi
    {
      print "# Issue-Abgleich $(ci_wien $(ci_jetzt)) (Wiener Zeit), Commits $seit..origin/main"
      cat $tmp/a.txt $tmp/board.txt 2>/dev/null
      print "kennzahl issue_ohne_antwort $(ia_kennzahl $tmp/a.txt)"
    } > $tmp/liste.txt
    cat $tmp/liste.txt
    [[ -n $trocken ]] && return 0
    mkdir -p ${IA_LISTE:h} && cp $tmp/liste.txt $IA_LISTE
    # Stand vorrücken: neuestes Release-Tag nach „seit“, bis zu dem kein Issue mehr offen ist
    for tag in $(git -C $IA_REPO tag -l 'v[0-9]*' --sort=-v:refname --contains $seit); do
      [[ $(git -C $IA_REPO rev-parse $tag^{commit}) == $(git -C $IA_REPO rev-parse $seit^{commit}) ]] && break
      ia_commits_holen "$seit..$tag" > $tmp/c2.tsv
      bek=(${(u)${(f)"$(ia_fixes $tmp/c2.tsv | cut -d' ' -f1)"}})
      if ! jq -e --argjson n "[${(j:,:)${bek:-}}]" '[$n[] | tostring as $k | .[$k] | select(. != null and (.pr | not) and .state == "open")] | length == 0' $tmp/i.json >/dev/null; then
        continue
      fi
      print "seit=$tag" > $IA_STAND
      break
    done
    return 0
  } always { rm -rf $tmp }
}

[[ -n $IA_NUR_FUNKTIONEN ]] && return 0
emulate -L zsh
path=(~/.local/bin /opt/homebrew/bin /usr/local/bin $path)
ia_gh_token
case $1 in
  schliessen)
    [[ -n $4 ]] || { print -u2 "Aufruf: ${0:t} schliessen <von> <bis> <version> [--trocken]"; exit 2 }
    ia_schliessen $2 $3 $4 $5; exit $? ;;
  ''|--trocken|--kennzahl) ia_abgleich $@; exit $? ;;
  *) sed -n '/^#   issue-abgleich/,/^#$/s/^# //p' $0; exit 2 ;;
esac
