#!/bin/zsh
# Release unter Tage nach fehlgeschlagenem Nachtlauf (Maintainer 15.11.2026, ENTSCHEIDUNGEN.md „Director entscheidet
# nach fehlgeschlagenem Nachtlauf selbst über ein Release unter Tage“). Einziger Weg, auf dem die Tagesroutine
# veröffentlichen darf; der Director entscheidet vorher, ob es sich lohnt (tests/tagesroutine-auftrag.md,
# docs/release.md „Release unter Tage“). Das Skript erzwingt die unveränderten Bedingungen und ruft dann
# NUR_CI=1 ./release.sh <version> und ./publish.sh <version> <notizen> auf – nie SKIP_TESTS, nie eine Marke von Hand.
#   tests/release-unter-tage.sh --pruefen <version> <notizen>   nur die Bedingungen prüfen, nichts ändern
#   tests/release-unter-tage.sh <version> <notizen>             prüfen, dann release.sh und publish.sh
#   tests/release-unter-tage.sh --volldampf [--pruefen] <version> <notizen>
#     Volldampf (Maintainer 17.11.2026, Wortlaut in ENTSCHEIDUNGEN.md: „volldampf bedeutet maximale produktivität …
#     das betrifft … die anzahl der releases, einfach alles.“): nur bei aktiver Volldampf-Zeile (volldampf_aktiv);
#     dann entfallen „letzter Nachtlauf ohne Release“ und „höchstens ein Release pro Tag“. Alles andere unverändert.
#     Aufruf von tests/zwischen-release.zsh nach Push und grüner CI samt Windows.
# Bedingungen (eine nicht erfüllt: „ABBRUCH: <Grund>“, Exitcode 1, nichts veröffentlicht):
#   - 09:00 bis 22:00 Wiener Zeit (nie in der Push-Sperre 01:30–09:00)
#   - tests/release-nachtlauf-gescheitert.sh meldet „ja“ (letzter Nachtlauf ohne Release)
#   - heute noch kein Release (höchstens ein reguläres Release pro Tag)
#   - kein CI-Lauf (Runner.Worker), kein Testlauf, keine andere Sitzung am Repo, kein Nachtlauf (belegt())
#   - Zweig main, nichts Ungespeichertes, origin/main in main enthalten und die lokalen Commits darüber ohne
#     Thunderbird-Änderung (nur README, Doku – sonst würde publish.sh Ungeprüftes mitschieben)
#   - Version x.y.z höher als das letzte Release, Tag noch frei, „What's new in x.y.z“ im README (eigener Commit),
#     englische Notizdatei vorhanden
# Danach release.sh mit NUR_CI=1: ohne vollständig grüne CI samt Windows keine Marke, kein Release.
# Zum Proben: HALO_JETZT=HHMM, HALO_VOLLDAMPF_JETZT=<ISO-Zeit> (Uhr für volldampf_aktiv), HALO_BERICHTE, HALO_GESCHEITERT=<Zeile statt des Skripts>, HALO_BELEGT=<Grund|leer>.
emulate -L zsh
export TZ=Europe/Vienna
HIER=${0:A:h}
REPO=${HALO_REPO:-${HIER:h}}
PRUEFEN= VOLLDAMPF=
[[ $1 == --volldampf ]] && { VOLLDAMPF=1; shift }
[[ $1 == --pruefen ]] && { PRUEFEN=1; shift }
VERSION=$1 NOTIZEN=$2
abbruch() { print -r -- "ABBRUCH: $1 – kein Release unter Tage"; exit 1 }
[[ -n $VERSION && -n $NOTIZEN ]] || { print -u2 "Aufruf: ${0:t} [--volldampf] [--pruefen] <version> <notizen.md>"; exit 2 }
cd $REPO || abbruch "kein Checkout unter $REPO"

