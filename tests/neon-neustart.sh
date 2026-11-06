#!/bin/zsh
# Täglicher Neustart der Sitzung neon (LaunchAgent at.halo-spaces.neon-neustart,
# tests/MAC-MINI.md Abschnitt 12). Entscheidung des Maintainers (Cloud-Sitzung
# global.design.comparison, 6.11.2026), Wortlaut: „punkt 1 beauftragen.“ – Bezug,
# Vorschlag dieser Sitzung: „neon täglich neu starten, zum Beispiel nach dem
# Nachtlauf. Die offenen Aufträge stehen in neon-stand.md und werden beim Start
# wieder geladen“ (Grund: eine einzige Sitzung über Tage, neon machte 62 % des
# Tokenverbrauchs). Die Regeln unten sind die Deutung dieser Sitzung.
#   neon-neustart.sh [--trocken] [<Repo-Ordner>]
# Startet alle 30 Minuten (StartInterval) und entscheidet selbst; ohne Grund zum
# Warten tut ein Lauf nichts und schreibt nichts.
#
# Uhrzeit-Regel: Ein Neustart ist erst erlaubt, wenn der Nachtlauf des Tages zu
# Ende ist (Bericht ~/halo-berichte/<datum>-nachtlauf.md liegt vor und
# ~/halo-nacht/lauf.lock lebt nicht mehr) – samstags zusätzlich Doku-Prüfung und
# Rundgang, sonntags die Wochenprüfung (jeweils Bericht da, Sperrdatei tot) –
# und läuft dann beim nächsten freien Lauf, spätestens bis 12:00 (samstags
# 16:00, weil der Rundgang erst um 10:00 beginnt). Die Push-Sperre bleibt
# unberührt (ein Neustart ist kein Push).
# Zusätzlich muss frei sein: keine Claude-Sitzung am Repo mitten in einer Runde
# (aktive_sitzung() aus lauf-hilfen.zsh), der SessionStart-Hook im Checkout
# (.claude/settings.json nennt neon-hook.sh, sonst kämen die Aufträge nicht
# zurück) und kein offener Auftrag in
# ~/halo-aufgaben/neon-stand.md ohne Stand-Notiz („Stand: angenommen“). Der
# Neustart beendet auch die Sitzungen, die dieser Remote-Control-Prozess selbst
# gestartet hat (z. B. von Cloud-Sitzungen angelegte), deshalb zählt jede aktive
# Sitzung am Repo. Ist es bis zum Ende des Zeitfensters nicht frei, steht eine
# Zeile „ÜBERSPRUNGEN neon-neustart <Grund>“ im Protokoll und in
# ~/halo-nacht/uebersprungen.log (wie die Vorprüfungen der Läufe); kein
# iPhone-Push. Ein Neustart steht als Zeile im Protokoll
# ~/halo-nacht/neon-neustart.log. Je Tag höchstens ein Versuch erfolgreich oder
# ausgelassen (Marke ~/halo-nacht/neon-neustart.heute).
# Pausieren: touch ~/halo-nacht/PAUSE-NEUSTART (rm zum Fortsetzen).
# Der Mac mini hat keinen eigenen Zeitgeber für „nach Ende“: der Lauf prüft nur
# Dateien, startet nichts außer dem einen launchctl kickstart.
emulate -L zsh

TROCKEN=
[[ $1 == --trocken ]] && { TROCKEN=1; shift }
REPO=${1:-$HOME/halo-spaces}
path=(~/.local/bin /opt/homebrew/bin /usr/local/bin $path)
DIR=${HALO_NACHT_DIR:-$HOME/halo-nacht}
BERICHTE=${HALO_BERICHTE_DIR:-$HOME/halo-berichte}
STAND=${HALO_NEON_STAND:-$HOME/halo-aufgaben}/neon-stand.md
LABEL=${HALO_RC_LABEL:-at.halo-spaces.remote-control}
LOG=$DIR/neon-neustart.log
MARKE=$DIR/neon-neustart.heute
mkdir -p $DIR
source ${0:A:h}/lauf-hilfen.zsh      # zeit, log, aktive_sitzung
source ${0:A:h}/vorpruefung.zsh      # uebersprungen

# Zeitpunkt (für Probedaten überschreibbar: HALO_NEUSTART_ZEIT="2026-11-07 09:30 6")
jetzt() {
  [[ -n $HALO_NEUSTART_ZEIT ]] && { print -r -- $HALO_NEUSTART_ZEIT; return }
  date '+%F %H:%M %u'
}

