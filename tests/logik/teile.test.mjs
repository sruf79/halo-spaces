// Teile der Experiment-API (Reihe „Code: implementation.js in Module zerlegen“):
// implementation.js lädt jeden Teil mit loadPart(), und die umgezogenen Namen
// stehen in ihrem Teil statt in implementation.js
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import { lade } from "./lader.mjs";

// Teil → Namen, die dort (und nicht in implementation.js) erklärt sind
export const TEILE = {
  "texte.js": ["TRANSLATIONS"],
  "mail.js": ["UndoSend"],
  "bereiche.js": ["Weather"],
  "import.js": ["PstImport"],
  "kalender.js": ["parseNatural"],
  "grundlagen.js": ["LogoCache"],
  "unterhaltung.js": ["CONVERSATION_PREF", "CONVERSATION_NEWEST_PREF", "QUICK_REPLY_PREF", "ConversationCards", "foldQuotedHistory"],
  "oberflaeche.js": ["EnhancerOberflaeche"],
  "kalenderfenster.js": ["EnhancerKalender"],
  "halofenster.js": ["EnhancerHaloFenster"],
  "mailliste.js": ["EnhancerMailliste"],
  "mailkarten.js": ["EnhancerMailkarten"],
};

// Teile von CardEnhancer: Klasse im Teil → einige ihrer Methoden
export const CARD_TEILE = {
  EnhancerOberflaeche: ["styleSearch", "animateSidebar", "trackToolbarOffset", "hookMailContext"],
  EnhancerKalender: ["openQuickCreate", "animateTodayPane", "syncTodayModes", "fitSummaryDialog"],
  EnhancerHaloFenster: ["sendFeedback", "openHaloWindow", "wireHaloWindow"],
  EnhancerMailliste: ["hookConversation", "hookViewChoice", "patch", "decorateFolders"],
  EnhancerMailkarten: ["cardStyle", "mailSearch", "decorateHeader", "refreshPreviewsNow"],
};

const quelle = name => readFileSync(fileURLToPath(new URL(`../../extension/api/${name}`, import.meta.url)), "utf8");
const erklaert = (src, name) => new RegExp(`^(?:const|let|var|class|function)\\s+${name}\\b`, "m").test(src);

test("Teile: implementation.js lädt jeden Teil mit loadPart()", () => {
  const { context } = lade();
  const geladen = vm.runInContext("loadedParts", context);
  for (const teil of Object.keys(TEILE)) {
    assert.ok(geladen.includes(teil), `${teil} nicht geladen (geladen: ${geladen.join(", ")})`);
  }
});

test("Teile: umgezogene Namen stehen im Teil, nicht mehr in implementation.js", () => {
  const impl = quelle("implementation.js");
  for (const [teil, namen] of Object.entries(TEILE)) {
    const src = quelle(teil);
    for (const name of namen) {
      assert.ok(erklaert(src, name), `${name} fehlt in api/${teil}`);
      assert.ok(!erklaert(impl, name), `${name} steht noch in implementation.js`);
    }
  }
});

test("Teile: umgezogene Namen sind nach dem Laden da", () => {
  const { context } = lade();
  for (const namen of Object.values(TEILE)) {
    for (const name of namen) {
      assert.notEqual(vm.runInContext(`typeof ${name}`, context), "undefined", `${name} fehlt nach dem Laden`);
    }
  }
});

test("Teile: Methoden der CardEnhancer-Teile hängen an CardEnhancer, wie Klassenmethoden, keine doppelt", () => {
  const { context } = lade();
  const impl = quelle("implementation.js");
  for (const [klasse, beispiele] of Object.entries(CARD_TEILE)) {
    const namen = vm.runInContext(`Object.getOwnPropertyNames(${klasse}.prototype).filter(n => n != "constructor")`, context);
    for (const name of beispiele) {
      assert.ok(namen.includes(name), `${klasse}.${name} fehlt`);
    }
    for (const name of namen) {
      const [gleich, aufzaehlbar] = vm.runInContext(
        `[CardEnhancer.prototype.${name} === ${klasse}.prototype.${name}, Object.getOwnPropertyDescriptor(CardEnhancer.prototype, "${name}").enumerable]`, context);
      assert.ok(gleich, `CardEnhancer.prototype.${name} ist nicht die Methode aus ${klasse}`);
      assert.equal(aufzaehlbar, false, `CardEnhancer.prototype.${name} aufzählbar (anders als eine Klassenmethode)`);
      assert.ok(!new RegExp(`^  (?:async )?${name}\\(`, "m").test(impl), `${name} steht noch in implementation.js`);
    }
  }
});
