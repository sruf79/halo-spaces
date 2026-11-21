# Volldampf-Regelwerk

Volldampf ist ein Schalter über dem Alltagsmodus (`docs/alltagsmodus.md`); Überblick über Zustände, Bremsen und Aufgabenzuteilung: `docs/regelwerk-kontingent.md`. Maintainer 17.11.2026: „volldampf
bedeutet maximale produktivität. … das betrifft die anzahl der gleichzeitigen agents, die anzahl der releases,
einfach alles.“ und „wir wollen keine defekten releases veröffentlichen … von daher sollten die tests weiterhin
laufen wie bisher.“ (ENTSCHEIDUNGEN.md ab :743). Einzelheiten und Verlauf: `docs/testrechner.md` „Volldampf“.

## Ein- und Ausschalten (nur auf neon, nur auf Zuruf des Maintainers)

| Befehl | Wirkung | Fundstelle |
|---|---|---|
| `zsh tests/volldampf.sh an [<bis>] [<Grund>]` | schreibt `~/halo-nacht/volldampf.txt` (bis = nächster automatischer Reset Di 00:00 UTC, 01:00 bzw. im Sommer 02:00 Wiener Zeit), startet Auslastungs- und Zwischen-Release-Wächter; alte Zeile wandert nach `volldampf-alt-<Zeit>.txt`, damit beginnt sauber ein neues Fenster (anderes ab); eine Pausenmarke `volldampf-beendet.txt` hebt sich auch ohne `an` nach dem freien Reset auf | `tests/volldampf.sh:45–58`; `tests/volldampf_test.zsh` |
| `zsh tests/volldampf.sh aus` | Zeile nach `volldampf-aus-<Zeit>.txt`, beendet beide Wächter | `tests/volldampf.sh:59–65` |
| `zsh tests/volldampf.sh status` | Regel, Wächter | `tests/volldampf.sh:66` |

## Was nur bei aktiver Regelzeile gilt

Jede Stelle fragt selbst `volldampf_aktiv` (`tests/lauf-hilfen.zsh:261`), bei jeder Entscheidung neu.

