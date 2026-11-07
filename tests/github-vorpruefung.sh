#!/bin/zsh
# Vorprüfung der geplanten Aufgabe „halo.spaces: GitHub-Kommunikation“
# (Desktop-App, halo-github-kommunikation; tests/MAC-MINI.md Abschnitt 17a,
# AGENTS.md „Feste Routine“; Entscheidung des Maintainers vom 6.11.2026, Sitzung
# global.design.comparison, Wortlaut: „ja, punkt 2 und 3 umsetzen.“). Ohne
# Claude, nur gh: gibt es seit der letzten Prüfung etwas Neues von anderen?
#   github-vorpruefung.sh [--trocken]
#   --trocken    nichts ins Protokoll schreiben
# Ausgabe: erste Zeile „NICHTS NEU …“ (Exitcode 0) oder „NEU …“ (Exitcode 1),
# darunter je Fund eine Zeile. Kann etwas nicht gelesen werden (gh, Zeitmarke):
# „NEU (Prüfung nicht möglich: …)“, Exitcode 2 – im Zweifel normal prüfen.
# Referenzzeit: „Letzte Prüfung: <UTC>“ in ~/halo-aufgaben/github-komm-stand.md
# (die geplante Aufgabe aktualisiert sie nach jeder Prüfung; eine Vorprüfung mit
# „nichts neu“ lässt sie unberührt, so bleibt kein Fund liegen).
# Gezählt wird Neues von anderen als sruf79: neue Issues/PRs, neue Kommentare
# (Issues, PRs, Code-Review), Forks, die neu sind oder seit der Referenzzeit
# gepusht wurden. Eigene Antworten und Label-Änderungen zählen nicht.
# „Nichts neu“ schreibt „ÜBERSPRUNGEN github-kommunikation …“ nach
# ~/halo-nacht/uebersprungen.log (für die Wochenprüfung), kein Push aufs iPhone.
# Dazu der Issue-Abgleich (tests/issue-abgleich.sh, Entscheidung des Maintainers vom 7.11.2026):
# offene Issues mit Fix auf main und grüner CI ohne „behoben“-Antwort zählen als Fund; die Liste
# steht danach in ~/halo-aufgaben/issue-abgleich.txt (Zeilen „antworten #n …“). Ist der Abgleich
# nicht möglich, steht nur ein Hinweis in der Ausgabe (kein Fund).
# Die Datei wird nach ~/.config/halo-spaces/ kopiert (tests/mac-mini-setup.sh).
emulate -L zsh
setopt pipe_fail
path=(~/.local/bin /opt/homebrew/bin /usr/local/bin $path)

TROCKEN=; [[ $1 == --trocken ]] && TROCKEN=1
R=sruf79/halo-spaces
EIGENER=sruf79
STAND=${HALO_GITHUB_STAND:-$HOME/halo-aufgaben/github-komm-stand.md}
PROTOKOLL=${HALO_UEBERSPRUNGEN_LOG:-$HOME/halo-nacht/uebersprungen.log}

# gh ohne Anmeldung: Token aus hosts.yml wie in der geplanten Aufgabe
gh api user >/dev/null 2>&1 || {
  t=$(grep -o 'ghp_[A-Za-z0-9]*' ~/.config/gh/hosts.yml 2>/dev/null | head -1)
  [[ -n $t ]] && export GH_TOKEN=$t
}

# Pause (eine Datei: ~/halo-nacht/pausen.txt, Routine github-komm): wie „nichts neu“; im Trockenlauf
# schreibt pause_start nichts (LOG/uebersprungen.log auf /dev/null)
if [[ -r ${0:A:h}/lauf-hilfen.zsh ]] && source ${0:A:h}/lauf-hilfen.zsh 2>/dev/null; then
  LOG=${PROTOKOLL}
  if [[ -n $TROCKEN ]]; then
    HALO_UEBERSPRUNGEN_LOG=/dev/null LOG=/dev/null HALO_PAUSE_TROCKEN=1 pause_start github-komm && { print "NICHTS NEU (pausiert $PAUSE_GRUND)"; exit 0 }
  else
    mkdir -p ${PROTOKOLL:h}
    pause_start github-komm && { print "NICHTS NEU (pausiert $PAUSE_GRUND)"; exit 0 }
  fi
