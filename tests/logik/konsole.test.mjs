// Vergleichsschlüssel der Fehlerkonsole (tests/logik/konsole-schluessel.js): Startmeldungen von Thunderbird mit und ohne
// halo.spaces nach Text vergleichen, ohne Zahlen, Pfade und Kennungen
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const quelle = readFileSync(fileURLToPath(new URL("./konsole-schluessel.js", import.meta.url)), "utf8");
const kontext = vm.createContext({});
vm.runInContext(quelle, kontext);
const schluessel = kontext.konsoleSchluessel;

test("Zahlen, Zeiten und Zähler fallen heraus", () => {
  assert.equal(schluessel("Timeout after 1500 ms (try 3)", ""), "Timeout after # ms (try #)");
  assert.equal(schluessel("at 12:03:44.512", ""), schluessel("at 09:59:01.007", ""));
});

test("Pfade: Profil, Programm und Temp ergeben denselben Schlüssel", () => {
  const a = schluessel("NS_ERROR_FILE_NOT_FOUND: /Users/a/Library/Thunderbird/Profiles/x1.default/prefs-1.js", "");
  const b = schluessel("NS_ERROR_FILE_NOT_FOUND: /tmp/halo-test-abc123/prefs-1.js", "");
  assert.equal(a, b);
  assert.equal(a, "NS_ERROR_FILE_NOT_FOUND: <pfad>/prefs-#.js");
  assert.equal(schluessel("kann C:\\Users\\x\\AppData\\Local\\Temp\\p1\\a.sqlite nicht öffnen", ""),
    "kann <pfad>/a.sqlite nicht öffnen");
  assert.equal(schluessel("Failed to load file:///private/var/folders/xy/T/halo/foo.json", ""), "Failed to load <pfad>/foo.json");
});

test("chrome:// und resource:// bleiben lesbar (nur Zahlen heraus)", () => {
  assert.equal(schluessel("Error in chrome://messenger/content/about3Pane.js", ""), "Error in chrome://messenger/content/about#Pane.js");
  assert.equal(schluessel("resource:///modules/MailServices.sys.mjs failed", ""), "resource:///modules/MailServices.sys.mjs failed");
});

test("UUIDs und lange Hexwerte werden zu <id>", () => {
  assert.equal(schluessel("window {0f1e2d3c-4b5a-6978-8796-a5b4c3d2e1f0} gone", ""), "window <id> gone");
  assert.equal(schluessel("hash 3fa9c0d1e2b4 mismatch", ""), "hash <id> mismatch");
  // Wörter aus lauter Hex-Buchstaben bleiben (kein Ziffernzeichen)
  assert.equal(schluessel("accepted deadbeef", ""), "accepted deadbeef");
});

test("Quelle: nur der Dateiname, ohne Zeile und Abfrage", () => {
  assert.equal(schluessel("x is undefined", "chrome://calendar/content/calendar-views.js?v=3"), "x is undefined @ calendar-views.js");
  assert.equal(schluessel("x is undefined", "file:///Applications/Thunderbird.app/Contents/Resources/omni.ja!/a.js"),
    schluessel("x is undefined", "file:///opt/tb/omni.ja!/a.js"));
  assert.equal(schluessel("x", ""), "x");
});

test("Leerraum zusammengefasst, Länge begrenzt", () => {
  assert.equal(schluessel("  a \n\t b  ", null), "a b");
  assert.equal(schluessel("y".repeat(500), "").length, 300);
});
