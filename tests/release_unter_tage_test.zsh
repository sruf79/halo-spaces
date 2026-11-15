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
