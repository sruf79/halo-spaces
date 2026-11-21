#!/bin/zsh
# Logik-Test für tests/haeufung.py mit Beispieldaten (kein Netz, kein gh, nichts am Board).
# Je Fall eine Zeile OK/FEHLER, Exitcode 0 nur bei Erfolg.
#   zsh tests/haeufung_test.zsh
emulate -L zsh
HIER=${0:A:h}
T=$(mktemp -d); trap 'rm -rf $T' EXIT
FEHLER=0
pruefe() {   # <Name> <Bedingung>
  if eval $2; then print -r -- "OK     $1"; else print -r -- "FEHLER $1"; FEHLER=1; fi
}

# Beispieldaten: e(<id> <Status> <Titel> [<Text>])
typeset -a ZEILEN
e() { ZEILEN+=("$(jq -cn --arg i $1 --arg s $2 --arg t $3 --arg b "${4:-}" '{id:$i,status:$s,title:$t,content:{body:$b}}')") }
# die echte Gruppe vom 14.11.2026 (nur Titel, ohne Querverweise: muss allein aus Bereich und Stelle folgen)
e T1 Todo 'Mail-Toolbar: Höhe, Breite und Icon-Positionen exakt wie Apple Mail'
e T2 Todo 'Mail-Toolbar: Spacer wie in Apple Mail (links, Mitte, Suchfeld)'
e T3 Todo 'Mail: Knöpfe im Kopf des Fensters einer geöffneten Mail wie Apple Mail anordnen, doppelten Stern entfernen'
e T4 Todo 'Mailfenster: Toolbar-Knöpfe ohne graue Hover-/Klick-Kreise, falscher Stern'
# Gegenbeispiele
e S1 Todo 'Seitenleiste: Lichtschein und gefärbte Trennlinie in der Spacefarbe (Umsetzung 2/3)'
e K1 Todo 'Kalender: Mini-Kalender in der Sidebar näher an den unteren Rand und Trennlinie darüber'
e K2 'In Progress' 'Kalender: Klick auf die Adresse im Termin öffnet die Karten-App des Nutzers'
e A1 Todo 'Aufgaben: Aufgaben archivieren, Eintrag „Archiviert“ in der Seitenleiste unter „Wichtig“'
e M1 Todo 'Mail: BIMI-Absenderlogos im Profilkreis weiterhin kleiner'
e P1 Todo 'Today-Pane: grauer Rahmen im Mini-Kalender wandert beim Scrollen mit'
e P2 Todo 'Today-Pane: Tastenkürzel Control+Cmd+T zum Ein- und Ausblenden'
# Reihe: Schritte derselben Reihe zählen nicht als Häufung
e R7 Todo 'Code: implementation.js in Module zerlegen 7/8 – Unterhaltungsansicht nach api/unterhaltung.js'
e R8 Todo 'Code: implementation.js in Module zerlegen 8/8 – CardEnhancer aufteilen'
# gleiche GitHub-Nummer im Titel verbindet auch über Bereiche hinweg
e G1 Todo 'Seitenleisten-Knopf fehlt nach Update (macOS) [GitHub #59]'
e G2 Todo 'Tests: Seitenleisten-Knopf nach Update prüfen [GitHub #59]'
# Verweis im Text (Board-id) plus gemeinsame Stelle; ein Verweis allein über Bereiche hinweg verbindet nicht
e V1 Todo 'Kalender: Termine in der Mehrwochenansicht ruckeln' 'Wo: Kalender, Mehrwochenansicht.'
e V2 Todo 'Kalender: Mehrwochenansicht als Standard einschalten' 'Zusammenhang: V1'
e V3 Todo 'Adressbuch: Karten springen' 'Zusammenhang: V1'
# „Wartet auf OK“ und Done bleiben außen vor
e W1 'Wartet auf OK' 'Mail-Toolbar: Pillen neu zeichnen'
e D1 Done 'Mail-Toolbar: Suchfeld breiter'
print -r -- "{\"items\":[${(j:,:)ZEILEN}]}" > $T/board.json
# Verweis als Board-id: V2/V3 nennen „V1“, das Skript sucht PVTI_-Kennungen → ids umschreiben
sed -i '' 's/"V1"/"PVTI_V1"/; s/Zusammenhang: V1/Zusammenhang: PVTI_V1/g' $T/board.json

