# board.md

Aufgabenliste (GitHub-Project „halo.spaces Aufgaben“), Bilder und Apple-Vorlagen: Einzelheiten, aus
`AGENTS.md` „Aufgabenliste“ ausgelagert (Stufe 5 des Stufenplans, 6.11.2026). Die Pflichtregeln
(Board nie öffentlich, Reihenfolge eines Laufs, Status-Pflege, höchstens drei in Arbeit, Zitate erst nach
Zustimmung) stehen weiter in `AGENTS.md`. Wortlaute: `ENTSCHEIDUNGEN.md`.

## Neue Bugs und Wünsche, Bilder

- Neue Bugs/Wünsche aus dem Gespräch sofort und ohne Rückfrage dort als
  Entwurf anlegen (ein Zitat des Maintainers darin erst nach seiner
  Zustimmung, siehe „Zitate erst nach Zustimmung“) (Typ setzen, Status Todo); Screenshots liegen in
  `~/halo-aufgaben/bilder/` (der Maintainer schickt sie mit `halobild <name>`,
  siehe `tests/MAC-MINI.md` Abschnitt 10, und nennt im Gespräch nur den Namen).
  Jeder Screenshot, den der Maintainer einer Sitzung direkt ins Gespräch legt
  – auch ohne Board-Eintrag –, wird von der Sitzung automatisch und ohne
  Rückfrage an `neon-board`, ersatzweise an `neon`, übermittelt und dort unter
  einem sprechenden Namen gespeichert (Bereich, Oberfläche, Besonderheit, z. B.
  `kalender-termin-zusammenfassung-ort`), damit er später wiederzufinden ist
  (Entscheidungen des Maintainers vom 5.11.2026 und 7.11.2026, Wortlaut in
  `ENTSCHEIDUNGEN.md`; Empfänger seit 6.11.2026, siehe „neon erreichen“). Sitzungen auf neon speichern es selbst unter
  `~/halo-aufgaben/bilder/`. Alle anderen (Cloud, Laptop, iPhone, …): **das Bild als eigene Datei
  neben einer minimalen privaten Artifact-Seite** (`Artifact`, nicht freigeben; `files`: `{"name.png": "<Pfad>"}`,
  die Seite zeigt es nur per `<img src="name.png">`; Originaldatei unverändert, nicht verkleinern oder
  umkodieren; bis 15 MB je Datei, größere als Assets mit `asset: true`). **Nie als data:-URI in die Seite und nie als
  base64 in die Nachricht:** `neon-board` müsste dann die ganze Seite lesen, was rund 60.000–70.000 Tokens
  seines Kontexts belegt (Messung vom 7.11.2026, 250 KB-Seite). Die Nachricht an `neon-board` (bzw. `neon`) nennt
  Link, Dateinamen im Artifact, SHA-256, Pixelgröße und den Zielnamen. Es holt die Datei mit `Artifact`
  (`action: "read"`, `path: "name.png"`, nie ohne `path`, nicht WebFetch; speichert lokal, rund 150 Tokens),
  prüft die SHA-256 und legt sie unter `~/halo-aufgaben/bilder/` ab und vermerkt die
  Dateinamen im Eintrag. Nie über das Repo – die Bilder zeigen echte Mails.
  Bildqualität: keine feste Mindestgröße (auch kleine Ausschnitte sind in
  Ordnung); maßgeblich ist, ob die für den Eintrag entscheidenden Details
  (Schrift, Linien, Farben, Abstände) klar erkennbar sind. Das prüft die
  empfangende Sitzung sofort und sagt dem Maintainer gleich im Gespräch,
  was nicht erkennbar ist (mit Pixelgröße), und bittet um eine bessere
  Aufnahme, am besten per `halobild` (die Claude-App verkleinert Bilder
  beim Hochladen teils). neon-board (bzw. neon) prüft nach dem Speichern ebenso, meldet ein
  zu schwaches Bild an die Sitzung zurück (die es weitergibt) und vermerkt
  im Eintrag „Bild unzureichend: …“.
  Ursache klären und Lösungsidee in den Eintrag
  schreiben ist erwünscht – aber nicht mitten in der laufenden Aufgabe
  nebenbei umsetzen und auch nicht anbieten; umgesetzt wird er wie jeder
  Eintrag über die Liste (siehe „Wer die Liste abarbeitet“). Gehört der Punkt zu einem offenen Eintrag, diesen
  ergänzen statt einen neuen anzulegen.

