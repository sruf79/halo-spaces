# Prüfung von push-Kennzeichen, handeln.log und Wochenzählung ohne Claude und Netz.
# Aufruf: zsh tests/handeln_test.zsh   → je Fall OK/FEHLER, Exitcode 1 bei einem Fehler
emulate -L zsh
HIER=${0:A:h}
T=$(mktemp -d) || exit 1
trap 'rm -rf $T' EXIT
FEHLER=0
pruefe() { if eval "$2" >/dev/null 2>&1; then print "OK      $1"; else print "FEHLER  $1"; FEHLER=1; fi }
export HALO_HANDELN_LOG=$T/n/handeln.log HALO_UEBERSPRUNGEN_LOG=$T/u.log LOG=$T/lauf.log HALO_PUSH_TROCKEN=1
: > $LOG
source $HIER/lauf-hilfen.zsh
pruefe "Standard ist [info], kein Logeintrag" '[[ $(push "Test" quelle) == "TROCKEN: push [info] Test" && ! -e $HALO_HANDELN_LOG ]]'
pruefe "drittes Argument handeln: [handeln] und Logzeile" '[[ $(push "Hilfe" quelle handeln) == "TROCKEN: push [handeln] Hilfe" ]] && push "Zwei" quelle2 handeln >/dev/null && [[ $(wc -l < $HALO_HANDELN_LOG) -eq 2 && $(sed -n 1p $HALO_HANDELN_LOG) == ????-??-??\ ??:??:??\ quelle\ Hilfe ]]'
pruefe "Variable HALO_PUSH_ART=handeln" '[[ $(HALO_PUSH_ART=handeln push "V" q) == "TROCKEN: push [handeln] V" ]]'
pruefe "unbekannte Art wird [info]" '[[ $(push "X" q foo) == "TROCKEN: push [info] X" ]]'
printf '2026-11-09 10:00:00 a x\n2026-11-10 10:00:00 b y\n2026-11-16 10:00:00 c z\n' > $T/w.log
pruefe "Wochenzählung" '[[ $(HALO_HANDELN_LOG=$T/w.log zsh $HIER/handeln-zaehlen.zsh 2026-W46) == "2026-W46 Maintainer nötig: 2" && $(HALO_HANDELN_LOG=$T/w.log zsh $HIER/handeln-zaehlen.zsh 2026-W47) == "2026-W47 Maintainer nötig: 1" ]]'
pruefe "Woche ohne Datei: 0" '[[ $(HALO_HANDELN_LOG=$T/nix zsh $HIER/handeln-zaehlen.zsh 2026-W46) == "2026-W46 Maintainer nötig: 0" ]]'
exit $FEHLER
