Unbeaufsichtigter Lauf des Auslastungswächters halo.spaces auf neon (tests/auslastung-schleife.zsh, Volldampf): der
Windows-Rundgang in der Windows-VM bei knappem 5-Stunden-Fenster. Niemand sieht zu. Oben unter „JETZT:“ stehen Modell,
Worktree, Ergebnisdatei und Zeitgrenze, unten der Auftrag wörtlich aus ~/halo-aufgaben/neon-stand.md.

Freigabe (Maintainer 18.11.2026, Wortlaute in ENTSCHEIDUNGEN.md): „wäre auch ein perfekter task für die Situation wenn wir
bereits knapp am 5h-Limit sind“; auf neons Empfehlung, ihn dann automatisch zu starten: „ich folge allen empfehlungen von dir.“
Der Auftrag gilt unverändert: nichts daran ändern, nichts weglassen, nichts hinzuerfinden. Dieser Rahmen regelt nur, wie du
ihn unbeaufsichtigt ausführst; AGENTS.md gilt.

Rahmen:
1. Arbeitsordner ist der Worktree aus „JETZT:“ (Stand origin/main; Commit für das LIES-MICH: git rev-parse --short HEAD).
   Nichts committen, nichts pushen, kein Board, kein release.sh/publish.sh, kein install.sh, nichts im echten Profil,
   keine Regeln, Abläufe oder Konfiguration ändern. Bilder und Hilfsskripte nur dort ablegen, wo der Auftrag es sagt.
2. Zuerst die Voraussetzungen des Auftrags prüfen (etwa Reihenfolge nach anderen Aufträgen in neon-stand.md bzw.
   neon-stand-archiv.md, „nach dem Release der Nacht“, „tagsüber“, „nicht während Runner.Worker“, „nicht im Nachtlauf“).
   Nicht erfüllt: nichts aufnehmen, Ergebnis „zurück <Grund>“.
3. Vor jedem Lauf in der VM prüfen, ob neon frei ist:
   zsh -c 'source tests/lauf-hilfen.zsh; LOG=/dev/null REST_MITNEHMEN=1; aktive_sitzung() { return 1 }; belegt'
   Gibt das etwas aus, minütlich bis 30 Minuten warten, sonst Ergebnis „zurück belegt: <Grund>“. Jeden VM-Lauf unter der
   Sperre der anderen Bildläufe starten: lockf -t 3600 ~/halo-nacht/bilder.lock <Befehl>.
4. Kein neuer Lauf nach 22:00 Wiener Zeit; vor der Zeitgrenze aus „JETZT:“ fertig sein. Unfertiges: Ergebnis „teilweise …“.
5. Wenig Token: nur das Modell aus „JETZT:“, kein Unteragent mit stärkerem Modell, kein Fable. Bilder nur stichprobenartig
   ansehen (je Gruppe eins, ob es das Richtige zeigt), keine Bewertung des Designs – das macht der Designer.
6. Ergebnisdatei (Pfad oben), genau eine Zeile:
     erledigt <Ablageordner> <Zahl der Bilder>
     teilweise <Ablageordner> <was fehlt>
     zurück <Grund>
7. Bericht ~/halo-berichte/<Datum>-rundgang-windows.md (Abschnitt anhängen): Uhrzeit, Modell, Ablage, Liste der Bilder,
   Abweichungen vom Auftrag, Rückblick (Aufwand, was half, was bremste). Deutsch, knapp, für einen Admin. Die Meldung an
   den Designer übernimmt neon: der Wächter trägt dein Ergebnis in neon-stand.md ein; du schreibst keiner Sitzung und
   schickst keine Push-Meldung.
8. Dazulernen: höchstens 2 Zeilen nach den Regeln in ~/halo-nacht/worker-gedaechtnis.md (Schreiben nur mit
   lockf -t 60 ~/halo-nacht/worker-gedaechtnis.lock …); Regeln für Aufträge nur als „Vorschlag: …“ im Bericht.
