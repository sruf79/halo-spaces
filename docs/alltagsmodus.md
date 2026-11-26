# Alltagsmodus: Tagesroutine, Sparmodus, Nachtlauf

Überblick über alle Zustände, Bremsen und die Aufgabenzuteilung: `docs/regelwerk-kontingent.md`.

Gilt immer, wenn **kein** Volldampf aktiv ist (`volldampf_aktiv` ≠ 0, also keine Zeile, abgelaufen, von Hand
`aus` oder Pausenmarke `volldampf-beendet.txt` bis zum freien Reset). Was Volldampf daran ändert: `docs/volldampf-regelwerk.md`.
Nach dem Ende von Volldampf am automatischen Wochenreset (Di 01:00) gilt ab dem Nachtlauf 01:30 wieder dieser Modus (Maintainer
18.11.2026: „genau und nach dem nächsten automatischen weekly limit reset kommenden dienstag um 01:30 soll wieder der reguläre
modus laufen, wo wir aber dennoch automatisch den verbrauch und die intensität permanent an unser token kontingent knüpfen und
adjustieren“): Sollkurve, Sparmodus und Modellwahl steuern Verbrauch und Intensität fortlaufend nach dem Kontingent; die
Sollkurve ist immer die 168-h-Kurve ab Di 00:00 UTC, ein freier Reset ändert sie nicht (Maintainer 23.11.2026).
Soll = Stand vor Volldampf, belegt durch Skript, `~/.config/halo-spaces/tagesroutine.conf` (Sicherungen in
`~/halo-sicherung/`), git log und `ENTSCHEIDUNGEN.md`. Zeilenangaben beziehen sich auf den Stand dieses Commits.
Zeiten in Wiener Zeit.

## Zeitplan eines Tages

Eine Quelle für die Zeiten der Stellen und Dienste; die Stellenkarten (`docs/stellen/`) verweisen hierher. Übernommen aus
der Plan-Tabelle der Umbau-Woche (`~/halo-berichte/2026-11-25-plan-tabelle.md` Abschnitt 1, Satz P2 des Maintainers
25.11.2026, Schritt K7); keine Startzeit wurde dabei geändert.

