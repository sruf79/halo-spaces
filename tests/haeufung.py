#!/usr/bin/env python3
"""Häufung: erkennt offene Einträge der Aufgabenliste, die auf dasselbe Problem verweisen (nur Lesen).

Entscheidungen des Maintainers (14.11.2026, Wortlaute in ENTSCHEIDUNGEN.md): „ich würde eine regelung
einbauen, wonach die priorität incrementiell steigt je mehr punkte auf das selbe problem verweisen und
nicht erst ab 3 zusammenhängenden“, dann „nein ich möchte hier keine manuellen adjustierungen sondern
ebenfalls funktionierende automatismen die zusammenhängende punkte auf der liste zuverlässig erkennen
und dementsprechend höher priorisieren, je mehr gemeinsame punkte verknüpft sind“ und „der
automatismus soll natürlich bei der tagesroutine und auch bei der nachtroutine automatisch eingesetzt
werden“.

Regel (deterministisch, gleiche Liste ergibt gleiche Gruppen):
- Betrachtet werden offene Einträge (nicht Done, nicht „Wartet auf OK“).
- Bereich = Titelpräfix vor dem ersten Doppelpunkt (ohne Doppelpunkt: erstes Wort), Synonyme
  zusammengefasst (Mail-Toolbar, Mailfenster, Nachrichtenfenster, Gesprächsansicht … = Mail;
  Sidebar = Seitenleiste).
- Stelle der Oberfläche = Begriffe aus Titel und Zeile „Wo:“ nach der Liste STELLEN (Synonyme
  zusammengefasst, z. B. Toolbar = Symbolleiste = „Kopf des Fensters“). Der eigene Bereichsname zählt
  nicht als Stelle. Gewicht 2 für eine bestimmte Stelle, 1 für eine breite (Mailfenster) oder einen
  Zustand (Hover), 0,5 für allgemeine Merkmale (Knopf, Symbol, Farbe …) und für gemeinsame übrige
  Titelwörter (ohne Stoppwörter und Bereichsnamen).
- Verweise: gleiche Nummer „#n“ (GitHub) in beiden Titeln = 2 und gilt auch über Bereiche hinweg;
  Nummer aus dem Titel des einen im Text des anderen = 1; Board-id des einen im Text des anderen = 1;
  gleiche Bild- oder Auswahlnamen (apple/…, bilder/…, #id, mc-…) = 1 (zusammen höchstens 2).
- Verbunden, wenn gleicher Bereich und Punkte ≥ SCHWELLE (2), dabei mindestens eine gemeinsame Stelle
  oder ein Verweis. Schritte derselben Reihe (n/m mit gleichem Titelanfang) zählen nicht als Häufung.
- Gruppen = transitive Hülle der Verbindungen. Zuschlag = halbe Nutzenstufe je weiterer Eintrag,
  (n − 1) × 0,5, aufgerundet; die Obergrenze 5 für den Nutzen setzt der Planer.

Alter (Board-Eintrag „Ablauf: Alter der Einträge wirksam machen …“, 20.11.2026; Werte sind Festlegung des
Fable-Agenten auf Weisung des Maintainers, kein Wortlaut): je volle 7 Tage seit dem Anlagedatum (createdAt aus
tests/board.sh export) +0,5 Nutzenstufe, höchstens +1,5; ohne Datum 0. Wirkt wie die Häufung nur im Nutzen
(Obergrenze 5 setzt der Planer), unterhalb von Regel 0, Schwere, Testzeit-Verkürzung und Nutzer-Bugs.
Ausgabe: Abschnitt „Alter (Skript)“ in der .md, Zeilen „alter“ in der .tsv.
Alters-Platz (gleicher Eintrag, Schritt D): die drei ältesten machbaren Einträge (Todo oder In Progress, nicht „wartet
auf Push/CI“, keine Notiz „Entscheidung fehlt seit …“, kein laufender Worker, keine Ablauf-, Release- oder Store-Einträge,
von Reihen nur der kleinste offene Schritt, mit Anlagedatum); Unterabschnitt in der .md, Zeilen „aeltest“ in der .tsv.
Der Planer setzt den ersten, der in Zeit und Kontingent passt, als „Alters-Platz“ in den Plan.

Aufruf:
  tests/haeufung.py [--eingabe <board.json>] [--aus <Ordner>] [--datum JJJJ-MM-TT] [--stdout]
Ohne --eingabe (bzw. HALO_HAEUFUNG_EINGABE) liest es die Liste über tests/board.sh export (neben diesem Skript oder im Checkout).
Schreibt <Ordner>/<datum>-haeufung.md und .tsv (Standard ~/halo-nacht), gibt eine Kurzzeile aus.
Exitcode 0 bei Erfolg (auch ohne Gruppen), sonst 1.
"""
import argparse, datetime, json, math, os, re, subprocess, sys

