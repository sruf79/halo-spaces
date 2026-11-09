// Hilfe für bekannte Fehler: grün, solange der Fehler besteht, rot, sobald er behoben ist
import { test } from "node:test";
import assert from "node:assert/strict";
import { bestehtNoch } from "./bekannt.mjs";

test("bekannter Fehler besteht noch: kein Fehlschlag", async () => {
  await bestehtNoch("Beispiel", () => assert.equal(1 + 1, 3));
});

test("bekannter Fehler behoben: Fehlschlag mit Hinweis zum Umwandeln", async () => {
  await assert.rejects(bestehtNoch("Beispiel", () => assert.equal(1 + 1, 2)), /behoben\? „Beispiel“ läuft jetzt durch/);
});

test("auch asynchrone Prüfungen", async () => {
  await bestehtNoch("async", async () => { throw new Error("noch kaputt"); });
  await assert.rejects(bestehtNoch("async", async () => {}), /behoben\?/);
});
