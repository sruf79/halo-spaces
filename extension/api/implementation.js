/* halo.spaces – Erweiterung zum Design (Vorschau, Absenderbilder, Adressbuch, Bereiche).
 *
 * Hängt sich in die Thread-Karten jedes about:3pane-Fensters ein und ergänzt
 *  - eine zweizeilige Textvorschau (aus der Vorschau-Eigenschaft der Nachricht,
 *    bei Bedarf über folder.fetchMsgPreviewText nachgeladen),
 *  - ein rundes Absenderbild: Adressbuchfoto → BIMI-Logo → Website-Icon → Initialen.
 */

"use strict";

var { ExtensionCommon } = ChromeUtils.importESModule(
  "resource://gre/modules/ExtensionCommon.sys.mjs"
);
var { MailServices } = ChromeUtils.importESModule(
  "resource:///modules/MailServices.sys.mjs"
);
var { DNS } = ChromeUtils.importESModule("resource:///modules/DNS.sys.mjs");
var { NetUtil } = ChromeUtils.importESModule("resource://gre/modules/NetUtil.sys.mjs");
var { MsgHdrToMimeMessage } = ChromeUtils.importESModule(
  "resource:///modules/gloda/MimeMessage.sys.mjs"
);
var { ExtensionSupport } = ChromeUtils.importESModule(
  "resource:///modules/ExtensionSupport.sys.mjs"
);
var { setTimeout, clearTimeout, setInterval, clearInterval } = ChromeUtils.importESModule(
  "resource://gre/modules/Timer.sys.mjs"
);

// ---------------------------------------------------------------------------
// Teile der Experiment-API in eigenen Dateien neben dieser (api/…): in
// dieselbe Umgebung laden, ihre Namen gelten danach hier wie eigene
// (Reihe „Code: implementation.js in Module zerlegen“). texte.js: DE, FR, ES,
// IT und TRANSLATIONS – die Texte der Oberfläche; die übrigen (mail.js,
// bereiche.js, import.js, kalender.js, grundlagen.js, unterhaltung.js …)
// weiter unten an ihrer alten Stelle geladen
// ---------------------------------------------------------------------------
// geladene Teile in ihrer Reihenfolge (für die Prüfung „Teile geladen“)
const loadedParts = [];
function loadPart(name) {
  const url = String(new Error().fileName).replace(/[^/]*$/, name);
  Services.scriptloader.loadSubScriptWithOptions(url, { target: globalThis, allowUnsafeURL: true });
  loadedParts.push(name);
}
loadPart("texte.js");
// tr("+{n} more", { n: 3 }) – Platzhalter in geschweiften Klammern
function uiLanguage() {
  const lang = Services.locale.appLocaleAsBCP47.split("-")[0];
  return TRANSLATIONS[lang] ? lang : "en";
}
// Datums- und Zeitformat wie im System eingestellt (Region), nicht nach der
// Sprache von Thunderbird (sonst 19/11/2026 statt 19.11.2026)
function regionLocale() {
  return Services.locale.regionalPrefsLocales?.[0] || Services.locale.appLocaleAsBCP47;
}
// Kurzes Datum zum Anzeigen und Eintippen in Reihenfolge und mit Trennzeichen
// des Systems (macOS: Sprache & Region → Datumsformat, z. B. 26.11.2026 auch
// bei englischem Thunderbird mit Region, deren Sprache 26/11/2026 schreibt);
// Tag und Monat zweistellig, Jahr ganz. Services.intl übernimmt das Muster des
// Systems nur bei dateStyle, nicht bei einzeln angegebenen Feldern.
// make: liefert den Formatierer zu Optionen (Logik-Tests)
function systemDateFormat(make = opts => new Services.intl.DateTimeFormat(undefined, opts)) {
  const NUMERIC = ["day", "month", "year"];
  let sample = null;
  try {
    sample = make({ dateStyle: "short" }).formatToParts(new Date(2026, 10, 16));
  } catch {
    // gewollt: ohne Muster des Systems wie bisher nach der Region
  }
  const usable = sample && NUMERIC.every(t => sample.filter(p => p.type == t && /^\d+$/.test(p.value)).length == 1);
  if (!usable) {
    return make({ day: "2-digit", month: "2-digit", year: "numeric" });
  }
  const parts = sample.filter(p => p.type == "literal" || NUMERIC.includes(p.type)).map(p => ({ type: p.type, value: p.value }));
  return {
    formatToParts(date) {
      const value = { day: String(date.getDate()).padStart(2, "0"), month: String(date.getMonth() + 1).padStart(2, "0"), year: String(date.getFullYear()) };
      return parts.map(p => ({ type: p.type, value: p.type == "literal" ? p.value : value[p.type] }));
    },
    format(date) {
      return this.formatToParts(date).map(p => p.value).join("");
    },
  };
}

// („Text|Zusammenhang“: gleiches englisches Wort, andere Übersetzung – z. B.
// „Open|tasks“ = „Offen“ statt „Öffnen“; angezeigt wird nur der Text)
function tr(english, vars = null) {
  const text = TRANSLATIONS[uiLanguage()]?.[english] ?? english.split("|")[0];
  return vars ? text.replace(/\{(\w+)\}/g, (all, key) => (key in vars ? String(vars[key]) : all)) : text;
}

const STYLE_ID = "mail-cards-style";
const TOOLBAR_PREF = "extensions.mailcards.toolbarApplied";
const PREVIEW_PREF = "extensions.mailcards.previewLines";
// Lichtschein und gefärbte Trennlinie in der Seitenleiste (Maintainer 13.11.2026), Standard an
const GLOW_PREF = "extensions.mailcards.sidebarGlow";
// Filter über der Mailliste wie Apple Mail: Klick schaltet ihn ein, Halten
// oder Rechtsklick wählt die Bedingungen (alle müssen zutreffen); Schlüssel
// sind Thunderbirds Schnellfilter, Standard „Ungelesen“
const FILTER_PREF = "extensions.mailcards.filterBy";
const FILTER_CHOICES = [
  ["unread", "Unread"],
  ["starred", "Starred"],
  ["addrBook", "Only from Contacts"],
  ["attachment", "Only Mail with Attachments"],
];
// Sortierungen im Menü „Sort by“ in Apples Reihenfolge mit den Namen der
// Richtung: [Eintrag threadPaneSortBy…Menuitem, [aufsteigend, absteigend]].
// Über die ID, weil die Werte der Einträge je Version anders heißen (ESR 153
// „dateCol“, ab 159 „byDate“). Achtung: beim Stern heißt aufsteigend bei
// Thunderbird „markierte zuerst“
const SORT_CHOICES = [
  ["Attachments", ["Without Attachments First", "With Attachments First"]],
  ["Date", ["Oldest Message on Top", "Newest Message on Top"]],
  ["Flag", ["Starred First", "Starred Last"]],
  ["From", ["A to Z", "Z to A"]],
  ["Size", ["Smallest First", "Largest First"]],
  ["Subject", ["A to Z", "Z to A"]],
  ["Recipient", ["A to Z", "Z to A"]],
  ["Unread", ["Unread First", "Unread Last"]],
  ["Tags", ["A to Z", "Z to A"]],
];
// Kontaktfoto bzw. Initialen links in den Karten (Drei-Punkte-Menü über der Liste)
const CONTACT_PHOTOS_PREF = "extensions.mailcards.contactPhotos";
// Reihenfolge wie in der Apple-Mail-Toolbar: Abrufen, Verfassen | Abstand |
// Antworten, Allen antworten, Weiterleiten | Archiv, Löschen, Spam |
// Verschieben | Markieren | Abstand | Suchfeld ganz rechts. Die beiden
// Abstände wachsen gleich, so steht die Mittelgruppe zwischen „Verfassen“
// und Suchfeld mittig; bei Platzmangel schrumpfen sie zuerst.
const APPLE_TOOLBAR = [
  "spacer",
  "get-messages",
  "write-message",
  "spacer",
  "reply",
  "reply-all",
  "forward-inline",
  "archive",
  "delete",
  "junk",
  "move-to",
  "mark-as",
  "spacer",
  "search-bar",
];
// Gleiches Layout in den übrigen Bereichen: Knöpfe links, Suchfeld rechts.
// Adressbuch: „Neuer Kontakt“ (mit Text) | Kapsel „Neues Adressbuch · Neue Liste“.
// bis 3.12 Vorgabe im Adressbuch – unverändert übernommen, wird sie durch die
// neue ersetzt (Anlegen jetzt über das „+“ über der Kontaktliste)
// bis 3.27 Vorgabe der Mail ohne Abstand nach „Verfassen“ – unverändert
// übernommen, wird sie durch die neue ersetzt
const OLD_MAIL_TOOLBAR = APPLE_TOOLBAR.filter((id, i) => i != 3);
const OLD_ADDRESSBOOK_TOOLBAR = ["spacer", "create-contact", "create-address-book", "create-list", "spacer", "search-bar"];
const SPACE_TOOLBARS = {
  addressbook: ["spacer", "spacer", "search-bar"],
  calendar: ["spacer", "new-event", "new-task", "spacer", "search-bar"],
  tasks: ["spacer", "new-task", "new-event", "spacer", "search-bar"],
  chat: ["spacer", "spacer", "search-bar"],
  settings: ["spacer", "spacer", "search-bar"],
};
// Feedback aus dem Hilfe-Menü geht an diese Adresse
const FEEDBACK_ADDRESS = "halo.cat@icloud.com";
// „Danke sagen“ im Info-Fenster; UTM-Parameter zeigen in Google Analytics
// der Spendenseite, dass der Aufruf aus halo.spaces kam
const DONATE_URL = "https://buymeacoffee.com/diversion"
  + "?utm_source=halo.spaces&utm_medium=thunderbird-addon&utm_campaign=donate&utm_content=about-window";
const CACHE_FILE = "mail-cards-logos.json";
const DAY = 24 * 60 * 60 * 1000;
const HIT_TTL = 30 * DAY;
const MISS_TTL = 7 * DAY;
const FETCH_TIMEOUT = 6000;
// Texte mit „Mac“ bzw. „macOS“ nur dort
const IS_MAC = Services.appinfo.OS == "Darwin";
// Faktor aus Thunderbirds Schriftgröße (≡ → Schriftgröße): gewählte durch
// Standardgröße des Systems, 1 bei Standardgröße. Die Einstellung direkt
// lesen: Thunderbirds eigener Beobachter kann nach unserem laufen
function fontScale() {
  try {
    const { UIFontSize } = ChromeUtils.importESModule("resource:///modules/UIFontSize.sys.mjs");
    const pref = Services.prefs.getIntPref("mail.uifontsize", 0);
    const os = UIFontSize.osValue;
    if (pref && os) {
      const size = Math.min(Math.max(pref, UIFontSize.MIN_VALUE), UIFontSize.MAX_VALUE);
      return Math.round(size / os * 1000) / 1000;
    }
  } catch {} // gewollt: ohne UIFontSize bzw. Wert Faktor 1
  return 1;
}

// Kontofarben – überall gleich (Mail, Adressbuch): die in den
// Kontoeinstellungen gewählte Farbe, sonst die nächste freie aus der Palette
// in Kontenreihenfolge (von anderen Konten gewählte Farben ausgelassen, erst
// wenn alle vergeben sind, wiederholt sich die Palette). Adressbücher heißen
// wie ihr Konto (Google, iCloud) und bekommen dieselbe; andere Namen eine
// feste Farbe aus dem Namen.
const ACCOUNT_PALETTE = ["#0A84FF", "#30B850", "#FF8A00", "#FF2D78", "#AF52DE", "#8E8E93"];
function accountColors() {
  const colors = new Map();
  try {
    const { FolderTreeProperties } = ChromeUtils.importESModule("resource:///modules/FolderTreeProperties.sys.mjs");
    const servers = [];
    for (const account of MailServices.accounts.accounts) {
      const server = account.incomingServer;
      if (server && server.type != "none" && !servers.includes(server)) {
        servers.push(server);
      }
    }
    const own = servers.map(server => FolderTreeProperties.getColor(server.rootFolder.URI));
    const taken = new Set(own.filter(Boolean).map(c => c.toLowerCase()));
    let free = ACCOUNT_PALETTE.filter(c => !taken.has(c.toLowerCase()));
    let next = 0;
    servers.forEach((server, i) => {
      if (colors.has(server.prettyName)) {
        return;
      }
      let color = own[i];
      if (!color) {
        if (next >= free.length) {
          free = ACCOUNT_PALETTE;
          next = 0;
        }
        color = free[next++];
      }
      colors.set(server.prettyName, color);
    });
  } catch {} // gewollt: Konten nicht lesbar, Farben aus der Palette
  return colors;
}
function accountColor(name) {
  return accountColors().get(name)
    ?? ACCOUNT_PALETTE[[...String(name)].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) >>> 0, 7) % ACCOUNT_PALETTE.length];
}
// Farbpunkt vor Konto- und Adressbuchnamen (Ordnerliste, Adressbuchliste):
// --mc-acc an der Zeile, gezeichnet von userChrome.css
function colorAccountRows(doc, restorers = null) {
  const paint = () => {
    // Kontonamen bei jedem Lauf frisch lesen: umbenannte oder neue Konten
    // sollen ihren Punkt sofort bekommen, nicht erst nach einem Neustart
    const names = new Set();
    try {
      for (const server of MailServices.accounts.allServers) {
        if (server.type != "none") {
          names.add(server.prettyName); // „Lokale Ordner“ bleibt ohne Farbe
        }
      }
    } catch {} // gewollt: ohne Konten keine Farbpunkte
    for (const li of doc.querySelectorAll("#folderTree li, #books li.bookRow")) {
      const name = (li.querySelector(":scope > .container .name, .bookRow-name")?.textContent || "").trim();
      if (names.has(name)) {
        const c = accountColor(name);
        if (li.style.getPropertyValue("--mc-acc") != c) {
          li.style.setProperty("--mc-acc", c);
        }
      } else if (li.style.getPropertyValue("--mc-acc")) {
        li.style.removeProperty("--mc-acc");
      }
    }
  };
  paint();
  if (!doc.__mcAccRows) {
    doc.__mcAccRows = true;
    const target = doc.getElementById("folderTree") || doc.getElementById("books");
    let mo = null;
    if (target) {
      let pending = false;
      mo = new doc.defaultView.MutationObserver(() => {
        if (!pending) {
          pending = true;
          doc.defaultView.setTimeout(() => { pending = false; paint(); }, 50);
        }
      });
      mo.observe(target, { childList: true, subtree: true });
    }
    const obs = { observe: () => paint() };
    Services.obs.addObserver(obs, "server-color-changed");
    let removed = false;
    const cleanup = () => {
      mo?.disconnect();
      if (!removed) {
        removed = true;
        try {
          Services.obs.removeObserver(obs, "server-color-changed");
        } catch {} // gewollt: Beobachter schon entfernt
      }
    };
    doc.defaultView.addEventListener("unload", cleanup, { once: true });
    // beim Abschalten/Update: sonst malt die alte Fassung weiter
    restorers?.push(() => {
      cleanup();
      delete doc.__mcAccRows;
    });
  }
}

// sehr dunkle Farben (Schwarz, Dunkelgrau) brauchen im Dunkelmodus Hilfe
function isVeryDark(color) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(color).trim());
  if (!m) {
    return false;
  }
  const n = parseInt(m[1], 16);
  return 0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255) < 70;
}

// Adressbuch: „Total contacts …“ unten erscheint erst, wenn alle Bücher
// geladen sind – bis dahin bleibt die Zeile leer. Den zuletzt gezeigten Text
// merken und sofort zeigen; Thunderbird ersetzt ihn mit dem aktuellen Wert.
const CARD_COUNT_PREF = "extensions.mailcards.cardCountText";
function cacheCardCount(doc, restorers = null) {
  const el = doc?.getElementById("cardCount");
  if (!el || el.__mcCached) {
    return;
  }
  el.__mcCached = true;
  if (!el.textContent.trim()) {
    el.textContent = Services.prefs.getStringPref(CARD_COUNT_PREF, "");
  }
  const remember = () => {
    const text = el.textContent.trim();
    // nur die Gesamtzahl „aller Adressbücher“ merken (so öffnet das Adressbuch)
    if (text && el.hasAttribute("data-l10n-id") && doc.getElementById("books")?.selectedIndex == 0 &&
        text != Services.prefs.getStringPref(CARD_COUNT_PREF, "")) {
      Services.prefs.setStringPref(CARD_COUNT_PREF, text);
    }
  };
  remember();
  const mo = new doc.defaultView.MutationObserver(remember);
  mo.observe(el, { childList: true, characterData: true, subtree: true });
  restorers?.push(() => {
    mo.disconnect();
    delete el.__mcCached;
  });
}

// Einstellungen → Appearance: „Erscheinungsbild“ Automatisch / Hell / Dunkel.
// Schaltet zwischen Thunderbirds eingebauten Themes um; das Design folgt dem
// über prefers-color-scheme (die Themes „System“, „Light“, „Dark“).
const APPEARANCE_THEMES = {
  auto: "default-theme@mozilla.org",
  light: "thunderbird-compact-light@mozilla.org",
  dark: "thunderbird-compact-dark@mozilla.org",
};
// Kennung dieser geladenen Fassung: Einfügungen einer älteren Fassung (Update
// ohne Neustart, 3.2.0 räumte sie nicht weg) werden ersetzt statt übernommen
const HOOK_OWNER = {};
// vorhandenes Element dieser Fassung liefern, das einer älteren entfernen
function ownedElement(doc, id) {
  const el = doc.getElementById(id);
  if (el && el.__mcOwner !== HOOK_OWNER) {
    el.remove();
    return null;
  }
  return el;
}

// Adressbuch: kleine Überschrift über der Liste wie „Favoriten“ in der Mail
// und „Kalender“ im Kalender
function hookBooksHeader(cw, restorers = null) {
  const doc = cw.document;
  const books = doc.getElementById("books");
  if (!books || ownedElement(doc, "mcBooksHeader")) {
    return;
  }
  const header = doc.createElement("div");
  header.id = "mcBooksHeader";
  header.__mcOwner = HOOK_OWNER;
  header.textContent = tr("Address Books");
  books.before(header);
  restorers?.push(() => header.remove());
}

function hookAppearanceChoice(cw, restorers = null) {
  const doc = cw.document;
  const colorGroup = doc.getElementById("colorGroup");
  if (!colorGroup) {
    return;
  }
  const existing = ownedElement(doc, "mcAppearanceGroup");
  if (existing) {
    // Thunderbird blendet beim Seitenwechsel alles ohne passende Kategorie aus
    existing.setAttribute("data-category", "paneAppearance");
    existing.hidden = colorGroup.hidden;
    return;
  }
  const X = "http://www.w3.org/1999/xhtml";
  const group = doc.createElementNS(X, "fieldset");
  group.id = "mcAppearanceGroup";
  group.__mcOwner = HOOK_OWNER;
  group.setAttribute("data-category", "paneAppearance");
  group.hidden = colorGroup.hidden;
  const legend = doc.createElementNS(X, "legend");
  legend.textContent = tr("Appearance");
  // Bildauswahl wie Thunderbirds „Message list view style“ (Klasse appearance-options):
  // drei Kacheln Hell, Dunkel, Auto mit Fenstergrafik wie in den Systemeinstellungen
  const label = doc.createXULElement("label");
  label.setAttribute("value", tr(IS_MAC ? "Light, dark or follow macOS" : "Light, dark or follow the system"));
  label.setAttribute("control", "mcAppearance");
  const list = doc.createXULElement("radiogroup");
  list.id = "mcAppearance";
  list.className = "indent appearance-options mc-appearance-tiles";
  for (const [value, text, tip] of [["light", tr("Light")], ["dark", tr("Dark")], ["auto", tr("Auto"), tr(IS_MAC ? "Automatic (like macOS)" : "Automatic (like the system)")]]) {
    const item = doc.createXULElement("radio");
    item.id = `mcAppearance-${value}`;
    item.setAttribute("value", value);
    item.setAttribute("label", text);
    if (tip) {
      item.setAttribute("tooltiptext", tip);
    }
    list.appendChild(item);
  }
  const row = doc.createXULElement("vbox");
  row.append(label, list);
  // eigenes Theme (keins der drei): nur ein Hinweis, nichts wird umgestellt (GitHub #55)
  const note = doc.createElementNS(X, "p");
  note.id = "mcThemeNote";
  note.className = "mc-theme-note";
  note.textContent = tr("You are using a custom theme. It can change how halo.spaces looks. If something looks wrong, try the default theme first.");
  note.hidden = true;
  group.append(legend, row, note);
  colorGroup.before(group);
  restorers?.push(() => group.remove());
  const { AddonManager } = ChromeUtils.importESModule("resource://gre/modules/AddonManager.sys.mjs");
  const sync = async () => {
    const themes = await AddonManager.getAddonsByTypes(["theme"]);
    const active = themes.find(a => a.isActive)?.id;
    const key = Object.keys(APPEARANCE_THEMES).find(k => APPEARANCE_THEMES[k] == active);
    if (key) {
      list.value = key;
    } else {
      // keine der drei Wahlen trifft zu: Auswahl leer statt fälschlich „Auto“
      list.selectedIndex = -1;
    }
    note.hidden = !!key || !active;
  };
  sync();
  // Theme anderswo gewechselt (Add-ons-Verwaltung): Auswahl und Hinweis nachziehen
  const listener = {
    onEnabled: a => a.type == "theme" && sync(),
    onDisabled: a => a.type == "theme" && sync(),
  };
  AddonManager.addAddonListener(listener);
  const stop = () => AddonManager.removeAddonListener(listener);
  cw.addEventListener("unload", stop, { once: true });
  restorers?.push(stop);
  list.addEventListener("command", async () => {
    const addon = APPEARANCE_THEMES[list.value] && await AddonManager.getAddonByID(APPEARANCE_THEMES[list.value]);
    await addon?.enable();
  });
}

// Einstellungen → „Chat & More“ (Kategorie Chat): oben die Wahl für den fünften
// Platz der Bereichsleiste (Chat, Bereich einer Erweiterung, Webseite, nichts),
// darunter Thunderbirds Chat-Einstellungen – nur, wenn dort Chat gewählt ist;
// sonst steht an ihrer Stelle ein Hinweis, was der Platz gerade zeigt.
// Schreibt dieselben Einstellungen wie früher die halo.spaces-Seite.
function hookChatCategory(cw, restorers = null) {
  const doc = cw.document;
  const X = "http://www.w3.org/1999/xhtml";
  const cat = doc.getElementById("category-chat");
  // Name der Kategorie und Überschrift der Seite
  const renamed = [];
  for (const el of [cat?.querySelector(".category-name"), doc.querySelector("#chatPaneCategory h1")]) {
    if (el && !el.hasAttribute("mc-renamed")) {
      renamed.push([el, el.getAttribute("data-l10n-id")]);
      el.setAttribute("mc-renamed", "");
      el.removeAttribute("data-l10n-id");
      el.textContent = tr("Chat & More");
    }
  }
  if (cat) {
    cat.setAttribute("tooltiptext", tr("Chat & More"));
  }
  if (renamed.length) {
    restorers?.push(() => {
      for (const [el, id] of renamed) {
        el.removeAttribute("mc-renamed");
        if (id) {
          el.setAttribute("data-l10n-id", id);
        }
      }
    });
  }
  const header = doc.getElementById("chatPaneCategory");
  if (!header || ownedElement(doc, "mcFifthGroup")) {
    return;
  }
  const el = (tag, props = {}) => Object.assign(doc.createElementNS(X, tag), props);
  const group = el("fieldset", { id: "mcFifthGroup" });
  group.__mcOwner = HOOK_OWNER;
  group.setAttribute("data-category", "paneChat");
  const rows = {};
  const row = (key, text, control) => {
    const box = doc.createXULElement("hbox");
    box.setAttribute("align", "center");
    box.className = "mc-fifth-row";
    const label = doc.createXULElement("label");
    label.setAttribute("value", text);
    label.setAttribute("flex", "1");
    box.append(label, control);
    rows[key] = box;
    group.append(box);
  };
  const menu = (id, onPick) => {
    const list = doc.createXULElement("menulist");
    list.id = id;
    list.appendChild(doc.createXULElement("menupopup"));
    list.addEventListener("command", () => onPick(list.value));
    return list;
  };
  const getPref = (pref, def) => Services.prefs.getStringPref(pref, def);
  const setPref = (pref, def, value) => {
    if (value === def) {
      Services.prefs.clearUserPref(pref); // Standard: nichts im Profil speichern
    } else {
      Services.prefs.setStringPref(pref, value);
    }
  };
  group.append(el("legend", { textContent: tr("Fifth space") }));
  const spacesOf = () => FifthSpace.addonSpaces(Services.wm.getMostRecentWindow("mail:3pane")) || [];
  const kind = menu("mcFifthSpace", v => {
    // Bereich einer Erweiterung: gleich die angezeigte (erste) wählen, sonst bliebe der Platz leer
    const first = spacesOf()[0]?.name;
    if (v == "addon" && first && !spacesOf().some(a => a.name == getPref(FIFTH_ADDON_PREF, ""))) {
      setPref(FIFTH_ADDON_PREF, "", first);
    }
    setPref(FIFTH_PREF, "chat", v);
  });
  const addon = menu("mcFifthSpaceAddon", v => setPref(FIFTH_ADDON_PREF, "", v));
  const url = el("input", { id: "mcFifthSpaceUrl", type: "text", placeholder: "https://…", spellcheck: false });
  url.className = "mc-fifth-url";
  const saveURL = () => {
    const normal = FifthSpace.normalizeURL(url.value);
    if (normal === null) {
      url.value = getPref(FIFTH_URL_PREF, ""); // keine Webadresse: alte behalten
    } else {
      setPref(FIFTH_URL_PREF, "", normal);
      url.value = normal;
    }
  };
  url.addEventListener("change", saveURL);
  url.addEventListener("keydown", e => {
    if (e.key == "Enter") {
      saveURL();
    }
  });
  row("kind", tr("In the place of Chat"), kind);
  row("addon", tr("Add-on"), addon);
  row("url", tr("Address"), url);
  const hint = el("p", { id: "mcFifthHint", className: "mc-fifth-hint" });
  group.append(hint);
  // wie die übrigen Teile der Seite: solange „Chat & More“ nicht gewählt ist, versteckt (Thunderbird
  // blendet beim Wechsel nur aus, was schon da war – sonst stand die Wahl unten in General)
  group.hidden = !!header.hidden;
  header.after(group);
  const fillMenu = (list, items, value) => {
    const popup = list.menupopup;
    popup.textContent = "";
    for (const [v, text, disabled] of items) {
      const item = doc.createXULElement("menuitem");
      item.setAttribute("value", v);
      item.setAttribute("label", text);
      if (disabled) {
        item.setAttribute("disabled", "true");
      }
      popup.appendChild(item);
    }
    list.value = value;
  };
  const fill = () => {
    const mode = FifthSpace.mode();
    const spaces = spacesOf();
    const addonText = tr("Space of an add-on");
    // Auswahl neu aufbauen (Erweiterungen können dazukommen)
    fillMenu(kind, [["chat", tr("Chat")], ["addon", spaces.length ? addonText : `${addonText} (${tr("none installed")})`, !spaces.length],
      ["web", tr("Website")], ["none", tr("Nothing")]], mode);
    // dieselbe Wahl wie auf der Leiste (fehlt die gespeicherte Erweiterung, die erste vorhandene)
    const chosen = FifthSpace.addonChoice(Services.wm.getMostRecentWindow("mail:3pane"));
    fillMenu(addon, spaces.map(a => [a.name, a.title]), chosen?.name || "");
    if (doc.activeElement != url) {
      url.value = getPref(FIFTH_URL_PREF, "");
    }
    rows.addon.hidden = mode != "addon";
    rows.url.hidden = mode != "web";
    // Hinweis, solange Thunderbirds Chat-Einstellungen ausgeblendet sind
    const current = mode == "addon" ? chosen?.title || addonText
      : mode == "web" ? getPref(FIFTH_URL_PREF, "") || tr("Website") : tr("Nothing");
    hint.textContent = tr("The chat settings appear here when Chat is chosen. Shown instead: {what}", { what: current });
    hint.hidden = mode == "chat";
    doc.documentElement.setAttribute("mc-fifth", mode);
  };
  fill();
  const prefs = [FIFTH_PREF, FIFTH_ADDON_PREF, FIFTH_URL_PREF];
  // Beobachter mit dem Einstellungs-Tab abmelden: sonst rief jede spätere
  // Änderung der Einstellung fill() im geschlossenen Dokument auf („Refusing
  // to execute function from global in which script is disabled“, tausendfach)
  const unwatch = () => prefs.forEach(pref => Services.prefs.removeObserver(pref, observer));
  const observer = {
    observe: () => {
      if (Cu.isDeadWrapper(doc) || !doc.defaultView || doc.defaultView.closed) {
        unwatch();
        return;
      }
      fill();
    },
  };
  prefs.forEach(pref => Services.prefs.addObserver(pref, observer));
  doc.defaultView?.addEventListener("unload", unwatch, { once: true });
  // Erweiterungen mit eigenem Bereich können später dazukommen: beim Öffnen einer Kategorie neu lesen
  doc.addEventListener("paneSelected", fill);
  restorers?.push(() => {
    unwatch();
    if (Cu.isDeadWrapper(doc)) {
      return;
    }
    doc.defaultView?.removeEventListener("unload", unwatch);
    doc.removeEventListener("paneSelected", fill);
    doc.documentElement.removeAttribute("mc-fifth");
    group.remove();
  });
}

// Einstellungen: Kontoeinstellungen, Add-ons und halo.spaces als eigene
// Kategorien in der Seitenleiste. Ihr Inhalt erscheint rechts im selben Tab
// (die Seitenleiste mit General, Appearance … bleibt stehen) – statt wie bei
// Thunderbird in eigenen Tabs über die Links unten in der Leiste. Diese
// Links bleiben im Dokument (Thunderbird ruft sie evtl. selbst auf), nur
// ausgeblendet. Die halo.spaces-Seite ist dieselbe wie „Add-ons → halo.spaces
// → Einstellungen“ (options_ui), eingebettet wie dort.
const PREF_PANES = [
  { value: "paneMcAccounts", footer: "accountButton", name: "Account Settings", src: "about:accountsettings" },
  // Regeln wie Apple Mail: eine Liste über alle Konten (Entscheidung des
  // Maintainers vom 9.11.2026: letzter Punkt der ersten Gruppe nach Composition)
  { value: "paneMcRules", name: "Rules", rules: true },
  { value: "paneMcAddons", footer: "addonsButton", name: "Add-ons and Themes", src: "about:addons" },
  // Symbol ohne seine weiße Kachel; der Ausschnitt lässt den weichen Rand des Rings ganz drin (enger wirkte er dick und kantig)
  { value: "paneMcHalo", label: "halo.spaces", icon: "resource://mailcards/about/icon.svg", crop: "3 3 58 58", options: true },
];
const HALO_PANE = "paneMcHalo";
const RULES_PANE = "paneMcRules";

// Einstellungen → Regeln: alle Regeln (Thunderbirds Nachrichtenfilter) aller
// Konten in einer Liste wie in Apple Mail – Häkchen schaltet ein/aus, das
// Konto steht unter dem Namen; Hinzufügen, Bearbeiten, Duplizieren, Entfernen
// über Thunderbirds Regel-Editor. Thunderbird führt Regeln je Konto: eine neue
// Regel kommt ins Konto der gewählten Regel bzw. (mehrere Konten) ins
// gewählte aus dem Menü des Knopfs
function ruleLists() {
  const out = [];
  // (Reihenfolge der Konten wie in Thunderbird)
  for (const server of MailServices.accounts.accounts.map(a => a.incomingServer).filter(Boolean)) {
    try {
      if (server.canHaveFilters) {
        out.push({ server, list: server.rootFolder.getEditableFilterList(null) });
      }
    } catch (e) {
      log("rule list", server?.prettyName, e);
    }
  }
  return out;
}

function buildRulesPane(cw, box) {
  const doc = cw.document;
  const X = "http://www.w3.org/1999/xhtml";
  const el = (tag, cls, text) => {
    const e = doc.createElementNS(X, tag);
    if (cls) {
      e.className = cls;
    }
    if (text != null) {
      e.textContent = text;
    }
    return e;
  };
  const wrap = el("div", "mc-rules");
  const head = el("h1", "mc-rules-title", tr("Rules"));
  const list = el("div", "mc-rules-list");
  list.id = "mcRulesList";
  list.setAttribute("role", "listbox");
  list.tabIndex = 0;
  const bar = el("div", "mc-rules-buttons");
  const btn = (id, text) => {
    const b = el("button", null, text);
    b.id = id;
    bar.append(b);
    return b;
  };
  const add = btn("mcRuleAdd", tr("Add Rule"));
  const edit = btn("mcRuleEdit", tr("Edit"));
  const dup = btn("mcRuleDuplicate", tr("Duplicate"));
  const del = btn("mcRuleRemove", tr("Remove"));
  const menu = doc.createXULElement("menupopup");
  menu.id = "mcRuleAddMenu";
  wrap.append(head, list, bar);
  box.append(wrap, menu);
  let selected = null; // { list, filter }
  const mailWin = () => Services.wm.getMostRecentWindow("mail:3pane");
  const save = l => {
    try {
      l.saveToDefaultFile();
    } catch (e) {
      log("rules save", e);
    }
  };
  const indexOf = (l, f) => {
    for (let i = 0; i < l.filterCount; i++) {
      if (l.getFilterAt(i) == f) {
        return i;
      }
    }
    return -1;
  };
  const sync = () => {
    for (const b of [edit, dup, del]) {
      b.disabled = !selected;
    }
    add.disabled = !ruleLists().length;
  };
  const select = row => {
    for (const r of list.children) {
      r.toggleAttribute("selected", r == row);
      r.setAttribute("aria-selected", r == row);
    }
    selected = row?.__mcRule || null;
    sync();
  };
  const fill = () => {
    const keep = selected?.filter;
    list.replaceChildren();
    selected = null;
    const lists = ruleLists();
    const many = lists.length > 1;
    for (const { server, list: l } of lists) {
      for (let i = 0; i < l.filterCount; i++) {
        const filter = l.getFilterAt(i);
        const row = el("div", "mc-rule");
        row.setAttribute("role", "option");
        row.__mcRule = { list: l, filter };
        const check = el("input");
        check.type = "checkbox";
        check.checked = filter.enabled;
        check.setAttribute("aria-label", filter.filterName);
        check.addEventListener("change", () => {
          if (filter.unparseable && check.checked) {
            check.checked = false;
            return;
          }
          filter.enabled = check.checked;
          save(l);
        });
        const text = el("div", "mc-rule-text");
        text.append(el("div", "mc-rule-name", filter.filterName));
        if (many) {
          text.append(el("div", "mc-rule-account", server.prettyName));
        }
        row.append(check, text);
        row.addEventListener("mousedown", () => select(row));
        row.addEventListener("dblclick", e => {
          if (e.target != check) {
            editRule();
          }
        });
        list.append(row);
        if (filter == keep) {
          select(row);
        }
      }
    }
    if (!list.children.length) {
      list.append(el("div", "mc-rules-empty", tr("No Rules")));
    }
    sync();
  };
  // Thunderbirds Editor (modal): args.refresh nach OK – der Editor schreibt
  // nicht selbst auf die Platte
  const editor = (l, args) => {
    args.filterList = l;
    mailWin()?.openDialog("chrome://messenger/content/FilterEditor.xhtml", "FilterEditor",
      "chrome,modal,titlebar,resizable,centerscreen", args);
    if (args.refresh) {
      save(l);
      if (args.newFilter) {
        selected = { list: l, filter: args.newFilter };
      }
      fill();
    }
  };
  const newRule = l => editor(l, { filterPosition: l.filterCount });
  function editRule() {
    if (selected) {
      editor(selected.list, { filter: selected.filter });
    }
  }
  add.addEventListener("click", () => {
    const lists = ruleLists();
    if (selected || lists.length == 1) {
      newRule(selected?.list || lists[0].list);
      return;
    }
    menu.replaceChildren();
    for (const { server, list: l } of lists) {
      const item = doc.createXULElement("menuitem");
      item.setAttribute("label", server.prettyName);
      item.addEventListener("command", () => newRule(l));
      menu.append(item);
    }
    menu.openPopup(add, "after_start");
  });
  edit.addEventListener("click", editRule);
  dup.addEventListener("click", () => {
    if (selected) {
      editor(selected.list, { copiedFilter: selected.filter, filterPosition: indexOf(selected.list, selected.filter) + 1 });
    }
  });
  del.addEventListener("click", () => {
    if (!selected) {
      return;
    }
    const { list: l, filter } = selected;
    const ok = Services.prompt.confirmEx(cw, tr("Rules"), tr("Remove the rule “{name}”?", { name: filter.filterName }),
      Services.prompt.STD_YES_NO_BUTTONS, "", "", "", null, {}) == 0;
    if (ok) {
      l.removeFilter(filter);
      save(l);
      selected = null;
      fill();
    }
  });
  list.addEventListener("keydown", e => {
    const rows = [...list.querySelectorAll(".mc-rule")];
    const i = rows.findIndex(r => r.hasAttribute("selected"));
    if (e.key == "ArrowDown" || e.key == "ArrowUp") {
      e.preventDefault();
      select(rows[Math.max(0, Math.min(rows.length - 1, i + (e.key == "ArrowDown" ? 1 : -1)))] || null);
    } else if (e.key == "Enter") {
      editRule();
    } else if (e.key == "Backspace" || e.key == "Delete") {
      del.click();
    }
  });
  // beim Zurückkommen neu lesen (Regeln aus „Regel aus E-Mail erstellen …“ oder Thunderbirds Fenster)
  doc.addEventListener("paneSelected", () => {
    if (box.isConnected && !box.hidden) {
      fill();
    }
  });
  fill();
}

// Mail → Rules… und „Regeln …“ unter General öffnen die Seite statt
// Thunderbirds Fenster
async function openRulesSettings(w) {
  return openHaloSettings(w, RULES_PANE);
}
const dataURIs = new Map();
// crop: neuer viewBox („x y b h“) – dann ohne das erste <rect> (Kachel des Symbols)
function dataURI(url, crop = null) {
  const key = url + (crop || "");
  if (!dataURIs.has(key)) {
    const channel = NetUtil.newChannel({ uri: url, loadUsingSystemPrincipal: true });
    const stream = channel.open();
    let text = NetUtil.readInputStreamToString(stream, stream.available(), { charset: "UTF-8" });
    stream.close();
    if (crop) {
      text = text.replace(/viewBox="[^"]*"/, `viewBox="${crop}"`).replace(/<rect\b[^>]*\/>/, "");
    }
    dataURIs.set(key, "data:image/svg+xml;charset=utf-8," + encodeURIComponent(text));
  }
  return dataURIs.get(key);
}
function hookPrefCategories(cw, restorers = null) {
  const doc = cw.document;
  const categories = doc.getElementById("categories");
  const deck = doc.getElementById("paneDeck");
  if (!categories || !deck || typeof cw.register_module != "function") {
    return;
  }
  if (ownedElement(doc, "mcCat-" + HALO_PANE)) {
    return;
  }
  // Reste einer älteren Fassung (Update ohne Neustart) entfernen
  for (const old of doc.querySelectorAll(".mc-embed-cat, .mc-embed-pane, .mc-subcats")) {
    old.remove();
  }
  // Kontoeinstellungen und Add-ons laufen nicht innerhalb dieser Seite: Sie
  // greifen auf „top“ zu (top.frames.contentFrame …), das wäre hier die
  // Einstellungsseite. Ihr Browser liegt deshalb im Hauptfenster über der
  // Fläche rechts der Seitenleiste – wie in einem eigenen Tab
  const host = cw.browsingContext?.embedderElement?.parentNode;
  const overlays = new Map();
  const detach = [];
  const X = "http://www.w3.org/1999/xhtml";
  // Name wie Thunderbird ihn in der Fußzeile zeigt; ist die nach 6 s noch
  // nicht übersetzt oder fehlt der Link ganz (z. B. Windows), der eigene
  // (sonst fehlten die Kategorien ganz)
  const since = cw.__mcPrefSince || (cw.__mcPrefSince = Date.now());
  const late = Date.now() - since > 6000;
  const labelOf = pane => {
    const link = pane.footer ? doc.getElementById(pane.footer) : null;
    return pane.label || (pane.rules && tr(pane.name)) || link?.querySelector(".sidebar-footer-label")?.textContent.trim() ||
      link?.querySelector(".sidebar-footer-label")?.getAttribute("value") ||
      ((late || (pane.footer && !link)) && pane.name ? tr(pane.name) : "");
  };
  // alle Kategorien auf einmal: ist eine Fußzeile noch nicht übersetzt
  // (langsamer Start, z. B. Linux), gleich noch einmal – sonst stünde
  // halo.spaces schon da und Konten/Add-ons kämen nie dazu (der Aufruf oben
  // bricht dann ab); ein Nachversuch zur Zeit, egal wie oft man gerufen wird
  if (host && PREF_PANES.some(p => !labelOf(p))) {
    if (!cw.__mcPrefRetry) {
      cw.__mcPrefRetry = cw.setTimeout(() => {
        cw.__mcPrefRetry = 0;
        try {
          hookPrefCategories(cw, restorers);
        } catch (e) {
          log("pref categories retry error", e);
        }
      }, 150);
    }
    return;
  }
  cw.__mcPrefSince = 0;
  const added = [];
  for (const pane of PREF_PANES) {
    const link = pane.footer ? doc.getElementById(pane.footer) : null;
    const label = labelOf(pane);
    if (!label || (!pane.options && !pane.rules && !host)) {
      continue;
    }
    const item = doc.createXULElement("richlistitem");
    item.id = "mcCat-" + pane.value;
    item.__mcOwner = HOOK_OWNER;
    item.className = "category mc-embed-cat";
    item.setAttribute("value", pane.value);
    item.setAttribute("align", "center");
    item.setAttribute("tooltiptext", label);
    const img = doc.createElementNS(X, "img");
    img.className = "category-icon";
    img.setAttribute("alt", "");
    // about:preferences lässt Bilder nur aus chrome:, data: … zu (CSP) – eigenes Symbol als data:
    img.src = pane.icon ? dataURI(pane.icon, pane.crop) : link?.querySelector("img")?.src || "";
    const name = doc.createXULElement("label");
    name.className = "category-name";
    name.setAttribute("flex", "1");
    name.textContent = label;
    item.append(img, name);
    categories.append(item);
    if (pane.value == HALO_PANE) {
      item.toggleAttribute("mc-update", !!UpdateNote.pending);
    }
    // Unterpunkte der Seite direkt darunter (nur bei gewählter Kategorie sichtbar)
    let subs = null;
    if (pane.src) {
      subs = doc.createXULElement("vbox");
      subs.className = "mc-subcats";
      subs.id = "mcSub-" + pane.value;
      subs.hidden = true;
      categories.append(subs);
      added.push(subs);
    }
    // Inhalt: leere Fläche (Thunderbird zeigt beim Wechsel nur, was zur
    // Kategorie gehört), die Seite lädt erst beim ersten Öffnen
    const box = doc.createXULElement("vbox");
    box.className = "mc-embed-pane";
    box.id = "mcPane-" + pane.value;
    box.setAttribute("data-category", pane.value);
    // nicht in der Suche der Einstellungen (dort fände man ihren Inhalt nicht)
    box.setAttribute("data-hidden-from-search", "true");
    box.setAttribute("data-subpanel", "true");
    box.hidden = true;
    deck.append(box);
    const init = () => {
      if (pane.rules) {
        if (!box.firstChild) {
          buildRulesPane(cw, box);
        }
      } else if (pane.options) {
        loadOptionsPane(cw, box);
      } else if (!overlays.has(pane.value)) {
        const browserEl = embedPage(host, pane.src);
        overlays.set(pane.value, browserEl);
        detach.push(attachSubnav(subs, browserEl, pane.src));
        mark();
      }
    };
    try {
      cw.register_module(pane.value, { init });
    } catch (e) {
      log("pref pane register error", pane.value, e);
    }
    added.push(item, box);
  }
  if (!added.length) {
    return;
  }
  // Gruppen nach Nutzung, nur durch Abstand getrennt (spaces.css): General,
  // Account Settings, Appearance, Composition · Privacy & Security, Calendar,
  // Chat · Add-ons and Themes, halo.spaces, Kategorien anderer Add-ons, Export
  // for Mobile ganz unten
  const calCat = doc.getElementById("category-calendar");
  const calNext = calCat?.nextSibling;
  const qrCat = doc.getElementById("category-qrexport");
  const qrNext = qrCat?.nextSibling;
  const own = value => [doc.getElementById("mcCat-" + value), doc.getElementById("mcSub-" + value)].filter(Boolean);
  const mine = el => el?.parentNode == categories;
  const generalCat = doc.getElementById("category-general");
  if (mine(generalCat)) {
    generalCat.after(...own("paneMcAccounts"));
  }
  const composeCat = doc.getElementById("category-compose") || doc.getElementById("category-composition");
  if (mine(composeCat)) {
    composeCat.after(...own(RULES_PANE));
  }
  const privacyCat = doc.getElementById("category-privacy");
  const chatCat = doc.getElementById("category-chat");
  if (mine(calCat)) {
    if (mine(chatCat)) {
      chatCat.before(calCat);
    } else if (mine(privacyCat)) {
      privacyCat.after(calCat);
    }
  }
  const group3 = [...own("paneMcAddons"), ...own(HALO_PANE)];
  const lastOf2 = [chatCat, calCat, privacyCat].find(mine);
  if (lastOf2 && group3.length) {
    lastOf2.after(...group3);
  }
  if (mine(qrCat)) {
    categories.append(qrCat);
  }
  // Suche der Einstellungen: die halo.spaces-Seite liegt in einem eigenen
  // Browser, den Thunderbirds Suche nicht sieht – jede Option deshalb auch als
  // eigene, durchsuchbare Zeile (nur in den Suchergebnissen sichtbar, eigene
  // Kategorie ohne Eintrag in der Leiste); Klick zeigt die Option auf der Seite
  const haloBox = doc.getElementById("mcPane-" + HALO_PANE);
  if (haloBox) {
    const showOption = key => {
      haloBox.__mcFocus = key;
      try {
        const input = doc.getElementById("searchInput");
        if (input) {
          input.value = "";
        }
        if (cw.gSearchResultsPane) {
          cw.gSearchResultsPane.query = "";
          cw.gSearchResultsPane.getFindSelection(cw).removeAllRanges();
          cw.gSearchResultsPane.removeAllSearchTooltips();
        }
        doc.getElementById("header-searchResults")?.setAttribute("hidden", "true");
        doc.getElementById("no-results-message")?.setAttribute("hidden", "true");
      } catch {} // gewollt: Suchanzeige der Einstellungen schon weg
      cw.gotoPref(HALO_PANE);
      // Die Seite gibt es oft schon, bevor „Show“ kommt: Thunderbirds Suche legt
      // alle Kategorien an (auch unsere, dann ohne Sprungziel). Hat ihr Laden
      // begonnen, wird sie mit dem Sprungziel (neu) geladen – auch wenn die erste
      // Adresse noch nicht angekommen ist (vorher ging „Show“ in diesem Moment
      // verloren); davor nimmt loadOptionsPane das Sprungziel selbst mit
      const frame = haloBox.querySelector("browser");
      if (frame && haloBox.__mcLoadStarted) {
        // derselbe Anker noch einmal löst kein hashchange aus (Gecko springt nur im
        // Dokument) – beim zweiten „Show“ für dieselbe Option deshalb mit „~“ abwechseln
        const hash = haloBox.__mcHash == `s-${key}` ? `s-${key}~` : `s-${key}`;
        haloBox.__mcHash = hash;
        frame.fixupAndLoadURIString(`${extensionBaseURL}options/options.html?in=prefs#${hash}`,
          { triggeringPrincipal: Services.scriptSecurityManager.getSystemPrincipal() });
      }
    };
    for (const [section, rows] of haloSections()) {
      for (const row of rows) {
        if ((row.mac && Services.appinfo.OS != "Darwin") || (row.notMac && Services.appinfo.OS == "Darwin") ||
            (row.needs && !settingNeeds()[row.needs])) {
          continue;
        }
        const entry = doc.createXULElement("hbox");
        entry.className = "mc-halo-found";
        entry.setAttribute("data-category", "paneMcHaloSearch");
        entry.setAttribute("align", "center");
        entry.hidden = true;
        const text = doc.createXULElement("vbox");
        text.setAttribute("flex", "1");
        const where = doc.createElementNS(X, "div");
        where.className = "mc-halo-found-where";
        where.textContent = `halo.spaces › ${section}`;
        const name = doc.createElementNS(X, "div");
        name.className = "mc-halo-found-name";
        name.textContent = row.label;
        const hint = doc.createElementNS(X, "div");
        hint.className = "mc-halo-found-hint";
        hint.textContent = row.hint || "";
        text.append(where, name, hint);
        const button = doc.createElementNS(X, "button");
        button.className = "mc-halo-found-show";
        button.textContent = tr("Show");
        button.addEventListener("click", () => showOption(row.key));
        entry.append(text, button);
        deck.append(entry);
        added.push(entry);
      }
    }
  }
  // Fußzeile nur weg, wenn ihre Links wirklich als Kategorien da sind
  const footer = doc.querySelector("#pref-category-box .sidebar-footer-list");
  if (footer && PREF_PANES.every(p => !p.footer || doc.getElementById("mcCat-" + p.value))) {
    footer.hidden = true;
  }
  // Fläche der eingebetteten Seiten: rechts neben der Seitenleiste (folgt
  // ihrem Ein-/Ausblenden und ihrer Breite)
  const sidebar = doc.getElementById("pref-category-box");
  // (Browser verhalten sich wie Bilder: Breite und Höhe ausdrücklich, Abstände allein dehnen sie nicht)
  const place = () => {
    const x = Math.max(0, Math.round(rectOf(sidebar)?.right || 0));
    for (const browserEl of overlays.values()) {
      browserEl.style.insetInlineStart = `${x}px`;
      browserEl.style.width = `${Math.max(0, host.clientWidth - x)}px`;
      browserEl.style.height = `${host.clientHeight}px`;
    }
  };
  const ro = new cw.ResizeObserver(place);
  if (sidebar) {
    ro.observe(sidebar);
  }
  ro.observe(doc.documentElement);
  // gewählte Kategorie: Inhalt ohne Thunderbirds 800-px-Spalte, passende Seite zeigen
  // (Unterpunkte nur bei gewählter Kategorie und nicht von Hand zugeklappt)
  let folded = false;
  function mark(event) {
    const value = categories.selectedItem?.value || "";
    if (event) {
      folded = false; // neue Kategorie: Unterpunkte wieder offen
    }
    doc.documentElement.toggleAttribute("mc-embed", PREF_PANES.some(p => p.value == value && !p.rules));
    for (const [key, browserEl] of overlays) {
      browserEl.hidden = key != value;
    }
    for (const subs of categories.querySelectorAll(".mc-subcats")) {
      subs.hidden = folded || subs.id != "mcSub-" + value;
    }
    categories.selectedItem?.toggleAttribute("mc-folded", folded);
    place();
  }
  // erneuter Klick auf die schon gewählte Kategorie klappt ihre Unterpunkte
  // auf bzw. zu (Kontoeinstellungen, Add-ons) – wie Ordner im Finder
  let wasSelected = null;
  const onDown = e => {
    wasSelected = e.button == 0 ? categories.selectedItem : null;
  };
  const onClick = e => {
    const item = e.target.closest?.("richlistitem.mc-embed-cat");
    if (e.button != 0 || !item || item != wasSelected || item != categories.selectedItem ||
      !doc.getElementById("mcSub-" + item.value)) {
      return;
    }
    folded = !folded;
    mark();
  };
  categories.addEventListener("mousedown", onDown, true);
  categories.addEventListener("click", onClick);
  doc.addEventListener("paneSelected", mark);
  mark();
  // Thunderbird wählt beim Öffnen die zuletzt gezeigte Kategorie – war das eine
  // von uns (oder verlangt der Aufruf sie, #mcHalo), gab es sie da noch nicht
  const wanted = (cw.location.hash || "").slice(1);
  const last = Services.xulStore.getValue("about:preferences", "paneDeck", "lastSelected");
  const target = PREF_PANES.find(p => p.value == "pane" + wanted.charAt(0).toUpperCase() + wanted.slice(1)) ||
    (!wanted || wanted == "general" ? PREF_PANES.find(p => p.value == last) : null);
  if (target && doc.getElementById("mcCat-" + target.value)) {
    cw.gotoPref?.(target.value);
  }
  // Beim Öffnen ruft Thunderbird die Startseite (General bzw. die zuletzt
  // gezeigte, auch über die Adresse #general) teils erst Sekunden später auf –
  // bei langsamem Start (Linux) nach einer schon gewählten Kategorie, die
  // Auswahl sprang auf General zurück. Hat der Nutzer seit dem Öffnen selbst
  // gewählt oder schon eine Suche begonnen, wird dieser eine verspätete Aufruf
  // übergangen (sonst waren Suchfeld und Treffer wieder weg)
  const origGoto = cw.gotoPref;
  const startPane = categories.selectedItem?.value || "paneGeneral";
  const opened = Date.now();
  // Auswahl in der Seitenleiste (Klick, Tasten): Thunderbird ruft gotoPref
  // mitten in ihrem „select“ auf – das ist immer gewollt. Der verspätete
  // Startaufruf kommt dagegen von außerhalb (unter Linux 20–50 ms nach dem Klick);
  // gotoPref() ohne Kategorie folgt nur der Adresse (#…) und bleibt unberührt
  let userPane = null, inSelect = 0, skipped = false;
  const selectStart = () => {
    inSelect++;
    userPane = categories.selectedItem?.value || null;
  };
  const selectEnd = () => (inSelect = Math.max(0, inSelect - 1));
  // laufende Suche: Thunderbird leert beim Löschen der Eingabe erst seine Anfrage
  // und kehrt dann selbst zu General zurück – das bleibt erlaubt
  const searching = () => !!(cw.gSearchResultsPane?.query && doc.getElementById("searchInput")?.value.trim());
  categories.addEventListener("select", selectStart, true);
  categories.addEventListener("select", selectEnd);
  if (typeof origGoto == "function") {
    cw.gotoPref = function (category, ...rest) {
      const late = !inSelect && !skipped && ((userPane && userPane != startPane) || searching()) &&
        Date.now() - opened < 30000 && (category == startPane || category == "paneGeneral");
      if (late) {
        skipped = true;
        // (für den automatischen Test: der echte verspätete Aufruf kam schon)
        cw.gotoPref.__mcSkipped = true;
        log("pref categories: late start call skipped", category);
        return Promise.resolve();
      }
      return origGoto.call(this, category, ...rest);
    };
    cw.gotoPref.__mcOrig = origGoto;
  }
  restorers?.push(() => {
    categories.removeEventListener("select", selectStart, true);
    categories.removeEventListener("select", selectEnd);
    if (cw.gotoPref?.__mcOrig == origGoto) {
      cw.gotoPref = origGoto;
    }
    doc.removeEventListener("paneSelected", mark);
    categories.removeEventListener("mousedown", onDown, true);
    categories.removeEventListener("click", onClick);
    ro.disconnect();
    detach.forEach(f => f());
    const was = categories.selectedItem?.classList.contains("mc-embed-cat");
    if (calCat?.parentNode == categories && calNext?.parentNode == categories) {
      categories.insertBefore(calCat, calNext);
    }
    if (qrCat?.parentNode == categories && qrNext?.parentNode == categories) {
      categories.insertBefore(qrCat, qrNext);
    }
    added.forEach(el => el.remove());
    overlays.forEach(browserEl => browserEl.remove());
    if (footer) {
      footer.hidden = false;
    }
    doc.documentElement.removeAttribute("mc-embed");
    if (was) {
      cw.gotoPref?.("paneGeneral");
    }
  });
}

// Einstellungen ohne Mausrad bedienbar: ein Klick auf eine freie Stelle der
// Seite gibt dem scrollenden Inhalt den Fokus – danach scrollen Pfeiltasten
// und Bild-ab die Seite. Sonst bliebe der Fokus in der Seitenleiste und die
// Pfeiltasten wechselten die Kategorie (Thunderbird macht das ebenso; ohne
// sichtbare Bildlaufleiste fehlt aber der Ausweg über die Leiste)
function hookPrefKeyboardScroll(cw, restorers = null) {
  const doc = cw.document;
  const box = doc.getElementById("preferencesContainer");
  if (!box || doc.__mcKeyScroll) {
    return;
  }
  doc.__mcKeyScroll = true;
  const hadTabIndex = box.hasAttribute("tabindex");
  if (!hadTabIndex) {
    box.setAttribute("tabindex", "-1");
  }
  const INTERACTIVE = "button, input, textarea, select, menulist, checkbox, radio, richlistbox, label, a, "
    + "toolbarbutton, [tabindex]:not(#preferencesContainer), [contenteditable]";
  const onDown = e => {
    if (e.button != 0 || !box.contains(e.target) || e.target.closest?.(INTERACTIVE)) {
      return;
    }
    box.focus({ preventScroll: true });
  };
  doc.addEventListener("mousedown", onDown);
  restorers?.push(() => {
    doc.removeEventListener("mousedown", onDown);
    if (!hadTabIndex) {
      box.removeAttribute("tabindex");
    }
    delete doc.__mcKeyScroll;
  });
}

// Einstellungen → Appearance: Beschriftungen ohne Doppelpunkt wie die
// übrigen Felder („Select view style“, „Default Threading“). Fluent setzt
// value neu (Sprachwechsel, spätes Übersetzen) → beobachten
function hookPrefLabelColons(cw, restorers = null) {
  const doc = cw.document;
  if (doc.__mcLabelColons) {
    return;
  }
  const SEL = 'label[data-l10n-id="appearance-view-style-select"], label[data-l10n-id="default-flag-label"]';
  const strip = v => v.replace(/\s*:\s*$/, "");
  const fix = () => {
    for (const el of doc.querySelectorAll(SEL)) {
      const v = el.getAttribute("value");
      if (v && strip(v) != v) {
        el.setAttribute("value", strip(v));
      }
    }
  };
  const labels = [...doc.querySelectorAll(SEL)];
  if (!labels.length) {
    return;
  }
  doc.__mcLabelColons = true;
  fix();
  const mo = new cw.MutationObserver(fix);
  for (const el of labels) {
    mo.observe(el, { attributes: true, attributeFilter: ["value"] });
  }
  restorers?.push(() => {
    mo.disconnect();
    delete doc.__mcLabelColons;
    doc.l10n?.translateElements(labels).catch(() => {});
  });
}

// Beschriftungen von Feldern ohne Doppelpunkt in Fenstern, Dialogen und
// Einstellungen („Location“, „Filter name“, „Width“), wie in den Einstellungs-
// Dialogen und im Termin-Fenster. Beschriftung heißt: Text direkt vor bzw. zu
// einem Text- oder Auswahlfeld (label control/for, nächstes Geschwister, auch
// Kästchen und Optionen mit Feld dahinter, Kopfzellen der Infotabellen).
// Einleitende Sätze vor einer Liste (Legenden, Beschreibungen, Text vor
// Kästchen oder Optionen) und lange Sätze (Komma oder mehr als acht Wörter)
// behalten ihn. Der Verfassen-Kopf („To:“, „Subject:“) gehört nicht dazu.
// Fluent setzt Texte neu (spätes Übersetzen, Sprachwechsel) → beobachten
const FIELD_SEL = 'input:not([type="checkbox"], [type="radio"], [type="hidden"], [type="button"], [type="submit"], [type="reset"], [type="image"]), menulist, select:not([multiple], [size]), textarea, search-textbox';
const colonDocs = new Set();
function colonLabelText(el) {
  if (el.localName == "checkbox" || el.localName == "radio") {
    return ["label", el.getAttribute("label")];
  }
  if (el.hasAttribute("value")) {
    return ["value", el.getAttribute("value")];
  }
  if (el.childElementCount == 0) {
    return ["text", el.textContent];
  }
  return [null, null];
}
function isFieldLabel(el) {
  const doc = el.ownerDocument;
  const isField = e => !!e && (e.matches(FIELD_SEL) || !!e.firstElementChild?.matches(FIELD_SEL));
  const shown = e => !e.hidden && !e.hasAttribute("hidden") && e.ownerDocument.defaultView?.getComputedStyle(e)?.display != "none";
  const nextOf = e => {
    let n = e.nextElementSibling;
    while (n && !shown(n)) {
      n = n.nextElementSibling;
    }
    return n;
  };
  const next = nextOf(el);
  if (el.localName == "th") {
    return next?.localName == "td";
  }
  const target = el.getAttribute("control") || el.getAttribute("for");
  const ctrl = target ? doc.getElementById(target) : null;
  if (ctrl && ctrl.matches(FIELD_SEL)) {
    return true;
  }
  // Feld in einer eigenen Spalte, das sich auf diese Beschriftung bezieht
  // (Bild-Dialog: Option „Alternate text“ links, Feld rechts)
  const labelled = el.id && doc.querySelector(`[aria-labelledby~="${doc.defaultView.CSS.escape(el.id)}"]`);
  if (labelled && labelled.matches(FIELD_SEL)) {
    return true;
  }
  // Kästchen bzw. Option mit eigenem Text: zählt nur mit Feld dahinter
  return isField(next);
}
function fixFieldColons(doc, changed) {
  for (const el of doc.querySelectorAll("label, th, checkbox, radio")) {
    if (el.closest("menupopup, menulist, tree, richlistitem, #MsgHeadersToolbar") ||
        (el.localName == "label" && el.parentElement?.closest("checkbox, radio"))) {
      continue;
    }
    const [kind, text] = colonLabelText(el);
    if (!kind || !text || !/:\s*$/.test(text)) {
      continue;
    }
    const core = text.replace(/\s*:\s*$/, "");
    if (!core || core.includes(",") || core.trim().split(/\s+/).length > 8 || !isFieldLabel(el)) {
      continue;
    }
    if (!changed.has(el)) {
      changed.set(el, [kind, text]);
    }
    if (kind == "text") {
      el.textContent = core;
    } else {
      el.setAttribute(kind, core);
    }
  }
}
function hookFieldColons(win) {
  const doc = win.document;
  if (!doc?.documentElement || doc.__mcFieldColons) {
    return;
  }
  doc.__mcFieldColons = true;
  const entry = { doc, changed: new Map(), mo: null };
  let queued = false;
  const run = () => {
    queued = false;
    try {
      fixFieldColons(doc, entry.changed);
    } catch (e) {
      log("field colons error", String(e).slice(0, 120));
    }
  };
  run();
  entry.mo = new win.MutationObserver(() => {
    if (!queued) {
      queued = true;
      win.setTimeout(run, 0);
    }
  });
  entry.mo.observe(doc.documentElement, {
    subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ["value", "label"],
  });
  colonDocs.add(entry);
  win.addEventListener("unload", () => {
    entry.mo.disconnect();
    colonDocs.delete(entry);
  }, { once: true });
}
function restoreFieldColons() {
  for (const { doc, changed, mo } of colonDocs) {
    try {
      mo.disconnect();
      for (const [el, [kind, text]] of changed) {
        if (kind == "text") {
          el.textContent = text;
        } else {
          el.setAttribute(kind, text);
        }
      }
      delete doc.__mcFieldColons;
    } catch {}
  }
  colonDocs.clear();
}

// Wie Apple Mail ohne Tabs: Inhalte, die Thunderbird als Tab ohne Bereich
// öffnet, wären bei ausgeblendeter Tab-Leiste nach dem nächsten Wechsel
// unsichtbar. Darum
// - Webseiten (http/https: Anmeldeseiten, „Neuigkeiten“, Hinweise) in einem
//   eigenen, schlichten Fenster statt im Tab,
// - übrige Inhalts-Tabs ohne Bereich (z. B. about:-Seiten) beim Wechsel in
//   einen Bereich schließen; Konto einrichten bleibt, damit ein kurzer Blick
//   in die Mail es nicht abbricht.
// Tabs, die Add-ons gezielt öffnen (tabs.create), bleiben unberührt – deren
// Abläufe warten auf genau diesen Tab
function hookLooseTabs(w, restorers = null) {
  const tm = w.document.getElementById("tabmail");
  if (!tm?.registerTabMonitor || !w.gSpacesToolbar || w.__mcLooseTabs) {
    return;
  }
  w.__mcLooseTabs = true;
  const original = tm.openTab;
  tm.openTab = function(mode, params, ...rest) {
    const tab = original.call(this, mode, params, ...rest);
    if (tab && mode == "contentTab" && params?.duplicate) {
      tab.__mcByAddon = true; // (nur tabs.create setzt duplicate)
    }
    return tab;
  };
  const KEEP = /^about:accountsetup/;
  const spec = tab => tab.browser?.currentURI?.spec || "";
  // nur Inhalts-Tabs: Termin im Tab, Suchergebnisse usw. könnten
  // ungespeicherte Eingaben bzw. eine laufende Suche halten
  const loose = tab => tab?.mode?.name == "contentTab" && !tab.__mcFifth && !tab.__mcByAddon && tm.tabInfo.includes(tab)
    && !w.gSpacesToolbar.spaces.some(space => space.tabInSpace(tab))
    && !FifthSpace.isTarget(w, FifthSpace.target(w), tab);
  // Webseite ins eigene Fenster (lädt dort neu) und den Tab schließen; die
  // Adresse steht bei window.open erst nach einem Moment fest
  const toWindow = (tab, tries = 0) => {
    if (!loose(tab)) {
      return;
    }
    const url = spec(tab);
    if (!/^https?:/i.test(url)) {
      if (tries < 25 && /^about:blank$|^$/.test(url)) {
        w.setTimeout(() => toWindow(tab, tries + 1), 200);
      }
      return;
    }
    w.openDialog("chrome://messenger/content/extensionPopup.xhtml", "_blank",
      "chrome,dialog=no,resizable,minimizable,centerscreen,width=760,height=780", url);
    tm.closeTab(tab);
  };
  const monitor = {
    monitorName: "mcLooseTabs",
    onTabTitleChanged() {},
    onTabOpened(tab) {
      w.setTimeout(() => toWindow(tab), 0);
    },
    onTabPersist() {},
    onTabRestored() {},
    onTabClosing() {},
    onTabSwitched(newTab, oldTab) {
      if (!loose(oldTab) || loose(newTab) || KEEP.test(spec(oldTab))) {
        return;
      }
      // (nach dem Wechsel schließen, nicht mitten darin)
      w.setTimeout(() => {
        if (tm.tabInfo.includes(oldTab) && tm.currentTabInfo != oldTab) {
          tm.closeTab(oldTab);
        }
      }, 0);
    },
  };
  tm.registerTabMonitor(monitor);
  restorers?.push(() => {
    tm.unregisterTabMonitor(monitor);
    if (tm.openTab != original) {
      delete tm.openTab; // (eigene Eigenschaft – die des Elements gilt wieder)
      if (tm.openTab != original) {
        tm.openTab = original;
      }
    }
    delete w.__mcLooseTabs;
  });
}

// Ansicht der Mailliste: nur zwei gültige Kombinationen aus Ansicht
// (mail.threadpane.listview: 0 Karten, 1 Tabelle) und Layout
// (mail.pane_config.dynamic: 0 klassisch, 1 breit, 2 vertikal). Karten gehen
// nur vertikal, Tabelle nur klassisch; „breit“ passt nicht zum Design und
// wird nicht angeboten
const LISTVIEW_PREF = "mail.threadpane.listview";
const PANE_PREF = "mail.pane_config.dynamic";
const VIEW_CHOICES = [["cards", "Card View", 0, 2], ["classic", "Table View: Classic", 1, 0]];
function viewChoice() {
  return Services.prefs.getIntPref(LISTVIEW_PREF, 0) == 0 ? "cards" : "classic";
}
function setViewChoice(key) {
  const [, , list, pane] = VIEW_CHOICES.find(c => c[0] == key) || VIEW_CHOICES[0];
  Services.prefs.setIntPref(PANE_PREF, pane);
  Services.prefs.setIntPref(LISTVIEW_PREF, list);
}
// passend halten: wer (Menü, Tastenkürzel, Thunderbird) das Layout wählt,
// bekommt die Ansicht dazu – und umgekehrt
function syncViewChoice(changed) {
  const list = Services.prefs.getIntPref(LISTVIEW_PREF, 0);
  const pane = Services.prefs.getIntPref(PANE_PREF, 0);
  // „breit“ (alte Einstellung oder Thunderbirds Befehl): Tabelle wird
  // klassisch, Karten bleiben vertikal
  if (pane == 1) {
    Services.prefs.setIntPref(PANE_PREF, list == 0 ? 2 : 0);
    return;
  }
  if (changed == PANE_PREF) {
    const want = pane == 2 ? 0 : 1;
    if (list != want) {
      Services.prefs.setIntPref(LISTVIEW_PREF, want);
    }
  } else if (list == 0 && pane != 2) {
    Services.prefs.setIntPref(PANE_PREF, 2);
  } else if (list == 1 && pane == 2) {
    Services.prefs.setIntPref(PANE_PREF, 0);
  }
}

// Optionen, die es nicht mehr gibt (17.11.2026): „On My Mac“ erscheint von
// selbst, sobald darin etwas liegt; Menüs immer wie macOS (keine deckenden);
// Rückfragen immer als Blatt im Fenster; Updates nach Thunderbirds eigener
// Einstellung (Add-ons-Manager); Symbol des fünften Platzes immer einfarbig
const REMOVED_OPTION_PREFS = [
  "extensions.mailcards.fifthSpaceIcon",
  "extensions.mailcards.autoUpdate",
  "extensions.mailcards.showLocalFolders",
  "extensions.mailcards.solidMenus",
  "extensions.mailcards.inlinePrompts",
];
// Unterhaltungsansicht in api/unterhaltung.js: die ganze Konversation als
// Karten in der Leseansicht (ConversationCards) samt Einstellungen und das
// Einklappen des zitierten Verlaufs (foldQuotedHistory) – hier geladen,
// damit die Reihenfolge bleibt
loadPart("unterhaltung.js");

// „Bewegung reduzieren“ (macOS: Bedienungshilfen → Anzeige; Windows:
// Animationseffekte aus): eigene Animationen springen dann sofort ans Ende
// (1 ms statt 0 – die Schrittfunktionen teilen durch die Dauer)
function motionMs(ms) {
  try {
    const win = Services.wm.getMostRecentWindow("mail:3pane");
    if (win?.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      return 1;
    }
  } catch {} // gewollt: ohne Fenster normale Bewegung
  return ms;
}

// Gemeinsamer Takt für die Ein-/Ausblend-Animationen (Stufe 1 der Vereinheitlichung): läuft über Bildwechsel
// (requestAnimationFrame) von 0 bis 1; bild(p, k, letzt) bekommt den Verlauf p = kurve(k) (k = Fortschritt) und ob es
// das letzte Bild ist (ende folgt im selben Aufruf), ende(k) den Endstand (k >= 1: vorwärts zu Ende, k <= 0: nach einer
// Umkehr wieder am Anfang). Beginn nach zwei Bildwechseln (Aufbau abwarten). umkehren() kehrt an der aktuellen Stelle
// um (Klick während der Animation).
function animiere(win, { dauer, kurve, bild, ende, beiUmkehr }) {
  let k = 0, dir = 1, last = null;
  const step = now => {
    k = Math.min(1, Math.max(0, k + (last === null ? 0 : dir * (now - last) / dauer)));
    last = now;
    const letzt = !(dir > 0 ? k < 1 : k > 0);
    bild(kurve(k), k, letzt);
    if (!letzt) {
      win.requestAnimationFrame(step);
      return;
    }
    ende(k);
  };
  win.requestAnimationFrame(() => win.requestAnimationFrame(step));
  return {
    umkehren() {
      dir = -dir;
      beiUmkehr?.(dir);
    },
  };
}

// Mail-Zusätze in api/mail.js: Senden rückgängig (UndoSend), Später senden
// (SendLater), Schlagwort-Menüs (TagMenus), Erinnern (Remind) und
// Nachfassen (FollowUp) – hier geladen, damit die Reihenfolge bleibt
loadPart("mail.js");

// Bereiche und Hinweise in api/bereiche.js: „Danke sagen“ (Thanks), Wetter
// (Weather) samt Karten-Links, Reihenfolge der Bereiche (SpacesOrder),
// fünfter Bereich (FifthSpace) und Hinweis auf ein Update (UpdateNote)
loadPart("bereiche.js");

// Breite Newsletter (feste 600–700 px) wie Apple Mail auf die Lesebreite
// verkleinern statt sie rechts abzuschneiden: der Mailtext bekommt einen Zoom,
// sobald er breiter ist als die Leseansicht. Nur HTML-Mails (Textmails brechen
// selbst um), neu gerechnet bei Größenänderung und nachgeladenen Bildern
// Kurze Mail mit Anhängen: Mailtext nur so hoch wie sein Inhalt, damit die
// Anhangsliste direkt darunter steht wie bei Apple Mail – statt mit großer
// Lücke am unteren Rand. Lange Mails bleiben wie bisher (Text scrollt, Liste
// unten). Nicht in den Karten der Konversation (dort hat jede Karte ohnehin
// Inhaltshöhe)
// Anhänge unter der Mail (Einzelansicht und Karten der Konversation) als
// Kacheln wie Apple Mail: Dateisymbol in 32 px, Name und Endung zusammen in
// .mc-att-text (bis zwei Zeilen; die Größe steht nur im Tooltip hinter dem
// vollen Namen, Eichfall E16),
// je Kachel ein runder Sichern-Knopf (speichert genau diesen Anhang mit
// Dialog); bei einem einzigen Anhang keine Kopfzeile, die Kachel steht immer
// offen (mc-single, Gestaltung in userChrome.css). Ab zwei Anhängen endet die
// Kopfzeile am rechten Rand der rechten Kachelspalte (--mt-att-cols-right).
// Einladung in der Mail (Thunderbirds Einladungsdetails unter dem Text, Variante
// A der Vorschau „Seltene Symbole“, 15.11.2026): wie im Einladungsfenster graue
// Karte, Beschriftungen ohne Doppelpunkt, Personen mit Initialen im grauen Kreis,
// Name und Adresse getrennt (die eigene Adresse als „You“), rechts das Zeichen
// des Zusage-Stands (.mc-inv-st[data-st], Gestaltung in parts.css). Nur bei den
// Teilnehmern: Beim Organisator kennt Thunderbird meist keinen Stand (ORGANIZER
// ohne PARTSTAT gilt als NEEDS-ACTION), dort also kein Zeichen. Rolle und Stand
// stehen weiter im Tooltip der Zeile. Die Leiste über der Mail ersetzt die
// Personen bei einem Abgleich mit dem Kalender neu – daher ein Beobachter
function decorateInvitation(target) {
  try {
    const doc = target?.document || target?.contentDocument || target?.ownerDocument || target;
    const body = doc?.getElementById?.("messagepane")?.contentDocument;
    const table = body?.querySelector?.(".invitation-table");
    if (!table) {
      return;
    }
    const run = () => {
      for (const th of table.querySelectorAll("th.description")) {
        const t = th.textContent, u = t.replace(/\s*:\s*$/, "");
        if (u != t) {
          th.textContent = u;
        }
      }
      let own = null;
      for (const label of table.querySelectorAll(".attendee-label:not([mc-inv])")) {
        const nameEl = label.querySelector(":scope > .attendee-name");
        if (!nameEl) {
          continue;
        }
        label.setAttribute("mc-inv", "");
        const text = nameEl.textContent.trim();
        const m = text.match(/^(.*?)\s*<([^<>]+)>\s*(.*)$/);
        const name = (m ? m[1] : "").replace(/^"(.*)"$/, "$1").trim();
        const mail = (m ? m[2] : text).replace(/^mailto:/i, "").trim();
        const rest = m ? m[3] : "";
        own ||= new Set([...MailServices.accounts.allIdentities].map(i => (i.email || "").toLowerCase()).filter(Boolean));
        const self = own.has(mail.toLowerCase());
        const words = (name || mail.split("@")[0]).split(/[\s._-]+/).filter(Boolean);
        const initials = ((words[0]?.[0] || "") + (words.length > 1 ? words.at(-1)[0] : "")).toUpperCase() || "?";
        const av = body.createElement("span");
        av.className = "mc-inv-av";
        av.textContent = initials;
        const nm = body.createElement("span");
        nm.className = "mc-inv-name";
        nm.textContent = name || mail;
        const sub = body.createElement("span");
        sub.className = "mc-inv-mail";
        sub.textContent = self ? tr("You") : name ? mail : "";
        nameEl.replaceChildren(nm, sub);
        if (rest) {
          nameEl.append(" " + rest);
        }
        label.insertBefore(av, label.firstChild);
        const icon = label.querySelector(":scope > .itip-icon");
        if (label.closest("#imipHtml-attendees-cell") && icon) {
          const st = body.createElement("span");
          st.className = "mc-inv-st";
          st.dataset.st = icon.getAttribute("partstat") || "NEEDS-ACTION";
          label.append(st);
        }
      }
    };
    run();
    if (!table.__mcInvObserver) {
      table.__mcInvObserver = new body.defaultView.MutationObserver(run);
      table.__mcInvObserver.observe(table, { childList: true, subtree: true });
    }
  } catch (e) {
    log("invitation decorate error", e);
  }
}

// Die Liste baut Thunderbird erst nach „MsgLoaded“ fertig – daher über einen
// Beobachter der Liste
function decorateAttachments(target) {
  try {
    const doc = target?.document || target?.contentDocument || target?.ownerDocument || target;
    const list = doc?.getElementById?.("attachmentList");
    const view = doc?.getElementById?.("attachmentView");
    const win = doc?.defaultView;
    if (!list || !view || !win || list.__mcDecorated) {
      return;
    }
    list.__mcDecorated = true;
    const update = () => {
      const items = [...list.querySelectorAll(":scope > .attachmentItem")];
      for (const item of items) {
        if (item.querySelector(":scope > .mc-att-save")) {
          continue;
        }
        const btn = doc.createElementNS("http://www.w3.org/1999/xhtml", "button");
        btn.className = "mc-att-save";
        btn.type = "button";
        btn.title = tr("Save Attachment");
        btn.setAttribute("aria-label", btn.title);
        btn.tabIndex = -1;
        // Klick speichert nur, ohne die Zeile zu wählen oder zu öffnen
        for (const type of ["mousedown", "dblclick"]) {
          btn.addEventListener(type, event => {
            event.preventDefault();
            event.stopPropagation();
          });
        }
        btn.addEventListener("click", event => {
          event.preventDefault();
          event.stopPropagation();
          item.attachment?.save(win.browsingContext).catch(e => log("attachment save error", e));
        });
        // Name und Endung in einem Block, damit der Name über zwei Zeilen
        // umbrechen kann (Thunderbird findet beide weiter per querySelector)
        const name = item.querySelector(":scope > .attachmentcell-name");
        const ext = item.querySelector(":scope > .attachmentcell-extension");
        const size = item.querySelector(":scope > .attachmentcell-size");
        if (name && ext && size) {
          const text = doc.createElementNS("http://www.w3.org/1999/xhtml", "div");
          text.className = "mc-att-text";
          const title = doc.createElementNS("http://www.w3.org/1999/xhtml", "div");
          title.className = "mc-att-title";
          item.insertBefore(text, name);
          title.append(name, ext);
          text.append(title, size);
        }
        const after = item.querySelector(":scope > .attach-drop-indicator.after");
        item.insertBefore(btn, after);
      }
      tips();
      bigIcons();
      // (Breite der Zeilen neu, mit dem Symbol – sonst fehlte bei einem
      // Anhang der Dateiname)

      const single = items.length == 1;
      view.toggleAttribute("mc-single", single);
      // eine Datei: immer offen (die Kopfzeile zum Aufklappen fehlt dann)
      if (single && list.collapsed) {
        try {
          win.toggleAttachmentList?.(true);
        } catch {} // gewollt: Fenster ohne Anhangsliste
      }
      fitHeight();
    };
    // voller Name und Größe beim Überfahren (die Kachel kürzt den Namen nach
    // zwei Zeilen und zeigt keine Größe); Thunderbird trägt die Größe teils
    // erst später ein
    const tips = () => {
      for (const item of list.querySelectorAll(":scope > .attachmentItem")) {
        const full = item.getAttribute("name") || item.attachment?.name || "";
        const size = item.querySelector(".attachmentcell-size");
        const bytes = size && !size.hidden ? size.textContent.trim() : "";
        const tip = bytes ? `${full} (${bytes})` : full;
        if (item.getAttribute("tooltiptext") != tip) {
          item.setAttribute("tooltiptext", tip);
        }
      }
    };
    // Dateisymbol in 32 px statt 16 (scharf statt vergrößert); Thunderbird
    // setzt es beim Laden neu
    const bigIcons = () => {
      for (const img of list.querySelectorAll(".attachmentItem > img.attachmentcell-icon[srcset*='size=16']")) {
        img.setAttribute("srcset", img.getAttribute("srcset").replace(/size=16/g, "size=32"));
      }
    };
    // rechter Rand der rechten Kachelspalte, gemessen ab dem Rand der Ansicht
    const alignBar = () => {
      if (list.collapsed) {
        return;
      }
      const left = view.getBoundingClientRect().left;
      let right = 0;
      for (const item of list.querySelectorAll(":scope > .attachmentItem")) {
        right = Math.max(right, item.getBoundingClientRect().right - left);
      }
      if (right > 0) {
        const px = `${Math.round(right)}px`;
        if (view.style.getPropertyValue("--mt-att-cols-right") != px) {
          view.style.setProperty("--mt-att-cols-right", px);
        }
      }
    };
    // Höhe der aufgeklappten Liste: Thunderbird misst sie einmal beim
    // Aufklappen (--preferred-height) – unsere Zeilen sind höher und bekommen
    // den Speichern-Knopf erst danach, die letzte Datei war dann halb
    // abgeschnitten. Neu messen, sobald sich Liste oder Zeilen ändern
    const fitHeight = () => {
      alignBar();
      if (!view.classList.contains("list-expanded") || list.collapsed) {
        return;
      }
      const bar = doc.getElementById("attachmentBar");
      const h = Math.ceil(list.scrollHeight + (bar?.scrollHeight || 0) + 2);
      if (Math.abs((parseFloat(view.style.getPropertyValue("--preferred-height")) || 0) - h) >= 1) {
        view.style.setProperty("--preferred-height", `${h}px`);
      }
    };
    // (für das Fenster einer geöffneten Mail: Höhe gleich beim Umschalten)
    view.__mcFitHeight = fitHeight;
    new win.MutationObserver(update).observe(list, { childList: true });
    new win.MutationObserver(bigIcons).observe(list, { subtree: true, attributes: true, attributeFilter: ["srcset"] });
    new win.MutationObserver(tips).observe(list, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ["name", "hidden"] });
    new win.MutationObserver(fitHeight).observe(view, { attributeFilter: ["class"] });
    new win.ResizeObserver(fitHeight).observe(list);
    update();
  } catch (e) {
    log("attachments decorate error", e);
  }
}

function fitShortMessage(target) {
  try {
    const doc = target?.document || target?.ownerDocument || target;
    const mp = doc?.getElementById?.("messagepane");
    const box = doc?.getElementById?.("messagepanebox");
    const win = doc?.defaultView;
    if (!mp || !box || !win || doc.documentElement.hasAttribute("mc-conv-card")) {
      return;
    }
    const apply = () => {
      try {
        const inner = mp.contentDocument?.documentElement;
        const view = doc.getElementById("attachmentView");
        const shown = view && !view.hidden && !view.collapsed && view.getBoundingClientRect().height > 0;
        if (!inner || !shown) {
          if (mp.style.height) {
            mp.style.removeProperty("flex");
            mp.style.removeProperty("height");
          }
          return;
        }
        // Platz für den Text = Höhe des Bereichs minus alles andere darin
        let others = 0;
        for (const el of box.children) {
          if (el != mp) {
            others += el.getBoundingClientRect().height;
          }
        }
        const avail = box.getBoundingClientRect().height - others;
        const body = mp.contentDocument.body;
        const need = Math.ceil(Math.max(body?.scrollHeight || 0, body?.getBoundingClientRect().bottom || 0)) + 16;
        if (need > 0 && need < avail - 24) {
          if (mp.style.height != `${need}px`) {
            mp.style.setProperty("flex", "none");
            mp.style.setProperty("height", `${need}px`);
          }
        } else if (mp.style.height) {
          mp.style.removeProperty("flex");
          mp.style.removeProperty("height");
        }
      } catch (e) {
        // Dokument schon entladen ist gewollt, alles andere ins Protokoll (Mail bliebe ohne angepasste Höhe)
        let gone = true;
        try {
          gone = Cu.isDeadWrapper(doc) || Cu.isDeadWrapper(mp) || !doc.defaultView || doc.defaultView.closed || !mp.contentDocument;
        } catch {} // gewollt: Zugriff scheitert nur, wenn das Fenster schon weg ist
        if (!gone) {
          log("short message height error", e);
        }
      }
    };
    const later = () => win.requestAnimationFrame(apply);
    // neue Mail: erst ohne feste Höhe messen
    mp.style.removeProperty("flex");
    mp.style.removeProperty("height");
    later();
    win.setTimeout(apply, 300);
    if (!box.__mcShortFit) {
      box.__mcShortFit = new win.ResizeObserver(later);
      box.__mcShortFit.observe(box);
      const view = doc.getElementById("attachmentView");
      if (view) {
        box.__mcShortFit.observe(view);
      }
    }
    const iw = mp.contentWindow;
    const mdoc = mp.contentDocument;
    if (iw && mdoc && !mdoc.__mcShortFit) {
      mdoc.__mcShortFit = true;
      // nachgeladene Bilder, aufgeklappte Zitate
      new iw.ResizeObserver(later).observe(mdoc.body || mdoc.documentElement);
      mdoc.addEventListener("load", later, true);
    }
  } catch {} // gewollt: Mail schon entladen, keine Anpassung nötig
}

function fitWideMessage(target) {
  try {
    const doc = target?.document || target?.ownerDocument || target;
    const mp = doc?.getElementById?.("messagepane");
    const win = mp?.contentWindow;
    const mdoc = mp?.contentDocument;
    if (!win || !mdoc?.body || !/^(imap|mailbox|news|nntp|ews|owl|file):/.test(mdoc.documentURI)) {
      return;
    }
    const body = mdoc.body;
    if (body.querySelector(":scope > :is(.moz-text-plain, .moz-text-flowed)")) {
      return;
    }
    let busy = false;
    const apply = () => {
      if (busy || !body.isConnected) {
        return;
      }
      busy = true;
      try {
        const root = mdoc.documentElement;
        body.style.removeProperty("zoom");
        const avail = root.clientWidth;
        const need = Math.max(body.scrollWidth, root.scrollWidth);
        if (avail > 0 && need > avail + 2) {
          // nicht kleiner als die Hälfte – sonst wird die Schrift unlesbar
          body.style.setProperty("zoom", String(Math.max(0.5, Math.floor((avail / need) * 1000) / 1000)));
          body.dataset.mcFit = "1";
        } else {
          delete body.dataset.mcFit;
        }
      } finally {
        busy = false;
      }
    };
    apply();
    if (!mdoc.__mcFitHooked) {
      mdoc.__mcFitHooked = true;
      // (Fensterbreite, Today-Pane, Seitenleiste – und nachgeladene Bilder)
      new win.ResizeObserver(() => win.requestAnimationFrame(apply)).observe(mdoc.documentElement);
      mdoc.addEventListener("load", () => win.requestAnimationFrame(apply), true);
    }
  } catch (e) {
    log("fit message error", String(e).slice(0, 120));
  }
}

// Verteiler, bei denen die Ein-Klick-Abmeldung geklappt hat (List-ID, sonst
// Absenderadresse), als Liste in einer Einstellung – höchstens die letzten 500
const UNSUBSCRIBED_PREF = "extensions.mailcards.unsubscribedLists";
function unsubscribedLists() {
  try {
    const list = JSON.parse(Services.prefs.getStringPref(UNSUBSCRIBED_PREF, "[]"));
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}
function rememberUnsubscribed(key) {
  if (!key) {
    return;
  }
  const list = unsubscribedLists().filter(k => k != key);
  list.push(key);
  Services.prefs.setStringPref(UNSUBSCRIBED_PREF, JSON.stringify(list.slice(-500)));
}
function unsubscribeKey(data, hdr) {
  const id = (data?.["list-id"]?.headerValue || "").match(/<([^>]+)>/)?.[1] || data?.["list-id"]?.headerValue || "";
  if (id.trim()) {
    return "list:" + id.trim().toLowerCase();
  }
  try {
    const email = MailServices.headerParser.parseDecodedHeader(hdr.mime2DecodedAuthor || hdr.author)[0]?.email;
    return email ? "from:" + email.toLowerCase() : "";
  } catch {
    return "";
  }
}

// Termin/Aufgabe: Datum und Uhrzeit wie in Apple Kalender – Klick aufs Datum
// öffnet nur die Datumsauswahl (Thunderbirds Minimonat), Klick auf die Uhrzeit
// nur ein kleines Popover mit dem Uhrzeitfeld (Stunden/Minuten, Pfeiltasten,
// Mausrad) statt Thunderbirds Stundenraster. Werte gehen in die vorhandenen
// Felder zurück – Dauer, Zeitzone und „Ganztägig“ regelt weiter Thunderbird
// Verfassen wie Apple Mail: Formatleiste nur bei Bedarf über „Aa“ (gemerkt),
// Weiterleitungskopf wie bei Apple – „Begin forwarded message:“, Absender
// zuerst, Datum in Ortszeit statt „+0000“ (Rahmen und Balken: compose-body.css)
const COMPOSE_FORMAT_PREF = "extensions.mailcards.composeFormatBar";

// Suchleiste (Verfassen, Leseansicht): Schließen heißt wie beim Mac „Done“
// und steht als Textknopf rechts (userChrome.css zeigt data-mc-label nur
// dann, ohne halo.spaces bleibt Thunderbirds ×). Thunderbird legt die Leiste
// in der Leseansicht erst beim ersten Öffnen an, darum beim Öffnen
// beschriften; kein „label“, das entfernt Fluent beim Übersetzen wieder
function hookFindbarDone(doc) {
  if (!doc || doc.__mcFindDone) {
    return;
  }
  doc.__mcFindDone = true;
  const label = bar => {
    const close = bar?.querySelector?.(".findbar-closebutton");
    if (close && close.dataset.mcLabel != tr("Done")) {
      close.dataset.mcLabel = tr("Done");
    }
  };
  doc.addEventListener("findbaropen", e => label(e.target), true);
  for (const bar of doc.querySelectorAll("findbar")) {
    label(bar);
  }
}

function hookComposeApple(win, cleanups) {
  const doc = win.document;
  const bar = doc.getElementById("composeToolbar2");
  if (!bar || bar.__mcApple) {
    return;
  }
  bar.__mcApple = true;
  const root = doc.documentElement;
  // „Aa“: Formatleiste ein/aus
  const toggle = doc.createXULElement("toolbarbutton");
  toggle.id = "mcFormatToggle";
  toggle.className = "toolbarbutton-1";
  toggle.setAttribute("label", "Aa");
  toggle.setAttribute("tooltiptext", tr("Show Format Bar"));
  const apply = () => {
    const shown = Services.prefs.getBoolPref(COMPOSE_FORMAT_PREF, false);
    root.toggleAttribute("mc-format-hidden", !shown);
    toggle.toggleAttribute("checked", shown);
    toggle.setAttribute("tooltiptext", tr(shown ? "Hide Format Bar" : "Show Format Bar"));
  };
  toggle.addEventListener("command", () => {
    Services.prefs.setBoolPref(COMPOSE_FORMAT_PREF, !Services.prefs.getBoolPref(COMPOSE_FORMAT_PREF, false));
  });
  const send = doc.getElementById("button-send");
  (send?.nextElementSibling ? bar.insertBefore(toggle, send.nextElementSibling) : bar.append(toggle));
  const prefObs = () => apply();
  Services.prefs.addObserver(COMPOSE_FORMAT_PREF, prefObs);
  apply();
  // Tab im Betreff: gleich in den Mailtext wie Apple Mail (Thunderbird geht
  // der Reihe nach über den Trenner der Kopfzeilen und die Formatleiste)
  const subject = doc.getElementById("msgSubject");
  const onSubjectTab = event => {
    if (event.key != "Tab" || event.shiftKey || event.ctrlKey || event.altKey || event.metaKey ||
      typeof win.focusMsgBody != "function") {
      return;
    }
    event.preventDefault();
    win.focusMsgBody();
  };
  subject?.addEventListener("keydown", onSubjectTab);
  // Anhänge als Kacheln: Dateisymbol in 32 px statt 16 (scharf statt vergrößert)
  const bucket = doc.getElementById("attachmentBucket");
  const bigIcons = () => {
    for (const img of bucket?.querySelectorAll(".attachmentItem > img.attachmentcell-icon[srcset*='size=16']") || []) {
      img.setAttribute("srcset", img.getAttribute("srcset").replace(/size=16/g, "size=32"));
    }
  };
  const iconObserver = bucket ? new win.MutationObserver(bigIcons) : null;
  iconObserver?.observe(bucket, { childList: true, subtree: true, attributes: true, attributeFilter: ["srcset"] });
  bigIcons();
  // Mailtext fertig (Antworten/Weiterleiten): Weiterleitungskopf umbauen
  let listener = null;
  const register = () => {
    if (listener || !win.gMsgCompose) {
      return;
    }
    listener = {
      NotifyComposeFieldsReady() {},
      ComposeProcessDone() {},
      SaveInFolderDone() {},
      NotifyComposeBodyReady() {
        win.setTimeout(() => appleForwardHeader(win), 0);
      },
      QueryInterface: ChromeUtils.generateQI(["nsIMsgComposeStateListener"]),
    };
    win.gMsgCompose.RegisterStateListener(listener);
  };
  // der Mailtext kommt oft schon, bevor das Fenster hier eingerichtet ist –
  // darum zusätzlich einige Sekunden lang nachsehen
  let tries = 0;
  const poll = win.setInterval(() => {
    if (win.closed || ++tries > 40 || appleForwardHeader(win) !== false) {
      win.clearInterval(poll);
    }
  }, 250);
  win.addEventListener("compose-window-init", register, { once: true });
  register();
  cleanups?.add(() => {
    iconObserver?.disconnect();
    subject?.removeEventListener("keydown", onSubjectTab);
    Services.prefs.removeObserver(COMPOSE_FORMAT_PREF, prefObs);
    toggle.remove();
    root.removeAttribute("mc-format-hidden");
    try {
      if (listener) {
        win.gMsgCompose?.UnregisterStateListener(listener);
      }
    } catch {} // gewollt: Verfassen-Fenster schon geschlossen
    delete bar.__mcApple;
  });
}

// false: noch kein Weiterleitungstext da (später erneut versuchen)
const appleForwardDone = new WeakSet();

function appleForwardHeader(win) {
  try {
    const body = win.GetCurrentEditorElement?.()?.contentDocument?.body;
    const box = body?.querySelector(".moz-forward-container");
    if (!box) {
      return false;
    }
    if (appleForwardDone.has(box)) {
      return true;
    }
    appleForwardDone.add(box);
    const compose = win.gMsgCompose;
    const wasModified = compose?.bodyModified;
    // Zeile „-------- Forwarded Message --------“
    for (const node of box.childNodes) {
      if (node.nodeType == 3 && /^\s*-{3,}.*-{3,}\s*$/.test(node.data)) {
        node.data = tr("Begin forwarded message:");
        break;
      }
    }
    const table = box.querySelector(":scope > table.moz-email-headers-table");
    if (table) {
      const rows = [...table.querySelectorAll("tr")];
      const label = row => row.querySelector("th")?.textContent.replace(/[:\s]+$/, "").trim();
      // Datum in Ortszeit, lang wie Apple („23. October 2026 at 13:21:33 CEST“);
      // die Zeile erkennt man am Inhalt (RFC-Datum), die Beschriftung ist übersetzt
      for (const row of rows) {
        const td = row.querySelector("td");
        if (td && /\b\d{1,2} \w{3} \d{4} \d{1,2}:\d{2}(:\d{2})? [+-]\d{4}\b/.test(td.textContent)) {
          const date = new Date(td.textContent.trim());
          if (!isNaN(date)) {
            td.textContent = new Intl.DateTimeFormat(regionLocale(), { dateStyle: "long", timeStyle: "long" }).format(date);
          }
        }
      }
      // Absender zuerst wie bei Apple (From, Subject, Date, To)
      const FROM_LABELS = ["From", "Von", "De", "Da"];
      const from = rows.find(r => FROM_LABELS.includes(label(r)));
      if (from && from != rows[0]) {
        rows[0].before(from);
      }
    }
    if (compose && !wasModified) {
      compose.bodyModified = false;
    }
    win.GetCurrentEditor?.()?.resetModificationCount?.();
    return true;
  } catch (e) {
    log("forward header error", String(e).slice(0, 120));
    return true;
  }
}

// Dialogfenster wie Karten: ohne sichtbare Titelleiste (Inhalt reicht bis
// oben, macOS zeichnet nur die Fensterknöpfe), der freie Streifen oben bleibt
// zum Verschieben. Nur macOS – unter Windows/Linux zeichnet das System die
// Fensterknöpfe nicht in den Inhalt.
const CARD_WINDOWS = [
  "chrome://calendar/content/calendar-event-dialog.xhtml",
  "chrome://calendar/content/calendar-summary-dialog.xhtml",
  "chrome://messenger/content/folderProps.xhtml",
  "chrome://messenger/content/FilterListDialog.xhtml",
  "chrome://messenger/content/FilterEditor.xhtml",
];

function cardWindow(win) {
  if (Services.appinfo.OS != "Darwin") {
    return;
  }
  const root = win.document.documentElement;
  if (!root || root.hasAttribute("mc-card-window")) {
    return;
  }
  root.setAttribute("customtitlebar", "true");
  root.setAttribute("chromemargin", "0,-1,-1,-1");
  root.setAttribute("mc-card-window", "");
  cardWindowButtons(win);
  // der Streifen oben braucht Platz: Fenster, die sich nach ihrem Inhalt
  // richten, um das Fehlende verlängern statt unten abzuschneiden
  let grown = 0;
  const grow = () => {
    if (win.closed) {
      return;
    }
    const need = Math.ceil(root.scrollHeight - win.innerHeight);
    // höchstens um den Streifen (Schutz gegen Inhalte, die mitwachsen)
    if (need > 0 && grown + need <= 40) {
      grown += need;
      win.resizeBy(0, need);
    }
  };
  // (Thunderbirds Dialoge passen ihre Größe nach dem Laden teils selbst an)
  win.addEventListener("load", () => {
    for (const ms of [50, 400, 1200]) {
      win.setTimeout(grow, ms);
    }
  }, { once: true });
}

// Platzhalter für die Fensterknöpfe (Ampel): Zeichnet ein Fenster seine Titelleiste selbst, setzt macOS die Knöpfe
// dorthin, wo ein Element mit -moz-window-button-box liegt; fehlt es, schiebt Gecko sie über den Fensterrand und sie
// sind weg (nsCocoaWindow.mm, FrameView__closeButtonOrigin: „Empty rect. Let's hide the buttons.“). Haupt-, Mail- und
// Verfassen-Fenster bringen ihn mit (.titlebar-buttonbox), die Kartenfenster nicht – ohne ihn ließen sie sich nicht
// mit der Maus schließen oder verkleinern. Lage im Streifen oben: spaces.css (.mc-card-buttons)
function cardWindowButtons(win) {
  const doc = win.document;
  // (im Aufgabenfenster ist die Wurzel XUL, document.body dort leer)
  const body = doc.body || doc.documentElement?.querySelector(":scope > body");
  if (!body || doc.querySelector(".mc-card-buttons")) {
    return;
  }
  const box = doc.createXULElement("hbox");
  box.className = "mc-card-buttons";
  const inner = doc.createXULElement("hbox");
  inner.className = "mc-card-buttonbox";
  // (-moz-default-appearance gilt nur in Stilblättern der Stufe AGENT, nicht im Stil des Elements oder im Theme)
  try {
    win.windowUtils.loadSheetUsingURIString(`resource://mailcards/window-buttons.css?v=${extensionVersion}`, win.windowUtils.AGENT_SHEET);
  } catch (e) {
    log("window buttons sheet", e);
  }
  box.append(inner);
  body.append(box);
}

// Nachfragen im Fenster statt als eigenes Fenster (wie in Firefox): Thunderbirds
// Prompter zeigt Nachfragen eines Fensters als Kachel darin, sobald das Fenster
// ein gDialogBox anbietet (Prompter.sys.mjs: MODAL_TYPE_INTERNAL_WINDOW). Wir
// bieten es im Haupt- und im Verfassen-Fenster an – mit Thunderbirds eigenem
// SubDialog (wie die Unterdialoge der Einstellungen). Immer an, wie die
// Blätter in Apple Mail (die Option entfiel am 17.11.2026)

function installDialogBox(win, restorers) {
  if (win.gDialogBox || !win.document?.documentElement) {
    return;
  }
  const doc = win.document;
  const { SubDialogManager } = ChromeUtils.importESModule("resource://gre/modules/SubDialog.sys.mjs");
  const X = "http://www.w3.org/1999/xhtml";
  // Behälter: ein modales <dialog> (oberste Ebene, sperrt das Fenster dahinter)
  const host = doc.createElementNS(X, "dialog");
  host.id = "mcDialogBox";
  host.__mcOwner = HOOK_OWNER;
  (doc.body || doc.documentElement).append(host);
  // Vorlage wie in den Einstellungen (preferences.xhtml #dialogTemplate)
  const template = doc.createXULElement("vbox");
  // ohne align/pack: die Lage bestimmt userChrome.css (oben mittig wie ein Sheet)
  template.className = "dialogOverlay";
  template.setAttribute("topmost", "true");
  template.hidden = true;
  const box = doc.createXULElement("vbox");
  box.className = "dialogBox";
  box.setAttribute("role", "dialog");
  const bar = doc.createXULElement("hbox");
  bar.className = "dialogTitleBar";
  bar.setAttribute("align", "center");
  const title = doc.createXULElement("label");
  title.className = "dialogTitle";
  title.setAttribute("flex", "1");
  const close = doc.createXULElement("button");
  close.className = "dialogClose close-icon";
  bar.append(title, close);
  const frame = doc.createXULElement("browser");
  frame.className = "dialogFrame";
  frame.setAttribute("autoscroll", "false");
  frame.setAttribute("disablehistory", "true");
  box.append(bar, frame);
  template.append(box);
  const waiting = [];
  let busy = false;
  const dialogBox = {
    get isOpen() {
      return busy;
    },
    async open(uri, args) {
      while (busy) {
        await new Promise(resolve => waiting.push(resolve));
      }
      busy = true;
      try {
        host.textContent = "";
        host.showModal();
        const manager = new SubDialogManager({
          dialogStack: host,
          dialogTemplate: template,
          orderType: SubDialogManager.ORDER_QUEUE,
          allowDuplicateDialogs: true,
          dialogOptions: {
            consumeOutsideClicks: false,
            styleSheets: [`resource://mailcards/dialog-box.css?v=${extensionVersion}`],
          },
        });
        await new Promise(resolve => {
          const opened = manager.open(uri, { features: "resizable=no", closedCallback: resolve }, args);
          if (!opened) {
            resolve();
          }
        });
      } finally {
        if (host.open) {
          host.close();
        }
        host.textContent = "";
        busy = false;
        waiting.shift()?.();
      }
    },
  };
  // Höhe nachziehen, wenn der Inhalt nach dem Messen höher wird (Text bricht
  // im schmalen Fenster um, Kachel höchstens fensterbreit): sonst lägen die
  // Knöpfe unter dem Rand der Kachel (GitHub #45)
  host.addEventListener("dialogopen", event => {
    const dialog = event.detail?.dialog, frame = dialog?._frame, overlay = dialog?._overlay;
    const cwin = frame?.contentWindow, root = frame?.contentDocument?.documentElement;
    if (!cwin || !root || !overlay || typeof cwin.ResizeObserver != "function") {
      return;
    }
    // gemessene Breite (SubDialog setzt sie beim Laden fest)
    const wide = parseFloat(frame.style.width) || 0;
    const fit = () => {
      if (!frame.isConnected) {
        win.removeEventListener("resize", fit);
        return;
      }
      root.toggleAttribute("mc-narrow", frame.getBoundingClientRect().width + 1 < wide);
      const need = Math.ceil(root.scrollHeight);
      if (need > frame.clientHeight + 1) {
        overlay.style.setProperty("--subdialog-inner-height", `${need}px`);
      }
    };
    new cwin.ResizeObserver(fit).observe(frame.contentDocument.body || root);
    win.addEventListener("resize", fit);
    fit();
  });
  win.gDialogBox = dialogBox;
  restorers?.push(() => {
    if (win.gDialogBox === dialogBox) {
      delete win.gDialogBox;
    }
    host.remove();
  });
}

// Seiten im Fenster (Mailansicht about:3pane/about:message) fragen über ihr
// eigenes Fenster nach – dort auf die Kachel des äußeren Fensters verweisen
function shareDialogBox(win, restorers) {
  if (Object.getOwnPropertyDescriptor(win, "gDialogBox")) {
    return;
  }
  Object.defineProperty(win, "gDialogBox", {
    configurable: true,
    get: () => {
      const top = win.browsingContext?.topChromeWindow;
      return top && top !== win ? top.gDialogBox : undefined;
    },
  });
  restorers?.push(() => {
    try {
      delete win.gDialogBox;
    } catch {} // gewollt: Fenster schon geschlossen
  });
}

// Aufgaben-Ansicht wie die Mailliste wählbar: „Liste“ (Standard) mit den
// Details rechts neben der Liste und nur Erledigt/Titel/Fälligkeit, „Tabelle“
// wie bisher mit allen Spalten und den Details darunter. In schmalen Fenstern
// rutschen die Details auch in der Liste wieder unter die Liste.
const TASK_VIEW_PREF = "extensions.mailcards.taskView";
const TASK_COLUMNS_PREF = "extensions.mailcards.taskTableColumns";
const TASK_DETAILS_WIDTH_PREF = "extensions.mailcards.taskDetailsWidth";
const TASK_LIST_COLUMNS = ["completed", "title", "dueDate"];
const TASK_SIDE_MIN = 760; // höchstens: Liste 360 + Details 360 + Teiler/Luft
// Kartenliste der Aufgaben wie die Mailliste: nie schmaler als ihre Karten, nie breiter als nötig
const TASK_LIST_MIN = 360;
const TASK_LIST_MAX = 640;

// „board“: Kanban-Ansicht – Karten in Spalten nach Fortschritt (0 %, 1–99 %,
// 100 %), ohne Detailspalte (Details über das eigene Fenster); Entscheidung des
// Maintainers vom 9.11.2026
function taskView() {
  const v = Services.prefs.getCharPref(TASK_VIEW_PREF, "list");
  return v == "table" || v == "board" ? v : "list";
}

function applyTaskView(win, mode = taskView()) {
  const doc = win.document;
  const tree = doc.getElementById("calendar-task-tree");
  const splitter = doc.getElementById("calendar-task-view-splitter");
  const details = doc.getElementById("calendar-task-details-container");
  const box = tree?.parentElement;
  if (!tree || !splitter || !details || !box) {
    return;
  }
  const root = doc.documentElement;
  // (die Kanban-Ansicht zeigt dieselben Karten wie die Kartenansicht)
  const board = mode == "board";
  const list = mode == "list" || board;
  // Spalten: in der Liste nur Erledigt, Titel, Fälligkeit; die Auswahl der
  // Tabelle wird gemerkt und beim Zurückschalten wiederhergestellt
  const cols = [...tree.querySelectorAll("treecol[itemproperty]")];
  const key = c => c.getAttribute("itemproperty");
  if (cols.length) {
    const state = tree.dataset.mcCols || "table";
    if (list && state != "list") {
      const shown = cols.filter(c => !c.hidden).map(key);
      // nach einem Neustart zeigt die Liste schon die Listenspalten (Thunderbird
      // merkt sich die sichtbaren Spalten) – dann die gemerkte Tabelle behalten
      if (!shown.every(k => TASK_LIST_COLUMNS.includes(k)) || !Services.prefs.prefHasUserValue(TASK_COLUMNS_PREF)) {
        Services.prefs.setCharPref(TASK_COLUMNS_PREF, JSON.stringify(shown));
      }
      for (const c of cols) {
        c.hidden = !TASK_LIST_COLUMNS.includes(key(c));
      }
    } else if (!list && state == "list") {
      let shown = null;
      try {
        shown = JSON.parse(Services.prefs.getCharPref(TASK_COLUMNS_PREF, "null"));
      } catch {} // gewollt: gespeicherte Spalten unlesbar, Standardspalten
      if (Array.isArray(shown) && shown.length) {
        for (const c of cols) {
          c.hidden = !shown.includes(key(c));
        }
      }
    }
    tree.dataset.mcCols = list ? "list" : "table";
  }
  root.toggleAttribute("mc-task-list", list);
  root.toggleAttribute("mc-task-board", board);
  // ausgeblendeter Bereich (z. B. gerade in der Mail) hat keine Breite: dann
  // nichts umstellen – sonst stand nach dem Wechsel zuerst nur die Liste da und
  // die Details kamen erst mit dem nächsten Nachmessen
  const boxWidth = box.getBoundingClientRect().width;
  if (!boxWidth) {
    return;
  }
  // (Details neben der Liste, solange Liste und ihre Knopfzeile hineinpassen –
  // sonst hält die Mindestbreite des Fensters das ohnehin fest)
  const detailsMin = parseFloat(root.style.getPropertyValue("--mc-task-details-min")) || 360;
  const side = list && !board && boxWidth >= Math.min(TASK_SIDE_MIN, 280 + detailsMin + 10);
  if (side == root.hasAttribute("mc-task-side")) {
    return;
  }
  root.toggleAttribute("mc-task-side", side);
  if (side) {
    details.dataset.mcHeight = details.style.height || "";
    details.style.removeProperty("height");
    details.style.width = Services.prefs.getIntPref(TASK_DETAILS_WIDTH_PREF, 380) + "px";
    splitter.setAttribute("orient", "horizontal");
  } else {
    details.style.removeProperty("width");
    if (details.dataset.mcHeight != null) {
      details.style.height = details.dataset.mcHeight || "50%";
      delete details.dataset.mcHeight;
    }
    splitter.setAttribute("orient", "vertical");
  }
}

function setTaskView(win, key) {
  Services.prefs.setCharPref(TASK_VIEW_PREF, key);
  applyTaskView(win);
}

// eigene Liste gewählt: in der Kanban-Ansicht mit, sonst ohne Erledigte
function syncTaskListFilter(win) {
  const tree = win.document.getElementById("calendar-task-tree");
  const value = String(tree?.getAttribute("filterValue") || "");
  const name = taskListFilter(taskListKey(), taskView() == "board");
  if (value.startsWith("mcTasks-") && value != name && typeof win.taskViewUpdate == "function") {
    win.taskViewUpdate(name);
  }
}

// Aufgaben: Ansichten oben in der Seitenleiste wie in der Erinnerungen-App
// (Heute, Geplant, Alle, Wichtig, In Arbeit, Erledigt, je mit Anzahl) statt
// Filterknopf; darunter „Task Lists“ nur mit Kalendern, die Aufgaben können,
// kein Minimonat. Jede Ansicht ist ein eigener Filter in Thunderbirds
// calFilter (taskViewUpdate) – Liste, Suche und Auswahl bleiben Thunderbirds.
const TASK_LIST_PREF = "extensions.mailcards.taskList";
const TASK_LISTS = [
  // [Schlüssel, Text, Status, Fälligkeit, Zusatzbedingung]
  // Reihenfolge: offen → angefangen → erledigt, „Wichtig“ als Merkmal zuletzt;
  // „Open“ (Schlüssel all aus Kompatibilität) zeigt alle offenen Aufgaben
  ["today", "Today", "open", "upToToday"],
  ["scheduled", "Scheduled", "open", "dated"],
  ["all", "Open|tasks", "open", "any"],
  ["progress", "In Progress", "progress", "any"],
  ["completed", "Completed", "done", "any"],
  ["important", "Important", "open", "any", item => item.priority >= 1 && item.priority <= 4],
  // archivierte Aufgaben (offen wie erledigt) – nur hier, in keiner anderen Ansicht
  ["archived", "Archived", "any", "any"],
];

// Aufgaben archivieren wie Mails: ein Merkmal im Eintrag selbst (eigene
// X-Eigenschaft im iCalendar) – kein Löschen, keine Kategorie; so reist es über
// CalDAV mit, andere Programme lassen es stehen und zeigen die Aufgabe weiter
const TASK_ARCHIVED_PROP = "X-HALO-ARCHIVED";
function isTaskArchived(item) {
  try {
    return !!item?.isTodo?.() && String(item.getProperty(TASK_ARCHIVED_PROP) ?? "") == "1";
  } catch {
    return false;
  }
}
// zeigt die Ansicht key eine (nicht) archivierte Aufgabe?
const taskInList = (key, archived) => (key == "archived") == !!archived;
// Aktion für die Auswahl: alle archiviert → zurückholen, sonst archivieren
function archiveAction(flags) {
  if (!flags?.length) {
    return null;
  }
  return flags.every(Boolean) ? "unarchive" : "archive";
}
// Kanban-Ansicht: dieselbe Liste samt Erledigten (sonst bliebe die Spalte
// „Completed“ leer), als eigener Filter „mcTasks-<key>-board“
const taskListFilter = (key, board = false) => `mcTasks-${key}${board ? "-board" : ""}`;
const isTaskListFilter = (value, key) => value == taskListFilter(key) || value == taskListFilter(key, true);

// Rückfrage „Delete“ einer Liste im Bereich Aufgaben: eine Liste ist ein
// Kalender, darum nennt sie dessen Termine mit. modes = Thunderbirds
// capabilities.removeModes; kind wie dort: "delete" (nur Löschen), "both"
// (Abmelden oder Löschen), "unsubscribe" (nur Abmelden), null = nicht möglich
function listDeleteText(modes, name, events = 0) {
  const has = new Set(modes?.length ? modes : ["unsubscribe"]);
  const kind = has.has("delete") ? (has.has("unsubscribe") ? "both" : "delete") : (has.has("unsubscribe") ? "unsubscribe" : null);
  if (!kind) {
    return { kind, text: "" };
  }
  const main = {
    delete: "Do you want to permanently delete the list “{name}” and all its tasks?",
    both: "Do you want to remove the list “{name}”? Unsubscribing removes it from Thunderbird only, deleting also permanently deletes its tasks.",
    unsubscribe: "Do you want to unsubscribe from the list “{name}”?",
  }[kind];
  const lines = [tr(main, { name })];
  if (events > 0) {
    const gone = kind == "unsubscribe";
    lines.push(events == 1
      ? tr(gone ? "The calendar also has one event. It will disappear from the calendar too." : "The calendar also has one event. Deleting the list deletes it too.")
      : tr(gone ? "The calendar also has {count} events. They will disappear from the calendar too." : "The calendar also has {count} events. Deleting the list deletes them too.",
        { count: events.toLocaleString(Services.locale.appLocaleAsBCP47) }));
  }
  return { kind, text: lines.join("\n\n") };
}

function taskListKey() {
  const key = Services.prefs.getCharPref(TASK_LIST_PREF, "all");
  return TASK_LISTS.some(([k]) => k == key) ? key : "all";
}

function defineTaskLists(win) {
  if (typeof win.calFilter != "function" || typeof win.calFilterProperties != "function") {
    return false;
  }
  const filter = new win.calFilter();
  for (const [key, , status, due, extra] of TASK_LISTS) {
   for (const board of [false, true]) {
    const props = new win.calFilterProperties();
    props.start = props.FILTER_DATE_ALL;
    props.end = props.FILTER_DATE_ALL;
    props.occurrences = props.FILTER_OCCURRENCES_PAST_AND_NEXT;
    props.status = {
      open: props.FILTER_STATUS_INCOMPLETE | props.FILTER_STATUS_IN_PROGRESS,
      progress: props.FILTER_STATUS_IN_PROGRESS,
      done: props.FILTER_STATUS_COMPLETED_TODAY | props.FILTER_STATUS_COMPLETED_BEFORE,
    }[status] ?? null;
    if (board && status == "open") {
      props.status |= props.FILTER_STATUS_COMPLETED_TODAY | props.FILTER_STATUS_COMPLETED_BEFORE;
    }
    props.due = {
      upToToday: props.FILTER_DUE_PAST | props.FILTER_DUE_TODAY,
      dated: props.FILTER_DUE_PAST | props.FILTER_DUE_TODAY | props.FILTER_DUE_FUTURE,
      any: props.FILTER_DUE_ALL,
    }[due];
    const accept = (item, result) => result && taskInList(key, isTaskArchived(item)) && (!extra || extra(item));
    // (Kennung für den Riegel in hideArchivedTasks: nur diese Ansicht zeigt Archiviertes)
    accept.mcArchived = key == "archived";
    props.onfilter = accept;
    // die definierten Filter teilen sich alle calFilter (am Prototyp)
    filter.defineFilter(taskListFilter(key, board), props);
   }
  }
  return true;
}

function hookTaskLists(win, restorers) {
  const doc = win.document;
  const panel = doc.getElementById("calendar-panel");
  const tree = doc.getElementById("calendar-task-tree");
  if (!panel || !tree || doc.getElementById("mcTaskLists") || !defineTaskLists(win)) {
    return;
  }
  const { cal } = ChromeUtils.importESModule("resource:///modules/calendar/calUtils.sys.mjs");
  const X = "http://www.w3.org/1999/xhtml";
  const el = (tag, cls, text) => {
    const e = doc.createElementNS(X, tag);
    if (cls) {
      e.className = cls;
    }
    if (text != null) {
      e.textContent = text;
    }
    return e;
  };
  const box = el("div");
  box.id = "mcTaskLists";
  const list = el("ul", "mc-tl-list");
  list.setAttribute("role", "listbox");
  list.setAttribute("aria-label", tr("Tasks"));
  const rows = new Map();
  for (const [key, label] of TASK_LISTS) {
    const row = el("li", "mc-tl-row");
    row.dataset.list = key;
    row.setAttribute("role", "option");
    row.tabIndex = -1;
    const icon = el("span", `mc-tl-icon mc-tl-${key}`);
    row.append(icon, el("span", "mc-tl-name", tr(label)), el("span", "mc-tl-count", ""));
    row.addEventListener("click", () => select(key));
    rows.set(key, row);
    list.append(row);
  }
  list.addEventListener("keydown", event => {
    const keys = TASK_LISTS.map(([k]) => k);
    const i = keys.indexOf(taskListKey());
    const next = event.key == "ArrowDown" ? keys[Math.min(keys.length - 1, i + 1)] : event.key == "ArrowUp" ? keys[Math.max(0, i - 1)] : null;
    if (next) {
      event.preventDefault();
      select(next);
      rows.get(next).focus();
    }
  });
  list.tabIndex = 0;
  box.append(list);
  panel.prepend(box);

  const mark = () => {
    const key = taskListKey();
    for (const [k, row] of rows) {
      row.classList.toggle("selected", k == key);
      row.setAttribute("aria-selected", String(k == key));
    }
  };
  const apply = () => {
    const name = taskListFilter(taskListKey(), taskView() == "board");
    if (tree.getAttribute("filterValue") != name && typeof win.taskViewUpdate == "function") {
      win.taskViewUpdate(name);
    }
  };
  const select = key => {
    Services.prefs.setCharPref(TASK_LIST_PREF, key);
    mark();
    apply();
    win.setTimeout(() => enhancer?.updateListHeader(win), 0);
  };

  // Anzahlen: je Ansicht dieselben Filter über alle eingeblendeten Kalender
  let counting = 0, again = false;
  const count = async () => {
    if (counting) {
      again = true;
      return;
    }
    counting = 1;
    try {
      const composite = cal.view.getCompositeCalendar(win);
      for (const [key] of TASK_LISTS) {
        const f = new win.calFilter();
        f.itemType = Ci.calICalendar.ITEM_FILTER_TYPE_TODO;
        f.applyFilter(taskListFilter(key));
        let n = 0;
        for await (const chunk of cal.iterate.streamValues(f.getItems(composite))) {
          n += chunk.length;
        }
        rows.get(key).querySelector(".mc-tl-count").textContent = n ? n.toLocaleString(Services.locale.appLocaleAsBCP47) : "";
      }
    } catch (e) {
      log("task lists count", e);
    } finally {
      counting = 0;
    }
    if (again) {
      again = false;
      later();
    }
  };
  let timer = 0;
  const later = () => {
    if (win.closed) {
      return;
    }
    win.clearTimeout(timer);
    timer = win.setTimeout(count, 250);
  };
  const observer = {
    QueryInterface: ChromeUtils.generateQI(["calIObserver"]),
    onStartBatch() {},
    onEndBatch: later,
    onLoad: later,
    onAddItem: later,
    onModifyItem: later,
    onDeleteItem: later,
    onError() {},
    onPropertyChanged: later,
    onPropertyDeleting() {},
  };
  const composite = cal.view.getCompositeCalendar(win);
  composite.addObserver(observer);

  // Kalender ohne Aufgaben in „Task Lists“ ausblenden
  const calList = doc.getElementById("calendar-list");
  const tagLists = () => {
    for (const li of calList?.querySelectorAll(":scope > li[calendar-id]") || []) {
      const c = cal.manager.getCalendarById(li.getAttribute("calendar-id"));
      li.toggleAttribute("mc-no-tasks", c?.getProperty("capabilities.tasks.supported") === false);
    }
  };
  const mo = calList ? new win.MutationObserver(tagLists) : null;
  mo?.observe(calList, { childList: true });
  tagLists();
  const header = doc.getElementById("calendar-list-header-label");
  const tasksMode = () => doc.getElementById("tabmail")?.currentTabInfo?.mode?.name == "tasks";

  // Neue Liste wie in Apple Erinnerungen (Aufgaben 4/5): unter den Listen
  // immer eine graue Zeile „⊕ New List“ (nur im Bereich Aufgaben, CSS; mit dem
  // Abschnitt eingeklappt). Klick → Farbpunkt und markierter Name, gleich
  // tippen; Enter (oder Klick daneben) legt eine lokale Liste an, Esc verwirft
  const inner = doc.getElementById("calendar-list-inner-pane");
  const newRow = el("div", "mc-nl-row");
  newRow.id = "mcNewList";
  newRow.setAttribute("role", "button");
  newRow.tabIndex = 0;
  const newIdle = [el("span", "mc-nl-plus"), el("span", "mc-nl-name", tr("New List"))];
  newRow.append(...newIdle);
  const LIST_COLORS = ["#FF3B30", "#FF9500", "#FFCC00", "#34C759", "#007AFF", "#5856D6", "#AF52DE", "#A2845E"];
  const startNewList = () => {
    if (newRow.hasAttribute("data-editing")) {
      return;
    }
    // Abschnitt eingeklappt: erst aufklappen
    if (inner && !inner.getBoundingClientRect().height) {
      doc.getElementById("calendarListHeader")?.click();
    }
    const all = cal.manager.getCalendars();
    const used = new Set(all.map(c => String(c.getProperty("color") || "").toUpperCase()));
    const color = LIST_COLORS.find(c => !used.has(c)) || LIST_COLORS[all.length % LIST_COLORS.length];
    const dot = el("span", "mc-nl-dot");
    dot.style.background = color;
    const input = el("input", "mc-nl-input");
    input.value = tr("New List");
    input.setAttribute("aria-label", tr("New List"));
    newRow.replaceChildren(dot, input);
    newRow.setAttribute("data-editing", "");
    let done = false;
    const finish = keep => {
      if (done) {
        return;
      }
      done = true;
      const name = input.value.trim();
      newRow.replaceChildren(...newIdle);
      newRow.removeAttribute("data-editing");
      if (!keep || !name) {
        return;
      }
      try {
        const c = cal.manager.createCalendar("storage", Services.io.newURI("moz-storage-calendar://"));
        c.name = name;
        c.setProperty("color", color);
        cal.manager.registerCalendar(c);
        // die neue Liste gleich wählen (neue Aufgaben landen dort)
        win.setTimeout(() => {
          const rows = calList?.rows || [...(calList?.children || [])];
          const i = rows.findIndex(li => li.getAttribute("calendar-id") == c.id);
          if (i >= 0) {
            calList.selectedIndex = i;
          }
        }, 0);
      } catch (e) {
        log("new list error", e);
      }
    };
    input.addEventListener("keydown", event => {
      if (event.key == "Enter") {
        event.preventDefault();
        finish(true);
      } else if (event.key == "Escape") {
        event.preventDefault();
        finish(false);
      }
      event.stopPropagation();
    });
    input.addEventListener("blur", () => win.setTimeout(() => finish(true), 0));
    input.focus();
    input.select();
  };
  newRow.addEventListener("click", startNewList);
  newRow.addEventListener("keydown", event => {
    if (event.target == newRow && (event.key == "Enter" || event.key == " ")) {
      event.preventDefault();
      startNewList();
    }
  });
  calList?.after(newRow);
  // für die Menüleiste (File → New List…) und den automatischen Test
  win.__mcStartNewList = startNewList;

  // Kontextmenü der Listenspalte im Bereich Aufgaben: „Show All Lists“,
  // „New List“, „Add Online List…“ (Thunderbirds Assistent „New Calendar…“);
  // im Bereich Kalender unverändert. Wie die Erinnerungen-App ohne Export und
  // Veröffentlichen; „Properties“ heißt „Show List Info“ (Dialog „List Info“,
  // siehe listInfoDialog), „Delete Calendar…“ wird „Delete“ mit eigener
  // Rückfrage, die mitgelöschte Termine des Kalenders nennt
  const ctx = doc.getElementById("list-calendars-context-menu");
  const ctxNew = doc.createXULElement("menuitem");
  ctxNew.id = "mcListContextNew";
  ctxNew.setAttribute("label", tr("New List"));
  ctxNew.addEventListener("command", () => win.setTimeout(startNewList, 0));
  doc.getElementById("list-calendars-context-new")?.before(ctxNew);
  const deleteList = async calendar => {
    if (!calendar || cal.manager.getCalendars().length <= 1) {
      return; // wie Thunderbird: den letzten Kalender nicht löschen
    }
    let events = 0;
    try {
      for await (const chunk of cal.iterate.streamValues(calendar.getItems(Ci.calICalendar.ITEM_FILTER_TYPE_EVENT, 0, null, null))) {
        events += chunk.length;
      }
    } catch (e) {
      log("delete list count", e);
    }
    const { kind, text } = listDeleteText(calendar.getProperty("capabilities.removeModes"), calendar.name, events);
    if (!kind) {
      return;
    }
    const res = await confirmDeleteList(win, kind, text);
    if (res == 1) {
      return;
    }
    const keepData = kind == "unsubscribe" || (kind == "both" && res == 0);
    cal.manager.removeCalendar(calendar, keepData ? Ci.calICalendarManager.REMOVE_NO_DELETE : 0);
  };
  const ctxDelete = doc.createXULElement("menuitem");
  ctxDelete.id = "mcListContextDelete";
  ctxDelete.setAttribute("label", tr("Delete"));
  ctxDelete.addEventListener("command", () => {
    const calendar = ctx.contextCalendar;
    win.setTimeout(() => deleteList(calendar).catch(e => log("delete list", e)), 0);
  });
  doc.getElementById("list-calendars-context-delete")?.after(ctxDelete);
  // „Rename“ wie in Apple Erinnerungen: der Name wird direkt in der Zeile zum
  // Feld (wie bei „New List“); Enter oder Klick daneben übernimmt, Esc verwirft
  const renameList = calendar => {
    const li = [...(calList?.children || [])].find(x => x.getAttribute("calendar-id") == calendar?.id);
    const label = li?.querySelector(".calendar-name");
    if (!label || li.querySelector(".mc-rename-input")) {
      return;
    }
    const input = el("input", "mc-nl-input mc-rename-input");
    input.value = calendar.name;
    input.setAttribute("aria-label", tr("Rename"));
    label.hidden = true;
    label.after(input);
    let done = false;
    const finish = keep => {
      if (done) {
        return;
      }
      done = true;
      const name = input.value.trim();
      input.remove();
      label.hidden = false;
      if (keep && name && name != calendar.name) {
        try {
          calendar.name = name;
        } catch (e) {
          log("rename list error", e);
        }
      }
    };
    input.addEventListener("keydown", event => {
      if (event.key == "Enter") {
        event.preventDefault();
        finish(true);
      } else if (event.key == "Escape") {
        event.preventDefault();
        finish(false);
      }
      event.stopPropagation();
    });
    // Klicks ins Feld nicht an die Liste (die nähme sonst den Fokus)
    for (const type of ["mousedown", "click", "dblclick"]) {
      input.addEventListener(type, event => event.stopPropagation());
    }
    input.addEventListener("blur", () => win.setTimeout(() => finish(true), 0));
    input.focus();
    input.select();
  };
  const ctxRename = doc.createXULElement("menuitem");
  ctxRename.id = "mcListContextRename";
  ctxRename.setAttribute("label", tr("Rename"));
  ctxRename.addEventListener("command", () => {
    const calendar = ctx.contextCalendar;
    win.setTimeout(() => renameList(calendar), 0);
  });
  doc.getElementById("list-calendars-context-edit")?.after(ctxRename);
  const relabel = [["list-calendars-context-showall", "Show All Lists"], ["list-calendars-context-new", "Add Online List…"],
    ["list-calendars-context-edit", "Show List Info"]];
  // im Bereich Aufgaben ausgeblendet (alle nur mit gewähltem Kalender sichtbar)
  const ctxHide = ["list-calendars-context-delete", "list-calendars-context-itemops-menuseparator",
    "list-calendars-context-export", "list-calendars-context-publish"];
  const ctxSaved = new Map();
  const onCtx = event => {
    if (event.target != ctx) {
      return;
    }
    const tasks = tasksMode();
    ctxNew.hidden = !tasks;
    ctxDelete.hidden = !tasks || !ctx.contextCalendar;
    ctxRename.hidden = !tasks || !ctx.contextCalendar;
    for (const id of ctxHide) {
      const item = doc.getElementById(id);
      if (item) {
        item.hidden = tasks || !ctx.contextCalendar;
      }
    }
    for (const [id, label] of relabel) {
      const item = doc.getElementById(id);
      if (!item) {
        continue;
      }
      if (tasks) {
        if (!ctxSaved.has(id)) {
          ctxSaved.set(id, item.getAttribute("data-l10n-id"));
        }
        item.removeAttribute("data-l10n-id");
        item.setAttribute("label", tr(label));
      } else if (ctxSaved.has(id)) {
        item.setAttribute("data-l10n-id", ctxSaved.get(id));
        doc.l10n?.translateElements([item]);
        ctxSaved.delete(id);
      }
    }
  };
  ctx?.addEventListener("popupshowing", onCtx);
  let oldHeader = null;
  const onTab = () => {
    if (!header) {
      return;
    }
    if (tasksMode()) {
      oldHeader ??= { l10n: header.getAttribute("data-l10n-id"), text: header.textContent };
      header.removeAttribute("data-l10n-id");
      header.textContent = tr("Task Lists");
      mark();
      apply();
      later();
    } else if (oldHeader) {
      if (oldHeader.l10n) {
        header.setAttribute("data-l10n-id", oldHeader.l10n);
        doc.l10n?.translateElements([header]);
      } else {
        header.textContent = oldHeader.text;
      }
      oldHeader = null;
    }
  };
  const tabs = doc.getElementById("tabmail")?.tabContainer;
  tabs?.addEventListener("TabSelect", onTab);
  onTab();
  mark();
  later();
  restorers.push(() => {
    composite.removeObserver(observer);
    mo?.disconnect();
    newRow.remove();
    ctxNew.remove();
    ctxDelete.remove();
    ctx?.removeEventListener("popupshowing", onCtx);
    for (const [id, l10n] of ctxSaved) {
      const item = doc.getElementById(id);
      if (item && l10n) {
        item.setAttribute("data-l10n-id", l10n);
      }
    }
    delete win.__mcStartNewList;
    tabs?.removeEventListener("TabSelect", onTab);
    win.clearTimeout(timer);
    if (oldHeader) {
      header.textContent = oldHeader.text;
      if (oldHeader.l10n) {
        header.setAttribute("data-l10n-id", oldHeader.l10n);
      }
    }
    for (const li of calList?.querySelectorAll("[mc-no-tasks]") || []) {
      li.removeAttribute("mc-no-tasks");
    }
    box.remove();
    if (String(tree.getAttribute("filterValue")).startsWith("mcTasks-") && typeof win.taskViewUpdate == "function") {
      win.taskViewUpdate("throughcurrent");
    }
  });
}

// Menüleiste wie in den Apple-Apps: sieben feste Menüs – Thunderbird (macOS
// baut es aus Thunderbirds Einträgen selbst), File, Edit, View, Mail, Window,
// Help. Jeder Befehl genau einmal; Go, Events and Tasks und Tools entfallen,
// ihr Inhalt steht in den übrigen Menüs, in den Einstellungen oder in den
// Kontextmenüs der Bereiche. Thunderbirds Einträge werden nur umgehängt
// (Befehle, Tastenkürzel und Ein-/Ausblenden bleiben bei Thunderbird);
// Einträge, die nicht passen, sind ausgegraut statt verschwunden. In der
// nativen macOS-Leiste wirkt nur das hidden-Attribut, kein CSS.
const MENUBAR_MAC = Services.appinfo.OS == "Darwin";
function hookMenubar(win, restorers) {
  const doc = win.document;
  const bar = doc.getElementById("mail-menubar");
  if (!bar || bar.__mcMenubar) {
    return;
  }
  bar.__mcMenubar = true;
  // Mail → Rules… (auch im App-Menü) zeigt die Regeln in den Einstellungen wie
  // Apple Mail statt Thunderbirds Fenster; „Regel aus E-Mail erstellen …“
  // ruft Thunderbird weiter selbst auf (Editor vorbelegt)
  const onRulesCmd = e => {
    if (e.target?.id == "filtersCmd" || e.target?.id == "appmenu_filtersCmd") {
      e.stopImmediatePropagation();
      e.preventDefault();
      openRulesSettings(win);
    }
  };
  win.addEventListener("command", onRulesCmd, true);
  restorers.push(() => win.removeEventListener("command", onRulesCmd, true));
  const $ = id => doc.getElementById(id);
  const S = "-";
  const created = [];
  const moved = [];
  const relabeled = [];
  const make = (tag, id, label) => {
    const e = doc.createXULElement(tag);
    if (id) {
      e.id = id;
    }
    if (label) {
      e.setAttribute("label", tr(label));
    }
    created.push(e);
    return e;
  };
  const relabel = (el, label) => {
    if (!el || !label) {
      return;
    }
    relabeled.push([el, el.getAttribute("label"), el.getAttribute("data-l10n-id"), el.getAttribute("accesskey")]);
    el.removeAttribute("data-l10n-id");
    el.removeAttribute("accesskey");
    el.setAttribute("label", tr(label));
  };
  const own = (id, label, run) => {
    const item = make("menuitem", id, label);
    item.addEventListener("command", event => {
      event.stopPropagation();
      run();
    });
    return item;
  };
  const tab = () => doc.getElementById("tabmail")?.currentTabInfo;
  const a3 = () => doc.getElementById("tabmail")?.currentAbout3Pane;
  const inMail = () => ["mail3PaneTab", "mailMessageTab"].includes(tab()?.mode?.name);
  const inCalendar = () => tab()?.mode?.name == "calendar";
  const selected = () => {
    try {
      const view = tab()?.mode?.name == "mailMessageTab" ? tab().chromeBrowser?.contentWindow?.gDBView : a3()?.gDBView;
      return [...(view?.getSelectedMsgHdrs() || [])];
    } catch {
      return [];
    }
  };

  // eigene Untermenüs
  const msgMenu = make("menu", "mcViewMessageMenu", "Message");
  const msgPopup = make("menupopup", "mcViewMessagePopup");
  msgMenu.append(msgPopup);
  const trouble = make("menu", "mcHelpTroubleMenu", "Troubleshooting");
  const troublePopup = make("menupopup", "mcHelpTroublePopup");
  trouble.append(troublePopup);
  const remind = make("menu", "mcMailRemindMenu", "Remind Me");
  const remindPopup = make("menupopup", "mcMailRemindPopup");
  remind.append(remindPopup);
  const fmt = new Intl.DateTimeFormat(regionLocale(), { weekday: "short", hour: "2-digit", minute: "2-digit" });
  remindPopup.addEventListener("popupshowing", event => {
    if (event.target != remindPopup) {
      return;
    }
    remindPopup.replaceChildren(...Remind.choices().map(([label, when]) => {
      const it = doc.createXULElement("menuitem");
      it.setAttribute("label", `${tr(label)} (${fmt.format(when)})`);
      it.addEventListener("command", () => Remind.remind(selected(), when).catch(e => log("remind error", e)));
      return it;
    }));
  });
  const getMail = own("mcMailGetNew", "Get New Mail", () => win.goDoCommand("cmd_getMsgsForAuthAccounts"));
  // wie Apple Erinnerungen: File → New List… (wechselt in den Bereich Aufgaben)
  const newList = own("mcFileNewList", "New List…", () => {
    if (win.document.getElementById("tabmail")?.currentTabInfo?.mode?.name != "tasks") {
      win.document.getElementById("tabmail")?.openTab("tasks", {});
    }
    win.setTimeout(() => win.__mcStartNewList?.(), 300);
  });
  const importPst = own("mcFileImportPst", "Open Outlook Data File (PST)…", () => PstImport.open(win).catch(e => log("pst error", e)));
  // für den automatischen Test
  win.__mcPstRead = path => PstImport.read(path);
  win.__mcPstIsPst = path => PstImport.isPst(path);
  // Import mit erfundenen Daten (CI hat keine PST) bzw. aus einer echten Datei
  win.__mcPstImport = (source, parts) => PstImport.run(source, win, undefined, undefined, parts);
  win.__mcPstWizard = source => PstImport.openWizard(win, source);
  win.__mcPstSource = path => {
    const file = PstImport.openFile(path);
    return { source: PstImport.source(file.pst, PathUtils.filename(path).replace(/\.(pst|ost)$/i, "")), close: () => file.close() };
  };
  // Link auf die Mail (mid:) – wie im Kontextmenü von Thunderbird, das ihn nicht mehr anbietet
  const copyLink = own("mcEditCopyMessageLink", "Copy Message Link", () => {
    const hdr = selected()[0];
    if (hdr?.messageId) {
      Cc["@mozilla.org/widget/clipboardhelper;1"].getService(Ci.nsIClipboardHelper).copyString(`mid:${hdr.messageId}`);
    }
  });
  const space = (id, label, button) => {
    const item = own(id, label, () => $(button)?.click());
    item.dataset.space = button;
    // Häkchen setzt onShowing nach dem aktiven Bereich (ein Klick schaltet es nicht selbst um)
    item.setAttribute("type", "checkbox");
    item.setAttribute("autocheck", "false");
    return item;
  };
  const spaces = [
    space("mcWinMail", "Mail", "mailButton"),
    space("mcWinAddressBook", "Address Book", "addressBookButton"),
    space("mcWinCalendar", "Calendar", "calendarButton"),
    space("mcWinTasks", "Tasks", "tasksButton"),
    space("mcWinChat", "Chat", "chatButton"),
  ];

  // [Menü, Einträge] – Zeichenkette = Thunderbirds Eintrag (optional mit
  // eigenem Text), S = Trennlinie
  const L = (id, label) => [$(id), label];
  const layout = [
    ["menu_FilePopup", [
      L("menu_newNewMsgCmd", "New Message"), L("calendar-new-event-menuitem", "New Event…"), L("calendar-new-task-menuitem", "New Task…"), [newList],
      L("menu_newCard", "New Contact…"), S, L("menu_close"), S, L("menu_saveAsFile", "Save As…"),
      L("menu_saveAsTemplate", "Save as Template"), S, L("menu_import"), [importPst], L("menu_export"), S,
      L("printMenuItem"), ...(MENUBAR_MAC ? [] : [S]), L("menu_FileQuitItem"),
    ]],
    ["menu_EditPopup", [
      L("menu_undo"), L("menu_redo"), S, L("menu_cut"), L("menu_copy"), [copyLink], L("menu_paste"), L("menu_delete"),
      L("menu_SelectAll", "Select All"), L("menu_selectThread", "Select Thread"), S, L("glodaSearchCmd", "Search…"),
      L("menu_findCmd", "Find…"), L("menu_findAgainCmd"),
      ...(MENUBAR_MAC ? [] : [S, L("menu_preferences")]),
    ]],
    ["menu_View_Popup", [
      L("menu_showFolderPane", "Show Folder List"), L("calShowTodayPane-2"), L("menu_showTaskbar", "Show Status Bar"), S,
      L("viewSortMenu"), L("viewMessageViewMenu", "Filter"), L("viewMessagesMenu"), L("menu_FolderViews", "Folder List"), [msgMenu], S,
      L("calChangeViewDay"), L("calChangeViewWeek"), L("calChangeViewMonth"), L("calendar-go-to-today-menuitem", "Go to Today"), S,
      L("menu_fullZoomEnlarge"), L("menu_fullZoomReduce"), L("menu_fullZoomReset", "Actual Size"),
      ...(MENUBAR_MAC ? [] : [S, ...spaces.map(x => [x])]),
    ]],
    ["mcViewMessagePopup", [
      L("bodyAllowHTML"), L("bodySanitized"), L("bodyAsPlaintext"), S,
      L("viewallheaders", "All Headers"), L("viewnormalheaders", "Normal Headers"), S, L("pageSourceMenuItem"),
    ]],
    ["messageMenuPopup", [
      [getMail], L("goOfflineMenuItem"), S,
      L("replyMainMenu"), L("replySenderMainMenu"), L("menu_replyToAll", "Reply All"), L("menu_replyToList"),
      L("replyNewsgroupMainMenu"), L("menu_forwardMsg"), S,
      L("markReadMenuItem", "Mark as Read"), L("markUnreadMenuItem", "Mark as Unread"), L("markFlaggedMenuItem", "Star"),
      L("menu_markAsJunk", "Mark as Spam"), L("menu_markAsNotJunk", "Mark as Not Spam"), L("tagMenu"), [remind], S,
      L("archiveMainMenu"), L("moveMenu"), S, L("menu_markAllRead", "Mark Folder as Read"), S, L("filtersCmd", "Rules…"),
    ]],
    ["mcHelpTroublePopup", [
      L("aboutsupport_open"), L("helpTroubleshootMode"), S,
      L("activityManager"), L("javascriptConsole"), L("devtoolsToolbox"), L("addonDebugging"),
    ]],
    ["menu_HelpPopup", [
      L("menu_openHelp"), L("menu_keyboardShortcuts"), S, [trouble], S, L("mcHaloSpaces"), S,
      L("feedbackPage"), L("donationsPage"), S, L("aboutName"),
      // macOS holt diese ins Programm-Menü (aus jedem Menü der Leiste)
      ...(MENUBAR_MAC ? ["menu_preferences", "menu_mac_services", "menu_mac_hide_app", "menu_mac_hide_others", "menu_mac_show_all"].map(id => L(id)) : []),
    ]],
  ];
  const keep = new Set();
  for (const [popupId, entries] of layout) {
    const popup = popupId.startsWith("mc") ? created.find(e => e.id == popupId) : $(popupId);
    if (!popup) {
      continue;
    }
    const items = [];
    for (const entry of entries) {
      if (entry == S) {
        const sep = make("menuseparator");
        sep.classList.add("mc-menu-sep");
        items.push(sep);
        continue;
      }
      const [el, label] = entry;
      if (!el) {
        continue;
      }
      if (!created.includes(el)) {
        moved.push([el, el.parentNode, el.nextSibling]);
        relabel(el, label);
      }
      keep.add(el);
      items.push(el);
    }
    // vorn einreihen; Thunderbirds übrige Einträge bleiben dahinter ausgeblendet
    popup.prepend(...items);
  }
  // Fenster (nur macOS): Bereiche nach Minimieren/Zoomen – „zoomWindow“ gibt
  // es zweimal (Befehl im commandset und Eintrag im Menü); getElementById
  // liefert den Befehl, dort wären die Einträge unsichtbar (auch für die
  // Hilfe-Suche von macOS)
  const zoom = $("windowPopup")?.querySelector(":scope > menuitem#zoomWindow");
  if (MENUBAR_MAC && zoom) {
    const sepA = make("menuseparator");
    sepA.classList.add("mc-menu-sep");
    zoom.after(sepA, ...spaces);
    spaces.forEach(x => keep.add(x));
  }
  const menuLabel = $("messageMenu");
  relabel(menuLabel, "Mail");
  // ganze Menüs ohne Aufgabe
  const offMenus = ["menu_Go", "menu_Event_Task", "tasksMenu"].map($).filter(Boolean);
  const managed = ["menu_FilePopup", "menu_EditPopup", "menu_View_Popup", "messageMenuPopup", "menu_HelpPopup"].map($).filter(Boolean);
  const offState = new Map();
  const hide = (el, on) => {
    if (!offState.has(el)) {
      offState.set(el, el.hidden);
    }
    el.hidden = on;
  };
  const sweep = () => {
    for (const m of offMenus) {
      hide(m, true);
    }
    for (const popup of managed) {
      for (const el of popup.children) {
        if (!keep.has(el) && !el.classList.contains("mc-menu-sep")) {
          hide(el, true);
        }
      }
    }
  };
  // Trennlinien: keine doppelten, keine am Anfang oder Ende
  const tidy = popup => {
    let last = null;
    for (const el of popup.children) {
      if (el.classList.contains("mc-menu-sep")) {
        el.hidden = !last || last.localName == "menuseparator";
        if (!el.hidden) {
          last = el;
        }
      } else if (!el.hidden && el.localName != "menuseparator") {
        last = el;
      }
    }
    if (last?.classList?.contains("mc-menu-sep")) {
      last.hidden = true;
    }
  };
  const onShowing = event => {
    const popup = event.target;
    if (!bar.contains(popup) && popup != msgPopup && popup != troublePopup) {
      return;
    }
    sweep();
    const mail = inMail(), calendar = inCalendar();
    if (popup.id == "menu_View_Popup") {
      for (const id of ["viewSortMenu", "viewMessageViewMenu", "viewMessagesMenu", "menu_FolderViews"]) {
        const el = $(id);
        if (el) {
          el.hidden = false; // Thunderbird blendet „Messages“ als alte Ansicht aus
          el.setAttribute("disabled", String(!mail));
        }
      }
      msgMenu.setAttribute("disabled", String(!mail));
      for (const id of ["calChangeViewDay", "calChangeViewWeek", "calChangeViewMonth", "calendar-go-to-today-menuitem"]) {
        $(id)?.setAttribute("disabled", String(!calendar));
      }
      // Häkchen der Today-Pane nach dem echten Zustand: Thunderbird setzt es am
      // Befehl, unsere Animation blendet sie aber selbst ein/aus – und
      // „checked = false“ entfernt das Attribut bei <command> nicht
      // Häkchen der Statusleiste nach dem echten Zustand (Thunderbird setzt es
      // sonst erst beim Öffnen seines Untermenüs „Symbolleisten“, das hier fehlt)
      const sb = $("menu_showTaskbar");
      if (sb) {
        sb.setAttribute("checked", String(!$("status-bar")?.hidden));
      }
      const tp = $("calShowTodayPane-2");
      if (tp) {
        const shown = !!win.TodayPane?.isVisible;
        for (const el of [tp, tp.getAttribute("command") && $(tp.getAttribute("command"))].filter(Boolean)) {
          if (shown) {
            el.setAttribute("checked", "true");
          } else {
            el.removeAttribute("checked");
          }
        }
      }
    }
    if (popup.id == "menu_EditPopup") {
      copyLink.disabled = !selected()[0]?.messageId;
    }
    if (popup.id == "messageMenuPopup") {
      const hdrs = selected();
      const unread = hdrs.some(h => !h.isRead);
      const junk = hdrs.length == 1 && hdrs[0].getStringProperty("junkscore") == Ci.nsIJunkMailPlugin.IS_SPAM_SCORE;
      const set = (id, on) => {
        const el = $(id);
        if (el) {
          el.hidden = !on;
        }
      };
      set("markReadMenuItem", unread);
      set("markUnreadMenuItem", !unread);
      set("menu_markAsJunk", !junk);
      set("menu_markAsNotJunk", junk);
      // „Reply“ für Mails, „Reply to Sender“ zeigt Thunderbird nur bei Newsgroups
      if (!$("replySenderMainMenu")?.hidden && !$("replyMainMenu")?.hidden) {
        $("replySenderMainMenu").hidden = true;
      }
      const star = $("markFlaggedMenuItem");
      if (star) {
        star.removeAttribute("type");
        star.setAttribute("label", tr(hdrs[0]?.isFlagged ? "Remove Star" : "Star"));
      }
      remind.disabled = !Remind.canRemind(hdrs);
      getMail.disabled = false;
    }
    // aktiver Bereich mit Häkchen (wie das aktive Fenster im Fenster-Menü)
    for (const x of spaces) {
      const button = $(x.dataset.space);
      x.hidden = !button || button.hidden;
      if (button?.classList.contains("current")) {
        x.setAttribute("checked", "true");
      } else {
        x.removeAttribute("checked");
      }
    }
    tidy(popup);
  };
  doc.addEventListener("popupshowing", onShowing);
  sweep();
  for (const popup of [...managed, msgPopup, troublePopup]) {
    tidy(popup);
  }
  restorers.push(() => {
    doc.removeEventListener("popupshowing", onShowing);
    for (const [el, hidden] of offState) {
      el.hidden = hidden;
    }
    for (const [el, label, l10n, key] of relabeled) {
      if (label != null) {
        el.setAttribute("label", label);
      }
      if (l10n) {
        el.setAttribute("data-l10n-id", l10n);
      }
      if (key) {
        el.setAttribute("accesskey", key);
      }
    }
    for (const [el, parent, next] of moved.reverse()) {
      parent?.insertBefore(el, next?.parentNode == parent ? next : null);
    }
    created.forEach(e => e.remove());
    delete bar.__mcMenubar;
  });
}

function hookTaskView(win, restorers) {
  const doc = win.document;
  const details = doc.getElementById("calendar-task-details-container");
  const splitter = doc.getElementById("calendar-task-view-splitter");
  if (!details || !splitter || splitter.__mcTaskView) {
    return;
  }
  splitter.__mcTaskView = true;
  const apply = () => {
    try {
      applyTaskView(win);
    } catch (e) {
      log("task view error", e);
    }
  };
  // Kartenansicht (Details rechts): Ziehen am Teiler selbst – Thunderbirds
  // Teiler rechnet weiter mit Liste und Details untereinander und zog
  // verkehrt herum. Die Liste bleibt wie die Mailliste zwischen Mindest- und
  // Höchstbreite, Doppelklick stellt die Standardbreite her
  const listOf = () => doc.getElementById(doc.documentElement.hasAttribute("mc-task-list") ? "mcTaskCards" : "calendar-task-tree");
  const setListWidth = want => {
    const list = listOf()?.getBoundingClientRect();
    const box = details.parentElement.getBoundingClientRect();
    if (!list?.width || !box.width) {
      return;
    }
    const lw = Math.max(TASK_LIST_MIN, Math.min(TASK_LIST_MAX, want));
    // Details nehmen den Rest (Teiler 1 px), aber nie unter 300 px
    const dw = Math.max(300, Math.round(box.right - list.left - lw - 1));
    details.style.width = `${dw}px`;
    return dw;
  };
  const onSideDown = event => {
    if (event.button != 0 || !doc.documentElement.hasAttribute("mc-task-side")) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    const list = listOf()?.getBoundingClientRect();
    if (!list?.width) {
      return;
    }
    const rtl = win.getComputedStyle(details).direction == "rtl" ? -1 : 1;
    const x0 = event.screenX, w0 = list.width;
    details.__mcDragging = true;
    // „+“ und die Aktionsknöpfe rechts davon stehen über den Details – sie
    // folgen dem Teiler (die Ausrichtung beobachtet die Liste nicht)
    const move = e => {
      setListWidth(w0 + (e.screenX - x0) * rtl);
      enhancer?.sideEdgeUpdaters?.forEach(fn => fn());
    };
    const up = () => {
      win.removeEventListener("mousemove", move, true);
      win.removeEventListener("mouseup", up, true);
    };
    win.addEventListener("mousemove", move, true);
    win.addEventListener("mouseup", up, true);
  };
  const onSideDbl = event => {
    if (!doc.documentElement.hasAttribute("mc-task-side")) {
      return;
    }
    event.preventDefault();
    const wd = setListWidth(Services.prefs.getIntPref(LIST_WIDTH_PREF, LIST_WIDTH_DEFAULT));
    if (wd) {
      Services.prefs.setIntPref(TASK_DETAILS_WIDTH_PREF, wd);
      details.__mcDragged = true;
      enhancer?.offsetUpdaters?.forEach(fn => fn());
    }
  };
  splitter.addEventListener("mousedown", onSideDown, true);
  splitter.addEventListener("dblclick", onSideDbl, true);
  // Breite der Details merken, wenn der Teiler in der Kartenansicht gezogen
  // wurde; die neue Listenbreite gilt dann wie im Adressbuch auch für die Mail
  // (__mcDragged liest die Ausrichtung der Toolbar)
  const onDown = () => (details.__mcDragging = true);
  const onUp = () => win.setTimeout(() => {
    if (!details.__mcDragging) {
      return;
    }
    delete details.__mcDragging;
    if (doc.documentElement.hasAttribute("mc-task-side")) {
      const wd = Math.round(details.getBoundingClientRect().width);
      if (wd >= 300) {
        Services.prefs.setIntPref(TASK_DETAILS_WIDTH_PREF, wd);
        details.__mcDragged = true;
      }
    }
  }, 0);
  splitter.addEventListener("mousedown", onDown);
  splitter.addEventListener("mouseup", onUp);
  win.addEventListener("mouseup", onUp, true);
  const ro = new win.ResizeObserver(() => apply());
  ro.observe(details.parentElement);
  const prefObs = () => {
    apply();
    syncTaskListFilter(win);
  };
  Services.prefs.addObserver(TASK_VIEW_PREF, prefObs);
  apply();
  restorers?.push(() => {
    ro.disconnect();
    splitter.removeEventListener("mousedown", onSideDown, true);
    splitter.removeEventListener("dblclick", onSideDbl, true);
    splitter.removeEventListener("mousedown", onDown);
    splitter.removeEventListener("mouseup", onUp);
    win.removeEventListener("mouseup", onUp, true);
    Services.prefs.removeObserver(TASK_VIEW_PREF, prefObs);
    delete splitter.__mcTaskView;
    // Tabelle wiederherstellen (Spalten, Details unten), die Wahl bleibt gemerkt
    applyTaskView(win, "table");
  });
}

// Fenstertitel einer Rückfrage leeren, wenn er die sichtbare Überschrift
// (#infoTitle) wiederholt; gibt true zurück, wenn er geleert wurde
function dropRepeatedTitle(w) {
  const doc = w.document;
  const head = doc.getElementById("infoTitle");
  const same = (a, b) => a.replace(/\s+/g, " ").trim() == b.replace(/\s+/g, " ").trim();
  if (!head || head.hidden || !doc.title || !same(head.textContent, doc.title)) {
    return false;
  }
  doc.title = "";
  return true;
}

// Erledigte Aufgaben wieder öffnen: erst kurz nachfragen (Karte wie die
// übrigen Rückfragen), dann wie neu – nicht erledigt, 0 %, ohne Erledigt-Datum.
// Über Thunderbirds Transaktion, damit Rückgängig geht
// (eigene Funktion: der Test ersetzt sie, Marionette schlösse den Dialog selbst)
var confirmReopen = async (win, n) => {
  const flags = Services.prompt.BUTTON_POS_0 * Services.prompt.BUTTON_TITLE_IS_STRING +
    Services.prompt.BUTTON_POS_1 * Services.prompt.BUTTON_TITLE_CANCEL;
  const result = await Services.prompt.asyncConfirmEx(win.browsingContext.top, Services.prompt.MODAL_TYPE_WINDOW,
    n == 1 ? tr("Reopen task?") : tr("Reopen {n} tasks?", { n }),
    tr("The task will be open again, as if it were new."), flags, tr("Reopen"), null, null, null, false);
  return result.getProperty("buttonNumClicked") == 0;
};
// Rückfrage „Delete“ einer Liste (Karte wie die übrigen Rückfragen); Ergebnis
// wie Thunderbirds confirmEx: 0 = erster Knopf, 1 = Abbrechen, 2 = „Delete“
// bei „both“ (eigene Funktion: der Test ersetzt sie, Marionette schlösse den
// Dialog selbst)
var confirmDeleteList = async (win, kind, text) => {
  const P = Services.prompt;
  let flags = P.BUTTON_POS_0 * P.BUTTON_TITLE_IS_STRING + P.BUTTON_POS_1 * P.BUTTON_TITLE_CANCEL;
  if (kind == "delete") {
    flags += P.BUTTON_DELAY_ENABLE;
  } else if (kind == "both") {
    flags += P.BUTTON_POS_2 * P.BUTTON_TITLE_IS_STRING;
  }
  const result = await P.asyncConfirmEx(win.browsingContext.top, P.MODAL_TYPE_WINDOW, tr("Delete List"), text, flags,
    tr(kind == "delete" ? "Delete" : "Unsubscribe"), null, kind == "both" ? tr("Delete") : null, null, false);
  return result.getProperty("buttonNumClicked");
};
async function reopenTasks(win, tasks) {
  const done = tasks.filter(t => t?.isCompleted);
  if (!done.length) {
    return false;
  }
  if (!await confirmReopen(win, done.length)) {
    return true;
  }
  for (const task of done) {
    try {
      const copy = task.clone();
      copy.isCompleted = false;
      copy.percentComplete = 0;
      copy.completedDate = null;
      if (typeof win.doTransaction == "function") {
        win.doTransaction("modify", copy, copy.calendar, task, null);
      } else {
        await task.calendar.modifyItem(copy, task);
      }
    } catch (e) {
      log("reopen task error", e);
    }
  }
  return true;
}

// Aufgaben archivieren bzw. zurückholen (on = true/false): Merkmal setzen oder
// entfernen, als eine rückgängig machbare Änderung; bei Serien die ganze Serie.
// Schreibgeschützte Listen bleiben unverändert. Ergebnis: Anzahl geänderter Aufgaben
async function archiveTasks(win, tasks, on) {
  const seen = new Set();
  let n = 0;
  win.startBatchTransaction?.();
  try {
    for (const task of tasks || []) {
      const item = task?.parentItem || task;
      if (!item?.isTodo?.() || seen.has(item.hashId) || isTaskArchived(item) == on || item.calendar?.readOnly) {
        continue;
      }
      seen.add(item.hashId);
      try {
        const copy = item.clone();
        if (on) {
          copy.setProperty(TASK_ARCHIVED_PROP, "1");
        } else {
          copy.deleteProperty(TASK_ARCHIVED_PROP);
        }
        if (typeof win.doTransaction == "function") {
          win.doTransaction("modify", copy, copy.calendar, item, null);
        } else {
          await item.calendar.modifyItem(copy, item);
        }
        n++;
      } catch (e) {
        log("archive task error", e);
      }
    }
  } finally {
    win.endBatchTransaction?.();
  }
  return n;
}

// Archivieren im Bereich Aufgaben wie im Mail-Bereich: Eintrag „Archive“ im
// Kontextmenü der Aufgaben (bei lauter archivierten „Unarchive“), Taste A in
// der Liste. Archivierte Aufgaben zeigt nur die Ansicht „Archived“ – auch die
// Today-Pane und alle übrigen Aufgabenlisten (Thunderbirds calFilter) lassen
// sie weg, so stehen sie auch im Kanban-Board nicht mehr unter „Completed“
function hookTaskArchive(win, restorers) {
  const doc = win.document;
  const proto = win.calFilter?.prototype;
  const menu = doc.getElementById("taskitem-context-menu");
  if (!proto?.propertyFilter || proto.__mcArchive || !menu) {
    return;
  }
  const origFilter = proto.propertyFilter;
  proto.propertyFilter = function (item) {
    const result = origFilter.call(this, item);
    return result && (!isTaskArchived(item) || !!this.mFilterProperties?.onfilter?.mcArchived);
  };
  proto.__mcArchive = true;
  const selected = () => {
    try {
      return win.getSelectedTasks?.() || [];
    } catch {
      return [];
    }
  };
  const run = tasks => {
    const action = archiveAction(tasks.map(t => isTaskArchived(t?.parentItem || t)));
    if (action) {
      archiveTasks(win, tasks, action == "archive").catch(e => log("archive tasks", e));
    }
  };
  const item = doc.createXULElement("menuitem");
  item.id = "mcTaskContextArchive";
  item.addEventListener("command", () => run(selected()));
  const anchor = doc.getElementById("calendar-context-markcompleted");
  if (anchor?.parentNode == menu) {
    anchor.after(item);
  } else {
    menu.append(item);
  }
  const onShowing = event => {
    if (event.target != menu) {
      return;
    }
    const tasks = selected();
    const action = archiveAction(tasks.map(t => isTaskArchived(t?.parentItem || t)));
    item.hidden = !action;
    item.setAttribute("label", tr(action == "unarchive" ? "Unarchive" : "Archive"));
    item.disabled = tasks.every(t => (t?.parentItem || t)?.calendar?.readOnly);
  };
  menu.addEventListener("popupshowing", onShowing);
  // Taste A wie im Mail-Bereich (ohne Umschalt- und Befehlstasten)
  const tree = doc.getElementById("calendar-task-tree");
  const onKey = event => {
    if (event.key != "a" || event.metaKey || event.ctrlKey || event.altKey || event.shiftKey || event.repeat) {
      return;
    }
    const tasks = tree.selectedTasks || [];
    if (tasks.length) {
      event.preventDefault();
      event.stopPropagation();
      run(tasks);
    }
  };
  tree?.addEventListener("keydown", onKey);
  // für den automatischen Test
  win.__mcArchiveTasks = (tasks, on) => archiveTasks(win, tasks, on);
  restorers?.push(() => {
    proto.propertyFilter = origFilter;
    delete proto.__mcArchive;
    menu.removeEventListener("popupshowing", onShowing);
    tree?.removeEventListener("keydown", onKey);
    item.remove();
    delete win.__mcArchiveTasks;
  });
}

// Kartenansicht der Aufgaben wie die Mail-Karten: Thunderbirds Liste (XUL-Baum)
// kann keine zweizeiligen, runden Zeilen – darüber liegt deshalb eine eigene
// Liste aus Karten (Kreis + Titel, darunter Fälligkeit, Kalender, Kategorien).
// Auswahl, Tastatur, Kontextmenü und Befehle bleiben bei Thunderbirds Liste
// (sie behält den Fokus und liegt unsichtbar darunter); die Karten zeigen nur
// deren Inhalt und Auswahl und geben Klicks an sie weiter.
// Aufgaben: Detailspalte wie das Info-Fenster von Apple Erinnerungen – Titel
// und Notiz (Thunderbirds Elemente) als hellgraue Kopfkarte, darunter
// Abschnitte „Date & Time“, „Organisation“, Priorität/Fortschritt und „Place“
// als graue Gruppen: feines Symbol, Bezeichnung links, Wert rechts, leer grau
// „None“. Nur Anzeige (Bearbeiten weiter per Doppelklick bzw. Menüs);
// Thunderbirds Zeilen bleiben im Dokument, das CSS blendet sie aus
// Die Ansicht einer Aufgabe (Kopfkarte, Abschnitte, Bearbeiten in Ort und Stelle)
// läuft in der Detailspalte des Hauptfensters und – mit `solo` (tree: Objekt mit
// currentTask, close: schließt das Fenster) – im eigenen Aufgabenfenster
// (openTaskWindow), das dieselben Elemente nachbaut. Rückgabe bei solo: refresh()
// Antwort der Rückfrage bei Vorkommen (Thunderbirds calendar-occurrence-prompt):
// 1 nur dieses Vorkommen, 3 alle (die Serie), 0 Abbrechen; 2 („dieses und alle
// folgenden“) blendet Thunderbird aus und führt es nicht aus – gilt als Abbrechen
function occurrenceScope(answer) {
  return answer == 1 ? "occurrence" : answer == 3 ? "series" : null;
}

// Datum der Serie, wenn bei „Alle Vorkommen“ das Datum eines Vorkommens geändert
// wurde (Wanduhrzeiten in ms): wie Apple um dieselbe Spanne verschoben statt auf
// den Tag des Vorkommens gesetzt; entfernt bleibt entfernt, fehlte es (bei der
// Serie oder dem Vorkommen), gilt der neue Wert
function shiftSeriesTime(series, occOld, occNew) {
  if (occNew == null) {
    return null;
  }
  if (series == null || occOld == null) {
    return occNew;
  }
  return series + (occNew - occOld);
}

function hookTaskInfo(win, restorers, solo = null) {
  const doc = win.document;
  const tree = solo ? solo.tree : doc.getElementById("calendar-task-tree");
  const wrapper = doc.getElementById("calendar-task-details-description-wrapper");
  const frame = doc.getElementById("calendar-task-details-description");
  const view = solo ? {} : win.taskDetailsView;
  if (!tree || !wrapper || !frame || (!solo && typeof view?.onSelect != "function") || doc.getElementById("mcTaskInfo")) {
    return;
  }
  const { cal } = ChromeUtils.importESModule("resource:///modules/calendar/calUtils.sys.mjs");
  const X = "http://www.w3.org/1999/xhtml";
  const el = (tag, cls, text) => {
    const e = doc.createElementNS(X, tag);
    if (cls) {
      e.className = cls;
    }
    if (text != null) {
      e.textContent = text;
    }
    return e;
  };
  const box = el("div");
  box.id = "mcTaskInfo";
  wrapper.after(box);
  doc.documentElement.setAttribute("mc-task-info", "");
  // Notiz nicht mehr über den ganzen Rest (flex="1" lässt sich per CSS nicht überstimmen)
  const wrapperFlex = wrapper.getAttribute("flex");
  wrapper.removeAttribute("flex");
  const locale = regionLocale();
  const fmtDay = new Intl.DateTimeFormat(locale, { day: "numeric", month: "short" });
  const fmtDayYear = new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", year: "numeric" });
  const fmtTime = new Intl.DateTimeFormat(locale, { hour: "2-digit", minute: "2-digit" });
  const rel = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
  const dayStart = d => new Date(d.getFullYear(), d.getMonth(), d.getDate());
  // „Today, 16:00“, „Tomorrow“, „3 Nov“ – wie die Karten der Liste
  const when = dt => {
    if (!dt?.isValid) {
      return null;
    }
    const js = cal.dtz.dateTimeToJsDate(dt.isDate ? dt : dt.getInTimezone(cal.dtz.defaultTimezone));
    const now = new Date();
    const days = Math.round((dayStart(js) - dayStart(now)) / 86400000);
    let text = Math.abs(days) <= 1 ? rel.format(days, "day") : (js.getFullYear() == now.getFullYear() ? fmtDay : fmtDayYear).format(js);
    text = text.charAt(0).toLocaleUpperCase(locale) + text.slice(1);
    if (!dt.isDate) {
      text += ", " + fmtTime.format(js);
    }
    return { text, past: dt.isDate ? days < 0 : js < now };
  };
  // Wiederholung kurz wie Apple („Every week“) statt Thunderbirds ganzem Satz
  const repeatText = item => {
    const info = (item.parentItem || item).recurrenceInfo;
    if (!info) {
      return null;
    }
    const rules = info.getRecurrenceItems().filter(r => !r.isNegative);
    const rule = rules.length == 1 && rules[0] instanceof Ci.calIRecurrenceRule ? rules[0] : null;
    const unit = { DAILY: "day", WEEKLY: "week", MONTHLY: "month", YEARLY: "year" }[rule?.type];
    if (!unit) {
      return tr("Custom");
    }
    return rule.interval > 1 ? tr(`Every {n} ${unit}s`, { n: rule.interval }) : tr(`Every ${unit}`);
  };
  // erste Erinnerung als „1 hour before“, „At time“
  const reminderText = item => {
    const alarm = item.getAlarms()[0];
    if (!alarm) {
      return null;
    }
    const offset = alarm.offset;
    if (!offset) {
      const date = when(alarm.alarmDate);
      return date ? date.text : tr("Custom");
    }
    const mins = Math.round(Math.abs(offset.inSeconds) / 60);
    if (mins == 0) {
      return tr("At time");
    }
    const [n, unit] = mins % 1440 == 0 ? [mins / 1440, "day"] : mins % 60 == 0 ? [mins / 60, "hour"] : [mins, "minute"];
    return n == 1 ? tr(`1 ${unit} before`) : tr(`{n} ${unit}s before`, { n });
  };
  const group = (title, rows) => {
    const shown = rows.filter(Boolean);
    if (!shown.length) {
      return [];
    }
    const g = el("div", "mc-ti-group");
    g.append(...shown);
    return title ? [el("div", "mc-ti-head", tr(title)), g] : [g];
  };
  // Zeile: Symbol, Bezeichnung, Wert (leer: graues „None“)
  const row = (icon, label, value, extra = null) => {
    const r = el("div", "mc-ti-row");
    r.dataset.icon = icon;
    const v = el("span", "mc-ti-value");
    if (value == null || value === "") {
      v.textContent = tr("None");
      v.setAttribute("data-none", "");
    } else {
      v.append(...(Array.isArray(value) ? value : [value]));
    }
    extra?.(r, v);
    r.append(el("span", "mc-ti-icon"), el("span", "mc-ti-label", tr(label)), v);
    return r;
  };
  // Zeile nur mit Symbol und Text (Anhänge, „Add Link…“), Text unübersetzt
  const plainRow = (icon, text, extra = null) => {
    const r = el("div", "mc-ti-row");
    r.dataset.icon = icon;
    r.append(el("span", "mc-ti-icon"), el("span", "mc-ti-label", text), el("span", "mc-ti-value"));
    extra?.(r);
    return r;
  };
  // Anhang kurz: Dateiname bzw. Rechner und Pfad einer Webseite
  const attachName = spec => {
    try {
      const uri = Services.io.newURI(spec);
      if (uri.schemeIs("file")) {
        return decodeURIComponent(uri.spec.split("/").pop() || spec);
      }
      return decodeURIComponent((uri.host || "") + (uri.filePath && uri.filePath != "/" ? uri.filePath : "")) || spec;
    } catch {
      return spec;
    }
  };
  const isAllDay = item => !!(item.entryDate?.isValid && item.entryDate.isDate) || !!(item.dueDate?.isValid && item.dueDate.isDate);
  const STATUS = { NONE: "Not Started", "IN-PROCESS": "In Progress", COMPLETED: "Completed", CANCELLED: "Cancelled" };
  const statusOf = item => (item.isCompleted ? "COMPLETED" : item.status == "CANCELLED" ? "CANCELLED" :
    item.status == "IN-PROCESS" || (item.percentComplete > 0 && item.percentComplete < 100) ? "IN-PROCESS" : "NONE");
  // Kopfkarte wie eine vergrößerte Karte (K2, Entscheidung des Maintainers
  // vom 6.11.2026): links der Streifen in Listenfarbe, rechts der
  // Fortschrittsstrich (farbig von unten, offener Teil fein rot gestrichelt)
  // mit der Zahl unten links daneben. Der Fortschritt steht nur hier und ist
  // direkt bedienbar: Strich ziehen bzw. anklicken (5-%-Schritte), Zahl
  // anklicken zum Eintippen, Pfeiltasten; Rechtsklick auf den Strich: Stufen
  // und „Cancelled“. Titel und Notiz bleiben Thunderbirds Elemente – Streifen
  // und Strich liegen darüber und folgen der Höhe der Karte (place)
  const detailsEl = doc.getElementById("calendar-task-details");
  const cardBox = doc.getElementById("calendar-task-details-box");
  const stripe = el("div");
  stripe.id = "mcTaskStripe";
  const bar = el("div");
  bar.id = "mcTaskProg";
  bar.tabIndex = 0;
  bar.setAttribute("role", "slider");
  bar.setAttribute("aria-label", tr("Progress"));
  bar.setAttribute("aria-valuemin", "0");
  bar.setAttribute("aria-valuemax", "100");
  const fill = el("i");
  bar.append(fill);
  const num = el("div");
  num.id = "mcTaskProgNum";
  detailsEl?.append(stripe, bar, num);
  const stepOf = p => (p >= 100 ? "100" : String(Math.min(75, Math.round(p / 25) * 25)));
  const showPct = p => {
    fill.style.height = `${p}%`;
    bar.dataset.step = stepOf(p);
    bar.setAttribute("aria-valuenow", String(p));
    num.replaceChildren(String(p), el("small", null, "\u2009%"));
  };
  const curPct = item => (item.isCompleted ? 100 : item.percentComplete || 0);
  const setPct = v => {
    const p = Math.max(0, Math.min(100, Math.round(v)));
    const item = tree.currentTask;
    if (!item || p == curPct(item)) {
      if (item) {
        showPct(curPct(item));
      }
      return;
    }
    showPct(p);
    save(it => {
      if (p == 100) {
        it.isCompleted = true;
      } else {
        it.isCompleted = false;
        it.status = p ? "IN-PROCESS" : "NONE";
        it.percentComplete = p;
      }
    }).catch(() => {});
  };
  const head = (item, color) => {
    stripe.style.backgroundColor = color;
    showPct(curPct(item));
    const canEdit = writable(item);
    bar.toggleAttribute("data-readonly", !canEdit);
    num.toggleAttribute("data-readonly", !canEdit);
  };
  // Streifen, Strich und Zahl an die Karte (Titel samt Notiz) legen
  const place = () => {
    if (!detailsEl || !cardBox) {
      return;
    }
    const base = detailsEl.getBoundingClientRect();
    const top = cardBox.getBoundingClientRect();
    const note = doc.documentElement.hasAttribute("mc-task-note") ? frame.getBoundingClientRect() : null;
    const shown = !!tree.currentTask && top.height > 0;
    for (const e of [stripe, bar, num]) {
      e.hidden = !shown;
    }
    if (!shown) {
      return;
    }
    const y0 = top.top - base.top + detailsEl.scrollTop + 16;
    const y1 = Math.max(top.bottom, note?.height ? note.bottom : 0) - base.top + detailsEl.scrollTop - 16;
    const h = Math.max(20, y1 - y0);
    const left = top.left - base.left + 14, right = base.right - top.right + 16;
    Object.assign(stripe.style, { top: `${y0}px`, height: `${h}px`, insetInlineStart: `${left}px` });
    // (der Strich ist zum Greifen 17 px breit, sichtbar die 5 px in der Mitte)
    Object.assign(bar.style, { top: `${y0}px`, height: `${h}px`, insetInlineEnd: `${right - 6}px` });
    Object.assign(num.style, { top: `${y0 + h - 17}px`, insetInlineEnd: `${right + 5 + 14}px` });
  };
  const fromY = y => {
    const r = bar.getBoundingClientRect();
    return Math.round(Math.max(0, Math.min(1, (r.bottom - y) / r.height)) * 20) * 5;
  };
  const onBarDown = event => {
    if (event.button != 0 || bar.hasAttribute("data-readonly")) {
      return;
    }
    event.preventDefault();
    bar.focus();
    let p = fromY(event.clientY);
    showPct(p);
    const move = e => {
      p = fromY(e.clientY);
      showPct(p);
    };
    const up = () => {
      win.removeEventListener("mousemove", move, true);
      win.removeEventListener("mouseup", up, true);
      setPct(p);
    };
    win.addEventListener("mousemove", move, true);
    win.addEventListener("mouseup", up, true);
  };
  const onBarKey = event => {
    const item = tree.currentTask;
    const d = { ArrowUp: 5, ArrowRight: 5, ArrowDown: -5, ArrowLeft: -5 }[event.key];
    if (!item || !d || bar.hasAttribute("data-readonly")) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    setPct(Math.round((curPct(item) + d) / 5) * 5);
  };
  // (Rechtsklick: Stufen wie bisher und „Cancelled“ – den Status gibt es sonst noch nirgends)
  const onBarMenu = event => {
    const item = tree.currentTask;
    if (!item || bar.hasAttribute("data-readonly")) {
      return;
    }
    event.preventDefault();
    const pct = curPct(item);
    openMenu(bar, [
      ...[0, 25, 50, 75, 100].map(v => ({ label: `${v} %`, type: "radio", checked: pct == v && item.status != "CANCELLED", run: () => setPct(v) })),
      null,
      // (wie im Statusmenü: erst „nicht erledigt“ – sonst bliebe eine erledigte Aufgabe über Datum und 100 % erledigt)
      { label: tr("Cancelled"), type: "radio", checked: item.status == "CANCELLED", run: () => save(it => {
        const pct = it.percentComplete;
        it.isCompleted = false;
        it.status = "CANCELLED";
        if (pct > 0 && pct < 100) {
          it.percentComplete = pct;
        }
      }).catch(() => {}) },
    ]);
  };
  const onNum = () => {
    const item = tree.currentTask;
    if (!item || num.hasAttribute("data-readonly") || num.querySelector("input")) {
      return;
    }
    editText(num, String(curPct(item)), text => setPct(parseFloat(text) || 0), { type: "number" });
    const input = num.querySelector("input");
    if (input) {
      input.min = "0";
      input.max = "100";
      input.step = "5";
    }
  };
  bar.addEventListener("mousedown", onBarDown);
  bar.addEventListener("keydown", onBarKey);
  bar.addEventListener("contextmenu", onBarMenu);
  num.addEventListener("click", onNum);
  const headRO = new win.ResizeObserver(() => place());
  for (const e of [detailsEl, cardBox, frame]) {
    e && headRO.observe(e);
  }
  restorers.push(() => {
    headRO.disconnect();
    stripe.remove();
    bar.remove();
    num.remove();
  });
  const render = () => {
    const item = tree.currentTask;
    if (!item) {
      box.replaceChildren();
      place();
      return;
    }
    const start = when(item.entryDate), due = when(item.dueDate);
    const calColor = (() => {
      try {
        return item.calendar.getProperty("color") || "#007AFF";
      } catch {
        return "#007AFF";
      }
    })();
    const listDot = el("span", "mc-ti-dot");
    listDot.style.backgroundColor = calColor;
    const prio = item.priority;
    head(item, calColor);
    const privacy = { PRIVATE: "Private", CONFIDENTIAL: "Confidential" }[item.privacy] || "Public";
    const url = item.getProperty("URL");
    // Ganztägig als Schalter wie in Apple Erinnerungen (5d/5d)
    const allDay = el("input", "mc-ti-switch");
    allDay.type = "checkbox";
    allDay.checked = isAllDay(item);
    allDay.disabled = !writable(item);
    allDay.setAttribute("aria-label", tr("All Day"));
    const done = item.isCompleted ? when(item.completedDate) : null;
    box.replaceChildren(
      ...group(null, [url ? row("link", "URL", url) : null]),
      ...group("Date & Time", [
        row("calendar", "Start", start?.text),
        row("clock", "Due", due?.text, (r, v) => v.toggleAttribute("data-overdue", !!due?.past && !item.isCompleted)),
        row("sun", "All Day", allDay),
      ]),
      ...group(null, [
        row("repeat", "Repeat", repeatText(item)),
        row("bell", "Reminder", reminderText(item)),
      ]),
      ...group("Organisation", [
        row("list", "List", [listDot, item.calendar?.name || ""]),
        row("tag", "Category", item.getCategories().join(", ")),
        row("lock", "Privacy", tr(privacy)),
      ]),
      ...group(null, [
        row("star", "Priority", prio >= 1 && prio <= 4 ? tr("High") : prio == 5 ? tr("Medium") : prio >= 6 && prio <= 9 ? tr("Low") : null),
        // Status wie im alten Dialog, erledigt mit Datum („Completed On …“, änderbar)
        row("status", "Status", tr(STATUS[statusOf(item)])),
        item.isCompleted ? row("done", "Completed On", done?.text) : null,
      ]),
      ...group("Place", [row("location", "Location", item.getProperty("LOCATION"))]),
      ...group("Attachments", [
        ...item.getAttachments().map(a => plainRow("attach", attachName(a.uri?.spec || ""), r => {
          r.dataset.uri = a.uri?.spec || "";
          r.title = r.dataset.uri;
        })),
        writable(item) ? plainRow("attach-add", tr("Add Link…")) : null,
      ]),
    );
    wire(item);
    sizeNote();
    place();
  };
  // Bearbeiten direkt in der Spalte wie im Info-Fenster von Apple Erinnerungen:
  // Klick auf einen Wert öffnet ein Menü bzw. ein Feld, gespeichert wird
  // sofort über Thunderbirds Transaktion (mit Rückgängig)
  const writable = item => {
    try {
      return cal.acl.isCalendarWritable(item.calendar) && cal.acl.userCanModifyItem(item);
    } catch {
      return false;
    }
  };
  // Rückfrage bei einem Vorkommen einer Serie wie Apple Kalender: Thunderbirds
  // eigene Rückfrage („Nur dieses Vorkommen“ / „Alle Vorkommen“, dieselbe wie
  // beim Löschen und im Termin-Dialog); Rückgabe "occurrence", "series" oder null
  const askOccurrence = (item, action) => {
    const rv = { value: 0, items: [item], action };
    win.openDialog("chrome://calendar/content/calendar-occurrence-prompt.xhtml", "PromptOccurrenceModification",
      "centerscreen,chrome,modal,titlebar", rv);
    return occurrenceScope(rv.value);
  };
  // abgebrochen: Feld bzw. Titel und Notiz wieder mit dem gespeicherten Stand
  const reshow = () => {
    try {
      solo ? solo.reshow?.() : view.onSelect();
    } catch (e) {
      log("task info reshow error", e);
    }
  };
  // Datum als Wanduhrzeit (ms, in der Zeitzone des Kalenders) und zurück – so
  // verschiebt eine Änderung über die Sommerzeit hinweg die Serie um ganze Tage
  const wall = dt => {
    if (!dt?.isValid) {
      return null;
    }
    const d = dt.isDate ? dt : dt.getInTimezone(cal.dtz.defaultTimezone);
    return Date.UTC(d.year, d.month, d.day, d.isDate ? 0 : d.hour, d.isDate ? 0 : d.minute, d.isDate ? 0 : d.second);
  };
  const fromWall = (ms, isDate) => {
    const j = new Date(ms);
    const dt = cal.createDateTime();
    dt.resetTo(j.getUTCFullYear(), j.getUTCMonth(), j.getUTCDate(), j.getUTCHours(), j.getUTCMinutes(), j.getUTCSeconds(),
      isDate ? cal.dtz.floating : cal.dtz.defaultTimezone);
    dt.isDate = isDate;
    return dt;
  };
  // series: immer die ganze Serie (Wiederholung, Liste); occurrence: immer nur
  // dieses Vorkommen ohne Rückfrage (Erledigen, Status – wie Apple Erinnerungen);
  // sonst fragt ein Vorkommen nach. shift: Datumsfeld, das bei „Alle“ die Serie
  // um dieselbe Spanne verschiebt wie das Vorkommen (statt sie auf dessen Tag zu setzen)
  const save = async (mutate, calendar = null, { series = false, occurrence = false, shift = null } = {}) => {
    const cur = tree.currentTask;
    let scope = series ? "series" : "occurrence";
    if (!series && !occurrence && cur && cur.parentItem && cur.parentItem != cur && writable(cur)) {
      scope = askOccurrence(cur, "edit");
      if (!scope) {
        reshow();
        return;
      }
    }
    const old = scope == "series" ? cur?.parentItem : cur;
    if (!old || !writable(old)) {
      return;
    }
    const item = old.clone();
    mutate(item);
    if (shift && scope == "series" && old != cur) {
      const ms = shiftSeriesTime(wall(old[shift]), wall(cur[shift]), wall(item[shift]));
      item[shift] = ms == null ? null : fromWall(ms, !!(old[shift]?.isValid ? old[shift] : item[shift]).isDate);
    }
    try {
      await win.doTransaction("modify", item, calendar || item.calendar, old, null);
    } catch (e) {
      log("task info save error", e);
      throw e;
    }
  };
  let menu = null;
  const openMenu = (anchor, entries) => {
    menu?.remove();
    menu = doc.createXULElement("menupopup");
    menu.id = "mcTaskInfoMenu";
    for (const e of entries) {
      if (!e) {
        menu.append(doc.createXULElement("menuseparator"));
        continue;
      }
      const mi = doc.createXULElement("menuitem");
      mi.setAttribute("label", e.label);
      if (e.type) {
        mi.setAttribute("type", e.type);
      }
      if (e.checked) {
        mi.setAttribute("checked", "true");
      }
      if (e.disabled) {
        mi.setAttribute("disabled", "true");
      }
      mi.addEventListener("command", () => e.run());
      menu.append(mi);
    }
    doc.getElementById("mainPopupSet")?.append(menu) ?? doc.documentElement.append(menu);
    menu.addEventListener("popuphidden", event => event.target == menu && menu.remove(), { once: true });
    menu.openPopup(anchor, "after_end", 0, 2, false, false);
  };
  // Textfeld an Stelle eines Werts (Enter oder Verlassen speichert, Esc bricht ab)
  const editText = (host, value, apply, { type = "text", remove = null } = {}) => {
    const input = el("input", "mc-ti-input");
    input.type = type;
    input.value = value || "";
    const old = [...host.childNodes];
    let done = false;
    const finish = keep => {
      if (done) {
        return;
      }
      done = true;
      if (keep && input.value != (value || "")) {
        apply(input.value);
      } else {
        host.replaceChildren(...old);
      }
    };
    input.addEventListener("keydown", event => {
      if (event.key == "Enter") {
        event.preventDefault();
        finish(true);
      } else if (event.key == "Escape") {
        event.preventDefault();
        finish(false);
      }
      event.stopPropagation();
    });
    input.addEventListener("blur", () => win.setTimeout(() => finish(true), 0));
    const parts = [input];
    if (remove) {
      const b = el("button", "mc-ti-remove", tr("Remove"));
      b.type = "button";
      b.addEventListener("mousedown", event => event.preventDefault());
      b.addEventListener("click", () => {
        done = true;
        remove();
      });
      parts.push(b);
    }
    host.replaceChildren(...parts);
    input.focus();
    input.select?.();
  };
  const RULES = { DAILY: "Every day", WEEKLY: "Every week", MONTHLY: "Every month", YEARLY: "Every year" };
  const ALARMS = [[0, "At time"], [5, "5 minutes before"], [15, "15 minutes before"], [30, "30 minutes before"],
    [60, "1 hour before"], [1440, "1 day before"]];
  const wire = item => {
    if (!writable(item)) {
      box.removeAttribute("data-editable");
      return;
    }
    box.setAttribute("data-editable", "");
    const rowOf = icon => box.querySelector(`.mc-ti-row[data-icon="${icon}"]`);
    const valueOf = r => r?.querySelector(".mc-ti-value");
    const on = (icon, fn) => {
      const r = rowOf(icon);
      if (r) {
        r.setAttribute("data-edit", "");
        r.addEventListener("click", event => {
          if (!event.target.closest?.("input, button")) {
            fn(r, valueOf(r));
          }
        });
      }
    };
    // Start/Fällig: Datum (und Uhrzeit) zum Eintippen wie im Termin-Dialog, der
    // Monatskalender ist sofort offen; Enter oder Klick daneben speichert, Esc
    // bricht ab. Ohne Wert beginnt es bei der nächsten vollen Stunde heute
    const dateRow = (icon, prop, { removable = true } = {}) => on(icon, (r, v) => {
      if (v.querySelector(".mc-ti-dates")) {
        return;
      }
      const cur = item[prop];
      const isDate = cur?.isValid ? cur.isDate : false;
      let value;
      if (cur?.isValid) {
        value = cal.dtz.dateTimeToJsDate(cur.isDate ? cur : cur.getInTimezone(cal.dtz.defaultTimezone));
      } else {
        value = new Date();
        value.setHours(value.getHours() + 1, 0, 0, 0);
      }
      const before = cur?.isValid ? value.getTime() : null;
      const dateIo = {
        get: () => value,
        set: t => {
          const n = new Date(value);
          n.setFullYear(t.getFullYear(), t.getMonth(), t.getDate());
          value = n;
        },
        off: () => false,
      };
      const edit = inlineDateEdit(win, dateIo);
      const mini = miniMonthPopover(win, edit, dateIo);
      const wrap = el("span", "mc-ti-dates");
      wrap.append(edit.box);
      if (!isDate) {
        wrap.append(timeSegEdit(win, {
          get: () => [value.getHours(), value.getMinutes()],
          set: ([h, m]) => {
            const n = new Date(value);
            n.setHours(h, m, 0, 0);
            value = n;
          },
          off: () => false,
        }).box);
      }
      const old = [...v.childNodes];
      let done = false;
      const finish = keep => {
        if (done) {
          return;
        }
        done = true;
        edit.commit();
        mini.panel.hidePopup();
        mini.panel.remove();
        if (keep && value.getTime() !== before) {
          const dt = cal.dtz.jsDateToDateTime(value, cal.dtz.defaultTimezone);
          dt.isDate = isDate;
          save(it => (it[prop] = dt), null, { shift: prop, occurrence: prop == "completedDate" });
        } else {
          v.replaceChildren(...old);
        }
      };
      wrap.addEventListener("keydown", event => {
        if (event.key == "Enter") {
          event.preventDefault();
          finish(true);
        } else if (event.key == "Escape") {
          event.preventDefault();
          finish(false);
        }
        event.stopPropagation();
      });
      // (der Monatskalender nimmt nie den Fokus – Klick auf einen Tag bleibt drin)
      wrap.addEventListener("focusout", () => win.setTimeout(() => !wrap.contains(doc.activeElement) && finish(true), 0));
      const parts = [wrap];
      if (cur?.isValid && removable) {
        const b = el("button", "mc-ti-remove", tr("Remove"));
        b.type = "button";
        b.addEventListener("mousedown", event => event.preventDefault());
        b.addEventListener("click", () => {
          done = true;
          mini.panel.hidePopup();
          mini.panel.remove();
          save(it => (it[prop] = null), null, { shift: prop });
        });
        parts.push(b);
      }
      v.replaceChildren(...parts);
      edit.pick(edit.segs[0]);
      mini.show();
    });
    dateRow("calendar", "entryDate");
    dateRow("clock", "dueDate");
    // Datum der Erledigung (nur bei erledigten Aufgaben, ohne „Remove“)
    dateRow("done", "completedDate", { removable: false });
    // Ganztägig: Start und Fälligkeit werden zu reinen Tagen bzw. bekommen eine
    // Uhrzeit (die nächste volle Stunde); ohne Datum wird es heute fällig
    rowOf("sun")?.querySelector("input")?.addEventListener("change", event => {
      const wantAll = event.target.checked;
      save(it => {
        const hour = new Date().getHours() + 1;
        const dates = ["entryDate", "dueDate"].filter(p => it[p]?.isValid);
        if (!dates.length) {
          if (wantAll) {
            const today = cal.dtz.now();
            today.isDate = true;
            it.dueDate = today;
          }
          return;
        }
        let prev = null;
        for (const p of dates) {
          const cur = it[p];
          if (wantAll) {
            const d = cur.isDate ? cur.clone() : cur.getInTimezone(cal.dtz.defaultTimezone).clone();
            d.isDate = true;
            it[p] = d;
          } else if (cur.isDate) {
            const js = cal.dtz.dateTimeToJsDate(cur);
            js.setHours(Math.min(23, hour), 0, 0, 0);
            // (Fälligkeit am selben Tag eine Stunde nach dem Start)
            if (prev && js <= prev) {
              js.setTime(prev.getTime() + 3600000);
            }
            prev = js;
            it[p] = cal.dtz.jsDateToDateTime(js, cal.dtz.defaultTimezone);
          }
        }
      }).catch(() => {});
    });
    on("status", r => {
      const cur = statusOf(item);
      openMenu(r, Object.entries(STATUS).map(([v, label]) => ({ label: tr(label), type: "radio", checked: cur == v,
        run: () => v != cur && save(it => {
          if (v == "COMPLETED") {
            it.isCompleted = true;
            return;
          }
          // (isCompleted = false löscht auch den Fortschritt – „In Progress“ behält ihn, sonst 50 %)
          const pct = it.percentComplete;
          it.isCompleted = false;
          it.status = v;
          if (v == "IN-PROCESS") {
            it.percentComplete = pct > 0 && pct < 100 ? pct : 50;
          } else if (v == "CANCELLED" && pct > 0 && pct < 100) {
            it.percentComplete = pct;
          }
        }, null, { occurrence: true }) })));
    });
    // Anhänge: Klick öffnet (Webseite im Browser, Datei mit ihrem Programm),
    // Rechtsklick bietet „Remove“; „Add Link…“ hängt eine Webseite an wie der Dialog
    for (const r of box.querySelectorAll('.mc-ti-row[data-icon="attach"]')) {
      r.setAttribute("data-edit", "");
      r.addEventListener("click", () => {
        try {
          Cc["@mozilla.org/uriloader/external-protocol-service;1"].getService(Ci.nsIExternalProtocolService)
            .loadURI(Services.io.newURI(r.dataset.uri));
        } catch (e) {
          log("task attachment open error", e);
        }
      });
      r.addEventListener("contextmenu", event => {
        event.preventDefault();
        openMenu(r, [{ label: tr("Remove"), run: () => save(it => {
          for (const a of it.getAttachments()) {
            if (a.uri?.spec == r.dataset.uri) {
              it.removeAttachment(a);
            }
          }
        }) }]);
      });
    }
    on("attach-add", () => {
      const input = { value: "https://" };
      if (!Services.prompt.prompt(win, tr("Add Link…").replace(/\s*…$/, ""), tr("Address of the webpage:"), input, null, {})) {
        return;
      }
      let spec = input.value.trim();
      if (!spec || spec == "https://") {
        return;
      }
      if (!/^[a-z][a-z0-9+.-]*:/i.test(spec)) {
        spec = "https://" + spec;
      }
      let uri;
      try {
        uri = Services.io.newURI(spec);
      } catch {
        return;
      }
      save(it => {
        const { CalAttachment } = ChromeUtils.importESModule("resource:///modules/CalAttachment.sys.mjs");
        const a = new CalAttachment();
        a.uri = uri;
        it.addAttachment(a);
      }).catch(() => {});
    });
    const base = item.entryDate?.isValid || item.dueDate?.isValid;
    on("repeat", r => {
      const info = (item.parentItem || item).recurrenceInfo;
      const rules = info ? info.getRecurrenceItems().filter(x => !x.isNegative) : [];
      const curType = rules.length == 1 && rules[0] instanceof Ci.calIRecurrenceRule && rules[0].interval == 1 ? rules[0].type : info ? "custom" : "";
      openMenu(r, [
        { label: tr("Never"), type: "radio", checked: !curType, run: () => save(it => (it.recurrenceInfo = null), null, { series: true }) },
        ...Object.entries(RULES).map(([type, label]) => ({ label: tr(label), type: "radio", checked: curType == type, disabled: !base,
          run: () => save(it => {
            const { CalRecurrenceInfo } = ChromeUtils.importESModule("resource:///modules/CalRecurrenceInfo.sys.mjs");
            const ri = new CalRecurrenceInfo(it);
            ri.appendRecurrenceItem(cal.createRecurrenceRule(`RRULE:FREQ=${type}`));
            it.recurrenceInfo = ri;
          }, null, { series: true }) })),
      ]);
    });
    on("bell", r => {
      const alarm = item.getAlarms()[0];
      const mins = alarm?.offset ? Math.round(Math.abs(alarm.offset.inSeconds) / 60) : alarm ? -1 : null;
      openMenu(r, [
        { label: tr("None"), type: "radio", checked: mins == null, run: () => save(it => it.clearAlarms()) },
        ...ALARMS.map(([n, label]) => ({ label: tr(label), type: "radio", checked: mins == n, disabled: !base,
          run: () => save(it => {
            const { CalAlarm } = ChromeUtils.importESModule("resource:///modules/CalAlarm.sys.mjs");
            const a = new CalAlarm();
            a.action = "DISPLAY";
            a.related = it.dueDate?.isValid ? Ci.calIAlarm.ALARM_RELATED_END : Ci.calIAlarm.ALARM_RELATED_START;
            const d = cal.createDuration();
            d.inSeconds = -n * 60;
            a.offset = d;
            it.clearAlarms();
            it.addAlarm(a);
          }) })),
      ]);
    });
    on("list", r => {
      const cals = cal.manager.getCalendars().filter(c => !c.getProperty("disabled") && cal.acl.isCalendarWritable(c) &&
        c.getProperty("capabilities.tasks.supported") !== false);
      openMenu(r, cals.map(c => ({ label: c.name, type: "radio", checked: c.id == item.calendar?.id,
        run: () => c.id != item.calendar?.id && save(it => (it.calendar = c), c, { series: true }) })));
    });
    on("tag", r => {
      const cats = [...new Set([...cal.category.fromPrefs(), ...item.getCategories()])].sort((a, b) => a.localeCompare(b));
      const has = new Set(item.getCategories());
      openMenu(r, cats.map(c => ({ label: c, type: "checkbox", checked: has.has(c),
        run: () => save(it => {
          const next = new Set(it.getCategories());
          next.has(c) ? next.delete(c) : next.add(c);
          it.setCategories([...next]);
        }) })));
    });
    on("lock", r => openMenu(r, [["PUBLIC", "Public"], ["PRIVATE", "Private"], ["CONFIDENTIAL", "Confidential"]].map(([v, label]) =>
      ({ label: tr(label), type: "radio", checked: (item.privacy || "PUBLIC") == v, run: () => save(it => (it.privacy = v)) }))));
    on("star", r => openMenu(r, [[0, "None"], [1, "High"], [5, "Medium"], [9, "Low"]].map(([v, label]) => {
      const cur = item.priority >= 1 && item.priority <= 4 ? 1 : item.priority == 5 ? 5 : item.priority >= 6 ? 9 : 0;
      return { label: tr(label), type: "radio", checked: cur == v, run: () => save(it => (it.priority = v)) };
    })));
    on("location", (r, v) => editText(v, item.getProperty("LOCATION") || "", text => save(it => (text ? it.setProperty("LOCATION", text) : it.deleteProperty("LOCATION")))));
    on("link", (r, v) => editText(v, item.getProperty("URL") || "", text => save(it => (text ? it.setProperty("URL", text) : it.deleteProperty("URL")))));
  };
  // Titel in der Kopfkarte: Klick bearbeitet ihn
  const titleCell = doc.getElementById("calendar-task-details-title");
  const onTitle = () => {
    const item = tree.currentTask;
    if (!item || !writable(item) || titleCell.querySelector("input")) {
      return;
    }
    editText(titleCell, item.title || "", text => text.trim() && save(it => (it.title = text.trim())));
  };
  titleCell?.addEventListener("click", onTitle);
  // (neue Aufgabe ohne Dialog: Titel gleich zum Eintippen, siehe createTaskDirect)
  win.__mcEditTaskTitle = onTitle;
  // Notiz: Klick macht den Text bearbeitbar, Verlassen speichert ihn. Mit
  // Formatierung wie im alten Dialog (5d/5d): Leiste unter der Notiz mit Fett,
  // Kursiv, Unterstrichen, Listen und Link, dazu ⌘B, ⌘I, ⌘U; formatierter Text
  // wird als HTML gespeichert (Thunderbird zeigt ihn so auch an)
  const noteBar = el("div");
  noteBar.id = "mcTaskNoteBar";
  noteBar.setAttribute("role", "toolbar");
  noteBar.hidden = true;
  let noteBusy = false;
  const FORMATS = [["bold", "Bold"], ["italic", "Italic"], ["underline", "Underline"],
    ["insertUnorderedList", "Bulleted List"], ["insertOrderedList", "Numbered List"], ["createLink", "Link"]];
  for (const [cmd, label] of FORMATS) {
    const b = el("button");
    b.type = "button";
    b.dataset.cmd = cmd;
    b.textContent = { bold: "B", italic: "I", underline: "U", insertUnorderedList: "\u2022", insertOrderedList: "1." }[cmd] || "";
    b.title = tr(label);
    b.setAttribute("aria-label", tr(label));
    b.addEventListener("mousedown", event => event.preventDefault());
    b.addEventListener("click", () => {
      const ndoc = frame.contentDocument;
      if (!ndoc || ndoc.designMode != "on") {
        return;
      }
      if (cmd == "createLink") {
        const input = { value: "https://" };
        noteBusy = true;
        const ok = Services.prompt.prompt(win, tr("Link"), tr("Address of the webpage:"), input, null, {});
        noteBusy = false;
        frame.contentWindow.focus();
        if (ok && input.value.trim() && input.value.trim() != "https://") {
          ndoc.execCommand("createLink", false, input.value.trim());
        }
        return;
      }
      frame.contentWindow.focus();
      ndoc.execCommand(cmd, false, null);
    });
    noteBar.append(b);
  }
  box.before(noteBar);
  const FORMATTED = "b, i, u, strong, em, a, ul, ol, h1, h2, h3, h4, blockquote, pre, font, span[style], p[style], div[style]";
  const onNoteKey = event => {
    const ndoc = frame.contentDocument;
    const accel = IS_MAC ? event.metaKey && !event.ctrlKey : event.ctrlKey && !event.metaKey;
    const cmd = { b: "bold", i: "italic", u: "underline" }[event.key.toLowerCase()];
    if (ndoc?.designMode == "on" && accel && !event.altKey && !event.shiftKey && cmd) {
      event.preventDefault();
      ndoc.execCommand(cmd, false, null);
    }
  };
  const onNoteClick = event => {
    const item = tree.currentTask, ndoc = frame.contentDocument;
    if (!item || !ndoc?.body || ndoc.designMode == "on") {
      return;
    }
    // (Links öffnen Thunderbirds Handler im Browser; beim Bearbeiten bleibt der Klick im Text)
    if (event?.target?.closest?.("a") || !writable(item)) {
      return;
    }
    const before = ndoc.body.innerHTML;
    ndoc.designMode = "on";
    try {
      ndoc.execCommand("styleWithCSS", false, false);
    } catch {}
    noteBar.hidden = false;
    doc.documentElement.setAttribute("mc-task-note-edit", "");
    place();
    let finished = false;
    const onBlur = () => win.setTimeout(() => {
      if (finished || noteBusy || frame.contentDocument != ndoc) {
        return;
      }
      finished = true;
      frame.contentWindow.removeEventListener("blur", onBlur);
      ndoc.designMode = "off";
      noteBar.hidden = true;
      doc.documentElement.removeAttribute("mc-task-note-edit");
      if (ndoc.body.innerHTML == before) {
        place();
        return;
      }
      const text = ndoc.body.innerText.replace(/\n+$/, "");
      const html = ndoc.body.querySelector(FORMATTED) ? ndoc.body.innerHTML : null;
      save(it => {
        if (html && text.trim()) {
          it.descriptionHTML = html;
        } else {
          it.descriptionText = text;
        }
      }).catch(() => {});
    }, 0);
    frame.contentWindow.addEventListener("blur", onBlur);
  };
  const noteDoc = () => frame.contentDocument;
  const hookNote = () => {
    noteDoc()?.addEventListener("click", onNoteClick);
    noteDoc()?.addEventListener("keydown", onNoteKey, true);
  };
  // Notiz nur so hoch wie ihr Text (Thunderbird lässt sie den Rest füllen),
  // leer ganz weg – die Kopfkarte endet dann mit dem Titel
  const sizeNote = () => {
    const body = frame.contentDocument?.body;
    const text = body?.textContent.trim();
    doc.documentElement.toggleAttribute("mc-task-note", !!text);
    if (text) {
      // (Höhe samt Innenabstand der Karte unten)
      const st = win.getComputedStyle(frame);
      const pad = st.boxSizing == "border-box" ? parseFloat(st.paddingTop) + parseFloat(st.paddingBottom) : 0;
      // Höhe des Textes selbst (scrollHeight zählt Mindesthöhen der Notiz-Stile mit)
      const range = frame.contentDocument.createRange();
      range.selectNodeContents(body);
      frame.style.height = `${Math.ceil(range.getBoundingClientRect().height + pad) + 2}px`;
    }
  };
  // Knöpfe über der Aufgabe wie Apple Erinnerungen und Kanban-Karten: links
  // „Complete“, rechts „In eigenem Fenster öffnen“ und „…“ (Duplicate, Move to
  // List, Open in New Window, Delete Task). Kategorie, Priorität und Löschen
  // als eigene Knöpfe entfallen (Werte in den Zeilen darunter, Löschen über
  // „…“, Kontextmenü und Entf-Taste) – das CSS blendet sie aus.
  // Bis zur eigenen Ansicht im Fenster öffnet „In eigenem Fenster“ Thunderbirds
  // Bearbeiten-Fenster
  const actions = doc.getElementById("task-actions-toolbar");
  const btn = (id, title) => {
    const b = doc.createXULElement("toolbarbutton");
    b.id = id;
    b.className = "mc-ta-extra";
    b.setAttribute("tooltiptext", tr(title));
    b.setAttribute("aria-label", tr(title));
    b.setAttribute("tabindex", "0");
    actions?.append(b);
    return b;
  };
  // Der Pfeilteil von „Complete“ bekommt Mausereignisse selbst (CSS: pointer-events), damit nur er beim Überfahren
  // hervorgehoben wird; Thunderbird öffnet das Menü dann nicht mehr von allein, also hier
  const completeBtn = doc.getElementById("task-actions-markcompleted");
  const completeArrow = completeBtn?.querySelector(".toolbarbutton-menubutton-dropmarker");
  completeArrow?.addEventListener("mousedown", event => {
    const popup = completeBtn.querySelector("menupopup");
    if (event.button != 0 || completeBtn.disabled || !popup) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    if (popup.state == "open" || popup.state == "showing") {
      popup.hidePopup();
    } else {
      popup.openPopup(completeBtn, "after_start");
    }
  });
  const openBtn = solo ? null : btn("mcTaskOpenWindow", "Open in New Window");
  const moreBtn = btn("mcTaskMore", "More");
  moreBtn.setAttribute("aria-haspopup", "menu");
  const openTask = () => {
    const item = tree.currentTask;
    if (item && !solo) {
      openTaskWindow(win, item);
    }
  };
  const duplicateTask = async () => {
    const old = tree.currentTask?.parentItem || tree.currentTask;
    if (!old || !cal.acl.isCalendarWritable(old.calendar)) {
      return;
    }
    const copy = old.clone();
    copy.id = cal.getUUID();
    try {
      await win.doTransaction("add", copy, copy.calendar, null, null);
    } catch (e) {
      log("task duplicate error", e);
    }
  };
  const deleteTask = async () => {
    if (!solo) {
      win.goDoCommand?.("calendar_delete_todo_command");
      return;
    }
    // (im eigenen Fenster: wie Thunderbird mit Rückfrage, dann schließt das Fenster)
    const item = tree.currentTask;
    if (item && cal.acl.isCalendarWritable(item.calendar) && (!Services.prefs.getBoolPref("calendar.item.promptDelete", true) ||
      Services.prompt.confirm(win, tr("Delete Task"), tr("Delete this task?")))) {
      try {
        // Vorkommen einer Serie: wie in der Liste nachfragen, „nur dieses“
        // nimmt das Vorkommen aus der Serie, „alle“ löscht die Serie
        const parent = item.parentItem;
        if (parent && parent != item) {
          const scope = askOccurrence(item, "delete");
          if (scope == "occurrence") {
            const next = parent.clone();
            next.recurrenceInfo.removeOccurrenceAt(item.recurrenceId);
            await win.doTransaction("modify", next, next.calendar, parent, null);
            solo.close();
          } else if (scope == "series") {
            await win.doTransaction("delete", parent, parent.calendar, null, null);
          }
          return;
        }
        await win.doTransaction("delete", item, item.calendar, null, null);
      } catch (e) {
        log("task delete error", e);
      }
    }
  };
  const accel = key => `${IS_MAC ? "⌘" : "Ctrl+"}${key}`;
  let moreMenu = null;
  const openMore = () => {
    const item = tree.currentTask;
    if (!item) {
      return;
    }
    moreMenu?.remove();
    moreMenu = doc.createXULElement("menupopup");
    moreMenu.id = "mcTaskMoreMenu";
    const mi = (label, run, { key = null, disabled = false, cls = null } = {}) => {
      const m = doc.createXULElement("menuitem");
      m.setAttribute("label", tr(label));
      if (key) {
        m.setAttribute("acceltext", key);
      }
      if (disabled) {
        m.setAttribute("disabled", "true");
      }
      if (cls) {
        m.className = cls;
      }
      m.addEventListener("command", run);
      return m;
    };
    const canEdit = writable(item);
    const move = doc.createXULElement("menu");
    move.setAttribute("label", tr("Move to List"));
    const movePop = doc.createXULElement("menupopup");
    const cals = cal.manager.getCalendars().filter(c => !c.getProperty("disabled") && cal.acl.isCalendarWritable(c) &&
      c.getProperty("capabilities.tasks.supported") !== false);
    for (const c of cals) {
      const m = mi(c.name, () => c.id != item.calendar?.id && save(it => (it.calendar = c), c, { series: true }));
      m.setAttribute("type", "radio");
      if (c.id == item.calendar?.id) {
        m.setAttribute("checked", "true");
      }
      movePop.append(m);
    }
    move.append(movePop);
    if (!canEdit || cals.length < 2) {
      move.setAttribute("disabled", "true");
    }
    moreMenu.append(
      mi("Duplicate", duplicateTask, { key: accel("D"), disabled: !cal.acl.isCalendarWritable(item.calendar) }),
      move,
      doc.createXULElement("menuseparator"),
      ...(solo ? [] : [mi("Open in New Window", openTask, { key: accel("O") }), doc.createXULElement("menuseparator")]),
      mi("Delete Task", deleteTask, { key: IS_MAC ? "⌫" : "Del", disabled: !canEdit, cls: "mc-ta-danger" }),
    );
    doc.getElementById("mainPopupSet")?.append(moreMenu) ?? doc.documentElement.append(moreMenu);
    moreMenu.addEventListener("popuphidden", event => event.target == moreMenu && moreMenu.remove());
    moreBtn.setAttribute("open", "true");
    moreMenu.addEventListener("popuphiding", event => event.target == moreMenu && moreBtn.removeAttribute("open"));
    moreMenu.openPopup(moreBtn, "after_end", 0, 2, false, false);
  };
  openBtn?.addEventListener("command", openTask);
  moreBtn.addEventListener("command", openMore);
  // ⌘D und ⌘O in der Aufgabenliste (wie im „…“-Menü angezeigt)
  const onKey = event => {
    if (doc.documentElement.getAttribute("mc-tab") != "tasks" || event.altKey || event.shiftKey ||
      !(IS_MAC ? event.metaKey && !event.ctrlKey : event.ctrlKey && !event.metaKey) ||
      (!solo && !(event.target == tree || event.target.closest?.("#calendar-task-tree, #mcTaskCards"))) || !tree.currentTask) {
      return;
    }
    const key = event.key.toLowerCase();
    if (solo && key == "w") {
      event.preventDefault();
      win.close();
    } else if (key == "d" || (key == "o" && !solo)) {
      event.preventDefault();
      event.stopPropagation();
      (key == "d" ? duplicateTask : openTask)();
    }
  };
  win.addEventListener("keydown", onKey, true);
  restorers.push(() => {
    win.removeEventListener("keydown", onKey, true);
    moreMenu?.remove();
    openBtn?.remove();
    moreBtn.remove();
  });
  const orig = view.onSelect;
  const refresh = () => {
    try {
      render();
      win.requestAnimationFrame(() => {
        sizeNote();
        place();
      });
    } catch (e) {
      log("task info error", e);
    }
  };
  if (!solo) {
    view.onSelect = function (...args) {
      const result = orig.apply(this, args);
      refresh();
      return result;
    };
  }
  frame.addEventListener("load", sizeNote, true);
  frame.addEventListener("load", hookNote, true);
  hookNote();
  render();
  restorers.push(() => {
    if (!solo) {
      view.onSelect = orig;
    }
    titleCell?.removeEventListener("click", onTitle);
    if (win.__mcEditTaskTitle === onTitle) {
      delete win.__mcEditTaskTitle;
    }
    frame.removeEventListener("load", hookNote, true);
    noteDoc()?.removeEventListener("click", onNoteClick);
    noteDoc()?.removeEventListener("keydown", onNoteKey, true);
    noteBar.remove();
    doc.documentElement.removeAttribute("mc-task-note-edit");
    menu?.remove();
    frame.removeEventListener("load", sizeNote, true);
    frame.style.removeProperty("height");
    if (wrapperFlex != null) {
      wrapper.setAttribute("flex", wrapperFlex);
    }
    box.remove();
    doc.documentElement.removeAttribute("mc-task-info");
    doc.documentElement.removeAttribute("mc-task-note");
  });
  return solo ? refresh : undefined;
}

// Aufgabe in eigenem Fenster (neue Detailansicht 5c/5d): dieselbe Ansicht wie die
// Detailspalte, oben „Complete“ und „…“. Doppelklick, Enter, ⌘O, „Edit Task“ und
// der Knopf „In eigenem Fenster öffnen“ kommen hierher. Das Fenster ist ein leeres
// Chrome-Fenster (leeres Chrome-Dokument), das die Elemente der Detailspalte unter denselben
// Kennungen nachbaut – so gelten Stil und Logik (hookTaskInfo) unverändert.
const TASK_WINDOWS = new Map();

// Thunderbirds „Aufgabe bearbeiten“ (Doppelklick in der Tabelle, Enter, Kontextmenü
// „Edit Task“, Erinnerungen …) öffnet das Aufgabenfenster statt des Bearbeiten-Dialogs
function hookTaskOpen(win, restorers) {
  const orig = win.modifyEventWithDialog;
  if (typeof orig != "function" || orig.__mcTaskWindow) {
    return;
  }
  const wrapped = function (item, ...rest) {
    let task = false;
    try {
      task = !!item && item instanceof Ci.calITodo && !rest[2];
    } catch {} // gewollt: kein Kalenderobjekt, wie Termin behandeln
    if (task) {
      openTaskWindow(win, item).catch(e => log("task window error", e));
      return undefined;
    }
    return orig.call(this, item, ...rest);
  };
  wrapped.__mcTaskWindow = true;
  win.modifyEventWithDialog = wrapped;
  restorers.push(() => {
    if (win.modifyEventWithDialog === wrapped) {
      win.modifyEventWithDialog = orig;
    }
  });
  // Neue Aufgabe (5d/5d): ohne Bearbeiten-Dialog – sie entsteht sofort und steht
  // gewählt in der Detailspalte mit dem Titel zum Eintippen bzw. außerhalb des
  // Aufgaben-Space im eigenen Aufgabenfenster. (__mcOrig: alter Dialog, nur noch
  // für den Umschalter „Event | Task“ im großen Termin-Dialog)
  const origNew = win.createTodoWithDialog;
  if (typeof origNew == "function" && !origNew.__mcOrig) {
    const wrappedNew = function (...args) {
      createTaskDirect(win, ...args).then(done => {
        if (!done) {
          origNew.apply(win, args);
        }
      }, e => {
        log("task create error", e);
        origNew.apply(win, args);
      });
    };
    wrappedNew.__mcOrig = origNew;
    win.createTodoWithDialog = wrappedNew;
    restorers.push(() => {
      if (win.createTodoWithDialog === wrappedNew) {
        win.createTodoWithDialog = origNew;
      }
    });
  }
}

async function createTaskDirect(win, calendar, dueDate, summary, todo, initialDate) {
  const { cal } = ChromeUtils.importESModule("resource:///modules/calendar/calUtils.sys.mjs");
  const { CalTodo } = ChromeUtils.importESModule("resource:///modules/CalTodo.sys.mjs");
  const usable = c => {
    try {
      return !!c && !c.getProperty("disabled") && cal.acl.isCalendarWritable(c) && cal.acl.userCanAddItemsToCalendar(c) &&
        c.getProperty("capabilities.tasks.supported") !== false;
    } catch {
      return false;
    }
  };
  let item;
  if (todo) {
    item = todo.clone();
  } else {
    item = new CalTodo();
    win.setDefaultItemValues?.(item, calendar, null, dueDate, initialDate);
    if (summary) {
      item.title = summary;
    }
  }
  let target = [calendar, todo?.calendar, item.calendar, win.getSelectedCalendar?.()].find(usable) ||
    cal.manager.getCalendars().find(usable);
  if (!target) {
    return false;
  }
  const named = !!item.title;
  if (!named) {
    item.title = tr("New Task");
  }
  item.id = cal.getUUID();
  item.calendar = target;
  await win.doTransaction("add", item, target, null, null);
  let added = item;
  try {
    added = (await target.getItem(item.id)) || item;
  } catch {}
  // Titel erst zum Eintippen öffnen, wenn die Ansicht die Aufgabe zeigt
  const editTitle = async (w, ready) => {
    for (let i = 0; i < 40 && !ready(); i++) {
      await new Promise(r => win.setTimeout(r, 25));
    }
    w.__mcEditTaskTitle?.();
  };
  const doc = win.document;
  const tree = doc.getElementById("calendar-task-tree");
  // im Aufgaben-Space: neue Aufgabe in der Liste wählen, Titel zum Eintippen
  if (doc.documentElement.getAttribute("mc-tab") == "tasks" && tree?.view) {
    let index = -1;
    for (let i = 0; i < 40 && index < 0; i++) {
      index = (tree.mTaskArray || []).findIndex(t => t.id == item.id);
      if (index < 0) {
        await new Promise(r => win.setTimeout(r, 50));
      }
    }
    if (index >= 0) {
      tree.view.selection.select(index);
      tree.ensureRowIsVisible?.(index);
      if (!named) {
        const cell = doc.getElementById("calendar-task-details-title");
        await editTitle(win, () => tree.currentTask?.id == item.id && cell?.textContent == item.title);
      }
      return true;
    }
  }
  const nw = await openTaskWindow(win, added);
  if (nw && !named) {
    await editTitle(nw, () => nw.document?.getElementById("calendar-task-details-title")?.textContent == item.title);
  }
  return true;
}

async function openTaskWindow(main, item) {
  const key = `${item.calendar?.id}:${item.hashId}`;
  const open = TASK_WINDOWS.get(key);
  if (open && !open.closed) {
    open.focus();
    return open;
  }
  const { cal } = ChromeUtils.importESModule("resource:///modules/calendar/calUtils.sys.mjs");
  // Leeres Chrome-Dokument mit XUL-Wurzel statt about:blank: nur dort wirken customtitlebar/chromemargin
  // nachträglich (about:blank hat eine HTML-Wurzel – das Fenster behielt seine Titelleiste, Complete und „…“
  // standen darunter statt in der Zeile der Fensterknöpfe)
  const BLANK = "chrome://extensions/content/dummy.xhtml";
  const nw = main.openDialog(BLANK, "_blank", "chrome,dialog=no,resizable,minimizable,width=500,height=640");
  TASK_WINDOWS.set(key, nw);
  for (let tries = 0; tries < 200 && !(nw.location?.href == BLANK && nw.document?.readyState == "complete"); tries++) {
    await new Promise(r => main.setTimeout(r, 25));
  }
  const doc = nw.document;
  if (nw.closed || nw.location?.href != BLANK || !doc.documentElement) {
    TASK_WINDOWS.delete(key);
    return null;
  }
  try {
    Services.scriptloader.loadSubScript("chrome://global/content/customElements.js", nw);
    // (Stilblätter über windowUtils: die Seite erlaubt per CSP nur chrome:, das Design kommt als Nutzer-Stilblatt)
    for (const href of ["chrome://global/skin/global.css", "chrome://messenger/skin/messenger.css"]) {
      nw.windowUtils.loadSheetUsingURIString(href, nw.windowUtils.AUTHOR_SHEET);
    }
    if (ThemeSheet.active && nw.__mcTheme != ThemeSheet.uri) {
      nw.windowUtils.loadSheetUsingURIString(ThemeSheet.uri, nw.windowUtils.USER_SHEET);
      nw.__mcTheme = ThemeSheet.uri;
    }
    // Körper wie bisher (Stilregeln „:root[mc-task-window] > body“)
    const body = doc.createElementNS("http://www.w3.org/1999/xhtml", "body");
    doc.documentElement.append(body);
    cardWindow(nw);
    const root = doc.documentElement;
    root.setAttribute("mc-tab", "tasks");
    root.setAttribute("mc-task-window", "");
    const X = "http://www.w3.org/1999/xhtml";
    const xul = (tag, id, cls) => {
      const e = doc.createXULElement(tag);
      if (id) {
        e.id = id;
      }
      if (cls) {
        e.className = cls;
      }
      return e;
    };
    const html = (tag, id) => {
      const e = doc.createElementNS(X, tag);
      if (id) {
        e.id = id;
      }
      return e;
    };
    // Aufbau wie die Detailspalte der Aufgaben in Thunderbird (nur, was die Ansicht braucht)
    const container = xul("vbox", "calendar-task-details-container");
    const details = xul("hbox", "calendar-task-details");
    const actionsBox = xul("hbox", "other-actions-box");
    const toolbox = xul("vbox", "task-actions-toolbox");
    const toolbar = xul("hbox", "task-actions-toolbar");
    toolbar.setAttribute("role", "toolbar");
    const complete = xul("toolbarbutton", "task-actions-markcompleted", "toolbarbutton-1 message-header-view-button");
    complete.append(xul("image", null, "toolbarbutton-icon"), xul("label", null, "toolbarbutton-text"));
    complete.setAttribute("tabindex", "0");
    toolbar.append(complete);
    toolbox.append(toolbar);
    actionsBox.append(toolbox);
    const detailsBox = xul("hbox", "calendar-task-details-box");
    const grid = html("table", "calendar-task-details-grid");
    const titleRow = html("tr", "calendar-task-details-title-row");
    const titleCell = html("td", "calendar-task-details-title");
    titleCell.className = "task-details-value";
    titleRow.append(html("th"), titleCell);
    grid.append(titleRow);
    detailsBox.append(grid);
    details.append(actionsBox, detailsBox);
    const wrapper = xul("hbox", "calendar-task-details-description-wrapper");
    const frame = html("iframe", "calendar-task-details-description");
    wrapper.append(frame);
    container.append(details, wrapper);
    body.append(container);
    // (Thunderbirds Transaktionen, Rückgängig inklusive, liegen im Hauptfenster)
    nw.doTransaction = (...args) => main.doTransaction(...args);
    const solo = { tree: { currentTask: item }, close: () => nw.close() };
    const restorers = [];
    const refresh = hookTaskInfo(nw, restorers, solo);
    const taskCss = `resource://mailcards/taskdesc.css?v=${extensionVersion}`;
    const fill = () => {
      const task = solo.tree.currentTask;
      // (XUL-Wurzel: document.title lässt sich nicht setzen, es liest aber ein HTML-<title> – das legen wir an)
      let titleEl = doc.querySelector("title");
      if (!titleEl) {
        titleEl = doc.createElementNS("http://www.w3.org/1999/xhtml", "title");
        doc.documentElement.prepend(titleEl);
      }
      titleEl.textContent = task.title || tr("Task");
      titleCell.textContent = task.title || "";
      const body = frame.contentDocument?.body;
      if (body && frame.contentDocument.designMode != "on") {
        // (mit Formatierung wie in Thunderbirds Detailspalte; Links öffnen im Browser)
        const frag = cal.view.textToHtmlDocumentFragment(task.descriptionText || "", frame.contentDocument, task.descriptionHTML);
        for (const a of frag.querySelectorAll("a")) {
          a.addEventListener("click", event => {
            event.preventDefault();
            if (event.isTrusted && frame.contentDocument.designMode != "on") {
              try {
                Cc["@mozilla.org/uriloader/external-protocol-service;1"].getService(Ci.nsIExternalProtocolService)
                  .loadURI(Services.io.newURI(a.getAttribute("href")));
              } catch {}
            }
          });
        }
        body.replaceChildren(frag);
        const cw = frame.contentWindow;
        if (cw && cw.__mcDesc != taskCss) {
          try {
            cw.windowUtils.loadSheetUsingURIString(taskCss, cw.windowUtils.USER_SHEET);
            cw.__mcDesc = taskCss;
          } catch {} // gewollt: Rahmen schon entladen, beim nächsten Laden erneut
        }
      }
      complete.setAttribute("tooltiptext", tr(task.isCompleted ? "Mark Not Completed" : "Complete"));
      complete.setAttribute("aria-label", tr(task.isCompleted ? "Mark Not Completed" : "Complete"));
      complete.toggleAttribute("data-done", !!task.isCompleted);
      complete.toggleAttribute("disabled", !cal.acl.isCalendarWritable(task.calendar));
    };
    const show = () => {
      fill();
      refresh?.();
    };
    // (abgebrochene Rückfrage bei einem Vorkommen: gespeicherten Stand wieder zeigen)
    solo.reshow = show;
    // Der Rahmen lädt about:blank erst nach dem Einhängen – dann erst füllen
    frame.addEventListener("load", show, { once: true });
    complete.addEventListener("command", () => {
      const task = solo.tree.currentTask;
      const done = !task.isCompleted;
      const copy = task.clone();
      copy.isCompleted = done;
      if (!done) {
        copy.status = "NONE";
        copy.percentComplete = 0;
      }
      nw.doTransaction("modify", copy, copy.calendar, task, null).catch(e => log("task complete error", e));
    });
    complete.addEventListener("click", event => event.button == 0 && complete.doCommand?.());
    // Änderungen von außen (auch die eigenen) zeigen: neuer Stand bzw. Fenster zu bei gelöschter Aufgabe
    const observer = {
      QueryInterface: ChromeUtils.generateQI(["calIObserver"]),
      onStartBatch() {},
      onEndBatch() {},
      onLoad() {},
      onAddItem() {},
      onError() {},
      onPropertyChanged() {},
      onPropertyDeleting() {},
      onModifyItem(newItem) {
        const cur = solo.tree.currentTask;
        if (newItem.id == cur.id && newItem.calendar?.id == cur.calendar?.id) {
          // (Vorkommen einer Serie: Thunderbird meldet die ganze Serie – das Fenster
          // bleibt beim Vorkommen, sonst zeigte es nach dem Ändern die Serie)
          const info = cur.recurrenceId ? newItem.recurrenceInfo : null;
          // Nur dieses Vorkommen gelöscht: Thunderbird ändert die Serie (removeOccurrenceAt → negatives
          // Datum) statt onDeleteItem zu melden, getOccurrenceFor liefert trotzdem ein Vorkommen – Fenster zu
          if (info?.getRecurrenceItems().some(r => r.isNegative && r.date?.compare(cur.recurrenceId) == 0)) {
            nw.close();
            return;
          }
          const occ = info ? info.getOccurrenceFor(cur.recurrenceId) : null;
          solo.tree.currentTask = occ || newItem;
          show();
        }
      },
      onDeleteItem(gone) {
        if (gone.id == solo.tree.currentTask.id) {
          nw.close();
        }
      },
    };
    const calendar = item.calendar;
    calendar.addObserver(observer);
    const onKey = event => {
      if (event.key == "Escape" && !event.defaultPrevented && !doc.querySelector("input:focus, .mc-ti-input")) {
        nw.close();
      }
    };
    nw.addEventListener("keydown", onKey);
    const closeWith = () => nw.close();
    main.addEventListener("unload", closeWith, { once: true });
    nw.addEventListener("unload", () => {
      TASK_WINDOWS.delete(key);
      try {
        calendar.removeObserver(observer);
      } catch {} // gewollt: Beobachter schon entfernt
      main.removeEventListener("unload", closeWith);
      for (const r of restorers.reverse()) {
        try {
          r();
        } catch {} // gewollt: Fenster schon weg, übrige Aufräumer laufen weiter
      }
    }, { once: true });
    if (frame.contentDocument?.readyState == "complete") {
      show();
    }
    nw.focus();
  } catch (e) {
    log("task window error", e);
  }
  return nw;
}

function hookTaskCards(win, restorers) {
  const doc = win.document;
  const tree = doc.getElementById("calendar-task-tree");
  const box = tree?.parentElement;
  if (!tree || !box || doc.getElementById("mcTaskCards")) {
    return;
  }
  const { cal } = ChromeUtils.importESModule("resource:///modules/calendar/calUtils.sys.mjs");
  const X = "http://www.w3.org/1999/xhtml";
  const el = (tag, cls, text) => {
    const e = doc.createElementNS(X, tag);
    if (cls) {
      e.className = cls;
    }
    if (text != null) {
      e.textContent = text;
    }
    return e;
  };
  const list = el("div");
  list.id = "mcTaskCards";
  list.setAttribute("role", "presentation");
  tree.before(list);
  const locale = regionLocale();
  const fmtDay = new Intl.DateTimeFormat(locale, { day: "numeric", month: "short" });
  const fmtDayYear = new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", year: "numeric" });
  const fmtTime = new Intl.DateTimeFormat(locale, { hour: "2-digit", minute: "2-digit" });
  const rel = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
  const dayStart = d => new Date(d.getFullYear(), d.getMonth(), d.getDate());
  // Fälligkeit wie in Apple Erinnerungen: „Heute, 14:00“, „Morgen“, „3. Nov.“
  const dateText = date => {
    if (!date?.isValid) {
      return null;
    }
    const js = cal.dtz.dateTimeToJsDate(date.isDate ? date : date.getInTimezone(cal.dtz.defaultTimezone));
    const now = new Date();
    const days = Math.round((dayStart(js) - dayStart(now)) / 86400000);
    let text = Math.abs(days) <= 1 ? rel.format(days, "day") : (js.getFullYear() == now.getFullYear() ? fmtDay : fmtDayYear).format(js);
    text = text.charAt(0).toLocaleUpperCase(locale) + text.slice(1);
    if (!date.isDate) {
      text += ", " + fmtTime.format(js);
    }
    return text;
  };
  const dueText = task => {
    const due = task.dueDate;
    const text = dateText(due);
    if (!text) {
      return null;
    }
    const js = cal.dtz.dateTimeToJsDate(due.isDate ? due : due.getInTimezone(cal.dtz.defaultTimezone));
    const now = new Date();
    const days = Math.round((dayStart(js) - dayStart(now)) / 86400000);
    return { text, overdue: !task.isCompleted && (due.isDate ? days < 0 : js < now) };
  };
  const color = calendar => {
    try {
      return calendar.getProperty("color") || "#007AFF";
    } catch {
      return "#007AFF";
    }
  };
  let pending = false;
  const render = () => {
    pending = false;
    if (!list.isConnected || !doc.documentElement.hasAttribute("mc-task-list")) {
      return;
    }
    const tasks = tree.mTaskArray || [];
    const sel = tree.view?.selection;
    const term = (doc.getElementById("task-text-filter-field")?.value || "").trim();
    const cards = tasks.map((task, i) => {
      const card = el("div", "mc-tc");
      card.dataset.index = i;
      card.__mcTask = task;
      card.toggleAttribute("data-completed", !!task.isCompleted);
      card.toggleAttribute("data-dragging", !!drag && drag.__mcHash == task.hashId);
      if (sel?.isSelected(i)) {
        card.setAttribute("aria-selected", "true");
      }
      // Aufbau nach Entwurf I (Entscheidung des Maintainers vom 6.11.2026):
      // links der Farbstreifen der Liste (so hoch wie der Inhalt, mindestens
      // 48 px), oben der Titel mit Priorität, rechts der Fortschrittsstrich –
      // erledigter Teil füllt von unten in der Ampelfarbe der Stufe, der
      // offene Teil ist fein rot gestrichelt –, unten rechts daneben die Zahl
      // „n %“; darunter nur, was es gibt: Datum, Ort, Beschreibung,
      // Kategorien. Kein Abhak-Kreis mehr (zu oft versehentlich erledigt)
      card.style.setProperty("--mc-tc-color", color(task.calendar));
      const pct = task.isCompleted ? 100 : Math.max(0, Math.min(100, task.percentComplete || 0));
      card.dataset.step = String(pct >= 100 ? 100 : pct >= 75 ? 75 : pct >= 50 ? 50 : 25);
      card.style.setProperty("--mc-tc-p", pct);
      const title = el("div", "mc-tc-title");
      // Priorität wie Apple: „!!!“ hoch, „!!“ mittel, „!“ niedrig vor dem Titel
      const prio = task.priority;
      if (prio >= 1 && prio <= 9) {
        title.append(el("span", "mc-tc-prio", prio <= 4 ? "!!!" : prio == 5 ? "!!" : "!"));
      }
      title.append(task.title || "");
      const bar = el("span", "mc-tc-bar");
      bar.title = tr("{n} % done", { n: pct });
      bar.append(el("i", "mc-tc-fill"));
      const num = el("span", "mc-tc-pct", `${pct} %`);
      card.append(el("span", "mc-tc-stripe"), title, num, bar);
      const due = dueText(task);
      const start = dateText(task.entryDate);
      if (due || start) {
        const row = el("div", "mc-tc-row mc-tc-due", start && due ? `${start} – ${due.text}` : due ? due.text : start);
        row.dataset.icon = "calendar";
        row.toggleAttribute("data-overdue", !!due?.overdue);
        card.append(row);
      }
      const where = task.getProperty?.("LOCATION");
      if (where) {
        const row = el("div", "mc-tc-row mc-tc-where", where);
        row.dataset.icon = "location";
        card.append(row);
      }
      const note = (task.descriptionText || task.getProperty?.("DESCRIPTION") || "").trim();
      if (note) {
        card.append(el("div", "mc-tc-note", note));
      }
      // Kategorien als Kapseln; eine Liste mit ⚠️ im Namen (iCloud: nicht mehr
      // abgeglichen) ebenso – die Liste selbst zeigt der Streifen
      const chips = task.getCategories?.() || [];
      if (/⚠/.test(task.calendar?.name || "")) {
        chips.unshift(task.calendar.name);
      }
      if (chips.length) {
        const cats = el("div", "mc-tc-cats");
        cats.append(...chips.map(c => el("span", "mc-tc-chip", c)));
        card.append(cats);
      }
      // Suchtreffer gelb hinterlegt wie in der Mail (Suchfeld oben filtert die Liste)
      if (term) {
        for (const part of card.querySelectorAll(".mc-tc-title, .mc-tc-where, .mc-tc-note, .mc-tc-chip")) {
          markHits(part, term);
        }
      }
      // (Streifen, Strich und Zahl reichen über alle Zeilen der Karte)
      card.style.setProperty("--mc-tc-rows", card.children.length - 3);
      return card;
    });
    // (eine Zeile in Bearbeitung nicht umhängen – sie verlöre den Fokus)
    if (doc.documentElement.hasAttribute("mc-task-board")) {
      renderBoard(tasks, cards);
    } else if (editing?.parentNode == list) {
      for (const child of [...list.children]) {
        if (child != editing) {
          child.remove();
        }
      }
      editing.before(...cards);
    } else {
      list.replaceChildren(...cards, newTaskRow());
    }
    list.toggleAttribute("data-focused", doc.activeElement == tree);
    enhancer?.updateListHeader?.(win); // Anzahl im Listenkopf
  };
  // Kanban-Ansicht: drei Spalten nach Fortschritt – „Not Started“ (0 %),
  // „In Progress“ (1–99 %), „Completed“ (100 % bzw. erledigt), je mit Anzahl im
  // Kopf; „New Task“ unter der ersten Spalte. Die Karten sind dieselben wie in
  // der Kartenansicht (Auswahl, Kreis, Kontextmenü, Doppelklick gleich)
  const BOARD_COLUMNS = [["todo", "Not Started"], ["doing", "In Progress"], ["done", "Completed"]];
  const stageOf = task => {
    const pct = task.percentComplete || 0;
    return task.isCompleted || pct >= 100 ? 2 : pct > 0 ? 1 : 0;
  };
  const renderBoard = (tasks, cards) => {
    const groups = BOARD_COLUMNS.map(() => []);
    cards.forEach((card, i) => groups[stageOf(tasks[i])].push(card));
    let cols = [...list.children].filter(c => c.classList.contains("mc-tb-col"));
    if (cols.length != BOARD_COLUMNS.length || list.children.length != cols.length + (drag ? 1 : 0)) {
      cols = BOARD_COLUMNS.map(([key, label]) => {
        const col = el("div", "mc-tb-col");
        col.dataset.stage = key;
        const head = el("div", "mc-tb-head");
        head.append(el("span", "mc-tb-title", tr(label)), el("span", "mc-tb-count"));
        col.append(head, el("div", "mc-tb-cards"));
        return col;
      });
      // (eine gezogene Karte bleibt sichtbar)
      list.replaceChildren(...cols, ...(drag ? [drag] : []));
    }
    cols.forEach((col, k) => {
      col.querySelector(".mc-tb-count").textContent = String(groups[k].length);
      const body = col.querySelector(".mc-tb-cards");
      if (k == 0 && editing?.parentNode == body) {
        for (const child of [...body.children]) {
          if (child != editing) {
            child.remove();
          }
        }
        editing.before(...groups[k]);
      } else {
        body.replaceChildren(...groups[k], ...(k == 0 ? [newTaskRow()] : []));
      }
    });
  };
  // Karte in eine andere Spalte ziehen setzt den Fortschritt: Not Started 0 %,
  // In Progress 50 %, Completed erledigt (Entscheidung des Maintainers vom
  // 9.11.2026), über Thunderbirds Transaktion (mit Rückgängig). Beim Ziehen
  // folgt eine Kopie der Karte der Maus, die Zielspalte ist umrandet
  const BOARD_PCT = [0, 50, 100];
  const setStage = async (task, k) => {
    if (!task || stageOf(task) == k) {
      return;
    }
    try {
      if (!cal.acl.isCalendarWritable(task.calendar) || !cal.acl.userCanModifyItem(task)) {
        return;
      }
    } catch {
      return;
    }
    const item = task.clone();
    const p = BOARD_PCT[k];
    if (p == 100) {
      item.isCompleted = true;
    } else {
      item.isCompleted = false;
      item.status = p ? "IN-PROCESS" : "NONE";
      item.percentComplete = p;
    }
    try {
      await win.doTransaction("modify", item, item.calendar, task, null);
    } catch (e) {
      log("task board move error", e);
    }
  };
  let drag = null, endDrag = null;
  const startDrag = (down, i) => {
    endDrag?.(false); // (ein Ziehen ohne mouseup nicht weiterführen)
    // (die Aufgabe der Karte selbst, nicht über die Zeilennummer – die Liste
    // ordnet sich nach einer Änderung neu, bevor die Karten nachziehen)
    const card = down.target.closest(".mc-tc");
    const task = card?.__mcTask || tree.mTaskArray?.[i];
    if (!card || !task) {
      return;
    }
    let over = null;
    const move = e => {
      if (!drag) {
        if (Math.hypot(e.clientX - down.clientX, e.clientY - down.clientY) < 5) {
          return;
        }
        const r = card.getBoundingClientRect();
        drag = card.cloneNode(true);
        drag.removeAttribute("data-index");
        drag.removeAttribute("aria-selected");
        drag.classList.add("mc-tb-ghost");
        drag.style.width = `${r.width}px`;
        drag.__dx = down.clientX - r.left;
        drag.__dy = down.clientY - r.top;
        drag.__mcHash = task.hashId;
        list.append(drag);
        for (const k of list.querySelectorAll(".mc-tc[data-index]")) {
          k.toggleAttribute("data-dragging", k.__mcTask?.hashId == task.hashId);
        }
      }
      drag.style.left = `${e.clientX - drag.__dx}px`;
      drag.style.top = `${e.clientY - drag.__dy}px`;
      const col = doc.elementFromPoint(e.clientX, e.clientY)?.closest?.(".mc-tb-col") || null;
      if (col != over) {
        over?.removeAttribute("data-drop");
        over = col;
        over?.setAttribute("data-drop", "");
      }
    };
    const up = (drop = true) => {
      endDrag = null;
      win.removeEventListener("mousemove", move, true);
      win.removeEventListener("mouseup", up, true);
      const moved = !!drag && drop !== false;
      drag?.remove();
      drag = null;
      for (const k of list.querySelectorAll("[data-dragging]")) {
        k.removeAttribute("data-dragging");
      }
      over?.removeAttribute("data-drop");
      if (moved && over) {
        setStage(task, [...list.querySelectorAll(".mc-tb-col")].indexOf(over));
      }
    };
    endDrag = up;
    win.addEventListener("mousemove", move, true);
    win.addEventListener("mouseup", up, true);
  };
  // Neue Aufgabe wie in Apple Erinnerungen (Aufgaben 4/5): unter der letzten
  // Karte eine leere Zeile mit grauem Kreis und „New Task“ – Klick und gleich
  // tippen, Enter legt die Aufgabe in der gewählten Liste an (und öffnet die
  // nächste Zeile), Esc bzw. leer verwirft; „+“ oben bleibt. Beim Neuaufbau der
  // Karten bleibt eine Zeile in Bearbeitung stehen
  let editing = null;
  const newTaskRow = () => {
    if (editing) {
      return editing;
    }
    const row = el("div", "mc-tc mc-tc-new");
    row.append(el("div", "mc-tc-body mc-tc-new-text", tr("New Task")));
    return row;
  };
  const startNewTask = row => {
    const calendar = win.getSelectedCalendar?.();
    if (!calendar || calendar.readOnly || editing) {
      return;
    }
    const input = el("input", "mc-tc-new-input");
    input.setAttribute("aria-label", tr("New Task"));
    row.querySelector(".mc-tc-body").replaceChildren(input);
    row.setAttribute("data-editing", "");
    editing = row;
    const stop = () => {
      editing = null;
      schedule();
    };
    input.addEventListener("keydown", event => {
      event.stopPropagation();
      if (event.key == "Escape") {
        event.preventDefault();
        stop();
        return;
      }
      if (event.key != "Enter") {
        return;
      }
      event.preventDefault();
      const title = input.value.trim();
      if (!title) {
        stop();
        return;
      }
      try {
        const { CalTodo } = ChromeUtils.importESModule("resource:///modules/CalTodo.sys.mjs");
        const task = new CalTodo();
        task.title = title;
        task.calendar = calendar;
        // in „Today“ bzw. „Scheduled“ fällig heute – sonst verschwände sie gleich aus der Ansicht
        const key = Services.prefs.getCharPref("extensions.mailcards.taskList", "all");
        if (key == "today" || key == "scheduled") {
          const due = cal.dtz.now();
          due.isDate = true;
          task.dueDate = due;
        } else if (key == "important") {
          task.priority = 1;
        } else if (key == "archived") {
          task.setProperty(TASK_ARCHIVED_PROP, "1");
        }
        win.doTransaction("add", task, calendar, null, null);
      } catch (e) {
        log("new task error", e);
      }
      input.value = "";
    });
    input.addEventListener("blur", () => win.setTimeout(() => {
      if (editing == row && doc.activeElement != input) {
        const title = input.value.trim();
        if (title) {
          input.dispatchEvent(new win.KeyboardEvent("keydown", { key: "Enter" }));
        }
        stop();
      }
    }, 0));
    input.focus();
  };
  const schedule = () => {
    if (!pending) {
      pending = true;
      win.requestAnimationFrame(render);
    }
  };
  // Thunderbird meldet Änderungen der Liste über diese Methoden des Baums
  const wrapped = [];
  for (const name of ["invalidate", "invalidateRow", "invalidateRange", "rowCountChanged"]) {
    const orig = tree[name];
    if (typeof orig != "function") {
      continue;
    }
    tree[name] = function (...args) {
      schedule();
      return orig.apply(this, args);
    };
    wrapped.push([name, orig]);
  }
  const onSelect = () => {
    const sel = tree.view?.selection;
    for (const card of list.querySelectorAll(".mc-tc[data-index]")) {
      card.toggleAttribute("aria-selected", !!sel?.isSelected(+card.dataset.index));
    }
    list.querySelector(`.mc-tc[data-index="${tree.currentIndex}"]`)?.scrollIntoView({ block: "nearest" });
  };
  const onFocus = () => list.toggleAttribute("data-focused", doc.activeElement == tree);
  tree.addEventListener("select", onSelect);
  tree.addEventListener("focus", onFocus);
  tree.addEventListener("blur", onFocus);
  const indexOf = event => {
    const card = event.target.closest?.(".mc-tc");
    return card ? +card.dataset.index : -1;
  };
  list.addEventListener("mousedown", event => {
    const newRow = event.target.closest?.(".mc-tc-new");
    if (newRow) {
      if (!newRow.hasAttribute("data-editing")) {
        event.preventDefault();
        startNewTask(newRow);
      }
      return;
    }
    const i = indexOf(event);
    const sel = tree.view?.selection;
    if (!sel) {
      return;
    }
    event.preventDefault();
    tree.focus();
    if (i < 0) {
      sel.clearSelection();
      return;
    }
    // (kein Abhak-Kreis: Erledigen über Kontextmenü, Detailansicht oder 100 %)
    if (event.button == 2 && sel.isSelected(i)) {
      return;
    }
    if (event.shiftKey) {
      sel.rangedSelect(tree.currentIndex >= 0 ? tree.currentIndex : i, i, event.metaKey || event.ctrlKey);
    } else if (event.metaKey || event.ctrlKey) {
      sel.toggleSelect(i);
    } else {
      sel.select(i);
    }
    tree.currentIndex = i;
    if (event.button == 0 && !event.shiftKey && doc.documentElement.hasAttribute("mc-task-board")) {
      startDrag(event, i);
    }
  });
  list.addEventListener("dblclick", event => {
    const i = indexOf(event);
    if (event.button != 0 || event.target.closest(".mc-tc-new")) {
      return;
    }
    const initialDate = cal.dtz.getDefaultStartDate(tree.getInitialDate?.());
    if (i >= 0) {
      win.modifyEventWithDialog?.(tree.mTaskArray[i], true, initialDate);
    } else {
      win.createTodoWithDialog?.(null, null, null, null, initialDate);
    }
  });
  list.addEventListener("contextmenu", event => {
    event.preventDefault();
    const menu = doc.getElementById(tree.getAttribute("context") || "taskitem-context-menu");
    // wie für Thunderbirds Aufgabenliste: die Varianten der Today-Pane aus
    // (seine Menülogik findet in den Karten keine Aufgabenliste und ließ
    // „Open Task…“ und „New Task…“ doppelt stehen)
    for (const [id, hide] of [["task-context-menu-new", false], ["task-context-menu-modify", false],
      ["task-context-menu-new-todaypane", true], ["task-context-menu-modify-todaypane", true],
      ["task-context-menu-filter-todaypane", true], ["task-context-menu-separator-filter", true]]) {
      const item = doc.getElementById(id);
      if (item) {
        item.hidden = hide;
      }
    }
    // Auslöser des Menüs ist Thunderbirds Aufgabenliste (sein Menücode sucht
    // dort nach .calendar-task-tree – von der Karte aus brach er mit Fehler ab)
    const trigger = new win.MouseEvent("mc-task-context", { screenX: event.screenX, screenY: event.screenY, clientX: event.clientX, clientY: event.clientY });
    tree.dispatchEvent(trigger);
    menu?.openPopupAtScreen(event.screenX, event.screenY, true, trigger);
  });
  const prefObs = () => schedule();
  Services.prefs.addObserver(TASK_VIEW_PREF, prefObs);
  // Suchbegriff geändert: Markierungen neu (auch wenn die Treffer gleich bleiben)
  const filterField = doc.getElementById("task-text-filter-field");
  filterField?.addEventListener("input", schedule);
  // Hinweis „schreibgeschützt“ wechselt mit dem Standardkalender → Listenkopf neu
  const field = doc.getElementById("view-task-edit-field");
  const fieldMo = field ? new win.MutationObserver(() => enhancer?.updateListHeader?.(win)) : null;
  fieldMo?.observe(field, { attributes: true, attributeFilter: ["readonly", "aria-disabled", "value", "placeholder"] });
  // (Mitternacht: „Heute“/„Morgen“ und überfällig neu)
  const timer = win.setInterval(schedule, 10 * 60 * 1000);
  const toggleCmd = doc.getElementById("calendar_toggle_completed_command");
  const onToggle = event => {
    const sel = tree.selectedTasks || [];
    if (doc.documentElement.getAttribute("mc-tab") == "tasks" && sel.length && sel.every(t => t.isCompleted)) {
      event.stopImmediatePropagation();
      event.preventDefault();
      reopenTasks(win, sel);
    }
  };
  toggleCmd?.addEventListener("command", onToggle, true);
  // Priorität/Fortschritt: Thunderbird will beim Öffnen alle Häkchen löschen
  // (command.checked = false wirkt bei <command> nicht) und setzt dann das
  // richtige – alte blieben stehen, mehrere Prioritäten bzw. 25 % und 50 %
  // zugleich angehakt. Vorher (Fenster, Einfangphase) alle entfernen
  const onMenuShowing = event => {
    const popup = event.target;
    if (!/^calendar-task-(priority|progress)-menupopup$/.test(popup?.getAttribute?.("is") || "")) {
      return;
    }
    for (const item of popup.children) {
      const id = item.getAttribute("command");
      (id && doc.getElementById(id))?.removeAttribute("checked");
      item.removeAttribute("checked");
    }
  };
  win.addEventListener("popupshowing", onMenuShowing, true);
  // „Sort by category“/„Change priority“ (Thunderbirds Texte) passen nicht:
  // es wird nichts sortiert – kurz „Category“ und „Priority“
  const renamed = [];
  for (const [id, text] of [["task-actions-category", "Category"], ["task-actions-priority", "Priority"]]) {
    const b = doc.getElementById(id);
    if (b) {
      renamed.push([b, b.getAttribute("data-l10n-id")]);
      b.removeAttribute("data-l10n-id");
      b.setAttribute("label", tr(text));
      b.setAttribute("tooltiptext", tr(text));
      b.setAttribute("aria-label", tr(text));
    }
  }
  // Kontextmenü: „Edit Task…“ ganz oben statt Thunderbirds „Open Task…“
  // (Entscheidung des Maintainers: so heißt der Eintrag, solange es den Dialog gibt)
  const editItem = doc.getElementById("task-context-menu-modify");
  const editPlace = editItem && [editItem.parentNode, editItem.nextSibling, editItem.getAttribute("data-l10n-id")];
  if (editItem) {
    editItem.removeAttribute("data-l10n-id");
    editItem.setAttribute("label", tr("Edit Task…"));
    editItem.parentNode.prepend(editItem);
  }
  schedule();
  restorers?.push(() => {
    toggleCmd?.removeEventListener("command", onToggle, true);
    win.removeEventListener("popupshowing", onMenuShowing, true);
    if (editPlace) {
      const [parent, next, l10n] = editPlace;
      parent.insertBefore(editItem, next?.parentNode == parent ? next : null);
      if (l10n) {
        editItem.setAttribute("data-l10n-id", l10n);
        doc.l10n?.translateElements([editItem]);
      }
    }
    for (const [b, l10n] of renamed) {
      b.removeAttribute("aria-label");
      if (l10n) {
        b.setAttribute("data-l10n-id", l10n);
        doc.l10n?.translateElements([b]);
      }
    }
    for (const [name, orig] of wrapped) {
      tree[name] = orig;
    }
    tree.removeEventListener("select", onSelect);
    tree.removeEventListener("focus", onFocus);
    tree.removeEventListener("blur", onFocus);
    Services.prefs.removeObserver(TASK_VIEW_PREF, prefObs);
    filterField?.removeEventListener("input", schedule);
    fieldMo?.disconnect();
    win.clearInterval(timer);
    list.remove();
  });
}

// Aufgabenliste: Thunderbird löst die Liste von den Kalendern, sobald sie kurz
// nicht angezeigt wird (z. B. beim Ein-/Ausblenden der Today-Pane), verbindet
// sie beim erneuten Anzeigen aber nur beim allerersten Mal wieder – danach
// erschienen neue Aufgaben erst nach einem Bereichswechsel. Beim Wiederanzeigen
// daher neu verbinden (refresh() fügt den Beobachter hinzu und lädt die Liste).
function relinkTaskTree(win, restorers) {
  const tree = win.document.getElementById("calendar-task-tree");
  const proto = tree?.mTreeView && Object.getPrototypeOf(tree.mTreeView);
  if (!proto?.setTree || proto.__mcRelink) {
    return;
  }
  const orig = proto.setTree;
  proto.__mcRelink = true;
  proto.setTree = function (newTree) {
    const relink = !this.tree && newTree?.isInitialized;
    const result = orig.call(this, newTree);
    if (relink) {
      win.setTimeout(() => {
        try {
          if (this.tree == newTree) {
            newTree.refresh();
          }
        } catch (e) {
          log("task tree relink error", e);
        }
      }, 0);
    }
    return result;
  };
  restorers?.push(() => {
    proto.setTree = orig;
    delete proto.__mcRelink;
  });
}

// Adressbuch: Thunderbirds „Personal Address Book“ heißt wie in Apple Kontakte
// „Contacts“ („Kontakte“) – einmalig und nur, solange der Name noch
// Thunderbirds Vorgabe ist (ein selbst gewählter Name bleibt)
const PAB_URI = "jsaddrbook://abook.sqlite";
const PAB_NAME_PREF = "ldap_2.servers.pab.description";
const PAB_RENAMED_PREF = "extensions.mailcards.pabRenamed";
// gesetzter Name, damit Deaktivieren/Deinstallieren ihn wieder zurücknehmen kann
const PAB_RENAMED_TO_PREF = "extensions.mailcards.pabRenamedTo";

function renamePersonalBookOnce() {
  if (Services.prefs.getBoolPref(PAB_RENAMED_PREF, false)) {
    return;
  }
  try {
    const book = MailServices.ab.getDirectory(PAB_URI);
    if (!book) {
      return;
    }
    let tbDefault = "";
    try {
      tbDefault = Services.strings
        .createBundle("chrome://messenger/locale/addressbook/addressBook.properties")
        .GetStringFromName(PAB_NAME_PREF);
    } catch {} // gewollt: ohne Thunderbirds Namen nur der eigene Vergleich
    if (!Services.prefs.prefHasUserValue(PAB_NAME_PREF) || (tbDefault && book.dirName == tbDefault)) {
      book.dirName = tr("Contacts");
      Services.prefs.setStringPref(PAB_RENAMED_TO_PREF, book.dirName);
      log("adressbuch: persönliches Adressbuch umbenannt", book.dirName);
    }
    Services.prefs.setBoolPref(PAB_RENAMED_PREF, true);
  } catch (e) {
    log("pab rename error", e);
  }
}

// Deaktivieren/Deinstallieren: trägt das Buch noch den von halo.spaces
// gesetzten Namen, wieder Thunderbirds (lokalisierten) Standardnamen nehmen –
// Thunderbird sperrt den Namen dieses Buchs im Dialog „Eigenschaften“
function restorePersonalBookName() {
  try {
    const ours = Services.prefs.getStringPref(PAB_RENAMED_TO_PREF, "");
    if (ours && Services.prefs.getStringPref(PAB_NAME_PREF, "") == ours) {
      Services.prefs.clearUserPref(PAB_NAME_PREF);
      log("adressbuch: Name des persönlichen Adressbuchs zurückgesetzt");
    }
    Services.prefs.clearUserPref(PAB_RENAMED_TO_PREF);
    Services.prefs.clearUserPref(PAB_RENAMED_PREF);
  } catch (e) {
    log("pab rename restore error", e);
  }
}

// Deinstallieren (nicht Deaktivieren oder Update): eigene Einstellungen
// (extensions.mailcards.*) löschen und die einmalig gesetzten Thunderbird-
// Einstellungen zurück auf Thunderbirds Standard, solange sie noch auf dem
// Wert von halo.spaces stehen – eine spätere Neuinstallation verhält sich
// dann wie die erste (vorher übersprangen alte Merker die Ersteinrichtung).
// Liefert die Bereiche, deren Toolbar zurückgesetzt wurde (für den Test)
function cleanupAfterUninstall() {
  const reverted = [];
  const applied = name => Services.prefs.getBoolPref(`extensions.mailcards.${name}`, false);
  const reset = (pref, ours) => {
    try {
      const type = Services.prefs.getPrefType(pref);
      const now = type == Services.prefs.PREF_INT ? Services.prefs.getIntPref(pref)
        : type == Services.prefs.PREF_BOOL ? Services.prefs.getBoolPref(pref) : undefined;
      if (Services.prefs.prefHasUserValue(pref) && now === ours) {
        Services.prefs.clearUserPref(pref);
      }
    } catch (e) {
      log("uninstall reset error", pref, e);
    }
  };
  if (applied("rowcountApplied")) {
    reset("mail.threadpane.cardsview.rowcount", 2);
  }
  if (applied("searchApplied")) {
    reset("gloda.show_as_list_by_default", true);
  }
  if (applied("toolbarApplied")) {
    reset("toolbar.unifiedtoolbar.buttonstyle", 2);
    // Bereiche mit der unveränderten halo.spaces-Anordnung wieder auf
    // Thunderbirds Standard; selbst angepasste bleiben
    try {
      const { getState, storeState } = ChromeUtils.importESModule("resource:///modules/CustomizationState.mjs");
      const { EXTENSION_PREFIX } = ChromeUtils.importESModule("resource:///modules/CustomizableItems.sys.mjs");
      const state = { ...getState() };
      for (const [space, items] of [["mail", OLD_MAIL_TOOLBAR], ...Object.entries({ mail: APPLE_TOOLBAR, ...SPACE_TOOLBARS })]) {
        if (state[space] && items.every((id, i) => state[space][i] == id)
            && state[space].slice(items.length).every(id => id.startsWith(EXTENSION_PREFIX))) {
          delete state[space];
          reverted.push(space);
        }
      }
      if (reverted.length) {
        storeState(state);
      }
    } catch (e) {
      log("uninstall toolbar error", e);
    }
  }
  Services.prefs.getBranch("extensions.mailcards.").deleteBranch("");
  // (ein noch ausstehender Zeitgeber eines Fensters schrieb danach die
  // gemerkte Breite der Seitenleiste neu – kurz darauf noch einmal aufräumen,
  // aber nur, wenn halo.spaces dann nicht schon wieder installiert ist)
  try {
    const { setTimeout: later } = ChromeUtils.importESModule("resource://gre/modules/Timer.sys.mjs");
    const { AddonManager } = ChromeUtils.importESModule("resource://gre/modules/AddonManager.sys.mjs");
    later(async () => {
      if (!(await AddonManager.getAddonByID("mail-cards@sebastian.local"))) {
        Services.prefs.clearUserPref("extensions.mailcards.sidebarWidth");
      }
    }, 2000);
  } catch {} // gewollt: beim Entfernen nur Aufräumen, Fehler ändern nichts
  log("deinstalliert: Einstellungen aufgeräumt");
  return reverted;
}

// Adressbuch: „Collected Addresses“ (automatisch gesammelte Empfänger) nicht
// in der Seitenleiste – Apple Kontakte kennt so etwas nicht (Apple Mail führt
// sie getrennt als „Frühere Empfänger“). Das Adressbuch selbst bleibt, die
// Ergänzung beim Schreiben funktioniert weiter. Einblenden über das „…“-Menü
// der Kontaktliste (wie das persönliche Adressbuch), Standard: ausgeblendet.
const HIDE_COLLECTED_PREF = "extensions.mailcards.hideCollectedAddresses";

function hookCollectedAddresses(cw, restorers) {
  const doc = cw.document;
  const books = cw.booksList;
  if (!books || books.__mcCollected) {
    return;
  }
  books.__mcCollected = true;
  const { MailServices } = ChromeUtils.importESModule("resource:///modules/MailServices.sys.mjs");
  const collected = () => {
    try {
      return MailServices.ab.directories.find(d => d.dirPrefId == "ldap_2.servers.history") || null;
    } catch {
      return null; // gewollt: Adressbücher nicht lesbar, gesammelte nicht markiert
    }
  };
  // abhakbarer Eintrag im „…“-Menü der Kontaktliste, gleich unter dem für
  // das persönliche Adressbuch (hookPersonalBook)
  const menu = doc.getElementById("sortContext");
  let item = null;
  const updateItem = () => {
    const dir = collected();
    item.hidden = !dir;
    item.setAttribute("label", tr("Show Address Book “{name}”", { name: dir?.dirName || "" }));
    item.toggleAttribute("checked", !Services.prefs.getBoolPref(HIDE_COLLECTED_PREF, true));
    const pab = doc.getElementById("mcShowPersonalBook");
    if (pab && pab.nextElementSibling != item) {
      pab.after(item);
    }
  };
  if (menu && !doc.getElementById("mcShowCollected")) {
    item = doc.createXULElement("menuitem");
    item.id = "mcShowCollected";
    item.setAttribute("type", "checkbox");
    item.addEventListener("command", () => {
      // Standard (ausgeblendet) nicht im Profil speichern
      if (item.hasAttribute("checked")) {
        Services.prefs.setBoolPref(HIDE_COLLECTED_PREF, false);
      } else {
        Services.prefs.clearUserPref(HIDE_COLLECTED_PREF);
      }
    });
    menu.append(item);
    menu.addEventListener("popupshowing", updateItem);
    updateItem();
  }
  const mark = () => {
    const hide = Services.prefs.getBoolPref(HIDE_COLLECTED_PREF, true);
    doc.documentElement.toggleAttribute("mc-hide-collected", hide);
    const uid = collected()?.UID || null;
    for (const row of books.querySelectorAll(":scope > li")) {
      row.toggleAttribute("data-mc-collected", !!uid && row.dataset.uid == uid);
    }
    // war das gesammelte Buch gewählt: auf „Alle Adressbücher“ wechseln
    if (hide && books.selectedRow?.hasAttribute("data-mc-collected")) {
      books.selectedIndex = 0;
    }
  };
  const mo = new cw.MutationObserver(mark);
  mo.observe(books, { childList: true });
  const prefObs = () => mark();
  Services.prefs.addObserver(HIDE_COLLECTED_PREF, prefObs);
  mark();
  // Tab geschlossen: Beobachter sofort abmelden (Fenster-Restorer werden
  // dann nur verworfen, nicht ausgeführt)
  const detach = () => {
    mo.disconnect();
    Services.prefs.removeObserver(HIDE_COLLECTED_PREF, prefObs);
  };
  cw.addEventListener("unload", detach, { once: true });
  restorers?.push(() => {
    detach();
    cw.removeEventListener("unload", detach);
    menu?.removeEventListener("popupshowing", updateItem);
    item?.remove();
    doc.documentElement.removeAttribute("mc-hide-collected");
    delete books.__mcCollected;
  });
}

// Adressbuch: das persönliche Adressbuch (ldap_2.servers.pab, lässt sich in
// Thunderbird nicht löschen) in der Seitenleiste ausblenden, solange es leer
// ist – wer Konten (CardDAV) nutzt, braucht es nicht. Ein- und Ausblenden über
// das „…“-Menü der Kontaktliste (Pref, ohne eigene Wahl gilt „leer = aus“).
// Nie ausgeblendet, wenn es das einzige sichtbare Adressbuch ist. Kommt ein
// Kontakt hinein (z. B. über den Stern im Mailkopf), wird es eingeblendet –
// sonst entstünden Kontakte in einem unsichtbaren Buch.
const SHOW_PAB_PREF = "extensions.mailcards.showPersonalAddressBook";

function personalBookState() {
  let pab = null;
  let others = [];
  try {
    const hideCollected = Services.prefs.getBoolPref(HIDE_COLLECTED_PREF, true);
    const dirs = MailServices.ab.directories;
    pab = dirs.find(d => d.URI == PAB_URI) || null;
    others = dirs.filter(d => d.URI != PAB_URI && !(hideCollected && d.dirPrefId == "ldap_2.servers.history"));
  } catch (e) {
    log("address books not readable", e);
  }
  if (!pab) {
    return { pab: null, uid: null, canHide: false, hidden: false };
  }
  const canHide = others.length > 0;
  let shown;
  if (Services.prefs.prefHasUserValue(SHOW_PAB_PREF)) {
    shown = Services.prefs.getBoolPref(SHOW_PAB_PREF, false);
  } else {
    try {
      shown = pab.childCardCount > 0 || pab.childNodes.length > 0;
    } catch {
      shown = true;
    }
  }
  return { pab, uid: pab.UID, canHide, hidden: canHide && !shown };
}

// global: neuer Kontakt oder neue Liste im persönlichen Adressbuch → einblenden
// (als eigene Wahl gemerkt, damit es nicht wieder verschwindet, wenn es leer wird)
function watchPersonalBook(restorers) {
  const obs = {
    observe(_subject, _topic, dirUID) {
      try {
        if (dirUID && dirUID == MailServices.ab.getDirectory(PAB_URI)?.UID && !Services.prefs.getBoolPref(SHOW_PAB_PREF, false)) {
          Services.prefs.setBoolPref(SHOW_PAB_PREF, true);
        }
      } catch (e) {
        log("pab watch error", e);
      }
    },
  };
  const TOPICS = ["addrbook-contact-created", "addrbook-list-created"];
  for (const t of TOPICS) {
    Services.obs.addObserver(obs, t);
  }
  restorers.push(() => {
    for (const t of TOPICS) {
      Services.obs.removeObserver(obs, t);
    }
  });
}

function hookPersonalBook(cw, restorers) {
  const doc = cw.document;
  const books = cw.booksList;
  if (!books || books.__mcPersonal) {
    return;
  }
  books.__mcPersonal = true;
  const mark = () => {
    const { uid, hidden } = personalBookState();
    for (const row of books.querySelectorAll(":scope > li")) {
      row.toggleAttribute("data-mc-pab-hidden", hidden && !!uid && row.dataset.uid == uid);
    }
    // war es (oder eine seiner Listen) gewählt: auf „Alle Adressbücher“ wechseln
    if (hidden && books.selectedRow?.closest("li[data-mc-pab-hidden]")) {
      books.selectedIndex = 0;
    }
    if (item) {
      updateItem();
    }
  };
  // abhakbarer Eintrag im „…“-Menü, Abschnitt „View“
  const menu = doc.getElementById("sortContext");
  let item = null;
  const updateItem = () => {
    const { pab, canHide, hidden } = personalBookState();
    item.hidden = !pab;
    item.setAttribute("label", tr("Show Address Book “{name}”", { name: pab?.dirName || "" }));
    item.toggleAttribute("checked", !hidden);
    item.toggleAttribute("disabled", !canHide);
  };
  if (menu && !doc.getElementById("mcShowPersonalBook")) {
    item = doc.createXULElement("menuitem");
    item.id = "mcShowPersonalBook";
    item.setAttribute("type", "checkbox");
    item.addEventListener("command", () => {
      Services.prefs.setBoolPref(SHOW_PAB_PREF, item.hasAttribute("checked"));
    });
    const after = doc.getElementById("mcHideDuplicates");
    if (after) {
      after.after(item);
    } else {
      menu.append(item);
    }
    menu.addEventListener("popupshowing", updateItem);
    updateItem();
  }
  const mo = new cw.MutationObserver(mark);
  mo.observe(books, { childList: true });
  const prefObs = () => mark();
  Services.prefs.addObserver(SHOW_PAB_PREF, prefObs);
  Services.prefs.addObserver(HIDE_COLLECTED_PREF, prefObs);
  mark();
  // Tab geschlossen: Beobachter sofort abmelden (siehe hookCollectedAddresses)
  const detach = () => {
    mo.disconnect();
    Services.prefs.removeObserver(SHOW_PAB_PREF, prefObs);
    Services.prefs.removeObserver(HIDE_COLLECTED_PREF, prefObs);
  };
  cw.addEventListener("unload", detach, { once: true });
  restorers?.push(() => {
    detach();
    cw.removeEventListener("unload", detach);
    menu?.removeEventListener("popupshowing", updateItem);
    item?.remove();
    for (const row of books.querySelectorAll("li[data-mc-pab-hidden]")) {
      row.removeAttribute("data-mc-pab-hidden");
    }
    delete books.__mcPersonal;
  });
}

// Adressbuch: „All Address Books“ heißt wie in Apple Kontakte „All Contacts“ („Alle Kontakte“);
// Thunderbird setzt den Text über Fluent, deshalb wird er bei jeder Änderung neu gesetzt
function hookAllContactsLabel(cw, restorers) {
  const doc = cw.document;
  const nameEl = doc.querySelector("#allAddressBooks .bookRow-name");
  if (!nameEl || nameEl.__mcAllContacts) {
    return;
  }
  nameEl.__mcAllContacts = { l10n: nameEl.getAttribute("data-l10n-id") };
  const apply = () => {
    nameEl.removeAttribute("data-l10n-id");
    const text = tr("All Contacts");
    if (nameEl.textContent != text) {
      nameEl.textContent = text;
    }
  };
  const mo = new cw.MutationObserver(apply);
  mo.observe(nameEl, { childList: true, characterData: true, subtree: true, attributes: true, attributeFilter: ["data-l10n-id"] });
  apply();
  restorers?.push(() => {
    mo.disconnect();
    const { l10n } = nameEl.__mcAllContacts;
    delete nameEl.__mcAllContacts;
    if (l10n) {
      nameEl.setAttribute("data-l10n-id", l10n);
      doc.l10n?.translateElements([nameEl]);
    }
  });
}

// Adressbuch wie Apple Kontakte: nie eine Kontaktliste ohne gewählten Kontakt.
// Beim Öffnen und nach jedem Neuaufbau der Liste (Buchwechsel, Suche, Löschen)
// den zuletzt gewählten Kontakt wieder wählen, sonst den ersten Kontakt aus
// einem sichtbaren Adressbuch. Gemerkt wird nur, was der Nutzer selbst wählt.
const LAST_CONTACT_PREF = "extensions.mailcards.lastContact";

function hookLastContact(cw, restorers) {
  const pane = cw.detailsPane;
  const books = cw.booksList;
  const list = cw.cardsPane?.cardsList;
  if (!pane || !books || !list || typeof pane.displayCards != "function" || pane.__mcLastContact) {
    return;
  }
  pane.__mcLastContact = true;
  let own = false;
  let initial = true;
  let timer = null;
  const bookVisible = uid => {
    const row = uid && books.querySelector(`:scope > li[data-uid="${uid}"]`);
    return !row || cw.getComputedStyle(row).display != "none";
  };
  const remember = () => {
    if (own) {
      return;
    }
    try {
      const idx = list.selectedIndices;
      const card = idx.length == 1 ? list.view?.getCardFromRow(idx[0]) : null;
      if (card?.UID) {
        Services.prefs.setStringPref(LAST_CONTACT_PREF, `${card.directoryUID || ""} ${card.UID}`);
      }
    } catch (e) {
      log("last contact save error", e);
    }
  };
  const ensure = () => {
    timer = null;
    try {
      const view = list.view;
      if (pane.isEditing || !view || list.selectedIndices.length) {
        initial = false;
        return;
      }
      const n = view.rowCount || 0;
      const [dirUID, cardUID] = Services.prefs.getStringPref(LAST_CONTACT_PREF, "").split(" ");
      let index = -1;
      for (let i = 0; cardUID && i < n; i++) {
        if (view.getCardFromRow(i)?.UID == cardUID) {
          index = i;
          break;
        }
      }
      // beim Öffnen: steht der Kontakt nicht im gewählten Buch, in sein Buch wechseln
      if (index < 0 && initial && dirUID && books.selectedIndex != 0) {
        initial = false;
        const bi = books.getIndexForUID?.(dirUID) ?? -1;
        if (bi > 0 && bi != books.selectedIndex && bookVisible(dirUID)) {
          books.selectedIndex = bi;
          return;
        }
      }
      initial = false;
      if (index < 0) {
        // Rückfall: erster Kontakt aus einem sichtbaren Adressbuch
        for (let i = 0; i < n; i++) {
          if (bookVisible(view.getCardFromRow(i)?.directoryUID)) {
            index = i;
            break;
          }
        }
      }
      if (index < 0 && n) {
        index = 0;
      }
      if (index >= 0) {
        own = true;
        try {
          list.selectedIndex = index;
        } finally {
          own = false;
        }
      }
    } catch (e) {
      log("last contact error", e);
    }
  };
  const schedule = () => {
    if (!timer) {
      timer = cw.setTimeout(ensure, 0);
    }
  };
  const origDisplay = pane.displayCards;
  pane.displayCards = function (cards = [], ...rest) {
    const result = origDisplay.call(this, cards, ...rest);
    if (!cards?.length) {
      schedule();
    }
    return result;
  };
  list.addEventListener("select", remember);
  schedule();
  restorers?.push(() => {
    pane.displayCards = origDisplay;
    list.removeEventListener("select", remember);
    if (timer) {
      cw.clearTimeout(timer);
    }
    delete pane.__mcLastContact;
  });
}

// Kontaktfoto wie Apple Kontakte: im Fotodialog jederzeit ein anderes Bild wählen
// („Choose…“, öffnet Thunderbirds Dateifeld), Ausschnitt rund mit Zoom-Regler
// darunter (vergrößert/verkleinert um die Mitte; verschieben per Ziehen wie bisher)
function hookPhotoDialog(cw, restorers = null) {
  const pd = cw.photoDialog;
  const doc = cw.document;
  const dialog = doc.getElementById("photoDialog");
  if (!pd || !dialog || ownedElement(doc, "mcPhotoChoose")) {
    return;
  }
  pd.init?.();
  const X = "http://www.w3.org/1999/xhtml";
  const choose = doc.createElementNS(X, "button");
  choose.id = "mcPhotoChoose";
  choose.__mcOwner = HOOK_OWNER;
  choose.className = "button";
  choose.type = "button";
  choose.textContent = tr("Choose…");
  // (ESR 153 hat noch keine Datei-Eingabe, dort öffnet _showFilePicker die Auswahl)
  choose.addEventListener("click", () => (pd._inputTarget ? pd._inputTarget.click() : pd._showFilePicker?.()));
  const menu = dialog.querySelector(".dialog-menu-container");
  menu?.prepend(choose);
  const zoom = doc.createElementNS(X, "input");
  zoom.id = "mcPhotoZoom";
  zoom.type = "range";
  zoom.min = "0";
  zoom.max = "100";
  zoom.value = "0";
  zoom.setAttribute("aria-label", tr("Zoom"));
  const svg = dialog.querySelector("svg");
  svg?.after(zoom);
  const smallSide = () => Math.min(pd._previewRect?.width || 0, pd._previewRect?.height || 0);
  // Regler 0 = größter Ausschnitt (ganzes Bild), 100 = 4-fach vergrößert
  const sizeFor = v => smallSide() / (1 + 3 * (v / 100));
  const valueFor = size => Math.round(Math.max(0, Math.min(100, ((smallSide() / size) - 1) / 3 * 100)));
  zoom.addEventListener("input", () => {
    const r = pd._cropRect;
    if (!r || !pd._previewRect) {
      return;
    }
    const size = sizeFor(Number(zoom.value));
    const cx = r.x + r.width / 2, cy = r.y + r.height / 2;
    r.width = r.height = size;
    r.x = Math.max(0, Math.min(pd._previewRect.width - size, cx - size / 2));
    r.y = Math.max(0, Math.min(pd._previewRect.height - size, cy - size / 2));
    pd._redrawCropRect();
  });
  // runder Ausschnitt statt Quadrat, Regler folgt der Größe
  const origRedraw = pd._redrawCropRect;
  pd._redrawCropRect = function (...args) {
    const result = origRedraw.apply(this, args);
    try {
      const { x, y, width } = this._cropRect;
      const rad = width / 2, cx = x + rad, cy = y + rad;
      this._cropMask.setAttribute("fill-rule", "evenodd");
      this._cropMask.setAttribute("d",
        `M0 0H${this._previewRect.width}V${this._previewRect.height}H0Z M${cx - rad} ${cy}a${rad} ${rad} 0 1 0 ${2 * rad} 0a${rad} ${rad} 0 1 0 ${-2 * rad} 0Z`);
      this._dragRect.setAttribute("rx", rad);
      this._dragRect.setAttribute("ry", rad);
      if (doc.activeElement != zoom) {
        zoom.value = String(valueFor(width));
      }
    } catch {} // gewollt: Zuschnitt-Dialog anders aufgebaut, Thunderbirds Darstellung bleibt
    return result;
  };
  // Regler nur, wenn ein Bild zum Zuschneiden da ist
  const sync = () => (zoom.hidden = !!svg?.hasAttribute("hidden"));
  const mo = new cw.MutationObserver(sync);
  if (svg) {
    mo.observe(svg, { attributes: true, attributeFilter: ["hidden"] });
  }
  sync();
  restorers?.push(() => {
    mo.disconnect();
    choose.remove();
    zoom.remove();
    pd._redrawCropRect = origRedraw;
  });
}

// Import und Archiv in api/import.js: Outlook-Datendatei lesen (PstFs,
// PstImport) und Konto lokal archivieren (ArchiveAccount, hookArchiveAccount)
// – hier geladen, damit die Reihenfolge bleibt
loadPart("import.js");

// Kontextmenü der Ordnerliste: „Run Spam Controls“ und „Mark as Read by Date…“
// – sie standen nur in der Menüleiste (Tools bzw. Message › Mark)
function hookFolderContextExtras(a3, restorers) {
  const doc = a3.document;
  const popup = doc.getElementById("folderPaneContext");
  const anchor = doc.getElementById("folderPaneContext-markMailFolderAllRead");
  const mailWin = a3.browsingContext?.topChromeWindow;
  if (!popup || !anchor || !mailWin || doc.getElementById("mcFolderJunk")) {
    return;
  }
  const make = (id, sourceId, command, label = null) => {
    const src = mailWin.document.getElementById(sourceId);
    const item = doc.createXULElement("menuitem");
    item.id = id;
    item.setAttribute("label", label || src?.getAttribute("label") || id);
    item.addEventListener("command", () => {
      const folder = a3.folderPaneContextMenu?.activeFolder;
      if (folder && folder != a3.gFolder) {
        a3.displayFolder(folder);
      }
      a3.setTimeout(() => a3.commandController?.doCommand(command), 0);
    });
    return item;
  };
  const byDate = make("mcFolderReadByDate", "menu_markReadByDate", "cmd_markReadByDate");
  const junk = make("mcFolderJunk", "runJunkControls", "cmd_runJunkControls");
  // Thunderbirds Menü „Tools“ blendet halo.spaces aus: Filter auf den ganzen
  // Ordner und „Spam löschen“ (nur beim Spam-Ordner, wie Apple Mail) hier
  // Thunderbirds Nachrichtenfilter heißen wie in Apple Mail Regeln
  const filters = make("mcFolderRunFilters", "applyFilters", "cmd_applyFilters", tr("Apply Rules"));
  const eraseJunk = make("mcFolderEraseJunk", "deleteJunk", "cmd_deleteJunk", tr("Erase Junk Mail"));
  anchor.after(byDate, junk, filters, eraseJunk);
  // „On My Mac“ lässt sich nicht ausblenden: wie Apple Mail erscheint es von
  // selbst, sobald darin etwas liegt (decorateFolders)
  const onShow = event => {
    if (event.target != popup) {
      return;
    }
    const folder = a3.folderPaneContextMenu?.activeFolder;
    const mail = !!folder && !folder.isServer && !folder.getFlag(Ci.nsMsgFolderFlags.Virtual);
    byDate.hidden = !mail;
    junk.hidden = !mail || folder.server?.type == "nntp" || folder.server?.type == "rss";
    filters.hidden = !mail || !folder.server?.canHaveFilters;
    eraseJunk.hidden = junk.hidden || !folder.getFlag(Ci.nsMsgFolderFlags.Junk);
  };
  popup.addEventListener("popupshowing", onShow);
  restorers.push(() => {
    popup.removeEventListener("popupshowing", onShow);
    byDate.remove();
    junk.remove();
    filters.remove();
    eraseJunk.remove();
  });
}

// Kontextmenüs ohne „In neuem Tab/Fenster öffnen“ (alle Bereiche; Punkte per CSS
// ausgeblendet). Danach stünden Trennlinien doppelt oder am Rand – beim Öffnen
// aufräumen; ein Menü ohne sichtbare Einträge öffnet sich gar nicht erst
const NEW_TAB_POPUPS = ["folderPaneContext", "mailContext", "otherActionsPopup", "spacesContextMenu", "tabContextMenu"];
function tidyMenuSeparators(popup) {
  const shown = el => !el.hidden && el.getAttribute("collapsed") != "true" && el.ownerDocument.defaultView.getComputedStyle(el).display != "none";
  let last = null, any = false;
  for (const el of popup.children) {
    if (el.localName == "menuseparator") {
      el.toggleAttribute("mc-tidy-hidden", !last || last.localName == "menuseparator");
      if (!el.hasAttribute("mc-tidy-hidden")) {
        last = el;
      }
    } else if (shown(el)) {
      last = el;
      any = true;
    }
  }
  // Trennlinie am Ende
  if (last?.localName == "menuseparator") {
    last.setAttribute("mc-tidy-hidden", "");
  }
  return any;
}
function hookNewTabMenus(doc, restorers = null) {
  for (const id of NEW_TAB_POPUPS) {
    const popup = doc.getElementById(id);
    if (!popup || popup.__mcTidy === HOOK_OWNER) {
      continue;
    }
    popup.__mcTidy = HOOK_OWNER;
    const onShowing = event => {
      if (event.target != popup) {
        return;
      }
      // nach Thunderbirds eigenem onpopupshowing (Attribut, läuft zuerst)
      if (!tidyMenuSeparators(popup)) {
        event.preventDefault();
      }
    };
    // Thunderbird blendet manche Einträge erst danach aus (Ordnermenü) – nochmals aufräumen
    const onShown = event => {
      if (event.target == popup) {
        tidyMenuSeparators(popup);
      }
    };
    popup.addEventListener("popupshowing", onShowing);
    popup.addEventListener("popupshown", onShown);
    restorers?.push(() => {
      popup.removeEventListener("popupshowing", onShowing);
      popup.removeEventListener("popupshown", onShown);
      delete popup.__mcTidy;
      popup.querySelectorAll("[mc-tidy-hidden]").forEach(el => el.removeAttribute("mc-tidy-hidden"));
    });
  }
}

// Termin-Fenster wie Apple Kalender: Karten untereinander – Titel; Ganztägig,
// Beginn, Ende, Wiederholung, Erinnerung (mit Beschriftung rechtsbündig); Ort;
// Teilnehmer; Kalender; Kategorie; ganz unten die Notiz („Add Notes or URL“).
// Links ein Streifen in der Farbe des gewählten Kalenders. Thunderbirds Zeilen
// werden nur umgestellt – Felder, IDs und Logik bleiben (nur für Termine, nicht Aufgaben)
// „Show List Info“ im Bereich Aufgaben öffnet Thunderbirds Eigenschaften des
// Kalenders mit Listen-Bezeichnungen: Titel „List Info“, „Name:“, „Enable This
// List“; die Benachrichtigungen über anstehende Termine entfallen
function listInfoDialog(dw) {
  try {
    const d = dw.document;
    const set = (el, attr, text) => {
      if (el) {
        el.removeAttribute("data-l10n-id");
        el.setAttribute(attr, text);
      }
    };
    d.querySelector("title")?.removeAttribute("data-l10n-id");
    d.title = tr("List Info");
    d.documentElement.setAttribute("mc-list-info", "");
    set(d.getElementById("calendar-name-label"), "value", tr("Name"));
    set(d.getElementById("calendar-enabled-checkbox"), "label", tr("Enable This List"));
    const notes = d.getElementById("calendar-notifications");
    if (notes) {
      notes.hidden = true;
      if (notes.previousElementSibling?.localName == "separator") {
        notes.previousElementSibling.hidden = true;
      }
    }
  } catch (e) {
    log("list info dialog", e);
  }
}

// Dialogfenster: macOS dehnt ein Fenster per Doppelklick auf die linke bzw.
// rechte Kante bis zum Bildschirmrand aus, findet danach aber nicht zurück.
// Ein Doppelklick an der Kante eines schon breiteren Dialogs setzt ihn auf
// seine Standardbreite (wie beim Öffnen gemessen) zurück; die andere Kante
// bleibt stehen. Hauptfenster (Mail, Verfassen, Nachricht) nicht
const EDGE_RESET_SKIP = new Set(["mail:3pane", "msgcompose", "mail:messageWindow", "mail:addressbook", "mail:extensionPopup"]);
function dialogEdgeReset(win, url) {
  if (!win || win.__mcEdgeReset || win.parent != win || !url.startsWith("chrome://") || !win.opener) {
    return;
  }
  win.__mcEdgeReset = true;
  let standard = 0;
  let wideAtDown = false;
  win.addEventListener("load", () => {
    if (EDGE_RESET_SKIP.has(win.document.documentElement.getAttribute("windowtype"))) {
      return;
    }
    // nach Thunderbirds eigenem Messen und unseren Anpassungen der Größe
    win.setTimeout(() => {
      standard = win.outerWidth;
    }, 1500);
    // die äußersten 3–4 px behält macOS selbst (Größe ändern) – Doppelklicks
    // dort kommen nie an, daher ein etwas breiterer Streifen nach innen
    const EDGE = 12;
    // über Bildschirmkoordinaten: an der Kante liegt oft ein eingebetteter
    // Inhalt (Terminfenster), dessen Ereignisse nur am Fenster-Wurzelobjekt
    // (windowRoot) ankommen, mit Koordinaten relativ zu diesem Inhalt
    const atEdge = event => {
      const x = event.screenX - win.mozInnerScreenX;
      return x <= EDGE ? "left" : (x >= win.innerWidth - EDGE ? "right" : null);
    };
    const root = win.windowRoot || win;
    root.addEventListener("mousedown", event => {
      // Breite vor dem Doppelklick: ein Doppelklick auf einen Dialog in
      // Standardbreite gehört macOS (Ausdehnen), nicht uns
      if (event.detail == 1) {
        wideAtDown = standard && win.outerWidth > standard + 2;
      }
    }, true);
    root.addEventListener("dblclick", event => {
      const side = atEdge(event);
      if (!side || !wideAtDown || !standard) {
        return;
      }
      const right = win.screenX + win.outerWidth;
      win.resizeTo(standard, win.outerHeight);
      if (side == "left") {
        win.moveTo(right - standard, win.screenY);
      }
    }, true);
  }, { once: true });
}

// Großer Termin-/Aufgaben-Dialog beim Anlegen: oben der Umschalter
// „Event | Task“ wie im Schnell-Dialog. Umschalten legt den neuen Eintrag
// als die andere Art an (Titel, Datum und Kalender bleiben) – ohne Rückfrage,
// es ist ja noch nichts gespeichert. Beim Bearbeiten gibt es ihn nicht
function addTypeSwitch(iw) {
  const dlg = iw.parent;
  const doc = dlg?.document;
  if (!doc || iw.mode != "new" || doc.getElementById("mcTypeSwitch") || !dlg.location.href.startsWith("chrome://calendar/content/calendar-event-dialog.xhtml")) {
    return;
  }
  const isEvent = !!iw.calendarItem?.isEvent?.();
  const X = "http://www.w3.org/1999/xhtml";
  const seg = doc.createElementNS(X, "div");
  seg.id = "mcTypeSwitch";
  seg.className = "mc-qc-seg";
  const make = (mode, label) => {
    const b = doc.createElementNS(X, "button");
    b.type = "button";
    b.textContent = tr(label);
    b.toggleAttribute("selected", (mode == "event") == isEvent);
    b.addEventListener("click", () => {
      if ((mode == "event") == isEvent) {
        return;
      }
      const main = Services.wm.getMostRecentWindow("mail:3pane");
      if (!main) {
        return;
      }
      const title = iw.document.getElementById("item-title")?.value || "";
      let calendar = null;
      try {
        calendar = iw.getCurrentCalendar?.() || iw.calendarItem?.calendar || null;
      } catch {} // gewollt: Fenster ohne Kalenderwahl
      const start = iw.gStartTime?.clone?.() || null;
      const end = iw.gEndTime?.clone?.() || null;
      // ohne „Änderungen speichern?“ schließen
      iw.gConfirmCancel = false;
      dlg.close();
      main.setTimeout(() => {
        if (mode == "task") {
          (main.createTodoWithDialog.__mcOrig || main.createTodoWithDialog)(calendar, null, title, null, start);
        } else {
          main.createEventWithDialog(calendar, start, end, title);
        }
      }, 0);
    });
    return b;
  };
  seg.append(make("event", "Event"), make("task", "Task"));
  const iframe = doc.getElementById("calendar-item-panel-iframe");
  iframe?.before(seg);
  doc.documentElement.setAttribute("mc-type-switch", "");
  // das Fenster wächst um den Umschalter – sonst fehlt der Platz unten bei den Notizen
  dlg.requestAnimationFrame(() => {
    const cs = dlg.getComputedStyle(seg);
    const h = Math.ceil(seg.getBoundingClientRect().height + parseFloat(cs.marginTop) + parseFloat(cs.marginBottom));
    if (h > 0 && h < 120) {
      dlg.resizeBy(0, h);
    }
  });
}

// Kalender-Hilfen in api/kalender.js: Mehrwochen-Ansicht (hookMultiweekScroll,
// hookMultiweekBuffer), Termin-Dialog (appleEventLayout, Zeit- und Datumsfelder),
// Kalender-Emoji (emojiFor) und Schnellfenster-Erkennung (parseNatural) – hier
// geladen, damit die Reihenfolge bleibt
loadPart("kalender.js");

// Einstellungen → halo.spaces öffnen (Info-Fenster, Begrüßung): Thunderbird
// springt beim Öffnen sofort zur Kategorie, die gibt es erst kurz danach
async function openHaloSettings(w, pane = HALO_PANE) {
  // (das Versprechen von openPreferencesTab erfüllt sich nur bei einem neuen
  // Tab – ist schon einer offen, wechselt Thunderbird nur dorthin)
  w.openPreferencesTab?.("paneGeneral");
  const prefsWindow = () => {
    const tab = w.document.getElementById("tabmail")?.currentTabInfo;
    return tab?.mode?.name == "preferencesTab" ? tab.browser?.contentWindow : null;
  };
  let pw = null;
  for (let i = 0; i < 80 && !(pw = prefsWindow())?.document?.getElementById("mcCat-" + pane); i++) {
    await new Promise(r => setTimeout(r, 100));
  }
  pw?.gotoPref?.(pane);
}

// Thunderbird-Seite (Kontoeinstellungen, Add-ons) über der Inhaltsfläche des
// Einstellungs-Tabs: eigener Browser wie in ihrem eigenen Tab
function embedPage(host, src) {
  const cdoc = host.ownerDocument;
  host.classList.add("mc-embed-host");
  const browserEl = cdoc.createXULElement("browser");
  browserEl.className = "mc-embed-page";
  browserEl.setAttribute("type", "content");
  browserEl.setAttribute("disableglobalhistory", "true");
  browserEl.setAttribute("src", src);
  browserEl.hidden = true;
  if (src == "about:addons") {
    // ohne frühere Wahl die Liste der Erweiterungen statt der Empfehlungen (lädt aus dem Netz)
    const onLoad = () => {
      const aw = browserEl.contentWindow;
      if (!aw?.promiseInitialized) {
        return; // erst das leere Startdokument
      }
      browserEl.removeEventListener("load", onLoad, true);
      aw.promiseInitialized.then(() => {
        // (Thunderbird merkt sich die Empfehlungen selbst als zuletzt gewählt)
        if (aw.gViewController?.currentViewId?.startsWith("addons://discover")) {
          aw.gViewController.loadView("addons://list/extension");
        }
        // „Plugins“ ohne Plugins führt bei Thunderbird auf die Empfehlungen –
        // dann wie die übrigen leeren Arten ausblenden (auch in den Unterpunkten)
        const { AddonManager } = ChromeUtils.importESModule("resource://gre/modules/AddonManager.sys.mjs");
        AddonManager.getAddonsByTypes(["plugin"]).then(list => {
          const btn = aw.document?.querySelector("categories-box moz-page-nav-button[view='plugin'], categories-box .category[viewid='addons://list/plugin']");
          if (btn) {
            btn.hidden = !list.length;
          }
        }).catch(e => log("plugins error", e));
      });
    };
    browserEl.addEventListener("load", onLoad, true);
  }
  // Merkmal fürs CSS: eingebettet (Links zurück zu den Einstellungen ausblenden)
  browserEl.addEventListener("DOMContentLoaded", () => {
    browserEl.contentDocument?.documentElement?.setAttribute("mc-embedded", "");
  }, true);
  host.append(browserEl);
  return browserEl;
}

// Unterpunkte der eingebetteten Seite (Konten mit ihren Seiten bzw.
// Extensions, Themes …) eingerückt unter ihrer Kategorie in der Seitenleiste
// der Einstellungen – wie die übrigen Kategorien ohne zweite Leiste dazwischen.
// Die Leiste der Seite selbst bleibt im Dokument (blendet nur das CSS aus),
// gewählt wird weiter über sie.
const ADDON_VIEWS = { discover: "addons://discover/", "available-updates": "addons://updates/available", "recent-updates": "addons://updates/recent" };
const SUBNAV = {
  "about:addons": d => {
    const box = d.querySelector("categories-box");
    if (!box) {
      return null;
    }
    const aw = d.defaultView;
    // Thunderbird 140+: moz-page-nav-button[view], 128: button.category[viewid]
    const entries = [...box.querySelectorAll("moz-page-nav-button[view], .category[viewid]")].filter(b => !b.hidden).map(b => {
      const view = b.getAttribute("viewid") || ADDON_VIEWS[b.getAttribute("view")] || `addons://list/${b.getAttribute("view")}`;
      return {
        label: (b.querySelector(".category-name, span[data-l10n-id]") || b).textContent.trim(),
        current: !!(b.selected || b.hasAttribute("selected")),
        level: 1,
        go: () => aw.gViewController?.loadView(view),
      };
    });
    return { watch: box, entries };
  },
  "about:accountsettings": d => {
    const tree = d.getElementById("accounttree");
    if (!tree?.children.length) {
      return null;
    }
    const sel = tree.selectedRow || tree.querySelector("li.selected");
    const pick = li => {
      const top = li.parentNode.closest("li");
      if (top?.classList.contains("collapsed")) {
        tree.expandRow(top);
      }
      const i = tree.rows.indexOf(li);
      if (i >= 0) {
        tree.selectedIndex = i;
      }
    };
    const name = li => li.querySelector(":scope > .container .name")?.textContent.trim() || li.title || "";
    const entries = [];
    // Konten in Thunderbirds aktueller Reihenfolge (auch nach Ziehen in der
    // Ordnerliste, Thunderbirds Kontenbaum sortiert dann nicht neu), der
    // Postausgangs-Server bleibt am Ende
    const order = MailServices.accounts.accounts.map(a => a.key);
    const lis = [...tree.querySelectorAll(":scope > li")];
    const rank = li => order.includes(li.id) ? order.indexOf(li.id) : order.length + lis.indexOf(li);
    lis.sort((a, b) => rank(a) - rank(b));
    for (const li of lis) {
      entries.push({ label: name(li), current: li == sel, level: 1, go: () => pick(li), account: order.includes(li.id) ? li.id : null });
      // Seiten eines Kontos nur beim gewählten Konto (wie aufgeklappt)
      if (sel && li.contains(sel)) {
        for (const kid of li.querySelectorAll(":scope > ul > li")) {
          entries.push({ label: name(kid), current: kid == sel, level: 2, go: () => pick(kid) });
        }
      }
    }
    // „Konto hinzufügen“ (128: „Kontenaktionen“) öffnet Thunderbirds Menü an diesem Eintrag
    const btn = d.getElementById("accountTreeCreateAccount") || d.getElementById("accountActionsButton");
    const popup = d.getElementById("accountAddPopup") || d.getElementById("accountActionsDropdown");
    const label = (btn?.textContent || btn?.getAttribute("label") || "").trim();
    if (popup && label) {
      entries.push({ label: label + "…", level: 1, action: true, go: el => {
        const cw = el.ownerDocument.defaultView, r = el.getBoundingClientRect();
        // Menüs gehen in Inhalts-Browsern nur mit Fokus auf
        d.defaultView.browsingContext.embedderElement?.focus();
        popup.openPopupAtScreen(Math.round(cw.mozInnerScreenX + r.left), Math.round(cw.mozInnerScreenY + r.bottom), false);
      } });
    }
    return { watch: tree, entries };
  },
};
// Konten per Ziehen umsortieren (Einstellungen-Seitenleiste und Ordnerliste),
// wie Apple Mail die Konten in der Seitenleiste: rowOf(Ziel, Start) liefert die
// Zeile eines Kontos, keyOf(Zeile) dessen Schlüssel (nur ziehbare Konten),
// targetKeyOf auch für Zeilen, die nur Ziel sein dürfen („Lokale Ordner“).
// Beim Ablegen gilt Thunderbirds Kontoreihenfolge (mail.accountmanager.accounts)
const ACCOUNTS_ORDERED_PREF = "extensions.mailcards.accountsOrdered";
function accountReorder(container, rowOf, keyOf, targetKeyOf = keyOf) {
  let dragging = null, marked = null;
  const unmark = () => {
    marked?.removeAttribute("mc-drop");
    marked = null;
  };
  const onStart = ev => {
    const row = rowOf(ev.target, true);
    const key = row && keyOf(row);
    if (!key) {
      return;
    }
    // Thunderbirds eigene Behandlung (Ordner ziehen, Server ablehnen) überspringen
    ev.stopPropagation();
    dragging = key;
    ev.dataTransfer?.setData("text/x-mc-account", key);
    if (ev.dataTransfer) {
      ev.dataTransfer.effectAllowed = "move";
    }
  };
  const target = ev => {
    const row = rowOf(ev.target);
    const key = row && targetKeyOf(row);
    if (!key) {
      return null;
    }
    const r = row.getBoundingClientRect();
    return { row, key, after: ev.clientY > r.top + r.height / 2 };
  };
  const onOver = ev => {
    if (!dragging) {
      return;
    }
    ev.stopPropagation();
    ev.preventDefault();
    if (ev.dataTransfer) {
      ev.dataTransfer.dropEffect = "move";
    }
    const t = target(ev);
    if (t?.row != marked) {
      unmark();
    }
    if (t && t.key != dragging) {
      marked = t.row;
      marked.setAttribute("mc-drop", t.after ? "after" : "before");
    }
  };
  const onDrop = ev => {
    if (!dragging) {
      return;
    }
    ev.stopPropagation();
    ev.preventDefault();
    const t = target(ev);
    const key = dragging;
    dragging = null;
    unmark();
    if (!t || t.key == key) {
      return;
    }
    try {
      const keys = MailServices.accounts.accounts.map(a => a.key).filter(k => k != key);
      // beim ersten Mal stehen „Lokale Ordner“ wie angezeigt vorn
      let local = null;
      try {
        local = MailServices.accounts.findAccountForServer(MailServices.accounts.localFoldersServer)?.key;
      } catch {} // gewollt: ohne „Lokale Ordner“
      if (local && local != key && !Services.prefs.getBoolPref(ACCOUNTS_ORDERED_PREF, false)) {
        keys.splice(keys.indexOf(local), 1);
        keys.unshift(local);
      }
      const i = keys.indexOf(t.key);
      if (i < 0) {
        return;
      }
      keys.splice(t.after ? i + 1 : i, 0, key);
      // ab jetzt gilt die eigene Reihenfolge auch für „Lokale Ordner“
      Services.prefs.setBoolPref(ACCOUNTS_ORDERED_PREF, true);
      MailServices.accounts.reorderAccounts(keys);
    } catch (e) {
      log("account reorder error", e);
    }
  };
  const onEnd = ev => {
    if (dragging) {
      ev.stopPropagation();
    }
    dragging = null;
    unmark();
  };
  const onLeave = ev => {
    if (dragging && !container.contains(ev.relatedTarget)) {
      unmark();
    }
  };
  const handlers = { dragstart: onStart, dragover: onOver, drop: onDrop, dragend: onEnd, dragleave: onLeave };
  for (const [type, fn] of Object.entries(handlers)) {
    container.addEventListener(type, fn, true);
  }
  return () => {
    for (const [type, fn] of Object.entries(handlers)) {
      container.removeEventListener(type, fn, true);
    }
    unmark();
  };
}
function attachSubnav(list, browserEl, src) {
  const read = SUBNAV[src];
  const cdoc = list.ownerDocument;
  let observed = null, timer = 0;
  const mo = new cdoc.defaultView.MutationObserver(() => schedule());
  const render = () => {
    timer = 0;
    const d = browserEl.contentDocument;
    const nav = d && read(d);
    if (nav && nav.watch != observed) {
      mo.disconnect();
      // Inhalt, Übersetzung, Auswahl (Klasse/hidden) und neu aufgebaute Konten
      mo.observe(nav.watch, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ["class", "hidden", "selected"] });
      observed = nav.watch;
    }
    const rows = (nav?.entries || []).filter(e => e.label).map(e => {
      const row = cdoc.createElementNS("http://www.w3.org/1999/xhtml", "div");
      row.className = "mc-subcat" + (e.action ? " mc-subcat-action" : "");
      row.setAttribute("level", e.level);
      row.setAttribute("role", "button");
      row.tabIndex = 0;
      row.toggleAttribute("current", !!e.current);
      row.title = e.label;
      row.textContent = e.label;
      if (e.account) {
        row.dataset.account = e.account;
        row.draggable = true;
      }
      row.addEventListener("click", () => e.go(row));
      row.addEventListener("keydown", ev => {
        if (ev.key == "Enter" || ev.key == " ") {
          ev.preventDefault();
          e.go(row);
        }
      });
      return row;
    });
    list.replaceChildren(...rows);
    list.previousElementSibling?.classList.toggle("mc-has-current", rows.some(r => r.hasAttribute("current")));
  };
  const schedule = () => {
    timer ||= cdoc.defaultView?.setTimeout(render, 30) || 0;
  };
  // Thunderbird 140+ setzt die Auswahl der Add-ons nur als Eigenschaft
  const onView = () => schedule();
  browserEl.addEventListener("load", schedule, true);
  browserEl.addEventListener("view-selected", onView, true);
  browserEl.addEventListener("select", onView, true);
  // Konten per Ziehen umsortieren; neue Reihenfolge (auch aus der Ordnerliste) neu zeichnen
  const prefObs = { observe: () => schedule() };
  Services.prefs.addObserver("mail.accountmanager.accounts", prefObs);
  // angemeldete Unterlisten am Hauptfenster (für den automatischen Test)
  const mainWin = browserEl.ownerDocument.defaultView;
  mainWin.__mcSubnavLive = (mainWin.__mcSubnavLive || 0) + 1;
  // Seiten des gewählten Kontos (Stufe 2) zählen als Ziel zu ihrem Konto
  const accountRow = el => {
    let row = el?.closest?.(".mc-subcat");
    while (row?.getAttribute("level") == "2") {
      row = row.previousElementSibling;
    }
    return row;
  };
  const undrag = accountReorder(list, accountRow, row => row.dataset.account || null);
  schedule();
  let done = false;
  const detach = () => {
    if (done) {
      return;
    }
    done = true;
    if (!Cu.isDeadWrapper(mainWin)) {
      mainWin.__mcSubnavLive--;
    }
    undrag();
    Services.prefs.removeObserver("mail.accountmanager.accounts", prefObs);
    mo.disconnect();
    browserEl.removeEventListener("load", schedule, true);
    browserEl.removeEventListener("view-selected", onView, true);
    browserEl.removeEventListener("select", onView, true);
  };
  // Einstellungs-Tab geschlossen: sofort abmelden – die Restorer des Tabs werden
  // dann nur verworfen, nicht ausgeführt (addWinRestorer); sonst hielte der
  // Beobachter am Einstellungsdienst die geschlossene Seite samt eingebetteter
  // Kontoeinstellungen bzw. Add-ons im Speicher, bei jedem Öffnen eine mehr
  const win = cdoc.defaultView;
  win?.addEventListener("unload", detach, { once: true });
  return () => {
    if (!Cu.isDeadWrapper(win)) {
      win?.removeEventListener("unload", detach);
    }
    detach();
  };
}

// halo.spaces-Einstellungen (options_ui): Erweiterungsseiten laufen in einem
// eigenen Prozess – eingebettet wie in Thunderbirds Add-ons-Verwaltung
// (toolkit inline-options-browser.mjs)
// Einstellungen → Allgemein: Link zu den offiziellen Tastaturkürzeln von
// Thunderbird (Mozilla-Hilfe in der Sprache von Thunderbird), eigene Karte
// unter „Scrolling“; öffnet im Standardbrowser
function shortcutsURL() {
  const loc = Services.locale.appLocaleAsBCP47;
  const lang = loc == "en" || loc.startsWith("en-") ? "en-US" : loc;
  return `https://support.mozilla.org/${lang}/kb/keyboard-shortcuts-thunderbird`;
}
function hookShortcutsLink(cw, restorers = null) {
  const doc = cw.document;
  if (doc.getElementById("mcShortcuts")) {
    return;
  }
  const next = doc.getElementById("languageAndFontsCategory");
  if (!next || next.parentNode?.id != "paneDeck") {
    return;
  }
  const X = "http://www.w3.org/1999/xhtml";
  const card = doc.createElementNS(X, "div");
  card.id = "mcShortcuts";
  card.setAttribute("data-category", "paneGeneral");
  // wie Thunderbirds Karten: nur sichtbar, wenn „Allgemein“ gewählt ist
  card.hidden = next.hidden;
  const set = doc.createElementNS(X, "fieldset");
  const legend = doc.createElementNS(X, "legend");
  legend.textContent = tr("Keyboard Shortcuts");
  const line = doc.createElementNS(X, "div");
  line.className = "mc-shortcuts-line";
  const link = doc.createElementNS(X, "a");
  link.className = "text-link";
  link.href = shortcutsURL();
  link.textContent = tr("Show all keyboard shortcuts of Thunderbird");
  // loadURI braucht seit Thunderbird 140 einen Principal und tat ohne ihn nichts
  // (GitHub #56); wie „Danke sagen“ über Thunderbirds openLinkExternally
  link.addEventListener("click", event => {
    event.preventDefault();
    const main = Services.wm.getMostRecentWindow("mail:3pane");
    if (typeof main?.openLinkExternally == "function") {
      main.openLinkExternally(link.href);
    } else {
      Cc["@mozilla.org/uriloader/external-protocol-service;1"].getService(Ci.nsIExternalProtocolService)
        .loadURI(Services.io.newURI(link.href), Services.scriptSecurityManager.getSystemPrincipal());
    }
  });
  line.append(link);
  set.append(legend, line);
  card.append(set);
  next.before(card);
  restorers?.push(() => card.remove());
}

// Befehle, die aus der Menüleiste gefallen sind, bekommen einen Platz in
// Thunderbirds Einstellungen (Knöpfe bzw. Schalter, die Thunderbirds
// Menüeintrag auslösen; Texte von Thunderbird, die Suche findet sie)
// Gibt zurück, wie viele markierte Mails geladen werden und wie viele schon
// offline lagen (für die Rückmeldung am Knopf: ist der Ordner wie in Thunderbird
// üblich ohnehin offline synchronisiert, gibt es nichts zu laden – ohne
// Rückmeldung sah das aus, als täte der Knopf nichts)
function downloadStarredForOffline(w) {
  const result = { queued: 0, already: 0, folder: "" };
  const folder = w.gFolder;
  if (!folder || folder.isServer) {
    return result;
  }
  result.folder = folder.prettyName || folder.name || "";
  let folders = [folder];
  if (folder.flags & Ci.nsMsgFolderFlags.Virtual) {
    try {
      const { VirtualFolderHelper } = ChromeUtils.importESModule("resource:///modules/VirtualFolderWrapper.sys.mjs");
      folders = VirtualFolderHelper.wrapVirtualFolder(folder).searchFolders;
    } catch (e) {
      log("download starred scope", e);
    }
  }
  for (const f of folders) {
    try {
      const starred = [...f.messages].filter(h => h.isFlagged);
      const hdrs = starred.filter(h => !(h.flags & Ci.nsMsgMessageFlags.Offline));
      result.already += starred.length - hdrs.length;
      if (hdrs.length) {
        f.downloadMessagesForOffline(hdrs, w.msgWindow);
        result.queued += hdrs.length;
      }
    } catch (e) {
      log("download starred", e);
    }
  }
  return result;
}

const PREF_TOOLS = [
  // [Karte, Bereich, vor/nach Thunderbird-Abschnitt, Überschrift, Einträge]
  ["mcPrefFiles", "paneGeneral", "languageAndFontsCategory", "Files and Display", [
    { button: "menu_openSavedFilesWnd" },
    // Zustand aus der Einstellung und Umschalten über sie: Thunderbird setzt
    // „checked“ dieser Einträge erst beim Öffnen ihres Menüs
    { toggle: "menu_fullZoomToggle", pref: "browser.zoom.full", def: true, invert: true },
    { toggle: "viewAttachmentsInlineMenuitem", pref: "mail.inline_attachments", def: true },
    // Dichte über ihre Einstellung: Thunderbirds Menüeinträge kennen ihren Wert
    // (mode, checked) erst, wenn das Menü Ansicht → Dichte einmal offen war –
    // über sie stellte jede Wahl „Compact“ ein und die Auswahl sprang zurück
    { choice: "menu_uiDensity", items: ["uiDensityCompact", "uiDensityNormal", "uiDensityTouch"], pref: "mail.uidensity", values: [0, 1, 2] },
  ]],
  ["mcPrefPrivacy", "panePrivacy", null, "History", [{ button: "sanitizeHistory" }]],
  // Filter heißen wie in Apple Mail Regeln: alle Regeln ansehen und anlegen
  ["mcPrefRules", "paneGeneral", null, "Rules", [{ button: "filtersCmd", pane: RULES_PANE }]],
  // „Get Starred Messages“ gilt in Thunderbird für den in der Mail gewählten
  // Ordner; der Befehl kennt nur die Mailansicht (pane3) – über Thunderbirds
  // Menüeintrag lief er im Einstellungen-Tab ins Leere (Knopf ohne Wirkung).
  // Auch der Befehl selbst warf, solange die Mailansicht keine Liste aufgebaut hat
  // (gDBView leer, z. B. Sammelordner): darum lädt downloadStarredForOffline die
  // markierten Mails des Ordners (bzw. der Ordner hinter einem virtuellen) selbst
  ["mcPrefOffline", "paneGeneral", null, "Offline", [
    { button: "menu_synchronizeOffline" },
    { button: "menu_downloadFlagged", pane3: "cmd_downloadFlagged" },
  ]],
  ["mcPrefCalendarView", "paneCalendar", null, "Calendar View", [
    // Arbeitstage und Drehen: Thunderbirds Befehle gelten nur bei offenem
    // Kalender (sonst ohne Wirkung) – darum direkt dessen Umschalter (call)
    { toggle: "calWorkdaysOnlyMenuitem", call: "toggleWorkdaysOnly" },
    { toggle: "calTasksInViewMenuitem" },
    { toggle: "calShowCompletedInViewMenuItem" },
    { toggle: "calViewRotated", call: "toggleOrientation" },
  ]],
];

function addPrefTools(doc, restorers) {
  const mailWin = Services.wm.getMostRecentWindow("mail:3pane");
  const deck = doc.getElementById("paneDeck");
  if (!mailWin || !deck) {
    return;
  }
  // Thunderbird legt manche Bereiche erst beim ersten Öffnen an – dann nachziehen
  if (!deck.__mcPrefTools) {
    deck.__mcPrefTools = true;
    const mo = new doc.defaultView.MutationObserver(() => addPrefTools(doc, restorers));
    mo.observe(deck, { childList: true });
    restorers?.push(() => {
      mo.disconnect();
      delete deck.__mcPrefTools;
    });
  }
  const X = "http://www.w3.org/1999/xhtml";
  const item = id => mailWin.document.getElementById(id);
  const label = id => (item(id)?.getAttribute("label") || "").replace(/…$/, "") + (item(id)?.getAttribute("label")?.endsWith("…") ? "…" : "");
  for (const [id, pane, before, legendText, rows] of PREF_TOOLS) {
    if (doc.getElementById(id)) {
      continue;
    }
    const cards = [...deck.children].filter(c => c.getAttribute("data-category") == pane && !c.id.startsWith("mc"));
    if (!cards.length || rows.every(r => !item(r.button || r.toggle || r.choice))) {
      continue;
    }
    const card = doc.createElementNS(X, "div");
    card.id = id;
    card.setAttribute("data-category", pane);
    card.hidden = cards[0].hidden;
    const set = doc.createElementNS(X, "fieldset");
    const legend = doc.createElementNS(X, "legend");
    legend.textContent = tr(legendText);
    set.append(legend);
    for (const row of rows) {
      const src = item(row.button || row.toggle || row.choice);
      if (!src) {
        continue;
      }
      const line = doc.createElementNS(X, "div");
      line.className = "mc-pref-tool";
      if (row.choice) {
        // Auswahl aus Thunderbirds Optionsfeldern (z. B. Dichte)
        const lab = doc.createElementNS(X, "label");
        const select = doc.createElementNS(X, "select");
        for (const id of row.items) {
          const opt = doc.createElementNS(X, "option");
          opt.value = id;
          opt.textContent = label(id);
          select.append(opt);
        }
        const sync = () => (select.value = row.pref
          ? row.items[row.values.indexOf(Services.prefs.getIntPref(row.pref, row.values[1]))] || row.items[1]
          : row.items.find(id => item(id)?.getAttribute("checked") == "true") || row.items[1]);
        sync();
        select.addEventListener("change", () => (row.pref
          ? Services.prefs.setIntPref(row.pref, row.values[row.items.indexOf(select.value)])
          : item(select.value)?.doCommand()));
        card.addEventListener("focusin", sync);
        lab.append(label(row.choice), " ", select);
        line.append(lab);
      } else if (row.button && row.pane3) {
        // Befehl der Mailansicht: dort ausführen; grau, solange Thunderbird ihn
        // nicht anbietet (kein Ordner gewählt, offline) – wie im Menü
        const b = doc.createElementNS(X, "button");
        b.textContent = label(row.button);
        const pane = () => mailWin.gTabmail?.tabInfo.find(t => t.mode?.name == "mail3PaneTab")?.chromeBrowser?.contentWindow;
        const ctl = () => pane()?.commandController;
        const able = () => {
          try {
            return !!ctl()?.isCommandEnabled(row.pane3);
          } catch {
            return false;
          }
        };
        // Rückmeldung neben dem Knopf (geladen, schon offline, keine markierten Mails)
        const note = doc.createElementNS(X, "span");
        note.className = "mc-pref-tool-note";
        note.setAttribute("role", "status");
        const sync = () => (b.disabled = !able());
        sync();
        b.addEventListener("click", () => {
          if (!able()) {
            return;
          }
          const r = downloadStarredForOffline(pane());
          note.textContent = r.queued
            ? tr("Downloading {n} starred messages from {folder}.", { n: r.queued, folder: r.folder })
            : r.already
              ? tr("All starred messages in {folder} are already available offline.", { folder: r.folder })
              : tr("No starred messages in {folder}.", { folder: r.folder });
        });
        card.addEventListener("focusin", sync);
        card.addEventListener("mouseover", sync);
        line.append(b, note);
      } else if (row.button) {
        const b = doc.createElementNS(X, "button");
        b.textContent = label(row.button);
        b.addEventListener("click", () => (row.pane ? doc.defaultView.gotoPref(row.pane) : item(row.button)?.doCommand()));
        line.append(b);
      } else {
        const lab = doc.createElementNS(X, "label");
        const box = doc.createElementNS(X, "input");
        box.type = "checkbox";
        // Thunderbird setzt „checked“ meist als leeres Attribut (toggleAttribute),
        // bei Einträgen mit command= am Befehl
        const checked = el => {
          const src = (el?.getAttribute("command") && mailWin.document.getElementById(el.getAttribute("command"))) || el;
          return !!src?.hasAttribute("checked") && src.getAttribute("checked") != "false";
        };
        const sync = () => (box.checked = row.pref
          ? Services.prefs.getBoolPref(row.pref, row.def) != !!row.invert
          : checked(item(row.toggle)));
        sync();
        box.addEventListener("change", () => {
          if (row.pref) {
            // über die Einstellung: Thunderbirds Befehl (Zoom) ist im
            // Einstellungs-Tab je nach Version gesperrt und bliebe ohne Wirkung
            Services.prefs.setBoolPref(row.pref, box.checked != !!row.invert);
          } else if (row.call && typeof mailWin[row.call] == "function") {
            try {
              mailWin[row.call]();
            } catch (e) {
              // umgeschaltet ist schon; nur das Neuzeichnen der (noch nie gezeigten) Kalenderansicht scheitert
              log("pref tool", row.call, String(e).slice(0, 120));
            }
          } else {
            item(row.toggle)?.doCommand();
          }
          mailWin.setTimeout(sync, 50);
        });
        card.addEventListener("focusin", sync);
        lab.append(box, " ", label(row.toggle));
        line.append(lab);
      }
      set.append(line);
    }
    card.append(set);
    const anchor = before && doc.getElementById(before);
    // „Advanced settings“ (about:config) bleibt die letzte Karte unter Allgemein
    const advanced = doc.getElementById("configEditor")?.closest("#paneDeck > div");
    if (anchor && anchor.parentNode == deck) {
      anchor.before(card);
    } else if (advanced && advanced.parentNode == deck && cards.includes(advanced)) {
      advanced.before(card);
    } else {
      cards.at(-1).after(card);
    }
    restorers?.push(() => card.remove());
  }
}

// Optionen der halo.spaces-Seite (dieselbe Liste wie options.js), übersetzt
function haloSections() {
  try {
    const scope = {};
    Services.scriptloader.loadSubScript("resource://mailcards/options/sections.js", scope);
    return scope.SECTIONS(english => tr(english));
  } catch (e) {
    log("halo sections error", String(e).slice(0, 120));
    return [];
  }
}

function loadOptionsPane(cw, box) {
  const doc = cw.document;
  if (box.firstChild) {
    return;
  }
  const { ExtensionParent } = ChromeUtils.importESModule("resource://gre/modules/ExtensionParent.sys.mjs");
  const { E10SUtils } = ChromeUtils.importESModule("resource://gre/modules/E10SUtils.sys.mjs");
  // ?in=prefs: Seite gestaltet sich wie die übrigen Kategorien der Einstellungen;
  // #s-<key>: aus der Suche gewählte Option zeigen
  // (das Sprungziel wird erst beim Laden gelesen: „Show“ kann zwischen Anlegen und Laden kommen)
  const url = extensionBaseURL + "options/options.html?in=prefs";
  const browserEl = doc.createXULElement("browser");
  browserEl.className = "mc-embed-frame";
  for (const [k, v] of [["type", "content"], ["disableglobalhistory", "true"], ["messagemanagergroup", "webext-browsers"],
    ["transparent", "true"], ["forcemessagemanager", "true"]]) {
    browserEl.setAttribute(k, v);
  }
  const policy = ExtensionParent.WebExtensionPolicy.getByID("mail-cards@sebastian.local");
  if (policy) {
    browserEl.setAttribute("initialBrowsingContextGroupId", policy.browsingContextGroupId);
  }
  const remoteType = ChromeUtils.predictRemoteTypeForURI(url, { window: cw, preferredRemoteType: E10SUtils.EXTENSION_REMOTE_TYPE });
  const remote = remoteType !== E10SUtils.NOT_REMOTE;
  if (remote) {
    browserEl.setAttribute("remote", "true");
    browserEl.setAttribute("remoteType", remoteType);
  }
  const ready = new Promise(resolve => browserEl.addEventListener(remote ? "XULFrameLoaderCreated" : "load", resolve, { once: true, capture: !remote }));
  box.append(browserEl);
  browserEl.clientTop; // Bindungen sofort anwenden
  ready.then(() => {
    const mm = browserEl.messageManager;
    if (!mm) {
      return; // inzwischen entfernt
    }
    ExtensionParent.apiManager.emit("extension-browser-inserted", browserEl);
    mm.loadFrameScript("chrome://extensions/content/ext-browser-content.js", false, true);
    mm.sendAsyncMessage("Extension:InitBrowser", { fixedWidth: false, isInline: true });
    box.__mcHash = box.__mcFocus ? `s-${box.__mcFocus}` : "";
    box.__mcLoadStarted = true;
    browserEl.fixupAndLoadURIString(url + (box.__mcHash ? `#${box.__mcHash}` : ""),
      { triggeringPrincipal: Services.scriptSecurityManager.getSystemPrincipal() });
  }).catch(e => log("halo pane error", e));
}

// Schrift auf der Kontofarbe: weiß auf dunklen, dunkel auf hellen Farben
function textOnColor(color) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(color).trim());
  if (!m) {
    return "#fff";
  }
  const lin = c => (c /= 255) <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  const n = parseInt(m[1], 16);
  const L = 0.2126 * lin(n >> 16) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255);
  return L > 0.45 ? "rgba(0, 0, 0, 0.85)" : "#fff";
}

// Absender dieser Domains bekommen Initialen statt eines Firmenlogos.
const FREEMAIL = new Set([
  "gmail.com", "googlemail.com", "icloud.com", "me.com", "mac.com",
  "outlook.com", "outlook.de", "outlook.at", "hotmail.com", "hotmail.de",
  "live.com", "live.at", "msn.com", "yahoo.com", "yahoo.de", "ymail.com",
  "gmx.at", "gmx.de", "gmx.net", "gmx.ch", "web.de", "aon.at", "chello.at",
  "a1.net", "kabsi.at", "t-online.de", "freenet.de", "mail.com",
  "proton.me", "protonmail.com", "pm.me", "posteo.de", "mailbox.org",
  "aol.com", "zoho.com", "fastmail.com", "hey.com",
]);

// Zweistufige Endungen, bei denen die „Firmendomain“ drei Teile hat.
const SECOND_LEVEL = new Set([
  "co.uk", "org.uk", "ac.uk", "gov.uk", "co.at", "or.at", "ac.at", "gv.at",
  "com.au", "net.au", "org.au", "co.nz", "co.jp", "ne.jp", "com.br",
  "com.tr", "co.za", "com.mx", "com.cn", "com.hk", "co.in", "co.il",
]);

const CSS = `
/* weitere Kopie derselben Mail (isDuplicateRow) */
#threadTree tr[is="thread-card"][data-mc-dup] {
  display: none !important;
}
#threadTree tr[is="thread-card"] .card-container {
  grid-template-columns: 16px 46px minmax(0, 1fr) !important;
  /* Inhalt senkrecht mittig: Thunderbird stapelt ihn sonst oben, und der
     Rest der festen Zeilenhöhe landet unten (bei kompakter Dichte deutlich) */
  align-content: center !important;
}
/* Gruppenköpfe („Heute“, „Gestern“ … bei „Gruppiert nach Sortierung“): nur
   eine Spalte wie bei Thunderbird – sonst landet der Text in der 46-px-Spalte
   des Absenderbilds und wird abgeschnitten („Yesterd“). Unten an der Zeile,
   direkt über der ersten Mail der Gruppe, wie ein Abschnittstitel. */
#threadTree tr[is="thread-card"]:is(.dummy, [data-properties~="dummy"]) .card-container {
  grid-template-columns: minmax(0, 1fr) !important;
  align-content: end !important;
}
/* ohne Thunderbirds Innenabstand (nur bei normaler Dichte): das Mitteln
   übernimmt align-content, und das Bild sitzt bei jeder Dichte gleich zum Absender */
#threadTree tr[is="thread-card"] .card-container > .thread-card-column:not(.read-status-column, :has(> .read-status)) {
  align-self: start !important;
  padding-block: 0 !important;
}
/* optisch gleiche Abstände oben/unten wie bei Apple: oben zählt das Auge ab
   der Oberkante der Großbuchstaben, unten bis zur Grundlinie der Vorschau –
   der Inhalt sitzt daher 1 px höher als rechnerisch mittig */
#threadTree tr[is="thread-card"] .card-container > :is(.thread-card-column, .mc-avatar) {
  position: relative;
  top: -1px;
}
#threadTree tr[is="thread-card"] .mc-avatar {
  width: 36px;
  height: 36px;
  margin-top: 3px;
  align-self: start;
  border-radius: 50%;
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
  /* wie Apple Mail: Verlauf Blaugrau → Lavendel, Initialen ~54 % des Kreises */
  background: linear-gradient(180deg, #B4CAE4, #8A97C5);
  color: #fff;
  font: 600 19px -apple-system, BlinkMacSystemFont, system-ui, sans-serif;
  letter-spacing: 0;
  user-select: none;
  pointer-events: none;
}
#threadTree tr[is="thread-card"] .mc-avatar.mc-has-img {
  background: #fff;
  box-shadow: inset 0 0 0 0.5px rgba(0, 0, 0, 0.12);
}
#threadTree tr[is="thread-card"] .mc-avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
#threadTree tr[is="thread-card"] .mc-avatar.mc-small img {
  width: 62%;
  height: 62%;
  object-fit: contain;
}
/* Suchtreffer gelb hinterlegt wie in Apple Mail (markHits) */
#threadTree tr[is="thread-card"] mark.mc-hit {
  background: rgba(255, 214, 10, 0.45);
  color: inherit;
  border-radius: 3px;
  padding: 0 1px;
  margin: 0 -1px;
}
@media (prefers-color-scheme: dark) {
  #threadTree tr[is="thread-card"] mark.mc-hit {
    background: rgba(255, 214, 10, 0.35);
  }
}
#threadTree tr[is="thread-card"].selected mark.mc-hit {
  background: rgba(255, 255, 255, 0.3);
}
#threadTree tr[is="thread-card"] .mc-preview {
  font-size: calc(12px * var(--mt-font-scale, 1));
  font-weight: 400 !important;
  line-height: calc(16px * var(--mt-font-scale, 1));
  margin-top: 1px;
  /* 3 px wie der Innenabstand des Absenders: bündig mit Absender und Betreff */
  padding-inline-start: 3px;
  color: color-mix(in srgb, currentColor 58%, transparent);
  white-space: normal;
  overflow: hidden;
  display: -webkit-box;
  -webkit-box-orient: vertical;
  word-break: break-word;
}
/* Ordnerliste wie Apple Mail (Attribute setzt decorateFolders) */
#folderTree li[data-mc-hide] {
  display: none !important;
}
#folderTree li[data-mc-flatten],
#folderTree li[data-mc-flatten] > ul {
  display: contents !important;
}
#folderTree li[data-mc-flatten] > .container {
  display: none !important;
}
#folderTree li[data-mode="all"] li[data-server-type] > ul {
  display: flex !important;
  flex-direction: column !important;
}
#folderTree > li[data-mode="all"] > .mode-container {
  display: none !important;
}
/* „On My Mac“ (lokale Ordner) wie bei Apple vor den Konten – bis die
   Konten einmal per Ziehen umsortiert wurden, dann gilt deren Reihenfolge */
#folderTree > li[data-mode="all"] > ul {
  display: flex !important;
  flex-direction: column !important;
}
#folderTree:not([mc-accounts-ordered]) > li[data-mode="all"] > ul > li[data-server-type="none"] {
  order: -1 !important;
}
/* Konto per Ziehen umsortieren: Einfügemarke als Linie in der Akzentfarbe */
#folderTree > li[data-mode="all"] > ul > li[mc-drop] {
  position: relative;
}
#folderTree > li[data-mode="all"] > ul > li[mc-drop]::after {
  content: "";
  position: absolute;
  inset-inline: 8px;
  height: 2px;
  border-radius: 1px;
  background: AccentColor;
  pointer-events: none;
}
/* ganz innerhalb des Abschnitts: unter dem letzten Konto endet die Liste,
   ein halb herausragender Strich wäre dort nur 1 px dick */
#folderTree > li[data-mode="all"] > ul > li[mc-drop="before"]::after { top: 0; }
#folderTree > li[data-mode="all"] > ul > li[mc-drop="after"]::after { bottom: 0; }
#folderTree > li[data-mode="all"] > ul > li[data-server-type="none"] > .container .twisty {
  visibility: hidden !important;
}
/* „On My Mac“ ist wie bei Apple nur eine Überschrift (nicht anklickbar) */
#folderTree > li[data-mode="all"] > ul > li[data-server-type="none"] > .container {
  pointer-events: none !important;
  background: transparent !important;
}
#folderTree > li[data-mode] {
  border: none !important;
}
/* Gruppenköpfe ohne Absenderbild und Vorschau (auch ohne deren Platz) */
#threadTree tr[is="thread-card"]:is(.dummy, [data-properties~="dummy"]) :is(.mc-avatar, .mc-preview) {
  display: none !important;
}
`;

// Grundlagen in api/grundlagen.js: Protokoll (log), Hilfsfunktionen, Suche,
// Logo-Cache, MacPhotos, Absenderbilder (AvatarResolver), Design aus der
// Erweiterung (EarlyTheme, ThemeSheet) – hier geladen, damit die Reihenfolge bleibt
loadPart("grundlagen.js");

// ---------------------------------------------------------------------------
// Kalender: Offline-Unterstützung standardmäßig an
// ---------------------------------------------------------------------------

// Online-Kalender (CalDAV, abonnierte ICS) ohne lokale Kopie lädt Thunderbird
// bei jedem Start komplett vom Server – bis dahin bleibt die Ansicht leer.
// Mit Offline-Unterstützung erscheinen die Termine sofort aus der lokalen
// Kopie, Änderungen kommen im Hintergrund nach. Eingeschaltet wird nur, wo
// die Einstellung nie angefasst wurde. Nur auf Wunsch
// (extensions.mailcards.calendarOffline = true): Thunderbird legt den
// Kalender dafür neu an (neue Kennung) – das stört Kalender, die andere
// Add-ons verwalten (TbSync, Provider), und lädt alles neu herunter.
function enableCalendarOffline() {
  if (!Services.prefs.getBoolPref("extensions.mailcards.calendarOffline", false)) {
    return 0;
  }
  let changed = 0;
  try {
    const { cal } = ChromeUtils.importESModule("resource:///modules/calendar/calUtils.sys.mjs");
    for (const calendar of cal.manager.getCalendars()) {
      if (!["caldav", "ics"].includes(calendar.type) || !/^https?:/.test(calendar.uri?.spec || "")) {
        continue;
      }
      if (calendar.getProperty("cache.supported") === false || calendar.getProperty("cache.always")) {
        continue;
      }
      if (Services.prefs.prefHasUserValue(`calendar.registry.${calendar.id}.cache.enabled`)) {
        continue; // bewusst gesetzt – so lassen
      }
      calendar.setProperty("cache.enabled", true);
      changed++;
    }
  } catch (e) {
    log("calendar offline error", String(e).slice(0, 160));
  }
  if (changed) {
    log("calendar offline enabled", { changed });
  }
  return changed;
}

// ---------------------------------------------------------------------------
// Einbindung in die Kartenansicht
// ---------------------------------------------------------------------------

class CardEnhancer {
  constructor(options) {
    // Zeilenzahl der Vorschau: Einstellung extensions.mailcards.previewLines
    // (Standard 1 wie in Apple Mail, 0 = keine Vorschau).
    const lines = Services.prefs.getIntPref(PREVIEW_PREF, options.previewLines ?? 1);
    this.previewLines = Math.max(0, Math.min(4, lines));
    this.contactPhotos = Services.prefs.getBoolPref(CONTACT_PHOTOS_PREF, true);
    this.windows = new Set();
    this.restorers = [];
    this.winRestorers = new WeakMap();
    this.requested = new Set();
    this.pendingPreview = new Map();
    this.previewTimer = null;
    this.fullQueue = [];
    this.fullActive = 0;
    this.stats = { quick: 0, full: { ok: 0, empty: 0, nomime: 0, error: 0 } };
    this.statsLogged = false;
    this.avatars = new AvatarResolver(() => this.anyWindow());
    this.mainWindows = new Set();
  }

  // Gmail: dieselbe Mail liegt als Label in mehreren Ordnern (Posteingang,
  // Wichtig, Alle Nachrichten …). Thunderbird gleicht den Gelesen-Status der
  // anderen Ordner erst ab, wenn man sie öffnet – bis dahin zeigt z. B.
  // „Wichtig“ eine Zahl, obwohl alles gelesen ist. Darum die Kopien sofort
  // mitziehen (auf dem Server ist es ohnehin dieselbe Nachricht).
  syncGmailLabels() {
    const READ = Ci.nsMsgMessageFlags.Read;
    let busy = false;
    let stopped = false;
    // Der Abgleich sucht die Mail in jedem Gmail-Ordner (Datenbank öffnen,
    // Suche nach der Message-ID) – nie direkt im Melden der Änderung: das
    // geschieht beim Anzeigen einer Mail (gelesen) und beim Abruf vom Server
    // je Mail, und hielt so das Anzeigen auf (GitHub #38). Darum gesammelt im
    // Leerlauf, je Runde höchstens 20 Mails
    const queue = new Map(); // "Server Message-ID" → { folder, server, messageId, read }
    let scheduled = false;
    const schedule = () => {
      if (!scheduled && !stopped && queue.size) {
        scheduled = true;
        Services.tm.idleDispatchToMainThread(run, 2000);
      }
    };
    const syncOne = ({ folder, server, messageId, read }) => {
      for (const other of server.rootFolder.descendants) {
        if (other == folder || other.getFlag(Ci.nsMsgFolderFlags.Virtual)) {
          continue;
        }
        // nur Ordner, deren Zahl sich ändern kann – andere Datenbanken nicht öffnen
        const unread = other.getNumUnread(false);
        if (read ? unread <= 0 : other.getTotalMessages(false) - unread <= 0) {
          continue;
        }
        const copy = other.msgDatabase?.getMsgHdrForMessageID(messageId);
        if (copy && copy.isRead != read) {
          other.markMessagesRead([copy], read);
        }
      }
    };
    const run = () => {
      scheduled = false;
      if (stopped) {
        return;
      }
      let n = 0;
      for (const [key, item] of queue) {
        if (n++ >= 20) {
          break;
        }
        queue.delete(key);
        busy = true; // die eigenen Änderungen lösen den Listener erneut aus
        try {
          syncOne(item);
        } catch (e) {
          log("gmail label sync error", String(e).slice(0, 160));
        } finally {
          busy = false;
        }
      }
      schedule();
    };
    const listener = {
      onFolderPropertyFlagChanged(hdr, property, oldFlag, newFlag) {
        if (busy || property != "Status" || !((oldFlag ^ newFlag) & READ)) {
          return;
        }
        try {
          const folder = hdr.folder;
          const server = folder?.server;
          const messageId = hdr.messageId;
          if (server?.type != "imap" || !server.QueryInterface(Ci.nsIImapIncomingServer).isGMailServer || !messageId) {
            return;
          }
          // (spätere Änderung derselben Mail ersetzt die frühere)
          const key = `${server.key} ${messageId}`;
          queue.delete(key);
          queue.set(key, { folder, server, messageId, read: !!(newFlag & READ) });
          schedule();
        } catch (e) {
          log("gmail label sync error", String(e).slice(0, 160));
        }
      },
    };
    MailServices.mailSession.AddFolderListener(listener, Ci.nsIFolderListener.propertyFlagChanged);

    // Am Handy oder im Web Gelesenes erfährt Thunderbird außerhalb des
    // Posteingangs erst beim Öffnen des Ordners. Darum Gmail-Ordner, die noch
    // Ungelesenes zeigen, alle 5 Minuten abgleichen (nur diese, wenige Ordner)
    const F = Ci.nsMsgFolderFlags;
    const refresh = () => {
      if (Services.io.offline) {
        return;
      }
      for (const server of MailServices.accounts.allServers) {
        try {
          if (server.type != "imap" || !server.QueryInterface(Ci.nsIImapIncomingServer).isGMailServer) {
            continue;
          }
          for (const f of server.rootFolder.descendants) {
            if (f.getFlag(F.Inbox | F.Virtual | F.Trash | F.Junk | F.ImapNoselect) || f.getNumUnread(false) <= 0) {
              continue;
            }
            f.updateFolder(null);
          }
        } catch (e) {
          log("gmail refresh error", String(e).slice(0, 160));
        }
      }
    };
    const first = setTimeout(refresh, 60 * 1000);
    const every = setInterval(refresh, 5 * 60 * 1000);
    this.restorers.push(() => {
      MailServices.mailSession.RemoveFolderListener(listener);
      stopped = true;
      queue.clear();
      clearTimeout(first);
      clearInterval(every);
    });
  }

  // Erstinstallation: Theme auf „System – automatisch“, außer eins der drei
  // eingebauten (System, Hell, Dunkel) ist schon aktiv. Liefert, ob umgestellt wurde
  async applyThemeOnce() {
    try {
      const { AddonManager } = ChromeUtils.importESModule("resource://gre/modules/AddonManager.sys.mjs");
      const active = (await AddonManager.getAddonsByTypes(["theme"])).find(a => a.isActive)?.id;
      if (Object.values(APPEARANCE_THEMES).includes(active)) {
        return false;
      }
      const auto = await AddonManager.getAddonByID(APPEARANCE_THEMES.auto);
      await auto?.enable();
      log("theme: Erstinstallation – auf System umgestellt", active);
      return !!auto;
    } catch (e) {
      log("theme switch error", e);
      return false;
    }
  }

  start() {
    // Erstinstallation oder Update? Bestandsnutzer haben schon Einmal-Prefs einer
    // früheren Fassung (Suche, Toolbar, Kartenzeilen) – vor allem anderen prüfen, der Start setzt sie gleich
    const WELCOME_PREF = "extensions.mailcards.welcomeShown";
    const existing = ["searchApplied", "toolbarApplied", "rowcountApplied"]
      .some(name => Services.prefs.getBoolPref(`extensions.mailcards.${name}`, false));
    const firstInstall = !existing && !Services.prefs.getBoolPref(WELCOME_PREF, false);
    this.firstInstall = firstInstall;
    if (existing && !Services.prefs.getBoolPref(WELCOME_PREF, false)) {
      // Bestandsnutzer nach einem Update nicht begrüßen (und keine Plattform-Notiz mehr)
      Services.prefs.setBoolPref(WELCOME_PREF, true);
    }
    // Erstinstallation: Erscheinungsbild „System – automatisch“, damit das Design
    // hell/dunkel mit dem System wechselt (Thunderbirds Hell/Dunkel und fremde
    // Themes malen eigene Farben darüber). Eine bewusste Wahl unter den drei
    // eingebauten (System, Hell, Dunkel) bleibt erhalten
    const themeSwitched = firstInstall ? this.applyThemeOnce() : Promise.resolve(false);
    // „Danke sagen“: Nutzungstag zählen, stündlich erneut (über Mitternacht
    // hinaus laufendes Thunderbird); Änderungen an den Prefs zeigen Menü,
    // Info-Fenster und Einstellungen gleich an
    Thanks.countDay();
    const thanksTimer = setInterval(() => Thanks.countDay(), 60 * 60 * 1000);
    const thanksObs = { observe: () => Thanks.listeners.forEach(fn => fn()) };
    Services.prefs.addObserver(THANKS_BRANCH, thanksObs);
    this.restorers.push(() => {
      clearInterval(thanksTimer);
      Services.prefs.removeObserver(THANKS_BRANCH, thanksObs);
    });
    // Start ohne Aufblitzen: Datei im Profil passend zur Einstellung (nach Updates neu)
    EarlyTheme.sync();
    const earlyObs = { observe: () => EarlyTheme.sync() };
    Services.prefs.addObserver(EARLY_THEME_PREF, earlyObs);
    this.restorers.push(() => Services.prefs.removeObserver(EARLY_THEME_PREF, earlyObs));
    // Vorschauzeilen (Ansicht → Vorschauzeilen) gelten sofort, ohne Neustart
    const previewObs = { observe: () => this.applyPreviewLines() };
    Services.prefs.addObserver(PREVIEW_PREF, previewObs);
    this.restorers.push(() => Services.prefs.removeObserver(PREVIEW_PREF, previewObs));
    // Kontaktfoto ein/aus (Drei-Punkte-Menü) ebenso
    const photosObs = { observe: () => this.applyContactPhotos() };
    Services.prefs.addObserver(CONTACT_PHOTOS_PREF, photosObs);
    this.restorers.push(() => Services.prefs.removeObserver(CONTACT_PHOTOS_PREF, photosObs));
    // Ansicht und Layout der Mailliste nur in gültigen Kombinationen (Karten
    // vertikal, Tabelle klassisch) – beim Start bestehende Profile umstellen
    syncViewChoice(LISTVIEW_PREF);
    const viewObs = { observe: (_s, _t, pref) => syncViewChoice(pref) };
    Services.prefs.addObserver(LISTVIEW_PREF, viewObs);
    Services.prefs.addObserver(PANE_PREF, viewObs);
    this.restorers.push(() => {
      Services.prefs.removeObserver(LISTVIEW_PREF, viewObs);
      Services.prefs.removeObserver(PANE_PREF, viewObs);
    });
    // Wie Apple Mail: Absender, Betreff mit Büroklammer und Stern daneben,
    // darunter die Vorschau. Thunderbirds dreizeilige Karte setzte die Symbole
    // in eine eigene Zeile – immer zwei Zeilen; die Auswahl in Thunderbirds
    // Einstellungen ist ausgeblendet (dafür gibt es die Vorschauzeilen)
    const ROWS_PREF = "mail.threadpane.cardsview.rowcount";
    const twoRows = () => {
      if (Services.prefs.getIntPref(ROWS_PREF, 3) != 2) {
        Services.prefs.setIntPref(ROWS_PREF, 2);
        Services.prefs.setBoolPref("extensions.mailcards.rowcountApplied", true);
      }
    };
    twoRows();
    // gegen eine Wahl in Thunderbirds Einstellungen – nicht beim Deinstallieren:
    // dort räumt halo.spaces den Wert selbst weg und gleich danach seine eigenen
    // Einstellungen (dann fehlt rowcountApplied, es bleibt beim Standard)
    const rowsObs = { observe: () => setTimeout(() => {
      if (Services.prefs.getBoolPref("extensions.mailcards.rowcountApplied", false)) {
        twoRows();
      }
    }, 0) };
    Services.prefs.addObserver(ROWS_PREF, rowsObs);
    this.restorers.push(() => Services.prefs.removeObserver(ROWS_PREF, rowsObs));
    this.applyToolbarOnce();
    Services.prefs.clearUserPref(QUICK_REPLY_PREF); // (Schnellantwort entfernt)
    // entfernte Optionen (17.11.2026): alte Werte nicht im Profil lassen
    for (const pref of REMOVED_OPTION_PREFS) {
      Services.prefs.clearUserPref(pref);
    }
    // Suche über alle Konten und Treffer als einfache Liste (Einstellungen →
    // Allgemein) – einmalig, wer es danach abschaltet, behält das
    if (!Services.prefs.getBoolPref("extensions.mailcards.searchApplied", false)) {
      Services.prefs.setBoolPref("mailnews.database.global.indexer.enabled", true);
      Services.prefs.setBoolPref("gloda.show_as_list_by_default", true);
      Services.prefs.setBoolPref("extensions.mailcards.searchApplied", true);
    }
    // Wie Apple Mail: Doppelklick öffnet die Mail in einem eigenen Fenster
    // statt in einem Tab (die Tab-Leiste ist ausgeblendet, der Tab wäre
    // versteckt) – einmalig; wer danach in Thunderbirds Einstellungen wieder
    // Tab wählt, behält das. Beim Abschalten der alte Wert zurück, solange
    // noch unser Wert gilt
    this.openMessageInWindowOnce();
    // Ebenso PDF-Anhänge: mit dem Standardprogramm des Systems (Vorschau)
    // statt in einem Thunderbird-Tab
    this.pdfInSystemViewerOnce();
    // Wie Apple Mail: das Verfassen-Fenster schließt beim Senden sofort, die
    // Mail geht im Hintergrund über den Postausgang hinaus, ohne Fenster
    // „Nachricht wird gesendet“. Thunderbird meldet Fehler dabei nur in der
    // Aktivitätsanzeige – darum zeigt sendErrors() sie selbst als Dialog.
    // Die vorherigen Werte werden gemerkt und beim Ausschalten wiederhergestellt.
    for (const [pref, saved, value, def] of [
      ["mailnews.show_send_progress", "extensions.mailcards.sendProgressSaved", false, true],
      ["mailnews.sendInBackground", "extensions.mailcards.sendBackgroundSaved", true, false],
    ]) {
      if (!Services.prefs.prefHasUserValue(saved)) {
        Services.prefs.setBoolPref(saved, Services.prefs.getBoolPref(pref, def));
      }
      Services.prefs.setBoolPref(pref, value);
      this.restorers.push(() => {
        if (!Services.prefs.prefHasUserValue(saved)) {
          return;
        }
        const was = Services.prefs.getBoolPref(saved, def);
        Services.prefs.clearUserPref(saved);
        if (was == def) {
          Services.prefs.clearUserPref(pref);
        } else {
          Services.prefs.setBoolPref(pref, was);
        }
      });
    }
    this.sendErrors();
    this.flushOutbox();
    SendLater.start();
    // Einmal nach der Erstinstallation begrüßen: was halo.spaces ändert und wo
    // die Einstellungen liegen. Windows/Linux: im selben Fenster der Hinweis,
    // dass halo.spaces für macOS gemacht ist (früher ein eigenes Fenster)
    const NOTE_PREF = "extensions.mailcards.platformNoteShown";
    const platformNote = Services.appinfo.OS != "Darwin" && !Services.prefs.getBoolPref(NOTE_PREF, false);
    if (!Services.prefs.getBoolPref(WELCOME_PREF, false) || platformNote) {
      const welcome = !Services.prefs.getBoolPref(WELCOME_PREF, false);
      const noteTimer = setTimeout(async () => {
        const w = Services.wm.getMostRecentWindow("mail:3pane");
        if (w) {
          Services.prefs.setBoolPref(WELCOME_PREF, true);
          if (platformNote) {
            Services.prefs.setBoolPref(NOTE_PREF, true);
          }
          this.openHaloWindow(w, { welcome, platformNote, themeSwitched: await themeSwitched });
        }
      }, 6000);
      this.restorers.push(() => clearTimeout(noteTimer));
    }
    // nach dem Start, wenn der Kalender-Manager bereit ist
    const offlineTimer = setTimeout(() => enableCalendarOffline(), 8000);
    this.restorers.push(() => clearTimeout(offlineTimer));
    // Update gleich beim Start statt erst bei Thunderbirds täglicher Prüfung
    const updateTimer = setTimeout(() => this.autoUpdate(), 20000);
    this.restorers.push(() => clearTimeout(updateTimer));
    this.hookBirthdays();
    renamePersonalBookOnce();
    watchPersonalBook(this.restorers);
    // Fotos aus der macOS-Kontakte-App: kurz nach dem Start und dann stündlich
    MacPhotos.load();
    this.registerIconVars();
    // Unser Stylesheet in alle Thunderbird-Dokumente, für die userChrome.css
    // nicht gilt (Dialoge in Seiten, Unterdialoge, Inhalts-Tabs)
    const docObserver = {
      observe: doc => {
        try {
          const url = doc.documentURI || "";
          if (ThemeSheet.active) {
            ThemeSheet.apply(doc.defaultView);
          }
          dialogEdgeReset(doc.defaultView, url);
          // Termin-Details: Fenster so groß, dass alles sichtbar ist
          if (url.startsWith("chrome://calendar/content/calendar-summary-dialog.xhtml") && doc.defaultView) {
            const dlg = doc.defaultView;
            // im selben Ladeschritt direkt nach Thunderbirds eigenem Aufbau (dessen
            // load-Handler steht erst nach DOMContentLoaded fest), also bevor das
            // Fenster erscheint – mit Verzögerung sprang es sichtbar auf die neue Größe
            doc.documentElement.style.minWidth = "480px";
            dlg.addEventListener("DOMContentLoaded", () => {
              dlg.addEventListener("load", () => {
                this.linkSummaryLocation(dlg);
                this.fitSummaryDialog(dlg);
                // Beschreibung steht hier in einem eigenen Inhaltsdokument
                // (iframe.item-description) – dunkel sonst schwarz auf grau
                this.styleItemDescription(dlg, 0, ".item-description");
              }, { once: true });
            }, { once: true });
          }
          // Termin-/Aufgaben-Fenster: Titel und Beschriftungen ohne Doppelpunkt
          if (url.startsWith("chrome://calendar/content/calendar-event-dialog.xhtml") && doc.defaultView) {
            const dlg = doc.defaultView;
            // Termin (nicht Aufgabe): schmales Fenster wie Apple Kalender (spaces.css)
            // – schon jetzt, bevor Thunderbird die Größe nach dem Formular misst
            try {
              if (dlg.arguments?.[0]?.calendarEvent?.isEvent?.()) {
                doc.documentElement.setAttribute("mc-event", "");
              }
            } catch {} // gewollt: Dialog ohne Terminangabe, bleibt wie Thunderbird ihn zeigt
            dlg.addEventListener("load", () => this.tidyEventDialog(dlg), { once: true });
          }
          // Beschreibung eines Termins/einer Aufgabe (Fenster und Tab): Schrift
          // wie die Felder darüber (siehe event-description.css)
          if (url.startsWith("chrome://calendar/content/calendar-item-iframe.xhtml") && doc.defaultView) {
            const iw = doc.defaultView;
            // direkt nach Thunderbirds eigenem onLoad im selben Schritt (dessen
            // load-Handler steht erst nach DOMContentLoaded fest) – per Verzögerung
            // rückten die Felder sichtbar an ihre Apple-Plätze
            // Das Fenster erscheint schon, bevor dieses Formular fertig ist – bis
            // dahin unsichtbar, sonst sieht man die Felder an Thunderbirds Plätzen
            const root = doc.documentElement;
            root.style.visibility = "hidden";
            const reveal = () => root.style.removeProperty("visibility");
            iw.setTimeout(reveal, 2000);
            iw.addEventListener("DOMContentLoaded", () => iw.addEventListener("load", () => {
              try {
                this.styleItemDescription(iw);
                hookDateTimePickers(iw);
                keepDurationOneWay(iw);
                appleEventLayout(iw);
                addTypeSwitch(iw);
                if (iw.parent?.location?.href.startsWith("chrome://calendar/content/calendar-event-dialog.xhtml")) {
                  this.tidyEventDialog(iw.parent);
                }
              } finally {
                reveal();
              }
            }, { once: true }), { once: true });
          }
          // „Teilnehmer einladen“: Beginn/Ende ebenso
          if (url.startsWith("chrome://calendar/content/calendar-event-dialog-attendees.xhtml") && doc.defaultView) {
            const aw = doc.defaultView;
            aw.addEventListener("load", () => aw.setTimeout(() => hookDateTimePickers(aw), 0), { once: true });
          }
          // Filterliste und Filter-Editor heißen wie in Apple Mail „Rules“ bzw. „Rule“ (Titel unter Windows/Linux sichtbar)
          const ruleTitle = url.startsWith("chrome://messenger/content/FilterListDialog.xhtml") ? "Rules"
            : url.startsWith("chrome://messenger/content/FilterEditor.xhtml") ? "Rule" : null;
          if (ruleTitle && doc.defaultView) {
            const fw = doc.defaultView;
            fw.addEventListener("DOMContentLoaded", () => {
              const title = fw.document.querySelector("title");
              title?.removeAttribute("data-l10n-id");
              fw.document.title = tr(ruleTitle);
            }, { once: true });
          }
          // Eigenschaften eines Kalenders aus dem Bereich Aufgaben: „List Info“
          if (url.startsWith("chrome://calendar/content/calendar-properties-dialog.xhtml") && doc.defaultView) {
            const lw = doc.defaultView;
            if (lw.opener?.document?.getElementById("tabmail")?.currentTabInfo?.mode?.name == "tasks") {
              lw.addEventListener("DOMContentLoaded", () => listInfoDialog(lw), { once: true });
            }
          }
          // Dialogfenster als ruhige Karte ohne sichtbare Titelleiste (macOS)
          if (CARD_WINDOWS.some(u => url.startsWith(u)) && doc.defaultView) {
            const cw = doc.defaultView;
            cw.addEventListener("DOMContentLoaded", () => cardWindow(cw), { once: true });
          }
          // Erinnerungen: Fenster so hoch wie die Einträge (Thunderbird merkt
          // sich sonst eine feste Größe – bei einem Eintrag viel Leerraum)
          if (url.startsWith("chrome://calendar/content/calendar-alarm-dialog.xhtml") && doc.defaultView) {
            const dlg = doc.defaultView;
            dlg.addEventListener("load", () => dlg.setTimeout(() => this.fitAlarmDialog(dlg), 200), { once: true });
          }
          if (!/^(chrome:\/\/(messenger|calendar|messenger-newsblog)\/|about:(addressbook|preferences|addons|accountsettings|accountsetup|message|3pane))/.test(url)) {
            return;
          }
          const win = doc.defaultView;
          // Beschriftungen ohne Doppelpunkt in Fenstern, Dialogen und Einstellungen
          // (nicht Hauptfenster, Mailansicht, Adressbuch und Verfassen-Fenster)
          if (win && /^(chrome:\/\/(messenger|calendar|messenger-newsblog)\/|about:(preferences|accountsettings))/.test(url) &&
              !/^chrome:\/\/messenger\/content\/(messenger|messageWindow|messengercompose\/messengercompose)\.xhtml/.test(url)) {
            win.addEventListener("DOMContentLoaded", () => hookFieldColons(win), { once: true });
          }
          if (/^about:(3pane|message)/.test(url) && win) {
            win.addEventListener("DOMContentLoaded", () => {
              this.hookMailContext(doc);
              // neu geladene Mailansicht gleich einrichten (Karten, Bilder, …)
              if (url.startsWith("about:3pane")) {
                this.patch(win, 0);
              }
              if (url.startsWith("about:message")) {
                this.hookHeaderAvatar(doc);
                hookFindbarDone(doc);
              }
              // Nachricht im eigenen Fenster: Knöpfe im Mailkopf zeigen
              // – ebenso, wenn die Mail-Toolbar keine Antworten-Knöpfe hat
              // (eigene Toolbar-Anordnung), sonst fehlten sie ganz
              if (url.startsWith("about:message") &&
                  (!this.replyInToolbar() || win.top?.document.documentElement.getAttribute("windowtype") == "mail:messageWindow")) {
                doc.documentElement.setAttribute("mc-standalone", "true");
              }
              if (url.startsWith("about:message") && win.top?.document.documentElement.getAttribute("windowtype") == "mail:messageWindow") {
                this.alwaysReplyAll(win);
                this.hookWindowConversation(win);
                this.hookWindowAttachments(win);
                this.hookWindowHeaderTools(win);
              }
            }, { once: true });
          }
          if (!win || win.__mcSheet || ThemeSheet.active) {
            return; // mit theme.css ist userChrome.css nicht nötig
          }
          // Dokumente in Chrome-Docshells bekommen userChrome.css schon selbst
          if (win.docShell?.itemType == Ci.nsIDocShellTreeItem.typeChrome) {
            return;
          }
          const file = Services.dirsvc.get("ProfD", Ci.nsIFile);
          file.append("chrome");
          file.append("userChrome.css");
          if (!file.exists()) {
            return;
          }
          const uri = Services.io.newFileURI(file).spec;
          win.windowUtils.loadSheetUsingURIString(uri, win.windowUtils.USER_SHEET);
          win.__mcSheet = uri;
        } catch (e) {
          log("doc sheet error", String(e).slice(0, 160));
        }
      },
    };
    Services.obs.addObserver(docObserver, "document-element-inserted");
    this.restorers.push(() => Services.obs.removeObserver(docObserver, "document-element-inserted"));
    this.restorers.push(restoreFieldColons);
    const onPhotos = () => this.avatars.byEmail.clear(); // neue Fotos beim nächsten Anzeigen nutzen
    MacPhotos.listeners.add(onPhotos);
    const t1 = setTimeout(() => MacPhotos.sync(), 20000);
    const t2 = setInterval(() => MacPhotos.sync(), 3600 * 1000);
    this.restorers.push(() => {
      clearTimeout(t1);
      clearInterval(t2);
      MacPhotos.listeners.delete(onPhotos);
    });
    this.syncGmailLabels();
    // Thunderbird lädt die Mailansicht (about:3pane) beim Start oft erst,
    // nachdem die Erweiterung schon läuft – darum jedes Hauptfenster
    // beobachten und seine Tabs wiederholt nach neuen Mailansichten absuchen.
    ExtensionSupport.registerWindowListener("mail-cards", {
      chromeURLs: ["chrome://messenger/content/messenger.xhtml"],
      onLoadWindow: w => this.watchMainWindow(w),
    });
    ExtensionSupport.registerWindowListener("mail-cards-tags", {
      chromeURLs: ["chrome://messenger/content/messenger.xhtml", "chrome://messenger/content/messageWindow.xhtml"],
      onLoadWindow: w => TagMenus.attach(w),
      onUnloadWindow: w => TagMenus.detach(w),
    });
    this.restorers.push(() => {
      ExtensionSupport.unregisterWindowListener("mail-cards-tags");
      for (const w of Services.wm.getEnumerator(null)) {
        TagMenus.detach(w);
      }
    });
    // Suchleisten im Hauptfenster (Webseiten-Tabs, Chat-Verlauf) und im
    // Mailfenster: „Done“ wie im Verfassen-Fenster und in der Leseansicht
    ExtensionSupport.registerWindowListener("mail-cards-findbar", {
      chromeURLs: ["chrome://messenger/content/messenger.xhtml", "chrome://messenger/content/messageWindow.xhtml"],
      onLoadWindow: w => hookFindbarDone(w.document),
    });
    this.restorers.push(() => ExtensionSupport.unregisterWindowListener("mail-cards-findbar"));
    this.watchChatVariant();
    this.watchPromptTitles();
    // Datumsfelder (z. B. im Terminfenster) im Format des Systems: Thunderbirds
    // „Regionale Einstellungen des Systems verwenden“ als Vorgabe an – wer es
    // selbst eingestellt hat, behält seine Wahl
    const REGIONAL = "intl.regional_prefs.use_os_locales";
    const defaults = Services.prefs.getDefaultBranch("");
    const regionalBefore = defaults.getBoolPref(REGIONAL, false);
    defaults.setBoolPref(REGIONAL, true);
    this.restorers.push(() => defaults.setBoolPref(REGIONAL, regionalBefore));
    // Terminerinnerungen als Mitteilung des Systems (siehe AlarmAlerts)
    AlarmAlerts.start();
    this.restorers.push(() => AlarmAlerts.stop());
    // Anhänge unter der Mail von Anfang an aufgeklappt (wie Apple Mail) – als
    // Vorgabe, wer Thunderbirds Einstellung selbst geändert hat, behält sie
    const ATT_EXPANDED = "mailnews.attachments.display.start_expanded";
    const attExpandedBefore = defaults.getBoolPref(ATT_EXPANDED, false);
    defaults.setBoolPref(ATT_EXPANDED, true);
    this.restorers.push(() => defaults.setBoolPref(ATT_EXPANDED, attExpandedBefore));
    // Mailliste nach Datum, neueste zuerst (wie Apple Mail) – nur als Vorgabe:
    // gilt für Ordner, deren Sortierung Thunderbird neu anlegt; eine gewählte
    // Sortierung (im Ordner gespeichert) bleibt, auch bei Updates
    const SORT = [["mailnews.default_sort_type", Ci.nsMsgViewSortType.byDate],
                  ["mailnews.default_sort_order", Ci.nsMsgViewSortOrder.descending]];
    for (const [pref, value] of SORT) {
      const before = defaults.getIntPref(pref, value);
      defaults.setIntPref(pref, value);
      this.restorers.push(() => defaults.setIntPref(pref, before));
    }
    // Verfassen-Fenster: Symbolleiste nur mit Symbolen, sobald Beschriftungen
    // gekürzt würden (siehe watchComposeToolbar)
    const composeCleanups = new Set();
    ExtensionSupport.registerWindowListener("mail-cards-compose", {
      chromeURLs: ["chrome://messenger/content/messengercompose/messengercompose.xhtml"],
      onLoadWindow: w => {
        this.watchComposeToolbar(w, composeCleanups);
        try {
          hookComposeApple(w, composeCleanups);
        } catch (e) {
          log("compose apple error", e);
        }
        try {
          hookFindbarDone(w.document);
        } catch (e) {
          log("compose find bar error", e);
        }
        try {
          UndoSend.hook(w, composeCleanups);
          SendLater.hook(w, composeCleanups);
        } catch (e) {
          log("undo send hook error", e);
        }
        try {
          installDialogBox(w, { push: fn => composeCleanups.add(fn) });
        } catch (e) {
          log("dialog box error", e);
        }
      },
    });
    this.restorers.push(() => {
      ExtensionSupport.unregisterWindowListener("mail-cards-compose");
      for (const cleanup of [...composeCleanups]) {
        try {
          cleanup();
        } catch {} // gewollt: Verfassen-Fenster schon geschlossen, nichts mehr aufzuräumen
      }
    });
  }

  // Rückfragen (Thunderbirds commonDialog als eigenes Fenster): unter macOS
  // steht der Titel schon fett als Überschrift im Dialog – die Titelleiste
  // bleibt dann leer wie bei Apple, statt denselben Text zu wiederholen.
  // Unter Windows/Linux zeigt nur die Titelleiste den Titel, dort unverändert
  watchPromptTitles() {
    ExtensionSupport.registerWindowListener("mail-cards-prompt-title", {
      chromeURLs: ["chrome://global/content/commonDialog.xhtml", "chrome://messenger/content/commonDialog.xhtml"],
      onLoadWindow: w => {
        try {
          dropRepeatedTitle(w);
        } catch (e) {
          log("prompt title error", e);
        }
      },
    });
    this.restorers.push(() => ExtensionSupport.unregisterWindowListener("mail-cards-prompt-title"));
  }

  // Chat-Stil „Thunderbird“ (mail): im Dunkelmodus die mitgelieferte Variante
  // „Dark“ statt der weißen „Light“ – für Vorschau in den Einstellungen und
  // Unterhaltungen. Nur der Standardwert wird umgestellt; wer eine Variante
  // oder einen anderen Stil gewählt hat, behält ihn.
  watchChatVariant() {
    const VARIANT = "messenger.options.messagesStyle.variant";
    const defaults = Services.prefs.getDefaultBranch("");
    let original;
    try {
      original = defaults.getCharPref(VARIANT);
    } catch {
      return;
    }
    const sync = w => {
      const theme = Services.prefs.getCharPref("messenger.options.messagesStyle.theme", "mail");
      const dark = theme == "mail" && w.matchMedia("(prefers-color-scheme: dark)").matches;
      const want = dark ? "Dark" : original;
      if (defaults.getCharPref(VARIANT) != want) {
        defaults.setCharPref(VARIANT, want);
        debugLog("Chat-Variante (Standard)", want);
      }
    };
    const queries = new Map();
    // anderer Stil gewählt: Standard zurück, sonst fehlte dort die Variante
    const themeObserver = () => {
      const w = Services.wm.getMostRecentWindow("mail:3pane");
      if (w) {
        sync(w);
      }
    };
    Services.prefs.addObserver("messenger.options.messagesStyle.theme", themeObserver);
    ExtensionSupport.registerWindowListener("mail-cards-chatvariant", {
      chromeURLs: ["chrome://messenger/content/messenger.xhtml"],
      onLoadWindow: w => {
        const mq = w.matchMedia("(prefers-color-scheme: dark)");
        const onChange = () => sync(w);
        mq.addEventListener("change", onChange);
        queries.set(w, () => mq.removeEventListener("change", onChange));
        w.addEventListener("unload", () => queries.delete(w), { once: true });
        sync(w);
      },
    });
    this.restorers.push(() => {
      ExtensionSupport.unregisterWindowListener("mail-cards-chatvariant");
      Services.prefs.removeObserver("messenger.options.messagesStyle.theme", themeObserver);
      for (const remove of queries.values()) {
        try {
          remove();
        } catch {} // gewollt: Abfrage schon entfernt
      }
      queries.clear();
      defaults.setCharPref(VARIANT, original);
    });
  }

  // Schmale Verfassen-Fenster: Thunderbird kürzt die Beschriftungen der
  // Symbolleiste („Se…“, sehr schmal mitten im Buchstaben). Wie Apple Mail
  // zeigt die Leiste dann nur Symbole (Attribut „mc-icons-only“, spaces.css;
  // Tooltips nennen die Knöpfe). Die Grenze hängt von der Sprache ab
  // („Verschlüsseln“ ist breiter als „Encrypt“), deshalb wird gemessen statt
  // eine feste Breite zu nehmen: nur Symbole, sobald eine Beschriftung oder
  // die Leiste überläuft; Beschriftungen zurück, sobald die Leiste so breit
  // ist, wie sie dafür sein muss.
  watchComposeToolbar(w, cleanups) {
    const d = w.document;
    const bar = d.getElementById("composeToolbar2");
    const box = d.getElementById("compose-toolbox");
    if (!bar || bar.__mcIconsWatched) {
      return;
    }
    bar.__mcIconsWatched = true;
    const ATTR = "mc-icons-only";
    let need = 0; // nötige Breite der Leiste für die Beschriftungen
    const update = () => {
      if (w.closed || !bar.isConnected) {
        return;
      }
      // Modus „nur Text“ bzw. „nur Symbole“ aus „Anpassen“ bleibt unberührt
      const mode = box?.getAttribute("mode");
      if (mode == "text" || mode == "icons") {
        bar.removeAttribute(ATTR);
        need = 0;
        return;
      }
      if (bar.hasAttribute(ATTR)) {
        if (bar.clientWidth >= need) {
          bar.removeAttribute(ATTR);
          // im nächsten Bild neu messen, falls es doch nicht passt
          w.requestAnimationFrame(update);
        }
        return;
      }
      let short = Math.max(0, bar.scrollWidth - bar.clientWidth);
      for (const button of bar.querySelectorAll(":scope > toolbarbutton")) {
        const text = button.querySelector(".toolbarbutton-text");
        if (!text?.getClientRects().length) {
          continue;
        }
        short += Math.max(0, text.scrollWidth - text.clientWidth, button.scrollWidth - button.clientWidth);
      }
      if (short > 1) {
        need = bar.clientWidth + short + 8;
        bar.setAttribute(ATTR, "true");
      }
    };
    const reset = () => {
      bar.removeAttribute(ATTR);
      need = 0;
      update();
    };
    const ro = new w.ResizeObserver(() => update());
    ro.observe(bar);
    // andere Knöpfe („Anpassen“) oder anderer Modus: neu messen
    const mo = new w.MutationObserver(reset);
    mo.observe(bar, { childList: true });
    if (box) {
      mo.observe(box, { attributes: true, attributeFilter: ["mode"] });
    }
    const cleanup = () => {
      ro.disconnect();
      mo.disconnect();
      cleanups.delete(cleanup);
      if (!w.closed) {
        bar.removeAttribute(ATTR);
        delete bar.__mcIconsWatched;
      }
    };
    cleanups.add(cleanup);
    w.addEventListener("unload", cleanup, { once: true });
    update();
  }

  // Kleinste Fensterbreite je Space: beim Verkleinern schrumpft nur ein
  // Bereich mit (die Mail, die Kalenderansicht, der Einstellungsinhalt …),
  // alle anderen behalten ihre Breite. Also darf das Fenster nur so schmal
  // werden, bis dieser Bereich seine Mindestbreite (CSS) erreicht – dann
  // überlappt nichts und nichts wird abgeschnitten.
  hookMinWindowWidth(w) {
    const d = w.document;
    const root = d.documentElement;
    const tabmail = d.getElementById("tabmail");
    const FLEX = ["messagePane", "detailsPane", "preferencesContainer", "calendar-task-details-container", "calendarDisplayBox", "conversationsBox"];
    // Elemente im Hauptdokument nur im passenden Tab (ausgeblendete Tabs behalten
    // ihre Breite: der Kalender maß sonst 560×0 px und sperrte die Fensterbreite)
    // (Aufgaben: die Details neben der Liste schrumpfen, mit ihrer Knopfzeile als Mindestbreite)
    const MODE = { calendarDisplayBox: ["calendar", "tasks"], conversationsBox: ["chat"], "calendar-task-details-container": ["tasks"] };
    const shown = el => {
      const r = el?.getBoundingClientRect();
      return !!r && r.width > 0 && r.height > 0 && (el.checkVisibility?.() ?? true);
    };
    let observed = new Set();
    const ro = new w.ResizeObserver(() => update());
    // { width, min, watch }: Breite und Mindestbreite des Bereichs, der beim
    // Verkleinern schrumpft, und die zu beobachtenden Elemente
    const measure = () => {
      const tab = tabmail?.currentTabInfo;
      const mode = tab?.mode?.name;
      const bd = tab?.browser?.contentDocument;
      if (mode == "addressBookTab" && bd?.getElementById("cardsPane")) {
        // Adressbuch: ohne Auswahl ist die Detailspalte ausgeblendet – dann zählt
        // der freie Platz rechts der Liste; das Ein- und Ausblenden meldet der
        // ResizeObserver (kein resize-Ereignis)
        const cw = bd.defaultView;
        const dp = bd.getElementById("detailsPane"), cp = bd.getElementById("cardsPane");
        const watch = [dp, cp].filter(Boolean);
        const min = (dp && parseFloat(cw.getComputedStyle(dp).minWidth)) || 560;
        if (shown(dp)) {
          return { width: dp.getBoundingClientRect().width, min: parseFloat(cw.getComputedStyle(dp).minWidth) || 0, watch };
        }
        if (!shown(cp)) {
          return { watch };
        }
        if (bd.body.classList.contains("layout-table")) {
          return { width: cp.getBoundingClientRect().width, min, watch };
        }
        return { width: cw.innerWidth - cp.getBoundingClientRect().right, min, watch };
      }
      // Aufgaben als Kanban: keine Detailspalte, es schrumpfen die drei Spalten
      // bis zu ihrer Mindestbreite (CSS von #mcTaskCards, ohne Innenabstand
      // gerechnet). Unter der Mindestbreite läuft die Fläche über (rechts unter
      // die Today-Pane bzw. aus dem Fenster), darum zählt der Platz bis dorthin,
      // nicht die eigene Breite – sonst blieb „Completed“ abgeschnitten
      if (mode == "tasks" && root.hasAttribute("mc-task-board")) {
        const list = d.getElementById("mcTaskCards");
        if (shown(list)) {
          const cs = w.getComputedStyle(list);
          const pad = cs.boxSizing == "border-box" ? 0 : (parseFloat(cs.paddingLeft) || 0) + (parseFloat(cs.paddingRight) || 0);
          const tp = d.getElementById("today-pane-panel");
          const end = shown(tp) ? tp.getBoundingClientRect().left : w.innerWidth;
          const watch = [list, tp].filter(Boolean);
          return { width: end - list.getBoundingClientRect().left, min: (parseFloat(cs.minWidth) || 0) + pad, watch, overflow: true };
        }
      }
      const docs = [tab?.chromeBrowser?.contentDocument, bd, d].filter(Boolean);
      for (const doc of docs) {
        for (const id of FLEX) {
          if (doc == d && MODE[id] && !MODE[id].includes(mode)) {
            continue;
          }
          const el = doc.getElementById(id);
          if (shown(el)) {
            const min = parseFloat(el.ownerDocument.defaultView.getComputedStyle(el).minWidth) || 0;
            return { width: el.getBoundingClientRect().width, min, watch: [el] };
          }
        }
      }
      return { watch: [] };
    };
    let later = null;
    // freier Platz des schrumpfenden Bereichs über seiner Mindestbreite (für das
    // automatische Einklappen); null, wenn es keinen gibt
    w.__mcLayoutSlack = () => {
      const { width, min } = measure();
      return width === undefined ? null : width - min;
    };
    const update = () => {
      try {
        // während einer Seitenleisten-Animation nicht rechnen: das Setzen am
        // Fenster würde jedes Bild das ganze Fenster neu gestalten (Ruckeln)
        if (d.getElementById("today-pane-panel")?.__mcAnimating || w.__mcSpacesAnimating) {
          w.clearTimeout(later);
          later = w.setTimeout(update, 350);
          return;
        }
        const { width, min, watch, overflow } = measure();
        const next = new Set(watch);
        for (const el of observed) {
          if (!next.has(el)) {
            ro.unobserve(el);
          }
        }
        for (const el of next) {
          if (!observed.has(el)) {
            ro.observe(el);
          }
        }
        observed = next;
        // ohne sichtbares Element keine Mindestbreite (nie innerWidth sperren)
        if (width === undefined) {
          root.style.removeProperty("min-width");
          return;
        }
        // (Kanban: der Platz kann kleiner als die Mindestbreite sein, dann wird das Fenster breiter)
        const slack = overflow ? width - min : Math.max(0, width - min);
        // nie unter 800 px (dann wäre schon die Toolbar zu eng)
        let value = Math.max(800, Math.round(w.innerWidth - slack));
        // Chat: Kontaktspalte + Chat-Knöpfe + kleinstes Suchfeld (40 px) + was
        // rechts der Suche liegt müssen nebeneinander passen
        if (tabmail?.currentTabInfo?.mode?.name == "chat") {
          const lp = d.getElementById("listPaneBox")?.getBoundingClientRect();
          const tb = d.getElementById("chat-view-toolbox")?.getBoundingClientRect();
          const s = d.querySelector('#unifiedToolbarContent > li[item-id="search-bar"]')?.getBoundingClientRect();
          if (lp?.width && tb?.width && s?.width) {
            value = Math.max(value, Math.ceil(lp.right + 12 + tb.width + 12 + 40 + (w.innerWidth - s.right)));
          }
        }
        // nie breiter als der Bildschirm: auf kleinen Bildschirmen (oder mit
        // Today-Pane) ließe sich das Fenster sonst nicht mehr einpassen
        const screenWidth = w.screen?.availWidth;
        if (screenWidth > 0) {
          value = Math.min(value, Math.max(800, screenWidth - (w.outerWidth - w.innerWidth)));
        }
        // nur bei echter Änderung schreiben (jedes Setzen gestaltet das Fenster neu)
        if (Math.abs((parseFloat(root.style.minWidth) || 0) - value) >= 2) {
          root.style.minWidth = `${value}px`;
        }
        if (value > w.innerWidth + 1) {
          grow(value);
        }
      } catch (e) {
        log("min window width error", e);
      }
    };
    // Neue Ansicht braucht mehr Platz, als das Fenster hat (z. B. Kanban nach
    // der schmalen Liste): breit genug machen und ganz im Bildschirm halten.
    // macOS verbreitert das Fenster durch die Mindestbreite selbst, aber nur
    // nach rechts – am rechten Rand lief es aus dem Bild. Nur im normalen
    // Fensterzustand (maximiert/Vollbild nichts tun), nicht unter Linux (siehe
    // fitScreen), und ein Fenster, das schon über den Rand ragte, bleibt stehen
    let growLater = null;
    const grow = value => {
      if (Services.appinfo.OS == "Linux" || w.windowState != w.STATE_NORMAL || w.fullScreen || !w.screen?.availWidth) {
        return;
      }
      const end = w.screen.availLeft + w.screen.availWidth;
      const inside = w.screenX + w.outerWidth <= end + 2;
      w.clearTimeout(growLater);
      growLater = w.setTimeout(() => {
        try {
          if (w.windowState != w.STATE_NORMAL || w.fullScreen) {
            return;
          }
          const outer = w.outerWidth + Math.max(0, value - w.innerWidth);
          const x = inside ? Math.max(w.screen.availLeft, Math.min(w.screenX, end - outer)) : w.screenX;
          if (x != w.screenX) {
            w.moveTo(x, w.screenY);
          }
          if (outer > w.outerWidth) {
            w.resizeTo(outer, w.outerHeight);
          }
        } catch (e) {
          log("grow window error", e);
        }
      }, 250);
    };
    const onTab = () => w.setTimeout(update, 300);
    tabmail?.tabContainer?.addEventListener("TabSelect", onTab);
    w.addEventListener("resize", update);
    // Fenster nie breiter als der Bildschirm (z. B. nach Doppelklick auf die
    // Titelleiste): auf die verfügbare Breite zurück und ganz ins Bild.
    // Nicht unter Linux: unter Wayland zählt outerWidth den Schatten der
    // Fensterdekoration mit (+48 px), w.screen ist nicht sicher der Bildschirm
    // des Fensters, und Tiling-Fenstermanager setzen die Größe selbst
    let fitLater = null;
    const fitScreen = () => {
      if (Services.appinfo.OS == "Linux") {
        return;
      }
      w.clearTimeout(fitLater);
      fitLater = w.setTimeout(() => {
        try {
          const sc = w.screen;
          // maximiert ist das Fenster unter Windows um die unsichtbaren Ränder
          // breiter als der Bildschirm (+16 px) – das ist richtig so, sonst
          // höbe resizeTo() das Maximieren gleich wieder auf
          if (!sc?.availWidth || w.windowState == w.STATE_FULLSCREEN || w.windowState == w.STATE_MAXIMIZED || w.fullScreen) {
            return;
          }
          if (w.outerWidth <= sc.availWidth + 2) {
            return;
          }
          update();
          w.resizeTo(sc.availWidth, w.outerHeight);
          w.moveTo(sc.availLeft, w.screenY);
        } catch (e) {
          log("fit screen error", e);
        }
      }, 250);
    };
    w.addEventListener("resize", fitScreen);
    w.addEventListener("sizemodechange", fitScreen);
    const timer = w.setTimeout(update, 2000);
    this.restorers.push(() => {
      ro.disconnect();
      w.clearTimeout(timer);
      w.clearTimeout(fitLater);
      w.clearTimeout(growLater);
      tabmail?.tabContainer?.removeEventListener("TabSelect", onTab);
      w.removeEventListener("resize", update);
      w.removeEventListener("resize", fitScreen);
      w.removeEventListener("sizemodechange", fitScreen);
      root.style.removeProperty("min-width");
    });
  }

  // Restorer, der nur so lange lebt wie sein (Inhalts-)Fenster: beim Schließen
  // verworfen – sonst hielte this.restorers das tote Fenster bis zum Beenden fest
  addWinRestorer(win, fn) {
    this.restorers.push(fn);
    if (!win) {
      return;
    }
    let set = this.winRestorers.get(win);
    if (!set) {
      set = new Set();
      this.winRestorers.set(win, set);
      win.addEventListener("unload", () => {
        this.winRestorers.delete(win);
        this.restorers = this.restorers.filter(f => !set.has(f));
      }, { once: true });
    }
    set.add(fn);
  }

  watchMainWindow(w) {
    if (this.mainWindows.has(w)) {
      return;
    }
    this.mainWindows.add(w);
    try {
      installDialogBox(w, { push: fn => this.addWinRestorer(w, fn) });
    } catch (e) {
      log("dialog box error", e);
    }
    // je Fenster (nicht am gemeinsamen Enhancer, sonst wirkt der Knopf im zuletzt
    // geöffneten Fenster): Tooltip des Seitenleisten-Knopfs und Popover „Neu“
    let sidebarTip = null;
    let newPopup = null;
    this.hookMinWindowWidth(w);
    // Leerer Chat: Thunderbird fokussiert den Standardknopf („Get started“)
    // per Skript, Gecko zeigt dann dauerhaft den Fokusring – Fokus behalten
    // (Return löst ihn aus), den Ring aber nur bei Tastaturbedienung zeigen
    const ch = w.chatHandler;
    if (ch && typeof ch._updateFocus == "function" && !ch.__mcFocusHooked) {
      const origFocus = ch._updateFocus;
      ch._updateFocus = function (...args) {
        const res = origFocus.apply(this, args);
        const el = w.document.activeElement;
        if (el?.matches?.(".im-placeholder-screen button") && el.matches(":focus-visible")) {
          el.blur();
          el.focus({ focusVisible: false });
        }
        return res;
      };
      ch.__mcFocusHooked = true;
      this.restorers.push(() => {
        ch._updateFocus = origFocus;
        delete ch.__mcFocusHooked;
      });
    }
    log("main window", { tabs: w.document.getElementById("tabmail")?.tabInfo?.length ?? null });
    // Attribut „mc-mail“ am Hauptfenster, solange ein Mail-Tab vorne ist –
    // userChrome.css färbt Toolbar- und Tab-Leiste nur dann wie Apple Mail.
    // Rechte Kante der Seitenleiste in den übrigen Bereichen (Kalender,
    // Aufgaben, Adressbuch, Chat, Einstellungen) relativ zur Toolbar-Zeile:
    // userChrome.css färbt damit die Zeile darüber im Seitenleisten-Grau.
    const SIDEBARS = {
      calendar: () => w.document.getElementById("calSidebar"),
      tasks: () => w.document.getElementById("calSidebar"),
      chat: () => w.document.getElementById("listPaneBox"),
      addressBookTab: tab => tab.browser?.contentDocument?.getElementById("booksPane"),
      // (die animierte Leiste selbst – ihr Inhalt behält beim Ein-/Ausblenden
      // seine volle Breite)
      preferencesTab: tab => {
        const doc = tab.browser?.contentDocument;
        return doc?.getElementById("pref-category-box") || doc?.getElementById("categories");
      },
      contentTab: tab => {
        const doc = tab.browser?.contentDocument;
        const url = doc?.documentURI || "";
        return url.startsWith("about:addons") ? doc.getElementById("sidebar")
          : url.startsWith("about:accountsettings") ? doc.getElementById("accountTreeBox")
          : null;
      },
    };
    // Bereiche-Leiste ausgeblendet: Thunderbird zeigt unten links einen Knopf zum
    // Einblenden – die Statusleiste beginnt dann rechts davon statt darunter
    const updateStatusMin = () => {
      const d = w.document;
      const status = d.getElementById("status-bar");
      const reveal = d.getElementById("spacesToolbarReveal");
      if (!status) {
        return;
      }
      const sr = status.getBoundingClientRect();
      // Thunderbirds Knopf, wenn er über der Statusleiste liegt
      const min = [reveal].reduce((m, b) => {
        const rr = b && !b.hidden ? b.getBoundingClientRect() : null;
        return rr?.width && rr.bottom > sr.top && rr.top < sr.bottom ? Math.max(m, Math.round(rr.right - sr.left + 8)) : m;
      }, 0);
      setVar(status, "--mc-status-min", `${Math.max(0, min)}px`);
    };
    this.statusMinUpdaters ??= new Set();
    this.statusMinUpdaters.add(updateStatusMin);
    this.restorers.push(() => {
      this.statusMinUpdaters?.delete(updateStatusMin);
      const status = w.document.getElementById("status-bar");
      status?.style.removeProperty("--mc-status-min");
      status?.style.removeProperty("--mc-status-side");
    });
    const updateSideEdgeLayout = () => {
      // während die Bereiche-Leiste animiert, nichts ans Fenster schreiben –
      // jede Variable dort kostet ein komplettes Neuberechnen (25–40 ms);
      // am Ende der Animation wird einmal ausgerichtet; die schwebende
      // Seitenleiste (Dia 3/4) verschiebt nichts – Kanten bleiben stehen
      if ((w.__mcSpacesAnimating && !w.__mcDry) || w.__mcSideFloat) {
        return;
      }
      const d = w.document;
      const tab = d.getElementById("tabmail")?.currentTabInfo;
      // Aufgaben, während die Today-Pane gleitet: Kanten stehen schon am
      // Endplatz (zu Beginn der Animation einmal gerechnet) – nachmessen
      // hinter der gleitenden Pane ließe „+“ und Suchfeld mitwandern und am
      // Ende zurückspringen
      const tpPanel = d.getElementById("today-pane-panel");
      if (tab?.mode?.name == "tasks" && tpPanel?.__mcSliding && !tpPanel.__mcEdgeNow) {
        return;
      }
      const el = SIDEBARS[tab?.mode?.name]?.(tab);
      const row = d.getElementById("unifiedToolbarContainer");
      if (!el || !row) {
        barTarget(d).style.removeProperty("--mc-side-right");
        d.getElementById("status-bar")?.style.removeProperty("--mc-status-side");
        updateStatusMin();
        // Tabs ohne eigene Seitenleiste (globale Suche, sonstige Inhalts-Tabs):
        // Abstandhalter nicht auf dem Wert des zuletzt besuchten Bereichs
        // lassen – Knöpfe und Suchfeld beginnen rechts vom Seitenleisten-Knopf
        // (gemessen nach dem Entfernen von --mc-side-right, also an seinem
        // Platz in diesem Tab)
        const content = row && d.getElementById("unifiedToolbarContent");
        const first = leadSpacer(content) || content;
        const pinned = rectOf(d.getElementById("spacesPinnedButton"));
        if (first && pinned?.width) {
          const start = rectOf(first).left;
          setBarVar(d, "--mc-tab-offset", `${Math.max(0, Math.round(pinned.right + 12 - start))}px`);
        }
        return;
      }
      const inContent = el.ownerDocument != d;
      const shift = inContent ? rectOf(tab.browser).left : 0;
      const r = rectOf(el);
      const rowLeft = rectOf(row).left;
      const right = r.width ? shift + r.right - rowLeft : 0;
      setBarVar(d, "--mc-side-right", `${Math.max(0, Math.round(right))}px`);
      // Statusleiste wie in der Mail: Inhalt (Online-Symbol …) beginnt rechts der
      // Seitenleiste dieses Bereichs statt am Fensterrand
      const status = d.getElementById("status-bar");
      if (status && tab.mode.name != "mail3PaneTab") {
        const sl = rectOf(status).left;
        setVar(status, "--mc-status-side", `${Math.max(0, Math.round(r.width ? shift + r.right - sl : 0))}px`);
      }
      updateStatusMin();
      // Wo die Knöpfe beginnen (erster Abstandhalter der Toolbar): im
      // Adressbuch über der Kontaktkarte rechts der Liste – wie in der Mail
      // über der geöffneten Nachricht –, sonst neben der Seitenleiste.
      const content = d.getElementById("unifiedToolbarContent");
      // Bezug: erster Abstandhalter (davor liegen ausgeblendete Knöpfe anderer Bereiche)
      const start = rectOf(leadSpacer(content) || content)?.left ?? rowLeft;
      let edge = shift + (r.width ? r.right : 0) + 12;
      // erste Knöpfe in jedem Bereich an derselben Stelle wie in der Mail
      // (Kalender und Aufgaben: „+“ wie in Apple Kalender gleich rechts der
      // Seitenleiste)
      const ownEdge = tab.mode.name == "calendar";
      if (this.mcButtonsLeft && !ownEdge) {
        edge = this.mcButtonsLeft;
      }
      if (tab.mode.name == "addressBookTab") {
        const cards = el.ownerDocument.getElementById("cardsPane");
        // (beim Abschalten/Update wieder abmelden – sonst richtet die alte
        // Fassung bis zum Neustart weiter aus und kämpft mit der neuen)
        if (cards && cards.__mcObserver?.owner !== this) {
          const ro = new el.ownerDocument.defaultView.ResizeObserver(() => updateSideEdge());
          ro.observe(cards);
          ro.observe(el); // Adressbuchliste ein-/ausgeblendet: Kontaktliste rückt
          el.ownerDocument.getElementById("booksSplitter") && ro.observe(el.ownerDocument.getElementById("booksSplitter"));
          cards.__mcObserver = { owner: this, ro };
          // am Adressbuch-Fenster: beim Schließen des Tabs verworfen (hielte sonst
          // das geschlossene Adressbuch samt Kontaktliste bis zum Beenden fest)
          this.addWinRestorer(el.ownerDocument.defaultView, () => {
            ro.disconnect();
            delete cards.__mcObserver;
          });
        }
        // Kontaktliste so breit wie die Mailliste – dann passen Kopfzeile und
        // Knöpfe genau ins selbe Raster
        const shared = el.ownerDocument.getElementById("sharedSplitter");
        // Ziehen am Teiler im Adressbuch: flüssig (währenddessen nicht
        // angleichen), nur so weit, dass Knöpfe und Suche Platz haben; die
        // neue Breite gilt danach auch für die Mailliste
        if (shared && !shared.__mcHooked && typeof shared._updateSize == "function") {
          shared.__mcHooked = true;
          const origUpdate = shared._updateSize;
          shared._updateSize = function (size) {
            const c = rectOf(cards);
            const b = rectOf(tab.browser);
            // (ohne Wert – beim Loslassen – nur die tatsächliche Größe übernehmen)
            if (typeof size == "number" && c && b) {
              const maxRight = rectOf(row).right - toolbarNeed(d);
              // nur am Wachsen hindern – nie unter die jetzige Breite drücken,
              // sonst springen Liste und Kontaktfoto beim Anfassen des Teilers
              size = Math.min(size, Math.max(160, Math.round(c.width), maxRight - (b.left + c.left)));
            }
            return origUpdate.call(this, size);
          };
          const onResizing = () => (shared.__mcDragging = true);
          const onResized = () => {
            if (!shared.__mcDragging) {
              return;
            }
            shared.__mcDragging = false;
            const c = rectOf(cards);
            const b = rectOf(tab.browser);
            if (c?.width && b) {
              this.mcListWidth = Math.round(c.width);
              this.mcButtonsLeft = b.left + c.right + 6;
              this.mcListPending = true; // die Mail übernimmt die Breite beim nächsten Anzeigen
            }
            updateSideEdge();
          };
          shared.addEventListener("splitter-resizing", onResizing);
          shared.addEventListener("splitter-resized", onResized);
          this.addWinRestorer(el.ownerDocument.defaultView, () => {
            shared._updateSize = origUpdate;
            shared.removeEventListener("splitter-resizing", onResizing);
            shared.removeEventListener("splitter-resized", onResized);
            delete shared.__mcHooked;
          });
        }
        // rechte Kante der Kontaktliste dort, wo in der Mail die Mailliste endet;
        // bei ausgeblendeter Adressbuchliste behält sie ihre Breite (wie die
        // Mailliste ohne Ordnerliste) – sonst wuchs sie um die frei gewordene
        // Spalte und das Fenster ließ sich nicht mehr schmaler machen
        const cl = rectOf(cards);
        // (nicht im Trockenlauf der Seitenleisten-Animation: der stellt den Endzustand nur zum Messen her – eine
        // Breite, die dort gesetzt wird, bliebe und ließe die Kontaktliste im ersten Bild um 260 px springen)
        if (this.mcButtonsLeft && shared && "width" in shared && !shared.__mcDragging && cl && !el.__mcShowing && !w.__mcDry &&
            !el.ownerDocument.body.classList.contains("layout-table")) {
          // … aber nie so breit, dass die Kontaktdetails unter ihre Mindestbreite
          // kämen (mit Today-Pane ist das Adressbuch enger als die Mail – sonst
          // drückte das Raster die Adressbuchliste zusammen)
          const dp = el.ownerDocument.getElementById("detailsPane");
          const detailsMin = (dp && parseFloat(el.ownerDocument.defaultView.getComputedStyle(dp).minWidth)) || 0;
          const room = Math.floor(el.ownerDocument.documentElement.clientWidth - cl.left - detailsMin - 2);
          const books = el.ownerDocument.getElementById("booksPane");
          const booksHidden = !books || books.classList.contains("mc-side-hidden") || !rectOf(books)?.width;
          const want = Math.min(booksHidden && this.mcListWidth ? this.mcListWidth
            : Math.round(this.mcButtonsLeft - 6 - (shift + cl.left)), room);
          if (want >= 160 && Math.abs((shared.width || 0) - want) >= 1) {
            shared.width = want;
          }
        }
        const cr = rectOf(cards);
        // Tabellenansicht: die Liste reicht bis zum Fensterrand – Knöpfe und
        // Suche bleiben an ihrem Platz, die Kopfzeile endet davor, und die
        // Trennlinie entfällt (keine Spaltenkante darunter)
        const table = el.ownerDocument.body.classList.contains("layout-table");
        d.documentElement.toggleAttribute("mc-ab-table", table);
        if (cr?.width && table) {
          setBarVar(d, "--mc-ab-list-right", `${Math.round(edge - 6 - rowLeft)}px`);
        } else if (cr?.width) {
          // Knöpfe nie über der Kontaktliste
          edge = Math.max(this.mcButtonsLeft ? edge : 0, shift + cr.right + 6);
          // (ungerundet: die Linie darüber setzt auf den Haarlinien-Rand der Liste auf)
          setBarVar(d, "--mc-ab-list-right", `${(shift + cr.right - rowLeft).toFixed(2)}px`);
        }
      }
      // Aufgaben wie die Mail: Kartenliste so breit wie die Mailliste (die Details
      // rechts nehmen den Rest), darüber Titel/Anzahl, Filter und „…“; die Knöpfe
      // beginnen rechts der Liste
      if (tab.mode.name == "tasks") {
        const side = d.documentElement.hasAttribute("mc-task-side");
        const details = d.getElementById("calendar-task-details-container");
        const taskList = d.documentElement.hasAttribute("mc-task-list") ? d.getElementById("mcTaskCards") : d.getElementById("calendar-task-tree");
        if (details?.__mcDragged) {
          // von Hand gezogen: diese Listenbreite gilt jetzt auch für Mail und Adressbuch
          delete details.__mcDragged;
          const lr0 = rectOf(taskList);
          if (lr0?.width) {
            this.mcListWidth = Math.round(lr0.width);
            this.mcButtonsLeft = lr0.right + 6;
            this.mcListPending = true;
          }
        }
        details?.setAttribute("data-mc-empty", tr("No Task Selected"));
        if (side && details && this.mcButtonsLeft && !details.__mcDragging) {
          const dr = rectOf(details);
          const lr = rectOf(taskList);
          // rechte Kante des Inhaltsbereichs (nicht der Details oder ihres Rahmens –
          // die wachsen mit der neuen Breite, das schaukelte sich auf)
          // (beim Ausblenden gilt schon das Endmaß: ohne Today-Pane)
          const tp = tpPanel?.__mcSliding == "out" ? null : rectOf(tpPanel);
          const right = Math.min(rectOf(d.getElementById("tabmail-container"))?.right || Infinity,
            tp?.width ? tp.left : Infinity, w.innerWidth);
          if (dr.width && lr?.width && right) {
            const splitW = Math.max(0, dr.left - lr.right);
            // wie die Mail: Liste so breit wie die Mailliste, die Details nehmen
            // den Rest – nie schmaler als ihre Knopfzeile (--mc-task-details-min)
            const want = Math.round(right - (this.mcButtonsLeft - 6) - splitW);
            const max = Math.round(right - lr.left - splitW - 280); // Liste mindestens 280 px
            const dmin = parseFloat(d.documentElement.style.getPropertyValue("--mc-task-details-min")) || 360;
            const width = Math.max(dmin, Math.min(want, max));
            if (Math.abs(dr.width - width) >= 1) {
              details.style.width = `${width}px`;
            }
          }
        }
        const lr = rectOf(taskList);
        const plus = [...d.querySelectorAll('#unifiedToolbarContent > li:is([item-id="new-task"], [item-id="new-event"])')]
          .find(li => rectOf(li).width);
        const pr = rectOf(plus?.querySelector("button"));
        let headRight;
        {
          if (side && lr?.width) {
            // (immer an der Liste, nicht am Platz der Mail-Knöpfe – beim Ziehen
            // des Teilers wird die Liste schmaler, „+“ und Aktionen folgen ihr)
            edge = lr.right + 6;
            headRight = lr.right;
            // Mindestbreite der Details: ihre Knopfzeile – „+“ samt dem Platz
            // der Aktionen rechts davon, Suchfeld als Lupe, was rechts der Suche
            // steht (Today-Knopf) und Innenabstand; darunter hält die
            // Mindestbreite des Fensters fest (Bezeichnungen nie gekürzt)
            const dr = rectOf(details);
            const pl = rectOf(plus);
            const search = d.querySelector('#unifiedToolbarContent > li[item-id="search-bar"]');
            const sr = rectOf(search);
            if (dr?.width && pl?.width && sr?.width) {
              const reserve = parseFloat(w.getComputedStyle(plus).marginInlineEnd) || 0;
              // (rechts der Suche bis zur Kante der Details, z. B. der Today-Knopf
              // bei geschlossener Today-Pane – nicht die Today-Pane selbst)
              const tail = Math.max(0, dr.right - sr.right);
              // (mindestens 300 px wie beim Ziehen: Platz für die Knöpfe über der Aufgabe)
              const need = Math.max(300, Math.ceil(pl.right + reserve - dr.left + 40 + tail + 6));
              if (Math.abs((parseFloat(d.documentElement.style.getPropertyValue("--mc-task-details-min")) || 0) - need) >= 1) {
                d.documentElement.style.setProperty("--mc-task-details-min", `${need}px`);
              }
            }
          } else {
            headRight = edge - 6;
          }
          // Kopf (Titel, Filter, „…“) endet immer vor dem „+“ und den Aktionen
          // rechts davon – auch wenn die Details bei schmalem Fenster unter die
          // Liste rutschen (dann galt sonst die alte, breitere Kante weiter)
          // (die Kapsel endet 8 px vor dieser Kante)
          if (pr?.width && pr.left - 2 < headRight) {
            headRight = pr.left - 2;
          }
          // Knöpfe der gewählten Aufgabe gleich rechts vom „+“ in der Toolbar-Zeile
          if (pr?.width) {
            setVar(d.getElementById("task-actions-toolbar"), "--mc-ta-left", `${Math.round(pr.right + 8)}px`);
          }
        }
        setBarVar(d, "--mc-task-list-right", `${Math.round(headRight - rowLeft)}px`);
        // Aktionen und Kopf richten sich nach dem gemessenen „+“ – das springt
        // erst mit dieser Rechnung an seinen Platz (z. B. beim Wechsel zwischen
        // „Details daneben“ und „darunter“): stand es woanders, im übernächsten
        // Bild noch einmal ausrichten (hört auf, sobald es still steht)
        const plusAt = `${side}:${Math.round(pr?.left ?? -1)}`;
        if (w.__mcPlusAt !== plusAt) {
          w.__mcPlusAt = plusAt;
          w.requestAnimationFrame(() => w.requestAnimationFrame(updateSideEdge));
        }
        // Haarlinie in der Toolbar-Zeile genau über dem Teiler zu den Details
        // (durchgehend vom oberen Rand bis unten)
        const split = rectOf(d.getElementById("calendar-task-view-splitter"));
        setBarVar(d, "--mc-task-line", split?.width ? `${Math.round(split.left - rowLeft)}px` : `${Math.round(headRight - rowLeft)}px`);
        d.documentElement.toggleAttribute("mc-task-table", !side);
      }
      const toggle = rectOf(d.getElementById("spacesPinnedButton"));
      if (toggle?.width) {
        edge = Math.max(edge, toggle.right + 12);
      }
      // Chat: Knöpfe und Suche dürfen sich nie überlagern – erst die Suche bis
      // 160 px kürzen, dann die Knöpfe nach links rücken (höchstens bis neben
      // die Kontaktspalte), zuletzt die Suche bis 40 px kürzen (das Suchfeld
      // steht rechtsbündig, seine rechte Kante bleibt beim Kürzen stehen)
      if (tab.mode.name == "chat") {
        const tb = rectOf(d.getElementById("chat-view-toolbox"));
        const sLi = d.querySelector('#unifiedToolbarContent > li[item-id="search-bar"]');
        const s = rectOf(sLi);
        if (tb?.width && s?.width) {
          const sideEdge = Math.max(shift + (r.width ? r.right : 0) + 12, toggle?.width ? toggle.right + 12 : 0);
          // (das Suchfeld ist höchstens so breit wie sein Text, oft unter 160 px)
          const sWant = Math.min(160, parseFloat(sLi.style.getPropertyValue("--mc-search-fit")) || 160);
          edge = Math.max(sideEdge, Math.min(edge, s.right - 12 - sWant - tb.width));
          setBarVar(d, "--mc-chat-search-max", `${Math.max(40, Math.floor(s.right - (edge + tb.width) - 12))}px`);
        }
      }
      setBarVar(d, "--mc-tab-offset", `${Math.max(0, Math.round(edge - start))}px`);
      // dieselbe Kante im Fenster und die Toolbar-Zeile – für Leisten, die
      // in diese Zeile verlegt werden (Chat)
      const rr = rectOf(row);
      // nur an den Leisten, die in die Toolbar-Zeile verlegt werden
      const rowVar = (name, value) => {
        for (const id of ["chat-view-toolbox", "viewToggle", "task-addition-box", "task-actions-toolbar"]) {
          setVar(d.getElementById(id), name, value);
        }
      };
      rowVar("--mc-caption-w", `${captionWidth(d)}px`);
      // Minikalender der Today-Pane so breit wie der in der Kalenderleiste
      const calMm = d.getElementById("calMinimonth");
      if (calMm?.offsetWidth) {
        setVar(d.getElementById("today-minimonth"), "--mc-mm-w", `${calMm.offsetWidth}px`);
      }
      rowVar("--mc-tab-left", `${Math.round(edge)}px`);
      // linke Kante des Suchfelds: der Hinweis „schreibgeschützter Kalender“
      // in der Toolbar-Zeile endet davor
      const sb = rectOf(d.querySelector('#unifiedToolbarContent > li[item-id="search-bar"]:not([hidden])'));
      if (sb?.width) {
        rowVar("--mc-search-left", `${Math.round(sb.left)}px`);
        // Aufgaben: der Hinweis endet vor den Knöpfen der Aufgabe (stehen vor dem Suchfeld)
        const ta = tab.mode.name == "tasks" ? rectOf(d.getElementById("task-actions-toolbar")) : null;
        if (ta?.width) {
          setVar(d.getElementById("task-addition-box"), "--mc-search-left", `${Math.round(ta.left)}px`);
        }
      }
      rowVar("--mc-row-top", `${Math.round(rr.top)}px`);
      rowVar("--mc-row-h", `${Math.round(rr.height)}px`);
      const toggle2 = d.getElementById("viewToggle");
      if (toggle2?.offsetWidth) {
        setVar(toggle2, "--mc-toggle-half", `${Math.ceil(toggle2.offsetWidth / 2)}px`);
        // Suchfeld im Kalender nie unter der mittigen Umschaltung (Windows:
        // Fenstertasten und ≡-Menü nehmen rechts Platz weg)
        const search = rectOf(d.querySelector('#unifiedToolbarContent > li[item-id="search-bar"]'));
        if (search?.width) {
          const tr = rectOf(toggle2);
          setBarVar(d, "--mc-cal-search-max", `${Math.max(40, Math.floor(search.right - tr.right - 12))}px`);
        }
      }
    };
    // Mindestbreite des Fensters in der Mail im eigenen Tab: so breit, dass rechts
    // vom Seitenleisten-Knopf die Pillen, die nie weichen (Abrufen + Verfassen),
    // „»“ und das Suchfeld als Lupe Platz haben – ohne Ordner- und Mailliste
    // ließ sich das Fenster sonst so schmal machen, dass Knöpfe aus der Zeile
    // ragten bzw. über dem Seitenleisten-Knopf lagen (in der Mailansicht mit
    // Listen ist das Fenster durch deren Mindestbreiten ohnehin breiter)
    const fitMailWindow = mode => {
      const root = w.document.documentElement;
      if (mode != "mailMessageTab") {
        if (w.__mcMinWidth) {
          root.style.removeProperty("min-width");
          delete w.__mcMinWidth;
        }
        return;
      }
      const content = w.document.getElementById("unifiedToolbarContent");
      const pinned = rectOf(w.document.getElementById("spacesPinnedButton"));
      const left = pinned?.width ? pinned.right + 12 : rectOf(content)?.left || 0;
      const need = Math.ceil(left + toolbarNeed(w.document, true, 40));
      if (need > 200 && need != w.__mcMinWidth) {
        w.__mcMinWidth = need;
        root.style.setProperty("min-width", `${need}px`);
      }
      // schon schmaler (z. B. zuvor in einem anderen Bereich verkleinert): verbreitern
      if (w.__mcMinWidth && w.innerWidth < w.__mcMinWidth && w.windowState == w.STATE_NORMAL) {
        w.resizeBy(w.__mcMinWidth - w.innerWidth, 0);
      }
    };
    this.restorers.push(() => {
      if (w.__mcMinWidth) {
        w.document.documentElement.style.removeProperty("min-width");
        delete w.__mcMinWidth;
      }
    });
    // Überlauf der Toolbar in den übrigen Bereichen (die Mailansicht misst an
    // der Listenkante selbst, siehe squeezeToolbar im Mail-Layout)
    const squeezeSpace = () => {
      const d = w.document;
      const tpPanel = d.getElementById("today-pane-panel");
      if (w.__mcSpacesAnimating || tpPanel?.__mcAnimating || tpPanel?.__mcSliding) {
        return;
      }
      const mode = d.getElementById("tabmail")?.currentTabInfo?.mode?.name;
      fitMailWindow(mode);
      if (mode == "mail3PaneTab") {
        return;
      }
      if (!OVERFLOW_TABS.includes(mode)) {
        squeezeToolbar(d, () => true);
        return;
      }
      const content = d.getElementById("unifiedToolbarContent");
      if (!content) {
        return;
      }
      const search = content.querySelector(':scope > li[item-id="search-bar"]');
      squeezeToolbar(d, () => {
        const right = rectOf(content).right - (parseFloat(w.getComputedStyle(content).paddingInlineEnd) || 0) + 1;
        return [...content.children].every(li => {
          const r = rectOf(li);
          return li.getAttribute("item-id") == "spacer" || !r?.width || r.right <= right;
        }) && !searchLackOf(content, search);
      });
    };
    const updateSideEdge = () => {
      if (w.__mcSideFloat) {
        return;
      }
      updateSideEdgeLayout();
      try {
        squeezeSpace();
      } catch (e) {
        log("toolbar overflow error", e);
      }
    };
    this.restorers.push(() => removeOverflowButton(w.document));
    // Suchfeld, das nur noch die Lupe ist: ein Klick darauf (bzw. der Fokus,
    // z. B. mit ⌘K) öffnet es wie in Apple Mail auf Lupe + Platzhalter, dafür
    // weichen Pillen ins Menü „»“ (squeezeToolbar). Verliert es leer den Fokus,
    // wird es wieder die Lupe. Vorher blieb es 40 px schmal, man tippte
    // unsichtbar hinein (GitHub #67)
    const searchLiOf = e => e.target?.closest?.('#unifiedToolbarContent > li[item-id="search-bar"]');
    const searchInput = li => {
      const bar = li.querySelector("global-search-bar, search-bar, .search-bar");
      return bar?.shadowRoot?.querySelector("input") || li.querySelector("input");
    };
    const relayoutToolbar = () => {
      this.sideEdgeUpdaters?.forEach(fn => fn());
      this.offsetUpdaters?.forEach(fn => fn());
    };
    const openSearch = e => {
      const li = searchLiOf(e);
      // (nur, wenn es wegen weichender Pillen die Lupe ist; im Kalender und
      // im Chat begrenzt die Umschaltung bzw. die Chat-Leiste seine Breite –
      // dort brächte das Weichen der Pillen ihm keinen Platz)
      if (!li || li.hasAttribute("mc-search-open") || !li.parentNode?.hasAttribute("mc-search-lupe") ||
          ["calendar", "chat"].includes(w.document.documentElement.getAttribute("mc-tab"))) {
        return;
      }
      li.setAttribute("mc-search-open", "");
      relayoutToolbar();
      // (die Lupe ist ein Knopf im Feld – der Klick soll ins Textfeld führen)
      const input = searchInput(li);
      if (input && input.getRootNode().activeElement != input) {
        input.focus();
      }
    };
    const closeSearch = e => {
      const li = searchLiOf(e);
      if (!li?.hasAttribute("mc-search-open")) {
        return;
      }
      // (erst nach dem Fokuswechsel: innerhalb des Felds wandert er nur)
      w.setTimeout(() => {
        if (!li.hasAttribute("mc-search-open") || li.matches(":focus-within") || searchInput(li)?.value?.trim()) {
          return;
        }
        li.removeAttribute("mc-search-open");
        relayoutToolbar();
      }, 0);
    };
    w.document.addEventListener("click", openSearch, true);
    w.document.addEventListener("focusin", openSearch, true);
    w.document.addEventListener("focusout", closeSearch, true);
    this.restorers.push(() => {
      w.document.removeEventListener("click", openSearch, true);
      w.document.removeEventListener("focusin", openSearch, true);
      w.document.removeEventListener("focusout", closeSearch, true);
      w.document.querySelector("#unifiedToolbarContent > li[mc-search-open]")?.removeAttribute("mc-search-open");
    });
    this.sideEdgeUpdaters ??= new Set();
    this.sideEdgeUpdaters.add(updateSideEdge);
    const sideRO = new w.ResizeObserver(updateSideEdge);
    // (chat-view-toolbox: andere Breite der Chat-Knöpfe, z. B. neuer Statustext)
    for (const id of ["calSidebar", "listPaneBox", "tabmail-container", "chat-view-toolbox"]) {
      const el = w.document.getElementById(id);
      if (el) {
        sideRO.observe(el);
      }
    }
    this.restorers.push(() => sideRO.disconnect());

    // userChrome.css gilt nicht für Seiten in eigenen Browsern (Adressbuch,
    // Einstellungen, Add-ons). Dort dasselbe Stylesheet aus dem Profil als
    // User-Sheet laden, damit Farben und Regeln überall gleich sind.
    const CONTENT_PAGES = /^about:(addressbook|preferences|addons|accountsettings|accountsetup)/;
    const sheetURI = () => {
      if (ThemeSheet.active) {
        return ThemeSheet.uri;
      }
      const file = Services.dirsvc.get("ProfD", Ci.nsIFile);
      file.append("chrome");
      file.append("userChrome.css");
      return file.exists() ? Services.io.newFileURI(file).spec : null;
    };
    // Initialen wie Apple Kontakte: Vor- und Nachname → zwei Buchstaben
    // („AW“), sonst die ersten zwei Wörter des Namens, bei einem Wort einer.
    const firstLetter = word =>
      Array.from((word || "").normalize().replaceAll(/[^\p{Letter}\p{Nd}]+/gu, ""))[0] || "";
    const initialOf = (name, card) => {
      const first = firstLetter(card?.firstName);
      const last = firstLetter(card?.lastName);
      if (first && last) {
        return (first + last).toUpperCase();
      }
      const words = (name || "").normalize().split(/\s+/).map(firstLetter).filter(Boolean);
      return words.slice(0, 2).join("").toUpperCase();
    };
    // Firma statt Person (wie Apple Kontakte): als Firma markiert (iCloud:
    // X-ABShowAs:COMPANY) oder ohne Vor-/Nachname, aber mit Firmenname
    const isCompany = card => {
      if (!card || card.isMailList) {
        return false;
      }
      let props = null;
      try {
        props = card.supportsVCard ? card.vCardProperties : null;
      } catch {} // gewollt: Karte ohne lesbare vCard, Name wie von Thunderbird
      const showAs = String(props?.getFirstValue("x-abshowas") || "").toUpperCase();
      if (showAs == "COMPANY") {
        return true;
      }
      const prop = name => {
        try {
          return card.getProperty(name, "") || "";
        } catch {
          return "";
        }
      };
      const org = (props && [props.getFirstValue("org")].flat()[0]) || prop("Company");
      return !!org && !card.firstName && !card.lastName;
    };
    const COMPANY_AVATAR = "resource://mailcards/icons/company-avatar.svg";
    // neuer Kontakt noch ohne Namen: Person auf dem Verlauf statt Initialen
    const PERSON_AVATAR = "resource://mailcards/icons/person-avatar.svg";
    // großes Bild ohne Foto: Initialen auf dem Verlauf der Liste (statt
    // Thunderbirds Umriss-Figur)
    const initialsImage = text => {
      const esc = String(text).replace(/[<>&"']/g, ch => `&#${ch.charCodeAt(0)};`);
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#B4CAE4"/><stop offset="1" stop-color="#8A97C5"/></linearGradient></defs><rect width="100" height="100" fill="url(#g)"/><text x="50" y="50" dy="0.35em" text-anchor="middle" fill="#fff" font-family="-apple-system, BlinkMacSystemFont, system-ui, sans-serif" font-weight="600" font-size="44">${esc}</text></svg>`;
      return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
    };
    // Kontaktfotos, die sich nicht laden lassen (z. B. verwaiste Foto-Datei),
    // zeigen sonst den Ersatztext „Profile picture …“. Dann wie bei Kontakten
    // ohne Foto die Initialen anzeigen.
    const fixAvatar = (el, name, card) => {
      const img = el.shadowRoot?.querySelector("img");
      const letters = el.shadowRoot?.querySelector("span");
      // Zeilen der Kontaktliste werden beim Scrollen für andere Kontakte
      // wiederverwendet: den Handler des vorigen Kontakts zuerst entfernen,
      // sonst schreibt er dessen Initialen in diese Zeile
      if (img && el.__mcFallback) {
        img.removeEventListener("error", el.__mcFallback);
        el.__mcFallback = null;
      }
      if (!img || !letters || !img.getAttribute("src") || el.classList.contains("is-mail-list")) {
        return;
      }
      const fallback = () => {
        if (img.hidden || !img.getAttribute("src")) {
          return;
        }
        img.hidden = true;
        letters.textContent = initialOf(typeof name == "function" ? name() : name, card);
        letters.hidden = false;
      };
      // kein Ersatztext „Profile picture …“, auch nicht während des Ladens
      img.removeAttribute("data-l10n-id");
      img.removeAttribute("data-l10n-args");
      img.alt = "";
      if (img.complete && img.naturalWidth == 0) {
        fallback();
      } else {
        el.__mcFallback = fallback;
        img.addEventListener("error", fallback, { once: true });
      }
    };
    const hookAvatars = cw => {
      const restorers = { push: fn => this.addWinRestorer(cw, fn) };
      const Avatar = cw.customElements?.get("contact-avatar");
      if (!Avatar || Avatar.prototype.__mcFix) {
        return;
      }
      const orig = Avatar.prototype.setData;
      Avatar.prototype.setData = function (opts = {}) {
        const result = orig.call(this, opts);
        const c = opts.card;
        const name = c?.displayName || c?.primaryEmail || c?.name || c?.email || opts.recipient;
        const photoURL = c?.photoURL || "";
        if (c && !c.isMailList && !photoURL.startsWith("data:")) {
          const local = MacPhotos.lookup([c.primaryEmail, ...(c.emailAddresses || [])], c.displayName || opts.recipient);
          const img = this.shadowRoot?.querySelector("img");
          const span = this.shadowRoot?.querySelector("span");
          if (local && img && span) {
            img.src = MacPhotos.fileURL(local);
            img.hidden = false;
            span.hidden = true;
          }
        }
        // ohne Foto: zwei Initialen statt Thunderbirds einem Buchstaben,
        // bei Firmen ein Gebäude (Bild über CSS, Klasse mc-company)
        const letters = this.shadowRoot?.querySelector("span");
        if (letters && !letters.hidden && !c?.isMailList) {
          if (isCompany(c)) {
            letters.textContent = "";
            this.classList.add("mc-company");
          } else {
            const text = initialOf(opts.recipient || name, c);
            if (text) {
              letters.textContent = text;
            }
          }
        }
        fixAvatar(this, opts.recipient || name, c);
        // Kartenansicht wie macOS-Kontakte: nur Name bzw. Firma, nie die E-Mail-Adresse
        // (zweite Zeile: Firma; ohne Namen steht die Firma oben, nur ohne beides die Adresse)
        const row = this.closest?.('tr[is="ab-card-row"]');
        if (row?.address && c && !c.isMailList) {
          // Firma: vCard ORG (Thunderbird 158 füllt „Company“ nicht mehr), sonst die alte Eigenschaft
          let company = "";
          try {
            const org = c.supportsVCard ? c.vCardProperties?.getFirstValue("org") : null;
            company = String((Array.isArray(org) ? org[0] : org) || c.getProperty?.("Company", "") || "").trim();
          } catch {} // gewollt: Firma nicht lesbar, Name bleibt wie von Thunderbird
          const nameEl = row.querySelector(".ab-card-first-line .name");
          // ohne Namen erzeugt Thunderbird ihn aus der Adresse („nur.firma“)
          const named = !!(c.displayName || c.firstName || c.lastName);
          if (!named && nameEl) {
            nameEl.textContent = company || c.primaryEmail || nameEl.textContent;
            company = "";
          }
          row.address.textContent = company;
          row.classList.toggle("mc-one-line", !company);
        }
        return result;
      };
      Avatar.prototype.__mcFix = true;
      restorers.push(() => {
        Avatar.prototype.setData = orig;
        delete Avatar.prototype.__mcFix;
      });
      // Großes Foto in Detailansicht und Bearbeiten: Foto aus der macOS-Kontakte-App,
      // wenn iCloud nur den Link hat; ohne Foto (oder wenn es sich nicht laden
      // lässt) wie in der Liste die Initialen bzw. bei Firmen das Gebäude
      const PLACEHOLDER = "chrome://messenger/skin/icons/new/compact/user.svg";
      const hookPhoto = (photo, info) => {
        if (!photo) {
          return;
        }
        const generate = () => {
          const { card, name, first, last, person } = info();
          const text = initialOf(name, { firstName: first ?? card?.firstName, lastName: last ?? card?.lastName });
          const url = card && isCompany(card) ? COMPANY_AVATAR : text ? initialsImage(text) : person ? PERSON_AVATAR : "";
          if (url && url != photo.getAttribute("src")) {
            photo.__mcGenerated = url;
            photo.src = url;
          }
        };
        const fixPhoto = () => {
          const { card } = info();
          const src = photo.getAttribute("src") || "";
          if (src && src != PLACEHOLDER && src != photo.__mcGenerated) {
            // eigenes Foto: nur iCloud-Links durch das lokale Foto ersetzen
            if (card && !/^(data|file|blob):/.test(src)) {
              const local = MacPhotos.lookup([card.primaryEmail, ...(card.emailAddresses || [])], card.displayName);
              if (local) {
                photo.src = MacPhotos.fileURL(local);
              }
            }
            return;
          }
          generate();
        };
        const onError = () => {
          if (photo.getAttribute("src") != photo.__mcGenerated) {
            generate();
          }
        };
        photo.addEventListener("error", onError);
        const mo = new cw.MutationObserver(fixPhoto);
        mo.observe(photo, { attributes: true, attributeFilter: ["src"] });
        fixPhoto();
        restorers.push(() => {
          mo.disconnect();
          photo.removeEventListener("error", onError);
        });
        return fixPhoto;
      };
      hookPhoto(cw.document.getElementById("viewContactPhoto"), () => {
        const card = cw.detailsPane?.currentCard;
        return { card, name: card?.displayName || card?.primaryEmail };
      });
      // Bearbeiten: Initialen folgen dem Namen während der Eingabe
      const editHeading = cw.document.getElementById("editContactHeadingName");
      const fixEditPhoto = hookPhoto(cw.document.querySelector("#photoInput .contact-photo"), () => {
        const val = id => cw.document.getElementById(id)?.value?.trim();
        const card = cw.detailsPane?.currentCard;
        const first = val("vcard-n-firstname");
        const last = val("vcard-n-lastname");
        if (card) {
          return { card, name: editHeading?.textContent, first, last };
        }
        // neuer Kontakt: Überschrift ist anfangs der Platzhalter „New Contact“ –
        // Initialen nur aus den Feldern (Anzeigename, Vor-/Nachname, E-Mail)
        const email = cw.document.querySelector('#vcard-email input[type="email"]')?.value?.trim();
        const name = val("vCardDisplayName") || [first, last].filter(Boolean).join(" ") ||
          (email ? email.split("@")[0] : "");
        return { card: null, name, first, last, person: true };
      });
      if (fixEditPhoto && editHeading) {
        const mo = new cw.MutationObserver(fixEditPhoto);
        mo.observe(editHeading, { childList: true, characterData: true, subtree: true });
        restorers.push(() => mo.disconnect());
      }
      // schon angezeigte Fotos ebenfalls prüfen
      for (const el of cw.document.querySelectorAll("contact-avatar")) {
        fixAvatar(el, () =>
          el.closest(".card-container")?.querySelector(".name")?.textContent ||
          cw.document.getElementById("viewContactName")?.textContent || "");
      }
    };

    // Bearbeiten wie Apple Kontakte: sichtbar sind Vor- und Nachname, E-Mail,
    // Telefon und Adressen; leere seltene Felder erst nach „Weitere Felder“,
    // Präfix, zweiter Vorname, Suffix, Spitzname, Anzeigename nach
    // „Weitere Namensfelder“. Was schon ausgefüllt ist, bleibt immer sichtbar.
    const hookEditLayout = cw => {
      const restorers = { push: fn => this.addWinRestorer(cw, fn) };
      // vcard-edit definiert erst edit.mjs am Ende des Dokuments – läuft der
      // erste Aufruf früher, auf die Definition warten statt das Fenster
      // ungepatcht zu lassen
      const EditCard = cw.customElements?.get("vcard-edit");
      if (!EditCard) {
        if (cw.customElements && !cw.__mcLayoutWait) {
          cw.__mcLayoutWait = true;
          cw.customElements.whenDefined("vcard-edit").then(() => {
            cw.__mcLayoutWait = false;
            try {
              hookEditLayout(cw);
            } catch (e) {
              log("contact edit layout error", e);
            }
          });
        }
        return;
      }
      if (EditCard.prototype.__mcLayout) {
        return;
      }
      const OPTIONAL = {
        url: ["url"],
        tz: ["tz"],
        impp: ["impp"],
        "bday-anniversary": ["bday", "anniversary"],
        note: ["note"],
        org: ["title", "role", "org"],
        custom: ["x-custom1", "x-custom2", "x-custom3", "x-custom4"],
      };
      const NAME_PARTS = ["prefix", "middlename", "suffix"];
      const filled = value => [value].flat().some(v => v != null && String(v).trim());
      const moreButton = (onClick) => {
        const b = cw.document.createElement("button");
        b.type = "button";
        b.className = "mc-more-button";
        b.addEventListener("click", onClick);
        return b;
      };
      const label = (b, open, more, fewer) => {
        if (b) {
          b.textContent = tr(open ? fewer : more);
          b.setAttribute("aria-expanded", String(open));
        }
      };
      // Thunderbird überträgt Eingaben erst beim Speichern (saveVCard →
      // fromUIToVCardPropertyEntry) in vCardProperties – gerade Getipptes
      // steht nur in den Feldern; deshalb auch die Textfelder der Gruppe lesen,
      // sonst verschwindet sie bei „Weniger Felder“ bis zum Speichern
      const typed = fs => [...fs.querySelectorAll("input, textarea")]
        .some(i => !/^(checkbox|radio|button|hidden)$/.test(i.type || "") && filled(i.value));
      const markOptional = ve => {
        const entries = ve.vCardProperties?.entries || [];
        for (const [id, keys] of Object.entries(OPTIONAL)) {
          const fs = ve.querySelector(`#addr-book-edit-${id}`);
          fs?.setAttribute("mc-optional", "");
          fs?.toggleAttribute("mc-filled", entries.some(e => keys.includes(e.name) && filled(e.value)) || (!!fs && typed(fs)));
        }
      };
      const markNames = n => {
        for (const part of NAME_PARTS) {
          const el = n.querySelector(`#n-list-component-${part}`);
          el?.toggleAttribute("mc-filled", filled(el.querySelector("input")?.value));
        }
        const nick = n.querySelector("vcard-nickname");
        nick?.toggleAttribute("mc-filled", filled(nick.querySelector("input")?.value));
      };
      const setNames = (n, open) => {
        if (open) {
          // gleich als Felder zeigen statt Thunderbirds einzelner „+“-Knöpfe
          for (const part of NAME_PARTS) {
            const el = n.querySelector(`#n-list-component-${part}`);
            if (el?.classList.contains("hasButton")) {
              el.querySelector("label").hidden = false;
              el.querySelector("input").hidden = false;
              el.querySelector("button").hidden = true;
              el.classList.remove("hasButton");
            }
          }
        } else {
          markNames(n);
        }
        n.classList.toggle("mc-more", open);
        label(n.__mcButton, open, "More name fields", "Fewer name fields");
      };
      const setMore = (ve, open) => {
        if (!open) {
          markOptional(ve);
        }
        ve.classList.toggle("mc-more", open);
        label(ve.__mcButton, open, "More fields", "Fewer fields");
      };
      const layout = ve => {
        const n = ve.querySelector("#addr-book-edit-n");
        if (!n || !ve.vCardProperties) {
          return;
        }
        markOptional(ve);
        n.__mcButton = moreButton(() => setNames(n, !n.classList.contains("mc-more")));
        n.append(n.__mcButton);
        setNames(n, false);
        if (!ve.__mcButton) {
          ve.__mcButton = moreButton(() => setMore(ve, !ve.classList.contains("mc-more")));
        }
        if (!ve.__mcButton.isConnected) {
          ve.after(ve.__mcButton);
        }
        setMore(ve, false);
      };
      const origUpdate = EditCard.prototype.updateView;
      EditCard.prototype.updateView = function (...args) {
        const result = origUpdate.apply(this, args);
        try {
          layout(this);
        } catch (e) {
          log("contact edit layout error", e);
        }
        return result;
      };
      EditCard.prototype.__mcLayout = true;
      restorers.push(() => {
        EditCard.prototype.updateView = origUpdate;
        delete EditCard.prototype.__mcLayout;
        for (const el of cw.document.querySelectorAll(".mc-more-button")) {
          el.remove();
        }
      });
      for (const ve of cw.document.querySelectorAll("vcard-edit")) {
        layout(ve);
      }
    };

    // Adressbuch: doppelte Kontakte zusammenführen (nur in der Anzeige – an den
    // Kontakten in Google/iCloud ändert sich nichts). Gleich ist, was denselben
    // Namen hat und dieselbe E-Mail-Adresse oder bei einem von beiden keine.
    // Von mehreren gleichen bleibt der vollständigste Eintrag stehen.
    // Ein-/ausschalten im Darstellungsmenü der Kontaktliste.
    const DEDUPE_PREF = "extensions.mailcards.hideDuplicateContacts";
    // Name und E-Mail, nach denen zusammengeführt wird (null: Liste oder Zeile ohne Namen, bleibt stehen)
    const dupKey = row => {
      const norm = t => (t || "").normalize("NFC").replace(/\s+/g, " ").trim().toLowerCase();
      const card = row?.card;
      if (!card || card.isMailList) {
        return null;
      }
      // der Name, den die Liste anzeigt (auch Firma, wenn kein Name gesetzt ist)
      let shown = "";
      try {
        shown = row.getText?.("GeneratedName") || "";
      } catch {} // gewollt: Zeile ohne Text, Name kommt aus der Karte
      const name = norm(shown) || norm(card.displayName) ||
        norm(`${card.firstName || ""} ${card.lastName || ""}`);
      return name ? { name, email: norm(card.primaryEmail) } : null;
    };
    // gleich wie in dedupeRows: derselbe Name, dieselbe E-Mail oder bei einem keine
    const isDuplicate = (a, b) => a.name == b.name && (!a.email || !b.email || a.email == b.email);
    const dedupeRows = rows => {
      const score = card => {
        let n = 0;
        try {
          n = card.vCardProperties?.entries?.length || 0;
        } catch {} // gewollt: Karte ohne vCard-Einträge, Zahl bleibt 0
        // lokal gespeicherte Fotos zeigen sicher an, Web-Adressen (iCloud) oft nicht
        const photo = card.photoURL || "";
        return n + (/^(data|file|moz-icon):/.test(photo) ? 6 : photo ? 1 : 0);
      };
      const groups = new Map(); // Name → Liste von Clustern { email, best, rows }
      const keep = new Set();
      for (const row of rows) {
        const key = dupKey(row);
        if (!key) {
          keep.add(row);
          continue;
        }
        const { name, email } = key;
        const clusters = groups.get(name) || [];
        groups.set(name, clusters);
        let cluster = clusters.find(c => !email || !c.email || c.email == email);
        if (!cluster) {
          cluster = { email, best: row, rows: [row] };
          clusters.push(cluster);
          continue;
        }
        cluster.rows.push(row);
        if (!cluster.email && email) {
          cluster.email = email;
        }
        if (score(row.card) > score(cluster.best.card)) {
          cluster.best = row;
        }
      }
      for (const clusters of groups.values()) {
        for (const c of clusters) {
          keep.add(c.best);
          // welcher Eintrag stehen bleibt (Auswahl beim Zusammenführen übertragen);
          // alle Zeilen des Kontakts (c.rows enthält auch die ausgeblendeten aus
          // __mcHidden) merkt sich der verbliebene Eintrag – zum Löschen der Dubletten
          for (const r of c.rows) {
            r.mcBest = c.best;
            if (r != c.best) {
              delete r.mcCluster;
            }
          }
          c.best.mcCluster = c.rows;
          // in welchen Adressbüchern es diesen Kontakt gibt (für die Labels)
          c.best.mcSources = [...new Set(c.rows.map(r => r.directory?.dirName).filter(Boolean))];
        }
      }
      return rows.filter(r => keep.has(r));
    };
    const hookDedupe = cw => {
      const restorers = { push: fn => this.addWinRestorer(cw, fn) };
      const view = cw.cardsPane?.cardsList?.view;
      const Adapter = view?.constructor;
      if (!Adapter?.prototype?.sortBy || Adapter.prototype.__mcDedupe) {
        return;
      }
      const orig = Adapter.prototype.sortBy;
      Adapter.prototype.sortBy = function (column, direction, resort = false) {
        let replaced = false;
        // Ausgeblendete Dubletten merkt sich die Liste (__mcHidden) und nimmt sie
        // bei jedem Sortieren wieder dazu: Thunderbird sortiert nach dem Speichern
        // eines Kontakts nur die Zeilen der Liste – ohne sie blieb die Dublette
        // eines umbenannten Kontakts verborgen, bis die Liste neu aufgebaut wurde
        // (Buchwechsel, Suche), ebenso nach dem Ausschalten des Zusammenführens.
        // Zeilen, die Thunderbird inzwischen selbst wieder führt, nicht doppelt
        const shown = new Set((this._rowMap || []).map(r => `${r.card?.directoryUID}\n${r.card?.UID}`));
        const hidden = (this.__mcHidden || []).filter(r => !shown.has(`${r.card?.directoryUID}\n${r.card?.UID}`));
        this.__mcHidden = [];
        if (!Services.prefs.getBoolPref(DEDUPE_PREF, true)) {
          if (hidden.length) {
            this._rowMap = this._rowMap.concat(hidden);
            resort = true;
          }
        } else if (this._rowMap?.length || hidden.length) {
          const old = this._rowMap;
          const all = hidden.length ? old.concat(hidden) : old;
          const rows = dedupeRows(all);
          const visible = new Set(rows);
          this.__mcHidden = all.filter(r => !visible.has(r));
          if (rows.length != old.length || hidden.length) {
            // Das Original liest die Auswahl über die Zeilennummern: sie über
            // die Zeilen auf die neuen Nummern übertragen, sonst rutscht die
            // Markierung auf den Nachbarkontakt. War eine weggefallene Dublette
            // gewählt, den stehen gebliebenen Eintrag wählen. Einmal neu
            // aufbauen statt Zeile für Zeile verschieben – jedes Verschieben
            // zeichnet die Liste ab dort neu (bei hunderten Dubletten aus
            // CardDAV fror das Adressbuch sonst sekundenlang ein).
            const sel = this.selection;
            const kept = new Set(rows);
            let picked = null;
            let current = null;
            if (sel?.count) {
              picked = new Set();
              for (let i = 0; i < old.length; i++) {
                if (sel.isSelected(i)) {
                  if (!kept.has(old[i])) {
                    replaced = true;
                  }
                  picked.add(kept.has(old[i]) ? old[i] : old[i].mcBest);
                }
              }
              const cur = old[sel.currentIndex];
              current = cur && (kept.has(cur) ? cur : cur.mcBest);
            }
            this._rowMap = rows;
            // weggefallene Dubletten → stehen gebliebener Eintrag (für getIndexForUID)
            this.__mcMerged ??= new Map();
            for (const r of all) {
              if (!kept.has(r) && r.card?.UID && r.mcBest) {
                this.__mcMerged.set(r.card.UID, r.mcBest);
              }
            }
            if (picked) {
              const at = new Map(rows.map((r, i) => [r, i]));
              sel.selectEventsSuppressed = true;
              sel.clearSelection();
              for (const r of picked) {
                const j = at.get(r);
                if (j !== undefined && !sel.isSelected(j)) {
                  sel.toggleSelect(j);
                }
              }
              sel.currentIndex = at.get(current) ?? -1;
              sel.selectEventsSuppressed = false;
            }
            resort = true;
          }
        }
        const result = orig.call(this, column, direction, resort);
        // Thunderbird meldet eine so geänderte Auswahl nicht: ohne „select“
        // zeigte die Detailansicht weiter die weggefallene Dublette
        if (replaced) {
          this._tree?.dispatchEvent(new this._tree.ownerDocument.defaultView.CustomEvent("select"));
        }
        return result;
      };
      // Thunderbird sucht Kontakte über die UID in der Liste („Kontakt anzeigen“
      // bzw. „bearbeiten“ aus dem Mailkopf, der Kontakte-Seitenleiste, der
      // Adresssuche): eine weggefallene Dublette fand es nicht und zeigte einen
      // anderen Kontakt – dann den stehen gebliebenen Eintrag liefern
      const origIndex = Adapter.prototype.getIndexForUID;
      if (typeof origIndex == "function") {
        Adapter.prototype.getIndexForUID = function (uid) {
          const index = origIndex.call(this, uid);
          const best = index < 0 ? this.__mcMerged?.get(uid) : null;
          return best ? this._rowMap.indexOf(best) : index;
        };
      }
      // Neue Kontakte (angelegt, Import, CardDAV) fügt Thunderbird ohne Sortieren
      // in die Liste ein – die Zusammenführung oben hängt am Sortieren, eine neue
      // Dublette stand deshalb doppelt in der Liste, bis etwas anderes neu sortierte.
      // Nur bei einer echten Dublette neu sortieren (sonst bleibt es beim Einfügen),
      // nicht während einer laufenden Suche (deren Treffer kommen auf demselben Weg,
      // Thunderbird sortiert am Ende der Suche ohnehin)
      const origObserve = Adapter.prototype.observe;
      if (typeof origObserve == "function") {
        Adapter.prototype.observe = function (subject, topic, data) {
          // Ausgeblendete Dubletten (siehe sortBy) wie Thunderbird die Zeilen der
          // Liste nachführen: geändert, gelöscht, Buch entfernt, Namensformat.
          // Ändert sich eine ausgeblendete, neu sortieren (eine andere Schreibweise
          // trennt sie vom stehen gebliebenen Eintrag)
          let hiddenChanged = false;
          if (this.__mcHidden?.length && (!this.directory || !data || this.directory.UID == data ||
            topic == "nsPref:changed")) {
            try {
              const same = r => {
                subject.QueryInterface(Ci.nsIAbCard);
                return r.card.equals(subject) && r.card.directoryUID == subject.directoryUID;
              };
              if (topic == "nsPref:changed" && data == "mail.addr_book.lastnamefirst") {
                this.__mcHidden.forEach(r => r.forgetCachedName?.());
              } else if (topic == "addrbook-contact-updated") {
                this.__mcHidden = this.__mcHidden.map(r => {
                  if (!same(r)) {
                    return r;
                  }
                  hiddenChanged = true;
                  return new r.constructor(subject);
                });
              } else if (topic == "addrbook-contact-deleted" ||
                (topic == "addrbook-list-member-removed" && this.directory)) {
                this.__mcHidden = this.__mcHidden.filter(r => !same(r));
              } else if (topic == "addrbook-directory-deleted" && !this.directory) {
                this.__mcHidden = this.__mcHidden.filter(r => r.directory?.UID != subject.UID);
              }
            } catch (e) {
              log("dedupe hidden rows error", e);
            }
          }
          const result = origObserve.call(this, subject, topic, data);
          if (hiddenChanged && this._tree && this.sortColumn) {
            this.sortBy(this.sortColumn, this.sortDirection, true);
          }
          if (topic == "addrbook-contact-created" && this._tree && !this._searchesInProgress && this.sortColumn &&
            Services.prefs.getBoolPref(DEDUPE_PREF, true)) {
            try {
              const uid = subject?.UID;
              const added = this._rowMap.find(r => r.card?.UID == uid && r.card?.directoryUID == subject.directoryUID);
              const key = dupKey(added);
              if (key && this._rowMap.some(r => r != added && isDuplicate(key, dupKey(r) || {}))) {
                this.sortBy(this.sortColumn, this.sortDirection, true);
              }
            } catch (e) {
              log("dedupe new contact error", e);
            }
          }
          return result;
        };
      }
      // Löschen eines zusammengeführten Kontakts löscht auch die ausgeblendeten
      // Dubletten (wie Apple Kontakte bei verknüpften Karten): Thunderbird
      // löscht nur die Karten der sichtbaren Zeilen, beim nächsten Neuaufbau der
      // Liste stand die Dublette sonst wieder da. In einer Verteilerliste
      // werden sie ebenso nur aus der Liste genommen.
      const origDelete = Adapter.prototype.deleteSelectedCards;
      if (typeof origDelete == "function") {
        Adapter.prototype.deleteSelectedCards = function (...args) {
          const extra = [];
          try {
            for (const i of this._tree?.selectedIndices || []) {
              const row = this._rowMap?.[i];
              for (const r of row?.mcCluster || []) {
                if (r != row && r.card && !r.card.isMailList) {
                  extra.push(r.card);
                }
              }
            }
          } catch (e) {
            log("dedupe delete collect error", e);
          }
          const result = origDelete.apply(this, args);
          const list = this.directory?.isMailList ? this.directory : null;
          for (const card of extra) {
            try {
              const dir = list || MailServices.ab.getDirectoryFromUID(card.directoryUID);
              // schon anderswo gelöscht (Sync, zweites Fenster): nichts tun
              if (dir && !dir.readOnly && dir.hasCard(card)) {
                dir.deleteCards([card]);
              }
            } catch (e) {
              log("dedupe delete error", e);
            }
          }
          return result;
        };
      }
      Adapter.prototype.__mcDedupe = true;
      restorers.push(() => {
        Adapter.prototype.sortBy = orig;
        if (origDelete) {
          Adapter.prototype.deleteSelectedCards = origDelete;
        }
        if (typeof origObserve == "function") {
          Adapter.prototype.observe = origObserve;
        }
        if (typeof origIndex == "function") {
          Adapter.prototype.getIndexForUID = origIndex;
        }
        delete Adapter.prototype.__mcDedupe;
      });

      // Etiketten in Kontofarbe (Liste, Tabelle und Detailansicht)
      const bookPills = (doc, sources) => sources.map(n => {
        const pill = doc.createElement("span");
        pill.className = "mc-book";
        pill.textContent = n;
        const c = accountColor(n);
        pill.style.setProperty("--c", c);
        pill.classList.toggle("mc-dark-color", textOnColor(c) == "#fff" && isVeryDark(c));
        return pill;
      });
      // Detailansicht: unter dem Namen, zu welchen Konten der Kontakt gehört –
      // bei zusammengeführten Kontakten alle (wie in der Liste)
      const pane = cw.detailsPane;
      if (pane && typeof pane.displayContact == "function" && !pane.__mcBooks) {
        const origDisplay = pane.displayContact;
        pane.displayContact = function (card, ...rest) {
          const result = origDisplay.call(this, card, ...rest);
          try {
            const doc = cw.document;
            doc.getElementById("mcDetailBooks")?.remove();
            if (card && !card.isMailList) {
              const rows = Object.values(cw.cardsPane?.cardsList?.view?._rowMap || {});
              const row = rows.find(r => r?.card?.UID == card.UID);
              let sources = row?.mcSources?.length ? row.mcSources : [];
              if (!sources.length) {
                const dir = row?.directory || (card.directoryUID && MailServices.ab.getDirectoryFromUID(card.directoryUID));
                sources = [dir?.dirName].filter(Boolean);
              }
              const headings = doc.querySelector("#viewContact .contact-headings");
              if (sources.length && headings) {
                const box = doc.createElement("p");
                box.id = "mcDetailBooks";
                box.className = "mc-books";
                box.replaceChildren(...bookPills(doc, sources));
                headings.appendChild(box);
              }
            }
          } catch (e) {
            log("detail books error", e);
          }
          return result;
        };
        pane.__mcBooks = true;
        restorers.push(() => {
          pane.displayContact = origDisplay;
          delete pane.__mcBooks;
          cw.document.getElementById("mcDetailBooks")?.remove();
        });
      }

      // Labels je Kontakt: aus welchen Adressbüchern er stammt – nur in der
      // vereinigten Ansicht „Alle Adressbücher“
      const Row = cw.customElements.get("ab-card-row");
      // Kontaktkarten genau so hoch wie die Mailkarten (Thunderbird rechnet
      // die Liste mit ROW_HEIGHT, das Design übernimmt --mc-card-h)
      if (Row && !Object.getOwnPropertyDescriptor(Row, "ROW_HEIGHT")?.get) {
        const self = this;
        Object.defineProperty(Row, "ROW_HEIGHT", {
          configurable: true,
          get: () => self.mcCardHeight || 67,
          set: () => {},
        });
        cw.document.documentElement.style.setProperty("--mc-card-h", `${this.mcCardHeight || 67}px`);
        try {
          cw.cardsPane?.cardsList?.reset?.();
        } catch {} // gewollt: Liste noch nicht aufgebaut, baut sich beim Öffnen mit der neuen Höhe auf
        restorers.push(() => {
          delete Row.ROW_HEIGHT;
          Row.ROW_HEIGHT = 52;
        });
      }
      if (Row && !Row.prototype.__mcBooks) {
        const origFill = Row.prototype.fillRow;
        Row.prototype.fillRow = function (...args) {
          const result = origFill.apply(this, args);
          try {
            let box = this.querySelector(".mc-books");
            // Labels nur in „Alle Adressbücher“ und solange „Adressbuch“ im Menü angehakt ist
            const showBooks = cw.document.getElementById("sortContext")
              ?.querySelector('menuitem[value="addrbook"]')?.hasAttribute("checked") ?? true;
            const unified = cw.document.getElementById("books")?.selectedIndex == 0 && showBooks;
            const row = this.view?._rowMap?.[this._index];
            const sources = row?.mcSources?.length ? row.mcSources : [row?.directory?.dirName].filter(Boolean);
            if (!unified || !sources.length) {
              box?.remove();
            } else {
              if (!box) {
                box = cw.document.createElement("span");
                box.className = "mc-books";
                this.firstLine.appendChild(box);
              }
              box.replaceChildren(...bookPills(cw.document, sources));
              box.title = sources.join(", ");
            }
          } catch (e) {
            log("book labels error", e);
          }
          return result;
        };
        Row.prototype.__mcBooks = true;
        restorers.push(() => {
          Row.prototype.fillRow = origFill;
          delete Row.prototype.__mcBooks;
        });
      }

      // Tabellenansicht: Thunderbirds Spalte „Adressbuch“ zeigt dieselben
      // Konto-Etiketten wie die Karten – bei zusammengeführten Kontakten alle
      // Bücher, nicht nur eines. Einmalig eingeblendet.
      const TableRow = cw.customElements.get("ab-table-card-row");
      if (TableRow && !TableRow.prototype.__mcBooks) {
        const origTableFill = TableRow.prototype.fillRow;
        TableRow.prototype.fillRow = function (...args) {
          const result = origTableFill.apply(this, args);
          try {
            const cell = this.querySelector(".addrbook-column");
            const row = this.view?._rowMap?.[this._index];
            const sources = row?.mcSources?.length ? row.mcSources : [row?.directory?.dirName].filter(Boolean);
            if (cell && !cell.hidden && sources.length) {
              const box = cw.document.createElement("span");
              box.className = "mc-books";
              box.replaceChildren(...bookPills(cw.document, sources));
              cell.replaceChildren(box);
              cell.title = sources.join(", ");
            }
          } catch (e) {
            log("table labels error", e);
          }
          // jede zweite Zeile leicht getönt wie in der Mail-Tabelle (nach der
          // echten Listenposition – die Zeilen werden beim Scrollen wiederverwendet)
          this.toggleAttribute("data-mc-odd", this._index % 2 == 1);
          return result;
        };
        TableRow.prototype.__mcBooks = true;
        restorers.push(() => {
          TableRow.prototype.fillRow = origTableFill;
          delete TableRow.prototype.__mcBooks;
        });
      }
      // Tabellenzeilen so hoch wie in der Mail-Tabelle (13-px-Schrift, 28 px);
      // Thunderbird setzt ROW_HEIGHT je nach Dichte neu – der Wert bleibt
      // gemerkt, gelesen wird mindestens 28
      if (TableRow && !Object.getOwnPropertyDescriptor(TableRow, "ROW_HEIGHT")?.get) {
        let tbHeight = TableRow.ROW_HEIGHT || 22;
        Object.defineProperty(TableRow, "ROW_HEIGHT", {
          configurable: true,
          get: () => Math.max(tbHeight, 28),
          set: v => {
            tbHeight = v;
          },
        });
        try {
          cw.cardsPane?.cardsList?.reset?.();
        } catch {} // gewollt: Liste noch nicht aufgebaut, baut sich beim Öffnen mit der neuen Höhe auf
        restorers.push(() => {
          delete TableRow.ROW_HEIGHT;
          TableRow.ROW_HEIGHT = tbHeight;
        });
      }
      if (TableRow) {
        const COLUMN_PREF = "extensions.mailcards.abLabelColumn";
        const pane = cw.cardsPane;
        const abColumn = pane?.COLUMNS?.find(c => c.id == "addrbook");
        if (abColumn && !Services.prefs.getBoolPref(COLUMN_PREF, false)) {
          abColumn.hidden = false;
          const visible = pane.COLUMNS.filter(c => !c.hidden).map(c => c.id).join(",");
          Services.xulStore.setValue("about:addressbook", "cards", "columns", visible);
          try {
            pane.table.setColumns(pane.COLUMNS);
            pane.cardsList.reset?.();
          } catch {} // Kandidat fürs Protokoll: Spalten der Kontaktliste nicht neu gesetzt (Fenster schon entladen ist gewollt)
          Services.prefs.setBoolPref(COLUMN_PREF, true);
        }
      }

      // Schalter im Darstellungsmenü („…“ neben der Suche)
      const menu = cw.document.getElementById("sortContext");
      // Abschnittstitel, damit klar ist, dass „Anzeigename“ eine Auswahl ist
      if (menu && !menu.querySelector(".mc-caption")) {
        const caption = (label, before, sep, section) => {
          if (!before) {
            return;
          }
          const c = cw.document.createXULElement("menucaption");
          c.className = "mc-caption";
          // Abschnitt für das CSS (Tabellenansicht blendet „Sort“ aus)
          c.setAttribute("mc-section", section);
          c.setAttribute("label", label);
          // „View“ folgt ohne Thunderbirds Trenner auf „Sort“: eigene Trennlinie davor
          const s = sep ? cw.document.createXULElement("menuseparator") : null;
          if (s) {
            s.className = "mc-caption-sep";
            before.before(s);
          }
          before.before(c);
          restorers.push(() => {
            c.remove();
            s?.remove();
          });
        };
        caption(tr("Show Names As"), menu.querySelector('menuitem[name="format"]'), false, "format");
        caption(tr("Sort"), menu.querySelector('menuitem[name="sort"]'), false, "sort");
        caption(tr("View"), menu.querySelector('menuitem[value="addrbook"]'), true, "view");
        // Thunderbirds Trenner vor „Table layout“ ausblenden: „View“ (Address
        // Book, Table layout, Merge Duplicate Contacts) hat innen keine Linie
        let tbSep = menu.querySelector("#sortContextTableLayout")?.previousElementSibling;
        while (tbSep && tbSep.localName != "menuseparator") {
          tbSep = tbSep.previousElementSibling;
        }
        if (tbSep && !tbSep.hidden && menu.querySelector(".mc-caption-sep")) {
          tbSep.hidden = true;
          restorers.push(() => {
            tbSep.hidden = false;
          });
        }
      }
      if (menu && !cw.document.getElementById("mcHideDuplicates")) {
        // ohne eigenen Trenner: gehört zum Abschnitt „View“
        const item = cw.document.createXULElement("menuitem");
        item.id = "mcHideDuplicates";
        item.setAttribute("type", "checkbox");
        item.setAttribute("label", tr("Merge Duplicate Contacts"));
        if (Services.prefs.getBoolPref(DEDUPE_PREF, true)) {
          item.setAttribute("checked", "true");
        }
        item.addEventListener("command", () => {
          Services.prefs.setBoolPref(DEDUPE_PREF, item.hasAttribute("checked"));
          // Liste neu aufbauen (ausgeschaltet kommen die Doppelten zurück)
          cw.booksList?.dispatchEvent(new cw.CustomEvent("select"));
        });
        menu.append(item);
        restorers.push(() => item.remove());
      }
      // aktuelle Liste sofort bereinigen – neu sortieren statt neu aufbauen:
      // ein Neuaufbau verwarf die Auswahl, ein von außen geöffneter Kontakt
      // („Kontakt anzeigen“ aus dem Mailkopf) wich dann dem zuletzt gewählten
      const current = cw.cardsPane?.cardsList?.view;
      if (current?.sortColumn && typeof current.sortBy == "function") {
        current.sortBy(current.sortColumn, current.sortDirection, true);
      } else {
        cw.booksList?.dispatchEvent(new cw.CustomEvent("select"));
      }
    };

    const styleContentPages = () => {
      markSearch();
      const uri = sheetURI();
      const tabmail = w.document.getElementById("tabmail");
      if (!uri || !tabmail) {
        return;
      }
      for (const tab of tabmail.tabInfo) {
        const cw = tab.browser?.contentWindow;
        const url = cw?.document?.documentURI || "";
        // Restorer dieses Tabs verfallen mit seinem Fenster
        const winRestorers = { push: fn => this.addWinRestorer(cw, fn) };
        if (cw && url.startsWith("about:preferences")) {
          try {
            hookAppearanceChoice(cw, winRestorers);
          } catch (e) {
            log("appearance choice error", e);
          }
          try {
            hookChatCategory(cw, winRestorers);
          } catch (e) {
            log("chat category error", e);
          }
          try {
            hookPrefCategories(cw, winRestorers);
          } catch (e) {
            log("pref categories error", e);
          }
          try {
            hookPrefKeyboardScroll(cw, winRestorers);
          } catch (e) {
            log("pref keyboard scroll error", e);
          }
          try {
            hookPrefLabelColons(cw, winRestorers);
          } catch (e) {
            log("pref label colons error", e);
          }
          try {
            addPrefTools(cw.document, winRestorers);
          } catch (e) {
            log("pref tools error", e);
          }
          try {
            hookShortcutsLink(cw, winRestorers);
          } catch (e) {
            log("shortcuts link error", e);
          }
        }
        if (cw && url.startsWith("about:addressbook")) {
          try {
            hookAvatars(cw);
            hookEditLayout(cw);
            hookBooksHeader(cw, winRestorers);
            hookSplitterReset(cw.document);
          } catch (e) {
            log("avatar fix error", e);
          }
          try {
            hookCollectedAddresses(cw, winRestorers);
          } catch (e) {
            log("collected addresses error", e);
          }
          try {
            hookPhotoDialog(cw, winRestorers);
          } catch (e) {
            log("photo dialog error", e);
          }
          try {
            hookDedupe(cw);
            colorAccountRows(cw.document, winRestorers);
            cacheCardCount(cw.document, winRestorers);
          } catch (e) {
            log("dedupe error", e);
          }
          try {
            hookPersonalBook(cw, winRestorers);
          } catch (e) {
            log("personal book error", e);
          }
          try {
            hookAllContactsLabel(cw, winRestorers);
          } catch (e) {
            log("all contacts label error", e);
          }
          try {
            hookLastContact(cw, winRestorers);
          } catch (e) {
            log("last contact error", e);
          }
        }
        if (!cw || !CONTENT_PAGES.test(url) || cw.__mcSheet == uri || cw.__mcTheme) {
          continue;
        }
        try {
          cw.windowUtils.loadSheetUsingURIString(uri, cw.windowUtils.USER_SHEET);
          cw.__mcSheet = uri;
        } catch (e) {
          log("content sheet error", url, e);
        }
      }
    };

    // Seitenleisten der übrigen Bereiche ein-/ausblenden wie die Ordnerliste
    // (gleiche Animation wie in der Mail). Bereiche-Leiste und linke Leiste
    // sind eine Spalte („Seitenleiste“, Reihe „Seitenleiste wie Dia“ 2/4): ein
    // Zustand je Fenster, gespeichert von Thunderbird als Zustand der
    // Bereiche-Leiste (xulstore); die linke Leiste jedes Bereichs folgt ihm.
    // Früher je Bereich gespeichert (Pref, beim ersten Start entfernt)
    const SIDE_PREF = "extensions.mailcards.hiddenSidebars";
    // (die frühere Automatik, die Leisten bei Platzmangel selbst einklappte,
    // ist entfernt – Leisten nur noch über die Knöpfe; ihr gemerkter Zustand
    // ließ Leisten sonst zu, auch wenn der Knopf sie öffnen sollte)
    Services.prefs.clearUserPref("extensions.mailcards.autoCollapsed");
    Services.prefs.clearUserPref("extensions.mailcards.autoCollapse");
    // Kalender und Aufgaben teilen sich die Seitenleiste
    const sideKey = mode => (mode == "tasks" ? "calendar" : mode);
    const SIDE_TOGGLE = {
      calendar: () => [w.document.getElementById("calSidebar"), w.document.getElementById("calsidebar_splitter")],
      tasks: () => [w.document.getElementById("calSidebar"), w.document.getElementById("calsidebar_splitter")],
      chat: () => [w.document.getElementById("listPaneBox"), w.document.getElementById("listSplitter")],
      addressBookTab: tab => {
        const doc = tab.browser?.contentDocument;
        return [doc?.getElementById("booksPane"), doc?.getElementById("booksSplitter")];
      },
      preferencesTab: tab => [tab.browser?.contentDocument?.getElementById("pref-category-box"), null],
      contentTab: tab => {
        const doc = tab.browser?.contentDocument;
        const url = doc?.documentURI || "";
        return url.startsWith("about:addons") ? [doc.getElementById("sidebar"), null]
          : url.startsWith("about:accountsettings") ? [doc.getElementById("accountTreeBox"), null]
          : [null, null];
      },
    };
    // Eine gemeinsame Breite für alle Seitenleisten: Wechselt man den Bereich,
    // bekommt dessen Seitenleiste dieselbe Breite – die Knöpfe springen nicht.
    // Zieht man eine Seitenleiste breiter/schmaler, gilt das für alle.
    const WIDTH_PREF = "extensions.mailcards.sidebarWidth";
    // gemeinsame Höchstbreite aller Seitenleisten (CSS-Variable, 360 px wie im Kalender)
    const sideMax = el => {
      const win = el.ownerDocument.defaultView;
      return parseFloat(win.getComputedStyle(el).getPropertyValue("--mt-sidebar-max-width")) || 360;
    };
    const sidebarFor = tab => {
      if (!tab) {
        return [null, null, null];
      }
      if (tab.mode?.name == "mail3PaneTab") {
        const ab = tab.chromeBrowser?.contentWindow;
        return [ab?.document?.getElementById("folderPane"), ab?.document?.getElementById("folderPaneSplitter"), ab];
      }
      const [el, splitter] = SIDE_TOGGLE[tab.mode?.name]?.(tab) || [];
      return [el, splitter, el?.ownerDocument?.defaultView];
    };
    const busy = (el, win) => !el || el.__mcAnimating || win?.__mcAnimating || el.classList.contains("mc-side-hidden");
    const applyCommonWidth = tab => {
      // Einstellungen: eigene feste Breite (240 px wie die Systemeinstellungen)
      if (tab?.mode?.name == "preferencesTab") {
        return;
      }
      // (noch keine eigene Breite gespeichert: 206 px wie die Ordnerliste in Apple Mail)
      // (nie breiter als die gemeinsame Höchstbreite, --mt-sidebar-max-width)
      const [el, splitter, win] = sidebarFor(tab);
      // beim Ziehen an der Trennlinie nicht (der verzögerte Abgleich nach dem Bereichswechsel setzte die Breite mitten im
      // Ziehen kurz auf den gespeicherten Wert zurück); gespeichert wird beim Loslassen
      if (busy(el, win) || w.__mcSideDrag) {
        return;
      }
      const W = Math.min(sideMax(el), Services.prefs.getIntPref(WIDTH_PREF, 0) || 206);
      if (W < 160) {
        return;
      }
      // (Mail, Adressbuch: die Spalte des Teilers zählt – sie kann breiter
      // sein als die auf die Höchstbreite begrenzte Leiste)
      const hr = splitter?.localName == "hr" && "width" in splitter;
      const current = hr && splitter.width ? splitter.width : el.getBoundingClientRect().width;
      if (!current || Math.abs(current - W) < 1.5) {
        return;
      }
      // schon gesetzt, nur eine Mindestbreite hält die Leiste breiter (Kalender:
      // 206 px gesetzt, 228 px breit): nicht erneut setzen – sonst lief bei jedem
      // Bereichswechsel und in den ersten 30 s jede Sekunde das Nachmessen der
      // Toolbar dreimal an, ohne dass sich etwas änderte
      if (!hr && el.style.getPropertyValue("width") == `${W}px` && el.style.getPropertyPriority("width") == "important") {
        return;
      }
      el.__mcSetting = Date.now();
      if (splitter?.localName == "hr" && "width" in splitter) {
        // Thunderbirds Pane-Splitter (Mail, Adressbuch) – speichert selbst
        splitter.width = W;
        splitter.dispatchEvent(new win.CustomEvent("splitter-resized", { bubbles: true }));
        // feste Breite aus der Ein-/Ausblend-Animation mitziehen
        if (el.style.getPropertyPriority("width") == "important") {
          el.style.setProperty("width", `${W}px`, "important");
        }
      } else {
        el.style.setProperty("width", `${W}px`, "important");
        if (splitter) {
          el.setAttribute("width", String(W));
          try {
            Services.xulStore.persist(el, "width");
          } catch {} // gewollt: Breite nicht gemerkt, gilt nur für diese Sitzung
        }
      }
      // Toolbar-Kanten (Mail: Beginn der Knöpfe über der Nachricht) neu messen
      for (const ms of [50, 300, 700]) {
        w.setTimeout(() => {
          this.sideEdgeUpdaters?.forEach(fn => fn());
          this.offsetUpdaters?.forEach(fn => fn());
        }, ms);
      }
    };
    const watchWidth = tab => {
      const [el, splitter, win] = sidebarFor(tab);
      // Merkmal gehört dieser Fassung: ein liegengebliebenes „true“ einer älteren
      // (3.2.0 räumte es beim Update ohne Neustart nicht weg) blockiert nicht
      if (!el || el.__mcWidthWatch === this) {
        return;
      }
      el.__mcWidthWatch = this;
      // Startwert: die Breite der Ordnerliste in der Mail
      if (!Services.prefs.getIntPref(WIDTH_PREF, 0) && tab.mode?.name == "mail3PaneTab") {
        const width = Math.round(el.getBoundingClientRect().width);
        if (width >= 160) {
          // nie schmaler als Apple Mails 206 px; Thunderbirds Vorgabe (198) ist keine eigene Wahl
          Services.prefs.setIntPref(WIDTH_PREF, Math.max(width, 206));
        }
      }
      // Nur echtes Ziehen am Trenner zählt als neue Breite – übernommen erst
      // beim Loslassen und nie schmaler als 160 px (nicht das Einrichten der
      // Seite, Animationen oder Thunderbirds Mindestbreiten)
      if (splitter) {
        const onDown = () => {
          win.addEventListener("pointerup", () => win.setTimeout(() => {
            if (busy(el, win)) {
              return;
            }
            const width = Math.round(el.getBoundingClientRect().width);
            if (width >= 160 && Math.abs(width - Services.prefs.getIntPref(WIDTH_PREF, 0)) >= 2) {
              Services.prefs.setIntPref(WIDTH_PREF, width);
            }
          }, 300), { once: true });
        };
        splitter.addEventListener("pointerdown", onDown);
        this.addWinRestorer(win, () => {
          splitter.removeEventListener("pointerdown", onDown);
          if (el.__mcWidthWatch === this) {
            delete el.__mcWidthWatch;
          }
        });
      }
    };
    // Doppelklick auf eine Trennlinie stellt ihre Standardbreite wieder her:
    // Seitenleisten 206 px (gemeinsam), Mail-/Kontaktliste Thunderbirds
    // Standard (die andere Liste zieht mit), Today-Pane 280 px
    const hookSplitterReset = doc => {
      if (!doc || doc.__mcSplitterReset) {
        return;
      }
      doc.__mcSplitterReset = true;
      const SIDEBAR_SPLITTERS = new Set(["folderPaneSplitter", "booksSplitter", "calsidebar_splitter", "listSplitter"]);
      // Teiler fangen den Zeiger beim Drücken ein – Loslassen, Klick und
      // Doppelklick landen dann am Dokument statt am Teiler; deshalb den
      // Teiler vom letzten Drücken merken
      const SPLITTER = "splitter, hr[is='pane-splitter'], [is='pane-splitter']";
      let lastDown = null;
      const onDown = event => {
        const splitter = event.target.closest?.(SPLITTER);
        lastDown = splitter ? { splitter, time: Date.now() } : null;
      };
      const onDblClick = event => {
        const splitter = event.target.closest?.(SPLITTER) ||
          (lastDown && Date.now() - lastDown.time < 800 ? lastDown.splitter : null);
        if (!splitter?.id) {
          return;
        }
        if (SIDEBAR_SPLITTERS.has(splitter.id)) {
          event.preventDefault();
          Services.prefs.clearUserPref(WIDTH_PREF);
          syncSidebarWidth();
        } else if (splitter.id == "messagePaneSplitter") {
          event.preventDefault();
          // Mailliste zurück auf ihre Standardbreite (die Nachricht nimmt den Rest)
          Services.prefs.clearUserPref(LIST_WIDTH_PREF);
          w.setTimeout(() => this.offsetUpdaters?.forEach(fn => fn()), 50);
        } else if (splitter.id == "sharedSplitter") {
          event.preventDefault();
          this.mcButtonsLeft = undefined; // nicht gleich wieder an die Mailliste angleichen
          splitter.width = null;
          w.setTimeout(() => {
            const cards = doc.getElementById("cardsPane")?.getBoundingClientRect();
            const tab = w.document.getElementById("tabmail")?.currentTabInfo;
            const b = tab?.browser?.getBoundingClientRect();
            if (cards?.width && b) {
              this.mcListWidth = Math.round(cards.width);
              this.mcButtonsLeft = b.left + cards.right + 6;
              this.mcListPending = true; // die Mailliste übernimmt die Kante
            }
            updateSideEdge();
          }, 50);
        } else if (splitter.id == "today-splitter") {
          event.preventDefault();
          const panel = doc.getElementById("today-pane-panel");
          if (panel) {
            panel.setAttribute("width", "280");
            panel.style.width = "280px";
            panel.setModeAttribute?.("modewidths", "280");
          }
        }
      };
      doc.addEventListener("mousedown", onDown, true);
      doc.addEventListener("dblclick", onDblClick, true);
      this.addWinRestorer(doc.defaultView, () => {
        doc.removeEventListener("mousedown", onDown, true);
        doc.removeEventListener("dblclick", onDblClick, true);
        delete doc.__mcSplitterReset;
      });
    };

    const syncSidebarWidth = () => {
      const tabmail = w.document.getElementById("tabmail");
      const tab = tabmail?.currentTabInfo;
      const mail = tabmail?.tabInfo?.find(t => t.mode?.name == "mail3PaneTab");
      if (mail) {
        watchWidth(mail);
      }
      watchWidth(tab);
      applyCommonWidth(tab);
    };

    // Spalte ausgeblendet? (einzige Quelle: die Bereiche-Leiste)
    const columnHidden = () => !!w.gSpacesToolbar?.isHidden;
    const columnBusy = () => {
      const tab = w.document.getElementById("tabmail")?.currentTabInfo;
      const [el, , win] = sidebarFor(tab);
      return !!(w.__mcSpacesAnimating || el?.__mcAnimating || win?.__mcAnimating);
    };
    // Bereiche-Leiste an die linke Leiste angleichen (ohne Animation), wenn
    // Thunderbird bzw. das Ziehen nur die linke Leiste ein-/ausgeblendet hat –
    // nie „nur eins von beiden“
    // Bereiche-Leiste ohne Animation umschalten (Ziehen, Thunderbirds eigene
    // Wege): Reste einer früheren Animation an der Toolbar-Zeile entfernen –
    // ein dort stehengebliebener Platz für die Ampel (12 px aus der
    // eingeblendeten Lage) setzte den Seitenleisten-Knopf sonst nach dem
    // Einklappen per Ziehen über die Fensterknöpfe
    const toggleSpacesNow = hidden => {
      w.gSpacesToolbar.toggleToolbar(hidden);
      if (!w.__mcSpacesAnimating) {
        const row = w.document.getElementById("unifiedToolbarContainer");
        row?.style.removeProperty("--mc-tl-reserve");
        row?.style.removeProperty("--mc-tl-flow");
      }
    };
    const spacesFollow = hidden => {
      if (!w.gSpacesToolbar || w.__mcColumnQuiet || w.__mcSideDrag || columnBusy() || columnHidden() == hidden) {
        return;
      }
      toggleSpacesNow(hidden);
    };
    // Ordnerliste: Thunderbirds eigene Wege (Ansicht → Layout → Ordnerliste,
    // F9, Teiler) melden sich am Teiler – die Bereiche-Leiste zieht mit
    const hookFolderSplitter = (ab, splitter) => {
      if (splitter.__mcColumn) {
        return;
      }
      splitter.__mcColumn = true;
      const follow = () => ab.setTimeout(() => {
        if (!ab.closed && w.document.getElementById("tabmail")?.currentTabInfo?.chromeBrowser?.contentWindow == ab) {
          spacesFollow(!!splitter.isCollapsed);
        }
      }, 0);
      splitter.addEventListener("splitter-collapsed", follow);
      splitter.addEventListener("splitter-expanded", follow);
      this.addWinRestorer(ab, () => {
        splitter.removeEventListener("splitter-collapsed", follow);
        splitter.removeEventListener("splitter-expanded", follow);
        delete splitter.__mcColumn;
      });
    };
    // Übernahme der alten, getrennten Zustände (einmal je Fenster, sobald die
    // Ordnerliste bereit ist): ist Bereiche-Leiste oder Ordnerliste sichtbar,
    // gilt die Seitenleiste als sichtbar; danach den alten Pref entfernen
    const migrateColumn = () => {
      if (w.__mcColumnMigrated || !w.gSpacesToolbar) {
        return;
      }
      const tabmail = w.document.getElementById("tabmail");
      const mail = tabmail?.tabInfo?.find(t => t.mode?.name == "mail3PaneTab");
      const splitter = mail?.chromeBrowser?.contentWindow?.paneLayout?.folderPaneSplitter;
      if (mail && !splitter) {
        return; // Ordnerliste noch nicht aufgebaut – beim nächsten Durchlauf
      }
      w.__mcColumnMigrated = true;
      const shown = !columnHidden() || (splitter ? !splitter.isCollapsed : false);
      if (columnHidden() == shown) {
        w.gSpacesToolbar.toggleToolbar(!shown);
      }
      if (splitter && splitter.isCollapsed == shown) {
        splitter.isCollapsed = !shown;
      }
      Services.prefs.clearUserPref(SIDE_PREF);
    };
    // für die Prüfungen: Übernahme mit vorgegebenem alten Zustand nachstellen
    w.__mcColumnMigrate = (spacesHidden, folderCollapsed) => {
      const splitter = w.document.getElementById("tabmail")?.tabInfo?.find(t => t.mode?.name == "mail3PaneTab")
        ?.chromeBrowser?.contentWindow?.paneLayout?.folderPaneSplitter;
      w.__mcColumnQuiet = true;
      try {
        w.gSpacesToolbar.toggleToolbar(spacesHidden);
        if (splitter) {
          splitter.isCollapsed = folderCollapsed;
        }
      } finally {
        w.__mcColumnQuiet = false;
      }
      w.__mcColumnMigrated = false;
      migrateColumn();
      return { spaces: !columnHidden(), folder: splitter ? !splitter.isCollapsed : null };
    };
    this.restorers.push(() => {
      delete w.__mcColumnMigrate;
      delete w.__mcColumnMigrated;
    });
    const currentSide = () => {
      const tab = w.document.getElementById("tabmail")?.currentTabInfo;
      const mode = tab?.mode?.name;
      const [el, splitter] = SIDE_TOGGLE[mode]?.(tab) || [];
      return { mode, el, splitter };
    };
    // Thunderbirds eigenes Zuklappen der Leiste (Trenner ganz nach links
    // gezogen) aufheben und abschalten – ein-/ausgeblendet wird über den
    // Seitenleisten-Knopf, sonst bliebe die Leiste nach dem Einblenden leer
    const unCollapse = (el, splitter) => {
      if (splitter?.localName == "splitter") {
        if (splitter.getAttribute("collapse") != "none") {
          splitter.setAttribute("collapse", "none");
        }
        if (splitter.getAttribute("state") == "collapsed") {
          splitter.setAttribute("state", "open");
        }
      }
      if (el?.getAttribute("collapsed") == "true") {
        el.removeAttribute("collapsed");
      }
    };
    // linke Leiste des aktuellen Bereichs an die Spalte angleichen (ohne
    // Animation: Bereichswechsel, Start, Thunderbird blendet die
    // Bereiche-Leiste selbst ein/aus)
    const applySideState = () => {
      migrateColumn();
      if (w.__mcSpacesAnimating || w.__mcColumnQuiet) {
        return;
      }
      const tab = w.document.getElementById("tabmail")?.currentTabInfo;
      if (tab?.mode?.name == "mail3PaneTab") {
        const ab = tab.chromeBrowser?.contentWindow;
        const splitter = ab?.paneLayout?.folderPaneSplitter;
        if (!splitter || ab.__mcAnimating) {
          return;
        }
        hookFolderSplitter(ab, splitter);
        if (!!splitter.isCollapsed != columnHidden()) {
          sidePane(tab)?.setHidden(columnHidden());
        }
        return;
      }
      const { el, splitter } = currentSide();
      if (!el || el.__mcAnimating) {
        return;
      }
      unCollapse(el, splitter);
      const hidden = columnHidden();
      el.classList.toggle("mc-side-hidden", hidden);
      splitter?.classList.toggle("mc-side-hidden", hidden);
      placeSideGrip();
    };
    // reverse: Klick während der Animation kehrt sie an der aktuellen Stelle um
    const toggleSpaceSidebar = (reverse = false) => {
      const { mode, el, splitter } = currentSide();
      if (el?.__mcAnimating && reverse) {
        el.__mcReverse?.();
        return;
      }
      if (!el || el.__mcAnimating) {
        return;
      }
      const show = el.classList.contains("mc-side-hidden");
      const DURATION = motionMs(250);
      const curve = cubicBezier(0.25, 0.1, 0.25, 1);
      unCollapse(el, splitter);
      // Kalender, Mehrwochen-Ansicht: Puffer-Wochen schon vor der Vorabrechnung aus dem Aufbau (kalender.js, park) –
      // sie wurden sonst schon im Klick zweimal und danach in jedem Bild neu umbrochen
      if (mode == "calendar") {
        const mw = w.document.getElementById("multiweek-view");
        (mw?.wrappedJSObject || mw)?.__mcPark?.();
      }
      if (show) {
        el.classList.remove("mc-side-hidden");
        splitter?.classList.remove("mc-side-hidden");
        placeSideGrip();
      }
      const full = el.getBoundingClientRect().width;
      if (!full) {
        return;
      }
      // Adressbuch: Mindestbreite der Bücherspalte im Ruhezustand (halo.spaces: 160 px), bevor „mc-side-anim“ sie auf
      // 0 setzt – je Bild gilt dann höchstens die Breite des Bildes als Mindestbreite (--mc-ab-anim-min). Mit 0 drückte
      // das Raster die Spalte im schmalen Fenster (Kontaktliste und Details an ihren Mindestbreiten) auf 88 px, am Ende
      // galten wieder 160 px: Sprung um 72 px beim Ein- und Ausblenden. Obergrenze die Breite vor der Bewegung, nicht die
      // Mindestbreite: stand die Liste auf 161 px, drückte das Raster sie mit 160 px gleich beim Ausblenden vor dem ersten
      // Bild um 1 px zusammen (Ruck, das Aufbau-Bild zählte dann als verloren – lokal 3/10, Windows 2–4/10)
      const abMin = el.id == "booksPane"
        ? parseFloat(el.ownerDocument.defaultView.getComputedStyle(el.ownerDocument.body).getPropertyValue("--ab-pane-min-width")) || 0 : 0;
      el.__mcAnimating = true;
      el.classList.add("mc-side-anim");
      // gespeicherte Breite der Leiste (Inline-Stil) merken und danach wiederherstellen
      const PROPS = ["overflow", "min-width", "width", "max-width"];
      const saved = PROPS.map(p => [p, el.style.getPropertyValue(p), el.style.getPropertyPriority(p)]);
      const kids = [...el.children];
      // (die Kinder behalten während der Bewegung die volle Breite der Leiste: als Innenmaß gerechnet, sonst machen
      // Innenabstände sie breiter als nach der Bewegung und Texte wie „All Address Books“ springen und werden am
      // Ende zusätzlich gekürzt, z. B. 222 statt 205 px in der Adressbuchliste)
      const base = el.clientWidth || full;
      kids.forEach(k => {
        const cs = k.ownerDocument.defaultView.getComputedStyle(k);
        const edge = cs.boxSizing == "border-box" ? 0 : ["paddingInlineStart", "paddingInlineEnd", "borderInlineStartWidth", "borderInlineEndWidth"]
          .reduce((n, prop) => n + (parseFloat(cs[prop]) || 0), 0);
        k.style.setProperty("min-width", `${Math.max(0, base - edge)}px`);
      });
      el.style.setProperty("overflow", "hidden", "important");
      el.style.setProperty("min-width", "0px", "important");
      // Adressbuch: die Rasterspalte der Liste mitziehen, sonst bliebe die
      // Kontaktliste stehen und spränge erst am Ende
      const gridBody = el.id == "booksPane" ? el.ownerDocument.body : null;
      const savedColumn = gridBody?.style.getPropertyValue("--booksSplitter-width");
      // Adressbuch: nur die Rasterspalte setzen, die Liste füllt sie aus –
      // eine eigene Breite ragte über die Spalte, wenn Thunderbird sie bei
      // knappem Fenster schmaler lässt (Kontaktliste und Details haben Mindestbreiten)
      const setW = v => {
        if (gridBody) {
          gridBody.style.setProperty("--booksSplitter-width", `${v}px`);
          gridBody.style.setProperty("--mc-ab-anim-min", `${Math.max(0, Math.min(v, Math.max(abMin, full)))}px`);
          return;
        }
        el.style.setProperty("width", `${v}px`, "important");
        el.style.setProperty("max-width", `${v}px`, "important");
      };
      // Adressbuch: beim Ausblenden die Breite der Kontaktliste merken; beim
      // Einblenden behält sie gleich wieder diese Breite (wie die Mailliste) und
      // die Details geben den Platz ab – sonst schrumpfte die Liste erst nach und
      // nach und drückte die Bücherliste unter ihre Breite (unter Windows sichtbar)
      const shared = gridBody?.querySelector("#sharedSplitter");
      const cardsPane = gridBody?.querySelector("#cardsPane");
      if (gridBody && !show && cardsPane) {
        el.__mcCardsWidth = Math.round(cardsPane.getBoundingClientRect().width);
      }
      if (gridBody && show && shared && el.__mcCardsWidth && "width" in shared) {
        shared.width = el.__mcCardsWidth;
        el.__mcShowing = true;
      }
      // beim Ausblenden gleich die volle Breite festhalten – ohne sie wird die
      // Leiste (min-width 0, overflow hidden) im ersten Bild schmaler und
      // springt dann zurück (Kalender/Aufgaben)
      setW(show ? 0 : full);
      // Kante der Leiste für die Toolbar (--mc-side-right: Seitenleisten-Knopf): linke Kante der Leiste
      // zur Toolbar-Zeile einmal messen, dann pro Bild nur Kante + Breite schreiben (ein Schreiben an der
      // Zeile, kein Messen) – sonst bliebe der Knopf stehen und spränge am Ende (Stufe 2)
      const topDoc = w.document;
      const barRow = topDoc.getElementById("unifiedToolbarContainer");
      const tabNow = topDoc.getElementById("tabmail")?.currentTabInfo;
      const edgeBase = barRow ? (el.ownerDocument != topDoc ? rectOf(tabNow?.browser)?.left || 0 : 0) + rectOf(el).left - rectOf(barRow).left : NaN;
      // Kalender: die Knöpfe beginnen gleich rechts der Leiste (--mc-tab-offset = Kante + 12 px − Anfang der Knöpfe),
      // der Wert wächst also mit der Breite – vom heutigen Wert aus mitführen
      const tabOffset0 = parseFloat(barTarget(topDoc).style.getPropertyValue("--mc-tab-offset"));
      const followTab = mode == "calendar" && Number.isFinite(tabOffset0);
      const W0 = show ? 0 : full;
      // Gemeinsam mit der Bereiche-Leiste (ab Dia 2/4, Ein- und Ausblenden): alle Werte, die das Ausrichten der
      // Toolbar-Zeile (updateSideEdge) an die Zeile und die in sie verlegten Leisten schreibt – Kanten
      // (--mc-side-right, --mc-tab-offset), Listenkopf (--mc-ab-list-right, --mc-task-list-right), Umschalter des
      // Kalenders (--mc-tab-left), Aktionen der Aufgabe (--mc-ta-left), Statusleiste –, einmal für den Endzustand
      // vorab rechnen (Endzustand synchron herstellen, nichts wird gezeichnet, dann zurückstellen) und pro Bild
      // zwischen Anfangs- und Endwert führen. Solange die Bereiche-Leiste animiert, richtet updateSideEdge nicht aus
      // (jedes Schreiben ans Fenster kostet einen vollen Layout-Durchlauf): ohne Vorabrechnung standen diese Werte
      // beim Einblenden ab dem ersten Bild am Endplatz und blieben beim Ausblenden bis zum letzten am Anfang –
      // „New“ und Anzeigeoptionen im Adressbuch sprangen 207 px, „Mark“ in den Aufgaben 28 px, Day/Week/Month im
      // Kalender 96 px (Stufe 4, auf alle Werte und beide Richtungen erweitert)
      const hosts = [barRow, topDoc.getElementById("status-bar"),
        ...["chat-view-toolbox", "viewToggle", "task-addition-box", "task-actions-toolbar"].map(id => topDoc.getElementById(id)),
        topDoc.documentElement].filter(Boolean);
      const snapshot = () => {
        const s = new Map();
        for (const host of hosts) {
          for (let i = 0; i < host.style.length; i++) {
            const n = host.style[i];
            if (n.startsWith("--mc-")) {
              s.set(`${host.id || host.localName}|${n}`, [host, n, host.style.getPropertyValue(n)]);
            }
          }
        }
        return s;
      };
      let edgeRun = null; // [Element, Variable, Anfang, Ende] je Wert, der sich ändert
      if (w.__mcSpacesJump && barRow) {
        const start = snapshot();
        w.__mcDry = true;
        try {
          w.__mcSpacesJump(show ? 1 : 0);
          setW(show ? full : 0);
          topDoc.documentElement.getBoundingClientRect();
          // bis die Werte stillstehen (höchstens vier Durchgänge): Aufgaben rechnen Kopf und Aktionen nach dem
          // gemessenen „+“, das erst mit dem Abstand des vorigen Durchgangs an seinem Platz steht
          let end = null;
          for (let i = 0, before = null; i < 4; i++) {
            this.sideEdgeUpdaters?.forEach(f => f());
            end = snapshot();
            const now = [...end.values()].map(v => v[2]).join("|");
            if (now == before) {
              break;
            }
            before = now;
          }
          edgeRun = [];
          for (const [key, [host, n, v1]] of end) {
            const v0 = start.get(key)?.[2];
            const a = parseFloat(v0), b = parseFloat(v1);
            // (das Wurzelelement nur zurückstellen, nicht je Bild schreiben – das rechnete das ganze Fenster neu)
            if (host != topDoc.documentElement && /px$/.test(v0 || "") && /px$/.test(v1) && Number.isFinite(a) && Number.isFinite(b) && a != b) {
              edgeRun.push([host, n, a, b]);
            }
            // Anfangswerte zurück; Werte, die erst der Trockenlauf anlegte, wieder weg
            if (v0) {
              host.style.setProperty(n, v0);
            } else {
              host.style.removeProperty(n);
            }
          }
        } catch (e) {
          log("dry-run error", e);
          edgeRun = null;
        } finally {
          setW(W0);
          w.__mcSpacesJump(show ? 0 : 1);
          w.__mcDry = false;
        }
      }
      // gemeinsamer Takt (animiere): Fortschritt läuft vor oder nach einer Umkehr zurück. Takt immer aus dem
      // Hauptfenster, auch wenn die Leiste in einem eigenen Dokument liegt (Adressbuch, Einstellungen): jedes Bild
      // schreibt Kanten an die Toolbar-Zeile des Hauptfensters; aus dem Bildtakt des eingebetteten Dokuments kamen
      // sie erst nach dessen Durchrechnen an, das Hauptfenster wurde je Bild zweimal neu berechnet (unter Windows
      // gingen dabei Bilder verloren)
      const anim = animiere(w, {
        dauer: DURATION,
        kurve: curve,
        beiUmkehr: dir => saveState(dir > 0 ? !show : show),
        bild: (p, k, letzt) => {
          const W = full * (show ? p : 1 - p);
          setW(W);
          if (edgeRun) {
            // Fortschritt vom Anfangs- zum Endzustand 0 → 1 (Einblenden: mit der Breite, Ausblenden: gegen sie)
            const q = full ? (show ? W / full : 1 - W / full) : 1;
            for (const [host, n, a, b] of edgeRun) {
              setVar(host, n, `${Math.max(0, Math.round(a + (b - a) * q))}px`);
            }
          } else if (Number.isFinite(edgeBase)) {
            setBarVar(topDoc, "--mc-side-right", `${Math.max(0, Math.round(edgeBase + W))}px`);
          }
          if (followTab && !edgeRun) {
            setBarVar(topDoc, "--mc-tab-offset", `${Math.max(0, Math.round(tabOffset0 + W - W0))}px`);
          }
          // im letzten Bild nicht: ende() stellt gleich darauf die Stile zurück und richtet dann einmal aus – ein
          // Ausrichten davor wäre ein zweiter voller Layout-Durchlauf im selben Bild (mit dem Ende der Bereiche-Leiste
          // im selben Bild der dritte; in der Windows-VM 20–26 ms Skript im Endbild, ein verlorenes Bild)
          if (!letzt) {
            updateSideEdge();
          }
        },
        ende: k => {
          const shown = show == (k >= 1);
          delete el.__mcReverse;
          for (const [prop, value, prio] of saved) {
            if (value) {
              el.style.setProperty(prop, value, prio);
            } else {
              el.style.removeProperty(prop);
            }
          }
          kids.forEach(kid => kid.style.removeProperty("min-width"));
          if (gridBody) {
            gridBody.style.removeProperty("--mc-ab-anim-min");
            if (savedColumn) {
              gridBody.style.setProperty("--booksSplitter-width", savedColumn);
            } else {
              gridBody.style.removeProperty("--booksSplitter-width");
            }
          }
          if (!shown) {
            el.classList.add("mc-side-hidden");
            splitter?.classList.add("mc-side-hidden");
          }
          el.classList.remove("mc-side-anim");
          el.__mcAnimating = false;
          delete el.__mcShowing;
          updateSideEdge();
          sidebarTip?.();
          placeSideGrip();
        },
      });
      el.__mcReverse = () => anim.umkehren();
    };

    // Seitenleiste per Trennlinie ziehen – in allen Bereichen dieselbe Logik
    // (dragPane): breiter/schmaler bis zur gemeinsamen Höchstbreite, unter
    // DRAG_HIDE px sofort und ohne Animation ausgeblendet, im selben Zug
    // zurückgezogen wieder da. Ausgeblendet bleibt am linken Rand eine schmale
    // Greifzone (#mcSideGrip), an der man sie wieder herauszieht. Die Breite
    // von vor dem Ziehen bleibt fürs Einblenden
    // (wie macOS: erst bei halber Mindestbreite, vorher klappte sie schon bei
    // 120 px und damit zu früh ein, kaum dass sie an der Mindestbreite stand)
    const DRAG_HIDE = 80;
    const SIDE_MIN = 160;
    const SIDE_ROOM = 400; // mindestens so viel Platz bleibt der Ansicht daneben
    const SIDE_GRIP = 5; // so breit wie die Trennlinien
    const setSideHidden = (mode, el, splitter, hidden) => {
      if (!hidden) {
        unCollapse(el, splitter);
      }
      el.classList.toggle("mc-side-hidden", hidden);
      splitter?.classList.toggle("mc-side-hidden", hidden);
      updateSideEdge();
      sidebarTip?.();
      placeSideGrip();
      // gezogen ein-/ausgeblendet: die Bereiche-Leiste zieht mit
      spacesFollow(hidden);
    };
    const hideSideNow = (mode, el, splitter) => setSideHidden(mode, el, splitter, true);
    // Seitenleiste des Tabs als Objekt für dragPane
    const sidePane = tab => {
      const mode = tab?.mode?.name;
      const [el, splitter, win] = sidebarFor(tab);
      if (!el || !win) {
        return null;
      }
      const commonWidth = () => Math.min(sideMax(el), Services.prefs.getIntPref(WIDTH_PREF, 0) || 206);
      // Mindestbreite der Leiste: die gemeinsame (SIDE_MIN) oder eine größere aus dem CSS (Kalender: 228 px für den
      // Minikalender) – mit 160 px gerechnet blieb die Kalenderleiste beim Zuziehen über 150 px Zeigerweg bei 228 px
      // stehen und sprang erst bei 80 px weg (ruckelte, klappte scheinbar unvermittelt ein). Eingeklappt wird bei der
      // Hälfte davon (wie macOS)
      const minWidth = () => Math.max(SIDE_MIN, parseFloat(win.getComputedStyle(el).minWidth) || 0);
      const pane = {
        el, splitter, win, mode,
        side: "left",
        width: () => el.getBoundingClientRect().width,
        min: minWidth,
        threshold: () => Math.max(DRAG_HIDE, minWidth() / 2),
      };
      const lock = W => {
        // Thunderbirds Sperre der Breite („width: …px !important“) mitziehen
        if (el.style.getPropertyPriority("width") == "important") {
          el.style.setProperty("width", `${W}px`, "important");
        }
      };
      if (mode == "mail3PaneTab") {
        if (!splitter) {
          return null;
        }
        // Mail: ausgeblendet heißt von Thunderbirds Teiler zugeklappt
        pane.hidden = () => splitter.isCollapsed;
        pane.setHidden = hidden => {
          splitter.isCollapsed = hidden;
          if (!hidden) {
            lock(splitter.width || commonWidth());
          }
          updateSideEdge();
          this.offsetUpdaters?.forEach(fn => fn());
          sidebarTip?.();
          placeSideGrip();
        };
        pane.setWidth = W => {
          splitter.width = W;
          lock(W);
        };
        pane.save = () => splitter.dispatchEvent(new win.CustomEvent("splitter-resized", { bubbles: true }));
      } else {
        const hr = splitter?.localName == "hr" && "width" in splitter;
        pane.hidden = () => el.classList.contains("mc-side-hidden");
        pane.setHidden = hidden => setSideHidden(mode, el, splitter, hidden);
        // ohne eigene Trennlinie (Einstellungen): feste Breite, nur ein-/ausblenden
        if (splitter) {
          pane.setWidth = W => {
            if (hr) {
              splitter.width = W;
            } else {
              el.style.setProperty("width", `${W}px`, "important");
            }
          };
          pane.save = () => {
            if (hr) {
              splitter.dispatchEvent(new win.CustomEvent("splitter-resized", { bubbles: true }));
              return;
            }
            const W = parseFloat(el.style.getPropertyValue("width"));
            if (W) {
              el.setAttribute("width", String(Math.round(W)));
              try {
                Services.xulStore.persist(el, "width");
              } catch {} // gewollt: Breite nicht gemerkt, gilt nur für diese Sitzung
            }
          };
        }
      }
      pane.commonWidth = commonWidth;
      return pane;
    };
    const startSideDrag = event => {
      const pane = sidePane(w.document.getElementById("tabmail")?.currentTabInfo);
      if (!pane || event.button != 0 || pane.el.__mcAnimating || pane.win.__mcAnimating) {
        return;
      }
      // höchstens die gemeinsame Höchstbreite, aber nie so breit, dass die
      // Ansicht daneben (Mailliste, Kalender, Chat) unter ihre Mindestbreite
      // gedrückt wird – Thunderbirds eigener Teiler (jetzt abgeschaltet) hat
      // das bisher selbst begrenzt
      let room = Infinity;
      try {
        const parent = pane.el.parentElement;
        let need = 0;
        for (const c of parent?.children || []) {
          if (c != pane.el && c != pane.splitter && c.getBoundingClientRect().width > 0) {
            need += parseFloat(pane.win.getComputedStyle(c).minWidth) || 0;
          }
        }
        if (parent) {
          room = parent.getBoundingClientRect().width - Math.max(SIDE_ROOM, need);
        }
      } catch {} // gewollt: Platz nicht messbar, Höchstbreite ohne Abzug
      const min = pane.min();
      const max = Math.max(min, Math.min(sideMax(pane.el), room));
      let resized = false;
      // Seitenleiste und Bereiche-Kacheln sind ein gemeinsamer Bereich: an
      // der Schwelle gehen beide zugleich weg bzw. kommen zurück (vorher blieben
      // die Kacheln bis zum Loslassen allein stehen). Der Sprung an der Schwelle
      // ist erlaubt; dazwischen bleibt die Bereiche-Leiste stehen
      w.__mcSideDrag = true;
      dragPane(event, {
        side: "left",
        hidden: pane.hidden,
        width: pane.width,
        threshold: pane.threshold,
        setHidden: h => {
          pane.setHidden(h);
          if (w.gSpacesToolbar && !w.__mcColumnQuiet && columnHidden() != h) {
            toggleSpacesNow(h);
          }
        },
        setWidth: pane.setWidth && (W => {
          pane.setWidth(Math.round(Math.min(max, Math.max(min, W))));
          resized = true;
          updateSideEdge();
        }),
        done: hidden => {
          if (pane.setWidth) {
            if (hidden) {
              // ausgeblendet losgelassen: beim Einblenden wieder die gemeinsame Breite
              pane.setWidth(pane.commonWidth());
            } else if (resized) {
              Services.prefs.setIntPref(WIDTH_PREF, Math.round(pane.width()));
            }
            pane.save?.();
          }
          placeSideGrip();
          updateSideEdge();
          this.offsetUpdaters?.forEach(fn => fn());
          w.__mcSideDrag = false;
          spacesFollow(hidden);
        },
      });
    };
    // Greifzone: bei ausgeblendeter Seitenleiste am linken Rand (gleich rechts
    // der Bereiche-Leiste), bei einer Leiste ohne eigene Trennlinie
    // (Einstellungen) auch an ihrem rechten Rand – eine je Dokument
    const sideGrip = doc => {
      let grip = doc.getElementById("mcSideGrip");
      if (grip) {
        return grip;
      }
      grip = doc.createElementNS("http://www.w3.org/1999/xhtml", "div");
      grip.id = "mcSideGrip";
      grip.setAttribute("aria-hidden", "true");
      grip.style.cssText = `position: fixed; z-index: 10; width: ${SIDE_GRIP}px; display: none;`;
      grip.addEventListener("pointerdown", startSideDrag);
      grip.addEventListener("mousedown", blockNativeSplitter, true);
      doc.documentElement.append(grip);
      this.addWinRestorer(doc.defaultView == w ? null : doc.defaultView, () => grip.remove());
      return grip;
    };
    // Schwebende Seitenleiste (Dia 3/4, unten bei hookSideFloat): Auslösestreifen
    // am Fensterrand mitsetzen; hier nur die Einsprungstellen
    const sideFloat = {};
    const placeSideGrip = () => {
      sideFloat.place?.();
      const pane = sidePane(w.document.getElementById("tabmail")?.currentTabInfo);
      const mainGrip = w.document.getElementById("mcSideGrip");
      if (mainGrip && pane?.el.ownerDocument != w.document) {
        mainGrip.style.display = "none";
      }
      if (!pane) {
        return;
      }
      const grip = sideGrip(pane.el.ownerDocument);
      const hidden = pane.hidden();
      if (!hidden && pane.splitter) {
        grip.style.display = "none";
        return;
      }
      const box = (hidden ? pane.el.parentNode : pane.el).getBoundingClientRect();
      if (!box.height) {
        grip.style.display = "none";
        return;
      }
      grip.style.left = `${Math.round(hidden ? box.left : box.right - SIDE_GRIP / 2)}px`;
      grip.style.top = `${Math.round(box.top)}px`;
      grip.style.height = `${Math.round(box.height)}px`;
      grip.style.cursor = hidden ? "e-resize" : "col-resize";
      grip.style.display = "block";
    };
    // Fenstergröße geändert oder Bereiche-Leiste ein-/ausgeblendet: neu setzen
    const gripRo = new w.ResizeObserver(() => placeSideGrip());
    const gripBox = w.document.getElementById("tabmail-container");
    gripBox && gripRo.observe(gripBox);
    this.restorers.push(() => gripRo.disconnect());
    // Trennlinie des Bereichs übernehmen (statt Thunderbirds eigenem Ziehen)
    const hookSideDrag = tab => {
      placeSideGrip();
      const [el, splitter, win] = sidebarFor(tab);
      if (!el || !splitter || !win || splitter.__mcSideDrag === this) {
        return;
      }
      splitter.__mcSideDrag = this;
      splitter.addEventListener("pointerdown", startSideDrag);
      splitter.addEventListener("mousedown", blockNativeSplitter, true);
      // Mail: Thunderbird klappt die Ordnerliste auch selbst (Menü Ansicht)
      splitter.addEventListener("splitter-collapsed", placeSideGrip);
      splitter.addEventListener("splitter-expanded", placeSideGrip);
      this.addWinRestorer(win, () => {
        splitter.removeEventListener("pointerdown", startSideDrag);
        splitter.removeEventListener("mousedown", blockNativeSplitter, true);
        splitter.removeEventListener("splitter-collapsed", placeSideGrip);
        splitter.removeEventListener("splitter-expanded", placeSideGrip);
        if (splitter.__mcSideDrag === this) {
          delete splitter.__mcSideDrag;
        }
      });
    };

    // Suchfeld oben rechts: im Adressbuch filtert es die Kontakte, im Kalender
    // die Terminliste, in den Aufgaben die Aufgabenliste, in den Einstellungen die Einstellungen (statt der
    // Mail-Volltextsuche) – die Suchfelder in diesen Seiten entfallen.
    const SEARCH_TARGETS = {
      addressBookTab: {
        label: "Search Contacts",
        input: cw => cw?.cardsPane?.searchInput,
        set: (input, text) => input.overrideSearchTerm(text), // löst dort selbst die Suche aus
      },
      tasks: {
        label: "Search Tasks",
        input: () => w.document.getElementById("task-text-filter-field"),
        set: (input, text) => {
          input.value = text;
          input.dispatchEvent(new w.Event("input", { bubbles: true }));
        },
      },
      // Kalender: Treffer wie bei Apple Kalender im rechten Bereich neben der
      // Ansicht, nach Tagen gruppiert, über alle Termine (CalSearch in
      // kalender.js); Leeren schließt den Bereich (GitHub #53)
      calendar: {
        label: "Search Calendar",
        input: () => ({ value: w.__mcCalSearch?.term || "" }),
        set: (input, text) => CalSearch.set(w, text),
      },
      // Mail: alle Postfächer (Suchordner), Tippen sucht kurz verzögert
      mail3PaneTab: {
        label: "Search All Mailboxes",
        input: () => ({ value: this.mailSearchTerm || "" }),
        mail: true,
      },
      preferencesTab: {
        label: "Search Settings",
        input: cw => cw?.document.getElementById("searchInput"),
        set: (input, text) => {
          input.value = text;
          input.dispatchEvent(new input.ownerDocument.defaultView.Event("input", { bubbles: true }));
        },
      },
    };
    this.restorers.push(() => CalSearch.remove(w));
    const currentTarget = () => {
      const tab = w.document.getElementById("tabmail")?.currentTabInfo;
      const target = SEARCH_TARGETS[tab?.mode?.name];
      return target ? { target, cw: tab.browser?.contentWindow } : null;
    };
    const abWindow = () => {
      const tab = w.document.getElementById("tabmail")?.currentTabInfo;
      return tab?.mode?.name == "addressBookTab" ? tab.browser?.contentWindow : null;
    };
    const globalSearch = () => w.document.querySelector("#unifiedToolbarContent global-search-bar");
    // Platzhalter einheitlich „Search …“ je Bereich; in der Mail je Ordner
    // („Search Sent“), bei Sammelordnern „Search All Mailboxes“
    const PLACEHOLDERS = { calendar: "Search Calendar", tasks: "Search Tasks", chat: "Search Chat",
      addressBookTab: "Search Contacts", preferencesTab: "Search Settings" };
    const placeholderText = mode => {
      if (mode == "mail3PaneTab") {
        const base = this.searchBase(w.document.getElementById("tabmail")?.currentAbout3Pane);
        return this.isUnifiedFolder(base) ? tr("Search All Mailboxes") : tr("Search {name}", { name: appleFolderName(base) });
      }
      return tr(PLACEHOLDERS[mode] || "Search");
    };
    const setPlaceholder = mode => {
      const placeholder = globalSearch()?.querySelector('[slot="placeholder"]');
      if (placeholder && !placeholder.hasAttribute("data-l10n-id")) {
        const text = placeholderText(mode);
        if (placeholder.textContent != text) {
          placeholder.textContent = text;
        }
      }
    };
    w.__mcSearchPlaceholder = () => setPlaceholder(w.document.getElementById("tabmail")?.currentTabInfo?.mode?.name);
    this.restorers.push(() => delete w.__mcSearchPlaceholder);
    // Tab, dessen Suchbegriff zuletzt ins Feld kam: nur beim Wechsel des Tabs
    // übernimmt das Feld den Begriff des Bereichs. markTab läuft auch ohne
    // Wechsel (in den ersten 30 s jede Sekunde) – schrieb es dann den alten
    // Begriff zurück, meldete Thunderbird ihn 250 ms später erneut und eine
    // inzwischen getippte Suche war weg (Kalender-Suche)
    let searchTab = null;
    this.restorers.push(() => (searchTab = null));
    const syncSearchForTab = mode => {
      const bar = globalSearch();
      if (!bar) {
        return;
      }
      const target = SEARCH_TARGETS[mode];
      const tab = w.document.getElementById("tabmail")?.currentTabInfo || null;
      const sameTab = !!target && tab == searchTab && w.__mcSearchMode == mode;
      searchTab = target ? tab : null;
      if (w.__mcSearchMode && w.__mcSearchMode != mode) {
        bar.reset(); // leert dabei auch die Suche der verlassenen Seite
      }
      w.__mcSearchMode = target ? mode : null;
      // Platzhalter je Bereich: Thunderbird gibt dem Suchfeld einen eigenen
      // <span slot="placeholder"> – das placeholder-Attribut (nur Ersatzinhalt
      // des Slots) bliebe unsichtbar. Erst nachdem styleSearch Thunderbirds
      // Text abgekoppelt hat (sonst bleibt dessen Übersetzung stehen).
      setPlaceholder(mode);
      if (target && !sameTab) {
        const term = target.input(currentTarget()?.cw)?.value || "";
        bar.overrideSearchTerm?.(term);
      }
    };
    const hookSearchForwarding = () => {
      const content = w.document.getElementById("unifiedToolbarContent");
      if (!content || content.__mcSearchHook) {
        return;
      }
      content.__mcSearchHook = true;
      const forward = event => {
        if (!w.__mcSearchMode || event.target.localName != "global-search-bar") {
          return;
        }
        event.stopImmediatePropagation();
        event.preventDefault();
        const cur = currentTarget();
        if (cur?.target.mail) {
          const text = event.type == "search" ? event.detail ?? event.target.value : event.detail;
          w.clearTimeout(w.__mcMailSearchTimer);
          const run = () => this.mailSearch(w, text || "");
          // Eingabetaste oder leeres Feld sofort, beim Tippen kurz warten
          if (event.type == "search" || !text) {
            run();
          } else {
            w.__mcMailSearchTimer = w.setTimeout(run, 250);
          }
          return;
        }
        const input = cur?.target.input(cur.cw);
        if (input && event.type == "autocomplete") {
          cur.target.set(input, event.detail || "");
        }
      };
      content.addEventListener("autocomplete", forward, true);
      content.addEventListener("search", forward, true);
      this.restorers.push(() => {
        content.removeEventListener("autocomplete", forward, true);
        content.removeEventListener("search", forward, true);
        delete content.__mcSearchHook;
      });
    };

    // Vorschläge der Suche oben (nur noch im Chat): Thunderbird macht die Liste
    // nur so breit wie das Feld – bei wenig Platz ist das Feld schmal und die
    // Einträge werden abgeschnitten. Die Liste ist darum so breit wie das
    // Suchfeld in voller Breite (--mt-suggest-min im Stilblatt), aber nie
    // breiter als der Platz bis zum Fensterrand (unter Windows ist das Feld
    // auch bei breitem Fenster schmal, das Fenster oft kaum breiter), und
    // schließt mit dem Feld bündig ab: rechts (links bei Schrift von rechts
    // nach links), denn das Feld steht am Ende der Leiste
    const hookSuggestWidth = () => {
      const d = w.document;
      if (d.__mcSuggestWidth) {
        return;
      }
      d.__mcSuggestWidth = true;
      const place = event => {
        const popup = event.target;
        if (popup.id != "PopupGlodaAutocomplete") {
          return;
        }
        const bar = globalSearch();
        const anchor = popup.anchorNode;
        popup.removeAttribute("mc-suggest-wide");
        popup.style.removeProperty("--mc-suggest-width");
        popup.style.removeProperty("--mc-suggest-shift");
        if (!bar || !anchor || !bar.getBoundingClientRect().width) {
          return;
        }
        const f = bar.getBoundingClientRect();
        const a = anchor.getBoundingClientRect();
        const cs = w.getComputedStyle(popup);
        const min = parseFloat(cs.getPropertyValue("--mt-suggest-min")) || 0;
        const edge = parseFloat(cs.getPropertyValue("--mt-suggest-edge")) || 0;
        const rtl = w.getComputedStyle(bar).direction == "rtl";
        // Platz vom Feldende bis zum gegenüberliegenden Fensterrand
        const room = (rtl ? w.innerWidth - f.left : f.right) - edge;
        const width = Math.floor(Math.max(f.width, Math.min(min, room)));
        popup.style.setProperty("--mc-suggest-width", `${width}px`);
        const shift = rtl ? a.right - (f.left + width) : f.right - width - a.left;
        popup.style.setProperty("--mc-suggest-shift", `${Math.round(shift)}px`);
        popup.setAttribute("mc-suggest-wide", "");
      };
      d.addEventListener("popupshowing", place, true);
      this.restorers.push(() => {
        d.removeEventListener("popupshowing", place, true);
        const popup = d.getElementById("PopupGlodaAutocomplete");
        popup?.removeAttribute("mc-suggest-wide");
        popup?.style.removeProperty("--mc-suggest-width");
        popup?.style.removeProperty("--mc-suggest-shift");
        delete d.__mcSuggestWidth;
      });
    };

    // Menüleiste → Help: „halo.spaces“ öffnet das Info-Fenster mit
    // Update-Prüfung, Feedback und „Danke sagen“.
    const hookHelpMenu = () => {
      const d = w.document;
      const popup = d.getElementById("menu_HelpPopup");
      if (!popup || d.getElementById("mcHaloSpaces")) {
        return;
      }
      const sep = d.createXULElement("menuseparator");
      sep.id = "mcCheckUpdatesSeparator";
      const item = d.createXULElement("menuitem");
      item.id = "mcHaloSpaces";
      // ohne „…“ (öffnet nur ein Info-Fenster, wie „About“), mit unserem Symbol
      // davor – auch in der Menüleiste von macOS (menuitem-iconic + image)
      item.setAttribute("label", "halo.spaces");
      item.classList.add("menuitem-iconic");
      item.setAttribute("image", "resource://mailcards/about/icon.svg");
      item.addEventListener("command", () => this.openHaloWindow(w));
      const anchor = d.getElementById("aboutName");
      popup.insertBefore(sep, anchor);
      popup.insertBefore(item, anchor);
      // „Danke sagen“ fällig: Punkt am Symbol (siehe Thanks)
      // (nach dem Laden des Bildes erneut fragen: mehrere Pref-Änderungen
      // kurz hintereinander, ein späterer Aufruf darf nicht überschrieben werden)
      const markThanks = async () => {
        const image = Thanks.due() ? await Thanks.iconWithDot(w).catch(() => null) : null;
        const due = Thanks.due();
        item.setAttribute("image", (due && image) || "resource://mailcards/about/icon.svg");
        item.toggleAttribute("mc-thanks", due);
      };
      markThanks();
      Thanks.listeners.add(markThanks);
      this.restorers.push(() => {
        Thanks.listeners.delete(markThanks);
        sep.remove();
        item.remove();
      });
    };

    // Ansicht → Vorschauzeilen (Menüleiste und App-Menü → Ansicht): Keine,
    // 1–4 Zeilen, Häkchen am aktuellen Wert; gilt sofort (applyPreviewLines).
    // Nur in der Kartenansicht wirksam, in der Tabelle daher ausgegraut
    // Darstellung → „Show with Light Background“ wie Apple Mail: die gerade
    // angezeigte Nachricht im Dunkelmodus ohne Umfärbung hell zeigen; gilt nur
    // für sie (die nächste Nachricht ist wieder dunkel)
    const hookLightMessage = () => {
      const d = w.document;
      const anchorItem = d.getElementById("viewBodyMenu");
      if (!anchorItem || d.getElementById("mcLightMessage")) {
        return;
      }
      const tabmail = d.getElementById("tabmail");
      const patched = new Set();
      const patch = mw => {
        if (!mw || mw.__mcLightPatched || typeof mw.displayMessage != "function") {
          return;
        }
        mw.__mcLightPatched = true;
        const origDisplay = mw.displayMessage, origAdapt = mw.adaptMessageForDarkMode;
        const pane = () => mw.getMessagePaneBrowser?.();
        // andere Nachricht: wieder wie eingestellt (dunkel)
        mw.displayMessage = function (uri, ...rest) {
          if (mw.__mcLight && uri != mw.__mcLight) {
            mw.__mcLight = null;
            try {
              pane().browsingContext.prefersColorSchemeOverride = "none";
            } catch {} // gewollt: Nachrichtenbereich schon weg
          }
          return origDisplay.call(this, uri, ...rest);
        };
        Object.defineProperty(mw, "adaptMessageForDarkMode", { configurable: true, writable: true,
          value: browser => (mw.__mcLight && mw.__mcLight == mw.gMessageURI ? undefined : origAdapt(browser)) });
        patched.add([mw, origDisplay, origAdapt]);
      };
      const current = () => tabmail?.currentAboutMessage || d.getElementById("messageBrowser")?.contentWindow || null;
      const item = d.createXULElement("menuitem");
      item.id = "mcLightMessage";
      item.setAttribute("type", "checkbox");
      item.setAttribute("label", tr("Show with Light Background"));
      item.addEventListener("command", () => {
        const mw = current();
        if (!mw?.gMessageURI) {
          return;
        }
        patch(mw);
        const light = mw.__mcLight != mw.gMessageURI;
        mw.__mcLight = light ? mw.gMessageURI : null;
        try {
          mw.getMessagePaneBrowser().browsingContext.prefersColorSchemeOverride = light ? "light" : "none";
        } catch (e) {
          log("light message error", e);
        }
        mw.ReloadMessage?.();
      });
      anchorItem.after(item);
      const viewPopup = d.getElementById("menu_View_Popup");
      const onView = event => {
        if (event.target != viewPopup) {
          return;
        }
        const mw = current();
        const dark = w.matchMedia("(prefers-color-scheme: dark)").matches;
        item.hidden = !dark;
        item.disabled = !mw?.gMessageURI;
        item.toggleAttribute("checked", !!mw?.gMessageURI && mw.__mcLight == mw.gMessageURI);
      };
      viewPopup?.addEventListener("popupshowing", onView);
      this.restorers.push(() => {
        viewPopup?.removeEventListener("popupshowing", onView);
        item.remove();
        for (const [mw, origDisplay, origAdapt] of patched) {
          try {
            if (mw.__mcLight) {
              mw.getMessagePaneBrowser().browsingContext.prefersColorSchemeOverride = "none";
            }
            mw.displayMessage = origDisplay;
            Object.defineProperty(mw, "adaptMessageForDarkMode", { configurable: true, writable: true, value: origAdapt });
            delete mw.__mcLight;
            delete mw.__mcLightPatched;
          } catch {} // gewollt: Fenster schon geschlossen, Rückbau nicht mehr nötig
        }
      });
    };
    const hookPreviewMenu = () => {
      const d = w.document;
      if (d.getElementById("mcPreviewLines")) {
        return;
      }
      const values = [0, 1, 2, 3, 4];
      const label = n => (n == 0 ? tr("None") : n == 1 ? tr("1 Line") : tr("{n} Lines", { n }));
      const current = () => Math.max(0, Math.min(4, Services.prefs.getIntPref(PREVIEW_PREF, 1)));
      const choose = n => {
        if (n == 1) {
          Services.prefs.clearUserPref(PREVIEW_PREF); // Standard: nichts im Profil speichern
        } else {
          Services.prefs.setIntPref(PREVIEW_PREF, n);
        }
      };
      const added = [];
      // Menüleiste: Untermenü nach „Layout“
      const layout = d.getElementById("menu_MessagePaneLayout");
      if (layout) {
        const menu = d.createXULElement("menu");
        menu.id = "mcPreviewLines";
        menu.setAttribute("label", tr("Preview Lines"));
        const popup = d.createXULElement("menupopup");
        popup.id = "mcPreviewLinesPopup";
        for (const n of values) {
          const item = d.createXULElement("menuitem");
          item.setAttribute("type", "radio");
          item.setAttribute("name", "mcpreviewlines");
          item.setAttribute("label", label(n));
          item.setAttribute("value", String(n));
          item.addEventListener("command", () => choose(n));
          popup.append(item);
        }
        popup.addEventListener("popupshowing", event => {
          if (event.target != popup) {
            return;
          }
          for (const item of popup.children) {
            item.toggleAttribute("checked", item.getAttribute("value") == String(current()));
          }
        });
        menu.append(popup);
        layout.after(menu);
        added.push(menu);
        const viewPopup = d.getElementById("menu_View_Popup");
        const onView = event => {
          if (event.target == viewPopup) {
            menu.disabled = viewChoice() != "cards";
          }
        };
        viewPopup?.addEventListener("popupshowing", onView);
        this.restorers.push(() => viewPopup?.removeEventListener("popupshowing", onView));
      }
      // App-Menü → Ansicht: Knopf mit eigener Unteransicht wie „Layout“
      const appLayout = d.getElementById("appmenu_MessagePaneLayout");
      const viewView = d.getElementById("appMenu-viewView");
      if (appLayout && viewView) {
        const view = d.createXULElement("panelview");
        view.id = "mcPreviewLinesView";
        view.className = "PanelUI-subView";
        view.setAttribute("title", tr("Preview Lines"));
        const body = d.createXULElement("vbox");
        body.className = "panel-subview-body";
        for (const n of values) {
          const button = d.createXULElement("toolbarbutton");
          button.className = "subviewbutton subviewbutton-iconic";
          button.setAttribute("type", "radio");
          button.setAttribute("name", "mcpreviewlines");
          button.setAttribute("label", label(n));
          button.setAttribute("value", String(n));
          button.addEventListener("command", () => {
            choose(n);
            w.PanelUI?.hide();
          });
          body.append(button);
        }
        view.append(body);
        view.addEventListener("ViewShowing", () => {
          for (const button of body.children) {
            button.toggleAttribute("checked", button.getAttribute("value") == String(current()));
          }
        });
        viewView.after(view);
        const nav = d.createXULElement("toolbarbutton");
        nav.id = "appmenu_mcPreviewLines";
        nav.className = "subviewbutton subviewbutton-iconic subviewbutton-nav";
        nav.setAttribute("label", tr("Preview Lines"));
        nav.setAttribute("closemenu", "none");
        nav.addEventListener("command", () => w.PanelUI.showSubView("mcPreviewLinesView", nav));
        appLayout.after(nav);
        added.push(view, nav);
        const onAppView = () => {
          nav.disabled = viewChoice() != "cards";
        };
        viewView.addEventListener("ViewShowing", onAppView);
        this.restorers.push(() => viewView.removeEventListener("ViewShowing", onAppView));
      }
      this.restorers.push(() => added.forEach(el => el.remove()));
    };

    // Aufgaben: die Filter („Current Tasks“, „Today“ …) als Menü hinter einem
    // Knopf wie „Quick Filter“ in der Mail statt als Liste in der Seitenleiste.
    // Die Auswahl klickt Thunderbirds eigene Liste (Filterlogik und Speicherung
    // bleiben); der Knopf ist in Akzentfarbe, solange ein anderer Filter als
    // „Current Tasks“ gilt
    // Aufgaben: Filter („Current Tasks“, „Today“ …) und Ansicht (Karten/Tabelle)
    // wie in der Mail über der Liste – Filter-Knopf und „…“ im Listenkopf
    // (#mcListHeader). Die Filter-Auswahl klickt Thunderbirds eigene Liste
    // (Filterlogik und Speicherung bleiben); der Filter-Knopf ist getönt, solange
    // ein anderer Filter als „Current Tasks“ gilt
    const hookTaskFilter = () => {
      const d = w.document;
      const group = d.getElementById("task-tree-filtergroup");
      if (!group || d.getElementById("mcTaskFilterPopup")?.__mcOwner === HOOK_OWNER) {
        return;
      }
      d.getElementById("mcTaskFilterPopup")?.remove();
      d.getElementById("mcTaskFilter")?.remove(); // (Knopf der Toolbar früherer Fassungen)
      const popup = d.createXULElement("menupopup");
      popup.id = "mcTaskFilterPopup";
      popup.__mcOwner = HOOK_OWNER;
      (d.getElementById("mainPopupSet") || d.querySelector("popupset") || d.documentElement).append(popup);
      const sync = () => {
        this.updateListHeader(w);
      };
      // Sortieren (Aufgaben 4/5) wie Apple Erinnerungen: Sort By ▸ Fälligkeit,
      // Priorität, Titel, Erstellungsdatum, Trenner, Aufsteigend/Absteigend –
      // über Thunderbirds Sortierung der Aufgabenliste (gilt für Karten und
      // Tabelle, bleibt gespeichert wie ein Klick auf den Spaltenkopf)
      const sortMenu = () => {
        const tree = d.getElementById("calendar-task-tree");
        const view = tree?.mTreeView;
        const cur = view?.selectedColumn?.getAttribute("itemproperty");
        const dir = view?.sortDirection == "descending" ? "descending" : "ascending";
        const menu = d.createXULElement("menu");
        menu.id = "mcTaskSortMenu";
        menu.setAttribute("label", tr("Sort By"));
        const pop = d.createXULElement("menupopup");
        const radio = (name, label, checked, fn) => {
          const item = d.createXULElement("menuitem");
          item.setAttribute("type", "radio");
          item.setAttribute("name", name);
          item.setAttribute("label", tr(label));
          if (checked) {
            item.setAttribute("checked", "true");
          }
          item.addEventListener("command", fn);
          return item;
        };
        const sortBy = (prop, direction) => {
          const col = tree?.querySelector(`treecol[itemproperty="${prop}"]`);
          if (!col || !view) {
            return;
          }
          for (const c of tree.querySelectorAll("treecol[sortDirection]")) {
            c.removeAttribute("sortDirection");
          }
          view.selectedColumn = col;
          view.sortDirection = direction;
          col.setAttribute("sortDirection", direction);
          try {
            tree.sortItems();
            tree.invalidate();
            tree.persistColumnState?.();
          } catch (e) {
            log("task sort error", e);
          }
        };
        for (const [prop, label] of [["dueDate", "Due Date"], ["priority", "Priority"], ["title", "Title"], ["creationDate", "Creation Date"]]) {
          const item = radio("mctasksort", label, cur == prop, () => sortBy(prop, dir));
          item.dataset.sort = prop;
          pop.append(item);
        }
        pop.append(d.createXULElement("menuseparator"));
        for (const [key, label] of [["ascending", "Ascending"], ["descending", "Descending"]]) {
          const item = radio("mctasksortdir", label, dir == key, () => sortBy(cur || "dueDate", key));
          item.dataset.dir = key;
          pop.append(item);
        }
        menu.append(pop);
        return menu;
      };
      popup.addEventListener("popupshowing", event => {
        if (event.target != popup) {
          return;
        }
        if (popup.dataset.kind == "view") {
          // „list“ bleibt der gespeicherte Wert (Kompatibilität), heißt aber wie in der Mail „Kartenansicht“
          popup.replaceChildren(...[["list", "Card View"], ["table", "Table View"], ["board", "Kanban View"]].map(([key, label]) => {
            const item = d.createXULElement("menuitem");
            item.setAttribute("type", "radio");
            item.setAttribute("name", "mctaskview");
            item.setAttribute("label", tr(label));
            item.dataset.view = key;
            if (taskView() == key) {
              item.setAttribute("checked", "true");
            }
            item.addEventListener("command", () => setTaskView(w, key));
            return item;
          }), d.createXULElement("menuseparator"), sortMenu());
          return;
        }
        popup.replaceChildren(...[...group.querySelectorAll("radio")].map(radio => {
          const item = d.createXULElement("menuitem");
          item.setAttribute("type", "radio");
          item.setAttribute("name", "mctaskfilter");
          item.setAttribute("label", radio.label || radio.getAttribute("label") || radio.value);
          if (radio.selected || group.value == radio.value) {
            item.setAttribute("checked", "true");
          }
          item.addEventListener("command", () => {
            // Thunderbirds eigene Umschaltung: setzt Liste und Auswahl gemeinsam
            // (ein Klick auf das ausgeblendete Optionsfeld erreicht die Liste
            // nicht immer – sie zeigte dann weiter den alten Filter)
            if (typeof w.taskViewUpdate == "function") {
              w.taskViewUpdate(radio.value);
            } else {
              radio.click();
            }
            w.setTimeout(sync, 0);
          });
          return item;
        }));
      });
      group.addEventListener("command", sync);
      group.addEventListener("select", sync);
      sync();
      this.restorers.push(() => {
        popup.remove();
        group.removeEventListener("command", sync);
        group.removeEventListener("select", sync);
      });
    };

    // Ansicht → Layout (Menüleiste, App-Menü): nur noch die zwei gültigen
    // Kombinationen – Kartenansicht (immer vertikal), Tabelle klassisch.
    // Thunderbirds Punkte bleiben (Häkchen über mail.pane_config.dynamic,
    // syncViewChoice hält die Ansicht passend), nur umbenannt und Karten zuerst;
    // „breit“ und „Message List Header“ (ohne Wirkung, eigener Listenkopf) ausgeblendet
    const hookLayoutMenus = () => {
      const d = w.document;
      if (d.getElementById("messagePaneVertical")?.__mcLayout) {
        return;
      }
      const relabel = [
        ["messagePaneVertical", "appmenu_messagePaneVertical", tr("Card View")],
        ["messagePaneClassic", "appmenu_messagePaneClassic", tr("Table View: Classic")],
      ];
      for (const [menuId, appId, label] of relabel) {
        for (const el of [d.getElementById(menuId), d.getElementById(appId)]) {
          if (!el) {
            continue;
          }
          const old = { label: el.getAttribute("label"), accesskey: el.getAttribute("accesskey") };
          el.setAttribute("label", label);
          el.removeAttribute("accesskey");
          el.__mcLayout = true;
          this.restorers.push(() => {
            el.setAttribute("label", old.label);
            if (old.accesskey) {
              el.setAttribute("accesskey", old.accesskey);
            }
            delete el.__mcLayout;
          });
        }
      }
      for (const [firstId, beforeId] of [["messagePaneVertical", "messagePaneClassic"], ["appmenu_messagePaneVertical", "appmenu_messagePaneClassic"]]) {
        const el = d.getElementById(firstId), before = d.getElementById(beforeId);
        if (el && before && el.nextElementSibling !== null) {
          const next = el.nextElementSibling;
          before.before(el);
          this.restorers.push(() => next?.before(el));
        }
      }
      for (const id of ["messagePaneWide", "appmenu_messagePaneWide", "menu_toggleThreadPaneHeader", "appmenu_toggleThreadPaneHeader"]) {
        const el = d.getElementById(id);
        if (el && !el.hidden) {
          el.hidden = true;
          this.restorers.push(() => (el.hidden = false));
        }
      }
    };

    // Gibt es oben das Suchfeld? (fehlt, wenn die globale Suche/Indexierung
    // aus ist oder es aus der Toolbar entfernt wurde) – nur dann blendet
    // userChrome.css die Suchfelder in Einstellungen, Adressbuch, Aufgaben aus
    const markSearch = () => {
      const has = !!w.document.querySelector('#unifiedToolbarContent > li[item-id="search-bar"]');
      w.document.documentElement.toggleAttribute("mc-search", has);
      for (const tab of w.document.getElementById("tabmail")?.tabInfo || []) {
        tab.browser?.contentDocument?.documentElement?.toggleAttribute("mc-search", has);
      }
    };
    const markTab = () => {
      hookSearchForwarding();
      hookSuggestWidth();
      hookHelpMenu();
      hookPreviewMenu();
      hookLightMessage();
      try {
        hookMenubar(w, this.restorers);
      } catch (e) {
        log("menubar error", e);
      }
      hookNewTabMenus(w.document, this.restorers);
      // Aufgaben-Hooks fragen den Kalender-Manager – erst, wenn Thunderbird
      // den Kalender dieses Fensters lädt (loadCalendarComponent). Vorher lud
      // der Manager die Kalender zu früh: Kalender von Add-on-Anbietern, die
      // noch nicht bereit waren, blieben deaktiviert (GitHub #38)
      if (w.loadCalendarComponent && !w.loadCalendarComponent.hasBeenCalled) {
        if (!w.__mcTaskHookWait) {
          w.__mcTaskHookWait = w.setTimeout(() => {
            w.__mcTaskHookWait = 0;
            if (!w.closed) {
              markTab();
            }
          }, 200);
        }
      } else {
        try {
          hookTaskFilter();
          hookTaskLists(w, this.restorers);
          hookTaskArchive(w, this.restorers);
          relinkTaskTree(w, this.restorers);
          hookTaskView(w, this.restorers);
          hookTaskCards(w, this.restorers);
          hookTaskInfo(w, this.restorers);
          hookFollowingOccurrences(w, this.restorers);
          hookTaskOpen(w, this.restorers);
        } catch (e) {
          log("task filter error", e);
        }
      }
      try {
        hookLayoutMenus();
      } catch (e) {
        log("layout menu error", e);
      }
      this.todayPaneEverywhere(w);
      this.hideTodayPaneInChatOnce(w);
      this.syncTodayModes(w);
      styleContentPages();
      applySideState();
      w.setTimeout(applySideState, 400);
      w.setTimeout(applySideState, 1500);
      w.setTimeout(styleContentPages, 400);
      w.setTimeout(styleContentPages, 1500);
      const mode = w.document.getElementById("tabmail")?.currentTabInfo?.mode?.name;
      w.document.documentElement.toggleAttribute(
        "mc-mail",
        mode == "mail3PaneTab" || mode == "mailMessageTab"
      );
      w.document.documentElement.setAttribute("mc-tab", mode || "");
      markSearch();
      if (mode == "calendar") {
        w.document.getElementById("month-view")?.__mcMoreRefresh?.();
      }
      syncSearchForTab(mode);
      this.updateListHeader(w);
      syncSidebarWidth();
      w.setTimeout(syncSidebarWidth, 400); // Inhalte (Adressbuch …) evtl. später
      const current = w.document.getElementById("tabmail")?.currentTabInfo;
      hookSideDrag(current);
      w.setTimeout(() => hookSideDrag(current), 400);
      updateSideEdge();
      // Inhalt (Adressbuch, Einstellungen) ist evtl. erst später aufgebaut
      w.setTimeout(updateSideEdge, 300);
      w.setTimeout(updateSideEdge, 1200);
      // Tab-Leiste erscheint/verschwindet mit dem zweiten Tab → Kanten neu messen
      w.setTimeout(() => this.offsetUpdaters?.forEach(fn => fn()), 50);
    };
    // Esc in Einstellungen, Kalender, Adressbuch usw. schließt diesen Tab und
    // führt zurück zur vorherigen Ansicht (die Tab-Leiste ist ausgeblendet).
    // (ein Nachrichten-Tab gehört nicht dazu: ohne Tab-Leiste käme man aus ihm
    // sonst nur mit ⌘W zurück)
    const MAIL_MODES = new Set(["mail3PaneTab"]);
    const onEscape = event => {
      if (event.key != "Escape" || event.defaultPrevented ||
          event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) {
        return;
      }
      const tabmail = w.document.getElementById("tabmail");
      const tab = tabmail?.currentTabInfo;
      if (!tab || MAIL_MODES.has(tab.mode?.name) || tabmail.tabInfo.length < 2) {
        return;
      }
      // Konto einrichten nicht versehentlich mit Esc verwerfen
      if (/^about:accountsetup/.test(tab.browser?.currentURI?.spec || "")) {
        return;
      }
      // Text in einem Eingabefeld: Esc leert zuerst nur das Feld
      const target = event.composedTarget || event.target;
      if (target && /^(input|textarea)$/i.test(target.localName) && target.value) {
        return;
      }
      // offenes Menü oder Dialog: Esc schließt zuerst diesen
      const doc = target?.ownerDocument;
      if (doc?.querySelector("menupopup[open], panel[open], dialog[open]") ||
          w.document.querySelector("menupopup[open], panel[open]")) {
        return;
      }
      event.preventDefault();
      tabmail.closeTab(tab);
    };
    const hooked = new WeakSet();
    const hookEscape = () => {
      const tabmail = w.document.getElementById("tabmail");
      const targets = [w];
      for (const tab of tabmail?.tabInfo || []) {
        const cw = (tab.browser || tab.chromeBrowser)?.contentWindow;
        if (cw) {
          targets.push(cw);
        }
      }
      for (const target of targets) {
        if (!hooked.has(target)) {
          hooked.add(target);
          target.addEventListener("keydown", onEscape);
          this.addWinRestorer(target == w ? null : target, () => target.removeEventListener("keydown", onEscape));
        }
      }
    };

    // Seitenleisten-Knopf wie Apple Mail (statt das Bereiche-Menü zu öffnen):
    // blendet die ganze Spalte aus/ein – Bereiche-Leiste und die linke Leiste
    // des Bereichs (Ordnerliste, Kalenderliste, Adressbücher …) gleichzeitig,
    // mit gleicher Dauer und Kurve. Ein Klick währenddessen kehrt beide um.
    // Bereiche bleiben über ⌃1–⌃5 bzw. das Menü erreichbar.
    const toggleSidebar = () => {
      // schwebt die Leiste gerade, sofort weg – der Knopf blendet sie richtig ein
      sideFloat.end?.(false);
      const spaces = w.gSpacesToolbar;
      const tab = w.document.getElementById("tabmail")?.currentTabInfo;
      const mail = tab?.mode?.name == "mail3PaneTab";
      const ab = mail ? tab.chromeBrowser?.contentWindow : null;
      const folder = ab?.paneLayout?.folderPaneSplitter;
      const side = mail ? null : currentSide().el;
      const sideBusy = mail ? !!ab?.__mcAnimating : !!side?.__mcAnimating;
      const after = () => {
        sidebarTip?.();
        placeSideGrip();
      };
      if (w.__mcSpacesAnimating || sideBusy) {
        if (w.__mcSpacesAnimating) {
          this.animateSpaces(w, after, true);
        }
        if (sideBusy) {
          if (mail) {
            this.animateSidebar(ab, folder, after, true);
          } else {
            toggleSpaceSidebar(true);
          }
        }
        return;
      }
      // sichtbar, wenn eins von beiden sichtbar ist (sollte nie getrennt sein)
      const sideShown = mail ? !!folder && !folder.isCollapsed : !!side && !side.classList.contains("mc-side-hidden");
      const show = !(spaces && !spaces.isHidden) && !sideShown;
      const withSpaces = spaces && !!spaces.isHidden == show;
      if (withSpaces) {
        this.animateSpaces(w, after);
      }
      if (mail && folder && !!folder.isCollapsed == show) {
        this.animateSidebar(ab, folder, after, false, withSpaces);
        // Einblenden: die Platzaufteilung der Toolbar (Pillen, Suchfeld, „»“) gilt für den Endzustand – einmal
        // dort rechnen (Endzustand synchron herstellen, nichts wird gezeichnet) und zurückstellen; sonst würde
        // sie erst am Ende neu verteilt und alles spränge (Stufe 4). Ausblenden: dort nur den Abstand nach
        // „Verfassen“ fürs Ende messen (mit der Pillenverteilung des Endes, sonst endete er im schmalen Fenster
        // 3 px daneben), danach die Pillen wieder wie am Anfang verteilen – sie passten sonst am Anfang nicht.
        // In beiden Richtungen gleitet der Abstand dann je Bild vom Anfangs- zum Endwert (vorher stand er beim
        // Einblenden ab dem ersten Bild am Endwert und beim Ausblenden bis zum letzten am Anfangswert: alle Knöpfe
        // rechts von „Verfassen“ sprangen 55 px)
        if ((!withSpaces || w.__mcSpacesJump) && ab.__mcJump) {
          const bar = barTarget(w.document);
          const write = w.document.querySelector('#unifiedToolbarContent > li[item-id="write-message"]');
          const gapNow = () => (write ? parseFloat(w.getComputedStyle(write).marginInlineEnd) : NaN);
          const gapStart = gapNow();
          const gapVar = bar.style.getPropertyValue("--mc-write-gap");
          let gapEnd = NaN;
          // Abstand vor der Mittelgruppe (Antworten … Markieren steht mittig zwischen „Verfassen“ und Suchfeld):
          // gleitet ebenso vom Anfangs- zum Endwert – sonst sprang die Gruppe, wenn am Ende Pillen dazukommen
          // oder am Anfang weichen (die Mitte verschiebt sich um die halbe Pillenbreite)
          const mid = w.document.querySelector('#unifiedToolbarContent > li[item-id="write-message"] + li[item-id="spacer"]');
          const midStart = mid ? mid.getBoundingClientRect().width : NaN;
          let midEnd = NaN;
          // Anteil der Bewegung am Einzug der Knöpfe ablesen (nicht an der Zeitkurve): so laufen „Verfassen“ und die
          // Mittelgruppe im selben Takt, die Gruppe eilt nie voraus oder hinterher
          const leadNow = () => parseFloat(bar.style.getPropertyValue("--mc-toolbar-offset"));
          const leadStart = leadNow();
          let leadEnd = NaN;
          w.__mcDry = true;
          try {
            if (withSpaces) {
              w.__mcSpacesJump(show ? 1 : 0);
            }
            ab.__mcJump(1);
            w.document.documentElement.getBoundingClientRect();
            this.offsetUpdaters?.forEach(fn => fn());
            gapEnd = gapNow();
            midEnd = mid ? mid.getBoundingClientRect().width : NaN;
            leadEnd = leadNow();
          } catch (e) {
            log("dry-run error", e);
          } finally {
            ab.__mcJump(0);
            if (withSpaces) {
              w.__mcSpacesJump(show ? 0 : 1);
            }
            w.__mcDry = false;
          }
          if (!show) {
            // Pillen und Suchfeld wieder für den Anfang verteilen (Ausblenden: bis zum Ende so)
            w.__mcDry = true;
            try {
              w.document.documentElement.getBoundingClientRect();
              this.offsetUpdaters?.forEach(fn => fn());
            } catch (e) {
              log("dry-run error", e);
            } finally {
              w.__mcDry = false;
            }
          }
          // Abstand und Kanten für den Anfangszustand wieder herstellen (die Vorabrechnung schrieb die Endwerte)
          if (gapVar) {
            bar.style.setProperty("--mc-write-gap", gapVar);
          } else {
            bar.style.removeProperty("--mc-write-gap");
          }
          if (Number.isFinite(gapStart) && Number.isFinite(gapEnd) && Math.abs(gapEnd - gapStart) >= 1) {
            ab.__mcGapRun = [gapStart, gapEnd];
          }
          if (Number.isFinite(midStart) && Number.isFinite(midEnd)) {
            const content = mid.parentNode;
            ab.__mcMidRun = [midStart, midEnd, leadStart, leadEnd];
            bar.style.setProperty("--mc-mid-gap", `${midStart.toFixed(2)}px`);
            content.setAttribute("mc-mid-run", "");
            ab.__mcMidEnde = () => {
              content.removeAttribute("mc-mid-run");
              bar.style.removeProperty("--mc-mid-gap");
            };
          }
          w.document.documentElement.getBoundingClientRect();
          this.offsetUpdaters?.forEach(fn => fn());
        }
      } else if (!mail && side && side.classList.contains("mc-side-hidden") == show) {
        toggleSpaceSidebar();
      }
    };
    const hookSidebarButton = () => {
      const button = w.document.getElementById("spacesPinnedButton");
      if (!button || button.dataset.mcSidebar) {
        return;
      }
      button.dataset.mcSidebar = "1";
      const popup = button.querySelector("menupopup");
      const blockPopup = event => event.preventDefault();
      const onPress = event => {
        if (event.type == "mousedown" && event.button != 0) {
          return;
        }
        if (event.type == "keydown" && event.key != "Enter" && event.key != " ") {
          return;
        }
        event.preventDefault();
        event.stopPropagation();
        toggleSidebar();
      };
      popup?.addEventListener("popupshowing", blockPopup);
      button.addEventListener("mousedown", onPress, true);
      button.addEventListener("keydown", onPress, true);
      // Tooltip je nach Zustand: „Hide Sidebar“ bzw. „Show Sidebar“
      const oldTooltip = button.getAttribute("tooltiptext");
      const updateTip = () => {
        button.setAttribute("tooltiptext", columnHidden() ? tr("Show Sidebar") : tr("Hide Sidebar"));
      };
      updateTip();
      sidebarTip = updateTip; // nach der Animation erneut aufrufen
      button.addEventListener("mouseenter", updateTip);
      this.restorers.push(() => {
        popup?.removeEventListener("popupshowing", blockPopup);
        button.removeEventListener("mousedown", onPress, true);
        button.removeEventListener("keydown", onPress, true);
        button.removeEventListener("mouseenter", updateTip);
        delete button.dataset.mcSidebar;
        sidebarTip = null;
        if (oldTooltip) {
          button.setAttribute("tooltiptext", oldTooltip);
        } else {
          button.removeAttribute("tooltiptext");
        }
      });
    };

    // Tastenkürzel ⌃⌘S wie „Seitenleiste ausblenden/einblenden“ in Apple Mail:
    // dieselbe Aktion wie der Seitenleisten-Knopf (GitHub #56). Nur macOS –
    // für Windows/Linux ist noch kein Kürzel entschieden
    const hookSidebarKey = () => {
      const d = w.document;
      if (!IS_MAC || d.getElementById("mcKeyToggleSidebar")) {
        return;
      }
      // <command> statt oncommand am <key>: kein Skript im Attribut
      const commandset = d.createXULElement("commandset");
      const command = d.createXULElement("command");
      command.id = "mcCmdToggleSidebar";
      command.addEventListener("command", () => toggleSidebar());
      commandset.append(command);
      const keyset = d.createXULElement("keyset");
      const key = d.createXULElement("key");
      key.id = "mcKeyToggleSidebar";
      key.setAttribute("key", "s");
      key.setAttribute("modifiers", "accel,control");
      key.setAttribute("command", "mcCmdToggleSidebar");
      keyset.append(key);
      d.documentElement.append(commandset, keyset);
      this.restorers.push(() => {
        keyset.remove();
        commandset.remove();
      });
    };

    // Tastenkürzel ⌃⌘T blendet die Today-Pane ein/aus wie der Knopf #mcTodayToggle
    // (Animation inklusive); im Menü steht das Kürzel am Punkt „Today Pane“
    // (Thunderbirds F11 bleibt daneben bestehen). Nur macOS – für Windows/Linux
    // ist noch kein Kürzel entschieden (zusammen mit ⌃⌘S, Maintainer-Entscheidung offen)
    const hookTodayKey = () => {
      const d = w.document;
      if (!IS_MAC || d.getElementById("mcKeyToggleTodayPane")) {
        return;
      }
      const commandset = d.createXULElement("commandset");
      const command = d.createXULElement("command");
      command.id = "mcCmdToggleTodayPane";
      command.addEventListener("command", () => {
        const btn = d.getElementById("mcTodayToggle");
        if (btn) {
          btn.click();
        } else {
          d.getElementById("calendar_toggle_todaypane_command")?.doCommand();
        }
      });
      commandset.append(command);
      const keyset = d.createXULElement("keyset");
      const key = d.createXULElement("key");
      key.id = "mcKeyToggleTodayPane";
      key.setAttribute("key", "t");
      key.setAttribute("modifiers", "accel,control");
      key.setAttribute("command", "mcCmdToggleTodayPane");
      keyset.append(key);
      d.documentElement.append(commandset, keyset);
      // Menüpunkte zur Today-Pane zeigen das neue Kürzel statt F11
      const items = [...d.querySelectorAll('menuitem[command="calendar_toggle_todaypane_command"]')]
        .map(item => [item, item.getAttribute("key")]);
      for (const [item] of items) {
        item.setAttribute("key", "mcKeyToggleTodayPane");
      }
      this.restorers.push(() => {
        for (const [item, old] of items) {
          if (old) {
            item.setAttribute("key", old);
          } else {
            item.removeAttribute("key");
          }
        }
        keyset.remove();
        commandset.remove();
      });
    };

    // Bereiche-Leiste: ein eigener Knopf dafür entfällt (die Leiste gehört zur
    // Seitenleiste, der Seitenleisten-Knopf schaltet beides). Blendet
    // Thunderbird sie selbst ein/aus (Ansicht → Symbolleisten, Kontextmenü,
    // gespeicherter Zustand), folgt die linke Leiste des Bereichs.
    const hookSpacesToggle = () => {
      const d = w.document;
      const bar = d.getElementById("spacesToolbar");
      if (!bar || !w.gSpacesToolbar || bar.__mcColumnMo) {
        return;
      }
      const follow = () => {
        // (die schwebende Leiste nimmt der Bereiche-Leiste kurz „hidden“ –
        // das ist kein neuer Zustand)
        if (!w.__mcSpacesAnimating && !bar.hasAttribute("mc-float")) {
          applySideState();
          sidebarTip?.();
        }
      };
      // Ausgeblendet „ruht“ die Bereiche-Leiste: sie bleibt aufgebaut, nur unsichtbar und ohne Platz (userChrome.css
      // [mc-ruht]), statt hidden zu tragen. hidden heißt display:none (xul.css, !important, nicht überschreibbar) –
      // beim Einblenden baute Thunderbird die Leiste dann neu auf: 7–12 ms im Klick, mit dem Layout 14–19 ms (neon),
      // im vollen Testlauf bis 32 ms; das erste Bild nach dem Klick kam spät (Ruckeln am Anfang). Nur die
      // Sichtbarkeit wechseln kostet ≈1 ms. isHidden bleibt Thunderbirds Zustand (Menü, gespeichert); die schwebende
      // Leiste ([mc-float]) zeigt sich darüber hinweg. Auch aufgerufen von animateSpaces (im selben Bild)
      const ruhen = () => {
        if (w.gSpacesToolbar?.isHidden) {
          if (!bar.hasAttribute("mc-ruht")) {
            bar.setAttribute("mc-ruht", "true");
          }
          if (bar.hidden) {
            bar.hidden = false;
          }
        } else if (bar.hasAttribute("mc-ruht")) {
          bar.removeAttribute("mc-ruht");
        }
      };
      w.__mcSpacesRuhen = ruhen;
      const ruhMo = new w.MutationObserver(ruhen);
      ruhMo.observe(bar, { attributes: true, attributeFilter: ["hidden"] });
      ruhMo.observe(d.documentElement, { attributes: true, attributeFilter: ["spacestoolbar"] });
      ruhen();
      const columnMo = new w.MutationObserver(follow);
      columnMo.observe(bar, { attributes: true, attributeFilter: ["hidden"] });
      // (Einblenden ändert hidden nicht mehr – die ruhende Leiste trägt es nicht; Thunderbird setzt dann nur das
      // Attribut spacestoolbar am Wurzelelement)
      columnMo.observe(d.documentElement, { attributes: true, attributeFilter: ["spacestoolbar"] });
      bar.__mcColumnMo = columnMo;
      this.restorers.push(() => {
        columnMo.disconnect();
        delete bar.__mcColumnMo;
        ruhMo.disconnect();
        delete w.__mcSpacesRuhen;
        bar.removeAttribute("mc-ruht");
        if (w.gSpacesToolbar?.isHidden && !bar.hasAttribute("mc-float")) {
          bar.hidden = true;
        }
      });
      // „Anpassen…“ der Bereiche-Leiste ausblenden: Thunderbirds Panel hängt am
      // ausgeblendeten Knopf #collapseButton – es öffnet nicht und sperrt danach
      // das Ein-/Ausblenden der Leiste (isCustomizing bleibt gesetzt); die
      // Farben gibt ohnehin halo.spaces vor
      const custItems = ["spacesToolbarContextCustomize", "settingsContextOpenCustomizeItem"]
        .map(id => d.getElementById(id)).filter(Boolean);
      const custSep = d.getElementById("settingsContextOpenCustomizeItem")?.previousElementSibling;
      const custHide = [...custItems, ...(custSep?.localName == "menuseparator" ? [custSep] : [])];
      custHide.forEach(el => (el.hidden = true));
      // das Kontextmenü der leeren Leiste hat dann keinen Eintrag mehr – nicht
      // als leere Fläche öffnen
      const spacesMenu = d.getElementById("spacesToolbarContextMenu");
      const noEmpty = e => {
        if (e.target == spacesMenu && ![...spacesMenu.children].some(c => !c.hidden)) {
          e.preventDefault();
        }
      };
      spacesMenu?.addEventListener("popupshowing", noEmpty);
      // Kacheln ohne Kontextmenü: Rechtsklick auf eine Kachel der
      // Bereiche-Leiste öffnet kein Menü (Mail, Kalender, …, Einstellungen);
      // Thunderbird öffnet es selbst im contextmenu-Listener jeder Kachel,
      // darum das Ereignis schon beim Durchlauf durch die Leiste anhalten
      const noTileMenu = e => {
        if (e.target.closest?.("#spacesToolbar button, #spacesToolbar .spaces-toolbar-button")) {
          e.preventDefault();
          e.stopPropagation();
        }
      };
      bar.addEventListener("contextmenu", noTileMenu, true);
      this.restorers.push(() => {
        custHide.forEach(el => (el.hidden = false));
        spacesMenu?.removeEventListener("popupshowing", noEmpty);
        bar.removeEventListener("contextmenu", noTileMenu, true);
      });
      // Tooltips der Bereiche nur mit Namen („Mail“ statt „Mail (⌃ 1)“):
      // Thunderbird setzt sie per Fluent aus Titel und Kurzbefehl, auch
      // später noch (Übersetzung läuft verzögert) – also jedes Mal den
      // Titel aus den Fluent-Argumenten übernehmen
      const plainTitle = space => {
        if (space.id == "chatButton" && ["addon", "web"].includes(w.document.documentElement.getAttribute("mc-fifth"))) {
          return; // fünfter Bereich: Titel der Erweiterung bzw. Webseite
        }
        let name;
        try {
          name = JSON.parse(space.getAttribute("data-l10n-args") || "{}").title;
        } catch {} // gewollt: Titel nicht lesbar, Name bleibt wie er ist
        if (name && space.title != name) {
          space.title = name;
        }
      };
      // (alle Knöpfe beobachten – beim ersten Aufruf fehlen die Argumente evtl. noch)
      const spaces = [...bar.querySelectorAll("#mailButton, #addressBookButton, #calendarButton, #tasksButton, #chatButton")];
      spaces.forEach(plainTitle);
      const tipMo = new w.MutationObserver(records => records.forEach(r => plainTitle(r.target)));
      spaces.forEach(space => tipMo.observe(space, { attributes: true, attributeFilter: ["title", "data-l10n-args"] }));
      this.restorers.push(() => {
        tipMo.disconnect();
        spaces.forEach(space => w.document.l10n?.translateElements([space]));
      });
    };

    // Seitenleiste wie Dia 3/4: Ist die Seitenleiste ausgeblendet, schwebt sie
    // beim Zeigen an den linken Fensterrand über dem Inhalt ein – nichts
    // verschiebt sich, nichts wird gespeichert („schwebt“ ist flüchtig).
    // Werte an Dia gemessen (9.11.2026, Bildschirm 1×): Auslösestreifen 4 px am
    // Fensterrand, kaum Verzögerung, Einblenden ~120 ms von links, Ausblenden
    // ~80 ms, sobald der Zeiger mehr als ~64 px rechts der Leiste steht (bis
    // dahin bleibt sie); Abstand 3 px zum Fensterrand, Radius 10 px, zarter
    // Schatten (userChrome.css, --mt-float-*). Die Leiste besteht aus der
    // Bereiche-Leiste im Hauptfenster (Flächen über/unter der linken Leiste als
    // ::after/::before) und der linken Leiste des Bereichs in ihrem Dokument
    // (Klasse mc-float-pane). Offene Menüs und Ziehen halten sie offen, eine
    // an den Rand gezogene Mail öffnet sie bis zum Ablegen; Esc und Klick
    // daneben schließen sie.
    const FLOAT_HOT = 4;
    const FLOAT_KEEP = 64;
    // erst nach kurzem Verweilen am Rand (wie das Dock von macOS): Vorbeistreifen,
    // Größenändern und ein Zeiger, der nur kurz an den Rand stößt, lösen nicht
    // aus (vorher 50 ms – die Leiste kam oft ungewollt)
    const FLOAT_DELAY = 400;
    const FLOAT_IN = 120;
    const FLOAT_OUT = 80;
    const FLOAT_INSET = 3;
    const FLOAT_SPACES = 89; // Bereiche-Leiste samt Linie
    const FLOAT_VARS = ["--mc-float-left", "--mc-float-top", "--mc-float-h", "--mc-float-w", "--mc-float-rt",
      "--mc-float-rb", "--mc-float-ct", "--mc-float-cb"];
    let float = null;
    let floatTimer = null;
    const floatPaneHidden = (tab, el) => (tab?.mode?.name == "mail3PaneTab"
      ? el.classList.contains("collapsed-by-splitter") : el.classList.contains("mc-side-hidden"));
    const floatCleanup = () => {
      const f = float;
      float = null;
      if (!f) {
        return;
      }
      f.anims.forEach(a => {
        try {
          a.cancel();
        } catch {} // gewollt: Dokument schon weg
      });
      f.off.forEach(fn => fn());
      f.catcher.remove();
      // Bereiche-Leiste wieder ausblenden – nur, wenn die Seitenleiste noch
      // ausgeblendet ist (sonst hat sie der Knopf inzwischen eingeblendet)
      if (w.gSpacesToolbar?.isHidden) {
        f.bar.hidden = true;
      }
      f.bar.removeAttribute("mc-float");
      ["--mc-float-w", "--mc-float-top", "--mc-float-bottom"].forEach(p => f.bar.style.removeProperty(p));
      if (f.el) {
        f.el.classList.remove("mc-float-pane");
        FLOAT_VARS.forEach(p => f.el.style.removeProperty(p));
      }
      w.__mcSideFloat = false;
    };
    const floatAnimate = show => {
      const f = float;
      const token = ++f.token;
      const running = f.anims.length && f.anims.every(a => a.playState == "running");
      if (running) {
        // mitten in der Bewegung: an der aktuellen Stelle umkehren
        f.anims.forEach(a => a.reverse());
      } else {
        f.anims.forEach(a => a.cancel());
        const kf = [{ translate: `-${f.right + 30}px 0` }, { translate: "0 0" }];
        const opts = {
          duration: motionMs(show ? FLOAT_IN : FLOAT_OUT),
          easing: show ? "cubic-bezier(0.25, 0.1, 0.25, 1)" : "cubic-bezier(0.42, 0, 1, 1)",
          direction: show ? "normal" : "reverse",
          fill: "both",
        };
        f.anims = [f.bar, f.el].filter(Boolean).map(e => e.animate(kf, opts));
      }
      f.state = show ? "in" : "out";
      f.anims[0].finished.then(() => {
        if (float != f || f.token != token) {
          return;
        }
        if (show) {
          f.state = "on";
        } else {
          floatCleanup();
        }
      }, () => {});
    };
    const floatEnd = (animate = true) => {
      w.clearTimeout(floatTimer);
      if (!float) {
        return;
      }
      if (animate && float.state != "out") {
        floatAnimate(false);
      } else if (!animate) {
        floatCleanup();
      }
    };
    const floatPopups = () => float?.popups.size > 0;
    const floatShow = (drag = false) => {
      w.clearTimeout(floatTimer);
      if (float) {
        float.drag ||= drag;
        if (float.state == "out") {
          floatAnimate(true);
        }
        float.catcher.style.pointerEvents = float.drag ? "none" : "";
        return;
      }
      const d = w.document;
      const bar = d.getElementById("spacesToolbar");
      const tabmail = d.getElementById("tabmail");
      if (!bar || !w.gSpacesToolbar || !columnHidden() || columnBusy() || w.__mcSideDrag) {
        return;
      }
      const tab = tabmail?.currentTabInfo;
      let [el, , win] = sidebarFor(tab);
      if (!el || !win || el.__mcAnimating || win.__mcAnimating || !floatPaneHidden(tab, el)) {
        el = null;
      }
      const H = w.innerHeight;
      const I = FLOAT_INSET;
      let W = 0, topH = 0, bottomH = 0;
      if (el) {
        const off = el.ownerDocument == d ? { left: 0, top: 0 } : win.browsingContext.embedderElement.getBoundingClientRect();
        const pr = el.parentNode.getBoundingClientRect();
        W = tab.mode.name == "preferencesTab" ? 240 : Math.min(sideMax(el), Services.prefs.getIntPref(WIDTH_PREF, 0) || 206);
        const top = Math.max(pr.top, I - off.top);
        const bottom = Math.min(pr.bottom, H - I - off.top);
        if (bottom - top < 50) {
          el = null;
          W = 0;
        } else {
          topH = Math.max(0, Math.round(off.top + top - I));
          bottomH = Math.max(0, Math.round(H - I - (off.top + bottom)));
          const R = "var(--mt-float-radius)";
          const vals = {
            "--mc-float-left": `${Math.round(I + FLOAT_SPACES - off.left)}px`,
            "--mc-float-top": `${Math.round(top)}px`,
            "--mc-float-h": `${Math.round(bottom - top)}px`,
            "--mc-float-w": `${W}px`,
            "--mc-float-rt": topH ? "0px" : R,
            "--mc-float-rb": bottomH ? "0px" : R,
            "--mc-float-ct": topH ? "0px" : "-40px",
            "--mc-float-cb": bottomH ? "0px" : "-40px",
          };
          for (const [k, v] of Object.entries(vals)) {
            el.style.setProperty(k, v);
          }
          el.classList.add("mc-float-pane");
        }
      }
      bar.style.setProperty("--mc-float-w", `${W}px`);
      bar.style.setProperty("--mc-float-top", `${topH}px`);
      bar.style.setProperty("--mc-float-bottom", `${bottomH}px`);
      w.__mcSideFloat = true;
      bar.setAttribute("mc-float", "true");
      bar.hidden = false;
      const right = I + FLOAT_SPACES + W;
      // Fläche rechts der Leiste: Zeiger weiter als FLOAT_KEEP weg oder Klick → weg
      const catcher = d.createElementNS("http://www.w3.org/1999/xhtml", "div");
      catcher.id = "mcSideCatch";
      catcher.setAttribute("aria-hidden", "true");
      catcher.style.cssText = `position: fixed; z-index: 29; left: ${right}px; top: 0; right: 0; bottom: 0;`;
      d.documentElement.append(catcher);
      float = { state: "in", el, win, bar, tab, right, catcher, drag, anims: [], token: 0, off: [], popups: new Set() };
      const f = float;
      // Einstellungen mit eingebetteter Seite (Add-ons, Kontoeinstellungen):
      // deren Browser liegt im Hauptfenster über dem Einstellungs-Dokument und
      // verdeckte die schwebende Kategorienliste darin (GitHub #64) – solange
      // sie schwebt, gibt die Seite links den Streifen samt Schatten frei
      if (el && tab.mode.name == "preferencesTab") {
        for (const page of tab.browser?.parentNode?.querySelectorAll(":scope > .mc-embed-page:not([hidden])") || []) {
          const cut = Math.round(right + 30 - page.getBoundingClientRect().left);
          if (cut > 0) {
            page.style.setProperty("clip-path", `inset(0 0 0 ${cut}px)`, "important");
            f.off.push(() => page.style.removeProperty("clip-path"));
          }
        }
      }
      catcher.style.pointerEvents = drag ? "none" : "";
      catcher.addEventListener("mousemove", e => {
        if (float == f && !f.drag && !floatPopups() && e.clientX > f.right + FLOAT_KEEP) {
          floatEnd();
        }
      });
      catcher.addEventListener("mousedown", e => {
        if (float != f || floatPopups()) {
          return;
        }
        e.preventDefault();
        e.stopPropagation();
        floatEnd();
      });
      // offene Menüs (Kontextmenü der Ordnerliste …) halten die Leiste offen
      const onPopup = e => {
        const t = e.target;
        if (t?.localName == "tooltip" || e.originalTarget != t) {
          return;
        }
        if (e.type == "popupshown") {
          f.popups.add(t);
        } else {
          f.popups.delete(t);
        }
      };
      const onKey = e => {
        if (e.key == "Escape" && !floatPopups()) {
          e.preventDefault();
          e.stopPropagation();
          floatEnd();
        }
      };
      // abgelegt bzw. Ziehen beendet: die Leiste gleitet wieder weg
      const onDrop = () => {
        if (f.drag) {
          floatEnd();
        }
      };
      // (nur echte Größenänderung – ein verspätetes „resize“ ohne Änderung nicht)
      const size = `${w.innerWidth}x${w.innerHeight}`;
      const onResize = () => {
        if (`${w.innerWidth}x${w.innerHeight}` != size) {
          floatEnd(false);
        }
      };
      const onTab = () => floatEnd(false);
      for (const target of new Set([w, win].filter(Boolean))) {
        target.addEventListener("popupshown", onPopup, true);
        target.addEventListener("popuphidden", onPopup, true);
        target.addEventListener("keydown", onKey, true);
        target.addEventListener("drop", onDrop, true);
        target.addEventListener("dragend", onDrop, true);
        f.off.push(() => {
          for (const [type, fn] of [["popupshown", onPopup], ["popuphidden", onPopup], ["keydown", onKey], ["drop", onDrop], ["dragend", onDrop]]) {
            target.removeEventListener(type, fn, true);
          }
        });
      }
      w.addEventListener("resize", onResize);
      tabmail.tabContainer?.addEventListener("TabSelect", onTab);
      f.off.push(() => {
        w.removeEventListener("resize", onResize);
        tabmail.tabContainer?.removeEventListener("TabSelect", onTab);
      });
      floatAnimate(true);
    };
    // Auslösestreifen am linken Fensterrand (über allen Inhalten); Drücken
    // darin zieht die Leiste wie bisher an der Greifzone heraus
    const floatHot = () => {
      const d = w.document;
      let hot = d.getElementById("mcSideHot");
      if (hot?.__mcOwner === HOOK_OWNER) {
        return hot;
      }
      hot?.remove(); // von einer älteren Fassung
      hot = d.createElementNS("http://www.w3.org/1999/xhtml", "div");
      hot.id = "mcSideHot";
      hot.__mcOwner = HOOK_OWNER;
      hot.setAttribute("aria-hidden", "true");
      hot.style.cssText = `position: fixed; z-index: 31; left: 0; top: 0; bottom: 0; width: ${FLOAT_HOT}px; display: none;`;
      let armed = false;
      const disarm = () => {
        w.clearTimeout(floatTimer);
        armed = false;
      };
      const arm = () => {
        disarm();
        if (!float || float.state == "out") {
          armed = true;
          floatTimer = w.setTimeout(() => {
            armed = false;
            floatShow();
          }, FLOAT_DELAY);
        }
      };
      // Zeiger vor Ablauf wieder im Fenster rechts des Streifens: nicht einblenden
      const onMove = e => {
        if (armed && e.screenX - w.mozInnerScreenX >= FLOAT_HOT) {
          disarm();
        }
      };
      w.addEventListener("mousemove", onMove, true);
      // macOS meldet die innersten Pixel am Fensterrand (dort beginnt das
      // Größenändern des Fensters) nicht als Bewegung, sondern als Verlassen
      // des Fensters: Zeiger links hinaus zählt wie Ankommen im Streifen –
      // sonst löst nur ein Treffer genau auf x = 3 aus. Lage über die
      // Bildschirmkoordinaten: das Verlassen eines eingebetteten Dokuments
      // (Mailliste, Mail im Lesebereich) kommt hier auch ohne relatedTarget
      // an, mit clientX in dessen Koordinaten (links der Mail negativ)
      const outLeft = e => {
        const x = e.screenX - w.mozInnerScreenX;
        const y = e.screenY - w.mozInnerScreenY;
        return !e.relatedTarget && x < FLOAT_HOT && y >= 0 && y < w.innerHeight;
      };
      hot.addEventListener("mouseenter", arm);
      hot.addEventListener("mouseleave", e => {
        if (!float && !outLeft(e)) {
          disarm();
        }
      });
      const onOut = e => {
        if (outLeft(e) && hot.style.display != "none") {
          arm();
        }
      };
      w.addEventListener("mouseout", onOut, true);
      // eine Mail an den Rand gezogen: sofort öffnen, offen bis zum Ablegen
      hot.addEventListener("dragenter", () => floatShow(true));
      hot.addEventListener("pointerdown", event => {
        if (event.button != 0) {
          return;
        }
        floatEnd(false);
        startSideDrag(event);
      });
      d.documentElement.append(hot);
      this.restorers.push(() => {
        w.removeEventListener("mouseout", onOut, true);
        w.removeEventListener("mousemove", onMove, true);
        disarm();
        floatEnd(false);
        hot.remove();
      });
      return hot;
    };
    const hookSideFloat = () => {
      floatHot();
      if (sideFloat.place) {
        sideFloat.place();
        return;
      }
      sideFloat.end = floatEnd;
      sideFloat.place = () => {
        const hot = w.document.getElementById("mcSideHot");
        const on = columnHidden() && !columnBusy() && !w.__mcSideDrag;
        if (hot) {
          hot.style.display = on ? "block" : "none";
        }
        if (float && (!columnHidden() || float.tab != w.document.getElementById("tabmail")?.currentTabInfo)) {
          floatEnd(false);
        }
      };
      sideFloat.place();
      // für die Prüfungen
      w.__mcSideFloatState = () => float?.state || "off";
      this.restorers.push(() => {
        delete sideFloat.end;
        delete sideFloat.place;
        delete w.__mcSideFloatState;
      });
    };

    // Lichtschein und gefärbte Trennlinie in der Spacefarbe (Maintainer 13.11.2026, Schein „C geneigt“,
    // Reichweite 1, leise; Linie nur auf Kachelhöhe): Höhe der aktiven Kachel, Neigung zur Mitte der
    // Kachelspalte und Farbe der Kachel für die Seitenleiste des Bereichs und die Linie rechts der
    // Bereiche-Leiste (Attribut mc-glow, Werte in userChrome.css). Einstellungen (14.11.2026, „ja mehrfarb hauch
    // passt“): statt der grauen Kachelfarbe ein leiser Hauch aus allen Space-Farben (mc-glow="hauch"). Webseite,
    // Erweiterung und Tabs ohne Seitenleiste: kein Schein, Linie neutral
    const GLOW_MODES = new Set(["mail3PaneTab", "calendar", "tasks", "chat", "addressBookTab", "preferencesTab"]);
    const GLOW_HAUCH = new Set(["preferencesTab"]);
    // Kachel je Bereich: beim Wechsel meldet Thunderbird den neuen Tab, bevor die Kachel „current“ wird – bis
    // beide zusammenpassen, bleibt der Schein stehen (sonst kurz Farbe und Höhe der vorigen Kachel im neuen Bereich)
    const GLOW_TILE = { mail3PaneTab: "mailButton", calendar: "calendarButton", tasks: "tasksButton", chat: "chatButton",
      addressBookTab: "addressBookButton", preferencesTab: "settingsButton" };
    const GLOW_TILT = 30; // px je Kachel Abstand zur mittleren Kachel (Vorschau sidebar-c5)
    const GLOW_VARS = ["--mt-glow-y", "--mt-glow-tilt", "--mt-glow-c", "--mt-glow-top", "--mt-glow-bottom", "--mt-glow-w", "--mt-glow-h",
      "--mt-glow-paint", "--mt-glow-line-img", "--mt-glow-c-oben", "--mt-glow-c-unten"];
    // Hauch: Space-Farben von oben nach unten über ±160 px um die Mitte des Kegels (Vorschau
    // lichtschein-einstellungen, Runde 2); die Linie in denselben Farben, zur Mitte am kräftigsten, ab ±219 px neutral
    const glowHauch = colors => {
      const n = colors.length;
      const at = i => (n > 1 ? Math.round(-160 + (320 * i) / (n - 1)) : 0);
      // Farbe des Verlaufs an einer Stelle (px ab der Mitte des Kegels), für die Flächen der schwebenden Leiste
      const cx = w.document.createElementNS("http://www.w3.org/1999/xhtml", "canvas").getContext("2d");
      const rgb = colors.map(c => {
        cx.fillStyle = "#000";
        cx.fillStyle = c;
        const h = /^#[0-9a-f]{6}$/i.test(cx.fillStyle) ? cx.fillStyle : "#8e8e93";
        return [1, 3, 5].map(k => parseInt(h.slice(k, k + 2), 16));
      });
      const colorAt = pos => {
        let i = 0;
        while (i < n - 1 && at(i + 1) < pos) {
          i++;
        }
        const t = n > 1 ? Math.min(1, Math.max(0, (pos - at(i)) / (at(i + 1) - at(i) || 1))) : 0;
        const [a, b] = [rgb[i], rgb[Math.min(n - 1, i + 1)]];
        return `rgb(${a.map((v, k) => Math.round(v + (b[k] - v) * t)).join(", ")})`;
      };
      // (Stellen auf die Fläche begrenzt: Farbstellen jenseits ihres Endes verschiebt die Darstellung sonst um bis zu
      // 100 px nach unten, gemessen in den Einstellungen mit der Kachel unten)
      const pos = v => `clamp(0px, calc(${v}), 100%)`;
      const paint = `linear-gradient(to bottom, ${colors.map((c, i) => `${c} ${pos(`var(--mt-glow-y) + var(--mt-glow-tilt) + ${at(i)}px`)}`).join(", ")})`;
      const line = colors.map((c, i) => {
        const k = n > 1 ? +(1 - 0.55 * Math.abs(-1 + (2 * i) / (n - 1))).toFixed(3) : 1;
        return `color-mix(in srgb, ${c} calc(var(--mt-glow-line) * ${k}), var(--mt-sidebar)) ${pos(`var(--mt-glow-y) + ${at(i)}px`)}`;
      });
      return {
        colorAt,
        "--mt-glow-paint": n > 1 ? paint : `linear-gradient(${colors[0]}, ${colors[0]})`,
        "--mt-glow-line-img": `linear-gradient(to bottom, var(--mt-sidebar-border) 0, var(--mt-sidebar-border) ${pos("var(--mt-glow-y) - 219px")}, ${line.join(", ")}, var(--mt-sidebar-border) ${pos("var(--mt-glow-y) + 219px")}, var(--mt-sidebar-border) 100%)`,
      };
    };
    let glowEl = null;
    let glowRo = null;
    let glowFrame = 0;
    let glowWait = 0;
    let glowTries = 0;
    // (keep: nur das Attribut abnehmen, die Variablen bleiben stehen – sie wirken nur mit mc-glow, und beim
    // nächsten Besuch des Bereichs muss so nichts neu ins style-Attribut geschrieben werden, das sonst bei jedem
    // Wechsel das Nachmessen der Seitenleiste und der Toolbar anstößt)
    const glowSet = (el, vals, kind = "true", keep = false) => {
      if (!el) {
        return;
      }
      try {
        if (vals) {
          for (const [k, v] of Object.entries(vals)) {
            if (el.style.getPropertyValue(k) != v) {
              el.style.setProperty(k, v);
            }
          }
          if (el.getAttribute("mc-glow") != kind) {
            el.setAttribute("mc-glow", kind);
          }
        } else {
          el.removeAttribute("mc-glow");
          if (!keep) {
            GLOW_VARS.forEach(p => el.style.removeProperty(p));
          }
        }
      } catch {} // gewollt: Dokument des Bereichs schon geschlossen
    };
    const updateGlow = () => {
      const d = w.document;
      const bar = d.getElementById("spacesToolbar");
      if (!bar) {
        return;
      }
      const tab = d.getElementById("tabmail")?.currentTabInfo;
      const mode = tab?.mode?.name;
      const tiles = [...bar.querySelectorAll(".spaces-toolbar-button")].filter(b => b.getBoundingClientRect().height > 0);
      const tile = tiles.find(b => b.classList.contains("current"));
      // Schalter „Lichtschein in der Seitenleiste“ aus: kein Schein, Linie neutral (Kacheln unverändert)
      const glowOn = Services.prefs.getBoolPref(GLOW_PREF, true);
      let [el, , win] = glowOn && GLOW_MODES.has(mode) ? sidebarFor(tab) : [];
      w.clearTimeout(glowWait);
      if (tile && (!el || !win) && glowOn && GLOW_MODES.has(mode) && tile.id == GLOW_TILE[mode] && glowTries < 30) {
        // Seitenleiste noch nicht aufgebaut (Einstellungen beim ersten Öffnen: die Kachel ist „current“, bevor
        // about:preferences die Kategorienliste hat, gemessen 33 gegen 99 ms): kurz darauf erneut, statt auf ein
        // zufälliges späteres Ereignis zu warten (unter Linux mit der Beta blieb der Hauch sonst ganz aus)
        glowTries++;
        glowWait = w.setTimeout(glowSoon, 100);
      } else {
        glowTries = 0;
      }
      if (!tile || !el || !win) {
        el = null;
      } else if (GLOW_TILE[mode] && tile.id != GLOW_TILE[mode]) {
        return; // (Wechsel noch nicht fertig, die Klasse der Kachel meldet sich gleich)
      }
      if (glowEl != el) {
        glowSet(glowEl, null, "true", true);
        if (glowEl && !el) {
          // (beim Verlassen aller Bereiche mit Schein, z. B. Webseite oder Schalter aus, ganz aufräumen)
          glowSet(glowEl, null);
        }
        // Breite der Seitenleiste (Ziehen am Teiler, Ein-/Ausblenden) für die Flächen der Bereiche-Leiste
        try {
          glowRo?.disconnect();
        } catch {} // gewollt: Dokument des Bereichs schon geschlossen
        glowRo = el ? new win.ResizeObserver(glowResized) : null;
        glowRo?.observe(el);
      }
      glowEl = el;
      if (!el) {
        glowSet(bar, null);
        return;
      }
      const r = tile.getBoundingClientRect();
      const y = r.top + r.height / 2;
      const i = tiles.indexOf(tile);
      const kind = GLOW_HAUCH.has(mode) ? "hauch" : "true";
      const tileColor = b => w.getComputedStyle(b).getPropertyValue("--c").trim();
      const common = {
        "--mt-glow-tilt": `${Math.round(((tiles.length - 1) / 2 - i) * GLOW_TILT)}px`,
        "--mt-glow-c": tileColor(tile) || "#8E8E93",
      };
      const offTop = el.ownerDocument == d ? 0 : win.browsingContext?.embedderElement?.getBoundingClientRect().top || 0;
      const er = el.getBoundingClientRect();
      const br = bar.getBoundingClientRect();
      const top = Math.max(0, Math.round(offTop + er.top - br.top));
      const bottom = Math.max(0, Math.round(br.bottom - offTop - er.bottom));
      const extra = {};
      if (kind == "hauch") {
        const colors = tiles.filter(b => b != tile && b.id != "settingsButton").map(tileColor).filter(Boolean);
        const { colorAt, ...vals } = glowHauch(colors.length ? colors : [common["--mt-glow-c"]]);
        Object.assign(common, vals);
        // (Mitte der Flächen über und unter der Seitenleiste, gemessen ab der Mitte des Kegels)
        const mid = y - br.top + parseInt(common["--mt-glow-tilt"]);
        extra["--mt-glow-c-oben"] = colorAt(top / 2 - mid);
        extra["--mt-glow-c-unten"] = colorAt(br.height - bottom / 2 - mid);
      }
      // (Bereiche-Leiste: Flächen über und unter der Seitenleiste, in denen der Schein weiterläuft)
      glowSet(bar, {
        ...common,
        ...extra,
        "--mt-glow-y": `${Math.round(y - br.top)}px`,
        "--mt-glow-h": `${Math.round(br.height)}px`,
        "--mt-glow-w": `${Math.round(er.width)}px`,
        "--mt-glow-top": `${top}px`,
        "--mt-glow-bottom": `${bottom}px`,
      }, kind);
      glowSet(el, { ...common, "--mt-glow-y": `${Math.round(y - offTop - er.top)}px` }, kind);
    };
    // Größe der Seitenleiste geändert: während des Ein-/Ausblendens nur die Breite der Flächen nachführen, direkt aus
    // der Messung des ResizeObservers – die volle Aktualisierung misst Kacheln und Seitenleiste in zwei Dokumenten
    // nach (erzwungenes Layout in jedem Bild; unter Windows ging dabei beim Ausblenden ein Bild verloren); am Ende der
    // Bewegung rechnet sie wieder alles (sideEdgeUpdaters)
    const glowResized = entries => {
      const bar = w.document.getElementById("spacesToolbar");
      if ((w.__mcSpacesAnimating || glowEl?.__mcAnimating) && glowEl && bar?.hasAttribute("mc-glow")) {
        const e = entries[entries.length - 1];
        const v = `${Math.round(e.borderBoxSize?.[0]?.inlineSize ?? e.contentRect.width)}px`;
        if (bar.style.getPropertyValue("--mt-glow-w") != v) {
          bar.style.setProperty("--mt-glow-w", v);
        }
        return;
      }
      glowSoon();
    };
    const glowSoon = () => {
      if (!glowFrame) {
        glowFrame = w.requestAnimationFrame(() => {
          glowFrame = 0;
          updateGlow();
        });
      }
    };
    const hookGlow = () => {
      const bar = w.document.getElementById("spacesToolbar");
      if (bar && !bar.__mcGlowMo) {
        // Kachelwechsel, Umsortieren, fünfter Bereich ein/aus, Größe des Fensters
        const mo = new w.MutationObserver(glowSoon);
        mo.observe(bar, { subtree: true, childList: true, attributes: true, attributeFilter: ["class", "hidden", "mc-fifth-hidden", "mc-float"] });
        bar.__mcGlowMo = mo;
        w.addEventListener("resize", glowSoon);
        Services.prefs.addObserver(GLOW_PREF, glowSoon);
        this.sideEdgeUpdaters ??= new Set();
        this.sideEdgeUpdaters.add(glowSoon);
        this.restorers.push(() => {
          mo.disconnect();
          Services.prefs.removeObserver(GLOW_PREF, glowSoon);
          this.sideEdgeUpdaters?.delete(glowSoon);
          delete bar.__mcGlowMo;
          w.removeEventListener("resize", glowSoon);
          w.cancelAnimationFrame(glowFrame);
          glowFrame = 0;
          w.clearTimeout(glowWait);
          try {
            glowRo?.disconnect();
          } catch {} // gewollt: Dokument des Bereichs schon geschlossen
          glowRo = null;
          glowSet(glowEl, null);
          glowSet(bar, null);
          glowEl = null;
        });
      }
      updateGlow();
    };

    // Today-Pane ein-/ausblenden: Knopf unten rechts (Gegenstück zum
    // Bereiche-Knopf unten links) statt des ✕ oben in der Today-Pane

    const hookTodayToggle = () => {
      const d = w.document;
      const panel = d.getElementById("today-pane-panel");
      const command = d.getElementById("calendar_toggle_todaypane_command");
      if (!command || d.getElementById("mcTodayToggle")?.__mcOwner === HOOK_OWNER) {
        return;
      }
      // Einfügungen einer älteren Fassung (Update oder Neustart der Erweiterung,
      // deren Aufräumen nicht lief) ersetzen statt eine zweite Überschrift
      // mit zweiter Sonne daneben zu setzen
      for (const id of ["mcTodayToggle", "mcTodayTop", "mcTodayTitle", "mcTodayNew", "mcTodayFoot", "mcTodayGrip"]) {
        for (const el of d.querySelectorAll("#" + id)) {
          el.remove();
        }
      }
      const btn = d.createElementNS("http://www.w3.org/1999/xhtml", "button");
      btn.id = "mcTodayToggle";
      btn.__mcOwner = HOOK_OWNER;
      btn.type = "button";
      // Tageszahl im Kalender-Symbol: übernommen von Thunderbirds Knopf in der
      // Statusleiste (dessen Kalender-Code aktualisiert sie um Mitternacht);
      // fehlt der, selbst aus dem heutigen Datum
      const day = d.createElementNS("http://www.w3.org/1999/xhtml", "span");
      day.className = "mc-today-day";
      day.setAttribute("aria-hidden", "true");
      btn.append(day);
      const source = () => d.querySelector("#calendar-status-todaypane-button .toolbarbutton-day-text");
      const setDay = () => {
        const tb = source();
        day.textContent = tb?.value || tb?.textContent || String(new Date().getDate());
      };
      setDay();
      const tbDay = source();
      const dayMo = tbDay ? new w.MutationObserver(setDay) : null;
      dayMo?.observe(tbDay, { attributes: true, childList: true, characterData: true, subtree: true });
      const dayTimer = tbDay ? null : w.setInterval(setDay, 60 * 1000);
      this.restorers.push(() => {
        dayMo?.disconnect();
        dayTimer && w.clearInterval(dayTimer);
      });
      const updateTip = () => {
        const shown = !!w.TodayPane?.isVisible;
        const label = shown
          ? (tr("Hide Today Pane"))
          : (tr("Show Today Pane"));
        btn.title = label;
        btn.setAttribute("aria-label", label);
        btn.toggleAttribute("data-shown", shown);
      };
      updateTip();
      btn.addEventListener("mouseenter", updateTip);
      btn.addEventListener("click", () => this.animateTodayPane(w, command, updateTip, true));
      const mo = panel ? new w.MutationObserver(() => {
        updateTip();
        w.__mcTodayTopSync?.();
        placeTodayGrip?.();
      }) : null;
      // (current: Bereich gewechselt)
      mo?.observe(panel, { attributes: true, attributeFilter: ["collapsed", "hidden", "collapsedinmodes", "current"] });
      let placeTodayGrip = null;
      // Breite der Today-Pane fest (CSS). Ziehen an der Trennlinie wie bei den
      // Seitenleisten (dragPane, gespiegelt): 12 px nach rechts blendet sie
      // sofort aus, ohne Animation, das „+“ gleich mit; im selben Zug zurück
      // nach links ist sie wieder da. Ausgeblendet bleibt am rechten Rand eine
      // schmale Greifzone (#mcTodayGrip), an der man sie wieder herauszieht
      const TODAY_SNAP = 12;
      const todaySplitter = d.getElementById("today-splitter");
      const row0 = d.getElementById("unifiedToolbarContainer");
      const grip = d.createElementNS("http://www.w3.org/1999/xhtml", "div");
      grip.id = "mcTodayGrip";
      grip.setAttribute("aria-hidden", "true");
      grip.style.cssText = "position: fixed; z-index: 10; width: 5px; cursor: w-resize; display: none;";
      d.documentElement.append(grip);
      // Greifzone nur, wo die Today-Pane erscheinen kann (Kalender aktiv, Bereich mit Today-Pane)
      const placeGrip = () => {
        const modes = (panel?.getAttribute("mode") || "").split(",");
        const box = d.getElementById("tabmail-container")?.getBoundingClientRect();
        const show = panel && !w.TodayPane?.isVisible && !d.documentElement.hasAttribute("calendar-deactivated") &&
          modes.includes(w.gCurrentMode) && box?.height;
        grip.style.display = show ? "block" : "none";
        if (show) {
          grip.style.left = `${Math.round(box.right - 5)}px`;
          grip.style.top = `${Math.round(box.top)}px`;
          grip.style.height = `${Math.round(box.height)}px`;
        }
      };
      const onTodayDown = event => {
        if (event.button != 0 || panel?.__mcAnimating) {
          return;
        }
        dragPane(event, {
          side: "right",
          hidden: () => !w.TodayPane?.isVisible,
          width: () => panel.getBoundingClientRect().width,
          threshold: (startHidden, startWidth) => (startHidden ? TODAY_SNAP : startWidth - TODAY_SNAP),
          setHidden: hidden => {
            if (hidden == !w.TodayPane?.isVisible) {
              return;
            }
            if (hidden) {
              row0?.removeAttribute("data-mc-tp-open");
            }
            command.doCommand();
            updateTip();
            w.__mcTodayTopSync?.();
            placeGrip();
          },
          done: () => {
            placeGrip();
            this.offsetUpdaters?.forEach(fn => fn());
          },
        });
      };
      for (const el of [todaySplitter, grip]) {
        el?.addEventListener("pointerdown", onTodayDown);
        el?.addEventListener("mousedown", blockNativeSplitter, true);
      }
      placeGrip();
      const gripMo = new w.MutationObserver(placeGrip);
      gripMo.observe(d.documentElement, { attributes: true, attributeFilter: ["calendar-deactivated", "mc-tab"] });
      // (Fenstergröße, Bereiche-Leiste)
      const gripRo = new w.ResizeObserver(placeGrip);
      const gripBox = d.getElementById("tabmail-container");
      gripBox && gripRo.observe(gripBox);
      this.restorers.push(() => {
        todaySplitter?.removeEventListener("pointerdown", onTodayDown);
        todaySplitter?.removeEventListener("mousedown", blockNativeSplitter, true);
        gripMo.disconnect();
        gripRo.disconnect();
        grip.remove();
      });
      placeTodayGrip = placeGrip;
      // in die Toolbar-Zeile; darüber reicht die Today-Pane bis ganz oben
      // (#mcTodayTop in ihrer Breite) – wie die Seitenleiste links. Oben steht
      // nur der Today-Knopf (unter Windows/Linux rechts die Fensterknöpfe)
      const row = d.getElementById("unifiedToolbarContainer");
      const top = d.createElementNS("http://www.w3.org/1999/xhtml", "div");
      top.id = "mcTodayTop";
      row?.prepend(top);
      // „Today“ mit Sonne bzw. Wetter mittig zwischen Mini-Kalender und
      // Terminliste (über der Karte); Klick springt zum heutigen Tag
      const title = d.createElementNS("http://www.w3.org/1999/xhtml", "span");
      title.id = "mcTodayTitle";
      // Text und Sonne/Wetter als eigene Elemente: jedes mit eigenem Tooltip
      const titleText = d.createElementNS("http://www.w3.org/1999/xhtml", "span");
      titleText.className = "mc-tt-text";
      titleText.textContent = tr("Today");
      const weatherIcon = d.createElementNS("http://www.w3.org/1999/xhtml", "span");
      weatherIcon.id = "mcTodayWeather";
      title.append(titleText, weatherIcon);
      const agendaList = d.getElementById("agenda");
      if (agendaList?.parentNode) {
        agendaList.before(title);
      } else {
        panel?.prepend(title);
      }
      // Wetter statt der festen Sonne (Option, Standard aus)
      Weather.attach(w, title);
      title.setAttribute("role", "button");
      title.tabIndex = 0;
      title.title = tr("Go to Today");
      const goToday = event => {
        if (event.type == "keydown" && event.key != "Enter" && event.key != " ") {
          return;
        }
        event.preventDefault();
        this.agendaToday(w);
      };
      title.addEventListener("click", goToday);
      title.addEventListener("keydown", goToday);
      (row || d.body).append(btn);
      // „+“ fest mittig am unteren Rand der Today-Pane in eigenem Streifen
      // (#mcTodayFoot): die Liste rollt darüber und läuft aus, das „+“ bewegt
      // sich nie – fragt nach Termin oder Aufgabe (Popover nach oben)
      const foot = d.createElementNS("http://www.w3.org/1999/xhtml", "div");
      foot.id = "mcTodayFoot";
      const plus = d.createElementNS("http://www.w3.org/1999/xhtml", "button");
      plus.id = "mcTodayNew";
      plus.type = "button";
      plus.title = tr("New Event") + " / " + tr("New Task");
      plus.setAttribute("aria-label", plus.title);
      plus.addEventListener("click", event => {
        event.stopPropagation();
        newPopup?.above(plus);
      });
      foot.append(plus);
      (panel || d.body).append(foot);
      this.restorers.push(() => {
        foot.remove();
        row?.removeAttribute("data-mc-tp-open");
        row?.removeAttribute("data-mc-tp-slide");
        row?.style.removeProperty("--mc-tp-full");
        row?.removeAttribute("data-mc-tp-none");
      });
      // Verlauf am Kartenboden nur, solange unten noch Termine verborgen sind
      const agenda = d.getElementById("agenda");
      if (agenda) {
        const fade = () => {
          if (panel?.__mcAnimating) {
            return; // nach der Animation misst sync() ohnehin neu
          }
          agenda.toggleAttribute("data-mc-more", agenda.scrollTop + agenda.clientHeight < agenda.scrollHeight - 2);
        };
        const fadeRo = new w.ResizeObserver(fade);
        const fadeMo = new w.MutationObserver(fade);
        agenda.addEventListener("scroll", fade, { passive: true });
        fadeRo.observe(agenda);
        fadeMo.observe(agenda, { childList: true });
        fade();
        this.restorers.push(() => {
          agenda.removeEventListener("scroll", fade);
          fadeRo.disconnect();
          fadeMo.disconnect();
          agenda.removeAttribute("data-mc-more");
        });
      }
      // Breite der Today-Pane (0, wenn aus) an die Toolbar-Zeile – Suchfeld,
      // Fläche und Knopf richten sich danach, auch während der Animation
      // während der Animation übergibt sie die Breite (animWidth) – dann nur
      // diese setzen, ohne Fensterknöpfe/Titel neu zu vermessen (das kostet
      // pro Bild zwei Layout-Durchläufe und ließ die Animation ruckeln)
      const sync = animWidth => {
        if (!row) {
          return;
        }
        if (typeof animWidth == "number") {
          setVar(row, "--mc-tp-w", `${Math.round(animWidth)}px`);
          row.toggleAttribute("data-mc-tp-none", Math.round(animWidth) <= 0);
          return;
        }
        if (panel?.__mcAnimating) {
          return; // Größen-Beobachter während der Animation: nichts vermessen
        }
        const width = panel && w.TodayPane?.isVisible ? Math.round(panel.getBoundingClientRect().width) : 0;
        const caption = captionWidth(d);
        setVar(row, "--mc-tp-w", `${width}px`);
        setVar(row, "--mc-tp-room", `${width}px`);
        row.toggleAttribute("data-mc-tp-open", width > 0);
        // ohne Today-Pane auch keine Fläche oben (ihr Innenabstand ließe
        // sonst rechts neben dem Knopf einen grauen Streifen stehen)
        row.toggleAttribute("data-mc-tp-none", width <= 0);
        setVar(row, "--mc-caption-w", `${caption}px`);
        const tail = rowTail(d);
        setVar(row, "--mc-row-tail", `${tail}px`);
      };
      w.__mcTodayTopSync = sync;
      const ro = panel ? new w.ResizeObserver(sync) : null;
      ro?.observe(panel);
      sync();
      this.restorers.push(() => {
        mo?.disconnect();
        ro?.disconnect();
        btn.remove();
        top.remove();
        title.remove();
        row?.style.removeProperty("--mc-tp-w");
        delete w.__mcTodayTopSync;
      });
    };

    // Markieren-Knopf der Symbolleiste als geteilter Stern-Knopf: ein Klick
    // auf den Stern (die ersten 40 px) setzt bzw. entfernt den Stern
    // („Starred“) der gewählten Mail(s) wie Apple Mails Markierung, der Pfeil
    // rechts öffnet weiter Thunderbirds Menü. Mit der Tastatur bleibt es beim
    // Menü. Der Knopf zeigt den Stern der gewählten Mail gefüllt (mc-starred)
    // und hebt beim Überfahren nur die Hälfte unter der Maus hervor (mc-hot)
    const STAR_PART = 40;
    const hookStarButton = () => {
      if (w.__mcStarHook === HOOK_OWNER) {
        return;
      }
      w.__mcStarHook = HOOK_OWNER;
      const markButton = target => target?.closest?.('#unifiedToolbarContent > li[item-id="mark-as"] button');
      const onStar = (btn, event) => {
        const r = btn.getBoundingClientRect();
        const x = w.getComputedStyle(btn).direction == "rtl" ? r.right - event.clientX : event.clientX - r.left;
        return x < STAR_PART;
      };
      const onClick = event => {
        const btn = markButton(event.target);
        if (!btn || btn.disabled || event.button != 0 || !event.detail || !onStar(btn, event)) {
          return;
        }
        event.preventDefault();
        event.stopPropagation();
        w.goDoCommand("cmd_markAsFlagged");
        this.updateStarButton(w);
      };
      const onMove = event => {
        const btn = markButton(event.target);
        const li = w.document.querySelector('#unifiedToolbarContent > li[item-id="mark-as"]');
        if (!li) {
          return;
        }
        if (!btn) {
          li.removeAttribute("mc-hot");
          return;
        }
        const part = onStar(btn, event) ? "star" : "menu";
        if (li.getAttribute("mc-hot") != part) {
          li.setAttribute("mc-hot", part);
        }
      };
      // Stern an anderer Stelle geändert (Mailliste, Taste S, Kontextmenü).
      // Ist die Liste nach Stern sortiert, ordnet Thunderbird die Mail erst
      // beim nächsten Aufbau ein – hier gleich neu sortieren (die Ansicht
      // behält dabei Auswahl und gewählte Mail)
      let resort = 0;
      const resortStarred = () => {
        resort = 0;
        for (const tab of w.gTabmail?.tabInfo || []) {
          const a3 = tab.mode?.name == "mail3PaneTab" ? tab.chromeBrowser?.contentWindow : null;
          const view = a3?.gDBView;
          try {
            if (view && view.sortType == Ci.nsMsgViewSortType.byFlagged) {
              // gleiche Sortierung noch einmal ist in Thunderbird wirkungslos –
              // kurz nach Datum, dann wieder nach Stern
              const order = view.sortOrder, column = a3.gViewWrapper.primarySortColumnId;
              view.sort(Ci.nsMsgViewSortType.byDate, order);
              a3.gViewWrapper.sort(column, order);
            }
          } catch (e) {
            log("resort starred", e);
          }
        }
      };
      const listener = {
        onFolderPropertyFlagChanged: (hdr, property, oldFlag, newFlag) => {
          if (property == "Flagged") {
            this.updateStarButton(w);
            resort ||= w.setTimeout(resortStarred, 0);
          }
        },
      };
      // Tabwechsel und neu geladene Mail (Nachrichten-Tab: Weiterblättern,
      // nächste Mail nach dem Löschen) – „MsgLoaded“ steigt aus about:message auf
      const refresh = event => {
        w.setTimeout(() => this.updateStarButton(w), 0);
        if (event?.type == "MsgLoaded") {
          fitWideMessage(event.target);
          fitShortMessage(event.target);
          decorateAttachments(event.target);
          decorateInvitation(event.target);
          decorateCode(event.target);
        }
      };
      const tabs = w.document.getElementById("tabmail")?.tabContainer;
      w.addEventListener("click", onClick, true);
      w.addEventListener("mousemove", onMove, true);
      w.addEventListener("MsgLoaded", refresh, true);
      tabs?.addEventListener("TabSelect", refresh);
      MailServices.mailSession.AddFolderListener(listener, Ci.nsIFolderListener.propertyFlagChanged);
      const remove = () => MailServices.mailSession.RemoveFolderListener(listener);
      w.addEventListener("unload", remove, { once: true });
      this.restorers.push(() => {
        w.removeEventListener("click", onClick, true);
        w.removeEventListener("mousemove", onMove, true);
        w.removeEventListener("MsgLoaded", refresh, true);
        tabs?.removeEventListener("TabSelect", refresh);
        remove();
        for (const li of w.document.querySelectorAll('#unifiedToolbarContent > li[item-id="mark-as"]')) {
          li.removeAttribute("mc-starred");
          li.removeAttribute("mc-hot");
        }
        delete w.__mcStarHook;
      });
    };

    // Titel und Anzahl über der Mailliste in der Toolbar-Zeile, rechts davon
    // Filter und „…“ in einer Kapsel – wie Apple Mail. Thunderbirds eigene
    // Kopfzeile in der Liste wird per CSS ausgeblendet. Der Filter zeigt nur
    // ungelesene Mails (setUnreadFilter); Thunderbirds Schnellfilter-Leiste
    // gibt es nicht mehr, ihre Menüeinträge (Ansicht → Symbolleisten,
    // App-Menü) entfallen.
    // Bereiche-Leiste: Reihenfolge per Ziehen ändern wie im Dock bzw. in der
    // Seitenleiste von Apple Mail. Greifen (erst nach 4 px Bewegung, ein
    // Klick öffnet den Bereich weiter), die übrigen Knöpfe weichen animiert
    // aus, Loslassen speichert (SPACES_ORDER_PREF), Esc bricht ab. Die
    // Reihenfolge setzt CSS order (die Container sind display: contents),
    // Thunderbirds Aufbau bleibt; Einstellungen bleibt unten fest
    const hookSpacesOrder = () => {
      const d = w.document;
      const bar = d.getElementById("spacesToolbar");
      if (!bar || bar.__mcOrder) {
        return;
      }
      bar.__mcOrder = true;
      const visible = () => SpacesOrder.current().map(id => d.getElementById(id))
        .filter(b => b && !b.hidden && b.getBoundingClientRect().height > 0);
      let drag = null;
      const clearMotion = () => {
        for (const b of visible()) {
          b.style.removeProperty("transform");
          b.style.removeProperty("transition");
          b.style.removeProperty("z-index");
          b.removeAttribute("mc-dragging");
        }
      };
      const finish = (cancel) => {
        const g = drag;
        drag = null;
        if (!g?.active) {
          return;
        }
        w.removeEventListener("keydown", onKey, true);
        const ms = motionMs(160);
        const target = cancel ? g.from : g.to;
        // gezogenen Knopf in den Ziel-Platz gleiten lassen, dann übernehmen
        g.button.style.transition = `transform ${ms}ms ease`;
        g.button.style.transform = `translateY(${g.tops[target] - g.tops[g.from]}px)`;
        if (cancel) {
          for (const b of g.list) {
            if (b != g.button) {
              b.style.transform = "";
            }
          }
        }
        w.setTimeout(() => {
          clearMotion();
          if (!cancel && g.to != g.from) {
            const ids = g.list.map(b => b.id);
            ids.splice(g.to, 0, ids.splice(g.from, 1)[0]);
            SpacesOrder.save(ids);
          }
        }, ms + 20);
        // der Klick nach dem Ziehen öffnet den Bereich nicht
        const swallow = event => {
          event.preventDefault();
          event.stopPropagation();
        };
        bar.addEventListener("click", swallow, { capture: true, once: true });
        w.setTimeout(() => bar.removeEventListener("click", swallow, { capture: true }), 400);
      };
      const onKey = event => {
        if (event.key == "Escape" && drag?.active) {
          event.preventDefault();
          event.stopPropagation();
          finish(true);
        }
      };
      const onDown = event => {
        const button = event.target.closest?.(".spaces-toolbar-button");
        if (event.button != 0 || !button || button.id == "settingsButton" || !SpacesOrder.IDS.includes(button.id) || w.__mcSpacesAnimating) {
          return;
        }
        const list = visible();
        const from = list.indexOf(button);
        if (from < 0) {
          return;
        }
        drag = { button, list, from, to: from, y: event.clientY, id: event.pointerId, active: false,
                 tops: list.map(b => b.getBoundingClientRect().top) };
      };
      const onMove = event => {
        const g = drag;
        if (!g || event.pointerId != g.id) {
          return;
        }
        const dy = event.clientY - g.y;
        if (!g.active) {
          if (Math.abs(dy) < 4) {
            return;
          }
          g.active = true;
          try {
            g.button.setPointerCapture(event.pointerId);
          } catch {} // (nachgestellte Zeiger ohne echtes Gerät)
          g.button.setAttribute("mc-dragging", "true");
          g.button.style.zIndex = "2";
          const ms = motionMs(180);
          for (const b of g.list) {
            if (b != g.button) {
              b.style.transition = `transform ${ms}ms ease`;
            }
          }
          w.addEventListener("keydown", onKey, true);
        }
        // nicht über den ersten bzw. letzten Platz hinaus
        const min = g.tops[0] - g.tops[g.from];
        const max = g.tops[g.tops.length - 1] - g.tops[g.from];
        const shift = Math.max(min, Math.min(max, dy));
        g.button.style.transform = `translateY(${shift}px)`;
        // Ziel: der Platz, dessen Mitte der gezogene Knopf erreicht hat
        const h = g.button.getBoundingClientRect().height;
        const mid = g.tops[g.from] + shift + h / 2;
        let to = 0;
        g.tops.forEach((top, i) => {
          if (mid >= top) {
            to = i;
          }
        });
        g.to = to;
        g.list.forEach((b, i) => {
          if (b == g.button) {
            return;
          }
          let offset = 0;
          if (g.from < to && i > g.from && i <= to) {
            offset = g.tops[i - 1] - g.tops[i];
          } else if (g.from > to && i < g.from && i >= to) {
            offset = g.tops[i + 1] - g.tops[i];
          }
          b.style.transform = offset ? `translateY(${offset}px)` : "";
        });
      };
      const onUp = event => {
        if (drag && event.pointerId == drag.id) {
          if (drag.active) {
            finish(false);
          } else {
            drag = null;
          }
        }
      };
      const onCancel = event => {
        if (drag && event.pointerId == drag.id) {
          finish(true);
        }
      };
      bar.addEventListener("pointerdown", onDown);
      bar.addEventListener("pointermove", onMove);
      bar.addEventListener("pointerup", onUp);
      bar.addEventListener("pointercancel", onCancel);
      SpacesOrder.apply(w);
      // ⌘1 bis ⌘5: n-ter Bereich in der Reihenfolge der Leiste. Thunderbird
      // wählt damit den n-ten Tab – ohne Tab-Leiste passte das nur, solange
      // die Bereiche in Standard-Reihenfolge geöffnet wurden; ⌘6 bis ⌘9 und
      // Nummern ohne Bereich bleiben bei Thunderbird
      const keys = ["key_mail", "key_selectTab2", "key_selectTab3", "key_selectTab4", "key_selectTab5"]
        .map((id, n) => [d.getElementById(id), n]).filter(([k]) => k);
      const savedKeys = keys.map(([k]) => [k, k.getAttribute("oncommand")]);
      const onSpaceKey = [];
      for (const [k, n] of keys) {
        const fallback = k.getAttribute("oncommand");
        const fn = event => {
          const b = SpacesOrder.current().map(id => d.getElementById(id)).filter(e => e && !e.hidden)[n];
          if (b) {
            w.focus();
            b.click();
          } else {
            // wie bisher (Thunderbirds Befehl für diesen Tab)
            new w.Function("event", fallback).call(k, event);
          }
        };
        k.removeAttribute("oncommand");
        k.addEventListener("command", fn);
        onSpaceKey.push([k, fn]);
      }
      // geänderte Reihenfolge (auch aus einem anderen Fenster oder den
      // Einstellungen) und fünfter Bereich: neu anwenden
      const obs = () => w.setTimeout(() => SpacesOrder.apply(w), 0);
      Services.prefs.addObserver(SPACES_ORDER_PREF, obs);
      Services.prefs.addObserver(FIFTH_PREF, obs);
      const unobserve = () => {
        Services.prefs.removeObserver(SPACES_ORDER_PREF, obs);
        Services.prefs.removeObserver(FIFTH_PREF, obs);
      };
      w.addEventListener("unload", unobserve, { once: true });
      this.restorers.push(() => {
        unobserve();
        bar.removeEventListener("pointerdown", onDown);
        bar.removeEventListener("pointermove", onMove);
        bar.removeEventListener("pointerup", onUp);
        bar.removeEventListener("pointercancel", onCancel);
        clearMotion();
        SpacesOrder.reset(w);
        for (const [k, fn] of onSpaceKey) {
          k.removeEventListener("command", fn);
        }
        for (const [k, cmd] of savedKeys) {
          k.setAttribute("oncommand", cmd);
        }
        delete bar.__mcOrder;
      });
    };

    // Chat: Teilnehmer mit Kreis und Anfangsbuchstaben wie die Kontakte in
    // Apple Nachrichten; nur ein Merkmal an Thunderbirds Einträgen (den Aufbau
    // der Liste braucht Thunderbird zum Einsortieren), den Kreis zeichnet CSS
    // in Thunderbirds Farbe des Namens
    const hookChatNicklist = () => {
      const list = w.document.getElementById("nicklist");
      if (!list || list.__mcNick) {
        return;
      }
      list.__mcNick = true;
      const mark = item => {
        const label = item.querySelector?.(".conv-nicklist-label");
        const name = (label?.getAttribute("value") || "").replace(/^[^\p{L}\p{N}]+/u, "");
        if (!label || !name) {
          return;
        }
        const initial = [...name][0].toUpperCase();
        if (item.dataset.mcInitial != initial) {
          item.dataset.mcInitial = initial;
        }
      };
      const all = () => [...list.children].forEach(mark);
      const mo = new w.MutationObserver(all);
      mo.observe(list, { childList: true, subtree: true, attributes: true, attributeFilter: ["value"] });
      all();
      this.restorers.push(() => {
        mo.disconnect();
        delete list.__mcNick;
        for (const item of list.children) {
          delete item.dataset.mcInitial;
        }
      });
    };

    const hookListHeader = () => {
      const d = w.document;
      const row = d.getElementById("unifiedToolbarContainer");
      if (!row || d.getElementById("mcListHeader")) {
        return;
      }
      const X = "http://www.w3.org/1999/xhtml";
      const el = (tag, cls) => {
        const e = d.createElementNS(X, tag);
        if (cls) e.className = cls;
        return e;
      };
      const box = el("div");
      box.id = "mcListHeader";
      const text = el("div", "mc-lh-text");
      const title = el("div", "mc-lh-title");
      const count = el("div", "mc-lh-count");
      text.append(title, count);
      const tools = el("div", "mc-lh-tools");
      const filter = el("button", "mc-lh-filter");
      filter.title = tr("Enable Message Filter");
      filter.setAttribute("aria-pressed", "false");
      const more = el("button", "mc-lh-more");
      more.title = tr("Message List Display Options");
      tools.append(filter, more);
      // Adressbuch: „+“ ganz rechts über der Kontaktliste wie Apple Kontakte –
      // ein Menü nur zum Anlegen (statt dreier Knöpfe in der Toolbar)
      const plus = el("button", "mc-lh-plus");
      plus.title = tr("New");
      plus.setAttribute("aria-haspopup", "menu");
      const plusPopup = d.createXULElement("menupopup");
      plusPopup.id = "mcAbNewPopup";
      for (const [label, command] of [["New Contact", "cmd_newCard"], ["New Address Book", "cmd_createAddressBook"], ["New List", "cmd_createList"]]) {
        const mi = d.createXULElement("menuitem");
        mi.setAttribute("label", tr(label));
        mi.dataset.command = command;
        plusPopup.append(mi);
      }
      // was gerade nicht geht (Buch nur lesbar oder ohne Listen, Kontakt wird
      // bearbeitet), ausgrauen – Thunderbird führt gesperrte Befehle stumm nicht aus
      plusPopup.addEventListener("popupshowing", event => {
        if (event.target != plusPopup) {
          return;
        }
        const ctl = d.getElementById("tabmail")?.currentTabInfo?.browser?.contentWindow?.commandController;
        for (const mi of plusPopup.querySelectorAll("menuitem")) {
          let enabled = true;
          try {
            enabled = typeof ctl?.isCommandEnabled != "function" || ctl.isCommandEnabled(mi.dataset.command);
          } catch {} // gewollt: Zustand nicht lesbar, Eintrag bleibt wählbar
          mi.disabled = !enabled;
        }
      });
      plusPopup.addEventListener("command", event => {
        const command = event.target.dataset?.command;
        if (command) {
          w.goDoCommand(command);
        }
      });
      (d.getElementById("mainPopupSet") || d.querySelector("popupset") || d.documentElement).append(plusPopup);
      this.restorers.push(() => plusPopup.remove());
      plus.addEventListener("click", () => {
        const r = plus.getBoundingClientRect();
        plusPopup.openPopupAtScreen(w.mozInnerScreenX + r.left, w.mozInnerScreenY + r.bottom + 4, false);
      });
      box.append(text, tools, plus);
      const ab = () => d.getElementById("tabmail")?.currentAbout3Pane;
      const taskPopup = (button, kind) => {
        const popup = d.getElementById("mcTaskFilterPopup");
        if (!popup) {
          return false;
        }
        popup.dataset.kind = kind;
        const r = button.getBoundingClientRect();
        popup.openPopupAtScreen(w.mozInnerScreenX + r.left, w.mozInnerScreenY + r.bottom + 4, false);
        return true;
      };
      const inTasks = () => d.getElementById("tabmail")?.currentTabInfo?.mode?.name == "tasks";
      // Bedingungen wählen (wie Apple: Filter-Knopf halten oder Rechtsklick)
      const filterPopup = d.createXULElement("menupopup");
      filterPopup.id = "mcMailFilterPopup";
      (d.getElementById("mainPopupSet") || d.querySelector("popupset") || d.documentElement).append(filterPopup);
      this.restorers.push(() => filterPopup.remove());
      filterPopup.addEventListener("popupshowing", event => {
        if (event.target != filterPopup) {
          return;
        }
        const a3 = ab();
        const on = this.unreadFilterOn(a3);
        const chosen = this.filterCriteria();
        const item = (label, checked, onCommand) => {
          const mi = d.createXULElement("menuitem");
          mi.setAttribute("type", "checkbox");
          mi.setAttribute("label", tr(label));
          if (checked) {
            mi.setAttribute("checked", "true");
          }
          mi.addEventListener("command", onCommand);
          return mi;
        };
        filterPopup.replaceChildren(
          item("Enable Message Filter", on, () => a3 && this.setUnreadFilter(a3, !on)),
          d.createXULElement("menuseparator"),
          ...FILTER_CHOICES.map(([key, label]) => {
            const mi = item(label, on && chosen.includes(key), () => {
              // gewählte Bedingung schaltet den Filter ein; ohne Bedingung aus
              const next = on ? chosen.filter(k => k != key) : [key];
              if (on && !chosen.includes(key)) {
                next.push(key);
              }
              if (next.length) {
                Services.prefs.setStringPref(FILTER_PREF, next.join(","));
              } else {
                Services.prefs.clearUserPref(FILTER_PREF);
              }
              if (a3) {
                this.setUnreadFilter(a3, next.length > 0);
              }
            });
            mi.dataset.filter = key;
            return mi;
          })
        );
      });
      const openFilterPopup = () => {
        const r = filter.getBoundingClientRect();
        filterPopup.openPopupAtScreen(w.mozInnerScreenX + r.left, w.mozInnerScreenY + r.bottom + 4, false);
      };
      let holdTimer = null, held = false;
      filter.addEventListener("pointerdown", event => {
        held = false;
        if (event.button != 0 || inTasks()) {
          return;
        }
        holdTimer = w.setTimeout(() => {
          held = true;
          openFilterPopup();
        }, 500);
      });
      const stopHold = () => w.clearTimeout(holdTimer);
      filter.addEventListener("pointerup", stopHold);
      filter.addEventListener("pointerleave", stopHold);
      // „Gefiltert nach: …“ unter dem Titel öffnet ebenfalls die Auswahl
      count.addEventListener("click", () => {
        if (count.classList.contains("mc-lh-filtered") && !inTasks()) {
          const r = count.getBoundingClientRect();
          filterPopup.openPopupAtScreen(w.mozInnerScreenX + r.left, w.mozInnerScreenY + r.bottom + 4, false);
        }
      });
      filter.addEventListener("contextmenu", event => {
        if (inTasks()) {
          return;
        }
        event.preventDefault();
        stopHold();
        openFilterPopup();
      });
      filter.addEventListener("click", () => {
        if (held) {
          held = false;
          return; // Menü schon offen
        }
        if (inTasks()) {
          taskPopup(filter, "filter");
          return;
        }
        const a3 = ab();
        if (a3) {
          this.setUnreadFilter(a3, !this.unreadFilterOn(a3));
        }
      });
      more.addEventListener("click", () => {
        if (inTasks() && taskPopup(more, "view")) {
          return;
        }
        const cw = abWindow();
        const popup = cw
          ? cw.document.getElementById("sortContext")
          : ab()?.document.getElementById("threadPaneDisplayContext");
        const r = more.getBoundingClientRect();
        popup?.openPopupAtScreen(w.mozInnerScreenX + r.left, w.mozInnerScreenY + r.bottom + 4, false);
      });
      row.append(box);
      this.restorers.push(() => box.remove());
      for (const id of ["view_toolbars_popup_quickFilterBar", "appmenu_quickFilterBar"]) {
        const item = d.getElementById(id);
        if (item && !item.hidden) {
          item.hidden = true;
          this.restorers.push(() => (item.hidden = false));
        }
      }
      this.updateListHeader(w);
    };

    // Terminspalte rechts im Stil von Fastmail, in unserem Design:
    // Minikalender oben, darunter Monatstitel und Agenda mit Wochentag und
    // großer Tageszahl links, Termine als Farbblöcke rechts.
    // Monatsansicht wie Apple Kalender: passen nicht alle Termine in einen
    // Tag, steht unten „+N weitere“ – ein Klick öffnet den Tag in der
    // Tagesansicht. Dazu Zoom per Trackpad (Pinch) oder ⌘/Ctrl + Mausrad:
    // höhere Wochenzeilen, die Monatsansicht wird dann scrollbar.
    const ZOOM_PREF = "extensions.mailcards.monthZoom";
    const hookMonthView = () => {
      const d = w.document;
      const mv = d.getElementById("month-view");
      if (!mv || mv.__mcMore) {
        return;
      }
      mv.__mcMore = true;
      // Höhe der Monatstabelle in Pixeln: sichtbare Höhe × Zoom (eine
      // Prozentangabe greift in der scrollbaren Ansicht nicht mehr)
      const applyHeight = () => {
        const table = mv.querySelector("table.monthtable");
        const z = parseFloat(mv.style.getPropertyValue("--mc-month-zoom")) || 1;
        if (!table) {
          return;
        }
        if (z <= 1.01) {
          table.style.removeProperty("height");
          return;
        }
        const visible = mv.clientHeight - (table.getBoundingClientRect().top - mv.getBoundingClientRect().top - mv.scrollTop);
        table.style.setProperty("height", `${Math.round(Math.max(200, visible) * z)}px`, "important");
      };
      const setZoom = z => {
        const zoom = Math.max(1, Math.min(3, Math.round(z * 100) / 100));
        mv.style.setProperty("--mc-month-zoom", zoom);
        mv.toggleAttribute("mc-zoomed", zoom > 1.01);
        applyHeight();
        Services.prefs.setStringPref(ZOOM_PREF, String(zoom));
        return zoom;
      };
      let zoom = setZoom(parseFloat(Services.prefs.getStringPref(ZOOM_PREF, "1")) || 1);
      let pending = false;
      const update = () => {
        pending = false;
        for (const box of mv.querySelectorAll("calendar-month-day-box")) {
          const list = box.querySelector(".calendar-month-day-box-list");
          let more = box.querySelector(":scope > .mc-more");
          if (!list) {
            continue;
          }
          // ab Thunderbird 159 steckt die Liste in einem eigenen Rollbereich
          // (.calendar-month-day-box-scroll) und ist selbst so hoch wie alle
          // Termine – gemessen wird am sichtbaren Bereich
          const lr = (list.closest(".calendar-month-day-box-scroll") || list).getBoundingClientRect();
          const items = [...list.children];
          // Platz für die Zeile „+N weitere“ freihalten, sobald etwas fehlt
          for (const i of items) {
            i.removeAttribute("data-mc-cut");
          }
          let cut = [];
          if (items.some(i => i.getBoundingClientRect().bottom > lr.bottom + 1)) {
            cut = items.filter(i => i.getBoundingClientRect().bottom > lr.bottom - 18);
          }
          const hidden = cut.length;
          for (const i of cut) {
            i.setAttribute("data-mc-cut", "true");
          }
          if (!hidden) {
            more?.remove();
            box.removeAttribute("mc-has-more");
            continue;
          }
          if (!more) {
            more = d.createElementNS("http://www.w3.org/1999/xhtml", "button");
            more.className = "mc-more";
            more.addEventListener("click", event => {
              event.stopPropagation();
              const date = box.date;
              if (date) {
                // über switchCalendarView: nur so folgen Umschalter oben und
                // gemerkte Ansicht (switchToView ließ „Month“ markiert)
                (w.switchCalendarView || w.switchToView)?.("day");
                w.currentView?.()?.goToDay?.(date);
              }
            });
            more.addEventListener("dblclick", event => event.stopPropagation());
            box.appendChild(more);
          }
          box.setAttribute("mc-has-more", "true");
          // nur bei neuem Text setzen – sonst ersetzt Gecko den Textknoten, der
          // Beobachter unten meldet das, und update() liefe in jedem Bild erneut
          const label = tr("+{n} more", { n: hidden });
          if (more.textContent != label) {
            more.textContent = label;
          }
        }
      };
      // nur messen, wenn der Kalender vorne ist – sonst liefe das bei jeder
      // Größenänderung (z. B. Ein-/Ausblend-Animation in der Mail) mit
      let dirty = false;
      const visible = () => w.document.getElementById("tabmail")?.currentTabInfo?.mode?.name == "calendar";
      const schedule = () => {
        if (!visible() || w.__mcSpacesAnimating) {
          dirty = true;
          return;
        }
        if (!pending) {
          pending = true;
          w.requestAnimationFrame(update);
        }
      };
      mv.__mcMoreRefresh = () => {
        if (dirty) {
          dirty = false;
          schedule();
        }
      };
      const mo = new w.MutationObserver(records => {
        // eigene Änderungen (die „+N“-Knöpfe) lösen keine neue Runde aus
        if (records.some(r => !r.target.closest?.(".mc-more") &&
            (![...r.addedNodes, ...r.removedNodes].every(n => n.classList?.contains("mc-more")) || r.type == "attributes"))) {
          schedule();
        }
      });
      mo.observe(mv, { childList: true, subtree: true });
      const ro = new w.ResizeObserver(() => {
        schedule();
      });
      ro.observe(mv);
      const table = mv.querySelector("table.monthtable");
      if (table) {
        ro.observe(table);
      }
      // Fenstergröße geändert: Tabellenhöhe neu berechnen
      const outer = new w.ResizeObserver(() => applyHeight());
      outer.observe(mv.parentElement || mv);
      // Zoom: Pinch-Geste auf dem Trackpad und ⌘/Ctrl + Mausrad
      const onGesture = event => {
        zoom = setZoom(zoom * (1 + (event.delta || 0) / 100));
        event.preventDefault();
        schedule();
      };
      const onWheel = event => {
        if (!(event.ctrlKey || event.metaKey)) {
          return;
        }
        event.preventDefault();
        zoom = setZoom(zoom * (event.deltaY < 0 ? 1.08 : 1 / 1.08));
        schedule();
      };
      // Mausrad blättert immer den Monat – Thunderbird gibt es sonst an einen
      // Tag weiter, dessen Einträge nicht ganz hineinpassen (der scrollt dann
      // unsichtbar in sich, und das Blättern scheint zu hängen); verborgene
      // Einträge zeigt „+N weitere“
      let pixels = 0;
      let lastWheel = -Infinity;
      let lastDir = 0;
      const onMonthWheel = event => {
        if (event.ctrlKey || event.metaKey || event.altKey || event.shiftKey || mv.hasAttribute("mc-zoomed") ||
            !Services.prefs.getBoolPref("calendar.view.mousescroll", true)) {
          return;
        }
        event.stopPropagation();
        event.preventDefault();
        // Jede Raste blättert sofort einen Monat (macOS liefert eine Raste als
        // weiche Folge kleiner Schritte, zusammen ~100 px – Thunderbirds
        // Schwelle von 150 px verschluckte sie). Innerhalb einer Folge
        // (Abstand < 150 ms) erst nach weiteren 200 px den nächsten Monat –
        // schnelles Drehen und das Trackpad blättern so weiter.
        let delta = 0;
        if (!event.deltaY) {
          return;
        }
        const now = event.timeStamp;
        const dir = Math.sign(event.deltaY);
        if (event.deltaMode != event.DOM_DELTA_PIXEL) {
          delta = dir;
        } else if (now - lastWheel > 150 || dir != lastDir) {
          delta = dir;
          pixels = 0;
        } else {
          pixels += event.deltaY;
          if (Math.abs(pixels) >= 200) {
            delta = dir;
            pixels = 0;
          }
        }
        lastWheel = now;
        lastDir = dir;
        if (delta) {
          mv.moveView(delta);
        }
      };
      mv.addEventListener("wheel", onMonthWheel, { capture: true, passive: false });
      this.restorers.push(() => mv.removeEventListener("wheel", onMonthWheel, { capture: true }));
      mv.addEventListener("MozMagnifyGestureUpdate", onGesture);
      mv.addEventListener("MozMagnifyGesture", onGesture);
      mv.addEventListener("wheel", onWheel, { passive: false });
      this.restorers.push(() => {
        mo.disconnect();
        ro.disconnect();
        outer.disconnect();
        mv.querySelector("table.monthtable")?.style.removeProperty("height");
        mv.removeEventListener("MozMagnifyGestureUpdate", onGesture);
        mv.removeEventListener("MozMagnifyGesture", onGesture);
        mv.removeEventListener("wheel", onWheel);
        for (const el of mv.querySelectorAll(".mc-more")) {
          el.remove();
        }
        mv.style.removeProperty("--mc-month-zoom");
        mv.removeAttribute("mc-zoomed");
        delete mv.__mcMore;
      });
      schedule();
    };

    const decorateAgenda = () => {
      const d = w.document;
      const agenda = d.getElementById("agenda");
      if (!agenda || agenda.__mcAgenda) {
        return;
      }
      agenda.__mcAgenda = true;
      // einmalig: Minikalender statt Mini-Tagesanzeige in allen Bereichen und
      // eine breitere Spalte (beides über ▾-Menü bzw. Ziehen änderbar)
      const ONCE = "extensions.mailcards.todayPaneLayout";
      if (!Services.prefs.getBoolPref(ONCE, false)) {
        try {
          const panel = d.getElementById("today-pane-panel");
          const modes = (panel.getAttribute("mode") || "").split(",").filter(Boolean);
          const all = modes.join(",");
          d.getElementById("today-minimonth-box")?.setAttribute("collapsedinmodes", "");
          d.getElementById("mini-day-box")?.setAttribute("collapsedinmodes", all);
          d.getElementById("today-none-box")?.setAttribute("collapsedinmodes", all);
          panel.setAttribute("modewidths", modes.map(() => "280").join(","));
          panel.style.width = "280px";
          for (const id of ["today-minimonth-box", "mini-day-box", "today-none-box", "today-pane-panel"]) {
            const el = d.getElementById(id);
            for (const attr of ["collapsedinmodes", "modewidths"]) {
              if (el?.hasAttribute(attr)) {
                Services.xulStore.setValue(d.documentURI, id, attr, el.getAttribute(attr));
              }
            }
          }
          w.TodayPane?.displayMiniSection("minimonth");
          Services.prefs.setBoolPref(ONCE, true);
        } catch (e) {
          log("today pane layout error", String(e).slice(0, 160));
        }
      }
      this.syncTodayModes(w);
      const locale = Services.locale.appLocaleAsBCP47;
      const wdFmt = new Intl.DateTimeFormat(locale, { weekday: "short" });
      // Der Monat steht nur über dem Mini-Kalender (dessen Pfeile blättern
      // auch die Liste, hookAgendaMonthRange); keine eigene Monatszeile über
      // der Liste mehr (nichts doppelt)
      this.hookAgendaMonthRange(w);
      this.markMinimonthWeekStart(w);
      const apply = () => {
        const today = new Date();
        const todayKey = `${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, "0")}${String(today.getDate()).padStart(2, "0")}`;
        for (const li of agenda.querySelectorAll(":scope > li.agenda-listitem")) {
          const key = li.dateString || "";
          if (key.length >= 8) {
            const date = new Date(+key.slice(0, 4), +key.slice(4, 6) - 1, +key.slice(6, 8));
            // Tage vor heute blasser (wie vergangene Tage im Kalender)
            li.toggleAttribute("data-mc-past", key.slice(0, 8) < todayKey);
            const header = li.querySelector(".agenda-date-header");
            if (header) {
              header.dataset.mcWd = wdFmt.format(date).replace(/\.$/, "");
              header.dataset.mcDay = String(date.getDate());
              header.toggleAttribute("data-mc-today", key.slice(0, 8) == todayKey);
            }
          }
          // bald beginnend (in den nächsten 3 Stunden): Zusatz „in 2 hr“ zeigen
          try {
            const start = li.item?.startDate;
            const begins = start && !start.isDate ? start.nativeTime / 1000 - Date.now() : Infinity;
            li.toggleAttribute("data-mc-soon", begins > 0 && begins <= 3 * 3600 * 1000);
          } catch {} // gewollt: Termin ohne lesbaren Beginn, kein Zusatz „bald“
          // Kalenderfarbe für den Farbblock
          const dot = li.querySelector(".agenda-listitem-calendar");
          const details = li.querySelector(".agenda-listitem-details");
          let color = dot ? w.getComputedStyle(dot).backgroundColor : "";
          if ((!color || color == "rgba(0, 0, 0, 0)") && details) {
            color = details.style.backgroundColor || w.getComputedStyle(details).backgroundColor;
          }
          if (color && color != "rgba(0, 0, 0, 0)") {
            li.style.setProperty("--mc-c", color);
          }
        }
      };
      let pending = false;
      const mo = new w.MutationObserver(() => {
        if (!pending) {
          pending = true;
          w.requestAnimationFrame(() => {
            pending = false;
            apply();
          });
        }
      });
      mo.observe(agenda, { childList: true, subtree: true, characterData: true });
      apply();
      this.restorers.push(() => {
        mo.disconnect();
        delete agenda.__mcAgenda;
      });
    };

    // Emoji vor Termintiteln (Monat, Woche, Tag, ganztägig, Today-Pane):
    // Attribut am Titel, gezeichnet von spaces.css – der Termin bleibt unverändert
    const EMOJI_LABELS = ".event-name-label, .agenda-listitem-title";
    const annotateEmoji = root => {
      const on = Services.prefs.getBoolPref(EMOJI_PREF, true);
      for (const label of root.querySelectorAll(EMOJI_LABELS)) {
        const emoji = on ? emojiFor(label.textContent) : "";
        if (emoji) {
          if (label.getAttribute("data-mc-emoji") != emoji) {
            label.setAttribute("data-mc-emoji", emoji);
          }
        } else if (label.hasAttribute("data-mc-emoji")) {
          label.removeAttribute("data-mc-emoji");
        }
      }
    };
    // Mehrtägige Termine in Monat/Mehrwochen als durchgehender Balken wie in
    // Apple Kalender – ganztägige wie solche mit Uhrzeit (data-mc-multi, mit
    // der Startzeit hinter dem Titel in data-mc-time): jedes Tagesstück weiß,
    // ob es links/rechts weitergeht (innerhalb einer Wochenzeile); der Titel
    // läuft über alle Stücke weiter: Folgestücke rücken ihn um ihren Abstand
    // zum ersten Stück derselben Zeile ein (--mc-span-x, data-mc-span)
    const annotateSpans = root => {
      const joined = [];
      // mehrtägige Stücke je Wochenzeile (für die gemeinsamen Spuren unten)
      const multiRows = new Map();
      for (const el of root.querySelectorAll("calendar-month-day-box-item")) {
        let left = false;
        let right = false;
        let time = "";
        try {
          const occ = el.occurrence;
          const day = el.parentBox?.date;
          const start = occ?.startDate;
          const end = occ?.endDate;
          if (day && start && end) {
            const cell = el.closest("td");
            const row = cell?.parentElement;
            const col = cell ? [...row.children].indexOf(cell) : -1;
            let before = false;
            let after = false;
            if (el.hasAttribute("allday")) {
              const next = day.clone();
              next.day += 1;
              before = day.compare(start) > 0;
              after = next.compare(end) < 0;
            } else if (!start.isDate) {
              // wie Thunderbird beim Einordnen (calendar-month-view.js): beginnt vor
              // diesem Tag bzw. endet nach dessen Mitternacht
              const from = day.clone();
              from.isDate = false;
              const to = from.clone();
              to.day += 1;
              before = start.compare(from) < 0;
              after = end.compare(to) > 0;
              if (before || after) {
                const { cal } = ChromeUtils.importESModule("resource:///modules/calendar/calUtils.sys.mjs");
                time = cal.dtz.formatter.formatTime(start.getInTimezone(day.timezone));
              }
            }
            left = before && col > 0;
            right = after && col >= 0 && col < row.children.length - 1;
            if ((before || after) && col >= 0 && el.parentElement?.localName == "li") {
              if (!multiRows.has(row)) {
                multiRows.set(row, []);
              }
              multiRows.get(row).push({ el, occ, start, end, day, col });
            }
          }
        } catch {} // gewollt: Termin ohne Layout, keine Verbindung zum Nachbartag
        el.toggleAttribute("data-mc-join-l", left);
        el.toggleAttribute("data-mc-join-r", right);
        el.toggleAttribute("data-mc-multi", !!time);
        const label = el.querySelector(".event-name-label");
        if (label && (label.getAttribute("data-mc-time") || "") != time) {
          if (time) {
            label.setAttribute("data-mc-time", time);
          } else {
            label.removeAttribute("data-mc-time");
          }
        }
        if (left) {
          joined.push(el);
        } else if (el.hasAttribute("data-mc-span")) {
          el.removeAttribute("data-mc-span");
          el.style.removeProperty("--mc-span-x");
        }
      }
      // Spuren wie Apple Kalender: Thunderbird sortiert jeden Tag für sich nach
      // Beginn – ein mehrtägiger Termin mit Uhrzeit stand am ersten Tag unter
      // früheren Terminen, an den Folgetagen oben, der Balken brach an den
      // Tagesgrenzen. Je Wochenzeile bekommt jeder mehrtägige Termin eine feste
      // Spur (früherer Beginn, dann längere zuerst), oben in jedem Tag; frei
      // bleibende Spuren eines Tages halten ihren Platz als Abstand
      const laned = new Set();
      for (const pieces of multiRows.values()) {
        const occs = new Map();
        for (const p of pieces) {
          const id = p.occ.hashId;
          if (!occs.has(id)) {
            const s = p.start.isDate ? p.start : p.start.getInTimezone(p.day.timezone);
            occs.set(id, { first: p, cols: new Set(), key: s.year * 10000 + (s.month + 1) * 100 + s.day });
          }
          occs.get(id).cols.add(p.col);
        }
        const order = [...occs.values()].sort((a, b) => a.key - b.key
          || b.first.end.nativeTime - a.first.end.nativeTime
          || (b.first.start.isDate ? 1 : 0) - (a.first.start.isDate ? 1 : 0)
          || a.first.start.nativeTime - b.first.start.nativeTime
          || String(a.first.occ.title).localeCompare(String(b.first.occ.title)));
        const used = [];
        for (const o of order) {
          let lane = 0;
          while ([...o.cols].some(c => used[lane]?.has(c))) {
            lane++;
          }
          (used[lane] ||= new Set());
          for (const c of o.cols) {
            used[lane].add(c);
          }
          o.lane = lane;
        }
        const byList = new Map();
        for (const p of pieces) {
          const list = p.el.parentElement.parentElement;
          if (!byList.has(list)) {
            byList.set(list, []);
          }
          byList.get(list).push({ li: p.el.parentElement, lane: occs.get(p.occ.hashId).lane });
        }
        for (const [list, items] of byList) {
          items.sort((a, b) => a.lane - b.lane);
          // Abstand einer Spur: Höhe eines Eintrags samt Zwischenraum
          const pitch = items[0].li.getBoundingClientRect().height + 2;
          let anchor = null;
          let prev = -1;
          for (const it of items) {
            const want = anchor ? anchor.nextElementSibling : list.firstElementChild;
            // nur bei falscher Reihenfolge verschieben – sonst meldet der
            // Beobachter jede Verschiebung, und das liefe endlos
            if (want != it.li) {
              list.insertBefore(it.li, want);
            }
            anchor = it.li;
            const gap = it.lane - prev - 1;
            prev = it.lane;
            const mt = gap > 0 && pitch > 2 ? `${Math.round(gap * pitch + 2)}px` : "";
            if (it.li.style.marginTop != mt) {
              it.li.style.marginTop = mt;
            }
            laned.add(it.li);
          }
        }
      }
      for (const li of root.querySelectorAll("li[data-mc-lane]")) {
        if (!laned.has(li)) {
          li.removeAttribute("data-mc-lane");
          li.style.removeProperty("margin-top");
        }
      }
      for (const li of laned) {
        if (!li.hasAttribute("data-mc-lane")) {
          li.setAttribute("data-mc-lane", "");
        }
      }
      indentSpans(joined);
    };
    // Einzug der Folgestücke (--mc-span-x) neu messen – hängt als einziges an
    // den Spaltenbreiten. Bei einer Größenänderung (Trennlinie ziehen, Fenster)
    // nur das statt der ganzen Auswertung: die lief über alle Termine im
    // Kalender (Mehrwochen mit den Puffer-Wochen rund 800) und kostete rund
    // 8 ms je Bild; mit dem teureren Layout der Mehrwochen-Ansicht (5 statt
    // 1,6 ms) ruckelte dort das Ziehen der Trennlinie
    const indentSpans = joined => {
      for (const el of joined) {
        let dx = null;
        try {
          const id = el.occurrence?.hashId;
          const row = el.closest("tr");
          const first = id && row && [...row.querySelectorAll("calendar-month-day-box-item:is([allday], [data-mc-multi]):not([data-mc-join-l])")]
            .find(x => x.occurrence?.hashId == id);
          const a = el.querySelector(".event-name-label")?.getBoundingClientRect();
          const b = first?.querySelector(".event-name-label")?.getBoundingClientRect();
          // ohne Layout (verdeckte Ansicht) den letzten Einzug behalten; nie
          // gemessene Folgestücke zeigen keinen Titel
          if (a?.width && b?.width) {
            dx = Math.round((a.left - b.left) * 10) / 10;
          }
        } catch {} // gewollt: ohne Layout (verdeckte Ansicht) bleibt der letzte Einzug
        if (dx !== null) {
          if (el.style.getPropertyValue("--mc-span-x") != `${dx}px`) {
            el.style.setProperty("--mc-span-x", `${dx}px`);
          }
          el.setAttribute("data-mc-span", "");
        }
      }
    };
    // Termine in Tag, Woche, Mehrwochen und Monat ohne Tooltip beim
    // Überfahren (wie Apple Kalender); Details zeigt das Popover per Klick.
    // Thunderbird füllt #itemTooltip schon beim mouseover, das Öffnen wird
    // hier abgesagt; in der Today-Pane bleibt der Tooltip
    const hookItemTooltip = () => {
      const tip = w.document.getElementById("itemTooltip");
      if (!tip || tip.__mcNoTip) {
        return;
      }
      tip.__mcNoTip = true;
      const onShowing = event => {
        if (event.target == tip && tip.triggerNode?.closest?.("#view-box")) {
          event.preventDefault();
        }
      };
      tip.addEventListener("popupshowing", onShowing, true);
      this.restorers.push(() => {
        tip.removeEventListener("popupshowing", onShowing, true);
        delete tip.__mcNoTip;
      });
    };

    const hookCalendarEmoji = () => {
      for (const id of ["view-box", "agenda"]) {
        const root = w.document.getElementById(id);
        if (!root || root.__mcEmoji) {
          continue;
        }
        root.__mcEmoji = true;
        // pending: Lauf geplant; full: ganze Auswertung nötig (sonst nur der Einzug)
        let pending = false;
        let full = true;
        const run = () => {
          pending = false;
          // Zahl der Läufe je Art (für die Prüfung)
          root.__mcSpanRuns ||= { full: 0, indent: 0 };
          root.__mcSpanRuns[full || id != "view-box" ? "full" : "indent"]++;
          if (full || id != "view-box") {
            full = false;
            annotateEmoji(root);
            if (id == "view-box") {
              annotateSpans(root);
            }
          } else {
            indentSpans(root.querySelectorAll("calendar-month-day-box-item[data-mc-join-l]"));
          }
        };
        const later = all => {
          full ||= all;
          if (!pending) {
            pending = true;
            // Zeitgeber statt requestAnimationFrame: läuft auch, wenn das Fenster verdeckt ist
            w.setTimeout(run, 16);
          }
        };
        const mo = new w.MutationObserver(() => later(true));
        mo.observe(root, { childList: true, subtree: true, characterData: true });
        // Spaltenbreiten ändern sich mit dem Fenster und beim Ziehen der Trennlinie – dann nur den Einzug der
        // Balkentitel neu messen. Bekommt eine Ansicht erst jetzt eine Größe (Wechsel zu Monat/Mehrwochen), alles:
        // die Abstände der Spuren brauchen die Höhe eines Eintrags, die es ohne Layout nicht gab
        let ro = null;
        if (id == "view-box" && w.ResizeObserver) {
          ro = new w.ResizeObserver(entries => {
            later(entries.some(e => {
              const was = e.target.__mcSized;
              e.target.__mcSized = e.contentRect.width > 0 && e.contentRect.height > 0;
              return !was;
            }));
          });
          // auch die Ansichten selbst: beim Wechsel zu Monat/Mehrwochen bekommen sie erst dann eine Größe
          for (const v of [root, ...root.querySelectorAll(":scope > *")]) {
            ro.observe(v);
          }
        }
        // eigene Stichwörter kommen aus den Einstellungen bei jedem Tastendruck: erst nach einer Tipp-Pause neu zeichnen
        let emojiTimer = null;
        const emojiNow = () => { resetEmojiRules(); annotateEmoji(root); };
        const prefObs = { observe: (_s, _t, name) => {
          w.clearTimeout(emojiTimer);
          if (name == EMOJI_CUSTOM_PREF) {
            emojiTimer = w.setTimeout(emojiNow, 300);
          } else {
            emojiNow();
          }
        } };
        Services.prefs.addObserver(EMOJI_PREF, prefObs);
        Services.prefs.addObserver(EMOJI_CUSTOM_PREF, prefObs);
        run();
        this.restorers.push(() => {
          mo.disconnect();
          ro?.disconnect();
          for (const v of [root, ...root.children]) {
            delete v.__mcSized;
          }
          delete root.__mcSpanRuns;
          Services.prefs.removeObserver(EMOJI_PREF, prefObs);
          Services.prefs.removeObserver(EMOJI_CUSTOM_PREF, prefObs);
          w.clearTimeout(emojiTimer);
          for (const label of root.querySelectorAll("[data-mc-emoji]")) {
            label.removeAttribute("data-mc-emoji");
          }
          for (const el of root.querySelectorAll("[data-mc-join-l], [data-mc-join-r], [data-mc-span]")) {
            el.removeAttribute("data-mc-join-l");
            el.removeAttribute("data-mc-join-r");
            el.removeAttribute("data-mc-span");
            el.style.removeProperty("--mc-span-x");
          }
          for (const li of root.querySelectorAll("li[data-mc-lane]")) {
            li.removeAttribute("data-mc-lane");
            li.style.removeProperty("margin-top");
          }
          delete root.__mcEmoji;
        });
      }
    };

    // Aufgaben ohne Einträge: mittig Symbol, Titel und kurzer Text statt
    // leerer Fläche (wie Apple Erinnerungen) – ohne Aufgabenkalender mit
    // Hinweis, wo man einen auswählt
    const hookTasksEmpty = () => {
      const d = w.document;
      const tree = d.getElementById("calendar-task-tree");
      const field = d.getElementById("view-task-edit-field");
      const filter = d.getElementById("task-text-filter-field");
      const group = d.getElementById("task-tree-filtergroup");
      if (!tree?.mTreeView || d.getElementById("mcTasksEmpty")) {
        return;
      }
      const HTML = "http://www.w3.org/1999/xhtml";
      const box = d.createElementNS(HTML, "div");
      box.id = "mcTasksEmpty";
      box.hidden = true;
      const icon = d.createElementNS(HTML, "div");
      icon.className = "mc-te-icon";
      const title = d.createElementNS(HTML, "div");
      title.className = "mc-te-title";
      const text = d.createElementNS(HTML, "div");
      text.className = "mc-te-text";
      box.append(icon, title, text);
      tree.after(box);
      const update = () => {
        const empty = !tree.mTreeView || tree.mTreeView.rowCount == 0;
        // ohne Aufgabenkalender ist das Eingabefeld schreibgeschützt (Hinweis als Wert)
        const noList = !!field && (field.readOnly || field.getAttribute("aria-disabled") == "true");
        // Suchfeld oben gefüllt: es gibt Aufgaben, nur passt keine zur Suche
        const searching = !!filter?.value.trim();
        // Filter „Überfällig“/„Erledigt“: neue Aufgaben erscheinen dort gerade
        // nicht – dann nicht „Neue Aufgaben erscheinen hier“ versprechen
        const shown = tree.getAttribute("filterValue") || group?.value || "all";
        const narrowed = ["overdue", "completed"].includes(shown);
        title.textContent = searching ? tr("No Results") : noList ? tr("No Task List Selected") : tr("No Tasks");
        text.textContent = searching ? tr("No tasks match your search.")
          : noList ? tr("Choose a calendar that supports tasks in the sidebar.")
          : narrowed ? tr("No tasks in this view.") : tr("Tasks you add appear here.");
        box.hidden = !empty;
      };
      let pending = false;
      const later = () => {
        if (!pending) {
          pending = true;
          w.setTimeout(() => {
            pending = false;
            update();
          }, 50);
        }
      };
      const view = tree.mTreeView;
      const wrapped = ["addItems", "removeItems", "modifyItems", "clear"].map(name => {
        const orig = view[name];
        view[name] = function (...args) {
          const result = orig.apply(this, args);
          later();
          return result;
        };
        return [name, orig];
      });
      tree.addEventListener("refresh", later);
      for (const type of ["input", "command"]) {
        filter?.addEventListener(type, later);
      }
      const mo = field ? new w.MutationObserver(later) : null;
      mo?.observe(field, { attributes: true, attributeFilter: ["readonly", "aria-disabled"] });
      // Filterwechsel (Seitenleiste oder Menü „Ansicht → Aufgaben“) setzt filterValue am Baum
      const moFilter = new w.MutationObserver(later);
      moFilter.observe(tree, { attributes: true, attributeFilter: ["filterValue"] });
      update();
      this.restorers.push(() => {
        for (const [name, orig] of wrapped) {
          view[name] = orig;
        }
        tree.removeEventListener("refresh", later);
        for (const type of ["input", "command"]) {
          filter?.removeEventListener(type, later);
        }
        mo?.disconnect();
        moFilter.disconnect();
        box.remove();
      });
    };

    // iCloud legt in umgestellte Erinnerungslisten Platzhalter-Aufgaben an
    // („Wo sind meine Erinnerungen?“, „Der Ersteller dieser Liste hat diese
    // Erinnerungen aktualisiert.“) – mit Verweis auf Apples Hilfeseite
    // HT210220. Sie sind keine echten Aufgaben: in allen Aufgabenlisten
    // ausblenden (an den Daten in iCloud ändert sich nichts).
    const hookTaskPlaceholders = () => {
      const proto = w.calFilter?.prototype;
      if (!proto || proto.__mcPlaceholders) {
        return;
      }
      const orig = proto.isItemInFilters;
      proto.isItemInFilters = function (item) {
        try {
          if (item?.isTodo?.() && /support\.apple\.com\/(?:[a-z-]+\/)?HT210220/i.test(item.getProperty("DESCRIPTION") || "")) {
            return false;
          }
        } catch {} // Kandidat fürs Protokoll: Aufgabe nicht geprüft, Thunderbirds Filter entscheidet (Fenster schon entladen ist gewollt)
        return orig.call(this, item);
      };
      proto.__mcPlaceholders = true;
      // schon angezeigte Listen neu füllen (refreshFromCalendar statt
      // refresh() – das meldet die Beobachter jedes Mal neu an)
      const refresh = () => {
        // vor dem Kalender des Fensters gibt es noch keine Listen – und den
        // Manager hier zu fragen, lüde die Kalender zu früh (GitHub #38)
        if (w.loadCalendarComponent && !w.loadCalendarComponent.hasBeenCalled) {
          return;
        }
        let cals = [];
        try {
          const { cal } = ChromeUtils.importESModule("resource:///modules/calendar/calUtils.sys.mjs");
          cals = cal.view.getCompositeCalendar(w).getCalendars() || [];
        } catch {} // gewollt: Kalender nicht lesbar, dann bleibt die Liste ohne Neuladen
        for (const tree of w.document.querySelectorAll(".calendar-task-tree")) {
          if (!tree.mTreeView || typeof tree.refreshFromCalendar != "function") {
            continue;
          }
          for (const calendar of cals.filter(c => !c.getProperty("disabled"))) {
            try {
              tree.refreshFromCalendar(calendar);
            } catch {} // Kandidat fürs Protokoll: Neuladen eines Kalenders fehlgeschlagen
          }
        }
      };
      refresh();
      this.restorers.push(() => {
        proto.isItemInFilters = orig;
        delete proto.__mcPlaceholders;
        refresh();
      });
    };

    // Doppelklick auf freie Zeit (Woche/Tag), die Ganztägig-Zeile oder einen
    // Tag im Monat: unser Schnellfenster an der Mausposition statt Thunderbirds
    // großem Dialog. Ziehen über einen Zeitraum legt weiter direkt an.
    // Terminliste unter dem Kalender („Find Events“): wie bei Apple beim
    // Start zu, Thunderbirds Knopf öffnet sie wieder (sein Zustand stimmt mit)
    const hideUnifinderOnce = () => {
      const d = w.document;
      if (d.documentElement.hasAttribute("mc-unifinder-ready")) {
        return;
      }
      const box = d.getElementById("bottom-events-box");
      if (!box) {
        return;
      }
      try {
        // (direkt – Thunderbirds toggleUnifinder ist beim Start oft noch nicht da;
        // sein Umschalten richtet sich nach hidden)
        if (!box.hidden) {
          box.hidden = true;
          const splitter = d.getElementById("calendar-view-splitter");
          if (splitter) {
            splitter.hidden = true;
          }
          d.getElementById("calendar_show_unifinder_command")?.setAttribute("checked", "false");
        }
      } catch (e) {
        log("unifinder hide error", e);
      }
      d.documentElement.setAttribute("mc-unifinder-ready", "");
      this.restorers.push(() => d.documentElement.removeAttribute("mc-unifinder-ready"));
    };
    const hookCalendarDoubleClick = () => {
      const ctrl = w.calendarViewController;
      const box = w.document.getElementById("view-box");
      if (!ctrl || !box || ctrl.__mcQuick) {
        return;
      }
      ctrl.__mcQuick = true;
      const { cal } = ChromeUtils.importESModule("resource:///modules/calendar/calUtils.sys.mjs");
      let lastClick = null;
      const onDbl = event => {
        lastClick = { x: event.screenX, y: event.screenY, time: Date.now() };
        // angeklickter Tag (Monat, Ganztägig-Zeile) bzw. Tagesspalte (Woche/Tag)
        // in Bildschirmkoordinaten – das Schnellfenster erscheint daneben
        const cell = event.target?.closest?.("calendar-month-day-box, calendar-header-container, calendar-event-column");
        const r = cell?.getBoundingClientRect();
        lastClick.cell = cell || null;
        if (r?.width) {
          const column = cell.localName == "calendar-event-column";
          lastClick.rect = {
            left: r.left + w.mozInnerScreenX,
            width: r.width,
            // in der Spalte zählt nur die angeklickte Uhrzeit, nicht der ganze Tag
            top: column ? event.screenY : r.top + w.mozInnerScreenY,
            height: column ? 0 : r.height,
          };
        }
      };
      box.addEventListener("dblclick", onDbl, true);
      const orig = ctrl.createNewEvent;
      const self = this;
      ctrl.createNewEvent = function (calendar, startTime, endTime, forceAllday) {
        const fromDoubleClick = lastClick && Date.now() - lastClick.time < 1000;
        // gezogener Zeitraum oder Aufruf ohne Doppelklick (Menü, Tastatur): wie bisher
        if (!fromDoubleClick || (startTime && endTime && !startTime.isDate && !endTime.isDate)) {
          return orig.call(this, calendar, startTime, endTime, forceAllday);
        }
        const at = lastClick;
        lastClick = null;
        try {
          let start = null;
          let allDay = !!forceAllday;
          if (startTime) {
            start = cal.dtz.dateTimeToJsDate(startTime.isDate ? startTime : startTime.getInTimezone(cal.dtz.defaultTimezone));
            allDay ||= startTime.isDate;
          } else {
            // Monat: der angeklickte Tag, wie bei Apple ein ganztägiger Termin
            const day = w.currentView?.()?.selectedDay;
            if (day) {
              start = new Date(day.year, day.month, day.day);
              allDay = true;
            }
          }
          if (start && startTime && !startTime.isDate) {
            // auf die Viertelstunde abrunden
            start.setMinutes(Math.floor(start.getMinutes() / 15) * 15, 0, 0);
          }
          self.openQuickCreate(w, "event", null, { start, allDay, at, calendar });
        } catch (e) {
          log("quick double-click error", e);
          return orig.call(this, calendar, startTime, endTime, forceAllday);
        }
        return undefined;
      };
      this.restorers.push(() => {
        ctrl.createNewEvent = orig;
        box.removeEventListener("dblclick", onDbl, true);
        delete ctrl.__mcQuick;
      });
    };

    // Tooltip mit Erklärung an Kalendern, die iCloud mit ⚠️ markiert
    const hookCalendarNotes = () => {
      const list = w.document.getElementById("calendar-list");
      if (!list || list.__mcNotes) {
        return;
      }
      list.__mcNotes = true;
      const { cal } = ChromeUtils.importESModule("resource:///modules/calendar/calUtils.sys.mjs");
      const annotate = () => {
        for (const li of list.querySelectorAll("li[calendar-id]")) {
          // Kästchen wie Apple Kalender: Farbe und passende Hakenfarbe (Thunderbird
          // rechnet je Kalender Schwarz/Weiß aus) – heller Kalender, dunkler Haken
          const box = li.querySelector(".calendar-color");
          if (box && !box.style.getPropertyValue("--mc-cal-back")) {
            const key = cal.view.formatStringForCSSRule(li.getAttribute("calendar-id"));
            box.style.setProperty("--mc-cal-back", `var(--calendar-${key}-backcolor)`);
            box.style.setProperty("--mc-cal-fore", `var(--calendar-${key}-forecolor, white)`);
          }
          const note = calendarNote(cal.manager.getCalendarById(li.getAttribute("calendar-id")));
          const name = li.querySelector(".calendar-name");
          if (note && name?.getAttribute("title") != note) {
            name.setAttribute("title", note);
          } else if (!note && name?.hasAttribute("title")) {
            name.removeAttribute("title");
          }
        }
      };
      const mo = new w.MutationObserver(annotate);
      mo.observe(list, { childList: true, subtree: true, characterData: true });
      annotate();
      this.restorers.push(() => {
        mo.disconnect();
        delete list.__mcNotes;
        for (const name of list.querySelectorAll(".calendar-name[title]")) {
          name.removeAttribute("title");
        }
        for (const box of list.querySelectorAll(".calendar-color")) {
          box.style.removeProperty("--mc-cal-back");
          box.style.removeProperty("--mc-cal-fore");
        }
      });
    };

    // Thunderbird schreibt „Hier klicken, um eine neue Aufgabe hinzuzufügen“
    // als Wert ins Feld (nicht als Platzhalter) – markieren, damit er grau
    // wie ein Platzhalter erscheint
    const hookTaskHint = () => {
      for (const id of ["view-task-edit-field", "unifinder-task-edit-field"]) {
        const field = w.document.getElementById(id);
        if (!field || field.__mcHint) {
          continue;
        }
        field.__mcHint = true;
        const sync = () => w.setTimeout(() => field.toggleAttribute("mc-hint", !!field.showsInstructions), 0);
        for (const type of ["focus", "blur", "input"]) {
          field.addEventListener(type, sync);
        }
        sync();
        this.restorers.push(() => {
          for (const type of ["focus", "blur", "input"]) {
            field.removeEventListener(type, sync);
          }
          field.removeAttribute("mc-hint");
          delete field.__mcHint;
        });
      }
      // Thunderbird setzt den Hinweis auch ohne focus/blur (Wechsel des
      // Standardkalenders, Fensterstart) – dann über setupTaskField abgleichen;
      // showsInstructions setzt onBlur erst danach, daher setTimeout 0
      const te = w.taskEdit;
      if (te?.setupTaskField && !te.__mcHintWrapped) {
        const orig = te.setupTaskField;
        te.setupTaskField = function (target, ...rest) {
          const r = orig.call(this, target, ...rest);
          if (target?.__mcHint) {
            w.setTimeout(() => target.toggleAttribute("mc-hint", !!target.showsInstructions), 0);
          }
          return r;
        };
        te.__mcHintWrapped = true;
        this.restorers.push(() => {
          te.setupTaskField = orig;
          delete te.__mcHintWrapped;
        });
      }
    };

    // Beschreibung im Detailbereich der Aufgaben: eigenes Inhaltsdokument
    // (about:blank), das theme.css nicht erreicht – dunkel stand sie schwarz
    // auf dunkler Fläche, hell in der Inhaltsschrift mit 8 px Rand. Benutzer-
    // Stylesheet einmal je Dokument (Thunderbird tauscht nur den Inhalt aus)
    const hookTaskDescription = () => {
      const d = w.document;
      const frame = d.getElementById("calendar-task-details-description");
      if (!frame || frame.__mcDescHooked) {
        return;
      }
      frame.__mcDescHooked = true;
      const uri = `resource://mailcards/taskdesc.css?v=${extensionVersion}`;
      const apply = () => {
        const cw = frame.contentWindow;
        if (!cw || cw.__mcDesc == uri || !Services.prefs.getBoolPref("extensions.mailcards.bundledTheme", true)) {
          return;
        }
        try {
          cw.windowUtils.loadSheetUsingURIString(uri, cw.windowUtils.USER_SHEET);
          cw.__mcDesc = uri;
        } catch (e) {
          log("task description sheet error", String(e).slice(0, 120));
        }
      };
      const tree = d.getElementById("calendar-task-tree");
      frame.addEventListener("load", apply, true);
      tree?.addEventListener("select", apply);
      apply();
      this.restorers.push(() => {
        frame.removeEventListener("load", apply, true);
        tree?.removeEventListener("select", apply);
        const cw = frame.contentWindow;
        if (cw?.__mcDesc) {
          try {
            cw.windowUtils.removeSheetUsingURIString(cw.__mcDesc, cw.windowUtils.USER_SHEET);
          } catch {} // gewollt: Stylesheet schon entfernt
          delete cw.__mcDesc;
        }
        delete frame.__mcDescHooked;
      });
    };

    // Kalender und Aufgaben: ein „+“ wie in Apple Kalender – öffnet gleich das
    // Schnellfenster (der zweite Knopf ist per CSS ausgeblendet)
    const hookNewButton = () => {
      const d = w.document;
      const bar = d.querySelector("unified-toolbar");
      if (!bar || bar.__mcNewHooked) {
        return;
      }
      bar.__mcNewHooked = true;
      let lastAnchor = null;
      // Popover wie in Apple Kalender: zwei runde Symbole mit Beschriftung
      const popup = d.createXULElement("panel");
      popup.id = "mcNewPopup";
      popup.setAttribute("type", "arrow");
      popup.setAttribute("noautofocus", "true");
      // am Bildschirmrand einschieben statt umklappen: beim Umklappen dreht
      // Gecko auch den Versatz um (28 px), das Popover rutschte dann ganz neben
      // das „+“ und der Pfeil zeigte daneben (maximiertes Fenster)
      popup.setAttribute("flip", "slide");
      const NS = "http://www.w3.org/1999/xhtml";
      const box = d.createElementNS(NS, "div");
      box.className = "mc-pop";
      const ICONS = {
        // Kalenderblatt mit Uhr
        event: '<rect x="3.5" y="5" width="15" height="13.5" rx="2.4"/><path d="M3.5 9.2h15M7.6 3.2v3.2M14.4 3.2v3.2"/><circle cx="17.6" cy="17.6" r="4.4" fill="var(--mc-pop-icon-bg)"/><path d="M17.6 15.6v2.2l1.4 0.9"/>',
        // Liste mit abgehaktem und offenem Punkt
        task: '<circle cx="6" cy="7.5" r="2.4"/><path d="M4.9 7.5l0.8 0.8 1.4-1.6"/><circle cx="6" cy="16.5" r="2.4"/><path d="M11 7.5h9M11 16.5h9"/>',
      };
      for (const [id, label, icon, command] of [
        ["mcNewEvent", tr("New Event"), "event", "calendar_new_event_command"],
        ["mcNewTask", tr("New Task"), "task", "calendar_new_todo_command"],
      ]) {
        const btn = d.createElementNS(NS, "button");
        btn.id = id;
        btn.className = "mc-pop-item";
        const circle = d.createElementNS(NS, "span");
        circle.className = "mc-pop-icon";
        // festes, eingebautes Symbol – per DOMParser statt innerHTML
        const svg = new w.DOMParser().parseFromString(
          `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${ICONS[icon]}</svg>`,
          "image/svg+xml"
        ).documentElement;
        circle.append(d.importNode(svg, true));
        const text = d.createElementNS(NS, "span");
        text.className = "mc-pop-label";
        text.textContent = label;
        btn.append(circle, text);
        btn.addEventListener("click", () => {
          popup.hidePopup();
          this.openQuickCreate(w, command == "calendar_new_todo_command" ? "task" : "event", lastAnchor);
        });
        box.append(btn);
      }
      popup.append(box);
      (d.getElementById("mainPopupSet") || d.documentElement).append(popup);
      const onClick = event => {
        const li = event.target.closest?.('li[item-id="new-event"]');
        const mode = d.getElementById("tabmail")?.currentTabInfo?.mode?.name;
        if (!li || (mode != "calendar" && mode != "tasks")) {
          return;
        }
        event.preventDefault();
        event.stopPropagation();
        // im Kalender gleich ein neuer Termin, in den Aufgaben gleich eine
        // neue Aufgabe (die Auswahl gibt es über das „+“ der Today-Pane)
        this.openQuickCreate(w, mode == "tasks" ? "task" : "event", li);
      };
      bar.addEventListener("click", onClick, true);
      // dasselbe Popover über einem Knopf unten (Today-Pane): nach oben, mittig
      const above = anchor => {
        if (popup.state == "open" || popup.state == "showing") {
          popup.hidePopup();
          return;
        }
        popup.classList.add("mc-up");
        lastAnchor = anchor;
        const width = 294; // Breite des Popovers samt Rand für den Schatten
        // am Bildschirmrand schiebt Gecko es ein – Pfeil danach nachmessen
        popup.addEventListener("popupshown", () => aimArrow(anchor), { once: true });
        popup.openPopup(anchor, "before_start", Math.round(anchor.getBoundingClientRect().width / 2 - width / 2), 12);
      };
      // Pfeil über die Mitte des Knopfs – nach dem Öffnen gemessen, so stimmt
      // er auch, wenn Gecko das Popover am Bildschirmrand verschiebt (höchstens
      // bis 20 px vor die runden Ecken)
      // (in Bildschirmkoordinaten: unter Windows hat der Inhalt des Popovers
      // eigene Koordinaten, der Vergleich mit dem Knopf lag 300 px daneben)
      const aimArrow = anchor => {
        const a = anchor.getBoundingClientRect();
        const b = box.getBoundingClientRect();
        if (!a.width || !b.width) {
          return;
        }
        const mid = w.mozInnerScreenX + a.left + a.width / 2;
        const p = popup.getBoundingClientRect(), outer = popup.getOuterScreenRect();
        const left = outer.left + (b.left - p.left), right = left + b.width;
        const x = w.getComputedStyle(box).direction == "rtl" ? right - mid - 7 : mid - left - 7;
        box.style.setProperty("--mc-arrow-x", `${Math.round(Math.min(Math.max(x, 20), b.width - 34))}px`);
      };
      // dasselbe Popover unter dem „+“ oben rechts in der Today-Pane:
      // rechtsbündig, um 28 px nach rechts versetzt – sonst läge die Mitte des
      // Knopfs in der runden Ecke und der Pfeil zeigte 240 px daneben
      const below = anchor => {
        if (popup.state == "open" || popup.state == "showing") {
          popup.hidePopup();
          return;
        }
        popup.classList.remove("mc-up");
        lastAnchor = anchor;
        popup.addEventListener("popupshown", () => aimArrow(anchor), { once: true });
        // am Bildschirmrand schiebt Gecko das Popover ein (flip="slide"), der
        // Pfeil wird danach in aimArrow nachgemessen
        popup.openPopup(anchor, "after_end", 28, 6);
      };
      newPopup = { above, below };
      const onHidden = () => {
        popup.classList.remove("mc-up");
        box.style.removeProperty("--mc-arrow-x");
      };
      popup.addEventListener("popuphidden", onHidden);
      this.restorers.push(() => {
        bar.removeEventListener("click", onClick, true);
        popup.removeEventListener("popuphidden", onHidden);
        popup.remove();
        delete bar.__mcNewHooked;
        newPopup = null;
      });
    };

    // Today-Pane: Titel „Today Pane“ (statt „Termine“/„Aufgaben“) und der Knopf
    // „Neuer Termin“ gleich rechts daneben in der Kopfzeile
    const hookTodayPaneHeader = () => {
      const d = w.document;
      const header = d.getElementById("today-pane-header");
      const button = d.getElementById("todaypane-new-event-button");
      if (!header || header.dataset.mcTitle) {
        return;
      }
      header.dataset.mcTitle = tr("Today Pane");
      const home = button?.parentElement;
      const next = button?.nextSibling;
      // ganz unten in der Today-Pane, unter den Einträgen: ein „+“ wie im
      // Kalender, das nach Termin oder Aufgabe fragt
      const panel = d.getElementById("today-pane-panel");
      const savedCommand = button?.getAttribute("command");
      const onPlus = event => {
        event.preventDefault();
        event.stopPropagation();
        newPopup?.above(button);
      };
      if (button && panel) {
        panel.append(button);
        button.removeAttribute("command");
        button.addEventListener("click", onPlus);
      }
      this.restorers.push(() => {
        delete header.dataset.mcTitle;
        if (button && home) {
          button.removeEventListener("click", onPlus);
          if (savedCommand) {
            button.setAttribute("command", savedCommand);
          }
          home.insertBefore(button, next);
        }
      });
    };

    // „Heute“ in der Sprache der Oberfläche (Thunderbird hat dafür nur einen Tooltip)
    const labelToday = () => {
      const btn = w.document.getElementById("todayViewButton");
      if (!btn || btn.dataset.mcLabel) {
        return;
      }
      let text = "Today";
      try {
        text = new Intl.RelativeTimeFormat(Services.locale.appLocaleAsBCP47, { numeric: "auto" }).format(0, "day");
        text = text.charAt(0).toLocaleUpperCase(Services.locale.appLocaleAsBCP47) + text.slice(1);
      } catch {} // gewollt: Sprache nicht ermittelbar, es bleibt „Today“
      btn.dataset.mcLabel = text;
    };

    // Kalender-Titel wie in Apple Kalender: Monat fett, Jahreszahl dünn
    const hookTitle = () => {
      const el = w.document.getElementById("intervalDescription");
      if (!el || el.__mcTitle) {
        return;
      }
      el.__mcTitle = true;
      // Woche wie Apple Kalender nur Monat und Jahr („November 2026“, über
      // einen Monatswechsel „Nov. – Dez. 2026“) statt „Sonntag, 1. November –
      // Samstag, 7. November 2026“ – passt auch ins schmale Fenster
      const weekTitle = () => {
        try {
          const view = w.currentView?.();
          // Mehrwochen-Ansicht beim Scrollen (Schritt 4/6): der Monat, der oben steht
          const top = (view?.wrappedJSObject || view)?.__mcTopMonth;
          if (view?.id == "multiweek-view" && view.hasAttribute("mc-mw-scroll") && top >= 0) {
            return monthTitle(top);
          }
          if (view?.id != "week-view" || !view.startDate || !view.endDate) {
            return null;
          }
          const js = dt => new Date(dt.year, dt.month, dt.day);
          const a = js(view.startDate), b = js(view.endDate);
          const locale = Services.locale.appLocalesAsBCP47[0];
          if (a.getMonth() == b.getMonth() && a.getFullYear() == b.getFullYear()) {
            return new Intl.DateTimeFormat(locale, { month: "long", year: "numeric" }).format(a);
          }
          const short = new Intl.DateTimeFormat(locale, { month: "short", year: "numeric" });
          return a.getFullYear() == b.getFullYear()
            ? `${new Intl.DateTimeFormat(locale, { month: "short" }).format(a)} – ${short.format(b)}`
            : `${short.format(a)} – ${short.format(b)}`;
        } catch {
          return null;
        }
      };
      const split = () => {
        if (el.querySelector(".mc-year")) {
          return;
        }
        const week = weekTitle();
        if (week && el.textContent != week) {
          // ganzer Zeitraum weiter beim Überfahren
          el.dataset.mcLong = el.textContent;
          el.setAttribute("title", el.textContent);
          el.textContent = week;
        } else if (!week) {
          delete el.dataset.mcLong;
          el.removeAttribute("title");
        }
        const m = el.textContent.match(/^(.*\S)(\s+)(\d{4})\s*$/s);
        if (!m) {
          return;
        }
        const year = w.document.createElement("span");
        year.className = "mc-year";
        year.textContent = m[3];
        el.replaceChildren(m[1] + m[2], year);
      };
      const mo = new w.MutationObserver(split);
      mo.observe(el, { childList: true, characterData: true, subtree: true });
      split();
      this.restorers.push(() => {
        mo.disconnect();
        el.textContent = el.dataset.mcLong || el.textContent;
        delete el.dataset.mcLong;
        el.removeAttribute("title");
        delete el.__mcTitle;
      });
    };

    // Tag und Woche: Cmd + Mausrad (oder Zwei-Finger-Zoom) ändert wie
    // Cmd+Plus/Minus den Stundenabstand
    const hookMultidayZoom = () => {
      for (const id of ["day-view", "week-view"]) {
        const view = w.document.getElementById(id);
        if (!view || view.__mcZoom || typeof view.zoomIn != "function") {
          continue;
        }
        view.__mcZoom = true;
        let acc = 0;
        const STEP = 40; // Pixel Mausrad pro Zoomstufe
        const zoom = delta => {
          acc += delta;
          while (Math.abs(acc) >= STEP) {
            // wie Cmd+Plus/Minus: nach oben = größer (weniger Stunden sichtbar)
            if (acc < 0) {
              view.zoomOut();
              acc += STEP;
            } else {
              view.zoomIn();
              acc -= STEP;
            }
          }
        };
        const onWheel = event => {
          if (!event.metaKey && !event.ctrlKey) {
            return;
          }
          event.preventDefault();
          event.stopPropagation();
          const px = event.deltaMode == 1 ? event.deltaY * 16 : event.deltaMode == 2 ? event.deltaY * 400 : event.deltaY;
          zoom(px);
        };
        const onGesture = event => {
          event.preventDefault();
          zoom(-event.delta * 2);
        };
        view.addEventListener("wheel", onWheel, { passive: false, capture: true });
        view.addEventListener("MozMagnifyGestureUpdate", onGesture);
        this.restorers.push(() => {
          view.removeEventListener("wheel", onWheel, { capture: true });
          view.removeEventListener("MozMagnifyGestureUpdate", onGesture);
          delete view.__mcZoom;
        });
      }
    };

    // Menü „Markieren“ der Toolbar (Pfeil neben dem Stern): darunter die
    // Schlagwörter, wie im Menü „Schlagwort“ – so lassen sie sich auch beim
    // Lesen einer Nachricht setzen, seit das Kontextmenü sie nicht mehr zeigt.
    // Thunderbirds InitMessageTags baut die Einträge (ersetzt alle Menüpunkte
    // nach dem letzten Trenner), TagMenus gibt ihnen das Aussehen
    const hookMarkTags = () => {
      const d = w.document;
      const popup = d.getElementById("toolbarMarkPopup");
      if (!popup || popup.__mcTags || typeof w.InitMessageTags != "function") {
        return;
      }
      popup.__mcTags = true;
      const sep = d.createXULElement("menuseparator");
      sep.id = "mcMarkTagsSeparator";
      popup.append(sep);
      const fill = event => {
        if (event.target != popup) {
          return; // Untermenüs
        }
        try {
          w.InitMessageTags(popup);
        } catch (e) {
          // keine Nachricht gewählt: alte Einträge weg, Trenner aus
          while (popup.lastElementChild != sep) {
            popup.lastElementChild.remove();
          }
          log("mark tags", e);
        }
        sep.hidden = popup.lastElementChild == sep;
      };
      popup.addEventListener("popupshowing", fill);
      this.restorers.push(() => {
        popup.removeEventListener("popupshowing", fill);
        while (popup.lastElementChild && popup.lastElementChild != sep) {
          popup.lastElementChild.remove();
        }
        sep.remove();
        delete popup.__mcTags;
      });
    };

    const scan = () => {
      this.styleSearch(w); // vor markTab, damit der Platzhalter des Bereichs gleich gilt
      markTab();
      decorateAgenda();
      hookMonthView();
      hookMultiweekBuffer(w.document.getElementById("multiweek-view"), this.restorers);
      hookMultidayZoom();
      hookNewButton();
      hookCalendarNotes();
      hookCalendarEmoji();
      hookItemTooltip();
      hookTaskPlaceholders();
      hookTasksEmpty();
      hookCalendarDoubleClick();
      hideUnifinderOnce();
      hookTaskHint();
      hookTaskDescription();
      hookTitle();
      labelToday();
      hookTodayPaneHeader();
      hookEscape();
      hookSidebarButton();
      hookSidebarKey();
      hookTodayKey();
      hookSpacesToggle();
      hookSideFloat();
      hookGlow();
      hookMarkTags();
      UpdateNote.hook(w, this.restorers);
      FifthSpace.attach(w, this.restorers);
      hookLooseTabs(w, this.restorers);
      hookTodayToggle();
      hookSplitterReset(w.document);
      hookListHeader();
      hookChatNicklist();
      hookSpacesOrder();
      this.updateListHeader(w);
      hookStarButton();
      this.updateStarButton(w);
      const tabmail = w.document.getElementById("tabmail");
      for (const tab of tabmail?.tabInfo || []) {
        const cw = tab.chromeBrowser?.contentWindow;
        if (cw && cw.location?.href == "about:3pane") {
          hookSplitterReset(cw.document);
          this.patch(cw, 0);
        }
      }
    };
    scan();
    let runs = 0;
    const interval = w.setInterval(() => {
      scan();
      if (++runs >= 30) {
        w.clearInterval(interval);
      }
    }, 1000);
    const monitor = {
      monitorName: "mail-cards",
      onTabOpened: () => w.setTimeout(scan, 300),
      onTabSwitched: () => {
        scan(); // ruft markTab() selbst auf
        w.setTimeout(hookEscape, 800); // Inhalt des neuen Tabs ist evtl. erst jetzt geladen
      },
      onTabTitleChanged() {},
      onTabClosing() {},
      onTabPersist() {},
      onTabRestored() {},
    };
    const attach = () => {
      const tabmail = w.document.getElementById("tabmail");
      if (tabmail?.registerTabMonitor) {
        tabmail.registerTabMonitor(monitor);
        this.restorers.push(() => tabmail.unregisterTabMonitor(monitor));
      } else {
        w.setTimeout(attach, 500);
      }
    };
    attach();
    w.addEventListener("unload", () => this.mainWindows.delete(w), { once: true });
    this.restorers.push(() => w.document.documentElement.removeAttribute("mc-mail"));
    this.restorers.push(() => w.document.documentElement.removeAttribute("mc-tab"));
    this.restorers.push(() => w.clearInterval(interval));
  }

  stop() {
    for (const timer of ["previewTimer", "fullTimer", "refreshTimer"]) {
      clearTimeout(this[timer]);
      this[timer] = null;
    }
    ExtensionSupport.unregisterWindowListener("mail-cards");
    this.mainWindows.clear();
    for (const restore of this.restorers.splice(0)) {
      try {
        restore();
      } catch {}
    }
    this.windows.clear();
    // offenes Info-Fenster schließen: es überlebt sonst ein Update ohne Neustart mit der alten Seite und dem
    // alten Code, und „halo.spaces“ im Menü holt nur dieses Fenster nach vorn (mit 3.26.0 fehlte so
    // „Recommend“ bis zum Neustart)
    for (const win of [...Services.wm.getEnumerator(null)]) {
      if (win.location?.href.startsWith("resource://mailcards/about/halo.html") && !win.closed) {
        try {
          win.close();
        } catch {}
      }
    }
  }

  anyWindow() {
    for (const w of this.windows) {
      if (!w.closed) {
        return w;
      }
      this.windows.delete(w);
    }
    return null;
  }
}

// Teile von CardEnhancer in eigenen Dateien neben dieser (api/…): Oberfläche
// und Symbolleisten (oberflaeche.js), Kalender und Today-Pane
// (kalenderfenster.js), halo.spaces-Fenster (halofenster.js), Mailliste und
// Ordner (mailliste.js), Karten, Suche und Vorschau (mailkarten.js). Ihre
// Methoden kommen unverändert (gleiche Eigenschaften wie Klassenmethoden) auf
// CardEnhancer.prototype; ein Name doppelt wäre ein Fehler beim Zerlegen
loadPart("oberflaeche.js");
loadPart("kalenderfenster.js");
loadPart("halofenster.js");
loadPart("mailliste.js");
loadPart("mailkarten.js");
for (const teil of [EnhancerOberflaeche, EnhancerKalender, EnhancerHaloFenster, EnhancerMailliste, EnhancerMailkarten]) {
  for (const [name, desc] of Object.entries(Object.getOwnPropertyDescriptors(teil.prototype))) {
    if (name == "constructor") {
      continue;
    }
    if (Object.hasOwn(CardEnhancer.prototype, name)) {
      throw new Error(`CardEnhancer.${name} doppelt (${teil.name})`);
    }
    Object.defineProperty(CardEnhancer.prototype, name, desc);
  }
}

// ---------------------------------------------------------------------------
// WebExtension-Experiment
// ---------------------------------------------------------------------------

// Einstellungen der Optionsseite: Schlüssel → Pref (Typ), nur diese sind erlaubt
// (Vorschauzeilen: Menü Ansicht, Geburtstage: Häkchen in der Kalenderliste)
const SETTINGS = {
  unreadTint: [UNREAD_TINT_PREF, "bool", false],
  sidebarGlow: [GLOW_PREF, "bool", true],
  earlyTheme: [EARLY_THEME_PREF, "bool", false],
  composeFormatBar: [COMPOSE_FORMAT_PREF, "bool", false],
  fullConversation: [CONVERSATION_PREF, "bool", true],
  conversationNewestFirst: [CONVERSATION_NEWEST_PREF, "bool", true],
  calendarEmoji: [EMOJI_PREF, "bool", true],
  emojiCustom: [EMOJI_CUSTOM_PREF, "string", ""],
  macContactPhotos: [MAC_PHOTOS_PREF, "bool", false],
  senderLogos: [SENDER_LOGOS_PREF, "bool", true],
  plainTextSystemFont: [PLAIN_TEXT_PREF, "bool", true],
  calendarOffline: ["extensions.mailcards.calendarOffline", "bool", false],
  debug: ["extensions.mailcards.debug", "bool", false],
  // Thunderbirds eigene Umfärbung von HTML-Mails im Dunkelmodus (ab Thunderbird 13x);
  // ihr Schalter im Mailkopf ist ausgeblendet, eingestellt wird hier wie in Apple Mail
  darkMessages: ["mail.dark-reader.enabled", "bool", true],
  undoSend: [UNDO_SEND_PREF, "int", 10],
  followUp: [FOLLOWUP_PREF, "bool", true],
  weather: [WEATHER_PREF, "bool", false],
  weatherPlace: [WEATHER_PLACE_PREF, "string", ""],
  fifthSpace: [FIFTH_PREF, "string", "chat"],
  fifthSpaceAddon: [FIFTH_ADDON_PREF, "string", ""],
  fifthSpaceUrl: [FIFTH_URL_PREF, "string", ""],
};
// Voraussetzungen einzelner Optionen (needs in options/sections.js)
function settingNeeds() {
  return { darkReader: Services.prefs.getPrefType("mail.dark-reader.enabled") != Services.prefs.PREF_INVALID };
}
function readSetting([pref, type, def]) {
  if (type == "bool") return Services.prefs.getBoolPref(pref, def);
  if (type == "int") return Services.prefs.getIntPref(pref, def);
  return Services.prefs.getStringPref(pref, def);
}

var enhancer = null;
var extensionRoot = null; // rootURI der Erweiterung, für resource://mailcards/
var extensionVersion = ""; // hängt an den Stylesheet-Adressen, damit ein Update sofort greift
// Projektseite, einzige Quelle ist homepage_url im Manifest (Weiterempfehlen im Info-Fenster)
var extensionHomepage = "";
var extensionBaseURL = ""; // moz-extension://…/ – für die eingebettete Einstellungsseite

this.mailCards = class extends ExtensionCommon.ExtensionAPI {
  getAPI(context) {
    return {
      mailCards: {
        // Übersetzungstabelle für die Einstellungsseite (Schlüssel = englischer Text)
        async getTranslations() {
          const lang = uiLanguage();
          return { lang, table: TRANSLATIONS[lang] || {} };
        },
        async updateReady(version) {
          UpdateNote.set(version, true);
        },
        async getPendingUpdate() {
          return UpdateNote.pending;
        },
        async installUpdateNow() {
          return UpdateNote.installNow();
        },
        async getSettings() {
          const out = { mac: Services.appinfo.OS == "Darwin", german: Services.locale.appLocaleAsBCP47.startsWith("de"), ...settingNeeds() };
          for (const [key, spec] of Object.entries(SETTINGS)) {
            out[key] = readSetting(spec);
          }
          out.spacesOrderCustom = SpacesOrder.isCustom();
          out.thanksDue = Thanks.due();
          // fünfter Bereich: Bereiche fremder Erweiterungen zur Auswahl
          out.fifthSpaceAddons = FifthSpace.addonSpaces(Services.wm.getMostRecentWindow("mail:3pane"))
            .map(a => ({ value: a.name, label: a.title }));
          // wie im Hilfe-Fenster: eingerichtete Fotos gelten auch ohne Pref als an
          out.macContactPhotos = await MacPhotos.enabled();
          // Wetter: Ort und Zustand für die Zeile unter dem Ortsfeld
          const wst = Weather.status();
          out.weatherStatus = wst.text;
          out.weatherTone = wst.tone;
          out.weatherLink = !!wst.link;
          out.weatherCode = out.weather ? Weather.state().status || "" : "";
          out.weatherRecent = Weather.recent();
          return out;
        },
        // „Danke sagen“ in den Einstellungen: Spendenseite öffnen, Erinnerung erledigt
        async sayThanks() {
          Thanks.open(Services.wm.getMostRecentWindow("mail:3pane"));
        },
        // Wetter: Ortsvorschläge beim Tippen und gewählten Ort übernehmen
        async searchPlaces(text) {
          return Weather.search(Services.wm.getMostRecentWindow("mail:3pane"), text);
        },
        async choosePlace(place) {
          await Weather.choose(place);
        },
        async openLocationSettings() {
          openLocationSettings();
        },
        async setSetting(key, value) {
          // Knopf „Reset“ in der Fehlerbehebung: ursprüngliche Reihenfolge der
          // Bereiche (geändert wird sie per Ziehen in der Leiste)
          if (key == "spacesOrderReset") {
            if (value) {
              Services.prefs.clearUserPref(SPACES_ORDER_PREF);
            }
            return SpacesOrder.isCustom();
          }
          const spec = SETTINGS[key];
          if (!spec) {
            throw new Error(`unknown setting ${key}`);
          }
          const [pref, type, def] = spec;
          // fünfter Bereich: nur bekannte Werte, Adresse nur http(s)
          if (key == "fifthSpace" && !FIFTH_CHOICES.includes(value)) throw new Error("not a choice");
          if (key == "fifthSpaceUrl") {
            const url = FifthSpace.normalizeURL(value);
            if (url === null) throw new Error("not a web address");
            value = url;
          }
          // Kontaktfotos immer ausdrücklich speichern: ohne Wert gälten sie als
          // an, sobald es mail-cards-photos/index.json gibt (MacPhotos.enabled)
          if ((value === null || value === def) && key != "macContactPhotos") {
            Services.prefs.clearUserPref(pref); // Standard: nichts im Profil speichern
          } else if (type == "bool") {
            Services.prefs.setBoolPref(pref, !!value);
          } else if (type == "int") {
            const n = Math.round(Number(value));
            if (!Number.isFinite(n)) throw new Error("not a number");
            if (key == "undoSend") {
              if (!UNDO_SEND_CHOICES.includes(n)) throw new Error("not a choice");
              Services.prefs.setIntPref(pref, n);
            } else {
              Services.prefs.setIntPref(pref, Math.max(0, Math.min(4, n)));
            }
          } else {
            Services.prefs.setStringPref(pref, String(value).slice(0, 10000));
          }
          if (key == "weather" || key == "weatherPlace") {
            await Weather.refresh(true); // Zeile unter dem Ortsfeld gleich mit Ergebnis
          }
          // Offline-Kopie gleich anlegen, nicht erst beim nächsten Start
          if (key == "calendarOffline" && value) {
            enableCalendarOffline();
          }
          if (key == "macContactPhotos") {
            if (value) {
              MacPhotos.sync();
            } else {
              // sofort keine Fotos mehr zeigen
              MacPhotos.byEmail.clear();
              MacPhotos.byName.clear();
              MacPhotos.version++;
              MacPhotos.listeners.forEach(fn => fn());
            }
          }
          return readSetting(spec);
        },
        async start(options) {
          extensionRoot ||= context.extension.rootURI;
          extensionVersion ||= context.extension.version;
          extensionBaseURL ||= context.extension.baseURL;
          if (enhancer) {
            return;
          }
          log("start", options || {}, Services.appinfo.version);
          enhancer = new CardEnhancer(options || {});
          enhancer.start();
        },
      },
    };
  }

  // Start direkt beim Programmstart („events: startup“ im Manifest) – ohne
  // Umweg über die Hintergrundseite. Thunderbird kann nach Updates eine
  // veraltete Hintergrundseite aus dem Zwischenspeicher laden; dann würde
  // background.js nie laufen. Die Hintergrundseite ist nur noch Reserve.
  onStartup() {
    if (enhancer) {
      return;
    }
    extensionRoot = this.extension.rootURI;
    extensionVersion = this.extension.version;
    extensionHomepage = this.extension.manifest.homepage_url || "";
    extensionBaseURL = this.extension.baseURL;
    log("start (onStartup)", { version: this.extension.version }, Services.appinfo.version);
    enhancer = new CardEnhancer({});
    enhancer.start();
  }

  onShutdown(isAppShutdown) {
    if (isAppShutdown) {
      return;
    }
    enhancer?.stop();
    enhancer = null;
  }
};
