#!/usr/bin/env python3
# Logik der Umbau-Woche (Freigabe des Maintainers 20.11.2026, Nachtrag 21.11.2026, Sammelfrage S0 22.11.2026;
# ENTSCHEIDUNGEN.md „Umbau-Woche“). Nur lesend: schreibt nie ins Board und nie in Git. Aufruf über tests/umbau-woche.sh.
#   zustand <Schalterdatei>                 aktiv|angemeldet|aus|unlesbar, Tab, ab, Tab, Grund
#   sperre <Schalterdatei> <Vorlauf Std.>   rc 0 = keine neuen Worker (ab „ab“ minus Vorlauf, solange die Zeile steht)
#   erlaubt <Typ> <Titel> [<id>] [<Status>] „ja …“ (rc 0) oder „nein …“ (rc 1): darf ein Lauf den Eintrag in der Woche beginnen?
#   fable <Titel> [<id>]                    rc 0 = Fable aus der Tagesroutine erlaubt (nur nach „Rot bleibt rot“, S0 b)
#   sortieren <export.json> <Repo> [--main REF] [--gruen DATEI] [--jetzt ISO]   Listen für Tag 1 (nur Einträge auf In Progress);
#                                           DATEI: je Zeile „<sha> <Zweig>“ grüner Push-Läufe (A nur aus Zweig main)
# Zeit: HALO_JETZT (ISO mit Zone) für Proben, sonst jetzt.
import datetime as dt
import json
import os
import re
import subprocess
import sys

# Liste 1a des bestätigten Plans (~/halo-berichte/2026-11-22-umbau-plan.md, Abschnitt 1a; Maintainer 21.11.2026:
# „Ansonsten folge ich den fable Empfehlungen“): Einträge der Woche, Kürzel = letzte fünf Zeichen der Board-id.
UMBAU = {"Kep4c", "IyhRA", "Iye6g", "HepK8", "KJ3Sc", "KemcY", "Ke2_U", "KZcAg", "Gyj_I", "G1OeY", "GP4gg", "KyXzU"}
P4 = {"KRJ0I", "Kq83E", "GP4YM", "Jll-0", "KKdGI", "KqLlM", "KrJAM", "Koc0s", "Kl3RY", "KrgiE", "KnJxk",
      "KdlNA", "Kj9Sk", "KkvAw", "KIwP4"}
# Kq83E schwächt eine Prüfung ab: nur der Maintainer (Plan Frage 4), kein Lauf beginnt ihn
NUR_MAINTAINER = {"Kq83E"}
# P4 „Testzeit und rote Prüfungen“: neue Einträge derselben Familie (rote oder flackernde Prüfungen, auch nach dem 21.11.)
P4_TITEL = re.compile(r"^Tests: (flackert|CI rot)\b")
UMBAU_TITEL = re.compile(r"Umbau-Woche")
GITHUB = re.compile(r"GitHub #\d+")
REIHE = re.compile(r"\(\d+/(\d+|n)\)|\b\d+/(\d+|n) –")
# Notiz, die einen Eintrag als nicht abgeschlossen ausweist (dann kein Done ohne Einzelprüfung)
# Auch ausdrücklich Ausstehendes (Fable-Prüfung 22.11.2026, M1: „Punkt 1 … nicht umgesetzt“, „Abnahme-Bildfolge … steht
# noch aus“); „Abnahme“ allein nicht, sonst träfe es „Abnahme-Mangel behoben“.
UNFERTIG = re.compile(r"teilweise|Teil-?[Ff]ix|\bTeil\b|Teil \d|Schritt|[Oo]ffen|zur Abnahme|Rest\b|zurückgenommen|"
                      r"[Rr]evert|Nebenzweig|rot\b|flackert|nicht gelöst|Vorschlag|nicht umgesetzt|steht (noch )?aus|"
                      r"\bnoch aus\b|noch nicht (umgesetzt|erledigt|fertig|gelöst|abgenommen|geprüft)|fehlt noch|noch fehlt|"
                      r"ausstehend", re.I)
# „zur Abnahme“ (Maintainer 18. und 20.11.2026, docs/release.md): bleibt In Progress, auch mit grüner CI; geschlossen
# wird erst nach „abgenommen“ durch den Abnahme-Lauf (Entscheidung nach der Fable-Prüfung 22.11.2026, M4)
ABNAHME = re.compile(r"zur Abnahme", re.I)
COMMITTET = re.compile(r"committet|übernommen|cherry-pick|gepusht")
HASH = re.compile(r"(?<![0-9A-Za-z_/-])[0-9a-f]{7,40}(?![0-9A-Za-z_-])")
WORKER = re.compile(r"In Arbeit( beendet| aufgegeben)?: (worker-[^ ]+) \(Auslastungswächter, ([^),]+)")
SPERRE_STUNDEN = 5   # Worker-Vermerk sperrt 5 Stunden (Ablaufplan Abschnitt 5, „5 Stunden gesperrt“)


