// Später senden (SendLater, extension/api/mail.js): die interne Kopfzeile geht nicht an die Empfänger
import { test } from "node:test";
import assert from "node:assert/strict";
import { lade } from "./lader.mjs";

test("Später senden: X-Halo-Send-At und Thunderbirds Ablagezeilen fallen aus dem Kopfteil, der Rumpf bleibt unverändert", () => {
  const { SendLater } = lade();
  const roh = "From - Tue Nov 17 2026\r\nX-Mozilla-Status: 0001\r\nX-Mozilla-Status2: 00000000\r\nSubject: Hallo\r\n"
    + "X-Halo-Send-At: 1795000000000\r\n\r\nText\r\nX-Halo-Send-At: bleibt im Rumpf\r\n";
  assert.equal(SendLater.stripHeader(roh), "Subject: Hallo\r\n\r\nText\r\nX-Halo-Send-At: bleibt im Rumpf\r\n");
});

test("Später senden: gefaltete Kopfzeile fällt samt Folgezeile weg, Groß- und Kleinschreibung egal, nur \\n als Zeilenende", () => {
  const { SendLater } = lade();
  assert.equal(SendLater.stripHeader("To: a@x\nx-halo-send-at:\n 1795000000000\nSubject: b\n\nRumpf"), "To: a@x\nSubject: b\n\nRumpf");
});
