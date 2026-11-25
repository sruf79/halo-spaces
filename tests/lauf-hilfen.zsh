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
PAUSEN_ROUTINEN=(nachtlauf tagesroutine rundgang dokupruefung wochenpruefung github-komm ci-waechter bilder-eingang zwischen-release auslastung abnahme release-aufraeumen)
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
# Aktiv nur zwischen ab und bis (reiner Zeitvergleich) und solange das Fenster nicht pausiert ist. Erreicht die Woche
# („alle Modelle“) VOLLDAMPF_WOCHE_ENDE (98 %), PAUSIERT Volldampf nur (Maintainer 18.11.2026, Wortlaut in
# ENTSCHEIDUNGEN.md, löst „endet dauerhaft beim Wochenlimit“ vom 13.11.2026 ab): volldampf_wochenlimit_pruefen schreibt
# „<ab> <bis> <Zeit> <Woche>“ nach ~/halo-nacht/volldampf-beendet.txt (Name bleibt, Inhalt = Pausenmarke). Die Marke
# gilt nur bis zum nächsten freien (manuellen) Reset, den wochen_reset_erkennen als Anker in ~/halo-nacht/wochenanker.txt
# festhält, oder bis zum automatischen Wochenreset (Di 00:00 UTC); danach läuft Volldampf von selbst weiter. Ende bleibt
# bis (automatischer Wochenreset) bzw. Widerruf des Maintainers. Das 5-Stunden-Limit pausiert Volldampf nicht.
# Abgelaufene Zeilen zählen nicht (auch nicht als „angemeldet“); unlesbare Zeilen (Tippfehler, ab nicht vor
# bis) gelten als NICHT aktiv und stehen einmal je Lauf als „VOLLDAMPF UNLESBAR …“ im Protokoll und in
# uebersprungen.log. Kein Claude (außer der Zustellung von push()).
#   volldampf_aktiv              0 = aktiv, gibt „bis <Zeit> – <Grund>“ aus (mehrere: spätestes Ende);
#                                2 = Fenster jetzt, aber pausiert, gibt „pausiert: Wochenlimit erreicht um
#                                <TT.MM. HH:MM> (<N> %), wartet auf den freien Reset, Fenster bis <Zeit>“ aus; 1 = kein Fenster
#   volldampf_angemeldet         0 = ein künftiges Fenster steht in der Datei, gibt „ab <Zeit>, bis <Zeit>“ aus
#   volldampf_status             eine Zeile für Berichte: „Volldampf aktiv bis … (pausiert beim Wochenlimit bis zum
#                                freien Reset[; freier Reset TT.MM. HH:MM])“ (im Volldampf gilt das Soll der Kalenderwoche,
#                                Maintainer 20.11.2026, daher kein „Soll bis nächster Reset“ mehr), „Volldampf
#                                pausiert: …“ oder „Volldampf angemeldet (ab …, bis …), nicht aktiv“; Rückgabe 1 ohne Fenster
#   volldampf_wochenlimit_pruefen [<Woche %>]  am Beginn jeder Runde bzw. Schleife: Woche aus dem Argument,
#                                HALO_VOLLDAMPF_WOCHE oder ~/halo-nacht/kontingent.json (höchstens 3 Stunden
#                                alt, sonst nichts geprüft); erst wochen_reset_erkennen, dann ab VOLLDAMPF_WOCHE_ENDE:
#                                Marke, Protokollzeile „Volldampf pausiert: Wochenlimit erreicht (N %, HH:MM)“, einmal
#                                push(). Rückgabe 0 = gerade pausiert
#   volldampf_setzen <ab> <bis> <Grund>
#   volldampf_aufraeumen         entfernt abgelaufene Zeilen, je Zeile „VOLLDAMPF ABGELAUFEN …“ (Ende Nachtlauf)
# Sollkurve (eine Stelle für Tagesroutine ohne Volldampf, Morgenbrief, volldampf_status; Maintainer 18.11.2026):
#   wochen_soll [<Stunden>]      „<Stunden seit Reset> <Soll %> reset <nächster Reset ISO> <Reset ISO> [<Anker ISO>]“.
#                                Soll = Stunden seit dem Reset (Di 00:00 UTC = Di 01:00 Wiener Zeit, im Sommer 02:00) /
#                                <Stunden> (168) × 100 %, immer, auch nach einem freien Reset (Maintainer 23.11.2026: „die
#                                sollkurve soll aber nicht vom freien reset am samstag aus rechnen sondern immer von dienstag
#                                01:00 auf dienstag 01:00“; ersetzt „Soll bis nächster Reset“ ab dem Anker vom 18.11.2026).
#                                Der Anker dieser Woche steht nur als Information im 6. Feld.
#   kalender_soll [<kontingent.json>]  Soll der Kalenderwoche für Auslastungswächter, Leitstand, Tagesroutine im Volldampf
#                                und Drossel (Maintainer 20.11.2026): vergangene Wochenzeit in %, ohne Anker (unten).
#   wochen_reset_erkennen <Woche %>  vergleicht mit dem letzten gespeicherten Wert (~/halo-nacht/wochenstand.txt, „<ISO>
#                                <Woche>“): fällt die Woche um mindestens VOLLDAMPF_RESET_SPRUNG (20) Punkte, ohne dass der
#                                automatische Reset dazwischen lag, ist das der freie Reset: Zeile „anker <ISO> <vorher>
#                                <nachher>“ in wochenanker.txt, Protokoll, eine [info]-Meldung. Rückgabe 0 = gerade erkannt.
#                                Kein eigener Haiku-Aufruf: nur Werte, die der Lauf ohnehin gelesen hat.
# Zum Proben: HALO_JETZT=<ISO-Zeit> ersetzt die Uhr, HALO_VOLLDAMPF_DATEI die Datei, HALO_VOLLDAMPF_BEENDET
# die Marke, HALO_KONTINGENT_JSON die Kontingent-Datei, HALO_VOLLDAMPF_WOCHE den Wochenwert, HALO_WOCHENANKER und
# HALO_WOCHENSTAND die Anker- und Stand-Datei; HALO_PAUSE_TROCKEN=1 schreibt keinen Stand und keinen Anker.
VOLLDAMPF_WOCHE_ENDE=${VOLLDAMPF_WOCHE_ENDE:-98}   # Vorschlag (neon, 13.11.2026): ab hier gilt das Wochenlimit als erreicht
VOLLDAMPF_RESET_SPRUNG=${VOLLDAMPF_RESET_SPRUNG:-20}   # Maintainer-Auftrag 18.11.2026: Sturz um ≥ 20 Punkte = freier Reset
wochenanker_datei() { print -r -- ${HALO_WOCHENANKER:-$HOME/halo-nacht/wochenanker.txt} }
# gemeinsamer Python-Teil (Reset, Anker, Soll, Kalenderwoche); wird vor VOLLDAMPF_PY und ENTSCHEID_PY (tagesroutine.sh) gesetzt
WOCHE_DEF_PY='
import datetime as _dt
_U = _dt.timezone.utc
def letzter_reset(jetzt, rt=2, rh=0, rm=0):
    """letzter automatischer Wochenreset (Wochentag rt, rh:rm UTC) nicht nach jetzt, in UTC"""
    ju = jetzt.astimezone(_U)
    d = ju.date() - _dt.timedelta(days=(ju.isoweekday() - rt) % 7)
    r = _dt.datetime(d.year, d.month, d.day, rh, rm, tzinfo=_U)
    return r - _dt.timedelta(days=7) if r > ju else r
