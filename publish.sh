#!/bin/zsh
# Veröffentlicht die mit release.sh vorbereitete Version – ohne neu zu bauen.
#   ./publish.sh 3.0.95 notes.md
# Läuft nur, wenn release.sh für genau dieses Paket alle Tests grün hatte
# (Marke dist/release-<version>.ok mit Version und Hash). Prüft vorher, dass
# Paket, Manifest und updates.json zusammenpassen, und danach, dass der Download
# von GitHub genau diesen Hash hat und die updates.json, die Thunderbird über
# update_url abruft, auf ihn zeigt (sonst lehnt Thunderbird das Update ab oder
# findet es nicht). Am Ende liegt ein Bericht in ~/halo-berichte/.
set -e
ROOT="${0:A:h}"
cd "$ROOT"
VERSION="$1"
NOTES="$2"
[[ -z "$VERSION" || ! -f "$NOTES" ]] && { echo "Aufruf: ./publish.sh <version> <notes.md>"; exit 1; }
source ./repo.conf
GH=$(command -v gh || echo "$HOME/.local/bin/gh")
[[ -x "$GH" ]] || { echo "gh (GitHub CLI) nicht gefunden"; exit 1; }
XPI="dist/halo-spaces-$VERSION.xpi"
MARK="dist/release-$VERSION.ok"
[[ -f "$XPI" ]] || { echo "$XPI fehlt – zuerst ./release.sh $VERSION"; exit 1; }

# Sperre: nur mit Marke von release.sh, die zu Version und Paket passt
LOCAL=$(shasum -a 256 "$XPI" | cut -d' ' -f1)
[[ -f "$MARK" ]] || { echo "ABBRUCH: keine Testmarke $MARK – release.sh $VERSION hat nicht alle Tests (hell, dunkel, Beta) bestanden"; exit 1; }
[[ "$(sed -n 's/^version=//p' "$MARK")" == "$VERSION" ]] || { echo "ABBRUCH: Testmarke $MARK gehört zu einer anderen Version"; exit 1; }
[[ "$(sed -n 's/^sha256=//p' "$MARK")" == "$LOCAL" ]] || { echo "ABBRUCH: Paket seit den Tests neu gebaut (Hash passt nicht zur Testmarke) – ./release.sh $VERSION erneut"; exit 1; }

MANIFEST=$(python3 -c "import json; print(json.load(open('extension/manifest.json'))['version'])")
[[ "$MANIFEST" == "$VERSION" ]] || { echo "Manifest hat $MANIFEST, nicht $VERSION"; exit 1; }
LISTED=$(python3 - "$VERSION" <<'PY'
import json, sys
for addon in json.load(open("updates.json"))["addons"].values():
    for u in addon["updates"]:
        if u["version"] == sys.argv[1]:
            print(u["update_hash"].split(":", 1)[1])
PY
)
[[ "$LOCAL" == "$LISTED" ]] || { echo "Hash in updates.json passt nicht zum Paket (Paket neu gebaut?) – ./release.sh $VERSION erneut"; exit 1; }

# Bericht für den Morgen: wird am Ende geschrieben, auch wenn etwas schiefgeht
BERICHTE="$HOME/halo-berichte"
mkdir -p "$BERICHTE"
BERICHT="$BERICHTE/$(date +%Y-%m-%d)-halo.spaces-$VERSION.md"
ERGEBNIS="abgebrochen"
STATUS=()
bericht() {
  {
    echo "# halo.spaces $VERSION – $ERGEBNIS"
    echo
    echo "$(date '+%d.%m.%Y %H:%M') auf $(hostname -s), Commit $(git rev-parse --short HEAD)"
    echo
    echo "## Tests (release.sh, $(sed -n 's/^zeit=//p' "$MARK"))"
    echo
    sed -n 's/^test=/- /p' "$MARK"
    echo
    echo "## Veröffentlichung"
    echo
    for S in "${STATUS[@]}"; do echo "- $S"; done
    echo
    echo "## Neu und behoben"
    echo
    cat "$NOTES"
  } > "$BERICHT"
  echo "Bericht: $BERICHT"
}
trap bericht EXIT

# nur die Dateien committen, die release.sh ändert (dazu ggf. die Versionshinweise)
RELEASE_FILES=(extension/manifest.json updates.json README.md)
OTHER=$(git status --porcelain | grep -vE "^.. ($(IFS='|'; echo "${RELEASE_FILES[*]}"))\$" || true)
if [[ -n "$OTHER" ]]; then
  echo "WARNUNG: diese Änderungen gehören nicht zum Release und bleiben draußen:"
  echo "$OTHER"
  STATUS+=("Warnung: nicht mitgenommen: $(echo "$OTHER" | awk '{print $2}' | tr '\n' ' ')")
