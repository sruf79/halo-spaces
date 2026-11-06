// Uhrzeit im Termin zum Eintippen: Ziffern je Feld (Stunden, Minuten), Pfeiltasten
import { test } from "node:test";
import assert from "node:assert/strict";
import { lade } from "./lader.mjs";

const { timeTypeDigit, timeStep: step } = lade();
// (Felder aus dem Lader stammen aus einem anderen Kontext – als JSON vergleichen)
const n = x => JSON.parse(JSON.stringify(x));
const timeStep = (...a) => n(step(...a));

// tippt eine Folge von Ziffern ab dem Feld seg und liefert Wert und Feld am Ende
function tippe(start, seg, folge, h12 = false) {
  let value = start, buf = "";
  const segs = h12 ? ["h", "m", "ap"] : ["h", "m"];
  for (const d of folge) {
    const r = timeTypeDigit(seg, buf, d, value, h12);
    value = r.value;
    buf = r.buf;
    if (r.next && segs[segs.indexOf(seg) + 1]) {
      seg = segs[segs.indexOf(seg) + 1];
      buf = "";
    }
  }
  return n([value, seg]);
}

test("Uhrzeit: 24 Stunden – zwei Ziffern je Feld, danach weiter zu den Minuten", () => {
  assert.deepEqual(tippe([9, 0], "h", "1435"), [[14, 35], "m"]);
  assert.deepEqual(tippe([9, 0], "h", "0830"), [[8, 30], "m"]);
  // Ziffer, die keine zweite zulässt, springt sofort weiter (3 → 03)
  assert.deepEqual(tippe([9, 15], "h", "3"), [[3, 15], "m"]);
  // erste Ziffer allein gilt schon (1 → 01), wartet aber auf die zweite
  assert.deepEqual(tippe([9, 15], "h", "1"), [[1, 15], "h"]);
  // 27 gibt es nicht: die 7 beginnt neu
  assert.deepEqual(tippe([9, 15], "h", "27"), [[7, 15], "m"]);
  // Minuten: 7 → 07 (keine zweite Ziffer möglich), 4 wartet auf die zweite
  assert.deepEqual(tippe([9, 15], "m", "7"), [[9, 7], "m"]);
  assert.deepEqual(tippe([9, 15], "m", "45"), [[9, 45], "m"]);
});

test("Uhrzeit: 12 Stunden – Tageshälfte bleibt, 12 AM ist 0 Uhr, danach AM/PM", () => {
  assert.deepEqual(tippe([15, 0], "h", "1030", true), [[22, 30], "ap"]);
  assert.deepEqual(tippe([9, 0], "h", "12", true), [[0, 0], "m"]);
  assert.deepEqual(tippe([13, 0], "h", "12", true), [[12, 0], "m"]);
  assert.deepEqual(tippe([9, 0], "h", "5", true), [[5, 0], "m"]);
  // 0 allein ist keine Stunde: Wert bleibt, wartet auf die zweite Ziffer
  assert.deepEqual(tippe([9, 0], "h", "0", true), [[9, 0], "h"]);
  assert.deepEqual(tippe([9, 0], "h", "07", true), [[7, 0], "m"]);
});

test("Uhrzeit: Pfeiltasten ändern nur das gewählte Feld", () => {
  assert.deepEqual(timeStep("h", [23, 10], 1), [0, 10]);
  assert.deepEqual(timeStep("h", [0, 10], -1), [23, 10]);
  assert.deepEqual(timeStep("m", [9, 59], 1), [9, 0]);
  assert.deepEqual(timeStep("m", [9, 0], -1), [9, 59]);
  assert.deepEqual(timeStep("ap", [9, 30], 1), [21, 30]);
  assert.deepEqual(timeStep("ap", [21, 30], -1), [9, 30]);
});

test("Uhrzeit: Dauer in der Auswahlliste der Endzeit, Dezimalzeichen nach der Region", () => {
  const de = lade({ locale: "de-DE" }), en = lade({ locale: "en-US" });
  assert.deepEqual([30, 60, 90, 120, 150, 180].map(m => de.durationText(m)),
    ["30 Minuten", "1 Stunde", "1,5 Stunden", "2 Stunden", "2,5 Stunden", "3 Stunden"]);
  assert.deepEqual([30, 60, 90].map(m => en.durationText(m)), ["30 minutes", "1 hour", "1.5 hours"]);
});

test("Uhrzeit: eingetipptes Ende vor dem Beginn am selben Tag springt auf den Folgetag", () => {
  const { endFromTime } = lade();
  const d = (tag, h, m = 0) => new Date(2026, 10, tag, h, m);
  const s = t => `${t.getDate()}. ${t.getHours()}:${String(t.getMinutes()).padStart(2, "0")}`;
  const ende = (start, end, hm) => s(endFromTime(start, end, hm));
  // 22:00–23:00, Ende „01:00“ → Folgetag (3 Stunden)
  assert.equal(ende(d(6, 22), d(6, 23), [1, 0]), "7. 1:00");
  // nach dem Beginn bleibt der Tag; gleich dem Beginn ist kein „vor“
  assert.equal(ende(d(6, 10), d(6, 11), [12, 30]), "6. 12:30");
  assert.equal(ende(d(6, 10), d(6, 11), [10, 0]), "6. 10:00");
  // Stunden, dann Minuten: „10“ springt kurz auf den Folgetag, „45“ zurück
  const zwischen = endFromTime(d(6, 10, 30), d(6, 12), [10, 0]);
  assert.equal(s(zwischen), "7. 10:00");
  assert.equal(ende(d(6, 10, 30), zwischen, [10, 45]), "6. 10:45");
  // schon über Mitternacht (unter 24 Stunden): rechnet vom Tag des Beginns
  assert.equal(ende(d(6, 22), d(7, 1), [23, 0]), "6. 23:00");
  assert.equal(ende(d(6, 22), d(7, 1), [2, 0]), "7. 2:00");
  // mehrtägig (von Hand gewählter Endtag): Tag bleibt
  assert.equal(ende(d(6, 10), d(8, 11), [9, 0]), "8. 9:00");
  // Monatsende
  assert.equal(ende(d(30, 23), d(30, 23, 30), [0, 30]), "1. 0:30");
});
