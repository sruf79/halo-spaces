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
// IT und TRANSLATIONS – die Texte der Oberfläche; mail.js: Mail-Zusätze;
// bereiche.js: Bereiche und Hinweise (beide weiter unten geladen)
// ---------------------------------------------------------------------------
function loadPart(name) {
  const url = String(new Error().fileName).replace(/[^/]*$/, name);
  Services.scriptloader.loadSubScriptWithOptions(url, { target: globalThis, allowUnsafeURL: true });
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
// Reihenfolge wie in der Apple-Mail-Toolbar: Abrufen, Verfassen |
// Antworten, Allen antworten, Weiterleiten | Archiv, Löschen, Spam |
// Verschieben | Markieren … Suchfeld ganz rechts.
const APPLE_TOOLBAR = [
  "spacer",
  "get-messages",
  "write-message",
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
  const row = doc.createXULElement("hbox");
  row.setAttribute("align", "center");
  const label = doc.createXULElement("label");
  label.setAttribute("value", tr(IS_MAC ? "Light, dark or follow macOS" : "Light, dark or follow the system"));
  label.setAttribute("flex", "1");
  const list = doc.createXULElement("menulist");
  list.id = "mcAppearance";
  const popup = doc.createXULElement("menupopup");
  for (const [value, text] of [["auto", tr(IS_MAC ? "Automatic (like macOS)" : "Automatic (like the system)")], ["light", tr("Light")], ["dark", tr("Dark")]]) {
    const item = doc.createXULElement("menuitem");
    item.setAttribute("value", value);
    item.setAttribute("label", text);
    popup.appendChild(item);
  }
  list.appendChild(popup);
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
      list.selectedItem = null;
      list.setAttribute("label", "");
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
    const addon = await AddonManager.getAddonByID(APPEARANCE_THEMES[list.value]);
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
  const icon = menu("mcFifthSpaceIcon", v => setPref(FIFTH_ICON_PREF, "mask", v));
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
  row("icon", tr("Symbol"), icon);
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
    const wanted = getPref(FIFTH_ADDON_PREF, "");
    fillMenu(addon, spaces.map(a => [a.name, a.title]), spaces.some(a => a.name == wanted) ? wanted : spaces[0]?.name || "");
    fillMenu(icon, [["mask", tr("In the space colour")], ["original", tr("Original")]], FifthSpace.icon());
    if (doc.activeElement != url) {
      url.value = getPref(FIFTH_URL_PREF, "");
    }
    rows.addon.hidden = mode != "addon";
    rows.url.hidden = mode != "web";
    rows.icon.hidden = mode != "addon" && mode != "web";
    // Hinweis, solange Thunderbirds Chat-Einstellungen ausgeblendet sind
    const current = mode == "addon" ? spaces.find(a => a.name == wanted)?.title || addonText
      : mode == "web" ? getPref(FIFTH_URL_PREF, "") || tr("Website") : tr("Nothing");
    hint.textContent = tr("The chat settings appear here when Chat is chosen. Shown instead: {what}", { what: current });
    hint.hidden = mode == "chat";
    doc.documentElement.setAttribute("mc-fifth", mode);
  };
  fill();
  const prefs = [FIFTH_PREF, FIFTH_ADDON_PREF, FIFTH_URL_PREF, FIFTH_ICON_PREF];
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
  { value: "paneMcAddons", footer: "addonsButton", name: "Add-ons and Themes", src: "about:addons" },
  // Symbol ohne seine weiße Kachel; der Ausschnitt lässt den weichen Rand des Rings ganz drin (enger wirkte er dick und kantig)
  { value: "paneMcHalo", label: "halo.spaces", icon: "resource://mailcards/about/icon.svg", crop: "3 3 58 58", options: true },
];
const HALO_PANE = "paneMcHalo";
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
  // nicht übersetzt, der eigene (sonst fehlten die Kategorien ganz)
  const since = cw.__mcPrefSince || (cw.__mcPrefSince = Date.now());
  const late = Date.now() - since > 6000;
  const labelOf = pane => {
    const link = pane.footer ? doc.getElementById(pane.footer) : null;
    return pane.label || link?.querySelector(".sidebar-footer-label")?.textContent.trim() ||
      link?.querySelector(".sidebar-footer-label")?.getAttribute("value") || (late && pane.name ? tr(pane.name) : "");
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
    if (!label || (!pane.options && !host)) {
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
      if (pane.options) {
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
      const frame = haloBox.querySelector("browser");
      if (frame?.currentURI?.spec.startsWith(extensionBaseURL)) {
        frame.fixupAndLoadURIString(`${extensionBaseURL}options/options.html?in=prefs#s-${key}`,
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
    doc.documentElement.toggleAttribute("mc-embed", PREF_PANES.some(p => p.value == value));
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
  // gewählt, wird dieser eine verspätete Aufruf übergangen
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
  categories.addEventListener("select", selectStart, true);
  categories.addEventListener("select", selectEnd);
  if (typeof origGoto == "function") {
    cw.gotoPref = function (category, ...rest) {
      const late = !inSelect && !skipped && userPane && userPane != startPane && Date.now() - opened < 30000 &&
        (category == startPane || category == "paneGeneral");
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
// Wie Apple Mail: über der Spalte, in der die Maus gerade ist (Mailliste,
// geöffnete Mail, Kontaktliste, Kontaktkarte, Aufgaben, Kalender …), eine
// feine Linie unter der Toolbar-Zeile – nur solange die Maus dort ist und
// nur bei Spalten, die direkt unter der Toolbar-Zeile beginnen. Die Spalten
// liegen teils in eigenen Dokumenten (about:3pane, Adressbuch, Einstellungen):
// dort je ein Beobachter, angehängt beim ersten Bewegen bzw. Tab-Wechsel
// (nicht im Kalender: Toolbar und Monatskopf bilden dort eine ruhige Fläche
// wie im Kalender von Apple)
const HOVER_COLUMNS = [
  "#threadPane", "#messagePane", "#cardsPane", "#detailsPane",
  "#mcTaskCards", "#calendar-task-tree", "#calendar-task-details-container",
  ".paneDeckContainer", "#chat-conversations-box", "#conversationsBox",
].join(", ");
function hookHoverLine(w, restorers = null) {
  const d = w.document;
  const row = d.getElementById("unifiedToolbarContainer");
  if (!row || d.getElementById("mcHoverLine")) {
    return;
  }
  const tm = d.getElementById("tabmail");
  const line = d.createElementNS("http://www.w3.org/1999/xhtml", "div");
  line.id = "mcHoverLine";
  row.append(line);
  let shown = null, lastX = 0;
  const hide = () => {
    shown = null;
    line.removeAttribute("data-on");
  };
  const docs = new Set();
  // Spalte, die direkt unter der Toolbar-Zeile beginnt und an Stelle x liegt
  // (Spalten teils in eigenen Dokumenten: Lage plus Lage ihres Rahmens)
  const columnAt = x => {
    const rr = row.getBoundingClientRect();
    for (const doc of docs) {
      const frameEl = doc == d ? null : doc.defaultView?.frameElement;
      const frame = frameEl?.getBoundingClientRect();
      if (doc != d && !frame?.width) {
        continue;
      }
      // eingebettete Ansicht eines anderen Tabs (z. B. die Mail hinter dem
      // Kalender) behält ihre Größe – nur der gewählte Tab zählt
      const selected = tm?.panelContainer?.selectedPanel;
      if (frameEl && selected && frameEl.ownerDocument == d && !selected.contains(frameEl)) {
        continue;
      }
      for (const col of doc.querySelectorAll(HOVER_COLUMNS)) {
        // Spalten anderer Tabs liegen unsichtbar mit voller Größe darunter –
        // im Hauptfenster nur die des gewählten Tabs
        const panel = doc == d ? tm?.panelContainer?.selectedPanel : null;
        if (col.hidden || (panel && !panel.contains(col))) {
          continue;
        }
        const r = col.getBoundingClientRect();
        const left = r.left + (frame?.left || 0), top = r.top + (frame?.top || 0);
        if (r.width && r.height && Math.abs(top - rr.bottom) <= 4 && x >= left && x < left + r.width) {
          return { col, left, width: r.width };
        }
      }
    }
    return null;
  };
  const attach = doc => {
    if (!doc || docs.has(doc)) {
      return;
    }
    docs.add(doc);
    // höchstens einmal je Bild messen
    let pending = null, scheduled = false;
    const onMove = event => {
      pending = event.target;
      lastX = event.clientX;
      if (scheduled) {
        return;
      }
      scheduled = true;
      doc.defaultView.requestAnimationFrame(() => {
        scheduled = false;
        const target = pending;
        pending = null;
        // nur über der Toolbar-Zeile: die Linie gehört zur Spalte darunter
        // (unten in der Spalte selbst ist sie aus)
        // (das Ziel kann inzwischen in einem anderen, schon verworfenen
        // Dokument liegen – dann ist es kein Knoten mehr)
        let inside = false;
        try {
          inside = doc == d && !!target && row.contains(target);
        } catch {} // gewollt: Ziel liegt nicht mehr im Dokument
        if (!inside) {
          hide();
          return;
        }
        attachCurrent();
        const hit = columnAt(lastX);
        if (!hit) {
          hide();
          return;
        }
        if (hit.col == shown) {
          return;
        }
        const rr = row.getBoundingClientRect();
        shown = hit.col;
        line.style.left = `${Math.round(hit.left - rr.left)}px`;
        line.style.width = `${Math.round(hit.width)}px`;
        line.setAttribute("data-on", "");
      });
    };
    const onLeave = event => {
      if (!event.relatedTarget) {
        hide();
      }
    };
    doc.addEventListener("mousemove", onMove, { passive: true });
    doc.documentElement?.addEventListener("mouseleave", onLeave);
    const detach = () => {
      doc.removeEventListener("mousemove", onMove);
      doc.documentElement?.removeEventListener("mouseleave", onLeave);
      docs.delete(doc);
    };
    doc.defaultView.addEventListener("unload", detach, { once: true });
    restorers?.push(detach);
  };
  // Dokumente des gewählten Tabs (die Mailansicht lädt nach dem Start neu)
  const attachCurrent = () => {
    const tab = tm?.currentTabInfo;
    attach(tab?.chromeBrowser?.contentDocument);
    attach(tab?.browser?.contentDocument);
  };
  const attachTab = () => {
    hide();
    attachCurrent();
  };
  attach(d);
  attachTab();
  tm?.tabContainer?.addEventListener("TabSelect", attachTab);
  // Inhalte laden nach (Adressbuch, Einstellungen): beim ersten Bewegen über dem Rahmen anhängen
  const onFrameEnter = () => attachTab();
  tm?.addEventListener("mouseover", onFrameEnter, { passive: true });
  restorers?.push(() => {
    tm?.tabContainer?.removeEventListener("TabSelect", attachTab);
    tm?.removeEventListener("mouseover", onFrameEnter);
    line.remove();
  });
}

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

// Leseansicht wie Apple Mail: die ganze Konversation – empfangene und eigene
// Mails aus allen Ordnern (globaler Suchindex), neueste oben – als Karten
// untereinander, jede mit Thunderbirds vollständiger Mailansicht (about:message).
// Thunderbird zeigt sonst nur die gewählte Mail bzw. bei einem zugeklappten
// Faden eine Textzusammenfassung. Ohne Suchindex: die Mails des Fadens im
// Ordner mit Hinweis. Einstellung „Show whole conversation“ (Standard an)
const CONVERSATION_PREF = "extensions.mailcards.fullConversation";
// Reihenfolge wie Apple Mail „Neueste Nachricht oben anzeigen“ (Standard an)
const CONVERSATION_NEWEST_PREF = "extensions.mailcards.conversationNewestFirst";
const CONVERSATION_MAX = 30;
// frühere Schnellantwort unter der Mail (entfernt): alte Einstellung beim Start löschen
const QUICK_REPLY_PREF = "extensions.mailcards.quickReply";
class ConversationCards {
  constructor(win, pane) {
    this.win = win;
    this.pane = pane;
    this.seq = 0;
    this.box = null;
  }

  enabled() {
    return Services.prefs.getBoolPref(CONVERSATION_PREF, true);
  }

  hdrFromURI(uri) {
    try {
      return MailServices.messageServiceFromURI(uri).messageURIToMsgHdr(uri);
    } catch {
      return null;
    }
  }

  // eigene Adressen (alle Identitäten) – eigene Mails werden abgesetzt
  ownAddresses() {
    const set = new Set();
    for (const id of MailServices.accounts.allIdentities) {
      if (id.email) {
        set.add(id.email.toLowerCase());
      }
    }
    return set;
  }

  // alle Mails der Konversation: Suchindex (alle Ordner), sonst Faden im Ordner
  async collect(hdr) {
    let list = [];
    let indexed = false;
    if (Services.prefs.getBoolPref("mailnews.database.global.indexer.enabled", false)) {
      try {
        list = await this.fromGloda(hdr);
        indexed = list.length > 0;
      } catch (e) {
        log("conversation gloda error", e);
      }
    }
    if (!indexed) {
      list = this.fromThread(hdr);
    }
    // gleiche Mail in mehreren Ordnern (Gmail „Alle Nachrichten“, Gesendet) nur
    // einmal – lieber nicht aus Papierkorb/Spam, die gewählte Mail behält ihren Ordner
    const F = Ci.nsMsgFolderFlags;
    const rank = m => (m == hdr ? -1 : m.folder?.getFlag(F.Trash) || m.folder?.getFlag(F.Junk) ? 2 :
      m.folder?.getFlag(F.Archive) || /all mail|alle nachrichten/i.test(m.folder?.name || "") ? 1 : 0);
    const byId = new Map();
    for (const m of list) {
      if (!m) {
        continue;
      }
      const key = m.messageId || m.folder?.getUriForMsg(m);
      const prev = byId.get(key);
      if (!prev || rank(m) < rank(prev)) {
        byId.set(key, m);
      }
    }
    const out = [...byId.values()].filter(m => m == hdr || !(m.folder?.getFlag(F.Trash) || m.folder?.getFlag(F.Junk)));
    // die neuesten 30 behalten, auch wenn die älteste oben stehen soll
    out.sort((a, b) => b.date - a.date);
    const messages = out.slice(0, CONVERSATION_MAX);
    if (!Services.prefs.getBoolPref(CONVERSATION_NEWEST_PREF, true)) {
      messages.reverse();
    }
    return { messages, indexed };
  }

  fromGloda(hdr) {
    const { Gloda } = ChromeUtils.importESModule("resource:///modules/gloda/GlodaPublic.sys.mjs");
    return new Promise(resolve => {
      const timer = setTimeout(() => resolve([]), 3000);
      const done = items => {
        clearTimeout(timer);
        resolve(items);
      };
      const noop = { onItemsAdded() {}, onItemsModified() {}, onItemsRemoved() {} };
      Gloda.getMessageCollectionForHeader(hdr, {
        ...noop,
        onQueryCompleted: collection => {
          const conversation = collection.items[0]?.conversation;
          if (!conversation) {
            done([]);
            return;
          }
          conversation.getMessagesCollection({
            ...noop,
            onQueryCompleted: msgs => done(msgs.items.map(m => m.folderMessage).filter(Boolean)),
          });
        },
      });
    });
  }

  fromThread(hdr) {
    try {
      const thread = this.win.gDBView?.getThreadContainingMsgHdr(hdr) || hdr.folder?.msgDatabase?.getThreadContainingMsgHdr(hdr);
      if (!thread) {
        return [hdr];
      }
      const list = [];
      for (let i = 0; i < thread.numChildren; i++) {
        list.push(thread.getChildHdrAt(i));
      }
      return list;
    } catch {
      return [hdr];
    }
  }

  hide() {
    this.seq++;
    this.reveal();
    if (this.box) {
      this.observer?.disconnect();
      this.retire(this.box);
      this.box = null;
    }
  }

  // Karten entfernen. Eine Mailansicht (about:message), die noch lädt, darf
  // nicht mitten im Laden entfernt werden: Thunderbirds Aufräumen beim
  // Entladen meldet sonst Fehler (es meldet Beobachter ab, die erst am Ende
  // des Ladens angemeldet werden) – beim schnellen Durchklicken von
  // Konversationen. Solche Karten unsichtbar fertig laden lassen, dann weg.
  retire(box) {
    if (!box) {
      return;
    }
    const loading = [...box.querySelectorAll("browser.mc-conv-browser")].filter(b => {
      const d = b.contentDocument;
      return !(d?.documentURI?.startsWith("about:message") && d.readyState == "complete");
    });
    if (!loading.length) {
      box.remove();
      return;
    }
    // aus Ansicht, Stil und Abfragen nehmen; geladene Karten zeigen keine Mail mehr an
    box.removeAttribute("id");
    box.style.cssText = "position: fixed; left: -10000px; top: 0; width: 1px; height: 1px; overflow: hidden; visibility: hidden; pointer-events: none;";
    for (const card of box.querySelectorAll(".mc-conv-card")) {
      card.__mcLoaded = true;
      card.classList.remove("mc-conv-card", "mc-selected");
    }
    const win = this.win;
    let timer = null;
    const done = () => {
      win.clearTimeout(timer);
      box.remove();
    };
    const check = () => {
      if (loading.every(b => b.contentDocument?.readyState == "complete" &&
          b.contentDocument.documentURI?.startsWith("about:message"))) {
        // erst nach Thunderbirds eigenem Load-Handler entfernen
        win.setTimeout(done, 0);
      }
    };
    for (const b of loading) {
      b.addEventListener("load", check, true);
    }
    // Sicherheitsnetz: nie länger als ein paar Sekunden
    timer = win.setTimeout(done, 5000);
  }

  // nach Thunderbirds Anzeige: Konversation zeigen, wenn sie mehr als eine Mail hat.
  // Bis die Antwort da ist, bleibt Thunderbirds Ansicht verdeckt (mc-conv-pending) –
  // sonst blitzte kurz die Einzelmail bzw. die Zusammenfassung auf
  async show(hdr, { thread = false } = {}) {
    const token = ++this.seq;
    if (!hdr || !this.enabled()) {
      this.reveal();
      return;
    }
    this.pane.classList.add("mc-conv-pending");
    clearTimeout(this.pendingTimer);
    // Sicherheitsnetz: nie länger als 400 ms leer
    this.pendingTimer = setTimeout(() => this.reveal(), 400);
    try {
      const { messages, indexed } = await this.collect(hdr);
      if (token != this.seq) {
        return;
      }
      if (messages.length >= 2) {
        this.render(messages, hdr, { indexed, thread });
      }
    } finally {
      if (token == this.seq) {
        this.reveal();
      }
    }
  }

  reveal() {
    clearTimeout(this.pendingTimer);
    this.pane.classList.remove("mc-conv-pending");
  }

  // zugeklappter Faden als Konversation: Karte, auf die Antworten und
  // Weiterleiten der Toolbar wirken (die gewählte, sonst die neueste)
  threadTarget() {
    if (!this.box?.isConnected || !this.thread) {
      return null;
    }
    const cards = [...this.box.querySelectorAll(".mc-conv-card")].filter(c => c.__mcHdr?.folder);
    return cards.find(c => c.classList.contains("mc-selected")) ||
      cards.reduce((a, b) => (!a || b.__mcHdr.date > a.__mcHdr.date ? b : a), null);
  }

  render(messages, selected, { indexed, thread }) {
    const win = this.win, doc = win.document;
    this.thread = !!thread;
    const X = "http://www.w3.org/1999/xhtml";
    this.observer?.disconnect();
    this.retire(this.box);
    const box = doc.createElementNS(X, "div");
    box.id = "mcConversation";
    box.__mcOwner = HOOK_OWNER;
    const head = doc.createElementNS(X, "div");
    head.className = "mc-conv-head";
    const title = doc.createElementNS(X, "div");
    title.className = "mc-conv-title";
    title.textContent = selected.mime2DecodedSubject || messages[0].mime2DecodedSubject || "";
    const count = doc.createElementNS(X, "div");
    count.className = "mc-conv-count";
    count.textContent = tr("{n} messages", { n: messages.length });
    head.append(title, count);
    box.append(head);
    if (!indexed) {
      const note = doc.createElementNS(X, "div");
      note.className = "mc-conv-note";
      note.textContent = tr("Only messages from this folder. Turn on Global Search to include your replies from Sent.");
      box.append(note);
    }
    const own = this.ownAddresses();
    // eigene Mail: in einem Gesendet-Ordner oder von einer eigenen Adresse
    const ownMail = m => {
      try {
        if (m.folder?.getFlag(Ci.nsMsgFolderFlags.SentMail)) {
          return true;
        }
        return own.has((MailServices.headerParser.parseDecodedHeader(m.mime2DecodedAuthor || m.author)[0]?.email || "").toLowerCase());
      } catch {
        return false;
      }
    };
    const cards = messages.map(m => {
      const card = doc.createElementNS(X, "div");
      card.className = "mc-conv-card";
      card.classList.toggle("mc-own", ownMail(m));
      card.classList.toggle("mc-selected", m == selected || m.messageId == selected.messageId);
      card.dataset.messageId = m.messageId;
      card.__mcHdr = m;
      // wie Apple Mail: jede Mail der Konversation ganz (geladen wird beim
      // Hineinscrollen, siehe unten)
      box.append(card);
      return card;
    });
    this.pane.append(box);
    this.box = box;
    // Klick auf eine Karte (Rand, Kopf, Text) wählt sie wie in Apple Mail –
    // die Klicks im Mailinhalt meldet loadCard
    box.addEventListener("click", event => {
      const card = event.target.closest?.(".mc-conv-card");
      if (card) {
        this.select(card);
      }
    });
    this.refreshToolbar();
    // Karten erst laden, wenn sie in die Nähe kommen (lange Konversationen)
    this.observer = new win.IntersectionObserver(entries => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          this.observer.unobserve(entry.target);
          this.loadCard(entry.target);
        }
      }
    }, { root: box, rootMargin: "800px 0px" });
    cards.forEach(card => this.observer.observe(card));
    const sel = cards.find(c => c.classList.contains("mc-selected"));
    if (sel && sel != cards[0]) {
      win.requestAnimationFrame(() => sel.scrollIntoView({ block: "start" }));
    }
  }

  // Mehrere Mails markiert: wie Apple Mail die oberste (erste in der Liste)
  // als Karte, dahinter je nach Anzahl ein bis drei leere Blätter als Stapel –
  // statt Thunderbirds Zusammenfassung („4 conversations“ mit Liste). Keine
  // Zahl (Apple zeigt keine); Toolbar-Befehle wirken weiter auf alle markierten
  renderStack(top, count) {
    const doc = this.win.document;
    const X = "http://www.w3.org/1999/xhtml";
    this.thread = false;
    this.observer?.disconnect();
    this.retire(this.box);
    const box = doc.createElementNS(X, "div");
    box.id = "mcConversation";
    box.className = "mc-stack";
    box.__mcOwner = HOOK_OWNER;
    const pile = doc.createElementNS(X, "div");
    pile.className = "mc-stack-pile";
    for (let n = Math.min(count - 1, 3); n >= 1; n--) {
      const sheet = doc.createElementNS(X, "div");
      sheet.className = "mc-stack-sheet";
      sheet.dataset.n = n;
      pile.append(sheet);
    }
    const card = doc.createElementNS(X, "div");
    card.className = "mc-conv-card";
    card.dataset.messageId = top.messageId;
    card.__mcHdr = top;
    pile.append(card);
    box.append(pile);
    this.pane.append(box);
    this.box = box;
    this.loadCard(card);
  }

  // Toolbar (Antworten, Weiterleiten) neu bewerten – sie fragt Thunderbird
  // nur bei Auswahl und Laden einer Mail
  refreshToolbar() {
    for (const b of this.win.top?.document.querySelectorAll("#unifiedToolbarContent button[is='mail-tab-button']") || []) {
      b.onCommandContextChange?.();
    }
  }

  // angeklickte Karte wird die gewählte: Rahmen und Ziel der Toolbar-Befehle
  select(card) {
    if (!card?.isConnected || card.classList.contains("mc-selected")) {
      return;
    }
    for (const c of card.parentNode.querySelectorAll(".mc-conv-card.mc-selected")) {
      c.classList.remove("mc-selected");
    }
    card.classList.add("mc-selected");
    this.refreshToolbar();
  }

  loadCard(card) {
    const doc = this.win.document;
    const hdr = card.__mcHdr;
    const browserEl = doc.createXULElement("browser");
    browserEl.setAttribute("src", "about:message");
    browserEl.className = "mc-conv-browser";
    card.append(browserEl);
    const fit = () => {
      try {
        const cdoc = browserEl.contentDocument;
        const mp = cdoc?.getElementById("messagepane");
        const inner = mp?.contentDocument?.documentElement;
        if (!inner) {
          return;
        }
        // Kopf, Anhänge … (alles außer dem Mailtext) plus die volle Höhe des Mailtexts
        const rest = cdoc.documentElement.scrollHeight - mp.getBoundingClientRect().height;
        const height = Math.ceil(rest + Math.max(inner.scrollHeight, inner.offsetHeight)) + 2;
        if (Math.abs(parseFloat(browserEl.style.height || 0) - height) > 1) {
          browserEl.style.height = `${height}px`;
        }
      } catch {} // gewollt: Seite schon geschlossen, nächste Messung folgt
    };
    browserEl.addEventListener("load", () => {
      const cw = browserEl.contentWindow;
      if (!cw?.displayMessage || card.__mcLoaded) {
        return;
      }
      card.__mcLoaded = true;
      // Knöpfe anderer Erweiterungen wirken in der Karte nicht – Zeile ausblenden
      const root = browserEl.contentDocument.documentElement;
      root.setAttribute("mc-conv-card", "");
      // ohne Knopfzeile auch kein Platz dafür über dem Kopf (mc-standalone
      // reserviert ihn, wenn die Toolbar keine Antworten-Knöpfe hat)
      root.removeAttribute("mc-standalone");
      // Klick in Kopf oder Anhänge wählt die Karte
      browserEl.contentDocument.addEventListener("click", () => this.select(card));
      try {
        cw.displayMessage(hdr.folder.getUriForMsg(hdr), this.win.gViewWrapper);
      } catch (e) {
        log("conversation display error", e);
      }
    }, true);
    browserEl.addEventListener("MsgLoaded", () => {
      decorateAttachments(browserEl.contentDocument);
      const mp0 = browserEl.contentDocument?.getElementById("messagepane");
      // Klick in den Mailtext wählt die Karte ebenfalls
      const body = mp0?.contentDocument;
      if (body && !body.__mcSelect) {
        body.__mcSelect = true;
        body.addEventListener("click", () => this.select(card));
      }
      const fold = () => foldQuotedHistory(mp0?.contentDocument);
      fold();
      mp0?.addEventListener("load", fold, true);
      fit();
      const mp = browserEl.contentDocument?.getElementById("messagepane");
      const iw = mp?.contentWindow;
      if (iw && !mp.__mcFit) {
        mp.__mcFit = true;
        // Bilder laden nach, Zitate klappen auf: Höhe mitführen – ebenso, wenn
        // die Anhangsliste erst nach dem Laden ihre Höhe bekommt (sonst war bei
        // einem Anhang die Dateizeile abgeschnitten) und Kopf
        new iw.ResizeObserver(fit).observe(iw.document.documentElement);
        const cdoc = browserEl.contentDocument;
        const ro = new browserEl.contentWindow.ResizeObserver(fit);
        for (const id of ["attachmentView", "attachmentList", "messageHeader"]) {
          const el = cdoc.getElementById(id);
          if (el) {
            ro.observe(el);
          }
        }
        new browserEl.contentWindow.MutationObserver(fit).observe(cdoc.getElementById("messagepanebox") || cdoc.documentElement, { childList: true });
        mp.addEventListener("load", () => this.win.setTimeout(fit, 50), true);
      }
      this.win.setTimeout(fit, 300);
    }, true);
  }
}

// Konversationskarten wie Apple Mail: der zitierte Verlauf am Ende einer
// Antwort (Thunderbird: blockquote type=cite samt „Am … schrieb …“-Zeile,
// Gmail .gmail_quote, Outlook #divRplyFwdMsg/#appendonsend mit allem danach)
// ist eingeklappt, darunter „Show More“. Eingeschobene Antworten zwischen
// Zitaten bleiben offen (nur Zitate, nach denen kein eigener Text mehr
// kommt). Nur die Anzeige – Antworten und Drucken nehmen die ganze Mail.
function foldQuotedHistory(doc) {
  const body = doc?.body;
  if (!body || doc.__mcFolded || doc.documentURI == "about:blank") {
    return;
  }
  // nach el (bis zum Textende) nur noch Leerraum?
  const restEmpty = el => {
    for (let n = el; n && n != body; n = n.parentNode) {
      for (let s = n.nextSibling; s; s = s.nextSibling) {
        if ((s.textContent || "").trim() || s.querySelector?.("img")) {
          return false;
        }
      }
    }
    return true;
  };
  let start = null, hide = [];
  const outlook = doc.getElementById("divRplyFwdMsg") || doc.getElementById("appendonsend");
  if (outlook) {
    // Outlook: Trennlinie davor mitnehmen, dann alles bis zum Ende
    const prev = outlook.previousElementSibling;
    start = prev?.localName == "hr" || prev?.querySelector?.(":scope > hr:only-child") ? prev : outlook;
    for (let s = start; s; s = s.nextSibling) {
      hide.push(s);
    }
  } else {
    const quotes = [...doc.querySelectorAll('blockquote[type="cite"], .gmail_quote')]
      .filter(q => !q.parentElement.closest('blockquote[type="cite"], .gmail_quote'));
    const last = quotes.at(-1);
    if (last && restEmpty(last)) {
      // „Am … schrieb …“ direkt davor gehört dazu
      const prefix = last.previousElementSibling?.classList.contains("moz-cite-prefix") ? last.previousElementSibling : null;
      start = prefix || last;
      hide = prefix ? [prefix, last] : [last];
    }
  }
  if (!start || !hide.length) {
    return;
  }
  // nur, wenn davor eigener Text steht (sonst wäre die Mail leer)
  const range = doc.createRange();
  range.setStart(body, 0);
  range.setEndBefore(start);
  if (!range.toString().trim()) {
    return;
  }
  doc.__mcFolded = true;
  const elements = hide.filter(n => n.nodeType == 1);
  for (const el of elements) {
    el.style.setProperty("display", "none", "important");
  }
  const texts = hide.filter(n => n.nodeType == 3);
  const parked = texts.map(n => [n, n.data]);
  for (const n of texts) {
    n.data = "";
  }
  const button = doc.createElement("button");
  button.className = "mc-show-more";
  button.type = "button";
  button.textContent = tr("Show More");
  // eigene Stile direkt am Knopf (das Mail-Dokument hat unsere Stilblätter nicht)
  button.setAttribute("style", "all: initial; display: block; margin: 10px 0 4px; font: 13px -apple-system, BlinkMacSystemFont, system-ui, sans-serif; " +
    "color: AccentColor; cursor: pointer;");
  button.addEventListener("click", () => {
    for (const el of elements) {
      el.style.removeProperty("display");
    }
    for (const [n, data] of parked) {
      n.data = data;
    }
    button.remove();
  });
  start.parentNode.insertBefore(button, start);
}

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
// (requestAnimationFrame) von 0 bis 1; bild(p, k) bekommt den Verlauf p = kurve(k) (k = Fortschritt), ende(k) den
// Endstand (k >= 1: vorwärts zu Ende, k <= 0: nach einer Umkehr wieder am Anfang). Beginn nach zwei Bildwechseln
// (Aufbau abwarten). umkehren() kehrt an der aktuellen Stelle um (Klick während der Animation).
function animiere(win, { dauer, kurve, bild, ende, beiUmkehr }) {
  let k = 0, dir = 1, last = null;
  const step = now => {
    k = Math.min(1, Math.max(0, k + (last === null ? 0 : dir * (now - last) / dauer)));
    last = now;
    bild(kurve(k), k);
    if (dir > 0 ? k < 1 : k > 0) {
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
// Anhänge unter der Mail (Einzelansicht und Karten der Konversation): je
// Zeile ein Download-Symbol (speichert genau diesen Anhang mit Dialog); bei
// einem einzigen Anhang keine Kopfzeile, die Dateizeile steht immer offen
// (mc-single, Gestaltung in userChrome.css). Die Liste baut Thunderbird erst
// nach „MsgLoaded“ fertig – daher über einen Beobachter der Liste
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
        const after = item.querySelector(":scope > .attach-drop-indicator.after");
        item.insertBefore(btn, after);
      }
      // (Breite der Zeilen neu, mit dem Symbol – sonst fehlte bei einem
      // Anhang der Dateiname)
      if (items.length) {
        try {
          list.setOptimumWidth?.();
        } catch {}
      }
      const single = items.length == 1;
      view.toggleAttribute("mc-single", single);
      // eine Datei: immer offen (die Kopfzeile zum Aufklappen fehlt dann)
      if (single && list.collapsed) {
        try {
          win.toggleAttachmentList?.(true);
        } catch {}
      }
      fitHeight();
    };
    // Höhe der aufgeklappten Liste: Thunderbird misst sie einmal beim
    // Aufklappen (--preferred-height) – unsere Zeilen sind höher und bekommen
    // den Speichern-Knopf erst danach, die letzte Datei war dann halb
    // abgeschnitten. Neu messen, sobald sich Liste oder Zeilen ändern
    const fitHeight = () => {
      if (!view.classList.contains("list-expanded") || list.collapsed) {
        return;
      }
      const bar = doc.getElementById("attachmentBar");
      const h = Math.ceil(list.scrollHeight + (bar?.scrollHeight || 0) + 2);
      if (Math.abs((parseFloat(view.style.getPropertyValue("--preferred-height")) || 0) - h) >= 1) {
        view.style.setProperty("--preferred-height", `${h}px`);
      }
    };
    new win.MutationObserver(update).observe(list, { childList: true });
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
      } catch {}
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
  } catch {}
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
    } catch {}
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
  if (Services.appinfo.OS != "Darwin" || !Services.prefs.getBoolPref(INLINE_PROMPTS_PREF, true)) {
    return;
  }
  const root = win.document.documentElement;
  if (!root || root.hasAttribute("mc-card-window")) {
    return;
  }
  root.setAttribute("customtitlebar", "true");
  root.setAttribute("chromemargin", "0,-1,-1,-1");
  root.setAttribute("mc-card-window", "");
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

// Nachfragen im Fenster statt als eigenes Fenster (wie in Firefox): Thunderbirds
// Prompter zeigt Nachfragen eines Fensters als Kachel darin, sobald das Fenster
// ein gDialogBox anbietet (Prompter.sys.mjs: MODAL_TYPE_INTERNAL_WINDOW). Wir
// bieten es im Haupt- und im Verfassen-Fenster an – mit Thunderbirds eigenem
// SubDialog (wie die Unterdialoge der Einstellungen). Ausschaltbar über
// extensions.mailcards.inlinePrompts.
const INLINE_PROMPTS_PREF = "extensions.mailcards.inlinePrompts";

function installDialogBox(win, restorers) {
  if (!Services.prefs.getBoolPref(INLINE_PROMPTS_PREF, true) || win.gDialogBox || !win.document?.documentElement) {
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
  if (!Services.prefs.getBoolPref(INLINE_PROMPTS_PREF, true) || Object.getOwnPropertyDescriptor(win, "gDialogBox")) {
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
    } catch {}
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
      } catch {}
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
];
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
    }[status];
    if (board && status == "open") {
      props.status |= props.FILTER_STATUS_COMPLETED_TODAY | props.FILTER_STATUS_COMPLETED_BEFORE;
    }
    props.due = {
      upToToday: props.FILTER_DUE_PAST | props.FILTER_DUE_TODAY,
      dated: props.FILTER_DUE_PAST | props.FILTER_DUE_TODAY | props.FILTER_DUE_FUTURE,
      any: props.FILTER_DUE_ALL,
    }[due];
    if (extra) {
      props.onfilter = (item, result) => result && extra(item);
    }
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
      L("menu_showFolderPane", "Show Folder List"), L("calShowTodayPane-2"), S,
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
      remind.disabled = !hdrs.length;
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
      { label: tr("Cancelled"), type: "radio", checked: item.status == "CANCELLED", run: () => save(it => (it.status = "CANCELLED")) },
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
    box.replaceChildren(
      ...group(null, [url ? row("link", "URL", url) : null]),
      ...group("Date & Time", [
        row("calendar", "Start", start?.text),
        row("clock", "Due", due?.text, (r, v) => v.toggleAttribute("data-overdue", !!due?.past && !item.isCompleted)),
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
      ]),
      ...group("Place", [row("location", "Location", item.getProperty("LOCATION"))]),
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
  const save = async (mutate, calendar = null) => {
    const old = tree.currentTask;
    if (!old || !writable(old)) {
      return;
    }
    const item = old.clone();
    mutate(item);
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
    const dateRow = (icon, prop) => on(icon, (r, v) => {
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
          save(it => (it[prop] = dt));
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
      if (cur?.isValid) {
        const b = el("button", "mc-ti-remove", tr("Remove"));
        b.type = "button";
        b.addEventListener("mousedown", event => event.preventDefault());
        b.addEventListener("click", () => {
          done = true;
          mini.panel.hidePopup();
          mini.panel.remove();
          save(it => (it[prop] = null));
        });
        parts.push(b);
      }
      v.replaceChildren(...parts);
      edit.pick(edit.segs[0]);
      mini.show();
    });
    dateRow("calendar", "entryDate");
    dateRow("clock", "dueDate");
    const base = item.entryDate?.isValid || item.dueDate?.isValid;
    on("repeat", r => {
      const info = (item.parentItem || item).recurrenceInfo;
      const rules = info ? info.getRecurrenceItems().filter(x => !x.isNegative) : [];
      const curType = rules.length == 1 && rules[0] instanceof Ci.calIRecurrenceRule && rules[0].interval == 1 ? rules[0].type : info ? "custom" : "";
      openMenu(r, [
        { label: tr("Never"), type: "radio", checked: !curType, run: () => save(it => (it.recurrenceInfo = null)) },
        ...Object.entries(RULES).map(([type, label]) => ({ label: tr(label), type: "radio", checked: curType == type, disabled: !base,
          run: () => save(it => {
            const { CalRecurrenceInfo } = ChromeUtils.importESModule("resource:///modules/CalRecurrenceInfo.sys.mjs");
            const ri = new CalRecurrenceInfo(it);
            ri.appendRecurrenceItem(cal.createRecurrenceRule(`RRULE:FREQ=${type}`));
            it.recurrenceInfo = ri;
          }) })),
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
        run: () => c.id != item.calendar?.id && save(it => (it.calendar = c), c) })));
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
  // Notiz: Klick macht den Text bearbeitbar, Verlassen speichert ihn
  const onNoteClick = () => {
    const item = tree.currentTask, ndoc = frame.contentDocument;
    if (!item || !writable(item) || !ndoc?.body || ndoc.designMode == "on") {
      return;
    }
    const before = ndoc.body.innerText;
    ndoc.designMode = "on";
    frame.contentWindow.addEventListener("blur", () => {
      ndoc.designMode = "off";
      const text = ndoc.body.innerText.replace(/\n+$/, "");
      if (text != before.replace(/\n+$/, "")) {
        save(it => (it.descriptionText = text));
      }
    }, { once: true });
  };
  const noteDoc = () => frame.contentDocument;
  const hookNote = () => noteDoc()?.addEventListener("click", onNoteClick);
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
      const m = mi(c.name, () => c.id != item.calendar?.id && save(it => (it.calendar = c), c));
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
    frame.removeEventListener("load", hookNote, true);
    noteDoc()?.removeEventListener("click", onNoteClick);
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
// Chrome-Fenster (about:blank), das die Elemente der Detailspalte unter denselben
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
    } catch {}
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
}

async function openTaskWindow(main, item) {
  const key = `${item.calendar?.id}:${item.hashId}`;
  const open = TASK_WINDOWS.get(key);
  if (open && !open.closed) {
    open.focus();
    return open;
  }
  const { cal } = ChromeUtils.importESModule("resource:///modules/calendar/calUtils.sys.mjs");
  const nw = main.openDialog("about:blank", "_blank", "chrome,dialog=no,resizable,minimizable,width=500,height=640");
  TASK_WINDOWS.set(key, nw);
  for (let tries = 0; tries < 200 && !(nw.document?.readyState == "complete" && nw.document.body); tries++) {
    await new Promise(r => main.setTimeout(r, 25));
  }
  const doc = nw.document;
  if (nw.closed || !doc.body) {
    TASK_WINDOWS.delete(key);
    return null;
  }
  try {
    Services.scriptloader.loadSubScript("chrome://global/content/customElements.js", nw);
    for (const href of ["chrome://global/skin/global.css", "chrome://messenger/skin/messenger.css"]) {
      const link = doc.createElement("link");
      link.rel = "stylesheet";
      link.href = href;
      doc.head.append(link);
    }
    if (ThemeSheet.active) {
      // (about:blank gilt für ThemeSheet.apply nicht als Thunderbird-Seite)
      nw.windowUtils.loadSheetUsingURIString(ThemeSheet.uri, nw.windowUtils.USER_SHEET);
      nw.__mcTheme = ThemeSheet.uri;
    }
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
    doc.body.append(container);
    // (Thunderbirds Transaktionen, Rückgängig inklusive, liegen im Hauptfenster)
    nw.doTransaction = (...args) => main.doTransaction(...args);
    const solo = { tree: { currentTask: item }, close: () => nw.close() };
    const restorers = [];
    const refresh = hookTaskInfo(nw, restorers, solo);
    const taskCss = `resource://mailcards/taskdesc.css?v=${extensionVersion}`;
    const fill = () => {
      const task = solo.tree.currentTask;
      doc.title = task.title || tr("Task");
      titleCell.textContent = task.title || "";
      const body = frame.contentDocument?.body;
      if (body) {
        body.style.whiteSpace = "pre-wrap";
        body.textContent = task.descriptionText || "";
        const cw = frame.contentWindow;
        if (cw && cw.__mcDesc != taskCss) {
          try {
            cw.windowUtils.loadSheetUsingURIString(taskCss, cw.windowUtils.USER_SHEET);
            cw.__mcDesc = taskCss;
          } catch {}
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
          solo.tree.currentTask = newItem;
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
      } catch {}
      main.removeEventListener("unload", closeWith);
      for (const r of restorers.reverse()) {
        try {
          r();
        } catch {}
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
    } catch {}
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
      for (const [space, items] of Object.entries({ mail: APPLE_TOOLBAR, ...SPACE_TOOLBARS })) {
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
  } catch {}
  log("deinstalliert: Einstellungen aufgeräumt");
  return reverted;
}

// Adressbuch: „Collected Addresses“ (automatisch gesammelte Empfänger) nicht
// in der Seitenleiste – Apple Kontakte kennt so etwas nicht (Apple Mail führt
// sie getrennt als „Frühere Empfänger“). Das Adressbuch selbst bleibt, die
// Ergänzung beim Schreiben funktioniert weiter. Einstellung, Standard: aus.
const HIDE_COLLECTED_PREF = "extensions.mailcards.hideCollectedAddresses";

function hookCollectedAddresses(cw, restorers) {
  const doc = cw.document;
  const books = cw.booksList;
  if (!books || books.__mcCollected) {
    return;
  }
  books.__mcCollected = true;
  const { MailServices } = ChromeUtils.importESModule("resource:///modules/MailServices.sys.mjs");
  const mark = () => {
    const hide = Services.prefs.getBoolPref(HIDE_COLLECTED_PREF, true);
    doc.documentElement.toggleAttribute("mc-hide-collected", hide);
    let uid = null;
    try {
      uid = MailServices.ab.directories.find(d => d.dirPrefId == "ldap_2.servers.history")?.UID;
    } catch {}
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
  } catch {}
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
    } catch {}
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
  // „On My Mac“ ausblenden – ganz unten im Kontextmenü dieser Zeile; wieder
  // einblenden über die Einstellungen
  const hideSep = doc.createXULElement("menuseparator");
  hideSep.id = "mcFolderHideLocalSep";
  const hideLocal = doc.createXULElement("menuitem");
  hideLocal.id = "mcFolderHideLocal";
  hideLocal.setAttribute("label", tr("Hide “{name}”", { name: localFoldersName() }));
  hideLocal.addEventListener("command", () => Services.prefs.setBoolPref(SHOW_LOCAL_PREF, false));
  popup.append(hideSep, hideLocal);
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
    const isLocal = !!folder?.isServer && folder.server?.type == "none";
    hideSep.hidden = hideLocal.hidden = !isLocal;
  };
  popup.addEventListener("popupshowing", onShow);
  // Einstellung geändert: Ordnerliste neu beschriften
  const onPref = () => enhancer?.decorateFolders?.(a3);
  Services.prefs.addObserver(SHOW_LOCAL_PREF, onPref);
  restorers.push(() => {
    popup.removeEventListener("popupshowing", onShow);
    Services.prefs.removeObserver(SHOW_LOCAL_PREF, onPref);
    byDate.remove();
    junk.remove();
    filters.remove();
    eraseJunk.remove();
    hideSep.remove();
    hideLocal.remove();
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
    set(d.getElementById("calendar-name-label"), "value", tr("Name:"));
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
      } catch {}
      const start = iw.gStartTime?.clone?.() || null;
      const end = iw.gEndTime?.clone?.() || null;
      // ohne „Änderungen speichern?“ schließen
      iw.gConfirmCancel = false;
      dlg.close();
      main.setTimeout(() => {
        if (mode == "task") {
          main.createTodoWithDialog(calendar, null, title, null, start);
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
async function openHaloSettings(w) {
  // (das Versprechen von openPreferencesTab erfüllt sich nur bei einem neuen
  // Tab – ist schon einer offen, wechselt Thunderbird nur dorthin)
  w.openPreferencesTab?.("paneGeneral");
  const prefsWindow = () => {
    const tab = w.document.getElementById("tabmail")?.currentTabInfo;
    return tab?.mode?.name == "preferencesTab" ? tab.browser?.contentWindow : null;
  };
  let pw = null;
  for (let i = 0; i < 80 && !(pw = prefsWindow())?.document?.getElementById("mcCat-" + HALO_PANE); i++) {
    await new Promise(r => setTimeout(r, 100));
  }
  pw?.gotoPref?.(HALO_PANE);
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
      } catch {} // ohne „Lokale Ordner“
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
  return () => {
    undrag();
    Services.prefs.removeObserver("mail.accountmanager.accounts", prefObs);
    mo.disconnect();
    browserEl.removeEventListener("load", schedule, true);
    browserEl.removeEventListener("view-selected", onView, true);
    browserEl.removeEventListener("select", onView, true);
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
const PREF_TOOLS = [
  // [Karte, Bereich, vor/nach Thunderbird-Abschnitt, Überschrift, Einträge]
  ["mcPrefFiles", "paneGeneral", "languageAndFontsCategory", "Files and Display", [
    { button: "menu_openSavedFilesWnd" },
    { toggle: "menu_fullZoomToggle" },
    { toggle: "viewAttachmentsInlineMenuitem" },
    { choice: "menu_uiDensity", items: ["uiDensityCompact", "uiDensityNormal", "uiDensityTouch"] },
  ]],
  ["mcPrefPrivacy", "panePrivacy", null, "History", [{ button: "sanitizeHistory" }]],
  // Filter heißen wie in Apple Mail Regeln: alle Regeln ansehen und anlegen
  ["mcPrefRules", "paneGeneral", null, "Rules", [{ button: "filtersCmd" }]],
  // „Get Starred Messages“ gilt in Thunderbird für den in der Mail gewählten
  // Ordner; der Befehl kennt nur die Mailansicht (pane3) – über Thunderbirds
  // Menüeintrag lief er im Einstellungen-Tab ins Leere (Knopf ohne Wirkung)
  ["mcPrefOffline", "paneGeneral", null, "Offline", [
    { button: "menu_synchronizeOffline" },
    { button: "menu_downloadFlagged", pane3: "cmd_downloadFlagged" },
  ]],
  ["mcPrefCalendarView", "paneCalendar", null, "Calendar View", [
    { toggle: "calWorkdaysOnlyMenuitem" },
    { toggle: "calTasksInViewMenuitem" },
    { toggle: "calShowCompletedInViewMenuItem" },
    { toggle: "calViewRotated" },
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
        const sync = () => (select.value = row.items.find(id => item(id)?.getAttribute("checked") == "true") || row.items[1]);
        sync();
        select.addEventListener("change", () => item(select.value)?.doCommand());
        card.addEventListener("focusin", sync);
        lab.append(label(row.choice), " ", select);
        line.append(lab);
      } else if (row.button && row.pane3) {
        // Befehl der Mailansicht: dort ausführen; grau, solange Thunderbird ihn
        // nicht anbietet (kein Ordner gewählt, offline) – wie im Menü
        const b = doc.createElementNS(X, "button");
        b.textContent = label(row.button);
        const ctl = () => mailWin.gTabmail?.tabInfo.find(t => t.mode?.name == "mail3PaneTab")?.chromeBrowser?.contentWindow?.commandController;
        const able = () => {
          try {
            return !!ctl()?.isCommandEnabled(row.pane3);
          } catch {
            return false;
          }
        };
        const sync = () => (b.disabled = !able());
        sync();
        b.addEventListener("click", () => able() && ctl().doCommand(row.pane3));
        card.addEventListener("focusin", sync);
        card.addEventListener("mouseover", sync);
        line.append(b);
      } else if (row.button) {
        const b = doc.createElementNS(X, "button");
        b.textContent = label(row.button);
        b.addEventListener("click", () => item(row.button)?.doCommand());
        line.append(b);
      } else {
        const lab = doc.createElementNS(X, "label");
        const box = doc.createElementNS(X, "input");
        box.type = "checkbox";
        const sync = () => (box.checked = item(row.toggle)?.getAttribute("checked") == "true");
        sync();
        box.addEventListener("change", () => {
          item(row.toggle)?.doCommand();
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
  const url = extensionBaseURL + "options/options.html?in=prefs" + (box.__mcFocus ? `#s-${box.__mcFocus}` : "");
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
    browserEl.fixupAndLoadURIString(url, { triggeringPrincipal: Services.scriptSecurityManager.getSystemPrincipal() });
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

// ---------------------------------------------------------------------------
// Protokoll (mail-cards-debug.log im Profilordner, max. ~200 KB)
// ---------------------------------------------------------------------------

const LOG_PATH = PathUtils.join(PathUtils.profileDir, "mail-cards-debug.log");
let logChain = Promise.resolve();
let logged = 0;
// Ausführliche Einträge (z. B. Absenderadressen beim Bild-Auflösen) nur mit
// extensions.mailcards.debug = true – Fehler werden immer protokolliert
function debugLog(...parts) {
  if (Services.prefs.getBoolPref("extensions.mailcards.debug", false)) {
    log(...parts);
  }
}

function log(...parts) {
  if (++logged > 2000) {
    return;
  }
  const line =
    new Date().toISOString() +
    " " +
    parts
      // Fehler aus anderen Bereichen sind kein „instanceof Error“ – an message erkennen
      .map(p => (p && typeof p == "object" && typeof p.message == "string"
        ? `${p.name || "Error"}: ${p.message}${p.stack ? ` @ ${String(p.stack).split("\n")[0]}` : ""}`
        : typeof p == "string" ? p : JSON.stringify(p)))
      .join(" ") +
    "\n";
  logChain = logChain
    .then(async () => {
      try {
        const info = await IOUtils.stat(LOG_PATH);
        if (info.size > 200 * 1024) {
          await IOUtils.remove(LOG_PATH);
        }
      } catch {} // gewollt: Protokoll fehlt noch, wird neu angelegt
      await IOUtils.writeUTF8(LOG_PATH, line, { mode: "appendOrCreate" });
    })
    .catch(() => {});
}

// ---------------------------------------------------------------------------
// Hilfsfunktionen
// ---------------------------------------------------------------------------

function orgDomain(domain) {
  // Thunderbirds Liste der Domain-Endungen (co.uk, com.pl, co.kr …)
  try {
    return Services.eTLD.getBaseDomainFromHost(domain.toLowerCase().replace(/\.$/, ""));
  } catch {} // gewollt: eigene Liste der Domain-Endungen darunter
  const parts = domain.toLowerCase().replace(/\.$/, "").split(".");
  if (parts.length <= 2) {
    return parts.join(".");
  }
  const lastTwo = parts.slice(-2).join(".");
  return SECOND_LEVEL.has(lastTwo)
    ? parts.slice(-3).join(".")
    : lastTwo;
}

// Datum in der Mailliste immer mit Uhrzeit: „Heute, 14:32“, „Gestern, 14:32“,
// davor das ganze Datum (17.10.2026, 14:32) – kein Wochentag.
// Formatiert wie der Mailkopf: Thunderbirds eigener Formatierer ohne Sprache
// nimmt die Regionaleinstellungen des Systems (auch 12/24 Stunden) – sonst
// stand in der Liste „12:49 AM“ neben „00:49“ im Kopf
function appleListDate(ms, now = new Date()) {
  const fmt = opts => new Services.intl.DateTimeFormat(undefined, opts);
  const d = new Date(ms);
  const startOfDay = x => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const days = Math.round((startOfDay(now) - startOfDay(d)) / 86400000);
  // immer mit Uhrzeit: „Heute, 14:32“, „Gestern, 14:32“, sonst „17.10.2026,
  // 14:32“ – Datum in der Zukunft (falsche Uhr beim Absender, Spam „oben
  // halten“) zeigt das ganze Datum
  const time = fmt({ timeStyle: "short" }).format(d);
  if (days == 0) {
    return tr("Today, {time}", { time });
  }
  if (days == 1) {
    return tr("Yesterday, {time}", { time });
  }
  // „mittel“ ist das ganze Datum im Muster des Systems (17.10.2026); Datum
  // und Uhrzeit getrennt formatiert und mit Komma verbunden – zusammen
  // setzt Englisch „at“ dazwischen („17.10.2026 at 14:32“)
  return `${fmt({ dateStyle: "medium" }).format(d)}, ${time}`;
}

// Absender ohne eigenen Namen (nur die Adresse, oft auch als Name
// wiederholt): wie Apple Mail der Firmenname aus der Domain
// („rueckgabe@amazon.de“ → „Amazon“). Bei Freemail-Adressen bleibt die Adresse.
function senderLabel(name, email) {
  name = (name || "").trim();
  if (name && !/^[^\s@]+@[^\s@]+$/.test(name)) {
    return name;
  }
  email ||= name.toLowerCase();
  const domain = email.split("@")[1] || "";
  const org = domain ? orgDomain(domain) : "";
  if (!org || FREEMAIL.has(org)) {
    return email;
  }
  const label = org.split(".")[0];
  return label.charAt(0).toUpperCase() + label.slice(1);
}

// Wer in der Karte steht: der Absender – in Gesendet, Entwürfen, Vorlagen und
// Postausgang wie bei Thunderbird die Empfänger (ohne Empfänger der Absender)
function personsFor(hdr, outgoing = false) {
  const parse = header => {
    try {
      return MailServices.headerParser.parseDecodedHeader(header || "")
        .filter(p => p?.email || p?.name)
        .map(p => ({ name: p.name || "", email: (p.email || "").toLowerCase() }));
    } catch {
      return [];
    }
  };
  const list = outgoing ? parse(hdr.mime2DecodedRecipients || hdr.recipients) : [];
  return list.length ? list : parse(hdr.mime2DecodedAuthor || hdr.author);
}

function initialsFor(name, email) {
  let source = (name || "").replace(/["'<>()[\]]/g, "").trim();
  if (!source || source.includes("@")) {
    source = (email || "").split("@")[0].replace(/[._\-+0-9]+/g, " ").trim();
  }
  const words = source.split(/\s+/).filter(w => /\p{L}/u.test(w));
  if (!words.length) {
    return "?";
  }
  const first = [...words[0]][0] || "";
  const second = words.length > 1 ? [...words[words.length - 1]][0] : "";
  return (first + second).toUpperCase();
}

// Vorschautext wie in Apple Mail: Fließtext ohne Zitate, Links und
// unsichtbare Füllzeichen (Newsletter verstecken damit ihren „Preheader“).
// Manche Absender (z. B. Amazon) schicken im Text-Teil in Wahrheit HTML –
// dann stünde Code in der Vorschau. Tags, Stile und Skripte entfernen.
// Benannte Zeichen (&zwnj;, &hellip; …) stehen oft auch in reinen Text-Teilen.
const ENTITIES = {
  nbsp: " ", amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", shy: "",
  zwnj: "", zwj: "", lrm: "", rlm: "", ensp: " ", emsp: " ", thinsp: " ",
  hellip: "…", mdash: "—", ndash: "–", lsquo: "‘", rsquo: "’", sbquo: "‚",
  ldquo: "“", rdquo: "”", bdquo: "„", laquo: "«", raquo: "»", bull: "•",
  middot: "·", copy: "©", reg: "®", trade: "™", euro: "€", deg: "°",
  auml: "ä", ouml: "ö", uuml: "ü", Auml: "Ä", Ouml: "Ö", Uuml: "Ü", szlig: "ß",
};

function decodeEntities(text) {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (all, e) => {
    if (e[0] == "#") {
      const n = e[1].toLowerCase() == "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(n) && n <= 0x10ffff ? String.fromCodePoint(n) : " ";
    }
    return ENTITIES[e] ?? ENTITIES[e.toLowerCase()] ?? all;
  });
}

function stripHtml(text) {
  if (!/<(?:!doctype|html|head|body|div|table|p|span|br|style|meta|td)\b/i.test(text)) {
    return decodeEntities(text);
  }
  return decodeEntities(text
    .replace(/<(style|script|head|title)\b[\s\S]*?<\/\1\s*>/gi, " ")
    .replace(/<(style|script|head)\b[\s\S]*$/i, " ") // angeschnitten (Vorschau gekürzt)
    .replace(/<!--[\s\S]*?(-->|$)/g, " ")
    .replace(/<[^>]*>/g, " ")
    .replace(/<[^>]*$/, " ")); // angeschnittenes Tag am Ende
}

// Liegt die Mail noch im Ordner? Nach Löschen/Verschieben kennt der Ordner
// ihren Schlüssel nicht mehr – Vorschau-Abruf dann auslassen statt Fehler
function msgStillInFolder(hdr) {
  try {
    const db = hdr?.folder?.msgDatabase;
    return !!db && db.containsKey(hdr.messageKey);
  } catch {
    return false;
  }
}

// Zeile der Mailliste, die es in der Ansicht nicht mehr gibt: Thunderbird
// füllt Zeilen erst im nächsten Bild (requestAnimationFrame). Wird die
// Ansicht dazwischen kleiner (Suche beim Tippen grenzt ein), zeigt die Zeile
// noch auf eine alte Position – die Ansicht wirft dann
// NS_MSG_INVALID_DBVIEW_INDEX. Solche Zeilen auslassen, die Liste setzt
// ihre Positionen gleich neu und füllt sie dann.
function rowGone(row) {
  try {
    const index = row?._index;
    const count = row?.view?.rowCount;
    return !Number.isInteger(index) || !Number.isInteger(count) || index < 0 || index >= count;
  } catch {
    return true;
  }
}

function cleanPreview(text) {
  return stripHtml(text || "")
    .replace(/[\u034f\u00ad\u200b-\u200f\u2060\ufeff]/g, "")
    .split(/\r?\n/)
    .filter(line => !/^\s*>/.test(line))
    .join(" ")
    .replace(/<https?:[^>]*>/g, "")
    .replace(/https?:\/\/\S+/g, "")
    .replace(/\[(?:image|cid):[^\]]*\]/gi, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 300);
}

// ---------------------------------------------------------------------------
// Suche wie Apple Mail: das Suchfeld oben durchsucht in der Mail alle
// Postfächer (außer Papierkorb und Spam) über einen versteckten Suchordner;
// Treffer stehen in der Kartenliste, gelb markiert, oben mit Anzahl.
// ---------------------------------------------------------------------------
const SEARCH_FOLDER_NAME = "halo.spaces search";
// Suchordner für „Markiert“ unter den Favoriten (versteckt unter „Lokale Ordner“)
const STARRED_FOLDER_NAME = "halo.spaces starred";
// Thunderbirds Index (Gloda): so lange wird vor der Suche auf seine Treffer
// gewartet (sonst ohne ihn), höchstens so viele Treffer (neueste zuerst);
// kürzere Begriffe fragen ihn nicht (riesige Präfix-Abfragen, die sich beim
// Tippen im Gloda-Thread stauen und nicht abbrechen lassen)
const GLODA_WAIT_MS = 400;
const GLODA_LIMIT = 3000;
const GLODA_MIN_CHARS = 3;

// Datum im Suchbegriff („12.10“, „12.10.“, „12.10.26“, „12.10.2026“) – ohne
// Jahr das letzte vergangene Vorkommen
function searchDate(text, now = new Date()) {
  const m = /^\s*(\d{1,2})\.(\d{1,2})\.?(\d{2}|\d{4})?\s*$/.exec(text || "");
  if (!m) {
    return null;
  }
  const day = Number(m[1]);
  const month = Number(m[2]);
  if (m[3]) {
    const year = m[3].length == 2 ? 2000 + Number(m[3]) : Number(m[3]);
    const date = new Date(year, month - 1, day);
    return date.getMonth() == month - 1 && date.getDate() == day ? date : null;
  }
  // ohne Jahr: letztes vergangenes Vorkommen, auch für den 29.2. (8 Jahre
  // reichen auch über Jahrhundertjahre ohne Schalttag; „31.4“ gibt es nie)
  for (let year = now.getFullYear(), i = 0; i < 8; i++, year--) {
    const date = new Date(year, month - 1, day);
    if (date.getMonth() == month - 1 && date.getDate() == day && date <= now) {
      return date;
    }
  }
  return null;
}

// Suchbegriff in einem Element gelb hinterlegen (nur Text, per DOM)
function markHits(el, term) {
  if (!el) {
    return;
  }
  for (const old of el.querySelectorAll("mark.mc-hit")) {
    old.replaceWith(old.textContent);
  }
  el.normalize();
  const needle = (term || "").trim().toLowerCase();
  if (needle.length < 2) {
    return;
  }
  const doc = el.ownerDocument;
  const walker = doc.createTreeWalker(el, 4 /* NodeFilter.SHOW_TEXT */);
  const nodes = [];
  while (walker.nextNode()) {
    nodes.push(walker.currentNode);
  }
  for (const node of nodes) {
    const text = node.nodeValue;
    const lower = text.toLowerCase();
    let at = lower.indexOf(needle);
    if (at < 0) {
      continue;
    }
    const frag = doc.createDocumentFragment();
    let from = 0;
    while (at >= 0) {
      frag.append(text.slice(from, at));
      const mark = doc.createElementNS("http://www.w3.org/1999/xhtml", "mark");
      mark.className = "mc-hit";
      mark.textContent = text.slice(at, at + needle.length);
      frag.append(mark);
      from = at + needle.length;
      at = lower.indexOf(needle, from);
    }
    frag.append(text.slice(from));
    node.replaceWith(frag);
  }
}

function bytesToBase64(win, bytes) {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
  }
  return win.btoa(binary);
}

// Einen Kopfeintrag der Nachricht lesen, den Thunderbird nicht in der
// Datenbank hält (z. B. List-Unsubscribe-Post); "" wenn nicht vorhanden
function readHeader(hdr, name) {
  return new Promise(resolve => {
    const timer = setTimeout(() => resolve(""), 5000);
    try {
      MsgHdrToMimeMessage(hdr, null, (msgHdr, mime) => {
        clearTimeout(timer);
        resolve(String(mime?.headers?.[name.toLowerCase()]?.[0] || ""));
      }, true, { partsOnDemand: true, examineEncryptedParts: false });
    } catch {
      clearTimeout(timer);
      resolve("");
    }
  });
}

// Nur öffentliche https-Adressen – Absender bestimmen die Adresse (BIMI,
// Kontaktfotos), damit darf kein Zugriff auf lokale Geräte oder Firmennetze
// ausgelöst werden
function isPublicHttps(url) {
  try {
    // nsIURI statt URL: URL gibt es im Experiment-Kontext nicht (new URL
    // warf, damit galt jede Adresse als gesperrt und es kamen keine Logos)
    const u = Services.io.newURI(url);
    if (u.scheme != "https") {
      return false;
    }
    const host = u.host.toLowerCase();
    return !(host == "localhost" || host.endsWith(".local") || host.endsWith(".localhost") ||
      /\.(invalid|example|test|onion)$/.test(host) || host.endsWith(".example.com") ||
      host.endsWith(".internal") || host.endsWith(".lan") || host.endsWith(".home") ||
      /^[\d.]+$/.test(host) || host.includes(":") || !host.includes("."));
  } catch {
    return false;
  }
}

// Zeitüberschreitungen zählen: dann kein „kein Logo“ merken (nur langsames Netz)
let fetchTimeouts = 0;

// Abruf über einen eigenen Kanal statt fetch: fetch folgt Umleitungen, bevor
// sich ihr Ziel prüfen lässt – der Absender könnte so auf Geräte im lokalen
// Netz umleiten. Hier wird jedes Umleitungsziel vor dem Verbinden geprüft.
// Zeitlimit und Größengrenze (max Bytes) gelten für die ganze Antwort, danach
// wird abgebrochen; mit truncate liefert eine längere Antwort nur ihren Anfang.
// Ergebnis wie bei fetch: ok, status, url, headers.get(), text(), arrayBuffer()
function fetchWithTimeout(win, url, { method = "GET", headers = {}, body = null, max = 2 * 1024 * 1024, truncate = false, followRedirects = true } = {}) {
  return new Promise((resolve, reject) => {
    if (!isPublicHttps(url)) {
      reject(new Error("blocked url"));
      return;
    }
    const channel = NetUtil.newChannel({ uri: url, loadUsingSystemPrincipal: true })
      .QueryInterface(Ci.nsIHttpChannel);
    // ohne Cookies und Anmeldedaten (wie credentials: "omit")
    channel.loadFlags |= Ci.nsIRequest.LOAD_ANONYMOUS;
    if (body != null) {
      const stream = Cc["@mozilla.org/io/string-input-stream;1"].createInstance(Ci.nsIStringInputStream);
      // setUTF8Data statt setByteStringData: das gibt es in Thunderbird 128 ESR
      // noch nicht, dort scheiterte sonst jeder POST (Ein-Klick-Abmeldung); der
      // Body ist reines ASCII („List-Unsubscribe=One-Click“)
      stream.setUTF8Data(body);
      channel.QueryInterface(Ci.nsIUploadChannel2).explicitSetUploadStream(stream, null, -1, method, false);
    } else {
      channel.requestMethod = method;
    }
    for (const [name, value] of Object.entries(headers)) {
      channel.setRequestHeader(name, value, false);
    }
    let current = channel;
    let settled = false;
    const parts = [];
    let size = 0;
    // redirected: Antwort 3xx, der nicht gefolgt wurde – gilt als Erfolg
    const finish = (request, redirected = false) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      const bytes = new Uint8Array(size);
      let at = 0;
      for (const part of parts) {
        bytes.set(part, at);
        at += part.length;
      }
      try {
        const http = request.QueryInterface(Ci.nsIHttpChannel);
        resolve({
          ok: http.requestSucceeded || (redirected && http.responseStatus >= 300 && http.responseStatus < 400),
          status: http.responseStatus,
          url: http.URI.spec,
          headers: {
            get(name) {
              try {
                return http.getResponseHeader(name);
              } catch {
                return null;
              }
            },
          },
          arrayBuffer: async () => bytes.buffer,
          text: async () => new win.TextDecoder().decode(bytes),
        });
      } catch (e) {
        reject(e);
      }
    };
    const fail = error => {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        reject(error);
      }
      try {
        current.cancel(Cr.NS_BINDING_ABORTED);
      } catch {} // gewollt: Anfrage schon beendet
    };
    const timer = setTimeout(() => {
      fetchTimeouts++;
      fail(new Error("timeout"));
    }, FETCH_TIMEOUT);
    channel.notificationCallbacks = {
      QueryInterface: ChromeUtils.generateQI(["nsIInterfaceRequestor", "nsIChannelEventSink"]),
      getInterface(iid) {
        return this.QueryInterface(iid);
      },
      asyncOnChannelRedirect(oldChannel, newChannel, flags, callback) {
        // ohne Weiterleiten (Ein-Klick-Abmeldung): der Server hat die Anfrage
        // schon erhalten – die 3xx-Antwort ist das Ergebnis, die Bestätigungsseite
        // (oft http oder intern) wird nicht mehr geladen
        if (!followRedirects) {
          callback.onRedirectVerifyCallback(Cr.NS_ERROR_ABORT);
          finish(oldChannel, true);
          fail(new Error("redirect not followed"));
          return;
        }
        // das Ziel muss ebenfalls öffentlich sein – sonst gar nicht erst verbinden
        if (!isPublicHttps(newChannel.URI.spec)) {
          callback.onRedirectVerifyCallback(Cr.NS_ERROR_ABORT);
          fail(new Error("blocked redirect"));
          return;
        }
        current = newChannel;
        callback.onRedirectVerifyCallback(Cr.NS_OK);
      },
    };
    try {
      channel.asyncOpen({
        QueryInterface: ChromeUtils.generateQI(["nsIStreamListener", "nsIRequestObserver"]),
        onStartRequest(request) {
          current = request;
        },
        onDataAvailable(request, stream, offset, count) {
          const input = Cc["@mozilla.org/binaryinputstream;1"].createInstance(Ci.nsIBinaryInputStream);
          input.setInputStream(stream);
          const chunk = new Uint8Array(count);
          input.readArrayBuffer(count, chunk.buffer);
          if (size + count > max) {
            if (!truncate) {
              fail(new Error("too large"));
              return;
            }
            parts.push(chunk.subarray(0, max - size));
            size = max;
            finish(request);
            request.cancel(Cr.NS_BINDING_ABORTED);
            return;
          }
          parts.push(chunk);
          size += count;
        },
        onStopRequest(request, status) {
          if (request != current) {
            return; // alter Kanal nach einer Umleitung
          }
          if (Components.isSuccessCode(status)) {
            finish(request);
          } else {
            fail(new Error(`network error 0x${(status >>> 0).toString(16)}`));
          }
        },
      });
    } catch (e) {
      fail(e);
    }
  });
}

// Zeitkurve wie CSS cubic-bezier(x1, y1, x2, y2)
// Ordnernamen wie in Apple Mail (Ordnerliste und Titel über der Mailliste)
function appleLabels() {
  const lang = Services.locale.appLocaleAsBCP47;
  // andere Sprachen: Thunderbirds eigene, übersetzte Namen behalten
  if (!lang.startsWith("de") && !lang.startsWith("en")) {
    return { native: true };
  }
  return lang.startsWith("de")
    ? { favourites: "Favoriten", allInboxes: "Alle Eingänge", allSent: "Alle gesendeten", onMyMac: IS_MAC ? "Auf meinem Mac" : "Auf diesem Computer",
        Inbox: "Posteingang", Drafts: "Entwürfe", SentMail: "Gesendet", Junk: "Werbung", Trash: "Papierkorb", Archive: "Archiv", Templates: "Vorlagen" }
    : { favourites: "Favourites", allInboxes: "All Inboxes", allSent: "All Sent", onMyMac: IS_MAC ? "On My Mac" : "On This Computer",
        Inbox: "Inbox", Drafts: "Drafts", SentMail: "Sent", Junk: "Junk", Trash: "Bin", Archive: "Archive", Templates: "Templates" };
}
// Name der lokalen Ordner in der Ordnerliste („On My Mac“, „On This
// Computer“, in anderen Sprachen Thunderbirds eigener)
function localFoldersName() {
  const L = appleLabels();
  return L.native ? (MailServices.accounts.localFoldersServer?.prettyName || "Local Folders") : L.onMyMac;
}
// Posteingang immer zuerst (order 0), Gmails „Wichtig“ direkt danach (1)
// Breite der Mailliste wie in Apple Mail fest; die Nachricht nimmt den Rest
// (Thunderbird hält sonst die Nachricht fest und lässt die Liste auf großen
// Bildschirmen auf über 2000 px wachsen)
const LIST_WIDTH_PREF = "extensions.mailcards.listWidth";
const LIST_WIDTH_DEFAULT = 460;
const FOLDER_ORDER = { Inbox: 0, Drafts: 2, SentMail: 3, Junk: 4, Trash: 5, Archive: 6, Templates: 7 };
function folderRole(folder) {
  return Object.keys(FOLDER_ORDER).find(k => folder?.getFlag(Ci.nsMsgFolderFlags[k]));
}

// Titel über der Mailliste wie Apple: „All Inboxes“ bzw. „Inbox – Google“
// Ordnername wie in der Ordnerliste (ohne Konto) – z. B. „Sent“ im Platzhalter der Suche
function appleFolderName(folder) {
  const L = appleLabels();
  const role = folderRole(folder);
  // frisch angelegte Ordner haben noch keinen prettyName (null) – dann name
  const plain = folder.prettyName || folder.localizedName || folder.name;
  if (folder.name == STARRED_FOLDER_NAME && folder.getFlag(Ci.nsMsgFolderFlags.Virtual)) {
    return tr("Starred");
  }
  if (/^mailbox:\/\/[^/]*smart%20mailboxes\//i.test(folder.URI)) {
    if (role == "Inbox" && !L.native) return L.allInboxes;
    if (role == "SentMail" && !L.native) return L.allSent;
    return plain;
  }
  return role && !L.native ? L[role] : plain;
}

function appleFolderTitle(folder) {
  const L = appleLabels();
  const name = appleFolderName(folder);
  if (/^mailbox:\/\/[^/]*smart%20mailboxes\//i.test(folder.URI) || folder.name == STARRED_FOLDER_NAME) {
    return name;
  }
  const account = folder.server?.type == "none" && !L.native ? L.onMyMac : folder.server?.prettyName;
  return account ? `${name} – ${account}` : name;
}

function cubicBezier(x1, y1, x2, y2) {
  const cx = 3 * x1, bx = 3 * (x2 - x1) - cx, ax = 1 - cx - bx;
  const cy = 3 * y1, by = 3 * (y2 - y1) - cy, ay = 1 - cy - by;
  const sampleX = t => ((ax * t + bx) * t + cx) * t;
  const sampleY = t => ((ay * t + by) * t + cy) * t;
  const slopeX = t => (3 * ax * t + 2 * bx) * t + cx;
  return x => {
    if (x <= 0 || x >= 1) {
      return Math.min(1, Math.max(0, x));
    }
    let t = x;
    for (let i = 0; i < 8; i++) {
      const dx = sampleX(t) - x;
      const d = slopeX(t);
      if (Math.abs(dx) < 1e-6 || Math.abs(d) < 1e-6) {
        break;
      }
      t -= dx / d;
    }
    return sampleY(Math.min(1, Math.max(0, t)));
  };
}

// Ziehen an der Trennlinie einer Seitenleiste (links) bzw. der Today-Pane
// (rechts, gespiegelt) – eine Logik für alle Bereiche, wie in Apple Mail:
// unter der Schwelle verschwindet die Leiste sofort, zurückgezogen kommt sie
// im selben Zug wieder (beliebig oft, bis zum Loslassen), alles ohne
// Animation. Aus der ausgeblendeten Lage heraus (Greifzone am Rand) ebenso.
// Die Breite folgt dem Zeiger, wenn pane.setWidth da ist (sonst feste Breite:
// nur ein-/ausblenden).
//   pane.side: "left" | "right"
//   pane.hidden(), pane.setHidden(bool), pane.width()
//   pane.threshold(startHidden, startWidth): Breite, unter der die Leiste aus ist
//   pane.setWidth(px) (optional), pane.done(hidden) (optional, beim Loslassen)
function dragPane(event, pane) {
  if (event.button != 0) {
    return;
  }
  const doc = event.currentTarget.ownerDocument;
  const win = doc.defaultView;
  const root = doc.documentElement;
  const dir = pane.side == "right" ? -1 : 1;
  const startX = event.clientX;
  const startHidden = pane.hidden();
  const startWidth = startHidden ? 0 : pane.width();
  const threshold = pane.threshold(startHidden, startWidth);
  let hidden = startHidden;
  // Zeiger an die Seite binden: Bewegungen kommen weiter an, auch wenn die
  // Trennlinie mit der Leiste verschwindet oder der Zeiger die Seite verlässt
  try {
    root.setPointerCapture(event.pointerId);
  } catch {} // gewollt: Zeiger schon losgelassen
  const cursor = root.style.cursor;
  root.style.cursor = "col-resize";
  const onMove = e => {
    if (!(e.buttons & 1)) {
      end();
      return;
    }
    const size = startWidth + dir * (e.clientX - startX);
    const hide = size < threshold;
    if (hide != hidden) {
      hidden = hide;
      pane.setHidden(hide);
    }
    if (!hide) {
      pane.setWidth?.(size);
    }
  };
  const end = () => {
    win.removeEventListener("pointermove", onMove, true);
    win.removeEventListener("pointerup", end, true);
    root.style.cursor = cursor;
    try {
      root.releasePointerCapture(event.pointerId);
    } catch {} // gewollt: Zeiger schon losgelassen
    pane.done?.(hidden);
  };
  win.addEventListener("pointermove", onMove, true);
  win.addEventListener("pointerup", end, true);
}

// Thunderbirds eigenes Ziehen an einer Trennlinie (XUL-Splitter, Pane-Splitter)
// abschalten – dragPane übernimmt es (beide reagieren auf „mousedown“)
function blockNativeSplitter(event) {
  if (event.button == 0) {
    event.preventDefault();
    event.stopImmediatePropagation();
  }
}

// ---------------------------------------------------------------------------
// Logo-Cache (pro Domain, im Profil gespeichert)
// ---------------------------------------------------------------------------

// Fotos aus der macOS-Kontakte-App. iCloud liefert Kontaktfotos nur als Link,
// der eine iCloud-Web-Anmeldung verlangt – die Kontakte-App hat sie aber lokal.
// Ein Hilfsskript (eigener Prozess, nur lesend) legt stündlich Vorschaubilder
// und eine Zuordnungsliste (E-Mail, Name) im Profilordner „mail-cards-photos“
// ab. An den Kontakten selbst ändert sich nichts.
const MAC_PHOTOS_PREF = "extensions.mailcards.macContactPhotos";
// Updates beim Start suchen und installieren (höchstens alle 6 Stunden)
const AUTO_UPDATE_PREF = "extensions.mailcards.autoUpdate";
const AUTO_UPDATE_LAST_PREF = "extensions.mailcards.autoUpdateLast";
// reine Textmails in der Systemschrift (plaintext.css)
const PLAIN_TEXT_PREF = "extensions.mailcards.plainTextSystemFont";
// aus: keine Anfrage an Absender-Websites (Favicon, BIMI, Startseite)
const SENDER_LOGOS_PREF = "extensions.mailcards.senderLogos";
const MAC_PHOTOS_SCRIPT = `
ObjC.import('Contacts');
ObjC.import('Foundation');
function run(argv) {
  const dir = argv[0];
  const store = $.CNContactStore.alloc.init;
  const keys = $([$.CNContactIdentifierKey, $.CNContactImageDataAvailableKey, $.CNContactThumbnailImageDataKey,
    $.CNContactEmailAddressesKey, $.CNContactGivenNameKey, $.CNContactFamilyNameKey, $.CNContactOrganizationNameKey]);
  const req = $.CNContactFetchRequest.alloc.initWithKeysToFetch(keys);
  const out = [];
  store.enumerateContactsWithFetchRequestErrorUsingBlock(req, null, function (c, stop) {
    if (!c.imageDataAvailable) return;
    const data = c.thumbnailImageData;
    if (!data || Number(data.length) == 0) return;
    const file = ObjC.unwrap(c.identifier).replace(/[^A-Za-z0-9]/g, "_") + ".img";
    data.writeToFileAtomically(dir + "/" + file, true);
    const emails = [];
    for (let i = 0; i < Number(c.emailAddresses.count); i++) {
      emails.push(String(ObjC.unwrap(c.emailAddresses.objectAtIndex(i).value)).toLowerCase());
    }
    out.push({ f: file, e: emails,
      n: (String(ObjC.unwrap(c.givenName) || "") + " " + String(ObjC.unwrap(c.familyName) || "")).trim(),
      o: String(ObjC.unwrap(c.organizationName) || "") });
  });
  $(JSON.stringify(out)).writeToFileAtomicallyEncodingError(dir + "/index.json", true, $.NSUTF8StringEncoding, null);
  return String(out.length);
}`;

const MacPhotos = {
  byEmail: new Map(), // E-Mail → Dateipfad
  byName: new Map(), // Name (klein) → Dateipfad
  version: 0,
  running: false,
  listeners: new Set(),

  folder() {
    const f = Services.dirsvc.get("ProfD", Ci.nsIFile);
    f.append("mail-cards-photos");
    return f.path;
  },

  norm(name) {
    return (name || "").normalize("NFC").replace(/\s+/g, " ").trim().toLowerCase();
  },

  async load() {
    if (Services.prefs.prefHasUserValue(MAC_PHOTOS_PREF) && !Services.prefs.getBoolPref(MAC_PHOTOS_PREF)) {
      return; // ausgeschaltet
    }
    try {
      const list = await IOUtils.readJSON(PathUtils.join(this.folder(), "index.json"));
      this.byEmail.clear();
      this.byName.clear();
      for (const entry of list) {
        const path = PathUtils.join(this.folder(), entry.f);
        for (const e of entry.e || []) {
          this.byEmail.set(e, path);
        }
        for (const n of [entry.n, entry.o]) {
          if (n && !this.byName.has(this.norm(n))) {
            this.byName.set(this.norm(n), path);
          }
        }
      }
      this.version++;
      log("mac photos loaded", { photos: list.length, emails: this.byEmail.size });
    } catch {} // Kandidat fürs Protokoll: Bilder aus Fotos nicht ladbar
  },

  // Dateipfad zum Foto eines Kontakts (über E-Mail-Adressen, sonst Name)
  lookup(emails = [], name = "") {
    for (const e of emails) {
      const hit = e && this.byEmail.get(String(e).toLowerCase());
      if (hit) {
        return hit;
      }
    }
    return this.byName.get(this.norm(name)) || null;
  },

  fileURL(path) {
    return PathUtils.toFileURI(path) + "?v=" + this.version;
  },

  // Liest die macOS-Kontakte (dafür fragt macOS einmal nach Zugriff) – nur,
  // wenn eingeschaltet (extensions.mailcards.macContactPhotos = true) oder
  // schon einmal eingerichtet (Fotoverzeichnis vorhanden)
  async enabled() {
    if (Services.prefs.prefHasUserValue(MAC_PHOTOS_PREF)) {
      return Services.prefs.getBoolPref(MAC_PHOTOS_PREF);
    }
    return IOUtils.exists(PathUtils.join(this.folder(), "index.json")).catch(() => false);
  },

  async sync() {
    if (Services.appinfo.OS != "Darwin" || this.running || !(await this.enabled())) {
      return;
    }
    this.running = true;
    const t0 = Date.now();
    const dir = this.folder();
    const script = PathUtils.join(PathUtils.tempDir, "mail-cards-contact-photos.js");
    try {
      await IOUtils.makeDirectory(dir, { ignoreExisting: true });
      await IOUtils.writeUTF8(script, MAC_PHOTOS_SCRIPT);
      const { Subprocess } = ChromeUtils.importESModule("resource://gre/modules/Subprocess.sys.mjs");
      const proc = await Subprocess.call({ command: "/usr/bin/osascript", arguments: ["-l", "JavaScript", script, dir], stderr: "pipe" });
      const killer = setTimeout(() => proc.kill(), 120000);
      const [out, err] = await Promise.all([proc.stdout.readString(), proc.stderr.readString()]);
      const { exitCode } = await proc.wait();
      clearTimeout(killer);
      log("mac photos sync", { ms: Date.now() - t0, exitCode, photos: out.trim(), err: err.trim().slice(0, 160) });
      if (exitCode == 0) {
        await this.load();
        // Dateien von Kontakten, die es nicht mehr gibt, entfernen
        const keep = new Set([...this.byEmail.values(), ...this.byName.values()]);
        for (const child of await IOUtils.getChildren(dir)) {
          if (child.endsWith(".img") && !keep.has(child)) {
            await IOUtils.remove(child).catch(() => {});
          }
        }
        this.listeners.forEach(fn => fn());
      }
    } catch (e) {
      log("mac photos sync error", String(e).slice(0, 200));
    } finally {
      this.running = false;
      await IOUtils.remove(script).catch(() => {});
    }
  },
};

class LogoCache {
  constructor() {
    this.path = PathUtils.join(PathUtils.profileDir, CACHE_FILE);
    this.entries = {};
    this.loaded = this.load();
    this.saveTimer = null;
  }

  async load() {
    try {
      this.entries = await IOUtils.readJSON(this.path);
    } catch {
      this.entries = {};
    }
    // Abgelaufenes entfernen – sonst wächst die Datei mit jedem Absender
    let dropped = 0;
    for (const [domain, e] of Object.entries(this.entries)) {
      if (!e || !e.t || Date.now() - e.t > (e.src ? HIT_TTL : MISS_TTL) || (!e.src && e.v !== 2)) {
        delete this.entries[domain];
        dropped++;
      }
    }
    if (dropped) {
      this.scheduleSave();
    }
  }

  get(domain) {
    const e = this.entries[domain];
    if (!e) {
      return undefined;
    }
    // „kein Logo“ aus älteren Versionen verwerfen: bis 3.0.82 scheiterte jeder Abruf
    if (!e.src && e.v !== 2) {
      return undefined;
    }
    const ttl = e.src ? HIT_TTL : MISS_TTL;
    return Date.now() - e.t < ttl ? e : undefined;
  }

  set(domain, value) {
    this.entries[domain] = { ...value, t: Date.now() };
    this.scheduleSave();
  }

  scheduleSave() {
    if (this.saveTimer) {
      return;
    }
    this.saveTimer = setTimeout(async () => {
      this.saveTimer = null;
      try {
        await IOUtils.writeJSON(this.path, this.entries, {
          tmpPath: this.path + ".tmp",
        });
      } catch (e) {
        log("cache save failed", e);
      }
    }, 2000);
  }
}

// ---------------------------------------------------------------------------
// Absenderbilder
// ---------------------------------------------------------------------------

class AvatarResolver {
  constructor(getWindow) {
    this.getWindow = getWindow;
    this.cache = new LogoCache();
    this.byEmail = new Map(); // email -> {src, small} | null
    this.pending = new Map(); // email -> Promise
    this.domainPending = new Map();
  }

  peek(email) {
    return this.byEmail.get(email);
  }

  resolve(email, hint = {}) {
    if (this.byEmail.has(email)) {
      return Promise.resolve(this.byEmail.get(email));
    }
    if (!this.pending.has(email)) {
      const p = this._resolve(email, hint)
        .catch(e => {
          log("avatar error", email, e);
          return null;
        })
        .then(result => {
          this.byEmail.set(email, result);
          this.pending.delete(email);
          return result;
        });
      this.pending.set(email, p);
    }
    return this.pending.get(email);
  }

  async _resolve(email, hint = {}) {
    const fromAb = await this.fromAddressBook(email);
    if (fromAb) {
      debugLog("avatar", email, "Adressbuch");
      return { src: await this.normalize(fromAb), small: false };
    }
    const domain = email.split("@")[1];
    if (!domain) {
      return null;
    }
    const org = orgDomain(domain);
    if (FREEMAIL.has(org) || FREEMAIL.has(domain)) {
      debugLog("avatar", email, "Initialen (Freemail)");
      return null;
    }
    let logo = await this.domainLogo(domain, org);
    let used = org;
    // Versand über fremde Dienste (z. B. brave.discoursemail.com): Die Marke
    // steckt dann oft nur in der Message-ID (…@community.brave.app). Nur
    // nutzen, wenn ihr Name auch im Absender vorkommt – sonst kämen Logos von
    // Versanddiensten wie Amazon SES oder Mailchimp.
    const idHost = ((hint.messageId || "").split("@")[1] || "").replace(/[>\s]/g, "").toLowerCase();
    if (!logo && idHost && idHost.includes(".")) {
      // von der Basisdomain aufwärts: community.brave.app → brave.app
      // (brave.app steht selbst in der Liste der Domain-Endungen)
      const sender = `${hint.name || ""} ${domain}`.toLowerCase();
      const labels = orgDomain(idHost).split(".");
      for (let i = 0; !logo && labels.length - i >= 2; i++) {
        const d = labels.slice(i).join(".");
        const brand = labels[i];
        if (d != org && brand.length >= 3 && sender.includes(brand) && !FREEMAIL.has(d)) {
          logo = await this.domainLogo(d, d);
          used = d;
        }
      }
    }
    debugLog("avatar", email, logo ? `Logo ${used} (${logo.source || "Speicher"})` : "Initialen (kein Logo)");
    return logo;
  }

  // Einheitliche Größe: einfarbigen bzw. durchsichtigen Rand eines Logos
  // erkennen, wegschneiden und das Motiv mit gleichem Abstand neu zentrieren.
  // Bilder ohne erkennbaren Rand (Fotos, randlose Logos) bleiben unverändert.
  async normalize(src) {
    const win = this.getWindow();
    if (!win || !src) {
      return src;
    }
    try {
      const img = new win.Image();
      await new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = reject;
        img.src = src;
      });
      const N = 128;
      const XHTML = "http://www.w3.org/1999/xhtml";
      const canvas = win.document.createElementNS(XHTML, "canvas");
      canvas.width = canvas.height = N;
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      const iw = img.naturalWidth || N;
      const ih = img.naturalHeight || N;
      const scale = Math.min(N / iw, N / ih);
      const dw = iw * scale;
      const dh = ih * scale;
      const ox = (N - dw) / 2;
      const oy = (N - dh) / 2;
      ctx.drawImage(img, ox, oy, dw, dh);
      const data = ctx.getImageData(0, 0, N, N).data;
      const at = (x, y) => {
        const i = (Math.min(N - 1, Math.max(0, Math.round(y))) * N + Math.min(N - 1, Math.max(0, Math.round(x)))) * 4;
        return [data[i], data[i + 1], data[i + 2], data[i + 3]];
      };
      const corners = [
        at(ox + 1, oy + 1), at(ox + dw - 2, oy + 1),
        at(ox + 1, oy + dh - 2), at(ox + dw - 2, oy + dh - 2),
      ];
      const opaque = corners.filter(c => c[3] > 200).length >= 3;
      // Fotos erkennt man an unterschiedlichen Ecken – die bleiben unverändert
      if (opaque) {
        const spread = k => Math.max(...corners.map(c => c[k])) - Math.min(...corners.map(c => c[k]));
        if (spread(0) + spread(1) + spread(2) > 60) {
          return src;
        }
      }
      const bg = opaque
        ? [0, 1, 2].map(k => Math.round(corners.reduce((a, c) => a + c[k], 0) / 4))
        : null;
      let minX = N, minY = N, maxX = -1, maxY = -1;
      for (let y = 0; y < N; y++) {
        for (let x = 0; x < N; x++) {
          const i = (y * N + x) * 4;
          const a = data[i + 3];
          const content = opaque
            ? a > 24 && Math.abs(data[i] - bg[0]) + Math.abs(data[i + 1] - bg[1]) + Math.abs(data[i + 2] - bg[2]) > 48
            : a > 24;
          if (content) {
            if (x < minX) minX = x;
            if (x > maxX) maxX = x;
            if (y < minY) minY = y;
            if (y > maxY) maxY = y;
          }
        }
      }
      if (maxX < 0) {
        return src;
      }
      const bw = maxX - minX + 1;
      const bh = maxY - minY + 1;
      // Randlose, durchsichtige Logos (z. B. ein runder Spotify-Kreis) sind
      // bereits für den Kreis gestaltet. Alle anderen Logos – zu kleine wie
      // zu große – kommen auf dieselbe Größe.
      if (!opaque && bw > N * 0.9 && bh > N * 0.9) {
        return src;
      }
      const cx = (minX + maxX + 1) / 2;
      const cy = (minY + maxY + 1) / 2;
      // Scheibe auf durchsichtigem Grund (z. B. Tasse auf farbigem Kreis oder
      // Rundquadrat mit Rand): Berührt die Fläche an allen vier Kantenmitten
      // einfarbig den Rand, ist sie selbst der Hintergrund – zuschneiden und
      // den Kreis damit füllen statt sie verkleinert auf Weiß zu setzen
      let disc = null;
      if (!opaque) {
        const pts = [at(minX + 3, cy), at(maxX - 3, cy), at(cx, minY + 3), at(cx, maxY - 3)];
        const same = [0, 1, 2].every(k => Math.max(...pts.map(c => c[k])) - Math.min(...pts.map(c => c[k])) <= 16);
        if (same && pts.every(c => c[3] > 200)) {
          disc = [0, 1, 2].map(k => Math.round(pts.reduce((t, c) => t + c[k], 0) / 4));
        }
      }
      // Motiv auf ca. 69 % der Kantenlänge – passt auch diagonal in den Kreis
      const side = Math.max(bw, bh) * (disc ? 1 : 1.45);
      const out = win.document.createElementNS(XHTML, "canvas");
      out.width = out.height = N;
      const octx = out.getContext("2d");
      octx.fillStyle = opaque ? `rgb(${bg.join(",")})` : disc ? `rgb(${disc.join(",")})` : "#fff";
      octx.fillRect(0, 0, N, N);
      octx.drawImage(canvas, cx - side / 2, cy - side / 2, side, side, 0, 0, N, N);
      return out.toDataURL("image/png");
    } catch (e) {
      log("normalize error", e);
      return src;
    }
  }

  async fromAddressBook(email) {
    let card = null;
    try {
      card = MailServices.ab.cardForEmailAddress(email);
    } catch {
      return null;
    }
    const url = card?.photoURL;
    if (url?.startsWith("data:")) {
      return url;
    }
    if (url?.startsWith("file:")) {
      // Foto im lokalen Adressbuch: Thunderbird legt es als Datei in <Profil>/Photos ab
      const win = this.getWindow();
      if (win) {
        try {
          const path = Services.io.newURI(url).QueryInterface(Ci.nsIFileURL).file.path;
          // nur ganze Dateien bis 2 MB – größere (alte Profile: Kamerafoto
          // unverändert kopiert) nicht abgeschnitten anzeigen, sondern wie im
          // Netz-Zweig überspringen
          const { size } = await IOUtils.stat(path);
          if (size >= 100 && size <= 2 * 1024 * 1024) {
            const buf = await IOUtils.read(path);
            return `data:image/jpeg;base64,${bytesToBase64(win, buf)}`;
          }
        } catch {} // gewollt: kein Bild in diesem Ordner, nächster Weg
      }
    }
    // Foto aus der macOS-Kontakte-App (iCloud-Fotos sind nur als Link hinterlegt)
    const local = MacPhotos.lookup([email, ...(card?.emailAddresses || [])], card?.displayName);
    if (local) {
      const win = this.getWindow();
      try {
        const buf = await IOUtils.read(local);
        return `data:image/jpeg;base64,${bytesToBase64(win, buf)}`;
      } catch {} // gewollt: kein lokales Bild, nächster Weg
    }
    if (!url) {
      return null;
    }
    const win = this.getWindow();
    if (!win) {
      return null;
    }
    try {
      const res = await fetchWithTimeout(win, url);
      const type = (res.headers.get("content-type") || "").split(";")[0].trim();
      // Anmeldeseiten (iCloud: 401 mit HTML) sind kein Foto – dann Initialen
      if (!res.ok || !type.startsWith("image/")) {
        return null;
      }
      const buf = new Uint8Array(await res.arrayBuffer());
      if (buf.length < 100 || buf.length > 2 * 1024 * 1024) {
        return null;
      }
      return `data:${type};base64,${bytesToBase64(win, buf)}`;
    } catch {
      return null;
    }
  }

  async domainLogo(domain, org) {
    if (!Services.prefs.getBoolPref(SENDER_LOGOS_PREF, true)) {
      return null;
    }
    await this.cache.loaded;
    const key = org;
    let cached = this.cache.get(key);
    // BIMI-Logos bis 3.23.1 wurden wie Favicons verkleinert (weißer Ring im
    // Kreis) – das Original ist dann verloren, also einmal neu holen
    if (cached?.source == "BIMI" && cached.n !== 3) {
      cached = undefined;
    }
    if (cached) {
      if (!cached.src) {
        return null;
      }
      if (cached.n !== 2 && cached.source != "BIMI") {
        // Logo aus einer älteren Version: einmalig zuschneiden und merken
        const src = await this.normalize(cached.src);
        this.cache.set(key, { src, small: false, n: 2, source: cached.source });
        return { src, small: false, source: cached.source };
      }
      return { src: cached.src, small: false, source: cached.source };
    }
    if (!this.domainPending.has(key)) {
      const p = (async () => {
        const win = this.getWindow();
        if (!win) {
          return null;
        }
        let found = null;
        const timeoutsBefore = fetchTimeouts;
        for (const d of new Set([domain, org])) {
          found = await this.bimi(win, d);
          if (found) {
            break;
          }
        }
        if (!found) {
          found = await this.siteIcon(win, org);
        }
        // BIMI-Logos sind laut Vorgabe für den Kreis gestaltet (quadratisch,
        // Motiv in der Mitte) – wie Apple Mail randlos in den Kreis, nicht
        // zuschneiden und verkleinern wie Favicons
        if (found?.source == "BIMI") {
          found = { src: found.src, small: false, n: 3, source: "BIMI" };
        } else if (found) {
          found = { src: await this.normalize(found.src), small: false, n: 2, source: found.source };
        }
        if (found || fetchTimeouts == timeoutsBefore) {
          this.cache.set(key, found || { src: null, v: 2 });
        }
        return found;
      })().finally(() => this.domainPending.delete(key));
      this.domainPending.set(key, p);
    }
    return this.domainPending.get(key);
  }

  async bimi(win, domain) {
    let records;
    try {
      records = await DNS.txt(`default._bimi.${domain}`);
    } catch {
      return null;
    }
    for (const rec of records || []) {
      const txt = (rec.strings || [rec.data || ""]).join("");
      if (!/v=BIMI1/i.test(txt)) {
        continue;
      }
      const m = txt.match(/(?:^|;)\s*l=([^;\s]+)/i);
      if (!m || !m[1].startsWith("https://")) {
        continue;
      }
      try {
        const res = await fetchWithTimeout(win, m[1], { max: 256 * 1024 });
        if (!res.ok) {
          continue;
        }
        const svg = await res.text();
        if (svg.length > 256 * 1024 || !/<svg[\s>]/i.test(svg.slice(0, 4096))) {
          continue;
        }
        return {
          src: "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg),
          small: false,
          source: "BIMI",
        };
      } catch {
        // nächster Eintrag oder nächste Quelle
      }
    }
    return null;
  }

  async siteIcon(win, org) {
    const candidates = [
      `https://${org}/apple-touch-icon.png`,
      `https://www.${org}/apple-touch-icon.png`,
    ];
    // Icons aus dem <head> der Startseite (apple-touch-icon bevorzugt)
    for (const home of [`https://www.${org}/`, `https://${org}/`]) try {
      // nur der Anfang mit dem <head> wird gebraucht
      const res = await fetchWithTimeout(win, home, {
        headers: { Accept: "text/html" },
        max: 200000,
        truncate: true,
      });
      if (res.ok) {
        const html = (await res.text()).slice(0, 200000);
        const base = res.url;
        const links = [...html.matchAll(/<link\b[^>]*>/gi)].map(x => x[0]);
        const scored = [];
        for (const tag of links) {
          const rel = (tag.match(/\brel\s*=\s*["']?([^"'>]+)/i) || [])[1] || "";
          const href = (tag.match(/\bhref\s*=\s*["']?([^"'\s>]+)/i) || [])[1];
          if (!href || !/icon/i.test(rel)) {
            continue;
          }
          const sizes = (tag.match(/\bsizes\s*=\s*["']?(\d+)/i) || [])[1];
          let score = Number(sizes) || 32;
          if (/apple-touch-icon/i.test(rel)) {
            score += 1000;
          }
          if (/\.svg(\?|$)/i.test(href)) {
            score += 500;
          }
          try {
            scored.push({ url: Services.io.newURI(base).resolve(href), score });
          } catch {} // gewollt: ungültige Adresse im Logo-Verweis
        }
        scored.sort((a, b) => b.score - a.score);
        candidates.unshift(...scored.slice(0, 3).map(s => s.url));
        break;
      }
    } catch (e) {
      debugLog("siteIcon", home, "Fehler", String(e));
    }
    candidates.push(`https://www.${org}/favicon.ico`, `https://${org}/favicon.ico`);

    for (const url of new Set(candidates)) {
      if (!url.startsWith("https://")) {
        continue;
      }
      try {
        const res = await fetchWithTimeout(win, url, { max: 512 * 1024 });
        const type = (res.headers.get("content-type") || "").split(";")[0];
        if (!res.ok || !type.startsWith("image/")) {
          continue;
        }
        const buf = new Uint8Array(await res.arrayBuffer());
        if (buf.length < 100 || buf.length > 512 * 1024) {
          continue;
        }
        const small = !/apple-touch-icon|\.svg/i.test(url) && buf.length < 6000;
        return {
          src: `data:${type};base64,${bytesToBase64(win, buf)}`,
          small,
          source: "Website",
        };
      } catch (e) {
        debugLog("siteIcon", url, "Fehler", String(e));
      }
    }
    return null;
  }
}

// CSS-Variable nur setzen, wenn sich der Wert ändert – jede Änderung am
// Wurzelelement lässt Thunderbird das ganze Fenster neu durchrechnen (~10 ms)
function setVar(el, name, value) {
  if (el && el.style.getPropertyValue(name) != value) {
    el.style.setProperty(name, value);
  }
}

// Platz, den die Toolbar rechts der Mailliste braucht: alle Knöpfe in
// natürlicher Breite, das Suchfeld mit 333 px, der kleinste Abstand nach
// „Verfassen“ (12 px), der Rand rechts und 6 px Einzug an der Listenkante
// Breite der Fensterknöpfe rechts in der Toolbar-Zeile (Windows/Linux:
// Minimieren, Maximieren, Schließen; auf dem Mac 0)
function captionWidth(doc) {
  if (Services.appinfo.OS == "Darwin") {
    return 0; // auf dem Mac sitzen sie links (Ampel)
  }
  return Math.round(doc.querySelector("#unifiedToolbarContainer .titlebar-buttonbox-container")?.getBoundingClientRect().width || 0);
}

// Platz rechts neben der Knopfleiste in der Toolbar-Zeile (Windows/Linux:
// ≡-Menü und Fensterknöpfe stehen dort neben #unifiedToolbarContent und
// nehmen ihm Breite weg; auf dem Mac 0)
function rowTail(doc) {
  if (Services.appinfo.OS == "Darwin") {
    return 0;
  }
  const row = doc.getElementById("unifiedToolbarContainer")?.getBoundingClientRect();
  const content = doc.getElementById("unifiedToolbarContent")?.getBoundingClientRect();
  if (!row?.width || !content?.width) {
    return 0;
  }
  return Math.max(0, Math.round(row.right - content.right));
}

// minimal: nur die Pillen, die bei Platzmangel nie weichen (KEEP_PILLS), der
// Überlauf-Knopf und das Suchfeld in seiner kleinsten sinnvollen Breite – für
// Ziehgrenzen
function toolbarNeed(doc, minimal = false, searchMin = 160) {
  const content = doc.getElementById("unifiedToolbarContent");
  if (!content) {
    return 0;
  }
  const win = doc.defaultView;
  // rechts: Abstand für Today-Pane/-Knopf und was unter Windows/Linux neben
  // der Knopfleiste steht (≡-Menü, Fensterknöpfe – das Padding ist darum
  // kleiner, siehe --mc-row-tail)
  const pad = parseFloat(win.getComputedStyle(content).paddingInlineEnd) || 0;
  let need = 10 + Math.max(pad, 60) + rowTail(doc) + 12 + (minimal ? OVERFLOW_W : 0);
  let afterFirst = false;
  for (const li of content.children) {
    const id = li.getAttribute("item-id");
    if (id == "spacer") {
      afterFirst = true;
      continue;
    }
    if (!afterFirst || li.hidden || li.id == OVERFLOW_ID || (!li.getBoundingClientRect().width && !li.hasAttribute("mc-squeezed"))) {
      continue;
    }
    if (minimal && id != "search-bar" && !KEEP_PILLS.flat().includes(id)) {
      continue;
    }
    if (!minimal && li.hasAttribute("mc-squeezed")) {
      continue;
    }
    const cs = win.getComputedStyle(li);
    const margins = (parseFloat(cs.marginInlineStart) || 0) + (id == "write-message" ? 12 : parseFloat(cs.marginInlineEnd) || 0);
    need += (id == "search-bar" ? (minimal ? searchMin : 333) : li.getBoundingClientRect().width) + margins;
  }
  if (!minimal) {
    const ov = doc.getElementById(OVERFLOW_ID);
    if (ov && !ov.hasAttribute("mc-squeezed")) {
      need += OVERFLOW_W;
    }
  }
  return Math.ceil(need);
}

// Zu wenig Platz in der Toolbar-Zeile (z. B. 1280 px mit Today-Pane): wie
// Apple Mail zuerst das Suchfeld bis auf die Lupe, dann ganze Pillen
// (Knopfgruppen) ausblenden – nie eine Pille abschneiden oder nur einzelne
// Knöpfe daraus. Links neben dem Suchfeld erscheint dann der Überlauf-Knopf
// „»“, sein Menü zeigt die Aktionen aller ausgeblendeten Pillen. Gilt in
// allen eigenen Bereichen (nicht in Bereichen fremder Add-ons, z. B. einem
// ersetzten Chat). fits() misst nach jedem Schritt. Streng in dieser
// Reihenfolge (zurück umgekehrt) – eine schmalere Pille kommt nicht vor einer
// wichtigeren zurück, sonst wechselten sie sich beim Ändern der Breite ab.
// Pillen weichen von rechts nach links wie in Apple Mail; Knöpfe von Add-ons
// (unbekannte item-id) zuerst, jeder als eigene Pille.
const SQUEEZE_PILLS = [
  ["mark-as"], ["move-to"], ["archive", "delete", "junk"], ["reply", "reply-all", "forward-inline"],
  ["create-address-book", "create-list"],
];
// weichen nie: Abrufen + Verfassen, „Neu“ in Kalender, Aufgaben und Adressbuch
const KEEP_PILLS = [["get-messages", "write-message"], ["new-event", "new-task"], ["create-contact"]];
const OVERFLOW_ID = "mcToolbarOverflow";
// Kapsel 40 px + 6 px Abstand zum Suchfeld
const OVERFLOW_W = 46;
// Bereiche, deren Toolbar halo.spaces gestaltet (sonst, z. B. ein von einem
// Add-on ersetzter Chat, bleibt die Leiste unberührt)
const OVERFLOW_TABS = ["mail3PaneTab", "mailMessageTab", "calendar", "tasks", "addressBookTab", "chat", "preferencesTab"];

// ids der Knöpfe in Toolbar-Reihenfolge → Pillen in der Reihenfolge, in der
// sie weichen (reine Funktion, siehe tests/logik/ueberlauf.test.mjs)
function overflowPills(ids) {
  const known = new Set([...SQUEEZE_PILLS, ...KEEP_PILLS].flat());
  const foreign = ids.filter(id => id && !["spacer", "search-bar"].includes(id) && !known.has(id)).reverse().map(id => [id]);
  return [...foreign, ...SQUEEZE_PILLS.map(pill => pill.filter(id => ids.includes(id))).filter(pill => pill.length)];
}

function squeezeToolbar(doc, fits) {
  const content = doc.getElementById("unifiedToolbarContent");
  if (!content) {
    return;
  }
  for (const li of content.querySelectorAll(":scope > li[mc-squeezed]")) {
    li.removeAttribute("mc-squeezed");
  }
  // (der Überlauf-Knopf ist ausgeblendet wie eine Pille: so blendet er beim
  // Ein-/Ausblenden der Today-Pane mit aus, statt zu springen)
  const ov = overflowButton(doc, content);
  ov.setAttribute("mc-squeezed", "");
  if (fits()) {
    return;
  }
  // nur Knöpfe, die ohne Ausblenden zu sehen wären (Thunderbird blendet
  // manche selbst aus, z. B. „Neue Aufgabe“ im Kalender)
  const win = doc.defaultView;
  const shown = [...content.children].filter(li => !li.hidden && li.id != OVERFLOW_ID && win.getComputedStyle(li).display != "none");
  const byId = new Map(shown.map(li => [li.getAttribute("item-id"), li]));
  const pills = overflowPills(shown.map(li => li.getAttribute("item-id")));
  if (!pills.length) {
    return;
  }
  ov.removeAttribute("mc-squeezed");
  for (const pill of pills) {
    for (const id of pill) {
      byId.get(id)?.setAttribute("mc-squeezed", "");
    }
    if (fits()) {
      break;
    }
  }
}

// Überlauf-Knopf „»“ direkt links neben dem Suchfeld (eigene Kapsel); wird
// angelegt, wenn er fehlt (Thunderbird baut die Leiste beim Anpassen neu)
function overflowButton(doc, content) {
  let li = doc.getElementById(OVERFLOW_ID);
  // (Thunderbird blendet beim Bereichswechsel alle Einträge, die nicht zum
  // Bereich gehören, mit hidden aus – auch diesen; sichtbar macht ihn nur
  // mc-squeezed)
  if (li) {
    li.hidden = false;
  }
  const search = content.querySelector(':scope > li[item-id="search-bar"]:not([hidden])');
  if (li && li.parentNode == content && (!search || li.nextElementSibling == search)) {
    return li;
  }
  if (!li) {
    li = doc.createElement("li");
    li.id = OVERFLOW_ID;
    li.setAttribute("mc-squeezed", "");
    // Thunderbirds Toolbar ruft bei jedem Tab-Wechsel bzw. Schließen diese
    // Methoden aller Einträge auf (sonst TypeError in der Fehlerkonsole)
    li.onTabSwitched = () => {};
    li.onTabClosing = () => {};
    const button = doc.createElement("button");
    button.className = "unified-toolbar-button button";
    button.title = tr("More");
    button.setAttribute("aria-label", tr("More"));
    button.setAttribute("aria-haspopup", "menu");
    const icon = doc.createElement("img");
    icon.className = "button-icon";
    icon.alt = "";
    button.append(icon);
    li.append(button);
    button.addEventListener("click", () => openOverflowMenu(doc, button));
  }
  if (search) {
    search.before(li);
  } else {
    content.append(li);
  }
  return li;
}

// Menü mit den Aktionen aller ausgeblendeten Pillen (Toolbar-Reihenfolge):
// Symbol und Name des Knopfs; Knöpfe mit eigenem Menü (Verschieben,
// Markieren) öffnen es am Überlauf-Knopf
function openOverflowMenu(doc, button) {
  const win = doc.defaultView;
  doc.getElementById("mcToolbarOverflowMenu")?.remove();
  const menu = doc.createXULElement("menupopup");
  menu.id = "mcToolbarOverflowMenu";
  const hidden = [...doc.querySelectorAll(`#unifiedToolbarContent > li[mc-squeezed]:not([hidden], #${OVERFLOW_ID})`)];
  for (const li of hidden) {
    const b = li.querySelector("button");
    if (!b) {
      continue;
    }
    // ausgeblendete Knöpfe erfahren nicht immer, dass sich die Auswahl
    // geändert hat (z. B. „Antworten“ blieb grau): Zustand jetzt abfragen
    try {
      b.onCommandContextChange?.();
    } catch {}
    const label = (b.querySelector(".button-label")?.textContent || b.getAttribute("aria-label") || b.title || "").trim();
    const item = doc.createXULElement("menuitem");
    item.className = "menuitem-iconic";
    item.setAttribute("label", label || li.getAttribute("item-id"));
    item.setAttribute("mc-item", li.getAttribute("item-id") || "");
    if (b.disabled || b.hasAttribute("disabled")) {
      item.setAttribute("disabled", "true");
    }
    const icon = b.querySelector(".button-icon");
    const mask = icon ? win.getComputedStyle(icon).maskImage : "none";
    if (mask && mask != "none") {
      item.style.setProperty("--mc-ov-icon", mask);
    }
    const popupId = b.getAttribute("popup");
    item.addEventListener("command", () => {
      if (popupId) {
        // erst nach dem Schließen dieses Menüs (sonst schließt es das neue mit)
        win.setTimeout(() => doc.getElementById(popupId)?.openPopup(button, "after_end", 0, 2, false, false), 0);
      } else {
        b.click();
      }
    });
    menu.append(item);
  }
  (doc.getElementById("mainPopupSet") || doc.documentElement).append(menu);
  button.setAttribute("open", "true");
  menu.addEventListener("popuphiding", event => event.target == menu && button.removeAttribute("open"));
  menu.addEventListener("popuphidden", event => event.target == menu && menu.remove());
  menu.openPopup(button, "after_end", 0, 2, false, false);
}

function removeOverflowButton(doc) {
  squeezeToolbar(doc, () => true);
  doc.getElementById(OVERFLOW_ID)?.remove();
  doc.getElementById("mcToolbarOverflowMenu")?.remove();
}

const UNREAD_TINT_PREF = "extensions.mailcards.unreadTint";
const SOLID_MENUS_PREF = "extensions.mailcards.solidMenus";
const BDAY_PREF = "extensions.mailcards.birthdays";
const BDAY_CAL_PREF = "extensions.mailcards.birthdayCalendarId";
// iCloud hängt alten Erinnerungslisten nach dem Update der Erinnerungen-App
// ein ⚠️ an den Namen – diese Listen werden nicht mehr über CalDAV abgeglichen
function calendarNote(calendar) {
  const name = calendar?.name || "";
  let host = "";
  try {
    host = calendar?.uri?.host || "";
  } catch {} // gewollt: Kalender ohne Adresse
  if (!/\u26A0\uFE0F?\s*$/.test(name) || !/(^|\.)icloud\.com$/i.test(host)) {
    return null;
  }
  return Services.locale.appLocaleAsBCP47.startsWith("de")
    ? "iCloud markiert diese Liste mit ⚠️: Sie wurde in der Erinnerungen-App aktualisiert und wird nicht mehr über CalDAV abgeglichen – neue Erinnerungen erscheinen hier nicht."
    : "iCloud marks this list with ⚠️: it was upgraded in the Reminders app and no longer syncs over CalDAV – new reminders won't appear here.";
}

// Kanten für die Toolbar-Zeile nur dort setzen, wo sie gebraucht werden:
// an der Wurzel ließe jede Änderung alle ~5000 Elemente neu berechnen
// (25–40 ms pro Bild – die Seitenleisten-Animation ruckelt), an der
// Toolbar-Zeile sind es ~80.
function barTarget(doc) {
  return doc.getElementById("unifiedToolbarContainer") || doc.documentElement;
}
// Rechteck in Schreibrichtung: bei Rechts-nach-links-Sprachen gespiegelt
// (left = Abstand vom rechten Fensterrand), damit die Positionsrechnungen der
// Toolbar-Zeile für beide Richtungen gelten – die Werte landen in
// inset-inline-start & Co., die sich selbst spiegeln
function rectOf(el) {
  if (!el) {
    return undefined;
  }
  const r = el.getBoundingClientRect();
  const doc = el.ownerDocument;
  if (doc.__mcRtl === undefined) {
    doc.__mcRtl = doc.defaultView?.getComputedStyle(doc.documentElement).direction == "rtl";
  }
  if (!doc.__mcRtl) {
    return r;
  }
  const W = doc.documentElement.clientWidth;
  return { left: W - r.right, right: W - r.left, x: W - r.right, top: r.top, bottom: r.bottom, y: r.y, width: r.width, height: r.height };
}

// Erster Abstandhalter der Toolbar, an dem die Knöpfe ausgerichtet werden –
// nur wenn er wirklich vorn steht (davor können ausgeblendete Knöpfe anderer
// Bereiche liegen). Eigene Anordnungen ohne ihn (z. B. „Synchronisieren, Neu,
// Bearbeiten, Löschen“) bekommen den Abstand als Einzug der ganzen Zeile
// (mc-no-lead), sonst lagen ihre Knöpfe über der Seitenleiste
function leadSpacer(content) {
  if (!content) {
    return null;
  }
  const view = content.ownerDocument.defaultView;
  if (!view) {
    return null;
  }
  const first = [...content.children].find(li => !li.hidden && view.getComputedStyle(li).display != "none");
  const lead = first?.getAttribute("item-id") == "spacer" ? first : null;
  content.toggleAttribute("mc-no-lead", !!first && !lead);
  return lead;
}
function setBarVar(doc, name, value) {
  setVar(barTarget(doc), name, value);
}

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
// Design aus der Erweiterung (theme.css)
// ---------------------------------------------------------------------------

// Das komplette Design liegt als theme.css in der Erweiterung – so kommt es
// mit jedem Update automatisch mit, ohne userChrome.css im Profil. Liegt dort
// noch eine (ältere, manuell kopierte) userChrome.css dieses Designs, gilt
// diese und theme.css bleibt aus, damit nichts doppelt greift.
// Kopfzeile der eigenen userChrome.css (ältere Fassungen trugen noch den alten Text)
const THEME_MARKERS = ["halo.spaces – ruhiges Design für Thunderbird", "Thunderbird im Stil von Apple Mail"];
// Start ohne Aufblitzen (Einstellung, Standard aus): Thunderbird zeichnet das
// Fenster, bevor Erweiterungen starten – nur eine userChrome.css im Profil gilt
// von Anfang an. Ist die Option an, schreibt halo.spaces sein Design dorthin
// (mit eigener Kopfzeile) und schaltet toolkit.legacyUserProfileCustomizations.
// stylesheets ein; nach Updates neu geschrieben. Aus, deaktiviert oder
// deinstalliert: Datei weg, Einstellung zurück. Eine userChrome.css ohne unsere
// Kopfzeile (selbst angelegt, alte Handinstallation) wird nie angefasst
const EARLY_THEME_PREF = "extensions.mailcards.earlyTheme";
const EARLY_LEGACY_PREF = "extensions.mailcards.earlyThemeSetLegacy";
const LEGACY_PREF = "toolkit.legacyUserProfileCustomizations.stylesheets";
const EarlyTheme = {
  HEAD: "/* halo.spaces: automatisch geschrieben (Start ohne Aufblitzen), Version ",
  file() {
    const file = Services.dirsvc.get("ProfD", Ci.nsIFile);
    file.append("chrome");
    file.append("userChrome.css");
    return file;
  },
  // Fassung aus unserer Kopfzeile, sonst null (fremde oder keine Datei)
  versionOf(head) {
    const at = (head || "").indexOf(this.HEAD);
    return at < 0 ? null : head.slice(at + this.HEAD.length).split(" ")[0];
  },
  async head() {
    const path = this.file().path;
    if (!(await IOUtils.exists(path))) {
      return null;
    }
    return (await IOUtils.readUTF8(path)).slice(0, 4096);
  },
  async sync() {
    try {
      if (Services.prefs.getBoolPref(EARLY_THEME_PREF, false) && Services.prefs.getBoolPref("extensions.mailcards.bundledTheme", true)) {
        await this.write();
      } else {
        await this.remove();
      }
    } catch (e) {
      log("early theme error", e);
    }
  },
  async write() {
    const head = await this.head();
    if (head !== null && this.versionOf(head) === null) {
      log("early theme: eigene userChrome.css des Nutzers – nicht überschrieben");
      return false;
    }
    if (head !== null && this.versionOf(head) == extensionVersion) {
      this.legacyOn();
      return true;
    }
    const channel = NetUtil.newChannel({ uri: "resource://mailcards/theme.css", loadUsingSystemPrincipal: true });
    const stream = channel.open();
    const css = NetUtil.readInputStreamToString(stream, stream.available(), { charset: "UTF-8" });
    stream.close();
    const file = this.file();
    await IOUtils.makeDirectory(file.parent.path, { ignoreExisting: true });
    await IOUtils.writeUTF8(file.path, `${this.HEAD}${extensionVersion} – nicht von Hand ändern, wird ersetzt */\n${css}`);
    this.legacyOn();
    return true;
  },
  legacyOn() {
    if (!Services.prefs.getBoolPref(LEGACY_PREF, false)) {
      Services.prefs.setBoolPref(LEGACY_PREF, true);
      Services.prefs.setBoolPref(EARLY_LEGACY_PREF, true);
    }
  },
  async remove() {
    const head = await this.head();
    if (head !== null && this.versionOf(head) !== null) {
      await IOUtils.remove(this.file().path);
    }
    // nur zurücksetzen, was halo.spaces selbst eingeschaltet hat
    if (Services.prefs.getBoolPref(EARLY_LEGACY_PREF, false)) {
      Services.prefs.clearUserPref(LEGACY_PREF);
      Services.prefs.clearUserPref(EARLY_LEGACY_PREF);
    }
  },
};

const ThemeSheet = {
  uri: "resource://mailcards/theme.css",
  active: false,
  init() {
    this.active = false;
    if (!Services.prefs.getBoolPref("extensions.mailcards.bundledTheme", true)) {
      return;
    }
    try {
      const file = Services.dirsvc.get("ProfD", Ci.nsIFile);
      file.append("chrome");
      file.append("userChrome.css");
      if (file.exists()) {
        const stream = Cc["@mozilla.org/network/file-input-stream;1"].createInstance(Ci.nsIFileInputStream);
        stream.init(file, -1, 0, 0);
        const head = NetUtil.readInputStreamToString(stream, Math.min(stream.available(), 4096));
        stream.close();
        // eigene Kopie für den Start ohne Aufblitzen (EarlyTheme): gilt nur in der
        // aktuellen Fassung – nach einem Update lud Thunderbird noch die alte
        const managed = EarlyTheme.versionOf(head);
        if (managed !== null) {
          if (managed == extensionVersion) {
            log("theme: eigene userChrome.css (Start ohne Aufblitzen) ist aktuell");
            return;
          }
        } else if (THEME_MARKERS.some(m => head.includes(m))) {
          log("theme: userChrome.css im Profil hat Vorrang");
          return;
        }
      }
    } catch (e) {
      log("theme check error", String(e).slice(0, 120));
    }
    this.active = true;
  },
  // alle Thunderbird-eigenen Dokumente (wie userChrome.css: chrome://-Seiten)
  // sowie die Inhalts-Tabs Adressbuch, Einstellungen, Add-ons …
  wanted(doc) {
    const url = doc?.documentURI || "";
    return url.startsWith("chrome://") ||
      /^about:(addressbook|preferences|addons|accountsettings|accountsetup|message|3pane|import|profiling|downloads|support|config)/.test(url);
  },
  apply(win) {
    if (!this.active || !win || win.__mcTheme == this.uri || !this.wanted(win.document)) {
      return;
    }
    try {
      // nach einem Update: die alte Fassung in schon offenen Seiten ersetzen
      if (win.__mcTheme) {
        try {
          win.windowUtils.removeSheetUsingURIString(win.__mcTheme, win.windowUtils.USER_SHEET);
        } catch {} // gewollt: alte Fassung schon entfernt
      }
      win.windowUtils.loadSheetUsingURIString(this.uri, win.windowUtils.USER_SHEET);
      win.__mcTheme = this.uri;
    } catch {} // Kandidat fürs Protokoll: Design lässt sich im Fenster nicht laden
  },
  // alle Dokumente eines Fensters – auch die der Inhalts-Tabs (Einstellungen,
  // Adressbuch …): deren Browser sind eigene Bäume, nicht Teil des Fensters
  contexts(top) {
    const roots = [top?.browsingContext];
    for (const browserEl of top?.document?.querySelectorAll("browser") || []) {
      roots.push(browserEl.browsingContext);
    }
    const all = new Set();
    for (const root of roots) {
      for (const bc of root?.getAllBrowsingContextsInSubtree?.() || []) {
        all.add(bc);
      }
    }
    return all;
  },
  applyTree(top) {
    for (const bc of this.contexts(top)) {
      this.apply(bc.window); // null für Inhalte in anderen Prozessen (Mails)
    }
  },
  removeAll() {
    for (const top of Services.wm.getEnumerator(null)) {
      for (const bc of this.contexts(top)) {
        const win = bc.window;
        if (win?.__mcTheme) {
          try {
            win.windowUtils.removeSheetUsingURIString(win.__mcTheme, win.windowUtils.USER_SHEET);
          } catch {} // gewollt: Fassung schon entfernt
          delete win.__mcTheme;
        }
      }
    }
  },
};

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
              // nicht unter Linux: dort gingen im schmalen Fenster die
              // Auswahlmenüs der Zeitkarte (Datum, Wiederholen, Erinnerung)
              // sofort wieder zu
              if (Services.appinfo.OS != "Linux" && dlg.arguments?.[0]?.calendarEvent?.isEvent?.()) {
                doc.documentElement.setAttribute("mc-event", "");
              }
            } catch {}
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
          // Filterliste heißt wie in Apple Mail „Rules“ (Titel unter Windows/Linux sichtbar)
          if (url.startsWith("chrome://messenger/content/FilterListDialog.xhtml") && doc.defaultView) {
            const fw = doc.defaultView;
            fw.addEventListener("DOMContentLoaded", () => {
              const title = fw.document.querySelector("title");
              title?.removeAttribute("data-l10n-id");
              fw.document.title = tr("Rules");
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
          if (/^about:(3pane|message)/.test(url) && win) {
            win.addEventListener("DOMContentLoaded", () => {
              this.hookMailContext(doc);
              // neu geladene Mailansicht gleich einrichten (Karten, Bilder, …)
              if (url.startsWith("about:3pane")) {
                this.patch(win, 0);
              }
              if (url.startsWith("about:message")) {
                this.hookHeaderAvatar(doc);
              }
              // Nachricht im eigenen Fenster: Knöpfe im Mailkopf zeigen
              // – ebenso, wenn die Mail-Toolbar keine Antworten-Knöpfe hat
              // (eigene Toolbar-Anordnung), sonst fehlten sie ganz
              if (url.startsWith("about:message") &&
                  (!this.replyInToolbar() || win.top?.document.documentElement.getAttribute("windowtype") == "mail:messageWindow")) {
                doc.documentElement.setAttribute("mc-standalone", "true");
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
    this.watchChatVariant();
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
        } catch {}
      }
    });
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
        } catch {}
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
        const { width, min, watch } = measure();
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
        const slack = Math.max(0, width - min);
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
      } catch (e) {
        log("min window width error", e);
      }
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
        if (this.mcButtonsLeft && shared && "width" in shared && !shared.__mcDragging && cl && !el.__mcShowing &&
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
          setBarVar(d, "--mc-ab-list-right", `${Math.round(shift + cr.right - rowLeft)}px`);
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
        const sw = search ? rectOf(search).width : 0;
        return [...content.children].every(li => {
          const r = rectOf(li);
          return li.getAttribute("item-id") == "spacer" || !r?.width || r.right <= right;
        }) && (!sw || sw > 41);
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
      } catch {}
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
          } catch {}
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
      const markOptional = ve => {
        const entries = ve.vCardProperties?.entries || [];
        for (const [id, keys] of Object.entries(OPTIONAL)) {
          const fs = ve.querySelector(`#addr-book-edit-${id}`);
          fs?.setAttribute("mc-optional", "");
          fs?.toggleAttribute("mc-filled", entries.some(e => keys.includes(e.name) && filled(e.value)));
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
    const dedupeRows = rows => {
      const score = card => {
        let n = 0;
        try {
          n = card.vCardProperties?.entries?.length || 0;
        } catch {}
        // lokal gespeicherte Fotos zeigen sicher an, Web-Adressen (iCloud) oft nicht
        const photo = card.photoURL || "";
        return n + (/^(data|file|moz-icon):/.test(photo) ? 6 : photo ? 1 : 0);
      };
      const norm = t => (t || "").normalize("NFC").replace(/\s+/g, " ").trim().toLowerCase();
      const groups = new Map(); // Name → Liste von Clustern { email, best, rows }
      const keep = new Set();
      for (const row of rows) {
        const card = row.card;
        if (!card || card.isMailList) {
          keep.add(row);
          continue;
        }
        // der Name, den die Liste anzeigt (auch Firma, wenn kein Name gesetzt ist)
        let shown = "";
        try {
          shown = row.getText?.("GeneratedName") || "";
        } catch {}
        const name = norm(shown) || norm(card.displayName) ||
          norm(`${card.firstName || ""} ${card.lastName || ""}`);
        const email = norm(card.primaryEmail);
        if (!name) {
          keep.add(row);
          continue;
        }
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
        if (score(card) > score(cluster.best.card)) {
          cluster.best = row;
        }
      }
      for (const clusters of groups.values()) {
        for (const c of clusters) {
          keep.add(c.best);
          // welcher Eintrag stehen bleibt (Auswahl beim Zusammenführen übertragen)
          for (const r of c.rows) {
            r.mcBest = c.best;
          }
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
        if (Services.prefs.getBoolPref(DEDUPE_PREF, true) && this._rowMap?.length) {
          const old = this._rowMap;
          const rows = dedupeRows(old);
          if (rows.length != old.length) {
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
      Adapter.prototype.__mcDedupe = true;
      restorers.push(() => {
        Adapter.prototype.sortBy = orig;
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
        } catch {}
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
        } catch {}
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
          } catch {}
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
      // aktuelle Liste sofort bereinigen
      cw.booksList?.dispatchEvent(new cw.CustomEvent("select"));
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
          } catch {}
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
    const spacesFollow = hidden => {
      if (!w.gSpacesToolbar || w.__mcColumnQuiet || w.__mcSideDrag || columnBusy() || columnHidden() == hidden) {
        return;
      }
      w.gSpacesToolbar.toggleToolbar(hidden);
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
      const win = el.ownerDocument.defaultView;
      const show = el.classList.contains("mc-side-hidden");
      const DURATION = motionMs(250);
      const curve = cubicBezier(0.25, 0.1, 0.25, 1);
      unCollapse(el, splitter);
      if (show) {
        el.classList.remove("mc-side-hidden");
        splitter?.classList.remove("mc-side-hidden");
        placeSideGrip();
      }
      const full = el.getBoundingClientRect().width;
      if (!full) {
        return;
      }
      el.__mcAnimating = true;
      el.classList.add("mc-side-anim");
      // gespeicherte Breite der Leiste (Inline-Stil) merken und danach wiederherstellen
      const PROPS = ["overflow", "min-width", "width", "max-width"];
      const saved = PROPS.map(p => [p, el.style.getPropertyValue(p), el.style.getPropertyPriority(p)]);
      const kids = [...el.children];
      kids.forEach(k => k.style.setProperty("min-width", `${full}px`));
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
      // Einblenden mit Bereiche-Leiste: Kanten für den Endzustand einmal vorab rechnen (Endzustand synchron
      // herstellen, nichts wird gezeichnet, dann zurückstellen) und pro Bild zwischen Anfangs- und Endwert führen –
      // sonst springen Abstand und Knöpfe am Ende (Stufe 4)
      const EDGE_VARS = ["--mc-side-right", "--mc-tab-offset"];
      let edgeEnd = null;
      if (show && w.__mcSpacesJump && barRow) {
        const read = () => EDGE_VARS.map(n => parseFloat(barRow.style.getPropertyValue(n)));
        const start = read();
        w.__mcDry = true;
        try {
          w.__mcSpacesJump(1);
          setW(full);
          topDoc.documentElement.getBoundingClientRect();
          this.sideEdgeUpdaters?.forEach(f => f());
          edgeEnd = read();
        } catch (e) {
          log("dry-run error", e);
        } finally {
          setW(0);
          w.__mcSpacesJump(0);
          w.__mcDry = false;
          EDGE_VARS.forEach((n, i) => Number.isFinite(start[i]) && barRow.style.setProperty(n, `${start[i]}px`));
        }
        if (!edgeEnd || edgeEnd.some(v => !Number.isFinite(v)) || start.some(v => !Number.isFinite(v))) {
          edgeEnd = null;
        } else {
          edgeEnd = start.map((v, i) => [v, edgeEnd[i]]);
        }
      }
      // gemeinsamer Takt (animiere): Fortschritt läuft vor oder nach einer Umkehr zurück
      const anim = animiere(win, {
        dauer: DURATION,
        kurve: curve,
        beiUmkehr: dir => saveState(dir > 0 ? !show : show),
        bild: p => {
          const W = full * (show ? p : 1 - p);
          setW(W);
          if (edgeEnd) {
            // Fortschritt der Breite 0 → 1 (Einblenden)
            const q = full ? W / full : 1;
            EDGE_VARS.forEach((n, i) => setBarVar(topDoc, n, `${Math.max(0, Math.round(edgeEnd[i][0] + (edgeEnd[i][1] - edgeEnd[i][0]) * q))}px`));
          } else if (Number.isFinite(edgeBase)) {
            setBarVar(topDoc, "--mc-side-right", `${Math.max(0, Math.round(edgeBase + W))}px`);
          }
          if (followTab && !edgeEnd) {
            setBarVar(topDoc, "--mc-tab-offset", `${Math.max(0, Math.round(tabOffset0 + W - W0))}px`);
          }
          updateSideEdge();
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
    const DRAG_HIDE = 120;
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
      const pane = {
        el, splitter, win, mode,
        side: "left",
        width: () => el.getBoundingClientRect().width,
        threshold: () => DRAG_HIDE,
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
              } catch {}
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
      } catch {}
      const max = Math.max(SIDE_MIN, Math.min(sideMax(pane.el), room));
      let resized = false;
      // während des Ziehens bleibt die Bereiche-Leiste stehen (sonst spränge
      // der Inhalt unter dem Zeiger), beim Loslassen zieht sie mit
      w.__mcSideDrag = true;
      dragPane(event, {
        side: "left",
        hidden: pane.hidden,
        width: pane.width,
        threshold: pane.threshold,
        setHidden: pane.setHidden,
        setWidth: pane.setWidth && (W => {
          pane.setWidth(Math.round(Math.min(max, Math.max(SIDE_MIN, W))));
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
      // Kalender: Thunderbirds Terminliste unter dem Kalender („Find Events“)
      // zeigt die Treffer (Titel, Ort, Beschreibung), wie Apples Trefferliste;
      // ist sie zu, öffnet die Suche sie und schließt sie beim Leeren wieder.
      // Während der Suche alle Termine statt des gewählten Zeitraums (Standard:
      // nächste 7 Tage), danach wieder der vorige Zeitraum (GitHub #53)
      calendar: {
        label: "Search Calendar",
        input: () => w.document.getElementById("unifinder-search-field"),
        set: (input, text) => {
          const d = w.document;
          const box = d.getElementById("bottom-events-box");
          const menu = d.getElementById("event-filter-menulist");
          if (text) {
            if (box?.hidden && w.toggleUnifinder) {
              w.toggleUnifinder();
              w.__mcCalSearchOpened = true;
            }
            if (menu && w.__mcCalSearchInterval == null) {
              w.__mcCalSearchInterval = menu.value;
              if (menu.value != "all") {
                menu.value = "all";
                w.refreshUnifinderFilterInterval?.();
              }
            }
          }
          input.value = text;
          input.dispatchEvent(new w.Event("input", { bubbles: true }));
          if (!text) {
            if (menu && w.__mcCalSearchInterval != null) {
              if (menu.value != w.__mcCalSearchInterval) {
                menu.value = w.__mcCalSearchInterval;
                w.refreshUnifinderFilterInterval?.();
              }
              w.__mcCalSearchInterval = null;
            }
            if (w.__mcCalSearchOpened) {
              w.__mcCalSearchOpened = false;
              if (box && !box.hidden) {
                w.toggleUnifinder?.();
              }
            }
          }
        },
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
    const syncSearchForTab = mode => {
      const bar = globalSearch();
      if (!bar) {
        return;
      }
      const target = SEARCH_TARGETS[mode];
      if (w.__mcSearchMode && w.__mcSearchMode != mode) {
        bar.reset(); // leert dabei auch die Suche der verlassenen Seite
      }
      w.__mcSearchMode = target ? mode : null;
      // Platzhalter je Bereich: Thunderbird gibt dem Suchfeld einen eigenen
      // <span slot="placeholder"> – das placeholder-Attribut (nur Ersatzinhalt
      // des Slots) bliebe unsichtbar. Erst nachdem styleSearch Thunderbirds
      // Text abgekoppelt hat (sonst bleibt dessen Übersetzung stehen).
      setPlaceholder(mode);
      if (target) {
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
            } catch {}
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
          } catch {}
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
          relinkTaskTree(w, this.restorers);
          hookTaskView(w, this.restorers);
          hookTaskCards(w, this.restorers);
          hookTaskInfo(w, this.restorers);
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
        // sie erst am Ende neu verteilt und alles spränge (Stufe 4)
        if (show && withSpaces && w.__mcSpacesJump && ab.__mcJump) {
          w.__mcDry = true;
          try {
            w.__mcSpacesJump(1);
            ab.__mcJump(1);
            w.document.documentElement.getBoundingClientRect();
            this.offsetUpdaters?.forEach(fn => fn());
          } catch (e) {
            log("dry-run error", e);
          } finally {
            ab.__mcJump(0);
            w.__mcSpacesJump(0);
            w.__mcDry = false;
          }
          // Kanten für den Anfangszustand wieder herstellen (die Vorabrechnung schrieb die Endwerte)
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
      const columnMo = new w.MutationObserver(follow);
      columnMo.observe(bar, { attributes: true, attributeFilter: ["hidden"] });
      bar.__mcColumnMo = columnMo;
      this.restorers.push(() => {
        columnMo.disconnect();
        delete bar.__mcColumnMo;
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
      this.restorers.push(() => {
        custHide.forEach(el => (el.hidden = false));
        spacesMenu?.removeEventListener("popupshowing", noEmpty);
      });
      // Tooltips der Bereiche nur mit Namen („Mail“ statt „Mail (⌃ 1)“):
      // Thunderbird setzt sie per Fluent aus Titel und Kurzbefehl, auch
      // später noch (Übersetzung läuft verzögert) – also jedes Mal den
      // Titel aus den Fluent-Argumenten übernehmen
      const plainTitle = space => {
        if (space.hasAttribute("mc-fifth-icon")) {
          return; // fünfter Bereich: Titel der Erweiterung bzw. Webseite
        }
        let name;
        try {
          name = JSON.parse(space.getAttribute("data-l10n-args") || "{}").title;
        } catch {}
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
    // (kurz verzögert: Vorbeistreifen und Größenändern am Fensterrand lösen nicht aus)
    const FLOAT_DELAY = 50;
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
      const arm = () => {
        w.clearTimeout(floatTimer);
        if (!float || float.state == "out") {
          floatTimer = w.setTimeout(() => floatShow(), FLOAT_DELAY);
        }
      };
      // macOS meldet die innersten Pixel am Fensterrand (dort beginnt das
      // Größenändern des Fensters) nicht als Bewegung, sondern als Verlassen
      // des Fensters: Zeiger links hinaus zählt wie Ankommen im Streifen –
      // sonst löst nur ein Treffer genau auf x = 3 aus
      const outLeft = e => !e.relatedTarget && e.clientX < FLOAT_HOT && e.clientY >= 0 && e.clientY < w.innerHeight;
      hot.addEventListener("mouseenter", arm);
      hot.addEventListener("mouseleave", e => {
        if (!float && !outLeft(e)) {
          w.clearTimeout(floatTimer);
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
      for (const id of ["mcTodayToggle", "mcTodayTop", "mcTodayTitle", "mcTodayNew", "mcTodayGrip"]) {
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
      // (#mcTodayTop in ihrer Breite) – wie die Seitenleiste links
      const row = d.getElementById("unifiedToolbarContainer");
      const top = d.createElementNS("http://www.w3.org/1999/xhtml", "div");
      top.id = "mcTodayTop";
      // Überschrift „Today Pane“ oben in der Toolbar-Zeile, neben dem Knopf
      const title = d.createElementNS("http://www.w3.org/1999/xhtml", "span");
      title.id = "mcTodayTitle";
      // Text und Sonne/Wetter als eigene Elemente: jedes mit eigenem Tooltip
      const titleText = d.createElementNS("http://www.w3.org/1999/xhtml", "span");
      titleText.className = "mc-tt-text";
      titleText.textContent = tr("Today Pane");
      const weatherIcon = d.createElementNS("http://www.w3.org/1999/xhtml", "span");
      weatherIcon.id = "mcTodayWeather";
      title.append(titleText, weatherIcon);
      top.append(title);
      row?.prepend(top);
      // Wetter statt der festen Sonne (Option, Standard aus)
      Weather.attach(w, title);
      // Klick auf die Überschrift springt zum heutigen Tag, Liste nach oben
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
      // „+“ oben rechts in der Today-Pane, gleiche Größe und Höhe wie der
      // Today-Knopf – fragt nach Termin oder Aufgabe (statt unten unter der Liste)
      const plus = d.createElementNS("http://www.w3.org/1999/xhtml", "button");
      plus.id = "mcTodayNew";
      plus.type = "button";
      plus.title = tr("New Event") + " / " + tr("New Task");
      plus.setAttribute("aria-label", plus.title);
      plus.addEventListener("click", event => {
        event.stopPropagation();
        newPopup?.below(plus);
      });
      btn.after(plus);
      this.restorers.push(() => {
        plus.remove();
        row?.removeAttribute("data-mc-tp-open");
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
        // neben Knopf und Fensterknöpfen zu wenig Platz: nur die Sonne
        // links Today-Knopf (12 + 40 + 8), rechts „+“ (8 + 40 + 12) und ggf. ≡/Fensterknöpfe
        const room = width - 60 - (60 + Math.max(caption, tail));
        title.toggleAttribute("data-narrow", room < 110);
        // nicht einmal für die Sonne Platz (Windows/Linux: ≡ und Fensterknöpfe
        // liegen über der Today-Pane): Überschrift als eigene Zeile oben in der
        // Today-Pane statt unsichtbar unter „+“
        const below = width > 0 && room < 32;
        if (below != (title.parentNode == panel)) {
          if (below) {
            panel.prepend(title);
          } else {
            top.append(title);
          }
        }
        title.toggleAttribute("data-below", below);
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
                w.switchToView?.("day");
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
      const monthFmt = new Intl.DateTimeFormat(locale, { month: "long" });
      const X = "http://www.w3.org/1999/xhtml";
      const title = d.createElementNS(X, "div");
      title.id = "mcAgendaTitle";
      // ‹  Monat Jahr  › – blättert monatsweise; die Liste zeigt die Termine
      // des gezeigten Monats (im aktuellen ab dem 1., heute ganz oben)
      const mkChevron = (cls, label, dir) => {
        const b = d.createElementNS(X, "button");
        b.className = `mc-agenda-nav ${cls}`;
        b.type = "button";
        b.title = label;
        b.setAttribute("aria-label", label);
        b.addEventListener("click", () => this.shiftAgendaMonth(w, dir));
        return b;
      };
      const label = d.createElementNS(X, "span");
      label.className = "mc-agenda-month";
      title.append(
        mkChevron("mc-prev", tr("Previous Month"), -1),
        label,
        mkChevron("mc-next", tr("Next Month"), 1)
      );
      agenda.before(title);
      this.hookAgendaMonthRange(w);
      const apply = () => {
        const today = new Date();
        const todayKey = `${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, "0")}${String(today.getDate()).padStart(2, "0")}`;
        let firstDate = null;
        for (const li of agenda.querySelectorAll(":scope > li.agenda-listitem")) {
          const key = li.dateString || "";
          if (key.length >= 8) {
            const date = new Date(+key.slice(0, 4), +key.slice(4, 6) - 1, +key.slice(6, 8));
            firstDate ??= date;
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
          } catch {}
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
        // Monat der Liste (Starttag der Today-Pane), sonst des ersten Termins
        let date = firstDate || today;
        try {
          const start = w.TodayPane?.start;
          if (start) {
            date = new Date(start.year, start.month, start.day);
          }
        } catch {}
        const month = monthFmt.format(date);
        label.replaceChildren(
          Object.assign(d.createElementNS(X, "b"), { textContent: month }),
          d.createTextNode(` ${date.getFullYear()}`)
        );
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
        title.remove();
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
    // Mehrtägige ganztägige Termine in Monat/Mehrwochen als durchgehender
    // Balken wie in Apple Kalender: jedes Tagesstück weiß, ob es links/rechts
    // weitergeht (innerhalb einer Wochenzeile); der Titel läuft über alle
    // Stücke weiter: Folgestücke rücken ihn um ihren Abstand zum ersten
    // Stück derselben Zeile ein (--mc-span-x, data-mc-span)
    const annotateSpans = root => {
      const joined = [];
      for (const el of root.querySelectorAll("calendar-month-day-box-item")) {
        let left = false;
        let right = false;
        try {
          const occ = el.occurrence;
          const day = el.parentBox?.date;
          const start = occ?.startDate;
          const end = occ?.endDate;
          if (el.hasAttribute("allday") && day && start && end) {
            const next = day.clone();
            next.day += 1;
            const cell = el.closest("td");
            const row = cell?.parentElement;
            const col = cell ? [...row.children].indexOf(cell) : -1;
            left = day.compare(start) > 0 && col > 0;
            right = next.compare(end) < 0 && col >= 0 && col < row.children.length - 1;
          }
        } catch {}
        el.toggleAttribute("data-mc-join-l", left);
        el.toggleAttribute("data-mc-join-r", right);
        if (left) {
          joined.push(el);
        } else if (el.hasAttribute("data-mc-span")) {
          el.removeAttribute("data-mc-span");
          el.style.removeProperty("--mc-span-x");
        }
      }
      for (const el of joined) {
        let dx = null;
        try {
          const id = el.occurrence?.hashId;
          const row = el.closest("tr");
          const first = id && row && [...row.querySelectorAll("calendar-month-day-box-item[allday]:not([data-mc-join-l])")]
            .find(x => x.occurrence?.hashId == id);
          const a = el.querySelector(".event-name-label")?.getBoundingClientRect();
          const b = first?.querySelector(".event-name-label")?.getBoundingClientRect();
          // ohne Layout (verdeckte Ansicht) den letzten Einzug behalten; nie
          // gemessene Folgestücke zeigen keinen Titel
          if (a?.width && b?.width) {
            dx = Math.round((a.left - b.left) * 10) / 10;
          }
        } catch {}
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
        let pending = false;
        const run = () => {
          pending = false;
          annotateEmoji(root);
          if (id == "view-box") {
            annotateSpans(root);
          }
        };
        const mo = new w.MutationObserver(() => {
          if (!pending) {
            pending = true;
            // Zeitgeber statt requestAnimationFrame: läuft auch, wenn das Fenster verdeckt ist
            w.setTimeout(run, 16);
          }
        });
        mo.observe(root, { childList: true, subtree: true, characterData: true });
        // Spaltenbreiten ändern sich mit dem Fenster – Einzug der Balkentitel neu messen
        let ro = null;
        if (id == "view-box" && w.ResizeObserver) {
          ro = new w.ResizeObserver(() => {
            if (!pending) {
              pending = true;
              w.setTimeout(run, 16);
            }
          });
          // auch die Ansichten selbst: beim Wechsel zu Monat/Mehrwochen bekommen sie erst dann eine Größe
          for (const v of [root, ...root.querySelectorAll(":scope > *")]) {
            ro.observe(v);
          }
        }
        const prefObs = { observe: () => { resetEmojiRules(); annotateEmoji(root); } };
        Services.prefs.addObserver(EMOJI_PREF, prefObs);
        Services.prefs.addObserver(EMOJI_CUSTOM_PREF, prefObs);
        run();
        this.restorers.push(() => {
          mo.disconnect();
          ro?.disconnect();
          Services.prefs.removeObserver(EMOJI_PREF, prefObs);
          Services.prefs.removeObserver(EMOJI_CUSTOM_PREF, prefObs);
          for (const label of root.querySelectorAll("[data-mc-emoji]")) {
            label.removeAttribute("data-mc-emoji");
          }
          for (const el of root.querySelectorAll("[data-mc-join-l], [data-mc-join-r], [data-mc-span]")) {
            el.removeAttribute("data-mc-join-l");
            el.removeAttribute("data-mc-join-r");
            el.removeAttribute("data-mc-span");
            el.style.removeProperty("--mc-span-x");
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
        } catch {}
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
        } catch {}
        for (const tree of w.document.querySelectorAll(".calendar-task-tree")) {
          if (!tree.mTreeView || typeof tree.refreshFromCalendar != "function") {
            continue;
          }
          for (const calendar of cals.filter(c => !c.getProperty("disabled"))) {
            try {
              tree.refreshFromCalendar(calendar);
            } catch {}
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
          } catch {}
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
      } catch {}
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
      hookSpacesToggle();
      hookSideFloat();
      hookMarkTags();
      UpdateNote.hook(w, this.restorers);
      FifthSpace.attach(w, this.restorers);
      hookLooseTabs(w, this.restorers);
      hookHoverLine(w, this.restorers);
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

  // Suchfeld wie Apple Mail: Lupe links, Platzhalter nur „Search“/„Suchen“
  // (ohne „…“ und ohne ⌘+K-Hinweis). Liegt im Shadow-DOM, daher hier statt CSS.
  styleSearch(w) {
    const bar = w.document.querySelector("global-search-bar");
    if (!bar?.shadowRoot || bar.shadowRoot.getElementById("mail-cards-search")) {
      return;
    }
    // eigener Text nur in Sprachen mit eigener Übersetzung (und Englisch) –
    // sonst bleibt Thunderbirds übersetzter Platzhalter
    const own = uiLanguage() != "en" || Services.locale.appLocaleAsBCP47.startsWith("en");
    // langer eigener Platzhalter („Alle Postfächer durchsuchen“) endet bei
    // schmalem Feld mit „…“ statt mitten im Wort
    // (Platzhalter als Block, damit sich messen lässt, ob er noch ganz hineinpasst)
    const ellipsis = `::slotted([slot="placeholder"]) { display: block !important; overflow: hidden !important; white-space: nowrap !important;${own ? " text-overflow: ellipsis !important;" : ""} }`;
    const style = w.document.createElementNS("http://www.w3.org/1999/xhtml", "style");
    style.id = "mail-cards-search";
    style.textContent = `
      .button { inset-inline-start: 4px !important; inset-inline-end: auto !important; }
      input { padding-inline: 30px 10px !important; }
      div { inset-inline-start: 30px !important; inset-inline-end: 10px !important; }
      ${ellipsis}
    `;
    bar.shadowRoot.appendChild(style);

    const placeholder = bar.querySelector('[slot="placeholder"]');
    const l10nId = placeholder?.getAttribute("data-l10n-id");
    if (placeholder && own) {
      placeholder.removeAttribute("data-l10n-id");
      placeholder.textContent = tr("Search");
    }
    // Feld höchstens so breit wie Lupe + Platzhalter + Innenabstand (in allen
    // Bereichen, auch bei breitem Fenster); wird es schmaler, endet der Zusatz
    // mit „…“, das erste Wort („Search“, „Kontakte“) aber nie abgeschnitten –
    // passt nicht einmal das, nur die Lupe. Gemessen wird der Text selbst
    // (Range), nicht sein Kasten, und gegen die sichtbare Innenbreite des Felds
    const li = bar.closest("li");
    const canvas = w.document.createElementNS("http://www.w3.org/1999/xhtml", "canvas");
    const textWidth = (node, end) => {
      const range = w.document.createRange();
      range.setStart(node, 0);
      range.setEnd(node, end);
      return range.getBoundingClientRect().width;
    };
    const fitPlaceholder = () => {
      const node = placeholder?.firstChild;
      if (!node || node.nodeType != 3 || !node.length) {
        return;
      }
      const text = node.data;
      const full = textWidth(node, text.length);
      if (!full) {
        return; // (noch nicht dargestellt)
      }
      const space = text.indexOf(" ");
      const word = space > 0 ? textWidth(node, space) : full;
      const ctx = canvas.getContext("2d");
      ctx.font = w.getComputedStyle(placeholder).font;
      const dots = ctx.measureText("…").width;
      // 30 px links (Lupe), 14 px rechts
      const fit = `${Math.ceil(30 + full + 14)}px`;
      if (li && li.style.getPropertyValue("--mc-search-fit") != fit) {
        li.style.setProperty("--mc-search-fit", fit);
      }
      const inner = bar.getBoundingClientRect().width - 30 - 10;
      const shown = inner + 1 >= full || inner >= word + (space > 0 ? dots : 0);
      placeholder.style.visibility = shown ? "" : "hidden";
    };
    const ro = placeholder ? new w.ResizeObserver(fitPlaceholder) : null;
    ro?.observe(placeholder);
    ro?.observe(bar);
    // anderer Bereich bzw. Ordner: neuer Text, neue Breite
    const mo = placeholder ? new w.MutationObserver(fitPlaceholder) : null;
    mo?.observe(placeholder, { childList: true, characterData: true, subtree: true });
    fitPlaceholder();
    this.restorers.push(() => {
      ro?.disconnect();
      mo?.disconnect();
      li?.style.removeProperty("--mc-search-fit");
      placeholder?.style.removeProperty("visibility");
      style.remove();
      if (placeholder && l10nId) {
        placeholder.setAttribute("data-l10n-id", l10nId);
        w.document.l10n?.translateElements([placeholder]);
      }
    });
  }

  // Ordnerliste ein-/ausblenden wie in Apple Mail: die Ordnerliste bleibt
  // stehen, Mailliste und Mail schieben sich mit ihrer linken Kante nach links
  // darüber und decken sie zu (beim Einblenden umgekehrt). Dauer und Kurve sind die macOS-Standardwerte für
  // Seitenleisten: 0,25 s, cubic-bezier(0.25, 0.1, 0.25, 1).
  // Thunderbird steuert die Breite über --folderPaneSplitter-width am Raster.
  // reverse: Klick während der Animation kehrt sie an der aktuellen Stelle um
  // (sonst, z. B. bei der Automatik, wird er ignoriert)
  // column: die Bereiche-Leiste läuft gleichzeitig mit (Seitenleisten-Knopf) –
  // die Ansicht wird dabei Bild für Bild breiter bzw. schmaler; im vertikalen
  // Layout nimmt die Leseansicht das gleich mit auf, statt im letzten Bild zu
  // springen
  animateSidebar(ab, splitter, onDone, reverse = false, column = false) {
    if (ab.__mcAnimating) {
      if (reverse) {
        ab.__mcReverse?.();
      }
      return;
    }
    const pane = ab.document.getElementById("folderPane");
    const grid = splitter.parentNode;
    const prop = "--folderPaneSplitter-width";
    const DURATION = motionMs(250);
    const curve = cubicBezier(0.25, 0.1, 0.25, 1);
    const collapsing = !splitter.isCollapsed;
    // Leseansicht vor jeder Änderung messen (beim Einblenden klappt Thunderbird
    // die Ordnerliste gleich auf und nimmt ihr die Breite)
    const msgBefore = ab.document.getElementById("messagePane")?.getBoundingClientRect().width || 0;
    let full;
    if (collapsing) {
      full = pane.getBoundingClientRect().width;
      // (gilt nur, solange Fenster und gespeicherte Breite gleich bleiben)
      pane.__mcShown = { full, grid: grid.getBoundingClientRect().width, saved: splitter.width };
    } else {
      splitter.isCollapsed = false;
      // Zielbreite: so breit wie vor dem Ausblenden (in engen Fenstern schmaler
      // als die gespeicherte des Teilers – sonst sprang sie im letzten Bild),
      // sonst die gespeicherte – gemessen wäre sie hier noch zu schmal (die
      // Leseansicht hält im Raster noch ihre volle Breite)
      const shownBefore = pane.__mcShown;
      const same = shownBefore && Math.abs(shownBefore.grid - grid.getBoundingClientRect().width) < 2 && shownBefore.saved == splitter.width;
      full = same ? shownBefore.full : Math.max(splitter.width || 0, pane.getBoundingClientRect().width);
      delete pane.__mcShown;
    }
    if (!full) {
      return;
    }
    const saved = grid.style.getPropertyValue(prop);
    // Vertikales Layout: die Mailliste ist die flexible Spalte – sie würde jedes
    // Bild breiter/schmaler und neu umbrochen (Karten), das ruckelt. Stattdessen
    // nimmt die Leseansicht die Breite auf, die Liste bleibt stehen
    const msgSplitter = ab.paneLayout?.messagePaneSplitter;
    const msgPane = ab.document.getElementById("messagePane");
    const vertical = Services.prefs.getIntPref("mail.pane_config.dynamic", 0) == 2 && msgSplitter && msgPane &&
      !msgSplitter.isCollapsed && msgBefore > 0;
    // Ausgangsbreite der Leseansicht vor dem Aufklappen – sonst schrumpfte sie beim
    // Einblenden währenddessen weiter und spränge am Ende zurück
    const msgStart = vertical ? msgBefore : 0;
    const msgProp = "--messagePaneSplitter-width";
    const msgSaved = vertical ? grid.style.getPropertyValue(msgProp) : "";
    // die Leseansicht ist etwas breiter als ihre Rastervariable (Rand/Teiler,
    // unter Windows samt Bildlaufleiste gut 12 px) – abziehen
    const msgVar = vertical ? parseFloat(ab.getComputedStyle(grid).getPropertyValue(msgProp)) : NaN;
    const msgExtra = Number.isFinite(msgVar) && Math.abs(msgBefore - msgVar) < 24 ? msgBefore - msgVar : 0;
    const inner = [...pane.children];
    // Inhalt der Ordnerliste behält seine volle Breite und bleibt stehen –
    // er wird nur von rechts her zugedeckt
    inner.forEach(el => (el.style.minWidth = `${full}px`));
    pane.style.overflow = "hidden";
    pane.style.minWidth = "0px"; // Thunderbirds Mindestbreite (100 px) würde die Animation stoppen
    pane.classList.add("mc-side-anim"); // (auch unsere 160 px)
    // Der Teiler fixiert die Ordnerliste beim Ändern der Fenstergröße mit
    // „width: …px !important“ – das hält sonst das Raster fest
    // (beim Ausblenden merken: das Einblenden stellt sie wieder her – ohne sie
    // legte Windows die Ordnerliste 11 px schmaler an als vorher)
    const lockedWidth = pane.style.getPropertyValue("width") || (collapsing ? "" : pane.__mcLockedWidth || "");
    if (collapsing) {
      pane.__mcLockedWidth = lockedWidth;
    } else {
      delete pane.__mcLockedWidth;
    }
    pane.style.removeProperty("width");
    // Endzustand vorab herstellen und messen (im selben Schritt, nichts wird
    // gezeichnet): danach greifen noch „Mailliste behält ihre Breite“ und die
    // Mindestbreite der Leseansicht – die Animation läuft genau dorthin, statt
    // im letzten Bild zu springen
    let endFolder = collapsing ? 0 : full;
    let endMsg = vertical ? (collapsing ? msgStart + full : msgStart - full) : 0;
    let endMsgProp = "";
    if (vertical) {
      const startProp = grid.style.getPropertyValue(prop);
      const startMsgProp = grid.style.getPropertyValue(msgProp);
      grid.style.setProperty(prop, collapsing ? "0px" : saved || `${full}px`);
      grid.style.setProperty(msgProp, `${Math.max(0, Math.round(endMsg - msgExtra))}px`);
      if (!collapsing) {
        // eingeblendet gelten wieder Mindestbreite und Sperre der Ordnerliste
        pane.style.minWidth = "";
        pane.classList.remove("mc-side-anim");
        if (lockedWidth) {
          pane.style.setProperty("width", `${full}px`, "important");
        }
      }
      this.offsetUpdaters?.forEach(fn => fn());
      endFolder = collapsing ? 0 : pane.getBoundingClientRect().width;
      endMsg = msgPane.getBoundingClientRect().width;
      endMsgProp = grid.style.getPropertyValue(msgProp) || ab.getComputedStyle(grid).getPropertyValue(msgProp);
      pane.style.minWidth = "0px";
      pane.classList.add("mc-side-anim");
      pane.style.removeProperty("width");
      grid.style.setProperty(prop, startProp || `${collapsing ? full : 0}px`);
      if (startMsgProp) {
        grid.style.setProperty(msgProp, startMsgProp);
      } else {
        grid.style.removeProperty(msgProp);
      }
    }
    // Breite der Ansicht am Anfang (mit der Bereiche-Leiste ändert sie sich)
    const gridStart = column ? grid.getBoundingClientRect().width : 0;
    const grow = () => (column ? grid.getBoundingClientRect().width - gridStart : 0);
    // Leseansicht für den aktuellen Fortschritt k und die aktuelle Breite der
    // Ansicht setzen. Mit der Bereiche-Leiste ruft auch deren Animation das in
    // jedem ihrer Bilder auf: sie startet ein Bild früher und läuft im
    // Hauptfenster – sonst nahm die Mailliste je Bild deren Schritt auf
    // (ESR: bis 27 px hin und her)
    const msgAt = () => {
      const from = msgStart - msgExtra;
      const to = parseFloat(endMsgProp);
      return (Number.isFinite(to) ? from + (to - from) * curve(k) : msgStart + (endMsg - msgStart) * curve(k) - msgExtra) + grow();
    };
    const top = column && vertical ? ab.browsingContext?.topChromeWindow : null;
    const follow = () => {
      if (!ab.closed) {
        grid.style.setProperty(msgProp, `${Math.max(0, msgAt())}px`);
      }
    };
    if (top) {
      top.__mcColumnFollow = follow;
    }
    // am Ende loslassen – läuft die Bereiche-Leiste noch, übernimmt sie das
    // (ruft follow ein letztes Mal und löscht es)
    const unfollow = () => {
      if (top?.__mcColumnFollow == follow && !top.__mcSpacesAnimating) {
        delete top.__mcColumnFollow;
      }
    };
    let relocked = false;
    // Breite der Mailliste vor dem Animieren: im vertikalen Layout bleibt sie stehen
    const threadPane = ab.document.getElementById("threadPane");
    const listStart = threadPane?.getBoundingClientRect().width || 0;
    ab.__mcAnimating = true;
    // Die Uhr läuft erst ab dem ersten gezeichneten Bild: beim Einblenden baut
    // Thunderbird die Ordnerliste zuerst neu auf, das würde sonst den Anfang
    // der Bewegung verschlucken und sie ruckartig starten lassen.
    // (Takt, Umkehr bei erneutem Klick und Bildablauf: der gemeinsame animiere())
    let k = 0;
    let anim = null;
    ab.__mcReverse = () => anim?.umkehren();
    // Breite der Ordnerliste und der Leseansicht für den Fortschritt k setzen
    const apply = () => {
      const shown = collapsing ? 1 - curve(k) : curve(k); // sichtbarer Anteil 1 → 0 bzw. 0 → 1
      const width = vertical ? (collapsing ? endFolder + (full - endFolder) * shown : endFolder * shown) : full * shown;
      grid.style.setProperty(prop, `${width}px`);
      // Mindestbreite = aktuelle Breite: die Spalte verhält sich wie am Ende (in
      // engen Fenstern hielt das Raster sie sonst bei 150 px fest, und sie
      // sprang im letzten Bild auf ihre Mindestbreite von 160 px)
      pane.style.minWidth = `${width}px`;
      if (vertical) {
        // Leseansicht gleichmäßig von ihrer Ausgangs- zur gemessenen Endbreite – als
        // Rastervariable, damit das letzte Bild genau dem Endwert entspricht (unter
        // Windows ändert sich unterwegs der Zuschlag für die Bildlaufleiste)
        grid.style.setProperty(msgProp, `${Math.max(0, msgAt())}px`);
      }
    };
    // Endzustand kurz herstellen (Platzaufteilung der Toolbar vorab rechnen, siehe toggleSidebar)
    ab.__mcJump = to => {
      const keep = k;
      k = to;
      apply();
      k = keep;
    };
    const bildSetzen = kk => {
      k = kk;
      // setzt Thunderbird währenddessen eine neue Sperre, gilt sie dem
      // Zwischenstand – entfernen und am Ende durch die volle Breite ersetzen
      if (pane.style.getPropertyPriority("width") == "important") {
        relocked = true;
        pane.style.removeProperty("width");
      }
      apply();
      this.offsetUpdaters?.forEach(fn => fn());
    };
    const ende = kk => {
      k = kk;
      delete ab.__mcReverse;
      delete ab.__mcJump;
      unfollow();
      inner.forEach(el => (el.style.minWidth = ""));
      pane.style.overflow = "";
      pane.style.minWidth = "";
      pane.classList.remove("mc-side-anim");
      if (k <= 0) {
        // umgekehrt und wieder am Anfang: Ausgangszustand herstellen
        if (vertical) {
          if (msgSaved) {
            grid.style.setProperty(msgProp, msgSaved);
          } else {
            grid.style.removeProperty(msgProp);
          }
        }
        if (collapsing) {
          // bleibt eingeblendet
          delete pane.__mcShown;
          delete pane.__mcLockedWidth;
          if (saved) {
            grid.style.setProperty(prop, saved);
          } else {
            grid.style.removeProperty(prop);
          }
          if (lockedWidth || relocked) {
            pane.style.setProperty("width", `${full}px`, "important");
          }
        } else {
          // bleibt ausgeblendet (wie vorher, samt Breite fürs nächste Einblenden)
          pane.__mcShown = { full, grid: grid.getBoundingClientRect().width, saved: splitter.width };
          pane.__mcLockedWidth = lockedWidth;
          splitter.isCollapsed = true;
        }
        ab.__mcAnimating = false;
        onDone?.();
        ab.setTimeout(() => this.offsetUpdaters?.forEach(fn => fn()), 30);
        return;
      }
      if ((lockedWidth || relocked) && !collapsing) {
        pane.style.setProperty("width", `${full}px`, "important");
      }
      if (vertical) {
        // Endbreite der Leseansicht wie beim Ziehen am Teiler übernehmen (Thunderbird speichert sie)
        // Endbreite direkt als Rastervariable (wie Thunderbirds Teiler es tut) – über
        // msgSplitter.width rechnet Thunderbird selbst um, die Liste sprang dann ein Bild lang
        const msg = Math.round(endMsg - msgExtra);
        if (endMsgProp && column && Number.isFinite(parseFloat(endMsgProp))) {
          grid.style.setProperty(msgProp, `${parseFloat(endMsgProp) + grow()}px`);
        } else if (endMsgProp) {
          grid.style.setProperty(msgProp, endMsgProp);
        } else if (msg > 0) {
          grid.style.setProperty(msgProp, `${msg}px`);
        } else if (msgSaved) {
          grid.style.setProperty(msgProp, msgSaved);
        } else {
          grid.style.removeProperty(msgProp);
        }
      }
      if (collapsing) {
        splitter.isCollapsed = true; // setzt die Variable selbst auf 0px
        // ESR 153 gibt die 1-px-Spur des Teilers erst danach frei – die Liste
        // wäre ein Bild lang breiter: Leseansicht im selben Schritt angleichen
        if (vertical && listStart) {
          const drift = (threadPane.getBoundingClientRect().width || listStart) - listStart;
          if (Math.abs(drift) >= 0.5) {
            const now = parseFloat(grid.style.getPropertyValue(msgProp)) || parseFloat(ab.getComputedStyle(grid).getPropertyValue(msgProp));
            if (Number.isFinite(now)) {
              grid.style.setProperty(msgProp, `${now + drift}px`);
            }
          }
        }
      } else if (saved) {
        grid.style.setProperty(prop, saved);
      } else {
        grid.style.removeProperty(prop);
      }
      ab.__mcAnimating = false;
      onDone?.();
      ab.setTimeout(() => this.offsetUpdaters?.forEach(fn => fn()), 30);
    };
    // erstes Bild sofort setzen, damit nichts aufblitzt (auch nach der Vorab-
    // Messung des Endzustands, die Thunderbirds Teiler mit verstellt)
    grid.style.setProperty(prop, `${collapsing ? full : 0}px`);
    pane.style.minWidth = `${collapsing ? full : 0}px`;
    if (vertical) {
      grid.style.setProperty(msgProp, `${msgStart - msgExtra}px`);
    }
    // Toolbar-Knöpfe gleich an den Anfang – sonst standen sie ein Bild lang
    // am Endplatz der Vorab-Messung bzw. an Thunderbirds sofort voller
    // Breite und sprangen dann zurück (Flackern oben beim Einblenden); die
    // Platzaufteilung bleibt die des Endes (__mcAnimating)
    this.offsetUpdaters?.forEach(fn => fn());
    pane.getBoundingClientRect(); // Aufbau der Ordnerliste jetzt erzwingen, nicht im ersten Bild
    // apply() rechnet den Verlauf selbst aus k: der Takt liefert hier k unverändert
    anim = animiere(ab, { dauer: DURATION, kurve: p => p, bild: (p, kk) => bildSetzen(kk), ende });
  }

  // Titel und Anzahl der Kopfzeile aus dem aktuellen Mail-Tab übernehmen
  // Stern-Knopf der Symbolleiste: gefüllt, wenn die (erste) gewählte Mail
  // im vorderen Tab einen Stern hat
  updateStarButton(w) {
    const li = w?.document?.querySelector('#unifiedToolbarContent > li[item-id="mark-as"]');
    if (!li) {
      return;
    }
    let starred = false;
    try {
      starred = !!w.document.getElementById("tabmail")?.currentTabInfo?.message?.isFlagged;
    } catch {}
    li.toggleAttribute("mc-starred", starred);
  }

  updateListHeader(w) {
    const d = w.document;
    const box = d.getElementById("mcListHeader");
    const tab = d.getElementById("tabmail")?.currentTabInfo;
    if (box && tab?.mode?.name == "addressBookTab") {
      this.updateAbHeader(box, tab.browser?.contentWindow);
      return;
    }
    if (box && tab?.mode?.name == "tasks") {
      this.updateTaskHeader(w, box);
      return;
    }
    const ab = d.getElementById("tabmail")?.currentAbout3Pane;
    this.syncQuickFilterToggle(w);
    if (!box || !ab?.document) {
      return;
    }
    const filter = box.querySelector(".mc-lh-filter");
    if (filter) {
      const on = this.unreadFilterOn(ab);
      filter.setAttribute("aria-pressed", String(on));
      filter.title = tr(on ? "Disable Message Filter" : "Enable Message Filter");
    }
    const more = box.querySelector(".mc-lh-more");
    if (more) {
      more.title = tr("Message List Display Options"); // (Aufgaben setzen einen eigenen Titel)
    }
    const title = box.querySelector(".mc-lh-title");
    const count = box.querySelector(".mc-lh-count");
    try {
      const folder = ab.gFolder;
      if (this.isSearchFolder(folder)) {
        // Suche: „Suche“ und „Alle Postfächer, 12 Treffer“ wie Apple Mail
        const n = ab.gDBView?.numMsgsInView || 0;
        title.textContent = tr("Searching");
        const base = this.searchBase(ab);
        count.textContent = (this.isUnifiedFolder(base) ? tr("All Mailboxes") : appleFolderName(base)) + ", " +
          tr(n == 1 ? "{n} result" : "{n} results", { n: n.toLocaleString(Services.locale.appLocaleAsBCP47) });
        return;
      }
      title.textContent = folder ? appleFolderTitle(folder) : ab.document.title || "";
      count.classList.toggle("mc-lh-filtered", this.unreadFilterOn(ab));
      if (this.unreadFilterOn(ab)) {
        // wie Apple Mail: „Gefiltert nach: Ungelesen“ statt der Anzahl
        const labels = FILTER_CHOICES.filter(([key]) => this.filterCriteria().includes(key)).map(([, label]) => tr(label));
        count.textContent = tr("Filtered by: {list}", { list: labels.join(", ") });
        return;
      }
      const n = folder?.getTotalMessages(false) || ab.gDBView?.numMsgsInView || 0;
      count.textContent = folder || ab.gDBView
        ? tr(n == 1 ? "{n} message" : "{n} messages", { n: n.toLocaleString(Services.locale.appLocaleAsBCP47) })
        : "";
    } catch (e) {
      log("list header error", e);
    }
  }

  // Kopfzeile über der Aufgabenliste: gewählter Filter („Current Tasks“ …) und
  // Anzahl der Aufgaben; Filter-Knopf getönt, wenn nicht der Standardfilter gilt
  updateTaskHeader(w, box) {
    const d = w.document;
    const group = d.getElementById("task-tree-filtergroup");
    const tree = d.getElementById("calendar-task-tree");
    const radio = group && ([...group.querySelectorAll("radio")].find(r => r.selected || r.value == group.value));
    const own = TASK_LISTS.find(([key]) => isTaskListFilter(tree?.getAttribute("filterValue"), key));
    box.querySelector(".mc-lh-title").textContent = own ? tr(own[1]) : radio?.label || radio?.getAttribute("label") || tr("Tasks");
    const n = tree?.mTaskArray?.length || 0;
    let count = tr(n == 1 ? "{n} task" : "{n} tasks", { n: n.toLocaleString(Services.locale.appLocaleAsBCP47) });
    // Hinweis „bitte einen beschreibbaren Kalender wählen“ unter dem Titel (wie Apple
    // Erinnerungen) statt neben dem „+“ – dort stehen jetzt die Aktionen
    const field = d.getElementById("view-task-edit-field");
    if (field?.readOnly && field.value) {
      count += " · " + field.value;
    }
    box.querySelector(".mc-lh-count").textContent = count;
    const filter = box.querySelector(".mc-lh-filter");
    const on = (group?.value || "throughcurrent") != "throughcurrent";
    filter?.setAttribute("aria-pressed", String(on));
    if (filter) {
      filter.title = tr("Filter Tasks");
    }
    const more = box.querySelector(".mc-lh-more");
    if (more) {
      more.title = tr("Task List Display Options");
    }
  }

  // Kopfzeile über der Kontaktliste: gewähltes Adressbuch und Anzahl der
  // (sichtbaren) Kontakte; aktualisiert sich bei Auswahl und Suche.
  updateAbHeader(box, cw) {
    // eigener Tooltip (sonst blieb der des zuletzt gewählten Bereichs stehen)
    const more = box.querySelector(".mc-lh-more");
    if (more) {
      more.title = tr("Contact List Display Options");
    }
    const title = box.querySelector(".mc-lh-title");
    const count = box.querySelector(".mc-lh-count");
    const books = cw?.booksList;
    const list = cw?.cardsPane?.cardsList;
    if (!books || !list) {
      return;
    }
    if (!cw.__mcHeaderHook) {
      cw.__mcHeaderHook = true;
      // nur solange das Adressbuch vorne ist: die Kopfzeile steht auch über der
      // Mailliste, und die Kontaktliste ändert sich im Hintergrund (gesammelte
      // Adressen, CardDAV). Beim Zurückwechseln füllt updateListHeader sie neu.
      const update = () => !cw.closed && cw.setTimeout(() => {
        const tab = box.ownerDocument.getElementById("tabmail")?.currentTabInfo;
        if (tab?.browser?.contentWindow == cw) {
          this.updateAbHeader(box, cw);
        }
      }, 0);
      const search = cw.cardsPane.searchInput;
      books.addEventListener("select", update);
      search?.addEventListener("autocomplete", update);
      const mo = new cw.MutationObserver(update);
      mo.observe(list, { childList: true, subtree: true });
      this.addWinRestorer(cw, () => {
        books.removeEventListener("select", update);
        search?.removeEventListener("autocomplete", update);
        mo.disconnect();
        delete cw.__mcHeaderHook;
      });
    }
    try {
      const row = books.getRowAtIndex?.(books.selectedIndex) || books.selectedRow;
      const name = row?.querySelector(".bookRow-name, .listRow-name, span")?.textContent || row?.textContent || "";
      title.textContent = name.trim();
      const n = list.view?.rowCount ?? 0;
      count.textContent = tr(n == 1 ? "{n} contact" : "{n} contacts", { n: n.toLocaleString(Services.locale.appLocaleAsBCP47) });
    } catch (e) {
      log("ab header error", e);
    }
  }

  // Bereiche-Leiste wie die Ordnerliste animieren: Breite 0 ↔ 89 px über
  // --mc-spaces-w (userChrome.css leitet --spaces-total-width davon ab), die
  // Leiste schiebt sich dabei von links herein bzw. hinaus.
  // reverse: Klick während der Animation kehrt sie an der aktuellen Stelle um
  // (sonst, z. B. bei der Automatik, wird er ignoriert)
  animateSpaces(w, onDone, reverse = false) {
    const spaces = w.gSpacesToolbar;
    const root = w.document.documentElement;
    if (w.__mcSpacesAnimating && reverse) {
      w.__mcSpacesReverse?.();
      return;
    }
    if (!spaces || w.__mcSpacesAnimating) {
      return;
    }
    const FULL = 89;
    const DURATION = motionMs(250);
    const curve = cubicBezier(0.25, 0.1, 0.25, 1);
    const showing = spaces.isHidden;
    // Die Breite nicht als Variable am Wurzelelement ändern – das ließe
    // Thunderbird pro Bild alle ~5000 Elemente des Fensters neu durchrechnen
    // (~20 ms, die Animation ruckelt). Stattdessen direkt an den fünf
    // Elementen, die sich bewegen; am Ende wieder entfernen.
    const d = w.document;
    const bar = d.getElementById("spacesToolbar");
    const body = d.getElementById("messengerBody");
    const title = d.getElementById("titlebar");
    const row = d.getElementById("unifiedToolbarContainer");
    // Mac: Platz für die Ampel (--mc-tl-reserve) wechselt von 12 auf 84 px, sobald die Bereiche-Leiste weg ist –
    // mitführen, sonst springt der Seitenleisten-Knopf am Ende um 72 px
    const followReserve = w.matchMedia("(-moz-platform: macos)").matches;
    const set = v => {
      const px = `${v}px`;
      if (followReserve && row) {
        row.style.setProperty("--mc-tl-reserve", `${Math.round(12 + 72 * (1 - v / FULL))}px`);
      }
      bar?.style.setProperty("--spaces-total-width", px);
      if (body) {
        body.style.marginInlineStart = px;
      }
      if (title) {
        title.style.marginInlineStart = px;
      }
      if (row) {
        row.style.inlineSize = `calc(100vw - ${px})`;
      }
      // gemeinsame Animation mit der Ordnerliste: Leseansicht im selben Bild
      // nachziehen, die Mailliste bleibt stehen (animateSidebar, column)
      w.__mcColumnFollow?.();
    };
    const clear = () => {
      bar?.style.removeProperty("--spaces-total-width");
      body?.style.removeProperty("margin-inline-start");
      title?.style.removeProperty("margin-inline-start");
      row?.style.removeProperty("inline-size");
      row?.style.removeProperty("--mc-tl-reserve");
    };
    w.__mcSpacesAnimating = true;
    w.__mcSpacesJump = v => set(v * FULL);
    if (showing) {
      set(0);
      spaces.toggleToolbar(false);
      root.getBoundingClientRect(); // Aufbau jetzt erzwingen, nicht im ersten Bild
    }
    // Fortschritt k läuft vor (dir 1) oder nach einer Umkehr zurück (dir -1)
    let k = 0, dir = 1, last = null;
    w.__mcSpacesReverse = () => {
      dir = -dir;
    };
    const step = now => {
      k = Math.min(1, Math.max(0, k + (last === null ? 0 : dir * (now - last) / DURATION)));
      last = now;
      set(FULL * (showing ? curve(k) : 1 - curve(k)));
      if (dir > 0 ? k < 1 : k > 0) {
        w.requestAnimationFrame(step);
        return;
      }
      const shown = showing == (k >= 1);
      if (!shown && !spaces.isHidden) {
        spaces.toggleToolbar(true);
      }
      clear();
      root.style.removeProperty("--mc-spaces-w");
      w.__mcColumnFollow?.();
      delete w.__mcColumnFollow;
      delete w.__mcSpacesJump;
      w.__mcSpacesAnimating = false;
      delete w.__mcSpacesReverse;
      onDone?.();
      const realign = () => {
        this.offsetUpdaters?.forEach(fn => fn());
        this.sideEdgeUpdaters?.forEach(fn => fn());
      };
      realign();
      w.setTimeout(realign, 30);
    };
    w.requestAnimationFrame(() => w.requestAnimationFrame(step));
  }

  // ---------------------------------------------------------------------------
  // Schnellfenster „Neuer Termin / Neue Aufgabe“ wie in Apple Kalender: ein
  // Popover am „+“ mit den wichtigsten Feldern; „Mehr Optionen …“ öffnet
  // Thunderbirds großes Fenster mit allen Eingaben. Gespeichert wird über
  // Thunderbirds eigene Transaktion (damit „Rückgängig“ funktioniert).
  // ---------------------------------------------------------------------------
  // preset (Doppelklick im Kalender): { start: Date, allDay, at: {x, y} (Bildschirm), calendar }
  openQuickCreate(w, mode = "event", anchor = null, preset = null) {
    const d = w.document;
    const X = "http://www.w3.org/1999/xhtml";
    const locale = regionLocale();
    let cal, CalEvent, CalTodo, CalAlarm, CalRecurrenceInfo;
    try {
      ({ cal } = ChromeUtils.importESModule("resource:///modules/calendar/calUtils.sys.mjs"));
      ({ CalEvent } = ChromeUtils.importESModule("resource:///modules/CalEvent.sys.mjs"));
      ({ CalTodo } = ChromeUtils.importESModule("resource:///modules/CalTodo.sys.mjs"));
      ({ CalAlarm } = ChromeUtils.importESModule("resource:///modules/CalAlarm.sys.mjs"));
      ({ CalRecurrenceInfo } = ChromeUtils.importESModule("resource:///modules/CalRecurrenceInfo.sys.mjs"));
    } catch (e) {
      log("quick create import error", String(e).slice(0, 160));
      w.goDoCommand(mode == "task" ? "calendar_new_todo_command" : "calendar_new_event_command");
      return;
    }
    const el = (tag, props = {}, ...kids) => {
      const node = d.createElementNS(X, tag);
      for (const [k, v] of Object.entries(props)) {
        if (k == "class") {
          node.className = v;
        } else if (k in node && typeof v != "string") {
          node[k] = v;
        } else {
          node.setAttribute(k, v);
        }
      }
      node.append(...kids);
      return node;
    };
    const pad = n => String(n).padStart(2, "0");
    const dateValue = dt => `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`;
    const timeValue = dt => `${pad(dt.getHours())}:${pad(dt.getMinutes())}`;
    const parse = (dateStr, timeStr) => {
      const [y, m, day] = (dateStr || "").split("-").map(Number);
      const [hh, mm] = (timeStr || "00:00").split(":").map(Number);
      return y ? laterHour(new Date(y, m - 1, day, hh || 0, mm || 0)) : null;
    };
    // Uhrzeit in der doppelten Stunde (Ende der Sommerzeit): die zweite, wie der
    // Kalender selbst sie speichert (Wanduhrzeit mit Zeitzone) – sonst wäre der
    // angelegte Termin eine Stunde kürzer als im Schnellfenster angezeigt
    function laterHour(dt) {
      const next = new Date(dt.getTime() + 3600000);
      return next.getHours() == dt.getHours() && next.getMinutes() == dt.getMinutes() ? next : dt;
    }
    // Dauer als echte Dauer rechnen (wie Apple Kalender): „2 Stunden“ bleiben auch über
    // die Zeitumstellung zwei echte Stunden. Weil die
    // Felder nur Wanduhrzeit zeigen, merkt sich jedes Feldpaar den genauen Zeitpunkt
    // (die doppelte Stunde wäre sonst mehrdeutig) und nutzt ihn, solange die Felder passen
    const plusMinutes = (dt, min) => new Date(dt.getTime() + min * 60000);
    const setWhen = (di, ti, dt) => {
      di.value = dateValue(dt);
      ti.value = timeValue(dt);
      di.__mcExact = dt;
    };
    const when = (di, ti, time = ti.value) => {
      const x = di.__mcExact;
      return x && dateValue(x) == di.value && timeValue(x) == time ? x : parse(di.value, time);
    };
    const fmtDate = systemDateFormat();
    const fmtTime = new Intl.DateTimeFormat(locale, { hour: "2-digit", minute: "2-digit" });
    const toCal = (js, dateOnly) => {
      const dt = cal.dtz.jsDateToDateTime(js, cal.dtz.defaultTimezone);
      if (dateOnly) {
        dt.isDate = true;
      }
      return dt;
    };

    let panel = d.getElementById("mcQuickPanel");
    if (!panel) {
      panel = d.createXULElement("panel");
      panel.id = "mcQuickPanel";
      panel.setAttribute("type", "arrow");
      const f = {};
      f.segEvent = el("button", { type: "button", "data-mode": "event" }, tr("Event"));
      f.segTask = el("button", { type: "button", "data-mode": "task" }, tr("Task"));
      f.title = el("input", { class: "mc-qc-title", type: "text" });
      f.line1 = el("div", { class: "mc-qc-line1" });
      f.line2 = el("div", { class: "mc-qc-line2" });
      f.summary = el("div", { class: "mc-qc-summary", tabindex: "0" }, f.line1, f.line2);
      f.allDay = el("input", { type: "checkbox" });
      f.startDate = el("input", { type: "date" });
      f.startTime = el("input", { type: "time" });
      f.endDate = el("input", { type: "date" });
      f.endTime = el("input", { type: "time" });
      f.hasDue = el("input", { type: "checkbox" });
      f.dueDate = el("input", { type: "date" });
      f.dueTime = el("input", { type: "time" });
      const options = (pairs) => pairs.map(([v, label]) => el("option", { value: v }, label));
      f.repeat = el("select", {}, ...options([
        ["", tr("Never")], ["DAILY", tr("Every Day")], ["WEEKLY", tr("Every Week")],
        ["MONTHLY", tr("Every Month")], ["YEARLY", tr("Every Year")], ["CUSTOM", tr("Custom…")],
      ]));
      f.alert = el("select", {}, ...options([
        ["", tr("None")], ["PT0M", tr("At time of event")], ["PT5M", tr("5 minutes before")],
        ["PT15M", tr("15 minutes before")], ["PT30M", tr("30 minutes before")],
        ["PT1H", tr("1 hour before")], ["P1D", tr("1 day before")], ["CUSTOM", tr("Custom…")],
      ]));
      f.showAs = el("select", {}, ...options([["OPAQUE", tr("Busy")], ["TRANSPARENT", tr("Free")]]));
      const row = (label, cls, ...ctrls) => el("div", { class: `mc-qc-row ${cls || ""}` }, el("label", {}, label), el("div", { class: "mc-qc-ctrl" }, ...ctrls));
      f.details = el("div", { class: "mc-qc-details" },
        row(tr("All Day"), "mc-ev", f.allDay),
        row(tr("Starts"), "mc-ev", f.startDate, f.startTime),
        row(tr("Ends"), "mc-ev", f.endDate, f.endTime),
        row(tr("Due"), "mc-td", f.hasDue, f.dueDate, f.dueTime),
        row(tr("Repeat"), "mc-ev", f.repeat),
        row(tr("Alert"), "", f.alert),
        row(tr("Show As"), "mc-ev", f.showAs),
      );
      f.time = el("div", { class: "mc-qc-time mc-qc-card" }, f.summary, f.details);
      f.main = el("div", { class: "mc-qc-main" }, el("div", { class: "mc-qc-card mc-qc-titlecard" }, f.title), f.time);
      f.location = el("input", { class: "mc-qc-card mc-qc-field mc-ev-only", type: "text", placeholder: tr("Add Location") });
      f.invitees = el("button", { type: "button", class: "mc-qc-card mc-qc-field mc-qc-placeholder mc-ev-only" }, tr("Add Invitees…"));
      f.calendar = el("select", { class: "mc-qc-calsel" });
      f.calCard = el("div", { class: "mc-qc-card mc-qc-field mc-qc-calcard" }, f.calendar);
      f.notes = el("textarea", { class: "mc-qc-card mc-qc-field", rows: "2", placeholder: tr("Add Notes or URL") });
      f.more = el("button", { type: "button", class: "mc-qc-link" }, tr("More Options…"));
      f.cancel = el("button", { type: "button", class: "mc-qc-btn" }, tr("Cancel"));
      f.add = el("button", { type: "button", class: "mc-qc-btn mc-qc-primary" }, tr("Add"));
      const root = el("div", { class: "mc-qc" },
        el("div", { class: "mc-qc-seg" }, f.segEvent, f.segTask),
        f.main, f.location, f.invitees, f.calCard, f.notes,
        el("div", { class: "mc-qc-footer" }, f.more, el("span", { class: "mc-qc-spacer" }), f.cancel, f.add),
      );
      panel.append(root);
      (d.getElementById("mainPopupSet") || d.documentElement).append(panel);
      panel.__mc = f;
      this.restorers.push(() => panel.remove());

      // --- Verhalten ---
      const state = { mode: "event" };
      panel.__mcState = state;
      const writable = c => {
        try {
          return cal.acl.isCalendarWritable(c) && cal.acl.userCanAddItemsToCalendar(c);
        } catch {
          return !c.readOnly;
        }
      };
      const calendars = () => cal.manager.getCalendars().filter(c =>
        writable(c) && !c.getProperty("disabled") &&
        (state.mode == "task" ? c.getProperty("capabilities.tasks.supported") !== false
          : c.getProperty("capabilities.events.supported") !== false));
      const color = c => c?.getProperty("color") || "#8E8E93";
      const fillCalendars = () => {
        const list = calendars();
        const current = f.calendar.value;
        f.calendar.replaceChildren(...list.map(c => el("option", { value: c.id }, c.name)));
        let def = null;
        try {
          def = w.getSelectedCalendar?.();
        } catch {}
        f.calendar.value = list.some(c => c.id == current) ? current : (list.some(c => c.id == def?.id) ? def.id : list[0]?.id || "");
        // kein passender Kalender (z. B. keiner kann Aufgaben): sagen statt still nichts tun
        if (!list.length) {
          f.calendar.replaceChildren(el("option", { value: "" },
            state.mode == "task" ? tr("No calendar for tasks") : tr("No writable calendar")));
        }
        f.add.disabled = !list.length;
        f.more.disabled = !list.length;
        updateColor();
      };
      const selectedCalendar = () => cal.manager.getCalendarById(f.calendar.value);
      const updateColor = () => {
        root.style.setProperty("--mc-qc-color", color(selectedCalendar()));
        panel.__mcGhost?.style.setProperty("--mc-ghost-color", color(selectedCalendar()));
      };
      const updateSummary = () => {
        if (state.mode == "task") {
          // Erinnerung braucht eine Fälligkeit (sonst ginge sie beim Anlegen verloren)
          if (f.alert.value && !f.hasDue.checked) {
            f.hasDue.checked = true;
            root.toggleAttribute("data-due", true);
          }
          const due = f.hasDue.checked ? parse(f.dueDate.value, f.dueTime.value) : null;
          f.line1.textContent = due ? `${tr("Due")} ${fmtDate.format(due)} ${fmtTime.format(due)}` : tr("No Due Date");
          f.line2.textContent = f.alert.value ? chosen(f.alert) : tr("Add Due Date or Alert");
          return;
        }
        const s = parse(f.startDate.value, f.startTime.value);
        const e = parse(f.endDate.value, f.endTime.value);
        if (!s) {
          f.line1.textContent = "";
        } else if (f.allDay.checked) {
          const sameDay = !e || f.startDate.value == f.endDate.value;
          f.line1.textContent = sameDay ? `${fmtDate.format(s)}  ${tr("all-day")}` : `${fmtDate.format(s)} – ${fmtDate.format(e)}`;
        } else {
          const sameDay = e && f.startDate.value == f.endDate.value;
          f.line1.textContent = sameDay
            ? `${fmtDate.format(s)}  ${fmtTime.format(s)} – ${fmtTime.format(e)}`
            : `${fmtDate.format(s)} ${fmtTime.format(s)} – ${e ? `${fmtDate.format(e)} ${fmtTime.format(e)}` : ""}`;
        }
        const set = [f.repeat, f.alert].filter(x => x.value).map(chosen);
        f.line2.textContent = set.length ? set.join(" · ") : tr("Add Alert or Repeat");
      };
      // gewählte Wiederholung/Erinnerung als Text („Wöchentlich · 15 Minuten vorher“)
      function chosen(select) {
        const label = select.selectedOptions[0]?.textContent || "";
        return select == f.alert ? `${tr("Alert")}: ${label}` : label;
      }
      // „Custom…“ bei Wiederholung und Erinnerung: Thunderbirds eigene Dialoge
      // (wie im großen Fenster); Abbrechen lässt die vorige Auswahl stehen
      const customOption = select => select.querySelector('option[value="CUSTOM"]');
      const resetCustom = () => {
        panel.__mcRecurrence = null;
        panel.__mcAlarms = null;
        customOption(f.repeat).textContent = tr("Custom…");
        customOption(f.alert).textContent = tr("Custom…");
      };
      panel.__mcResetCustom = resetCustom;
      const modal = (url, args) => {
        // das Fenster bleibt offen, während der Dialog den Fokus hat
        panel.setAttribute("noautohide", "true");
        try {
          w.openDialog(url, "_blank", "chrome,titlebar,modal,resizable,centerscreen", args);
        } finally {
          panel.removeAttribute("noautohide");
        }
      };
      const lastChoice = new WeakMap([[f.repeat, ""], [f.alert, ""]]);
      for (const input of [f.repeat, f.alert]) {
        input.addEventListener("change", () => {
          if (input.value == "CUSTOM") {
            const draft = buildItem({ plain: true }).item;
            let ok = false;
            if (input == f.repeat) {
              modal("chrome://calendar/content/calendar-event-dialog-recurrence.xhtml", {
                calendarEvent: draft,
                recurrenceInfo: panel.__mcRecurrence || null,
                startTime: draft.startDate,
                endTime: draft.endDate,
                onOk: info => {
                  panel.__mcRecurrence = info;
                  ok = !!info;
                },
              });
              if (ok) {
                const { recurrenceRule2String } = ChromeUtils.importESModule("resource:///modules/calendar/calRecurrenceUtils.sys.mjs");
                // nur die erste Zeile („Occurs every 2 weeks“), ohne Beginn und Uhrzeit
                const text = recurrenceRule2String(panel.__mcRecurrence, draft.startDate, draft.endDate, draft.startDate.isDate) || "";
                customOption(f.repeat).textContent = text.split("\n")[0].replace(/[.,;:]\s*$/, "").trim() || tr("Custom…");
              }
            } else {
              modal("chrome://calendar/content/calendar-event-dialog-reminder.xhtml", {
                reminders: panel.__mcAlarms || [],
                item: draft,
                timezone: cal.dtz.defaultTimezone,
                calendar: selectedCalendar(),
                onOk: reminders => {
                  panel.__mcAlarms = reminders;
                  ok = reminders.length > 0;
                },
                onCancel() {},
              });
              if (ok) {
                const alarms = panel.__mcAlarms;
                customOption(f.alert).textContent = alarms.length == 1
                  ? alarms[0].toString(draft)
                  : tr("{n} alerts", { n: alarms.length });
              }
            }
            if (!ok) {
              input.value = lastChoice.get(input);
            }
          }
          lastChoice.set(input, input.value);
          updateSummary();
        });
      }
      const setMode = m => {
        state.mode = m;
        root.dataset.mode = m;
        f.segEvent.toggleAttribute("selected", m == "event");
        f.segTask.toggleAttribute("selected", m == "task");
        f.title.placeholder = m == "task" ? tr("New Task") : tr("New Event");
        fillCalendars();
        updateSummary();
        panel.__mcApplyNatural?.();
      };
      panel.__mcSetMode = setMode;
      // Aufgabe statt Termin: kein vorläufiger Termin im Tag
      for (const seg of [f.segEvent, f.segTask]) {
        seg.addEventListener("click", () => {
          if (state.mode == "task" && panel.__mcGhost) {
            panel.__mcGhost.remove();
            panel.__mcGhost = null;
            panel.removeAttribute("mc-tip");
          }
        });
      }
      panel.__mcUpdate = updateSummary;
      panel.__mcFillCalendars = fillCalendars;
      f.segEvent.addEventListener("click", () => setMode("event"));
      f.segTask.addEventListener("click", () => setMode("task"));
      const expand = () => {
        root.toggleAttribute("data-expanded", true);
      };
      f.summary.addEventListener("click", expand);
      f.summary.addEventListener("keydown", e => (e.key == "Enter" || e.key == " ") && expand());
      f.allDay.addEventListener("change", () => {
        root.toggleAttribute("data-allday", f.allDay.checked);
        updateSummary();
      });
      // Beginn verschoben → Ende mitschieben (gleiche Dauer)
      let lastStart = null;
      const onStart = () => {
        const s = when(f.startDate, f.startTime);
        const e = when(f.endDate, f.endTime);
        if (s && e && lastStart) {
          setWhen(f.endDate, f.endTime, new Date(e.getTime() + (s - lastStart)));
        }
        lastStart = s;
        updateSummary();
      };
      panel.__mcSetLastStart = v => (lastStart = v);
      for (const input of [f.startDate, f.startTime]) {
        input.addEventListener("change", onStart);
      }
      for (const input of [f.endDate, f.endTime, f.dueDate, f.dueTime]) {
        input.addEventListener("change", updateSummary);
      }
      f.hasDue.addEventListener("change", () => {
        root.toggleAttribute("data-due", f.hasDue.checked);
        if (!f.hasDue.checked) {
          f.alert.value = "";
        }
        updateSummary();
      });
      f.calendar.addEventListener("change", updateColor);

      // Natürliche Eingabe: Datum/Uhrzeit aus dem Titel übernehmen, solange
      // sie nicht von Hand geändert wurden; der Titel wird ohne sie angelegt
      for (const input of [f.allDay, f.startDate, f.startTime, f.endDate, f.endTime, f.hasDue, f.dueDate, f.dueTime]) {
        input.addEventListener("change", event => {
          if (event.isTrusted) {
            panel.__mcManualTime = true;
          }
        });
      }
      // Datum und Uhrzeit wie im Termin-Dialog als Text zum Eintippen, das
      // Datum mit kleinem Monatskalender; die Eingabefelder bleiben verborgen
      // und halten den Wert („JJJJ-MM-TT“ bzw. „hh:mm“)
      const valueDesc = Object.getOwnPropertyDescriptor(w.HTMLInputElement.prototype, "value");
      const textField = (input, kind) => {
        let after = () => {};
        // neuer Wert (auch aus dem Code, z. B. natürliche Eingabe): neu zeichnen
        Object.defineProperty(input, "value", {
          configurable: true,
          get() {
            return valueDesc.get.call(this);
          },
          set(v) {
            valueDesc.set.call(this, v);
            after();
          },
        });
        const put = v => {
          if (input.value == v) {
            return;
          }
          input.value = v;
          // von Hand geändert (das Ereignis unten gilt nicht als echte Eingabe)
          panel.__mcManualTime = true;
          input.dispatchEvent(new w.Event("change", { bubbles: true }));
        };
        const off = () => false;
        if (kind == "date") {
          const io = {
            get: () => {
              const [y, m, day] = (input.value || "").split("-").map(Number);
              if (!y) {
                return null;
              }
              const t = new Date(2000, 0, 1);
              t.setFullYear(y, m - 1, day);
              return t;
            },
            set: t => put(dateValue(t)),
            off,
          };
          const edit = inlineDateEdit(w, io), mini = miniMonthPopover(w, edit, io, panel);
          this.restorers.push(() => mini.panel.remove());
          after = () => {
            edit.render();
            mini.sync();
          };
          input.after(edit.box);
        } else {
          const edit = timeSegEdit(w, {
            get: () => {
              const [h, m] = (input.value || "").split(":").map(Number);
              return Number.isInteger(h) && Number.isInteger(m) ? [h, m] : null;
            },
            set: ([h, m]) => {
              // Ende vor dem Beginn am selben Tag → Folgetag (wie im Termin-Dialog)
              const s = when(f.startDate, f.startTime), e = when(f.endDate, f.endTime);
              if (input == f.endTime && !f.allDay.checked && s && e) {
                const day = dateValue(endFromTime(s, e, [h, m]));
                if (day != f.endDate.value) {
                  f.endDate.value = day;
                  f.endDate.dispatchEvent(new w.Event("change", { bubbles: true }));
                }
              }
              put(`${pad(h)}:${pad(m)}`);
            },
            off,
          });
          after = () => edit.render();
          input.after(edit.box);
          // Ende: Klick zeigt die Liste mit Halbstunden und Dauer wie im Termin-Dialog
          if (input == f.endTime) {
            const list = endTimeMenu(w, edit, {
              start: () => when(f.startDate, f.startTime),
              end: () => when(f.endDate, f.endTime),
              set: t => {
                const day = dateValue(t);
                if (day != f.endDate.value) {
                  f.endDate.value = day;
                  panel.__mcManualTime = true;
                  f.endDate.dispatchEvent(new w.Event("change", { bubbles: true }));
                }
                put(timeValue(t));
                f.endDate.__mcExact = t;
              },
              usable: () => !f.allDay.checked && !!when(f.startDate, f.startTime) && !!when(f.endDate, f.endTime),
            }, panel);
            this.restorers.push(() => list.remove());
            after = () => {
              edit.render();
              list.__mcRefill();
            };
          }
        }
        input.setAttribute("mc-inline", "");
        after();
      };
      for (const input of [f.startDate, f.endDate, f.dueDate]) {
        textField(input, "date");
      }
      for (const input of [f.startTime, f.endTime, f.dueTime]) {
        textField(input, "time");
      }
      const applyNatural = () => {
        if (panel.__mcManualTime) {
          return;
        }
        const r = parseNatural(f.title.value);
        const def = panel.__mcDefaults;
        panel.__mcParsed = r.start ? r : null;
        let start = r.start || def.start;
        let end = r.end || (r.allDay ? start : plusMinutes(start, 60));
        // nur Tag und Dauer erkannt: Uhrzeit wie vorbelegt, Ende nach der Dauer
        if (r.start && !r.allDay && !r.end && r.duration != null) {
          start = laterHour(new Date(r.start.getFullYear(), r.start.getMonth(), r.start.getDate(), def.start.getHours(), def.start.getMinutes()));
          end = plusMinutes(start, r.duration);
        } else if (r.start && !r.allDay && r.duration != null) {
          start = laterHour(r.start);
          end = plusMinutes(start, r.duration);
        }
        const allDay = r.start ? !!r.allDay : def.allDay;
        if (state.mode == "task") {
          f.hasDue.checked = !!r.start || def.hasDue;
          root.toggleAttribute("data-due", f.hasDue.checked);
          f.dueDate.value = dateValue(start);
          if (!r.allDay) {
            f.dueTime.value = timeValue(start);
          }
        } else {
          f.allDay.checked = allDay;
          root.toggleAttribute("data-allday", allDay);
          const timed = r.start && !r.allDay;
          setWhen(f.startDate, f.startTime, timed || !r.start ? start : laterHour(new Date(start.getFullYear(), start.getMonth(), start.getDate(), def.start.getHours(), def.start.getMinutes())));
          setWhen(f.endDate, f.endTime, timed ? end : allDay ? new Date(start.getFullYear(), start.getMonth(), start.getDate(), def.end.getHours(), def.end.getMinutes()) : def.end);
          panel.__mcSetLastStart(when(f.startDate, f.startTime));
        }
        updateSummary();
      };
      panel.__mcApplyNatural = applyNatural;
      f.title.addEventListener("input", applyNatural);
      // vorläufiger Termin im Tag zeigt den Titel gleich mit
      f.title.addEventListener("input", () => {
        const name = panel.__mcGhost?.querySelector(".mc-ghost-title");
        if (name) {
          name.textContent = (panel.__mcParsed?.title || f.title.value).trim() || tr("New Event");
        }
      });
      // zu (Abbrechen, Esc, Klick daneben): vorläufigen Termin entfernen – nach
      // „Add“ erst, wenn der echte Termin da ist (sonst kurz eine Lücke)
      panel.addEventListener("popuphidden", event => {
        if (event.target != panel) {
          return;
        }
        panel.removeAttribute("mc-tip");
        const ghost = panel.__mcGhost;
        panel.__mcGhost = null;
        if (ghost) {
          (panel.__mcAdding || Promise.resolve()).finally(() => ghost.remove());
        }
      });

      // Eigenes Menü statt der Auswahlliste von macOS: dort gibt es keine
      // Farben pro Eintrag – hier steht vor jedem Kalender sein Farbpunkt
      const dot = c => `data:image/svg+xml,${encodeURIComponent(
        `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16"><circle cx="8" cy="8" r="6" fill="${color(c)}"/></svg>`)}`;
      const calMenu = d.createXULElement("menupopup");
      calMenu.id = "mcQuickCalMenu";
      panel.append(calMenu);
      const openCalMenu = () => {
        if (!calendars().length) {
          return;
        }
        const current = f.calendar.value;
        calMenu.replaceChildren(...calendars().map(c => {
          const item = d.createXULElement("menuitem");
          item.className = "menuitem-iconic";
          item.setAttribute("label", c.name);
          item.setAttribute("image", dot(c));
          const note = calendarNote(c);
          if (note) {
            item.setAttribute("tooltiptext", note);
          }
          if (c.id == current) {
            item.setAttribute("mc-current", "true");
          }
          item.addEventListener("command", () => {
            f.calendar.value = c.id;
            f.calendar.dispatchEvent(new w.Event("change", { bubbles: true }));
          });
          return item;
        }));
        calMenu.style.minWidth = `${Math.round(f.calCard.getBoundingClientRect().width)}px`;
        calMenu.openPopup(f.calCard, "after_start", 0, 2);
      };
      f.calendar.addEventListener("mousedown", event => {
        if (event.button == 0) {
          event.preventDefault();
          openCalMenu();
        }
      });
      f.calendar.addEventListener("keydown", event => {
        if ([" ", "Enter", "ArrowDown", "ArrowUp"].includes(event.key)) {
          event.preventDefault();
          openCalMenu();
        }
      });

      const buildItem = ({ plain = false } = {}) => {
        const calendar = selectedCalendar();
        let item;
        if (state.mode == "task") {
          item = new CalTodo();
          item.title = (panel.__mcParsed?.title || f.title.value).trim() || tr("New Task");
          if (f.hasDue.checked) {
            const due = parse(f.dueDate.value, f.dueTime.value);
            if (due) {
              item.dueDate = toCal(due, false);
            }
          }
        } else {
          item = new CalEvent();
          item.title = (panel.__mcParsed?.title || f.title.value).trim() || tr("New Event");
          let s = when(f.startDate, f.startTime, f.allDay.checked ? "00:00" : f.startTime.value) || new Date();
          let e = when(f.endDate, f.endTime, f.allDay.checked ? "00:00" : f.endTime.value);
          if (f.allDay.checked) {
            // Ende vor dem Beginn: ein Tag am Beginn
            const last = e && e >= s ? e : s;
            e = new Date(last.getFullYear(), last.getMonth(), last.getDate() + 1);
          } else if (!e || e <= s) {
            e = plusMinutes(s, 60);
          }
          item.startDate = toCal(s, f.allDay.checked);
          item.endDate = toCal(e, f.allDay.checked);
          const loc = f.location.value.trim();
          if (loc) {
            item.setProperty("LOCATION", loc);
          }
          item.setProperty("TRANSP", f.showAs.value);
          if (!plain && f.repeat.value == "CUSTOM" && panel.__mcRecurrence) {
            const info = panel.__mcRecurrence.clone();
            info.item = item;
            item.recurrenceInfo = info;
          } else if (!plain && f.repeat.value && f.repeat.value != "CUSTOM") {
            const info = new CalRecurrenceInfo(item);
            const rule = cal.createRecurrenceRule();
            rule.type = f.repeat.value;
            rule.interval = 1;
            info.appendRecurrenceItem(rule);
            item.recurrenceInfo = info;
          }
        }
        const notes = f.notes.value.trim();
        if (notes) {
          item.setProperty("DESCRIPTION", notes);
        }
        if (!plain && f.alert.value == "CUSTOM" && panel.__mcAlarms) {
          for (const alarm of panel.__mcAlarms) {
            item.addAlarm(alarm.clone());
          }
        } else if (!plain && f.alert.value && f.alert.value != "CUSTOM" && (state.mode == "event" || item.dueDate)) {
          const alarm = new CalAlarm();
          alarm.related = state.mode == "task" ? Ci.calIAlarm.ALARM_RELATED_END : Ci.calIAlarm.ALARM_RELATED_START;
          const offset = cal.createDuration(f.alert.value);
          offset.isNegative = f.alert.value != "PT0M";
          alarm.offset = offset;
          alarm.action = "DISPLAY";
          item.addAlarm(alarm);
        }
        item.calendar = calendar;
        return { item, calendar };
      };
      const add = async () => {
        const { item, calendar } = buildItem();
        if (!calendar) {
          return;
        }
        // (vor dem Schließen: der vorläufige Termin bleibt, bis der echte da ist)
        let added;
        panel.__mcAdding = new Promise(resolve => (added = resolve));
        panel.hidePopup();
        try {
          await w.doTransaction("add", item, calendar, null, null);
        } catch (e) {
          log("quick create add error", String(e).slice(0, 160));
        } finally {
          added();
          panel.__mcAdding = null;
        }
      };
      const more = () => {
        const { item, calendar } = buildItem();
        panel.hidePopup();
        try {
          if (state.mode == "task") {
            w.createTodoWithDialog(calendar, null, null, item);
          } else {
            w.createEventWithDialog(calendar, null, null, null, item);
          }
        } catch (e) {
          log("quick create dialog error", String(e).slice(0, 160));
        }
      };
      f.add.addEventListener("click", add);
      f.more.addEventListener("click", more);
      f.invitees.addEventListener("click", more);
      f.cancel.addEventListener("click", () => panel.hidePopup());
      root.addEventListener("keydown", e => {
        if (e.key == "Enter" && !e.isComposing && e.target.localName == "input" && e.target.type == "text") {
          e.preventDefault();
          add();
        }
      });
    }

    // --- Vorbelegen und öffnen ---
    const f = panel.__mc;
    const root = panel.firstElementChild;
    root.removeAttribute("data-expanded");
    root.removeAttribute("data-allday");
    root.removeAttribute("data-due");
    f.title.value = "";
    f.location.value = "";
    f.notes.value = "";
    f.allDay.checked = false;
    f.hasDue.checked = false;
    f.repeat.value = "";
    f.alert.value = "";
    panel.__mcResetCustom?.();
    f.showAs.value = "OPAQUE";
    // Tag: in der Today-Pane der dort gewählte Tag, sonst heute; Beginn zur
    // nächsten vollen Stunde, eine Stunde lang
    const now = new Date();
    let day = now;
    try {
      const ts = w.TodayPane?.start;
      if (anchor?.id == "todaypane-new-event-button" && ts) {
        day = new Date(ts.year, ts.month, ts.day, now.getHours(), now.getMinutes());
      }
    } catch {}
    // ein anderer Tag als heute bleibt auch nach 23 Uhr dieser Tag (23:00 statt
    // 0:00 am Folgetag); heute – auch per „+“ der Today-Pane – wie bisher 0:00 am
    // Folgetag statt eines Beginns in der Vergangenheit (Datum vergleichen, die
    // Today-Pane liefert ein eigenes Date-Objekt)
    const nextHour = Math.min(now.getHours() + 1, 23);
    const isToday = day.getFullYear() == now.getFullYear() && day.getMonth() == now.getMonth() && day.getDate() == now.getDate();
    let start = new Date(day.getFullYear(), day.getMonth(), day.getDate(), isToday ? now.getHours() + 1 : nextHour, 0);
    if (preset?.start) {
      start = preset.allDay
        ? new Date(preset.start.getFullYear(), preset.start.getMonth(), preset.start.getDate(), nextHour, 0)
        : new Date(preset.start);
    }
    start = laterHour(start);
    const end = plusMinutes(start, 60);
    if (preset?.allDay) {
      f.allDay.checked = true;
      root.toggleAttribute("data-allday", true);
    }
    setWhen(f.startDate, f.startTime, start);
    setWhen(f.endDate, f.endTime, end);
    f.dueDate.value = dateValue(start);
    f.dueTime.value = timeValue(start);
    panel.__mcSetLastStart(start);
    // Ausgangswerte für die natürliche Eingabe (zurück, wenn „morgen“ wieder gelöscht wird)
    panel.__mcDefaults = { start, end, allDay: !!preset?.allDay, hasDue: false };
    panel.__mcParsed = null;
    panel.__mcManualTime = false;
    panel.__mcSetMode(mode);
    // Kalender, in den doppelgeklickt wurde (sonst der ausgewählte)
    if (preset?.calendar?.id && [...f.calendar.options].some(o => o.value == preset.calendar.id)) {
      f.calendar.value = preset.calendar.id;
      f.calendar.dispatchEvent(new w.Event("change", { bubbles: true }));
    }
    // Das Fenster ist 380 px breit. Thunderbird schiebt es am Bildschirmrand
    // nicht zurück, sondern drückt es zusammen (rechts abgeschnitten) – daher
    // selbst so weit nach links rücken, dass es ganz ins Fenster und auf den
    // Bildschirm passt (z. B. unter dem „+“ ganz rechts in der Today-Pane)
    const PANEL_W = 380;
    const screenRight = w.screen.availLeft + w.screen.availWidth;
    panel.__mcPlaced = null;
    // wie Apple Kalender: Doppelklick legt sofort sichtbar einen vorläufigen
    // Termin „New Event“ im Tag an (in der Farbe des Kalenders, kein echter
    // Termin bis „Add“); der Dialog zeigt mit einer Spitze darauf
    panel.__mcGhost?.remove();
    panel.__mcGhost = null;
    const ghostCell = mode == "event" && preset?.at?.rect && preset.at.cell?.isConnected ? preset.at.cell : null;
    if (ghostCell) {
      try {
        const gd = ghostCell.ownerDocument;
        const li = gd.createElementNS(X, "li");
        li.className = "mc-qc-ghost";
        const name = gd.createElementNS(X, "span");
        name.className = "mc-ghost-title";
        name.textContent = tr("New Event");
        li.append(name);
        const start = f.startDate.value ? when(f.startDate, f.startTime) : null;
        if (start && !f.allDay.checked) {
          const time = gd.createElementNS(X, "span");
          time.className = "mc-ghost-time";
          time.textContent = fmtTime.format(start);
          li.append(time);
        }
        li.style.setProperty("--mc-ghost-color", f.calendar.value ? (cal.manager.getCalendarById(f.calendar.value)?.getProperty("color") || "#8E8E93") : "#8E8E93");
        if (ghostCell.localName == "calendar-month-day-box") {
          li.classList.add("calendar-month-day-box-list-item");
          ghostCell.dayList?.prepend(li);
        } else if (ghostCell.localName == "calendar-event-column" && start && !f.allDay.checked) {
          // in der Tagesspalte an der Uhrzeit, eine Stunde hoch
          const ppm = ghostCell.pixelsPerMinute || 0.8;
          li.classList.add("mc-qc-ghost-timed");
          li.style.insetBlockStart = `${(start.getHours() * 60 + start.getMinutes()) * ppm}px`;
          li.style.height = `${60 * ppm}px`;
          ghostCell.eventsListElement?.append(li);
        } else {
          ghostCell.eventsListElement?.prepend(li);
        }
        if (li.isConnected) {
          panel.__mcGhost = li;
        }
      } catch (e) {
        log("quick ghost error", e);
      }
    }
    panel.removeEventListener("popupshown", panel.__mcReplace);
    if (preset?.at?.rect) {
      // neben dem angeklickten Tag wie in Apple Kalender: auf der Seite zur
      // Fenstermitte hin (Tag rechts → links daneben), senkrecht mittig zur
      // Zelle bzw. Uhrzeit, dann ins Fenster und auf den Bildschirm geschoben
      // sehr breite Zelle (Tagesansicht: eine Spalte fast so breit wie das
      // Fenster): neben der Klickstelle statt neben der ganzen Spalte, sonst
      // landete das Fenster weit weg am Fensterrand
      let cell = preset.at.rect.width > 2 * PANEL_W ? { ...preset.at.rect, left: preset.at.x, width: 0 } : preset.at.rect;
      // mit vorläufigem Termin: daneben, senkrecht auf seiner Mitte
      const ghost = panel.__mcGhost;
      const TIP = 9;
      const gr = ghost?.getBoundingClientRect();
      const gw = ghost?.ownerDocument.defaultView;
      const toRightOfCell = cell.left + cell.width / 2 < w.mozInnerScreenX + w.innerWidth / 2;
      if (gr?.width && gw) {
        cell = { left: gw.mozInnerScreenX + gr.left, top: gw.mozInnerScreenY + gr.top, width: gr.width, height: gr.height };
      }
      const fit = (v, size, lo, hi) => (hi - lo >= size ? Math.max(lo, Math.min(v, hi - size)) : lo);
      const place = height => {
        const winL = w.mozInnerScreenX;
        const winT = w.mozInnerScreenY;
        const scrL = w.screen.availLeft;
        const scrT = w.screen.availTop;
        const left = Math.max(winL, scrL) + 8;
        const right = Math.min(winL + w.innerWidth, scrL + w.screen.availWidth) - 8;
        const top = Math.max(winT, scrT) + 8;
        const bottom = Math.min(winT + w.innerHeight, scrT + w.screen.availHeight) - 8;
        const toRight = ghost ? toRightOfCell : cell.left + cell.width / 2 < winL + w.innerWidth / 2;
        // (mit Spitze: das Panel ist um sie breiter und berührt den Termin fast)
        const pw = ghost ? PANEL_W + TIP : PANEL_W;
        const gap = ghost ? 2 : 6;
        const x = toRight ? cell.left + cell.width + gap : cell.left - gap - pw;
        const y = cell.top + cell.height / 2 - height / 2;
        const placed = {
          x: Math.round(right - left >= pw ? fit(x, pw, left, right) : fit(x, pw, scrL + 8, scrL + w.screen.availWidth - 8)),
          y: Math.round(bottom - top >= height ? fit(y, height, top, bottom) : fit(y, height, scrT + 8, scrT + w.screen.availHeight - 8)),
          side: toRight ? "right" : "left",
        };
        // Spitze genau auf der senkrechten Mitte des Termins (am Rand begrenzt)
        placed.tip = Math.round(Math.max(24, Math.min(height - 24, cell.top + cell.height / 2 - placed.y)));
        return placed;
      };
      // Höhe erst nach dem Öffnen bekannt: mit der Höhe vom letzten Mal öffnen
      // (meist dieselbe), unsichtbar, bis die echte gemessen und das Fenster
      // dorthin gerückt ist – sonst sprang es sichtbar ein Stück nach oben
      const tipAt = p => {
        if (ghost) {
          panel.setAttribute("mc-tip", p.side == "right" ? "start" : "end");
          panel.style.setProperty("--mc-tip-y", `${p.tip}px`);
        }
      };
      let at = place(panel.__mcHeight || 360);
      panel.__mcPlaced = at;
      tipAt(at);
      panel.style.opacity = "0";
      const reveal = () => panel.style.removeProperty("opacity");
      panel.__mcReplace = () => {
        panel.removeEventListener("popupshown", panel.__mcReplace);
        const height = panel.getOuterScreenRect().height;
        if (height) {
          panel.__mcHeight = height;
        }
        const again = height ? place(height) : at;
        if (again.x != at.x || again.y != at.y) {
          at = again;
          panel.__mcPlaced = at;
          panel.moveTo(at.x, at.y);
        }
        tipAt(again);
        w.requestAnimationFrame(() => w.requestAnimationFrame(reveal));
        w.setTimeout(reveal, 200); // (verdecktes Fenster: ohne Bilder)
      };
      panel.addEventListener("popupshown", panel.__mcReplace);
      panel.openPopupAtScreen(at.x, at.y, false);
    } else if (preset?.at) {
      // an der Mausposition, etwas nach rechts unten versetzt
      const x = Math.max(w.screen.availLeft + 8, Math.min(preset.at.x + 8, screenRight - PANEL_W - 8));
      panel.openPopupAtScreen(x, preset.at.y + 8, false);
    } else if (anchor) {
      const r = anchor.getBoundingClientRect();
      const below = r.top < w.innerHeight / 2;
      const right = Math.min(w.innerWidth, screenRight - w.mozInnerScreenX) - 8;
      const left = Math.max(8, Math.min(r.left + r.width / 2 - PANEL_W / 2, right - PANEL_W));
      panel.openPopup(anchor, below ? "after_start" : "before_start", Math.round(left - r.left), below ? 4 : -4);
    } else {
      panel.openPopup(null, "", Math.round(w.innerWidth / 2 - 190), 80, false, false);
    }
    w.setTimeout(() => f.title.focus(), 50);
  }

  // Terminliste der Today-Pane: vom Starttag bis zum Monatsende (statt einer
  // festen Anzahl Tage) – passt zum Monat im Titel
  hookAgendaMonthRange(w) {
    // (beim Start ist TodayPane.agenda manchmal noch nicht gesetzt – dann
    // blieb die Liste bei Thunderbirds 14 Tagen ab heute)
    const agenda = w.TodayPane?.agenda || w.document.getElementById("agenda");
    if (!agenda || agenda.__mcMonthRange) {
      return;
    }
    agenda.__mcMonthRange = true;
    Object.defineProperty(agenda, "numberOfDays", {
      configurable: true,
      get() {
        try {
          const start = this.startDate || w.TodayPane.start;
          const last = new Date(start.year, start.month + 1, 0).getDate();
          return Math.max(1, last - start.day + 1);
        } catch {
          return 14;
        }
      },
    });
    // gewählter Tag (meist heute) als Zeile ganz oben; die Termine des Monats
    // davor liegen darüber und erscheinen beim Hochscrollen. Solange niemand
    // scrollt, bleibt der Tag oben, auch wenn Netzkalender später Termine
    // darüber einfügen (sonst rutschte die Liste weg)
    const dayKey = dt => `${dt.year}${String(dt.month + 1).padStart(2, "0")}${String(dt.day).padStart(2, "0")}`;
    let pinned = true;
    const anchorRow = () => {
      const key = agenda.__mcAnchor ? dayKey(agenda.__mcAnchor) : "";
      return [...agenda.querySelectorAll(":scope > li.agenda-listitem")].find(li => (li.dateString || "").slice(0, 8) >= key);
    };
    // vergangener Monat (‹): ans Ende, die letzten Termine zuerst sichtbar,
    // Älteres darüber (Entscheidung des Maintainers vom 5.11.2026)
    const scrollToAnchor = () => {
      const row = agenda.__mcAtEnd ? null : anchorRow();
      agenda.scrollTop = row ? agenda.scrollTop + row.getBoundingClientRect().top - agenda.getBoundingClientRect().top : agenda.scrollHeight;
    };
    agenda.__mcScrollToAnchor = () => {
      pinned = true;
      scrollToAnchor();
    };
    const unpin = () => (pinned = false);
    const pinEvents = ["wheel", "pointerdown", "keydown", "touchstart"];
    pinEvents.forEach(type => agenda.addEventListener(type, unpin, { passive: true }));
    const pinMo = new w.MutationObserver(() => pinned && scrollToAnchor());
    pinMo.observe(agenda, { childList: true });
    // Thunderbird zeigt für andere Tage als heute nur diesen einen Tag –
    // hier immer den Monat des Tags bis zum Monatsende
    agenda.update = async function (date) {
      // (Thunderbird lädt neu mit startDate – das ist hier der Monatserste)
      if (date && this.__mcAnchor && this.startDate && dayKey(date) == dayKey(this.startDate)) {
        date = this.__mcAnchor;
      }
      date ||= this.__mcAnchor || w.TodayPane.start;
      if (!date) {
        return;
      }
      this.__mcAnchor = date.clone();
      this.__mcAnchor.isDate = true;
      this.startDate = this.__mcAnchor.clone();
      this.startDate.day = 1;
      this.endDate = this.startDate.clone();
      this.endDate.day += this.numberOfDays;
      this.itemType = Ci.calICalendar.ITEM_FILTER_TYPE_EVENT;
      pinned = true;
      if (this.isActive) {
        await this.refreshItems();
      } else {
        await this.ensureInitialized();
      }
      const row = this.__mcAtEnd ? null : anchorRow();
      this.selectedIndex = row ? Math.max(0, this.rows.indexOf(row)) : this.__mcAtEnd ? Math.max(0, this.rows.length - 1) : 0;
      scrollToAnchor();
    };
    try {
      w.TodayPane.updatePeriod();
    } catch {}
    this.restorers.push(() => {
      delete agenda.update;
      delete agenda.__mcAnchor;
      delete agenda.__mcScrollToAnchor;
      delete agenda.__mcAtEnd;
      pinEvents.forEach(type => agenda.removeEventListener(type, unpin));
      pinMo.disconnect();
      Object.defineProperty(agenda, "numberOfDays", {
        configurable: true,
        get: () => Services.prefs.getIntPref("calendar.agenda.days", 14),
      });
      delete agenda.__mcMonthRange;
      try {
        w.TodayPane.updatePeriod();
      } catch {}
    });
  }

  // Today-Pane auf heute stellen und die Liste ganz nach oben
  agendaToday(w) {
    try {
      const { cal } = ChromeUtils.importESModule("resource:///modules/calendar/calUtils.sys.mjs");
      const now = new Date();
      const dt = cal.dtz.jsDateToDateTime(new Date(now.getFullYear(), now.getMonth(), now.getDate()), cal.dtz.defaultTimezone);
      dt.isDate = true;
      w.TodayPane.setDay(dt);
      // heute ganz oben (darüber die vergangenen Termine des Monats), auch
      // nach dem Neuladen der Termine
      const agenda = w.document.getElementById("agenda");
      if (agenda) {
        delete agenda.__mcAtEnd;
      }
      const top = () => (agenda.__mcScrollToAnchor ? agenda.__mcScrollToAnchor() : (agenda.scrollTop = 0));
      if (agenda) {
        top();
        w.setTimeout(top, 150);
      }
    } catch (e) {
      log("agenda today error", String(e).slice(0, 160));
    }
  }

  // Monat der Today-Pane wechseln: aktueller Monat ab heute, sonst ab dem 1.
  shiftAgendaMonth(w, dir) {
    try {
      const { cal } = ChromeUtils.importESModule("resource:///modules/calendar/calUtils.sys.mjs");
      const start = w.TodayPane.start;
      const target = new Date(start.year, start.month + dir, 1);
      const now = new Date();
      const day = target.getFullYear() == now.getFullYear() && target.getMonth() == now.getMonth()
        ? now : target;
      const dt = cal.dtz.jsDateToDateTime(new Date(day.getFullYear(), day.getMonth(), day.getDate()), cal.dtz.defaultTimezone);
      dt.isDate = true;
      // vergangener Monat: die Liste beginnt am Ende (jüngste Termine zuerst sichtbar)
      const agenda = w.TodayPane?.agenda || w.document.getElementById("agenda");
      if (agenda) {
        agenda.__mcAtEnd = target < new Date(now.getFullYear(), now.getMonth(), 1);
      }
      w.TodayPane.setDay(dt);
    } catch (e) {
      log("agenda month error", String(e).slice(0, 160));
    }
  }

  // Today-Pane weich ein-/ausblenden wie die Seitenleisten: die Breite
  // gleitet zwischen 0 und voller Breite, der Inhalt behält seine Breite und
  // wird nur zugedeckt. Während der Animation liegt sie über dem Mailbereich
  // (position: absolute) – schob sie ihn pro Bild zur Seite, musste
  // Thunderbird Mailliste und geöffnete Mail jedes Mal neu anordnen (20–35 ms
  // pro Bild, sichtbares Ruckeln). So ändert sich der Mailbereich nur einmal:
  // beim Ausblenden am Anfang, beim Einblenden am Ende, jeweils unter der Pane.
  // reverse: Klick während der Animation kehrt sie an der aktuellen Stelle um
  animateTodayPane(w, command, onDone, reverse = false) {
    const d = w.document;
    const panel = d.getElementById("today-pane-panel");
    if (panel?.__mcAnimating && reverse) {
      panel.__mcReverse?.();
      return;
    }
    if (!panel || panel.__mcAnimating) {
      return;
    }
    const showing = !w.TodayPane?.isVisible;
    const startMode = panel.currentMode;
    // Lage und Breite von Suchfeld und Knöpfen rechts davon VOR dem Umschalten
    // messen – danach steht die Toolbar schon am Ende (das Suchfeld sprang
    // sonst gleich zu Beginn auf seine neue Breite und Lage)
    // Alle Knöpfe der Zeile, nicht nur ab dem Suchfeld: klappen Knöpfe weiter
    // links ein (Junk, Mark), rückten die übrigen sonst gleich zu Beginn nach
    const content = d.getElementById("unifiedToolbarContent");
    const kidsAll = content ? [...content.children] : [];
    const place = li => {
      const r = !li.hidden && li.getBoundingClientRect();
      return r?.width ? r.left : null;
    };
    const fromAll = kidsAll.map(place);
    // dazu die Breite des Suchfelds und Lage/Darstellung der übrigen Knöpfe
    // (für die, die gleich einklappen)
    const searchLi = kidsAll.find(li => li.getAttribute("item-id") == "search-bar");
    const fromSearchW = searchLi && fromAll[kidsAll.indexOf(searchLi)] != null ? searchLi.getBoundingClientRect().width : null;
    const fromBox = kidsAll.map((li, i) => (fromAll[i] != null ? { top: li.getBoundingClientRect().top, display: w.getComputedStyle(li).display } : null));
    if (showing) {
      command.doCommand();
    }
    const full = panel.getBoundingClientRect().width;
    if (!full) {
      if (!showing) {
        command.doCommand();
      }
      onDone?.();
      return;
    }
    // Verteiler-Hinweis über der geöffneten Mail (#mcListBanner): füllt die Breite des Mailbereichs, der sich nur am
    // Anfang bzw. Ende ändert – Abmelden-Knopf und Kreuz sprangen deshalb am Ende (Einblenden) bzw. Anfang (Ausblenden).
    // Schmale Breite (Pane im Fluss) jetzt messen, breite (Pane darüber) unten; pro Bild dazwischen gleiten
    const bannerEl = () => {
      const el = d.getElementById("tabmail")?.currentTabInfo?.chromeBrowser?.contentWindow?.messageBrowser?.contentDocument?.getElementById("mcListBanner");
      return el?.isConnected ? el : null;
    };
    const bannerNarrow = bannerEl()?.getBoundingClientRect().width || null;
    // Aufgaben: Liste, Details, „+“ und Aktionen gleich für das Endmaß
    // rechnen (die Rechnung richtet sich nach dem gemessenen „+“ – bis sie
    // still steht, wie sonst über zwei Bilder verteilt); danach ruht sie bis
    // zum Ende der Animation. Beim Einblenden jetzt, solange die Pane noch
    // mit voller Breite im Fluss liegt
    const sideEdgesNow = () => {
      const bar = d.getElementById("unifiedToolbarContainer");
      panel.__mcEdgeNow = true;
      try {
        for (let i = 0, before = null; i < 4; i++) {
          for (const f of this.sideEdgeUpdaters || []) {
            try {
              f();
            } catch {}
          }
          const now = barTarget(d).style.getPropertyValue("--mc-tab-offset") + "|" + (bar?.style.getPropertyValue("--mc-task-line") || "");
          if (now == before) {
            break;
          }
          before = now;
        }
      } finally {
        delete panel.__mcEdgeNow;
      }
    };
    if (showing) {
      d.getElementById("unifiedToolbarContainer")?.style.setProperty("--mc-tp-room", `${Math.round(full)}px`);
      panel.__mcSliding = "in";
      sideEdgesNow();
      // ebenso die Platzaufteilung der Toolbar (Suchfeld, ausgeblendete
      // Pillen): Die Mailliste hat nur jetzt ihr Endmaß – liegt die Pane erst
      // über dem Inhalt, ist der Mailbereich breiter, die Liste reicht weiter
      // nach rechts und es wichen mehr Pillen als am Ende (ESR: ganze Pille
      // „Archivieren | Löschen | Werbung“ weg und am Ende wieder da, Suchfeld
      // sprang um 120 px)
      w.__mcTodayTopSync?.();
      d.getElementById("unifiedToolbarContainer")?.removeAttribute("data-mc-tp-open");
      for (const f of this.offsetUpdaters || []) {
        try {
          f();
        } catch {}
      }
    }
    panel.__mcAnimating = true;
    panel.setAttribute("data-mc-anim", "true"); // Mindestbreite (CSS) solange aussetzen
    // „+“ beim Ausblenden gleich zu Beginn weg – sonst gleitet der Today-Knopf darüber
    if (!showing) {
      d.getElementById("unifiedToolbarContainer")?.removeAttribute("data-mc-tp-open");
    }
    // Platz für die Today-Pane in der Toolbar beim Einblenden gleich am Anfang
    // (beim Ausblenden erst am Ende, über todayTopSync) – nicht mittendrin
    if (showing) {
      d.getElementById("unifiedToolbarContainer")?.style.setProperty("--mc-tp-room", `${Math.round(full)}px`);
    }
    const DURATION = motionMs(250);
    const curve = cubicBezier(0.25, 0.1, 0.25, 1);
    const PROPS = ["overflow", "min-width", "width", "max-width", "position", "inset-block", "inset-inline-end", "z-index"];
    const saved = PROPS.map(p => [p, panel.style.getPropertyValue(p), panel.style.getPropertyPriority(p)]);
    const box = panel.parentElement;
    const savedBox = box.style.getPropertyValue("position");
    const kids = [...panel.children];
    kids.forEach(k => k.style.setProperty("min-width", `${full}px`));
    box.style.setProperty("position", "relative");
    panel.style.setProperty("position", "absolute", "important");
    panel.style.setProperty("inset-block", "0", "important");
    panel.style.setProperty("inset-inline-end", "0", "important");
    panel.style.setProperty("z-index", "2", "important");
    panel.style.setProperty("overflow", "hidden", "important");
    panel.style.setProperty("min-width", "0px", "important");
    const setW = v => {
      panel.style.setProperty("width", `${v}px`, "important");
      panel.style.setProperty("max-width", `${v}px`, "important");
    };
    const bannerWide = bannerNarrow ? bannerEl()?.getBoundingClientRect().width || null : null;
    const bannerFollow = bannerNarrow && bannerWide && Math.abs(bannerWide - bannerNarrow) >= 1 ? bannerEl() : null;
    const moveBanner = value => {
      const el = bannerFollow;
      if (!el?.isConnected) {
        return;
      }
      const wNow = bannerWide - (bannerWide - bannerNarrow) * Math.min(1, Math.max(0, value / full));
      el.style.setProperty("box-sizing", "border-box", "important");
      el.style.setProperty("width", `${wNow.toFixed(2)}px`, "important");
    };
    // Mitgleiten ohne Neuanordnung: Toolbar-Zeile und Inhalt ändern ihr
    // Layout nur einmal (Anfang bzw. Ende). Dazwischen werden Suchfeld und
    // Knöpfe rechts davon sowie „Bearbeiten“ im Adressbuch nur verschoben
    // (transform), die Überschrift oben steht schon an ihrem Endplatz und wird
    // von der Fläche aufgedeckt
    const row = d.getElementById("unifiedToolbarContainer");
    const rtl = w.getComputedStyle(d.documentElement).direction == "rtl" ? -1 : 1;
    const editBlock = d.getElementById("tabmail")?.currentTabInfo?.browser?.contentDocument?.querySelector("#detailsActions .edit-block");
    // Überschrift: Endzustand (Breite, nur Sonne oder ganzer Titel) jetzt
    // messen, solange die Pane ihre volle Breite hat, und dort festhalten
    // (beim Ausblenden gilt er schon; das „+“ erscheint wie bisher erst am Ende)
    // Die Toolbar-Zeile bekommt gleich ihr Endmaß (einmal neu anordnen),
    // Suchfeld und Knöpfe rechts werden dann vom alten an den neuen Platz
    // geschoben – in beide Richtungen gleich
    if (showing) {
      panel.__mcAnimating = false; // (sync misst sonst nicht)
      w.__mcTodayTopSync?.();
      panel.__mcAnimating = true;
      row?.removeAttribute("data-mc-tp-open");
    } else {
      row?.style.setProperty("--mc-tp-room", "0px");
      // Ausblenden: die Pane liegt schon über dem Inhalt – Endmaß ohne sie
      panel.__mcSliding = "out";
      sideEdgesNow();
    }
    // Platzaufteilung der Toolbar (Suchfeldbreite, eingeklappte Knöpfe) gleich
    // für das Endmaß berechnen, nicht erst nach der Animation (beim Einblenden
    // schon oben, solange die Pane im Fluss lag)
    if (!showing) {
      panel.__mcAnimating = false;
      for (const f of this.offsetUpdaters || []) {
        try {
          f();
        } catch {}
      }
      panel.__mcAnimating = true;
    }
    const toAll = kidsAll.map(place);
    // gleiten: vorher und nachher sichtbar; erscheinen: werden eingeblendet
    const riders = kidsAll.filter((_, i) => fromAll[i] != null && toAll[i] != null);
    const from = kidsAll.map((_, i) => fromAll[i]).filter((_, i) => fromAll[i] != null && toAll[i] != null);
    const to = kidsAll.map((_, i) => toAll[i]).filter((_, i) => fromAll[i] != null && toAll[i] != null);
    const appear = kidsAll.filter((_, i) => fromAll[i] == null && toAll[i] != null);
    // einklappende Knöpfe: an ihrer alten Stelle stehen lassen (außerhalb des
    // Flusses, das Endmaß der Zeile bleibt) und ausblenden
    const vanish = kidsAll.filter((li, i) => fromAll[i] != null && toAll[i] == null && li.hasAttribute("mc-squeezed"));
    const vanishShift = vanish.map(li => {
      const i = kidsAll.indexOf(li);
      li.style.setProperty("--mc-vanish-display", fromBox[i].display);
      li.setAttribute("data-mc-vanish", "");
      const r = li.getBoundingClientRect();
      return `translate(${(fromAll[i] - r.left).toFixed(2)}px, ${(fromBox[i].top - r.top).toFixed(2)}px)`;
    });
    vanish.forEach((li, i) => (li.style.transform = vanishShift[i]));
    // Suchfeld: Breite stufenlos vom alten zum neuen Maß (der Rahmen steht
    // schon am Endmaß, das Feld darin reicht weiter bzw. weniger weit)
    const toSearchW = searchLi && fromSearchW != null && toAll[kidsAll.indexOf(searchLi)] != null ? searchLi.getBoundingClientRect().width : null;
    const searchExtra = toSearchW != null ? fromSearchW - toSearchW : 0;
    const topEl = d.getElementById("mcTodayTop");
    const titleEl = d.getElementById("mcTodayTitle");
    if (row && topEl && titleEl) {
      const tr0 = rectOf(topEl), ti = rectOf(titleEl);
      if (tr0?.width && ti?.width) {
        // Versatz im Zustand der Animation selbst messen (Rand, Innenabstand,
        // Bruchteile – sonst rückte der Titel am Ende um 1 px): erst ohne
        // Versatz an den Anfang, dann so weit, bis er am Endplatz steht
        row.style.setProperty("--mc-tt-off", "0px");
        row.setAttribute("data-mc-tp-anim", "");
        const origin = rectOf(titleEl)?.left ?? tr0.left;
        row.style.setProperty("--mc-tt-off", `${(ti.left - origin).toFixed(2)}px`);
      }
    }
    // Anteil der Bewegung p (0 → 1); das Layout steht schon am Ende (to),
    // Suchfeld und Knöpfe gleiten von ihrer alten an die neue Stelle, das
    // Suchfeld ändert dabei stufenlos seine Breite (die Stufe – nur Lupe,
    // „Search“, ganzer Text – folgt ihr; am Ende wird nichts neu bestimmt)
    const ride = value => {
      const p = showing ? value / full : 1 - value / full;
      riders.forEach((li, i) => {
        const shift = (from[i] - to[i]) * (1 - p);
        li.style.transform = Math.abs(shift) >= 0.5 ? `translateX(${shift}px)` : "";
      });
      appear.forEach(li => li.style.setProperty("opacity", p.toFixed(3)));
      // in der ersten Hälfte weg – die Nachbarn gleiten an ihren Platz
      vanish.forEach(li => li.style.setProperty("opacity", Math.max(0, 1 - 2 * p).toFixed(3)));
      if (Math.abs(searchExtra) >= 0.5) {
        searchLi.style.setProperty("--mc-search-extra", `${(searchExtra * (1 - p)).toFixed(2)}px`);
      }
      if (editBlock) {
        editBlock.style.transform = value ? `translateX(${-value * rtl}px)` : "";
      }
      moveBanner(value);
    };
    if (showing) {
      setW(0);
      ride(0);
    } else {
      ride(full);
    }
    // Fortschritt k läuft vor (dir 1) oder nach einer Umkehr zurück (dir -1)
    let k = 0, dir = 1, last = null;
    panel.__mcReverse = () => {
      dir = -dir;
    };
    const step = now => {
      k = Math.min(1, Math.max(0, k + (last === null ? 0 : dir * (now - last) / DURATION)));
      last = now;
      const value = full * (showing ? curve(k) : 1 - curve(k));
      setW(value);
      w.__mcTodayTopSync?.(value);
      if (dir > 0 ? k < 1 : k > 0) {
        ride(value);
        w.requestAnimationFrame(step);
        return;
      }
      const shown = showing == (k >= 1);
      delete panel.__mcReverse;
      for (const [prop, value, prio] of saved) {
        if (value) {
          panel.style.setProperty(prop, value, prio);
        } else {
          panel.style.removeProperty(prop);
        }
      }
      kids.forEach(k2 => k2.style.removeProperty("min-width"));
      if (savedBox) {
        box.style.setProperty("position", savedBox);
      } else {
        box.style.removeProperty("position");
      }
      if (!shown && panel.currentMode != startMode && typeof panel.isVisible == "function") {
        // inzwischen Bereich gewechselt: im Ausgangsbereich zuklappen
        // (sonst bliebe die Pane dort offen, das Kommando gilt nur für den aktuellen)
        if (panel.isVisible(startMode)) {
          const modes = (panel.getAttribute("collapsedinmodes") || "").split(",").filter(Boolean);
          panel.setAttribute("collapsedinmodes", [...modes, startMode].join(","));
          Services.xulStore.persist(panel, "collapsedinmodes");
        }
      } else if (!shown && w.TodayPane?.isVisible) {
        command.doCommand();
      }
      panel.__mcAnimating = false;
      delete panel.__mcSliding;
      panel.removeAttribute("data-mc-anim");
      w.__mcTodayTopSync?.();
      // Layout ist jetzt am Endplatz – Verschiebungen weg (im selben Bild)
      riders.forEach(li => (li.style.transform = ""));
      appear.forEach(li => li.style.removeProperty("opacity"));
      vanish.forEach(li => {
        li.removeAttribute("data-mc-vanish");
        li.style.removeProperty("--mc-vanish-display");
        li.style.removeProperty("opacity");
        li.style.transform = "";
      });
      searchLi?.style.removeProperty("--mc-search-extra");
      if (editBlock) {
        editBlock.style.transform = "";
      }
      if (bannerFollow?.isConnected) {
        bannerFollow.style.removeProperty("width");
        bannerFollow.style.removeProperty("box-sizing");
      }
      row?.removeAttribute("data-mc-tp-anim");
      row?.style.removeProperty("--mc-tt-off");
      // Toolbar einmal neu anordnen (während der Animation ausgesetzt)
      for (const f of [...(this.sideEdgeUpdaters || []), ...(this.offsetUpdaters || [])]) {
        try {
          f();
        } catch {}
      }
      d.getElementById("agenda")?.dispatchEvent(new w.Event("scroll"));
      onDone?.();
    };
    w.requestAnimationFrame(() => w.requestAnimationFrame(step));
  }

  openMessageInWindowOnce() {
    const PREF = "mail.openMessageBehavior";
    const APPLIED = "extensions.mailcards.openMessageApplied";
    const SAVED = "extensions.mailcards.openMessageSaved"; // -1: Thunderbirds Standard
    try {
      const { MailConsts } = ChromeUtils.importESModule("resource:///modules/MailConsts.sys.mjs");
      const WINDOW = MailConsts.OpenMessageBehavior.NEW_WINDOW;
      if (!Services.prefs.getBoolPref(APPLIED, false)) {
        Services.prefs.setIntPref(SAVED, Services.prefs.prefHasUserValue(PREF) ? Services.prefs.getIntPref(PREF) : -1);
        Services.prefs.setIntPref(PREF, WINDOW);
        Services.prefs.setBoolPref(APPLIED, true);
      }
      this.restorers.push(() => {
        if (!Services.prefs.prefHasUserValue(SAVED) || Services.prefs.getIntPref(PREF, -1) != WINDOW) {
          return; // inzwischen selbst umgestellt: so lassen
        }
        const was = Services.prefs.getIntPref(SAVED, -1);
        if (was < 0) {
          Services.prefs.clearUserPref(PREF);
        } else {
          Services.prefs.setIntPref(PREF, was);
        }
        // beim nächsten Einschalten wieder Fenster
        Services.prefs.clearUserPref(SAVED);
        Services.prefs.clearUserPref(APPLIED);
      });
    } catch (e) {
      log("open message behavior error", e);
    }
  }

  pdfInSystemViewerOnce() {
    const APPLIED = "extensions.mailcards.pdfApplied";
    const SAVED = "extensions.mailcards.pdfSaved"; // vorherige Aktion
    try {
      const mime = Cc["@mozilla.org/mime;1"].getService(Ci.nsIMIMEService);
      const handlers = Cc["@mozilla.org/uriloader/handler-service;1"].getService(Ci.nsIHandlerService);
      const pdf = () => mime.getFromTypeAndExtension("application/pdf", "pdf");
      const info = pdf();
      if (!Services.prefs.getBoolPref(APPLIED, false)) {
        // ohne Standardprogramm im System (manche Linux) bleibt Thunderbirds Anzeige
        if (!info.hasDefaultHandler) {
          return;
        }
        if (info.preferredAction == Ci.nsIHandlerInfo.handleInternally && !info.alwaysAskBeforeHandling) {
          Services.prefs.setIntPref(SAVED, info.preferredAction);
          info.preferredAction = Ci.nsIHandlerInfo.useSystemDefault;
          handlers.store(info);
        }
        Services.prefs.setBoolPref(APPLIED, true);
      }
      this.restorers.push(() => {
        if (!Services.prefs.prefHasUserValue(SAVED)) {
          return;
        }
        const now = pdf();
        if (now.preferredAction == Ci.nsIHandlerInfo.useSystemDefault && !now.alwaysAskBeforeHandling) {
          now.preferredAction = Services.prefs.getIntPref(SAVED);
          handlers.store(now);
          // beim nächsten Einschalten wieder das System
          Services.prefs.clearUserPref(APPLIED);
        }
        Services.prefs.clearUserPref(SAVED);
      });
    } catch (e) {
      log("pdf handler error", e);
    }
  }

  // Einmalig: nur Symbole statt Symbol und Text, wenn die Mail-Toolbar beim
  // ersten Start noch auf Thunderbirds Standard steht; danach die Bereiche
  // mit der halo.spaces-Anordnung füllen
  applyToolbarOnce() {
    if (!Services.prefs.getBoolPref(TOOLBAR_PREF, false)) {
      try {
        const { getState } = ChromeUtils.importESModule("resource:///modules/CustomizationState.mjs");
        if (!getState().mail) {
          Services.prefs.setIntPref("toolbar.unifiedtoolbar.buttonstyle", 2); // nur Symbole
        }
        Services.prefs.setBoolPref(TOOLBAR_PREF, true);
      } catch (e) {
        log("toolbar error", e);
      }
    }
    this.fillToolbarDefaults();
    // „Zurücksetzen“ in „Symbolleiste anpassen“ speichert den Bereich ohne
    // Eintrag (= Thunderbirds Standard): gleich wieder füllen und den
    // Mailkopf neu bewerten (Antworten-Knöpfe dort nur ohne Toolbar-Knöpfe)
    const obs = () => {
      this.fillToolbarDefaults();
      this.updateStandalone();
      // Thunderbird baut die Knöpfe danach neu auf: Lage und Einklappen bei
      // Platzmangel neu messen (sonst blieben z. B. nach dem Zurücksetzen
      // Knöpfe eingeklappt, obwohl wieder Platz ist)
      const top = Services.wm.getMostRecentWindow("mail:3pane");
      for (const ms of [50, 400]) {
        top?.setTimeout(() => this.offsetUpdaters?.forEach(fn => fn()), ms);
      }
    };
    Services.obs.addObserver(obs, "unified-toolbar-state-change");
    this.restorers.push(() => Services.obs.removeObserver(obs, "unified-toolbar-state-change"));
  }

  // Bereiche ohne eigenen Eintrag stehen auf Thunderbirds Standard: mit der
  // halo.spaces-Anordnung füllen; eigene Anordnungen bleiben erhalten,
  // Knöpfe anderer Add-ons aus Thunderbirds Standard kommen ans Ende
  haloToolbar(space) {
    const items = { mail: APPLE_TOOLBAR, ...SPACE_TOOLBARS }[space];
    if (!items) {
      return null;
    }
    const { getDefaultItemIdsForSpace, EXTENSION_PREFIX } = ChromeUtils.importESModule("resource:///modules/CustomizableItems.sys.mjs");
    return [...items, ...getDefaultItemIdsForSpace(space).filter(id => id.startsWith(EXTENSION_PREFIX))];
  }

  fillToolbarDefaults() {
    try {
      const { getState, storeState } = ChromeUtils.importESModule("resource:///modules/CustomizationState.mjs");
      const state = { ...getState() };
      let changed = false;
      const ab = state.addressbook;
      if (ab && OLD_ADDRESSBOOK_TOOLBAR.every((id, i) => ab[i] == id) &&
          ab.slice(OLD_ADDRESSBOOK_TOOLBAR.length).every(id => !SPACE_TOOLBARS.addressbook.includes(id))) {
        state.addressbook = [...SPACE_TOOLBARS.addressbook, ...ab.slice(OLD_ADDRESSBOOK_TOOLBAR.length)];
        changed = true;
      }
      // Thunderbird speichert seinen Standard samt Knopf eines Add-ons, sobald
      // es eins installiert oder aktualisiert (GitHub-Issue #33) – das ist
      // keine eigene Anordnung: ebenso füllen, Knöpfe der Add-ons bleiben
      const { getDefaultItemIdsForSpace, EXTENSION_PREFIX } = ChromeUtils.importESModule("resource:///modules/CustomizableItems.sys.mjs");
      const own = ids => ids.filter(id => !id.startsWith(EXTENSION_PREFIX));
      const isTbDefault = (space, ids) => {
        const a = own(ids);
        const b = own(getDefaultItemIdsForSpace(space));
        return a.length == b.length && a.every((id, i) => id == b[i]);
      };
      for (const space of ["mail", ...Object.keys(SPACE_TOOLBARS)]) {
        const stored = state[space];
        if (!stored || isTbDefault(space, stored)) {
          const ids = this.haloToolbar(space);
          if (ids) {
            state[space] = [...ids, ...(stored || []).filter(id => id.startsWith(EXTENSION_PREFIX) && !ids.includes(id))];
            changed = true;
          }
        }
      }
      if (changed) {
        storeState(state);
      }
    } catch (e) {
      log("toolbar error", e);
    }
  }

  // „Zurücksetzen“ in der Anpassung zeigt gleich die halo.spaces-Anordnung
  // (gespeichert wird sie über fillToolbarDefaults)
  hookToolbarReset(top) {
    const ce = top?.customElements;
    if (!ce || top.__mcResetHook) {
      return;
    }
    top.__mcResetHook = true;
    const self = this;
    ce.whenDefined("unified-toolbar-customization-pane").then(() => {
      const proto = ce.get("unified-toolbar-customization-pane").prototype;
      if (proto.__mcReset) {
        return;
      }
      const orig = proto.reset;
      proto.__mcReset = orig;
      proto.reset = function () {
        orig.call(this);
        try {
          const ids = self.haloToolbar(this.getAttribute("space"));
          for (const el of ids ? this.shadowRoot?.querySelectorAll(".toolbar-target, .space-specific-palette, .generic-palette") ?? [] : []) {
            el.setItems(ids);
          }
        } catch (e) {
          log("toolbar reset error", e);
        }
        // Knopfdarstellung wie halo.spaces „nur Symbole“ statt Thunderbirds
        // „Symbol und Text“ (das Formular setzt die Auswahl erst nach diesem
        // Aufruf zurück, daher danach); sonst werden die Knöpfe breiter und
        // „Abrufen“ & Co. klappen mangels Platz ein
        const select = this.closest("unified-toolbar-customization")?.querySelector("#buttonStyle");
        if (select) {
          top.setTimeout(() => {
            select.value = "icons-only";
            select.dispatchEvent(new top.Event("change", { bubbles: true }));
          }, 0);
        }
      };
      self.addWinRestorer(top, () => {
        proto.reset = orig;
        delete proto.__mcReset;
        delete top.__mcResetHook;
      });
    });
  }

  // Mailkopf mit eigenen Antworten-Knöpfen (mc-standalone): im eigenen
  // Fenster immer, im Mailbereich nur, wenn die Toolbar keine hat
  replyInToolbar() {
    try {
      const { getState } = ChromeUtils.importESModule("resource:///modules/CustomizationState.mjs");
      return getState().mail?.includes("reply") ?? false;
    } catch {
      return false;
    }
  }

  updateStandalone() {
    const inToolbar = this.replyInToolbar();
    for (const top of Services.wm.getEnumerator("mail:3pane")) {
      for (const bc of ThemeSheet.contexts(top)) {
        const doc = bc.window?.document;
        if (doc?.documentURI?.startsWith("about:message") && !doc.documentElement.hasAttribute("mc-conv-card")) {
          doc.documentElement.toggleAttribute("mc-standalone", !inToolbar);
        }
      }
    }
  }

  // Die Toolbar-Knöpfe sollen – wie in Apple Mail – genau über der linken
  // Kante der geöffneten Mail beginnen. Die Breite der Spalten davor wird
  // als CSS-Variable ans Hauptfenster gegeben (userChrome.css nutzt sie).
  trackToolbarOffset(win) {
    const top = win.browsingContext?.topChromeWindow;
    const threadPane = win.document.getElementById("threadPane");
    if (!top || !threadPane) {
      return;
    }
    // Thunderbird sperrt die Ordnerliste zeitweise mit „width: …px !important“
    // (Teiler „resize-lock-ids“). Wird diese Sperre in einem ungünstigen Moment
    // gesetzt (z. B. mitten in einer Animation), bleibt die Liste schmaler als
    // ihre Spalte und rechts davon entsteht eine weiße Lücke. Dann die Sperre
    // auf die echte Spaltenbreite korrigieren.
    const fixFolderLock = () => {
      const splitter = win.paneLayout?.folderPaneSplitter;
      const pane = win.document.getElementById("folderPane");
      if (!splitter || !pane || splitter.isCollapsed || win.__mcAnimating) {
        return;
      }
      if (pane.style.getPropertyPriority("width") != "important") {
        return;
      }
      const column = parseFloat(win.getComputedStyle(splitter.parentNode).gridTemplateColumns);
      const locked = parseFloat(pane.style.getPropertyValue("width"));
      if (Number.isFinite(column) && column > 0 && Math.abs(column - locked) > 1) {
        log("folder lock fixed", { locked, column });
        pane.style.setProperty("width", `${column}px`, "important");
      }
    };
    // Die Mailliste lässt sich nur so weit nach rechts ziehen, dass Knöpfe
    // und Suchfeld rechts davon Platz haben (wie in Apple Mail) – Thunderbirds
    // Teiler kennt kein Maximum, daher hier die kleinste Breite der Nachricht
    const minMessageWidth = () => {
      const pane = win.document.getElementById("messagePane");
      const browserEl = win.browsingContext.embedderElement;
      const row = top.document.getElementById("unifiedToolbarContainer");
      if (!pane || !browserEl || !row || !win.document.body.classList.contains("layout-vertical")) {
        return 0;
      }
      const msgRight = rectOf(browserEl).left + rectOf(pane).right;
      const want = toolbarNeed(top.document, true) - (rectOf(row).right - msgRight);
      // die Liste selbst nie schmaler als ihre Mindestbreite (CSS) machen
      const list = rectOf(threadPane);
      const listMin = parseFloat(win.getComputedStyle(threadPane).minWidth) || 240;
      const room = rectOf(pane).right - list.left - listMin;
      // mindestens 300 px (Thunderbirds Grenze), sonst so viel, wie die Knöpfe darüber brauchen
      return Math.max(0, Math.min(Math.max(want, 300), room));
    };
    const msgSplitter = win.document.getElementById("messagePaneSplitter");
    if (msgSplitter && typeof msgSplitter._updateSize == "function" && !msgSplitter.__mcClamp) {
      msgSplitter.__mcClamp = true;
      const origUpdate = msgSplitter._updateSize;
      msgSplitter._updateSize = function (size) {
        return origUpdate.call(this, typeof size == "number" ? Math.max(size, minMessageWidth()) : size);
      };
      // Ziehen klappt die Mail nicht mehr weg (Thunderbird klappt unter
      // „collapse-width“ zu, noch bevor die Mindestbreite greift); Ausblenden
      // über Ansicht → Layout geht weiter
      const collapseWidth = msgSplitter.getAttribute("collapse-width");
      msgSplitter.removeAttribute("collapse-width");
      this.restorers.push(() => {
        msgSplitter._updateSize = origUpdate;
        if (collapseWidth) {
          msgSplitter.setAttribute("collapse-width", collapseWidth);
        }
        delete msgSplitter.__mcClamp;
      });
    }
    // Mailliste in ihrer gemerkten Breite halten: ändert sich die Fensterbreite
    // (oder Today-Pane/Ordnerliste), bekommt die Nachricht die Differenz
    const keepListWidth = () => {
      if (!msgSplitter || msgSplitter.isCollapsed || win.__mcAnimating || top.__mcSpacesAnimating ||
          msgSplitter.resizeElement?.id != "messagePane" || !win.document.body.classList.contains("layout-vertical") ||
          msgSplitter.__mcDragging) {
        return;
      }
      const pane = win.document.getElementById("messagePane");
      const list = threadPane.getBoundingClientRect();
      const msg = pane.getBoundingClientRect();
      if (!list.width || !msg.width) {
        return;
      }
      const want = Services.prefs.getIntPref(LIST_WIDTH_PREF, LIST_WIDTH_DEFAULT);
      // Platz der Liste bis zum Teiler (nicht nur die Liste selbst: Thunderbird
      // hält sie beim Ändern der Fenstergröße fest, die Spalte wächst trotzdem –
      // daneben bliebe eine Lücke)
      // (sonst liegen zwischen Liste und Teiler nur wenige Pixel Rand)
      const gap = msgSplitter.getBoundingClientRect().left - list.right;
      const span = gap > 8 ? list.width + gap - 4 : list.width;
      // was die Liste zu breit ist, bekommt die Nachricht dazu (und umgekehrt)
      const msgWant = Math.round(msg.width + span - want);
      if (msgWant > 0 && Math.abs(msgWant - msg.width) >= 1) {
        msgSplitter.width = Math.max(msgWant, Math.min(300, minMessageWidth()));
      }
    };
    // gezogen: neue Listenbreite merken
    if (msgSplitter && !msgSplitter.__mcListWatch) {
      msgSplitter.__mcListWatch = true;
      const onResizing = () => (msgSplitter.__mcDragging = true);
      const onResized = () => {
        if (!msgSplitter.__mcDragging) {
          return;
        }
        msgSplitter.__mcDragging = false;
        // nur nebeneinander (vertikales Layout): im klassischen Layout ist die
        // Liste so breit wie das Fenster – gemerkt kam sie nach dem Wechsel
        // zurück viel zu breit
        if (msgSplitter.resizeDirection == "vertical") {
          return;
        }
        const width = Math.round(threadPane.getBoundingClientRect().width);
        if (width >= 200) {
          Services.prefs.setIntPref(LIST_WIDTH_PREF, width);
        }
      };
      msgSplitter.addEventListener("splitter-resizing", onResizing);
      msgSplitter.addEventListener("splitter-resized", onResized);
      this.restorers.push(() => {
        msgSplitter.removeEventListener("splitter-resizing", onResizing);
        msgSplitter.removeEventListener("splitter-resized", onResized);
        delete msgSplitter.__mcListWatch;
        delete msgSplitter.__mcDragging;
      });
    }
    // (außerhalb des Ziehens der Mailliste nur Thunderbirds 300 px – mit dem
    // Platzbedarf der Knöpfe ließ sich sonst auf kleineren Bildschirmen die
    // Seitenleiste kaum noch verbreitern; die Knöpfe weichen dann wie sonst)
    const enforceMessageWidth = () => {
      if (!msgSplitter || msgSplitter.isCollapsed || win.__mcAnimating || top.__mcSpacesAnimating ||
          msgSplitter.resizeElement?.id != "messagePane") {
        return;
      }
      const min = Math.min(300, minMessageWidth());
      const pane = win.document.getElementById("messagePane");
      if (min && pane.getBoundingClientRect().width < min - 1) {
        msgSplitter.width = Math.ceil(min);
      }
    };
    const update = () => {
      const content = top.document.getElementById("unifiedToolbarContent");
      const browserEl = win.browsingContext.embedderElement;
      // (schwebende Seitenleiste: die Ordnerliste liegt nur darüber)
      if (!content || !browserEl || win.closed || top.__mcSideFloat) {
        return;
      }
      // Bereiche-Leiste animiert: nur die Kanten an der Toolbar-Zeile mitführen (wenige Schreibzugriffe), das
      // Übrige (Listenbreite, Tab- und Statusleiste, Platzaufteilung) erst am Ende – sonst springen die Knöpfe
      // am Ende, bzw. mit allem pro Bild ruckelt es (Stufe 3)
      const spacesMoving = !!top.__mcSpacesAnimating && !top.__mcDry;
      if (!spacesMoving) {
        keepListWidth();
        enforceMessageWidth();
      }
      // nur der Mail-Tab, der gerade vorne ist, richtet die Toolbar aus –
      // sonst überschreibt ein zweiter Mail-Tab im Hintergrund die Kanten
      // (auch nicht, solange ein anderer Bereich vorne ist)
      const current = top.document.getElementById("tabmail")?.currentTabInfo;
      if (current?.chromeBrowser != browserEl) {
        return;
      }
      if (!spacesMoving) {
        fixFolderLock();
      }
      // im Adressbuch neu gezogene Listenbreite übernehmen
      if (this.mcListPending && msgSplitter && !msgSplitter.isCollapsed && msgSplitter.resizeElement?.id == "messagePane") {
        const listNow = rectOf(threadPane).width;
        const pane = win.document.getElementById("messagePane");
        if (listNow > 1 && this.mcButtonsLeft) {
          this.mcListPending = false;
          // rechte Listenkante auf die im Adressbuch gezogene Stelle
          const browserLeft = rectOf(win.browsingContext.embedderElement).left;
          const diff = browserLeft + rectOf(threadPane).right - (this.mcButtonsLeft - 6);
          if (Math.abs(diff) >= 1) {
            Services.prefs.setIntPref(LIST_WIDTH_PREF, Math.max(200, Math.round(listNow - diff)));
            msgSplitter.width = Math.max(minMessageWidth(), Math.round(rectOf(pane).width + diff));
          }
        }
      }
      // Ohne sichtbare Mailliste (z. B. Kontoübersicht) bleiben die Knöpfe
      // dort, wo sie in der Mailansicht zuletzt standen.
      const listRect = rectOf(threadPane);
      const folderRect = rectOf(win.document.getElementById("folderPane"));
      let listRight;
      if (listRect.width > 1) {
        listRight = listRect.right;
        this.lastListRight = listRight - (folderRect?.right || 0); // Breite der Mailliste merken
      } else {
        listRight = (folderRect?.right || 0) + (this.lastListRight ?? 0);
      }
      const paneRight = rectOf(browserEl).left + listRight;
      // für die übrigen Bereiche merken: dort beginnen die Knöpfe an derselben
      // Stelle, und die Kontaktliste im Adressbuch ist so breit wie die Mailliste
      this.mcButtonsLeft = paneRight + 6;
      if (listRect.width > 1) {
        this.mcListWidth = Math.round(listRect.width);
      }
      // Bezug ist der Anfang des ersten Abstandhalters (die Toolbar hat
      // eigenen Innenabstand); +6 px wie der Einzug in Apple Mail.
      const start = rectOf(leadSpacer(content) || content).left;
      let offset = Math.max(0, Math.round(paneRight - start + 6));
      // nie links vom Seitenleisten-Knopf beginnen
      const toggle = top.document.getElementById("spacesPinnedButton");
      const tb = rectOf(toggle);
      if (tb && tb.width) {
        offset = Math.max(offset, Math.round(tb.right - start + 12));
      }
      setBarVar(top.document, "--mc-toolbar-offset", `${offset}px`);
      setVar(top.document.getElementById("unifiedToolbarContainer"), "--mc-row-tail", `${rowTail(top.document)}px`);
      // auch während die Today-Pane ein-/ausgleitet: sonst blendet das
      // Nachmessen mitten in der Animation Knöpfe um (ein 45-ms-Hänger)
      const animating = !top.__mcDry && (top.__mcSpacesAnimating || win.__mcAnimating ||
        top.document.getElementById("today-pane-panel")?.__mcAnimating);
      if (!animating) {
        const firstSpacer = content.querySelector(':scope > li[item-id="spacer"]');
        // passt, wenn die Knöpfe an der Listenkante beginnen und das Suchfeld
        // noch nicht ganz zur Lupe (40 px) geschrumpft ist – wie Apple Mail
        // wird zuerst die Suche schmaler, erst dann weichen Knöpfe
        const search = content.querySelector(':scope > li[item-id="search-bar"]');
        squeezeToolbar(top.document, () => (!firstSpacer || rectOf(firstSpacer).right >= start + offset - 2) &&
          (!search || rectOf(search).width > 41));
      }
      // Suchfeld in jedem Bereich gleich breit (333 px wie Apple Mail): fehlt
      // dafür Platz, wird zuerst der Abstand nach „Verfassen“ kleiner (69 → 12 px)
      const write = content.querySelector(':scope > li[item-id="write-message"]');
      const search = content.querySelector(':scope > li[item-id="search-bar"]');
      // (nicht während einer Ein-/Ausblend-Animation – das kostet pro Bild ein
      // komplettes Neuberechnen; am Ende wird einmal gemessen)
      if (!animating && write && search && rectOf(write).width) {
        const spacer = search.previousElementSibling;
        const gap = parseFloat(top.getComputedStyle(write).marginInlineEnd) || 0;
        const spare = (spacer?.getAttribute("item-id") == "spacer" ? rectOf(spacer).width : 0) -
          (333 - rectOf(search).width);
        const next = Math.max(12, Math.min(69, Math.round(gap + spare)));
        if (Math.abs(next - gap) >= 1) {
          setBarVar(top.document, "--mc-write-gap", `${next}px`);
        }
      }
      // Rechte Kante der Ordnerliste relativ zur Toolbar-Zeile: damit färbt
      // userChrome.css die Seitenleiste bis ganz nach oben grau wie in Apple Mail.
      const folderPane = win.document.getElementById("folderPane");
      const row = top.document.getElementById("unifiedToolbarContainer");
      if (folderPane && row) {
        const fr = rectOf(folderPane);
        const right = fr.width
          ? rectOf(browserEl).left + fr.right - rectOf(row).left
          : 0;
        setBarVar(top.document, "--mc-sidebar-right", `${Math.max(0, Math.round(right))}px`
        );
        // rechte Kante der Mailliste für die Trennlinie in der Toolbar-Zeile
        // Ist das Fenster für alle Knöpfe zu schmal, schrumpft der Einzug davor –
        // die Kopfzeile über der Liste endet dann vor dem ersten Knopf
        const firstSpacer = content.querySelector(':scope > li[item-id="spacer"]');
        const buttonsStart = firstSpacer ? rectOf(firstSpacer).right : paneRight;
        const rowLeft = rectOf(row).left;
        // Trennlinie an der echten Kante der Mailliste; reicht der Platz nicht
        // und die Knöpfe beginnen schon links davon, entfällt sie in der
        // Toolbar-Zeile (statt versetzt quer durch die Knöpfe zu laufen)
        const listRight = buttonsStart >= paneRight - 2 ? paneRight - rowLeft : -10;
        setBarVar(top.document, "--mc-lh-right", `${Math.round(Math.min(paneRight, buttonsStart - 6) - rowLeft)}px`);
        // auf ganze Bildpunkte des Bildschirms (Retina: 0,5 px) – wie der
        // Rand der Mailliste, sonst steht die Linie oben um einen Punkt daneben
        const dpr = top.devicePixelRatio || 1;
        setBarVar(top.document, "--mc-list-right", `${Math.round(listRight * dpr) / dpr}px`
        );
        // Die Tab-Leiste kann weiter rechts beginnen (z. B. neben der
        // Bereiche-Leiste) – dort dieselben Kanten, um den Versatz korrigiert.
        const tabs = !spacesMoving && top.document.getElementById("tabs-toolbar");
        if (tabs) {
          const shift = rectOf(tabs).left - rectOf(row).left;
          setVar(tabs, "--mc-sidebar-right", `${Math.max(0, Math.round(right - shift))}px`);
          setVar(tabs, "--mc-list-right", `${Math.round((listRight - shift) * dpr) / dpr}px`);
        }
        // Statusleiste ebenso: Seitenleisten-Grau läuft unten bis zum Fensterrand
        const status = !spacesMoving && top.document.getElementById("status-bar");
        if (status) {
          const shift = rectOf(status).left - rectOf(row).left;
          setVar(status, "--mc-sidebar-right", `${Math.max(0, Math.round(right - shift))}px`);
        }
      }
    };
    this.offsetUpdaters ??= new Set();
    this.offsetUpdaters.add(update);
    // von außen anstoßen (automatisches Einklappen misst danach den Platz)
    win.__mcRelayout = update;
    const ro = new win.ResizeObserver(update);
    ro.observe(threadPane);
    const fp = win.document.getElementById("folderPane");
    if (fp) {
      ro.observe(fp);
    }
    // Ordnerliste ein-/ausgeklappt: sofort neu ausrichten (ein eingeklapptes
    // Element meldet der ResizeObserver nicht zuverlässig)
    const splitterEl = win.document.getElementById("folderPaneSplitter");
    const onSplitter = () => win.setTimeout(update, 0);
    for (const type of ["splitter-collapsed", "splitter-expanded", "splitter-resized"]) {
      splitterEl?.addEventListener(type, onSplitter);
    }
    this.restorers.push(() => {
      for (const type of ["splitter-collapsed", "splitter-expanded", "splitter-resized"]) {
        splitterEl?.removeEventListener(type, onSplitter);
      }
    });
    ro.observe(win.document.documentElement);
    // auch die Toolbar-Zeile selbst: ändert sich nur sie (Fenster wird auf
    // seine Mindestbreite nachgezogen, Today-Pane), blieben sonst Knöpfe aus
    // einem engeren Zwischenstand ausgeblendet, obwohl wieder Platz ist
    const toolbarRow = top.document.getElementById("unifiedToolbarContainer");
    const rowRo = toolbarRow ? new top.ResizeObserver(() => update()) : null;
    rowRo?.observe(toolbarRow);
    update();
    this.restorers.push(() => {
      ro.disconnect();
      rowRo?.disconnect();
      this.offsetUpdaters?.delete(update);
      const tabsBar = top.document.getElementById("tabs-toolbar");
      tabsBar?.style.removeProperty("--mc-sidebar-right");
      tabsBar?.style.removeProperty("--mc-list-right");
      top.document.getElementById("status-bar")?.style.removeProperty("--mc-sidebar-right");
      barTarget(top.document).style.removeProperty("--mc-toolbar-offset");
      barTarget(top.document).style.removeProperty("--mc-sidebar-right");
      barTarget(top.document).style.removeProperty("--mc-list-right");
      barTarget(top.document).style.removeProperty("--mc-lh-right");
    });
  }

  // Eigene Symbole statt Thunderbirds --icon-*-Grafiken. Die SVGs nutzen
  // context-stroke/-fill (Farbe vom Element) – das erlauben nur chrome:// und
  // resource://, deshalb resource://mailcards/ auf die Erweiterung zeigen lassen
  // und icon-vars.css als Benutzer-Stylesheet für alle Dokumente anmelden.
  registerIconVars() {
    if (!extensionRoot) {
      return;
    }
    const res = Services.io.getProtocolHandler("resource").QueryInterface(Ci.nsIResProtocolHandler);
    res.setSubstitution("mailcards", extensionRoot);
    this.restorers.push(() => res.setSubstitution("mailcards", null));
    // Design in alle offenen Fenster (neue übernimmt der docObserver);
    // die Version in der Adresse umgeht Thunderbirds Stylesheet-Zwischenspeicher
    ThemeSheet.uri = `resource://mailcards/theme.css?v=${extensionVersion}`;
    ThemeSheet.init();
    for (const win of Services.wm.getEnumerator(null)) {
      ThemeSheet.applyTree(win);
    }
    this.restorers.push(() => ThemeSheet.removeAll());
    const sss = Cc["@mozilla.org/content/style-sheet-service;1"].getService(Ci.nsIStyleSheetService);
    // Scrollleisten überall ausblenden – global, damit auch Nachrichtentexte
    // und Dialoge ohne eigenes Design-Stylesheet erfasst sind
    const noScroll = Services.io.newURI(`resource://mailcards/noscroll.css?v=${extensionVersion}`);
    if (!sss.sheetRegistered(noScroll, sss.USER_SHEET)) {
      sss.loadAndRegisterSheet(noScroll, sss.USER_SHEET);
    }
    this.restorers.push(() => {
      if (sss.sheetRegistered(noScroll, sss.USER_SHEET)) {
        sss.unregisterSheet(noScroll, sss.USER_SHEET);
      }
    });
    // Textmails in der Systemschrift – schaltet sofort mit der Einstellung um
    const plain = Services.io.newURI(`resource://mailcards/plaintext.css?v=${extensionVersion}`);
    const applyPlain = () => {
      const on = Services.prefs.getBoolPref(PLAIN_TEXT_PREF, true) && Services.prefs.getBoolPref("extensions.mailcards.bundledTheme", true);
      const has = sss.sheetRegistered(plain, sss.USER_SHEET);
      if (on && !has) {
        sss.loadAndRegisterSheet(plain, sss.USER_SHEET);
      } else if (!on && has) {
        sss.unregisterSheet(plain, sss.USER_SHEET);
      }
    };
    const plainObs = { observe: applyPlain };
    Services.prefs.addObserver(PLAIN_TEXT_PREF, plainObs);
    applyPlain();
    this.restorers.push(() => {
      Services.prefs.removeObserver(PLAIN_TEXT_PREF, plainObs);
      if (sss.sheetRegistered(plain, sss.USER_SHEET)) {
        sss.unregisterSheet(plain, sss.USER_SHEET);
      }
    });
    // Thunderbirds Schriftgröße auch für die festen Größen des Designs:
    // --mt-font-scale (fontScale) global für alle Seiten; bei Standardgröße
    // kein Blatt
    let scaleUri = null;
    const applyFontScale = () => {
      const scale = fontScale();
      const uri = scale == 1 ? null : Services.io.newURI(`data:text/css,:root{--mt-font-scale:${scale}}`);
      if (uri?.spec == scaleUri?.spec) {
        return;
      }
      if (scaleUri && sss.sheetRegistered(scaleUri, sss.USER_SHEET)) {
        sss.unregisterSheet(scaleUri, sss.USER_SHEET);
      }
      if (uri) {
        sss.loadAndRegisterSheet(uri, sss.USER_SHEET);
      }
      scaleUri = uri;
    };
    const scaleObs = { observe: applyFontScale };
    Services.prefs.addObserver("mail.uifontsize", scaleObs);
    applyFontScale();
    // Standardgröße des Systems kennt Thunderbird erst mit dem ersten Fenster
    const scaleTimer = setTimeout(applyFontScale, 3000);
    this.restorers.push(() => {
      clearTimeout(scaleTimer);
      Services.prefs.removeObserver("mail.uifontsize", scaleObs);
      if (scaleUri && sss.sheetRegistered(scaleUri, sss.USER_SHEET)) {
        sss.unregisterSheet(scaleUri, sss.USER_SHEET);
      }
    });
    // gedruckte Mail im Stil von Apple Mail (print.css) – gehört zum Design
    const print = Services.io.newURI(`resource://mailcards/print.css?v=${extensionVersion}`);
    if (Services.prefs.getBoolPref("extensions.mailcards.bundledTheme", true) && !sss.sheetRegistered(print, sss.USER_SHEET)) {
      sss.loadAndRegisterSheet(print, sss.USER_SHEET);
    }
    this.restorers.push(() => {
      if (sss.sheetRegistered(print, sss.USER_SHEET)) {
        sss.unregisterSheet(print, sss.USER_SHEET);
      }
    });
    // Ungelesene Mails leicht in Akzentfarbe (Option, Standard aus) – schaltet sofort um
    const tint = Services.io.newURI(`resource://mailcards/unread-tint.css?v=${extensionVersion}`);
    const applyTint = () => {
      const on = Services.prefs.getBoolPref(UNREAD_TINT_PREF, false);
      const has = sss.sheetRegistered(tint, sss.USER_SHEET);
      if (on && !has) {
        sss.loadAndRegisterSheet(tint, sss.USER_SHEET);
      } else if (!on && has) {
        sss.unregisterSheet(tint, sss.USER_SHEET);
      }
    };
    const tintObs = { observe: applyTint };
    Services.prefs.addObserver(UNREAD_TINT_PREF, tintObs);
    applyTint();
    this.restorers.push(() => {
      Services.prefs.removeObserver(UNREAD_TINT_PREF, tintObs);
      if (sss.sheetRegistered(tint, sss.USER_SHEET)) {
        sss.unregisterSheet(tint, sss.USER_SHEET);
      }
    });
    // Deckende Menüs (Option, Standard aus) – schaltet sofort um
    const solid = Services.io.newURI(`resource://mailcards/solid-menus.css?v=${extensionVersion}`);
    const applySolid = () => {
      const on = Services.prefs.getBoolPref(SOLID_MENUS_PREF, false);
      const has = sss.sheetRegistered(solid, sss.USER_SHEET);
      if (on && !has) {
        sss.loadAndRegisterSheet(solid, sss.USER_SHEET);
      } else if (!on && has) {
        sss.unregisterSheet(solid, sss.USER_SHEET);
      }
    };
    const solidObs = { observe: applySolid };
    Services.prefs.addObserver(SOLID_MENUS_PREF, solidObs);
    applySolid();
    this.restorers.push(() => {
      Services.prefs.removeObserver(SOLID_MENUS_PREF, solidObs);
      if (sss.sheetRegistered(solid, sss.USER_SHEET)) {
        sss.unregisterSheet(solid, sss.USER_SHEET);
      }
    });
    // ::part-Regeln gelten nur aus Author-Stylesheets (siehe parts.css)
    if (Services.prefs.getBoolPref("extensions.mailcards.bundledTheme", true)) {
      const parts = Services.io.newURI(`resource://mailcards/parts.css?v=${extensionVersion}`);
      if (!sss.sheetRegistered(parts, sss.AUTHOR_SHEET)) {
        sss.loadAndRegisterSheet(parts, sss.AUTHOR_SHEET);
      }
      this.restorers.push(() => {
        if (sss.sheetRegistered(parts, sss.AUTHOR_SHEET)) {
          sss.unregisterSheet(parts, sss.AUTHOR_SHEET);
        }
      });
      // Textfläche des Verfassen-Fensters (about:blank?compose) dunkel in der
      // Fläche des Fensters – theme.css gilt dort nicht (siehe compose-body.css)
      const body = Services.io.newURI(`resource://mailcards/compose-body.css?v=${extensionVersion}`);
      if (!sss.sheetRegistered(body, sss.USER_SHEET)) {
        sss.loadAndRegisterSheet(body, sss.USER_SHEET);
      }
      this.restorers.push(() => {
        if (sss.sheetRegistered(body, sss.USER_SHEET)) {
          sss.unregisterSheet(body, sss.USER_SHEET);
        }
      });
    }
    if (!Services.prefs.getBoolPref("extensions.mailcards.appleIcons", true)) {
      return;
    }
    const uri = Services.io.newURI(`resource://mailcards/icon-vars.css?v=${extensionVersion}`);
    if (!sss.sheetRegistered(uri, sss.USER_SHEET)) {
      sss.loadAndRegisterSheet(uri, sss.USER_SHEET);
    }
    this.restorers.push(() => {
      if (sss.sheetRegistered(uri, sss.USER_SHEET)) {
        sss.unregisterSheet(uri, sss.USER_SHEET);
      }
    });
  }

  // Kontextmenü der Nachrichten wie in Apple Mail, ohne Untermenüs für das
  // Häufige: Öffnen, Als neue Nachricht bearbeiten | Antworten, Allen
  // antworten, (Liste, Newsgroup), Weiterleiten, als Anhang, Umleiten |
  // Erinnern | Gelesen/Ungelesen, Stern, Spam, Ignorieren, Beobachten,
  // Löschen | Archivieren, Verschieben, Kopieren | Umwandeln | Filter
  // anwenden. Thunderbirds Einträge werden nur umgehängt (Befehle, Tasten und
  // Ein-/Ausblenden bleiben bei Thunderbird); Untermenüs, Schlagwörter,
  // Speichern und Drucken (Menüleiste) fallen weg.
  hookMailContext(doc) {
    hookNewTabMenus(doc, { push: fn => this.addWinRestorer(doc.defaultView, fn) });
    // Schlagwort-Menüs der Mailansicht (Kontextmenü, Mailkopf) – eigenes InitMessageTags je Dokument
    if (doc.defaultView && !TagMenus.attached(doc.defaultView)) {
      TagMenus.attach(doc.defaultView);
      this.addWinRestorer(doc.defaultView, () => TagMenus.detach(doc.defaultView));
    }
    const popup = doc.getElementById("mailContext");
    const start = doc.getElementById("mailContext-open");
    if (!popup || !start || popup.__mcList) {
      return;
    }
    popup.__mcList = true;
    const win = doc.defaultView;
    const $ = id => doc.getElementById(id);
    const enabled = command => {
      try {
        return !!win.commandController?.isCommandEnabled(command);
      } catch {
        return false;
      }
    };
    const own = (id, label, command) => {
      const item = doc.createXULElement("menuitem");
      item.id = id;
      item.setAttribute("label", tr(label));
      item.addEventListener("command", event => {
        event.stopPropagation();
        win.commandController?.doCommand(command, event);
      });
      return item;
    };
    // eigener Text statt Thunderbirds Untermenü-Kurzform („Read“, „As Spam“)
    const relabel = (id, label) => {
      const el = $(id);
      if (el) {
        el.removeAttribute("data-l10n-id");
        el.removeAttribute("data-l10n-args");
        el.setAttribute("label", tr(label));
        el.classList.remove("menuitem-iconic");
      }
      return el;
    };
    const open = own("mcContextOpen", "Open", "cmd_openMessage");
    const filters = own("mcContextRunFilters", "Apply Rules", "cmd_applyFiltersToSelection");
    // Filter aus dieser Mail anlegen – stand nur im ausgeblendeten Menü Message
    const makeFilter = own("mcContextCreateFilter", "Create Rule from Message…", "cmd_createFilterFromMenu");
    const remindSep = doc.createXULElement("menuseparator");
    remindSep.id = "mcContextRemindSep";
    const S = "-";
    const order = [
      open, "mailContext-editAsNew", S,
      relabel("mailContext-replySender", "Reply"), relabel("mailContext-replyAll", "Reply All"), "mailContext-replyList",
      "mailContext-replyNewsgroup", "mailContext-forward", relabel("mailContext-forwardAsAttachment", "Forward as Attachment"),
      "mailContext-redirect", remindSep, S,
      relabel("mailContext-markRead", "Mark as Read"), relabel("mailContext-markUnread", "Mark as Unread"),
      "mailContext-markFlagged", relabel("mailContext-markAsJunk", "Mark as Spam"),
      relabel("mailContext-markAsNotJunk", "Mark as Not Spam"), "mailContext-ignoreThread", "mailContext-ignoreSubthread",
      "mailContext-watchThread", relabel("navContext-delete", "Delete"), "mailContext-cancel", S,
      "mailContext-archive", "mailContext-moveMenu", "mailContext-copyMenu", S,
      "mailContext-calendar-convert-menu", S,
      filters, makeFilter, "mailContext-downloadSelected",
    ];
    const moved = [];
    for (const entry of order) {
      const el = entry == S ? doc.createXULElement("menuseparator") : typeof entry == "string" ? $(entry) : entry;
      if (el?.localName == "menuseparator") {
        el.classList.add("mc-ctx-sep");
      }
      if (el) {
        moved.push([el, el.parentNode, el.nextSibling]);
        start.before(el);
      }
    }
    // Stern als Ein-/Ausschalter mit Text statt Häkchen
    $("mailContext-markFlagged")?.removeAttribute("type");
    const off = ["mailContext-open", "mailContext-reply", "mailContext-forwardRedirect", "mailContext-moveToFolderAgain",
      "mailContext-tags", "mailContext-mark", "mailContext-organize", "mailContext-threads", "mailContext-saveAs",
      "mailContext-print", "mailContext-navigation", "mailContext-sep-navigation"].map($).filter(Boolean);
    off.forEach(el => el.setAttribute("mc-ctx-off", ""));
    const onShowing = event => {
      if (event.target != popup) {
        return;
      }
      // nach Thunderbirds eigenem Aufbau: von Gelesen/Ungelesen und Spam/kein
      // Spam nur den passenden Eintrag zeigen (Thunderbird zeigt beide)
      const messages = !$("navContext-delete")?.hidden || !$("mailContext-moveMenu")?.hidden;
      let hdrs = [];
      try {
        hdrs = [...(win.gDBView?.getSelectedMsgHdrs() || [])];
      } catch {}
      const first = hdrs[0];
      const unread = hdrs.some(h => !h.isRead);
      const junk = first?.getStringProperty("junkscore") == Ci.nsIJunkMailPlugin.IS_SPAM_SCORE && hdrs.length == 1;
      const show = (id, on) => {
        const el = $(id);
        if (el) {
          el.hidden = !messages || !first || !on;
        }
      };
      show("mailContext-markRead", unread);
      show("mailContext-markUnread", !unread);
      show("mailContext-markAsJunk", !junk);
      show("mailContext-markAsNotJunk", junk);
      $("mailContext-markFlagged")?.setAttribute("label", tr(first?.isFlagged ? "Remove Star" : "Star"));
      // Thunderbird setzt hier bei jedem Öffnen eigene Texte („As Attachment“,
      // „Delete Message“) – nach dem Aufbau wieder durch die eigenen ersetzen
      relabel("mailContext-forwardAsAttachment", "Forward as Attachment");
      const del = $("navContext-delete");
      if (del && del.dataset.imapDeleted != "true") {
        relabel("navContext-delete", "Delete");
      }
      // „Teilfaden ignorieren“ nur bei einer Antwort innerhalb einer Konversation
      const sub = $("mailContext-ignoreSubthread");
      if (sub && !sub.hidden) {
        let reply = false;
        try {
          const thread = first.folder.msgDatabase.getThreadContainingMsgHdr(first);
          reply = thread.numChildren > 1 && thread.getRootHdr().messageKey != first.messageKey;
        } catch {}
        sub.hidden = !reply;
      }
      open.hidden = !messages || !enabled("cmd_openMessage");
      filters.hidden = !messages || !enabled("cmd_applyFiltersToSelection");
      // „Erinnern“ (Remind.hookMenu) hinter die Antworten
      const remind = $("mcRemindMenu");
      if (remind && remind.previousElementSibling != remindSep) {
        remindSep.after(remind);
      }
      // Thunderbird blendet beim Aufbau Trennlinien neben leeren Gruppen aus –
      // die eigenen ordnet das Aufräumen danach selbst
      popup.querySelectorAll(":scope > .mc-ctx-sep").forEach(el => (el.hidden = false));
      tidyMenuSeparators(popup);
    };
    // am Dokument statt am Menü: läuft so nach Thunderbirds eigenem Aufbau
    // (dessen Listener hängt am Menü selbst)
    doc.addEventListener("popupshowing", onShowing);
    this.addWinRestorer(win, () => {
      doc.removeEventListener("popupshowing", onShowing);
      off.forEach(el => el.removeAttribute("mc-ctx-off"));
      for (const [el, parent, next] of moved.reverse()) {
        if (el == open || el == filters || el.classList.contains("mc-ctx-sep")) {
          el.remove();
        } else if (parent) {
          parent.insertBefore(el, next?.parentNode == parent ? next : null);
        }
      }
      delete popup.__mcList;
    });
  }

  // Today-Pane in allen Bereichen außer dem Kalender (der zeigt den Tag selbst):
  // Thunderbird kennt sie nur in Mail, Aufgaben, Chat und Termin-Tabs –
  // Adressbuch, Einstellungen und übrige Tabs (Modus „special“) kommen dazu,
  // auch für ihre Teile (Minimonat, Termine, Aufgaben). Nach der
  // Erstinstallation einmal überall eingeblendet; danach gilt die eigene Wahl
  // Today-Pane überall gleich (wie in der Mail): Thunderbird merkt sich je
  // Bereich, ob Minikalender und Terminliste zu sind – im Chat z. B. aus
  // einem früheren Umschalten „nur Aufgaben“; den Umschalter dafür blendet
  // halo.spaces aus, die Pane blieb dort leer. Jeden Bereich wie Mail
  // (beim Start und bei jedem Wechsel des Bereichs)
  syncTodayModes(w) {
    const d = w.document;
    try {
      const panel = d.getElementById("today-pane-panel");
      const modes = (panel?.getAttribute("mode") || "").split(",").filter(m => m && m != "calendar");
      for (const id of ["agenda-panel", "today-minimonth-box", "mini-day-box", "today-none-box"]) {
        const box = d.getElementById(id);
        if (!box?.hasAttribute("collapsedinmodes") || box.getAttribute("collapsedinmodes") == ",") {
          continue;
        }
        const was = box.getAttribute("collapsedinmodes").split(",").filter(Boolean);
        const set = new Set(was);
        const mailClosed = set.has("mail");
        for (const m of modes) {
          mailClosed ? set.add(m) : set.delete(m);
        }
        const now = [...set].join(",");
        if (now != was.join(",")) {
          box.setAttribute("collapsedinmodes", now || ",");
          Services.xulStore.persist(box, "collapsedinmodes");
          if (typeof box.isVisible == "function") {
            box.collapsed = !box.isVisible();
          }
        }
      }
    } catch (e) {
      log("today pane modes error", String(e).slice(0, 160));
    }
  }

  todayPaneEverywhere(w) {
    const d = w.document;
    const panel = d.getElementById("today-pane-panel");
    if (!panel || panel.__mcEverywhere) {
      return;
    }
    panel.__mcEverywhere = true;
    // (der Aufgabenteil unten bleibt außen vor: die Today-Pane zeigt überall nur
    // Minikalender und Termine, wie in der Mail)
    for (const box of [panel, ...panel.querySelectorAll("[mode]")].filter(b => b.id != "todo-tab-panel")) {
      const modes = box.getAttribute("mode").split(",");
      const widths = (box.getAttribute("modewidths") || "").split(",");
      const pairs = modes.map((m, i) => [m, widths[i] || "200"]).filter(([m]) => !(box == panel && m == "calendar"));
      if (modes.includes("mail") && !modes.includes("special")) {
        pairs.push(["special", widths[modes.indexOf("mail")] || "200"]);
      }
      box.setAttribute("mode", pairs.map(([m]) => m).join(","));
      if (box.hasAttribute("modewidths")) {
        box.setAttribute("modewidths", pairs.map(([, v]) => v).join(","));
      }
    }
    const PREF = "extensions.mailcards.todayPaneEverywhere";
    if (this.firstInstall && !Services.prefs.getBoolPref(PREF, false)) {
      panel.setAttribute("collapsedinmodes", ","); // (Thunderbirds Zeichen für „nirgends zu“)
      Services.xulStore.persist(panel, "collapsedinmodes");
      Services.prefs.setBoolPref(PREF, true);
    }
    // Ansicht für den aktuellen Bereich neu bestimmen (Thunderbird tut das sonst
    // erst beim nächsten Bereichswechsel)
    try {
      panel.setVisible(panel.isVisible(w.gCurrentMode), false, true);
    } catch (e) {
      log("today pane modes error", e);
    }
  }

  // Heute-Leiste (Aufgaben/Termine rechts) gehört nicht in den Chat – wie in
  // Apples Nachrichten-App. Einmalig für den Chat-Bereich ausblenden; danach
  // gilt wieder, was man selbst einstellt.
  hideTodayPaneInChatOnce(w) {
    const PREF = "extensions.mailcards.todayPaneChatHidden";
    if (Services.prefs.getBoolPref(PREF, false)) {
      return;
    }
    // neu installiert: Today-Pane überall außer im Kalender (todayPaneEverywhere)
    if (this.firstInstall) {
      Services.prefs.setBoolPref(PREF, true);
      return;
    }
    const pane = w.document.getElementById("today-pane-panel");
    if (!pane) {
      return;
    }
    const modes = new Set((pane.getAttribute("collapsedinmodes") || "").split(",").filter(Boolean));
    modes.add("chat");
    pane.setAttribute("collapsedinmodes", [...modes].join(","));
    Services.xulStore.persist(pane, "collapsedinmodes");
    if (w.gCurrentMode == "chat") {
      w.TodayPane?.setVisible?.(false);
    }
    Services.prefs.setBoolPref(PREF, true);
  }

  // Termin-Details: an den Inhalt anpassen (mindestens 480 px breit, höchstens
  // so groß wie der Bildschirm) und iClouds Platzhalter-Erinnerung ausblenden
  // (Apple legt für Standard-Erinnerungen eine feste vom 1. April 1976 an)
  tidyEventDialog(dlg, tries = 0) {
    try {
      if (dlg.__mcTidy) {
        return;
      }
      const frame = dlg.document.getElementById("calendar-item-panel-iframe")?.contentDocument;
      if ((!frame || frame.readyState != "complete" || !frame.querySelector("label")) && tries < 20) {
        dlg.setTimeout(() => this.tidyEventDialog(dlg, tries + 1), 250);
        return;
      }
      const strip = text => text.replace(/\s*:\s*$/, "").replace(/:\s+$/, "");
      // Fenstertitel „Neuer Termin:“ → „Neuer Termin“ (auch nach Änderungen)
      const fixTitle = () => {
        const t = dlg.document.title;
        const fixed = t.replace(/:\s*$/, "");
        if (fixed != t) {
          dlg.document.title = fixed;
        }
      };
      fixTitle();
      const titleEl = dlg.document.querySelector("title");
      if (titleEl) {
        new dlg.MutationObserver(fixTitle).observe(titleEl, { childList: true, characterData: true, subtree: true });
      }
      const idoc = dlg.document.getElementById("calendar-item-panel-iframe")?.contentDocument;
      if (!idoc) {
        return;
      }
      // Beschriftungen und Reiter ohne Doppelpunkt (Fluent setzt sie neu → beobachten)
      const fixLabels = () => {
        for (const el of idoc.querySelectorAll("label, tab")) {
          const v = el.getAttribute("value");
          if (v && /:\s*$/.test(v)) {
            el.setAttribute("value", strip(v));
          }
          const l = el.getAttribute("label");
          if (l && /:\s*$/.test(l)) {
            el.setAttribute("label", strip(l));
          }
          if (!v && !l && el.childElementCount == 0 && /:\s*$/.test(el.textContent)) {
            el.textContent = strip(el.textContent);
          }
        }
      };
      dlg.__mcTidy = true;
      fixLabels();
      new dlg.MutationObserver(() => dlg.setTimeout(fixLabels, 0)).observe(idoc.documentElement, {
        subtree: true, attributes: true, attributeFilter: ["value", "label"], childList: true, characterData: true,
      });
    } catch (e) {
      log("event dialog tidy error", String(e).slice(0, 120));
    }
  }

  // Beschreibung im Termin-Fenster: Systemschrift 13 px als Benutzer-
  // Stylesheet im Editor-Dokument – kein <style> und kein Inline-Stil, die
  // landeten sonst im gespeicherten Text der Beschreibung. Ebenso im
  // Lesefenster (Termin → Öffnen), dort mit selector ".item-description"
  styleItemDescription(iw, tries = 0, selector = "#item-description") {
    try {
      if (iw.closed || !Services.prefs.getBoolPref("extensions.mailcards.bundledTheme", true)) {
        return;
      }
      const cw = iw.document.querySelector(selector)?.contentWindow;
      const doc = cw?.document;
      // gleich setzen (ab Thunderbird 160 hängt editorContent.css nicht mehr als
      // <link> im Dokument, auf das bisher gewartet wurde); noch 5 s nachsehen,
      // ob der Editor sein Dokument ersetzt hat, dann dort erneut
      if (doc?.body && !doc.__mcDescSheet) {
        cw.windowUtils.loadSheetUsingURIString(`resource://mailcards/event-description.css?v=${extensionVersion}`, cw.windowUtils.USER_SHEET);
        doc.__mcDescSheet = true;
      }
      if (tries < 20) {
        iw.setTimeout(() => this.styleItemDescription(iw, tries + 1, selector), 250);
      }
    } catch (e) {
      log("item description sheet error", String(e).slice(0, 120));
    }
  }

  // Kalendersymbol wie das App-Symbol von Apple Kalender: Monat klein in Rot,
  // darunter groß der Tag des Termins (bzw. der Aufgabe oder Erinnerung)
  alarmDateIcon(dlg, item) {
    try {
      const doc = dlg.document;
      const ev = item.item, alarm = item.alarm;
      if (!ev) {
        return;
      }
      let date = ev.startDate || ev.entryDate || ev.dueDate || alarm?.alarmDate;
      if (!date) {
        return;
      }
      date = date.getInTimezone(dlg.cal?.dtz?.defaultTimezone || date.timezone);
      const X = "http://www.w3.org/1999/xhtml";
      // wie die Mitteilung von Apple Kalender: kleine graue Kopfzeile mit dem
      // Namen des Kalenders über dem Titel, Pfeil rechts oben öffnet den
      // Termin im Kalender (statt des Links „Details…“)
      const block = item.querySelector(".alarm-calendar-event");
      if (!block) {
        return; // Eintrag noch nicht aufgebaut – beim nächsten Messen
      }
      let head = item.querySelector(".mc-alarm-cal");
      if (!head) {
        head = doc.createElementNS(X, "div");
        head.className = "mc-alarm-cal";
        block.prepend(head);
      }
      if (head && head.textContent != (ev.calendar?.name || "")) {
        head.textContent = ev.calendar?.name || "";
      }
      if (!item.querySelector(".mc-alarm-open")) {
        const open = doc.createElementNS(X, "button");
        open.type = "button";
        open.className = "mc-alarm-open";
        open.title = tr("Show in Calendar");
        open.setAttribute("aria-label", tr("Show in Calendar"));
        open.addEventListener("click", event => {
          event.stopPropagation();
          this.showAlarmItem(item.item);
        });
        block.append(open);
      }
      const key = `${date.year}-${date.month}-${date.day}`;
      let box = item.querySelector(".mc-alarm-date");
      if (box?.dataset.key == key) {
        return;
      }
      if (!box) {
        box = doc.createElementNS(X, "div");
        box.className = "mc-alarm-date";
        box.append(doc.createElementNS(X, "span"), doc.createElementNS(X, "span"));
        box.firstChild.className = "mc-alarm-month";
        box.lastChild.className = "mc-alarm-day";
        const img = item.querySelector(".alarm-calendar-image");
        (img?.parentNode || item).insertBefore(box, img || item.firstChild);
      }
      const js = new Date(date.year, date.month, date.day);
      const locale = Services.locale.appLocaleAsBCP47;
      box.dataset.key = key;
      box.firstChild.textContent = new Intl.DateTimeFormat(locale, { month: "short" }).format(js).replace(/\.$/, "");
      box.lastChild.textContent = String(date.day);
    } catch (e) {
      log("alarm icon error", String(e).slice(0, 120));
    }
  }

  // Pfeil der Erinnerung: Kalender-Bereich in der Monatsansicht, Termin
  // gewählt und seine Details offen
  async showAlarmItem(ev) {
    try {
      const w = Services.wm.getMostRecentWindow("mail:3pane");
      if (!w || !ev) {
        return;
      }
      w.focus();
      w.document.getElementById("tabmail")?.openTab("calendar");
      w.switchToView?.("month");
      const start = ev.startDate || ev.entryDate || ev.dueDate;
      if (start) {
        w.goToDate?.(start);
      }
      await new Promise(r => w.setTimeout(r, 300));
      try {
        w.currentView?.().setSelectedItems([ev]);
      } catch {}
      w.modifyEventWithDialog?.(ev, true);
    } catch (e) {
      log("alarm open error", String(e).slice(0, 120));
    }
  }

  fitAlarmDialog(dlg) {
    const ALARM_WIDTH = 346;
    try {
      const doc = dlg.document;
      const list = doc.getElementById("alarm-richlist");
      if (!list) {
        return;
      }
      const fit = () => {
        if (dlg.closed) {
          return;
        }
        const items = [...list.children].filter(i => i.getBoundingClientRect().height);
        // wie Apple Kalender: „Alle …“-Knöpfe nur bei mehreren Erinnerungen,
        // Datumssymbol (Monat/Tag) des Termins statt des Liniensymbols
        const multi = list.children.length > 1;
        if (doc.documentElement.hasAttribute("mc-alarm-multi") != multi) {
          doc.documentElement.toggleAttribute("mc-alarm-multi", multi);
          // die Knopfzeile erscheint bzw. geht – gleich danach nachmessen (per
          // Zeitgeber: verdeckte Fenster zeichnen kein nächstes Bild)
          dlg.setTimeout(fit, 50);
        }
        for (const item of list.children) {
          this.alarmDateIcon(dlg, item);
        }
        if (!items.length) {
          return;
        }
        // höchstens vier Einträge ohne Scrollen, darüber scrollt die Liste
        const shown = items.slice(0, 4);
        const cs = dlg.getComputedStyle(list);
        let content = (parseFloat(cs.paddingTop) || 0) + (parseFloat(cs.paddingBottom) || 0);
        for (const item of shown) {
          const ics = dlg.getComputedStyle(item);
          content += item.getBoundingClientRect().height + (parseFloat(ics.marginTop) || 0) + (parseFloat(ics.marginBottom) || 0);
        }
        // Fensterinhalt (Körper) statt Fensterhöhe: ohne Titelleiste ragt er sonst unten hinaus
        const rest = Math.max(doc.body.getBoundingClientRect().height, dlg.innerHeight) - list.getBoundingClientRect().height;
        const inner = Math.ceil(rest + content);
        // so breit wie die Mitteilung (346 px)
        const width = dlg.outerWidth - dlg.innerWidth + ALARM_WIDTH;
        if (Math.abs(inner - dlg.innerHeight) >= 2 || Math.abs(dlg.innerWidth - ALARM_WIDTH) >= 2) {
          dlg.resizeTo(width, dlg.outerHeight - dlg.innerHeight + inner);
        }
      };
      // ohne sichtbare Titelleiste wie eine Mitteilung (macOS zeichnet die
      // Fensterknöpfe weiter; die Fläche oben bleibt zum Verschieben)
      if (Services.appinfo.OS == "Darwin") {
        doc.documentElement.setAttribute("customtitlebar", "true");
        doc.documentElement.setAttribute("chromemargin", "0,-1,-1,-1");
        doc.documentElement.setAttribute("mc-alarm-card", "");
      }
      fit();
      // Einträge kommen hinzu oder werden erledigt
      new dlg.MutationObserver(() => dlg.setTimeout(fit, 50)).observe(list, { childList: true });
      // Texte eines Eintrags kommen erst nach dem Einfügen (Höhe wächst) – nachmessen
      const ro = new dlg.ResizeObserver(() => dlg.setTimeout(fit, 0));
      new dlg.MutationObserver(() => [...list.children].forEach(i => ro.observe(i))).observe(list, { childList: true });
      [...list.children].forEach(i => ro.observe(i));
    } catch (e) {
      log("alarm size error", String(e).slice(0, 120));
    }
  }

  // Termin-Details: Ort (keine Webadresse) als Link, der die Karten-App öffnet
  linkSummaryLocation(dlg) {
    try {
      const cell = dlg.document.querySelector(".item-location");
      if (cell && !cell.mcMapWatch) {
        // Thunderbird schreibt den Ort bei Änderungen des Termins neu
        cell.mcMapWatch = new dlg.MutationObserver(() => this.linkSummaryLocation(dlg));
        cell.mcMapWatch.observe(cell, { childList: true });
      }
      const text = cell?.textContent.trim();
      // Webadressen macht Thunderbird selbst zum Link
      if (!text || cell.querySelector("label, a, .mc-map-link") || /https?:\/\//.test(text)) {
        return;
      }
      const url = mapsUrl(text, Services.appinfo.OS);
      if (!url || !mapsAppExists(url)) {
        return;
      }
      // Tests ersetzen dlg.mcOpenMaps, um nichts wirklich zu öffnen
      dlg.mcOpenMaps ??= openMaps;
      const link = dlg.document.createElementNS("http://www.w3.org/1999/xhtml", "span");
      link.className = "text-link mc-map-link";
      link.setAttribute("role", "link");
      link.tabIndex = 0;
      link.textContent = cell.textContent;
      const go = () => dlg.mcOpenMaps(url);
      link.addEventListener("click", e => e.button == 0 && go());
      link.addEventListener("keydown", e => {
        if (e.key == "Enter" || e.key == " ") {
          e.preventDefault();
          go();
        }
      });
      cell.replaceChildren(link);
    } catch (e) {
      log("summary location error", String(e).slice(0, 120));
    }
  }

  fitSummaryDialog(dlg) {
    try {
      const doc = dlg.document;
      const cell = doc.querySelector(".reminder-details");
      if (cell) {
        const year = /\b1976\b/;
        for (const node of [...cell.childNodes]) {
          if (node.nodeType == 3 && year.test(node.textContent)) {
            if (node.nextSibling?.localName == "br") {
              node.nextSibling.remove();
            }
            node.remove();
          }
        }
        if (cell.lastChild?.localName == "br") {
          cell.lastChild.remove();
        }
      }
      // Titel steht groß im Inhalt – nicht zusätzlich in der Fensterleiste
      if (doc.querySelector(".item-title")?.textContent.trim()) {
        doc.title = " ";
      }
      // Größe anpassen, mittig auf dem Bildschirm wie bei Thunderbird
      const maxW = dlg.screen.availWidth - 40;
      const maxH = dlg.screen.availHeight - 40;
      // Mindestbreite per CSS, damit sizeToContent die Höhe gleich für die
      // endgültige Breite rechnet (vorher ein zweiter Durchgang nach 50 ms)
      // Bildschirmmitte wie Thunderbird selbst (das eigene Fenster hat hier teils noch keine Größe)
      const sc = dlg.screen;
      const cx = sc.availLeft + sc.availWidth / 2, cy = sc.availTop + sc.availHeight / 2;
      doc.documentElement.style.minWidth = `${Math.min(maxW, 480) - (dlg.outerWidth - dlg.innerWidth)}px`;
      dlg.sizeToContent();
      if (dlg.outerWidth > maxW || dlg.outerHeight > maxH) {
        dlg.resizeTo(Math.min(maxW, dlg.outerWidth), Math.min(maxH, dlg.outerHeight));
      }
      dlg.moveTo(Math.round(cx - dlg.outerWidth / 2), Math.round(cy - dlg.outerHeight / 2));
      // die Beschreibung lädt später, rollt aber in ihrem eigenen Feld – nicht
      // nachführen. Nur wenn das Fenster zu niedrig gemessen wurde (beim ersten
      // Öffnen sind Schrift oder umbrochene Zeilen manchmal noch nicht fertig,
      // „Edit“ stand dann fast am Rand), die Höhe nach dem Zeichnen nachziehen –
      // nie kleiner, Breite und Lage bleiben, sonst springt nichts
      let passes = 0;
      const grow = () => {
        try {
          if (dlg.closed) {
            return;
          }
          const w0 = dlg.outerWidth, h0 = dlg.outerHeight;
          // kein erneutes sizeToContent: unter macOS greift es teils erst nach
          // dem folgenden resizeTo und nähme die Zugabe wieder zurück – die
          // Höhe ergibt sich allein aus dem Abstand unter dem untersten Knopf
          // sizeToContent lässt unter dem untersten Knopf („Edit“) manchmal nur
          // wenige Pixel – so viel Luft wie rechts daneben
          let extra = 0;
          const buttons = [...doc.querySelectorAll("button")].filter(b => b.getBoundingClientRect().height > 0);
          const low = buttons.sort((a, b) => b.getBoundingClientRect().bottom - a.getBoundingClientRect().bottom)[0];
          if (low) {
            const r = low.getBoundingClientRect();
            const want = Math.max(16, Math.round(dlg.innerWidth - r.right));
            extra = Math.max(0, Math.round(want - (dlg.innerHeight - r.bottom)));
          }
          // unter Linux setzt sizeToContent die Größe erst später – dann nicht
          // mit der alten Größe überschreiben und kleine Rundungsreste (1 px)
          // nicht aufsummieren, sondern gleich noch einmal nachmessen
          const shrunk = dlg.outerHeight < h0 - 1;
          if (extra >= 3 || shrunk || dlg.outerWidth != w0) {
            const h = Math.min(maxH, Math.max(h0, dlg.outerHeight) + (extra >= 3 ? extra : 0));
            if (h != dlg.outerHeight || dlg.outerWidth != w0) {
              dlg.resizeTo(w0, h);
            }
          }
          if (extra >= 3 && ++passes < 5) {
            dlg.setTimeout(later, 200);
          }
        } catch {}
      };
      let queued = false;
      const later = () => {
        if (!queued) {
          queued = true;
          dlg.requestAnimationFrame(() => {
            queued = false;
            grow();
          });
        }
      };
      later();
      doc.fonts?.ready.then(later);
      dlg.setTimeout(later, 300);
      // Text, der in den ersten Sekunden noch nachkommt (Wiederholung, Ort …)
      const mo = new dlg.MutationObserver(later);
      mo.observe(doc.documentElement, { subtree: true, childList: true, characterData: true });
      dlg.setTimeout(() => mo.disconnect(), 3000);
      // Titel oder Zeilen, die erst später umbrechen (Schrift geladen, Breite
      // knapper als gemessen), werden höher, ohne dass sich Text ändert
      const ro = new dlg.ResizeObserver(later);
      for (const el of doc.querySelectorAll(".item-title, .repeat-details, .reminder-details, td")) {
        ro.observe(el);
      }
    } catch (e) {
      log("summary size error", String(e).slice(0, 120));
    }
  }

  // Feedback: neue Mail an die Feedback-Adresse, mit Versionen zum Nachvollziehen
  async sendFeedback() {
    let version = extensionVersion;
    try {
      const { AddonManager } = ChromeUtils.importESModule("resource://gre/modules/AddonManager.sys.mjs");
      version = (await AddonManager.getAddonByID("mail-cards@sebastian.local"))?.version || version;
    } catch {}
    const osVersion = Services.sysinfo.getProperty("version");
    const os = Services.appinfo.OS == "Darwin" ? `macOS (Darwin ${osVersion})`
      : Services.appinfo.OS == "WINNT" ? `Windows (${osVersion})` : `${Services.appinfo.OS} (${osVersion})`;
    const subject = `halo.spaces ${version} – Feedback`;
    const body = `${tr("Hi,")}\n\n\n\n—\n` +
      `halo.spaces ${version} · Thunderbird ${Services.appinfo.version} · ${os}`;
    const params = Cc["@mozilla.org/messengercompose/composeparams;1"].createInstance(Ci.nsIMsgComposeParams);
    const fields = Cc["@mozilla.org/messengercompose/composefields;1"].createInstance(Ci.nsIMsgCompFields);
    fields.to = FEEDBACK_ADDRESS;
    fields.subject = subject;
    fields.body = body;
    params.type = Ci.nsIMsgCompType.New;
    params.format = Ci.nsIMsgCompFormat.PlainText;
    params.composeFields = fields;
    MailServices.compose.OpenComposeWindowWithParams(null, params);
  }

  // Beim Start nach einem Update suchen und es gleich installieren – höchstens
  // alle 6 Stunden, und nur wenn automatische Updates erlaubt sind (eigener
  // Schalter, Thunderbirds Einstellung und die des Add-ons im Add-ons-Manager)
  async autoUpdate() {
    try {
      const own = Services.prefs.getBoolPref(AUTO_UPDATE_PREF, true);
      const now = Math.floor(Date.now() / 1000);
      const last = Services.prefs.getIntPref(AUTO_UPDATE_LAST_PREF, 0);
      if (last && now - last < 6 * 3600 && now >= last) {
        return;
      }
      const { AddonManager } = ChromeUtils.importESModule("resource://gre/modules/AddonManager.sys.mjs");
      const addon = await AddonManager.getAddonByID("mail-cards@sebastian.local");
      if (!addon || !AddonManager.updateEnabled) {
        return;
      }
      const mode = addon.applyBackgroundUpdates;
      const allowed = own && (mode == AddonManager.AUTOUPDATE_ENABLE ||
        (mode == AddonManager.AUTOUPDATE_DEFAULT && AddonManager.autoUpdateDefault));
      Services.prefs.setIntPref(AUTO_UPDATE_LAST_PREF, now);
      const result = await this.findUpdate();
      if (!result.available) {
        return;
      }
      if (!allowed) {
        // automatische Updates aus: nur Hinweis, installiert wird auf Wunsch
        UpdateNote.set(result.version, false);
        return;
      }
      // lädt und hält es bis zum nächsten Start zurück (background.js) – dann
      // kommt der Hinweis über updateReady
      log("auto update", extensionVersion, "→", result.version);
      await result.install();
    } catch (e) {
      log("auto update error", e);
    }
  }

  // Update auf Wunsch: dieselbe Prüfung wie Thunderbirds tägliche, nur sofort.
  // Ergebnis: { available, version, install(now) } | { error } | {} (aktuell)
  // install(): wie die automatischen Updates – background.js hält es bis zum
  // nächsten Start zurück. install(true) (Knopf im Info-Fenster): die
  // zurückgestellte Installation gleich fortsetzen; erfüllt sich, sobald sie
  // eingespielt ist (sonst wartete der Knopf ewig auf „Installing …“)
  async findUpdate() {
    const { AddonManager } = ChromeUtils.importESModule("resource://gre/modules/AddonManager.sys.mjs");
    const addon = await AddonManager.getAddonByID("mail-cards@sebastian.local");
    if (!addon) {
      return { error: true };
    }
    return new Promise(resolve => {
      let found = null;
      addon.findUpdates({
        onUpdateAvailable: (_addon, install) => {
          found = {
            available: true,
            version: install.version,
            install: (now = false) => {
              if (!now) {
                return install.install();
              }
              return new Promise((resolve, reject) => {
                install.addListener({
                  onInstallPostponed: () => install.continuePostponedInstall(),
                  onInstallEnded: () => resolve(),
                  onInstallFailed: () => reject(new Error("install failed")),
                  onDownloadFailed: () => reject(new Error("download failed")),
                  onInstallCancelled: () => reject(new Error("install cancelled")),
                });
                install.install().catch(() => {});
              });
            },
          };
        },
        onUpdateFinished: (_addon, error) => resolve(found || (error ? { error: true } : {})),
      }, AddonManager.UPDATE_WHEN_USER_REQUESTED);
    });
  }

  // Info-Fenster „Halo Spaces“ (Help-Menü): Version, Updates, Feedback, Spenden
  async openHaloWindow(w, { platformNote = false, welcome = false, themeSwitched = false } = {}) {
    const open = [...Services.wm.getEnumerator(null)].find(win => win.location?.href.startsWith("resource://mailcards/about/halo.html"));
    if (open) {
      open.focus();
      return;
    }
    let version = extensionVersion;
    try {
      const { AddonManager } = ChromeUtils.importESModule("resource://gre/modules/AddonManager.sys.mjs");
      version = (await AddonManager.getAddonByID("mail-cards@sebastian.local"))?.version || version;
    } catch {}
    const api = {
      german: Services.locale.appLocaleAsBCP47.startsWith("de"),
      version,
      checkUpdate: () => this.findUpdate(),
      mac: Services.appinfo.OS == "Darwin",
      platformNote,
      welcome,
      themeSwitched,
      openSettings: () => openHaloSettings(w),
      sendFeedback: () => this.sendFeedback(),
      // Begrüßung: Wetter in der Today-Pane gleich einrichten (dieselben Prefs
      // wie die Einstellungsseite); Ergebnis als Zeile: Ort/Temperatur oder Hinweis
      setWeather: async (on, place = "") => {
        Services.prefs.setStringPref(WEATHER_PLACE_PREF, place);
        Services.prefs.setBoolPref(WEATHER_PREF, on);
        if (!on) {
          return { ok: true, text: "" };
        }
        await Weather.refresh(true);
        const st = Weather.state(), ws = Weather.status();
        return { ok: ws.tone == "ok", status: st.status, text: ws.text };
      },
      // Begrüßung: Ortsvorschläge beim Tippen und gewählter Ort (mit Koordinaten)
      searchPlaces: text => Weather.search(w, text),
      choosePlace: async place => {
        await Weather.choose(place);
        Services.prefs.setBoolPref(WEATHER_PREF, true);
        await Weather.refresh(true);
        const st = Weather.state(), ws = Weather.status();
        return { ok: ws.tone == "ok", status: st.status, text: ws.text };
      },
      // Begrüßung: fünfter Bereich (dieselben Prefs wie die Einstellungsseite)
      fifthAddons: () => FifthSpace.addonSpaces(Services.wm.getMostRecentWindow("mail:3pane")),
      setFifthSpace: (mode, extra = "") => {
        if (mode == "web") {
          const url = FifthSpace.normalizeURL(extra);
          if (!url) {
            return false;
          }
          Services.prefs.setStringPref(FIFTH_URL_PREF, url);
        } else if (mode == "addon") {
          Services.prefs.setStringPref(FIFTH_ADDON_PREF, extra);
        }
        if (mode == "chat") {
          Services.prefs.clearUserPref(FIFTH_PREF);
        } else {
          Services.prefs.setStringPref(FIFTH_PREF, mode);
        }
        return true;
      },
      // Systemeinstellung der Ortung (macOS, Windows; Linux: kein einheitlicher Ort)
      locationSettingsURL: LOCATION_SETTINGS_URL,
      openURL: url => Cc["@mozilla.org/uriloader/external-protocol-service;1"].getService(Ci.nsIExternalProtocolService)
        .loadURI(Services.io.newURI(url), Services.scriptSecurityManager.getSystemPrincipal()),
      // im Standardbrowser öffnen; gilt als erledigte Erinnerung
      donate: () => Thanks.open(w),
    };
    const hw = w.openDialog("resource://mailcards/about/halo.html", "halo-spaces",
      `chrome,dialog=yes,centerscreen,resizable=no,width=360,height=${349 + (platformNote ? 64 : 0)}`);
    // schließt mit dem Hauptfenster – sonst lief Thunderbird unter Windows und
    // Linux nach dem Schließen des Hauptfensters weiter, solange dieses
    // kleine Fenster (oft dahinter) offen war
    const main = w.document?.documentElement.getAttribute("windowtype") == "mail:3pane" ? w : Services.wm.getMostRecentWindow("mail:3pane");
    main?.addEventListener("unload", () => {
      if (!hw.closed) {
        hw.close();
      }
    }, { once: true });
    // erst lädt das Fenster about:blank, dann unsere Seite – darauf warten
    let tries = 0;
    const wire = () => {
      if (hw.closed || tries++ > 100) {
        return;
      }
      const doc = hw.document;
      if (doc?.documentURI?.startsWith("resource://mailcards/about/halo.html") && doc.readyState == "complete" && doc.getElementById("version")) {
        this.wireHaloWindow(hw, api);
      } else {
        w.setTimeout(wire, 30);
      }
    };
    w.setTimeout(wire, 30);
  }

  // Begrüßung, so wenig auf einmal wie möglich (KISS): je Frage erst Ja/Nein;
  // erst nach dem Klick gleiten die Einzelheiten ein, das Fenster wächst sanft
  // mit. Gemeinsamer Aufbau für Wetter und Chat
  welcomeStep(hw, { id, question, yes, no, chosen }) {
    const doc = hw.document;
    const el = (tag, cls, text) => {
      const e = doc.createElement(tag);
      if (cls) e.className = cls;
      if (text != null) e.textContent = text;
      return e;
    };
    const box = el("section", "weather");
    box.id = id;
    const head = el("div", "ask");
    head.append(el("p", "q", question));
    const choices = el("div", "choices yesno");
    const yesBtn = el("button", "capsule", tr("Yes"));
    const noBtn = el("button", "capsule", tr("No"));
    choices.append(yesBtn, noBtn);
    head.append(choices);
    // aufklappbarer Teil (Höhe über das Raster, Fenster folgt Bild für Bild)
    const more = el("div", "more");
    const inner = el("div", "more-inner");
    more.append(inner);
    box.append(head, more);
    const fit = () => {
      const body = doc.body, style = hw.getComputedStyle(body);
      const need = Math.ceil([...body.children].filter(e => !e.hidden).reduce((h, e) => Math.max(h, e.getBoundingClientRect().bottom), 0)
        + parseFloat(style.paddingBottom));
      if (Math.abs(need - hw.innerHeight) >= 1) {
        hw.resizeBy(0, need - hw.innerHeight);
      }
    };
    const follow = () => {
      const end = Date.now() + 420;
      const step = () => {
        fit();
        if (Date.now() < end && !hw.closed) {
          hw.requestAnimationFrame(step);
        }
      };
      hw.requestAnimationFrame(step);
    };
    const pick = (group, button) => {
      for (const b of group.children) {
        b.classList.toggle("chosen", b == button);
      }
    };
    const open = show => {
      more.classList.toggle("open", show);
      follow();
    };
    if (chosen) {
      pick(choices, chosen == "yes" ? yesBtn : noBtn);
    }
    yesBtn.addEventListener("click", () => {
      pick(choices, yesBtn);
      yes?.();
    });
    noBtn.addEventListener("click", () => {
      pick(choices, noBtn);
      no?.();
    });
    return { box, inner, el, open, pick, follow };
  }

  // Wetter: Ja → „Mein Standort“ oder „Stadt …“ (Vorschläge beim Tippen); Nein → aus
  wireWelcomeWeather(hw, api) {
    const doc = hw.document;
    const note = doc.getElementById("platform-note");
    if (!note || doc.getElementById("weather")) {
      return;
    }
    let step = null;
    step = this.welcomeStep(hw, {
      id: "weather",
      question: tr("Weather in the Today Pane?"),
      yes: () => step.open(true),
      no: async () => {
        step.open(false);
        await api.setWeather(false);
      },
    });
    const { inner, el, pick, follow } = step;
    const hint = el("p", "small", tr("The symbol next to the title then shows the weather. Asks open-meteo.com about every 30 minutes."));
    const choices = el("div", "choices");
    const here = el("button", "capsule", tr("My Location"));
    const city = el("button", "capsule", tr("City …"));
    choices.append(here, city);
    const cityRow = el("div", "city");
    cityRow.hidden = true;
    const input = el("input");
    input.type = "text";
    input.placeholder = tr("e.g. Vienna");
    input.spellcheck = false;
    cityRow.append(input);
    const list = el("div", "suggest");
    list.hidden = true;
    const status = el("p", "small status");
    const settingsBtn = el("button", "capsule", tr("Open System Settings"));
    settingsBtn.hidden = true;
    inner.append(hint, choices, cityRow, list, status, settingsBtn);
    note.after(step.box);
    const result = r => {
      status.textContent = r.text;
      status.classList.toggle("bad", !r.ok);
      settingsBtn.hidden = !(r.status == "denied" && api.locationSettingsURL);
      if (!r.ok) {
        cityRow.hidden = false;
        pick(choices, city);
      }
      follow();
    };
    here.addEventListener("click", async () => {
      pick(choices, here);
      cityRow.hidden = true;
      list.hidden = true;
      status.textContent = tr("Locating …");
      follow();
      result(await api.setWeather(true, ""));
    });
    city.addEventListener("click", () => {
      pick(choices, city);
      cityRow.hidden = false;
      input.focus();
      follow();
    });
    // Vorschläge beim Tippen; ein Klick übernimmt den Ort samt Koordinaten
    let timer = null, seq = 0;
    input.addEventListener("input", () => {
      hw.clearTimeout(timer);
      const text = input.value.trim();
      if (text.length < 2) {
        list.hidden = true;
        follow();
        return;
      }
      timer = hw.setTimeout(async () => {
        const mine = ++seq;
        const hits = await api.searchPlaces(text);
        if (mine != seq || hw.closed) {
          return;
        }
        list.replaceChildren(...hits.map(p => {
          const b = el("button", "suggestion", p.label);
          b.addEventListener("click", async () => {
            input.value = p.label;
            list.hidden = true;
            status.textContent = tr("Searching …");
            follow();
            result(await api.choosePlace(p));
          });
          return b;
        }));
        list.hidden = !hits.length;
        follow();
      }, 250);
    });
    input.addEventListener("keydown", async e => {
      if (e.key == "Enter" && input.value.trim()) {
        list.hidden = true;
        status.textContent = tr("Searching …");
        follow();
        result(await api.setWeather(true, input.value.trim()));
      }
    });
    settingsBtn.addEventListener("click", () => api.openURL(api.locationSettingsURL));
  }

  // Chat: Ja (vorgewählt, wie bisher) → Chat bleibt; Nein → stattdessen Webseite,
  // Erweiterung (nur wenn eine einen eigenen Bereich mitbringt) oder nichts
  wireWelcomeFifth(hw, api) {
    const doc = hw.document;
    const after = doc.getElementById("weather") || doc.getElementById("platform-note");
    if (!after || doc.getElementById("fifth")) {
      return;
    }
    const addons = api.fifthAddons();
    let step = null, status = null;
    step = this.welcomeStep(hw, {
      id: "fifth",
      question: tr("Do you use Chat?"),
      chosen: "yes",
      yes: () => {
        api.setFifthSpace("chat");
        step.open(false);
      },
      no: () => {
        api.setFifthSpace("none");
        step.pick(choices, nothing);
        webRow.hidden = true;
        status.textContent = "";
        step.open(true);
      },
    });
    const { inner, el, pick, follow } = step;
    const hint = el("p", "small", tr("Instead in its place:"));
    const choices = el("div", "choices");
    const web = el("button", "capsule", tr("Website …"));
    const addon = el("button", "capsule", tr("Add-on"));
    const nothing = el("button", "capsule", tr("Nothing"));
    if (!addons.length) {
      addon.disabled = true;
      addon.title = tr("No add-on with its own space installed");
    }
    choices.append(web, addon, nothing);
    const webRow = el("div", "city");
    webRow.hidden = true;
    const input = el("input");
    input.type = "url";
    input.placeholder = tr("e.g. calendar.example.com");
    input.spellcheck = false;
    const ok = el("button", "capsule", tr("OK"));
    webRow.append(input, ok);
    status = el("p", "small status");
    inner.append(hint, choices, webRow, status);
    after.after(step.box);
    nothing.addEventListener("click", () => {
      pick(choices, nothing);
      webRow.hidden = true;
      status.textContent = "";
      api.setFifthSpace("none");
      follow();
    });
    addon.addEventListener("click", () => {
      pick(choices, addon);
      webRow.hidden = true;
      // die erste Erweiterung mit eigenem Bereich; weitere zur Wahl in den Einstellungen
      api.setFifthSpace("addon", addons[0].name);
      status.textContent = addons[0].title;
      status.classList.remove("bad");
      follow();
    });
    web.addEventListener("click", () => {
      pick(choices, web);
      webRow.hidden = false;
      status.textContent = "";
      input.focus();
      follow();
    });
    const useWeb = () => {
      const fine = api.setFifthSpace("web", input.value);
      status.textContent = fine ? tr("Saved") : tr("Not a valid web address");
      status.classList.toggle("bad", !fine);
      follow();
    };
    ok.addEventListener("click", useWeb);
    input.addEventListener("keydown", e => e.key == "Enter" && useWeb());
  }

  // Texte setzen und Knöpfe verbinden (aus der Erweiterung heraus)
  wireHaloWindow(hw, api) {
    const doc = hw.document;
    const $ = id => doc.getElementById(id);
    doc.documentElement.lang = uiLanguage();
    for (const el of doc.querySelectorAll("[data-l10n-en]")) {
      el.textContent = tr(el.dataset.l10nEn);
    }
    $("version").textContent = `Version ${api.version}`;
    // einmalig nach der Erstinstallation: Begrüßung; Windows/Linux: Hinweis zur Plattform
    const note = $("platform-note");
    const lines = [];
    if (api.welcome) {
      lines.push(tr("Thunderbird now looks calm and tidy."));
      if (api.themeSwitched) {
        lines.push(tr("Light and dark now follow your system."));
      }
    }
    if (api.platformNote) {
      lines.push(tr("halo.spaces is made for macOS. On Windows and Linux it is still being tested. If something looks odd, we'd love a quick note!"));
    }
    if (note && lines.length) {
      note.replaceChildren(...lines.map(text => {
        const p = doc.createElement("span");
        p.className = "line";
        p.textContent = text;
        return p;
      }));
      note.hidden = false;
    }
    if (api.welcome) {
      this.wireWelcomeWeather(hw, api);
      this.wireWelcomeFifth(hw, api);
    }
    if (api.welcome) {
      // Begrüßung: nur „Einstellungen öffnen“ (hervorgehoben) und „Weiter“
      doc.documentElement.classList.add("welcome");
      doc.querySelector("h1").textContent = tr("Welcome to halo.spaces");
      $("settings").querySelector(".label").textContent = tr("Open Settings");
      $("close").hidden = false;
      $("close").addEventListener("click", () => hw.close());
    }

    const button = $("update");
    const label = button.querySelector(".label");
    const status = $("update-status");
    let install = null;
    button.addEventListener("click", async () => {
      if (install) {
        button.disabled = true;
        label.textContent = tr("Installing …");
        try {
          await install(true);
          label.textContent = tr("Installed. Active in a moment.");
          // die alte Version wird gleich entladen – ihr Fenster mit ihr
          hw.setTimeout(() => hw.close(), 1500);
        } catch {
          label.textContent = tr("Installation failed");
          button.disabled = false;
        }
        button.classList.remove("available");
        install = null;
        return;
      }
      button.disabled = true;
      label.textContent = tr("Checking for updates …");
      status.textContent = "";
      const result = await api.checkUpdate();
      button.disabled = false;
      if (result.available) {
        install = result.install;
        button.classList.add("available");
        label.textContent = tr("Install version {v}", { v: result.version });
      } else if (result.error) {
        label.textContent = tr("No connection. Try again.");
      } else {
        label.textContent = tr("halo.spaces is up to date");
        status.textContent = "✓";
      }
    });
    const feedback = event => {
      event.preventDefault();
      api.sendFeedback();
      hw.close();
    };
    $("settings")?.addEventListener("click", () => {
      api.openSettings();
      hw.close();
    });
    $("feedback").addEventListener("click", feedback);
    // Erinnerung fällig: Ring um „Danke sagen“, bis geklickt (auch wenn sie
    // währenddessen anderswo erledigt wird)
    const donate = $("donate");
    const ring = () => !hw.closed && donate.classList.toggle("due", Thanks.due());
    ring();
    Thanks.listeners.add(ring);
    hw.addEventListener("unload", () => Thanks.listeners.delete(ring), { once: true });
    donate.addEventListener("click", () => api.donate());
    // Logo mit Versionsnummer laden (sonst zeigt Thunderbird nach einem
    // Update noch das zwischengespeicherte alte)
    const icon = doc.querySelector(".icon");
    if (icon) {
      icon.src = `icon.svg?v=${api.version}`;
    }
    // Windows/Linux: die feste Höhe passt zu den Schriftmaßen von macOS –
    // mit anderen Systemschriften wäre das Fenster sonst scrollbar.
    // Begrüßung: Höhe genau nach dem Inhalt (Text je nach Sprache)
    if (!api.mac || api.welcome) {
      const body = doc.body, style = hw.getComputedStyle(body);
      const need = api.welcome
        ? Math.ceil([...body.children].filter(e => !e.hidden).reduce((h, e) => Math.max(h, e.getBoundingClientRect().bottom), 0) + parseFloat(style.paddingBottom))
        : doc.documentElement.scrollHeight;
      const extra = need - hw.innerHeight;
      // Windows mit 125/150 % Zoom: das Fenster landet auf ganzen Gerätepixeln
      // und kann um Bruchteile zu niedrig sein – dann wäre es scrollbar.
      // Erst nach der eigentlichen Größenänderung prüfen, sonst überschreibt
      // das Nachbessern sie mit der alten Höhe
      const settle = () => {
        const short = doc.documentElement.scrollHeight - hw.innerHeight;
        if (short > 0 && short <= 3) {
          hw.resizeBy(0, short);
        }
      };
      if (extra != 0 && (extra > 0 || api.welcome)) {
        hw.addEventListener("resize", () => hw.setTimeout(settle, 0), { once: true });
        hw.resizeBy(0, extra);
      } else {
        settle();
      }
    }
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

  // Leseansicht: ganze Konversation als Karten (ConversationCards) über
  // Thunderbirds Anzeige von Einzelmail bzw. Faden-Zusammenfassung
  hookConversation(win) {
    const self = this;
    const pane = win.document.getElementById("messagePane");
    if (!pane || pane.__mcConv === HOOK_OWNER || typeof pane.displayMessage != "function") {
      return;
    }
    // (Reste einer älteren Fassung entfernen)
    win.document.getElementById("mcConversation")?.remove();
    pane.__mcConversation?.hide();
    delete pane.displayMessage;
    delete pane.displayMessages;
    pane.__mcConv = HOOK_OWNER;
    const conv = new ConversationCards(win, pane);
    pane.__mcConversation = conv;
    // zugeklappter Faden: Thunderbird graut Antworten und Weiterleiten aus
    // (mehrere Mails gewählt) – wie Apple Mail wirken sie auf die neueste
    // bzw. gewählte Mail der Konversation
    const cc = win.commandController;
    const CONV_CMDS = new Set(["cmd_reply", "cmd_replyall", "cmd_replylist", "cmd_forward", "cmd_forwardInline", "cmd_forwardAttachment"]);
    if (cc && !cc.__mcConv) {
      const isOn = cc.isCommandEnabled, doIt = cc.doCommand;
      cc.__mcConv = true;
      cc.isCommandEnabled = function (command, ...rest) {
        if (CONV_CMDS.has(command) && conv.threadTarget()) {
          return true;
        }
        return isOn.call(this, command, ...rest);
      };
      cc.doCommand = function (command, ...rest) {
        const card = CONV_CMDS.has(command) && conv.threadTarget();
        if (card) {
          return self.cardAction({}, card, command);
        }
        return doIt.call(this, command, ...rest);
      };
      this.addWinRestorer(win, () => {
        cc.isCommandEnabled = isOn;
        cc.doCommand = doIt;
        delete cc.__mcConv;
      });
    }
    const one = pane.displayMessage, many = pane.displayMessages;
    pane.displayMessage = function (uri) {
      conv.hide();
      if (uri && conv.enabled()) {
        pane.classList.add("mc-conv-pending");
      }
      const result = one.call(this, uri);
      if (uri) {
        conv.show(conv.hdrFromURI(uri));
      }
      return result;
    };
    // gewählte Zeile ist ein Gruppenkopf („Heute“, „Gestern“ … bei „In Abschnitten“)
    const groupHeadSelected = () => {
      try {
        const index = win.threadTree?.selectedIndex ?? -1;
        return index >= 0 && !!(win.gDBView.getFlagsAt(index) & 0x20000000);
      } catch {
        return false;
      }
    };
    pane.displayMessages = function (messages = []) {
      conv.hide();
      if (messages.length && win.gDBView?.selection?.count == 1 && conv.enabled() && !groupHeadSelected()) {
        pane.classList.add("mc-conv-pending");
      }
      // mehrere Zeilen markiert: Stapel statt Zusammenfassung (ohne Aufblitzen)
      const stack = messages.length >= 2 && win.gDBView?.selection?.count >= 2;
      if (stack) {
        pane.classList.add("mc-conv-pending");
      }
      const result = many.call(this, messages);
      if (stack) {
        try {
          // Blätter je markierter Zeile (eine zugeklappte Konversation zählt einmal)
          conv.renderStack(messages[0], win.gDBView.selection.count);
        } catch (e) {
          log("stack error", String(e).slice(0, 160));
        }
        conv.reveal();
      }
      // ein zugeklappter Faden (eine Zeile ausgewählt): Konversation statt Zusammenfassung.
      // Nicht beim Gruppenkopf („In Abschnitten“): er ist auch eine Zeile mit
      // mehreren Mails, zeigt aber Thunderbirds Übersicht der Gruppe – sonst
      // erschien die Konversation der neuesten Mail, wenn sie in einem Faden steckt
      if (messages.length && win.gDBView?.selection?.count == 1 && !groupHeadSelected()) {
        const newest = [...messages].sort((a, b) => b.date - a.date)[0];
        conv.show(newest, { thread: true });
      }
      return result;
    };
    this.addWinRestorer(win, () => {
      conv.hide();
      delete pane.displayMessage;
      delete pane.displayMessages;
      delete pane.__mcConv;
      delete pane.__mcConversation;
    });
  }

  // Drei-Punkte-Menü über der Mailliste: Ansicht und Layout als eine Auswahl
  // (Kartenansicht, Tabelle klassisch) statt Tabelle/Karten;
  // „Hide Message List Header“ ohne Wirkung (eigener Listenkopf) – ausgeblendet;
  // darunter „Show Contact Photo“ zum Abhaken (nur Kartenansicht)
  hookViewChoice(doc) {
    const popup = doc.getElementById("threadPaneDisplayContext");
    if (!popup || ownedElement(doc, "mcViewChoiceCards")) {
      return;
    }
    const restorers = { push: fn => this.addWinRestorer(doc.defaultView, fn) };
    const tb = [doc.getElementById("threadPaneTableView"), doc.getElementById("threadPaneCardsView")].filter(Boolean);
    const anchor = tb[0];
    if (!anchor) {
      return;
    }
    const items = VIEW_CHOICES.map(([key, label]) => {
      const item = doc.createXULElement("menuitem");
      item.id = "mcViewChoice" + key.charAt(0).toUpperCase() + key.slice(1);
      item.__mcOwner = HOOK_OWNER;
      item.setAttribute("type", "radio");
      item.setAttribute("name", "mcviewchoice");
      item.setAttribute("label", tr(label));
      item.addEventListener("command", () => setViewChoice(key));
      anchor.before(item);
      return [key, item];
    });
    for (const el of tb) {
      el.hidden = true;
    }
    const photoSep = doc.createXULElement("menuseparator");
    photoSep.id = "mcContactPhotoSeparator";
    const photo = doc.createXULElement("menuitem");
    photo.id = "mcContactPhoto";
    photo.setAttribute("type", "checkbox");
    photo.setAttribute("label", tr("Show Contact Photo"));
    photo.addEventListener("command", () => {
      if (Services.prefs.getBoolPref(CONTACT_PHOTOS_PREF, true)) {
        Services.prefs.setBoolPref(CONTACT_PHOTOS_PREF, false);
      } else {
        Services.prefs.clearUserPref(CONTACT_PHOTOS_PREF); // Standard: nichts im Profil speichern
      }
    });
    items.at(-1)[1].after(photoSep, photo);
    const hideItem = popup.querySelector('menuitem[data-l10n-id="thread-pane-header-context-hide"]');
    const sep = doc.getElementById("separatorAfterSortOptions");
    for (const el of [hideItem, sep]) {
      if (el) {
        el.hidden = true;
      }
    }
    const onShowing = event => {
      if (event.target != popup) {
        return;
      }
      const current = viewChoice();
      for (const [key, item] of items) {
        item.toggleAttribute("checked", key == current);
      }
      photo.toggleAttribute("checked", Services.prefs.getBoolPref(CONTACT_PHOTOS_PREF, true));
      photo.disabled = current != "cards";
    };
    popup.addEventListener("popupshowing", onShowing);
    restorers.push(() => {
      popup.removeEventListener("popupshowing", onShowing);
      items.forEach(([, item]) => item.remove());
      photoSep.remove();
      photo.remove();
      for (const el of [...tb, hideItem, sep]) {
        if (el) {
          el.hidden = false;
        }
      }
    });
  }

  // „Sort by“ im Drei-Punkte-Menü wie Apple Mail: nur die üblichen
  // Sortierungen in Apples Reihenfolge (Thunderbirds übrige ausgeblendet, eine
  // gerade aktive bleibt sichtbar), die Richtung je Sortierung benannt statt
  // Ascending/Descending, Gruppierung mit Apples Begriffen. Befehle bleiben
  // Thunderbirds (cmd_sort mit dem Wert des Eintrags)
  hookSortMenu(doc) {
    const popup = doc.getElementById("menu_threadPaneSortPopup");
    if (!popup || popup.__mcSortMenu) {
      return;
    }
    popup.__mcSortMenu = true;
    const original = [...popup.children];
    const byKey = key => doc.getElementById(`threadPaneSortBy${key}Menuitem`);
    const shown = SORT_CHOICES.map(([key]) => byKey(key)).filter(Boolean);
    const hidden = [...popup.querySelectorAll('menuitem[name="sortby"]')].filter(el => !shown.includes(el));
    const asc = doc.getElementById("threadPaneSortAscending");
    const desc = doc.getElementById("threadPaneSortDescending");
    const grouping = [
      [doc.getElementById("threadPaneSortThreaded"), "Organize by Conversation"],
      [doc.getElementById("threadPaneSortUnthreaded"), "Individual Messages"],
      [doc.getElementById("threadPaneGroupBySort"), "In Sections"],
    ].filter(([el]) => el);
    const labels = new Map([asc, desc, ...grouping.map(([el]) => el)].filter(Boolean).map(el => [el, el.getAttribute("label")]));
    // Apples Reihenfolge, ausgeblendete dahinter (nur sichtbar, wenn aktiv)
    popup.prepend(...shown, ...hidden);
    for (const [el, label] of grouping) {
      el.setAttribute("label", tr(label));
    }
    const onShowing = event => {
      if (event.target != popup) {
        return;
      }
      // Thunderbirds eigener Handler hat die Haken schon gesetzt
      for (const el of hidden) {
        el.hidden = !el.hasAttribute("checked");
      }
      const current = popup.querySelector('menuitem[name="sortby"][checked]');
      const names = SORT_CHOICES.find(([key]) => byKey(key) == current)?.[1];
      if (asc && desc) {
        asc.setAttribute("label", names ? tr(names[0]) : labels.get(asc));
        desc.setAttribute("label", names ? tr(names[1]) : labels.get(desc));
      }
    };
    popup.addEventListener("popupshowing", onShowing);
    this.addWinRestorer(doc.defaultView, () => {
      popup.removeEventListener("popupshowing", onShowing);
      popup.append(...original);
      for (const el of hidden) {
        el.hidden = false;
      }
      for (const [el, label] of labels) {
        el.setAttribute("label", label);
      }
      delete popup.__mcSortMenu;
    });
  }

  // Filter wie in Apple Mail: nur ungelesene Mails bzw. wieder alle – über
  // Thunderbirds Schnellfilter „Ungelesen“, aber ohne dessen Leiste. Der
  // Filter bleibt beim Ordnerwechsel aktiv (wie „Filter beibehalten“), bis
  // man erneut klickt; nach einem Neustart ist er aus
  unreadFilterOn(a3) {
    const values = a3?.quickFilterBar?._filterer?.filterValues;
    return !!values && FILTER_CHOICES.some(([key]) => values[key]);
  }

  // gewählte Bedingungen des Filters (FILTER_PREF), mindestens „Ungelesen“
  filterCriteria() {
    const keys = FILTER_CHOICES.map(([key]) => key);
    const chosen = Services.prefs.getStringPref(FILTER_PREF, "unread").split(",").filter(k => keys.includes(k));
    return chosen.length ? chosen : ["unread"];
  }

  // Thunderbirds Symbolleisten-Knopf „Schnellfilter“ schaltet den
  // Ungelesen-Filter um – er soll ihn auch gedrückt zeigen. Thunderbird leitet
  // das aus der nie sichtbaren Leiste ab und setzt es bei Ordnerwechsel,
  // Auswahl und Tabwechsel selbst, daher jeweils kurz danach noch einmal
  syncQuickFilterToggle(w) {
    const d = w?.document;
    const set = () => {
      const ab = d?.getElementById("tabmail")?.currentAbout3Pane;
      const on = String(!!ab?.document && this.unreadFilterOn(ab));
      for (const b of d?.querySelectorAll('#unifiedToolbarContent button[is="quick-filter-bar-toggle"]') || []) {
        if (b.getAttribute("aria-pressed") != on) {
          b.setAttribute("aria-pressed", on);
        }
      }
    };
    try {
      set();
      w.setTimeout(set, 0);
    } catch {}
  }

  // Senden im Hintergrund: Thunderbird legt die Mail in den Postausgang und
  // sendet sie selbst – aber nur, wenn es beim Start schon einen Postausgang
  // gab (sonst blieb sie liegen). Darum nach jedem Senden kurz nachsehen und
  // den Postausgang selbst leeren, falls Thunderbird nicht schon dabei ist.
  flushOutbox() {
    const observer = {
      observe: () => setTimeout(() => {
        try {
          const sl = Cc["@mozilla.org/messengercompose/sendlater;1"].getService(Ci.nsIMsgSendLater);
          const outbox = MailServices.accounts.localFoldersServer?.rootFolder?.getFolderWithFlags(Ci.nsMsgFolderFlags.Queue);
          if (Services.prefs.getBoolPref("mailnews.sendInBackground", false) && !Services.io.offline &&
              outbox?.getTotalMessages(false) && !sl.sendingMessages) {
            Services.wm.getMostRecentWindow("mail:3pane")?.SendUnsentMessages?.();
          }
        } catch (e) {
          log("flush outbox error", e);
        }
      }, 2000),
    };
    Services.obs.addObserver(observer, "mail:composeSendProgressStop");
    this.restorers.push(() => Services.obs.removeObserver(observer, "mail:composeSendProgressStop"));
  }

  // Senden im Hintergrund: scheitert eine Mail aus dem Postausgang, wie Apple
  // Mail einen Dialog zeigen (Thunderbird nennt den Fehler sonst nur in der
  // Aktivitätsanzeige); „Postausgang zeigen“ öffnet den Ordner im Hauptfenster
  sendErrors() {
    let sendLater;
    try {
      sendLater = Cc["@mozilla.org/messengercompose/sendlater;1"].getService(Ci.nsIMsgSendLater);
    } catch (e) {
      log("send errors error", e);
      return;
    }
    const listener = {
      QueryInterface: ChromeUtils.generateQI(["nsIMsgSendLaterListener"]),
      onStartSending() {},
      onMessageStartSending() {},
      onMessageSendProgress() {},
      onStopSending() {},
      onMessageSendError: (current, hdr, status, message) => {
        this.showSendError(hdr, message).catch(e => log("send error dialog error", e));
      },
    };
    sendLater.addListener(listener);
    this.sendErrorListener = listener;
    this.restorers.push(() => sendLater.removeListener(listener));
  }

  async showSendError(hdr, message) {
    const win = Services.wm.getMostRecentWindow("mail:3pane");
    if (!win) {
      return;
    }
    const subject = hdr?.mime2DecodedSubject || "";
    const detail = [subject && `„${subject}“`, message, tr("The message was kept in the Outbox.")].filter(Boolean).join("\n\n");
    const P = Services.prompt;
    const flags = P.BUTTON_POS_0 * P.BUTTON_TITLE_OK + P.BUTTON_POS_1 * P.BUTTON_TITLE_IS_STRING;
    const result = await P.asyncConfirmEx(win.browsingContext.top, P.MODAL_TYPE_WINDOW,
      tr("The message could not be sent"), detail, flags, null, tr("Show Outbox"), null, null, false);
    if (result.getProperty("buttonNumClicked") != 1) {
      return;
    }
    const outbox = hdr?.folder || MailServices.accounts.localFoldersServer?.rootFolder?.getFolderWithFlags(Ci.nsMsgFolderFlags.Queue);
    if (outbox) {
      win.focus();
      win.document.getElementById("tabmail")?.switchToTab(0);
      win.gTabmail?.currentAbout3Pane?.displayFolder(outbox.URI);
    }
  }

  setUnreadFilter(a3, on) {
    const qfb = a3?.quickFilterBar;
    if (!qfb) {
      return;
    }
    const state = qfb.filterer;
    state.clear();
    if (on) {
      state.setFilterValue("sticky", true, true);
      for (const key of this.filterCriteria()) {
        state.setFilterValue(key, true);
      }
    }
    qfb.updateSearch();
    const top = a3.browsingContext?.topChromeWindow;
    if (top) {
      this.updateListHeader(top);
    }
  }

  // Neue Mails gleiten oben in die Kartenliste ein, eine geänderte
  // Ungelesen-Zahl in der Ordnerliste „hüpft“ kurz (wie Apple Mail). Beides nur
  // für sichtbare Elemente und nicht bei „Bewegung reduzieren“
  hookArrivals(win) {
    const doc = win.document;
    const tree = doc.getElementById("folderTree");
    if (!tree || tree.__mcArrivals) {
      return;
    }
    tree.__mcArrivals = true;
    const pop = el => el.animate([{ transform: "scale(1.25)" }, { transform: "none" }], { duration: 220, easing: "ease-out" });
    const mo = new win.MutationObserver(records => {
      if (motionMs(220) <= 1) {
        return;
      }
      const seen = new Set();
      for (const rec of records) {
        const badge = rec.target.nodeType == 1 ? rec.target.closest?.(".unread-count") : rec.target.parentElement?.closest(".unread-count");
        if (badge && !seen.has(badge) && badge.getClientRects().length && /\d/.test(badge.textContent)) {
          seen.add(badge);
          pop(badge);
        }
      }
    });
    mo.observe(tree, { subtree: true, characterData: true, childList: true });
    const listener = {
      msgAdded: hdr => {
        if (hdr.folder != win.gFolder || motionMs(250) <= 1) {
          return;
        }
        win.setTimeout(() => {
          try {
            const i = win.gDBView?.findIndexOfMsgHdr(hdr, false);
            const row = i >= 0 ? win.threadTree?.getRowAtIndex?.(i) : null;
            row?.querySelector(".card-container")?.animate(
              [{ opacity: 0, transform: "translateY(-12px)" }, { opacity: 1, transform: "none" }],
              { duration: 250, easing: "ease-out" });
          } catch {}
        }, 60);
      },
    };
    MailServices.mfn.addListener(listener, MailServices.mfn.msgAdded);
    this.addWinRestorer(win, () => {
      mo.disconnect();
      MailServices.mfn.removeListener(listener);
      delete tree.__mcArrivals;
    });
  }

  // Schnellfilter-Leiste nie zeigen: Thunderbirds Befehle dafür (Knopf in
  // der Symbolleiste, Menü, ⇧⌘K) schalten stattdessen den Filter um bzw.
  // setzen den Cursor ins Suchfeld; „Zurücksetzen“ (z. B. beim Springen zu
  // einer ausgefilterten Mail) hebt den Filter auf
  hookUnreadFilter(win) {
    const qfb = win.quickFilterBar;
    const cc = win.commandController;
    if (!qfb || !cc || qfb.__mcUnread) {
      return;
    }
    qfb.__mcUnread = true;
    const origShow = qfb._showFilterBar;
    qfb._showFilterBar = function (show, init) {
      if (show && !init) {
        return undefined;
      }
      return origShow.call(this, false, init);
    };
    // war die Leiste schon offen (gemerkt vom letzten Start): schließen
    if (qfb._filterer?.visible) {
      origShow.call(qfb, false, true);
    }
    const ours = {
      cmd_toggleQuickFilterBar: () => this.setUnreadFilter(win, !this.unreadFilterOn(win)),
      cmd_showQuickFilterBar: () => win.browsingContext?.topChromeWindow?.QuickSearchFocus?.(),
      cmd_resetQuickFilterBar: () => this.setUnreadFilter(win, false),
    };
    // Thunderbird meldet die Befehle erst nach dem Laden der Leiste an –
    // auch dann gelten unsere
    const saved = {};
    const origRegister = cc.registerCallback;
    cc.registerCallback = function (name, callback, isEnabled) {
      if (name in ours) {
        saved[name] = [callback, isEnabled];
        return origRegister.call(this, name, ours[name]);
      }
      return origRegister.call(this, name, callback, isEnabled);
    };
    for (const name of Object.keys(ours)) {
      if (name in cc._callbackCommands) {
        saved[name] = [cc._callbackCommands[name], cc._isCallbackEnabled[name]];
      }
      origRegister.call(cc, name, ours[name]);
    }
    for (const name of ["cmd_showQuickFilterBar", "cmd_toggleQuickFilterBar"]) {
      win.top?.goUpdateCommand?.(name);
    }
    const TOGGLE_EVENTS = ["folderURIChanged", "select", "qfbtoggle"];
    const syncToggle = () => this.syncQuickFilterToggle(win.browsingContext?.topChromeWindow);
    for (const type of TOGGLE_EVENTS) {
      win.addEventListener(type, syncToggle);
    }
    this.addWinRestorer(win, () => {
      for (const type of TOGGLE_EVENTS) {
        win.removeEventListener(type, syncToggle);
      }
      if (this.unreadFilterOn(win)) {
        this.setUnreadFilter(win, false);
      }
      cc.registerCallback = origRegister;
      for (const name of Object.keys(ours)) {
        if (saved[name]) {
          origRegister.call(cc, name, ...saved[name]);
        } else {
          delete cc._callbackCommands[name];
          delete cc._isCallbackEnabled[name];
        }
      }
      qfb._showFilterBar = origShow;
      delete qfb.__mcUnread;
    });
  }

  patch(win, attempt) {
    // Merkmal an der Seite selbst: lädt Thunderbird die Mailansicht neu, bleibt
    // das Fensterobjekt dasselbe, die Seite (und ihre Karten) aber ist neu
    if (win.closed || (this.windows.has(win) && win.document?.__mcPatched)) {
      return;
    }
    const Card = win.customElements?.get("thread-card");
    if (!Card || !win.threadPane || !win.threadTree) {
      if (attempt < 100) {
        win.setTimeout(() => this.patch(win, attempt + 1), 200);
      } else {
        log("patch gave up", { card: !!Card, threadPane: !!win.threadPane, threadTree: !!win.threadTree });
      }
      return;
    }
    this.windows.add(win);
    const doc = win.document;
    doc.__mcPatched = true;
    // Nebenschritte einzeln absichern: ein Fehler darin darf das Einrichten
    // der Karten nicht abbrechen (sonst fehlen Bilder, Vorschau und Knöpfe)
    const safely = (name, fn) => {
      try {
        fn();
      } catch (e) {
        log("patch step error", name, e);
      }
    };
    safely("mail context", () => this.hookMailContext(doc));
    safely("folder context", () => hookFolderContextExtras(doc.defaultView, { push: fn => this.addWinRestorer(doc.defaultView, fn) }));
    safely("archive account", () => hookArchiveAccount(doc.defaultView, { push: fn => this.addWinRestorer(doc.defaultView, fn) }));
    safely("dialog box", () => shareDialogBox(win, { push: fn => this.addWinRestorer(win, fn) }));
    safely("view choice", () => this.hookViewChoice(doc));
    safely("sort menu", () => this.hookSortMenu(doc));
    safely("unread filter", () => this.hookUnreadFilter(win));
    safely("remind menu", () => Remind.hookMenu(win.document));
    safely("follow up", () => FollowUp.hook(win));
    safely("arrivals", () => this.hookArrivals(win));
    safely("star button", () => {
      // Stern-Knopf der Symbolleiste folgt der Auswahl („select“ der
      // Mailliste steigt nicht auf – darum in der Capture-Phase)
      const onSelect = () => this.updateStarButton(win.browsingContext?.topChromeWindow);
      for (const type of ["select", "folderURIChanged"]) {
        win.addEventListener(type, onSelect, true);
      }
      this.addWinRestorer(win, () => {
        for (const type of ["select", "folderURIChanged"]) {
          win.removeEventListener(type, onSelect, true);
        }
      });
    });
    safely("conversation", () => this.hookConversation(win));
    safely("scroll watch", () => {
      const onScroll = () => (this.lastListScroll = Date.now());
      win.threadTree.addEventListener("scroll", onScroll, { passive: true, capture: true });
      this.addWinRestorer(win, () => win.threadTree?.removeEventListener("scroll", onScroll, { capture: true }));
    });
    safely("account rows", () => colorAccountRows(doc, this.restorers));
    safely("search pause", () => this.hookSearchPause(win));
    safely("search stages", () => this.hookSearchStages(win));
    const mb = win.messageBrowser?.contentDocument;
    if (mb?.readyState == "complete") {
      safely("message context", () => this.hookMailContext(mb));
      safely("message header", () => this.hookHeaderAvatar(mb));
    }
    const threadPane = win.threadPane;

    // Die echten Thunderbird-Funktionen am Fenster merken. So überschreibt
    // eine neue Version beim Aktualisieren nie die Hülle der alten, und die
    // alte stellt beim Beenden nichts zurück, was ihr nicht mehr gehört.
    const reg = (win.__mailCards ??= {
      fill: Card.prototype.fillRow,
      density: threadPane.densityChange,
      owner: null,
    });
    const TableRow = win.customElements.get("thread-row");
    reg.rowFill ??= TableRow?.prototype.fillRow;
    const token = (this.token ??= Symbol("mail-cards"));
    reg.owner = token;

    doc.getElementById(STYLE_ID)?.remove();
    const style = doc.createElement("style");
    style.id = STYLE_ID;
    style.textContent = this.cardStyle();
    doc.head.appendChild(style);

    const enhancer = this;
    let decorateErrors = 0;
    const fill = function () {
      if (rowGone(this)) {
        return;
      }
      reg.fill.call(this);
      try {
        enhancer.decorate(win, this);
      } catch (e) {
        if (decorateErrors++ < 5) {
          log("decorate error", e);
        }
      }
    };
    Card.prototype.fillRow = fill;

    const density = async function (...args) {
      await reg.density.apply(this, args);
      // bei jedem Aufruf neu: die Zeilenzahl lässt sich im Betrieb ändern
      const extra = enhancer.previewLines ? enhancer.previewLines * 16 + 10 : 0;
      // größere Schrift (≡ → Schriftgröße): Thunderbird rechnet mit seiner
      // eigenen Schriftgröße, das Design mit festen Größen mal fontScale() –
      // die ganze Karte wächst deshalb mit diesem Faktor
      const scale = fontScale();
      let base = Card.ROW_HEIGHT;
      if (scale != 1) {
        try {
          const { UIFontSize } = ChromeUtils.importESModule("resource:///modules/UIFontSize.sys.mjs");
          base -= Math.round(1.5 * (this.rowCount || 2) * (UIFontSize.size - UIFontSize.osValue));
        } catch {}
      }
      Card.ROW_HEIGHT = Math.max(Math.round((base + extra) * scale), 52);
      this.mcCardHeight = Card.ROW_HEIGHT; // Kontaktkarten im Adressbuch gleich hoch
      // Tabellenansicht: 14-px-Schrift (userChrome.css) braucht luftigere Zeilen
      const Row = win.customElements.get("thread-row");
      if (Row) {
        Row.ROW_HEIGHT = Math.max(Row.ROW_HEIGHT, 28);
      }
    };
    threadPane.densityChange = density;

    // Tabellenansicht: jede zweite Zeile leicht getönt (data-mc-odd nach der
    // echten Listenposition – die Zeilen werden beim Scrollen wiederverwendet)
    if (TableRow && reg.rowFill) {
      TableRow.prototype.fillRow = function (...args) {
        if (rowGone(this)) {
          return undefined;
        }
        const result = reg.rowFill.apply(this, args);
        // als Attribut – Thunderbird setzt die Klassen der Zeile neu
        this.toggleAttribute("data-mc-odd", this._index % 2 == 1);
        return result;
      };
    }

    this.restorers.push(() => {
      if (reg.owner !== token) {
        return; // eine neuere Version hat übernommen
      }
      Card.prototype.fillRow = reg.fill;
      if (TableRow && reg.rowFill) {
        TableRow.prototype.fillRow = reg.rowFill;
      }
      threadPane.densityChange = reg.density;
      delete win.__mailCards;
      style.remove();
      for (const el of doc.querySelectorAll(".mc-avatar, .mc-preview")) {
        el.remove();
      }
      threadPane.updateThreadItemSize();
    });

    this.trackToolbarOffset(win);
    this.hookToolbarReset(win.browsingContext?.topChromeWindow);
    this.decorateFolders(win);
    this.hookFolderEvents(win);

    win.addEventListener("unload", () => this.windows.delete(win), {
      once: true,
    });
    threadPane.updateThreadItemSize();
    log("patched about:3pane", { attempt, rows: win.threadTree?.view?.rowCount ?? null, folder: win.gFolder?.URI || null });
  }

  // Kopfzeile über der Mailliste aktuell halten: bei Ordnerwechsel und wenn
  // sich die Anzahl ändert (auch wenn Thunderbirds eigene Kopfzeile aus ist)
  hookFolderEvents(win) {
    const top = win.browsingContext?.topChromeWindow;
    const tph = win.threadPaneHeader;
    if (!top || !tph || tph.__mcHooked) {
      return;
    }
    const self = this;
    const update = () => win.setTimeout(() => self.updateListHeader(top), 0);
    const origSelected = tph.onFolderSelected;
    const origCount = tph.updateMessageCount;
    tph.onFolderSelected = function (...args) {
      update();
      return origSelected.apply(this, args);
    };
    tph.updateMessageCount = function (...args) {
      update();
      return origCount.apply(this, args);
    };
    tph.__mcHooked = true;
    win.addEventListener("folderURIChanged", update);
    // anderen Ordner gewählt, während gesucht wurde: wie Apple Mail dort
    // weitersuchen (Sammelordner: wieder in allen Postfächern)
    const leave = () => {
      if (self.mailSearchTerm && win.gFolder && !self.isSearchFolder(win.gFolder)) {
        self.searchPrevURI = win.gFolder.URI;
        self.mailSearch(top, self.mailSearchTerm);
      }
      top.__mcSearchPlaceholder?.();
    };
    win.addEventListener("folderURIChanged", leave);
    this.restorers.push(() => win.removeEventListener("folderURIChanged", leave));
    // Platzhalter der Suche auch bei der Auswahl in der Ordnerliste:
    // scheitert das Öffnen der Ansicht (z. B. „Alle Eingänge“), meldet
    // Thunderbird folderURIChanged nicht
    const selected = () => win.setTimeout(() => top.__mcSearchPlaceholder?.(), 0);
    win.folderTree?.addEventListener("select", selected);
    this.restorers.push(() => win.folderTree?.removeEventListener("select", selected));
    this.restorers.push(() => {
      tph.onFolderSelected = origSelected;
      tph.updateMessageCount = origCount;
      delete tph.__mcHooked;
      win.removeEventListener("folderURIChanged", update);
    });
    update();
  }

  // Ordnerliste wie Apple Mail: oben „Favourites“ mit All Inboxes und All
  // Sent, darunter „On My Mac“ und je Konto alle Ordner – mit einheitlichen
  // Namen, Apple-Reihenfolge und ohne Gmails Zwischenebene „[Gmail]“.
  // Einmalig wie Apple Mail: „Sammelordner“ (Alle Eingänge, Alle
  // gesendeten …) oben in der Ordnerliste einschalten. Wer sie danach wieder
  // abschaltet, behält das so.
  enableUnifiedOnce(win, tries = 0) {
    const PREF = "extensions.mailcards.unifiedApplied";
    if (Services.prefs.getBoolPref(PREF, false)) {
      return;
    }
    const pane = win.folderPane;
    if (!pane?.isInitialized) {
      if (tries < 40 && !win.closed) {
        win.setTimeout(() => this.enableUnifiedOnce(win, tries + 1), 500);
      }
      return;
    }
    try {
      const modes = pane.activeModes;
      if (!modes.includes("smart")) {
        pane.activeModes = ["smart", ...modes];
      }
      Services.prefs.setBoolPref(PREF, true);
    } catch (e) {
      log("unified folders error", e);
    }
  }

  decorateFolders(win) {
    const doc = win.document;
    const tree = doc.getElementById("folderTree");
    if (!tree) {
      return;
    }
    this.enableUnifiedOnce(win);
    const L = appleLabels();
    const ORDER = FOLDER_ORDER;
    const roleOf = folderRole;
    const setText = (el, text) => {
      if (el && text && !L.native && el.textContent != text) {
        el.textContent = text;
      }
    };
    const setAttr = (el, name, on) => {
      if (on && !el.hasAttribute(name)) {
        el.setAttribute(name, "");
      } else if (!on && el.hasAttribute(name)) {
        el.removeAttribute(name);
      }
    };

    const localIsEmpty = () => {
      try {
        return this.localIsEmpty(MailServices.accounts.localFoldersServer?.rootFolder);
      } catch {
        return false;
      }
    };
    // „Markiert“ wie Apple Mail: eigene Zeile unter den Favoriten nach „Alle
    // gesendeten“, nur solange es markierte Mails gibt
    // Tab geht gerade zu (sein Inhalt hängt nicht mehr im Fenster): nichts anlegen
    const gone = () => {
      try {
        return win.closed || !win.browsingContext?.embedderElement?.isConnected;
      } catch {
        return true;
      }
    };
    const starredRow = () => {
      if (gone()) {
        return;
      }
      const smart = tree.querySelector(':scope > li[data-mode="smart"]');
      const folder = this.starredAny ? this.starredFolder(true) : this.starredFolder(false);
      let row = smart?.querySelector(':scope > ul > li[data-mc-starred]');
      if (!smart || !folder || !win.folderPane?._createFolderRow) {
        return;
      }
      // neuer Mail-Tab: Thunderbird lädt die Ordnerzeilen-Klasse erst nach –
      // vorher entstünde eine leere Zeile ohne ihre Methoden
      if (!row && !win.customElements.get("folder-tree-row")) {
        win.customElements.whenDefined("folder-tree-row").then(() => apply());
        return;
      }
      if (!row) {
        try {
          row = win.folderPane._createFolderRow("smart", folder);
        } catch (e) {
          // (ein Tab, der gerade entsteht oder geht: Thunderbirds Zeile ist noch
          // nicht fertig – einmal kurz später, erst dann melden)
          if (gone()) {
            return;
          }
          if (!starredRow.retried) {
            starredRow.retried = true;
            win.setTimeout(() => {
              try {
                starredRow();
              } catch (err) {
                if (!gone()) {
                  log("starred row error", err);
                }
              } finally {
                starredRow.retried = false;
              }
            }, 500);
            return;
          }
          throw e;
        }
        row.setAttribute("data-mc-starred", "");
        const list = smart.querySelector(":scope > ul");
        const sent = list?.querySelector(':scope > li[data-folder-type="sent"]');
        sent ? sent.after(row) : list?.append(row);
      }
      setAttr(row, "data-mc-hide", !this.starredAny);
      setText(row.querySelector(":scope > .container .name"), tr("Starred"));
    };
    const apply = () => {
      try {
        starredRow();
      } catch (e) {
        log("starred row error", e);
      }
      // Favoriten nur straffen, wenn darunter auch „Alle Ordner“ angezeigt
      // wird – sonst wären die übrigen Ordner gar nicht erreichbar
      const allShown = !!tree.querySelector(':scope > li[data-mode="all"]');
      if (!L.native) {
        for (const header of tree.querySelectorAll(':scope > li[data-mode="smart"] > .mode-container .mode-name')) {
          header.removeAttribute("data-l10n-id");
          setText(header, L.favourites);
        }
      }
      // leer oder vom Nutzer ausgeblendet (Einstellung bzw. Kontextmenü)
      const hideLocal = localIsEmpty() || !Services.prefs.getBoolPref(SHOW_LOCAL_PREF, true);
      for (const li of tree.querySelectorAll('li[is="folder-tree-row"]')) {
        const modeLi = li.closest("li[data-mode]");
        const mode = modeLi?.dataset.mode;
        let folder = null;
        try {
          folder = MailServices.folderLookup.getFolderForURL(li.uri);
        } catch {}
        const label = li.querySelector(":scope > .container .name");
        const topLevel = li.parentElement?.parentElement === modeLi;
        // der Suchordner ist nur Mittel zum Zweck – nie in der Ordnerliste;
        // der für „Markiert“ nur als eigene Zeile unter den Favoriten
        if (li.hasAttribute("data-mc-starred")) {
          continue;
        }
        if (this.isSearchFolder(folder) || this.isStarredFolder(folder)) {
          setAttr(li, "data-mc-hide", true);
          continue;
        }

        if (mode == "smart") {
          if (li.hasAttribute("data-server-type")) {
            setAttr(li, "data-mc-hide", allShown); // Konto-Abschnitte gibt es unten schon
            continue;
          }
          if (topLevel) {
            const type = li.dataset.folderType;
            setAttr(li, "data-mc-hide", allShown && type != "inbox" && type != "sent");
            if (type == "inbox") setText(label, L.allInboxes);
            if (type == "sent") setText(label, L.allSent);
          } else {
            // nur das Postfach je Konto direkt unter „Alle Eingänge“/„Alle
            // gesendeten“ heißt wie das Konto – tiefere Zeilen (Unterordner)
            // und Ordner unter den Kontozeilen behalten ihren eigenen Namen
            const parentRow = li.parentElement?.closest("li");
            if (folder?.server && parentRow?.parentElement?.parentElement === modeLi &&
                !parentRow.hasAttribute("data-server-type")) {
              setText(label, folder.server.prettyName); // „Google“, „iCloud“
            }
          }
          continue;
        }

        if (mode != "all") {
          continue;
        }
        if (li.hasAttribute("data-server-type")) {
          if (li.dataset.serverType == "none") {
            setText(label, L.onMyMac);
            // wie Apple Mail: Papierkorb und Postausgang nur, solange darin etwas liegt
            const emptySpecial = c => {
              try {
                const f = MailServices.folderLookup.getFolderForURL(c.uri);
                return !!f && f.getFlag(Ci.nsMsgFolderFlags.Trash | Ci.nsMsgFolderFlags.Queue) &&
                  !f.hasSubFolders && f.getTotalMessages(false) == 0;
              } catch {
                return false;
              }
            };
            li.querySelectorAll(':scope > ul > li').forEach(c => setAttr(c, "data-mc-hide", hideLocal || emptySpecial(c)));
            // wie Apple Mail: „On My Mac“ ganz weg, solange dort nichts liegt –
            // aber nur, wenn es andere Konten gibt (sonst wäre die Liste leer)
            const others = MailServices.accounts.accounts.some(a => a.incomingServer && a.incomingServer.type != "none");
            setAttr(li, "data-mc-hide", hideLocal && others);
          } else if (li.getAttribute("draggable") != "true") {
            // Kontozeilen zum Umsortieren ziehbar (Thunderbird macht nur
            // Ordnerzeilen ziehbar – mit der Maus begann das Ziehen sonst nie)
            li.setAttribute("draggable", "true");
          }
          continue;
        }
        // Gmails Zwischenordner „[Gmail]“ auflösen
        const isGmailContainer = folder && !roleOf(folder) && folder.parent?.isServer &&
          /^\[(Gmail|Google Mail)\]$/.test(folder.name);
        setAttr(li, "data-mc-flatten", isGmailContainer);
        if (isGmailContainer) {
          li.querySelector(":scope > ul")?.style.setProperty("--depth", "1");
          continue;
        }
        // Gmail wie Apple Mail: „Markiert“ (Starred) und „Notes“ ausblenden,
        // „Wichtig“ (Important) gleich unter den Posteingang
        // Gmail an der Ordneradresse erkennen (server.hostName ist hier leer)
        const gmail = /^imap:\/\/[^/]*@?imap\.(gmail|googlemail)\.com\//i.test(li.uri || "");
        const directChild = folder?.parent && (folder.parent.isServer || /^\[(Gmail|Google Mail)\]$/.test(folder.parent.name));
        if (gmail && directChild && !roleOf(folder)) {
          if (/^(Markiert|Mit Stern|Starred|Notes|Notizen)$/i.test(folder.name)) {
            setAttr(li, "data-mc-hide", true);
            continue;
          }
          if (/^(Wichtig|Important)$/i.test(folder.name)) {
            li.style.order = "1";
            continue;
          }
        }
        const role = roleOf(folder);
        if (role && folder.parent && (folder.parent.isServer || /^\[(Gmail|Google Mail)\]$/.test(folder.parent.name))) {
          setText(label, L[role]);
          li.style.order = String(ORDER[role]);
        } else if (topLevel === false && (folder?.parent?.isServer || /^\[(Gmail|Google Mail)\]$/.test(folder?.parent?.name || ""))) {
          li.style.order = "10"; // eigene Ordner nach den Standardordnern
        }
      }
    };

    let pending = false;
    const observer = new win.MutationObserver(() => {
      if (pending) {
        return;
      }
      pending = true;
      win.requestAnimationFrame(() => {
        pending = false;
        observer.disconnect();
        try {
          apply();
        } catch (e) {
          log("decorateFolders error", e);
        }
        observer.observe(tree, { childList: true, subtree: true, characterData: true });
      });
    });
    try {
      apply();
    } catch (e) {
      log("decorateFolders error", e);
    }
    observer.observe(tree, { childList: true, subtree: true, characterData: true });
    // Konten per Ziehen an ihrer Überschrift umsortieren (Thunderbird erlaubt
    // das in der Ordnerliste nicht); Ziel ist der ganze Abschnitt eines Kontos
    const sectionOf = (el, start) => {
      const row = el?.closest?.('li[is="folder-tree-row"]');
      const li = start ? row : el?.closest?.("li[data-server-type]");
      return li?.hasAttribute("data-server-type") && li.parentElement?.parentElement?.dataset.mode == "all" ? li : null;
    };
    const accountKey = li => {
      try {
        return MailServices.accounts.findAccountForServer(MailServices.accounts.getIncomingServer(li.dataset.serverKey))?.key || null;
      } catch {
        return null;
      }
    };
    const undrag = accountReorder(tree, sectionOf, li => li.dataset.serverType == "none" ? null : accountKey(li), accountKey);
    const orderedObs = { observe: () => setAttr(tree, "mc-accounts-ordered", Services.prefs.getBoolPref(ACCOUNTS_ORDERED_PREF, false)) };
    orderedObs.observe();
    Services.prefs.addObserver(ACCOUNTS_ORDERED_PREF, orderedObs);
    win.addEventListener("unload", () => Services.prefs.removeObserver(ACCOUNTS_ORDERED_PREF, orderedObs), { once: true });
    // Fenster im Hintergrund (Symbole grau wie bei Apple): eigenes Merkmal statt
    // :-moz-window-inactive – das blieb im inneren Dokument des Mail-Tabs
    // gelegentlich hängen (Symbole schwarz, bis man den Bereich wechselte)
    const top = win.browsingContext?.topChromeWindow;
    const syncActive = () => {
      try {
        setAttr(doc.documentElement, "mc-inactive", Services.focus.activeWindow != top);
      } catch {}
    };
    if (top) {
      top.addEventListener("activate", syncActive);
      top.addEventListener("deactivate", syncActive);
      win.addEventListener("unload", () => {
        top.removeEventListener("activate", syncActive);
        top.removeEventListener("deactivate", syncActive);
      }, { once: true });
      syncActive();
    }
    // Stern gesetzt oder entfernt: Zeile „Markiert“ ein-/ausblenden
    const starListener = {
      onFolderPropertyFlagChanged: (hdr, property, oldFlag, newFlag) => {
        if (property != "Flagged") {
          return;
        }
        // nicht mitten in Thunderbirds Benachrichtigung Ordner anlegen oder suchen
        if (win.closed) {
          return;
        }
        win.setTimeout(() => {
          if (newFlag & Ci.nsMsgMessageFlags.Marked) {
            this.starredAny = true;
            apply();
          } else {
            this.countStarred(() => apply());
          }
        }, 0);
      },
    };
    MailServices.mailSession.AddFolderListener(starListener, Ci.nsIFolderListener.propertyFlagChanged);
    win.addEventListener("unload", () => MailServices.mailSession.RemoveFolderListener(starListener), { once: true });
    this.countStarred(() => apply());
    this.restorers.push(() => {
      top?.removeEventListener("activate", syncActive);
      top?.removeEventListener("deactivate", syncActive);
      doc.documentElement.removeAttribute("mc-inactive");
      observer.disconnect();
      undrag();
      Services.prefs.removeObserver(ACCOUNTS_ORDERED_PREF, orderedObs);
      tree.removeAttribute("mc-accounts-ordered");
      MailServices.mailSession.RemoveFolderListener(starListener);
      tree.querySelectorAll("li[data-mc-starred]").forEach(li => li.remove());
      for (const li of tree.querySelectorAll("[data-mc-hide], [data-mc-flatten]")) {
        li.removeAttribute("data-mc-hide");
        li.removeAttribute("data-mc-flatten");
      }
      // Namen, Reihenfolge und Einrückung direkt zurücksetzen (activeModes neu
      // zuweisen baut nichts neu auf, solange die Modi gleich bleiben)
      for (const li of tree.querySelectorAll('li[is="folder-tree-row"]')) {
        li.style.removeProperty("order");
        if (li.childList && li.depth) {
          li.childList.style.setProperty("--depth", li.depth);
        }
        try {
          li._setName?.();
        } catch {}
      }
      for (const header of tree.querySelectorAll(":scope > li[data-mode] > .mode-container .mode-name")) {
        doc.l10n?.setAttributes(header, `folder-pane-mode-header-${header.closest("li[data-mode]").dataset.mode}`);
      }
    });
  }

  // Stylesheet der Kartenansicht samt Höhe der Vorschau
  cardStyle() {
    return CSS +
      `#threadTree tr[is="thread-card"] .mc-preview { -webkit-line-clamp: ${this.previewLines}; min-height: calc(${this.previewLines * 16}px * var(--mt-font-scale, 1)); }` +
      // ohne Kontaktfoto wie Apple Mail: Text direkt neben dem Ungelesen-Punkt,
      // Punkt bzw. Pfeil auf Höhe der Absenderzeile statt auf der Bildmitte
      (this.contactPhotos ? "" : `
#threadTree tr[is="thread-card"] .card-container { grid-template-columns: 16px minmax(0, 1fr) !important; }
#threadTree tr[is="thread-card"] .mc-avatar { display: none !important; }
#threadTree { --mc-status-top: 7px; }`);
  }

  // Kontaktfoto ein-/ausgeschaltet: Stil in allen Mailansichten sofort tauschen
  applyContactPhotos() {
    const on = Services.prefs.getBoolPref(CONTACT_PHOTOS_PREF, true);
    if (on == this.contactPhotos) {
      return;
    }
    this.contactPhotos = on;
    for (const win of this.windows) {
      const style = win.document?.getElementById(STYLE_ID);
      if (style) {
        style.textContent = this.cardStyle();
      }
    }
  }

  // Vorschauzeilen geändert (Menü Ansicht): Stil, Kartenhöhe und Karten in
  // allen Mailansichten sofort anpassen; 0 = Vorschau ganz entfernen
  applyPreviewLines() {
    const lines = Math.max(0, Math.min(4, Services.prefs.getIntPref(PREVIEW_PREF, 1)));
    if (lines == this.previewLines) {
      return;
    }
    this.previewLines = lines;
    for (const win of this.windows) {
      try {
        const doc = win.document;
        const style = doc.getElementById(STYLE_ID);
        if (style) {
          style.textContent = this.cardStyle();
        }
        if (!lines) {
          for (const el of doc.querySelectorAll(".mc-preview")) {
            el.remove();
          }
        }
        // berechnet die Kartenhöhe neu und baut die Zeilen neu auf (decorate)
        win.threadPane?.updateThreadItemSize();
      } catch (e) {
        log("preview lines error", e);
      }
    }
  }

  decorate(win, row) {
    const doc = win.document;
    const container = row.querySelector(".card-container");
    row.removeAttribute("data-mc-dup"); // Zeilen werden wiederverwendet
    if (!container) {
      return;
    }
    let avatar = container.querySelector(":scope > .mc-avatar");
    if (!avatar) {
      avatar = doc.createElement("div");
      avatar.className = "mc-avatar";
      container.insertBefore(avatar, container.children[1] || null);
    }
    let preview = row.querySelector(".mc-preview");
    if (!preview && this.previewLines) {
      preview = doc.createElement("div");
      preview.className = "mc-preview";
      row.querySelector(".thread-card-dynamic-row")?.after(preview);
    }

    if ((row.dataset.properties || "").split(" ").includes("dummy")) {
      return;
    }

    const hdr = this.hdrForRow(row);
    if (!hdr) {
      return;
    }
    if (this.isDuplicateRow(row)) {
      row.setAttribute("data-mc-dup", "");
      return;
    }

    if (preview) {
      const text = cleanPreview(hdr.getStringProperty("preview"));
      preview.textContent = text;
      if (!text) {
        this.requestPreview(win, hdr);
      }
    }

    const outgoing = this.isOutgoingView(win, row);
    this.fillAvatar(avatar, hdr, outgoing);
    this.fillSender(row, hdr, outgoing);
    const dateEl = row.querySelector(".thread-card-row .date");
    if (dateEl && hdr.date) {
      dateEl.textContent = appleListDate(hdr.date / 1000);
    }
    this.markSearchHits(win, row);
  }

  // Zeigt die Karte Empfänger statt Absender? Wie Thunderbird: in Ordnern für
  // Ausgehendes, ohne Ordner (Suchergebnisse) je Mail
  isOutgoingView(win, row) {
    try {
      if (win.gFolder) {
        const F = Ci.nsMsgFolderFlags;
        return win.gFolder.isSpecialFolder(F.SentMail | F.Drafts | F.Queue | F.Templates, true);
      }
    } catch {}
    return (row.dataset.properties || "").split(" ").includes("outgoing");
  }

  // Zugeklappte Konversation: Bild, Vorschau und Datum stammen von der neuesten
  // Mail (hdrForRow) – dann auch der Name, sonst stünde dort der Absender der
  // ersten Mail neben dem Bild eines anderen. Sonst schreibt Thunderbird den
  // Namen; zeigt es Adressen (Person nicht im Adressbuch, „Anna <anna@…>“ oder
  // nur die Adresse), stehen wie in Apple Mail nur die Namen da – ohne Namen
  // der aus der Domain („rueckgabe@amazon.de“ → „Amazon“). Die Adressen bleiben
  // im Tooltip. Gilt ebenso für die Empfänger in Gesendet, Entwürfen …
  fillSender(row, hdr, outgoing = false) {
    const el = row.querySelector(".thread-card-row .sender");
    if (!el) {
      return;
    }
    let own = null;
    try {
      own = row.view.getMsgHdrAt(row._index);
    } catch {}
    const persons = personsFor(hdr, outgoing);
    const label = persons.map(p => senderLabel(p.name, p.email)).filter(Boolean).join(", ");
    if (own && own != hdr && (own.messageKey != hdr.messageKey || own.folder?.URI != hdr.folder?.URI)) {
      if (label && el.textContent != label) {
        el.textContent = label;
        el.title = label;
      }
      return;
    }
    const text = el.textContent.toLowerCase();
    if (!label || !persons.some(p => p.email && text.includes(p.email))) {
      return;
    }
    if (label != el.textContent) {
      el.textContent = label;
    }
  }

  // Suchtreffer in Absender, Betreff und Vorschau gelb markieren – nur in der
  // Suche (Zeilen werden wiederverwendet: sonst alte Markierungen entfernen)
  markSearchHits(win, row) {
    const term = this.isSearchFolder(win.gFolder) ? this.mailSearchTerm : "";
    for (const el of [row.querySelector(".sender"), row.querySelector(".subject"), row.querySelector(".mc-preview")]) {
      if (el && (term || el.querySelector("mark.mc-hit"))) {
        markHits(el, term);
      }
    }
  }

  // Lokale Ordner nur zusammenklappen, wenn darin nichts Eigenes liegt
  // (nur leere Standardordner) – POP3-Konten mit globalem Posteingang,
  // Archive oder Filterziele dort bleiben sichtbar. Der eigene Suchordner
  // zählt nicht – er behält nach einer Suche die Trefferzahl; gespeicherte
  // Suchen des Nutzers zählen weiter
  localIsEmpty(root) {
    return !root || root.subFolders.every(f => this.isSearchFolder(f) || this.isStarredFolder(f) || (!f.hasSubFolders && f.getTotalMessages(false) == 0));
  }

  isSearchFolder(folder) {
    try {
      return !!folder && folder.name == SEARCH_FOLDER_NAME && folder.getFlag(Ci.nsMsgFolderFlags.Virtual) &&
        folder.parent?.isServer && folder.server == MailServices.accounts.localFoldersServer;
    } catch {
      return false;
    }
  }

  isStarredFolder(folder) {
    try {
      return !!folder && folder.name == STARRED_FOLDER_NAME && folder.getFlag(Ci.nsMsgFolderFlags.Virtual) &&
        folder.parent?.isServer && folder.server == MailServices.accounts.localFoldersServer;
    } catch {
      return false;
    }
  }

  // Suchordner für „Markiert“: alle markierten Mails aller Konten ohne
  // Papierkorb, Spam, Entwürfe, Vorlagen und Postausgang; nur lokale
  // Datenbanken (keine Suche auf dem Server). Die Ordnerauswahl wird je
  // Start erneuert, damit neue Konten und Ordner dazukommen
  // Gmail legt jede Mail zusätzlich unter „[Gmail]/Alle Nachrichten“ ab, oft
  // auch unter „Wichtig“ und „Markiert“ – der Suchordner fand sie so bis zu
  // viermal, Thunderbird fasste die Kopien zu einem Faden zusammen und zeigte
  // beim Anklicken nur die Sammelansicht. Bei Gmail daher nur „Alle
  // Nachrichten“ (enthält jede Mail genau einmal, auch archivierte); fehlt
  // der Ordner, bleibt es bei allen Ordnern des Kontos
  starredScope() {
    const F = Ci.nsMsgFolderFlags;
    const scope = this.searchScope().filter(f => !(f.flags & (F.Drafts | F.Templates | F.Queue)));
    const gmailAll = new Map();
    for (const f of scope) {
      if (/^imap:\/\/[^/]*@?imap\.(gmail|googlemail)\.com\//i.test(f.URI) && (f.flags & F.Archive) &&
          /^\[(Gmail|Google Mail)\]$/.test(f.parent?.name || "")) {
        gmailAll.set(f.server, f);
      }
    }
    return scope.filter(f => !gmailAll.has(f.server) || gmailAll.get(f.server) == f);
  }

  starredFolder(create = false) {
    let root = null;
    try {
      root = MailServices.accounts.localFoldersServer?.rootFolder;
    } catch {}
    if (!root) {
      return null;
    }
    const { VirtualFolderHelper } = ChromeUtils.importESModule("resource:///modules/VirtualFolderWrapper.sys.mjs");
    const existing = root.subFolders.find(f => this.isStarredFolder(f));
    if (existing) {
      // neue Konten und Ordner aufnehmen (nur wenn sich etwas geändert hat)
      try {
        const wrapped = VirtualFolderHelper.wrapVirtualFolder(existing);
        const scope = this.starredScope();
        if (wrapped.searchFolderURIs != scope.map(f => f.URI).join("|")) {
          wrapped.searchFolders = scope;
        }
      } catch (e) {
        log("starred scope error", e);
      }
      return existing;
    }
    if (!create) {
      return null;
    }
    return VirtualFolderHelper.createNewVirtualFolder(STARRED_FOLDER_NAME, root, this.starredScope(), [this.starredTerm()], false).virtualFolder;
  }

  starredTerm(session = null) {
    session ??= Cc["@mozilla.org/messenger/searchSession;1"].createInstance(Ci.nsIMsgSearchSession);
    const term = session.createTerm();
    term.attrib = Ci.nsMsgSearchAttrib.MsgStatus;
    term.op = Ci.nsMsgSearchOp.Is;
    const value = term.value;
    value.attrib = Ci.nsMsgSearchAttrib.MsgStatus;
    value.status = Ci.nsMsgMessageFlags.Marked;
    term.value = value;
    term.booleanAnd = true;
    return term;
  }

  // gibt es irgendwo eine markierte Mail? (lokale Datenbanken) – setzt
  // this.starredAny und ruft done()
  countStarred(done) {
    if (this.starredCounting) {
      this.starredCountAgain = done;
      return;
    }
    let found = false;
    let session;
    const finish = () => {
      this.starredCounting = false;
      this.starredAny = found;
      done?.();
      const again = this.starredCountAgain;
      if (again) {
        this.starredCountAgain = null;
        this.countStarred(again);
      }
    };
    try {
      session = Cc["@mozilla.org/messenger/searchSession;1"].createInstance(Ci.nsIMsgSearchSession);
      const scope = this.starredScope();
      if (!scope.length) {
        finish();
        return;
      }
      for (const f of scope) {
        session.addScopeTerm(Ci.nsMsgSearchScope.offlineMail, f);
      }
      session.appendTerm(this.starredTerm(session));
      this.starredCounting = true;
      session.registerListener({
        onNewSearch() {},
        onSearchHit: () => {
          found = true;
        },
        onSearchDone: () => finish(),
      }, Ci.nsIMsgSearchSession.allNotifications);
      session.search(null);
    } catch (e) {
      log("starred count error", e);
      finish();
    }
  }

  // versteckter Suchordner unter „Lokale Ordner“ (nur bei Bedarf angelegt)
  searchFolder(create = false) {
    let root = null;
    try {
      root = MailServices.accounts.localFoldersServer?.rootFolder;
    } catch {}
    if (!root) {
      return null;
    }
    const existing = root.subFolders.find(f => this.isSearchFolder(f));
    if (existing || !create) {
      return existing || null;
    }
    const { VirtualFolderHelper } = ChromeUtils.importESModule("resource:///modules/VirtualFolderWrapper.sys.mjs");
    return VirtualFolderHelper.createNewVirtualFolder(SEARCH_FOLDER_NAME, root, this.searchScope(), [], false).virtualFolder;
  }

  // Suchbereich wie Apple Mail: Sammelordner (Alle Eingänge …) und ohne
  // gewählten Ordner alle Postfächer aller Konten – ohne Papierkorb, Spam und
  // Suchordner; ein Konto: dessen Ordner; sonst nur der gewählte Ordner (auch
  // Papierkorb oder Spam, wenn genau der gewählt ist)
  searchScope(base = null) {
    const F = Ci.nsMsgFolderFlags;
    const all = MailServices.accounts.allFolders.filter(f =>
      !f.isServer && !(f.flags & (F.Virtual | F.Trash | F.Junk | F.ImapNoselect)));
    if (!base || this.isUnifiedFolder(base)) {
      return all;
    }
    if (base.isServer) {
      return all.filter(f => f.server == base.server);
    }
    return [base];
  }

  // Sammelordner („Alle Eingänge“ …, gespeicherte Suchen) – dort global suchen
  isUnifiedFolder(folder) {
    try {
      return !folder || folder.getFlag(Ci.nsMsgFolderFlags.Virtual) || /\/smart%20mailboxes(\/|$)/i.test(folder.URI);
    } catch {
      return true;
    }
  }

  // Ordner, in dem gesucht wird (während der Suche: der Ordner davor)
  searchBase(a3) {
    let base = a3?.gFolder;
    if (this.isSearchFolder(base)) {
      try {
        base = this.searchPrevURI ? MailServices.folderLookup.getFolderForURL(this.searchPrevURI) : null;
      } catch {
        base = null;
      }
    }
    return base;
  }

  // Begriff in Betreff, Absender, Empfänger oder Text – oder, wenn er wie ein
  // Datum aussieht („12.10“), Mails von diesem Tag; ohne body nur die
  // Kopfzeilen (stehen in der Ordner-Datenbank, der Text muss je Mail von der
  // Platte gelesen werden)
  searchTerms(session, text, body = true) {
    const A = Ci.nsMsgSearchAttrib;
    const O = Ci.nsMsgSearchOp;
    const terms = [];
    const add = (attrib, op, fill) => {
      const term = session.createTerm();
      term.attrib = attrib;
      term.op = op;
      const value = term.value;
      value.attrib = attrib;
      fill(value);
      term.value = value;
      term.booleanAnd = false;
      terms.push(term);
    };
    for (const attrib of body ? [A.Subject, A.Sender, A.ToOrCC, A.Body] : [A.Subject, A.Sender, A.ToOrCC]) {
      add(attrib, O.Contains, v => (v.str = text));
    }
    const date = searchDate(text);
    if (date) {
      add(A.Date, O.Is, v => (v.date = date.getTime() * 1000));
    }
    return terms;
  }

  // Suchfeld oben in der Mail: Treffer aus allen Postfächern in der
  // Kartenliste; leeres Feld kehrt zum vorherigen Ordner zurück
  mailSearch(top, text) {
    const a3 = top.document.getElementById("tabmail")?.currentAbout3Pane;
    if (!a3?.displayFolder) {
      return;
    }
    const term = (text || "").trim();
    let folder = this.searchFolder(false);
    if (!term) {
      this.mailSearchTerm = "";
      this.searchRun = null;
      a3.document.documentElement.removeAttribute("mc-search-stage");
      a3.document.documentElement.removeAttribute("mc-search-gloda");
      if (folder && this.isSearchFolder(a3.gFolder)) {
        let back = null;
        try {
          back = this.searchPrevURI && MailServices.folderLookup.getFolderForURL(this.searchPrevURI);
        } catch {}
        back ??= MailServices.accounts.defaultAccount?.incomingServer?.rootFolder
          ?.getFolderWithFlags(Ci.nsMsgFolderFlags.Inbox);
        if (back) {
          a3.displayFolder(back.URI);
        }
      }
      this.updateListHeader(top);
      return;
    }
    // wie Apple Mail zuerst der fertige Index: Thunderbirds Gloda kennt
    // Betreff, Personen und Text der indizierten Mails – seine Treffer stehen
    // sofort in der Liste, die Ordnersuche bestätigt sie im Hintergrund und
    // ergänzt, was Gloda (noch) nicht kennt. Abgeschaltet, leer oder zu
    // langsam: wie bisher erst Kopfzeilen, dann Text
    const run = { term, stage: "index", start: Date.now(), created: Date.now() };
    this.mailSearchTerm = term;
    this.searchRun = run;
    const html = a3.document.documentElement;
    html.removeAttribute("mc-search-gloda");
    if (!this.glodaEnabled() || term.length < GLODA_MIN_CHARS) {
      this.startMailSearch(top, a3, folder, run, null);
    } else {
      html.setAttribute("mc-search-stage", "index");
      this.glodaHits(term).then(hits => {
        if (this.searchRun === run && this.mailSearchTerm == term) {
          this.startMailSearch(top, a3, this.searchFolder(false), run, hits);
        }
      });
    }
    this.updateListHeader(top);
  }

  startMailSearch(top, a3, folder, run, hits) {
    const term = run.term;
    try {
      folder ??= this.searchFolder(true);
      const { VirtualFolderHelper } = ChromeUtils.importESModule("resource:///modules/VirtualFolderWrapper.sys.mjs");
      const wrapper = VirtualFolderHelper.wrapVirtualFolder(folder);
      if (a3.gFolder && !this.isSearchFolder(a3.gFolder)) {
        this.searchPrevURI = a3.gFolder.URI;
      }
      const scope = this.searchScope(this.searchBase(a3));
      // Thunderbird zeigt beim Start einer Suche zuerst die gemerkten Treffer
      // der letzten Suche (je Postfach zwischengespeichert) und räumt erst am
      // Ende auf – über viele IMAP-Postfächer dauert das, und bis dahin standen
      // Mails ohne den Begriff in der Liste. Darum vor jeder Suche leeren.
      this.clearSearchCache(folder, [...new Set([...wrapper.searchFolders, ...scope])]);
      // Gloda-Treffer als gemerkte Treffer eintragen: Thunderbird zeigt sie
      // beim Start der Suche sofort, ergänzt nur neue Treffer (keine
      // doppelten Zeilen) und entfernt am Ende eines Postfachs, was die
      // Ordnersuche nicht bestätigt
      const seeded = this.glodaSeed(folder, hits, scope);
      wrapper.searchFolders = scope;
      // zweistufig: erst nur die Kopfzeilen (fast sofort), danach im
      // Hintergrund der Text (searchStageDone); mit Gloda-Treffern gleich
      // der Text – die erste Stufe nähme deren Texttreffer wieder heraus.
      // Einschränkung: Kopfzeilentreffer in Mails, die Gloda noch nicht kennt
      // (neu, Postfach mitten in der Erstindizierung), erscheinen dann erst,
      // wenn die Textsuche ihr Postfach erreicht (die Begriffe gelten für
      // alle Postfächer des Suchordners gemeinsam)
      wrapper.searchTerms = this.searchTerms(wrapper.searchTermsSession, term, seeded > 0);
      wrapper.onlineSearch = false;
      MailServices.accounts.saveVirtualFolders();
      run.stage = seeded > 0 ? "body" : "headers";
      run.start = Date.now();
      debugLog("search: gloda", hits ? `${seeded} hits` : "off", "after", run.start - run.created, "ms");
      a3.document.documentElement.setAttribute("mc-search-stage", run.stage);
      if (seeded > 0) {
        a3.document.documentElement.setAttribute("mc-search-gloda", seeded);
      }
      if (this.isSearchFolder(a3.gFolder) && a3.gViewWrapper?.search && !this.searchScopeChanged) {
        // Suche läuft schon: neue Begriffe direkt in die Ansicht
        a3.gViewWrapper.search.virtualFolderTerms = wrapper.searchTerms;
      } else {
        this.searchScopeChanged = false;
        if (a3.gFolder && !this.isSearchFolder(a3.gFolder)) {
          this.searchPrevURI = a3.gFolder.URI;
        }
        wrapper.cleanUpMessageDatabase();
        a3.displayFolder(folder.URI);
        // frisch angelegt: die Ordnerliste hat die Zeile evtl. erst gleich
        if (!this.isSearchFolder(a3.gFolder)) {
          top.setTimeout(() => this.mailSearchTerm == term && a3.displayFolder(folder.URI), 300);
        }
      }
    } catch (e) {
      log("mail search error", e);
    }
    this.updateListHeader(top);
  }

  // Gloda aktiv (Thunderbirds Einstellung „Globale Suche und Indizierung“)
  glodaEnabled() {
    return Services.prefs.getBoolPref("mailnews.database.global.indexer.enabled", false);
  }

  // Treffer aus Gloda je Postfach (Ordner-URI → Nachrichtennummern); null,
  // wenn Gloda nicht oder nicht rechtzeitig antwortet
  glodaHits(term) {
    return new Promise(resolve => {
      let timer = null;
      const finish = value => {
        clearTimeout(timer);
        resolve(value);
      };
      // Begriff als Wortfolge, das letzte Wort darf weitergehen („rechn“ →
      // „Rechnung“); Anführungszeichen und Sterne hätten im Volltext-Index
      // eigene Bedeutung
      const words = term.replace(/["*]/g, " ").trim().split(/\s+/).filter(Boolean);
      if (!words.length) {
        finish(null);
        return;
      }
      timer = setTimeout(() => finish(null), GLODA_WAIT_MS);
      try {
        const { Gloda } = ChromeUtils.importESModule("resource:///modules/gloda/GlodaPublic.sys.mjs");
        const { GlodaConstants } = ChromeUtils.importESModule("resource:///modules/gloda/GlodaConstants.sys.mjs");
        const query = Gloda.newQuery(GlodaConstants.NOUN_MESSAGE);
        query.fulltextMatches(`"${words.join(" ")}*"`);
        query.orderBy("-date");
        query.limit(GLODA_LIMIT);
        query.getCollection({
          onItemsAdded() {},
          onItemsModified() {},
          onItemsRemoved() {},
          onQueryCompleted: collection => {
            const hits = new Map();
            for (const msg of collection.items) {
              const uri = msg.folderURI;
              const key = msg.messageKey;
              if (uri && key != null) {
                if (!hits.has(uri)) {
                  hits.set(uri, []);
                }
                hits.get(uri).push(key);
              }
            }
            finish(hits);
          },
        });
      } catch (e) {
        log("search gloda error", e);
        finish(null);
      }
    });
  }

  // Gloda-Treffer im Suchbereich als gemerkte Treffer des Suchordners
  // eintragen (nur Mails, die es im Postfach noch gibt); liefert die Anzahl
  glodaSeed(searchFolder, hits, scope) {
    let count = 0;
    if (!hits?.size) {
      return count;
    }
    for (const f of scope) {
      const keys = hits.get(f.URI);
      if (!keys?.length) {
        continue;
      }
      try {
        const db = f.msgDatabase;
        const found = [...new Set(keys)].filter(k => db.containsKey(k)).sort((a, b) => a - b);
        if (found.length) {
          db.refreshCache(searchFolder.URI, found);
          count += found.length;
        }
      } catch (e) {
        log("search gloda seed error", f.URI, e);
      }
    }
    return count;
  }

  // Zweite Stufe der Suche: sind die Kopfzeilen durch, dieselbe Suche mit dem
  // Text dazu. Thunderbird zeigt dabei sofort die gemerkten Treffer der ersten
  // Stufe (je Postfach zwischengespeichert, alle passen weiter) und ergänzt
  // nur die neuen – keine doppelten Zeilen; Mails mit Treffer in den
  // Kopfzeilen liest es nicht noch einmal von der Platte. Pausiert beim
  // Scrollen wie jede Suche (hookSearchPause); ein neuer Begriff oder ein
  // Ordnerwechsel startet wieder mit Stufe eins (mailSearch).
  hookSearchStages(win) {
    const onLoaded = () => win.setTimeout(() => this.searchStageDone(win), 0);
    win.addEventListener("allMessagesLoaded", onLoaded);
    this.addWinRestorer(win, () => {
      win.removeEventListener("allMessagesLoaded", onLoaded);
      win.document.documentElement.removeAttribute("mc-search-stage");
      win.document.documentElement.removeAttribute("mc-search-gloda");
    });
  }

  searchStageDone(win) {
    const run = this.searchRun;
    const root = win.document.documentElement;
    // (Xray-Hülle: Getter wie „searching“ nur am Objekt der Seite sichtbar)
    const page = win.wrappedJSObject || win;
    const view = page.gViewWrapper;
    if (!run || run.stage == "index" || run.term != this.mailSearchTerm || root.getAttribute("mc-search-stage") != run.stage ||
        !this.isSearchFolder(win.gFolder) || !view?.search || view.searching) {
      return;
    }
    const ms = Date.now() - run.start;
    if (run.stage == "body") {
      log("search: body done", ms, "ms,", page.gDBView?.rowCount, "hits");
      this.searchRun = null;
      root.removeAttribute("mc-search-stage");
      return;
    }
    log("search: headers done", ms, "ms,", page.gDBView?.rowCount, "hits");
    try {
      const { VirtualFolderHelper } = ChromeUtils.importESModule("resource:///modules/VirtualFolderWrapper.sys.mjs");
      const wrapper = VirtualFolderHelper.wrapVirtualFolder(win.gFolder);
      const terms = this.searchTerms(wrapper.searchTermsSession, run.term, true);
      // erst im Ordner speichern: nur wenn die Begriffe der Ansicht dort
      // stehen, nimmt Thunderbird die gemerkten Treffer
      wrapper.searchTerms = terms;
      MailServices.accounts.saveVirtualFolders();
      run.stage = "body";
      run.start = Date.now();
      root.setAttribute("mc-search-stage", "body");
      // die Ansicht wird dabei neu angelegt und springt sonst nach oben –
      // weggescrollt: dort bleiben, auch wenn die Suche fertig ist
      const tree = win.threadTree;
      const pane = page.threadPane;
      const scrollTop = tree?.scrollTop || 0;
      view.search.virtualFolderTerms = terms;
      if (scrollTop > 0) {
        tree.scrollTop = scrollTop;
        if (pane) {
          pane.isFirstScroll = false;
          pane.scrollDetected = true;
        }
      }
    } catch (e) {
      log("search body stage error", e);
      this.searchRun = null;
      root.removeAttribute("mc-search-stage");
    }
  }

  clearSearchCache(searchFolder, folders) {
    for (const f of folders) {
      try {
        f.msgDatabase?.refreshCache(searchFolder.URI, []);
      } catch {}
    }
  }

  // Geburtstage aus dem Adressbuch als eigener Kalender wie bei Apple:
  // nur im Speicher und schreibgeschützt, bei jedem Start und bei Änderungen
  // an Kontakten neu gefüllt; synchronisiert nirgendwohin. Ein-/Ausblenden
  // über das Häkchen in der Kalenderliste. Beim Deaktivieren oder
  // Deinstallieren wird er wieder entfernt.
  hookBirthdays() {
    let timer = null;
    const schedule = (ms = 3000) => {
      clearTimeout(timer);
      timer = setTimeout(() => this.syncBirthdays().catch(e => log("birthdays error", e)), ms);
    };
    schedule(9000);
    const topics = ["addrbook-contact-created", "addrbook-contact-updated", "addrbook-contact-deleted", "addrbook-directory-created", "addrbook-directory-deleted"];
    const obs = { observe: () => schedule() };
    for (const topic of topics) {
      Services.obs.addObserver(obs, topic);
    }
    const prefObs = { observe: () => schedule(200) };
    Services.prefs.addObserver(BDAY_PREF, prefObs);
    // Deaktivieren/Deinstallieren: Kalender entfernen (beim Beenden oder
    // Update bleibt er, sonst bekäme er jedes Mal eine neue Kennung)
    const { AddonManager } = ChromeUtils.importESModule("resource://gre/modules/AddonManager.sys.mjs");
    // (dabei auch den versteckten Suchordner entfernen – ohne halo.spaces
    // stünde er sonst sichtbar unter „Lokale Ordner“)
    const goodbye = addon => {
      if (addon.id == "mail-cards@sebastian.local") {
        this.removeBirthdayCalendar();
        this.removeSearchFolder();
        restorePersonalBookName();
        EarlyTheme.remove().catch(e => log("early theme remove error", e));
      }
    };
    // Einstellungen erst aufräumen, wenn die Deinstallation wirklich
    // geschieht – „Entfernen“ in den Add-ons lässt sich noch rückgängig
    // machen. Der Beobachter bleibt dafür über das Abschalten hinaus
    // angemeldet und meldet sich danach selbst ab
    let pendingUninstall = null;
    const uninstalling = addon => {
      goodbye(addon);
      if (addon.id != "mail-cards@sebastian.local" || pendingUninstall) {
        return;
      }
      pendingUninstall = {
        onUninstalled: a => {
          if (a.id == addon.id) {
            AddonManager.removeAddonListener(pendingUninstall);
            cleanupAfterUninstall();
          }
        },
        onOperationCancelled: a => {
          if (a.id == addon.id && !(a.pendingOperations & AddonManager.PENDING_UNINSTALL)) {
            AddonManager.removeAddonListener(pendingUninstall);
            pendingUninstall = null;
          }
        },
      };
      AddonManager.addAddonListener(pendingUninstall);
    };
    const addonListener = { onDisabling: goodbye, onUninstalling: uninstalling };
    AddonManager.addAddonListener(addonListener);
    this.restorers.push(() => {
      clearTimeout(timer);
      for (const topic of topics) {
        Services.obs.removeObserver(obs, topic);
      }
      Services.prefs.removeObserver(BDAY_PREF, prefObs);
      AddonManager.removeAddonListener(addonListener);
    });
  }

  removeSearchFolder() {
    try {
      for (const folder of [this.searchFolder(false), this.starredFolder(false)]) {
        folder?.parent?.propagateDelete(folder, true);
      }
      MailServices.accounts.saveVirtualFolders();
    } catch (e) {
      log("search folder remove error", e);
    }
  }

  removeBirthdayCalendar() {
    try {
      const { cal } = ChromeUtils.importESModule("resource:///modules/calendar/calUtils.sys.mjs");
      const calendar = cal.manager.getCalendarById(Services.prefs.getStringPref(BDAY_CAL_PREF, ""));
      if (calendar) {
        cal.manager.unregisterCalendar(calendar);
      }
    } catch (e) {
      log("birthdays remove error", e);
    }
    Services.prefs.clearUserPref(BDAY_CAL_PREF);
  }

  async syncBirthdays() {
    const { cal } = ChromeUtils.importESModule("resource:///modules/calendar/calUtils.sys.mjs");
    const { CalEvent } = ChromeUtils.importESModule("resource:///modules/CalEvent.sys.mjs");
    const { CalRecurrenceInfo } = ChromeUtils.importESModule("resource:///modules/CalRecurrenceInfo.sys.mjs");
    // Ein-/Ausblenden wie bei Apple Kalender über das Häkchen am Kalender
    // „Geburtstage“ in der Kalenderliste. Die frühere Option (Pref aus)
    // blendet ihn einmal aus und wird dann gelöscht
    let hide = false;
    if (Services.prefs.prefHasUserValue(BDAY_PREF)) {
      hide = !Services.prefs.getBoolPref(BDAY_PREF, true);
      Services.prefs.clearUserPref(BDAY_PREF);
    }
    // Geburtstage einsammeln (lokale Adressbücher; doppelte Kontakte einmal)
    const found = new Map();
    for (const dir of MailServices.ab.directories) {
      if (dir.isRemote) {
        continue; // LDAP o. Ä. – nicht komplett durchgehen
      }
      let cards = [];
      try {
        cards = dir.childCards;
      } catch {
        continue;
      }
      for (const card of cards) {
        if (card.isMailList) {
          continue;
        }
        let entry = null;
        try {
          entry = card.vCardProperties?.getFirstEntry("bday");
        } catch {}
        const value = String(entry?.value || "");
        const m = value.match(/^(?:(\d{4})|--)-?(\d{2})-?(\d{2})/);
        if (!m) {
          continue;
        }
        // Apple (Kontakte/iCloud) speichert Geburtstage ohne Jahr als 1604 mit
        // X-APPLE-OMIT-YEAR – das ist kein Geburtsjahr (auch ohne den Parameter)
        const omit = entry.params?.["x-apple-omit-year"];
        const year = m[1] && m[1] != omit && Number(m[1]) > 1604 ? Number(m[1]) : null;
        const name = (card.displayName || `${card.firstName || ""} ${card.lastName || ""}`).trim() || card.primaryEmail;
        if (!name) {
          continue;
        }
        const key = `${name.toLocaleLowerCase()}|${m[2]}${m[3]}`;
        if (!found.has(key) || (!found.get(key).year && year)) {
          found.set(key, { name, year, month: Number(m[2]), day: Number(m[3]) });
        }
      }
    }
    // wie bei Apple immer vorhanden (auch ohne Geburtstage), damit er sich
    // in der Kalenderliste ein- und ausblenden lässt
    let calendar = cal.manager.getCalendarById(Services.prefs.getStringPref(BDAY_CAL_PREF, ""));
    if (!calendar) {
      calendar = cal.manager.createCalendar("memory", Services.io.newURI("moz-memory-calendar://"));
      calendar.name = tr("Birthdays");
      calendar.setProperty("color", "#FF2D55");
      calendar.setProperty("suppressAlarms", true);
      cal.manager.registerCalendar(calendar);
      Services.prefs.setStringPref(BDAY_CAL_PREF, calendar.id);
    }
    if (hide) {
      // wie das Häkchen: aus der sichtbaren Kalendersammlung jedes Fensters nehmen
      for (const win of Services.wm.getEnumerator("mail:3pane")) {
        try {
          cal.view.getCompositeCalendar(win).removeCalendar(calendar);
        } catch {}
      }
      calendar.deleteProperty("calendar-main-in-composite");
    }
    calendar.readOnly = false;
    try {
      for (const item of await calendar.getItemsAsArray(Ci.calICalendar.ITEM_FILTER_ALL_ITEMS, 0, null, null)) {
        await calendar.deleteItem(item);
      }
      for (const b of found.values()) {
        const e = new CalEvent();
        e.id = `halo-bday-${b.month}-${b.day}-${b.name}`;
        e.title = tr("{name}’s Birthday", { name: b.name });
        const start = cal.createDateTime();
        start.resetTo(b.year || 2000, b.month - 1, b.day, 0, 0, 0, cal.dtz.floating);
        start.isDate = true;
        const end = start.clone();
        end.day += 1;
        e.startDate = start;
        e.endDate = end;
        e.setProperty("TRANSP", "TRANSPARENT");
        const info = new CalRecurrenceInfo(e);
        const rule = cal.createRecurrenceRule();
        rule.type = "YEARLY";
        rule.interval = 1;
        info.appendRecurrenceItem(rule);
        e.recurrenceInfo = info;
        if (b.year) {
          e.setProperty("DESCRIPTION", tr("Born {year}", { year: b.year }));
        }
        await calendar.addItem(e);
      }
    } finally {
      calendar.readOnly = true;
    }
    log("birthdays", { count: found.size });
  }

  // Wie Apple Mail: Eine zugeklappte Konversation zeigt Vorschau und Bild der
  // neuesten Nachricht, nicht der ersten. Aufgeklappt hat jede Zeile ihre eigene.
  // Dieselbe Mail (gleiche Message-ID) mehrfach – etwa Gmail-Labels in „Alle
  // Posteingänge“, Kopien in mehreren Ordnern oder in Suchergebnissen: wie
  // Apple Mail nur die erste Karte zeigen, weitere Kopien in derselben
  // Konversation bzw. direkt dahinter blendet das CSS aus (data-mc-dup)
  // Eine laufende Suche (Suchfeld, Sammelordner) arbeitet Thunderbird in
  // Zeitscheiben auf dem Hauptthread ab – über viele Postfächer mit Tausenden
  // Treffern kam dabei jedes zweite Bild der Liste 50–70 ms zu spät, das
  // Scrollen ruckelte, bis die Suche fertig war. Darum die Suche anhalten,
  // solange gescrollt wird, und 300 ms nach der letzten Bewegung weiterlaufen
  // lassen (die Treffer kommen dann wie gewohnt nach)
  hookSearchPause(win) {
    const tree = win.threadTree;
    let paused = null;
    let timer = null;
    const resume = () => {
      win.clearTimeout(timer);
      timer = null;
      const session = paused;
      paused = null;
      try {
        session?.resumeSearch();
      } catch (e) {
        log("search resume error", e);
      }
    };
    const onScroll = () => {
      if (!paused) {
        // (durch die Xray-Hülle des Fensters wären die Getter „searching“
        // und „session“ unsichtbar – darum das Objekt der Seite selbst)
        const wrapper = (win.wrappedJSObject || win).gViewWrapper;
        const session = wrapper?.searching ? wrapper.search?.session : null;
        if (!session) {
          return;
        }
        try {
          session.pauseSearch();
        } catch {
          return;
        }
        paused = session;
      }
      win.clearTimeout(timer);
      timer = win.setTimeout(resume, 300);
    };
    tree.addEventListener("scroll", onScroll, { passive: true, capture: true });
    tree.addEventListener("wheel", onScroll, { passive: true });
    this.addWinRestorer(win, () => {
      tree.removeEventListener("scroll", onScroll, { capture: true });
      tree.removeEventListener("wheel", onScroll);
      if (paused) {
        resume();
      }
    });
  }

  isDuplicateRow(row) {
    const view = row.view;
    const index = row._index;
    let hdr, top;
    try {
      top = !view?.getLevel(index);
      hdr = view.getMsgHdrAt(index);
    } catch {
      return false;
    }
    // Überschrift einer Gruppe („Grouped by Sort“): liefert die erste Mail der
    // Gruppe – sie ist keine Kopie und darf auch nicht als Vergleich dienen
    const DUMMY = 0x20000000;
    const dummy = i => !!(view.getFlagsAt(i) & DUMMY);
    if (!hdr?.messageId || index < 1 || dummy(index)) {
      return false;
    }
    // in der Konversation rückwärts bis zu ihrem Anfang (Ebene 0); eine
    // eigenständige Kopie (Ebene 0) mit dem Anfang der vorigen Konversation
    // vergleichen (gleiches Datum, steht direkt davor) – höchstens 500 Zeilen
    for (let i = index - 1; i >= 0 && index - i <= 500; i--) {
      try {
        if (dummy(i)) {
          return false;
        }
        const root = !view.getLevel(i);
        if ((!top || root) && view.getMsgHdrAt(i)?.messageId == hdr.messageId) {
          return true;
        }
        if (root) {
          return false;
        }
      } catch {
        return false;
      }
    }
    return false;
  }

  hdrForRow(row) {
    let hdr;
    try {
      hdr = row.view.getMsgHdrAt(row._index);
    } catch {
      return null;
    }
    if (!hdr || !row.classList.contains("children") || !row.classList.contains("collapsed")) {
      return hdr;
    }
    try {
      const thread = row.view.getThreadContainingIndex(row._index);
      let latest = hdr;
      for (let i = 0; i < thread.numChildren; i++) {
        const child = thread.getChildHdrAt(i);
        if (child && child.date > latest.date) {
          latest = child;
        }
      }
      return latest;
    } catch {
      return hdr;
    }
  }

  // Mailkopf: dasselbe Absenderbild wie in der Karte (Logo, Foto oder
  // Initialen mit Verlauf) statt Thunderbirds einzelnem Buchstaben
  hookHeaderAvatar(doc) {
    const win = doc?.defaultView;
    if (!win || doc.__mcHdrAvatar || !Services.prefs.getBoolPref("extensions.mailcards.bundledTheme", true)) {
      return;
    }
    doc.__mcHdrAvatar = true;
    const run = () => {
      const box = doc.querySelector("#fromRecipient0 .recipient-avatar");
      const hdr = win.gMessage;
      // Thunderbird befüllt das Bild bei Adressbuch-Änderungen (Stern im
      // Mailkopf, CardDAV) neu – mit seinem Buchstaben (<span>) oder Foto
      // (<img data-l10n-id>); fillAvatar erzeugt beides nie. Dann neu befüllen.
      const foreign = box?.querySelector(":scope > span, :scope > img[data-l10n-id]");
      if (!box || !hdr || (box.dataset.mcFor == hdr.messageId && !foreign)) {
        return;
      }
      const same = box.dataset.mcFor == hdr.messageId;
      if (foreign) {
        box.replaceChildren();
      }
      box.dataset.mcFor = hdr.messageId;
      box.classList.add("mc-hdr-avatar");
      try {
        this.fillAvatar(box, hdr);
        if (!same) {
          this.decorateHeader(doc, hdr);
        }
      } catch (e) {
        log("header avatar error", e);
      }
    };
    let pending = false;
    // Empfänger wie Apple Mail: nur der Name, die Adresse als Tooltip beim
    // Überfahren (ohne Namen bleibt die Adresse stehen – beim Absender wie in
    // der Liste der Name aus der Domain, „rueckgabe@amazon.de“ → „Amazon“)
    const shorten = () => {
      for (const li of doc.querySelectorAll("#messageHeader li.header-recipient")) {
        const email = li.emailAddress || "";
        // bei eigenen Adressen (mehrere Identitäten, kein Kontakt) schreibt
        // Thunderbird „Name <Adresse>“ – davon nur den Namen
        let name = (li.displayName || "").trim().replace(/^"?(.*?)"?\s*<[^<>\s]+@[^<>\s]+>$/, "$1").trim();
        if (email && li.id.startsWith("fromRecipient")) {
          name = senderLabel(name, email.toLowerCase());
        }
        if (email && li.title != email) {
          li.title = email;
        }
        for (const el of [li.querySelector(".recipient-single-line"), li.querySelector(".recipient-multi-line-name")]) {
          if (el && name && el.textContent != name) {
            el.textContent = name;
          }
        }
      }
    };
    const mo = new win.MutationObserver(() => {
      if (!pending) {
        pending = true;
        win.setTimeout(() => {
          pending = false;
          run();
          shorten();
        }, 0);
      }
    });
    mo.observe(doc.getElementById("messageHeader") || doc.documentElement, { childList: true, subtree: true });
    shorten();
    run();
    this.hookNotificationLayout(doc);
    this.hookHoverActions(doc);
    this.hookAttachmentQuickLook(doc);
    this.addWinRestorer(win, () => {
      mo.disconnect();
      delete doc.__mcHdrAvatar;
      // Datum zurück an seinen Platz, eigene Elemente entfernen
      const meta = doc.getElementById("mcHdrMeta");
      const date = doc.getElementById("dateLabel");
      if (meta && date && doc.__mcDateHome) {
        doc.__mcDateHome.parent.insertBefore(date, doc.__mcDateHome.next?.parentNode == doc.__mcDateHome.parent ? doc.__mcDateHome.next : null);
      }
      meta?.__mcResize?.disconnect();
      meta?.remove();
      doc.getElementById("mcListBanner")?.remove();
      for (const box of doc.querySelectorAll(".mc-hdr-avatar")) {
        box.classList.remove("mc-hdr-avatar", "mc-has-img", "mc-small");
        delete box.dataset.mcFor;
      }
    });
  }

  // Kontextmenü eines Anhangs: „Quick Look“ wie in Apple Mail. Die Vorschau
  // selbst ist Thunderbirds eigene (ab 158, nur macOS: echtes Quick-Look-
  // Fenster des Systems, auch per Leertaste in der Anhangsliste); ohne sie
  // (ESR 153, Windows, Linux) bleibt der Eintrag verborgen
  hookAttachmentQuickLook(doc) {
    const win = doc.defaultView;
    const popup = doc.getElementById("attachmentItemContext");
    const open = doc.getElementById("context-openAttachment");
    if (!win || !popup || !open || doc.getElementById("mcContextQuickLook")) {
      return;
    }
    const item = doc.createXULElement("menuitem");
    item.id = "mcContextQuickLook";
    item.setAttribute("label", tr("Quick Look"));
    open.after(item);
    const available = () => {
      try {
        return !!win.gQuickLookManager?.isAvailable;
      } catch {
        return false;
      }
    };
    const chosen = () => {
      const list = doc.getElementById("attachmentList");
      const first = (popup.attachments || [])[0];
      const items = list ? [...list.querySelectorAll("richlistitem")] : [];
      return { list, index: Math.max(0, items.findIndex(i => i.attachment == first)), first };
    };
    const onShowing = event => {
      if (event.target != popup) {
        return;
      }
      const { first } = chosen();
      item.hidden = !available() || !first || first.isDeleted || !first.hasFile;
    };
    // direkt statt über Thunderbirds Ereignis „quicklook“: dafür hängt
    // Thunderbird bei jeder Mail mit Anhängen einen weiteren Empfänger an –
    // nach einigen Mails ging die Vorschau mehrmals auf und wieder zu
    const onCommand = () => {
      const { index } = chosen();
      const atts = win.currentAttachments || [];
      if (atts.length) {
        win.gQuickLookManager?.toggle(atts, index);
      }
    };
    popup.addEventListener("popupshowing", onShowing);
    item.addEventListener("command", onCommand);
    this.addWinRestorer(win, () => {
      popup.removeEventListener("popupshowing", onShowing);
      item.remove();
    });
  }

  // Aktionen beim Überfahren wie Apple Mail: Fährt die Maus über die
  // geöffnete Mail (Kopf oder Text), erscheint mittig auf der Linie unter dem
  // Kopf eine kleine Kapsel mit Löschen | Antworten, Allen antworten,
  // Weiterleiten. Ein-/Ausblenden über :hover im CSS (userChrome.css); die
  // Befehle laufen über Thunderbirds commandController der Leseansicht – wie
  // die Knöpfe im Mailkopf, also auch mit Rückgängig und Folgemail.
  hookHoverActions(doc) {
    const win = doc.defaultView;
    // in den Kopf selbst: die Kapsel liegt ganz darin (#msgHeaderView reicht
    // je nach Version weiter nach unten als die Linie unter dem Kopf)
    const header = doc.getElementById("messageHeader") || doc.getElementById("msgHeaderView");
    if (!win || !header || doc.getElementById("mcHoverActions")) {
      return;
    }
    // in den Karten der Konversationsansicht wirken Thunderbirds Befehle auf
    // die Auswahl der Mailliste (Löschen träfe die gewählte Mail bzw. den
    // ganzen Faden) – dort wirken die Knöpfe direkt auf die Mail der Karte
    let card = null;
    try {
      card = win.frameElement?.classList?.contains("mc-conv-browser") ? win.frameElement.closest(".mc-conv-card") : null;
    } catch {}
    const X = "http://www.w3.org/1999/xhtml";
    const box = doc.createElementNS(X, "div");
    box.id = "mcHoverActions";
    const buttons = [];
    const act = (cls, label, command) => {
      const b = doc.createElementNS(X, "button");
      b.type = "button";
      // nur für die Maus – per Tastatur gibt es Kopfzeilen-Knöpfe und Kürzel
      b.tabIndex = -1;
      b.className = `mc-hover-action ${cls}`;
      b.title = label;
      b.setAttribute("aria-label", label);
      b.dataset.command = command;
      b.addEventListener("click", event => {
        event.stopPropagation();
        try {
          if (card) {
            this.cardAction(win, card, command);
          } else {
            win.commandController?.doCommand(command, event);
          }
        } catch (e) {
          log("hover action error", command, e);
        }
      });
      buttons.push(b);
      return b;
    };
    const sep = doc.createElementNS(X, "span");
    sep.className = "mc-hover-sep";
    box.append(
      act("mc-hover-delete", tr("Delete"), "cmd_deleteMessage"),
      sep,
      act("mc-hover-reply", tr("Reply"), "cmd_reply"),
      act("mc-hover-replyall", tr("Reply All"), "cmd_replyall"),
      act("mc-hover-forward", tr("Forward"), "cmd_forward"),
    );
    header.append(box);
    // ausgegraut, was gerade nicht geht (z. B. ohne Identität kein Antworten)
    const update = () => {
      for (const b of buttons) {
        let ok = true;
        try {
          if (card) {
            // (während die Karte lädt, gibt es gMessage noch nicht)
            const hdr = win.gMessage || card.__mcHdr;
            ok = !!hdr?.folder && (b.dataset.command != "cmd_deleteMessage" || hdr.folder.canDeleteMessages);
          } else {
            ok = !!win.commandController?.isCommandEnabled(b.dataset.command);
          }
        } catch {}
        b.disabled = !ok;
      }
    };
    doc.documentElement.addEventListener("mouseenter", update);
    this.addWinRestorer(win, () => {
      doc.documentElement.removeEventListener("mouseenter", update);
      box.remove();
    });
  }

  // Kapsel in einer Karte der Konversation: Antworten, Allen antworten und
  // Weiterleiten öffnen das Verfassen-Fenster für genau diese Mail; Löschen
  // legt nur sie in den Papierkorb (mit Rückgängig) und nimmt die Karte weg
  cardAction(win, card, command) {
    const hdr = win.gMessage || card.__mcHdr;
    if (!hdr?.folder) {
      return;
    }
    const top = Services.wm.getMostRecentWindow("mail:3pane");
    const msgWindow = top?.msgWindow || null;
    const uri = hdr.folder.getUriForMsg(hdr);
    const T = Ci.nsIMsgCompType;
    if (command == "cmd_deleteMessage") {
      hdr.folder.deleteMessages([hdr], msgWindow, false, false, null, true);
      const box = card.parentNode;
      card.remove();
      const n = box?.querySelectorAll(".mc-conv-card").length || 0;
      const count = box?.querySelector(".mc-conv-count");
      if (count) {
        count.textContent = tr("{n} messages", { n });
      }
      return;
    }
    const type = command == "cmd_reply" ? T.ReplyToSender
      : command == "cmd_replyall" ? T.ReplyAll
      : command == "cmd_replylist" ? T.ReplyToList
      : command == "cmd_forwardInline" ? T.ForwardInline
      : command == "cmd_forwardAttachment" ? T.ForwardAsAttachment
      : Services.prefs.getIntPref("mail.forward_message_mode", 2) == 0 ? T.ForwardAsAttachment : T.ForwardInline;
    // wie Thunderbirds eigene Knöpfe (Identität, Rückfrage bei „no-reply“ …)
    if (typeof top?.ComposeMessage == "function") {
      top.ComposeMessage(type, Ci.nsIMsgCompFormat.Default, hdr.folder, [uri]);
    } else {
      MailServices.compose.OpenComposeWindow(null, hdr, uri, type, Ci.nsIMsgCompFormat.Default, null, null, msgWindow);
    }
  }

  // Hinweise über der Mail (entfernte Inhalte, Spam …): bei wenig Platz bricht
  // der Text in seiner Spalte um, der Knopf bleibt rechts daneben – statt in
  // eine eigene Zeile darunter zu rutschen. Thunderbirds moz-message-bar legt
  // das im Schatten-DOM fest (flex-wrap ohne Variable), daher eine kleine
  // Stilregel dort hinein; Farben bleiben unverändert.
  hookNotificationLayout(doc) {
    const win = doc.defaultView;
    const box = doc.getElementById("mail-notification-top");
    if (!win || !box || box.__mcLayout) {
      return;
    }
    box.__mcLayout = true;
    const CSS_TEXT = `
      .container { align-items: flex-start; }
      .content { flex-wrap: nowrap; column-gap: 12px; }
      .text-container { flex: 1 1 auto; min-width: 0; }
      .actions.active { flex: none; }
      /* sehr schmal: Knopf doch unter den Text */
      @media (max-width: 420px) { .content { flex-wrap: wrap; } }`;
    const apply = () => {
      for (const n of box.querySelectorAll("notification-message")) {
        const root = n.shadowRoot;
        if (root && !root.querySelector("style.mc-layout")) {
          const style = doc.createElementNS("http://www.w3.org/1999/xhtml", "style");
          style.className = "mc-layout";
          style.textContent = CSS_TEXT;
          root.append(style);
        }
      }
    };
    const mo = new win.MutationObserver(() => win.setTimeout(apply, 0));
    mo.observe(box, { childList: true, subtree: true });
    apply();
    this.addWinRestorer(win, () => {
      mo.disconnect();
      delete box.__mcLayout;
      for (const n of box.querySelectorAll("notification-message")) {
        n.shadowRoot?.querySelector("style.mc-layout")?.remove();
      }
    });
  }

  // Mailkopf wie Apple Mail: oben rechts Ordner und Uhrzeit, darüber bei
  // Verteilern ein Hinweis mit „Abmelden“ (statt List-ID-Zeile)
  decorateHeader(doc, hdr) {
    const win = doc.defaultView;
    const X = "http://www.w3.org/1999/xhtml";
    const header = doc.getElementById("messageHeader");
    const date = doc.getElementById("dateLabel");
    if (!header || !date) {
      return;
    }
    let meta = doc.getElementById("mcHdrMeta");
    if (!meta) {
      meta = doc.createElementNS(X, "div");
      meta.id = "mcHdrMeta";
      const folder = doc.createElementNS(X, "span");
      folder.className = "mc-hdr-folder";
      doc.__mcDateHome = { parent: date.parentNode, next: date.nextSibling };
      meta.append(folder, date);
      header.append(meta);
    }
    const folderEl = meta.querySelector(".mc-hdr-folder");
    let title = "";
    try {
      title = hdr.folder ? appleFolderTitle(hdr.folder) : "";
    } catch {}
    // Text in eigenem Element – nur so kürzt ein langer Name mit „…“
    let folderText = folderEl.querySelector(".mc-hdr-folder-text");
    if (!folderText) {
      folderText = doc.createElementNS(X, "span");
      folderText.className = "mc-hdr-folder-text";
      folderEl.replaceChildren(folderText);
    }
    folderText.textContent = title;
    folderEl.hidden = !title;
    // Farbpunkt des Kontos vor dem Ordnersymbol (wie in der Ordnerliste);
    // Lokale Ordner ohne Punkt
    let accColor = "";
    try {
      const server = hdr.folder?.server;
      if (server && server.type != "none") {
        accColor = accountColor(server.prettyName);
      }
    } catch {}
    let accDot = folderEl.querySelector(".mc-hdr-acc");
    if (accColor) {
      if (!accDot) {
        accDot = doc.createElementNS(X, "span");
        accDot.className = "mc-hdr-acc";
        folderEl.prepend(accDot);
      }
      accDot.style.setProperty("--mc-acc", accColor);
    } else {
      accDot?.remove();
    }
    // markierte Mail: Stern unter der Uhrzeit wie Apples Fahne (nur Anzeige);
    // folgt Änderungen aus Liste, Symbolleiste oder Taste S
    let star = meta.querySelector(".mc-hdr-star");
    if (!star) {
      star = doc.createElementNS(X, "span");
      star.className = "mc-hdr-star";
      star.setAttribute("role", "img");
      date.before(star);
    }
    star.title = tr("Starred");
    star.setAttribute("aria-label", tr("Starred"));
    star.hidden = !hdr.isFlagged;
    doc.__mcStarHdr = hdr;
    if (!doc.__mcStarListener) {
      const listener = {
        onFolderPropertyFlagChanged: (item, property) => {
          const cur = doc.__mcStarHdr;
          if (property == "Flagged" && cur && item.messageKey == cur.messageKey && item.folder == cur.folder) {
            const el = doc.querySelector("#mcHdrMeta .mc-hdr-star");
            if (el) {
              el.hidden = !item.isFlagged;
            }
          }
        },
      };
      doc.__mcStarListener = listener;
      MailServices.mailSession.AddFolderListener(listener, Ci.nsIFolderListener.propertyFlagChanged);
      const remove = () => {
        MailServices.mailSession.RemoveFolderListener(listener);
        delete doc.__mcStarListener;
        delete doc.__mcStarHdr;
      };
      win.addEventListener("unload", remove, { once: true });
      this.addWinRestorer(win, remove);
    }
    // genau so viel Platz rechts reservieren, wie Ordner und Uhrzeit brauchen
    const measure = () => header.style.setProperty("--mc-meta-w", `${Math.ceil(meta.getBoundingClientRect().width)}px`);
    measure();
    if (!meta.__mcResize) {
      meta.__mcResize = new win.ResizeObserver(measure);
      meta.__mcResize.observe(meta);
    }

    // Hinweis bei Verteilern (List-ID/List-Unsubscribe), nicht im Spam-Ordner
    doc.getElementById("mcListBanner")?.remove();
    const data = win.currentHeaderData || {};
    const isList = !!(data["list-id"] || data["list-unsubscribe"]);
    let junk = false;
    try {
      junk = !!hdr.folder?.getFlag(Ci.nsMsgFolderFlags.Junk);
    } catch {}
    if (!isList || junk) {
      return;
    }
    const links = (data["list-unsubscribe"]?.headerValue || "").match(/<[^>]+>/g)?.map(l => l.slice(1, -1).trim()) || [];
    const web = links.find(l => /^https:\/\//i.test(l));
    const mail = links.find(l => /^mailto:/i.test(l));
    // schon abgemeldet (Ein-Klick bestätigt): je Verteiler gemerkt, gilt auch für
    // weitere Mails desselben Verteilers
    const listKey = unsubscribeKey(data, hdr);
    const done = listKey && unsubscribedLists().includes(listKey);
    const banner = doc.createElementNS(X, "div");
    banner.id = "mcListBanner";
    const icon = doc.createElementNS(X, "span");
    icon.className = "mc-lb-icon";
    const text = doc.createElementNS(X, "span");
    text.className = "mc-lb-text";
    text.textContent = done ? tr("You unsubscribed from this mailing list.") : tr("This message is from a mailing list.");
    banner.append(icon, text);
    if ((web || mail) && !done) {
      const unsub = doc.createElementNS(X, "button");
      unsub.className = "mc-lb-unsub";
      unsub.type = "button";
      unsub.textContent = tr("Unsubscribe");
      unsub.title = web || mail.replace(/^mailto:/i, "");
      const openWeb = () => {
        // im Standardbrowser öffnen – der Absender bestätigt dort. Wie ein
        // Klick auf einen Link in der Mail (loadURI braucht seit Thunderbird
        // 140 einen Principal und schlug ohne ihn fehl)
        if (typeof win.openLinkExternally == "function") {
          win.openLinkExternally(web);
        } else {
          Cc["@mozilla.org/uriloader/external-protocol-service;1"]
            .getService(Ci.nsIExternalProtocolService)
            .loadURI(Services.io.newURI(web), Services.scriptSecurityManager.getSystemPrincipal());
        }
      };
      // Abmelde-Mail nur vorbereiten – gesendet wird erst durch den Nutzer.
      // Absender ist die Identität, an die die Mail ging (wie Thunderbird bei
      // mailto-Links in Mails), nicht die Standard-Identität: Verteiler melden
      // nach Absender ab, und die private Adresse ginge sonst an den Betreiber
      const composeMail = () => {
        let identity = null;
        try {
          const { MailUtils } = ChromeUtils.importESModule("resource:///modules/MailUtils.sys.mjs");
          [identity] = MailUtils.getIdentityForHeader(hdr);
        } catch (e) {
          debugLog("unsubscribe identity", String(e).slice(0, 120));
        }
        MailServices.compose.OpenComposeWindowWithURI(null, Services.io.newURI(mail), identity);
      };
      const unsubscribeOneClick = async () => {
        let name = "";
        try {
          const parsed = MailServices.headerParser.parseDecodedHeader(hdr.mime2DecodedAuthor || hdr.author)[0];
          name = senderLabel(parsed?.name, (parsed?.email || "").toLowerCase());
        } catch {}
        // wie Apple Mail erst nachfragen – die Abmeldung geschieht sofort
        // asynchron: ein modaler Dialog hielte sonst die ganze Oberfläche an
        const flags = Services.prompt.BUTTON_POS_0 * Services.prompt.BUTTON_TITLE_IS_STRING +
          Services.prompt.BUTTON_POS_1 * Services.prompt.BUTTON_TITLE_CANCEL;
        const result = await Services.prompt.asyncConfirmEx(win.browsingContext.top, Services.prompt.MODAL_TYPE_WINDOW,
          tr("Unsubscribe from messages from {name}?", { name: name || hdr.author }),
          tr("The sender will be told directly that you no longer want these messages."),
          flags, tr("Unsubscribe"), null, null, null, false);
        if (result.getProperty("buttonNumClicked") != 0) {
          return;
        }
        unsub.disabled = true;
        try {
          const res = await fetchWithTimeout(win, web, {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: "List-Unsubscribe=One-Click",
            // die Antwortseite selbst wird nicht gebraucht; eine Umleitung auf
            // eine Bestätigungsseite heißt schon „erledigt“
            max: 0,
            truncate: true,
            followRedirects: false,
          });
          if (!res.ok) {
            throw new Error(`status ${res.status}`);
          }
          // erledigt: merken, Knopf weg, Hinweis sagt es (Apple Mail: Hinweis verschwindet)
          rememberUnsubscribed(listKey);
          text.textContent = tr("You unsubscribed from this mailing list.");
          unsub.remove();
        } catch (e) {
          // klappt der POST nicht: Abmelde-Mail oder doch die Seite im Browser
          debugLog("one-click unsubscribe failed", String(e).slice(0, 120));
          unsub.disabled = false;
          mail ? composeMail() : openWeb();
        }
      };
      unsub.addEventListener("click", async () => {
        try {
          // Ein-Klick-Abmeldung (RFC 8058): der Link erwartet einen POST – im
          // Browser geöffnet zeigt er nur eine leere Seite (z. B. Google).
          // Thunderbird reicht List-Unsubscribe-Post nicht in currentHeaderData durch.
          if (web && /List-Unsubscribe=One-Click/i.test(await readHeader(hdr, "list-unsubscribe-post"))) {
            await unsubscribeOneClick();
          } else if (web) {
            openWeb();
          } else {
            composeMail();
          }
        } catch (e) {
          log("unsubscribe error", e);
        }
      });
      banner.append(unsub);
    }
    const close = doc.createElementNS(X, "button");
    close.className = "mc-lb-close";
    close.type = "button";
    close.title = tr("Close");
    close.setAttribute("aria-label", tr("Close"));
    close.addEventListener("click", () => banner.remove());
    banner.append(close);
    const view = doc.getElementById("msgHeaderView");
    (view || header).before(banner);
  }

  // outgoing: Bild des (ersten) Empfängers wie der Name in der Karte (im
  // Mailkopf bleibt es der Absender)
  fillAvatar(avatar, hdr, outgoing = false) {
    const { name = "", email = "" } = personsFor(hdr, outgoing)[0] || {};

    avatar.dataset.email = email;
    const initials = initialsFor(name, email);
    const show = result => {
      if (avatar.dataset.email != email) {
        return; // Zeile wurde inzwischen für eine andere Nachricht verwendet
      }
      if (result?.src) {
        let img = avatar.querySelector("img");
        if (!img) {
          avatar.textContent = "";
          img = avatar.ownerDocument.createElement("img");
          img.alt = "";
          avatar.appendChild(img);
        }
        if (img.getAttribute("src") != result.src) {
          img.setAttribute("src", result.src);
        }
        avatar.classList.add("mc-has-img");
        avatar.classList.toggle("mc-small", !!result.small);
      } else {
        avatar.classList.remove("mc-has-img", "mc-small");
        avatar.textContent = initials;
      }
    };

    if (!email) {
      show(null);
      return;
    }
    const known = this.avatars.peek(email);
    if (known !== undefined) {
      show(known);
      return;
    }
    show(null);
    // in Werbung/Junk keine Logos laden (das würde Spam-Absendern zeigen,
    // dass die Mail angesehen wurde)
    try {
      if (hdr.folder?.getFlag(Ci.nsMsgFolderFlags.Junk) || hdr.getStringProperty("junkscore") == "100") {
        return;
      }
    } catch {}
    this.avatars.resolve(email, { name, messageId: hdr.messageId }).then(show);
  }

  requestPreview(win, hdr) {
    const folder = hdr.folder;
    if (!folder) {
      return;
    }
    const id = `${folder.URI}#${hdr.messageKey}`;
    if (this.requested.has(id)) {
      return;
    }
    this.requested.add(id);
    if (!this.pendingPreview.has(folder)) {
      this.pendingPreview.set(folder, []);
    }
    this.pendingPreview.get(folder).push(hdr);
    this.stats.quick++;
    if (!this.previewTimer) {
      // Modul-Timer: ein Fenster-Timer verfällt, wenn der Tab/das Fenster vorher geschlossen wird
      this.previewTimer = setTimeout(() => this.flushPreviews(), 150);
    }
  }

  // Nachladen ruht, solange die Liste scrollt: Treffer der Suche kommen aus vielen
  // Ordnern, bei IMAP ohne gespeicherte Vorschau – Abrufen und Einsetzen
  // während des Scrollens ließen es stark ruckeln
  scrollingRecently() {
    return Date.now() - (this.lastListScroll || 0) < 250;
  }

  flushPreviews() {
    this.previewTimer = null;
    if (this.scrollingRecently()) {
      this.stats.deferred = (this.stats.deferred || 0) + 1;
      this.previewTimer = setTimeout(() => this.flushPreviews(), 250);
      return;
    }
    const batches = [...this.pendingPreview];
    this.pendingPreview.clear();
    for (const [folder, all] of batches) {
      // inzwischen gelöschte/verschobene Mails auslassen (Löschen gleich nach
      // dem Öffnen des Ordners) – deren Schlüssel kennt der Ordner nicht mehr
      const hdrs = all.filter(h => msgStillInFolder(h));
      if (!hdrs.length) {
        continue;
      }
      // Schritt 2: was danach noch leer ist (z. B. HTML-Mails, deren erste
      // 2 KB nur aus <head>/<style> bestehen), aus der ganzen Nachricht holen.
      const afterQuick = () => {
        this.refreshPreviews();
        for (const hdr of hdrs) {
          if (!cleanPreview(hdr.getStringProperty("preview"))) {
            this.fullQueue.push(hdr);
          }
        }
        this.pumpFull();
      };
      const listener = {
        QueryInterface: ChromeUtils.generateQI(["nsIUrlListener"]),
        OnStartRunningUrl() {},
        OnStopRunningUrl: () => afterQuick(),
      };
      try {
        // Schritt 1: Thunderbirds eigene, schnelle Vorschau (Anfang der Mail)
        const async = folder.fetchMsgPreviewText(
          hdrs.map(h => h.messageKey),
          listener
        );
        if (!async) {
          afterQuick();
        }
      } catch (e) {
        // bekannt und harmlos: Größe im Ordner stimmt nicht mit der Mail überein –
        // dann fehlt nur der Vorschautext
        if (e?.result == 0x80550023) {
          debugLog("quick preview skipped (unexpected size)");
        } else if (!hdrs.every(h => msgStillInFolder(h))) {
          // während des Abrufs gelöscht/verschoben – erwartbar, kein Fehler
          debugLog("quick preview skipped (message gone)");
        } else {
          log("quick preview error", e);
        }
        afterQuick();
      }
    }
  }

  pumpFull() {
    if (this.scrollingRecently() && this.fullQueue.length) {
      clearTimeout(this.fullTimer);
      this.fullTimer = setTimeout(() => this.pumpFull(), 250);
      return;
    }
    while (this.fullActive < 2 && this.fullQueue.length) {
      const hdr = this.fullQueue.shift();
      if (cleanPreview(hdr.getStringProperty("preview")) || !msgStillInFolder(hdr)) {
        continue;
      }
      this.fullActive++;
      let done = false;
      const finish = () => {
        if (done) {
          return;
        }
        done = true;
        this.fullActive--;
        this.refreshPreviews();
        this.pumpFull();
      };
      setTimeout(finish, 20000);
      try {
        MsgHdrToMimeMessage(
          hdr,
          null,
          (msgHdr, mime) => {
            try {
              const text = mime
                ? cleanPreview(mime.coerceBodyToPlaintext(msgHdr.folder))
                : "";
              if (text) {
                // dauerhaft speichern – Thunderbird nutzt dieselbe Eigenschaft
                msgHdr.setStringProperty("preview", text);
              }
              this.stats.full[text ? "ok" : mime ? "empty" : "nomime"]++;
            } catch (e) {
              log("preview parse error", e);
            }
            finish();
          },
          // nur aus der lokalen Kopie lesen – sonst würde für jede Vorschau
          // die ganze Mail vom Server geladen (IMAP ohne Offline-Kopie, Exchange)
          (() => {
            try {
              const folder = hdr.folder;
              return folder.server.type == "none" || folder.server.type == "pop3" || folder.server.type == "rss" ||
                folder.getFlag(Ci.nsMsgFolderFlags.Offline);
            } catch {
              return false;
            }
          })(),
          { saneBodySize: true, examineEncryptedParts: false }
        );
      } catch (e) {
        if (!msgStillInFolder(hdr)) {
          // während des Abrufs gelöscht/verschoben – erwartbar, kein Fehler
          debugLog("full fetch skipped (message gone)");
        } else {
          this.stats.full.error++;
          if (this.stats.full.error < 5) {
            log("full fetch error", e);
          }
        }
        finish();
      }
    }
    if (!this.fullActive && !this.fullQueue.length && !this.statsLogged) {
      this.statsLogged = true;
      setTimeout(() => {
        log("preview stats", this.stats);
        this.statsLogged = false;
      }, 3000);
    }
  }

  // gebündelt: viele Rückmeldungen kurz hintereinander durchlaufen die Zeilen nur einmal
  refreshPreviews() {
    if (this.refreshTimer) {
      return;
    }
    this.refreshTimer = setTimeout(() => {
      this.refreshTimer = null;
      this.refreshPreviewsNow();
    }, 60);
  }

  refreshPreviewsNow() {
    for (const win of this.windows) {
      if (win.closed) {
        continue;
      }
      for (const row of win.document.querySelectorAll(
        '#threadTree tr[is="thread-card"]'
      )) {
        const preview = row.querySelector(".mc-preview");
        if (!preview || preview.textContent) {
          continue;
        }
        try {
          const hdr = this.hdrForRow(row);
          preview.textContent = cleanPreview(hdr?.getStringProperty("preview"));
          this.markSearchHits(win, row);
        } catch {}
      }
    }
  }
}

// ---------------------------------------------------------------------------
// WebExtension-Experiment
// ---------------------------------------------------------------------------

// Einstellungen der Optionsseite: Schlüssel → Pref (Typ), nur diese sind erlaubt
// (Vorschauzeilen: Menü Ansicht, Geburtstage: Häkchen in der Kalenderliste)
const SHOW_LOCAL_PREF = "extensions.mailcards.showLocalFolders";
const SETTINGS = {
  showLocalFolders: [SHOW_LOCAL_PREF, "bool", true],
  unreadTint: [UNREAD_TINT_PREF, "bool", false],
  solidMenus: [SOLID_MENUS_PREF, "bool", false],
  earlyTheme: [EARLY_THEME_PREF, "bool", false],
  inlinePrompts: [INLINE_PROMPTS_PREF, "bool", true],
  composeFormatBar: [COMPOSE_FORMAT_PREF, "bool", false],
  fullConversation: [CONVERSATION_PREF, "bool", true],
  conversationNewestFirst: [CONVERSATION_NEWEST_PREF, "bool", true],
  calendarEmoji: [EMOJI_PREF, "bool", true],
  emojiCustom: [EMOJI_CUSTOM_PREF, "string", ""],
  macContactPhotos: [MAC_PHOTOS_PREF, "bool", false],
  senderLogos: [SENDER_LOGOS_PREF, "bool", true],
  plainTextSystemFont: [PLAIN_TEXT_PREF, "bool", true],
  autoUpdate: [AUTO_UPDATE_PREF, "bool", true],
  hideCollectedAddresses: [HIDE_COLLECTED_PREF, "bool", true],
  calendarOffline: ["extensions.mailcards.calendarOffline", "bool", false],
  appleIcons: ["extensions.mailcards.appleIcons", "bool", true],
  bundledTheme: ["extensions.mailcards.bundledTheme", "bool", true],
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
  fifthSpaceIcon: [FIFTH_ICON_PREF, "string", "mask"],
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
          // eigene Reihenfolge der Bereiche: nur zurücksetzen (geändert wird per Ziehen)
          if (key == "spacesOrderCustom") {
            if (!value) {
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
          if (key == "fifthSpaceIcon" && !FIFTH_ICONS.includes(value)) throw new Error("not a choice");
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
