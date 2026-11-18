# release.md

Release in voller Länge (Ablauf, Marke, Hotfix, `publish.sh`, Bericht, Issues, Store), aus `AGENTS.md` ausgelagert (9.11.2026). Vor jedem Release lesen; `release.sh` und `publish.sh` nur auf neon.

## Höchstens ein Release pro Tag

**Höchstens ein reguläres Release pro Tag** (im Volldampf nicht, Abschnitt „Volldampf“). Was danach fertig wird, wartet auf den nächsten Nachtlauf. Notfall-Release nur bei einem schweren Fehler bei Nutzern. (Freigabe des Maintainers vom 9.11.2026, Wortlaut in `ENTSCHEIDUNGEN.md`; gilt zusätzlich zu „Wann“ unten.)

## Volldampf: mehrere Releases je Tag, Zwischen-Release

Maintainer 17.11.2026 (Wortlaut in `ENTSCHEIDUNGEN.md`): „volldampf bedeutet maximale produktivität. … das betrifft
die anzahl der gleichzeitigen agents, die anzahl der releases, einfach alles.“ und „wir wollen keine defekten
releases veröffentlichen mit nicht funktionalen features von daher sollten die tests weiterhin laufen wie bisher.“

- Nur bei aktiver Volldampf-Zeile (`~/halo-nacht/volldampf.txt`, endet beim Wochenlimit): „Höchstens ein reguläres
  Release pro Tag“ gilt nicht. Der Nachtlauf bleibt bei einem Release je Nacht.
- Dazu (17.11.2026): „nochmals: produktivität steht über allem. ich habe auch kein problem mit 30 releases untertags
  während volldampf läuft solange wir so viel wie möglich abarbeiten können“.
- **Zwischen-Release** über den Wächter `tests/zwischen-schleife.zsh`, von Hand im Hintergrund gestartet (kein
  LaunchAgent): `nohup zsh ~/halo-spaces/tests/zwischen-schleife.zsh >/dev/null 2>&1 &!`; Probe `--trocken`, ein
  Durchgang `--einmal`, anhalten über `pause_setzen zwischen-release <bis> <Grund>` oder Prozess beenden. Alle 5 Minuten:
  Kandidaten sind seit 18.11.2026 alle Prüfzweige `pruef/<name>` (Tagesroutine, Worker, Sammelzweige), je Zweig der
  neueste Stand mit grünem Push-Lauf laut GitHub (Linux-CI, nicht Behauptung), neueste zuerst; übersprungen werden
  Stände schon in `origin/main`, Stände roter Versuche (`~/halo-nacht/zwischen-gesperrt.txt`, auch über Neustarts),
  Stände, die weder Vorfahr von `main` sind noch sich sauber mit `origin/main` mischen lassen (`git merge-tree`;
  Konflikt = kein Release), Diagnose- und Probezweige (Name mit `diagnose`, `flackern`, `probe`) und Stände mit einem
  Commit „nicht nach main“ bzw. „nur Prüfzweig“ in der Nachricht. Fällig ist der erste Kandidat mit mindestens 3
  Thunderbird-Commits über `origin/main` (Kopien per cherry-pick zählen nicht, die Mischung muss Thunderbird ändern);
  **5-Stunden-Fenster ab 85 %** (`kontingent.json`, höchstens 15 Min. alt, sonst `tests/kontingent.sh`; Fensterende
  über `fenster_rest` noch nicht erreicht): **ab 1 Commit**, damit die volle CI samt Windows die Pause der Agenten
  nutzt (Maintainer 18.11.2026: „bei Situationen wie dieser wo wir wieder knapp davor sind das 5h-limit mehrmals am tag
  zu erreichen könnten wir mehrmals ein neues release machen? …“ – „Ja.“). Push-Beginn 09:00–22:30 (danach wartet der Wächter bis 09:00, das Release darf bis 24:00 fertig werden), keine Pause
  `zwischen-release`, nichts belegt (Runner.Worker u. a.). Dann im eigenen Worktree `~/halo-zwischen-release` (Zweig `zr/release`,
  Upstream `origin/main`, `repo.conf` kopiert): `origin/main` hineinmischen, nächste Minor-Version, kurze Claude-Runde
  (README-Commit, Notizdatei), `tests/zwischen-release.zsh` (Push, Push-Lauf und Windows-Lauf grün), dann
  `tests/release-unter-tage.sh --volldampf` mit `NUR_CI=1 ./release.sh` und `./publish.sh` (pusht über den Upstream,
  `push.default=upstream` nur für diesen Aufruf; `HALO_PRUEFZWEIG` = Zweig des Stands, dessen grüner Lauf geprüft wird). Abstand zwischen Releases = Dauer von CI und Windows. Rot: kein
  Release, derselbe Stand erst wieder nach einem neuen grünen Stand; Protokoll `~/halo-nacht/<datum>-zwischen-schleife.log`.
