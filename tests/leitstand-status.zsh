#!/bin/zsh
# Leitstand-Zubringer (neon-Auftrag #44, Maintainer 18.11.2026: „Agenten auf neon, Stand von Nachtlauf und
# Tagesroutine, Kontingent, Betriebsschalter, An welchen tasks der Auftragsliste gearbeitet wird und was als nächstes
# auf der Liste steht“, Takt „Alle 5 Minuten“): schreibt ~/halo-nacht/leitstand/status.json und legt sie als einzigen
# Commit (force-push) in das PRIVATE Repo sruf79/halo-status (enthält Board-Inhalte, nie öffentlich). Kein Claude-Aufruf
# außer tests/kontingent.sh (winziger Haiku-Aufruf), und den höchstens alle 15 Minuten. Im selben Commit verlauf.json
# (Zahlen für Verlaufskurven, höchstens alle 30 Min. ein Punkt, 7 Tage), Historie lokal ~/halo-nacht/leitstand-verlauf.json.
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
#   Release und Commits seit dem Tag (alle 15 Min.), gh api rate_limit (je Lauf; zählt selbst nicht gegen das Limit)
#   → github_limit (REST und GraphQL) und in verlauf.json gh_rest/gh_graphql (verbraucht in Prozent); Board-Zeiten und Issues
#   der letzten 48 Stunden (board48.json, issues48.json, alle 15 Min.) → neu_48h/erledigt_48h, issues_neu_48h/_geschlossen_48h.
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
  # 48-Stunden-Zahlen (Maintainer 19.11.2026: „ob wir mehr einträge erledigen in 48 stunden als hinzugekommen sind“), höchstens
  # alle 15 Minuten: Board-Einträge mit Anlage- und Status-Zeit (sichtbare über die Projektliste, archivierte über ihre id aus den
  # archiv.md-Zeilen der letzten 3 Tage); Issues (ohne Pull Requests), die in 3 Tagen geändert wurden, mit Eröffnung und Schluss
  if alt $Q/board48.json 900; then
    b48_sichtbar() {
      setopt localoptions pipefail   # gh gescheitert → kein leeres [] übernehmen
      gh api graphql --paginate -f query='query($endCursor:String){user(login:"sruf79"){projectV2(number:1){items(first:100,after:$endCursor){pageInfo{hasNextPage endCursor} nodes{id createdAt updatedAt fieldValueByName(name:"Status"){... on ProjectV2ItemFieldSingleSelectValue{name updatedAt}}}}}}}' \
        --jq '.data.user.projectV2.items.nodes[]' | jq -s .
    }
    holen $Q/board48-sichtbar.json b48_sichtbar
    ids=(${(f)"$(awk -F' [|] ' -v g=$(date -v-3d +%F) '$1 >= g {print $2}' $A/archiv.md 2>/dev/null | tail -100)"})
    if (( $#ids )); then
      liste=${(j:,:)${(@)ids/(#m)*/\"$MATCH\"}}
      holen $Q/board48-archiv.json gh api graphql -f query="query{nodes(ids:[$liste]){... on ProjectV2Item{id createdAt updatedAt isArchived fieldValueByName(name:\"Status\"){... on ProjectV2ItemFieldSingleSelectValue{name updatedAt}}}}}" --jq '[.data.nodes[] | select(. != null)]'
    else print '[]' > $Q/board48-archiv.json; fi
    if [[ -s $Q/board48-sichtbar.json && -s $Q/board48-archiv.json ]] && (( JETZT - $(zstat +mtime $Q/board48-sichtbar.json) < 120 && JETZT - $(zstat +mtime $Q/board48-archiv.json) < 120 )); then
      jq -n --slurpfile s $Q/board48-sichtbar.json --slurpfile a $Q/board48-archiv.json --argjson t $JETZT '{stand: $t, sichtbar: $s[0], archiviert: $a[0]}' > $Q/board48.json.neu && mv $Q/board48.json.neu $Q/board48.json
    fi
  fi
  alt $Q/issues48.json 900 && holen $Q/issues48.json gh issue list -R $GH_REPO --state all -L 200 --search "updated:>=$(date -v-3d +%F)" \
    --json number,state,createdAt,closedAt --jq '[.[] | {nr: .number, offen: (.state == "OPEN"), eroeffnet: .createdAt, geschlossen: .closedAt}]'
  alt $Q/release.json 900 && holen $Q/release.json gh api repos/$GH_REPO/releases/latest --jq '{tag: .tag_name, zeit: .published_at}'
  if [[ -s $Q/release.json ]] && alt $Q/vergleich.json 900; then
    holen $Q/vergleich.json gh api "repos/$GH_REPO/compare/$(jq -r .tag $Q/release.json)...main" --jq '{ahead: .ahead_by}'
  fi
  holen $Q/ci.json gh run list -R $GH_REPO -L 15 --json databaseId,number,displayTitle,headBranch,event,status,conclusion,createdAt,updatedAt,url
  # ci_main gezielt (der neueste main-Lauf ist oft nicht unter den 15 neuesten; 5 für abgebrochene davor)
  holen $Q/ci-main.json gh run list -R $GH_REPO --branch main -L 5 --json headBranch,status,conclusion
  # GitHub-Limit je Lauf frisch (alter Wert gilt nicht weiter: nicht lesbar → github_limit null)
  rm -f $Q/rate.json
  holen $Q/rate.json gh api rate_limit --jq '{core: .resources.core, graphql: .resources.graphql}'
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
        with open(p, encoding="utf-8", errors="replace") as f: return json.load(f) if json_ else f.read()   # Protokolle können kaputtes UTF-8 enthalten
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
def unvis(t):
    """ps unter macOS kodiert Nicht-ASCII und Zeilenumbrüche nach vis(3) („ → M-bM^@M^^, Umbruch → \\012); zurück nach UTF-8"""
    b, i = bytearray(), 0
    while i < len(t):
        if t.startswith("M-", i) and i + 2 < len(t): b.append(ord(t[i + 2]) & 0x7f | 0x80); i += 3
        elif t.startswith("M^", i) and i + 2 < len(t): b.append(0xff if t[i + 2] == "?" else (ord(t[i + 2]) ^ 0x40) & 0x7f | 0x80); i += 3
        elif t[i] == "\\" and re.match(r"[0-7]{3}", t[i + 1:i + 4]): b.append(int(t[i + 1:i + 4], 8)); i += 4
        else: b.extend(t[i].encode("utf-8")); i += 1
    return b.decode("utf-8", "replace")
PROZ = {}
for z in (lies(Q + "/ps.txt") or "").splitlines():
    m = re.match(r"\s*(\d+)\s+(\d+)\s+(\S+)\s+(.*)", z)
    if not m: continue
    c = m.group(4)
    if re.match(r"(\S*/)?claude -p ", c): c = unvis(c)   # (nur die Runden: dort stehen Titel und Auftrag)
    try: PROZ[int(m.group(1))] = (int(m.group(2)), JETZT - etime_s(m.group(3)), c)
    except ValueError: pass
# Kopf einer Runde der Tagesroutine (tests/tagesroutine.sh): „JETZT: genau einen Eintrag bearbeiten …: <id> (<Art>) „Titel““
# bzw. „JETZT: Fable-Runde … für <id> „Titel““; „JETZT:“ allein kommt auch im mitgegebenen Auftragstext vor
KOPF = re.compile(r"JETZT: (?:genau einen Eintrag bearbeiten|Fable-Runde)[^\n„]*„([^“\n]+)“")
DESIGNER = re.compile(r"(^|\n)Design-Eintrag: Du bist der Director")
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
# Hauptprozess statt Zeitgeber: die Schleifen starten je Worker eine Unterschale „( sleep 14400; pkill … ) &!“, die
# wie die Schleife heißt (am 19.11. erschien „Wächter Auslastung“ 14-mal); zählt nur, wer die Sperrdatei hält, sonst
# jeder passende Prozess ohne Zeitgeber-Muster (einziges Kind „sleep N“, im selben Augenblick gestartet)
SPERREN = {"Nachtlauf": "lauf.lock", "Tagesroutine": "tagesroutine.lock",
           "Wächter Auslastung": "auslastung-schleife.lock", "Wächter Zwischen-Release": "zwischen-schleife.lock"}
def zeitgeber(p):
    k = [q for q, (pp, _, _) in PROZ.items() if pp == p]
    return len(k) == 1 and bool(re.match(r"(\S*/)?sleep \d+\s*$", PROZ[k[0]][2])) and abs(PROZ[k[0]][1] - PROZ[p][1]) <= 2
def haupt(name, rx):
    s = (lies(N + "/" + SPERREN[name]) or "").strip() if name in SPERREN else ""
    if s.isdigit() and int(s) in PROZ and re.search(rx, PROZ[int(s)][2]): return [int(s)]
    return [p for p in oberste(rx) if not zeitgeber(p)]
# Woran ein Agent sitzt: tests/board.sh status <id> arbeit schreibt in-arbeit.tsv „<Epoche> <id> <Titel> <PID-Kette>
# <Zweig> <Ordner>“ (Tab); passt die PID des Agenten in die Kette (oder Zweig/Arbeitskopie des Workers), gilt der Titel
def _in_arbeit():
    aus = []
    for z in (lies(N + "/in-arbeit.tsv") or "").splitlines():
        t = z.split("\t")
        if len(t) < 6 or not t[0].isdigit() or JETZT - int(t[0]) > 86400: continue
        aus.append({"zeit": int(t[0]), "titel": t[2], "kette": {int(x) for x in t[3].split(",") if x.isdigit()},
                    "zweig": t[4], "ordner": t[5]})
    return sorted(aus, key=lambda r: -r["zeit"])
IN_ARBEIT = sicher(_in_arbeit) or []
def eintrag_aus_liste(pid=None, zweig=None, ordner=None):
    for r in IN_ARBEIT:
        if (pid is not None and pid in r["kette"]) or (zweig and r["zweig"] == zweig) \
           or (ordner and (r["ordner"] == ordner or r["ordner"].startswith(ordner.rstrip("/") + "/"))):
            return r["titel"]
    return None
def modell_von(pid):
    for k in kinder(pid):
        m = RUNDE.match(PROZ[k][2]) and re.search(r"claude -p .*?--model (\S+)", PROZ[k][2])   # ohne Kontingent-Messung
        if m: return m.group(1)
    return None
def eintrag_von(pid):
    """Titel aus der laufenden Runde („JETZT: … „Titel““), sonst aus in-arbeit.tsv"""
    for k in kinder(pid):
        m = KOPF.search(PROZ[k][2])
        if m: return m.group(1)
    return eintrag_aus_liste(pid)
LAEUFE = {"nachtlauf": ("Nachtlauf", r"/nachtlauf\.sh(\s|$)"), "tagesroutine": ("Tagesroutine", r"/tagesroutine\.sh(\s|$)")}
SONST_LAEUFE = [("Wochenprüfung", r"/wochenpruefung\.sh(?!.*--doku)"), ("Doku-Prüfung", r"/wochenpruefung\.sh.*--doku"),
                ("Design-Rundgang", r"/rundgang-woche\.sh"), ("Morgenbrief", r"/morgenbrief\.sh")]
WAECHTER = [("Wächter Auslastung", r"auslastung-schleife\.zsh"), ("Wächter Zwischen-Release", r"zwischen-schleife\.zsh"),
            ("Wächter CI", r"/ci-waechter\.sh"), ("Wächter Bilder-Eingang", r"/bilder-eingang\.zsh"),
            ("Wächter GitHub-Kommunikation", r"/github-komm-waechter\.sh")]

# Arbeitet ein Lauf gerade? (Maintainer 19.11.2026 „ja“: Tagesroutine und Nachtlauf zählen nur mit laufender Claude-Runde
# als arbeitender Agent.) Runde = ein Nachfahre „claude -p …“; die Kontingent-Messung (tests/kontingent.sh: „claude -p ok
# --model haiku“) ist keine Runde. Ohne Runde wartet der Lauf (Drossel, volle Stunde, Pause, kein Kontingent, Planpause);
# der Grund kommt kurz aus der letzten Zeile seines Protokolls.
RUNDE = re.compile(r"(\S*/)?claude -p (?!ok --model haiku)")
def runde_von(pid):
    return any(RUNDE.match(PROZ[k][2]) for k in kinder(pid))
LOGS = {"Nachtlauf": "[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9].log", "Tagesroutine": "*-tagesroutine.log"}
def grund_aus(schritt):
    """letzte Protokollzeile → kurzer Grund des Wartens"""
    s = schritt or ""
    hm = re.search(r"nächster Versuch (\d\d:\d\d)|warte bis (\d\d:\d\d)|nächste Planung (\d\d:\d\d)", s)
    bis = next((g for g in hm.groups() if g), None) if hm else None
    m = re.search(r"Drossel Stufe (\d)", s)
    if m:
        if m.group(1) == "3": return "Drossel Stufe 3, wartet bis zur vollen Stunde" + (" (%s)" % bis if bis else "")
        return "Drossel Stufe %s, Runde ausgesetzt" % m.group(1) + (" bis %s" % bis if bis else "")
    m = re.match(r"Pause bis \S*?(\d\d:\d\d)", s)
    if m: return "Pause bis %s (pausen.txt)" % m.group(1)
    if s.startswith("Limit"): return "Limit erreicht, Pause 30 Minuten"
    m = re.match(r"vor dem Beginn (\d\d:\d\d)", s)
    if m: return "wartet auf den Beginn um %s" % m.group(1)
    if s.startswith("Sparmodus"): return "Sparmodus, wartet" + (" bis %s" % bis if bis else "")
    if s.startswith("Plan abgearbeitet"): return "Plan abgearbeitet, wartet" + (" bis %s" % bis if bis else "")
    if re.match(r"Plan-Runde \d+: 0 Einträge", s): return "nichts im Plan, wartet" + (" bis %s" % bis if bis else "")
    m = re.match(r"warte: (.*)", s)
    if m:
        kopf = m.group(1).split(" – ")[0]
        kopf = (kopf[:57] + "…") if len(kopf) > 60 else kopf
        return kopf + (", wartet bis %s" % bis if bis else "")
    return "keine Claude-Runde" + (": " + ((s[:77] + "…") if len(s) > 80 else s) if s else "")
def schritt_von(name):
    logs = sorted(glob.glob(N + "/" + LOGS[name]), key=os.path.getmtime)
    return letzte_zeile(logs[-1], True) if logs else (None, None)   # ungekürzt: „nächster Versuch“ steht am Ende
# Wann macht ein wartender Lauf frühestens weiter (Dashboard-Sitzung, Maintainer 19.11.2026 „ja, bitte neon um das feld“)?
# Nur aus der Zeile, nach der er selbst wartet, nicht geschätzt: „Pause bis <ISO>“ (aus pausen.txt), „Limit – Pause 30
# Minuten“ (Zeit der Zeile + 30 Min.), sonst die Uhrzeit nach „nächster Versuch“, „warte bis“, „nächste Planung“ bzw. „vor dem
# Beginn“ (Wiener Zeit am Tag der Zeile; liegt sie davor, am Folgetag); nichts davon → None.
def weiter_aus(schritt, wann):
    s = schritt or ""
    if wann is None: return None
    m = re.match(r"Pause bis (\S+)", s)
    if m: return iso(m.group(1))
    if re.match(r"Limit\b.*Pause 30 Minuten", s): return iso(wann.timestamp() + 1800)
    m = re.search(r"nächster Versuch (\d\d):(\d\d)|warte bis (\d\d):(\d\d)|nächste Planung (\d\d):(\d\d)|^vor dem Beginn (\d\d):(\d\d)", s)
    if not m: return None
    h, mi = [int(g) for g in m.groups() if g is not None]
    z = wann.replace(hour=h, minute=mi, second=0, microsecond=0)
    if z < wann.replace(second=0, microsecond=0): z += dt.timedelta(days=1)
    return iso(z.timestamp())
def zustand_von(name, p):
    """(zustand, grund, weiter_um) eines Laufs mit Hauptprozess p"""
    if name not in LOGS or runde_von(p): return "arbeitet", None, None
    schritt, wann = schritt_von(name)
    return "wartet", grund_aus(schritt), weiter_aus(schritt, wann)

def agenten():
    aus = []
    for name, rx in [v for v in LAEUFE.values()] + SONST_LAEUFE:
        for p in haupt(name, rx):
            zu, gr, wu = zustand_von(name, p)
            aus.append({"name": name, "art": "lauf", "seit": iso(PROZ[p][1]), "modell": modell_von(p),
                        "eintrag": eintrag_von(p) if name in LOGS and zu == "arbeitet" else None,
                        "zustand": zu, "grund": gr, "weiter_um": wu})
            # Designer als Unteragent einer Runde (Auftrag mit „Design-Eintrag:“): eigener Eintrag
            for k in kinder(p):
                c = PROZ[k][2]
                if re.match(r"(\S*/)?claude -p ", c) and DESIGNER.search(c):
                    m, mm = KOPF.search(c), re.search(r"--model (\S+)", c)
                    aus.append({"name": "Designer (%s)" % name, "art": "lauf", "seit": iso(PROZ[k][1]),
                                "modell": mm.group(1) if mm else None, "eintrag": m.group(1) if m else eintrag_aus_liste(k),
                                "zustand": "arbeitet", "grund": None, "weiter_um": None})
    # Worker des Auslastungswächters: Zustandsdatei „<pid> <Sitzung> <Modell> <Start> <Arbeitskopie> <Zweig> …“, nur lebende
    for f in sorted(glob.glob(N + "/auslastung/worker-[0-9]*")):
        t = (lies(f) or "").split()
        if len(t) >= 4 and t[0].isdigit() and int(t[0]) in PROZ:
            wt, zweig = (t[4] if len(t) > 4 else None), (t[5] if len(t) > 5 else None)
            aus.append({"name": "Worker " + f.rsplit("-", 1)[1] + (" (%s)" % zweig if zweig else ""), "art": "worker",
                        "seit": iso(int(t[3])), "modell": t[2], "eintrag": eintrag_aus_liste(int(t[0]), zweig, wt),
                        "zustand": "arbeitet", "grund": None, "weiter_um": None})
    for name, rx in WAECHTER:
        for p in haupt(name, rx):
            aus.append({"name": name, "art": "waechter", "seit": iso(PROZ[p][1]), "modell": modell_von(p), "eintrag": None,
                        "zustand": "läuft", "grund": None, "weiter_um": None})
    for p in oberste(r"Runner\.Worker"):
        aus.append({"name": "CI-Runner", "art": "ci", "seit": iso(PROZ[p][1]), "modell": None, "eintrag": None,
                    "zustand": "läuft", "grund": None, "weiter_um": None})
    for p in oberste(r"claude remote-control .*--name (\S+)"):
        m = re.search(r"--name (\S+)", PROZ[p][2])
        aus.append({"name": m.group(1), "art": "sitzung", "seit": iso(PROZ[p][1]), "modell": None, "eintrag": None,
                    "zustand": "läuft", "grund": None, "weiter_um": None})
    return aus

# Zeilen ohne Aussage über den Schritt (Kontingent-/Volldampf-Stand, Push-Bestätigung, git-Ausgaben ohne Zeit)
LEISE = r"(Volldampf aktiv|Kontingent|Push: gesendet)"
def letzte_zeile(datei, voll=False):
    for z in reversed((lies(datei) or "").splitlines()):
        m = re.match(r"(\d{4}-\d\d-\d\d \d\d:\d\d:\d\d) (.*)", z)
        if m and not re.match(LEISE, m.group(2)):
            # keine Sitzungs-IDs im Schritt-Text (Leitstand ist eine Übersicht, die IDs ändern sich je Runde)
            t = re.sub(r",?\s*Sitzung\s+\S+", "", m.group(2))
            t = re.sub(r"\s*\b(cse_\w+|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\b", "", t).strip()
            return (t[:157] + "…") if len(t) > 160 and not voll else t, dt.datetime.strptime(m.group(1), "%Y-%m-%d %H:%M:%S").replace(tzinfo=WIEN)
    return None, None
def lauf(schluessel, logmuster):
    name, rx = LAEUFE[schluessel]
    p = haupt(name, rx)
    logs = sorted(glob.glob(N + "/" + logmuster), key=os.path.getmtime)
    schritt, wann = letzte_zeile(logs[-1]) if logs else (None, None)
    # aktiv = Skript läuft (wie bisher), runde = gerade eine Claude-Runde (sonst wartet es)
    if p:
        r = runde_von(p[0])
        return {"aktiv": True, "runde": r, "schritt": schritt, "eintrag": eintrag_von(p[0]) if r else None, "seit": iso(PROZ[p[0]][1]),
                "weiter_um": None if r else zustand_von(name, p[0])[2]}
    return {"aktiv": False, "runde": False, "schritt": ("zuletzt: " + schritt) if schritt else None, "eintrag": None,
            "seit": iso(wann.timestamp()) if wann else None, "weiter_um": None}
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

# Kontingent-Drossel (drossel_stufe in lauf-hilfen.zsh, 19.11.2026; Maintainer: „bitte neon, die drossel-stufe in status.json
# mitzuliefern“): aus drossel-stufe.txt, nach der Wächter und Tagesroutine handeln, nicht neu gerechnet. Zeile 1 „<Stufe>
# <Fehlstunden> <ISO> [<seit ISO> [offen]]“ („offen“ = Fail-open, Stufe 0), Zeile 2 Wirkung, Zeile 3 Grund. Älter als 2 Stunden (Volldampf aus, Läufe ruhen) oder
# unlesbar → null. max_worker: 0 ab Stufe 1 (keine neuen Worker), sonst null (keine Grenze durch die Drossel).
def drossel():
    z = (lies(N + "/drossel-stufe.txt") or "").splitlines()
    t = z[0].split() if z else []
    if len(t) < 3 or t[0] not in ("0", "1", "2", "3"): return None
    g = iso(t[2])
    if g is None or JETZT - dt.datetime.strptime(g, "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=dt.timezone.utc).timestamp() > 7200: return None
    s = 0 if len(t) > 4 and t[4] == "offen" else int(t[0])   # „offen“: zuletzt Fail-open, keine Drossel (Stufe nur Gedächtnis)
    return {"stufe": s, "text": (z[1].strip() if len(z) > 1 else "") or None, "grund": (z[2].strip() if len(z) > 2 else "") or None,
            "seit": iso(t[3]) if len(t) > 3 else g, "max_worker": 0 if s >= 1 else None}

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
# 48 Stunden (Maintainer 19.11.2026): aus board48.json (Anlagezeit createdAt; erledigt = Status Done mit Zeit der
# Statusänderung, archiviert ohne Done mit Zeit der letzten Änderung, also dem Archivieren); fehlt sie → None
B48 = lies(Q + "/board48.json", True)
def _b48():
    if not isinstance(B48, dict) or not isinstance(B48.get("sichtbar"), list) or not isinstance(B48.get("archiviert"), list): return None
    alle = {}
    for i in B48["sichtbar"] + B48["archiviert"]: alle[i["id"]] = i
    return alle.values()
def _seit48(t):
    return t is not None and JETZT - 48 * 3600 <= dt.datetime.strptime(iso(t), "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=dt.timezone.utc).timestamp() <= JETZT
def neu_48h():
    a = _b48()
    return None if a is None else sum(1 for i in a if _seit48(i.get("createdAt")))
def erledigt_48h():
    a = _b48()
    if a is None: return None
    def zeit(i):
        st = i.get("fieldValueByName") or {}
        if st.get("name") == "Done": return st.get("updatedAt")
        return i.get("updatedAt") if i.get("isArchived") else None
    return sum(1 for i in a if _seit48(zeit(i)))
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
                       "neu_48h": sicher(neu_48h), "erledigt_48h": sicher(erledigt_48h),
                       "je_bereich": [{"bereich": k, **v} for k, v in sorted(je.items(), key=lambda kv: (-sum(kv[1].values()), kv[0]))]}}

def issues_warten():
    iss = lies(Q + "/issues.json", True)
    if iss is None: return None
    aus = [{"nr": i["nr"], "titel": i["titel"], "seit": iso(i.get("seit"))} for i in iss if not i.get("wir")]
    return sorted(aus, key=lambda x: x["seit"] or "")
# Issues in 48 Stunden (ohne Pull Requests): aus issues48.json (in 3 Tagen geändert, höchstens 200; voll → nicht verlässlich)
I48 = lies(Q + "/issues48.json", True)
def _i48():
    return I48 if isinstance(I48, list) and len(I48) < 200 else None
def issues_neu_48h():
    i = _i48()
    return None if i is None else sum(1 for x in i if _seit48(x.get("eroeffnet")))
def issues_geschlossen_48h():
    i = _i48()
    return None if i is None else sum(1 for x in i if not x.get("offen") and _seit48(x.get("geschlossen")))
def issues_offen():
    """offene Issues insgesamt aus issues.json (höchstens 100 geladen; voll → nicht verlässlich)"""
    iss = lies(Q + "/issues.json", True)
    return len(iss) if isinstance(iss, list) and len(iss) < 100 else None
def bilder_offen():
    t = lies(A + "/bilder-offen.md")
    if t is None: return None
    zeilen = [z for z in t.splitlines() if z.startswith("|")]
    return max(0, len([z for z in zeilen if not re.match(r"\|[\s|:-]+\|?$", z)]) - 1)   # ohne Kopf und Trennzeile
def rueckmeldungen():
    return {"issues_warten": sicher(issues_warten), "bilder_offen": sicher(bilder_offen),
            "issues_neu_48h": sicher(issues_neu_48h), "issues_geschlossen_48h": sicher(issues_geschlossen_48h),
            "issues_offen": sicher(issues_offen)}

CI = lies(Q + "/ci.json", True)
CI_MAIN = lies(Q + "/ci-main.json", True)
def ci():
    if CI is None: return None
    return [{"id": str(r["databaseId"]), "nr": r["number"], "titel": r["displayTitle"], "zweig": r["headBranch"],
             "ausloeser": r["event"], "status": r["status"], "ergebnis": r.get("conclusion") or None,
             "start": iso(r["createdAt"]), "stand": iso(r["updatedAt"]), "url": r["url"]} for r in CI]
def ci_main():
    """neuester main-Lauf (gezielte Abfrage, sonst aus den 15 neuesten); abgebrochene zählen nicht"""
    quelle = CI_MAIN if CI_MAIN else CI
    if quelle is None: return None
    for r in quelle:
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
    nl = haupt("Nachtlauf", LAEUFE["nachtlauf"][1])
    if nl and not (rel.get("zeit") and iso(rel["zeit"]) >= iso(PROZ[nl[0]][1])):
        return {"zeit": None, "grund": "Nachtlauf läuft; er veröffentlicht nach grüner CI, Zeitpunkt offen." + seit}
    hm = jetzt_w.hour * 100 + jetzt_w.minute
    if volldampf() and 900 <= hm < 2230:
        return {"zeit": None, "grund": "Volldampf: Zwischen-Release, sobald ein Prüfzweig mit mindestens 3 Thunderbird-Commits grün ist." + seit}
    nacht = jetzt_w.replace(hour=1, minute=30, second=0, microsecond=0)
    if nacht.timestamp() <= JETZT: nacht += dt.timedelta(days=1)
    return {"zeit": iso(nacht.timestamp() + 3 * 3600),
            "grund": "Nächster Nachtlauf (01:30 Wiener Zeit) veröffentlicht nach grüner CI; Zeit geschätzt (Start plus 3 Stunden)." + seit}

RATE = lies(Q + "/rate.json", True)
def github_limit():
    """aus gh api rate_limit: je Bereich Limit, verbraucht (limit − remaining), rest (verbleibend), Reset; unlesbar → None"""
    if not isinstance(RATE, dict): return None
    aus = {}
    for name, quelle in (("rest", "core"), ("graphql", "graphql")):
        r = RATE.get(quelle) or {}
        lim, rest = r.get("limit"), r.get("remaining")
        if not (isinstance(lim, int) and isinstance(rest, int) and lim > 0): return None
        aus[name] = {"limit": lim, "verbraucht": lim - rest, "rest": rest, "reset": iso(r.get("reset"))}
    return aus

st = {"stand": iso(JETZT), "agenten": sicher(agenten), "laeufe": sicher(laeufe), "release_eta": sicher(release_eta),
      "kontingent": sicher(kontingent), "schalter": sicher(schalter), "board": sicher(board),
      "rueckmeldungen": sicher(rueckmeldungen), "ci": sicher(ci), "ci_main": sicher(ci_main),
      "github_limit": sicher(github_limit), "drossel": sicher(drossel)}
with open(OUT + ".neu", "w", encoding="utf-8") as f: json.dump(st, f, ensure_ascii=False, indent=1)
os.replace(OUT + ".neu", OUT)

# --- verlauf.json: höchstens alle 30 Minuten ein Punkt, nur 7 Tage (höchstens 336 Punkte), Historie lokal in HIST ---
# nur Zahlen aus den schon berechneten Feldern (keine Titel); nicht messbar → null; je Punkt eine Zeile
HIST, VERLAUF = sys.argv[6], sys.argv[7]
def punkt():
    k, b, ci_, ag = st["kontingent"] or {}, st["board"], st["ci"], st["agenten"]
    z = (b or {}).get("zahlen") or {}
    def zaehle(f): return None if ci_ is None else sum(1 for r in ci_ if f(r["status"]))
    gl = st["github_limit"] or {}
    def anteil(b): return round(100 * gl[b]["verbraucht"] / gl[b]["limit"], 1) if b in gl else None
    return {"t": iso(JETZT), "woche": k.get("woche_prozent"), "fuenf": k.get("fuenf_stunden_prozent"), "soll": k.get("soll_prozent"),
            "bugs": z.get("bugs_offen"), "features": z.get("features_offen"),
            "in_arbeit": None if b is None else len(b.get("in_arbeit") or []),
            "ci_wartend": zaehle(lambda s: s in ("queued", "waiting", "pending", "requested")),
            "ci_laufend": zaehle(lambda s: s not in ("completed", "queued", "waiting", "pending", "requested")),
            "agenten": None if ag is None else sum(1 for a in ag if a["art"] in ("lauf", "worker") and a.get("zustand") == "arbeitet"),
            "gh_rest": anteil("rest"), "gh_graphql": anteil("graphql"),
            "drossel": (st["drossel"] or {}).get("stufe")}
def epoche(t): return dt.datetime.strptime(t, "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=dt.timezone.utc).timestamp()
punkte = []
roh = lies(HIST)
if roh is not None:
    try:
        punkte = json.loads(roh)["punkte"]
        assert isinstance(punkte, list)
        punkte = [p for p in punkte if isinstance(p, dict) and isinstance(p.get("t"), str) and epoche(p["t"]) <= JETZT]
    except Exception as e:
        sys.stderr.write("Verlauf defekt, beginnt neu: %s\n" % e); punkte = []
if not punkte or JETZT - epoche(punkte[-1]["t"]) >= 1800:
    p = sicher(punkt)
    if p is not None: punkte.append(p)
punkte = [p for p in punkte if JETZT - epoche(p["t"]) < 7 * 86400][-336:]
text = "{\"punkte\":[\n" + "".join(json.dumps(p, ensure_ascii=False, separators=(",", ":")) + ("," if i < len(punkte) - 1 else "") + "\n"
                              for i, p in enumerate(punkte)) + "]}\n"
for ziel in (HIST, VERLAUF):
    with open(ziel + ".neu", "w", encoding="utf-8") as f: f.write(text)
    os.replace(ziel + ".neu", ziel)
'
python3 -I -c $LS_PY $Q $N $A $JETZT $D/status.json $N/leitstand-verlauf.json $D/verlauf.json 2>>$LOG || { log "FEHLER status.json nicht gebaut"; exit 1 }
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
cp $D/verlauf.json $R/verlauf.json
git -C $R add status.json verlauf.json
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