aus=$(python3 $HIER/haeufung.py --eingabe $T/board.json --aus $T --datum 2026-11-14 2>&1); rc=$?
pruefe "läuft ohne Fehler, Kurzzeile" '(( rc == 0 )) && [[ $aus == Häufung:* ]]'
TSV=$T/2026-11-14-haeufung.tsv MD=$T/2026-11-14-haeufung.md
pruefe "schreibt .md und .tsv" '[[ -s $TSV && -s $MD ]]'
gruppe_von() { awk -F'\t' -v i=$1 '$1=="gruppe" { n=split($6,a,","); for (k=1;k<=n;k++) if (a[k]==i) print $2 }' $TSV }
zeile_von() { awk -F'\t' -v g=$1 '$1=="gruppe" && $2==g' $TSV }
g=$(gruppe_von T1)
pruefe "echte Gruppe Mail-Toolbar/Mailfenster: alle vier in einer Gruppe" \
  '[[ -n $g && $(gruppe_von T2) == $g && $(gruppe_von T3) == $g && $(gruppe_von T4) == $g ]]'
pruefe "echte Gruppe: genau 4 Einträge, Zuschlag 1.5, aufgerundet 2" \
  '[[ $(zeile_von $g | cut -f3-5) == $(print "4\t1.5\t2") ]]'
pruefe "echte Gruppe: je Paar ein Grund (Stelle toolbar bzw. stern)" \
  'grep -q "^paar	$g	T3	T4	.*Stelle .*stern" $TSV && grep -q "^paar	$g	T1	T2	.*Stelle toolbar" $TSV'
pruefe "Seitenleiste und Kalender (Sidebar, Trennlinie) nicht verbunden" '[[ -z $(gruppe_von S1) && -z $(gruppe_von K1) ]]'
pruefe "Aufgaben mit Wort Seitenleiste nicht bei Seitenleiste" '[[ -z $(gruppe_von A1) ]]'
pruefe "Mail-Einzeleintrag ohne gemeinsame Stelle bleibt allein" '[[ -z $(gruppe_von M1) && -z $(gruppe_von K2) ]]'
pruefe "Today-Pane: Mini-Kalender und Tastenkürzel nicht verbunden (Bereichsname zählt nicht)" '[[ -z $(gruppe_von P1) && -z $(gruppe_von P2) ]]'
pruefe "Schritte derselben Reihe nicht gehäuft" '[[ -z $(gruppe_von R7) && -z $(gruppe_von R8) ]]'
pruefe "gleiche GitHub-Nummer verbindet über Bereiche" '[[ -n $(gruppe_von G1) && $(gruppe_von G1) == $(gruppe_von G2) ]]'
pruefe "gemeinsame Stelle (Mehrwochenansicht) im selben Bereich verbindet" '[[ -n $(gruppe_von PVTI_V1) && $(gruppe_von PVTI_V1) == $(gruppe_von V2) ]]'
pruefe "Verweis allein über Bereiche verbindet nicht" '[[ -z $(gruppe_von V3) ]]'
pruefe "Wartet auf OK und Done nicht gezählt" '! grep -qE "	(W1|D1)(,|	)" $TSV && ! grep -qE "[,	](W1|D1)," $TSV'
pruefe "Zuschlag bei 2 Einträgen 0.5, aufgerundet 1" '[[ $(zeile_von $(gruppe_von G1) | cut -f3-5) == $(print "2\t0.5\t1") ]]'
pruefe "deterministisch: zweiter Lauf gleiche Gruppen" \
  'cp $TSV $T/erst.tsv; python3 $HIER/haeufung.py --eingabe $T/board.json --aus $T --datum 2026-11-14 >/dev/null && cmp -s $TSV $T/erst.tsv'
# Alters-Zuschlag (Board-Eintrag „Ablauf: Alter der Einträge wirksam machen …“, 20.11.2026): +0,5 je volle 7 Tage, Deckel +1,5
az() { python3 -c "import sys; sys.path.insert(0, '$HIER'); import haeufung as h; print(h.alters_zuschlag(h.alter_tage($1, '2026-11-20')))" }
pruefe "Alter 0 Tage → 0" '[[ $(az "\"2026-11-20T08:00:00Z\"") == 0.0 ]]'
pruefe "Alter 6 Tage → 0" '[[ $(az "\"2026-11-14T23:59:00Z\"") == 0.0 ]]'
pruefe "Alter 7 Tage → 0,5" '[[ $(az "\"2026-11-13T00:00:00Z\"") == 0.5 ]]'
pruefe "Alter 14 Tage → 1" '[[ $(az "\"2026-11-06T12:00:00Z\"") == 1.0 ]]'
pruefe "Alter 21 Tage → 1,5" '[[ $(az "\"2026-10-30T12:00:00Z\"") == 1.5 ]]'
pruefe "Alter 60 Tage → Deckel 1,5" '[[ $(az "\"2026-09-21T12:00:00Z\"") == 1.5 ]]'
pruefe "ohne Datum (None, leer, kaputt) → 0" '[[ $(az None) == 0.0 && $(az "\"\"") == 0.0 && $(az "\"kaputt\"") == 0.0 ]]'
jq '.items[0].createdAt = "2026-10-01T10:00:00Z" | .items[1].createdAt = "2026-11-13T10:00:00Z" | .items[2].createdAt = "2026-11-19T10:00:00Z"' $T/board.json > $T/alt.json
python3 $HIER/haeufung.py --eingabe $T/alt.json --aus $T/alt --datum 2026-11-20 > $T/alt.aus 2>&1; rc=$?
pruefe "Alter: Kurzzeile nennt Einträge mit Zuschlag" '(( rc == 0 )) && grep -q "; Alter: 2 Einträge mit Zuschlag, Alters-Platz" $T/alt.aus'
pruefe "Alter: .tsv-Zeilen alter (älteste zuerst, Deckel), Abschnitt in der .md" \
  '[[ $(grep "^alter	" $T/alt/2026-11-20-haeufung.tsv | cut -f2-4) == $(print -l "T1	50	1.5" "T2	7	0.5") ]] && grep -q "^## Alter (Skript)" $T/alt/2026-11-20-haeufung.md'
