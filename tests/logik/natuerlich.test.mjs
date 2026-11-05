// Natürliche Eingabe im Schnellformular (parseNatural): Titel ohne Datum, Beginn, Ende, ganztägig, Dauer
import { test } from "node:test";
import assert from "node:assert/strict";
import { lade } from "./lader.mjs";

const { parseNatural } = lade();
const NOW = new Date(2026, 10, 5, 10, 0); // Donnerstag, 5. November 2026, 10:00
const at = (d, h, m = 0) => new Date(2026, 10, d, h, m).getTime();

test("Natürlich: „Lunch mit Anna morgen 12 Uhr“ → morgen 12–13 Uhr", () => {
  const r = parseNatural("Lunch mit Anna morgen 12 Uhr", NOW);
  assert.equal(r.title, "Lunch mit Anna");
  assert.equal(r.start.getTime(), at(6, 12));
  assert.equal(r.end.getTime(), at(6, 13));
  assert.equal(r.allDay, false);
});

test("Natürlich: Englisch „Meeting tomorrow 3pm“", () => {
  const r = parseNatural("Meeting tomorrow 3pm", NOW);
  assert.equal(r.title, "Meeting");
  assert.equal(r.start.getTime(), at(6, 15));
});

test("Natürlich: Datum „17.11. 9:30“ und Zeitraum „von 10 bis 12“", () => {
  const a = parseNatural("Zahnarzt 17.11. 9:30", NOW);
  assert.equal(a.title, "Zahnarzt");
  assert.equal(a.start.getTime(), at(17, 9, 30));
  const b = parseNatural("Workshop von 10 bis 12", NOW);
  assert.equal(b.start.getTime(), at(5, 10));
  assert.equal(b.end.getTime(), at(5, 12));
});

test("Natürlich: „übermorgen ganztägig“ und „Freitag für 2 Stunden“", () => {
  const a = parseNatural("Urlaub übermorgen ganztägig", NOW);
  assert.equal(a.title, "Urlaub");
  assert.equal(a.allDay, true);
  assert.equal(a.start.getTime(), at(7, 0));
  const b = parseNatural("Call Freitag für 2 Stunden", NOW);
  assert.equal(b.title, "Call");
  assert.equal(b.duration, 120);
  assert.equal(b.start.getTime(), at(6, 0));
});