SCHWELLE = 2.0

# Bereich: erstes Wort des Präfixes → Bereich
BEREICHE = {
    'mail': 'mail', 'mails': 'mail', 'mailfenster': 'mail', 'nachrichtenfenster': 'mail', 'mailkopf': 'mail',
    'mailliste': 'mail', 'nachrichtenliste': 'mail', 'gesprächsansicht': 'mail', 'konversation': 'mail',
    'markieren': 'mail', 'mailtoolbar': 'mail',
    'seitenleiste': 'seitenleiste', 'seitenleisten': 'seitenleiste', 'sidebar': 'seitenleiste',
    'today': 'today-pane', 'kalender': 'kalender', 'adressbuch': 'adressbuch', 'kontakte': 'adressbuch',
    'aufgaben': 'aufgaben', 'einstellungen': 'einstellungen', 'chat': 'chat',
}

# Stellen: (Name, Gewicht, Muster); Muster auf kleingeschriebenen Titel + „Wo:“-Zeile
B = r'(?<![a-zäöüß])'   # Wortanfang (auch nach Bindestrich)
STELLEN = [
    ('toolbar', 2, r'toolbar|symbolleiste|kopf des fensters|kopfleiste|knopfleiste'),
    ('suchfeld', 2, r'suchfeld|lupe'),
    ('stern', 2, B + r'(stern|starred|star)(?![a-zäöüß])'),
    ('today-pane', 2, r'today[- ]pane'),
    ('mini-kalender', 2, r'mini-?kalender'),
    ('seitenleiste', 2, r'seitenleiste|sidebar|ordnerliste'),
    ('trennlinie', 2, r'trennlinie|trenner|trennstrich|haarlinie'),
    ('ampel', 2, B + r'ampel|fensterknöpfe'),
    ('kachel', 2, r'kachel'),
    ('lichtschein', 2, r'lichtschein'),
    ('tastenkürzel', 2, r'tastenkürzel|shortcut|cmd\+|control\+'),
    ('statusleiste', 2, r'statusleiste'),
    ('titelleiste', 2, r'titelleiste|fenstertitel'),
    ('mailkopf', 2, r'mailkopf|kopfzeilen|nachrichtenkopf'),
    ('mailliste', 2, r'mailliste|nachrichtenliste|listeneintr'),
    ('anhang', 2, B + r'anhang|anhänge|attachment'),
    ('menüleiste', 2, r'menüleiste'),
    ('kontextmenü', 2, r'kontextmenü'),
    ('absenderbild', 2, r'profilkreis|absenderbild|absenderlogo|avatar|bimi'),
    ('konversation', 2, r'konversation|gesprächsansicht|unterhaltung'),
    ('mehrwochen', 2, r'mehrwochen'),
    ('detailansicht', 2, r'detailansicht|detailspalte|bearbeiten-dialog'),
    ('tags', 2, B + r'tags?(?![a-zäöüß])|tag-'),
    ('recommend', 2, r'recommend|empfehlen'),
    ('begrüßung', 2, r'begrüßung|onboarding'),
    ('favoriten', 2, r'favorit'),
    ('pst', 2, B + r'pst(?![a-zäöüß])'),
    ('caldav', 2, r'caldav'),
    ('mailfenster', 1, r'mailfenster|nachrichtenfenster|fenster einer (einzeln )?geöffneten mail|'
                       r'geöffneten? mail|eigenen? fenster'),
    ('hover', 1, r'hover|überfahren|darüberfahren'),
    ('kapsel', 1, r'kapsel|pille'),
    ('fensterbreite', 1, r'mindestbreite|fensterbreite|schmaler|schrumpft'),
    ('knopf', 0.5, r'knopf|knöpfe|button'),
    ('symbol', 0.5, r'symbol(?!leiste)|icon'),
    ('farbe', 0.5, r'farbe|dunkel'),
    ('schrift', 0.5, r'schrift|textgröße'),
    ('abstand', 0.5, r'abstand|spacer|abstände'),
    ('animation', 0.5, r'animation|ruck|springen|wackel'),
]
STELLEN = [(n, g, re.compile(m)) for n, g, m in STELLEN]

