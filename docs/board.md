# board.md

Aufgabenliste (GitHub-Project „halo.spaces Aufgaben“), Bilder und Apple-Vorlagen: Einzelheiten, aus
`AGENTS.md` „Aufgabenliste“ ausgelagert (Stufe 5 des Stufenplans, 6.11.2026). Die Pflichtregeln
(Board nie öffentlich, Reihenfolge eines Laufs, Status-Pflege, höchstens drei in Arbeit, Zitate erst nach
Zustimmung) stehen weiter in `AGENTS.md`. Wortlaute: `ENTSCHEIDUNGEN.md`.

## Neue Bugs und Wünsche, Bilder

- **Wünsche und Meldungen von Nutzern** (Reddit, Issues, E-Mail, hineinkopiert) nie sofort eintragen:
  erst Einschätzung zu Machbarkeit und Sinn mit Empfehlung, Eintrag erst nach ausdrücklichem OK des
  Maintainers (Entscheidung vom 9.11.2026). Ausnahme: von Nutzern gemeldete Bugs dürfen immer sofort
  eingetragen werden (Entwurf, Todo; Entscheidung vom 10.11.2026), Features und Wünsche nicht.
  **Bug oder Feature (Typ):** Ein Bug ist etwas, das nicht tut, was es nach Beschreibung oder nach der
  Apple-App tun soll, oder einen Fehler, Absturz oder Darstellungsfehler zeigt. Alles andere ist ein
  Feature, auch ein als Bug getarnter Wunsch („wie vorher“, anderes Verhalten gewünscht). Im Zweifel
  Feature: dann erst nach Absprache eintragen (Maintainer in neon, 10.11.2026: „ja“ zum Vorschlag).
- Eigene Bugs/Wünsche des Maintainers aus dem Gespräch sofort und ohne Rückfrage dort als
  Entwurf anlegen (ein Zitat des Maintainers darin erst nach seiner
  Zustimmung, siehe „Zitate erst nach Zustimmung“) (Typ setzen, Status Todo); Screenshots liegen in
  `~/halo-aufgaben/bilder/` mit Index `bilder/index.md` (der Maintainer schickt sie mit `halobild <name>`,
  siehe `tests/MAC-MINI.md` Abschnitt 10, und nennt im Gespräch nur den Namen). `halobild` legt sie
  im Eingang `~/halo-aufgaben/eingang/` ab; `tests/bilder-eingang.zsh` sortiert sie alle 15 Minuten
  ohne Sitzung ein (Hash geprüft, Indexzeile, Zeile in `bilder-offen.md` ausgetragen), die
  Beschreibung ergänzt eine kurze Claude-Sitzung (`tests/MAC-MINI.md` Abschnitt 18). Den Eingang
  nicht von Hand leeren; wer von Hand in `bilder/` oder `apple/` arbeitet, legt solange
  `~/halo-aufgaben/bilder-eingang.sperre` an.
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
  melden), vom Laptop mit `halobild apple-<name>` (`tests/MAC-MINI.md`
  Abschnitt 10; `tests/bilder-eingang.zsh` sortiert aus dem Eingang nach `apple/` ein und legt
  die Indexzeile an, Abschnitt 18). Name `<app>-<oberfläche>[-dunkel]`, klein, mit
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
- **Bildvarianten** (Freigabe des Maintainers 11.11.2026): Für neue Einträge mit sichtbarem Aussehen und ohne
  Apple-Vorlage erstellt die Tagesroutine vor dem Bauen zwei Varianten (A/B) als Bild aus dem Testprofil (keine echten
  Mails; Datei neben einer privaten Artifact-Seite, Link mit Name und SHA-256) und legt sie in den Morgenbrief; der
  Maintainer antwortet „A“ oder „B“. Apple-Vorlage und Vorschaubild vor der Veröffentlichung bleiben wie bisher.

## Bilder-Erinnerung

