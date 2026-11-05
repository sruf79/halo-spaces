#!/usr/bin/env python3
"""Korrekturen am gebündelten pst-extractor (nach esbuild, aus build.sh).

1. PSTNodeInputStream.readCompletely: bricht bei einem Lesevorgang ohne Daten
   mit Fehler ab. Die Bibliothek vergleicht das Ende eines Knotens mit `==`
   zwischen zwei Long-Objekten (nie gleich) und las bei neueren PSTs (Office
   365) danach endlos 0 Bytes – Thunderbird hing bzw. stürzte ab.

Aufruf:  python3 tools/pst-bundle/fix.py extension/vendor/pst/pst-extractor.js
"""
import sys

ALT = """            numRead = this.readFromOffset(target, offset, target.length - offset);
            if (numRead === -1) {"""
NEU = """            numRead = this.readFromOffset(target, offset, target.length - offset);
            if (numRead === -1 || numRead === 0) {"""

path = sys.argv[1]
src = open(path, encoding="utf-8").read()
if NEU in src:
    print("schon korrigiert")
    sys.exit(0)
if src.count(ALT) != 1:
    sys.exit("Stelle nicht eindeutig gefunden – pst-extractor geändert? fix.py anpassen")
open(path, "w", encoding="utf-8").write(src.replace(ALT, NEU))
print("korrigiert: readCompletely bricht bei 0 gelesenen Bytes ab")
