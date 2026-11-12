#!/bin/zsh
export HALO_LAUF=vergleich
# Vergleichsbericht Vorher/Nachher der Vier-Wochen-Messung (Entwurf, Auftrag stufe-6 Übergabe Punkt 4,
# 10.11.2026). Die Wochenprüfung am Sonntag 6.12.2026 (M25, tests/wochenpruefung.sh) ruft das Skript nach
# ihrem normalen Lauf auf; ohne Sprachmodell, nur Dateien und gh.
#   vergleich-6-12.sh [<Repo-Ordner>]
#   vergleich-6-12.sh --trocken [<Repo>]   kein Netz; Bericht nur nach ~/halo-analyse/morgenbrief/,
#                                          push() mit HALO_PUSH_TROCKEN=1, handeln.log nicht berührt
# Zeiträume (ISO-Wochen, Mo–So):
#   Vorher   2026-W44 (bis zum Umbau-Beginn 5.11.2026)
#   Umbau    2026-W45 (5.–8.11., Maßnahmen M01–M31 eingeführt; nur informativ)
#   Nachher  2026-W46 bis 2026-W49 (9.11.–6.12.2026)
#   Tagesroutine ab ihrem Einschalttag (HALO_VG_TAGESROUTINE_AB, sonst erster *-tagesroutine.md-Bericht)
# Kennzahlen:
#   Kontingent      ~/halo-nacht/kontingent-tage.tsv (morgenbrief.sh, Höchstwert je Reset-Woche Di 01:00)
#                   und token_ausgabe_mio aus ~/halo-aufgaben/wochen-kennzahlen.json
#   Maintainer nötig  Zeilen in ~/halo-nacht/handeln.log je ISO-Woche (Zählung ab 10.11.2026)
#   Releases je Tag  gh release list (Tage mit Release, Tage mit mehr als einem)
#   Erledigt je Nacht  wochen-kennzahlen.json (erledigt_* / naechte), sonst Aufzählungspunkte unter
#                   „## Erledigt“ in ~/halo-berichte/<datum>-nachtlauf.md (grob)
# Zum Proben: HALO_JETZT, HALO_VG_KENNZAHLEN, HALO_VG_HANDELN, HALO_VG_KONT, HALO_VG_RELEASES (JSON wie
# `gh release list --json tagName,publishedAt,isDraft`), HALO_VG_BERICHTE, HALO_VG_TAGESROUTINE_AB.
emulate -L zsh
setopt extendedglob
export TZ=Europe/Vienna

TROCKEN=
[[ $1 == --trocken ]] && { TROCKEN=1; shift }
REPO=${1:-$HOME/halo-spaces}
HIER=${0:A:h}
path=(~/.local/bin /opt/homebrew/bin /usr/local/bin /Library/Frameworks/Python.framework/Versions/Current/bin $path)

KENNZAHLEN=${HALO_VG_KENNZAHLEN:-$HOME/halo-aufgaben/wochen-kennzahlen.json}
HANDELN=${HALO_VG_HANDELN:-$HOME/halo-nacht/handeln.log}
KONT=${HALO_VG_KONT:-$HOME/halo-nacht/kontingent-tage.tsv}
BERICHTE=${HALO_VG_BERICHTE:-$HOME/halo-berichte}
HILFEN=$HIER/lauf-hilfen.zsh
[[ -r $HILFEN ]] || HILFEN=$REPO/tests/lauf-hilfen.zsh

if [[ -n $TROCKEN ]]; then
  LOG=/dev/null
  export HALO_PUSH_TROCKEN=1 HALO_UEBERSPRUNGEN_LOG=/dev/null
  export HALO_HANDELN_LOG=${HALO_VG_HANDELN_SCHREIBEN:-${TMPDIR:-/tmp}/vergleich-trocken-handeln.log}
  ZIEL=${HALO_VG_ZIEL:-$HOME/halo-analyse/morgenbrief}
else
  LOG=$HOME/halo-nacht/$(date +%F)-vergleich.log
  ZIEL=$BERICHTE
fi
source $HILFEN || { print -u2 "FEHLER: $HILFEN nicht lesbar"; exit 2 }

REL=${TMPDIR:-/tmp}/vergleich-releases.$$.json
trap 'rm -f $REL' EXIT
if [[ -n $HALO_VG_RELEASES ]]; then cp $HALO_VG_RELEASES $REL
elif [[ -z $TROCKEN ]]; then gh release list -R sruf79/halo-spaces -L 100 --json tagName,publishedAt,isDraft > $REL 2>/dev/null || print '[]' > $REL
else print '[]' > $REL
fi

DATUM=$(python3 -I -c 'import os,datetime as d; j=os.environ.get("HALO_JETZT"); print((d.datetime.fromisoformat(j) if j else d.datetime.now()).strftime("%Y-%m-%d"))')
BERICHT=$ZIEL/$DATUM-vergleich.md
mkdir -p $ZIEL