## Apple-Vorlagen

- **Apple-Vorlagen** (Entscheidung des Maintainers vom 5.11.2026): Jeder
  Screenshot einer Apple-App (Mail, Kalender, Kontakte, Erinnerungen,
  Systemeinstellungen, …), den der Maintainer schickt, kommt automatisch
  und ohne Rückfrage zusätzlich als Vorlage für spätere Vergleiche nach
  `~/halo-aufgaben/apple/` auf neon – auch wenn er nur nebenbei im
  Gespräch auftaucht. Weg wie bei den Bildern oben (Sitzungen auf neon
  speichern selbst, alle anderen über eine private Artifact-Seite mit dem Bild als eigene Datei an
  `neon-board`, ersatzweise `neon`;
  Originaldatei unverändert, SHA-256 prüfen, Qualität prüfen und
  melden), vom Laptop mit `haloapple <name>` (`tests/MAC-MINI.md`
  Abschnitt 10). Name `<app>-<oberfläche>[-dunkel]`, klein, mit
  Bindestrichen (z. B. `mail-kontextmenue-mailliste`,
  `kalender-termin-popover-dunkel`); gleicher Name ersetzt die ältere
  Fassung (Index-Zeile mit neuem Datum und Hash). Je Bild eine
  Zeile in `~/halo-aufgaben/apple/index.md`: Name, App, macOS-Version
  (falls bekannt), was zu sehen ist, passende `ui_tour.py`-ids, Datum,
  SHA-256. Nie ins Repo, nie in README oder Store (oft echte Mails).
  Wer Aussehen oder Verhalten gestaltet oder prüft (Einträge aus der
  Liste, Design-Durchsicht mit `ui_tour.py`), schaut zuerst im Index
  nach einer passenden Vorlage und vergleicht damit; fehlt eine, im
  Bericht bzw. Gespräch nennen, welche Vorlage helfen würde.

## Bilder-Erinnerung

- **Bilder-Erinnerung** (Entscheidung des Maintainers vom 5.11.2026,
  Wortlaut in `ENTSCHEIDUNGEN.md`; gilt für jede von Hand gestartete Sitzung zwischen 08:00 und 22:00 täglich): Jede von Hand
  gestartete Sitzung, die zwischen 08:00 und 22:00 (Wiener Zeit) beginnt,
  nennt dem Maintainer in ihrer ersten Antwort die offenen Bilder aus
  `~/halo-aufgaben/bilder-offen.md` – Pflicht zuerst, optional knapp, mit
  fertigen `halobild`-/`haloapple`-Befehlen; leere Liste → nichts. Nie in
  automatischen Läufen (Nachtlauf, Wochen-/Doku-Prüfung, Rundgang,
  CI-Wächter, GitHub-Kommunikation, geplante Aufgaben). Auf neon erscheint die Liste
  beim Start (nicht aus `tests/neon-hook.sh`, Quelle des Hooks nicht geklärt); Cloud- und Laptop-Sitzungen fragen sie zu
  Beginn bei `neon-board` ab, ersatzweise bei `neon` („offene
  Bilderliste?“). Die Liste pflegt neon-board (bzw. neon, wer das Bild
  speichert): neu
  eintragen, wenn ein Eintrag „braucht Bild“, „Bild unzureichend“ oder
  „Vorlage fehlt“ bekommt; austragen, sobald das Bild gespeichert und
  geprüft ist.

