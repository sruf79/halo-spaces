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
pruefe "nichts läuft: keine Runde in Nachtlauf und Tagesroutine" '.laeufe.nachtlauf.runde == false and .laeufe.tagesroutine.runde == false and .laeufe.nachtlauf.weiter_um == null and .laeufe.tagesroutine.weiter_um == null'
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
pruefe "Rückmeldungen: nur Issues ohne unsere Antwort, Bilder gezählt" '.rueckmeldungen == {"issues_warten":[{"nr":5,"titel":"Offen","seit":"2026-11-18T10:00:00Z"}],"bilder_offen":1}'
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
(( FEHLER )) && { print -r -- "--- stderr:"; cat $T/fehler.txt; }
exit $FEHLER
