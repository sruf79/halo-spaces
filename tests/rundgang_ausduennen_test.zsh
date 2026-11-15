#!/bin/zsh
# Logik-Test für rundgang_ausduennen (tests/vorpruefung.zsh) in einem temporären Ordner
# (keine echten Rundgänge, kein Netz). Je Fall eine Zeile OK/FEHLER, Exitcode 0 nur bei Erfolg.
#   zsh tests/rundgang_ausduennen_test.zsh
emulate -L zsh
setopt extendedglob nullglob
T=$(mktemp -d)
trap 'rm -rf $T' EXIT
export HALO_UEBERSPRUNGEN_LOG=$T/uebersprungen.log
source ${0:A:h}/vorpruefung.zsh
fehler=0
pruefe() {   # <Name> <Bedingung>
  if eval $2; then print -r -- "OK $1"; else print -r -- "FEHLER $1"; fehler=1; fi
}
lauf() {   # <Ordner> [alt] – Rundgang mit Bild, Log und JSON anlegen
  mkdir -p $1
  print x > $1/a.png; print x > $1/tour-hell.log; print '{}' > $1/hell-ergebnis.json
  [[ $2 == alt ]] && find $1 -exec touch -h -t 202601010000 {} +
}
TOUR=$T/halo-tour
lauf $TOUR/2026-01-01 alt                               # alt → Bilder weg
lauf $TOUR/2026-11-14                                   # neu → bleibt
lauf $TOUR/2026-01-02-bestandsaufnahme alt; : > $TOUR/2026-01-02-bestandsaufnahme/DAUERHAFT
touch -t 202601010000 $TOUR/2026-01-02-bestandsaufnahme/DAUERHAFT $TOUR/2026-01-02-bestandsaufnahme
lauf $T/aussen/bestand alt                              # Ziel eines Verweises außerhalb
ln -s $T/aussen/bestand $TOUR/2026-01-03-verweis
touch -h -t 202601010000 $TOUR/2026-01-03-verweis
lauf $TOUR/stand alt                                    # kein Datumsordner → bleibt

pruefe "eigene Tage: 1000 lässt alte Läufe stehen" '[[ -z $(rundgang_ausduennen $TOUR 1000) && -e $TOUR/2026-01-01/a.png ]]'
AUSGABE=$(rundgang_ausduennen $TOUR)
pruefe "alter Lauf: Bilder gelöscht" '[[ ! -e $TOUR/2026-01-01/a.png ]]'
pruefe "alter Lauf: Log gelöscht" '[[ ! -e $TOUR/2026-01-01/tour-hell.log ]]'
pruefe "alter Lauf: JSON bleibt" '[[ -e $TOUR/2026-01-01/hell-ergebnis.json ]]'
pruefe "neuer Lauf bleibt ganz" '[[ -e $TOUR/2026-11-14/a.png && -e $TOUR/2026-11-14/tour-hell.log ]]'
pruefe "DAUERHAFT: Bilder bleiben" '[[ -e $TOUR/2026-01-02-bestandsaufnahme/a.png ]]'
pruefe "DAUERHAFT: Log bleibt" '[[ -e $TOUR/2026-01-02-bestandsaufnahme/tour-hell.log ]]'
pruefe "Verweis: Ziel unberührt" '[[ -e $T/aussen/bestand/a.png ]]'
pruefe "kein Datumsordner unberührt" '[[ -e $TOUR/stand/a.png ]]'
pruefe "Ausgabe nennt nur den alten Lauf" '[[ $AUSGABE == "Rundgang: Bilder in 2026-01-01 gelöscht (älter als 8 Wochen)" ]]'
pruefe "leerer Tour-Ordner ohne Fehler" 'rundgang_ausduennen $T/leer >/dev/null'
exit $fehler
