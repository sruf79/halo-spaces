# Regelwerk Kontingent: Zustand, Bremsen, Aufgabenzuteilung

Eine Seite für alle Läufe (Tagesroutine, Nachtlauf, Auslastungswächter, Zwischen-Release-Wächter). Auftrag des
Maintainers (18.11.2026): „wichtig ist, dass wir am ende ein globales regelwerk haben dass unsere produktivität im
hinblick auf das token kontingent steuert und jeweils entsprechende tasks zuweist, je nach token-aufwand bzw.
zeitlichen aufwand“. Diese Seite fasst zusammen und verweist; Einzelheiten und Wortlaute: `docs/alltagsmodus.md`,
`docs/volldampf-regelwerk.md`, `docs/testrechner.md` „Volldampf“, `ENTSCHEIDUNGEN.md`. Zeiten Wiener Zeit, Punkte =
Prozentpunkte des Wochenkontingents („alle Modelle“). Bei Widerspruch gilt der Code (Fundstellen unten), dann diese Seite.

## 1. Messwerte (eine Quelle)

| Wert | Quelle | Regel |
|---|---|---|
| Woche, 5-Stunden-Fenster, Fensterende | `tests/kontingent.sh` → `~/halo-nacht/kontingent.json` | ohne Wochenwert („seven_day“) gilt die Woche als nicht lesbar, nie 0 oder 5-Stunden-Wert |
| Soll (Sollkurve) | `wochen_soll` in `tests/lauf-hilfen.zsh` | ohne freien Reset: Stunden seit Di 00:00 UTC / 168 (Wächter: / 48) × 100 %; nach freiem Reset (Anker): Stunden seit Anker / Stunden Anker → nächster Reset × 100 % |
| Freier Reset (Anker) | `wochen_reset_erkennen` | Sturz der Woche um ≥ 20 Punkte ohne automatischen Reset dazwischen; nur echte Messwerte (nie Platzhalter); verfällt am automatischen Reset |
| Fenster-Takt | `fenster_takt`/`FENSTER_DEF_PY` in `tests/lauf-hilfen.zsh` (Wächter `pruefen`, Tagesroutine `ENTSCHEID_PY`) | Takt = verstrichener Anteil des 5-Stunden-Fensters + 25 Punkte (`FENSTER_RESERVE`); Fensterende unbekannt = kein Takt |

## 2. Zustände und was je Zustand gilt

| Zustand | Erkennung | Tagesroutine | Nachtlauf | Auslastungswächter | Zwischen-Release-Wächter |
|---|---|---|---|---|---|
| **Alltag** | keine aktive Zeile in `volldampf.txt` | 09:00–20:30 (Ende 22:00); Abstand < −8: alles Opus (Fable bei 5 h < 50 %); −8…0: Opus/Sonnet; 0…+10: Sparmodus Haiku; > +10: stündlich warten | 01:30, Director mit 70–80 %-Vorsicht, Schritt 5 bis 06:30, Ende 08:00 | läuft nicht | läuft nicht |
| **Volldampf aktiv** | Zeile aktiv (`volldampf_aktiv` = 0) | 08:45–23:30 (Ende 23:59); Soll und Sparmodus bremsen nicht; Fenster-Takt wie der Wächter (über Takt: warten, bis er aufholt, höchstens volle Stunde); Opus/Sonnet, Fable bei 5 h < 100 % | Fortsetzungen bis 08:45, Grenzen 40 Commits / 50 Fortsetzungen | alle 10 Min., bis `MAX_WORKER` (6); tags Start bei Woche < Soll (48 h) **oder** 5 h < 60 %; nachts (vor 09:00 oder Nachtlauf läuft) nur bei Woche < Soll; Fable bei ≥ 5 Punkte unter Soll | alle 5 Min., Push-Beginn 09:00–22:30 (danach warten), Release bis 24:00; ab 3 Thunderbird-Commits |
| **Volldampf, Fenster knapp** | 5 h ≥ 70 / 80 / 85 / 90 % | ab 80 %: nichts Neues bis Fensterende | Limit-Pause 30 Min. bei Abbruch | ab 70 %: nur Klasse „tokenarm“ (Sonnet, höchstens ein tokenarmer Worker); ab 85 % (bis unter 98 %): Windows-Rundgang, einmal je Tag; ab 90 %: kein Worker-Start | ab 85 %: Release schon ab 1 Thunderbird-Commit (CI und Windows nutzen die Pause) |
| **Volldampf pausiert** | Woche ≥ 98 % (Marke `volldampf-beendet.txt`) | Alltagsregeln (meist „nichts Neues“, weit über Soll) | Alltagsgrenzen | wartet, liest Kontingent stündlich | wartet |
| **Nach freiem Reset** | Anker in `wochenanker.txt` | Volldampf läuft von selbst weiter, Soll bis nächster Reset | wie Volldampf | Soll bis nächster Reset | wie Volldampf |
| **Automatischer Reset** | Di 00:00 UTC (01:00 Winter, 02:00 Sommer) = `bis` | ab dann Alltag | ab 01:30 Alltag, räumt Zeile weg | endet beim nächsten Takt | endet beim nächsten Takt |

