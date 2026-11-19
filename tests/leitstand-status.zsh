#!/bin/zsh
# Leitstand-Zubringer (neon-Auftrag #44, Maintainer 18.11.2026: „Agenten auf neon, Stand von Nachtlauf und
# Tagesroutine, Kontingent, Betriebsschalter, An welchen tasks der Auftragsliste gearbeitet wird und was als nächstes
# auf der Liste steht“, Takt „Alle 5 Minuten“): schreibt ~/halo-nacht/leitstand/status.json und legt sie als einzigen
# Commit (force-push) in das PRIVATE Repo sruf79/halo-status (enthält Board-Inhalte, nie öffentlich). Kein Claude-Aufruf
# außer tests/kontingent.sh (winziger Haiku-Aufruf), und den höchstens alle 15 Minuten.
# LaunchAgent at.halo-spaces.leitstand alle 5 Minuten (tests/mac-mini-setup.sh), Protokoll ~/Library/Logs/halo-leitstand.log.
#   zsh tests/leitstand-status.zsh [<Repo>]             sammeln, schreiben, pushen
#   zsh tests/leitstand-status.zsh --ohne-push [<Repo>] sammeln (mit gh) und JSON ausgeben, kein Push
#   zsh tests/leitstand-status.zsh --trocken [<Repo>]   sammeln und JSON ausgeben, kein Push, keine gh-/Claude-Aufrufe
#                                                        über die schon gespeicherten Quellen hinaus
# Quellen (fehlt eine, steht das Feld auf null, kein Abbruch):
#   Prozessliste (Agenten, Läufe), ~/halo-nacht/<datum>.log und <datum>-tagesroutine.log (Schritt), Prozess-Argumente
#   der Tagesroutine-Runde (Eintrag „JETZT: … „Titel““), ~/halo-nacht/auslastung/worker-<n> (Worker),
#   ~/halo-nacht/kontingent.json (älter als 15 Min. → tests/kontingent.sh), wochen_soll/volldampf_aktiv (lauf-hilfen.zsh),
#   pausen.txt, rot-zaehler.txt, Board (gh project item-list, höchstens alle 15 Min.; ein jüngerer Zwischenspeicher von
#   board.sh wird mitgenutzt), ~/halo-aufgaben/archiv.md (erledigt in 7 Tagen), Plan des Directors (neueste
#   ~/halo-nacht/<datum>-plan.md bzw. <datum>-tagesroutine-plan[-n].tsv), offene Issues (alle 15 Min.; wartet = letzter
#   Kommentar nicht von uns; nur Nummer und Titel), ~/halo-aufgaben/bilder-offen.md, gh run list (15 neueste), letztes
#   Release und Commits seit dem Tag (alle 15 Min.).
# Zum Proben: HALO_LS_DIR (Arbeitsordner), HALO_NACHT_DIR, HALO_AUFGABEN_DIR, HALO_LS_JETZT (Epochensekunden),
# HALO_LS_PS (Datei statt ps), HALO_LS_OHNE_NETZ=1 (keine gh-/Claude-Aufrufe), HALO_LS_VOLLDAMPF/HALO_LS_SOLL (statt
# lauf-hilfen.zsh).
emulate -L zsh
setopt extendedglob
path=(~/.local/bin /opt/homebrew/bin /usr/local/bin $path)
zmodload zsh/datetime; zmodload -F zsh/stat b:zstat
HIER=${0:A:h}
TROCKEN= OHNE_PUSH=
[[ $1 == --trocken ]] && { TROCKEN=1; shift }
[[ $1 == --ohne-push ]] && { OHNE_PUSH=1; shift }
REPO=${1:-$HOME/halo-spaces}
GH_REPO=sruf79/halo-spaces STATUS_REPO=sruf79/halo-status
D=${HALO_LS_DIR:-$HOME/halo-nacht/leitstand}
N=${HALO_NACHT_DIR:-$HOME/halo-nacht}
A=${HALO_AUFGABEN_DIR:-$HOME/halo-aufgaben}
Q=$D/quellen
LOG=$D/leitstand.log
JETZT=${HALO_LS_JETZT:-$EPOCHSECONDS}
mkdir -p $Q || exit 1
zeit() { date '+%F %T' }
log() { print -r -- "$(zeit) $*" >> $LOG }
# einmal zugleich (ein hängender gh-Aufruf darf keine Reihe von Läufen stapeln); Sperre älter als 10 Min. gilt als verwaist
if ! mkdir $D/sperre 2>/dev/null; then
  (( JETZT - $(zstat +mtime $D/sperre 2>/dev/null || print 0) < 600 )) && { log "vorheriger Lauf läuft noch – ausgelassen"; exit 0 }
  rm -rf $D/sperre; mkdir $D/sperre || exit 1
