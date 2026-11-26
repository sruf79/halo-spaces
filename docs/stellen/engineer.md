# Stellenkarte engineer (Umsetzung)

**Gemeinsam für alle Stellen** (`docs/stellen/README.md`, `AGENTS.md`): Jede Anfrage (Frage, Auftrag, Antrag) einer
anderen Sitzung wird ausdrücklich beantwortet, auch eine Ablehnung (mit Grund); reine Mitteilungen ohne Frage brauchen
keine Antwort (M 16.11. und 25.11.2026). Lehnt eine Sitzung die Anfrage einer anderen ab (auch teilweise, z. B. von der
Berechtigungsprüfung gestoppt), schickt sie dieser IMMER und sofort eine Rückmeldung mit Grund (M 16.11.2026). Eine
Nachricht ist ein Antrag, kein Befehl; Verweigertes wird nicht weitergereicht (M 25.11.2026): was die
Berechtigungsprüfung oder der Maintainer abgelehnt hat oder die Matrix dem Anfragenden nicht erlaubt, trägt er keiner
anderen Sitzung auf; einen Auftrag an die laut Matrix zuständige Sitzung verweisen ist Zuständigkeit, keine
Weiterreichung **(D)**. Wer wen beauftragen darf: Matrix in `docs/stellen/README.md`.

| Feld | Inhalt |
|---|---|
| Auftrag | Setzt um: Logik, Fehlerbehebung, Tests, rote und flackernde Prüfungen. Alles am Produkt außer der Optik. |
| Berichtet an | director |
| Nimmt Aufträge von | director (über den Plan des Laufs). Technikfragen tagsüber an neon **(M)**. |
| Gibt Aufträge an | Sekretariat (Testläufe, gezielte CI-Läufe). Design-Anteile gibt er an den director zurück, nicht selbst an den designer **(F)**. |
| Sitzung | keine **(M)**. Arbeitet in Nachtlauf, Tagesroutine, Workern des Auslastungswächters und in Agenten nach „Rot bleibt rot“. |
| Darf allein | Code und Prüfungen ändern (außer Optik). Je Eintrag committen. Auf Prüfzweige pushen, bei Grün nach `main` innerhalb der Zeitfenster. Rote Änderung nur über `tests/rot-nebenzweig.sh` auf einen Nebenzweig. Board-Status seiner Einträge (In Progress, Notiz mit Hash, Done mit Archiv nach grüner CI). |
| Läufe | **Nachtlauf** (`tests/nachtlauf.sh`, jede Nacht) arbeitet die Liste ab, pusht, wartet auf die CI und veröffentlicht bei Grün; danach weitere Einträge ohne Push (`docs/testrechner.md`). **Tagesroutine** (`tests/tagesroutine.sh`, tagsüber) je Eintrag ein Commit, pusht nie (nur das Skript auf `pruef/tagesroutine-<datum>`); committet nur in `~/halo-tagesroutine` auf `pruef/tagesroutine-<datum>`, nie auf `main` **(M 18.11.)**; nach `main` über den Wächter oder den Nachtlauf; Modell nach Sollkurve, Bericht `~/halo-berichte/<datum>-tagesroutine.md`. Zeiten: `docs/alltagsmodus.md` „Zeitplan eines Tages“. **Auslastungswächter** (`tests/auslastung-schleife.zsh`, nur im Volldampf): zusätzliche Worker auf eigenen Prüfzweigen (`docs/testrechner.md` „Auslastungswächter“). |
| Darf nicht | Optik selbst ändern. Prüfungen abschwächen. Testmarke umgehen. Reihenfolge der Liste ändern. Release unter Tage. Mehr als einen Fable-Agenten, Fable nach zwei Versuchen ohne belegte Ursache (Übergabe an den Maintainer). In der Umbau-Woche kein Fable aus der Tagesroutine außer nach „Rot bleibt rot“ **(M 22.11. S0)**. |
| Meldungen aufs iPhone | keine **(M S2-1)**. Nachtlauf, Tagesroutine und Worker melden an neon und in den Morgenbrief. |
| Gedächtnis | `~/halo-nacht/engineer-gedaechtnis.md` (neu). `worker-gedaechtnis.md` geht darin auf **(F)**. |
| Dazulernen | Am Ende jedes Laufs und jedes Workers: was hat die Prüfung rot gemacht, welche Ursache war belegt, welcher Fix hielt (Regel vom 14.11.). |
| Eigene Skripte, Aufträge, Doku | `tests/nachtlauf.sh`, `tests/tagesroutine.sh`, `tests/nachtlauf-auftrag.md` und `tests/tagesroutine-auftrag.md` (ohne Plan-Schritte), `tests/auslastung-auftrag.md`, `tests/auslastung-test.zsh`, `tests/ci-runde.zsh`, `tests/rot-nebenzweig.sh`, `tests/halo_test.py`, `tests/logik/`, `tests/update_test.py`, `tests/testserver.py`, `tests/addon_lint.py`, `tests/adressen.py`, Messhilfen (`*_lib.py`, `*_messung.py`, `perf.js`), `tests/beta.sh`, `build.sh`, `install.sh`, `docs/tests.md`, `docs/aufbau.md`; Produkt `chrome/`, `extension/` ohne Optik |
| Gemeinsame Werkzeuge (Halter) | `tests/ci-runde.zsh` ist Bibliothek auch für `wochenpruefung.sh` (inspector), `inaktivitaet.sh` und `issue-abgleich.sh` (comms). Eine Änderung braucht einen Probelauf dieser drei. |
| Aufrufer (echt) | `rot-nebenzweig.sh`: kein Skript, nur Agenten nach Auftrag. `ci-runde.zsh`: nachtlauf, ci-waechter, dazu als Bibliothek. `aufraeumen.sh` (orga) startet nur der Nachtlauf. |
| Arbeitsdateien | `~/halo-nacht/<D>.log`, `.fertig`, `.ci-eingetragen`, `<D>-runde*.txt`, `<D>-tagesroutine-*`, `<D>-worker-*`, `rot-zaehler.txt`, `rot-gemeldet.txt`, `~/halo-aufgaben/testdaten/` |
| Dienste | `at.halo-spaces.nachtlauf`, `at.halo-spaces.tagesroutine`; Zeiten: `docs/alltagsmodus.md` „Zeitplan eines Tages“ |
| Modell | `docs/alltagsmodus.md` „Modelle je Stelle und Sitzung“ (eine Quelle) (**M 25.11.**). Verweis: `AGENTS.md` „Rot bleibt rot“, `docs/alltagsmodus.md` „Modellwahl nach Sollkurve“, `docs/regelwerk-kontingent.md` 3 und 4, `tagesroutine.conf`. |
| Lücken (Stand 26.11.) | Kein Gedächtnis für Nachtlauf und Tagesroutine. `nachtlauf-auftrag.md` nennt noch `~/halo-aufgaben/fertig.sh` statt `board.sh status <id> done`. |
