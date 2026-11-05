// Der Lader findet alle herausgereichten Namen (ein umbenannter Name fällt hier auf)
import { test } from "node:test";
import assert from "node:assert/strict";
import { lade, OFFEN } from "./lader.mjs";

test("Lader: implementation.js lädt ohne Thunderbird, alle Namen aus OFFEN sind da", () => {
  const x = lade();
  for (const name of OFFEN) {
    assert.notEqual(x[name], undefined, `${name} fehlt in implementation.js (umbenannt? dann OFFEN in tests/logik/lader.mjs anpassen)`);
  }
});
