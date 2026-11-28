#!/bin/zsh
# Release aus eigenem Worktree auf sauberem origin/main (Umbau P5, Maintainer 27.11.2026 „ja ja“ zur Sammelfrage S5,
# ENTSCHEIDUNGEN.md). Nur mit dem Schalter HALO_RELEASE_WORKTREE=1; ohne ihn bleibt alles beim alten Weg (Aufruf in
# ~/halo-spaces auf main). Lokale, ungeprüfte Commits und Änderungen in ~/halo-spaces kommen so nicht ins Release.
#   zsh tests/release-worktree.zsh anlegen <version>   git fetch origin main, Worktree ~/halo-release-<version> (Zweig
#       rel/<version>, Upstream origin/main) auf origin/main, repo.conf hineinkopieren; ~/halo-spaces bleibt unberührt
#   zsh tests/release-worktree.zsh pruefen [--release-dateien]   im aktuellen Checkout: verknüpfter Worktree (nicht
#       der Hauptordner), eigener Zweig (nicht main, nicht losgelöst), Upstream origin/main, origin/main enthalten, die
#       Commits darüber ohne Thunderbird-Änderung (tests/ci-noetig.sh), nichts Ungespeichertes. Mit --release-dateien
#       (publish.sh) dürfen nur extension/manifest.json, updates.json und README.md geändert sein (von release.sh).
# Ausgabe eine Zeile „OK: …“ bzw. „ABBRUCH: …“, Exitcode 0 bzw. 1. Lockert keine Sperre: Testmarke, Push-Sperre,
# ein Release pro Tag und Zeitfenster prüfen release.sh, publish.sh und tests/release-unter-tage.sh wie bisher.
# Zum Proben: HALO_RW_ZIEL=<Ordner statt ~/halo-release-<version>>, HALO_REPO=<Hauptcheckout>.
emulate -L zsh
HIER=${0:A:h}
abbruch() { print -r -- "ABBRUCH: $1 (Release aus Worktree)"; exit 1 }

case $1 in
anlegen)
  VERSION=$2
  [[ $VERSION == <->.<->.<-> ]] || abbruch "Version „$VERSION“ ist nicht x.y.z"
  REPO=${HALO_REPO:-${HIER:h}}
  ZIEL=${HALO_RW_ZIEL:-$HOME/halo-release-$VERSION}
  ZWEIG=rel/$VERSION
  [[ -e $ZIEL ]] && abbruch "$ZIEL gibt es schon"
  git -C $REPO rev-parse -q --verify "refs/heads/$ZWEIG" >/dev/null && abbruch "Zweig $ZWEIG gibt es schon"
  git -C $REPO fetch -q origin main 2>/dev/null || abbruch "git fetch gescheitert"
  git -C $REPO worktree add -q -b $ZWEIG $ZIEL origin/main 2>&1 || abbruch "git worktree add gescheitert"
  git -C $ZIEL branch -q --set-upstream-to=origin/main $ZWEIG || abbruch "Upstream origin/main nicht gesetzt"
  [[ -f $REPO/repo.conf ]] && cp -p $REPO/repo.conf $ZIEL/repo.conf
  print -r -- "OK: Worktree $ZIEL auf origin/main $(git -C $ZIEL rev-parse --short HEAD) (Zweig $ZWEIG); dort HALO_RELEASE_WORKTREE=1 ./release.sh $VERSION"
  ;;
pruefen)
  ERLAUBT=
  [[ $2 == --release-dateien ]] && ERLAUBT=1
  W=$(git rev-parse --show-toplevel 2>/dev/null) || abbruch "kein Git-Checkout"
  GD=$(git rev-parse --absolute-git-dir) GC=$(cd "$(git rev-parse --git-common-dir)" && pwd -P)
  [[ ${GD:A} != ${GC:A} ]] || abbruch "$W ist der Hauptordner, kein eigener Worktree (zsh tests/release-worktree.zsh anlegen <version>)"
  Z=$(git symbolic-ref -q --short HEAD) || abbruch "losgelöster HEAD, kein Zweig"
  [[ $Z != main ]] || abbruch "Zweig main im Worktree"
  [[ $(git rev-parse --abbrev-ref $Z@{upstream} 2>/dev/null) == origin/main ]] || abbruch "Upstream von $Z ist nicht origin/main"
  git merge-base --is-ancestor origin/main HEAD || abbruch "origin/main ist nicht in $Z enthalten (erst abgleichen)"
  zsh $W/tests/ci-noetig.sh origin/main HEAD && abbruch "Commits über origin/main ändern Thunderbird (ungeprüft)"
  AEND=$(git status --porcelain --untracked-files=no)
  [[ -n $ERLAUBT ]] && AEND=$(print -r -- "$AEND" | grep -vE '^.. (extension/manifest\.json|updates\.json|README\.md)$')
  [[ -z $AEND ]] || abbruch "ungespeicherte Änderungen: $(print -r -- "$AEND" | awk '{print $2}' | tr '\n' ' ')"
  print -r -- "OK: Worktree $W, Zweig $Z auf origin/main $(git rev-parse --short origin/main), $(git rev-list --count origin/main..HEAD) Commit(s) darüber ohne Thunderbird-Änderung"
  ;;
*)
  print -u2 "Aufruf: ${0:t} anlegen <version> | pruefen [--release-dateien]"; exit 2 ;;
esac