KENNZAHLEN=$KENNZAHLEN HANDELN=$HANDELN KONT=$KONT REL=$REL BERICHTE=$BERICHTE DATUM=$DATUM \
TR_AB=${HALO_VG_TAGESROUTINE_AB:-} TROCKEN=$TROCKEN python3 -I - > $BERICHT <<'PY'
import os, re, json, glob, datetime as dt
from zoneinfo import ZoneInfo
W = ZoneInfo("Europe/Vienna"); e = os.environ
VORHER, UMBAU, NACHHER = ["2026-W44"], ["2026-W45"], ["2026-W46", "2026-W47", "2026-W48", "2026-W49"]
ALLE = VORHER + UMBAU + NACHHER
def woche(d): y, w, _ = d.isocalendar(); return "%d-W%02d" % (y, w)
def tage_der(w):
    y, n = int(w[:4]), int(w[6:]); mo = dt.date.fromisocalendar(y, n, 1)
    return [mo + dt.timedelta(days=i) for i in range(7)]
def lade_json(p, leer):
    try: return json.load(open(p, encoding="utf-8"))
    except (OSError, ValueError): return leer
def mittel(l):
    l = [x for x in l if x is not None]
    return sum(l) / len(l) if l else None
def f(x, n=1, s=""):
    return "–" if x is None else ("%.*f%s" % (n, x, s)).replace(".", ",")
kz = lade_json(e["KENNZAHLEN"], {})
# --- Kontingent: Höchstwert je Reset-Woche (Di 01:00), Woche nach dem Dienstag benannt ---
kont = {}
try:
    for z in open(e["KONT"], encoding="utf-8"):
        t = z.split("\t")
        if len(t) < 2: continue
        try: d = dt.date.fromisoformat(t[0]); v = float(t[1])
        except ValueError: continue
        di = d - dt.timedelta(days=(d.isoweekday() - 2) % 7)
        k = woche(di); kont[k] = max(kont.get(k, 0), v)
except OSError: pass
# --- Maintainer nötig je ISO-Woche ---
hand = {}
try:
    for z in open(e["HANDELN"], encoding="utf-8", errors="replace"):
        try: d = dt.date.fromisoformat(z[:10])
        except ValueError: continue
        hand[woche(d)] = hand.get(woche(d), 0) + 1
except OSError: pass
HAND_AB = dt.date(2026, 11, 10)
# --- Releases je Tag ---
rel = {}
for r in lade_json(e["REL"], []):
    if r.get("isDraft"): continue
    d = dt.datetime.fromisoformat(r["publishedAt"].replace("Z", "+00:00")).astimezone(W).date()
    rel.setdefault(d, []).append(r["tagName"])
# --- erledigt je Nacht aus Nachtlauf-Berichten (grob) ---
def erledigt_bericht(p):
    n, drin = 0, False
    for z in open(p, encoding="utf-8", errors="replace"):
        if z.startswith("## "): drin = z.strip().startswith("## Erledigt")
        elif drin and z.startswith("- "): n += 1
    return n
nacht = {}
for p in glob.glob(os.path.join(e["BERICHTE"], "????-??-??-nachtlauf.md")):
    d = dt.date.fromisoformat(os.path.basename(p)[:10]); nacht[d] = erledigt_bericht(p)
# --- Tagesroutine ---
tr = {}
for p in glob.glob(os.path.join(e["BERICHTE"], "????-??-??-tagesroutine.md")):
    d = dt.date.fromisoformat(os.path.basename(p)[:10]); m = None
    for z in open(p, encoding="utf-8", errors="replace"):
        m = re.match(r"Kurz: .*?(\d+) erledigt", z)
        if m: break
    tr[d] = int(m.group(1)) if m else None
tr_ab = dt.date.fromisoformat(e["TR_AB"]) if e.get("TR_AB") else (min(tr) if tr else None)

def zeile(w):
    k = kz.get(w, {}); tage = tage_der(w)
    rt = [d for d in tage if d in rel]
    mehr = [d for d in rt if len(rel[d]) > 1]
    nr = sum(len(rel[d]) for d in rt)
    erl = k.get("erledigt_gesamt_nachtlauf")
    if erl is None and (k.get("erledigt_bugs") is not None or k.get("erledigt_features") is not None):
        erl = (k.get("erledigt_bugs") or 0) + (k.get("erledigt_features") or 0)
    naechte = k.get("naechte")
    je_nacht = erl / naechte if erl is not None and naechte else None
    nb = [nacht[d] for d in tage if d in nacht]
    hn = hand.get(w, 0) if tage[-1] >= HAND_AB else None
    return {"w": w, "kont": kont.get(w), "tok": k.get("token_ausgabe_mio"), "hand": hn,
            "rel": nr, "rel_tage": len(rt), "rel_mehr": len(mehr), "rel_je_tag": nr / 7,
            "erl_nacht": je_nacht, "erl_bericht": mittel(nb) if nb else None,
            "maint": k.get("maintainer_noetig")}
