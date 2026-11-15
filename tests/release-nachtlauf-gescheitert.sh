#!/bin/zsh
# Ist der letzte Nachtlauf ohne Release geblieben? (Maintainer 15.11.2026, ENTSCHEIDUNGEN.md „Director entscheidet
# nach fehlgeschlagenem Nachtlauf selbst über ein Release unter Tage“). Reine Fakten, ohne Sprachmodell; die
# Tagesroutine ruft das in ihrer ersten Plan-Runde auf, der Director entscheidet danach (tests/tagesroutine-auftrag.md).
#   tests/release-nachtlauf-gescheitert.sh [<datum JJJJ-MM-TT>]   (Standard: heute, Wiener Zeit)
# Ausgabe genau eine Zeile:
#   ja <Grund>     Bericht <datum>-nachtlauf.md sagt in „Kurz:“ „kein Release“, oder kein Release an diesem Tag
#                  (kein Tag v* und kein Release-Bericht), obwohl seit dem letzten Release Thunderbird-Änderungen
#                  auf origin/main liegen (tests/ci-noetig.sh)
#   nein <Grund>   kein Nachtlauf-Bericht, Release erschienen oder nichts zu veröffentlichen
# Exitcode immer 0. Zum Proben: HALO_BERICHTE (Ordner der Berichte), HALO_REPO (Checkout).
emulate -L zsh
export TZ=Europe/Vienna
TAG=${1:-$(date +%F)}
BERICHTE=${HALO_BERICHTE:-$HOME/halo-berichte}
REPO=${HALO_REPO:-${0:A:h:h}}
B=$BERICHTE/$TAG-nachtlauf.md

[[ -r $B ]] || { print -r -- "nein kein Nachtlauf-Bericht $TAG"; exit 0 }
KURZ=$(grep -m1 '^Kurz:' $B)
if [[ ${KURZ:l} == *"kein release"* ]]; then
  print -r -- "ja Nachtlauf-Bericht $TAG: ${${KURZ#Kurz: }[1,160]}"; exit 0
fi
# Release an diesem Tag erschienen? Bericht von publish.sh oder Release-Tag mit Commit-Datum an diesem Tag
R=($BERICHTE/$TAG-halo.spaces-*.md(N))
(( $#R )) && { print -r -- "nein Release erschienen (${${R[1]:t:r}#$TAG-})"; exit 0 }
[[ -d $REPO/.git || -f $REPO/.git ]] || { print -r -- "nein kein Checkout unter $REPO"; exit 0 }
LETZT=$(git -C $REPO tag -l 'v[0-9]*' --sort=-v:refname 2>/dev/null | head -1)
[[ -n $LETZT ]] || { print -r -- "nein kein Release-Tag gefunden"; exit 0 }
DATUM=$(git -C $REPO log -1 --format=%cd --date=format-local:%F $LETZT 2>/dev/null)
[[ $DATUM == $TAG ]] && { print -r -- "nein Release $LETZT erschienen"; exit 0 }
BIS=origin/main
git -C $REPO rev-parse -q --verify $BIS >/dev/null || BIS=HEAD
if ( cd $REPO && zsh tests/ci-noetig.sh $LETZT $BIS ) >/dev/null 2>&1; then
  print -r -- "ja kein Release seit $LETZT ($DATUM), Thunderbird-Änderungen auf $BIS"
else
  print -r -- "nein seit $LETZT nichts für Thunderbird geändert"
fi
exit 0
