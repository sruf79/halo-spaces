#!/bin/zsh
# Aufräumen unbenötigter Reste mit Risiko null (Maintainer 14.11.2026, Gespräch neon, Wortlaut in
# ENTSCHEIDUNGEN.md: „unbenötigte reste sollten immer am ende des nachtlaufs automatisch aufgeräumt werden
# ohne nachfrage wenn das risiko null ist“). Läuft am Ende des Nachtlaufs (tests/nachtlauf-auftrag.md
# Schritt 6a, Rückfall in tests/nachtlauf.sh) und von Hand. Kopie in ~/.config/halo-spaces/ (SK_PAARE in
# tests/mac-mini-setup.sh).
#   aufraeumen.sh [--trocken] [--ohne-zweige] [<Repo-Ordner>]
#     --trocken: nur auflisten, nichts entfernen; --ohne-zweige: Teil c) auslassen (kein Netz)
# Entfernt wird NUR, wenn ALLE Bedingungen erfüllt sind; sonst bleibt der Rest stehen und erscheint unter
# „Rest mit Risiko, nichts angefasst“:
#   a) Arbeitskopien von Hilfsagenten (git worktree list, Pfad …/.claude/worktrees/agent-*): nichts
#      Ungespeichertes und nichts Unversioniertes (git status --porcelain leer); ignorierte Dateien nur
#      erzeugte (dist/, extension/theme.css, __pycache__/, node_modules/, *.xpi, *.pyc, tests/shots/,
#      .DS_Store); jeder Commit der Kopie steckt in origin/main (Vorfahr oder per git cherry gleich);
#      nicht gesperrt (git worktree lock) von einem lebenden Prozess, kein Prozess mit Arbeitsordner darin,
#      kein Protokoll des Hilfsagenten jünger als 6 Stunden, keine Datei darin jünger als 6 Stunden.
#      Entfernen mit git worktree remove (ohne --force), danach git worktree prune. Der Zweig der Kopie
#      wird nur mit git branch -d gelöscht (git lehnt ab, wenn er nicht in main enthalten ist).
#   a2) Arbeitskopien der Worker des Auslastungswächters (~/halo-worker/worker-*, Maintainer 19.11.2026, „1. ja“ auf
#      neons Vorschlag; bis dahin blieben rund 170 leere Kopien liegen): dieselben Bedingungen wie a), ohne die Protokolle
#      der Hilfsagenten; repo.conf zählt als ersetzbar, wenn sie der des Repos gleicht. „In main“ heißt auch: jeder
#      Commit per Patch-Vergleich (git cherry, wie git patch-id) schon in origin/main, etwa nach cherry-pick oder rebase.
#      Dann wird auch der Zweig der Kopie gelöscht (git branch -D, weil git branch -d übernommene Kopien nicht erkennt).
#   b) Sperrdateien ~/halo-nacht/*.lock: die Prozessnummer darin existiert nicht (ps) und die Datei ist
#      älter als 1 Stunde; unmittelbar vor dem Löschen wird der Inhalt erneut verglichen.
#   c) Zweige claude/…, rest/…, pruef/… (lokal und auf GitHub) und lokale worktree-agent-… ohne
#      Arbeitskopie: nur ohne Commit über origin/main hinaus (Vorfahr von origin/main), ohne offenen Pull
#      Request, nicht in einer Arbeitskopie ausgecheckt. Lokal git branch -d, auf GitHub push --delete.
#      Worker-Zweige pruef/worker-… zählen auch dann als enthalten, wenn jeder Commit per Patch-Vergleich (git cherry)
#      in origin/main steckt (lokal dann git branch -D).
#      Ersetzt zweige_aufraeumen aus tests/nachtlauf.sh (Entscheidung vom 7.11.2026, nur claude/…).
#   Nichts anderes: keine Berichte, Bilder, Sitzungen, Sicherungen, kein dist/, nichts im Arbeitsbaum
#   von main.
# Ausgabe: „Aufgeräumt: …“ und „Rest mit Risiko, nichts angefasst: …“ als Listen; je Entfernung eine
# Zeile in $LOG (falls gesetzt). Exitcode 0, außer der Repo-Ordner fehlt (2).
# Zum Proben: HALO_NACHT_DIR (Sperrdateien), HALO_CLAUDE_PROJEKTE (Protokolle der Hilfsagenten),
# HALO_AUFR_STUNDEN (Mindestalter Arbeitskopie, Standard 6), HALO_AUFR_LOCK_MIN (Standard 60),
# HALO_AUFR_PRS (Datei mit Namen offener PR-Zweige statt gh), HALO_WORKER_DIR (Arbeitskopien der Worker).
emulate -L zsh
setopt extendedglob nullglob
path=(~/.local/bin /opt/homebrew/bin /usr/local/bin $path)

