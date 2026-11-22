#!/bin/zsh
# Prüft den Schalter der Umbau-Woche (tests/umbau-woche.sh, tests/umbau-woche.py) ohne Claude, ohne Netz, ohne Board:
# Zeitfenster (Beginn Di 24.11. 01:00, Worker-Sperre ab Mo 20:00, kein Ende), an/aus/status, welche Einträge ein Lauf
# beginnen darf (Feature nein, P4 ja, Nutzer-Bug ja), Fable-Sperre (S0 b), Vorsortierung für Tag 1 an einem Wegwerf-Repo
# und die Einbindung in Nachtlauf, Tagesroutine und die beiden Volldampf-Wächter.
# Nicht unter tests/logik/: dort lösen Änderungen die CI aus (tests/ci-noetig.sh), Abläufe brauchen keine.
#   zsh tests/umbau_woche_test.zsh   eine Zeile OK/FEHLER je Fall, Exitcode 1 bei einem Fehler
emulate -L zsh
HIER=${0:A:h}
U=$HIER/umbau-woche.sh
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
rc() { "$@" >/dev/null 2>&1; print -r -- "rc=$?" }
export HALO_UMBAU_DATEI=$T/n/umbau-woche.txt
mkdir -p $T/n
uw() { zsh $U "$@" 2>&1 }

# --- Schalter: Format, Zeitfenster, an/aus ---
export HALO_JETZT=2026-11-22T19:00+01:00
pruefe "ohne Datei: aus (rc 1)" "$(uw status; rc zsh $U status)" '^Umbau-Woche aus$' 'rc=1'
pruefe "an: Beginn = nächster Wochenreset Di 24.11. 01:00, angemeldet (rc 3)" "$(uw an; rc zsh $U status)" \
  'angemeldet ab 2026-11-24T01:00\+01:00' 'Keine neuen Worker ab 2026-11-23T20:00\+01:00' 'rc=3'
pruefe "Zeile: umbau <ab> <Grund>, kein Ende" "$(cat $HALO_UMBAU_DATEI)" '^umbau 2026-11-24T01:00\+01:00 Freigabe Umbau-Woche des Maintainers vom 20\.11\.2026'
pruefe "Zeile hat genau ein Zeitfeld (kein bis)" "$(awk '{print ($3 ~ /^20[0-9][0-9]-/) ? "zwei" : "eins"}' $HALO_UMBAU_DATEI)" '^eins$'
pruefe "an zweimal: nichts überschrieben" "$(uw an; ls $T/n)" 'Schalter steht schon' '^umbau-woche.txt$'
pruefe "Di 00:59: noch angemeldet (rc 3)" "$(HALO_JETZT=2026-11-24T00:59+01:00 rc zsh $U aktiv)" 'rc=3'
pruefe "Di 01:00: aktiv (rc 0)" "$(HALO_JETZT=2026-11-24T01:00+01:00 uw status; HALO_JETZT=2026-11-24T01:00+01:00 rc zsh $U aktiv)" \
  'Umbau-Woche aktiv seit 2026-11-24T01:00\+01:00 \(endet nur mit der Entscheidung des Maintainers\)' 'rc=0'
pruefe "Zonen: Di 00:00 UTC = 01:00 Wien" "$(HALO_JETZT=2026-11-24T00:00+00:00 rc zsh $U aktiv)" 'rc=0'
pruefe "kein automatisches Ende (Di 1.12. und 15.12. weiter aktiv)" \
  "$(HALO_JETZT=2026-12-01T02:00+01:00 rc zsh $U aktiv; HALO_JETZT=2026-12-15T12:00+01:00 rc zsh $U aktiv)" '^rc=0$'
pruefe "Worker-Sperre: Mo 19:59 frei" "$(HALO_JETZT=2026-11-23T19:59+01:00 rc zsh $U worker-sperre)" 'rc=1'
pruefe "Worker-Sperre: Mo 20:00 gesperrt (S0 a)" "$(HALO_JETZT=2026-11-23T20:00+01:00 uw worker-sperre; HALO_JETZT=2026-11-23T20:00+01:00 rc zsh $U worker-sperre)" \
  'keine neuen Worker seit 2026-11-23T20:00\+01:00 \(Umbau-Woche ab 2026-11-24T01:00\+01:00, S0 a\)' 'rc=0'
