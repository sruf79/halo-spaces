#!/bin/zsh
export HALO_LAUF=nachtlauf
# Nächtlicher Arbeitslauf auf neon (tests/MAC-MINI.md, Abschnitt 13): Claude Code
# arbeitet offene Einträge der Aufgabenliste ab und veröffentlicht am Ende nach
# AGENTS.md: pushen, CI abwarten (tests/ci-warten.sh), bei Grün release.sh und
# publish.sh. Gestartet vom LaunchAgent
# at.halo-spaces.nachtlauf jede Nacht um 01:30; die Datei wird nach
# ~/.config/halo-spaces/ kopiert, nicht aus dem Checkout benutzt (der Lauf
# ändert den Checkout).
#   nachtlauf.sh <Repo-Ordner>
#   nachtlauf.sh --push-test <Text>     nur eine Testnachricht aufs iPhone
#   nachtlauf.sh --trocken [<Repo>]     nur Aufräumen (tests/aufraeumen.sh) und CI-Abschluss proben (tests/ci-runde.zsh): zeigt, was er
#                                       löschen, eintragen bzw. starten würde – kein Push, kein workflow run, kein Board
# Nach Claudes Arbeit (auch wenn die Vorprüfung nichts fand) der CI-Abschluss aus tests/ci-runde.zsh
# (Entscheidung des Maintainers vom 7.11.2026): rote Prüfungen der CI-Läufe dieser Nacht ins Board,
# Vollrunde (ziel=alle), wenn seit 24 Stunden keine lief und der Lauf nichts CI-Auslösendes gepusht hat,
# Zeile „Letzte vollständig grüne Runde“ im Bericht. Fehler dort brechen nichts ab (VOLLRUNDE-FEHLER,
# EINTRAG-FEHLER in Protokoll und uebersprungen.log). Danach rot_abschluss: neue Zweige pruef/rot-* an neon,
# Warnung bei Reverts ohne Zählerzeile (19.11.2026).
# Schreibt immer einen Bericht nach ~/halo-berichte/<datum>-nachtlauf.md – auch
# wenn ausgelassen, pausiert, nichts zu tun oder die Tests rot – und schickt
# eine Zeile davon aufs iPhone (Push der Claude-App über die Sitzung
# „github.comm.routine“, die Remote Control hat).
# Pausieren: nur über ~/halo-nacht/pausen.txt (pause_setzen in tests/lauf-hilfen.zsh, mit Ablaufzeit).
# HALO_NACHT_AB=JJJJ-MM-TT: vorher kein Lauf (Standard 2026-11-04).
# Volldampf (Maintainer 13.11.2026, docs/testrechner.md „Volldampf“, ~/halo-nacht/volldampf.txt): Zeile
# „Volldampf: …“ im Auftrag, vor jeder Runde Wochenlimit prüfen (pausiert Volldampf bis zum freien Reset, 18.11.2026), solange aktiv
# Fortsetzungen bis 08:45 (16.11.2026, vorher 08:00); Grenzen VD_FORTSETZ_MAX Fortsetzungen und VD_MAX_COMMITS nicht
# gepushte Commits (Maintainer 17.11.2026 „volldampf bedeutet maximale produktivität“: praktisch aufgehoben, Bremse
# sind 08:45 und das Wochenlimit); Vermerk in „Kurz:“ und Bericht.
# Ohne Datei bzw. ohne gültiges Fenster ändert sich nichts.
emulate -L zsh
setopt extendedglob

PUSH_TEST= TROCKEN=
[[ $1 == --push-test ]] && { PUSH_TEST=$2; set -- }
[[ $1 == --trocken ]] && { TROCKEN=1; shift }
REPO=${1:-$HOME/halo-spaces}
# Falscher oder fehlender Repo-Ordner (z. B. eine Option, die diese Version
# nicht kennt): sofort abbrechen statt ohne Auftrag weiterzulaufen
if [[ ! -d $REPO/.git || ! -f $REPO/tests/nachtlauf-auftrag.md ]]; then
  print -u2 "FEHLER: kein halo.spaces-Checkout unter „$REPO“ (Aufruf: ${0:t} [--push-test <Text>] [<Repo-Ordner>]) – abgebrochen"
  exit 2
