# Prüfung des Leitstand-Zubringers (tests/leitstand-status.zsh) ohne Netz, ohne Claude, im Wegwerf-Ordner.
# Nicht unter tests/logik/: Abläufe brauchen keine CI (tests/ci-noetig.sh).
# Aufruf: zsh tests/leitstand_status_test.zsh   → je Fall eine Zeile OK/FEHLER, Exitcode 1 bei einem Fehler
emulate -L zsh
HIER=${0:A:h}
T=$(mktemp -d) || exit 1
trap 'rm -rf $T' EXIT
FEHLER=0
pruefe() {   # <Name> <jq-Ausdruck, der true ergeben muss>
  if [[ $(jq -r "$2" $T/aus.json 2>/dev/null) == true ]]; then print "OK      $1"; else print "FEHLER  $1"; FEHLER=1; fi
}
# 2026-11-19 08:00 Wiener Zeit = 07:00 UTC
JETZT=$(TZ=UTC date -j -f '%Y-%m-%d %H:%M:%S' '2026-11-19 07:00:00' +%s)
pruefe_v() {   # <Name> <jq-Ausdruck über verlauf.json, der true ergeben muss>
  if [[ $(jq -r "$2" $T/d/verlauf.json 2>/dev/null) == true ]]; then print "OK      $1"; else print "FEHLER  $1"; FEHLER=1; fi
}
VH=$T/n/leitstand-verlauf.json
verlauf_mit() {   # <Abstand in s> <Anzahl> [<Alter des neuesten Punkts in s>]: lokale Historie mit gleichmäßigen Punkten
  python3 -I -c 'import sys, json, datetime as d
j, a, n, e = (int(x) for x in sys.argv[1:5])
t = [d.datetime.fromtimestamp(j - e - a * i, d.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ") for i in range(n)][::-1]
print(json.dumps({"punkte": [{"t": x, "woche": 1} for x in t]}))' $JETZT $1 $2 ${3:-$1} > $VH
}
lauf() {   # [<Epochensekunden>]
  HALO_LS_DIR=$T/d HALO_NACHT_DIR=$T/n HALO_AUFGABEN_DIR=$T/a HALO_LS_JETZT=${1:-$JETZT} HALO_LS_OHNE_NETZ=1 \
    HALO_LS_PS=$T/ps.txt zsh $HIER/leitstand-status.zsh --trocken $T/repo > $T/aus.json 2>$T/fehler.txt
}

# --- Fall 1: keine Quelle vorhanden → Felder null, kein Abbruch ---
mkdir -p $T/n $T/a; : > $T/ps.txt
HALO_LS_VOLLDAMPF= HALO_LS_SOLL= lauf
print "Exitcode $?" >> $T/fehler.txt
pruefe "ohne Quellen: gültiges JSON mit Stand" '.stand == "2026-11-19T07:00:00Z"'
pruefe "ohne Quellen: Kontingent, Board, CI, Issues, Bilder, GitHub-Limit null" \
  '(has("github_limit") and .github_limit == null) and .kontingent == null and .board == null and .ci == null and .ci_main == null and .rueckmeldungen.issues_warten == null and .rueckmeldungen.bilder_offen == null'
pruefe "ohne Quellen: keine Agenten, Läufe inaktiv ohne Schritt" '.agenten == [] and .laeufe.nachtlauf.aktiv == false and .laeufe.nachtlauf.schritt == null'
pruefe "ohne Quellen: zuletzt leere Liste" '.zuletzt == []'
pruefe "nichts läuft: keine Runde in Nachtlauf und Tagesroutine" '.laeufe.nachtlauf.runde == false and .laeufe.tagesroutine.runde == false and .laeufe.nachtlauf.weiter_um == null and .laeufe.tagesroutine.weiter_um == null'
pruefe "ohne Quellen: 48-Stunden-Zahlen und offene Issues null" '.rueckmeldungen.issues_neu_48h == null and .rueckmeldungen.issues_geschlossen_48h == null and .rueckmeldungen.issues_offen == null and (.rueckmeldungen | has("issues_offen"))'
pruefe "ohne Quellen: Volldampf unbekannt (null), Pausen leer, Rot-Zähler 0" '.schalter.volldampf == null and .schalter.pausen == [] and .schalter.rot_zaehler == 0'
pruefe "ohne Quellen: Release-Schätzung nächster Nachtlauf" '.release_eta.zeit == "2026-11-20T03:30:00Z"'
pruefe_v "Verlauf ohne Quellen: ein Punkt, Werte null, Agenten 0" \
  '(.punkte | length == 1) and .punkte[0] == {"t":"2026-11-19T07:00:00Z","woche":null,"fuenf":null,"soll":null,"bugs":null,"features":null,"in_arbeit":null,"ci_wartend":null,"ci_laufend":null,"agenten":0,"gh_rest":null,"gh_graphql":null,"drossel":null}'
cmp -s $VH $T/d/verlauf.json && print "OK      Verlauf: lokale Historie gleich verlauf.json" || { print "FEHLER  Verlauf: lokale Historie gleich verlauf.json"; FEHLER=1; }

# --- Fall 2: alle Quellen ---
rm -rf $T/d; mkdir -p $T/d/quellen $T/n/auslastung
cat > $T/ps.txt <<'EOF'
  100     1 05:30:00 /bin/zsh /x/nachtlauf.sh /Users/x/halo-spaces
  101   100 05:29:50 /bin/zsh /x/nachtlauf.sh /Users/x/halo-spaces
  102   101    10:00 claude -p --model opus --resume abc --permission-mode auto Weiter
  200     1    50:00 /bin/zsh /x/tagesroutine.sh /Users/x/halo-spaces
  201   200    05:00 claude -p --model sonnet --session-id s1 --permission-mode auto Auftrag: Steht im JETZT:M-bM^@M^\.\012kein Design-Eintrag M-bM^@M^^XM-bM^@M^\\012JETZT: genau einen Eintrag bearbeiten (Schritt 3 des Auftrags): PVTI_a (design) M-bM^@M^^Mail: Knopf fehltM-bM^@M^\. Modell dieser Runde: sonnet.\012Design-Eintrag: Du bist der Director und beauftragst den Designer
  300     1 1-02:00:00 zsh /x/auslastung-schleife.zsh
  301   300    00:05 zsh /x/auslastung-schleife.zsh
  306   300    00:05 sleep 900
  302     1    00:05 zsh /x/auslastung-schleife.zsh
  303   302    00:05 sleep 14400
  304     1 03:00:00 zsh /x/auslastung-schleife.zsh
  305   304 03:00:00 sleep 14400
  400     1    20:00 claude -p --model opus --session-id w1 --permission-mode auto Worker
  500     1    15:00 /Users/x/actions-runner/bin/Runner.Worker spawnclient 1 2
  600     1 3-12:00:00 /Users/x/.local/bin/claude remote-control --spawn=same-dir --name neon-board --permission-mode auto
EOF
print "400 w1 opus $((JETZT - 1200)) /wt pruef/w /e normal" > $T/n/auslastung/worker-1
print "401 w3 sonnet $((JETZT - 600)) /wt3 pruef/w3 /e normal" > $T/n/auslastung/worker-3
print "  401     1    10:00 claude -p --model sonnet --session-id w3 Worker" >> $T/ps.txt
# in-arbeit.tsv von board.sh: Nachtlauf (PID 100 in der Kette), Worker 1 (PID 400), Worker 3 nur über die Arbeitskopie, eine Zeile zu alt
{ printf '%s\tPVTI_bXYZ1\tKalender: Woche zeigt Feiertage\t9000,9001,102,101,100,1\tmain\t/Users/x/halo-spaces\n' $((JETZT - 300))
  printf '%s\tPVTI_q\tMail: Worker-Eintrag\t9100,400\tpruef/w\t/wt\n' $((JETZT - 200))
  printf '%s\tPVTI_r\tAdressbuch: über Ordner\t9200\t-\t/wt3/tests\n' $((JETZT - 100))
  printf '%s\tPVTI_s\tAlt: zu alt\t9300,400\tpruef/w\t/wt\n' $((JETZT - 90000)) } > $T/n/in-arbeit.tsv
print "999 w2 opus $((JETZT - 1200)) /wt pruef/w /e normal" > $T/n/auslastung/worker-2   # Prozess tot
cat > $T/n/2026-11-19.log <<'EOF'
2026-11-19 01:30:05 Start, Sitzung x
2026-11-19 07:27:19 Runde 2 beendet (Exitcode 0): fertig
2026-11-19 07:27:22 Volldampf aktiv bis 2026-11-24T01:00+01:00
EOF
print "2026-11-19 07:50:00 Runde mit sonnet, Sitzung s1" > $T/n/2026-11-19-tagesroutine.log
print '{"stand": "2026-11-19T07:45:00+0100", "info": {"unifiedWindows": {"five_hour": {"utilization": 0.18, "resetsAt": 1795078800}, "seven_day": {"utilization": 0.05, "resetsAt": 1795478400}}}}' > $T/n/kontingent.json
cat > $T/n/pausen.txt <<'EOF'
tagesroutine 2026-11-19T09:30+01:00 Testpause
nachtlauf 2026-11-18T09:30+01:00 abgelaufen
EOF
printf '2026-11-18 10:00:00\tabc123\trot/x\tOpus\n2026-10-01 10:00:00\talt\trot/y\tOpus\n' > $T/n/rot-zaehler.txt
cat > $T/d/quellen/board.json <<'EOF'
{"items":[
 {"id":"PVTI_a","status":"In Progress","title":"Mail: Knopf fehlt","typ":"Bug","content":{"body":"Text\n\ncommittet, wartet auf Push/CI (abc1234)"}},
 {"id":"PVTI_bXYZ1","status":"Todo","title":"Kalender: Woche zeigt Feiertage","typ":"Feature","content":{"body":""}},
 {"id":"PVTI_cXYZ2","status":"Todo","title":"[GitHub #9] Adressbuch: Liste leer","typ":"Bug","content":{"body":""}},
 {"id":"PVTI_dXYZ3","status":"Wartet auf OK","title":"Ablauf: neue Regel","typ":"Feature","content":{"body":""}},
 {"id":"PVTI_eXYZ4","status":"Todo","title":"ohne Bereich","typ":"Bug","content":{"body":""}}]}
EOF
cat > $T/n/2026-11-19-plan.md <<'EOF'
| Nr. | id | Titel | Nutzen |
|---|---|---|---|
| 1 | XYZ3 | Ablauf | 5 |
| 2 | XYZ2, a (G1) | Adressbuch | 4 |
| – | Push + CI | | |
| 3 | XYZ1 | Kalender | 3 |
| 4 | weg9 | archiviert | 2 |
EOF
printf '2026-11-18 | PVTI_x | Bug | a | -\n2026-11-10 | PVTI_y | Bug | b | -\n' > $T/a/archiv.md
printf '| Name | Befehl |\n|---|---|\n| bild-a | halobild bild-a |\n' > $T/a/bilder-offen.md
print '[{"nr":5,"titel":"Offen","seit":"2026-11-18T10:00:00Z","wir":false},{"nr":6,"titel":"Beantwortet","seit":"2026-11-18T11:00:00Z","wir":true}]' > $T/d/quellen/issues.json
cat > $T/d/quellen/ci.json <<'EOF'
[{"databaseId":3,"number":3,"displayTitle":"neu","headBranch":"pruef/x","event":"push","status":"completed","conclusion":"failure","createdAt":"2026-11-19T06:00:00Z","updatedAt":"2026-11-19T06:30:00Z","url":"u3"},
 {"databaseId":2,"number":2,"displayTitle":"main","headBranch":"main","event":"push","status":"in_progress","conclusion":"","createdAt":"2026-11-19T05:00:00Z","updatedAt":"2026-11-19T05:30:00Z","url":"u2"}]
EOF
print '{"tag":"v3.32.0","zeit":"2026-11-18T05:38:00Z"}' > $T/d/quellen/release.json
print '{"ahead":4}' > $T/d/quellen/vergleich.json
# gh api rate_limit (--jq auf core/graphql): REST 1234 von 5000 verbraucht, GraphQL 50 von 5000
print '{"core":{"limit":5000,"used":1234,"remaining":3766,"reset":1795078800},"graphql":{"limit":5000,"used":50,"remaining":4950,"reset":1795080600}}' > $T/d/quellen/rate.json
# 48 Stunden (Maintainer 19.11.2026): Grenze 2026-11-17T07:00:00Z; B doppelt (sichtbar und archiviert) zählt einmal
cat > $T/d/quellen/board48.json <<'EOF'
{"stand":0,"sichtbar":[
 {"id":"A","createdAt":"2026-11-18T10:00:00Z","updatedAt":"2026-11-18T10:00:00Z","fieldValueByName":{"name":"Todo","updatedAt":"2026-11-18T10:00:00Z"}},
 {"id":"B","createdAt":"2026-11-10T10:00:00Z","updatedAt":"2026-11-19T06:00:00Z","fieldValueByName":{"name":"Done","updatedAt":"2026-11-19T06:00:00Z"}},
 {"id":"C","createdAt":"2026-11-17T06:59:59Z","updatedAt":"2026-11-19T06:00:00Z","fieldValueByName":{"name":"In Progress","updatedAt":"2026-11-19T06:00:00Z"}},
 {"id":"G","createdAt":"2026-11-01T10:00:00Z","updatedAt":"2026-11-19T06:00:00Z","fieldValueByName":null}],
"archiviert":[
 {"id":"B","createdAt":"2026-11-10T10:00:00Z","updatedAt":"2026-11-19T06:00:00Z","isArchived":false,"fieldValueByName":{"name":"Done","updatedAt":"2026-11-19T06:00:00Z"}},
 {"id":"D","createdAt":"2026-11-18T08:00:00Z","updatedAt":"2026-11-18T09:01:00Z","isArchived":true,"fieldValueByName":{"name":"Done","updatedAt":"2026-11-18T09:00:00Z"}},
 {"id":"E","createdAt":"2026-11-01T08:00:00Z","updatedAt":"2026-11-18T12:00:00Z","isArchived":true,"fieldValueByName":{"name":"Wartet auf OK","updatedAt":"2026-11-02T08:00:00Z"}},
 {"id":"F","createdAt":"2026-11-01T08:00:00Z","updatedAt":"2026-11-18T12:00:00Z","isArchived":true,"fieldValueByName":{"name":"Done","updatedAt":"2026-11-16T00:00:00Z"}}]}
EOF
print '[{"nr":1,"offen":true,"eroeffnet":"2026-11-18T10:00:00Z","geschlossen":null},{"nr":2,"offen":false,"eroeffnet":"2026-11-10T10:00:00Z","geschlossen":"2026-11-18T10:00:00Z"},{"nr":3,"offen":false,"eroeffnet":"2026-11-18T11:00:00Z","geschlossen":"2026-11-19T06:00:00Z"},{"nr":4,"offen":false,"eroeffnet":"2026-11-01T10:00:00Z","geschlossen":"2026-11-16T10:00:00Z"}]' > $T/d/quellen/issues48.json
HALO_LS_VOLLDAMPF=1 HALO_LS_SOLL="7.3 6.04 anker x y" lauf
pruefe "48 h Board: neu 2 (A, D), erledigt 3 (B Done, D Done, E archiviert; F zu alt, B einmal)" '.board.zahlen.neu_48h == 2 and .board.zahlen.erledigt_48h == 3'
pruefe "48 h Issues: neu 2, geschlossen 2, offen 2 (aus issues.json)" '.rueckmeldungen.issues_neu_48h == 2 and .rueckmeldungen.issues_geschlossen_48h == 2 and .rueckmeldungen.issues_offen == 2'
pruefe_v "48 h: keine neuen Felder in verlauf.json" '.punkte[-1] | has("neu_48h") or has("issues_offen") | not'
print '{kaputt' > $T/d/quellen/board48.json; python3 -I -c 'import json; print(json.dumps([{"nr": i, "offen": True, "eroeffnet": "2026-11-18T10:00:00Z", "geschlossen": None} for i in range(200)]))' > $T/d/quellen/issues48.json
lauf
pruefe "48 h: kaputtes board48 bzw. volle Issue-Liste (200) → null, Rest bleibt" '.board.zahlen.neu_48h == null and .board.zahlen.erledigt_48h == null and .rueckmeldungen.issues_neu_48h == null and .rueckmeldungen.issues_geschlossen_48h == null and .rueckmeldungen.issues_offen == 2 and .board.zahlen.bugs_offen == 3'
rm -f $T/d/quellen/board48.json $T/d/quellen/issues48.json
HALO_LS_VOLLDAMPF=1 HALO_LS_SOLL="7.3 6.04 anker x y" lauf
pruefe "Agenten: Nachtlauf mit Modell, Unterschale nicht doppelt" '[.agenten[] | select(.name == "Nachtlauf")] | length == 1 and .[0].modell == "opus" and .[0].seit == "2026-11-19T01:30:00Z"'
pruefe "Agenten: Auslastungswächter einmal (Unterschalen und 4-Stunden-Zeitgeber zählen nicht)" '[.agenten[] | select(.name == "Wächter Auslastung")] | length == 1 and .[0].seit == "2026-11-18T05:00:00Z"'
pruefe "Agenten: lebende Worker mit Zweig und Modell, toter fehlt" '[.agenten[] | select(.art == "worker") | .name] == ["Worker 1 (pruef/w)", "Worker 3 (pruef/w3)"] and ([.agenten[] | select(.art == "worker")][0].modell == "opus")'
pruefe "Agenten: Eintrag je Worker (PID-Kette, sonst Arbeitskopie; zu alte Zeile zählt nicht)" '[.agenten[] | select(.art == "worker") | .eintrag] == ["Mail: Worker-Eintrag", "Adressbuch: über Ordner"]'
pruefe "Agenten: Eintrag von Nachtlauf (in-arbeit.tsv) und Tagesroutine (Runde)" '([.agenten[] | select(.name == "Nachtlauf")][0].eintrag == "Kalender: Woche zeigt Feiertage") and ([.agenten[] | select(.name == "Tagesroutine")][0].eintrag == "Mail: Knopf fehlt")'
pruefe "Agenten: Designer-Runde als eigener Agent mit Eintrag" '[.agenten[] | select(.name == "Designer (Tagesroutine)")] | length == 1 and .[0].eintrag == "Mail: Knopf fehlt" and .[0].modell == "sonnet"'
pruefe "Agenten: jeder Eintrag hat das Feld eintrag" '[.agenten[] | has("eintrag")] | all'
pruefe "arbeitet: Nachtlauf, Tagesroutine, Designer, Worker mit Claude-Runde; Wächter, CI-Runner, Sitzung läuft" \
  '([.agenten[] | select(.art == "lauf" or .art == "worker") | .zustand] | all(. == "arbeitet")) and ([.agenten[] | select(.art == "waechter" or .art == "ci" or .art == "sitzung") | .zustand] | all(. == "läuft")) and ([.agenten[] | has("zustand") and has("grund")] | all) and ([.agenten[] | .grund] | all(. == null))'
pruefe "arbeitet: Läufe aktiv mit Runde" '.laeufe.nachtlauf.aktiv and .laeufe.nachtlauf.runde and .laeufe.tagesroutine.aktiv and .laeufe.tagesroutine.runde and .laeufe.tagesroutine.weiter_um == null and ([.agenten[] | has("weiter_um") and .weiter_um == null] | all)'
pruefe "Läufe: Eintrag des Nachtlaufs aus in-arbeit.tsv" '.laeufe.nachtlauf.eintrag == "Kalender: Woche zeigt Feiertage"'
pruefe "Agenten: CI-Runner und Sitzung neon-board" '([.agenten[] | select(.art == "ci")] | length == 1) and ([.agenten[] | select(.art == "sitzung")][0].name == "neon-board")'
pruefe "Läufe: Nachtlauf-Schritt ohne Volldampf-Zeile" '.laeufe.nachtlauf.aktiv and (.laeufe.nachtlauf.schritt | startswith("Runde 2 beendet"))'
pruefe "Läufe: Eintrag der Tagesroutine aus der Runde (vis-kodiert wie ps), Schritt ohne Sitzungs-ID" '.laeufe.tagesroutine.eintrag == "Mail: Knopf fehlt" and .laeufe.tagesroutine.seit == "2026-11-19T06:10:00Z" and .laeufe.tagesroutine.schritt == "Runde mit sonnet"'
pruefe "Kontingent: Werte, Messzeit UTC, Soll" '.kontingent == {"gemessen":"2026-11-19T06:45:00Z","woche_prozent":5,"fuenf_stunden_prozent":18,"soll_prozent":6.0,"reset_woche":"2026-11-24T00:00:00Z","reset_5h":"2026-11-19T09:00:00Z"}'
pruefe "Schalter: Volldampf, Push-Sperre um 08:00, Rot-Zähler 14 Tage, nur aktive Pause" \
  '.schalter.volldampf and .schalter.push_sperre and .schalter.rot_zaehler == 1 and (.schalter.pausen | length == 1 and .[0].bis == "2026-11-19T08:30:00Z")'
pruefe "Board: in Arbeit mit Bereich und letzter Notizzeile" '.board.in_arbeit == [{"titel":"Mail: Knopf fehlt","typ":"Bug","bereich":"Mail","notiz":"committet, wartet auf Push/CI (abc1234)"}]'
pruefe "Board: nächste laut Plan, nur Todo, ohne Archiviertes" '[.board.naechste[] | .titel] == ["[GitHub #9] Adressbuch: Liste leer","Kalender: Woche zeigt Feiertage"] and .board.naechste[1].rang == 2'
pruefe "Board: Zahlen und Bereiche" '.board.zahlen.bugs_offen == 3 and .board.zahlen.features_offen == 2 and .board.zahlen.erledigt_woche == 1 and ([.board.zahlen.je_bereich[] | select(.bereich == "Sonstiges")][0].bugs == 1)'
pruefe "Rückmeldungen: nur Issues ohne unsere Antwort, Bilder gezählt" '.rueckmeldungen == {"issues_warten":[{"nr":5,"titel":"Offen","seit":"2026-11-18T10:00:00Z"}],"bilder_offen":1,"issues_neu_48h":null,"issues_geschlossen_48h":null,"issues_offen":2}'
pruefe "CI: Läufe übernommen, main läuft" '(.ci | length == 2) and .ci[0].ergebnis == "failure" and .ci[1].ergebnis == null and .ci_main == "läuft"'
pruefe "GitHub-Limit: REST und GraphQL mit Limit, verbraucht, Rest, Reset (UTC)" \
  '.github_limit == {"rest":{"limit":5000,"verbraucht":1234,"rest":3766,"reset":"2026-11-19T09:00:00Z"},"graphql":{"limit":5000,"verbraucht":50,"rest":4950,"reset":"2026-11-19T09:30:00Z"}}'
pruefe "Release: Nachtlauf läuft, Tag vor dem Start fehlt → offen" '.release_eta.zeit == null and (.release_eta.grund | test("Nachtlauf läuft.*4 Commits"))'
pruefe_v "Verlauf: im selben Augenblick kein zweiter Punkt (30-Minuten-Grenze)" '(.punkte | length == 1) and .punkte[0].woche == null'
# Punkt mit allen Quellen; CI: einer wartet, einer läuft, einer fertig
rm -f $VH
CI_VORHER=$(<$T/d/quellen/ci.json)
print '[{"databaseId":5,"number":5,"displayTitle":"w","headBranch":"main","event":"push","status":"queued","conclusion":"","createdAt":"2026-11-19T06:50:00Z","updatedAt":"2026-11-19T06:50:00Z","url":"u5"},
 {"databaseId":4,"number":4,"displayTitle":"l","headBranch":"pruef/y","event":"push","status":"in_progress","conclusion":"","createdAt":"2026-11-19T06:40:00Z","updatedAt":"2026-11-19T06:45:00Z","url":"u4"},
 {"databaseId":3,"number":3,"displayTitle":"neu","headBranch":"pruef/x","event":"push","status":"completed","conclusion":"failure","createdAt":"2026-11-19T06:00:00Z","updatedAt":"2026-11-19T06:30:00Z","url":"u3"}]' > $T/d/quellen/ci.json
HALO_LS_VOLLDAMPF=1 HALO_LS_SOLL="7.3 6.04 anker x y" lauf
pruefe_v "Verlauf: Punkt aus den Feldern (Kontingent, Board, CI, Agenten ohne Wächter, CI-Runner und Sitzungen)" \
  '.punkte == [{"t":"2026-11-19T07:00:00Z","woche":5,"fuenf":18,"soll":6.0,"bugs":3,"features":2,"in_arbeit":1,"ci_wartend":1,"ci_laufend":1,"agenten":5,"gh_rest":24.7,"gh_graphql":1.0,"drossel":null}]'
[[ $(wc -l < $T/d/verlauf.json) -eq 3 && $(sed -n 2p $T/d/verlauf.json) == '{"t":'* ]] && ! grep -q 'Mail: Knopf' $T/d/verlauf.json \
  && print "OK      Verlauf: je Punkt eine Zeile, keine Titel" || { print "FEHLER  Verlauf: je Punkt eine Zeile, keine Titel"; FEHLER=1; }
lauf $((JETZT + 1799))
pruefe_v "Verlauf: nach 29:59 Minuten kein neuer Punkt" '.punkte | length == 1'
lauf $((JETZT + 1800))
pruefe_v "Verlauf: nach 30 Minuten zweiter Punkt angehängt" '(.punkte | length == 2) and .punkte[1].t == "2026-11-19T07:30:00Z"'
[[ $(wc -l < $T/d/verlauf.json) -eq 4 ]] && print "OK      Verlauf: zwei Punkte, vier Zeilen" || { print "FEHLER  Verlauf: zwei Punkte, vier Zeilen"; FEHLER=1; }
# 7-Tage-Kürzung: Punkte vor 8 Tagen und genau 7 Tagen fallen weg, vor 2 Tagen bleibt
verlauf_mit 86400 1 $((8 * 86400)); jq -c '.punkte += [{"t":"2026-11-12T07:00:00Z"},{"t":"2026-11-17T07:00:00Z"}]' $VH > $VH.x && mv $VH.x $VH
lauf
pruefe_v "Verlauf: 7-Tage-Kürzung" '[.punkte[] | .t] == ["2026-11-17T07:00:00Z","2026-11-19T07:00:00Z"]'
# Obergrenze 336: 8 Tage alle 10 Minuten (neuester vor 30 Min.) → 336 neueste, der neue zuletzt
verlauf_mit 600 1152 1800
lauf
pruefe_v "Verlauf: höchstens 336 Punkte, neuer Punkt zuletzt" '(.punkte | length == 336) and .punkte[-1].t == "2026-11-19T07:00:00Z" and .punkte[-1].woche == 5'
# defekte lokale Historie → neu beginnen
print '{kaputt' > $VH; lauf
pruefe_v "Verlauf: defekte Historie → neu mit einem Punkt" '(.punkte | length == 1) and .punkte[0].bugs == 3'
print '{"punkte":5}' > $VH; lauf
pruefe_v "Verlauf: Historie falscher Form → neu mit einem Punkt" '.punkte | length == 1'
# alte Punkte ohne gh_rest/gh_graphql bleiben gültig, der neue Punkt hat beide
verlauf_mit 1800 2
lauf
pruefe_v "Verlauf: alte Punkte ohne GitHub-Felder bleiben, neuer Punkt mit Prozent" \
  '(.punkte | length == 3) and (.punkte[0] | has("gh_rest") | not) and .punkte[1] == {"t":"2026-11-19T06:30:00Z","woche":1} and .punkte[2].gh_rest == 24.7 and .punkte[2].gh_graphql == 1.0'
# GitHub-Limit nicht lesbar: kaputte Antwort bzw. fehlendes Feld → github_limit null, Prozent null, Rest bleibt
print '{kaputt' > $T/d/quellen/rate.json; rm -f $VH; lauf
pruefe "GitHub-Limit unlesbar (kaputt): null, Kontingent bleibt" '.github_limit == null and .kontingent.woche_prozent == 5'
pruefe_v "Verlauf: GitHub-Limit unlesbar → gh_rest und gh_graphql null" '.punkte[0] | has("gh_rest") and .gh_rest == null and .gh_graphql == null and .woche == 5'
print '{"core":{"limit":5000,"remaining":10},"graphql":null}' > $T/d/quellen/rate.json; lauf
pruefe "GitHub-Limit ohne GraphQL-Werte: null" '.github_limit == null'
rm -f $T/d/quellen/rate.json
print -r -- $CI_VORHER > $T/d/quellen/ci.json
rm -f $VH
# Sperrdatei: nur der eingetragene Hauptprozess zählt (auch wenn ein Zeitgeber nicht im selben Augenblick startete)
print 300 > $T/n/auslastung-schleife.lock
sed -i '' 's/^  303   302    00:05 sleep 14400/  303   302    00:01 sleep 14400/' $T/ps.txt
lauf
pruefe "Agenten: Auslastungswächter laut Sperrdatei einmal" '[.agenten[] | select(.name == "Wächter Auslastung")] | length == 1 and .[0].seit == "2026-11-18T05:00:00Z"'
# ci_main gezielt: main nicht unter den 15 neuesten, neuester main-Lauf abgebrochen → der davor zählt
print '[{"headBranch":"main","status":"completed","conclusion":"cancelled"},{"headBranch":"main","status":"completed","conclusion":"success"}]' > $T/d/quellen/ci-main.json
print '[{"databaseId":3,"number":3,"displayTitle":"neu","headBranch":"pruef/x","event":"push","status":"completed","conclusion":"failure","createdAt":"2026-11-19T06:00:00Z","updatedAt":"2026-11-19T06:30:00Z","url":"u3"}]' > $T/d/quellen/ci.json
lauf
pruefe "ci_main aus der gezielten Abfrage (grün), auch ohne main unter den 15 neuesten" '.ci_main == "grün"'
print '[{"headBranch":"main","status":"queued","conclusion":""}]' > $T/d/quellen/ci-main.json
lauf
pruefe "ci_main wartet" '.ci_main == "wartet"'
print '[{"headBranch":"main","status":"completed","conclusion":"failure"}]' > $T/d/quellen/ci-main.json
lauf
pruefe "ci_main rot" '.ci_main == "rot"'
lauf $((JETZT + 3 * 3600))
pruefe "11:00: keine Push-Sperre" '.schalter.push_sperre == false'
# Plan der Tagesroutine (neuer als der Nachtlauf-Plan), Erledigtes heute ausgeschlossen
printf '# Kopf\nPVTI_cXYZ2\tkomplex\tA\nPVTI_bXYZ1\tdesign\tK\n' > $T/n/2026-11-19-tagesroutine-plan.tsv
printf 'PVTI_cXYZ2\terledigt abc\n' > $T/n/2026-11-19-tagesroutine-erledigt.txt
touch -t 202611190755 $T/n/2026-11-19-tagesroutine-plan.tsv; touch -t 202611190100 $T/n/2026-11-19-plan.md
lauf
pruefe "Board: Plan der Tagesroutine, heute Erledigtes fehlt" '[.board.naechste[] | .titel] == ["Kalender: Woche zeigt Feiertage"]'
# kaputte Quelle: Board-JSON unlesbar → board null, Rest bleibt
print '{kaputt' > $T/d/quellen/board.json
lauf
pruefe "kaputtes Board: board null, Kontingent bleibt" '.board == null and .kontingent.woche_prozent == 5'
rm -f $VH; lauf
pruefe_v "Verlauf bei kaputtem Board: Board-Zahlen null, Kontingent bleibt" '.punkte[0].bugs == null and .punkte[0].features == null and .punkte[0].in_arbeit == null and .punkte[0].woche == 5'

# Kontingent-Drossel (19.11.2026, Maintainer: „bitte neon, die drossel-stufe in status.json mitzuliefern“): Feld drossel aus
# ~/halo-nacht/drossel-stufe.txt (nicht neu gerechnet), nur wenn höchstens 2 h alt; Stufe auch in jedem neuen Verlaufspunkt
printf '2 17.4 2026-11-19T07:40+01:00 2026-11-19T06:10+01:00\nkeine neuen Worker, Tagesroutine nur jede zweite Runde\nvoll So 04:30, 17 Fehlstunden vor dem Reset Di 01:00\n' > $T/n/drossel-stufe.txt
rm -f $VH; lauf
pruefe "Drossel: Stufe, Wirkung, Grund, seit, max_worker 0" '.drossel == {"stufe":2,"text":"keine neuen Worker, Tagesroutine nur jede zweite Runde","grund":"voll So 04:30, 17 Fehlstunden vor dem Reset Di 01:00","seit":"2026-11-19T05:10:00Z","max_worker":0}'
pruefe_v "Drossel: Stufe im neuen Verlaufspunkt" '.punkte[-1].drossel == 2'
print -r -- "0 -3.0 2026-11-19T07:40+01:00" > $T/n/drossel-stufe.txt; lauf
pruefe "Drossel: altes Format (ohne seit, Wirkung, Grund): seit = Messzeit, Texte null, Stufe 0 ohne Worker-Grenze" '.drossel == {"stufe":0,"text":null,"grund":null,"seit":"2026-11-19T06:40:00Z","max_worker":null}'
printf '3 40.0 2026-11-19T07:50+01:00 2026-11-19T06:10+01:00 offen\nkeine Drossel (Fail-open)\nWoche nicht lesbar\n' > $T/n/drossel-stufe.txt; rm -f $VH; lauf
pruefe "Drossel: zuletzt Fail-open (Marke offen) → Stufe 0, keine Worker-Grenze, Grund" '.drossel.stufe == 0 and .drossel.max_worker == null and .drossel.text == "keine Drossel (Fail-open)" and .drossel.grund == "Woche nicht lesbar"'
pruefe_v "Drossel Fail-open: Verlaufspunkt 0" '.punkte[-1].drossel == 0'
print -r -- "3 40.0 2026-11-19T05:00+01:00" > $T/n/drossel-stufe.txt; lauf
pruefe "Drossel: älter als 2 h → null" '.drossel == null'
print -r -- "Unsinn" > $T/n/drossel-stufe.txt; rm -f $VH; lauf
pruefe "Drossel: unlesbar → null, Rest bleibt" '.drossel == null and .kontingent.woche_prozent == 5'
pruefe_v "Drossel unlesbar: Verlaufspunkt drossel null" '.punkte[-1] | has("drossel") and .drossel == null'
rm -f $T/n/drossel-stufe.txt

# Commits auf main (Maintainer 19.11.2026: „die letzten 7 tags vs. die 7 tage davor“) aus quellen/commits.json
print '{"letzte_7t":513,"davor_7t":463,"letzte_48h":219,"davor_48h":102,"stand":'$((JETZT - 600))'}' > $T/d/quellen/commits.json; lauf
pruefe "Commits: vier Zahlen, ohne stand" '.commits == {"letzte_7t":513,"davor_7t":463,"letzte_48h":219,"davor_48h":102}'
lauf $((JETZT + 3601))
pruefe "Commits: älter als 1 Stunde → null" '.commits == null and has("commits")'
print '{"letzte_7t":"x","davor_7t":1,"letzte_48h":1,"davor_48h":1,"stand":'$JETZT'}' > $T/d/quellen/commits.json; lauf
pruefe "Commits: unbrauchbar → null" '.commits == null'
rm -f $T/d/quellen/commits.json; lauf
pruefe "Commits: fehlt → null" '.commits == null'

# Tagesroutine wartet (Maintainer 19.11.2026 „ja“): Skript läuft, aber nur sleep und die Kontingent-Messung (claude -p ok
# --model haiku), keine Runde → in agenten mit zustand wartet und Grund aus dem Protokoll, zählt nicht in verlauf.agenten
cat > $T/ps.txt <<'EOF'
  200     1    50:00 /bin/zsh /x/tagesroutine.sh /Users/x/halo-spaces
  210   200    00:18 sleep 120
  211   200    00:02 zsh /x/kontingent.sh
  212   211    00:02 claude -p ok --model haiku --output-format stream-json --verbose
  300     1 1-02:00:00 zsh /x/auslastung-schleife.zsh
  600     1 3-12:00:00 /Users/x/.local/bin/claude remote-control --spawn=same-dir --name neon-board --permission-mode auto
EOF
rm -f $T/n/auslastung-schleife.lock $T/n/auslastung/worker-*
print "2026-11-19 07:50:00 Drossel Stufe 3 (52 Fehlstunden): keine neuen Worker, Tagesroutine nichts Neues bis zur vollen Stunde – Woche 20 %, Reset Di 01:00 – nächster Versuch 08:00" >> $T/n/2026-11-19-tagesroutine.log
rm -f $VH; lauf
pruefe "wartet: Tagesroutine in agenten mit zustand wartet, Grund Drossel, ohne Eintrag und Modell" \
  '[.agenten[] | select(.name == "Tagesroutine")] == [{"name":"Tagesroutine","art":"lauf","seit":"2026-11-19T06:10:00Z","modell":null,"eintrag":null,"zustand":"wartet","grund":"Drossel Stufe 3, wartet bis zur vollen Stunde (08:00)","weiter_um":"2026-11-19T07:00:00Z"}]'
pruefe "wartet: Lauf aktiv ohne Runde, weiter_um volle Stunde" '.laeufe.tagesroutine.aktiv and (.laeufe.tagesroutine.runde == false) and .laeufe.tagesroutine.eintrag == null and .laeufe.tagesroutine.weiter_um == "2026-11-19T07:00:00Z"'
pruefe "wartet: Wächter und Sitzung laufen" '[.agenten[] | select(.art != "lauf") | .zustand] == ["läuft", "läuft"]'
pruefe_v "wartet: Verlauf zählt 0 arbeitende Agenten" '.punkte[-1].agenten == 0'
print "2026-11-19 07:55:00 Pause bis 2026-11-19T09:30+01:00 (pausen.txt)" >> $T/n/2026-11-19-tagesroutine.log; lauf
pruefe "wartet: Grund Pause" '[.agenten[] | select(.name == "Tagesroutine")][0] | .grund == "Pause bis 09:30 (pausen.txt)" and .weiter_um == "2026-11-19T08:30:00Z"'
print "2026-11-19 07:56:00 warte: 5-Stunden-Fenster 91 % ≥ 90 % – nichts Neues, Fensterende 09:00, nächster Versuch 08:30" >> $T/n/2026-11-19-tagesroutine.log; lauf
pruefe "wartet: Grund Kontingent kurz" '[.agenten[] | select(.name == "Tagesroutine")][0] | .grund == "5-Stunden-Fenster 91 % ≥ 90 %, wartet bis 08:30" and .weiter_um == "2026-11-19T07:30:00Z"'
# Protokoll mit kaputtem UTF-8 (am 19.11. auf neon: ganze Datei unlesbar, Schritt null) bleibt lesbar
printf '2026-11-19 07:57:00 kaputt \x9e\n2026-11-19 07:58:00 Plan abgearbeitet: warte bis 09:00, dann neu planen\n' >> $T/n/2026-11-19-tagesroutine.log; lauf
pruefe "wartet: Protokoll mit kaputtem UTF-8 lesbar, Grund Plan abgearbeitet" '[.agenten[] | select(.name == "Tagesroutine")][0].grund == "Plan abgearbeitet, wartet bis 09:00" and (.laeufe.tagesroutine.schritt | startswith("Plan abgearbeitet"))'
# weiter_um: Limit-Pause = Zeit der Zeile + 30 Min.; Uhrzeit vor der Zeile → Folgetag; ohne Zeitpunkt → null
print "2026-11-19 07:59:00 Limit – Pause 30 Minuten" >> $T/n/2026-11-19-tagesroutine.log; lauf
pruefe "weiter_um: Limit-Pause aus der Zeile" '[.agenten[] | select(.name == "Tagesroutine")][0].weiter_um == "2026-11-19T07:29:00Z"'
print "2026-11-19 07:59:30 Drossel Stufe 3 (9 Fehlstunden): nichts Neues – nächster Versuch 00:00" >> $T/n/2026-11-19-tagesroutine.log; lauf
pruefe "weiter_um: Uhrzeit vor der Zeile gilt am Folgetag" '[.agenten[] | select(.name == "Tagesroutine")][0].weiter_um == "2026-11-19T23:00:00Z"'
print "2026-11-19 07:59:40 warte: Nachtlauf läuft noch" >> $T/n/2026-11-19-tagesroutine.log; lauf
pruefe "weiter_um: kein Zeitpunkt bekannt → null" '([.agenten[] | select(.name == "Tagesroutine")][0] | .zustand == "wartet" and .weiter_um == null) and .laeufe.tagesroutine.weiter_um == null'
# dieselbe Tagesroutine mit Runde → arbeitet, zählt
print "  213   200    01:00 claude -p --model sonnet --session-id s9 --permission-mode auto Auftrag" >> $T/ps.txt
rm -f $VH; lauf
pruefe "Runde läuft wieder: Tagesroutine arbeitet" '([.agenten[] | select(.name == "Tagesroutine")][0] | .zustand == "arbeitet" and .grund == null and .modell == "sonnet" and .weiter_um == null) and .laeufe.tagesroutine.weiter_um == null'
pruefe_v "Runde läuft wieder: Verlauf zählt 1" '.punkte[-1].agenten == 1'
# Release-Schätzung (Maintainer 19.11.2026: „ja, bestell die bessere release-schätzung bei neon“): Mittag (12:00 Wien = 11:00Z),
# Volldampf. Dauern: main-Push 60/90/120 Min. (Median 90, der 0-Minuten-Lauf zählt nicht), Windows 30/30/40 (30), Prüfzweig 40/50/60 (50)
MITTAG=$((JETZT + 4 * 3600))
lauf_m() { HALO_LS_VOLLDAMPF=1 HALO_LS_SOLL="7.3 6.04 anker x y" lauf ${1:-$MITTAG} }
rl() { print -r -- "{\"databaseId\":$1,\"number\":$1,\"workflowName\":\"Test\",\"event\":\"$2\",\"headBranch\":\"$3\",\"headSha\":\"$4\",\"status\":\"$5\",\"conclusion\":\"$6\",\"createdAt\":\"$7\",\"updatedAt\":\"$8\",\"displayTitle\":\"t\",\"url\":\"u\"}" }
ci_main_daten() {
  print -r -- "[$(rl 50 push main m1 completed success 2026-11-18T08:00:00Z 2026-11-18T09:00:00Z),
$(rl 51 push main m2 completed success 2026-11-18T10:00:00Z 2026-11-18T11:30:00Z),
$(rl 52 push main m3 completed success 2026-11-18T12:00:00Z 2026-11-18T14:00:00Z),
$(rl 53 push main m4 completed success 2026-11-18T15:00:00Z 2026-11-18T15:00:20Z),
$(rl 54 workflow_dispatch main m1 completed success 2026-11-18T09:00:00Z 2026-11-18T09:30:00Z),
$(rl 55 workflow_dispatch main m2 completed success 2026-11-18T11:30:00Z 2026-11-18T12:00:00Z),
$(rl 56 workflow_dispatch main m3 completed success 2026-11-18T14:00:00Z 2026-11-18T14:40:00Z)$1]" > $T/d/quellen/ci-main.json
}
ci_pruef() {   # [weitere Läufe]
  print -r -- "[$(rl 60 push pruef/a p1 completed success 2026-11-18T08:00:00Z 2026-11-18T08:40:00Z),
$(rl 61 push pruef/b p2 completed success 2026-11-18T08:00:00Z 2026-11-18T08:50:00Z),
$(rl 62 push pruef/c p3 completed failure 2026-11-18T08:00:00Z 2026-11-18T08:55:00Z),
$(rl 63 push pruef/d p4 completed success 2026-11-18T08:00:00Z 2026-11-18T09:00:00Z)$1]" > $T/d/quellen/ci.json
}
rm -f $T/n/pausen.txt $T/n/zwischen-faellig.txt; ci_main_daten; ci_pruef
lauf_m
pruefe "Release: kein Kandidat unterwegs → zeit null, offen, ohne Kandidat" '.release_eta.zeit == null and .release_eta.sicherheit == "offen" and .release_eta.kandidat == null and .release_eta.haelt_auf == null and (.release_eta.grund | test("kein Kandidat unterwegs"))'
# laufender Prüfzweig-Lauf mit 3 Thunderbird-Commits: Start 10:30Z + 50 + 90 + 30 + 10 Min. = 13:30Z
ci_pruef ",$(rl 7 push pruef/x S7 in_progress '' 2026-11-19T10:30:00Z 2026-11-19T10:45:00Z),$(rl 8 push pruef/y S8 queued '' 2026-11-19T10:00:00Z 2026-11-19T10:00:00Z),$(rl 9 push pruef/probe-z S9 in_progress '' 2026-11-19T09:00:00Z 2026-11-19T09:00:00Z)"
printf 'S7 3 1 0\nS8 2 1 0\nS9 5 1 0\n' > $T/d/quellen/tb-zahlen.tsv
lauf_m
pruefe "Release: Kandidat mit 3 Thunderbird-Commits, gemessene Dauern (2 zu wenig, Probezweig nie)" '.release_eta == {"zeit":"2026-11-19T13:30:00Z","grund":(.release_eta.grund),"sicherheit":"gemessen","kandidat":"pruef/x #7","haelt_auf":null} and (.release_eta.grund | test("pruef/x .*3 Thunderbird-Commits.*ab 3"))'
pruefe "Feld ci zeigt weiter höchstens 15 Läufe" '(.ci | length) <= 15'
# nicht mischbar bzw. „nicht nach main“ zählen nicht
printf 'S7 3 0 0\nS8 2 1 0\n' > $T/d/quellen/tb-zahlen.tsv; lauf_m
pruefe "Release: nicht mischbarer Stand ist kein Kandidat" '.release_eta.kandidat == null'
printf 'S7 3 1 1\n' > $T/d/quellen/tb-zahlen.tsv; lauf_m
pruefe "Release: Stand mit „nicht nach main“ ist kein Kandidat" '.release_eta.kandidat == null'
# 5-Stunden-Fenster ab 85 % (Fenster läuft noch): schon 2 Commits genügen; S8 wartet seit 10:00Z → fertig 10:50, Push frühestens
# jetzt (11:00Z; Prüfzweig-Läufe belegen neon nicht) → 11:00 + 130 Min. = 13:10Z
cp $T/n/kontingent.json $T/kont.bak
print '{"stand": "2026-11-19T11:55:00+0100", "info": {"unifiedWindows": {"five_hour": {"utilization": 0.9, "resetsAt": 1795100000}, "seven_day": {"utilization": 0.05, "resetsAt": 1795478400}}}}' > $T/n/kontingent.json
printf 'S7 3 1 0\nS8 2 1 0\n' > $T/d/quellen/tb-zahlen.tsv; lauf_m
pruefe "Release: Fenster ab 85 % → ab 1 Commit, frühester Kandidat" '.release_eta.kandidat == "pruef/y #8" and .release_eta.zeit == "2026-11-19T13:10:00Z"'
mv $T/kont.bak $T/n/kontingent.json
# belegt: main-Lauf läuft seit 10:00Z (frei 11:30Z) → Kandidat x erst danach: 11:30 + 130 Min. = 13:40Z
ci_main_daten ",$(rl 57 push main m5 in_progress '' 2026-11-19T10:00:00Z 2026-11-19T10:30:00Z)"; lauf_m
pruefe "Release: laufende main-CI verschiebt den Kandidaten" '.release_eta.zeit == "2026-11-19T13:40:00Z" and .release_eta.kandidat == "pruef/x #7"'
# fälliger Stand mit Vorrang-Marke, neon belegt (Grund aus dem Wächter-Protokoll)
print -r -- "$((MITTAG - 60)) 123 S7 pruef/x 11:59" > $T/n/zwischen-faellig.txt
print -r -- "2026-11-19 11:59:00 belegt: CI-Lauf auf dem GitHub-Runner (fällig S7abcde pruef/x)" > $T/n/2026-11-19-zwischen-schleife.log
lauf_m
pruefe "Release: fällig und belegt → frei ab + Kette, Kandidat mit Lauf, hält auf" '.release_eta.zeit == "2026-11-19T13:40:00Z" and .release_eta.kandidat == "pruef/x #7" and .release_eta.haelt_auf == "belegt: CI-Lauf auf dem GitHub-Runner" and .release_eta.sicherheit == "gemessen"'
rm -f $T/n/zwischen-faellig.txt
# Hindernisse: Pause, rote CI auf main, Push-Sperre
print "zwischen-release 2026-11-19T13:00+01:00 Test" > $T/n/pausen.txt; lauf_m
pruefe "Release: Pause hält auf → zeit null" '.release_eta.zeit == null and .release_eta.haelt_auf == "Pause bis 13:00" and .release_eta.sicherheit == "offen"'
rm -f $T/n/pausen.txt
ci_main_daten; print '[{"headBranch":"main","status":"completed","conclusion":"failure","event":"push","workflowName":"Test"}]' > $T/d/quellen/ci-main.json; lauf_m
pruefe "Release: rote CI auf main hält auf" '.release_eta.zeit == null and .release_eta.haelt_auf == "CI auf main rot"'
ci_main_daten; lauf_m $JETZT
pruefe "Release: 08:00 im Volldampf → Push-Sperre" '.release_eta.zeit == null and .release_eta.haelt_auf == "Push-Sperre bis 09:00"'
# Faustwerte: keine main-Läufe → geschätzt; 10:30 + 50 + 50 + 30 + 10 = 12:50Z
print '[]' > $T/d/quellen/ci-main.json; printf 'S7 3 1 0\n' > $T/d/quellen/tb-zahlen.tsv; lauf_m
pruefe "Release: zu wenige main-/Windows-Läufe → Faustwert, geschätzt" '.release_eta.zeit == "2026-11-19T12:50:00Z" and .release_eta.sicherheit == "geschätzt"'
# Nachtlauf: ohne Volldampf; drei Nächte mit Release um 06:00 Wien (4,5 h ab 01:30), eine Veröffentlichung um 15:00 zählt nicht
print -r -- "v3.4.0 $(TZ=UTC date -j -f '%Y-%m-%d %H:%M:%S' '2026-11-18 14:00:00' +%s)
v3.3.0 $(TZ=UTC date -j -f '%Y-%m-%d %H:%M:%S' '2026-11-18 05:00:00' +%s)
v3.2.0 $(TZ=UTC date -j -f '%Y-%m-%d %H:%M:%S' '2026-11-17 05:00:00' +%s)
v3.1.0 $(TZ=UTC date -j -f '%Y-%m-%d %H:%M:%S' '2026-11-16 05:00:00' +%s)" > $T/d/quellen/releases.txt
HALO_LS_VOLLDAMPF=0 HALO_LS_SOLL="7.3 6.04 anker x y" lauf $MITTAG
pruefe "Release: Nachtlauf 01:30 + gemessene 4,5 Stunden" '.release_eta.zeit == "2026-11-20T05:00:00Z" and .release_eta.sicherheit == "gemessen" and (.release_eta.grund | test("4.5 Stunden"))'
print -r -- "v3.1.0 $(TZ=UTC date -j -f '%Y-%m-%d %H:%M:%S' '2026-11-16 05:00:00' +%s)" > $T/d/quellen/releases.txt
HALO_LS_VOLLDAMPF=0 HALO_LS_SOLL="7.3 6.04 anker x y" lauf $MITTAG
pruefe "Release: zu wenige Nächte → Faustwert 3 Stunden, geschätzt" '.release_eta.zeit == "2026-11-20T03:30:00Z" and .release_eta.sicherheit == "geschätzt"'
print "nachtlauf 2026-11-20T09:00+01:00 Test" > $T/n/pausen.txt; HALO_LS_VOLLDAMPF=0 lauf $MITTAG
pruefe "Release: Nachtlauf pausiert → zeit null, hält auf" '.release_eta.zeit == null and (.release_eta.haelt_auf | startswith("Pause Nachtlauf"))'
rm -f $T/n/pausen.txt
# Zuletzt erledigt (Maintainer 19.11.2026: „auch die letzten paar tasks welche erledigt sind“): frische Ordner, 9 Ereignisse
# in 24 Stunden → die 8 neuesten; zu alte fehlen, CI-Läufe zählen nicht
rm -rf $T/n $T/a $T/d; mkdir -p $T/n $T/a $T/d/quellen; : > $T/ps.txt
print '{"items":[{"id":"PVTI_v","status":"Done","title":"Mail: sichtbar erledigt","typ":"Bug","content":{"body":""}}]}' > $T/d/quellen/board.json
print '{"stand":0,"sichtbar":[{"id":"PVTI_v","createdAt":"2026-11-10T10:00:00Z","updatedAt":"2026-11-19T06:00:00Z","fieldValueByName":{"name":"Done","updatedAt":"2026-11-19T06:00:00Z"}}],
"archiviert":[{"id":"PVTI_w","createdAt":"2026-11-10T10:00:00Z","updatedAt":"2026-11-18T20:00:05Z","isArchived":true,"fieldValueByName":{"name":"Done","updatedAt":"2026-11-18T20:00:00Z"}},
 {"id":"PVTI_alt","createdAt":"2026-11-10T10:00:00Z","updatedAt":"2026-11-17T00:00:00Z","isArchived":true,"fieldValueByName":{"name":"Done","updatedAt":"2026-11-17T00:00:00Z"}}]}' > $T/d/quellen/board48.json
