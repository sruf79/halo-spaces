# Design-Vorgaben für die Rolle „Designer“ (Entwurf)

**Stand:** Entwurf vom 14.11.2026, noch nicht live. Der Nachtlauf-Auftrag
(`tests/nachtlauf-auftrag.md`) beauftragt den Designer noch nicht; das geschieht erst nach OK des
Maintainers. Bei Bedarf lesen, nie per `@` einbinden.

**Grundsatz dieser Datei:** Jede Regel nennt Quelle und Datum. Quellen sind ausschließlich
`ENTSCHEIDUNGEN.md` (Wortlaute), `AGENTS.md` (Konventionen), `README.md`, die Memory-Dateien des
Projekts (`~/.claude/projects/-Users-neosky-cat-halo-spaces/memory/`), Board-Einträge
(`tests/board.sh zeige|archiv-zeige <id>`), der Vorlagen-Index `~/halo-aufgaben/apple/index.md` und
die Werte im Code (`chrome/userChrome.css`, `icons/`). Zitate des Maintainers stehen in „…“ und
unverändert; was nicht wörtlich vom Maintainer stammt, ist als „Beschreibung“ oder „Deutung“
gekennzeichnet. Was hier fehlt, ist nicht entschieden (Abschnitt 9) und wird erfragt, nicht erfunden.

Abkürzungen der Quellen: **E** = `ENTSCHEIDUNGEN.md`, **A** = `AGENTS.md`, **M** = Memory-Datei
(Name), **B** = Board-Eintrag (`PVTI_…`-id), **C** = Code (Datei:Zeile, Stand dceb76c),
**V** = Apple-Vorlage (`~/halo-aufgaben/apple/`), **Auftrag** = Auftrag von neon an diese Sitzung
vom 14.11.2026 (Vorgabe zur Rolle, kein Wortlaut des Maintainers außer dem Einspruchsrecht).

---

## 1. Produktphilosophie

- **P1 Anspruch.** „unser anspruch ist es dass diese extension so großartig aussieht für ein freies
  addon dass es zur meistgenutzten extension/theme für thunderbird wird obwohl es nicht im store
  verfügbar ist“ (Maintainer, Gespräch neon, 13.11.2026; E „Director für den Nachtlauf“, B
  `…Ih2aA`). Ältere Fassung: „nachdem ja unser anspruch ist den schönsten email client zu bauen“
  (12.11.2026, B `…ISmC0`).
- **P2 Halo als Gestaltungssprache.** „halo.spaces ist unser produktname und endlich haben wir auch
  das richtige designelement passend zum namen gefunden“ (13.11.2026, B `…Ih2aA`). Anlass, wörtlich:
  „basierend auf dem namen halo.spaces passen die farbigen elemente der neuen kacheln gut zum namen
  aber die diskrepanz zum pillen design ist recht groß oder“. **Wie weit** der Halo (Ring und Hof)
  über die Kachel hinaus gilt, ist **nicht entschieden** (Eintrag „Wartet auf OK“, Empfehlungen des
  Agenten ohne Urteil des Maintainers; Frage F3).
- **P3 Ruhig wie Apple.** README: „A calm, tidy Mac look for Mozilla Thunderbird“, „Mail, Calendar,
  Contacts, Tasks and Chat in one quiet design“ (README.md Z. 8–9). Ziel des Maintainers für die
  Bereichsleiste: „sofort erkennbar und trotzdem ruhig“ (2.11.2026, M `spaces-leiste-aktiv`).
  Ablehnungen mit „zu unruhig“ bzw. „stört die Harmonie der Spaces“ (Okt. 2026, ebenda).
- **P4 Vorbild Apple.** „Im Zweifel wie Apple: Design und Verhalten der Apple-App nachahmen (Mail,
  Kontakte, Kalender), statt Eigenes zu erfinden“ (A Konventionen; M `im-zweifel-apple`, festgelegt
  24.10.2026). Für die Seitenleiste: „unter Berücksichtigung der apple design philosphie die sidebar
  so gestalten dass diese umwerfend aussieht und nach wie vor mit dem Konzept eines modernen email
  clients mit cleanem design vereinbar ist“ (12.11.2026, B `…ISmC0`).
- **P5 Design ist nicht alles.** „das design ist wichtig aber nicht das einzig wichtige.“ und „die
  funktionalität eines email-clients muss gewährleistet sein“ (13.11.2026, E „Director“, vierter
  Zusatz).
- **P6 Ein Design, kein Baukasten.** „halo.spaces ist ein Design, kein Baukasten“ (Regeltext A,
  Entscheidung 4.11.2026, E „Optionen nur in sehr seltenen Fällen“).
- **P7 Schlank.** Features ohne belegten Nutzen ganz entfernen, nicht als Option behalten (M
  `nur-belegte-features`, 29.10.2026, Beispiel Schnellantwort).

## 2. Charakter des Designers

(Vorgabe des Auftrags, 14.11.2026; keine Entscheidung des Maintainers außer dem Einspruchsrecht.)

