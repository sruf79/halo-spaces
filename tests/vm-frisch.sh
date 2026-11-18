#!/bin/zsh
# Kalter Neustart der Windows-VM außerhalb eines Testlaufs, damit eine Windows-CI mit einer frischen VM beginnt
# und keine Zeit für den Neustart verliert (Maintainer 18.11.2026: „wir sollten die vm bereits am anfang rebooten
# vor den CI testläufen, damit der reboot nicht ebenfalls andere CI's stört“). Die Arbeit macht
# halo_test.py --vm-frisch (vm_frisch): prlctl stop (bei Zeitüberschreitung --kill), start, bis 5 Minuten Warten auf
# Windows, Kurztest Bildtakt (tests/win-bildtakt.ps1), bei Störung ein zweiter Neustart, sonst „FEHLER VM gestört“;
# danach wird die VM wieder pausiert. Läuft CI, ein Testlauf oder ein Lauf in der VM: sofort auslassen (Exitcode 3).
# Keine Altersgrenze (Maintainer 18.11.2026): auch eine eben gestartete VM wird neu gestartet.
# Aufrufe: nach jedem Lauf mit --vm startet halo_test.py den Neustart selbst im Hintergrund; einmal täglich
# ruft der CI-Wächter dieses Skript mit --taeglich; von Hand ohne Option.
#   vm-frisch.sh              jetzt
#   vm-frisch.sh --taeglich   nur 00:45 bis 01:14 und nur einmal je Tag (Marke ~/halo-nacht/vm-frisch.tag);
#                             war die VM belegt, versucht es der nächste Takt des Wächters noch einmal
# Protokoll: ~/halo-nacht/vm-frisch.log. Testwerte: HALO_JETZT_HM (z. B. 0050), HALO_VM_FRISCH_CMD (statt Python).
emulate -L zsh
REPO=${0:A:h:h}
NACHT=${HALO_NACHT:-$HOME/halo-nacht}
LOG=$NACHT/vm-frisch.log
MARKE=$NACHT/vm-frisch.tag
mkdir -p $NACHT

if [[ $1 == --taeglich ]]; then
  hm=${HALO_JETZT_HM:-$(date +%H%M)}
  (( 10#$hm >= 45 && 10#$hm < 115 )) || exit 0   # 00:45 bis 01:14: fertig, bevor um 01:30 der Nachtlauf beginnt
  heute=$(date +%F)
  [[ -r $MARKE && $(<$MARKE) == $heute ]] && exit 0
  print $heute > $MARKE
fi

print "$(date '+%F %T') vm-frisch ${1:-von Hand}" >> $LOG
if [[ -n $HALO_VM_FRISCH_CMD ]]; then
  ${=HALO_VM_FRISCH_CMD} >> $LOG 2>&1
else
  python3 -u $REPO/tests/halo_test.py --vm-frisch >> $LOG 2>&1
fi
rc=$?
# belegt (3): Marke zurücknehmen, damit der nächste Takt es noch einmal versucht
(( rc == 3 )) && [[ $1 == --taeglich ]] && rm -f $MARKE
print "$(date '+%F %T') vm-frisch Ende (Exitcode $rc)" >> $LOG
exit $rc
