# Sitzung auf diesem Mac ohne Claude finden (Anweisung des Maintainers vom 7.11.2026: eine Suche
# per Namen darf nicht still scheitern, wenn die Sitzung anders heißt, z. B. „neon-board“ als
# „halo-board-de“ oder „comm.github.routine“ statt „github.comm.routine“).
# Wird mit `source` geladen (lauf-hilfen.zsh); liest ~/.claude/sessions/<pid>.json lebender Prozesse.
#   sitzung_finden <Name>   gibt den lokalen Namen der Sitzung aus (für SendMessage), Rückgabe 1 ohne Treffer
# Reihenfolge: 1. gleicher Name, 2. alle Wörter des gesuchten Namens kommen im Namen vor (Reihenfolge
# egal), 3. Rolle neon-board: Arbeitsordner ~/halo-board. Mehrere Treffer: der zuletzt aktive.
#   sitzung_merken <Name> <gefundener Name>   hält den Treffer in ~/halo-aufgaben/sitzungen.json fest
#   (Rolle → Name, Sitzungs-ID, Zeit; „zuletzt bekannt“ für Handarbeit, wenn die Suche scheitert)
sitzung_finden() {
  python3 -I - "$1" "${HALO_SITZUNGEN_DIR:-$HOME/.claude/sessions}" "${HALO_BOARD_DIR:-$HOME/halo-board}" <<'PY'
import json, os, re, sys, glob
want, ordner, board = sys.argv[1], sys.argv[2], sys.argv[3]
lebend = []
for f in glob.glob(os.path.join(ordner, "*.json")):
    try:
        d = json.load(open(f))
        os.kill(int(d["pid"]), 0)
    except (OSError, ValueError, KeyError, TypeError):
        continue
    if d.get("name"):
        lebend.append(d)
def neueste(l):
    return sorted(l, key=lambda d: d.get("updatedAt", 0), reverse=True)[0]["name"]
def woerter(s):
    return set(w for w in re.split(r"[.\-_ :]+", s.lower()) if w)
treffer = [d for d in lebend if d["name"] == want]
if not treffer:
    w = woerter(want)
    treffer = [d for d in lebend if w and w <= woerter(d["name"])]
if not treffer and want == "neon-board":
    treffer = [d for d in lebend if os.path.realpath(d.get("cwd", "")) == os.path.realpath(board)]
if not treffer:
    sys.exit(1)
print(neueste(treffer))
PY
}
sitzung_merken() {   # <Name> <gefundener Name>
  python3 -I - "$1" "$2" "${HALO_SITZUNGEN_DIR:-$HOME/.claude/sessions}" "${HALO_SITZUNGEN_DATEI:-$HOME/halo-aufgaben/sitzungen.json}" <<'PY' 2>/dev/null
import json, os, sys, glob, time
rolle, name, ordner, datei = sys.argv[1:5]
sid = ""
for f in glob.glob(os.path.join(ordner, "*.json")):
    try:
        d = json.load(open(f))
        if d.get("name") == name:
            sid = d.get("bridgeSessionId") or d.get("sessionId") or ""
    except (OSError, ValueError):
        pass
try:
    alle = json.load(open(datei))
except (OSError, ValueError):
    alle = {}
alle[rolle] = {"name": name, "id": sid, "zeit": time.strftime("%F %T")}
os.makedirs(os.path.dirname(datei), exist_ok=True)
json.dump(alle, open(datei, "w"), ensure_ascii=False, indent=1)
PY
}
