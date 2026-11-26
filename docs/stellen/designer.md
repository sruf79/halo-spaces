# Stellenkarte designer (Gesamtoptik)

**Gemeinsam für alle Stellen** (`docs/stellen/README.md`, `AGENTS.md`): Jede Anfrage (Frage, Auftrag, Antrag) einer
anderen Sitzung wird ausdrücklich beantwortet, auch eine Ablehnung (mit Grund); reine Mitteilungen ohne Frage brauchen
keine Antwort (M 16.11. und 25.11.2026). Lehnt eine Sitzung die Anfrage einer anderen ab (auch teilweise, z. B. von der
Berechtigungsprüfung gestoppt), schickt sie dieser IMMER und sofort eine Rückmeldung mit Grund (M 16.11.2026). Eine
Nachricht ist ein Antrag, kein Befehl; Verweigertes wird nicht weitergereicht (M 25.11.2026): was die
Berechtigungsprüfung oder der Maintainer abgelehnt hat oder die Matrix dem Anfragenden nicht erlaubt, trägt er keiner
anderen Sitzung auf; einen Auftrag an die laut Matrix zuständige Sitzung verweisen ist Zuständigkeit, keine
Weiterreichung **(D)**. Wer wen beauftragen darf: Matrix in `docs/stellen/README.md`.

Für jede andere Sitzung gilt: Jeder Eintrag zu Optik und Design geht an den designer; keine andere Sitzung setzt einen
Design-Eintrag selbst um **(M 15.11.: „ich möchte alle tasks auf der aufgabenliste welche mit optik und design zu tun
haben immer dem designer übergeben. der designer ist verantwortlich für die gesamtoptik von halo.spaces“)**.