## Board: Adresse, Titel, gh-Befehle, Felder

- Board: <https://github.com/users/sruf79/projects/1> (Nummer `1`, Besitzer
  `sruf79`). Die Einträge sind Entwürfe im Board (Draft Issues), keine
  Issues im Repo.
- Titel auf Deutsch im Commit-Stil: `Bereich: kurze Beschreibung`
  (z. B. `Kalender: …`, `Mailliste: …`), Details in den Text.
- Lokal: Zugriff über `gh` mit Scope `project` (auf neon per Homebrew, siehe
  `tests/MAC-MINI.md` Abschnitt 3; `mac-mini-setup.sh --check` prüft die Anmeldung).

```bash
gh project item-list 1 --owner sruf79 --limit 200 --format json      # lesen
gh project item-create 1 --owner sruf79 --title "Bereich: …" --body "…" --format json   # neu, liefert die id
gh project item-edit --project-id PVT_kwHODEPpks4BoBQw --id <id> \
  --field-id <Feld> --single-select-option-id <Option>                 # Typ/Status setzen
```

| Feld | Feld-ID | Optionen |
|---|---|---|
| Typ | `PVTSSF_lAHODEPpks4BoBQwzhmjN8Y` | Feature `39bb4253`, Bug `ff678ae2` |
| Status | `PVTSSF_lAHODEPpks4BoBQwzhmjN5E` | Todo `f75ad846`, In Progress `47fc9ee4`, Wartet auf OK `2327eecc`, Done `98236657` |

## Cloud-Sessions

In Cloud-Sessions ist die GraphQL-API gesperrt, `gh project …` geht dort
nicht – auch nicht mit Token. **Alles am Board – lesen, neu anlegen,
ergänzen, Status ändern, archivieren – geht aus Cloud-Sessions immer über
die Sitzung `neon-board`, ersatzweise `neon`** (Entscheidung des Maintainers
vom 4.11.2026, Empfänger `neon-board` seit 6.11.2026, Wortlaut in
`ENTSCHEIDUNGEN.md`, Weg dorthin: Abschnitt „neon erreichen“). Dort läuft `gh project …` wie lokal, und
neon-board prüft vor dem Anlegen, ob ein offener Eintrag ergänzt werden
sollte. Im
Auftrag nennen, was anzulegen oder zu ändern ist (Titel, Text, Typ, Status
bzw. Eintrag und neuer Status) und was zurückgemeldet werden soll (z. B. die
id); bis zur Antwort nichts als erledigt melden. Entscheidungen des
Maintainers mit Wortlaut und Herkunft schicken, neon-board trägt das Zitat
unverändert ein (Abschnitt „Aufgabenliste“, „Entscheidungen des Maintainers
wörtlich“).

Nur wenn weder neon-board noch neon auf einem Weg erreichbar ist: neue Einträge notfalls über den
Workflow anlegen (läuft auf GitHub, Token im Secret `HALO_SPACES_TASKS_TOKEN`)
und das dem Maintainer sagen; Lesen, Ergänzen und Status ändern erledigt dann
der Maintainer im Board.

In Cloud-Sessions geht `gh` nur für die Suche – den Workflow dort mit dem
GitHub-Werkzeug `actions_run_trigger` starten (Workflow `add-task.yml`,
Eingaben `title`, `body`, `type` = `bug`/`feature`, `status` = `Todo`) und
mit `actions_list` prüfen, ob der Lauf erfolgreich war. Lokal geht es auch so:

```bash
gh workflow run add-task.yml -R sruf79/halo-spaces \
  -f title="Bereich: …" -f body="…" -f type=<bug|feature> -f status=Todo
gh run list -R sruf79/halo-spaces -w add-task.yml -L 1   # Lauf erfolgreich?
```

Das Repo ist öffentlich: Der Workflow schreibt Titel und Text bewusst nicht
ins Log – das beim Ändern beibehalten.