| Zeit | Wer | Was | Fundstelle |
|---|---|---|---|
| 00:00 | alle von Hand | kein Push mit Codeänderung mehr | AGENTS.md „Den Nachtlauf nicht behindern“ |
| 00:45–01:14 | Sekretariat neon (CI-Wächter, 15-Min.-Takt → `vm-frisch.sh --taeglich`) | Windows-VM kalt starten, Kurztest, herunterfahren (bis zum ersten Erfolg je Tag); vorher verwaiste Test-Thunderbird beenden (unten) | Maintainer 18.11.2026, 19.11.2026 („6. ja“); `tests/ci-waechter.sh`, `tests/vm-frisch.sh` |
| 01:30 | Nachtlauf (engineer, Plan-Schritt director) | Start (LaunchAgent), zuerst verwaiste Test-Thunderbird beenden, dann `nachtlauf_warten` (CI bis 03:30, Testlauf 60 Min.), Liste laden, Director plant | AGENTS.md „Nachtlauf“; `tests/nachtlauf.sh`, `tests/vorpruefung.zsh` |
| bis 04:30 | Nachtlauf | neue Einträge beginnen | `docs/testrechner.md` „Director im Nachtlauf“ |
| danach | Nachtlauf | Push, CI warten, bei Grün Release | `tests/nachtlauf-auftrag.md`, `tests/ci-runde.zsh` |
| ab 06:00 | Nachtlauf | kein neuer Designer-Unteragent mehr; vor der Fertig-Datei auf alle laufenden Unteragenten warten | `tests/nachtlauf-auftrag.md` Schritte 2a und 7 (Umbau P2 K5) |
| bis 06:30 | Nachtlauf | Schritt 5: weitere Einträge ohne Push (Fortsetzungen) | `tests/vorpruefung.zsh:59`; ENTSCHEIDUNGEN.md:36 (8.11.2026) |
| 08:00 | Nachtlauf | keine Fortsetzung mehr | `tests/nachtlauf.sh:56` |
| 08:30 | orga (Morgenbrief) | ein Bericht, eine Meldung aufs iPhone; Zeilen „verbraucht/Budget“ (Nacht, Tag, Rest) und „fertig, nicht in main: n Zweige“ | `tests/morgenbrief.sh`, Budgets in `tests/budget.conf` (Umbau P2 K4) |
| 09:00 | Nachtlauf | claude hart beendet; Push-Sperre endet | `tests/nachtlauf.sh:58`; AGENTS.md „Push-Sperre“ |
| 08:45 / 09:00 | Tagesroutine (engineer, Plan-Runde director) | LaunchAgent 08:45, wartet ohne Claude bis `START` 09:00 (Mo–So) | `tagesroutine.conf` `START`, `START_WOCHENENDE`; ENTSCHEIDUNGEN.md:505 (13.11.2026 „Start am Wochenende um 09:00“) |
| 09:00–20:30 | Tagesroutine | je Runde verwaiste Test-Thunderbird beenden, dann `belegt_tag` (bis 60 Min.; in jeder 5-Min.-Warterunde mit Thunderbird mit Marionette bzw. belegtem Port als Grund erneut aufräumen); Ungespeichertes in `~/halo-spaces` hält nicht auf | `tests/tagesroutine.sh` (Umbau P2 K2, K3) |
| 09:00, 14:00, 19:00 | comms (geplante Aufgabe `halo-github-kommunikation`) | GitHub-Antworten | `docs/testrechner.md`, `docs/github-komm.md` |
| 09:15, 14:15, 19:15 | comms (`github-komm-waechter`) | Wächter, Zustellung | `tests/github-komm-waechter.sh` |
| 20:30 | Tagesroutine | letzter Beginn eines neuen Eintrags | `tagesroutine.conf` `LETZTER_BEGINN`; `tests/tagesroutine.sh:78` |
| 22:00 | Tagesroutine | Ende, Wache beendet claude | `tagesroutine.conf` `ENDE`; `tests/tagesroutine.sh:110–119` |
| 01:30–09:00 | alle außer Nachtlauf, Wochen-, Doku-Prüfung | Push-Sperre | AGENTS.md „Push-Sperre“ |
| alle 5 Min. | orga (`leitstand`) | `status.json`, Kontingent höchstens alle 15 Min. | `tests/leitstand-status.zsh` |
| alle 10 Min. | orga (`volldampf-waechter`) | im Alltag ohne Wirkung | `docs/volldampf-regelwerk.md` |
| alle 15 Min. | Sekretariat neon (`ci-waechter`), neon-board (`bilder-eingang`) | rote CI eintragen, VM 00:45; Bilder einsortieren | `tests/ci-waechter.sh`, `tests/bilder-eingang.zsh` |

### Abweichungen je Wochentag

| Tag | Zeit | Wer | Was | Fundstelle |
|---|---|---|---|---|
| Di | 01:00 | – | automatischer Wochenreset, Sollkurve beginnt neu | Maintainer 19.11.2026, 23.11.2026 (ENTSCHEIDUNGEN.md) |
| Sa | 08:00 | inspector (`dokupruefung`, `wochenpruefung.sh --doku`) | Doku-Prüfung; vorher verwaiste Test-Thunderbird beenden, wartet auf den Nachtlauf bis 09:15, CI bis 10:00 | `tests/wochenpruefung.sh` |
| Sa | 22:15 | designer (`rundgang`) | Design-Rundgang; Start spätestens 23:30, Ende im Skript spätestens So 01:15; vorher und in jeder Warterunde mit Thunderbird als Grund verwaiste Test-Thunderbird beenden. Sammelfrage S3 Punkt 6 (25.11.2026): Rundgang endet spätestens 00:30, der Kaltstart 00:45 bleibt; im Skript noch nicht umgesetzt (Plan Z6) | `tests/rundgang-woche.sh` |
| So | 08:00 | inspector (`wochenpruefung`) | Wochenprüfung; vorher verwaiste Test-Thunderbird beenden, wartet wie die Doku-Prüfung | `tests/wochenpruefung.sh` |
| Sa, So | 09:00 | Tagesroutine | wartet, solange Doku- bzw. Wochenprüfung läuft (`belegt_tag`) | Maintainer 19.11.2026 („7. lieber am morgen machen. ja die tagesroutine läuft wochenende gleich wie werktags“) |

### Verwaiste Test-Thunderbird