Z = {w: zeile(w) for w in ALLE}
def schnitt(ws, k): return mittel([Z[w][k] for w in ws])

print("# Vergleich Vorher/Nachher – Vier-Wochen-Messung (%s)%s" % (e["DATUM"], " – TROCKENLAUF mit Testdaten" if e.get("TROCKEN") else ""))
print()
print("Vorher: %s (bis zum Umbau-Beginn 5.11.2026). Umbau: %s. Nachher: %s. Tagesroutine ab %s."
      % (", ".join(VORHER), ", ".join(UMBAU), " bis ".join([NACHHER[0], NACHHER[-1]]), tr_ab.strftime("%d.%m.%Y") if tr_ab else "– (nicht eingeschaltet)"))
print("Ohne Sprachmodell aus Dateien erstellt (vergleich-6-12.sh); „–“ = nicht gemessen.")
print()
print("## Je Woche")
print()
print("| Woche | Kontingent Höchstwert % | Token Mio. | Maintainer nötig | Releases (Tage, Tage >1) | erledigt je Nacht (Kennzahl / Bericht) |")
print("|---|---|---|---|---|---|")
for w in ALLE:
    z = Z[w]
    print("| %s%s | %s | %s | %s | %d (%d, %d) | %s / %s |" % (w, " (Umbau)" if w in UMBAU else "", f(z["kont"], 0), f(z["tok"], 2),
          "–" if z["hand"] is None else z["hand"], z["rel"], z["rel_tage"], z["rel_mehr"], f(z["erl_nacht"]), f(z["erl_bericht"])))
print()
print("## Vorher/Nachher (Mittel je Woche)")
print()
print("| Kennzahl | Vorher | Nachher | Richtung |")
print("|---|---|---|---|")
for name, k, gut in [("Kontingent Höchstwert %", "kont", "weniger"), ("Token Mio.", "tok", "weniger"),
                     ("Maintainer nötig", "hand", "weniger"), ("Releases je Tag", "rel_je_tag", "höchstens 1"),
                     ("Tage mit mehr als einem Release", "rel_mehr", "0"), ("erledigt je Nacht (Kennzahl)", "erl_nacht", "mehr"),
                     ("erledigt je Nacht (Bericht, grob)", "erl_bericht", "mehr")]:
    v, n = schnitt(VORHER, k), schnitt(NACHHER, k)
    zus = ""
    if v is None:   # kein Vorher-Wert: Verlauf innerhalb der Messung (erste gegen letzte Woche)
        v, n, zus = Z[NACHHER[0]][k], Z[NACHHER[-1]][k], " (%s→%s, kein Vorher-Wert)" % (NACHHER[0][-3:], NACHHER[-1][-3:])
    if v is None or n is None: rtg = "nicht vergleichbar"
    elif abs(n - v) < 1e-9: rtg = "gleich" + zus
    else: rtg = ("besser" if (n < v) == (gut in ("weniger", "0", "höchstens 1")) else "schlechter") + zus
    v, n = schnitt(VORHER, k), schnitt(NACHHER, k)
    print("| %s | %s | %s | %s (Ziel: %s) |" % (name, f(v, 2), f(n, 2), rtg, gut))
print()
print("## Tagesroutine")
print()
if tr_ab:
    l = [(d, n) for d, n in sorted(tr.items()) if d >= tr_ab]
    s = sum(n or 0 for _, n in l)
    print("- %d Berichte seit %s, zusammen %d erledigt (%s je Tag)" % (len(l), tr_ab.strftime("%d.%m."), s, f(s / len(l) if l else None)))
else:
    print("- nicht eingeschaltet, kein Bericht")
print()
print("## Grenzen der Messung")
print()
print("- „Maintainer nötig“ wird erst ab 10.11.2026 gezählt: kein Vorher-Wert (W44/W45 „–“).")
print("- Kontingent je Woche erst ab Einschalten des Morgenbriefs (kontingent-tage.tsv); vorher nur Token aus den Kennzahlen.")
print("- „erledigt je Nacht (Bericht)“ zählt Aufzählungspunkte unter „## Erledigt“ und ist nur ein Anhalt.")
print()
print("## Zu entscheiden (Maintainer)")
print()
print("- Wartende Maßnahmen nach dieser Messung: M26 gestaffelte Verteilung, M29 Betrieb verschlanken (M30 /clear bleibt nach der Entscheidung vom 6.11. aus). Einzelheiten docs/umbau.md.")
PY
rc=$?
(( rc == 0 )) || { print -u2 "FEHLER: Auswertung gescheitert (Exitcode $rc)"; exit 1 }
print "Bericht: $BERICHT"
push "Vergleich Vorher/Nachher (Vier-Wochen-Messung) liegt vor: M26, M29 entscheiden – Bericht ${BERICHT/#$HOME/~}" wochenpruefung handeln
exit 0
