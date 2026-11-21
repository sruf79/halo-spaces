# Design-Vorgaben für die Rolle „Designer“

**Stand:** live seit 14.11.2026 (Freigabe des Maintainers, Wortlaut in `ENTSCHEIDUNGEN.md`: „designer
ist jetzt freigegeben von mir. verbinde den direktor mit dem designer.“). Der Director beauftragt den
Designer im Nachtlauf (`tests/nachtlauf-auftrag.md`, Schritte 1a g und 2a) und in der Tagesroutine
(`tests/tagesroutine-auftrag.md`, Abschnitt „Designer“); Auftrag `tests/designer-auftrag.md`. Bei
Bedarf lesen, nie per `@` einbinden.

**Grundsatz dieser Datei:** Jede Regel nennt Quelle und Datum. Quellen sind ausschließlich
`ENTSCHEIDUNGEN.md` (Wortlaute), `AGENTS.md` (Konventionen), `README.md`, die Memory-Dateien des
Projekts (`~/.claude/projects/-Users-neosky-cat-halo-spaces/memory/`), Board-Einträge
(`tests/board.sh zeige|archiv-zeige <id>`), der Vorlagen-Index `~/halo-aufgaben/apple/index.md` und
die Werte im Code (`chrome/userChrome.css`, `icons/`). Zitate des Maintainers stehen in „…“ und
unverändert; was nicht wörtlich vom Maintainer stammt, ist als „Beschreibung“ oder „Deutung“
gekennzeichnet. Lücken beantwortet Abschnitt 9; die nachgelieferten Vorlagen stehen in 9a (geschlossen).

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
  aber die diskrepanz zum pillen design ist recht groß oder“. **Wie weit** der Halo über die Kachel
  hinaus gilt, ist **entschieden** (15.11.2026, Gespräch mit dem Designer, E): „wir haben uns vor
  kurzem für ein neues design der kacheln und der lichtkegeln festgelegt. dieses neue design wurde
  allerdings noch nicht released, ist also unveröffentlicht. der name dieses projects heisst
  "halo.spaces" und bezieht die farbigen buttons und die lichtkegeln sind die entsprechenden
  design-elemente. die buttons und die lichtkegeln sind das übergeordnete gestaltungsmerkmal für alle
  anderen bereiche von halo.spaces, das betrifft dialoge, popups, buttons, etc. natürlich auch
  weiterhin im hinblick auf das ruhige design von apple apps (mail, calender, etc.).“ Umsetzung nach
  G15 (Abschnitt 3), Lesart in 2a.
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

(Vorgabe des Auftrags, 14.11.2026; Wortlaute des Maintainers vom 14.11.2026 in E.)

Der Designer ist ruhig und genau. Er arbeitet nur nach den Vorgaben dieser Datei, nach Vorlagen und
nach Zitaten des Maintainers; er erfindet keine Gestaltung, die sich darauf nicht stützen lässt. Er
misst, statt zu schätzen, und sieht sich seine Bilder selbst an, bevor er etwas abgibt. Gibt es eine
Apple-Vorlage, folgt er ihr; gibt es keine, entscheidet er selbst nach diesen Vorgaben („wenn es kein
vorbild von apple gibt … kann der designer basierend auf unseren vorgaben selbst entscheiden“).
**Verantwortung (Maintainer 15.11.2026):** „ich möchte alle tasks auf der aufgabenliste welche mit optik und design zu tun haben immer dem designer übergeben. der designer ist verantwortlich für die gesamtoptik von halo.spaces“ – jeder Eintrag zu Optik und Design geht an ihn (F13), und er achtet auf die Einheitlichkeit des Ganzen (G14).
Modell: mindestens Opus, Fable nur nach der Fable-Regel (Abschnitt 11). Arbeitsauftrag: Abschnitt 11
und `tests/designer-auftrag.md`.

### 2a. Was „Halo“ heißt

Wortlaut des Maintainers (14.11.2026, E): „halo bedeutet Lichthof und bezieht sich bei unserer
extension auf die farbigen spaces und in zukunft auch auf deren lichtschein in der sidebar (wenn
diese umgesetzt wurden).“ Für den Designer heißt das (Ableitung, kein Wortlaut): Der Lichthof gehört
zu den farbigen Spaces, also zur Bereiche-Leiste, zur aktiven Kachel und (nach Umsetzung, B `…IekNU`)
zum Lichtschein in der Seitenleiste in der Farbe des aktiven Space. An Stellen ohne Vorlage überträgt
er den Gedanken nur so: Farbe und Licht kommen vom aktiven Space und bleiben leise (Lichtschein 16 %
hell / 20 % dunkel, gefärbte Linie 35 % / 30 %, Abschnitt 4); übrige Flächen und Pillen bleiben in
Ruhe neutral, ohne Farbe und ohne Leuchten; Knöpfe heben sich wie bei Apple mit feiner Kante und leisem Schatten ab (plastische Kapseln, 17.11.2026; früher „Pillen in Ruhe flach“, Empfehlung im Eintrag B `…Ih2aA`; Umsetzung Notiz an B `…I6FHI`). Wortlaut des Maintainers zum Satz (17.11.2026, Gespräch mit dem Designer): „Ja der wortlaut passt“; zur Variante: „Nein keine Vorschau ich folge deiner Empfehlung“. Die Einstellungen tragen
statt der grauen Kachelfarbe einen leisen Mehrfarb-Hauch aus allen Space-Farben (E 14.11.2026, „ja mehrfarb
hauch passt“); der Webseiten-Space hat keinen Schein (E 13.11.2026).

Lesart seit 15.11.2026 (Deutung des Designers, vom Maintainer bestätigt: „ich folge deinen
empfehlungen und möchte ein vorschaubild“; Wortlaut zum Umfang in P2): Das Halo-Licht der Kachel d2h
(E17) ist Vorbild für das **eine** hervorgehobene Element je Dialog oder Popup, den Hauptknopf (in der Systemfarbe). Alles
andere bleibt ruhig und neutral wie bei Apple: kein Rahmen, kein Glimmen, keine getönten großen
Flächen (V2, V3). Regel: G15 (Hauptknopf in der Systemfarbe mit Halo-Licht, gleich in allen Spaces).

### 2b. Rangfolge bei Konflikten zwischen Regeln

Ableitung aus den Belegen (keine ausdrückliche Rangliste des Maintainers; vom Director bestätigt
anzuwenden, bei Zweifel 2d):
1. **G1 Mail-Funktion** vor allem Design: „das design ist wichtig aber nicht das einzig wichtige“, „die
   funktionalität eines email-clients muss gewährleistet sein“ (13.11.2026).
2. **G2 nichts ersatzlos entfernen** (1.11.2026); Ausnahme nur bei belegtem Nutzen null (P7).
3. **Ausdrückliche Entscheidung des Maintainers mit Wortlaut** vor der Apple-Vorlage, die neuere vor
   der älteren (gilt auch für Einträge auf der Liste: ein jüngerer freigegebener Eintrag zur selben Stelle geht vor, 6a, Maintainer 15.11.2026). Belege: Kapsel für Knöpfe (5.11.2026) obwohl die Dialogvorlage gerundete Rechtecke
   zeigt (F4); Lichtschein-Schalter trotz „Optionen nur wie Apple“ (13.11.2026); Aufgaben-Space mit
   eigenem Vorbild (11.11.2026).
4. **G14 Einheitlichkeit** vor der einzelnen Vorlage: Der Aufgaben-Space folgt in der Optik dem
   Halo-Design, nicht Erinnerungen („optik … an vorhandenem user design von halo.spaces orientieren“,
   11.11.2026); „die spaces dürfen nicht wie unterschiedliche apps aussehen“ (14.11.2026).
   **Vorrang „aus einem Guss“** (Maintainer 15.11.2026, E: „2. ja aus einem guss hat vorrang“, Antwort
   auf Frage 2 des Designers; Deutung des Designers, kein Wortlaut): Einheitlichkeit hat Vorrang vor
   neuen Funktionen, bis die vier Bausteine aus Abschnitt 12 stehen. Davor bleiben G1 (Fehler, die die
   Mail-Funktion stören) und ein Fehler, der jedes Release verhindert (höchste Priorität, Maintainer
   15.11.2026, E). Gilt für Einträge, die zu den vier Bausteinen gehören bzw. die Einheitlichkeit
   herstellen; neue reine Funktionen stehen dahinter, Bugs davor.
5. **Apple-Vorlage** (G3), gemessen.
6. **Ruhe** (G5, 2c).
7. Eigenes Urteil nach P1 (Anspruch „großartig“), begründet im Bericht.

### 2c. Was „ruhig genug“ heißt

Aus den Belegen, messbar wo möglich:
- **Keine zusätzlichen Konturen oder Ringe** für Zustände: Rahmen um die aktive Kachel abgelehnt
  („wirkt wie der macOS-Fokusring“), Glimmen abgelehnt (M `spaces-leiste-aktiv`); Pillen in Ruhe ohne
  Haarlinie, nur Fläche (B `…Ih2aA`).
- **Kleine Kontrastschritte:** inaktive Kacheln 8 % (bis d2h 11 %, aktive 16 %), aktive Kachel d2h 34 % hell; Hover 4,5 % / gedrückt 8 % (hell),
  7 % / 12 % (dunkel); Trennlinien 8 %; kein Sprung von leise auf kräftig (Abschnitt 4).
- **Keine getönten großen Flächen:** Seitenleiste in Bereichsfarbe „zu unruhig“, getönte Auswahlfelder
  „sieht nicht gut aus“ (V2, V3); Farbe nur als leiser Schein (2a).
- **Nichts doppelt:** gleiche Symbole nicht zweimal sichtbar (Entwurf E abgelehnt, V3); kein
  Hinweis, der „zu sehr nach hier musste du hinklicken“ wirkt (LED-Streifen, V3).
- **Abstände und Maße aus Abschnitt 4**, keine neuen Zwischenwerte ohne Vorlage.
- **Keine Sprünge** in Animationen (G8); Suchfelder ohne Hover (G9).
- **Weniger Text auf einmal** (M `ui-texte-kiss`: „so wenig Information wie möglich auf einmal zeigen,
  wie Apple“).

### 2d. Letzter Ausweg

Wortlaut des Maintainers (14.11.2026, E): „wenn der designer trotz abwägung der grundphilosophie noch
immer keine entscheidung treffen konnte kann er auch mich fragen.“ Dann über den Vorschau-Weg
(Abschnitt 8): Varianten als Bilder, Empfehlung, „Wartet auf OK“.

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
  sichtbaren Scrollbalken (A Konventionen „CSS“). Der Hauptknopf bleibt in der Systemfarbe (G15 Halo-Licht).
- **G12 Kein „Apple“ nach außen.** UI, README, Store, Releases, Issues, Commit-Texte nennen Apple
  nicht (27.10.2026, M `kein-apple-nach-aussen`).
- **G13 Oberflächentexte.** Keine Gedankenstriche, Einstellungen und Onboarding schrittweise
  aufklappen (KISS) (27.10.2026, M `ui-texte-kiss`); englischer Schlüssel, Übersetzung in
  `extension/api/texte.js` (A Konventionen).
- **G14 Einheitlich in allen Spaces.** „der designer sollte sich um ein einheitliches und konsistentes
  design in allen spaces kümmern. jeder space in halo.spaces muss der selben grundphilosphie folgen,
  die spaces dürfen nicht wie unterschiedliche apps aussehen die nicht zusammengehören.“ (Maintainer,
  Gespräch mit neon, 14.11.2026, E). Ausnahme bleibt der Aufgaben-Space nur beim Vorbild (G3a), nicht
  bei der Optik („optik … an vorhandenem user design von halo.spaces orientieren“, 11.11.2026).
  Dringendste Abweichungen sind Fenster, Dialoge und Popups im originalen Thunderbird-Design
  (Maintainer 15.11.2026, E: „3. besonders stören mich aktuell popups oder fenster vom originalen
  thunderbird design, welche noch nicht via halo.spaces angepasst wurden. zum beispiel das fenster im
  kalender space das man sieht, wenn man eine invitation im kalender doppelklickt“); Programm „Aus
  einem Guss“ in Abschnitt 12, Vorrang in 2b Punkt 4.