`verwaiste_tb_beenden` (`tests/lauf-hilfen.zsh`; Maintainer 25.11.2026, ENTSCHEIDUNGEN.md) beendet ohne Rückfrage nur
Thunderbird mit Profil `…/halo-test-…` und `-marionette`, mit Elternprozess 1 und älter als 3 Stunden, und löscht
unbenutzte `halo-test-*`-Profile über 24 Stunden. Es tut nichts, solange ein Testlauf (`halo_test.py`, `ui_tour.py` des
Rundgangs, `update_test.py`, `store_shots.py`) oder die CI läuft; Nutzerprofile und andere Programme fasst es nie an.
Aufrufer: Nachtlauf, Tagesroutine, Doku- und Wochenprüfung, Rundgang, VM-Kaltstart 00:45, Release unter Tage
(Zeilen oben). Protokoll `~/halo-nacht/aufraeumen-testprozesse.log`; Logik-Test `tests/verwaiste_tb_test.zsh`.

## Modelle je Stelle und Sitzung

Eine Quelle für Modell und Stärke (Bericht `~/halo-berichte/2026-11-25-modelle.md` Abschnitte 2a und 2b, Schritt E5);
die Stellenkarten, `docs/neon-sitzung.md` und `docs/testrechner.md` verweisen hierher. Angenommen vom Maintainer
(25.11.2026: „ja alle empfehlungen von fable folgen ausser punkt 3, wir lassen einfach das modell sonnet low für
neon-board.“). Wann ein höheres Modell: AGENTS.md „Rot bleibt rot“, `docs/regelwerk-kontingent.md`; Modellwahl der
Tagesroutine nach der Sollkurve: Abschnitt „Modellwahl nach Sollkurve“ unten.

| Stelle bzw. Sitzung | Modell | Stärke | Hinweis |
|---|---|---|---|
| director (Plan-Schritt, Urteile; Sitzung ab Fr 27.11.) | Opus | medium | Fable nur als Schiedsrichter nach der Einspruchsregel |
| designer (Unteragent und Sitzung) | Opus, nie darunter (Maintainer 14.11.2026) | high | liegt die Modellstufe des Tages unter Opus, wird der Eintrag nicht beauftragt, statt kleiner zu gestalten |
| engineer (kein Dauerdienst) | Opus für Code, Fehlersuche, Tests; Sonnet für Kleines mit benannter Ursache; Haiku nur im Sparmodus | Standard | Aufstieg nach „Rot bleibt rot“ |
| orga (Sitzung ab Sa 28.11.) | Sonnet | medium | Umbauvorschläge und Regeländerungen an einen Opus-Unteragenten |
| inspector (Sitzung ab So 29.11.) | Opus | Sitzung medium | Revision nie schwächer als die Geprüften |
| comms (heute `github.comm.routine`) | Sonnet | low | Umstrittenes (Ablehnung, Design, Pull Request) an einen Opus-Unteragenten bzw. den Maintainer |
| neon (Sekretariat) | Sonnet | medium | Komplexes an Opus-Unteragenten, im Zweifel Opus (`docs/neon-sitzung.md`) |
| neon-board (Sekretariat) | Sonnet | low | Maintainer 25.11.2026 (Zitat oben) |
| Nachtlauf | Opus; Fable nur nach „Rot bleibt rot“ | Standard | |
| Tagesroutine | nach Sollkurve | Standard | Abschnitt „Modellwahl nach Sollkurve“ |
| Wochenprüfung | Opus | Standard | `tests/wochenpruefung.sh` (Entscheidung vom 9.11.2026) |
| Doku-Prüfung | Teil Sonnet, Vollprüfung Opus | Teil low, Vollprüfung medium | `tests/wochenpruefung.sh` |
| Abnahme und Aufräumen nach dem Release | Opus, nie darunter | Standard | |
| Rundgang, Bilder-Eingang | Sonnet | low | gestaltet nicht; Umsetzung durch den designer |
| Morgenbrief, Leitstand, CI-Wächter, GitHub-Wächter | kein Modell | – | Zustellung (`push()`) und Kontingent lesen mit Haiku |

## Tagesroutine (`tests/tagesroutine.sh`, Kopie in `~/.config/halo-spaces/`)