STOPP = set('''
apple halo spaces github wie wie in im in am an auf aus bei beim bis das dem den der des die ein eine einem
einen einer eines und oder nicht ohne mit nach noch nur auch immer schon wieder mehr erst über unter vor
zum zur von vom für als ist sind wird werden zeigt zeigen fehlt fehlen falsch falscher falsche exakt neue
neuer neues neuen erste ersten alle allen aller einzeln einzelnen weiterhin manchmal sowie sich sein
seine statt dass sollen soll kann können prüfen prüfung umsetzung ende anfang stand nach dem update macos
windows linux thunderbird teil schritt reihe
'''.split())
# Bereichsnamen und Teile davon zählen nicht als gemeinsames Titelwort
STOPP |= set(BEREICHE) | {'pane', 'space', 'spaces', 'tests', 'ablauf', 'code', 'toolbar'}

REIHE = re.compile(r'\(?\b(\d+[a-z]?|n)\s*/\s*(\d+[a-z]?|n)\b\)?')
NUMMER = re.compile(r'#(\d+)\b')
DATEI = re.compile(r'\b(?:apple|bilder)/[\w.-]+\.(?:webp|png|jpe?g)|(?<![\w&])#[a-z][\w-]{3,}|\bmc-[a-z][\w-]+')
ID = re.compile(r'PVTI_[A-Za-z0-9_-]+')


def wort_stamm(w):
    for e in ('ern', 'en', 'er', 'es', 'e', 'n', 's'):
        if w.endswith(e) and len(w) - len(e) >= 4:
            return w[:-len(e)]
    return w


def bereich(titel):
    t = titel.strip()
    praefix = t.split(':', 1)[0] if ':' in t[:60] else t.split(' ', 1)[0]
    erstes = re.split(r'[\s\-–]+', praefix.strip().lower())[0]
    erstes = erstes.strip('[]()„“"')
    if erstes in BEREICHE:
        return BEREICHE[erstes]
    if erstes.startswith('seitenleiste'):
        return 'seitenleiste'
    if erstes.startswith('mail'):
        return 'mail'
    return erstes


def wo_zeile(text):
    m = re.search(r'^\s*\**Wo\**:\s*(.+)$', text or '', re.M)
    return m.group(1) if m else ''


def reihen_stamm(titel):
    m = REIHE.search(titel)
    if not m:
        return None
    return re.sub(r'\W+', ' ', titel[:m.start()].lower()).strip()


class Eintrag:
    def __init__(self, d):
        self.id = d['id']
        self.titel = d.get('title') or ''
        self.text = d.get('body') if 'body' in d else ((d.get('content') or {}).get('body') or '')
        self.text = self.text or ''
        self.bereich = bereich(self.titel)
        ort = (self.titel + ' \n ' + wo_zeile(self.text)).lower()
        self.stellen = {n: g for n, g, m in STELLEN if m.search(ort) and n != self.bereich}
        # übrige Titelwörter (ohne Präfix, ohne Wörter, die schon eine Stelle ergeben)
        rest = self.titel.split(':', 1)[1] if ':' in self.titel[:60] else self.titel
        woerter = set()
        for w in re.findall(r'[a-zäöüß][a-zäöüß-]{3,}', rest.lower()):
            for teil in [w] + w.split('-'):
                if len(teil) < 5 or teil in STOPP or any(m.search(teil) for _, _, m in STELLEN):
                    continue
                woerter.add(wort_stamm(teil))
        self.woerter = woerter - {wort_stamm(s) for s in STOPP}
        self.nummern = set(NUMMER.findall(self.titel))
        self.text_nummern = set(NUMMER.findall(self.text))
        self.dateien = set(DATEI.findall(self.text + ' ' + self.titel))
        self.ids = set(ID.findall(self.text))
        self.reihe = reihen_stamm(self.titel)
        self.created = d.get('createdAt')