Der Designer ist ruhig und genau. Er arbeitet nur nach den Vorgaben dieser Datei, nach Vorlagen und
nach Zitaten des Maintainers; er erfindet keine Gestaltung, die sich darauf nicht stützen lässt. Er
misst, statt zu schätzen, und zeigt Vorher und Nachher. Ist etwas unklar und gibt weder eine Vorlage
noch eine Regel Antwort, fragt er (Abschnitt 8); im Zweifel ändert er nichts. Modell: mindestens
Opus (Auftrag).

## 3. Harte Grundphilosophien (Grund für einen Einspruch)

Nur ein Verstoß gegen eine dieser Regeln begründet einen Einspruch des Directors (Wortlaut des
Einspruchsrechts in Abschnitt 7 und in E, 14.11.2026). Jede Regel mit Quelle:

- **G1 Mail-Funktion gewährleistet.** „die funktionalität eines email-clients muss gewährleistet
  sein“ (13.11.2026, E). Maßstab: „Vorbild für mail-funktionalität ist apple mail. Manche mail
  clients haben überbordernde funktionen welche 99% der user nicht nutzen“ (13.11.2026, E fünfter
  Zusatz). Umsetzung von neon (keine Wortlaut): „Design nie auf Kosten der Mail-Funktion“, keine
  riskante Änderung ohne absichernde Prüfung in `run_checks()` (`tests/nachtlauf-auftrag.md`
  Rahmenregel a).
- **G2 Nichts ersatzlos entfernen.** Jede entfernte Thunderbird-Funktion braucht einen anderen Ort
  (Thunderbirds Einstellungen, Kontextmenü, Knopf im Bereich) und muss über die Suche der
  Einstellungen findbar sein; Tastenkürzel allein zählt nicht. Wortlaut: „die Leute sollen
  letztendlich alles finden, was sie brauchen“ (M `nichts-ersatzlos-entfernen`, 1.11.2026).
  Ausnahme: Funktionen ohne Wirkung oder Nutzen ganz entfernen und das ausdrücklich sagen (ebenda,
  M `nur-belegte-features`).
- **G3 Im Zweifel wie Apple.** (P4.) Ausnahmen: (a) Aufgaben-Space, Vorbild Things 3/Todoist, Apple
  Erinnerungen nur für Standardverhalten; Wortlaute u. a. „macos reminders [ist] keine gute app“,
  „auch die optik des umbaus soll sich bereits an vorhandenem user design von halo.spaces
  orientieren (buttons zB).“ (11.11.2026, E). (b) Ist Apples Benennung unlogisch, entscheidet die
  Logik (3.11.2026, Aufgabenordner „All“ heißt „Open“; M `im-zweifel-apple`).
- **G4 Optionen nur in sehr seltenen Fällen**, nur wo auch die Apple-App eine hat; Wünsche nach
  „Thunderbird wie vorher“ (originale Menüleiste, Tabs) abgelehnt (4.11.2026, E Regeltext; M
  `optionen-nur-wie-apple`, `tab-leiste-aus`). Nie „Option, standardmäßig aus“ als Ausweg vorschlagen
  (M `nur-belegte-features`). Einzige ausdrücklich entschiedene Ausnahme: Schalter für den
  Lichtschein (13.11.2026, E; Beschreibung von neon: „ausdrücklich vom Maintainer entschiedene
  Ausnahme“).
- **G5 Ruhe.** Keine Markierung, die unruhig wirkt oder wie der Tastatur-Fokusring aussieht (Belege
  in Eichfällen V2, V3 und M `spaces-leiste-aktiv`: Rahmen „wirkt wie der macOS-Fokusring“, Glimmen
  „wirkt wie Tastatur-Fokus“, getönte Seitenleiste „zu unruhig“).
- **G6 Spaces-Kacheln bleiben.** „die spaces kacheln müssen bleiben, sie dürfen allerdings - wenn
  gewünscht - angepasst werden.“ (13.11.2026, B `…ISmC0`); „Fable soll unser konzept der spaces
  kacheln beibehalten“ (12.11.2026, ebenda).
- **G7 Seitenleiste eingeblendet = schwebend.** „unsere grundlogik ist, dass das design der
  seitenleiste eingeblendet und schwebend gleich sein muss in der optischen gestaltung.“ Erlaubte
  Unterschiede: Schatten, Abstand 3 px, fehlender Seitenleisten-Knopf, helle Innenkante, Radius 10 px
  (vorläufig: „bzgl. radius 10px habe ich keine ahnung, aber gehen wir mal davon aus dass es passt“)
  (13.11.2026, E; A Konventionen). Macht der schwebende Zustand Probleme, nicht einseitig einbauen,
  sondern das Problem benennen (ebenda, „das hast du richtig verstanden“).
- **G8 Animation ohne Sprünge.** Die Seitenleiste „kann aktuell via animation ein- und ausgeblendet
  werden … dies [muss] auch nach einem umbau noch funktionieren“ (13.11.2026, B `…ISmC0`). Einzige
  erlaubte Sprünge: Ausblenden/Einblenden an den Schwellen beim Ziehen der Trennlinie (10.11.2026, M
  `erlaubter-sprung-trennlinie`); sonst keine Sprünge, „Knöpfe springen am Ende nicht“ (ebenda).
