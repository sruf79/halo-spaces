#!/bin/zsh
# Rote Änderung auf einen Nebenzweig (Maintainer 18.11.2026, docs/release.md „Rote Änderung auf einen Nebenzweig“;
# 18.11.2026: „opus soll hier eine lösung finden damit die regel ab sofort für alle sessions und agents und wächter
# aktiv ist“; 19.11.2026: „damit diese logik in zukunft fehlerfrei funktioniert“; Bericht
# ~/halo-berichte/2026-11-19-rot-regel.md). Jede Rücknahme eines Commits wegen einer roten Release-CI läuft über dieses
# Skript, nie als nacktes git revert: Zuordnung, Nebenzweig, Revert, Zähler, Board-Notiz und Modellstufe in einem Zug.
# Ohne Claude, nur git, jq, python3 und tests/board.sh. Pusht nichts (main pusht die aufrufende Sitzung).
#
#   tests/rot-nebenzweig.sh [--probe] [--lauf <ID>] [--pruefung <Name>]… [--commit <Hash>] [--karte <PVTI_…>]
#                           [--von <Ref>] [<Repo>]
#     --lauf      rote Prüfungen aus dem CI-Lauf (gh run view --log, FEHLER-Zeilen); auch nur für Notiz und Zeile
#     --pruefung  rote Prüfung von Hand (mehrfach); mit --lauf zusammen gelten beide
#     --commit    Verursacher, den die Sitzung selbst belegt hat (Diagnoselauf, Bisect); ersetzt die Zuordnung
#     --karte     Board-Karte des Verursachers (sonst gesucht: Hash in einer Notiz „committet …“)
#     --von       Beginn des Bereichs (Standard: letztes Release-Tag v* vor HEAD); Bereich <von>..HEAD auf main
#     --probe     nur zeigen, was geschähe (kein Revert, kein Zweig, kein Zähler, kein Board)
#
# Zuordnung (nie raten): ein Commit im Bereich (ohne Merges, nicht schon zurückgenommen) ist Verursacher einer roten
# Prüfung, wenn er in tests/halo_test.py eine Zeile mit ihrem Namen in Anführungszeichen ändert (check("<Name>", …):
# Prüfung neu, umbenannt oder Aufruf geändert). Genau ein solcher Commit: zugeordnet. Keiner (z. B. nur CSS geändert,
# nur der Rumpf der Prüfung, Fehler schon im letzten Release) oder mehrere: ZWEIFEL, nichts zurückgenommen – dann
# Ursache belegen (AGENTS.md „Rot bleibt rot“) und mit --commit erneut aufrufen. „Schritt … abgebrochen“ ist nie
# zuordenbar.
# Je Verursacher X (neueste zuerst):
#   1. git revert X auf main (Konflikt: abbrechen, ZWEIFEL, nichts geändert)
#   2. Nebenzweig pruef/rot-<Karte> (ohne Karte pruef/rot-<Hash>; besteht er, mit Anhang -<Hash>): Revert plus
#      git cherry-pick -x X, also die Änderung als eigener Commit über main hinaus. tests/aufraeumen.sh löscht ihn
#      deshalb nicht, bis er nach main zurückkommt. Scheitert der Cherry-pick: Revert auf main zurückgenommen, ZWEIFEL.
#   3. Zähler: rot_eintragen <Karte bzw. patch:<patch-id>> <Zweig> <X> mit Aliassen (patch-id, X, frühere Hashes mit
#      derselben patch-id im Zähler) – derselbe Inhalt zählt nach Cherry-pick oder Rebase weiter hoch
#   4. Board: Notiz an die Karte (Hash, Revert, Zweig, Lauf, Prüfungen, Modellstufe) und Status Todo
#   5. Ausgabe „NEBENZWEIG …“ und „Modellstufe: <n>. Rot … → <Modell>“
# Exitcode: 0 alles zugeordnet und erledigt, 3 mindestens ein ZWEIFEL (Erledigtes bleibt), 1 Fehler, 2 Aufruf.
# Zum Proben: HALO_RNZ_BOARD (Befehl statt „zsh tests/board.sh“), HALO_RNZ_LOG (Pruefzeilen-Datei statt gh für --lauf),
# HALO_ROT_ZAEHLER, HALO_ROT_JETZT. Test: zsh tests/rot_nebenzweig_test.zsh.
emulate -L zsh
setopt pipe_fail extendedglob
HIER=${0:A:h}
LOG=${LOG:-/dev/null}
source $HIER/lauf-hilfen.zsh   # rot_eintragen, rot_wort
BOARD_CMD=(${=${HALO_RNZ_BOARD:-zsh $HIER/board.sh}})

