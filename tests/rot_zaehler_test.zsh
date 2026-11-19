#!/bin/zsh
# Prüft den Zähler roter Releases (Maintainer 18.11.2026, docs/release.md „Rote Änderung auf einen Nebenzweig“) ohne
# Claude, ohne Thunderbird, ohne Netz: rot_stufe/rot_anzahl/rot_eintragen aus tests/lauf-hilfen.zsh, die Einbindung im
# Zwischen-Release-Wächter (rot_zaehlen, melden) und in tests/release-unter-tage.sh (rot_melden) sowie die Verweise in
# AGENTS.md und den Auftragsvorlagen.
#   zsh tests/rot_zaehler_test.zsh   eine Zeile OK/FEHLER je Fall, Exitcode 1 bei einem Fehler
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
export TZ=Europe/Vienna HALO_ROT_ZAEHLER=$T/rot.txt
J=1795006980   # 2026-11-18 14:03:00 Wiener Zeit
H() { ( LOG=/dev/null; source $HIER/lauf-hilfen.zsh; HALO_ROT_JETZT=$J "$@" ) 2>&1 }

# --- rot_stufe, rot_anzahl, rot_eintragen ---
pruefe "leerer Zähler: Stufe Opus, Anzahl 0" "$(H rot_stufe 'Today-Pane'; H rot_anzahl 'Today-Pane')" '^Opus$' '^0$'
pruefe "1. Eintrag: „1 Opus“" "$(H rot_eintragen 'Today-Pane' pruef/x abc1234)" '^1 Opus$'
pruefe "Zeile: Zeit, Schlüssel, Zweig, Stufe, Stand (Tab)" "$(tail -1 $T/rot.txt)" $'^2026-11-18 14:03:00\tToday-Pane\tpruef/x\t1\tabc1234$'
pruefe "2. Eintrag: „2 Fable“" "$(H rot_eintragen 'Today-Pane' pruef/y)" '^2 Fable$'
pruefe "3. Eintrag: „3 Fable“" "$(H rot_eintragen 'Today-Pane' pruef/y)" '^3 Fable$'
pruefe "4. Eintrag: „4 Maintainer“, rot_stufe danach Maintainer" "$(H rot_eintragen 'Today-Pane' pruef/y; H rot_stufe 'Today-Pane')" '^4 Maintainer$' '^Maintainer$'
pruefe "anderer Schlüssel zählt getrennt" "$(H rot_stufe 'Seitenleiste'; H rot_anzahl 'Seitenleiste')" '^Opus$' '^0$'
print -r -- $'2026-11-01 10:00:00\tAlt\tmain\t1\n2026-11-03 10:00:00\tAlt\tmain\t2\n2026-11-10 10:00:00\tAlt\tmain\t1' >> $T/rot.txt
pruefe "Einträge älter als 14 Tage zählen nicht (2 von 3 zu alt)" "$(H rot_anzahl Alt)" '^1$'
pruefe "Schlüssel mit Leerzeichen und Doppelpunkt" "$(H rot_eintragen 'Kalender: Termin ziehen (Woche)' main; H rot_anzahl 'Kalender: Termin ziehen (Woche)')" '^1 Opus$' '^1$'
# Aliasse (19.11.2026, tests/rot-nebenzweig.sh): Karten-ID als Schlüssel, ältere Zeilen mit Hash bzw. patch-id zählen mit
pruefe "Alias: alte Hash-Zeile (kurz) zählt für die Karte mit" "$(H rot_eintragen 'abcdef1234' pruef/a; H rot_eintragen 'PVTI_k' pruef/rot-PVTI_k abcdef1234567890 'patch:00ff' abcdef1234567890)" '^1 Opus$' '^2 Fable$'
pruefe "Alias: Hash-Anfang gleich (7 Zeichen), Karte zählt beide" "$(H rot_anzahl 'PVTI_k' 'abcdef1'; H rot_stufe 'PVTI_k' abcdef1)" '^2$' '^Fable$'
pruefe "Alias: ohne Alias zählt nur die Karte" "$(H rot_anzahl 'PVTI_k')" '^1$'
pruefe "Alias: kurze Hex-Folge (unter 7) ist kein Hash-Anfang" "$(H rot_anzahl 'PVTI_x' 'abcde')" '^0$'
pruefe "Alias: patch:… zählt nur gleich" "$(H rot_eintragen 'patch:00ff' pruef/rot-abc; H rot_anzahl 'patch:00f')" '^1 Opus$' '^0$'
pruefe "leerer Schlüssel: nichts eingetragen" "$(H rot_eintragen '' main; print rc=$?)" 'rc=1'

# --- Wächter tests/zwischen-schleife.zsh: rot_zaehlen und melden ---
SK=$HIER/zwischen-schleife.zsh
FN=$(sed -n '/^rot_zaehlen() {/,/^}/p;/^melden() {/,/^}/p' $SK)
RZ() { ( LOG=/dev/null; source $HIER/lauf-hilfen.zsh; HALO_ROT_JETZT=$J; eval "$FN"; rot_zaehlen "$@" ) 2>&1 }
rm -f $T/rot.txt
D=$'linux (esr): Today-Pane\nmac: Seitenleiste'
pruefe "echtes Rot nach Wiederholung: Modellstufe Opus, Verweis auf docs/release.md und systematic-debugging" \
  "$(RZ "$D" 'ja (Lauf 111, Versuch 2)' abcdef1234567 pruef/x)" '^Modellstufe: 1\. Rot .* → Opus ' 'systematic-debugging' 'docs/release\.md „Rote Änderung auf einen Nebenzweig“'
