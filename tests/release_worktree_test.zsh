#!/bin/zsh
# Prüft das Release aus eigenem Worktree (tests/release-worktree.zsh, Schalter HALO_RELEASE_WORKTREE=1 in release.sh,
# publish.sh und tests/release-unter-tage.sh) ohne Netz, ohne Thunderbird und ohne echte Veröffentlichung: alles in einem
# Wegwerf-Repo unter mktemp (eigenes „origin“ als leeres Repo, gh und curl als Attrappen, HOME umgebogen, damit kein
# Bericht in ~/halo-berichte landet). Kern: lokale, ungepushte Commits und Änderungen im Hauptordner kommen nicht mit.
#   zsh tests/release_worktree_test.zsh   eine Zeile OK/FEHLER je Fall, Exitcode 1 bei einem Fehler
emulate -L zsh
HIER=${0:A:h}
T=$(mktemp -d) || exit 1
T=${T:A}
trap 'rm -rf $T' EXIT
FEHLER=0
pruefe() {   # <Name> <Ausgabe> <Muster …>  (alle Muster müssen vorkommen, grep -E)
  local name=$1 aus=$2 m; shift 2
  for m in "$@"; do
    if ! print -r -- "$aus" | grep -qE -- "$m"; then
      print -r -- "FEHLER  $name – fehlt: $m"; FEHLER=1
      print -r -- "$aus" | sed 's/^/    /'; return
    fi
  done
  print -r -- "OK      $name"
}
export GIT_AUTHOR_NAME=Probe GIT_AUTHOR_EMAIL=probe@example.invalid GIT_COMMITTER_NAME=Probe GIT_COMMITTER_EMAIL=probe@example.invalid
export GIT_CONFIG_NOSYSTEM=1 GIT_CONFIG_GLOBAL=/dev/null

# --- Wegwerf-Repo: origin (bare) und Hauptordner „haupt“ (wie ~/halo-spaces) ---
git init -q --bare -b main $T/origin.git
git init -q -b main $T/haupt
H=$T/haupt
mkdir -p $H/tests $H/extension
cp $HIER/release-worktree.zsh $HIER/ci-noetig.sh $HIER/release-unter-tage.sh $H/tests/
cp $HIER/../release.sh $HIER/../publish.sh $H/
print -l 'dist/' 'repo.conf' > $H/.gitignore
print -r -- '# Probe' > $H/README.md
print -r -- 'alt' > $H/extension/code.js
cat > $H/extension/manifest.json <<'J'
{"version": "1.0.0", "browser_specific_settings": {"gecko": {"id": "probe@example.invalid", "update_url": "https://raw.githubusercontent.com/probe/attrappe/main/updates.json"}}}
J
print -r -- '{"addons": {}}' > $H/updates.json
print -r -- 'GITHUB_REPO="probe/attrappe"' > $H/repo.conf
git -C $H add -A
GIT_COMMITTER_DATE=2026-01-01T12:00:00 git -C $H commit -q --date=2026-01-01T12:00:00 -m 'Start'
git -C $H tag v1.0.0
git -C $H remote add origin $T/origin.git
git -C $H push -q origin main --tags
git -C $H branch -q --set-upstream-to=origin/main main
BASIS=$(git -C $H rev-parse HEAD)

# Hauptordner wie am 22.11.2026: ein lokaler, ungeprüfter Commit mit Thunderbird-Änderung und Ungespeichertes
print -r -- 'ungeprueft' > $H/extension/code.js
git -C $H commit -q -am 'Mailkopf: ungeprüfter lokaler Commit'
LOKAL=$(git -C $H rev-parse HEAD)
print -r -- 'halbfertig' >> $H/README.md

# --- Schalter im Hauptordner: kein eigener Worktree → Abbruch, nichts geändert ---
pruefe "pruefen im Hauptordner → ABBRUCH" "$(cd $H && zsh tests/release-worktree.zsh pruefen; print rc=$?)" \
  'ABBRUCH: .* ist der Hauptordner, kein eigener Worktree' 'rc=1'
pruefe "release.sh mit Schalter im Hauptordner → ABBRUCH vor jeder Änderung" \
  "$(cd $H && HALO_RELEASE_WORKTREE=1 zsh ./release.sh 1.1.0; print rc=$?; [[ -e dist ]] && print dist-angelegt; git diff --quiet -- extension/manifest.json updates.json && print manifest-unberuehrt)" \
  'ABBRUCH: .*Hauptordner' 'rc=1' 'manifest-unberuehrt'
