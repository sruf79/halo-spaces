# Vorprüfungen der Läufe auf neon (tests/MAC-MINI.md Abschnitte 13, 16, 17;
# Entscheidung des Maintainers vom 6.11.2026, Sitzung global.design.comparison,
# Wortlaut: „ja, punkt 2 und 3 umsetzen.“): Claude wird nur gestartet, wenn es
# etwas zu tun gibt. Die Prüfung läuft ohne Claude (nur git, gh, python3).
# nachtlauf.sh, rundgang-woche.sh und wochenpruefung.sh (--doku) laden diese
# Datei mit `source`; wie lauf-hilfen.zsh wird sie nach ~/.config/halo-spaces/
# kopiert (tests/mac-mini-setup.sh). Erwartet $LOG, $REPO und die Funktionen
# zeit() und log() aus lauf-hilfen.zsh.
#
# Jede Funktion gibt den Grund aus und antwortet mit 0 („Claude nötig“) oder 1
# („nichts zu tun“). Im Zweifel (gh, git oder Daten nicht lesbar) immer 0.
# Ein übersprungener Lauf schreibt mit uebersprungen() eine Zeile
# „ÜBERSPRUNGEN <Routine> <Grund>“ ins eigene Protokoll und in
# ~/halo-nacht/uebersprungen.log (für die Wochenprüfung), schickt aber keinen
# Push aufs iPhone.
# ~/halo-nacht/IMMER erzwingt den Nachtlauf trotz leerer Liste.

UEBERSPRUNGEN_LOG=${HALO_UEBERSPRUNGEN_LOG:-$HOME/halo-nacht/uebersprungen.log}

uebersprungen() {   # <Routine> <Grund>
  mkdir -p ${UEBERSPRUNGEN_LOG:h}
  print -r -- "$(zeit) ÜBERSPRUNGEN $1 $2" >> $UEBERSPRUNGEN_LOG
  [[ -n $LOG ]] && log "ÜBERSPRUNGEN $1 $2"
}

# Anzahl machbarer Einträge aus der JSON-Ausgabe von `gh project item-list`
# (stdin): Status Todo und In Progress, nicht „Wartet auf OK“ und nicht Done.
board_machbar() {
  jq '[.items[] | select(.status == "Todo" or .status == "In Progress")] | length'
}

# Nachtlauf: gibt es etwas zu tun? Machbare Einträge (Todo, In Progress), nicht
# gepushte Commits, offene Änderungen im Checkout, unveröffentlichte
# Änderungen am Paket (seit dem letzten Release-Tag).
nachtlauf_arbeit() {
  local n tag
  [[ -e $HOME/halo-nacht/IMMER ]] && { print "~/halo-nacht/IMMER vorhanden"; return 0 }
  [[ -n $(git -C $REPO status --porcelain 2>/dev/null) ]] && { print "offene Änderungen im Checkout"; return 0 }
  git -C $REPO fetch -q origin 2>/dev/null || { print "git fetch gescheitert, im Zweifel Lauf"; return 0 }
  n=$(git -C $REPO rev-list --count origin/main..main 2>/dev/null) || { print "Commits nicht lesbar, im Zweifel Lauf"; return 0 }
  (( n > 0 )) && { print "$n nicht gepushte Commits"; return 0 }
  tag=$(git -C $REPO describe --tags --abbrev=0 --match 'v[0-9]*' origin/main 2>/dev/null) || { print "kein Release-Tag, im Zweifel Lauf"; return 0 }
  git -C $REPO diff --quiet $tag origin/main -- extension chrome icons 2>/dev/null
  (( $? == 0 )) || { print "unveröffentlichte Änderungen am Paket seit $tag"; return 0 }
  n=$(gh project item-list 1 --owner sruf79 --limit 1000 --format json 2>/dev/null | board_machbar 2>/dev/null)
  [[ $n == <-> ]] || { print "Board nicht lesbar, im Zweifel Lauf"; return 0 }
  (( n > 0 )) && { print "$n machbare Einträge im Board (Todo/In Progress)"; return 0 }
  print "keine machbaren Einträge (Todo/In Progress), keine nicht gepushten Commits, keine offenen Änderungen, nichts Unveröffentlichtes seit $tag"
  return 1
}

