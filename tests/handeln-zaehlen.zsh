#!/bin/zsh
# Zählt die Zeilen in ~/halo-nacht/handeln.log (Pflichtzeit des Maintainers, siehe push() in
# lauf-hilfen.zsh) je ISO-Kalenderwoche. Aufruf:
#   zsh tests/handeln-zaehlen.zsh            alle Wochen, eine Zeile „2026-W46 Maintainer nötig: n“
#   zsh tests/handeln-zaehlen.zsh 2026-W46   nur diese Woche (0, wenn nichts oder keine Datei)
# Zeilenform: <JJJJ-MM-TT HH:MM:SS> <Quelle> <Text>.
emulate -L zsh
datei=${HALO_HANDELN_LOG:-$HOME/halo-nacht/handeln.log}
typeset -A n
if [[ -r $datei ]]; then
  while read -r tag rest; do
    [[ $tag == [0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9] ]] || continue
    w=$(date -j -f %F $tag +%G-W%V 2>/dev/null || date -d $tag +%G-W%V 2>/dev/null) || continue
    n[$w]=$(( ${n[$w]:-0} + 1 ))
  done < $datei
fi
if [[ -n $1 ]]; then
  print "$1 Maintainer nötig: ${n[$1]:-0}"
else
  for w in ${(ko)n}; do print "$w Maintainer nötig: ${n[$w]}"; done
fi