def anker_liste(datei):
    a = []
    try:
        for z in open(datei, encoding="utf-8"):
            t = z.split()
            if len(t) >= 2 and t[0] == "anker":
                try:
                    x = _dt.datetime.fromisoformat(t[1])
                except ValueError:
                    continue
                if x.tzinfo:
                    a.append(x.astimezone(_U))
    except OSError:
        pass
    return a
def wochen_anker(jetzt, datei, rt=2, rh=0, rm=0):
    """jüngster Anker (freier Reset) seit dem letzten automatischen Reset und nicht nach jetzt, sonst None"""
    r, ju = letzter_reset(jetzt, rt, rh, rm), jetzt.astimezone(_U)
    a = [x for x in anker_liste(datei) if r <= x <= ju]
    return max(a) if a else None
def wochen_soll(jetzt, basis, datei, rt=2, rh=0, rm=0):
    """(Stunden seit Reset, Soll %, \"reset\", nächster Reset, Reset), alle Zeiten UTC; immer ab dem automatischen Reset
    (Di 00:00 UTC = Di 01:00 Wiener Zeit), ein freier Reset (Anker, datei) zählt nicht (Maintainer 23.11.2026)"""
    r, ju = letzter_reset(jetzt, rt, rh, rm), jetzt.astimezone(_U)
    n = r + _dt.timedelta(days=7)
    std = (ju - r).total_seconds() / 3600
    return std, min(100.0, std / float(basis) * 100), "reset", n, r
def kalender_reset(jetzt, kont, rt=2, rh=0, rm=0):
    """(nächster Reset, Quelle) der Kalenderwoche: resetsAt (seven_day) aus kontingent.json, wenn jetzt in der Woche davor
    liegt, sonst die Resetregel (Wochentag rt, rh:rm UTC); Maintainer 20.11.2026, Woche von Dienstag 01:00 bis Dienstag 01:00"""
    ju = jetzt.astimezone(_U)
    try:
        import json as _js
        r = _js.load(open(kont, encoding="utf-8"))["info"]["unifiedWindows"]["seven_day"]["resetsAt"]
        if isinstance(r, (int, float)) and not isinstance(r, bool):
            n = _dt.datetime.fromtimestamp(r, _U)
            if n - _dt.timedelta(days=7) <= ju < n:
                return n, "resetsAt"
    except Exception:
        pass
    return letzter_reset(jetzt, rt, rh, rm) + _dt.timedelta(days=7), "Resetregel"
def kalender_woche(jetzt, kont, rt=2, rh=0, rm=0):
    """(Stunden seit Wochenbeginn, Wochenzeit %, Quelle, nächster Reset, Wochenbeginn); Wochenzeit % = 100 − (Reset − jetzt) / 6048 s"""
    n, q = kalender_reset(jetzt, kont, rt, rh, rm)
    rest = (n - jetzt.astimezone(_U)).total_seconds()
    return (604800 - rest) / 3600, max(0.0, min(100.0, 100 - rest / 6048)), q, n, n - _dt.timedelta(days=7)
'
VOLLDAMPF_PY="$WOCHE_DEF_PY"'
import sys, os, datetime
datei, modus = sys.argv[1], sys.argv[2]
marker = sys.argv[3] if len(sys.argv) > 3 else ""
anker_datei = sys.argv[4] if len(sys.argv) > 4 else ""
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
# Pausenmarke (Wochenlimit) gilt nur bis zum nächsten freien Reset (Anker nach der Marke, nicht nach jetzt) oder bis
# zum automatischen Wochenreset (Maintainer 18.11.2026); vorher war sie dauerhaft
reset_n, anker = letzter_reset(n), [a for a in anker_liste(anker_datei) if a <= n] if anker_datei else []
def pausiert(w):
    m = beendet.get((w[2], w[3]))
    if not m:
        return False
    try:
        um = datetime.datetime.fromisoformat(m[0])
    except ValueError:
        return True
    return um >= reset_n and not any(a > um for a in anker)
if modus in ("aktiv", "fenster"):
    offen = [w for z, w in gueltig() if w and w[0] <= n < w[1]]
    an = [w for w in offen if not pausiert(w)]
    if an:
        b = max(an, key=lambda w: w[1])
        print(("%s %s" % (b[2], b[3])) if modus == "fenster" else ("bis %s – %s" % (b[3], b[4]))); sys.exit(0)
    if offen and modus == "aktiv":
        b = max(offen, key=lambda w: w[1]); um, wo = beendet[(b[2], b[3])]
        u = datetime.datetime.fromisoformat(um).astimezone()
        print("pausiert: Wochenlimit erreicht um %s (%s %%), wartet auf den freien Reset, Fenster bis %s" % (u.strftime("%d.%m. %H:%M"), wo, b[3])); sys.exit(2)
    sys.exit(1)
if modus == "soll":
    std, soll, art, nr, bez = wochen_soll(n, float(sys.argv[5]), anker_datei)
    a = wochen_anker(n, anker_datei) if anker_datei else None   # nur Information (freier Reset dieser Woche)
    print("%.1f %.1f %s %s %s%s" % (std, soll, art, nr.astimezone().isoformat(timespec="minutes"), bez.astimezone().isoformat(timespec="minutes"),
                                    " " + a.astimezone().isoformat(timespec="minutes") if a else ""))
    sys.exit(0)
