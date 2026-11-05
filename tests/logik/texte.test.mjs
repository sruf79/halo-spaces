// Übersetzungstabellen: jede Sprache kennt dieselben Texte; Platzhalter bleiben erhalten
import { test } from "node:test";
import assert from "node:assert/strict";
import { lade } from "./lader.mjs";

// bewusst nur in einzelnen Tabellen (Deutsch: „Updates“ heißt gleich; „en“ nur in der deutschen)
const AUSNAHMEN = new Set(["en", "Updates"]);

test("Texte: Französisch, Spanisch und Italienisch haben dieselben Schlüssel wie Deutsch", () => {
  const x = lade();
  const de = Object.keys(x.DE).filter(k => !AUSNAHMEN.has(k));
  for (const lang of ["FR", "ES", "IT"]) {
    const t = x[lang];
    const fehlt = de.filter(k => !(k in t));
    const zuviel = Object.keys(t).filter(k => !(k in x.DE) && !AUSNAHMEN.has(k));
    assert.deepEqual(fehlt, [], `${lang}: fehlende Übersetzungen`);
    assert.deepEqual(zuviel, [], `${lang}: Texte ohne deutsche Übersetzung`);
  }
});

test("Texte: Platzhalter {…} stehen auch in jeder Übersetzung, keine leeren Texte", () => {
  const x = lade();
  for (const lang of ["DE", "FR", "ES", "IT"]) {
    for (const [en, text] of Object.entries(x[lang])) {
      assert.ok(String(text).trim(), `${lang}: leer für „${en}“`);
      const want = (en.match(/\{\w+\}/g) || []).sort().join();
      const have = (String(text).match(/\{\w+\}/g) || []).sort().join();
      assert.equal(have, want, `${lang}: Platzhalter in „${en}“`);
    }
  }
});

test("Texte: tr() übersetzt und setzt Platzhalter ein, unbekannte Texte bleiben englisch", () => {
  const de = lade({ locale: "de-DE" });
  assert.equal(de.tr("New List"), "Neue Liste");
  assert.equal(de.tr("Kein Schlüssel {n}", { n: 3 }), "Kein Schlüssel 3");
  const en = lade({ locale: "en-US" });
  assert.equal(en.tr("New List"), "New List");
});
