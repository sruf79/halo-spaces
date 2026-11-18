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

test("Natürlich: ungültiges Datum („31.02.“, „0.5.“, „17.13.“, „31. Februar“, „Feb 30“) wird nicht erkannt statt in den Folgemonat zu rutschen", () => {
  for (const text of ["Termin 31.02.", "Termin 0.5.", "Termin 17.13.", "Termin 31.4.2027", "Party 31. Februar", "Feb 30 lunch"]) {
    const r = parseNatural(text, NOW);
    assert.equal(r.title, text, text);
    assert.equal(r.start, undefined, text);
  }
  // gültige Grenzfälle bleiben
  assert.equal(parseNatural("Silvester 31.12.", NOW).start.getTime(), new Date(2026, 11, 31).getTime());
  assert.equal(parseNatural("Schalttag 29.2.2028", NOW).start.getTime(), new Date(2028, 1, 29).getTime());
});

test("Natürlich: „nächsten Donnerstag“/„next Thursday“ ist der Tag in der nächsten Kalenderwoche, ohne Zusatz das nächste Vorkommen", () => {
  // Woche ab Montag (calendar.week.start = 1); NOW ist Donnerstag, 5.11.: nächste Woche 9.–15.11.
  const tag = text => parseNatural(text, NOW).start.getDate();
  assert.equal(tag("Lunch Freitag"), 6);
  assert.equal(tag("Lunch next Friday"), 13);
  assert.equal(tag("Lunch nächsten Freitag"), 13);
  assert.equal(tag("Lunch Donnerstag"), 12);
  assert.equal(tag("Lunch nächsten Donnerstag"), 12);
  assert.equal(tag("Lunch next Monday"), 9);
  assert.equal(tag("Lunch nächster Sonntag"), 15);
  assert.equal(parseNatural("Lunch next Friday", NOW).title, "Lunch");
  // Woche ab Sonntag: gemessen mit der Datumserkennung von macOS am Mittwoch, 18.11.2026
  const us = lade({ prefs: { "calendar.week.start": 0 } }).parseNatural;
  const MI = new Date(2026, 10, 18, 3, 0);
  const erwartet = { "Lunch next Thursday": 26, "Lunch Thursday": 19, "Lunch next Saturday": 28, "Lunch Saturday": 21,
    "Lunch next Wednesday": 25, "Lunch Wednesday": 25, "Lunch next Monday": 23, "Lunch next Sunday": 22, "Lunch next Tuesday": 24 };
  for (const [text, d] of Object.entries(erwartet)) {
    assert.equal(us(text, MI).start.getDate(), d, text);
  }
});

test("Natürlich: „29.2.“ ohne Jahr im Jahr vor einem Schaltjahr → 29. Februar des Schaltjahres, sonst nicht erkannt", () => {
  const vorSchaltjahr = new Date(2027, 10, 18, 10, 0); // 18. November 2027, nächster 29.2. ist 2028
  for (const text of ["Schalttag 29.2.", "Schalttag 29. Februar", "Leap day Feb 29"]) {
    const r = parseNatural(text, vorSchaltjahr);
    assert.equal(r.start?.getTime(), new Date(2028, 1, 29).getTime(), text);
  }
  // im Schaltjahr selbst vor dem 29.2. weiterhin dieses Jahr
  assert.equal(parseNatural("Schalttag 29.2.", new Date(2028, 0, 10)).start.getTime(), new Date(2028, 1, 29).getTime());
  // kein Schaltjahr als nächstes Vorkommen: nicht erkannt statt still 1. März
  for (const now of [NOW, new Date(2027, 0, 15), new Date(2028, 2, 1)]) {
    const r = parseNatural("Schalttag 29.2.", now);
    assert.equal(r.start, undefined, String(now));
    assert.equal(r.title, "Schalttag 29.2.");
  }
});