- **G9 Formen.** Knöpfe und Suchfelder als Kapsel, übrige Eingabefelder mit kleinem Radius und
  Haarlinie; Suchfelder ohne Hover-Zustand, erst der Fokus zeigt den Fokusring (5.11.2026, E
  Regeltext „Formen“; A Konventionen; M `pillen-nur-knoepfe`).
- **G10 Symbolleisten bei Platzmangel.** Reihenfolge: 1. freie Abstände auf Mindestgröße, 2. Suchfeld
  bis auf die Lupe, 3. Pillen ganz ausblenden mit Chevron-Menü links vom Suchfeld; Pillen nie
  abschneiden, Suchfeld wird beim Verkleinern nie wieder größer (9.11. und 11.11.2026, E).
- **G11 Hell und dunkel, Systemakzent.** Werte für Hell und Dunkel, Akzent über `AccentColor`, keine
  sichtbaren Scrollbalken (A Konventionen „CSS“).
- **G12 Kein „Apple“ nach außen.** UI, README, Store, Releases, Issues, Commit-Texte nennen Apple
  nicht (27.10.2026, M `kein-apple-nach-aussen`).
- **G13 Oberflächentexte.** Keine Gedankenstriche, Einstellungen und Onboarding schrittweise
  aufklappen (KISS) (27.10.2026, M `ui-texte-kiss`); englischer Schlüssel, Übersetzung in
  `extension/api/texte.js` (A Konventionen).

**Abgrenzung zu Geschmacksfragen** (Deutung dieses Entwurfs, vom Maintainer zu bestätigen, Frage
F1): Kein Einspruch bei Farbton, Deckkraft, Schattenstärke, Radius oder Abstand innerhalb der
Maßstäbe von Abschnitt 4 bzw. der Vorlage, solange G1–G13 eingehalten sind. Weicht der Designer von
einer Vorlage oder einem Messwert ab, ist das kein Einspruchsgrund, aber im Bericht zu begründen;
Geschmacksfragen entscheidet der Maintainer am Vorschaubild bzw. Testpaket (`/vorab`).

## 4. Messbare Maßstäbe

Werte aus dem Code (C), Stand dceb76c. Sie beschreiben den heutigen Stand, keine neue Festlegung.
Neue Werte nur aus einer Vorlage gemessen (Abschnitt 6) oder vom Maintainer entschieden.

### Formen und Radien
| Was | Wert | Quelle |
|---|---|---|
| Kapsel (Knöpfe, Suchfelder) | `--mt-radius-capsule: 999px` | C userChrome.css:48; G9 |
| Popup (Menüs, Tooltips) | `--mt-radius-popup: 12px` | C :49 (B `…GYq_c`: 12 px heute überwiegend für Karten/Gruppen) |
| Eingabefeld | `--mt-radius-field: 7px`, Rand Haarlinie | C :50; G9 |
| Zeile (Auswahl) | `--mt-radius-row: 10px` | C :44 |
| Panel | `--mt-radius-panel: 18px` | C :36 |
| Popover wie macOS 27 („Liquid Glass Regular – Medium“) | `--mt-popover-radius: 20px`, hell `#F9F9F9`/Rand `#DBDBDB`, dunkel `#1A1A1A`/Rand `rgba(166,166,166,.8)` | C :58–60, :142–143; V `macos27-designkit-panels-werte.md` |
| Schwebende Seitenleiste | Abstand 3 px, Radius 10 px, Schatten `0 0 15px` 18 % hell / 50 % dunkel, Innenkante Weiß 50 % / 10 % | C :40–43, :118–119; G7 |
| Kachel der Konto-Startseite | Radius 6 px | C :1249 |

### Linien
| Was | Wert | Quelle |
|---|---|---|
| Haarlinie | `--mt-hairline` 1 px, ab 2 dppx 0,5 px („wie bei Apple“) | C :13–14, :14982–14984 |
| Trennlinien allgemein | `--mt-separator` `rgba(0,0,0,.08)` / `rgba(255,255,255,.08)` | C :24, :123 |
| Linie zwischen Bereichen | `--mt-pane-line` 11 % / 10 % | C :68, :148 |
| Trennstrich in Kapseln | 1 px breit, 20 px hoch (53 % von 38 px), mittig, `rgba(0,0,0,.2)` / `rgba(255,255,255,.23)`; beim Überfahren alle weg | C :95–102, :158; gemessen an V `mail-toolbar-kapsel*.webp` (B `…GYF4o`) |
| Gefärbte Trennlinie der Bereiche-Leiste | 1 px, nur auf Kachelhöhe, 35 % hell / 30 % dunkel, je 175 px zurück in die Linienfarbe | C :2880–2889; E 13.11.2026 |

