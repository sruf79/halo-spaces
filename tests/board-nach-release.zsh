#!/bin/zsh
# Board nach dem Release: offene Einträge der Aufgabenliste, deren Änderung im eben veröffentlichten Release steckt,
# auf Done setzen und archivieren (Maintainer 18.11.2026: „bitte hier einen opus oder fable agenten einen automatismus
# für das automatische schliessen von tasks nach einem release erstellen lassen“). Anlass: 138 offene Einträge, viele
# längst veröffentlicht; publish.sh schloss nur GitHub-Issues, Done setzte nur, „wer pusht und die CI prüft“.
# Ohne Claude, nur git, jq, python3 und tests/board.sh. Läuft nur auf neon. publish.sh ruft es nach den Issues und PRs
# auf (alle Release-Wege enden dort: Nachtlauf, release-unter-tage.sh, zwischen-release.zsh); Fehler halten das Release
# nie auf (Aufruf mit || true, Zeile im Release-Bericht).
#
#   tests/board-nach-release.zsh [--probe] <version>
#     Commits v<vorheriges Tag>..v<version> (Tag noch nicht lokal: ..HEAD); --probe zeigt nur, was geschähe
#
# Zuordnung (nie über Textähnlichkeit):
#   - Commit-Hash (7 bis 40 Zeichen) in einem Absatz des Eintrags mit „committet“ (Notiz „committet, wartet auf
#     Push/CI (<Hash>)“); der Hash liegt im Release-Bereich oder ist nach einem Rebase derselbe Patch (git patch-id)
#   - „(GitHub #n)“ in der Commit-Nachricht und „GitHub #n“ bzw. „GitHub-Issue #n“ im Titel des Eintrags
# Treffer: board.sh notiz <id> „erledigt in vX.Y.Z (<Hash>), automatisch geschlossen“, dann board.sh status <id> done <Hash>.
# Nie geschlossen:
#   - Status „Wartet auf OK“ (nicht angefasst, nur in der Ausgabe gezählt)
#   - Reihen n/m (Titel mit n/m): nur Notiz „Schritt n in vX.Y.Z enthalten“, Status bleibt
#   - Design-Einträge mit „zur Abnahme“ in der Notiz (Designer, beim Commit) ohne spätere Notiz „abgenommen“ (Groß-/Kleinschreibung
#     egal): Zweifel mit Frist von 7 Tagen (ab Datum in der Notiz, sonst ab erstem Auftreten im Zweifel-Protokoll), Vorrang
#     vor dem Hash-Treffer; nach Ablauf Zeile „Abnahme überfällig, seit <Datum>“ (Morgenbrief). Steht „abgenommen“ danach, gilt der
#     Treffer wie sonst. Keine Regel „Abnahme vor Done“, nur die Markierung. HALO_BNR_HEUTE (Datum) zum Proben.
#   - Zweifel (Zeile in ~/halo-aufgaben/board-nach-release-zweifel.md für den Morgenbrief, nichts geschrieben):
#     Teil-Fix (Commit mit „teilweise“), Commit zurückgenommen, Status Todo, offener Rest oder offene Frage ab dem
#     Absatz mit dem Treffer („offen“, „Rest“, „teilweise“, „Rückfrage“, „kein Fix“, „nicht behoben/gelöst“,
#     „nicht Teil“, „noch nicht“, „bleibt In Progress/Todo“), neuere Arbeit („committet“-Absatz danach ohne Hash oder mit Hash außerhalb der Releases)
# Board nicht lesbar: nichts schließen, Meldung an neon (an_neon), Exitcode 1. Idempotent: geschlossene Einträge sind
# archiviert, Notizen und Zweifel-Zeilen stehen je Version nur einmal da (zweiter Lauf tut nichts).
# Zum Proben: HALO_REPO (Checkout), HALO_BNR_BOARD (Befehl statt „zsh tests/board.sh“), HALO_BNR_ZWEIFEL (Datei),
# HALO_BNR_LOG (Protokoll), HALO_PUSH_TROCKEN=1 (an_neon nur ausgeben). Test: zsh tests/board_nach_release_test.zsh.
emulate -L zsh
setopt pipe_fail
HIER=${0:A:h}
REPO=${HALO_REPO:-${HIER:h}}
BOARD_CMD=(${=${HALO_BNR_BOARD:-zsh $HIER/board.sh}})
ZWEIFEL=${HALO_BNR_ZWEIFEL:-$HOME/halo-aufgaben/board-nach-release-zweifel.md}
LOG=${HALO_BNR_LOG:-$HOME/halo-nacht/board-nach-release.log}
mkdir -p ${LOG:h} 2>/dev/null || LOG=/dev/null
source $HIER/lauf-hilfen.zsh   # log, an_neon
PROBE=
[[ $1 == --probe ]] && { PROBE=1; shift }
VERSION=$1
[[ $VERSION == <->.<->.<-> ]] || { print -u2 "Aufruf: ${0:t} [--probe] <version>"; exit 2 }
cd $REPO || { print "Board nach Release: kein Checkout unter $REPO, nichts geschlossen"; exit 1 }

