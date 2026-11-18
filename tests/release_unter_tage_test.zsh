#!/bin/zsh
# Prüft Release unter Tage nach fehlgeschlagenem Nachtlauf (Maintainer 15.11.2026) ohne Claude, ohne Thunderbird,
# ohne Netz: tests/release-nachtlauf-gescheitert.sh mit Berichtsattrappen, die Sperren von
# tests/release-unter-tage.sh bis vor git fetch, die Zeile der ersten Plan-Runde (rut_zeile) und NUR_CI in release.sh.
#   zsh tests/release_unter_tage_test.zsh   eine Zeile OK/FEHLER je Fall, Exitcode 1 bei einem Fehler
emulate -L zsh
HIER=${0:A:h}
T=$(mktemp -d) || exit 1
trap 'rm -rf $T' EXIT
FEHLER=0
# pruefe <Name> <Ausgabe> <Muster …>  (alle Muster müssen vorkommen, grep -E)
pruefe() {
  local name=$1 aus=$2 m; shift 2
  for m in "$@"; do
    if ! print -r -- "$aus" | grep -qE -- "$m"; then
      print -r -- "FEHLER  $name – fehlt: $m"; FEHLER=1
      print -r -- "$aus" | sed 's/^/    /'; return
    fi
  done
  print -r -- "OK      $name"
}
mkdir -p $T/b $T/kein-repo
G() { HALO_BERICHTE=$T/b HALO_REPO=$T/kein-repo zsh $HIER/release-nachtlauf-gescheitert.sh $1 2>&1 }

# --- Prüffunktion ---
print -l '# Nachtlauf 2026-11-15' '' 'Kurz: kein Release – die Windows-CI scheiterte dreimal.' '' '## Release' \
  'Release unter Tage: Wunsch ja – ein von Nutzern gemeldeter Fehler ist behoben.' > $T/b/2026-11-15-nachtlauf.md
pruefe "Bericht „kein Release“ → ja" "$(G 2026-11-15)" '^ja Nachtlauf-Bericht 2026-11-15: kein Release'
print -l '# Nachtlauf' '' 'Kurz: Kein Release. 9 Einträge umgesetzt.' > $T/b/2026-11-11-nachtlauf.md
pruefe "Bericht „Kein Release.“ (groß) → ja" "$(G 2026-11-11)" '^ja '
print -l '# Nachtlauf' '' 'Kurz: Version 3.27.0 ist um 08:32 erschienen, mit 6 Korrekturen.' > $T/b/2026-11-14-nachtlauf.md
: > $T/b/2026-11-14-halo.spaces-3.27.0.md
pruefe "Release erschienen → nein" "$(G 2026-11-14)" '^nein Release erschienen \(halo\.spaces-3\.27\.0\)'
pruefe "fehlender Bericht → nein" "$(G 2026-11-01)" '^nein kein Nachtlauf-Bericht 2026-11-01'
print -l '# Nachtlauf' '' 'Kurz: 3 erledigt.' > $T/b/2026-11-13-nachtlauf.md
pruefe "Bericht ohne Release-Angabe, kein Checkout → nein" "$(G 2026-11-13)" '^nein kein Checkout'
pruefe "Ausgabe genau eine Zeile" "$(G 2026-11-15 | grep -c .)" '^1$'

# --- Sperren von release-unter-tage.sh (alle vor git fetch, kein Netz) ---
R() { HALO_BERICHTE=$T/b HALO_GESCHEITERT=${GS:-ja Test} HALO_BELEGT=${BL:-} HALO_JETZT=${JZ:-1000} \
        zsh $HIER/release-unter-tage.sh --pruefen 3.27.1 $T/notes.md 2>&1; print rc=$? }
