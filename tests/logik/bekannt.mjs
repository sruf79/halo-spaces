// Bekannte Fehler als Test festhalten (Konvention aus dem Comment Ranker, „Known gaps“; Gegenstück zu
// check(…, bekannt=True) in tests/halo_test.py): bekannterFehler("…", () => { assert… }) ist grün, solange der
// Fehler besteht (die Prüfung scheitert), und rot, sobald er – auch nebenbei – behoben ist; dann in einen normalen
// test() umwandeln. So fallen mitbehobene Bugs sofort auf.
import { test } from "node:test";

// wirft, wenn fn durchläuft (der Fehler also behoben ist)
export async function bestehtNoch(name, fn) {
  try {
    await fn();
  } catch {
    return; // der Fehler besteht noch – so erwartet
  }
  throw new Error(`behoben? „${name}“ läuft jetzt durch – in einen normalen Test umwandeln`);
}

export function bekannterFehler(name, fn) {
  test(`BEKANNTER FEHLER: ${name}`, () => bestehtNoch(name, fn));
}
