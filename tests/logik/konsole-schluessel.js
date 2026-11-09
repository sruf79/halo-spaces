// Vergleichsschlüssel einer Thunderbird-Meldung der Fehlerkonsole (Vergleichslauf ohne halo.spaces, tests/halo_test.py):
// dieselbe Meldung soll in jedem Lauf denselben Schlüssel ergeben, auch wenn sich Zahlen (Zeilen, Zeiten, Zähler),
// Pfade (Profil, Programm, Temp) oder Kennungen (UUIDs, lange Hexwerte) ändern. Verglichen wird nach Text, nicht nach
// Anzahl – Thunderbirds eigene Startfehler schwanken. Reines Skript ohne Module: halo_test.py stellt es dem JS in
// Thunderbird voran, konsole.test.mjs lädt es mit node:vm.
function konsoleSchluessel(text, quelle) {
  const glatt = s => String(s || "")
    // Datei-URLs: nur der Dateiname bleibt (Profil und Programmordner wechseln)
    .replace(/\b(?:jar:)?file:\/\/[^\s'"()<>,!]*/gi, m => "<pfad>/" + (m.replace(/[?#].*$/, "").split(/[\\/]/).filter(Boolean).pop() || ""))
    // absolute Pfade (Unix und Windows), nicht der Pfadteil einer URL (chrome://…, resource://… bleiben)
    .replace(/(?<![:\/\w.])(?:[A-Za-z]:)?(?:[\\/][\w.@~+-]+){2,}/g, m => "<pfad>/" + m.split(/[\\/]/).pop())
    .replace(/\{?\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b\}?/gi, "<id>")
    .replace(/\b(?=[0-9a-f]*\d)(?=[0-9a-f]*[a-f])[0-9a-f]{8,}\b/gi, "<id>")
    .replace(/\d+(?:[.,:]\d+)*/g, "#")
    .replace(/\s+/g, " ").trim();
  const datei = String(quelle || "").replace(/[?#].*$/, "").split(/[\\/]/).filter(Boolean).pop() || "";
  return glatt(text).slice(0, 300) + (datei ? " @ " + glatt(datei) : "");
}
