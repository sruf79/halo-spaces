// Ort eines Termins in der Karten-App des Systems: Adresse je Betriebssystem
import { test } from "node:test";
import assert from "node:assert/strict";
import { lade } from "./lader.mjs";

const { mapsUrl } = lade();

test("Karten: macOS öffnet Karten, Windows Karten, sonst geo:", () => {
  assert.equal(mapsUrl("Grasbergergasse 18, 1030 Wien", "Darwin"), "maps://?q=Grasbergergasse%2018%2C%201030%20Wien");
  assert.equal(mapsUrl("Grasbergergasse 18, 1030 Wien", "WINNT"), "bingmaps:?q=Grasbergergasse%2018%2C%201030%20Wien");
  assert.equal(mapsUrl("Grasbergergasse 18, 1030 Wien", "Linux"), "geo:0,0?q=Grasbergergasse%2018%2C%201030%20Wien");
});

test("Karten: Umbrüche und doppelte Leerzeichen werden zu einem, Sonderzeichen kodiert", () => {
  assert.equal(mapsUrl("  Café Ölgasse\n 3 &  Co?#", "Darwin"), "maps://?q=Caf%C3%A9%20%C3%96lgasse%203%20%26%20Co%3F%23");
});

test("Karten: leerer Ort ergibt keine Adresse", () => {
  assert.equal(mapsUrl("", "Darwin"), null);
  assert.equal(mapsUrl("   ", "WINNT"), null);
  assert.equal(mapsUrl(undefined, "Linux"), null);
});

test("Karten öffnen: direkt mit der App des Systems, ohne Rückfrage und ohne gespeicherte Wahl zu ändern", () => {
  const { openMaps } = lade();
  const calls = [];
  const handler = { alwaysAskBeforeHandling: true, preferredAction: 0,
    launchWithURI: (uri, bc) => calls.push(["launch", uri, bc]), store: () => calls.push(["store"]) };
  const svc = { getProtocolHandlerInfo: scheme => (calls.push(["info", scheme]), handler),
    loadURI: () => calls.push(["loadURI"]) };
  openMaps("maps://?q=Wien", svc, "URI");
  assert.deepEqual(calls, [["info", "maps"], ["launch", "URI", null]]);
  assert.equal(handler.alwaysAskBeforeHandling, false);
  assert.notEqual(handler.preferredAction, 0);
});
