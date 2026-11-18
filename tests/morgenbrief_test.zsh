#!/bin/zsh
# Prüft den Tagesbericht des Morgenbriefs im Trockenlauf (kein Netz, kein Claude, nichts in ~/halo-berichte oder
# ~/halo-nacht) und tests/bericht-html.py (Maintainer 15.11.2026, „ja wir sollten nur einen bericht haben …“):
# Kurzfassung höchstens 10 Zeilen, Ja/Nein-Fragen, aufklappbare Details, Vorschau der Tagesroutine aus Attrappen
# (Board, pausen.txt, volldampf.txt), iPhone-Meldung ohne Pfade und Hashes.
#   zsh tests/morgenbrief_test.zsh    eine Zeile OK/FEHLER je Prüfung, Exitcode 0 nur bei Erfolg
emulate -L zsh
HIER=${0:A:h}
SKRIPT=$HIER/morgenbrief.sh
T=$(mktemp -d); trap 'rm -rf $T' EXIT
FEHLER=0
pruefe() { if eval "$2" >/dev/null 2>&1; then print "OK      $1"; else print "FEHLER  $1"; FEHLER=1; fi }

mkdir -p $T/berichte $T/nacht
cat > $T/berichte/2026-11-16-nachtlauf.md <<'EOF'
# Nachtlauf 2026-11-16

Kurz: kein Release – die Windows-CI scheiterte an einer Prüfung (Adressbuch, Lauf 43681457048); erledigt sind 2 Einträge (8fce8a3, `paket/x`), 2 Rückfragen.

## Director-Plan

| Nr. | Eintrag | Ergebnis |
|---|---|---|
| 1 | Seitenleiste: Kachel | fertig (8fce8a3) |

## Aufgeräumt

Aufgeräumt: 1
- Zweig pruef/alt (lokal, in main enthalten)
Rest mit Risiko, nichts angefasst: 2
- Arbeitskopie /Users/x/halo-spaces/.claude/worktrees/agent-1: 1 Commit(s) nur in dieser Kopie

## Rückfragen an den Maintainer

- Seitenleiste: aktive Space-Kachel (Kachel d2h): Der Merge wurde zurückgenommen (671880a). Soll der nächste Nachtlauf das Paket erneut zusammenführen (671880a zurücknehmen)?
2. **Today-Pane, GitHub #62:** Der Nutzer hat Text gewählt. Sollen die Knöpfe dort immer nur als Symbol erscheinen? (Eintrag steht auf Wartet auf OK.)

## Ende der Arbeit (nachtlauf.sh)

- Arbeit beendet: 06:30 erreicht
EOF
cat > $T/berichte/2026-11-15-tagesroutine.md <<'EOF'
# halo.spaces Tagesroutine 2026-11-15 – 1 erledigt

Kurz: 1 erledigt – Ende: Plan abgearbeitet
EOF
cat > $T/board.json <<'EOF'
{"items":[
 {"id":"A1","typ":"Feature","status":"Todo","title":"Kalender: Wochenansicht schöner","body":"Maintainer 15.11.2026"},
 {"id":"A2","typ":"Bug","status":"Todo","title":"Kalender: Termin springt","body":"Maintainer 15.11.2026"},
 {"id":"A3","typ":"Bug","status":"Todo","title":"Mail: Absturz beim Senden","body":"Maintainer 15.11.2026"},
 {"id":"A4","typ":"Bug","status":"Wartet auf OK","title":"Mail: wartet auf Entscheidung","body":""},
 {"id":"A5","typ":"Feature","status":"Todo","title":"Ablauf: neue Regel","body":""},
 {"id":"A6","typ":"Bug","status":"In Progress","title":"Mail: schon fertig","body":"committet, wartet auf Push/CI (abc1234)"},
 {"id":"A7","typ":"Feature","status":"Todo","title":"Import: PST 2/3 – Mails","body":""},
 {"id":"A8","typ":"Feature","status":"Todo","title":"Import: PST 3/3 – Kontakte","body":""},
 {"id":"A9","typ":"Bug","status":"Todo","title":"Adressbuch: alter Fehler","body":"Maintainer 1.11.2026"},
 {"id":"A10","typ":"Bug","status":"Todo","title":"Chat: neuer Fehler","body":"Maintainer 15.11.2026"}
]}
EOF
print '[{"tagName":"v3.27.0","publishedAt":"2026-11-14T07:32:00Z","isDraft":false}]' > $T/rel.json
print '[{"databaseId":1,"headSha":"671880a0000","status":"completed","conclusion":"success","event":"push","createdAt":"2026-11-16T04:00:00Z"}]' > $T/ci.json
: > $T/leer.conf
VOR=$(ls -la ~/halo-berichte ~/halo-nacht 2>/dev/null | cksum)

