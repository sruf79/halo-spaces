#!/usr/bin/env python3
"""Korrekturen am gebündelten pst-extractor (nach esbuild, aus build.sh).

1. PSTNodeInputStream.readCompletely: bricht bei einem Lesevorgang ohne Daten
   mit Fehler ab. Die Bibliothek vergleicht das Ende eines Knotens mit `==`
   zwischen zwei Long-Objekten (nie gleich) und las bei neueren PSTs (Office
   365) danach endlos 0 Bytes – Thunderbird hing bzw. stürzte ab.

2. PSTTable: sucht den Kopf des B-Baums (BTHHEADER) über den Verweis in der
   Tabelle (Tabelle 7C: TCINFO.hidRowIndex, Tabelle BC: hidUserRoot, wie in
   MS-PST beschrieben) statt fest an HID 0x20. Neuere PSTs aus Microsoft 365
   legen ihn weiter hinten ab (z. B. HID 0xA0); die Bibliothek fand dann keinen
   Ordner. Passt der Verweis nicht, bleibt es beim alten Weg (HID 0x20). Der
   Fehlerfall wirft sofort die eigentliche Meldung (vorher verdeckt durch einen
   Leseversuch über das Ende des Knotens hinaus, „unexpected EOF“).

Aufruf:  python3 tools/pst-bundle/fix.py extension/vendor/pst/pst-extractor.js
"""
import sys

KORREKTUREN = [
    ("readCompletely bricht bei 0 gelesenen Bytes ab",
     """            numRead = this.readFromOffset(target, offset, target.length - offset);
            if (numRead === -1) {""",
     """            numRead = this.readFromOffset(target, offset, target.length - offset);
            if (numRead === -1 || numRead === 0) {"""),
    ("PSTTable findet den BTHHEADER über den Verweis statt fest an HID 0x20",
     """          const headerNodeInfo = this.getNodeInfo(32);
          if (!headerNodeInfo) {
            throw new Error("PSTTable::constructor headerNodeInfo is null");
          }
          headerNodeInfo.pstNodeInputStream.seek(long_1.default.fromValue(headerNodeInfo.startOffset));
          let headerByte = headerNodeInfo.pstNodeInputStream.read() & 255;
          if (headerByte != 181) {
            headerNodeInfo.pstNodeInputStream.seek(long_1.default.fromValue(headerNodeInfo.startOffset));
            headerByte = headerNodeInfo.pstNodeInputStream.read() & 255;
            headerNodeInfo.pstNodeInputStream.seek(long_1.default.fromValue(headerNodeInfo.startOffset));
            const tmp = import_buffer.Buffer.alloc(1024);
            headerNodeInfo.pstNodeInputStream.readCompletely(tmp);
            throw new Error("PSTTable::constructor Unable to parse table, can't find BTHHEADER header information: " + headerByte);
          }""",
     """          // halo.spaces (tools/pst-bundle/fix.py): BTHHEADER über den Verweis suchen (MS-PST), nicht fest an HID 0x20
          const bthAt = (hid) => {
            if (!hid || (hid & 31) != 0) return null;
            let info = null;
            try { info = this.getNodeInfo(hid); } catch (e) { return null; }
            if (!info || info.length() < 8) return null;
            info.pstNodeInputStream.seek(long_1.default.fromValue(info.startOffset));
            return (info.pstNodeInputStream.read() & 255) == 181 ? info : null;
          };
          let hidBth = this.hidUserRoot;
          if (this.tableTypeByte == 124) {
            hidBth = 0;
            try {
              const tcInfo = this.getNodeInfo(this.hidUserRoot);
              if (tcInfo && tcInfo.length() >= 14) hidBth = tcInfo.seekAndReadLong(long_1.default.fromValue(10), 4).toNumber();
            } catch (e) {
              hidBth = 0;
            }
          }
          const headerNodeInfo = bthAt(hidBth) || bthAt(32);
          if (!headerNodeInfo) {
            throw new Error("PSTTable::constructor Unable to parse table, can't find BTHHEADER header information (hid 0x" + hidBth.toString(16) + ")");
          }
          headerNodeInfo.pstNodeInputStream.seek(long_1.default.fromValue(headerNodeInfo.startOffset + 1));"""),
]

path = sys.argv[1]
src = open(path, encoding="utf-8").read()
for name, alt, neu in KORREKTUREN:
    if neu in src:
        print("schon korrigiert:", name)
        continue
    if src.count(alt) != 1:
        sys.exit("Stelle nicht eindeutig gefunden – pst-extractor geändert? fix.py anpassen (" + name + ")")
    src = src.replace(alt, neu)
    print("korrigiert:", name)
open(path, "w", encoding="utf-8").write(src)
