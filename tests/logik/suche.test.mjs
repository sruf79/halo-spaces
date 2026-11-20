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

// Vorschlagsmenü der Mail-Suche (api/suchvorschlag.js)
test("Suchvorschläge: Personen zuerst (jede Adresse einmal, höchstens drei), dann Betreff und Text, zuletzt frühere Suchen", () => {
  const { searchSuggestRows } = lade();
  const personen = [{ name: "Anna Beispiel", address: "anna@example.invalid" }, { name: "Beispiel, Anna", address: "ANNA@example.invalid" },
    { name: "", address: "bert@example.invalid" }, { name: "Liste", address: "Liste" }, { name: "Cleo", address: "cleo@example.invalid" },
    { name: "Dora", address: "dora@example.invalid" }];
  const zeilen = Array.from(searchSuggestRows(" an ", personen, ["Anna Rechnung", "an", "Plan", "anderes", "Kanne", "wand", "x"]), z => ({ ...z }));
  assert.deepEqual(zeilen.slice(0, 5), [
    { kind: "person", value: "anna@example.invalid", name: "Anna Beispiel" },
    { kind: "person", value: "bert@example.invalid", name: "bert@example.invalid" },
    { kind: "person", value: "cleo@example.invalid", name: "Cleo" },
    { kind: "subject", value: "an" },
    { kind: "body", value: "an" },
  ]);
  // frühere Suchen: nur was den Text enthält, nicht der Text selbst, insgesamt höchstens acht Zeilen
  assert.deepEqual(zeilen.slice(5).map(z => [z.kind, z.value]), [["recent", "Anna Rechnung"], ["recent", "Plan"], ["recent", "anderes"]]);
  assert.equal(zeilen.length, 8);
});

test("Suchvorschläge: leerer Text ohne Zeilen, ohne Personen nur Betreff und Text", () => {
  const { searchSuggestRows } = lade();
  assert.equal(searchSuggestRows("  ", [{ name: "A", address: "a@example.invalid" }], ["alt"]).length, 0);
  assert.deepEqual(Array.from(searchSuggestRows("zebra"), z => z.kind), ["subject", "body"]);
});

test("Frühere Suchen: neueste zuerst, jede einmal, höchstens zehn, Einzelzeichen nicht", () => {
  const { searchRecentAdd } = lade();
  assert.deepEqual([...searchRecentAdd(["alt", "Zebra"], " zebra ")], ["zebra", "alt"]);
  assert.deepEqual([...searchRecentAdd(["alt"], "x")], ["alt"]);
  assert.deepEqual([...searchRecentAdd("kaputt", "neu")], ["neu"]);
  const viele = Array.from({ length: 12 }, (_, i) => `suche ${i}`);
  const liste = [...searchRecentAdd(viele, "neu")];
  assert.equal(liste.length, 10);
  assert.equal(liste[0], "neu");
});

test("Eingrenzungen: Suchfelder je Kapsel, Person nach Wahl From, To oder Any; Leeres fällt weg", () => {
  const { searchFilterSpecs, searchCapText } = lade();
  const filter = [{ kind: "person", field: "from", value: "anna@example.invalid", name: "Anna" }, { kind: "person", field: "to", value: "b@example.invalid" },
    { kind: "person", field: "any", value: "c@example.invalid" }, { kind: "person", value: "d@example.invalid" },
    { kind: "subject", value: " rechnung " }, { kind: "body", value: "text" }, { kind: "subject", value: " " }, { kind: "unbekannt", value: "x" }];
  assert.deepEqual(Array.from(searchFilterSpecs(filter), s => [s.attrib, s.value]), [["Sender", "anna@example.invalid"], ["ToOrCC", "b@example.invalid"],
    ["AllAddresses", "c@example.invalid"], ["Sender", "d@example.invalid"], ["Subject", "rechnung"], ["Body", "text"]]);
  assert.equal(searchFilterSpecs(null).length, 0);
  assert.deepEqual({ ...searchCapText(filter[0]) }, { label: "From", value: "Anna" });
  assert.deepEqual({ ...searchCapText(filter[1]) }, { label: "To", value: "b@example.invalid" });
  assert.deepEqual({ ...searchCapText(filter[4]) }, { label: "Subject", value: " rechnung " });
  assert.deepEqual({ ...searchCapText(filter[5]) }, { label: "Message", value: "text" });
});
