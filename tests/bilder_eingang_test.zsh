#!/bin/zsh
# Prüfung von tests/bilder-eingang.zsh ohne Claude, ohne Push, ohne Netz, im Wegwerf-Ordner
# (echte Ordner unter ~/halo-aufgaben bleiben unberührt). Läuft in der Doku-Prüfung
# (tests/wochenpruefung.sh --doku) und von Hand: zsh tests/bilder_eingang_test.zsh
# → je Fall eine Zeile OK/FEHLER, Exitcode 1 bei einem Fehler.
emulate -L zsh
setopt nullglob
HIER=${0:A:h}
T=$(mktemp -d) || exit 1
trap '[[ -n $BEHALTEN ]] && print -u2 "behalten: $T" || rm -rf $T' EXIT
FEHLER=0
ok() { print "OK      $1" }
fehler() { print "FEHLER  $1"; FEHLER=1 }
pruefe() { # <Name> <Befehl …>: Erfolg = Exitcode 0
  local n=$1; shift
  if eval "$@" >/dev/null 2>&1; then ok $n; else fehler $n; fi
}
A=$T/a
export HALO_AUFGABEN=$A HALO_BILDER_LOG=$T/lauf.log HALO_UEBERSPRUNGEN_LOG=$T/uebersprungen.log \
  HALO_BILDER_CLAUDE=trocken HALO_BILDER_PUSH=aus HALO_BILDER_WARTE=0 \
  HALO_PAUSEN_DATEI=$T/pausen.txt HALO_NACHT_DIR=$T/nacht HALO_TOUR_DIR=$T/tour
mkdir -p $A/eingang $A/apple $A/bilder $T/nacht $T/tour
lauf() { zsh $HIER/bilder-eingang.zsh $T/repo }
alt() { touch -t 202601010000 "$@" }   # Vorbereitung soll nicht als „fremde Änderung“ zählen
sha() { shasum -a 256 $1 | cut -d' ' -f1 }
png() {   # <Datei> <Breite> <Höhe> [<Farbwert>]: echtes PNG ohne Hilfsprogramme
  python3 -I - $1 $2 $3 ${4:-128} <<'EOF'
import sys, zlib, struct
p, w, h, v = sys.argv[1], int(sys.argv[2]), int(sys.argv[3]), int(sys.argv[4])
def ch(t, d): return struct.pack(">I", len(d)) + t + d + struct.pack(">I", zlib.crc32(t + d) & 0xffffffff)
roh = b"".join(b"\0" + bytes([v, 255 - v, 60]) * w for _ in range(h))
open(p, "wb").write(b"\x89PNG\r\n\x1a\n" + ch(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 2, 0, 0, 0)) + ch(b"IDAT", zlib.compress(roh)) + ch(b"IEND", b""))
EOF
}

# Ausgangslage: Apple-Index mit einer bestehenden Zeile, Liste offener Bilder
cat > $A/apple/index.md <<'EOF'
# Apple-Vorlagen

| Name | App | macOS | Inhalt | ui_tour-ids | Datum | SHA-256 |
|---|---|---|---|---|---|---|
| mail-alt.png | Mail | 27 | alte Zeile | mail-karten | 2026-11-01 | aaaa |
EOF
cat > $A/bilder-offen.md <<'EOF'
# Benötigte Bilder (offen)

| Name | Befehl | App / Oberfläche | hell/dunkel | macOS | wofür (Board) | Art | seit |
|---|---|---|---|---|---|---|---|
| mail-probe | halobild apple-mail-probe | Mail | hell | 27 | X | optional | 2026-11-07 |
| board-probe | halobild board-probe | TB | hell | 27 | Y | Pflicht | 2026-11-07 |
| winzig | halobild winzig | TB | hell | 27 | Z | Pflicht | 2026-11-07 |
| kalender-probe | halobild apple-kalender-probe | Kalender | hell + dunkel | 27 | W | optional | 2026-11-07 |
EOF
alt $A/apple/index.md $A/bilder-offen.md
ALTE_ZEILE=$(grep 'mail-alt.png' $A/apple/index.md)

