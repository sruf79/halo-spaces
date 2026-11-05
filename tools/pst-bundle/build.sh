#!/bin/zsh
# Baut extension/vendor/pst/pst-extractor.js aus den npm-Paketen nach
# (feste Versionen, Bündel mit esbuild). Braucht Node.js.
#   tools/pst-bundle/build.sh
set -e
HERE="${0:A:h}"
ROOT="${HERE:h:h}"
TMP=$(mktemp -d)
cp "$HERE"/*.js "$TMP/"
cd "$TMP"
npm init -y >/dev/null
npm install --ignore-scripts --no-audit --no-fund \
  pst-extractor@1.12.0 long@5.3.2 iconv-lite@0.7.3 uuid-parse@1.1.0 \
  buffer@6.0.3 pako@2.1.0 string_decoder@1.3.0 esbuild@0.25.10 >/dev/null
npx esbuild entry.js --bundle --format=iife --global-name=HaloPST --platform=browser --target=firefox140 \
  --inject:./buffer-shim.js --alias:fs=./fs-shim.js --alias:zlib=./zlib-shim.js --alias:string_decoder=string_decoder \
  --legal-comments=eof --outfile="$ROOT/extension/vendor/pst/pst-extractor.js"
# Korrekturen an der Bibliothek (siehe fix.py)
python3 "$HERE/fix.py" "$ROOT/extension/vendor/pst/pst-extractor.js"
cd / && rm -rf "$TMP"
echo "fertig: extension/vendor/pst/pst-extractor.js"