def jetzt():
    j = os.environ.get("HALO_JETZT")
    return dt.datetime.fromisoformat(j).astimezone() if j else dt.datetime.now().astimezone()


def iso(s):
    t = dt.datetime.fromisoformat(s)
    if t.tzinfo is None:
        raise ValueError("ohne Zone")
    return t


def zustand(datei):
    """Letzte Zeile „umbau <ab ISO mit Zone> <Grund>“ gilt. Kein Ende: endet nur durch „aus“ (Maintainer, Plan Frage 7)."""
    if not os.path.lexists(datei):
        return ("aus", "", "")
    try:
        zeilen = [z.strip() for z in open(datei, encoding="utf-8") if z.strip() and not z.lstrip().startswith("#")]
    except (OSError, UnicodeDecodeError) as e:
        # Datei da, aber nicht lesbar: nicht „aus“ (das gäbe alles frei), sondern unlesbar (Fable-Prüfung M7)
        return ("unlesbar", "", "Datei nicht lesbar: %s" % type(e).__name__)
    if not zeilen:
        return ("aus", "", "")
    t = zeilen[-1].split(None, 2)
    try:
        if len(t) < 3 or t[0] != "umbau":
            raise ValueError
        ab = iso(t[1])
    except ValueError:
        return ("unlesbar", "", zeilen[-1][:120])
    return ("aktiv" if jetzt() >= ab else "angemeldet", t[1], t[2])


def kuerzel(i):
    return (i or "")[-5:]


def erlaubt(typ, titel, ident="", status=""):
    k = kuerzel(ident)
    if status == "Pausiert":
        return False, "nein Status Pausiert (nie bearbeiten, nie schließen)"
    if k in NUR_MAINTAINER:
        return False, "nein nur der Maintainer (schwächt eine Prüfung ab)"
    if k in P4 or P4_TITEL.search(titel):
        return True, "ja P4 Testzeit/rote Prüfung"
    if typ.lower() == "bug" and GITHUB.search(titel):
        return True, "ja von Nutzern gemeldeter Bug (GitHub #n) – nur, wenn Nutzer ihn spüren"
    if k in UMBAU or UMBAU_TITEL.search(titel):
        return False, "nein Umbau-Eintrag: baut neon tagsüber, kein Lauf"
    if status == "In Progress":
        # Fable-Prüfung M6: was Tag 1 auf In Progress ließ, „bleibt In Progress und wird abgeschlossen“ (Wortlaut 20.11.):
        # zu Ende bringen ist kein Beginnen, aber nur abschließen, keine neue Arbeit
        return True, ("ja nur abschließen: steht auf In Progress (Tag 1 ließ ihn dort, „wird abgeschlossen“) – vorhandenen "
                      "Commit nach main bringen, CI abwarten, Done; keine neue Arbeit")
    if typ.lower() == "feature":
        return False, "nein Feature/Design beginnt in der Umbau-Woche nicht"
    return False, "nein Bug ohne Meldung eines Nutzers (kein GitHub #n) beginnt in der Umbau-Woche nicht"


def fable(titel, ident=""):
    # S0 b: kein Fable aus der Tagesroutine, außer nach „Rot bleibt rot“ – das betrifft nur rote/flackernde Prüfungen
    k = kuerzel(ident)
    return k not in NUR_MAINTAINER and (bool(P4_TITEL.search(titel)) or (k in P4 and titel.startswith("Tests:")))


def git(repo, *a, eingabe=None):
    r = subprocess.run(["git", "-C", repo, *a], input=eingabe, capture_output=True, text=True)
    return r.returncode, r.stdout


def worker_zeit(s):
    for f in ("%Y-%m-%d %H:%M", "%d.%m.%Y %H:%M"):
        try:
            return dt.datetime.strptime(s.strip(), f).replace(tzinfo=jetzt().tzinfo)
        except ValueError:
            pass
    return None


def frisch_gesperrt(body, now):
    letzte = None
    for m in WORKER.finditer(body):
        letzte = m
    if not letzte or letzte.group(1):
        return None
    t = worker_zeit(letzte.group(3))
    if t is None:
        return letzte.group(2) + " (Zeit unlesbar)"
    return letzte.group(2) if now - t < dt.timedelta(hours=SPERRE_STUNDEN) else None