- **G15 Halo führt.** Kacheln und Lichtkegel sind das übergeordnete Gestaltungsmerkmal für alle
  Bereiche (Dialoge, Popups, Knöpfe), im Rahmen der Ruhe der Apple-Apps (P3, G5). Wortlaut des
  Maintainers in P2 (15.11.2026, E). Je Dialog oder Popup trägt höchstens **ein** Element das Halo-Licht,
  der Hauptknopf (z. B. OK, Senden, Erstellen) in der Systemfarbe, nach der Bauart „Satt mit Licht“ (2a). Lichtkegel nur in der Seitenleiste; Dialoge und Popups bekommen keinen eigenen.
  Fokusring und Textauswahl bleiben in der Systemfarbe (G5, G11), damit sie nicht mit dem Halo
  verwechselt werden. Die genaue Form des Hauptknopfs entscheidet der Maintainer am Vorschaubild.
  **Gilt für die Umsetzung erst, wenn das Paket Lichtschein und Kachel d2h
  (`paket/lichtschein-kachel`) veröffentlicht ist.** Vorher färbt kein Lauf Dialoge, Popups oder
  Knöpfe um. Danach Bereich für Bereich mit Vorschaubildern, zuerst Dialoge mit Hauptknopf.
  Grundlage als harte Regel: Empfehlung (3) des Designers, vom Maintainer angenommen („ich folge
  deinen empfehlungen und möchte ein vorschaubild“, 15.11.2026, E).
  Hauptknopf (Entscheidung 15.11.2026, Maintainer: „ich folge deinen empfehlungen. konsistentes space-übergreifendes design ist hier wichtiger. bitte mach mir eine neue vorschau gemäß deinen empfehlungen“; Empfehlung des Designers, kein Wortlaut des Maintainers): in der Systemfarbe (G11) mit Halo-Licht (helle Kante oben, weicher Schein nach unten), gleich in allen Spaces; die Space-Farbe nur an Kacheln und Lichtkegel. Zustände: bereit, gedrückt (dunkler, ohne Licht), gesperrt (grau, flach, ohne Licht). Messwerte der Zustände nach Freigabe der Vorschau über einen Board-Eintrag; bis dahin nichts umsetzen.
  Knopf-Familie (Wortlaute des Maintainers 15.11.2026, E: „die vorschau passt. ein wichtiger zusatz - das neue button design muss natürlich für alle buttons gelten, ebenso solche, die nur ein grafisches icon beinhalten. (zum beispiel attachment-icon beim fenster einer offenen mail)“; „bei meinem zusatz meinte ich den button mit der büroklammer“; „1.knopf-familie passt so / 2. ja / 3. du brauchst mir hier kein vorschaubild machen, ich folge deiner empfehlung.“). Vorschläge des Designers, vom Maintainer angenommen (Beschreibung des Designers, kein Wortlaut): Alle Knöpfe haben dieselbe Bauart, Licht von oben, gedrückt tiefer, gesperrt flach; Farbe hat nur der eine Hauptknopf je Fenster. Hauptknopf: Systemfarbe mit Licht, unter der Maus keine Änderung (wie bei Apple), gedrückt dunkler ohne Licht, gesperrt grau und flach. Textknopf (Cancel, Save All): grau mit feiner Lichtkante oben, unter der Maus etwas dunkler, gedrückt dunkleres Grau ohne Licht und leicht nach innen, gesperrt blass und flach. Symbolknopf (z. B. Büroklammer): in der Kapsel ohne eigene Fläche wie heute; unter der Maus der runde Kreis (32 px) mit feiner Lichtkante; gedrückt dunklerer Kreis ohne Licht; gesperrt Symbol blass; ein eingeschalteter Knopf zeigt sein Symbol in der Systemfarbe; einzeln stehende Symbolknöpfe als runder grauer Knopf mit Lichtkante; die Kapsel selbst bekommt dieselbe feine Lichtkante oben. Senden-Knopf im Verfassen-Fenster: dort der Hauptknopf, Systemfarbe mit Licht und weißem Symbol, mit denselben Zuständen. Vorschauseiten: Zustände https://claude.ai/artifact/L4awnBSif1Ko3oG3h9UaPJ, Knopf-Familie https://claude.ai/artifact/NohsTn3K88aUa5tUuDapoR (Dateien ~/halo-aufgaben/vorschau/hauptknopf-2026-11-15/).

**Einspruchsgründe abschließend** (Entscheidung von Director und Designer nach Auftrag von neon,
14.11.2026; der Maintainer: „bezüglich F1 weiss ich nicht genau was du hier willst“; G15 ergänzt
mit Wortlaut des Maintainers vom 15.11.2026, E): Nur G1–G15
begründen einen Einspruch. Erweitert wird die Liste nur mit einem Wortlaut des Maintainers. Alles
andere (Farbton, Deckkraft, Schattenstärke, Radius oder Abstand innerhalb von Abschnitt 4 bzw. der
Vorlage) ist kein Einspruchsgrund; Abweichungen von Vorlage oder Messwert begründet der Designer im
Bericht. Braucht etwas das Urteil des Maintainers, entscheidet er am Vorschaubild (Abschnitt 8).
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
| Kapsel plastisch (Variante B) | `--mt-cap-fill`: hell Verlauf #FFFFFF→#F7F7F8, oben 1 px weiß, unten 1 px 13 % dunkler; dunkel 12 %→7,5 % Weiß über #1E1E1E, oben 1 px 28 %, unten 1 px 16 %; alle Schichten deckend. Seitenkante nur an den Enden 0,5 px innen (`--mt-cap-edge` 16 % schwarz / 8 % weiß), Schatten ohne seitlichen Austritt (`--mt-cap-shadow`, Streuung ≤ −Unschärfe); einzelne Kapsel `--mt-cap-solo-shadow`; gesperrt flach (`--mt-control`, ohne Kante und Schatten) | C `--mt-cap-*`; Freigabe 17.11.2026, Notiz an B `…I6FHI`; gemessen an Apple Mail (hell Fläche 249–252, Seitenkante ca. 18 %, unten ca. 7 %) |
| Kreis unter der Maus (alle Kapseln) | Ø 32 px (`--mt-cap-dot-d`) bei 38 px Kapselhöhe, Lichtkante oben `--mt-btn-ring`; gedrückt dunklerer Kreis ohne Licht mit innerem Schatten (`--mt-btn-press-in`); die Kapsel selbst ändert sich nicht | C; Nachtlauf 18.11.2026 |
| Verfassen-Kapseln | 38 px wie die Mail-Symbolleiste (`--mt-cap-h`), einzeln 63 px breit, geteilt 85 px (44 + 41), Senden 38 × 38 rund, Symbol 18 px | E Nachtrag 17.11.2026 („Ich folge deiner Empfehlung“, Möglichkeit 2; Breiten aus der Vorschau `~/halo-aufgaben/vorschau/verfassen-kapseln-2026-11-17/`); Commit d23dffc |
| Hauptknopf plastisch (Variante A) | `--mt-primary-image`: Glanz oben (Weiß 28 %) über Verlauf Systemfarbe 82 % mit Weiß → Systemfarbe → 85 % mit Schwarz; `--mt-primary-shadow`: oben 1 px Weiß 62 % / 40 %, unten 1 px Systemfarbe 62 % / 55 % mit Schwarz, Rand 0,5 px, Schatten und Schein in der Systemfarbe 40 %; gilt für Senden und alle `button.primary` | E 18.11.2026 („Variante A“); Vorschau `~/halo-aufgaben/vorschau/senden-plastisch-2026-11-18/` |
| Textknopf plastisch | `--mt-control` mit hellem Schleier (`--mt-btn-veil` 50 % weiß / 5 % weiß), Lichtkante oben, feine Kante unten (`--mt-btn-rim`), leiser Schatten; unter der Maus bleibt die dunklere Fläche durch den Schleier sichtbar, gedrückt ohne Schleier mit innerem Schatten | C `--mt-btn-lite-shadow`; 18.11.2026 |
| Knopffläche | `--mt-control` 5 % / 7 %, Hover 9 % / 12 % | C :33–34, :130–131 |
| Feldhöhe (Text- und Auswahlfelder) | 30 px wie die Knöpfe (`--mt-field-h`), in engen Zeilen 24 px (`--mt-field-h-small`: Such- und Filterbedingungen, Regel-Aktionen, Absender im Verfassen-Kopf); Suchfelder bleiben Kapseln mit eigener Höhe; Termin-Fenster wie Apple Kalender ausgenommen | E28 (17.11.2026) |
| Auswahlfeld (Wert wählen) | 30 px nach E28 (bis 17.11.2026: 26 px, in Formularen Höhe der Felder), Radius 7 px, `--mt-control`/Hover `--mt-control-hover`, ohne Rand, 13 px normal, Einzug 10 px, Doppelpfeil 14 px 7 px vom Rand | E25 (16.11.2026) |
| Suchfeld Mail-Toolbar | 333 px, schrumpft bis auf die Lupe (40 px) | C :13536–13541; G10 |
| Suchfelder auf Seiten und in Dialogen | graue Kapsel 30 px (`--mt-field-h`) mit Lupe, ohne Rand und Hover (Saved Logins, Cookies, „Files & Attachments“, Add-ons, Gespeicherte Dateien, about:config, Filterliste, OpenPGP-Schlüssel); in den Leisten bleiben die Suchfelder 38 px wie die Knöpfe dort; Kopfknöpfe der Add-ons und „Clear“ in Gespeicherte Dateien 30 px wie das Suchfeld daneben | E31 (17.11.2026) |
| Textknöpfe in Add-ons-Karten | 28-px-Kapsel | Commit 51ce69a (6.11.2026) |
| Knöpfe in Dialogen (Beispiel „Über“) | 30-px-Kapsel | Commit c6779e1 (6.11.2026) |
| Knopfhöhen-Stufen | Ziel „Knopfhöhe 30/24, Schatten Popup/Karte, Fokusring als eigene Variable“; `--mt-btn-h` 30 / `--mt-btn-h-small` 24, Knöpfe der Einstellungen seit E28 30 statt 28 px | B `…GYq_c`, Maintainer 9.11.2026: „deinen empfehlungen folgen“ (siehe F4) |
| Fokusring | `0 0 0 3px color-mix(in srgb, var(--mt-accent) 22%, transparent)` (6 Stellen, keine Variable) | C :4015, :4171, :8290; B `…GYq_c` |
| Tabellen | Schrift 13 px, Zeile 28 px, Kopf 30 px, Streifen 3,5 % / 4,5 % | C :91–94, :157 |

