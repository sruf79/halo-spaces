#!/bin/zsh
# Notschalter für die Abläufe von halo.spaces auf neon (docs/notfall.md, Abschnitt 4).
# ENTWURF aus der Ablauf-Analyse (Stufe 0), auf neon nur trocken geprüft (8.11.2026).
#
#   notfall.sh [--trocken] status
#   notfall.sh [--trocken] stopp [--hart] <Grund>
#   notfall.sh [--trocken] weiter
#   notfall.sh [--trocken] sichern <name>
#   notfall.sh [--trocken] zurueck <name> [--mit-aufgaben]
#
# --trocken zeigt jeden Schritt nur an. Jede Aktion schreibt nach ~/halo-nacht/notfall.log und
# schickt eine Push-Nachricht „NOTFALL: …“. Liegt als Kopie in ~/.config/halo-spaces/ (läuft auch,
# wenn das Repo kaputt ist) und braucht dort lauf-hilfen.zsh und sitzung-finden.zsh daneben.
# Pausen nur über die eine Datei ~/halo-nacht/pausen.txt (Zeile „alle“, mit Ablaufzeit).
# remote-control und neon-board fasst das Skript nie an: Die neon-Sitzung, die es womöglich
# gerade ausführt, liefe sonst mitten im Befehl weg. Der GitHub-Runner bleibt ebenfalls an.
setopt pipefail

HIER=${0:A:h}
REPO=${HALO_REPO:-$HOME/halo-spaces}
LOG=$HOME/halo-nacht/notfall.log
SICHERUNG=${HALO_SICHERUNG:-$HOME/halo-sicherung}
PAUSEN=${HALO_PAUSEN_DATEI:-$HOME/halo-nacht/pausen.txt}
ENTLADEN=$HOME/halo-nacht/notfall-entladen.txt   # von stopp --hart entladen, lädt weiter wieder
BLEIBEN=(at.halo-spaces.remote-control at.halo-spaces.neon-board)
ROUTINEN_SKRIPTE='nachtlauf\.sh|wochenpruefung\.sh|rundgang-woche\.sh|bilder-eingang\.zsh|ci-waechter\.sh|github-vorpruefung\.sh'
mkdir -p ${LOG:h}
source $HIER/lauf-hilfen.zsh   # zeit, log, pause_aktiv, pause_setzen, push, PAUSEN_ROUTINEN

TROCKEN=
[[ ${1:-} == --trocken ]] && { TROCKEN=1; shift }

tu() { if [[ -n $TROCKEN ]]; then print -r -- "TROCKEN: ${(q-)@}"; else "$@"; fi }
melden() { [[ -z $TROCKEN ]] && log "$*"; print -r -- "$*" }
pushen() {
  if [[ -n $TROCKEN ]]; then print -r -- "TROCKEN: push „NOTFALL: $1“"; else push "NOTFALL: $1" notfall handeln; fi
}

geladen() { launchctl list | awk '$3 ~ /^at\.halo-spaces\./ {print $3}' }
plists() { print -l $HOME/Library/LaunchAgents/at.halo-spaces.*.plist(N) }
label_von() { print -r -- ${${1:t}%.plist} }
bleibt() { (( ${BLEIBEN[(Ie)$1]} )) }

# Prozess samt allen Nachkommen beenden (claude -p läuft als Kind bzw. Enkel der Routine)
baum_beenden() {
  local k
  for k in $(pgrep -P $1); do baum_beenden $k; done
  kill -TERM $1 2>/dev/null
}
launchctl_liste() { launchctl list | grep -E 'halo|actions\.runner' > $1 }
pruefsumme_schreiben() { (cd ${1:h} && shasum -a 256 ${1:t} > ${1:t}.sha256) }
notfall_zeilen_weg() {
  [[ -f $PAUSEN ]] || return 0
  grep -v '^alle [^ ]* NOTFALL ' $PAUSEN > $PAUSEN.neu
  mv $PAUSEN.neu $PAUSEN
}

