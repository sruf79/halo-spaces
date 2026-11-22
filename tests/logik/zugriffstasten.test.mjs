// Zugriffsbuchstaben unter Windows und Linux erst mit Alt unterstrichen, macOS unverändert
import { test } from "node:test";
import assert from "node:assert/strict";
import { lade } from "./lader.mjs";

const j = x => JSON.parse(JSON.stringify(x));

test("Zugriffstasten: Striche nur unter Windows und Linux ausgeblendet, nie am Mac", () => {
  const { accessCuesHidden } = lade();
  assert.equal(accessCuesHidden("WINNT", 18, false), true);
  assert.equal(accessCuesHidden("Linux", 18, false), true);
  assert.equal(accessCuesHidden("Darwin", 18, false), false);
  assert.equal(accessCuesHidden("Darwin", 0, false), false);
  // ohne Zugriffstasten (ui.key.menuAccessKey 0) gibt es nichts auszublenden
  assert.equal(accessCuesHidden("WINNT", 0, false), false);
  // Systemeinstellung „Zugriffstasten immer unterstreichen“ an: Striche bleiben
  assert.equal(accessCuesHidden("WINNT", 18, true), false);
});

test("Zugriffstasten: Systemeinstellung aus UserPreferencesMask (Bit 0x20 im ersten Byte)", () => {
  const { keyboardCuesFromMask } = lade();
  assert.equal(keyboardCuesFromMask(String.fromCharCode(0x9e, 0x1e, 0x07, 0x80)), false);
  assert.equal(keyboardCuesFromMask(String.fromCharCode(0xbe, 0x1e, 0x07, 0x80)), true);
  assert.equal(keyboardCuesFromMask(""), false);
  assert.equal(keyboardCuesFromMask(null), false);
});

test("Zugriffstasten: Alt zeigt, Alt allein lässt stehen, Alt mit Taste, Escape, Klick und Fensterwechsel nehmen weg", () => {
  const { accessCuesStep } = lade();
  const lauf = evs => evs.reduce((s, ev) => accessCuesStep(s, ev), { shown: false, combo: false });
  const altDown = { type: "keydown", key: "Alt", altKey: true, ctrlKey: false };
  const altUp = { type: "keyup", key: "Alt", altKey: false, ctrlKey: false };
  assert.equal(lauf([altDown]).shown, true);
  assert.equal(lauf([altDown, altUp]).shown, true);
  assert.equal(lauf([altDown, { type: "keydown", key: "s", altKey: true }, altUp]).shown, false);
  assert.equal(lauf([altDown, altUp, { type: "keydown", key: "Escape" }]).shown, false);
  assert.equal(lauf([altDown, altUp, { type: "mousedown" }]).shown, false);
  assert.equal(lauf([altDown, { type: "blur" }]).shown, false);
  // Tippen ohne Alt ändert nichts
  assert.equal(lauf([altDown, altUp, { type: "keydown", key: "a", altKey: false }]).shown, true);
  assert.equal(lauf([{ type: "keydown", key: "a", altKey: false }]).shown, false);
  // AltGr (Strg+Alt) zeigt keine Striche
  assert.equal(lauf([{ type: "keydown", key: "Alt", altKey: true, ctrlKey: true }]).shown, false);
  assert.deepEqual(j(accessCuesStep(undefined, { type: "keyup", key: "a" })), { shown: false, combo: false });
});
