// Textzerlegung der Mailliste: Initialen, benannte Zeichen, HTML im Text-Teil, Vorschautext
import { test } from "node:test";
import assert from "node:assert/strict";
import { lade } from "./lader.mjs";

test("Initialen: erstes und letztes Wort, sonst aus der Adresse", () => {
  const { initialsFor } = lade();
  assert.equal(initialsFor("Anna Maria Huber", ""), "AH");
  assert.equal(initialsFor('"Ölz, Peter"', ""), "ÖP");
  assert.equal(initialsFor("", "max.mustermann@example.at"), "MM");
  assert.equal(initialsFor("a@b.at", "jo_doe@example.at"), "JD");
  assert.equal(initialsFor("", "123@example.at"), "?");
  assert.equal(initialsFor(null, null), "?");
});

test("Benannte Zeichen: Namen, Nummern, Großschreibung; Unbekanntes bleibt", () => {
  const { decodeEntities } = lade();
  assert.equal(decodeEntities("A&amp;B &#x41; &#65; &hellip; &AUML;"), "A&B A A … ä");
  assert.equal(decodeEntities("&foo;"), "&foo;");
  assert.equal(decodeEntities("x&#99999999;"), "x ");
  assert.equal(decodeEntities("a&zwnj;b"), "ab");
});

test("HTML im Text-Teil: Tags, Stile und angeschnittene Reste fallen weg", () => {
  const { stripHtml } = lade();
  assert.equal(stripHtml("<html><style>p{}</style><p>Hallo&nbsp;Welt</p><scr").trim(), "Hallo Welt");
  assert.equal(stripHtml("<div>a</div><!-- kommentar").trim(), "a");
  assert.equal(stripHtml("<body><style>angeschnitten").trim(), "");
  // Text ohne HTML bleibt unangetastet (auch „<“ als Vergleich)
  assert.equal(stripHtml("a < b"), "a < b");
});

test("Vorschautext: ohne Zitate, Links, Bildverweise und Füllzeichen, höchstens 300 Zeichen", () => {
  const { cleanPreview } = lade();
  assert.equal(cleanPreview("Hallo​ Welt\n> Zitat\nhttps://example.at/y mehr <https://a.example> [image: logo.png] ende"),
    "Hallo Welt mehr ende");
  assert.equal(cleanPreview(null), "");
  assert.equal(cleanPreview("x".repeat(400)).length, 300);
});
