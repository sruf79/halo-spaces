Unbeaufsichtigter Nachtlauf halo.spaces auf neon (gestartet von tests/nachtlauf.sh).
Niemand sieht zu, niemand antwortet auf Rückfragen. AGENTS.md gilt vollständig;
Abweichungen und Ergänzungen stehen hier.

Freigabe des Maintainers für diesen Lauf:
- Offene Einträge der Aufgabenliste (GitHub-Project 1, sruf79) ohne Rückfrage
  abarbeiten (AGENTS.md „Wer die Liste abarbeitet“: der Nachtlauf immer,
  andere Sitzungen nur auf Aufforderung).
- Am Ende selbst veröffentlichen nach AGENTS.md, Abschnitt „Release“.

Reihenfolge:
0. Zuerst alle offenen Änderungen mitnehmen (Entscheidung des Maintainers
   vom 4.11.2026), ohne Rückfrage, bevor ein Eintrag beginnt:
   a) Ungespeicherte Änderungen im Checkout (git status): Sie stammen von
      Sitzungen, die gerade nicht arbeiten (das Skript startet sonst nicht);
      eine davon kann aber noch offen sein und später weitermachen – darum
      nichts verwerfen. git diff lesen, nach Bereich in Commits teilen
      (Stil nach AGENTS.md), betroffene Prüfungen mit --only (Port 2850)
      laufen lassen. Grün bzw. ohne passende Prüfung: committen. Rot oder
      erkennbar halbfertig: auf einen Zweig rest/<datum> committen (git
      switch -c, commit, git switch main), nicht pushen, im Bericht nennen.
      Nicht verfolgte Dateien nur, wenn sie eindeutig zu diesen Änderungen
      gehören; Bilder, Testausgaben und Gitignoriertes nie.
   b) Abgleich mit GitHub: git fetch origin, dann git rebase origin/main
      (nimmt die tagsüber committeten, nicht gepushten Commits mit, AGENTS.md
      „Nicht Eiliges nimmt der Nachtlauf mit“). Konflikt mit klarer Lösung:
      lösen; sonst git rebase --abort, die betroffenen lokalen Commits mit
      git branch rest/<datum>-konflikt sichern, main auf origin/main setzen
      (git reset --hard origin/main) und im Bericht nennen.
   c) Alle so übernommenen und alle seit dem letzten Lauf neuen Commits auf
      main durchsehen (Regeln aus AGENTS.md, offensichtliche Fehler, Doppeltes;
      Gefundenes zuerst beheben) und im Bericht unter „Mitgenommen“ auflisten.
      Erst danach die Aufgabenliste laden (Reihenfolge des Maintainers vom
      4.11.2026: Commits, Liste, Bugs, Features, Reihen).
1. Liste lesen: gh project item-list 1 --owner sruf79 --limit 200 --format json
   Status „Todo“ und „In Progress“; „Wartet auf OK“ nicht anfassen.
   Zuerst nach Bereich (Titelpräfix) gruppieren und Zusammenhänge prüfen:
   Doppelte zusammenlegen, Bugs, die ein Feature ohnehin behebt, an dieses
   hängen (Notiz in beiden Einträgen; Feature und Bug dann zusammen erledigen).
   Dann in dieser Reihenfolge (Entscheidung des Maintainers vom 4.11.2026,
   abends): **1. alle Bugs**, Bereich für Bereich, kleine vor großen;
   **2. einfache Features** (ohne n/m); **3. zuletzt die Reihen** (n/m, z. B.
   Mehrwochen-Ansicht), je nur der nächste Schritt. Die nächste Stufe erst,
   wenn in der vorigen nichts Machbares übrig ist – außer ein Feature behebt
   einen Bug vermutlich mit, dann zusammen mit ihm. Bricht der
   Lauf ab, ist so wenigstens ein Release mit Korrekturen draußen. Zusammenhänge und
   Zusammenlegungen im Bericht nennen. Von Reihen (n/m) nur den jeweils
   nächsten Schritt, und den danach auf „Wartet auf OK“ statt Done setzen.
   Einträge, die eine Entscheidung des Maintainers brauchen (Design-Frage,
   unklarer Wunsch), überspringen und im Bericht nennen.
   Die Liste nur hier am Anfang lesen, vor Push und Release nicht erneut:
   Was während des Laufs dazukommt, arbeitet der nächste Nachtlauf ab.
2. Je Eintrag: Status In Progress (~/halo-aufgaben/status.sh <id> progress),
   Ursache klären, beheben, Prüfung in run_checks() ergänzen, nur die
   betroffenen Prüfungen grün (python3 tests/halo_test.py --port 2850
   --only "…", bei Farben auch mit --dark), committen (nur eigene Hunks, Stil nach
   AGENTS.md); Eintrag bleibt In Progress, Commit-Hash merken – Done erst
   nach grüner CI (Schritt 4 b „Grün“; AGENTS.md „Aufgabenliste“).
   Gelingt ein Eintrag nicht: Änderungen verwerfen (git checkout), Eintrag
   zurück auf Todo mit Notiz, was im Weg war; nächster Eintrag.
