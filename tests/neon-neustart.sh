#!/bin/zsh
# NICHT AKTIV: Der LaunchAgent wird nicht eingerichtet (Entscheidung des
# Maintainers, Cloud-Sitzung global.design.comparison, 6.11.2026, Wortlaut:
# „ja täglichen neustart nicht aktivieren. clear von hand.“ – Grund: kickstart -k setzt dieselbe Sitzung mit vollem Verlauf
# fort). Das Skript bleibt als Vorlage liegen.
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
# Kind-Sitzungen: kickstart -k beendet alle Sitzungen, die der
# Remote-Control-Prozess gestartet hat (neon selbst und z. B. von Cloud-Sitzungen
# angelegte). Ist eine davon laut ~/.claude/sessions/<pid>.json „busy“ (mitten
# in einer Runde), wird gewartet – auch, wenn sie nicht am Repo arbeitet.
# Kontext danach: Nach einem echten Neustart misst jeder folgende Lauf, sobald
# neon geantwortet hat, einmal die Kontextgröße der neon-Sitzung (Tokens der
# letzten Antwort, Zeilen des Protokolls) und schreibt sie ins Protokoll.
# Befund 6.11.2026: der Server setzt dieselbe Sitzung fort (--resume am
# Kindprozess, gleiche Sitzungs-ID, Protokoll läuft mit vollem Kontext weiter);
# der Neustart allein leert den Kontext also nicht. Die Messung zeigt, ob sich
# das ändert.
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
  s=$(kinder_aktiv) && { print "von neon gestartete Sitzung mitten in einer Runde: $s"; return }
  if [[ -f $STAND ]] && grep -E '^- #[0-9]+ ' $STAND | grep -q 'Stand: angenommen$'; then
    print "offener Auftrag in neon-stand.md ohne Stand-Notiz: $(grep -E '^- #[0-9]+ ' $STAND | grep 'Stand: angenommen$' | sed -E 's/^- (#[0-9]+).*/\1/' | tr '\n' ' ')"
    return
  fi
}

# PID des Remote-Control-Prozesses von neon (nicht neon-board)
rc_pid() {
  ps -axo pid=,args= | grep -E 'claude remote-control .*--name neon( |$)' | grep -v grep | awk 'NR==1 {print $1}'
}

# Kind-Sitzungen des Remote-Control-Prozesses mitten in einer Runde: Ausgabe
# „<name> (pid)“ je Sitzung, Rückgabe 0 = mindestens eine arbeitet
kinder_aktiv() {
  local rc=${1:-$(rc_pid)} pid info treffer=()
  [[ -n $rc ]] || return 1
  for pid in $(ps -axo pid=,ppid= | awk -v r=$rc '$2 == r {print $1}'); do
    info=$(python3 -c 'import json,sys
d=json.load(open(sys.argv[1]))
print(d.get("status",""), d.get("name") or d.get("sessionId","?")[:8])' \
      $HOME/.claude/sessions/$pid.json 2>/dev/null) || continue
    [[ ${info%% *} == busy ]] && treffer+=("${info#* } ($pid)")
  done
  (( $#treffer )) || return 1
  print -r -- ${(j:, :)treffer}
}

# Kontextgröße der neon-Sitzung nach einem Neustart (einmal, sobald messbar):
# Rückgabe 0 = gemessen und protokolliert
kontext_messen() {
  local rc pid sid datei werte
  rc=$(rc_pid); [[ -n $rc ]] || return 1
  for pid in $(ps -axo pid=,ppid= | awk -v r=$rc '$2 == r {print $1}'); do
    sid=$(python3 -c 'import json,sys
d=json.load(open(sys.argv[1]))
print(d["sessionId"] if d.get("name") == "neon" else "")' $HOME/.claude/sessions/$pid.json 2>/dev/null)
    [[ -n $sid ]] && break
  done
  [[ -n $sid ]] || return 1
  datei=$HOME/.claude/projects/${REPO//[\/.]/-}/$sid.jsonl
  [[ -f $datei ]] || return 1
  # nur Zählwerte (usage), keine Inhalte
  werte=$(python3 -c 'import json,sys
n=0; letzte=None
for z in open(sys.argv[1], errors="replace"):
    n += 1
    if "\"assistant\"" not in z: continue
    try: d = json.loads(z)
    except ValueError: continue
    if d.get("type") != "assistant" or d.get("isSidechain"): continue
    u = (d.get("message") or {}).get("usage") or {}
    if u: letzte = sum(int(u.get(k) or 0) for k in ("input_tokens", "cache_read_input_tokens", "cache_creation_input_tokens"))
if letzte is not None: print(letzte, n)' $datei 2>/dev/null)
  [[ -n $werte ]] || return 1
  werte=(${=werte})
  log "Kontext nach Neustart: $werte[1] Tokens in der letzten Antwort von neon, $werte[2] Zeilen im Protokoll (Sitzung ${sid[1,8]}, $(( $(stat -f %z $datei) / 1024 )) KB)"
  return 0
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
  # nach dem Neustart heute: einmal die Kontextgröße messen, sobald neon geantwortet hat
  if [[ -z $TROCKEN && -r $MARKE && $(<$MARKE) == "$tag neu gestartet" ]]; then
    kontext_messen && print -r -- "$tag neu gestartet, Kontext gemessen" > $MARKE
    exit 0
  fi
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