png $A/eingang/apple-mail-probe.png 300 200
png $A/eingang/board-probe.png 400 120
png $A/eingang/winzig.png 20 20
png $A/eingang/apple-kalender-probe-dunkel.png 300 200 30
png "$A/eingang/Falscher Name.png" 50 50
print -n "kein Bild" > $A/eingang/kaputt.png
H1=$(sha $A/eingang/apple-mail-probe.png) H2=$(sha $A/eingang/board-probe.png)
lauf
pruefe "apple- nach apple/ ohne Vorsatz" '[[ -f $A/apple/mail-probe.png && ! -e $A/eingang/apple-mail-probe.png ]]'
pruefe "Board-Bild nach bilder/" '[[ -f $A/bilder/board-probe.png && ! -e $A/eingang/board-probe.png ]]'
pruefe "Hash unverändert (apple)" '[[ $(sha $A/apple/mail-probe.png) == $H1 ]]'
pruefe "Hash unverändert (bilder)" '[[ $(sha $A/bilder/board-probe.png) == $H2 ]]'
pruefe "apple/index.md: Zeile mit Hash und Größe" 'grep -q "^| mail-probe.png | unbeschrieben | unbeschrieben | unbeschrieben (300×200 px) | unbeschrieben | $(date +%F) | $H1 |$" $A/apple/index.md'
pruefe "apple/index.md: bestehende Zeile unverändert" '[[ $(grep mail-alt.png $A/apple/index.md) == $ALTE_ZEILE ]]'
pruefe "bilder/index.md angelegt mit Zeile" 'grep -q "^| board-probe.png | $(date +%F) | $H2 | 400×120 | unbeschrieben |$" $A/bilder/index.md'
pruefe "kleines Bild markiert" 'grep -q "^| winzig.png .*Bild unzureichend: nur 20×20 px" $A/bilder/index.md'
pruefe "bilder-offen: apple-Vorlage ausgetragen" '! grep -q "^| mail-probe |" $A/bilder-offen.md && grep -q "Erledigt (ausgetragen): mail-probe (Apple-Vorlage)" $A/bilder-offen.md'
pruefe "bilder-offen: Board-Bild ausgetragen" '! grep -q "^| board-probe |" $A/bilder-offen.md'
pruefe "bilder-offen: kleines Bild bleibt offen" 'grep -q "^| winzig |" $A/bilder-offen.md'
pruefe "bilder-offen: nur -dunkel bleibt offen, Hinweis im Protokoll" 'grep -q "^| kalender-probe |" $A/bilder-offen.md && grep -q "TEILWEISE kalender-probe-dunkel passt zu offenem Bild kalender-probe" $HALO_BILDER_LOG'
pruefe "ungültiger Name bleibt im Eingang" '[[ -f "$A/eingang/Falscher Name.png" ]]'
pruefe "kein lesbares Bild bleibt im Eingang" '[[ -f $A/eingang/kaputt.png ]]'
pruefe "Push (aus) nennt Probleme" 'grep "PUSH (aus)" $HALO_BILDER_LOG | grep -q "Falscher Name.png" && grep "PUSH (aus)" $HALO_BILDER_LOG | grep -q "kaputt.png" && grep "PUSH (aus)" $HALO_BILDER_LOG | grep -q "winzig.png nur 20×20"'
pruefe "Claude (trocken) für unbeschriebene Zeilen" 'grep -q "CLAUDE (trocken) würde 4 Bild(er) beschreiben" $HALO_BILDER_LOG'