fi
# LaunchAgents lesen ~/.zprofile nicht: claude, gh und python3 ergänzen
path=(~/.local/bin /opt/homebrew/bin /usr/local/bin /Library/Frameworks/Python.framework/Versions/Current/bin $path)
DIR=$HOME/halo-nacht
BERICHTE=$HOME/halo-berichte
AB=${HALO_NACHT_AB:-2026-11-04}
TAG=$(date +%F)
mkdir -p $DIR $BERICHTE
LOG=$DIR/$TAG.log
BERICHT=$BERICHTE/$TAG-nachtlauf.md
FERTIG=$DIR/$TAG.fertig
LOCK=$DIR/lauf.lock
START=$(date +%s)
ENDE=$(date -j -v8H -v0M -v0S +%s)       # nach 08:00 nicht mehr fortsetzen
NACHT_ENDE_TEXT=08:00
HART=$(date -j -v9H -v0M -v0S +%s)       # um 09:00 wird claude beendet
# zeit, log, push (Zeile aufs iPhone) und belegt: gemeinsam mit den anderen Läufen
source ${0:A:h}/lauf-hilfen.zsh
# Vorprüfung ohne Claude: nachtlauf_arbeit(), uebersprungen()
source ${0:A:h}/vorpruefung.zsh
# CI-Abschluss: ci_nacht_abschluss, ci_laeufe_holen, ci_vollrunde_24h
source ${0:A:h}/ci-runde.zsh
# ungespeicherte Reste im Checkout sind kein Grund auszulassen: der Auftrag nimmt sie mit
REST_MITNEHMEN=1

bericht_kurz() {
  # erste Zeile „Kurz: …“ des Berichts, sonst seine Überschrift
  local z=$(grep -m1 '^Kurz:' $BERICHT 2>/dev/null | sed 's/^Kurz: *//')
  [[ -z $z ]] && z=$(grep -m1 '^# ' $BERICHT 2>/dev/null | sed 's/^# *//')
  print -r -- $z
}

# CI-Abschluss nach der lokalen Arbeit; hängt seine Zeilen an den Bericht. Nie ein Abbruch.
ci_abschluss() {
  local zeilen
  log "Start CI-Abschluss"
  zeilen=$(ci_nacht_abschluss $START $HART 2>/dev/null)
  log "CI-Abschluss: ${zeilen//$'\n'/ | }"
  { print; print "## CI-Runde der Nacht (nachtlauf.sh)"; print; print -r -- $zeilen } >> $BERICHT
}

# Aufräumen unbenötigter Reste mit Risiko null (Maintainer 14.11.2026, Wortlaut in ENTSCHEIDUNGEN.md;
# tests/aufraeumen.sh): Arbeitskopien der Hilfsagenten, tote Sperrdateien, in main enthaltene Zweige
# claude/…, rest/…, pruef/… (ersetzt das Zweig-Aufräumen vom 7.11.2026). Claude ruft es in Schritt 6a des
# Auftrags auf und schreibt „## Aufgeräumt“ in den Bericht. Hier der Rückfall (auch bei „übersprungen“):
# fehlt der Abschnitt, hängt das Skript ihn an; sonst nur eine Nachlese, wenn noch etwas entfernt wurde.
# Nie ein Abbruch.
AUFR=${0:A:h}/aufraeumen.sh
aufraeumen_abschluss() {
  local zeilen
  if [[ ! -r $AUFR ]]; then
    log "Aufräumen: $AUFR fehlt"
    { print; print "## Aufgeräumt (nachtlauf.sh)"; print; print -r -- "- aufraeumen.sh fehlt in ${AUFR:h}, nichts aufgeräumt" } >> $BERICHT
    return 0
  fi
  zeilen=$(LOG=$LOG zsh $AUFR $REPO 2>&1)
  log "Aufräumen: ${zeilen//$'\n'/ | }"
  if ! grep -q '^## Aufgeräumt' $BERICHT 2>/dev/null; then
    { print; print "## Aufgeräumt (nachtlauf.sh)"; print; print -r -- $zeilen } >> $BERICHT
  elif [[ $zeilen != Aufgeräumt:\ 0* ]]; then
    { print; print "## Aufgeräumt, Nachlese (nachtlauf.sh)"; print; print -r -- $zeilen } >> $BERICHT
  fi
  return 0
}

