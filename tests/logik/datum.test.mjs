// Datum im Termin zum Eintippen: Ziffern je Feld (Tag, Monat, Jahr), Pfeiltasten, Monatskalender
import { test } from "node:test";
import assert from "node:assert/strict";
import { lade } from "./lader.mjs";

const { dateTypeDigit, dateFinish, dateStep, monthWeeks, daysInMonth } = lade();
// (Felder aus dem Lader stammen aus einem anderen Kontext – als JSON vergleichen)
const n = x => JSON.parse(JSON.stringify(x));

// tippt eine Folge von Ziffern ab dem Feld seg (Reihenfolge Tag, Monat, Jahr) und
// liefert den übernommenen Wert und das Feld am Ende
function tippe(start, seg, folge) {
  let value = start, buf = "";
  const segs = ["d", "m", "y"];
  for (const d of folge) {
    const r = dateTypeDigit(seg, buf, d, value);
    value = r.value;
    buf = r.buf;
    if (r.next && segs[segs.indexOf(seg) + 1]) {
      seg = segs[segs.indexOf(seg) + 1];
      buf = "";
    }
  }
  return [n(buf ? dateFinish(value) : value), seg];
}

test("Tag: zwei Ziffern, danach weiter zum Monat", () => {
  assert.deepEqual(tippe([2026, 10, 16], "d", "05"), [[2026, 10, 5], "m"]);
  assert.deepEqual(tippe([2026, 10, 16], "d", "28"), [[2026, 10, 28], "m"]);
});

test("Tag: eine Ziffer, die keinen zweistelligen Tag beginnen kann, geht gleich weiter", () => {
  assert.deepEqual(tippe([2026, 10, 16], "d", "4"), [[2026, 10, 4], "m"]);
  // Februar: „3“ kann keinen Tag 30+ beginnen
  assert.deepEqual(tippe([2026, 1, 16], "d", "3"), [[2026, 1, 3], "m"]);
});

test("Tag: zweite Ziffer, die nicht passt, beginnt neu", () => {
  assert.deepEqual(tippe([2026, 10, 16], "d", "35"), [[2026, 10, 5], "m"]);
});

test("Monat und Jahr: ganzes Datum am Stück, Tag wird an den Monat angepasst", () => {
  assert.deepEqual(tippe([2026, 10, 16], "d", "24122027"), [[2027, 11, 24], "y"]);
  assert.deepEqual(tippe([2026, 0, 31], "m", "2"), [[2026, 1, 28], "y"]);
  assert.deepEqual(tippe([2028, 0, 31], "m", "02"), [[2028, 1, 29], "y"]);
});

test("Jahr: angefangen zweistellig wird 20xx, vierstellig wie getippt", () => {
  assert.deepEqual(tippe([2026, 10, 16], "y", "27"), [[2027, 10, 16], "y"]);
  assert.deepEqual(tippe([2026, 10, 16], "y", "2031"), [[2031, 10, 16], "y"]);
  const r = n(dateTypeDigit("y", "", "2", [2026, 10, 16]));
  assert.equal(r.buf, "2");
  assert.equal(r.next, false);
});

test("Pfeiltasten ändern nur das gewählte Feld", () => {
  assert.deepEqual(n(dateStep("d", [2026, 10, 30], 1)), [2026, 10, 1]);
  assert.deepEqual(n(dateStep("d", [2026, 10, 1], -1)), [2026, 10, 30]);
  assert.deepEqual(n(dateStep("m", [2026, 11, 16], 1)), [2026, 0, 16]);
  assert.deepEqual(n(dateStep("m", [2026, 0, 31], 1)), [2026, 1, 28]);
  assert.deepEqual(n(dateStep("y", [2028, 1, 29], 1)), [2029, 1, 28]);
});

test("Monatskalender: sechs Wochen ab dem ersten Wochentag", () => {
  const w = n(monthWeeks(2026, 10, 1));
  assert.equal(w.length, 6);
  // November 2026 beginnt an einem Sonntag: erste Woche 26.10.–1.11.
  assert.deepEqual(w[0][0], [2026, 9, 26]);
  assert.deepEqual(w[0][6], [2026, 10, 1]);
  assert.deepEqual(w[5][0], [2026, 10, 30]);
  assert.deepEqual(w[5][6], [2026, 11, 6]);
  // Woche ab Sonntag
  assert.deepEqual(n(monthWeeks(2026, 10, 0))[0][0], [2026, 10, 1]);
  assert.equal(daysInMonth(2028, 1), 29);
});

test("Kurzes Datum: Reihenfolge und Trennzeichen aus dem Muster des Systems, Tag und Monat zweistellig, Jahr ganz", () => {
  const { systemDateFormat: fmt } = lade();
  const mit = locale => fmt(opts => new Intl.DateTimeFormat(locale, opts));
  const tag = new Date(2026, 10, 6);
  assert.equal(mit("de-AT").format(tag), "06.11.2026");
  assert.equal(mit("en-US").format(tag), "11/06/2026");
  assert.equal(mit("ja-JP").format(tag), "2026/11/06");
  // System mit zweistelligem Jahr („26.11.26“): angezeigt wird das ganze Jahr
  const kurz = fmt(() => ({ formatToParts: () => [{ type: "day", value: "16" }, { type: "literal", value: "." },
    { type: "month", value: "11" }, { type: "literal", value: "." }, { type: "year", value: "26" }] }));
  assert.equal(kurz.format(tag), "06.11.2026");
  assert.deepEqual(n(kurz.formatToParts(tag)).map(p => p.type), ["day", "literal", "month", "literal", "year"]);
  // Muster ohne Zahlen (z. B. Monatsname): wie bisher nach der Region
  const name = fmt(opts => (opts.dateStyle ? { formatToParts: () => [{ type: "month", value: "Nov" }] } : new Intl.DateTimeFormat("de-AT", opts)));
  assert.equal(name.format(tag), "06.11.2026");
});