melde() {   # <Grund> – nichts geschlossen; an neon (nicht im Probelauf)
  print -r -- "Board nach Release: $1, nichts geschlossen"
  log "v$VERSION $1"
  [[ -n $PROBE ]] || an_neon "[board-nach-release] v$VERSION: $1. Nichts geschlossen; bitte nachholen mit: zsh tests/board-nach-release.zsh $VERSION (erst --probe)." board-nach-release \
    || log "an neon nicht zugestellt"
  exit 1
}

# --- Bereich des Release ---
git fetch -q --tags origin 2>/dev/null || true
BIS=v$VERSION
if git rev-parse -q --verify "$BIS^{commit}" >/dev/null; then
  VON=$(git tag -l 'v[0-9]*' --sort=-v:refname | grep -A1 -x "$BIS" | sed -n 2p)
else
  BIS=HEAD VON=$(git tag -l 'v[0-9]*' --sort=-v:refname | head -1)
fi
[[ -n $VON ]] || melde "kein Release-Tag vor v$VERSION"

T=$(mktemp -d) || melde "kein Zwischenordner"
trap 'rm -rf $T' EXIT
# Commits: <sha>\x1f<Betreff>\x1f<zurückgenommene Commits>
git log --format='%H%x1f%s%x1f%b%x1e' $VON..$BIS > $T/log || melde "git log $VON..$BIS gescheitert"
python3 -I -c '
import re, sys
for rec in open(sys.argv[1], encoding="utf-8").read().split("\x1e"):
    f = rec.strip("\n").split("\x1f")
    if len(f) < 3: continue
    rev = " ".join(re.findall(r"This reverts commit ([0-9a-f]{7,40})", f[2]))
    print("\x1f".join([f[0].strip(), f[1], rev]))
' $T/log > $T/commits || melde "Commits nicht lesbar"
# Patch-ids der Release-Commits (gleicher Patch nach einem Rebase zählt)
git log -p --no-merges $VON..$BIS | git patch-id --stable > $T/patchids 2>/dev/null || : > $T/patchids

# --- Board einmal laden ---
"${BOARD_CMD[@]}" export > $T/board.json 2>$T/board.err || melde "Board nicht lesbar ($(head -c 200 $T/board.err | tr '\n' ' ' | sed 's/FEHLER: *//g'))"   # (kein „FEHLER“ im Release-Bericht: der Morgenbrief hielte das Release für gescheitert)
jq -e '.items | type == "array"' $T/board.json >/dev/null 2>&1 || melde "Board nicht lesbar (Export ohne items)"