- **Bilder-Erinnerung** (Entscheidung des Maintainers vom 5.11.2026,
  Wortlaut in `ENTSCHEIDUNGEN.md`; gilt für jede von Hand gestartete Sitzung zwischen 08:00 und 22:00 täglich): Jede von Hand
  gestartete Sitzung, die zwischen 08:00 und 22:00 (Wiener Zeit) beginnt,
  nennt dem Maintainer in ihrer ersten Antwort die offenen Bilder aus
  `~/halo-aufgaben/bilder-offen.md` – Pflicht zuerst, optional knapp, mit
  fertigen `halobild`-Befehlen (Apple-Vorlagen mit Vorsatz `apple-`); leere Liste → nichts. Nie in
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
  (z. B. `Kalender: …`, `Mailliste: …`), Details in den Text. Einträge aus einem
  GitHub-Issue oder Pull Request enden auf „[GitHub #n]“ (z. B.
  `Kalender: Termin verschwindet beim Verschieben [GitHub #42]`, siehe `docs/github-komm.md`).
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

## Archiv und „War das schon einmal da?“

**Done heißt immer auch archivieren** (Entscheidung des Maintainers vom 12.11.2026): `board.sh status <id> done [<Hash>]`
setzt den Status und archiviert gleich mit (der Hash kommt ins Archivverzeichnis); ein Eintrag mit Status Done
und ohne Archivierung bleibt sonst im Board sichtbar. Wer den Status von Hand oder über den Cloud-Weg setzt,
archiviert im selben Zug.

Archivierte Einträge kommen aus der API nicht mehr in der Liste (nur einzeln per id). Deshalb schreibt
`board.sh archiv <id> [<Hash>]` vor dem Archivieren eine Zeile (Datum | id | Typ | Titel | Hash, keine Texte)
nach `~/halo-aufgaben/archiv.md` (nicht im Repo; auch der CI-Wächter schreibt sie). `board.sh suche <Begriff>`
durchsucht offene, Done- und archivierte Einträge (höchstens 10 Zeilen), `board.sh archiv-zeige <id>` holt
Status und Text eines archivierten Eintrags. Vor dem Eintragen eines Bugs mit `suche` prüfen: gibt es Treffer,
dem Maintainer die Titel nennen („War das schon einmal da?“), er entscheidet. Bugs, die schon einmal als behoben
galten und wiederkamen, gehen mit dem Skill `systematic-debugging` an. Ältere Archivierte fehlen im
Verzeichnis (nicht nachgefüllt): dafür `git log --grep`.

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

## Vollständiger Wortlaut aus `AGENTS.md` (Stand 9.11.2026, vor der Kürzung)

Bei der Kürzung von `AGENTS.md` (9.11.2026, Ablauf-Analyse Stufe 5) unverändert hierher verschoben; nur die Überschriften stehen eine Ebene tiefer. Verweise wie „oben“, „unten“ oder „dieser Datei“ meinen das damalige `AGENTS.md`. Die Kurzfassung für jede Sitzung steht im Kern `AGENTS.md`; Wortlaute der Entscheidungen: `ENTSCHEIDUNGEN.md`.

### Aufgabenliste

Bugs und Wünsche führt der Maintainer in einem privaten GitHub-Project
„halo.spaces Aufgaben“ (Konto `sruf79`, Felder Typ = Feature/Bug und Status).
Lokal direkt über `gh project …` (siehe unten); in Cloud-Sessions immer über
die Sitzung `neon-board`, ersatzweise `neon` (Abschnitt „Cloud-Sessions“). Das Board wird nicht
automatisch geladen: erst zu Beginn eines Laufs (nach Schritt 1 der Reihenfolge unten) gezielt abrufen
(`tests/board.sh liste [Muster]` bzw. über `neon-board`). Der SessionStart-Hook auf neon lädt nur die
offenen Aufträge aus `neon-stand.md`.

- Die Liste ist die Vorlage für die Arbeit: offene Einträge berücksichtigen
  und passende Aufgaben nennen – in der Reihenfolge unten.
- **Reihenfolge eines Laufs** (Entscheidung des Maintainers vom 4.11.2026,
  abends; gilt für jede Sitzung, die die Liste abarbeitet, 5.11.2026):
  1. neue bzw. nicht gepushte Commits durchsehen (Regeln dieser
  Datei, offensichtliche Fehler), 2. erst dann die Aufgabenliste laden und
  offene GitHub-Issues/Pull Requests prüfen (siehe „GitHub-Issues und Pull Requests von Nutzern“, `docs/github-komm.md`), 3. Bugs,
  4. einfache Features, 5. zuletzt Reihen (n/m) – Einzelheiten unter
  „Reihenfolge beim Abarbeiten“ (der Nachtlauf-Auftrag wiederholt sie für
  den Lauf; bei Änderungen beide Stellen anpassen).