# Uhrzeit
J=${HALO_JETZT:-$(date +%H%M)}; J=$((10#$J))
(( J >= 900 && J < 2200 )) || abbruch "nur zwischen 09:00 und 22:00 (jetzt $(printf %04d $J))"
HEUTE=$(date +%F) BER=${HALO_BERICHTE:-$HOME/halo-berichte}
if [[ -n $VOLLDAMPF ]]; then
  # Volldampf: nur mit aktiver Zeile in ~/halo-nacht/volldampf.txt (beendet beim Wochenlimit = normale Regeln)
  # HALO_JETZT ist hier HHMM; die Volldampf-Uhr (ISO) nur zum Proben über HALO_VOLLDAMPF_JETZT
  G=$(LOG=/dev/null; source $HIER/lauf-hilfen.zsh; HALO_JETZT=${HALO_VOLLDAMPF_JETZT:-} volldampf_aktiv) || abbruch "Volldampf nicht aktiv (--volldampf nur mit Volldampf-Zeile)"
  G="Volldampf $G"
else
  # letzter Nachtlauf ohne Release?
  G=${HALO_GESCHEITERT:-$(zsh $HIER/release-nachtlauf-gescheitert.sh)}
  [[ $G == ja* ]] || abbruch "letzter Nachtlauf nicht ohne Release ($G)"
  # höchstens ein Release pro Tag (im Volldampf nicht)
  R=($BER/$HEUTE-halo.spaces-*.md(N))
  (( $#R )) && abbruch "heute schon ein Release (${R[1]:t})"
fi
# belegt? (CI, Testlauf, andere Sitzung, Ungespeichertes, release.sh/publish.sh; dazu der Nachtlauf)
if [[ -n ${HALO_BELEGT+x} ]]; then GR=$HALO_BELEGT
else
  LOG=/dev/null; source $HIER/lauf-hilfen.zsh
  GR=$(belegt) || GR=
  [[ -z $GR && -e $HOME/halo-nacht/lauf.lock ]] && kill -0 $(<$HOME/halo-nacht/lauf.lock) 2>/dev/null && GR="Nachtlauf läuft"
fi
[[ -z $GR ]] || abbruch "neon belegt: $GR"
git fetch -q --tags origin main 2>/dev/null || abbruch "git fetch gescheitert"
LETZT=$(git tag -l 'v[0-9]*' --sort=-v:refname | head -1)
[[ -n $LETZT ]] || abbruch "kein Release-Tag gefunden"
[[ -z $VOLLDAMPF && $(git log -1 --format=%cd --date=format-local:%F $LETZT) == $HEUTE ]] && abbruch "heute schon ein Release ($LETZT)"
# Stand: main, sauber, origin/main enthalten, darüber nur Commits ohne Thunderbird-Änderung
# im Volldampf auch der Worktree-Zweig des Wächters (Upstream origin/main, tests/zwischen-schleife.zsh)
[[ $(git rev-parse --abbrev-ref HEAD) == main || ( -n $VOLLDAMPF && $(git rev-parse --abbrev-ref @{upstream} 2>/dev/null) == origin/main ) ]] \
  || abbruch "nicht auf Zweig main"
[[ -z $(git status --porcelain --untracked-files=no) ]] || abbruch "ungespeicherte Änderungen im Repo"
git merge-base --is-ancestor origin/main HEAD || abbruch "origin/main ist nicht in main enthalten (erst abgleichen)"
zsh tests/ci-noetig.sh origin/main HEAD && abbruch "lokale Commits über origin/main ändern Thunderbird (ungeprüft, der Nachtlauf nimmt sie mit)"
# Version, README, Notizen
[[ $VERSION == <->.<->.<-> ]] || abbruch "Version „$VERSION“ ist nicht x.y.z"
[[ $(print -l ${LETZT#v} $VERSION | sort -V | tail -1) == $VERSION && v$VERSION != $LETZT ]] || abbruch "Version $VERSION nicht höher als $LETZT"
git rev-parse -q --verify "v$VERSION" >/dev/null && abbruch "Tag v$VERSION gibt es schon"
git show HEAD:README.md | grep -qF "What's new in $VERSION" || abbruch "README ohne „What's new in $VERSION“ (eigener Commit „README: Versionshinweise $VERSION“)"
[[ -s $NOTIZEN ]] || abbruch "Notizdatei $NOTIZEN fehlt oder ist leer"
print -r -- "OK: Bedingungen erfüllt ($G; letztes Release $LETZT)"
[[ -n $PRUEFEN ]] && exit 0

NUR_CI=1 ./release.sh $VERSION || abbruch "release.sh $VERSION gescheitert (keine vollständig grüne CI samt Windows oder Update-Test rot)"
grep -q '^test=.*Windows: Lauf' dist/release-$VERSION.ok 2>/dev/null || abbruch "Testmarke ohne grünen Windows-Lauf"
./publish.sh $VERSION $NOTIZEN