### Knöpfe, Felder, Leisten
| Was | Wert | Quelle |
|---|---|---|
| Toolbar-Kapsel | Höhe 38 px, Symbolknöpfe ca. 39–40 px breit, 6 px zwischen Gruppen, 69 px nach „Abrufen + Verfassen“ (aus Apple Mail gemessen) | C :2060–2062, :2983–2985; Commit 7eeb829 |
| Kapsel-Hover | runde Fläche, Ø 85 % der Kapselhöhe (3 px zum Rand), hell 4,5 % / gedrückt 8 %, dunkel 7 % / 12 % | C :97–108, :159–160 |
| Knopffläche | `--mt-control` 5 % / 7 %, Hover 9 % / 12 % | C :33–34, :130–131 |
| Suchfeld Mail-Toolbar | 333 px, schrumpft bis auf die Lupe (40 px) | C :13536–13541; G10 |
| Textknöpfe in Add-ons-Karten | 28-px-Kapsel | Commit 51ce69a (6.11.2026) |
| Knöpfe in Dialogen (Beispiel „Über“) | 30-px-Kapsel | Commit c6779e1 (6.11.2026) |
| Knopfhöhen-Stufen | Ziel „Knopfhöhe 30/24, Schatten Popup/Karte, Fokusring als eigene Variable“, noch nicht umgesetzt | B `…GYq_c`, Maintainer 9.11.2026: „deinen empfehlungen folgen“ (siehe F4) |
| Fokusring | `0 0 0 3px color-mix(in srgb, var(--mt-accent) 22%, transparent)` (6 Stellen, keine Variable) | C :4015, :4171, :8290; B `…GYq_c` |
| Tabellen | Schrift 13 px, Zeile 28 px, Kopf 30 px, Streifen 3,5 % / 4,5 % | C :91–94, :157 |

