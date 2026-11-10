#!/bin/zsh
# Bereitet eine neue Version für GitHub vor – veröffentlicht selbst nichts.
#   ./release.sh 2.11.0
# Braucht repo.conf mit:  GITHUB_REPO="besitzer/repo"
# Danach ./publish.sh <version> <notes.md> – lädt genau dieses Paket hoch.
# Nur wenn alle Tests grün sind (hell; dunkel, wenn seit dem letzten Release
# Farben betroffen sind, tests/farben-betroffen.sh), schreibt release.sh die
# Marke dist/release-<version>.ok (Version, Hash des Pakets, Tests, dunkel
# ja/nein) – ohne sie veröffentlicht publish.sh nicht.
# Hotfix (nur auf ausdrückliche Anweisung des Maintainers, dringende Korrektur
# ohne Änderung am Aussehen): HOTFIX="<Muster>" ./release.sh x.y.z testet nur die
# Prüfungen, deren Name auf das Muster passt (hell); die Marke vermerkt das, die
# CI zum nächsten Push testet danach vollständig (Entscheidung vom 4.11.2026)
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
DUNKEL=nein                            # lief der Dunkelmodus mit (lokal oder in der CI)?

# bei einem Fehler: Manifest und updates.json zurück auf den letzten Commit, keine Marke
fehlschlag() {
  echo "$1"
  git checkout -q -- extension/manifest.json updates.json 2>/dev/null || true
  rm -f "$MARK"
  exit 1
}

# Tests überspringen, wenn die CI denselben Stand schon vollständig grün getestet hat:
# Linux (Release, Beta, ESR) und Mac im Lauf zum Pushstand, Windows in einem eigenen Lauf
# von Hand (der Job windows läuft nicht mehr bei Push; der Nachtlauf startet ihn mit
# `gh workflow run test.yml -f ziel=windows --ref main`, tests/nachtlauf-auftrag.md Schritt 4a).
# Seit dem grünen Stand darf sich nichts geändert haben, was Thunderbird direkt betrifft
# (tests/ci-noetig.sh, gleiche Liste wie test.yml), und es darf nichts Ungespeichertes
# herumliegen. Linux und Mac grün, aber kein grüner Windows-Lauf: kein Release.

