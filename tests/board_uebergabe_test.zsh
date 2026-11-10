# Prüfung von board-uebergabe.zsh mit gefälschtem board.sh, ohne Netz.   zsh tests/board_uebergabe_test.zsh
emulate -L zsh
HIER=${0:A:h}; T=$(mktemp -d); trap 'rm -rf $T' EXIT; F=0
pruefe() { if eval "$2" >/dev/null 2>&1; then print "OK      $1"; else print "FEHLER  $1"; F=1; fi }
cat > $T/board.sh <<'S'
#!/bin/zsh
print -r -- "$*" >> ${0:h}/aufrufe
[[ "$*" == *FAIL* ]] && { print "FEHLER: x"; exit 1 }
[[ "$*" == *DUP* ]] && { print "FEHLER: offener Eintrag mit gleichem Titel existiert schon – ergänzen statt neu"; exit 1 }
print "PVTI_x  ok"
S
chmod +x $T/board.sh
export HALO_BOARDSH=$T/board.sh HALO_BOARD_UEBERGABE=$T/u.txt HALO_UEBERGABE_LOG=$T/log
printf '%s\n' "t1	offen	neu	bug	todo	Titel A [GitHub #1]	Zeile1\\nZeile2" "t2	offen	neu	bug	todo	FAIL Titel	x" "t3	offen	neu	feature	ok	DUP Titel	x" "t4	zugestellt	neu	bug	todo	Alt	x" "t5	offen	notiz	PVTI_abc	-	-	Ergänzung" > $T/u.txt
zsh $HIER/board-uebergabe.zsh; rc=$?
pruefe "Rückgabe 1 wegen der fehlgeschlagenen Zeile" '(( rc == 1 ))'
pruefe "Zeilen 1, 3, 5 zugestellt, 2 bleibt offen, 4 unverändert" '[[ $(cut -f2 $T/u.txt | tr "\n" " ") == "zugestellt offen zugestellt zugestellt zugestellt " ]]'
pruefe "Zeilenumbruch im Text und Aufruf neu/notiz" '[[ $(grep -c "^neu bug Titel A" $T/aufrufe) == 1 && $(grep -c "^notiz PVTI_abc Ergänzung" $T/aufrufe) == 1 && $(grep -c Zeile2 $T/aufrufe) == 1 ]]'
pruefe "zweiter Lauf wiederholt nur die offene Zeile" '(( $(grep -c "^neu\|^notiz" $T/aufrufe) == 4 )) && : > $T/aufrufe && zsh $HIER/board-uebergabe.zsh; (( $(grep -c "^neu\|^notiz" $T/aufrufe) == 1 ))'
pruefe "Datei fehlt: Rückgabe 0" '[[ -z $(HALO_BOARD_UEBERGABE=$T/nix zsh $HIER/board-uebergabe.zsh) ]]'
exit $F
