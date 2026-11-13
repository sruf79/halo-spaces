# Gemeinsame Hilfen der Läufe auf neon (tests/MAC-MINI.md Abschnitte 13–16):
# nachtlauf.sh, ci-waechter.sh und wochenpruefung.sh (auch als Doku-Prüfung
# mit --doku) laden diese Datei mit
# `source`. Wie die Skripte wird sie nach ~/.config/halo-spaces/ kopiert.
# Erwartet $LOG (Protokolldatei) und für belegt() $REPO.

source ${0:A:h}/sitzung-finden.zsh   # sitzung_finden, sitzung_merken

zeit() { date '+%F %T' }
log() { print -r -- "$(zeit) $*" >> $LOG }

# Pausen mit Ablaufzeit (Anweisung des Maintainers vom 7.11.2026: keine Sperre darf vergessen
# werden; Anlass: ~/halo-tour/PAUSE ist dauerhaft). ~/halo-nacht/pausen.txt, eine Zeile je Pause:
#   <Routine> <bis ISO-Zeit mit Zone, z. B. 2026-11-07T14:05+01:00> <Grund>
# Routinen: siehe PAUSEN_ROUTINEN (eine Stelle) oder „alle“. Es gibt nur diese eine Pausen-Datei;
# alte Dateien (PAUSE, PAUSE-WOCHE, PAUSE-DOKU, ~/halo-tour/PAUSE) werden beim nächsten Start jeder
# Routine übernommen (Zeile mit Ablauf 2999-12-31, „PAUSE MIGRIERT …“) und gelöscht. Kein Claude.
#   pause_start <Routine>      der Einstieg jeder Routine: übernimmt alte Dateien, meldet unlesbare Zeilen,
#                              0 = pausiert (schreibt „ÜBERSPRUNGEN <Routine> pausiert bis …“ ins Protokoll
#                              und in uebersprungen.log, bei HALO_PAUSE_EINMAL=1 (ci-waechter, alle 15 Min.) eine gleiche Zeile nur einmal), sonst 1
#   pause_aktiv <Routine>      0 = pausiert, gibt „bis <Zeit> – <Grund>“ aus; abgelaufene Zeilen zählen
#                              nicht (reiner Zeitvergleich, es wird nichts entfernt)
#   pausen_aufraeumen          entfernt abgelaufene Zeilen, je Zeile „PAUSE ABGELAUFEN …“
#                              ins Protokoll und in uebersprungen.log (läuft am Ende des Nachtlaufs)
#   pause_setzen <Routine> <bis> <Grund>
# Zum Proben: HALO_JETZT=<ISO-Zeit> ersetzt die Uhr, HALO_PAUSEN_DATEI die Datei.
PAUSEN_ROUTINEN=(nachtlauf rundgang dokupruefung wochenpruefung github-komm ci-waechter bilder-eingang)
export HALO_ROUTINEN="$PAUSEN_ROUTINEN"
PAUSEN_PY='
import sys, os, datetime
datei, modus = sys.argv[1], sys.argv[2]
ROUT = set(os.environ.get("HALO_ROUTINEN", "").split()) | {"alle"}
def jetzt():
    j = os.environ.get("HALO_JETZT")
    return datetime.datetime.fromisoformat(j).astimezone() if j else datetime.datetime.now().astimezone()
def lesen(z):
    t = z.strip().split(None, 2)
    if len(t) < 3 or t[0] not in ROUT:
        raise ValueError(z)
    return t[0], datetime.datetime.fromisoformat(t[1]).astimezone(), t[1], t[2]
try:
    zeilen = open(datei, encoding="utf-8").read().splitlines()
except OSError:
    zeilen = []
if modus == "aktiv":
    rolle, n, beste = sys.argv[3], jetzt(), None
    for z in zeilen:
        if not z.strip() or z.lstrip().startswith("#"):
            continue
        try:
            r, bis, roh, grund = lesen(z)
        except ValueError:
            continue
        if r in (rolle, "alle") and bis > n and (beste is None or bis > beste[0]):
            beste = (bis, roh, grund)       # mehrere aktive Zeilen: die mit dem spätesten Ablauf gilt
    if beste:
        print("bis %s – %s" % (beste[1], beste[2])); sys.exit(0)
    sys.exit(1)
if modus == "unlesbar":
    for z in zeilen:
        if not z.strip() or z.lstrip().startswith("#"):
            continue
        try:
            lesen(z)
        except ValueError:
            print(z.strip())
    sys.exit(0)
if modus == "aufraeumen":
    n, bleibt, weg = jetzt(), [], []
    for z in zeilen:
        if not z.strip() or z.lstrip().startswith("#"):
            bleibt.append(z); continue
        try:
            ok = lesen(z)[1] > n
        except ValueError:
            ok = True      # unlesbar: bleibt stehen (wird gemeldet, nicht gelöscht)
        (bleibt if ok else weg).append(z)
    if weg:
        open(datei, "w", encoding="utf-8").write("".join(l + "\n" for l in bleibt))
        for z in weg:
            print(z)
