#!/bin/zsh
# Prüfung von tests/rot-nebenzweig.sh ohne Claude, ohne Netz, ohne echtes Board: Wegwerf-Repo mit Release-Tag v1.0.0
# und Commits danach, Board-Attrappe ($T/board.sh, board.json), Zähler in $T. Je Fall eine Zeile OK/FEHLER,
# Exitcode 1 bei einem Fehler. Aufruf: zsh tests/rot_nebenzweig_test.zsh
emulate -L zsh
HIER=${0:A:h}
T=$(mktemp -d) || exit 1
trap 'rm -rf $T' EXIT
FEHLER=0
pruefe() {   # <Name> <Ausgabe> <Muster …> (grep -E, alle müssen vorkommen)
  local name=$1 aus=$2 m; shift 2
  for m in "$@"; do
    if ! print -r -- "$aus" | grep -qE -- "$m"; then
      print -r -- "FEHLER  $name – fehlt: $m"; FEHLER=1
      print -r -- "$aus" | sed 's/^/    /'; return
    fi
  done
  print -r -- "OK      $name"
}
export TZ=Europe/Vienna HALO_ROT_ZAEHLER=$T/rot.txt HALO_ROT_JETZT=1795006980 GIT_CONFIG_GLOBAL=/dev/null
export HALO_RNZ_BOARD="zsh $T/board.sh"
SK=$HIER/rot-nebenzweig.sh

# --- Board-Attrappe ---
cat > $T/board.sh <<'ENDE'
B=${0:h}/board.json
case $1 in
  export) [[ -r $B && ! -e ${0:h}/board.aus ]] || { print -u2 "FEHLER: Board nicht lesbar"; exit 1 }; cat $B ;;
  notiz) print -r -- "notiz $2 $3" >> ${0:h}/folge.log ;;
  status) print -r -- "status $2 $3" >> ${0:h}/folge.log ;;
  *) exit 2 ;;
esac
ENDE

# --- Repo ---
neu_repo() {
  R=$T/repo; rm -rf $R; mkdir -p $R/tests; cd $R
  git init -q -b main . && git config user.email t@t && git config user.name t
  # Marken mit Abstand: jede Prüfung kommt an eine eigene Stelle (sonst hätte jeder Revert Konflikte)
  { print -r -- 'check("Alt: bleibt", f, r)'; for m in A D1 D2 E X; do print -r -- "# $m"; print -l 1 2 3 4 5 6; done } > tests/halo_test.py
  print a > a.css
  git add -A; git commit -q -m Start; git tag v1.0.0
  c() {   # <Datei> <Zeile> <Betreff> [<Marke>]: hängt an bzw. fügt nach der Marke ein
    if [[ -n $4 ]]; then L=$2 M="# $4" python3 -I -c 'import os,sys; p=sys.argv[1]; t=open(p).read().split("\n"); i=t.index(os.environ["M"]); t.insert(i+1, os.environ["L"]); open(p,"w").write("\n".join(t))' $1
    else print -r -- $2 >> $1; fi
    git add $1; git commit -q -m $3; git rev-parse HEAD }
  A=$(c tests/halo_test.py 'check("Mail: Liste neu", f, r)' "Mail: Liste neu" A)
  B=$(c a.css 'b' "Kalender: nur CSS")
  D1=$(c tests/halo_test.py 'check("Doppelt", f, r)' "Aufgaben: Doppelt 1" D1)
  D2=$(c tests/halo_test.py 'check("Doppelt", g, r)' "Aufgaben: Doppelt 2" D2)
  E=$(c tests/halo_test.py 'check("Kontakte: Feld", f, r)' "Kontakte: Feld" E)
  cd $HIER
}
: > $T/leer
jq -n '{items: []}' > $T/board.json
lauf() { ( cd $R; zsh $SK "$@" $R ) 2>&1 }
ref() { git -C $R rev-parse -q --verify $1 }

# 1. Probe ändert nichts
neu_repo; KOPF=$(ref HEAD)
pruefe "Probe: zeigt Rücknahme, ändert nichts" "$(lauf --probe --pruefung 'Mail: Liste neu'; print kopf=$(ref HEAD))" \
  "^PROBE: würde ${A[1,7]} „Mail: Liste neu“" "kopf=$KOPF" 'Modellstufe Opus'