# lauf <Jetzt> [<Ausgabe>]  (weitere Umgebung wie HALO_PAUSEN_DATEI/HALO_VOLLDAMPF_DATEI vom Aufrufer)
lauf() {
  HALO_JETZT=$1 HALO_MB_BERICHTE=$T/berichte HALO_MB_NACHT=$T/nacht HALO_MB_HANDELN=$T/nacht/handeln.log \
  HALO_MB_HANDELN_SCHREIBEN=$T/handeln-schreiben.log HALO_PAUSEN_DATEI=${HALO_PAUSEN_DATEI:-$T/keine-pausen.txt} \
  HALO_VOLLDAMPF_DATEI=${HALO_VOLLDAMPF_DATEI:-$T/kein-volldampf.txt} HALO_VOLLDAMPF_BEENDET=$T/vd-beendet.txt HALO_WOCHENANKER=${HALO_WOCHENANKER:-$T/kein-anker.txt} \
  HALO_KONTINGENT_JSON=$T/kein-kontingent.json HALO_TAGESROUTINE_CONF=$T/leer.conf \
  HALO_MB_RELEASES=$T/rel.json HALO_MB_CI=$T/ci.json HALO_MB_WINDOWS=${HALO_MB_WINDOWS:-failure} HALO_MB_BOARD=$T/board.json \
  HALO_KONTINGENT_WOCHE=${HALO_KONTINGENT_WOCHE:-40} HALO_KONTINGENT_5H=5 HALO_MB_AUSGABE=$2 \
    zsh $SKRIPT --trocken 2>&1
}
MO=2026-11-16T08:30:00+01:00   # Montag; Reset Di 10.11. 00:00 UTC → Soll 90 %
AUS=$(lauf $MO $T/b.md); B=$(<$T/b.md 2>/dev/null)
KF=$(sed -n '/^## Kurzfassung/,/^## Details/p' $T/b.md | grep -v '^## ' | grep -c .)
MELDUNG=(${(f)"$(print -r -- $AUS | sed -n '/Meldung zeilenweise:/,/^TROCKEN:/p' | grep '^  ')"})

pruefe "Bericht entsteht nur über HALO_MB_AUSGABE, Überschrift mit Datum" '[[ -s $T/b.md && $B == "# Bericht 16.11.2026 (Montag)"* ]]'
pruefe "Kurzfassung höchstens 10 Zeilen (hier $KF)" '(( KF > 0 && KF <= 10 ))'
pruefe "Kurzfassung: Nacht ohne Hashes, Klammern, Code" '[[ $(grep "^- \*\*Nacht:" $T/b.md) == "- **Nacht:** Kein Release – die Windows-CI scheiterte an einer Prüfung; erledigt sind 2 Einträge, 2 Rückfragen." ]]'
pruefe "Kurzfassung: Tests rot unter Windows" 'grep -q "^- \*\*Tests:\*\* Rot unter Windows" $T/b.md'
pruefe "Rückfragen als kurze Ja/Nein-Fragen (Bindestrich und nummeriert)" 'grep -qx "  1. Ja/Nein: Seitenleiste: Soll der nächste Nachtlauf das Paket erneut zusammenführen?" $T/b.md && grep -qx "  2. Ja/Nein: Today-Pane, GitHub #62: Sollen die Knöpfe dort immer nur als Symbol erscheinen?" $T/b.md'
pruefe "Kurzfassung: Kontingent in einer Zeile" '[[ $(grep -c "^- \*\*Kontingent:\*\* Woche 40 %" $T/b.md) == 1 ]]'
for s in "Nachtlauf: ausführlicher Bericht" "Morgenbrief: alle Zeilen" "Release, CI und Windows" "Aufräumen der Nacht" "Tagesroutine 15.11." "Vorschau Tagesroutine: offene Einträge in Regel-Reihenfolge"; do
  pruefe "aufklappbar: $s" 'grep -qF "<details><summary>$s</summary>" $T/b.md'
