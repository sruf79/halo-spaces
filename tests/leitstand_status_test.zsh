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
lauf() {   # [<Epochensekunden>]
  HALO_LS_DIR=$T/d HALO_NACHT_DIR=$T/n HALO_AUFGABEN_DIR=$T/a HALO_LS_JETZT=${1:-$JETZT} HALO_LS_OHNE_NETZ=1 \
    HALO_LS_PS=$T/ps.txt zsh $HIER/leitstand-status.zsh --trocken $T/repo > $T/aus.json 2>$T/fehler.txt
}

# --- Fall 1: keine Quelle vorhanden → Felder null, kein Abbruch ---
mkdir -p $T/n $T/a; : > $T/ps.txt
HALO_LS_VOLLDAMPF= HALO_LS_SOLL= lauf
print "Exitcode $?" >> $T/fehler.txt
pruefe "ohne Quellen: gültiges JSON mit Stand" '.stand == "2026-11-19T07:00:00Z"'
pruefe "ohne Quellen: Kontingent, Board, CI, Issues, Bilder null" \
  '.kontingent == null and .board == null and .ci == null and .ci_main == null and .rueckmeldungen.issues_warten == null and .rueckmeldungen.bilder_offen == null'
pruefe "ohne Quellen: keine Agenten, Läufe inaktiv ohne Schritt" '.agenten == [] and .laeufe.nachtlauf.aktiv == false and .laeufe.nachtlauf.schritt == null'
pruefe "ohne Quellen: Volldampf unbekannt (null), Pausen leer, Rot-Zähler 0" '.schalter.volldampf == null and .schalter.pausen == [] and .schalter.rot_zaehler == 0'
pruefe "ohne Quellen: Release-Schätzung nächster Nachtlauf" '.release_eta.zeit == "2026-11-20T03:30:00Z"'

# --- Fall 2: alle Quellen ---
rm -rf $T/d; mkdir -p $T/d/quellen $T/n/auslastung
cat > $T/ps.txt <<'EOF'
  100     1 05:30:00 /bin/zsh /x/nachtlauf.sh /Users/x/halo-spaces
  101   100 05:29:50 /bin/zsh /x/nachtlauf.sh /Users/x/halo-spaces
  102   101    10:00 claude -p --model opus --resume abc --permission-mode auto Weiter
  200     1    50:00 /bin/zsh /x/tagesroutine.sh /Users/x/halo-spaces
  201   200    05:00 claude -p --model sonnet --session-id s1 --permission-mode auto Kopf JETZT: genau einen Eintrag bearbeiten (Schritt 3 des Auftrags): PVTI_a (bug) „Mail: Knopf fehlt“. Modell dieser Runde: sonnet.
  300     1 1-02:00:00 zsh /x/auslastung-schleife.zsh
  301   300    00:05 zsh /x/auslastung-schleife.zsh
  302     1    00:05 zsh /x/auslastung-schleife.zsh
  400     1    20:00 claude -p --model opus --session-id w1 --permission-mode auto Worker
  500     1    15:00 /Users/x/actions-runner/bin/Runner.Worker spawnclient 1 2
  600     1 3-12:00:00 /Users/x/.local/bin/claude remote-control --spawn=same-dir --name neon-board --permission-mode auto
EOF
print "400 w1 opus $((JETZT - 1200)) /wt pruef/w /e normal" > $T/n/auslastung/worker-1
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
HALO_LS_VOLLDAMPF=1 HALO_LS_SOLL="7.3 6.04 anker x y" lauf
pruefe "Agenten: Nachtlauf mit Modell, Unterschale nicht doppelt" '[.agenten[] | select(.name == "Nachtlauf")] | length == 1 and .[0].modell == "opus" and .[0].seit == "2026-11-19T01:30:00Z"'
pruefe "Agenten: Auslastungswächter einmal je Schleife (Unterschalen zählen nicht)" '[.agenten[] | select(.name == "Wächter Auslastung")] | length == 2'
pruefe "Agenten: lebender Worker mit Modell, toter fehlt" '[.agenten[] | select(.art == "worker")] | length == 1 and .[0].name == "Worker 1" and .[0].modell == "opus"'
pruefe "Agenten: CI-Runner und Sitzung neon-board" '([.agenten[] | select(.art == "ci")] | length == 1) and ([.agenten[] | select(.art == "sitzung")][0].name == "neon-board")'
pruefe "Läufe: Nachtlauf-Schritt ohne Volldampf-Zeile" '.laeufe.nachtlauf.aktiv and (.laeufe.nachtlauf.schritt | startswith("Runde 2 beendet"))'
pruefe "Läufe: Eintrag der Tagesroutine aus der Runde" '.laeufe.tagesroutine.eintrag == "Mail: Knopf fehlt" and .laeufe.tagesroutine.seit == "2026-11-19T06:10:00Z"'
pruefe "Kontingent: Werte, Messzeit UTC, Soll" '.kontingent == {"gemessen":"2026-11-19T06:45:00Z","woche_prozent":5,"fuenf_stunden_prozent":18,"soll_prozent":6.0,"reset_woche":"2026-11-24T00:00:00Z","reset_5h":"2026-11-19T09:00:00Z"}'
pruefe "Schalter: Volldampf, Push-Sperre um 08:00, Rot-Zähler 14 Tage, nur aktive Pause" \
  '.schalter.volldampf and .schalter.push_sperre and .schalter.rot_zaehler == 1 and (.schalter.pausen | length == 1 and .[0].bis == "2026-11-19T08:30:00Z")'
pruefe "Board: in Arbeit mit Bereich und letzter Notizzeile" '.board.in_arbeit == [{"titel":"Mail: Knopf fehlt","typ":"Bug","bereich":"Mail","notiz":"committet, wartet auf Push/CI (abc1234)"}]'
pruefe "Board: nächste laut Plan, nur Todo, ohne Archiviertes" '[.board.naechste[] | .titel] == ["[GitHub #9] Adressbuch: Liste leer","Kalender: Woche zeigt Feiertage"] and .board.naechste[1].rang == 2'
pruefe "Board: Zahlen und Bereiche" '.board.zahlen.bugs_offen == 3 and .board.zahlen.features_offen == 2 and .board.zahlen.erledigt_woche == 1 and ([.board.zahlen.je_bereich[] | select(.bereich == "Sonstiges")][0].bugs == 1)'
pruefe "Rückmeldungen: nur Issues ohne unsere Antwort, Bilder gezählt" '.rueckmeldungen == {"issues_warten":[{"nr":5,"titel":"Offen","seit":"2026-11-18T10:00:00Z"}],"bilder_offen":1}'
pruefe "CI: Läufe übernommen, main läuft" '(.ci | length == 2) and .ci[0].ergebnis == "failure" and .ci[1].ergebnis == null and .ci_main == "läuft"'
pruefe "Release: Nachtlauf läuft, Tag vor dem Start fehlt → offen" '.release_eta.zeit == null and (.release_eta.grund | test("Nachtlauf läuft.*4 Commits"))'
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

(( FEHLER )) && { print "--- stderr:"; cat $T/fehler.txt; }
exit $FEHLER
