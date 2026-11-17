// Aufgaben archivieren: Merkmal im Eintrag, Ansicht „Archived“ zeigt nur Archiviertes, alle anderen nichts davon
import { test } from "node:test";
import assert from "node:assert/strict";
import { lade } from "./lader.mjs";

const aufgabe = (props = {}, todo = true) => ({ isTodo: () => todo, getProperty: k => props[k] ?? null });

test("Archiv: Merkmal X-HALO-ARCHIVED=1 nur bei Aufgaben, sonst nicht archiviert", () => {
  const { isTaskArchived, TASK_ARCHIVED_PROP } = lade();
  assert.equal(TASK_ARCHIVED_PROP, "X-HALO-ARCHIVED");
  assert.equal(isTaskArchived(aufgabe({ "X-HALO-ARCHIVED": "1" })), true);
  assert.equal(isTaskArchived(aufgabe()), false);
  assert.equal(isTaskArchived(aufgabe({ "X-HALO-ARCHIVED": "0" })), false);
  assert.equal(isTaskArchived(aufgabe({ "X-HALO-ARCHIVED": "1" }, false)), false); // Termine nie
  assert.equal(isTaskArchived(null), false);
  assert.equal(isTaskArchived({ isTodo: () => true, getProperty() { throw new Error("x"); } }), false);
});

test("Archiv: „Archived“ steht direkt unter „Important“ und zeigt nur Archiviertes", () => {
  const { TASK_LISTS, taskInList } = lade();
  const keys = TASK_LISTS.map(([k]) => k);
  assert.equal(keys.indexOf("archived"), keys.indexOf("important") + 1);
  assert.equal(TASK_LISTS.find(([k]) => k == "archived")[1], "Archived");
  for (const key of keys) {
    assert.equal(taskInList(key, true), key == "archived", `${key} archiviert`);
    assert.equal(taskInList(key, false), key != "archived", `${key} offen`);
  }
});

test("Archiv: Aktion für die Auswahl – alle archiviert → zurückholen, sonst archivieren", () => {
  const { archiveAction } = lade();
  assert.equal(archiveAction([]), null);
  assert.equal(archiveAction(null), null);
  assert.equal(archiveAction([false]), "archive");
  assert.equal(archiveAction([true, false]), "archive");
  assert.equal(archiveAction([true, true]), "unarchive");
});

test("Archiv: Texte übersetzt", () => {
  const de = lade({ locale: "de-DE" });
  assert.equal(de.tr("Archived"), "Archiviert");
  assert.equal(de.tr("Archive"), "Archivieren");
  assert.equal(de.tr("Unarchive"), "Zurückholen");
});