fi
git add -- "${RELEASE_FILES[@]}"
git commit -q -m "halo.spaces $VERSION" -- "${RELEASE_FILES[@]}" || true
git -c http.postBuffer=157286400 push -q
STATUS+=("gepusht: $(git rev-parse --short HEAD) auf $(git rev-parse --abbrev-ref HEAD)")
"$GH" release create "v$VERSION" "$XPI" --repo "$GITHUB_REPO" --title "$VERSION" --notes-file "$NOTES"
STATUS+=("GitHub-Release v$VERSION angelegt: https://github.com/$GITHUB_REPO/releases/tag/v$VERSION")

# Download prüfen (GitHub braucht ggf. einen Moment)
URL="https://github.com/$GITHUB_REPO/releases/download/v$VERSION/$(basename "$XPI")"
REMOTE=""
for i in {1..10}; do
  REMOTE=$(curl -sfL "$URL?check=$RANDOM" | shasum -a 256 | cut -d' ' -f1) || true
  [[ "$REMOTE" == "$LOCAL" ]] && break
  sleep 3
done
if [[ "$REMOTE" != "$LOCAL" ]]; then
  echo "FEHLER: Download hat nicht den erwarteten Hash ($REMOTE statt $LOCAL)"
  STATUS+=("FEHLER: Download $URL hat Hash $REMOTE statt $LOCAL – Thunderbird lehnt das Update ab")
  exit 1
fi
echo "Veröffentlicht – Hash geprüft (${LOCAL[1,16]}…)"
STATUS+=("Download geprüft: Hash stimmt (${LOCAL[1,16]}…)")

# die updates.json prüfen, die Thunderbird über update_url wirklich abruft
# (raw.githubusercontent.com hält Dateien bis zu 5 Minuten im Zwischenspeicher)
UPDATE_URL=$(python3 -c "import json; print(json.load(open('extension/manifest.json'))['browser_specific_settings']['gecko']['update_url'])")
UPD="fehlt"
for i in {1..24}; do
  UPD=$(curl -sfL -H 'Cache-Control: no-cache' "$UPDATE_URL" | python3 -c '
import json, sys
version, link, sha = sys.argv[1:4]
try:
    data = json.load(sys.stdin)
except Exception:
    print("unlesbar"); sys.exit()
for addon in data.get("addons", {}).values():
    for u in addon.get("updates", []):
        if u.get("version") == version:
            got = (u.get("update_link"), u.get("update_hash"))
            print("ok" if got == (link, "sha256:" + sha) else "falsch: %s, %s" % got)
            sys.exit()
print("fehlt")' "$VERSION" "$URL" "$LOCAL") || UPD="nicht erreichbar"
  [[ "$UPD" == ok ]] && break
  sleep 15
done
if [[ "$UPD" != ok ]]; then
  echo
  echo "!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!"
  echo "FEHLER: $UPDATE_URL bietet $VERSION nicht richtig an ($UPD)."
  echo "Nutzer bekommen dieses Update nicht automatisch – updates.json prüfen!"
  echo "!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!"
  STATUS+=("FEHLER: $UPDATE_URL bietet $VERSION nicht richtig an ($UPD) – Nutzer bekommen das Update nicht")
  exit 1
fi
echo "Update-Liste geprüft: $UPDATE_URL bietet $VERSION mit richtigem Hash und Download an"
STATUS+=("Update-Liste geprüft: $UPDATE_URL bietet $VERSION mit richtigem Hash und Download an")
ERGEBNIS="veröffentlicht"

# addons.thunderbird.net nur auf ausdrücklichen Wunsch (ATN=1): Der Store nimmt
# derzeit keine neuen Add-ons mit eigener Experiment-API an (Ablehnung von
# 3.15.0 am 4.11.2026), jeder Upload würde wieder abgelehnt. store/README.md
if [[ -n "$ATN" && -f "$HOME/.config/halo-spaces/atn.env" ]]; then
  # Die Prüfer wollen den Quellcode (theme.css wird erzeugt). Die Schnittstelle
  # von addons.thunderbird.net nimmt nur das Paket an, das Zip wird deshalb im
  # Developer Hub nachgereicht.
  SOURCE_ZIP="dist/halo-spaces-$VERSION-source.zip"
  if git archive --format=zip -o "$SOURCE_ZIP" HEAD; then
    STATUS+=("Quellcode für den Store: $PWD/$SOURCE_ZIP – im Developer Hub bei Version $VERSION unter „Source code“ hochladen")
  else
    STATUS+=("WARNUNG: Quellcode-Zip für den Store nicht erstellt – von Hand: git archive --format=zip -o $SOURCE_ZIP v$VERSION")
  fi
  if python3 store/atn_upload.py "$VERSION"; then
    STATUS+=("Store (addons.thunderbird.net): hochgeladen")
  else
    echo "WARNUNG: Hochladen auf addons.thunderbird.net fehlgeschlagen"
    STATUS+=("WARNUNG: Store-Upload (addons.thunderbird.net) fehlgeschlagen – GitHub-Update ist trotzdem draußen")
    ERGEBNIS="veröffentlicht, Store-Upload fehlgeschlagen"
  fi
else
  STATUS+=("Store (addons.thunderbird.net): ausgesetzt (Experiment-APIs dort derzeit nicht angenommen; ATN=1 lädt hoch)")
fi
exit 0