| Bereich | Alltag | Volldampf | Fundstelle |
|---|---|---|---|
| Tagesroutine Beginn | 09:00 | 08:45 (`START_VOLLDAMPF`) | `tests/tagesroutine.sh:209–211` |
| Tagesroutine letzter Beginn / Ende | 20:30 / 22:00 | 23:30 / 23:59 | `tagesroutine.conf:12–13`; `grenzen_setzen` `tests/tagesroutine.sh:111`; ENTSCHEIDUNGEN.md:755 |
| Sollkurve, Sparmodus, Reserve | bremsen | ausgesetzt; Modelle opus/sonnet | `tests/tagesroutine.sh:230–239` |
| Fenster-Takt Tagesroutine | – | neue Einträge nur, solange das 5-Stunden-Fenster nicht über verstrichener Zeit + `FENSTER_RESERVE` (25) liegt; sonst ohne Claude warten, bis der Takt aufholt (höchstens volle Stunde); dieselbe Rechnung wie der Wächter (Maintainer 18.11.2026: „ich folge allen empfehlungen von dir.“) | `fenster_takt` in `tests/lauf-hilfen.zsh`; `ENTSCHEID_PY` in `tests/tagesroutine.sh`; `tests/tagesroutine_test.zsh` „Fenster-Takt …“ |
| Sollkurve (Anzeige, Auslastungswächter) | 168 h ab Di 00:00 UTC; nach freiem Reset „Soll bis nächster Reset“ = Stunden seit Anker / Stunden Anker bis automatischer Reset (Maintainer 18.11.2026) | vergangene Zeit der Kalenderwoche (Di 01:00 bis Di 01:00): 100 − (resetsAt − jetzt) / 6048 s, resetsAt aus `kontingent.json`, auch nach einem freien Reset; bis 20.11.2026 48 h ab Di 00:00 UTC (Maintainer 20.11.2026: „die wochen kontingent grafik stimmt hier nicht oder? es sind doch bereits 48% vom wochen rythmus vergangen, welcher immer von dienstag 01:00 bis dienstag 01:00 geht“) | `kalender_soll` in `tests/lauf-hilfen.zsh`; `tests/auslastung-schleife.zsh` `pruefen`; Leitstand `soll_prozent`; Alltag `wochen_soll` |
| Commits je Tag (Tagesroutine) | `MAX_COMMITS_TAG` | unbegrenzt (`MAX_COMMITS_VOLLDAMPF` 0) | `tagesroutine.conf:43` |
| Fable Tagesroutine | 5 h < 50 %, nur weit unter Soll | keine Grenze (17.11.2026: „im volldampf gibt es keine limits für fable nutzung wenn derer einsatz bei komplexen themen oder problemen hilfreich ist und die produktivität erhöht“); `FABLE_5H_MAX_VOLLDAMPF`/`FABLE_WOCHE_MAX` 100 | `tests/tagesroutine.sh:236–239` |
| Nachtlauf Schritt 5 / Fortsetzungen / Ende | 06:30 · 6 Commits · 4 · 08:00 | 08:45 · 40 · 50 · 08:45 | `tests/nachtlauf.sh:221–243` |
| Nachtlauf Planung | 70–80 %-Vorsicht, Reserve | volle Kapazität, token-intensivste zuerst | `tests/nachtlauf-auftrag.md` 1c/1d |
| Auslastungswächter | läuft nicht | Worker auf `pruef/worker-*`, bis `MAX_WORKER` (auslastung.conf), je Worker höchstens 240 Min.; ab 70 % im 5-Stunden-Fenster nur Klasse „tokenarm“ (Sonnet, höchstens einer; Maintainer 18.11.2026); ab 85 % Windows-Rundgang (offener Bildauftrag aus `neon-stand.md`, 09:00–22:00, nicht belegt, einmal je Tag, Rahmen `tests/auslastung-rundgang.md`) | `tests/auslastung-schleife.zsh` (`pruefen`, `konf_lesen`); `tests/auslastung-auftrag.md` „Klasse tokenarm“ |
| Kontingent-Drossel (Woche bis Dienstag) | – | d = Verbrauch der Woche (%) − vergangene Zeit der Kalenderwoche (%), Maintainer 20.11.2026: „ja, stell die ampel so um. wäre es nicht alarmierender, wenn wir mehr % token als % woche verbraucht haben?“ (vorher Hochrechnung mit Fehlstunden, 19.11.2026). Stufe 1 (0 < d ≤ 5): keine neuen Worker, Tagesroutine nur kein Fable (Plan und komplexe Einträge bleiben Opus); Stufe 2 (5 < d ≤ 15): Tagesroutine nur jede zweite Runde; Stufe 3 (d > 15, oder ab 90 % verbraucht bei d > 0): Tagesroutine nichts Neues bis zur vollen Stunde; zurück erst 1 Punkt unter der Grenze; Fail-open, wenn `kontingent.json` fehlt, älter als 3 h, jetzt nach resetsAt oder Stand vor dem Wochenbeginn; gilt auch nach freiem Reset; nie gebremst: Nachtlauf, Zwischen-Release, Tests, rote CI samt rotem Prüfzweig der Tagesroutine, Release unter Tage, Windows-Rundgang | `drossel_stufe` in `tests/lauf-hilfen.zsh`; `pruefen` in `tests/auslastung-schleife.zsh`; `entscheiden`/`drossel_anwenden` in `tests/tagesroutine.sh`; `tests/drossel_test.zsh`; Zustand `~/halo-nacht/drossel-stufe.txt` |
| Worker-Auftrag | – | wählt ohne „Volldampf aktiv“ nichts; kein Testbeginn 01:10–01:45 | `tests/auslastung-test.zsh:22`; `tests/auslastung-auftrag.md` Regel 6 |
| Zwischen-Releases | eins je Tag (Nachtlauf) | Wächter alle 5 Min., Push-Beginn 09:00–22:30, grüne Stände aller Prüfzweige `pruef/*` (GitHub-Lauf, sauber mit `origin/main` mischbar, roter Stand nie wiederholt), ab 3 Thunderbird-Commits, bei 5-Stunden-Fenster ab 85 % ab 1 (Maintainer 18.11.2026) | `tests/zwischen-schleife.zsh` (`kandidaten`, `pruefen`); `tests/zwischen_schleife_test.zsh`; Commit ed43f8d |

