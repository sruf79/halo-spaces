// Danke-Erinnerung (Thanks): Plan der Nutzungstage, Fenster von 7 Tagen, nicht neben einem Update-Hinweis
import { test } from "node:test";
import assert from "node:assert/strict";
import { lade } from "./lader.mjs";

const P = "extensions.mailcards.thanks.";

test("Danke: Erinnerung am 14., 35., 67. … Nutzungstag", () => {
  const { Thanks } = lade();
  assert.deepEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map(n => Thanks.dueDay(n)), [14, 35, 67, 114, 185, 291, 451, 690, 1049, 1414]);
});

test("Danke: fällig ab dem Plantag für 7 Nutzungstage, davor und danach nicht", () => {
  for (const [days, due] of [[13, false], [14, true], [20, true], [21, false]]) {
    const { Thanks } = lade({ prefs: { [P + "usageDays"]: days, [P + "count"]: 0 } });
    assert.equal(Thanks.due(), due, `Tag ${days}`);
  }
});

test("Danke: keine Erinnerung, solange ein Update bereitliegt oder am Tag des Update-Hinweises", () => {
  const x = lade({ prefs: { [P + "usageDays"]: 14, [P + "count"]: 0 } });
  assert.equal(x.Thanks.due(), true);
  x.UpdateNote.pending = { version: "99.0.0", auto: false };
  assert.equal(x.Thanks.due(), false, "Update bereit");
  x.UpdateNote.pending = null;
  x.prefs.set(x.THANKS_UPDATE_DAY_PREF, x.Thanks.today());
  assert.equal(x.Thanks.due(), false, "Update-Hinweis heute");
  x.prefs.set(x.THANKS_UPDATE_DAY_PREF, "2000-01-01");
  assert.equal(x.Thanks.due(), true, "Update-Hinweis an einem anderen Tag");
});

test("Danke: ein unbeachteter Plantag ist nach 7 Nutzungstagen erledigt", () => {
  const x = lade({ prefs: { [P + "usageDays"]: 20, [P + "count"]: 0, [P + "lastDay"]: "2000-01-01" } });
  x.Thanks.countDay();
  assert.equal(x.prefs.get(P + "usageDays"), 21);
  assert.equal(x.prefs.get(P + "count"), 1);
  assert.equal(x.Thanks.due(), false);
});
