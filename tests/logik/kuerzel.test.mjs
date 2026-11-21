// Tastenkürzel für Seitenleiste und Today-Pane je System (macOS ⌃⌘S/⌃⌘T, Windows und Linux Strg+B/Strg+T)
import { test } from "node:test";
import assert from "node:assert/strict";
import { lade } from "./lader.mjs";

const j = x => JSON.parse(JSON.stringify(x));

test("Kürzel: macOS behält ⌃⌘S und ⌃⌘T", () => {
  const { paneShortcut } = lade();
  assert.deepEqual(j(paneShortcut("sidebar", "Darwin")), { key: "s", modifiers: "accel,control" });
  assert.deepEqual(j(paneShortcut("today", "Darwin")), { key: "t", modifiers: "accel,control" });
});

test("Kürzel: Windows und Linux bekommen Strg+B und Strg+T", () => {
  const { paneShortcut } = lade();
  for (const os of ["WINNT", "Linux"]) {
    assert.deepEqual(j(paneShortcut("sidebar", os)), { key: "b", modifiers: "accel" });
    assert.deepEqual(j(paneShortcut("today", os)), { key: "t", modifiers: "accel" });
  }
});

test("Kürzel: Strg+B bleibt in einem Feld mit Formatierung fett, sonst gilt jedes Kürzel", () => {
  const { paneShortcutBlocked } = lade();
  for (const os of ["WINNT", "Linux"]) {
    assert.equal(paneShortcutBlocked("sidebar", os, true), true);
    assert.equal(paneShortcutBlocked("sidebar", os, false), false);
    assert.equal(paneShortcutBlocked("today", os, true), false);
    assert.equal(paneShortcutBlocked("today", os, false), false);
  }
  // macOS: ⌃⌘S und ⌃⌘T sind in keinem Textfeld belegt
  assert.equal(paneShortcutBlocked("sidebar", "Darwin", true), false);
  assert.equal(paneShortcutBlocked("today", "Darwin", true), false);
});