| Wert | Soll | Fundstelle |
|---|---|---|
| Wochentage | Mo–So (`WOCHENTAGE 1–7`) | `tests/tagesroutine.sh:78`; ENTSCHEIDUNGEN.md:487/505 |
| Beginn | 09:00, auch Sa/So | s. o. |
| Letzter Beginn / Ende | 20:30 / 22:00 | `tagesroutine.conf:10–11` |
| Commits je Tag | `MAX_COMMITS_TAG`: 40 (Maintainer 17.11.2026: „40 commits“; Skript-Standard angeglichen) | `tests/tagesroutine.sh:84`; **ohne Wortlaut in ENTSCHEIDUNGEN.md, Frage an den Maintainer** |
| Push | nie nach `main`; nur `pruef/tagesroutine-<datum>` (Linux, statisch); Ausnahme Release unter Tage | `docs/testrechner.md` „Tagesroutine“; ENTSCHEIDUNGEN.md ab :612 (15.11.2026) |
| Commits | nur in der Arbeitskopie `~/halo-tagesroutine` auf `pruef/tagesroutine-<datum>` (von `origin/main`), nie auf `main`; nach `main` über Zwischen-Release (Volldampf) oder Nachtlauf Schritt 0 b (`git merge`) | `tests/tagesroutine.sh` (`arbeitskopie_bereit`); ENTSCHEIDUNGEN.md „18.11.2026 – Tagesroutine committet auf ihren Prüfzweig“ |
| belegt | wartet bis `BELEGT_WARTEN` 60 Min. (CI, Testlauf, Release, andere Sitzung); Ungespeichertes in `~/halo-spaces` zählt nicht (`BELEGT_OHNE_REPO`, Umbau P2 K3) | `tests/tagesroutine.sh:84`; `tests/lauf-hilfen.zsh:478` |
| Pausen | nur `~/halo-nacht/pausen.txt` mit Ablaufzeit | `tests/lauf-hilfen.zsh:95, 138` |

### Modellwahl nach Sollkurve (Soll = Stunden seit Di 00:00 UTC / 168 · 100 %)

Auch nach einem freien Reset in derselben Woche (Anker `~/halo-nacht/wochenanker.txt`) bleibt es bei dieser Kurve (Maintainer
23.11.2026: „die sollkurve soll aber nicht vom freien reset am samstag aus rechnen sondern immer von dienstag 01:00 auf dienstag 01:00“; ersetzt „Soll bis nächster Reset“ ab dem Anker vom 18.11.2026); Rechenstelle
`wochen_soll` in `tests/lauf-hilfen.zsh`, gemeinsam mit Morgenbrief und `volldampf_status`.

| Lage (Woche − Soll) | Entscheidung | Modell Plan/komplex · Routine | Fundstelle |
|---|---|---|---|
| < −8 (`WEIT_DARUNTER`) | neu, aufholen | opus · opus; Fable, wenn 5 h < 50 % (`FABLE_5H_MAX`, 1 je Lauf) | `tests/tagesroutine.sh:277–281` |
| −8 … +0 (Band ±3 = „im Soll“) | neu | opus · sonnet (`MODELL_STARK`, `MODELL_ROUTINE`) | `tests/tagesroutine.sh:282–284` |
| 0 < Abstand ≤ 10 (`SPAR_MAX`) | Sparmodus (unten) | haiku | `tests/tagesroutine.sh:246–276` |
| > 10 | nichts Neues, bis zur vollen Stunde warten | – | `tests/tagesroutine.sh:240–245`; Maintainer 12.11.2026 („die risikoärmere variante bitte“) |
| Kontingent unlesbar | nichts Neues | – | `tests/tagesroutine.sh:224` |
| 5 h ≥ 80 % (`FUENF_STUNDEN_MAX`) | warten bis Fensterende, höchstens volle Stunde (Pause über `pausen.txt`) | – | `tests/tagesroutine.sh:287–297` |

### Sparmodus

| Wert | Soll | Fundstelle |
|---|---|---|
| Rate | (100 − Woche − `RESERVE_NACHT` 15) / Stunden bis Reset | `tests/tagesroutine.sh:22, 249–250`; Maintainer 12.11.2026 |
| Angespart | Rate · Stunden seit `START` − heute verbraucht | `tests/tagesroutine.sh:252` |
| Kosten je Eintrag | Mittel aus ≥ 3 Messungen, sonst `SPAR_KOSTEN_JE_EINTRAG` 1.0 | `tests/tagesroutine.sh:253–254` |
| Höchstens | 1 Eintrag je Tag, solange < 3 gemessen (`SPAR_MAX_EINTRAEGE_TAG`) | `tests/tagesroutine.sh:255, 266` |
| Modell | nur `SPAR_MODELL` haiku, nie Sonnet/Opus/Fable | `tagesroutine.conf:27` |
| Warten | stündlich neu entscheiden, solange vor `LETZTER_BEGINN` 20:30 | `tests/tagesroutine.sh:270`; ENTSCHEIDUNGEN.md:482 |
| Rest ≤ Reserve | nichts Neues bis zum Reset | `tests/tagesroutine.sh:263` |