class Fakten:
    def __init__(self, repo, main, gruen):
        self.repo = repo
        rc, out = git(repo, "rev-list", main)
        if rc:
            raise SystemExit("FEHLER: %s nicht lesbar" % main)
        self.main = set(out.split())
        # gruen: (sha, Zweig) grüner Push-Läufe. Für A („committet und CI grün“) zählt nur die volle CI auf main oder ein
        # Release-Tag; ein Prüfzweig-Lauf (nur Linux und statisch) macht die Vorgänger seines Kopfs nicht grün (Fable-
        # Prüfung M5). Für B gilt nach S0 c auch „Commit auf einem Prüfzweig bei grünen Tests“. Ohne Zweig: nicht main.
        rc, tags = git(repo, "tag", "-l", "v[0-9]*")
        auf_main = [s for s, z in gruen if z == "main" and self.existiert(s)] + [t + "^{commit}" for t in tags.split()]
        auf_pruef = [s for s, z in gruen if z != "main" and self.existiert(s)]
        self.gruen = self.vorgaenger(auf_main)
        self.gruen_pruef = self.gruen | self.vorgaenger(auf_pruef)
        self.cache = {}

    def vorgaenger(self, start):
        if not start:
            return set()
        rc, out = git(self.repo, "rev-list", *start)
        return set(out.split()) if rc == 0 else set()

    def existiert(self, h):
        rc, out = git(self.repo, "cat-file", "-t", h)
        return rc == 0 and out.strip() == "commit"

    def voll(self, h):
        if h not in self.cache:
            rc, out = git(self.repo, "rev-parse", "-q", "--verify", h + "^{commit}")
            self.cache[h] = out.strip() if rc == 0 else None
        return self.cache[h]

    def pruefzweige(self, voll):
        rc, out = git(self.repo, "for-each-ref", "--contains", voll, "--format=%(refname:short)",
                      "refs/heads/pruef", "refs/remotes/origin/pruef")
        return sorted({z.replace("origin/", "", 1) for z in out.split()}) if rc == 0 else []


def absaetze(body):
    return [a.strip() for a in re.split(r"\n\s*\n", body or "") if a.strip()]


def einordnen(i, f, now):
    """Eine Liste je Eintrag auf In Progress. Nur belegte Fälle bekommen A/B/C; alles andere U (einzeln prüfen)."""
    k, titel, body = kuerzel(i["id"]), i.get("title", ""), i.get("body", "") or ""
    if k in UMBAU or k in P4 or P4_TITEL.search(titel) or UMBAU_TITEL.search(titel):
        return "D", "", "P4 bzw. Umbau (S0 c): bleibt In Progress"
    w = frisch_gesperrt(body, now)
    if w:
        return "W", "", "frischer Vermerk „In Arbeit: %s“ (unter %d Std.): unberührt lassen" % (w, SPERRE_STUNDEN)
    teile = absaetze(body)
    mit_hash = [(n, a, [f.voll(h) for h in HASH.findall(a) if re.search(r"\d", h)])
                for n, a in enumerate(teile)]
    mit_hash = [(n, a, [v for v in hs if v]) for n, a, hs in mit_hash]
    mit_hash = [x for x in mit_hash if x[2]]
    nutzer = i.get("typ", "").lower() == "bug" and GITHUB.search(titel)
    if not mit_hash:
        if nutzer:
            return "N", "", "Nutzer-Bug ohne Commit: läuft weiter, nie Pausiert"
        return "C", "", "kein Commit in den Notizen: angefangen, nicht fertig"
    n, absatz, hs = mit_hash[-1]
    kurz = ",".join(h[:8] for h in hs)
    r = einordnen_commit(n, absatz, hs, kurz, titel, teile, f)
    if nutzer and r[0] in ("U", "C"):
        # Wortlaut 20.11.2026 „Weiter laufen von Nutzern gemeldete Bugs, die Nutzer spüren“ geht dem allgemeinen
        # „angefangen, aber nicht fertig → Pausiert“ vor (Fable-Prüfung M2): fertig belegt (A, B) wird abgeschlossen,
        # alles andere läuft weiter und kommt nie auf Pausiert
        return "N", kurz, "Nutzer-Bug mit Commit, nicht fertig belegt (%s): läuft weiter, nie Pausiert" % r[2]
    return r