def verbindung(a, b):
    """→ (Punkte, Gründe) oder None, wenn nicht verbunden."""
    if a.reihe and a.reihe == b.reihe:
        return None
    gruende, punkte, stelle_oder_verweis = [], 0.0, False
    gleiche_nr = a.nummern & b.nummern
    if gleiche_nr:
        punkte += 2
        stelle_oder_verweis = True
        gruende.append('gleiche Nummer im Titel ' + ', '.join('#' + n for n in sorted(gleiche_nr)))
    if a.bereich != b.bereich and not gleiche_nr:
        return None
    gemeinsam = sorted(set(a.stellen) & set(b.stellen))
    if gemeinsam:
        punkte += sum(a.stellen[s] for s in gemeinsam)
        if any(a.stellen[s] >= 1 for s in gemeinsam):
            stelle_oder_verweis = True
        gruende.append('Stelle ' + ', '.join(gemeinsam))
    woerter = sorted(a.woerter & b.woerter)
    if woerter:
        punkte += 0.5 * len(woerter)
        gruende.append('Titelwörter ' + ', '.join(woerter))
    verweis = 0
    for x, y in ((a, b), (b, a)):
        n = x.text_nummern & y.nummern - gleiche_nr
        if n:
            verweis += 1
            gruende.append(f'Text von …{x.id[-6:]} nennt ' + ', '.join('#' + i for i in sorted(n)))
        if y.id in x.ids:
            verweis += 1
            gruende.append(f'Text von …{x.id[-6:]} nennt die id von …{y.id[-6:]}')
    dateien = sorted(a.dateien & b.dateien)
    if dateien:
        verweis += 1
        gruende.append('gleiche Datei/Auswahl ' + ', '.join(dateien[:3]))
    if verweis:
        punkte += min(verweis, 2)
        stelle_oder_verweis = True
    if punkte >= SCHWELLE and stelle_oder_verweis:
        return punkte, gruende
    return None


def gruppen_bilden(eintraege):
    eltern = list(range(len(eintraege)))

    def wurzel(i):
        while eltern[i] != i:
            eltern[i] = eltern[eltern[i]]
            i = eltern[i]
        return i

    paare = []
    for i in range(len(eintraege)):
        for j in range(i + 1, len(eintraege)):
            v = verbindung(eintraege[i], eintraege[j])
            if v:
                paare.append((i, j, v[0], v[1]))
                eltern[wurzel(i)] = wurzel(j)
    gruppen = {}
    for i in range(len(eintraege)):
        gruppen.setdefault(wurzel(i), []).append(i)
    liste = [sorted(g, key=lambda k: eintraege[k].titel) for g in gruppen.values() if len(g) > 1]
    liste.sort(key=lambda g: (-len(g), eintraege[g[0]].titel))
    ergebnis = []
    for n, g in enumerate(liste, 1):
        menge = set(g)
        ergebnis.append({
            'name': f'G{n}',
            'eintraege': [eintraege[k] for k in g],
            'paare': [(eintraege[i], eintraege[j], p, gr) for i, j, p, gr in paare if i in menge],
        })
    return ergebnis


def zuschlag(n):
    roh = (n - 1) * 0.5
    return roh, math.ceil(roh)


ALTER_SCHRITT_TAGE, ALTER_SCHRITT, ALTER_DECKEL = 7, 0.5, 1.5


def alter_tage(created, datum):
    """Volle Tage vom Anlagedatum (ISO, z. B. 2026-11-02T14:01:41Z) bis datum (JJJJ-MM-TT); ohne/kaputtes Datum None."""
    if not created:
        return None
    try:
        a = datetime.date.fromisoformat(str(created)[:10])
        return max(0, (datetime.date.fromisoformat(datum) - a).days)
    except ValueError:
        return None


