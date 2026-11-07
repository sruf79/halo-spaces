#!/bin/zsh
# Prüfung des Issue-Abgleichs (tests/issue-abgleich.sh) ohne Claude, ohne Thunderbird, ohne Netz, im
# Wegwerf-Ordner: eigenes kleines git-Repo, Läufe, Issues und Board als Dateien, gh durch eine Attrappe
# ersetzt. Läuft in der Doku-Prüfung (tests/wochenpruefung.sh --doku) neben tests/ci_runde_test.zsh.
# Aufruf: zsh tests/issue_abgleich_test.zsh   → je Fall eine Zeile OK/FEHLER, Exitcode 1 bei einem Fehler
emulate -L zsh
HIER=${0:A:h}
T=$(mktemp -d) || exit 1
trap 'rm -rf $T' EXIT
FEHLER=0 N=0
ok() { print "OK      $1"; N=$((N + 1)) }
fehler() { print "FEHLER  $1${2:+ – $2}"; FEHLER=1; N=$((N + 1)) }
pruefe() { # <Name> <Befehl …>: Erfolg = Exitcode 0
  local n=$1; shift
  if eval "$@" >/dev/null 2>&1; then ok $n; else fehler $n; fi
}
export HALO_REPO=$T/repo HALO_CI_CACHE=$T/cache HALO_ISSUE_STAND=$T/stand HALO_ISSUE_LISTE=$T/liste.txt
export HALO_JETZT=2026-11-07T12:00+01:00
IA_NUR_FUNKTIONEN=1 source $HIER/issue-abgleich.sh
JETZT=$(ci_jetzt)

# --- Repo: commit <Betreff> <Stunden vor jetzt> ---
git init -q -b main $HALO_REPO
g() { git -C $HALO_REPO -c user.name=Test -c user.email=t@example.invalid "$@" }
commit() {
  local d="@$(( JETZT - $2 * 3600 )) +0100"
  print -r -- $1 >> $HALO_REPO/datei
  GIT_COMMITTER_DATE=$d GIT_AUTHOR_DATE=$d g commit -qam $1 2>/dev/null || { g add datei; GIT_COMMITTER_DATE=$d GIT_AUTHOR_DATE=$d g commit -qm $1 }
  g rev-parse HEAD
}
revert() {   # <sha> <Stunden>
  local d="@$(( JETZT - $2 * 3600 )) +0100"
  GIT_COMMITTER_DATE=$d GIT_AUTHOR_DATE=$d g revert --no-edit $1 >/dev/null 2>&1; g rev-parse HEAD
}
print anfang > $HALO_REPO/datei; g add datei; g commit -qm Anfang
BASIS=$(g rev-parse HEAD)
C1=$(commit "Mailliste: a (GitHub #1)" 48)
C2=$(commit "Kalender: b (GitHub #2, teilweise)" 40)
C5=$(commit "Leiste: e (GitHub #5)" 30)
R5=$(revert $C5 29)
C13=$(commit "Suche: f (GitHub #13)" 28)
R13=$(revert $C13 27)
RR13=$(revert $R13 26)
C6=$(commit "Kopf: g (GitHub #6)" 25)
C8=$(commit "Suche: h (GitHub #8)" 24)
GRUEN=$C8
C7=$(commit "Liste: i (GitHub #7)" 3)
C3=$(commit "Ordner: c; Leiste: d (GitHub #3, #4)" 2)
C9=$(commit "Tests: j (GitHub #9)" 1)
ROT=$C9

# --- Läufe: grüne Vollrunde auf GRUEN, rote (mac) auf ROT ---
lauf() {   # <id> <sha> <mac-Ergebnis>
  jq -n --argjson id $1 --arg sha $2 --arg m $3 '
    def j($n; $c): {name: $n, conclusion: $c, status: "completed", steps: []};
    {databaseId: $id, createdAt: "2026-11-07T08:00:00Z", updatedAt: "2026-11-07T09:00:00Z", status: "completed",
     conclusion: (if $m == "success" then "success" else "failure" end), event: "push", headSha: $sha, displayTitle: "Lauf",
     jobs: [j("changes"; "success"), j("linux (release)"; "success"), j("linux (beta)"; "success"), j("linux (esr)"; "success"),
            j("mac"; $m), j("windows"; "success")]}'
}
{ lauf 1 $GRUEN success; lauf 2 $ROT failure } | jq -s . > $T/l.json

# --- Issues: offen/geschlossen/PR, Kommentare ---
iso() { TZ=UTC date -r $(( JETZT - $1 * 3600 )) +%Y-%m-%dT%H:%M:%SZ }
jq -n --arg spaet $(iso 1) --arg frueh $(iso 50) '
  def offen($k): {state: "open", pr: false, comments: $k};
  {"1": offen([{login: "sruf79", created_at: $frueh, body: "Thanks, I can reproduce it, it will be fixed."}]),
   "2": offen([]), "3": offen([]), "4": offen([]), "5": offen([]), "13": offen([]),
   "6": {state: "closed", pr: false, comments: []}, "7": offen([]),
   "8": offen([{login: "jemand", created_at: $spaet, body: "is it fixed?"}, {login: "sruf79", created_at: $spaet, body: "This is fixed now and comes with the next version."}]),
   "9": {state: "open", pr: true, comments: []},
   "10": offen([]), "11": offen([]), "12": offen([{login: "sruf79", created_at: $frueh, body: "Fixed on main."}])}' > $T/i.json

