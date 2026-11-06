// Mailliste: Zeilen, deren Position es in der Ansicht nicht mehr gibt, werden nicht gefüllt
import { test } from "node:test";
import assert from "node:assert/strict";
import { lade } from "./lader.mjs";

const zeile = (index, rowCount) => ({ _index: index, view: rowCount == null ? null : { rowCount } });

test("Zeile: Position innerhalb der Ansicht wird gefüllt", () => {
  const { rowGone } = lade();
  assert.equal(rowGone(zeile(0, 3)), false);
  assert.equal(rowGone(zeile(2, 3)), false);
});

test("Zeile: Position hinter dem Ende, ohne Ansicht oder ohne Position wird ausgelassen", () => {
  const { rowGone } = lade();
  assert.equal(rowGone(zeile(3, 3)), true);
  assert.equal(rowGone(zeile(5, 0)), true);
  assert.equal(rowGone(zeile(-1, 3)), true);
  assert.equal(rowGone(zeile(0, null)), true);
  assert.equal(rowGone({ view: { rowCount: 3 } }), true);
  assert.equal(rowGone(null), true);
  const wirft = { _index: 0, get view() { throw new Error("NS_ERROR_FAILURE"); } };
  assert.equal(rowGone(wirft), true);
});