if modus == "erkennen":
    # argv: datei erkennen marker anker stand woche sprung
    stand, woche, sprung = sys.argv[5], float(sys.argv[6]), float(sys.argv[7])
    vor = None
    try:
        t = open(stand, encoding="utf-8").read().split()
        vor = (datetime.datetime.fromisoformat(t[0]), float(t[1]))
    except (OSError, ValueError, IndexError):
        pass
    neu = n.isoformat(timespec="minutes")
    open(stand + ".neu", "w", encoding="utf-8").write("%s %g\n" % (neu, woche)); os.replace(stand + ".neu", stand)
    if vor and vor[1] - woche >= sprung and vor[0] >= reset_n and vor[0] <= n:
        open(anker_datei, "a", encoding="utf-8").write("anker %s %g %g\n" % (neu, vor[1], woche))
        print("anker %s %g %g" % (neu, vor[1], woche)); sys.exit(0)
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
  python3 -I -c $VOLLDAMPF_PY $datei aktiv $(volldampf_marker) $(wochenanker_datei) 2>/dev/null
}
volldampf_angemeldet() {
  local datei=${HALO_VOLLDAMPF_DATEI:-$HOME/halo-nacht/volldampf.txt}
  [[ -r $datei ]] || return 1
  volldampf_unlesbar_melden
  python3 -I -c $VOLLDAMPF_PY $datei angemeldet 2>/dev/null
}
volldampf_status() {
  local g rc s z="pausiert beim Wochenlimit bis zum freien Reset"
  g=$(volldampf_aktiv); rc=$?
  if (( rc == 0 )); then
    s=($(wochen_soll 168)) && [[ -n $s[6] ]] && z+="; freier Reset $(python3 -I -c 'import sys,datetime as d;print(d.datetime.fromisoformat(sys.argv[1]).astimezone().strftime("%d.%m. %H:%M"))' $s[6])"
    print -r -- "Volldampf aktiv ${g/ – / ($z) – }"; return 0
  fi
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
u = w["utilization"] if "utilization" in w else i["utilization"] if i.get("rateLimitType") == "seven_day" else None
if u is None: sys.exit(1)   # kein Wochenwert: nichts prüfen statt 0 (0 sähe wie ein freier Reset aus, 18.11.2026)
print(round(100 * u))
' $j 2>/dev/null
}
# Sollkurve, gemeinsam für alle Läufe (siehe oben); <Stunden> = Länge der Kurve (168)
wochen_soll() {   # [<Stunden>]
  python3 -I -c $VOLLDAMPF_PY /dev/null soll "" $(wochenanker_datei) ${1:-168} 2>/dev/null
}
# Soll der Kalenderwoche (Maintainer 20.11.2026: „es sind doch bereits 48% vom wochen rythmus vergangen, welcher immer von
# dienstag 01:00 bis dienstag 01:00 geht“): vergangene Wochenzeit in %, ohne Anker und ohne 48-h-Kurve; resetsAt aus
# kontingent.json, sonst die Resetregel (kalender_woche in WOCHE_DEF_PY). Ausgabe wie wochen_soll, Art „kalender“:
#   „<Stunden seit Wochenbeginn> <Soll %> kalender <nächster Reset ISO> <Wochenbeginn ISO> <resetsAt|Resetregel>“
kalender_soll() {   # [<kontingent.json>]
  python3 -I -c "$WOCHE_DEF_PY"'
import sys, os, datetime
j = os.environ.get("HALO_JETZT")
n = datetime.datetime.fromisoformat(j).astimezone() if j else datetime.datetime.now().astimezone()
std, p, q, nr, b = kalender_woche(n, sys.argv[1])
print("%.1f %.1f kalender %s %s %s" % (std, p, nr.astimezone().isoformat(timespec="minutes"), b.astimezone().isoformat(timespec="minutes"), q))' \
    ${1:-${HALO_KONTINGENT_JSON:-$HOME/halo-nacht/kontingent.json}} 2>/dev/null
}
# Fenster-Takt des 5-Stunden-Fensters, eine Stelle für Auslastungswächter und Tagesroutine (Maintainer 18.11.2026: „ich
# möchte nur vermeiden dass die produktivität bei null ist weil wir ständig in das 5h-limit hineinlaufen“; Tagesroutine
# im Volldampf seit 18.11.2026, „ich folge allen empfehlungen von dir.“): Neues nur, solange das Fenster nicht schneller
# verbraucht ist als die verstrichene Zeit plus FENSTER_RESERVE Punkte.
#   fenster_rest [<kontingent.json>]   Sekunden bis zum Fensterende, leer wenn unbekannt (Probe: HALO_FENSTER_REST)
#   fenster_takt <Sekunden bis Fensterende> [<Reserve>]   Takt-Grenze in % (ganzzahlig), Rückgabe 1 wenn unbekannt
# FENSTER_DEF_PY (vor ENTSCHEID_PY der Tagesroutine): fenster_takt(rest, reserve), fenster_takt_frei(ende, h5, reserve)
FENSTER_RESERVE_STANDARD=25
FENSTER_DEF_PY='
def fenster_takt(rest, reserve, dauer=18000):
    """Takt-Grenze in %: verstrichener Anteil des Fensters + Reserve; None, wenn das Fensterende unbekannt ist"""
    if rest is None or rest < 0 or rest > dauer: return None
    return int((dauer - int(rest)) * 100 // dauer + reserve)
def fenster_takt_frei(ende, h5, reserve, dauer=18000):
    """Unix-Sekunden, ab denen der Takt den Stand h5 erreicht (ende = Fensterende in Unix-Sekunden)"""
    return ende - dauer + max(0.0, (h5 - reserve) * dauer / 100.0)
'
fenster_rest() {   # [<kontingent.json>]
  [[ -n ${HALO_FENSTER_REST+x} ]] && { print -r -- $HALO_FENSTER_REST; return }
  python3 -I -c 'import json,sys,time;e=json.load(open(sys.argv[1]))["info"]["unifiedWindows"]["five_hour"];print(max(0,int(e["resetsAt"]-time.time())))' \
    ${1:-$HOME/halo-nacht/kontingent.json} 2>/dev/null
}
fenster_takt() {   # <Sekunden bis Fensterende> [<Reserve>]
  [[ $1 == <-> ]] || return 1
  python3 -I -c "$FENSTER_DEF_PY"'
import sys
t = fenster_takt(int(sys.argv[1]), float(sys.argv[2]))
if t is None: sys.exit(1)
print(t)' $1 ${2:-$FENSTER_RESERVE_STANDARD} 2>/dev/null
}
# Kontingent-Drossel im Volldampf (Maintainer 20.11.2026, ENTSCHEIDUNGEN.md „Kontingent-Drossel nach der Kalenderwoche“: „aber es
# geht mir ja immer darum wieviel % token wir noch im vergleich zur verbleibenden restzeit bis zum reset kommenden dienstag um
# 01:00 haben.“; „ja, stell die ampel so um. wäre es nicht alarmierender, wenn wir mehr % token als % woche verbraucht haben?“;
# ersetzt die Hochrechnung vom 19.11.2026). Kein Verlauf, kein Tempo, kein eigener Claude-Aufruf:
#   d = Verbrauch der Woche (seven_day, %) − vergangene Wochenzeit (%), Wochenzeit % = 100 − (resetsAt − jetzt) / 6048 s
#   (resetsAt aus kontingent.json, ohne lesbares resetsAt die Resetregel Di 00:00 UTC; kalender_woche in WOCHE_DEF_PY).
# Gilt auch nach einem freien Reset: nur die Kalenderwoche zählt (Anker, Tempo und Fehlstunden entfallen für die Stufe).
# Stufen (Grenzen in Punkten d, Deutung von neon, vom Maintainer bestätigt 20.11.2026: „setze die empfehlungen des opus agenten um“):
#   0  d ≤ DROSSEL_STUFE1 (0)                         wie bisher
#   1  bis DROSSEL_STUFE2 (5)                         keine neuen Worker; Tagesroutine kein Fable (Plan, komplex bleiben Opus)
#   2  bis DROSSEL_STUFE3 (15)                        zusätzlich Tagesroutine nur jede zweite Runde
#   3  über DROSSEL_STUFE3                            Tagesroutine nichts Neues bis zur vollen Stunde
# Ab DROSSEL_ROT (90) % verbraucht gilt Stufe 3 nur, wenn zugleich d > 0 (sonst stünde die Tagesroutine am Wochenende bis zu
# ~17 h still; „≥ 90 %“ ist sonst nur das Rot des Dashboards). VOLLDAMPF_WOCHE_ENDE (98) und die Bremsen des
# 5-Stunden-Fensters gelten unverändert daneben. Steigen sofort; zurück erst, wenn d mindestens DROSSEL_HYSTERESE (1) Punkt
# unter der Einschaltgrenze der Stufe liegt. Fail-open (Stufe 0, keine Drossel): kontingent.json fehlt oder unlesbar, ihr
# „stand“ älter als DROSSEL_STAND_STUNDEN (3, wie volldampf_woche_gespeichert), jetzt nach resetsAt oder „stand“ vor dem
# Wochenbeginn (resetsAt − 7 Tage: alter Wochenwert gegen Wochenzeit ~0 nach dem Reset ergäbe fälschlich Stufe 3).
# Zustand gemeinsam für Wächter und Tagesroutine in ~/halo-nacht/drossel-stufe.txt (Zeile 1 „<Stufe> <d in Punkten> <ISO>
# <seit ISO> [offen]“, Zeile 2 Wirkung, Zeile 3 Grund; gilt nur ab dem Wochenbeginn; „offen“ = zuletzt Fail-open, die Stufe
# bleibt nur als Gedächtnis der Hysterese, gilt nicht; der Leitstand liest die Datei). Nur im Volldampf (sonst „aus“).
# Schwellen: DROSSEL_* aus auslastung.conf, danach tagesroutine.conf (gleiche Werte für beide Läufe); DROSSEL_AUS=1 schaltet ab.
# Nie gebremst: Nachtlauf, Zwischen-Release, Tests, Reparatur roter CI, Windows-Rundgang.
#   drossel_stufe [<Woche %>]   Ausgabe „<Stufe> <Text>“, immer Rückgabe 0; ohne Woche der Wert aus kontingent.json
# Probe: HALO_DROSSEL_STUFE=<n> (feste Stufe), HALO_DROSSEL_DATEI, HALO_KONTINGENT_JSON, HALO_JETZT; schreibt nichts bei
# HALO_PAUSE_TROCKEN oder TROCKEN.
DROSSEL_PY="$WOCHE_DEF_PY"'
import sys, os, json, datetime as dt
U = dt.timezone.utc
woche_s, zustand, kont = sys.argv[1], sys.argv[2], sys.argv[3]
g = [float(x) for x in sys.argv[4:7]]
hyst, rot, schreiben, alter_h = float(sys.argv[7]), float(sys.argv[8]), sys.argv[9] == "1", float(sys.argv[10])
j = os.environ.get("HALO_JETZT")
n = (dt.datetime.fromisoformat(j) if j else dt.datetime.now(U)).astimezone(U)
def wien(x): return x.astimezone().strftime("%a %H:%M").replace("Mon", "Mo").replace("Tue", "Di").replace("Wed", "Mi").replace("Thu", "Do").replace("Fri", "Fr").replace("Sat", "Sa").replace("Sun", "So")
_std, zeit, quelle, naechster, beginn = kalender_woche(n, kont)
# Zustand nur ab dem Wochenbeginn gültig (Vorwoche verworfen)
alt, seit, alt_d = 0, None, 0.0
try:
    t = open(zustand, encoding="utf-8").readline().split()
    za = dt.datetime.fromisoformat(t[2]).astimezone(U)
    if beginn <= za <= n and t[0] in ("0", "1", "2", "3"):
        alt, alt_d = int(t[0]), float(t[1])
        seit = t[3] if len(t) > 3 else None
except Exception:
    pass
def offen(grund):
    """Fail-open: keine Drossel; Zustand nur mit neuer Zeit und Marke offen erneuern (Stufe bleibt Gedächtnis der Hysterese)"""
    if schreiben:
        with open(zustand + ".neu", "w", encoding="utf-8") as d:
            d.write("%d %.1f %s %s offen\nkeine Drossel (Fail-open)\n%s\n" % (alt, alt_d, n.isoformat(timespec="minutes"), seit or n.isoformat(timespec="minutes"), grund))
        os.replace(zustand + ".neu", zustand)
    print("0 Fail-open: %s – keine Drossel" % grund); sys.exit(0)
try:
    k = json.load(open(kont, encoding="utf-8")); i = k["info"]
    st = dt.datetime.strptime(k["stand"], "%Y-%m-%dT%H:%M:%S%z").astimezone(U)
except Exception:
    offen("kontingent.json nicht lesbar")
if not dt.timedelta(0) <= n - st <= dt.timedelta(hours=alter_h): offen("Kontingent-Stand %s älter als %g h" % (wien(st), alter_h))
w7 = (i.get("unifiedWindows") or {}).get("seven_day") or {}
ra = w7.get("resetsAt")
if isinstance(ra, (int, float)) and not isinstance(ra, bool) and n >= dt.datetime.fromtimestamp(ra, U):
    offen("Reset %s vorbei, Wochenwert noch von davor" % wien(dt.datetime.fromtimestamp(ra, U)))
if st < beginn: offen("Wochenwert von vor dem Reset %s" % wien(beginn))
u = w7["utilization"] if "utilization" in w7 else i.get("utilization") if i.get("rateLimitType") == "seven_day" else None
u = 100.0 * u if isinstance(u, (int, float)) and not isinstance(u, bool) else None
if woche_s == "-":
    if u is None: offen("Woche nicht lesbar")
    woche = u
else:
    woche = float(woche_s)
    if u is not None and abs(u - woche) < 1: woche = u   # ungerundet, wenn zum übergebenen Wert passend
d = round(woche - zeit, 2)   # gerundet: keine Stufe aus Rechenrest an den Grenzen
roh = sum(1 for x in g if d > x)
if woche >= rot and d > 0: roh = 3
neu = roh
if roh < alt:
    neu = alt
    while neu > roh and d <= g[neu - 1] - hyst: neu -= 1
was = {0: "reicht", 1: "keine neuen Worker, Tagesroutine kein Fable", 2: "keine neuen Worker, Tagesroutine nur jede zweite Runde", 3: "keine neuen Worker, Tagesroutine nichts Neues bis zur vollen Stunde"}[neu]
ds = ("%.1f Punkte über der Zeit" % d) if d > 0 else ("%.1f Punkte unter der Zeit" % abs(d))
rz = (", ab %g %% verbraucht" % rot) if woche >= rot and d > 0 else ""
lage = "Woche %.4g %%, Wochenzeit %.1f %% (Reset %s, %s)%s" % (woche, zeit, wien(naechster), quelle, rz)
# Zustand: Zeile 1 „<Stufe> <d> <ISO> <seit ISO>“, Zeile 2 Wirkung, Zeile 3 Grund (Leitstand liest sie, rechnet nicht neu)
if schreiben:
    if neu != alt or not seit: seit = n.isoformat(timespec="minutes")
    with open(zustand + ".neu", "w", encoding="utf-8") as f:
        f.write("%d %.1f %s %s\n%s\n%s: %s\n" % (neu, d, n.isoformat(timespec="minutes"), seit, was, ds, lage))
    os.replace(zustand + ".neu", zustand)
print("%d Stufe %d (%s%s): %s – %s" % (neu, neu, ds, (", gehalten, Rohstufe %d" % roh) if neu != roh else (", vorher %d" % alt) if alt != neu else "", was, lage))
'
drossel_stufe() {   # [<Woche %>]
  [[ -n $HALO_DROSSEL_STUFE ]] && { print -r -- "$HALO_DROSSEL_STUFE Stufe $HALO_DROSSEL_STUFE (Probe HALO_DROSSEL_STUFE)"; return 0 }
  setopt localoptions extendedglob
  volldampf_aktiv >/dev/null 2>&1 || { print -r -- "0 aus (Volldampf nicht aktiv)"; return 0 }
  local -A d
  d=(DROSSEL_STUFE1 0 DROSSEL_STUFE2 5 DROSSEL_STUFE3 15 DROSSEL_HYSTERESE 1 DROSSEL_ROT 90 DROSSEL_STAND_STUNDEN 3 DROSSEL_AUS 0)
  local f z k v w=${1:-} schreiben=1 a
  for f in ${HALO_AS_CONF:-$HOME/.config/halo-spaces/auslastung.conf} ${HALO_TAGESROUTINE_CONF:-$HOME/.config/halo-spaces/tagesroutine.conf}; do
    [[ -r $f ]] || continue
    while IFS= read -r z; do
      z=${${z%%\#*}//[[:space:]]/}
      [[ $z == DROSSEL_[A-Z0-9_]##=?* ]] || continue
      k=${z%%=*} v=${z#*=}
      (( ${+d[$k]} )) && [[ $v == <->(.<->|) ]] && d[$k]=$v
    done < $f
  done
  [[ $d[DROSSEL_AUS] == 1 ]] && { print -r -- "0 aus (DROSSEL_AUS=1)"; return 0 }
  [[ -n $HALO_PAUSE_TROCKEN$TROCKEN ]] && schreiben=0
  [[ $w == <->(.<->|) ]] || w=-   # „-“: Woche aus kontingent.json
  local datei=${HALO_DROSSEL_DATEI:-$HOME/halo-nacht/drossel-stufe.txt}
  mkdir -p ${datei:h} 2>/dev/null
  a=$(python3 -I -c $DROSSEL_PY $w $datei ${HALO_KONTINGENT_JSON:-$HOME/halo-nacht/kontingent.json} \
      $d[DROSSEL_STUFE1] $d[DROSSEL_STUFE2] $d[DROSSEL_STUFE3] $d[DROSSEL_HYSTERESE] $d[DROSSEL_ROT] $schreiben $d[DROSSEL_STAND_STUNDEN] 2>/dev/null) \
    && [[ $a == [0-3]\ * ]] || a="0 Fail-open: Rechnung gescheitert – keine Drossel"
  print -r -- $a
}
# freien Reset erkennen (Anker), siehe oben; schreibt nichts bei HALO_PAUSE_TROCKEN
wochen_reset_erkennen() {   # <Woche %>
  local woche=${1%%.*} stand=${HALO_WOCHENSTAND:-$HOME/halo-nacht/wochenstand.txt} a
  [[ $woche == <-> && -z $HALO_PAUSE_TROCKEN ]] || return 1
  mkdir -p ${stand:h} ${$(wochenanker_datei):h}
  a=($(python3 -I -c $VOLLDAMPF_PY /dev/null erkennen "" $(wochenanker_datei) $stand $woche $VOLLDAMPF_RESET_SPRUNG 2>/dev/null)) || return 1
  [[ -n $LOG ]] && log "Freier Reset erkannt: Woche $a[3] % → $a[4] %, Anker ${a[2][12,16]} – Volldampf läuft weiter, Soll weiter ab Di 01:00"
  print -r -- "$(zeit) Freier Reset erkannt: Woche $a[3] % → $a[4] %, Anker $a[2]" >> ${HALO_UEBERSPRUNGEN_LOG:-$HOME/halo-nacht/uebersprungen.log}
  push "Freier Reset erkannt (Woche $a[3] % → $a[4] %): Volldampf läuft weiter, Soll jetzt linear bis zum automatischen Reset Dienstag 01:00" "${HALO_LAUF:-volldampf}"
  return 0
}
volldampf_wochenlimit_pruefen() {   # [<Woche %>]
  local datei=${HALO_VOLLDAMPF_DATEI:-$HOME/halo-nacht/volldampf.txt} woche=${1:-$HALO_VOLLDAMPF_WOCHE} f um
  [[ -n $woche ]] || woche=$(volldampf_woche_gespeichert) || return 1
  [[ $woche == <-> ]] || woche=${woche%%.*}
  [[ $woche == <-> ]] || return 1
  wochen_reset_erkennen $woche >/dev/null   # zuerst: ein freier Reset hebt eine Pausenmarke auf
  [[ -r $datei ]] || return 1
  (( woche >= VOLLDAMPF_WOCHE_ENDE )) || return 1
  f=$(python3 -I -c $VOLLDAMPF_PY $datei fenster $(volldampf_marker) $(wochenanker_datei) 2>/dev/null) || return 1
  um=$(python3 -I -c 'import os,datetime as d;j=os.environ.get("HALO_JETZT");print((d.datetime.fromisoformat(j).astimezone() if j else d.datetime.now().astimezone()).isoformat(timespec="minutes"))')
  mkdir -p ${$(volldampf_marker):h}
  print -r -- "$f $um $woche" >> $(volldampf_marker)
  [[ -n $LOG ]] && log "Volldampf pausiert: Wochenlimit erreicht ($woche %, ${um[12,16]}) – keine neuen Einträge, wartet auf den freien Reset"
  print -r -- "$(zeit) Volldampf pausiert: Wochenlimit erreicht ($woche %, ${um[12,16]}), Fenster $f" >> ${HALO_UEBERSPRUNGEN_LOG:-$HOME/halo-nacht/uebersprungen.log}
  push "Volldampf pausiert, Wochenlimit erreicht ($woche %) – freien Reset in Einstellungen > Nutzung drücken, danach läuft Volldampf von selbst weiter bis Dienstag 01:00; Fable-Anteil in Einstellungen > Nutzung mit ansehen" "${HALO_LAUF:-volldampf}" handeln
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
  f=$(python3 -I -c $VOLLDAMPF_PY $datei fenster $(volldampf_marker) $(wochenanker_datei) 2>/dev/null) || return 1
  if (( woche < VOLLDAMPF_ERINNERN )); then
    [[ -e $merk ]] && grep -qxF -- $f $merk && { grep -vxF -- $f $merk > $merk.neu; mv -f $merk.neu $merk }
    return 1
  fi
  [[ -e $merk ]] && grep -qxF -- $f $merk && return 1
  mkdir -p ${merk:h}; print -r -- $f >> $merk
  [[ -n $LOG ]] && log "Volldampf: Woche $woche % – Erinnerung an den freien Reset gesendet"
  push "Volldampf: Wochenkontingent bei $woche %, freien Reset in Einstellungen > Nutzung drücken? Fable-Anteil in Einstellungen > Nutzung mit ansehen" "${HALO_LAUF:-volldampf}"
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
    | claude -p --model haiku --permission-mode auto --allowedTools ListAgents SendMessage ToolSearch 2>&1 \
    | grep -v -E '^(Permission allow rule|Warning: )')   # Warnzeilen (Berechtigungsregel in settings.json 16.11.2026; „Warning: this sign-in ends …“ 20.11.2026) stehen vor der Antwort und haben die Zustellung fälschlich als Fehler gezählt
  log "Push: $out"
  if [[ ${out:l} == (gesendet*|*$'\n'gesendet*) ]]; then
    sitzung_merken $sollname $ziel
  else
    grund=${${out#nicht gesendet:}//$'\n'/ }
    grund=${grund# }
    print -r -- "$(zeit) PUSH-FEHLER $routine ${grund[1,200]:-keine Antwort}" >> $fehlerlog
    log "PUSH-FEHLER $routine ${grund[1,200]:-keine Antwort}"
  fi
}

# Meldung an die Sitzung neon statt aufs iPhone (Maintainer 18.11.2026: „ich möchte hier nicht involviert und informiert
# werden. der wächter soll solche probleme direkt an dich wenden und du kümmerst dich um die nächsten schritte
# automatisch.“). Gleicher Zustellweg wie push() (Haiku, SendMessage an den Sitzungsnamen, sitzung_finden), aber ohne
# „PUSH:“ davor (das würde neon aufs iPhone weiterleiten), mehrzeilig erlaubt; push() und die übrigen Routinen bleiben
# unverändert. Fehler wie bei push() als „AN-NEON-FEHLER <Routine> <Grund>“ in uebersprungen.log und im Lauf-Protokoll.
#   an_neon <Text> [<Routine>]   Rückgabe 0 = gesendet, 1 = nicht zugestellt (der Aufrufer meldet das dann per push())
# Ziel HALO_NEON_SITZUNG (Standard neon). HALO_PUSH_TROCKEN=1: nur „TROCKEN: an_neon …“, kein Claude.
an_neon() {
  local text=$1 routine=${2:-${ZSH_ARGZERO:t:r}} out grund ziel
  if [[ -n $HALO_PUSH_TROCKEN ]]; then print -r -- "TROCKEN: an_neon $text"; return 0; fi
  local fehlerlog=${HALO_UEBERSPRUNGEN_LOG:-$HOME/halo-nacht/uebersprungen.log}
  local sollname=${HALO_NEON_SITZUNG:-neon}
  ziel=$(sitzung_finden $sollname) || {
    print -r -- "$(zeit) AN-NEON-FEHLER $routine keine Sitzung „$sollname“ oder ähnlich gefunden" >> $fehlerlog
    log "AN-NEON-FEHLER $routine keine Sitzung „$sollname“ oder ähnlich gefunden"
    # Meldung nicht verlieren (20.11.2026, Sitzung neon nach dem Netzausfall nicht erreichbar): als offener Auftrag in neon-stand
    # ablegen, den der Start-Hook jeder neuen neon-Sitzung lädt; der Aufrufer meldet weiter per push() (Rückgabe 1)
    [[ $sollname == neon && -x ${HALO_NEON_STAND:-$HOME/halo-spaces/tests/neon-stand.sh} ]] && zsh ${HALO_NEON_STAND:-$HOME/halo-spaces/tests/neon-stand.sh} neu "$routine" "$text" >/dev/null 2>&1
    return 1 }
  out=$(print -r -- "Aufgabe ohne Rückfrage: Lade bei Bedarf mit ToolSearch die Werkzeuge ListAgents und SendMessage. Schicke dann mit SendMessage an die Sitzung, deren Name „$ziel“ ist (aus ListAgents), genau die Nachricht zwischen den Zeilen ANFANG und ENDE (ohne diese beiden Zeilen, unverändert) und sonst nichts:
ANFANG
$text
ENDE
Antworte danach nur mit „gesendet“ oder „nicht gesendet: <Grund>“." \
    | claude -p --model haiku --permission-mode auto --allowedTools ListAgents SendMessage ToolSearch 2>&1 \
    | grep -v -E '^(Permission allow rule|Warning: )')
  log "an neon: $out"
  if [[ ${out:l} == (gesendet*|*$'\n'gesendet*) ]]; then
    sitzung_merken $sollname $ziel
    return 0
  fi
  grund=${${out#nicht gesendet:}//$'\n'/ }; grund=${grund# }
  print -r -- "$(zeit) AN-NEON-FEHLER $routine ${grund[1,200]:-keine Antwort}" >> $fehlerlog
  log "AN-NEON-FEHLER $routine ${grund[1,200]:-keine Antwort}"
  return 1
}

# Zähler roter Releases (Maintainer 18.11.2026, ENTSCHEIDUNGEN.md „Rote Änderung auf einen Nebenzweig“: „je öfter ein
# commit rot wird und je öfter er deswegen auf einem nebenzweig landet, desto höher muss das untersuchende ki-modell
# sein (inkl. systematic-debugging)“; Ablauf docs/release.md). ~/halo-nacht/rot-zaehler.txt (HALO_ROT_ZAEHLER), eine
# Zeile je Ereignis, Felder mit Tab: „<Zeit> <Schlüssel> <Zweig> <Stufe> [<Stand>]“. Schlüssel: der Name der roten
# Prüfung (Wächter), „Stand <Hash>“ (Release unter Tage) oder für den Verursacher auf einem Nebenzweig einheitlich die
# Board-Karten-ID, ersatzweise „patch:<git patch-id>“ (tests/rot-nebenzweig.sh, 19.11.2026; übersteht Cherry-pick und
# Rebase). Ältere Zeilen mit dem Hash des Verursachers zählen über Aliasse weiter: Hashes (ab 7 Zeichen) gelten als
# gleich, wenn einer der Anfang des anderen ist. Es zählen nur Einträge der letzten 14 Tage (HALO_ROT_TAGE). Commits
# nimmt nur tests/rot-nebenzweig.sh heraus (bei eindeutiger Zuordnung), nie diese Funktionen.
#   rot_stufe <Schlüssel> [<Alias> …]           Modell für die (nächste) Untersuchung: Opus (bis 1 Eintrag), Fable (2, 3),
#                                               Maintainer (ab 4); Fable nur nach den Grenzen aus AGENTS.md „Rot bleibt rot“
#   rot_anzahl <Schlüssel> [<Alias> …]          Zahl der Einträge der letzten 14 Tage (Schlüssel oder ein Alias)
#   rot_eintragen <Schlüssel> <Zweig> [<Stand> [<Alias> …]]   trägt unter <Schlüssel> ein, zählt Aliasse mit, gibt
#                                               „<Stufe> <Modell>“ aus
# Von Hand: zsh -c 'LOG=/dev/null; source tests/lauf-hilfen.zsh; rot_eintragen <hash> rot/<name>'
# Zum Proben: HALO_ROT_JETZT=<Epochensekunden>.
rot_datei() { print -r -- ${HALO_ROT_ZAEHLER:-$HOME/halo-nacht/rot-zaehler.txt} }
rot_wort() { case $1 in (<0-1>) print -r -- Opus ;; (<2-3>) print -r -- Fable ;; (*) print -r -- Maintainer ;; esac }
rot_gleich() {   # <Schlüssel aus der Datei> <Schlüssel oder Alias>: gleich, bei Hashes (ab 7 Zeichen) auch als Anfang
  setopt localoptions extendedglob
  [[ $1 == $2 ]] && return 0
  [[ $1 == [0-9a-f](#c7,40) && $2 == [0-9a-f](#c7,40) ]] || return 1
  [[ $1 == ${2}* || $2 == ${1}* ]]
}
rot_anzahl() {   # <Schlüssel> [<Alias> …]
  setopt localoptions extendedglob
  zmodload -F zsh/datetime b:strftime p:EPOCHSECONDS
  local s=$1 datei=$(rot_datei) t k rest e a treffer n=0 jetzt=${HALO_ROT_JETZT:-$EPOCHSECONDS}
  local -a alle=(${@:#})
  local grenze=$(( jetzt - ${HALO_ROT_TAGE:-14} * 86400 ))
  [[ -n $s && -r $datei ]] || { print 0; return 0 }
  while IFS=$'\t' read -r t k rest; do
    treffer=
    for a in $alle; do rot_gleich "$k" "$a" && { treffer=1; break }; done
    [[ -n $treffer ]] || continue
    strftime -r -s e '%Y-%m-%d %H:%M:%S' $t 2>/dev/null || continue
    (( e >= grenze && e <= jetzt )) && (( n++ ))
  done < $datei
  print $n
}
rot_stufe() { rot_wort $(rot_anzahl "$@") }
rot_eintragen() {   # <Schlüssel> <Zweig> [<Stand> [<Alias> …]]
  zmodload -F zsh/datetime b:strftime p:EPOCHSECONDS
  local s=${1//$'\t'/ } zw=${2:--} datei=$(rot_datei) n t tab=$'\t'
  [[ -n $s ]] || return 1
  n=$(( $(rot_anzahl "$s" "${@[4,-1]}") + 1 ))
  strftime -s t '%Y-%m-%d %H:%M:%S' ${HALO_ROT_JETZT:-$EPOCHSECONDS}
  mkdir -p ${datei:h} 2>/dev/null
  print -r -- "$t$tab$s$tab$zw$tab$n${3:+$tab$3}" >> $datei
  print -r -- "$n $(rot_wort $n)"
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
# Ebenso der Gesprächskanal zum Designer (Sitzung designer, Arbeitsordner
# ~/halo-designer bzw. HALO_DESIGNER_DIR): nur lesen und Vorschaubilder, keine
# Änderungen im Checkout; Projektordner …-halo-designer.
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
  local designer=${${HALO_DESIGNER_DIR:-$HOME/halo-designer}//[\/.]/-}
  for f in $HOME/.claude/projects/${HOME//[\/.]/-}-halo*/*.jsonl(N.); do
    [[ ${f:h:t} == $board || ${f:h:t} == $github || ${f:h:t} == $designer ]] && continue
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
# Muster (pgrep -f, erweiterte reguläre Ausdrücke) nur für den Programmaufruf am Anfang der Befehlszeile
BELEGT_TEST_MUSTER='^([^ ]*/)?[Pp]ython[0-9.]*( -[^ ]+)* ([^ ]*/)?tests/(halo_test|ui_tour|update_test|store_shots)\.py'
BELEGT_RELEASE_MUSTER='^(([^ ]*/)?(ba|z)?sh( -[^ ]+)* )?([^ ]*/)?(release|publish)\.sh( |$)'
BELEGT_TB_MUSTER='^/.*/(thunderbird|thunderbird-bin) .*-marionette'
belegt() {
  local s
  s=$(aktive_sitzung) && { print "Claude-Sitzung ${s[1,8]} arbeitet gerade am Repo"; return 0 }
  pgrep -f 'actions-runner/bin[^/ ]*/Runner\.Worker' >/dev/null && { print "CI-Lauf auf dem GitHub-Runner"; return 0 }
  # nur echte Prozesse am Anfang der Befehlszeile, nicht Auftragstexte laufender claude -p-Sitzungen (Worker,
  # Tagesroutine): die nennen „tests/halo_test.py“ und „release.sh“ und hielten sonst Nachtlauf und Testsperre an (17.11.2026)
  pgrep -f "$BELEGT_TEST_MUSTER" >/dev/null && { print "Testlauf (halo_test.py o. ä.)"; return 0 }
  pgrep -f -- "$BELEGT_TB_MUSTER" >/dev/null && { print "Thunderbird mit Marionette"; return 0 }
  local p
  for p in 2839 2845 {2850..2869}; do
    lsof -nP -iTCP:$p -sTCP:LISTEN >/dev/null 2>&1 && { print "Marionette-Port $p belegt"; return 0 }
  done
  [[ -e $HOME/halo-vm/lauf.lock ]] && kill -0 $(cut -d' ' -f1 $HOME/halo-vm/lauf.lock) 2>/dev/null \
    && { print "Lauf in der Windows-VM"; return 0 }
  pgrep -f "$BELEGT_RELEASE_MUSTER" >/dev/null && { print "release.sh/publish.sh läuft"; return 0 }
  # der Nachtlauf (REST_MITNEHMEN=1) übernimmt liegengebliebene Änderungen selbst –
  # ob noch jemand daran arbeitet, sagt schon aktive_sitzung()
  [[ -z $REST_MITNEHMEN && -n $(git -C $REPO status --porcelain --untracked-files=no 2>/dev/null) ]] \
    && { print "ungespeicherte Änderungen in $REPO (eine andere Sitzung arbeitet)"; return 0 }
  return 1
}

# Verwaiste Test-Thunderbird beenden und alte Testprofile löschen, ohne Rückfrage (Maintainer 25.11.2026: „Nein ich kann
# solche entscheidungen nicht nachts treffen, ich brauche einen Automatismus damit solche Situationen automatisch gelöst
# werden“, ENTSCHEIDUNGEN.md; Vorfall ~/halo-berichte/2026-11-25-verwaiste-testprozesse.md). Engste Fassung:
# - nur wenn kein Testlauf (BELEGT_TEST_MUSTER) und keine CI (Runner.Worker) läuft;
# - beendet nur Thunderbird, dessen Befehlszeile mit …/thunderbird bzw. …/thunderbird-bin beginnt und
#   „-profile …/halo-test-…“ sowie „-marionette“ enthält, mit Elternprozess 1 (launchd: Testlauf tot) und älter als
#   3 Stunden; die Befehlszeile wird unmittelbar vor dem Beenden noch einmal geprüft (PID nicht neu vergeben);
# - löscht danach Ordner halo-test-* im temporären Ordner ($TMPDIR, /var/folders/…/T), älter als 24 Stunden, die in
#   keiner Befehlszeile eines laufenden Prozesses vorkommen.
# Nie ein Nutzerprofil, nie ein anderes Programm. Jede Handlung mit PID und Alter in ~/halo-nacht/aufraeumen-testprozesse.log,
# eine Zusammenfassung ins Protokoll des Aufrufers (log, falls $LOG gesetzt). Ausgabe: „Verwaiste Testprozesse beendet: n“.
# Zum Proben: VERWAIST_ALTER (Sekunden, Standard 10800), VERWAIST_PROFIL_ALTER (Sekunden, Standard 86400),
# VERWAIST_TMP (temporärer Ordner), VERWAIST_LOG (Protokoll), VERWAIST_PROFIL_MUSTER (Pfad des Profils, ERE),
# VERWAIST_CI_MUSTER (CI-Prozess, ERE).
verwaist_sekunden() {   # Ausgabe von ps -o etime= ([[TT-]hh:]mm:ss) in Sekunden
  local e=${1//[[:space:]]/} t=0 h=0 m=0 s=0
  [[ $e == *-* ]] && { t=${e%%-*}; e=${e#*-} }
  local -a teile=(${(s.:.)e})
  case $#teile in
    3) h=$teile[1] m=$teile[2] s=$teile[3] ;;
    2) m=$teile[1] s=$teile[2] ;;
    *) print -- -1; return ;;
  esac
  print $(( 10#$t * 86400 + 10#$h * 3600 + 10#$m * 60 + 10#$s ))
}
verwaiste_tb_beenden() {
  local alter_max=${VERWAIST_ALTER:-10800} profil_max=${VERWAIST_PROFIL_ALTER:-86400}
  local prot=${VERWAIST_LOG:-$HOME/halo-nacht/aufraeumen-testprozesse.log}
  local tmp=${VERWAIST_TMP:-${TMPDIR:-$(getconf DARWIN_USER_TEMP_DIR 2>/dev/null || print /tmp)}}
  local profil=${VERWAIST_PROFIL_MUSTER:-/[^ ]*/halo-test-[A-Za-z0-9_-]+}
  local ci=${VERWAIST_CI_MUSTER:-actions-runner/bin[^/ ]*/Runner\.Worker}
  local muster="^/[^ ]*/(thunderbird|thunderbird-bin) (.* )?-profile $profil( |$)"
  local n=0 g=0 pid cmd eltern alter i d grund= jetzt=$(date '+%F %T')
  tmp=${tmp%/}
  mkdir -p ${prot:h} 2>/dev/null
  if pgrep -f -- "$BELEGT_TEST_MUSTER" >/dev/null; then grund="Testlauf läuft"
  elif pgrep -f -- "$ci" >/dev/null; then grund="CI-Lauf läuft"
  fi
  if [[ -n $grund ]]; then
    print -r -- "$jetzt nichts angefasst: $grund" >> $prot
    [[ -n $LOG ]] && log "Verwaiste Testprozesse: nichts angefasst ($grund)"
    print "Verwaiste Testprozesse beendet: 0"
    return 0
  fi
  for pid in ${(f)"$(pgrep -f -- "$muster")"}; do
    [[ $pid == <-> && $pid != $$ ]] || continue
    cmd=$(ps -o command= -p $pid 2>/dev/null)
    [[ $cmd =~ $muster && $cmd == *' -marionette'* ]] || continue
    eltern=${$(ps -o ppid= -p $pid 2>/dev/null)//[[:space:]]/}
    [[ $eltern == 1 ]] || continue
    alter=$(verwaist_sekunden "$(ps -o etime= -p $pid 2>/dev/null)")
    (( alter >= alter_max )) || continue
    # unmittelbar vor dem Beenden: noch derselbe Prozess?
    [[ $(ps -o command= -p $pid 2>/dev/null) == $cmd ]] || continue
    kill -TERM $pid 2>/dev/null || continue
    for i in {1..30}; do kill -0 $pid 2>/dev/null || break; sleep 0.5; done
    if kill -0 $pid 2>/dev/null && [[ $(ps -o command= -p $pid 2>/dev/null) == $cmd ]]; then
      kill -KILL $pid 2>/dev/null
      print -r -- "$jetzt beendet (SIGKILL nach 15 s) PID $pid, Alter ${alter} s, Eltern 1: $cmd" >> $prot
    else
      print -r -- "$jetzt beendet PID $pid, Alter ${alter} s, Eltern 1: $cmd" >> $prot
    fi
    (( n++ ))
  done
  # alte Testprofile: nur Ordner halo-test-* direkt im temporären Ordner, die in keiner Befehlszeile vorkommen
  if [[ -d $tmp ]]; then
    local alle=$(ps -axo command= 2>/dev/null)
    for d in $tmp/halo-test-*(N/ms+$profil_max); do
      [[ ${d:t} == halo-test-[A-Za-z0-9_-]## ]] || continue
      [[ $alle == *"$d"* ]] && continue
      rm -rf -- $d && { print -r -- "$jetzt Profil gelöscht: $d" >> $prot; (( g++ )) }
    done
  fi
  [[ -n $LOG ]] && log "Verwaiste Testprozesse beendet: $n, alte Testprofile gelöscht: $g"
  print "Verwaiste Testprozesse beendet: $n"
}

# Vorrang für ein fälliges Zwischen-Release (neon-Auftrag #48, 19.11.2026): Anlass 3.33.0, Stand fc2701d wartete über
# 60 Minuten auf „belegt“, weil Worker und Tagesroutine laufend neue Testläufe begannen. Der Wächter
# tests/zwischen-schleife.zsh schreibt bei fälligem, grünem Stand und belegtem neon die Marke
# ~/halo-nacht/zwischen-faellig.txt (HALO_ZR_FAELLIG), eine Zeile:
#   <Unix-Sekunden der letzten Erneuerung> <PID des Wächters|-> <Stand> <Zweig> <seit HH:MM>
# Er erneuert sie je Takt und während des Release-Laufs, entfernt sie nach Release, Abbruch oder Rot und sobald kein
# fälliger Stand mehr wartet. Solange sie frisch ist (jünger als ZR_FAELLIG_MAX Minuten und der Wächter lebt), startet der
# Auslastungswächter keine Worker und der Zeitfenster-Hook weist neue Testläufe ab (eigene Kopie der Prüfung dort).
# Laufende Testläufe bricht niemand ab; der Wächter wartet auf sie (belegt()).
# zr_vorrang: Rückgabe 0 = Marke frisch, gibt „Stand <7 Zeichen> (<Zweig>) seit <HH:MM>“ aus. Zum Proben: HALO_ZR_JETZT=<Unix-Sekunden>.
zr_faellig_datei() { print -r -- ${HALO_ZR_FAELLIG:-$HOME/halo-nacht/zwischen-faellig.txt} }
zr_vorrang() {
  local d=$(zr_faellig_datei) jetzt=${HALO_ZR_JETZT:-$(date +%s)} max=${ZR_FAELLIG_MAX:-60}
  local -a z
  [[ -r $d ]] || return 1
  z=(${=$(head -1 $d 2>/dev/null)})
  (( $#z >= 4 )) && [[ $z[1] == <-> ]] || return 1
  (( jetzt - z[1] < max * 60 )) || return 1
  [[ $z[2] == <-> ]] && ! kill -0 $z[2] 2>/dev/null && return 1
  print -r -- "Stand ${z[3][1,7]} ($z[4]) seit ${z[5]:-?}"
}
zr_vorrang_setzen() {   # <Stand> <Zweig> <seit HH:MM> – atomar (.neu, mv); PID = Wächter ($$ auch in Unterschalen)
  local d=$(zr_faellig_datei)
  print -r -- "$(date +%s) $$ $1 $2 $3" > $d.neu 2>/dev/null && mv -f $d.neu $d
}
zr_vorrang_loeschen() { rm -f $(zr_faellig_datei) }

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
