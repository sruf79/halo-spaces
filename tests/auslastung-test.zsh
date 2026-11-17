#!/bin/zsh
# Lokaler Testlauf eines Workers des Auslastungswächters (tests/auslastung-schleife.zsh, tests/auslastung-auftrag.md):
#   zsh tests/auslastung-test.zsh <Port 2874–2889> [--dark] --only "<Prüfung>"
# Nimmt die Sperre ~/halo-nacht/bilder.lock (lockf, wartet bis 60 Min.; Worker testen nacheinander), wartet dann,
# bis belegt() aus lauf-hilfen.zsh frei meldet (CI auf dem Runner, Windows-VM, anderer Testlauf, Thunderbird mit
# Marionette, release.sh/publish.sh; bis 60 Min., minütlich), und ruft erst dann halo_test.py im eigenen Worktree auf.
# Nicht mitgezählt: andere Claude-Sitzungen (Worker arbeiten in eigenen Worktrees) und Ungespeichertes im Worktree.
# Nachtlauf-Schutz (AGENTS.md „Den Nachtlauf nicht behindern“: keine Testläufe über 01:30 hinaus): 01:10–01:45 beginnt
# kein Testlauf; ein Testlauf beim Start des Nachtlaufs (01:30, belegt()) ließe ihn ausfallen. Probe: HALO_AS_TEST_HM=HHMM.
# Exitcode: der von halo_test.py; 3 = nach 60 Minuten noch belegt (dann nicht testen, im Bericht nennen).
emulate -L zsh
HIER=${0:A:h}
port=$1; shift
[[ $port == <2874-2889> ]] || { print -u2 "Aufruf: auslastung-test.zsh <Port 2874–2889> [halo_test.py-Optionen]"; exit 2 }
if [[ -z $_HALO_AS_SPERRE ]]; then
  mkdir -p $HOME/halo-nacht
  exec env _HALO_AS_SPERRE=1 lockf -t 3600 $HOME/halo-nacht/bilder.lock zsh $0 $port "$@"
fi
LOG=/dev/null REPO=${HIER:h} REST_MITNEHMEN=1
source $HIER/lauf-hilfen.zsh
aktive_sitzung() { return 1 }
nachtschutz() { local hm=${HALO_AS_TEST_HM:-$(date +%H%M)}; (( 10#$hm >= 110 && 10#$hm < 145 )) }
for i in {1..60}; do
  g=$(nachtschutz && print "Nachtlauf-Schutz 01:10–01:45 (Start des Nachtlaufs 01:30)" || belegt) || break
  (( i == 60 )) && { print -r -- "BELEGT: $g – nach 60 Minuten kein Testlauf"; exit 3 }
  (( i == 1 )) && print -r -- "warte: $g"
  sleep 60   # minütlich neu prüfen (belegt() hat keinen Ereignis-Hinweis)
done
python3 $HIER/halo_test.py --port $port "$@"