3. Ab 04:30 keinen neuen Eintrag mehr anfangen (Platz für CI und zwei
   Reparaturrunden – die letzte beginnt spätestens 07:30, ihre CI endet vor
   09:00); weiter geht es erst nach grüner CI in Schritt 5.
4. Wurde mindestens ein Bug/Feature committet: pushen und die schnelle CI
   abwarten (Entscheidung des Maintainers vom 3.11.2026), dann veröffentlichen.
   a) git push. Den CI-Lauf für genau diesen Commit abwarten:
      tests/ci-warten.sh HEAD 9 – wartet höchstens 9 Minuten und meldet je Job
      Ergebnis und Dauer; Exitcode 2 heißt „läuft noch“, dann erneut aufrufen.
      Ein Lauf dauert etwa 35 Minuten, mit Dunkelmodus etwa 55 (Linux ~17
      parallel, mac hell ~17 bzw. hell und dunkel ~35, windows ~19).
      Solange er läuft, keine eigenen Testläufe auf diesem Mac (auch nicht
      --vm): die Jobs mac und windows laufen hier.
   b) Grün (Exitcode 0): Versionshinweise im README.md (eigener Commit, nur
      README.md – zählt nicht als neuer Stand), Notizdatei für den
      GitHub-Release (englisch), ./release.sh x.y.z (überspringt die Tests
      dank grüner CI) und bei Erfolg ./publish.sh x.y.z <notizen>. Die
      Einträge dieses Laufs jetzt abschließen (auch wenn das Release
      scheitert – die CI war grün): normale Einträge mit
      ~/halo-aufgaben/fertig.sh <id> "Commit <hash>" auf Done; Reihen-Schritte
      (n/m) nicht mit fertig.sh, sondern auf „Wartet auf OK“ (Schritt 1;
      status.sh kennt diesen Status nicht):
        gh project item-edit --project-id PVT_kwHODEPpks4BoBQw --id <id> --field-id PVTSSF_lAHODEPpks4BoBQwzhmjN5E --single-select-option-id 2327eecc
      und Commit-Hash als Notiz in den Eintrag.
   Zeilen „KONSOLE  …“ (Fehler in der Fehlerkonsole) machen nichts rot und
   halten kein Release auf; der CI-Wächter trägt sie als Bug ein – keine
   Reparaturrunde dafür (AGENTS.md „Bauen und testen“, Fehlerkonsole).
   c) Rot (Exitcode 1): Die Ausgabe nennt die gescheiterten Prüfungen,
      Einzelheiten mit gh run view <id> -R sruf79/halo-spaces --log-failed.
      Kleine, klare Ursache: beheben, mit --only prüfen (Windows-Job: zusätzlich
      --vm --port 2851), committen, pushen, erneut abwarten. Sonst den Commit,
      der den Fehler bringt, mit git revert zurücknehmen (Eintrag zurück auf
      Todo mit Notiz, was im Weg war), pushen, erneut abwarten. Höchstens zwei
      Reparaturrunden und keine neue ab 07:30 – danach kein Release, die
      Commits bleiben gepusht, im Bericht sagen, was rot ist; die Einträge
      bleiben In Progress mit Notiz „CI rot“.
      Abgebrochen (Exitcode 3): einmal neu starten mit
      gh run rerun <id> -R sruf79/halo-spaces und erneut abwarten.
   Veröffentlicht wird nur, wenn der CI-Lauf des letzten Commits grün ist.
   Die Sperre in publish.sh nie umgehen (keine SKIP_*-/FORCE_*-Variablen,
   keine Marke von Hand). Scheitert release.sh trotz grüner CI: Ursache
   klären, kein Release, im Bericht sagen.
   Vor jedem Push erneut git fetch origin und git rebase origin/main. Der
   Push nimmt die in Schritt 0 übernommenen Commits mit; sie gehören zum
   geprüften Stand. Kein eigener Eintrag erledigt, aber git log
   origin/main..main zeigt Commits: trotzdem pushen und abwarten wie a), bei
   Rot wie c).
   Release dann wie b) nur, wenn darunter Bug- oder Feature-Commits sind
   (sonst kein Release, AGENTS.md „Release“). Gar keine Commits: nichts
   pushen.
   Unabhängig davon: Liegen seit dem letzten Release (git log
   v<letzte Version>..origin/main, Version aus updates.json) schon gepushte,
   noch nicht veröffentlichte Bug- oder Feature-Commits anderer Sitzungen,
   dann veröffentlichen wie b), sobald der CI-Lauf für origin/main grün ist
   (tests/ci-warten.sh <commit> 9; rot: kein Release, im Bericht sagen).
   So kommt jede Korrektur spätestens mit dem nächsten Nachtlauf zu den
   Nutzern (Entscheidung des Maintainers vom 5.11.2026).