# Design-Rundgang: ist eine Auswertung durch Claude nötig? Nur bei neuen oder
# geänderten Ausreißern, neu nicht erreichten Oberflächen, neuen
# Original-Symbolen, oder wenn es keinen Vergleich mit der Vorwoche gibt
# (erster Lauf, neues Farbschema). Eingabe: vergleich.json von
# rundgang_vergleich.py.
rundgang_auswertung_noetig() {   # <vergleich.json>
  python3 - $1 <<'EOF'
import json, sys
try:
    v = json.load(open(sys.argv[1]))
except Exception as e:
    print(f"Vergleich nicht lesbar ({e}), im Zweifel Auswertung"); sys.exit(0)
if not v.get("vorher") or not v.get("verglichen"):
    print("kein Vergleich mit einem vorigen Rundgang"); sys.exit(0)
neu_schema = sorted(set(v.get("schemata", [])) - set(v["verglichen"]))
if neu_schema:
    print("nicht verglichen (" + ", ".join(neu_schema) + "), Werte ohne Vorgänger"); sys.exit(0)
teile = []
if v.get("neu"): teile.append(f"{len(v['neu'])} neue Ausreißer")
if v.get("geaendert"): teile.append(f"{len(v['geaendert'])} geänderte Werte")
nn = sum(len(d) for d in (v.get("neu_nicht_erreicht") or {}).values())
if nn: teile.append(f"{nn} neu nicht erreichte Oberflächen")
if v.get("neue_original_symbole"): teile.append(f"{len(v['neue_original_symbole'])} neue Original-Symbole")
if teile:
    print(", ".join(teile)); sys.exit(0)
print("keine neuen oder geänderten Ausreißer, keine neu nicht erreichten Oberflächen, keine neuen Original-Symbole")
sys.exit(1)
EOF
}

