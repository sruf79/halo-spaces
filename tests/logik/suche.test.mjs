// Suche: Datum im Suchbegriff, ohne Jahr das letzte vergangene Vorkommen
import { test } from "node:test";
import assert from "node:assert/strict";
import { lade } from "./lader.mjs";

const tag = d => d && [d.getFullYear(), d.getMonth() + 1, d.getDate()];
const jetzt = new Date(2026, 10, 8, 12, 0); // 8.11.2026

test("Suchdatum: mit Jahr (zwei- oder vierstellig)", () => {
  const { searchDate } = lade();
  assert.deepEqual(tag(searchDate("1.2.26", jetzt)), [2026, 2, 1]);
  assert.deepEqual(tag(searchDate(" 12.10.2026 ", jetzt)), [2026, 10, 12]);
  assert.equal(searchDate("30.2.2026", jetzt), null);
});

test("Suchdatum: ohne Jahr das letzte vergangene Vorkommen, auch 29.2.", () => {
  const { searchDate } = lade();
  assert.deepEqual(tag(searchDate("12.10", jetzt)), [2026, 10, 12]);
  assert.deepEqual(tag(searchDate("12.10.", jetzt)), [2026, 10, 12]);
  assert.deepEqual(tag(searchDate("12.12", jetzt)), [2025, 12, 12]);
  assert.deepEqual(tag(searchDate("29.2", jetzt)), [2024, 2, 29]);
  assert.equal(searchDate("31.4", jetzt), null);
});

test("Suchdatum: kein Datum", () => {
  const { searchDate } = lade();
  for (const text of ["abc", "12", "12.10.202", "", null]) {
    assert.equal(searchDate(text, jetzt), null, String(text));
  }
});

test("Suchtreffer: Positionen im Originaltext, auch wenn die Kleinschreibung länger ist", () => {
  const { hitRanges } = lade();
  const teile = (text, needle) => Array.from(hitRanges(text, needle), ([a, b]) => text.slice(a, b));
  assert.deepEqual(teile("Ihre Rechnung, rechnung", "rechnung"), ["Rechnung", "rechnung"]);
  // „İ“ wird klein geschrieben zu „i̇“ (zwei Zeichen) – vorher fehlte das „R“
  assert.deepEqual(teile("İstanbul Rechnung", "rechnung"), ["Rechnung"]);
  assert.deepEqual(teile("İİ Rechnung İ rechnung", "rechnung"), ["Rechnung", "rechnung"]);
  assert.deepEqual(teile("İstanbul", "istanbul"), []);
  assert.deepEqual(teile("İstanbul", "i̇stanbul"), ["İstanbul"]);
  assert.deepEqual(teile("İstanbul", "stan"), ["stan"]);
  // Zeichen außerhalb der BMP (Ersatzpaare) zusammen mit „İ“
  assert.deepEqual(teile("𝒜 İ Brief", "brief"), ["Brief"]);
  assert.equal(hitRanges("abc", "").length, 0);
  assert.equal(hitRanges("abc", "x").length, 0);
});
