// Detailspalte der Aufgaben: Änderung an einem Vorkommen einer Serie fragt wie
// Apple Kalender „nur dieses“ / „alle“ (Thunderbirds Rückfrage)
import { test } from "node:test";
import assert from "node:assert/strict";
import { lade } from "./lader.mjs";

const { occurrenceScope, shiftSeriesTime } = lade();
const H = 3600000, D = 24 * H;

test("Vorkommen: Antwort der Rückfrage – 1 nur dieses, 3 alle, Abbrechen und das ausgeblendete „folgende“ ändern nichts", () => {
  assert.equal(occurrenceScope(1), "occurrence");
  assert.equal(occurrenceScope(3), "series");
  assert.equal(occurrenceScope(0), null);
  assert.equal(occurrenceScope(2), null);
  assert.equal(occurrenceScope(undefined), null);
});

test("Vorkommen: bei „alle“ verschiebt ein neues Datum die Serie um dieselbe Spanne", () => {
  const serie = Date.UTC(2026, 0, 5, 9), alt = Date.UTC(2026, 10, 16, 9);
  // Vorkommen zwei Tage und eine Stunde später → Serie ebenso
  assert.equal(shiftSeriesTime(serie, alt, alt + 2 * D + H), serie + 2 * D + H);
  // früher
  assert.equal(shiftSeriesTime(serie, alt, alt - D), serie - D);
  // entfernt bleibt entfernt
  assert.equal(shiftSeriesTime(serie, alt, null), null);
  // fehlte der Wert, gilt der neue
  assert.equal(shiftSeriesTime(null, null, alt), alt);
  assert.equal(shiftSeriesTime(serie, null, alt), alt);
});
