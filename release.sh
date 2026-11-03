#!/bin/zsh
# Bereitet eine neue Version für GitHub vor – veröffentlicht selbst nichts.
#   ./release.sh 2.11.0
# Braucht repo.conf mit:  GITHUB_REPO="besitzer/repo"
# Danach ./publish.sh <version> <notes.md> – lädt genau dieses Paket hoch.
# Nur wenn alle Tests (hell, dunkel) grün sind, schreibt release.sh die
# Marke dist/release-<version>.ok (Version, Hash des Pakets, Tests) – ohne sie
# veröffentlicht publish.sh nicht.
set -e
setopt pipefail
ROOT="${0:A:h}"
cd "$ROOT"
VERSION="$1"
[[ -z "$VERSION" ]] && { echo "Aufruf: ./release.sh <version>  (z. B. 2.11.0)"; exit 1; }
[[ -f repo.conf ]] || { echo "repo.conf fehlt (GITHUB_REPO=\"besitzer/repo\")"; exit 1; }
source ./repo.conf
[[ -z "$GITHUB_REPO" ]] && { echo "GITHUB_REPO in repo.conf fehlt"; exit 1; }
BRANCH="${GITHUB_BRANCH:-main}"
MARK="dist/release-$VERSION.ok"
LOG="dist/release-$VERSION.log"
mkdir -p dist
rm -f "$MARK"
: > "$LOG"
TESTS=()                               # was gelaufen ist, für Marke und Bericht

# bei einem Fehler: Manifest und updates.json zurück auf den letzten Commit, keine Marke
fehlschlag() {
  echo "$1"
  git checkout -q -- extension/manifest.json updates.json 2>/dev/null || true
  rm -f "$MARK"
  exit 1
}

# Tests überspringen, wenn die CI (Linux, Mac, Windows) denselben Stand schon
# vollständig grün getestet hat: Seitdem darf sich nichts geändert haben, was ins
# Paket oder in die Tests eingeht (erlaubt: *.md, release.sh, publish.sh, store/),
# und es darf nichts Ungespeichertes herumliegen
if [[ -z "$SKIP_TESTS" && -z "$FORCE_TESTS" ]] && command -v gh >/dev/null; then
  if [[ -z "$(git status --porcelain --untracked-files=no)" ]]; then
    for SHA in $(gh run list -R "$GITHUB_REPO" -w test.yml -b "$BRANCH" -s success -L 20 \
                   --json headSha --jq '.[].headSha' 2>/dev/null); do
      git merge-base --is-ancestor "$SHA" HEAD 2>/dev/null || continue
      if git diff --name-only "$SHA" HEAD | grep -qvE '\.md$|^(release|publish)\.sh$|^store/'; then
        break                              # Code seit dem grünen Lauf geändert
      fi
      RUN=$(gh run list -R "$GITHUB_REPO" -w test.yml -c "$SHA" -s success -L 1 --json databaseId --jq '.[0].databaseId')
      if gh run view "$RUN" -R "$GITHUB_REPO" --json jobs --jq '[.jobs[].name] | index("mac") != null and index("windows") != null' | grep -q true; then
        echo "CI-Lauf $RUN für ${SHA:0:7} ist vollständig grün (Linux, Mac, Windows) – Tests übersprungen (FORCE_TESTS=1 testet trotzdem)"
        SKIP_TESTS=1
        CI_OK=1
        TESTS+=("CI-Lauf $RUN für ${SHA:0:7} grün: Linux (Release, Beta, ESR), Mac (hell, dunkel), Windows")
      fi
      break
    done
  fi
fi

# Version und Update-Adresse ins Manifest
python3 - "$VERSION" "$GITHUB_REPO" "$BRANCH" <<'PY'
import json, sys
version, repo, branch = sys.argv[1:4]
p = "extension/manifest.json"
m = json.load(open(p))
m["version"] = version
m["browser_specific_settings"]["gecko"]["update_url"] = f"https://raw.githubusercontent.com/{repo}/{branch}/updates.json"
json.dump(m, open(p, "w"), indent=2, ensure_ascii=False)
open(p, "a").write("\n")
PY