done
pruefe "jedes <details> wird geschlossen" '[[ $(grep -c "^<details>" $T/b.md) == $(grep -c "^</details>" $T/b.md) ]]'
pruefe "Nachtlauf-Bericht eingebunden, Überschriften tiefer" 'grep -qx "### Nachtlauf 2026-11-16" $T/b.md && grep -qx "#### Director-Plan" $T/b.md && grep -qF "| 1 | Seitenleiste: Kachel | fertig (8fce8a3) |" $T/b.md'
V=$(sed -n '/Vorschau Tagesroutine: offene/,/<\/details>/p' $T/b.md)
pruefe "Vorschau: schwer zuerst, dann Bugs nach Bereich (alt rückt vor), Features, Reihe zuletzt" '[[ $(print -r -- $V | grep -E "^[0-9]+\. " | cut -d"(" -f1) == $(print -l "1. Mail: Absturz beim Senden " "2. Adressbuch: alter Fehler " "3. Kalender: Termin springt " "4. Chat: neuer Fehler " "5. Kalender: Wochenansicht schöner " "6. Import: PST 2/3 – Mails ") ]]'
pruefe "Vorschau ohne Wartet auf OK, Ablauf, wartet auf Push/CI, übernächsten Reihenschritt" '! print -r -- $V | grep -qE "wartet auf Entscheidung|neue Regel|schon fertig|PST 3/3"'
pruefe "Vorschau: Hinweis unverbindlich, rote Prüfung zuerst" 'print -r -- $V | grep -q "^Unverbindlich: die erste Plan-Runde der Tagesroutine um 09:00 entscheidet" && grep -q "zuerst die rote Prüfung der Nacht; Mail: Absturz beim Senden" $T/b.md'
pruefe "iPhone: höchstens 3 Zeilen plus Hinweis auf /bericht" '(( $#MELDUNG <= 4 )) && [[ $MELDUNG[1] == "  Du musst heute: 2 Punkte" && $MELDUNG[-1] == "  Bericht in der Sitzung neon mit /bericht öffnen" ]]'
pruefe "iPhone: keine Pfade, keine Hashes, keine Lauf-Nummern" '! print -rl -- $MELDUNG | grep -qE "~/|/Users/|halo-berichte|\.md\b|\b[0-9a-f]{7,}\b"'
pruefe "Push als [handeln]" 'print -r -- $AUS | grep -q "^TROCKEN: push \[handeln\] Morgenbrief 16.11.: Du musst heute"'

pruefe "ohne Zeile „Release unter Tage“ kein Satz zum Wunsch des Directors" '! grep -q "Director wünscht" $T/b.md'
cp $T/berichte/2026-11-16-nachtlauf.md $T/nl-ohne.md
print "\n## Release\n\nKein Release.\nRelease unter Tage: Wunsch ja – die Kachel (8fce8a3) behebt einen sichtbaren Fehler für alle Nutzer." >> $T/berichte/2026-11-16-nachtlauf.md
A=$(lauf $MO $T/r.md)
pruefe "„Release unter Tage: Wunsch ja“ steht in der Nacht-Zeile, ohne Hash" 'grep -q "^- \*\*Nacht:\*\* .* Der Director wünscht ein Release heute: Die Kachel behebt einen sichtbaren Fehler für alle Nutzer. Die Tagesroutine entscheidet um 09:00.$" $T/r.md'
sed -i "" "s/Wunsch ja – die Kachel (8fce8a3) behebt/Wunsch nein: kann warten,/" $T/berichte/2026-11-16-nachtlauf.md
A=$(lauf $MO $T/r2.md)
pruefe "„Wunsch nein“ als kurzer Satz" 'grep -q "Der Director wünscht kein Release am Tag: Kann warten, einen sichtbaren Fehler" $T/r2.md'
cp $T/nl-ohne.md $T/berichte/2026-11-16-nachtlauf.md