pruefe "je rote Prüfung eine Zeile im Zähler" "$(grep -c . $T/rot.txt; cut -f2,3 $T/rot.txt)" '^2$' $'^Today-Pane\tpruef/x$' $'^Seitenleiste\tpruef/x$'
pruefe "dieselbe Prüfung wieder rot (andere Plattform): Stufe 2 Fable" "$(RZ 'windows: Today-Pane' 'ja (Lauf 222, Versuch 2)' 1234567abcdef pruef/y)" '^Modellstufe: 2\. Rot .* → Fable '
pruefe "höchste Stufe der roten Prüfungen zählt" "$(RZ $'mac: Seitenleiste\nmac: Today-Pane' 'ja (Lauf 333, Versuch 2)' 1234567abcdef pruef/y)" '^Modellstufe: 3\. Rot .* → Fable '
N=$(grep -c . $T/rot.txt)
pruefe "mehr als 5 rote Prüfungen (ohne Wiederholung) zählt" "$(RZ 'linux: Neu' 'nein: mehr als 5 rote Prüfungen in einem Job (echter Fehler)' 1 pruef/z)" '^Modellstufe: 1\. '
N=$(grep -c . $T/rot.txt)
pruefe "keine Wiederholung nach 23:00: zählt nicht" "$(RZ 'linux: Neu' 'nein: nach 2300 keine Wiederholung mehr (Release bis 24:00)' 1 pruef/z; grep -c . $T/rot.txt)" "^$N\$"
pruefe "Wiederholung nicht fertig: zählt nicht" "$(RZ 'linux: Neu' 'ja (Lauf 1, Versuch 2), nach 100 Min. nicht fertig' 1 pruef/z; grep -c . $T/rot.txt)" "^$N\$"
pruefe "keine rote Prüfung (Zeitüberschreitung): zählt nicht" "$(RZ '' 'ja (Lauf 1, Versuch 2)' 1 pruef/z; grep -c . $T/rot.txt)" "^$N\$"
M=$( ( LOG=/dev/null; source $HIER/lauf-hilfen.zsh; MODUS= ERGEBNIS=$T/erg.txt HALO_PUSH_TROCKEN=1; eval "$FN"
       an_neon() { print -r -- "AN_NEON<<$1>>"; return 0 }
       melden "ROT nach Wiederholung" 3.32.0 abcdef1234567 pruef/x "Push 111" 'linux: Today-Pane' "ja (Lauf 111, Versuch 2)" "Modellstufe: 2. Rot → Fable" ) 2>&1 )
pruefe "Meldung an neon: Modellstufe zwischen Wiederholung und „neon kümmert sich“" "$M" '^Wiederholung: ja \(Lauf 111, Versuch 2\)$' '^Modellstufe: 2\. Rot → Fable$' '^neon kümmert sich\.>>$'
pruefe "Wächter: Zählen nur im Zweig ROT" "$(grep -vE '^[[:space:]]*#' $SK | grep -c 'rot_zaehlen "\$det" "\$wdh"')" '^1$'

# --- tests/release-unter-tage.sh: rot_melden ---
RU=$HIER/release-unter-tage.sh
RF=$(sed -n '/^rot_melden() {/,/^}/p' $RU)
RM() { ( LOG=/dev/null; source $HIER/lauf-hilfen.zsh; HALO_ROT_JETZT=$J HALO_PUSH_TROCKEN=1 VERSION=3.33.0 HIER=$HIER VOLLDAMPF=$1; shift
         eval "$RF"; rot_melden "$@" ) 2>&1 }
rm -f $T/rot.txt
pruefe "Release unter Tage: Push-Lauf nach Wiederholung rot → Zähler, Stufe, Meldung an neon" \
  "$(HALO_RUT_CI='failure 2' RM '' fedcba9876543210)" '^ROT-STUFE: 1\. Rot von Stand fedcba9 .* → Opus$' \
  '^TROCKEN: an_neon \[release-unter-tage\] ROT: Release 3\.33\.0, Stand fedcba9' 'systematic-debugging' 'docs/release\.md'
pruefe "Release unter Tage: Zählerzeile mit Schlüssel „Stand <Hash>“" "$(cut -f2,3,4 $T/rot.txt)" $'^Stand fedcba9\tmain\t1$'
pruefe "Release unter Tage: erster Versuch rot (noch keine Wiederholung) zählt nicht" "$(HALO_RUT_CI='failure 1' RM '' fedcba9876543210; grep -c . $T/rot.txt)" '^1$'
pruefe "Release unter Tage: CI grün (Update-Test o. ä.) zählt nicht" "$(HALO_RUT_CI='success 1' RM '' fedcba9876543210; grep -c . $T/rot.txt)" '^1$'
pruefe "Release unter Tage im Volldampf: meldet der Wächter, hier nichts" "$(HALO_RUT_CI='failure 2' RM 1 fedcba9876543210; grep -c . $T/rot.txt)" '^1$'
pruefe "Release unter Tage: rot_melden vor dem Abbruch bei gescheitertem release.sh" "$(grep -c '^NUR_CI=1 ./release.sh \$VERSION || { rot_melden' $RU)" '^1$'

# --- Verweise für Sitzungen und Agenten ---
for f in AGENTS.md docs/neon-sitzung.md tests/nachtlauf-auftrag.md tests/tagesroutine-auftrag.md tests/auslastung-auftrag.md \
         docs/testrechner.md docs/regelwerk-kontingent.md; do
  pruefe "Verweis auf die Regel in $f" "$(grep -c 'Rote Änderung auf einen Nebenzweig' $HIER/../$f)" '^[1-9]'
done

(( FEHLER )) && exit 1
exit 0