- **Rot erst nach Wiederholung, jedes Ergebnis an neon** (18.11.2026, nach dem Zwischen-Release 3.31.0, das um 11:25 an
  einem Flackerer scheiterte, ohne zweiten Versuch und ohne Meldung): `tests/zwischen-release.zsh` wiederholt einen roten
  Push- oder Windows-Lauf vor dem Urteil ROT einmal (`gh run rerun --failed`, dann bis 100 bzw. 60 Minuten warten); nur ein
  zweites Rot sperrt den Stand. Keine Wiederholung bei mehr als 5 roten Prüfungen in einem Job (echter Fehler), vor 09:00 und
  nach 23:00 (Release bis 24:00; gemeinsame Startgrenze 09:00 bis 00:00 mit `tests/ci-wiederholen.sh`). Gestartet und
  ausgewertet wird über `ci-wiederholen.sh --lauf` (Zeilen in `~/halo-nacht/flackern.log`, Hinweis an neon beim zweiten
  Flackern derselben Prüfung in 7 Tagen), ohne das Skript direkt mit `gh run rerun --failed`; hat schon jemand wiederholt (`tests/ci-wiederholen.sh` über den CI-Wächter, Versuch ≥ 2), wartet
  es nur auf diesen Versuch. Der Wächter meldet **jedes Ergebnis** (veröffentlicht, ROT nach Wiederholung, ABBRUCH, Fehler
  nach dem Tag, fälliger Stand über 60 Minuten belegt) an die Sitzung **neon**, nicht aufs iPhone (Maintainer 18.11.2026:
  „ich möchte hier nicht involviert und informiert werden. der wächter soll solche probleme direkt an dich wenden und du
  kümmerst dich um die nächsten schritte automatisch.“): `an_neon` in `tests/lauf-hilfen.zsh` (Zustellweg wie `push()`,
  Haiku mit SendMessage an den Namen `neon`, ohne „PUSH:“). Nachricht ab „[zwischen-release] <Ergebnis>: Version, Stand,
  Zweig“, Zeile „Läufe:“, je rote Prüfung eine Zeile „- <Job>: <Prüfung>“, „Wiederholung: ja …|nein: <Grund>“, „neon
  kümmert sich.“ Dazu je Ergebnis eine Zeile in `~/halo-nacht/zwischen-ergebnis.txt` (`tail -1` genügt):
  `<Zeit> | <Version> | <Stand> | <Zweig> | <Ergebnis> | <Läufe> | <rote Prüfungen bzw. Grund> | Wiederholung <…>`. Nur wenn
  neon nicht erreichbar ist (Zeile `AN-NEON-FEHLER` in `~/halo-nacht/uebersprungen.log`), einmal `push()` aufs iPhone
  „Wächter konnte neon nicht erreichen“. Prüfung: `zsh tests/zwischen_schleife_test.zsh`. Der laufende Wächter übernimmt
  Änderungen an `zwischen-schleife.zsh` erst nach einem Neustart; `zwischen-release.zsh` wird je Release neu gelesen.