status() {
  local r g
  print "== LaunchAgents (geladen)"; geladen
  print "== Pausen"
  for r in $PAUSEN_ROUTINEN; do
    if g=$(pause_aktiv $r); then print "$r pausiert $g"; else print "$r läuft"; fi
  done
  print "== laufende Routinen"; pgrep -lf "$ROUTINEN_SKRIPTE" || print "keine"
  print "== Claude-Läufe (claude -p)"; pgrep -f 'claude -p' | wc -l | tr -d ' '
  print "== CI auf neon"; if pgrep -q Runner.Worker; then print "läuft"; else print "frei"; fi
  local b=($HOME/halo-berichte/*-nachtlauf.md(N.om[1])) s=($SICHERUNG/*.tar.gz(N.om[1]))
  print "== letzter Nachtlauf-Bericht"; print -r -- ${b:-keiner}
  print "== letzte Sicherung"; print -r -- ${s:-keine}
  print "== von stopp --hart entladen"; if [[ -s $ENTLADEN ]]; then cat $ENTLADEN; else print "nichts"; fi
}

stopp() {
  local hart= grund bis pid l
  [[ ${1:-} == --hart ]] && { hart=1; shift }
  grund=${*:-ohne Grund}
  bis=$(date -v+7d '+%Y-%m-%dT%H:%M%z'); bis=${bis[1,-3]}:${bis[-2,-1]}   # Python 3.9 braucht +01:00
  if [[ -n $TROCKEN ]]; then   # Zeile trotzdem prüfen, in eine Wegwerf-Datei
    local probe=$(mktemp -t notfall-pausen)
    HALO_PAUSEN_DATEI=$probe pause_setzen alle $bis "NOTFALL $grund" || { rm -f $probe; melden "FEHLER Pausen-Zeile nicht lesbar"; return 1 }
    rm -f $probe
  fi
  tu pause_setzen alle $bis "NOTFALL $grund" || { melden "FEHLER Pause nicht gesetzt"; return 1 }
  melden "STOPP: alle Routinen pausiert bis $bis ($grund)"
  if [[ -n $hart ]]; then
    for pid in $(pgrep -f "$ROUTINEN_SKRIPTE"); do
      l=$(ps -o command= -p $pid 2>/dev/null | cut -c1-80)
      tu baum_beenden $pid && melden "beendet: $l"
    done
    for l in $(geladen); do
      bleibt $l && continue
      tu launchctl bootout gui/$UID/$l || { melden "FEHLER nicht entladen: $l"; continue }
      melden "entladen: $l"
      [[ -z $TROCKEN ]] && print -r -- $l >> $ENTLADEN
    done
  fi
  pushen "Routinen angehalten${hart:+ (hart)}: $grund"
}

weiter() {
  local p l
  tu notfall_zeilen_weg
  for l in ${(u)${(f)"$(cat $ENTLADEN 2>/dev/null)"}}; do
    p=$HOME/Library/LaunchAgents/$l.plist
    [[ -f $p ]] || { melden "fehlt, nicht geladen: $l"; continue }
    geladen | grep -qx $l && continue
    tu launchctl bootstrap gui/$UID $p && melden "geladen: $l"
  done
  tu rm -f $ENTLADEN
  melden "WEITER: NOTFALL-Pausen entfernt"
  pushen "Routinen laufen wieder"
}

sichern() {
  local name=${1:?Name der Sicherung fehlt} stempel=$(date '+%Y%m%d-%H%M') t
  local ziel=$SICHERUNG/$name-$stempel.tar.gz
  local agenten=($HOME/Library/LaunchAgents/at.halo-spaces.*.plist(N))
  local teile=(.config/halo-spaces .claude/settings.json halo-board/.claude halo-aufgaben
               .claude/scheduled-tasks/halo-github-kommunikation halo-spaces/.claude/settings.local.json
               halo-github
               ${agenten#$HOME/})
  local da=()
  for t in $teile; do
    if [[ -e $HOME/$t ]]; then da+=($t); else melden "fehlt, nicht gesichert: ~/$t"; fi
  done
  umask 077
  tu mkdir -p -m 700 $SICHERUNG
  tu launchctl_liste $SICHERUNG/$name-$stempel.launchctl.txt
  # halo-github/.claude/settings.local.json enthält einen Token: nie ins Archiv
  tu tar -czf $ziel --exclude 'halo-github/.claude/settings.local.json' -C $HOME $da || { melden "FEHLER Archiv $ziel"; return 1 }
  tu chmod 600 $ziel
  tu pruefsumme_schreiben $ziel
  if git -C $REPO rev-parse -q --verify refs/tags/$name >/dev/null; then
    melden "Tag $name gibt es schon, bleibt unverändert"
  else
    tu git -C $REPO tag -a $name -m "Sicherungspunkt $name ($stempel), docs/notfall.md"
  fi
  melden "SICHERUNG: $ziel, Tag $name auf $(git -C $REPO rev-parse --short HEAD) (Tag nicht gepusht)"
  pushen "Sicherung $name angelegt"
}

zurueck() {
  local name=${1:?Name der Sicherung fehlt} mit= archiv p rel l weg
  [[ ${2:-} == --mit-aufgaben ]] && mit=1
  archiv=($SICHERUNG/$name-<->-<->.tar.gz(N.om[1]))
  [[ -n $archiv ]] || { melden "FEHLER keine Sicherung „$name“ in $SICHERUNG"; return 1 }
  (cd ${archiv:h} && shasum -a 256 -c ${archiv:t}.sha256 >/dev/null) || { melden "FEHLER Prüfsumme $archiv"; return 1 }
  stopp --hart "Rücknahme auf $name"
  # LaunchAgents, die es zur Zeit der Sicherung nicht gab, beiseitelegen (nicht löschen)
  local inhalt=(${(f)"$(tar -tzf $archiv)"})
  weg=$SICHERUNG/beiseite-$(date '+%Y%m%d-%H%M')
  for p in $(plists); do
    rel=${p#$HOME/} l=$(label_von $p)
    bleibt $l && continue
    (( ${inhalt[(Ie)$rel]} )) && continue
    tu mkdir -p $weg; tu mv $p $weg/ && melden "neu seit $name, beiseitegelegt: $rel"
  done
  local ohne=(--exclude '.config/halo-spaces/notfall.sh'
              --exclude 'Library/LaunchAgents/at.halo-spaces.remote-control.plist'
              --exclude 'Library/LaunchAgents/at.halo-spaces.neon-board.plist')
  [[ -z $mit ]] && ohne+=(--exclude 'halo-aufgaben')
  tu tar -xzf $archiv -C $HOME $ohne || { melden "FEHLER Auspacken $archiv"; return 1 }
  for l in $BLEIBEN; do
    rel=Library/LaunchAgents/$l.plist
    tar -xOzf $archiv $rel 2>/dev/null | cmp -s - $HOME/$rel ||
      melden "HINWEIS $l weicht von der Sicherung ab, nicht zurückgespielt (Sitzung liefe weg) – von Hand prüfen"
  done
  melden "ZURÜCK auf $name aus ${archiv:t}${mit:+ (mit halo-aufgaben)}; Routinen bleiben angehalten bis „notfall.sh weiter“"
  print "Ablauf-Commits seit $name – von Hand mit git revert zurücknehmen:"
  git -C $REPO log --oneline $name..HEAD -- tests docs AGENTS.md ENTSCHEIDUNGEN.md .github .claude
  pushen "Rücknahme auf $name, Routinen angehalten"
}

case ${1:-} in
  status)  status ;;
  stopp)   shift; stopp "$@" ;;
  weiter)  weiter ;;
  sichern) shift; sichern "$@" ;;
  zurueck) shift; zurueck "$@" ;;
  *) print -u2 "Aufruf: notfall.sh [--trocken] status | stopp [--hart] <Grund> | weiter | sichern <name> | zurueck <name> [--mit-aufgaben]"; exit 2 ;;
esac
