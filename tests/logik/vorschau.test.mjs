// Mailliste: Vorschau-Abruf lässt inzwischen gelöschte/verschobene Mails aus
import { test } from "node:test";
import assert from "node:assert/strict";
import { lade } from "./lader.mjs";

const kopf = (keys, key, wirft = false) => ({
  messageKey: key,
  folder: {
    get msgDatabase() {
      if (wirft) {
        throw new Error("NS_ERROR_FAILURE");
      }
      return { containsKey: k => keys.includes(k) };
    },
  },
});

test("Vorschau: Mail noch im Ordner", () => {
  const { msgStillInFolder } = lade();
  assert.equal(msgStillInFolder(kopf([1, 2], 2)), true);
});

test("Vorschau: gelöschte Mail, fehlender Ordner oder Datenbank gilt als weg", () => {
  const { msgStillInFolder } = lade();
  assert.equal(msgStillInFolder(kopf([1], 2)), false);
  assert.equal(msgStillInFolder({ messageKey: 1, folder: null }), false);
  assert.equal(msgStillInFolder({ messageKey: 1, folder: { msgDatabase: null } }), false);
  assert.equal(msgStillInFolder(kopf([1], 1, true)), false);
  assert.equal(msgStillInFolder(null), false);
});