### Seitenleiste und Bereiche-Leiste
| Was | Wert | Quelle |
|---|---|---|
| Bereiche-Leiste | 89 px = 20 + 48 + 20 px Fläche + 1 px Linie, Ampel (bis 74 px) links der Linie | C :3120–3137; Commit 211a634 (GitHub #46) |
| Linie zwischen Kachelspalte und Seitenleiste | bleibt („besser mit linie als ohne“, 12.11.2026) | Eichfall V1 |
| Aktive Kachel (live auf `main`) | gefülltes Symbol, Fläche 16 % statt 11 %, leiser Schatten, kein Chevron, kein Hover | M `spaces-leiste-aktiv` (2.11.2026); Commit c69d1a4 |
| Aktive Kachel d2h (live auf main seit 17.11.2026, mit dem Lichtschein) | gefülltes Symbol; Fläche hell 54 % (Variante C, E36), dunkel 36 → 44 %; hell ohne weißen Glanz; Kante rundum 1 px 50 % / 35 %, rechts 80 % / 60 % mit Saum 50 % / 35 %; Lichtkante oben (Weiß 35 % / 22 %), leiser Schatten unten, Lichthof rechts 6 px 0 12 px −4 px 60 % / 45 %; hell zusätzlich farbiger Hof rundum 0 0 14 px 2 px, 45 % (in display-p3); Spacefarben hell in der P3-Fassung; inaktive Kacheln 8 %; Variablen `--mt-tile-*`; unabhängig vom Schalter; ersetzt F4a | E 14.11.2026; B `…IekSY`; E17 |
| Lichtschein | Variante D: Kern 120 × 113 px, Hauptlicht 230 × 219 px, Mitte 80 px vom Rand, je Kachel 30 px geneigt, 22 % hell (Variante C, E36) / 20 % dunkel; Linie 40 % / 30 %, volle Stärke ±55 px um die Kachelmitte, Auslauf 164 px ∓ Neigung (bei Neigung 0 wie früher ±219 px), mit Schalter aus neutral; Einstellungen als Mehrfarb-Hauch aller Space-Farben, 11 % hell / 10 % dunkel, gleiche Maße; nicht im Webseiten-Space; abschaltbar | C :2881–3016, spaces.css `#pref-category-box[mc-glow="hauch"]`; E 13.11.2026, 14.11.2026 (Variante D, Mehrfarb-Hauch); B `…IekNU`, `…IuiKQ` |
| Seitenleiste größte Breite | 360 px in allen Bereichen | C :86 |
| Seitenleistenbreite beim Start | 206 px (Variante A mit 240 px zurückgenommen; bleibt auch mit bündigen Favoriten, E20) | Commit 32f9d08; siehe F2; E 15.11.2026 |
| Schrift der Seitenleisten | Zeilen 13 px (`--mt-sidebar-font`), gewählte Zeile halbfett 600 (`--mt-sidebar-selected-weight`), Abschnittstitel 11 px halbfett grau, Zeilen 32 px (Adressbuch 34 px); gilt für Mail, Kalender, Aufgaben, Adressbuch und Chat | E29 |
| Favoriten der Ordnerliste | Symbole x = 44, Text x = 77 wie die Kontoordner; alle Abschnittstitel („Favourites“, „Tags“, übrige Ordner-Modi, Kontotitel, „On My Mac“) an einer Kante x = 37 (Kontopunkt bei 37, Name bei 52; „Kompakt“ 33); Konten unter All Inboxes/All Sent ohne Ordnersymbol, Punkt bei x = 77, Name bei 92 (auch ohne Punkt); Aufklapp-Pfeil links davon (x = 29–41); Luft über jedem Titel außer dem ersten: Mitte zu Mitte 38 px über / 27 px unter dem Titel (Normal, Titelzeile 22 px + 11 px), Kompakt 30 / 22 (20 px + 8 px), Touch 44 / 32 (26 px + 12 px); Kontotitel so hoch wie die Ordnerzeilen (GitHub #44) mit 6 px darüber; Abschnittstitel einklappbar mit dem Pfeil der Kontotitel (x = 8) | E20, E35 |

### Farben (Auswahl, hell / dunkel)
| Was | Wert | Quelle |
|---|---|---|
| Fenster | `#FFFFFF` / `#1E1E1E` (macOS-Fensterhintergrund) | C :16, :113; V `mail-seitenleiste-*-neutral-dunkel.webp` |
| Seitenleiste | `#F2F2F4` / `#282828` | C :19, :115 |
| Text, zweit, dritt | `#1D1D1F`, `#6E6E73`, `#8E8E93` / `#F5F5F7`, `#A1A1A6`, `#7C7C80` | C :21–23, :120–122 |
| Warnrot, Stern | `#FF3B30` / `#FF6961`; `#FF9500` / `#FF9F0A` (systemRed/systemOrange) | C :74, :79, :152, :155 |
| Akzent | immer `AccentColor` des Systems, keine feste Farbe; auch der Hauptknopf (G15: Systemfarbe mit Halo-Licht) | C :12; G11, G15 |
| Auswahl mit Fokus | `--mt-selection`: unter macOS `SelectedItem` (Auswahlfarbe des Systems, folgt der Akzentfarbe; bei Blau `#0064E1` / `#0059D1`), sonst `AccentColor`; Mailliste, Kontakte, Aufgaben-Rahmen, getönte Seitenleisten (22 %); ohne Fokus `--mt-selected-unfocused` | C :12–20; E33 |

### Symbole
| Was | Wert | Quelle |
|---|---|---|
| Strichstärke | 1.7 bei 16 px; gestaffelt nach Eigengröße `{8: 2.8, 12: 2.1, 16: 1.7, 20: 1.6, 24: 1.5}` (viewBox 24), Enden rund | `icons/make_icons.py:18`, `icons/make_iconvars.py:210–217`; Befund B `…GYrXA` (8.11.2026): Staffelung gewollt; siehe F5 |
| Gefüllte Symbole | „müssen fein gezeichnet werden (ausdrücklich verlangt)“ | M `spaces-leiste-aktiv` (2.11.2026) |
| Eigene Symbole | „Its own icons throughout: toolbar, folders, menus“ | README.md Z. 66 |
| Form und Farbe | Apples Bildidee und Ruhe in eigener halo-Geometrie (keine Nachzeichnung), Farbe nach Ort (Leiste Textfarbe, Seitenleiste Akzent, Zeilen grau, Zustände farbig) | Eichfall E27 (Maintainer 16.11.2026) |

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

Umsetzung (Beschreibung von neon, Deutung nicht des Maintainers):

1. **Selbstständige Beauftragung.** Wählt der Director in Nachtlauf oder Tagesroutine einen Eintrag
   mit Status Todo und Designthema (Größen, Abstände, Knöpfe, Symbole, Platzierung, Farben) als
   nächsten Schritt, beauftragt er den Designer ohne Rückfrage an den Maintainer.
2. **Vorab-Prüfung vor der Beauftragung**, Checkliste:
   - Soll-Zustand im Eintrag eindeutig (Wo, Erwartet, Ist);
   - Apple-Vorlage vorhanden (`~/halo-aufgaben/apple/index.md`) bzw. Ausnahme nach G3;
   - nötige Maße in Abschnitt 4 belegt oder aus der Vorlage messbar;
   - kein Widerspruch zu G1–G15 oder zu `ENTSCHEIDUNGEN.md`;
   - keine offene Entscheidungsfrage (Eintrag nicht „Wartet auf OK“);
   - **kein jüngerer freigegebener Eintrag zur selben Stelle** (Maintainer 15.11.2026: „Die Regel gilt
     auch in Zukunft“, `ENTSCHEIDUNGEN.md`): gibt es einen, gilt der jüngere; der ältere wird nicht
     umgesetzt, sondern mit Verweis geschlossen oder an den jüngeren angepasst.
   Ergebnis im Plan je Eintrag: „Vorab geprüft: ja“ (bzw. welcher Punkt fehlt).
3. **Lücke in der Vorab-Prüfung:** zuerst „Im Zweifel wie Apple“ (Vorlage messen) statt fragen. Nur
   bei echtem Widerspruch oder fehlender Vorlage Rückfrage über den Weg „Wartet auf OK“ (Abschnitt
   8), möglichst vor dem Lauf (Planung), nicht mittendrin; der Designer wird dann nicht beauftragt.
5. **Gruppen (Maintainer 15.11.2026):** Der Designer bildet die Gruppen aller Design-Einträge nach den vier Bausteinen (Abschnitt 12) und legt Zusammengehöriges zusammen; Priorität und Reihenfolge bleiben beim Director. Höchstens eine Gruppierung je Lauf, nur bei neuen oder geänderten Design-Einträgen; Gruppen merkt er sich in Abschnitt 10.
4. Abschnitt 9 beantwortet die bekannten Lücken; die fehlenden Vorlagen sind seit 14.11.2026 da (9a).

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
8. **Dazulernen:** Wird bei der Arbeit eine Regel oder ein Maßstab sichtbar (Messwert, Wahrnehmung,
   Entscheidung des Maintainers), trägt der Designer sie am Ende des Laufs ein: Eichfall oder Zeile unter
   „Wahrnehmungsregeln“ in Abschnitt 10, mit Datum und, wo vorhanden, Wortlaut; abgelöste Eichfälle mit
   Verweis auf den neuen markieren. Nichts ohne Beleg, keine Deutung als Entscheidung des Maintainers
   ausgeben.
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
   Grundphilosophien G1–G15 (Abschnitt 3).
2. Einspruch nur mit Zitat der verletzten Regel (Kennung und Wortlaut samt Quelle) und der Stelle im
   Ergebnis. Geschmacksfragen sind kein Einspruchsgrund (Abgrenzung in Abschnitt 3).
3. Der Designer überarbeitet **einmal**.
4. Bleibt es strittig: Eintrag auf „Wartet auf OK“ (`tests/board.sh status <id> ok`), Notiz mit
   Rückfrage an den Maintainer (beide Standpunkte, je mit Zitat der Regel, Vorschaubilder beider
   Lösungen nach Abschnitt 8), Frage im Bericht unter
   „Rückfragen an den Maintainer“ wie bei unklaren Einträgen (`tests/nachtlauf-auftrag.md` Weg f,
   Maintainer 13.11.2026: „unklare einträge sollte er lieber auf warte auf ok setzen und fragen
   hierfür in seinen morgenbericht stellen“). Nichts Strittiges wird gepusht oder veröffentlicht.

## 8. Rückfragen bei Lücken

- **Rückfragen sollen nicht entstehen** (Maintainer 14.11.2026, Abschnitt 6a): Lücken klärt der
  Director vor der Beauftragung, zuerst an der Apple-Vorlage. Ohne Apple-Vorbild entscheidet der
  Designer selbst nach diesen Vorgaben (Maintainer 14.11.2026, Abschnitt 2).
- **So bald wie möglich melden.** Wortlaut (14.11.2026, E): „wenn der direktor und/oder designer einen
  task nicht erldigen konnte weil unklarheiten entstehen müssen diese unklarheiten so bald wie möglich
  erwähnt werden. beim nachtlauf reicht der morgenbericht, untertags kann mich die session neon direkt
  kontaktieren und nachfragen“. Also beim Auftreten, nicht erst am Ende des Laufs.
- **Letzter Ausweg** (Abschnitt 2d): keine Entscheidung trotz Abwägung → Maintainer fragen, über
  Vorschaubilder wie folgt.
- **Entscheidung des Maintainers nötig → Vorschaubilder.** Wortlaut (14.11.2026, E): „wenn es
  wirklich offene fragen vom designer gibt die meine entscheidungen in bezug auf design oder grafik
  benötigen möchte ich immer anhand von vorschaubildern entscheiden, die mir der designer vorlegt.“
  Der Designer legt Varianten A/B (höchstens drei) als Bilder aus dem Testprofil an, nie mit echten
  Mails (A „Datenschutz“), hell und dunkel, bei Seitenleisten-Elementen auch schwebend; eine Zeile je
  Variante, was sich unterscheidet, und seine Empfehlung. Eintrag sofort auf „Wartet auf OK“ mit Notiz
  „Rückfrage Designer <Datum>: <Frage>, Bilder: <Pfad bzw. Link>“.
- **Weg zum Maintainer** (Beschreibung von neon, Deutung nicht des Maintainers):
  - Nachtlauf: Bilder als Dateien unter `~/halo-aufgaben/bilder/` (Name
    `<bereich>-<oberflaeche>-variante-a.png` usw., Index wie in `docs/board.md`); für das iPhone als
    private `Artifact`-Seite mit den Bildern als eigene Dateien (Bilder-Regel A „Bilder“, nie
    data:-URI). Frage im Bericht unter „Rückfragen an den Maintainer“, der Morgenbrief zeigt sie
    (höchstens 5 je Nacht). Wortlaut: „beim nachtlauf reicht der morgenbericht“ (14.11.2026, E).
  - Tagesroutine: sofort eine Meldung aufs iPhone mit Frage und Link bzw. Pfad zu den Bildern.
    Wortlaut: „bezüglich tagesroutine - wenn unklarheiten bezüglich design auftreten die ich sofort
    entscheiden muss möchte ich die nachricht aufs iphone geschickt haben“ (14.11.2026, E). Die
    Tagesroutine arbeitet inzwischen mit dem nächsten Eintrag weiter. (Ersetzt den früheren Entwurf
    „SendMessage an neon“ desselben Tages; der Wortlaut „untertags kann mich die session neon direkt
    kontaktieren“ bleibt als Weg für Sitzungen außerhalb der Tagesroutine.)
  - Heute noch nicht so gebaut: `tests/tagesroutine.sh` sammelt das Ergebnis „entscheidung“ und
    schickt erst am Tagesende eine einzige Meldung `push … tagesroutine handeln` (Zeile 754;
    `push()` in `tests/lauf-hilfen.zsh` stellt über eine kurze Haiku-Sitzung per SendMessage an
    `github.comm.routine` zu, die als „[handeln]“ aufs iPhone pusht). Umbau (nicht umgesetzt): neue
    Ergebniszeile `vorschau <id> <Pfad/Link> <Frage>` im Auftrag; das Skript ruft direkt nach dieser
    Runde `push "Designfrage: <Frage> – <Link>" tagesroutine handeln` auf und setzt den Eintrag auf
    „Wartet auf OK“, falls die Runde es nicht tat; die Tagesendmeldung zählt sie nur noch.
- Offene Design-Diskussionen erst nach Entscheidung ins Board (M `fragen-nicht-eintragen`,
  30.10.2026); Zitate des Maintainers erst nach seiner Zustimmung weitergeben (E 6.11.2026).
- Eigene Deutungen als solche kennzeichnen (A „Entscheidungen des Maintainers wörtlich“).

## 9. Entschiedene Fragen

Auftrag des Maintainers (14.11.2026, E): „deine 16 offenen fragen können sicherlich automatisch
beantwortet werden wenn man sich ansieht wie das design bei apple mail aussieht. fehlende screenshots
kann ich gerne nachliefern.“ Antworten je Frage mit Beleg; „Entscheidung“ heißt, soweit nicht als
Wortlaut des Maintainers gekennzeichnet: nach Vorlage bzw. Vorgaben entschieden (Beschreibung von
neon). Die dafür fehlenden Vorlagen hat der Maintainer am 14.11.2026 nachgeliefert (Abschnitt 9a).

- **F1 Einspruchsgründe.** Entschieden: G1–G15 sind abschließend, Erweiterung nur mit Wortlaut des
  Maintainers (Abschnitt 3, Absatz „Einspruchsgründe abschließend“).
- **F2 Favoriten.** Entschieden: Ausrichtung nach Variante A gilt (Wortlaut 11.11.2026 „bezüglich
  favoriten - option a“; Vorbild Apple Mail, V `mail-seitenleiste-ausgeklappt-dunkel.webp`). Die
  Breite folgt nicht der Zahl 240 px, sondern der Vorlage und der Bedingung, dass die Aufgabenliste
  unter Linux ESR nicht zu schmal wird (Grund der Rücknahme 32f9d08, 13.11.2026); Prüfung in
  `run_checks()`. Seit 14.11.2026 auch hell als Vorlage (`mail-hell.png`, 9a Nr. 3).
- **F3 Halo-Umfang.** Entschieden: kein Apple-Vorbild, also entscheidet der Designer nach den
  Vorgaben (Maintainer 14.11.2026: „wenn es kein vorbild von apple gibt (wie bei f3) kann der designer
  basierend auf unseren vorgaben selbst entscheiden“). Rahmen: P2, G5 (nicht wie Fokusring, ruhig),
  G9 (Suchfeld ohne Hover), G14; die Kachel F4a bleibt die Vorlage (B `…Ih2aA`). Nachtrag
  15.11.2026: Umfang vom Maintainer entschieden (Wortlaut in P2), Regel G15; Vorbild ist jetzt die
  Kachel d2h (E17, 2a).
- **F4 Knopfhöhen.** Entschieden: Stufen aus den Vorlagen messen, nicht schätzen. Toolbar nach V
  `mail-toolbar-kapsel*.webp`, `mail-toolbar-spacer.webp`, `mail-toolbar-hoehe-position.webp` (Eintrag
  B `…Iqjl4`; heute 38 px, die Messung vom 5.11. ergab ≈ 33–34 pt bei vermutlich 2×, B `…GYF4o`,
  also nachmessen); Dialoge nach V `mail-dialog-knopfleiste-*.png` (B `…GYq_c`, freigegeben 9.11.2026:
  „deinen empfehlungen folgen“, Ausgangswert 30/24). Die Form bleibt Kapsel (G9), auch wenn die
  Dialogvorlage `mail-dialog-knopfleiste-regel.png` gerundete Rechtecke zeigt (Entscheidung
  5.11.2026 geht vor).
- **F5 Strichstärke.** Entschieden aus G14 (Maintainer 14.11.2026: „der designer sollte sich um ein
  einheitliches und konsistentes design in allen spaces kümmern“): ein Symbolsatz mit derselben
  Strichstärke je Größe in allen Spaces; die Staffelung nach Größe (`icons/make_iconvars.py:210`)
  bleibt, weil sie gleich große Symbole überall gleich zeichnet und kleine nicht zu dünn werden
  (Befund B `…GYrXA`, 8.11.2026, wie SF Symbols). Verbliebene Original-Symbole werden ersetzt, weil
  sie das Bild uneinheitlich machen (B `…GYrXA`).
- **Symbole, Form und Farbe:** siehe Eichfall E27 (16.11.2026): Apples Bildidee und Ruhe in eigener halo-Geometrie, nicht abpausen; gilt zusammen mit F5 (Strichstärke) und F6 (Apple zuerst).
- **F6 Apple zuerst, sonst eigene Entscheidung.** Entschieden durch den Maintainer (14.11.2026, F3
  oben): Vorlage vorhanden → wie Apple; keine Vorlage → Designer entscheidet nach den Vorgaben;
  „nichts ändern“ nur, wenn die Vorgaben selbst widersprechen (dann Vorschaubild, Abschnitt 8).
- **F7 Größe in der Anhang-Kachel.** Der Maintainer überlässt die Entscheidung dem Designer
  (14.11.2026, E): „fraglich ist nur, ob outlook als besonders schöner und moderner email client gilt.
  andere email clients welche als schöner und moderner mit besserem design gelten haben vielleicht
  keine dateigrösse. der designer soll hier entscheiden.“ Belege:
  - Apple Mail zeigt keine Größe: V `mail-anhang-kachel-download-knopf.png` (Symbol, Name fett
    zweizeilig, runder Download-Knopf) und V `mail-anhaenge-kacheln-hover.webp` (zwei Kacheln, beim
    Überfahren nur Tooltip mit vollem Dateinamen).
  - Outlook für macOS zeigt die Größe unter dem Namen („77,9 KB“) in umrandeten Kacheln mit Chevron
    (Bildschirmfoto des Maintainers, 14.11.2026, Sitzungsbild `images/8.png`, nicht im Repo).
  - Thunderbird zeigt Größe je Anhang und die Summe (Bugzilla 623346, behoben 2011,
    https://bugzilla.mozilla.org/show_bug.cgi?id=623346; gHacks, https://www.ghacks.net/?p=22968).
  - Gmail: Die Hilfe beschreibt Anhänge unten in der Nachricht, Überfahren und Download-Symbol, nennt
    keine Größe (https://support.google.com/mail/answer/30719); nicht belegt, ob sie angezeigt wird.
  - Spark und weitere: keine belegte Aussage gefunden (Websuche 14.11.2026).
  **Entscheidung des Designers** (Entwurf, Eichfall E16): keine Größe in der Kachel, wie Apple Mail;
  die Größe steht im Tooltip hinter dem vollen Dateinamen. Begründung: Apple-Vorbild (G3) und Ruhe
  (G5: eine Zeile weniger je Kachel, Name bis zwei Zeilen lesbar, was B `…IqvDo` bemängelte); die
  Angabe fällt nicht ersatzlos weg (G2). Outlook und Thunderbird zeigen sie, gelten aber nicht als
  Vorbild (G3, Maintainer zu Outlook oben).
- **F8 Radius schwebend.** Entschieden: 10 px, gemessen an der Vorlage „Dia 3/4“ (C userChrome.css:37–41,
  Eintrag „Seitenleiste: wie Dia 3/4“, archiviert 11.11.2026, e20fb91) und vom Maintainer angenommen
  (13.11.2026).
- **F9 Seitenleiste Reihe n/5.** Entschieden für die Arbeit des Designers: Inhalt von 2/5 (Grundgerüst)
  und 3/5 (Mail) ist durch 2/3 (Lichtschein) und 3/3 (Kachel F4a) abgedeckt; 4/5 (übrige Spaces
  vereinheitlichen) bleibt als Auftrag aus G14, 5/5 als Feinschliff. Das Zusammenlegen im Board macht
  neon-board; die Einträge bleiben bis dahin auf „Wartet auf OK“.
- **F10 Popup-Radius.** Entschieden: Popover 20 px nach dem macOS-27-Kit (V
  `macos27-designkit-panels-werte.md`, C `--mt-popover-radius`); Menüs und Tooltips nach Messung an V
  `mail-kontextmenue-mailliste*.png` und `mail-toolbar-tooltip*.png`; Karten und Gruppen behalten
  12 px (`--mt-radius-popup` wird dafür passend benannt oder aufgeteilt, B `…GYq_c`).
- **F11 Modell.** Entschieden: mindestens Opus; Fable nur nach der Fable-Regel (A „Rot bleibt rot“:
  höchstens ein Fable-Agent, nur unter 50 % im 5-Stunden-Fenster; im Volldampf die Werte aus E
  13.11.2026). Gilt in Nachtlauf und Tagesroutine.
- **F12 Fehlende Vorlagen.** Kontakte und Erinnerungen-Details liegen seit 14.11.2026 vor
  (`contacts-window-*.png`, `erinnerungen-task-*.png`; B `…IZM9w` damit messbar); die übrigen
  (Toolbar-Zustände, Mail hell, Einstellungen) ebenfalls seit 14.11.2026 (9a).
- **F13 Designthema erkennen.** Entschieden: Designthema, wenn der Eintrag Aussehen oder Platzierung
  ändert (Größe, Abstand, Knopf, Symbol, Platzierung, Farbe, Schrift, Ausrichtung; Aufzählung aus dem
  Auftrag des Maintainers zur Rolle). Seit 15.11.2026 gehen **alle** Einträge zu Optik und Design an den Designer (Wortlaut in Abschnitt 2).
  Gemischte Einträge (Aussehen plus Logik): der Designer übernimmt den sichtbaren Teil, die Logik läuft
  im normalen Ablauf mit Pflichtprüfungen aus Abschnitt 11; ist das sichtbare Ergebnis der Kern, übernimmt er den ganzen Eintrag. Ebenfalls Designthema (Deutung von neon, 15.11.2026): Schritte des Programms „Aus einem
  Guss“ (Abschnitt 12), auch die Bestandsaufnahme, die nur Bilder und eine Liste erzeugt; sie ändert
  nichts am Programm und erfüllt 6a, wenn der Eintrag Ort, Ablage und Port nennt.
- **F14 Vorschaubild.** Entschieden durch den Maintainer (14.11.2026, Abschnitt 8): Vorschaubilder nur,
  wenn wirklich eine Entscheidung des Maintainers nötig ist. Ein Todo-Eintrag mit eindeutigem
  Soll-Zustand und Vorlage wird direkt umgesetzt; große Umgestaltungen bleiben Reihen n/m mit „Wartet
  auf OK“ nach jedem Schritt (M `schrittweise-reihen`).
- **F15 Vorlage selbst fotografieren.** Entschieden: ja, mit Testdaten und nur Fensterausschnitt (M
  `apple-apps-vergleich`, 26.10.2026); gilt als Vorlage, Bild mit Index nach `~/halo-aufgaben/apple/`.
  Grenze: Apple Mail ohne Konto zeigt nur den Dialog „Add Account“ (B `…GYF4o`), also Mail-Ansichten
  vom Maintainer nachliefern lassen (wie in 9a).
- **F16 Offene Einträge mit Lücken.** Entschieden: `…Iqjl4` (Toolbar) mit den Hauptfenster-Vorlagen
  aus F4 und den Zuständen `mail-toolbar-pille-hover/-active.png` (9a Nr. 1) messen; `…Ic9wY` (Sidebar-Schrift) an V `mail-seitenleiste-ausgeklappt-dunkel.webp` und
  `kalender-sidebar-minikalender-trennlinie.webp` und `contacts-window-hell/-dunkel.png` messen; `…GYrXA` nach F5;
  `…GYq_c` nach F4; `…HmgTE` nach F2.

### 9a. Nachgelieferte Apple-Screenshots (geschlossen am 14.11.2026)

Der Maintainer hat am 14.11.2026 die fehlenden Vorlagen geliefert (Wortlaut in `ENTSCHEIDUNGEN.md`:
„screenshots für 1 hab ich dir übermittelt. bei punkt 2 - bei apple mail kann man nicht mit tabulator
einen toolbar knopf auswählen, daher keine screenshots. bei punkt 3 und 4 hab ich screenshots
geschickt.“). Ablage `~/halo-aufgaben/apple/` (Index `index.md`); die Bilder zeigen echte Mails und
bleiben dort, nie im Repo. Beschreibung der Bilder von neon (Deutung nicht des Maintainers):

1. **Mail: Toolbar-Kapsel beim Überfahren und gedrückt, dunkel:** `mail-toolbar-pille-hover.png`
   (Ausschnitt: in der Gruppen-Kapsel liegt hinter dem überfahrenen Symbol ein runder, etwas hellerer
   Kreis innerhalb der Kapsel, dazu der Tooltip) und `mail-toolbar-pille-active.png` (ganzes Fenster,
   dunkel, Knopf „Antworten“ gedrückt). Maßstab für Hover und gedrückt in der Mail-Toolbar (F4, F16).
2. **Mail: Tastaturfokus auf Toolbar-Knöpfen:** keine Vorlage, weil Apple Mail ihn nicht hat (Wortlaut
   oben). **Regel** (Beschreibung von neon nach diesem Wortlaut und G2): Fokusring nur dort, wo Apple
   einen zeigt (z. B. Suchfeld beim Fokus, sichtbar in `mail-hell.png`; E4); Toolbar-Knöpfe bekommen
   keinen eigenen, auffälligen Fokusring nach Apple-Vorbild. Die Tastaturbedienung von Thunderbird
   bleibt erhalten (G2, nichts ersatzlos entfernen): was heute per Tastatur erreichbar ist, bleibt es;
   ein Einspruch nach G2 gilt, wenn eine Änderung sie bricht.
3. **Mail: Hauptfenster hell mit ausgeklappter Seitenleiste:** `mail-hell.png` (Favoriten, Konten
   Google und iCloud, „On My Mac“, Mailliste, Lesebereich, Toolbar mit Gruppen-Kapseln, Suchfeld mit
   Fokusring). Maßstab für F2 hell und die Sidebar-Schrift (F16).
4. **Mail: Einstellungen, Reiter General, hell und dunkel:** `mail-settings-allgemein.png` und
   `mail-settings-allgemein-dunkel.png` (Reiterleiste mit Symbol und Beschriftung, gewählter Reiter auf
   heller Fläche mit Akzentfarbe; Beschriftungen rechtsbündig vor Auswahlfeldern mit kleinem Radius;
   Kontrollkästchen in Akzentfarbe). Maßstab für den Einstellungen-Space (G14).

Neue Lücken meldet der Designer über den Weg in Abschnitt 8 (Vorschaubilder), nicht als Liste hier.

## 10. Eichfälle

Zehn bis fünfzehn erledigte Entscheidungen als Maßstab für künftige Urteile, dazu verworfene
Gegenbeispiele.

### Erledigt
| # | Vorher → Nachher | Begründung des Maintainers | Quelle |
|---|---|---|---|
| E1 (abgelöst durch E17, sobald d2h live ist; im Paket umgesetzt 15.11.2026) | Aktive Kachel mit Chevron (bzw. Linie 31.10.) → gefülltes Symbol, Fläche 16 %, leiser Schatten, kein Hover | „sofort erkennbar und trotzdem ruhig“; gefüllte Symbole fein gezeichnet | M `spaces-leiste-aktiv` (2.11.2026); c69d1a4, 45da339 |
| E2 | Schnellantwort unter der Mail (Vorschlag „standardmäßig aus“) → ganz entfernt samt Einstellung | Nutzen nicht belegt, schlankes Produkt | M `nur-belegte-features` (29.10.2026); 9c3e252 |
| E3 | Antwortfeld als Kapsel → Eingabefeld mit kleinem Radius und Haarlinie | Kapsel „unpassend zum übrigen Mail-Design“ (28.10.); Regel Formen | M `pillen-nur-knoepfe`; be19867; E 5.11.2026 |
| E4 | Suchfelder eckig mit Rahmen bzw. mit Hover → Kapsel ohne Rand, ohne Hover, Fokusring erst beim Klick | wie Apple | E Regeltext „Formen“ 5.11.2026; 6303d32, 81767e6 |
| E5 | Hover bis an den Kapselrand → eingerückter Kreis um den einzelnen Knopf, Trennstrich 1 × 20 px | gemessen an Vorlagen `mail-toolbar-kapsel*.webp` | B `…GYF4o`; 5c2bcf8 |
| E6 | Pillen abgeschnitten → Spacer, dann Suchfeld bis zur Lupe, dann ganze Pillen mit Chevron-Menü | „bei apple mail werden pillen bei platzmangel niemals abgeschnitten“; „zuerst sollen die freien abstände (spacer) … minimiert werden“ | E 9.11. und 11.11.2026; 2a561cf |
| E7 | Bereiche-Leiste ohne feste Breite → 89 px, Ampel links der Linie | GitHub #46; Kachelbreite enger abgelehnt: „den schönsten email client zu bauen würde diese designänderung dem widersprechen“ | 211a634 (6.11.2026); B `…ISmC0` (12.11.2026) |
| E8 | Wunsch Tab-Leiste als Option → abgelehnt, Mails im eigenen Fenster | Apple Mail hat keine Tabs | M `tab-leiste-aus` (3.11.2026, GitHub #30) |
| E9 | Ausgeblendete Menüs → Befehle ins Ordner-Kontextmenü, Menüleiste schlank, Saved Files entfällt | Kontextmenü vor Menüleiste, ans Objekt gebunden | M `kontextmenue-vor-menueleiste` (4.11.2026, GitHub #34) |
| E10 | Aufgaben: Knöpfe über der Aufgabe → oben in der Toolbar-Zeile | „die anordnung aus bild b ist die korrekte“ | E 10.11.2026; 70e6f3a |
| E11 | Anhänge als graue Leiste → ruhige Kacheln, „Save All“ bündig mit der rechten Spalte, runder Download-Knopf (Größe in der Kachel entfällt nach F7/E16, 14.11.2026) | „Variante A, so an neon“; „ich möchte den save all button bündig mit der rechten spalte …“ | E 11.11.2026; 7cb3522 (14.11.2026) |
| E12 | Hilfe-Menü → bleibt wie heute (360 pt wie Apple Mail) | „bezüglich hilfe-menü - option a“ | E 11.11.2026 |
| E13 | Seitenleiste ohne Licht → Lichtschein C geneigt, gefärbte Trennlinie, per Schalter abschaltbar | „bezüglich lichtschein würde ich der empfehlung des agenten folgen“; „mit dem schalter möchte ich die farbänderung in der sidebar an- und wieder ausschalten können“ | E 13.11.2026; 4dae841, 77d3e04 |
| E14 | Today-Pane: Symbol plus Text überlappt den Titel → Knöpfe dort immer nur als Symbol | „ja a.“ | E 14.11.2026 (GitHub #62) |
| E15 | Aufgabenordner „All“ → „Open“ | Logik vor unlogischer Apple-Benennung | M `im-zweifel-apple` (3.11.2026) |
| E16 | Anhang-Kachel mit Größe unter dem Namen → ohne Größe, Größe im Tooltip (Entscheidung des Designers, Entwurf) | Maintainer: „der designer soll hier entscheiden“; Apple Mail ohne, Outlook/Thunderbird mit Größe | F7; E 14.11.2026; umgesetzt 16.11.2026 (Tooltip „Name (Größe)“, Name 8 px neben dem Symbol) |
| E17 | Aktive Kachel F4a (Ring 40 %, Hof 9 px) → Zielbild d2h (umgesetzt 15.11.2026, live auf main seit 17.11.2026 mit dem Lichtschein; Bild-Prüfung „aktive Kachel d2h am Bild“): Fläche hell 34 % (seit E36: 54 %), dunkel 36 % links bis 44 % rechts; feine Kante rundum 1 px (hell 28 %, seit E36 50 %; dunkel 35 %), rechts 55 % (seit E36 80 %) / 60 % mit weichem Saum; hell Werte abgelöst durch E36, dunkel gilt weiter; Lichtkante oben, leiser Schatten unten; inaktive Kacheln 8 % statt 11 %; Linie geneigt in heutiger Stärke | „d2h ist jetzt zielbild.“; „bezüglich punkt 2 folge ich der empfehlung mit 8%.“ | E 14.11.2026 (`ENTSCHEIDUNGEN.md`) |
| E18 | Lichtwinkel je Kachelposition ((2,5 − Index) × 30 px) statt starrer Lichtposition; Hell und Dunkel gleiche Bauart, nur Werte getrennt abgestimmt | Designer: Licht fällt in die Seitenleiste hinein statt am Fensterrand abgeschnitten zu werden; zwei Bauarten je Modus widersprechen dem Geist von G14 | Designer 14.11.2026, vom Maintainer mit d2h übernommen |
| E19 | Halo nur an Kachel und Seitenleiste → übergeordnetes Gestaltungsmerkmal für alle Bereiche; je Dialog oder Popup nur der Hauptknopf in Systemfarbe mit Halo-Licht, gleich in allen Spaces; Space-Farbe nur an Kachel und Lichtkegel; gilt für alle Knöpfe, auch Symbolknöpfe (G15, nach Veröffentlichung des Pakets) | „die buttons und die lichtkegeln sind das übergeordnete gestaltungsmerkmal für alle anderen bereiche von halo.spaces, das betrifft dialoge, popups, buttons, etc. natürlich auch weiterhin im hinblick auf das ruhige design von apple apps (mail, calender, etc.).“; „ich folge deinen empfehlungen und möchte ein vorschaubild“ | E 15.11.2026 (Gespräch mit dem Designer) |
| E20 | (Titel- und Unterzeilen-Lage abgelöst durch E35, Rest gilt) Favoriten links eingerückt (Symbole 16 px, „Favourites“ 22 px links der Konten) → bündig in den Spalten der Konten bei unveränderter Breite 206 px; Kontonamen unter All Inboxes/All Sent dürfen mit „…“ gekürzt erscheinen (Variante A mit 240 px zurückgenommen, 32f9d08) | „anstelle dass wir die ganze logik der sidebar umbauen sollten wir den einfacheren weg gehen und den namen "local folder" optisch abkürzen falls das notwendig ist. jene user, denen der vollständige name von local folders wichtig ist, können frei die sidebar via verschiebbare trennleiste vergrössern bei bedarf.“ | E 15.11.2026 (`ENTSCHEIDUNGEN.md`) |
| E21 | Begrüßungsfenster (einmalig, nach der Installation) mit Knopfzeile wie die Dialoge (Variante A des Designers: Hauptknopf rechts) → darf von der Knopfzeile der Dialoge abweichen: breiter Hauptknopf über die ganze Breite, Nebenaktion als grauer Text darunter, wie bei Apple-Begrüßungen (Variante B); Vorschau `~/halo-aufgaben/vorschau/erststart-2026-11-16/` (b-2-hell, b-2-dunkel); Board-Eintrag JFWEI | „1. Variante B gefällt mir besser.“ (Gespräch mit dem Designer; Bestätigung als Gedächtnis-Eintrag: „ja du kannst den vorschlag ins gedächtnis eintragen“) | M 16.11.2026 (Gespräch mit dem Designer, im Protokoll des Designers gegengeprüft); Beschreibung des Designers, kein Wortlaut des Maintainers |
| E22 | Gelbe Hinweisleiste „blocked remote content“ über die ganze Breite (dunkel grell #FFE900, Schließen am Rand abgeschnitten) → graue Karte wie der Hinweis über der Mailliste (10 px Rand, Radius 10, Fläche 4,5 % / 6,5 %, Text in Textfarbe, Symbol grau, „Preferences“ als graue Kapsel 24 px, Schließen rund 24 px); Menüs mit Text bei 19 oder 40 px → eine Textspalte in allen Menüs, Häkchen links davor im Rand, kein leerer Platz für Symbole (Variante A der Sammelvorschau 16.11.) | „Ja beides A“ (Antwort auf „Soll ich für die Leiste und die Menüs jeweils A an neon-board geben?“) | E 16.11.2026 (Gespräch mit dem Designer), B `…hJE-EY`; Vorschau `~/halo-aufgaben/vorschau/sammel-2026-11-16/` |
| E23 | Gewählter Chat in der Liste „Conversations“ voll blau (#007AFF) mit weißer Schrift und blauem Strich links → Auswahl wie in der Ordnerliste der Mail: grau `--mt-selected-unfocused` (#DFDFE0 / #3D3D3D auf der Seitenleiste), Schrift in Textfarbe, Symbol unverändert grau, Radius `--mt-radius-row`, mit Fokus in der Liste in der Akzentfarbe 22 % getönt wie Ordnerliste und Adressbuch; Thunderbirds Strich und Ränder an der Auswahl entfallen (Sammelvorschau 16.11., chat-a) | „Ja“ (Antwort auf „Soll der gewählte Chat grau werden wie in der Mail-Seitenleiste, statt voll blau?“) | E 16.11.2026 (Gespräch mit dem Designer), B `…hJE-hA`; Vorschau `~/halo-aufgaben/vorschau/sammel-2026-11-16/`; Fokus-Tönung und Wegfall des Strichs: Entscheidung des Designers nach G14 |
| E24 | Verfassen-Kopf mit » für weitere Kopfzeilen und × links vor der Beschriftung; Suchleiste mit × links, Pfeilen einzeln, Trefferzahl hinter den Optionen, rosa Feld bei „nicht gefunden“ → „…“ (halo-Symbol) als runder Symbolknopf 24 px (in Ruhe ohne Fläche, unter der Maus `--mt-control`); Entfernen als grauer Kreis 16 px (`--mt-text-tertiary`) mit ausgespartem halo-× rechts am Zeilenende, weiter nur unter der Maus; Suchleiste (Verfassen und Leseansicht gleich): graue Kapsel 24 px mit Lupe, Trefferzahl bzw. „nicht gefunden“ grau rechts im Feld, Pfeile als Paar in einer Kapsel mit Trennstrich, „Done“ und „Replace…“ als graue Textkapseln, „Done“ rechts außen, alle Optionen sichtbar; kein rosa Feld und kein gelbes Blinken beim ersten Gebrauch (Entscheidung des Designers nach V3); Lichtkante der Knopffamilie erst mit dem Paket (G15) | „variante a“ (Antwort auf „Welche Variante soll es werden, A oder B?“); „Beides ja“ (Antwort auf Frage 2 „Soll die Suchleiste in der Leseansicht einer Mail genauso aussehen wie die freigegebene im Verfassen-Fenster?“) | E 15.11.2026 (Gespräch mit dem Designer), B `…I-iRg`; Vorschau `~/halo-aufgaben/vorschau/symbole-verfassen-2026-11-15/`, umgesetzt 16.11.2026 (Bilder `~/halo-aufgaben/vorschau/verfassen-symbole-2026-11-16/`) |
| E25 (Höhe 26 px abgelöst durch E28) | Auswahlfelder in zwei Bauarten (Kapsel 28 px in den Einstellungen, Kapsel 26 px in den Kontoeinstellungen, HTML-Feld 29 bzw. 37 px mit Rand, „Density“ halbfett) mit Thunderbirds Pfeil nach unten; Aufklapp-Pfeile und Häkchen im Kästchen als Thunderbird-Originale (`nav-down-sm.svg`, `overrides/check.svg`) → eine Bauart für menulist und select: graues Feld `--mt-control` (Hover `--mt-control-hover`) ohne Rand, Radius 7 px (`--mt-radius-field`), 26 px (in Formularen mit höheren Feldern deren Höhe: Dialoge 28, Kontakt 34 px), Schrift 13 px normal in Textfarbe, Einzug 10 px, rechts der neue halo-Doppelpfeil `chevron-updown-14.svg` (14 px, Strich 2.3, 7 px vom Rand, 8 px nach dem Text); Knöpfe mit Menü behalten den einfachen Pfeil; Aufklapp-Pfeile als halo-Pfeil `nav-down-12.svg` (12 px, Strich 2.1, zu nach rechts gedreht); Häkchen `check-box-12.svg` (12 px, Strich 3.4, so kräftig wie bisher) weiß auf der Systemfarbe; Termin-Fenster wie Apple Kalender, Datum/Uhrzeit, Schnellfenster und Absender im Verfassen-Kopf (nur Doppelpfeil, kein Feld) ausgenommen; Lichtkante der Knopffamilie erst mit dem Paket (G15) | „a“ (Antwort auf „Welche Variante soll es für die Auswahlfelder werden, A oder B?“) | B `…I-fDI` (15.11.2026, Gespräch mit dem Designer); Vorschau `~/halo-aufgaben/vorschau/symbole-2026-11-15/`, umgesetzt 16.11.2026 (Bilder `~/halo-aufgaben/vorschau/symbole-pfeil-2026-11-16/`); Strich des Doppelpfeils und des Häkchens nach der freigegebenen Vorschau statt nach der Staffel (Befund des Designers) |
| E26 | Seltene Thunderbird-Symbole: „Anhänge anordnen“ mit kräftigen schwarzen Flächen-Pfeilen, Teilnehmer-Dialog mit Kopf-gefüllten Figuren, Reißzwecke für Raum und Kreis-Zoom, Einladung in der Mail mit gelben Figuren, grünem Plus, schwarzem Dreieck, Tabelle mit Rahmen und Doppelpunkten → halo-Pfeile grau (`--mt-text-secondary`), neu `move-first`, `move-last`, `move-together` (16 px, Strich 1.7); Teilnehmer: Person ganz gefüllt (`user-fill.svg`) = Pflicht, Linie = optional und alle Arten, blass = nimmt nicht teil, Stern = Vorsitz, Ortsnadel = Raum, Zoom − und + als runde graue Symbolknöpfe 24 px (`--mt-control`); Einladung in der Mail wie das Einladungsfenster: graue Karte Radius 12 ohne Rand, Zeilen mit Haarlinie, Beschriftungen grau rechtsbündig ohne Doppelpunkt, halo-Pfeil, Initialen im grauen Kreis 24 px, Adresse grau daneben (eigene als „You“), rechts Zusage-Stand nur bei Teilnehmern (zugesagt grüner Haken, offen graues Fragezeichen; vielleicht orange, abgesagt rot nach Apple Kalender, Entscheidung des Designers), Organisator ohne Zeichen (ORGANIZER trägt meist keinen Stand); Lichtkante der Zoom-Knöpfe erst mit dem Paket (G15) | „Ja Variante a is in Ordnung.“ (Antwort auf „Sind ‚Anhänge anordnen‘ und der Teilnehmer-Dialog so in Ordnung, und welche Variante soll es für die Einladung in der Mail werden, A oder B?“) | B `…I-pbI` (15.11.2026, Gespräch mit dem Designer); Vorschau `~/halo-aufgaben/vorschau/symbole-selten-2026-11-15/`, umgesetzt 16.11.2026 (Bilder `~/halo-aufgaben/vorschau/symbole-selten-2026-11-16/`); Zoom 24 statt 26 px der Vorschau nach der Stufe 30/24 und E22/E24 (Befund des Designers) |
| E27 | Symbole: Jedes Symbol mit einer Apple-Entsprechung bekommt Apples Bildidee und Ruhe, in eigener halo-Geometrie; keine Nachzeichnung eins zu eins (Strichstärke nach F5, runde Enden, keine Apple-Dateien). Apple ist Maßstab für Ruhe und Bedienung, nicht Vorlage zum Abpausen. Eigenständig zeigt sich halo.spaces im Licht, in der Geometrie und in den Details. Ohne Apple-Entsprechung entscheidet der Designer nach denselben Linien. Die Farbe richtet sich nach dem Ort, wie bei Apple: Symbolleisten und runde Symbolknöpfe in Textfarbe (`--mt-text`); Seitenleiste in Akzentfarbe; Symbole in Zeilen, Feldern und Hinweisen grau (`--mt-text-tertiary` bzw. `-secondary`); Zustände farbig (Stern orange, Warnung rot, Zusage grün). Gesperrt bleibt blass. Erläuterung (Deutung des Designers, kein Wortlaut des Maintainers): Von Apple übernommen werden die Bildidee (ein Antwortpfeil bleibt ein Antwortpfeil), die Ruhe (wenige Farben, Grau für Nebensächliches) und die Bedienung (wo Dinge stehen, wie sie reagieren). Eigenständig bleiben Geometrie (Rundungen passend zu Kapseln und Kacheln, eigene Strichstaffel F5, runde Enden, eigene Proportionen; verwandt, aber nicht als Kopie erkennbar), Licht (Kacheln, Lichtkegel, Logo, Hauptknopf, Leuchtring) und Details (Zustände mit halo-Licht, leere Ansichten, Begrüßung). Unverändert gelten die Aufbau-Vorgaben „exakt wie Apple Mail“ für Höhe und Position der Mail-Leiste (14.11.) und „pixelgenau“ für den Termin-Schnelldialog; sie betreffen den Aufbau, nicht das Erscheinungsbild. Maintainer 16.11.2026, 16:47 Wiener Zeit, Sitzung designer, Wortlaut: „wir müssen hier nur vorsichtig sein - wir wollen nicht apple produkte 1:1 kopieren ansonsten verlieren wir unsere selbstständigkeit als schönster und bester email-client. wir müssen unseren eigenständigen weg finden der sowohl apples ruhige designsprache nutzt aber gleichzeitig auch seinen eigenen weg findet.“ Freigabe des Vorschlags: „ja“ (16:47). Auslöser: Vergleich der Hauptsymbole 16.11.2026, gemessen Apples Symbole schwarz (0,0,0), unsere #444445, Apples Lupe grau, unsere schwarz (Board JNIy0). Maintainer 16.11.2026, Gespräch mit dem Designer: „Dann setzen wir Variante A um“ (16:26) und „ja“ (16:45) auf die Frage, ob der Grundsatz ins Gedächtnis und die Durchsicht aller Symbole als Erweiterung von GYrXA an neon und neon-board gehen soll; seine Frage davor: „wir können hier 2 wege gehen - entweder wir kopieren apple wie es auch unser grundphilosophie entspricht. oder - was ebenfalls unserer grundphilosophie entspricht - wir versuchen eine eigenständige icon-sprache für halo.spaces zu finden, welches zum schönsten und besten email-client passt und optisch umwerfend aussieht. zu welcher grundidee tendierst du?“ (Formulierung des Grundsatzes: Designer) |
| E28 | Sieben Feldhöhen (24, 26, 28, 29, 32, 34, 37 px; Einstellungen 26/29, Dialoge 28, Kontakt 34 mit 8 px Ecken), Knöpfe der Einstellungen 28 px, Doppelpunkte uneinheitlich („Location:“ mit, „Density“ ohne) → Text- und Auswahlfelder 30 px wie die Knöpfe (`--mt-field-h`), Knöpfe der Einstellungen 30 px, enge Zeilen 24 px (`--mt-field-h-small`: Bedingungen und Aktionen in Suchen, Regeln und Adressen suchen, Absender im Verfassen-Kopf), alle Felder 7 px Ecken, Suchfelder bleiben Kapseln; Beschriftungen von Feldern ohne Doppelpunkt in Fenstern, Dialogen und Einstellungen, Ausnahme Verfassen-Kopf („To:“, „Subject:“); einleitende Sätze vor einer Liste (Legenden, Beschreibungen, Kästchen oder Optionen ohne Feld dahinter) und lange Sätze (Komma oder mehr als acht Wörter) behalten ihn (Deutung des Designers) | „Beide Varianten A. Alle Empfehlungen umsetzen“ (Antwort auf „Welche Varianten sollen es werden: A und A, oder eine andere Kombination?“) | B `…I_AFI` (15.11.2026, Gespräch mit dem Designer); Vorschau `~/halo-aufgaben/vorschau/felder-2026-11-15/`, umgesetzt 17.11.2026 (Bilder `~/halo-aufgaben/bilder/felder-2026-11-17/`) |
| E29 | Gewählter Eintrag der Seitenleisten mal halbfett (Kalender, Aufgaben), mal normal (Mail, Adressbuch); Chat-Liste mit etwa 11 px und 52 px hohen Zeilen, Pfeil vor „Conversations“ immer sichtbar → in allen Seitenleisten Zeilen 13 px, die gewählte halbfett (600) auf der grauen Fläche, Abschnittstitel 11 px halbfett grau; Chat-Zeilen 32 px, Name 13 px, Pfeil nur beim Überfahren wie in der Mail; ungelesene Ordner ohne Auswahl bleiben normal, gewählt auch ungelesen halbfett; Zahlen, Schlösser, „Enable“ und Pfeile bleiben; Chat-Auswahl grau nach E23 unverändert | „Variante A“ (Antwort auf die Vorschau „Schrift der Seitenleisten“, Empfehlung A: gewählter Eintrag überall halbfett) | B `…Ic9wY` (16.11.2026, Gespräch mit dem Designer); Vorschau `~/halo-aufgaben/vorschau/seitenleisten-schrift-2026-11-16/`, umgesetzt 17.11.2026 (Bilder `~/halo-aufgaben/vorschau/seitenleisten-schrift-2026-11-17/`); Anwendung auf Verteilerlisten und den gewählten ungelesenen Ordner: Deutung des Designers |
| E30 | Hauptsymbole: Antworten, Allen antworten, Weiterleiten als dünner Linienpfeil, Symbole der Leisten 82 % Textfarbe (#444445), Papierkorb mit zwei Strichen, Lupe schwarz mit getönter Fläche → hohle Pfeilform in halo-Geometrie (Grundriss Dreieck plus Schaft, rundum um 2,2 aufgeweitet, Kontur nach F5, Spitze, Kopfecken und Schweifende rund; Allen antworten mit zweitem Kopf nur als Kontur mit Luft; Umleiten und Antworten an Liste in derselben Bauart; Zeichnung `icons/hohlpfeil.py`), Symbole der Leisten und Symbolknöpfe in `--mt-text` (gesperrt Deckkraft 0,4), Papierkorb mit drei Strichen und höherem Korb überall (Leiste, Ordnerliste, Menüs), Lupe aller Suchfelder in `--mt-text-tertiary` ohne Fläche; Größe in der Leiste unverändert 22 px (gemessen: Pfeil 29 px hoch in 2x wie bei der Vorlage) | „Dann setzen wir Variante A um“ (16.11.2026, 16:26); „ja variante ist gut“ (16.11.2026, 17:01, auf die Probe der drei Antwortpfeile) | B `…JNIy0`; Vorschau `~/halo-aufgaben/vorschau/hauptsymbole-2026-11-17/`, umgesetzt 17.11.2026 (Bilder `~/halo-aufgaben/vorschau/hauptsymbole-umsetzung-2026-11-17/`); Größe und Deckkraft: Befund des Designers |
| E31 | Suchfelder auf Seiten 28 px (Add-ons, Gespeicherte Dateien, about:config, Filterliste, OpenPGP) bzw. 32 px („Files & Attachments“), in den Dialogen Saved Logins und Cookies weißes Feld 28 px mit Rahmen und 7 px Ecken → alle als graue Kapsel 30 px wie die Felder (E28), Lupe bleibt, kein Hover, Fokusring erst beim Fokus; die Suchfelder in den Leisten bleiben 38 px | „bezüglich sieben kleine fragen: hier folge ich alle deinen empfehlungen.“ (Antwort auf Frage 1 „Suchfelder: welche Höhe?“, Empfehlung des Designers: „In den Leisten bleibt es bei 38 px wie die Knöpfe daneben. Auf Seiten und in Dialogen werden Suchfelder graue Kapseln mit 30 px“) | B `…Jgnjk` (17.11.2026, Gespräch mit dem Designer); Vorschau `~/halo-aufgaben/vorschau/kleine-fragen-2026-11-17/`, umgesetzt 18.11.2026 (Bilder `~/halo-aufgaben/bilder/suchfelder-dialoge-2026-11-18/`); Kopfknöpfe der Add-ons und „Clear“ 30 px nach Frage 2 derselben Seite („keine eigene 28-px-Stufe“), mitgezogen, weil sie neben dem Suchfeld stehen (Befund des Designers) |
| E32 | „Save All“ der Anhänge als graue Kapsel mit Lichtkante (Textknopf der Knopf-Familie) → in Ruhe nur grauer Text „Save All ⌄“ (12 px, 400, wie die Anzahl), ohne Fläche; unter der Maus die Kapsel der Knopf-Familie mit Trennstrich, gedrückt dunkler; Lage, Höhe und Menü unverändert (Soll und Ausnahme von „alle Knöpfe plastisch“ sind Deutung des Designers) | „bezüglich save all - ich würde hier gern einen dezenten hinweis und keinen grossen button haben und folge deinen empfehlungen“ | E 18.11.2026 (Gespräch mit dem Designer), B `…Jwnm8`; umgesetzt 19.11.2026 (Bilder `~/halo-aufgaben/bilder/saveall-2026-11-19/`) |
| E33 | Gewählte Mail, Kontakt und Aufgaben-Rahmen mit Fokus in der Knopffarbe `AccentColor` (#007AFF, dunkel grell) → Auswahlfarbe des Systems `--mt-selection` (macOS `SelectedItem`, hell #0064E1, dunkel #0059D1, folgt der Akzentfarbe; Windows/Linux weiter Knopffarbe); Hauptknöpfe und Schalter behalten die Knopffarbe, ohne Fokus grau | „das sieht optisch nicht ansprechend aus. bei apple mail sieht eine ausgewählte email so aus (screenshot 2). ich würde gern halo.spaces hier anpassen.“; „die selbe farbe wird auch bei der auswahl im addressbuch und bei den rahmen eines ausgewählten tasks im tasks space benutzt. sollten wir auch angleich oder?“ | E 18.11.2026 (Gesprächskanal designer); B `…J8osE`; umgesetzt 19.11.2026 |
| E34 | Verfassen-Fenster mit Titeltext „Write: … – Thunderbird“, Kopfzeilen From oben und 26 bzw. 40 px hoch, Beschriftungen bis 8 px außer der Mitte, Haarlinie nur teils → kein Titeltext (Fenstertitel bleibt für Fensterliste und Menü „Window“), Reihenfolge To, Cc, Bcc (weitere über „…“), Subject, From als graues Auswahlfeld mit Doppelpfeil; jede Zeile 37 px mit Haarlinie ab 20 px vom Rand bis rechts, Beschriftung grau mit Doppelpunkt, Wert 6 px dahinter, beide mittig in der Zeile; Cc, Bcc und „…“ rechts in der To-Zeile; ohne Formatleiste keine zweite Linie unter From | „Empfehlung A passt.“ (auf „Kopfzeilen: A oder B?“); „beim verfassen fenster kein name des fensters mehr anzeigen“; „die formularfelder und der darin enthaltene text sind von der höhe her nicht mittig“ | E 15.11.2026 (Gespräch mit dem Designer, Vorschau „kopfzeilen“) und 19.11.2026 (Gesprächskanal designer); B `…Ia-H0`; umgesetzt 19.11.2026, am 20.11.2026 wegen roter Linux-CI auf Nebenzweig `pruef/rot-PVTI_lAHODEPpks4BoBQwzhIa-H0` |
| E35 | Favoriten ausgeklappt unruhig: sechs linke Kanten, doppeltes Ordnersymbol bei den Konten unter All Inboxes/All Sent, Titel ohne Luft darüber → Variante A ohne Linien: alle Abschnittstitel an einer Kante (x = 37), Konten darunter nur mit Kontopunkt (x = 77) und Name (x = 92), über jedem Titel mehr Luft als darunter (Normal 38/27 px Mitte zu Mitte, Kompakt Titelzeile 20 px + 8 px), „Tags“ und übrige Ordner-Modi an derselben Kante, Abschnittstitel einklappbar wie die Konten | „mir gefällt noch immer nicht das spacing der ordnerliste im mail space wenn die favoriten ausgeklappt sind … das sieht sehr unsymmetrisch und optisch einfach nicht gut aus gemäß unseren design richtlinien“; „ok dann setzen wir A um“; „Bezüglich 1 und 2 folge ich deiner Empfehlung“ (Tags und Ordner-Modi an der Kante, Favourites einklappbar) | E 17.11.2026 (Gespräch mit dem Designer); B `…Jd9ZM` (mit `…J8EFA` zusammengelegt, „den empfehlungen des fable agenten folgen“, 18.11.2026); GitHub #68; umgesetzt 19.11.2026 (Bilder `~/halo-aufgaben/bilder/favoriten-abstaende-2026-11-19/`) |
| E36 | Hell pastellig → Hell leuchtend (Variante C): Kachel Fläche 54 %, Kante 50 %, rechts 80 %, Saum 50 %, Hof rechts 60 %, kein weißer Glanz, Lichtkante 35 %, farbiger Hof rundum 0 0 14 px 2 px 45 %; Schein 22 %, Hauch Einstellungen 11 %, Linie 40 %; Spacefarben hell in P3; dunkel unverändert (Bild-Prüfung „aktive Kachel d2h am Bild“, „hell farbiger Hof rundum“) | „im endeffekt geht es ja nicht darum dass dunkel und hell eine 1:1 kopie voneinander im kontrast sind sondern wie die optik und die effekte fürs auge wirken“; „ja c ist gut“ | E 17.11.2026 (Gespräch mit dem Designer); B `…Ji1aI` |

### Wahrnehmungsregeln aus Entscheidungen (vom Designer fortzuschreiben, Abschnitt 6b Schritt 9)
- Eine je Bereich wechselnde Knopffarbe lässt Bereiche wie getrennte Apps wirken (G14); Bereichsfarbe nur dort, wo der Bereich eindeutig ist (Kachel, Lichtkegel). (15.11.2026, Hauptknopf; Antwort des Maintainers auf Frage 2: „ja“)
- Ein gedrückter Knopf wird tiefer und dunkler, nie heller oder blasser; blass liest sich als aus oder gesperrt. (15.11.2026, Hauptknopf; Antwort des Maintainers auf Frage 2: „ja“)
- Eine einseitig helle Kante liest das Auge als Lichtkante einer Fase: das Objekt wirkt gekippt oder angehoben. Ein Helligkeitsgefälle quer über eine Fläche ist ein starkes Signal für eine geneigte Fläche (14.11.2026, Kachel d2b; Lösung d2h: gleichmäßige Fläche, rundum feine Kante, rechts nur weich betont).
- Gleich starke, kräftige farbige Kontur rundum wirkt wie ein Rahmen oder Fokusring und ist verworfen (V2); die Lichtrichtung geht verloren.
- Hell und Dunkel nutzen dieselbe Bauart; nur Werte dürfen sich unterscheiden (Querverlauf, Kantenstärke), damit die Wirkung gleich ist (G11, G14). Wenn die Neigung hell stärker wirkt als dunkel, liegt es an der Umgebung der blassen Fläche, nicht an stärkerem Verlauf. Seit 17.11.2026 erweitert durch die folgende Regel: Außer Werten dürfen sich auch Farben und Schein unterscheiden (Deutung des Designers).
- Hell und Dunkel sollen für das Auge gleich wirken; die Mittel dürfen sich dafür unterscheiden (Werte, Farben, Schein). (17.11.2026, Kachel und Lichtschein im Hellen, Variante C, Ji1aI. Wortlaut des Maintainers: „naja im endeffekt geht es ja nicht darum dass dunkel und hell eine 1:1 kopie voneinander im kontrast sind sondern wie die optik und die effekte fürs auge wirken“. Den Satz hat der Designer formuliert, der Maintainer hat ihn am 17.11.2026 bestätigt: „Nur ersten Satz“. Ein zweiter Satz „Die Form (erhaben oder eingelassen) bleibt in beiden Modi gleich“ wurde nicht aufgenommen; ob die Kachel im Hellen eingedrückt sein darf, bleibt offen.)
- Schalter „Lichtschein“ aus heißt: auch die Farbwirkung der Trennlinie aus (Maintainer 14.11.2026); geprüft in allen Spaces, eingeblendet und schwebend (15.11.2026).
- Bündige Spalten gehen vor ungekürzten Namen: Lieber ein Name mit „…“ als eine Spalte, die aus der Flucht springt, oder eine breitere Standardbreite, die allen Bereichen Platz nimmt; wer den ganzen Namen braucht, zieht die Seitenleiste breiter (Deutung des Designers aus E20, 15.11.2026).
- Popup-Rundung je nach Art: Menüs, Auswahllisten und Tooltips 12 px (`--mt-radius-popup`); Popover mit eigenem Inhalt, z. B. Termin-Schnellfenster und „Anhänge anordnen“, 20 px (`--mt-popover-radius`, macOS 27); Datumswahl (Mini-Kalender am Feld) 6 px wie Apple (Vorlage apple/kalender-termin-datum-minikalender.png). Anlass: Die Bestandsaufnahme vom 15.11. meldete 6 px und 20 px als Abweichung von 12 px; beide stimmen mit Vorlage bzw. Maß überein (Fehlalarm des Rundgangs). Abweichungen vom häufigsten Wert sind nicht automatisch Fehler: erst die Art des Elements bestimmen, dann gegen den passenden Wert prüfen. Die Rundgang-Messung (Ausreißer „Popup-Radius“) muss künftig nach Art unterscheiden. (15.11.2026; Frage des Designers: „Soll ich als Lehre ins Gedächtnis des Designers eintragen lassen, dass der Rundgang Popups je nach Art misst und nicht alles an 12 px? Meine Empfehlung: ja.“, nachgefragt mit der ausformulierten Regel; Antwort des Maintainers: „ja“; Befund des Designers)
- Ein Hinweis ist keine Warnung: Hinweise (z. B. entfernte Inhalte blockiert) als leise graue Karte; Warnfarbe nur, wo der Nutzer handeln muss oder Gefahr droht (Junk, Betrug), damit Gelb seine Bedeutung behält (Deutung des Designers aus E22, 16.11.2026; Junk- und Betrugsleiste darum weiter gelb).
- Vor einer Regel „die meisten Menüs …“ alle Menüs messen: Die Bestandsaufnahme vom 15.11. nannte 19 px als häufigsten Texteinzug; gemessen am 16.11. (Rundgang, 31 Menüs) hielten 27 eine leere Symbolspalte (Text bei 37 px statt 15 px, gemessen ab Popup-Rand; frei waren nur Menüs mit Klasse `no-icon-menupopup`) – die Freigabe „eine Textspalte“ betraf darum fast alle Menüs (Befund des Designers, 16.11.2026).
- Gleiche Elemente, gleiche Zustände: Wird eine Auswahl „wie in der Mail-Seitenleiste“ übernommen, dann mit allen Zuständen (ohne Fokus grau, mit Fokus getönt) und ohne Thunderbirds zusätzliche Marken (Strich links, Ränder), sonst bleibt der Bereich doch anders. Beim Chat liegt der Fokus nach dem Klick im Eingabefeld, sichtbar ist also meist das Grau (Deutung und Befund des Designers aus E23, 16.11.2026).
- Ein Zeichen, eine Bedeutung: Ein Symbol, das in halo schon etwas anderes bedeutet (» = ausgeblendete Knöpfe der Werkzeugleiste, G10), wird nicht für eine zweite Sache benutzt; für „mehr“ steht überall „…“ (Deutung des Designers aus E24, 16.11.2026).
- Blinken ist Auffordern: Ein Feld, das von selbst gelb blinkt (Thunderbirds Hinweis beim ersten Gebrauch der Suchleiste), wirkt wie der verworfene Leuchtstreifen (V3, „zu sehr nach hier musste du hinklicken“) und bleibt aus; Zustände zeigt ein leiser grauer Text im Feld (Deutung des Designers aus E24, 16.11.2026).
- Zwei Pfeile, zwei Bedeutungen: Doppelpfeil (oben und unten) heißt „Wert wählen“, einfacher Pfeil nach unten „Menü mit Befehlen“; ein Auswahlfeld bekommt darum nie den einfachen Pfeil, ein Knopf mit Menü nie den Doppelpfeil (Beschreibung des Designers im Eintrag `…I-fDI`, mit Variante A freigegeben 15.11.2026).
- Ein Häkchen im Kästchen ist eine Marke, kein Liniensymbol: Es darf kräftiger sein als die Staffel für 12 px (Strich 3.4 statt 2.1), damit es auf der Systemfarbe so deutlich bleibt wie bisher; der Doppelpfeil folgt der freigegebenen Vorschau (2.3 bei 14 px). Grundsatz: Ist ein Strich in einer freigegebenen Vorschau gezeigt, gilt dieser Wert vor der Staffel (Befund des Designers, 16.11.2026).
- Ein Zeichen nur, wo es etwas weiß: Der Zusage-Stand erscheint nur bei Personen, deren Stand die Einladung trägt (Teilnehmer); der Organisator bekommt kein Zeichen, weil Thunderbird ihn ohne Angabe als „offen“ führt und ein Fragezeichen dort falsch wäre. Rolle und Stand bleiben im Tooltip der Zeile (G2) (Befund des Designers aus E26, 16.11.2026).
- Original-Symbole, die Thunderbird als `<img src>` setzt (Aufklapp-Pfeile, Anhänge im Verfassen, Aufgabenfilter, Sortierpfeile), lassen sich mit `content: url(resource://mailcards/…)` ersetzen; `resource:`-Grafiken laden auch in Dialogen, deren CSP nur `chrome:` erlaubt (Standardprogramm, Editor-Dialoge), `data:` dort nicht. Der Rundgang (`tests/tour-messung.js`) liest bei `<img>` darum zuerst `content` (Befund des Designers, 16.11.2026).
- Eine Vorschau aus einem temporären Stilblatt lässt sich 1:1 übernehmen, wenn die Werte als `--mt-`-Variablen mit Hell- und Dunkelwert eingesetzt werden; Abgleich am Pixel gegen die Vorschau-Rohbilder (Abweichung ≤ 5 Stufen nur durch Rundung 1x/2x) belegt die Übernahme (15.11.2026, d2h).
- Eine Auswahlliste unter einem Feld ist mindestens so breit wie das Feld in voller Breite, nicht wie das gerade geschrumpfte Feld: Die Chat-Suche (Feld bei wenig Platz 119 px) zeigte ihre Vorschläge 119 px breit, der Eintrag „Messages mentioning: …“ war abgeschnitten. Jetzt 333 px wie das Suchfeld in voller Breite, bündig mit dem Feldende am Rand der Leiste, aber nie über den Fensterrand hinaus (höchstens bis 8 px davor): Unter Windows ist das Feld auch bei breitem Fenster nur 113 px, die Liste reicht dort links über das Feld hinaus, bleibt aber im Fenster (erster Versuch 8229c2f zurückgenommen, 18.11.2026). Thunderbird setzt die Breite der Liste über `--panel-width` (inline) auf die Feldbreite; nur `width` am Panel reicht nicht, die Liste darin bleibt schmal (Befund des Designers, 17.11.2026, Eintrag `…JHMdQ`).
- Ein Doppelpunkt kündigt etwas an, das folgt: vor einer Liste (Kästchen, Optionen) bleibt er, vor einem einzelnen Feld ist der Text eine Beschriftung und steht ohne. Ob Text und Feld zusammengehören, zeigt der Aufbau (control/for, aria-labelledby, Feld direkt dahinter), nicht der Wortlaut (Befund des Designers aus E28, 17.11.2026).
- Zwei Pfeile, die sich waagrecht zur Mitte zeigen (> <), liest das Auge bei 16 px als Kreuz, also wie Junk oder Schließen; „zusammenrücken“ in einem kleinen Symbol darum senkrecht, flach und mit sichtbarer Luft zwischen den Spitzen (Komprimieren in „Symbolleiste anpassen“: Ordner mit ⌄ über ⌃). Ein Symbol in „Symbolleiste anpassen“ zeigt dasselbe Bild wie der Knopf in der Leiste, sonst sucht man den Knopf vergeblich (Abrufen Briefumschlag, Verschieben Ordner, Markieren Stern) (Befund des Designers am Bildvergleich, 17.11.2026, Eintrag `…GYrXA`, Teil „Symbolleiste anpassen“).
- Halbtransparente Flächen misst man als Deckkraft über dem Grund (Projektion von Pixel minus Grund auf Farbe minus Grund), nicht als Farbabstand: so sind Werte wie 34 % oder 8 % direkt prüfbar, auch unter Linux und dunkel (15.11.2026).
- Blass heißt nicht falsch gefärbt: Vor einer Farbänderung prüfen, ob das Fenster beim Bild aktiv war (`:-moz-window-inactive`, Symbole auf 50 %) und ob die Knöpfe gesperrt sind (Deckkraft 0,4 bis 0,5). Ein Testprofil ohne Identität sperrt Antworten, Weiterleiten und Archivieren überall; Bilder von Mail-Knöpfen darum mit Identität und im aktiven Fenster aufnehmen. Was im inaktiven Fenster abblasst, blasst einheitlich ab, auch ein Knopf, den Thunderbird nicht selbst abblasst (Stern im eigenen Fenster). (17.11.2026, Prüfauftrag „Mail im eigenen Fenster: Knöpfe im Mailkopf sehr blass“, Befund des Designers)
- Der Zustand eines Kapselknopfs zeigt sich am Kreis, nicht an der Kapsel: unter der Maus ein heller Kreis mit Lichtkante, gedrückt ein dunklerer Kreis ohne Licht; die Kapsel bleibt plastisch und ruhig, gesperrt wird sie flach, damit „aus“ nicht plastisch-bereit wirkt (Designer, 18.11.2026; vom Maintainer bestätigt 18.11.2026: „Ich folge deiner Empfehlung“; gesehen an der Vorschau plastische-kapseln-2026-11-17, Variante B).
- Was halo zeichnet, sieht auf Mac und Windows gleich aus: gleiche Maße, gleiche Bewegungen. Wo ein System an einer Stelle etwas Eigenes hat (zum Beispiel die Fensterknöpfe rechts oben unter Windows), weicht halo nur aus und baut nichts anders. Fensterrahmen, Menüleiste und Dateiauswahl zeigt jedes System so, wie man es von ihm kennt. (17.11.2026. Anlass: Windows-Titelleiste, JUGBo; der halo-Ring an der Ampel-Stelle weicht nur aus. Den Wortlaut hat der Designer formuliert. Zustimmung des Maintainers zu den Fragen „gleiche Maße auf Mac und Windows“ und „was halo zeichnet, überall gleich; Systemteile wie das System“: „1. ja gleiche maße auf mac und windows 2. ja einverstanden“. Zum Wortlaut: „du hast mein ok zum wortlauf der regel.“ Linux ist nicht genannt und gilt damit nicht als entschieden.)
- Zahlen und Nebenangaben in Listen (zum Beispiel die Zahl für Ungelesenes) übernehmen Gewicht und Grau der Vorlage, auch wenn die Vorlage blasser ist als unser Sekundärgrau; mehr Sichtbarkeit gibt es nur über „Kontrast erhöhen“, nicht über ein kräftigeres Grau. Anlass: Ordnerliste, Ungelesen-Zahl (GitHub #65, PVTI_lAHODEPpks4BoBQwzhI81_k, Variante A, 20.11.2026); Herkunft: „Vorschlag Abschnitt 10“ im Nachtbericht 2026-11-20; freigegeben: Maintainer 20.11.2026, Gesprächskanal designer, Wortlaut: „Ich folge all deinen Empfehlungen. Kommuniziere selbstständig mit anderen sessions wenn du infos benötigst“, Antwort auf die Vorschläge des Designers (Punkt 2 und 3).

### Verworfen (Gegenbeispiele)
| # | Vorschlag | Begründung des Maintainers | Quelle |
|---|---|---|---|
| V1 | Senkrechte Linie zwischen Kachelspalte und Seitenleiste entfernen (auch kompakt, Tonunterschied, Lasche, farbiger Abschnitt) | „nein gefällt mir nicht“; „besser mit linie als ohne“; zurückgenommen 4b895aa | B `…H59Vo` (12.11.2026) |
| V2 | Aktive Kachel kräftiger färben, Seitenleiste tönen, Kachel versetzen, Rahmen 2 px (GitHub #18), Glimmen | „zu unruhig“; „stört die Harmonie der Spaces“; Rahmen „wirkt wie der macOS-Fokusring“ | M `spaces-leiste-aktiv` (Okt. bis 2.11.2026) |
| V3 | Seitenleisten-Entwürfe E „Marke“, D „Tinte“, LED-Streifen | „e gefällt mir überhaupt nicht, wir hätten dann die symbole eines jeden spaces zweimal“; getönte Auswahl „sieht nicht gut aus“; LED „zu sehr nach hier musste du hinklicken“ | B `…ISmC0` (13.11.2026) |
| V4 | Themen-Schmuck in der ganzen Oberfläche: Neon/Laser (leuchtende Röhren-Kacheln, Laserlinien, Laserboden), Antike (Marmor, Goldadern, Mäander, Sternbilder), Edelsteine (geschliffene Kacheln, Brokat, Seide, Faden); übernommen werden nur einzelne Mittel, die Form und Tiefe zeigen (gewünscht: die plastischen Knopf-Kapseln aus Neon) | „Sie sehen alle cool aus aber auch sehr kindlich und eben unruhig. Ich glaube auf Dauer zu unruhig. Mir gefällt aber wie plastisch die Buttons bei Neon sind“ | Gespräch mit dem Designer, Fantasie-Studie der Mail-Ansicht (Artifact YQThGtRLHevFZyf8YhjCw9, Ordner fantasie-mail-2026-11-17) (17.11.2026) |

## 11. Arbeitsauftrag des Designers

Vollständig: `tests/designer-auftrag.md` (seit 14.11.2026 eingehängt in `tests/nachtlauf-auftrag.md`
und `tests/tagesroutine-auftrag.md`). Kurzfassung (Beschreibung von neon, Grundlagen mit
Quelle in den Abschnitten oben):

- **Rolle:** hauptverantwortlich für das Gesamtdesign aller Spaces (G14); setzt Todo-Einträge mit
  Designthema um, die der Director nach Vorab-Prüfung übergibt (Abschnitt 6a, Maintainer 14.11.2026).
- **Modell:** mindestens Opus; Fable nur nach der Fable-Regel (F11).
- **Eingaben:** Board-Eintrag mit Zitaten, Vorab-Prüfung des Directors, Apple-Vorlagen
  (`~/halo-aufgaben/apple/index.md`), diese Datei, `ENTSCHEIDUNGEN.md`.
- **Vor neuen Board-Einträgen:** Bevor der Designer (Gesprächskanal, Nachtlauf oder Tagesroutine) einen neuen
  Board-Eintrag vorschlägt oder anlegen lässt, durchsucht er das Board nach einem bestehenden Eintrag zum selben
  Thema (`tests/board.sh suche`). Gibt es einen, kommt eine Notiz an diesen Eintrag statt eines neuen. Gilt für alle
  Designer-Sitzungen. Maintainer 18.11.2026, Gesprächskanal designer, Wortlaut: „ja merke dir das jetzt und für alle
  zukünftigen sitzungen“, Antwort auf den Satz des Designers „Bevor ich einen neuen Eintrag vorschlage, suche ich auf
  dem Board nach einem bestehenden.“ Anlass: Eintrag PVTI_lAHODEPpks4BoBQwzhJ8EFA (Trennung Favoriten/Konten aus
  einer Reddit-Meldung) überschnitt sich mit PVTI_lAHODEPpks4BoBQwzhJd9ZM Punkt 3 („Luft über Titeln“, entschieden
  17.11.2026); neon-board hat es bemerkt und abgeglichen. Beschreibung des Designers, kein Wortlaut des Maintainers.
- **Lehren aus eigenen Fehlern (Gesprächskanal):** Die Anlässe sind Beschreibung des Designers, kein Wortlaut des Maintainers; freigegeben: Maintainer 20.11.2026, Gesprächskanal designer, Wortlaut: „Ich folge all deinen Empfehlungen. Kommuniziere selbstständig mit anderen sessions wenn du infos benötigst“, Antwort auf die Vorschläge des Designers (Punkt 2 und 3).
  - Zahlen „wie Apple“ prüft der Designer an der Vorlage, bevor er sie vorschlägt. Anlass 18.11.2026: Die Monatsansicht sollte 5 Wochen zeigen, die Vorlage zeigt 6 (JfE5s).
  - Antwortet der Maintainer auf eine Entweder-oder-Frage nur mit „ja“, fragt der Designer nach, statt zu raten; Ja/Nein-Fragen stellt er so, dass „ja“ eindeutig ist. Anlass 18.11.2026: J8osE, „ja“ auf „Vorschau oder Eintrag?“.
  - Board-Karten liest der Designer bis zum Ende und gleicht den Stand mit dem Git-Verlauf ab, bevor er ihn weitergibt. Anlass 19.11.2026: Jlehs, „rot zurückgenommen“ war veraltet, 63fa6f5 war schon in 3.32.0.
  - Andere Sitzungen schreibt der Designer nur über ihren Namen an, nie über ihre Kennung. Anlass 18.11.2026: Freigabe-Karte beim Senden an eine Cloud-Sitzung.
- **Ablauf:** Abschnitt 6b.
- **Abnahme-Markierung** (Maintainer 18.11.2026: „wir folgen den empfehlungen des opus agenten“): Der Designer schreibt beim Commit „zur Abnahme“ (mit Datum) in die Notiz des Eintrags. `tests/board-nach-release.zsh` behandelt den Eintrag dann als Zweifel statt ihn nach dem Release zu schließen, mit Frist von 7 Tagen; geschlossen wird er erst, wenn eine Notiz „abgenommen“ (Designer oder Maintainer, Groß-/Kleinschreibung egal) dasteht, dann gilt der Treffer wie sonst. Nach Ablauf der Frist nennt der Morgenbrief „Abnahme überfällig: <Titel>, seit <Datum>“. Das ist nur eine Markierung, keine neue Regel „Abnahme vor Done“.
- **Automatische Abnahme nach jedem Release** (Maintainer 20.11.2026, neon-Sitzung: „Nein wir brauchen hier eine automatische abnahme nach jedem release. Kümmer dich darum und beauftrage alle tasks auf der liste zu prüfen und abzunehmen was offen ist“): `publish.sh` startet nach jedem Release im Hintergrund `tests/abnahme-nach-release.zsh`. Ein Opus-Lauf (Auftrag `tests/abnahme-auftrag.md`) prüft jeden offenen Eintrag „zur Abnahme“, dessen Commit im Release oder früher steckt, nach dem Maßstab dieser Datei und der Schritte 4a–g, 6 und 7 aus `tests/designer-auftrag.md` am Release-Stand (hell, dunkel bei Farben, schwebend; Prüfungen aus `halo_test.py` gelten bei grüner Release-CI als grün). Ergebnis je Eintrag: Notiz „abgenommen <Datum> (automatische Abnahme v<Version>): <Begründung mit Messwerten>“ (der Eintrag schließt gleich danach), „Abnahme: Mangel – …“ mit Status Todo (der Designer bessert nach und schreibt erneut „zur Abnahme“) oder bei einer Geschmacksfrage ohne Regelgrundlage weder noch, sondern eine Frage im Morgenbrief. Von Hand abnehmen (Designer oder Maintainer) bleibt möglich; „Abnahme überfällig“ ist nur noch der Rückfall, wenn die automatische Abnahme nicht lief.
- **Pflichtprüfungen:** alle Knöpfe und Funktionen vollständig (G1, G2, G10); Maße gemessen gegen
  Vorlage bzw. Abschnitt 4; hell, dunkel bei Farben; Seitenleiste auch schwebend (G7); Animation ohne
  Sprung (G8); einheitlich über alle Spaces (G14: dieselbe Stelle in den übrigen Spaces mit prüfen);
  Prüfung in `run_checks()`.
- **Ausgabe:** Commit je Eintrag, Berichtsabschnitt mit Vorher/Nachher und Messwerten, Ergebniszeile
  für das aufrufende Skript.
- **Grenzen:** kein Push, kein Release, keine neuen Optionen (G4), nichts ersatzlos entfernen (G2),
  keine echten Mails in Bildern, kein „Apple“ nach außen (G12), Prüfungen nie abschwächen.
- **Einspruch:** Abschnitt 7. **Rückfragen:** Abschnitt 8 (Vorschaubilder; nachts Morgenbericht,
  tagsüber iPhone).
- **Gesprächskanal:** Die Remote-Control-Sitzung `designer` (Maintainer 15.11.2026, Wortlaut in
  `docs/neon-sitzung.md`) ist der Designer im direkten Gespräch mit dem Maintainer: beantwortet
  Fragen zum Design nach dieser Datei, macht auf Wunsch Vorschaubilder, liest Abschnitt 10 als
  Gedächtnis und schlägt Ergänzungen nur vor (eingetragen erst nach Bestätigung, über neon); sie
  ändert keinen Code, Umsetzungen laufen über das Board.

## 12. Programm „Aus einem Guss“ (15.11.2026)

Anlass (Maintainer 15.11.2026, Wortlaut in E): halo.spaces „wirkt … noch wie ein fleckenteppich“,
„nicht wie aus einem guss“. Vorschlag des Designers (Beschreibung des Designers, kein Wortlaut), vom
Maintainer angenommen („1. ja …“, „2. ja aus einem guss hat vorrang“, E):

1. **Bestandsaufnahme** aller Fenster, Dialoge und Popups in allen Spaces im Testprofil, hell und
   dunkel, ohne Änderung am Programm (Grundlage `tests/ui_tour.py`); je Bild Fenster, Space, Zustand
   (halo.spaces-Design / teilweise / originales Thunderbird-Design) und Auffälligkeiten je Baustein.
   Fenster im originalen Thunderbird-Design zuerst (G14).
2. **Vier Grundbausteine**, je mit Vorschau zur Freigabe durch den Maintainer: Knöpfe (Knopf-Familie
   aus G15), Symbole (auch fehlende), Fenster und Dialoge, Felder und Formulare.
3. **Umsetzung** Baustein für Baustein über alle Fenster zugleich, dazu eine Prüfung je Lauf, die
   Abweichungen vom Baustein meldet.

Reihenfolge nach Sichtbarkeit: Verfassen-Fenster, Mail-Fenster, Dialoge. Vorrang: 2b Punkt 4. Die
Umfärbung nach G15 bleibt an die Veröffentlichung des Pakets Lichtschein und Kachel d2h gebunden.

### 12a. Bestandsaufnahme vom 15.11.2026 (Befund des Designers, kein Wortlaut des Maintainers)

Ablage `~/halo-aufgaben/vorschau/bestandsaufnahme-2026-11-15/` (dauerhaft, Verweis
`~/halo-tour/2026-11-15-bestandsaufnahme`), Liste `LIES-MICH.md`, Werte `<hell|dunkel>-ergebnis.json`
mit den Feldern `zustand` und `auffaelligkeiten` je Baustein, Vergleich mit 2026-11-05 in `vergleich.md`.
Paket 3.27.0, Testprofil, 312 Oberflächen je Modus, 274 aufgenommen, 38 nicht erreicht (native
Menüleiste und Dateiauswahl, commonDialog-Rückfragen, Erinnerungsfenster, Schnellfilter-Leiste u. a.).
Zustand je Modus: 12 original, 56 teilweise, 206 halo.

- **Original zuerst:** Einladung per Doppelklick (`kal-einladung-fenster`: Werkzeugleiste mit
  Textknöpfen, Gruppenüberschriften mit Linie, Original-Teilnehmersymbole, blauer Fokusrahmen am
  Organisator), Account Hub (Adressbuch, Konto einrichten), Über, Aktivitäten, about:support,
  about:config, Toolbar anpassen, Tooltip (Radius 0, `#DDD`), Rückfrage „Ordner komprimieren“,
  Chat-Konto-Assistent, Quelltextfenster.
- **Knöpfe:** in Dialogen und Fenstern 30 px (110×), daneben 24, 26, 22 und 16 px; 17 Knöpfe mit
  Radius 0. Einladung ohne Hauptknopf; Aufgaben-Dialog mit blassem Speichern-Kreis; „Say Thanks“ mit
  farbigem Rand (V2).
- **Symbole:** Original-Symbole auf 124 von 274 Oberflächen, am häufigsten `nav-down-sm.svg` (77),
  `check.svg` (24), im Verfassen-Fenster `arrow-up/down`, `close`, `overflow` (je 9–10), dazu
  `img-align-*.gif`, `move-*.svg`, `calendar-itip-icons.svg`, `deleteMailIcon.svg`, `help.svg`.
- **Fenster und Dialoge:** Dialoge im Tab klein (11 px) mit sichtbarem Größengriff, eigene Fenster
  (Filter- und Junk-Protokoll) mit 13 px; Popups überwiegend Radius 12 px (65×), Ausnahmen
  Datumswähler 6 px, „Anhänge neu anordnen“ 20 px, Tooltip 0; Texteinzug in Menüs 19 oder 40 px;
  gelbe TB-Leiste „blocked remote content“, im Dunkelmodus grell; Chat-Auswahl voll blau statt grau.
- **Felder und Formulare:** Feldradius 7 px (120×), daneben 6 px und Kapsel; Feldhöhen 28, 24, 26,
  32 px. Verfassen mit allen Kopfzeilen: Wertespalte nicht bündig (Von x = 82, An x = 61, Betreff
  x = 91), Betreff-Beschriftung rund 3 px höher als der Wert, Text ab x = 8. Aufgaben-Dialog anders
  aufgebaut als der Termindialog (G14); Beschriftungen mal mit, mal ohne Doppelpunkt.

Vorschlag für Schritt 2 (Deutung des Designers): Reihenfolge der Bausteine nach Häufigkeit der
Abweichung, zuerst Symbole (`nav-down-sm`, `check`) und Knopfhöhen in Dialogen, dann Fenster und
Dialoge, zuletzt Felder; Einladungsfenster und Verfassen-Kopfzeilen als erste Vorschauen.