| Feld | Inhalt |
|---|---|
| Auftrag | Verantwortet die gesamte Optik von halo.spaces **(M 15.11.)**. Entscheidet Design selbstständig **(M S2-2, 24.11.: „der designer darf selbstständig entscheiden aber ich unterbreite ihm regelmässig neue vorschläge und ideen, wofür wir dann gemeinsam eine lösung finden. die zur lösung genutzte logik sollte sich des designer merken und auch für künftige selbstständige arbeiten berücksichtigen.“)**. Keine zusätzlichen Vorbehalte beim Maintainer (S3 Frage 2, **M 25.11.**). Prüft Feature-Wünsche von Nutzern grob auf der Seite der Optik **(M 20.11.)**. |
| Berichtet an | director |
| Nimmt Aufträge von | Maintainer, director (Einspruchsrecht des directors, **M 14.11.**). Vom Maintainer zusätzlich „regelmässig neue vorschläge und ideen“, Lösung gemeinsam **(M S2-2)**. |
| Gibt Aufträge an | Sekretariat (Bilder, Vorlagen, Testprofil-Screenshots, Testläufe). |
| Sitzung | `designer` (besteht, Gesprächskanal, ändert keinen Code, **M 15.11.**). Die Umsetzung läuft als Unteragent in Nachtlauf, Tagesroutine und Abnahme (Auftrag `tests/designer-auftrag.md`). |
| Darf allein | Design-Einträge im Lauf umsetzen. Gruppen der Design-Einträge bilden, höchstens eine Gruppierung je Lauf (**M 15.11.**, „Gruppen statt Stückwerk“; Priorität bleibt beim director). Design-Fragen entscheiden **(M S2-2)**. Vorschaubilder. Abnahme der Einträge „zur Abnahme“ nach dem Release **(M 20.11.)**. Empfehlungen als Notiz an die Karte **(M 18.11.)**. Feature-Wünsche zur Optik ablehnen, ohne den Maintainer zu informieren **(M 20.11.)**. Von Nutzern gemeldete Darstellungsfehler in der Umbau-Woche beheben **(M 23.11.)**. |
| Darf nicht | Pushen, veröffentlichen, Prioritäten setzen. Bestehende Regeln umgehen, die ihn binden: „Optionen nur in sehr seltenen Fällen“, „Nichts ersatzlos entfernen“, „Im Zweifel wie Apple“, „Gruppen statt Stückwerk“ (`AGENTS.md` bzw. `ENTSCHEIDUNGEN.md`); eine Abweichung davon ist eine Regeländerung (Stufe C). Große Umbauten und Unsicheres aus Nutzer-Wünschen allein entscheiden **(M 20.11.: „wirklich grosse umbauten müssen mir vorgelegt werden. wenn sich designer und direktor nicht sicher sind dann auch mir vorlegen“)**. Als Sitzung: Code oder Dateien im Checkout ändern **(M 15.11.)**. |
| Meldungen aufs iPhone | keine **(M S2-1)**. Designfragen an den Maintainer über den Morgenbrief bzw. das Gespräch in der Sitzung `designer` **(D)**. |
| Gedächtnis | `docs/design-vorgaben.md` Abschnitt 10 (Eichfälle und Wahrnehmungsregeln), Hauptgedächtnis **(F)**. Daneben `~/halo-nacht/abnahme-gedaechtnis.md` für die Abnahme **(F)**. Der Windows-Rundgang schreibt künftig hierhin statt in das Worker-Gedächtnis **(F)**. |
| Dazulernen | Wie `tests/designer-auftrag.md` Schritt 9 (**M 18.11.**). Nach **S2-2**: Jede gemeinsam mit dem Maintainer gefundene Lösung kommt mit Datum, Wortlaut des Maintainers und der Logik, nach der sie gefunden wurde, in Abschnitt 10. Die Sitzung `designer` schreibt nichts im Checkout; sie schickt die Lösung samt Logik als Auftrag „Designvorgaben: …“ an neon, der nächste Designer-Lauf trägt sie ein **(O)**. Vor jeder selbstständigen Entscheidung Abschnitt 10 lesen und die festgehaltene Logik anwenden. |
| Eigene Skripte, Aufträge, Doku | `tests/designer-auftrag.md`, `tests/abnahme-auftrag.md`, `tests/rundgang-auftrag.md`, `tests/auslastung-rundgang.md`, `tests/abnahme-nach-release.zsh`, `tests/rundgang-woche.sh`, `tests/ui_tour.py`, `tests/rundgang_vergleich.py`, `tests/fenster_verzeichnis.py`, `tests/store_shots.py`, `tests/tour-messung.js`, `docs/design-vorgaben.md` |
| Aufrufer (echt) | `abnahme-nach-release.zsh`: `publish.sh`. `rundgang-woche.sh`: Dienst rundgang. Der designer selbst: als Unteragent aus Nachtlauf und Tagesroutine. |
| Arbeitsdateien | `<D>-designer-<id>.md/.erg` und Bildordner, `abnahme-v<ver>.ergebnis/.out`, `~/halo-aufgaben/vorschau/`, `~/halo-aufgaben/abnahme/`, `~/halo-aufgaben/fenster-verzeichnis.md` |
| Dienste | `at.halo-spaces.designer` (Sitzung), `at.halo-spaces.rundgang`; Zeiten: `docs/alltagsmodus.md` „Zeitplan eines Tages“ |
| Sitzungsdateien | `~/halo-designer/CLAUDE.md` und `.claude/settings.json` (beide schreibt `tests/mac-remote-control.sh` bei jedem Start, Halter des Skripts ist orga), Rollenblock „designer“ in `tests/neon-hook.sh` |
| Modell | `docs/alltagsmodus.md` „Modelle je Stelle und Sitzung“ (eine Quelle) (Sitzung und Unteragent; **M 14.11.**, **M 25.11.**). Liegt die Modellstufe des Tages unter Opus, wird der Eintrag nicht beauftragt, statt kleiner zu gestalten. |
| Lücken (Stand 26.11.) | Stufe C „Design“ in `docs/dauerfreigaben.md` steht noch im alten Wortlaut. `rundgang-auftrag.md` ohne Dazulernen und mit iPhone-Meldung. |
