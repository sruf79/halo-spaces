// Symbolleisten-Überlauf wie Apple Mail: Pillen weichen nur ganz, in fester Reihenfolge
import { test } from "node:test";
import assert from "node:assert/strict";
import { lade } from "./lader.mjs";

// (Felder aus dem vm-Kontext haben andere Prototypen)
const j = x => JSON.parse(JSON.stringify(x));

const MAIL = ["spacer", "get-messages", "write-message", "spacer", "reply", "reply-all", "forward-inline", "archive", "delete", "junk",
  "move-to", "mark-as", "spacer", "search-bar"];

test("Überlauf: Mail-Pillen weichen von rechts nach links und immer ganz", () => {
  const { overflowPills } = lade();
  assert.deepEqual(j(overflowPills(MAIL)), [["mark-as"], ["move-to"], ["archive", "delete", "junk"], ["reply", "reply-all", "forward-inline"]]);
});

test("Überlauf: Abrufen + Verfassen und „Neu“ weichen nie, fehlende Knöpfe fallen aus der Pille", () => {
  const { overflowPills } = lade();
  assert.deepEqual(j(overflowPills(["get-messages", "write-message", "reply", "forward-inline", "search-bar"])), [["reply", "forward-inline"]]);
  assert.deepEqual(j(overflowPills(["spacer", "new-event", "new-task", "spacer", "search-bar"])), []);
  assert.deepEqual(j(overflowPills(["create-contact", "create-address-book", "create-list"])), [["create-address-book", "create-list"]]);
});

test("Überlauf: Knöpfe von Add-ons weichen zuerst, jeder als eigene Pille, von rechts", () => {
  const { overflowPills } = lade();
  assert.deepEqual(j(overflowPills(["write-message", "addon-a", "reply", "addon-b", "search-bar"])), [["addon-b"], ["addon-a"], ["reply"]]);
  assert.deepEqual(j(overflowPills([])), []);
});

test("Überlauf: geöffnetes Suchfeld braucht Platz für Lupe + Platzhalter, sonst weichen weitere Pillen (GitHub #67)", () => {
  const { searchLack } = lade();
  // zu: wie bisher – breiter als die Lupe genügt, als Lupe festgehalten ebenso
  assert.equal(searchLack(42, false, false, 178), 0);
  assert.equal(searchLack(40, false, false, 178), 2);
  assert.equal(searchLack(40, false, true, 178), 0);
  // offen (Klick auf die Lupe): 42 px genügen nicht (so blieb es unter Linux stehen), erst 160 px bzw. der kürzere Platzhalter
  assert.equal(searchLack(42, true, false, 178), 117);
  assert.equal(searchLack(159.4, true, false, 178), 0);
  assert.equal(searchLack(158, true, false, 178), 1);
  assert.equal(searchLack(120, true, false, 120), 0);
  assert.equal(searchLack(100, true, false, 0), 59);
});