# grüner Windows-Lauf von Hand für <sha> oder einen Nachfolger, seit dem sich bis HEAD nichts
# für Thunderbird geändert hat; setzt WIN_RUN, WIN_SHA, WIN_DATUM
windows_lauf() {
  local Z ID WSHA DATUM
  for Z in $(gh run list -R "$GITHUB_REPO" -w test.yml -b "$BRANCH" -e workflow_dispatch -L 30 \
               --json databaseId,headSha,createdAt --jq '.[] | "\(.databaseId):\(.headSha):\(.createdAt[0:10])"' 2>/dev/null); do
    ID=${Z%%:*} WSHA=${${Z#*:}%%:*} DATUM=${Z##*:}
    git merge-base --is-ancestor "$1" "$WSHA" 2>/dev/null || continue     # derselbe oder ein Nachfolge-Commit
    git merge-base --is-ancestor "$WSHA" HEAD 2>/dev/null || continue
    tests/ci-noetig.sh "$WSHA" HEAD && continue                            # seitdem Thunderbird geändert
    # Job windows grün, ohne Auswahl von Prüfungen (windows-github zählt nicht)
    gh run view "$ID" -R "$GITHUB_REPO" --json jobs --jq 'any(.jobs[]; .name == "windows" and .conclusion == "success")
        and (any(.jobs[]; .name == "changes" and any(.steps[]?; .name == "Nur Teil der Prüfungen" and .conclusion == "success")) | not)' \
      | grep -q true || continue
    WIN_RUN=$ID WIN_SHA=$WSHA WIN_DATUM=$DATUM
    return 0
  done
  return 1
}

if [[ -z "$SKIP_TESTS" && -z "$FORCE_TESTS" && -z "$HOTFIX" ]] && command -v gh >/dev/null; then
  if [[ -z "$(git status --porcelain --untracked-files=no)" ]]; then
    for Z in $(gh run list -R "$GITHUB_REPO" -w test.yml -b "$BRANCH" -s success -L 30 \
                 --json databaseId,headSha --jq '.[] | "\(.databaseId):\(.headSha)"' 2>/dev/null); do
      RUN=${Z%%:*} SHA=${Z#*:}
      git merge-base --is-ancestor "$SHA" HEAD 2>/dev/null || continue
      if tests/ci-noetig.sh "$SHA" HEAD; then
        break                              # Code seit dem grünen Lauf geändert
      fi
      # vollständig: Linux x3 und mac gelaufen (nicht übersprungen), kein gezielter Lauf von Hand
      # (Windows-Läufe von Hand sind gezielt und werden hier übersprungen)
      gh run view "$RUN" -R "$GITHUB_REPO" --json jobs --jq '(any(.jobs[]; .name == "mac" and .conclusion == "success")
          and ([.jobs[] | select(.name | startswith("linux")) | select(.conclusion == "success")] | length) == 3
          and (any(.jobs[]; .name == "changes" and any(.steps[]?; .name == "Gezielter Lauf" and .conclusion == "success")) | not))' \
        | grep -q true || continue
      windows_lauf "$SHA" \
        || fehlschlag "CI-Lauf $RUN für ${SHA:0:7} ist grün (Linux, Mac), aber kein grüner Windows-Lauf zu diesem Stand (gh workflow run test.yml -f ziel=windows --ref $BRANCH; tests/ci-warten.sh --windows) – kein Release, keine Marke"
      echo "CI-Lauf $RUN für ${SHA:0:7} grün (Linux, Mac), Windows-Lauf $WIN_RUN für ${WIN_SHA:0:7} grün – Tests übersprungen (FORCE_TESTS=1 testet trotzdem)"
      SKIP_TESTS=1
      CI_OK=1
      WIN_TEXT="Windows: Lauf $WIN_RUN vom $WIN_DATUM für ${WIN_SHA:0:7}"
      # dunkel nur, wenn Farben betroffen waren (Job changes, tests/farben-betroffen.sh)
      if gh run view "$RUN" -R "$GITHUB_REPO" --json jobs --jq 'any(.jobs[]; .name == "mac" and any(.steps[]?; .name == "Test dunkel" and .conclusion == "success"))' | grep -q true; then
        DUNKEL=ja
        TESTS+=("CI-Lauf $RUN für ${SHA:0:7} grün: Linux (Release, Beta, ESR), Mac (hell, dunkel); $WIN_TEXT")
      else
        TESTS+=("CI-Lauf $RUN für ${SHA:0:7} grün: Linux (Release, Beta, ESR), Mac (hell; dunkel entfiel, seit dem zuletzt dunkel getesteten Stand keine Farben geändert); $WIN_TEXT")
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
if [[ -n "$HOTFIX" && -z "$SKIP_TESTS" ]]; then
  echo "Hotfix: nur die Prüfungen „$HOTFIX“ (hell), der volle Lauf folgt in der CI"
  python3 tests/halo_test.py --xpi "$XPI" --only "$HOTFIX" 2>&1 | tee -a "$LOG" \
    || fehlschlag "Hotfix-Prüfungen fehlgeschlagen – kein Release, keine Marke (Manifest zurückgesetzt)"
  grep -qE '^[1-9][0-9]* von [0-9]+ Prüfungen' "$LOG" || fehlschlag "Hotfix: keine Prüfung passt auf „$HOTFIX“ – kein Release"
  TESTS+=("Hotfix, nur „$HOTFIX“ (hell): $(grep -E '^[0-9]+ von [0-9]+ Prüfungen' "$LOG" | tail -1)")
  HOTFIX_OK=1
elif [[ -z "$SKIP_TESTS" ]]; then
  SHOTS="tests/shots/$VERSION"
  OLD=(tests/shots/*(N/n))             # numerisch sortiert, letzter = neueste Version
  OLD=(${OLD:#tests/shots/$VERSION})
  PREV=${OLD[-1]}
  rm -rf "$SHOTS"
  CMP=()
  [[ -n "$PREV" ]] && CMP=(--compare "$PREV")
  # dunkel nur, wenn seit dem letzten Release Farben betroffen sind (wie die CI)
  MODES=("")
  if tests/farben-betroffen.sh "$(git describe --tags --abbrev=0 --match 'v*' HEAD 2>/dev/null)" HEAD; then
    MODES+=(--dark)
    DUNKEL=ja
  fi
  for MODE in "${MODES[@]}"; do
    python3 tests/halo_test.py --xpi "$XPI" $MODE --shots "$SHOTS" "${CMP[@]}" 2>&1 | tee -a "$LOG" \
      || fehlschlag "Tests $([[ -n $MODE ]] && echo dunkel || echo hell) fehlgeschlagen – kein Release, keine Marke (Manifest zurückgesetzt)"
    TESTS+=("$([[ -n $MODE ]] && echo dunkel || echo hell): $(grep -E '^[0-9]+ von [0-9]+ Prüfungen' "$LOG" | tail -1)")
  done
  # Beta läuft nur noch unter Linux in der CI (Entscheidung vom 3.11.2026)
fi
# Update eines Bestandsnutzers nachstellen: vom letzten Release auf dieses
# Paket (Einstellungen, Toolbar, Begrüßung, userChrome.css) – auch wenn die
# Prüfungen selbst die CI übernommen hat. Bei Fehlern kein Release
if [[ -n "$CI_OK" || -n "$HOTFIX_OK" || ( -z "$SKIP_TESTS" && "$OSTYPE" == darwin* ) ]] && [[ -z "$NO_UPDATE_TEST" ]]; then
  UPD_LOG=$(mktemp -t halo-update-test)   # nur dieser Versuch (LOG wird angehängt, ältere Versuche stehen auch darin)
  python3 tests/update_test.py --xpi "$XPI" 2>&1 | tee "$UPD_LOG" | tee -a "$LOG" \
    || fehlschlag "Update-Test fehlgeschlagen – kein Release, keine Marke (Manifest zurückgesetzt)"
  TESTS+=("Update-Test vom letzten Release: $(grep -E '^[0-9]+ von [0-9]+ Prüfungen' "$UPD_LOG" | tail -1)")
  # Fehlerkonsole/-protokoll beim Update: nur zur Kenntnis in Marke und Bericht, hält kein Release auf; die
  # Meldungen trägt der CI-Wächter ins Board (der Update-Test läuft nicht in der CI) – Fehler dabei sind egal
  for KONSOLE_UPDATE in "${(@f)$(grep -E '^Fehlerkonsole \(' "$UPD_LOG")}"; do
    if [[ -n "$KONSOLE_UPDATE" ]]; then TESTS+=("Update-Test, $KONSOLE_UPDATE"); fi
  done
  if grep -qaE 'KONSOLE  |PROTOKOLL  ' "$UPD_LOG"; then
    zsh tests/ci-waechter.sh --datei "$UPD_LOG" 2>&1 | tee -a "$LOG" || true
  fi
  rm -f "$UPD_LOG"
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

# Marke für publish.sh: nur wenn hell (und ggf. dunkel) hier grün waren oder die CI
# denselben Stand vollständig grün getestet hat
if [[ -n "$CI_OK" || -n "$HOTFIX_OK" || ( -z "$SKIP_TESTS" && "$OSTYPE" == darwin* ) ]]; then
  {
    echo "version=$VERSION"
    echo "sha256=$HASH"
    echo "commit=$(git rev-parse HEAD)"
    echo "dunkel=$DUNKEL"
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