# Rote Nebenzweige (docs/release.md „Rote Änderung auf einen Nebenzweig“, Maintainer 18.11.2026: „opus soll hier eine
# lösung finden damit die regel ab sofort für alle sessions und agents und wächter aktiv ist“; Bericht
# ~/halo-berichte/2026-11-19-rot-regel.md): mechanischer Auslöser nach Laufende, kein Claude. Neue Zweige pruef/rot-*
# (von tests/rot-nebenzweig.sh, noch nicht in ~/halo-nacht/rot-gemeldet.txt) gehen mit der Modellstufe aus
# rot-zaehler.txt an neon (an_neon, kein iPhone-Push), neon startet die Untersuchung. Nachkontrolle: Reverts auf main seit
# Beginn des Laufs ohne Zählerzeile für den zurückgenommenen Commit → WARNUNG im Bericht (Rücknahme an
# tests/rot-nebenzweig.sh vorbei). Zeilen auf stdout; nie ein Abbruch. Nicht zugestellt: bleibt offen, nächster Lauf
# meldet erneut. Zum Proben: HALO_ROT_GEMELDET (Datei), HALO_PUSH_TROCKEN=1, ROT_TROCKEN=1 (nichts vermerkt).
rot_zweige_abschluss() {   # <Start-Epoch>
  local start=$1 gemeldet=${HALO_ROT_GEMELDET:-$DIR/rot-gemeldet.txt} zaehler=$(rot_datei) z zw k st c x text= n=0
  local -a neu
  for zw in $(git -C $REPO for-each-ref --format='%(refname:short)' 'refs/heads/pruef/rot-*' 2>/dev/null); do
    [[ -r $gemeldet ]] && grep -qxF -- $zw $gemeldet && continue
    neu+=($zw)
  done
  for zw in $neu; do
    z=$( [[ -r $zaehler ]] && awk -F'\t' -v z=$zw '$3 == z' $zaehler | tail -1)
    k=$(print -r -- $z | cut -f2) st=$(print -r -- $z | cut -f4) c=$(print -r -- $z | cut -f5)
    if [[ -n $st ]]; then st="Modellstufe: $st. Rot in 14 Tagen → $(rot_wort $st)"
    else st="Modellstufe: unbekannt (keine Zählerzeile) → Opus"; fi
    text+="- $zw (Commit ${${c:-$(git -C $REPO log -1 --format=%H $zw 2>/dev/null)}[1,7]}${k:+, Schlüssel $k}: $(git -C $REPO log -1 --format=%s $zw 2>/dev/null | cut -c1-100)); $st"$'\n'
  done
  if (( ${#neu} )); then
    print -r -- "- Neue rote Nebenzweige: ${#neu}"
    print -rn -- $text
    if an_neon "[nachtlauf] Rote Nebenzweige der Nacht $TAG (tests/rot-nebenzweig.sh):
${text}Bitte je Zweig die Untersuchung mit dem genannten Modell und Skill systematic-debugging auf dem Zweig starten (docs/release.md „Rote Änderung auf einen Nebenzweig“, AGENTS.md „Rot bleibt rot“); der Fix kommt mit dem Zweig zurück nach main, Board-Karte laut Notiz.
neon kümmert sich." nachtlauf; then
      [[ -n $ROT_TROCKEN ]] || print -rl -- $neu >> $gemeldet
      print -r -- "- an neon gemeldet"
    else
      print -r -- "- WARNUNG: Meldung an neon nicht zugestellt (AN-NEON-FEHLER), der nächste Lauf meldet erneut"
    fi
  else
    print -r -- "- Neue rote Nebenzweige: keine"
  fi
  # Nachkontrolle: Reverts seit Beginn des Laufs ohne Zählerzeile
  for z in ${(f)"$(git -C $REPO log main --since=@$start --format='%h%x09%b' --grep='This reverts commit' 2>/dev/null | grep -E '^[0-9a-f]{7,}\t|This reverts commit')"}; do
    [[ $z == (#b)([0-9a-f](#c7,))$'\t'* ]] && c=$match[1]
    [[ $z == (#b)*'This reverts commit '([0-9a-f](#c7,40))* ]] || continue
    x=$match[1]
    if [[ ! -r $zaehler ]] || ! awk -F'\t' -v x=$x 'index($5, substr(x, 1, 7)) == 1 || index(x, $5) == 1 && length($5) >= 7 { f = 1 } END { exit !f }' $zaehler; then
      print -r -- "- WARNUNG: Revert $c nimmt ${x[1,7]} zurück, ohne Zählerzeile in rot-zaehler.txt – war es wegen roter CI, lief es an tests/rot-nebenzweig.sh vorbei (Nebenzweig, Zähler und Board-Notiz fehlen; nachholen nach docs/release.md)"
      n=$((n + 1))
    fi
  done
  (( n )) || print -r -- "- Nachkontrolle: kein Revert seit Beginn des Laufs ohne Zählerzeile"
  return 0
}
rot_abschluss() {
  local zeilen
  zeilen=$(rot_zweige_abschluss $START 2>&1)
  log "Rote Nebenzweige: ${zeilen//$'\n'/ | }"
  { print; print "## Rote Nebenzweige (nachtlauf.sh)"; print; print -r -- $zeilen } >> $BERICHT
}

if [[ -n $TROCKEN ]]; then
  # Probelauf: Protokoll in eine Wegwerf-Datei (die echte würde der CI-Wächter als Nachtfenster lesen),
  # Beginn der Nacht = heute 01:30
  LOG=$(mktemp) CI_TROCKEN=1
  print "Aufräumen (Probelauf, nichts entfernt):"
  zsh $AUFR --trocken $REPO
  print "CI-Abschluss (Probelauf, $(zeit)):"
  ci_nacht_abschluss $(date -j -v1H -v30M -v0S +%s) $HART
  print "Rote Nebenzweige (Probelauf, nichts gemeldet oder vermerkt):"
  HALO_PUSH_TROCKEN=1 ROT_TROCKEN=1 rot_zweige_abschluss $(date -j -v1H -v30M -v0S +%s)
  print "Protokoll: $(<$LOG)"
  rm -f $LOG
  exit 0
fi

if [[ -n $PUSH_TEST ]]; then
  push $PUSH_TEST
  tail -1 $LOG
  exit 0
fi

# vor dem ersten erlaubten Tag: gar nichts tun (auch kein Bericht)
if [[ $TAG < $AB ]]; then
  log "vor $AB – kein Lauf"
  exit 0
fi

# Bericht ohne Claude (ausgelassen, pausiert, Claude nicht fertig geworden)
notbericht() {
  local titel=$1 grund=$2
  {
    print "# halo.spaces Nachtlauf $TAG – $titel"
    print
    print "Kurz: $titel${grund:+ – $grund}"
    print
    print "$(zeit), $(hostname -s)"
    if [[ -n $3 ]]; then
      print
      print "## Commits dieser Nacht"
      print
      git -C $REPO log --since="@$START" --format='- %h %s' 2>/dev/null | cut -c1-200
      print
      print "## CI-Läufe dieser Nacht"
      print
      gh run list -R sruf79/halo-spaces -w test.yml -b main -L 10 \
        --json databaseId,createdAt,status,conclusion,headSha \
        --jq ".[] | select((.createdAt | fromdate) >= $START) | \"- \(.databaseId) \(.headSha[:7]): \(.status) \(.conclusion)\"" 2>/dev/null
      print
      print "## Release"
      print
      ls -t $BERICHTE/$TAG-halo.spaces-*.md(N) 2>/dev/null | sed 's/^/- Bericht: /'
      ls -t $REPO/dist/release-*.ok(N) 2>/dev/null | head -1 | sed 's/^/- letzte Testmarke: /'
      print
      print "## Ende des Protokolls ($LOG)"
      print
      print '```'
      tail -40 $LOG
      print '```'
    fi
  } > $BERICHT
}

# --- Pause (eine Datei: ~/halo-nacht/pausen.txt, tests/lauf-hilfen.zsh); abgelaufene Zeilen
# räumt der Nachtlauf an seinem Ende auf, auch hier bei einer Pause ---
if pause_start nachtlauf; then
  notbericht "pausiert" "Pause $PAUSE_GRUND, nichts gemacht"
  pausen_aufraeumen; volldampf_aufraeumen
  exit 0
fi

# --- eigener Lauf schon aktiv? ---
if [[ -e $LOCK ]] && kill -0 $(<$LOCK) 2>/dev/null; then
  log "eigener Lauf (PID $(<$LOCK)) läuft noch – ausgelassen"
  exit 0                                  # der laufende schreibt seinen Bericht selbst
fi
print $$ > $LOCK
trap 'rm -f $LOCK; pausen_aufraeumen; volldampf_aufraeumen' EXIT

# --- läuft schon etwas anderes? Der Lauf des Maintainers geht immer vor (belegt) ---
# Warten (Maintainer 18.11.2026, nachtlauf_warten in tests/vorpruefung.zsh; vorher 90 Minuten nur auf die CI):
# CI bis zu ihrem Ende, längstens 03:30 (dann bleiben bis 06:30 drei Stunden für Arbeit, CI-Runde und Release und
# die Vollrunde startet noch vor 04:30); Testläufe 60 Minuten, release.sh/publish.sh 20 Minuten; andere Sitzung,
# Windows-VM und Reste sofort auslassen. Nach 03:30 von Hand gestartet: CI wie früher höchstens 90 Minuten.
WARTE_GRENZE=$(date -j -v3H -v30M -v0S +%s)
(( $(date +%s) >= WARTE_GRENZE )) && WARTE_GRENZE=$(( $(date +%s) + 5400 ))
if ! GRUND=$(nachtlauf_warten $WARTE_GRENZE); then
  log "ausgelassen: $GRUND"
  notbericht "ausgelassen" "$GRUND"
  push "Nachtlauf $TAG ausgelassen: $GRUND"
  exit 0
fi

# --- Thunderbird aktuell halten: die CI-Runde der Nacht testet dann mit der neuen Version ---
TB_INFO=$(thunderbird_aktualisieren)
log "$TB_INFO"

# --- Claude nur starten, wenn es etwas zu tun gibt (Entscheidung des Maintainers
# vom 6.11.2026, Sitzung global.design.comparison, Wortlaut: „ja, punkt 2 und 3
# umsetzen.“): Vorprüfung ohne Claude, bei „nichts zu tun“ Bericht und Protokollzeile,
# kein Push aufs iPhone. ~/halo-nacht/IMMER erzwingt den Lauf. ---
if GRUND=$(nachtlauf_arbeit); then
  log "Vorprüfung: Arbeit da – $GRUND"
else
  uebersprungen nachtlauf "$GRUND"
  notbericht "übersprungen" "nichts zu tun: $GRUND"
  aufraeumen_abschluss
  ci_abschluss
  log "Ende"
  exit 0
fi

# --- Volldampf: nur mit Zeile in ~/halo-nacht/volldampf.txt. Vor jeder Runde (auch vor dem Director-Plan und
# vor Fortsetzungen) Wochenlimit prüfen: nur bei offenem (auch pausiertem) Fenster ein kontingent.sh-Aufruf (Haiku); ab
# VOLLDAMPF_WOCHE_ENDE pausiert, nach erkanntem freiem Reset von selbst wieder aktiv (lauf-hilfen.zsh, Maintainer
# 18.11.2026; vorher dauerhaftes Ende). Setzt VD_STATUS und die Fortsetzungs-Grenzen. ---
FORTSETZ_MAX=4 VD_STATUS=
VD_FORTSETZ_MAX=${VD_FORTSETZ_MAX:-50} VD_MAX_COMMITS=${VD_MAX_COMMITS:-40}   # Volldampf (17.11.2026, vorher 8 und 12)
NORMAL_GRENZE=$NACHT_GRENZE NORMAL_MAX_COMMITS=$NACHT_MAX_COMMITS   # Werte aus vorpruefung.zsh (ohne Volldampf)
NORMAL_ENDE=$ENDE NORMAL_ENDE_TEXT=$NACHT_ENDE_TEXT VD_WAR=
volldampf_runde() {
  local z
  volldampf_aktiv >/dev/null
  if (( $? != 1 )); then   # aktiv oder pausiert (Wochenlimit): Kontingent lesen, freien Reset erkennen
    z=$(zsh $REPO/tests/kontingent.sh 2>/dev/null)
    [[ $z == Woche* ]] && volldampf_wochenlimit_pruefen ${${z#Woche }%% *}
    [[ $z == Woche* ]] && volldampf_reset_erinnern ${${z#Woche }%% *}   # einmal ab 90 % (eigener Commit)
  fi
  VD_STATUS=$(volldampf_status)
  if volldampf_aktiv >/dev/null; then
    # Maintainer 16.11.2026 („weg 1. wir müssen unser wochenkontingent so rasch wie möglich verbrauchen“): mit Volldampf
    # Fortsetzungen bis 08:45 statt 08:00; claude läuft weiter bis HART (09:00), die Tagesroutine startet um 09:00
    # Maintainer 17.11.2026 („volldampf bedeutet maximale produktivität … einfach alles“): Fortsetzungen und nicht
    # gepushte Commits praktisch ohne Grenze (vorher 8 und 12); es bremsen 08:45, HART 09:00 und das Wochenlimit
    NACHT_GRENZE=08:45 NACHT_MAX_COMMITS=$VD_MAX_COMMITS FORTSETZ_MAX=$VD_FORTSETZ_MAX
    ENDE=$(date -j -v8H -v45M -v0S +%s) NACHT_ENDE_TEXT=08:45 VD_WAR=1
  else
    # ohne Volldampf (aus, abgelaufen, pausiert beim Wochenlimit): sofort alle normalen Grenzen, auch das Ende 08:00 (17.11.2026)
    NACHT_GRENZE=$NORMAL_GRENZE NACHT_MAX_COMMITS=$NORMAL_MAX_COMMITS FORTSETZ_MAX=4
    ENDE=$NORMAL_ENDE NACHT_ENDE_TEXT=$NORMAL_ENDE_TEXT
    # war er in dieser Nacht an und ist jetzt ohne Zeile (von Hand aus): Claude im nächsten Prompt sagen, dass Schritt 1c nicht mehr gilt
    [[ -n $VD_WAR && -z $VD_STATUS ]] && VD_STATUS="Volldampf aus (von Hand ausgeschaltet, $(date +%H:%M)) – ab jetzt gelten alle normalen Regeln, Schritt 1c b) entfällt"
  fi
  [[ -n $VD_STATUS ]] && log "$VD_STATUS"
  return 0
}

# --- Arbeit: claude -p, bei Limit nach 30 Minuten fortsetzen ---
cd $REPO || exit 2
volldampf_runde
SID=$(uuidgen | tr A-Z a-z)
log "Start, Sitzung $SID"
# Vollrunde fällig? Dann soll ein CI-auslösender Push dunkel testen ([dunkel]) – seine Runde ist dann die Vollrunde
CI_HINWEIS="CI-Vollrunde: unbekannt (gh nicht lesbar) – wie fällig behandeln"
CI_D=$(mktemp)
if ci_laeufe_holen $CI_D; then
  if V=$(ci_vollrunde_24h $CI_D); then
    CI_HINWEIS="CI-Vollrunde: in den letzten 24 Stunden gelaufen (Lauf $V) – nichts zu tun"
  else
    CI_HINWEIS="CI-Vollrunde: fällig (seit 24 Stunden keine vollständige Runde auf main)"
  fi
fi
rm -f $CI_D*
AUFTRAG="Heute: $TAG. Bericht: $BERICHT. Fertig-Datei: $FERTIG. Protokoll: $LOG.
Thunderbird auf neon vor dem Lauf: $TB_INFO
$CI_HINWEIS${VD_STATUS:+
Volldampf: $VD_STATUS}

$(<$REPO/tests/nachtlauf-auftrag.md)"
# Sicherheitsnetz: um 09:00 hart beenden
( while (( $(date +%s) < HART )); do sleep 60; done; pkill -f -- "--session-id $SID|--resume $SID" ) &
WACHE=$!
trap 'rm -f $LOCK; kill $WACHE 2>/dev/null; pausen_aufraeumen; volldampf_aufraeumen' EXIT

RUNDE=0 LEER=0 FORTSETZ=0 KOPF_VORHER=
PROMPT=$AUFTRAG
ARGS=(--session-id $SID)
while true; do
  RUNDE=$((RUNDE + 1))
  OUT=$DIR/$TAG-runde$RUNDE.txt
  claude -p --model opus "${ARGS[@]}" --permission-mode auto "$PROMPT" > $OUT 2>&1
  RC=$?
  log "Runde $RUNDE beendet (Exitcode $RC): $(tail -c 300 $OUT | tr '\n' ' ')"
  if [[ -e $FERTIG ]]; then
    # Schritt 5 (Entscheidung des Maintainers vom 8.11.2026, Wortlaut in ENTSCHEIDUNGEN.md): vor 06:30
    # mit machbaren Einträgen und unter der Commit-Grenze (6, Volldampf VD_MAX_COMMITS) ist die Fertig-Datei kein Ende –
    # neue Runde „Schritt 5 fortsetzen“. Höchstens FORTSETZ_MAX Fortsetzungen; eine Fortsetzung ohne neuen
    # Commit beendet (nichts Machbares mehr, z. B. nur Einträge, die eine Entscheidung brauchen).
    KOPF=$(git -C $REPO rev-parse -q main 2>/dev/null)
    if (( FORTSETZ > 0 )) && [[ $KOPF == $KOPF_VORHER ]]; then
      log "Arbeit beendet: nichts Machbares mehr (Fortsetzung $FORTSETZ ohne neuen Commit)"
      break
    fi
    volldampf_runde
    if (( FORTSETZ >= FORTSETZ_MAX )); then
      log "Arbeit beendet: höchstens $FORTSETZ_MAX Fortsetzungen erreicht"
      break
    fi
    if ! FGRUND=$(nachtlauf_fortsetzen $FERTIG); then
      log "Arbeit beendet: $FGRUND"
      break
    fi
    FORTSETZ=$((FORTSETZ + 1)) KOPF_VORHER=$KOPF LEER=0
    mv -f $FERTIG $DIR/$TAG-fertig-runde$RUNDE.txt
    log "Fertig-Datei vor $NACHT_GRENZE – Fortsetzung $FORTSETZ: $FGRUND"
    ARGS=(--resume $SID)
    PROMPT="Schritt 5 fortsetzen (nachtlauf.sh, $(date +%H:%M)): $FGRUND. Die Fertig-Datei ist entfernt. Arbeite nach Schritt 5 des Auftrags die nächsten machbaren Einträge aus dem Plan dieses Laufs ab (gleiche Reihenfolge, je Eintrag committen, nur --only lokal, nicht pushen, kein Release), bis ein gültiger Endegrund eintritt (nichts Machbares mehr, $NACHT_GRENZE erreicht, $NACHT_MAX_COMMITS nicht gepushte Commits). Dann Bericht ergänzen und $FERTIG mit Zeile „Grund: …“ neu anlegen.${VD_STATUS:+ Volldampf: $VD_STATUS (Schritt 1c des Auftrags).}"
    continue
  fi
  (( $(date +%s) >= ENDE )) && { log "Arbeit beendet: $NACHT_ENDE_TEXT erreicht – nicht mehr fortsetzen"; break }
  ARGS=(--resume $SID)
  if grep -qiE "usage limit|hit your limit|limit reached|resets (at )?[0-9]|rate limit|overloaded" $OUT; then
    log "Limit – Pause 30 Minuten"
    sleep 1800
    volldampf_runde      # Wochenlimit (nicht das 5-Stunden-Limit) pausiert Volldampf bis zum freien Reset
    PROMPT="Weiter nach der Limit-Pause: mach dort weiter, wo du warst (Auftrag oben). Zeitgrenzen beachten, am Ende Bericht und Fertig-Datei.${VD_STATUS:+ Volldampf: $VD_STATUS.}"
  else
    # ohne Fertig-Datei beendet: höchstens zweimal nachfragen
    LEER=$((LEER + 1))
    (( LEER > 2 )) && { log "Arbeit beendet: dreimal ohne Fertig-Datei aufgehört"; break }
    volldampf_runde
    PROMPT="${VD_STATUS:+Volldampf: $VD_STATUS. }Du hast aufgehört, aber $FERTIG fehlt. Wenn noch etwas offen ist, weitermachen; sonst jetzt Bericht nach $BERICHT schreiben (Vorgabe im Auftrag) und $FERTIG anlegen."
  fi
done

# --- Bericht sicherstellen, CI-Abschluss anhängen und aufs iPhone ---
if [[ ! -s $BERICHT ]] || (( $(stat -f %m $BERICHT) < START )); then
  notbericht "ohne Abschluss" "Claude hat keinen Bericht geschrieben (Runden: $RUNDE, letzter Exitcode $RC)" mit-details
fi
# Endegrund (Schritt 5, 8.11.2026) und Zahl der Fortsetzungen für Bericht und Wochenprüfung
{
  print; print "## Ende der Arbeit (nachtlauf.sh)"; print
  EG=$(grep 'Arbeit beendet:' $LOG | tail -1 | cut -d' ' -f3-)
  print -r -- "- ${EG:-Arbeit beendet: Fertig-Datei ohne Prüfung (unbekannt)}"
  print "- Fortsetzungen nach der Fertig-Datei (Schritt 5): $FORTSETZ"
  [[ -n $VD_STATUS ]] && print -r -- "- $VD_STATUS (Stand Ende der Arbeit)"
} >> $BERICHT
# Pflichtvermerk (Maintainer 13.11.2026): steht Volldampf nicht in „Kurz:“, setzt das Skript ihn davor
KURZ=$(bericht_kurz)
[[ -n $VD_STATUS && $VD_STATUS != *angemeldet* && $KURZ != *Volldampf* ]] && KURZ="${VD_STATUS%% – *}; $KURZ"
kill $WACHE 2>/dev/null                   # Claude ist fertig; der CI-Abschluss hält selbst die 09:00 ein
aufraeumen_abschluss
ci_abschluss
rot_abschluss
log "Ende"
push "Nachtlauf $TAG: $KURZ – Bericht ~/halo-berichte/$TAG-nachtlauf.md"
exit 0