pruefe "Probe: kein Zweig, kein Zähler" "$( git -C $R branch --list 'pruef/*' | wc -l | tr -d ' '; [[ -e $T/rot.txt ]] && print zaehler; print ende )" '^0$' '^ende$'

# 2. Eindeutige Zuordnung ohne Karte: Revert, Nebenzweig, Zähler mit patch-id
jq -n --arg a ${A[1,7]} '{items: [{id: "PVTI_mail", status: "In Progress", title: "Mail: Liste", body: "Wo\n\ncommittet, wartet auf Push/CI (\($a))"}]}' > $T/board.json
O=$(HALO_RNZ_LOG=$T/leer lauf --lauf 77 --pruefung 'Mail: Liste neu'); RC=$?
pruefe "eindeutig: NEBENZWEIG, Karte gefunden, Modellstufe Opus, Exitcode 0" "$O
rc=$RC" "^NEBENZWEIG ${A[1,7]} .* → pruef/rot-PVTI_mail, Revert" '^Modellstufe: 1\. Rot .* → Opus ' 'systematic-debugging' 'rc=0$'
pruefe "main: letzter Commit ist der Revert mit „This reverts commit“ und Zweig im Betreff" \
  "$(git -C $R log -1 --format='%s%n%b')" "^Mail: vorerst zurückgenommen, .*Lauf 77; die Änderung liegt auf pruef/rot-PVTI_mail" "This reverts commit $A\."
pruefe "main: Prüfung aus halo_test.py entfernt" "$(grep -c 'Mail: Liste neu' $R/tests/halo_test.py)" '^0$'
pruefe "Nebenzweig: ein Commit über main hinaus (Cherry-pick -x), enthält die Prüfung" \
  "$(git -C $R rev-list --count main..pruef/rot-PVTI_mail; git -C $R log -1 --format=%b pruef/rot-PVTI_mail; git -C $R show pruef/rot-PVTI_mail:tests/halo_test.py)" \
  '^1$' "cherry picked from commit $A" 'Mail: Liste neu'
pruefe "Nebenzweig ist kein Vorfahr von main (aufraeumen.sh löscht ihn nicht)" "$(git -C $R merge-base --is-ancestor pruef/rot-PVTI_mail main; print anc=$?)" '^anc=1$'
pruefe "Zähler: Schlüssel Karte, Zweig, Stufe 1, Original-Hash" "$(cut -f2- $T/rot.txt)" $'^PVTI_mail\tpruef/rot-PVTI_mail\t1\t'$A'$'
pruefe "Board: Notiz mit Hash, Zweig, Lauf, Stufe und Status Todo" "$(cat $T/folge.log)" \
  "^notiz PVTI_mail .*Lauf 77.*Commit ${A[1,7]} auf main zurückgenommen.*pruef/rot-PVTI_mail.*Modellstufe: 1\." '^status PVTI_mail todo$'
pruefe "keine Arbeitskopie bleibt zurück" "$(git -C $R worktree list | wc -l | tr -d ' ')" '^1$'

# 3. Derselbe Inhalt kommt nach Rebase/Cherry-pick (neuer Hash) wieder und ist wieder rot: Stufe 2 über die Karte
cd $R; git cherry-pick pruef/rot-PVTI_mail >/dev/null 2>&1 || print -r -- 'FEHLER  Testaufbau: cherry-pick'; A2=$(git rev-parse HEAD); cd $HIER
jq -n --arg a ${A2[1,7]} '{items: [{id: "PVTI_mail", status: "In Progress", title: "Mail: Liste", body: "committet \($a)"}]}' > $T/board.json
pruefe "wieder rot (neuer Hash, gleiche Karte): Stufe 2 Fable, Zweig mit Anhang" "$(lauf --pruefung 'Mail: Liste neu')" \
  "→ pruef/rot-PVTI_mail-${A2[1,7]}," '^Modellstufe: 2\. Rot .* → Fable '

