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