fi

zweifel() { print "NEU (Prüfung nicht möglich: $1)"; exit 2 }

[[ -r $STAND ]] || zweifel "Stand $STAND fehlt"
T=$(sed -n 's/^Letzte Prüfung: *\([0-9T:-]*Z\).*/\1/p' $STAND | head -1)
[[ -n $T ]] || zweifel "„Letzte Prüfung“ im Stand nicht lesbar"
# die API will Sekunden: 2026-11-06T08:01Z → 2026-11-06T08:01:00Z
[[ $T == [0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]T[0-9][0-9]:[0-9][0-9]Z ]] && T=${T%Z}:00Z
[[ $T == [0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]T[0-9][0-9]:[0-9][0-9]:[0-9][0-9]Z ]] || zweifel "Zeitmarke „$T“ unlesbar"

FUNDE=()
# neue Issues und Pull Requests (die Liste enthält beide, created_at ab T)
neu=$(gh api "repos/$R/issues?state=all&since=$T&per_page=100" --paginate \
  --jq ".[] | select(.created_at > \"$T\" and .user.login != \"$EIGENER\") | \"#\\(.number) neu von \\(.user.login): \\(.title[:60])\"") \
  || zweifel "Issues nicht lesbar"
FUNDE+=(${(f)neu})
# neue Kommentare an Issues und PRs, Code-Review-Kommentare
for pfad in issues/comments pulls/comments; do
  k=$(gh api "repos/$R/$pfad?since=$T&per_page=100" --paginate \
    --jq ".[] | select(.user.login != \"$EIGENER\") | \"Kommentar von \\(.user.login) (\\(.html_url | sub(\"^.*/\"; \"\") | .[:40]))\"") \
    || zweifel "$pfad nicht lesbar"
  FUNDE+=(${(f)k})
done
# abgeschlossene Reviews anderer
for nr in $(gh api "repos/$R/pulls?state=open&per_page=50" --jq '.[].number' 2>/dev/null); do
  rv=$(gh api "repos/$R/pulls/$nr/reviews" --jq ".[] | select(.submitted_at > \"$T\" and .user.login != \"$EIGENER\") | \"Review von \\(.user.login) an PR #$nr\"" 2>/dev/null)
  FUNDE+=(${(f)rv})
done
# Forks: neu oder seit T gepusht
f=$(gh api "repos/$R/forks?per_page=100" --paginate \
  --jq ".[] | select(.created_at > \"$T\" or .pushed_at > \"$T\") | \"Fork \\(.full_name): gepusht \\(.pushed_at)\"") \
  || zweifel "Forks nicht lesbar"
FUNDE+=(${(f)f})
# behobene Issues ohne Antwort (Issue-Abgleich; --trocken lässt Liste und Stand unberührt)
HINWEIS=
if ABGL=$(zsh ${0:A:h}/issue-abgleich.sh ${TROCKEN:+--trocken} 2>&1); then
  FUNDE+=(${(f)"$(print -r -- $ABGL | sed -n 's/^antworten \(#[0-9]*\) \([0-9a-f]*\) .*/Issue \1: Fix \2 auf main mit grüner CI, Antwort „behoben“ fehlt (Liste ~\/halo-aufgaben\/issue-abgleich.txt)/p')"})
else
  HINWEIS="Hinweis: Issue-Abgleich nicht möglich (${${(f)ABGL}[-1]})"
fi
FUNDE=(${(u)FUNDE:#})

if (( $#FUNDE )); then
  print "NEU seit $T: $#FUNDE Fund(e)"
  print -rl -- $FUNDE $HINWEIS
  exit 1
fi
print "NICHTS NEU seit $T"
[[ -n $HINWEIS ]] && print -r -- $HINWEIS
if [[ -z $TROCKEN ]]; then
  mkdir -p ${PROTOKOLL:h}
  print -r -- "$(date '+%F %T') ÜBERSPRUNGEN github-kommunikation nichts neu seit $T" >> $PROTOKOLL
fi
exit 0
