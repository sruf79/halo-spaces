// Kalender-Suche wie Apple Kalender: Treffer und Gruppierung nach Tagen
import { test } from "node:test";
import assert from "node:assert/strict";
import { lade } from "./lader.mjs";

const { calDayKey, calSearchMatch, calSearchGroups } = lade();
// (Felder aus dem Lader stammen aus einem anderen Kontext – als JSON vergleichen)
const n = x => JSON.parse(JSON.stringify(x));

test("Kalender-Suche: Tag als JJJJMMTT, Monat wie in Thunderbird ab 0", () => {
  assert.equal(calDayKey(2026, 10, 9), 20261109);
  assert.equal(calDayKey(2027, 0, 5), 20270105);
});

test("Kalender-Suche: Teiltext ohne Groß-/Kleinschreibung in irgendeinem Feld, leerer Text findet nichts", () => {
  assert.equal(calSearchMatch("geburtsta", ["Tina hat Geburtstag", null, ""]), true);
  assert.equal(calSearchMatch("WIEN", [null, "Treffen", "Café in Wien"]), true);
  assert.equal(calSearchMatch("zahnarzt", ["Arzt", "", null]), false);
  assert.equal(calSearchMatch("  ", ["irgendwas"]), false);
  assert.equal(calSearchMatch("", ["irgendwas"]), false);
});

test("Kalender-Suche: nach Tagen gruppiert, ganztägig zuerst, Today immer dabei (auch leer), Tomorrow erkannt", () => {
  const today = 20261109, tomorrow = 20261110;
  const groups = n(calSearchGroups([
    { key: 20261128, allDay: false, time: 5, id: "c" },
    { key: tomorrow, allDay: false, time: 9, id: "b2" },
    { key: tomorrow, allDay: true, time: 0, id: "b1" },
    { key: 20261128, allDay: false, time: 2, id: "c0" },
    { key: 20260101, allDay: true, time: 0, id: "alt" },
  ], today, tomorrow));
  assert.deepEqual(groups.map(g => [g.key, g.kind, g.items.map(e => e.id)]), [
    [20260101, "date", ["alt"]],
    [today, "today", []],
    [tomorrow, "tomorrow", ["b1", "b2"]],
    [20261128, "date", ["c0", "c"]],
  ]);
  // nur Vergangenes: Today steht am Ende
  assert.deepEqual(n(calSearchGroups([{ key: 20250101, allDay: true, time: 0 }], today, tomorrow)).map(g => g.kind), ["date", "today"]);
  // Treffer heute: keine zweite Today-Gruppe
  assert.deepEqual(n(calSearchGroups([{ key: today, allDay: false, time: 1 }], today, tomorrow)).map(g => [g.kind, g.items.length]), [["today", 1]]);
});
