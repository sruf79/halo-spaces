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
print kaputt > $T/kaputt.json
kaputt=$(python3 $HIER/haeufung.py --eingabe $T/kaputt.json --aus $T/x 2>&1); rc=$?
pruefe "kaputte Eingabe → Exitcode 1, Meldung FEHLER" '(( rc == 1 )) && [[ $kaputt == FEHLER* ]]'
exit $FEHLER
