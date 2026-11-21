#!/bin/zsh
# Wartung der Windows-VM außerhalb eines Testlaufs. Grundsatz für jede VM auf neon (Maintainer 21.11.2026,
# ENTSCHEIDUNGEN.md „VMs: nach jedem Test herunterfahren …“): am Ende jedes Tests und jeder Wartung ganz herunterfahren,
# vor dem Test starten. Die Arbeit macht tests/vm_frisch.py, gelöst in eigener Sitzung: weder launchd beim Ende des
# CI-Wächters noch der GitHub-Runner beim Jobende beenden es. Vorab-Start (von Hand, --taeglich; Maintainer 18.11.2026:
# „wir sollten die vm bereits am anfang rebooten vor den CI testläufen, damit der reboot nicht ebenfalls andere CI's
# stört“): starten (läuft sie noch, erst herunterfahren), bis 5 Minuten Warten auf Windows, Kurztest Bildtakt mit
# tests/win-bildtakt.ps1, bei Störung ein zweiter Start, sonst „FEHLER VM gestört“; danach wieder herunterfahren,
# außer ein Lauf mit --vm wartet schon auf die Sperre ~/halo-vm/lauf.lock (Marke ~/halo-vm/wartet-<PID>): dann geht
# die laufende VM samt Sperre an ihn („übergeben“).
# Die Dateien kommen aus dem letzten Commit (git show HEAD), nicht aus dem oft bearbeiteten Arbeitsbaum.
# Keine Altersgrenze (Maintainer 18.11.2026). Läuft CI, ein Test oder ein Lauf in der VM: auslassen.
#   vm-frisch.sh              jetzt (von Hand)
#   vm-frisch.sh --taeglich   aus dem CI-Wächter: nur 00:45 bis 01:14 und bis zum ersten Erfolg je Tag
#                             (Tagesmarke ~/halo-nacht/vm-frisch.tag schreibt vm_frisch.py erst bei Erfolg)
#   vm-frisch.sh --nach-lauf  Nachlauf-Schritt des CI-Jobs windows (auch nach Zeitüberschreitung oder Abbruch):
#                             nur herunterfahren, ohne Prüfung auf CI; hat halo_test.py das schon übergeben, tut es nichts
# Nach einem normalen Lauf mit --vm fährt halo_test.py die VM selbst herunter (im Hintergrund über vm_frisch.py
# --nach-lauf). Protokoll ~/halo-nacht/vm-frisch.log.
# Testwerte: HALO_JETZT_HM (z. B. 0050), HALO_NACHT, HALO_VM_FRISCH_PY (statt python3, bekommt die Argumente).
emulate -L zsh
REPO=${0:A:h:h}
NACHT=${HALO_NACHT:-$HOME/halo-nacht}
LOG=$NACHT/vm-frisch.log
MARKE=$NACHT/vm-frisch.tag
mkdir -p $NACHT
opt=()

case $1 in
  --taeglich)
    hm=${HALO_JETZT_HM:-$(date +%H%M)}
    (( 10#$hm >= 45 && 10#$hm < 115 )) || exit 0   # 00:45 bis 01:14: fertig, bevor um 01:30 der Nachtlauf beginnt
    [[ -r $MARKE && $(<$MARKE) == $(date +%F) ]] && exit 0
    opt=(--marke $MARKE) ;;
  --nach-lauf) opt=(--nach-lauf) ;;
  '') ;;
  *) print -u2 "Aufruf: vm-frisch.sh [--taeglich|--nach-lauf]"; exit 2 ;;
esac

# Kopie aus dem letzten Commit in einen eigenen Ordner (vm_frisch.py löscht ihn am Ende, --aufraeumen)
QUELLE=$(mktemp -d ${TMPDIR:-/tmp}/vm-frisch-XXXXXX) || exit 1
for f in vm_frisch.py win-bildtakt.ps1 win-display.ps1; do
  if [[ -n $HALO_VM_FRISCH_ARBEITSBAUM ]]; then   # nur für tests/vm_neustart_test.py
    cp $REPO/tests/$f $QUELLE/$f
  else
    git -C $REPO show HEAD:tests/$f > $QUELLE/$f 2>/dev/null
  fi || { print "$(date '+%F %T') FEHLER vm-frisch: tests/$f nicht im Commit" >> $LOG; rm -rf $QUELLE; exit 1 }
done
print "$(date '+%F %T') vm-frisch ${1:-von Hand}" >> $LOG
${=HALO_VM_FRISCH_PY:-python3} $QUELLE/vm_frisch.py $opt --aufraeumen --hintergrund $LOG >> $LOG 2>&1