fi
trap 'rm -rf $D/sperre' EXIT
alt() {   # <Datei> <Sekunden>: 0 = fehlt oder älter
  [[ -s $1 ]] || return 0
  (( JETZT - $(zstat +mtime $1) >= $2 ))
}
netz() { [[ -z $HALO_LS_OHNE_NETZ && -z $TROCKEN ]] }
holen() {   # <Ziel> <Befehl …>: Ausgabe nur bei Erfolg und nicht leer atomar übernehmen
  local ziel=$1; shift
  if "$@" > $ziel.neu 2>>$LOG && [[ -s $ziel.neu ]]; then mv $ziel.neu $ziel; else rm -f $ziel.neu; log "Quelle nicht lesbar: ${ziel:t}"; fi
}

# --- Quellen sammeln ---
if [[ -n $HALO_LS_PS ]]; then cp $HALO_LS_PS $Q/ps.txt
else ps -axww -o pid=,ppid=,etime=,command= > $Q/ps.txt 2>/dev/null; fi
# Kontingent: höchstens alle 15 Minuten messen, sonst den letzten Wert mit seiner Messzeit weitergeben
KJ=$N/kontingent.json
if netz && alt $KJ 900 && [[ -x $REPO/tests/kontingent.sh || -r $REPO/tests/kontingent.sh ]]; then
  zsh $REPO/tests/kontingent.sh >/dev/null 2>>$LOG || log "Kontingent nicht lesbar (letzter Wert bleibt)"
fi
# Soll und Volldampf aus lauf-hilfen.zsh (eine Stelle für die Regeln)
if [[ -n ${HALO_LS_SOLL+x} ]]; then print -r -- $HALO_LS_SOLL > $Q/soll.txt
else ( LOG=/dev/null; source $HIER/lauf-hilfen.zsh 2>/dev/null && wochen_soll 168 ) > $Q/soll.txt 2>/dev/null; fi
if [[ -n ${HALO_LS_VOLLDAMPF+x} ]]; then print -r -- $HALO_LS_VOLLDAMPF > $Q/volldampf.txt
elif [[ -r $HIER/lauf-hilfen.zsh ]]; then
  ( LOG=/dev/null HALO_UEBERSPRUNGEN_LOG=/dev/null; source $HIER/lauf-hilfen.zsh 2>/dev/null; volldampf_aktiv >/dev/null 2>&1 ) && print 1 > $Q/volldampf.txt || print 0 > $Q/volldampf.txt
