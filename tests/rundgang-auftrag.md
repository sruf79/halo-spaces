Unbeaufsichtigter Design-Rundgang halo.spaces auf neon (gestartet von
tests/rundgang-woche.sh, samstags 10:00; Entscheidung des Maintainers vom
5.11.2026). Niemand sieht zu, niemand antwortet auf Rückfragen. AGENTS.md
gilt vollständig (besonders „Konventionen“, „Aufgabenliste“ und
„Apple-Vorlagen“); Abweichungen und Ergänzungen stehen hier. Ziel:
Rückschritte und neue Ausreißer bei Popups, Panels, Dialogen, Knöpfen,
Suchfeldern, Symbolen und im Dunkelmodus finden, die halo_test.py nicht sieht.

Der Rundgang (tests/ui_tour.py --messung) und der Vergleich
(tests/rundgang_vergleich.py) sind schon gelaufen. Oben stehen Ordner,
voriger Rundgang, Stand (Commit), gelaufene Schemata, Bericht, Fertig-Datei
und Protokoll. Nichts committen, nichts pushen, keine Testläufe starten.

## 1. Auswerten

- `vergleich.md` und `vergleich.json` im Rundgang-Ordner lesen: Kennzahlen,
  neue und behobene Ausreißer, geänderte Werte, neu nicht erreichte
  Oberflächen, neue Original-Symbole, Suchfelder (Kapsel, kein Hover-Zustand).
- Bei jedem neuen Ausreißer das Bild ansehen (`<hell|dunkel>-<id>.png`, beim
  vorigen Rundgang dasselbe zum Vergleich). Ist der Unterschied im Bild nicht
  zu sehen und offensichtlich ein Messfehler (Rundgang hat eine andere Stelle
  erwischt), nur im Bericht unter „Messung prüfen“ nennen, kein Eintrag.
- Datum, Uhrzeit, „in 18 min“ u. Ä. ändern sich von selbst – daraus nie einen
  Eintrag machen. Der Pixelvergleich (`bilder_geaendert_info`) ist nur
  Information.
- Apple-Vorlagen: `~/halo-aufgaben/apple/index.md` lesen und zu jeder
  betroffenen Oberfläche die passende Vorlage nennen bzw. vergleichen; fehlt
  eine, im Bericht unter „Vorlagen, die helfen würden“ nennen.

## 2. Board (gh project, wie in AGENTS.md)

Die Aufgabenliste einmal zu Beginn laden (`gh project item-list 1 --owner
sruf79 --limit 300 --format json`, auch Done-Einträge ansehen).

- **Neue Ausreißer:** gebündelt nach Bereich als Bug, Status Todo
  (`~/.claude/skills/aufgabe/eintragen.sh bug "<Bereich>: …" "<Text>"`),
  Titel im üblichen Stil. Vorher prüfen, ob ein offener Eintrag denselben
  Punkt abdeckt – dann diesen ergänzen. In jeden Eintrag: Ergebnisseite (siehe
  4.), ui_tour-ids, gemessener Wert gegen Modus, passende Apple-Vorlage, wo
  bekannt die Stelle im CSS (`grep` in chrome/ und extension/ des Stands).
- **Nicht eintragen:** was einer Entscheidung des Maintainers entspricht
  (z. B. „Symbole der Einstellungen bleiben vorerst, wie sie sind“, 5.11.2026;
  Einträge mit „entschieden: …“ in Board-Einträgen beachten) und was in einem
  Eintrag mit Status „Wartet auf OK“ steht – nur im Bericht nennen.
- **Behobene Ausreißer:** Gehört der Ausreißer zu einem Done-Eintrag, dort
  vermerken „Rundgang <datum>: bestätigt behoben“. Ist ein Ausreißer eines
  Done-Eintrags wieder da (Rückschritt), Notiz in den Eintrag und einen neuen
  Bug „<Bereich>: Rückschritt – …“ mit Verweis auf den alten Eintrag.
- **Neu nicht erreichte Oberflächen:** als ein Bug „Tests: Rundgang erreicht
  … nicht mehr“ (bzw. offenen Eintrag dazu ergänzen) mit ids und Fehlermeldung.
- **Neue Original-Symbole:** an den offenen Symbol-Eintrag hängen bzw. neu
  „Symbole: …“ (außer Entscheidungen, siehe oben).
- Inhalte des Boards nie öffentlich machen.

## 3. Bericht

`~/halo-berichte/<datum>-rundgang.md` (Pfad oben), Aufbau:

    # halo.spaces Design-Rundgang <datum>
    Kurz: <eine Zeile: OK/nicht erreicht, Ausreißer neu/behoben/gesamt, Einträge>
    ## Kennzahlen
    je Schema: OK, nicht erreicht, Ausreißer gesamt, neu, behoben; Dauer je
    Schema (Protokoll), Stand (Commit), voriger Rundgang
    ## Neue Ausreißer und Rückschritte (mit Eintrag-id)
    ## Behoben
    ## Nicht eingetragen (Entscheidungen, Wartet auf OK, Messung prüfen)
    ## Vorlagen, die helfen würden
    ## Ergebnisseite

## 4. Ergebnisseite

Wenn das Werkzeug `Artifact` in dieser Sitzung verfügbar ist: die private
Ergebnisseite https://claude.ai/artifact/Thhp5827nNQpA2cnoEMAju zuerst lesen
(`action: "read"`) und aktualisieren, sonst eine neue private anlegen (nie
freigeben). Inhalt: Kennzahlen, Ausreißer oben (neu zuerst), je Ausreißer
das Bild hell/dunkel dieser Woche und daneben das der Vorwoche; darunter alle
Oberflächen als Kontaktbögen je Kategorie. Bilder als Dateien über `files`
(höchstens 255 je Veröffentlichung, 511 je Fassung: Bilder der Kategorie
„Zustände“ weglassen, wenn es zu viele sind). Ist Artifact nicht verfügbar
oder scheitert es, nur im Bericht unter „Ergebnisseite“ vermerken.

## 5. Abschluss

Die Kurz-Zeile des Berichts schickt rundgang-woche.sh aufs iPhone. Zuletzt
die Fertig-Datei (Pfad oben) anlegen.