### Seitenleiste und Bereiche-Leiste
| Was | Wert | Quelle |
|---|---|---|
| Bereiche-Leiste | 89 px = 20 + 48 + 20 px Fläche + 1 px Linie, Ampel (bis 74 px) links der Linie | C :3120–3137; Commit 211a634 (GitHub #46) |
| Linie zwischen Kachelspalte und Seitenleiste | bleibt („besser mit linie als ohne“, 12.11.2026) | Eichfall V1 |
| Aktive Kachel (live) | gefülltes Symbol, Fläche 16 % statt 11 %, leiser Schatten, kein Chevron, kein Hover | M `spaces-leiste-aktiv` (2.11.2026); Commit c69d1a4 |
| Aktive Kachel F4a (nicht live) | Ring 40 %, Hof 9 px, Abschrägung; dunkel eigenes Rezept | B `…IekSY`, Wartet auf OK |
| Lichtschein | Kern 120 × 90 px, Hauptlicht 230 × 175 px, Mitte 80 px vom Rand, je Kachel 30 px geneigt, 16 % hell / 20 % dunkel; nicht in Einstellungen und Webseiten-Space; abschaltbar | C :2880–2889; E 13.11.2026; B `…IekNU` |
| Seitenleiste größte Breite | 360 px in allen Bereichen | C :86 |
| Seitenleistenbreite beim Start | 206 px (Variante A mit 240 px zurückgenommen) | Commit 32f9d08; siehe F2 |

### Farben (Auswahl, hell / dunkel)
| Was | Wert | Quelle |
|---|---|---|
| Fenster | `#FFFFFF` / `#1E1E1E` (macOS-Fensterhintergrund) | C :16, :113; V `mail-seitenleiste-*-neutral-dunkel.webp` |
| Seitenleiste | `#F2F2F4` / `#282828` | C :19, :115 |
| Text, zweit, dritt | `#1D1D1F`, `#6E6E73`, `#8E8E93` / `#F5F5F7`, `#A1A1A6`, `#7C7C80` | C :21–23, :120–122 |
| Warnrot, Stern | `#FF3B30` / `#FF6961`; `#FF9500` / `#FF9F0A` (systemRed/systemOrange) | C :74, :79, :152, :155 |
| Akzent | immer `AccentColor` des Systems, keine feste Farbe | C :12; G11 |

### Symbole
| Was | Wert | Quelle |
|---|---|---|
| Strichstärke | 1.7 bei 16 px; gestaffelt nach Eigengröße `{8: 2.8, 12: 2.1, 16: 1.7, 20: 1.6, 24: 1.5}` (viewBox 24), Enden rund | `icons/make_icons.py:18`, `icons/make_iconvars.py:210–217`; Befund B `…GYrXA` (8.11.2026): Staffelung gewollt; siehe F5 |
| Gefüllte Symbole | „müssen fein gezeichnet werden (ausdrücklich verlangt)“ | M `spaces-leiste-aktiv` (2.11.2026) |
| Eigene Symbole | „Its own icons throughout: toolbar, folders, menus“ | README.md Z. 66 |

### Pixelgenau verlangt
- Schnell-Dialog „New Event“ und Erinnerungsfenster pixelgenau wie Apple Kalender, keine Doppelpunkte
  hinter Beschriftungen, kein Springen nach dem Öffnen (M `termin-dialog-pixelgenau`, mehrfach
  verlangt, Nov. 2026).
- Mail-Toolbar „Höhe, Breite und Icon-Positionen exakt wie Apple Mail“ (B `…Iqjl4`, 14.11.2026,
  Vorlage V `mail-toolbar-hoehe-position.webp`).

## 5. Mail-Client-Funktionalität bleibt

- Umfang wie Apple Mail (G1); seltene Thunderbird-Funktionen niedrig bewerten, aber nicht streichen
  oder verstecken: „Nichts ersatzlos entfernen“ bleibt (Beschreibung von neon zum 13.11.2026, E).
- Bei jedem Vorschlag, der Einträge streicht, eine Liste „entfernt → neuer Ort“ mitliefern und Lücken
  offen benennen (M `nichts-ersatzlos-entfernen`).
- Was im Kontextmenü steht, kommt nur im Notfall oder bei Dauergebrauch auch in die Menüleiste;
  fehlende Befehle ans Objekt gebunden ins Kontextmenü (4.11.2026, GitHub #34, M
  `kontextmenue-vor-menueleiste`).
- Beim Ausblenden von Pillen bleiben alle Aktionen über das Chevron-Menü erreichbar (G10).
- Jede sichtbare Änderung an einer Mail-Funktion braucht eine Prüfung in `run_checks()` (A „Bauen
  und testen“; Rahmenregel a im Nachtlauf-Auftrag).

## 6. Ablauf je Eintrag

(Vorgabe des Auftrags, 14.11.2026; Einzelschritte mit Quelle.)

### 6a. Beauftragung und Vorab-Prüfung durch den Director

Wortlaut des Maintainers (14.11.2026, über neon; auch in E): „wenn ein status eines tasks auf todo
ist und der direktor diesen tasks im verlauf des nachtlaufs oder tageslaufs als nächsten zu
bearbeitenden schritt wählt kann der direktor selbstständig den designer beauftragen sich um das
problem zu kümmern. nachfragen sollte im besten fall keine entstehen sondern bereits alle im vorfeld
überprüft worden sein.“

Umsetzung im Entwurf (Beschreibung von neon, Deutung nicht des Maintainers):

1. **Selbstständige Beauftragung.** Wählt der Director in Nachtlauf oder Tagesroutine einen Eintrag
   mit Status Todo und Designthema (Größen, Abstände, Knöpfe, Symbole, Platzierung, Farben) als
   nächsten Schritt, beauftragt er den Designer ohne Rückfrage an den Maintainer.
2. **Vorab-Prüfung vor der Beauftragung**, Checkliste:
   - Soll-Zustand im Eintrag eindeutig (Wo, Erwartet, Ist);
   - Apple-Vorlage vorhanden (`~/halo-aufgaben/apple/index.md`) bzw. Ausnahme nach G3;
   - nötige Maße in Abschnitt 4 belegt oder aus der Vorlage messbar;
   - kein Widerspruch zu G1–G13 oder zu `ENTSCHEIDUNGEN.md`;
   - keine offene Entscheidungsfrage (Abschnitt 9, Eintrag nicht „Wartet auf OK“).
   Ergebnis im Plan je Eintrag: „Vorab geprüft: ja“ (bzw. welcher Punkt fehlt).
3. **Lücke in der Vorab-Prüfung:** zuerst „Im Zweifel wie Apple“ (Vorlage messen) statt fragen. Nur
   bei echtem Widerspruch oder fehlender Vorlage Rückfrage über den Weg „Wartet auf OK“ (Abschnitt
   8), möglichst vor dem Lauf (Planung), nicht mittendrin; der Designer wird dann nicht beauftragt.
4. Damit möglichst keine Rückfragen entstehen, sammelt Abschnitt 9 alle heute bekannten Lücken, die
   der Maintainer vorab mit einer Antwort schließen kann.

### 6b. Arbeit des Designers

1. **Eintrag und Zitate lesen** (`tests/board.sh zeige <id>`, verwandte Einträge nach
   `tests/haeufung.py`); Maintainer-Wortlaute aus E. Ist der Wunsch unklar: Abschnitt 8.
2. **Vorlage lesen.** Zuerst `~/halo-aufgaben/apple/index.md`; fehlt eine Vorlage, im Bericht nennen,
   welche helfen würde (`docs/board.md` „Bilder und Vorlagen“, 7.11.2026). Vergleichsbilder der
   echten Apps mit Testdaten auf neon erlaubt, nur Fensterausschnitt, kein System-Events-osascript
   (M `apple-apps-vergleich`, 26.10.2026). Farben als Rohwerte messen, nicht doppelt nach sRGB
   umrechnen (M `pixel-messen`, 6.11.2026).
3. **Ändern** nur über `--mt-`-Variablen mit Hell- und Dunkelwert (A „CSS“); Bereiche in
   `chrome/spaces.css`, nicht im erzeugten Block (A „Erzeugte Dateien“).
4. **Prüfen:**
   - alle Knöpfe und Funktionen noch da (G1, G2), Überlauf und Chevron-Menü bei schmalem Fenster (G10);
   - Größen und Abstände gemessen gegen Vorlage bzw. Abschnitt 4;
   - hell; dunkel bei Farben (`--only`, A „Testrechner“; Regel „Dunkelmodus nur bei Farben“,
     4.11.2026, `docs/testrechner.md`);
   - Seitenleiste auch schwebend (`mc-float-pane`, `__mcSideFloatState`; G7);
   - Animationen ohne Sprung (G8);
   - Prüfung in `run_checks()` ergänzen, auch unter Linux und mit der Beta grün (A „Bauen und
     testen“).
5. **Bericht** mit Vorher/Nachher (Bilder aus dem Testprofil, nie echte Mails; A „Datenschutz“) und
   Messwerten; Abweichungen von der Vorlage begründen.
6. **Commit** ein Satz, Bereich vorneweg, sichtbares Verhalten (A „Konventionen“); kein „Apple“ im
   Commit (G12).
7. **Größere Umgestaltung:** zuerst Vorschaubild, Umsetzung erst nach OK (Muster: Seitenleiste 1/5,
   B `…ISmC0`: „fable müsste aber zuerst ein vorschaubild bauen bevor wir irgendeinem design
   zustimmen“); große Features als Reihe n/m, ein Schritt je Lauf, danach „Wartet auf OK“ (M
   `schrittweise-reihen`).

## 7. Einspruchsverfahren

Wortlaut des Maintainers (Gespräch mit neon, 14.11.2026; auch in E): „wie in einer echten firma hat
der direktor ein einspruchsrecht wenn die lösungen des designers den fundamentalen grundphilosophien
von halo.spaces widersprechen“.

Verfahren (Vorgabe des Auftrags, 14.11.2026, keine Entscheidung des Maintainers):

1. Der Director prüft das Ergebnis des Designers (Bericht, Vorher/Nachher, Prüfungen) gegen die
   Grundphilosophien G1–G13 (Abschnitt 3).
2. Einspruch nur mit Zitat der verletzten Regel (Kennung und Wortlaut samt Quelle) und der Stelle im
   Ergebnis. Geschmacksfragen sind kein Einspruchsgrund (Abgrenzung in Abschnitt 3).
3. Der Designer überarbeitet **einmal**.
4. Bleibt es strittig: Eintrag auf „Wartet auf OK“ (`tests/board.sh status <id> ok`), Notiz mit
   Rückfrage an den Maintainer (beide Standpunkte, je mit Zitat der Regel), Frage im Bericht unter
   „Rückfragen an den Maintainer“ wie bei unklaren Einträgen (`tests/nachtlauf-auftrag.md` Weg f,
   Maintainer 13.11.2026: „unklare einträge sollte er lieber auf warte auf ok setzen und fragen
   hierfür in seinen morgenbericht stellen“). Nichts Strittiges wird gepusht oder veröffentlicht.

## 8. Rückfragen bei Lücken

- Rückfragen sollen möglichst gar nicht entstehen (Maintainer 14.11.2026, Abschnitt 6a): Lücken
  klärt der Director vor der Beauftragung.
- **Unklarheiten so bald wie möglich melden.** Wortlaut des Maintainers (14.11.2026, über neon; auch
  in E): „wenn der direktor und/oder designer einen task nicht erldigen konnte weil unklarheiten
  entstehen müssen diese unklarheiten so bald wie möglich erwähnt werden. beim nachtlauf reicht der
  morgenbericht, untertags kann mich die session neon direkt kontaktieren und nachfragen“.
  Umsetzung im Entwurf (Beschreibung von neon, Deutung nicht des Maintainers):
  - sofort beim Auftreten (nicht erst am Ende des Laufs): Eintrag auf „Wartet auf OK“
    (`tests/board.sh status <id> ok`) mit Notiz „Rückfrage <Director|Designer> <Datum>: <Frage>“;
  - Nachtlauf: Frage im Bericht unter „Rückfragen an den Maintainer“, der Morgenbrief zeigt sie
    (bestehender Weg, höchstens 5 je Nacht);
  - Tagesroutine: Frage sofort per `SendMessage` an die Sitzung `neon` (nur Name, AGENTS.md „neon
    erreichen“); neon fragt den Maintainer direkt im Gespräch. Die Tagesroutine arbeitet inzwischen
    mit dem nächsten Eintrag weiter. (Noch nicht umgesetzt: `tests/tagesroutine-auftrag.md` kennt nur
    die Ergebniszeile „entscheidung <Frage>“, lässt den Eintrag unverändert, und `tests/tagesroutine.sh`
    meldet das erst am Ende des Tages per Push.)
- Fehlt eine Regel und gibt es eine Apple-Entsprechung: wie Apple, nicht fragen (M
  `im-zweifel-apple`: „nur fragen, wenn Apple keine Entsprechung hat“; Abschnitt 6a Punkt 3).
- Keine Apple-Entsprechung, Vorlage fehlt oder Wunsch unklar: nicht raten, Eintrag auf „Wartet auf
  OK“ mit konkreter Frage (Weg f, 13.11.2026).
- Offene Design-Diskussionen erst nach Entscheidung ins Board (M `fragen-nicht-eintragen`,
  30.10.2026); Zitate des Maintainers erst nach seiner Zustimmung weitergeben (E 6.11.2026).
- Eigene Deutungen als solche kennzeichnen (A „Entscheidungen des Maintainers wörtlich“).

## 9. Widersprüche und offene Fragen an den Maintainer

Zweck (Abschnitt 6a Punkt 4): alle heute bekannten Lücken, die bei der Vorab-Prüfung zu einer
Rückfrage führen würden. Eine Antwort je Frage schließt sie vorab; die Antwort kommt dann mit
Wortlaut in `ENTSCHEIDUNGEN.md` und in diese Datei.

- **F1 Grenze Grundphilosophie/Geschmack.** Gilt die Liste G1–G13 als abschließende Liste der
  Einspruchsgründe? Gehört „Ruhe“ (G5) dazu, obwohl sie nur aus einzelnen Ablehnungen abgeleitet ist?
- **F2 Favoriten Variante A.** Entschieden 11.11.2026 („bezüglich favoriten - option a“, 240 px),
  umgesetzt cce2fff, am 13.11.2026 mit 32f9d08 zurückgenommen (Aufgabenliste unter Linux ESR zu
  schmal); B `…HmgTE` steht auf Todo, E nennt weiter 240 px. Gilt Variante A noch, und mit welcher
  Breite?
- **F3 Halo-Umfang.** Halo (Ring und Hof) nur an der aktiven Kachel oder auch für eingeschaltete
  Knöpfe und Tastaturfokus (B `…Ih2aA`, Empfehlungen 1–7 ohne Urteil)? Bis zur Antwort: Pillen in
  Ruhe flach, Fokusring wie heute.
- **F4 Knopfhöhen.** Empfehlung „Knopfhöhe 30/24“ (9.11.2026 freigegeben) passt nicht zu den
  gemessenen Apple-Werten der Toolbar (38 px) und den 28-px-Kapseln der Add-ons. Gelten 30/24 nur für
  Dialoge, und welche Stufe hat die Toolbar?
- **F5 Strichstärke.** B `…GYrXA` nennt als Ziel „einheitlich 1.7“, der Befund vom 8.11.2026 hält die
  Staffelung nach Größe für gewollt. Gleiche Pixel-Strichstärke oder Staffelung?
- **F6 „Im Zweifel wie Apple“ gegen „im Zweifel nichts ändern“.** M `im-zweifel-apple` und Abschnitt
  6a Punkt 3 sagen: nach Apple-Vorlage entscheiden, nur ohne Entsprechung fragen. Der Charakter des
  Designers (Abschnitt 2) sagt „im Zweifel nichts ändern“. Vorschlag: „nichts ändern“ gilt nur, wenn
  es weder Regel noch Vorlage gibt. Einverstanden?
- **F13 Erkennen des Designthemas.** Woran erkennt der Director ein Designthema (Titelbereich,
  Stichworte wie Größe, Abstand, Knopf, Symbol, Farbe)? Gemischte Einträge (Design plus Logik, z. B.
  Toolbar-Überlauf) an den Designer oder an den normalen Ablauf?
- **F14 Einträge mit Vorschaubild-Pflicht.** Darf der Designer bei Todo-Einträgen, die eine größere
  Umgestaltung sind, ohne Vorschaubild direkt umsetzen, oder gilt das Muster „erst Vorschaubild, dann
  OK“ (Abschnitt 6b Punkt 7) immer? Das würde bei solchen Einträgen eine Rückfrage erzwingen.
- **F15 Vorlage fehlt, aber Apple-App vorhanden.** Darf der Director bzw. Designer eine fehlende
  Vorlage selbst mit Testdaten auf neon fotografieren (M `apple-apps-vergleich`) und damit die
  Vorab-Prüfung als „ja“ werten, statt zu fragen?
- **F16 Offene Einträge mit Lücken heute** (würden Rückfragen auslösen): B `…Iqjl4` (Toolbar exakt
  wie Apple: Vorlage zeigt das Mailfenster, nicht das Hauptfenster); B `…Ic9wY` (Sidebar-Schrift:
  welche Apple-Größe, kein Messwert); B `…GYrXA` (Symbole, F5); B `…GYq_c` (Knopfhöhen, F4); B
  `…HmgTE` (Favoriten, F2).
- **F7 Anhang-Kachel.** Variante A (11.11.2026) zeigt die Größe unter dem Namen, die Apple-Vorlage
  V `mail-anhang-kachel-download-knopf.png` (14.11.2026) zeigt keine Größe. Bleibt die Größe?
- **F8 Radius schwebend.** 10 px vorläufig angenommen („gehen wir mal davon aus dass es passt“);
  endgültig?
- **F9 Seitenleiste Reihe n/5.** Ersetzen die Schritte 2/3 und 3/3 (Lichtschein, F4a) die Einträge
  2/5 bis 5/5 (B `…IaDy8` usw.)? Laut neon offen.
- **F10 Popup-Radius.** `--mt-radius-popup` 12 px, Popover 20 px (macOS 27 Kit), 12 px wird überwiegend
  für Karten genutzt (B `…GYq_c`). Welche Stufe gilt für Menüs und Popups?
- **F11 Wer ruft den Designer und mit welchem Modell?** „mindestens Opus“ (Auftrag) gegen die Stufen
  bei hartnäckigem Rot (Fable nur unter 50 % im 5-Stunden-Fenster, A) und Volldampf-Grenzen (E
  13.11.2026). Darf der Designer Fable nutzen, und gilt das auch für die Tagesroutine?
- **F12 Fehlende Vorlagen.** Für Kontakte und Erinnerungen-Details (B `…IZM9w`), Hover/gedrückt im
  Dunkeln (B `…GYF4o`: „nicht messbar“) und den Fokusring (B `…Ih2aA`: „steht nicht im CSS“) fehlen
  Vorlagen oder Messwerte.

## 10. Eichfälle

Zehn bis fünfzehn erledigte Entscheidungen als Maßstab für künftige Urteile, dazu verworfene
Gegenbeispiele.

### Erledigt
| # | Vorher → Nachher | Begründung des Maintainers | Quelle |
|---|---|---|---|
| E1 | Aktive Kachel mit Chevron (bzw. Linie 31.10.) → gefülltes Symbol, Fläche 16 %, leiser Schatten, kein Hover | „sofort erkennbar und trotzdem ruhig“; gefüllte Symbole fein gezeichnet | M `spaces-leiste-aktiv` (2.11.2026); c69d1a4, 45da339 |
| E2 | Schnellantwort unter der Mail (Vorschlag „standardmäßig aus“) → ganz entfernt samt Einstellung | Nutzen nicht belegt, schlankes Produkt | M `nur-belegte-features` (29.10.2026); 9c3e252 |
| E3 | Antwortfeld als Kapsel → Eingabefeld mit kleinem Radius und Haarlinie | Kapsel „unpassend zum übrigen Mail-Design“ (28.10.); Regel Formen | M `pillen-nur-knoepfe`; be19867; E 5.11.2026 |
| E4 | Suchfelder eckig mit Rahmen bzw. mit Hover → Kapsel ohne Rand, ohne Hover, Fokusring erst beim Klick | wie Apple | E Regeltext „Formen“ 5.11.2026; 6303d32, 81767e6 |
| E5 | Hover bis an den Kapselrand → eingerückter Kreis um den einzelnen Knopf, Trennstrich 1 × 20 px | gemessen an Vorlagen `mail-toolbar-kapsel*.webp` | B `…GYF4o`; 5c2bcf8 |
| E6 | Pillen abgeschnitten → Spacer, dann Suchfeld bis zur Lupe, dann ganze Pillen mit Chevron-Menü | „bei apple mail werden pillen bei platzmangel niemals abgeschnitten“; „zuerst sollen die freien abstände (spacer) … minimiert werden“ | E 9.11. und 11.11.2026; 2a561cf |
| E7 | Bereiche-Leiste ohne feste Breite → 89 px, Ampel links der Linie | GitHub #46; Kachelbreite enger abgelehnt: „den schönsten email client zu bauen würde diese designänderung dem widersprechen“ | 211a634 (6.11.2026); B `…ISmC0` (12.11.2026) |
| E8 | Wunsch Tab-Leiste als Option → abgelehnt, Mails im eigenen Fenster | Apple Mail hat keine Tabs | M `tab-leiste-aus` (3.11.2026, GitHub #30) |
| E9 | Ausgeblendete Menüs → Befehle ins Ordner-Kontextmenü, Menüleiste schlank, Saved Files entfällt | Kontextmenü vor Menüleiste, ans Objekt gebunden | M `kontextmenue-vor-menueleiste` (4.11.2026, GitHub #34) |
| E10 | Aufgaben: Knöpfe über der Aufgabe → oben in der Toolbar-Zeile | „die anordnung aus bild b ist die korrekte“ | E 10.11.2026; 70e6f3a |
| E11 | Anhänge als graue Leiste → ruhige Kacheln, „Save All“ bündig mit der rechten Spalte, runder Download-Knopf | „Variante A, so an neon“; „ich möchte den save all button bündig mit der rechten spalte …“ | E 11.11.2026; 7cb3522 (14.11.2026) |
| E12 | Hilfe-Menü → bleibt wie heute (360 pt wie Apple Mail) | „bezüglich hilfe-menü - option a“ | E 11.11.2026 |
| E13 | Seitenleiste ohne Licht → Lichtschein C geneigt, gefärbte Trennlinie, per Schalter abschaltbar | „bezüglich lichtschein würde ich der empfehlung des agenten folgen“; „mit dem schalter möchte ich die farbänderung in der sidebar an- und wieder ausschalten können“ | E 13.11.2026; 4dae841, 77d3e04 |
| E14 | Today-Pane: Symbol plus Text überlappt den Titel → Knöpfe dort immer nur als Symbol | „ja a.“ | E 14.11.2026 (GitHub #62) |
| E15 | Aufgabenordner „All“ → „Open“ | Logik vor unlogischer Apple-Benennung | M `im-zweifel-apple` (3.11.2026) |

### Verworfen (Gegenbeispiele)
| # | Vorschlag | Begründung des Maintainers | Quelle |
|---|---|---|---|
| V1 | Senkrechte Linie zwischen Kachelspalte und Seitenleiste entfernen (auch kompakt, Tonunterschied, Lasche, farbiger Abschnitt) | „nein gefällt mir nicht“; „besser mit linie als ohne“; zurückgenommen 4b895aa | B `…H59Vo` (12.11.2026) |
| V2 | Aktive Kachel kräftiger färben, Seitenleiste tönen, Kachel versetzen, Rahmen 2 px (GitHub #18), Glimmen | „zu unruhig“; „stört die Harmonie der Spaces“; Rahmen „wirkt wie der macOS-Fokusring“ | M `spaces-leiste-aktiv` (Okt. bis 2.11.2026) |
| V3 | Seitenleisten-Entwürfe E „Marke“, D „Tinte“, LED-Streifen | „e gefällt mir überhaupt nicht, wir hätten dann die symbole eines jeden spaces zweimal“; getönte Auswahl „sieht nicht gut aus“; LED „zu sehr nach hier musste du hinklicken“ | B `…ISmC0` (13.11.2026) |