# lief die Routine <Name> heute zu Ende? Bericht da und Sperrdatei nicht mehr lebendig
# fertig <Tag> <Bericht-Name> <Sperrdatei-Name>
fertig() {
  [[ -e $BERICHTE/$1-$2.md ]] || return 1
  [[ -e $DIR/$3 ]] && kill -0 $(<$DIR/$3) 2>/dev/null && return 1
  return 0
}

# Grund, der den Neustart jetzt verhindert (leer = frei)
neustart_grund() {   # <Tag> <Wochentag 1–7>
  local tag=$1 wt=$2 s
  fertig $tag nachtlauf lauf.lock || { print "Nachtlauf $tag noch nicht beendet"; return }
  if (( wt == 6 )); then
    fertig $tag dokupruefung doku.lock || { print "Doku-Prüfung $tag noch nicht beendet"; return }
    fertig $tag rundgang rundgang.lock || { print "Design-Rundgang $tag noch nicht beendet"; return }
  elif (( wt == 7 )); then
    fertig $tag wochenpruefung woche.lock || { print "Wochenprüfung $tag noch nicht beendet"; return }
  fi
  # ohne SessionStart-Hook im Checkout kämen die offenen Aufträge nach dem Start nicht zurück
  grep -qs neon-hook.sh $REPO/.claude/settings.json || { print "SessionStart-Hook fehlt in $REPO/.claude/settings.json (main noch nicht aktuell)"; return }
  s=$(aktive_sitzung) && { print "Claude-Sitzung ${s[1,8]} arbeitet gerade am Repo"; return }
  if [[ -f $STAND ]] && grep -E '^- #[0-9]+ ' $STAND | grep -q 'Stand: angenommen$'; then
    print "offener Auftrag in neon-stand.md ohne Stand-Notiz: $(grep -E '^- #[0-9]+ ' $STAND | grep 'Stand: angenommen$' | sed -E 's/^- (#[0-9]+).*/\1/' | tr '\n' ' ')"
    return
  fi
}

neustarten() {
  local dom=gui/$(id -u) i
  launchctl kickstart -k $dom/$LABEL 2>&1 || { log "Neustart: launchctl kickstart gescheitert"; return 1 }
  for i in {1..12}; do
    sleep 5
    pgrep -f 'claude.* remote-control .*--name neon --' >/dev/null && { log "neon neu gestartet (läuft wieder nach $((i * 5)) s)"; return 0 }
  done
  log "neon neu gestartet, aber nach 60 s kein claude remote-control --name neon – Protokoll ~/Library/Logs/halo-remote-control.log"
  return 1
}

hauptlauf() {
  local z tag hhmm wt h ende grund
  z=(${=$(jetzt)}); tag=$z[1]; hhmm=$z[2]; wt=$z[3]; h=${hhmm%%:*}
  [[ -e $DIR/PAUSE-NEUSTART ]] && exit 0
  [[ -z $TROCKEN && -r $MARKE && $(<$MARKE) == $tag* ]] && exit 0
  ende=12; (( wt == 6 )) && ende=16
  grund=$(neustart_grund $tag $wt)
  if (( 10#$h >= ende )); then       # Zeitfenster vorbei: auslassen (nur im ersten Lauf danach melden)
    [[ -n $TROCKEN ]] && { print "Zeitfenster vorbei (ab $ende:00): ${grund:-frei, aber zu spät}"; exit 0 }
    (( 10#$h == ende )) && uebersprungen neon-neustart "${grund:-Zeitfenster bis $ende:00 vorbei}"
    print -r -- "$tag ausgelassen" > $MARKE
    exit 0
  fi
  if [[ -n $grund ]]; then
    [[ -n $TROCKEN ]] && print "wartet: $grund"
    exit 0                           # nächster Versuch in 30 Minuten
  fi
  [[ -n $TROCKEN ]] && { print "frei: würde neu starten ($LABEL)"; exit 0 }
  print -r -- "$tag neu gestartet" > $MARKE
  neustarten
  exit 0
}

# HALO_NEUSTART_TEST=1: nur die Funktionen laden (Probedaten-Tests)
[[ -n $HALO_NEUSTART_TEST ]] && return 0
hauptlauf