pruefe "Worker-Sperre gilt auch in der Woche" "$(HALO_JETZT=2026-11-26T12:00+01:00 rc zsh $U worker-sperre)" 'rc=0'
pruefe "aus ohne Herkunft: abgelehnt, Schalter bleibt" "$(uw aus; rc zsh $U aus; ls $T/n)" 'Aufruf: .* aus <Herkunft' 'rc=2' '^umbau-woche.txt$'
pruefe "aus mit Herkunft: Zeile in den Verlauf, dann aus" \
  "$(HALO_JETZT=2026-11-30T19:00+01:00 uw aus 'Maintainer 30.11.2026 Probe'; ls $T/n; cat $T/n/umbau-woche-aus-*.txt; uw status)" \
  'Umbau-Woche aus \(Verlauf: umbau-woche-aus-20261130-190000\.txt\)' '^umbau 2026-11-24' '# aus 2026-11-30T19:00\+01:00: Maintainer 30\.11\.2026 Probe' '^Umbau-Woche aus$'
pruefe "nach aus: keine Worker-Sperre" "$(rc zsh $U worker-sperre)" 'rc=1'
pruefe "an jetzt (Rückfall: Schalter Di früh von Hand)" "$(HALO_JETZT=2026-11-24T07:10+01:00 uw an jetzt; HALO_JETZT=2026-11-24T07:10+01:00 rc zsh $U aktiv)" \
  'Umbau-Woche aktiv seit 2026-11-24T07:10\+01:00' 'rc=0'
