// Kopie des Designs im Profil („Design ohne Aufblitzen“, EarlyTheme): gilt nur, wenn Version UND Stand des Designs
// passen. Ein Testpaket mit derselben Versionsnummer wie das letzte Release, aber anderem theme.css (Lichtschein
// 14.11.2026) galt sonst als aktuell, theme.css wurde gar nicht geladen und neue Regeln fehlten
import { test } from "node:test";
import assert from "node:assert/strict";
import { lade } from "./lader.mjs";

test("Designkopie: Prüfsumme stabil, anderer Inhalt gibt eine andere", () => {
  const { EarlyTheme } = lade();
  assert.match(EarlyTheme.hash("a"), /^[0-9a-f]{8}$/);
  assert.equal(EarlyTheme.hash("#a[mc-glow] {}"), EarlyTheme.hash("#a[mc-glow] {}"));
  assert.notEqual(EarlyTheme.hash("#a {}"), EarlyTheme.hash("#a[mc-glow] {}"));
  assert.equal(EarlyTheme.hash(""), "811c9dc5");
});

test("Designkopie: gleiche Version, anderes Design gilt als veraltet; alte Kopfzeile ohne Stand ebenso", () => {
  const x = lade();
  const E = x.EarlyTheme;
  x.context.extensionVersion = "3.27.0";
  const neu = "#spacesToolbar[mc-glow] {}";
  const kopf = (v, css) => `${E.HEAD}${v} Stand ${E.hash(css)} – nicht von Hand ändern, wird ersetzt */\n${css}`;
  assert.equal(E.current(kopf("3.27.0", neu), neu), true, "passend");
  assert.equal(E.versionOf(kopf("3.27.0", neu)), "3.27.0", "Version wie bisher lesbar (update_test)");
  assert.equal(E.current(kopf("3.27.0", "#alt {}"), neu), false, "gleiche Version, altes Design");
  assert.equal(E.current(kopf("3.26.0", neu), neu), false, "andere Version");
  assert.equal(E.current(`${E.HEAD}3.27.0 – nicht von Hand ändern, wird ersetzt */\n${neu}`, neu), false, "Kopfzeile ohne Stand");
  assert.equal(E.stampOf("/* meine eigene */"), null, "fremde Datei");
});

test("Designkopie: schon geladene alte Kopie aus dem Profil wird geleert, ein fremdes Stilblatt des Nutzers nicht", () => {
  // Update ohne Neustart (3.30.0): die beim Programmstart geladene alte Kopie galt neben dem neuen Design weiter
  const x = lade();
  const E = x.EarlyTheme;
  E.url = "file:///profil/chrome/userChrome.css";
  const blatt = (href, regeln) => ({ href, cssRules: regeln.map(vars => ({ style: vars && { getPropertyValue: n => vars[n] || "" } })) });
  const eigenes = blatt(E.url, [{ "--mt-accent": "AccentColor" }, {}]);
  const nachImport = blatt(E.url, [null, { "--mt-accent": "AccentColor" }]); // erste Regel ohne style (@-Regel)
  const fremd = blatt(E.url, [{ color: "red" }, {}, {}, { "--mt-accent": "x" }]);
  const anderes = blatt("chrome://messenger/skin/messenger.css", [{ "--mt-accent": "AccentColor" }]);
  const geleert = [], entfernt = [];
  const win = {
    __mcSheet: E.url,
    document: {},
    windowUtils: { USER_SHEET: 1, removeSheetUsingURIString: (u, art) => entfernt.push([u, art]) },
    InspectorUtils: {
      getAllStyleSheets: () => [anderes, fremd, eigenes, nachImport],
      parseStyleSheet: (s, text) => { geleert.push([s, text]); s.cssRules = []; },
    },
  };
  assert.equal(E.ours(eigenes), true);
  assert.equal(E.ours(nachImport), true);
  assert.equal(E.ours(fremd), false, "nur die ersten Regeln zählen");
  E.retire(win);
  assert.deepEqual(geleert.map(g => g[0]), [eigenes, nachImport]);
  assert.ok(geleert.every(g => g[1] === ""));
  assert.deepEqual(entfernt, [[E.url, 1]], "von der vorigen Fassung in Inhaltsseiten geladene Kopie abgemeldet");
  assert.equal("__mcSheet" in win, false);
  E.retire(win);
  assert.equal(geleert.length, 2, "zweiter Aufruf leert nichts erneut");
});