PROBE= LAUF= COMMIT= KARTE= VON=
typeset -a ROT
while (( $# )); do
  case $1 in
    --probe) PROBE=1 ;;
    --lauf) LAUF=$2; shift ;;
    --pruefung) ROT+=("$2"); shift ;;
    --commit) COMMIT=$2; shift ;;
    --karte) KARTE=$2; shift ;;
    --von) VON=$2; shift ;;
    --*) print -u2 "Unbekannte Option $1"; exit 2 ;;
    *) break ;;
  esac
  shift
done
REPO=${1:-${HIER:h}}
cd $REPO 2>/dev/null || { print "FEHLER: kein Checkout unter $REPO"; exit 1 }
[[ -n $LAUF || ${#ROT} -gt 0 || -n $COMMIT ]] || { print -u2 "Aufruf: ${0:t} [--probe] [--lauf <ID>] [--pruefung <Name>]… [--commit <Hash>] [--karte <id>] [--von <Ref>] [<Repo>]"; exit 2 }

# --- Vorbedingungen: auf main, nichts Ungespeichertes ---
[[ $(git symbolic-ref -q --short HEAD) == main ]] || { print "FEHLER: nicht auf main (git switch main), nichts geändert"; exit 1 }
[[ -z $(git status --porcelain -uno) ]] || { print "FEHLER: ungespeicherte Änderungen im Checkout, nichts geändert"; exit 1 }
[[ -n $VON ]] || VON=$(git describe --tags --abbrev=0 --match 'v[0-9]*' HEAD 2>/dev/null)
[[ -n $VON ]] && git rev-parse -q --verify "$VON^{commit}" >/dev/null || { print "FEHLER: Beginn des Bereichs unbekannt (--von)"; exit 1 }

T=$(mktemp -d) || exit 1
trap 'rm -rf $T' EXIT

# --- rote Prüfungen aus dem Lauf ---
if [[ -n $LAUF ]]; then
  if [[ -n $HALO_RNZ_LOG ]]; then cp $HALO_RNZ_LOG $T/pruef
  else
    source $HIER/ci-runde.zsh   # ci_pruefzeilen
    gh_wdh run view $LAUF -R sruf79/halo-spaces --log 2>/dev/null | ci_pruefzeilen > $T/pruef \
      || { print "FEHLER: Lauf $LAUF nicht lesbar (gh run view --log), nichts geändert"; exit 1 }
  fi
  ROT+=(${(f)"$(awk -F'\t' '$3 == "FEHLER" { print $4 }' $T/pruef | sort -u)"})
fi
ROT=(${(u)ROT})
ZWEIFEL=0
zweifel() { print -r -- "ZWEIFEL $*"; ZWEIFEL=1 }

# --- Zuordnung: Prüfung → Commit ---
typeset -A URSACHE PRUEF_VON   # Commit → 1; Commit → Prüfungen (Zeilen)
typeset -a REIHE               # Commits, neueste zuerst
git log --no-merges --format='%H' $VON..HEAD > $T/bereich
# zurückgenommene Commits und die Reverts selbst sind keine Kandidaten
git log --format='%b' $VON..HEAD | sed -n 's/.*This reverts commit \([0-9a-f]\{7,40\}\).*/\1/p' > $T/zurueck
git log --no-merges --format='%H' --grep='This reverts commit' $VON..HEAD >> $T/zurueck
if [[ -n $COMMIT ]]; then
  c=$(git rev-parse -q --verify "$COMMIT^{commit}") || { print "FEHLER: Commit $COMMIT unbekannt"; exit 1 }
  grep -qx $c $T/bereich || { print "FEHLER: Commit ${c[1,7]} liegt nicht in $VON..HEAD (oder ist ein Merge), nichts geändert"; exit 1 }
  URSACHE[$c]=1; PRUEF_VON[$c]=${(F)ROT}
else
  for name in $ROT; do
    if [[ $name == "Schritt „"*"“ abgebrochen" ]]; then
      zweifel "„$name“: kein Prüfungsname, Verursacher nicht zuordenbar – Ursache belegen, dann --commit"; continue
    fi
    kand=(${(f)"$(python3 -I - $T/bereich $T/zurueck "$name" <<'PY'
import subprocess, sys
bereich = open(sys.argv[1]).read().split()
zurueck = open(sys.argv[2]).read().split()
name = sys.argv[3]
muster = ['"' + name + '"', '"' + name.replace('"', '\\"') + '"']
for c in bereich:
    if any(c.startswith(z) for z in zurueck): continue
    d = subprocess.run(["git", "show", "-U0", "--format=", c, "--", "tests/halo_test.py"],
                       capture_output=True, text=True).stdout
    if any(z[:1] in "+-" and not z.startswith(("+++", "---")) and any(m in z for m in muster) for z in d.splitlines()):
        print(c)
PY
)"})
    if (( ${#kand} == 1 )); then
      c=$kand[1]
      (( ${+URSACHE[$c]} )) || REIHE+=($c)
      URSACHE[$c]=1; PRUEF_VON[$c]+=${PRUEF_VON[$c]:+$'\n'}$name
    elif (( ${#kand} == 0 )); then
      zweifel "„$name“: kein Commit in ${VON}..HEAD ändert die Prüfung (Fehler aus CSS/Code oder schon vorher da) – Ursache belegen, dann --commit"
    else
      kurz=(); for k in $kand; do kurz+=(${k[1,7]}); done
      zweifel "„$name“: mehrere Commits ändern die Prüfung (${(j:, :)kurz}) – Ursache belegen, dann --commit"
    fi
  done
fi
[[ -n $COMMIT ]] && REIHE=($c)
# neueste zuerst (Reihenfolge im Bereich)
REIHE=(${(f)"$(grep -xF -f <(print -rl -- $REIHE) $T/bereich)"})
(( ${#REIHE} )) || { print "Nebenzweig: nichts zurückgenommen"; exit $(( ZWEIFEL ? 3 : 0 )) }
[[ -n $KARTE && ${#REIHE} -gt 1 ]] && { print "FEHLER: --karte nur mit einem Verursacher, nichts geändert"; exit 1 }

# --- Board einmal laden (Karte suchen); nicht lesbar: weiter ohne Karte, Schlüssel patch-id ---
BOARD_OK=
if [[ -z $KARTE ]] && "${BOARD_CMD[@]}" export > $T/board.json 2>/dev/null && jq -e '.items | type == "array"' $T/board.json >/dev/null 2>&1; then
  BOARD_OK=1
fi
karte_finden() {   # <Hash> → Karten-ID (genau ein offener Eintrag mit dem Hash in einem „committet“-Absatz)
  [[ -n $BOARD_OK ]] || return 1
  local ids
  ids=(${(f)"$(python3 -I - $T/board.json $1 <<'PY'
import json, re, sys
items = json.load(open(sys.argv[1], encoding="utf-8"))["items"]
h = sys.argv[2]
for it in items:
    if (it.get("status") or "") == "Done": continue
    for a in re.split(r"\n\s*\n", it.get("body") or ""):
        if re.search(r"committet", a, re.I) and any(h.startswith(t) for t in re.findall(r"(?<![0-9A-Za-z])[0-9a-f]{7,40}(?![0-9A-Za-z])", a)):
            print(it["id"]); break
PY
)"})
  (( ${#ids} == 1 )) && print -r -- $ids[1]
}
karte_status() {   # <Karten-ID> → Status laut Board (leer, wenn nicht lesbar); mit --karte wird das Board erst hier geladen
  if [[ -z $BOARD_OK ]] && "${BOARD_CMD[@]}" export > $T/board.json 2>/dev/null && jq -e '.items | type == "array"' $T/board.json >/dev/null 2>&1; then
    BOARD_OK=1
  fi
  [[ -n $BOARD_OK ]] && jq -r --arg k $1 'first(.items[] | select(.id == $k) | .status // "")' $T/board.json 2>/dev/null
}
patch_id() { git show $1 | git patch-id --stable | awk '{ print $1 }' }

for c in $REIHE; do
  k7=${c[1,7]} subj=$(git log -1 --format=%s $c)
  karte=${KARTE:-$(karte_finden $c)}
  pid=$(patch_id $c)
  schluessel=${karte:-patch:${pid[1,16]}}
  zweig=pruef/rot-${karte:-$k7}
  git show-ref -q --verify refs/heads/$zweig && zweig=$zweig-$k7
  git show-ref -q --verify refs/heads/$zweig && { zweifel "${k7}: Zweig $zweig besteht schon – von Hand klären"; continue }
  # Aliasse: patch-id, Hash, frühere Hashes mit derselben patch-id im Zähler
  alias=(patch:${pid[1,16]} $c)
  if [[ -r $(rot_datei) ]]; then
    for h in ${(u)${(f)"$(cut -f2 $(rot_datei) | grep -xE '[0-9a-f]{7,40}')"}}; do
      [[ $(git cat-file -t $h 2>/dev/null) == commit && $(patch_id $h) == $pid ]] && alias+=($h)
    done
  fi
  pruef=${PRUEF_VON[$c]//$'\n'/“, „}
  if [[ -n $PROBE ]]; then
    print -r -- "PROBE: würde $k7 „${subj[1,80]}“ auf main zurücknehmen, Zweig $zweig, Schlüssel $schluessel, Prüfungen „$pruef“; jetzige Modellstufe $(rot_stufe $schluessel $alias)"
    continue
  fi
  # 1. Revert auf main
  bereich=${subj%%:*}; [[ $bereich == $subj || ${#bereich} -gt 30 ]] && bereich=Rot
  if ! git revert --no-edit --no-commit $c >/dev/null 2>&1; then
    git revert --abort >/dev/null 2>&1 || git reset -q --hard HEAD
    zweifel "${k7}: Revert hat Konflikte – nicht sauber trennbar (docs/release.md), nichts geändert"; continue
  fi
  git commit -q -F - <<EOF || { git reset -q --hard HEAD; zweifel "${k7}: Revert ließ sich nicht committen"; continue }
${bereich}: vorerst zurückgenommen, weil die Release-CI rot war${pruef:+ (Prüfung „$pruef“)}${LAUF:+ in Lauf $LAUF}; die Änderung liegt auf $zweig (tests/rot-nebenzweig.sh)

This reverts commit $c.
EOF
  rv=$(git rev-parse HEAD)
  # 2. Nebenzweig: Revert plus Cherry-pick des Originals
  wt=$T/wt-$k7
  if ! { git worktree add -q -b $zweig $wt $rv 2>/dev/null && git -C $wt cherry-pick -x $c >/dev/null 2>&1 }; then
    git -C $wt cherry-pick --abort >/dev/null 2>&1
    git worktree remove --force $wt 2>/dev/null; git branch -q -D $zweig 2>/dev/null
    git reset -q --hard HEAD~1
    zweifel "${k7}: Cherry-pick auf den Nebenzweig scheiterte – Revert auf main zurückgenommen, nichts geändert"; continue
  fi
  git worktree remove $wt 2>/dev/null || git worktree remove --force $wt 2>/dev/null
  # 3. Zähler
  e=$(rot_eintragen $schluessel $zweig $c $alias)
  stufe="Modellstufe: ${e%% *}. Rot dieser Änderung in 14 Tagen → ${e#* } (1 Opus, 2 und 3 Fable unter 50 % im 5-Stunden-Fenster, ab 4 Maintainer); Untersuchung mit Skill systematic-debugging auf $zweig (docs/release.md „Rote Änderung auf einen Nebenzweig“)"
  print -r -- "NEBENZWEIG $k7 „${subj[1,80]}“ → $zweig, Revert ${rv[1,7]} auf main (nicht gepusht), Schlüssel $schluessel"
  print -r -- $stufe
  # 4. Board
  if [[ -n $karte ]]; then
    "${BOARD_CMD[@]}" notiz $karte "**$(date '+%d.%m.%Y %H:%M'):** Release-CI rot${LAUF:+ (Lauf $LAUF)}${pruef:+, Prüfung „$pruef“}: Commit $k7 auf main zurückgenommen (Revert ${rv[1,7]}), die Änderung liegt auf $zweig. ${stufe}. Wiederaufnahme: Ursache belegen, Fix auf $zweig, dann zurück nach main (tests/rot-nebenzweig.sh)." >/dev/null 2>&1 \
      || print -r -- "WARNUNG: Board-Notiz für $karte nicht geschrieben – von Hand nachholen"
    # Pausiert ist eine Entscheidung des Maintainers (Umbau-Woche): nur die Notiz, den Status nicht still aufheben
    if [[ $(karte_status $karte) == Pausiert ]]; then
      print -r -- "HINWEIS: $karte steht auf Pausiert – Status bleibt, nur Notiz geschrieben"
    else
      "${BOARD_CMD[@]}" status $karte todo >/dev/null 2>&1 || print -r -- "WARNUNG: Status Todo für $karte nicht gesetzt"
    fi
  else
    print -r -- "WARNUNG: keine eindeutige Board-Karte zu $k7${BOARD_OK:-, Board nicht lesbar} – Notiz von Hand (Zweig $zweig, Schlüssel $schluessel)"
  fi
done
exit $(( ZWEIFEL ? 3 : 0 ))