- **Wer die Liste abarbeitet** (Entscheidung des Maintainers vom 5.11.2026):
  Der Nachtlauf immer von sich aus. Jede andere Sitzung nur, wenn der
  Maintainer sie dazu auffordert (ganze Liste oder einzelne Einträge) – dann
  in der Reihenfolge oben, ohne weitere Rückfrage je Eintrag. Tagsüber dürfen
  so Bugs und Features umgesetzt werden: je Eintrag committen, gepusht wird
  gesammelt am Ende eines Arbeitsblocks (siehe „Testrechner“), veröffentlicht
  nur Dringendes (siehe „Release“) – Entscheidung des Maintainers vom 5.11.2026.
- **Regeländerungen wöchentlich bündeln** (Entscheidung des Maintainers vom
  5.11.2026): Ideen für Abläufe und Regeln dieser Datei sammelt jede Sitzung
  als Eintrag „Ablauf: …“ mit Status „Wartet auf OK“, statt sie gleich
  umzusetzen. Der Maintainer entscheidet sonntags mit der Wochenprüfung; die
  freigegebenen werden dann in einem Commit übernommen. Ausnahme: Sicherheit
  und Datenschutz (sofort). Eine Entscheidung, die der Maintainer im Gespräch
  ausdrücklich trifft, gilt wie bisher gleich.
- **Reihenfolge beim Abarbeiten:** zuerst alle offenen Einträge nach Bereich
  (Titelpräfix) gruppieren und auf Zusammenhänge prüfen – Doppelte
  zusammenlegen; Bugs, die ein Feature ohnehin behebt, an dieses Feature
  hängen (Notiz in beiden Einträgen). Dann **erst alle Bugs,
  danach einfache Features, zuletzt Reihen** (Bugs fixen ist in jedem Lauf
  wichtiger als neue Features): jeweils Bereich für Bereich in der Bereichsfolge (global, Mail, Kalender,
  Adressbuch, Aufgaben, Einstellungen, Chat; Schwere geht vor Bereich, Einträge über 7 Tage offen rücken eine
  Stufe vor, ausdrückliche Wünsche im Gespräch haben Vorrang; Maintainer 11.11.2026, gilt für Nachtlauf und
  Tag), kleine vor
  großen; die nächste Stufe erst, wenn in der vorigen nichts Machbares übrig
  ist; von Reihen n/m nur der nächste Schritt – steht er auf Todo und der
  vorige ist Done, ohne weitere Nennung durch den Maintainer (nur „Wartet auf
  OK“ hält an; Klarstellung vom 5.11.2026, ältere Eintragstexte mit „erst
  nach Nennung“ gelten nicht mehr). Ausnahme: Ein Feature, das
  einen Bug vermutlich mitbehebt, wird zusammen mit ihm erledigt.
  Zusammenhänge und Zusammenlegungen im Gespräch bzw. Bericht nennen.
  Im Nachtlauf plant seit 13.11.2026 ein Director die Reihenfolge nach Nutzen je Aufwand; die Regeln
  hier bleiben sein Rahmen und seine Gleichstand-Regel (`tests/nachtlauf-auftrag.md` Schritt 1a,
  `docs/testrechner.md` „Director“).
- Eigene Bugs/Wünsche des Maintainers (nicht Nutzerwünsche, siehe oben) aus dem Gespräch sofort und ohne Rückfrage als Entwurf anlegen (Typ setzen,
  Status Todo; ein Zitat des Maintainers darin erst nach seiner Zustimmung, siehe „Zitate erst
  nach Zustimmung“). Ursache klären und Lösungsidee in den Eintrag schreiben ist erwünscht, aber nicht
  mitten in der laufenden Aufgabe nebenbei umsetzen und nicht anbieten; umgesetzt wird er wie jeder
  Eintrag über die Liste („Wer die Liste abarbeitet“). Gehört der Punkt zu einem offenen Eintrag,
  diesen ergänzen. Jeder Screenshot, den der Maintainer ins Gespräch legt, geht automatisch an `neon-board`
  (ersatzweise `neon`) und wird dort mit sprechendem Namen gespeichert (7.11.2026); Screenshots von Apple-Apps zusätzlich als Vorlage; Bilder nie über das Repo
  (echte Mails). **Bildübergabe aus Cloud-/Laptop-/iPhone-Sitzungen (Entscheidung des Maintainers vom 7.11.2026):** Bild als eigene Datei
  neben einer minimalen privaten `Artifact`-Seite (`files`), Nachricht an `neon-board` mit Link, Dateiname, SHA-256 und
  Zielname; `neon-board` liest mit `action: "read"` und `path` (rund 150 statt 60.000 Tokens); nie als data:-URI in der
  Seite, nie als base64 in der Nachricht. Qualitätsprüfung, Namen, Einzelheiten: `docs/board.md`.
