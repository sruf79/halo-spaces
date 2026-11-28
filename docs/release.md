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
  zu erreichen könnten wir mehrmals ein neues release machen? …“ – „Ja.“). **Nur Spürbares** (Maintainer 20.11.2026,
  `ENTSCHEIDUNGEN.md` „Zwischen-Releases nur für Spürbares“): zusätzlich muss seit dem letzten Tag mindestens ein Commit
  unter `extension/` oder `chrome/` eine Nachricht mit Absturz, Datenverlust, Crash, Notfall oder
  „dringend“ haben (ein „(GitHub #n)“ allein reicht nicht mehr, Maintainer 21.11.2026) (`spuerbar`, Muster `SPUERBAR`); sonst wartet der Wächter mit Logzeile und der Nachtlauf nimmt es mit. Seit
  21.11.2026 urteilt daneben ein Director (Opus) nach „Release am Tag: Kriterien“, zuerst im Schattenbetrieb: die Wortliste
  entscheidet weiter und ist der Rückfall, bis der Maintainer den Wechsel freigibt (Abschnitt „Zwischen-Release: Urteil des
  Directors“ unten).
  Nur auf ausdrücklichen Wunsch des Maintainers: Wächter mit `ZWISCHEN_ERZWINGEN=1` starten. Push-Beginn 09:00–22:30 (danach wartet der Wächter bis 09:00, das Release darf bis 24:00 fertig werden), keine Pause
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

### Release am Tag: Kriterien

Eine gemeinsame Liste für alle Releases am Tag: den Wunsch des Nachtlaufs („Release unter Tage: Wunsch …“), die
Entscheidung der Tagesroutine über das Release unter Tage und das Urteil des Directors über ein Zwischen-Release im
Volldampf (`tests/zwischen-director-auftrag.md`). Maintainer 21.11.2026 (`ENTSCHEIDUNGEN.md` „Director statt Wortliste
für Zwischen-Releases …“): „Ansonsten folge ich den fable Empfehlungen“; die Liste ist die geschärfte Fassung aus dem
Bericht `~/halo-berichte/2026-11-21-director-zwischenrelease.md`.

**Ja** nur, wenn mindestens ein Commit seit dem letzten Release unter `extension/` oder `chrome/` einen Fehler behebt,
**den es in der zuletzt veröffentlichten Version gibt**, und der Fehler eines davon ist:

1. Absturz, Datenverlust, hängende oder unbenutzbare Oberfläche;
2. Mail-Grundfunktion gestört (lesen, schreiben, senden, suchen, Ordner, Konten, Anhänge);
3. Sicherheit oder Datenschutz;
4. ein Bedienelement oder eine Anzeige ist für alle Nutzer einer Plattform blockiert, oder derselbe Fehler wurde von
   mehreren Nutzern unabhängig gemeldet (Maßstab vom 13.11.2026).

**Nein** (allein kein Grund): eine Einzelmeldung mit kleinem Fix, auch mit „(GitHub #n)“ (ein „(GitHub #n)“ allein
genügt nie, Maintainer 21.11.2026, auch nicht für das Release unter Tage); Tastenkürzel, Optik und Design-Feinheiten;
neue Funktionen; Ablauf-, Doku-, Test- oder Code-Aufräum-Änderungen; Fehler, die es in keiner veröffentlichten Version
gab; Unfertiges oder Arbeit, die auf einem Paketzweig wartet (Lichtschein und Kachel nur zusammen, `ENTSCHEIDUNGEN.md`
14.11.2026). **Im Zweifel nein:** der nächste Nachtlauf veröffentlicht ohnehin.

Grenzen: Ein Release am Tag läuft immer mit vollen Tests samt Windows und Testmarke (`NUR_CI=1 ./release.sh` über
`tests/release-unter-tage.sh`); nie `HOTFIX`, `SKIP_TESTS`, `FORCE_TESTS` oder eine Marke von Hand. Das
**Notfall-Release** (`notfall-release.yml`, Hotfix) verordnet und startet allein der Maintainer (21.11.2026: „Ich alleine
sollte die Notwendigkeit eines Notfall releases verordnen.“); kein Director und keine Sitzung löst es aus oder verordnet
es, ein Director darf im Bericht nur auf einen möglichen Notfall hinweisen.

### Zwischen-Release: Urteil des Directors (21.11.2026)

- Im Volldampf fragt `tests/zwischen-schleife.zsh` statt (später) der Wortliste `SPUERBAR` einen Director (`claude -p
  --model opus`, nur lesend: nur `git log/show/diff`, `gh issue view/list`, Read, Grep, Glob; Modus `dontAsk`; höchstens 10
  Minuten), sobald alle Tatsachen stimmen (Volldampf, 09:00–22:30, keine Pause, grüner Stand auf einem Prüfzweig, mischbar,
  genug Thunderbird-Commits). Auftrag: `tests/zwischen-director-auftrag.md`. Ausgabe genau eine Zeile `ja <Commit>
  <Kriterium 1–4> <Satz>` oder `nein <Satz>`, dazu höchstens `LEHRE:` und `NOTFALL-HINWEIS:`.
- **Zweiter Schlüssel im Skript:** Der Commit muss im Stand liegen, nach dem letzten Tag kommen und `extension/` oder
  `chrome/` ändern, das Kriterium 1–4 sein; sonst gilt „nein (Beleg ungültig)“. Nach Kriterium 4 höchstens ein
  Zwischen-Release je Tag (`ZS_K4_MAX`).
- **Sparen:** Ein Urteil gilt je Schlüssel (Menge der Commits unter `extension/`/`chrome/` seit dem letzten Tag): derselbe
  Stand und ein Stand ohne neuen Commit dort werden nicht neu beurteilt. Höchstens `ZS_URTEIL_MAX` (6) Director-Aufrufe je
  Tag; kein Aufruf ab 5-Stunden-Fenster `ZS_URTEIL_FENSTER` (95 %) oder im Trockenlauf; anhalten: Modus `aus` (die Pause
  `zwischen-release` hält den ganzen Wächter an).
  `ZWISCHEN_ERZWINGEN=1` (nur der Maintainer) braucht kein Urteil.
- **Schattenbetrieb (Start, Maintainer-Freigabe für den Wechsel offen):** Modus aus `ZS_URTEIL` bzw. erstes Wort von
  `~/halo-nacht/zwischen-urteil-modus.txt` (je Takt gelesen, kein Neustart nötig), Standard `schatten`: der Director urteilt
  und protokolliert, entscheiden tut die Wortliste. `an`: der Director entscheidet, bei Ausfall (Fehler, Zeitgrenze,
  Tagesgrenze, Kontingent) die Wortliste. `aus`: nur die Wortliste. Umschalten auf `an` nur mit dem Wort des
  Maintainers.
- **Protokoll:** je Urteil eine Zeile in `~/halo-nacht/zwischen-urteil.txt`: `<Zeit> | <Stand> | <Zweig> | <Modus> |
  <ja|nein|ausfall> | <Commit> | <Kriterium> | <Satz> | wortliste <ja|nein> | quelle <director|gemerkt|…> | schlüssel <…>`.
  Ein „nein“ geht nicht an neon. Der Morgenbrief zeigt „Zwischen-Releases: n veröffentlicht, Director x ja, y nein …“, ein
  `NOTFALL-HINWEIS` erscheint dort als Punkt für den Maintainer (nur er verordnet ein Notfall-Release).
- **Gedächtnis:** `~/halo-nacht/zwischen-director-gedaechtnis.md` (außerhalb des Repos). Der Director liest es; er
  schreibt nichts, seine `LEHRE:`-Zeile trägt das Skript mit Datum und Ablauf (30 Tage) ein, höchstens 40 Zeilen.
  Korrekturen des Maintainers trägt neon dort ein. Regeländerungen nur als Vorschlag im Bericht.
- Prüfung: `zsh tests/zwischen_schleife_test.zsh`.

## Release aus eigenem Worktree (Umbau P5, Probebetrieb)

Maintainer 27.11.2026 „ja ja“ (Sammelfrage S5, `ENTSCHEIDUNGEN.md`). Standard bleibt der Aufruf in `~/halo-spaces` auf `main`;
der neue Weg nur mit dem Schalter `HALO_RELEASE_WORKTREE=1`, bis ein Release aus dem Worktree gelang (Stufe C).
- `zsh tests/release-worktree.zsh anlegen <version>`: `git fetch`, Worktree `~/halo-release-<version>` (Zweig `rel/<version>`,
  Upstream `origin/main`) auf `origin/main`, `repo.conf` kopiert; `~/halo-spaces` bleibt unberührt, dessen lokale Commits
  und Ungespeichertes kommen nicht mit. Dort README-Commit, dann `HALO_RELEASE_WORKTREE=1` vor `release.sh`, `publish.sh`
  bzw. `tests/release-unter-tage.sh`.
- Mit Schalter prüfen alle drei `tests/release-worktree.zsh pruefen` (eigener Worktree, nicht `main`, Upstream `origin/main`,
  darüber nichts für Thunderbird, nichts Ungespeichertes; `publish.sh` erlaubt nur die Release-Dateien) statt „Zweig main“;
  `publish.sh` pusht über den Upstream. Unverändert: Testmarke, `NUR_CI`, Windows, Zeitfenster, Push-Sperre, ein Release pro Tag.
- Prüfung (Wegwerf-Repo, Attrappen für gh und curl, kein Netz): `zsh tests/release_worktree_test.zsh`.

## Rote Änderung auf einen Nebenzweig (Maintainer 18.11.2026)

Ist eine Prüfung für ein Release rot, wird erst belegt, ob es eine Regression ist (Wiederholung, Gegenprobe mit dem letzten Release, Bisect). Ein belegter, sauber trennbarer Verursacher (Revert ohne Konflikte, Funktion und Test zusammen) kommt auf einen Nebenzweig; der Rest wird als neuer Stand mit voller CI, Windows und neuer Testmarke veröffentlicht, README und Notizen werden neu geschrieben, ein Board-Eintrag hält die Wiederaufnahme fest. Steht der Fehler schon im letzten Release oder hängt er an der Umgebung, wird er mit `check(…, bekannt=True)` samt Board-Eintrag festgehalten oder behoben. Je öfter derselbe Commit rot wird und auf einem Nebenzweig landet, desto höher das untersuchende Modell, immer mit Skill `systematic-debugging` (1. Opus, 2. und 3. Fable nach den Grenzen aus „Rot bleibt rot“ in `docs/neon-sitzung.md` Schritte 0–6, danach Übergabe an den Maintainer). Nie die Sperre umgehen.

Jede Rücknahme eines Commits wegen einer roten Release-CI ist ein Nebenzweig-Fall, auch wenn danach der Rest veröffentlicht wird und das Release also nicht mehr gesperrt ist (19.11.2026, Bericht `~/halo-berichte/2026-11-19-rot-regel.md`). Sie läuft immer über `zsh tests/rot-nebenzweig.sh --lauf <Lauf-ID>` (bzw. `--pruefung "<Name>"`), nie von Hand: Das Skript ordnet die roten Prüfungen dem Commit zu, der sie in `tests/halo_test.py` ändert (genau einer, sonst `ZWEIFEL` und nichts zurückgenommen; mit belegter Ursache `--commit <Hash>`), nimmt ihn auf main zurück, legt ihn als eigenen Commit auf `pruef/rot-<Karte>` (ohne Karte `pruef/rot-<Hash>`; `tests/aufraeumen.sh` lässt den Zweig stehen, bis er nach main zurückkommt), zählt ihn mit `rot_eintragen` (Schlüssel Board-Karte, ersatzweise `patch:<git patch-id>`, ältere Hash-Zeilen zählen mit), schreibt die Notiz an die Karte, setzt sie auf Todo (eine Karte mit Status „Pausiert“ behält ihn, nur Notiz und Zeile „HINWEIS“) und gibt „Modellstufe: …“ aus; `--probe` zeigt nur. Danach meldet `tests/nachtlauf.sh` neue Zweige `pruef/rot-*` mit der Modellstufe an neon und warnt im Bericht vor Reverts der Nacht ohne Zählerzeile; die Tagesroutine plant die Untersuchung als ersten Eintrag, auch nach einem Release. Test: `zsh tests/rot_nebenzweig_test.zsh`.

## Pull Requests nach dem Release schließen

Nach dem Schließen der Issues ruft `publish.sh` `tests/pr-schliessen.sh <version>` auf: Es schließt nur
offene PRs mit Eintrag in `tests/pr-freigaben.txt`, deren Issue-Fix „(GitHub #n)“ im Release liegt
(Dank-Kommentar, kein Merge), verschiebt die Zeile nach `tests/pr-freigaben-erledigt.txt` und committet
beide Listen lokal (der nächste Push nimmt sie mit). Alles andere (nicht in der Liste, ohne Issue,
„hold“, schon zu, Kandidaten mit „Closes #n“) steht nur im Bericht; Fehler stehen dort als „FEHLER“ und
halten das Release nicht auf. Probe ohne Änderung: `./publish.sh --trocken x.y.z` bzw.
`zsh tests/pr-schliessen.sh x.y.z --trocken`; Test ohne Netz: `zsh tests/pr_schliessen_test.zsh`
(Entscheidung vom 9.11.2026, `ENTSCHEIDUNGEN.md`).

## Board nach dem Release (Maintainer 18.11.2026)

Auftrag des Maintainers (18.11.2026): „bitte hier einen opus oder fable agenten einen automatismus für das
automatische schliessen von tasks nach einem release erstellen lassen“. Als letzten Schritt ruft `publish.sh`
`tests/board-nach-release.zsh <version>` auf (alle Release-Wege enden dort: Nachtlauf, Release unter Tage,
Zwischen-Release). Es liest das Board einmal und ordnet die Commits `v<vorheriges Tag>..v<version>` offenen
Einträgen zu, nur über den Commit-Hash in einem „committet“-Absatz der Notizen (auch derselbe Patch nach einem
Rebase) und über „(GitHub #n)“ im Commit gegen „GitHub #n“ im Titel, nie über Textähnlichkeit. Treffer bekommen
die Notiz „erledigt in vX.Y.Z (<Hash>), automatisch geschlossen“ und `board.sh status <id> done <Hash>` (archiviert
mit). Nie geschlossen: „Wartet auf OK“ (unberührt), Reihen n/m (nur Notiz „Schritt n in vX.Y.Z enthalten“) und
Zweifel (Teil-Fix „teilweise“, Revert, Status Todo, offener Rest oder Rückfrage ab dem Treffer, neuere Arbeit
ohne Release-Hash): diese stehen mit Datum, Version, Eintrag und Grund in
`~/halo-aufgaben/board-nach-release-zweifel.md`, der Morgenbrief nennt ihre Zahl. Board nicht lesbar oder
Schreiben gescheitert: nichts bzw. nur Fehlendes nicht geschlossen, Meldung an neon (`an_neon`); das Release
scheitert daran nie. Idempotent (zweiter Lauf tut nichts). Probe ohne Änderung:
`zsh tests/board-nach-release.zsh --probe x.y.z` (auch in `./publish.sh --trocken x.y.z`); Test ohne Netz:
`zsh tests/board_nach_release_test.zsh`.

**Design-Einträge zur Abnahme** (Maintainer 18.11.2026: „wir folgen den empfehlungen des opus agenten“): Steht in einer Notiz „zur Abnahme“ (der Designer schreibt es beim Commit) und danach kein „abgenommen“ (Groß-/Kleinschreibung egal), ist der Eintrag trotz Hash-Treffer ein Zweifel und wird nicht geschlossen. Die Frist von 7 Tagen läuft ab dem Datum in der Notiz, sonst ab dem ersten Auftreten im Zweifel-Protokoll; danach steht „Abnahme überfällig: <Titel>, seit <Datum>“ im Morgenbrief. Mit „abgenommen“ (Designer, Maintainer oder automatische Abnahme) gilt der Treffer wie sonst, auch wenn der Commit in einem früheren Release steckt (Notiz „erledigt bis vX.Y.Z (<Hash>, nach Abnahme), automatisch geschlossen“). Das ist nur eine Markierung, keine neue Regel „Abnahme vor Done“.

**Automatische Abnahme** (Maintainer 20.11.2026, neon-Sitzung: „Nein wir brauchen hier eine automatische abnahme nach jedem release. Kümmer dich darum und beauftrage alle tasks auf der liste zu prüfen und abzunehmen was offen ist“): Nach `board-nach-release.zsh` startet `publish.sh` abgekoppelt `tests/abnahme-nach-release.zsh --hintergrund <version>` (publish.sh wartet nicht; Zeile im Release-Bericht; `./publish.sh --trocken` zeigt nur `--probe`). Das Skript wählt ohne Claude die offenen Einträge mit „zur Abnahme“ ohne spätere „abgenommen“ oder „Abnahme: Mangel“, deren Commits alle in v<version> oder früher stecken, wartet auf 09:00–23:00, freies neon (CI, Testlauf, Release) und das Kontingent (`kontingent.sh` höchstens stündlich; Woche ab 98 %: aufs nächste Release verschoben; 5-Stunden-Fenster ab `FUENF_STUNDEN_MAX`, im Volldampf Drosselstufe 3, sonst mehr als `SPAR_MAX` über dem Soll: warten, höchstens 18 Stunden), legt eine Arbeitskopie am Release-Stand an und lässt Opus mit `tests/abnahme-auftrag.md` urteilen (Maßstab des Designers, Gedächtnis `~/halo-nacht/abnahme-gedaechtnis.md`). Das Skript schreibt die Notizen („abgenommen …“, „Abnahme: Mangel – …“ mit Status Todo), Geschmacksfragen nach `~/halo-aufgaben/abnahme-maintainer.md` (Morgenbrief, [handeln]) und schließt Abgenommenes gleich mit `board-nach-release.zsh --nur-abgenommen <version>` (ohne Zweifel-Zeilen). Nie Done ohne Abnahme, nie Code, nie Push; Board nicht lesbar: nichts tun, Meldung an neon. Pause „abnahme“ in `pausen.txt`. Protokoll `~/halo-nacht/abnahme-nach-release.log`, Bericht `~/halo-berichte/<datum>-abnahme-v<version>.md`. Test: `zsh tests/abnahme_nach_release_test.zsh`.

**Aufräumen nach dem Release** (Maintainer 21.11.2026, Sitzung neon: „wir brauchen einen automatismus der nach jedem release erneut mit einem opus agenten durch alle einträge auf dem board geht und schliesst was geht“): Nach der Abnahme startet `publish.sh` abgekoppelt `tests/aufraeumen-nach-release.zsh --hintergrund <version>` (Zeile im Release-Bericht; `./publish.sh --trocken` zeigt die Summe aus `--probe`). Eigenes Skript statt Erweiterung der Abnahme: die Abnahme urteilt mit dem Maßstab des Designers und eigenen Bildern über wenige Design-Einträge, das Aufräumen liest nur (keine Testläufe) und geht durch alles; es wartet, bis die Abnahme fertig ist (sieht deren Ergebnis, nie zwei Opus-Läufe zugleich), und lässt Einträge mit offenem „zur Abnahme“ aus. Kandidaten: alle offenen Board-Einträge außer „Wartet auf OK“, „Wartet bewusst bis …“ und offener Abnahme, dazu alle offenen GitHub-Issues (Pull Requests nie). Warten wie die Abnahme (Pause `release-aufraeumen` in `pausen.txt`, 09:00–23:00, neon frei, Kontingent; höchstens 24 Stunden, nur neon belegt: läuft trotzdem). Dann Arbeitskopie am Release-Stand und Opus mit `tests/aufraeumen-auftrag.md` (höchstens 180 Minuten, Gedächtnis `~/halo-nacht/aufraeumen-gedaechtnis.md`); Claude schreibt nur Ergebnisdatei und Bericht, das Skript schreibt, nachdem es Board und Issues neu gelesen hat (nur Offenes, seit der Prüfung Unverändertes): **erledigt** nur, wenn jeder genannte Hash ein Commit auf `origin/main` ist und im Tag `v<version>` steckt (Board auch: derselbe Patch), Board: Notiz „erledigt in vX.Y.Z (<Hash>), Aufräumen nach Release …“ und `board.sh status <id> done <Hash>` (nie Reihen n/m), Issue: `gh issue close --reason completed` mit festem Text „Fixed in <erstes Release mit allen Hashes>. Thunderbird installs the update automatically. Thanks for reporting!“ (kein Text von Claude nach außen); **maintainer**: Ja/Nein-Frage nach `~/halo-aufgaben/aufraeumen-maintainer.md` (Morgenbrief, [handeln]), Board zusätzlich Notiz „Entscheidung fehlt seit <Datum>: <Frage>“ (je unverändertem Stand nur einmal); **offen**/**ausgelassen**: nur Bericht. Schließen wegen Inaktivität bleibt bei `tests/inaktivitaet.sh` und der GitHub-Routine. Board nicht lesbar: nichts tun, Meldung an neon; Issues nicht lesbar: nur das Board. Protokoll `~/halo-nacht/aufraeumen-nach-release.log` (geschlossene Issues zusätzlich `aufraeumen-issues.log`), Bericht `~/halo-berichte/<datum>-aufraeumen-v<version>.md`. Test: `zsh tests/aufraeumen_nach_release_test.zsh`.

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