## Nachtlauf (`tests/nachtlauf.sh`, Kopie in `~/.config/halo-spaces/`)

| Wert | Soll | Fundstelle |
|---|---|---|
| Start | 01:30, nur wenn nichts belegt; wartet auf CI-*, sonst Ausfall | `tests/lauf-hilfen.zsh:478` (`belegt`) |
| Planung | Director, Nutzen je Aufwand, 70–80 %-Vorsicht, Reserve ein Drittel | `tests/nachtlauf-auftrag.md` 1a; ENTSCHEIDUNGEN.md 13.11.2026 |
| Neue Einträge | bis 04:30 | `docs/testrechner.md` „Director im Nachtlauf“ |
| Schritt 5 | bis `NACHT_GRENZE` 06:30, höchstens `NACHT_MAX_COMMITS` 6 nicht gepushte Commits | `tests/vorpruefung.zsh:59–60` |
| Fortsetzungen | höchstens `FORTSETZ_MAX` 4, Ende 08:00, hart 09:00 | `tests/nachtlauf.sh:56–58, 221, 242–243` |
| Modelle | Opus; Fable nur nach „Rot bleibt rot“ (2. und 3. Versuch, ein Agent, 5 h < 50 %) | `docs/neon-sitzung.md` Schritte 0–6 („Rot bleibt rot“); ENTSCHEIDUNGEN.md:423 |
| Release | höchstens eins je Tag, nur mit Testmarke; Windows einmal je Nacht | AGENTS.md „Release“ |
| Worker-Einträge | „In Arbeit: worker-…“ sperrt 5 h; „committet auf pruef/worker-…“ per cherry-pick übernehmen | `tests/nachtlauf-auftrag.md` (Commit a83f7b1) |
| Aufräumen | Pausen, abgelaufene Volldampf-Zeile, Zweige | `tests/nachtlauf.sh:172, 182, 276`; `tests/aufraeumen.sh` |

## Zusammenspiel

| Frage | Regel | Fundstelle |
|---|---|---|
| Wer pusht nach `main`? | Nachtlauf (nach 01:30), von Hand gestartete Sitzungen außerhalb der Sperren, Release unter Tage | AGENTS.md; `tests/release-unter-tage.sh` |
| Wer wartet? | Tagesroutine wartet auf `lauf.lock` des Nachtlaufs und auf CI/Testläufe (`belegt_tag`) | `tests/tagesroutine.sh`; `docs/testrechner.md` |
| Schutz 01:30 | ab 00:00 kein Code-Push, kein Testlauf über 01:30, Tagesroutine endet 22:00 | AGENTS.md „Den Nachtlauf nicht behindern“ |
| Zwei Claude-Läufe zugleich? | nie im selben Repo; Tagesroutine beginnt erst nach dem Nachtlauf | `docs/testrechner.md` „Beginn der Tagesroutine“ |
| Wächter, Worker | laufen im Alltag **nicht** (beenden sich ohne aktive Zeile) | `tests/auslastung-schleife.zsh:115`; `tests/zwischen-schleife.zsh` |

## Abweichungen und Fragen

| Stelle | Befund | Stand |
|---|---|---|
| `docs/testrechner.md` Auslastungswächter | „nachts eine weniger“ veraltet seit 9d2b9f0 | berichtigt |
| `docs/testrechner.md` Zwischen-Release | „bis 19:30“, Skript 22:30 (ed43f8d, ENTSCHEIDUNGEN.md:755) | berichtigt |
| `MAX_COMMITS_TAG` | Skript 20, Konfig 40 | entschieden 17.11.2026: 40 („1. 40 commits“) |
| ENTSCHEIDUNGEN.md 13.11. Volldampf | „doppeltes Commit-Tageslimit“, „Fortsetzungen bis 08:00“ durch 16./17.11. überholt (neuere gelten) | nur Hinweis |
| Fable | 13.11. „höchstens zwei je Nacht, einer am Tag“ (bestätigt) gegen 17.11. „bei bedarf auch fable“ | entschieden 17.11.2026: im Volldampf keine Limits für Fable, wenn der Einsatz hilfreich ist und die Produktivität erhöht; im Alltag gelten die Grenzen oben |
| Kopien in `~/.config/halo-spaces/` | `lauf-hilfen.zsh`, `tagesroutine.sh` älter als der Checkout | neon muss sie erneuern |