else rm -f $Q/volldampf.txt; fi
if netz; then
  # Board schonend: ein frischerer Zwischenspeicher von board.sh zählt mit, sonst höchstens alle 15 Minuten neu laden
  ZW=$N/board-zwischen.json
  if [[ -s $ZW && ( ! -s $Q/board.json || $(zstat +mtime $ZW) -gt $(zstat +mtime $Q/board.json) ) ]]; then cp $ZW $Q/board.json.neu && mv $Q/board.json.neu $Q/board.json; fi
  alt $Q/board.json 900 && holen $Q/board.json gh project item-list 1 --owner sruf79 --limit 1000 --format json
  # Issues: nur Nummer, Titel, Zeit des letzten Beitrags und ob er von uns (oder einem Bot) ist – keine Nutzernamen
  alt $Q/issues.json 900 && holen $Q/issues.json gh issue list -R $GH_REPO --state open -L 100 --json number,title,createdAt,author,comments \
    --jq '[.[] | ((.comments | last) // {author: .author, createdAt: .createdAt}) as $l
                 | {nr: .number, titel: .title, seit: $l.createdAt, wir: (($l.author.login // "") | test("^sruf79$|\\[bot\\]$|-bot$"))}]'
  alt $Q/release.json 900 && holen $Q/release.json gh api repos/$GH_REPO/releases/latest --jq '{tag: .tag_name, zeit: .published_at}'
  if [[ -s $Q/release.json ]] && alt $Q/vergleich.json 900; then
    holen $Q/vergleich.json gh api "repos/$GH_REPO/compare/$(jq -r .tag $Q/release.json)...main" --jq '{ahead: .ahead_by}'
  fi
  holen $Q/ci.json gh run list -R $GH_REPO -L 15 --json databaseId,number,displayTitle,headBranch,event,status,conclusion,createdAt,updatedAt,url
fi

# --- status.json bauen ---
LS_PY='
import json, os, re, sys, time, glob, datetime as dt
from zoneinfo import ZoneInfo
Q, N, A, JETZT, OUT = sys.argv[1], sys.argv[2], sys.argv[3], int(sys.argv[4]), sys.argv[5]
WIEN = ZoneInfo("Europe/Vienna")
def iso(t):
    """Epochensekunden oder ISO-Text → ISO-8601 UTC mit Z; None bleibt None"""
    if t is None or t == "": return None
    if isinstance(t, str):
        try: d = dt.datetime.fromisoformat(t.replace("Z", "+00:00"))
        except ValueError:
            try: d = dt.datetime.strptime(t, "%Y-%m-%dT%H:%M:%S%z")
            except ValueError: return None
        if d.tzinfo is None: d = d.replace(tzinfo=WIEN)
        t = d.timestamp()
    return dt.datetime.fromtimestamp(int(t), dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
def lies(p, json_=False):
    try:
        with open(p, encoding="utf-8") as f: return json.load(f) if json_ else f.read()
    except Exception: return None
def sicher(f):
    """Feld einzeln berechnen: Fehler → None statt Abbruch"""
    try: return f()
    except Exception as e:
        sys.stderr.write("Feld %s: %s\n" % (f.__name__, e)); return None
jetzt_w = dt.datetime.fromtimestamp(JETZT, WIEN)

# Prozesse: pid → (ppid, start, command)
def etime_s(e):
    tage = 0
    if "-" in e: d, e = e.split("-", 1); tage = int(d)
    teile = [int(x) for x in e.split(":")]
    while len(teile) < 3: teile.insert(0, 0)
    return tage * 86400 + teile[0] * 3600 + teile[1] * 60 + teile[2]
PROZ = {}
for z in (lies(Q + "/ps.txt") or "").splitlines():
    m = re.match(r"\s*(\d+)\s+(\d+)\s+(\S+)\s+(.*)", z)
    if not m: continue
    try: PROZ[int(m.group(1))] = (int(m.group(2)), JETZT - etime_s(m.group(3)), m.group(4))
    except ValueError: pass
def kinder(pid):
    aus, offen = [], [pid]
    while offen:
        p = offen.pop()
        for q, (pp, _, _) in PROZ.items():
            if pp == p: aus.append(q); offen.append(q)
    return aus
def oberste(muster):
    """Prozesse, deren Befehl passt und deren Eltern nicht auch passen (Unterschalen der Schleifen zählen nicht)"""
    rx = re.compile(muster)
    treffer = {p for p, (_, _, c) in PROZ.items() if rx.search(c)}
    return sorted((p for p in treffer if PROZ[p][0] not in treffer), key=lambda p: PROZ[p][1])
def modell_von(pid):
    for k in kinder(pid):
        m = re.search(r"claude -p .*?--model (\S+)", PROZ[k][2])
        if m: return m.group(1)
    return None
def eintrag_von(pid):
    for k in kinder(pid):
        m = re.search(r"JETZT:[^„]*„([^“]+)“", PROZ[k][2])
        if m: return m.group(1)
    return None
LAEUFE = {"nachtlauf": ("Nachtlauf", r"/nachtlauf\.sh(\s|$)"), "tagesroutine": ("Tagesroutine", r"/tagesroutine\.sh(\s|$)")}
SONST_LAEUFE = [("Wochenprüfung", r"/wochenpruefung\.sh(?!.*--doku)"), ("Doku-Prüfung", r"/wochenpruefung\.sh.*--doku"),
                ("Design-Rundgang", r"/rundgang-woche\.sh"), ("Morgenbrief", r"/morgenbrief\.sh")]
WAECHTER = [("Wächter Auslastung", r"auslastung-schleife\.zsh"), ("Wächter Zwischen-Release", r"zwischen-schleife\.zsh"),
            ("Wächter CI", r"/ci-waechter\.sh"), ("Wächter Bilder-Eingang", r"/bilder-eingang\.zsh"),
            ("Wächter GitHub-Kommunikation", r"/github-komm-waechter\.sh")]

def agenten():
    aus = []
    for name, rx in [v for v in LAEUFE.values()] + SONST_LAEUFE:
        for p in oberste(rx):
            aus.append({"name": name, "art": "lauf", "seit": iso(PROZ[p][1]), "modell": modell_von(p)})
    # Worker des Auslastungswächters: Zustandsdatei „<pid> <Sitzung> <Modell> <Start> …“, nur lebende
    for f in sorted(glob.glob(N + "/auslastung/worker-[0-9]*")):
        t = (lies(f) or "").split()
        if len(t) >= 4 and t[0].isdigit() and int(t[0]) in PROZ:
            aus.append({"name": "Worker " + f.rsplit("-", 1)[1], "art": "worker", "seit": iso(int(t[3])), "modell": t[2]})
    for name, rx in WAECHTER:
        for p in oberste(rx):
            aus.append({"name": name, "art": "waechter", "seit": iso(PROZ[p][1]), "modell": modell_von(p)})
    for p in oberste(r"Runner\.Worker"):
        aus.append({"name": "CI-Runner", "art": "ci", "seit": iso(PROZ[p][1]), "modell": None})
    for p in oberste(r"claude remote-control .*--name (\S+)"):
        m = re.search(r"--name (\S+)", PROZ[p][2])
        aus.append({"name": m.group(1), "art": "sitzung", "seit": iso(PROZ[p][1]), "modell": None})
    return aus

# Zeilen ohne Aussage über den Schritt (Kontingent-/Volldampf-Stand, Push-Bestätigung, git-Ausgaben ohne Zeit)
LEISE = r"(Volldampf aktiv|Kontingent|Push: gesendet)"
def letzte_zeile(datei):
    for z in reversed((lies(datei) or "").splitlines()):
        m = re.match(r"(\d{4}-\d\d-\d\d \d\d:\d\d:\d\d) (.*)", z)
        if m and not re.match(LEISE, m.group(2)):
            t = m.group(2).strip()
            return (t[:157] + "…") if len(t) > 160 else t, dt.datetime.strptime(m.group(1), "%Y-%m-%d %H:%M:%S").replace(tzinfo=WIEN)
    return None, None
def lauf(schluessel, logmuster):
    name, rx = LAEUFE[schluessel]
    p = oberste(rx)
    logs = sorted(glob.glob(N + "/" + logmuster), key=os.path.getmtime)
    schritt, wann = letzte_zeile(logs[-1]) if logs else (None, None)
    if p:
        return {"aktiv": True, "schritt": schritt, "eintrag": eintrag_von(p[0]), "seit": iso(PROZ[p[0]][1])}
    return {"aktiv": False, "schritt": ("zuletzt: " + schritt) if schritt else None, "eintrag": None,
            "seit": iso(wann.timestamp()) if wann else None}
def laeufe():
    return {"nachtlauf": lauf("nachtlauf", "[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9].log"),
            "tagesroutine": lauf("tagesroutine", "*-tagesroutine.log")}

def kontingent():
    k = lies(N + "/kontingent.json", True)
    if not k: return None
    w = k["info"].get("unifiedWindows", {})
    wo, h = w.get("seven_day", {}), w.get("five_hour", {})
    if "utilization" not in wo: return None
    s = (lies(Q + "/soll.txt") or "").split()
    try: soll = round(float(s[1]), 1)
    except (IndexError, ValueError): soll = None
    return {"gemessen": iso(k.get("stand")), "woche_prozent": round(100 * wo["utilization"]),
            "fuenf_stunden_prozent": round(100 * h["utilization"]) if "utilization" in h else None,
            "soll_prozent": soll, "reset_woche": iso(wo.get("resetsAt")), "reset_5h": iso(h.get("resetsAt"))}

def volldampf():
    v = (lies(Q + "/volldampf.txt") or "").strip()
    return {"1": True, "0": False}.get(v)
def schalter():
    hm = jetzt_w.hour * 100 + jetzt_w.minute
    pausen = []
    for z in (lies(N + "/pausen.txt") or "").splitlines():
        t = z.split(None, 2)
        if len(t) < 2: continue
        try: bis = dt.datetime.fromisoformat(t[1])
        except ValueError: continue
        if bis.timestamp() > JETZT:
            pausen.append({"was": t[0] + (": " + t[2] if len(t) > 2 else ""), "bis": iso(bis.timestamp())})
    rot = 0
    for z in (lies(N + "/rot-zaehler.txt") or "").splitlines():
        try: e = dt.datetime.strptime(z.split("\t")[0], "%Y-%m-%d %H:%M:%S").replace(tzinfo=WIEN).timestamp()
        except ValueError: continue
        if JETZT - 14 * 86400 <= e <= JETZT: rot += 1
    return {"volldampf": volldampf(), "push_sperre": 130 <= hm < 900, "rot_zaehler": rot, "pausen": pausen}

BOARD = (lies(Q + "/board.json", True) or {}).get("items")
def bereich(titel):
    t = re.sub(r"^\[[^\]]*\]\s*", "", titel)
    m = re.match(r"([^:]{1,40}):", t)
    return m.group(1).strip() if m else "Sonstiges"
def typ(i): return "Bug" if (i.get("typ") or "") == "Bug" else "Feature"
def notiz(i):
    zeilen = [z.strip() for z in ((i.get("content") or {}).get("body") or "").splitlines() if z.strip()]
    if not zeilen: return ""
    z = zeilen[-1]
    return (z[:157] + "…") if len(z) > 160 else z
def plan():
    """neueste Plandatei des Directors (heute/gestern): Liste von (id oder id-Ende, Titel)"""
    kand = []
    for tag in (jetzt_w.date(), jetzt_w.date() - dt.timedelta(days=1)):
        kand += glob.glob("%s/%s-plan.md" % (N, tag)) + glob.glob("%s/%s-tagesroutine-plan*.tsv" % (N, tag))
    if not kand: return None
    f = max(kand, key=os.path.getmtime)
    zeilen = []
    for z in (lies(f) or "").splitlines():
        if f.endswith(".tsv"):
            t = z.split("\t")
            if len(t) >= 3 and t[0].startswith("PVTI_"): zeilen.append(([t[0]], t[2]))
        else:
            t = [x.strip() for x in z.strip().strip("|").split("|")]
            if len(t) >= 3 and t[0].isdigit():
                ids = [re.sub(r"\s*\(.*", "", x).strip() for x in t[1].split(",")]
                zeilen.append(([x for x in ids if x], t[2]))
    erledigt = set()
    for e in glob.glob("%s/%s-tagesroutine-erledigt.txt" % (N, jetzt_w.date())):
        erledigt |= {z.split("\t")[0] for z in (lies(e) or "").splitlines()}
    return zeilen, erledigt
def board():
    if BOARD is None: return None
    offen = [i for i in BOARD if i.get("status") != "Done"]
    in_arbeit = [{"titel": i.get("title"), "typ": typ(i), "bereich": bereich(i.get("title") or ""), "notiz": notiz(i)}
                 for i in offen if i.get("status") == "In Progress"]
    naechste = None
    p = sicher(plan)
    if p is not None:
        zeilen, erledigt = p
        naechste, gesehen = [], set()
        for ids, titel in zeilen:
            for kurz in ids:
                i = next((i for i in offen if i["id"] == kurz or i["id"].endswith(kurz)), None)
                if not i or i["id"] in gesehen or i["id"] in erledigt or i.get("status") != "Todo": continue
                gesehen.add(i["id"])
                naechste.append({"rang": len(naechste) + 1, "titel": i.get("title"), "typ": typ(i), "bereich": bereich(i.get("title") or "")})
        naechste = naechste[:10]
    je = {}
    for i in offen:
        b = je.setdefault(bereich(i.get("title") or ""), {"bugs": 0, "features": 0})
        b["bugs" if typ(i) == "Bug" else "features"] += 1
    erl = None
    arch = lies(A + "/archiv.md")
    if arch is not None:
        grenze = (jetzt_w - dt.timedelta(days=7)).date().isoformat()
        erl = sum(1 for z in arch.splitlines() if re.match(r"\d{4}-\d\d-\d\d \|", z) and z[:10] > grenze)
    return {"in_arbeit": in_arbeit, "naechste": naechste,
            "zahlen": {"bugs_offen": sum(1 for i in offen if typ(i) == "Bug"),
                       "features_offen": sum(1 for i in offen if typ(i) != "Bug"), "erledigt_woche": erl,
                       "je_bereich": [{"bereich": k, **v} for k, v in sorted(je.items(), key=lambda kv: (-sum(kv[1].values()), kv[0]))]}}

def issues_warten():
    iss = lies(Q + "/issues.json", True)
    if iss is None: return None
    aus = [{"nr": i["nr"], "titel": i["titel"], "seit": iso(i.get("seit"))} for i in iss if not i.get("wir")]
    return sorted(aus, key=lambda x: x["seit"] or "")
def bilder_offen():
    t = lies(A + "/bilder-offen.md")
    if t is None: return None
    zeilen = [z for z in t.splitlines() if z.startswith("|")]
    return max(0, len([z for z in zeilen if not re.match(r"\|[\s|:-]+\|?$", z)]) - 1)   # ohne Kopf und Trennzeile
def rueckmeldungen():
    return {"issues_warten": sicher(issues_warten), "bilder_offen": sicher(bilder_offen)}

CI = lies(Q + "/ci.json", True)
def ci():
    if CI is None: return None
    return [{"id": str(r["databaseId"]), "nr": r["number"], "titel": r["displayTitle"], "zweig": r["headBranch"],
             "ausloeser": r["event"], "status": r["status"], "ergebnis": r.get("conclusion") or None,
             "start": iso(r["createdAt"]), "stand": iso(r["updatedAt"]), "url": r["url"]} for r in CI]
def ci_main():
    if CI is None: return None
    for r in CI:
        if r["headBranch"] != "main": continue
        if r["status"] in ("queued", "waiting", "pending", "requested"): return "wartet"
        if r["status"] != "completed": return "läuft"
        if r.get("conclusion") in ("cancelled", "skipped"): continue
        return "grün" if r.get("conclusion") == "success" else "rot"
    return None

def release_eta():
    rel = lies(Q + "/release.json", True) or {}
    ahead = (lies(Q + "/vergleich.json", True) or {}).get("ahead")
    seit = (" %s Commits auf main seit %s." % (ahead, rel["tag"])) if ahead is not None and rel.get("tag") else ""
    if oberste(r"zwischen-release\.zsh|Unbeaufsichtigter Zwischen-Release"):
        return {"zeit": iso(JETZT + 50 * 60), "grund": "Zwischen-Release läuft, wartet auf CI und Windows (etwa 50 Minuten)." + seit}
    nl = oberste(LAEUFE["nachtlauf"][1])
    if nl and not (rel.get("zeit") and iso(rel["zeit"]) >= iso(PROZ[nl[0]][1])):
        return {"zeit": None, "grund": "Nachtlauf läuft; er veröffentlicht nach grüner CI, Zeitpunkt offen." + seit}
    hm = jetzt_w.hour * 100 + jetzt_w.minute
    if volldampf() and 900 <= hm < 2230:
        return {"zeit": None, "grund": "Volldampf: Zwischen-Release, sobald ein Prüfzweig mit mindestens 3 Thunderbird-Commits grün ist." + seit}
    nacht = jetzt_w.replace(hour=1, minute=30, second=0, microsecond=0)
    if nacht.timestamp() <= JETZT: nacht += dt.timedelta(days=1)
    return {"zeit": iso(nacht.timestamp() + 3 * 3600),
            "grund": "Nächster Nachtlauf (01:30 Wiener Zeit) veröffentlicht nach grüner CI; Zeit geschätzt (Start plus 3 Stunden)." + seit}

st = {"stand": iso(JETZT), "agenten": sicher(agenten), "laeufe": sicher(laeufe), "release_eta": sicher(release_eta),
      "kontingent": sicher(kontingent), "schalter": sicher(schalter), "board": sicher(board),
      "rueckmeldungen": sicher(rueckmeldungen), "ci": sicher(ci), "ci_main": sicher(ci_main)}
with open(OUT + ".neu", "w", encoding="utf-8") as f: json.dump(st, f, ensure_ascii=False, indent=1)
os.replace(OUT + ".neu", OUT)
'
python3 -I -c $LS_PY $Q $N $A $JETZT $D/status.json 2>>$LOG || { log "FEHLER status.json nicht gebaut"; exit 1 }
if [[ -n $TROCKEN$OHNE_PUSH ]]; then cat $D/status.json; exit 0; fi
[[ -n $HALO_LS_OHNE_NETZ ]] && exit 0

# --- nach sruf79/halo-status: immer genau ein Commit (force-push), nur solange das Repo privat ist ---
privat() { [[ $(gh repo view $STATUS_REPO --json visibility --jq .visibility 2>/dev/null) == PRIVATE ]] }
privat || { log "FEHLER $STATUS_REPO ist nicht privat oder nicht lesbar – kein Push"; exit 1 }
R=$D/repo
if [[ ! -d $R/.git ]]; then
  rm -rf $R; git init -q -b main $R && git -C $R remote add origin https://github.com/$STATUS_REPO.git || { log "FEHLER Arbeitskopie"; exit 1 }
fi
cp $D/status.json $R/status.json
git -C $R add status.json
# Verlauf klein: jedes Mal ein neuer Wurzel-Commit statt einer wachsenden Kette
BAUM=$(git -C $R write-tree) &&
  C=$(git -C $R -c user.name=neon -c user.email=neon@localhost commit-tree $BAUM -m "Leitstand: Stand $(TZ=UTC date -r $JETZT +%FT%TZ)") &&
  git -C $R update-ref refs/heads/main $C || { log "FEHLER Commit"; exit 1 }
if git -C $R -c credential.helper= -c credential.helper='!gh auth git-credential' push -q -f origin main 2>>$LOG; then
  privat || log "WARNUNG $STATUS_REPO nach dem Push nicht mehr als privat lesbar"
else
  log "FEHLER Push nach $STATUS_REPO"; exit 1
fi
exit 0
