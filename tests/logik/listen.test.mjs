// Aufgaben: Rückfrage beim Löschen einer Liste (eine Liste ist ein Kalender)
import { test } from "node:test";
import assert from "node:assert/strict";
import { lade } from "./lader.mjs";

test("Liste löschen: Art der Rückfrage folgt Thunderbirds removeModes", () => {
  const { listDeleteText } = lade();
  assert.equal(listDeleteText(["delete"], "A").kind, "delete");
  assert.equal(listDeleteText(["delete", "unsubscribe"], "A").kind, "both");
  assert.equal(listDeleteText(["unsubscribe"], "A").kind, "unsubscribe");
  assert.equal(listDeleteText(null, "A").kind, "unsubscribe"); // Thunderbirds Vorgabe
  assert.equal(listDeleteText(["other"], "A").kind, null);
});

test("Liste löschen: Termine des Kalenders werden genannt, nur wenn es welche gibt", () => {
  const { listDeleteText } = lade();
  const ohne = listDeleteText(["delete"], "Einkauf", 0).text;
  assert.match(ohne, /“Einkauf”/);
  assert.doesNotMatch(ohne, /event/);
  assert.match(listDeleteText(["delete"], "Einkauf", 1).text, /one event\. Deleting the list deletes it too/);
  assert.match(listDeleteText(["delete", "unsubscribe"], "Einkauf", 3).text, /3 events\. Deleting the list deletes them too/);
  assert.match(listDeleteText(["unsubscribe"], "Einkauf", 3).text, /3 events\. They will disappear from the calendar too/);
});

test("Liste löschen: Deutsch mit Platzhaltern", () => {
  const { listDeleteText } = lade({ locale: "de-DE" });
  const t = listDeleteText(["delete"], "Einkauf", 2).text;
  assert.match(t, /„Einkauf“/);
  assert.match(t, /2 Termine\. Sie werden mit der Liste gelöscht/);
});