# 4. Ohne Karte: Schlüssel patch-id; frühere Zählerzeile mit altem Hash derselben Änderung zählt mit
neu_repo; rm -f $T/rot.txt $T/folge.log
jq -n '{items: []}' > $T/board.json
print -r -- $'2026-11-17 10:00:00\t'${E[1,9]}$'\tpruef/alt\t1' > $T/rot.txt
O=$(lauf --pruefung 'Kontakte: Feld')
pruefe "ohne Karte: Zweig pruef/rot-<Hash>, Schlüssel patch:…, alte Hash-Zeile zählt (Stufe 2), Warnung" "$O" \
  "→ pruef/rot-${E[1,7]}, .*Schlüssel patch:[0-9a-f]{16}" '^Modellstufe: 2\. ' '^WARNUNG: keine eindeutige Board-Karte'
pruefe "ohne Karte: keine Board-Schreibzugriffe" "$([[ -e $T/folge.log ]] && cat $T/folge.log; print ende)" '^ende$'

# 5. Zweifel: nur melden, nichts zurücknehmen
neu_repo; rm -f $T/rot.txt; KOPF=$(ref HEAD)
O=$(lauf --pruefung 'Doppelt' --pruefung 'Alt: bleibt' --pruefung 'Schritt „Test hell“ abgebrochen'); RC=$?
pruefe "Zweifel: mehrere Commits, keiner im Bereich, Abbruch-Schritt; Exitcode 3, main unverändert, kein Zähler" "$O
rc=$RC kopf=$(ref HEAD) zaehler=$([[ -e $T/rot.txt ]] && print ja || print nein)" \
  "^ZWEIFEL „Doppelt“: mehrere Commits .*${D1[1,7]}|^ZWEIFEL „Doppelt“: mehrere Commits .*${D2[1,7]}" \
  '^ZWEIFEL „Alt: bleibt“: kein Commit' '^ZWEIFEL „Schritt „Test hell“ abgebrochen“' '^Nebenzweig: nichts zurückgenommen' \
  "rc=3 kopf=$KOPF zaehler=nein"
pruefe "nur CSS geändert, Prüfung unverändert: Zweifel" "$(lauf --pruefung 'Kalender: gibt es nicht')" '^ZWEIFEL „Kalender: gibt es nicht“: kein Commit'

# 6. --commit: von der Sitzung belegter Verursacher (z. B. CSS) wird zurückgenommen; außerhalb des Bereichs nicht
O=$(HALO_RNZ_LOG=$T/leer lauf --commit $B --karte PVTI_kal --lauf 5 --pruefung 'Alt: bleibt')
pruefe "--commit mit --karte: Revert des CSS-Commits, Zweig pruef/rot-PVTI_kal" "$O" "^NEBENZWEIG ${B[1,7]} .*→ pruef/rot-PVTI_kal," '^Modellstufe: 1\. '
pruefe "--commit außerhalb des Bereichs: Fehler, nichts geändert" "$(KOPF=$(ref HEAD); lauf --commit v1.0.0; print rc=$? gleich=$([[ $(ref HEAD) == $KOPF ]] && print ja))" \
  'liegt nicht in' 'rc=1 gleich=ja'

# 7. Lauf-Protokoll: rote Prüfungen aus FEHLER-Zeilen (Attrappe statt gh)
neu_repo; rm -f $T/rot.txt
print -r -- $'mac\tTest hell\tFEHLER\tKontakte: Feld\nmac\tTest hell\tOK\tMail: Liste neu\nlinux (esr)\tTest\tFEHLER\tKontakte: Feld' > $T/pruef
pruefe "--lauf: FEHLER-Zeilen einmal je Prüfung, OK-Zeilen nicht" "$(HALO_RNZ_LOG=$T/pruef lauf --probe --lauf 9)" \
  "^PROBE: würde ${E[1,7]} .*Prüfungen „Kontakte: Feld“;"
pruefe "--lauf: grüne Prüfung nicht zurückgenommen" "$(HALO_RNZ_LOG=$T/pruef lauf --probe --lauf 9 | grep -c ${A[1,7]})" '^0$'

# 8. Vorbedingungen
neu_repo
print x >> $R/a.css
pruefe "ungespeicherte Änderung: Fehler, nichts geändert" "$(lauf --pruefung 'Kontakte: Feld'; print rc=$?)" 'ungespeicherte Änderungen' 'rc=1'
git -C $R checkout -q -- a.css; git -C $R switch -q -c neben
pruefe "nicht auf main: Fehler" "$(lauf --pruefung 'Kontakte: Feld'; print rc=$?)" 'nicht auf main' 'rc=1'
git -C $R switch -q main