pruefe "release.sh mit Schalter: kein dist/ angelegt" "$([[ -e $H/dist ]] && print ja || print nein)" '^nein$'

# --- anlegen: Worktree auf origin/main, nicht auf dem lokalen HEAD des Hauptordners ---
W=$T/rel
A() { HALO_REPO=$H HALO_RW_ZIEL=$W zsh $H/tests/release-worktree.zsh anlegen $1 2>&1; print rc=$? }
pruefe "anlegen 1.x → ABBRUCH bei falscher Version" "$(A 1.x)" 'ABBRUCH: Version' 'rc=1'
pruefe "anlegen 1.1.0 → OK" "$(A 1.1.0)" '^OK: Worktree .*rel auf origin/main' 'rc=0'
pruefe "Worktree steht auf origin/main, nicht auf dem lokalen Commit" \
  "$(git -C $W rev-parse HEAD; git -C $W merge-base --is-ancestor $LOKAL HEAD && print lokal-drin || print lokal-draussen)" "^$BASIS\$" '^lokal-draussen$'
pruefe "Zweig rel/1.1.0 mit Upstream origin/main, repo.conf kopiert" \
  "$(git -C $W symbolic-ref --short HEAD; git -C $W rev-parse --abbrev-ref @{upstream}; cat $W/repo.conf)" '^rel/1\.1\.0$' '^origin/main$' 'GITHUB_REPO="probe/attrappe"'
pruefe "Hauptordner unberührt (HEAD, Zweig, Ungespeichertes)" \
  "$(git -C $H rev-parse HEAD; git -C $H symbolic-ref --short HEAD; git -C $H status --porcelain --untracked-files=no)" "^$LOKAL\$" '^main$' '^ M README\.md$'
pruefe "anlegen ein zweites Mal → ABBRUCH" "$(A 1.1.0)" 'ABBRUCH: .*gibt es schon' 'rc=1'
P() { (cd $W && zsh tests/release-worktree.zsh pruefen $1 2>&1; print rc=$?) }
pruefe "pruefen im frischen Worktree → OK" "$(P)" '^OK: Worktree .*Zweig rel/1\.1\.0 .*0 Commit' 'rc=0'

# README-Commit (nur Doku) ist erlaubt
print -l '# Probe' '' "## What's new in 1.1.0" '- Probe' > $W/README.md
git -C $W commit -q -am 'README: Versionshinweise 1.1.0'
pruefe "README-Commit über origin/main → OK" "$(P)" '^OK: .*1 Commit' 'rc=0'
print -r -- 'x' > $W/tests/zettel.txt; git -C $W add tests/zettel.txt
pruefe "ungespeicherte Änderung → ABBRUCH" "$(P)" 'ABBRUCH: ungespeicherte Änderungen: tests/zettel\.txt' 'rc=1'
git -C $W rm -q --cached tests/zettel.txt; rm $W/tests/zettel.txt

# --- release-unter-tage.sh: mit Schalter statt „nicht auf Zweig main“ der Worktree-Weg; alle übrigen Sperren bleiben ---
print -r -- 'Probe notes' > $T/notes.md
mkdir -p $T/b
RUT() { (cd $1 && HALO_RELEASE_WORKTREE=${SCH-1} HALO_BERICHTE=$T/b HALO_GESCHEITERT=${GS:-ja Test} HALO_BELEGT= HALO_JETZT=${JZ:-1000} \
          zsh tests/release-unter-tage.sh --pruefen 1.1.0 $T/notes.md 2>&1; print rc=$?) }