# Pause und Volldampf aus Attrappen
print "tagesroutine 2026-11-16T14:00+01:00 Test" > $T/pausen.txt
A=$(HALO_PAUSEN_DATEI=$T/pausen.txt lauf $MO $T/p.md)
pruefe "pausen.txt: Tagesroutine pausiert bis …" 'grep -q "Tagesroutine heute (Vorschau, unverbindlich):\*\* Tagesroutine pausiert bis 2026-11-16T14:00+01:00" $T/p.md && grep -q "^- Pause: bis 2026-11-16T14:00+01:00 – Test" $T/p.md'
print "volldampf 2026-11-16T01:00+01:00 2026-11-17T01:00+01:00 Test" > $T/vd.txt
A=$(HALO_VOLLDAMPF_DATEI=$T/vd.txt HALO_KONTINGENT_WOCHE=95 lauf $MO $T/v.md)
pruefe "volldampf.txt aktiv: Volldampf statt Sparmodus/Stopp" 'grep -q "Tagesroutine heute.*Volldampf (ohne Sparmodus)" $T/v.md && grep -q "^- Volldampf: Volldampf aktiv" $T/v.md'
A=$(HALO_KONTINGENT_WOCHE=95 lauf 2026-11-12T08:30:00+01:00 $T/k.md)   # Do: Soll 33 %, also 62 Punkte darüber
pruefe "ohne Volldampf und weit über Soll: nichts Neues" 'grep -q "Tagesroutine beginnt heute nichts Neues" $T/k.md'
A=$(HALO_KONTINGENT_WOCHE=50 lauf 2026-11-12T08:30:00+01:00 $T/k1.md)   # 17 Punkte über Soll (> SPAR_MAX 10)
pruefe "Kontingentzeile: weit über Soll nennt „nichts Neues“" 'grep -q "deutlich über Soll, Tagesroutine beginnt nichts Neues" $T/k1.md'
A=$(HALO_KONTINGENT_WOCHE=38 lauf 2026-11-12T08:30:00+01:00 $T/k2.md)   # 5 Punkte über Soll: Sparmodus, nicht „nichts Neues“
pruefe "Kontingentzeile: wenig über Soll nennt den Sparmodus, nicht „nichts Neues“" 'grep -q "über Soll, Tagesroutine im Sparmodus" $T/k2.md && ! grep -q "beginnt nichts Neues" $T/k2.md'
pruefe "Kontingentzeile im Volldampf: kein „nichts Neues“" '! grep -q "Tagesroutine beginnt nichts Neues" $T/v.md'

# Wochenende ohne Auffälligkeit: Bericht ja, Meldung nein; Trockenlauf ohne Ausgabe schreibt keinen Bericht
mv $T/berichte/2026-11-16-nachtlauf.md $T/nl.md
sed -E '/^## Rückfragen/,/^## Ende/{/^(- |2\.)/d;}' $T/nl.md | sed 's/, 2 Rückfragen//' > $T/berichte/2026-11-15-nachtlauf.md
A=$(HALO_MB_WINDOWS=success lauf 2026-11-15T08:30:00+01:00 $T/w.md)
pruefe "Sonntag ohne Auffälligkeit: Bericht geschrieben, keine Meldung" '[[ -s $T/w.md ]] && print -r -- $A | grep -q "Bericht ja, keine Meldung" && ! print -r -- $A | grep -q "^TROCKEN: push"'
pruefe "Sonntag: Heute von dir nichts nötig, Tests grün" 'grep -q "^- \*\*Heute von dir:\*\* nichts nötig." $T/w.md && grep -q "^- \*\*Tests:\*\* alles grün." $T/w.md'
A=$(lauf $MO "")
pruefe "Trockenlauf ohne HALO_MB_AUSGABE schreibt keinen Bericht" '[[ -z $(ls $T/berichte | grep -- "-bericht") ]]'
pruefe "nichts in ~/halo-berichte oder ~/halo-nacht geschrieben" '[[ $(ls -la ~/halo-berichte ~/halo-nacht 2>/dev/null | cksum) == $VOR ]]'