pruefe "Alter: ohne createdAt kein Zuschlag, Gruppen unverändert" '! grep -q "^alter	T3" $T/alt/2026-11-20-haeufung.tsv && [[ $(grep "^gruppe" $T/alt/2026-11-20-haeufung.tsv | cut -f3-) == $(grep "^gruppe" $TSV | cut -f3-) ]]'
# Alters-Platz: die drei ältesten machbaren Einträge
cat > $T/platz.json <<'EOF'
{"items":[
 {"id":"P1","status":"Todo","title":"Mail: am ältesten, aber Entscheidung offen","body":"Entscheidung fehlt seit 2026-11-01: Welche Farbe?","createdAt":"2026-09-01T10:00:00Z"},
 {"id":"P2","status":"Wartet auf OK","title":"Mail: wartet","body":"","createdAt":"2026-09-02T10:00:00Z"},
 {"id":"P3","status":"In Progress","title":"Mail: fertig","body":"committet abc1234, wartet auf Push/CI","createdAt":"2026-09-03T10:00:00Z"},
 {"id":"P4","status":"Todo","title":"Ablauf: neue Regel","body":"","createdAt":"2026-09-04T10:00:00Z"},
 {"id":"P5","status":"Todo","title":"Import: PST 3/3 – Kontakte","body":"","createdAt":"2026-09-05T10:00:00Z"},
 {"id":"P6","status":"Todo","title":"Kalender: Worker dran","body":"In Arbeit: worker-2 (21:00)","createdAt":"2026-09-06T10:00:00Z"},
 {"id":"P7","status":"Todo","title":"Kalender: Worker fertig","body":"In Arbeit: worker-2 (20:00)\n\nIn Arbeit beendet","createdAt":"2026-10-01T10:00:00Z"},
 {"id":"P8","status":"Todo","title":"Import: PST 2/3 – Mails","body":"","createdAt":"2026-10-02T10:00:00Z"},
 {"id":"P9","status":"In Progress","title":"Chat: läuft noch","body":"","createdAt":"2026-10-03T10:00:00Z"},
 {"id":"P10","status":"Todo","title":"Chat: jünger","body":"","createdAt":"2026-11-10T10:00:00Z"},
 {"id":"P11","status":"Todo","title":"Chat: ohne Datum","body":""},
 {"id":"P12","status":"Done","title":"Chat: erledigt","body":"","createdAt":"2026-08-01T10:00:00Z"}
]}
EOF
python3 $HIER/haeufung.py --eingabe $T/platz.json --aus $T/platz --datum 2026-11-20 > $T/platz.aus 2>&1; rc=$?
pruefe "Alters-Platz: drei älteste machbare (ohne Entscheidung offen, Wartet auf OK, Push/CI, Ablauf, Worker, späteren Reihenschritt)" \
  '(( rc == 0 )) && [[ $(grep "^aeltest	" $T/platz/2026-11-20-haeufung.tsv | cut -f2-4) == $(print -l "1	P7	50" "2	P8	49" "3	P9	48") ]]'
pruefe "Alters-Platz: Unterabschnitt in der .md, Kurzzeile nennt Kandidaten" 'grep -q "^### Älteste machbare Einträge (Alters-Platz)" $T/platz/2026-11-20-haeufung.md && grep -q "Alters-Platz: 3 Kandidaten" $T/platz.aus'
print kaputt > $T/kaputt.json
kaputt=$(python3 $HIER/haeufung.py --eingabe $T/kaputt.json --aus $T/x 2>&1); rc=$?
pruefe "kaputte Eingabe → Exitcode 1, Meldung FEHLER" '(( rc == 1 )) && [[ $kaputt == FEHLER* ]]'
exit $FEHLER
