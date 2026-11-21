// Zuschnitt eines Symbols für die Einstellungs-Kategorie (cropSvg): neuer viewBox, nur die Kachel
// fällt weg – ein Rechteck im clipPath bleibt (sonst zeigte die Kategorie ein leeres weißes Quadrat)
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { lade } from "./lader.mjs";

const { cropSvg } = lade();
const LOGO = readFileSync(fileURLToPath(new URL("../../extension/about/icon.svg", import.meta.url)), "utf8");
const rects = t => t.match(/<rect\b[^>]*\/>/g) || [];

test("Zuschnitt: Logo behält das Rechteck im clipPath und die fünf Teile, nur die Kachel fällt weg", () => {
  const out = cropSvg(LOGO, "3 3 58 58");
  assert.match(out, /viewBox="3 3 58 58"/);
  assert.match(out, /<clipPath id="k"><rect\b[^>]*\/><\/clipPath>/);
  assert.equal(rects(out).length, rects(LOGO).length - 1);
  assert.ok(!out.includes('<rect class="k" x="2" y="2" width="60" height="60" rx="14"/><g'), "Kachel ist noch da");
  for (const farbe of ["#0A84FF", "#30B850", "#FF8A00", "#FF2D78", "#AF52DE"]) {
    assert.ok(out.includes(`stroke="${farbe}"`), farbe);
  }
});

test("Zuschnitt: ohne defs fällt das erste Rechteck weg, ohne Rechteck bleibt alles", () => {
  const alt = '<svg viewBox="0 0 64 64"><rect x="2" y="2" width="60" height="60" fill="#FFF"/><circle r="5"/></svg>';
  assert.equal(cropSvg(alt, "3 3 58 58"), '<svg viewBox="3 3 58 58"><circle r="5"/></svg>');
  const ohne = '<svg viewBox="0 0 64 64"><defs><mask id="m"><rect width="9" height="9"/></mask></defs><circle r="5"/></svg>';
  assert.equal(cropSvg(ohne, "1 1 2 2"), ohne.replace("0 0 64 64", "1 1 2 2"));
});