def einordnen_commit(n, absatz, hs, kurz, titel, teile, f):
    if any(ABNAHME.search(a) for a in teile[n:]):
        return "U", kurz, "zur Abnahme: bleibt In Progress, geschlossen erst nach „abgenommen“ (feste Regel)"
    if n != len(teile) - 1:
        return "U", kurz, "nach der letzten Commit-Notiz folgen weitere Notizen"
    if not COMMITTET.search(absatz):
        return "U", kurz, "letzte Commit-Notiz sagt nicht „committet“, „übernommen“ oder „gepusht“"
    if UNFERTIG.search(absatz) or REIHE.search(titel):
        return "U", kurz, "Teil, Schritt, Reihe, Abnahme oder Offenes"
    in_main = all(h in f.main for h in hs)
    gruen = all(h in f.gruen for h in hs)
    if in_main and gruen:
        return "A", kurz, "Commit in main, CI grün: Done"
    if in_main:
        return "B", kurz, "Commit in main, CI noch nicht grün: wartet auf Push/CI, abschließen"
    zweige = [f.pruefzweige(h) for h in hs]
    if all(zweige) and all(h in f.gruen_pruef for h in hs):
        return "B", kurz, "Commit auf Prüfzweig %s, Tests grün (S0 c): bleibt In Progress, übernehmen" % ",".join(zweige[-1])
    return "U", kurz, "Commit weder in main noch auf grünem Prüfzweig"


NAMEN = {"A": "Done (committet, Commit in main, CI grün)",
         "B": "bleibt In Progress, abschließen (wartet auf Push/CI oder grüner Prüfzweig)",
         "C": "Pausiert mit Notiz zum Stand (angefangen, nicht fertig)",
         "D": "bleibt In Progress (P4 und Umbau, S0 c)",
         "N": "bleibt In Progress, läuft weiter: von Nutzern gemeldeter Bug (Typ Bug, GitHub #n), nie Pausiert",
         "W": "unberührt: frischer Worker-Vermerk",
         "U": "einzeln prüfen (nicht eindeutig belegt)"}


def sortieren(args):
    export, repo = args[0], args[1]
    main, gruen_datei = "origin/main", None
    r = args[2:]
    while r:
        o = r.pop(0)
        if o == "--main":
            main = r.pop(0)
        elif o == "--gruen":
            gruen_datei = r.pop(0)
        elif o == "--jetzt":
            os.environ["HALO_JETZT"] = r.pop(0)
        else:
            raise SystemExit("unbekannte Option " + o)
    gruen = []
    if gruen_datei:
        gruen = [(z.split() + [""])[:2] for z in open(gruen_datei, encoding="utf-8") if z.strip()]
    items = json.load(open(export, encoding="utf-8"))["items"]
    f = Fakten(repo, main, gruen)
    now = jetzt()
    zeilen, zahl = [], {x: 0 for x in "ABCDNWU"}
    ip = [i for i in items if i.get("status") == "In Progress"]
    for i in ip:
        liste, h, grund = einordnen(i, f, now)
        zahl[liste] += 1
        zeilen.append("\t".join([liste, i["id"], kuerzel(i["id"]), h or "-", grund, i.get("title", "")[:100]]))
    for z in sorted(zeilen, key=lambda z: "ABCDNWU".index(z[0])):
        print(z)
    summe = sum(zahl.values())
    print("# Zählung: " + ", ".join("%s %d" % (x, zahl[x]) for x in "ABCDNWU") +
          "; Summe %d = In Progress %d%s" % (summe, len(ip), "" if summe == len(ip) else " – FEHLER"))
    print("# gezählt ohne In Progress: " + ", ".join(
        "%s %d" % (s, sum(1 for i in items if i.get("status") == s))
        for s in ("Todo", "Wartet auf OK", "Pausiert")))
    for x in "ABCDNWU":
        print("# %s = %s" % (x, NAMEN[x]))
    return 0 if summe == len(ip) else 1


def main(a):
    if not a:
        print(__doc__ or "", file=sys.stderr)
        return 2
    c = a[0]
    if c == "zustand":
        print("\t".join(zustand(a[1])))
        return 0
    if c == "sperre":
        z, ab, grund = zustand(a[1])
        if z not in ("aktiv", "angemeldet"):
            return 1
        beginn = iso(ab) - dt.timedelta(hours=float(a[2]))
        if jetzt() >= beginn:
            print("keine neuen Worker seit %s (Umbau-Woche ab %s, S0 a)" % (beginn.isoformat(timespec="minutes"), ab))
            return 0
        return 1
    if c == "erlaubt":
        ok, text = erlaubt(a[1], a[2], a[3] if len(a) > 3 else "", a[4] if len(a) > 4 else "")
        print(text)
        return 0 if ok else 1
    if c == "fable":
        return 0 if fable(a[1], a[2] if len(a) > 2 else "") else 1
    if c == "sortieren":
        return sortieren(a[1:])
    print("unbekannter Befehl " + c, file=sys.stderr)
    return 2


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