# --- Zuordnung (reine Auswertung, nichts geschrieben) ---
# Ausgabe je Eintrag: schliessen|reihe|zweifel|okwarten \t id \t Hash \t Titel \t Grund bzw. Schritt
HEUTE=${HALO_BNR_HEUTE:-$(TZ=Europe/Vienna date +%F)} python3 -I - $T/board.json $T/commits $T/patchids $BIS $VERSION $ZWEIFEL > $T/plan <<'PY' || melde "Auswertung gescheitert"
import datetime as dt, json, os, re, subprocess, sys
board, commits_f, patch_f, bis, version, zweifel_f = sys.argv[1:7]
heute = dt.date.fromisoformat(os.environ["HEUTE"])
items = json.load(open(board, encoding="utf-8"))["items"]
commits, reverted = [], set()          # neueste zuerst
for z in open(commits_f, encoding="utf-8").read().splitlines():
    sha, subj, rev = (z.split("\x1f") + ["", ""])[:3]
    commits.append((sha, subj))
    reverted.update(rev.split())
im_bereich = {sha: i for i, (sha, _) in enumerate(commits)}
betreff = dict(commits)
patch = {}
for z in open(patch_f, encoding="utf-8").read().splitlines():
    p, c = (z.split() + [""])[:2]
    if c in im_bereich: patch[p] = c

def git(*a):
    r = subprocess.run(["git", *a], capture_output=True, text=True)
    return r.returncode, r.stdout.strip()

cache = {}
def aufloesen(tok):
    """→ ("bereich", sha) | ("frueher", sha) | ("fremd", None)"""
    if tok in cache: return cache[tok]
    erg = ("fremd", None)
    rc, sha = git("rev-parse", "-q", "--verify", tok + "^{commit}")
    if rc == 0 and sha:
        if sha in im_bereich: erg = ("bereich", sha)
        elif git("merge-base", "--is-ancestor", sha, bis)[0] == 0: erg = ("frueher", sha)
        else:
            rc, out = git("show", sha)
            if rc == 0:
                p = subprocess.run(["git", "patch-id", "--stable"], input=out + "\n", capture_output=True, text=True).stdout.split()
                if p and p[0] in patch: erg = ("bereich", patch[p[0]])
    cache[tok] = erg
    return erg

def teil(sha): return re.search(r"teilweise", betreff.get(sha, ""), re.I) is not None
def zurueck(sha):
    return betreff.get(sha, "").startswith("Revert ") or any(sha.startswith(r) or r.startswith(sha) for r in reverted)

# GitHub-Fixe im Release: n → [sha …] (Teil-Fixe mit Kennzeichen)
gh = {}
for sha, subj in commits:
    for m in re.finditer(r"\(GitHub (#[0-9]+(?:, #[0-9]+)*)(, teilweise)?\)", subj):
        for n in re.findall(r"#([0-9]+)", m.group(1)):
            gh.setdefault(n, []).append(sha)

HEX = re.compile(r"(?<![0-9A-Za-z#])[0-9a-f]{7,40}(?![0-9A-Za-z])")
# offener Rest oder offene Frage ab dem Absatz mit dem Treffer: lieber ein Zweifel zu viel als ein Eintrag zu früh zu
# (18.11.2026: „Rest (gemessen, nicht Teil dieses Fixes)“ stand ohne „Offen:“ in einer Notiz)
REST = re.compile(r"\boffen(?:e[nrs]?)?\b|\bRest\b|teilweise|Rückfrage|kein Fix|nicht behoben|nicht gelöst|nicht Teil|noch nicht|bleibt (?:In Progress|Todo)(?!\s+bis\b[^.\n]*\b(?:Release|Windows|CI|Push))", re.I)
# („bleibt In Progress bis grüner Windows-Lauf“ wartet nur auf das Release, das jetzt da ist)
REIHE = re.compile(r"(?<![0-9/])([0-9]+)/([0-9]+|n)(?![0-9/])(?!\s*(?:px|pt|%|ms))")
def reihe(titel):   # „(2/5)“, „Teil 3/n“ – keine Maße wie „30/24 px“ (n größer als m)
    for m in REIHE.finditer(titel):
        if m.group(2) == "n" or int(m.group(1)) <= int(m.group(2)): return m.group(1)
    return None
