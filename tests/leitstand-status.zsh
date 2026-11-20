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
#   ~/halo-nacht/kontingent.json (älter als 15 Min. → tests/kontingent.sh), kalender_soll/volldampf_aktiv (lauf-hilfen.zsh; Soll = vergangene Zeit der Kalenderwoche, Maintainer 20.11.2026),
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
# Soll und Volldampf aus lauf-hilfen.zsh (eine Stelle für die Regeln); Soll der Kalenderwoche (Maintainer 20.11.2026: „die wochen
# kontingent grafik stimmt hier nicht oder? es sind doch bereits 48% vom wochen rythmus vergangen, welcher immer von dienstag
# 01:00 bis dienstag 01:00 geht“), resetsAt aus kontingent.json, auch nach einem freien Reset
if [[ -n ${HALO_LS_SOLL+x} ]]; then print -r -- $HALO_LS_SOLL > $Q/soll.txt
else ( LOG=/dev/null; source $HIER/lauf-hilfen.zsh 2>/dev/null && kalender_soll $KJ ) > $Q/soll.txt 2>/dev/null; fi
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
  # Commits auf main (Maintainer 19.11.2026: „die letzten 7 tags vs. die 7 tage davor“): eigener Klon ohne Dateiinhalte in
  # $D/git (der Haupt-Checkout bleibt unberührt), höchstens alle 15 Minuten fetch, dann rev-list nach Commit-Datum.
  # Mit Bäumen (blob:none, für die Thunderbird-Zählung der Release-Schätzung), dazu Prüfzweige und Versions-Tags.
  G=$D/git
  gitg() { git -C $G -c credential.helper= -c credential.helper='!gh auth git-credential' "$@" }
  if [[ ! -d $G/objects || $(git -C $G config remote.origin.partialclonefilter 2>/dev/null) != blob:none ]]; then
    { rm -rf $G; git init -q --bare $G && git -C $G remote add origin https://github.com/$GH_REPO.git \
      && git -C $G config remote.origin.promisor true && git -C $G config remote.origin.partialclonefilter blob:none; } 2>>$LOG
    rm -f $Q/commits.json
  fi
  if alt $Q/commits.json 900; then
    if gitg fetch -q --prune --filter=blob:none origin +main:refs/remotes/origin/main '+refs/heads/pruef/*:refs/remotes/origin/pruef/*' '+refs/tags/v*:refs/tags/v*' 2>>$LOG; then
      zaehle() { git -C $G rev-list --count --since=$(TZ=UTC date -r $(( JETZT - $1 )) +%FT%TZ) --until=$(TZ=UTC date -r $(( JETZT - $2 )) +%FT%TZ) origin/main }
      ( w=(); for a b in 604800 0 1209600 604800 172800 0 345600 172800; do w+=$(zaehle $a $b) || exit 1; done
        print -r -- "{\"letzte_7t\":$w[1],\"davor_7t\":$w[2],\"letzte_48h\":$w[3],\"davor_48h\":$w[4],\"stand\":$JETZT}" ) > $Q/commits.json.neu 2>>$LOG \
        && jq -e '[.letzte_7t,.davor_7t,.letzte_48h,.davor_48h] | all(type == "number")' $Q/commits.json.neu >/dev/null 2>&1 \
        && mv $Q/commits.json.neu $Q/commits.json || { rm -f $Q/commits.json.neu; log "Quelle nicht lesbar: commits.json"; }
      # Veröffentlichungszeiten (Versions-Commit von publish.sh ≈ Release) für die übliche Dauer des Nachtlaufs
      git -C $G for-each-ref --sort=-creatordate --count=30 --format='%(refname:short) %(creatordate:unix)' 'refs/tags/v*' > $Q/releases.txt.neu 2>>$LOG \
        && [[ -s $Q/releases.txt.neu ]] && mv $Q/releases.txt.neu $Q/releases.txt || rm -f $Q/releases.txt.neu
    else log "Quelle nicht lesbar: commits.json (fetch)"; fi
  fi
  alt $Q/release.json 900 && holen $Q/release.json gh api repos/$GH_REPO/releases/latest --jq '{tag: .tag_name, zeit: .published_at}'
  if [[ -s $Q/release.json ]] && alt $Q/vergleich.json 900; then
    holen $Q/vergleich.json gh api "repos/$GH_REPO/compare/$(jq -r .tag $Q/release.json)...main" --jq '{ahead: .ahead_by}'
  fi
  # 40 statt 15 (Feld ci zeigt weiter die 15 neuesten): Laufdauern für die Release-Schätzung aus derselben Abfrage
  holen $Q/ci.json gh run list -R $GH_REPO -L 40 --json databaseId,number,displayTitle,headBranch,headSha,event,status,conclusion,createdAt,updatedAt,url,workflowName
  # ci_main gezielt (der neueste main-Lauf ist oft nicht unter den 15 neuesten; 5 für abgebrochene davor)
  # 30 statt 5: auch Dauern der main- und Windows-Läufe (ci_main nimmt weiter den neuesten)
  holen $Q/ci-main.json gh run list -R $GH_REPO --branch main -L 30 --json databaseId,number,headBranch,headSha,event,status,conclusion,createdAt,updatedAt,workflowName
  # Kandidaten der Release-Schätzung: je laufendem bzw. wartendem Push-Lauf eines Prüfzweigs die Thunderbird-Commits über
  # origin/main wie tb_zahl/nur_pruef/mischbar in tests/zwischen-schleife.zsh (nur gelesen, dort nichts geändert), im eigenen
  # Klon; je Stand einmal gerechnet (tb-zahlen.tsv „<Stand> <Zahl> <mischbar 1|0> <nur Prüfzweig 1|0>“)
  if [[ -s $Q/ci.json && -d $G/objects ]]; then
    TB=$Q/tb-zahlen.tsv; touch $TB
    for sha zw in ${=$(jq -r '.[] | select(.workflowName == "Test" and .event == "push" and (.headBranch | startswith("pruef/")) and .status != "completed") | "\(.headSha) \(.headBranch)"' $Q/ci.json 2>/dev/null)}; do
      grep -q "^$sha " $TB && continue
      git -C $G cat-file -e "$sha^{commit}" 2>/dev/null || gitg fetch -q --filter=blob:none origin "+refs/heads/$zw:refs/remotes/origin/$zw" 2>>$LOG
      git -C $G cat-file -e "$sha^{commit}" 2>/dev/null || continue
      ( export GIT_DIR=$G GIT_CONFIG_COUNT=1 GIT_CONFIG_KEY_0=diff.renames GIT_CONFIG_VALUE_0=false
        n=0 mb=1 np=0
        git merge-base --is-ancestor $sha origin/main 2>/dev/null || { t=$(git merge-tree --write-tree origin/main $sha 2>/dev/null) || mb=0; }
        if (( mb )) && [[ -n $t ]] && ! zsh $REPO/tests/ci-noetig.sh origin/main $t 2>/dev/null; then n=0
        else for c in $(git rev-list --no-merges --cherry-pick --right-only origin/main...$sha 2>/dev/null); do
          zsh $REPO/tests/ci-noetig.sh "${c}^" "$c" 2>/dev/null && n=$((n + 1)); done; fi
        git log --format=%B $sha --not origin/main 2>/dev/null | grep -qiE -- 'nicht nach main|nur (auf dem |für den )?Prüfzweig' && np=1
        print -r -- "$sha $n $mb $np" ) >> $TB 2>>$LOG
    done
    tail -200 $TB > $TB.neu && mv $TB.neu $TB
  fi
  # ganzer Commit-Betreff je CI-Lauf (GitHub kürzt displayTitle bei etwa 70 Zeichen): aus dem eigenen Klon, ohne Abfrage
  if [[ -s $Q/ci.json && -d $G/objects ]]; then
    for sha in ${(u)=$(jq -r '.[].headSha // empty' $Q/ci.json 2>/dev/null)}; do
      git -C $G cat-file -e "$sha^{commit}" 2>/dev/null && print -r -- "$sha	$(git -C $G log -1 --format=%s $sha 2>/dev/null)"
    done > $Q/betreffe.tsv.neu 2>>$LOG && mv $Q/betreffe.tsv.neu $Q/betreffe.tsv
  fi
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
def t200(t):
    """Titel für die Anzeige (Maintainer 19.11.2026: „wenn weniger abstand wäre müsste man den text nicht abkürzen“): erste
    Zeile, bis 200 Zeichen ungekürzt, darüber mit „…“"""
    if t is None: return None
    t = (str(t).strip().splitlines() or [""])[0].strip()
    return (t[:199] + "…") if len(t) > 200 else t
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
                        "eintrag": t200(eintrag_von(p)) if name in LOGS and zu == "arbeitet" else None,
                        "zustand": zu, "grund": gr, "weiter_um": wu})
            # Designer als Unteragent einer Runde (Auftrag mit „Design-Eintrag:“): eigener Eintrag
            for k in kinder(p):
                c = PROZ[k][2]
                if re.match(r"(\S*/)?claude -p ", c) and DESIGNER.search(c):
                    m, mm = KOPF.search(c), re.search(r"--model (\S+)", c)
                    aus.append({"name": "Designer (%s)" % name, "art": "lauf", "seit": iso(PROZ[k][1]),
                                "modell": mm.group(1) if mm else None, "eintrag": t200(m.group(1) if m else eintrag_aus_liste(k)),
                                "zustand": "arbeitet", "grund": None, "weiter_um": None})
    # Worker des Auslastungswächters: Zustandsdatei „<pid> <Sitzung> <Modell> <Start> <Arbeitskopie> <Zweig> …“, nur lebende
    for f in sorted(glob.glob(N + "/auslastung/worker-[0-9]*")):
        t = (lies(f) or "").split()
        if len(t) >= 4 and t[0].isdigit() and int(t[0]) in PROZ:
            wt, zweig = (t[4] if len(t) > 4 else None), (t[5] if len(t) > 5 else None)
            aus.append({"name": "Worker " + f.rsplit("-", 1)[1] + (" (%s)" % zweig if zweig else ""), "art": "worker",
                        "seit": iso(int(t[3])), "modell": t[2], "eintrag": t200(eintrag_aus_liste(int(t[0]), zweig, wt)),
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
        return {"aktiv": True, "runde": r, "schritt": schritt, "eintrag": t200(eintrag_von(p[0])) if r else None, "seit": iso(PROZ[p[0]][1]),
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

# Kontingent-Drossel (drossel_stufe in lauf-hilfen.zsh, 19.11.2026, seit 20.11.2026 Verbrauch gegen vergangene Zeit der
# Kalenderwoche; Maintainer: „bitte neon, die drossel-stufe in status.json mitzuliefern“): aus drossel-stufe.txt, nach der
# Wächter und Tagesroutine handeln, nicht neu gerechnet. Zeile 1 „<Stufe> <d = Woche − Wochenzeit in Punkten> <ISO> [<seit ISO> [offen]]“
# (Feld 2 wird nicht gelesen) („offen“ = Fail-open, Stufe 0), Zeile 2 Wirkung, Zeile 3 Grund. Älter als 2 Stunden (Volldampf aus, Läufe ruhen) oder
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
    in_arbeit = [{"titel": t200(i.get("title")), "typ": typ(i), "bereich": bereich(i.get("title") or ""), "notiz": notiz(i)}
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
                naechste.append({"rang": len(naechste) + 1, "titel": t200(i.get("title")), "typ": typ(i), "bereich": bereich(i.get("title") or "")})
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
    aus = [{"nr": i["nr"], "titel": t200(i["titel"]), "seit": iso(i.get("seit"))} for i in iss if not i.get("wir")]
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
BETREFF = dict(z.split("\t", 1) for z in (lies(Q + "/betreffe.tsv") or "").splitlines() if "\t" in z)
CI_MAIN = lies(Q + "/ci-main.json", True)
def ci():
    if CI is None: return None
    return [{"id": str(r["databaseId"]), "nr": r["number"], "titel": t200(BETREFF.get(r.get("headSha")) or r["displayTitle"]), "zweig": r["headBranch"],
             "ausloeser": r["event"], "status": r["status"], "ergebnis": r.get("conclusion") or None,
             "start": iso(r["createdAt"]), "stand": iso(r["updatedAt"]), "url": r["url"]} for r in CI[:15]]
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

# --- Release-Schätzung (Maintainer 19.11.2026: „ja, bestell die bessere release-schätzung bei neon“): aus dem Stand statt
# Faustwerten. Übliche Dauern = Median der letzten grünen Läufe (Wanduhr: Anlage bis letzte Änderung, Warteschlange
# eingeschlossen) aus ci.json/ci-main.json; Faustwert nur bei weniger als 3 Läufen (dann „geschätzt“). Kette eines
# Zwischen-Releases wie tests/zwischen-release.zsh: Prüfzweig grün → Push nach main → Push-Lauf → Windows-Lauf →
# release-unter-tage.sh/release.sh/publish.sh (ABSCHLUSS). Nichts geraten: ohne Beleg zeit null mit Grund.
FAUST = {"pruef": 60 * 60, "main": 50 * 60, "windows": 30 * 60, "nacht": 3 * 3600}
ABSCHLUSS = 10 * 60   # release-unter-tage.sh, NUR_CI=1 release.sh und publish.sh nach grüner CI (Faustwert, ohne eigene Messung)
LAEUFT = ("in_progress", "queued", "waiting", "pending", "requested")
def ep(t):
    """ISO oder Epoche → Epochensekunden; None bleibt None"""
    i = iso(t)
    return None if i is None else dt.datetime.strptime(i, "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=dt.timezone.utc).timestamp()
def median(werte):
    w = sorted(werte); n = len(w)
    return None if not n else (w[n // 2] if n % 2 else (w[n // 2 - 1] + w[n // 2]) / 2)
def art_von(r):
    """Art eines Laufs: pruef (Push auf pruef/), main (Push auf main), windows (von Hand auf main), sonst None"""
    if r.get("workflowName", "Test") != "Test": return None
    if r.get("event") == "push" and (r.get("headBranch") or "").startswith("pruef/"): return "pruef"
    if r.get("headBranch") == "main": return {"push": "main", "workflow_dispatch": "windows"}.get(r.get("event"))
    return None
def dauern(laeufe, mindest=300, anzahl=7):
    """{Art: (Sekunden, gemessen?)} aus den letzten grünen Läufen je Art (kürzer als 5 Min. = ohne Thunderbird-Arbeit)"""
    je = {}
    for r in laeufe or []:
        k = art_von(r)
        if k is None or r.get("status") != "completed" or r.get("conclusion") != "success": continue
        a, e = ep(r.get("createdAt")), ep(r.get("updatedAt"))
        if a is None or e is None or e - a < mindest: continue
        if len(je.setdefault(k, {})) < anzahl: je[k][r.get("databaseId", id(r))] = e - a
    aus = {}
    for k in ("pruef", "main", "windows"):
        w = list(je.get(k, {}).values())
        aus[k] = (median(w), True) if len(w) >= 3 else (FAUST[k], False)
    return aus
def nacht_dauer(releases, tz=WIEN, anzahl=7):
    """(Sekunden ab 01:30, gemessen?): Median der letzten Veröffentlichungen zwischen 01:30 und 09:00 Wiener Zeit"""
    w = []
    for t in releases:
        d = dt.datetime.fromtimestamp(t, tz)
        if 130 <= d.hour * 100 + d.minute < 900:
            w.append(t - d.replace(hour=1, minute=30, second=0, microsecond=0).timestamp())
        if len(w) >= anzahl: break
    return (median(w), True) if len(w) >= 3 else (FAUST["nacht"], False)
def pause_bis(rolle):
    """Ende der spätesten aktiven Pause für <rolle> oder „alle“ (pausen.txt, wie pause_aktiv in lauf-hilfen.zsh), sonst None"""
    beste = None
    for z in (lies(N + "/pausen.txt") or "").splitlines():
        t = z.split(None, 2)
        if len(t) < 3 or t[0] not in (rolle, "alle"): continue
        try: b = dt.datetime.fromisoformat(t[1]).timestamp()
        except ValueError: continue
        if b > JETZT and (beste is None or b > beste): beste = b
    return beste
def ab_tb():
    """nötige Thunderbird-Commits wie zwischen-schleife.zsh: 1 bei 5-Stunden-Fenster ab 85 % (Fenster läuft noch), sonst 3"""
    k = lies(N + "/kontingent.json", True) or {}
    h = ((k.get("info") or {}).get("unifiedWindows") or {}).get("five_hour") or {}
    try:
        if 100 * h["utilization"] >= 85 and h["resetsAt"] > JETZT: return 1
    except (KeyError, TypeError): pass
    return 3
def tb_zahlen():
    aus = {}
    for z in (lies(Q + "/tb-zahlen.tsv") or "").splitlines():
        t = z.split()
        if len(t) == 4 and all(x.isdigit() for x in t[1:]): aus[t[0]] = (int(t[1]), t[2] == "1", t[3] == "1")
    return aus
def frei_ab(laeufe, d):
    """(Zeitpunkt, an dem die laufenden main-/Windows-Läufe voraussichtlich fertig sind, gemessen?); keiner → (JETZT, True)"""
    ende, gem = JETZT, True
    for r in laeufe or []:
        k = art_von(r)
        if k in (None, "pruef") or r.get("status") not in LAEUFT: continue   # Prüfzweige laufen auf GitHub, neon bleibt frei
        e = ep(r.get("createdAt")) + d[k][0]
        gem = gem and d[k][1]
        ende = max(ende, e)
    return ende, gem
def eta(zeit, gem, grund, kandidat=None, haelt=None):
    if zeit is None: return {"zeit": None, "grund": grund, "sicherheit": "offen", "kandidat": kandidat, "haelt_auf": haelt}
    return {"zeit": iso(zeit), "grund": grund, "sicherheit": "gemessen" if gem else "geschätzt", "kandidat": kandidat, "haelt_auf": haelt}
def hm_text(t): return dt.datetime.fromtimestamp(t, WIEN).strftime("%H:%M")
def release_eta():
    rel = lies(Q + "/release.json", True) or {}
    ahead = (lies(Q + "/vergleich.json", True) or {}).get("ahead")
    seit = (" %s Commits auf main seit %s." % (ahead, rel["tag"])) if ahead is not None and rel.get("tag") else ""
    laeufe = list({r.get("databaseId", i): r for i, r in enumerate((CI_MAIN or []) + (CI or []))}.values())
    d = dauern(laeufe)
    rest_main = d["main"][0] + d["windows"][0] + ABSCHLUSS
    gem_main = d["main"][1] and d["windows"][1]
    hm = jetzt_w.hour * 100 + jetzt_w.minute
    # 1. Zwischen-Release läuft: Phase aus den main-Läufen seit seinem Start
    zr = oberste(r"zwischen-release\.zsh|Unbeaufsichtigter Zwischen-Release")
    if zr:
        start = PROZ[zr[0]][1]
        nach = [r for r in laeufe if r.get("headBranch") == "main" and (ep(r.get("createdAt")) or 0) >= start - 60]
        push = next((r for r in sorted(nach, key=lambda r: ep(r["createdAt"])) if art_von(r) == "main"), None)
        win = next((r for r in sorted(nach, key=lambda r: ep(r["createdAt"])) if art_von(r) == "windows"), None)
        if win:
            if win.get("status") in LAEUFT:
                return eta(ep(win["createdAt"]) + d["windows"][0] + ABSCHLUSS, d["windows"][1], "Zwischen-Release läuft: Windows-Lauf #%s läuft, danach Veröffentlichung." % win.get("number") + seit)
            return eta(JETZT + ABSCHLUSS, False, "Zwischen-Release läuft: CI grün, Veröffentlichung läuft." + seit)
        if push and push.get("status") in LAEUFT:
            return eta(ep(push["createdAt"]) + rest_main, gem_main, "Zwischen-Release läuft: Push-Lauf #%s auf main läuft, danach Windows und Veröffentlichung." % push.get("number") + seit)
        return eta(JETZT + rest_main, False, "Zwischen-Release läuft (vor dem Push bzw. zwischen zwei Schritten), danach CI, Windows und Veröffentlichung." + seit)
    # 2. Nachtlauf läuft und hat noch nicht veröffentlicht: 01:30 + übliche Dauer der letzten Nächte
    rels = [int(z.split()[1]) for z in (lies(Q + "/releases.txt") or "").splitlines() if len(z.split()) == 2 and z.split()[1].isdigit()]
    nd, ngem = nacht_dauer(rels)
    nl = haupt("Nachtlauf", LAEUFE["nachtlauf"][1])
    if nl and not (rel.get("zeit") and iso(rel["zeit"]) >= iso(PROZ[nl[0]][1])):
        z = dt.datetime.fromtimestamp(PROZ[nl[0]][1], WIEN).replace(hour=1, minute=30, second=0, microsecond=0).timestamp() + nd
        if z > JETZT:
            return eta(z, ngem, "Nachtlauf läuft; Veröffentlichung nach grüner CI, übliche Dauer der letzten Nächte %.1f Stunden ab 01:30." % (nd / 3600) + seit)
        return eta(None, False, "Nachtlauf läuft länger als üblich (%.1f Stunden ab 01:30); Zeitpunkt offen." % (nd / 3600) + seit)
    def nachtlauf_eta(vorne=""):
        nacht = jetzt_w.replace(hour=1, minute=30, second=0, microsecond=0)
        if nacht.timestamp() <= JETZT: nacht += dt.timedelta(days=1)
        pb = pause_bis("nachtlauf")
        if pb and pb > nacht.timestamp():
            return eta(None, False, vorne + "Nachtlauf pausiert bis %s." % hm_text(pb) + seit, haelt="Pause Nachtlauf bis %s" % hm_text(pb))
        return eta(nacht.timestamp() + nd, ngem, vorne + "Nächster Nachtlauf (01:30 Wiener Zeit) veröffentlicht nach grüner CI; übliche Dauer %s %.1f Stunden." % (
            "der letzten Nächte" if ngem else "(Faustwert, zu wenige Nächte gemessen)", nd / 3600) + seit)
    if not volldampf() or hm >= 2230 or hm < 130:
        return nachtlauf_eta("Volldampf: Zwischen-Releases nur 09:00 bis 22:30. " if volldampf() else "")
    if hm < 900:
        return eta(None, False, "Push-Sperre bis 09:00; danach Zwischen-Release, sobald ein Prüfzweig fällig ist." + seit, haelt="Push-Sperre bis 09:00")
    # 3. Volldampf tagsüber: Hindernisse
    pb = pause_bis("zwischen-release")
    if pb: return eta(None, False, "Zwischen-Releases pausiert bis %s." % hm_text(pb) + seit, haelt="Pause bis %s" % hm_text(pb))
    if ci_main() == "rot": return eta(None, False, "CI auf main rot; erst nach der Behebung." + seit, haelt="CI auf main rot")
    frei, fgem = frei_ab(laeufe, d)
    # fälliger Stand, der auf ein freies neon wartet (Vorrang-Marke des Wächters, je Takt erneuert)
    m = (lies(N + "/zwischen-faellig.txt") or "").split()
    if len(m) >= 4 and m[0].isdigit() and JETZT - int(m[0]) <= 900:
        log_z = [z for z in (lies("%s/%s-zwischen-schleife.log" % (N, jetzt_w.date())) or "").splitlines() if " belegt: " in z]
        haelt = re.sub(r"^\S+ \S+ (belegt: [^(]*?)\s*(\(fällig.*)?$", r"\1", log_z[-1]) if log_z else "neon belegt"
        lauf_nr = next((r.get("number") for r in laeufe if (r.get("headSha") or "").startswith(m[2]) and art_von(r) == "pruef"), None)
        k = m[3] + (" #%s" % lauf_nr if lauf_nr else "")
        return eta(frei + rest_main, fgem and gem_main, "Fällig: %s (Stand %s) wartet auf ein freies neon, dann Push-Lauf, Windows und Veröffentlichung." % (m[3], m[2][:7]) + seit,
                   kandidat=k, haelt=haelt)
    # Prüfzweig-Läufe unterwegs, deren Stand die Bedingung des Wächters erfüllen wird
    ab, tb = ab_tb(), tb_zahlen()
    gesperrt = set((lies(N + "/zwischen-gesperrt.txt") or "").split())
    beste = None
    for r in laeufe:
        if art_von(r) != "pruef" or r.get("status") not in LAEUFT: continue
        if re.search(r"(diagnose|flackern|probe)", r["headBranch"][6:]) or r.get("headSha") in gesperrt: continue
        n, mb, np = tb.get(r.get("headSha"), (None, False, False))
        if n is None or n < ab or not mb or np: continue
        z = max(ep(r["createdAt"]) + d["pruef"][0], frei) + rest_main
        if beste is None or z < beste[0]: beste = (z, r, n)
    if beste:
        z, r, n = beste
        return eta(z, d["pruef"][1] and gem_main and fgem, "Kandidat %s (Lauf #%s, %d Thunderbird-Commits über main, ab %d): Prüfzweig-CI, dann Push-Lauf, Windows und Veröffentlichung." % (
            r["headBranch"], r.get("number"), n, ab) + seit, kandidat="%s #%s" % (r["headBranch"], r.get("number")))
    return eta(None, False, "Volldampf: kein Kandidat unterwegs (kein laufender Prüfzweig-Lauf mit mindestens %d Thunderbird-Commits über main)." % ab + seit)

# Commits auf origin/main nach Commit-Datum (quellen/commits.json, höchstens alle 15 Min. neu; älter als 1 Stunde → null)
# Zuletzt erledigt (Maintainer 19.11.2026: „nicht nur die aktuellen und geplanten tasks sondern auch die letzten paar tasks
# welche erledigt sind“): höchstens 8 abgeschlossene Ereignisse der letzten 24 Stunden, neueste zuerst, nur aus vorhandenen
# Quellen (keine neue Abfrage): Board-Einträge auf Done/archiviert (board48.json, Titel aus board.json bzw. archiv.md),
# Runden und Ende von Tagesroutine und Nachtlauf (ihre Protokolle), beendete Worker (Protokoll des Auslastungswächters),
# Releases (Versions-Tags im eigenen Klon, releases.txt). Keine CI-Läufe. Fehlt eine Quelle, fehlt nur diese Art.
def kurz(t, n=100):
    t = re.sub(r"\s+", " ", t or "").strip()
    return (t[:n - 1] + "…") if len(t) > n else (t or None)
def log_zeilen(muster):
    """(Epoche, Text) aller Zeilen der Protokolle von heute und gestern, die auf <muster> (glob mit {tag}) passen"""
    aus = []
    for tag in (jetzt_w.date() - dt.timedelta(days=1), jetzt_w.date()):
        for z in (lies(N + "/" + muster.format(tag=tag)) or "").splitlines():
            m = re.match(r"(\d{4}-\d\d-\d\d \d\d:\d\d:\d\d) (.*)", z)
            if m: aus.append((dt.datetime.strptime(m.group(1), "%Y-%m-%d %H:%M:%S").replace(tzinfo=WIEN).timestamp(), m.group(2)))
    return aus
def archiv():
    """id → (Titel, Hash oder None) aus archiv.md"""
    aus = {}
    for z in (lies(A + "/archiv.md") or "").splitlines():
        t = [x.strip() for x in z.split(" | ")]
        if len(t) >= 5 and t[1].startswith("PVTI_"): aus[t[1]] = (t[3], None if t[4] in ("-", "") else t[4])
    return aus
def zuletzt():
    ev, arch = [], sicher(archiv) or {}
    titel = {i["id"]: i.get("title") for i in (BOARD or []) if isinstance(i, dict) and "id" in i}
    nach_hash = {h: t for t, h in arch.values() if h}
    def neu(t, art, was, erg=None, einzel=None):
        if t is not None and JETZT - 86400 <= t <= JETZT and was: ev.append({"zeit": iso(t), "art": art, "was": t200(re.sub(r"\s+", " ", was)), "ergebnis": erg, "einzel": kurz(einzel, 60)})
    def eintraege():
        for i in _b48() or []:
            st = i.get("fieldValueByName") or {}
            t = st.get("updatedAt") if st.get("name") == "Done" else (i.get("updatedAt") if i.get("isArchived") else None)
            ti, h = arch.get(i["id"], (None, None))
            neu(ep(t), "eintrag", titel.get(i["id"]) or ti, "ok" if st.get("name") == "Done" else None, h)
    def runden():
        # Ergebnisdatei der Runde (<tag>-tagesroutine-<n>.erg, kurz vor „Runde beendet“ geschrieben) und Eintrag dazu
        # (<tag>-tagesroutine-erledigt.txt „<id>\t<Ergebnis>“)
        erg, zu_id = [], {}
        for tag in (jetzt_w.date() - dt.timedelta(days=1), jetzt_w.date()):
            for f in glob.glob("%s/%s-tagesroutine-[0-9]*.erg" % (N, tag)):
                erg.append([os.path.getmtime(f), ((lies(f) or "").strip().splitlines() or [""])[0], False])
            for z in (lies("%s/%s-tagesroutine-erledigt.txt" % (N, tag)) or "").splitlines():
                t = z.split("\t", 1)
                if len(t) == 2: zu_id[t[1].strip()] = t[0]
        modell = None
        for t, z in log_zeilen("{tag}-tagesroutine.log"):
            m = re.match(r"Runde mit (\S+)", z)
            if m: modell = m.group(1).rstrip(","); continue
            m = re.match(r"Runde beendet \(Exitcode (\d+)\):?(.*)", z)
            if m:
                e = next((e for e in erg if not e[2] and t - 300 <= e[0] <= t + 5), None)
                if e: e[2] = True
                text = e[1] if e else ""
                h = re.match(r"erledigt ([0-9a-f]{7,40})", text)
                if m.group(1) != "0": ergeb = "abgebrochen" if re.search(r"limit", m.group(2), re.I) else "fehler"
                else: ergeb = "ok" if h else ("abgebrochen" if text.startswith("zurück") else None)
                pv = zu_id.get(text) if text else None
                ti = (titel.get(pv) or arch.get(pv, (None,))[0]) if pv else (nach_hash.get(h.group(1)) if h else None)
                was = "Tagesroutine-Runde" + (" (%s)" % modell if modell else "") + (": " + ti if ti else "")
                neu(t, "runde", was, ergeb, h.group(1) if h else None)
            elif z.startswith("Kontingent Ende"): neu(t, "lauf", "Tagesroutine beendet", "ok")
        grund = None
        for t, z in log_zeilen("{tag}.log"):
            m = re.match(r"Runde (\d+) beendet \(Exitcode (\d+)\)", z)
            if m: neu(t, "runde", "Nachtlauf-Runde %s" % m.group(1), "ok" if m.group(2) == "0" else "fehler")
            m = re.match(r"Arbeit beendet: (.*)", z)
            if m: grund = m.group(1)
            if z == "Ende" and grund is not None:
                erg = "fehler" if re.search(r"rot|Fehler", grund) else ("ok" if "laut Fertig-Datei" in grund else "abgebrochen")
                neu(t, "lauf", "Nachtlauf beendet", erg, grund); grund = None
    def worker():
        for t, z in log_zeilen("{tag}-auslastung.log"):
            m = re.match(r"Worker (\S+) beendet \([^)]*?(?:Zweig (\S+?))?\): (\S+)\s*(.*)", z)
            if not m: continue
            w, zw, art, rest = m.groups()
            erg = {"erledigt": "ok", "widerlegt": "ok", "zurück": "abgebrochen", "abbruch": "abgebrochen", "rot": "fehler", "fehler": "fehler"}.get(art)
            pv = re.search(r"PVTI_\S+", rest)
            ti = (titel.get(pv.group(0)) or arch.get(pv.group(0), (None,))[0]) if pv else None
            h = re.match(r"([0-9a-f]{7,40})\b", rest)
            was = "Worker %s: %s" % (w.replace("worker-", ""), ti or {"nichts_passend": "nichts Passendes"}.get(art, art))
            neu(t, "worker", was, erg, " ".join(x for x in (h.group(1) if h else None, zw) if x) or None)
    def releases():
        for z in (lies(Q + "/releases.txt") or "").splitlines():
            t = z.split()
            if len(t) == 2 and t[1].isdigit(): neu(int(t[1]), "release", "Release " + t[0].lstrip("v"), "ok", t[0])
    for f in (eintraege, runden, worker, releases): sicher(f)
    return sorted(ev, key=lambda e: e["zeit"], reverse=True)[:8]

def commits():
    c = lies(Q + "/commits.json", True)
    if not isinstance(c, dict) or not isinstance(c.get("stand"), int) or JETZT - c["stand"] > 3600: return None
    aus = {k: c.get(k) for k in ("letzte_7t", "davor_7t", "letzte_48h", "davor_48h")}
    return aus if all(isinstance(v, int) for v in aus.values()) else None

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
      "github_limit": sicher(github_limit), "drossel": sicher(drossel),
      "commits": sicher(commits), "zuletzt": sicher(zuletzt)}
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