## 3. Bremsen in fester Reihenfolge (die erste, die greift, entscheidet)

1. **Pause** in `~/halo-nacht/pausen.txt` (je Routine, mit Ablauf).
2. **Zeitregeln**: Push-Sperre 01:30–09:00, ab 00:00 kein Code-Push, Nachtlauf-Schutz (kein Worker-Testbeginn 01:10–01:45), Zeitfenster der Tagesroutine.
3. **Belegt** (`belegt()`): CI auf dem Runner, Testlauf, Marionette-Port, Windows-VM, release.sh/publish.sh, andere Sitzung.
   Wartezeiten des Nachtlaufs vor dem Start (Maintainer 18.11.2026, `nachtlauf_warten` in `tests/vorpruefung.zsh`): CI bis zu
   ihrem Ende, längstens 03:30; Testlauf, Thunderbird mit Marionette, Marionette-Port bis 60 Minuten ab dem ersten Sehen;
   release.sh/publish.sh bis 20 Minuten (dauert wenige Minuten); andere Claude-Sitzung (der Lauf des Maintainers geht immer
   vor), Windows-VM und ungespeicherte Änderungen: sofort auslassen. Keine Wartezeit über 03:30 hinaus; danach „ausgelassen“
   mit Bericht und Push. Begründung 03:30 (nicht 04:00): bis 06:30 (Alltag; Volldampf 08:45) bleiben drei Stunden für Arbeit,
   Push, CI-Runde (35–50 Minuten) und Release, die Vollrunde startet noch vor ihrer Grenze 04:30. Die Wochenprüfung (So 08:00)
   wartet seit 18.11.2026 genauso (`woche_warten`, Maintainer: „ja die wochenprüfung ebenfalls“), nach dem Nachtlauf (bis 09:15)
   mit CI-Grenze 10:00 statt fest 90 Minuten (eine CI ab 09:00 ist auch dunkel vorher fertig; die Tagesroutine Sa/So wartet so
   lange). Andere Läufe warten wie bisher.
4. **Wochenlimit**: Status nicht „allowed…“ oder Woche ≥ 98 % → Volldampf pausiert, Alltagsregeln.
5. **5-Stunden-Fenster hart**: Wächter ab 90 %, Tagesroutine ab 80 %.
6. **Fenster-Takt** (Wächter; Tagesroutine nur im Volldampf, seit 18.11.2026): 5 h über Takt → kein neuer Worker bzw. Eintrag.
7. **Drossel** (nur Wächter, seit 18.11.2026 Aufgabenzuteilung): 5 h ab 70 % → kein tokenschwerer Worker mehr, nur Klasse „tokenarm“ (`MODELL_TOKENARM` sonnet, höchstens `TOKENARM_MAX` 1 gleichzeitig; vorher „höchstens eine Arbeits-Sitzung“).
8. **Sollkurve**: Alltag Tagesroutine (Sparmodus, „nichts Neues“); Wächter nachts nur unter Soll, tags unter Soll oder Fenster < 60 %.
9. **Modellwahl** (keine Bremse): Abstand und 5 h wählen Haiku/Sonnet/Opus/Fable.

