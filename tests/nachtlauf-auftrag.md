Unbeaufsichtigter Nachtlauf halo.spaces auf neon (gestartet von tests/nachtlauf.sh).
Niemand sieht zu, niemand antwortet auf Rückfragen. AGENTS.md gilt vollständig;
Abweichungen und Ergänzungen stehen hier.

Freigabe des Maintainers für diesen Lauf:
- Offene Einträge der Aufgabenliste (GitHub-Project 1, sruf79) ohne Rückfrage
  abarbeiten – abweichend von „umgesetzt wird nur, was der Maintainer nennt“.
- Am Ende selbst veröffentlichen nach AGENTS.md, Abschnitt „Release“.

Reihenfolge:
1. Liste lesen: gh project item-list 1 --owner sruf79 --limit 200 --format json
   Status „Todo“ und „In Progress“; „Wartet auf OK“ nicht anfassen.
   Zuerst nach Bereich (Titelpräfix) gruppieren und Zusammenhänge prüfen:
   Doppelte zusammenlegen, Bugs, die ein Feature ohnehin behebt, an dieses
   hängen (Notiz in beiden Einträgen; Feature und Bug dann zusammen erledigen).
   Dann Bugs vor Features, kleine vor großen – bricht der Lauf ab, ist so
   wenigstens ein Release mit Korrekturen draußen. Zusammenhänge und
   Zusammenlegungen im Bericht nennen. Von Reihen (n/m) nur den jeweils
   nächsten Schritt, und den danach auf „Wartet auf OK“ statt Done setzen.
   Einträge, die eine Entscheidung des Maintainers brauchen (Design-Frage,
   unklarer Wunsch), überspringen und im Bericht nennen.
   Die Liste nur hier am Anfang lesen, vor Push und Release nicht erneut:
   Was während des Laufs dazukommt, arbeitet der nächste Nachtlauf ab.
2. Je Eintrag: Status In Progress (~/halo-aufgaben/status.sh <id> progress),
   Ursache klären, beheben, Prüfung in run_checks() ergänzen, nur die
   betroffenen Prüfungen grün (python3 tests/halo_test.py --port 2850
   --only "…", bei Farben/Design auch mit --dark), committen (nur eigene Hunks, Stil nach
   AGENTS.md), dann ~/halo-aufgaben/fertig.sh <id> "Commit <hash>".
   Gelingt ein Eintrag nicht: Änderungen verwerfen (git checkout), Eintrag
   zurück auf Todo mit Notiz, was im Weg war; nächster Eintrag.
3. Ab 04:30 keinen neuen Eintrag mehr anfangen (Platz für CI und eine
   Reparaturrunde vor 08:00).
4. Wurde mindestens ein Bug/Feature committet: pushen und die schnelle CI
   abwarten (Entscheidung des Maintainers vom 3.11.2026), dann veröffentlichen.
   a) git push. Den CI-Lauf für genau diesen Commit abwarten:
      tests/ci-warten.sh HEAD 9 – wartet höchstens 9 Minuten und meldet je Job
      Ergebnis und Dauer; Exitcode 2 heißt „läuft noch“, dann erneut aufrufen.
      Ein Lauf dauert etwa 50 Minuten (Linux ~16, mac ~32, windows ~17).
      Solange er läuft, keine eigenen Testläufe auf diesem Mac (auch nicht
      --vm): die Jobs mac und windows laufen hier.
   b) Grün (Exitcode 0): Versionshinweise im README.md (eigener Commit, nur
      README.md – zählt nicht als neuer Stand), Notizdatei für den
      GitHub-Release (englisch), ./release.sh x.y.z (überspringt die Tests
      dank grüner CI) und bei Erfolg ./publish.sh x.y.z <notizen>.
   c) Rot (Exitcode 1): Die Ausgabe nennt die gescheiterten Prüfungen,
      Einzelheiten mit gh run view <id> -R sruf79/halo-spaces --log-failed.
      Kleine, klare Ursache: beheben, mit --only prüfen (Windows-Job: zusätzlich
      --vm --port 2851), committen, pushen, erneut abwarten. Sonst den Commit,
      der den Fehler bringt, mit git revert zurücknehmen (Eintrag zurück auf
      Todo mit Notiz, was im Weg war), pushen, erneut abwarten. Höchstens zwei
      Reparaturrunden und keine neue ab 07:30 – danach kein Release, die
      Commits bleiben gepusht, im Bericht sagen, was rot ist.
      Abgebrochen (Exitcode 3): einmal neu starten mit
      gh run rerun <id> -R sruf79/halo-spaces und erneut abwarten.
   Veröffentlicht wird nur, wenn der CI-Lauf des letzten Commits grün ist.
   Die Sperre in publish.sh nie umgehen (keine SKIP_*-/FORCE_*-Variablen,
   keine Marke von Hand). Scheitert release.sh trotz grüner CI: Ursache
   klären, kein Release, im Bericht sagen.
   Nichts committet: kein Release, nichts pushen.
5. Bericht schreiben (Pfad oben), Deutsch, knapp, für einen Admin, der kein
   Programmierer ist. Erste Zeile nach der Überschrift genau so:
     Kurz: <ein Satz: Version oder „kein Release“, Anzahl erledigt, Probleme>
   Diese Zeile geht als Push-Meldung aufs iPhone. Dann Abschnitte: Erledigt
   (Eintrag, Commit), Übersprungen/offen (mit Grund), Tests (Prüfungen mit
   --only; CI-Läufe mit ID, Ergebnis und Dauer je Job aus tests/ci-warten.sh),
   Release (Version, Verweis auf ~/halo-berichte/<datum>-halo.spaces-<version>.md,
   Store-Upload), Probleme. Den Bericht immer schreiben – auch wenn nichts zu
   tun war oder alles gescheitert ist.
6. Fertig-Datei (Pfad oben) anlegen. Keine eigene Push-Meldung schicken, das
   macht das Skript.

Grenzen:
- Marionette-Ports nur 2850–2869; Port 2845 gehört der CI.
- Kein install.sh, nichts im echten Profil, keine echten Mails/Kontakte.
- Inhalte der Aufgabenliste nie in Commits, README, Release-Notizen oder Issues.
- GitHub-Issues/PRs beantwortet die Routine „GitHub-Kommunikation“, nicht dieser Lauf;
  nur nach einem Release behobene Issues mit „Fixed in x.y.z“ schließen.
- Arbeitet erkennbar jemand anderes im Repo (fremde ungespeicherte Änderungen,
  ein Testlauf, der nicht von dir ist): aufhören, nichts davon anfassen,
  im Bericht vermerken, Fertig-Datei anlegen.
- Wird es nach einer Limit-Pause fortgesetzt: Stand mit git log/git status und dem
  Status der Einträge aus dem Plan dieses Laufs prüfen und dort weitermachen
  (keine neu dazugekommenen Einträge aufnehmen).