# 9. Revert mit Konflikt: Zweifel, main unverändert
cd $R; X=$(c a.css 'x' "Kalender: x"); print y > a.css; git commit -q -am "Kalender: überschreibt x"; KOPF=$(git rev-parse HEAD); cd $HIER
pruefe "Revert mit Konflikt: Zweifel, main unverändert, Arbeitsbaum sauber" \
  "$(lauf --commit $X; print rc=$? gleich=$([[ $(ref HEAD) == $KOPF ]] && print ja) sauber=$([[ -z $(git -C $R status --porcelain -uno) ]] && print ja))" \
  '^ZWEIFEL .*Konflikte' 'rc=3 gleich=ja sauber=ja'

# 10. Auslöser in tests/nachtlauf.sh (rot_zweige_abschluss): neue Zweige pruef/rot-* an neon, Nachkontrolle
neu_repo; rm -f $T/rot.txt $T/gemeldet.txt
START0=$(( $(date +%s) - 5 ))
jq -n --arg e ${E[1,7]} '{items: [{id: "PVTI_kon", status: "In Progress", title: "Kontakte", body: "committet \($e)"}]}' > $T/board.json
lauf --pruefung 'Kontakte: Feld' >/dev/null
NFN=$(sed -n '/^rot_zweige_abschluss() {/,/^}/p' $HIER/nachtlauf.sh)
NA() { ( setopt extendedglob; LOG=/dev/null; source $HIER/lauf-hilfen.zsh; REPO=$R DIR=$T TAG=2026-11-19 HALO_ROT_GEMELDET=$T/gemeldet.txt HALO_PUSH_TROCKEN=1
         eval "$NFN"; rot_zweige_abschluss $START0 ) 2>&1 }
O=$(NA)
pruefe "Nachtlauf: neuer Zweig an neon mit Modellstufe aus dem Zähler, kein iPhone-Push" "$O" \
  '^- Neue rote Nebenzweige: 1$' "^- pruef/rot-PVTI_kon \(Commit ${E[1,7]}, Schlüssel PVTI_kon: .*Modellstufe: 1\. Rot in 14 Tagen → Opus" \
  '^TROCKEN: an_neon \[nachtlauf\] Rote Nebenzweige' '^- an neon gemeldet$' '^- Nachkontrolle: kein Revert'
pruefe "Nachtlauf: kein push (iPhone) im Auslöser" "$(print -r -- $NFN | grep -cE '(^|[^_])push ')" '^0$'
pruefe "Nachtlauf: gemeldeter Zweig nicht noch einmal" "$(NA)" '^- Neue rote Nebenzweige: keine$'
git -C $R branch pruef/rot-arbeit main >/dev/null 2>&1
pruefe "Nachtlauf: Zweig pruef/rot-*, der ganz in main steckt, ist kein Nebenzweig" "$(NA)" '^- Neue rote Nebenzweige: keine$'
git -C $R branch -D pruef/rot-arbeit >/dev/null 2>&1
cd $R; git revert --no-edit $D2 >/dev/null 2>&1; cd $HIER
pruefe "Nachtlauf: nackter Revert ohne Zählerzeile → WARNUNG im Bericht" "$(NA)" "^- WARNUNG: Revert [0-9a-f]{7,} nimmt ${D2[1,7]} zurück, ohne Zählerzeile"
pruefe "Nachtlauf: rot_abschluss nach ci_abschluss aufgerufen" "$(grep -A1 -x 'ci_abschluss' $HIER/nachtlauf.sh | tail -1)" '^rot_abschluss$'

pruefe "Tagesroutine-Auftrag: pruef/rot-* als erster Eintrag, auch nach einem Release" "$(sed -n '/Schritt 1b (Vorrang)/,/Schritt 2:/p' $HIER/tagesroutine-auftrag.md)" \
  'pruef/rot-\*' 'auch nach einem Release' 'erster Eintrag' 'tests/rot-nebenzweig\.sh'

(( FEHLER )) && exit 1
exit 0
