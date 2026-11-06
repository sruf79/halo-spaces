// Lädt extension/api/implementation.js ohne Thunderbird (schnelle Logik-Tests,
// Reihe „schnelle Logik-Tests“ 1/3). Thunderbirds Grundobjekte (ChromeUtils,
// Services, Cc, Ci, Cu …) sind Attrappen: jeder Zugriff liefert wieder eine
// Attrappe, Aufrufe tun nichts. Einstellungen (Services.prefs) liegen in einer
// Map, die die Tests setzen können. Die unveränderte Datei bekommt nur eine
// angehängte Zeile, die die Namen aus OFFEN herausreicht – wird einer
// umbenannt, scheitert der Lader-Test (lader.test.mjs) mit seinem Namen.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const SRC = fileURLToPath(new URL("../../extension/api/implementation.js", import.meta.url));

// ausgewählte innere Namen von implementation.js
export const OFFEN = ["Thanks", "TRANSLATIONS", "DE", "FR", "ES", "IT", "tr", "parseNatural", "TASK_LISTS", "taskListFilter",
  "DONATE_URL", "THANKS_UPDATE_DAY_PREF", "UpdateNote", "MULTIWEEK_BUFFER_WEEKS", "listDeleteText", "msgStillInFolder", "rowGone"];

// Attrappe: Funktion (aufrufbar, konstruierbar) hinter einem Proxy
function attrappe(name = "attrappe") {
  const f = function () {
    return attrappe(`${name}()`);
  };
  return new Proxy(f, {
    get(target, key) {
      if (key === Symbol.toPrimitive) {
        return () => "";
      }
      if (key === "then") {
        return undefined; // kein Promise
      }
      if (key === Symbol.iterator) {
        return function* () {};
      }
      if (!(key in target)) {
        target[key] = attrappe(`${name}.${String(key)}`);
      }
      return target[key];
    },
    apply: () => attrappe(`${name}()`),
    construct: () => attrappe(`new ${name}`),
  });
}

export function lade({ prefs = {}, os = "Darwin", locale = "en-US" } = {}) {
  const store = new Map(Object.entries(prefs));
  const lies = fallback => (key, def) => (store.has(key) ? store.get(key) : def ?? fallback);
  const Services = attrappe("Services");
  Services.appinfo.OS = os;
  Object.assign(Services.prefs, {
    getBoolPref: lies(false), getIntPref: lies(0), getCharPref: lies(""), getStringPref: lies(""),
    setBoolPref: (k, v) => store.set(k, v), setIntPref: (k, v) => store.set(k, v), setCharPref: (k, v) => store.set(k, v),
    setStringPref: (k, v) => store.set(k, v), clearUserPref: k => store.delete(k), prefHasUserValue: k => store.has(k),
    addObserver() {}, removeObserver() {},
  });
  Services.locale.appLocaleAsBCP47 = locale;
  Services.locale.regionalPrefsLocales = [locale];
  Services.wm.getEnumerator = () => [];
  const ChromeUtils = attrappe("ChromeUtils");
  ChromeUtils.importESModule = name => attrappe(name);
  ChromeUtils.defineESModuleGetters = () => {};
  const context = vm.createContext({
    ChromeUtils, Services, Cc: attrappe("Cc"), Ci: attrappe("Ci"), Cu: attrappe("Cu"), Cr: attrappe("Cr"),
    ObjC: attrappe("ObjC"), IOUtils: attrappe("IOUtils"), PathUtils: attrappe("PathUtils"),
    console, URL, TextEncoder, TextDecoder, Intl, structuredClone, setTimeout, clearTimeout,
  });
  context.globalThis = context;
  const src = readFileSync(SRC, "utf8") +
    `\n;globalThis.__offen = {${OFFEN.map(n => `${n}: typeof ${n} == "undefined" ? undefined : ${n}`).join(", ")}};\n`;
  vm.runInContext(src, context, { filename: SRC });
  return { ...context.__offen, prefs: store, context };
}
