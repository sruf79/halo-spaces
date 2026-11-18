// Today-Pane-Wetter: Einheit der Temperatur nach der Region des Systems
import { test } from "node:test";
import assert from "node:assert/strict";
import { lade } from "./lader.mjs";

const { Weather } = lade();

test("Wetter: Fahrenheit in den USA und den übrigen Fahrenheit-Regionen, sonst Celsius", () => {
  for (const l of ["en-US", "es-US", "en", "en-BS", "en-BZ", "en-KY", "es-PR", "en-PW"]) {
    assert.equal(Weather.tempUnit(l), "F", l);
  }
  for (const l of ["de-AT", "de", "en-GB", "en-CA", "fr-FR", "en-AU", "ja-JP", "en-LR", "my-MM", "", "kein gültiges"]) {
    assert.equal(Weather.tempUnit(l), "C", l);
  }
});

test("Wetter: ausdrückliche Wahl im Gebietsschema (-u-mu-) geht der Region vor", () => {
  assert.equal(Weather.tempUnit("en-US-u-mu-celsius"), "C");
  assert.equal(Weather.tempUnit("de-AT-u-mu-fahrenhe"), "F");
  assert.equal(Weather.tempUnit("de-AT-u-ca-gregory-mu-fahrenhe"), "F");
});

test("Wetter: Temperatur gerundet mit Einheit, ohne Wert leer", () => {
  assert.equal(Weather.tempText(12.3, "de-AT"), "12 °C");
  assert.equal(Weather.tempText(12.3, "en-US"), "54 °F");
  assert.equal(Weather.tempText(-40, "en-US"), "-40 °F");
  assert.equal(Weather.tempText(0, "en-US"), "32 °F");
  assert.equal(Weather.tempText(null, "en-US"), "");
  assert.equal(Weather.tempText(undefined, "de-AT"), "");
});
