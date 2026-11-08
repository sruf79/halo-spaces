// Kalender: Emoji-Regeln für Termintitel (eingebaute und eigene Stichwörter)
import { test } from "node:test";
import assert from "node:assert/strict";
import { lade } from "./lader.mjs";

test("Emoji: Stämme, ganze Wörter und Sonderfälle", () => {
  const { emojiFor } = lade();
  assert.equal(emojiFor("Zahnarzt"), "🦷");
  assert.equal(emojiFor("Meeting mit Team"), "👥");
  assert.equal(emojiFor("Einkommensteuer"), "💰");
  assert.equal(emojiFor("Steuerungsgruppe"), "");
  // „bad“ nur als ganzes Wort
  assert.equal(emojiFor("Bad putzen"), "🛁");
  assert.equal(emojiFor("Badminton"), "");
});

test("Emoji: kein zusätzliches bei Emoji im Titel oder leerem Titel", () => {
  const { emojiFor } = lade();
  assert.equal(emojiFor("🎉 Party"), "");
  assert.equal(emojiFor(""), "");
  assert.equal(emojiFor(null), "");
});

test("Emoji: eigene Stichwörter zuerst, ungültige Zeilen werden ignoriert", () => {
  const PREF = "extensions.mailcards.emojiCustom";
  const { emojiFor, resetEmojiRules, prefs } = lade({ prefs: { [PREF]: "Yoga = 🧘\nZahnarzt: 🪥\nkaputt = x" } });
  assert.equal(emojiFor("Yoga am Abend"), "🧘");
  assert.equal(emojiFor("Zahnarzt"), "🪥");
  assert.equal(emojiFor("kaputt"), "");
  // geänderte Einstellung gilt erst nach resetEmojiRules (Zwischenspeicher)
  prefs.set(PREF, "");
  assert.equal(emojiFor("Zahnarzt"), "🪥");
  resetEmojiRules();
  assert.equal(emojiFor("Zahnarzt"), "🦷");
});
