#!/bin/zsh
# Bereitet eine neue Version für GitHub vor – veröffentlicht selbst nichts.
#   ./release.sh 2.11.0
# Braucht repo.conf mit:  GITHUB_REPO="besitzer/repo"
# Danach ./publish.sh <version> <notes.md> – lädt genau dieses Paket hoch.
set -e
ROOT="${0:A:h}"
cd "$ROOT"
VERSION="$1"
[[ -z "$VERSION" ]] && { echo "Aufruf: ./release.sh <version>  (z. B. 2.11.0)"; exit 1; }
[[ -f repo.conf ]] || { echo "repo.conf fehlt (GITHUB_REPO=\"besitzer/repo\")"; exit 1; }
source ./repo.conf
[[ -z "$GITHUB_REPO" ]] && { echo "GITHUB_REPO in repo.conf fehlt"; exit 1; }
BRANCH="${GITHUB_BRANCH:-main}"

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
    python3 tests/halo_test.py --xpi "$XPI" $MODE --shots "$SHOTS" "${CMP[@]}" \
      || { echo "Tests fehlgeschlagen – kein Release (SKIP_TESTS=1 überspringt)"; exit 1; }
  done
  # die nächste Thunderbird-Version: Fehler dort sind eine Warnung, kein Abbruch
  if [[ "$OSTYPE" == darwin* && -z "$SKIP_BETA" ]]; then
    tests/beta.sh --xpi "$XPI" || echo "WARNUNG: Tests mit Thunderbird Beta fehlgeschlagen (SKIP_BETA=1 überspringt)"
    BETA=$(defaults read "$HOME/Library/Caches/halo-spaces/tb-beta/Thunderbird Beta.app/Contents/Info.plist" CFBundleShortVersionString 2>/dev/null | cut -d. -f1)
    MAX=$(cut -d. -f1 store/max-version)
    if [[ -n "$BETA" && "$BETA" -gt "$MAX" ]]; then
      echo "HINWEIS: Thunderbird Beta $BETA ist neuer als store/max-version ($MAX.*) – nach erfolgreichem Test anheben, sonst sperrt Thunderbird die Store-Version ab $((MAX + 1))"
    fi
  fi
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

echo "Fertig: $XPI"
echo
echo "Zum Veröffentlichen (ohne neu zu bauen, prüft danach den Hash):"
echo "  ./publish.sh $VERSION notes.md"
