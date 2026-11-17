# Alltagsmodus: Tagesroutine, Sparmodus, Nachtlauf

Gilt immer, wenn **kein** Volldampf aktiv ist (`volldampf_aktiv` ≠ 0, also keine Zeile, abgelaufen, von Hand
`aus` oder Marker `volldampf-beendet.txt`). Was Volldampf daran ändert: `docs/volldampf-regelwerk.md`.
Soll = Stand vor Volldampf, belegt durch Skript, `~/.config/halo-spaces/tagesroutine.conf` (Sicherungen in
`~/halo-sicherung/`), git log und `ENTSCHEIDUNGEN.md`. Zeilenangaben beziehen sich auf den Stand dieses Commits.
Zeiten in Wiener Zeit.

## Zeitplan eines Tages

| Zeit | Wer | Was | Fundstelle |
|---|---|---|---|
| 01:30 | Nachtlauf | Start (LaunchAgent), Liste laden, Director plant | AGENTS.md „Nachtlauf“; `tests/nachtlauf.sh` |
| bis 04:30 | Nachtlauf | neue Einträge beginnen | `docs/testrechner.md` „Director im Nachtlauf“ |
| danach | Nachtlauf | Push, CI warten, bei Grün Release | `tests/nachtlauf-auftrag.md`, `tests/ci-runde.zsh` |
| bis 06:30 | Nachtlauf | Schritt 5: weitere Einträge ohne Push (Fortsetzungen) | `tests/vorpruefung.zsh:59`; ENTSCHEIDUNGEN.md:36 (8.11.2026) |
| 08:00 | Nachtlauf | keine Fortsetzung mehr | `tests/nachtlauf.sh:56` |
| 09:00 | Nachtlauf | claude hart beendet; Push-Sperre endet | `tests/nachtlauf.sh:58`; AGENTS.md „Push-Sperre“ |
| 08:45 / 09:00 | Tagesroutine | LaunchAgent 08:45, wartet ohne Claude bis `START` 09:00 (Mo–So) | `tagesroutine.conf` `START`, `START_WOCHENENDE`; ENTSCHEIDUNGEN.md:505 (13.11.2026 „Start am Wochenende um 09:00“) |
| 20:30 | Tagesroutine | letzter Beginn eines neuen Eintrags | `tagesroutine.conf` `LETZTER_BEGINN`; `tests/tagesroutine.sh:78` |
| 22:00 | Tagesroutine | Ende, Wache beendet claude | `tagesroutine.conf` `ENDE`; `tests/tagesroutine.sh:110–119` |
| 00:00 | alle von Hand | kein Push mit Codeänderung mehr | AGENTS.md „Den Nachtlauf nicht behindern“ |
| 01:30–09:00 | alle außer Nachtlauf, Wochen-, Doku-Prüfung | Push-Sperre | AGENTS.md „Push-Sperre“ |

## Tagesroutine (`tests/tagesroutine.sh`, Kopie in `~/.config/halo-spaces/`)

| Wert | Soll | Fundstelle |
|---|---|---|
| Wochentage | Mo–So (`WOCHENTAGE 1–7`) | `tests/tagesroutine.sh:78`; ENTSCHEIDUNGEN.md:487/505 |
| Beginn | 09:00, auch Sa/So | s. o. |
| Letzter Beginn / Ende | 20:30 / 22:00 | `tagesroutine.conf:10–11` |
| Commits je Tag | `MAX_COMMITS_TAG`: Skript 20, Konfig 40 (seit 15.11., Sicherung `tagesroutine.conf.vor-limit40-2026-11-15`) | `tests/tagesroutine.sh:84`; **ohne Wortlaut in ENTSCHEIDUNGEN.md, Frage an den Maintainer** |
| Push | nie nach `main`; nur `pruef/tagesroutine-<datum>` (Linux, statisch); Ausnahme Release unter Tage | `docs/testrechner.md` „Tagesroutine“; ENTSCHEIDUNGEN.md ab :612 (15.11.2026) |
| belegt | wartet bis `BELEGT_WARTEN` 60 Min. (CI, Testlauf, Release) | `tests/tagesroutine.sh:84`; `tests/lauf-hilfen.zsh:478` |
| Pausen | nur `~/halo-nacht/pausen.txt` mit Ablaufzeit | `tests/lauf-hilfen.zsh:95, 138` |

### Modellwahl nach Sollkurve (Soll = Stunden seit Di 00:00 UTC / 168 · 100 %)

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
| Modelle | Opus; Fable nur nach „Rot bleibt rot“ (2. und 3. Versuch, ein Agent, 5 h < 50 %) | AGENTS.md „Rot bleibt rot“; ENTSCHEIDUNGEN.md:423 |
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
| `MAX_COMMITS_TAG` | Skript 20, Konfig 40, kein Wortlaut | **Frage an den Maintainer** |
| ENTSCHEIDUNGEN.md 13.11. Volldampf | „doppeltes Commit-Tageslimit“, „Fortsetzungen bis 08:00“ durch 16./17.11. überholt (neuere gelten) | nur Hinweis |
| Fable | 13.11. „höchstens zwei je Nacht, einer am Tag“ (bestätigt) gegen 17.11. „bei bedarf auch fable“ | **Frage an den Maintainer** (gilt nur im Volldampf) |
| Kopien in `~/.config/halo-spaces/` | `lauf-hilfen.zsh`, `tagesroutine.sh` älter als der Checkout | neon muss sie erneuern |