pruefe "Sperre 01:30–09:00: um 08:00 kein Release" "$(JZ=0800 R)" 'ABBRUCH: nur zwischen 09:00 und 22:00' 'rc=1'
pruefe "nach 22:00 kein Release" "$(JZ=2215 R)" 'ABBRUCH: nur zwischen' 'rc=1'
pruefe "Nachtlauf hatte Release → kein Release unter Tage" "$(GS='nein Release erschienen' R)" 'ABBRUCH: letzter Nachtlauf nicht ohne Release' 'rc=1'
TAG=$(TZ=Europe/Vienna date +%F)
: > $T/b/$TAG-halo.spaces-9.9.9.md
pruefe "heute schon ein Release → kein zweites" "$(R)" 'ABBRUCH: heute schon ein Release' 'rc=1'
rm $T/b/$TAG-halo.spaces-9.9.9.md
pruefe "CI läuft (Runner.Worker) → kein Release" "$(BL='CI-Lauf auf dem GitHub-Runner' R)" 'ABBRUCH: neon belegt: CI-Lauf' 'rc=1'
pruefe "andere Sitzung arbeitet → kein Release" "$(BL='Claude-Sitzung abc arbeitet gerade am Repo' R)" 'ABBRUCH: neon belegt: Claude-Sitzung' 'rc=1'
pruefe "Skript: nie SKIP_TESTS/FORCE_TESTS/HOTFIX, release.sh mit NUR_CI" "$(grep -vE '^#' $HIER/release-unter-tage.sh | grep -cE 'SKIP_TESTS|FORCE_TESTS|HOTFIX='; grep -c '^NUR_CI=1 ./release.sh' $HIER/release-unter-tage.sh)" '^0$' '^1$'
pruefe "release.sh: NUR_CI ohne grüne CI samt Windows → keine Marke" "$(grep -c 'NUR_CI" && -z "\$CI_OK" ]] && fehlschlag' $HIER/../release.sh)" '^1$'

# --- Volldampf (Maintainer 17.11.2026): --volldampf hebt nur „Nachtlauf ohne Release“ und „ein Release pro Tag“ auf ---
print -r -- "volldampf 2026-11-17T01:00+01:00 2026-11-24T01:00+01:00 Probe" > $T/vd.txt
V() { HALO_VOLLDAMPF_DATEI=${VDD:-$T/vd.txt} HALO_VOLLDAMPF_BEENDET=$T/vd-beendet.txt HALO_VOLLDAMPF_JETZT=2026-11-17T10:00+01:00 \
        HALO_BERICHTE=$T/b HALO_GESCHEITERT=${GS:-nein Release erschienen} HALO_BELEGT=${BL:-Probe-Halt} \
        zsh -c "export HALO_JETZT=${JZ:-1000}; zsh $HIER/release-unter-tage.sh --volldampf --pruefen 3.27.1 $T/notes.md" 2>&1; print rc=$? }
: > $T/b/$TAG-halo.spaces-9.9.9.md
pruefe "Volldampf: zweites Release am Tag und Nachtlauf mit Release sperren nicht mehr (bis belegt)" "$(V)" 'ABBRUCH: neon belegt: Probe-Halt' 'rc=1'
rm $T/b/$TAG-halo.spaces-9.9.9.md
pruefe "Volldampf ohne Zeile: --volldampf bricht ab" "$(VDD=$T/keine.txt V)" 'ABBRUCH: Volldampf nicht aktiv' 'rc=1'
print -r -- "2026-11-17T01:00+01:00 2026-11-24T01:00+01:00 2026-11-17T08:00+01:00 98" > $T/vd-beendet.txt
pruefe "Volldampf beendet (Wochenlimit): --volldampf bricht ab" "$(V)" 'ABBRUCH: Volldampf nicht aktiv' 'rc=1'
rm -f $T/vd-beendet.txt
pruefe "Volldampf: Sperre 01:30–09:00 bleibt" "$(JZ=0800 V)" 'ABBRUCH: nur zwischen 09:00 und 24:00' 'rc=1'
# Zwischen-Release mit Push-Beginn bis 22:30: Push-Lauf und Windows enden oft nach 22:00, das Release muss dann noch gehen
pruefe "Volldampf: 23:15 sperrt die Uhrzeit nicht (weiter bis belegt)" "$(JZ=2315 V)" 'ABBRUCH: neon belegt: Probe-Halt' 'rc=1'
pruefe "Volldampf: belegt bleibt Sperre" "$(BL='CI-Lauf auf dem GitHub-Runner' V)" 'ABBRUCH: neon belegt: CI-Lauf' 'rc=1'

# --- Zwischen-Release (tests/zwischen-release.zsh), Sperren vor git fetch ---
Z() { HALO_VOLLDAMPF_DATEI=${VDD:-$T/vd.txt} HALO_VOLLDAMPF_BEENDET=$T/vd-beendet.txt HALO_BELEGT=${BL:-} \
      HALO_VOLLDAMPF_JETZT=2026-11-17T10:00+01:00 \
        zsh -c "export HALO_JETZT=${JZ:-1000}; zsh $HIER/zwischen-release.zsh --pruefen 3.27.1 $T/notes.md" 2>&1; print rc=$? }
