// Konto lokal archivieren 3/3: wiederholter Lauf kopiert nur Neues, Kontakte und
// Kalender des Kontos werden erkannt
import { test } from "node:test";
import assert from "node:assert/strict";
import { lade } from "./lader.mjs";

// Felder aus dem vm-Kontext in hiesige umwandeln (sonst vergleicht deepEqual die Herkunft mit)
const eq = (a, b) => assert.deepEqual([...a], b);

test("Archiv: Schlüssel einer Mail ist die Message-ID, ohne sie Datum, Absender und Betreff", () => {
  const { ArchiveAccount: A } = lade();
  assert.equal(A.msgKey({ messageId: "abc@x.invalid" }), "abc@x.invalid");
  assert.equal(A.msgKey({ messageId: "<abc@x.invalid>" }), "abc@x.invalid");
  const ohne = A.msgKey({ messageId: "", date: 5, author: "Dora", subject: "Hallo" });
  assert.equal(ohne, "~5|Dora|Hallo");
  assert.notEqual(ohne, A.msgKey({ messageId: "", date: 6, author: "Dora", subject: "Hallo" }));
});

test("Archiv: zweiter Lauf kopiert genau die neuen Mails, keine Duplikate", () => {
  const { ArchiveAccount: A } = lade();
  const m = id => ({ messageId: id });
  const key = h => A.msgKey(h);
  // erster Lauf: Archiv leer, alles neu
  const quelle = [m("a"), m("b"), m("c")];
  eq(A.newOnly(quelle, [], key).fresh.map(key), ["a", "b", "c"]);
  // zweiter Lauf: zwei neue Mails am Server, Archiv hat a, b, c
  const r = A.newOnly([...quelle, m("d"), m("e")], quelle, key);
  eq(r.fresh.map(key), ["d", "e"]);
  assert.equal(r.known, 3);
  // gleiche Anzahl, aber andere Mails: früher übersprungen, jetzt kopiert
  eq(A.newOnly([m("x"), m("y")], [m("a"), m("b")], key).fresh.map(key), ["x", "y"]);
  // doppelte Message-ID in der Quelle nur einmal
  eq(A.newOnly([m("a"), m("a"), m("f")], [], key).fresh.map(key), ["a", "f"]);
  // Archiv mit spitzen Klammern, Quelle ohne: gleich
  assert.equal(A.newOnly([m("a")], [m("<a>")], key).fresh.length, 0);
});

test("Archiv: Adressbuch und Kalender gehören zum Konto nur über Adresse oder Identität", () => {
  const { ArchiveAccount: A } = lade();
  const who = { emails: new Set(["halo@example.invalid"]), identities: new Set(["id1"]) };
  assert.ok(A.isLinkedBook({ carddav: true, username: "Halo@Example.invalid" }, who));
  assert.ok(!A.isLinkedBook({ carddav: true, username: "anders@example.invalid" }, who));
  assert.ok(!A.isLinkedBook({ carddav: false, username: "halo@example.invalid" }, who)); // lokales Buch
  assert.ok(!A.isLinkedBook({ carddav: true, username: "" }, who));
  assert.ok(A.isLinkedCalendar({ identity: "id1" }, who));
  assert.ok(A.isLinkedCalendar({ username: "halo@example.invalid" }, who));
  assert.ok(!A.isLinkedCalendar({ identity: "id2", username: "x@example.invalid" }, who));
  assert.ok(!A.isLinkedCalendar({}, who));
});

test("Archiv: Kontakte und Termine nur Neues über die UID", () => {
  const { ArchiveAccount: A } = lade();
  const r = A.newOnly([{ UID: "1" }, { UID: "2" }, { UID: "3" }], [{ UID: "2" }], c => c.UID);
  eq(r.fresh.map(c => c.UID), ["1", "3"]);
  assert.equal(r.known, 1);
});