XPI=$(./build.sh)
HASH=$(shasum -a 256 "$XPI" | cut -d' ' -f1)

# vorher automatisch testen (frisches Testprofil) – bei Fehlern kein Release
# Screenshots hell und dunkel landen in tests/shots/<version> und werden mit
# denen des letzten Release verglichen (rote Markierungen in …-diff.png)
if [[ -z "$SKIP_TESTS" ]]; then
  SHOTS="tests/shots/$VERSION"
  OLD=(tests/shots/*(N/n))             # numerisch sortiert, letzter = neueste Version
  OLD=(${OLD:#tests/shots/$VERSION})
  PREV=${OLD[-1]}
  rm -rf "$SHOTS"
  CMP=()
  [[ -n "$PREV" ]] && CMP=(--compare "$PREV")
  for MODE in "" --dark; do
    python3 tests/halo_test.py --xpi "$XPI" $MODE --shots "$SHOTS" "${CMP[@]}" 2>&1 | tee -a "$LOG" \
      || fehlschlag "Tests $([[ -n $MODE ]] && echo dunkel || echo hell) fehlgeschlagen – kein Release, keine Marke (Manifest zurückgesetzt)"
    TESTS+=("$([[ -n $MODE ]] && echo dunkel || echo hell): $(grep -E '^[0-9]+ von [0-9]+ Prüfungen' "$LOG" | tail -1)")
  done
  # Beta läuft nur noch unter Linux in der CI (Entscheidung vom 3.11.2026)
fi
ID=$(python3 -c "import json; print(json.load(open('extension/manifest.json'))['browser_specific_settings']['gecko']['id'])")
MIN=$(python3 -c "import json; print(json.load(open('extension/manifest.json'))['browser_specific_settings']['gecko'].get('strict_min_version','153.0'))")

# updates.json: Thunderbird fragt diese Datei regelmäßig ab (Standard: alle 24 h)
python3 - "$ID" "$VERSION" "$GITHUB_REPO" "$XPI" "$HASH" "$MIN" <<'PY'
import json, sys, os
aid, version, repo, xpi, sha, minv = sys.argv[1:7]
path = "updates.json"
data = json.load(open(path)) if os.path.exists(path) else {"addons": {}}
updates = data.setdefault("addons", {}).setdefault(aid, {}).setdefault("updates", [])
updates[:] = [u for u in updates if u.get("version") != version]
updates.append({
    "version": version,
    "update_link": f"https://github.com/{repo}/releases/download/v{version}/{os.path.basename(xpi)}",
    "update_hash": f"sha256:{sha}",
    "applications": {"gecko": {"strict_min_version": minv}},
})
json.dump(data, open(path, "w"), indent=2)
open(path, "a").write("\n")
PY

# Marke für publish.sh: nur wenn hell und dunkel hier grün waren oder die CI
# denselben Stand vollständig grün getestet hat
if [[ -n "$CI_OK" || ( -z "$SKIP_TESTS" && "$OSTYPE" == darwin* ) ]]; then
  {
    echo "version=$VERSION"
    echo "sha256=$HASH"
    echo "commit=$(git rev-parse HEAD)"
    echo "zeit=$(date '+%Y-%m-%d %H:%M')"
    for T in "${TESTS[@]}"; do echo "test=$T"; done
  } > "$MARK"
  echo "Fertig: $XPI – alle Tests grün, Marke $MARK geschrieben"
  echo
  echo "Zum Veröffentlichen (ohne neu zu bauen, prüft danach den Hash):"
  echo "  ./publish.sh $VERSION notes.md"
else
  echo "Fertig: $XPI – aber nicht alle Tests gelaufen (SKIP_TESTS oder kein Mac), daher keine Marke: publish.sh veröffentlicht diese Version nicht"
fi