# zweiter Lauf: idempotent, keine zweite Meldung
cp $A/apple/index.md $T/a1; cp $A/bilder/index.md $T/b1; cp $A/bilder-offen.md $T/o1
lauf
pruefe "Mehrfachlauf: Indizes und Liste unverändert" 'cmp -s $T/a1 $A/apple/index.md && cmp -s $T/b1 $A/bilder/index.md && cmp -s $T/o1 $A/bilder-offen.md'
pruefe "Mehrfachlauf: Probleme nur einmal gemeldet" '[[ $(grep -c "PUSH (aus)" $HALO_BILDER_LOG) == 1 ]]'

# gleicher Name, neuer Inhalt ersetzt; gleicher Inhalt nur Eingang leeren
png $A/eingang/board-probe.png 400 120 200; H3=$(sha $A/eingang/board-probe.png)
sleep 1; lauf
pruefe "Ersetzen: neue Fassung im Ziel" '[[ $(sha $A/bilder/board-probe.png) == $H3 ]]'
pruefe "Ersetzen: eine Zeile mit neuem Hash" '[[ $(grep -c "^| board-probe.png " $A/bilder/index.md) == 1 ]] && grep -q "$H3" $A/bilder/index.md && ! grep -q "$H2" $A/bilder/index.md'
cp $A/bilder/board-probe.png $A/eingang/board-probe.png; cp $A/bilder/index.md $T/b2
lauf
pruefe "gleicher Inhalt: Eingang geleert, Index gleich" '[[ ! -e $A/eingang/board-probe.png ]] && cmp -s $T/b2 $A/bilder/index.md'

# Sperren und Pause
touch $A/bilder-eingang.sperre; png $A/eingang/sperr-probe.png 100 100
lauf
pruefe "Sitzungssperre: nichts einsortiert" '[[ -f $A/eingang/sperr-probe.png ]] && grep -q "ÜBERSPRUNGEN bilder-eingang Sitzungssperre" $HALO_UEBERSPRUNGEN_LOG'
rm $A/bilder-eingang.sperre
print -r -- "bilder-eingang 2999-01-01T00:00+01:00 Probe" > $HALO_PAUSEN_DATEI
lauf
pruefe "Pause: nichts einsortiert" '[[ -f $A/eingang/sperr-probe.png ]] && grep -q "ÜBERSPRUNGEN bilder-eingang pausiert" $HALO_UEBERSPRUNGEN_LOG'
: > $HALO_PAUSEN_DATEI; rm $A/eingang/sperr-probe.png
touch $A/bilder/fremd.png
lauf
pruefe "fremde Änderung vor kurzem: übersprungen" 'grep -q "ÜBERSPRUNGEN bilder-eingang Änderung in den letzten 3 Minuten (fremd.png" $HALO_UEBERSPRUNGEN_LOG'
rm $A/bilder/fremd.png; touch $A/.bilder-eingang.stempel

# nichts zu tun: ÜBERSPRUNGEN genau einmal; nach 2 Versuchen kein Claude mehr, einmal Meldung
rm -f $A/eingang/*(N)
sed -i '' 's/unbeschrieben/beschrieben/g' $A/apple/index.md $A/bilder/index.md; touch $A/.bilder-eingang.stempel
lauf; lauf
pruefe "nichts zu tun: ÜBERSPRUNGEN genau einmal" '[[ $(grep -c "ÜBERSPRUNGEN bilder-eingang Eingang leer" $HALO_UEBERSPRUNGEN_LOG) == 1 ]]'
png $A/eingang/zaeh.png 100 100; HZ=$(sha $A/eingang/zaeh.png); print "$HZ 2" > $A/bilder-eingang.versuche
: > $HALO_BILDER_LOG
lauf
pruefe "nach 2 Versuchen: kein Claude, eine Meldung" '! grep -q "CLAUDE (trocken)" $HALO_BILDER_LOG && grep "PUSH (aus)" $HALO_BILDER_LOG | grep -q "zaeh.png nach 2 Versuchen"'
pruefe "Routine steht in PAUSEN_ROUTINEN" '( source $HIER/lauf-hilfen.zsh; (( ${PAUSEN_ROUTINEN[(Ie)bilder-eingang]} )) )'
exit $FEHLER