print -r -- "umbau morgen kaputt" > $HALO_UMBAU_DATEI
pruefe "unlesbare Zeile: gilt nicht, FEHLER sichtbar (rc 4)" "$(uw status; rc zsh $U status; rc zsh $U worker-sperre)" 'FEHLER: Schalter .* unlesbar' 'rc=4' 'rc=1'
pruefe "an mit Zeit ohne Zone: abgelehnt, keine gültige Zeile" "$(rm -f $HALO_UMBAU_DATEI; uw an 2026-11-24T01:00; rc zsh $U status)" 'FEHLER: Zeile gilt nicht' 'rc=1'
rm -f $T/n/*(N)

# --- Was ein Lauf in der Woche beginnen darf (Trockenlauf mit drei Fällen, Ablaufplan Schritt 10) ---
print -r -- "umbau 2026-11-24T01:00+01:00 Probe" > $HALO_UMBAU_DATEI
export HALO_JETZT=2026-11-24T02:00+01:00
pruefe "Feature: nicht beginnen" "$(uw erlaubt Feature 'Mail: Vorschlagsmenü wie Apple Mail'; rc zsh $U erlaubt Feature 'Mail: x')" '^nein Feature/Design' 'rc=1'
pruefe "P4 (Tests: flackert): beginnen" "$(uw erlaubt Bug 'Tests: flackert – Kalender: Mehrwochen-Ansicht 3/6 (linux)'; rc zsh $U erlaubt Bug 'Tests: flackert – x')" '^ja P4' 'rc=0'
pruefe "P4 (Tests: CI rot): beginnen" "$(uw erlaubt Bug 'Tests: CI rot – Lauf 1 (abc): 2 Prüfungen')" '^ja P4'
pruefe "P4 aus Liste 1a per Kürzel (Ablauf: Dunkel-Lauf, KRJ0I)" "$(uw erlaubt Feature 'Ablauf: Dunkel-Lauf der Mac-CI verkleinern' PVTI_lAHODEPpks4BoBQwzhKRJ0I)" '^ja P4'
pruefe "Nutzer-Bug (GitHub #n): beginnen" "$(uw erlaubt Bug 'Symbolleiste: Suchfeld klappt zu [GitHub #67]'; rc zsh $U erlaubt Bug 'X [GitHub #67]')" '^ja von Nutzern gemeldeter Bug' 'rc=0'
pruefe "Feature mit GitHub #n: nicht beginnen" "$(uw erlaubt Feature 'Ordnerliste: Zahl wie Apple Mail [GitHub #61]')" '^nein Feature'
pruefe "Bug ohne Nutzer-Meldung: nicht beginnen" "$(uw erlaubt Bug 'Mail: eigener Fund')" '^nein Bug ohne Meldung'
pruefe "Umbau-Eintrag (Kep4c): kein Lauf, baut neon" "$(uw erlaubt Feature 'Ablauf: Organigramm' PVTI_lAHODEPpks4BoBQwzhKep4c)" '^nein Umbau-Eintrag'
pruefe "Kq83E (schwächt Prüfung ab): nur der Maintainer" "$(uw erlaubt Feature 'Tests: Bildtakt nur warnen' PVTI_lAHODEPpks4BoBQwzhKq83E)" '^nein nur der Maintainer'
pruefe "Pausiert: nie, auch P4" "$(uw erlaubt Bug 'Tests: flackert – x' PVTI_x Pausiert)" '^nein Status Pausiert'
pruefe "vor der Woche (So): alles wie bisher" "$(HALO_JETZT=2026-11-22T19:00+01:00 uw erlaubt Feature 'Mail: x')" '^ja Umbau-Woche nicht aktiv'
pruefe "vor der Woche: Pausiert trotzdem nie" "$(HALO_JETZT=2026-11-22T19:00+01:00 uw erlaubt Feature 'Mail: x' PVTI_x Pausiert)" '^nein Status Pausiert'

# --- Fable aus der Tagesroutine (S0 b): nur nach „Rot bleibt rot“ ---
pruefe "Woche: Fable für Feature gesperrt" "$(rc zsh $U fable 'Mail: Vorschlagsmenü')" 'rc=1'
pruefe "Woche: Fable für Nutzer-Bug gesperrt" "$(rc zsh $U fable 'Symbolleiste: Suchfeld [GitHub #67]')" 'rc=1'
pruefe "Woche: Fable für rote/flackernde Prüfung erlaubt" "$(rc zsh $U fable 'Tests: flackert – Seitenleiste')" 'rc=0'
pruefe "vor der Woche: Fable wie bisher" "$(HALO_JETZT=2026-11-23T12:00+01:00 rc zsh $U fable 'Mail: x')" 'rc=0'

# --- Tag 1: fällig, Marke ---
pruefe "Tag 1 fällig ohne Marke" "$(rc zsh $U faellig)" 'rc=0'
pruefe "vor der Woche nicht fällig" "$(HALO_JETZT=2026-11-24T00:30+01:00 rc zsh $U faellig)" 'rc=1'
pruefe "Marke: danach nicht mehr fällig" "$(uw sortiert $T/bericht.md; rc zsh $U faellig; cat $T/n/umbau-sortiert.txt)" 'Tag 1 sortiert' 'rc=1' '^sortiert 2026-11-24T02:00\+01:00 '
rm -f $T/n/umbau-sortiert.txt

# --- Vorsortierung an einem Wegwerf-Repo: nur belegte Fälle, schreibt nichts ---
G=$T/repo
git init -q -b main $G; git -C $G config user.email t@t; git -C $G config user.name t
export GIT_AUTHOR_DATE=2026-11-20T10:00:00+0100 GIT_COMMITTER_DATE=2026-11-20T10:00:00+0100   # feste Hashes: Fälle reproduzierbar
c() { print -r -- $1 > $G/$1; git -C $G add $1; git -C $G commit -qm $1; git -C $G rev-parse --short=8 HEAD }
H_GRUEN=$(c a); H_MAIN=$(c b)
git -C $G update-ref refs/remotes/origin/main HEAD
git -C $G switch -qc pruef/worker-1 $H_GRUEN; H_PG=$(c d)
git -C $G switch -qc pruef/worker-2 $H_GRUEN; H_PR=$(c e)
git -C $G switch -qc nacht/x $H_GRUEN; H_ANDERS=$(c f)
git -C $G switch -q main
H_ZIFFERN=
for i in {1..400}; do h=$(c z$i); [[ $h == <-> ]] && { H_ZIFFERN=$h; break }; done
git -C $G update-ref refs/remotes/origin/main HEAD
git -C $G rev-parse $H_GRUEN > $T/gruen.txt; git -C $G rev-parse $H_PG >> $T/gruen.txt
e() { print -r -- "{\"id\":\"PVTI_test$1\",\"typ\":\"$2\",\"status\":\"${5:-In Progress}\",\"title\":\"$3\",\"body\":\"$4\"}" }
J=(
  "$(e AAAAA Bug 'Mail: fertig' "Text\\n\\ncommittet, wartet auf Push/CI ($H_GRUEN)")"
  "$(e BBBBB Bug 'Mail: im main, CI offen' "committet, wartet auf Push/CI ($H_MAIN)")"
  "$(e BPRUE Bug 'Mail: Prüfzweig grün' "committet auf pruef/worker-1, wartet auf Prüfzweig-CI: $H_PG")"
  "$(e UPROT Bug 'Mail: Prüfzweig ohne Grün' "committet auf pruef/worker-2, wartet: $H_PR")"
  "$(e UANDR Bug 'Mail: anderer Zweig' "committet auf nacht/x: $H_ANDERS")"
  "$(e CCCCC Feature 'Mail: angefangen' "Plan\\n\\nIn Arbeit beendet: worker-1 (Auslastungswächter, 2026-11-20 10:00), zurück")"
  "$(e Kep4c Feature 'Ablauf: Organigramm' "committet, wartet auf Push/CI ($H_GRUEN)")"
  "$(e DTEST Bug 'Tests: flackert – Seitenleiste' 'Text')"
  "$(e NNNNN Bug 'Mail: Suchfeld [GitHub #67]' 'Text')"
  "$(e WWWWW Bug 'Mail: Worker dran' 'In Arbeit: worker-20261124-0010-1 (Auslastungswächter, 2026-11-24 00:15), Zweig pruef/worker-x')"
  "$(e WALTT Bug 'Mail: alter Vermerk' 'In Arbeit: worker-3 (Auslastungswächter, 20.11.2026 11:47), Zweig pruef/w')"
  "$(e UTEIL Bug 'Mail: Teil' "Teil 1 committet, wartet auf Push/CI ($H_GRUEN). Offen: Teil 2")"
  "$(e UNACH Bug 'Mail: danach Befund' "committet, wartet auf Push/CI ($H_GRUEN)\\n\\nBefund 23.11.: wirkt nicht unter Windows")"
  "$(e UREIH Feature 'Aufgaben: Ansicht (2/5) – Schritt' "committet, wartet auf Push/CI ($H_GRUEN)")"
  "$(e AFELD Feature 'Felder: Höhe 30/24 px wie die Knöpfe' "committet, wartet auf Push/CI ($H_GRUEN)")"
  "$(e PAUSE Bug 'Mail: pausiert' 'Text' Pausiert)"
  "$(e TODOO Bug 'Mail: offen' 'Text' Todo)"
)
J+=("$(e ZIFFR Bug 'Mail: Ziffern-Hash' "committet auf main ($H_ZIFFERN)")")
print -r -- "{\"items\":[${(j:,:)J}]}" > $T/export.json
mkdir -p $T/bin; print -r -- '#!/bin/sh
echo "$0 $*" >> '$T'/aufrufe.log; exit 1' > $T/bin/gh; chmod +x $T/bin/gh
S=$(PATH=$T/bin:$PATH HALO_UMBAU_REPO=$G HALO_JETZT=2026-11-24T01:30+01:00 zsh $U sortieren $T/export.json --gruen $T/gruen.txt 2>&1; print "rc=$?")
z() { print -r -- $S | awk -F'\t' -v k=$1 '$3 == k { print $1 "\t" $5 }' }
pruefe "A: committet, Commit in main, CI grün → Done" "$(z AAAAA)" '^A	Commit in main, CI grün'
pruefe "B: Commit in main, CI noch offen → bleibt, abschließen" "$(z BBBBB)" '^B	Commit in main, CI noch nicht grün'
pruefe "B: Commit auf grünem Prüfzweig bleibt In Progress (S0 c)" "$(z BPRUE)" '^B	Commit auf Prüfzweig pruef/worker-1, Tests grün \(S0 c\)'
pruefe "U: Prüfzweig ohne grüne Tests → einzeln prüfen (nie blind Pausiert)" "$(z UPROT)" '^U	Commit weder in main noch auf grünem Prüfzweig'
pruefe "U: Commit auf anderem Zweig (kein pruef/) → einzeln prüfen" "$(z UANDR)" '^U	'
pruefe "C: kein Commit → Pausiert mit Notiz" "$(z CCCCC)" '^C	kein Commit in den Notizen'
pruefe "D: Umbau-Eintrag (Liste 1a) bleibt, auch wenn fertig" "$(z Kep4c)" '^D	P4 bzw. Umbau'
pruefe "D: neue flackernde Prüfung (P4-Familie) bleibt" "$(z DTEST)" '^D	'
pruefe "N: Nutzer-Bug ohne Commit unberührt (offene Frage)" "$(z NNNNN)" '^N	'
pruefe "W: frischer Worker-Vermerk (unter 5 Std.) unberührt" "$(z WWWWW)" '^W	frischer Vermerk „In Arbeit: worker-20261124-0010-1“'
pruefe "alter Worker-Vermerk sperrt nicht" "$(z WALTT)" '^C	'
pruefe "U: Teil/Offen in der Commit-Notiz → kein Done" "$(z UTEIL)" '^U	Teil, Schritt'
pruefe "U: Notiz nach der Commit-Notiz → kein Done" "$(z UNACH)" '^U	nach der letzten Commit-Notiz'
pruefe "U: Reihe (2/5) → kein Done (Done erst nach OK)" "$(z UREIH)" '^U	'
pruefe "„30/24 px“ ist keine Reihe" "$(z AFELD)" '^A	'
pruefe "Hash nur aus Ziffern wird erkannt (sonst fiele ein Commit nach C)" "$(z ZIFFR)" '^B	'
pruefe "nur In Progress zählt, Pausiert und Todo nicht angefasst; Summe stimmt" "$S" \
  '# Zählung: A 2, B 3, C 2, D 2, N 1, W 1, U 5; Summe 16 = In Progress 16$' 'Pausiert 1' 'rc=0'
pruefe "Pausiert und Todo erscheinen in keiner Liste" "$(print -r -- $S | grep -cE 'PVTI_test(PAUSE|TODOO)')" '^0$'
pruefe "mit Exportdatei: kein gh-Aufruf, kein Board" "$(cat $T/aufrufe.log 2>/dev/null; print ende)" '^ende$'
pruefe "ohne grüne Läufe: nichts wird Done (nur Release-Tags zählen)" \
  "$(HALO_UMBAU_REPO=$G zsh $U sortieren $T/export.json | awk -F'\t' '$3=="AAAAA"{print $1}')" '^B$'
git -C $G tag v1.0.0 $H_GRUEN
pruefe "Release-Tag gilt als grün" "$(HALO_UMBAU_REPO=$G zsh $U sortieren $T/export.json | awk -F'\t' '$3=="AAAAA"{print $1}')" '^A$'
SK=$(grep -vE '^[[:space:]]*#' $HIER/umbau-woche.py $U)
pruefe "Vorsortierung schreibt nie ins Board (kein status/notiz/neu/item-edit)" \
  "$(print -r -- $SK | grep -cE 'board\.sh (status|notiz|neu|text|titel|archiv)|item-edit|item-archive|updateProjectV2'; print -r -- $SK | grep -cE 'git[^|]*(push|commit|reset|checkout)')" '^0$' '^0$'

exit $FEHLER