5. Weiterarbeiten nach grüner CI (Entscheidung des Maintainers vom
   5.11.2026): Ist Schritt 4 abgeschlossen – CI grün und Release
   veröffentlicht bzw. nicht nötig – und ist es vor 06:30, die nächsten
   Einträge aus dem Plan dieses Laufs weiter abarbeiten wie Schritt 2 (gleiche
   Reihenfolge, keine neu dazugekommenen Einträge). Ab 06:30 keinen neuen
   Eintrag mehr anfangen. Bei roter CI in Schritt 4 (auch nach den
   Reparaturrunden) entfällt dieser Schritt.
   a) Fertig vor 07:30: git fetch origin, git rebase origin/main, pushen und
      die CI wie in 4 a) abwarten (tests/ci-warten.sh HEAD 9, wiederholen
      solange Exitcode 2, längstens bis 08:50). Grün: die Einträge abschließen wie in Schritt
      4 b) (normale mit fertig.sh auf Done, Reihen-Schritte auf „Wartet auf
      OK“); kein zweites Release in dieser Nacht – das
      macht der nächste Nachtlauf (Schritt 4 „Unabhängig davon“) oder eine
      Sitzung am Tag. Rot: keine Reparaturrunde; die Commits dieses Schritts
      mit git revert zurücknehmen, pushen (nicht mehr abwarten), Einträge
      zurück auf Todo mit Notiz, was rot war. Um 08:50 noch nicht fertig:
      im Bericht mit Lauf-ID nennen (der CI-Wächter wertet Läufe, die
      während des Nachtlaufs beginnen, nicht aus), Einträge bleiben In
      Progress mit Notiz.
   b) Erst ab 07:30 fertig: nicht pushen. Die Commits bleiben auf main in
      ~/halo-spaces (der nächste Nachtlauf nimmt sie in Schritt 0 mit), die
      Einträge bleiben In Progress mit Notiz „committet, wartet auf
      nächsten Nachtlauf“.
6. Bericht schreiben (Pfad oben), Deutsch, knapp, für einen Admin, der kein
   Programmierer ist. Erste Zeile nach der Überschrift genau so:
     Kurz: <ein Satz: Version oder „kein Release“, Anzahl erledigt, Probleme>
   Diese Zeile geht als Push-Meldung aufs iPhone. Dann Abschnitte: Mitgenommen
   (Schritt 0: Commits, Zweige rest/…), Erledigt (Eintrag, Commit; Einträge aus Schritt 5 mit
   „nach dem Release“ und ihrem CI-Ergebnis bzw. „wartet auf nächsten
   Nachtlauf“), Übersprungen/offen (mit Grund), Tests (Prüfungen mit
   --only; CI-Läufe mit ID, Ergebnis und Dauer je Job aus tests/ci-warten.sh),
   Release (Version, Verweis auf ~/halo-berichte/<datum>-halo.spaces-<version>.md,
   Store-Upload), Thunderbird (Zeile „Thunderbird auf neon vor dem Lauf“
   oben; wurde aktualisiert und ist die CI rot, prüfen, ob die neue Version
   der Grund ist, und das im Bericht sagen), Probleme. Den Bericht immer schreiben – auch wenn nichts zu
   tun war oder alles gescheitert ist.
7. Fertig-Datei (Pfad oben) anlegen. Keine eigene Push-Meldung schicken, das
   macht das Skript.

Grenzen:
- Marionette-Ports nur 2850–2869; Port 2845 gehört der CI.
- Kein install.sh, nichts im echten Profil, keine echten Mails/Kontakte.
- Inhalte der Aufgabenliste nie in Commits, README, Release-Notizen oder Issues.
- GitHub-Issues/PRs beantwortet die Routine „GitHub-Kommunikation“, nicht dieser Lauf;
  nur nach einem Release behobene Issues mit „Fixed in x.y.z“ schließen.
- Fremde ungespeicherte Änderungen oder Commits, an denen gerade keine Sitzung
  arbeitet, nimmt Schritt 0a mit. Arbeitet aber erkennbar jemand anderes
  gerade im Repo (eine andere Sitzung ändert noch Dateien, ein Testlauf, der
  nicht von dir ist): aufhören, nichts davon anfassen, im Bericht vermerken,
  Fertig-Datei anlegen.
- Wird es nach einer Limit-Pause fortgesetzt: Stand mit git log/git status und dem
  Status der Einträge aus dem Plan dieses Laufs prüfen und dort weitermachen
  (keine neu dazugekommenen Einträge aufnehmen).