pruefe "unter Tage, Schalter, Worktree → Bedingungen erfüllt" "$(RUT $W)" '^OK: Bedingungen erfüllt' 'rc=0'
pruefe "unter Tage, ohne Schalter im Worktree → wie bisher „nicht auf Zweig main“" "$(SCH= RUT $W)" 'ABBRUCH: nicht auf Zweig main' 'rc=1'
pruefe "unter Tage, Schalter im Hauptordner → ABBRUCH" "$(RUT $H)" 'ABBRUCH: .*Hauptordner' 'rc=1'
pruefe "unter Tage, Schalter: Push-Sperre 08:00 bleibt" "$(JZ=0800 RUT $W)" 'ABBRUCH: nur zwischen 09:00 und 22:00' 'rc=1'
pruefe "unter Tage, Schalter: nach 22:00 bleibt gesperrt" "$(JZ=2215 RUT $W)" 'ABBRUCH: nur zwischen' 'rc=1'
pruefe "unter Tage, Schalter: Nachtlauf mit Release sperrt weiter" "$(GS='nein Release erschienen' RUT $W)" 'ABBRUCH: letzter Nachtlauf nicht ohne Release' 'rc=1'
HEUTE=$(TZ=Europe/Vienna date +%F)
: > $T/b/$HEUTE-halo.spaces-9.9.9.md
pruefe "unter Tage, Schalter: höchstens ein Release pro Tag bleibt" "$(RUT $W)" 'ABBRUCH: heute schon ein Release' 'rc=1'
rm $T/b/$HEUTE-halo.spaces-9.9.9.md

# --- publish.sh im Worktree, mit Attrappen statt GitHub (kein Netz) ---
# Ergebnis von release.sh nachstellen: Version im Manifest, updates.json, Paket und Testmarke (hier von Hand, nur im Wegwerf-Repo)
mkdir -p $W/dist $T/home $T/bin
print -r -- 'paket' > $W/dist/halo-spaces-1.1.0.xpi
HASH=$(shasum -a 256 $W/dist/halo-spaces-1.1.0.xpi | cut -d' ' -f1)
python3 - $W $HASH <<'PY'
import json, sys
w, h = sys.argv[1:3]
p = w + "/extension/manifest.json"; m = json.load(open(p)); m["version"] = "1.1.0"; json.dump(m, open(p, "w"))
json.dump({"addons": {"probe@example.invalid": {"updates": [{"version": "1.1.0",
  "update_link": "https://github.com/probe/attrappe/releases/download/v1.1.0/halo-spaces-1.1.0.xpi",
  "update_hash": "sha256:" + h}]}}}, open(w + "/updates.json", "w"))