TROCKEN= OHNE_ZWEIGE=
while [[ $1 == --* ]]; do
  case $1 in
    --trocken) TROCKEN=1 ;;
    --ohne-zweige) OHNE_ZWEIGE=1 ;;
    *) print -u2 "FEHLER: unbekannte Option $1"; exit 2 ;;
  esac
  shift
done
REPO=${1:-$HOME/halo-spaces}
REPO=${REPO:A}
if [[ ! -e $REPO/.git ]]; then
  print -u2 "FEHLER: kein Git-Repo unter „$REPO“"; exit 2
fi
NACHT=${HALO_NACHT_DIR:-$HOME/halo-nacht}
PROJEKTE=${HALO_CLAUDE_PROJEKTE:-$HOME/.claude/projects}
STUNDEN=${HALO_AUFR_STUNDEN:-6}
LOCK_MIN=${HALO_AUFR_LOCK_MIN:-60}
WORKER_DIR=${HALO_WORKER_DIR:-$HOME/halo-worker}
WORKER_DIR=${WORKER_DIR:A}
JETZT=$(date +%s)

WEG=() REST=()
weg() {   # <Text> – entfernt (bzw. im Probelauf: würde entfernt)
  WEG+=("$1")
  [[ -z $TROCKEN && -n $LOG ]] && print -r -- "$(date '+%F %T') AUFRÄUMEN entfernt: $1" >> $LOG
  return 0
}
rest() { REST+=("$1") }
g() { git -C $REPO "$@" }
kurz() { print -r -- ${1/#$HOME/~} }
lebt() { [[ $1 == <-> ]] && ps -p $1 >/dev/null 2>&1 }

# Netz: Stand von GitHub holen; scheitert es, bleiben alle Zweige auf GitHub stehen
NETZ=1
if [[ -n $OHNE_ZWEIGE ]]; then NETZ=0
else g fetch -q --prune origin 2>/dev/null || { NETZ=0; rest "Zweige auf GitHub: git fetch fehlgeschlagen, nicht geprüft" }
fi
HAUPT=origin/main
g rev-parse -q --verify $HAUPT >/dev/null || HAUPT=main

# alle Commits von <Ref> schon in main: Vorfahr oder per Patch-Vergleich gleich (git cherry: keine Zeile „+“)
in_main() {
  g merge-base --is-ancestor $1 $HAUPT 2>/dev/null && return 0
  local ch
  ch=$(g cherry $HAUPT $1 2>/dev/null) || return 1
  ! print -r -- $ch | grep -q '^+'
}

# --- a) Arbeitskopien der Hilfsagenten, a2) Arbeitskopien der Worker ---
# erzeugte, jederzeit ersetzbare Dateien (ignoriert); alles andere Ignorierte = Zweifel
ersetzbar() {
  [[ $1 == (dist/*|extension/theme.css|(*/|)__pycache__/*|(*/|)node_modules/*|*.xpi|*.pyc|tests/shots/*|(*/|).DS_Store) ]]
}
# Arbeitsordner aller Prozesse (einmal lesen)
CWDS=(${(f)"$(lsof -n -d cwd -Fn 2>/dev/null | sed -n 's/^n//p')"})

typeset -A KOPIE_ZWEIG    # Pfad -> Zweig (alle Arbeitskopien, auch fremde)
pfad= zweig=
while IFS= read -r z; do    # Einträge durch Leerzeilen getrennt
  case $z in
    worktree\ *) pfad=${z#worktree } ;;
    branch\ *) zweig=${z#branch refs/heads/} ;;
    '') [[ -n $pfad ]] && KOPIE_ZWEIG[$pfad]=$zweig; pfad= zweig= ;;
  esac
done < <(g worktree list --porcelain 2>/dev/null; print)