'
# unlesbare Zeilen (Tippfehler in Zeit, Zone oder Routine) bleiben stehen, gelten als NICHT pausierend
# und werden einmal je Lauf (Prozess) als „PAUSE UNLESBAR …“ gemeldet; Leerzeilen und „#“ zählen nicht
pausen_unlesbar_melden() {
  local z datei=${HALO_PAUSEN_DATEI:-$HOME/halo-nacht/pausen.txt}
  local marke=${TMPDIR:-/tmp}/halo-pausen-unlesbar.$$.$(print -r -- $datei | cksum | cut -d' ' -f1)
  [[ -r $datei && ! -e $marke ]] || return 0
  python3 -I -c $PAUSEN_PY $datei unlesbar 2>/dev/null | while IFS= read -r z; do
    [[ -n $LOG ]] && log "PAUSE UNLESBAR $z – Routine läuft trotzdem"
    print -r -- "$(zeit) PAUSE UNLESBAR $z – Routine läuft trotzdem" >> ${HALO_UEBERSPRUNGEN_LOG:-$HOME/halo-nacht/uebersprungen.log}
  done
  : > $marke
}
pause_aktiv() {
  local datei=${HALO_PAUSEN_DATEI:-$HOME/halo-nacht/pausen.txt}
  [[ -r $datei ]] || return 1
  pausen_unlesbar_melden
  python3 -I -c $PAUSEN_PY $datei aktiv $1 2>/dev/null
}
pausen_aufraeumen() {
  local z datei=${HALO_PAUSEN_DATEI:-$HOME/halo-nacht/pausen.txt}
  [[ -r $datei ]] || return 0
  pausen_unlesbar_melden
  python3 -I -c $PAUSEN_PY $datei aufraeumen 2>/dev/null | while IFS= read -r z; do
    [[ -n $LOG ]] && log "PAUSE ABGELAUFEN $z"
    print -r -- "$(zeit) PAUSE ABGELAUFEN $z" >> ${HALO_UEBERSPRUNGEN_LOG:-$HOME/halo-nacht/uebersprungen.log}
  done
}
# alte Pausen-Dateien übernehmen: <Datei>:<Routine>; HALO_NACHT_DIR/HALO_TOUR_DIR zum Proben
pausen_migrieren() {
  local nacht=${HALO_NACHT_DIR:-$HOME/halo-nacht} tour=${HALO_TOUR_DIR:-$HOME/halo-tour} e f r
  local datei=${HALO_PAUSEN_DATEI:-$nacht/pausen.txt}
  [[ -n $HALO_PAUSE_TROCKEN ]] && return 0      # Trockenlauf ändert nichts
  for e in $nacht/PAUSE:nachtlauf $nacht/PAUSE-WOCHE:wochenpruefung $nacht/PAUSE-DOKU:dokupruefung $tour/PAUSE:rundgang; do
    f=${e%%:*} r=${e##*:}
    [[ -e $f ]] || continue
    mkdir -p ${datei:h}
    print -r -- "$r 2999-12-31T00:00+01:00 migriert aus ${f/#$HOME/~} (Datei gelöscht, bei Bedarf Zeile kürzen)" >> $datei || continue
    rm -f $f
    [[ -n $LOG ]] && log "PAUSE MIGRIERT $r aus ${f/#$HOME/~}"
    print -r -- "$(zeit) PAUSE MIGRIERT $r aus ${f/#$HOME/~}" >> ${HALO_UEBERSPRUNGEN_LOG:-$nacht/uebersprungen.log}
  done
}
pause_start() {   # <Routine>
  local r=$1 g text letzte uelog=${HALO_UEBERSPRUNGEN_LOG:-$HOME/halo-nacht/uebersprungen.log}
  pausen_migrieren
  g=$(pause_aktiv $r) || return 1
  text="ÜBERSPRUNGEN $r pausiert $g"
  [[ -n $HALO_PAUSE_EINMAL ]] && letzte=$(grep -aF "ÜBERSPRUNGEN $r pausiert " $uelog 2>/dev/null | tail -1)
  if [[ -z $HALO_PAUSE_EINMAL || ${letzte#* * } != $text ]]; then   # Zeitstempel „Datum Zeit “ abschneiden
    [[ -n $LOG ]] && log "$text"
    print -r -- "$(zeit) $text" >> $uelog
  fi
  PAUSE_GRUND=$g
  return 0
}
pause_setzen() {   # <Routine> <bis ISO-Zeit mit Zone> <Grund>
  local datei=${HALO_PAUSEN_DATEI:-$HOME/halo-nacht/pausen.txt}
  [[ -n $1 && -n $2 && -n $3 ]] || { print -u2 "Aufruf: pause_setzen <Routine> <bis> <Grund>"; return 2 }
  print -r -- "$1 $2 ${*[3,-1]}" > $datei.neu
  # prüfen, dass die Zeile lesbar ist: sie muss bei einer Uhr vor der Ablaufzeit aktiv sein
  local ok=1
  HALO_JETZT=2000-01-01T00:00+00:00 HALO_PAUSEN_DATEI=$datei.neu pause_aktiv $1 >/dev/null || ok=0
  rm -f $datei.neu
  (( ok )) || { print -u2 "pause_setzen: Routine oder Zeit nicht lesbar"; return 1 }
  mkdir -p ${datei:h}; print -r -- "$1 $2 ${*[3,-1]}" >> $datei
}

# Volldampf (Maintainer 13.11.2026, Wortlaute in ENTSCHEIDUNGEN.md, docs/testrechner.md „Volldampf“): ein
# Override-Schalter für Sparmodus, Sollkurve, Reserve und Vorsicht der Planung („Ist wie ein override
# schalter“). Wie die Pausen eine Datei mit Zeitfenster, aber umgekehrt – sie gibt Kontingent frei.
# ~/halo-nacht/volldampf.txt, eine Zeile je Fenster:
#   volldampf <ab ISO-Zeit mit Zone> <bis ISO-Zeit mit Zone> <Grund>
# Aktiv nur zwischen ab und bis (reiner Zeitvergleich) und solange das Fenster nicht beendet ist. Beendet
# wird es DAUERHAFT, sobald die Woche („alle Modelle“) VOLLDAMPF_WOCHE_ENDE (98 %) erreicht („wenn das
# wochenlimit erreicht wurde wird Volldampf automatisch deaktiviert“): volldampf_wochenlimit_pruefen schreibt
# dann „<ab> <bis> <Zeit> <Woche>“ nach ~/halo-nacht/volldampf-beendet.txt. Danach bleibt das Fenster aus,
# auch wenn der Wert nach dem freien Reset oder dem Wochenreset sinkt; wieder ein schaltet nur der Maintainer
# mit einer neuen Zeile (anderes ab oder bis). Das 5-Stunden-Limit beendet Volldampf nicht.
# Abgelaufene Zeilen zählen nicht (auch nicht als „angemeldet“); unlesbare Zeilen (Tippfehler, ab nicht vor
# bis) gelten als NICHT aktiv und stehen einmal je Lauf als „VOLLDAMPF UNLESBAR …“ im Protokoll und in
# uebersprungen.log. Kein Claude (außer der Zustellung von push()).
#   volldampf_aktiv              0 = aktiv, gibt „bis <Zeit> – <Grund>“ aus (mehrere: spätestes Ende);
#                                2 = Fenster jetzt, aber beendet, gibt „beendet: Wochenlimit erreicht um
#                                <TT.MM. HH:MM> (<N> %), Fenster bis <Zeit>“ aus; 1 = kein Fenster jetzt
#   volldampf_angemeldet         0 = ein künftiges Fenster steht in der Datei, gibt „ab <Zeit>, bis <Zeit>“ aus
#   volldampf_status             eine Zeile für Berichte: „Volldampf aktiv bis … (endet bei Wochenlimit)“,
#                                „Volldampf beendet: Wochenlimit erreicht um …“ oder „Volldampf angemeldet
#                                (ab …, bis …), nicht aktiv“; Rückgabe 1 und keine Ausgabe ohne Fenster
#   volldampf_wochenlimit_pruefen [<Woche %>]  am Beginn jeder Runde bzw. Schleife: Woche aus dem Argument,
#                                HALO_VOLLDAMPF_WOCHE oder ~/halo-nacht/kontingent.json (höchstens 3 Stunden
#                                alt, sonst nichts geprüft); ab VOLLDAMPF_WOCHE_ENDE: Marker, Protokollzeile
#                                „Volldampf beendet: Wochenlimit erreicht (N %, HH:MM)“, einmal push().
#                                Rückgabe 0 = gerade beendet
#   volldampf_setzen <ab> <bis> <Grund>
#   volldampf_aufraeumen         entfernt abgelaufene Zeilen, je Zeile „VOLLDAMPF ABGELAUFEN …“ (Ende Nachtlauf)
# Zum Proben: HALO_JETZT=<ISO-Zeit> ersetzt die Uhr, HALO_VOLLDAMPF_DATEI die Datei, HALO_VOLLDAMPF_BEENDET
# den Marker, HALO_KONTINGENT_JSON die Kontingent-Datei, HALO_VOLLDAMPF_WOCHE den Wochenwert.
VOLLDAMPF_WOCHE_ENDE=${VOLLDAMPF_WOCHE_ENDE:-98}   # Vorschlag (neon, 13.11.2026): ab hier gilt das Wochenlimit als erreicht
VOLLDAMPF_PY='
import sys, os, datetime
datei, modus = sys.argv[1], sys.argv[2]
marker = sys.argv[3] if len(sys.argv) > 3 else ""
def jetzt():
    j = os.environ.get("HALO_JETZT")
    return datetime.datetime.fromisoformat(j).astimezone() if j else datetime.datetime.now().astimezone()
def lesen(z):
    t = z.strip().split(None, 3)
    if len(t) < 4 or t[0] != "volldampf":
        raise ValueError(z)
    ab, bis = datetime.datetime.fromisoformat(t[1]), datetime.datetime.fromisoformat(t[2])
    if ab.tzinfo is None or bis.tzinfo is None or not ab < bis:
        raise ValueError(z)
    return ab.astimezone(), bis.astimezone(), t[1], t[2], t[3]
def zeilen_von(p):
    try:
        return open(p, encoding="utf-8").read().splitlines()
    except OSError:
        return []
zeilen = zeilen_von(datei)
beendet = {}
for z in zeilen_von(marker) if marker else []:
    t = z.split()
    if len(t) >= 4:
        beendet[(t[0], t[1])] = (t[2], t[3])
def gueltig():
    for z in zeilen:
        if not z.strip() or z.lstrip().startswith("#"):
            continue
        try:
            yield z, lesen(z)
        except ValueError:
            yield z, None
n = jetzt()
if modus in ("aktiv", "fenster"):
    offen = [w for z, w in gueltig() if w and w[0] <= n < w[1]]
    an = [w for w in offen if (w[2], w[3]) not in beendet]
    if an:
        b = max(an, key=lambda w: w[1])
        print(("%s %s" % (b[2], b[3])) if modus == "fenster" else ("bis %s – %s" % (b[3], b[4]))); sys.exit(0)
    if offen and modus == "aktiv":
        b = max(offen, key=lambda w: w[1]); um, wo = beendet[(b[2], b[3])]
        u = datetime.datetime.fromisoformat(um).astimezone()
        print("beendet: Wochenlimit erreicht um %s (%s %%), Fenster bis %s" % (u.strftime("%d.%m. %H:%M"), wo, b[3])); sys.exit(2)
    sys.exit(1)
if modus == "angemeldet":
    k = sorted((w for z, w in gueltig() if w and w[0] > n), key=lambda w: w[0])
    if k:
        print("ab %s, bis %s" % (k[0][2], k[0][3])); sys.exit(0)
    sys.exit(1)
if modus == "unlesbar":
    for z, w in gueltig():
        if w is None:
            print(z.strip())
    sys.exit(0)
if modus == "aufraeumen":
    bleibt, weg = [], []
    for z in zeilen:
        try:
            ok = not z.strip() or z.lstrip().startswith("#") or lesen(z)[1] > n
        except ValueError:
            ok = True      # unlesbar: bleibt stehen (wird gemeldet, nicht gelöscht)
        (bleibt if ok else weg).append(z)
    if weg:
        open(datei, "w", encoding="utf-8").write("".join(l + "\n" for l in bleibt))
        for z in weg:
            print(z)
'
volldampf_unlesbar_melden() {
  local z datei=${HALO_VOLLDAMPF_DATEI:-$HOME/halo-nacht/volldampf.txt}
  local marke=${TMPDIR:-/tmp}/halo-volldampf-unlesbar.$$.$(print -r -- $datei | cksum | cut -d' ' -f1)
  [[ -r $datei && ! -e $marke ]] || return 0
  python3 -I -c $VOLLDAMPF_PY $datei unlesbar 2>/dev/null | while IFS= read -r z; do
    [[ -n $LOG ]] && log "VOLLDAMPF UNLESBAR $z – gilt als nicht aktiv"
    print -r -- "$(zeit) VOLLDAMPF UNLESBAR $z – gilt als nicht aktiv" >> ${HALO_UEBERSPRUNGEN_LOG:-$HOME/halo-nacht/uebersprungen.log}
  done
  : > $marke
}
volldampf_marker() { print -r -- ${HALO_VOLLDAMPF_BEENDET:-$HOME/halo-nacht/volldampf-beendet.txt} }
volldampf_aktiv() {
  local datei=${HALO_VOLLDAMPF_DATEI:-$HOME/halo-nacht/volldampf.txt}
  [[ -r $datei ]] || return 1
  volldampf_unlesbar_melden
  python3 -I -c $VOLLDAMPF_PY $datei aktiv $(volldampf_marker) 2>/dev/null
}
volldampf_angemeldet() {
  local datei=${HALO_VOLLDAMPF_DATEI:-$HOME/halo-nacht/volldampf.txt}
  [[ -r $datei ]] || return 1
  volldampf_unlesbar_melden
  python3 -I -c $VOLLDAMPF_PY $datei angemeldet 2>/dev/null
}
volldampf_status() {
  local g rc
  g=$(volldampf_aktiv); rc=$?
  if (( rc == 0 )); then print -r -- "Volldampf aktiv ${g/ – / (endet bei Wochenlimit) – }"; return 0; fi
  if (( rc == 2 )); then print -r -- "Volldampf $g"; return 0; fi
  if g=$(volldampf_angemeldet); then print -r -- "Volldampf angemeldet ($g), nicht aktiv"; return 0; fi
  return 1
}
# Wochenwert („alle Modelle“, ganze Prozent) aus kontingent.json, nur wenn höchstens 3 Stunden alt
volldampf_woche_gespeichert() {
  local j=${HALO_KONTINGENT_JSON:-$HOME/halo-nacht/kontingent.json}
  [[ -r $j ]] || return 1
  python3 -I -c '
import sys, os, json, datetime
d = json.load(open(sys.argv[1])); i = d["info"]
j = os.environ.get("HALO_JETZT")
n = datetime.datetime.fromisoformat(j).astimezone() if j else datetime.datetime.now().astimezone()
stand = datetime.datetime.strptime(d["stand"], "%Y-%m-%dT%H:%M:%S%z")
if not datetime.timedelta(0) <= n - stand <= datetime.timedelta(hours=3): sys.exit(1)
w = i.get("unifiedWindows", {}).get("seven_day", {})
print(round(100 * w.get("utilization", 0)))
' $j 2>/dev/null
}
volldampf_wochenlimit_pruefen() {   # [<Woche %>]
  local datei=${HALO_VOLLDAMPF_DATEI:-$HOME/halo-nacht/volldampf.txt} woche=${1:-$HALO_VOLLDAMPF_WOCHE} f um
  [[ -r $datei ]] || return 1
  [[ -n $woche ]] || woche=$(volldampf_woche_gespeichert) || return 1
  [[ $woche == <-> ]] || woche=${woche%%.*}
  [[ $woche == <-> ]] && (( woche >= VOLLDAMPF_WOCHE_ENDE )) || return 1
  f=$(python3 -I -c $VOLLDAMPF_PY $datei fenster $(volldampf_marker) 2>/dev/null) || return 1
  um=$(python3 -I -c 'import os,datetime as d;j=os.environ.get("HALO_JETZT");print((d.datetime.fromisoformat(j).astimezone() if j else d.datetime.now().astimezone()).isoformat(timespec="minutes"))')
  mkdir -p ${$(volldampf_marker):h}
  print -r -- "$f $um $woche" >> $(volldampf_marker)
  [[ -n $LOG ]] && log "Volldampf beendet: Wochenlimit erreicht ($woche %, ${um[12,16]})"
  print -r -- "$(zeit) Volldampf beendet: Wochenlimit erreicht ($woche %, ${um[12,16]}), Fenster $f" >> ${HALO_UEBERSPRUNGEN_LOG:-$HOME/halo-nacht/uebersprungen.log}
  push "Volldampf beendet, Wochenlimit erreicht ($woche %) – freien Reset in Einstellungen > Nutzung drücken, Volldampf nur auf Zuruf wieder an" "${HALO_LAUF:-volldampf}" handeln
  return 0
}
# Erinnerung an den freien Reset (Vorschlag von neon, 13.11.2026, zur Entscheidung des Maintainers; eigener
# Commit, leicht entfernbar): bei aktivem Volldampf und Woche ab VOLLDAMPF_ERINNERN (90 %) einmal je Fenster
# bzw. Wochenzyklus eine iPhone-Meldung. Zustand in ~/halo-nacht/volldampf-erinnert.txt („<ab> <bis>“ des
# Fensters); sinkt die Woche unter die Schwelle (Reset), wird die Zeile entfernt und die nächste Erinnerung
# ist wieder möglich. volldampf_reset_erinnern <Woche %>; Rückgabe 0 = gerade erinnert.
VOLLDAMPF_ERINNERN=${VOLLDAMPF_ERINNERN:-90}
volldampf_reset_erinnern() {
  local woche=${1%%.*} f datei=${HALO_VOLLDAMPF_DATEI:-$HOME/halo-nacht/volldampf.txt}
  local merk=${HALO_VOLLDAMPF_ERINNERT:-$HOME/halo-nacht/volldampf-erinnert.txt}
  [[ -r $datei && $woche == <-> ]] || return 1
  f=$(python3 -I -c $VOLLDAMPF_PY $datei fenster $(volldampf_marker) 2>/dev/null) || return 1
  if (( woche < VOLLDAMPF_ERINNERN )); then
    [[ -e $merk ]] && grep -qxF -- $f $merk && { grep -vxF -- $f $merk > $merk.neu; mv -f $merk.neu $merk }
    return 1
  fi
  [[ -e $merk ]] && grep -qxF -- $f $merk && return 1
  mkdir -p ${merk:h}; print -r -- $f >> $merk
  [[ -n $LOG ]] && log "Volldampf: Woche $woche % – Erinnerung an den freien Reset gesendet"
  push "Volldampf: Wochenkontingent bei $woche %, freien Reset in Einstellungen > Nutzung drücken?" "${HALO_LAUF:-volldampf}"
  return 0
}
volldampf_aufraeumen() {
  local z datei=${HALO_VOLLDAMPF_DATEI:-$HOME/halo-nacht/volldampf.txt}
  [[ -r $datei ]] || return 0
  volldampf_unlesbar_melden
  python3 -I -c $VOLLDAMPF_PY $datei aufraeumen 2>/dev/null | while IFS= read -r z; do
    [[ -n $LOG ]] && log "VOLLDAMPF ABGELAUFEN $z"
    print -r -- "$(zeit) VOLLDAMPF ABGELAUFEN $z" >> ${HALO_UEBERSPRUNGEN_LOG:-$HOME/halo-nacht/uebersprungen.log}
  done
}
volldampf_setzen() {   # <ab ISO-Zeit mit Zone> <bis ISO-Zeit mit Zone> <Grund>
  local datei=${HALO_VOLLDAMPF_DATEI:-$HOME/halo-nacht/volldampf.txt} ok=1
  [[ -n $1 && -n $2 && -n $3 ]] || { print -u2 "Aufruf: volldampf_setzen <ab> <bis> <Grund>"; return 2 }
  print -r -- "volldampf $1 $2 ${*[3,-1]}" > $datei.neu
  # lesbar? Bei einer Uhr genau zum Beginn muss die Zeile aktiv sein (ohne Marker geprüft)
  HALO_JETZT=$1 python3 -I -c $VOLLDAMPF_PY $datei.neu aktiv >/dev/null 2>&1 || ok=0
  rm -f $datei.neu
  (( ok )) || { print -u2 "volldampf_setzen: Zeit nicht lesbar (ISO mit Zone) oder ab nicht vor bis"; return 1 }
  mkdir -p ${datei:h}; print -r -- "volldampf $1 $2 ${*[3,-1]}" >> $datei
}

# eine Zeile aufs iPhone: eine kurze Claude-Sitzung gibt sie per SendMessage an
# die Sitzung mit Remote Control weiter, die sie als Push-Meldung zustellt.
# Scheitert die Zustellung (Sitzung nicht gefunden, Claude nicht erreichbar,
# Antwort nicht „gesendet“), steht „PUSH-FEHLER <Routine> <Grund>“ im Protokoll
# des Laufs und in ~/halo-nacht/uebersprungen.log (Wochenprüfung zählt sie);
# kein zweiter Versuch, kein weiterer Claude-Aufruf. push <Text> [<Routine>]:
# Routine standardmäßig der Name des aufrufenden Skripts.
# Kennzeichen am Zeilenanfang (Pflichtzeit des Maintainers messbar machen, 10.11.2026):
# „[info]“ ist der Standard; ein drittes Argument „handeln“ (oder HALO_PUSH_ART=handeln)
# macht „[handeln]“ daraus: der Maintainer muss etwas tun oder entscheiden. Solche
# Meldungen stehen zusätzlich als „<Zeit> <Quelle> <Text>“ in ~/halo-nacht/handeln.log
# (HALO_HANDELN_LOG), auch wenn die Zustellung scheitert; tests/handeln-zaehlen.zsh
# zählt sie je Kalenderwoche. HALO_PUSH_TROCKEN=1: nur Kennzeichen und Log, kein Claude.
push() {
  local text=$1 routine=${2:-${ZSH_ARGZERO:t:r}} art=${3:-${HALO_PUSH_ART:-info}} out grund ziel
  [[ $art == handeln ]] || art=info
  text="[$art] ${text//$'\n'/ }"
  if [[ $art == handeln ]]; then
    local hlog=${HALO_HANDELN_LOG:-$HOME/halo-nacht/handeln.log}
    mkdir -p ${hlog:h} 2>/dev/null
    print -r -- "$(zeit) $routine ${text#\[handeln\] }" >> $hlog
  fi
  if [[ -n $HALO_PUSH_TROCKEN ]]; then print -r -- "TROCKEN: push $text"; return 0; fi
  local fehlerlog=${HALO_UEBERSPRUNGEN_LOG:-$HOME/halo-nacht/uebersprungen.log}
  local sollname=${HALO_PUSH_SITZUNG:-github.comm.routine}
  # Name der Empfangssitzung ohne Claude auflösen (auch bei abweichendem Namen);
  # ohne Treffer kein Claude-Aufruf, nur die Fehlerzeile
  ziel=$(sitzung_finden $sollname) || {
    print -r -- "$(zeit) PUSH-FEHLER $routine keine Sitzung „$sollname“ oder ähnlich gefunden (ListAgents/~/.claude/sessions)" >> $fehlerlog
    log "PUSH-FEHLER $routine keine Sitzung „$sollname“ oder ähnlich gefunden"
    return 1 }
  [[ $ziel == $sollname ]] || log "Push: Sitzung „$sollname“ als „$ziel“ gefunden"
  # Text über stdin: --allowedTools nimmt sonst den Auftrag als weiteres Werkzeug
  out=$(print -r -- "Aufgabe ohne Rückfrage: Lade bei Bedarf mit ToolSearch die Werkzeuge ListAgents und SendMessage. Schicke dann mit SendMessage an die Sitzung, deren Name „$ziel“ ist (aus ListAgents), genau diese eine Nachricht und sonst nichts:
PUSH: $text
Antworte danach nur mit „gesendet“ oder „nicht gesendet: <Grund>“." \
    | claude -p --model haiku --permission-mode auto --allowedTools ListAgents SendMessage ToolSearch 2>&1)
  log "Push: $out"
  if [[ ${out:l} == gesendet* ]]; then
    sitzung_merken $sollname $ziel
  else
    grund=${${out#nicht gesendet:}//$'\n'/ }
    grund=${grund# }
    print -r -- "$(zeit) PUSH-FEHLER $routine ${grund[1,200]:-keine Antwort}" >> $fehlerlog
    log "PUSH-FEHLER $routine ${grund[1,200]:-keine Antwort}"
  fi
}

# arbeitet gerade eine andere Claude-Sitzung am Repo? Jede Sitzung schreibt ihr
# Gespräch nach ~/.claude/projects/<Ordner>/<id>.jsonl. Sie arbeitet, solange
# ihre Runde nicht beendet ist: der letzte Eintrag ist eine neue Eingabe, ein
# Werkzeugaufruf oder dessen Ergebnis – nicht die Schlussantwort („end_turn“).
# Wer fertig ist und nur auf eine Antwort wartet, zählt nicht. Eine Runde, in
# der seit 2 Stunden nichts mehr geschrieben wurde (auch nicht von ihren
# Unteragenten), gilt als hängengeblieben und zählt ebenfalls nicht.
# Nicht mitgezählt: Sitzungen der eigenen Läufe (ID im Protokoll unter
# ~/halo-nacht) und Sitzungen, deren letzte Eingabe eine Push-Meldung war (die
# kurzen Zustell-Sitzungen von push() und die Empfangssitzung mit Remote Control)
# sowie die Sitzung neon-board (nur Board und Bilder, Arbeitsordner ~/halo-board
# bzw. HALO_BOARD_DIR): Sie fasst weder Repo noch Thunderbird an und darf
# Nachtlauf, Rundgang und Wochenprüfung nie als „belegt“ aufhalten. Ihr
# Projektordner ~/.claude/projects/…-halo-board passt sonst auf das Muster -halo*.
# Ebenso die GitHub-Kommunikation (Sitzung github.comm.routine, Arbeitsordner
# ~/halo-github bzw. HALO_GITHUB_DIR): nur Issues, PRs und Anhänge, kein
# Thunderbird, Push und Release gesperrt; Projektordner …-halo-github.
# Die 2 Stunden zählen ab dem Zeitstempel des letzten echten Eintrags, nicht ab
# der Dateizeit: /compact schreibt die Datei neu, ohne dass die Runde weitergeht.
# sitzung_arbeitet <datei> [frisch] – „frisch“: ein Unteragent schrieb zuletzt
sitzung_arbeitet() {
  tail -n 300 $1 | FRISCH=${2:-} python3 -c '
import sys, json, os
from datetime import datetime, timezone
letzte = None
for z in sys.stdin:
    try:
        d = json.loads(z)
    except ValueError:
        continue
    # Ausgaben von Befehlen wie /compact sind keine neue Eingabe
    c = (d.get("message") or {}).get("content")
    if d.get("isMeta") or d.get("isCompactSummary") or (isinstance(c, str) and c.lstrip().startswith(("<local-command", "<command-name>"))):
        continue
    if d.get("type") in ("user", "assistant"):
        letzte = d
if letzte is None:
    sys.exit(1)
m = letzte.get("message") or {}
if letzte["type"] == "assistant" and m.get("stop_reason") != "tool_use":
    sys.exit(1)
try:
    alt = datetime.now(timezone.utc) - datetime.fromisoformat(letzte["timestamp"].replace("Z", "+00:00"))
except (KeyError, ValueError):
    sys.exit(0)
sys.exit(1 if alt.total_seconds() > 7200 and not os.environ.get("FRISCH") else 0)
'
}
aktive_sitzung() {
  local f id letzte neu unter board=${${HALO_BOARD_DIR:-$HOME/halo-board}//[\/.]/-}
  local github=${${HALO_GITHUB_DIR:-$HOME/halo-github}//[\/.]/-}
  for f in $HOME/.claude/projects/${HOME//[\/.]/-}-halo*/*.jsonl(N.); do
    [[ ${f:h:t} == $board || ${f:h:t} == $github ]] && continue
    unter=(${f:r}/**/*.jsonl(N.mh-2))
    neu=($f(N.mh-2) $unter)
    (( $#neu )) || continue
    id=${f:t:r}
    grep -qs -- "Sitzung $id" $HOME/halo-nacht/*.log(N) && continue
    letzte=$(grep '"role":"user","content":"' $f | tail -n 1)
    [[ $letzte == *'"content":"Aufgabe ohne Rückfrage: Lade bei Bedarf'* ]] && continue
    [[ $letzte == *'\">\nPUSH: '* ]] && continue
    sitzung_arbeitet $f ${unter:+frisch} || continue
    print $id
    return 0
  done
  return 1
}

# läuft schon etwas, das den Mac braucht? Gibt den Grund aus (Rückgabe 0 = belegt)
belegt() {
  local s
  s=$(aktive_sitzung) && { print "Claude-Sitzung ${s[1,8]} arbeitet gerade am Repo"; return 0 }
  pgrep -f Runner.Worker >/dev/null && { print "CI-Lauf auf dem GitHub-Runner"; return 0 }
  pgrep -f "tests/(halo_test|ui_tour|update_test|store_shots)\.py" >/dev/null && { print "Testlauf (halo_test.py o. ä.)"; return 0 }
  pgrep -f -- "-marionette" >/dev/null && { print "Thunderbird mit Marionette"; return 0 }
  local p
  for p in 2839 2845 {2850..2869}; do
    lsof -nP -iTCP:$p -sTCP:LISTEN >/dev/null 2>&1 && { print "Marionette-Port $p belegt"; return 0 }
  done
  [[ -e $HOME/halo-vm/lauf.lock ]] && kill -0 $(cut -d' ' -f1 $HOME/halo-vm/lauf.lock) 2>/dev/null \
    && { print "Lauf in der Windows-VM"; return 0 }
  pgrep -f "release\.sh|publish\.sh" >/dev/null && { print "release.sh/publish.sh läuft"; return 0 }
  # der Nachtlauf (REST_MITNEHMEN=1) übernimmt liegengebliebene Änderungen selbst –
  # ob noch jemand daran arbeitet, sagt schon aktive_sitzung()
  [[ -z $REST_MITNEHMEN && -n $(git -C $REPO status --porcelain --untracked-files=no 2>/dev/null) ]] \
    && { print "ungespeicherte Änderungen in $REPO (eine andere Sitzung arbeitet)"; return 0 }
  return 1
}

# Thunderbird unter /Applications auf die aktuelle Version von Mozilla bringen
# (Nachtlauf, vor der Arbeit). Wie thunderbird_installieren() in
# mac-mini-setup.sh nur von Mozilla signierte Programme; die alte App wird erst
# ersetzt, wenn die neue vollständig kopiert ist. Gibt eine Zeile für Protokoll
# und Bericht aus; Rückgabe 0 = aktuell oder aktualisiert.
TB_APP=/Applications/Thunderbird.app
MOZILLA_TEAM=43AQ936H96
thunderbird_aktualisieren() {
  local alt neu tmp rc=1
  autoload -Uz is-at-least
  alt=$(defaults read $TB_APP/Contents/Info.plist CFBundleShortVersionString 2>/dev/null)
  neu=$(curl -sSf -m 20 https://product-details.mozilla.org/1.0/thunderbird_versions.json 2>/dev/null |
        sed -n 's/.*"LATEST_THUNDERBIRD_VERSION": *"\([^"]*\)".*/\1/p')
  [[ -z $neu ]] && { print "Thunderbird ${alt:-fehlt}: aktuelle Version nicht abrufbar, nichts geändert"; return 1 }
  [[ -n $alt ]] && is-at-least $neu $alt && { print "Thunderbird $alt ist aktuell"; return 0 }
  pgrep -f "$TB_APP/Contents/MacOS/thunderbird" >/dev/null && { print "Thunderbird $alt läuft gerade – nicht auf $neu aktualisiert"; return 1 }
  # Ersetzen geht nur, wenn die App diesem Benutzer gehört (sonst „Permission denied“)
  [[ -e $TB_APP && ! -O $TB_APP ]] && {
    print "Thunderbird $alt gehört $(stat -f %Su $TB_APP), nicht $USER – nicht auf $neu aktualisiert (einmal: sudo chown -R $USER $TB_APP)"; return 1 }
  tmp=$(mktemp -d) || return 1
  if curl -sSfL -m 900 -o $tmp/tb.dmg "https://download.mozilla.org/?product=thunderbird-latest-SSL&os=osx&lang=en-US" &&
     mkdir $tmp/mnt && hdiutil attach -nobrowse -readonly -quiet -mountpoint $tmp/mnt $tmp/tb.dmg; then
    if codesign --verify --deep --strict $tmp/mnt/Thunderbird.app &&
       [[ $(codesign -dv $tmp/mnt/Thunderbird.app 2>&1 | sed -n 's/^TeamIdentifier=//p') == $MOZILLA_TEAM ]] &&
       ditto $tmp/mnt/Thunderbird.app $tmp/neu.app; then
      rc=0
    fi
    hdiutil detach -quiet $tmp/mnt
  fi
  if (( rc == 0 )); then
    { [[ ! -e $TB_APP ]] || mv $TB_APP $tmp/alt.app } && mv $tmp/neu.app $TB_APP || {
      rc=1; [[ -e $TB_APP ]] || mv $tmp/alt.app $TB_APP 2>/dev/null }
  fi
  rm -rf $tmp
  if (( rc == 0 )); then
    print "Thunderbird von ${alt:-fehlt} auf $(defaults read $TB_APP/Contents/Info.plist CFBundleShortVersionString) aktualisiert"
  else
    print "Thunderbird ${alt:-fehlt}: Aktualisieren auf $neu gescheitert (Download oder Signatur), nichts geändert"
  fi
  return $rc
}