Keine Doppelbremse: 7 wirkt nur auf den Wächter, 5 je Lauf mit eigener Schwelle (Wächter 90 %, Tagesroutine 80 %), 6 auf Wächter und Tagesroutine im Volldampf, 8 auf beide nach eigener Kurve; der Nachtlauf bremst nur
über 1–4 und die Limit-Pause. Laufende Arbeit wird von 4–8 nie abgebrochen, nur kein neuer Beginn.

## 4. Aufgabenzuteilung nach Aufwand

| Klasse | Token | Zeit | Beispiele | Wer und wann (heute umgesetzt) |
|---|---|---|---|---|
| T1 schwer | sehr hoch | mittel | Fehlersuche ohne belegte Ursache, Analyse, Design-Grundsatz | Fable nur mit Beleg; Wächter bei ≥ 5 Punkten unter Soll; Tagesroutine nach Opus-Fehlschlag; Nachtlauf „Rot bleibt rot“ |
| T2 Code | hoch | mittel | Bugs, Features, Prüfungen | Opus: Plan und „komplex“ der Tagesroutine, Worker, Nachtlauf |
| T3 Routine | mittel | kurz | kleine Korrekturen, Texte in Code | Sonnet: „routine“ der Tagesroutine; Haiku im Sparmodus; Wächter ab 70 %: Worker Klasse „tokenarm“ (b) |
| T4 Text | niedrig | kurz | README, Notizen, Doku | Sonnet (Zwischen-Release-Vorbereitung) |
| Z1 Prüfen | kaum | lang | CI, Windows-Lauf, Warten auf Tests, Prüfung wiederholen | Zwischen-Release-Wächter (ab 85 % Fenster schon ab 1 Commit), Nachtlauf; Wächter ab 70 %: Worker Klasse „tokenarm“ (a) |
| Z2 Release | kaum | lang | release.sh, publish.sh | Nachtlauf; Volldampf: Zwischen-Release-Wächter (roter Lauf vorher einmal wiederholt, jedes Ergebnis an neon, `docs/release.md`) |
| Z3 VM, Bilder | kaum | lang | Windows-Rundgang, Bilder | Rundgang-Routine nach Plan; Windows-Rundgang (offener Bildauftrag `RUNDGANG_NR` in `neon-stand.md`): Wächter ab 85 % im 5-Stunden-Fenster, 09:00–22:00, nicht belegt, kein Nachtlauf, einmal je Tag, bis erledigt (Sonnet, Rahmen `tests/auslastung-rundgang.md`) |

Klasse „tokenarm“ (Maintainer 18.11.2026: „ich folge allen empfehlungen von dir.“): ab 70 % im 5-Stunden-Fenster startet der
Wächter nur noch Worker dieser Klasse; ihr Auftrag (`tests/auslastung-auftrag.md` „Klasse tokenarm“) erlaubt (a) Prüfaufträge
(Prüfung wiederholen, Ergebnis als Notiz) und (b) kleine Routine mit benannter Ursache in einer Datei, nie T1/T2, Fable,
Bug-Jagd, Reihen oder Features; wird es größer: zurück. Bei Volldampf-Pause startet der Wächter gar nichts.

Grundsatz: Fenster und Woche unter Takt bzw. Soll → T1/T2 zuerst (im Volldampf die token-intensivsten zuerst);
Fenster knapp (≥ 85 %) oder Volldampf pausiert → Z-Klassen, die kaum Token brauchen; nachts nur unter Soll.

## 5. Lücken (Vorschläge, brauchen eine Entscheidung)