def alters_zuschlag(tage):
    """+0,5 Nutzenstufe je volle 7 Tage offen, Deckel +1,5; ohne Datum 0."""
    if tage is None:
        return 0.0
    return min(ALTER_DECKEL, (tage // ALTER_SCHRITT_TAGE) * ALTER_SCHRITT)


def alter_liste(eintraege, datum):
    """[(Eintrag, Tage, Zuschlag)] für Einträge mit Zuschlag > 0, älteste zuerst (bei Gleichstand nach id)."""
    aus = []
    for e in eintraege:
        t = alter_tage(e.created, datum)
        z = alters_zuschlag(t)
        if z > 0:
            aus.append((e, t, z))
    return sorted(aus, key=lambda x: (-x[1], x[0].id))


def _worker_laeuft(text):
    a = [m.start() for m in re.finditer(r'In Arbeit: worker-', text)]
    b = [m.start() for m in re.finditer(r'In Arbeit beendet', text)]
    return bool(a) and (not b or max(a) > max(b))


def _reihen_schritt(titel):
    m = REIHE.search(titel)
    if not m:
        return None
    try:
        return int(re.match(r'\d+', m.group(1)).group())
    except (AttributeError, ValueError):
        return None


def aelteste_machbar(items, datum, n=3):
    """Die n ältesten machbaren Einträge als [(id, Tage, Titel)], älteste zuerst (Gleichstand nach id)."""
    kandidaten, kleinster = [], {}
    for d in items:
        titel = d.get('title') or ''
        st = d.get('status') or ''
        stamm = reihen_stamm(titel)
        k = _reihen_schritt(titel)
        if stamm and k is not None and st not in ('Done',):
            kleinster[stamm] = min(k, kleinster.get(stamm, k))
    for d in items:
        titel = d.get('title') or ''
        st = d.get('status') or ''
        text = d.get('body') if 'body' in d else ((d.get('content') or {}).get('body') or '')
        text = text or ''
        if st not in ('Todo', 'In Progress'):
            continue
        if st == 'In Progress' and re.search(r'wartet auf Push/CI', text, re.I):
            continue
        if re.search(r'Entscheidung fehlt seit', text) or _worker_laeuft(text):
            continue
        if re.match(r'\s*(Ablauf|Release|Store)\b', titel):
            continue
        stamm, k = reihen_stamm(titel), _reihen_schritt(titel)
        if stamm and k is not None and kleinster.get(stamm, k) != k:
            continue
        t = alter_tage(d.get('createdAt'), datum)
        if t is None:
            continue
        kandidaten.append((d['id'], t, titel))
    return sorted(kandidaten, key=lambda x: (-x[1], x[0]))[:n]


def offen(items):
    # „Pausiert“ (22.11.2026): bewusst zurückgestellt, nicht planen
    return [Eintrag(d) for d in items
            if (d.get('status') or '') not in ('Done', 'Wartet auf OK', 'Pausiert')]


def board_lesen():
    hier = os.path.dirname(os.path.abspath(__file__))
    kandidaten = [os.path.join(hier, 'board.sh'),
                  os.path.expanduser('~/halo-spaces/tests/board.sh')]
    meldungen = []
    for k in kandidaten:   # ältere Kopie ohne „export“ → nächste Fundstelle
        if os.path.exists(k):
            r = subprocess.run(['zsh', k, 'export'], capture_output=True, text=True, timeout=300)
            if r.returncode == 0 and r.stdout.strip():
                return json.loads(r.stdout)['items']
            meldungen.append(f'{k}: {r.stderr.strip()[:200] or "keine Ausgabe"}')
    raise SystemExit('FEHLER: board.sh export scheiterte (' + ('; '.join(meldungen) or 'board.sh nicht gefunden') + ')')


def schreiben(gruppen, zahl, aus, datum, alter=(), aelteste=()):
    os.makedirs(aus, exist_ok=True)
    md, tsv = os.path.join(aus, f'{datum}-haeufung.md'), os.path.join(aus, f'{datum}-haeufung.tsv')
    jetzt = datetime.datetime.now().strftime('%Y-%m-%d %H:%M')
    z = [f'# Häufung {datum}', '',
         f'Erzeugt {jetzt} von tests/haeufung.py aus {zahl} offenen Einträgen (ohne Done und „Wartet auf OK“). '
         'Gruppen und Zuschläge sind verbindlich (tests/nachtlauf-auftrag.md Schritt 1a, '
         'tests/tagesroutine-auftrag.md Schritt 2); Zuschlag = (Zahl − 1) × 0,5 Nutzenstufen, aufgerundet, '
         'Nutzen höchstens 5.', '']
    t = ['# art\tgruppe\tzahl|id\tzuschlag|id\taufgerundet|punkte\tids|grund\ttitel']
    if not gruppen:
        z.append('Keine Gruppen.')
    for g in gruppen:
        n = len(g['eintraege'])
        roh, auf = zuschlag(n)
        z += [f'## {g["name"]}: {n} Einträge, Zuschlag +{roh:g} (aufgerundet +{auf})', '']
        z += [f'- {e.id} ({e.bereich}) {e.titel}' for e in g['eintraege']]
        z += ['', 'Verbindungen:', '']
        for a, b, p, gr in g['paare']:
            z.append(f'- {a.id[-6:]} – {b.id[-6:]} ({p:g} Punkte): {"; ".join(gr)}')
        z.append('')
        t.append('\t'.join(['gruppe', g['name'], str(n), f'{roh:g}', str(auf),
                            ','.join(e.id for e in g['eintraege']),
                            ' | '.join(e.titel for e in g['eintraege'])]))
        for a, b, p, gr in g['paare']:
            t.append('\t'.join(['paar', g['name'], a.id, b.id, f'{p:g}', '; '.join(gr), '']))
    z += ['## Alter (Skript)', '',
          'Zuschlag im Nutzen: +0,5 je volle 7 Tage seit Anlage, höchstens +1,5 (wie die Häufung verbindlich; '
          'Nutzen mit Häufung zusammen höchstens 5). Festlegung des Fable-Agenten vom 20.11.2026, kein Wortlaut.', '']
    if not alter:
        z.append('Kein Eintrag mit Alters-Zuschlag.')
    for e, tage, zs in alter:
        z.append(f'- {e.id} {tage} Tage, +{zs:g}: {e.titel}')
        t.append('\t'.join(['alter', e.id, str(tage), f'{zs:g}', '', '', e.titel]))
    z += ['', '### Älteste machbare Einträge (Alters-Platz)', '',
          'Ein Platz je Lauf: nach Regel 0, Schwere, Testzeit-Verkürzung und Nutzer-Bugs steht der erste davon, der in '
          'Zeit und Kontingent passt, im Plan, gekennzeichnet „Alters-Platz“ (Design geht an den Designer).', '']
    if not aelteste:
        z.append('Kein machbarer Eintrag mit Anlagedatum.')
    for rang, (i, tage, titel) in enumerate(aelteste, 1):
        z.append(f'{rang}. {i} {tage} Tage: {titel}')
        t.append('\t'.join(['aeltest', str(rang), i, str(tage), '', '', titel]))
    z.append('')
    for pfad, zeilen in ((md, z), (tsv, t)):
        with open(pfad + '.neu', 'w') as f:
            f.write('\n'.join(zeilen) + '\n')
        os.replace(pfad + '.neu', pfad)
    return md, tsv


def main():
    ap = argparse.ArgumentParser(description='Häufung zusammenhängender Einträge der Aufgabenliste')
    ap.add_argument('--eingabe', default=os.environ.get('HALO_HAEUFUNG_EINGABE') or None)   # Probe ohne Board
    ap.add_argument('--aus', default=os.path.expanduser('~/halo-nacht'))
    ap.add_argument('--datum', default=datetime.date.today().isoformat())
    a = ap.parse_args()
    if a.eingabe:
        with open(a.eingabe) as f:
            d = json.load(f)
        items = d['items'] if isinstance(d, dict) else d
    else:
        items = board_lesen()
    eintraege = offen(items)
    gruppen = gruppen_bilden(eintraege)
    alter = alter_liste(eintraege, a.datum)
    aelteste = aelteste_machbar(items, a.datum)
    md, tsv = schreiben(gruppen, len(eintraege), a.aus, a.datum, alter, aelteste)
    teile = [f'{g["name"]} {len(g["eintraege"])}' for g in gruppen]
    print(f'Häufung: {len(gruppen)} Gruppen aus {len(eintraege)} offenen Einträgen'
          + (f' ({", ".join(teile)})' if teile else '')
          + f'; Alter: {len(alter)} Einträge mit Zuschlag, Alters-Platz: {len(aelteste)} Kandidaten'
          + f' (Abschnitt „Alter (Skript)“) – {md}')


if __name__ == '__main__':
    try:
        main()
    except SystemExit:
        raise
    except Exception as e:   # Planer fällt dann auf eigene Gruppierung zurück
        print(f'FEHLER: Häufung gescheitert: {e}', file=sys.stderr)
        sys.exit(1)