# bericht-html.py
cat > $T/h.md <<'EOF'
# Bericht 16.11.2026 (Montag)

## Kurzfassung

- **Nacht:** gut <script>x</script>
- **Heute von dir (1):**
  1. Ja/Nein: Frage?
- `Code` und [Link](https://example.org)

<details><summary>Technik</summary>

| a | b |
|---|---|
| 1 | 2 |

Zeile eins
Zeile zwei

</details>
EOF
python3 -I $HIER/bericht-html.py $T/h.md $T/h.html; H=$(<$T/h.html)
pruefe "HTML: Titel „Bericht <Datum>“, kein eigenes Gerüst" '[[ $H == "<title>Bericht 16.11.2026</title>"* ]] && ! grep -qiE "<!doctype|<html|<body" $T/h.html'
pruefe "HTML: Hell/Dunkel über Farbvariablen, Rand 16 px" 'grep -q "prefers-color-scheme: dark" $T/h.html && grep -qF ":root[data-theme=\"dark\"]" $T/h.html && grep -qF "max(16px, env(safe-area-inset-left, 0px))" $T/h.html'
pruefe "HTML: details/summary, Tabelle, verschachtelte Liste, Umbrüche" 'grep -qF "<details><summary>Technik</summary>" $T/h.html && grep -qF "<td>1</td><td>2</td>" $T/h.html && grep -qF "<ol><li>" $T/h.html && grep -qF "Zeile eins<br>" $T/h.html && [[ $(grep -c "<details>" $T/h.html) == $(grep -c "</details>" $T/h.html) ]]'
pruefe "HTML: Text maskiert, Code, Fett, Link" 'grep -qF "gut &lt;script&gt;x&lt;/script&gt;" $T/h.html && grep -qF "<code>Code</code>" $T/h.html && grep -qF "<strong>Nacht:</strong>" $T/h.html && grep -qF "<a href=\"https://example.org\">Link</a>" $T/h.html'
pruefe "HTML: Probe-Bericht wohlgeformt" 'python3 -I $HIER/bericht-html.py $T/b.md | python3 -I -c "
import sys, html.parser
class P(html.parser.HTMLParser):
    st = []; f = 0
    def handle_starttag(s, t, a):
        if t not in (\"br\", \"meta\"): s.st.append(t)
    def handle_endtag(s, t):
        if s.st and s.st[-1] == t: s.st.pop()
        else: s.f += 1
p = P(); p.feed(sys.stdin.read()); sys.exit(1 if p.st or p.f else 0)"'
# Soll nach dem freien Reset (Maintainer 18.11.2026): Anker Fr 20.11. 10:00, Brief Sa 21.11. 08:30 → 22,5 / 87 h = 25,9 %
print -r -- "anker 2026-11-20T10:00+01:00 98 2" > $T/anker.txt
A=$(HALO_WOCHENANKER=$T/anker.txt HALO_KONTINGENT_WOCHE=20 lauf 2026-11-21T08:30:00+01:00 $T/anker.md)
pruefe "Morgenbrief nach freiem Reset: „Soll bis nächster Reset“ ab dem Anker" 'grep -q "Kontingent: Woche 20 % (Soll bis nächster Reset 25.9 %, -5.9)" $T/anker.md && grep -q "Soll bis nächster Reset jetzt 26 %" $T/anker.md'
A=$(HALO_WOCHENANKER=$T/anker.txt HALO_KONTINGENT_WOCHE=20 lauf 2026-11-24T08:30:00+01:00 $T/anker2.md)
pruefe "Morgenbrief nach dem automatischen Reset: Anker verfallen, 168-h-Kurve" 'grep -q "Kontingent: Woche 20 % (Soll 4.5 %" $T/anker2.md'
exit $FEHLER