print '2026-11-18 | PVTI_w | Bug | Kalender: archiviert | abc1234' > $T/a/archiv.md
printf '2026-11-18 06:00:00 Runde beendet (Exitcode 0): zu alt\n2026-11-18 22:00:00 Kontingent Ende: Woche 20 %%\n' > $T/n/2026-11-18-tagesroutine.log
printf '2026-11-19 07:10:00 Runde mit opus, Sitzung x\n2026-11-19 07:30:00 Runde beendet (Exitcode 0): fertig\n' > $T/n/2026-11-19-tagesroutine.log
print 'erledigt abc1234' > $T/n/2026-11-19-tagesroutine-1.erg; touch -t 202611190729.50 $T/n/2026-11-19-tagesroutine-1.erg
printf 'PVTI_w\terledigt abc1234\n' > $T/n/2026-11-19-tagesroutine-erledigt.txt
printf '2026-11-19 05:00:00 Runde 1 beendet (Exitcode 1): x\n2026-11-19 06:00:00 Arbeit beendet: Ende laut Fertig-Datei: fertig\n2026-11-19 06:01:00 Ende\n' > $T/n/2026-11-19.log
printf '2026-11-19 06:30:00 Worker worker-2 beendet (Sitzung s, Zweig pruef/w2): erledigt e178d82 pruef/w2 gepusht PVTI_v\n2026-11-19 06:40:00 Worker worker-1 beendet (Sitzung s, Zweig pruef/w1): nichts_passend kein freier Eintrag\n' > $T/n/2026-11-19-auslastung.log
print -r -- "v3.40.0 $(TZ=UTC date -j -f '%Y-%m-%d %H:%M:%S' '2026-11-19 05:38:00' +%s)
v3.39.0 $(TZ=UTC date -j -f '%Y-%m-%d %H:%M:%S' '2026-11-17 05:38:00' +%s)" > $T/d/quellen/releases.txt
print '[{"databaseId":1,"number":1,"displayTitle":"t","headBranch":"main","event":"push","status":"completed","conclusion":"success","createdAt":"2026-11-19T06:00:00Z","updatedAt":"2026-11-19T06:50:00Z","url":"u"}]' > $T/d/quellen/ci.json
HALO_LS_VOLLDAMPF=0 HALO_LS_SOLL= lauf
pruefe "zuletzt: 8 neueste der letzten 24 h, neueste zuerst, alle Arten, ohne CI" '[.zuletzt[] | [.zeit, .art, .was, .ergebnis, .einzel]] == [
 ["2026-11-19T06:30:00Z","runde","Tagesroutine-Runde (opus): Kalender: archiviert","ok","abc1234"],
 ["2026-11-19T06:00:00Z","eintrag","Mail: sichtbar erledigt","ok",null],
 ["2026-11-19T05:40:00Z","worker","Worker 1: nichts Passendes",null,"pruef/w1"],
 ["2026-11-19T05:38:00Z","release","Release 3.40.0","ok","v3.40.0"],
 ["2026-11-19T05:30:00Z","worker","Worker 2: Mail: sichtbar erledigt","ok","e178d82 pruef/w2"],
 ["2026-11-19T05:01:00Z","lauf","Nachtlauf beendet","ok","Ende laut Fertig-Datei: fertig"],
 ["2026-11-19T04:00:00Z","runde","Nachtlauf-Runde 1","fehler",null],
 ["2026-11-18T21:00:00Z","lauf","Tagesroutine beendet","ok",null]]'