ABN = re.compile(r"zur\s+Abnahme", re.I)
ABG = re.compile(r"abgenommen", re.I)
def abnahme_seit(iid, absatz):
    """Datum, ab dem die Frist läuft: aus der Notiz, sonst erstes Auftreten im Zweifel-Protokoll, sonst heute"""
    m = re.search(r"(\d{4})-(\d{2})-(\d{2})", absatz)
    d = m and (m.group(1), m.group(2), m.group(3))
    if not d:
        m = re.search(r"(\d{1,2})\.\s?(\d{1,2})\.\s?(\d{4})", absatz)
        d = m and (m.group(3), m.group(2).zfill(2), m.group(1).zfill(2))
    if not d:
        try:
            for z in open(zweifel_f, encoding="utf-8"):
                m = re.match(r"- (\d{4}-\d{2}-\d{2}) [0-9:]+ \| v\S+ \| " + re.escape(iid) + r" \|.*Abnahme", z)
                if m: d = tuple(m.group(1).split("-")); break
        except OSError: pass
    try: return dt.date(*map(int, d)) if d else heute
    except ValueError: return heute
def aus(*f): print("\t".join(str(x).replace("\t", " ").replace("\n", " ") for x in f))

for it in items:
    st = it.get("status") or ""
    if st == "Done": continue
    iid, titel, body = it.get("id", ""), it.get("title") or "", it.get("body") or ""
    abs_ = [a for a in re.split(r"\n\s*\n", body)]
    treffer = {}                       # sha → Absatz-Index (-1: nur über GitHub #n)
    commit_abs = []                    # (Index, [Auflösungen]) aller „committet“-Absätze
    for i, a in enumerate(abs_):
        if not re.search(r"committet", a, re.I): continue
        loes = []
        for tok in HEX.findall(a):
            art, sha = aufloesen(tok)
            if art == "fremd" and tok.isdigit(): continue   # Zahlen (Lauf-Nummern) sind keine Hashes
            loes.append((art, sha))
            if art == "bereich": treffer[sha] = max(treffer.get(sha, -1), i)
        commit_abs.append((i, loes))
    for n in set(re.findall(r"GitHub(?:-[A-Za-z]+)? #([0-9]+)(?![0-9])", titel, re.I)):
        for sha in gh.get(n, []): treffer.setdefault(sha, -1)
    if not treffer: continue
    neu = min(treffer, key=lambda s: im_bereich[s])   # neuester Treffer
    kurz = neu[:7]
    if st == "Wartet auf OK": aus("okwarten", iid, kurz, titel, ""); continue
    # Design-Einträge: „zur Abnahme“ in der Notiz des Designers ohne spätere „abgenommen“ ist ein Zweifel mit Frist von
    # 7 Tagen und hat Vorrang vor jedem Hash-Treffer (Maintainer 18.11.2026); keine Regel „Abnahme vor Done“, nur die Markierung
    za = [i for i, a in enumerate(abs_) if ABN.search(a)]
    if za and not any(ABG.search(a) for a in abs_[za[-1] + 1:]):
        seit = abnahme_seit(iid, abs_[za[-1]])
        if (heute - seit).days > 7: aus("zweifel", iid, kurz, titel, "Abnahme überfällig, seit %s" % seit.isoformat())
        else: aus("zweifel", iid, kurz, titel, "Abnahme steht aus (zur Abnahme seit %s, Frist bis %s)" % (seit.isoformat(), (seit + dt.timedelta(days=7)).isoformat()))
        continue
    j = max(treffer.values())
    if j < 0: j = max([i for i, _ in commit_abs] or [len(abs_) - 1])
    grund = None
    if any(teil(s) for s in treffer): grund = "Teil-Fix („teilweise“ im Commit)"
    elif any(zurueck(s) for s in treffer): grund = "Commit zurückgenommen (Revert)"
    elif st != "In Progress": grund = "Status %s trotz Commit im Release" % (st or "leer")
    elif any(REST.search(a) for a in abs_[j:]): grund = "offener Rest oder offene Frage in der Notiz"
    else:
        for i, loes in commit_abs:
            if i <= j: continue
            if not loes or any(art == "fremd" for art, _ in loes):
                grund = "neuere Arbeit nach dem Treffer (Commit nicht im Release)"; break
        if grund is None:
            fremd = [art for i, loes in commit_abs if i == j for art, _ in loes if art == "fremd"]
            if fremd: grund = "weiterer Commit im selben Absatz nicht im Release"
    if grund: aus("zweifel", iid, kurz, titel, grund); continue
    n = reihe(titel)
    if n:
        if ("Schritt %s in v%s enthalten" % (n, version)) not in body: aus("reihe", iid, kurz, titel, n)
        continue
    aus("schliessen", iid, kurz, titel, "erledigt in v%s" % version in body and "notiz-da" or "")