- **Bilder und Vorlagen** (Freigabe des Maintainers vom 7.11.2026, Wortlaut in `ENTSCHEIDUNGEN.md`):
  auf neon unter `~/halo-aufgaben/`: `eingang/` (unbearbeitet, `halobild` legt hier ab, wird alle
  15 Min. einsortiert), `bilder/` (Bilder zu Board-Einträgen, Index `bilder/index.md`), `apple/`
  (Apple-Vorlagen, Index `apple/index.md`, Name `<app>-<oberfläche>[-dunkel]`). Wer Aussehen oder
  Verhalten gestaltet oder prüft, schaut zuerst in den Index und vergleicht; fehlt eine Vorlage,
  im Bericht bzw. Gespräch nennen, welche helfen würde. Cloud- und Laptop-Sitzungen sehen die
  Ordner nicht und fragen bei `neon-board` (ersatzweise `neon`) nach, nie eigene Pfade. Nie ins
  Repo (echte Mails). Einzelheiten: `docs/board.md`.
- **Bilder-Erinnerung** (Entscheidung des Maintainers vom 5.11.2026): Jede von Hand gestartete Sitzung
  zwischen 08:00 und 22:00 (Wiener Zeit) nennt in ihrer ersten Antwort die offenen Bilder aus
  `~/halo-aufgaben/bilder-offen.md` (Cloud/Laptop: bei `neon-board` erfragen); nie in automatischen
  Läufen. Einzelheiten: `docs/board.md`.
- Bei Arbeitsbeginn Status In Progress; nach dem Commit Notiz mit
  Commit-Hash („committet, wartet auf Push/CI“), Status bleibt In Progress
  (gepusht wird gesammelt, siehe „Testrechner“). Erst wenn der Commit auf
  `main` ist und die CI dazu grün war: Status Done, dann archivieren. Das
  übernimmt, wer pusht und die CI prüft (Nachtlauf, Cloud-Session über
  `neon-board`, ersatzweise `neon`).
  Wird ein Commit bei roter CI zurückgenommen (`git revert`), bleibt der
  Eintrag offen mit Notiz zum Grund. Teilweise Erledigtes bleibt
  In Progress mit Notiz, was fehlt.
- **Höchstens drei Einträge in Arbeit je Sitzung** (Entscheidung des
  Maintainers vom 5.11.2026): gleichzeitig In Progress, an denen gerade
  gearbeitet wird; Einträge mit Notiz „committet, wartet auf Push/CI“ zählen
  nicht mit. Am Ende eines Laufs bzw. einer Sitzung geht, woran nicht mehr
  gearbeitet wird und was nicht committet ist, mit Notiz zum Stand zurück
  auf Todo.
- **Entscheidungen des Maintainers wörtlich** (Entscheidung des
  Maintainers vom 5.11.2026, gilt sofort; der Wortlaut jeder Entscheidung
  steht in `ENTSCHEIDUNGEN.md`, neue Entscheidungen dort eintragen): Jede Sitzung schickt eine
  Entscheidung des Maintainers – nach seiner Zustimmung (siehe nächster
  Punkt) – an `neon-board` (ersatzweise `neon`) bzw. trägt sie selbst ein –
  mit seinem Wortlaut als Zitat und der Herkunft (Sitzung/Titel, Datum),
  keine Umschreibung. Board-Notizen zu Entscheidungen enthalten dieses Zitat
  unverändert. Ein späterer Vermerk darf eine Entscheidung nur ändern oder
  aufheben, wenn er ein neues Zitat des Maintainers mitbringt; sonst
  Rückfrage beim Maintainer. Wer Stände aus dem Board weitergibt (an
  Sitzungen oder den Maintainer), zitiert die Notiz statt sie
  zusammenzufassen; eigene Deutungen als solche kennzeichnen.