- **Worktree statt Checkout:** `~/halo-spaces` wird nie angefasst (kein stash, reset, checkout, merge), fremde
  ungespeicherte Arbeit stört nicht. Nur Committetes wird veröffentlicht. Den Checkout gleicht der Nachtlauf ab
  (`git rebase origin/main`; die Commits von main sind dann schon in `origin/main`). Weiter gilt `belegt()`: eine
  andere arbeitende Claude-Sitzung, CI, Testlauf oder Marionette-Port lässt den Wächter warten.
- Unverändert: grüne Tests samt Windows und Testmarke als einzige Bedingung, Push-Sperre 01:30–09:00, ab 00:00
  kein Push, Notfall- und Hotfix-Regeln, Hooks.

## Release unter Tage nach fehlgeschlagenem Nachtlauf

Maintainer 15.11.2026 (Wortlaut in `ENTSCHEIDUNGEN.md`): „der direktor soll bitte ab sofort bei fehlgeschlagenen
nachtläufen selbst entscheiden, ob die commits und änderungen des fehlgeschlagenen nachtlaufs so wichtig sind dass
diese aufgrund des fehlgeschlagenen nachtlaufs einen release unter tage rechtfertigen“; dazu: „wenn der
fehlgeschlagene release des nachtlaufs wichtig genug ist damit es am tag dennoch released wird sollte der wunsch
des direktors im morgenbericht stehen damit ich es weiss“.

- **Nachtlauf** (ohne Release): eine Zeile im Bericht unter „## Release“, feste Anfangsworte für den Morgenbrief:
  `Release unter Tage: Wunsch ja – <Grund>` bzw. `Release unter Tage: Wunsch nein – <Grund>`. Er löst nichts aus.
- **Tagesroutine**, nur erste Plan-Runde: `tests/release-nachtlauf-gescheitert.sh` (ohne Sprachmodell) meldet
  `ja <Grund>` (Bericht „Kurz:“ mit „kein Release“, oder kein Release an dem Tag trotz Thunderbird-Änderungen) oder
  `nein <Grund>`. Bei „ja“ entscheidet der Director endgültig nach den Kriterien unten, begründet in Bericht und
  Plan-Datei (Abweichung vom Wunsch mit Grund) und veröffentlicht nur über `tests/release-unter-tage.sh` (Ablauf
  Schritt für Schritt: `tests/tagesroutine-auftrag.md` „Release unter Tage“).
- **Bedingungen unverändert, vom Skript erzwungen:** 09:00–22:00, höchstens ein Release pro Tag, nichts belegt
  (Runner.Worker, Testlauf, andere Sitzung, Ungespeichertes, Nachtlauf), lokale Commits über `origin/main` ohne
  Thunderbird-Änderung, README-Commit „What's new in x.y.z“, Notizdatei; dann `NUR_CI=1 ./release.sh` (Marke nur
  bei vollständig grüner CI samt Windows, keine eigenen Tests als Ersatz) und `./publish.sh`. Rot oder Marke fehlt:
  kein Release, Grund im Bericht, Eintrag „Tests: …“ (vorhanden oder neu).

### Release unter Tage: Kriterien