pruefe "Zwischen-Release ohne Volldampf: Abbruch" "$(VDD=$T/keine.txt Z)" 'ABBRUCH: Volldampf nicht aktiv' 'rc=1'
pruefe "Zwischen-Release 08:59: Push-Sperre bis 09:00" "$(JZ=0859 Z)" 'ABBRUCH: Push-Sperre bis 09:00' 'rc=1'
pruefe "Zwischen-Release 22:30: Push-Beginn nur bis 22:30 (Release vor 01:00, neon ab 01:30 frei)" "$(JZ=2230 Z)" 'ABBRUCH: Push-Beginn nur bis 2230' 'rc=1'
pruefe "Zwischen-Release 22:29: Uhrzeit sperrt nicht (weiter bis belegt)" "$(JZ=2229 BL='Probe-Halt' Z)" 'ABBRUCH: neon belegt: Probe-Halt' 'rc=1'
pruefe "Zwischen-Release 23:30: Abbruch" "$(JZ=2330 Z)" 'ABBRUCH: Push-Beginn nur bis' 'rc=1'
pruefe "Zwischen-Release: belegt (CI) → Abbruch" "$(BL='CI-Lauf auf dem GitHub-Runner' Z)" 'ABBRUCH: neon belegt: CI-Lauf' 'rc=1'
pruefe "Zwischen-Release: nie SKIP_TESTS/FORCE_TESTS/HOTFIX/NUR_CI-Umgehung, kein Force-Push, Release nur über release-unter-tage --volldampf" \
  "$(grep -vE '^#' $HIER/zwischen-release.zsh | grep -cE 'SKIP_TESTS|FORCE_TESTS|HOTFIX=|--force|push -f|release\.sh|publish\.sh'; grep -c '^zsh \$HIER/release-unter-tage.sh --volldampf' $HIER/zwischen-release.zsh)" '^0$' '^1$'
pruefe "Zwischen-Release: Windows-Lauf muss grün sein, Prüfzweig grün vor dem Push" \
  "$(<$HIER/zwischen-release.zsh)" 'gh workflow run test.yml -R \$R -f ziel=windows --ref main' '\.name == "windows" and \.conclusion == "success"' 'Prüfzweig \$PZ nicht grün'
pruefe "Name ohne „release.sh“ (belegt() sucht release\.sh|publish\.sh)" "$(print -r -- zwischen-release.zsh release-unter-tage.sh | grep -cE 'release\.sh|publish\.sh')" '^0$'

# --- Tagesroutine: Zeile nur in der ersten Plan-Runde ---
SKRIPT=$HIER/tagesroutine.sh
eval "$(sed -n '/^rut_zeile()/,/^}/p' $SKRIPT)"
REPO=$T/repo; mkdir -p $REPO/tests; cp $HIER/release-nachtlauf-gescheitert.sh $REPO/tests/
pruefe "rut_zeile bei ja: Entscheidung und Wunsch des Nachtlaufs" "$(HALO_BERICHTE=$T/b HALO_REPO=$T/kein-repo rut_zeile 2026-11-15)" \
  '^ja Nachtlauf-Bericht.* – du entscheidest jetzt' 'Nachtlauf: Release unter Tage: Wunsch ja – ein von Nutzern'
pruefe "rut_zeile bei nein: nichts zu entscheiden" "$(HALO_BERICHTE=$T/b HALO_REPO=$T/kein-repo rut_zeile 2026-11-14)" '^nein Release erschienen.* – nichts zu entscheiden$'
pruefe "Skript: Release-Zeile nur in Plan-Runde 1" "$(grep -B3 'rut_zeile \$TAG' $SKRIPT | grep -c 'PLANRUNDE == 1')" '^1$'
pruefe "Auftrag: Abschnitt Release unter Tage mit Ablauf und Ergebnissen" "$(<$HIER/tagesroutine-auftrag.md)" \
  'Release unter Tage \(Maintainer 15\.11\.2026' 'tests/release-unter-tage\.sh --pruefen' 'release <version> <Commit>' 'kein_release <Grund>' 'nicht_noetig'
pruefe "Nachtlauf-Auftrag: Wunsch-Zeile mit festen Anfangsworten" "$(<$HIER/nachtlauf-auftrag.md)" '„Release unter Tage: Wunsch ja – <Grund>“'
exit $FEHLER