PY
print -l version=1.1.0 sha256=$HASH zeit=probe 'test=Probe' > $W/dist/release-1.1.0.ok
cat > $T/bin/gh <<G
#!/bin/zsh
print -r -- "gh \$*" >> $T/gh.log
G
cat > $T/bin/curl <<C
#!/bin/zsh
for a; do U=\$a; done
case \$U in
  *releases/download/*) cat $W/dist/halo-spaces-1.1.0.xpi ;;
  *updates.json*) git -C $T/origin.git show main:updates.json ;;
  *) exit 22 ;;
esac
C
chmod +x $T/bin/gh $T/bin/curl
PUB() { (cd $W && HALO_RELEASE_WORKTREE=1 HOME=$T/home PATH=$T/bin:$PATH zsh ./publish.sh 1.1.0 $T/notes.md 2>&1; print rc=$?) }

print -r -- 'fremd' > $W/extension/code.js
pruefe "publish.sh: fremde Änderung im Worktree → ABBRUCH vor Commit und Push" \
  "$(PUB; git -C $T/origin.git rev-parse main; [[ -e $T/gh.log ]] && print gh-aufgerufen)" \
  'ABBRUCH: ungespeicherte Änderungen: extension/code\.js' 'rc=1' "^$BASIS\$"
pruefe "publish.sh: kein gh-Aufruf nach Abbruch" "$([[ -e $T/gh.log ]] && print ja || print nein)" '^nein$'
git -C $W checkout -q -- extension/code.js

AUS=$(PUB)
pruefe "publish.sh im Worktree → veröffentlicht (Attrappe)" "$AUS" 'Veröffentlicht – Hash geprüft' 'Update-Liste geprüft' 'rc=0'
pruefe "origin/main = Release-Commit über README-Commit über dem alten Stand" \
  "$(git -C $T/origin.git log --format=%s main | head -3)" '^halo\.spaces 1\.1\.0$' '^README: Versionshinweise 1\.1\.0$' '^Start$'
pruefe "lokaler ungeprüfter Commit des Hauptordners nicht auf origin/main" \
  "$(git -C $H fetch -q origin; git -C $H merge-base --is-ancestor $LOKAL origin/main && print drin || print draussen)" '^draussen$'
pruefe "Release-Commit enthält nur Release-Dateien" \
  "$(git -C $T/origin.git show --name-only --format= main)" '^extension/manifest\.json$' '^updates\.json$'
pruefe "Release-Commit ohne extension/code.js" "$(git -C $T/origin.git show --name-only --format= main | grep -c code.js)" '^0$'
pruefe "kein Zweig rel/… auf origin" "$(git -C $T/origin.git branch --list 'rel/*' | grep -c .)" '^0$'
pruefe "gh release create v1.1.0 aufgerufen (Attrappe)" "$(cat $T/gh.log)" '^gh release create v1\.1\.0 .*halo-spaces-1\.1\.0\.xpi'
pruefe "Bericht im umgebogenen HOME, mit Worktree-Vermerk" "$(cat $T/home/halo-berichte/*-halo.spaces-1.1.0.md)" \
  'veröffentlicht' 'gepusht: .* auf rel/1\.1\.0 \(Worktree .*rel, Upstream origin/main\)'
pruefe "Hauptordner nach dem Release unberührt" \
  "$(git -C $H rev-parse HEAD; git -C $H status --porcelain --untracked-files=no)" "^$LOKAL\$" '^ M README\.md$'

# --- weitere Abbrüche von pruefen ---
print -r -- 'neu' > $W/extension/code.js; git -C $W commit -q -am 'Mailkopf: neu im Worktree'
pruefe "Commit mit Thunderbird-Änderung über origin/main → ABBRUCH" "$(P)" 'ABBRUCH: Commits über origin/main ändern Thunderbird' 'rc=1'
git -C $W reset -q --hard origin/main
git -C $W branch -q --set-upstream-to=origin/rel-x 2>/dev/null || git -C $W branch -q --unset-upstream
pruefe "Upstream nicht origin/main → ABBRUCH" "$(P)" 'ABBRUCH: Upstream von rel/1\.1\.0 ist nicht origin/main' 'rc=1'
git -C $W branch -q --set-upstream-to=origin/main
git -C $W checkout -q --detach
pruefe "losgelöster HEAD → ABBRUCH" "$(P)" 'ABBRUCH: losgelöster HEAD' 'rc=1'
git -C $W checkout -q rel/1.1.0
git -C $W fetch -q origin; git -C $H fetch -q origin
git -C $W reset -q --hard $BASIS
pruefe "origin/main nicht enthalten → ABBRUCH" "$(P)" 'ABBRUCH: origin/main ist nicht in rel/1\.1\.0 enthalten' 'rc=1'

# --- alter Weg unverändert: ohne Schalter dieselben Befehle wie vorher ---
pruefe "publish.sh ohne Schalter: Push wie bisher (ohne push.default)" "$(grep -c '^PUSH=(git -c http.postBuffer=157286400 push -q)$' $HIER/../publish.sh)" '^1$'
pruefe "Schalter nur als HALO_RELEASE_WORKTREE == 1" \
  "$(grep -h 'HALO_RELEASE_WORKTREE' $HIER/../release.sh $HIER/../publish.sh $HIER/release-unter-tage.sh | grep -vE '^ *#' | grep -vE 'HALO_RELEASE_WORKTREE\"? == 1' | grep -c .)" '^0$'
pruefe "publish.sh: kein '[[ … ]] && echo' in einer Ersetzung ohne Schalter (set -e brach nach dem Push ab)" \
  "$(grep -v '^ *#' $HIER/../publish.sh | grep -cE '\$\(\[\[[^)]*HALO_RELEASE_WORKTREE[^)]*\]\] && echo')" '^0$'
pruefe "keine Sperre entfernt (Testmarke, NUR_CI, Zeitfenster, ein Release pro Tag)" \
  "$(grep -c 'ABBRUCH: keine Testmarke' $HIER/../publish.sh; grep -c 'NUR_CI\" && -z \"\$CI_OK\" ]] && fehlschlag' $HIER/../release.sh; grep -c 'nur zwischen 09:00 und 22:00' $HIER/release-unter-tage.sh; grep -c 'heute schon ein Release' $HIER/release-unter-tage.sh)" \
  '^1$' '^1$' '^1$' '^2$'

exit $FEHLER
