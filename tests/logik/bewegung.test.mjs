// Takt der Ein-/Ausblend-Bewegungen: ein überlanges Bild hält die Bewegung an, statt sie zu verschlucken
import { test } from "node:test";
import assert from "node:assert/strict";
import { lade } from "./lader.mjs";

const { bildAnteil, BILD_MAX_MS, animiere } = lade();

test("bildAnteil: erstes Bild ohne Fortschritt, sonst Zeit seit dem vorigen Bild durch die Dauer", () => {
  assert.equal(bildAnteil(1000, null, 250), 0);
  assert.equal(bildAnteil(1016, 1000, 250), 16 / 250);
  assert.equal(bildAnteil(1050, 1000, 250), 50 / 250);
});

test("bildAnteil: ein langes Bild zählt höchstens BILD_MAX_MS, ein Zeitstempel vor dem vorigen Bild nichts", () => {
  assert.equal(BILD_MAX_MS, 50);
  assert.equal(bildAnteil(1300, 1000, 250), 50 / 250);
  assert.equal(bildAnteil(990, 1000, 250), 0);
  // „Bewegung reduzieren“ (Dauer 1 ms): weiter in einem Schritt am Ende
  assert.ok(bildAnteil(1016, 1000, 1) >= 1);
});

// Bildwechsel von Hand: jedes tick(ms) ruft die wartenden Rückrufe mit dem Zeitstempel auf
function fenster() {
  let wartend = [];
  return {
    requestAnimationFrame: f => wartend.push(f),
    tick(ms) {
      const jetzt = wartend;
      wartend = [];
      jetzt.forEach(f => f(ms));
    },
    get offen() {
      return wartend.length;
    },
  };
}

test("animiere: nach einem Bild von 300 ms steht eine Bewegung von 250 ms bei einem Fünftel, nicht am Ende", () => {
  const win = fenster(), bilder = [];
  let fertig = null;
  animiere(win, { dauer: 250, kurve: k => k, bild: p => bilder.push(p), ende: k => (fertig = k) });
  win.tick(0); // Aufbau abwarten
  win.tick(16); // erstes Bild: Anfang
  win.tick(316); // langes Bild
  assert.deepEqual(bilder, [0, 0.2]);
  assert.equal(fertig, null);
  for (let t = 332; win.offen; t += 16) {
    win.tick(t);
  }
  assert.equal(fertig, 1);
  assert.equal(bilder.at(-1), 1);
  // 0,8 Rest in Schritten von 16 ms: 13 weitere Bilder
  assert.equal(bilder.length, 2 + 13);
});

test("animiere: umkehren läuft mit derselben Grenze zurück zum Anfang", () => {
  const win = fenster(), bilder = [];
  let fertig = null;
  const a = animiere(win, { dauer: 100, kurve: k => k, bild: p => bilder.push(p), ende: k => (fertig = k) });
  win.tick(0);
  win.tick(10);
  win.tick(40);
  a.umkehren();
  win.tick(1000);
  assert.equal(fertig, 0);
  assert.deepEqual(bilder, [0, 0.3, 0]);
});