Gemeinsame Liste für den Wunsch des Nachtlaufs und die Entscheidung der Tagesroutine. **Ja**, wenn unter den
Commits seit dem letzten Release mindestens einer davon ist: Fehlerkorrektur für einen von Nutzern gemeldeten Bug
(„(GitHub #n)“); Absturz, Datenverlust oder hängende Oberfläche; Sicherheit oder Datenschutz; eine spürbare
Verbesserung, die Nutzer täglich merken. **Nicht** (allein kein Grund): reine Ablauf-, Doku-, Test- oder
Code-Aufräum-Änderungen; kleine Design-Feinheiten; Unfertiges oder Arbeit, die auf einem Paketzweig wartet
(Lichtschein und Kachel nur zusammen, `ENTSCHEIDUNGEN.md` 14.11.2026). Im Zweifel nein: der nächste Nachtlauf
veröffentlicht ohnehin.

## Rote Änderung auf einen Nebenzweig (Maintainer 18.11.2026)

Ist eine Prüfung für ein Release rot, wird erst belegt, ob es eine Regression ist (Wiederholung, Gegenprobe mit dem letzten Release, Bisect). Ein belegter, sauber trennbarer Verursacher (Revert ohne Konflikte, Funktion und Test zusammen) kommt auf einen Nebenzweig; der Rest wird als neuer Stand mit voller CI, Windows und neuer Testmarke veröffentlicht, README und Notizen werden neu geschrieben, ein Board-Eintrag hält die Wiederaufnahme fest. Steht der Fehler schon im letzten Release oder hängt er an der Umgebung, wird er mit `check(…, bekannt=True)` samt Board-Eintrag festgehalten oder behoben. Je öfter derselbe Commit rot wird und auf einem Nebenzweig landet, desto höher das untersuchende Modell, immer mit Skill `systematic-debugging` (1. Opus, 2. und 3. Fable nach den Grenzen aus „Rot bleibt rot“, danach Übergabe an den Maintainer). Nie die Sperre umgehen.

## Pull Requests nach dem Release schließen

Nach dem Schließen der Issues ruft `publish.sh` `tests/pr-schliessen.sh <version>` auf: Es schließt nur
offene PRs mit Eintrag in `tests/pr-freigaben.txt`, deren Issue-Fix „(GitHub #n)“ im Release liegt
(Dank-Kommentar, kein Merge), verschiebt die Zeile nach `tests/pr-freigaben-erledigt.txt` und committet
beide Listen lokal (der nächste Push nimmt sie mit). Alles andere (nicht in der Liste, ohne Issue,
„hold“, schon zu, Kandidaten mit „Closes #n“) steht nur im Bericht; Fehler stehen dort als „FEHLER“ und
halten das Release nicht auf. Probe ohne Änderung: `./publish.sh --trocken x.y.z` bzw.
`zsh tests/pr-schliessen.sh x.y.z --trocken`; Test ohne Netz: `zsh tests/pr_schliessen_test.zsh`
(Entscheidung vom 9.11.2026, `ENTSCHEIDUNGEN.md`).

## Vollständiger Wortlaut aus `AGENTS.md` (Stand 9.11.2026, vor der Kürzung)

Bei der Kürzung von `AGENTS.md` (9.11.2026, Ablauf-Analyse Stufe 5) unverändert hierher verschoben; nur die Überschriften stehen eine Ebene tiefer. Verweise wie „oben“, „unten“ oder „dieser Datei“ meinen das damalige `AGENTS.md`. Die Kurzfassung für jede Sitzung steht im Kern `AGENTS.md`; Wortlaute der Entscheidungen: `ENTSCHEIDUNGEN.md`.

### Release (selbstständig auf neon)

```bash
./release.sh 3.1.0              # Version, update_url, Tests hell (dunkel bei Farben), updates.json, Testmarke
./publish.sh 3.1.0 notes.md     # Sperre prüfen, commit, push, GitHub-Release, Hash- und Update-Prüfung, Bericht
```

**Wann:** Jede Sitzung darf ohne Rückfrage veröffentlichen – auch
unbeaufsichtigt nachts (Entscheidung des Maintainers vom 2.11.2026: schlechte
Releases werden mit einem neuen Update nach vorn korrigiert, Thunderbird stuft
nicht zurück). Sie entscheidet selbst, ob ihre Änderungen groß genug für ein
eigenes Release sind (z. B. ein Bug, den Nutzer spüren, oder eine neue
Funktion). Wenn nicht, bleibt es beim Commit: Der nächste Nachtlauf
veröffentlicht alle noch nicht veröffentlichten Bugs und Features
automatisch, sobald die CI dazu grün ist (Entscheidung des Maintainers vom
5.11.2026). Tagsüber (außerhalb des Nachtlaufs) veröffentlicht eine
Sitzung nur, was Nutzer gerade spüren (Fix für einen gemeldeten oder
spürbaren Bug); alles andere geht ins Release des Nachtlaufs (Entscheidung
des Maintainers vom 5.11.2026). Ablauf: Versionshinweise im `README.md` schreiben (eigener
Commit „README: Versionshinweise x.y.z“), Notizen für den GitHub-Release als
Datei (englisch, gleicher Inhalt), `./release.sh x.y.z`, bei grünen Tests
direkt `./publish.sh x.y.z notes.md`. Version: Patch für Korrekturen, Minor
für neue Funktionen. Kleine Einzelkorrekturen (Abstände, Farben, Tests)
lohnen meist kein eigenes Release. `release.sh` und `publish.sh` laufen
**nur auf neon**, nie auf dem Laptop oder in Cloud-Sessions – die
beauftragen dafür neon (nach dem Push). Ausnahme: Notfall-Release nach `docs/notfall.md`
(startet und gibt nur der Maintainer von Hand frei, nie eine Sitzung).

**Einzige Bedingung: grüne Tests.** `release.sh` schreibt nur dann die Marke
`dist/release-<version>.ok` (Version, Hash des Pakets, gelaufene Tests, ob
dunkel lief), wenn hell (und ggf. dunkel) grün waren – oder die CI denselben Stand vollständig
grün getestet hat (Linux mit Beta und `mac` im Push-Lauf, `windows` im eigenen Lauf von Hand
`ziel=windows` zum selben oder einem späteren Stand ohne Thunderbird-Änderung; Linux und `mac` grün
ohne grünen Windows-Lauf heißt kein Release; dann werden die Tests
übersprungen, solange seitdem nichts geändert wurde, was Thunderbird direkt
betrifft (`tests/ci-noetig.sh`, siehe „CI nur für Thunderbird“); `FORCE_TESTS=1` testet trotzdem). Bei einem
Testfehler setzt `release.sh` Manifest und `updates.json` zurück und bricht
ab. `publish.sh` veröffentlicht ohne passende Marke nicht. `SKIP_TESTS=1`
ist nur zum Ausprobieren – ohne Marke kein Release.
Die Sperre nicht umgehen; ist ein Test rot, erst beheben.
**Hotfix** (Entscheidung des Maintainers vom 4.11.2026): nur auf seine
ausdrückliche Anweisung und nur für dringende Korrekturen ohne Änderung am
Aussehen `HOTFIX="<Muster der betroffenen Prüfungen>" ./release.sh x.y.z` –
testet nur diese Prüfungen (hell), die Marke vermerkt „Hotfix“; die CI zum
Push testet danach vollständig, Rot wird nach vorn korrigiert.

`publish.sh` committet nur `extension/manifest.json`, `updates.json` und ggf.
`README.md`; andere geänderte oder neue Dateien bleiben draußen (Warnung).
Danach prüft es den Download von GitHub (Hash) und die `updates.json`, die
Thunderbird über `update_url` abruft (neue Version, Hash, Download-Adresse) –
schlägt das fehl, meldet es laut „FEHLER“, Exitcode 1: dann sofort klären,
sonst bekommen Nutzer das Update nicht. Am Ende liegt ein Bericht in
`~/halo-berichte/<datum>-halo.spaces-<version>.md` (Version, Neues/Behobenes,
Tests, Veröffentlichung, Store-Upload); den Bericht im Gespräch bzw. als
Morgenbericht kurz zusammenfassen.

Zwischen `release.sh` und `publish.sh` darf nicht neu gebaut werden, sonst
passt der Hash nicht mehr (Marke und `updates.json`) und Thunderbird lehnt
das Update ab. Danach die behobenen GitHub-Issues mit „Fixed in x.y.z“
schließen (siehe unten). `store/max-version` mit neuen Thunderbird-Versionen
anheben (nach Test).