entfernt_kopie=0
for pfad in ${(k)KOPIE_ZWEIG}; do
  art=
  [[ $pfad == */.claude/worktrees/agent-* ]] && art=agent
  [[ ${pfad:A} == $WORKER_DIR/worker-* ]] && art=worker
  [[ -n $art ]] || continue
  name=${pfad:t} zweig=$KOPIE_ZWEIG[$pfad] k=$(kurz $pfad) grund=
  admin=$(git -C $pfad rev-parse --absolute-git-dir 2>/dev/null)
  if [[ ! -d $pfad || -z $admin ]]; then
    continue    # Ordner fehlt: erledigt git worktree prune unten
  fi
  st=$(git -C $pfad status --porcelain 2>/dev/null) || grund="git status scheitert"
  [[ -z $grund && -n $st ]] && grund="ungespeicherte oder unversionierte Dateien ($(print -r -- $st | wc -l | tr -d ' '))"
  if [[ -z $grund ]]; then
    for f in ${(f)"$(git -C $pfad status --porcelain --ignored 2>/dev/null | sed -n 's/^!! //p')"}; do
      ersetzbar $f && continue
      [[ $art == worker && $f == repo.conf ]] && cmp -s $pfad/repo.conf $REPO/repo.conf && continue   # Kopie aus dem Repo
      grund="ignorierte Datei nicht sicher ersetzbar: $f"; break
    done
  fi
  if [[ -z $grund ]]; then
    kopf=$(git -C $pfad rev-parse HEAD 2>/dev/null)
    if ! g merge-base --is-ancestor $kopf $HAUPT 2>/dev/null; then
      if ch=$(g cherry $HAUPT $kopf 2>/dev/null); then
        plus=$(print -r -- $ch | grep -c '^+')
        (( plus )) && grund="$plus Commit(s) nur in dieser Kopie, nicht in main"
      else
        grund="Vergleich mit main scheitert (git cherry)"
      fi
    fi
  fi
  if [[ -z $grund && -f $admin/locked ]]; then
    pid=$(sed -n 's/.*pid \([0-9][0-9]*\).*/\1/p' $admin/locked | head -1)
    if [[ -z $pid ]]; then grund="gesperrt (git worktree lock) ohne Prozessnummer"
    elif lebt $pid; then grund="gesperrt von laufendem Prozess $pid"
    else grund="gesperrt von beendetem Prozess $pid (git worktree remove lehnt gesperrte Kopien ab)"
    fi
  fi
  if [[ -z $grund ]]; then
    for c in $CWDS; do
      [[ $c == $pfad || $c == $pfad/* ]] && { grund="ein Prozess arbeitet darin ($c)"; break }
    done
  fi
  if [[ -z $grund && $art == agent ]]; then
    prot=($PROJEKTE/*/*/subagents/$name.jsonl(N.mm-$((STUNDEN * 60))))
    (( $#prot )) && grund="Hilfsagent schrieb vor weniger als $STUNDEN Stunden"
  fi
  if [[ -z $grund ]]; then
    neu=$(find $pfad -mmin -$((STUNDEN * 60)) -print -quit 2>/dev/null)
    [[ -n $neu ]] && grund="Änderung jünger als $STUNDEN Stunden (${${neu#$pfad}#/}${${neu:#$pfad}:+}${${(M)neu:#$pfad}:+Ordner selbst})"
  fi
  if [[ -n $grund ]]; then
    rest "Arbeitskopie $k: $grund"
    continue
  fi
  if [[ -n $TROCKEN ]]; then
    weg "Arbeitskopie $k${zweig:+ (Zweig $zweig)}"
  elif fehler=$(g worktree remove $pfad 2>&1); then
    entfernt_kopie=1
    unset "KOPIE_ZWEIG[$pfad]"
    if [[ -n $zweig ]] && g branch -d $zweig >/dev/null 2>&1; then
      weg "Arbeitskopie $k und Zweig $zweig"
    elif [[ $art == worker && -n $zweig ]] && in_main $zweig && g branch -D $zweig >/dev/null 2>&1; then
      weg "Arbeitskopie $k und Zweig $zweig (Inhalt per Patch-Vergleich in main)"
    else
      weg "Arbeitskopie $k${zweig:+ (Zweig $zweig bleibt: nicht als Vorfahr in main, git branch -d lehnt ab)}"
    fi
  else
    rest "Arbeitskopie $k: git worktree remove lehnt ab (${fehler//$'\n'/ })"
  fi
done
# Verwaltungseinträge von Arbeitskopien, deren Ordner fehlt
pr=$(g worktree prune -n -v 2>&1)
if [[ -n $pr ]]; then
  if [[ -z $TROCKEN ]] && g worktree prune 2>/dev/null; then
    weg "Verwaltungseinträge fehlender Arbeitskopien: ${pr//$'\n'/; }"
  elif [[ -n $TROCKEN ]]; then
    weg "Verwaltungseinträge fehlender Arbeitskopien: ${pr//$'\n'/; }"
  fi
elif (( entfernt_kopie )); then
  g worktree prune 2>/dev/null
fi

# --- b) tote Sperrdateien ---
for f in $NACHT/*.lock(N.); do
  inhalt=$(<$f) k=$(kurz $f)
  teile=(${=inhalt}) pid=$teile[1]
  alter=$(( (JETZT - $(stat -f %m $f)) / 60 ))
  if [[ $pid != <-> ]]; then rest "Sperrdatei $k: keine Prozessnummer lesbar"
  elif lebt $pid; then :     # lebender Prozess: nie anfassen, kein Rest
  elif (( alter < LOCK_MIN )); then rest "Sperrdatei $k: Prozess $pid beendet, aber erst $alter Minuten alt"
  elif [[ -n $TROCKEN ]]; then weg "Sperrdatei $k (Prozess $pid existiert nicht, $(stat -f '%Sm' -t '%d.%m. %H:%M' $f))"
  elif [[ $(<$f) == $inhalt ]] && ! lebt $pid && rm -f -- $f; then
    weg "Sperrdatei $k (Prozess $pid existiert nicht, $(( alter / 60 )) Stunden alt)"
  else
    rest "Sperrdatei $k: hat sich beim Löschen geändert"
  fi
done

# --- c) Zweige claude/…, rest/…, pruef/…, verwaiste worktree-agent-… ---
ausgecheckt() { local -a v; v=(${(v)KOPIE_ZWEIG}); (( ${v[(Ie)$1]} )) }
OFFEN= PRS_OK=1
if [[ -n $OHNE_ZWEIGE ]]; then :
elif [[ -n $HALO_AUFR_PRS ]]; then OFFEN=$(<$HALO_AUFR_PRS)
elif ! OFFEN=$(gh pr list -R sruf79/halo-spaces --state open -L 200 --json headRefName --jq '.[].headRefName' 2>/dev/null); then
  PRS_OK=0
fi
[[ -n $OHNE_ZWEIGE ]] || for b in $(g for-each-ref --format='%(refname:short)' refs/heads/claude/ refs/heads/rest/ refs/heads/pruef/ 'refs/heads/worktree-agent-*'); do
  ausgecheckt $b && continue          # gehört zu einer Arbeitskopie: dort entschieden bzw. in Benutzung
  patch=
  if ! g merge-base --is-ancestor $b $HAUPT 2>/dev/null; then
    [[ $b == pruef/worker-* ]] && in_main $b || continue    # eigene Commits: kein Rest, ein Zweig
    patch=" per Patch-Vergleich"
  fi
  if (( ! PRS_OK )); then rest "Zweig $b: offene Pull Requests nicht lesbar"
  elif print -r -- $OFFEN | grep -qxF -- $b; then rest "Zweig $b: offener Pull Request"
  elif [[ -n $TROCKEN ]]; then weg "Zweig $b (lokal,$patch in main enthalten)"
  elif g branch ${${patch:+-D}:--d} $b >/dev/null 2>&1; then weg "Zweig $b (lokal,$patch in main enthalten)"
  else rest "Zweig $b: git branch -d lehnt ab"
  fi
done
if (( NETZ )); then
  for b in $(g for-each-ref --format='%(refname:strip=3)' refs/remotes/origin/claude/ refs/remotes/origin/rest/ refs/remotes/origin/pruef/); do
    if [[ -n $(g rev-list -n 1 $HAUPT..origin/$b 2>/dev/null) ]]; then
      [[ $b == pruef/worker-* ]] && in_main origin/$b || continue   # eigene Commits: bleibt (Worker: außer per Patch in main)
    fi
    if (( ! PRS_OK )); then rest "Zweig origin/$b: offene Pull Requests nicht lesbar"
    elif print -r -- $OFFEN | grep -qxF -- $b; then rest "Zweig origin/$b: offener Pull Request"
    elif ausgecheckt $b; then rest "Zweig origin/$b: in einer Arbeitskopie ausgecheckt (wird evtl. noch benutzt)"
    elif [[ -n $TROCKEN ]]; then weg "Zweig origin/$b (auf GitHub, in main enthalten)"
    elif g push -q origin --delete $b 2>/dev/null; then weg "Zweig origin/$b (auf GitHub, in main enthalten)"
    else rest "Zweig origin/$b: Löschen auf GitHub fehlgeschlagen"
    fi
  done
fi

# --- Ausgabe ---
print "Aufgeräumt${TROCKEN:+ (Probelauf, nichts entfernt)}: $#WEG"
for z in $WEG; do print -r -- "- $z"; done
print "Rest mit Risiko, nichts angefasst: $#REST"
for z in $REST; do print -r -- "- $z"; done
exit 0