# Doku-Prüfung (Entscheidung des Maintainers vom 6.11.2026, Sitzung
# global.design.comparison, Wortlaut: „nein die doku prüfung soll auch
# widersprüche sehen“; die Regeln unten sind die Deutung dieser Sitzung):
#  1. geänderte .md seit der letzten Prüfung gründlich, dazu Abgleich gegen alle
#     anderen .md (Widersprüche, Doppeltes), die übrigen nur dafür;
#  2. .md, die ein geändertes Skript beschreiben, ebenfalls gründlich, auch
#     unverändert. Regel: geändert seit dem Stand sind *.sh, *.zsh, *.py (tests/ und
#     Hauptordner) und .github/workflows/*; eine .md „beschreibt“ sie, wenn der
#     Dateiname (Basisname) im Text vorkommt. extension/ und chrome/ zählen nicht
#     (sie ändern sich täglich, AGENTS.md nennt sie ohnehin);
#  3. Vollprüfung aller .md am ersten Samstag im Monat oder wenn
#     ~/halo-nacht/DOKU-VOLL existiert (der Lauf löscht sie nach der Prüfung);
#  4. überspringen nur, wenn nichts davon zutrifft.
# Stand: Commit von main nach der letzten fertigen Prüfung in
# ~/halo-aufgaben/doku-pruefung.stand. Setzt DOKU_STAND, DOKU_GEAENDERT (.md
# geändert), DOKU_SKRIPTE (Skripte geändert, die eine .md nennt), DOKU_BETROFFEN
# (.md, die sie nennen, ohne die schon geänderten) und DOKU_VOLL (1 = Vollprüfung).
DOKU_STAND_DATEI=${HALO_DOKU_STAND:-$HOME/halo-aufgaben/doku-pruefung.stand}
DOKU_VOLL_DATEI=${HALO_DOKU_VOLL:-$HOME/halo-nacht/DOKU-VOLL}
DOKU_GEAENDERT=() DOKU_SKRIPTE=() DOKU_BETROFFEN=() DOKU_STAND= DOKU_VOLL=
doku_geaendert() {
  local a b c f mds grund=() tag=$(date +%u) tm=$(date +%d)
  DOKU_GEAENDERT=() DOKU_SKRIPTE=() DOKU_BETROFFEN=() DOKU_STAND= DOKU_VOLL=
  git -C $REPO fetch -q origin 2>/dev/null
  if [[ -e $DOKU_VOLL_DATEI ]]; then DOKU_VOLL=1; grund+=("Vollprüfung ($DOKU_VOLL_DATEI)")
  elif (( tag == 6 && 10#$tm <= 7 )); then DOKU_VOLL=1; grund+=("Vollprüfung (erster Samstag im Monat)"); fi
  [[ -r $DOKU_STAND_DATEI ]] && DOKU_STAND=$(<$DOKU_STAND_DATEI)
  [[ -n $DOKU_STAND ]] && git -C $REPO cat-file -e "${DOKU_STAND}^{commit}" 2>/dev/null ||
    { DOKU_STAND=; DOKU_VOLL=1; print "kein bekannter Stand der letzten Prüfung, alle .md-Dateien"; return 0 }
  a=$(git -C $REPO diff --name-only $DOKU_STAND main 2>/dev/null) || { DOKU_STAND=; DOKU_VOLL=1; print "Vergleich gescheitert, im Zweifel alle .md-Dateien"; return 0 }
  b=$(git -C $REPO diff --name-only $DOKU_STAND origin/main 2>/dev/null)
  c=(${(f)"$(print -r -- $a$'\n'$b | sort -u | sed '/^$/d')"})
  DOKU_GEAENDERT=(${(M)c:#*.md})
  DOKU_GEAENDERT=(${DOKU_GEAENDERT:#extension/vendor/*})
  for f in ${(M)c:#(*.sh|*.zsh|*.py|.github/workflows/*)}; do
    [[ $f == extension/* ]] && continue
    mds=(${(f)"$(git -C $REPO grep -l -F -- ${f:t} main -- '*.md' ':(exclude)extension/vendor' 2>/dev/null | sed 's/^main://')"})
    (( $#mds )) || continue
    DOKU_SKRIPTE+=($f)
    DOKU_BETROFFEN+=($mds)
  done
  DOKU_BETROFFEN=(${${(u)DOKU_BETROFFEN}:|DOKU_GEAENDERT})
  (( $#DOKU_GEAENDERT )) && grund+=("$#DOKU_GEAENDERT geänderte .md seit ${DOKU_STAND[1,7]}: ${(j:, :)DOKU_GEAENDERT[1,6]}${${DOKU_GEAENDERT[7]}:+, …}")
  (( $#DOKU_SKRIPTE )) && grund+=("$#DOKU_SKRIPTE geänderte Skripte, die eine .md nennt (${(j:, :)DOKU_SKRIPTE[1,4]}${${DOKU_SKRIPTE[5]}:+, …}), betrifft ${(j:, :)DOKU_BETROFFEN[1,4]}${${DOKU_BETROFFEN[5]}:+, …}")
  if (( $#grund )); then print -r -- ${(j:; :)grund}; return 0; fi
  print "keine .md und keine beschriebenen Skripte geändert seit ${DOKU_STAND[1,7]}, keine Vollprüfung fällig"
  return 1
}
doku_stand_merken() {   # nach einer fertigen Prüfung (auch mit eigenen Commits)
  mkdir -p ${DOKU_STAND_DATEI:h}
  git -C $REPO rev-parse main > $DOKU_STAND_DATEI 2>/dev/null
}
