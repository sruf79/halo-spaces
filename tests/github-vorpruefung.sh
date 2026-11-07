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

# Pause mit Ablaufzeit (~/halo-nacht/pausen.txt, Routine github-komm): wie „nichts neu“
if [[ -r ${0:A:h}/lauf-hilfen.zsh ]] && source ${0:A:h}/lauf-hilfen.zsh 2>/dev/null && PG=$(pause_aktiv github-komm); then
  print "NICHTS NEU (pausiert $PG)"
  [[ -z $TROCKEN ]] && { mkdir -p ${PROTOKOLL:h}
    print -r -- "$(date '+%F %T') ÜBERSPRUNGEN github-kommunikation pausiert $PG" >> $PROTOKOLL; }
  exit 0
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
FUNDE=(${(u)FUNDE:#})

if (( $#FUNDE )); then
  print "NEU seit $T: $#FUNDE Fund(e)"
  print -rl -- $FUNDE
  exit 1
fi
print "NICHTS NEU seit $T"
if [[ -z $TROCKEN ]]; then
  mkdir -p ${PROTOKOLL:h}
  print -r -- "$(date '+%F %T') ÜBERSPRUNGEN github-kommunikation nichts neu seit $T" >> $PROTOKOLL
fi
exit 0