PY

# --- Ausführen bzw. zeigen ---
typeset -i ZU=0 REI=0 ZW=0 OKW=0 FEHL=0
typeset -a FEHLTEXT
schreibe() {   # board.sh-Aufruf; Fehler zählen (Warteschlange: Warnung, board.sh trägt später nach)
  local err
  err=$("${BOARD_CMD[@]}" "$@" 2>&1 >/dev/null) || { FEHL+=1; FEHLTEXT+=("$1 $2: ${${err//$'\n'/ }[1,120]}"); return 1 }
  [[ $err == *Warteschlange* ]] && print -r -- "  (Warteschlange: $1 $2, board.sh trägt nach)"
  return 0
}
DATUM=$(TZ=Europe/Vienna date '+%F %H:%M')
while IFS=$'\t' read -r art id hash titel extra; do
  case $art in
    okwarten) OKW+=1; print -r -- "unberührt (Wartet auf OK): $id $titel" ;;
    zweifel)
      ZW+=1; print -r -- "Zweifel: $id $titel – $extra"
      if [[ -z $PROBE ]] && ! grep -qF "| v$VERSION | $id |" $ZWEIFEL 2>/dev/null; then
        mkdir -p ${ZWEIFEL:h} && print -r -- "- $DATUM | v$VERSION | $id | $titel | $extra ($hash)" >> $ZWEIFEL
      fi ;;
    reihe)
      REI+=1
      if [[ -n $PROBE ]]; then print -r -- "würde Reihe vermerken (Schritt $extra): $id $titel"
      else schreibe notiz $id "Schritt $extra in v$VERSION enthalten ($hash), automatisch vermerkt" && print -r -- "Reihe vermerkt (Schritt $extra): $id $titel"; fi ;;
    schliessen)
      ZU+=1
      if [[ -n $PROBE ]]; then print -r -- "würde schließen: $id $titel ($hash)"; continue; fi
      if [[ $extra != notiz-da ]]; then schreibe notiz $id "erledigt in v$VERSION ($hash), automatisch geschlossen" || continue; fi
      schreibe status $id done $hash && { print -r -- "geschlossen: $id $titel ($hash)"; log "v$VERSION geschlossen $id ($hash)" } ;;
  esac
done < $T/plan
SUMME="Board nach Release v$VERSION ($VON..$BIS): ${PROBE:+Probe, }geschlossen $ZU, Reihen vermerkt $REI, Zweifel $ZW, Wartet auf OK unberührt $OKW"
(( FEHL )) && SUMME+=", nicht geschrieben $FEHL"
print -r -- $SUMME
log $SUMME
if (( FEHL )); then
  an_neon "[board-nach-release] v$VERSION: $FEHL Schreibvorgänge im Board gescheitert: ${(j:; :)FEHLTEXT}. Bitte prüfen (zweiter Lauf mit zsh tests/board-nach-release.zsh $VERSION holt Fehlendes nach)." board-nach-release \
    || log "an neon nicht zugestellt"
  exit 1
fi
exit 0