## Was immer bleibt (auch im Volldampf)

| Regel | Fundstelle |
|---|---|
| Nachtlauf 01:30 ungestört; Push-Sperre 01:30–09:00; kein Code-Push ab 00:00 | AGENTS.md; `tests/zwischen-schleife.zsh:74` |
| Tests, volle CI, Windows je Nacht, Testmarke vor jedem Release | AGENTS.md „Release“; `release.sh`, `publish.sh` |
| 5-Stunden-Fenster ≥ 80 % bremst; pausiert Volldampf nicht | `tests/tagesroutine.sh:287`; ENTSCHEIDUNGEN.md 13.11. |
| `belegt`: kein zweiter Testlauf zugleich, Nachtlauf wartet nur auf CI | `tests/lauf-hilfen.zsh:475–478` |
| Mail-Schutz, „Wartet auf OK“, Designer-Regel, Rot bleibt rot | AGENTS.md |

## Rückfall auf den Alltag

| Auslöser | Wirkung | Fundstelle |
|---|---|---|
| `aus` | Zeile weg → nächste Entscheidung normal; Wächter beendet | `tests/volldampf.sh:59–65` |
| `bis` erreicht | `volldampf_aktiv` rc 1; Nachtlauf räumt die Zeile weg | `tests/lauf-hilfen.zsh:261, 332` |
| Woche ≥ 98 % | Pausenmarke `volldampf-beendet.txt`, iPhone-Meldung; keine neuen Einträge/Worker, laufende fertig, Wächter warten; nach erkanntem freiem Reset (Anker `wochenanker.txt`, Sturz ≥ 20 Punkte) von selbst wieder Volldampf (Maintainer 18.11.2026, löst „dauerhaft aus“ vom 13.11. ab) | `volldampf_wochenlimit_pruefen`, `wochen_reset_erkennen` in `tests/lauf-hilfen.zsh` |
| automatischer Reset Di 01:00 (`bis`) | Volldampf endet, Anker verfällt, Auslastungswächter endet; ab Nachtlauf 01:30 Alltagsmodus mit 168-h-Sollkurve (Maintainer 18.11.2026) | `tests/volldampf_test.zsh` „Übergang …“ |
| Wächter abgestürzt | keine neuen Worker/Zwischen-Releases; Regeln der Routinen unberührt | `tests/volldampf.sh:25` (`status`) |
| Tagesroutine läuft gerade | `grenzen_setzen` in der Wache setzt 20:30/22:00 sofort zurück | `tests/tagesroutine.sh:111–119` |
| Nachtlauf läuft gerade | vor jeder Fortsetzung neu gelesen, Grenzen 06:30/6/4/08:00 | `tests/nachtlauf.sh:241–243` |

Bekannte Restwirkungen nach dem Ausschalten (gewollt bzw. offen):

- Laufende Worker arbeiten bis zu 240 Minuten weiter (ihr eigener Zeitgeber), committen nur auf `pruef/worker-*`.
- Ein Zwischen-Release, das schon läuft, läuft zu Ende (Testmarke bleibt Bedingung).
- Liegt das Ausschalten nach 22:00, beendet die Wache der Tagesroutine claude sofort; unfertige Arbeit bleibt
  ungespeichert liegen (der Nachtlauf legt sie auf `rest/<datum>`).
- Worktrees `~/halo-worker/*` ohne Commit entfernt der Auslastungswächter gleich nach dem Lauf; `tests/aufraeumen.sh`
  räumt Worker-Worktrees und Zweige `pruef/worker-*` weg, deren Commits (auch per cherry-pick/rebase, Patch-Vergleich)
  in main stecken (19.11.2026). Nicht übernommene Commits holt der Nachtlauf per cherry-pick.
- Die Routinen laufen aus den Kopien in `~/.config/halo-spaces/`; Änderungen wirken erst nach dem Erneuern
  der Kopien, die Worker aus `origin/main` erst nach dem Push.