# --- Auswertung ---
ia_commits_holen "$BASIS..main" > $T/c.tsv
ia_fixes $T/c.tsv > $T/f.txt
pruefe "Nummer im Commit: #1 ist ein Fix" 'grep -q "^1 $C1 " $T/f.txt'
pruefe "Teil-Fix (GitHub #2, teilweise) zählt nicht" '! grep -q "^2 " $T/f.txt'
pruefe "mehrere Nummern in einem Commit: #3 und #4" 'grep -q "^3 $C3 " $T/f.txt && grep -q "^4 $C3 " $T/f.txt'
pruefe "Revert-Commit: #5 zurückgenommen, zählt nicht" '! grep -q "^5 " $T/f.txt'
pruefe "Revert des Reverts: #13 zählt wieder" 'grep -q "^13 $C13 " $T/f.txt'
ia_fixes_json $T/f.txt $T/l.json > $T/f.json
ia_auswerten $T/f.json $T/i.json > $T/a.txt
pruefe "Fix mit grüner CI, ohne Antwort: antworten #1" 'grep -q "^antworten #1 ${C1[1,7]} 05.11.2026-12:00 " $T/a.txt'
pruefe "Antwort vor dem Fix zählt nicht als „behoben“" '! grep -q "^beantwortet #1" $T/a.txt'
pruefe "Fix mit grüner CI: schliessen #1, #13" 'grep -qx "schliessen #1" $T/a.txt && grep -qx "schliessen #13" $T/a.txt'
pruefe "CI rot (Fix nach der grünen Runde): #3, #4, #7 warten" 'grep -q "^wartet-ci #3" $T/a.txt && grep -q "^wartet-ci #4" $T/a.txt && grep -q "^wartet-ci #7 ${C7[1,7]}" $T/a.txt && ! grep -q "^antworten #7" $T/a.txt'
pruefe "Issue schon beantwortet: #8 nicht antworten, aber schließen" 'grep -qx "beantwortet #8" $T/a.txt && grep -qx "schliessen #8" $T/a.txt && ! grep -q "^antworten #8" $T/a.txt'
pruefe "Nummer ohne offenes Issue: #6 geschlossen, #9 Pull Request" 'grep -qx "geschlossen #6" $T/a.txt && grep -qx "kein-issue #9" $T/a.txt && ! grep -q "schliessen #[69]" $T/a.txt'
pruefe "Teil-Fix und Revert erscheinen in keiner Liste" '! grep -q "#[25]\$" $T/a.txt && ! grep -q "#[25] " $T/a.txt'
pruefe "Kennzahl: #1 und #13 (Fix älter als 1 Tag, ohne Antwort), nicht #8" '[[ $(ia_kennzahl $T/a.txt) == 2 ]]'

# --- Board-Abgleich ---
jq -n --arg c "committet ${C1[1,7]}, wartet auf Push/CI" '{items: [
  {id: "A", status: "Done", content: {body: "Wo: …\nGitHub-Issue #10"}},
  {id: "B", status: "Todo", content: {body: "GitHub-Issue #11"}},
  {id: "C", status: "In Progress", content: {body: "GitHub-Issue #12\n\n\($c)"}},
  {id: "D", status: "Done", content: {body: "GitHub-Issue #1"}},
  {id: "E", status: "Done", content: {body: "GitHub-Issue #6"}}]}' > $T/b.json
pruefe "Board-Nummern gelesen" '[[ "$(ia_board_nummern $T/b.json | tr "\n" " ")" == "1 10 11 12 6 " ]]'
ia_board_hinweise $T/b.json $T/i.json "1 3 4 6 7 8 9 13" > $T/h.txt
pruefe "Board Done, Issue offen ohne Antwort: Hinweis #10" 'grep -qx "board-hinweis #10 A Done" $T/h.txt'
pruefe "Board ohne Done/Commit, beantwortet, bekannt oder geschlossen: kein Hinweis" '[[ $(wc -l < $T/h.txt) -eq 1 ]]'

# --- Schließen (publish.sh) mit gh-Attrappe ---
gh() {
  print -r -- "$*" >> $T/aufrufe
  case $1 in
    api) local n=${${2##*/issues/}%%[/?]*}
         jq -e --arg n $n '.[$n]' $T/i.json >/dev/null || { print -u2 "HTTP 404: Not Found"; return 1 }
         jq -r --arg n $n '.[$n] | if .pr then "pr" else .state end' $T/i.json ;;
    issue) return 0 ;;
  esac
}
: > $T/aufrufe
ia_schliessen $BASIS main 9.9.9 --trocken > $T/s.txt
pruefe "Trockenlauf: würde #1, #3, #4, #7, #8, #13 schließen" '[[ "$(grep "^würde" $T/s.txt | sort | tr "\n" " ")" == "würde schließen #1 würde schließen #13 würde schließen #3 würde schließen #4 würde schließen #7 würde schließen #8 " ]]'
pruefe "Trockenlauf: #6 schon geschlossen, #9 kein Issue, nichts geschlossen" 'grep -qx "schon geschlossen #6" $T/s.txt && grep -qx "kein Issue #9" $T/s.txt && ! grep -q "^issue close" $T/aufrufe'
: > $T/aufrufe
ia_schliessen $C5 main 9.9.9 > $T/s2.txt
pruefe "Schließen: gh issue close mit completed und „Fixed in 9.9.9“" 'grep -q "^issue close 13 -R sruf79/halo-spaces --reason completed --comment Fixed in 9.9.9\." $T/aufrufe'
pruefe "Schließen: Teil-Fix, Revert und Geschlossene bleiben unberührt" '! grep -q "^issue close [2569] " $T/aufrufe && [[ $(grep -c "^issue close" $T/aufrufe) == 5 ]]'

(( FEHLER )) && exit 1
print "OK Issue-Abgleich: $N Fälle grün"