- **Zitate erst nach Zustimmung, Konzeptrunden ohne neon** (Entscheidung
  des Maintainers vom 6.11.2026, Sitzung halo-spaces-72, Wortlaut in `ENTSCHEIDUNGEN.md`):
  Während einer Konzeptrunde (Vorschaubilder, Varianten, Zwischenmeinungen)
  geht nichts an neon oder neon-board. Ein Zitat des Maintainers – auch für neue Einträge
  und Entscheidungen – übermittelt eine Sitzung erst, wenn er zugestimmt
  hat (z. B. „ja, so an neon“); dann einmal, wörtlich, mit dem Ergebnis.
  Abfragen von Informationen bei neon bzw. neon-board (Board lesen, Code-Stand, Messungen)
  gehen weiter ohne Rückfrage. Die Bildübergabe (oben) bleibt automatisch.
- Inhalte der Liste nie öffentlich machen: keine Verweise in Commits,
  README, Store-Texten oder öffentlichen Issues.

- Board: <https://github.com/users/sruf79/projects/1> (Nummer `1`, Besitzer `sruf79`), Einträge sind
  Entwürfe; Feld-IDs, `gh project …`-Befehle, Titelform und Zugang aus Cloud-Sitzungen (nur über
  `neon-board`, ersatzweise `neon`; Notweg Workflow `add-task.yml`): `docs/board.md`. Das Repo ist
  öffentlich: den Workflow nie so ändern, dass er Titel oder Text ins Log schreibt.

#### Cloud-Sessions

In Cloud-Sessions geht `gh project …` nicht (GraphQL gesperrt): **Alles am Board – lesen, neu anlegen,
ergänzen, Status ändern, archivieren – geht aus Cloud-Sessions immer über die Sitzung `neon-board`,
ersatzweise `neon`** (Entscheidung des Maintainers vom 4.11.2026, Wortlaut in `ENTSCHEIDUNGEN.md`,
Weg: „neon erreichen“). Im Auftrag nennen, was anzulegen oder zu ändern ist und was zurückgemeldet
werden soll; bis zur Antwort nichts als erledigt melden. Entscheidungen des Maintainers mit Wortlaut
und Herkunft schicken. Notweg ohne neon-board und neon und Einzelheiten: `docs/board.md`.

**neon aus der Cloud steuern:** über die Remote-Control-Sitzung `neon`
(kein SSH, kein Tailscale im Container) – Wege und Ablauf unter „neon
erreichen“. Auftrag vollständig formulieren (Zweig bzw. Commit, Befehl, Port
ab 2850, was zurückgemeldet werden soll); die Regeln aus „Testrechner“
gelten dort unverändert.

**Änderungen direkt nach `main`** (Entscheidung des Maintainers vom
4.11.2026): Cloud-Sessions arbeiten auf ihrem zugewiesenen Zweig, bringen
fertige Arbeit aber ohne Rückfrage selbst nach `main` – kein Pull Request,
kein Merge durch den Maintainer. Ablauf am Ende eines Arbeitsblocks:
`git fetch origin main`, auf `origin/main` rebasen, `git push origin
HEAD:main`; den eigenen Zweig `claude/…` stehen lassen – der Nachtlauf
löscht Zweige `claude/…` ohne eigene Commits über `main` hinaus und ohne
offenen Pull Request (Entscheidung des Maintainers vom 7.11.2026, ersetzt
das Löschen durch die Sitzung vom 5.11.2026). Dabei:

- Gesammelt pushen wie unter „Testrechner“ (je Eintrag committen, einmal am
  Ende pushen).
- Vorher die betroffenen Prüfungen über neon laufen lassen (`--only`, Zweig
  nennen), wenn neon erreichbar und frei ist; sonst ohne und das im Gespräch
  sagen. Den Volllauf macht die CI, Rot meldet der CI-Wächter.
- Push-Sperre 01:30–09:00 und ab 00:00 kein Push mit Codeänderung: wie
  unter „Testrechner“.
- Release: siehe „Release“ (nur auf neon); den Board-Status über
  `neon-board` (ersatzweise `neon`) oder den Maintainer pflegen.