# Titel bis 200 Zeichen ungekürzt (Maintainer 19.11.2026: „wenn weniger abstand wäre müsste man den text nicht abkürzen“)
L150="Mail: $(printf 'a%.0s' {1..144})" L250="Mail: $(printf 'b%.0s' {1..244})"
jq --arg t "$L150" --arg u "$L250" '.items = [.items[0] + {title: $t}, {"id":"PVTI_l","status":"In Progress","title":$u,"typ":"Bug","content":{"body":""}}]' $T/d/quellen/board.json > $T/b.json && mv $T/b.json $T/d/quellen/board.json
jq --arg u "$L250" '.[0].displayTitle = ($u + "\nzweite Zeile")' $T/d/quellen/ci.json > $T/c.json && mv $T/c.json $T/d/quellen/ci.json
print '[{"databaseId":2,"number":2,"displayTitle":"Kurz von GitHub …","headSha":"abc9","headBranch":"main","event":"push","status":"completed","conclusion":"success","createdAt":"2026-11-19T06:00:00Z","updatedAt":"2026-11-19T06:50:00Z","url":"u"}]' > $T/d/quellen/ci2.json
jq -s '.[0] + .[1]' $T/d/quellen/ci.json $T/d/quellen/ci2.json > $T/c.json && mv $T/c.json $T/d/quellen/ci.json; rm $T/d/quellen/ci2.json
printf 'abc9\tTests: der ganze Betreff aus dem eigenen Klon, länger als die Kürzung von GitHub bei etwa siebzig Zeichen\n' > $T/d/quellen/betreffe.tsv
HALO_LS_VOLLDAMPF=0 HALO_LS_SOLL= lauf
pruefe "Titel: 150 Zeichen ungekürzt (zuletzt, Board in Arbeit), 250 auf 200 mit …, CI nur erste Zeile" \
  '([.zuletzt[] | select(.art == "eintrag")][0].was | length) == 150 and ([.board.in_arbeit[] | select(.titel | startswith("Mail: b"))][0].titel | length == 200 and endswith("…")) and (.ci[0].titel | length == 200 and endswith("…") and (contains("zweite") | not)) and (.ci[1].titel == "Tests: der ganze Betreff aus dem eigenen Klon, länger als die Kürzung von GitHub bei etwa siebzig Zeichen")'
# ohne Board-Zwischenspeicher und Protokolle: nur Releases
rm -f $T/d/quellen/board48.json $T/n/*.log; lauf
pruefe "zuletzt: fehlende Quellen → nur diese Arten fehlen" '[.zuletzt[] | .art] == ["release"]'
(( FEHLER )) && { print -r -- "--- stderr:"; cat $T/fehler.txt; }
exit $FEHLER
